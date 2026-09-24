const QUESTION = "已知椭圆 C:\\dfrac{x^{2}}{4}+y^{2}=1，定点 P(1,0)。过点 P 作任意一条不与 x 轴重合的直线 l，与椭圆 C 交于 A(x_1,y_1),B(x_2,y_2) 两点。设 A' 为点 A 关于 x 轴的对称点，即 A'(x_1,-y_1)，连接 A'B，所得直线记为 m。(1) 证明：直线 m 恒过定点，并求出该定点坐标；(2) 另取一条也过点 P 的直线 l'（与 l 不重合），交椭圆于 C,D，按同样方式得到直线 m'。证明直线 m 与 m' 交于同一定点。";

module.exports = async ({page,assert}) => {
  await page.locator('#question').fill(QUESTION);
  await page.locator('#solveButton').click();
  await page.waitForFunction(() => !document.querySelector('#solveButton')?.disabled);
  const scene=JSON.parse(await page.locator('#sceneJson').inputValue());
  assert.deepEqual(scene.dynamicIntersectionLabels,['A','B']);
  assert.deepEqual(scene.pairedChord?.labels,['C','D']);
  assert.equal(scene.fixedPoint?.x,4);
  assert.equal(scene.lineThrough,'point:P');
  assert.ok(scene.objects.some(item=>item.op==='reflect_axis'&&item.label==='A′'));
  assert.ok(scene.objects.some(item=>item.op==='line'&&item.label==='m'));
  assert.ok(scene.objects.some(item=>item.op==='reflect_axis'&&item.label==='C′'));
  assert.ok(scene.objects.some(item=>item.op==='line'&&item.label==='m′'));
  const solution=await page.locator('#solution').innerText();
  assert.match(solution,/T\(4,0\)/);
  assert.match(solution,/竖直线/);
  assert.match(solution,/两条所得直线可能重合/);
  assert.match(await page.locator('#params').innerText(),/第二条直线角度/);
  const geometry=await page.evaluate(model=>{
    const q={A:1/4,B:0,C:1,D:0,E:0,F:-1},conic={type:'conic',q},origin={x:1,y:0},samples=[];
    for(const [first,second] of [[42,116],[125,55],[90,116]]){
      const makeLine=angle=>{const t=angle*Math.PI/180;return{type:'line',o:origin,d:{x:Math.cos(t),y:Math.sin(t)}};};
      const ab=window.DongConstruct.intersect(makeLine(first),conic),cd=window.DongConstruct.intersect(makeLine(second),conic);
      const feature=()=>[...ab.map((p,i)=>({...p,name:i?'B':'A'})),...cd.map((p,i)=>({...p,name:i?'D':'C'})),{...origin,name:'P'}];
      const engine=window.DongConstruct.createEngine({model:()=>model,features:feature,coeffs:()=>q,origin:()=>origin,angle:()=>first,angle2:()=>second,conicPoint:()=>null,conicProject:()=>null});
      const m=engine.resolve('reflected-chord-m'),mPrime=engine.resolve('reflected-chord-m-prime'),distance=line=>line?Math.abs((4-line.o.x)*line.d.y+line.o.y*line.d.x)/Math.hypot(line.d.x,line.d.y):null;
      samples.push({first,second,m:distance(m),mPrime:distance(mPrime)});
    }
    return samples;
  },scene);
  for(const sample of geometry){if(sample.first===90){assert.equal(sample.m,null,'竖直线处 A′=B，m 不应被虚构');continue;}assert.ok(sample.m<1e-8&&sample.mPrime<1e-8,JSON.stringify(sample));}
  const major=page.locator('#params input[data-key="a"][data-param-expression="true"]');
  await major.evaluate(el=>{el.value='3';el.dispatchEvent(new Event('input',{bubbles:true}));});
  assert.equal(JSON.parse(await page.locator('#sceneJson').inputValue()).fixedPoint.x,9,'半轴变化时定点必须同步重算');
};
