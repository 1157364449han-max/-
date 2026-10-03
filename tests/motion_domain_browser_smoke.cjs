module.exports=async({page,assert,screenshot})=>{
  const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('zhigeometry:last')));
  const geometry=async()=>page.evaluate(m=>{
    const c=window.DongConstruct.conicShape({...m,conicType:m.type}),e=window.DongConstruct.createEngine({model:()=>m,features:()=>Object.entries(m.points).map(([name,[x,y]])=>({name,x,y})),coeffs:()=>c.q,conicPoint:c.pointAt,conicProject:c.project});
    const visible=o=>o.visible!==false&&(m.activePart==null||o.part==null&&!o.parts?.length||o.part===m.activePart||o.parts?.includes(m.activePart));
    let rx=m.a*1.75,ry=m.b*1.9;
    for(const o of m.objects.filter(visible))if(o.kind==='circle'){rx=Math.max(rx,Math.abs(o.h||0)+o.r*1.3);ry=Math.max(ry,Math.abs(o.k||0)+o.r*1.3);}
    const points=[...Object.entries(m.points).filter(([name])=>visible({parts:m.pointParts?.[name]})).map(([,xy])=>({x:xy[0],y:xy[1]})),...m.objects.filter(visible).map(o=>e.resolve(o.id)).filter(p=>p?.type==='point')];
    for(const p of points){rx=Math.max(rx,Math.abs(p.x)*1.18);ry=Math.max(ry,Math.abs(p.y)*1.18);}
    return{rx,ry,P:e.resolve('inverse-moving-P'),M:e.resolve('inverse-moving-M'),R:e.resolve('inverse-derived-R'),manual:Object.fromEntries(m.objects.filter(o=>o.source==='user').map(o=>[o.id,e.resolve(o.id)]))};
  },(await read()).scene);
  const near=(a,b)=>assert(Math.abs(a-b)<1e-5,`${a} != ${b}`);
  let xy;
  const fit=async()=>{await page.locator('#homeButton').click();const {rx,ry}=await geometry(),b=await page.locator('#canvas').boundingBox(),scale=Math.max(2*rx/b.width,2*ry/b.height);xy=p=>({x:b.x+b.width/2+p.x/scale,y:b.y+b.height/2-p.y/scale});};
  const drag=async(from,to)=>{const a=xy(from),b=xy(to);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:10});await page.mouse.up();};
  await page.locator('#openQuestionBank').click();await page.locator('#bankList button').first().waitFor();await page.locator('#bankResetFilters').click();await page.locator('[data-bank-id="2025-i-18"]').click();await page.locator('[data-bank-action="full"]').click();
  await page.locator('[data-study-part="201"]').click();await fit();await drag((await geometry()).P,{x:3,y:2});near((await geometry()).P.x,3);near((await geometry()).P.y,2);near((await geometry()).R.x,.5);near((await geometry()).R.y,-.5);
  assert(await page.locator('#motionPlay').isDisabled(),'plane P has no invented animation path');await drag((await geometry()).P,{x:0,y:2});assert(Math.abs((await geometry()).P.x)>1e-8,'excluded axis retains the last legal drag position');
  await drag((await geometry()).P,{x:3,y:2});near((await geometry()).P.x,3);
  await page.locator('[data-study-part="202"]').click();await fit();await drag((await geometry()).P,{x:6,y:-3});const circle=(await geometry()).P;near(circle.x**2+(circle.y+4)**2,18);
  await page.locator('[data-study-part="201"]').click();near((await geometry()).P.x,3);near((await geometry()).P.y,2);
  await page.locator('#unrestrictedMove').click();await page.locator('[data-study-part="202"]').click();assert.equal(await page.locator('#unrestrictedMove').getAttribute('aria-pressed'),'false');near((await geometry()).P.x,circle.x);
  assert.equal(await page.locator('#motionRules').evaluate(e=>e.open),false,'range controls are collapsed by default');await page.locator('#toolboxToggle').click();await page.locator('#motionRules summary').click();await page.locator('#motionRulePoint').selectOption('inverse-moving-P');assert(await page.locator('#motionRuleKind').isDisabled(),'cannot edit given premises');
  // Real native construction: add a curve-bound point on the sourced ellipse.
  await page.locator('#motionRules').evaluate(e=>e.open=false);await page.locator('[data-construct="point"]').click();await fit();const q=xy({x:1.5,y:Math.sqrt(3)/2});await page.mouse.click(q.x,q.y);await page.locator('#moveMode').click();await page.locator('#motionRules summary').click();
  const manual=(await read()).scene.objects.find(o=>o.source==='user'&&o.op==='point_on');assert(manual,'native point tool must bind to the existing ellipse');await page.locator('#motionRulePoint').selectOption(manual.id);assert(!(await page.locator('#motionRuleKind').isDisabled()));
  await page.locator('#motionRuleKind').selectOption('arc');await page.locator('#motionRuleMin').fill('0');await page.locator('#motionRuleMax').fill('π/2');await page.locator('#motionRuleMinClosed').uncheck();await page.locator('#motionRuleMaxClosed').uncheck();await page.locator('#applyMotionRule').click();assert.match(await page.locator('#motionRuleFeedback').innerText(),/已应用/);
  await fit();await drag((await geometry()).manual[manual.id],{x:-3,y:-1});let p=(await geometry()).manual[manual.id];assert(p&&p.x>0&&p.y>0,'cannot drag beyond the open first-quadrant arc');
  const before=(await read()).scene.objects.find(o=>o.id===manual.id);await page.locator('#motionRuleKind').selectOption('x');await page.locator('#motionRuleMin').fill('20');await page.locator('#motionRuleMax').fill('30');await page.locator('#applyMotionRule').click();assert.match(await page.locator('#motionRuleFeedback').innerText(),/未找到/);assert.deepEqual((await read()).scene.objects.find(o=>o.id===manual.id),before,'empty curve intersection must roll back atomically');
  await page.locator('#motionPlay').click();await page.waitForTimeout(800);await page.locator('#motionPlay').click();p=(await geometry()).manual[manual.id];assert(p&&p.x>0&&p.y>0);const played=(await read()).scene.objects.find(o=>o.id===manual.id);assert(played.t>0&&played.t<Math.PI/2);
  await screenshot('motion-domains-and-part-poses.png',null);
  await page.locator('#motionRules').evaluate(e=>e.open=false);await page.locator('[data-inspector-view="geometry"]').click();await page.locator('#parameterTarget').selectOption('$conic');await page.locator('#unrestrictedMove').click();await fit();await drag({x:0,y:-1},{x:4,y:-2});near((await read()).scene.motionOverrides['feature:A'].x,4);await page.locator('#params input[data-key="a"][type="text"]').fill('6');assert.equal((await read()).scene.a,6);
  // Simulate an older reloaded draft whose live baseline was accidentally
  // recaptured after exploration, but still has its original snapshot.
  await page.evaluate(()=>{const draft=JSON.parse(localStorage.getItem('zhigeometry:last'));draft.scene.points.A=[4,-2];draft.scene.motionBaseline.values.a=6;draft.scene.motionBaseline.points={A:[4,-2]};localStorage.setItem('zhigeometry:last',JSON.stringify(draft));});
  await page.reload({waitUntil:'domcontentloaded'});assert.equal((await read()).scene.a,3,'reload uses the original snapshot even after an older baseline recapture');assert.deepEqual((await read()).scene.points.A,[0,-1]);assert.equal((await read()).exploring,false);assert.equal(await page.locator('#unrestrictedMove').getAttribute('aria-pressed'),'false');assert((await geometry()).manual[manual.id],'user construction survives refresh');
  for(const width of [390,320]){await page.setViewportSize({width,height:844});await page.locator('[data-mobile-panel="board"]').click();if(await page.locator('#toolboxToggle').getAttribute('aria-expanded')==='false')await page.locator('#toolboxToggle').click();await page.locator('#motionRules').evaluate(e=>e.open=true);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await screenshot(`motion-domains-${width}px.png`,null);}
};
