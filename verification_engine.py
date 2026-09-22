from __future__ import annotations

"""Deterministic trust layer for Dongjiexi solutions.

This module deliberately verifies only claims that can be recomputed from the
structured scene.  It never turns a fluent model answer into a "verified"
answer merely because text and steps are present.
"""

import copy
from decimal import Decimal
import math
import re
from typing import Any

import sympy as sp


UNCERTAINTY_RE = re.compile(r"\[(?:看不清|模糊|无法辨认|不确定)[^\]]*\]|(?:看不清|无法辨认)处|[?？]{3,}", re.I)

GOALS = [
    ("fixed_point", ("定点",)),
    ("fixed_value", ("定值", "恒为")),
    ("range", ("取值范围", "范围")),
    ("maximum", ("最大值", "最小值", "最值")),
    ("tangent", ("相切", "切线")),
    ("normal", ("法线",)),
    ("perpendicular_foot", ("垂足",)),
    ("intersection", ("交点", "交于")),
    ("length", ("弦长", "长度", "距离")),
    ("area", ("面积",)),
    ("locus", ("轨迹",)),
    ("standard_equation", ("标准方程", "方程")),
    ("proof", ("证明", "求证")),
]

OBLIGATIONS = {
    "standard_equation": ["由题设条件唯一确定曲线参数", "把题设点和焦点条件代回检查"],
    "fixed_point": ["消去动参数得到候选定点", "检查所有合法位置及退化情形"],
    "fixed_value": ["把目标量化为参数表达式", "证明表达式与参数无关并检查定义域"],
    "range": ["写出参数定义域", "检查开闭端点、等号条件和斜率不存在情形"],
    "maximum": ["写出参数定义域", "验证驻点、端点和等号能否取得"],
    "tangent": ["联立后检查真正二次重根或梯度条件", "联立降为一次时不能仅凭一个交点判相切"],
    "normal": ["法线经过曲线上给定点", "法线方向与该点梯度平行，因此与切线垂直"],
    "perpendicular_foot": ["垂足位于目标直线上", "源点到垂足的向量与目标直线方向垂直"],
    "intersection": ["联立曲线与直线", "逐个交点代回两条方程"],
    "length": ["核对两端点与定义域", "用距离公式或弦长公式独立复算"],
    "area": ["核对顶点/底高定义", "检查参数范围和等号条件"],
    "locus": ["证明必要性", "回代证明充分性并排除增根"],
    "proof": ["逐步列出可复核等式", "检查充分必要性和特殊情形"],
    "other": ["当前规则无法完整验证该问，需人工复核证明"],
}


def has_uncertainty(text: str) -> bool:
    return bool(UNCERTAINTY_RE.search(str(text or "")))


def uncertainty_tokens(text: str) -> list[str]:
    return list(dict.fromkeys(match.group(0) for match in UNCERTAINTY_RE.finditer(str(text or ""))))


def classify_goal(text: str) -> str:
    compact = re.sub(r"\s+", "", str(text or "")).lower()
    # Prefer an explicit requested standard equation over data mentioned in
    # the preamble (for example "已知离心率为 1/2，求标准方程").
    if "标准方程" in compact or re.search(r"(?:求|写出|确定|建立)[^。；]{0,35}(?<!准线)(?<!渐近线)(?<!切线)(?<!法线)方程", compact):
        return "standard_equation"
    for name, words in GOALS:
        if any(word in compact for word in words):
            return name
    return "other"


def _q(value: Any) -> sp.Expr:
    if isinstance(value, bool):
        raise ValueError("boolean is not a coordinate")
    if isinstance(value, sp.Basic):
        return value
    if isinstance(value, int):
        return sp.Integer(value)
    if isinstance(value, (float, Decimal)):
        if isinstance(value, float) and not math.isfinite(value):
            raise ValueError("coordinate must be finite")
        return sp.Rational(str(value))
    if isinstance(value, str):
        token = value.strip()
        if not token:
            raise ValueError("coordinate is empty")
        try:
            return sp.Rational(token)
        except (TypeError, ValueError):
            try:
                parsed = sp.Float(token, 80)
            except (TypeError, ValueError) as error:
                raise ValueError("coordinate is not a real number") from error
            if parsed.is_finite is False:
                raise ValueError("coordinate must be finite")
            return parsed
    raise ValueError("unsupported coordinate type")


def conic_expression(scene: dict) -> tuple[sp.Symbol, sp.Symbol, sp.Expr]:
    x, y = sp.symbols("x y", real=True)
    kind = scene.get("type")
    h, k = _q(scene.get("h", 0)), _q(scene.get("k", 0))
    vertical = scene.get("orientation") == "vertical"
    exact = scene.get("exact") if isinstance(scene.get("exact"), dict) else {}
    def exact_or_square(key: str, parameter: str) -> sp.Expr:
        return _q(exact[key]) if exact.get(key) is not None else _q(scene[parameter]) ** 2
    if kind == "ellipse":
        a2, b2 = exact_or_square("a2", "a"), exact_or_square("b2", "b")
        dx, dy = (b2, a2) if vertical else (a2, b2)
        expr = (x - h) ** 2 / dx + (y - k) ** 2 / dy - 1
    elif kind == "hyperbola":
        a2, b2 = exact_or_square("a2", "a"), exact_or_square("b2", "b")
        expr = (y - k) ** 2 / a2 - (x - h) ** 2 / b2 - 1 if vertical else (x - h) ** 2 / a2 - (y - k) ** 2 / b2 - 1
    elif kind == "circle":
        expr = (x - h) ** 2 + (y - k) ** 2 - exact_or_square("r2", "r")
    elif kind == "parabola":
        p = _q(exact["p"]) if exact.get("p") is not None else _q(scene["p"])
        q = 4 * p * (-1 if scene.get("direction") == -1 else 1)
        expr = (x - h) ** 2 - q * (y - k) if vertical else (y - k) ** 2 - q * (x - h)
    else:
        raise ValueError("unsupported conic")
    return x, y, sp.factor(expr)


def _feature_point(scene: dict, reference: str) -> tuple[sp.Expr, sp.Expr] | None:
    name = str(reference or "").removeprefix("feature:")
    point = (scene.get("points") or {}).get(name)
    if isinstance(point, (list, tuple)) and len(point) == 2:
        return _q(point[0]), _q(point[1])
    h, k, kind = _q(scene.get("h", 0)), _q(scene.get("k", 0)), scene.get("type")
    vertical = scene.get("orientation") == "vertical"
    exact = scene.get("exact") if isinstance(scene.get("exact"), dict) else {}
    if name in {"O", "V"}:
        return h, k
    if kind in {"ellipse", "hyperbola"} and name in {"F₁", "F1", "F₂", "F2"}:
        a2 = _q(exact["a2"]) if exact.get("a2") is not None else _q(scene["a"])**2
        b2 = _q(exact["b2"]) if exact.get("b2") is not None else _q(scene["b"])**2
        distance = sp.sqrt(a2-b2 if kind == "ellipse" else a2+b2)
        sign = -1 if name in {"F₁", "F1"} else 1
        return (h, k+sign*distance) if vertical else (h+sign*distance, k)
    if kind == "parabola" and name == "F":
        p = _q(exact["p"]) if exact.get("p") is not None else _q(scene["p"])
        distance = p * (-1 if scene.get("direction") == -1 else 1)
        return (h, k+distance) if vertical else (h+distance, k)
    return None


def _proportional_polynomials(left: sp.Expr, right: sp.Expr, x: sp.Symbol, y: sp.Symbol) -> bool:
    try:
        first, second = sp.Poly(sp.together(left), x, y), sp.Poly(sp.together(right), x, y)
    except sp.PolynomialError:
        return False
    monomials = set(first.monoms()) | set(second.monoms())
    pairs = [(first.coeff_monomial(term), second.coeff_monomial(term)) for term in monomials]
    anchor = next(((a, b) for a, b in pairs if a != 0 and b != 0), None)
    if not anchor:
        return False
    a0, b0 = anchor
    return all(_sign(sp.simplify(a*b0-b*a0)) == 0 for a, b in pairs)


def _sign(value: sp.Expr) -> int | None:
    value = sp.simplify(value)
    if value.is_positive:
        return 1
    if value.is_negative:
        return -1
    if value.is_zero:
        return 0
    try:
        evaluated = sp.N(value, 80)
        if evaluated.is_real is False:
            return None
        numeric = float(evaluated)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(numeric):
        return None
    try:
        expanded = sp.expand(value)
        scale = max(1.0, sum(abs(float(sp.N(term, 80))) for term in sp.Add.make_args(expanded)))
    except (TypeError, ValueError, OverflowError):
        scale = 1.0
    if abs(numeric) <= 1e-12 * scale:
        return 0
    return 1 if numeric > 0 else -1


def _line_parameter(line: dict, scene: dict, x: sp.Symbol, y: sp.Symbol) -> tuple[sp.Symbol, sp.Expr, sp.Expr, str] | None:
    t = sp.symbols("t", real=True)
    kind = line.get("kind")
    exact = line.get("exact") if isinstance(line.get("exact"), dict) else {}
    if all(exact.get(key) is not None for key in ("A", "B", "C")):
        coefficients = _line_coefficients(line, scene)
        if not coefficients:
            return None
        a, b, c = coefficients
        if b != 0:
            return t, t, -a*t/b-c/b, line.get("equation", "精确推导直线")
        if a != 0:
            return t, -c/a, t, line.get("equation", "精确推导直线")
    if kind in {"slope", "line"} and line.get("m") is not None:
        m, b = _q(line["m"]), _q(line.get("b", 0))
        return t, t, m * t + b, f"y={sp.sstr(m)}x+{sp.sstr(b)}"
    if kind in {"vertical", "line"} and line.get("x") is not None:
        c = _q(line["x"])
        return t, c, t, f"x={sp.sstr(c)}"
    if kind == "through_points":
        points = scene.get("points") or {}
        first, second = points.get(line.get("a")), points.get(line.get("b"))
        if not (isinstance(first, (list, tuple)) and isinstance(second, (list, tuple)) and len(first) == len(second) == 2):
            return None
        x1, y1, x2, y2 = _q(first[0]), _q(first[1]), _q(second[0]), _q(second[1])
        if sp.simplify((x2 - x1) ** 2 + (y2 - y1) ** 2) == 0:
            return None
        return t, x1 + t * (x2 - x1), y1 + t * (y2 - y1), f"{line.get('a')}{line.get('b')}"
    return None


def _valid_line_coefficients(coefficients: tuple[sp.Expr, sp.Expr, sp.Expr]) -> bool:
    a, b, _ = coefficients
    if a == 0 and b == 0:
        return False
    for value in coefficients:
        if value.is_real is False or value.is_finite is False:
            return False
        try:
            if not math.isfinite(float(sp.N(value, 80))):
                return False
        except (TypeError, ValueError, OverflowError):
            return False
    return True


def _line_coefficients(line: dict, scene: dict) -> tuple[sp.Expr, sp.Expr, sp.Expr] | None:
    exact = line.get("exact") if isinstance(line.get("exact"), dict) else {}
    if all(exact.get(key) is not None for key in ("A", "B", "C")):
        try:
            values = tuple(_q(exact[key]) for key in ("A", "B", "C"))
        except (TypeError, ValueError, ZeroDivisionError):
            return None
        return values if _valid_line_coefficients(values) else None
    if line.get("m") is not None:
        try:
            values = (_q(line["m"]), sp.Integer(-1), _q(line.get("b", 0)))
        except (TypeError, ValueError, ZeroDivisionError):
            return None
        return values if _valid_line_coefficients(values) else None
    if line.get("x") is not None:
        try:
            values = (sp.Integer(1), sp.Integer(0), -_q(line["x"]))
        except (TypeError, ValueError, ZeroDivisionError):
            return None
        return values if _valid_line_coefficients(values) else None
    if line.get("kind") == "through_points":
        points = scene.get("points") or {}
        first, second = points.get(line.get("a")), points.get(line.get("b"))
        if isinstance(first, (list, tuple)) and isinstance(second, (list, tuple)) and len(first) == len(second) == 2:
            try:
                x1, y1, x2, y2 = _q(first[0]), _q(first[1]), _q(second[0]), _q(second[1])
            except (TypeError, ValueError, ZeroDivisionError):
                return None
            if x1 != x2 or y1 != y2:
                values = (y1-y2, x2-x1, x1*y2-x2*y1)
                return values if _valid_line_coefficients(values) else None
    return None


def _check(identifier: str, label: str, status: str, detail: str, *, formula: str = "", part: int | None = None, category: str = "algebra") -> dict:
    item = {"id": identifier, "label": label, "status": status, "detail": detail, "category": category}
    if formula:
        item["formula"] = formula
    if isinstance(part, int):
        item["part"] = part
    return item


def _scene_checks(scene: dict, text: str, model_parts: list[dict] | None = None) -> list[dict]:
    checks: list[dict] = []
    goal_by_part = {
        item.get("index"): item.get("goal")
        for item in (model_parts or [])
        if isinstance(item.get("index"), int)
    }
    overall_goal = classify_goal(text)
    try:
        x, y, conic = conic_expression(scene)
    except (KeyError, TypeError, ValueError, ZeroDivisionError) as error:
        return [_check("curve-structure", "主曲线参数", "contradicted", f"曲线参数无法组成有效方程：{error}")]

    kind = scene.get("type")
    exact = scene.get("exact") if isinstance(scene.get("exact"), dict) else {}
    valid = True
    if kind == "ellipse":
        if exact.get("a2") is not None and exact.get("b2") is not None:
            a2, b2 = _q(exact["a2"]), _q(exact["b2"])
            valid = _sign(a2-b2) == 1 and _sign(b2) == 1
        else:
            valid = _sign(_q(scene.get("a", 0)) - _q(scene.get("b", 0))) == 1 and _sign(_q(scene.get("b", 0))) == 1
    elif kind == "hyperbola":
        if exact.get("a2") is not None and exact.get("b2") is not None:
            valid = _sign(_q(exact["a2"])) == 1 and _sign(_q(exact["b2"])) == 1
        else:
            valid = _sign(_q(scene.get("a", 0))) == 1 and _sign(_q(scene.get("b", 0))) == 1
    elif kind == "circle":
        valid = _sign(_q(exact["r2"])) == 1 if exact.get("r2") is not None else _sign(_q(scene.get("r", 0))) == 1
    elif kind == "parabola":
        valid = _sign(_q(exact["p"])) == 1 if exact.get("p") is not None else _sign(_q(scene.get("p", 0))) == 1
    checks.append(_check("curve-structure", "主曲线参数", "verified" if valid else "contradicted",
                         "参数满足该圆锥曲线的基本定义。" if valid else "参数不满足曲线定义。",
                         formula=sp.sstr(conic), category="curve"))

    compact = re.sub(r"\s+", "", text).lower().replace("（", "(").replace("）", ")")
    for name, coords in (scene.get("points") or {}).items():
        if not (isinstance(coords, (list, tuple)) and len(coords) == 2):
            continue
        label = str(name).lower()
        on_curve = bool(re.search(rf"(?:椭圆|双曲线|抛物线|圆|曲线)[^。；]{{0,30}}(?:过|经过)点?{re.escape(label)}(?:\(|$)", compact) or
                        re.search(rf"点?{re.escape(label)}(?:\([^)]*\))?[^。；]{{0,30}}(?:在|属于)(?:椭圆|双曲线|抛物线|圆|曲线)[^。；]*上", compact))
        if not on_curve:
            continue
        value = sp.simplify(conic.subs({x: _q(coords[0]), y: _q(coords[1])}))
        try:
            # Scene parameters are JSON decimals; sqrt(3), for example, cannot be
            # represented exactly. Treat only a tiny numerical residue as zero,
            # while keeping visible point/curve disagreements as hard conflicts.
            numerical_zero = abs(float(sp.N(value, 80))) <= 1e-10
        except (TypeError, ValueError, OverflowError):
            numerical_zero = False
        ok = _sign(value) == 0 or numerical_zero
        checks.append(_check(f"point-{name}", f"点 {name} 在曲线上", "verified" if ok else "contradicted",
                             "代入曲线方程后等式成立。" if ok else f"代入后左端为 {sp.sstr(value)}，并不在曲线上。",
                             formula=f"F({coords[0]},{coords[1]})={sp.sstr(value)}", category="point"))

    line_by_id = {line.get("id"): line for line in (scene.get("lines") or []) if line.get("id")}
    object_by_id = {item.get("id"): item for item in (scene.get("objects") or []) if item.get("id")}

    def exact_point(item: dict | None) -> tuple[sp.Expr, sp.Expr] | None:
        exact_point_data = item.get("exact") if isinstance(item, dict) and isinstance(item.get("exact"), dict) else {}
        if exact_point_data.get("x") is None or exact_point_data.get("y") is None:
            return None
        try:
            return _q(exact_point_data["x"]), _q(exact_point_data["y"])
        except (TypeError, ValueError, ZeroDivisionError):
            return None

    def point_from_reference(reference: str | None) -> tuple[sp.Expr, sp.Expr] | None:
        if not reference:
            return None
        if str(reference).startswith("feature:"):
            return _feature_point(scene, str(reference))
        return exact_point(object_by_id.get(reference))

    def valid_derived_intersection(item: dict | None) -> bool:
        if not isinstance(item, dict) or item.get("role") != "line_conic_intersection":
            return False
        construction = item.get("construction") if isinstance(item.get("construction"), dict) else {}
        inputs = construction.get("inputs") if isinstance(construction.get("inputs"), dict) else {}
        refs = item.get("refs") if isinstance(item.get("refs"), list) else []
        branch = item.get("branch")
        line_id = inputs.get("line")
        target_line = line_by_id.get(line_id)
        point = exact_point(item)
        if not (point and target_line and construction.get("schema") == "dongjiexi-construction/v1" and
                construction.get("type") == "line_conic_intersection" and refs == [line_id, "$conic"] and
                inputs.get("curve") == "$conic" and inputs.get("branch") == branch and isinstance(branch, int)):
            return False
        parameter = _line_parameter(target_line, scene, x, y)
        coefficients = _line_coefficients(target_line, scene)
        if not (parameter and coefficients):
            return False
        t0, tx, ty, _ = parameter
        try:
            roots = [root for root in sp.solve(sp.factor(conic.subs({x: tx, y: ty})), t0) if root.is_real is not False]
            roots.sort(key=lambda root: float(sp.N(root, 50)))
        except (TypeError, ValueError, OverflowError):
            return False
        if not 0 <= branch < len(roots):
            return False
        px0, py0 = point
        a0, b0, c0 = coefficients
        expected = (sp.simplify(tx.subs(t0, roots[branch])), sp.simplify(ty.subs(t0, roots[branch])))
        residuals = [conic.subs({x: px0, y: py0}), a0*px0+b0*py0+c0,
                     px0-expected[0], py0-expected[1]]
        return all(_sign(sp.simplify(value)) == 0 for value in residuals)

    focus_chord = scene.get("focusChord") if isinstance(scene.get("focusChord"), dict) else None
    focus_chord_base_valid = False
    dynamic_tangent_validity: dict[str, bool] = {}
    if focus_chord and focus_chord.get("schema") == "dongjiexi-focus-chord/v1" and kind == "parabola":
        source = focus_chord.get("source")
        endpoints = focus_chord.get("endpoints") if isinstance(focus_chord.get("endpoints"), list) else []
        source_point = (scene.get("points") or {}).get(source)
        try:
            p0 = _q((scene.get("exact") or {}).get("p", scene.get("p")))
            h0, k0 = _q(scene.get("h", 0)), _q(scene.get("k", 0))
            direction0 = -1 if scene.get("direction") == -1 else 1
            vertical0 = scene.get("orientation") == "vertical"
            expected_focus = (h0, k0+direction0*p0) if vertical0 else (h0+direction0*p0, k0)
            focus_chord_base_valid = (
                len(endpoints) == 2 and endpoints[0] != endpoints[1]
                and isinstance(source_point, (list, tuple)) and len(source_point) == 2
                and all(_sign(_q(value)-expected) == 0 for value, expected in zip(source_point, expected_focus))
                and scene.get("dynamicLine") is True and scene.get("dynamicLinePart") is None
                and scene.get("lineThrough") == f"point:{source}"
                and focus_chord.get("exact", {}).get("parameterProduct") == "-1"
            )
        except (TypeError, ValueError, ZeroDivisionError):
            focus_chord_base_valid = False
        tangent_ids = focus_chord.get("tangents") if isinstance(focus_chord.get("tangents"), list) else []
        for name, tangent_id in zip(endpoints, tangent_ids):
            tangent_line = line_by_id.get(tangent_id)
            construction = tangent_line.get("construction") if isinstance(tangent_line, dict) and isinstance(tangent_line.get("construction"), dict) else {}
            inputs = construction.get("inputs") if isinstance(construction.get("inputs"), dict) else {}
            valid = bool(
                focus_chord_base_valid and tangent_line
                and tangent_line.get("kind") == "construction" and tangent_line.get("op") == "tangent"
                and tangent_line.get("role") == "dynamic_tangent" and tangent_line.get("point") == name
                and tangent_line.get("pointRef") == f"feature:{name}"
                and tangent_line.get("refs") == [f"feature:{name}", "$conic"]
                and construction.get("schema") == "dongjiexi-construction/v1"
                and construction.get("type") == "dynamic_tangent_at"
                and inputs.get("curve") == "$conic" and inputs.get("point") == name
                and inputs.get("point_ref") == f"feature:{name}"
                and inputs.get("line") == "$dynamic"
            )
            dynamic_tangent_validity[tangent_id] = valid

        parts_meta = focus_chord.get("parts") if isinstance(focus_chord.get("parts"), dict) else {}
        q_object = object_by_id.get(focus_chord.get("intersection"))
        q_locus = line_by_id.get(focus_chord.get("qLocus"))
        q_coefficients = _line_coefficients(q_locus, scene) if q_locus else None
        expected_directrix = (k0 if vertical0 else h0)-direction0*p0 if focus_chord_base_valid else None
        expected_q_coefficients = ((0, 1, -expected_directrix) if vertical0 else (1, 0, -expected_directrix)) if expected_directrix is not None else None
        q_construction = q_locus.get("construction") if isinstance(q_locus, dict) and isinstance(q_locus.get("construction"), dict) else {}
        q_inputs = q_construction.get("inputs") if isinstance(q_construction.get("inputs"), dict) else {}
        q_valid = bool(
            focus_chord_base_valid and len(tangent_ids) == 2 and all(dynamic_tangent_validity.get(item) for item in tangent_ids)
            and q_object and q_object.get("kind") == "construction" and q_object.get("op") == "intersection"
            and q_object.get("refs") == tangent_ids and q_object.get("label") == focus_chord.get("q")
            and q_locus and q_locus.get("role") == "derived_locus"
            and q_construction.get("schema") == "dongjiexi-construction/v1"
            and q_construction.get("type") == "focus_chord_tangent_intersection_locus"
            and q_inputs.get("curve") == "$conic" and q_inputs.get("focus") == f"feature:{source}"
            and q_inputs.get("tangents") == tangent_ids
            and q_coefficients and expected_q_coefficients
            and all(_sign(sp.simplify(value-expected)) == 0 for value, expected in zip(q_coefficients, expected_q_coefficients))
        )
        q_part = parts_meta.get("q_locus")
        if isinstance(q_part, int):
            checks.append(_check("focus-chord-q-locus", f"点 {focus_chord.get('q', 'Q')} 的轨迹",
                                 "verified" if q_valid else "contradicted",
                                 "切线交点随动弦变化并精确落在原抛物线准线上。" if q_valid else "切线交点、动态切线引用或准线轨迹契约不一致。",
                                 formula=f"{'y' if vertical0 else 'x'}={sp.sstr(expected_directrix)}" if expected_directrix is not None else "",
                                 part=q_part, category="construction"))

        midpoint = object_by_id.get(focus_chord.get("midpoint"))
        m_locus = object_by_id.get(focus_chord.get("mLocus"))
        m_exact = m_locus.get("exact") if isinstance(m_locus, dict) and isinstance(m_locus.get("exact"), dict) else {}
        m_construction = m_locus.get("construction") if isinstance(m_locus, dict) and isinstance(m_locus.get("construction"), dict) else {}
        m_inputs = m_construction.get("inputs") if isinstance(m_construction.get("inputs"), dict) else {}
        try:
            m_valid = bool(
                focus_chord_base_valid and midpoint and midpoint.get("op") == "midpoint"
                and midpoint.get("role") == "dynamic_chord_midpoint"
                and midpoint.get("refs") == [f"feature:{endpoints[0]}", f"feature:{endpoints[1]}"]
                and midpoint.get("label") == focus_chord.get("m")
                and m_locus and m_locus.get("role") == "derived_locus" and m_locus.get("conicType") == "parabola"
                and m_construction.get("schema") == "dongjiexi-construction/v1"
                and m_construction.get("type") == "focus_chord_midpoint_locus"
                and m_inputs.get("midpoint") == focus_chord.get("midpoint")
                and m_inputs.get("line") == "$dynamic" and m_inputs.get("curve") == "$conic"
                and m_inputs.get("focus") == f"feature:{source}"
                and _sign(_q(m_locus.get("p"))-p0/2) == 0
                and _sign(_q(m_locus.get("h"))-expected_focus[0]) == 0
                and _sign(_q(m_locus.get("k"))-expected_focus[1]) == 0
                and (-1 if m_locus.get("direction") == -1 else 1) == direction0
                and _sign(_q(m_exact.get("p"))-p0/2) == 0
                and _sign(_q(m_exact.get("h"))-expected_focus[0]) == 0
                and _sign(_q(m_exact.get("k"))-expected_focus[1]) == 0
            )
        except (TypeError, ValueError, ZeroDivisionError):
            m_valid = False
        m_part = parts_meta.get("m_locus")
        if isinstance(m_part, int):
            checks.append(_check("focus-chord-m-locus", f"点 {focus_chord.get('m', 'M')} 的轨迹",
                                 "verified" if m_valid else "contradicted",
                                 "弦中点依赖 A、B，韦达消元结果与画板轨迹参数一致。" if m_valid else "弦中点引用或轨迹参数与焦点弦消元结果不一致。",
                                 formula=sp.sstr(m_locus.get("equation", "")) if isinstance(m_locus, dict) else "",
                                 part=m_part, category="construction"))
        area_part = parts_meta.get("area")
        if isinstance(area_part, int):
            checks.append(_check("focus-chord-area", "△PAB 面积", "verified" if focus_chord_base_valid else "contradicted",
                                 "P、A、B 均在同一条动直线 l 上，因此三角形退化且面积为 0。" if focus_chord_base_valid else "动直线没有通过题设点，无法核验共线面积。",
                                 formula="S_{△PAB}=0", part=area_part, category="algebra"))

    has_derived_tangent = any(line.get("role") in {"tangent", "dynamic_tangent"} for line in (scene.get("lines") or []))
    gradient_line_validity: dict[int, bool] = {}
    for index, line in enumerate(scene.get("lines") or []):
        parameter = _line_parameter(line, scene, x, y)
        part = line.get("part") if isinstance(line.get("part"), int) else None
        goal = goal_by_part.get(part, overall_goal)
        tangent_claim = line.get("role") == "tangent" or (goal == "tangent" and not has_derived_tangent)
        label = str(line.get("label") or f"直线 {index + 1}")
        if line.get("role") == "dynamic_tangent":
            ok = dynamic_tangent_validity.get(line.get("id"), False)
            checks.append(_check(f"dynamic-tangent-{index}", f"{label} 动态构造", "verified" if ok else "contradicted",
                                 "切线实时引用动交点和主曲线，并由隐式梯度重算。" if ok else "动态切线的交点、曲线或构造契约引用无效。",
                                 category="construction"))
            continue
        if line.get("role") in {"tangent", "normal"}:
            role = line.get("role")
            construction = line.get("construction") if isinstance(line.get("construction"), dict) else {}
            inputs = construction.get("inputs") if isinstance(construction.get("inputs"), dict) else {}
            point_reference = line.get("pointRef") or inputs.get("point_ref") or f"feature:{line.get('point', '')}"
            point = point_from_reference(point_reference)
            referenced_object = object_by_id.get(point_reference)
            point_reference_ok = (point_reference == f"feature:{line.get('point', '')}"
                                  if str(point_reference).startswith("feature:") else
                                  valid_derived_intersection(referenced_object)
                                  and referenced_object.get("label") == line.get("point")
                                  and referenced_object.get("part") in {None, part})
            coefficients = _line_coefficients(line, scene)
            expected_type = "tangent_at" if role == "tangent" else "normal_at"
            contract_ok = (construction.get("schema") == "dongjiexi-construction/v1"
                           and construction.get("type") == expected_type
                           and inputs.get("curve") == "$conic"
                           and inputs.get("point") == line.get("point")
                           and inputs.get("point_ref") == point_reference
                           and line.get("refs") == [point_reference, "$conic"])
            if not (point and coefficients):
                gradient_line_validity[id(line)] = False
                checks.append(_check(f"{role}-{index}", f"{label} 构造", "unresolved",
                                     "缺少该直线所依赖的切点或精确直线系数。", part=part, category="construction"))
                continue
            px0, py0 = point
            a0, b0, c0 = coefficients
            on_curve = sp.simplify(conic.subs({x: px0, y: py0}))
            through_point = sp.simplify(a0*px0+b0*py0+c0)
            gx = sp.simplify(sp.diff(conic, x).subs({x: px0, y: py0}))
            gy = sp.simplify(sp.diff(conic, y).subs({x: px0, y: py0}))
            orientation_residual = (sp.simplify(a0*gy-b0*gx) if role == "tangent"
                                    else sp.simplify(a0*gx+b0*gy))
            valid_gradient_line = (contract_ok and point_reference_ok and all(_sign(value) == 0 for value in
                                   (on_curve, through_point, orientation_residual)) and not (gx == 0 and gy == 0))
            gradient_line_validity[id(line)] = valid_gradient_line
            if role == "tangent":
                detail = ("切点引用有效，切点在曲线上，且直线法向量与该点梯度平行。"
                          if valid_gradient_line else "切线的切点引用、构造契约、过点条件或梯度方向不一致。")
                formula = f"F(P)={sp.sstr(on_curve)}, L(P)={sp.sstr(through_point)}, n_L×∇F={sp.sstr(orientation_residual)}"
            else:
                detail = ("切点引用有效，切点在曲线上，法线经过切点，且法线方向与梯度平行。"
                          if valid_gradient_line else "法线的切点引用、构造契约、过点条件或垂直关系不一致。")
                formula = f"F(P)={sp.sstr(on_curve)}, L(P)={sp.sstr(through_point)}, n_L·∇F={sp.sstr(orientation_residual)}"
            checks.append(_check(f"{role}-{index}", f"{label} 构造", "verified" if valid_gradient_line else "contradicted",
                                 detail, formula=formula,
                                 part=part, category="construction"))
            continue
        if not parameter:
            checks.append(_check(f"line-{index}", f"{label} 与曲线", "unresolved", "缺少可计算的直线参数或依赖点。", part=part, category="intersection"))
            continue
        t, px, py, text_line = parameter
        substituted = sp.factor(conic.subs({x: px, y: py}))
        try:
            poly = sp.Poly(substituted, t)
        except sp.PolynomialError:
            checks.append(_check(f"line-{index}", f"{label} 与曲线", "unresolved", "联立式无法化为一元多项式。", part=part, category="intersection"))
            continue
        degree = poly.degree()
        if degree == 2:
            disc = sp.factor(sp.discriminant(poly.as_expr(), t))
            sign = _sign(disc)
            relation = {1: "两个实交点", 0: "二次重根，满足相切的代数条件", -1: "无实交点"}.get(sign)
            if tangent_claim:
                status = "verified" if sign == 0 else "contradicted" if sign in {-1, 1} else "unresolved"
                detail = (relation + "，相切结论得到核验。" if sign == 0 else
                          relation + "，与题目中的相切结论矛盾。" if sign in {-1, 1} else
                          "判别式符号仍含未确定参数，暂不能核验相切结论。")
            else:
                status = "verified" if relation else "unresolved"
                detail = relation or "判别式符号仍含未确定参数。"
            checks.append(_check(f"line-{index}", f"{label} 与曲线关系", status, detail,
                                 formula=f"{sp.sstr(poly.as_expr())}=0, Δ={sp.sstr(disc)}", part=part, category="intersection"))
        elif degree == 1:
            status = "unresolved" if tangent_claim else "verified"
            detail = ("联立后降为一次，只有一个有限交点；这不能单独作为相切证据，相切结论仍待梯度等条件核验。"
                      if tangent_claim else "联立后降为一次，得到一个有限交点；这里只核验交点关系，不能据此判作相切。")
            checks.append(_check(f"line-{index}", f"{label} 与曲线关系", status, detail,
                                 formula=f"{sp.sstr(poly.as_expr())}=0", part=part, category="intersection"))
        elif degree == 0:
            sign = _sign(poly.as_expr())
            detail = "直线退化为曲线方程的恒等解。" if sign == 0 else "直线与曲线没有有限交点。"
            status = "unresolved" if sign == 0 else "contradicted" if tangent_claim else "verified"
            if tangent_claim and sign != 0:
                detail += "这与题目中的相切结论矛盾。"
            checks.append(_check(f"line-{index}", f"{label} 与曲线关系", status, detail,
                                 formula=f"{sp.sstr(poly.as_expr())}=0", part=part, category="intersection"))

    # A proof that two tangents are perpendicular is a relation between two
    # independently valid constructions.  Verify that relation explicitly
    # instead of treating two individually valid tangent lines as sufficient.
    for model_part in (model_parts or []):
        part = model_part.get("index")
        question = str(model_part.get("question") or "")
        if not (isinstance(part, int) and "切线" in question and "垂直" in question):
            continue
        tangent_lines = [line for line in (scene.get("lines") or [])
                         if line.get("role") in {"tangent", "dynamic_tangent"} and line.get("part") == part]
        if len(tangent_lines) < 2:
            tangent_lines = [line for line in (scene.get("lines") or [])
                             if line.get("role") in {"tangent", "dynamic_tangent"} and line.get("part") in {None, part}]
        if len(tangent_lines) < 2:
            checks.append(_check(
                f"tangent-perpendicular-{part}", "两切线垂直关系", "unresolved",
                "题目要求核验两条切线垂直，但画板中尚未建立两个可核验的切点与切线。",
                part=part, category="construction"))
            continue
        first, second = tangent_lines[:2]
        if first.get("role") == second.get("role") == "dynamic_tangent":
            dynamic_ok = (focus_chord_base_valid and dynamic_tangent_validity.get(first.get("id"), False)
                          and dynamic_tangent_validity.get(second.get("id"), False))
            checks.append(_check(
                f"tangent-perpendicular-{part}", "两切线垂直关系",
                "verified" if dynamic_ok else "contradicted",
                ("焦点弦满足 t₁t₂=-1，两条实时切线斜率之积为 -1。" if dynamic_ok else
                 "动态切线引用或焦点弦参数契约无效，不能确认垂直关系。"),
                formula="t₁t₂=-1 ⇒ k₁k₂=-1", part=part, category="construction"))
            continue
        first_ref = first.get("pointRef") or (first.get("construction") or {}).get("inputs", {}).get("point_ref")
        second_ref = second.get("pointRef") or (second.get("construction") or {}).get("inputs", {}).get("point_ref")
        coefficients1 = _line_coefficients(first, scene)
        coefficients2 = _line_coefficients(second, scene)
        if not coefficients1 or not coefficients2:
            checks.append(_check(
                f"tangent-perpendicular-{part}", "两切线垂直关系", "unresolved",
                "两条切线缺少可独立复算的精确系数。", part=part, category="construction"))
            continue
        a1, b1, _ = coefficients1
        a2, b2, _ = coefficients2
        dot = sp.simplify(a1*a2+b1*b2)
        distinct = bool(first_ref and second_ref and first_ref != second_ref)
        canonical = (gradient_line_validity.get(id(first), False)
                     and gradient_line_validity.get(id(second), False))
        perpendicular = canonical and distinct and _sign(dot) == 0
        checks.append(_check(
            f"tangent-perpendicular-{part}", "两切线垂直关系",
            "verified" if perpendicular else "contradicted",
            ("两条切线来自不同切点，方向向量点积为 0，垂直结论成立。"
             if perpendicular else
             "至少一条切线未通过规范构造校验、两条线未引用不同合法切点，或方向向量点积不为 0，垂直结论不成立。"),
            formula=f"d₁·d₂={sp.sstr(dot)}", part=part, category="construction"))

    for index, item in enumerate(scene.get("objects") or []):
        role = item.get("role")
        part = item.get("part") if isinstance(item.get("part"), int) else None
        construction = item.get("construction") if isinstance(item.get("construction"), dict) else {}
        inputs = construction.get("inputs") if isinstance(construction.get("inputs"), dict) else {}
        if role == "line_conic_intersection":
            point = exact_point(item)
            line_id = inputs.get("line")
            target_line = line_by_id.get(line_id)
            coefficients = _line_coefficients(target_line, scene) if target_line else None
            refs = item.get("refs") if isinstance(item.get("refs"), list) else []
            branch = item.get("branch")
            contract_ok = (construction.get("schema") == "dongjiexi-construction/v1" and
                           construction.get("type") == "line_conic_intersection" and
                           refs == [line_id, "$conic"] and inputs.get("curve") == "$conic" and
                           inputs.get("branch") == branch and isinstance(branch, int))
            if not (point and coefficients):
                checks.append(_check(f"derived-intersection-{index}", f"交点 {item.get('label', '?')} 构造", "unresolved",
                                     "缺少交点精确坐标、目标直线或统一构造契约。", part=part, category="construction"))
                continue
            if not contract_ok:
                checks.append(_check(f"derived-intersection-{index}", f"交点 {item.get('label', '?')} 构造", "contradicted",
                                     "交点的运行时 refs 与构造 inputs、分支或统一契约不一致。", part=part, category="construction"))
                continue
            px0, py0 = point
            a0, b0, c0 = coefficients
            on_curve = sp.simplify(conic.subs({x: px0, y: py0}))
            on_line = sp.simplify(a0*px0+b0*py0+c0)
            expected = None
            parameter = _line_parameter(target_line, scene, x, y)
            if parameter:
                t0, tx, ty, _ = parameter
                roots = [root for root in sp.solve(sp.factor(conic.subs({x: tx, y: ty})), t0)
                         if root.is_real is not False]
                roots.sort(key=lambda root: float(sp.N(root, 50)))
                if 0 <= branch < len(roots):
                    expected = (sp.simplify(tx.subs(t0, roots[branch])), sp.simplify(ty.subs(t0, roots[branch])))
            branch_residual = (sp.simplify(px0-expected[0]), sp.simplify(py0-expected[1])) if expected else None
            valid_intersection = valid_derived_intersection(item)
            checks.append(_check(f"derived-intersection-{index}", f"交点 {item.get('label', '?')} 构造",
                                 "verified" if valid_intersection else "contradicted",
                                 "候选点同时满足主曲线、目标直线和稳定分支顺序。" if valid_intersection else "候选点没有同时满足曲线、直线及其分支顺序。",
                                 formula=f"F(P)={sp.sstr(on_curve)}, L(P)={sp.sstr(on_line)}, branch={branch}",
                                 part=part, category="construction"))
            continue
        if role == "derived_chord":
            refs = item.get("refs") if isinstance(item.get("refs"), list) else []
            endpoint_items = [object_by_id.get(ref) for ref in refs]
            endpoints = [exact_point(endpoint) for endpoint in endpoint_items]
            exact = item.get("exact") if isinstance(item.get("exact"), dict) else {}
            try:
                claimed = _q(exact.get("length")) if exact.get("length") is not None else None
            except (TypeError, ValueError, ZeroDivisionError):
                claimed = None
            if len(endpoints) != 2 or not all(endpoints) or claimed is None:
                checks.append(_check(f"derived-chord-{index}", f"{item.get('label', '弦')} 构造", "unresolved",
                                     "缺少两个已核验端点或精确弦长。", part=part, category="construction"))
                continue
            (x1, y1), (x2, y2) = endpoints
            residual = sp.simplify((x1-x2)**2+(y1-y2)**2-claimed**2)
            contract_ok = (construction.get("schema") == "dongjiexi-construction/v1" and
                           construction.get("type") == "chord_segment" and
                           inputs.get("a") == refs[0] and inputs.get("b") == refs[1] and inputs.get("line") in line_by_id)
            valid_chord = (refs[0] != refs[1] and contract_ok and all(valid_derived_intersection(endpoint) for endpoint in endpoint_items)
                           and _sign(residual) == 0)
            checks.append(_check(f"derived-chord-{index}", f"{item.get('label', '弦')} 构造",
                                 "verified" if valid_chord else "contradicted",
                                 "弦连接两个不同交点，且长度与端点距离一致。" if valid_chord else "弦的端点或长度与精确交点不一致。",
                                 formula=f"|AB|²-L²={sp.sstr(residual)}", part=part, category="construction"))
            continue
        if role == "derived_midpoint":
            refs = item.get("refs") if isinstance(item.get("refs"), list) else []
            endpoint_items = [object_by_id.get(ref) for ref in refs]
            endpoints = [exact_point(endpoint) for endpoint in endpoint_items]
            middle = exact_point(item)
            if len(endpoints) != 2 or not all(endpoints) or not middle:
                checks.append(_check(f"derived-midpoint-{index}", f"中点 {item.get('label', 'M')} 构造", "unresolved",
                                     "缺少两个端点或中点的精确坐标。", part=part, category="construction"))
                continue
            (x1, y1), (x2, y2) = endpoints
            mx, my = middle
            residual_x, residual_y = sp.simplify(2*mx-x1-x2), sp.simplify(2*my-y1-y2)
            contract_ok = (construction.get("schema") == "dongjiexi-construction/v1" and
                           construction.get("type") == "chord_midpoint" and
                           inputs.get("a") == refs[0] and inputs.get("b") == refs[1] and inputs.get("line") in line_by_id)
            valid_midpoint = (refs[0] != refs[1] and contract_ok and all(valid_derived_intersection(endpoint) for endpoint in endpoint_items)
                              and _sign(residual_x) == 0 and _sign(residual_y) == 0)
            checks.append(_check(f"derived-midpoint-{index}", f"中点 {item.get('label', 'M')} 构造",
                                 "verified" if valid_midpoint else "contradicted",
                                 "中点的两个坐标均为弦端点坐标的算术平均。" if valid_midpoint else "候选中点与两个端点的坐标平均不一致。",
                                 formula=f"2x_M-x_A-x_B={sp.sstr(residual_x)}, 2y_M-y_A-y_B={sp.sstr(residual_y)}",
                                 part=part, category="construction"))
            continue
        if role == "derived_locus":
            if construction.get("type") == "focus_chord_midpoint_locus":
                # The complete focus-chord dependency graph and its Vieta
                # elimination are checked above as one cross-object contract.
                continue
            refs = item.get("refs") if isinstance(item.get("refs"), list) else []
            target_id, moving_id, fixed_ref, curve_ref = (refs + [None] * 4)[:4]
            target_object, moving_object = object_by_id.get(target_id), object_by_id.get(moving_id)
            fixed_point = _feature_point(scene, fixed_ref) if str(fixed_ref).startswith("feature:") else None
            contract_ok = (construction.get("schema") == "dongjiexi-construction/v1" and
                           construction.get("type") == "midpoint_locus" and
                           construction.get("method") == "affine_elimination" and
                           inputs == {"target": target_id, "moving": moving_id,
                                      "fixed": fixed_ref, "curve": "$conic"} and curve_ref == "$conic")
            graph_ok = (isinstance(target_object, dict) and target_object.get("op") == "midpoint" and
                        target_object.get("refs") in ([moving_id, fixed_ref], [fixed_ref, moving_id]) and
                        isinstance(moving_object, dict) and moving_object.get("op") == "point_on" and
                        moving_object.get("refs") == ["$conic"])
            exact = item.get("exact") if isinstance(item.get("exact"), dict) else {}
            claimed_implicit = None
            displayed_implicit = None
            try:
                if exact.get("implicit") is not None:
                    claimed_implicit = sp.sympify(exact["implicit"], locals={"x": x, "y": y})
                lh, lk = _q(exact["h"]), _q(exact["k"])
                locus_type = item.get("conicType")
                vertical = item.get("orientation") == "vertical"
                if locus_type == "ellipse":
                    a2, b2 = _q(exact["a2"]), _q(exact["b2"])
                    dx, dy = (b2, a2) if vertical else (a2, b2)
                    displayed_implicit = (x-lh)**2/dx+(y-lk)**2/dy-1
                elif locus_type == "hyperbola":
                    a2, b2 = _q(exact["a2"]), _q(exact["b2"])
                    displayed_implicit = ((y-lk)**2/a2-(x-lh)**2/b2-1 if vertical
                                          else (x-lh)**2/a2-(y-lk)**2/b2-1)
                elif locus_type == "circle":
                    displayed_implicit = (x-lh)**2+(y-lk)**2-_q(exact["r2"])
                elif locus_type == "parabola":
                    p0, direction = _q(exact["p"]), int(exact.get("direction", 1))
                    displayed_implicit = ((x-lh)**2-4*p0*direction*(y-lk) if vertical
                                          else (y-lk)**2-4*p0*direction*(x-lh))
            except (KeyError, TypeError, ValueError, ZeroDivisionError, sp.SympifyError):
                displayed_implicit = None
            expected = None
            if fixed_point:
                qx, qy = fixed_point
                expected = sp.factor(conic.subs({x: 2*x-qx, y: 2*y-qy}))
            exact_ok = bool(expected is not None and claimed_implicit is not None and
                            _sign(sp.simplify(claimed_implicit-expected)) == 0)
            display_ok = bool(expected is not None and displayed_implicit is not None and
                              _proportional_polynomials(displayed_implicit, expected, x, y))
            valid_locus = contract_ok and graph_ok and exact_ok and display_ok
            checks.append(_check(f"derived-locus-{index}", f"{item.get('label', '轨迹')} 构造",
                                 "verified" if valid_locus else "contradicted",
                                 "中点依赖图、仿射消元式与画板轨迹曲线完全一致。" if valid_locus else
                                 "轨迹的依赖引用、消元式或画板曲线参数不一致。",
                                 formula=f"F(2x-qₓ,2y-qᵧ)={sp.sstr(expected) if expected is not None else '?'}",
                                 part=part, category="construction"))
            continue
        if role != "perpendicular_foot":
            continue
        point_name, line_id = inputs.get("point"), inputs.get("line")
        point, target_line = (scene.get("points") or {}).get(point_name), line_by_id.get(line_id)
        exact = item.get("exact") if isinstance(item.get("exact"), dict) else {}
        coefficients = _line_coefficients(target_line, scene) if target_line else None
        if not (isinstance(point, (list, tuple)) and len(point) == 2 and coefficients and exact.get("x") is not None and exact.get("y") is not None):
            checks.append(_check(f"foot-{index}", f"垂足 {item.get('label', 'H')} 构造", "unresolved",
                                 "缺少源点、目标直线或垂足的精确坐标。", part=part, category="construction"))
            continue
        px0, py0, hx, hy = _q(point[0]), _q(point[1]), _q(exact["x"]), _q(exact["y"])
        a0, b0, c0 = coefficients
        on_line = sp.simplify(a0*hx+b0*hy+c0)
        perpendicular = sp.simplify((hx-px0)*b0-(hy-py0)*a0)
        valid_foot = _sign(on_line) == 0 and _sign(perpendicular) == 0 and not (a0 == 0 and b0 == 0)
        detail = ("垂足在目标直线上，且源点到垂足的向量与直线方向垂直。"
                  if valid_foot else "候选垂足未同时满足在线条件和垂直条件。")
        checks.append(_check(f"foot-{index}", f"垂足 {item.get('label', 'H')} 构造",
                             "verified" if valid_foot else "contradicted", detail,
                             formula=f"L(H)={sp.sstr(on_line)}, PH·d={sp.sstr(perpendicular)}",
                             part=part, category="construction"))
    return checks


def build_problem_model(text: str, scene: dict | None, parts: list[dict], mode: str) -> dict:
    ambiguities = uncertainty_tokens(text)
    model_parts = []
    for position, part in enumerate(parts):
        goal = classify_goal(part.get("body") or part.get("question") or part.get("answer"))
        explicit = list(dict.fromkeys((part.get("derivation") or {}).get("proof_obligations", []) + OBLIGATIONS[goal]))
        model_parts.append({
            "index": part.get("index", position),
            "label": part.get("label") or f"第 {position + 1} 问",
            "goal": goal,
            "question": part.get("body") or part.get("question") or "",
            "depends_on": [item.get("index", offset) for offset, item in enumerate(parts[:position])
                           if re.search(rf"(?:由|利用|根据)\s*[（(]?\s*{item.get('index', offset)}\s*[）)]?", part.get("body") or part.get("question") or "")],
            "proof_obligations": explicit,
        })
    curve = None
    points: list[dict] = []
    lines: list[dict] = []
    if scene:
        try:
            _, _, expression = conic_expression(scene)
            equation = sp.sstr(expression) + " = 0"
        except (KeyError, TypeError, ValueError, ZeroDivisionError):
            equation = ""
        parameter_names = {"ellipse": ("a", "b", "h", "k"), "hyperbola": ("a", "b", "h", "k"),
                           "circle": ("r", "h", "k"), "parabola": ("p", "h", "k", "direction")}.get(scene.get("type"), ())
        curve = {"kind": scene.get("type"), "orientation": scene.get("orientation"), "equation": equation,
                 "parameters": {name: scene.get(name) for name in parameter_names},
                 "source": "deterministic" if mode == "symbolic-fallback" else "model-checked"}
        compact = re.sub(r"\s+", "", text).lower()
        for name, coords in (scene.get("points") or {}).items():
            source = "question" if re.search(rf"(?<![a-z]){re.escape(str(name).lower())}\s*[（(]", compact) else "derived"
            points.append({"name": name, "x": coords[0], "y": coords[1], "source": source})
        for number, line in enumerate(scene.get("lines") or []):
            lines.append({"id": line.get("id") or f"line-{number}", "kind": line.get("kind"), "label": line.get("label"),
                          "part": line.get("part"), "source": line.get("source") or "model"})
    return {
        "schema": "dongjiexi-problem-model/v1",
        "source": {"kind": "confirmed-text", "confirmed": not ambiguities, "ambiguities": ambiguities},
        "curve": curve,
        "points": points,
        "lines": lines,
        "constraints": [],
        "variables": [],
        "parts": model_parts,
    }


def attach_trust_report(result: dict) -> dict:
    previous_verification = result.get("verification") if isinstance(result.get("verification"), dict) else {}
    original_scene = result.get("scene") if isinstance(result.get("scene"), dict) else None
    scene = copy.deepcopy(original_scene) if original_scene else None
    if scene is not None:
        result["scene"] = scene
    parts = result.get("parts") if isinstance(result.get("parts"), list) else []
    text = str(result.get("restatement") or "")
    mode = str(result.get("mode") or "")
    model = build_problem_model(text, scene, parts, mode)
    result["problemModel"] = model

    if scene:
        scene.setdefault("provenance", {})
        scene["provenance"].update({
            "schema": "dongjiexi-scene/v1",
            "curve": model["curve"]["source"] if model.get("curve") else "unknown",
            "points": {item["name"]: item["source"] for item in model["points"]},
        })
        for line in scene.get("lines", []):
            line.setdefault("source", "model" if mode == "local-ollama" else "question")
        for obj in scene.get("objects", []):
            obj.setdefault("source", "derived" if obj.get("kind") == "construction" else "model")

    checks = _scene_checks(scene, text, model.get("parts")) if scene else []
    if previous_verification.get("status") == "conflict":
        checks.insert(0, _check("precheck-conflict", "题干与模型一致性", "contradicted",
                                str(previous_verification.get("message") or "前置一致性检查发现冲突。"), category="curve"))
    ambiguities = model["source"]["ambiguities"]
    if ambiguities:
        checks.insert(0, _check("ocr-ambiguity", "题面清晰度", "contradicted", "题面仍含未确认的模糊字段：" + "、".join(ambiguities), category="input"))
    verified = sum(item["status"] == "verified" for item in checks)
    answer_verified = sum(item["status"] == "verified" and isinstance(item.get("part"), int) for item in checks)
    structural_verified = verified - answer_verified
    contradicted = sum(item["status"] == "contradicted" for item in checks)
    unresolved = sum(item["status"] == "unresolved" for item in checks)
    if contradicted:
        status = "conflict"
        message = f"发现 {contradicted} 项确定性冲突；本次答案不能视为已验证。"
    elif answer_verified:
        status = "locally-verified"
        message = f"已完成 {answer_verified} 项答案相关的局部代数核验；仍有 {unresolved} 项未决，文字证明和最终结论尚未完整验证。"
    elif structural_verified:
        status = "generated"
        message = f"已核对 {structural_verified} 项图形结构，但尚无答案相关的局部代数核验；请把解答视为待检查草稿。"
    else:
        status = "generated"
        message = "已生成解答，但当前没有足够的结构化关系可作确定性核验；请把它当作待检查草稿。"
    result["verification"] = {"status": status, "level": 1 if answer_verified else 0, "message": message,
                              "counts": {"verified": verified, "answer_verified": answer_verified,
                                         "contradicted": contradicted, "unresolved": unresolved}, "checks": checks}

    for part in parts:
        related = [item for item in checks if item.get("part") == part.get("index")]
        part_conflicts = sum(item["status"] == "contradicted" for item in related)
        part_verified = sum(item["status"] == "verified" for item in related)
        part_status = "conflict" if part_conflicts else "locally-verified" if part_verified else "generated"
        part["verification"] = {"status": part_status, "verified": part_verified, "conflicts": part_conflicts,
                                "message": "发现确定性冲突" if part_conflicts else f"{part_verified} 项局部核验通过" if part_verified else "仅生成，尚无局部代数核验"}
        if "derivation" not in part:
            part["derivation"] = {"equations": [], "substitutions": [], "candidate_solutions": [], "domain": [], "proof_obligations": []}
        goal = next((item for item in model["parts"] if item["index"] == part.get("index")), None)
        if goal:
            part["derivation"]["proof_obligations"] = list(dict.fromkeys(part["derivation"].get("proof_obligations", []) + goal["proof_obligations"]))
    return result
