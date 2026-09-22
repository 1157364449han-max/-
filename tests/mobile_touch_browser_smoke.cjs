module.exports=async({page,baseURL,assert,errors})=>{
  const context=await page.context().browser().newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
  const phone=await context.newPage();phone.on('pageerror',error=>errors.push(error.message));
  try{
    await phone.goto(baseURL,{waitUntil:'domcontentloaded'});
    await phone.locator('#question').fill('椭圆x²/9+y²/4=1。');
    await phone.locator('#parseButton').tap();await phone.locator('#scenePreviewDialog').waitFor({state:'visible'});await phone.locator('#confirmScenePreview').tap();
    assert.equal(await phone.locator('#inputPanelToggle').isVisible(),false,'手机端不应显示无效的隐藏题目按钮');
    await phone.locator('[data-add-conic="circle"]').tap();
    const dialog=await phone.locator('#addConicDialog').boundingBox();assert(dialog.x>=0&&dialog.x+dialog.width<=391,'手机模板弹窗不能超出屏幕');
    await phone.locator('#addConicFields [data-equation-param="r"]').fill('');
    await phone.locator('#addConicDialog [data-open-math-keyboard]').tap();
    for(const value of ['3','÷','2'])await phone.locator('#mathKeyboard').getByRole('button',{name:value,exact:true}).tap();
    await phone.locator('#mathKeyboard [data-key-command="close"]').tap();
    await phone.locator('#confirmAddConic').tap();
    const scene=JSON.parse(await phone.locator('#sceneJson').inputValue());assert.equal(scene.type,'ellipse');assert.equal(scene.objects.at(-1).r,1.5);
    await phone.locator('#canvas').scrollIntoViewIfNeeded();
    assert.equal(await phone.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),true,'手机页面不得横向溢出');
    await phone.setViewportSize({width:844,height:390});
    await phone.locator('#canvas').scrollIntoViewIfNeeded();
    assert.equal(await phone.locator('[data-add-conic="ellipse"]').count(),1);
    console.log('PASS: mobile touch input, recognition confirmation, additive curve dialog, no horizontal overflow and orientation change.');
  }finally{await context.close();}
};
