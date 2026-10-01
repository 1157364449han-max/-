import unittest
import json
from pathlib import Path
import server


class ProofScopeTests(unittest.TestCase):
    def test_unnumbered_definition_separates_conditions_from_goal(self):
        r=server.fallback_solution('在直角坐标系中，点P到x轴的距离等于点P到点(0,1/2)的距离，求P的轨迹方程。')
        self.assertEqual(r['completion']['answered'],1)

    def test_original_exam_backend_completes_answers_and_corresponding_scene(self):
        bank=json.loads((Path(__file__).resolve().parents[1]/'dist/question-bank.json').read_text(encoding='utf-8'))
        question=next(q['question'] for q in bank['items'] if q['id']=='2023-i-22')
        result=server.fallback_solution(question)
        self.assertEqual(result['completion'], {'answered':2,'total':2})
        scene=result['scene']
        self.assertAlmostEqual(scene['p'],.25)
        self.assertTrue(any(o.get('label')=='P' and o.get('op')=='point_on' for o in scene['objects']))
        self.assertTrue(any(o.get('op')=='foot' for o in scene['objects']))
        self.assertEqual(scene['rectangularParabola']['names'],list('ABCD'))
        self.assertEqual(len([p for p in scene['polygons'] if p.get('labels')==list('ABCD')]),1)
        for name in 'ABC':
            x,y=scene['points'][name]
            self.assertAlmostEqual(y,x*x+.25)

    def test_compound_tangent_goals_remain_partial(self):
        for goal in ('求A、B两点处的切线并求两条切线夹角的正弦值。',
                     '求A、B两点处的切线及两切线与x轴围成三角形的面积。'):
            with self.subTest(goal=goal):
                result = server.fallback_solution('圆C:x²+y²=25，点A(3,4)、B(-4,3)在圆上，'+goal)
                self.assertEqual(result['completion']['answered'], 0)
                self.assertEqual(result['parts'][0]['status'], 'partial')
                self.assertEqual(len([n for n in result['scene']['lines'] if n.get('role')=='tangent']), 2)

    def test_fixed_perpendicularity_retained_variable_pose_not_proof(self):
        prefix = '圆C:x²+y²=25，点A(3,4)、B(-4,3)在圆上，'
        fixed = server.fallback_solution(prefix+'证明A、B两点处的切线互相垂直。')
        self.assertEqual(fixed['completion']['answered'], 1)
        variable = server.fallback_solution(prefix.replace('点A','动点A')+'证明A、B两点处的切线恒互相垂直。')
        self.assertEqual(variable['completion']['answered'], 0)

    def test_omitted_unit_coefficient_asymptote(self):
        for focus, slope, expected in (('F(2,0)', '±x', (2,2)), ('F(3,0)', '±2x', (1.8,7.2))):
            with self.subTest(slope=slope):
                scene=server.standard_conic(f'已知双曲线C:x²/a²-y²/b²=1 的右焦点为{focus}，渐近线方程为y={slope}。求标准方程。')
                self.assertIsNotNone(scene)
                self.assertAlmostEqual(scene['a']**2, expected[0])
                self.assertAlmostEqual(scene['b']**2, expected[1])

    def test_partial_native_result_does_not_replace_richer_model_answer(self):
        text='圆C:x²+y²=25，点A(3,4)、B(-4,3)在圆上，求A、B两点处的切线并求两条切线夹角的正弦值。'
        raw={'mode':'local-ollama','restatement':text,'scene':server.standard_conic(text),
             'parts':[{'index':0,'status':'answered','body':text,'question':text,
                       'answer':'两条切线为3x+4y=25与-4x+3y=25；夹角正弦值为1。',
                       'steps':['方向向量点积为0且均非零，因此正弦值为1。']}]}
        checked=server.verify_ai_solution(raw)
        self.assertIn('夹角正弦值为1', checked['parts'][0]['answer'])
        self.assertNotEqual(checked['parts'][0].get('source'),'symbolic-verified-override')
