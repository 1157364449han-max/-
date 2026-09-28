module.exports=async({page,assert})=>{
  const scene={type:'circle',r:4,h:0,k:0,points:{},showConic:false,showFeatures:false,showDynamic:false,dynamicLine:false,isFreeBoard:true,lines:[],objects:[{kind:'point',label:'P',x:0,y:0,visible:true}]};
  await page.locator('#sceneJson').evaluate((element,value)=>{element.value=value;document.querySelector('#applyJson').click();},JSON.stringify(scene));
  const canvas=page.locator('#canvas'),box=await canvas.boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
  await page.locator('#pointHoverCard').waitFor({state:'visible'});
  assert.match(await page.locator('#pointHoverCard').getAttribute('aria-label'),/P\(0, 0\)/,'Hover card must expose point name and coordinates');
  assert.equal(await page.locator('#pointHoverCard .katex').count()>0,true,'Point coordinates must be rendered with KaTeX');
  await page.mouse.move(box.x+5,box.y+5);
  assert.equal(await page.locator('#pointHoverCard').isHidden(),true);
  console.log('PASS: hovering a given point shows its exact KaTeX coordinate card.');
};
