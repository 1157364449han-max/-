const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),test=require('node:test');
const box={window:{}};for(const f of ['math-input','equation-builder','number-display','question-parts','circle-fold'])vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../dist',f+'.js'),'utf8'),box);
const api=box.window.DongCircleFold,raw=require('./fixtures/user-circle-fold.json').question;
const close=(a,b)=>assert(Math.abs(a-b)<1e-9*Math.max(1,Math.abs(a),Math.abs(b)),`${a} != ${b}`);
test('photo original yields all three symbolic parts and exact strict bounds',()=>{
  const s=api.solve(raw);assert(s,box.window.DongMathInput.toPlain(raw));assert.equal(s.completion.answered,3);assert.equal(s.parts.map(p=>p.index).join(','),'1,2,3');
  assert(s.parts[0].answer.includes('(x-1)^2+y^2=4'));assert(s.parts[1].answer.includes('(0,0)'));assert(s.parts[1].answer.includes('-3'));assert(s.parts[2].answer.includes('3<|MN|<4'));close(s.foldGeometry.alpha,2*Math.PI/3);
});
test('3D rigid rotation, radius, dihedral and length identity agree throughout motion',()=>{
  const s=api.infer(raw);assert(s);
  for(let degrees=.5;degrees<180;degrees+=.5){
    const g=api.geometry(s,degrees*Math.PI/180),{M,N}=g.points;
    close((M[0]-s.h)**2+M[1]**2+M[2]**2,s.r2);
    close((N[0]-s.h)**2+N[1]**2+N[2]**2,s.r2);
    close(M.reduce((sum,v,i)=>sum+v*N[i],0),M[0]*N[0]+M[1]*g.flatN[1]*Math.cos(Math.PI-s.alpha));
    const dihedralCos=(M[1]*N[1]+M[2]*N[2])/(Math.hypot(M[1],M[2])*Math.hypot(N[1],N[2]));close(dihedralCos,Math.cos(s.alpha));
    close(g.length**2,9+7*Math.cos(g.theta)**2);
    if(degrees!==90){assert(g.admissible);assert(g.length>3&&g.length<4);}else assert(!g.admissible);
  }
  for(const degrees of [0,90,180])assert(!api.geometry(s,degrees*Math.PI/180).admissible);
});
test('point names and numeric conditions are not a question-answer lookup',()=>{
  // Metamorphic protocol/property fixtures, not new educational examples.
  const renamed=raw.replace(/A/g,'D').replace(/B/g,'E').replace(/M/g,'U').replace(/N/g,'V').replace(/P/g,'T');
  assert(api.solve(renamed).parts[2].answer.includes('3<|UV|<4'));
  const scaled=raw.replace('A(-1,0)','A(-2,0)').replace('B(1,2)','B(2,4)').replace('x-y-1','x-y-2');
  assert(api.solve(scaled).parts[2].answer.includes('6<|MN|<8'));
  const changedAngle=raw.replace('2\\pi','\\pi');assert(api.solve(changedAngle).parts[2].answer.includes('\\sqrt{3}<|MN|<4'));
});
test('missing conditions, unsupported premises and unsafe data never receive a fabricated fold',()=>{
  for(const changed of [raw.replace('2\\pi',''),raw.replace('M-OA-N','M-OA-X'),raw.replace('x-y-1','x-y-2'),raw.replace('且斜率不为0',''),raw.replace('沿 x 轴','沿 y 轴'),raw.replace('PM','PQ'),raw.replace('求折起后','并且 MN=2，求折起后'),raw.replace('B(1,2)','B(1,3)'),raw.replace('x-y-1','x*y-y-1')])assert.equal(api.solve(changed),null,changed);
  const s=api.infer(raw);assert.equal(api.geometry({...s,h:Infinity},.5),null);assert.equal(api.geometry(s,NaN),null);
});
