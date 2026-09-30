module.exports=async({page,context,assert,screenshot})=>{
  await context.route('**/runtime-config.js',r=>r.fulfill({contentType:'application/javascript',body:'window.DONGJIEXI_CONFIG={deployment:"web",apiEnabled:true,requiresAuth:false};'}));
  await context.route('**/api/health',r=>r.fulfill({json:{app:'董解析',capabilities:{transport:'sse'},engine:{available:true,installed:true,remote:true,models:['test-cloud']},default_model:'test-cloud'}}));
  const bank=await page.evaluate(async()=>await(await fetch('question-bank.json')).json());
  let raw={title:'协议测试：不是实际模型正确率',parts:[{index:0,answer:'测试',steps:['仅供协议测试'],status:'answered'}],scene:{type:'circle',h:2,k:0,r:Math.sqrt(5),dynamicLine:false,points:{P:[0,-2]},constructions:[
    {id:'contactA',op:'ellipse_tangent_point',refs:['feature:P','$conic'],branch:0,label:'A'},
    {id:'contactB',op:'ellipse_tangent_point',refs:['feature:P','$conic'],branch:1,label:'B'},
    {id:'tangentPA',op:'tangent',refs:['contactA','$conic'],label:'PA'},
    {id:'tangentPB',op:'tangent',refs:['contactB','$conic'],label:'PB'},
    {id:'midAB',op:'midpoint',refs:['contactA','contactB'],label:'N'}]}};
  await context.route('**/api/stream',r=>r.fulfill({contentType:'text/event-stream',body:'data: '+JSON.stringify({choices:[{delta:{content:JSON.stringify(raw)}}]})+'\n\ndata: '+JSON.stringify({choices:[{delta:{},finish_reason:'stop'}]})+'\n\ndata: [DONE]\n\n'}));
  await page.evaluate(()=>localStorage.setItem('dongjiexi:solve-mode:v1','cloud'));await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('#engineStatus').classList.contains('ready'));
  await page.locator('#question').fill(bank.items.find(q=>q.id==='2023-i-6').question);await page.locator('#solveButton').click();
  await page.waitForFunction(()=>document.querySelector('#solution').textContent.includes('协议测试'));
  const scene=JSON.parse(await page.locator('#sceneJson').inputValue());
  assert.equal(scene.showDynamic,false);
  assert(scene.objects.some(n=>n.id==='midAB'),'Native parameter correction preserves additional cloud constructions');
  assert.equal(scene.objects.filter(n=>n.op==='tangent').length,2);
  assert.equal(scene.objects.filter(n=>n.op==='ellipse_tangent_point').length,2,'No duplicate tangent contacts');
  await page.locator('.diagram-audit summary').click();
  assert.match(await page.locator('.diagram-audit').textContent(),/不是一般性证明/);
  assert.match(await page.locator('.diagram-audit').textContent(),/切点在曲线上/);
  await page.locator('[data-diagram-recheck]').click();
  assert.match(await page.locator('.diagram-audit').textContent(),/已核对当前图形/);
  assert.equal(await page.locator('#solution .katex-error').count(),0);
  await screenshot('cloud-tangent-no-extraneous-secant.png',null);
  await page.waitForFunction(()=>!document.querySelector('#solveButton').disabled);
  raw={title:'未覆盖求解测试',parts:[{index:0,status:'needs_information',answer:'动直线斜率未知，图形不唯一，因此条件不足',steps:['无法确定唯一图形']}],scene:null};
  await page.locator('#question').fill(bank.items.find(q=>q.id==='2024-ii-19').question.replace(/[（(]\d+[）)]/g,''));await page.locator('#solveButton').click();
  await page.waitForFunction(()=>document.querySelector('#solution').textContent.includes('未覆盖求解测试'));
  assert.match(await page.locator('#solution').textContent(),/不代表原题缺少条件/);
  assert.equal(await page.locator('.answer-status').textContent(),'尚未完整解答');
  assert.match(await page.locator('.trust-summary').textContent(),/未决 1/);
  assert.equal(await page.evaluate(()=>window.DongSceneAudit.visible({parts:[2,3]},2)),true);
  assert.equal(await page.evaluate(()=>window.DongSceneAudit.visible({parts:[2,3]},1)),false);
  await page.waitForFunction(()=>!document.querySelector('#solveButton').disabled);
  raw={title:'故意错误的模型输出：独立复算测试',parts:[{index:0,status:'answered',answer:'$m=3$',steps:['错误地把未知分母假设成正数']}],scene:{type:'hyperbola',a:1,b:Math.sqrt(3),orientation:'horizontal',dynamicLine:false}};
  const fs=require('node:fs'),path=require('node:path'),source=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/sourced-exam-additions.json'),'utf8'));
  await page.locator('#question').fill(source.items.find(q=>q.id==='2022-beijing-12').question);await page.locator('#solveButton').click();
  await page.waitForFunction(()=>document.querySelector('#solution').textContent.includes('故意错误的模型输出'));
  const corrected=await page.evaluate(()=>JSON.parse(localStorage.getItem('zhigeometry:last')).solution);
  assert.match(corrected.parts[0].answer,/m=-3/);
  assert.match(corrected.parts[0].model_answer,/m=3/,'Wrong original model answer remains separately inspectable');
  assert.equal(corrected.scene.orientation,'vertical');
  assert.equal(corrected.verification.counts.contradicted,0);
  assert(corrected.verification.checks.filter(c=>c.id.startsWith('conic-parameter')).every(c=>c.status==='verified'));
  assert.equal(await page.locator('#solution .katex-error').count(),0);
  await screenshot('cloud-sign-error-independent-correction.png',null);
  await page.waitForFunction(()=>!document.querySelector('#solveButton').disabled);
  const interceptQuestion=source.items.find(q=>q.id==='2022-beijing-19-full').question;
  raw={title:'正确答案依赖图合并回归',parts:[{index:1,status:'answered',answer:'方程',steps:['测试']},{index:2,status:'answered',answer:'错误的 k=1',steps:['测试']}],scene:{type:'ellipse',a:2,b:1,dynamicLine:true,dynamicIntersectionLabels:['B','C'],lineThrough:'point:P',points:{A:[0,1],P:[-2,1]},lines:[{kind:'slope',m:-4,b:-7,label:'l',part:2}]}};
  await page.locator('#question').fill(interceptQuestion);await page.locator('#solveButton').click();
  await page.waitForFunction(()=>document.querySelector('#solution').textContent.includes('正确答案依赖图合并回归'));
  const projection=await page.evaluate(()=>JSON.parse(localStorage.getItem('zhigeometry:last')).solution);
  assert.match(projection.parts[1].answer,/-4/);
  assert.equal(projection.sceneAudit.invalid.length,0,JSON.stringify(projection.sceneAudit));
  assert(projection.scene.lines.some(n=>n.id==='projection-axis-2'&&n.visible===false),'Hidden dependency must be merged even without a derived source tag');
  assert.equal(projection.scene.objects.filter(n=>['M','N'].includes(n.label)).length,2);
  await page.getByRole('button',{name:'第（2）问',exact:true}).click();
  await screenshot('cloud-projection-complete-dependency-merge.png',null);
};
