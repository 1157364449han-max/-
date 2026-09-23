module.exports = async ({page, context, assert}) => {
  let jobRequests = 0;
  page.on('request', request => { if (request.url().includes('/api/jobs')) jobRequests++; });
  await page.locator('#question').fill('已知椭圆 C 的离心率 e=1/2，且过点 P(1,3/2)，求椭圆 C 的标准方程。');
  await page.locator('#solveButton').click();
  await page.waitForFunction(() => document.querySelector('#solution')?.textContent.includes('董解析内置确定性解答'));
  assert.match(await page.locator('#solution').innerText(), /逐问作答：1 \/ 1/);
  assert.match(await page.locator('#solution').innerText(), /x²\/4\+y²\/3=1/);
  let scene = JSON.parse(await page.locator('#sceneJson').inputValue());
  assert.equal(scene.type, 'ellipse');
  assert.equal(scene.exact.a2, '4');
  assert.equal(scene.exact.b2, '3');
  assert.equal(jobRequests, 0, '已覆盖题型不应调用或要求下载大模型');

  await page.locator('#question').fill('已知椭圆x²/4+y²/3=1，求焦点坐标、离心率和准线方程。');
  await page.locator('#solveButton').click();
  await page.waitForFunction(() => document.querySelector('#solution')?.textContent.includes('准线：x=-4 或 4'));
  const featureText = await page.locator('#solution').innerText();
  assert.match(featureText, /焦点：\(-1,0\)，\(1,0\)/);
  assert.match(featureText, /离心率 e=1\/2/);
  assert.equal(jobRequests, 0, '特征量问题不应被准线“方程”字样误导并调用模型');

  await page.locator('#question').fill('已知圆 C：x²+y²=9，直线 l：y=0 与圆交于 A、B，求弦长 AB。');
  await page.locator('#solveButton').click();
  await page.waitForFunction(() => document.querySelector('#solution')?.textContent.includes('|AB|=6'));
  assert.match(await page.locator('#solution').innerText(), /弦长 \|AB\|=6/);
  scene = JSON.parse(await page.locator('#sceneJson').inputValue());
  assert.equal(scene.lines.some(line => line.m === 0 && line.b === 0), true);

  await page.evaluate(async () => {
    for (const item of await navigator.serviceWorker.getRegistrations()) await item.unregister();
    for (const key of await caches.keys()) await caches.delete(key);
  });
  await context.route('**/runtime-config.js', route => route.fulfill({
    contentType:'application/javascript',
    body:`window.DONGJIEXI_CONFIG=Object.freeze({version:'0.23.1',deployment:'web',apiBase:'',apiEnabled:false,requiresAuth:false,updateChannel:'stable'});`
  }));
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#question').fill('已知抛物线的顶点为 V(1,2)，焦点为 F(3,2)，求抛物线的标准方程。');
  await page.locator('#solveButton').click();
  await page.waitForFunction(() => document.querySelector('#solution')?.textContent.includes('董解析浏览器内置解答'));
  assert.match(await page.locator('#solution').innerText(), /逐问作答：1 \/ 1/);
  scene = JSON.parse(await page.locator('#sceneJson').inputValue());
  assert.equal(scene.type, 'parabola');
  assert.equal(scene.h, 1);
  assert.equal(scene.k, 2);
  assert.equal(scene.p, 2);
  assert.match(await page.locator('#engineStatus').innerText(), /内置解题.*已就绪/);
  console.log('PASS: one-stop deterministic solve, exact scene reuse, no model job for covered questions, and browser-only web fallback.');
};
