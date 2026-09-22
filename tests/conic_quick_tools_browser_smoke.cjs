module.exports = async ({page, assert, screenshot}) => {
  assert.equal(await page.locator('.controls [data-quick-conic]').count(), 4);
  assert.equal(await page.locator('.native-toolbar [data-add-conic]').count(), 4);

  for (const type of ['ellipse', 'hyperbola', 'parabola', 'circle']) {
    await page.locator(`.controls [data-quick-conic="${type}"]`).click();
    const scene = JSON.parse(await page.locator('#sceneJson').inputValue());
    assert.equal(scene.type, type, `一键新建应得到 ${type}`);
    assert.equal(scene.showConic, true);
    assert.equal(scene.showDynamic, false);
    assert.match(await page.locator('#status').innerText(), /无需题目或 AI/);
  }

  await page.locator('#advancedEquation').evaluate(element => element.open = true);
  await page.locator('#objectType').selectOption('ellipse');
  await page.locator('#objectInput').fill('x²/9+y²/4=1');
  await page.locator('#objectName').fill('C₂');
  await page.locator('#addObject').click();
  await page.locator('#objectType').selectOption('hyperbola');
  await page.locator('#objectInput').fill('x²/16−y²/9=1');
  await page.locator('#addObject').click();
  await page.locator('#objectType').selectOption('parabola');
  await page.locator('#objectInput').fill('y²=8x');
  await page.locator('#addObject').click();
  let scene = JSON.parse(await page.locator('#sceneJson').inputValue());
  const conics = scene.objects.filter(object => object.kind === 'conic');
  assert.deepEqual(conics.map(object => object.conicType), ['ellipse', 'hyperbola', 'parabola']);
  assert.equal(conics[0].label, 'C₂');
  assert.equal(await page.locator('#layers .layer-row').filter({hasText: 'C₂'}).count(), 1);

  await page.route('**/api/solve', route => route.abort('failed'));
  await page.locator('#question').fill('椭圆 C：(x-2)²/16+(y+1)²/9=1。');
  await page.locator('#parseButton').click();
  await page.locator('#scenePreviewDialog').waitFor({state: 'visible'});
  assert.match(await page.locator('#scenePreviewSummary').innerText(), /\(2, -1\)/);
  await page.locator('#confirmScenePreview').click();
  scene = JSON.parse(await page.locator('#sceneJson').inputValue());
  assert.equal(scene.type, 'ellipse');
  assert.equal(scene.h, 2);
  assert.equal(scene.k, -1);
  assert.equal(scene.a, 4);
  assert.equal(scene.b, 3);

  await page.locator('#question').fill('椭圆 C：x²/a²+y²/b²=1（a>b>0）的离心率 e=1/2，且过点 P（1，3/2）。求椭圆 C 的标准方程。');
  await page.locator('#parseButton').click();
  await page.waitForTimeout(250);
  if (!await page.locator('#scenePreviewDialog').evaluate(element => element.open)) throw new Error('离线条件椭圆未进入确认：' + await page.locator('#status').innerText());
  await page.locator('#scenePreviewDialog').waitFor({state: 'visible'});
  assert.match(await page.locator('#scenePreviewSummary').innerText(), /由题设条件反推/);
  await page.locator('#confirmScenePreview').click();
  scene = JSON.parse(await page.locator('#sceneJson').inputValue());
  assert.equal(scene.type, 'ellipse');
  assert(Math.abs(scene.a - 2) < 1e-9);
  assert(Math.abs(scene.b - Math.sqrt(3)) < 1e-9);

  await page.locator('#question').fill('已知圆心为 O(1,-2)，且圆过点 P(4,2)，求圆的方程并绘图。');
  await page.locator('#parseButton').click();
  await page.locator('#scenePreviewDialog').waitFor({state: 'visible'});
  await page.locator('#confirmScenePreview').click();
  scene = JSON.parse(await page.locator('#sceneJson').inputValue());
  assert.equal(scene.type, 'circle');
  assert.equal(scene.r, 5);

  await page.locator('#question').fill('已知抛物线的顶点为 V(1,2)，焦点为 F(3,2)，求抛物线的标准方程。');
  await page.locator('#parseButton').click();
  await page.locator('#scenePreviewDialog').waitFor({state: 'visible'});
  await page.locator('#confirmScenePreview').click();
  scene = JSON.parse(await page.locator('#sceneJson').inputValue());
  assert.equal(scene.type, 'parabola');
  assert.equal(scene.p, 2);
  assert.equal(scene.orientation, 'horizontal');
  await page.unroute('**/api/solve');

  await screenshot('conic-quick-tools.png', null);
  console.log('PASS: one-click conics, multiple free conics, translated forms and condition-derived ellipse/circle/parabola offline.');
};
