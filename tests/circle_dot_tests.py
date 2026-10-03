"""Independent symbolic proof checks; no production answer-bank lookup."""
import json
from pathlib import Path
import unittest
import sympy as sp


class CircleDotTests(unittest.TestCase):
    def test_translated_circle_identity(self):
        x, y, h, k, ax, ay, bx, by, r = sp.symbols('x y h k ax ay bx by r', real=True)
        dot = (ax-x)*(bx-x)+(ay-y)*(by-y)
        u, v = sp.Matrix([ax-h, ay-k]), sp.Matrix([bx-h, by-k])
        reduced = r*r + u.dot(v) - (x-h)*(u[0]+v[0]) - (y-k)*(u[1]+v[1])
        self.assertEqual(sp.expand(dot-reduced-((x-h)**2+(y-k)**2-r*r)), 0)

    def test_sourced_question_equality_and_closed_range(self):
        fixture = json.loads((Path(__file__).parent/'fixtures/sourced-exam-additions.json').read_text(encoding='utf8'))
        item = next(q for q in fixture['items'] if q['id']=='2022-beijing-10')
        a, b, r = sp.Integer(3), sp.Integer(4), sp.Integer(1)
        low, high = r*r-r*sp.sqrt(a*a+b*b), r*r+r*sp.sqrt(a*a+b*b)
        self.assertEqual(f'[{low},{high}]', item['testOracle'])
        for sign, value in [(1, low), (-1, high)]:
            x, y = sign*r*a/sp.sqrt(a*a+b*b), sign*r*b/sp.sqrt(a*a+b*b)
            self.assertEqual(sp.simplify(x*x+y*y-r*r), 0)
            self.assertEqual(sp.simplify((a-x)*(-x)+(-y)*(b-y)-value), 0)


if __name__ == '__main__':
    unittest.main()
