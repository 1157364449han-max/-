module.exports=async({page,context,assert,screenshot})=>{
  await page.evaluate(async()=>{
    const bank=await(await fetch('question-bank.json')).json(),item=bank.items.find(o=>o.id==='2025-i-18'),record=window.DongQuestionBank.lesson(item,'full');
    delete record.scene.referenceScene;delete record.scene.objects.find(o=>o.label==='P').motionByPart;
    record.scene.objects.push({id:'manual-kept',kind:'construction',op:'line',refs:['feature:O','inverse-moving-P'],source:'user',label:'我的辅助线'});record.solution.study.notes='保留我的笔记';record.solution.conversation=[{role:'user',content:'旧题追问'}];
    localStorage.setItem('zhigeometry:last',JSON.stringify({...record,grid:true,guides:true}));
  });
  await page.reload({waitUntil:'domcontentloaded'});await page.locator('#lessonUpgradeNotice').waitFor({state:'visible'});
  const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('zhigeometry:last')));const before=await read();
  // Failed persistent backup must not mutate live geometry or discard history.
  await page.evaluate(()=>{window.__storageSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='dongjiexi:lesson-backups:v1')throw new DOMException('full','QuotaExceededError');return window.__storageSet.call(this,k,v);};});
  await page.locator('#upgradeReferenceScene').click();assert.match(await page.locator('#status').innerText(),/未升级/);assert.deepEqual((await read()).scene,before.scene);await page.evaluate(()=>{Storage.prototype.setItem=window.__storageSet;delete window.__storageSet;});
  await page.locator('#upgradeReferenceScene').click();let after=await read();assert.equal(after.scene.referenceScene.revision,2);assert(after.scene.objects.find(o=>o.label==='P').motionByPart['201']);assert(after.scene.objects.some(o=>o.id==='manual-kept'));assert.deepEqual(after.solution.parts,before.solution.parts);assert.deepEqual(after.solution.study,before.solution.study);assert.deepEqual(after.solution.conversation,before.solution.conversation);
  const backups=await page.evaluate(()=>JSON.parse(localStorage.getItem('dongjiexi:lesson-backups:v1')));assert.equal(backups.length,1);assert.equal(backups[0].title.startsWith('升级前备份'),true);assert.deepEqual(backups[0].scene,before.scene);
  await page.locator('#openNotebook').click();const backup=page.locator('#notebookList .notebook-entry').filter({hasText:'升级前备份'});assert.equal(await backup.count(),1);await backup.getByRole('button',{name:'打开',exact:true}).click();await page.locator('#lessonUpgradeNotice').waitFor({state:'visible'});assert(!(await read()).scene.objects.find(o=>o.label==='P').motionByPart);
  await page.locator('#upgradeReferenceScene').click();await page.reload({waitUntil:'domcontentloaded'});assert.equal(await page.locator('#lessonUpgradeNotice').isVisible(),false,'upgraded draft must not repeatedly prompt');assert.equal((await read()).solution.study.notes,'保留我的笔记');
  await page.waitForFunction(()=>navigator.serviceWorker.controller);await context.setOffline(true);await page.reload({waitUntil:'domcontentloaded'});assert.equal((await read()).scene.referenceScene.revision,2);assert.equal(await page.locator('#lessonUpgradeNotice').isVisible(),false);assert((await read()).scene.objects.some(o=>o.id==='manual-kept'));await context.setOffline(false);
  await screenshot('reference-upgrade-preserved-notes.png',null);
};
