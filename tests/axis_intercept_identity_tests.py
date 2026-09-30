"""Independent exact checks, not an answer lookup used by the application."""
import unittest
import sympy as sp


class AxisInterceptIdentityTests(unittest.TestCase):
    def test_generic_width_identity(self):
        a, b, u, k = sp.symbols('a b u k', nonzero=True, real=True)
        d = b - k*u
        A, B, C = 1/a**2+k**2/b**2, 2*k*d/b**2, d**2/b**2-1
        disc = sp.factor(B**2-4*A*C)
        width_sq = a**4*b**2*disc/(k**2*u**2)
        expected = 8*a**2*b/(k*u)+4*a**2*(a**2-u**2)/u**2
        self.assertEqual(sp.simplify(width_sq-expected), 0)
        x = sp.symbols('x')
        self.assertEqual(sp.simplify((A*x**2+B*x+C).subs(x,u)), u**2/a**2)

    def test_sourced_beijing_2022_q19(self):
        x, k = sp.symbols('x k', real=True)
        y = k*(x+2)+1
        polynomial = sp.Poly(x**2/4+y**2-1, x)
        A, B, C = polynomial.all_coeffs()
        disc = sp.factor(B**2-4*A*C)
        self.assertEqual(disc, -4*k)
        candidates = sp.solve(sp.Eq(4*disc/k**2, 4), k)
        self.assertEqual(candidates, [-4])
        roots = sp.solve(polynomial.as_expr().subs(k,-4),x)
        intercepts = [sp.simplify(-t/(y.subs({k:-4,x:t})-1)) for t in roots]
        self.assertEqual(sp.simplify((intercepts[1]-intercepts[0])**2),4)

    def test_sourced_beijing_2022_q10_and_q12(self):
        theta = sp.symbols('theta', real=True)
        point = sp.Matrix([sp.cos(theta),sp.sin(theta)])
        product = sp.expand((sp.Matrix([3,0])-point).dot(sp.Matrix([0,4])-point))
        self.assertEqual(sp.trigsimp(product-(1-3*sp.cos(theta)-4*sp.sin(theta))),0)
        self.assertEqual((1-sp.sqrt(3**2+4**2),1+sp.sqrt(3**2+4**2)),(-4,6))
        # PA = A-P and PB = B-P have range [-4,6], not [-6,4].
        # The original uses PA dot PB; preserve the source rather than the distractor.
        m = sp.symbols('m', real=True)
        self.assertEqual(sp.solve(sp.Eq(1/(-m),sp.Rational(1,3)),m),[-3])


if __name__ == '__main__':
    unittest.main()
