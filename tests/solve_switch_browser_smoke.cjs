module.exports=async({page,context,assert})=>{
  await page.evaluate(async()=>{for(const r of await navigator.serviceWorker.getRegistrations())await r.unregister();for(const k of await caches.keys())await caches.delete(k);localStorage.clear();});
  await context.route('**/runtime-config.js',route=>route.fulfill({contentType:'application/javascript',body:'window.DONGJIEXI_CONFIG={version:"0.23.1",deployment:"web",apiEnabled:true,apiBase:"",requiresAuth:false};'}));
  await context.route('**/api/health',route=>route.fulfill({json:{default_model:'test',engine:{available:false,installed:false,models:[]}}}));
  let release,started=false,requests=0;
  const gate=new Promise(resolve=>release=resolve);
  await context.route('**/api/solve',async route=>{
    requests++;started=true;await gate;
    const question=route.request().postDataJSON().text;
    await route.fulfill({json:{mode:'rules',title:'旧题结果',restatement:question,parts:[{index:1,answer:'旧题答案',steps:[],status:'answered'}],completion:{answered:0,total:1},scene:{type:'circle',r:9,points:{},lines:[],objects:[]}}});
  });
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('[data-quick-conic="ellipse"]').click();
  const before=await page.locator('#sceneJson').inputValue();
  await page.locator('#question').fill('圆x²+y²=81，求半径。');
  await page.locator('#solveButton').click();
  for(let i=0;!started&&i<50;i++)await new Promise(resolve=>setTimeout(resolve,20));
  assert(started,'Slow solve request must start');
  await page.locator('#question').fill('椭圆x²/9+y²/4=1，求焦点。');
  // Even synthetic repeated clicks must not enqueue a second solve.
  await page.locator('#solveButton').dispatchEvent('click');
  release();
  await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('旧题结果未应用'));
  assert.equal(requests,1);
  assert.equal(await page.locator('#sceneJson').inputValue(),before,'Late results cannot overwrite the current board');
  assert.equal((await page.locator('#solution').textContent()).includes('旧题答案'),false);
  assert.equal(await page.locator('#question').inputValue(),'椭圆x²/9+y²/4=1，求焦点。');
  await context.unroute('**/runtime-config.js');
  await context.route('**/runtime-config.js',route=>route.fulfill({contentType:'application/javascript',body:'window.DONGJIEXI_CONFIG={version:"0.23.1",deployment:"web",apiEnabled:false,apiBase:"",requiresAuth:false};'}));
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#question').fill('圆x²+y²=9，求半径。');
  await page.locator('#solveButton').click();
  await page.waitForFunction(()=>document.querySelector('#solution').textContent.includes('董解析浏览器内置解答'));
  assert.equal(await page.locator('#recognizeButton').isDisabled(),false,'Browser OCR remains available without cloud API after solving');
  assert.equal(await page.locator('#engineRefresh').isDisabled(),true);
  assert.equal(await page.locator('#solveButton').isEnabled(),true);
  console.log('PASS: stale solve discarded, current question and board preserved, duplicate solve suppressed and offline capabilities retained.');
};
