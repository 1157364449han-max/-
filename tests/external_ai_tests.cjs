const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const bank=JSON.parse(fs.readFileSync(path.join(__dirname,'../dist/question-bank.json'),'utf8'));
const exam=bank.items.find(item=>item.id==='2023-i-6');
const sandbox={window:{}};
for(const file of ['construction-board.js','tangent-solver.js'])vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../dist/'+file),'utf8'),sandbox);
(async()=>{
  const core=await import('../dist/external-contract.mjs');
  const request=core.makeRequest(exam.question,'req-real-2023-i6');
  const scene={type:'circle',h:2,k:0,r:Math.sqrt(5),dynamicLine:false,points:{P:[0,-2]},lines:[],constructions:[
    {id:'contactA',op:'ellipse_tangent_point',refs:['feature:P','$conic'],branch:0,label:'A'},
    {id:'contactB',op:'ellipse_tangent_point',refs:['feature:P','$conic'],branch:1,label:'B'},
    {id:'tangentPA',op:'line',refs:['feature:P','contactA'],label:'PA'},
    {id:'tangentPB',op:'line',refs:['feature:P','contactB'],label:'PB'},
    {id:'midAB',op:'midpoint',refs:['contactA','contactB'],label:'M'}]};
  const reply={schema:core.SCHEMA,requestId:request.requestId,title:exam.title,parts:request.parts.map((p,i)=>({...exam.parts[i],index:p.index,status:'answered'})),scene};
  const encode=x=>'已有 AI 解答\n```json\n'+JSON.stringify(x,null,2)+'\n```';
  let n=0;function check(fn){fn();n++;}
  check(()=>assert(request.prompt.includes(exam.question)));
  check(()=>assert(request.prompt.includes('constructions')));
  check(()=>assert.equal(request.parts.length,1));
  check(()=>assert.throws(()=>core.makeRequest('',request.requestId),/完整题目/));
  check(()=>assert.throws(()=>core.makeRequest('x'.repeat(18001),request.requestId),/18000/));
  let parsed=core.parseReply(encode(reply),request);
  check(()=>assert.equal(parsed.result.mode,'external-ai'));
  check(()=>assert.equal(parsed.result.completion.answered,1));
  check(()=>assert.equal(parsed.graphValid,true));
  check(()=>assert.equal(parsed.requiresConfirmation,false));
  check(()=>assert.equal(parsed.result.scene.objects.length,5));
  check(()=>assert.equal(parsed.result.verification.status,'generated'));
  check(()=>assert.equal(parsed.result.verification.counts.unresolved,request.parts.length));
  check(()=>assert.deepEqual(core.inspectGeometry(parsed.result.scene,sandbox.window.DongConstruct),[]));
  check(()=>assert.throws(()=>core.parseReply(encode({...reply,requestId:'another-request'}),request),/另一份/));
  check(()=>assert.throws(()=>core.parseReply(encode({...reply,question:'另一道题'}),request),/原题/));
  check(()=>assert.throws(()=>core.parseReply(encode({...reply,schema:'unknown'}),request),/版本/));
  check(()=>assert.throws(()=>core.parseReply(encode({...reply,parts:[{index:99}]}),request),/小问编号/));
  check(()=>assert.throws(()=>core.parseReply(encode({...reply,parts:[reply.parts[0],reply.parts[0]]}),request),/重复/));
  check(()=>assert.throws(()=>core.parseReply('```json\n{"parts":[]}',request),/闭合/));
  check(()=>assert.throws(()=>core.parseReply('```json\n{"parts":}\n```',request),/JSON/));
  check(()=>assert.throws(()=>core.parseReply(encode(reply)+'\n'+encode(reply),request),/多份/));
  check(()=>assert.throws(()=>core.parseReply('{"__proto__":{"polluted":true},"parts":[]}',request),/禁止/));
  check(()=>assert.throws(()=>core.parseReply('x'.repeat(core.MAX_REPLY+1),request),/150000/));
  check(()=>assert.throws(()=>core.parseReply('',request),/完整回复/));
  parsed=core.parseReply(encode({...reply,requestId:undefined}),request);
  check(()=>assert.equal(parsed.requiresConfirmation,true));
  parsed=core.parseReply(exam.parts[0].steps.join('\n'),request);
  check(()=>assert.equal(parsed.result.external.plain,true));
  check(()=>assert.equal(parsed.result.completion.answered,0));
  check(()=>assert.equal(parsed.graphValid,false));
  check(()=>assert(parsed.result.rawReply.includes('sqrt')));
  const invalid=(change)=>core.parseReply(encode({...reply,scene:{...scene,...change}}),request);
  check(()=>assert.equal(invalid({r:0}).graphValid,false));
  check(()=>assert.equal(invalid({points:{P:[null,0]}}).graphValid,false));
  check(()=>assert.equal(invalid({constructions:[{id:'bad',op:'eval',refs:[]}]}).graphValid,false));
  check(()=>assert.equal(invalid({constructions:[{id:'bad',op:'midpoint',refs:['missing','feature:P']}]}).graphValid,false));
  check(()=>assert.equal(invalid({constructions:[{id:'loop',op:'point_on',refs:['loop'],t:1}]}).graphValid,false));
  check(()=>assert.equal(invalid({constructions:[{id:'same',op:'point_on',refs:['$conic'],t:1},{id:'same',op:'point_on',refs:['$conic'],t:2}]}).graphValid,false));
  check(()=>assert.equal(invalid({objects:[{kind:'code',script:'alert(1)'}]}).graphValid,false));
  check(()=>assert.equal(invalid({constructions:[{id:'bad',op:'point_on',refs:['$conic'],t:'sqrt(2)'}]}).graphValid,false));
  check(()=>assert.equal(invalid({lines:[{kind:'through_points',a:'A',b:'B'}]}).graphValid,false));
  const repair=core.makeRepairRequest(request,'已有回复',['缺少点 N']);
  check(()=>assert(repair.includes(request.requestId)&&repair.includes('缺少点 N')));
  const plain=core.parseReply('<img src=x onerror=alert(1)>普通解答 $\\sqrt{2}$',request);
  check(()=>assert.equal(plain.result.rawReply.includes('<img'),true));
  check(()=>assert.equal(plain.result.verification.status,'generated'));
  // A named curve point and its tangent must recompute together, not freeze coordinates.
  const moving=core.safeExternalScene({...scene,constructions:[{id:'movingP',op:'point_on',refs:['$conic'],t:.5,label:'N'},{id:'atN',op:'tangent',refs:['movingP','$conic'],label:'tN'}]});
  check(()=>assert.equal(moving.valid,true));
  check(()=>assert.deepEqual(core.inspectGeometry(moving.scene,sandbox.window.DongConstruct),[]));
  check(()=>assert.equal(core.safeExternalScene({...scene,points:{"A'":[1,2]},constructions:[]}).valid,true));
  check(()=>assert.equal(core.safeExternalScene({...scene,constructions:[{id:'movingP',op:'point_on',refs:['$conic'],t:.5,label:'P'}]}).valid,false));
  check(()=>assert.equal(core.safeExternalScene({...scene,dynamicLine:true,curvePoints:[{name:'A',t:1}],constructions:[]}).valid,false));
  check(()=>assert.equal(core.safeExternalScene({...scene,curvePoints:{name:'N'},constructions:[]}).valid,false));
  check(()=>assert.equal(core.safeExternalScene({...scene,curvePoints:Array.from({length:13},(_,i)=>({name:'N'+i,t:1})),constructions:[]}).valid,false));
  const wrongTangent=core.safeExternalScene({...scene,constructions:[{id:'atP',op:'tangent',refs:['feature:P','$conic'],label:'tP'}]});
  check(()=>assert(core.inspectGeometry(wrongTangent.scene,sandbox.window.DongConstruct).length>0));
  // Broader sourced examination roundtrips test parsing, not new invented problems.
  for(const item of bank.items.filter(x=>x.kind==='gaokao')){
    const req=core.makeRequest(item.question,'req-exam-'+item.id);
    const raw={schema:core.SCHEMA,requestId:req.requestId,parts:req.parts.map((p,i)=>({index:p.index,answer:item.parts[i]?.answer||'',steps:item.parts[i]?.steps||[],status:'answered'})),scene:null};
    check(()=>assert.equal(core.parseReply(encode(raw),req).result.completion.total,req.parts.length));
  }
  console.log(`PASS external AI: ${n} request, real-exam, parsing, data isolation and geometry checks`);
})().catch(e=>{console.error(e);process.exitCode=1;});
