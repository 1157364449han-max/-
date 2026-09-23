const QUESTION = `已知抛物线 C：y²=4x，点 P(1,0) 在抛物线 C 的内部。过点 P 的直线 l 与抛物线 C 交于 A、B 两点，且 A、B 不与 P 重合。分别作抛物线 C 在 A、B 两点处的切线，两条切线交于点 Q，弦 AB 的中点为 M。

（1）证明：抛物线在 A、B 两点处的切线互相垂直。

（2）求点 Q 的轨迹，并说明点 Q 的轨迹与点 P 的位置关系。

（3）求点 M 的轨迹方程。

（4）若直线 l 的斜率为 1，求△PAB 的面积。`;

module.exports = async ({page, context, assert, screenshot}) => {
  const solve = async () => {
    await page.locator('#question').fill(QUESTION);
    await page.locator('#solveButton').click();
    await page.waitForFunction(() => !document.querySelector('#solveButton')?.disabled);
    await page.locator('[data-study-part="all"]').click();
    const solutionText = await page.locator('#solution').innerText();
    assert.match(solutionText, /面积为 0/, `四问解答未完整呈现：${solutionText}`);
    return JSON.parse(await page.locator('#sceneJson').inputValue());
  };
  const contract = scene => ({
    focusChord: scene.focusChord,
    tangents: scene.lines.filter(line => line.role === 'dynamic_tangent').map(line => ({
      id: line.id, refs: line.refs, point: line.point, construction: line.construction,
    })),
    qLocus: scene.lines.find(line => line.id === scene.focusChord.qLocus),
    midpointLocus: scene.objects.find(item => item.id === scene.focusChord.mLocus),
  });

  let scene = await solve();
  assert.equal(scene.type, 'parabola');
  assert.equal(scene.dynamicLine, true);
  assert.equal(scene.dynamicLinePart, null, '题干定义的动直线必须在四个小问中全局显示');
  assert.equal(scene.theta, 45, '斜率为 1 的小问应给出可直接观察的初始位置');
  assert.equal(scene.focusChord.schema, 'dongjiexi-focus-chord/v1');
  assert.deepEqual(scene.focusChord.endpoints, ['A', 'B']);
  assert.equal(scene.lines.filter(line => line.role === 'dynamic_tangent').length, 2);
  assert.equal(scene.lines.find(line => line.id === scene.focusChord.qLocus).equation, 'x+1=0');
  assert.equal(scene.objects.find(item => item.id === scene.focusChord.mLocus).equation, 'y²=2(x-1)');
  assert.match(await page.locator('#layers').innerText(), /A 点切线 · 推导/);
  assert.match(await page.locator('#layers').innerText(), /B 点切线 · 推导/);
  assert.match(await page.locator('#layers').innerText(), /Q · 推导/);
  assert.match(await page.locator('#layers').innerText(), /M · 推导/);
  assert.match(await page.locator('#metrics').innerText(), /Q（两切线交点）/);
  assert.match(await page.locator('#metrics').innerText(), /两切线方向点积/);
  assert.match(await page.locator('#solution').innerText(), /4\s*\/\s*4|已完成\s*4/);

  const motion = await page.evaluate(sceneData => {
    const model = structuredClone(sceneData), theta = {value: 45};
    const q = {A: 0, B: 0, C: 1, D: -4, E: 0, F: 0};
    const origin = () => ({x: 1, y: 0});
    const dynamic = () => {
      const t = theta.value * Math.PI / 180;
      return {type: 'line', o: origin(), d: {x: Math.cos(t), y: Math.sin(t)}};
    };
    const conic = {type: 'conic', q};
    const features = () => {
      const result = Object.entries(model.points || {}).map(([name, [x, y]]) => ({name, x, y}));
      window.DongConstruct.intersect(dynamic(), conic).forEach((point, index) => result.push({...point, name: index ? 'B' : 'A'}));
      return result;
    };
    const engine = window.DongConstruct.createEngine({
      model: () => model, features, coeffs: () => q, origin,
      angle: () => theta.value, conicPoint: () => null, conicProject: () => null,
    });
    const sample = angle => {
      theta.value = angle;
      const a = features().find(point => point.name === 'A');
      const b = features().find(point => point.name === 'B');
      const ta = engine.resolve(model.focusChord.tangents[0]);
      const tb = engine.resolve(model.focusChord.tangents[1]);
      const intersection = engine.resolve(model.focusChord.intersection);
      const midpoint = engine.resolve(model.focusChord.midpoint);
      const lineResidual = (line, point) => (point.x-line.o.x)*line.d.y-(point.y-line.o.y)*line.d.x;
      return {
        a, b, intersection, midpoint,
        tangentResiduals: [lineResidual(ta, a), lineResidual(tb, b)],
        tangentDot: ta.d.x*tb.d.x+ta.d.y*tb.d.y,
        qLocusResidual: intersection.x + 1,
        mLocusResidual: midpoint.y**2 - 2*(midpoint.x-1),
      };
    };
    return [sample(45), sample(70)];
  }, scene);
  assert.notDeepEqual(motion[0].a, motion[1].a, '转动 l 后交点 A 必须移动');
  for (const sample of motion) {
    assert(sample.tangentResiduals.every(value => Math.abs(value) < 1e-8), '每条切线必须实时经过对应交点');
    assert(Math.abs(sample.tangentDot) < 1e-8, '两条实时切线必须保持垂直');
    assert(Math.abs(sample.qLocusResidual) < 1e-8, 'Q 必须始终位于准线 x=-1');
    assert(Math.abs(sample.mLocusResidual) < 1e-8, 'M 必须始终位于 y²=2(x-1)');
  }

  const before = await page.locator('.board-shell').boundingBox();
  await page.locator('#inputPanelToggle').click();
  assert.equal(await page.locator('.workspace').evaluate(node => node.classList.contains('input-collapsed')), true);
  assert.equal(await page.locator('#inputPanelToggle').innerText(), '显示题目栏');
  const after = await page.locator('.board-shell').boundingBox();
  assert(after.width > before.width, '隐藏题目栏后画板应获得更多横向空间');
  await screenshot('focus-chord-wide-board.png', '.workspace');
  await page.locator('#inputPanelToggle').click();

  const online = contract(scene);
  await page.evaluate(async () => {
    for (const item of await navigator.serviceWorker.getRegistrations()) await item.unregister();
    for (const key of await caches.keys()) await caches.delete(key);
  });
  await context.route('**/runtime-config.js', route => route.fulfill({
    contentType: 'application/javascript',
    body: `window.DONGJIEXI_CONFIG=Object.freeze({version:'0.22.0',deployment:'web',apiBase:'',apiEnabled:false,requiresAuth:false,updateChannel:'stable'});`,
  }));
  await page.reload({waitUntil: 'domcontentloaded'});
  scene = await solve();
  assert.deepEqual(contract(scene), online, '在线接口不可用时，浏览器内置引擎也必须生成同一动态构造契约');
  assert.match(await page.locator('#solution').innerText(), /抛物线在 A、B 两点处的切线互相垂直/);
  assert.match(await page.locator('#solution').innerText(), /点 Q 的轨迹为 x=-1/);
  assert.match(await page.locator('#solution').innerText(), /点 M 的轨迹方程为 y²=2\(x-1\)/);
  await context.unroute('**/runtime-config.js');
  console.log('PASS: complete focus-chord theorem scene, live tangents, Q/M loci, offline parity, and collapsible input layout.');
};
