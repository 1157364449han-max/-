module.exports=async({page,assert,screenshot})=>{
  const ids=['2022-i-21','2023-ii-21','2024-i-12','2024-i-16','2025-i-18','2025-ii-16'];
  await page.locator('#openQuestionBank').click();
  await page.locator('#bankList button').first().waitFor();
  await page.locator('[data-bank-paper="national-i"]').click();
  assert.equal(await page.locator('#bankList button').count(),7);
  assert.equal(await page.locator('#bankPaper').inputValue(),'national-i');
  assert.equal(await page.locator('[data-bank-paper="national-i"]').getAttribute('aria-pressed'),'true');
  await page.locator('#bankYear').selectOption('2024');
  assert.equal(await page.locator('#bankList button').count(),2);
  await page.locator('[data-bank-paper="national-ii"]').click();
  assert.equal(await page.locator('#bankList button').count(),1,'年份与卷别应取交集');
  assert(await page.locator('[data-bank-id="2024-ii-19"]').count());
  await page.locator('#bankResetFilters').click();
  await page.locator('[data-bank-paper="national-ii"]').click();
  assert.equal(await page.locator('#bankList button').count(),4);
  await page.locator('#bankYear').selectOption('2025');
  await page.locator('[data-bank-id="2025-ii-16"]').click();
  assert.match(await page.locator('#bankDetail').textContent(),/弦长|面积/);
  assert.equal(await page.locator('#bankDetail .katex-error').count(),0);
  await page.locator('#bankResetFilters').click();
  await page.locator('#bankSearch').fill('全国二卷');
  assert.equal(await page.locator('#bankList button').count(),4);
  await page.locator('#bankKind').selectOption('classic');
  await page.locator('#bankResetFilters').click();
  assert.equal(await page.locator('#bankList button').count(),2);
  await page.locator('#bankKind').selectOption('gaokao');
  for(const id of ids){
    await page.locator('#bankResetFilters').click();
    await page.locator('[data-bank-id="'+id+'"]').click();
    assert.match(await page.locator('#bankDetail').textContent(),/完整题目/);
    assert.equal(await page.locator('#bankDetail .katex-error').count(),0,id+'题面公式');
    await page.locator('[data-bank-action="full"]').click();
    const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('zhigeometry:last')));
    assert.equal(saved.solution.lessonSource.id,id);
    assert.equal(saved.solution.verification.status,'reference-reviewed');
    assert.equal(await page.locator('#solution .katex-error').count(),0,id+'解析公式');
    const audit=await page.evaluate(({scene,q,parts})=>window.DongSceneAudit.inspect(scene,q,parts,window.DongConstruct),{scene:saved.scene,q:saved.question,parts:saved.solution.parts});
    assert.deepEqual(audit.missing,[],id+'命名图形覆盖');
    assert.deepEqual(audit.invalid,[],id+'构造可解析');
    if(id==='2025-i-18'){
      await page.locator('[data-study-part="202"]').click();
      assert.match(await page.locator('#layers').innerText(),/轨迹所在圆/);
      await screenshot('national-i-inverse-max.png');
    }
    await page.locator('#openQuestionBank').click();
  }
  await page.setViewportSize({width:320,height:740});
  await page.locator('#bankResetFilters').click();
  await page.locator('[data-bank-paper="national-ii"]').click();
  assert(await page.locator('#questionBankDialog').evaluate(n=>n.scrollWidth<=n.clientWidth+2));
  await screenshot('national-ii-bank-mobile.png','#questionBankDialog');
};
