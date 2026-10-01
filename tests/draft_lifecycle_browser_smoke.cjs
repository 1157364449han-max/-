/* Lifecycle regressions use a sourced exam and the user's existing focal-chord report. */
module.exports=async({page,context,assert,screenshot})=>{
  await context.route('**/runtime-config.js',route=>route.fulfill({contentType:'application/javascript',body:'window.DONGJIEXI_CONFIG={deployment:"web",apiEnabled:false};'}));
  await page.reload({waitUntil:'domcontentloaded'});
  const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('zhigeometry:last')));
  const scene=async()=>JSON.parse(await page.locator('#sceneJson').inputValue());
  const bank=await page.evaluate(async()=>await(await fetch('question-bank.json')).json());
  const question=bank.items.find(item=>item.id==='2024-ii-19').question;
  async function solve(text){await page.locator('#question').fill(text);await page.locator('#solveButton').click();await page.waitForFunction(()=>['complete','partial','error'].includes(document.querySelector('#solveProgress').dataset.state));await page.waitForFunction(()=>!document.querySelector('#solveButton').disabled);}
  await solve(question);
  const original=await read();assert.deepEqual(original.solution.completion,{answered:3,total:3});
  await page.locator('[data-inspector-view="geometry"]').click();await page.locator('#parameterTarget').selectOption('$iteration');
  await page.locator('#params input[data-iteration-param="k"][type="text"]').fill('3/10');
  await page.locator('#params input[data-iteration-param="n"][type="text"]').fill('2');
  await page.locator('#saveLocal').click();const explored=await read();assert.equal(explored.scene.hyperbolaIteration.k,.3);assert.equal(explored.scene.hyperbolaIteration.n,2);
  await page.reload({waitUntil:'domcontentloaded'});let recovered=await read();assert.equal(recovered.scene.hyperbolaIteration.k,.3,'Reload preserves the explored pose');assert.equal(recovered.scene.hyperbolaIteration.n,2);assert.equal(recovered.question,question);assert.deepEqual(recovered.solution.parts,original.solution.parts,'Original answers remain separate from exploratory geometry');
  await page.locator('#resetParams').click();const reset=await scene();assert.equal(reset.hyperbolaIteration.k,.5,'Reset after reload must use the real original pose, not the saved explored pose');assert.equal(reset.hyperbolaIteration.n,1);assert.equal(await page.locator('#question').inputValue(),question);
  // Drafts from the preceding release did not store an original snapshot.
  await page.evaluate(()=>{const saved=JSON.parse(localStorage.getItem('zhigeometry:last'));delete saved.original;saved.scene.hyperbolaIteration.k=.3;saved.scene.hyperbolaIteration.n=2;saved.exploring=true;localStorage.setItem('zhigeometry:last',JSON.stringify(saved));});
  await page.reload({waitUntil:'domcontentloaded'});await page.locator('#resetParams').click();assert.equal((await scene()).hyperbolaIteration.k,.5,'Legacy draft recovers the original scene from its retained solution');
  const focal='已知抛物线 C：y^2=2px（p>0）的焦点为 F，准线与 x 轴交于点 K，过 F 的直线 l 与抛物线交于 A、B 两点。\n（1）若 |AB|=8，且线段 AB 中点的横坐标为 3，求抛物线 C 的方程；\n（2）在（1）的条件下，若直线 l 的倾斜角为 45°，求 |AB|；\n（3）在（1）（2）的条件下，设 M 为准线上一点，且 MA⊥MB，求点 M 的坐标。';
  await solve(focal);const before=await scene();assert(before.objects.some(object=>object.id==='focal-data-M'));
  await page.locator('[data-inspector-view="geometry"]').click();await page.locator('#objectBuilderDetails').evaluate(element=>element.open=true);await page.locator('#objectType').selectOption('point');await page.locator('#objectParam-x').fill('3');await page.locator('#objectParam-y').fill('7');await page.locator('#objectName').fill('用户点');await page.locator('#addObject').click();
  const added=(await scene()).objects.find(object=>object.label==='用户点');assert(added&&added.source==='user');
  await page.locator('#clearObjects').click();const cleared=await scene();assert(!cleared.objects.some(object=>object.id===added.id));for(const item of before.objects)assert(cleared.objects.some(object=>object.id===item.id),'Clearing manual additions must preserve '+item.id);
  await page.locator('#toolboxToggle').click();await page.locator('#undoDrag').click();assert((await scene()).objects.some(object=>object.id===added.id),'Clearing manual additions is undoable');await page.locator('#redoDrag').click();assert(!(await scene()).objects.some(object=>object.id===added.id));
  await screenshot('draft-original-and-manual-clear.png',null);
  // Invalid editable expressions never mutate the valid scene; a slider correction clears stale validity.
  await page.locator('#parameterTarget').selectOption('$conic');const p=page.locator('#params input[data-key="p"][data-param-expression]');await p.fill('√(');assert.equal((await scene()).p,1);assert.equal(await p.evaluate(element=>element.validity.valid),false);await page.locator('#params input[data-key="p"][type="range"]').evaluate(element=>{element.value='2';element.dispatchEvent(new Event('input',{bubbles:true}));element.dispatchEvent(new Event('change',{bubbles:true}));});assert.equal((await scene()).p,2);assert.equal(await p.evaluate(element=>element.validity.valid),true,'Valid slider input must clear the prior text validation error');
  // Invalid explicit main-curve values are errors, not default values or unbounded viewports.
  await page.locator('#sceneJson').evaluate(element=>{element.closest('details').open=true;});const prior=await read();
  for(const invalid of [{type:'circle',r:0},{type:'circle',r:'Infinity'},{type:'ellipse',a:2,b:1,h:'Infinity'},{type:'parabola',p:-1},{type:'ellipse',a:1,b:2}]){await page.locator('#sceneJson').fill(JSON.stringify(invalid));await page.locator('#applyJson').click();assert.deepEqual((await read()).scene,prior.scene,'Rejected configuration must preserve the current saved scene');assert.equal(await page.locator('#status').evaluate(element=>element.classList.contains('error')),true);}
  await page.locator('#sceneJson').fill(JSON.stringify(prior.scene));
  await page.setViewportSize({width:320,height:740});await page.locator('[data-mobile-panel="board"]').click();if(await page.locator('#toolboxMobileCollapse').isVisible())await page.locator('#toolboxMobileCollapse').click();await page.locator('#toolboxToggle').click();assert(await page.locator('#toolboxMobileCollapse').isVisible());await page.locator('#toolboxMobileCollapse').click();assert(!await page.locator('#toolboxMobileCollapse').isVisible());assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await screenshot('draft-lifecycle-320px.png',null);
};
