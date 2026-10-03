const QUESTION=String.raw`已知椭圆 (C:\dfrac{x^2}{a^2}+\dfrac{y^2}{b^2}=1\ (a>b>0)) 的离心率为 (\dfrac{\sqrt2}{2})，且经过点 (P\left(1,\dfrac{\sqrt2}{2}\right))。
（1）求椭圆 (C) 的标准方程；
（2）设直线 (l) 与椭圆 (C) 交于 (A,B) 两点，(O) 为坐标原点。若 (OA\perp OB)，证明：直线 (l) 与一个定圆相切，并求该定圆的方程及 (\triangle OAB) 面积的最小值。`;
module.exports=async({page,assert,screenshot})=>{
  await page.locator('#question').fill(QUESTION);await page.locator('#solveButton').click();
  await page.waitForFunction(()=>!document.querySelector('#solveButton').disabled);
  const model=JSON.parse(await page.locator('#sceneJson').inputValue());
  assert.equal(model.type,'ellipse');assert(Math.abs(model.a*model.a-2)<1e-9);assert(Math.abs(model.b*model.b-1)<1e-9);
  assert.match(await page.locator('#solution').innerText(),/逐问作答：2 \/ 2/);
  await page.locator('[data-study-part="2"]').click();
  assert(model.orthogonalChord,'不能把原椭圆方程冒充定圆结论');
  assert(model.objects.some(o=>o.op==='orthogonal_chord_circle'));
  assert.equal(await page.locator('#motionPlay').isEnabled(),true,'切换到第二问后应能播放受约束的动弦');
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('#solution annotation')).some(n=>n.textContent==='x^2+y^2=\\frac{2}{3}'));
  assert.match(await page.locator('#solution').innerText(),/竖直线不能遗漏/);
  await page.locator('[data-inspector-view="geometry"]').click();
  await page.locator('#parameterTarget').selectOption('$dynamic');
  const theta=page.locator('#params input[data-key="theta"][data-param-expression]');
  for(const angle of [0,37,90,180,270]){
    await theta.fill(String(angle));
    assert.match(await page.locator('#metrics').innerText(),/垂直条件 · OA·OB\s*0（已核对）/);
    assert.match(await page.locator('#metrics').innerText(),/定圆半径平方\s*2\/3/);
  }
  await page.locator('#locateOrthogonalMinimum').click();
  assert.equal(JSON.parse(await page.locator('#sceneJson').inputValue()).theta,0);
  assert.match(await page.locator('#metrics').innerText(),/△OAB · 面积\s*2\/3/);
  await screenshot('orthogonal-chord.png','.board-shell');
  await page.locator('#parameterTarget').selectOption('$conic');
  await page.locator('#unrestrictedMove').click();
  await page.locator('#params input[data-key="a"][data-param-expression]').fill('2');
  assert.match(await page.locator('#metrics').innerText(),/定圆半径平方\s*4\/5/,'改动半轴后定圆与最值须同步变化');
  await page.locator('[data-inspector-view="lesson"]').click();
  await page.locator('[data-study-part="1"]').click();
  assert.doesNotMatch(await page.locator('#metrics').innerText(),/定圆半径平方/);
  // Missing perpendicular premise must never become an answered fixed-circle proof.
  await page.locator('#question').fill('椭圆 C：x²/2+y²=1。直线l与椭圆交于A、B。证明直线l与一个定圆相切，并求定圆方程。');
  await page.locator('#solveButton').click();await page.waitForFunction(()=>!document.querySelector('#solveButton').disabled);
  assert.doesNotMatch(await page.locator('#solution').innerText(),/已生成完整作答/);
};
