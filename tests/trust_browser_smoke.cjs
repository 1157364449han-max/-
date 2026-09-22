module.exports = async ({page, assert, screenshot}) => {
  const question = '椭圆 x²/4+y²/3=1。（1）求与直线 y=0 的交点。';
  const solution = {
    mode:'local-ollama', model:'test-model', title:'可信度界面测试', restatement:question,
    knowns:['椭圆 $x^2/4+y^2/3=1$'], strategy:'联立方程。', assumptions:[],
    completion:{answered:1,total:1},
    verification:{status:'locally-verified',level:1,message:'已完成 2 项局部代数核验；文字证明尚未完整验证。',counts:{verified:2,contradicted:0,unresolved:0},checks:[
      {id:'curve-structure',label:'主曲线参数',status:'verified',detail:'参数有效。',formula:'x^2/4+y^2/3-1=0'},
      {id:'line-0',label:'x轴 与曲线关系',status:'verified',detail:'两个实交点。',formula:'x^2/4-1=0',part:1},
    ]},
    problemModel:{schema:'dongjiexi-problem-model/v1',source:{confirmed:true,ambiguities:[]},curve:{kind:'ellipse'},points:[],lines:[{id:'line-0'}],parts:[{index:1,goal:'intersection'}]},
    parts:[{index:1,label:'第（1）问',body:'求交点',answer:'交点为 $(-2,0),(2,0)$。',steps:['联立得到 $x^2/4=1$。'],status:'answered',
      verification:{status:'locally-verified',verified:2,conflicts:0,message:'2 项局部核验通过'},
      derivation:{equations:['$x^2/4=1$'],substitutions:[],candidate_solutions:['$x=\\pm2$'],domain:[],proof_obligations:['逐个交点代回两条方程']}}],
    scene:{type:'ellipse',a:2,b:Math.sqrt(3),h:0,k:0,orientation:'horizontal',theta:0,dynamicLine:false,lineThrough:'center',points:{},lines:[{kind:'slope',m:0,b:0,label:'x轴',part:1,source:'model'}],objects:[],provenance:{curve:'model-checked'}},
  };

  await page.route('**/api/jobs', route => route.fulfill({status:202,json:{id:'trust-test',status:'completed',result:solution}}));
  await page.locator('#question').fill(question);
  await page.locator('#solveButton').click();
  await page.waitForFunction(() => document.querySelector('#solution')?.textContent.includes('局部代数核验通过'));
  assert.match(await page.locator('.trust-summary').textContent(), /通过 [2-9]\d*/);
  assert.match(await page.locator('.verification-status').textContent(), /局部代数核验通过/);
  await page.locator('.verification-details summary').click();
  assert.match(await page.locator('.verification-details').textContent(), /两个实交点/);
  await page.locator('.proof-obligations summary').click();
  assert.match(await page.locator('.proof-obligations').textContent(), /代回/);
  assert.match(await page.locator('.problem-model').textContent(), /结构化题目模型/);

  await page.evaluate(() => document.querySelector('#recognitionDialog').showModal());
  await page.locator('#recognizedText').fill('椭圆的离心率为[看不清]，求方程');
  await page.locator('#confirmRecognition').click();
  assert.notEqual(await page.locator('#question').inputValue(), '椭圆的离心率为[看不清]，求方程');
  assert.match(await page.locator('#status').textContent(), /补正/);

  await page.evaluate(scene => {document.querySelector('#recognitionDialog').close();document.querySelector('#sceneJson').value=JSON.stringify(scene);document.querySelector('#applyJson').click();}, {type:'parabola',p:1,direction:1,h:0,k:0,orientation:'horizontal',theta:0,dynamicLine:true,lineThrough:'center',points:{},lines:[],objects:[]});
  assert.match(await page.locator('#metrics').textContent(), /不能据此判相切/);
  await screenshot('董解析-0.11.0-可信度核验.png', null);
  console.log('PASS: trust status, deterministic details, proof obligations, OCR uncertainty guard, and linear-intersection tangent guard.');
};
