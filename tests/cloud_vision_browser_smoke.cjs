module.exports=async({page,context,assert})=>{
  await context.route('**/runtime-config.js',route=>route.fulfill({contentType:'application/javascript',body:'window.DONGJIEXI_CONFIG={version:"0.25.0",deployment:"web",apiEnabled:true,apiBase:"",requiresAuth:false};'}));
  await context.route('**/api/health',route=>route.fulfill({json:{engine:{available:true,installed:true,remote:true,vision:true,models:['test-vision']},default_model:'test-vision'}}));
  let sent=null;
  await context.route('**/api/jobs',route=>{sent=route.request().postDataJSON();return route.fulfill({json:{id:'vision-test',status:'completed',result:{text:'已知抛物线 y²=4x。'}}});});
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#cloudVisionChoice').waitFor({state:'visible'});
  const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=300;c.height=100;c.getContext('2d').fillText('y2=4x',10,50);return c.toDataURL('image/png').split(',')[1];});
  await page.locator('#imageFile').setInputFiles({name:'math.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
  await page.locator('#preferCloudVision').check();
  await page.locator('#recognizeButton').click();
  await page.locator('#recognitionDialog[open]').waitFor();
  assert.equal(sent.kind,'recognize');
  assert.match(sent.image,/^data:image\/png;base64,/);
  assert.match(await page.locator('#recognizedText').inputValue(),/y²=4x/);
};
