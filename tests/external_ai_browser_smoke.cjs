module.exports=async({page,context,assert,screenshot})=>{
  const bank=await page.evaluate(async()=>await(await fetch('question-bank.json')).json());
  const item=bank.items.find(x=>x.id==='2023-i-6');
  let apiCalls=0;
  page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))apiCalls++;});
  await page.evaluate(()=>{localStorage.removeItem('dongjiexi:local-workflow:v1');window.__externalClipboard=[];});
  await context.addInitScript(()=>{window.__externalClipboard=[];Object.defineProperty(navigator.clipboard,'writeText',{configurable:true,value:async text=>window.__externalClipboard.push(text)});});
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#openQuestionBank').click();await page.locator('[data-bank-id="2023-i-6"]').click();await page.locator('[data-bank-action="full"]').click();
  const originalScene=await page.locator('#sceneJson').inputValue();
  await page.locator('#solveButton').click();await page.locator('#externalAIDialog[open]').waitFor();
  assert.equal(await page.locator('#localWorkflow').inputValue(),'clipboard','The first-use local route defaults to copy/paste');
  assert.equal(await page.locator('#solveProgress').getAttribute('data-state'),'waiting');
  assert.equal(apiCalls,0,'Generating a request never calls the platform API');
  await page.locator('#copyExternalRequest').click();
  const prompt=await page.evaluate(()=>window.__externalClipboard.at(-1));assert(prompt.includes(item.question));
  const requestId=prompt.match(/本次请求标识：([^\n]+)/)[1];
  const reply={schema:'dongjiexi-external-v1',requestId,title:item.title,parts:[{...item.parts[0],index:0,status:'answered'}],scene:{type:'circle',h:2,k:0,r:Math.sqrt(5),dynamicLine:false,points:{P:[0,-2]},constructions:[
    {id:'contactA',op:'ellipse_tangent_point',refs:['feature:P','$conic'],branch:0,label:'A'},
    {id:'contactB',op:'ellipse_tangent_point',refs:['feature:P','$conic'],branch:1,label:'B'},
    {id:'tangentPA',op:'line',refs:['feature:P','contactA'],label:'PA'},
    {id:'tangentPB',op:'line',refs:['feature:P','contactB'],label:'PB'},
    {id:'midAB',op:'midpoint',refs:['contactA','contactB'],label:'M'}]}};
  const encode=r=>'```json\n'+JSON.stringify(r)+'\n```';
  await page.locator('#externalReply').fill(encode(reply));await page.locator('#previewExternalReply').click();
  await page.locator('#externalPreview').waitFor({state:'visible'});
  assert.equal(await page.locator('#sceneJson').inputValue(),originalScene,'Preview does not change the board');
  assert.equal(await page.locator('#externalUseScene').isChecked(),true);
  assert(await page.locator('#externalPreview .katex').count()>0,'External formulas use the same LaTeX renderer');
  await screenshot('external-ai-desktop.png','#externalAIDialog');
  await page.locator('#importExternalReply').click();await page.locator('#externalAIDialog').waitFor({state:'hidden'});
  let scene=JSON.parse(await page.locator('#sceneJson').inputValue());
  assert(scene.objects.some(o=>o.id==='midAB'),'Extra answer constructions survive the native parameter correction');
  assert(scene.objects.some(o=>o.id==='tangentPA')&&scene.objects.some(o=>o.id==='tangentPB'));
  assert.match(await page.locator('#solution').textContent(),/外部 AI · 用户粘贴/);
  assert.match(await page.locator('#solution').textContent(),/局部代数核验通过/);
  assert.equal(await page.locator('#followupPanel').isVisible(),false,'Imported AI replies must not silently submit cloud followups');
  assert.equal(apiCalls,0);
  const stableScene=await page.locator('#sceneJson').inputValue(),stableSolution=await page.locator('#solution').textContent();
  await page.locator('#solveButton').click();await page.locator('#externalReply').fill('```json\n{"parts":');await page.locator('#previewExternalReply').click();
  await page.waitForFunction(()=>document.querySelector('#externalFeedback').dataset.state==='error');
  assert.equal(await page.locator('#externalImportOptions').isVisible(),false);
  assert.equal(await page.locator('#sceneJson').inputValue(),stableScene);
  assert.equal(await page.locator('#solution').textContent(),stableSolution);
  await page.locator('#externalReply').fill(encode({...reply,requestId:'another-request'}));await page.locator('#previewExternalReply').click();
  await page.waitForFunction(()=>document.querySelector('#externalFeedback').textContent.includes('另一份'));
  await page.locator('#externalReply').fill(encode({...reply,scene:{...reply.scene,constructions:[{id:'bad',op:'midpoint',refs:['missing','feature:P'],label:'N'}]}}));await page.locator('#previewExternalReply').click();
  await page.locator('#externalImportOptions').waitFor({state:'visible'});
  assert.equal(await page.locator('#externalUseScene').isEnabled(),false);
  assert.match(await page.locator('#externalWarnings').textContent(),/不存在/);
  await page.locator('#repairExternalReply').click();assert((await page.evaluate(()=>window.__externalClipboard.at(-1))).includes('不存在'));
  const plain=item.parts[0].steps.join('\n')+'\n<img src=x onerror="window.__externalUnsafe=true">';
  await page.locator('#externalReply').fill(plain);await page.locator('#previewExternalReply').click();
  await page.locator('#externalImportOptions').waitFor({state:'visible'});
  await page.locator('#importExternalReply').click();assert.match(await page.locator('#externalFeedback').textContent(),/确认/);
  await page.locator('#externalConfirmQuestion').check();await page.locator('#importExternalReply').click();
  await page.locator('#externalAIDialog').waitFor({state:'hidden'});
  assert.equal(await page.locator('#sceneJson').inputValue(),stableScene,'Text-only import preserves the previous diagram');
  assert.equal(await page.evaluate(()=>!!window.__externalUnsafe),false);
  assert.equal(await page.locator('#solution img').count(),0,'Reply HTML remains literal text');
  assert.match(await page.locator('#solution').textContent(),/原始回复/);
  // A reply cannot be applied after the question changes, even if it was already previewed.
  await page.locator('#solveButton').click();await page.locator('#externalReply').fill(encode(reply));await page.locator('#previewExternalReply').click();await page.locator('#externalImportOptions').waitFor({state:'visible'});
  await page.locator('#question').evaluate((e,q)=>{e.value=q;e.dispatchEvent(new Event('input',{bubbles:true}));},bank.items.find(x=>x.id==='2023-i-22').question);
  await page.locator('#importExternalReply').click();assert.match(await page.locator('#externalFeedback').textContent(),/原题已修改/);
  await page.locator('#closeExternalAI').click();
  // Mobile and clipboard-denied fallback remain usable without horizontal overflow.
  await page.setViewportSize({width:390,height:844});await page.locator('#question').fill(item.question);await page.locator('#solveButton').click();await page.locator('#externalAIDialog[open]').waitFor();
  await page.evaluate(()=>{Object.defineProperty(navigator.clipboard,'writeText',{configurable:true,value:async()=>{throw new Error('Denied');}});});
  await page.locator('#copyExternalRequest').click();await page.waitForFunction(()=>document.querySelector('#externalFeedback').textContent.includes('文本已选中'));
  assert.match(await page.locator('#externalFeedback').textContent(),/文本已选中/);
  assert.equal(await page.locator('#externalRequestDetails').getAttribute('open'),'');
  assert(await page.locator('#externalRequestText').evaluate(e=>e.selectionEnd>e.selectionStart));
  const layout=await page.locator('#externalAIDialog').evaluate(e=>{
    const bounds=e.getBoundingClientRect();
    return {left:bounds.left,right:bounds.right,viewport:innerWidth,overflow:getComputedStyle(e).overflowX,
      controls:[...e.querySelectorAll('button,textarea,input,select')].filter(n=>n.getBoundingClientRect().width>0).map(n=>({left:n.getBoundingClientRect().left,right:n.getBoundingClientRect().right}))};
  });
  assert(layout.left>=0&&layout.right<=layout.viewport,'Dialog stays inside the phone viewport');
  assert.equal(layout.overflow,'hidden','Decorative/hidden MathML cannot add a horizontal dialog scrollbar');
  assert(layout.controls.every(n=>n.left>=layout.left&&n.right<=layout.right),'No interactive control is clipped horizontally');
  await screenshot('external-ai-mobile.png','#externalAIDialog');await page.locator('#closeExternalAI').click();
  await page.locator('#solveModeToggle').click();await page.locator('#localWorkflow').selectOption('native');await page.locator('#solveModeToggle').click();
  await page.locator('#solveButton').click();await page.waitForFunction(()=>!document.querySelector('#solveButton').disabled);
  assert.equal(await page.locator('#externalAIDialog').isVisible(),false,'Native solving remains available');
  assert.match(await page.locator('#solution').textContent(),/sin/);
  assert.equal(await page.evaluate(()=>localStorage.getItem('dongjiexi:local-workflow:v1')),'native');
  // Once the website is cached, prompt generation and reply import need no network.
  await page.waitForFunction(()=>navigator.serviceWorker?.controller,null,{timeout:15000});
  await page.evaluate(()=>localStorage.setItem('dongjiexi:local-workflow:v1','clipboard'));
  await context.setOffline(true);await page.reload({waitUntil:'domcontentloaded'});apiCalls=0;
  await page.locator('#question').fill(item.question);await page.locator('#solveButton').click();await page.locator('#externalAIDialog[open]').waitFor();
  const offlineRequest=await page.locator('#externalRequestText').inputValue();
  assert(offlineRequest.includes(item.question));
  const offlineId=offlineRequest.match(/本次请求标识：([^\n]+)/)[1];
  await page.locator('#externalReply').fill(encode({...reply,requestId:offlineId}));await page.locator('#previewExternalReply').click();
  await page.locator('#externalImportOptions').waitFor({state:'visible'});assert.equal(await page.locator('#externalUseScene').isChecked(),true);
  await page.locator('#importExternalReply').click();await page.locator('#externalAIDialog').waitFor({state:'hidden'});
  assert(JSON.parse(await page.locator('#sceneJson').inputValue()).objects.some(o=>o.id==='midAB'));
  assert.equal(apiCalls,0,'Offline copy/paste and verification do not call the platform API');
  await context.setOffline(false);
  console.log('PASS external AI clipboard, sourced exam import, dependent tangents, exact override, literal HTML, malformed/stale replies, manual copy, mobile dialog and offline reload');
};
