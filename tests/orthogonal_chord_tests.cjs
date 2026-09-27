const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),test=require('node:test');
const sandbox={window:{}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../dist/orthogonal-chord.js'),'utf8'),sandbox);
const api=sandbox.window.DongOrthogonalChord;
const near=(a,b)=>assert(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('independent quadratic intersections verify both axes and all chord directions',()=>{
  for(const [a,b] of [[Math.sqrt(2),1],[2,1],[5,3],[1,1]])for(const swap of [false,true]){
    const rx=swap?b:a,ry=swap?a:b,r2=a*a*b*b/(a*a+b*b);
    const c=api.circle({A:1/rx**2,B:0,C:1/ry**2,D:0,E:0,F:-1});near(c.r2,r2);
    for(let angle=0;angle<360;angle+=3){
      const p=api.origin({type:'ellipse'},{a,b},angle),t=angle*Math.PI/180,dx=Math.cos(t),dy=Math.sin(t);
      const u=dx*dx/rx**2+dy*dy/ry**2,v=2*(p.x*dx/rx**2+p.y*dy/ry**2),w=p.x*p.x/rx**2+p.y*p.y/ry**2-1;
      const disc=v*v-4*u*w;assert(disc>0);
      const points=[-1,1].map(sign=>{const s=(-v+sign*Math.sqrt(disc))/(2*u);return{x:p.x+s*dx,y:p.y+s*dy};});
      const [A,B]=points;
      for(const q of points)near(q.x*q.x/rx**2+q.y*q.y/ry**2,1);
      near(A.x*B.x+A.y*B.y,0);near((p.x*dy-p.y*dx)**2,r2);
      const area=Math.abs(A.x*B.y-A.y*B.x)/2;assert(area>=r2-1e-8);
      if(angle%90===0)near(area,r2);
    }
  }
});
test('reject non-ellipses instead of constructing a spurious fixed circle',()=>{
  assert.equal(api.circle({A:1,B:0,C:-1,D:0,E:0,F:-1}),null);
  assert.equal(api.circle({A:1,B:1,C:2,D:0,E:0,F:-1}),null);
});
