module.exports = async ({page, context, assert}) => {
  await page.evaluate(async () => {
    for (const item of await navigator.serviceWorker.getRegistrations()) await item.unregister();
    for (const key of await caches.keys()) await caches.delete(key);
  });
  let authorizedHealth = false;
  await context.route('**/runtime-config.js', route => route.fulfill({
    contentType: 'application/javascript',
    body: `window.DONGJIEXI_CONFIG=Object.freeze({version:'0.12.0',deployment:'web',apiBase:'',apiEnabled:true,requiresAuth:true,updateChannel:'stable'});`
  }));
  await context.route('**/api/session', async route => {
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
  await page.waitForFunction(() => document.querySelector('#engineStatus')?.textContent.includes('需要授权'));
  assert.equal(await page.locator('#solveButton').isDisabled(), true);
  await page.locator('#cloudAccessKey').fill('课堂口令');
  await page.locator('#cloudLogin').click();
  await page.waitForFunction(() => document.querySelector('#engineStatus')?.textContent.includes('在线 AI 已就绪'));
  assert.equal(authorizedHealth, true);
  assert.equal(await page.locator('#solveButton').isDisabled(), false);
  assert.equal(await page.evaluate(() => JSON.parse(sessionStorage.getItem('dongjiexi:cloud-session')).token), 'short-lived-test-token');
  console.log('PASS: cloud access key exchanges for a short-lived session and authenticated health request.');
};
