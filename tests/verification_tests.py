import sys
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from learning_engine import EngineError, assemble_solution  # noqa: E402
from server import fallback_solution, normalise_scene_contract, standard_conic, verify_ai_scene  # noqa: E402
from verification_engine import _q, _sign, attach_trust_report, has_uncertainty  # noqa: E402


def result(scene, text="", parts=None):
    return {
        "mode": "local-ollama",
        "restatement": text,
        "parts": parts or [{"index": 1, "label": "第（1）问", "body": "求交点", "answer": "", "steps": [], "status": "partial"}],
        "scene": scene,
    }


class VerificationTests(unittest.TestCase):
    def test_manual_circle_tangent_normal_survive_scene_repair(self):
        objects = [
            {"id": "circle", "kind": "circle", "h": 2, "k": 1, "r": 3},
            {"id": "point", "kind": "construction", "op": "point_on", "refs": ["circle"], "t": .6},
            {"id": "tangent", "kind": "construction", "op": "tangent", "refs": ["point", "circle"]},
            {"id": "normal", "kind": "construction", "op": "normal", "refs": ["point", "circle"]},
            {"id": "wrong", "kind": "construction", "op": "normal", "refs": ["circle", "point"]},
        ]
        for item in objects:
            item.update(source="user", label=item["id"])
        checked = verify_ai_scene(result({"type": "ellipse", "a": 9, "b": 8, "h": 0, "k": 0,
            "orientation": "horizontal", "dynamicLine": False, "lines": [], "points": {}, "objects": objects}, "椭圆 x²/9+y²/4=1。"))
        ids = {item["id"] for item in checked["scene"]["objects"]}
        self.assertTrue({"circle", "point", "tangent", "normal"}.issubset(ids))
        self.assertNotIn("wrong", ids)

    def test_scene_repair_preserves_added_conic_dependencies_and_fixed_point_line(self):
        manual = [
            {"id": "turn", "kind": "construction", "op": "line_angle", "refs": ["on-extra"], "angle": 90},
            {"id": "on-extra", "kind": "construction", "op": "point_on", "refs": ["extra"], "t": 1},
            {"id": "cross", "kind": "construction", "op": "intersection", "refs": ["axis", "extra"], "branch": 0},
            {"id": "axis", "kind": "line", "m": 0, "b": 1},
            {"id": "extra", "kind": "conic", "conicType": "ellipse", "a": 2, "b": 1, "h": 3, "k": 1},
            {"id": "bad-angle", "kind": "construction", "op": "line_angle", "refs": ["on-extra"], "angle": float("nan")},
            {"id": "bad-pivot", "kind": "construction", "op": "line_angle", "refs": ["extra"], "angle": 45},
        ]
        for item in manual:
            item.update(source="user", label=item["id"])
        raw = result({"type": "ellipse", "a": 9, "b": 8, "h": 0, "k": 0, "orientation": "horizontal",
                      "dynamicLine": False, "lines": [], "points": {}, "objects": manual}, "椭圆 x²/9+y²/4=1。")
        checked = verify_ai_scene(raw)
        ids = {item["id"] for item in checked["scene"]["objects"]}
        self.assertTrue({"turn", "on-extra", "cross", "axis", "extra"}.issubset(ids))
        self.assertNotIn("bad-angle", ids)
        self.assertNotIn("bad-pivot", ids)
        self.assertEqual(checked["scene"]["a"], 3)

    def test_standard_conic_accepts_translated_and_omitted_denominator_forms(self):
        translated = standard_conic("椭圆 (x-1)^2/4+(y+2)^2/9=1")
        self.assertEqual(translated["type"], "ellipse")
        self.assertEqual((translated["h"], translated["k"]), (1.0, -2.0))
        self.assertEqual(translated["orientation"], "vertical")
        omitted = standard_conic(r"x²/4+y²=1")
        self.assertEqual(omitted["type"], "ellipse")
        self.assertEqual((omitted["a"], omitted["b"]), (2.0, 1.0))

    def test_standard_conic_accepts_translated_circle(self):
        circle = standard_conic("圆 (x-2)^2+(y+1)^2=9")
        self.assertEqual(circle["type"], "circle")
        self.assertEqual((circle["h"], circle["k"], circle["r"]), (2.0, -1.0, 3.0))

    def test_two_intersections_are_verified(self):
        scene = {"type": "ellipse", "a": 2, "b": 1, "h": 0, "k": 0, "orientation": "horizontal",
                 "lines": [{"kind": "slope", "m": 0, "b": 0, "label": "x轴", "part": 1}], "points": [], "objects": []}
        checked = attach_trust_report(result(scene))
        line = next(item for item in checked["verification"]["checks"] if item["id"] == "line-0")
        self.assertEqual(line["status"], "verified")
        self.assertIn("两个实交点", line["detail"])

    def test_linear_single_intersection_is_not_called_tangent(self):
        scene = {"type": "parabola", "p": 1, "direction": 1, "h": 0, "k": 0, "orientation": "horizontal",
                 "lines": [{"kind": "slope", "m": 0, "b": 1, "label": "y=1", "part": 1}], "points": [], "objects": []}
        checked = attach_trust_report(result(scene))
        line = next(item for item in checked["verification"]["checks"] if item["id"] == "line-0")
        self.assertIn("降为一次", line["detail"])
        self.assertIn("不能", line["detail"])

    def test_curve_structure_alone_does_not_verify_answer(self):
        scene = {"type": "ellipse", "a": 2, "b": 1, "h": 0, "k": 0, "orientation": "horizontal",
                 "lines": [], "points": {}, "objects": []}
        checked = attach_trust_report(result(scene, "求椭圆的标准方程。", [
            {"index": 1, "label": "第（1）问", "body": "求标准方程", "answer": "$x^2+y^2=1$", "steps": [], "status": "answered"},
        ]))
        self.assertEqual(checked["verification"]["status"], "generated")
        self.assertEqual(checked["verification"]["counts"]["answer_verified"], 0)
        self.assertEqual(checked["parts"][0]["verification"]["status"], "generated")
        self.assertIn("图形结构", checked["verification"]["message"])

    def test_tangent_claim_with_linear_substitution_stays_unresolved(self):
        scene = {"type": "parabola", "p": 1, "direction": 1, "h": 0, "k": 0, "orientation": "horizontal",
                 "lines": [{"kind": "slope", "m": 0, "b": 1, "label": "y=1", "part": 1}], "points": {}, "objects": []}
        checked = attach_trust_report(result(scene, "证明直线 y=1 与抛物线相切。", [
            {"index": 1, "label": "第（1）问", "body": "证明直线 y=1 与抛物线相切", "answer": "相切", "steps": [], "status": "answered"},
        ]))
        line = next(item for item in checked["verification"]["checks"] if item["id"] == "line-0")
        self.assertEqual(line["status"], "unresolved")
        self.assertEqual(checked["verification"]["status"], "generated")
        self.assertEqual(checked["parts"][0]["verification"]["status"], "generated")

    def test_true_quadratic_double_root_is_tangent(self):
        scene = {"type": "parabola", "p": 1, "direction": 1, "h": 0, "k": 0, "orientation": "horizontal",
                 "lines": [{"kind": "vertical", "x": 0, "label": "x=0", "part": 1}], "points": [], "objects": []}
        checked = attach_trust_report(result(scene))
        line = next(item for item in checked["verification"]["checks"] if item["id"] == "line-0")
        self.assertIn("二次重根", line["detail"])

    def test_explicit_point_conflict_blocks_trust(self):
        scene = {"type": "ellipse", "a": 2, "b": 1, "h": 0, "k": 0, "orientation": "horizontal",
                 "lines": [], "points": {"P": [3, 0]}, "objects": []}
        checked = attach_trust_report(result(scene, "椭圆经过点 P(3,0)，求其方程。"))
        self.assertEqual(checked["verification"]["status"], "conflict")
        self.assertTrue(any(item["id"] == "point-P" and item["status"] == "contradicted" for item in checked["verification"]["checks"]))

    def test_decimal_surd_residue_does_not_create_false_point_conflict(self):
        scene = {"type": "ellipse", "a": 2, "b": 3 ** .5, "h": 0, "k": 0, "orientation": "horizontal",
                 "lines": [], "points": {"P": [1, 1.5]}, "objects": []}
        checked = attach_trust_report(result(scene, "椭圆经过点 P(1,3/2)，求其方程。"))
        point = next(item for item in checked["verification"]["checks"] if item["id"] == "point-P")
        self.assertEqual(point["status"], "verified")
        self.assertNotEqual(checked["verification"]["status"], "conflict")

    def test_ocr_uncertainty_is_detected(self):
        self.assertTrue(has_uncertainty("椭圆的离心率为[看不清]，求方程"))
        self.assertFalse(has_uncertainty("椭圆的离心率为 1/2，求方程"))

    def test_numeric_conversion_preserves_decimal_and_symbolic_values(self):
        self.assertEqual(_q(0.1), _q("1/10"))
        self.assertEqual(_q(1e-7), _q("1/10000000"))
        symbol = __import__("sympy").sqrt(2)
        self.assertIs(_q(symbol), symbol)
        self.assertEqual(_sign(__import__("sympy").Rational(1, 10**30)), 1)

    def test_trust_report_does_not_mutate_input_scene(self):
        scene = {"type": "ellipse", "a": 2, "b": 1, "h": 0, "k": 0, "orientation": "horizontal",
                 "lines": [{"kind": "slope", "m": 0, "b": 0, "label": "x轴", "part": 1}], "points": {}, "objects": []}
        checked = attach_trust_report(result(scene))
        self.assertNotIn("provenance", scene)
        self.assertNotIn("source", scene["lines"][0])
        self.assertIsNot(checked["scene"], scene)
        self.assertIn("provenance", checked["scene"])

    def test_global_curve_check_does_not_mark_every_part_verified(self):
        scene = {"type": "ellipse", "a": 2, "b": 1, "h": 0, "k": 0, "orientation": "horizontal",
                 "lines": [{"kind": "slope", "m": 0, "b": 0, "label": "x轴", "part": 1}], "points": {}, "objects": []}
        checked = attach_trust_report(result(scene, "（1）求交点；（2）证明定值。", [
            {"index": 1, "label": "第（1）问", "body": "求交点", "answer": "", "steps": [], "status": "partial"},
            {"index": 2, "label": "第（2）问", "body": "证明定值", "answer": "", "steps": [], "status": "partial"},
        ]))
        self.assertEqual(checked["parts"][0]["verification"]["status"], "locally-verified")
        self.assertEqual(checked["parts"][1]["verification"]["status"], "generated")

    def test_problem_model_contains_goals_and_obligations(self):
        checked = attach_trust_report(result(None, "（1）求标准方程；（2）求离心率的取值范围。", [
            {"index": 1, "label": "第（1）问", "body": "求标准方程", "answer": "", "steps": [], "status": "partial"},
            {"index": 2, "label": "第（2）问", "body": "求离心率的取值范围", "answer": "", "steps": [], "status": "partial"},
        ]))
        goals = [item["goal"] for item in checked["problemModel"]["parts"]]
        self.assertEqual(goals, ["standard_equation", "range"])
        self.assertTrue(checked["problemModel"]["parts"][1]["proof_obligations"])

    def test_assemble_solution_keeps_machine_check_fields(self):
        raw = {"title": "题", "knowns": [], "strategy": "联立", "answer": "2", "assumptions": [], "scene": None,
               "parts": [{"index": 1, "answer": "$x=2$", "steps": ["计算"], "status": "answered",
                          "equations": ["$x+1=3$"], "substitutions": ["$x=2$"], "candidate_solutions": ["$2$"],
                          "domain": ["$x\\in\\mathbb R$"], "proof_obligations": ["代回"]}]}
        assembled = assemble_solution(raw, "（1）求 x", [{"index": 1, "label": "第（1）问", "question": "求 x", "body": "求 x"}], "model")
        self.assertEqual(assembled["parts"][0]["derivation"]["equations"], ["$x+1=3$"])
        self.assertEqual(assembled["verification"]["status"], "generated")

    def test_ai_scene_conflict_is_replaced_by_deterministic_scene(self):
        raw = result({"type": "ellipse", "a": 3, "b": 1, "h": 0, "k": 0, "orientation": "horizontal",
                      "dynamicLine": False, "lineThrough": "center", "theta": 42, "lines": [], "points": {}, "objects": []},
                     "椭圆 x^2/4+y^2/3=1。")
        checked = verify_ai_scene(raw)
        self.assertEqual(checked["scene"]["type"], "ellipse")
        self.assertAlmostEqual(checked["scene"]["a"], 2)
        self.assertAlmostEqual(checked["scene"]["b"], 3 ** 0.5)
        self.assertEqual(checked["scene"]["exact"], {"a2": "4", "b2": "3"})
        self.assertIn("内置符号引擎", checked["scene_notice"])

    def test_ai_scene_repair_drops_untrusted_objects_but_keeps_manual_work(self):
        raw = result({"type": "ellipse", "a": 3, "b": 1, "h": 0, "k": 0, "orientation": "horizontal",
                      "dynamicLine": False, "lineThrough": "center", "theta": 42, "lines": [], "points": {},
                      "objects": [
                          {"id": "ai-circle", "kind": "circle", "h": 8, "k": 8, "r": 2, "label": "AI猜测圆", "source": "model"},
                          {"id": "manual-point", "kind": "point", "x": 5, "y": 6, "label": "U", "source": "user"},
                      ]}, "椭圆 x^2/4+y^2/3=1。")
        checked = verify_ai_scene(raw)
        ids = {item.get("id") for item in checked["scene"]["objects"]}
        self.assertNotIn("ai-circle", ids)
        self.assertIn("manual-point", ids)

    def test_ai_scene_repair_keeps_only_dependency_complete_manual_constructions(self):
        raw = result({"type": "ellipse", "a": 3, "b": 1, "h": 0, "k": 0, "orientation": "horizontal",
                      "dynamicLine": False, "lineThrough": "center", "theta": 42, "lines": [], "points": {},
                      "objects": [
                          {"id": "manual-through-line", "kind": "through_points", "a": "U", "b": "V",
                           "label": "uv", "source": "user"},
                          {"id": "manual-origin-line", "kind": "construction", "op": "line",
                           "refs": ["manual-point", "feature:O"], "label": "u", "source": "user"},
                          {"id": "orphan-midpoint", "kind": "construction", "op": "midpoint",
                           "refs": ["manual-point", "ai-line"], "label": "M", "source": "user"},
                          {"id": "ai-line", "kind": "line", "m": 1, "b": 0, "label": "AI直线", "source": "model"},
                          {"id": "manual-point-v", "kind": "point", "x": -2, "y": 3, "label": "V", "source": "user"},
                          {"id": "manual-point", "kind": "point", "x": 5, "y": 6, "label": "U", "source": "user"},
                      ]}, "椭圆 x^2/4+y^2/3=1。")
        checked = verify_ai_scene(raw)
        ids = [item.get("id") for item in checked["scene"]["objects"]]
        self.assertIn("manual-point", ids)
        self.assertIn("manual-point-v", ids)
        self.assertIn("manual-origin-line", ids)
        self.assertIn("manual-through-line", ids)
        self.assertLess(ids.index("manual-point"), ids.index("manual-origin-line"))
        self.assertLess(ids.index("manual-point-v"), ids.index("manual-through-line"))
        self.assertNotIn("orphan-midpoint", ids)
        self.assertNotIn("ai-line", ids)
        self.assertIn("1 个手动构造因依赖对象不存在或构造无效而未恢复", checked["scene_notice"])

    def test_ai_scene_repair_rejects_semantically_invalid_manual_geometry(self):
        raw = result({"type": "ellipse", "a": 3, "b": 1, "h": 0, "k": 0, "orientation": "horizontal",
                      "dynamicLine": False, "lineThrough": "center", "theta": 42, "lines": [], "points": {},
                      "objects": [
                          {"id": "manual-point", "kind": "point", "x": 2, "y": 1, "label": "U", "source": "user"},
                          {"id": "same-point-line", "kind": "construction", "op": "line",
                           "refs": ["manual-point", "manual-point"], "label": "u", "source": "user"},
                          {"id": "wrong-midpoint", "kind": "construction", "op": "midpoint",
                           "refs": ["manual-point", "$dynamic"], "label": "M", "source": "user"},
                          {"id": "bad-native-line", "kind": "line", "label": "v", "source": "user"},
                          {"id": "bad-through-line", "kind": "through_points", "a": "U", "b": "U",
                           "label": "w", "source": "user"},
                          {"id": "cycle-a", "kind": "construction", "op": "point_on",
                           "refs": ["cycle-b"], "label": "C1", "source": "user"},
                          {"id": "cycle-b", "kind": "construction", "op": "point_on",
                           "refs": ["cycle-a"], "label": "C2", "source": "user"},
                          {"id": "unknown-op", "kind": "construction", "op": "bisector",
                           "refs": ["manual-point", "feature:O"], "label": "z", "source": "user"},
                          {"id": "$conic", "kind": "point", "x": 9, "y": 9,
                           "label": "Q", "source": "user"},
                          {"id": "feature-shadow", "kind": "point", "x": 8, "y": 8,
                           "label": "O", "source": "user"},
                      ]}, "椭圆 x^2/4+y^2/3=1。")
        checked = verify_ai_scene(raw)
        ids = {item.get("id") for item in checked["scene"]["objects"]}
        self.assertIn("manual-point", ids)
        rejected = {"same-point-line", "wrong-midpoint", "bad-native-line", "bad-through-line", "cycle-a", "cycle-b",
                    "unknown-op", "$conic", "feature-shadow"}
        self.assertTrue(rejected.isdisjoint(ids))
        self.assertIn("9 个手动构造因依赖对象不存在或构造无效而未恢复", checked["scene_notice"])

    def test_exact_only_conic_parameters_are_structurally_valid(self):
        scenes = [
            {"type": "ellipse", "exact": {"a2": "4", "b2": "3"}, "orientation": "horizontal"},
            {"type": "hyperbola", "exact": {"a2": "4", "b2": "5"}, "orientation": "horizontal"},
            {"type": "circle", "exact": {"r2": "9"}},
            {"type": "parabola", "exact": {"p": "2"}, "orientation": "horizontal", "direction": 1},
        ]
        for scene in scenes:
            with self.subTest(kind=scene["type"]):
                scene.update(h=0, k=0, lines=[], points={}, objects=[])
                checked = attach_trust_report(result(scene))
                structure = next(item for item in checked["verification"]["checks"] if item["id"] == "curve-structure")
                self.assertEqual(structure["status"], "verified")

    def test_degenerate_exact_line_cannot_fall_back_to_verified_float_line(self):
        scene = {"type": "circle", "r": 3, "h": 0, "k": 0, "orientation": "horizontal",
                 "lines": [{"kind": "slope", "m": 0, "b": 0, "exact": {"A": "0", "B": "0", "C": "1"}, "label": "退化直线", "part": 1}],
                 "points": {}, "objects": []}
        checked = attach_trust_report(result(scene))
        line = next(item for item in checked["verification"]["checks"] if item["id"] == "line-0")
        self.assertEqual(line["status"], "unresolved")

    def test_deterministic_solver_uses_feature_goal_not_directrix_equation(self):
        solved = fallback_solution("已知椭圆x^2/4+y^2/3=1，求焦点坐标、离心率和准线方程。")
        self.assertEqual(solved["completion"], {"answered": 1, "total": 1})
        self.assertIn("焦点：(-1,0)，(1,0)", solved["answer"])
        self.assertIn("离心率 e=1/2", solved["answer"])
        self.assertIn("准线：x=-4 或 4", solved["answer"])

    def test_deterministic_solver_handles_exact_fixed_chord(self):
        solved = fallback_solution("圆x^2+y^2=9与直线y=0交于A、B，求AB的长度和中点坐标。")
        self.assertEqual(solved["completion"], {"answered": 1, "total": 1})
        self.assertIn("弦长 |AB|=6", solved["answer"])
        self.assertIn("中点为 (0,0)", solved["answer"])
        objects = {item.get("role"): item for item in solved["scene"]["objects"] if item.get("role") in {"derived_chord", "derived_midpoint"}}
        endpoints = [item for item in solved["scene"]["objects"] if item.get("role") == "line_conic_intersection"]
        self.assertEqual([item["label"] for item in endpoints], ["A", "B"])
        self.assertEqual([item["exact"] for item in endpoints], [{"x": "-3", "y": "0"}, {"x": "3", "y": "0"}])
        self.assertEqual(objects["derived_chord"]["refs"], [item["id"] for item in endpoints])
        self.assertEqual(objects["derived_chord"]["exact"], {"length": "6"})
        self.assertEqual(objects["derived_midpoint"]["exact"], {"x": "0", "y": "0"})
        self.assertEqual(objects["derived_midpoint"]["construction"]["schema"], "dongjiexi-construction/v1")
        checks = [item for item in solved["verification"]["checks"] if item["category"] == "construction"]
        self.assertEqual(len(checks), 4)
        self.assertTrue(all(item["status"] == "verified" for item in checks))
        self.assertEqual(solved["parts"][0]["verification"]["status"], "locally-verified")

    def test_corrupted_answer_derived_chord_and_midpoint_are_contradicted(self):
        solved = fallback_solution("圆x^2+y^2=9与直线y=0交于A、B，求AB的长度和中点坐标。")
        scene = solved["scene"]
        next(item for item in scene["objects"] if item.get("role") == "line_conic_intersection")["exact"]["x"] = "3"
        next(item for item in scene["objects"] if item.get("role") == "derived_chord")["exact"]["length"] = "7"
        next(item for item in scene["objects"] if item.get("role") == "derived_midpoint")["exact"]["x"] = "1"
        checked = attach_trust_report(result(scene, solved["restatement"], solved["parts"]))
        endpoint = next(item for item in checked["verification"]["checks"] if item["id"].startswith("derived-intersection-"))
        chord = next(item for item in checked["verification"]["checks"] if item["id"].startswith("derived-chord-"))
        midpoint = next(item for item in checked["verification"]["checks"] if item["id"].startswith("derived-midpoint-"))
        self.assertEqual(endpoint["status"], "contradicted")
        self.assertEqual(chord["status"], "contradicted")
        self.assertEqual(midpoint["status"], "contradicted")

    def test_stale_intersection_refs_invalidate_the_whole_derived_chain(self):
        solved = fallback_solution("圆x^2+y^2=9与直线y=0交于A、B，求AB的长度和中点坐标。")
        scene = solved["scene"]
        next(item for item in scene["objects"] if item.get("role") == "line_conic_intersection")["refs"] = ["stale-line", "$conic"]
        checked = attach_trust_report(result(scene, solved["restatement"], solved["parts"]))
        checks = [item for item in checked["verification"]["checks"] if item["id"].startswith("derived-")]
        self.assertEqual([item["status"] for item in checks], ["contradicted", "verified", "contradicted", "contradicted"])
        self.assertEqual(checked["verification"]["status"], "conflict")

    def test_fixed_line_derived_objects_follow_part_scope(self):
        solved = fallback_solution("圆x^2+y^2=9与直线y=0交于A、B。（1）求A、B坐标；（2）求AB中点坐标。")
        first = [item for item in solved["scene"]["objects"] if item.get("part") == 1]
        second = [item for item in solved["scene"]["objects"] if item.get("part") == 2]
        self.assertEqual([item.get("role") for item in first], ["line_conic_intersection", "line_conic_intersection"])
        self.assertEqual([item.get("role") for item in second], ["line_conic_intersection", "line_conic_intersection", "derived_chord", "derived_midpoint"])

    def test_fixed_line_derived_objects_cover_vertical_tangent_and_empty_cases(self):
        vertical = fallback_solution("圆(x-1)^2+(y+2)^2=9与直线x=1交于A、B，求交点和中点坐标。")
        endpoints = [item for item in vertical["scene"]["objects"] if item.get("role") == "line_conic_intersection"]
        self.assertEqual([item["exact"] for item in endpoints], [{"x": "1", "y": "-5"}, {"x": "1", "y": "1"}])
        tangent = fallback_solution("圆x^2+y^2=9与直线y=3交于P，求交点坐标。")
        derived = [item for item in tangent["scene"]["objects"] if item.get("source") == "derived"]
        self.assertEqual([(item["role"], item["label"]) for item in derived], [("line_conic_intersection", "P")])
        empty = fallback_solution("圆x^2+y^2=9与直线y=4没有实交点，求交点。")
        self.assertFalse(any(item.get("role") == "line_conic_intersection" for item in empty["scene"]["objects"]))
        point_only = fallback_solution("圆x^2+y^2=9与直线y=0交于A、B，求A、B坐标。")
        roles = [item.get("role") for item in point_only["scene"]["objects"] if item.get("source") == "derived"]
        self.assertEqual(roles, ["line_conic_intersection", "line_conic_intersection"])

    def test_question_motion_builds_dependency_graph(self):
        solved = fallback_solution("已知椭圆x^2/9+y^2/4=1，点P为椭圆上的动点，M为线段PF1的中点，连接PM。")
        objects = {item["label"]: item for item in solved["scene"]["objects"]}
        self.assertEqual(objects["P"]["op"], "point_on")
        self.assertEqual(objects["P"]["refs"], ["$conic"])
        self.assertEqual(objects["M"]["op"], "midpoint")
        self.assertEqual(objects["M"]["refs"], [objects["P"]["id"], "feature:F₁"])
        self.assertTrue(any(line.get("a") == "P" and line.get("b") == "M" for line in solved["scene"]["lines"]))

    def test_moving_line_intersections_drive_midpoint_and_line(self):
        solved = fallback_solution("椭圆x^2/9+y^2/4=1，过右焦点的动直线l与椭圆交于A、B，M为AB的中点，连接OM。")
        scene = solved["scene"]
        middle = next(item for item in scene["objects"] if item["label"] == "M")
        self.assertTrue(scene["dynamicLine"])
        self.assertEqual(scene["lineThrough"], "focus2")
        self.assertEqual(middle["refs"], ["feature:A", "feature:B"])
        self.assertTrue(any(line.get("a") == "O" and line.get("b") == "M" for line in scene["lines"]))

    def test_answer_derived_tangents_share_solution_board_and_verification(self):
        cases = [
            ("椭圆x^2/4+y^2/3=1，点P(1,3/2)在椭圆上，求在点P处的切线方程。", "x+2y-4=0"),
            ("圆x^2+y^2=9，点P(0,3)在圆上，求在点P处的切线方程。", "y-3=0"),
            ("双曲线x^2/4-y^2/5=1，点P(2,0)在双曲线上，求在点P处的切线方程。", "x-2=0"),
            ("抛物线y^2=8x，点P(2,4)在抛物线上，求在点P处的切线方程。", "x-y+2=0"),
        ]
        for question, expected in cases:
            with self.subTest(question=question):
                solved = fallback_solution(question)
                tangent = next(line for line in solved["scene"]["lines"] if line.get("role") == "tangent")
                self.assertEqual(tangent["equation"], expected)
                self.assertEqual(tangent["source"], "derived")
                self.assertEqual(tangent["part"], 0)
                self.assertEqual(tangent["construction"]["schema"], "dongjiexi-construction/v1")
                self.assertEqual(tangent["construction"]["type"], "tangent_at")
                self.assertIn(expected, solved["answer"])
                self.assertEqual(solved["verification"]["status"], "locally-verified")
                self.assertEqual(solved["parts"][0]["verification"]["status"], "locally-verified")

    def test_tangent_at_answer_derived_intersection_is_drawn_and_verified(self):
        solved = fallback_solution("圆x^2+y^2=9与直线y=0交于A、B。（1）求A、B坐标；（2）求圆在A点处的切线方程。")
        tangent = next(line for line in solved["scene"]["lines"] if line.get("role") == "tangent")
        derived_point = next(item for item in solved["scene"]["objects"]
                             if item.get("id") == tangent["pointRef"])
        self.assertEqual(tangent["equation"], "x+3=0")
        self.assertEqual(tangent["part"], 2)
        self.assertEqual(derived_point["label"], "A")
        self.assertEqual(derived_point["exact"], {"x": "-3", "y": "0"})
        self.assertEqual(tangent["refs"], [derived_point["id"], "$conic"])
        self.assertEqual(tangent["construction"]["inputs"]["point_ref"], derived_point["id"])
        tangent_check = next(item for item in solved["verification"]["checks"] if item["id"].startswith("tangent-"))
        self.assertEqual(tangent_check["status"], "verified")
        self.assertEqual(solved["verification"]["status"], "locally-verified")

    def test_two_named_tangents_are_drawn_and_perpendicularity_is_proved(self):
        solved = fallback_solution("圆x^2+y^2=25，点A(3,4)、B(-4,3)在圆上，证明A、B两点处的切线互相垂直。")
        tangents = [line for line in solved["scene"]["lines"] if line.get("role") == "tangent"]
        self.assertEqual([(line["point"], line["equation"]) for line in tangents],
                         [("A", "3x+4y-25=0"), ("B", "4x-3y+25=0")])
        self.assertTrue(all(line["part"] == 0 and line["source"] == "derived" for line in tangents))
        self.assertIn("方向向量点积为 0", solved["answer"])
        relation = next(item for item in solved["verification"]["checks"]
                        if item["id"] == "tangent-perpendicular-0")
        self.assertEqual(relation["status"], "verified")
        self.assertEqual(relation["formula"], "d₁·d₂=0")
        self.assertEqual(solved["verification"]["status"], "locally-verified")

    def test_plural_tangent_wording_accepts_explicit_point_suffixes(self):
        solved = fallback_solution("圆x^2+y^2=25，A(3,4)、B(-4,3)在圆上，证明A点和B点处的切线互相垂直。")
        tangents = [line for line in solved["scene"]["lines"] if line.get("role") == "tangent"]
        self.assertCountEqual([line["point"] for line in tangents], ["A", "B"])
        self.assertIn("方向向量点积为 0", solved["answer"])

    def test_incomplete_plural_tangent_request_is_not_marked_answered(self):
        solved = fallback_solution("圆x^2+y^2=25，点A(3,4)、B(0,0)，求A、B两点处的切线并证明互相垂直。")
        tangents = [line for line in solved["scene"]["lines"] if line.get("role") == "tangent"]
        self.assertEqual([line["point"] for line in tangents], ["A"])
        self.assertEqual(solved["parts"][0]["status"], "partial")
        self.assertNotIn("分别为", solved["parts"][0]["answer"])

    def test_two_tangents_can_use_exact_line_conic_intersections(self):
        solved = fallback_solution("圆x^2+y^2=25与直线y=1/7x+25/7交于A、B，证明A、B两点处的切线互相垂直。")
        tangents = [line for line in solved["scene"]["lines"] if line.get("role") == "tangent"]
        self.assertEqual(len(tangents), 2)
        self.assertEqual({line["equation"] for line in tangents}, {"4x-3y+25=0", "3x+4y-25=0"})
        self.assertTrue(all(str(line["pointRef"]).startswith("derived-intersection-") for line in tangents))
        self.assertEqual(len({line["pointRef"] for line in tangents}), 2)
        relation = next(item for item in solved["verification"]["checks"]
                        if item["id"] == "tangent-perpendicular-0")
        self.assertEqual(relation["status"], "verified")

    def test_false_two_tangent_perpendicular_claim_is_contradicted(self):
        solved = fallback_solution("圆x^2+y^2=25，点A(3,4)、B(-3,4)在圆上，证明A、B两点处的切线互相垂直。")
        self.assertEqual(len([line for line in solved["scene"]["lines"] if line.get("role") == "tangent"]), 2)
        self.assertIn("结论不成立", solved["answer"])
        relation = next(item for item in solved["verification"]["checks"]
                        if item["id"] == "tangent-perpendicular-0")
        self.assertEqual(relation["status"], "contradicted")
        self.assertNotEqual(relation["formula"], "d₁·d₂=0")
        self.assertEqual(solved["verification"]["status"], "conflict")

    def test_perpendicular_relation_rejects_two_distinct_fake_tangent_refs(self):
        solved = fallback_solution("圆x^2+y^2=25，点A(3,4)、B(-4,3)在圆上，证明A、B两点处的切线互相垂直。")
        scene = solved["scene"]
        tangents = [line for line in scene["lines"] if line.get("role") == "tangent"]
        for index, line in enumerate(tangents):
            fake = f"fake-{index}"
            line["pointRef"] = fake
            line["refs"] = [fake, "$conic"]
            line["construction"]["inputs"]["point_ref"] = fake
        checked = attach_trust_report(result(scene, solved["restatement"], solved["parts"]))
        tangent_checks = [item for item in checked["verification"]["checks"]
                          if item["id"].startswith("tangent-") and item["id"] != "tangent-perpendicular-0"]
        self.assertEqual([item["status"] for item in tangent_checks], ["unresolved", "unresolved"])
        relation = next(item for item in checked["verification"]["checks"]
                        if item["id"] == "tangent-perpendicular-0")
        self.assertEqual(relation["status"], "contradicted")
        self.assertEqual(checked["verification"]["status"], "conflict")

    def test_tangent_rejects_same_coordinate_noncanonical_point_reference(self):
        solved = fallback_solution("圆x^2+y^2=9与直线y=0交于A、B，求圆在A点处的切线方程。")
        scene = solved["scene"]
        tangent = next(line for line in scene["lines"] if line.get("role") == "tangent")
        scene["objects"].append({"id": "fake-a", "kind": "point", "label": "A",
                                 "coordinates": [-3, 0], "exact": {"x": "-3", "y": "0"}})
        tangent["pointRef"] = "fake-a"
        tangent["refs"] = ["fake-a", "$conic"]
        tangent["construction"]["inputs"]["point_ref"] = "fake-a"
        checked = attach_trust_report(result(scene, solved["restatement"], solved["parts"]))
        tangent_check = next(item for item in checked["verification"]["checks"] if item["id"].startswith("tangent-"))
        self.assertEqual(tangent_check["status"], "contradicted")
        self.assertEqual(checked["verification"]["status"], "conflict")

    def test_midpoint_locus_is_eliminated_drawn_and_verified(self):
        solved = fallback_solution("已知椭圆x^2/9+y^2/4=1，点P为椭圆上的动点，点Q(1,0)，M为线段PQ的中点，求点M的轨迹方程并画出轨迹。")
        locus = next(item for item in solved["scene"]["objects"] if item.get("role") == "derived_locus")
        midpoint = next(item for item in solved["scene"]["objects"] if item.get("label") == "M" and item.get("op") == "midpoint")
        moving = next(item for item in solved["scene"]["objects"] if item.get("label") == "P" and item.get("op") == "point_on")
        self.assertEqual(solved["completion"], {"answered": 1, "total": 1})
        self.assertIn("(x-1/2)²/(9/4)+y²=1", solved["answer"])
        self.assertEqual(locus["equation"], "(x-1/2)²/(9/4)+y²=1")
        self.assertEqual(locus["conicType"], "ellipse")
        self.assertEqual(locus["exact"]["a2"], "9/4")
        self.assertEqual(locus["exact"]["b2"], "1")
        self.assertEqual(locus["refs"], [midpoint["id"], moving["id"], "feature:Q", "$conic"])
        self.assertEqual(locus["construction"]["type"], "midpoint_locus")
        check = next(item for item in solved["verification"]["checks"] if item["id"].startswith("derived-locus-"))
        self.assertEqual(check["status"], "verified")

    def test_corrupted_midpoint_locus_is_rejected(self):
        solved = fallback_solution("已知椭圆x^2/9+y^2/4=1，点P为椭圆上的动点，点Q(1,0)，M为PQ的中点，求点M的轨迹。")
        locus = next(item for item in solved["scene"]["objects"] if item.get("role") == "derived_locus")
        locus["exact"]["a2"] = "4"
        checked = attach_trust_report(result(solved["scene"], solved["restatement"], solved["parts"]))
        check = next(item for item in checked["verification"]["checks"] if item["id"].startswith("derived-locus-"))
        self.assertEqual(check["status"], "contradicted")
        self.assertEqual(checked["verification"]["status"], "conflict")

    def test_midpoint_locus_preserves_circle_and_parabola_geometry(self):
        cases = [
            ("圆x^2+y^2=4，点P为圆上的动点，点Q(1,0)，M为PQ的中点，求点M的轨迹。",
             "(x-1/2)²+y²=1", "circle", {"r2": "1"}),
            ("抛物线y^2=8x，点P为抛物线上的动点，点Q(2,0)，M为PQ的中点，求点M的轨迹。",
             "y²=4(x-1)", "parabola", {"p": "1", "direction": "1"}),
        ]
        for question, equation, kind, exact_subset in cases:
            with self.subTest(question=question):
                solved = fallback_solution(question)
                locus = next(item for item in solved["scene"]["objects"] if item.get("role") == "derived_locus")
                self.assertEqual(locus["equation"], equation)
                self.assertEqual(locus["conicType"], kind)
                for key, value in exact_subset.items():
                    self.assertEqual(locus["exact"][key], value)
                check = next(item for item in solved["verification"]["checks"] if item["id"].startswith("derived-locus-"))
                self.assertEqual(check["status"], "verified")

    def test_midpoint_locus_preserves_translation_orientation_and_rationals(self):
        translated = fallback_solution("椭圆(x-2)^2/4+(y+2)^2/9=1，点P为椭圆上的动点，点Q(0,2)，M为PQ的中点，求M的轨迹。")
        locus = next(item for item in translated["scene"]["objects"] if item.get("role") == "derived_locus")
        self.assertEqual(locus["orientation"], "vertical")
        self.assertEqual(locus["equation"], "(x-1)²+y²/(9/4)=1")
        rational = fallback_solution("圆x^2+y^2=4，点P为圆上的动点，点Q(1/3,2/5)，M为PQ的中点，求M的轨迹。")
        locus = next(item for item in rational["scene"]["objects"] if item.get("role") == "derived_locus")
        self.assertEqual(locus["exact"]["h"], "1/6")
        self.assertEqual(locus["exact"]["k"], "1/5")
        self.assertEqual(locus["equation"], "(x-1/6)²+(y-1/5)²=1")

    def test_unsupported_locus_does_not_invent_a_curve(self):
        solved = fallback_solution("椭圆x^2/9+y^2/4=1，点P为椭圆上的动点，点M随P运动，求点M的轨迹。")
        self.assertEqual(solved["parts"][0]["status"], "partial")
        self.assertFalse(any(item.get("role") == "derived_locus" for item in solved["scene"]["objects"]))
        self.assertIn("没有用采样点猜测", solved["parts"][0]["answer"])

    def test_answer_derived_normals_share_solution_board_and_exact_verification(self):
        cases = [
            ("椭圆x^2/4+y^2/3=1，点P(1,3/2)在椭圆上，求在点P处的法线方程。", "4x-2y-1=0"),
            ("圆x^2+y^2=9，点P(0,3)在圆上，求在点P处的法线方程。", "x=0"),
            ("双曲线x^2/4-y^2/5=1，点P(2,0)在双曲线上，求在点P处的法线方程。", "y=0"),
            ("抛物线y^2=8x，点P(2,4)在抛物线上，求在点P处的法线方程。", "x+y-6=0"),
        ]
        for question, expected in cases:
            with self.subTest(question=question):
                solved = fallback_solution(question)
                normal = next(line for line in solved["scene"]["lines"] if line.get("role") == "normal")
                self.assertEqual(normal["equation"], expected)
                self.assertEqual(normal["construction"]["type"], "normal_at")
                self.assertEqual(normal["part"], 0)
                self.assertIn(expected, solved["answer"])
                check = next(item for item in solved["verification"]["checks"] if item["id"].startswith("normal-"))
                self.assertEqual(check["status"], "verified")
                self.assertEqual(solved["parts"][0]["verification"]["status"], "locally-verified")

    def test_answer_derived_perpendicular_foot_is_dynamic_and_verified(self):
        solved = fallback_solution("已知圆x^2+y^2=9，点P(3,4)，直线l:y=1，求点P到直线l的垂足H的坐标。")
        foot = next(item for item in solved["scene"]["objects"] if item.get("role") == "perpendicular_foot")
        target = next(line for line in solved["scene"]["lines"] if line.get("label") == "l")
        self.assertEqual(foot["exact"], {"x": "3", "y": "1"})
        self.assertEqual(foot["refs"], ["feature:P", target["id"]])
        self.assertEqual(foot["construction"]["schema"], "dongjiexi-construction/v1")
        self.assertEqual(foot["construction"]["type"], "perpendicular_foot")
        self.assertFalse(solved["scene"]["dynamicLine"])
        self.assertIn("H(3,1)", solved["answer"])
        check = next(item for item in solved["verification"]["checks"] if item["id"].startswith("foot-"))
        self.assertEqual(check["status"], "verified")
        self.assertEqual(solved["parts"][0]["verification"]["status"], "locally-verified")

    def test_fixed_line_alias_does_not_create_unrelated_dynamic_line(self):
        solved = fallback_solution("已知圆x^2+y^2=9，点P(3,4)，l:y=1，求点P到直线l的垂足H的坐标。")
        self.assertFalse(solved["scene"]["dynamicLine"])
        self.assertTrue(any(item.get("role") == "perpendicular_foot" for item in solved["scene"]["objects"]))

    def test_perpendicular_foot_resolves_bare_named_line_among_multiple_lines(self):
        solved = fallback_solution("已知圆x^2+y^2=9，点P(3,4)，l:y=1，m:x=0，求点P到l的垂足H的坐标。")
        foot = next(item for item in solved["scene"]["objects"] if item.get("role") == "perpendicular_foot")
        target_id = foot["construction"]["inputs"]["line"]
        target = next(line for line in solved["scene"]["lines"] if line.get("id") == target_id)
        self.assertEqual(target["label"], "l")
        self.assertEqual(foot["exact"], {"x": "3", "y": "1"})

    def test_derived_construction_before_first_marker_binds_to_next_part_only(self):
        solved = fallback_solution("已知椭圆x^2/4+y^2/3=1，点P(1,3/2)在椭圆上，求在点P处的法线。（1）写出法线方程；（2）求离心率。")
        normal = next(line for line in solved["scene"]["lines"] if line.get("role") == "normal")
        self.assertEqual(normal["part"], 1)
        parts = {part["index"]: part for part in solved["parts"]}
        self.assertEqual(parts[1]["verification"]["status"], "locally-verified")
        self.assertEqual(parts[2]["verification"]["status"], "generated")

    def test_scene_contract_normalizes_browser_and_python_aliases(self):
        browser_scene = {"showDynamic": False, "inferredFromConditions": True}
        normalise_scene_contract(browser_scene)
        self.assertFalse(browser_scene["dynamicLine"])
        self.assertTrue(browser_scene["inferred_from_conditions"])
        python_scene = {"dynamicLine": True, "inferred_from_conditions": False}
        normalise_scene_contract(python_scene)
        self.assertTrue(python_scene["showDynamic"])
        self.assertFalse(python_scene["inferredFromConditions"])

    def test_invalid_normal_point_is_not_claimed(self):
        solved = fallback_solution("圆x^2+y^2=9，点P(0,0)，求在点P处的法线方程。")
        self.assertFalse(any(line.get("role") == "normal" for line in solved["scene"]["lines"]))
        self.assertEqual(solved["parts"][0]["status"], "partial")
        self.assertIn("没有把其它直线冒充为法线", solved["parts"][0]["answer"])

    def test_tampered_normal_and_foot_are_rejected_by_independent_checks(self):
        normal_solution = fallback_solution("圆x^2+y^2=9，点P(0,3)在圆上，求在点P处的法线方程。")
        normal_scene = normal_solution["scene"]
        normal_scene["lines"][0]["exact"]["C"] = "1"
        checked_normal = attach_trust_report(result(normal_scene, normal_solution["restatement"], normal_solution["parts"]))
        normal_check = next(item for item in checked_normal["verification"]["checks"] if item["id"].startswith("normal-"))
        self.assertEqual(normal_check["status"], "contradicted")

        foot_solution = fallback_solution("已知圆x^2+y^2=9，点P(3,4)，直线l:y=1，求点P到直线l的垂足H的坐标。")
        foot_scene = foot_solution["scene"]
        foot_scene["objects"][0]["exact"]["y"] = "2"
        checked_foot = attach_trust_report(result(foot_scene, foot_solution["restatement"], foot_solution["parts"]))
        foot_check = next(item for item in checked_foot["verification"]["checks"] if item["id"].startswith("foot-"))
        self.assertEqual(foot_check["status"], "contradicted")

    def test_invalid_tangent_point_does_not_create_or_claim_a_line(self):
        solved = fallback_solution("圆x^2+y^2=9，点P(0,0)，求在点P处的切线方程。")
        self.assertFalse(any(line.get("role") == "tangent" for line in solved["scene"]["lines"]))
        self.assertEqual(solved["parts"][0]["status"], "partial")
        self.assertIn("没有把其它方程冒充为切线", solved["parts"][0]["answer"])

    def test_parabola_focus_chord_builds_complete_dynamic_answer_scene(self):
        question = (
            "已知抛物线 C：y²=4x，点 P(1,0) 在抛物线 C 的内部。过点 P 的直线 l 与抛物线 C "
            "交于 A、B 两点，且 A、B 不与 P 重合。分别作抛物线 C 在 A、B 两点处的切线，两条切线交于点 Q，"
            "弦 AB 的中点为 M。\n（1）证明：抛物线在 A、B 两点处的切线互相垂直。\n"
            "（2）求点 Q 的轨迹，并说明点 Q 的轨迹与点 P 的位置关系。\n（3）求点 M 的轨迹方程。\n"
            "（4）若直线 l 的斜率为 1，求△PAB 的面积。"
        )
        solved = fallback_solution(question)
        scene = solved["scene"]
        self.assertEqual(solved["completion"], {"answered": 4, "total": 4})
        self.assertTrue(scene["dynamicLine"])
        self.assertIsNone(scene.get("dynamicLinePart"))
        self.assertEqual(scene["theta"], 45)
        tangents = [line for line in scene["lines"] if line.get("role") == "dynamic_tangent"]
        self.assertEqual([line["point"] for line in tangents], ["A", "B"])
        self.assertTrue(all(line.get("part") is None for line in tangents))
        self.assertTrue(all(line["construction"]["type"] == "dynamic_tangent_at" for line in tangents))
        q_locus = next(line for line in scene["lines"] if line.get("id") == scene["focusChord"]["qLocus"])
        m_locus = next(item for item in scene["objects"] if item.get("id") == scene["focusChord"]["mLocus"])
        self.assertEqual((q_locus["equation"], q_locus["part"]), ("x+1=0", 2))
        self.assertEqual((m_locus["equation"], m_locus["p"], m_locus["h"], m_locus["k"], m_locus["part"]),
                         ("y²=2(x-1)", 0.5, 1.0, 0.0, 3))
        self.assertIn("互相垂直", solved["parts"][0]["answer"])
        self.assertIn("x=-1", solved["parts"][1]["answer"])
        self.assertIn("y²=2(x-1)", solved["parts"][2]["answer"])
        self.assertIn("面积为 0", solved["parts"][3]["answer"])
        self.assertTrue(all(part["verification"]["status"] == "locally-verified" for part in solved["parts"]))

    def test_parabola_focus_chord_tampering_is_rejected(self):
        question = (
            "已知抛物线C：y²=4x，点P(1,0)。过点P的直线l与抛物线C交于A、B两点，分别作A、B两点处"
            "的切线，两条切线交于点Q，弦AB的中点为M。（1）证明两切线互相垂直。（2）求Q的轨迹。"
            "（3）求M的轨迹方程。（4）若l斜率为1，求△PAB的面积。"
        )
        solved = fallback_solution(question)
        scene = solved["scene"]
        tangent = next(line for line in scene["lines"] if line.get("role") == "dynamic_tangent")
        tangent["refs"][0] = "feature:P"
        checked = attach_trust_report(result(scene, solved["restatement"], solved["parts"]))
        relation = next(item for item in checked["verification"]["checks"]
                        if item["id"] == "tangent-perpendicular-1")
        self.assertEqual(relation["status"], "contradicted")
        self.assertEqual(checked["verification"]["status"], "conflict")

        solved = fallback_solution(question)
        scene = solved["scene"]
        midpoint_locus = next(item for item in scene["objects"]
                              if item.get("construction", {}).get("type") == "focus_chord_midpoint_locus")
        midpoint_locus["p"] = 2
        checked = attach_trust_report(result(scene, solved["restatement"], solved["parts"]))
        locus_check = next(item for item in checked["verification"]["checks"]
                           if item["id"] == "focus-chord-m-locus")
        self.assertEqual(locus_check["status"], "contradicted")
        self.assertEqual(checked["verification"]["status"], "conflict")


if __name__ == "__main__":
    unittest.main()
