import unittest
import server


class OrthogonalGoalTests(unittest.TestCase):
    def test_fixed_circle_goal_is_not_answered_by_repeating_ellipse(self):
        result = server.fallback_solution('椭圆 C：x²/2+y²=1。直线l与椭圆交于A、B。证明直线l与一个定圆相切，并求定圆方程。')
        self.assertEqual(result['completion']['answered'], 0)


if __name__ == '__main__':
    unittest.main()
