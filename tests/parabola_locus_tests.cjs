const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),test=require('node:test');
const sandbox={window:{}};
for(const file of ['math-input.js','equation-builder.js','number-display.js','construction-board.js','parabola-locus.js'])vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../dist',file),'utf8'),sandbox);
const api=sandbox.window.DongParabolaLocus;
const near=(a,b)=>assert(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const original='在直角坐标系xOy中，点P到x轴的距离等于点P到点\\left(0,\\dfrac{1}{2}\\right)的距离，记动点P的轨迹为W。\n（1）求W的方程；\n（2）已知矩形ABCD有三个顶点在W上，证明：矩形ABCD的周长大于3\\sqrt3。';
const parts=[{index:1,body:'求W的方程'},{index:2,body:'已知矩形ABCD有三个顶点在W上，证明：矩形ABCD的周长大于3\\sqrt3。'}];
function scene(raw=original){const model=api.infer(raw);return {model,values:{p:model.p,h:model.h,k:model.k,direction:model.direction}};}
test('unlabelled focus and axis produce translated parabola without requiring its name',()=>{
  const m=api.infer(original);assert(m);assert.equal(m.type,'parabola');assert.equal(m.orientation,'vertical');near(m.p,.25);near(m.k,.25);near(m.h,0);assert.equal(m.direction,1);assert.equal(m.equation,'x^2=(y-\\frac{1}{4})');
  assert(m.derivation.some(s=>s.includes('没有因平方产生额外点')));
});
test('lower-opening and horizontally opening variants preserve focus/directrix',()=>{
  for(const [raw,expected] of [
    ['点M到定点F(2,-3)与直线y=1的距离相等，求点M的轨迹方程。',[2,-1,2,-1,'vertical']],
    ['动点N到定点G(-3,2)与直线x=1的距离相等，求N的轨迹。',[-1,2,2,-1,'horizontal']],
    ['点P到y轴的距离等于点P到点(4,3)的距离，求轨迹方程。',[2,3,2,1,'horizontal']]
  ]){const m=api.infer(raw);assert(m,raw);near(m.h,expected[0]);near(m.k,expected[1]);near(m.p,expected[2]);assert.equal(m.direction,expected[3]);assert.equal(m.orientation,expected[4]);}
});
test('focus on directrix is rejected rather than assigned a fictitious parabola',()=>{
  assert.equal(api.infer('点P到x轴距离等于到点(2,0)的距离，求轨迹。'),null);
  assert.equal(api.infer('点P到定点F(3,2)与直线x=3的距离相等，求轨迹。'),null);
});
test('oblique, ratio, sums, restrictions, ambiguous definitions and injected expressions stay unsupported',()=>{
  for(const raw of [
    '点P到直线y=2x+1的距离等于到点(0,1)的距离，求轨迹。',
    '点P到x轴距离等于到点(0,1)距离的2倍，求轨迹。',
    '点P到x轴与定点F(0,1)的距离之和等于2，求轨迹。',
    '第一象限点P到x轴距离等于到点(0,1)的距离，求轨迹。',
    '点P到x轴距离等于到点(0,1)的距离，且到y轴距离等于到点(1,0)距离，求轨迹。',
    '点P到x轴距离等于到点(0,alert(1))的距离，求轨迹。'
  ])assert.equal(api.infer(raw),null,raw);
});
test('general fractions/radicals are parsed without executing code and displayed exactly',()=>{
  const m=api.infer('点P到直线y=-1/2的距离等于到定点F(\\sqrt{2},3/2)的距离，求轨迹。');assert(m);near(m.h,Math.sqrt(2));near(m.k,.5);near(m.p,1);assert(m.equation.includes('\\sqrt{2}'));assert(m.equation.includes('\\frac{1}{2}'));
});
test('definition holds for all tested local points in all four opening directions',()=>{
  for(const raw of ['点P到x轴距离等于到点(0,1/2)的距离，求轨迹。','点P到定点F(2,-3)与直线y=1的距离相等，求轨迹。','点P到定点F(-3,2)与直线x=1的距离相等，求轨迹。','点P到y轴距离等于到点(4,3)的距离，求轨迹。']){
    const m=api.infer(raw),f=m.locusDefinition.focus,line=m.locusDefinition.directrix;
    for(let t=-8;t<=8;t+=.125){const q=m.orientation==='vertical'?[m.h+t,m.k+m.direction*t*t/(4*m.p)]:[m.h+m.direction*t*t/(4*m.p),m.k+t];near(Math.hypot(q[0]-f[0],q[1]-f[1]),Math.abs(q[line.axis==='x'?0:1]-line.value));}
  }
});
test('original rectangle proof generates legitimate vertices and excludes equality analytically',()=>{
  const s=scene(),c=api.install(s,original,parts);assert(c);assert.equal(c.parts.locus,1);assert.equal(c.rectangle.part,2);near(c.rectangle.bound,3*Math.sqrt(3));assert.equal(s.model.polygons[0].labels.join(''),'ABCD');
  const answer=api.solvePart(parts[1],c);assert.equal(answer.status,'answered');assert(answer.steps.some(step=>step.includes('两者不能同时成立')));assert(answer.steps.some(step=>step.includes('唯一最小值位置')));assert(answer.steps.some(step=>step.includes('不是唯一构型或最优构型')));
  const r=api.rectangle(s.model,s.values,0,1);assert(r.valid);near(r.perimeter,4*Math.sqrt(2));near(r.dot,0);assert(r.perimeter>r.bound);
});
test('renamed, rescaled translated parabola gets theorem bound from current p, not original answer',()=>{
  const raw='点P到定点F(2,-3)与直线y=1的距离相等，轨迹为Z。（1）求Z的方程。（2）矩形KLMN有三个顶点在Z上，证明矩形KLMN的周长大于24sqrt3。',pp=[{index:1,body:'求Z的方程'},{index:2,body:'证明矩形KLMN的周长大于24sqrt3。'}],s=scene(raw),c=api.install(s,raw,pp);assert(c?.rectangle);assert.equal(c.rectangle.names.join(''),'KLMN');near(c.rectangle.bound,24*Math.sqrt(3));assert(api.solvePart(pp[1],c).answer.includes('24\\sqrt{3}'));
});
test('false stronger numerical target cannot be silently treated as the proved target',()=>{
  const raw=original.replace('3\\sqrt3','100'),pp=[parts[0],{index:2,body:'证明：矩形ABCD的周长大于100。'}],s=scene(raw),c=api.install(s,raw,pp);assert(c);assert.equal(c.rectangle,null);assert.equal(api.solvePart(pp[1],c),null);assert(!s.model.rectangularParabola);
});
test('a different user-modified curve cannot inherit the original definition answer',()=>{
  const s=scene();s.values.p=.5;const c=api.install(s,original,parts);assert.equal(c,null);assert(!s.model.locusDefinition||s.model.locusDefinition.p===.25);
});
test('arbitrary existing translated parabola works without locus-definition text',()=>{
  const model={type:'parabola',p:1,h:4,k:5,direction:-1,orientation:'horizontal'},s={model,values:{p:1,h:4,k:5,direction:-1}},raw='已知抛物线(y-5)^2=-4(x-4)，矩形EFGH有三个顶点在抛物线上，证明周长大于12sqrt3。',pp=[{index:1,body:'证明矩形EFGH的周长大于12sqrt3。'}],c=api.install(s,raw,pp);assert(c?.rectangle);assert.equal(c.locus,null);assert.equal(c.rectangle.names.join(''),'EFGH');assert.equal(api.solvePart(pp[0],c).status,'answered');
});
test('large independent runtime sweep checks curve, right angle, fourth vertex, strict bound',()=>{
  let count=0;
  for(const orientation of ['horizontal','vertical'])for(const direction of [1,-1])for(const p of [.125,.25,1,2])for(const b of [-3,-2.5,-2,-1.5,-1,-.5,0,.5,1,1.5,2,2.5,3])for(const u of [.125,.2,.3,.5,.7,1,1.25,1.5,2,3,4,5,8]){
    const m={type:'parabola',p,h:2,k:-3,orientation,direction},r=api.rectangle(m,{},b,u);assert(r);if(!r.valid)continue;count++;const [A,B,C,D]=r.vertices;
    for(const q of [A,B,C]){const minor=orientation==='vertical'?q[0]-m.h:q[1]-m.k,major=orientation==='vertical'?q[1]-m.k:q[0]-m.h;near(minor*minor,4*p*direction*major);}
    near(r.dot,0);for(let j=0;j<2;j++)near(D[j],A[j]+C[j]-B[j]);assert(r.perimeter>r.bound);assert(Math.hypot(D[0]-A[0],D[1]-A[1])>0);
  }assert(count>1800);
});
test('degenerate rectangle inputs have explicit invalid status and no optimum claim',()=>{
  const s=scene();assert.equal(api.rectangle(s.model,s.values,.5,1).valid,false);assert.equal(api.rectangle(s.model,s.values,-.5,1).valid,false);assert.equal(api.rectangle(s.model,s.values,0,0),null);assert.equal(api.rectangle(s.model,s.values,0,Infinity),null);
});
test('verification separates universal proof from illustrative drawing',()=>{
  const s=scene(),c=api.install(s,original,parts),checks=api.checks(c);assert.equal(checks.length,2);assert(checks.every(item=>item.status==='verified'));assert(checks[1].detail.includes('不是靠枚举'));assert.equal(api.solvePart({index:99,body:'求面积最小值'},c),null);
});
test('unbraced legal single-token LaTeX fraction from sourced exam is recognized',()=>{
  const m=api.infer(original.replace('\\dfrac{1}{2}','\\dfrac12'));assert(m);near(m.p,.25);near(m.k,.25);
});
test('unknown coordinate restrictions and unrelated equal numeric distances never imply the whole locus',()=>{
  for(const extra of ['，且x≥0','，且P的横坐标为0','，且P的纵坐标大于0','，且P在第一象限'])assert.equal(api.infer(`点P到x轴的距离等于点P到点(0,1/2)的距离${extra}，求轨迹。`),null,extra);
  assert.equal(api.infer('点P到x轴的距离等于3，到定点F(0,1/2)的距离也等于3，求轨迹。'),null);
  assert.equal(api.infer('点P到x轴的距离等于点Q到点(0,1/2)的距离，求P的轨迹。'),null);
  assert.equal(api.infer('点P到直线y=2·x+1的距离等于到点(0,1)的距离，求轨迹。'),null);
});
test('nonlinear or offset distance relations are not mistaken for equality of two distances',()=>{
  for(const phrase of ['点P到x轴的距离的平方等于点P到点(0,1/2)的距离','点P到x轴的距离等于点P到点(0,1/2)的距离加1','点P到x轴的距离等于点P到点(0,1/2)的距离+1'])assert.equal(api.infer(phrase+'，求轨迹。'),null,phrase);
});
test('compound subquestions remain pending instead of claiming a complete equation/proof answer',()=>{
  const s=scene(),pp=[{index:1,body:'求W的方程，并求点P距原点的最小距离'},{index:2,body:'证明周长大于3\\sqrt3，并求面积最小值'}],c=api.install(s,original,pp);assert(c);assert.equal(api.solvePart(pp[0],c),null);assert.equal(api.solvePart(pp[1],c),null);assert.equal(c.rectangle,null);
});
test('sample does not overwrite named question coordinates or violate extra geometric conditions',()=>{
  const s=scene();s.model.points={A:[-2,4.25]};const before=JSON.stringify(s.model.points),c=api.install(s,original,parts);assert.equal(c.rectangle,null);assert.equal(JSON.stringify(s.model.points),before);
  for(const raw of [original.replace('有三个顶点在W上','有三个顶点在W上，且AB平行于x轴'),original.replace('有三个顶点在W上','有三个顶点在W上，且A(-2,4.25)')]){const q=scene(raw),r=api.install(q,raw,parts);assert.equal(r.rectangle,null);assert(!q.model.polygons?.length);}
});
test('distance-definition diagram uses real curve-bound point and dependent foot, scoped to part one',()=>{
  const s=scene(),c=api.install(s,original,parts),shape=sandbox.window.DongConstruct.conicShape({...s.model,conicType:s.model.type});
  const engine=sandbox.window.DongConstruct.createEngine({model:()=>s.model,coeffs:()=>shape.q,conicPoint:shape.pointAt,conicProject:shape.project,features:()=>[]});
  const obj=s.model.objects.find(item=>item.id==='parabola-definition-moving');assert.equal(obj.label,'P');assert.equal(obj.part,1);assert.equal(obj.op,'point_on');
  for(let t=-4;t<=4;t+=.1){obj.t=t;const P=engine.resolve(obj.id),F=engine.resolve('parabola-definition-focus'),H=engine.resolve('parabola-definition-foot');assert(P&&F&&H);near(H.y,0);near(H.x,P.x);near(Math.hypot(P.x-F.x,P.y-F.y),Math.hypot(P.x-H.x,P.y-H.y));}
  for(const name of c.rectangle.names)assert.equal(s.model.pointParts[name].join(','),'2');assert.equal(s.model.curveLabel,'W');
});
