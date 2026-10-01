const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const context={window:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../dist/goal-coverage.js'),'utf8'),context);
const covered=context.window.DongGoalCoverage.covered;
for(const [body,kind,labels,type,expected] of [
 ['求焦点坐标。','feature',['C'],'ellipse',true],
 ['求焦点、顶点、离心率和准线方程。','feature',['C'],'ellipse',true],
 ['求长轴和短轴长。','feature',['C'],'ellipse',true],
 ['求焦点坐标并求椭圆面积。','feature',['C'],'ellipse',false],
 ['求焦点坐标的平方和。','feature',['C'],'ellipse',false],
 ['求渐近线方程。','feature',['C'],'ellipse',false],
 ['求渐近线方程。','feature',['C'],'hyperbola',true],
 ['求焦点坐标。','feature',['C'],'circle',false],
 ['求离心率。','feature',['C'],'circle',false],
 ['求圆心和半径。','feature',['C'],'circle',true],
 ['求实轴长和虚轴长。','feature',['C'],'hyperbola',true],
 ['求离心率和圆心。','feature',['C'],'hyperbola',false],
 ['求C的方程。（选取原题第（1）问。）','equation',['C'],'hyperbola',true],
 ['求C的方程。 (选取原题第(1)问。)','equation',['C'],'ellipse',true],
 ['求标准方程并求面积。','equation',['C'],'ellipse',false],
 ['给出未知量t的范围。','equation',['C'],'ellipse',false],
 ['求AB的弦长和中点M坐标。','metric',['A','B','M'],'ellipse',true],
 ['求AB的弦长平方。','metric',['A','B','M'],'ellipse',false],
 ['求AB的弦长并求焦点。','metric',['A','B','M'],'ellipse',false],
 ['求P处切线方程。','tangent',['P'],'parabola',true],
 ['求P处切线方程并求曲率。','tangent',['P'],'parabola',false],
 ['求P处法线方程。','normal',['P'],'parabola',true],
 ['求P处法线方程并求曲率。','normal',['P'],'parabola',false],
 ['证明两切线互相垂直。','tangent',[],'parabola',true],
 ['求垂足M的坐标。','foot',['M'],'ellipse',true],
 ['求垂足M的坐标以及距离。','foot',['M'],'ellipse',false],
 ['求未知点Z的坐标。','metric',['A','B','M'],'ellipse',false],
 ['已知曲线，暂无目标。','feature',['C'],'ellipse',false]
])assert.equal(covered(body,kind,labels,type),expected,body);
console.log('PASS 28 bounded goal checks: compound goals, unsupported features, source citations and unknown labels');
