module.exports=async({page,assert,screenshot})=>{
  const question='设双曲线 C: x^2/a^2 - y^2/b^2 = 1 (a>0, b>0) 的左、右焦点分别为 F1、F2，过 F2 作平行于 y 轴的直线交 C 于 A、B 两点。若 |F1A|=13，|AB|=10，则 C 的离心率为';
  await page.locator('#question').fill(question);
  await page.locator('#solveButton').click();
  await page.waitForFunction(()=>!document.querySelector('#solveButton').disabled&&document.querySelector('#solution').textContent.includes('3/2'));
  const scene=JSON.parse(await page.locator('#sceneJson').inputValue());
  assert.equal(scene.type,'hyperbola');
  assert.equal(scene.a,4);
  assert(Math.abs(scene.b-Math.sqrt(20))<1e-9);
  assert.deepEqual(scene.points.A,[6,5]);
  assert.deepEqual(scene.points.B,[6,-5]);
  assert.equal(scene.showDynamic,false,'焦点垂弦是题设固定直线，不应显示旋转控制');
  assert(scene.lines.some(line=>line.kind==='vertical'&&line.x===6&&line.label==='AB'));
  assert(scene.objects.some(item=>item.label==='F₁A'&&item.op==='segment'));
  assert(scene.objects.some(item=>item.label==='AB'&&item.op==='segment'));
  assert.match(await page.locator('#solution').innerText(),/已生成完整作答/);
  assert.match(await page.locator('#solution').innerText(),/e=3\/2/);
  await screenshot('hyperbola-focal-chord-condition.png','.board-shell');
};
