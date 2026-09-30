const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const sandbox={window:{}};
for(const file of ['construction-board.js','tangent-solver.js','scene-audit.js'])vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../dist/'+file),'utf8'),sandbox);
const audit=sandbox.window.DongSceneAudit,construct=sandbox.window.DongConstruct;
(async()=>{
  const {assemble}=await import('../dist/cloud-contract.mjs');
  const {safeConstructionScene}=await import('../dist/scene-contract.mjs');
  const {safeExternalScene}=await import('../dist/external-contract.mjs');
  let count=0;const check=f=>{f();count++;},copy=x=>JSON.parse(JSON.stringify(x));
  const question='已知圆 C：x²+y²=4，点 P(3,0)。过点 P 作圆的两条切线，切点分别为 A、B。（1）求切线。（2）设线段 AB 的中点为 N，求点 N 的坐标。（3）求三角形 PAB 的面积。';
  const raw={type:'circle',r:2,dynamicLine:false,points:{P:[3,0]},constructions:[
    {id:'contactA',op:'ellipse_tangent_point',refs:['feature:P','$conic'],branch:0,label:'A'},
    {id:'contactB',op:'ellipse_tangent_point',refs:['feature:P','$conic'],branch:1,label:'B'},
    {id:'tangentA',op:'tangent',refs:['contactA','$conic'],label:'tA',parts:[1,3]},
    {id:'tangentB',op:'tangent',refs:['contactB','$conic'],label:'tB',parts:[1,3]},
    {id:'midAB',op:'midpoint',refs:['contactA','contactB'],label:'N',part:2}]};
  const response={scene:raw,parts:[1,2,3].map(index=>({index,status:'answered',answer:'测试占位，不是能力验收',steps:['仅供协议测试']}))};
  const cloud=assemble(response,question,'fixture'),external=safeExternalScene(raw);
  check(()=>assert.equal(cloud.scene.objects.length,5,'Cloud must not discard answer constructions'));
  check(()=>assert.deepEqual(cloud.scene.objects,external.scene.objects));
  check(()=>assert.equal(cloud.scene.showDynamic,false));
  const named=safeConstructionScene({type:'ellipse',a:2,b:1,dynamicLine:true,dynamicIntersectionLabels:['B','C'],points:{A:[0,1],P:[-2,1]},constructions:[{id:'AB',op:'line',refs:['feature:A','feature:B'],label:'AB'}]});
  check(()=>assert.equal(named.valid,true));
  check(()=>assert.deepEqual(named.scene.points.A,[0,1]));
  check(()=>assert.deepEqual(named.scene.dynamicIntersectionLabels,['B','C']));
  check(()=>assert.deepEqual(cloud.scene.objects.find(n=>n.id==='tangentA').parts,[1,3]));
  check(()=>assert.equal(audit.visible(cloud.scene.objects[2],1),true));
  check(()=>assert.equal(audit.visible(cloud.scene.objects[2],2),false));
  check(()=>assert.equal(audit.visible(cloud.scene.objects[2],3),true));
  check(()=>assert.equal(audit.visible({...cloud.scene.objects[2],visible:false},null),false));
  check(()=>assert.equal(audit.visible({part:2,parts:[1,3]},1),false,'Explicit user binding takes precedence'));
  audit.prepare(cloud.scene,question,cloud.parts);
  const report=audit.inspect(cloud.scene,question,cloud.parts,construct);
  check(()=>assert.equal(report.missing.length,0,JSON.stringify(report)));
  check(()=>assert.equal(report.invalid.length,0,JSON.stringify(report)));
  check(()=>assert.equal(report.checks.filter(c=>c.passed&&c.kind==='tangent').length,2));
  check(()=>assert.equal(report.checks.filter(c=>c.passed&&c.kind==='midpoint').length,1));
  check(()=>assert.match(report.note,/不是一般性证明/));
  const missing=copy(cloud.scene);missing.objects=missing.objects.filter(n=>n.label!=='N');
  check(()=>assert(audit.inspect(missing,question,cloud.parts,construct).missing.includes('N')));
  const noTangent=copy(cloud.scene);noTangent.objects=noTangent.objects.filter(n=>n.op!=='tangent');
  check(()=>assert(audit.inspect(noTangent,question,cloud.parts,construct).missingLines.some(s=>s.includes('两条切线'))));
  check(()=>assert(audit.declared('连接 A′B，设 A′ 为点 A 关于 x 轴的对称点。').includes('A′')));
  check(()=>assert(!audit.declared('已知椭圆 C：x²/4+y²=1。').includes('C')));
  check(()=>assert(audit.declared('左焦点 F_1(-1,0)，交于 A、B 两点。').includes('F1')));
  const dependencies={type:'circle',r:2,points:{P:[3,0]},objects:[{id:'moving',op:'point_on',refs:['$conic'],label:'M'},{id:'n',op:'midpoint',refs:['moving','feature:P'],label:'N',parts:[2,3]}]};
  audit.prepare(dependencies,'已知圆，点 P(3,0)。（1）求方程。（2）求点 N。（3）求点 N 的轨迹。',[{index:1,body:'求方程'},{index:2,body:'求点 N'},{index:3,body:'求点 N 的轨迹'}]);
  check(()=>assert.deepEqual(Array.from(dependencies.objects[0].parts),[2,3]));
  check(()=>assert.equal(audit.visible(dependencies.objects[0],1),false));
  check(()=>assert.equal(audit.visible(dependencies.objects[0],3),true));
  check(()=>assert.equal(dependencies.pointParts.P,undefined,'P is a common given point'));
  for(const reason of ['没有标准方程，因此条件不足','图形不唯一，无法解答','需要确定动直线的斜率','原题缺少条件']){
    const result=assemble({parts:[{index:0,answer:reason,status:'needs_information',steps:['未能建模']}]},'求动线构造的定值','fixture');
    check(()=>assert.equal(result.parts[0].status,'partial'));
    check(()=>assert.equal(result.parts[0].model_answer,reason));
    check(()=>assert.equal(result.verification.counts.unresolved,1));
  }
  const claim=assemble({parts:[{index:0,status:'needs_information',answer:'缺少半径',steps:['讨论两种情况'],missing_conditions:['圆的半径'],nonuniqueness_examples:[{conditions:['圆心为原点，半径为1'],answer:'面积为π'},{conditions:['圆心为原点，半径为2'],answer:'面积为4π'}]}]},'圆心为原点，求圆的面积','fixture');
  check(()=>assert.equal(claim.parts[0].status,'needs_information'));
  check(()=>assert.equal(claim.parts[0].verification.verified,false,'A model certificate is still unverified'));
  for(const change of [
    {constructions:[{id:'code',op:'eval',refs:[]}]},
    {constructions:[{id:'missing',op:'midpoint',refs:['unknown','feature:P']}]},
    {constructions:[{id:'a',op:'point_on',refs:['a'],label:'A',t:0}]},
    {constructions:[{id:'a',op:'point_on',refs:['$conic'],label:'P',t:0}]},
    {points:{P:[Infinity,0]}},
    {constructions:[{id:'a',op:'point_on',refs:['$conic'],label:'A',t:'sqrt(2)'}]}
  ]){
    check(()=>assert.equal(safeConstructionScene({...raw,...change}).valid,false));
    check(()=>assert.equal(assemble({...response,scene:{...raw,...change}},question,'fixture').scene,null));
  }
  console.log('PASS scene consistency: '+count+' cloud/clipboard parity, missing-points, numerical checks, shared-layer, false-insufficiency and unsafe-graph checks');
})().catch(error=>{console.error(error);process.exitCode=1;});
