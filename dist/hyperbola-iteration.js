/* Rectangular-hyperbola chord/reflection iteration: algebra, not a question lookup. */
(()=>{
  'use strict';
  const SCHEMA='dongjiexi-hyperbola-iteration/v1',PREFIX='iteration-',LIMIT=1e4;
  const tex=value=>window.DongNumber?.tex(value)??String(value);
  const near=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=128*Number.EPSILON*Math.max(1,Math.abs(a),Math.abs(b));
  const digits='₀₁₂₃₄₅₆₇₈₉';
  const label=(prefix,index)=>prefix+String(index).split('').map(c=>digits[Number(c)]).join('');
  function normalize(value){
    let raw=String(value??'').replace(/\\([dt]?frac)\s*(\d)\s*(\d)/g,'\\$1{$2}{$3}');
    raw=raw.replace(/([A-Zxy])_\{([^{}]+)\}/g,'$1[$2]').replace(/([A-Zxy])_([a-z]|\d+)/g,'$1[$2]');
    raw=raw.replace(/([A-Zxy])([₀₁₂₃₄₅₆₇₈₉]+)/g,(_,p,s)=>p+'['+[...s].map(c=>digits.indexOf(c)).join('')+']');
    raw=String(window.DongMathInput?.toPlain(raw)??raw).replace(/[\s$`{}]/g,'').replace(/（/g,'(').replace(/）/g,')').replace(/，/g,',').replace(/[−–—]/g,'-').replace(/²/g,'^2').replace(/[·×]/g,'*');
    return raw.replace(/([A-Zxy])n([+-]\d+)?/g,(_,prefix,offset)=>prefix+'[n'+(offset||'')+']').replace(/([A-Zxy])(\d+)(?![\d.])/g,'$1[$2]');
  }
  function scalar(value){
    if(!value||value.length>120||!/^[\d.+\-*/()^π√sqrt]+$/.test(value))return NaN;
    try{return window.DongEquationBuilder?.scalar(value)??NaN;}catch{return NaN;}
  }
  function coordinate(source,position){
    if(source[position]!=='(')return null;
    let depth=0,comma=-1;
    for(let i=position;i<source.length&&i<position+250;i++){
      if(source[i]==='(')depth++;
      if(source[i]===','&&depth===1){if(comma>=0)return null;comma=i;}
      if(source[i]===')'&&!--depth){
        if(comma<0)return null;
        const exact=[source.slice(position+1,comma),source.slice(comma+1,i)],point=exact.map(scalar);
        return point.every(Number.isFinite)?{point,exact,end:i+1}:null;
      }
    }
    return null;
  }
  function kFromBody(body){
    const matches=[...body.matchAll(/(?:若|当|已知)?k=([\d.+\-*/()^π√sqrt]+)/g)],found=matches.length===1?matches[0]:null,value=found&&!/[a-zA-Z]/.test(body[found.index+found[0].length]||'')?scalar(found[1]):NaN;
    return value>0&&value<1?value:null;
  }
  function infer(raw){
    const source=normalize(raw),premise=source.split(/\(1\)(?=若|当|求|证明|求证|设|已知|确定|计算|写出)/)[0];
    if(source.length>18000||premise.length>2500||!/双曲线/.test(premise))return null;
    const curves=[...premise.matchAll(/x\^2-y\^2=/g)];if(curves.length!==1)return null;
    const curveName=premise.slice(0,curves[0].index).match(/双曲线([A-Z])[:：]?$/)?.[1]||null;
    const tail=premise.slice(curves[0].index+curves[0][0].length),rhs=tail.match(/^([a-z])(?![a-zA-Z])/)?.[1];
    let declaredM=null;const assignments=[];
    if(rhs){
      if(/[+\-*/^a-zA-Z]/.test(tail[1]||'')||tail[1]==='('&&!tail.slice(1).startsWith(`(${rhs}>0)`))return null;
      if(new RegExp(`${rhs}(?:<|≤)0|0(?:>|≥)${rhs}`).test(premise))return null;
      for(const assignment of premise.matchAll(new RegExp(`${rhs}=([\\d.+\\-*/()^π√sqrt]+)`,'g'))){const value=scalar(assignment[1]);if(!Number.isFinite(value))return null;assignments.push(value);}
    }
    else{const expression=tail.match(/^[\d.+\-*/()^π√sqrt]+/)?.[0];declaredM=scalar(expression);if(!(declaredM>0)||/[a-zA-Z]/.test(tail[expression?.length||0]||''))return null;}
    if(!/0<k<1/.test(premise)||!/(?:斜率为|斜率是|斜率等于)k/.test(premise)||!/(?:左支|左半支)/.test(premise)||!/关于y轴(?:的)?(?:对称点|对称)/.test(premise))return null;
    if(/关于x轴|原点(?:的)?对称|平行|垂直|相切|象限|距离|线段|且|同时|另外|附加|仅|非左支|不(?:令|为|是|在|关于)|[xy]\[n\][<>≥≤=]|[\d)](?:<|>|≥|≤)[xy]\[n\]|[xy]\[n\](?:恒|为|必须)/.test(premise))return null;
    const starts=[];
    for(const match of premise.matchAll(/([A-Z])\[1\]\(/g)){const point=coordinate(premise,match.index+match[0].length-1);if(point)starts.push({...point,prefix:match[1]});}
    if(starts.length!==1)return null;
    const start=starts[0],m=start.point[0]**2-start.point[1]**2;
    const incidence=new RegExp(`^(?:在|位于)(?:${curveName||'双曲线'}|双曲线)(?:的)?(?:右支)?上`);
    if(!incidence.test(premise.slice(start.end)))return null;
    if(!(start.point[0]>0&&m>0)||!Number.isFinite(m)||Math.max(...start.point.map(Math.abs))>LIMIT||declaredM!=null&&!near(declaredM,m)||assignments.some(value=>!near(value,m)))return null;
    // Both indexed point families must be connected by the stated reflection rule.
    const reflection=premise.match(/令([A-Z])\[n\](?:为|是)([A-Z])\[n-1\]关于y轴(?:的)?(?:对称点|对称)/);
    const alternate=premise.match(/([A-Z])\[n\](?:为|是)([A-Z])\[n-1\]关于y轴(?:的)?(?:对称点|对称)/);
    const rule=reflection||alternate;if(!rule||rule[1]!==start.prefix||rule[1]===rule[2])return null;
    if(!new RegExp(`过${start.prefix}\\[n-1\\]`).test(premise))return null;
    if(!new RegExp(`左(?:半)?支交于${rule[2]}\\[n-1\\]`).test(premise))return null;
    const a=Math.sqrt(m),kDefault=kFromBody(source.split(/\(2\)(?=若|当|求|证明|求证|设|已知|确定|计算|写出)/)[0])??.5,exactM=window.DongNumber?.input(m)??String(m),equation=`x^2-y^2=${tex(m)}`;
    const spec={schema:SCHEMA,start:start.point,m,kDefault,k:kDefault,n:1,pointPrefix:start.prefix,otherPrefix:rule[2],exact:{x1:start.exact[0],y1:start.exact[1],m:exactM},tex:{x1:tex(start.point[0]),y1:tex(start.point[1]),m:tex(m)},parts:{coordinate:null,progression:null,area:null}};
    const derivation=[`将初始点 $${start.prefix}_1(${tex(start.point[0])},${tex(start.point[1])})$ 代入 $x^2-y^2=m$，得 $m=${tex(start.point[0])}^2-(${tex(start.point[1])})^2=${tex(m)}>0$。`];
    return {type:'hyperbola',orientation:'horizontal',a,b:a,h:0,k:0,equation,inferred_from_conditions:true,exact:{a:tex(a),b:tex(a),a2:tex(m),b2:tex(m)},derivation,hyperbolaIteration:spec,showDynamic:false,showFeatures:false};
  }
  function coordinateRequest(body,spec){
    const hasGoal=/求|写出|确定/.test(body),k=kFromBody(body);
    if(!hasGoal||k==null||/证明|并|以及|同时|最[大小]|最大|最小|面积|角|距离|范围|轨迹|直线|公比|之和|之差|乘积|的和|的差/.test(body))return false;
    return /(?:求|写出|确定)(?:出)?x\[2\](?:,|、|和)y\[2\](?:的值|值)?(?:[,。;；]|$)/.test(body)||new RegExp(`(?:求|写出|确定)(?:出)?${spec.pointPrefix}\\[2\\](?:的)?坐标(?:[,。;；]|$)`).test(body);
  }
  function progressionRequest(body){
    if(!/证明|求证/.test(body)||!/等比数列/.test(body)||!/x\[n\]-y\[n\](?:\\)?(?:是|为|构成|的|成)/.test(body)||/并|以及|同时|面积|范围|最[大小]|求(?!证)|不是|非等比|不(?:为|成)|不能/.test(body))return false;
    if(/公比/.test(body)&&!/公比(?:为|是)?\(1\+k\)\/\(1-k\)(?:的)?等比数列/.test(body))return false;
    return true;
  }
  function areaRequest(body,spec){
    const definition=new RegExp(`(?:设)?S\\[n\\](?:为|表示|是)(?:△|三角形)${spec.pointPrefix}\\[n\\]${spec.pointPrefix}\\[n\\+1\\]${spec.pointPrefix}\\[n\\+2\\](?:的)?面积(?:[,。;；]|证明|求证|$)`);
    return /证明|求证/.test(body)&&(/S\[n\]=S\[n\+1\](?:[,。;；]|$)|S\[n\+1\]=S\[n\](?:[,。;；]|$)|面积(?:相等|不变)|面积.{0,8}定值/.test(body))&&definition.test(body)&&!/并|以及|同时|最[大小]|求(?!证)|角度|周长|不是|不(?:相等|等于|为)|不能/.test(body);
  }
  function sample(spec,k=spec?.k,n=spec?.n){
    const fail=reason=>({valid:false,reason,k:Number(k),n:Number(n),points:{},p:[],q:[],triangles:[],areas:[]});
    k=Number(k);n=Number(n);
    if(spec?.schema!==SCHEMA||!Array.isArray(spec.start)||spec.start.length!==2||!spec.start.every(Number.isFinite)||!(spec.m>0&&spec.start[0]>0)||!near(spec.start[0]**2-spec.start[1]**2,spec.m)||!/^[A-Z]$/.test(spec.pointPrefix)||!/^[A-Z]$/.test(spec.otherPrefix)||spec.pointPrefix===spec.otherPrefix)return fail('初始点与双曲线条件不一致。');
    if(!(k>0&&k<1)||!Number.isInteger(n)||n<1||n>1000)return fail('斜率需满足 0<k<1，序号需为 1 到 1000 的整数。');
    const ratio=(1+k)/(1-k),u1=spec.start[0]-spec.start[1],v1=spec.start[0]+spec.start[1],factor=ratio**(n-1),p=[],q=[],points={};
    let u=u1*factor,v=v1/factor;
    for(let i=0;i<4;i++){
      const point=[(u+v)/2,(v-u)/2],scale=Math.max(1,...point.map(value=>value*value),spec.m),residual=point[0]**2-point[1]**2-spec.m;
      if(!point.every(Number.isFinite)||Math.max(...point.map(Math.abs))>LIMIT||Math.abs(residual)>512*Number.EPSILON*scale)return fail('所选斜率或序号使坐标过大，已停止此示意构造；请减小斜率或序号。通项与定值证明仍成立。');
      p.push(point);points[label(spec.pointPrefix,n+i)]=point;
      if(i>0){const reflected=[-point[0],point[1]];q.push(reflected);points[label(spec.otherPrefix,n+i-1)]=reflected;}
      u*=ratio;v/=ratio;
    }
    const area=(A,B,C)=>Math.abs((B[0]-A[0])*(C[1]-A[1])-(C[0]-A[0])*(B[1]-A[1]))/2,areas=[area(...p.slice(0,3)),area(...p.slice(1,4))],theoryArea=4*spec.m*k**3/(1-k*k)**2;
    if(!areas.every(value=>Number.isFinite(value)&&value>0)||!areas.every(value=>Math.abs(value-theoryArea)<=2e-7*theoryArea))return fail('当前构型面积过小或数值精度不足，请调整斜率或序号；不以退化图形替代证明。');
    const triangles=[0,1].map(i=>({id:`${PREFIX}triangle-${n+i}`,labels:[0,1,2].map(j=>label(spec.pointPrefix,n+i+j)),area:areas[i],index:n+i}));
    return {valid:true,reason:null,k,n,ratio,p,q,points,triangles,areas,theoryArea,m:spec.m};
  }
  const owned=object=>object?.source==='derived'&&String(object.id||'').startsWith(PREFIX);
  function update(scene){
    const model=scene?.model,values=scene?.values||{},spec=model?.hyperbolaIteration;
    if(!spec||spec.schema!==SCHEMA)return null;
    const preserved=new Map([...(model.objects||[]),...(model.polygons||[])].filter(owned).map(object=>[object.id,object]));
    model.objects=(model.objects||[]).filter(object=>!owned(object));model.polygons=(model.polygons||[]).filter(object=>!owned(object));
    const a=Number(values.a??model.a),b=Number(values.b??model.b),h=Number(values.h??model.h??0),shiftK=Number(values.k??model.k??0);
    if(model.type!=='hyperbola'||model.orientation==='vertical'||!(a>0&&b>0)||!near(a*a,spec.m)||!near(b*b,spec.m)||!near(h,0)||!near(shiftK,0))return {valid:false,reason:'主曲线已改变，迭代条件不再成立，已隐藏关联构造。',points:{},p:[],q:[],areas:[],triangles:[]};
    const result=sample(spec);if(!result.valid)return result;
    const sourcePoint=model.points?.[label(spec.pointPrefix,1)];if(!sourcePoint||!near(sourcePoint[0],spec.start[0])||!near(sourcePoint[1],spec.start[1]))return {...result,valid:false,reason:'初始点已改变，已隐藏不满足题设的迭代构造。',points:{},p:[],q:[],areas:[],triangles:[]};
    const initialName=label(spec.pointPrefix,1),occupied=new Set([...(model.lines||[]),...(model.objects||[]),...(model.polygons||[])].filter(object=>!owned(object)).map(object=>object.label));
    if(model.pointBindings?.[initialName]||[...(model.lines||[]),...(model.objects||[]),...(model.polygons||[])].some(object=>!owned(object)&&String(object.id||'').startsWith(PREFIX))||Object.keys(result.points).some(name=>occupied.has(name)||name!==initialName&&Object.hasOwn(model.points||{},name)))return {...result,valid:false,reason:'关联点名称与已有对象冲突，已保留原对象并隐藏重复构造。',points:{},p:[],q:[],areas:[],triangles:[]};
    const scopes=[...new Set(Object.values(spec.parts||{}).filter(value=>value!=null))],common={source:'derived',visible:true,parts:scopes};
    const preserve=(object)=>{const old=preserved.get(object.id);if(old){if(Object.hasOwn(old,'visible'))object.visible=old.visible;if(Object.hasOwn(old,'part')){object.part=old.part;delete object.parts;}else if(Object.hasOwn(old,'parts'))object.parts=old.parts;}return object;};
    let previous=result.n===1?'feature:'+label(spec.pointPrefix,1):`${PREFIX}anchor-${result.n}`;
    if(result.n!==1)model.objects.push(preserve({id:previous,kind:'point',x:result.p[0][0],y:result.p[0][1],label:label(spec.pointPrefix,result.n),...common}));
    for(let i=0;i<3;i++){
      const index=result.n+i,lineId=`${PREFIX}line-${index}`,qId=`${PREFIX}Q-${index}`,pId=`${PREFIX}P-${index+1}`;
      model.objects.push(preserve({id:lineId,kind:'construction',op:'line_angle',refs:[previous],angle:Math.atan(result.k)*180/Math.PI,label:`l${String(index).split('').map(c=>digits[Number(c)]).join('')}`,...common}),preserve({id:qId,kind:'construction',op:'intersection',refs:[lineId,'$conic'],branch:0,label:label(spec.otherPrefix,index),...common}),preserve({id:pId,kind:'construction',op:'reflect_axis',refs:[qId],axis:'y',axisValue:0,label:label(spec.pointPrefix,index+1),...common}));
      previous=pId;
    }
    if(spec.parts?.area!=null)for(const triangle of result.triangles)model.polygons.push(preserve({id:triangle.id,kind:'polygon',labels:triangle.labels,label:`△${triangle.labels.join('')}`,part:spec.parts.area,source:'derived',visible:true}));
    return result;
  }
  function install(scene,raw,parts){
    const inferred=infer(raw),model=scene?.model;if(!inferred||model?.type!=='hyperbola')return null;
    const spec=JSON.parse(JSON.stringify(inferred.hyperbolaIteration));
    const values=scene.values||{},a=Number(values.a??model.a),b=Number(values.b??model.b);if(model.orientation==='vertical'||!(a>0&&b>0)||!near(a*a,spec.m)||!near(b*b,spec.m)||!near(Number(values.h??model.h??0),0)||!near(Number(values.k??model.k??0),0))return null;
    for(const part of parts||[]){const body=normalize(part.body||part.question||'');if(coordinateRequest(body,spec)){spec.parts.coordinate=part.index;spec.kDefault=kFromBody(body);spec.k=spec.kDefault;}else if(progressionRequest(body))spec.parts.progression=part.index;else if(areaRequest(body,spec))spec.parts.area=part.index;}
    if(Object.values(spec.parts).every(value=>value==null))return null;
    const name=label(spec.pointPrefix,1),existing=model.points?.[name],conflict=existing&&(!near(existing[0],spec.start[0])||!near(existing[1],spec.start[1]))||model.pointBindings?.[name]||[...(model.lines||[]),...(model.objects||[]),...(model.polygons||[])].some(object=>!owned(object)&&object.label===name);
    if(conflict)return null;
    const preview=sample(spec),names=new Set(Object.keys(preview.points||{}));
    if(!preview.valid||Object.keys(model.points||{}).some(current=>current!==name&&names.has(current))||[...(model.lines||[]),...(model.objects||[]),...(model.polygons||[])].some(object=>!owned(object)&&(names.has(object.label)||String(object.id||'').startsWith(PREFIX))))return null;
    const old=model.hyperbolaIteration;
    if(old?.schema===SCHEMA&&near(old.m,spec.m)&&old.start?.every((value,i)=>near(value,spec.start[i]))){spec.k=old.k??spec.k;spec.n=old.n??spec.n;}
    model.hyperbolaIteration=spec;model.points={...(model.points||{}),[name]:spec.start.slice()};model.pointParts={...(model.pointParts||{}),[name]:Object.values(spec.parts).filter(value=>value!=null)};
    model.showDynamic=false;model.showFeatures=false;
    const current=update(scene);if(!current?.valid)return null;
    return {schema:SCHEMA,spec,m:spec.m,parts:spec.parts};
  }
  function recurrenceSteps(context){
    const {spec}=context,P=spec.pointPrefix,Q=spec.otherPrefix;
    return [`设 $${P}_n=(x_n,y_n)$，下一步左支交点为 $${Q}_n=(-x_{n+1},y_{n+1})$。过 $${P}_n$ 的直线为 $y=kx+y_n-kx_n$。`,
      '将直线代入双曲线并用两根之和，再作关于 y 轴的反射，得到 $$x_{n+1}=\\frac{(1+k^2)x_n-2ky_n}{1-k^2},\\qquad y_{n+1}=\\frac{-2kx_n+(1+k^2)y_n}{1-k^2}.$$',
      '由 $0<k<1$，分母为正；且右支点 $x_n>|y_n|$，上式给出 $x_{n+1}>0$，故所取的未反射交点确在左支，而不是误选原来的右支点。'];
  }
  function solvePart(part,context){
    if(!context||context.schema!==SCHEMA)return null;
    const {spec}=context,body=normalize(part?.body||part?.question||''),index=part?.index;
    if(index===context.parts.coordinate&&coordinateRequest(body,spec)){
      const k=kFromBody(body),r=(1+k)/(1-k),u=(spec.start[0]-spec.start[1])*r,v=(spec.start[0]+spec.start[1])/r,x=(u+v)/2,y=(v-u)/2;
      return {status:'answered',answer:`$x_2=${tex(x)},\\ y_2=${tex(y)}$，即 $${spec.pointPrefix}_2(${tex(x)},${tex(y)})$。`,steps:[`代入初始点得 $m=${tex(spec.m)}$。当 $k=${tex(k)}$ 时，直线为 $y=${tex(k)}x+(${tex(spec.start[1]-k*spec.start[0])})$。`,...recurrenceSteps(context),`代入 $x_1=${tex(spec.start[0])},y_1=${tex(spec.start[1])}$，先得左支交点 $${spec.otherPrefix}_1(-${tex(x)},${tex(y)})$，关于 y 轴反射后得 $${spec.pointPrefix}_2(${tex(x)},${tex(y)})$。`]};
    }
    if(index===context.parts.progression&&progressionRequest(body)){
      const first=tex(spec.start[0]-spec.start[1]);return {status:'answered',answer:`$\\{x_n-y_n\\}$ 是首项为 $${first}$、公比 $r=\\frac{1+k}{1-k}$ 的等比数列；$x_n-y_n=${first}\\left(\\frac{1+k}{1-k}\\right)^{n-1}$。`,steps:[...recurrenceSteps(context),'两式相减，并约去非零因子 $1+k$，得 $$x_{n+1}-y_{n+1}=\\frac{(1+k)^2}{1-k^2}(x_n-y_n)=\\frac{1+k}{1-k}(x_n-y_n).$$',`由于初始点在右支，$x_1-y_1=${first}>0$，故该数列没有零项，按定义为等比数列。这是对所有正整数 n 的递推证明，而不是有限次作图观察。`]};
    }
    if(index===context.parts.area&&areaRequest(body,spec)){
      const u=tex(spec.start[0]-spec.start[1]),v=tex(spec.start[0]+spec.start[1]),m=tex(spec.m),P=spec.pointPrefix;
      return {status:'answered',answer:`对所有正整数 $n$，$S_n=S_{n+1}=\\frac{${m}(r-1)^3(r+1)}{4r^2}=\\frac{4\\cdot ${m}k^3}{(1-k^2)^2}$，其中 $r=\\frac{1+k}{1-k}>1$。`,steps:[...recurrenceSteps(context),`两式相减及相加，分别得 $u_n=x_n-y_n=${u}r^{n-1}$、$v_n=x_n+y_n=${v}r^{1-n}$，且 $u_nv_n=m=${m}$。因此 $x_n=(u_n+v_n)/2,y_n=(v_n-u_n)/2$。`,
        `三角形 $${P}_n${P}_{n+1}${P}_{n+2}$ 的面积为 $$S_n=\\frac12\\left|(x_{n+1}-x_n)(y_{n+2}-y_n)-(x_{n+2}-x_n)(y_{n+1}-y_n)\\right|.$$ 将通项代入，公因子 $r^{n-1}r^{1-n}=1$ 消去，得到 $S_n=\\dfrac{${m}(r-1)^3(r+1)}{4r^2}$，不依赖 n。`,
        '也可用线性变换验证：$$T=\\frac1{1-k^2}\\begin{pmatrix}1+k^2&-2k\\\\-2k&1+k^2\\end{pmatrix},\\qquad\\det T=\\frac{(1+k^2)^2-4k^2}{(1-k^2)^2}=1.$$',
        `从 $${P}_n${P}_{n+1}${P}_{n+2}$ 到 $${P}_{n+1}${P}_{n+2}${P}_{n+3}$，两条边向量均被同一个 T 变换，行列式（有向面积）乘以 $\\det T=1$，所以 $S_{n+1}=S_n$。`,
        '画板只显示当前序号附近两组三角形，方便比较；面积不变的结论来自上述恒等式，对所有正整数成立，并非由有限样本推出。']};
    }
    return null;
  }
  function checks(context){
    if(!context)return [];
    const out=[{id:'hyperbola-iteration-model',label:'初始点、左右支与轴对称建模',status:'verified',category:'curve',detail:'由初始坐标计算 m>0；0<k<1 保证另一交点在左支，反射后回到右支。'}];
    if(context.parts.progression!=null)out.push({id:'hyperbola-iteration-ratio',label:'等比递推恒等式',status:'verified',category:'answer',part:context.parts.progression,detail:'逐项使用联立与韦达得到递推，再代数相减；不是数值采样证明。'});
    if(context.parts.area!=null)out.push({id:'hyperbola-iteration-area',label:'所有序号的面积不变',status:'verified',category:'answer',part:context.parts.area,detail:'坐标通项中的互逆幂完全消去，并以 det(T)=1 独立校验有向面积不变。'});
    return out;
  }
  window.DongHyperbolaIteration={infer,install,solvePart,checks,sample,update};
})();
