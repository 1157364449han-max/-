const assert=require('node:assert/strict'),test=require('node:test'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const api=require('../dist/question-parts.js');
const indexes=text=>api.splitParts(text).map(part=>part.index);
const referred='已知椭圆C及直线l。\n（1）若离心率为1/2，求C的方程；\n（2）在（1）的条件下，证明两切线垂直；\n（3）在（1）（2）的条件下，求三角形面积最小值。';
test('three real parts survive parent references without duplicate-heading errors',()=>{
  const parts=api.splitParts(referred);assert.deepEqual(parts.map(part=>part.index),[1,2,3]);
  assert.equal(parts[1].body,'在（1）的条件下，证明两切线垂直；');
  assert.equal(parts[2].body,'在（1）（2）的条件下，求三角形面积最小值。');
  assert(parts[2].question.startsWith('已知椭圆C及直线l。\n'));
  assert.deepEqual(api.headings(referred).map(h=>h.number),[1,2,3]);
});
test('inline genuine condition headers and references retain their original numbering',()=>{
  const q='已知条件。（1）若k=1/2，求坐标；（2）在（1）的条件下，求弦长；（3）结合（1）和（2），证明面积定值。';
  assert.deepEqual(indexes(q),[1,2,3]);assert(api.splitParts(q)[2].body.includes('（1）和（2）'));
});
test('TeX-wrapped references do not create extra headings or lose delimiters',()=>{
  const q='已知条件。\n（1）求方程。\n（2）在 $（1）$ 的条件下，根据\\(（1）\\)求坐标。';
  const p=api.splitParts(q);assert.deepEqual(p.map(x=>x.index),[1,2]);assert(p[1].body.includes('$（1）$'));assert(p[1].body.includes('\\(（1）\\)'));
});
test('math arguments, roots, arithmetic and adjacent citations remain unnumbered',()=>{
  for(const q of ['已知点P(sqrt(5),1)，求方程。','设f(1)=2，求f(1)。','圆半径为sqrt (5)，求面积。','已知r=(2)/3，求面积。','已知r=(2)^3，求半径。','根据（1）（2）求结论。','已知(1)(2)为编号引用。','由(i)(ii)得到结论。','选取原题第（1）问。']){
    assert.deepEqual(indexes(q),[0],q);assert.equal(api.splitParts(q)[0].body,q);
  }
});
test('root arguments inside genuine parts remain present and do not split them',()=>{
  const q='点P(sqrt(5),1)在C上。（1）若r=sqrt(3)，求方程；（2）证明f(1)>0。';
  assert.deepEqual(indexes(q),[1,2]);assert(api.splitParts(q)[0].question.includes('sqrt(5)'));
});
test('paragraph headings can start with mathematical subjects, not only commands',()=>{
  const q='已知C\n（1）椭圆的标准方程。\n（2）k=1/2时的交点坐标。';
  assert.deepEqual(indexes(q),[1,2]);assert.deepEqual(indexes('已知条件。（1）椭圆方程。（2）直线方程。'),[1,2]);
});
test('roman nested parts retain 201/202 and parent setup including references',()=>{
  const q='已知椭圆。（1）求方程；（2）在（1）的条件下设动直线。\n(i)若k=1，求弦长。\n(ii)在(i)的条件下，求面积。';
  const p=api.splitParts(q);assert.deepEqual(p.map(x=>x.index),[1,201,202]);
  assert.equal(p[1].parent_index,2);assert.equal(p[2].sub_index,'ii');assert(p[2].body.includes('在（1）的条件下设动直线。'));assert(p[2].body.includes('在(i)的条件下'));
});
test('roman function arguments and reference chains are not nested headers',()=>{
  const q='（1）求f(i)与f(ii)；（2）由(i)(ii)证明结论。';assert.deepEqual(indexes(q),[1,2]);
});
test('duplicate actual numeric or roman headings are specifically rejected',()=>{
  for(const q of ['（1）求x；（1）求y。','（2）设动点。(i)求x。(i)求y。'])assert.throws(()=>api.splitParts(q),error=>error.code==='QUESTION_PARTS_DUPLICATE'&&error.message.includes('重复小问编号'));
});
test('twelve parts are legal; thirteen yields a maximum-specific error',()=>{
  const q=n=>Array.from({length:n},(_,i)=>`（${i+1}）求x。`).join('\n');assert.equal(api.splitParts(q(12)).length,12);
  assert.throws(()=>api.splitParts(q(13)),error=>error.code==='QUESTION_PARTS_MAX'&&error.message.includes('13')&&!error.message.includes('重复'));
  const nested='（1）设动点。'+['i','ii','iii','iv','v','vi','vii','viii'].map(s=>`(${s})求x。`).join('')+'（2）设直线。'+['i','ii','iii','iv','v'].map(s=>`(${s})求y。`).join('');
  assert.throws(()=>api.splitParts(nested),error=>error.code==='QUESTION_PARTS_MAX');
});
test('text bound and invalid type have separate errors',()=>{
  assert.equal(api.splitParts('文'.repeat(18000)).length,1);assert.throws(()=>api.splitParts('文'.repeat(18001)),error=>error.code==='QUESTION_PARTS_LENGTH');assert.throws(()=>api.splitParts(null),error=>error.code==='QUESTION_PARTS_TEXT');
});
test('all bank and sourced regression questions preserve genuine counts and indices',()=>{
  const bank=JSON.parse(fs.readFileSync(path.join(__dirname,'../dist/question-bank.json'),'utf8'));
  const multi={'2023-i-22':[1,2],'2024-ii-19':[1,2,3],'2026-i-18':[1,201,202]};
  for(const item of bank.items)assert.deepEqual(indexes(item.question),multi[item.id]||[0],item.id);
  const source=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/sourced-exam-additions.json'),'utf8'));
  for(const item of source.items)assert.deepEqual(indexes(item.question),item.id==='2022-beijing-19-full'?[1,2]:[0],item.id);
});
test('classic browser global and CommonJS expose the same methods',()=>{
  const context={window:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../dist/question-parts.js'),'utf8'),context);
  assert.equal(context.DongQuestionParts,context.window.DongQuestionParts);assert.equal(typeof context.window.DongQuestionParts.headings,'function');assert.deepEqual(Array.from(context.window.DongQuestionParts.splitParts(referred),p=>p.index),[1,2,3]);
});
test('heading offsets point to the original tokens without changing text',()=>{
  const q='前提\n（1）求x；（2）根据（1）的结果求y。';for(const h of api.headings(q))assert.equal(q.slice(h.index,h.end),h.raw);
});
