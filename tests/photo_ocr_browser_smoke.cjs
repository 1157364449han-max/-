const assert=require('node:assert/strict');

module.exports=async({page,context})=>{
  await context.route('**/runtime-config.js',route=>route.fulfill({contentType:'application/javascript',body:"window.DONGJIEXI_CONFIG={version:'0.24.0',deployment:'web',apiEnabled:false,apiBase:''};"}));
  await page.reload({waitUntil:'domcontentloaded'});
  assert.equal(await page.locator('#recognizeButton').isDisabled(),false,'Browser OCR must remain available without cloud API');
  assert.equal(await page.locator('#cameraFile').getAttribute('capture'),'environment');
  const png=await page.evaluate(()=>{
    const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=220;
    const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,1200,220);
    ctx.fillStyle='black';ctx.font='64px Arial';ctx.fillText('Parabola y2 = 4x. Point P(1,0).',32,130);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.locator('#imageFile').setInputFiles({name:'question.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
  await page.locator('#recognizeButton').click();
  await page.locator('#recognitionDialog[open]').waitFor({timeout:120000});
  const result=await page.locator('#recognizedText').inputValue();
  assert.match(result,/4x|P\s*\(?1\s*[,，]\s*0/i,'On-device OCR should recognize core math text');
  await page.locator('#recognizedText').fill('已知抛物线 C：y²=4x，点 P(1,0)。');
  await page.locator('#confirmRecognition').click();
  assert.match(await page.locator('#question').inputValue(),/y²=4x/);
};
