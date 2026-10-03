module.exports=async({page,context,assert,screenshot})=>{
  const fs=require('node:fs'),path=require('node:path'),question=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/sourced-exam-additions.json'),'utf8')).items.find(q=>q.id==='2022-beijing-10').question;
  await page.locator('#question').fill(question);await page.locator('#solveButton').click();await page.waitForFunction(()=>document.querySelector('#solveProgress').dataset.state==='complete');
  let result=await page.evaluate(()=>JSON.parse(localStorage.getItem('zhigeometry:last')).solution);
  assert.match(result.parts[0].answer,/\[-4,6\]/);assert.equal(result.sceneAudit.missing.length,0);assert.equal(result.sceneAudit.invalid.length,0);assert(result.scene.polygons.some(n=>n.label==='△ABC'));
  assert.equal(await page.locator('#solution .katex-error').count(),0);
  await page.locator('[data-inspector-view="geometry"]').click();
  for(const kind of ['min','max']){
    await page.locator(`[data-dot-jump="${kind}"]`).click();
    const value=await page.evaluate(()=>{const m=JSON.parse(document.querySelector('#sceneJson').value),p=m.objects.find(o=>o.id===m.dotExtrema.movingId),P=[m.h+m.r*Math.cos(p.t),m.k+m.r*Math.sin(p.t)],A=m.points.A,B=m.points.B;return{value:(A[0]-P[0])*(B[0]-P[0])+(A[1]-P[1])*(B[1]-P[1]),P};});
    assert(Math.abs(value.value-(kind==='min'?-4:6))<1e-8);assert.equal(await page.locator(`[data-dot-jump="${kind}"]`).textContent(),'已到达');
  }
  await screenshot('circle-dot-max.png',null);
  await page.reload({waitUntil:'domcontentloaded'});assert.equal(JSON.parse(await page.locator('#sceneJson').inputValue()).dotExtrema.moving,'P','Saved graph keeps the theorem metadata');
  await page.setViewportSize({width:390,height:844});await page.locator('[data-mobile-panel="board"]').click();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await screenshot('circle-dot-mobile.png',null);
  await page.setViewportSize({width:1600,height:1050});
  await context.route('**/runtime-config.js',r=>r.fulfill({contentType:'application/javascript',body:'window.DONGJIEXI_CONFIG={deployment:"web",apiEnabled:true,requiresAuth:false};'}));
  await context.route('**/api/health',r=>r.fulfill({json:{app:'董解析',capabilities:{transport:'sse'},engine:{available:true,remote:true,models:['fixture-cloud']}}}));
  const raw={title:'原卷协议回归',parts:[{index:0,status:'answered',answer:'错误的测试结论',steps:['仅为协议测试']}],scene:{type:'circle',h:0,k:0,r:9,points:{A:[0,3],B:[4,0],C:[0,0],P:[9,0]},dynamicLine:false}};
  await context.route('**/api/stream',r=>r.fulfill({contentType:'text/event-stream',body:'data: '+JSON.stringify({choices:[{delta:{content:JSON.stringify(raw)}}]})+'\n\ndata: '+JSON.stringify({choices:[{delta:{},finish_reason:'stop'}]})+'\n\ndata: [DONE]\n\n'}));
  await page.evaluate(()=>localStorage.setItem('dongjiexi:solve-mode:v1','cloud'));await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('#engineStatus').classList.contains('ready'));
  await page.locator('#question').fill(question);await page.locator('#solveButton').click();await page.waitForFunction(()=>!document.querySelector('#solveButton').disabled&&document.querySelector('#solveProgress').dataset.state==='complete');
  result=await page.evaluate(()=>JSON.parse(localStorage.getItem('zhigeometry:last')).solution);assert.match(result.parts[0].answer,/\[-4,6\]/);assert.match(result.parts[0].model_answer,/错误的测试结论/);assert.equal(result.model_scene.r,9,'Model frame is retained, not mixed');assert.equal(result.scene.r,1);assert.equal(result.scene.objects.filter(n=>n.label==='P').length,1);assert.equal(result.sceneAudit.invalid.length,0);
};
