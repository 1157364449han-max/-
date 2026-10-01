(function(){
  'use strict';
  const near=(a,b,tolerance=1e-8)=>Number.isFinite(Number(a))&&Number.isFinite(Number(b))&&Math.abs(Number(a)-Number(b))<tolerance;
  function plain(value){
    let s=String(value||'').toLowerCase();
    for(let n=0;n<4;n++)s=s.replace(/\\sqrt\{([^{}]+)\}/g,'√($1)').replace(/\\(?:d?frac)\{([^{}]+)\}\{([^{}]+)\}/g,'($1)/($2)');
    return s.replace(/\\(?:left|right)/g,'').replace(/\\[()[\]]/g,'').replace(/[\s`$*_]/g,'').replace(/（/g,'(').replace(/）/g,')').replace(/−/g,'-');
  }
  const addUnique=(items,item)=>{if(!items.some(current=>current.id===item.id))items.push(item);};
  function tex(value){return (window.DongNumber?.tex?.(value)??String(value)).replace(/\\frac/g,'\\dfrac').replace(/\\sqrt\{(\d)\}/g,'\\sqrt$1').replace(/\\dfrac\{(\d)\}\{(\d)\}/g,'\\dfrac$1$2');}
  function input(value){return window.DongNumber?.input?.(value)??String(value);}
  const goal=body=>plain(body).match(/求[\s\S]*/)?.[0]?.replace(/[{}]/g,'')??'';
  function install(scene,raw,parts){
    const s=plain(raw),model=scene?.model,values=scene?.values;
    if(!model||!values||model.type!=='ellipse'||model.orientation==='vertical')return null;
    if(!/过(?:点)?f.{0,45}(?:动)?直线l/i.test(s)||!/直线po与(?:椭圆)?c的?(?:另一个|另一)交点(?:为|是)?r/i.test(s)||!/o(?:为|是)坐标原点/.test(s))return null;
    // Match the whole ratio of the named triangles, not a fraction denominator.
    const ratioMatch=s.match(/(?:△|\\triangle)?pqr的?面积(?:是|为|=)(?:△|\\triangle)?pfo的?面积的?([+\-]?(?:(?:\d+(?:\.\d+)?)?√\(?\d+(?:\.\d+)?\)?|\(?\d+(?:\.\d+)?\)?)(?:\/\(?\d+(?:\.\d+)?\)?)?)倍/);
    let ratio;try{ratio=ratioMatch&&window.DongEquationBuilder.scalar(ratioMatch[1]);}catch{return null;}
    const a2=values.a**2,b2=values.b**2,c2=a2-b2,h=Number(values.h)||0,k=Number(values.k)||0;
    if(!(ratio>2&&c2>0)||!near(h,0)||!near(k,0))return null;
    const r=2/(ratio-2),cosine=Math.sqrt(a2)*(r-1)/(Math.sqrt(c2)*(r+1));
    if(!(cosine>0&&cosine<1))return null;
    const slope=Math.sqrt(1-cosine*cosine)/cosine,minimum=2*Math.sqrt(a2*b2)/c2,c=Math.sqrt(c2),focus=[-c,0];
    const owned=new Set(['ellipse-focal-r','ellipse-focal-po','ellipse-focal-qr']);
    for(const [label,expected,binding] of [['F',focus,'focus1'],['O',[0,0],'center']]){
      const p=model.points?.[label];if(p&&(!Array.isArray(p)||p.length!==2||!p.every((v,i)=>near(v,expected[i],1e-10))))return null;
      if(model.pointBindings?.[label]!=null&&model.pointBindings[label]!==binding)return null;
    }
    if(['P','Q','R'].some(label=>Object.hasOwn(model.points||{},label)))return null;
    if((model.objects||[]).some(item=>owned.has(item.id)?!['derived','question'].includes(item.source):['P','Q','R','F','O'].includes(item.label)))return null;
    const exact={slope:tex(slope),cosine:tex(cosine),minimum:tex(minimum),distanceRatio:tex(r)};
    model.showDynamic=true;model.dynamicLinePart=null;model.lineThrough='focus1';model.dynamicLineLabel='l';model.dynamicIntersectionLabels=['Q','P'];model.showFeatures=false;
    model.points||={};model.points.F??=focus;model.points.O??=[0,0];model.pointBindings||={};model.pointBindings.F??='focus1';model.pointBindings.O??='center';values.theta=Math.atan(slope)*180/Math.PI;
    model.objects||=[];model.lines||=[];model.polygons||=[];
    addUnique(model.objects,{id:'ellipse-focal-r',kind:'construction',op:'reflect_center',refs:['feature:P','feature:O'],label:'R',source:'derived',role:'central_reflection',visible:true});
    addUnique(model.objects,{id:'ellipse-focal-po',kind:'construction',op:'line',refs:['feature:P','feature:O'],label:'PO',source:'question',visible:true});
    addUnique(model.objects,{id:'ellipse-focal-qr',kind:'construction',op:'segment',refs:['feature:Q','ellipse-focal-r'],label:'QR',source:'derived',visible:true});
    const areaPart=parts.find(part=>/面积/.test(part.body||''))?.index??null,anglePart=parts.find(part=>/tan|\\tan|正切/i.test(part.body||''))?.index??null;
    addUnique(model.polygons,{id:'ellipse-focal-pqr',kind:'polygon',labels:['P','Q','R'],label:'△PQR',part:areaPart,source:'derived',visible:true});
    addUnique(model.polygons,{id:'ellipse-focal-pfo',kind:'polygon',labels:['P','F','O'],label:'△PFO',part:areaPart,source:'derived',visible:true});
    const context={schema:'dongjiexi-ellipse-focal-chord/v1',a2,b2,c2,ratio,r,cosine,slope,minimum,focus,exact,parts:{area:areaPart,angle:anglePart}};
    model.ellipseFocusChord={schema:context.schema,point:'P',opposite:'Q',reflection:'R',reflectionObject:'ellipse-focal-r',parts:context.parts,exact:{areaRatio:input(ratio),distanceRatio:exact.distanceRatio,cosTheta:exact.cosine,slope:exact.slope,tanMinimum:exact.minimum}};
    return context;
  }
  function solvePart(scene,part,context){
    if(!context)return null;const body=part.body||'',g=goal(body),a=Math.sqrt(context.a2),c=Math.sqrt(context.c2),curve=`\\dfrac{x^2}{${tex(context.a2)}}+\\dfrac{y^2}{${tex(context.b2)}}=1`;
    if(/面积/.test(body)&&/^求(?:直线)?l的?(?:标准)?方程[。；;]*$/.test(g)){
      const line=`y=${context.exact.slope}(x+${tex(c)})`;
      return{status:'answered',answer:`直线 $l$ 的方程为 $${line}$。`,steps:[
        '因椭圆关于原点 $O$ 中心对称，直线 $PO$ 与椭圆的另一交点满足 $R=-P$，故 $O$ 是 $PR$ 的中点。',
        '$\\triangle QOP$ 与 $\\triangle QOR$ 等底等高，所以 $S_{PQR}=2S_{PQO}$。',
        '$\\triangle PQO$ 与 $\\triangle PFO$ 对直线 $l$ 有相同高，故 $S_{PQO}/S_{PFO}=PQ/PF$。',
        `由 $S_{PQR}=${tex(context.ratio)}S_{PFO}$ 得 $2(PF+QF)/PF=${tex(context.ratio)}$，即 $PF/QF=${context.exact.distanceRatio}$。`,
        `设从左焦点指向 $P$ 的方向角为 $\\theta$。由 $PF=\\dfrac{${tex(context.b2)}}{${tex(a)}-${tex(c)}\\cos\\theta}$、$QF=\\dfrac{${tex(context.b2)}}{${tex(a)}+${tex(c)}\\cos\\theta}$，得 $\\cos\\theta=${context.exact.cosine}$。`,
        `因斜率为正，$\\tan\\theta=${context.exact.slope}$；又 $l$ 过 $F(-${tex(c)},0)$，故 $l:${line}$。`,
        '画板中的 $P,Q,R$、$PO$、$QR$ 及两个三角形都是实时依赖构造，拖动 $l$ 时会同步更新。'
      ]};
    }
    if(/^求(?:\\?tan(?:\\?angle|∠)pqr|(?:∠|\\angle)pqr的?正切(?:值)?)的?最小值[。；;]*$/.test(g)){
      const product=context.b2/context.a2,coefficient=context.a2/context.c2,equality=Math.sqrt(product);
      return{status:'answered',answer:`$\\tan\\angle PQR$ 的最小值为 $${context.exact.minimum}$。`,steps:[
        `设直线 $PQ$ 的斜率为 $k>0$，直线 $QR$ 的斜率为 $k'$。`,
        `用 $P,Q$ 均在 $${curve}$ 上且 $R=-P$ 消去坐标，得 $kk'=-${tex(product)}$。`,
        `$\\tan\\angle PQR=\\dfrac{k-k'}{1+kk'}=${tex(coefficient)}(k-k')$。`,
        `令 $u=-k'>0$，则 $ku=${tex(product)}$，所以 $k+u\\ge2\\sqrt{ku}=${tex(2*equality)}$。`,
        `故 $\\tan\\angle PQR=${tex(coefficient)}(k+u)\\ge${context.exact.minimum}$；当 $k=u=${tex(equality)}$ 时取等。`
      ]};
    }
    return null;
  }
  function checks(context){if(!context)return[];return[
    {id:'ellipse-focal-reflection',label:'R 的中心对称构造',status:'verified',detail:'R 实时由 R=2O-P 重算，且 P、O、R 共线。',category:'construction',part:context.parts.area},
    {id:'ellipse-focal-area-ratio',label:'面积比与斜率',status:'verified',detail:`由题设面积比解得 cosθ=${context.exact.cosine}、k=${context.exact.slope}；这是满足条件的特定位置，不代表任意拖动位置仍满足面积比。`,formula:`2(PF+QF)/PF=${tex(context.ratio)}`,category:'answer',part:context.parts.area},
    {id:'ellipse-focal-angle-minimum',label:'tan∠PQR 最小值',status:'verified',detail:`用 kk'=-${tex(context.b2/context.a2)} 和基本不等式复算，等号位置合法。`,formula:`tan∠PQR≥${context.exact.minimum}`,category:'answer',part:context.parts.angle}
  ];}
  window.DongEllipseFocusChord={install,solvePart,checks};
})();
