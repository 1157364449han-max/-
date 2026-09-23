#!/usr/bin/env python3
"""董解析服务：浏览器界面 + 可配置 Ollama + 符号化降级求解。

默认只连接本机 Ollama。云端部署时，模型地址和令牌只能由服务端环境变量提供，绝不写入前端。
"""
from __future__ import annotations

import argparse
from collections import defaultdict, deque
import hashlib
import hmac
import json
import math
import os
import re
import secrets
import socket
import sys
import threading
import time
import urllib.error
import urllib.request
from urllib.parse import urlparse
import webbrowser
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import sympy as sp

ROOT = Path(__file__).resolve().parent
DIST = ROOT / "dist"
CONFIG = ROOT / "version.json"
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
from learning_engine import LearningEngine, EngineError, EngineBusy, OLLAMA_BASE_URL, ollama_headers
from verification_engine import attach_trust_report, has_uncertainty


def load_config() -> dict:
    default = {"name": "董解析", "version": "0.21.0", "default_model": "qwen3.5:4b", "update_channel": ""}
    try:
        return default | json.loads(CONFIG.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return default


def ollama_request(path: str, payload: dict | None = None, timeout: int = 240) -> dict:
    data = None if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        OLLAMA_BASE_URL + path, data=data, headers=ollama_headers(), method="POST" if data else "GET",
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def ollama_health() -> dict:
    try:
        tags = ollama_request("/api/tags", timeout=2)
        return {"available": True, "models": [m.get("name", "") for m in tags.get("models", [])]}
    except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError):
        return {"available": False, "models": []}


def normalise(text: str) -> str:
    for _ in range(3):
        text = re.sub(r"\\\\(?:d?frac)\{([^{}]+)\}\{([^{}]+)\}", r"\1/\2", text)
    return (text.lower().replace("²", "^2").replace("³", "^3").replace("₁", "1").replace("₂", "2")
            .replace("₃", "3").replace("（", "(").replace("）", ")").replace("−", "-")
            .replace("，", ",").replace("：", ":").replace(" ", "").replace("*", ""))


def scalar(token: str) -> float:
    """解析题干中的整数、小数与分数；无效值直接抛错，避免静默猜测。"""
    token = token.strip()
    if "/" in token:
        left, right = token.split("/", 1)
        return float(left) / float(right)
    return float(token)


def exact(token: str) -> sp.Rational:
    """只接受数字或简单分数，避免把题干作为可执行表达式。"""
    token = token.strip()
    if not re.fullmatch(r"[+-]?(?:\d+|\d+\.\d+|\d+/\d+)", token):
        raise ValueError("数值格式无效")
    return sp.Rational(token)


def nice(value: float | sp.Expr) -> str:
    """给解题步骤显示优先使用整数/分数，而不是长小数。"""
    value = sp.simplify(value)
    if value.is_Rational:
        return str(value.p) if value.q == 1 else f"{value.p}/{value.q}"
    return f"{float(value):.6g}"


NUM = r"([+-]?(?:\d+/\d+|\d+(?:\.\d+)?))"


def named_point(s: str, name: str = "p") -> tuple[float, float] | None:
    m = re.search(rf"{name}[(]{NUM},{NUM}[)]", s, re.I)
    if not m:
        return None
    try:
        return scalar(m.group(1)), scalar(m.group(2))
    except ValueError:
        return None


def named_point_exact(s: str, name: str = "p") -> tuple[sp.Rational, sp.Rational] | None:
    m = re.search(rf"{name}[(]{NUM},{NUM}[)]", s, re.I)
    if not m:
        return None
    try:
        return exact(m.group(1)), exact(m.group(2))
    except ValueError:
        return None


def center_from_text(s: str) -> tuple[sp.Rational, sp.Rational]:
    """只读取明确标记为中心的坐标，绝不把普通点误当中心。"""
    m = re.search(rf"(?:圆心|中心点|中心)(?:为|是)?[a-z]?[(]{NUM},{NUM}[)]", s, re.I)
    if not m:
        return sp.Rational(0), sp.Rational(0)
    try:
        return exact(m.group(1)), exact(m.group(2))
    except ValueError:
        return sp.Rational(0), sp.Rational(0)


def point_distance_sq(a: tuple[sp.Rational, sp.Rational], b: tuple[sp.Rational, sp.Rational]) -> sp.Expr:
    return sp.expand((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2)


def equation_for_ellipse(a2: sp.Expr, b2: sp.Expr, orientation: str, h: sp.Expr, k: sp.Expr) -> str:
    xden, yden = (a2, b2) if orientation == "horizontal" else (b2, a2)
    x = "x" if h == 0 else f"(x{'-' if h > 0 else '+'}{nice(abs(h))})"
    y = "y" if k == 0 else f"(y{'-' if k > 0 else '+'}{nice(abs(k))})"
    return f"{x}²/{nice(xden)}+{y}²/{nice(yden)}=1"


def ellipse_from_conditions(s: str) -> dict | None:
    """从高考题常见条件精确还原椭圆参数。

    已覆盖：离心率+过点、离心率+顶点/轴长、两焦点+过点、a/b 直接给定。
    缺少独立条件时返回 None，交给本地模型或明确要求补充，而不杜撰方程。
    """
    if "椭圆" not in s:
        return None
    orientation = "vertical" if ("长轴在y轴" in s or "焦点在y轴" in s or "焦点在y轴上" in s) else "horizontal"
    center = center_from_text(s)
    point = named_point_exact(s, "p") or named_point_exact(s, "m") or named_point_exact(s, "a")
    e_match = re.search(rf"(?:离心率(?:为|是)?|e=){NUM}", s)
    e = None
    if e_match:
        try:
            e = exact(e_match.group(1))
        except ValueError:
            pass
    if e is not None and not (0 < e < 1):
        return None
    a_match = re.search(rf"(?:^|[,;，；])a={NUM}", s)
    b_match = re.search(rf"(?:^|[,;，；])b={NUM}", s)
    axis_match = re.search(rf"(?:长轴长(?:为|是)?|2a=){NUM}", s)
    short_axis_match = re.search(rf"(?:短轴长(?:为|是)?|2b=){NUM}", s)
    a2 = exact(a_match.group(1)) ** 2 if a_match else (exact(axis_match.group(1)) / 2) ** 2 if axis_match else None
    b2 = exact(b_match.group(1)) ** 2 if b_match else (exact(short_axis_match.group(1)) / 2) ** 2 if short_axis_match else None
    derivation: list[str] = []
    if a2 is not None and e is not None and b2 is None:
        b2 = sp.simplify(a2 * (1 - e * e))
        derivation = [f"由离心率 e=c/a={nice(e)}，得 c²=e²a²。", f"由 b²=a²-c²，得 b²={nice(b2)}。"]
    elif a2 is not None and b2 is not None:
        if a2 <= b2:
            return None
        derivation = ["题目已给出 a、b，直接代入椭圆标准式。"]
    elif e is not None and point is not None:
        # x²/a²+y²/[a²(1-e²)]=1; 纵轴为长轴时交换 x、y。
        x, y = point[0] - center[0], point[1] - center[1]
        major, minor = (x, y) if orientation == "horizontal" else (y, x)
        a2 = sp.simplify(major * major + minor * minor / (1 - e * e))
        if a2 <= 0:
            return None
        b2 = sp.simplify(a2 * (1 - e * e))
        derivation = [
            "设椭圆为 x²/a²+y²/b²=1，且 b²=a²(1-e²)。",
            f"代入离心率 e={nice(e)} 与已知点：a²={nice(major**2)}+{nice(minor**2)}/(1-{nice(e**2)})={nice(a2)}。",
            f"因此 b²=a²(1-e²)={nice(b2)}。",
        ]
    else:
        # 两焦点和椭圆上一点：使用 |PF₁|+|PF₂|=2a，适用于平移后的轴对齐椭圆。
        f1, f2 = named_point_exact(s, "f1"), named_point_exact(s, "f2")
        if f1 and f2 and point:
            midpoint = ((f1[0] + f2[0]) / 2, (f1[1] + f2[1]) / 2)
            dx, dy = f2[0] - f1[0], f2[1] - f1[1]
            if dx == 0 and dy != 0:
                orientation = "vertical"
            elif dy == 0 and dx != 0:
                orientation = "horizontal"
            else:
                return None
            a = sp.simplify((sp.sqrt(point_distance_sq(point, f1)) + sp.sqrt(point_distance_sq(point, f2))) / 2)
            c2 = sp.simplify(point_distance_sq(f1, f2) / 4)
            a2, b2, center = sp.simplify(a * a), sp.simplify(a * a - c2), midpoint
            derivation = ["由椭圆定义 |PF₁|+|PF₂|=2a，先求 a。", f"再由 c²=|F₁F₂|²/4={nice(c2)} 与 b²=a²-c² 求 b²={nice(b2)}。"]
    if a2 is None or b2 is None or a2 <= 0 or b2 <= 0:
        return None
    if sp.simplify(a2 - b2) <= 0:
        return None
    a, b = math.sqrt(float(a2)), math.sqrt(float(b2))
    equation = equation_for_ellipse(a2, b2, orientation, center[0], center[1])
    return {"type": "ellipse", "a": a, "b": b, "orientation": orientation, "h": float(center[0]), "k": float(center[1]),
            "lineThrough": "focus2" if "焦点" in s else "center", "theta": 42,
            "derivation": derivation, "equation": equation, "exact": {"a2": nice(a2), "b2": nice(b2)}, "inferred_from_conditions": True}


def any_named_point(s: str, names: tuple[str, ...] = ("p", "m", "a", "b", "q")) -> tuple[sp.Rational, sp.Rational] | None:
    return next((point for name in names if (point := named_point_exact(s, name))), None)


def circle_from_conditions(s: str) -> dict | None:
    """圆心+半径、圆心+过点、直径两端点三种确定圆的条件。"""
    if "圆" not in s:
        return None
    center = center_from_text(s)
    r_match = re.search(rf"(?:半径|r=)(?:为|是)?{NUM}", s)
    r2: sp.Expr | None = exact(r_match.group(1)) ** 2 if r_match else None
    point = any_named_point(s)
    derivation: list[str] = []
    if r2 is not None:
        derivation.append(f"题设半径 r={nice(sp.sqrt(r2))}，故 r²={nice(r2)}。")
    elif point is not None and ("圆心" in s or "中心" in s):
        r2 = point_distance_sq(point, center)
        derivation.append(f"半径平方 r²=|OP|²={nice(r2)}。")
    else:
        a, b = named_point_exact(s, "a"), named_point_exact(s, "b")
        if a and b and ("直径" in s or "端点" in s):
            center = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
            r2 = sp.simplify(point_distance_sq(a, b) / 4)
            derivation.append(f"直径中点即圆心，r²=|AB|²/4={nice(r2)}。")
    if r2 is None or r2 <= 0:
        return None
    x = "x" if center[0] == 0 else f"(x{'-' if center[0] > 0 else '+'}{nice(abs(center[0]))})"
    y = "y" if center[1] == 0 else f"(y{'-' if center[1] > 0 else '+'}{nice(abs(center[1]))})"
    return {"type": "circle", "r": math.sqrt(float(r2)), "h": float(center[0]), "k": float(center[1]),
            "lineThrough": "center", "theta": 42, "derivation": derivation,
            "equation": f"{x}²+{y}²={nice(r2)}", "exact": {"r2": nice(r2)}, "inferred_from_conditions": True}


def vertex_from_text(s: str) -> tuple[sp.Rational, sp.Rational] | None:
    m = re.search(rf"(?:顶点|vertex)(?:为|是)?[a-z]?[(]{NUM},{NUM}[)]", s, re.I)
    if not m:
        return None
    try:
        return exact(m.group(1)), exact(m.group(2))
    except ValueError:
        return None


def parabola_from_conditions(s: str) -> dict | None:
    """由顶点+焦点或顶点+准线还原轴对齐抛物线。"""
    if "抛物线" not in s:
        return None
    vertex, focus = vertex_from_text(s), named_point_exact(s, "f")
    orientation = None; direction = None; p: sp.Expr | None = None
    derivation: list[str] = []
    if vertex and focus:
        dx, dy = focus[0] - vertex[0], focus[1] - vertex[1]
        if dx != 0 and dy == 0:
            orientation, direction, p = "horizontal", (1 if dx > 0 else -1), abs(dx)
        elif dy != 0 and dx == 0:
            orientation, direction, p = "vertical", (1 if dy > 0 else -1), abs(dy)
        else:
            return None
        derivation.append(f"顶点到焦点的距离为 p={nice(p)}，抛物线轴方向由顶点指向焦点。")
    elif vertex:
        m = re.search(rf"准线([xy])=({NUM})", s, re.I)
        if m:
            axis, val = m.group(1), exact(m.group(2))
            if axis == "x":
                orientation, direction, p = "horizontal", (1 if vertex[0] > val else -1), abs(vertex[0] - val)
            else:
                orientation, direction, p = "vertical", (1 if vertex[1] > val else -1), abs(vertex[1] - val)
            if p == 0:
                return None
            derivation.append(f"顶点到准线的距离为 p={nice(p)}，开口背离准线。")
    if not (vertex and orientation and direction and p and p > 0):
        return None
    h, k = vertex
    x = "x" if h == 0 else f"(x{'-' if h > 0 else '+'}{nice(abs(h))})"
    y = "y" if k == 0 else f"(y{'-' if k > 0 else '+'}{nice(abs(k))})"
    q = sp.simplify(4 * p * direction)
    equation = f"{x}²={nice(q)}{y}" if orientation == "vertical" else f"{y}²={nice(q)}{x}"
    return {"type": "parabola", "p": float(p), "direction": direction, "orientation": orientation,
            "h": float(h), "k": float(k), "lineThrough": "focus2", "theta": 42,
            "derivation": derivation, "equation": equation, "exact": {"p": nice(p)}, "inferred_from_conditions": True}


def point_label(raw: str) -> str:
    raw = raw.upper()
    return raw.replace("1", "₁").replace("2", "₂")


def part_index_at(text: str, position: int) -> int | None:
    """返回对象所在的小问编号；题目前置条件返回 None，表示全部小问共用。"""
    previous = list(re.finditer(r"[（(](\d{1,2})[）)]", text[:position]))
    return int(previous[-1].group(1)) if previous else None


def scene_polynomial(scene: dict) -> tuple[sp.Symbol, sp.Symbol, sp.Expr]:
    """Return one exact implicit equation F(x,y)=0 for drawing/derivation checks."""
    x, y = sp.symbols("x y", real=True)
    h, k = sp.nsimplify(scene.get("h", 0)), sp.nsimplify(scene.get("k", 0))
    typ = scene["type"]
    if typ == "ellipse":
        a2, b2 = scene_exact(scene, "a2"), scene_exact(scene, "b2")
        dx, dy = (b2, a2) if scene.get("orientation") == "vertical" else (a2, b2)
        expression = (x-h)**2/dx + (y-k)**2/dy - 1
    elif typ == "hyperbola":
        a2, b2 = scene_exact(scene, "a2"), scene_exact(scene, "b2")
        expression = ((y-k)**2/a2 - (x-h)**2/b2 - 1) if scene.get("orientation") == "vertical" else ((x-h)**2/a2 - (y-k)**2/b2 - 1)
    elif typ == "circle":
        expression = (x-h)**2 + (y-k)**2 - scene_exact(scene, "r2")
    else:
        p = scene_exact(scene, "p")
        direction = -1 if scene.get("direction") == -1 else 1
        expression = (x-h)**2 - 4*p*direction*(y-k) if scene.get("orientation") == "vertical" else (y-k)**2 - 4*p*direction*(x-h)
    return x, y, sp.factor(expression)


def normalized_linear_coefficients(a: sp.Expr, b: sp.Expr, c: sp.Expr) -> tuple[sp.Expr, sp.Expr, sp.Expr]:
    values = [sp.factor(sp.nsimplify(value)) for value in (a, b, c)]
    common_denominator = sp.ilcm(*[int(sp.denom(value)) for value in values])
    integers = [sp.Integer(common_denominator) * value for value in values]
    nonzero = [abs(int(value)) for value in integers if value != 0]
    divisor = math.gcd(*nonzero) if nonzero else 1
    integers = [sp.Integer(value/divisor) for value in integers]
    first = next((value for value in integers if value != 0), sp.Integer(1))
    if first < 0:
        integers = [-value for value in integers]
    return tuple(integers)


def linear_equation_text(a: sp.Expr, b: sp.Expr, c: sp.Expr) -> str:
    terms: list[tuple[sp.Expr, str]] = [(a, "x"), (b, "y"), (c, "")]
    text = ""
    for coefficient, variable in terms:
        if coefficient == 0:
            continue
        sign = "-" if coefficient < 0 else "+"
        magnitude = abs(coefficient)
        body = variable if variable and magnitude == 1 else f"{exact_text(magnitude)}{variable}"
        if not text:
            text = ("-" if sign == "-" else "") + body
        else:
            text += sign + body
    return (text or "0") + "=0"


DERIVED_CONSTRUCTION_SCHEMA = "dongjiexi-construction/v1"


def derived_line_object(*, role: str, name: str, point: str, part: int | None,
                        a: sp.Expr, b: sp.Expr, c: sp.Expr,
                        point_ref: str | None = None) -> dict:
    """Build one canonical answer-derived line shared by solving, drawing and verification."""
    labels = {"tangent": f"{point} 点切线", "normal": f"{point} 点法线"}
    construction_types = {"tangent": "tangent_at", "normal": "normal_at"}
    equation = linear_equation_text(a, b, c)
    point_ref = point_ref or f"feature:{point}"
    line = {
        "id": f"derived-{role}-{point}-{part if part is not None else 'all'}",
        "label": labels[role],
        "source": "derived",
        "role": role,
        "point": point,
        "pointRef": point_ref,
        "refs": [point_ref, "$conic"],
        "equation": equation,
        "visible": True,
        "exact": {"A": str(a), "B": str(b), "C": str(c)},
        "construction": {
            "schema": DERIVED_CONSTRUCTION_SCHEMA,
            "type": construction_types[role],
            "inputs": {"curve": "$conic", "point": point, "point_ref": point_ref},
            "method": "implicit_gradient",
        },
    }
    if b != 0:
        line.update(kind="slope", m=float(-a/b), b=float(-c/b))
    else:
        line.update(kind="vertical", x=float(-c/a))
    if part is not None:
        line["part"] = part
    return line


def gradient_line_at(scene: dict, name: str, coords: list[float], role: str,
                     part: int | None = None, point_ref: str | None = None) -> dict | None:
    """Compute a tangent or normal from the exact implicit conic used by the board."""
    x, y, expression = scene_polynomial(scene)
    px, py = sp.nsimplify(coords[0]), sp.nsimplify(coords[1])
    if sp.simplify(expression.subs({x: px, y: py})) != 0:
        return None
    a = sp.simplify(sp.diff(expression, x).subs({x: px, y: py}))
    b = sp.simplify(sp.diff(expression, y).subs({x: px, y: py}))
    if a == 0 and b == 0:
        return None
    if role == "normal":
        a, b = b, -a
    elif role != "tangent":
        raise ValueError(f"unsupported gradient line role: {role}")
    a, b, c = normalized_linear_coefficients(a, b, -(a*px+b*py))
    return derived_line_object(role=role, name=name, point=name, part=part,
                               a=a, b=b, c=c, point_ref=point_ref)


def tangent_line_at(scene: dict, name: str, coords: list[float], part: int | None = None,
                    point_ref: str | None = None) -> dict | None:
    return gradient_line_at(scene, name, coords, "tangent", part, point_ref)


def normal_line_at(scene: dict, name: str, coords: list[float], part: int | None = None,
                   point_ref: str | None = None) -> dict | None:
    return gradient_line_at(scene, name, coords, "normal", part, point_ref)


def line_coefficients(line: dict, points: dict | None = None) -> tuple[sp.Expr, sp.Expr, sp.Expr] | None:
    exact_coefficients = line.get("exact") if isinstance(line.get("exact"), dict) else {}
    if all(exact_coefficients.get(key) is not None for key in ("A", "B", "C")):
        return tuple(sp.nsimplify(exact_coefficients[key]) for key in ("A", "B", "C"))
    if line.get("m") is not None:
        return sp.nsimplify(line["m"]), sp.Integer(-1), sp.nsimplify(line.get("b", 0))
    if line.get("x") is not None:
        return sp.Integer(1), sp.Integer(0), -sp.nsimplify(line["x"])
    if line.get("kind") == "through_points" and points:
        first, second = points.get(line.get("a")), points.get(line.get("b"))
        if first and second:
            x1, y1, x2, y2 = map(sp.nsimplify, (*first, *second))
            if x1 != x2 or y1 != y2:
                return normalized_linear_coefficients(y1-y2, x2-x1, x1*y2-x2*y1)
    return None


def perpendicular_foot_object(point_name: str, coords: list[float], line: dict,
                              part: int | None = None, foot_name: str = "H") -> dict | None:
    coefficients = line_coefficients(line)
    if not coefficients:
        return None
    a, b, c = coefficients
    denominator = sp.simplify(a*a+b*b)
    if denominator == 0:
        return None
    px, py = map(sp.nsimplify, coords)
    distance_factor = sp.simplify((a*px+b*py+c)/denominator)
    hx, hy = sp.simplify(px-a*distance_factor), sp.simplify(py-b*distance_factor)
    item = {
        "id": f"derived-foot-{foot_name}-{part if part is not None else 'all'}",
        "kind": "construction",
        "op": "foot",
        "refs": [f"feature:{point_name}", line["id"]],
        "label": foot_name,
        "source": "derived",
        "role": "perpendicular_foot",
        "visible": True,
        "coordinates": [float(hx), float(hy)],
        "exact": {"x": str(hx), "y": str(hy)},
        "construction": {
            "schema": DERIVED_CONSTRUCTION_SCHEMA,
            "type": "perpendicular_foot",
            "inputs": {"point": point_name, "line": line["id"]},
            "method": "orthogonal_projection",
        },
    }
    if part is not None:
        item["part"] = part
    return item


def decorate_scene(scene: dict, s: str) -> dict:
    """提取可拖动对象及依赖关系。只有直线的过点条件才设置动直线锚点。"""
    points = dict(scene.get("points", {}))
    bindings = {}
    h, k = scene.get("h", 0), scene.get("k", 0)
    typ, vertical = scene["type"], scene.get("orientation") == "vertical"
    builtins = {"O": (h, k, "center"), "V": (h, k, "vertex")}
    if typ in {"ellipse", "hyperbola"}:
        c = math.sqrt(max(0, scene["a"] ** 2 + (-1 if typ == "ellipse" else 1) * scene["b"] ** 2))
        for label, sign, role in [("F₁", -1, "focus1"), ("F₂", 1, "focus2")]:
            builtins[label] = (h if vertical else h + sign*c, k + sign*c if vertical else k, role)
    elif typ == "parabola":
        c = scene["p"] * scene.get("direction", 1)
        builtins["F"] = (h if vertical else h+c, k+c if vertical else k, "focus2")
    for m in re.finditer(rf"([a-z](?:[12])?)[(]{NUM},{NUM}[)]", s, re.I):
        try:
            name = point_label(m.group(1))
            coord = [float(exact(m.group(2))), float(exact(m.group(3)))]
            if not all(math.isfinite(value) for value in coord):
                continue
            points[name] = coord
            if name in builtins:
                bx, by, role = builtins[name]
                if math.hypot(coord[0]-bx, coord[1]-by) < 1e-8:
                    bindings[name] = role
        except (ValueError, TypeError):
            continue
    objects = list(scene.get("objects", []))
    object_labels = {item.get("label"): item.get("id") for item in objects if item.get("label") and item.get("id")}

    def add_object(item: dict, position: int) -> None:
        label = item.get("label")
        if not label or label in object_labels or label in points:
            return
        item.setdefault("source", "question")
        item.setdefault("visible", True)
        part = part_index_at(s, position)
        if part is not None:
            item["part"] = part
        objects.append(item)
        object_labels[label] = item["id"]

    # Common dependent-motion language becomes a real construction graph.
    # A point declared to move on the main conic stores only its parameter;
    # midpoint and line objects reference that point, so every drag recomputes
    # all descendants instead of copying stale coordinates.
    moving_patterns = [
        r"(?:点)?([a-z](?:[12])?)(?:为|是)[^。；]{0,18}上(?:的)?动点",
        r"(?:点)?([a-z](?:[12])?)在[^。；]{0,18}上(?:运动|移动)",
    ]
    for pattern in moving_patterns:
        for match in re.finditer(pattern, s, re.I):
            clause = match.group(0)
            if not re.search(r"椭圆|双曲线|抛物线|圆|曲线", clause):
                continue
            name = point_label(match.group(1))
            add_object({"id": f"question-moving-{name}", "kind": "construction", "op": "point_on",
                        "refs": ["$conic"], "t": math.pi / 4, "branch": 1, "label": name}, match.start())

    def point_ref(name: str) -> str | None:
        if name in object_labels:
            return object_labels[name]
        if name in points or name in builtins or name in {"A", "B"}:
            return "feature:" + name
        return None

    for match in re.finditer(r"(?:点)?([a-z](?:[12])?)(?:为|是)(?:线段)?([a-z](?:[12])?)([a-z](?:[12])?)的?中点", s, re.I):
        middle, left, right = map(point_label, match.groups())
        refs = [point_ref(left), point_ref(right)]
        if all(refs):
            add_object({"id": f"question-midpoint-{middle}", "kind": "construction", "op": "midpoint",
                        "refs": refs, "label": middle}, match.start())

    lines = list(scene.get("lines", []))
    def add_line(line, position):
        line.setdefault("id", f"question-line-{len(lines)+1}")
        line.setdefault("source", "question")
        line.setdefault("visible", True)
        part = part_index_at(s, position)
        if part is not None:
            line["part"] = part
        lines.append(line)

    def line_label_at(position: int, fallback: str) -> str:
        prefix = s[max(0, position-16):position]
        named = re.search(r"(?:直线)?([a-z](?:[12])?)[:：]?$", prefix, re.I)
        return named.group(1) if named and named.group(1).lower() not in {"x", "y"} else fallback
    names = set(points) | set(builtins) | set(object_labels) | {"A", "B"}
    for m in re.finditer(r"(直线|线段|连接)([a-z](?:[12])?)([a-z](?:[12])?)", s, re.I):
        kind, left, right = m.group(1), point_label(m.group(2)), point_label(m.group(3))
        if left in names and right in names:
            add_line({"kind": "through_points", "a": left, "b": right,
                      "infinite": kind == "直线", "label": f"{kind} {left}{right}"}, m.start())
    atom = r"(?:\d+/\d+|\d+(?:\.\d+)?)"
    for m in re.finditer(rf"(?<![a-z])y=([+-]?{atom}?)\*?x([+-]{atom})?", s, re.I):
        try:
            raw = m.group(1)
            slope = 1 if raw in {"", "+"} else -1 if raw == "-" else float(exact(raw))
            intercept = float(exact(m.group(2))) if m.group(2) else 0
            a, b, c = normalized_linear_coefficients(sp.nsimplify(slope), -1, sp.nsimplify(intercept))
            add_line({"kind": "slope", "m": slope, "b": intercept,
                      "label": line_label_at(m.start(), m.group(0)), "equation": linear_equation_text(a, b, c),
                      "exact": {"A": str(a), "B": str(b), "C": str(c)}, "userEquation": True}, m.start())
        except (ValueError, TypeError):
            pass
    for m in re.finditer(rf"(?<![a-z])([xy])=([+-]?{atom})(?![\d./*xy^])", s, re.I):
        try:
            value = float(exact(m.group(2)))
            line = {"kind": "vertical", "x": value} if m.group(1) == "x" else {"kind": "slope", "m": 0, "b": value}
            raw_coefficients = (1, 0, -sp.nsimplify(value)) if m.group(1) == "x" else (0, 1, -sp.nsimplify(value))
            a, b, c = normalized_linear_coefficients(*raw_coefficients)
            add_line({**line, "label": line_label_at(m.start(), m.group(0)),
                      "equation": linear_equation_text(a, b, c),
                      "exact": {"A": str(a), "B": str(b), "C": str(c)}, "userEquation": True}, m.start())
        except (ValueError, TypeError):
            pass

    has_numbered_parts = bool(re.search(r"[（(]\d{1,2}[）)]", s))
    def derived_part(position: int) -> int | None:
        part = part_index_at(s, position)
        if part is not None:
            return part
        if has_numbered_parts:
            following = re.search(r"[（(](\d{1,2})[）)]", s[position:])
            return int(following.group(1)) if following else None
        return 0

    gradient_patterns = {
        "tangent": [
            r"(?:在)?(?:点)?([a-z](?:[12])?)(?:点)?处(?:的)?切线",
            r"过(?:点)?([a-z](?:[12])?)(?:作|的)?切线",
            r"(?:点)?([a-z](?:[12])?)(?:点)?(?:的)?切线方程",
        ],
        "normal": [
            r"(?:在)?(?:点)?([a-z](?:[12])?)(?:点)?处(?:的)?法线",
            r"过(?:点)?([a-z](?:[12])?)(?:作|的)?法线",
            r"(?:点)?([a-z](?:[12])?)(?:点)?(?:的)?法线方程",
        ],
    }
    gradient_targets: set[tuple[str, str, int | None]] = set()
    for role, patterns in gradient_patterns.items():
        for pattern in patterns:
            for match in re.finditer(pattern, s, re.I):
                gradient_targets.add((role, point_label(match.group(1)), derived_part(match.start())))
    for role, keyword in (("tangent", "切线"), ("normal", "法线")):
        if keyword in s and not any(item[0] == role for item in gradient_targets) and len(points) == 1 and re.search(rf"该点(?:处)?(?:的)?{keyword}", s):
            gradient_targets.add((role, next(iter(points)), 0 if not has_numbered_parts else None))
    for role, name, part in gradient_targets:
        if name not in points:
            continue
        line = gradient_line_at(scene, name, points[name], role, part)
        if line:
            lines.append(line)

    # Answer-derived perpendicular feet become dependency-aware construction
    # points.  They reference the original point and line, so later dragging
    # continues to recompute the foot instead of preserving stale coordinates.
    foot_matches: list[tuple[re.Match, str, str]] = []
    foot_pattern = r"点([a-z](?:[12])?)[^。；]{0,60}?垂足(?:为|是)?(?:点)?([a-z](?:[12])?)"
    for match in re.finditer(foot_pattern, s, re.I):
        source_name, foot_name = point_label(match.group(1)), point_label(match.group(2))
        if source_name in points and source_name != foot_name:
            foot_matches.append((match, source_name, foot_name))
    for match, source_name, foot_name in foot_matches:
        clause = match.group(0)
        named_line = (re.search(r"(?:到|向)(?:直线)?([a-z](?:[12])?)(?=的?垂足)", clause, re.I)
                      or re.search(r"直线([a-z](?:[12])?)(?=的|上|[,，])", clause, re.I))
        candidates = [line for line in lines if line.get("role") not in {"tangent", "normal"} and line_coefficients(line)]
        target = None
        if named_line:
            wanted = named_line.group(1).lower()
            target = next((line for line in candidates if str(line.get("label", "")).lower() == wanted), None)
        if target is None and len(candidates) == 1:
            target = candidates[0]
        if target:
            foot = perpendicular_foot_object(source_name, points[source_name], target,
                                             derived_part(match.start()), foot_name)
            if foot:
                add_object(foot, match.start())
    unique, seen = [], set()
    for line in lines:
        key = json.dumps(line, ensure_ascii=False, sort_keys=True)
        if key not in seen:
            seen.add(key)
            unique.append(line)
    scene["points"], scene["pointBindings"], scene["lines"], scene["objects"] = points, bindings, unique, objects
    scene["dynamicLine"] = False
    dynamic_line_is_global = False
    for match in re.finditer(r"[^。；;\n]+", s):
        clause = match.group(0)
        # A line equation is already represented as its own object. The rotating
        # line is for clauses such as '过右焦点的直线l' or '过点P的直线l'.
        dynamic = re.search(r"(?:动直线|过[^。；;]*?的?直线)", clause, re.I)
        if not dynamic:
            named = re.search(r"直线([lmnp])(?![a-z])", clause, re.I)
            has_explicit_equation = bool(named and re.search(rf"(?:直线)?{re.escape(named.group(1))}[:：]?[xy]=", s, re.I))
            dynamic = None if has_explicit_equation else named
        if not dynamic:
            continue
        scene["dynamicLine"] = True
        scene["dynamicLineLabel"] = "l"
        index = part_index_at(s, match.start() + dynamic.start())
        if index is None:
            dynamic_line_is_global = True
            scene.pop("dynamicLinePart", None)
        elif not dynamic_line_is_global:
            scene["dynamicLinePart"] = index
        if "左焦点" in clause:
            scene["lineThrough"] = "focus1"
        elif re.search(r"过(?:右)?焦点", clause):
            scene["lineThrough"] = "focus2"
        elif "过圆心" in clause or "过中心" in clause:
            scene["lineThrough"] = "center"
        else:
            through = re.search(r"过(?:点)?([a-z](?:[12])?)(?:\([^)]*\))?(?:的)?直线", clause, re.I)
            if through and point_label(through.group(1)) in points:
                scene["lineThrough"] = "point:" + point_label(through.group(1))
    scene.setdefault("dynamicLineLabel", "探索直线")
    return scene

def standard_conic(text: str) -> dict | None:
    """精确识别标准圆锥曲线；这是无模型时的可核验降级路径。"""
    s = normalise(text)
    number = r"[+-]?(?:\d+/\d+|\d+(?:\.\d+)?)"
    left_square = rf"(?:\((?P<lvar>[xy])(?P<lsign>[+-])(?P<lshift>{number})\)\^2|(?P<lbare>[xy])\^2)"
    right_square = rf"(?:\((?P<rvar>[xy])(?P<rsign>[+-])(?P<rshift>{number})\)\^2|(?P<rbare>[xy])\^2)"
    def shifted(match: re.Match[str], prefix: str) -> tuple[str, float]:
        var = match.group(prefix + "var") or match.group(prefix + "bare")
        if match.group(prefix + "var"):
            value = scalar(match.group(prefix + "shift"))
            value = value if match.group(prefix + "sign") == "-" else -value
        else:
            value = 0.0
        return var, value
    def denominator(match: re.Match[str], group: str) -> sp.Rational:
        raw = match.group(group)
        return exact(raw) if raw else sp.Rational(1)

    m = re.search(
        rf"(?P<left>{left_square})(?:/(?P<dx>{number}))?(?P<op>[+-])(?P<right>{right_square})(?:/(?P<dy>{number}))?=1",
        s,
    )
    if m:
        left = shifted(m, "l")
        right = shifted(m, "r")
        dx, dy = denominator(m, "dx"), denominator(m, "dy")
        if left[0] == "x" and right[0] == "y":
            x2, y2, h, k = dx, dy, left[1], right[1]
        elif left[0] == "y" and right[0] == "x":
            x2, y2, h, k = dy, dx, right[1], left[1]
        else:
            x2 = y2 = 0
            h = k = 0
        if x2 > 0 and y2 > 0:
            if m.group("op") == "-":
                return {"type": "hyperbola", "a": math.sqrt(float(x2)), "b": math.sqrt(float(y2)), "h": h, "k": k,
                        "orientation": "horizontal" if left[0] == "x" else "vertical",
                        "lineThrough": "focus2" if "焦点" in s else "center", "theta": 42,
                        "exact": {"a2": nice(x2), "b2": nice(y2)}}
            if abs(x2-y2) < 1e-10:
                return {"type": "circle", "r": math.sqrt(float(x2)), "h": h, "k": k,
                        "lineThrough": "center", "theta": 42, "exact": {"r2": nice(x2)}}
            major2, minor2 = max(x2, y2), min(x2, y2)
            return {"type": "ellipse", "a": math.sqrt(float(major2)), "b": math.sqrt(float(minor2)),
                    "orientation": "horizontal" if x2 >= y2 else "vertical", "h": h, "k": k,
                    "lineThrough": "focus2" if "焦点" in s else "center", "theta": 42,
                    "exact": {"a2": nice(major2), "b2": nice(minor2)}}

    m = re.search(rf"\((?P<xvar>x)(?P<xsign>[+-])(?P<xshift>{number})\)\^2\+\((?P<yvar>y)(?P<ysign>[+-])(?P<yshift>{number})\)\^2=(?P<radius>{number})", s)
    if m:
        h = scalar(m.group("xshift")) if m.group("xsign") == "-" else -scalar(m.group("xshift"))
        k = scalar(m.group("yshift")) if m.group("ysign") == "-" else -scalar(m.group("yshift"))
        radius_sq = scalar(m.group("radius"))
        if radius_sq > 0:
            return {"type": "circle", "r": math.sqrt(radius_sq), "h": h, "k": k,
                    "lineThrough": "center", "theta": 42, "exact": {"r2": nice(exact(m.group("radius")))}}

    m = re.search(rf"x\^2/(?P<x>{number})\+?y\^2(?:/(?P<y>{number}))?=1", s)
    if m:
        x2_exact, y2_exact = exact(m.group("x")), exact(m.group("y")) if m.group("y") else sp.Rational(1)
        x2, y2 = float(x2_exact), float(y2_exact)
        if x2 > 0 and y2 > 0:
            if abs(x2-y2) < 1e-10:
                return {"type": "circle", "r": math.sqrt(x2), "h": 0, "k": 0, "lineThrough": "center", "theta": 42,
                        "exact": {"r2": nice(x2_exact)}}
            major2, minor2 = max(x2, y2), min(x2, y2)
            return {"type": "ellipse", "a": math.sqrt(major2), "b": math.sqrt(minor2),
                    "orientation": "horizontal" if x2 >= y2 else "vertical", "h": 0, "k": 0,
                    "lineThrough": "focus2" if "焦点" in s else "center", "theta": 42,
                    "exact": {"a2": nice(max(x2_exact, y2_exact)), "b2": nice(min(x2_exact, y2_exact))}}
    m = re.search(r"x\^2\+y\^2=([0-9.]+)(\^2)?", s)
    if m:
        value = float(m.group(1)); radius = value if m.group(2) else math.sqrt(value)
        return {"type": "circle", "r": radius, "h": 0, "k": 0, "lineThrough": "center", "theta": 42}
    m = re.search(rf"y\^2=({number})\*?x", s)
    if m:
        q_exact=exact(m.group(1));q=float(q_exact)
        return {"type": "parabola", "p": abs(q) / 4, "direction": -1 if q < 0 else 1,
                "orientation": "horizontal", "h": 0, "k": 0, "lineThrough": "focus2", "theta": 42,
                "exact": {"p": nice(abs(q_exact)/4)}, "equation": f"y²={nice(q_exact)}x"}
    m = re.search(rf"x\^2=({number})\*?y", s)
    if m:
        q_exact=exact(m.group(1));q=float(q_exact)
        return {"type": "parabola", "p": abs(q) / 4, "direction": -1 if q < 0 else 1,
                "orientation": "vertical", "h": 0, "k": 0, "lineThrough": "focus2", "theta": 42,
                "exact": {"p": nice(abs(q_exact)/4)}, "equation": f"x²={nice(q_exact)}y"}
    # 非标准式的确定条件依次交给各自的符号求解器；它们均只接受足以唯一确定曲线的条件。
    return ellipse_from_conditions(s) or circle_from_conditions(s) or parabola_from_conditions(s)


def split_problem_parts(text: str) -> list[dict]:
    """把（1）（2）…拆为可单独浏览的小问；没有编号时保留完整题目。"""
    matches = list(re.finditer(r"[（(]\s*(\d{1,2})\s*[）)]", text))
    if not matches:
        return [{"index": 0, "label": "完整题目", "question": text.strip(), "body": text.strip()}]
    preamble = text[:matches[0].start()].strip()
    parts: list[dict] = []
    for i, match in enumerate(matches):
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        body = text[match.end():end].strip(" \n，。；;")
        number = int(match.group(1))
        parts.append({"index": number, "label": f"第（{number}）问", "question": (preamble + "\n" + body).strip(), "body": body})
    return parts


def fallback_parts(text: str, answer: str, steps: list[str]) -> list[dict]:
    parts = split_problem_parts(text)
    output = []
    for part in parts:
        output.append({**part, "status": "partial", "answer": "当前是快速建图结果，尚未完成本问解答。请使用 AI 解答整题。", "steps": [answer, *steps]})
    return output


def static_line_answer(scene: dict, line: dict) -> tuple[str, list[str]] | None:
    """对题干明确给出的直线与当前圆锥曲线联立，给出可核验交点。"""
    x, y = sp.symbols("x y", real=True)
    h, k = sp.nsimplify(scene.get("h", 0)), sp.nsimplify(scene.get("k", 0))
    typ = scene["type"]
    if typ == "ellipse":
        exact_data = scene.get("exact", {})
        a2 = sp.Rational(exact_data["a2"]) if exact_data.get("a2") else sp.nsimplify(scene["a"] ** 2)
        b2 = sp.Rational(exact_data["b2"]) if exact_data.get("b2") else sp.nsimplify(scene["b"] ** 2)
        dx, dy = (a2, b2) if scene.get("orientation") != "vertical" else (b2, a2)
        conic = (x - h) ** 2 / dx + (y - k) ** 2 / dy - 1
    elif typ == "circle":
        conic = (x - h) ** 2 + (y - k) ** 2 - sp.nsimplify(scene["r"] ** 2)
    elif typ == "hyperbola":
        conic = (x - h) ** 2 / sp.nsimplify(scene["a"] ** 2) - (y - k) ** 2 / sp.nsimplify(scene["b"] ** 2) - 1
    else:
        p, direction = sp.nsimplify(scene["p"]), scene.get("direction", 1)
        conic = (x - h) ** 2 - 4 * p * direction * (y - k) if scene.get("orientation") == "vertical" else (y - k) ** 2 - 4 * p * direction * (x - h)
    if line["kind"] == "vertical":
        line_eq, line_text = x - sp.nsimplify(line["x"]), f"x={nice(sp.nsimplify(line['x']))}"
    elif line["kind"] == "slope":
        line_eq, line_text = y - sp.nsimplify(line["m"]) * x - sp.nsimplify(line["b"]), line.get("label", "已知直线")
    else:
        return None
    try:
        sols = sp.solve((conic, line_eq), (x, y), dict=True)
    except Exception:
        return None
    real = [sol for sol in sols if sol[x].is_real is not False and sol[y].is_real is not False]
    if not real:
        return (f"联立曲线与 {line_text}，无实数交点。", ["将直线方程代入圆锥曲线方程。", "所得方程无实根，因此直线与曲线没有实交点。"])
    points = "，".join(f"({nice(sol[x])},{nice(sol[y])})" for sol in real)
    relation = "有一个实交点" if len(real) == 1 else "交于"
    return (f"{line_text} 与曲线{relation} {points}。", [f"联立曲线方程与 {line_text}。", "解一元二次方程，保留实数解。", f"得到交点：{points}。"])


def enrich_parts_with_intersections(parts: list[dict], scene: dict) -> list[dict]:
    for line in scene.get("lines", []):
        if not line.get("part"):
            continue
        solved = static_line_answer(scene, line)
        if not solved:
            continue
        answer, steps = solved
        for part in parts:
            if int(part.get("index", 0)) == int(line["part"]):
                part.setdefault("steps", []).extend(["辅助计算（不代表完成本问）：" + answer, *steps])
    return parts


def exact_text(value: sp.Expr) -> str:
    """适合高中讲义的精确值显示，保留分数和根式。"""
    value = sp.simplify(value)
    if value.is_Rational:
        return nice(value)
    return re.sub(r"sqrt\(([^()]+)\)", r"√(\1)", sp.sstr(value)).replace("**", "^")


def scene_exact(scene: dict, key: str) -> sp.Expr:
    exact_data = scene.get("exact", {})
    if key in {"a2", "b2", "r2", "p"} and exact_data.get(key) is not None:
        return sp.Rational(str(exact_data[key]))
    if key == "a2":
        return sp.nsimplify(scene["a"]) ** 2
    if key == "b2":
        return sp.nsimplify(scene["b"]) ** 2
    if key == "r2":
        return sp.nsimplify(scene["r"]) ** 2
    return sp.nsimplify(scene.get(key, 0))


def conic_features(scene: dict) -> tuple[str, list[str]]:
    """给出与画板同源的焦点、顶点、离心率、准线或渐近线。"""
    typ, vertical = scene["type"], scene.get("orientation") == "vertical"
    h, k = sp.nsimplify(scene.get("h", 0)), sp.nsimplify(scene.get("k", 0))
    steps: list[str] = []
    if typ in {"ellipse", "hyperbola"}:
        a2, b2 = scene_exact(scene, "a2"), scene_exact(scene, "b2")
        c2 = sp.simplify(a2 - b2 if typ == "ellipse" else a2 + b2)
        a, b, c = sp.sqrt(a2), sp.sqrt(b2), sp.sqrt(c2)
        e = sp.simplify(c / a)
        if vertical:
            vertices = [(h, k-a), (h, k+a)]; foci = [(h, k-c), (h, k+c)]
        else:
            vertices = [(h-a, k), (h+a, k)]; foci = [(h-c, k), (h+c, k)]
        point_pair = lambda values: "，".join(f"({exact_text(x)},{exact_text(y)})" for x, y in values)
        steps.extend([f"a²={exact_text(a2)}，b²={exact_text(b2)}。",
                      f"由 c²={'a²-b²' if typ == 'ellipse' else 'a²+b²'}，得 c²={exact_text(c2)}，c={exact_text(c)}。",
                      f"离心率 e=c/a={exact_text(e)}。"])
        answer = f"顶点：{point_pair(vertices)}；焦点：{point_pair(foci)}；离心率 e={exact_text(e)}。"
        if typ == "ellipse" and c != 0:
            directrix = sp.simplify(a2/c)
            answer += f" 准线：{'y' if vertical else 'x'}={exact_text((k if vertical else h)-directrix)} 或 {exact_text((k if vertical else h)+directrix)}。"
            steps.append("准线到中心的距离为 a²/c。")
        if typ == "hyperbola":
            slope = sp.simplify(a/b if vertical else b/a)
            answer += f" 渐近线：y-{exact_text(k)}=±{exact_text(slope)}(x-{exact_text(h)})。"
            steps.append("将标准式右端改为 0，分解得到两条渐近线。")
        return answer, steps
    if typ == "circle":
        r2, r = scene_exact(scene, "r2"), sp.sqrt(scene_exact(scene, "r2"))
        return f"圆心 O({exact_text(h)},{exact_text(k)})，半径 r={exact_text(r)}。", [f"由圆的标准式读出圆心，且 r²={exact_text(r2)}。"]
    p = scene_exact(scene, "p")
    direction = -1 if scene.get("direction") == -1 else 1
    if vertical:
        focus=(h,k+direction*p); directrix=f"y={exact_text(k-direction*p)}"
    else:
        focus=(h+direction*p,k); directrix=f"x={exact_text(h-direction*p)}"
    return (f"顶点 V({exact_text(h)},{exact_text(k)})，焦点 F({exact_text(focus[0])},{exact_text(focus[1])})，准线 {directrix}。",
            [f"标准式中的焦参数 p={exact_text(p)}。", "焦点在开口方向距顶点 p 处，准线在反方向距顶点 p 处。"])


def fixed_line_analysis(scene: dict, line: dict) -> dict | None:
    """精确联立固定直线，返回与答案、画板和核验共用的交点数据。"""
    x, y = sp.symbols("x y", real=True)
    h, k, typ = sp.nsimplify(scene.get("h", 0)), sp.nsimplify(scene.get("k", 0)), scene["type"]
    if typ == "ellipse":
        a2,b2=scene_exact(scene,"a2"),scene_exact(scene,"b2");dx,dy=(b2,a2) if scene.get("orientation")=="vertical" else (a2,b2);curve=(x-h)**2/dx+(y-k)**2/dy-1
    elif typ == "hyperbola":
        a2,b2=scene_exact(scene,"a2"),scene_exact(scene,"b2");curve=(y-k)**2/a2-(x-h)**2/b2-1 if scene.get("orientation")=="vertical" else (x-h)**2/a2-(y-k)**2/b2-1
    elif typ == "circle": curve=(x-h)**2+(y-k)**2-scene_exact(scene,"r2")
    else:
        p,direction=scene_exact(scene,"p"),(-1 if scene.get("direction")==-1 else 1);curve=(x-h)**2-4*p*direction*(y-k) if scene.get("orientation")=="vertical" else (y-k)**2-4*p*direction*(x-h)
    if line.get("kind") in {"vertical","line"} and line.get("x") is not None:
        line_eq=x-sp.nsimplify(line["x"]); line_name=f"x={exact_text(sp.nsimplify(line['x']))}"
    elif line.get("kind") in {"slope","line"} and line.get("m") is not None:
        slope,intercept=sp.nsimplify(line["m"]),sp.nsimplify(line.get("b",0));line_eq=y-slope*x-intercept;line_name=line.get("label") or f"y={exact_text(slope)}x+{exact_text(intercept)}"
    else:return None
    try: solutions=sp.solve((curve,line_eq),(x,y),dict=True)
    except Exception:return None
    real=[item for item in solutions if item.get(x,sp.nan).is_real is not False and item.get(y,sp.nan).is_real is not False]
    if not real:
        return {"line_name": line_name, "points": []}
    points=[(sp.simplify(item[x]),sp.simplify(item[y])) for item in real]
    order = 1 if line.get("kind") in {"vertical", "line"} and line.get("x") is not None else 0
    points.sort(key=lambda point: float(sp.N(point[order], 50)))
    return {"line_name": line_name, "points": points}


def _fixed_line_labels(body: str, count: int) -> tuple[list[str], str]:
    compact = normalise(body)
    pair = re.search(r"交于(?:点)?([a-z](?:[12])?)[,、和与](?:点)?([a-z](?:[12])?)", compact, re.I)
    if pair:
        labels = [point_label(pair.group(1)), point_label(pair.group(2))]
    else:
        single = re.search(r"交于(?:点)?([a-z](?:[12])?)", compact, re.I)
        labels = [point_label(single.group(1))] if single else ["A", "B"]
    labels = labels[:count]
    while len(labels) < count:
        labels.append(chr(ord("A") + len(labels)))
    middle = re.search(r"中点(?:为|是)?(?:点)?([a-z](?:[12])?)", compact, re.I)
    return labels, point_label(middle.group(1)) if middle else "M"


def fixed_line_derived_objects(scene: dict, line: dict, analysis: dict, body: str,
                               part: int | None, label_text: str | None = None) -> list[dict]:
    """Create canonical answer-derived endpoints, chord and midpoint from one exact solve."""
    points = analysis["points"]
    if not points:
        return []
    labels, middle_label = _fixed_line_labels(label_text or body, len(points))
    suffix = part if part is not None else "all"
    line_id = line.get("id") or "line"
    objects: list[dict] = []
    point_ids: list[str] = []
    for branch, ((px, py), label) in enumerate(zip(points, labels)):
        object_id = f"derived-intersection-{line_id}-{branch}-{suffix}"
        item = {
            "id": object_id, "kind": "construction", "op": "intersection",
            "refs": [line_id, "$conic"], "branch": branch, "label": label,
            "source": "derived", "role": "line_conic_intersection", "visible": True,
            "coordinates": [float(px), float(py)], "exact": {"x": str(px), "y": str(py)},
            "construction": {
                "schema": DERIVED_CONSTRUCTION_SCHEMA, "type": "line_conic_intersection",
                "inputs": {"line": line_id, "curve": "$conic", "branch": branch},
                "method": "exact_elimination",
            },
        }
        if part is not None:
            item["part"] = part
        objects.append(item)
        point_ids.append(object_id)
    wants_midpoint = "中点" in body
    wants_chord = wants_midpoint or bool(re.search(r"弦|(?:长度|距离)", body))
    if len(points) == 2 and wants_chord:
        length = sp.simplify(sp.sqrt((points[0][0]-points[1][0])**2+(points[0][1]-points[1][1])**2))
        midpoint = (sp.simplify((points[0][0]+points[1][0])/2), sp.simplify((points[0][1]+points[1][1])/2))
        chord = {
            "id": f"derived-chord-{line_id}-{suffix}", "kind": "construction", "op": "segment",
            "refs": point_ids, "label": f"弦 {labels[0]}{labels[1]}", "source": "derived",
            "role": "derived_chord", "visible": True, "exact": {"length": str(length)},
            "construction": {
                "schema": DERIVED_CONSTRUCTION_SCHEMA, "type": "chord_segment",
                "inputs": {"a": point_ids[0], "b": point_ids[1], "line": line_id},
                "method": "endpoint_distance",
            },
        }
        middle = {
            "id": f"derived-midpoint-{line_id}-{suffix}", "kind": "construction", "op": "midpoint",
            "refs": point_ids, "label": middle_label, "source": "derived", "role": "derived_midpoint",
            "visible": True, "coordinates": [float(midpoint[0]), float(midpoint[1])],
            "exact": {"x": str(midpoint[0]), "y": str(midpoint[1])},
            "construction": {
                "schema": DERIVED_CONSTRUCTION_SCHEMA, "type": "chord_midpoint",
                "inputs": {"a": point_ids[0], "b": point_ids[1], "line": line_id},
                "method": "coordinate_average",
            },
        }
        if part is not None:
            chord["part"] = part
            middle["part"] = part
        objects.append(chord)
        if wants_midpoint:
            objects.append(middle)
    return objects


def fixed_line_metrics(scene: dict, line: dict, body: str = "", part: int | None = None) -> tuple[str, list[str]] | None:
    """Return exact metrics and install their canonical answer-derived objects."""
    analysis = fixed_line_analysis(scene, line)
    if not analysis:
        return None
    line_name, points = analysis["line_name"], analysis["points"]
    if not points:
        return f"{line_name} 与曲线没有实交点。",["把直线代入曲线方程，所得方程无实根。"]
    derived = fixed_line_derived_objects(scene, line, analysis, body, part)
    existing = {item.get("id") for item in scene.setdefault("objects", [])}
    scene["objects"].extend(item for item in derived if item.get("id") not in existing)
    labels, middle_label = _fixed_line_labels(body, len(points))
    named_text="，".join(f"{label}({exact_text(px)},{exact_text(py)})" for label,(px,py) in zip(labels,points))
    steps=[f"联立曲线与 {line_name}。",f"解方程得到实交点：{named_text}。",
           "交点已作为带精确坐标和依赖关系的推导对象加入本小问画板。"]
    answer=f"{line_name} 与曲线的实交点为 {named_text}。"
    if len(points)==2:
        length=sp.simplify(sp.sqrt((points[0][0]-points[1][0])**2+(points[0][1]-points[1][1])**2));mid=((points[0][0]+points[1][0])/2,(points[0][1]+points[1][1])/2)
        if re.search(r"弦|(?:长度|距离)", body):
            answer+=f" 弦长 |{labels[0]}{labels[1]}|={exact_text(length)}。"
            steps.append("用两点距离公式计算弦长；弦段已同步加入画板。")
        if "中点" in body:
            answer+=f" 中点为 ({exact_text(mid[0])},{exact_text(mid[1])})，记作 {middle_label}。"
            steps.append("用两端点坐标的算术平均求弦中点；中点已同步加入画板。")
    return answer,steps


def _gradient_target_names(body: str, role: str) -> list[str]:
    keyword = "切线" if role == "tangent" else "法线"
    compact = normalise(body)
    targets: list[str] = []

    def add(raw: str) -> None:
        name = point_label(raw)
        if name not in targets:
            targets.append(name)

    pair_patterns = [
        rf"(?:在|过)?(?:点)?([a-z](?:[12])?)(?:点)?[,、和与](?:点)?([a-z](?:[12])?)(?:两点|点)?(?:处)?(?:分别)?(?:作|的)?{keyword}",
        rf"(?:点)?([a-z](?:[12])?)(?:点)?(?:处)?(?:的)?{keyword}(?:与|和)(?:点)?([a-z](?:[12])?)(?:点)?(?:处)?(?:的)?{keyword}",
        rf"分别(?:在|过)(?:点)?([a-z](?:[12])?)(?:点)?(?:和|与|、|,)(?:点)?([a-z](?:[12])?)(?:两点|点)?(?:处)?(?:作|求)?{keyword}",
    ]
    for pattern in pair_patterns:
        for match in re.finditer(pattern, compact, re.I):
            add(match.group(1)); add(match.group(2))
    single_patterns = [
        rf"(?:在)?(?:点)?([a-z](?:[12])?)(?:点)?处(?:的)?{keyword}",
        rf"过(?:点)?([a-z](?:[12])?)(?:作|的)?{keyword}",
        rf"(?:点)?([a-z](?:[12])?)(?:点)?(?:的)?{keyword}方程",
    ]
    for pattern in single_patterns:
        for match in re.finditer(pattern, compact, re.I):
            add(match.group(1))
    return targets


def _gradient_target_name(body: str, role: str) -> str | None:
    targets = _gradient_target_names(body, role)
    return targets[0] if targets else None


def install_answer_gradient_line(scene: dict, context: str, body: str, part: int | None,
                                 role: str, target_name: str | None = None) -> dict | None:
    """Create a tangent/normal whose point may itself be an answer-derived intersection."""
    target = target_name or _gradient_target_name(body, role)
    if not target:
        return None
    existing = next((line for line in scene.get("lines", [])
                     if line.get("role") == role and line.get("point") == target
                     and line.get("part") in {None, part}), None)
    if existing:
        return existing

    point_ref = f"feature:{target}"
    coordinates: list[sp.Expr] | None = None
    direct = (scene.get("points") or {}).get(target)
    if isinstance(direct, (list, tuple)) and len(direct) == 2:
        coordinates = [sp.nsimplify(direct[0]), sp.nsimplify(direct[1])]
    else:
        objects = scene.setdefault("objects", [])
        derived_point = next((item for item in objects
                              if item.get("role") == "line_conic_intersection"
                              and item.get("label") == target
                              and item.get("part") in {part, None}), None)
        if derived_point is None:
            for line in scene.get("lines", []):
                if line.get("role") in {"tangent", "normal"} or line.get("part") not in {None, part}:
                    continue
                analysis = fixed_line_analysis(scene, line)
                if not analysis or not analysis.get("points"):
                    continue
                candidates = fixed_line_derived_objects(scene, line, analysis, "", part,
                                                        label_text=context)
                labels = {item.get("label") for item in candidates
                          if item.get("role") == "line_conic_intersection"}
                if target not in labels:
                    continue
                known = {item.get("id") for item in objects}
                objects.extend(item for item in candidates if item.get("id") not in known)
                derived_point = next(item for item in candidates
                                     if item.get("role") == "line_conic_intersection"
                                     and item.get("label") == target)
                break
        if derived_point:
            exact_point = derived_point.get("exact") if isinstance(derived_point.get("exact"), dict) else {}
            if exact_point.get("x") is not None and exact_point.get("y") is not None:
                coordinates = [sp.nsimplify(exact_point["x"]), sp.nsimplify(exact_point["y"])]
                point_ref = derived_point["id"]
    if coordinates is None:
        return None
    result = gradient_line_at(scene, target, coordinates, role, part, point_ref)
    if result:
        scene.setdefault("lines", []).append(result)
    return result


def _scene_feature_exact(scene: dict, reference: str) -> tuple[sp.Expr, sp.Expr] | None:
    name = reference.removeprefix("feature:")
    points = scene.get("points") or {}
    if name in points and isinstance(points[name], (list, tuple)) and len(points[name]) == 2:
        return sp.nsimplify(points[name][0]), sp.nsimplify(points[name][1])
    h, k, typ = sp.nsimplify(scene.get("h", 0)), sp.nsimplify(scene.get("k", 0)), scene.get("type")
    vertical = scene.get("orientation") == "vertical"
    if name in {"O", "V"}:
        return h, k
    if typ in {"ellipse", "hyperbola"} and name in {"F₁", "F1", "F₂", "F2"}:
        a2, b2 = scene_exact(scene, "a2"), scene_exact(scene, "b2")
        distance = sp.sqrt(a2-b2 if typ == "ellipse" else a2+b2)
        sign = -1 if name in {"F₁", "F1"} else 1
        return (h, k+sign*distance) if vertical else (h+sign*distance, k)
    if typ == "parabola" and name == "F":
        distance = scene_exact(scene, "p") * (-1 if scene.get("direction") == -1 else 1)
        return (h, k+distance) if vertical else (h+distance, k)
    return None


def _shifted_square(variable: str, center: sp.Expr) -> str:
    center = sp.simplify(center)
    if center == 0:
        return f"{variable}²"
    return f"({variable}{'-' if center > 0 else '+'}{exact_text(abs(center))})²"


def _fraction_term(variable: str, center: sp.Expr, denominator: sp.Expr) -> str:
    square = _shifted_square(variable, center)
    denominator = sp.simplify(denominator)
    return square if denominator == 1 else f"{square}/({exact_text(denominator)})"


def midpoint_locus_answer(scene: dict, body: str, part: int | None) -> tuple[str, list[str]] | None:
    """Eliminate a moving endpoint for M=(P+Q)/2 and install the exact locus curve."""
    compact = normalise(body)
    target_match = (re.search(r"(?:点)?([a-z](?:[12])?)(?:点)?的?轨迹", compact, re.I)
                    or re.search(r"轨迹(?:点)?([a-z](?:[12])?)", compact, re.I))
    if not target_match:
        return None
    target = point_label(target_match.group(1))
    objects = scene.setdefault("objects", [])
    midpoint = next((item for item in objects if item.get("op") == "midpoint"
                     and item.get("label") == target and item.get("part") in {None, part}), None)
    if not midpoint or not isinstance(midpoint.get("refs"), list) or len(midpoint["refs"]) != 2:
        return None
    object_by_id = {item.get("id"): item for item in objects if item.get("id")}
    moving_ref = next((ref for ref in midpoint["refs"]
                       if object_by_id.get(ref, {}).get("op") == "point_on"
                       and object_by_id.get(ref, {}).get("refs") == ["$conic"]), None)
    fixed_ref = next((ref for ref in midpoint["refs"] if ref != moving_ref and str(ref).startswith("feature:")), None)
    fixed = _scene_feature_exact(scene, fixed_ref) if fixed_ref else None
    if not moving_ref or not fixed:
        return None
    qx, qy = fixed
    h0, k0 = sp.nsimplify(scene.get("h", 0)), sp.nsimplify(scene.get("k", 0))
    h, k = sp.simplify((h0+qx)/2), sp.simplify((k0+qy)/2)
    typ, vertical = scene["type"], scene.get("orientation") == "vertical"
    x, y, source_expression = scene_polynomial(scene)
    implicit = sp.factor(source_expression.subs({x: 2*x-qx, y: 2*y-qy}))
    suffix = part if part is not None else "all"
    exact_data: dict[str, str] = {"h": str(h), "k": str(k), "implicit": str(implicit)}
    locus: dict = {
        "id": f"derived-locus-{target}-{suffix}", "label": f"{target} 的轨迹",
        "source": "derived", "role": "derived_locus", "visible": True,
        "h": float(h), "k": float(k), "orientation": scene.get("orientation", "horizontal"),
        "refs": [midpoint["id"], moving_ref, fixed_ref, "$conic"],
        "construction": {
            "schema": DERIVED_CONSTRUCTION_SCHEMA, "type": "midpoint_locus",
            "inputs": {"target": midpoint["id"], "moving": moving_ref,
                       "fixed": fixed_ref, "curve": "$conic"},
            "method": "affine_elimination",
        },
    }
    if typ in {"ellipse", "hyperbola"}:
        a2, b2 = sp.simplify(scene_exact(scene, "a2")/4), sp.simplify(scene_exact(scene, "b2")/4)
        locus.update(kind="conic", conicType=typ, a=float(sp.sqrt(a2)), b=float(sp.sqrt(b2)))
        exact_data.update(a2=str(a2), b2=str(b2))
        dx, dy = (b2, a2) if vertical else (a2, b2)
        xterm, yterm = _fraction_term("x", h, dx), _fraction_term("y", k, dy)
        equation = f"{yterm}-{xterm}=1" if typ == "hyperbola" and vertical else f"{xterm}-{yterm}=1" if typ == "hyperbola" else f"{xterm}+{yterm}=1"
    elif typ == "circle":
        r2 = sp.simplify(scene_exact(scene, "r2")/4)
        locus.update(kind="circle", conicType="circle", r=float(sp.sqrt(r2)))
        exact_data["r2"] = str(r2)
        equation = f"{_shifted_square('x', h)}+{_shifted_square('y', k)}={exact_text(r2)}"
    else:
        p = sp.simplify(scene_exact(scene, "p")/2)
        direction = -1 if scene.get("direction") == -1 else 1
        locus.update(kind="conic", conicType="parabola", p=float(p), direction=direction)
        exact_data.update(p=str(p), direction=str(direction))
        coefficient = sp.simplify(4*p*direction)
        major, minor, center_major, center_minor = (("y", "x", k, h) if vertical else ("x", "y", h, k))
        right = major if center_major == 0 else f"({major}{'-' if center_major > 0 else '+'}{exact_text(abs(center_major))})"
        equation = f"{_shifted_square(minor, center_minor)}={exact_text(coefficient)}{right}"
    locus["equation"], locus["exact"] = equation, exact_data
    if part is not None:
        locus["part"] = part
    if not any(item.get("id") == locus["id"] for item in objects):
        objects.append(locus)
    fixed_name = fixed_ref.removeprefix("feature:")
    answer = f"点 {target} 的轨迹方程为 {equation}。"
    steps = [
        f"设 {target}(x,y)，固定点 {fixed_name}({exact_text(qx)},{exact_text(qy)})，动点记为 P。",
        f"由 {target} 是 P{fixed_name} 的中点，得 P=(2x-{exact_text(qx)},2y-{exact_text(qy)})。",
        "把 P 的坐标代入原圆锥曲线并消去动参数，化简得到轨迹方程。",
        "再由轨迹上任一点反推 P=2M-Q，可回到原曲线，因此没有漏点；轨迹已作为推导曲线加入画板。",
    ]
    return answer, steps


def parabola_focus_chord_context(scene: dict, text: str) -> dict | None:
    """Recognise a moving chord through a parabola focus and keep its exact invariants."""
    compact = normalise(text)
    if scene.get("type") != "parabola" or not scene.get("dynamicLine"):
        return None
    through = str(scene.get("lineThrough") or "")
    if not through.startswith("point:"):
        return None
    source = through.split(":", 1)[1]
    point = (scene.get("points") or {}).get(source)
    if not (isinstance(point, (list, tuple)) and len(point) == 2):
        return None
    p = scene_exact(scene, "p")
    h, k = sp.nsimplify(scene.get("h", 0)), sp.nsimplify(scene.get("k", 0))
    direction = -1 if scene.get("direction") == -1 else 1
    vertical = scene.get("orientation") == "vertical"
    focus = (h, k + direction*p) if vertical else (h + direction*p, k)
    if any(sp.simplify(sp.nsimplify(value)-expected) != 0 for value, expected in zip(point, focus)):
        return None
    pair = re.search(r"交于(?:点)?([a-z](?:[12])?)[,、和与](?:点)?([a-z](?:[12])?)", compact, re.I)
    if not pair or "切线" not in compact:
        return None
    first, second = point_label(pair.group(1)), point_label(pair.group(2))
    q_match = re.search(r"(?:两条)?切线[^。；]{0,24}?交于(?:点)?([a-z](?:[12])?)", compact, re.I)
    m_match = re.search(r"(?:弦)?[a-z](?:[12])?[a-z](?:[12])?的中点(?:为|是)?(?:点)?([a-z](?:[12])?)", compact, re.I)
    q_name = point_label(q_match.group(1)) if q_match else "Q"
    m_name = point_label(m_match.group(1)) if m_match else "M"
    parts = split_problem_parts(text)
    part_for = lambda pattern: next((item.get("index") for item in parts if re.search(pattern, item.get("body") or "")), None)
    return {
        "source": source, "endpoints": [first, second], "q": q_name, "m": m_name,
        "p": p, "h": h, "k": k, "direction": direction, "vertical": vertical,
        "focus": focus,
        "parts": {
            "perpendicular": part_for(r"切线.*垂直|垂直.*切线"),
            "q_locus": part_for(rf"(?:点)?{re.escape(q_name)}.*轨迹"),
            "m_locus": part_for(rf"(?:点)?{re.escape(m_name)}.*轨迹"),
            "area": part_for(r"面积"),
        },
    }


def _append_unique(items: list[dict], value: dict) -> None:
    if not any(item.get("id") == value.get("id") for item in items):
        items.append(value)


def install_parabola_focus_chord_scene(scene: dict, text: str) -> dict | None:
    """Install the complete live A/B tangents -> Q/M -> locus dependency graph."""
    context = parabola_focus_chord_context(scene, text)
    if not context:
        return None
    scene["title"] = f"抛物线焦点弦：{context['endpoints'][0]}{context['endpoints'][1]}、双切线与轨迹"
    scene.pop("dynamicLinePart", None)
    if re.search(r"斜率(?:为|是)?1(?:\D|$)", normalise(text)):
        scene["theta"] = 45
    first, second = context["endpoints"]
    tangent_ids = [f"derived-dynamic-tangent-{first}", f"derived-dynamic-tangent-{second}"]
    lines = scene.setdefault("lines", [])
    for name, identifier in zip((first, second), tangent_ids):
        _append_unique(lines, {
            "id": identifier, "kind": "construction", "op": "tangent",
            "refs": [f"feature:{name}", "$conic"], "label": f"{name} 点切线",
            "source": "derived", "role": "dynamic_tangent", "point": name,
            "pointRef": f"feature:{name}", "visible": True,
            "construction": {
                "schema": DERIVED_CONSTRUCTION_SCHEMA, "type": "dynamic_tangent_at",
                "inputs": {"curve": "$conic", "point": name, "point_ref": f"feature:{name}", "line": "$dynamic"},
                "method": "implicit_gradient_live",
            },
        })
    p, h, k, direction, vertical = (context[key] for key in ("p", "h", "k", "direction", "vertical"))
    directrix_value = sp.simplify((k if vertical else h) - direction*p)
    q_locus_id = f"derived-focus-chord-{context['q']}-locus"
    if vertical:
        qa, qb, qc = normalized_linear_coefficients(0, 1, -directrix_value)
        q_locus = {"kind": "slope", "m": 0.0, "b": float(directrix_value)}
    else:
        qa, qb, qc = normalized_linear_coefficients(1, 0, -directrix_value)
        q_locus = {"kind": "vertical", "x": float(directrix_value)}
    q_locus.update({
        "id": q_locus_id, "label": f"{context['q']} 的轨迹", "source": "derived",
        "role": "derived_locus", "visible": True,
        "equation": linear_equation_text(qa, qb, qc),
        "exact": {"A": str(qa), "B": str(qb), "C": str(qc)},
        "construction": {
            "schema": DERIVED_CONSTRUCTION_SCHEMA, "type": "focus_chord_tangent_intersection_locus",
            "inputs": {"curve": "$conic", "focus": f"feature:{context['source']}", "tangents": tangent_ids},
            "method": "parameter_elimination",
        },
    })
    if context["parts"]["q_locus"] is not None:
        q_locus["part"] = context["parts"]["q_locus"]
    _append_unique(lines, q_locus)
    objects = scene.setdefault("objects", [])
    _append_unique(objects, {"id": "derived-focus-chord-chord", "kind": "construction", "op": "segment",
                             "refs": [f"feature:{first}", f"feature:{second}"], "label": f"弦 {first}{second}",
                             "source": "derived", "role": "dynamic_chord", "visible": True})
    _append_unique(objects, {"id": "derived-focus-chord-q", "kind": "construction", "op": "intersection",
                             "refs": tangent_ids, "branch": 0, "label": context["q"], "source": "derived",
                             "role": "dynamic_tangent_intersection", "visible": True})
    _append_unique(objects, {"id": "derived-focus-chord-m", "kind": "construction", "op": "midpoint",
                             "refs": [f"feature:{first}", f"feature:{second}"], "label": context["m"],
                             "source": "derived", "role": "dynamic_chord_midpoint", "visible": True})
    locus_h, locus_k = context["focus"]
    locus_equation = (f"{_shifted_square('x', locus_h)}={exact_text(2*p*direction)}"
                      f"{'y' if locus_k == 0 else f'(y{'-' if locus_k > 0 else '+'}{exact_text(abs(locus_k))})'}"
                      if vertical else
                      f"{_shifted_square('y', locus_k)}={exact_text(2*p*direction)}"
                      f"{'x' if locus_h == 0 else f'(x{'-' if locus_h > 0 else '+'}{exact_text(abs(locus_h))})'}")
    m_locus = {
        "id": f"derived-focus-chord-{context['m']}-locus", "kind": "conic", "conicType": "parabola",
        "label": f"{context['m']} 的轨迹", "source": "derived", "role": "derived_locus", "visible": True,
        "h": float(locus_h), "k": float(locus_k), "p": float(p/2), "direction": direction,
        "orientation": scene.get("orientation", "horizontal"), "equation": locus_equation,
        "exact": {"h": str(locus_h), "k": str(locus_k), "p": str(p/2), "direction": str(direction)},
        "refs": ["derived-focus-chord-m", "$dynamic", "$conic", f"feature:{context['source']}"],
        "construction": {
            "schema": DERIVED_CONSTRUCTION_SCHEMA, "type": "focus_chord_midpoint_locus",
            "inputs": {"midpoint": "derived-focus-chord-m", "line": "$dynamic", "curve": "$conic",
                       "focus": f"feature:{context['source']}"}, "method": "vieta_parameter_elimination",
        },
    }
    if context["parts"]["m_locus"] is not None:
        m_locus["part"] = context["parts"]["m_locus"]
    _append_unique(objects, m_locus)
    scene["focusChord"] = {
        "schema": "dongjiexi-focus-chord/v1", "source": context["source"], "endpoints": [first, second],
        "tangents": tangent_ids, "intersection": "derived-focus-chord-q", "midpoint": "derived-focus-chord-m",
        "q": context["q"], "m": context["m"], "qLocus": q_locus_id,
        "mLocus": m_locus["id"], "parts": context["parts"],
        "exact": {"parameterProduct": "-1", "directrix": str(directrix_value), "midpointP": str(p/2)},
    }
    return context


def parabola_focus_chord_part_answer(scene: dict, part: dict, context: dict | None) -> tuple[str, list[str]] | None:
    if not context:
        return None
    body = part.get("body") or ""
    first, second, source = *context["endpoints"], context["source"]
    p, h, k, direction, vertical = (context[key] for key in ("p", "h", "k", "direction", "vertical"))
    if "切线" in body and "垂直" in body:
        tangent_slope = "切线斜率分别为 t₁、t₂" if vertical else "切线斜率分别为 1/t₁、1/t₂"
        return (
            f"抛物线在 {first}、{second} 两点处的切线互相垂直。",
            [
                f"用参数表示交点：{first}、{second} 分别对应参数 t₁、t₂。",
                f"焦点 {source} 在弦 {first}{second} 上。把焦点代入两参数弦方程，得到 t₁t₂=-1。",
                f"由抛物线切线公式，{tangent_slope}，所以两切线斜率之积为 -1。",
                "两条切线均已作为依赖动交点的实时构造加入画板；旋转 l 时会与 A、B、Q、M 同步更新。",
            ],
        )
    if "轨迹" in body and context["q"] in body:
        value = sp.simplify((k if vertical else h)-direction*p)
        equation = f"{'y' if vertical else 'x'}={exact_text(value)}"
        return (
            f"点 {context['q']} 的轨迹为 {equation}，即原抛物线的准线；点 {source} 是原抛物线的焦点。",
            [
                "两条参数切线联立，交点坐标在轴向分量上等于 p·t₁t₂。",
                "由 t₁t₂=-1，轴向分量恒等于 -p；另一坐标随 t₁+t₂ 取遍全体实数。",
                f"因此 {context['q']} 的轨迹就是准线 {equation}，它与焦点 {source} 分居顶点两侧。",
                "轨迹直线和实时点 Q 已加入画板。",
            ],
        )
    if "轨迹" in body and context["m"] in body:
        locus = next(item for item in scene.get("objects", []) if item.get("id") == scene["focusChord"]["mLocus"])
        return (
            f"点 {context['m']} 的轨迹方程为 {locus['equation']}。",
            [
                f"设 s=t₁+t₂，则 {context['m']} 的横、纵坐标分别由 {first}、{second} 坐标的算术平均得到。",
                "利用 t₁t₂=-1，把 t₁²+t₂² 化为 s²+2，再消去 s。",
                f"化简得到 {locus['equation']}；其顶点正是焦点 {source}。",
                "中点 M 和精确轨迹曲线均已加入画板并随 l 联动。",
            ],
        )
    if "面积" in body:
        slope_match = re.search(r"斜率(?:为|是)?([+-]?(?:\d+/\d+|\d+(?:\.\d+)?))", normalise(body))
        if not slope_match:
            return None
        slope = exact(slope_match.group(1))
        px, py = map(sp.nsimplify, scene["points"][source])
        x, y, conic = scene_polynomial(scene)
        line_y = sp.simplify(py+slope*(x-px))
        roots = sp.solve(sp.factor(conic.subs(y, line_y)), x)
        points = [(sp.simplify(root), sp.simplify(line_y.subs(x, root))) for root in roots if root.is_real is not False]
        coordinates = "、".join(f"({exact_text(a)},{exact_text(b)})" for a, b in points)
        return (
            f"当 l 的斜率为 {exact_text(slope)} 时，{first}、{second} 为 {coordinates}；由于 {source}、{first}、{second} 共线，△{source}{first}{second} 的面积为 0。",
            [
                f"直线 l 过 {source}({exact_text(px)},{exact_text(py)})，故方程为 y-{exact_text(py)}={exact_text(slope)}(x-{exact_text(px)})。",
                f"与抛物线联立得到两个交点 {coordinates}。",
                f"点 {source}、{first}、{second} 都在直线 l 上，三角形退化，底边对应的高为 0。",
            ],
        )
    return None


def tangent_answer(scene: dict, part: dict) -> tuple[str, list[str]] | None:
    body = part.get("body") or part.get("question") or ""
    requested = _gradient_target_names(body, "tangent")
    compatible = [line for line in scene.get("lines", []) if line.get("role") == "tangent" and line.get("part") in {None, part.get("index")}]
    by_name = {line.get("point"): line for line in compatible}
    candidates = [by_name[name] for name in requested if name in by_name] or compatible
    if not candidates:
        return None
    if len(requested) >= 2 and len(candidates) < 2:
        return None
    if len(candidates) >= 2:
        first, second = candidates[:2]
        name1, name2 = first.get("point", "A"), second.get("point", "B")
        equation1 = first.get("equation", first.get("label", "第一条切线"))
        equation2 = second.get("equation", second.get("label", "第二条切线"))
        coefficients1, coefficients2 = line_coefficients(first), line_coefficients(second)
        answer = f"曲线在点 {name1}、{name2} 处的切线分别为 {equation1}，{equation2}。"
        steps = [
            "把主曲线写成隐式方程 F(x,y)=0，并分别确认两个切点在曲线上。",
            f"在 {name1}、{name2} 处分别计算梯度，得到切线 {equation1} 与 {equation2}；两条线均已加入本小问画板。",
        ]
        if "垂直" in body and coefficients1 and coefficients2:
            a1, b1, _ = coefficients1
            a2, b2, _ = coefficients2
            dot = sp.simplify(a1*a2+b1*b2)
            direction1, direction2 = (b1, -a1), (b2, -a2)
            steps.append(
                f"取两条切线的方向向量 d₁=({exact_text(direction1[0])},{exact_text(direction1[1])})，"
                f"d₂=({exact_text(direction2[0])},{exact_text(direction2[1])})。"
            )
            steps.append(f"计算 d₁·d₂={exact_text(dot)}。")
            if dot == 0:
                answer += " 两条切线的方向向量点积为 0，因此两条切线互相垂直。"
                steps.append("方向向量均非零且点积为 0，所以两条切线互相垂直。")
            else:
                answer += f" 但两条切线方向向量的点积为 {exact_text(dot)}≠0，故当前题设下“互相垂直”的结论不成立。"
                steps.append("点积不为 0，不能证明垂直；应检查题目坐标、符号或识别结果。")
        return answer, steps
    line = candidates[0]
    name, equation = line.get("point", "P"), line.get("equation", line.get("label", "切线"))
    return (
        f"曲线在点 {name} 处的切线方程为 {equation}。",
        [
            "把主曲线写成隐式方程 F(x,y)=0。",
            f"先代入点 {name}，确认 F({name})=0，因此该点确在曲线上。",
            "计算梯度 (Fₓ,Fᵧ)，切线满足 Fₓ(P)(x-x₀)+Fᵧ(P)(y-y₀)=0。",
            f"整理得到 {equation}；该直线已作为“推导对象”同步加入本小问画板。",
        ],
    )


def normal_answer(scene: dict, part: dict) -> tuple[str, list[str]] | None:
    candidates = [line for line in scene.get("lines", []) if line.get("role") == "normal" and line.get("part") in {None, part.get("index")}]
    if not candidates:
        return None
    line = candidates[0]
    name, equation = line.get("point", "P"), line.get("equation", line.get("label", "法线"))
    return (
        f"曲线在点 {name} 处的法线方程为 {equation}。",
        [
            "把主曲线写成隐式方程 F(x,y)=0，并确认给定点在曲线上。",
            "曲线在该点的梯度 (Fₓ,Fᵧ) 是法线的方向向量。",
            f"令法线经过点 {name}，整理得到 {equation}。",
            "该法线已作为“推导对象”同步加入本小问画板，并检查经过切点且垂直于切线。",
        ],
    )


def perpendicular_foot_answer(scene: dict, part: dict) -> tuple[str, list[str]] | None:
    candidates = [item for item in scene.get("objects", []) if item.get("role") == "perpendicular_foot" and item.get("part") in {None, part.get("index")}]
    if not candidates:
        return None
    foot = candidates[0]
    exact_coordinates = foot.get("exact") if isinstance(foot.get("exact"), dict) else {}
    x_value, y_value = exact_coordinates.get("x"), exact_coordinates.get("y")
    if x_value is None or y_value is None:
        return None
    source = (foot.get("construction") or {}).get("inputs", {}).get("point", "P")
    label = foot.get("label", "H")
    return (
        f"点 {source} 到题设直线的垂足为 {label}({exact_text(sp.nsimplify(x_value))},{exact_text(sp.nsimplify(y_value))})。",
        [
            "把题设直线统一写成 Ax+By+C=0。",
            f"设垂足为 {label}，使用正交投影公式求坐标。",
            f"检验 {label} 在题设直线上，且 {source}{label} 与该直线的方向向量点积为 0。",
            "垂足已作为带依赖关系的“推导对象”加入本小问画板；移动源点或直线时会同步更新。",
        ],
    )


def deterministic_parts(text: str, scene: dict, base_answer: str, base_steps: list[str]) -> list[dict]:
    parts=[]
    focus_chord_context = install_parabola_focus_chord_scene(scene, text)
    for part in split_problem_parts(text):
        body=part.get("body") or part.get("question") or ""
        focus_chord_answer = parabola_focus_chord_part_answer(scene, part, focus_chord_context)
        metric=None
        if re.search(r"交点|弦长|中点|坐标",body):
            candidates=[line for line in scene.get("lines",[]) if line.get("part") in {None,part.get("index")}]
            metric=next((result for line in candidates if (result:=fixed_line_metrics(scene,line,body,part.get("index")))),None)
        if "切线" in body:
            for target in _gradient_target_names(body, "tangent"):
                install_answer_gradient_line(scene, part.get("question") or text, body, part.get("index"), "tangent", target)
        if "法线" in body:
            for target in _gradient_target_names(body, "normal"):
                install_answer_gradient_line(scene, part.get("question") or text, body, part.get("index"), "normal", target)
        tangent=tangent_answer(scene,part) if "切线" in body else None
        normal=normal_answer(scene,part) if "法线" in body else None
        foot=perpendicular_foot_answer(scene,part) if "垂足" in body else None
        locus=midpoint_locus_answer(scene,body,part.get("index")) if "轨迹" in body else None
        if focus_chord_answer:
            answer,steps=focus_chord_answer;status="answered"
        elif tangent:
            answer,steps=tangent;status="answered"
        elif "切线" in body:
            answer="内置引擎尚未得到可核验的切点，因此没有把其它方程冒充为切线。";steps=[*base_steps,"请确认切点坐标已给出且确实在曲线上；曲线外一点的两条切线需要另行求切点。"] ;status="partial"
        elif normal:
            answer,steps=normal;status="answered"
        elif "法线" in body:
            answer="内置引擎尚未得到可核验的曲线上点，因此没有把其它直线冒充为法线。";steps=[*base_steps,"请确认点坐标已给出且确实在曲线上。"] ;status="partial"
        elif foot:
            answer,steps=foot;status="answered"
        elif "垂足" in body:
            answer="内置引擎尚未唯一确定源点、目标直线和垂足。";steps=[*base_steps,"请明确点的坐标、直线方程和垂足名称。"] ;status="partial"
        elif locus:
            answer,steps=locus;status="answered"
        elif "轨迹" in body:
            answer="内置引擎尚未得到可严格消元的轨迹关系，因此没有用采样点猜测轨迹方程。";steps=[*base_steps,"当前已支持“圆锥曲线上动点与固定点的中点轨迹”；其它轨迹会继续扩充。"] ;status="partial"
        elif metric:
            answer,steps=metric;status="answered"
        # Feature questions are checked before generic "方程" questions so
        # phrases such as "求焦点、离心率和准线方程" are not mistaken for a
        # request to repeat the conic equation.  A feature appearing only in a
        # known condition (for example "离心率为 1/2") is not a goal by itself.
        elif re.search(r"(?:求|写出|确定|计算)[^。；]{0,45}(?:焦点|顶点|准线|渐近线|离心率|圆心|半径|轴长)",body):
            answer,steps=conic_features(scene);status="answered"
        elif re.search(r"标准方程",body) or re.search(r"(?:求|写出|确定|建立)[^。；]{0,35}(?<!准线)(?<!渐近线)方程",body):
            answer,steps=base_answer,list(base_steps);status="answered"
        elif len(split_problem_parts(text))==1 and "=" in text and not re.search(r"证明|定值|定点|最值|范围|轨迹",body):
            answer,steps=base_answer,list(base_steps);status="answered"
        else:
            answer="内置确定性引擎已建立精确曲线，但这一问还需要继续完成符号推理。";steps=[*base_steps,"当前不会用未经验证的猜测补齐定值、最值、轨迹或证明结论。"] ;status="partial"
        parts.append({**part,"status":status,"answer":answer,"steps":steps})
    return parts


def fallback_solution(text: str) -> dict:
    if has_uncertainty(text):
        raise ValueError("题面仍含“[看不清]”或其它未确认字段。请先补正题目，再进行本地反推。")
    scene = standard_conic(text)
    if not scene:
        base_parts = split_problem_parts(text)
        return attach_trust_report({
            "mode": "symbolic-fallback", "title": "尚未建立可核验的模型", "restatement": text,
            "answer": "内置确定性引擎暂未从现有条件唯一建立曲线。请核对识别文字，或补充焦点、轴长、离心率、圆心、顶点、准线、过点等条件。",
            "steps": ["题干已按小问保留。", "没有足够条件时不会猜测方程或伪造图形。"],
            "parts": [{**part, "status": "needs_information", "answer": "现有内置规则尚不能由这些条件唯一建模。", "steps": ["核对题图识别的分数、根号和正负号。", "确认曲线类型与能够唯一确定曲线的独立条件。"]} for part in base_parts],
            "scene": None, "verification": {"status": "not-verified", "message": "没有足够的结构化条件可进行符号核验。"},
            "completion": {"answered": 0, "total": len(base_parts)},
        })
    scene = decorate_scene(scene, normalise(text))
    t = scene["type"]
    if t == "ellipse":
        a2,b2=scene_exact(scene,"a2"),scene_exact(scene,"b2");c=sp.sqrt(sp.simplify(a2-b2));equation=scene.get("equation") or equation_for_ellipse(a2,b2,scene.get("orientation","horizontal"),sp.nsimplify(scene.get("h",0)),sp.nsimplify(scene.get("k",0)));scene["equation"]=equation
        answer = f"椭圆标准方程：{equation}；a={exact_text(sp.sqrt(a2))}，b={exact_text(sp.sqrt(b2))}，c={exact_text(c)}。"
    elif t == "hyperbola":
        a2,b2=scene_exact(scene,"a2"),scene_exact(scene,"b2");c=sp.sqrt(sp.simplify(a2+b2));h,k=sp.nsimplify(scene.get("h",0)),sp.nsimplify(scene.get("k",0));x="x" if h==0 else f"(x{'-' if h>0 else '+'}{nice(abs(h))})";y="y" if k==0 else f"(y{'-' if k>0 else '+'}{nice(abs(k))})";equation=scene.get("equation") or (f"{y}²/{exact_text(a2)}-{x}²/{exact_text(b2)}=1" if scene.get("orientation")=="vertical" else f"{x}²/{exact_text(a2)}-{y}²/{exact_text(b2)}=1");scene["equation"]=equation
        answer = f"双曲线标准方程：{equation}；a={exact_text(sp.sqrt(a2))}，b={exact_text(sp.sqrt(b2))}，c={exact_text(c)}。"
    elif t == "circle":
        r2=scene_exact(scene,"r2");h,k=sp.nsimplify(scene.get("h",0)),sp.nsimplify(scene.get("k",0));x="x" if h==0 else f"(x{'-' if h>0 else '+'}{nice(abs(h))})";y="y" if k==0 else f"(y{'-' if k>0 else '+'}{nice(abs(k))})";equation=scene.get("equation") or f"{x}²+{y}²={exact_text(r2)}";scene["equation"]=equation
        answer = f"圆的方程：{equation}；半径 r={exact_text(sp.sqrt(r2))}。"
    else:
        p=scene_exact(scene,"p");answer = f"抛物线方程：{scene.get('equation', '已建立抛物线模型')}；p={exact_text(p)}。"
    base_steps = scene.get("derivation") or ["从题干提取曲线方程与条件。", "使用内置符号计算建立同源参数。", "由同一组参数生成解析、特殊点和画板图形。"]
    parts = deterministic_parts(text, scene, answer, base_steps)
    answered = sum(part["status"] == "answered" for part in parts)
    summary_answer = parts[0]["answer"] if len(parts) == 1 and parts[0]["status"] == "answered" else answer
    summary_steps = parts[0]["steps"] if len(parts) == 1 and parts[0]["status"] == "answered" else base_steps
    return attach_trust_report({
        "mode": "symbolic-fallback", "title": "董解析内置确定性解答", "restatement": text,
        "answer": summary_answer,
        "strategy": "先把自然语言条件转为精确曲线模型，再按小问计算方程、特殊点或固定直线交点；未覆盖的证明目标明确标为待完成。",
        "steps": summary_steps,
        "parts": parts,
        "completion": {"answered": answered, "total": len(parts)},
        "scene": scene,
        "verification": {"status": "verified-structure", "message": "方程、特殊点、固定直线联立与绘图参数来自同一符号模型；未标为完成的小问仍需继续推理。"},
    })




def normalise_scene_contract(scene: dict) -> dict:
    """Keep desktop Python and browser-exported scene aliases semantically equal."""
    if "dynamicLine" not in scene and "showDynamic" in scene:
        scene["dynamicLine"] = bool(scene["showDynamic"])
    if "showDynamic" not in scene and "dynamicLine" in scene:
        scene["showDynamic"] = bool(scene["dynamicLine"])
    if "inferred_from_conditions" not in scene and "inferredFromConditions" in scene:
        scene["inferred_from_conditions"] = bool(scene["inferredFromConditions"])
    if "inferredFromConditions" not in scene and "inferred_from_conditions" in scene:
        scene["inferredFromConditions"] = bool(scene["inferred_from_conditions"])
    return scene


def _finite_numbers(item: dict, *keys: str) -> bool:
    try:
        return all(math.isfinite(float(item[key])) for key in keys)
    except (KeyError, TypeError, ValueError, OverflowError):
        return False


def _native_manual_shape(item: dict) -> str | None:
    """Return the runtime shape produced by a standalone manual object, if valid."""
    kind = item.get("kind")
    if kind == "point":
        return "point" if _finite_numbers(item, "x", "y") else None
    if kind == "circle":
        return "circle" if _finite_numbers(item, "h", "k", "r") and float(item["r"]) > 0 else None
    if kind in {"line", "slope", "vertical"}:
        if item.get("m") is not None:
            values = dict(item)
            values.setdefault("b", 0)
            return "line" if _finite_numbers(values, "m", "b") else None
        return "line" if _finite_numbers(item, "x") else None
    if kind == "conic":
        if item.get("orientation", "horizontal") not in {"horizontal", "vertical"} or not _finite_numbers(item, "h", "k"):
            return None
        conic_type = item.get("conicType")
        if conic_type in {"ellipse", "hyperbola"}:
            return "conic" if _finite_numbers(item, "a", "b") and float(item["a"]) > 0 and float(item["b"]) > 0 else None
        if conic_type == "parabola":
            return "conic" if _finite_numbers(item, "p", "direction") and float(item["p"]) > 0 and abs(float(item["direction"])) == 1 else None
        return None
    if kind == "function":
        requirements = {
            "quadratic": ("a", "b", "c"), "cubic": ("a", "b", "c", "d"),
            "absolute": ("a", "h", "k"), "reciprocal": ("a", "h", "k"),
            "exponential": ("a", "b", "h", "k"), "logarithm": ("a", "b", "h", "k"),
            "sine": ("A", "w", "phi", "d"), "cosine": ("A", "w", "phi", "d"),
            "tangent": ("A", "w", "phi", "d"), "squareRoot": ("a", "h", "k"),
        }
        family, params = item.get("family"), item.get("params")
        if family not in requirements or not isinstance(params, dict) or not _finite_numbers(params, *requirements[family]):
            return None
        if family in {"quadratic", "cubic", "reciprocal"} and abs(float(params["a"])) < 1e-12:
            return None
        if family in {"exponential", "logarithm"} and (float(params["b"]) <= 0 or abs(float(params["b"]) - 1) < 1e-12):
            return None
        return "display"
    return None


def _construction_shape(item: dict, ref_types: list[str]) -> str | None:
    op = item.get("op")
    if op == "line_angle":
        return "line" if ref_types == ["point"] and isinstance(item.get("angle"), (int, float)) and _finite_numbers(item, "angle") else None
    if len(item.get("refs") or []) == 2 and item["refs"][0] == item["refs"][1]:
        return None
    if op in {"line", "segment", "ray", "circle", "midpoint", "distance"}:
        if ref_types != ["point", "point"]:
            return None
        return {"circle": "circle", "midpoint": "point", "distance": "measure"}.get(op, "line")
    if op in {"parallel", "perpendicular", "foot"}:
        if ref_types != ["point", "line"]:
            return None
        return "point" if op == "foot" else "line"
    if op == "intersection":
        supported = {("line", "line"), ("line", "circle"), ("circle", "line"),
                     ("circle", "circle"), ("line", "conic"), ("conic", "line")}
        return "point" if tuple(ref_types) in supported else None
    if op == "point_on":
        return "point" if ref_types and ref_types[0] in {"line", "circle", "conic"} else None
    if op in {"tangent", "normal"}:
        return "line" if ref_types in (["point", "conic"], ["point", "circle"]) else None
    return None


def trusted_scene_objects(reference: dict, candidate: dict) -> tuple[list[dict], int]:
    """Rebuild answer objects and retain only dependency-complete manual work."""
    result = [dict(item) for item in (reference.get("objects") or [])]
    used_ids = {item.get("id") for item in result if item.get("id")}
    used_labels = {item.get("label") for item in result if item.get("label")}
    construction_outputs = {
        "line": "line", "line_angle": "line", "segment": "line", "ray": "line", "circle": "circle",
        "midpoint": "point", "parallel": "line", "perpendicular": "line",
        "intersection": "point", "foot": "point", "distance": "measure", "point_on": "point", "tangent": "line", "normal": "line",
    }
    available_types = {}
    for item in result:
        shape = construction_outputs.get(item.get("op")) if item.get("kind") == "construction" else _native_manual_shape(item)
        if item.get("id") and shape:
            available_types[item["id"]] = shape
    for item in reference.get("lines") or []:
        if item.get("id"):
            available_types[item["id"]] = "line"
    available = set(available_types)
    available.add("$conic")
    available_types["$conic"] = "conic"
    if reference.get("dynamicLine") or reference.get("showDynamic"):
        available.add("$dynamic")
        available_types["$dynamic"] = "line"

    feature_names = set(reference.get("points") or {})
    feature_names.update({"A", "B"} if reference.get("dynamicLine") else set())
    feature_names.update({
        "circle": {"O"},
        "ellipse": {"O", "F₁", "F₂", "A₁", "A₂"},
        "hyperbola": {"O", "F₁", "F₂", "A₁", "A₂"},
        "parabola": {"F", "V"},
    }.get(reference.get("type"), set()))
    available.update("feature:" + name for name in feature_names)
    available_types.update({"feature:" + name: "point" for name in feature_names})
    available_labels = {name: "point" for name in feature_names}
    for item in [*(reference.get("lines") or []), *result]:
        if item.get("label") and item.get("id") in available_types:
            available_labels[item["label"]] = available_types[item["id"]]
    # Reserved scene IDs and built-in feature/line labels must not be shadowed by restored user data.
    used_ids.update(available)
    used_labels.update(available_labels)

    ref_counts = {
        "point_on": 1,
        "line_angle": 1,
        "line": 2,
        "segment": 2,
        "ray": 2,
        "circle": 2,
        "midpoint": 2,
        "parallel": 2,
        "perpendicular": 2,
        "intersection": 2,
        "foot": 2,
        "distance": 2,
        "tangent": 2,
        "normal": 2,
    }
    native_kinds = {"point", "circle", "line", "slope", "vertical", "through_points", "conic", "function"}
    pending = []
    dropped = 0
    for original in candidate.get("objects") or []:
        if not isinstance(original, dict) or original.get("source") != "user":
            continue
        item = dict(original)
        item_id, label = item.get("id"), item.get("label")
        if item_id in used_ids or label and label in used_labels:
            dropped += 1
            continue
        if item.get("kind") == "construction":
            refs = item.get("refs")
            expected = ref_counts.get(item.get("op"))
            if expected is None or not isinstance(refs, list) or len(refs) != expected or not all(isinstance(ref, str) and ref for ref in refs):
                dropped += 1
                continue
        elif item.get("kind") not in native_kinds or item.get("refs") not in (None, []):
            dropped += 1
            continue
        elif item.get("kind") == "through_points":
            if not all(isinstance(item.get(key), str) and item.get(key) for key in ("a", "b")) or item["a"] == item["b"]:
                dropped += 1
                continue
        elif _native_manual_shape(item) is None:
            dropped += 1
            continue
        pending.append(item)

    while pending:
        accepted = False
        next_pending = []
        for item in pending:
            if item.get("id") in used_ids or item.get("label") and item.get("label") in used_labels:
                dropped += 1
                continue
            refs = item.get("refs") or []
            if item.get("kind") == "through_points":
                names = [item["a"], item["b"]]
                if not all(name in available_labels for name in names):
                    next_pending.append(item)
                    continue
                shape = "line" if all(available_labels[name] == "point" for name in names) else None
            elif not all(ref in available for ref in refs):
                next_pending.append(item)
                continue
            elif item.get("kind") == "construction":
                shape = _construction_shape(item, [available_types[ref] for ref in refs])
            else:
                shape = _native_manual_shape(item)
            if shape:
                result.append(item)
                if item.get("id"):
                    used_ids.add(item["id"])
                    available.add(item["id"])
                    available_types[item["id"]] = shape
                if item.get("label"):
                    used_labels.add(item["label"])
                    available_labels[item["label"]] = shape
                accepted = True
            else:
                dropped += 1
        if not accepted:
            dropped += len(next_pending)
            break
        pending = next_pending
    return result, dropped


def verify_ai_scene(result):
    scene = result.get("scene")
    if not scene:
        return attach_trust_report(result)
    normalise_scene_contract(scene)
    text = normalise(result["restatement"])
    narrative = result["restatement"] + "\n" + "\n".join(step for part in result.get("parts", []) for step in part.get("steps", []))
    for name in list(scene.get("points", {})):
        if name not in narrative:
            scene["points"].pop(name)
    for match in re.finditer(rf"(?<![a-z])([a-z])[(]{NUM},{NUM}[)]", text):
        scene.setdefault("points", {})[match.group(1).upper()] = [scalar(match.group(2)), scalar(match.group(3))]
    if re.search(r"o(?:为|是)原点", text):
        scene.setdefault("points", {})["O"] = [0, 0]
    focal_line = re.search(r"过(右焦点|左焦点|焦点|[a-z])(?:的)?(?:动)?直线([^。；]{0,100}?交[^,。；]{0,8}于)", text)
    if focal_line and not re.search(r"=[+-]?\d", focal_line.group(2)):
        through = focal_line.group(1)
        if through in {"右焦点", "左焦点", "焦点"} or through.upper() in scene.get("points", {}):
            scene["dynamicLine"] = True
            scene["dynamicLinePart"] = part_index_at(text, focal_line.start())
            scene["lineThrough"] = "focus1" if through == "左焦点" else "focus2" if "焦点" in through else "point:" + through.upper()
            if scene["type"] == "parabola" and through == "f":
                scene["lineThrough"] = "focus2"
                scene.setdefault("pointBindings", {})["F"] = True
    objects = scene.setdefault("objects", [])
    references = {name: "feature:" + name for name in scene.get("points", {})}
    references.update({obj["label"]: obj["id"] for obj in objects if obj.get("op") == "point_on"})
    if scene.get("dynamicLine"):
        references.update(A="feature:A", B="feature:B")
    existing = {tuple(sorted(obj.get("refs", []))) for obj in objects if obj.get("op") in {"line", "segment"}}
    for match in re.finditer(r"(?<![a-z])([a-z])([a-z])(?![a-z])", text):
        first, second = match.group(1).upper(), match.group(2).upper()
        if first == second or first not in references or second not in references:
            continue
        context = text[max(0, text.rfind("。", 0, match.start())):text.find("。", match.end()) if "。" in text[match.end():] else len(text)]
        if not any(word in context for word in ["直线", "线段", "连接", "连结", "斜率", "向量"]):
            continue
        refs = [references[first], references[second]]
        key = tuple(sorted(refs))
        if key in existing:
            continue
        existing.add(key)
        objects.append({"id": "ai-linked-" + str(len(objects)), "kind": "construction", "op": "line" if "斜率" in context or "直线" in context else "segment",
                        "refs": refs, "label": first + second, "part": part_index_at(text, match.start()), "visible": True})
    reference = standard_conic(result["restatement"])
    if not reference:
        return attach_trust_report(result)
    reference = decorate_scene(reference, text)
    fields = {"ellipse": ["a", "b"], "hyperbola": ["a", "b"], "circle": ["r"], "parabola": ["p", "direction"]}[reference["type"]]
    matches = scene["type"] == reference["type"] and scene.get("orientation", "horizontal") == reference.get("orientation", "horizontal")
    for field in ["h", "k", *fields]:
        matches = matches and field in scene and abs(float(sp.N(sp.Rational(str(scene[field])) - sp.Rational(str(reference.get(field, 0)))))) < 1e-3 * max(1, abs(reference.get(field, 0)))
    if matches:
        for field in ["h", "k", *fields]:
            scene[field] = reference.get(field, 0)
        for key in ("exact", "equation", "derivation", "inferred_from_conditions"):
            if key in reference:
                scene[key] = reference[key]
        if "inferred_from_conditions" in scene:
            scene["inferredFromConditions"] = bool(scene["inferred_from_conditions"])
        scene["points"] = reference.get("points", scene.get("points", {}))
        scene["pointBindings"] = reference.get("pointBindings", scene.get("pointBindings", {}))
        scene["lines"] = reference.get("lines", scene.get("lines", []))
        scene["objects"], dropped_manual = trusted_scene_objects(reference, scene)
        if dropped_manual:
            note = f"{dropped_manual} 个手动构造因依赖对象不存在或构造无效而未恢复。"
            result["scene_notice"] = (result.get("scene_notice", "") + " " + note).strip()
        scene["dynamicLine"] = reference.get("dynamicLine", False)
        scene["showDynamic"] = scene["dynamicLine"]
        result["verification"] = {"status": "verified-structure", "message": "主曲线、题设点线与绘图参数已由内置规则独立重算，并校正模型舍入。文字证明、范围和结论仍按逐问核验状态判断。"}
    else:
        # The deterministic parser can rebuild the main curve from the question.
        # Preserve only presentation metadata and explicit construction objects;
        # never keep conflicting AI curve parameters or guessed point coordinates.
        repaired = dict(reference)
        for key in ("showConic", "showFeatures", "title"):
            if key in scene:
                repaired[key] = scene[key]
        repaired["objects"], dropped_manual = trusted_scene_objects(reference, scene)
        normalise_scene_contract(repaired)
        result["scene"] = repaired
        result["scene_notice"] = "智能模型的绘图参数与题干冲突；画板已全部改用内置符号引擎重建的曲线、题设点线和动直线条件。"
        if dropped_manual:
            result["scene_notice"] += f" {dropped_manual} 个手动构造因依赖对象不存在或构造无效而未恢复。"
        result["verification"] = {"status": "verified-structure", "message": "冲突的智能绘图参数已丢弃；当前画板来自题干的确定性重建。文字证明仍需逐问核验。"}
    return attach_trust_report(result)


LEARNING = LearningEngine(ROOT, split_problem_parts, verify_ai_scene)
CLOUD_MODE = os.environ.get("DONGJIEXI_CLOUD", "").strip().lower() in {"1", "true", "yes"}
ALLOWED_ORIGINS = {item.strip().rstrip("/") for item in os.environ.get("DONGJIEXI_ALLOWED_ORIGINS", "").split(",") if item.strip()}
ACCESS_KEY = os.environ.get("DONGJIEXI_ACCESS_KEY", "").strip()
TRUST_PROXY = os.environ.get("DONGJIEXI_TRUST_PROXY", "").strip().lower() in {"1", "true", "yes"}
ALLOWED_MODELS = {item.strip() for item in os.environ.get("DONGJIEXI_ALLOWED_MODELS", os.environ.get("DONGJIEXI_MODEL_ID", "qwen3.5:4b")).split(",") if item.strip()}


def env_integer(name: str, default: int, low: int, high: int) -> int:
    try:
        return max(low, min(high, int(os.environ.get(name, str(default)))))
    except ValueError:
        return default


SESSION_TTL = env_integer("DONGJIEXI_SESSION_TTL", 7200, 300, 86400)
AUTH_ATTEMPTS = env_integer("DONGJIEXI_AUTH_ATTEMPTS_PER_MINUTE", 5, 1, 60)
JOBS_PER_WINDOW = env_integer("DONGJIEXI_JOBS_PER_10_MINUTES", 12, 1, 240)
RULES_PER_WINDOW = env_integer("DONGJIEXI_RULES_PER_MINUTE", 30, 1, 300)
POLLS_PER_MINUTE = env_integer("DONGJIEXI_POLLS_PER_MINUTE", 180, 10, 1200)
AUTH_LOCK = threading.RLock()
SESSIONS: dict[str, float] = {}
RATE_BUCKETS: dict[tuple[str, str], deque[float]] = defaultdict(deque)
JOB_OWNERS: dict[str, str] = {}


def rate_allowed(scope: str, identity: str, limit: int, window: int) -> tuple[bool, int]:
    now = time.monotonic()
    with AUTH_LOCK:
        bucket = RATE_BUCKETS[(scope, identity)]
        while bucket and bucket[0] <= now - window:
            bucket.popleft()
        if len(bucket) >= limit:
            return False, max(1, int(window - (now - bucket[0])))
        bucket.append(now)
        return True, 0


def session_identity(token: str) -> str | None:
    now = time.time()
    with AUTH_LOCK:
        expired = [value for value, deadline in SESSIONS.items() if deadline <= now]
        for value in expired:
            SESSIONS.pop(value, None)
        deadline = SESSIONS.get(token)
    return hashlib.sha256(token.encode()).hexdigest() if deadline and deadline > now else None


class AppHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DIST), **kwargs)

    def end_headers(self):
        route = self.path.split("?", 1)[0]
        origin = self.headers.get("Origin", "").rstrip("/")
        if origin and self.origin_allowed(origin):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        if route.startswith("/api/") or route in {"/runtime-config.js", "/app-version.json", "/service-worker.js"}:
            self.send_header("Cache-Control", "no-store")
        elif "/vendor/" in route:
            self.send_header("Cache-Control", "public, max-age=31536000, immutable")
        else:
            self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "same-origin")
        super().end_headers()

    def origin_allowed(self, origin: str) -> bool:
        try:
            return urlparse(origin).netloc == self.headers.get("Host", "") or origin.rstrip("/") in ALLOWED_ORIGINS
        except ValueError:
            return False

    def client_key(self) -> str:
        if TRUST_PROXY:
            forwarded = self.headers.get("X-Forwarded-For", "").split(",", 1)[0].strip()
            if forwarded:
                return forwarded[:80]
        return str(self.client_address[0])[:80]

    def bearer_identity(self) -> str | None:
        authorization = self.headers.get("Authorization", "")
        if not authorization.startswith("Bearer "):
            return None
        return session_identity(authorization[7:].strip())

    def require_cloud_auth(self) -> str | None:
        if not CLOUD_MODE:
            return "desktop"
        if not ACCESS_KEY:
            self.json_response({"error": "在线解题服务尚未配置访问认证，已拒绝公开调用。"}, 503)
            return None
        identity = self.bearer_identity()
        if not identity:
            self.json_response({"error": "在线解题授权已失效，请重新输入访问口令。"}, 401)
            return None
        return identity

    def do_OPTIONS(self):
        origin = self.headers.get("Origin", "").rstrip("/")
        if not origin or not self.origin_allowed(origin):
            self.send_response(403); self.end_headers(); return
        self.send_response(204)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Access-Control-Max-Age", "600")
        self.end_headers()

    def json_response(self, value: dict, status: int = 200, headers: dict[str, str] | None = None):
        data = json.dumps(value, ensure_ascii=False).encode("utf-8")
        self.send_response(status); self.send_header("Content-Type", "application/json; charset=utf-8")
        if status == 401:
            self.send_header("WWW-Authenticate", 'Bearer realm="dongjiexi"')
        for name, content in (headers or {}).items():
            self.send_header(name, content)
        self.send_header("Content-Length", str(len(data))); self.end_headers(); self.wfile.write(data)

    def do_GET(self):
        route = self.path.split("?", 1)[0]
        if route == "/runtime-config.js":
            config = load_config()
            payload = {"version": config["version"], "deployment": "web" if CLOUD_MODE else "desktop",
                       "apiBase": "", "apiEnabled": not CLOUD_MODE or bool(ACCESS_KEY),
                       "requiresAuth": CLOUD_MODE, "updateChannel": "stable"}
            data = ("window.DONGJIEXI_CONFIG = Object.freeze(" + json.dumps(payload, ensure_ascii=False) + ");\n").encode("utf-8")
            self.send_response(200); self.send_header("Content-Type", "application/javascript; charset=utf-8")
            self.send_header("Content-Length", str(len(data))); self.end_headers(); self.wfile.write(data); return
        if route == "/api/health":
            identity = self.bearer_identity()
            if CLOUD_MODE and not identity:
                health = {"available": False, "models": [], "installed": True, "remote": True}
            else:
                health = LEARNING.health()
                if CLOUD_MODE:
                    health["models"] = [name for name in health.get("models", []) if name in ALLOWED_MODELS]
            config = load_config()
            self.json_response({"app": config["name"], "version": config["version"], "engine": health,
                                "deployment": "cloud" if CLOUD_MODE else "desktop",
                                "auth_required": CLOUD_MODE, "auth_configured": bool(ACCESS_KEY),
                                "default_model": config["default_model"], "update_channel_configured": bool(config.get("update_channel"))})
            return
        if self.path.startswith("/api/jobs/"):
            identity = self.require_cloud_auth()
            if identity is None:
                return
            allowed, retry = rate_allowed("poll", identity, POLLS_PER_MINUTE, 60)
            if not allowed:
                self.json_response({"error": "查询过于频繁，请稍后重试。"}, 429, {"Retry-After": str(retry)}); return
            identifier = self.path.split("?", 1)[0].rsplit("/", 1)[-1]
            if CLOUD_MODE and JOB_OWNERS.get(identifier) != identity:
                self.json_response({"error": "任务不存在或已过期。"}, 404); return
            job = LEARNING.snapshot(identifier)
            if not job:
                with AUTH_LOCK:
                    JOB_OWNERS.pop(identifier, None)
            self.json_response(job or {"error": "任务不存在或已过期。"}, 200 if job else 404)
            return
        return super().do_GET()

    def do_POST(self):
        route = self.path.split("?", 1)[0]
        if route not in {"/api/session", "/api/solve", "/api/jobs", "/api/ai/start"} and not (route.startswith("/api/jobs/") and route.endswith("/cancel")):
            self.json_response({"error": "Not found"}, 404); return
        try:
            origin = self.headers.get("Origin", "").rstrip("/")
            if origin and not self.origin_allowed(origin):
                self.json_response({"error": "请从董解析页面发起请求。"}, 403); return
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > 13 * 1024 * 1024:
                raise ValueError("请求为空或过大。图片请控制在 8 MB 以内。")
            body = json.loads(self.rfile.read(length).decode("utf-8"))
            if not isinstance(body, dict):
                raise ValueError("请求格式无效。")
            if route == "/api/session":
                if not CLOUD_MODE:
                    self.json_response({"error": "桌面版不需要在线授权。"}, 404); return
                if not ACCESS_KEY:
                    self.json_response({"error": "在线解题服务尚未配置访问认证。"}, 503); return
                allowed, retry = rate_allowed("auth", self.client_key(), AUTH_ATTEMPTS, 60)
                if not allowed:
                    self.json_response({"error": "口令尝试过于频繁，请稍后再试。"}, 429, {"Retry-After": str(retry)}); return
                supplied = str(body.get("access_key", ""))
                if not supplied or not hmac.compare_digest(supplied, ACCESS_KEY):
                    self.json_response({"error": "访问口令不正确。"}, 401); return
                token = secrets.token_urlsafe(32)
                with AUTH_LOCK:
                    SESSIONS[token] = time.time() + SESSION_TTL
                self.json_response({"token": token, "expires_in": SESSION_TTL}); return
            identity = self.require_cloud_auth()
            if identity is None:
                return
            if route == "/api/ai/start":
                if CLOUD_MODE:
                    self.json_response({"error": "在线模型只能由服务管理员启动。"}, 403); return
                self.json_response(LEARNING.start()); return
            if route.startswith("/api/jobs/") and route.endswith("/cancel"):
                identifier = route.split("/")[-2]
                if CLOUD_MODE and JOB_OWNERS.get(identifier) != identity:
                    self.json_response({"error": "任务不存在或已过期。"}, 404); return
                job = LEARNING.cancel(identifier)
                self.json_response(job or {"error": "任务不存在。"}, 200 if job else 404); return
            if route == "/api/jobs":
                allowed, retry = rate_allowed("jobs", identity, JOBS_PER_WINDOW, 600)
                if not allowed:
                    self.json_response({"error": "解题请求已达到本时段上限，请稍后再试。"}, 429, {"Retry-After": str(retry)}); return
                if CLOUD_MODE and str(body.get("model", "")) not in ALLOWED_MODELS:
                    self.json_response({"error": "所选模型不在在线服务允许列表中。"}, 400); return
                if body.get("kind") == "pull" and self.client_address[0] not in {"127.0.0.1", "::1"}:
                    self.json_response({"error": "请在主机电脑上下载模型。"}, 403); return
                try:
                    job = LEARNING.submit(body)
                except EngineBusy as error:
                    self.json_response({"error": str(error)}, 429, {"Retry-After": "10"}); return
                if CLOUD_MODE:
                    with AUTH_LOCK:
                        JOB_OWNERS[job["id"]] = identity
                self.json_response(job, 202); return
            allowed, retry = rate_allowed("rules", identity, RULES_PER_WINDOW, 60)
            if not allowed:
                self.json_response({"error": "快速建图请求过于频繁，请稍后再试。"}, 429, {"Retry-After": str(retry)}); return
            text = str(body.get("text", "")).strip(); image = body.get("image")
            if len(text) > 18000:
                raise ValueError("题目文字请控制在 18000 字以内。")
            if not text and not image: raise ValueError("请填写题目或上传题图。")
            if not body.get("rules_only"):
                self.json_response({"error": "请使用新版 AI 解答整题入口；AI 解题不会自动退回快速建图。"}, 409); return
            result = fallback_solution(text)
            self.json_response(result)
        except (ValueError, json.JSONDecodeError) as exc:
            self.json_response({"error": str(exc)}, 400)
        except Exception:  # never expose local paths, model internals, or stack details to the browser
            self.json_response({"error": "本机模型未返回有效结构化结果。请重试或检查模型是否支持 JSON 输出。"}, 502)

    def log_message(self, fmt, *args):
        print("[董解析] " + fmt % args)


def main():
    parser = argparse.ArgumentParser(); parser.add_argument("--lan", action="store_true", help="允许局域网手机访问")
    parser.add_argument("--open", action="store_true", help="服务就绪后打开画板")
    parser.add_argument("--host", help="监听地址；云端部署通常使用 0.0.0.0")
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", "8765"))); args = parser.parse_args()
    host = args.host or ("0.0.0.0" if args.lan or CLOUD_MODE else "127.0.0.1")
    try:
        server = ThreadingHTTPServer((host, args.port), AppHandler)
    except OSError:
        if args.open:
            try:
                with urllib.request.urlopen(f"http://127.0.0.1:{args.port}/api/health", timeout=4) as response:
                    running = json.loads(response.read())
                if running.get("app") in {"董解析", "智几何"}:
                    print("董解析已经在运行，已打开现有画板。")
                    webbrowser.open(f"http://127.0.0.1:{args.port}")
                    return
            except (OSError, ValueError):
                pass
        raise
    if args.lan:
        try:
            probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            probe.connect(("10.255.255.255", 1)); ip = probe.getsockname()[0]; probe.close()
        except OSError:
            ip = socket.gethostbyname(socket.gethostname())
        shown = f"http://{ip}"
    else:
        shown = "http://localhost"
    print(f"董解析已启动：{shown}:{args.port}  （按 Ctrl+C 停止）")
    if args.open:
        webbrowser.open(f"http://127.0.0.1:{args.port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("董解析已停止。")
    finally:
        server.server_close()
        LEARNING.close()


if __name__ == "__main__":
    main()
