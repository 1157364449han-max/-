const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),test=require('node:test');
const sandbox={window:{}};for(const file of ['math-input.js','equation-builder.js','number-display.js','construction-board.js','parabola-focal-data.js'])vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../dist',file),'utf8'),sandbox);
const api=sandbox.window.DongParabolaFocalData,near=(a,b,t=1e-8)=>assert(Math.abs(a-b)<=t*Math.max(1,Math.abs(a),Math.abs(b)),`${a} != ${b}`);
const original='已知抛物线 C：y^2=2px（p>0）的焦点为 F，准线与 x 轴交于点 K，过 F 的直线 l 与抛物线交于 A、B 两点。\n（1）若 |AB|=8，且线段 AB 中点的横坐标为 3，求抛物线 C 的方程；\n（2）在（1）的条件下，若直线 l 的倾斜角为 45°，求 |AB|；\n（3）在（1）（2）的条件下，设 M 为准线上一点，且 MA⊥MB，求点 M 的坐标。';
const parts=[{index:1,body:'若 |AB|=8，且线段 AB 中点的横坐标为 3，求抛物线 C 的方程；'},{index:2,body:'在（1）的条件下，若直线 l 的倾斜角为 45°，求 |AB|；'},{index:3,body:'在（1）（2）的条件下，设 M 为准线上一点，且 MA⊥MB，求点 M 的坐标。'}];
function scene(raw=original){const model=api.infer(raw);assert(model,raw);return {model,values:{p:model.p,h:0,k:0,direction:1}};}
function engine(s){const shape=sandbox.window.DongConstruct.conicShape({...s.model,...s.values}),angle=()=>s.values.theta*Math.PI/180,origin=()=>({x:s.model.points[s.model.parabolaFocalData.names.focus][0],y:0}),features=()=>[...Object.entries(s.model.points||{}).map(([name,[x,y]])=>({name,x,y})),...sandbox.window.DongConstruct.intersect({type:'line',o:origin(),d:{x:Math.cos(angle()),y:Math.sin(angle())}},shape).map((point,i)=>({...point,name:s.model.dynamicIntersectionLabels[i]}))];return sandbox.window.DongConstruct.createEngine({model:()=>s.model,coeffs:()=>shape.q,features,origin,angle:()=>s.values.theta});}
test('actual three-part input infers standard parameter and answers all parts',()=>{
  const s=scene(),context=api.install(s,original,parts);assert(context);assert.equal(s.model.equation,'y^2=4x');near(s.model.p,1);near(context.spec.standardP,2);near(s.values.theta,45);
  assert(api.solvePart(parts[0],context).answer.includes('y^2=4x'));assert(api.solvePart(parts[1],context).answer.includes('|AB|=8'));assert(api.solvePart(parts[2],context).answer.includes('M(-1,2)'));assert.equal(api.checks(context).filter(item=>item.status==='verified').length,3);
});
test('real construct uses chord intersections, midpoint and dependent directrix foot',()=>{
  const s=scene(),c=api.install(s,original,parts),e=engine(s),A=e.resolve('feature:A'),B=e.resolve('feature:B'),N=e.resolve('focal-data-midpoint'),M=e.resolve('focal-data-M');assert(A&&B&&N&&M);
  near(A.x,3-2*Math.sqrt(2));near(A.y,2-2*Math.sqrt(2));near(B.x,3+2*Math.sqrt(2));near(B.y,2+2*Math.sqrt(2));near(N.x,3);near(N.y,2);near(M.x,-1);near(M.y,2);near((A.x-M.x)*(B.x-M.x)+(A.y-M.y)*(B.y-M.y),0);assert(c);assert.equal(s.model.polygons[0].labels.join(''),'MAB');assert(!s.model.lines.some(line=>line.op==='tangent'));
});
test('the perpendicular point remains a genuine dependent construction when the focal line moves',()=>{
  const s=scene();api.install(s,original,parts);for(let theta=10;theta<180;theta+=5){s.values.theta=theta;const e=engine(s),A=e.resolve('feature:A'),B=e.resolve('feature:B'),N=e.resolve('focal-data-midpoint'),M=e.resolve('focal-data-M');assert(A&&B&&N&&M);near(M.x,-1);near(M.y,N.y);near((A.x-M.x)*(B.x-M.x)+(A.y-M.y)*(B.y-M.y),0,2e-7);}
});
test('parameter exploration updates semantic focus and directrix without rewriting original proof data',()=>{
  const s=scene(),c=api.install(s,original,parts),line=s.model.lines.find(line=>line.id==='focal-data-directrix');line.visible=false;line.part=99;delete line.parts;for(const p of [.25,.5,1,2,4])for(const theta of [20,45,90,135,165]){s.values.p=p;s.values.theta=theta;const refreshed=api.update(s);assert(refreshed.valid);near(s.model.points.F[0],p);near(s.model.points.K[0],-p);near(line.x,-p);assert.equal(line.visible,false);assert.equal(line.part,99);const e=engine(s),A=e.resolve('feature:A'),B=e.resolve('feature:B'),M=e.resolve('focal-data-M');assert(A&&B&&M);near(M.x,-p);near((A.x-M.x)*(B.x-M.x)+(A.y-M.y)*(B.y-M.y),0,2e-7);near(c.spec.p,1);near(c.spec.standardP,2);near(c.spec.chordLength,8);assert(api.solvePart(parts[2],c).answer.includes('M(-1,2)'));}
});
test('manual edits are preserved and invalidate dependent graph rather than being silently undone',()=>{
  for(const change of [s=>s.model.points.F=[3,1],s=>s.model.points.K=[-3,0],s=>s.model.lines.find(line=>line.id==='focal-data-directrix').x=-3,s=>s.model.lineThrough='center',s=>s.values.direction=-1,s=>s.values.h=2,s=>s.values.theta=0]){const s=scene(),c=api.install(s,original,parts);change(s);const before=JSON.stringify({points:s.model.points,line:s.model.lines,origin:s.model.lineThrough});s.values.p=2;const result=api.update(s);assert.equal(result.valid,false);assert(result.reason);assert.equal(c.spec.graphValid,false);assert.equal(JSON.stringify({points:s.model.points,line:s.model.lines,origin:s.model.lineThrough}),before);near(c.spec.p,1);}
});
test('a renamed scaled input uses the same generic formulas',()=>{
  const rename=text=>text.replace(/F/g,'G').replace(/K/g,'J').replace(/A/g,'D').replace(/B/g,'E').replace(/M/g,'T').replace('|DE|=8','|DE|=16').replace('横坐标为 3','横坐标为 6'),raw=rename(original),pp=parts.map(part=>({...part,body:rename(part.body)})),s=scene(raw),c=api.install(s,raw,pp);assert(c);near(s.model.p,2);assert(api.solvePart(pp[1],c).answer.includes('|DE|=16'));assert(api.solvePart(pp[2],c).answer.includes('T(-2,4)'));
});
test('unsupported orientation, wrong incidence and impossible data do not invent an equation',()=>{
  for(const raw of [original.replace('y^2=2px','x^2=2py'),original.replace('y^2=2px','y^2=-2px'),original.replace('y^2=2px','y^2=2px+1'),original.replace('过 F 的直线','过 K 的直线'),original.replace('横坐标为 3','横坐标为 5'),original.replace('横坐标为 3','横坐标为 1'),original.replace('|AB|=8','|AB|=0'),original.replace('且线段 AB 中点','且线段 AC 中点'),original.replace('横坐标为 3','纵坐标为 3'),original.replace('横坐标为 3','横坐标为 3，且纵坐标为 1')])assert.equal(api.infer(raw),null,raw);
});
test('extra numerical focus data or contrary p assignments are not silently discarded',()=>{
  for(const raw of [original.replace('（p>0）','（p>0,p=3）'),original.replace('焦点为 F','焦点为 F(2,0)'),original.replace('横坐标为 3','横坐标为 3的两倍')])assert.equal(api.infer(raw),null,raw);
});
test('reviewer regressions bind the chord curve, reject later conflicting p, and respect negated target declarations',()=>{
  assert.equal(api.infer(original.replace('横坐标为 3','横坐标为 3，且p=3')),null);assert.equal(api.infer(original.replace('与抛物线交于','与抛物线D交于')),null);
  const raw=original.replace('设 M 为准线上一点','不设 M 为准线上一点'),pp=parts.map(part=>({...part,body:part.body.replace('设 M 为准线上一点','不设 M 为准线上一点')})),s=scene(raw),c=api.install(s,raw,pp);assert(c);assert.equal(api.solvePart(pp[2],c),null);assert(!s.model.objects.some(obj=>obj.id==='focal-data-M'));assert(api.infer(original.replace('横坐标为 3','横坐标为 3，且p=2')));
});
test('named equation and inclination requests are bound to their declared curve and chord',()=>{
  const s=scene(),c=api.install(s,original,parts);assert.equal(api.solvePart({...parts[0],body:parts[0].body.replace('抛物线 C','抛物线 D')},c),null);
  const raw=original.replace('直线 l 的倾斜角','直线 m 的倾斜角'),pp=parts.map(part=>({...part,body:part.body.replace('直线 l 的倾斜角','直线 m 的倾斜角')})),t=scene(raw),other=api.install(t,raw,pp);assert(other);assert(other.spec.angleUnsupported);assert.equal(api.solvePart(pp[2],other),null);
});
test('unmodelled first-part clauses do not become silently ignored full-solution premises',()=>{
  for(const extra of ['且A在第一象限','且A(2,1)','且AF=3','且直线l通过定点T','且p<0'])assert.equal(api.infer(original.replace('横坐标为 3','横坐标为 3，'+extra)),null,extra);
});
test('symbolic products and a negated focus incidence are not truncated to numeric constants',()=>{
  for(const raw of [original.replace('（p>0）','（p>0,p=2x）'),original.replace('|AB|=8','|AB|=8μ'),original.replace('过 F 的直线','不过 F 的直线')])assert.equal(api.infer(raw),null,raw);
});
test('changing angle cannot silently discard the original fixed chord data',()=>{
  const raw=original.replace('45°','60°'),pp=parts.map(part=>({...part,body:part.body.replace('45°','60°')})),s=scene(raw),c=api.install(s,raw,pp);assert(c);assert(c.spec.angleConflict);assert(api.solvePart(pp[0],c));assert.equal(api.solvePart(pp[1],c),null);assert.equal(api.solvePart(pp[2],c),null);near(s.values.theta,45);assert(!s.model.objects.some(obj=>obj.id==='focal-data-M'));assert(api.checks(c).some(check=>check.status==='contradicted'));
});
test('the supplementary angle preserves original data and chooses negative midpoint ordinate',()=>{
  const raw=original.replace('45°','135°'),pp=parts.map(part=>({...part,body:part.body.replace('45°','135°')})),s=scene(raw),c=api.install(s,raw,pp);assert(c);assert(!c.spec.angleConflict);assert(api.solvePart(pp[2],c).answer.includes('M(-1,-2)'));const M=engine(s).resolve('focal-data-M');near(M.y,-2);
});
test('part-three conditions cannot accidentally inherit a hypothetical angle in another part',()=>{
  const raw=original.replace('在（1）（2）的条件下','在（1）的条件下'),pp=parts.map(part=>({...part,body:part.index===3?part.body.replace('在（1）（2）的条件下','在（1）的条件下'):part.body})),s=scene(raw),c=api.install(s,raw,pp);assert(c);assert.equal(api.solvePart(pp[2],c),null);assert(!s.model.objects.some(obj=>obj.id==='focal-data-M'));assert(!api.checks(c).some(check=>check.id==='parabola-focal-data-orthogonal'));
});
test('vertical focal chord has an exact zero ordinate, not a tiny approximate decimal',()=>{
  const replace=text=>text.replace('横坐标为 3','横坐标为 2').replace('45°','90°'),raw=replace(original),pp=parts.map(part=>({...part,body:replace(part.body)})),s=scene(raw),c=api.install(s,raw,pp);assert(c);near(s.model.p,2);assert.equal(api.solvePart(pp[2],c).answer,'$M(-2,0)$。');assert(!api.solvePart(pp[2],c).answer.includes('approx'));
});
test('LaTeX fractions, degree syntax and browser preprocessing remain supported',()=>{
  for(const raw of [original.replace('y^2','y^{2}').replace('45°','45^{\\circ}'),original.replace('45°','\\frac{\\pi}{4}')]){const s=scene(raw),c=api.install(s,raw,parts);assert(c);assert.equal(c.spec.thetaResolved,45);assert(api.solvePart(parts[2],c));}
  const plain=sandbox.window.DongMathInput.toPlain(original),s=scene(plain),pp=parts.map(part=>({...part,body:sandbox.window.DongMathInput.toPlain(part.body)})),c=api.install(s,plain,pp);assert(c);assert(pp.every(part=>api.solvePart(part,c)?.status==='answered'));
});
test('compound goals stay pending instead of returning only their easy subgoal',()=>{
  const s=scene(),c=api.install(s,original,parts);for(const part of [{index:1,body:parts[0].body.replace('的方程','的方程并求面积最大值')},{index:2,body:parts[1].body.replace('求 |AB|','求 |AB|，并求中点坐标')},{index:3,body:parts[2].body.replace('的坐标','的坐标并求三角形面积')}])assert.equal(api.solvePart(part,c),null,part.body);
});
test('extra or negated premise constraints cannot be ignored by easy-goal matching',()=>{
  const s=scene(),c=api.install(s,original,parts);for(const part of [{index:2,body:parts[1].body.replace('45°','45°，且直线过点(1,4)')},{index:3,body:parts[2].body.replace('MA⊥MB','MA⊥MB，且M在第四象限')},{index:3,body:parts[2].body.replace('MA⊥MB','MA⊥MB不成立')},{index:3,body:parts[2].body.replace('MA⊥MB','MA⊥MB或MC⊥MB')}])assert.equal(api.solvePart(part,c),null,part.body);
});
test('existing user points and reserved objects are preserved instead of overwritten',()=>{
  const s=scene();s.model.points.M=[1,2];assert.equal(api.install(s,original,parts),null);assert.deepEqual(s.model.points.M,[1,2]);const t=scene();t.model.objects=[{id:'focal-data-M',kind:'point',x:2,y:3,label:'Z',source:'user'}];assert.equal(api.install(t,original,parts),null);assert.equal(t.model.objects.length,1);
});
test('reserved IDs in the line collection are checked before installing dependent geometry',()=>{
  const s=scene();s.model.lines=[{id:'focal-data-directrix',kind:'vertical',x:4,label:'用户直线',source:'user'}];assert.equal(api.install(s,original,parts),null);assert.equal(s.model.lines[0].x,4);
});
test('unrelated derived objects do not receive an exemption from reserved-name collision checks',()=>{
  const s=scene();s.model.objects=[{id:'different-derived-M',kind:'point',label:'M',x:9,y:9,source:'derived'}];assert.equal(api.install(s,original,parts),null);assert.equal(s.model.objects.length,1);near(s.model.objects[0].x,9);
});
test('an existing exact all-scope question segment is reused rather than labelled twice',()=>{
  for(const item of [{id:'question-ab',kind:'through_points',a:'A',b:'B',infinite:false,label:'线段 AB',source:'question',visible:false},{id:'question-ab',kind:'construction',op:'segment',refs:['feature:B','feature:A'],label:'AB',source:'question',visible:true,parts:[1,2,3]}]){const s=scene();s.model.lines=[item];assert(api.install(s,original,parts));assert(!s.model.objects.some(object=>object.id==='focal-data-chord'));assert.equal(s.model.lines[0],item);}
  const s=scene();s.model.objects=[{id:'user-ab',kind:'construction',op:'segment',refs:['feature:A','feature:B'],label:'用户线段',source:'user',visible:true}];assert(api.install(s,original,parts));assert(s.model.objects.some(object=>object.id==='focal-data-chord'));
});
test('new constructions are scoped while given focus and directrix-axis intersection are shared',()=>{
  const s=scene(),c=api.install(s,original,parts);assert(c);assert.equal(s.model.pointParts.F.join(','),'1,2,3');assert.equal(s.model.pointParts.K.join(','),'1,2,3');assert.equal(s.model.objects.find(obj=>obj.id==='focal-data-M').part,3);assert.equal(s.model.polygons[0].part,3);assert.equal(s.model.dynamicIntersectionLabels.join(''),'AB');
});
