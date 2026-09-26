module.exports = async ({page, assert, screenshot}) => {
  const workflow = page.locator('.workflow-step');
  assert.equal(await workflow.count(), 3);

  const desktop = await page.evaluate(() => {
    const rect = selector => {
      const box = document.querySelector(selector).getBoundingClientRect();
      return {x: box.x, y: box.y, width: box.width, height: box.height};
    };
    return {
      controls: rect('.controls'),
      inspect: rect('.inspect'),
      board: rect('.board-shell'),
      solve: rect('#solveButton'),
      parse: rect('#parseButton'),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  assert(desktop.controls.x < desktop.inspect.x, '题目输入应位于解析区左侧');
  assert(desktop.inspect.x < desktop.board.x, '解析区应位于画板左侧');
  assert(desktop.board.width >= 560, 'PC 画板应保留足够展示宽度');
  assert(desktop.solve.x < desktop.parse.x, '整题解答应为首要动作');
  assert(desktop.overflow <= 1, 'PC 页面不应横向溢出');

  await page.locator('#question').fill('椭圆 C：(x-1)²/9+(y+2)²/4=1，过右焦点的直线 l 与 C 交于 A、B。');
  await page.locator('#parseButton').click();
  await page.locator('#scenePreviewDialog').waitFor({state: 'visible'});
  assert.equal(await page.locator('#scenePreviewDialog').getAttribute('aria-labelledby'), 'scenePreviewTitle');
  assert.equal(await page.locator('#scenePreviewDialog').getAttribute('aria-describedby'), 'scenePreviewHelp');
  assert.equal(await page.locator('#scenePreviewSummary').getAttribute('aria-live'), 'polite');
  const preview = await page.locator('#scenePreviewSummary').innerText();
  assert.match(preview, /椭圆/);
  assert.match(preview, /\(1, -2\)/);
  assert.match(preview, /右焦点/);
  await page.locator('#previewH').fill('2');
  await page.locator('#previewK').fill('-1');
  await page.locator('#previewPoints').fill('P, 0, 0');
  await page.locator('#previewLines').fill('t: y=x+1');
  await page.locator('#previewLineThrough').selectOption('point');
  await page.waitForFunction(() => document.querySelector('#previewThroughPoint')?.value === 'P');
  assert.match(await page.locator('#scenePreviewSummary').innerText(), /点 1 个 · 直线 1 条/);
  await screenshot('recognition-preview.png', '#scenePreviewDialog');
  await page.locator('#confirmScenePreview').click();
  await page.waitForFunction(() => /确认并绘图/.test(document.querySelector('#status')?.textContent || ''));
  const scene = JSON.parse(await page.locator('#sceneJson').inputValue());
  assert.equal(scene.type, 'ellipse');
  assert.equal(scene.h, 2);
  assert.equal(scene.k, -1);
  assert.equal(scene.lineThrough, 'point:P');
  assert.deepEqual(scene.points.P, [0, 0]);
  assert.equal(scene.lines[0].label, 't');

  await page.locator('#toolboxToggle').click();
  assert.equal(await page.locator('.board-shell').evaluate(element => element.classList.contains('toolbox-collapsed')), false);
  assert.equal(await page.locator('#toolboxToggle').getAttribute('aria-expanded'), 'true');
  await page.locator('#toolboxToggle').click();
  await screenshot('desktop-workbench.png', null);

  await page.setViewportSize({width: 390, height: 844});
  await page.waitForTimeout(150);
  const mobile = await page.evaluate(() => {
    const top = selector => document.querySelector(selector).getBoundingClientRect().top + window.scrollY;
    return {
      controls: top('.controls'),
      board: top('.board-shell'),
      inspect: top('.inspect'),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  assert(mobile.controls < mobile.board, '手机端应先显示题目输入');
  assert(mobile.board < mobile.inspect, '手机端应在解析检验区之前显示画板');
  assert(mobile.overflow <= 1, '手机端不应横向溢出');
  await screenshot('mobile-workbench.png', null);
  console.log('PASS: desktop workbench hierarchy, recognition confirmation, toolbox and mobile flow.');
};
