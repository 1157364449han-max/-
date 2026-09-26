module.exports=async({page,assert,screenshot})=>{
  assert.equal(await page.locator('#toolboxToggle').getAttribute('aria-expanded'),'false');
  assert.equal(await page.locator('#objectBuilderDetails').evaluate(el=>el.open),false);
  assert.equal(await page.locator('.compact-section').filter({hasText:'最值探索与定位'}).evaluate(el=>el.open),false);
  await page.locator('.quick-function-details > summary').click();
  for(const [family,label] of [['sine','正弦'],['cosine','余弦'],['tangent','正切']]){
    await page.locator(`[data-quick-function="${family}"]`).click();
    const scene=JSON.parse(await page.locator('#sceneJson').inputValue());
    assert.ok(scene.objects.some(obj=>obj.kind==='function'&&obj.family===family),`${label}未加入画板`);
  }
  assert.equal((JSON.parse(await page.locator('#sceneJson').inputValue()).objects||[]).filter(obj=>obj.kind==='function').length,3);
  await screenshot('quick-trigonometry.png', '.board-shell');

  const coloredAt=async({x,y,rx,ry,zooms})=>page.evaluate(({x,y,rx,ry,zooms})=>{
    const canvas=document.querySelector('#canvas'),rect=canvas.getBoundingClientRect(),ctx=canvas.getContext('2d'),scale=Math.max(2*rx/rect.width,2*ry/rect.height)*1.25**zooms;
    const px=Math.round((x+scale*rect.width/2)/scale*canvas.width/rect.width),py=Math.round((scale*rect.height/2-y)/scale*canvas.height/rect.height);
    if(px<0||py<0||px>=canvas.width||py>=canvas.height)return false;
    const data=ctx.getImageData(Math.max(0,px-5),Math.max(0,py-5),11,11).data;
    for(let i=0;i<data.length;i+=4)if(data[i]<80&&data[i+1]>115&&data[i+1]<190&&data[i+2]>100&&data[i+2]<190)return true;
    return false;
  },{x,y,rx,ry,zooms});
  await page.locator('[data-quick-conic="parabola"]').click();
  for(let i=0;i<10;i++)await page.locator('#zoomOut').click();
  assert.equal(await coloredAt({x:16*16/(4*1.5),y:16,rx:7.5,ry:6,zooms:10}),true,'抛物线应延伸到当前视野内的远端');
  await page.locator('[data-quick-conic="hyperbola"]').click();
  for(let i=0;i<8;i++)await page.locator('#zoomOut').click();
  const y=16,x=3*Math.sqrt(1+(y/2)**2);
  assert.equal(await coloredAt({x,y,rx:5.25,ry:3.8,zooms:8}),true,'双曲线应延伸到当前视野内的远端');
};
