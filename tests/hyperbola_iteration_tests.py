"""Exact identities, source regression, and scope/safety for conic iteration."""
import copy
import json
from pathlib import Path
import unittest

import sympy as sp

from hyperbola_iteration import checks, decorate_scene, infer, proof_certificate, solve_part


ROOT = Path(__file__).resolve().parents[1]
QUESTION = next(item['question'] for item in json.loads((ROOT/'dist/question-bank.json').read_text(encoding='utf-8'))['items'] if item['id'] == '2024-ii-19')
PARTS = [
    {'index': 1, 'body': r'若 k=\dfrac12，求 x_2,y_2'},
    {'index': 2, 'body': r'证明 {x_n-y_n} 是公比为 \dfrac{1+k}{1-k} 的等比数列'},
    {'index': 3, 'body': r'设 S_n 为 \triangle P_nP_{n+1}P_{n+2} 的面积，证明对任意正整数 n，S_n=S_{n+1}'},
]


class HyperbolaIterationTests(unittest.TestCase):
    def test_sourced_premise_determines_unknown_m(self):
        scene = infer(QUESTION)
        self.assertEqual(scene['type'], 'hyperbola')
        self.assertEqual(scene['exact'], {'a2': '9', 'b2': '9'})
        self.assertEqual(scene['hyperbolaIteration']['start'], [5.0, 4.0])
        self.assertEqual(scene['hyperbolaIteration']['exact'], {'x1': '5', 'y1': '4', 'm': '9'})
        self.assertEqual(scene['points'], {'P₁': [5.0, 4.0]})
        self.assertFalse(scene['showDynamic'])

    def test_source_three_goals_proved_without_bank_answers(self):
        scene = infer(QUESTION)
        results = [solve_part(scene, QUESTION, part) for part in PARTS]
        self.assertTrue(all(results))
        self.assertIn('x_2=3', results[0][0])
        self.assertIn('y_2=0', results[0][0])
        self.assertIn(r'Q_{1}=(-3,0)', '\n'.join(results[0][1]))
        self.assertIn(r'\frac{1+k}{1-k}', results[1][0])
        self.assertIn('S_n=S_{n+1}', results[2][0])
        self.assertIn('固定同一个 k', '\n'.join(results[2][1]))
        self.assertFalse(any('\x08' in step or '\x0c' in step or '\t' in step for answer, steps in results for step in steps))

    def test_actual_server_pipeline_completes_source_and_builds_dependencies(self):
        import server
        result = server.fallback_solution(QUESTION)
        self.assertEqual(result['completion'], {'answered': 3, 'total': 3})
        self.assertTrue(all(part['status'] == 'answered' for part in result['parts']))
        self.assertEqual(result['scene']['exact'], {'a2': '9', 'b2': '9'})
        self.assertEqual(result['scene']['hyperbolaIteration']['parts'], {'coordinate': 1, 'progression': 2, 'area': 3})
        ids = {item['id'] for item in result['scene']['objects']}
        self.assertTrue({'iteration-line-1', 'iteration-Q-1', 'iteration-P-2', 'iteration-P-4'} <= ids)

    def test_general_initial_point_and_prefix_renaming(self):
        question = QUESTION.replace('(5,4)', '(13,5)').replace('P_', 'U_').replace('Q_', 'V_')
        scene = infer(question)
        self.assertEqual(scene['hyperbolaIteration']['m'], 144)
        self.assertEqual(scene['hyperbolaIteration']['pointPrefix'], 'U')
        self.assertEqual(scene['hyperbolaIteration']['otherPrefix'], 'V')
        answer = solve_part(scene, question, {'body': r'若k=1/2，求U_2的坐标'})
        self.assertIn(r'U_{2}=(15,-9)', answer[0])
        self.assertIn(r'V_{1}=(-15,-9)', '\n'.join(answer[1]))

    def test_exact_radical_initial_point_and_fractional_slope(self):
        question = QUESTION.replace('(5,4)', r'(\sqrt{5},1)')
        scene = infer(question)
        self.assertEqual(scene['hyperbolaIteration']['exact'], {'x1': 'sqrt(5)', 'y1': '1', 'm': '4'})
        answer = solve_part(scene, question, {'body': r'若k=1/3，求P_2的坐标'})
        self.assertIsNotNone(answer)
        self.assertIn(r'\sqrt{5}', answer[0])
        self.assertNotIn('2.236', answer[0])

    def test_braced_squares_unicode_subscripts_and_next_index_notation(self):
        plain = QUESTION.replace('x^2-y^2', 'x^{2}-y^{2}').replace('P_1', 'P₁')
        self.assertIsNotNone(infer(plain))
        next_index = QUESTION.replace('过 $P_{n-1}$', '过 $P_n$').replace('交于 $Q_{n-1}$', '交于 $Q_n$').replace('令 $P_n$ 为 $Q_{n-1}$', '令 $P_{n+1}$ 为 $Q_n$')
        self.assertIsNotNone(infer(next_index))

    def test_explicit_m_must_agree_with_point(self):
        self.assertIsNotNone(infer(QUESTION.replace('x^2-y^2=m', 'x^2-y^2=9')))
        self.assertIsNone(infer(QUESTION.replace('x^2-y^2=m', 'x^2-y^2=10')))
        self.assertIsNone(infer(QUESTION.replace('点 $P_1', 'm=10，点 $P_1')))

    def test_unsupported_premises_are_not_falsely_recognized(self):
        changes = [
            ('0<k<1', '0<k<2'),
            ('0<k<1', '-1<k<0'),
            ('x^2-y^2=m', '2x^2-y^2=m'),
            ('x^2-y^2=m', 'y^2-x^2=m'),
            ('x^2-y^2=m', '(x-1)^2-y^2=m'),
            ('左支', '右支'),
            ('关于 $y$ 轴', '关于 $x$ 轴'),
            ('关于 $y$ 轴', '关于直线 x=1'),
            ('(5,4)', '(-5,4)'),
            ('(5,4)', '(4,5)'),
            ('(5,4)', '(4,4)'),
            ('(5,4)', '(foo,4)'),
            ('斜率为 $k$', '斜率为 $k_n$'),
            ('令 $P_n$ 为 $Q_{n-1}$', '令 $P_n$ 为 $Q_n$'),
            ('过 $P_{n-1}$', '过 $R_{n-1}$'),
            ('在 $C$ 上', '在 $D$ 上'),
            ('在 $C$ 上', '在坐标平面内'),
            ('m>0', 'm<0'),
            ('m>0', 'm=16>0'),
            ('x^2-y^2=m', 'x^2-y^2=m(x+1)'),
            ('x^2-y^2=m', 'x^2-y^2=9x'),
            ('x^2-y^2=m', 'x^2-y^2=9(x+1)'),
            ('左支交于', '非左支交于'),
            ('令 $P_n$', '不令 $P_n$'),
            ('记 $P_n=(x_n,y_n)$', '记 $P_n=(x_n,y_n)$，且 $y_n>0$'),
        ]
        for old, new in changes:
            with self.subTest(new=new):
                self.assertIsNone(infer(QUESTION.replace(old, new)))

    def test_goal_guard_preserves_unanswered_compounds_and_wrong_claims(self):
        scene = infer(QUESTION)
        for body in (
            '若k=1/2，求x_2,y_2并求面积',
            '若k=1/2，求x_2,y_2，求P_2到O的距离',
            '若k=1，求P_2的坐标',
            '若k=0，求P_2的坐标',
            '若k=-1/2，求P_2的坐标',
            '求P_2的坐标',
            '若k=1/2，求P_3的坐标',
            '证明{x_n+y_n}是公比为(1+k)/(1-k)的等比数列',
            '证明{x_n-y_n}是公比为2的等比数列',
            '证明{x_n-y_n}是等比数列，公比为2',
            '证明{x_n-y_n}是公比为(1+k)/(1-k)+1的等比数列',
            '证明{x_n-y_n}不是等比数列',
            '证明{x_n-y_n+1}是公比为(1+k)/(1-k)的等比数列',
            '证明{x_n-y_n}是等比数列并求通项',
            '证明S_n=S_{n+2}',
            '证明S_n=S_{n+1}并求最大面积',
            '证明S_n=S_{n+1}=0',
            '若k=1/2，若k=1/4，求x_2,y_2',
            '若k=1/2，求x_2,y_2，求x_3,y_3',
            '若k=1/2(x+1)，求x_2,y_2',
            '证明{x_n-y_n}是等比数列，首项为2',
        ):
            with self.subTest(body=body):
                self.assertIsNone(solve_part(scene, QUESTION, {'body': body}))
        wrong_triangle = QUESTION.replace('P_nP_{n+1}P_{n+2}', 'P_nP_{n+2}P_{n+4}')
        self.assertIsNone(solve_part(scene, wrong_triangle, PARTS[2]))
        doubled_area = QUESTION.replace('的面积，证明', '的面积的两倍，证明')
        self.assertIsNone(solve_part(scene, doubled_area, PARTS[2]))

    def test_tampered_curve_and_initial_point_do_not_get_verified_answer(self):
        original = infer(QUESTION)
        for change in ({'a': 4}, {'b': 4}, {'h': 1}, {'k': 1}, {'orientation': 'vertical'}, {'points': {'P₁': [6, 4]}}):
            scene = copy.deepcopy(original)
            scene.update(change)
            self.assertIsNone(solve_part(scene, QUESTION, PARTS[1]))

    def test_independent_symbolic_metric_chord_lightcone_and_area_identities(self):
        k, x, y = sp.symbols('k x y', real=True)
        matrix = sp.Matrix([[1+k*k, -2*k], [-2*k, 1+k*k]])/(1-k*k)
        point = matrix*sp.Matrix([x, y])
        self.assertEqual(sp.factor(matrix.det()), 1)
        self.assertEqual(sp.simplify(matrix.T*sp.diag(1,-1)*matrix-sp.diag(1,-1)), sp.zeros(2))
        self.assertEqual(sp.factor(point[1]-y-k*(-point[0]-x)), 0)
        self.assertEqual(sp.factor(point[0]-point[1]-(1+k)/(1-k)*(x-y)), 0)
        u, v, r = sp.symbols('u v r', positive=True)
        p = lambda j: sp.Matrix([(u*r**j+v/r**j)/2, (v/r**j-u*r**j)/2])
        areas = [sp.factor(sp.det(sp.Matrix.hstack(p(n+1)-p(n), p(n+2)-p(n)))/2) for n in range(3)]
        self.assertTrue(all(sp.factor(area-u*v*(r-1)**3*(r+1)/(4*r*r)) == 0 for area in areas))
        self.assertEqual(sp.factor(((r-1)**3*(r+1)/(4*r*r)).subs(r,(1+k)/(1-k))-4*k**3/(1-k*k)**2), 0)
        cert = proof_certificate(infer(QUESTION))
        self.assertTrue(cert['verified'])
        self.assertFalse(cert['proofUsesSamples'])

    def test_exact_pose_sequence_residual_and_constant_area(self):
        for x1, y1, k in ((5,4,sp.Rational(1,2)), (13,5,sp.Rational(1,3)), (sp.sqrt(5),1,sp.Rational(2,3)), (5,-4,sp.Rational(3,4))):
            with self.subTest(start=(x1,y1), k=k):
                m = x1*x1-y1*y1
                matrix = sp.Matrix([[1+k*k,-2*k],[-2*k,1+k*k]])/(1-k*k)
                points = [sp.Matrix([x1,y1])]
                for _ in range(4):
                    current = points[-1]
                    following = sp.simplify(matrix*current)
                    q = sp.Matrix([-following[0], following[1]])
                    self.assertEqual(sp.simplify(following[0]**2-following[1]**2-m), 0)
                    self.assertEqual(sp.simplify(q[1]-current[1]-k*(q[0]-current[0])), 0)
                    self.assertTrue(following[0].is_positive)
                    points.append(following)
                for index in range(3):
                    area = sp.simplify(abs(sp.det(sp.Matrix.hstack(points[index+1]-points[index],points[index+2]-points[index])))/2)
                    self.assertEqual(sp.simplify(area-4*m*k**3/(1-k*k)**2), 0)

    def test_real_dependency_graph_part_scopes_and_idempotence(self):
        scene = infer(QUESTION)
        self.assertIs(decorate_scene(scene, QUESTION, PARTS), scene)
        by_id = {item['id']: item for item in scene['objects']}
        self.assertEqual(len(by_id), 9)
        self.assertEqual(by_id['iteration-line-1']['refs'], ['feature:P₁'])
        self.assertEqual(by_id['iteration-line-2']['refs'], ['iteration-P-2'])
        self.assertEqual(by_id['iteration-Q-1']['refs'], ['iteration-line-1', '$conic'])
        self.assertEqual(by_id['iteration-Q-1']['branch'], 0)
        self.assertEqual(by_id['iteration-P-2']['refs'], ['iteration-Q-1'])
        self.assertEqual(by_id['iteration-P-2']['op'], 'reflect_axis')
        self.assertEqual(by_id['iteration-P-2']['axis'], 'y')
        self.assertEqual(by_id['iteration-P-2']['parts'], [1,2,3])
        self.assertEqual(scene['pointParts']['P₁'], [1,2,3])
        self.assertEqual(scene['hyperbolaIteration']['parts'], {'coordinate': 1, 'progression': 2, 'area': 3})
        self.assertEqual(scene['polygons'][0]['labels'], ['P₁','P₂','P₃'])
        self.assertEqual(scene['polygons'][1]['labels'], ['P₂','P₃','P₄'])
        self.assertTrue(all(polygon['part'] == 3 for polygon in scene['polygons']))
        before = copy.deepcopy(scene)
        decorate_scene(scene, QUESTION, PARTS)
        self.assertEqual(scene, before)
        reports = checks(scene)
        self.assertEqual(len(reports), 3)
        self.assertTrue(all(item['status'] == 'verified' for item in reports))

    def test_user_owned_names_ids_and_bindings_are_preserved(self):
        for change in (
            {'points': {'P₁': [5,4], 'P₂': [99,88]}},
            {'pointBindings': {'P₂': 'vertex'}},
            {'pointBindings': {'P₁': 'user-moving'}},
            {'objects': [{'id': 'user-Q', 'kind': 'point', 'label': 'Q₁', 'x': 99, 'y': 88}]},
            {'objects': [{'id': 'iteration-Q-1', 'kind': 'point', 'label': 'R', 'x': 99, 'y': 88}]},
        ):
            with self.subTest(change=change):
                scene = infer(QUESTION)
                scene.update(copy.deepcopy(change))
                before = copy.deepcopy(scene)
                decorate_scene(scene, QUESTION, PARTS)
                for key, value in change.items():
                    self.assertEqual(scene[key], value)
                self.assertEqual(scene['objects'], before['objects'])

    def test_untrusted_scalar_and_incomplete_iteration_do_not_reach_symbolic_parser(self):
        for coordinates in ('(__import__(1),4)', '(1/0,0)', '(sqrt(-1),0)', '(NaN,0)', '(1e300,0)', '(20000,0)'):
            with self.subTest(coordinates=coordinates):
                self.assertIsNone(infer(QUESTION.replace('(5,4)', coordinates)))
        self.assertIsNone(infer('点P₁(5,4)在双曲线x²-y²=m上，求m。'))
        self.assertIsNone(proof_certificate({'hyperbolaIteration': {'schema': 'other'}}))
        tampered = infer(QUESTION)
        tampered['hyperbolaIteration']['exact']['m'] = '10'
        self.assertIsNone(proof_certificate(tampered))


if __name__ == '__main__':
    unittest.main()
