const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),test=require('node:test');
const root=path.join(__dirname,'..'),sandbox={window:{}};
for(const name of ['math-input','equation-builder','ellipse-distance','circle-dot'])vm.runInNewContext(fs.readFileSync(path.join(root,'dist',name+'.js'),'utf8'),sandbox);
const api=sandbox.window.DongCircleDot,fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/sourced-exam-additions.json'),'utf8')).items.find(q=>q.id==='2022-beijing-10'),near=(a,b)=>assert(Math.abs(a-b)<1e-8);
test('sourced Beijing Q10: inferred premises, closed interval and exact equality coordinates',()=>{
  const solution=api.solve(fixture.question);assert(solution);assert.match(solution.answer,/\[-4,6\]/);assert.match(solution.parts[0].steps.join(' '),/柯西/);assert.equal(solution.scene.objects.filter(n=>n.op==='point_on').length,1);
  assert(solution.verification.checks.every(c=>c.status==='verified'));
  const renamed=fixture.question.replace(/[ABCP]/g,n=>({A:'D',B:'E',C:'F',P:'N'})[n]);
  assert.match(api.solve(renamed).answer,/\[-4,6\]/,'No dispatch on point names');
});
test('general circle identity: translation, radii, endpoint attainment and continuous bounds',()=>{
  for(const [H,r,A,B] of [[[0,0],1,[3,0],[0,4]],[[2,-3],2,[5,1],[-1,7]],[[1,1],.5,[4,1],[1,-2]]]){
    const data=api.compute(H,r,A,B);assert(data);
    for(const kind of ['min','max']){const p=data[kind].point;near(Math.hypot(p[0]-H[0],p[1]-H[1]),r);near((A[0]-p[0])*(B[0]-p[0])+(A[1]-p[1])*(B[1]-p[1]),data[kind].value);}
    for(let i=0;i<2000;i++){const t=i*Math.PI/1000,P=H.map((x,j)=>x+r*(j?Math.sin(t):Math.cos(t))),value=(A[0]-P[0])*(B[0]-P[0])+(A[1]-P[1])*(B[1]-P[1]);assert(value>=data.min.value-1e-8&&value<=data.max.value+1e-8);}
  }
  const constant=api.compute([0,0],2,[3,4],[-3,-4]);assert(constant.constantValue);near(constant.min.value,-21);assert.equal(constant.min.point,null);
});
test('restricted domains and unsupported targets are not falsely marked solved',()=>{
  for(const raw of [fixture.question.replace('所在平面内','内部'),fixture.question.replace('PC=1','PC=0'),fixture.question.replace('PC=1','PC=1，且P在第一象限'),fixture.question+'并求三角形PAB面积。',fixture.question.replace('AC=3','AB=3')])assert.equal(api.solve(raw),null,raw);
});
