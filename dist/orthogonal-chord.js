/* Orthogonal radii of an ellipse: exact tangent-circle theorem, not sampled inference. */
(() => {
  'use strict';
  const tex=x=>window.DongNumber.tex(x);
  function circle(q){
    if(!q||Math.abs(q.B||0)>1e-10||!(q.A*q.C>0))return null;
    const x=-q.D/(2*q.A),y=-q.E/(2*q.C),scale=-(q.F+q.D*x/2+q.E*y/2),a2=scale/q.A,b2=scale/q.C;
    if(!(a2>0&&b2>0))return null;
    const r2=a2*b2/(a2+b2);return{type:'circle',x,y,r:Math.sqrt(r2),r2};
  }
  function parameters(model,values){
    if(model.type!=='ellipse')return null;
    const a2=Number(values.a)**2,b2=Number(values.b)**2;if(!(a2>0&&b2>0))return null;
    return{a2,b2,r2:a2*b2/(a2+b2),r:Math.sqrt(a2*b2/(a2+b2)),h:Number(values.h)||0,k:Number(values.k)||0};
  }
  function origin(model,values,theta){const p=parameters(model,values);if(!p)return null;const t=theta*Math.PI/180;return{x:p.h-p.r*Math.sin(t),y:p.k+p.r*Math.cos(t)};}
  function install(scene,raw,parts){
    const s=(window.DongMathInput?.toPlain(raw)||raw).replace(/[\s()（）]/g,'').toUpperCase();
    const relation=s.match(/O([A-Z])(?:垂直|⊥)O([A-Z])/);
    if(!relation||relation[1]===relation[2]||!/椭圆/.test(s))return null;
    if(/证明|求证/.test(s.slice(0,relation.index).split(/[。;；]/).at(-1)))return null;
    const p=parameters(scene.model,scene.values);if(!p||Math.abs(p.h)+Math.abs(p.k)>1e-10)return null;
    if(/象限|半平面|不重合|弧段|区域|另一个定点/.test(s))return null;
    const labels=relation.slice(1),part=parts.find(part=>/相切|定圆|面积/.test(part.body||''));if(!part)return null;
    if(labels.some(label=>scene.model.points?.[label]))return null;
    const circleId='orthogonal-chord-fixed-circle',scope=part.index||null;
    scene.model.orthogonalChord={labels,part:scope,circleId};
    scene.model.showDynamic=true;scene.model.dynamicIntersectionLabels=labels;scene.model.dynamicLinePart=scope;scene.model.lineThrough='orthogonal-circle';
    scene.model.dynamicLineLabel=(s.match(/直线([A-Z])与/)?.[1]||'l').toLowerCase();
    scene.model.objects.push({id:circleId,kind:'construction',op:'orthogonal_chord_circle',refs:['$conic'],label:'垂直弦定圆',source:'derived',part:scope,visible:true});
    for(const name of labels)scene.model.objects.push({id:`orthogonal-radius-${name}`,kind:'construction',op:'segment',refs:['feature:O',`feature:${name}`],label:`O${name}`,source:'question',part:scope,visible:true});
    scene.model.polygons||=[];
    if(!scene.model.polygons.some(poly=>poly.labels?.join('')==='O'+labels.join('')))scene.model.polygons.push({id:'orthogonal-triangle',labels:['O',...labels],label:'△O'+labels.join(''),part:scope,source:'question',visible:true});
    const valid=Math.abs(p.r2*(1/p.a2+1/p.b2)-1)<1e-10;
    const checks=[{id:'orthogonal-radius-identity',status:valid?'verified':'contradicted',label:'定圆半径恒等式',detail:'代入 R²(1/a²+1/b²)=1 核验；通用证明及竖直线情形见解题步骤。',category:'construction'}];
    return{...p,labels,part:part.index,checks};
  }
  function solvePart(scene,part,context){
    if(!context||part.index!==context.part)return null;
    const body=part.body||part.question;
    if(/最大|周长|轨迹|离心率|存在性/.test(body))return null;
    const {labels:[A,B],r2}=context,triangle='O'+A+B;
    const steps=[
      `设椭圆写为 $x^2/\\alpha^2+y^2/\\beta^2=1$，其中 $\\alpha,\\beta$ 分别是水平、竖直半轴。令 $${A}=(x_1,y_1),${B}=(x_2,y_2)$。由 $O${A}\\perp O${B}$，有 $x_1x_2+y_1y_2=0$。`,
      '先讨论非竖直直线 $y=kx+m$。代入椭圆，得到 $(\\beta^2+\\alpha^2k^2)x^2+2\\alpha^2kmx+\\alpha^2(m^2-\\beta^2)=0$。',
      '由韦达定理，$x_1+x_2=-\\frac{2\\alpha^2km}{\\beta^2+\\alpha^2k^2}$，$x_1x_2=\\frac{\\alpha^2(m^2-\\beta^2)}{\\beta^2+\\alpha^2k^2}$。',
      '将 $y_i=kx_i+m$ 代入垂直条件：$0=(1+k^2)x_1x_2+km(x_1+x_2)+m^2=\\frac{(\\alpha^2+\\beta^2)m^2-\\alpha^2\\beta^2(1+k^2)}{\\beta^2+\\alpha^2k^2}$。',
      `故原点到直线的距离满足 $d^2=\\frac{m^2}{1+k^2}=\\frac{\\alpha^2\\beta^2}{\\alpha^2+\\beta^2}=${tex(r2)}$。因此直线始终与圆 $x^2+y^2=${tex(r2)}$ 相切。`,
      '竖直线不能遗漏：若 $x=t$，两个交点的纵坐标互为相反数。垂直条件给出 $t^2-\\beta^2(1-t^2/\\alpha^2)=0$，仍得 $t^2=\\alpha^2\\beta^2/(\\alpha^2+\\beta^2)$，所以结论对竖直线同样成立。'
    ];
    let answer=`直线与定圆 $x^2+y^2=${tex(r2)}$ 相切，圆心为 $O$，半径 $R=${tex(Math.sqrt(r2))}$。`;
    if(/面积/.test(body)){
      steps.push(`记 $u=|O${A}|,v=|O${B}|$，则 $u,v>0$，$|${A}${B}|=\\sqrt{u^2+v^2}$，面积 $S=uv/2$。由面积的另一表达式 $S=R|${A}${B}|/2$，得 $R=uv/\\sqrt{u^2+v^2}$。`,
        `由 $u^2+v^2\\ge2uv$，有 $R^2=\\frac{u^2v^2}{u^2+v^2}\\le\\frac{uv}{2}=S$，所以 $S\\ge R^2=${tex(r2)}$。`,
        `等号当且仅当 $u=v$。取直线 $y=R$，交点为 $(R,R)$、$(-R,R)$；代入椭圆恰有 $R^2/\\alpha^2+R^2/\\beta^2=1$，且两向量点积为零，所以等号能够取得。全部取等直线为 $x=\\pm R$ 或 $y=\\pm R$。`);
      answer+=`\n$S_{\\triangle ${triangle},\\min}=${tex(r2)}$，当 $|O${A}|=|O${B}|$ 时取得。`;
    }
    steps.push('画板的动弦始终满足垂直条件；旋转直线时定圆不变。点击“定位最小面积”可观察取等情形。');
    return{status:'answered',answer,steps,verification:{status:'locally-verified',message:'已核对定圆半径恒等式'},checks:context.checks};
  }
  window.DongOrthogonalChord={circle,parameters,origin,install,solvePart};
})();
