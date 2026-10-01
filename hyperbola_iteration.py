"""Exact, bank-independent rectangular-hyperbola chord/reflection iteration.

Supported premise: x²-y²=m>0, a numerical initial point on the right branch,
one constant slope 0<k<1, intersection with the left branch, then reflection
in the y axis.  Conclusions are proved symbolically, never by sampling poses.
Numeric text uses the bounded rational/root grammar from parabola_locus; no
untrusted text is sent to eval, sympify, or SymPy's expression parser.
"""
from __future__ import annotations

from functools import lru_cache
import math
import re

import sympy as sp

from parabola_locus import normalise, scalar


SCHEMA = "dongjiexi-hyperbola-iteration/v1"
PREFIX = "iteration-"
SUBSCRIPTS = str.maketrans("0123456789", "₀₁₂₃₄₅₆₇₈₉")


def _compact(text: str) -> str:
    value = normalise(text).replace(r"\_", "_")
    value = re.sub(r"\^\{2\}", "^2", value)
    value = re.sub(r"_\{([^{}]+)\}", r"_\1", value)
    value = value.replace(r"\{", "{").replace(r"\}", "}")
    for digit, subscript in zip("0123456789", "₀₁₂₃₄₅₆₇₈₉"):
        value = re.sub(rf"(?<=[A-Za-z]){subscript}", "_"+digit, value)
        value = value.replace(subscript, digit)
    return value


def _number_prefix(value: str) -> tuple[sp.Expr, int] | None:
    """Read only a bounded scalar, with an explicit token boundary."""
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


def _pair(value: str, start: int) -> tuple[tuple[sp.Expr, sp.Expr], int] | None:
    if start >= len(value) or value[start] != "(":
        return None
    depth, comma = 0, None
    for end in range(start, min(len(value), start+210)):
        char = value[end]
        depth += (char == "(")-(char == ")")
        if char == "," and depth == 1:
            if comma is not None:
                return None
            comma = end
        if depth == 0:
            if comma is None:
                return None
            try:
                return (scalar(value[start+1:comma]), scalar(value[comma+1:end])), end+1
            except ValueError:
                return None
    return None


def _name(prefix: str, index: int) -> str:
    return prefix+str(index).translate(SUBSCRIPTS)


def _texname(prefix: str, index: str | int) -> str:
    return prefix+"_{"+str(index)+"}"


def _explicit_k(body: str) -> sp.Expr | None:
    matches = list(re.finditer(r"(?<![A-Za-z_])k=", _compact(body)))
    if len(matches) != 1:
        return None
    value = _number_prefix(_compact(body)[matches[0].end():])
    if not value or not (value[0].is_positive is True and (1-value[0]).is_positive is True):
        return None
    return value[0]


def infer(text: str) -> dict | None:
    """Recognize a bounded general construction, not a question ID or answer."""
    if len(str(text)) > 20000:
        return None
    compact = _compact(text)
    # A root such as sqrt(5) is not a numbered subquestion.
    head = re.split(r"\([1-9][0-9]?\)(?=若|求|证明|设|已知|确定|计算|写出)", compact, maxsplit=1)[0]
    equation = re.search(r"(?<![0-9A-Za-z*/^])x\^2-y\^2=", head)
    if not equation or not re.search(r"0<k<1|k(?:∈|\\in)\(0,1\)", head):
        return None
    # Bind the through-point, other branch, and reflection indices together.
    chord = re.search(r"过([A-Za-z])_?(n-1|n)(?:作|的)(.{0,100}?)斜率为k(.{0,100}?)左支交于([A-Za-z])_?(n-1|n)", head, re.I)
    reflection = re.search(r"([A-Za-z])_?(n\+1|n)(?:为|是)([A-Za-z])_?(n-1|n)关于y轴的对称点", head, re.I)
    if not chord or not reflection:
        return None
    point_prefix, other_prefix = chord.group(1).upper(), chord.group(5).upper()
    if point_prefix == other_prefix or reflection.group(1).upper() != point_prefix or reflection.group(3).upper() != other_prefix:
        return None
    if chord.group(2) != chord.group(6) or reflection.group(4) != chord.group(2):
        return None
    if (chord.group(2), reflection.group(2)) not in {("n-1", "n"), ("n", "n+1")}:
        return None
    if re.search(r"不同斜率|斜率随|斜率为k_?n|关于x轴|关于直线|(?:限定|仅|同时满足)|非左支|不在左支|不令|不取|并非|不是.{0,30}对称|不(?:为|是).{0,30}对称|[xy]_?n(?:[-+]\d+)?[<>≤≥]", head):
        return None
    initial_matches = list(re.finditer(rf"{re.escape(point_prefix)}_?1(?=\()", head, re.I))
    curve_name_match = re.search(r"([A-Za-z])[:：]$", head[:equation.start()])
    curve_name = curve_name_match.group(1) if curve_name_match else None
    candidates = []
    for match in initial_matches:
        pair = _pair(head, match.end())
        if pair is None:
            continue
        declaration = head[pair[1]:]
        named_curve = re.match(r"(?:在|位于)([A-Za-z])(?:的)?(?:右支)?上", declaration, re.I)
        generic_curve = re.match(r"(?:在|位于)(?:该|此)?双曲线(?:的)?(?:右支)?上", declaration)
        if not generic_curve and (named_curve is None or curve_name is not None and named_curve.group(1).lower() != curve_name.lower()):
            continue
        candidates.append(pair[0])
    candidates = list(dict.fromkeys(candidates))
    if len(candidates) != 1:
        return None
    x1, y1 = candidates[0]
    m = sp.simplify(x1*x1-y1*y1)
    if x1.is_positive is not True or m.is_positive is not True:
        return None
    try:
        numeric = [float(x1), float(y1), float(m)]
        if not all(math.isfinite(value) for value in numeric) or max(abs(numeric[0]), abs(numeric[1])) > 1e4 or numeric[2] <= 0:
            return None
    except (ValueError, TypeError, OverflowError):
        return None
    rhs = head[equation.end():]
    if re.match(r"[A-Za-z](?![A-Za-z0-9_])", rhs):
        parameter = rhs[0]
        tail = rhs[1:]
        if tail.startswith("\\"):
            tail = tail[1:]
        if tail and not re.match(rf"[,。；;:]|\({re.escape(parameter)}>0\)", tail):
            return None
        # A contradictory/extra parameter restriction must not be erased.
        for constraint in re.finditer(rf"(?<![A-Za-z_]){re.escape(parameter)}([<>≤≥])", head):
            value = _number_prefix(head[constraint.end():])
            if value is None or constraint.group(1) != ">" or value[0] != 0:
                return None
        for assignment in re.finditer(rf"(?<![A-Za-z_]){re.escape(parameter)}=", head):
            value = _number_prefix(head[assignment.end():])
            if value is not None and sp.simplify(value[0]-m) != 0:
                return None
    else:
        value = _number_prefix(rhs)
        if value is None or sp.simplify(value[0]-m) != 0:
            return None
    k_default = sp.Rational(1, 2)
    match = re.search(r"若k=", compact)
    if match:
        value = _number_prefix(compact[match.end():])
        if value and value[0].is_positive is True and (1-value[0]).is_positive is True:
            k_default = value[0]
    initial_name = _name(point_prefix, 1)
    spec = {
        "schema": SCHEMA, "start": numeric[:2], "m": numeric[2],
        "exact": {"x1": str(x1), "y1": str(y1), "m": str(m)},
        "tex": {"x1": sp.latex(x1), "y1": sp.latex(y1), "m": sp.latex(m)},
        "kDefault": float(k_default), "k": float(k_default), "n": 1,
        "pointPrefix": point_prefix, "otherPrefix": other_prefix,
        "parts": {}, "example": True,
    }
    a = float(sp.sqrt(m))
    return {
        "type": "hyperbola", "a": a, "b": a, "h": 0, "k": 0,
        "orientation": "horizontal", "equation": f"x²-y²={m}",
        "exact": {"a2": str(m), "b2": str(m)},
        "hyperbolaIteration": spec, "points": {initial_name: numeric[:2]},
        "lines": [], "objects": [], "dynamicLine": False, "showDynamic": False,
        "inferred_from_conditions": True, "inferredFromConditions": True,
        "derivation": [rf"由 ${_texname(point_prefix, 1)}=({sp.latex(x1)},{sp.latex(y1)})$ 在曲线上，得 $m={sp.latex(x1)}^2-({sp.latex(y1)})^2={sp.latex(m)}$。"],
    }


def _matching(scene: dict, text: str) -> dict | None:
    candidate = infer(text)
    if candidate is None or scene.get("type") != "hyperbola" or scene.get("orientation", "horizontal") != "horizontal":
        return None
    try:
        for key in ("a", "b", "h", "k"):
            actual = float(scene.get(key, 0))
            expected = float(candidate[key])
            if not math.isfinite(actual) or abs(actual-expected) > 1e-10*max(1, abs(expected)):
                return None
        spec = candidate["hyperbolaIteration"]
        known = (scene.get("points") or {}).get(_name(spec["pointPrefix"], 1))
        if known is not None and (not isinstance(known, (list, tuple)) or len(known) != 2 or any(abs(float(a)-b) > 1e-10*max(1, abs(b)) for a, b in zip(known, spec["start"]))):
            return None
    except (TypeError, ValueError, OverflowError):
        return None
    return spec


@lru_cache(maxsize=1)
def _identities() -> dict:
    k, x, y = sp.symbols("k x y", real=True)
    matrix = sp.Matrix([[1+k*k, -2*k], [-2*k, 1+k*k]])/(1-k*k)
    new = matrix*sp.Matrix([x, y])
    q = sp.Matrix([-new[0], new[1]])
    r = (1+k)/(1-k)
    metric = sp.diag(1, -1)
    verified = all(sp.simplify(value) == 0 for value in matrix.T*metric*matrix-metric)
    verified = verified and sp.simplify(matrix.det()-1) == 0
    verified = verified and sp.simplify(q[1]-y-k*(q[0]-x)) == 0
    verified = verified and sp.simplify(new[0]-new[1]-r*(x-y)) == 0
    verified = verified and sp.simplify(new[0]+new[1]-(x+y)/r) == 0
    u, v, r_symbol = sp.symbols("u v r", positive=True)
    point = lambda j: sp.Matrix([(u*r_symbol**j+v/r_symbol**j)/2, (v/r_symbol**j-u*r_symbol**j)/2])
    doubled_area = sp.factor(sp.det(sp.Matrix.hstack(point(1)-point(0), point(2)-point(0))))
    expected_area = u*v*(r_symbol-1)**3*(r_symbol+1)/(2*r_symbol**2)
    verified = verified and sp.simplify(doubled_area-expected_area) == 0
    shifted = sp.factor(sp.det(sp.Matrix.hstack(point(2)-point(1), point(3)-point(1))))
    verified = verified and sp.simplify(shifted-doubled_area) == 0
    return {"verified": bool(verified), "determinant": "1", "matrix": sp.latex(matrix),
            "ratio": sp.latex(r), "doubleAreaIdentity": str(doubled_area),
            "identities": ["T^T J T=J", "det(T)=1", "Q=(-x_next,y_next) lies on chord", "u_next=r*u", "v_next=v/r", "adjacent_triangle_areas_equal"]}


def proof_certificate(scene: dict) -> dict | None:
    spec = scene.get("hyperbolaIteration") or {}
    if spec.get("schema") != SCHEMA:
        return None
    try:
        x1, y1, m = [scalar(str(spec["exact"][key])) for key in ("x1", "y1", "m")]
    except (KeyError, ValueError, TypeError):
        return None
    if x1.is_positive is not True or m.is_positive is not True or sp.simplify(x1*x1-y1*y1-m) != 0:
        return None
    result = dict(_identities())
    result.update({"schema": "dongjiexi-hyperbola-iteration-proof/v1", "m": str(m),
                   "initialU": str(sp.simplify(x1-y1)), "initialV": str(sp.simplify(x1+y1)),
                   "parameterDomain": "0<k<1", "area": "m*(r-1)^3*(r+1)/(4*r^2)",
                   "proofUsesSamples": False})
    return result


def _classify(spec: dict, text: str, body: str) -> tuple[str, sp.Expr | None] | None:
    request = _compact(body)
    point = re.escape(spec["pointPrefix"])
    goal = re.search(r"求|证明|求证", request)
    if goal is None:
        return None
    conclusion = request[goal.start():].replace("求证", "证明")
    if re.search(r"并|同时|以及|且|还|此外|最大|最小|最值|范围|轨迹|切线|角度|夹角|周长", conclusion):
        return None
    if len(re.findall(r"求|证明", conclusion)) != 1:
        return None
    if conclusion.startswith("求"):
        if re.search(r"面积|距离|长度|方程|数列|证明|公比", conclusion):
            return None
        coordinates = bool(re.search(r"x_?2[,、]?y_?2", conclusion) or re.search(rf"{point}_?2(?:的)?坐标", conclusion, re.I))
        k = _explicit_k(body)
        return ("coordinate", k) if coordinates and k is not None else None
    if "等比数列" in conclusion:
        if not re.search(r"(?<![0-9A-Za-z_+*/-])\{?x_?n-y_?n\}?(?:是|为)", conclusion) or re.search(r"不是|非等比|求|面积|距离|方程|坐标|通项|首项为", conclusion):
            return None
        ratio_matches = list(re.finditer(r"公比为", conclusion))
        if len(ratio_matches) > 1:
            return None
        if ratio_matches:
            ratio_text = conclusion[ratio_matches[0].end():]
            ratio_text = re.split(r"的等比数列|[,。；;]", ratio_text, maxsplit=1)[0]
            if ratio_text.strip("{}") not in {"(1+k)/(1-k)", "((1+k)/(1-k))"}:
                return None
        return "progression", None
    if "面积" in request or "面积" in _compact(text):
        triangle = rf"(?:\\triangle|△|三角形){point}_?n{point}_?n\+1{point}_?n\+2"
        definition = re.search(rf"设([A-Za-z])_?n为{triangle}(?:的)?面积(?=[,。；;]|$)", _compact(text), re.I)
        if definition is None:
            return None
        area_name = re.escape(definition.group(1))
        if not re.search(rf"(?:{area_name}_?n={area_name}_?n\+1|{area_name}_?n\+1={area_name}_?n)(?=[。；;]|$)", conclusion, re.I):
            return None
        if re.search(r"求|数列|距离|坐标|方程", conclusion):
            return None
        return "area", None
    return None


def solve_part(scene: dict, text: str, part: dict) -> tuple[str, list[str]] | None:
    """Prove one isolated supported goal, or abstain without a false success."""
    spec = _matching(scene, text)
    if spec is None:
        return None
    body = part.get("body") or part.get("question") or ""
    claim = _classify(spec, text, body)
    if claim is None:
        return None
    probe = {"hyperbolaIteration": spec}
    certificate = proof_certificate(probe)
    if certificate is None or not certificate["verified"]:
        return None
    x1, y1, m = [scalar(spec["exact"][key]) for key in ("x1", "y1", "m")]
    p, q = spec["pointPrefix"], spec["otherPrefix"]
    p1, p2, q1 = _texname(p, 1), _texname(p, 2), _texname(q, 1)
    first = rf"由 ${p1}=({sp.latex(x1)},{sp.latex(y1)})$ 在双曲线上，得 $m={sp.latex(m)}$。"
    if claim[0] == "coordinate":
        k = claim[1]
        x2 = sp.simplify(((1+k*k)*x1-2*k*y1)/(1-k*k))
        y2 = sp.simplify((-2*k*x1+(1+k*k)*y1)/(1-k*k))
        x = sp.symbols("x", real=True)
        intercept = sp.simplify(y1-k*x1)
        polynomial = sp.factor(x*x-(k*x+intercept)**2-m)
        qx, qy = -x2, y2
        if x2.is_positive is not True or sp.simplify(qx*qx-qy*qy-m) != 0 or sp.simplify(qy-y1-k*(qx-x1)) != 0:
            return None
        return (rf"${p2}=({sp.latex(x2)},{sp.latex(y2)})$，即 $x_2={sp.latex(x2)},\ y_2={sp.latex(y2)}$。", [
            first,
            rf"当 $k={sp.latex(k)}$ 时，过 ${p1}$ 的直线为 $y={sp.latex(k*x+intercept)}$。联立得 ${sp.latex(polynomial)}=0$，两交点横坐标为 ${sp.latex(x1)}$ 与 ${sp.latex(qx)}$。",
            rf"左支交点必须取负横坐标，所以 ${q1}=({sp.latex(qx)},{sp.latex(qy)})$；关于 $y$ 轴反射，横坐标变号、纵坐标不变，得到 ${p2}=({sp.latex(x2)},{sp.latex(y2)})$。",
            "已精确回代双曲线方程、过点直线方程与轴对称关系；不是仅按图形猜测坐标。",
        ])
    recurrence = [first,
        rf"设 ${_texname(p, 'n')}=(x_n,y_n)$，${_texname(q, 'n')}=(-x_{{n+1}},y_{{n+1}})$。直线为 $y=kx+y_n-kx_n$。代入 $x^2-y^2=m$ 后，两交点横坐标之和为 $\frac{{2k(y_n-kx_n)}}{{1-k^2}}$。",
        r"由韦达定理及关于 $y$ 轴对称，得到 $x_{n+1}=\frac{(1+k^2)x_n-2ky_n}{1-k^2}$；将 $(-x_{n+1},y_{n+1})$ 代入原直线，得到 $y_{n+1}=\frac{-2kx_n+(1+k^2)y_n}{1-k^2}$。",
        r"$0<k<1$ 且 $x_n>|y_n|$，故 $x_{n+1}>0$，反射前另一交点横坐标为负，确实位于左支。递推保持 $x_{n+1}^2-y_{n+1}^2=m>0$，所以所有后续构造均合法。",
    ]
    u1, v1 = sp.simplify(x1-y1), sp.simplify(x1+y1)
    if claim[0] == "progression":
        return (rf"$\{{x_n-y_n\}}$ 是等比数列，公比 $r=\frac{{1+k}}{{1-k}}$，且 $x_n-y_n=({sp.latex(u1)})r^{{n-1}}$。", recurrence+[
            r"两递推式相减：$x_{n+1}-y_{n+1}=\frac{1+k}{1-k}(x_n-y_n)$。初值 $x_1-y_1>0$，每一项非零，故公比对每一步都成立。",
            rf"因此 $x_n-y_n=({sp.latex(u1)})\left(\frac{{1+k}}{{1-k}}\right)^{{n-1}}$。结论适用于任意正整数 $n$，不靠有限次作图或枚举归纳。",
        ])
    return (rf"$S_n=S_{{n+1}}$ 对任意正整数 $n$ 成立；共同面积 $S_n=\frac{{{sp.latex(m)}(r-1)^3(r+1)}}{{4r^2}}=\frac{{{sp.latex(4*m)}k^3}}{{(1-k^2)^2}}$，其中 $r=\frac{{1+k}}{{1-k}}$。", recurrence+[
        r"记 $u_n=x_n-y_n$、$v_n=x_n+y_n$。递推给出 $u_{n+1}=ru_n$、$v_{n+1}=v_n/r$；并且 $u_nv_n=x_n^2-y_n^2=m$。",
        rf"由初值得 $u_n=({sp.latex(u1)})r^{{n-1}}$、$v_n=({sp.latex(v1)})r^{{1-n}}$，所以 $x_n=(u_n+v_n)/2$、$y_n=(v_n-u_n)/2$。",
        r"将相邻三个点代入坐标面积公式 $S_n=\frac12|(x_{n+1}-x_n)(y_{n+2}-y_n)-(x_{n+2}-x_n)(y_{n+1}-y_n)|$，整理得 $S_n=\frac{u_nv_n(r-1)^3(r+1)}{4r^2}=\frac{m(r-1)^3(r+1)}{4r^2}$。因 $r>1,m>0$，面积正且与 $n$ 无关。",
        r"也可作拓展检验：递推矩阵 $T=\frac1{1-k^2}\begin{pmatrix}1+k^2&-2k\\-2k&1+k^2\end{pmatrix}$ 的行列式为 $1$。下一三角形的两边向量均由上一三角形乘 $T$ 得到，面积保持不变。",
        "这里“定值”指固定同一个 k 后不随序号 n 改变；改变斜率 k 后面积一般会变化。画板上的两个三角形用于理解，符号恒等式才证明所有 n。",
    ])


def decorate_scene(scene: dict, text: str, parts: list[dict]) -> dict:
    """Install genuine dependency nodes without replacing user-owned objects."""
    spec = _matching(scene, text)
    if spec is None:
        return scene
    part_map = {}
    for part in parts:
        goal = _classify(spec, text, part.get("body") or part.get("question") or "")
        if goal is not None:
            part_map[goal[0]] = part.get("index", 0)
    spec["parts"] = part_map
    scope = list(dict.fromkeys(part_map.values())) or [part.get("index", 0) for part in parts]
    objects, lines = scene.setdefault("objects", []), scene.setdefault("lines", [])
    polygons, points = scene.setdefault("polygons", []), scene.setdefault("points", {})
    bindings = scene.get("pointBindings") or {}
    p, q = spec["pointPrefix"], spec["otherPrefix"]
    names = {_name(p, i) for i in range(2, 5)} | {_name(q, i) for i in range(1, 4)}
    if any(name in points or name in bindings for name in names):
        return scene
    if any(str(item.get("id", "")).startswith(PREFIX) and item.get("source") != "derived" for item in objects+lines+polygons):
        return scene
    if any(item.get("label") in names and not (str(item.get("id", "")).startswith(PREFIX) and item.get("source") == "derived") for item in objects+lines):
        return scene
    initial = _name(p, 1)
    if initial in bindings:
        return scene
    scene["hyperbolaIteration"] = spec
    points.setdefault(initial, list(spec["start"]))
    scene.setdefault("pointParts", {})[initial] = scope
    common = {"source": "derived", "parts": scope, "visible": True}

    def append_unique(items: list[dict], item: dict) -> None:
        if not any(existing.get("id") == item["id"] for existing in items):
            items.append(item)

    angle = math.degrees(math.atan(spec["k"]))
    for index in range(1, 4):
        current = "feature:"+initial if index == 1 else PREFIX+"P-"+str(index)
        line_id, q_id, p_id = PREFIX+"line-"+str(index), PREFIX+"Q-"+str(index), PREFIX+"P-"+str(index+1)
        append_unique(objects, {"id": line_id, "kind": "construction", "op": "line_angle", "refs": [current], "angle": angle, "label": "ℓ"+str(index).translate(SUBSCRIPTS), **common})
        append_unique(objects, {"id": q_id, "kind": "construction", "op": "intersection", "refs": [line_id, "$conic"], "branch": 0, "label": _name(q, index), **common})
        append_unique(objects, {"id": p_id, "kind": "construction", "op": "reflect_axis", "refs": [q_id], "axis": "y", "axisValue": 0, "label": _name(p, index+1), **common})
    if "area" in part_map:
        for index in (1, 2):
            append_unique(polygons, {"id": PREFIX+"triangle-"+str(index), "kind": "polygon", "labels": [_name(p, j) for j in range(index, index+3)], "label": "△"+"".join(_name(p, j) for j in range(index, index+3)), "part": part_map["area"], "source": "derived", "visible": True})
    scene["dynamicLine"] = scene["showDynamic"] = False
    return scene


def checks(context: dict | None) -> list[dict]:
    """General symbolic proof checks, separate from one numerical diagram."""
    if not context:
        return []
    spec = context.get("hyperbolaIteration", context)
    certificate = proof_certificate({"hyperbolaIteration": spec})
    if not certificate or not certificate["verified"]:
        return []
    result = [{"id": "hyperbola-iteration-construction", "label": "双曲线递推与左支反射", "status": "verified", "category": "curve", "detail": "韦达推导递推，精确验证过点直线、轴对称关系和 TᵀJT=J；0<k<1 保证所有构造合法。"}]
    for goal, label, detail in (("progression", "坐标差等比递推", "符号恒等式 u_next=r*u；对所有正整数 n 成立。"), ("area", "相邻三角形面积不变量", "坐标行列式消去 n，且 det T=1；固定 k 后面积不随 n 改变，不使用图形枚举作为证明。")):
        if goal in (spec.get("parts") or {}):
            result.append({"id": "hyperbola-iteration-"+goal, "label": label, "status": "verified", "category": "answer", "part": spec["parts"][goal], "detail": detail})
    return result
