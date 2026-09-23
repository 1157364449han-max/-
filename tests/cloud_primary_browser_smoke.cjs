module.exports=async({page,context,assert})=>{
  await page.evaluate(async()=>{for(const r of await navigator.serviceWorker.getRegistrations())await r.unregister();for(const k of await caches.keys())await caches.delete(k);});
  await context.route('**/runtime-config.js',r=>r.fulfill({contentType:'application/javascript',body:'window.DONGJIEXI_CONFIG={deployment:"web",apiEnabled:true,requiresAuth:false};'}));
  await context.route('**/api/health',r=>r.fulfill({json:{engine:{available:true,installed:true,remote:true,vision:false,models:['test-cloud']},default_model:'qwen3.5:4b'}}));
  let jobs=0,rules=0;
  await context.route('**/api/solve',r=>{rules++;return r.fulfill({status:500,json:{error:'Must not use rule dispatch for cloud-primary'}});});
  await context.route('**/api/jobs',r=>{jobs++;return r.fulfill({json:{id:'test',status:'completed',result:{mode:'cloud-ai',title:'云端完整题意测试',restatement:r.request().postDataJSON().text,parts:[{index:0,status:'partial',answer:'模拟云端响应；不是实际解题能力验收。',steps:[]}],completion:{answered:0,total:1},scene:null}}});});
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('#engineStatus').classList.contains('ready'));
  assert.equal(await page.locator('#modelName').inputValue(),'test-cloud');
  await page.locator('#question').fill('已知椭圆x²/9+y²/4=1，求标准方程。');
  await page.locator('#solveButton').click();
  await page.waitForFunction(()=>document.querySelector('#solution').textContent.includes('云端完整题意测试'));
  assert.equal(jobs,1);assert.equal(rules,0,'即使规则可解，也应按云端优先处理整题');
  assert(await page.locator('#pullModel').isHidden(),'云服务器不得提供浏览器下载模型操作');
  assert(await page.locator('#recognizeButton').isDisabled(),'纯文本云模型不得假装能识图');
  assert.match(await page.locator('#localModelChoice').textContent(),/本机版/);
};
