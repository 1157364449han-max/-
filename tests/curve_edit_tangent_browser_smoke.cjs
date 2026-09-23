module.exports=async({page,context,assert,screenshot})=>{
  await page.evaluate(async()=>{for(const sw of await navigator.serviceWorker.getRegistrations())await sw.unregister();for(const key of await caches.keys())await caches.delete(key);});
  await context.route('**/runtime-config.js',route=>route.fulfill({contentType:'application/javascript',body:`window.DONGJIEXI_CONFIG=Object.freeze({version:'0.22.0',deployment:'web',apiBase:'',apiEnabled:false,requiresAuth:false});`}));
  await page.reload({waitUntil:'domcontentloaded'});
  const scene=async()=>JSON.parse(await page.locator('#sceneJson').inputValue());
  await page.locator('#question').fill('已知椭圆x²/9+y²/4=1，求焦点坐标和离心率。');
  await page.locator('#solveButton').click();
  await page.waitForFunction(()=>document.querySelector('#solution').textContent.includes('离心率')&&JSON.parse(document.querySelector('#sceneJson').value).type==='ellipse');
  const originalQuestion=await page.locator('#question').inputValue(),originalSolution=await page.locator('#solution').textContent();
  await page.locator('[data-inspector-view="geometry"]').click();
  const model={type:'ellipse',a:3,b:2,h:0,k:0,orientation:'horizontal',showConic:true,showFeatures:true,showDynamic:false,points:{},lines:[],objects:[]};
  async function install(data){await page.locator('#sceneJson').evaluate((el,value)=>{el.value=value;document.querySelector('#applyJson').click();},JSON.stringify(data));await page.locator('#homeButton').click();}
  await install(model);
  let box=await page.locator('#canvas').boundingBox(),scale=Math.max(10.5/box.width,7.6/box.height);
  const xy=(x,y)=>({x:box.x+box.width/2+x/scale,y:box.y+box.height/2-y/scale});
  const click=async(x,y)=>{const p=xy(x,y);await page.mouse.click(p.x,p.y);};
  const move=async(x,y)=>{const p=xy(x,y);await page.mouse.move(p.x,p.y);};
  const constructed=async op=>(await scene()).objects.filter(o=>o.op===op);
  await page.locator('[data-construct="tangent"]').click();await click(-3,0);
  await move(3/Math.sqrt(2),Math.sqrt(2));assert.match(await page.locator('#snapStatus').innerText(),/切线预览/);
  await click(3/Math.sqrt(2),Math.sqrt(2));
  let tangents=await constructed('tangent');assert.equal(tangents.length,1);
  const bound=(await constructed('point_on'))[0];assert.deepEqual(tangents[0].refs,[bound.id,'$conic']);
  await page.locator('[data-construct="normal"]').click();await click(-3,0);await click(3/Math.sqrt(2),Math.sqrt(2));
  assert.deepEqual((await constructed('normal'))[0].refs,[bound.id,'$conic']);
  await page.locator('#moveMode').click();await move(3/Math.sqrt(2),Math.sqrt(2));await page.mouse.down();await move(-3/Math.sqrt(2),Math.sqrt(2));await page.mouse.up();
  const evaluate=async()=>page.evaluate(data=>{
    const curve=window.DongConstruct.conicShape({...data,conicType:data.type});
    const engine=window.DongConstruct.createEngine({model:()=>data,features:()=>Object.entries(data.points||{}).map(([name,[x,y]])=>({name,x,y})),coeffs:()=>curve.q,conicPoint:curve.pointAt,conicProject:curve.project});
    return data.objects.filter(o=>['tangent','normal'].includes(o.op)).map(o=>({id:o.id,...engine.resolve(o.id)}));
  },await scene());
  let [t,n]=await evaluate();assert(t.o.x<0);assert(Math.abs(t.d.x*n.d.x+t.d.y*n.d.y)<1e-9);
  await page.locator('#undoDrag').click();assert((await evaluate())[0].o.x>0);await page.locator('#redoDrag').click();

  // Native circle tangent/normal construction also participates in in-place editing.
  await install({...model,objects:[{id:'c',kind:'circle',h:0,k:0,r:1,label:'C1',source:'user',visible:true}]});
  await page.locator('[data-construct="tangent"]').click();await click(-1,0);await click(Math.SQRT1_2,Math.SQRT1_2);
  const circlePoint=(await constructed('point_on'))[0],circleTangent=(await constructed('tangent'))[0];
  assert.deepEqual(circleTangent.refs,[circlePoint.id,'c']);
  await page.locator('[data-construct="normal"]').click();await click(-1,0);await click(Math.SQRT1_2,Math.SQRT1_2);
  await page.locator('#moveMode').click();
  const row=page.locator('#layers .layer-row').filter({hasText:'C1'});
  await row.getByRole('button',{name:'编辑',exact:true}).click();
  assert.equal(await page.locator('#addConicType').isDisabled(),true);
  assert.equal(await page.locator('#addConicFields [data-equation-param="r"]').inputValue(),'1');
  await page.locator('#addConicFields [data-equation-param="r"]').fill('2');
  await page.locator('#addConicFields [data-equation-param="h"]').fill('1/2');
  await page.locator('#addConicName').fill('辅助圆');
  const objectCount=(await scene()).objects.length;
  await page.locator('#confirmAddConic').click();await page.locator('#addConicDialog').waitFor({state:'hidden'});
  let edited=await scene();assert.equal(edited.objects.length,objectCount);
  const circle=edited.objects.find(o=>o.id==='c');assert.equal(circle.r,2);assert.equal(circle.h,.5);assert.equal(circle.label,'辅助圆');
  assert.equal(circle.equation,'(x−0.5)²+y²=4');
  assert.deepEqual(edited.objects.find(o=>o.id===circleTangent.id).refs,[circlePoint.id,'c']);
  [t,n]=await evaluate();assert(Math.abs(Math.hypot(t.o.x-.5,t.o.y)-2)<1e-8);assert(Math.abs(t.d.x*n.d.x+t.d.y*n.d.y)<1e-8);
  await page.locator('#nativeInspector [data-live-equation] .katex').waitFor();
  assert.match(await page.locator('#nativeInspector [data-live-equation]').getAttribute('data-math-source'),/0.5.*=4/);
  assert.equal(await page.locator('#question').inputValue(),originalQuestion);
  assert.equal(await page.locator('#solution').textContent(),originalSolution);
  await page.locator('#undoDrag').click();assert.equal((await scene()).objects.find(o=>o.id==='c').r,1);await page.locator('#redoDrag').click();
  await page.locator('#layers .layer-row').filter({hasText:'辅助圆'}).getByRole('button',{name:'编辑',exact:true}).click();
  await page.locator('#addConicFields [data-equation-param="r"]').fill('0');await page.locator('#confirmAddConic').click();
  assert.match(await page.locator('#addConicError').innerText(),/大于 0/);await page.locator('#cancelAddConic').click();assert.equal((await scene()).objects.find(o=>o.id==='c').r,2);
  const circleEdge=xy(-1.5,0);await page.mouse.dblclick(circleEdge.x,circleEdge.y);
  await page.locator('#addConicDialog').waitFor({state:'visible'});assert.equal(await page.locator('#addConicFields [data-equation-param="r"]').inputValue(),'2');await page.locator('#cancelAddConic').click();
  await screenshot('curve-edit-and-tangent.png',null);

  for(const conicType of ['ellipse','hyperbola','parabola']){
    const curve={id:'edit-case',kind:'conic',conicType,h:0,k:0,a:3,b:2,p:1,direction:-1,orientation:'horizontal',source:'user',label:'编辑样本'};
    const follower={id:'follower',kind:'construction',op:'point_on',refs:['edit-case'],t:.6,source:'user',label:'T'};
    await install({...model,objects:[curve,follower]});
    await page.locator('#layers .layer-row').filter({hasText:'编辑样本'}).getByRole('button',{name:'编辑',exact:true}).click();
    const field=key=>page.locator(`#addConicFields [data-equation-param="${key}"]`);
    await field('h').fill('1/3');await field('k').fill('-2/3');
    if(conicType==='parabola'){assert.equal(await field('direction').inputValue(),'left');await field('direction').selectOption('down');await field('p').fill('1/2');}
    else{await field('orientation').selectOption('vertical');await field('a').fill('√16');await field('b').fill('√4');}
    await page.locator('#confirmAddConic').click();
    const data=await scene(),updated=data.objects.find(o=>o.id==='edit-case');
    assert.equal(updated.orientation,'vertical');assert.equal(updated.h,1/3);assert.equal(updated.k,-2/3);assert.equal(data.objects.length,2);
    const point=await page.evaluate(data=>window.DongConstruct.createEngine({model:()=>data}).resolve('follower'),data);
    assert(point&&Number.isFinite(point.x)&&Number.isFinite(point.y),'编辑方向后依赖点仍可重算');
    if(conicType==='parabola')assert(Math.abs((point.x-updated.h)**2+2*(point.y-updated.k))<1e-8);
    else assert(Math.abs((point.y-updated.k)**2/16+(conicType==='ellipse'?1:-1)*(point.x-updated.h)**2/4-1)<1e-8);
  }

  // Invalid tangent in the answer's lines collection must not disappear silently.
  const derived={...model,points:{P:[0,0]},lines:[{id:'answer',kind:'slope',m:0,b:2,role:'tangent',source:'derived',label:'P 点切线',refs:['feature:P','$conic']}],objects:[]};
  await install(derived);assert.match(await page.locator('#undefinedObjects').innerText(),/P 点切线.*不在曲线上/);
  await install({...derived,points:{P:[0,2]}});assert.equal(await page.locator('#undefinedObjects').innerText(),'','源点恢复到曲线后警告应消失');
  const bad={...model,points:{P:[0,0]}};await install(bad);await page.locator('[data-construct="tangent"]').click();await click(-3,0);await click(0,0);
  assert.equal((await constructed('tangent')).length,0);assert.match(await page.locator('#dragHint').innerText(),/不在所选曲线上/);
  await install(edited);await page.reload();await page.waitForFunction(()=>JSON.parse(document.querySelector('#sceneJson').value).objects?.some(o=>o.id==='c'));
  assert.equal((await scene()).objects.find(o=>o.id==='c').equation,'(x−0.5)²+y²=4');
  assert.equal((await constructed('normal')).length,1);
  console.log('PASS: pure-web tangent/normal preview and linked motion, in-place curve edits with stable IDs, live equations, undo, invalid-point warnings and persistence.');
};
