'use strict';
const assert=require('node:assert/strict');
const {create,MAX_CACHE}=require('../dist/label-layout.js');
const ctx={font:'',measureText(text){return {width:Array.from(text).length*7,actualBoundingBoxAscent:10,actualBoundingBoxDescent:3};},save(){},restore(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},fillRect(){},fillText(){}};
const touches=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
const point=(layout,text,x,y,worldX=x,worldY=y,extra={})=>layout.point({text,x,y,worldX,worldY,...extra});
let cases=0;
function test(name,run){run();cases++;console.log(`PASS: ${name}`);}
test('focus labels avoid reserved axis ticks, including subscripts and primes',()=>{
  const layout=create(ctx).begin(400,300,{sceneKey:'focus'});
  const tick={x:212,y:87,width:12,height:18,text:'2',tag:'axis-tick'};
  layout.reserve(tick);point(layout,'F_2',200,110,0,2);point(layout,"A'",240,140,1,1);
  const output=layout.flush();
  assert.equal(output.length,2);assert.equal(output.some(p=>p.text==='F₂'),true);assert.equal(output.some(p=>p.text==='A′'),true);
  for(const placement of output){assert.equal(touches(placement.rect,tick),false);assert.equal(placement.overlaps,0);}
  assert.equal(touches(output[0].rect,output[1].rect),false);
});
test('same point duplicates collapse while distinct coincident names remain visible',()=>{
  const layout=create(ctx).begin(400,300);
  point(layout,'F₂',200,100,0,2,{key:'focus'});point(layout,'F_2',200,100,0,2,{key:'focus-alias'});
  point(layout,'P',200,100,0,2,{key:'problem-point',priority:100});
  const output=layout.flush();assert.equal(output.length,1);assert.deepEqual(output[0].names,['P','F₂']);assert.match(output[0].text,/P \/ F₂/);
  assert.equal(output[0].groupSize,3);assert.deepEqual(output[0].keys,['focus','focus-alias','problem-point']);
});
test('screen-close points never collapse merely because they share a pixel',()=>{
  const layout=create(ctx).begin(400,300);
  point(layout,'A',200,100,0,0);point(layout,'B',200,100,.01,0);point(layout,'C',201,101,.02,.01);
  const output=layout.flush();assert.equal(output.length,3);
  assert.equal(output.every(p=>p.names.length===1),true);
  for(let i=0;i<output.length;i++)for(let j=i+1;j<output.length;j++)assert.equal(touches(output[i].rect,output[j].rect),false);
});
test('floating-point world coincidence tolerates roundoff but not distinct geometry',()=>{
  const layout=create(ctx).begin(400,300);
  point(layout,'M',150,150,-1,0);point(layout,'N',150,150,-.9999999999999998,0);
  point(layout,'Q',150,150,-1.00001,0);
  const output=layout.flush();assert.equal(output.length,2);assert.equal(output.some(p=>p.names.length===2),true);
});
test('labels stay inside viewport at edges and long names wrap without loss',()=>{
  const layout=create(ctx).begin(180,160);
  for(const [i,x,y] of [[1,0,0],[2,179,0],[3,0,159],[4,179,159]])point(layout,`A_${i}`,x,y,i,0);
  point(layout,'ABCDEFGHIJKLMNOPQRSTUVWXYZ',90,80,5,0);
  const output=layout.flush();assert.equal(output.length,5);
  for(const {rect} of output){assert.ok(rect.x>=0&&rect.y>=0);assert.ok(rect.x+rect.width<=180);assert.ok(rect.y+rect.height<=160);}
  const long=output.find(p=>p.names[0].startsWith('ABC'));assert.ok(long.lines.length>1);assert.equal(long.lines.join(''),'ABCDEFGHIJKLMNOPQRSTUVWXYZ');
});
test('stable rerenders preserve placements even when input order changes',()=>{
  const layout=create(ctx),draw=reverse=>{
    layout.begin(400,300,{sceneKey:'stable'}).reserve({x:204,y:90,width:16,height:22});
    const items=[['A',200,110,0,0],['B',204,108,1,0],['C',210,112,2,0]];
    for(const item of reverse?items.reverse():items)point(layout,...item);
    return layout.flush().map(p=>({key:p.key,rect:p.rect,candidate:p.candidate}));
  };
  assert.deepEqual(draw(false),draw(true));
});
test('dense scenes use callouts and never silently discard labels',()=>{
  const layout=create(ctx).begin(440,300);
  for(let i=0;i<18;i++)point(layout,`P_${i}`,220+i%3,150+i%2,i/10,i/7);
  const output=layout.flush();assert.equal(output.length,18);assert.ok(output.some(p=>p.leader));
  assert.ok(output.every(p=>p.overlaps===0));
});
test('label cache is bounded, reset per scene, and clear removes all state',()=>{
  const layout=create(ctx);
  layout.begin(2400,1600,{sceneKey:'many'});
  for(let i=0;i<MAX_CACHE+16;i++)point(layout,`P${i}`,50+(i%24)*80,50+Math.floor(i/24)*50,i,0);
  layout.flush();assert.equal(layout.snapshot().cacheSize,MAX_CACHE);
  for(let i=0;i<MAX_CACHE+40;i++){layout.begin(320,240,{sceneKey:'cache'});point(layout,`P${i}`,100,100,i,0);layout.flush();}
  assert.ok(layout.snapshot().cacheSize<=MAX_CACHE);
  layout.begin(320,240,{sceneKey:'another'});assert.equal(layout.snapshot().cacheSize,0);
  point(layout,'P',100,100);layout.flush();layout.clear();
  assert.equal(layout.snapshot().cacheSize,0);assert.deepEqual(layout.snapshot().placements,[]);assert.deepEqual(layout.snapshot().groups,[]);
});
test('panning hides labels for cropped-out points but retains edge-visible markers',()=>{
  const layout=create(ctx).begin(400,300);
  point(layout,'A',-7,100,-7,0);point(layout,'B',407,100,407,0);
  point(layout,'C',100,-7,0,-7);point(layout,'D',100,307,0,307);
  point(layout,'E',-4,100,-4,0);point(layout,'F',404,100,404,0);
  const output=layout.flush();assert.equal(output.length,2);assert.deepEqual(output.map(p=>p.text).sort(),['E','F']);
  for(const {rect} of output){assert.ok(rect.x>=0&&rect.x+rect.width<=400);}
});
test('invalid anchors are rejected and annotations are measured and reserved',()=>{
  const layout=create(ctx).begin(400,300);point(layout,'X',NaN,0);point(layout,'Y',0,Infinity);
  layout.annotation({x:200,y:100,text:'切线 t',key:'tangent'});point(layout,'P',200,100,0,0);
  const output=layout.flush();assert.equal(output.length,2);assert.equal(output.some(p=>p.kind==='annotation'),true);
  assert.equal(touches(output[0].rect,output[1].rect),false);
});
test('large translated coordinates do not merge distinct points and common LaTeX names stay readable',()=>{
  const layout=create(ctx).begin(400,300);
  point(layout,'A^{\\prime}',100,100,1e9,0);point(layout,'F_{2}',101,100,1e9+.5,0);
  const output=layout.flush();assert.equal(output.length,2);assert.deepEqual(output.map(p=>p.text).sort(),['A′','F₂']);
});
console.log(`PASS: ${cases} label layout unit tests.`);
