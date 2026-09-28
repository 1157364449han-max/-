module.exports=async({page,assert})=>{
  await page.locator('[data-mobile-panel="board"]').click({force:true}).catch(()=>{});
  if(await page.locator('.board-shell').isHidden())await page.locator('[data-mobile-panel="board"]').click();
  if(await page.locator('.board-shell').evaluate(element=>element.classList.contains('toolbox-collapsed')))await page.locator('#toolboxToggle').click();
  await page.locator('[data-add-conic="circle"]').click();
  const radius=page.locator('#addConicFields [data-equation-param="r"]');
  await radius.focus();
  await page.locator('#addConicDialog [data-open-math-keyboard]').click();
  await page.locator('#mathLiveField').waitFor({state:'visible'});
  await page.locator('#mathLiveField').evaluate(field=>{field.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,inputType:'insertText',data:'5/2'}));field.value='\\frac{5}{2}';field.dispatchEvent(new Event('input',{bubbles:true}));});
  assert.equal(await radius.inputValue(),'\\frac{5}{2}','MathLive content must write back to the active parameter field');
  assert.match(await page.locator('#mathKeyboard').innerText(),/微积分与矩阵/,'Fallback keyboard must include the advanced symbol group');
  await page.locator('#mathKeyboard [data-key-command="close"]').click();
  await page.locator('#confirmAddConic').click();
  const scene=JSON.parse(await page.locator('#sceneJson').inputValue());
  assert.equal(scene.objects.at(-1).r,2.5);
  console.log('PASS: self-hosted MathLive edits structured parameters and the expanded keyboard remains available.');
};
