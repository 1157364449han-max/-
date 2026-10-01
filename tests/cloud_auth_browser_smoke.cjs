module.exports = async ({page, context, assert}) => {
  await page.evaluate(async () => {
    for (const item of await navigator.serviceWorker.getRegistrations()) await item.unregister();
    for (const key of await caches.keys()) await caches.delete(key);
  });
  let authorizedHealth = false, transport = 'ok', sessions=0;
  await context.route('**/runtime-config.js', route => route.fulfill({
    contentType: 'application/javascript',
    body: `window.DONGJIEXI_CONFIG=Object.freeze({version:'0.12.0',deployment:'web',apiBase:'',apiEnabled:true,requiresAuth:true,updateChannel:'stable'});`
  }));
  await context.route('**/api/session', async route => {
    sessions++;
    if(transport==='network')return route.abort('failed');
    if(transport==='unavailable')return route.fulfill({status:503,contentType:'text/html',body:'Unavailable'});
    const body = route.request().postDataJSON();
    if (body.access_key !== '课堂口令') return route.fulfill({status: 401, contentType: 'application/json', body: JSON.stringify({error: '访问口令不正确。'})});
    return route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({token: 'short-lived-test-token', expires_in: 600})});
  });
  await context.route('**/api/health', route => {
    authorizedHealth = route.request().headers().authorization === 'Bearer short-lived-test-token';
    return route.fulfill({status: authorizedHealth ? 200 : 401, contentType: 'application/json', body: JSON.stringify(authorizedHealth ? {
      app: '董解析', version: '0.12.0', default_model: 'qwen3.5:4b',
      engine: {available: true, installed: true, remote: true, models: ['qwen3.5:4b']}
    } : {error: '在线解题授权已失效。'})});
  });
  await page.reload({waitUntil: 'domcontentloaded'});
  await page.locator('#solveModeToggle').click();
  await page.locator('[data-solve-mode="cloud"]').click();
  await page.locator('#cloudAuthDialog[open]').waitFor();
  await page.waitForFunction(() => document.querySelector('#engineStatus')?.textContent.includes('需要授权'));
  assert.equal(await page.locator('#cloudAccessKey').getAttribute('type'),'text','文本输入模式让安卓中文输入法可以输入中文口令');
  assert.equal(await page.locator('#cloudAccessKey').getAttribute('inputmode'),'text');
  await page.locator('#cloudAccessKey').fill('课堂口令');
  const beforeComposition=sessions;
  await page.locator('#cloudAccessKey').dispatchEvent('keydown',{key:'Enter',isComposing:true});
  await page.waitForTimeout(100);
  assert.equal(sessions,beforeComposition,'中文输入法正在选词时 Enter 不应发起验证');
  for(const mode of ['network','unavailable']){
    transport=mode;await page.locator('#cloudLogin').click();
    await page.waitForFunction(()=>document.querySelector('#cloudAuthFeedback')?.dataset.state==='error');
    assert.match(await page.locator('#cloudConnectionText').textContent(),/服务连接失败.*口令尚未验证/);
    assert.doesNotMatch(await page.locator('#cloudConnectionText').textContent(),/口令错误|会话失效/);
  }
  transport='ok';
  await page.locator('#cloudAccessKey').fill('错误口令');
  await page.locator('#cloudLogin').click();
  await page.waitForFunction(() => document.querySelector('#cloudAuthFeedback')?.textContent.includes('不正确'));
  assert.equal(await page.locator('#cloudAuthFeedback').getAttribute('data-state'),'error');
  assert.match(await page.locator('#cloudConnectionText').textContent(),/口令错误|会话失效/);
  await page.locator('#cloudAccessKey').fill('　 课堂口令 \n');
  await page.locator('#cloudLogin').click();
  await page.waitForFunction(() => document.querySelector('#engineStatus')?.textContent.includes('云端 AI 已就绪'));
  assert.equal(authorizedHealth, true);
  assert.equal(await page.locator('#solveButton').isDisabled(), false);
  assert.match(await page.locator('#cloudConnectionText').textContent(),/连接成功/);
  assert.equal(await page.locator('#cloudConnection').getAttribute('data-state'),'connected');
  assert.equal(await page.evaluate(() => JSON.parse(sessionStorage.getItem('dongjiexi:cloud-session')).token), 'short-lived-test-token');
  console.log('PASS: cloud selection opens authentication, Chinese access keys remain enterable, errors are explicit, and success persists as connection status.');
};
