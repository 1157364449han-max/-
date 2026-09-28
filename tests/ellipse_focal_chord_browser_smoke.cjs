const QUESTION=`18. (17分) 已知椭圆 \\(C: \\frac{x^2}{a^2}+\\frac{y^2}{b^2}=1\\ (a>b>0)\\) 的左焦点为 \\(F(-1,0)\\)，离心率为 \\(\\frac{1}{2}\\)。

(1) 求 \\(C\\) 的方程；

(2) 设 \\(O\\) 为坐标原点，过 \\(F\\) 且斜率大于 0 的动直线 \\(l\\) 与 \\(C\\) 交于 \\(P,Q\\) 两点，其中 \\(Q\\) 在第三象限，直线 \\(PQ\\) 与 \\(C\\) 的另一个交点为 \\(R\\)。

(i) 若 \\(\\triangle PQR\\) 的面积是 \\(\\triangle PFO\\) 的面积的 3 倍，求 \\(l\\) 的方程；

(ii) 求 \\(\\tan \\angle PQR\\) 的最小值。`;

module.exports=async({page,assert})=>{
  let jobs=0;page.on('request',request=>{if(request.url().includes('/api/jobs'))jobs++;});
  await page.locator('#question').fill(QUESTION);
  page.once('dialog',async dialog=>{assert.match(dialog.message(),/直线 PQ.*第三个交点 R/s);assert.match(dialog.message(),/直线 PO/);await dialog.accept();});
  await page.locator('#solveButton').click();
  await page.waitForFunction(()=>document.querySelector('#solution')?.textContent.includes('逐问作答：3 / 3'));
  await page.locator('[data-study-part="all"]').click();
  const question=await page.locator('#question').inputValue(),solution=await page.locator('#solution').innerText();
  assert.match(question,/直线 PO\s*与 C 的另一个交点为 R/);
  assert.match(solution,/第（2）（i）问/);assert.match(solution,/第（2）（ii）问/);
  assert.match(solution,/x²\/4\s*\+\s*y²\/3\s*=\s*1/);
  assert.equal(jobs,0,'精确规则已完成的题不应再请求云端模型');
  const scene=JSON.parse(await page.locator('#sceneJson').inputValue());
  assert.equal(scene.type,'ellipse');assert(Math.abs(scene.a-2)<1e-10);assert(Math.abs(scene.b-Math.sqrt(3))<1e-10);
  assert.deepEqual(scene.dynamicIntersectionLabels,['Q','P']);assert.equal(scene.ellipseFocusChord.schema,'dongjiexi-ellipse-focal-chord/v1');
  assert.equal(scene.ellipseFocusChord.exact.slope,'\\dfrac{\\sqrt5}{2}');assert.equal(scene.ellipseFocusChord.exact.tanMinimum,'4\\sqrt3');
  assert.equal(scene.objects.find(item=>item.id==='ellipse-focal-r').op,'reflect_center');
  assert.equal(scene.objects.some(item=>item.id==='ellipse-focal-po'),true);assert.equal(scene.objects.some(item=>item.id==='ellipse-focal-qr'),true);
  await page.locator('[data-study-part="201"]').click();
  assert.match(await page.locator('#layers').innerText(),/△PQR · 高亮/);assert.match(await page.locator('#layers').innerText(),/△PFO · 高亮/);
  const motion=await page.evaluate(data=>{
    const model=structuredClone(data),theta={value:data.theta},q={A:1/4,B:0,C:1/3,D:0,E:0,F:-1};
    const origin=()=>({x:-1,y:0}),dynamic=()=>{const t=theta.value*Math.PI/180;return{type:'line',o:origin(),d:{x:Math.cos(t),y:Math.sin(t)}};},conic={type:'conic',q};
    const features=()=>{const list=Object.entries(model.points||{}).map(([name,[x,y]])=>({name,x,y}));window.DongConstruct.intersect(dynamic(),conic).forEach((point,index)=>list.push({...point,name:model.dynamicIntersectionLabels[index]}));return list;};
    const engine=window.DongConstruct.createEngine({model:()=>model,features,coeffs:()=>q,origin,angle:()=>theta.value,conicPoint:()=>null,conicProject:()=>null});
    const sample=angle=>{theta.value=angle;const P=features().find(point=>point.name==='P'),Q=features().find(point=>point.name==='Q'),R=engine.resolve('ellipse-focal-r'),PO=engine.resolve('ellipse-focal-po'),QR=engine.resolve('ellipse-focal-qr');return{P,Q,R,PO:PO?.type,QR:QR?.type,residual:[R.x+P.x,R.y+P.y]};};
    return[sample(data.theta),sample(60)];
  },scene);
  for(const sample of motion){assert(sample.Q.x<0&&sample.Q.y<0,'Q 必须在第三象限');assert(sample.P.y>0);assert(Math.abs(sample.residual[0])<1e-8&&Math.abs(sample.residual[1])<1e-8,'R 必须始终是 P 关于 O 的对称点');assert.equal(sample.PO,'line');assert.equal(sample.QR,'line');}
  assert.notDeepEqual(motion[0].R,motion[1].R,'拖动直线后 R 必须联动');
  console.log('PASS: contradiction repair, nested parts, exact focal-chord solution, and live P/Q/R construction.');
};
