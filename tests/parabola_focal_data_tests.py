"""User-reported question regression and exact generalized focal-data tests.

Numeric changes below are engineering property tests, not invented exam items.
"""
import copy
import unittest

import sympy as sp

from parabola_focal_data import checks, decorate_scene, infer, proof_certificate, solve_part
from question_parts import split_problem_parts


QUESTION = (
    '已知抛物线 C：y^2=2px（p>0）的焦点为 F，准线与 x 轴交于点 K，'
    '过 F 的直线 l 与抛物线交于 A、B 两点。\n'
    '（1）若 |AB|=8，且线段 AB 中点的横坐标为 3，求抛物线 C 的方程；\n'
    '（2）在（1）的条件下，若直线 l 的倾斜角为 45°，求 |AB|；\n'
    '（3）在（1）（2）的条件下，设 M 为准线上一点，且 MA⊥MB，求点 M 的坐标。'
)


class ParabolaFocalDataTests(unittest.TestCase):
    def test_original_data_infers_standard_parameter_not_app_parameter(self):
        scene = infer(QUESTION)
        self.assertEqual(scene['type'], 'parabola')
        self.assertEqual(scene['p'], 1)
        self.assertEqual(scene['equation'], 'y²=4x')
        self.assertEqual(scene['parabolaFocalData']['standardP'], 2)
        self.assertEqual(scene['parabolaFocalData']['exact'], {'p': '1', 'standardP': '2', 'chordLength': '8', 'midpointX': '3'})
        self.assertEqual(scene['points'], {'F': [1.0, 0], 'K': [-1.0, 0]})
        self.assertEqual(scene['theta'], 45)
        self.assertEqual(scene['lineThrough'], 'point:F')

    def test_reference_parentheses_do_not_make_extra_parts(self):
        parts = split_problem_parts(QUESTION)
        self.assertEqual([part['index'] for part in parts], [1,2,3])
        self.assertIn('在（1）（2）的条件下', parts[2]['body'])
        self.assertEqual(infer(QUESTION)['parabolaFocalData']['parts'], {'equation': 1, 'length': 2, 'perpendicular': 3})

    def test_original_all_three_goals_are_exactly_proved(self):
        scene = infer(QUESTION)
        answers = [solve_part(scene, QUESTION, part) for part in split_problem_parts(QUESTION)]
        self.assertTrue(all(answers))
        self.assertIn('p=2', answers[0][0])
        self.assertIn('y^2=4x', answers[0][0])
        self.assertEqual(answers[1][0], '$|AB|=8$。')
        self.assertIn('M=(-1,2)', answers[2][0])
        self.assertIn('唯一', answers[2][0])
        self.assertIn('(t-2fc)^2', '\n'.join(answers[2][1]))
        self.assertIn('没有丢弃', '\n'.join(answers[1][1]))
        self.assertFalse(any('\x08' in step or '\x0c' in step or '\t' in step for answer, steps in answers for step in steps))

    def test_actual_server_pipeline_completes_all_goals_and_scoped_dependencies(self):
        import server
        result = server.fallback_solution(QUESTION)
        self.assertEqual(result['completion'], {'answered': 3, 'total': 3})
        self.assertEqual([part['index'] for part in result['parts']], [1,2,3])
        self.assertTrue(all(part['status'] == 'answered' for part in result['parts']))
        self.assertIn('M=(-1,2)', result['parts'][2]['answer'])
        self.assertEqual(result['scene']['p'], 1)
        self.assertEqual(result['scene']['theta'], 45)
        self.assertEqual(result['scene']['parabolaFocalData']['standardP'], 2)
        by_id = {item['id']: item for item in result['scene']['objects']}
        self.assertEqual(by_id['focal-data-M']['op'], 'foot')
        self.assertEqual(by_id['focal-data-M']['refs'], ['focal-data-midpoint','focal-data-directrix'])
        self.assertNotIn('derived-focus-chord-q', by_id)
        self.assertFalse(any(item.get('op') == 'tangent' for item in result['scene']['lines']))

    def test_fractional_scaled_data_remain_exact(self):
        question = QUESTION.replace('|AB|=8', r'|AB|=\dfrac{8}{3}').replace('为 3，求', r'为 \dfrac{1}{1}，求')
        scene = infer(question)
        self.assertEqual(scene['parabolaFocalData']['exact']['p'], '1/3')
        answers = [solve_part(scene, question, part) for part in split_problem_parts(question)]
        self.assertTrue(all(answers))
        self.assertIn(r'\frac{8}{3}', answers[1][0])
        self.assertIn(r'M=(- \frac{1}{3},\frac{2}{3})', answers[2][0])
        self.assertNotIn('0.333', '\n'.join(answer for answer, steps in answers))

    def test_general_special_angles_and_name_binding(self):
        examples = [('16', '7', '30', sp.Integer(1), 2*sp.sqrt(3)), ('16/3', '5/3', '60', sp.Integer(1), 2*sp.sqrt(3)/3), ('8', '3', '135', sp.Integer(1), -sp.Integer(2))]
        for length, mu, angle, f, target_y in examples:
            with self.subTest(angle=angle):
                question = QUESTION.replace('|AB|=8', '|AB|='+length).replace('为 3，求', '为 '+mu+'，求').replace('45°', angle+'°')
                scene = infer(question)
                self.assertEqual(scene['p'], float(f))
                answer = solve_part(scene, question, split_problem_parts(question)[2])
                self.assertIsNotNone(answer)
                self.assertIn(sp.latex(target_y), answer[0])
        renamed = QUESTION.replace('MA⊥MB', 'NU⊥NV').replace(' F', ' G').replace(' K', ' H').replace(' A、B', ' U、V').replace('AB', 'UV').replace(' M', ' N')
        scene = infer(renamed)
        self.assertEqual(scene['dynamicIntersectionLabels'], ['U','V'])
        self.assertEqual(scene['points'], {'G': [1.0,0], 'H': [-1.0,0]})
        answer = solve_part(scene, renamed, split_problem_parts(renamed)[2])
        self.assertIn('N=(-1,2)', answer[0])

    def test_vertical_endpoint_is_legal_and_unique(self):
        question = QUESTION.replace('|AB|=8', '|AB|=4').replace('为 3，求', '为 1，求').replace('45°', '90°')
        scene = infer(question)
        self.assertEqual(scene['p'], 1)
        self.assertEqual(scene['theta'], 90)
        answers = [solve_part(scene, question, part) for part in split_problem_parts(question)]
        self.assertEqual(answers[1][0], '$|AB|=4$。')
        self.assertIn('M=(-1,0)', answers[2][0])
        without_angle = question.replace('若直线 l 的倾斜角为 90°，', '')
        self.assertIn('M=(-1,0)', solve_part(infer(without_angle), without_angle, split_problem_parts(without_angle)[2])[0])

    def test_contradictory_angle_keeps_original_data_and_stays_partial(self):
        import server
        for angle in ('60', '0', '180'):
            with self.subTest(angle=angle):
                question = QUESTION.replace('45°', angle+'°')
                scene = infer(question)
                self.assertEqual(scene['p'], 1)
                self.assertTrue(scene['parabolaFocalData']['angleConflict'])
                self.assertEqual(scene['theta'], 45)
                parts = split_problem_parts(question)
                self.assertIsNotNone(solve_part(scene, question, parts[0]))
                self.assertIsNone(solve_part(scene, question, parts[1]))
                self.assertIsNone(solve_part(scene, question, parts[2]))
                result = server.fallback_solution(question)
                self.assertEqual(result['completion'], {'answered': 1, 'total': 3})

    def test_unknown_angle_and_missing_inheritance_do_not_invent_unique_coordinate(self):
        for question in (QUESTION.replace('45°', '20°'), QUESTION.replace('在（1）（2）的条件下', '在（1）的条件下')):
            with self.subTest(question=question):
                scene = infer(question)
                self.assertIsNotNone(scene)
                self.assertIsNone(solve_part(scene, question, split_problem_parts(question)[2]))
        changed = QUESTION.replace('设 M 为准线上一点', '若直线 l 的倾斜角为 135°，设 M 为准线上一点')
        self.assertIsNone(solve_part(infer(changed), changed, split_problem_parts(changed)[2]))

    def test_impossible_or_unsupported_data_and_curve_incidence_are_not_ignored(self):
        variants = [
            QUESTION.replace('|AB|=8', '|AB|=0'),
            QUESTION.replace('为 3，求', '为 4，求'),
            QUESTION.replace('为 3，求', '为 1，求'),
            QUESTION.replace('为 3，求', '为 3，且纵坐标为1，求'),
            QUESTION.replace('|AB|=8', '|AB|=8的两倍'),
            QUESTION.replace('|AB|=8', '|AB|=8x'),
            QUESTION.replace('|AB|=8', '|AB|=8，|AB|=9'),
            QUESTION.replace('p>0', 'p>0,p=3'),
            QUESTION.replace('为 3，求', '为 3且p=3，求'),
            QUESTION.replace('与抛物线交于', '与椭圆D交于'),
            QUESTION.replace('与抛物线交于', '与抛物线D交于'),
            QUESTION.replace('过 F 的直线', '过 K 的直线'),
            QUESTION.replace('y^2=2px', 'x^2=2py'),
            QUESTION.replace('y^2=2px', '(y-1)^2=2px'),
            QUESTION.replace('y^2=2px', 'y^2=2px+1'),
            QUESTION.replace('p>0', 'p<0'),
        ]
        for question in variants:
            with self.subTest(question=question):
                self.assertIsNone(infer(question))

    def test_wrong_quantities_extra_goals_negations_and_constraints_are_not_answered(self):
        variants = [
            QUESTION.replace('求 |AB|；', '求 |AB|的平方；'),
            QUESTION.replace('求 |AB|；', '求CD的弦长；'),
            QUESTION.replace('求 |AB|；', '求 |AB|并求面积；'),
            QUESTION.replace('求点 M 的坐标。', '求点 M 的坐标之和。'),
            QUESTION.replace('求点 M 的坐标。', '求点 M 的坐标和N的坐标。'),
            QUESTION.replace('设 M 为准线上一点', '不设 M 为准线上一点'),
            QUESTION.replace('MA⊥MB', 'MA⊥MB不成立'),
            QUESTION.replace('MA⊥MB', 'MA⊥MB且M在第四象限'),
            QUESTION.replace('直线 l 的倾斜角', '直线 m 的倾斜角'),
        ]
        for question in variants:
            with self.subTest(question=question):
                scene = infer(question)
                self.assertIsNotNone(scene)
                parts = split_problem_parts(question)
                target = parts[1] if question != QUESTION and parts[1]['body'] != split_problem_parts(QUESTION)[1]['body'] else parts[2]
                self.assertIsNone(solve_part(scene, question, target))

    def test_independent_symbolic_dot_length_and_endpoint_identities(self):
        f = sp.symbols('f', positive=True)
        c, t = sp.symbols('c t', real=True)
        roots = [2*f*(c-sp.sqrt(c*c+1)), 2*f*(c+sp.sqrt(c*c+1))]
        points = [sp.Matrix([c*y+f,y]) for y in roots]
        M = sp.Matrix([-f,t])
        self.assertEqual(sp.simplify((points[0]-M).dot(points[1]-M)-(t-2*f*c)**2), 0)
        self.assertEqual(sp.simplify(((points[0][0]+points[1][0])/2)-f*(1+2*c*c)), 0)
        self.assertEqual(sp.simplify((points[1]-points[0]).dot(points[1]-points[0])-(4*f*(1+c*c))**2), 0)
        for point in points:
            self.assertEqual(sp.simplify(point[1]**2-4*f*point[0]), 0)
        cert = proof_certificate(infer(QUESTION))
        self.assertTrue(cert['verified'])
        self.assertFalse(cert['proofUsesSamples'])
        self.assertEqual(cert['standardParameter'], '2')

    def test_construction_graph_uses_actual_dynamic_intersections_and_part_scope(self):
        scene = infer(QUESTION)
        context = decorate_scene(scene, QUESTION, split_problem_parts(QUESTION))
        self.assertTrue(context['graphInstalled'])
        objects = {item['id']: item for item in scene['objects']}
        self.assertEqual(objects['focal-data-midpoint']['refs'], ['feature:A','feature:B'])
        self.assertEqual(objects['focal-data-chord']['refs'], ['feature:A','feature:B'])
        self.assertEqual(objects['focal-data-M']['refs'], ['focal-data-midpoint','focal-data-directrix'])
        self.assertEqual(objects['focal-data-M']['part'], 3)
        self.assertEqual(objects['focal-data-MA']['refs'], ['focal-data-M','feature:A'])
        self.assertEqual(objects['focal-data-MB']['refs'], ['focal-data-M','feature:B'])
        self.assertEqual(scene['polygons'][0]['labels'], ['M','A','B'])
        self.assertEqual(scene['polygons'][0]['part'], 3)
        self.assertEqual(scene['pointParts']['F'], [1,2,3])
        self.assertEqual(scene['pointParts']['K'], [1,2,3])
        before = copy.deepcopy(scene)
        decorate_scene(scene, QUESTION, split_problem_parts(QUESTION))
        self.assertEqual(scene, before)
        self.assertTrue(all(item['status'] == 'verified' for item in checks(context)))

    def test_existing_user_points_bindings_and_objects_are_preserved(self):
        variants = [
            {'points': {'F': [1,0], 'K': [-1,0], 'M': [88,99]}},
            {'pointBindings': {'M': 'user-selected-point'}},
            {'pointBindings': {'F': 'user-focus'}},
            {'objects': [{'id': 'user-M', 'kind': 'point', 'label': 'M', 'x': 88, 'y': 99}]},
            {'lines': [{'id': 'focal-data-directrix', 'kind': 'vertical', 'x': 88}]},
            {'objects': [{'id': 'external-derived-M', 'source': 'derived', 'kind': 'point', 'label': 'M', 'x': 88, 'y': 99}]},
            {'objects': [{'id': 'focal-data-M', 'source': 'derived', 'kind': 'point', 'label': 'M', 'x': 88, 'y': 99}]},
            {'lines': [{'id': 'focal-data-directrix', 'source': 'derived', 'kind': 'vertical', 'x': 88, 'label': '准线'}]},
        ]
        for change in variants:
            with self.subTest(change=change):
                scene = infer(QUESTION)
                scene.update(copy.deepcopy(change))
                before = copy.deepcopy(scene)
                context = decorate_scene(scene, QUESTION, split_problem_parts(QUESTION))
                self.assertFalse(context['graphInstalled'])
                for key in change:
                    self.assertEqual(scene[key], before[key])

    def test_unresolved_or_negated_point_condition_does_not_install_asserted_M(self):
        examples = [
            QUESTION.replace('MA⊥MB', 'MA⊥MB不成立'),
            QUESTION.replace('设 M', '不设 M'),
            QUESTION.replace('MA⊥MB', 'MA⊥MB且M在第四象限'),
            QUESTION.replace('在（1）（2）的条件下', '在（1）的条件下'),
            QUESTION.replace('45°', '60°'),
        ]
        for question in examples:
            with self.subTest(question=question):
                scene = infer(question)
                context = decorate_scene(scene, question, split_problem_parts(question))
                self.assertTrue(context['graphInstalled'])
                self.assertFalse(scene['parabolaFocalData']['perpendicularResolved'])
                self.assertFalse(any(item.get('label') == 'M' for item in scene['objects']))
                self.assertFalse(any(item.get('id') == 'focal-data-triangle' for item in scene['polygons']))

    def test_curve_parameters_and_given_focus_are_not_silently_overwritten(self):
        for change in ({'p': 2}, {'h': 1}, {'k': 1}, {'orientation': 'vertical'}, {'direction': -1}, {'points': {'F': [2,0], 'K': [-1,0]}}):
            with self.subTest(change=change):
                scene = infer(QUESTION)
                scene.update(change)
                self.assertIsNone(solve_part(scene, QUESTION, split_problem_parts(QUESTION)[0]))
                self.assertIsNone(decorate_scene(scene, QUESTION, split_problem_parts(QUESTION)))

    def test_actual_pipeline_does_not_rescue_rejected_family_with_generic_equation(self):
        import server
        fixed = QUESTION.replace('y^2=2px', 'y^2=4x')
        examples = [
            fixed.replace('|AB|=8', '|AB|=10'),
            fixed.replace('为 3，求', '为 3且纵坐标为1，求'),
            fixed.replace('求抛物线 C 的方程', '求抛物线 C 的方程且求|AB|的平方'),
            QUESTION.replace('p>0', 'p>0,p=3'),
            QUESTION.replace('求 |AB|；', '求 |AB|的平方；'),
            QUESTION.replace('MA⊥MB', 'MA⊥MB不成立'),
        ]
        for question in examples:
            with self.subTest(question=question):
                result = server.fallback_solution(question)
                self.assertLess(result['completion']['answered'], result['completion']['total'])
                parts = result['parts']
                if '纵坐标为1' in question or '|AB|=10' in question or 'p=3' in question:
                    self.assertEqual(result['completion']['answered'], 0)
                elif '方程且' in question:
                    self.assertEqual(parts[0]['status'], 'partial')
                elif '|AB|的平方' in question:
                    self.assertEqual(parts[1]['status'], 'partial')
                else:
                    self.assertEqual(parts[2]['status'], 'partial')

    def test_restricted_numeric_parser_rejects_untrusted_or_unbounded_input(self):
        for token in ('__import__("os")', '1/0', 'sqrt(-1)', 'NaN', 'sin(2)', '1e300', '8(x+1)'):
            with self.subTest(token=token):
                self.assertIsNone(infer(QUESTION.replace('|AB|=8', '|AB|='+token)))
        corrupted = infer(QUESTION)
        corrupted['parabolaFocalData']['exact']['p'] = '2'
        self.assertIsNone(proof_certificate(corrupted))


if __name__ == '__main__':
    unittest.main()
