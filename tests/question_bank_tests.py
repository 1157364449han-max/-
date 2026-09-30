"""Acceptance calculations use sourced exam/classic questions, not generated exercises."""
import json
import math
from fractions import Fraction
from pathlib import Path
import unittest
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
DATA = json.loads((ROOT / 'dist/question-bank.json').read_text(encoding='utf-8'))
ITEMS = {item['id']: item for item in DATA['items']}


class QuestionBankTests(unittest.TestCase):
    def test_source_and_scope_contract(self):
        self.assertEqual(DATA['schema'], 'dongjiexi-question-bank/v1')
        self.assertEqual(len(ITEMS), 12)
        self.assertEqual({i['year'] for i in ITEMS.values() if i['kind'] == 'gaokao'}, set(range(2022, 2027)))
        self.assertEqual(sum(i['kind'] == 'classic' for i in ITEMS.values()), 2)
        for item in ITEMS.values():
            with self.subTest(id=item['id']):
                self.assertTrue(item['sources'])
                self.assertTrue(item['scope'])
                self.assertTrue(item['parts'])
                self.assertTrue(item['pitfall'])
                for source in item['sources']:
                    self.assertEqual(urlsplit(source['url']).scheme, 'https')
                    self.assertTrue(urlsplit(source['url']).hostname)
                self.assertEqual(len({p['index'] for p in item['parts']}), len(item['parts']))
                for part in item['parts']:
                    self.assertTrue(part['answer'])
                    self.assertTrue(part['steps'])
                if '节选' in item['scope']:
                    self.assertIn('选取原题', item['question'])

    def test_2022_exam_parameter_answers(self):
        circle = ITEMS['2022-beijing-3']['scene']
        self.assertEqual(2 * circle['h'] - 1, 0)
        hyperbola = ITEMS['2022-ii-21-1']['scene']
        self.assertAlmostEqual(hyperbola['a'] ** 2 + hyperbola['b'] ** 2, 4)
        self.assertEqual(hyperbola['a'], hyperbola['b'])
        ellipse = ITEMS['2022-beijing-19-1']['scene']
        self.assertAlmostEqual(ellipse['a'] ** 2 - ellipse['b'] ** 2, 3)

    def test_2023_circle_tangents_and_angle(self):
        scene = ITEMS['2023-i-6']['scene']
        slopes = []
        for line in scene['lines']:
            a, b, c = (line[key] for key in ('a', 'b', 'c'))
            self.assertAlmostEqual(b * -2 + c, 0)
            self.assertAlmostEqual(abs(2 * a + c) / math.hypot(a, b), scene['r'])
            slopes.append(-a / b)
        sine = abs(slopes[0] - slopes[1]) / math.sqrt((1 + slopes[0] ** 2) * (1 + slopes[1] ** 2))
        self.assertAlmostEqual(sine, math.sqrt(15) / 4)

    def test_2023_rectangle_is_non_degenerate_and_on_locus(self):
        scene = ITEMS['2023-i-22']['scene']
        points = scene['points']
        for name in ('A', 'B', 'C'):
            x, y = points[name]
            self.assertAlmostEqual(y, x * x + .25)
        a, b, c, d = [points[name] for name in ('A', 'B', 'C', 'D')]
        ab = [b[i] - a[i] for i in (0, 1)]
        bc = [c[i] - b[i] for i in (0, 1)]
        self.assertEqual(sum(ab[i] * bc[i] for i in (0, 1)), 0)
        self.assertEqual([a[i] + c[i] - b[i] for i in (0, 1)], d)
        self.assertGreater(2 * (math.hypot(*ab) + math.hypot(*bc)), 3 * math.sqrt(3))
        t = 1 / math.sqrt(2)
        self.assertAlmostEqual((1 + t * t) ** 1.5 / t, 3 * math.sqrt(3) / 2)

    def test_2024_recurrence_and_area_exactly(self):
        def determinant(u, v):
            return u[0] * v[1] - u[1] * v[0]
        for k in (Fraction(1, 4), Fraction(1, 2), Fraction(3, 4)):
            divisor = 1 - k * k
            matrix = ((1 + k * k, -2 * k), (-2 * k, 1 + k * k))
            move = lambda p: tuple(sum(matrix[i][j] * p[j] for j in (0, 1)) / divisor for i in (0, 1))
            points = [(Fraction(5), Fraction(4))]
            for _ in range(5):
                points.append(move(points[-1]))
            areas = []
            for n, p in enumerate(points):
                self.assertEqual(p[0] ** 2 - p[1] ** 2, 9)
                if n:
                    previous = points[n - 1]
                    self.assertEqual(p[0] - p[1], (1 + k) / (1 - k) * (previous[0] - previous[1]))
                    # Q=(-x_n,y_n) must be on the line through P_(n-1).
                    self.assertEqual(p[1] - previous[1], k * (-p[0] - previous[0]))
                if n >= 2:
                    u = tuple(points[n - 1][i] - points[n - 2][i] for i in (0, 1))
                    v = tuple(p[i] - points[n - 2][i] for i in (0, 1))
                    areas.append(abs(determinant(u, v)) / 2)
            self.assertEqual(len(set(areas)), 1)
            if k == Fraction(1, 2):
                self.assertEqual(points[1], (3, 0))
                self.assertEqual(areas[0], 8)

    def test_2025_exam_answers(self):
        hyperbola = ITEMS['2025-beijing-3']['scene']
        self.assertAlmostEqual(math.hypot(hyperbola['a'], hyperbola['b']) / hyperbola['a'], math.sqrt(5) / 2)
        self.assertEqual(4 * ITEMS['2025-beijing-11']['scene']['p'], 12)
        ellipse = ITEMS['2025-beijing-19-1']['scene']
        self.assertAlmostEqual(math.sqrt(ellipse['a'] ** 2 - ellipse['b'] ** 2) / ellipse['a'], math.sqrt(2) / 2)

    def test_classic_chord_answers(self):
        for identifier in ('classic-parabola-orthogonal', 'classic-parabola-focal-length'):
            scene = ITEMS[identifier]['scene']
            a, b = (scene['points'][name] for name in ('A', 'B'))
            for point in (a, b):
                self.assertAlmostEqual(point[1] ** 2, 4 * scene['p'] * point[0])
            if identifier.endswith('orthogonal'):
                self.assertAlmostEqual(sum(a[i] * b[i] for i in (0, 1)), 0)
            else:
                self.assertAlmostEqual(a[0] + b[0], 6)
                self.assertAlmostEqual(math.dist(a, b), 8)

    def test_password_help_and_private_config_policy(self):
        html = (ROOT / 'dist/index.html').read_text(encoding='utf-8')
        self.assertNotIn('它不是 DeepSeek API Key；口令只用于换取临时会话', html)
        self.assertIn('除非项目所有者明确要求更换', (ROOT / 'deploy/部署说明.md').read_text(encoding='utf-8'))
        for name in ('question-bank.js', 'question-bank.css', 'question-bank.json'):
            self.assertIn("'./" + name + "'", (ROOT / 'dist/service-worker.js').read_text(encoding='utf-8'))


if __name__ == '__main__':
    unittest.main()
