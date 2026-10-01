"""Independent exact and safety checks for generic focus/directrix loci."""
import unittest

import sympy as sp

from parabola_locus import decorate_scene, infer, proof_certificate, scalar, solve_part


ORIGINAL = (
    r"在直角坐标系 $xOy$ 中，点 $P$ 到 $x$ 轴的距离等于点 $P$ 到点 "
    r"$\left(0,\dfrac12\right)$ 的距离，记动点 $P$ 的轨迹为 $W$。"
    "（1）求 W 的方程；（2）已知矩形 ABCD 有三个顶点在 W 上，证明：矩形 ABCD 的周长大于 3√3。"
)


class ParabolaLocusTests(unittest.TestCase):
    def test_original_focus_directrix_without_parabola_keyword(self):
        scene = infer(ORIGINAL)
        self.assertEqual(scene['type'], 'parabola')
        self.assertEqual(scene['orientation'], 'vertical')
        self.assertEqual(scene['exact'], {'p': '1/4', 'h': '0', 'k': '1/4', 'direction': '1'})
        self.assertEqual(scene['locusDefinition']['focus'], ['0', '1/2'])
        self.assertEqual(scene['locusDefinition']['directrix'], {'axis': 'y', 'value': '0'})
        self.assertEqual(scene['locusDefinition']['locusName'], 'W')
        x, y = sp.symbols('x y', real=True)
        self.assertEqual(sp.expand((x*x+(y-sp.Rational(1, 2))**2)-y*y), x*x-y+sp.Rational(1, 4))
        self.assertTrue(solve_part(scene, ORIGINAL, {'body': '求 W 的方程'})[0].startswith('轨迹方程'))

    def test_translated_horizontal_and_inverted_loci(self):
        samples = [
            ('点P到直线x=1的距离等于到定点F(5,-2)的距离，轨迹为W。', 'horizontal', 1, '2', '3', '-2'),
            ('点P到直线x=1的距离等于到定点F(-3,2)的距离，轨迹为W。', 'horizontal', -1, '2', '-1', '2'),
            ('点P到直线y=3的距离等于到定点F(2,-1)的距离，轨迹为W。', 'vertical', -1, '2', '2', '1'),
            ('点P到y轴的距离等于到定点F(-2,3)的距离，轨迹为W。', 'horizontal', -1, '1', '-1', '3'),
        ]
        for text, orientation, direction, p, h, k in samples:
            with self.subTest(text=text):
                scene = infer(text)
                self.assertEqual(scene['orientation'], orientation)
                self.assertEqual(scene['direction'], direction)
                self.assertEqual(scene['exact']['p'], p)
                self.assertEqual(scene['exact']['h'], h)
                self.assertEqual(scene['exact']['k'], k)

    def test_root_focus_and_fractional_directrix_remain_exact(self):
        scene = infer(r'点P到直线y=\frac{1}{2}的距离等于到F(\sqrt{2}/2,-3/2)的距离，轨迹为W。')
        self.assertEqual(scene['exact'], {'p': '1', 'h': 'sqrt(2)/2', 'k': '-1/2', 'direction': '-1'})

    def test_degenerate_ambiguous_or_restricted_loci_are_not_invented(self):
        for text in (
            '点P到x轴的距离等于到定点F(2,0)的距离，轨迹为W。',
            '点P到直线x=2的距离等于到定点F(2,1)的距离，轨迹为W。',
            '点P到x轴的距离等于到F(0,1)和到G(2,1)的距离，轨迹为W。',
            '点P到x轴和y轴的距离等于到F(0,1)的距离，轨迹为W。',
            '第一象限的点P到x轴的距离等于到F(0,1)的距离，轨迹为W。',
            '点P到x轴的距离小于到F(0,1)的距离。',
            '点P到直线y=2·x+1的距离等于到F(0,1)的距离，轨迹为W。',
            '点P到直线y=2x+1的距离等于到F(0,1)的距离，轨迹为W。',
            '点P到x轴的距离等于3，到F(0,1)的距离也等于3，轨迹为W。',
            '点P到x轴的距离等于到F(0,1)的距离，且P的横坐标大于0，轨迹为W。',
            '点P到x轴的距离等于到F(0,1)的距离，P满足x≥0，轨迹为W。',
            '点P到x轴的距离等于点Q到F(0,1)的距离，轨迹为W。',
        ):
            with self.subTest(text=text):
                self.assertIsNone(infer(text))

    def test_scalar_whitelist_and_exact_tex(self):
        for token, expected in [('3√3', 3*sp.sqrt(3)), (r'\frac{\sqrt{2}}{2}', sp.sqrt(2)/2), ('-3/2', -sp.Rational(3, 2)), ('sqrt(8)/2', sp.sqrt(2)), ('0.25', sp.Rational(1, 4)), ('(1+sqrt(2))/3', (1+sp.sqrt(2))/3)]:
            self.assertEqual(scalar(token), expected)
        for unsafe in ('__import__("os")', 'sin(1)', 'x', '1/0', 'sqrt(-1)', '2**99999', '1e300', '().__class__', 'NaN'):
            with self.subTest(token=unsafe), self.assertRaises(ValueError):
                scalar(unsafe)

    def test_generic_distance_identity_all_orientations(self):
        x, y, f, d, lateral = sp.symbols('x y f d lateral', real=True)
        for vertical in (False, True):
            axial, minor = (y, x) if vertical else (x, y)
            vertex = (f+d)/2
            distance_difference = (axial-f)**2+(minor-lateral)**2-(axial-d)**2
            standard = (minor-lateral)**2-2*(f-d)*(axial-vertex)
            self.assertEqual(sp.expand(distance_difference-standard), 0)

    def test_exact_orthogonality_derivative_and_equality_certificate(self):
        scene = infer(ORIGINAL)
        certificate = proof_certificate(scene)
        self.assertTrue(certificate['verified'])
        self.assertEqual(certificate['strictBound'], '3*sqrt(3)')
        self.assertTrue(certificate['boundIsNotClaimedAsInfimum'])
        a, b, c = sp.symbols('a b c', real=True)
        ab = sp.Matrix([b-a, b*b-a*a])
        bc = sp.Matrix([c-b, c*c-b*b])
        self.assertEqual(sp.factor(ab.dot(bc)-(b-a)*(c-b)*(1+(a+b)*(b+c))), 0)
        t = sp.symbols('t', positive=True)
        f = (1+t*t)**sp.Rational(3, 2)/t
        self.assertEqual(sp.simplify(sp.diff(f,t)-sp.sqrt(1+t*t)*(2*t*t-1)/t**2), 0)
        self.assertEqual(sp.simplify(f.subs(t, 1/sp.sqrt(2))), 3*sp.sqrt(3)/2)
        self.assertNotEqual(1/sp.sqrt(2), 1)

    def test_original_both_parts_completed_without_bank_lookup(self):
        scene = infer(ORIGINAL)
        first = solve_part(scene, ORIGINAL, {'index': 1, 'body': '求 W 的方程'})
        second = solve_part(scene, ORIGINAL, {'index': 2, 'body': '已知矩形ABCD有三个顶点在W上，证明矩形ABCD的周长大于3√3'})
        self.assertIsNotNone(first)
        self.assertIsNotNone(second)
        self.assertIn(r'3\sqrt{3}', second[0].replace(' ', ''))
        self.assertIn('不可能同时成立', '\n'.join(second[1]))

    def test_scaled_bound_and_unsupported_stronger_claim(self):
        scene = {'type': 'parabola', 'p': 1.5, 'h': -2, 'k': 3, 'orientation': 'horizontal', 'direction': -1, 'exact': {'p': '3/2'}}
        text = '矩形ABCD有三个顶点在抛物线上。'
        self.assertIsNotNone(solve_part(scene, text, {'body': '证明矩形周长大于18√3'}))
        self.assertIsNone(solve_part(scene, text, {'body': '证明矩形周长大于19√3'}))
        self.assertIsNone(solve_part(scene, text, {'body': '证明矩形周长大于17√3'}))
        self.assertIsNone(solve_part(scene, text, {'body': '求矩形周长最小值'}))
        self.assertIsNone(solve_part(scene, '矩形ABCD有一个顶点在抛物线上', {'body': '证明矩形周长大于18√3'}))
        self.assertIsNone(proof_certificate({'type': 'parabola', 'p': 0}))

    def test_case_insensitive_server_normalization_and_separate_focus_declaration(self):
        scene = infer('定点F(0,1/2)，点P到x轴的距离等于到F的距离，记轨迹为W。')
        self.assertEqual(scene['exact']['p'], '1/4')
        scene = infer(ORIGINAL.lower())
        self.assertIsNotNone(solve_part(scene, ORIGINAL, {'body': '求 W 的方程'}))

    def test_later_locus_or_unfinished_additional_goal_not_marked_complete(self):
        scene = infer(ORIGINAL)
        self.assertIsNone(solve_part(scene, ORIGINAL, {'body': '求点 Q 的轨迹方程'}))
        self.assertIsNone(solve_part(scene, ORIGINAL, {'body': '求 W 的轨迹方程并求最大距离'}))
        self.assertIsNone(solve_part(scene, ORIGINAL, {'body': '求 W 的方程，求P到A的距离'}))
        self.assertIsNone(solve_part(scene, ORIGINAL, {'body': '证明矩形周长大于3√3并求最小面积'}))
        self.assertIsNone(solve_part(scene, '矩形ABCD有三个顶点在椭圆上。', {'body': '证明矩形周长大于3√3'}))
        steps = solve_part(scene, ORIGINAL, {'body': '证明矩形周长大于3√3'})[1]
        self.assertFalse(any('\x08' in step or '\x0c' in step or '\t' in step for step in steps))

    def test_definition_dependencies_and_real_rectangle_no_overwrites(self):
        parts = [{'index': 1, 'body': '求W的方程'}, {'index': 2, 'body': '证明矩形ABCD的周长大于3√3'}]
        scene = infer(ORIGINAL)
        self.assertIs(decorate_scene(scene, ORIGINAL, parts), scene)
        by_id = {item['id']: item for item in scene['objects']}
        self.assertEqual(by_id['parabola-definition-moving']['op'], 'point_on')
        self.assertEqual(by_id['parabola-definition-moving']['refs'], ['$conic'])
        self.assertEqual(by_id['parabola-definition-moving']['part'], 1)
        self.assertEqual(by_id['parabola-definition-foot']['refs'], ['parabola-definition-moving', 'parabola-definition-directrix'])
        self.assertEqual(scene['points']['A'], [1.0, 1.25])
        self.assertEqual(scene['points']['B'], [0.0, 0.25])
        self.assertEqual(scene['points']['C'], [-1.0, 1.25])
        self.assertEqual(scene['points']['D'], [0.0, 2.25])
        A, B, C, D = [sp.Matrix(list(map(sp.Rational, scene['points'][name]))) for name in 'ABCD']
        self.assertEqual((A-B).dot(C-B), 0)
        self.assertEqual(A+C-B, D)
        for point in (A, B, C):
            self.assertEqual(point[0]**2-point[1]+sp.Rational(1,4), 0)
        self.assertNotEqual(D[0]**2-D[1]+sp.Rational(1,4), 0)
        self.assertEqual(scene['pointParts']['A'], [2])
        self.assertEqual(scene['polygons'][0]['labels'], list('ABCD'))
        lengths = (len(scene['objects']),len(scene['lines']),len(scene['polygons']))
        decorate_scene(scene, ORIGINAL, parts)
        self.assertEqual((len(scene['objects']),len(scene['lines']),len(scene['polygons'])), lengths)
        for extra in ({'points': {'A': [5, 6]}}, {'pointBindings': {'B': 'vertex'}}):
            constrained = infer(ORIGINAL)
            constrained.update(extra)
            decorate_scene(constrained, ORIGINAL, parts)
            self.assertNotIn('rectangularParabola', constrained)
            for key, value in extra.items():
                self.assertEqual(constrained[key], value)
        changed = infer(ORIGINAL)
        changed['p'] = .5
        decorate_scene(changed, ORIGINAL, [parts[0]])
        self.assertEqual(changed['objects'], [])


if __name__ == '__main__':
    unittest.main()
