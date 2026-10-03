const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const motion=require('../dist/motion-protection.js');
const box={window:{DongMotion:motion}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../dist/construction-board.js'),'utf8'),box);
const bank=require('../dist/question-bank.js'),data=JSON.parse(fs.readFileSync(path.join(__dirname,'../dist/question-bank.json'),'utf8'));
const scene=()=>bank.sceneFor(data.items.find(q=>q.id==='2025-i-18'));
const engine=model=>{const curve=box.window.DongConstruct.conicShape({...model,conicType:model.type});return box.window.DongConstruct.createEngine({model:()=>model,features:()=>Object.entries(model.points||{}).map(([name,[x,y]])=>({name,x,y})),coeffs:()=>curve.q,conicPoint:curve.pointAt,conicProject:curve.project});};
test('premises locked, drivers constrained, user constructions retained',()=>{
  const m=scene();assert(m.problemMotion);assert(!motion.dragAllowed(m,{type:'point',name:'A'}));assert(!motion.dragAllowed(m,{type:'major'}));assert(!motion.dragAllowed(m,{type:'circleCenter',obj:m.objects[0]}));
  assert(motion.dragAllowed(m,{type:'native',id:'inverse-moving-P'}));assert(!motion.dragAllowed(m,{type:'native',id:'inverse-derived-R'}));assert(motion.dragAllowed(m,{type:'dynamic'}));assert(motion.dragAllowed(m,{type:'userPoint',obj:{source:'user'}}));
  assert.equal(engine(m).freePoint('feature:A'),null);assert(!motion.editable(m,'$conic'));
});
test('720 legal circle positions preserve inversion, slope relation and ellipse membership',()=>{
  const m=scene(),e=engine(m),p=m.objects.find(o=>o.label==='P'),mm=m.objects.find(o=>o.label==='M');
  for(let i=0;i<720;i++){
    p.t=i*Math.PI/360+.002;mm.t=i*Math.PI/113;
    const P=e.resolve(p.id),M=e.resolve(mm.id),R=e.resolve('inverse-derived-R'),A=e.resolve('feature:A');
    assert(Math.abs(P.x*P.x+(P.y+4)**2-18)<1e-8);assert(Math.abs(M.x*M.x/9+M.y*M.y-1)<1e-9);
    assert(Math.abs(Math.hypot(R.x-A.x,R.y-A.y)*Math.hypot(P.x-A.x,P.y-A.y)-3)<1e-8);
    assert(Math.abs(R.y/R.x-3*P.y/P.x)<1e-6);assert(Math.hypot(P.x-M.x,P.y-M.y)<=3*Math.SQRT2+3*Math.sqrt(3)+1e-8);
  }
});
test('projection always lands on trajectory, grid input cannot move it off curve',()=>{
  const m=scene(),e=engine(m);for(const xy of [[10,12],[-8,1],[.5,-1],[20,-20]]){
    const p=e.pointOn('locus-circle',e.project('locus-circle',{x:xy[0],y:xy[1]}));assert(Math.abs(p.x*p.x+(p.y+4)**2-18)<1e-8);
  }
  assert(!motion.permittedPoint({excludeAxis:'y'},{x:0,y:2}));assert(!motion.permittedPoint({excludeAxis:'x'},{x:1,y:1e-9}));assert(motion.permittedPoint({excludeAxis:'y'},{x:1,y:0}));
});
test('explicit free mode detaches P or R without destroying original dependency graph',()=>{
  const m=scene(),e=engine(m),initial=e.resolve('inverse-moving-P');m.unrestrictedMotion=true;
  assert(motion.dragAllowed(m,{type:'native',id:'inverse-derived-R'}));motion.setOverride(m,'inverse-moving-P',{type:'point',x:4,y:1});assert.equal(e.resolve('inverse-moving-P').x,4);
  assert(Math.abs(e.resolve('inverse-derived-R').x-.6)<1e-9);motion.setOverride(m,'inverse-derived-R',{type:'point',x:3,y:4});assert.equal(e.resolve('inverse-derived-R').x,3);
  m.unrestrictedMotion=false;assert(Math.abs(e.resolve('inverse-moving-P').x-initial.x)<1e-9);assert.equal(m.objects.find(o=>o.label==='R').op,'inverse');
});
test('closing free mode restores fixed geometry but retains user curves and latest driver parameter',()=>{
  const m=scene(),values={a:3,b:1,h:0,k:0,theta:25};m.parameterExpressions={a:'√9'};motion.capture(m,values);m.unrestrictedMotion=true;values.a=8;values.theta=77;m.parameterExpressions.a='8';
  const circle=m.objects.find(o=>o.id==='locus-circle');circle.r=9;circle.visible=false;
  const p=m.objects.find(o=>o.label==='P');p.t=.6;m.objects.push({id:'manual',kind:'circle',source:'user',h:5,k:6,r:7});
  m.unrestrictedMotion=false;motion.restorePremises(m,values);assert.equal(values.a,3);assert.equal(m.parameterExpressions.a,'√9','原题精确表达式须一起恢复');assert.equal(values.theta,77);assert(Math.abs(circle.r-Math.sqrt(18))<1e-9);assert.equal(circle.visible,false);assert.equal(p.t,.6);assert.equal(m.objects.at(-1).r,7);
});
test('invalid overrides are ignored and singular inversion does not invent R',()=>{
  const m=scene(),e=engine(m);m.unrestrictedMotion=true;motion.setOverride(m,'inverse-moving-P',{type:'point',x:Infinity,y:0});assert(Number.isFinite(e.resolve('inverse-moving-P').x));
  motion.setOverride(m,'inverse-moving-P',{type:'point',x:0,y:-1});assert.equal(e.resolve('inverse-derived-R'),null);assert.equal(motion.setOverride(m,'__proto__',{type:'point',x:1,y:2}),false);
});
test('malformed persisted geometry baseline cannot replace a valid scene with impossible dimensions',()=>{
  const m=scene(),values={a:3,b:1,h:0,k:0};m.motionBaseline={values:{a:-5,b:20},shapes:[]};motion.capture(m,values);motion.restorePremises(m,values);assert.equal(values.a,3);assert.equal(values.b,1);
});
test('fixed named points restore too, without deleting later manual point additions',()=>{
  const m=scene(),values={a:3,b:1,h:0,k:0};motion.capture(m,values);m.points.A=[4,2];m.points.N=[7,8];motion.restorePremises(m,values);assert.deepEqual(m.points.A,[0,-1]);assert.deepEqual(m.points.N,[7,8]);
  m.motionBaseline.points={A:['bad',2]};motion.capture(m,values);motion.restorePremises(m,values);assert.deepEqual(m.points.A,[0,-1]);
});
