/* A sourced exam, actual dependency resolution, and honest numeric boundaries. */
const fs=require('node:fs'),path=require('node:path');
module.exports=async({page,context,assert,screenshot})=>{
  await context.route('**/runtime-config.js',r=>r.fulfill({contentType:'application/javascript',body:'window.DONGJIEXI_CONFIG={deployment:"web",apiEnabled:false};'}));
  await page.evaluate(()=>{localStorage.setItem('dongjiexi:solve-mode:v1','local');localStorage.setItem('dongjiexi:local-workflow:v1','native');});
  await page.reload({waitUntil:'domcontentloaded'});
  const bank=JSON.parse(fs.readFileSync(path.join(__dirname,'../dist/question-bank.json'),'utf8')),original=bank.items.find(q=>q.id==='2024-ii-19').question;
  await page.locator('#question').fill(original);await page.locator('#solveButton').click();
  await page.waitForFunction(()=>['complete','partial'].includes(document.querySelector('#solveProgress').dataset.state));
  const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('zhigeometry:last')));
  let saved=await read();
  assert.deepEqual(saved.solution.completion,{answered:3,total:3},JSON.stringify(saved.solution.parts));
  assert(saved.solution.engineExtensions.includes('hyperbola-iteration'));
  assert.equal(saved.scene.hyperbolaIteration.m,9);
  assert.equal(saved.scene.showDynamic,false);
  assert.match(saved.solution.parts[0].answer,/3.*0/);
  assert.equal(await page.locator('#solution .katex-error').count(),0);
  async function resolved(){
    const scene=JSON.parse(await page.locator('#sceneJson').inputValue());
    return page.evaluate(scene=>{
      const engine=window.DongConstruct.createEngine({model:()=>scene,features:()=>Object.entries(scene.points||{}).map(([name,[x,y]])=>({name,x,y})),coeffs:()=>({A:1/scene.a**2,B:0,C:-1/scene.b**2,D:0,E:0,F:-1}),angle:()=>0,origin:()=>({x:0,y:0})});
      return{scene,geometry:(scene.objects||[]).filter(o=>String(o.id).startsWith('iteration-')).map(o=>({id:o.id,label:o.label,op:o.op,visible:o.visible,shape:engine.resolve(o.id)})),sample:window.DongHyperbolaIteration.sample(scene.hyperbolaIteration,scene.hyperbolaIteration.k,scene.hyperbolaIteration.n)};
    },scene);
  }
  function check(result){
    assert(result.sample.valid,result.sample.reason);
    const actual=result.geometry.filter(o=>['intersection','reflect_axis'].includes(o.op));
    assert(actual.length>=6,'Three actual intersection/reflection steps, not only static samples');
    for(const item of actual){
      assert(item.shape&&item.shape.type==='point',JSON.stringify(item));
      const {x,y}=item.shape,target=result.sample.points[item.label];
      assert(target,'Derived label has a sample coordinate');
      assert(Math.abs(x-target[0])<1e-7*Math.max(1,Math.abs(x))&&Math.abs(y-target[1])<1e-7*Math.max(1,Math.abs(y)),'Actual graph and recurrence agree');
      assert(Math.abs(x*x-y*y-result.scene.hyperbolaIteration.m)<1e-7*Math.max(1,x*x+y*y),'Point lies on current curve');
      if(item.op==='intersection')assert(x<0,'Q lies on the LEFT branch');
      else assert(x>0,'Reflected P lies on the RIGHT branch');
    }
    assert(Math.abs(result.sample.areas[0]-result.sample.areas[1])<1e-6*Math.max(1,result.sample.theoryArea));
  }
  check(await resolved());
  await page.locator('[data-study-part="3"]').click();
  await screenshot('hyperbola-iteration-proof.png',null);
  await page.locator('[data-inspector-view="geometry"]').click();
  await page.locator('#parameterTarget').selectOption('$iteration');
  const set=async(key,value)=>page.locator('[data-iteration-param="'+key+'"]').evaluate((el,value)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));},value);
  await set('k','1/3');await set('n','2');check(await resolved());
  assert.match(await page.locator('#metrics').innerText(),/理论面积定值/);
  await page.locator('#fitIteration').click();await screenshot('hyperbola-iteration-controls.png',null);
  saved=await read();assert.equal(saved.scene.hyperbolaIteration.n,2);assert.equal(saved.scene.hyperbolaIteration.k,1/3);
  await page.reload({waitUntil:'domcontentloaded'});saved=await read();assert.equal(saved.scene.hyperbolaIteration.n,2);check(await resolved());
  await page.locator('[data-inspector-view="geometry"]').click();await page.locator('#parameterTarget').selectOption('$iteration');
  await set('k','0.999');
  const invalid=await resolved();assert.equal(invalid.sample.valid,false);assert.equal(invalid.geometry.length,0,'No stale generated graph after unstable parameters');
  assert.match(await page.locator('#metrics').innerText(),/范围|精度|稳定|过大/);
  await set('k','1/2');await set('n','1');check(await resolved());await page.locator('#fitIteration').click();
  await page.setViewportSize({width:320,height:740});await page.locator('[data-mobile-panel="board"]').click();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  assert.equal(await page.locator('.controls').isVisible(),false);await screenshot('hyperbola-iteration-mobile.png',null);
  await page.setViewportSize({width:1600,height:1050});
  await page.locator('#unrestrictedMove').click();
  await page.locator('#parameterTarget').selectOption('$conic');await page.locator('#params input[data-key="b"][data-param-expression]').fill('4');
  assert.match(await page.locator('#metrics').innerText(),/原题|曲线|一致|等轴/,'Changing the actual curve invalidates the old theorem scene');
  // An arithmetic perturbation checks the parser, not a new teaching example.
  await page.locator('#question').fill(original.replace('(5,4)','(sqrt(5),1)'));await page.locator('#solveButton').click();
  await page.waitForFunction(()=>document.querySelector('#solveProgress').dataset.state==='complete');
  saved=await read();assert.deepEqual(saved.solution.completion,{answered:3,total:3});assert(Math.abs(saved.scene.hyperbolaIteration.m-4)<1e-12);
  assert.equal(await page.locator('#solution .katex-error').count(),0,'Roots inside coordinates are not numbered subquestions');
};
