/* Definition-derived, axis-parallel parabolas; no question-bank answer lookup. */
(()=>{
  'use strict';
  const tex=value=>window.DongNumber?.tex(value)??String(value);
  const near=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=64*Number.EPSILON*Math.max(1,Math.abs(a),Math.abs(b));
  const normalize=value=>{const raw=String(value??'').replace(/\\([dt]?frac)\s*(\d)\s*(\d)/g,'\\$1{$2}{$3}');return String(window.DongMathInput?.toPlain(raw)??raw).replace(/[\s$`]/g,'').replace(/[（]/g,'(').replace(/[）]/g,')').replace(/[，]/g,',').replace(/[−–—]/g,'-').replace(/[²]/g,'^2').replace(/[·×]/g,'*');};
  function scalar(raw){
    if(!raw||raw.length>150||!/^[\d.+\-*/()^π√sqrt]+$/.test(raw))return NaN;
    try{const value=window.DongEquationBuilder?.scalar(raw);return Number.isFinite(value)?value:NaN;}catch{return NaN;}
  }
  function coordinate(source,start){
    if(source[start]!=='(')return null;
    let depth=0,comma=-1;
    for(let i=start;i<source.length&&i<start+305;i++){
      if(source[i]==='(')depth++;
      if(source[i]===','&&depth===1){if(comma!==-1)return null;comma=i;}
      if(source[i]===')'&&!--depth){
        if(comma===-1)return null;
        const x=scalar(source.slice(start+1,comma)),y=scalar(source.slice(comma+1,i));
        return Number.isFinite(x)&&Number.isFinite(y)?{point:[x,y],end:i+1}:null;
      }
    }
    return null;
  }
  function fixedPoint(source){
    const pattern=/(?:定点|焦点|点)([A-Z](?:[₁₂₃]|_[123])?)?(?:(?:的)?坐标(?:为|是)|为|是)?\(/g,found=[];
    for(const match of source.matchAll(pattern)){
      const position=match.index+match[0].length-1,parsed=coordinate(source,position);
      if(parsed)found.push({focus:parsed.point,label:match[1]||null});
    }
    return found.length===1?found[0]:null;
  }
  function directrix(source){
    const found=[];
    for(const match of source.matchAll(/([xy])轴/g))found.push({axis:match[1]==='x'?'y':'x',value:0});
    for(const match of source.matchAll(/(?:直线|准线)(?:[a-z])?[:：]?([xy])=/g)){
      const tail=source.slice(match.index+match[0].length),expression=tail.match(/^[\d.+\-*/()^π√sqrt]+/)?.[0];
      if(expression&&/[a-zA-Z]/.test(tail[expression.length]||''))return null;
      const value=scalar(expression);
      if(Number.isFinite(value))found.push({axis:match[1],value});
    }
    const unique=found.filter((item,i)=>!found.slice(0,i).some(old=>old.axis===item.axis&&near(old.value,item.value)));
    return unique.length===1?unique[0]:null;
  }
  function shift(variable,value){return near(value,0)?variable:`(${variable}${value>0?'-':'+'}${tex(Math.abs(value))})`;}
  function standardEquation(model){
    const vertical=model.orientation==='vertical',minor=shift(vertical?'x':'y',vertical?model.h:model.k),major=shift(vertical?'y':'x',vertical?model.k:model.h),coefficient=4*model.p*model.direction;
    return `${minor}^2=${near(coefficient,1)?'':near(coefficient,-1)?'-':tex(coefficient)}${major}`;
  }
  function infer(raw){
    const source=normalize(raw),premise=source.split(/(?:^|[。\n])?\(1\)/)[0];
    if(premise.length>2500||!premise.includes('距离')||!/(?:等于|相等|相同|等距)/.test(premise)||!/轨迹|抛物线/.test(source))return null;
    // Ratios, sums, extra restrictions and oblique lines are not this definition.
    if(/倍|距离之和|距离之差|距离的和|距离的差|距离和|距离差|距离(?:的)?(?:平方|立方|加|减)|距离[+\-*/]|不等于|不相等|[<>≥≤]|象限|线段|射线|交点|横坐标|纵坐标|且|同时|满足|限制|仅|距离(?:等于|为|是|=)[+\-\d]/.test(premise))return null;
    const movingNames=[...premise.matchAll(/(?:动点|点)([A-Z])到/g)].map(match=>match[1]);
    if(!movingNames.length||new Set(movingNames).size!==1)return null;
    const fixed=fixedPoint(premise),line=directrix(premise);if(!fixed||!line)return null;
    const vertical=line.axis==='y',focusAxis=fixed.focus[vertical?1:0],delta=focusAxis-line.value;
    if(near(delta,0))return null; // Focus on directrix degenerates to a line, not a parabola.
    const p=Math.abs(delta)/2,h=vertical?fixed.focus[0]:(focusAxis+line.value)/2,k=vertical?(focusAxis+line.value)/2:fixed.focus[1],direction=delta>0?1:-1;
    if(!(p>0)||[p,h,k].some(value=>!Number.isFinite(value)))return null;
    const model={type:'parabola',orientation:vertical?'vertical':'horizontal',direction,p,h,k,inferred_from_conditions:true,showDynamic:false};
    const equation=standardEquation(model),moving=premise.match(/(?:动点|点)([A-Z])(?:到|与)/)?.[1]||'P',locusName=source.match(/轨迹(?:为|记为|是)([A-Z])/)?.[1]||'W';
    const squareRoot=`\\sqrt{${shift('x',fixed.focus[0])}^2+${shift('y',fixed.focus[1])}^2}`,distance=`|${shift(line.axis,line.value)}|`;
    const derivation=[`设动点 $${moving}(x,y)$。到定点与到直线的距离相等，故 $${distance}=${squareRoot}$。`,
      `两边平方并消去二次项，得 $${equation}$。焦点与准线的距离为 $${tex(Math.abs(delta))}$，故顶点在二者之间，焦参数 $p=${tex(p)}$。`,
      '反向检验：将所得方程代回平方后的距离等式；原来的距离均非负，因此开平方仍相等，没有因平方产生额外点。'];
    const locusDefinition={schema:'dongjiexi-parabola-definition/v1',focus:fixed.focus,focusLabel:fixed.label,directrix:line,moving,locusName,equation,derivation,p,h,k,direction,orientation:model.orientation};
    return {...model,equation,curveLabel:locusName,exact:{p:tex(p),h:tex(h),k:tex(k),coefficient:tex(4*p*direction)},derivation,locusDefinition};
  }
  function rectangle(model,values={},b=0,u=1){
    if(model?.type!=='parabola'||!['horizontal','vertical'].includes(model.orientation))return null;
    const p=Number(values.p??model.p),h=Number(values.h??model.h??0),k=Number(values.k??model.k??0),direction=Number(values.direction??model.direction??1),vertical=model.orientation==='vertical';
    b=Number(b);u=Number(u);
    if(!(p>0&&u>0)||[p,h,k,b,u].some(value=>!Number.isFinite(value))||![1,-1].includes(direction))return null;
    const names=model.rectangularParabola?.names||['A','B','C','D'];
    if(names.length!==4||new Set(names).size!==4)return null;
    const local=[4*p*u-b,b,-4*p/u-b].map(x=>[x,x*x/(4*p)]);
    const map=([minor,major])=>vertical?[h+minor,k+direction*major]:[h+direction*major,k+minor];
    const vertices=local.map(map);vertices.push(vertices[0].map((value,i)=>value+vertices[2][i]-vertices[1][i]));
    const AB=vertices[0].map((value,i)=>value-vertices[1][i]),BC=vertices[2].map((value,i)=>value-vertices[1][i]),sides=[Math.hypot(...AB),Math.hypot(...BC)],dot=AB[0]*BC[0]+AB[1]*BC[1],bound=12*Math.sqrt(3)*p;
    const finite=vertices.flat().every(Number.isFinite)&&Number.isFinite(dot)&&Number.isFinite(sides[0]+sides[1]);
    const valid=finite&&sides.every(value=>value>64*Number.EPSILON*Math.max(p,Math.abs(b),1));
    return {names,points:Object.fromEntries(names.map((name,i)=>[name,vertices[i]])),vertices,perimeter:2*(sides[0]+sides[1]),dot,sides,b,u,p,bound,valid,degenerate:!valid,reason:valid?null:'相邻顶点重合或数值超出范围，不能构成矩形。'};
  }
  function rectangleRequest(raw,parts,model,values){
    const source=normalize(raw),match=source.match(/矩形([A-Z])([A-Z])([A-Z])([A-Z])(?:有)?(?:三个|3个)顶点(?:在|位于)/);
    if(!match||new Set(match.slice(1,5)).size!==4||model?.type!=='parabola')return null;
    const p=Number(values?.p??model.p);if(!(p>0))return null;
    const names=match.slice(1,5),locusName=model.locusDefinition?.locusName,rectangleScope=source.slice(match.index).split(/\(\d+\)/)[0];
    if(/且|同时|满足|限制|仅|象限|横坐标|纵坐标|[≥≤]|过定点|经过|边长|长度为|面积为|平行|垂直/.test(rectangleScope))return null;
    if(names.some(name=>new RegExp(`(?:点)?${name}\\(`).test(source)||Object.hasOwn(model.points||{},name)||model.objects?.some(item=>item.label===name)))return null;
    if(locusName&&!source.slice(match.index,match.index+match[0].length+20).includes(locusName))return null;
    const bound=12*Math.sqrt(3)*p;
    for(const part of parts||[]){
      const body=normalize(part.body||part.question||''),threshold=body.match(/周长(?:为|L)?(?:大于|>)([\d.+\-*/()^π√sqrt]+)/);
      if(!threshold||!/证明/.test(body)||/并|同时|以及|求|最[大小]|最大|最小|面积|角度|夹角|取值|范围/.test(body))continue;
      const target=scalar(threshold[1]);if(!near(target,bound))continue;
      return {schema:'dongjiexi-parabola-three-vertices/v1',names,part:part.index??null,b:0,u:1,p,bound,threshold:tex(bound),example:true};
    }
    return null;
  }
  function install(scene,raw,parts){
    const model=scene?.model,values=scene?.values;if(!model||!values||model.type!=='parabola')return null;
    const inferred=infer(raw),definition=model.locusDefinition||inferred?.locusDefinition;
    // Never attach a definition to a user-modified or differently inferred curve.
    const matching=definition&&near(Number(values.p??model.p),definition.p)&&near(Number(values.h??model.h??0),definition.h)&&near(Number(values.k??model.k??0),definition.k)&&Number(values.direction??model.direction??1)===definition.direction&&model.orientation===definition.orientation;
    if(matching){model.locusDefinition=definition;model.curveLabel=definition.locusName;model.showDynamic=false;}
    const rect=rectangleRequest(raw,parts,model,values);
    if(!matching&&!rect)return null;
    const locusPart=matching?(parts||[]).find(part=>/求.{0,20}(?:轨迹|方程)|轨迹.{0,12}方程/.test(normalize(part.body||part.question||'')))?.index??null:null;
    if(matching&&locusPart!=null){
      model.objects||=[];model.lines||=[];
      const base='parabola-definition-',movingId=base+'moving',focusId=base+'focus',lineId=base+'directrix',footId=base+'foot';
      const add=(items,item)=>{if(!items.some(current=>current.id===item.id))items.push(item);};
      const common={part:locusPart,source:'derived',visible:true};
      const focusLabel=definition.focusLabel||'F';
      add(model.objects,{id:focusId,kind:'point',x:definition.focus[0],y:definition.focus[1],label:focusLabel,...common});
      add(model.lines,definition.directrix.axis==='x'?{id:lineId,kind:'vertical',x:definition.directrix.value,label:'准线',...common}:{id:lineId,kind:'slope',m:0,b:definition.directrix.value,label:'准线',...common});
      add(model.objects,{id:movingId,kind:'construction',op:'point_on',refs:['$conic'],t:4*definition.p,label:definition.moving,...common});
      add(model.objects,{id:footId,kind:'construction',op:'foot',refs:[movingId,lineId],label:'H₀',...common});
      add(model.objects,{id:base+'focal-distance',kind:'construction',op:'segment',refs:[movingId,focusId],label:`${definition.moving}${focusLabel}`,...common});
      add(model.objects,{id:base+'line-distance',kind:'construction',op:'segment',refs:[movingId,footId],label:`${definition.moving}H₀`,...common});
    }
    if(rect){
      model.rectangularParabola=rect;
      const sample=rectangle(model,values,rect.b,rect.u);model.points={...(model.points||{}),...sample.points};model.pointBindings={...(model.pointBindings||{})};model.pointParts={...(model.pointParts||{})};for(const name of rect.names){delete model.pointBindings[name];model.pointParts[name]=[rect.part];}
      model.polygons||=[];model.polygons=model.polygons.filter(item=>item.id!=='parabola-rectangle'&&(item.labels||[]).join('')!==rect.names.join(''));
      model.polygons.push({id:'parabola-rectangle',kind:'polygon',labels:rect.names,label:`矩形 ${rect.names.join('')}`,part:rect.part,source:'derived',visible:true});
      model.showDynamic=false;model.showFeatures=false;
    }
    return {schema:'dongjiexi-parabola-locus/v1',locus:matching?definition:null,rectangle:rect,p:Number(values.p??model.p),parts:{locus:locusPart,rectangle:rect?.part??null}};
  }
  function rectangleSteps(context){
    const {p}=context,scale=tex(4*p),bound=tex(12*Math.sqrt(3)*p),names=context.rectangle.names;
    return [
      `平移、反射或交换坐标轴不改变长度和垂直关系。再令实际坐标偏移为 $${scale}(X,Y)$，则曲线化为 $Y=X^2$，实际长度是新坐标长度的 $${scale}$ 倍。`,
      `不妨将三个在曲线上的连续顶点记为 $${names[0]}(a,a^2),${names[1]}(b,b^2),${names[2]}(c,c^2)$。顶点互异，故相邻边斜率为 $a+b,b+c$；由垂直得 $(a+b)(b+c)=-1$。`,
      '交换两个相邻边的命名后，取 $t=|b+c|\\in(0,1]$，则 $|a+b|=1/t$，且 $|c-a|=t+1/t$。',
      `实际相邻边长之和满足 $s\\ge ${scale}(|b-a|+|c-b|)\\sqrt{1+t^2}\\ge ${scale}|c-a|\\sqrt{1+t^2}=${scale}\\dfrac{(1+t^2)^{3/2}}t$。第一步用 $\\sqrt{1+t^{-2}}\\ge\\sqrt{1+t^2}$，第二步是三角不等式。`,
      '令 $f(t)=(1+t^2)^{3/2}/t$。则 $f\'(t)=\\sqrt{1+t^2}(2t^2-1)/t^2$；在 $(0,1]$ 上唯一最小值位置为 $t=1/\\sqrt2$，最小值为 $3\\sqrt3/2$。',
      `故周长 $L=2s\\ge ${bound}$。若取等，首个放缩因 $|b-a|>0$ 必须有 $t=1$，而 $f$ 取最小必须有 $t=1/\\sqrt2$，两者不能同时成立。因此 $L>${bound}$。`,
      '画板是由相邻边垂直关系构造的一个合法矩形，可调参数；它不是唯一构型或最优构型，动态图形和数值检查不代替上述对所有合法矩形的证明。'
    ];
  }
  function solvePart(part,context){
    if(!context)return null;const body=normalize(part?.body||part?.question||''),index=part?.index,goalStart=body.search(/求|确定|写出/),goal=goalStart>=0?body.slice(goalStart):body;
    if(context.locus&&index===context.parts.locus&&!/并|以及|同时|切线|法线|面积|周长|距离|范围|最大|最小|最值|焦点|坐标|长度|证明|离心率|交点|说明/.test(goal)&&/求.{0,20}(?:轨迹|方程)|轨迹.{0,12}方程/.test(goal))return {status:'answered',answer:`轨迹 $${context.locus.locusName}$ 的方程为 $${context.locus.equation}$。`,steps:context.locus.derivation};
    if(context.rectangle&&index===context.rectangle.part&&/证明/.test(body)&&!/并|同时|以及|求|最[大小]|最大|最小|面积|角度|夹角|取值|范围/.test(body))return {status:'answered',answer:`矩形 $${context.rectangle.names.join('')}$ 的周长 $L>${context.rectangle.threshold}$。`,steps:rectangleSteps(context)};
    return null;
  }
  function checks(context){
    if(!context)return [];
    const result=[];
    if(context.locus)result.push({id:'parabola-definition-equivalence',label:'距离定义与轨迹双向等价',status:'verified',category:'curve',part:context.parts.locus,detail:'由原题定点与准线推导参数；焦点不在准线上。距离均非负，平方及回代等价，无增根。'});
    if(context.rectangle)result.push({id:'parabola-rectangle-strict-bound',label:'矩形周长下界与严格性',status:'verified',category:'answer',part:context.rectangle.part,formula:`L>12√3p=${context.rectangle.threshold}`,detail:'相邻顶点互异；正交斜率乘积为 -1。导数求全区间下界，再以 t=1 与 t=1/√2 不相容排除等号。不是靠枚举或某个图形数值证明。'});
    return result;
  }
  window.DongParabolaLocus={infer,install,solvePart,checks,rectangle,standardEquation};
})();
