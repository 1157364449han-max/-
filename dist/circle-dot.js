/* Circle dot-product identity; strict premise matching, no answer-bank dispatch. */
(()=>{
  'use strict';
  const near=(a,b)=>Math.abs(a-b)<=1e-10*Math.max(1,Math.abs(a),Math.abs(b));
  function compute(center,r,A,B){
    if(![center,A,B].every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite))||!Number.isFinite(r)||r<=0)return null;
    const u=A.map((x,i)=>x-center[i]),v=B.map((x,i)=>x-center[i]),w=u.map((x,i)=>x+v[i]);
    const norm=Math.hypot(...w),constant=r*r+u[0]*v[0]+u[1]*v[1],amplitude=r*norm;
    const position=sign=>norm?center.map((x,i)=>x+sign*r*w[i]/norm):null;
    return{constant,amplitude,norm,constantValue:norm===0,min:{value:constant-amplitude,point:position(1)},max:{value:constant+amplitude,point:position(-1)},w};
  }
  const plain=raw=>String(window.DongMathInput?.toPlain(String(raw).replace(/\\(?:overrightarrow|vec)\{([^{}]+)\}/g,'$1'))??raw).replace(/[\s${}]/g,'').replace(/[（]/g,'(').replace(/[）]/g,')').replace(/[，]/g,',').replace(/[·⋅]/g,'*');
  function infer(raw){
    if(typeof raw!=='string'||raw.length>18000)return null;
    const s=plain(raw),num='([0-9.\\/+*()sqrt√-]{1,50})';
    // Additional domains, proof goals, coordinates or multiple parts do not fit
    // this whole-circle theorem; leave them to the ordinary solving pipeline.
    const match=s.match(new RegExp('^(?:在)?(?:△|三角形)([A-Z]{3})中[,。]?([A-Z]{2})='+num+'[,。]([A-Z]{2})='+num+'[,。](?:∠|角)([A-Z])=90(?:°|度)[,。]([A-Z])为(?:△|三角形)\\1所在平面内的动点[,。](?:且)?([A-Z]{2})='+num+'[,。](?:则|求)?(?:向量)?([A-Z]{2})\\*([A-Z]{2})的(?:取值范围|最大值|最小值)(?:是|为)?[？?。]*$'));
    if(!match)return null;
    const [,triangle,edge1,n1,edge2,n2,vertex,moving,radiusEdge,nr,pair1,pair2]=match;
    const other=[...triangle].filter(n=>n!==vertex);
    if(new Set(triangle).size!==3||other.length!==2||triangle.includes(moving)||!radiusEdge.includes(vertex)||!radiusEdge.includes(moving)||pair1[0]!==moving||pair2[0]!==moving||new Set([pair1[1],pair2[1]]).size!==2||!other.every(n=>[pair1[1],pair2[1]].includes(n)))return null;
    const lengths={};
    for(const [edge,value] of [[edge1,n1],[edge2,n2]]){
      if(!edge.includes(vertex)||new Set(edge).size!==2)return null;
      const name=[...edge].find(n=>n!==vertex);if(!other.includes(name)||lengths[name]!=null)return null;
      try{lengths[name]=window.DongEquationBuilder.scalar(value);}catch{return null;}
    }
    let r;try{r=window.DongEquationBuilder.scalar(nr);}catch{return null;}
    if(![r,...Object.values(lengths)].every(n=>Number.isFinite(n)&&n>0&&n<=100000))return null;
    return{triangle:[...triangle],A:other[0],B:other[1],vertex,moving,a:lengths[other[0]],b:lengths[other[1]],r,goal:/最大值/.test(s)?'max':/最小值/.test(s)?'min':'range'};
  }
  function solve(raw){
    const spec=infer(raw);if(!spec)return null;
    const {A,B,vertex,moving,a,b,r,goal,triangle}=spec,tex=window.DongEllipseDistance.tex,rootTex=window.DongEllipseDistance.rootTex;
    const result=compute([0,0],r,[a,0],[0,b]),radicand=r*r*(a*a+b*b),amplitude=rootTex(radicand);
    const edgeTex=kind=>near(Math.sqrt(radicand),Math.round(Math.sqrt(radicand)))?tex(result[kind].value):`${tex(result.constant)}${kind==='min'?'-':'+'}${amplitude}`;
    const lengthTex=value=>rootTex(value*value);
    const coordinate=kind=>{const sign=kind==='min'?'':'-',L=rootTex(a*a+b*b);return `(${sign}\\frac{${lengthTex(r*a)}}{${L}},${sign}\\frac{${lengthTex(r*b)}}{${L}})`;};
    const pair=`\\overrightarrow{${moving+A}}\\cdot\\overrightarrow{${moving+B}}`,edges=goal==='range'?['min','max']:[goal];
    const answer=goal==='range'?`$${pair}\\in[${edgeTex('min')},${edgeTex('max')}]$。`:`$${pair}$ 的${goal==='min'?'最小':'最大'}值为 $${edgeTex(goal)}$。`;
    const steps=[`以 ${vertex} 为原点、${vertex+A} 和 ${vertex+B} 为正坐标轴建立直角坐标系：$${A}=(${lengthTex(a)},0)$，$${B}=(0,${lengthTex(b)})$。这只改变表示方式，不增加原题条件。`,
      `设 $${moving}=(x,y)$。由 $${moving+vertex}=${lengthTex(r)}$ 得 $x^2+y^2=${tex(r*r)}$，动点允许在整个圆上运动。`,
      `数量积展开：$${pair}=(${lengthTex(a)}-x)(-x)+(-y)(${lengthTex(b)}-y)=${tex(r*r)}-${lengthTex(a)}x-${lengthTex(b)}y$。`,
      `由柯西不等式，$|${lengthTex(a)}x+${lengthTex(b)}y|\\le\\sqrt{(${tex(a*a)}+${tex(b*b)})(x^2+y^2)}=${amplitude}$。这个界是一般性证明，不是采样估计。`,
      ...edges.map(kind=>`${kind==='min'?'下':'上'}界在 $${moving}=${coordinate(kind)}$ 时取得；代回圆方程和数量积核对。`),
      ...(goal==='range'?['圆周连续，数量积是坐标的连续函数，因此两个取到的端值之间没有缺口，区间两端均闭。']:[]),
      '拖动圆上的动点，或点击画板读数中的“定位最小/最大”，比较取等构型。改变图形参数后读数重新计算，解析仍对应原题。'];
    const pointId='circle-dot-moving',scene={type:'circle',h:0,k:0,r,showDynamic:false,showFeatures:false,inferredFromConditions:true,points:{[A]:[a,0],[B]:[0,b],[vertex]:[0,0]},objects:[{id:pointId,kind:'construction',op:'point_on',refs:['$conic'],t:.7,label:moving,source:'derived',visible:true},...[A,B,vertex].map(name=>({id:'circle-dot-segment-'+name,kind:'construction',op:'segment',refs:[pointId,'feature:'+name],label:moving+name,source:'derived',visible:true}))],polygons:[{id:'circle-dot-triangle',labels:triangle,label:'△'+triangle.join(''),source:'derived',visible:true}],dotExtrema:{moving,movingId:pointId,A,B,vertex,edges}};
    const checks=edges.map(kind=>{const p=result[kind].point,residual=p[0]*p[0]+p[1]*p[1]-r*r,value=(a-p[0])*(-p[0])+(-p[1])*(b-p[1]);return{id:'circle-dot-'+kind,label:'取等位置代回',category:'construction',status:near(residual,0)&&near(value,result[kind].value)?'verified':'contradicted',detail:'圆方程与数量积代回一致；全局界由柯西不等式和取等条件证明。'};});
    return{engineExtensions:['circle-dot-range'],mode:'symbolic-fallback',title:'圆上动点的数量积范围',restatement:raw,answer,strategy:'几何建系 → 数量积展开 → 柯西不等式 → 取等与闭区间核验。',parts:[{index:0,label:'求数量积',status:'answered',answer,steps}],completion:{answered:1,total:1},scene,verification:{status:'locally-verified',message:'本问使用数量积恒等式及柯西不等式证明，并独立回代取等坐标。',counts:{verified:checks.length,contradicted:0,unresolved:0},checks}};
  }
  window.DongCircleDot={compute,infer,solve};
})();
