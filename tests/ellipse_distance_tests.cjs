const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),test=require('node:test');
const sandbox={window:{}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../dist/ellipse-distance.js'),'utf8'),sandbox);
const {compute,rootTex}=sandbox.window.DongEllipseDistance;
const near=(a,b)=>assert(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('original problem: two global maxima, exact radicals and one minimum',()=>{
  const r=compute({type:'ellipse'},{a:2,b:1},[0,2]);
  near(r.max.squared,28/3);assert.equal(r.max.points.length,2);
  for(const p of r.max.points){near(p.y,-2/3);near(Math.abs(p.x),2*Math.sqrt(5)/3);}
  near(r.min.distance,1);near(r.min.points[0].y,1);
  assert.equal(rootTex(r.max.squared),'\\frac{2\\sqrt{21}}{3}');
});
test('endpoint wins when the quadratic vertex is outside the ellipse domain',()=>{
  const r=compute({type:'ellipse'},{a:2,b:1},[0,10]);
  near(r.max.distance,11);assert.equal(r.max.points.length,1);near(r.max.points[0].y,-1);
});
test('closed-form candidates satisfy ellipse and bound a dense independent parameter sweep',()=>{
  for(const orientation of ['horizontal','vertical'])for(const source of [[3,7],[3,-4],[3,-2],[8,-2],[3.25,-2]]){
    const m={type:'ellipse',orientation},v={a:4,b:1.5,h:3,k:-2},r=compute(m,v,source);assert(r);
    for(const kind of ['min','max'])for(const p of r[kind].points){near(((p.x-r.h)/r.rx)**2+((p.y-r.k)/r.ry)**2,1);near((p.x-source[0])**2+(p.y-source[1])**2,r[kind].squared);}
    for(let i=0;i<2000;i++){const t=i*Math.PI/1000,x=r.h+r.rx*Math.cos(t),y=r.k+r.ry*Math.sin(t),d=(x-source[0])**2+(y-source[1])**2;assert(d>=r.min.squared-1e-8&&d<=r.max.squared+1e-8);}
  }
});
test('an off-axis source is not silently projected to an axis',()=>{
  assert.equal(compute({type:'ellipse'},{a:2,b:1},[1,2]),null);
});
