module.exports=async({page,assert,screenshot})=>{
  await page.setViewportSize({width:390,height:844});
  const panels={input:'.controls',lesson:'.inspect',board:'.board-shell'};
  const select=async name=>{
    await page.locator(`[data-mobile-panel="${name}"]`).click();
    for(const [key,selector] of Object.entries(panels))assert.equal(await page.locator(selector).isVisible(),key===name);
    assert.equal(await page.locator(`[data-mobile-panel="${name}"]`).getAttribute('aria-pressed'),'true');
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await page.waitForFunction(()=>document.querySelector('.workspace').getBoundingClientRect().top>=document.querySelector('.mobile-panel-nav').getBoundingClientRect().bottom-1);
  };
  await select('input');
  await page.locator('#question').fill('椭圆 C：x²/4+y²=1，求标准方程。');
  await page.locator('#solveButton').click();
  await page.waitForFunction(()=>!document.querySelector('#solveButton').disabled);
  const scene=await page.locator('#sceneJson').inputValue();
  await select('lesson');
  assert.equal(await page.locator('#solution').isVisible(),true);
  await page.evaluate(()=>scrollTo(0,document.body.scrollHeight));
  assert.equal(await page.locator('.board-shell').isVisible(),false,'解析向下滚动不能露出画板');
  await screenshot('mobile-lesson.png',null);
  await select('board');
  const canvas=await page.locator('#canvas').boundingBox();assert(canvas.width>250&&canvas.height>200);
  assert.equal(await page.locator('.board-shell').evaluate(el=>getComputedStyle(el).position),'relative');
  await screenshot('mobile-board.png',null);
  for(const size of [{width:320,height:568},{width:390,height:844},{width:740,height:390}]){
    await page.setViewportSize(size);
    await select('board');
    if(await page.locator('#toolboxToggle').getAttribute('aria-expanded')==='false')await page.locator('#toolboxToggle').click();
    await page.waitForTimeout(100);
    const layout=await page.evaluate(()=>{const tools=document.querySelector('#nativeToolbar').getBoundingClientRect(),canvas=document.querySelector('.canvas-wrap').getBoundingClientRect();return{toolsBottom:tools.bottom,canvasTop:canvas.top,height:canvas.height,overflow:document.documentElement.scrollWidth>innerWidth+1};});
    assert(!layout.overflow,'Expanded tools do not overflow the phone');
    assert(layout.canvasTop>=layout.toolsBottom-1,'Expanded tools do not overlap canvas');
    assert(layout.height>=300,'Expanded tools do not compress the canvas');
    await page.locator('#toolboxMobileCollapse').click();
    assert.equal(await page.locator('#toolboxToggle').getAttribute('aria-expanded'),'false');
  }
  await page.setViewportSize({width:390,height:844});
  await select('input');
  assert.match(await page.locator('#question').inputValue(),/x²\/4/);
  assert.equal(await page.locator('#sceneJson').inputValue(),scene,'切换不重建或丢失图稿');
  await page.setViewportSize({width:1600,height:1050});
  for(const selector of Object.values(panels))assert.equal(await page.locator(selector).isVisible(),true,'桌面恢复三栏');
  await page.setViewportSize({width:375,height:667});
  await select('board');
  await select('lesson');
};
