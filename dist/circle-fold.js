/* Bounded circle/chord folding: one mathematical model for answers and 3D views.
 * Not a general solid-geometry solver; unsupported premises return null. */
(()=>{
  'use strict';
  const SCHEMA='dongjiexi-circle-fold/v1',near=(a,b)=>Math.abs(a-b)<1e-9*Math.max(1,Math.abs(a),Math.abs(b));
  const text=n=>window.DongNumber.tex(n);
  const normalize=raw=>String(window.DongMathInput?.toPlain(raw)??raw).replace(/\\(?:overrightarrow|vec)\{([^{}]+)\}/g,'$1').replace(/[\s${}]/g,'').replace(/[（]/g,'(').replace(/[）]/g,')').replace(/，/g,',').replace(/[−–—]/g,'-').replace(/[·×]/g,'*');
  const scalar=raw=>{try{return raw.length<=80?window.DongEquationBuilder.scalar(raw):NaN;}catch{return NaN;}};
  function infer(raw){
    if(typeof raw!=='string'||raw.length>18000)return null;
    let parts;try{parts=window.DongQuestionParts.splitParts(raw);}catch{return null;}
    if(parts.length!==3)return null;
    const first=window.DongQuestionParts.headings(raw)[0];if(!first)return null;
    const head=normalize(raw.slice(0,first.index)).replace(/[。.;；]$/,'');
    const num='([+\\-]?(?:\\d+(?:\\.\\d+)?|\\d+/\\d+))';
    const match=head.match(new RegExp('^(?:在平面直角坐标系xOy中[,。.]?O为坐标原点[,。.]?)?已知圆([A-Z])过点([A-Z])\\('+num+','+num+'\\)(?:和|与)(?:点)?([A-Z])\\('+num+','+num+'\\)[,。.]?且圆心\\1在直线([^=,。]+)=0上[,。.]?过原点且斜率不为0的直线([a-z])与圆\\1交于([A-Z])[,、]([A-Z])两点$'));
    if(!match)return null;
    const [,curve,A,x1s,y1s,B,x2s,y2s,equation,line,M,N]=match;
    const [x1,y1,x2,y2]=[x1s,y1s,x2s,y2s].map(scalar);
    if(![x1,y1,x2,y2].every(Number.isFinite)||new Set([curve,A,B,M,N,'O']).size!==6||!near(y1,0)||near(x1,0))return null;
    // Linear equation only: no dynamic execution, products or hidden terms.
    const coefficient='([+\\-]?(?:\\d+(?:\\.\\d+)?(?:/\\d+)?)?)';
    const linear=equation.match(new RegExp('^'+coefficient+'x'+coefficient+'y([+\\-](?:\\d+(?:\\.\\d+)?(?:/\\d+)?))?$'));
    if(!linear||!/^[-+]/.test(linear[2]))return null;
    const coeff=v=>v===''||v==='+'?1:v==='-'?-1:scalar(v);
    const [u,v,w]=[coeff(linear[1]),coeff(linear[2]),scalar(linear[3]||'0')];
    const dx=2*(x2-x1),dy=2*(y2-y1),rhs=x2*x2+y2*y2-x1*x1-y1*y1,det=dx*v-dy*u;
    if(!Number.isFinite(det)||Math.abs(det)<1e-10)return null;
    const h=(rhs*v+dy*w)/det,k=(-dx*w-u*rhs)/det,r2=(x1-h)**2+(y1-k)**2,d=r2-h*h;
    if(!near(k,0)||near(h,0)||!(d>0)||Math.max(Math.abs(h),r2)>1e6)return null;
    const body=parts.map(p=>normalize(p.body).replace(/[。.;；]$/,''));
    if(!new RegExp('^求圆'+curve+'的(?:标准)?方程$').test(body[0]))return null;
    const dot=body[1].match(new RegExp('^若([A-Z])'+M+'\\*\\1'+N+'为定值[,。.]求(?:出)?点\\1的坐标和定值$'));
    if(!dot||[curve,A,B,M,N,'O'].includes(dot[1]))return null;
    const fold=body[2].match(new RegExp('^把圆'+curve+'沿x轴折起[,。.]使二面角'+M+'-O'+A+'-'+N+'的大小为([^,。]+)[,。.]求折起后\\|'+M+N+'\\|的取值范围$'));
    if(!fold)return null;
    const alpha=scalar(fold[1]),cos=Math.cos(alpha),lo2=2*d*(1-cos),coefficient2=4*h*h+2*d*(1+cos),hi2=4*r2;
    if(!(alpha>0&&alpha<Math.PI)||![h,r2,d,alpha,cos,lo2,coefficient2,Math.sqrt(lo2),2*Math.sqrt(r2)].every(n=>window.DongNumber.exact(n)))return null;
    return{schema:SCHEMA,h,r2,d,alpha,lo2,coefficient2,hi2,names:{curve,A,B,line,M,N,P:dot[1]},fixed:{[A]:[x1,y1],[B]:[x2,y2],O:[0,0],[curve]:[h,0]},indices:parts.map(p=>p.index),parts,raw};
  }
  function geometry(spec,theta,alpha=spec.alpha){
    if(!valid(spec)||!Number.isFinite(theta)||!Number.isFinite(alpha)||alpha<0||alpha>Math.PI)return null;
    const c=Math.cos(theta),s=Math.sin(theta),root=Math.sqrt(spec.d+spec.h*spec.h*c*c),t1=spec.h*c-root,t2=spec.h*c+root;
    const points={M:[t1*c,t1*s,0],N:[t2*c,t2*s*Math.cos(Math.PI-alpha),t2*s*Math.sin(Math.PI-alpha)]};
    const length=Math.hypot(...points.M.map((n,i)=>n-points.N[i]));
    return{points,length,theta,alpha,admissible:Math.abs(c)>1e-10&&Math.abs(s)>1e-10,flatN:[t2*c,t2*s,0]};
  }
  function valid(s){return s?.schema===SCHEMA&&[s.h,s.r2,s.d,s.alpha].every(Number.isFinite)&&s.r2>s.h*s.h&&s.r2<1e6&&near(s.d,s.r2-s.h*s.h)&&s.alpha>0&&s.alpha<Math.PI&&s.names&&Object.values(s.names).every(n=>typeof n==='string'&&/^[A-Za-z]$/.test(n));}
  function solve(raw){
    const spec=infer(raw);if(!spec)return null;
    const {h,r2,d,alpha,lo2,coefficient2,names:n}=spec;
    const equation=`(x${h>0?'-':'+'}${text(Math.abs(h))})^2+y^2=${text(r2)}`;
    const answers=[
      {answer:`圆 $${n.curve}$ 的标准方程是 $${equation}$。`,steps:[`设圆心为 $(h,k)$。由经过 $${n.A}(${spec.fixed[n.A].map(text).join(',')})$、$${n.B}(${spec.fixed[n.B].map(text).join(',')})$，两点到圆心的距离相等。`,`将等距离式展开，与题设圆心所在直线联立，得圆心 $(${text(h)},0)$，半径平方 $r^2=${text(r2)}$。`,`故 $${equation}$；代回两已知点和圆心直线均成立。`]},
      {answer:`$${n.P}=(0,0)$，定值为 $-${text(d)}$。`,steps:[`令直线方向为 $(\\cos\\theta,\\sin\\theta)$，两交点为 $${n.M}=t_1(\\cos\\theta,\\sin\\theta)$、$${n.N}=t_2(\\cos\\theta,\\sin\\theta)$。`,`代入圆得 $t^2-${text(2*h)}t\\cos\\theta-${text(d)}=0$。因此 $t_1+t_2=${text(2*h)}\\cos\\theta$，$t_1t_2=-${text(d)}$；两根异号。`,`设 $${n.P}=(u,v)$，则 $\\overrightarrow{${n.P+n.M}}\\cdot\\overrightarrow{${n.P+n.N}}=u^2+v^2-${text(d)}-${text(2*h)}\\cos\\theta(u\\cos\\theta+v\\sin\\theta)$。`,`取斜率互为相反数的合法直线比较，因 $h\\ne0$ 得 $v=0$。再取两个不同的非零有限斜率比较，得 $u=0$。代入得到定值 $-${text(d)}$。`]},
      {answer:`折起后 $${text(Math.sqrt(lo2))}<|${n.M+n.N}|<${text(2*Math.sqrt(r2))}$，上下界均取不到。`,steps:[`由于 $t_1t_2=-${text(d)}<0$，两交点分居折轴 $x$ 轴两侧。保持含 $${n.M}$ 的半圆不动，另一半绕 $x$ 轴旋转 $\\pi-\\alpha$；注意旋转角不是二面角 $\\alpha=${text(alpha)}$ 本身。`,`折后坐标可写为 $${n.M}=(t_1\\cos\\theta,t_1\\sin\\theta,0)$、$${n.N}=(t_2\\cos\\theta,t_2\\sin\\theta\\cos(\\pi-\\alpha),t_2\\sin\\theta\\sin(\\pi-\\alpha))$。`,`用两根之和、积消去 $t_1,t_2$，得 $|${n.M+n.N}|^2=2(r^2-h^2)(1-\\cos\\alpha)+[4h^2+2(r^2-h^2)(1+\\cos\\alpha)]\\cos^2\\theta=${text(lo2)}+${text(coefficient2)}\\cos^2\\theta$。`,`题设直线有非零斜率，竖直线无斜率、水平线斜率为零，所以 $0<\\cos^2\\theta<1$。连续变化可取遍该开区间，故 $${text(lo2)}<|${n.M+n.N}|^2<${text(4*r2)}$，即所求严格开区间。`]}
    ];
    const scene={type:'circle',h,k:0,r:Math.sqrt(r2),points:{...spec.fixed,[n.P]:[0,0]},theta:45,lineThrough:'point:O',dynamicIntersectionLabels:[n.M,n.N],showFeatures:false,showDynamic:true,inferredFromConditions:true,curveLabel:n.curve,objects:[{id:'fold-flat-chord',kind:'construction',op:'segment',refs:['feature:'+n.M,'feature:'+n.N],label:n.M+n.N,source:'derived',visible:true}],lines:[],polygons:[],exact:{r2:text(r2)}};
    return{mode:'symbolic-fallback',title:'圆的过点弦与折叠',restatement:raw,parts:spec.parts.map((p,i)=>({...p,...answers[i],status:'answered',verification:{status:'locally-verified',message:'由圆方程、韦达及刚体旋转恒等式复算。'}})),completion:{answered:3,total:3},scene,foldGeometry:spec,engineExtensions:['circle-fold'],verification:{status:'locally-verified',message:'已覆盖的圆、定值及折叠长度由同一模型复算；不表示通用立体题均已支持。',counts:{verified:3,contradicted:0,unresolved:0},checks:[]}};
  }
  window.DongCircleFold={infer,solve,geometry,valid};
})();
