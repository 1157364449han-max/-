"""Independent calculations for sourced national-paper lessons, not answer dispatch."""
import json
import math
from pathlib import Path
import unittest
import sympy as s

ROOT = Path(__file__).resolve().parents[1]
ITEMS = {q['id']: q for q in json.loads((ROOT / 'dist/question-bank.json').read_text(encoding='utf-8'))['items']}
NEW_IDS = ('2022-i-21', '2023-ii-21', '2024-i-12', '2024-i-16', '2025-i-18', '2025-ii-16')


class NationalBankTests(unittest.TestCase):
    def test_complete_sourced_lessons(self):
        for key in NEW_IDS:
            q = ITEMS[key]
            self.assertEqual(q['scope'], '完整题目')
            self.assertGreaterEqual(len(q['knowledge']), 2)
            self.assertTrue(q['sources'])
            self.assertTrue(q['scene'])
            self.assertFalse(q['scene']['showDynamic'])
        self.assertEqual(sum(len(ITEMS[key]['parts']) for key in NEW_IDS), 12)

    def test_2022_i_slopes_and_area(self):
        u, k, d, x = s.symbols('u k d x', real=True)
        self.assertEqual(s.factor((4/u-1/(u-1)-1)*u*(u-1)), -(u-2)**2)
        poly = s.Poly(x*x/2-(k*x+d)**2-1, x)
        a, b, c = poly.all_coeffs()
        total, product = -b/a, c/a
        numerator = s.factor(2*k*(product-2*total+4)+(d+2*k-1)*(total-4))
        self.assertEqual(s.simplify(numerator-4*(k+1)*(d+2*k-1)/(2*k*k-1)), 0)
        answer_d = s.solve(8*(d*d-1)-8*(d-3)**2, d)
        self.assertEqual(answer_d, [s.Rational(5, 3)])
        scene = ITEMS['2022-i-21']['scene']
        A, P, Q = (scene['points'][n] for n in ('A', 'P', 'Q'))
        for p in (A, P, Q):
            self.assertAlmostEqual(p[0]**2/2-p[1]**2, 1)
        slopes = [(p[1]-A[1])/(p[0]-A[0]) for p in (P, Q)]
        self.assertAlmostEqual(sum(slopes), 0)
        U, V = ([p[i]-A[i] for i in (0, 1)] for p in (P, Q))
        cross, dot = U[0]*V[1]-U[1]*V[0], sum(U[i]*V[i] for i in (0, 1))
        self.assertGreater(dot, 0)
        self.assertAlmostEqual(abs(cross)/dot, 2*math.sqrt(2))
        self.assertAlmostEqual(abs(cross)/2, 16*math.sqrt(2)/9)

    def test_2023_ii_fixed_line_identity(self):
        m = s.symbols('m')
        total, product = 32*m/(4*m*m-1), 48/(4*m*m-1)
        self.assertEqual(s.simplify(4*m*product-6*total), 0)
        scene = ITEMS['2023-ii-21']['scene']
        for name in ('M', 'N'):
            x, y = scene['points'][name]
            self.assertLess(x, -2)
            self.assertAlmostEqual(x*x/4-y*y/16, 1)
        p = scene['points']['P']
        self.assertEqual(p[0], -1)
        for line in scene['lines']:
            names = {'chord': ('M', 'N', 'T'), 'ma1': ('M', 'A₁', 'P'), 'na2': ('N', 'A₂', 'P'), 'fixed': ('P',)}[line['id']]
            for name in names:
                x, y = scene['points'][name]
                self.assertAlmostEqual(line['a']*x+line['b']*y+line['c'], 0)

    def test_2024_i_focal_chord(self):
        scene = ITEMS['2024-i-12']['scene']
        F1, F2, A, B = [scene['points'][n] for n in ('F₁', 'F₂', 'A', 'B')]
        self.assertAlmostEqual(math.dist(F1, A), 13)
        self.assertAlmostEqual(math.dist(A, B), 10)
        self.assertAlmostEqual(math.dist(F1, A)-math.dist(F2, A), 2*scene['a'])
        self.assertAlmostEqual(math.hypot(scene['a'], scene['b'])/scene['a'], 1.5)

    def test_2024_i_both_area_solutions(self):
        k = s.symbols('k', real=True)
        signed = -9*(2*k+1)*(2*k+3)/(2*(4*k*k+3))
        self.assertEqual(set(s.solve(signed*signed-81, k)), {s.Rational(1, 2), s.Rational(3, 2)})
        scene = ITEMS['2024-i-16']['scene']
        A, P = [scene['points'][n] for n in ('A', 'P')]
        for name, line in zip(('B', 'B₂'), scene['lines']):
            B = scene['points'][name]
            for x, y in (A, P, B):
                self.assertAlmostEqual(x*x/12+y*y/9, 1)
            for x, y in (P, B):
                self.assertAlmostEqual(line['a']*x+line['b']*y+line['c'], 0)
            area = abs((B[0]-A[0])*(P[1]-A[1])-(B[1]-A[1])*(P[0]-A[0]))/2
            self.assertEqual(area, 9)

    def test_2025_i_inverse_and_maximum(self):
        m, n, y = s.symbols('m n y', real=True)
        D = m*m+(n+1)**2
        relation = s.expand(-D+3*(n+1)-9*n)
        self.assertEqual(s.expand(relation + m*m+(n+4)**2-18), 0)
        distance2 = 9*(1-y*y)+(y+4)**2
        self.assertEqual(s.expand(distance2-(27-8*(y-s.Rational(1, 2))**2)), 0)
        H = s.Matrix([0, -4])
        M = s.Matrix([3*s.sqrt(3)/2, s.Rational(1, 2)])
        P = s.Matrix([-3*s.sqrt(2)/2, -4-3*s.sqrt(6)/2])
        A = s.Matrix([0, -1])
        R = s.simplify(A+3*(P-A)/(P-A).dot(P-A))
        self.assertEqual(s.simplify((P-H).dot(P-H)), 18)
        self.assertNotEqual(P[0], 0)
        self.assertEqual(s.simplify(R[1]/R[0]-3*P[1]/P[0]), 0)
        self.assertEqual(s.simplify((P-M).dot(P-M)-(3*s.sqrt(2)+3*s.sqrt(3))**2), 0)
        scene = ITEMS['2025-i-18']['scene']
        for name, exact in (('P', P), ('M', M), ('R', R)):
            for actual, value in zip(scene['points'][name], exact):
                self.assertAlmostEqual(actual, float(value))
        self.assertIn('不包含', ITEMS['2025-i-18']['sceneNote'])

    def test_2025_ii_area_and_length(self):
        x, k = s.symbols('x k', real=True)
        poly = s.Poly(x*x/4+(k*x-2)**2/2-1, x)
        a, b, c = poly.all_coeffs()
        difference2 = s.factor((-b/a)**2-4*c/a)
        self.assertEqual(s.simplify(difference2-16*(2*k*k-1)/(2*k*k+1)**2), 0)
        self.assertEqual({s.simplify(v*v) for v in s.solve(difference2-2, k)}, {s.Rational(3, 2)})
        scene = ITEMS['2025-ii-16']['scene']
        A, B = [scene['points'][n] for n in ('A', 'B')]
        for x, y in (A, B):
            self.assertAlmostEqual(x*x/4+y*y/2, 1)
        self.assertAlmostEqual(abs(A[0]*B[1]-A[1]*B[0])/2, math.sqrt(2))
        self.assertAlmostEqual(math.dist(A, B), math.sqrt(5))


if __name__ == '__main__':
    unittest.main()
