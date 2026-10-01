"""Numbers inside mathematics must not masquerade as new subquestions."""
import unittest

from server import split_problem_parts


class PartHeadingTests(unittest.TestCase):
    def test_function_root_and_arithmetic_are_not_headings(self):
        for text in ['已知点P(sqrt(5),1)，求椭圆方程。', '设f(1)=2，求f(1)。', '圆的半径为sqrt (5)，求面积。', '已知r=(2)/3，求圆的面积。']:
            with self.subTest(text=text):
                self.assertEqual(len(split_problem_parts(text)), 1)
                self.assertEqual(split_problem_parts(text)[0]['index'], 0)

    def test_numbered_questions_after_roots_are_preserved(self):
        text='点P(sqrt(5),1)在曲线上。（1）求方程；（2）证明面积不变。'
        self.assertEqual([p['index'] for p in split_problem_parts(text)], [1,2])
        self.assertIn('sqrt(5)', split_problem_parts(text)[0]['question'])

    def test_nested_roman_question_indices_are_unchanged(self):
        text='已知椭圆。（1）求方程；（2）设直线l过P。(i)求弦长。(ii)求面积。'
        self.assertEqual([p['index'] for p in split_problem_parts(text)], [1,201,202])
