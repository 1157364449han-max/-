"""Exact focus/directrix loci and a general three-vertex rectangle theorem.

This module is independent of the server and of the question bank.  It accepts
only an axis-aligned fixed line and numerical fixed focus.  Application ``p``
means focus-to-vertex distance: ``minor**2 = 4*p*direction*axial``.
Untrusted text is never passed to SymPy's expression parser or to ``eval``.
"""
from __future__ import annotations

import math
import re

import sympy as sp


def normalise(text: str) -> str:
    """Normalize the small supported numeric TeX vocabulary without evaluating it."""
    text = str(text).replace("（", "(").replace("）", ")").replace("，", ",")
    text = text.replace("−", "-").replace("＞", ">").replace("＜", "<")
    text = text.replace("½", "(1/2)")
    for command in (r"\left", r"\right", r"\,", r"\!", r"\(", r"\)", r"\[", r"\]"):
        text = text.replace(command, "")
    for _ in range(12):
        old = text
        text = re.sub(r"\\sqrt\{([^{}]+)\}", r"sqrt(\1)", text)
        text = re.sub(r"\\(?:d?frac)\{([^{}]+)\}\{([^{}]+)\}", r"(\1)/(\2)", text)
        text = re.sub(r"\\(?:d?frac)\{([^{}]+)\}([0-9])", r"(\1)/(\2)", text)
        text = re.sub(r"\\(?:d?frac)([0-9])\{([^{}]+)\}", r"(\1)/(\2)", text)
        text = re.sub(r"\\(?:d?frac)([0-9])([0-9])", r"(\1)/(\2)", text)
        if text == old:
            break
    text = text.replace(r"\sqrt", "sqrt").replace("²", "^2")
    return re.sub(r"\s+", "", text.replace("$", ""))


def scalar(token: str) -> sp.Expr:
    """Parse rational arithmetic and real square roots using a restricted grammar.

    No symbols, exponents, attribute access, function names other than sqrt,
    or Python/SymPy expression evaluation are admitted.  Size/depth limits also
    prevent deliberately huge nested arithmetic in a pasted problem.
    """
    value = normalise(token)
    if not value or len(value) > 100:
        raise ValueError("数值格式无效")
    tokens = re.findall(r"\d+(?:\.\d+)?|sqrt|√|[()+\-*/]", value)
    if "".join(tokens) != value:
        raise ValueError("仅支持整数、分数和实数根式")
    expanded = []
    for token in tokens:
        if expanded and token in ("sqrt", "√") and (expanded[-1] == ")" or re.fullmatch(r"\d+(?:\.\d+)?", expanded[-1])):
            expanded.append("*")
        expanded.append(token)
    tokens = expanded
    position = 0

    def bounded(result: sp.Expr) -> sp.Expr:
        result = sp.simplify(result)
        if result.is_real is not True or result.is_finite is not True:
            raise ValueError("数值必须是有限实数")
        for number in result.atoms(sp.Rational):
            if max(abs(int(number.p)).bit_length(), int(number.q).bit_length()) > 256:
                raise ValueError("数值过大")
        return result

    def atom(depth: int) -> sp.Expr:
        nonlocal position
        if depth > 20 or position >= len(tokens):
            raise ValueError("数值括号不完整或嵌套过深")
        current = tokens[position]
        position += 1
        if current in ("+", "-"):
            return bounded((1 if current == "+" else -1) * atom(depth + 1))
        if current in ("sqrt", "√"):
            radicand = atom(depth + 1)
            if radicand.is_nonnegative is not True:
                raise ValueError("根号内不能为负数")
            return bounded(sp.sqrt(radicand))
        if current == "(":
            result = expression(depth + 1)
            if position >= len(tokens) or tokens[position] != ")":
                raise ValueError("数值括号不完整")
            position += 1
            return result
        if not re.fullmatch(r"\d+(?:\.\d+)?", current) or len(current) > 30:
            raise ValueError("数值格式无效")
        return bounded(sp.Rational(current))

    def product(depth: int) -> sp.Expr:
        nonlocal position
        result = atom(depth)
        while position < len(tokens) and tokens[position] in ("*", "/"):
            operator = tokens[position]
            position += 1
            operand = atom(depth)
            if operator == "/" and operand == 0:
                raise ValueError("分母不能为零")
            result = bounded(result * operand if operator == "*" else result / operand)
        return result

    def expression(depth: int) -> sp.Expr:
        nonlocal position
        result = product(depth)
        while position < len(tokens) and tokens[position] in ("+", "-"):
            operator = tokens[position]
            position += 1
            operand = product(depth)
            result = bounded(result + operand if operator == "+" else result - operand)
        return result

    result = expression(0)
    if position != len(tokens):
        raise ValueError("数值格式无效")
    return result


def _pair(text: str, start: int) -> tuple[tuple[sp.Expr, sp.Expr], int] | None:
    """Read balanced coordinate parentheses, including roots/fractions inside."""
    if start >= len(text) or text[start] != "(":
        return None
    depth, comma = 0, None
    for end in range(start, min(len(text), start + 210)):
        char = text[end]
        depth += (char == "(") - (char == ")")
        if char == "," and depth == 1:
            if comma is not None:
                return None
            comma = end
        if depth == 0:
            if comma is None:
                return None
            try:
                return (scalar(text[start + 1:comma]), scalar(text[comma + 1:end])), end + 1
            except ValueError:
                return None
    return None


def _numeric_prefix(text: str) -> str:
    match = re.match(r"(?:sqrt|[0-9√()+\-*/.])+", text)
    return match.group(0) if match else ""


def _shift(variable: str, offset: sp.Expr, latex: bool = False) -> str:
    if offset == 0:
        return variable
    number = sp.latex(abs(offset)) if latex else str(abs(offset))
    return f"({variable}{'-' if offset > 0 else '+'}{number})"


def infer(text: str) -> dict | None:
    """Infer a full locus only from an explicit equal-distance definition.

    A point on the proposed directrix gives a degenerate line, not a parabola;
    ambiguous fixed points/lines or extra locus restrictions are not invented
    away.  Explicit equations can continue to be handled by existing parsers.
    """
    compact = normalise(text)
    head = re.split(r"\([1-9]\)(?=求|证明|已知|设|若)", compact, maxsplit=1)[0]
    if not re.search(r"距离等于(?:动?点[A-Za-z][A-Za-z0-9_]*)?到|距离(?:相等|相同)|等距", head):
        return None
    if re.search(r"第[一二三四]象限|限定|只在|同时|且|满足|[xy][<>≤≥]|横坐标|纵坐标|点[A-Za-z][A-Za-z0-9_]*在|距离(?:都|均|分别)?(?:等于|为|是)(?:[0-9]|sqrt|√)", head):
        return None
    moving_subjects = {match.group(1).upper() for match in re.finditer(r"点([A-Za-z][A-Za-z0-9_]*)到", head)}
    if len(moving_subjects) > 1:
        return None
    lines: list[tuple[str, sp.Expr]] = []
    for match in re.finditer(r"(?:到|与)(?:直线)?([xy])轴", head, re.I):
        lines.append(("y" if match.group(1).lower() == "x" else "x", sp.Integer(0)))
    if re.search(r"[xy]轴(?:和|与|、)[xy]轴", head, re.I):
        return None
    for match in re.finditer(r"(?:到|与)(?:直线)?([xy])=", head, re.I):
        try:
            token = _numeric_prefix(head[match.end():])
            remainder = head[match.end() + len(token):]
            if remainder and not re.match(r"(?:的?距离|[,。；;]|与|和|到)", remainder):
                return None
            value = scalar(token)
        except ValueError:
            continue
        lines.append((match.group(1).lower(), value))
    lines = list(dict.fromkeys(lines))
    foci: list[tuple[str, tuple[sp.Expr, sp.Expr]]] = []
    for match in re.finditer(r"(?:到|与)(?:固定点|定点|点)?(?P<name>[A-Za-z][A-Za-z0-9_]*)?(?=\()", head):
        pair = _pair(head, match.end())
        if pair:
            foci.append((match.group("name") or "F", pair[0]))
    for match in re.finditer(r"(?:固定点|定点|点)(?P<name>[A-Za-z][A-Za-z0-9_]*)(?=\()", head):
        name = match.group("name")
        if not re.search(rf"(?:到|与)(?:点)?{re.escape(name)}(?:的?距离|与|和)", head):
            continue
        pair = _pair(head, match.end())
        if pair:
            foci.append((name, pair[0]))
    foci = list(dict.fromkeys(foci))
    if len(lines) != 1 or len(foci) != 1:
        return None
    axis, directrix = lines[0]
    focus_name, (fx, fy) = foci[0]
    focus_name = focus_name.upper()
    axis_focus = fx if axis == "x" else fy
    separation = sp.simplify(axis_focus - directrix)
    if separation == 0 or separation.is_nonzero is not True:
        return None
    p = sp.simplify(abs(separation) / 2)
    direction = 1 if separation > 0 else -1
    h = sp.simplify((fx + directrix) / 2) if axis == "x" else fx
    k = fy if axis == "x" else sp.simplify((fy + directrix) / 2)
    vertical = axis == "y"
    x, y = sp.symbols("x y", real=True)
    focus_squared = sp.expand((x - fx)**2 + (y - fy)**2)
    directrix_squared = sp.expand(((x if axis == "x" else y) - directrix)**2)
    implicit = sp.factor(focus_squared - directrix_squared)
    minor, axial = (_shift("x", h), _shift("y", k)) if vertical else (_shift("y", k), _shift("x", h))
    coefficient = sp.simplify(4 * p * direction)
    equation = f"{minor}²={coefficient if coefficient != 1 else ''}{axial}"
    locus_match = re.search(r"轨迹(?:为|是|记为)([A-Za-z][A-Za-z0-9_]*)", head)
    moving_match = re.search(r"点([A-Za-z][A-Za-z0-9_]*)到", head)
    return {
        "type": "parabola", "p": float(p), "direction": direction,
        "orientation": "vertical" if vertical else "horizontal", "h": float(h), "k": float(k),
        "lineThrough": "focus2", "theta": 42, "dynamicLine": False,
        "points": {focus_name: [float(fx), float(fy)]}, "lines": [], "objects": [],
        "equation": equation, "inferred_from_conditions": True, "inferredFromConditions": True,
        "exact": {"p": str(p), "h": str(h), "k": str(k), "direction": str(direction)},
        "locusDefinition": {
            "schema": "dongjiexi-focus-directrix-locus/v1", "focusName": focus_name,
            "focus": [str(fx), str(fy)], "directrix": {"axis": axis, "value": str(directrix)},
            "locusName": locus_match.group(1).upper() if locus_match else "", "implicit": str(implicit),
            "movingPoint": moving_match.group(1).upper() if moving_match else "",
            "verifiedBy": "squared_distances_identity_and_nonnegative_reverse_check",
        },
        "derivation": [
            f"设动点坐标为 $(x,y)$。到定点的距离平方为 ${sp.latex(focus_squared)}$，到直线 ${axis}={sp.latex(directrix)}$ 的距离平方为 ${sp.latex(directrix_squared)}$。",
            f"两者相等，整理得到 ${sp.latex(implicit)}=0$，即 ${equation}$。",
            "反代原条件：两个距离均非负，平方相等可推出距离相等，因此没有增根。",
        ],
    }


def _scene_exact(scene: dict, key: str, default: int = 0) -> sp.Expr:
    raw = (scene.get("exact") or {}).get(key, scene.get(key, default))
    if isinstance(raw, (int, float)):
        return scalar(str(raw))
    return scalar(str(raw))


def proof_certificate(scene: dict) -> dict | None:
    """Compute the independent exact identities behind the rectangle bound."""
    if scene.get("type") != "parabola":
        return None
    try:
        p = _scene_exact(scene, "p")
    except ValueError:
        return None
    if p.is_positive is not True:
        return None
    t = sp.symbols("t", positive=True)
    a, b, c = sp.symbols("a b c", real=True)
    dot = sp.Matrix([b-a, b*b-a*a]).dot(sp.Matrix([c-b, c*c-b*b]))
    identity = sp.factor(dot)
    function = (1+t*t)**sp.Rational(3, 2)/t
    derivative = sp.simplify(sp.diff(function, t))
    derivative_expected = sp.sqrt(1+t*t)*(2*t*t-1)/(t*t)
    minimizer = sp.sqrt(sp.Rational(1, 2))
    minimum = sp.simplify(function.subs(t, minimizer))
    verified = sp.simplify(dot-(b-a)*(c-b)*(1+(a+b)*(b+c))) == 0
    verified = verified and sp.simplify(derivative-derivative_expected) == 0
    verified = verified and minimum == 3*sp.sqrt(3)/2 and minimizer != 1
    return {
        "schema": "dongjiexi-parabola-rectangle-proof/v1", "verified": bool(verified),
        "p": str(p), "dotIdentity": str(identity), "function": str(function),
        "derivative": str(derivative), "minimizer": str(minimizer), "minimum": str(minimum),
        "strictBound": str(sp.simplify(12*sp.sqrt(3)*p)),
        "equalityRequirements": ["t=1", "t=1/sqrt(2)"],
        "boundIsNotClaimedAsInfimum": True,
    }


def _rectangle_claim(scene: dict, text: str, body: str) -> sp.Expr | None:
    compact, request = normalise(text), normalise(body)
    if not ("矩形" in compact and re.search(r"三个顶点|三顶点|3个顶点", compact)):
        return None
    declaration = re.search(r"(?:三个顶点|三顶点|3个顶点)在([^。；;]{1,40}?)上", compact)
    curve_names = {str((scene.get('locusDefinition') or {}).get('locusName') or '').upper()}
    curve_names.update(match.group(1).upper() for match in re.finditer(r"(?:抛物线|轨迹|曲线)([A-Za-z][A-Za-z0-9_]*)", compact))
    if not declaration or not ("抛物线" in declaration.group(1) or declaration.group(1).upper() in curve_names - {''}):
        return None
    request = request.replace("求证", "证明")
    if "周长" not in request or not re.search(r"证明|证", request):
        return None
    if re.search(r"求|最大|最小|面积|范围|坐标|角度", request):
        return None
    match = re.search(r"周长(?:大于|>)", request)
    if not match:
        return None
    token = _numeric_prefix(request[match.end():])
    try:
        desired = scalar(token)
        p = _scene_exact(scene, "p")
    except ValueError:
        return None
    if p.is_positive is not True or desired.is_positive is not True:
        return None
    # This theorem establishes a useful strict lower bound, not the optimal
    # perimeter.  Keep the supported claim identical to the browser engine;
    # weaker/stronger or compound requests stay explicitly unsupported.
    difference = sp.simplify(12*sp.sqrt(3)*p-desired)
    return desired if difference == 0 else None


def solve_part(scene: dict, text: str, part: dict) -> tuple[str, list[str]] | None:
    """Return independently proved supported conclusions; otherwise abstain."""
    if scene.get("type") != "parabola":
        return None
    body = part.get("body") or part.get("question") or ""
    definition = scene.get("locusDefinition")
    if isinstance(definition, dict) and re.search(r"求|确定|写出", body) and re.search(r"(?:轨迹|方程)", body):
        # Only the original defined locus, not a later point's different locus.
        name = str(definition.get("locusName") or "")
        moving = str(definition.get("movingPoint") or "")
        goal_name = re.search(r"(?:点)?([A-Za-z][A-Za-z0-9_]*)的?(?:轨迹|方程)", normalise(body))
        supported_name = goal_name is None or goal_name.group(1).upper() in {name.upper(), moving.upper()}
        goal_start = re.search(r"求|确定|写出", body)
        goal = body[goal_start.start():] if goal_start else body
        extra_goals = re.search(r"最大|最小|最值|范围|面积|周长|切线|法线|坐标|离心率|证明|并|以及|同时|和|距离|长度|角度|夹角|焦点|准线|交点|说明", goal)
        if supported_name and not extra_goals and ("轨迹" in body or not name or name.lower() in body.lower()):
            return f"轨迹方程为 ${scene['equation']}$。", list(scene.get("derivation") or [])
    desired = _rectangle_claim(scene, text, body)
    if desired is None:
        return None
    certificate = proof_certificate(scene)
    if not certificate or not certificate["verified"]:
        return None
    p = _scene_exact(scene, "p")
    bound = sp.simplify(12*sp.sqrt(3)*p)
    return (
        f"矩形周长 $L>{sp.latex(bound)}$" + (f"，从而 $L>{sp.latex(desired)}$。" if desired != bound else "。"),
        [
            f"平移到抛物线顶点，必要时交换坐标轴、反射轴向，再把两个坐标同除以 $4p={sp.latex(4*p)}$，得到 $Y=X^2$。这种变换把长度统一缩放为原来的 $1/(4p)$，且保持垂直关系。",
            r"将曲线上三个连续的矩形顶点记为 $A(a,a^2),B(b,b^2),C(c,c^2)$。由顶点互异，$a\ne b$、$b\ne c$；垂直条件为 $(b-a)(c-b)[1+(a+b)(b+c)]=0$，所以 $(a+b)(b+c)=-1$。",
            r"交换 $A,C$ 后，不妨设 $t=|b+c|\in(0,1]$，则 $|a+b|=1/t$。原图相邻边长度之和为 $4p\bigl(|b-a|\sqrt{1+t^{-2}}+|c-b|\sqrt{1+t^2}\bigr)$。",
            r"因为 $\sqrt{1+t^{-2}}\ge\sqrt{1+t^2}$，再用三角不等式，得到 $|AB|+|BC|\ge4p|c-a|\sqrt{1+t^2}$。由 $a+b$、$b+c$ 异号，$|c-a|=t+1/t$，故 $|AB|+|BC|\ge4p(1+t^2)^{3/2}/t$。",
            r"令 $f(t)=(1+t^2)^{3/2}/t$，则 $f'(t)=\sqrt{1+t^2}(2t^2-1)/t^2$。导数在 $t=1/\sqrt2$ 左侧为负、右侧为正，所以 $f(t)\ge3\sqrt3/2$。",
            rf"因此 $L=2(|AB|+|BC|)\ge12\sqrt3 p={sp.latex(bound)}$。但第一次放缩取等（$|b-a|>0$）要求 $t=1$，而函数取最小要求 $t=1/\sqrt2$，两者不可能同时成立。因此严格有 $L>{sp.latex(bound)}$。",
            "这里证明的是严格下界，不把该下界冒充可达到的最小值；示意矩形也不能替代这个对任意合法顶点的符号证明。",
        ],
    )


def decorate_scene(scene: dict, text: str, parts: list[dict]) -> dict:
    """Add the supported definition diagram and a legal illustrative rectangle.

    The diagram is a genuine dependency graph (P -> H -> equal-distance
    segments), not a copy of guessed point coordinates.  Rectangle examples
    are installed only for the proved request and only if no given names,
    bindings or extra geometric constraints would be overwritten.
    """
    if scene.get("type") != "parabola":
        return scene
    inferred = infer(text)
    definition = inferred.get("locusDefinition") if inferred else None
    matches = bool(inferred)
    if matches:
        try:
            matches = scene.get("orientation", "horizontal") == inferred["orientation"] and scene.get("direction", 1) == inferred["direction"]
            matches = matches and all(abs(float(scene.get(key, 0))-float(inferred[key])) <= 1e-10*max(1, abs(float(inferred[key]))) for key in ("p", "h", "k"))
        except (TypeError, ValueError, OverflowError):
            matches = False
    objects = scene.setdefault("objects", [])
    lines = scene.setdefault("lines", [])
    points = scene.setdefault("points", {})
    bindings = scene.get("pointBindings") or {}

    def append_unique(items: list[dict], item: dict) -> None:
        if not any(current.get("id") == item["id"] for current in items):
            items.append(item)

    if matches and definition:
        scene["locusDefinition"] = definition
        scene.setdefault("curveLabel", definition.get("locusName") or "")
        moving = definition.get("movingPoint") or "P"
        focus_name = definition.get("focusName") or "F"
        eligible = next((part for part in parts if re.search(r"轨迹|方程", part.get("body") or part.get("question") or "") and solve_part(scene, text, part)), None)
        own_prefix = "parabola-definition-"
        # Repeated decoration is idempotent.  Non-derived objects bearing the
        # same names/IDs are user data, never a reason to replace their values.
        foreign_moving = any(item.get("label") == moving and not (str(item.get("id", "")).startswith(own_prefix) and item.get("source") == "derived") for item in objects)
        foreign_ids = any(str(item.get("id", "")).startswith(own_prefix) and item.get("source") != "derived" for item in objects+lines)
        if eligible is not None and moving not in points and moving not in bindings and not foreign_moving and not foreign_ids:
            part_index = eligible.get("index")
            common = {"part": part_index, "source": "derived", "visible": True}
            moving_id, focus_id, line_id, foot_id = (own_prefix+suffix for suffix in ("moving", "focus", "directrix", "foot"))
            fx, fy = map(scalar, definition["focus"])
            existing_focus = points.get(focus_name)
            focus_ref = focus_id
            focus_matches = True
            if isinstance(existing_focus, (list, tuple)) and len(existing_focus) == 2:
                try:
                    focus_matches = all(abs(float(value)-float(expected)) <= 1e-10*max(1, abs(float(expected))) for value, expected in zip(existing_focus, (fx, fy)))
                except (TypeError, ValueError, OverflowError):
                    focus_matches = False
                focus_ref = "feature:"+focus_name
            conflicting_focus = next((item for item in objects if item.get("label") == focus_name and item.get("id") != focus_id), None)
            if conflicting_focus is not None:
                try:
                    compatible = conflicting_focus.get("kind") == "point" and all(abs(float(conflicting_focus.get(key, math.inf))-float(expected)) <= 1e-10*max(1, abs(float(expected))) for key, expected in zip(("x", "y"), (fx, fy)))
                except (TypeError, ValueError, OverflowError):
                    compatible = False
                if compatible:
                    focus_ref = conflicting_focus["id"]
                else:
                    focus_matches = False
            if focus_matches:
                if focus_ref == focus_id:
                    append_unique(objects, {"id": focus_id, "kind": "point", "x": float(fx), "y": float(fy), "label": focus_name, **common})
                directrix = definition["directrix"]
                if directrix["axis"] == "x":
                    line = {"id": line_id, "kind": "vertical", "x": float(scalar(directrix["value"])), "label": "准线", **common}
                else:
                    line = {"id": line_id, "kind": "slope", "m": 0.0, "b": float(scalar(directrix["value"])), "label": "准线", **common}
                append_unique(lines, line)
                append_unique(objects, {"id": moving_id, "kind": "construction", "op": "point_on", "refs": ["$conic"], "t": float(4*_scene_exact(scene, "p")), "label": moving, **common})
                append_unique(objects, {"id": foot_id, "kind": "construction", "op": "foot", "refs": [moving_id, line_id], "label": "H₀", **common})
                append_unique(objects, {"id": own_prefix+"focal-distance", "kind": "construction", "op": "segment", "refs": [moving_id, focus_ref], "label": moving+focus_name, **common})
                append_unique(objects, {"id": own_prefix+"line-distance", "kind": "construction", "op": "segment", "refs": [moving_id, foot_id], "label": moving+"H₀", **common})
                scene["dynamicLine"] = scene["showDynamic"] = False

    compact = normalise(text)
    rectangle_match = re.search(r"矩形([A-Za-z])([A-Za-z])([A-Za-z])([A-Za-z])(?:有)?(?:三个|3个)顶点(?:在|位于)", compact)
    if not rectangle_match:
        return scene
    names = [name.upper() for name in rectangle_match.groups()]
    if len(set(names)) != 4 or scene.get("rectangularParabola"):
        return scene
    scope = re.split(r"\([1-9]\)", compact[rectangle_match.start():], maxsplit=1)[0]
    if re.search(r"且|同时|满足|限制|仅|象限|横坐标|纵坐标|[≥≤]|过定点|经过|边长|长度为|面积为|平行|垂直", scope):
        return scene
    existing_names = set(points) | set(bindings) | {item.get("label") for item in objects+lines}
    if any(name in existing_names or re.search(rf"(?:点)?{re.escape(name)}\(", compact, re.I) for name in names):
        return scene
    rectangle_part = next((part for part in parts if _rectangle_claim(scene, text, part.get("body") or part.get("question") or "") is not None and solve_part(scene, text, part) is not None), None)
    if rectangle_part is None:
        return scene
    certificate = proof_certificate(scene)
    if not certificate or not certificate["verified"]:
        return scene
    try:
        p, h, k = (_scene_exact(scene, key) for key in ("p", "h", "k"))
        direction = -1 if scene.get("direction") == -1 else 1
        vertical = scene.get("orientation") == "vertical"
        local = [(4*p, 4*p), (sp.Integer(0), sp.Integer(0)), (-4*p, 4*p), (sp.Integer(0), 8*p)]
        vertices = [(h+minor, k+direction*axial) if vertical else (h+direction*axial, k+minor) for minor, axial in local]
        rendered = [[float(x), float(y)] for x, y in vertices]
        bound = sp.simplify(12*sp.sqrt(3)*p)
        if not all(math.isfinite(value) for pair in rendered for value in pair) or not math.isfinite(float(bound)):
            return scene
    except (TypeError, ValueError, OverflowError):
        return scene
    part_index = rectangle_part.get("index")
    scene["rectangularParabola"] = {
        "schema": "dongjiexi-parabola-three-vertices/v1", "names": names, "part": part_index,
        "b": 0, "u": 1, "p": float(p), "bound": float(bound), "threshold": sp.latex(bound), "example": True,
    }
    point_parts = scene.setdefault("pointParts", {})
    for name, pair in zip(names, rendered):
        points[name] = pair
        point_parts[name] = [part_index]
    polygons = scene.setdefault("polygons", [])
    polygons[:] = [item for item in polygons if item.get('labels') != names]
    append_unique(polygons, {"id": "parabola-rectangle", "kind": "polygon", "labels": names, "label": "矩形 "+"".join(names), "part": part_index, "source": "derived", "visible": True})
    scene["dynamicLine"] = scene["showDynamic"] = False
    scene["showFeatures"] = False
    return scene
