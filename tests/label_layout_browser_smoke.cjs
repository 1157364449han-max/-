/* Canvas legibility regression: geometry is the oracle, label offsets are not. */
const fs = require('node:fs');
const path = require('node:path');

module.exports = async ({page, context, assert, screenshot}) => {
  // This suite never calls a model or spends the shared inference quota.
  await context.route('**/runtime-config.js', route => route.fulfill({
    contentType: 'application/javascript',
    body: 'window.DONGJIEXI_CONFIG={deployment:"web",apiEnabled:false};',
  }));
  await page.evaluate(() => {
    localStorage.setItem('dongjiexi:solve-mode:v1', 'local');
    localStorage.setItem('dongjiexi:local-workflow:v1', 'native');
  });
  await page.reload({waitUntil: 'domcontentloaded'});

  const settled = async () => {
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.waitForFunction(() => window.DongBoardLabels?.snapshot().placements.length > 0);
    return page.evaluate(() => window.DongBoardLabels.snapshot());
  };
  const overlaps = (a, b) => (
    Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 0.05 &&
    Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 0.05
  );
  const readable = async (name, expectedNames) => {
    const diagnostic = await settled();
    const box = await page.locator('#canvas').boundingBox();
    const placements = diagnostic.placements;
    for (const name of expectedNames) {
      assert(placements.some(p => p.names?.includes(name)), `Visible label missing: ${name}`);
    }
    for (const [i, item] of placements.entries()) {
      const rect = item.rect;
      assert(rect && [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite), `${name}: finite label box`);
      assert(rect.x >= -0.05 && rect.y >= -0.05 && rect.x + rect.width <= box.width + 0.05 && rect.y + rect.height <= box.height + 0.05,
        `${name}: ${item.text} must stay within the visible canvas: ${JSON.stringify(rect)}`);
      for (const other of placements.slice(i + 1)) {
        assert(!overlaps(rect, other.rect), `${name}: ${item.text} overlaps ${other.text}`);
      }
      for (const reserved of diagnostic.reserved) {
        assert(!overlaps(rect, reserved), `${name}: ${item.text} overlaps reserved axis/tick text ${JSON.stringify(reserved)}`);
      }
    }
    return diagnostic;
  };
  const geometry = async () => JSON.parse(await page.locator('#sceneJson').inputValue());
  const apply = async scene => {
    await page.locator('#sceneJson').evaluate((element, value) => {
      element.value = value;
      document.querySelector('#applyJson').click();
    }, JSON.stringify(scene));
    return settled();
  };
  const positions = diagnostic => diagnostic.placements.map(({key, text, rect, candidate, names}) => ({key, text, rect, candidate, names}));
  const group = (diagnostic, name) => diagnostic.groups.find(item => item.names.includes(name));

  // Use the original sourced examination question, not a memorized replacement.
  const additions = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/sourced-exam-additions.json'), 'utf8'));
  const question = additions.items.find(item => item.id === '2022-beijing-12');
  assert(question, 'Original Beijing 2022 Q12 fixture must exist');
  await page.locator('#question').fill(question.question);
  await page.locator('#solveButton').click();
  await page.waitForFunction(() => ['complete', 'partial'].includes(document.querySelector('#solveProgress').dataset.state));
  let scene = await geometry();
  assert.equal(scene.type, 'hyperbola');
  assert.equal(scene.orientation, 'vertical');
  assert(Math.abs(scene.a ** 2 - 1) < 1e-8 && Math.abs(scene.b ** 2 - 3) < 1e-8,
    'Label improvement must not alter independently derived m=-3');
  let diagnostic = await readable('Beijing 2022 Q12 desktop', ['F₁', 'F₂', 'A₁', 'A₂']);
  assert(diagnostic.reserved.length > 0, 'Axis/tick text must be reserved, not silently omitted from collision checks');
  await screenshot('label-layout-beijing-12-desktop.png');
  const originalGeometry = await geometry();
  await page.locator('#zoomIn').click();
  await readable('zoomed Q12 desktop', ['F₁', 'F₂']);
  await page.locator('#zoomOut').click();
  await readable('restored Q12 desktop', ['F₁', 'F₂']);
  assert.deepEqual(await geometry(), originalGeometry, 'Label avoidance/zoom must never rewrite mathematical coordinates or parameters');

  // Synthetic UI fixtures exercise names and degeneracies, not new solving rules.
  const namesScene = {
    type: 'parabola', p: 1, h: 0, k: 0, direction: 1, orientation: 'horizontal',
    showConic: true, showFeatures: true, showDynamic: false, dynamicLine: false,
    points: {}, lines: [], objects: [
      {id: 'label-prime', kind: 'point', label: 'P′', x: 0.07, y: 0.06, visible: true},
      {id: 'label-subscript', kind: 'point', label: 'P₁', x: 0.09, y: 0.07, visible: true},
      {id: 'label-prime-alias', kind: 'point', label: 'P′', x: 0.07, y: 0.06, visible: true},
      {id: 'label-draggable', kind: 'point', label: 'N', x: 1.4, y: 1.15, visible: true},
    ],
  };
  await apply(namesScene);
  diagnostic = await readable('coincident/close names desktop', ['V', 'O', 'F', 'P′', 'P₁', 'N']);
  assert(group(diagnostic, 'V').names.includes('O'), 'True coincident V/O must preserve both names in one alias group');
  assert.equal(group(diagnostic, 'P′').names.filter(name => name === 'P′').length, 1, 'Same-name same-coordinate duplicates must not print twice');
  assert.notEqual(group(diagnostic, 'P′').key, group(diagnostic, 'P₁').key,
    'Close but mathematically distinct points must not be merged merely because their screen markers touch');
  assert(Math.abs(group(diagnostic, 'P′').worldX - 0.07) < 1e-12 && Math.abs(group(diagnostic, 'P₁').worldX - 0.09) < 1e-12);
  await screenshot('label-layout-coincident-desktop.png');
  const unmodified = await geometry();
  await page.locator('#homeButton').click();
  const firstHome = await readable('home redraw 1', ['V', 'O', 'P′', 'P₁', 'N']);
  await page.locator('#homeButton').click();
  const secondHome = await readable('home redraw 2', ['V', 'O', 'P′', 'P₁', 'N']);
  assert.deepEqual(positions(secondHome), positions(firstHome), 'An unchanged redraw must not make labels jump');
  assert.deepEqual(await geometry(), unmodified, 'Label grouping must not delete any original object or alias');

  // Pan the actual canvas: screen anchors change, world geometry does not.
  await page.locator('#panMode').click();
  let box = await page.locator('#canvas').boundingBox();
  await page.mouse.move(box.x + box.width * 0.72, box.y + box.height * 0.72);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.72 + 35, box.y + box.height * 0.72 + 25, {steps: 5});
  await page.mouse.up();
  await readable('panned names', ['V', 'O', 'P′', 'P₁', 'N']);
  assert.deepEqual(await geometry(), unmodified, 'Panning/label arrangement must not change world coordinates');
  await page.locator('#homeButton').click();
  await page.locator('#moveMode').click();

  // Real point dragging must still edit only the chosen source point.
  diagnostic = await settled();
  box = await page.locator('#canvas').boundingBox();
  const n = group(diagnostic, 'N');
  await page.mouse.move(box.x + n.x, box.y + n.y);
  await page.mouse.down();
  await page.mouse.move(box.x + n.x + 25, box.y + n.y - 18, {steps: 5});
  await page.mouse.up();
  await readable('dragged user point', ['V', 'O', 'P′', 'P₁', 'N']);
  scene = await geometry();
  const dragged = scene.objects.find(item => item.id === 'label-draggable');
  assert(Math.hypot(dragged.x - 1.4, dragged.y - 1.15) > 0.01, 'N must remain draggable after label integration');
  for (const item of namesScene.objects.filter(item => item.id !== 'label-draggable')) {
    const current = scene.objects.find(object => object.id === item.id);
    assert.equal(current.x, item.x, `${item.label}: dragging N must not relocate other points to avoid labels`);
    assert.equal(current.y, item.y);
  }
  assert.equal(scene.p, 1);
  assert.equal(scene.h, 0);
  assert.equal(scene.k, 0);

  // The same scene must remain legible at both common and narrow mobile sizes.
  const draggedGeometry = await geometry();
  for (const width of [390, 320]) {
    await page.setViewportSize({width, height: 844});
    await page.locator('[data-mobile-panel="board"]').click();
    await page.locator('#homeButton').click();
    await readable(`mobile ${width}`, ['V', 'O', 'F', 'P′', 'P₁', 'N']);
    assert.deepEqual(await geometry(), draggedGeometry, 'Responsive layout must not change geometry');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Board must not overflow the mobile page');
    await screenshot(`label-layout-mobile-${width}.png`, null);
    await page.locator('#zoomIn').click();
    await readable(`mobile ${width} zoom`, ['V', 'O', 'F', 'P′', 'P₁', 'N']);
    await page.locator('#zoomOut').click();
    await readable(`mobile ${width} zoom restored`, ['V', 'O', 'F', 'P′', 'P₁', 'N']);
  }
  await page.setViewportSize({width: 1600, height: 1050});
  await page.locator('#homeButton').click();
  const restored = await readable('desktop after mobile', ['V', 'O', 'F', 'P′', 'P₁', 'N']);
  await page.locator('#homeButton').click();
  assert.deepEqual(positions(await settled()), positions(restored), 'Responsive round-trip must retain stable redraws');
  assert.deepEqual(await geometry(), draggedGeometry);

  // CSS-space collision boxes must also be correct on a high-density touch screen.
  const desktopPage = page;
  const denseContext = await context.browser().newContext({
    viewport: {width: 390, height: 844}, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  });
  try {
    await denseContext.route('**/runtime-config.js', route => route.fulfill({
      contentType: 'application/javascript',
      body: 'window.DONGJIEXI_CONFIG={deployment:"web",apiEnabled:false};',
    }));
    await denseContext.addInitScript(() => {
      localStorage.setItem('dongjiexi:solve-mode:v1', 'local');
      localStorage.setItem('dongjiexi:local-workflow:v1', 'native');
    });
    page = await denseContext.newPage();
    const denseErrors = [];
    page.on('pageerror', error => denseErrors.push(error.message));
    await page.goto(desktopPage.url(), {waitUntil: 'domcontentloaded'});
    await page.locator('[data-mobile-panel="board"]').click();
    await apply(namesScene);
    await readable('DPR2 touch mobile', ['V', 'O', 'F', 'P′', 'P₁', 'N']);
    assert.equal(await page.evaluate(() => devicePixelRatio), 2);
    assert(Math.abs(await page.locator('#canvas').evaluate(element => element.width / element.getBoundingClientRect().width) - 2) < 0.01,
      'Backing canvas must use device pixels while label boxes remain in CSS pixels');
    assert.deepEqual(denseErrors, [], 'High-DPR touch labels must not trigger browser errors');
  } finally {
    page = desktopPage;
    await denseContext.close();
  }
  console.log('PASS: sourced Q12 labels avoid axis ticks; exact aliases grouped without deleting points; close prime/subscript names survive; stable zoom/pan/drag, 390/320 mobile and DPR2 touch layouts.');
};
