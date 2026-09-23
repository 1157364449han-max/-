module.exports = async ({page, context, assert, screenshot, errors}) => {
  await page.evaluate(async()=>{for(const sw of await navigator.serviceWorker.getRegistrations())await sw.unregister();for(const key of await caches.keys())await caches.delete(key);});
  await context.route('**/runtime-config.js',route=>route.fulfill({contentType:'application/javascript',body:`window.DONGJIEXI_CONFIG=Object.freeze({version:'0.22.0',deployment:'web',apiBase:'',apiEnabled:false,requiresAuth:false});`}));
  await page.reload({waitUntil:'domcontentloaded'});
  assert.equal(await page.evaluate(()=>window.DongRuntime.config.apiEnabled),false,'整套作图在无解题服务的纯 Web 模式验证');
  const scene = async () => JSON.parse(await page.locator('#sceneJson').inputValue());
  const field = key => page.locator(`#addConicFields [data-equation-param="${key}"]`);
  await page.locator('#question').fill('椭圆x²/9+y²/4=1，点P(1,0)，求椭圆的离心率。');
  await page.locator('#solveButton').click();
  await page.waitForFunction(() => document.querySelector('#solution')?.textContent.includes('离心率') && JSON.parse(document.querySelector('#sceneJson').value).type === 'ellipse');
  const before = await scene(), question = await page.locator('#question').inputValue(), solution = await page.locator('#solution').innerText();
  for (const type of ['ellipse','hyperbola','parabola','circle']) {
    await page.locator(`[data-add-conic="${type}"]`).click();
    await page.locator('#addConicDialog').waitFor({state:'visible'});
    const duplicates = await page.evaluate(() => {
      const ids = [...document.querySelectorAll('[id]')].map(el => el.id);
      return ids.filter((id,index) => ids.indexOf(id) !== index);
    });
    assert.deepEqual(duplicates, [], '模板多实例不能产生重复 ID');
    await field('h').fill('2'); await field('k').fill('1');
    if (type === 'ellipse') {
      await field('a').fill(''); await field('a').focus();
      await page.locator('#addConicDialog [data-open-math-keyboard]').click();
      await page.locator('#mathKeyboard [data-group="algebra"]').click();
      await page.locator('#mathKeyboard').getByRole('button',{name:'√',exact:true}).click();
      await page.keyboard.type('4');
      await page.locator('#mathKeyboard [data-key-command="close"]').click();
      assert.match(await field('a').inputValue(), /√.*4/);
      await field('b').fill('1');
    }
    await page.locator('#confirmAddConic').click();
    await page.locator('#addConicDialog').waitFor({state:'hidden'});
    const current = await scene(), added = current.objects.at(-1);
    assert.equal(added.kind, type === 'circle'?'circle':'conic');
    assert.equal(added.source,'user');
    assert.equal(current.type,before.type);assert.equal(current.a,before.a);assert.equal(current.b,before.b);
    assert.equal(await page.locator('#question').inputValue(),question);
    assert.equal(await page.locator('#solution').innerText(),solution,'追加不应清掉或改写原题解析');
  }
  const count=(await scene()).objects.length;
  await page.locator('#undoDrag').click();assert.equal((await scene()).objects.length,count-1);
  await page.locator('#redoDrag').click();assert.equal((await scene()).objects.length,count);
  await page.locator('[data-add-conic="ellipse"]').click();
  await field('a').fill('0');await page.locator('#confirmAddConic').click();
  assert.match(await page.locator('#addConicError').innerText(),/大于 0/);
  await page.locator('#cancelAddConic').click();assert.equal((await scene()).objects.length,count);

  const model={type:'ellipse',a:3,b:2,h:0,k:0,orientation:'horizontal',showConic:true,showDynamic:false,showFeatures:true,
    points:{P:[1,0],S:[3,1.95]},lines:[],objects:[{id:'extra',kind:'conic',conicType:'ellipse',a:1.5,b:1,h:-2,k:1,orientation:'horizontal',visible:true,label:'C1',source:'user'}]};
  async function install(value) {
    await page.locator('#sceneJson').evaluate((el,json)=>{el.value=json;document.querySelector('#applyJson').click();},JSON.stringify(value));
    await page.locator('#homeButton').click();
  }
  await install(model);
  const box=await page.locator('#canvas').boundingBox(),scale=Math.max(10.5/box.width,7.6/box.height);
  const xy=(x,y)=>({x:box.x+box.width/2+x/scale,y:box.y+box.height/2-y/scale});
  const move=async (x,y,dx=0,dy=0)=>{const p=xy(x,y);await page.mouse.move(p.x+dx,p.y+dy);};
  const click=async (x,y,dx=0,dy=0)=>{const p=xy(x,y);await page.mouse.click(p.x+dx,p.y+dy);};
  await page.locator('[data-construct="line_angle"]').click();
  await move(1,0,5,3);assert.match(await page.locator('#snapStatus').innerText(),/点 P/);await click(1,0,5,3);
  await move(1,3,4,0);assert.match(await page.locator('#snapStatus').innerText(),/90°/);await click(1,3,4,0);
  let line=(await scene()).objects.at(-1);
  assert.equal(line.op,'line_angle');assert.deepEqual(line.refs,['feature:P']);assert(Math.abs(line.angle-90)<1e-8);
  // The existing point has precedence over a nearby 45-degree direction.
  await click(1,0);await move(3,1.95);assert.match(await page.locator('#snapStatus').innerText(),/点 S/);await click(3,1.95);
  assert(Math.abs((await scene()).objects.at(-1).angle-Math.atan2(1.95,2)*180/Math.PI)<1e-8);
  await page.locator('#moveMode').click();
  await move(1,3);await page.mouse.down();await move(4,0);await page.mouse.up();
  line=(await scene()).objects.find(o=>o.id===line.id);
  assert(Math.abs(line.angle)<1e-8,'拖动定点直线应旋转，不平移定点');assert.deepEqual((await scene()).points.P,[1,0]);
  await page.locator('[data-inspector-view="geometry"]').click();
  await page.locator('#nativeLineAngle').fill('180/4');
  await page.locator('#nativeInspector').getByRole('button',{name:'应用角度',exact:true}).click();
  assert.equal((await scene()).objects.find(o=>o.id===line.id).angle,45,'精确角度输入应使用表达式求值');
  await move(1,0);await page.mouse.down();await move(1.5,-.5);await page.mouse.up();
  assert(Math.abs((await scene()).points.P[0]-1.5)<1e-5&&Math.abs((await scene()).points.P[1]+.5)<1e-5,'鼠标浮点坐标应在 1e-5 内落到目标位置');
  const resolved=await page.evaluate(data=>{
    const engine=window.DongConstruct.createEngine({model:()=>data,features:()=>Object.entries(data.points).map(([name,[x,y]])=>({name,x,y})),coeffs:()=>({}),origin:()=>({x:0,y:0}),angle:()=>0});
    return engine.resolve(data.objects.find(o=>o.op==='line_angle').id);
  },await scene());
  assert.deepEqual([resolved.o.x,resolved.o.y],(await scene()).points.P,'过点约束使用完全相同的源点坐标');

  await install(model);
  await page.locator('[data-construct="point"]').click();
  await move(-2,2,0,-4);assert.match(await page.locator('#snapStatus').innerText(),/C1/);await click(-2,2,0,-4);
  let bound=(await scene()).objects.at(-1);assert.equal(bound.op,'point_on');assert.deepEqual(bound.refs,['extra']);
  await page.locator('#moveMode').click();
  await move(-2,1);await page.mouse.down();await move(-1,1);await page.mouse.up();
  const moved=await scene();assert(Math.abs(moved.objects.find(o=>o.id==='extra').h+1)<1e-5);
  const followed=await page.evaluate(data=>{const e=window.DongConstruct.createEngine({model:()=>data});return e.resolve(data.objects.at(-1).id);},moved);
  assert(Math.abs(followed.x+1)<1e-5&&Math.abs(followed.y-2)<1e-5,'曲线上点必须随曲线中心拖动');
  assert.equal(await page.locator('#motionPlay').isEnabled(),true,'附加曲线上的动点也应支持播放');
  await page.locator('#motionPlay').click();await page.waitForTimeout(160);await page.locator('#motionPlay').click();
  assert.notEqual((await scene()).objects.at(-1).t,bound.t);

  const crossing=structuredClone(model);crossing.objects.push({id:'cut',kind:'line',m:0,b:1.5,label:'g',source:'user'});
  await install(crossing);await page.locator('[data-construct="point"]').click();
  await move(-2+1.5*Math.sqrt(.75),1.5,3,3);assert.match(await page.locator('#snapStatus').innerText(),/交点/);
  await click(-2+1.5*Math.sqrt(.75),1.5,3,3);
  const intersection=(await scene()).objects.at(-1);assert.equal(intersection.op,'intersection');assert(intersection.refs.includes('extra'));assert(intersection.refs.includes('cut'));
  await page.locator('#geometrySnap').uncheck();await click(-2,2,0,-5);assert.equal((await scene()).objects.at(-1).kind,'point','关闭几何吸附后可建立自由点');
  await page.locator('#geometrySnap').check();
  const hidden=structuredClone(model);hidden.objects[0].visible=false;await install(hidden);await page.locator('[data-construct="point"]').click();await click(-2,2,0,-5);
  assert.equal((await scene()).objects.at(-1).kind,'point','隐藏曲线不能被吸附');
  await install(moved);await page.reload();await page.waitForFunction(()=>JSON.parse(document.querySelector('#sceneJson').value).objects?.some(o=>o.op==='point_on'));
  assert.equal((await scene()).objects.find(o=>o.id===bound.id).refs[0],'extra','本地恢复应保留引用');
  await screenshot('additive-conics-and-snap.png',null);
  assert.deepEqual(errors,[]);
  console.log('PASS: additive conic templates, unique IDs, math keyboard, undo/redo, exact snap, fixed-pivot rotation, linked curve points, intersections, hidden/off snapping, persistence.');
};
