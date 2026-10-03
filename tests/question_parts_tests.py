"""Regression: numbered references must never masquerade as real subquestions."""
import json
from pathlib import Path
import unittest

from question_parts import QuestionPartsError, headings, split_problem_parts

ROOT = Path(__file__).resolve().parents[1]
REFERRED = "已知椭圆C及直线l。\n（1）若离心率为1/2，求C的方程；\n（2）在（1）的条件下，证明两切线垂直；\n（3）在（1）（2）的条件下，求三角形面积最小值。"


class QuestionPartsTests(unittest.TestCase):
    def indexes(self, text):
        return [p["index"] for p in split_problem_parts(text)]

    def test_three_real_parts_with_parent_references(self):
        parts = split_problem_parts(REFERRED)
        self.assertEqual([p["index"] for p in parts], [1, 2, 3])
        self.assertEqual(parts[1]["body"], "在（1）的条件下，证明两切线垂直；")
        self.assertEqual(parts[2]["body"], "在（1）（2）的条件下，求三角形面积最小值。")
        self.assertTrue(parts[2]["question"].startswith("已知椭圆C及直线l。\n"))
        self.assertEqual([h["number"] for h in headings(REFERRED)], [1, 2, 3])

    def test_inline_headers_and_references(self):
        q = "已知条件。（1）若k=1/2，求坐标；（2）在（1）的条件下，求弦长；（3）结合（1）和（2），证明面积定值。"
        self.assertEqual(self.indexes(q), [1, 2, 3])
        self.assertIn("（1）和（2）", split_problem_parts(q)[2]["body"])

    def test_tex_wrapped_references_retained(self):
        q = "已知条件。\n（1）求方程。\n（2）在 $（1）$ 的条件下，根据\\(（1）\\)求坐标。"
        parts = split_problem_parts(q)
        self.assertEqual([p["index"] for p in parts], [1, 2])
        self.assertIn("$（1）$", parts[1]["body"])
        self.assertIn("\\(（1）\\)", parts[1]["body"])

    def test_math_and_references_not_headers(self):
        for q in ["已知点P(sqrt(5),1)，求方程。", "设f(1)=2，求f(1)。", "圆半径为sqrt (5)，求面积。", "已知r=(2)/3，求面积。", "已知r=(2)^3，求半径。", "根据（1）（2）求结论。", "已知(1)(2)为编号引用。", "由(i)(ii)得到结论。", "选取原题第（1）问。"]:
            with self.subTest(q=q):
                self.assertEqual(self.indexes(q), [0])
                self.assertEqual(split_problem_parts(q)[0]["body"], q)

    def test_mathematics_inside_real_parts(self):
        q = "点P(sqrt(5),1)在C上。（1）若r=sqrt(3)，求方程；（2）证明f(1)>0。"
        self.assertEqual(self.indexes(q), [1, 2])
        self.assertIn("sqrt(5)", split_problem_parts(q)[0]["question"])

    def test_paragraph_subject_and_parameter_headers(self):
        self.assertEqual(self.indexes("已知C\n（1）椭圆的标准方程。\n（2）k=1/2时的交点坐标。"), [1, 2])
        self.assertEqual(self.indexes("已知条件。（1）椭圆方程。（2）直线方程。"), [1, 2])

    def test_nested_roman_setup_and_references(self):
        q = "已知椭圆。（1）求方程；（2）在（1）的条件下设动直线。\n(i)若k=1，求弦长。\n(ii)在(i)的条件下，求面积。"
        parts = split_problem_parts(q)
        self.assertEqual([p["index"] for p in parts], [1, 201, 202])
        self.assertEqual(parts[1]["parent_index"], 2)
        self.assertEqual(parts[2]["sub_index"], "ii")
        self.assertIn("在（1）的条件下设动直线。", parts[2]["body"])
        self.assertIn("在(i)的条件下", parts[2]["body"])

    def test_roman_functions_and_reference_chains(self):
        self.assertEqual(self.indexes("（1）求f(i)与f(ii)；（2）由(i)(ii)证明结论。"), [1, 2])

    def test_true_duplicate_headers_report_duplicate(self):
        for q in ["（1）求x；（1）求y。", "（2）设动点。(i)求x。(i)求y。"]:
            with self.subTest(q=q), self.assertRaises(QuestionPartsError) as error:
                split_problem_parts(q)
            self.assertEqual(error.exception.code, "QUESTION_PARTS_DUPLICATE")
            self.assertIn("重复小问编号", str(error.exception))

    def test_maximum_specific_error(self):
        q = lambda n: "\n".join(f"（{i+1}）求x。" for i in range(n))
        self.assertEqual(len(split_problem_parts(q(12))), 12)
        with self.assertRaises(QuestionPartsError) as error:
            split_problem_parts(q(13))
        self.assertEqual(error.exception.code, "QUESTION_PARTS_MAX")
        self.assertNotIn("重复", str(error.exception))

    def test_flattened_parts_maximum(self):
        q = "（1）设动点。"+"".join(f"({r})求x。" for r in ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii"])+"（2）设直线。"+"".join(f"({r})求y。" for r in ["i", "ii", "iii", "iv", "v"])
        with self.assertRaises(QuestionPartsError) as error:
            split_problem_parts(q)
        self.assertEqual(error.exception.code, "QUESTION_PARTS_MAX")

    def test_length_and_type_bounds(self):
        self.assertEqual(len(split_problem_parts("文"*18000)), 1)
        for value, code in [("文"*18001, "QUESTION_PARTS_LENGTH"), (None, "QUESTION_PARTS_TEXT")]:
            with self.subTest(code=code), self.assertRaises(QuestionPartsError) as error:
                split_problem_parts(value)
            self.assertEqual(error.exception.code, code)

    def test_all_sourced_questions_preserve_counts(self):
        bank = json.loads((ROOT/"dist/question-bank.json").read_text(encoding="utf-8"))
        multi = {"2023-i-22": [1, 2], "2024-ii-19": [1, 2, 3], "2026-i-18": [1, 201, 202],
                 "2022-i-21": [1, 2], "2023-ii-21": [1, 2], "2024-i-16": [1, 2],
                 "2025-i-18": [1, 201, 202], "2025-ii-16": [1, 2]}
        for item in bank["items"]:
            with self.subTest(id=item["id"]):
                self.assertEqual(self.indexes(item["question"]), multi.get(item["id"], [0]))
        sourced = json.loads((ROOT/"tests/fixtures/sourced-exam-additions.json").read_text(encoding="utf-8"))
        for item in sourced["items"]:
            with self.subTest(id=item["id"]):
                self.assertEqual(self.indexes(item["question"]), [1, 2] if item["id"] == "2022-beijing-19-full" else [0])

    def test_offsets_are_original_tokens(self):
        q = "前提\n（1）求x；（2）根据（1）的结果求y。"
        for heading in headings(q):
            self.assertEqual(q[heading["index"]:heading["end"]], heading["raw"])


if __name__ == "__main__":
    unittest.main()
