/* Infer a parabola from focal-chord length and axial midpoint; no answer lookup. */
(()=>{
  'use strict';
  const SCHEMA='dongjiexi-parabola-focal-data/v1',PREFIX='focal-data-',ANGLES=[15,30,45,60,90,120,135,150,165];
  const near=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=256*Number.EPSILON*Math.max(1,Math.abs(a),Math.abs(b));
  const tex=value=>window.DongNumber?.tex(value)??String(value);
  function normalize(value){
    const raw=String(value??'').replace(/\^\s*\{?\\circ\}?/g,'°').replace(/\\([dt]?frac)\s*(\d)\s*(\d)/g,'\\$1{$2}{$3}');
    return String(window.DongMathInput?.toPlain(raw)??raw).replace(/[\s$`{}]/g,'').replace(/（/g,'(').replace(/）/g,')').replace(/，/g,',').replace(/[−–—]/g,'-').replace(/²/g,'^2').replace(/[·×]/g,'*').replace(/⊥/g,'垂直');
  }
  function scalar(value){if(!value||value.length>120||!/^[\d.+\-*/()^π√sqrt]+$/.test(value))return NaN;try{return window.DongEquationBuilder?.scalar(value)??NaN;}catch{return NaN;}}
  function numberAfter(source,position){const raw=source.slice(position).match(/^[\d.+\-*/()^π√sqrt]+/)?.[0];if(!raw||/[a-zA-Zα-ωΑ-Ω]/.test(source[position+raw.length]||''))return null;const value=scalar(raw);return Number.isFinite(value)?{value,raw}:null;}
  function firstPart(source){const start=source.search(/\(1\)(?=若|当|已知|设|求)/);if(start<0)return source;const tail=source.slice(start+3),end=tail.search(/\(2\)(?=在|若|当|已知|设|求)/);return end<0?tail:tail.slice(0,end);}
  function readAngle(source){
    const found=[...source.matchAll(/倾斜角(?:为|是|等于|=)/g)];if(found.length!==1)return {givenTheta:null,angleUnsupported:found.length>1};
    const match=found[0],item=numberAfter(source,match.index+match[0].length);if(!item)return {givenTheta:null,angleUnsupported:true};
    const end=match.index+match[0].length+item.raw.length,unit=source[end],radians=item.raw.includes('π')&&unit!=='°'&&unit!=='度',givenTheta=radians?item.value*180/Math.PI:item.value;
    if(!radians&&unit!=='°'&&unit!=='度')return {givenTheta,angleUnsupported:true};
    const angleLine=source.slice(Math.max(0,match.index-10),match.index).match(/直线([a-z])(?:的)?$/)?.[1]||null;
    return {givenTheta,angleUnsupported:!ANGLES.some(angle=>near(angle,givenTheta)),angleLine};
  }
  function infer(raw){
    const source=normalize(raw),head=source.split(/\(1\)(?=若|当|已知|设|求)/)[0],first=firstPart(source);
    if(source.length>18000||!/抛物线/.test(head)||!/y\^2=2p\*?x(?![a-zA-Z+\-*/^])/.test(head)||!/p>0/.test(head))return null;
    if(/x\^2=|\(x[+\-]|\(y[+\-]|y\^2=2p\*?x[+\-]|p<0|非焦点|不是焦点|不经过|不过[A-Z]/.test(head))return null;
    const focusName=head.match(/焦点(?:为|是|记为)([A-Z])/)?.[1],directrixFoot=head.match(/准线与x轴交于(?:点)?([A-Z])/)?.[1],chord=head.match(/过([A-Z])(?:的)?直线([a-z])?与(?:抛物线(?:[A-Z])?|[A-Z])交于(?:点)?([A-Z])[,、]([A-Z])(?:两点|两点处)?/);
    if(!focusName||!directrixFoot||!chord||chord[1]!==focusName||new Set([focusName,directrixFoot,chord[3],chord[4]]).size!==4)return null;
    const curveName=head.match(/抛物线([A-Z])[:：]?y\^2=2p\*?x/)?.[1]||null,chordCurve=chord[0].match(/与(?:抛物线)?([A-Z])交于/)?.[1]||null;if(chordCurve&&chordCurve!==curveName)return null;
    const endpoints=[chord[3],chord[4]],pair=endpoints.join('');
    const extract=match=>{const item=numberAfter(first,match.index+match[0].length);return item?{...item,start:match.index,end:match.index+match[0].length+item.raw.length}:null;};
    const lengths=[...first.matchAll(new RegExp(`\\|${pair}\\|(?:=|为|是)|(?:弦|线段)?${pair}(?:的)?(?:长度|弦长)(?:为|是|=)`,'g'))].map(extract);
    const mids=[...first.matchAll(new RegExp(`(?:线段|弦)?${pair}(?:的)?中点(?:的)?横坐标(?:为|是|等于|=)`,'g'))].map(extract);
    if(lengths.length!==1||mids.length!==1||!lengths[0]||!mids[0]||/纵坐标|斜率|倾斜角|之比|倍|之和|之差|的和|的差|距离|面积|垂直|平行|不等于|不满足|不相等|不是|小于|大于|[≥≤]/.test(first))return null;
    const chordLength=lengths[0].value,midpointX=mids[0].value,standardP=chordLength-2*midpointX,p=standardP/2;
    if(!(chordLength>0&&standardP>0&&midpointX>=chordLength/4)||Math.max(chordLength,Math.abs(midpointX),standardP)>1e4)return null;
    const constraints=head+';'+first;for(const match of constraints.matchAll(/p=([\d.+\-*/()^π√sqrt]+)/g)){const value=scalar(match[1]);if(!near(value,standardP)||/[a-zA-Zα-ωΑ-Ω]/.test(constraints[match.index+match[0].length]||''))return null;}
    if(first!==source){let conditions=first.slice(0,first.search(/求|写出|确定/)<0?first.length:first.search(/求|写出|确定/));for(const item of [...lengths,...mids].sort((a,b)=>b.start-a.start))conditions=conditions.slice(0,item.start)+conditions.slice(item.end);conditions=conditions.replace(/p=[\d.+\-*/()^π√sqrt]+/g,'').replace(/p>0/g,'').replace(/若|当|已知|设|且|又|则/g,'').replace(/[,。;；:：()]/g,'');if(conditions)return null;}
    if(new RegExp(`(?:${focusName}|${directrixFoot})\\(`).test(head))return null;
    const sine2=2*standardP/chordLength;if(!(sine2>0&&sine2<=1+64*Number.EPSILON))return null;
    const thetaDefault=Math.asin(Math.sqrt(Math.min(1,sine2)))*180/Math.PI,angle=readAngle(source);if(angle.angleLine&&chord[2]&&angle.angleLine!==chord[2])angle.angleUnsupported=true;
    const angleConflict=angle.givenTheta!=null&&(!Number.isFinite(angle.givenTheta)||angle.givenTheta<=0||angle.givenTheta>=180||!near(2*standardP/(Math.sin(angle.givenTheta*Math.PI/180)**2),chordLength));
    const targetMatch=source.match(/设([A-Z])为准线上(?:一)?点/),target=targetMatch&&!/(?:不|无需|禁止|不能|并非|不要)$/.test(source.slice(Math.max(0,targetMatch.index-5),targetMatch.index))?targetMatch[1]:null;
    if(target&&[focusName,directrixFoot,...endpoints].includes(target))return null;
    const thetaResolved=angle.givenTheta!=null&&!angle.angleUnsupported&&!angleConflict?angle.givenTheta:near(thetaDefault,90)?90:null;
    const exact={p:window.DongNumber?.input(p)??String(p),standardP:window.DongNumber?.input(standardP)??String(standardP),chordLength:lengths[0].raw,midpointX:mids[0].raw};
    const spec={schema:SCHEMA,p,standardP,chordLength,midpointX,exact,names:{curve:curveName,line:chord[2]||'l',focus:focusName,directrixFoot,endpoints,target},thetaDefault,thetaResolved,givenTheta:angle.givenTheta,angleConflict,angleUnsupported:angle.angleUnsupported,angleInPremise:readAngle(head).givenTheta!=null,parts:{equation:null,length:null,perpendicular:null}};
    const coefficient=2*standardP,equation=`y^2=${near(coefficient,1)?'':tex(coefficient)}x`,derivation=[`设焦点 $${focusName}=(p/2,0)$。过焦点的非退化直线用有向长度参数 $t$ 表示，联立后两根乘积为 $-p^2/\\sin^2\\theta<0$，所以焦点确实位于弦两端之间。由焦点—准线等距定义，$|${endpoints[0]}${focusName}|=x_1+p/2$、$|${endpoints[1]}${focusName}|=x_2+p/2$。`,
      `因此 $|${pair}|=x_1+x_2+p=2\\cdot ${tex(midpointX)}+p=${tex(chordLength)}$，得题设标准参数 $p=${tex(standardP)}>0$。`,
      `故抛物线方程为 $${equation}$。本程序内部使用 $y^2=4p_{\\mathrm{app}}x$，所以画板参数 $p_{\\mathrm{app}}=${tex(p)}$，与题设参数不会混淆。`,
      `存在性校验：焦点弦中点横坐标必须不小于 $p/2$；本题 $${tex(midpointX)}\\ge ${tex(p)}$，对应 $\\sin^2\\theta=2p/|${pair}|=${tex(sine2)}$，确有非退化焦点弦。`];
    return {type:'parabola',orientation:'horizontal',direction:1,p,h:0,k:0,equation,exact:{p:tex(p),standardP:tex(standardP),coefficient:tex(coefficient)},inferred_from_conditions:true,derivation,parabolaFocalData:spec,lineThrough:'point:'+focusName,points:{[focusName]:[p,0],[directrixFoot]:[-p,0]},dynamicIntersectionLabels:endpoints,showDynamic:true,showFeatures:false};
  }
  function equationRequest(body,spec){const start=body.search(/求|写出|确定/),goal=start<0?'':body.slice(start),request=goal.match(/(?:求|写出|确定)(?:出)?(?:抛物线)?([A-Z])?(?:的)?(?:标准)?方程(?:[,。;；]|$)/);return request&&(!request[1]||!spec?.names.curve||request[1]===spec.names.curve)&&!/并|以及|同时|面积|周长|距离|最大|最小|范围|坐标|之比/.test(goal);}
  function lengthRequest(body,spec){const pair=spec.names.endpoints.join(''),start=body.search(/求|计算|确定/),goal=body.slice(start),premise=start<0?body:body.slice(0,start);return new RegExp(`(?:求|计算|确定)(?:出)?(?:\\|${pair}\\||(?:弦|线段)?${pair}(?:的)?(?:长度|弦长))(?:[,。;；]|$)`).test(goal)&&!/并|以及|同时|面积|周长|最大|最小|范围|坐标|之比/.test(goal)&&!/且|同时|另|通过|经过|过点|垂直|平行|中点|满足|距离|象限|切线|不成立|不是|或/.test(premise);}
  function perpendicularRequest(body,spec){const M=spec.names.target,[A,B]=spec.names.endpoints;return M&&body.includes(`${M}${A}垂直${M}${B}`)&&new RegExp(`设${M}为准线上(?:一)?点`).test(body)&&new RegExp(`求(?:出)?(?:点)?${M}(?:的)?坐标(?:[,。;；]|$)`).test(body)&&!/并|以及|同时|最[大小]|最大|最小|面积|周长|范围|轨迹|之比|象限|横坐标|纵坐标|距离|中点|不成立|不垂直|不设|不令|并未|并非|无需|或|[<>≥≤=]/.test(body);}
  function perpendicularApplicable(body,spec){return spec.thetaResolved!=null&&!spec.angleConflict&&!spec.angleUnsupported&&(near(spec.thetaResolved,90)||spec.angleInPremise||spec.parts.length!=null&&body.includes(`(${spec.parts.length})`)||near(readAngle(body).givenTheta,spec.thetaResolved));}
  function install(scene,raw,parts){
    const inferred=infer(raw),model=scene?.model,values=scene?.values||{};if(!inferred||model?.type!=='parabola')return null;
    const spec=JSON.parse(JSON.stringify(inferred.parabolaFocalData));
    if(model.orientation==='vertical'||Number(values.direction??model.direction??1)!==1||!near(Number(values.p??model.p),spec.p)||!near(Number(values.h??model.h??0),0)||!near(Number(values.k??model.k??0),0))return null;
    for(const part of parts||[]){const body=normalize(part.body||part.question||'');if(equationRequest(body,spec))spec.parts.equation=part.index;else if(lengthRequest(body,spec))spec.parts.length=part.index;else if(perpendicularRequest(body,spec))spec.parts.perpendicular=part.index;}
    if(Object.values(spec.parts).every(value=>value==null))return null;
    const names=spec.names,points={[names.focus]:[spec.p,0],[names.directrixFoot]:[-spec.p,0]},reserved=new Set([names.focus,names.directrixFoot,...names.endpoints,...(names.target?[names.target]:[]),'N₀']);
    const owned=object=>object.source==='derived'&&String(object.id||'').startsWith(PREFIX);
    if([...(model.objects||[]),...(model.lines||[])].some(object=>!owned(object)&&(reserved.has(object.label)||String(object.id||'').startsWith(PREFIX)))||Object.entries(model.points||{}).some(([name,xy])=>reserved.has(name)&&(!points[name]||!near(xy[0],points[name][0])||!near(xy[1],points[name][1])))||Object.keys(model.pointBindings||{}).some(name=>reserved.has(name)))return null;
    model.parabolaFocalData=spec;model.points={...(model.points||{}),...points};model.pointParts={...(model.pointParts||{})};const scopes=Object.values(spec.parts).filter(value=>value!=null);for(const name of Object.keys(points))model.pointParts[name]=scopes;
    model.lineThrough='point:'+names.focus;model.dynamicIntersectionLabels=names.endpoints;model.dynamicLineLabel=normalize(raw).match(/过[A-Z](?:的)?直线([a-z])与/)?.[1]||'l';model.showDynamic=true;model.showFeatures=false;values.theta=spec.thetaResolved??spec.thetaDefault;
    model.lines||=[];model.objects||=[];model.polygons||=[];const add=(items,object)=>{if(!items.some(old=>old.id===object.id))items.push(object);};
    const common={source:'derived',visible:true,parts:scopes},directrixId=PREFIX+'directrix',midId=PREFIX+'midpoint';
    add(model.lines,{id:directrixId,kind:'vertical',x:-spec.p,label:'准线',...common});
    const pairRefs=names.endpoints.map(name=>'feature:'+name),sameRefs=refs=>Array.isArray(refs)&&refs.length===2&&refs.every(ref=>pairRefs.includes(ref)),fullScope=object=>object.part==null&&(!Array.isArray(object.parts)||!object.parts.length)||object.part==null&&scopes.every(part=>object.parts?.includes(part));
    const questionChord=[...model.lines,...model.objects].find(object=>object.source==='question'&&fullScope(object)&&(object.kind==='construction'&&object.op==='segment'&&sameRefs(object.refs)||object.kind==='through_points'&&!object.infinite&&sameRefs(['feature:'+object.a,'feature:'+object.b])));
    if(!questionChord)add(model.objects,{id:PREFIX+'chord',kind:'construction',op:'segment',refs:pairRefs,label:names.endpoints.join(''),...common});
    add(model.objects,{id:midId,kind:'construction',op:'midpoint',refs:names.endpoints.map(name=>'feature:'+name),label:'N₀',...common});
    const perpendicularBody=normalize((parts||[]).find(part=>part.index===spec.parts.perpendicular)?.body||(parts||[]).find(part=>part.index===spec.parts.perpendicular)?.question||'');
    spec.perpendicularResolved=perpendicularApplicable(perpendicularBody,spec);
    if(spec.parts.perpendicular!=null&&spec.perpendicularResolved){
      const scope={source:'derived',visible:true,part:spec.parts.perpendicular},mId=PREFIX+'M';
      add(model.objects,{id:mId,kind:'construction',op:'foot',refs:[midId,directrixId],label:names.target,...scope});
      names.endpoints.forEach((name,index)=>add(model.objects,{id:PREFIX+(index?'MB':'MA'),kind:'construction',op:'segment',refs:[mId,'feature:'+name],label:names.target+name,...scope}));
      add(model.polygons,{id:PREFIX+'triangle',kind:'polygon',labels:[names.target,...names.endpoints],label:'△'+names.target+names.endpoints.join(''),...scope});
    }
    spec.currentP=spec.p;spec.graphValid=true;spec.graphReason=null;
    return {schema:SCHEMA,spec,parts:spec.parts,derivation:inferred.derivation};
  }
  function update(scene){
    const model=scene?.model,values=scene?.values||{},spec=model?.parabolaFocalData;if(spec?.schema!==SCHEMA)return null;
    const fail=reason=>{spec.graphValid=false;spec.graphReason=reason;return {valid:false,reason,currentP:spec.currentP??spec.p,exploring:true};},p=Number(values.p??model.p),previous=Number(spec.currentP??spec.p),theta=Number(values.theta??model.theta??spec.thetaResolved??spec.thetaDefault),names=spec.names;
    if(model.type!=='parabola'||model.orientation==='vertical'||Number(values.direction??model.direction??1)!==1||!near(Number(values.h??model.h??0),0)||!near(Number(values.k??model.k??0),0)||!(p>0&&p<=1e4))return fail('当前曲线不再是本题原点向右开口的抛物线，关联构造暂停；原题解析未改变。');
    if(model.lineThrough!=='point:'+names.focus||model.dynamicIntersectionLabels?.join('|')!==names.endpoints.join('|')||!Number.isFinite(theta)||Math.abs(Math.sin(theta*Math.PI/180))<1e-8)return fail('焦点弦的来源或方向已改变，不能继续套用焦点弦的关联结论。');
    const F=model.points?.[names.focus],K=model.points?.[names.directrixFoot],directrix=(model.lines||[]).find(line=>line.id===PREFIX+'directrix');
    if(!F||!K||!near(F[0],previous)||!near(F[1],0)||!near(K[0],-previous)||!near(K[1],0)||model.pointBindings?.[names.focus]||model.pointBindings?.[names.directrixFoot]||!directrix||directrix.source!=='derived'||directrix.kind!=='vertical'||!near(directrix.x,-previous))return fail('焦点、准线或已知点已被手动修改；已保留你的编辑并暂停关联构造，请恢复原构造后再继续。');
    model.points[names.focus]=[p,0];model.points[names.directrixFoot]=[-p,0];directrix.x=-p;spec.currentP=p;spec.graphValid=true;spec.graphReason=null;
    const originalTheta=spec.thetaResolved??spec.thetaDefault,exploring=!near(p,spec.p)||!near(((theta%180)+180)%180,originalTheta);
    return {valid:true,reason:null,currentP:p,exploring};
  }
  function chordData(spec){
    const angle=spec.thetaResolved*Math.PI/180,sin=Math.sin(angle),rawCos=Math.cos(angle),cos=Math.abs(rawCos)<64*Number.EPSILON?0:rawCos,L=2*spec.standardP/(sin*sin),mid=[spec.standardP/2+spec.standardP*cos*cos/(sin*sin),spec.standardP*cos/sin];
    const endpoints=[-1,1].map(sign=>[mid[0]+sign*L*cos/2,mid[1]+sign*L*sin/2]);
    const cot={15:'2+\\sqrt{3}',30:'\\sqrt{3}',45:'1',60:'\\frac{\\sqrt{3}}{3}',90:'0',120:'-\\frac{\\sqrt{3}}{3}',135:'-1',150:'-\\sqrt{3}',165:'-(2+\\sqrt{3})'}[spec.thetaResolved],yTex=window.DongNumber?.exact(mid[1])?.tex??`${tex(spec.standardP)}\\left(${cot}\\right)`;
    return {length:L,mid,endpoints,M:[-spec.p,mid[1]],midTex:[tex(spec.midpointX),yTex]};
  }
  function solvePart(part,context){
    if(context?.schema!==SCHEMA)return null;const {spec}=context,body=normalize(part?.body||part?.question||''),index=part?.index,[A,B]=spec.names.endpoints,pair=A+B;
    if(index===context.parts.equation&&equationRequest(body,spec)){
      const coefficient=2*spec.standardP;return {status:'answered',answer:`$p=${tex(spec.standardP)}$，抛物线方程为 $y^2=${tex(coefficient)}x$。`,steps:context.derivation||[`焦点 $${spec.names.focus}$ 在线段 ${pair} 内，焦点—准线距离定义给出 $|${pair}|=(x_1+p/2)+(x_2+p/2)=2\\cdot ${tex(spec.midpointX)}+p$。`,`由 $|${pair}|=${tex(spec.chordLength)}$，得 $p=${tex(spec.chordLength)}-2\\cdot ${tex(spec.midpointX)}=${tex(spec.standardP)}>0$。`,`所以 $y^2=2px=${tex(coefficient)}x$；并且中点横坐标 $${tex(spec.midpointX)}\\ge p/2=${tex(spec.p)}$，焦点弦条件可实现。`]};
    }
    if(index===context.parts.length&&lengthRequest(body,spec)&&spec.thetaResolved!=null&&!spec.angleConflict&&!spec.angleUnsupported){
      const data=chordData(spec),F=spec.names.focus;return {status:'answered',answer:`$|${pair}|=${tex(spec.chordLength)}$。`,steps:[`采用上一问的 $p=${tex(spec.standardP)}$，焦点为 $${F}(${tex(spec.p)},0)$，直线倾斜角为 $${tex(spec.thetaResolved)}^\\circ$。`,`用过焦点的参数式 $x=p/2+t\\cos\\theta,\ y=t\\sin\\theta$ 联立 $y^2=2px$，得 $\\sin^2\\theta\\,t^2-2p\\cos\\theta\\,t-p^2=0$。`,`两根之差绝对值即弦长：$|${pair}|=\\dfrac{2p}{\\sin^2\\theta}=\\dfrac{${tex(2*spec.standardP)}}{\\sin^2(${tex(spec.thetaResolved)}^\\circ)}=${tex(data.length)}$。`,`与原来的 $|${pair}|=${tex(spec.chordLength)}$、中点横坐标 $${tex(spec.midpointX)}$ 一致，未擅自舍弃第一问对同一条弦的限制。` ]};
    }
    if(index===context.parts.perpendicular&&perpendicularRequest(body,spec)&&perpendicularApplicable(body,spec)){
      const data=chordData(spec),M=spec.names.target,f=spec.p,mu=spec.midpointX,yMid=data.midTex[1];return {status:'answered',answer:`$${M}(${tex(-f)},${yMid})$。`,steps:[`准线为 $x=-p/2=${tex(-f)}$，令 $${M}=(${tex(-f)},v)$。弦中点 $N_0=(${tex(mu)},${yMid})$，弦长为 $${tex(spec.chordLength)}$。`,`由 $\\overrightarrow{${M}${A}}\\cdot\\overrightarrow{${M}${B}}=|${M}N_0|^2-|N_0${A}|^2$，正交条件等价于 $(${tex(mu)}+${tex(f)})^2+(v-(${yMid}))^2-(${tex(spec.chordLength)}/2)^2=0$。`,`由于焦点弦恒满足 $|${pair}|=2(x_{N_0}+p/2)$，上述常数项恰消去，故 $(v-(${yMid}))^2=0$，唯一解为 $v=${yMid}$。`,`因此 $${M}(${tex(-f)},${yMid})$。画板用弦中点到准线的真实垂足构造此点，${M}${A}、${M}${B} 随弦联动；这一垂足结论对每条非退化焦点弦都成立。`]};
    }
    return null;
  }
  function checks(context){
    if(!context)return [];const {spec}=context,out=[{id:'parabola-focal-data-equation',label:'焦点弦反求方程与存在性',status:'verified',category:'curve',part:spec.parts.equation,detail:'L=2μ+p，p=L−2μ>0，μ≥L/4；标准参数与画板焦距已明确换算。'}];
    if(spec.angleConflict)out.push({id:'parabola-focal-data-angle',label:'同一条弦的条件一致性',status:'contradicted',category:'answer',part:spec.parts.length,detail:'所给倾斜角算出的焦点弦长或中点不满足第一问限制；不能舍弃原条件继续给答案。'});
    else if(spec.angleUnsupported)out.push({id:'parabola-focal-data-angle',label:'指定角度的精确求解支持',status:'unresolved',category:'answer',part:spec.parts.length,detail:'本模块只精确支持常用倾斜角，其他角度交由后续推理，未冒称已完成。'});
    else if(spec.thetaResolved!=null&&spec.parts.length!=null)out.push({id:'parabola-focal-data-length',label:'焦点弦长与指定倾斜角',status:'verified',category:'answer',part:spec.parts.length,detail:'联立后利用根之差得到 L=2p/sin²θ，并回代核对原弦长和轴向中点。'});
    if(spec.parts.perpendicular!=null&&spec.perpendicularResolved)out.push({id:'parabola-focal-data-orthogonal',label:'准线点正交的唯一性',status:'verified',category:'answer',part:spec.parts.perpendicular,detail:'MA·MB=MN₀²−(L/2)²=(yM−yN₀)²，唯一为中点在准线上的垂足，不靠绘图数值判断。'});
    return out;
  }
  window.DongParabolaFocalData={infer,install,solvePart,checks,update};
})();
