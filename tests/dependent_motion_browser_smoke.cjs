module.exports = async ({page, assert}) => {
  await page.locator('#question').fill('已知椭圆x²/9+y²/4=1，点P为椭圆上的动点，M为线段PF₁的中点，连接PM。');
  await page.locator('#solveButton').click();
  await page.waitForFunction(() => {
    try { return JSON.parse(document.querySelector('#sceneJson').value).objects?.some(item => item.label === 'M'); }
    catch { return false; }
  });
  const scene = JSON.parse(await page.locator('#sceneJson').inputValue());
  const moving = scene.objects.find(item => item.label === 'P');
  const midpoint = scene.objects.find(item => item.label === 'M');
  assert.equal(moving.op, 'point_on');
  assert.equal(midpoint.op, 'midpoint');
  assert.deepEqual(midpoint.refs, [moving.id, 'feature:F₁']);
  assert(scene.lines.some(line => line.a === 'P' && line.b === 'M'));

  const positions = await page.evaluate(sceneData => {
    const model = structuredClone(sceneData);
    const values = {a:model.a,b:model.b,h:model.h||0,k:model.k||0};
    const features = () => [{name:'F₁',x:-Math.sqrt(values.a ** 2-values.b ** 2),y:0}];
    const conicPoint = t => ({x:values.h+values.a*Math.cos(t),y:values.k+values.b*Math.sin(t)});
    const engine = window.DongConstruct.createEngine({
      model:()=>model, features, coeffs:()=>({A:1/9,B:0,C:1/4,D:0,E:0,F:-1}),
      origin:()=>({x:0,y:0}), angle:()=>0, conicPoint, conicProject:()=>({t:0})
    });
    const point = model.objects.find(item => item.label === 'P');
    const middle = model.objects.find(item => item.label === 'M');
    const before = engine.resolve(middle.id);
    point.t = Math.PI / 2;
    const after = engine.resolve(middle.id);
    return {before, after};
  }, scene);
  assert.notDeepEqual(positions.before, positions.after, '源动点变化后，中点必须由依赖图自动重算');
  assert(Math.abs(positions.after.x + Math.sqrt(5) / 2) < 1e-8);
  assert(Math.abs(positions.after.y - 1) < 1e-8);
  const pointTBefore = scene.objects.find(item => item.label === 'P').t;
  assert.equal(await page.locator('#motionPlay').isEnabled(), true);
  await page.locator('#motionPlay').click();
  await page.waitForTimeout(240);
  await page.locator('#motionPlay').click();
  const animatedPointScene = JSON.parse(await page.locator('#sceneJson').inputValue());
  assert.notEqual(animatedPointScene.objects.find(item => item.label === 'P').t, pointTBefore);
  assert.equal(await page.locator('#motionPlay').getAttribute('aria-pressed'), 'false');

  await page.locator('#question').fill('椭圆x²/9+y²/4=1，过右焦点的动直线l与椭圆交于A、B，M为AB的中点，连接OM。');
  await page.locator('#solveButton').click();
  await page.waitForFunction(() => {
    try { const scene=JSON.parse(document.querySelector('#sceneJson').value);return scene.showDynamic===true&&scene.lineThrough==='focus2'&&scene.objects?.some(item=>item.label==='M'&&item.refs?.includes('feature:A')); }
    catch { return false; }
  });
  const lineScene = JSON.parse(await page.locator('#sceneJson').inputValue());
  const lineMiddle = lineScene.objects.find(item => item.label === 'M');
  assert.equal(lineScene.showDynamic, true);
  assert.equal(lineScene.lineThrough, 'focus2');
  assert.deepEqual(lineMiddle.refs, ['feature:A', 'feature:B']);
  assert(lineScene.lines.some(line => line.a === 'O' && line.b === 'M'));
  const linePositions = await page.evaluate(sceneData => {
    const model=structuredClone(sceneData),c=Math.sqrt(model.a**2-model.b**2);let vertical=false;
    const features=()=>vertical
      ?[{name:'A',x:c,y:-4/3},{name:'B',x:c,y:4/3},{name:'O',x:0,y:0}]
      :[{name:'A',x:-3,y:0},{name:'B',x:3,y:0},{name:'O',x:0,y:0}];
    const engine=window.DongConstruct.createEngine({model:()=>model,features,coeffs:()=>({A:1/9,B:0,C:1/4,D:0,E:0,F:-1}),origin:()=>({x:c,y:0}),angle:()=>vertical?90:0,conicPoint:()=>null,conicProject:()=>null});
    const id=model.objects.find(item=>item.label==='M').id,before=engine.resolve(id);vertical=true;const after=engine.resolve(id);return{before,after};
  },lineScene);
  assert(Math.abs(linePositions.before.x)<1e-9);
  assert(Math.abs(linePositions.after.x-Math.sqrt(5))<1e-9, '动直线旋转后，弦中点必须同步移动');
  const thetaBefore=lineScene.theta;
  await page.locator('#motionPlay').click();
  await page.waitForTimeout(240);
  await page.locator('#motionPlay').click();
  const animatedLineScene=JSON.parse(await page.locator('#sceneJson').inputValue());
  assert.notEqual(animatedLineScene.theta,thetaBefore);

  await page.route('**/api/solve', route => route.abort('failed'));
  await page.locator('#question').fill('已知椭圆x²/9+y²/4=1，点P为椭圆上的动点，M为线段PF₁的中点，连接PM。');
  await page.locator('#parseButton').click();
  await page.locator('#scenePreviewDialog').waitFor({state:'visible'});
  const offline = JSON.parse(await page.locator('#scenePreviewJson').inputValue());
  assert.equal(offline.objects.find(item => item.label === 'P').op, 'point_on');
  assert.equal(offline.objects.find(item => item.label === 'M').op, 'midpoint');
  assert(offline.lines.some(line => line.a === 'P' && line.b === 'M'));
  assert.equal(offline.showDynamic, false, '只有动点时不应凭空添加无关动直线');
  await page.locator('#cancelScenePreview').click();
  await page.unroute('**/api/solve');
  console.log('PASS: question motion creates point-on-conic, midpoint and linked-segment dependencies that recompute together.');
};
