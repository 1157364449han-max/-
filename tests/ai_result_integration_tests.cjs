/* Adverse data-contract workflows; no inference, credentials or network calls. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
(async()=>{
  const {assemble}=await import('../dist/cloud-contract.mjs');
  const {safeConstructionScene}=await import('../dist/scene-contract.mjs');
  const {makeRequest,parseReply}=await import('../dist/external-contract.mjs');
  let count=0;const check=fn=>{fn();count++;},copy=value=>JSON.parse(JSON.stringify(value));
  const part=(index=0)=>({index,status:'answered',answer:'协议测试结论',steps:['协议测试推导，不是解题能力验收']});
  const reply=change=>assemble({parts:[{...part(),...change}]},'求参数值','fixture');
  check(()=>assert.equal(reply({answer:'  ',steps:['  ']}).completion.answered,0));
  check(()=>assert.equal(reply({steps:[' ',null,2]}).completion.answered,0));
  check(()=>assert.throws(()=>reply({index:99}),/不属于本题/));
  check(()=>assert.equal(reply({index:1}).parts[0].index,0,'Only legacy 1 -> unnumbered 0 is allowed'));
  check(()=>assert.throws(()=>assemble({parts:[part(1),part(2),part(99)]},'（1）求参数；（2）求范围','fixture'),/不属于本题/));
  check(()=>assert.equal(reply({proof_obligations:['证明取等条件']}).parts[0].status,'partial'));
  check(()=>assert.equal(reply({proof_obligations:['  ']}).completion.answered,1));
  check(()=>assert.equal(reply({answer:'a'.repeat(6001)}).completion.answered,0));
  check(()=>assert.equal(reply({steps:Array(41).fill('推导')}).completion.answered,0));
  const base={type:'ellipse',a:2,b:1,dynamicLine:false,points:{P:[3,0]}};
  for(const change of [
    {points:{P:['3',0]}},{points:{P:[Infinity,0]}},{a:0},{a:-2},{b:1e-200},
    {dynamicLine:'false'},{orientation:'diagonal'},{direction:0},{dynamicIntersectionLabels:['A','A']},
    {lineThrough:'point:?'},{dynamicLine:true,lineThrough:'point:N'},
    {curvePoints:[{name:'M',t:'sqrt(2)'}]},
    {lines:[{kind:'slope',m:1,b:'0'}]},
    {lines:[{kind:'slope',m:1,b:0,part:99}]},
    {constructions:[{id:'M',op:'midpoint',refs:['$conic','$conic'],label:'M'}]},
    {constructions:[{id:'l',op:'tangent',refs:['feature:P','feature:P']}]},
    {constructions:[{id:'M',op:'point_on',refs:['$conic'],t:0,branch:0,label:'M'}]},
    {constructions:[{id:'M',op:'point_on',refs:['$conic'],t:0,parts:[0,'1'],label:'M'}]}
  ]){
    check(()=>assert.equal(assemble({parts:[part()],scene:{...base,...change}},'求参数值','fixture').scene,null,JSON.stringify(change)));
  }
  check(()=>assert.equal(safeConstructionScene({...base,dynamicLine:true,lineThrough:"point:A'",points:{"A'":[3,0]}}).valid,true));
  check(()=>assert.equal(safeConstructionScene({...base,lines:[{kind:'slope',m:0,b:0,visible:false}]}).scene.lines[0].visible,false));
  const request=makeRequest('求参数值','audit-fixture');
  check(()=>assert.equal(parseReply(JSON.stringify({requestId:request.requestId,parts:[part()],scene:{...base,points:{P:['3',0]}}}),request).result.scene,null,'An invalid clipboard graph cannot leak into the solution'));
  const box={window:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../dist/scene-merge.js'),'utf8'),box);
  const merge=box.window.DongSceneMerge.mergeDerived;
  const target={objects:[{id:'ai-M',kind:'construction',op:'midpoint',label:'M',refs:['feature:P','feature:P']},{id:'dependent',kind:'construction',op:'line',refs:['ai-M','feature:P'],label:'PM'}],lines:[]};
  const exact={objects:[{id:'exact-M',kind:'construction',op:'foot',refs:['feature:P','exact-axis'],label:'M',source:'derived',construction:{inputs:{point:'P',line:'exact-axis'}}}],lines:[{id:'exact-axis',kind:'slope',m:0,b:0,label:'axis',source:'derived'}]};
  merge(target,exact);
  check(()=>assert.equal(target.objects.find(n=>n.label==='M').id,'ai-M'));
  check(()=>assert.deepEqual(Array.from(target.objects.find(n=>n.id==='dependent').refs),['ai-M','feature:P']));
  check(()=>assert.equal(target.objects.find(n=>n.label==='M').construction.inputs.line,'exact-axis'));
  const manual={id:'exact-axis',kind:'circle',h:0,k:0,r:2,label:'axis',source:'user'};
  const manualTarget={objects:[copy(manual)],lines:[]};merge(manualTarget,exact);
  check(()=>assert.deepEqual(manualTarget.objects[0],manual,'Manual objects are never replaced by a same-ID or same-label theorem object'));
  const addedAxis=manualTarget.lines[0],addedM=manualTarget.objects.find(n=>n.source==='derived');
  check(()=>assert.notEqual(addedAxis.id,manual.id));
  check(()=>assert.equal(addedM.refs[1],addedAxis.id));
  check(()=>assert.equal(addedM.construction.inputs.line,addedAxis.id));
  check(()=>assert.notEqual(addedAxis.label,manual.label));
  check(()=>assert.equal(new Set([...manualTarget.objects,...manualTarget.lines].map(n=>n.id)).size,3));
  const renamed={objects:[{id:'old-axis',kind:'slope',label:'axis',m:1,b:3},{id:'extra',kind:'construction',op:'line',refs:['feature:M','feature:P']}],lines:[]};
  const aliasExact=copy(exact);aliasExact.objects[0].pointRef='exact-axis';merge(renamed,aliasExact);
  check(()=>assert.equal(renamed.objects.find(n=>n.id==='exact-M').construction.inputs.line,'old-axis'));
  check(()=>assert.equal(renamed.objects.find(n=>n.id==='exact-M').pointRef,'old-axis'));
  check(()=>assert.equal(renamed.objects.find(n=>n.id==='extra').refs[0],'exact-M'));
  check(()=>assert.equal(box.window.DongSceneMerge.remapReferences({line:'exact-axis'},renamed.provenance.derivedIdMap).line,'old-axis'));
  const duplicate={objects:[],lines:[]};merge(duplicate,{objects:[{id:'first',kind:'construction',op:'midpoint',label:'N',refs:['feature:P','feature:P'],source:'derived'},{id:'second',kind:'construction',op:'foot',label:'N',refs:['feature:P','$dynamic'],source:'derived'}],lines:[]});
  check(()=>assert.equal(new Set(duplicate.objects.map(n=>n.id)).size,2));
  check(()=>assert.equal(new Set(duplicate.objects.map(n=>n.label)).size,2));
  // Run the real acceptance function with a minimal UI seam, not a second
  // implementation of its status/override rules.
  const ui=fs.readFileSync(path.join(__dirname,'../dist/learning-ui.js'),'utf8');
  const acceptSource=ui.slice(ui.indexOf('    function acceptSolution('),ui.indexOf('    function checkQuestionGeometry('));
  const api={question:{value:'求参数值'},state:{model:null,solution:null},setStatus(){},solveDeterministic(){return null;},showSolution(result){this.state.solution=result;},enrichSolvedScene:result=>result,remember(){},modelFromJson:JSON.parse,installScene(scene){this.state.model=scene;}};
  const notices=[],uiBox={window:box.window,api,progress:(...args)=>notices.push(args),find:()=>({hidden:true,textContent:''}),renderSolution(){},saveLesson(){},report(){},verificationNames:{},inspectorView:''};
  vm.runInNewContext(acceptSource+'\nthis.acceptSolution=acceptSolution;',uiBox);
  const untrusted={mode:'cloud-ai',parts:[{...part(),steps:[]}],completion:{answered:10,total:10},scene:null};
  uiBox.acceptSolution(untrusted,'求参数值');
  check(()=>assert.equal(untrusted.completion.answered,0,'UI does not trust remote completion counts'));
  check(()=>assert.equal(notices.at(-1)[0],'partial'));
  const before=api.state.solution;check(()=>assert.equal(uiBox.acceptSolution({parts:[],completion:{answered:0,total:0}},'求参数值'),false));
  check(()=>assert.equal(api.state.solution,before,'Malformed empty results preserve previous solution'));
  check(()=>assert.equal(uiBox.acceptSolution({parts:[part()]},'另一题'),false));
  api.solveDeterministic=()=>({parts:[{...part(),answer:'独立复算结论',steps:['独立复算步骤'],derivation:{proof_obligations:[]}}],completion:{answered:1,total:1}});
  const original={mode:'external-ai',parts:[{...part(),derivation:{proof_obligations:['尚待证明']}}],scene:null};
  uiBox.acceptSolution(original,'求参数值',{installGraph:false});
  check(()=>assert.equal(original.parts[0].answer,'独立复算结论'));
  check(()=>assert.equal(original.parts[0].model_steps[0],'协议测试推导，不是解题能力验收'));
  check(()=>assert.deepEqual(original.parts[0].model_derivation,{proof_obligations:['尚待证明']}));
  check(()=>assert.equal(original.completion.answered,1,'Native independent complete proof can replace a partial AI answer'));
  console.log('PASS AI result integration: '+count+' adverse contract, graph, dependency, manual-object and UI acceptance checks');
})().catch(error=>{console.error(error);process.exitCode=1;});
