module.exports=async({page,context,assert,screenshot})=>{
  await context.route('**/runtime-config.js',r=>r.fulfill({contentType:'application/javascript',body:'window.DONGJIEXI_CONFIG={deployment:"web",apiEnabled:false};'}));
  await page.reload({waitUntil:'domcontentloaded'});
  async function solve(question){
    await page.locator('#question').fill(question);await page.locator('#solveButton').click();
    await page.waitForFunction(()=>['complete','partial'].includes(document.querySelector('#solveProgress').dataset.state));
    return page.evaluate(()=>JSON.parse(localStorage.getItem('zhigeometry:last')).solution);
  }
  for(const goal of ['求 A、B 两点处的切线并求两条切线夹角的正弦值。','求 A、B 两点处的切线及两切线与 x 轴围成三角形的面积。']){
    const r=await solve('圆 C:x²+y²=25，点 A(3,4)、B(-4,3) 在圆上，'+goal);
    assert.equal(r.completion.answered,0,'Only tangent equations cannot complete compound goal');
    assert.equal(r.parts[0].status,'partial');
    assert.equal(r.scene.lines.filter(n=>n.role==='tangent').length,2,'Preserve completed tangent constructions');
    assert.match(r.parts[0].answer,/尚未证明|尚待推导/);
  }
  const fixed=await solve('圆 C:x²+y²=25，点 A(3,4)、B(-4,3) 在圆上，证明 A、B 两点处的切线互相垂直。');
  assert.equal(fixed.completion.answered,1,'Fixed legal tangent perpendicularity remains supported');
  const variable=await solve('圆 C:x²+y²=25，动点 A(3,4)、B(-4,3) 在圆上，证明 A、B 两点处的切线恒互相垂直。');
  assert.equal(variable.completion.answered,0,'A current pose does not prove quantified motion');
  const polygon=await solve('圆 C:x²+y²=25，点 A(0,0)、B(3,0)、D(0,4)，证明三角形 ABD 的周长大于 10。');
  assert.equal(polygon.completion.answered,0,'A measured polygon is not an inequality proof');
  const hyperbola=await solve('已知双曲线 C:x²/a²-y²/b²=1 的右焦点 F(2,0)，渐近线方程为 y=±x。求 C 的标准方程。');
  assert.equal(hyperbola.completion.answered,1);
  assert(Math.abs(hyperbola.scene.a**2-2)<1e-9&&Math.abs(hyperbola.scene.b**2-2)<1e-9);
  await screenshot('proof-scope.png',null);
};
