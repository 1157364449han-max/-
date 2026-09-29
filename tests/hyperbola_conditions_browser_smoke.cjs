module.exports=async({page,assert,screenshot})=>{
  const cases=[
    {
      question:'已知双曲线 C 的右焦点为 F(3,0)，渐近线为 y=±√2x，求离心率。',
      exact:{a2:'3',b2:'6'},answer:/e=√\(3\)|e=√3/
    },
    {
      question:'已知双曲线 C:x^2/a^2-y^2/b^2=1 的离心率为 3/2，右焦点 F(3,0)，求标准方程。',
      exact:{a2:'4',b2:'5'},answer:/x²\/4-y²\/5=1/
    }
  ];
  for(const item of cases){
    await page.locator('#question').fill(item.question);
    await page.locator('#solveButton').click();
    await page.waitForFunction(()=>!document.querySelector('#solveButton').disabled);
    const scene=JSON.parse(await page.locator('#sceneJson').inputValue());
    assert.equal(scene.type,'hyperbola');
    assert.deepEqual(scene.exact,item.exact);
    assert.match(await page.locator('#solution').innerText(),item.answer);
  }
  await screenshot('hyperbola-condition-families.png','.board-shell');
};
