module.exports=async({page,context,assert,screenshot})=>{
  await page.evaluate(async()=>{for(const s of await navigator.serviceWorker.getRegistrations())await s.unregister();for(const k of await caches.keys())await caches.delete(k);});
  await context.route('**/runtime-config.js',route=>route.fulfill({contentType:'application/javascript',body:"window.DONGJIEXI_CONFIG={version:'0.23.0',deployment:'web',apiEnabled:false};"}));
  await page.reload({waitUntil:'domcontentloaded'});
  const question=String.raw`已知椭圆 C：$\frac{x^{2}}{9}+\frac{y^{2}}{4}=1$，过点 P(5,0) 作椭圆的两条切线，切点分别为 A、B。
（1）求切点坐标和切线方程。
（2）求三角形 PAB 的面积。`;
  await page.locator('#question').fill(question);
  await page.locator('.question-formula-preview summary').click();
  await page.locator('.question-formula-preview .katex').first().waitFor();
  await page.locator('#solveButton').click();
  await page.waitForFunction(()=>document.querySelector('#solution')?.textContent.includes('逐问作答：2 / 2'));
  const scene=JSON.parse(await page.locator('#sceneJson').inputValue());
  assert.equal(scene.type,'ellipse');assert.equal(scene.a,3);assert.equal(scene.b,2);
  assert.equal(scene.objects.filter(o=>o.role==='external_contact').length,2);
  assert.equal(scene.lines.filter(o=>o.role==='external_tangent').length,2);
  assert(await page.locator('#solution .katex').count()>4,'解析公式必须使用 KaTeX 排版');
  assert.equal(await page.locator('#solution .katex-error').count(),0);
  assert.match(await page.locator('#layers').innerText(),/A 点切线/);
  await page.getByRole('button',{name:'第（2）问',exact:true}).click();
  assert.match(await page.locator('#solution').innerText(),/5\.12/);
  await screenshot('latex-external-tangents.png',null);
  for(const [text,expected] of [
    ['已知圆x²+y²=9，过点P(5,0)作圆的两条切线，切点分别为A、B，求三角形PAB的面积。','7.68'],
    [String.raw`已知椭圆 $\frac{(x-1)^2}{9}+\frac{(y+2)^2}{4}=1$，过点P(6,-2)作两条切线，切点为A、B，求切点坐标。`,'2.8'],
    ['已知圆x²+y²=9，过点P(0,0)作圆的切线，求切线方程。','不存在过该点的实切线']
  ]){
    await page.locator('#question').fill(text);await page.locator('#solveButton').click();
    await page.waitForFunction(value=>document.querySelector('#solution')?.textContent.includes(value),expected);
  }
  await page.locator('#question').fill('已知椭圆x²/9+y²/4=1，求某个三角形的面积。');
  await page.locator('#solveButton').click();
  await page.waitForFunction(()=>document.querySelector('#solution')?.textContent.includes('逐问作答：0 / 1'));
  assert.match(await page.locator('#solution').innerText(),/还需要继续完成/);
  await page.locator('#equation .katex').waitFor({state:'attached'});
  await page.getByRole('button',{name:'参数 / 图层',exact:true}).click();
  await page.locator('#objectType').selectOption('ellipse');
  await page.locator('#objectParam-b').fill('1');
  await page.locator('#objectParam-a').fill(String.raw`\frac{3}{2}`);
  await page.locator('#objectParam-a + .parameter-math-preview .katex').waitFor({state:'attached'});
  await page.locator('#equationPreview .katex').waitFor({state:'attached'});
  await page.locator('#addObject').click();
  assert.equal(JSON.parse(await page.locator('#sceneJson').inputValue()).objects.at(-1).a,1.5,'LaTeX 参数必须真正用于计算，不只是预览');
  await page.evaluate(()=>{
    const panel=document.createElement('div');panel.id='globalMathTest';
    panel.textContent=String.raw`任意动态面板中的公式：\(\frac{a^2}{b}=\sqrt{2}\) 与 $\href{javascript:alert(1)}{危险链接}$`+'\n$$\n'+String.raw`\begin{aligned}x&=\frac12\\y&=2\end{aligned}`+'\n$$';
    document.body.append(panel);
  });
  await page.locator('#globalMathTest .katex').first().waitFor();
  assert.equal(await page.locator('#globalMathTest a[href^="javascript:"]').count(),0,'公式不能创建可执行链接');
  assert.equal(await page.locator('#globalMathTest .katex-display').count(),1,'多行推导必须整块排版');
  await page.locator('#globalMathTest').evaluate(el=>el.remove());
};
