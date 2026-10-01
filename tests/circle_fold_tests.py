"""Independent exact identities for the user-supplied original folding question."""
import unittest
import sympy as s


class CircleFoldTests(unittest.TestCase):
    def test_circle_and_folded_length_symbolically(self):
        h, k = s.symbols('h k', real=True)
        center = s.solve([(-1-h)**2+k*k-(1-h)**2-(2-k)**2, h-k-1], [h,k])
        self.assertEqual(center, {h:1, k:0})
        r,c,v,alpha=s.symbols('r c v alpha', real=True)
        d=r*r-h*h
        root=s.sqrt(d+h*h*c*c)
        t1,t2=h*c-root,h*c+root
        M=s.Matrix([t1*c,t1*v,0])
        N=s.Matrix([t2*c,t2*v*s.cos(s.pi-alpha),t2*v*s.sin(s.pi-alpha)])
        L=s.expand((M-N).dot(M-N)).subs(v*v,1-c*c)
        formula=2*d*(1-s.cos(alpha))+(4*h*h+2*d*(1+s.cos(alpha)))*c*c
        self.assertEqual(s.simplify(L-formula),0)
        self.assertEqual(s.simplify(formula.subs({h:1,r:2,alpha:2*s.pi/3})),9+7*c*c)
        self.assertEqual(s.simplify(t1*t2),-d)

    def test_unique_constant_point(self):
        m,u,v=s.symbols('m u v',real=True)
        # Circle roots in signed x: x1+x2=2/(1+m²), x1*x2=-3/(1+m²).
        dot=u*u+v*v-3-2*(u+m*v)/(1+m*m)
        self.assertEqual(s.simplify(dot.subs({u:0,v:0})),-3)
        K=s.symbols('K',real=True)
        polynomial=s.Poly(s.expand((u*u+v*v-3-K)*(1+m*m)-2*(u+m*v)),m)
        solutions=s.solve(polynomial.all_coeffs(),[u,v,K],dict=True)
        self.assertEqual(solutions,[{K:-3,u:0,v:0}])
