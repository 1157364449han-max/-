import sys
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import server  # noqa: E402
from learning_engine import question_consistency_issue  # noqa: E402


CORRECTED = """
18. 已知椭圆 C: x^2/a^2+y^2/b^2=1 (a>b>0) 的左焦点为 F(-1,0)，离心率为 1/2。
(1) 求 C 的方程；
(2) 设 O 为坐标原点，过 F 且斜率大于 0 的动直线 l 与 C 交于 P,Q 两点，其中 Q 在第三象限，直线 PO 与 C 的另一个交点为 R。
(i) 若△PQR 的面积是△PFO 的面积的 3 倍，求 l 的方程；
(ii) 求 tan∠PQR 的最小值。
"""


class EllipseFocalChordTests(unittest.TestCase):
    def test_nested_parts_are_flattened_without_losing_parent_setup(self):
        parts = server.split_problem_parts(CORRECTED)
        self.assertEqual([part["index"] for part in parts], [1, 201, 202])
        self.assertEqual([part["label"] for part in parts], ["第（1）问", "第（2）（i）问", "第（2）（ii）问"])
        self.assertIn("直线 PO", parts[1]["body"])
        self.assertIn("面积", parts[1]["body"])
        self.assertIn("直线 PO", parts[2]["body"])
        self.assertIn("最小值", parts[2]["body"])

    def test_focus_and_eccentricity_build_exact_ellipse_and_solve_all_parts(self):
        result = server.fallback_solution(CORRECTED)
        self.assertEqual(result["completion"], {"answered": 3, "total": 3})
        self.assertEqual(result["scene"]["exact"], {"a2": "4", "b2": "3"})
        self.assertEqual(result["scene"]["dynamicIntersectionLabels"], ["Q", "P"])
        answers = {part["index"]: part["answer"] for part in result["parts"]}
        self.assertIn(r"\dfrac{x^2}{4}+\dfrac{y^2}{3}=1", answers[1])
        self.assertIn(r"\frac{\sqrt{5}}{2}", answers[201])
        self.assertIn(r"4 \sqrt{3}", answers[202])
        objects = {item["id"]: item for item in result["scene"]["objects"]}
        self.assertEqual(objects["ellipse-focal-r"]["op"], "reflect_center")
        self.assertEqual(objects["ellipse-focal-r"]["refs"], ["feature:P", "feature:O"])
        self.assertIn("ellipse-focal-po", objects)
        self.assertIn("ellipse-focal-qr", objects)

    def test_impossible_third_intersection_is_rejected_before_ai(self):
        wrong = CORRECTED.replace("直线 PO 与 C", "直线 PQ 与 C")
        issue = question_consistency_issue(wrong)
        self.assertIsNotNone(issue)
        self.assertIn("不可能再有第三个交点", issue)
        self.assertIsNone(question_consistency_issue(CORRECTED))


if __name__ == "__main__":
    unittest.main()
