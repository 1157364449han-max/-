module.exports = async ({page, context, assert}) => {
  const manifest = await page.locator('link[rel="manifest"]').getAttribute('href');
  assert.equal(manifest, 'manifest.webmanifest');
  const response = await page.request.get(new URL('manifest.webmanifest', page.url()).href);
  assert.equal(response.status(), 200);
  await page.waitForFunction(() => navigator.serviceWorker?.controller, null, {timeout: 15000});
  const registration = await page.evaluate(async () => {
    const item = await navigator.serviceWorker.ready;
    return {scope: item.scope, controlled: !!navigator.serviceWorker.controller};
  });
  assert.equal(registration.controlled, true);

  await context.setOffline(true);
  await page.reload({waitUntil: 'domcontentloaded'});
  assert.match(await page.title(), /董解析/);
  await page.locator('#question').fill('椭圆 C：x²/4+y²=1。');
  await page.locator('#parseButton').click();
  await page.locator('#scenePreviewDialog').waitFor({state: 'visible'});
  await page.locator('#confirmScenePreview').click();
  await page.waitForFunction(() => /确认并绘图/.test(document.querySelector('#status')?.textContent || ''));
  assert.match(await page.locator('#status').textContent(), /确认并绘图/);
  assert.equal(JSON.parse(await page.locator('#sceneJson').inputValue()).type, 'ellipse');
  await context.setOffline(false);

  await page.evaluate(async () => {
    for (const item of await navigator.serviceWorker.getRegistrations()) await item.unregister();
    for (const key of await caches.keys()) await caches.delete(key);
  });
  await context.route('**/runtime-config.js', route => route.fulfill({
    contentType: 'application/javascript',
    body: `window.DONGJIEXI_CONFIG=Object.freeze({version:'0.12.0',deployment:'web',apiBase:'',apiEnabled:false,requiresAuth:false,updateChannel:'stable'});`
  }));
  await page.reload({waitUntil: 'domcontentloaded'});
  await page.waitForFunction(() => navigator.serviceWorker?.controller, null, {timeout: 15000});
  await context.setOffline(true);
  await page.reload({waitUntil: 'domcontentloaded'});
  const offlineWeb = await page.evaluate(() => window.DongRuntime?.config);
  assert.equal(offlineWeb.deployment, 'web');
  assert.equal(offlineWeb.apiEnabled, false);
  assert.match(await page.locator('#engineStatus').textContent(), /内置解题.*已就绪/);
  await context.setOffline(false);

  await context.unroute('**/runtime-config.js');
  await context.route('**/runtime-config.js', route => route.fulfill({
    status: 503,
    contentType: 'text/plain',
    body: 'temporary deployment configuration outage'
  }));
  await page.reload({waitUntil: 'domcontentloaded'});
  const degradedWeb = await page.evaluate(() => window.DongRuntime?.config);
  assert.equal(degradedWeb.deployment, 'web');
  assert.equal(degradedWeb.apiEnabled, false);
  assert.match(await page.locator('#engineStatus').textContent(), /内置解题.*已就绪/);
  console.log('PASS: installable PWA, controlled service worker, offline reload and offline standard-equation board.');
};
