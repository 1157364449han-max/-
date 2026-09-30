module.exports=async({page,context,assert,screenshot})=>{
  await page.evaluate(async()=>{
    for(const item of await navigator.serviceWorker.getRegistrations())await item.unregister();
    for(const key of await caches.keys())await caches.delete(key);
  });
  let transport='ok',healthCalls=0,delayHealth=false;
  await context.route('**/runtime-config.js',route=>route.fulfill({contentType:'application/javascript',body:
    `window.DONGJIEXI_CONFIG=Object.freeze({version:'0.41.2',deployment:'web',apiBase:'',apiEnabled:true,requiresAuth:true});`}));
  await context.route('**/api/health',async route=>{
    healthCalls++;
    if(delayHealth)await new Promise(resolve=>setTimeout(resolve,350));
    if(transport==='network')return route.abort('failed');
    if(transport==='unavailable')return route.fulfill({status:503,contentType:'text/html',body:'Unavailable'});
    const authenticated=!!route.request().headers().authorization;
    return route.fulfill({contentType:'application/json',body:JSON.stringify({app:'董解析',
      default_model:'deepseek-chat',engine:{available:authenticated&&transport!=='model-unavailable',remote:true,
        models:authenticated?['deepseek-chat']:[]}})});
  });
  await context.route('**/api/session',route=>transport==='network'?route.abort('failed'):
    route.fulfill({contentType:'application/json',body:JSON.stringify({token:'outage-test-session',expires_in:600})}));
  await page.reload({waitUntil:'domcontentloaded'});
  // Use a sourced examination question, not an invented mathematical test fixture.
  await page.locator('#openQuestionBank').click();
  await page.locator('#bankList [data-bank-id="2023-i-6"]').click();
  await page.locator('[data-bank-action="full"]').click();
  const question=await page.locator('#question').inputValue(),scene=await page.locator('#sceneJson').inputValue();
  const solution=await page.locator('#solution').innerHTML();
  transport='network';
  await page.locator('#solveModeToggle').click();await page.locator('[data-solve-mode="cloud"]').click();
  await page.locator('#cloudAuthDialog[open]').waitFor();
  await page.locator('#cloudAuthUseLocal').waitFor({state:'visible'});
  assert.match(await page.locator('#cloudConnectionText').textContent(),/服务连接失败/);
  assert.doesNotMatch(await page.locator('#cloudConnectionText').textContent(),/口令错误/);
  await page.locator('#cloudAuthUseLocal').click();
  assert.equal(await page.evaluate(()=>localStorage.getItem('dongjiexi:solve-mode:v1')),'local');
  assert.equal(await page.locator('#cloudOutage').isVisible(),false);
  assert.equal(await page.locator('#question').inputValue(),question);
  assert.equal(await page.locator('#sceneJson').inputValue(),scene);
  assert.equal(await page.locator('#solution').innerHTML(),solution);
  transport='ok';
  await page.locator('#solveModeToggle').click();await page.locator('[data-solve-mode="cloud"]').click();
  await page.locator('#cloudAccessKey').fill('测试课堂口令');await page.locator('#cloudLogin').click();
  await page.waitForFunction(()=>document.querySelector('#cloudConnection')?.dataset.state==='connected');
  await page.locator('#cloudAuthDialog').waitFor({state:'hidden'});
  for(const state of ['unavailable','model-unavailable','network']){
    transport=state;
    await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
    await page.locator('#cloudOutage').waitFor({state:'visible'});
    assert.match(await page.locator('#cloudOutage').innerText(),/推荐改用本机解题/);
    assert.equal(await page.evaluate(()=>localStorage.getItem('dongjiexi:solve-mode:v1')),'cloud','Do not silently change the chosen engine');
    if(state==='network')await screenshot('cloud-outage-desktop.png',null);
    transport='ok';await page.locator('#retryCloudConnection').click();
    await page.locator('#cloudOutage').waitFor({state:'hidden'});
    assert.match(await page.locator('#cloudConnectionText').textContent(),/连接成功/);
  }
  await page.evaluate(()=>window.dispatchEvent(new Event('offline')));
  await page.locator('#cloudOutage').waitFor({state:'visible'});
  assert(await page.locator('#cloudOutageShortcut').isVisible(),'The cloud warning must remain reachable when the question column is hidden');
  assert.equal(await page.locator('#engineStatus').evaluate(node=>node.classList.contains('ready')),false,'An outage must not leave a green ready indicator');
  assert.equal(await page.locator('#cloudVisionChoice').isVisible(),false,'Unavailable cloud OCR must not look ready');
  await page.evaluate(()=>window.dispatchEvent(new Event('online')));
  await page.locator('#cloudOutage').waitFor({state:'hidden'});
  transport='network';await page.evaluate(()=>window.dispatchEvent(new Event('offline')));
  await page.setViewportSize({width:390,height:844});
  await page.locator('[data-mobile-panel="board"]').click();
  assert.match(await page.locator('[data-mobile-panel="input"]').textContent(),/云端异常/,'Other mobile panels must still indicate the outage');
  await page.locator('[data-mobile-panel="input"]').click();
  assert(await page.locator('#useLocalSolver').isVisible());
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await screenshot('cloud-outage-mobile.png',null);
  assert((await page.locator('#useLocalSolver').boundingBox()).height>=44);
  transport='ok';delayHealth=true;const before=healthCalls;
  await page.locator('#retryCloudConnection').click();
  await page.waitForTimeout(50);assert(healthCalls>before);
  await page.locator('#useLocalSolver').click();
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(()=>localStorage.getItem('dongjiexi:solve-mode:v1')),'local');
  assert.match(await page.locator('#engineStatus').innerText(),/本机浏览器/,'A stale cloud response cannot overwrite the local route');
  assert.equal(await page.locator('#question').inputValue(),question);
  assert.equal(await page.locator('#sceneJson').inputValue(),scene);
  assert.equal(await page.locator('#solution').innerHTML(),solution);
  assert.equal(await page.locator('#cloudConnection').isVisible(),false);
  console.log('PASS public health checks, outages/recovery, model readiness, explicit local fallback, preserved exam draft, mobile controls and route races');
};
