/* User-reported regression, not an invented or mislabeled exam-bank item. */
const QUESTION=`已知抛物线 C：y^2=2px（p>0）的焦点为 F，准线与 x 轴交于点 K，过 F 的直线 l 与抛物线交于 A、B 两点。
（1）若 |AB|=8，且线段 AB 中点的横坐标为 3，求抛物线 C 的方程；
（2）在（1）的条件下，若直线 l 的倾斜角为 45°，求 |AB|；
（3）在（1）（2）的条件下，设 M 为准线上一点，且 MA⊥MB，求点 M 的坐标。`;
module.exports=async({page,context,assert,screenshot})=>{
  await context.route('**/runtime-config.js',r=>r.fulfill({contentType:'application/javascript',body:'window.DONGJIEXI_CONFIG={deployment:"web",apiEnabled:false};'}));
  await page.reload({waitUntil:'domcontentloaded'});
  const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('zhigeometry:last')));
  async function solve(text=QUESTION){await page.locator('#question').fill(text);await page.locator('#solveButton').click();await page.waitForFunction(()=>['complete','partial','error'].includes(document.querySelector('#solveProgress').dataset.state));return read();}
  let saved=await solve();
  assert.deepEqual(saved.solution.completion,{answered:3,total:3},JSON.stringify(saved.solution.parts));
  assert.deepEqual(saved.solution.parts.map(p=>p.index),[1,2,3]);
  assert(saved.solution.parts[2].body.includes('（1）（2）')||saved.solution.parts[2].body.includes('(1)(2)'),'Previous-part references remain in the question body');
  assert.match(saved.solution.parts[0].answer,/4/);assert.match(saved.solution.parts[1].answer,/8/);assert.match(saved.solution.parts[2].answer,/-1.*2/);
  assert.equal(saved.scene.p,1);assert.equal(saved.scene.theta,45);assert.equal(saved.scene.lineThrough,'point:F');
  assert.deepEqual(saved.scene.points.K,[-1,0]);
  assert.equal((saved.scene.lines||[]).filter(o=>o.op==='tangent').length,0,'Unasked tangents and Q are not fabricated');
  assert.equal(await page.locator('#solution .katex-error').count(),0);
  await page.locator('[data-study-part="3"]').click();
  async function geometry(){
    return page.evaluate(scene=>{
      const q={A:0,B:0,C:1,D:-4*scene.p,E:0,F:0},o={x:scene.p,y:0};
      const sample=angle=>{
        const a=angle*Math.PI/180,d={x:Math.cos(a),y:Math.sin(a)},line={type:'line',o,d};
        const pair=window.DongConstruct.intersect(line,{type:'conic',q});
        const features=()=>[...Object.entries(scene.points).map(([name,[x,y]])=>({name,x,y})),...pair.map((p,i)=>({...p,name:scene.dynamicIntersectionLabels[i]}))];
        const engine=window.DongConstruct.createEngine({model:()=>scene,features,coeffs:()=>q,origin:()=>o,angle:()=>angle});
        return {angle,A:pair[0],B:pair[1],M:engine.resolve('focal-data-M'),MA:engine.resolve('focal-data-MA'),MB:engine.resolve('focal-data-MB')};
      };
      return{scene,samples:[30,45,60,90,135].map(sample)};
    },JSON.parse(await page.locator('#sceneJson').inputValue()));
  }
  const graph=await geometry();
  for(const {A,B,M,MA,MB} of graph.samples){
    assert(M&&M.type==='point');assert(MA&&MB,'Both perpendicular segments are actual dependent constructions');
    assert(Math.abs(M.x+1)<1e-8);assert(Math.abs((A.x-M.x)*(B.x-M.x)+(A.y-M.y)*(B.y-M.y))<1e-7);
  }
  const specified=graph.samples.find(s=>s.angle===45);assert(Math.abs(specified.M.y-2)<1e-8);assert(Math.abs(Math.hypot(specified.A.x-specified.B.x,specified.A.y-specified.B.y)-8)<1e-8);
  assert.match(await page.locator('#layers').innerText(),/MA/);assert.match(await page.locator('#layers').innerText(),/MB/);
  await screenshot('parabola-focal-data-three-parts.png',null);
  await page.reload({waitUntil:'domcontentloaded'});saved=await read();assert(saved.scene.parabolaFocalData,'Draft retains the model and dependency graph');
  await page.locator('[data-inspector-view="geometry"]').click();await page.locator('#parameterTarget').selectOption('$conic');
  await page.locator('#params input[data-key="p"][data-param-expression]').fill('2');
  const explored=JSON.parse(await page.locator('#sceneJson').inputValue());
  assert.equal(explored.points.F[0],2);assert.equal(explored.points.K[0],-2);assert.equal(explored.lines.find(l=>l.id==='focal-data-directrix').x,-2);
  assert.equal((await read()).solution.parts[2].answer,saved.solution.parts[2].answer,'Exploration does not rewrite original answers');
  await page.locator('#params input[data-key="p"][data-param-expression]').fill('1');
  await page.setViewportSize({width:320,height:740});await page.locator('[data-mobile-panel="board"]').click();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await screenshot('parabola-focal-data-mobile.png',null);
  await page.setViewportSize({width:1600,height:1050});
  // A contradictory later angle cannot silently discard the original fixed-chord conditions.
  saved=await solve(QUESTION.replace('45°','30°'));assert(saved.solution.completion.answered<3);assert(saved.solution.verification.checks.some(c=>c.status==='contradicted'));
  // Shared cloud/external contracts see THREE headings, not six parentheses.
  const contracts=await page.evaluate(async text=>{
    const cloud=await import('./cloud-contract.mjs'),external=await import('./external-contract.mjs');
    return{cloud:cloud.splitParts(text),request:external.makeRequest(text,'focal-data-test').parts};
  },QUESTION);
  assert.deepEqual(contracts.cloud.map(p=>p.index),[1,2,3]);assert.deepEqual(contracts.request.map(p=>p.index),[1,2,3]);
  // Transport fixture exercises cloud rendering without consuming real API quota.
  await context.unroute('**/runtime-config.js');
  await context.route('**/runtime-config.js',r=>r.fulfill({contentType:'application/javascript',body:'window.DONGJIEXI_CONFIG={deployment:"web",apiEnabled:true,requiresAuth:false};'}));
  await context.route('**/api/health',r=>r.fulfill({json:{app:'董解析',capabilities:{transport:'sse'},engine:{available:true,installed:true,remote:true,models:['test-cloud']},default_model:'test-cloud'}}));
  let streamCalls=0;
  await context.route('**/api/stream',r=>{
    streamCalls++;assert.equal(r.request().postDataJSON().text,QUESTION);
    // These conclusions reproduce the real cloud check; this transport remains mocked.
    const answers=['$y^2=4x$','$|AB|=8$','$M(-1,2-2\\sqrt2)$ 或 $M(-1,2+2\\sqrt2)$'];
    const raw={title:'三问传输回归',parts:[1,2,3].map(index=>({index,answer:answers[index-1],steps:['实测结论回放；传输和步骤为测试夹具，不是真实 AI 推理。'],status:'answered'})),scene:{type:'parabola',p:1,h:0,k:0,points:{},dynamicLine:true,lineThrough:'focus2',lines:[{kind:'slope',m:0,b:0,label:'test-line'}]}};
    return r.fulfill({contentType:'text/event-stream',body:'data: '+JSON.stringify({choices:[{delta:{content:JSON.stringify(raw)}}]})+'\n\ndata: '+JSON.stringify({choices:[{delta:{},finish_reason:'stop'}]})+'\n\ndata: [DONE]\n\n'});
  });
  await page.evaluate(()=>localStorage.setItem('dongjiexi:solve-mode:v1','cloud'));await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('#engineStatus').classList.contains('ready'));
  saved=await solve();assert.equal(streamCalls,1);assert.deepEqual(saved.solution.completion,{answered:3,total:3});assert.match(saved.solution.parts[2].model_answer,/sqrt2/);assert.match(saved.solution.parts[2].answer,/-1.*2/);assert(!saved.solution.parts[2].answer.includes('sqrt2'));
  assert(saved.scene.objects.some(o=>o.id==='focal-data-M'));assert.equal(saved.scene.lineThrough,'point:F');
};
