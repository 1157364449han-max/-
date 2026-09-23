const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const sandbox={window:{}};
for(const file of ['math-input','tangent-solver','construction-board','equation-builder'])vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../dist',file+'.js'),'utf8'),sandbox);
const {toPlain,prepare}=sandbox.window.DongMathInput,{contactsFromQuadratic}=sandbox.window.DongTangentSolver;
assert.equal(toPlain(String.raw`椭圆 $\frac{x^{2}}{9}+\frac{y^2}{4}=1$`),'椭圆 x^2/9+y^2/4=1');
assert.equal(toPlain(String.raw`\frac{(x-1)^2}{9}+\frac{(y+2)^2}{4}=1`),'(x-1)^2/9+(y+2)^2/4=1');
assert.equal(toPlain(String.raw`P\left(\frac{3}{2},\sqrt{4}\right)`),'P(3/2,2)');
assert.equal(toPlain(String.raw`\frac{1}{\frac{2}{3}}`),'1/(2/3)');
assert.match(prepare(String.raw`已知\frac{x^2}{9}=1。`),/\$.*\$/);
assert.equal(prepare('$x^2=1$'),'$x^2=1$');
const block='$$\n'+String.raw`\frac{x^2}{9}+\frac{y^2}{4}=1`+'\n$$';
assert.equal(prepare(block),block,'Multiline display math must not acquire nested delimiters');
const near=(a,b)=>assert(Math.abs(a-b)<1e-8,`${a} != ${b}`);
near(sandbox.window.DongEquationBuilder.scalar(String.raw`\frac{3}{2}`),1.5);
near(sandbox.window.DongEquationBuilder.scalar(String.raw`\sqrt{\frac{9}{4}}`),1.5);
near(sandbox.window.DongEquationBuilder.scalar(String.raw`\frac{\pi}{2}`),Math.PI/2);
const circle={A:1,B:0,C:1,D:0,E:0,F:-9};
const result=contactsFromQuadratic(circle,{x:5,y:0});near(result.points[0].x,1.8);near(result.points[0].y,2.4);
assert.equal(contactsFromQuadratic(circle,{x:0,y:0}).points.length,0);
assert.equal(contactsFromQuadratic(circle,{x:3,y:0}).points.length,1);
assert.equal(contactsFromQuadratic({...circle,C:-1},{x:5,y:0}),null);
// Parameter-grid tests, not a catalogue of memorized questions.
let cases=0;
for(const rx of [1,2,3,7])for(const ry of [1,4,6])for(const h of [-3,2])for(const angle of [0,.3,1.2,2.8]){
  const k=5,q={A:1/rx**2,B:0,C:1/ry**2,D:-2*h/rx**2,E:-2*k/ry**2,F:h*h/rx**2+k*k/ry**2-1};
  const p={x:h+2*rx*Math.cos(angle),y:k+2*ry*Math.sin(angle)},r=contactsFromQuadratic(q,p);
  assert.equal(r.points.length,2);
  for(const t of r.points){near(q.A*t.x*t.x+q.C*t.y*t.y+q.D*t.x+q.E*t.y+q.F,0);near((2*q.A*t.x+q.D)*(p.x-t.x)+(2*q.C*t.y+q.E)*(p.y-t.y),0);}
  cases++;
}
const model={lines:[{id:'tangent',kind:'construction',op:'tangent',refs:['contact','$conic']}],objects:[{id:'contact',kind:'construction',op:'ellipse_tangent_point',refs:['feature:P','$conic'],branch:0}]};
let source={name:'P',x:5,y:0};
const engine=sandbox.window.DongConstruct.createEngine({model:()=>model,coeffs:()=>circle,features:()=>[source]});
near(engine.resolve('contact').x,1.8);assert(engine.resolve('tangent'));
source={name:'P',x:0,y:5};near(engine.resolve('contact').y,1.8);assert(engine.resolve('tangent'));
source={name:'P',x:0,y:0};assert.equal(engine.resolve('contact'),null);assert.equal(engine.resolve('tangent'),null);
console.log(`PASS LaTeX normalization, ${cases} external tangent parameter cases, and live dependency recomputation`);
