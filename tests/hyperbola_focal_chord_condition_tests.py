import sys
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import server  # noqa: E402


QUESTION = (
    "设双曲线 C: x^2/a^2 - y^2/b^2 = 1 (a>0, b>0) 的左、右焦点分别为 F1、F2，"
    "过 F2 作平行于 y 轴的直线交 C 于 A、B 两点。若 |F1A|=13，|AB|=10，"
    "则 C 的离心率为"
)


class HyperbolaFocalChordConditionTests(unittest.TestCase):
    def test_conditions_determine_exact_hyperbola(self):
        scene = server.standard_conic(QUESTION)
        self.assertIsNotNone(scene)
        self.assertEqual(scene["type"], "hyperbola")
        self.assertEqual(scene["exact"], {"a2": "16", "b2": "20"})
        self.assertEqual(scene["equation"], "x²/16-y²/20=1")
        self.assertEqual(scene["points"], {"A": [6.0, 5.0], "B": [6.0, -5.0]})
        self.assertEqual(scene["hyperbola_focal_perpendicular_chord"]["eccentricity"], "3/2")

    def test_solution_answer_and_board_share_one_exact_model(self):
        result = server.fallback_solution(QUESTION)
        self.assertEqual(result["completion"], {"answered": 1, "total": 1})
        self.assertIn("e=3/2", result["answer"])
        self.assertEqual(result["scene"]["dynamicLine"], False)
        self.assertEqual(result["scene"]["lines"][0]["x"], 6.0)
        self.assertIn("|F_1A|=13", "".join(result["steps"]))
        object_ids = {item["id"] for item in result["scene"]["objects"]}
        self.assertEqual(object_ids, {"condition-f1a", "condition-ab"})

    def test_invalid_lengths_do_not_produce_a_fake_curve(self):
        impossible = QUESTION.replace("|F1A|=13", "|F1A|=4")
        self.assertIsNone(server.standard_conic(impossible))

    def test_cloud_headline_is_overridden_when_it_conflicts_with_exact_work(self):
        ai_result = {
            "mode": "cloud-ai", "title": "云端解答", "restatement": QUESTION,
            "answer": r"$\dfrac{\sqrt{61}}{6}$",
            "parts": [{"index": 0, "label": "完整题目", "body": QUESTION,
                       "question": QUESTION, "status": "answered",
                       "answer": r"$\dfrac{\sqrt{61}}{6}$", "steps": ["模型摘要与推导不一致。"]}],
            "completion": {"answered": 1, "total": 1},
            "scene": {"type": "hyperbola", "a": 2, "b": 1, "h": 0, "k": 0,
                      "orientation": "horizontal", "points": {}, "lines": [], "objects": []},
        }
        result = server.verify_ai_solution(ai_result)
        self.assertIn("e=3/2", result["answer"])
        self.assertNotIn("sqrt{61}", result["answer"])
        self.assertEqual(result["parts"][0]["source"], "symbolic-verified-override")
        self.assertEqual(result["scene"]["exact"], {"a2": "16", "b2": "20"})
        self.assertEqual(result["verification"]["status"], "locally-verified")
        self.assertEqual(result["verification"]["counts"]["answer_verified"], 1)

    def test_missing_cloud_scene_is_rebuilt_from_the_verified_model(self):
        ai_result = {
            "mode": "cloud-ai", "title": "云端解答", "restatement": QUESTION,
            "parts": [{"index": 0, "label": "完整题目", "body": QUESTION,
                       "question": QUESTION, "status": "answered",
                       "answer": "条件不足。", "steps": ["未完成。"]}],
            "completion": {"answered": 1, "total": 1}, "scene": None,
        }
        result = server.verify_ai_solution(ai_result)
        self.assertEqual(result["scene"]["exact"], {"a2": "16", "b2": "20"})
        self.assertEqual(result["scene"]["points"]["A"], [6.0, 5.0])
        self.assertIn("符号引擎", result["scene_notice"])
        self.assertIn("e=3/2", result["parts"][0]["answer"])
        self.assertEqual(result["verification"]["status"], "locally-verified")


if __name__ == "__main__":
    unittest.main()
