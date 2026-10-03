const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const bank=require('../dist/question-bank.js'),data=JSON.parse(fs.readFileSync(require.resolve('../dist/question-bank.json'),'utf8')),item=data.items.find(o=>o.id==='2025-i-18');
const old=()=>{const r=bank.lesson(item,'full');delete r.scene.referenceScene;delete r.scene.objects.find(o=>o.label==='P').motionByPart;return r;};
test('only outdated sourced reference drafts are eligible; free-input solving is never answer lookup',()=>{
  assert.equal(bank.prepareUpgrade(bank.lesson(item,'full'),item),null);
  const r=old();r.solution.mode='cloud-ai';assert.equal(bank.prepareUpgrade(r,item),null);r.solution.mode='reference-lesson';r.solution.lessonSource.id='other';assert.equal(bank.prepareUpgrade(r,item),null);
  const changed=old();changed.question+='（已修改条件）';assert.equal(bank.prepareUpgrade(changed,item),null);
});
test('upgrade is pure, preserves manual objects, note, answers, conversation, poses and visibility',()=>{
  const r=old();r.scene.objects.push({id:'manual',kind:'construction',op:'line',refs:['feature:P','feature:O'],label:'辅助线',source:'user'});r.scene.points.N=[4,5];r.scene.objects[0].visible=false;r.solution.study.notes='我的笔记';r.solution.conversation=[{role:'user',content:'追问'}];r.scene.objects.find(o=>o.label==='P').t=.8;
  const before=JSON.stringify(r),n=bank.prepareUpgrade(r,item);assert.equal(JSON.stringify(r),before,'input draft must not be mutated');assert.equal(n.scene.referenceScene.revision,2);assert(n.scene.objects.find(o=>o.label==='P').motionByPart['201']);assert.deepEqual(n.scene.objects.find(o=>o.id==='manual').refs,['inverse-moving-P','feature:O']);assert.deepEqual(n.scene.points.N,[4,5]);assert.equal(n.scene.objects[0].visible,false);assert.equal(n.scene.objects.find(o=>o.label==='P').t,.8);assert.deepEqual(n.solution.parts,r.solution.parts);assert.deepEqual(n.solution.study,r.solution.study);assert.deepEqual(n.solution.conversation,r.solution.conversation);assert.equal(n.exploring,false);
});
test('legacy static reference points become dependent nodes without retaining duplicate labels',()=>{
  const r=old();r.scene.objects=r.scene.objects.filter(o=>!['P','M','R','|PM|'].includes(o.label));r.scene.points.P=[2,3];r.scene.points.M=[0,1];r.scene.points.R=[1,1];
  const n=bank.prepareUpgrade(r,item);for(const name of ['P','M','R']){assert(!Object.hasOwn(n.scene.points,name));assert.equal(n.scene.objects.filter(o=>o.label===name).length,1);}
});
test('manual ID or point-label collisions abort without changing the draft',()=>{
  for(const object of [{id:'inverse-moving-P',kind:'point',x:1,y:2,label:'X',source:'user'},{id:'manual',kind:'point',x:1,y:2,label:'P',source:'user'}]){
    const r=old();r.scene.objects.push(object);const before=JSON.stringify(r);assert.throws(()=>bank.prepareUpgrade(r,item),/冲突/);assert.equal(JSON.stringify(r),before);
  }
});
