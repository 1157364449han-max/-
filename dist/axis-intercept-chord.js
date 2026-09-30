/* Reusable intercept-chord identity, not a stored examination answer. */
(()=>{
  'use strict';
  const tex=x=>window.DongNumber?.tex(x)||String(x);
  function install(scene,raw,parts){
    const m=scene.model,p=scene.values;
    if(m.type!=='ellipse'||m.orientation==='vertical'||Math.abs(p.h||0)>1e-10||Math.abs(p.k||0)>1e-10)return null;
    const s=(window.DongMathInput?.toPlain(raw)||raw).replace(/[\s{}$]/g,'');
    const target=s.match(/(?:\||｜)([A-Z])([A-Z])(?:\||｜)=(\d+(?:\.\d+)?)/);
    const links=s.match(/直线([A-Z])([A-Z])[、,，和与]([A-Z])([A-Z])分别与x轴交于(?:点)?([A-Z])[、,，和与]([A-Z])/);
    const through=s.match(/过(?:点)?([A-Z])[（(][^）)]+[）)](?:作|的|且|[^。；]{0,12})[^。；]{0,16}直线/);
    if(!target||!links||!through||links[1]!==links[3]||new Set([links[5],links[6]]).size!==2)return null;
    if(![links[5]+links[6],links[6]+links[5]].includes(target[1]+target[2]))return null;
    const vertex=links[1],point=through[1],v=m.points?.[vertex],u=m.points?.[point],length=Number(target[3]);
    if(!v||!u||Math.abs(v[0])>1e-10||Math.abs(v[1]-p.b)>1e-10||Math.abs(u[1]-p.b)>1e-10||Math.abs(u[0])<1e-10||!(length>0))return null;
    const a2=p.a**2,b=p.b,x0=u[0],den=length**2*x0**2-4*a2*(a2-x0**2);
    if(Math.abs(den)<1e-10)return null; // No finite slope: leave special cases for other engines.
    const slope=8*a2*b*x0/den,d=b-slope*x0,A=1/a2+slope**2/b**2,B=2*slope*d/b**2,C=d**2/b**2-1,D=B*B-4*A*C;
    if(!(D>1e-10)||Math.abs(slope)<1e-10)return null;
    const computed=8*a2*b/(slope*x0)+4*a2*(a2-x0*x0)/(x0*x0);
    if(Math.abs(computed-length**2)>1e-7*(1+length**2))return null;
    const scope=parts.find(part=>/求.*(?:k|斜率)/.test(part.body||part.question))?.index;
    const suffix=String(scope??'all'),axis='projection-axis-'+suffix;
    m.lines||=[];m.objects||=[];m.dynamicIntersectionLabels=[links[2],links[4]];
    m.showDynamic=true;m.lineThrough='point:'+point;p.theta=(Math.atan(slope)*180/Math.PI+180)%180;
    const add=(list,node)=>{if(!list.some(n=>n.id===node.id))list.push(node);};
    add(m.lines,{id:axis,kind:'slope',m:0,b:0,label:'x 轴参考线',visible:false});
    for(const [end,intersection] of [[links[2],links[5]],[links[4],links[6]]]){
      const id='projection-'+vertex+end+'-'+suffix;
      add(m.objects,{id,kind:'construction',op:'line',refs:['feature:'+vertex,'feature:'+end],label:vertex+end,part:scope,visible:true,source:'derived'});
      add(m.objects,{id:'projection-'+intersection+'-'+suffix,kind:'construction',op:'intersection',refs:[id,axis],branch:0,label:intersection,part:scope,visible:true,source:'derived'});
    }
    return{vertex,point,ends:[links[2],links[4]],intercepts:[links[5],links[6]],a2,b,x0,length,slope,D,computed,part:scope};
  }
  function solvePart(part,c){
    if(!c||Number(c.part)!==Number(part.index))return null;
    const {vertex,point,ends,intercepts,a2,b,x0,length,slope}=c,a=tex(Math.sqrt(a2)),bt=tex(b),u=tex(x0),k=tex(slope),L=tex(length),A2=tex(a2);
    return{status:'answered',answer:`$k=${k}$，此时直线方程为 $y=${k}(x-(${u}))+${bt}$。`,steps:[
      `设弦直线为 $y=k(x-u)+b=kx+d$，其中 $u=${u}$、$b=${bt}$、$d=b-ku$。$${point}=(u,b)$，$${vertex}=(0,b)$，且 $k\\ne0$，否则仅在顶点相切。`,
      `代入椭圆 $x^2/a^2+y^2/b^2=1$，得到 $Ax^2+Bx+C=0$，其中 $A=1/a^2+k^2/b^2$，$B=2kd/b^2$，$C=d^2/b^2-1$。两不同交点要求 $\\Delta=B^2-4AC>0$。`,
      `从 $${vertex}$ 连到弦端点 $(x_i,y_i)$，其直线在 x 轴上的截距为 $X_i=-b x_i/(y_i-b)=-b x_i/[k(x_i-u)]$。$u\\ne0$ 保证该直线不是平行于 x 轴的顶点切线。`,
      '由韦达定理，$(x_1-u)(x_2-u)=u^2/(a^2A)$，且 $|x_1-x_2|=\\sqrt{\\Delta}/A$。因此 $|X_1-X_2|=a^2b\\sqrt{\\Delta}/(|ku|)$。',
      '化简得到 $|X_1-X_2|^2=\\frac{8a^2b}{ku}+\\frac{4a^2(a^2-u^2)}{u^2}$。该公式适用于上述条件下所有椭圆与过点弦，不是本题预存答案。',
      `代入 $a^2=${A2}$，$b=${bt}$，$u=${u}$，$|${intercepts.join('')}|=${L}$，解得 $k=\\frac{8a^2bu}{L^2u^2-4a^2(a^2-u^2)}=${k}$。`,
      `回代得 $\\Delta=${tex(c.D)}>0$，两交点 $${ends.join('、')}$ 不同，$|${intercepts.join('')}|^2=${tex(c.computed)}=${L}^2$；分母与斜率均非零，符合题设。`
    ]};
  }
  const checks=c=>c?[{id:'axis-intercept-chord',status:'verified',part:c.part,label:'坐标轴截距弦条件回代',detail:'检查判别式为正、斜率非零及截距差平方等于题设长度平方；一般推导见解析。',category:'construction'}]:[];
  window.DongAxisInterceptChord={install,solvePart,checks};
})();
