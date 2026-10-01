import unittest
import server

class MathAuditTests(unittest.TestCase):
    def test_compound_goals_do_not_become_complete(self):
        for text in ['椭圆 C：x²/4+y²=1，求焦点坐标并求椭圆面积。',
                     '椭圆 C：x²/4+y²=1，求焦点坐标的平方和。',
                     '椭圆 C：x²/4+y²=1，求渐近线方程。',
                     '圆 C：x²+y²=4，求离心率。',
                     '抛物线 C：y²=4x，点P(1,2)，求P处切线方程并求曲率。',
                     '抛物线 C：y²=4x，点P(1,2)，求P处法线方程并求曲率。']:
            with self.subTest(text=text):
                result=server.fallback_solution(text)
                self.assertEqual(result['completion']['answered'],0)
                self.assertIsNotNone(result['scene'])

    def test_existing_multi_feature_and_single_feature_remain_complete(self):
        for text in ['椭圆 C：x²/4+y²=1，求焦点坐标。','椭圆 C：x²/4+y²=1，求焦点、顶点、离心率和准线方程。']:
            with self.subTest(text=text):
                self.assertEqual(server.fallback_solution(text)['completion']['answered'],1)

    def test_ellipse_focal_proof_uses_current_conditions(self):
        text='已知椭圆C的左焦点为F(-1,0)，离心率为3/5。（1）求C的方程；（2）设O为坐标原点，过F且斜率大于0的动直线l与C交于P,Q两点，其中Q在第三象限，直线PO与C的另一个交点为R。(i)若△PQR的面积是△PFO的面积的10/3倍，求l的方程；(ii)求tan∠PQR的最小值。'
        result=server.fallback_solution(text)
        self.assertEqual(result['completion'],{'answered':3,'total':3})
        self.assertEqual(str(result['scene']['ellipseFocusChord']['exact']['areaRatio']),'10/3')
        steps=' '.join(step for part in result['parts'] for step in part['steps'])
        self.assertNotIn('c=1，e=1/2',steps)
        self.assertIn('10',steps)

if __name__=='__main__':unittest.main()
