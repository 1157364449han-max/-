const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const sandbox={window:{}};
for(const name of ['number-display.js','equation-builder.js'])vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../dist',name),'utf8'),sandbox);
const n=sandbox.window.DongNumber,b=sandbox.window.DongEquationBuilder;
for(const [value,text] of [[1/3,'1/3'],[Math.sqrt(2),'√2'],[2*Math.sqrt(5)/3,'2√5/3'],[-2/3,'-2/3'],[Math.PI/2,'π/2']]){assert.equal(n.text(value),text);assert(Math.abs(b.scalar(n.input(value))-value)<1e-12);}
assert.match(n.text(1.414214),/^≈/,'不能把截断的小数猜成 √2');
assert.equal(n.input(1+Math.sqrt(2),'1+√2'),'1+√2');
assert.equal(n.input(Math.sqrt(3),'√2'),'√3','拖动后不能保留已失效表达式');
assert.notEqual(n.input(1e-16),'0');
const result=b.buildTemplate(b.templates.function.find(t=>t.id==='sine'),{A:'1+√2',w:'π/2',phi:'0',d:'1/3'});
assert.match(result.equation,/√2/);assert.match(result.equation,/π/);assert.match(result.equation,/1\/3/);
assert.equal(b.editSpec({kind:'slope',m:Math.sqrt(2),b:1/3}).values.k,'√2');
assert.equal(b.editSpec({kind:'vertical',x:1/3}).values.c,'1/3');
assert.equal(b.editSpec({kind:'slope',m:1,b:0,refs:['P','$conic']}),null,'依赖构造不能被编辑成独立直线');
console.log('PASS exact fractions, radicals, source expressions and honest approximations');
