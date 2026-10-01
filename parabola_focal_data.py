"""Exact focal-chord data inference and a directrix orthogonality theorem.

This engine covers an origin-centred, right-opening parabola y²=2px (p>0)
and a chord through its focus.  The application's ``p`` is the focus distance
f=p_standard/2, so its equation is y²=4fx.  All numeric expressions use the
restricted rational/root grammar; user strings never reach eval or sympify.
Neither question IDs nor a stored answer bank are consulted.
"""
from __future__ import annotations

from functools import lru_cache
import math
import re

import sympy as sp

from parabola_locus import normalise, scalar


SCHEMA = "dongjiexi-parabola-focal-data/v1"
PREFIX = "focal-data-"
COMMON_DEGREES = {15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165}


def _compact(text: str) -> str:
    value = normalise(text).replace(r"\_", "_")
    value = re.sub(r"\^\{2\}", "^2", value)
    value = value.replace(r"^{\circ}", "°").replace(r"^\circ", "°")
    value = value.replace(r"\theta", "θ").replace(r"\perp", "⊥")
    return value


def _parts(text: str) -> list[dict]:
    # The shared parser ignores references such as 在（1）（2）的条件下.
    from question_parts import split_problem_parts
    return split_problem_parts(text)


def _number_prefix(value: str) -> tuple[sp.Expr, int] | None:
    match = re.match(r"(?:sqrt|[0-9√()+\-*/.])+", value)
    if not match:
        return None
    token = match.group(0)
    for end in range(min(100, len(token)), 0, -1):
        tail = value[end:]
        if tail and (tail[0] in "+-*/.0123456789({[" or re.match(r"[A-Za-z]", tail)):
            continue
        try:
            return scalar(token[:end]), end
        except ValueError:
            continue
    return None


def _references(body: str) -> set[int]:
    result = set()
    for match in re.finditer(r"(?:在|根据|由)(.{0,40}?)(?:的)?条件下", _compact(body)):
        result.update(int(index) for index in re.findall(r"\((\d{1,2})\)", match.group(1)))
    return result


def _angle(body: str, f: sp.Expr, midpoint_x: sp.Expr) -> dict | None:
    text = _compact(body)
    candidates = list(re.finditer(r"(?:倾斜角|θ)(?:为|是|=)", text))
    if not candidates:
        return None
    if len(candidates) != 1:
        return {"supported": False, "conflict": True, "reason": "给出了多个倾斜角条件"}
    number = _number_prefix(text[candidates[0].end():])
    if number is None:
        return {"supported": False, "conflict": False, "reason": "倾斜角格式未被当前精确引擎覆盖"}
    value, used = number
    tail = text[candidates[0].end()+used:]
    if not tail.startswith(("°", "度")):
        return {"supported": False, "conflict": False, "reason": "需明确倾斜角的度数单位"}
    if value.is_integer is not True or int(value) not in COMMON_DEGREES:
        return {"supported": False, "conflict": value <= 0 or value >= 180, "reason": "当前精确引擎支持常用特殊角，轴向退化直线不构成焦点弦"}
    cot = sp.simplify(sp.cot(sp.pi*value/180))
    required_midpoint = sp.simplify(f*(1+2*cot*cot))
    conflict = sp.simplify(required_midpoint-midpoint_x) != 0
    return {"supported": True, "degree": int(value), "cot": cot,
            "midpointX": required_midpoint, "midpointY": sp.simplify(2*f*cot),
            "length": sp.simplify(4*f*(1+cot*cot)), "conflict": bool(conflict),
            "reason": "该倾斜角与原弦长及中点横坐标不相容" if conflict else ""}


def _goal(body: str, names: dict) -> str | None:
    text = _compact(body)
    marker = re.search(r"求|计算|确定|写出|证明|求证", text)
    if marker is None:
        return None
    goal = text[marker.start():]
    if len(re.findall(r"求|计算|确定|写出|证明", goal)) != 1:
        return None
    if re.search(r"并|以及|同时|且|还|此外|和|说明|判断|验证|最大|最小|最值|范围|面积|周长|轨迹|切线|法线|夹角|角度", goal):
        return None
    equation_goal = re.fullmatch(r"(?:求|确定|写出)(?:出)?(?:抛物线|曲线)?([A-Za-z])?(?:的)?(?:标准)?方程[。；;]?", goal, re.I)
    if equation_goal and (not equation_goal.group(1) or equation_goal.group(1).upper() == names.get("curve", "C")):
        return "equation"
    pair = "".join(names["endpoints"])
    if re.fullmatch(rf"(?:求|计算|确定)(?:出)?(?:\|{pair}\||(?:弦|线段)?{pair}(?:的)?(?:弦长|长度)|弦长)[。；;]?", goal, re.I):
        return "length"
    target = re.escape(names["target"])
    if re.fullmatch(rf"(?:求|计算|确定)(?:出)?(?:点)?{target}(?:的)?坐标[。；;]?", goal, re.I):
        return "perpendicular"
    return None


def infer(text: str) -> dict | None:
    """Infer the curve from a numerical focal-chord length and midpoint x."""
    if len(str(text)) > 20000:
        return None
    parts = _parts(text)
    compact = _compact(text)
    first_header = re.search(r"\([1-9][0-9]?\)(?=若|求|证明|设|在|已知|确定|计算|写出)", compact)
    head = compact[:first_header.start()] if first_header else compact
    equation = re.search(r"(?<![0-9A-Za-z*/^])y\^2=([^。；;：:,]{0,45}?)x(?=[(,。；;：:]|的|$)", head)
    if not equation:
        return None
    curve_match = re.search(r"([A-Za-z])[:：]$", head[:equation.start()])
    curve_name = curve_match.group(1).upper() if curve_match else "C"
    coefficient = equation.group(1).rstrip("*")
    if coefficient == "2p":
        if not re.search(r"p>0", head) or re.search(r"p[<≤]|x\^2=|不(?:过|经过)|非焦点", head):
            return None
        fixed_coefficient = None
    else:
        try:
            fixed_coefficient = scalar(coefficient or "1")
            if fixed_coefficient.is_positive is not True:
                return None
        except ValueError:
            return None
    focus_match = re.search(r"焦点(?:为|是|记为)([A-Za-z])(?=[,。；;]|准线|$)", head, re.I)
    if focus_match is None:
        return None
    focus = focus_match.group(1).upper()
    directrix_match = re.search(r"准线与x轴(?:交于|交在)(?:点)?([A-Za-z])", head, re.I)
    if directrix_match is None:
        return None
    foot = directrix_match.group(1).upper()
    chord = re.search(rf"过{re.escape(focus)}(?:的)?(?:动)?直线(?:[a-z])?(?:与|交)(.{{0,35}}?)交于([A-Za-z])[,、]([A-Za-z])(?:两点)?", head, re.I)
    if chord is None:
        return None
    if chord.group(1).upper() not in {"抛物线", "该抛物线", "该曲线", "抛物线"+curve_name, "曲线"+curve_name, curve_name}:
        return None
    endpoints = [chord.group(2).upper(), chord.group(3).upper()]
    line_match = re.search(rf"过{re.escape(focus)}(?:的)?(?:动)?直线([a-z])", head)
    line_name = line_match.group(1) if line_match else "l"
    target_match = re.search(r"设([A-Za-z])为准线(?:上|上的)(?:一)?点|设([A-Za-z])为准线上一点", compact, re.I)
    target = next((value.upper() for value in target_match.groups() if value), "M") if target_match else "M"
    names = {"focus": focus, "directrixFoot": foot, "endpoints": endpoints, "target": target, "curve": curve_name}
    if len({focus, foot, *endpoints, target}) != 5:
        return None
    if re.search(r"(?:左|向左)开口|准线与y轴|平行于x轴|关于|限定|横坐标[<>≤≥]", head):
        return None
    pair = re.escape("".join(endpoints))
    input_data = []
    for part in parts:
        body = _compact(part.get("body") or part.get("question") or "")
        if _goal(body, names) != "equation":
            continue
        if re.search(r"纵坐标|斜率|倾斜角|之比|倍|之和|之差|的和|的差|距离|面积|垂直|⊥|平行|不等于|不满足|不相等|不是|小于|大于|[<>≥≤]", body):
            return None
        lengths = []
        for match in re.finditer(rf"(?:\|{pair}\||{pair})(?:的)?(?:长度|弦长)?(?:为|是|等于|=)", body, re.I):
            value = _number_prefix(body[match.end():])
            if value:
                lengths.append(value[0])
        midpoints = []
        for match in re.finditer(rf"(?:线段|弦)?{pair}(?:的)?中点(?:的)?横坐标(?:为|是|等于|=)", body, re.I):
            value = _number_prefix(body[match.end():])
            if value:
                midpoints.append(value[0])
        lengths, midpoints = list(dict.fromkeys(lengths)), list(dict.fromkeys(midpoints))
        if len(lengths) == len(midpoints) == 1:
            input_data.append((lengths[0], midpoints[0], part.get("index", 0)))
    input_data = list(dict.fromkeys(input_data))
    if len(input_data) != 1:
        return None
    length, midpoint_x, data_part = input_data[0]
    f = sp.simplify(length/2-midpoint_x)
    if length.is_positive is not True or f.is_positive is not True or (midpoint_x-length/4).is_nonnegative is not True:
        return None
    if fixed_coefficient is not None and sp.simplify(fixed_coefficient-4*f) != 0:
        return None
    for assignment in re.finditer(r"(?<![A-Za-z])p=", compact):
        supplied = _number_prefix(compact[assignment.end():])
        if supplied is None or sp.simplify(supplied[0]-2*f) != 0:
            return None
    if any(re.search(rf"{re.escape(name)}\(", head, re.I) for name in (focus, foot, *endpoints)):
        return None
    try:
        if not all(math.isfinite(float(value)) for value in (length, midpoint_x, f)) or float(f) <= 0:
            return None
    except (TypeError, ValueError, OverflowError):
        return None
    cot_squared = sp.simplify((midpoint_x/f-1)/2)
    theta_default = 90.0 if cot_squared == 0 else math.degrees(math.atan(1/math.sqrt(float(cot_squared))))
    angle_parts = [(part.get("index", 0), _angle(part.get("body") or part.get("question") or "", f, midpoint_x)) for part in parts]
    angle_parts = [(index, value) for index, value in angle_parts if value is not None]
    angle_part, angle = angle_parts[0] if angle_parts else (None, None)
    resolved = angle["degree"] if angle and angle.get("supported") and not angle.get("conflict") else None
    part_map = {}
    for part in parts:
        kind = _goal(part.get("body") or part.get("question") or "", names)
        if kind and kind not in part_map:
            part_map[kind] = part.get("index", 0)
    spec = {
        "schema": SCHEMA, "p": float(f), "standardP": float(2*f),
        "chordLength": float(length), "midpointX": float(midpoint_x),
        "exact": {"p": str(f), "standardP": str(2*f), "chordLength": str(length), "midpointX": str(midpoint_x)},
        "tex": {"p": sp.latex(f), "standardP": sp.latex(2*f), "chordLength": sp.latex(length), "midpointX": sp.latex(midpoint_x)},
        "names": names, "thetaDefault": theta_default, "thetaResolved": resolved,
        "givenTheta": angle.get("degree") if angle else None,
        "angleConflict": bool(angle and angle.get("conflict")), "anglePart": angle_part,
        "dataPart": data_part, "lineName": line_name, "parts": part_map, "example": True,
    }
    return {
        "type": "parabola", "p": float(f), "orientation": "horizontal", "direction": 1, "h": 0, "k": 0,
        "exact": {"p": str(f), "h": "0", "k": "0", "direction": "1"},
        "equation": f"y²={sp.simplify(4*f)}x", "inferredFromConditions": True, "inferred_from_conditions": True,
        "parabolaFocalData": spec, "points": {focus: [float(f), 0], foot: [-float(f), 0]},
        "lines": [], "objects": [], "lineThrough": "point:"+focus, "dynamicLine": True, "showDynamic": True,
        "dynamicIntersectionLabels": endpoints, "theta": resolved if resolved is not None else theta_default,
        "derivation": [
            rf"设应用中的焦距为 $f$，则题面标准参数 $p=2f$。由抛物线定义，焦点弦长 $|{''.join(endpoints)}|=x_1+x_2+2f=2\mu+2f$，因此 $f={sp.latex(length)}/2-{sp.latex(midpoint_x)}={sp.latex(f)}$。",
            rf"所以题面的 $p={sp.latex(2*f)}$，曲线方程为 $y^2={sp.latex(4*f)}x$。",
        ],
    }


def _matching(scene: dict, text: str) -> dict | None:
    model = infer(text)
    if model is None or scene.get("type") != "parabola" or scene.get("orientation", "horizontal") != "horizontal" or scene.get("direction", 1) != 1:
        return None
    try:
        for key in ("p", "h", "k"):
            value, expected = float(scene.get(key, 0)), float(model[key])
            if not math.isfinite(value) or abs(value-expected) > 1e-10*max(1, abs(expected)):
                return None
        for name, expected in model["points"].items():
            point = (scene.get("points") or {}).get(name)
            if point is not None and (not isinstance(point, (list, tuple)) or len(point) != 2 or any(abs(float(a)-b) > 1e-10*max(1, abs(b)) for a, b in zip(point, expected))):
                return None
    except (TypeError, ValueError, OverflowError):
        return None
    return model["parabolaFocalData"]


@lru_cache(maxsize=1)
def _identities() -> dict:
    f = sp.symbols("f", positive=True)
    c, t = sp.symbols("c t", real=True)
    a, b = sp.symbols("a b", real=True)
    # y roots have a+b=4fc, ab=-4f².  Expand first, then use these
    # symmetric quantities instead of relying on numerical intersections.
    dot = (c*a+2*f)*(c*b+2*f)+(a-t)*(b-t)
    symmetric_dot = (1+c*c)*(-4*f*f)+(2*f*c-t)*(4*f*c)+4*f*f+t*t
    expected_dot = (t-2*f*c)**2
    verified = sp.expand(dot-((1+c*c)*a*b+(2*f*c-t)*(a+b)+4*f*f+t*t)) == 0
    verified = verified and sp.expand(symmetric_dot-expected_dot) == 0
    midpoint_x = f*(1+2*c*c)
    length = 4*f*(1+c*c)
    verified = verified and sp.simplify(length-2*midpoint_x-2*f) == 0
    root_minus, root_plus = 2*f*(c-sp.sqrt(c*c+1)), 2*f*(c+sp.sqrt(c*c+1))
    verified = verified and sp.simplify(root_minus*root_plus+4*f*f) == 0
    verified = verified and sp.simplify(root_minus+root_plus-4*f*c) == 0
    return {"verified": bool(verified), "dotIdentity": str(expected_dot),
            "lengthIdentity": "L=2*mu+2*f=4*f*(1+cot(theta)^2)",
            "rootSum": "4*f*c", "rootProduct": "-4*f^2",
            "proofUsesSamples": False}


def proof_certificate(scene: dict) -> dict | None:
    spec = scene.get("parabolaFocalData", scene)
    if spec.get("schema") != SCHEMA:
        return None
    try:
        f, length, mu = [scalar(str(spec["exact"][key])) for key in ("p", "chordLength", "midpointX")]
    except (KeyError, ValueError, TypeError):
        return None
    if f.is_positive is not True or sp.simplify(length-2*mu-2*f) != 0 or (mu-f).is_nonnegative is not True:
        return None
    return {"schema": "dongjiexi-parabola-focal-data-proof/v1", **_identities(),
            "focusDistance": str(f), "standardParameter": str(2*f),
            "legalData": "L/4<=mu<L/2", "directrix": str(-f)}


def _angle_for_part(spec: dict, text: str, part: dict) -> dict | None:
    f = scalar(spec["exact"]["p"])
    mu = scalar(spec["exact"]["midpointX"])
    body = part.get("body") or part.get("question") or ""
    referenced = _references(body)
    candidates = []
    for source in [part]+[item for item in _parts(text) if item.get("index", 0) in referenced]:
        source_body = source.get("body") or source.get("question") or ""
        mentioned = re.search(r"直线([a-z])", _compact(source_body))
        if mentioned and mentioned.group(1) != spec.get("lineName", "l"):
            return {"supported": False, "conflict": False, "reason": "小问另指一条直线，不能沿用同一条焦点弦的数据"}
        value = _angle(source_body, f, mu)
        if value is not None:
            candidates.append(value)
    if candidates:
        problem = next((value for value in candidates if not value.get("supported") or value.get("conflict")), None)
        if problem:
            return problem
        if len({value["degree"] for value in candidates}) != 1:
            return {"supported": False, "conflict": True, "reason": "本小问的倾斜角与其引用的前问角度矛盾"}
        return candidates[0]
    if mu == f:
        return {"supported": True, "degree": 90, "cot": sp.Integer(0), "midpointX": mu, "midpointY": sp.Integer(0), "length": 4*f, "conflict": False}
    return None


def solve_part(scene: dict, text: str, part: dict) -> tuple[str, list[str]] | None:
    spec = _matching(scene, text)
    if spec is None:
        return None
    body = part.get("body") or part.get("question") or ""
    kind = _goal(body, spec["names"])
    if kind is None:
        return None
    certificate = proof_certificate(spec)
    if not certificate or not certificate["verified"]:
        return None
    f, length, mu = [scalar(spec["exact"][key]) for key in ("p", "chordLength", "midpointX")]
    names = spec["names"]
    pair, focus, target = "".join(names["endpoints"]), names["focus"], names["target"]
    if kind == "equation":
        return (rf"题面标准参数 $p={sp.latex(2*f)}$；抛物线方程为 $y^2={sp.latex(4*f)}x$。", [
            r"注意两种参数约定：题面为 $y^2=2px$，焦点到顶点距离 $f=p/2$；画板内部用 $y^2=4fx$，不能把两者当成同一参数。",
            rf"设交点横坐标为 $x_1,x_2$。由焦点—准线定义，$|{names['endpoints'][0]}{focus}|=x_1+f$、$|{names['endpoints'][1]}{focus}|=x_2+f$。过焦点的非轴向弦有两交点分居焦点两侧，所以 $|{pair}|=x_1+x_2+2f$。",
            rf"中点横坐标 $\mu=(x_1+x_2)/2={sp.latex(mu)}$，于是 ${sp.latex(length)}=2\cdot({sp.latex(mu)})+2f$，解得 $f={sp.latex(f)}$、$p=2f={sp.latex(2*f)}$。",
            rf"回代可得 $y^2={sp.latex(4*f)}x$。同时 $L/4\le\mu<L/2$，保证 $f>0$ 且存在真实焦点弦；本题的数值满足该条件。",
        ])
    angle = _angle_for_part(spec, text, part)
    if not angle or not angle.get("supported") or angle.get("conflict"):
        return None
    c, mid_y, theta = angle["cot"], angle["midpointY"], angle["degree"]
    if kind == "length":
        if re.search(r"另|新的|重新|垂直|⊥|平行|中点|距离|象限|过点|不成立|不是|或|[<>≥≤]", _compact(body).split("求", 1)[0]):
            return None
        return (rf"$|{pair}|={sp.latex(angle['length'])}$。", [
            rf"由第（{spec['dataPart']}）问保留原弦长和中点条件，焦距 $f={sp.latex(f)}$。直线倾斜角 $\theta={theta}^\circ$，可以统一写为 $x=y\cot\theta+f$；这也包含 $90^\circ$ 的竖直焦点弦。",
            r"联立 $y^2=4fx$，得 $y^2-4f\cot\theta\,y-4f^2=0$。由韦达定理，$y_1+y_2=4f\cot\theta$、$y_1y_2=-4f^2$。",
            r"故 $\mu=f(1+2\cot^2\theta)$，而焦点弦长 $L=2\mu+2f=4f(1+\cot^2\theta)=4f/\sin^2\theta$。",
            rf"代入得 $L={sp.latex(angle['length'])}$。精确检验该角度下 $\mu={sp.latex(angle['midpointX'])}$，与原题 ${sp.latex(mu)}$ 一致，因此没有丢弃第（{spec['dataPart']}）问的条件。",
        ])
    if not re.search(rf"{re.escape(target)}{re.escape(names['endpoints'][0])}⊥{re.escape(target)}{re.escape(names['endpoints'][1])}", _compact(body), re.I):
        return None
    if not re.search(rf"设{re.escape(target)}为准线(?:上|上的)(?:一)?点|设{re.escape(target)}为准线上一点", _compact(body), re.I):
        return None
    if re.search(r"象限|纵坐标|横坐标|距离|平行|不设|不为|不是|不在准线|非准线|不垂直|不满足|不成立|或|[<>≤≥]", _compact(body)):
        return None
    return (rf"${target}=({sp.latex(-f)},{sp.latex(mid_y)})$，且此点唯一。", [
        rf"沿用前问中的同一条焦点弦：$f={sp.latex(f)}$，$\theta={theta}^\circ$。准线为 $x={sp.latex(-f)}$，设 ${target}=(-f,t)$。",
        r"把弦统一写为 $x=c y+f$，其中 $c=\cot\theta$。令交点纵坐标为 $y_1,y_2$，则 $y_1+y_2=4fc$、$y_1y_2=-4f^2$。",
        rf"因此 $\overrightarrow{{{target}{names['endpoints'][0]}}}\cdot\overrightarrow{{{target}{names['endpoints'][1]}}}=(cy_1+2f)(cy_2+2f)+(y_1-t)(y_2-t)$。代入韦达量，整理恰为 $(t-2fc)^2$。",
        rf"由 ${target}{names['endpoints'][0]}\perp {target}{names['endpoints'][1]}$，数量积等于 $0$，故 $t=2f\cot\theta={sp.latex(mid_y)}$，从而 ${target}=({sp.latex(-f)},{sp.latex(mid_y)})$。",
        "反过来将该坐标代入，数量积确实为零；方程是一个实数平方等于零，只有一个解。因此既验证了存在，也证明了唯一性。该点就是弦中点向准线作垂线得到的垂足。",
    ])


def decorate_scene(scene: dict, text: str, parts: list[dict]) -> dict | None:
    """Add actual focus/chord/midpoint/foot dependencies, preserving user data."""
    spec = _matching(scene, text)
    if spec is None:
        return None
    context = {"spec": spec, "parts": spec["parts"], "p": scalar(spec["exact"]["p"]), "graphInstalled": False}
    scene["parabolaFocalData"] = spec
    names = spec["names"]
    objects, lines = scene.setdefault("objects", []), scene.setdefault("lines", [])
    polygons, points = scene.setdefault("polygons", []), scene.setdefault("points", {})
    bindings = scene.get("pointBindings") or {}
    protected = set(names["endpoints"]) | {names["target"], "N₀"}
    if protected.intersection(points) or protected.intersection(bindings):
        return context
    if any(str(item.get("id", "")).startswith(PREFIX) and item.get("source") != "derived" for item in objects+lines+polygons):
        return context
    if any(item.get("label") in protected and not (str(item.get("id", "")).startswith(PREFIX) and item.get("source") == "derived") for item in objects+lines):
        return context
    perpendicular_part = spec["parts"].get("perpendicular")
    perpendicular_request = next((part for part in parts if part.get("index", 0) == perpendicular_part), None)
    # A valid angle alone does not license a point for a negated, restricted,
    # or differently named orthogonality statement.
    spec["perpendicularResolved"] = bool(perpendicular_request and solve_part(scene, text, perpendicular_request))
    refs = ["feature:"+name for name in names["endpoints"]]
    f = float(spec["p"])
    expected = {
        PREFIX+"directrix": {"kind": "vertical", "x": -f, "label": "准线"},
        PREFIX+"chord": {"kind": "construction", "op": "segment", "refs": refs, "label": "弦 "+"".join(names["endpoints"])},
        PREFIX+"midpoint": {"kind": "construction", "op": "midpoint", "refs": refs, "label": "N₀"},
    }
    if spec["perpendicularResolved"]:
        expected[PREFIX+"M"] = {"kind": "construction", "op": "foot", "refs": [PREFIX+"midpoint", PREFIX+"directrix"], "label": names["target"]}
        for name, ref in zip(names["endpoints"], refs):
            expected[PREFIX+"M"+name] = {"kind": "construction", "op": "segment", "refs": [PREFIX+"M", ref], "label": names["target"]+name}
        expected[PREFIX+"triangle"] = {"kind": "polygon", "labels": [names["target"], *names["endpoints"]], "label": "△"+names["target"]+"".join(names["endpoints"])}
    for item in objects+lines+polygons:
        identifier = str(item.get("id", ""))
        if identifier.startswith(PREFIX):
            required = expected.get(identifier)
            if required is None or any(item.get(key) != value for key, value in required.items()):
                # Namespaces alone are not proof of ownership: preserve a
                # colliding derived object instead of silently replacing it.
                return context
    scope = list(dict.fromkeys(part.get("index", 0) for part in parts))
    for name, coordinates in ((names["focus"], [f, 0]), (names["directrixFoot"], [-f, 0])):
        if name in bindings:
            return context
        points.setdefault(name, coordinates)
        scene.setdefault("pointParts", {})[name] = scope
    common = {"source": "derived", "visible": True, "parts": scope}

    def append_unique(items: list[dict], item: dict) -> None:
        if not any(existing.get("id") == item["id"] for existing in items):
            items.append(item)

    directrix = PREFIX+"directrix"
    append_unique(lines, {"id": directrix, "kind": "vertical", "x": -f, "label": "准线", **common})
    append_unique(objects, {"id": PREFIX+"chord", "kind": "construction", "op": "segment", "refs": refs, "label": "弦 "+"".join(names["endpoints"]), **common})
    append_unique(objects, {"id": PREFIX+"midpoint", "kind": "construction", "op": "midpoint", "refs": refs, "label": "N₀", **common})
    if perpendicular_part is not None and spec["perpendicularResolved"]:
        restricted = {"source": "derived", "visible": True, "part": perpendicular_part}
        target_id = PREFIX+"M"
        append_unique(objects, {"id": target_id, "kind": "construction", "op": "foot", "refs": [PREFIX+"midpoint", directrix], "label": names["target"], **restricted})
        for name, ref in zip(names["endpoints"], refs):
            append_unique(objects, {"id": PREFIX+"M"+name, "kind": "construction", "op": "segment", "refs": [target_id, ref], "label": names["target"]+name, **restricted})
        append_unique(polygons, {"id": PREFIX+"triangle", "kind": "polygon", "labels": [names["target"], *names["endpoints"]], "label": "△"+names["target"]+"".join(names["endpoints"]), **restricted})
    scene["dynamicLine"] = scene["showDynamic"] = True
    scene["lineThrough"] = "point:"+names["focus"]
    scene["dynamicIntersectionLabels"] = list(names["endpoints"])
    scene["dynamicLineParts"] = scope
    scene.pop("dynamicLinePart", None)
    scene["theta"] = spec["thetaResolved"] if spec["thetaResolved"] is not None else spec["thetaDefault"]
    context["graphInstalled"] = True
    return context


def checks(context: dict | None) -> list[dict]:
    if not context:
        return []
    spec = context.get("spec") or context.get("parabolaFocalData") or context
    certificate = proof_certificate(spec)
    if not certificate or not certificate["verified"]:
        return []
    result = [{"id": "parabola-focal-data-parameter", "label": "焦点弦数据确定标准方程", "status": "verified", "category": "curve", "part": spec["parts"].get("equation"), "detail": "精确验证 L=2μ+2f、p_standard=2f 与 L/4≤μ<L/2；不混用两种抛物线参数。"}]
    if spec.get("angleConflict"):
        result.append({"id": "parabola-focal-data-angle-conflict", "label": "倾斜角与原题数据不相容", "status": "contradicted", "category": "answer", "part": spec.get("anglePart"), "detail": "后续小问必须保留原弦长和中点条件，不能把与 μ=f(1+2cot²θ) 冲突的角度当成可行图形。"})
    elif spec.get("perpendicularResolved") and "perpendicular" in spec["parts"]:
        result.append({"id": "parabola-focal-data-orthogonality", "label": "准线垂直点存在且唯一", "status": "verified", "category": "answer", "part": spec["parts"]["perpendicular"], "detail": "由韦达量精确化简 MA·MB=(t−2f cotθ)²，求解并回代；不是按画面外观断言垂直。"})
    if context.get("graphInstalled") is False:
        result.append({"id": "parabola-focal-data-graph-preservation", "label": "保留既有对象，未覆盖冲突构造", "status": "unresolved", "category": "scene", "detail": "现有点、绑定或构造与自动生成对象存在名称/依赖冲突，已保留用户数据；数学证明与当前图形分别核验。"})
    return result
