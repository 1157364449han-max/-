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


if __name__ == "__main__":
    unittest.main()
