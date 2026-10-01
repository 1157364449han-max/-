const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),test=require('node:test');
const sandbox={window:{}};
for(const file of ['math-input.js','equation-builder.js','number-display.js','construction-board.js','hyperbola-iteration.js'])vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../dist',file),'utf8'),sandbox);
const api=sandbox.window.DongHyperbolaIteration;
const bank=JSON.parse(fs.readFileSync(path.join(__dirname,'../dist/question-bank.json'),'utf8'));
// The sourced question is input only; the solver never reads its bank explanation.
const original=(bank.items||bank.questions).find(item=>item.id==='2024-ii-19').question;
const parts=[{index:1,body:'若 k=1/2，求 x_2,y_2'},{index:2,body:'证明{x_n-y_n}是公比为(1+k)/(1-k)的等比数列'},{index:3,body:'设 S_n 为△P_nP_{n+1}P_{n+2}的面积，证明对任意正整数n，S_n=S_{n+1}'}];
const near=(a,b,t=1e-8)=>assert(Math.abs(a-b)<=t*Math.max(1,Math.abs(a),Math.abs(b)),`${a} != ${b}`);
function scene(raw=original){const model=api.infer(raw);assert(model,raw);return {model,values:{a:model.a,b:model.b,h:0,k:0}};}
function engine(s){const shape=sandbox.window.DongConstruct.conicShape(s.model);return sandbox.window.DongConstruct.createEngine({model:()=>s.model,coeffs:()=>shape.q,conicPoint:shape.pointAt,features:()=>Object.entries(s.model.points||{}).map(([name,p])=>({name,x:p[0],y:p[1]}))});}
test('sourced rectangular hyperbola derives m from its initial point rather than a bank answer',()=>{
  const model=api.infer(original);assert.equal(model.type,'hyperbola');near(model.a,3);near(model.b,3);assert.equal(model.equation,'x^2-y^2=9');assert.equal(model.hyperbolaIteration.exact.m,'9');assert.equal(model.hyperbolaIteration.kDefault,.5);
});
test('P2 is the reflection of the negative-x intersection, not the original root',()=>{
  const s=scene(),context=api.install(s,original,parts);assert(context);assert.equal(context.parts.coordinate,1);assert.equal(context.parts.progression,2);assert.equal(context.parts.area,3);
  const answer=api.solvePart(parts[0],context);assert.equal(answer.status,'answered');assert(answer.answer.includes('x_2=3'));assert(answer.answer.includes('y_2=0'));
  const e=engine(s),Q=e.resolve('iteration-Q-1'),P=e.resolve('iteration-P-2');assert(Q&&P);near(Q.x,-3);near(Q.y,0);near(P.x,3);near(P.y,0);assert.equal(s.model.objects.find(o=>o.id==='iteration-Q-1').branch,0);
});
test('progression and area proofs are universal algebra, not numerical observations',()=>{
  const s=scene(),context=api.install(s,original,parts),sequence=api.solvePart(parts[1],context),area=api.solvePart(parts[2],context);
  assert(sequence.steps.some(step=>step.includes('所有正整数')));assert(sequence.steps.some(step=>step.includes('(1+k)^2')));assert(area.steps.some(step=>step.includes('det T')));assert(area.steps.some(step=>step.includes('r^{n-1}r^{1-n}=1')));assert.equal(api.checks(context).length,3);
});
test('renamed and rescaled initial points use the same algebraic engine',()=>{
  const raw=original.replace(/P/g,'R').replace(/Q/g,'T').replace('(5,4)','(10,8)').replace('\\dfrac12','\\dfrac13'),pp=parts.map(part=>({...part,body:part.body.replace(/P/g,'R').replace(/Q/g,'T').replace('k=1/2','k=1/3')})),s=scene(raw),c=api.install(s,raw,pp);
  assert(c);near(c.m,36);near(c.spec.kDefault,1/3);assert.equal(c.spec.pointPrefix,'R');assert.equal(c.spec.otherPrefix,'T');const r=api.sample(c.spec);assert(r.valid);near(r.p[1][0],6.5);near(r.p[1][1],2.5);near(r.theoryArea,6.75);
});
test('safe numeric fractions and roots preserve initial coordinate sources',()=>{
  const raw=original.replace('(5,4)','(3sqrt(2),sqrt(2))'),model=api.infer(raw);assert(model);near(model.hyperbolaIteration.m,16);assert.equal(model.hyperbolaIteration.exact.x1,'3sqrt(2)');assert(model.derivation[0].includes('\\sqrt{2}'));
  assert.equal(api.infer(original.replace('(5,4)','(alert(1),4)')),null);
});
test('scalar parentheses are not mistaken for subquestion ordinals',()=>{
  const raw=original.replace('(5,4)','(sqrt(2),sqrt(1))').replace('\\dfrac12','\\dfrac13'),model=api.infer(raw);assert(model);near(model.hyperbolaIteration.m,1);near(model.hyperbolaIteration.kDefault,1/3);
});
test('alternate indices written as Unicode or no underscore are recognized',()=>{
  const raw=original.replace(/P_1/g,'P₁').replace(/x_2/g,'x₂').replace(/y_2/g,'y₂');const s=scene(raw),c=api.install(s,raw,parts.map(part=>({...part,body:part.body.replace(/x_2/g,'x2').replace(/y_2/g,'y2')})));assert(c);assert.equal(api.solvePart({index:1,body:'当k=1/2，求P₂的坐标'},c).status,'answered');
});
test('actual browser toPlain preprocessing still resolves all three sourced subquestions',()=>{
  const plain=sandbox.window.DongMathInput.toPlain(original),chunks=plain.split(/（[123]）/),pp=chunks.slice(1).map((body,i)=>({index:i+1,body})),s=scene(plain),context=api.install(s,plain,pp);assert(context);assert.equal(Object.values(context.parts).filter(x=>x!=null).length,3);for(const part of pp)assert.equal(api.solvePart(part,context)?.status,'answered',part.body);
});
test('unrelated orientation, metrics, branch and reflection definitions are rejected',()=>{
  for(const raw of [original.replace('x^2-y^2','y^2-x^2'),original.replace('x^2-y^2','x^2/4-y^2'),original.replace('关于 $y$ 轴','关于 $x$ 轴'),original.replace('(5,4)','(-5,4)'),original.replace('(5,4)','(3,4)'),original.replace('0<k<1','k>1'),original.replace('0<k<1','-1<k<0'),original.replace('x^2-y^2=m','x^2-y^2=8'),original.replace('m\\ (m>0)','m+1\\ (m>0)'),original.replace('在 $C$ 上','在 $C$ 上且在第一象限')])assert.equal(api.infer(raw),null,raw);
});
test('contradictory constants, negated branches and broken cross-reference families are rejected',()=>{
  for(const raw of [original.replace('(m>0)','(m<0)'),original.replace('(m>0)','(m=16>0)'),original.replace('的左支交于','的非左支交于'),original.replace('交于 $Q_{n-1}$','交于 $R_{n-1}$'),original.replace('令 $P_n$','不令 $P_n$'),original.replace('x^2-y^2=m','x^2-y^2=9x'),original.replace('x^2-y^2=m','x^2-y^2=m(x+1)'),original.replace('记 $P_n=(x_n,y_n)$','另有 y_n>0，记 $P_n=(x_n,y_n)$')])assert.equal(api.infer(raw),null,raw);
});
test('m is not inferred when the supplied initial point is not explicitly on this curve',()=>{
  assert.equal(api.infer(original.replace('在 $C$ 上','在 $D$ 上')),null);assert.equal(api.infer(original.replace('在 $C$ 上','')),null);assert(api.infer(original.replace('双曲线 $C:','双曲线 $Z:').replace('在 $C$ 上','在 $Z$ 上')));
});
test('compound or mathematically different subquestions are not falsely marked answered',()=>{
  const s=scene(),c=api.install(s,original,parts);
  for(const part of [{index:1,body:'若k=1/2，求x_2,y_2并求面积'},{index:2,body:'证明{x_n-y_n}是公比为2的等比数列'},{index:2,body:'证明{x_n+y_n}是公比为(1+k)/(1-k)的等比数列'},{index:3,body:'设S_n为△P_nP_{n+1}P_{n+2}的面积，证明S_n=S_{n+1}并求周长最小值'},{index:3,body:'设S_n为△P_nP_{n+2}P_{n+4}的面积，证明S_n=S_{n+1}'}])assert.equal(api.solvePart(part,c),null,part.body);
});
test('wrong ratio suffix, negated claims and contradictory slope assignments stay unsupported',()=>{
  const s=scene(),c=api.install(s,original,parts);for(const part of [{index:2,body:'证明{x_n-y_n}是公比为(1+k)/(1-k)+1的等比数列'},{index:2,body:'证明{x_n-y_n}不是等比数列'},{index:1,body:'若k=1/2，k=1/4，求x_2,y_2'}])assert.equal(api.solvePart(part,c),null,part.body);
});
test('modified quantities and chained equality are not certified by matching a prefix',()=>{
  const s=scene(),c=api.install(s,original,parts);for(const part of [{index:2,body:'证明{x_n-y_n+1}是等比数列'},{index:3,body:'设S_n为△P_nP_{n+1}P_{n+2}的面积，证明S_n=S_{n+1}+1'},{index:3,body:'设S_n为△P_nP_{n+1}P_{n+2}的面积，证明S_n=S_{n+1}=0'},{index:1,body:'若k=1/2，求x_2,y_2的和'},{index:1,body:'若k=1/2，求x_2+y_2'}])assert.equal(api.solvePart(part,c),null,part.body);
});
test('an area multiple or modified quantity is never reported as the triangle area itself',()=>{
  const s=scene(),c=api.install(s,original,parts);for(const body of ['设 S_n 为△P_nP_{n+1}P_{n+2}的面积的两倍，证明 S_n=S_{n+1}','设 S_n 为△P_nP_{n+1}P_{n+2}的面积加1，证明 S_n=S_{n+1}','设 S_n 为△P_nP_{n+1}P_{n+2}的面积之和，证明 S_n=S_{n+1}'])assert.equal(api.solvePart({index:3,body},c),null,body);
});
test('actual construction dependency chain follows each changed slope and sequence index',()=>{
  const s=scene(),c=api.install(s,original,parts);let count=0;
  for(const k of [.05,.1,.2,.3,.5,.7,.8])for(const n of [1,2,3,4,5,6]){
    c.spec.k=k;c.spec.n=n;const r=api.update(s);if(!r.valid)continue;count++;const e=engine(s);
    for(let i=0;i<3;i++){
      const Q=e.resolve(`iteration-Q-${n+i}`),P=e.resolve(`iteration-P-${n+i+1}`);assert(Q&&P);assert(Q.x<0);assert(P.x>0);near(Q.x,r.q[i][0],3e-7);near(Q.y,r.q[i][1],3e-7);near(P.x,r.p[i+1][0],3e-7);near(P.y,r.p[i+1][1],3e-7);
      const previous=r.p[i];near((Q.y-previous[1])/(Q.x-previous[0]),k,1e-7);near(P.x*P.x-P.y*P.y,c.m,2e-7);
    }
    near(r.areas[0],r.areas[1],2e-7);near(r.theoryArea,4*c.m*k**3/(1-k*k)**2);assert.equal(s.model.polygons.length,2);
  }assert(count>25);
});
test('arbitrary right-branch starting points preserve recurrence ratio and area',()=>{
  let count=0;for(const m of [1,2,9,36])for(const t of [-2,-.5,0,.5,2])for(const k of [.05,.15,.35,.5,.7])for(const n of [1,2,3,4]){
    const start=[Math.sqrt(m)*Math.cosh(t),Math.sqrt(m)*Math.sinh(t)],spec={schema:'dongjiexi-hyperbola-iteration/v1',start,m,k,n,pointPrefix:'P',otherPrefix:'Q'},r=api.sample(spec);if(!r.valid)continue;count++;
    for(let i=0;i<3;i++){const p=r.p[i],next=r.p[i+1],Q=r.q[i];near(next[0]-next[1],r.ratio*(p[0]-p[1]),1e-7);near(Q[1]-p[1],k*(Q[0]-p[0]),1e-7);near(next[0]*next[0]-next[1]*next[1],m,1e-7);}near(r.areas[0],r.theoryArea,1e-7);near(r.areas[1],r.theoryArea,1e-7);
  }assert(count>300);
});
test('invalid or excessive runtime parameters remove generated stale geometry',()=>{
  const s=scene(),c=api.install(s,original,parts);s.model.objects.push({id:'user-point',kind:'point',x:1,y:2,label:'N',source:'user'});
  for(const [k,n] of [[0,1],[1,1],[-.5,1],[NaN,1],[.5,0],[.5,1.5],[.99,6],[.9,1000]]){c.spec.k=k;c.spec.n=n;const r=api.update(s);assert.equal(r.valid,false);assert(r.reason);assert.equal(s.model.objects.length,1);assert.equal(s.model.polygons.length,0);}
  c.spec.k=.5;c.spec.n=1;assert(api.update(s).valid);s.values.a=4;const changed=api.update(s);assert.equal(changed.valid,false);assert(changed.reason.includes('主曲线已改变'));assert.equal(s.model.objects.length,1);
});
test('nearly coincident iteration points are not certified by an absolute area tolerance',()=>{
  const spec=scene().model.hyperbolaIteration;for(const k of [1e-6,1e-7,1e-8]){const result=api.sample(spec,k,1);assert.equal(result.valid,false);assert(result.reason.includes('精度'));}assert(api.sample(spec,.0001,1).valid);
});
test('user visibility, scope and unrelated geometry survive parameter updates',()=>{
  const s=scene(),c=api.install(s,original,parts),line=s.model.objects.find(o=>o.id==='iteration-line-1');line.visible=false;line.part=99;delete line.parts;s.model.objects.push({id:'user-circle',kind:'circle',h:0,k:0,r:2,source:'user'});s.model.polygons[0].visible=false;c.spec.k=.3;const r=api.update(s);assert(r.valid);
  const changed=s.model.objects.find(o=>o.id==='iteration-line-1');assert.equal(changed.visible,false);assert.equal(changed.part,99);assert.equal(s.model.polygons[0].visible,false);assert(s.model.objects.some(o=>o.id==='user-circle'));assert.equal(s.model.pointParts['P₁'].join(','),'1,2,3');
});
test('existing conflicting named point is not silently overwritten',()=>{
  const s=scene();s.model.points={'P₁':[9,1]};const before=JSON.stringify(s.model.points);assert.equal(api.install(s,original,parts),null);assert.equal(JSON.stringify(s.model.points),before);
  const t=scene(),c=api.install(t,original,parts);t.model.points['P₁']=[9,1];const result=api.update(t);assert.equal(result.valid,false);assert.equal(t.model.objects.length,0);assert.deepEqual(Array.from(t.model.points['P₁']),[9,1]);assert(c);
});
test('a changed curve cannot receive initial points from an unrelated source',()=>{
  const s=scene();s.values.b=2;assert.equal(api.install(s,original,parts),null);assert(!s.model.points);assert(!s.model.objects);
});
test('generated point labels never silently replace user-created coordinate or binding objects',()=>{
  const s=scene(),c=api.install(s,original,parts);s.model.points['P₂']=[7,8];let result=api.update(s);assert.equal(result.valid,false);assert(result.reason.includes('名称'));assert.deepEqual(s.model.points['P₂'],[7,8]);assert.equal(s.model.objects.length,0);delete s.model.points['P₂'];s.model.pointBindings={'P₁':{type:'point_on',curve:'$conic',t:1}};result=api.update(s);assert.equal(result.valid,false);assert.equal(s.model.objects.length,0);assert(c);
});
test('install rejects reserved user object IDs or generated-coordinate names before mutating points',()=>{
  for(const object of [{id:'iteration-line-1',source:'user',kind:'point',x:0,y:0,label:'Z'},{id:'user-point',source:'user',kind:'point',x:0,y:0,label:'Q₁'}]){const s=scene();s.model.objects=[object];assert.equal(api.install(s,original,parts),null);assert(!s.model.points);assert.equal(s.model.objects.length,1);}
  const s=scene();s.model.points={'P₂':[3,0]};assert.equal(api.install(s,original,parts),null);assert(!s.model.points['P₁']);
});
test('restored scalar strings generate correct integer-index node IDs',()=>{
  const s=scene(),c=api.install(s,original,parts);c.spec.k='0.3';c.spec.n='2';const result=api.update(s);assert(result.valid);assert(s.model.objects.some(o=>o.id==='iteration-anchor-2'));assert(s.model.objects.some(o=>o.id==='iteration-Q-2'));assert(!s.model.objects.some(o=>o.id==='iteration-Q-20'));const Q=engine(s).resolve('iteration-Q-2');assert(Q);near(Q.x,result.q[0][0]);near(Q.y,result.q[0][1]);
});

test('reserved IDs in lines and polygons cannot shadow the actual construction graph',()=>{
  for(const collection of ['lines','objects','polygons']){
    const s=scene(),user={id:'iteration-line-1',source:'user',kind:'slope',m:0,b:4,label:'Z'};s.model[collection]=[user];
    assert.equal(api.install(s,original,parts),null);assert.equal(s.model[collection][0],user);
    const t=scene();assert(api.install(t,original,parts));(t.model[collection]||=[]).push(user);
    assert.equal(api.update(t).valid,false);assert(t.model[collection].includes(user));
    assert(!t.model.objects.some(o=>o.op==='intersection'),'No graph may depend on the colliding user ID');
  }
});
