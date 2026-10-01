module.exports=async({page,context,assert})=>{
  await context.route('**/runtime-config.js',route=>route.fulfill({contentType:'application/javascript',body:'window.DONGJIEXI_CONFIG={deployment:"web",apiEnabled:false};'}));
  await page.reload({waitUntil:'domcontentloaded'});
  for(const [question,complete] of [
    ['椭圆 C：x²/4+y²=1，求焦点坐标。',true],
    ['椭圆 C：x²/4+y²=1，求焦点坐标并求椭圆面积。',false],
    ['椭圆 C：x²/4+y²=1，求焦点坐标的平方和。',false],
    ['椭圆 C：x²/4+y²=1，求渐近线方程。',false],
    ['抛物线 C：y²=4x，求渐近线方程。',false],
    ['圆 C：x²+y²=4，求离心率。',false],
    ['椭圆 C：x²/4+y²=1，求标准方程并求周长。',false],
    ['椭圆 C：x²/4+y²=1，给出未知量t的范围。',false],
    ['抛物线 C：y²=4x，点P(1,2)，求P处法线方程并求曲率。',false],
    ['抛物线 C：y²=4x，点P(1,2)，求P处切线方程并求曲率。',false],
  ]){
    await page.locator('#question').fill(question);await page.locator('#solveButton').click();
    await page.waitForFunction(()=>!document.querySelector('#solveButton').disabled&&['complete','partial','error'].includes(document.querySelector('#solveProgress').dataset.state));
    const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('zhigeometry:last')));
    assert.equal(stored.solution.completion.answered,complete?1:0,question);
    assert(stored.solution.scene,'Partial goals retain a useful diagram');
  }
};
