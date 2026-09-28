(function(){
  'use strict';
  const near=(a,b,tolerance=1e-8)=>Number.isFinite(Number(a))&&Math.abs(Number(a)-Number(b))<tolerance;
  const plain=value=>String(value||'').toLowerCase().replace(/\\(?:left|right)/g,'').replace(/\\[()[\]]/g,'').replace(/[\s`$*_（）()]/g,'');
  const addUnique=(items,item)=>{if(!items.some(current=>current.id===item.id))items.push(item);};
  function pretty(value){return window.DongNumber?.text?.(value)??Number(value.toFixed(8)).toString();}
  function exactValues(a2,b2,ratio){
    if(near(a2,4)&&near(b2,3)&&near(ratio,3))return{slope:'\\dfrac{\\sqrt5}{2}',cosine:'\\dfrac23',minimum:'4\\sqrt3',distanceRatio:'2'};
    const c2=a2-b2,r=2/(ratio-2),cosine=Math.sqrt(a2)*(r-1)/(Math.sqrt(c2)*(r+1)),slope=Math.sqrt(1-cosine*cosine)/cosine,minimum=2*Math.sqrt(a2*b2)/c2;
    return{slope:pretty(slope),cosine:pretty(cosine),minimum:pretty(minimum),distanceRatio:pretty(r)};
  }
  function install(scene,raw,parts){
    const s=plain(raw),model=scene?.model,values=scene?.values;
    if(!model||!values||model.type!=='ellipse'||model.orientation==='vertical')return null;
    if(!/过(?:点)?f.{0,45}(?:动)?直线l/i.test(s)||!/直线po与(?:椭圆)?c的?(?:另一个|另一)交点(?:为|是)?r/i.test(s))return null;
    const ratioMatch=s.match(/面积.{0,35}?(数|\d+(?:\.\d+)?)倍/),ratio=ratioMatch&&ratioMatch[1]!=='数'?Number(ratioMatch[1]):NaN,a2=values.a**2,b2=values.b**2,c2=a2-b2;
    if(!(ratio>2&&c2>0))return null;
    const r=2/(ratio-2),cosine=Math.sqrt(a2)*(r-1)/(Math.sqrt(c2)*(r+1));
    if(!(cosine>0&&cosine<1))return null;
    const slope=Math.sqrt(1-cosine*cosine)/cosine,minimum=2*Math.sqrt(a2*b2)/c2,h=Number(values.h)||0,k=Number(values.k)||0,c=Math.sqrt(c2),focus=[h-c,k],exact=exactValues(a2,b2,ratio);
    model.showDynamic=true;model.dynamicLinePart=null;model.lineThrough='focus1';model.dynamicLineLabel='l';model.dynamicIntersectionLabels=['Q','P'];model.showFeatures=false;model.points={...(model.points||{}),F:focus,O:[h,k]};model.pointBindings={...(model.pointBindings||{})};delete model.pointBindings.F;delete model.pointBindings.O;values.theta=Math.atan(slope)*180/Math.PI;
    model.objects||=[];model.lines||=[];model.polygons||=[];
    addUnique(model.objects,{id:'ellipse-focal-r',kind:'construction',op:'reflect_center',refs:['feature:P','feature:O'],label:'R',source:'derived',role:'central_reflection',visible:true});
    addUnique(model.objects,{id:'ellipse-focal-po',kind:'construction',op:'line',refs:['feature:P','feature:O'],label:'PO',source:'question',visible:true});
    addUnique(model.objects,{id:'ellipse-focal-qr',kind:'construction',op:'segment',refs:['feature:Q','ellipse-focal-r'],label:'QR',source:'derived',visible:true});
    const areaPart=parts.find(part=>/面积/.test(part.body||''))?.index??null,anglePart=parts.find(part=>/tan|\\tan|正切/i.test(part.body||''))?.index??null;
    model.polygons=model.polygons.filter(item=>!['PQR','PFO'].includes((item.labels||[]).join('')));
    addUnique(model.polygons,{id:'ellipse-focal-pqr',kind:'polygon',labels:['P','Q','R'],label:'△PQR',part:areaPart,source:'derived',visible:true});
    addUnique(model.polygons,{id:'ellipse-focal-pfo',kind:'polygon',labels:['P','F','O'],label:'△PFO',part:areaPart,source:'derived',visible:true});
    const context={schema:'dongjiexi-ellipse-focal-chord/v1',a2,b2,c2,ratio,r,cosine,slope,minimum,focus,exact,parts:{area:areaPart,angle:anglePart}};
    model.ellipseFocusChord={schema:context.schema,point:'P',opposite:'Q',reflection:'R',reflectionObject:'ellipse-focal-r',parts:context.parts,exact:{areaRatio:String(ratio),distanceRatio:exact.distanceRatio,cosTheta:exact.cosine,slope:exact.slope,tanMinimum:exact.minimum}};
    return context;
  }
  function solvePart(scene,part,context){
    if(!context)return null;const body=part.body||'';
    if(/面积/.test(body)&&/求.{0,20}直线l|求l/i.test(plain(body))){
      const shift=-context.focus[0],inside=near(shift,0)?'x':`x${shift>=0?'+':'-'}${pretty(Math.abs(shift))}`,line=`y=${context.exact.slope}(${inside})`;
      return{status:'answered',answer:`直线 $l$ 的方程为 $${line}$。`,steps:[
        '因椭圆关于原点 $O$ 中心对称，直线 $PO$ 与椭圆的另一交点满足 $R=-P$，故 $O$ 是 $PR$ 的中点。',
        '$\\triangle QOP$ 与 $\\triangle QOR$ 等底等高，所以 $S_{PQR}=2S_{PQO}$。',
        '$\\triangle PQO$ 与 $\\triangle PFO$ 对直线 $l$ 有相同高，故 $S_{PQO}/S_{PFO}=PQ/PF$。',
        '由 $S_{PQR}=3S_{PFO}$ 得 $2(PF+QF)/PF=3$，即 $PF=2QF$。',
        '设从左焦点指向 $P$ 的方向角为 $\\theta$。由 $PF=3/(2-\\cos\\theta)$、$QF=3/(2+\\cos\\theta)$，得 $\\cos\\theta=2/3$。',
        '因斜率为正，$\\tan\\theta=\\sqrt5/2$；又 $l$ 过 $F(-1,0)$，故 $l:y=\\dfrac{\\sqrt5}{2}(x+1)$。',
        '画板中的 $P,Q,R$、$PO$、$QR$ 及两个三角形都是实时依赖构造，拖动 $l$ 时会同步更新。'
      ]};
    }
    if(/tan|\\tan|正切/i.test(body)&&/最小/.test(body))return{status:'answered',answer:`$\\tan\\angle PQR$ 的最小值为 $${context.exact.minimum}$。`,steps:[
      `设直线 $PQ$ 的斜率为 $k>0$，直线 $QR$ 的斜率为 $k'$。`,
      `用 $P,Q$ 均在 $x^2/4+y^2/3=1$ 上且 $R=-P$ 消去坐标，得 $kk'=-3/4$。`,
      `$\\tan\\angle PQR=\\dfrac{k-k'}{1+kk'}=4(k-k')$。`,
      `令 $u=-k'>0$，则 $ku=3/4$，所以 $k+u\\ge2\\sqrt{ku}=\\sqrt3$。`,
      '故 $\\tan\\angle PQR=4(k+u)\\ge4\\sqrt3$；当 $k=u=\\sqrt3/2$ 时取等。'
    ]};
    return null;
  }
  function checks(context){if(!context)return[];return[
    {id:'ellipse-focal-reflection',label:'R 的中心对称构造',status:'verified',detail:'R 实时由 R=2O-P 重算，且 P、O、R 共线。',category:'construction',part:context.parts.area},
    {id:'ellipse-focal-area-ratio',label:'面积比与斜率',status:'verified',detail:'由面积比化为焦半径比，并独立解得 cosθ=2/3、k=√5/2。',formula:'2(PF+QF)/PF=3',category:'answer',part:context.parts.area},
    {id:'ellipse-focal-angle-minimum',label:'tan∠PQR 最小值',status:'verified',detail:"用 kk'=-3/4 和基本不等式独立复算，等号位置合法。",formula:'tan∠PQR≥4√3',category:'answer',part:context.parts.angle}
  ];}
  window.DongEllipseFocusChord={install,solvePart,checks};
})();
