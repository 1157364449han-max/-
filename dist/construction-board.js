/* 董解析原生动态构造。纯本地几何计算，无第三方加载或远程调用。 */
(() => {
  'use strict';
  const EPS=1e-9,finitePoint=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
  const sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y}),add=(a,b)=>({x:a.x+b.x,y:a.y+b.y});
  const mul=(p,t)=>({x:p.x*t,y:p.y*t}),dot=(a,b)=>a.x*b.x+a.y*b.y,cross=(a,b)=>a.x*b.y-a.y*b.x;
  const norm=p=>Math.hypot(p.x,p.y),distance=(a,b)=>norm(sub(a,b));
  const validLine=s=>s?.type==='line'&&finitePoint(s.o)&&finitePoint(s.d)&&norm(s.d)>EPS;
  const validCircle=s=>s?.type==='circle'&&finitePoint(s)&&Number.isFinite(s.r)&&s.r>EPS;
  const within=(line,t)=>!line.segment&&!line.ray||t>=-EPS&&(!line.segment||t<=1+EPS);
  const linkedCurveLine=object=>['tangent','normal'].includes(object?.role)&&Array.isArray(object.refs)&&object.refs.length===2;
  function curveCoefficients(shape){return validCircle(shape)?{A:1,B:0,C:1,D:-2*shape.x,E:-2*shape.y,F:shape.x*shape.x+shape.y*shape.y-shape.r*shape.r}:shape?.type==='conic'?shape.q:null;}
  function curveLine(point,shape,normal=false){
    const q=curveCoefficients(shape);if(!finitePoint(point)||!q)return null;
    const x=point.x,y=point.y,gx=2*q.A*x+q.B*y+q.D,gy=q.B*x+2*q.C*y+q.E,gradient=Math.hypot(gx,gy);
    const terms=[q.A*x*x,q.B*x*y,q.C*y*y,q.D*x,q.E*y,q.F],residual=terms.reduce((a,b)=>a+b,0);
    const roundoff=32*Number.EPSILON*terms.reduce((sum,v)=>sum+Math.abs(v),0);
    if(gradient<=EPS||Math.abs(residual)>1e-7*gradient+roundoff)return null;
    return {type:'line',o:point,d:normal?{x:gx,y:gy}:{x:gy,y:-gx}};
  }
  // Added conics use their own parameters for both rendering and dependencies.
  function conicShape(obj){
    const h=Number(obj.h||0),k=Number(obj.k||0),vertical=obj.orientation==='vertical',kind=obj.conicType||obj.type;
    let A=0,C=0,D=0,E=0,F=0;
    const a=Number(obj.a),b=Number(obj.b),p=Number(obj.p),direction=obj.direction===-1?-1:1;
    if(['ellipse','hyperbola'].includes(kind)){
      if(!(a>0&&b>0))return null;
      const major=1/(a*a),minor=(kind==='ellipse'?1:-1)/(b*b);
      A=vertical?minor:major;C=vertical?major:minor;D=-2*h*A;E=-2*k*C;F=A*h*h+C*k*k-1;
    }else if(kind==='parabola'){
      if(!(p>0))return null;const coefficient=4*p*direction;
      if(vertical){A=1;D=-2*h;E=-coefficient;F=h*h+coefficient*k;}
      else{C=1;D=-coefficient;E=-2*k;F=k*k+coefficient*h;}
    }else return null;
    const pointAt=(t,branch=1)=>{
      if(kind==='ellipse')return{x:h+(vertical?b:a)*Math.cos(t),y:k+(vertical?a:b)*Math.sin(t)};
      if(kind==='hyperbola')return vertical?{x:h+b*Math.sinh(t),y:k+branch*a*Math.cosh(t)}:{x:h+branch*a*Math.cosh(t),y:k+b*Math.sinh(t)};
      const major=direction*t*t/(4*p);return vertical?{x:h+t,y:k+major}:{x:h+major,y:k+t};
    };
    const project=point=>{
      const x=point.x-h,y=point.y-k;
      if(kind==='ellipse')return{t:Math.atan2(y/(vertical?a:b),x/(vertical?b:a))};
      if(kind==='hyperbola')return{t:Math.asinh((vertical?x:y)/b),branch:(vertical?y:x)<0?-1:1};
      return{t:vertical?x:y};
    };
    return {type:'conic',q:{A,B:0,C,D,E,F},pointAt,project};
  }
  function quadratic(a,b,c){
    const scale=Math.max(Math.abs(a),Math.abs(b),Math.abs(c),1);a/=scale;b/=scale;c/=scale;
    if(Math.abs(a)<1e-12)return Math.abs(b)<1e-12?[]:[-c/b];
    const d=b*b-4*a*c;if(d<-1e-11)return [];
    if(Math.abs(d)<1e-11)return [-b/(2*a)];
    return [(-b-Math.sqrt(d))/(2*a),(-b+Math.sqrt(d))/(2*a)].sort((x,y)=>x-y);
  }
  function intersect(a,b){
    if(!a||!b)return [];
    if(a.type!=='line'&&b.type==='line')return intersect(b,a);
    if(validLine(a)&&validLine(b)){
      const determinant=cross(a.d,b.d);if(Math.abs(determinant)<EPS*norm(a.d)*norm(b.d))return [];
      const delta=sub(b.o,a.o),t=cross(delta,b.d)/determinant,u=cross(delta,a.d)/determinant;
      return within(a,t)&&within(b,u)?[add(a.o,mul(a.d,t))]:[];
    }
    if(validLine(a)&&(validCircle(b)||b.type==='conic')){
      let q=b.q;
      if(b.type==='circle')q={A:1,B:0,C:1,D:-2*b.x,E:-2*b.y,F:b.x*b.x+b.y*b.y-b.r*b.r};
      const {x,y}=a.o,dx=a.d.x,dy=a.d.y;
      const aa=q.A*dx*dx+q.B*dx*dy+q.C*dy*dy;
      const bb=2*q.A*x*dx+q.B*(x*dy+y*dx)+2*q.C*y*dy+q.D*dx+q.E*dy;
      const cc=q.A*x*x+q.B*x*y+q.C*y*y+q.D*x+q.E*y+q.F;
      return quadratic(aa,bb,cc).filter(t=>within(a,t)).map(t=>add(a.o,mul(a.d,t)));
    }
    if(validCircle(a)&&validCircle(b)){
      const delta=sub(b,a),d=norm(delta);if(d<EPS||d>a.r+b.r+EPS||d<Math.abs(a.r-b.r)-EPS)return [];
      const t=(a.r*a.r-b.r*b.r+d*d)/(2*d),base=add(a,mul(delta,t/d)),h2=a.r*a.r-t*t;
      if(h2<-EPS)return [];if(h2<EPS)return [base];
      const offset=mul({x:-delta.y,y:delta.x},Math.sqrt(h2)/d);return [sub(base,offset),add(base,offset)];
    }
    return [];
  }
  function createEngine(api){
    const objects=()=>[...(api.model()?.lines||[]),...(api.model()?.objects||[])];
    function ensureIds(){let seq=0;const used=new Set(objects().map(o=>o.id).filter(Boolean));for(const obj of objects())if(!obj.id){let id;do{id='native-'+(++seq);}while(used.has(id));obj.id=id;used.add(id);}}
    const getObject=id=>objects().find(o=>o.id===id);
    const pointValue=p=>finitePoint(p)?{type:'point',x:p.x,y:p.y}:null;
    function resolve(id,seen=new Set(),cache=new Map()){
      if(cache.has(id))return cache.get(id);if(seen.has(id)||seen.size>80)return null;seen.add(id);
      let result=null;
      try{
        if(id==='$conic')result={type:'conic',q:api.coeffs(),pointAt:api.conicPoint,project:api.conicProject};
        else if(id==='$dynamic'){const t=api.angle()*Math.PI/180;result={type:'line',o:api.origin(),d:{x:Math.cos(t),y:Math.sin(t)}};}
        else if(String(id).startsWith('feature:'))result=pointValue(api.features().find(p=>p.name===id.slice(8)));
        else{
          const obj=getObject(id);if(!obj)return null;
          const refs=(obj.refs||[]).map(ref=>resolve(ref,seen,cache));
          const named=name=>{
            const custom=objects().find(o=>o.label===name&&['point','construction'].includes(o.kind));
            return custom?resolve(custom.id,seen,cache):resolve('feature:'+name,seen,cache);
          };
          if(linkedCurveLine(obj))result=curveLine(refs[0],refs[1],obj.role==='normal');
          else if(obj.kind==='point')result=pointValue(obj);
          else if(obj.kind==='circle')result={type:'circle',x:obj.h,y:obj.k,r:obj.r};
          else if(obj.kind==='conic')result=conicShape(obj);
          else if(['line','slope','vertical'].includes(obj.kind))result=obj.m!=null?{type:'line',o:{x:0,y:+(obj.b||0)},d:{x:1,y:+obj.m}}:{type:'line',o:{x:+obj.x,y:0},d:{x:0,y:1}};
          else if(obj.kind==='through_points'){const a=named(obj.a),b=named(obj.b);if(a&&b)result={type:'line',o:a,d:sub(b,a),segment:!obj.infinite};}
          else if(obj.kind==='construction'){
            const [a,b]=refs;
            if(['line','segment','ray'].includes(obj.op)&&a?.type==='point'&&b?.type==='point')result={type:'line',o:a,d:sub(b,a),segment:obj.op==='segment',ray:obj.op==='ray'};
            if(obj.op==='line_angle'&&a?.type==='point'&&Number.isFinite(obj.angle)){const angle=obj.angle*Math.PI/180;result={type:'line',o:a,d:{x:Math.cos(angle),y:Math.sin(angle)}};}
            if(obj.op==='circle'&&a?.type==='point'&&b?.type==='point')result={type:'circle',x:a.x,y:a.y,r:distance(a,b)};
            if(obj.op==='midpoint'&&a?.type==='point'&&b?.type==='point')result=pointValue(mul(add(a,b),.5));
            if(['parallel','perpendicular'].includes(obj.op)&&a?.type==='point'&&validLine(b))result={type:'line',o:a,d:obj.op==='parallel'?b.d:{x:-b.d.y,y:b.d.x}};
            if(obj.op==='foot'&&a?.type==='point'&&validLine(b))result=pointValue(add(b.o,mul(b.d,dot(sub(a,b.o),b.d)/dot(b.d,b.d))));
            if(['tangent','normal'].includes(obj.op)&&a?.type==='point')result=curveLine(a,b,obj.op==='normal');
            if(obj.op==='intersection')result=pointValue(intersect(a,b)[obj.branch||0]);
            if(obj.op==='distance'&&a?.type==='point'&&b?.type==='point')result={type:'measure',...mul(add(a,b),.5),value:distance(a,b)};
            if(obj.op==='point_on'&&a){
              if(validLine(a))result=pointValue(add(a.o,mul(a.d,obj.t)));
              else if(validCircle(a))result=pointValue({x:a.x+a.r*Math.cos(obj.t),y:a.y+a.r*Math.sin(obj.t)});
              else if(a.type==='conic')result=pointValue(a.pointAt?.(obj.t,obj.branch||1));
            }
          }
        }
        if(result?.type==='line'&&!validLine(result)||result?.type==='circle'&&!validCircle(result))result=null;
      }finally{seen.delete(id);}
      cache.set(id,result);return result;
    }
    function project(id,p){
      const shape=resolve(id);if(!shape)return null;
      if(validLine(shape)){let t=dot(sub(p,shape.o),shape.d)/dot(shape.d,shape.d);if(shape.segment)t=Math.max(0,Math.min(1,t));else if(shape.ray)t=Math.max(0,t);return {t};}
      if(validCircle(shape))return {t:Math.atan2(p.y-shape.y,p.x-shape.x)};
      if(shape.type==='conic')return shape.project?.(p)||null;
      return null;
    }
    function freePoint(id){
      if(String(id).startsWith('feature:')){const name=id.slice(8),model=api.model();if(model.points?.[name]&&!model.pointBindings?.[name])return {get:()=>({x:model.points[name][0],y:model.points[name][1]}),set:p=>model.points[name]=[p.x,p.y]};return null;}
      const obj=getObject(id);return obj?.kind==='point'?{get:()=>({x:obj.x,y:obj.y}),set:p=>Object.assign(obj,p)}:null;
    }
    function descendants(id){const result=new Set([id]);let changed=true;while(changed){changed=false;for(const o of objects())if(!result.has(o.id)&&(o.refs||[]).some(ref=>result.has(ref))){result.add(o.id);changed=true;}}return result;}
    function pointOn(id,parameter){const shape=resolve(id);if(!shape)return null;if(validLine(shape))return add(shape.o,mul(shape.d,parameter.t));if(validCircle(shape))return{x:shape.x+shape.r*Math.cos(parameter.t),y:shape.y+shape.r*Math.sin(parameter.t)};return shape.type==='conic'?shape.pointAt?.(parameter.t,parameter.branch||1):null;}
    function invalidReason(id){
      if(resolve(id))return '';
      const object=getObject(id);if(!object)return '引用的对象不存在';
      if((object.refs||[]).some(ref=>!resolve(ref)))return '源对象未定义、缺失或构造关系循环';
      if(['tangent','normal'].includes(object.op)||linkedCurveLine(object))return '所选点不在曲线上，或曲线在此处退化';
      if(object.op==='intersection')return '当前无此分支的实交点（可能相离、相切合并或重合）';
      return '构造退化或参数无效';
    }
    return {objects,ensureIds,getObject,resolve,project,pointOn,freePoint,descendants,intersect,invalidReason};
  }

  function attach(api){
    const {state,canvas,ctx,xy}=api,$=id=>document.getElementById(id);
    const engine=createEngine({model:()=>state.model,features:api.features,coeffs:api.coeffs,origin:api.origin,angle:()=>state.p.theta,conicPoint:api.conicPoint,conicProject:api.conicProject});
    let tool=null,pending=[],staged=[],selected=null,hover=null,pointer=null,snapPreview=null;
    const titles={point:'点',line:'直线',line_angle:'过点直线',segment:'线段',ray:'射线',circle:'圆',midpoint:'中点',parallel:'平行线',perpendicular:'垂线',intersection:'交点',foot:'垂足',distance:'测距',tangent:'切线',normal:'法线'};
    const hint=text=>$('dragHint').textContent=text;
    const uid=()=>globalThis.crypto?.randomUUID?.()||'obj-'+Date.now()+'-'+Math.random().toString(36).slice(2);
    const fmt=n=>Number(n.toFixed(4)).toString();
    function label(prefix){const used=new Set([...api.features().map(p=>p.name),...engine.objects().map(o=>o.label),...staged.map(o=>o.label)]);let i=1;while(used.has(prefix+i))i++;return prefix+i;}
    function visible(id){if(id==='$conic')return state.model?.showConic!==false;if(id==='$dynamic')return state.model?.showDynamic!==false&&api.visible({part:state.model.dynamicLinePart});if(id.startsWith('feature:'))return state.model?.showFeatures!==false;const o=engine.getObject(id);return o&&api.visible(o);}
    function points(){return [...api.features().filter(p=>api.featureVisible?api.featureVisible(p):state.model?.showFeatures!==false).map(p=>({id:'feature:'+p.name,...p})),...engine.objects().filter(o=>api.visible(o)).map(o=>({id:o.id,...engine.resolve(o.id)})).filter(o=>o.type==='point')];}
    function pointAt(screen,threshold=14){return points().map(p=>({...p,d:distance(xy(p.x,p.y),screen)})).filter(p=>p.d<threshold).sort((a,b)=>a.d-b.d)[0];}
    function shapeDistance(shape,p){
      if(validLine(shape)){const t=dot(sub(p,shape.o),shape.d)/dot(shape.d,shape.d),clamped=shape.segment?Math.max(0,Math.min(1,t)):shape.ray?Math.max(0,t):t;return distance(p,add(shape.o,mul(shape.d,clamped)));}
      if(validCircle(shape))return Math.abs(distance(p,shape)-shape.r);
      if(shape?.type==='conic'){const q=shape.q,v=q.A*p.x*p.x+q.B*p.x*p.y+q.C*p.y*p.y+q.D*p.x+q.E*p.y+q.F,g=Math.hypot(2*q.A*p.x+q.B*p.y+q.D,q.B*p.x+2*q.C*p.y+q.E);return g>EPS?Math.abs(v)/g:Infinity;}
      return Infinity;
    }
    function shapeAt(screen,exclude=[],onlyLine=false,onlyCurve=false){
      const p=api.world(screen),unit=(state.view.xmax-state.view.xmin)/state.cssW;
      return [...engine.objects().map(o=>o.id),'$dynamic','$conic'].filter(id=>visible(id)&&!exclude.includes(id)).map(id=>({id,shape:engine.resolve(id)})).filter(o=>(!onlyLine||o.shape?.type==='line')&&(!onlyCurve||curveCoefficients(o.shape))).map(o=>({...o,d:shapeDistance(o.shape,p)/unit})).filter(o=>o.d<15).sort((a,b)=>a.d-b.d)[0];
    }
    const smartSnap=()=>$('geometrySnap')?.checked!==false;
    function pointSnap(screen){
      const threshold=smartSnap()?18:6,existing=pointAt(screen,threshold);
      if(existing)return{point:existing,ref:existing.id,label:`吸附到点 ${title(existing.id)}`};
      if(!smartSnap())return null;
      const world=api.world(screen),unit=(state.view.xmax-state.view.xmin)/state.cssW;
      const shapes=[...engine.objects().map(obj=>obj.id),'$dynamic','$conic'].filter(visible)
        .map(id=>({id,shape:engine.resolve(id)})).filter(item=>shapeDistance(item.shape,world)/unit<22)
        .sort((a,b)=>shapeDistance(a.shape,world)-shapeDistance(b.shape,world)).slice(0,12);
      let crossing=null;
      for(let i=0;i<shapes.length;i++)for(let j=i+1;j<shapes.length;j++){
        const left=shapes[i],right=shapes[j];
        intersect(left.shape,right.shape).forEach((point,branch)=>{const d=distance(xy(point.x,point.y),screen);if(d<threshold&&(!crossing||d<crossing.d))crossing={point,d,op:'intersection',refs:[left.id,right.id],branch,label:`吸附交点：${title(left.id)} ∩ ${title(right.id)}`};});
      }
      if(crossing)return crossing;
      let nearest=null;
      for(const item of shapes){const parameter=engine.project(item.id,world),point=parameter&&engine.pointOn(item.id,parameter);if(!finitePoint(point))continue;const d=distance(xy(point.x,point.y),screen);if(d<threshold&&(!nearest||d<nearest.d))nearest={point,d,op:'point_on',refs:[item.id],...parameter,label:`吸附到 ${title(item.id)}（随图形移动）`};}
      return nearest;
    }
    function directionPoint(origin,point){
      const length=distance(origin,point);if(!smartSnap()||length<EPS)return point;
      const angle=Math.atan2(point.y-origin.y,point.x-origin.x),nearest=Math.round(angle/(Math.PI/4))*Math.PI/4;
      const target=add(origin,{x:length*Math.cos(nearest),y:length*Math.sin(nearest)});
      if(distance(xy(target.x,target.y),xy(point.x,point.y))<10){snapPreview={point:target,label:`方向吸附 ${((Math.round(nearest*180/Math.PI)%360)+360)%360}°`};return target;}return point;
    }
    function select(id){selected=id;inspector();}
    function title(id){if(id==='$conic')return '主圆锥曲线';if(id==='$dynamic')return '动直线';if(id?.startsWith('feature:'))return id.slice(8);return engine.getObject(id)?.label||staged.find(o=>o.id===id)?.label||'对象';}
    function describe(shape,object){
      if(!shape)return '暂未定义：检查依赖对象是否存在，或两条曲线当前是否相交。';
      const equation=window.DongEquationBuilder?.curveEquation(object);if(equation)return equation;
      if(shape.type==='point')return `(${fmt(shape.x)}, ${fmt(shape.y)})`;
      if(shape.type==='circle')return `(x − ${fmt(shape.x)})² + (y − ${fmt(shape.y)})² = ${fmt(shape.r*shape.r)}`;
      if(shape.type==='measure')return `距离 = ${fmt(shape.value)}`;
      if(shape.type==='line'){if(Math.abs(shape.d.x)<EPS)return `x = ${fmt(shape.o.x)}`;const m=shape.d.y/shape.d.x,b=shape.o.y-m*shape.o.x;return `y = ${fmt(m)}x ${b<0?'−':'+'} ${fmt(Math.abs(b))}`;}
      return '圆锥曲线：拖动中心和蓝色手柄调整参数';
    }
    function inspector(){
      const box=$('nativeInspector');if(!selected){box.textContent='点击画板上的对象，查看坐标、方程与构造关系。';return;}
      box.replaceChildren();const heading=document.createElement('strong');heading.textContent=title(selected);box.append(heading);
      const object=engine.getObject(selected),p=document.createElement('p');p.dataset.liveEquation='';p.textContent=engine.invalidReason(selected)||describe(engine.resolve(selected),object);box.append(p);
      if(object?.refs){const refs=document.createElement('p');refs.className='help';refs.textContent='依赖：'+object.refs.map(title).join('、')+'。拖动源点会自动重算。';box.append(refs);}
      if(object){
        if(api.editableConic?.(object)){const edit=document.createElement('button');edit.className='button secondary';edit.textContent='编辑曲线参数';edit.onclick=()=>api.editConic(object.id);box.append(edit);}
        if(object.op==='line_angle'){
          const field=document.createElement('label');field.textContent='倾斜角（度，可填分数或 π）';
          const angle=document.createElement('input');angle.id='nativeLineAngle';angle.type='text';angle.inputMode='decimal';angle.value=fmt(object.angle);angle.setAttribute('aria-label','过点直线倾斜角');
          const apply=document.createElement('button');apply.textContent='应用角度';apply.className='button secondary';
          apply.onclick=()=>{try{const value=window.DongEquationBuilder.scalar(angle.value);api.transaction(()=>object.angle=((value%180)+180)%180);hint(`直线始终经过 ${title(object.refs[0])}；拖动直线可旋转。`);}catch(error){hint(error.message);}};
          const keyboard=document.createElement('button');keyboard.textContent='数学键盘';keyboard.dataset.openMathKeyboard='';keyboard.dataset.mathTarget='#nativeLineAngle';keyboard.dataset.mathScope='#nativeInspector';
          field.append(angle);box.append(field,apply,keyboard);
        }
        const rename=document.createElement('input');rename.setAttribute('aria-label','对象名称');rename.value=object.label||'';rename.maxLength=24;rename.title='修改名称，不改变构造关系';
        rename.onchange=()=>{const name=rename.value.trim(),old=object.label;if(!name){rename.value=old;return;}if(engine.objects().some(o=>o.id!==object.id&&o.label===name)||api.features().some(p=>p.name===name)){hint('该名称已被使用，请换一个名称。');rename.value=old;return;}api.transaction(()=>{object.label=name;for(const line of engine.objects())if(line.kind==='through_points'){if(line.a===old)line.a=name;if(line.b===old)line.b=name;}});};box.append(rename);
        const row=document.createElement('div');row.className='native-inspector-actions';
        const toggle=document.createElement('button');toggle.textContent=object.visible===false?'显示对象':'隐藏对象';toggle.onclick=()=>{api.transaction(()=>object.visible=object.visible===false);inspector();};
        const remove=document.createElement('button'),count=engine.descendants(selected).size;remove.textContent=count>1?`删除及关联 (${count})`:'删除对象';remove.onclick=()=>removeObject(selected);row.append(toggle,remove);box.append(row);
        const bind=document.createElement('select');bind.setAttribute('aria-label','构造所属小问');const all=document.createElement('option');all.value='';all.textContent='所有小问显示';bind.append(all);
        for(const part of state.solution?.parts||[]){if(!part.index)continue;const option=document.createElement('option');option.value=part.index;option.textContent=part.label||`第 ${part.index} 问`;bind.append(option);}
        if(object.part!=null&&!Array.from(bind.options).some(o=>Number(o.value)===Number(object.part))){const option=document.createElement('option');option.value=object.part;option.textContent=`第 ${object.part} 问`;bind.append(option);}
        bind.value=object.part??'';bind.onchange=()=>api.transaction(()=>{if(bind.value==='')delete object.part;else object.part=Number(bind.value);});box.append(bind);
      }
    }
    function resetPending(){pending=[];staged=[];hover=null;pointer=null;snapPreview=null;}
    function setTool(value){
      resetPending();if(value)api.ensureScene();tool=value;engine.ensureIds();
      document.querySelectorAll('[data-construct]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.construct===tool)));
      if(tool){$('moveMode').setAttribute('aria-pressed','false');$('panMode').setAttribute('aria-pressed','false');hint(instruction());}
      api.render();
    }
    function instruction(){
      if(['tangent','normal'].includes(tool))return pending.length?`已选 ${title(pending[0])}。再点曲线上的位置或已有点，创建${titles[tool]}；拖动该点可联动。`:`先点击要作${titles[tool]}的圆或圆锥曲线，再选曲线上的点。`;
      if(tool==='line_angle')return pending.length?'定点已锁定。点击确定方向；靠近水平、竖直或 45° 时自动吸附。':'先点击要经过的定点；靠近已有点会吸附，空白处可以新建定点。';
      if(tool==='point')return '靠近点、交点或曲线时显示吸附提示；在曲线上建点后，点会跟随该曲线。';
      if(tool==='intersection')return pending.length?'再选择另一条直线、圆或圆锥曲线。':'依次点击两个图形求交点。支持线线、线圆、圆圆、直线与任意已添加圆锥曲线。';
      if(['parallel','perpendicular','foot'].includes(tool))return pending.length?'再点击一条作为参照的直线。':'先选一个点（也可点击空白处新建），再选参照直线。';
      return pending.length?(tool==='circle'?'再选择圆周上的点，或点击空白处。':'再选择第二个点，或点击空白处。'):(tool==='circle'?'先选择圆心，或点击空白处创建圆心。':'依次选择两个点；空白处会自动创建点。');
    }
    function curveTarget(screen,id){
      const shape=engine.resolve(id),existing=pointAt(screen,18);
      if(existing)return curveLine(existing,shape)?{point:existing,ref:existing.id}:{error:`点 ${title(existing.id)} 不在所选曲线上。`};
      const parameter=engine.project(id,api.world(screen)),point=parameter&&engine.pointOn(id,parameter);
      return point&&distance(xy(point.x,point.y),screen)<=18?{point,parameter}:{error:'请在已选曲线上点击，不要在曲线外建立假的切点。'};
    }
    function pickPoint(screen){
      const candidate=pointSnap(screen);snapPreview=candidate;if(candidate?.ref)return candidate.ref;
      let obj;if(candidate?.op){obj={id:uid(),kind:'construction',op:candidate.op,refs:candidate.refs,label:label('P'),visible:true};if(candidate.op==='point_on'){obj.t=candidate.t;if(candidate.branch!=null)obj.branch=candidate.branch;}else obj.branch=candidate.branch;}
      else{let p=api.snap(api.world(screen));if(pending.length===1&&['line','segment','ray'].includes(tool)){const origin=pendingPoint(pending[0]);if(finitePoint(origin))p=directionPoint(origin,p);}obj={id:uid(),kind:'point',label:label('P'),...p,visible:true};}
      staged.push(obj);return obj.id;
    }
    function pendingPoint(id){const obj=staged.find(o=>o.id===id);if(!obj)return engine.resolve(id);if(obj.kind==='point')return obj;if(obj.op==='point_on')return engine.pointOn(obj.refs[0],obj);if(obj.op==='intersection')return intersect(engine.resolve(obj.refs[0]),engine.resolve(obj.refs[1]))[obj.branch||0];return null;}
    function commit(objects){
      api.transaction(()=>{for(const obj of [...staged,...objects]){if(state.activePart!=null)obj.part=state.activePart;obj.source='user';state.model.objects.push(obj);}});
      if(objects.length)select(objects[0].id);resetPending();hint(`已在本地画板创建${titles[tool]}。按 Esc 或点“选择 / 拖动”可移动源点；可继续作图。`);api.render();
    }
    function click(screen){
      if(!tool)return;
      if(['tangent','normal'].includes(tool)){
        if(!pending.length){const curve=shapeAt(screen,[],false,true);if(!curve){hint('请先点击圆、椭圆、双曲线或抛物线。');return;}pending.push(curve.id);hover=null;hint(instruction());api.render();return;}
        const curveId=pending[0],candidate=curveTarget(screen,curveId);if(candidate.error){hint(candidate.error);return;}let ref=candidate.ref;
        if(!ref){
          const obj={id:uid(),kind:'construction',op:'point_on',refs:[curveId],...candidate.parameter,label:label('T'),visible:true};staged.push(obj);ref=obj.id;
        }
        const op=tool;commit([{id:uid(),kind:'construction',op,refs:[ref,curveId],label:label(op==='tangent'?'切线':'法线'),visible:true}]);return;
      }
      if(tool==='point'){
        const id=pickPoint(screen),obj=staged.find(item=>item.id===id);
        if(!obj){select(id);hint(`已选中点 ${title(id)}，没有重复建立重合点。`);api.render();return;}
        staged=staged.filter(item=>item.id!==id);commit([obj]);return;
      }
      if(tool==='line_angle'&&pending.length){
        const origin=pendingPoint(pending[0]);
        if(!finitePoint(origin)){resetPending();hint('定点当前未定义，请重新选择。');return;}
        const candidate=pointSnap(screen),end=candidate?.point||directionPoint(origin,api.snap(api.world(screen)));
        if(distance(origin,end)<EPS){hint('方向点不能与定点重合，请在离定点较远处点击。');return;}
        const angle=((Math.atan2(end.y-origin.y,end.x-origin.x)*180/Math.PI)%180+180)%180;
        commit([{id:uid(),kind:'construction',op:'line_angle',refs:[pending[0]],angle,label:label('ℓ'),visible:true}]);return;
      }
      if(tool==='intersection'){
        const found=shapeAt(screen,pending);if(!found){hint('请点在图形线上。');return;}pending.push(found.id);
        if(pending.length===2){const a=engine.resolve(pending[0]),b=engine.resolve(pending[1]);
          if(!(a?.type==='line'||b?.type==='line'||a?.type==='circle'&&b?.type==='circle')){pending.pop();hint('这组曲线求交尚不支持，请选择直线与曲线或两个圆。');return;}
          if(!intersect(a,b).length){pending.pop();hint('这两个对象当前没有唯一的实交点。请调整图形后重试。');return;}
          const result=[],count=a.type==='line'&&b.type==='line'?1:2;for(let i=0;i<count;i++){const obj={id:uid(),kind:'construction',op:'intersection',refs:[...pending],branch:i,label:label('I'),visible:true};staged.push(obj);result.push(obj);}
          // Staged labels reserve unique names; append each object exactly once.
          staged=staged.filter(o=>!result.includes(o));commit(result);
        }else hint(instruction());api.render();return;
      }
      if(['parallel','perpendicular','foot'].includes(tool)&&pending.length){
        const line=shapeAt(screen,[],true);if(!line){hint('请点击参照直线；不要点击圆。');return;}pending.push(line.id);
      }else pending.push(pickPoint(screen));
      if(pending.length<2){hint(instruction());api.render();return;}
      const a=pendingPoint(pending[0]),b=pendingPoint(pending[1]);
      if(!['parallel','perpendicular','foot'].includes(tool)&&(pending[0]===pending[1]||!a||!b||distance(a,b)<EPS)){pending.pop();if(staged.length&&staged.at(-1).id!==pending[0])staged.pop();hint('两个点不能重合，请选择另一点。');return;}
      const prefix={line:'ℓ',segment:'s',ray:'r',circle:'c',midpoint:'M',parallel:'ℓ',perpendicular:'ℓ',foot:'H',distance:'d'}[tool];
      commit([{id:uid(),kind:'construction',op:tool,refs:[...pending],label:label(prefix),visible:true}]);
    }
    function draw(){
      if(!state.model)return;engine.ensureIds();
      const invalid=engine.objects().filter(obj=>(obj.kind==='construction'||linkedCurveLine(obj))&&api.visible(obj)&&!engine.resolve(obj.id)).map(obj=>(obj.label||'未命名')+'：'+engine.invalidReason(obj.id));
      for(const obj of state.model.objects||[]){if(obj.kind!=='construction'||!api.visible(obj))continue;const shape=engine.resolve(obj.id);if(!shape)continue;
        const color=selected===obj.id?'#f09819':'#7060b7';
        if(shape.type==='point'){api.point(shape,color,obj.label);const s=xy(shape.x,shape.y);ctx.save();ctx.strokeStyle=color;ctx.strokeRect(s.x-6,s.y-6,12,12);ctx.restore();}
        else if(shape.type==='line'){const ends=api.clip(shape);if(ends){api.path([ends.a,ends.b],color,2.2);api.annotation(obj.label,ends.b,color);}}
        else if(shape.type==='circle'){api.path(Array.from({length:181},(_,i)=>({x:shape.x+shape.r*Math.cos(i*Math.PI/90),y:shape.y+shape.r*Math.sin(i*Math.PI/90)})),color,2.2);api.annotation(obj.label,{x:shape.x+shape.r,y:shape.y},color);}
        else if(shape.type==='measure')api.annotation(obj.label+' = '+fmt(shape.value),shape,'#886012');
      }
      for(const obj of staged)if(obj.kind==='point')api.point(obj,'#f09819',obj.label);
      if(['tangent','normal'].includes(tool)&&pending.length===1&&finitePoint(hover)){const line=curveLine(hover,engine.resolve(pending[0]),tool==='normal'),ends=line&&api.clip(line);if(ends){ctx.save();ctx.setLineDash([5,5]);api.path([ends.a,ends.b],'#f09819',1.6);ctx.restore();}}
      for(const id of pending){const p=pendingPoint(id);if(finitePoint(p)){const s=xy(p.x,p.y);ctx.save();ctx.beginPath();ctx.arc(s.x,s.y,10,0,Math.PI*2);ctx.strokeStyle='#f09819';ctx.lineWidth=2;ctx.stroke();ctx.restore();}}
      if(pending.length===1&&hover){const a=pendingPoint(pending[0]);if(finitePoint(a)){ctx.save();ctx.setLineDash([5,5]);if(tool==='circle'){const r=distance(a,hover);api.path(Array.from({length:91},(_,i)=>({x:a.x+r*Math.cos(i*Math.PI/45),y:a.y+r*Math.sin(i*Math.PI/45)})),'#f09819',1.4);}else if(['line','line_angle','segment','ray','midpoint','distance'].includes(tool)){const shape={type:'line',o:a,d:sub(hover,a),segment:tool!=='line'&&tool!=='line_angle'},ends=api.clip(shape);if(ends)api.path([ends.a,ends.b],'#f09819',1.4);}ctx.restore();}}
      if(snapPreview&&finitePoint(snapPreview.point)){const s=xy(snapPreview.point.x,snapPreview.point.y);ctx.save();ctx.strokeStyle='#087f80';ctx.lineWidth=2;ctx.beginPath();ctx.arc(s.x,s.y,10,0,Math.PI*2);ctx.stroke();ctx.restore();api.annotation(snapPreview.label,snapPreview.point,'#087f80');}
      if($('snapStatus'))$('snapStatus').textContent=snapPreview?.label||'';
      $('undefinedObjects').textContent=invalid.length?'暂未定义：'+invalid.join('；')+'。恢复条件后会自动出现。':'';
      if(selected&&!$('nativeInspector').contains(document.activeElement))inspector();
    }
    function hit(screen,touch){
      const threshold=touch?22:13;
      const point=pointAt(screen,threshold),obj=point&&engine.getObject(point.id);
      if(obj?.kind==='construction')return {type:'native',id:obj.id,label:obj.label};
      const line=shapeAt(screen),object=line&&engine.getObject(line.id);if(object&&(object.kind==='construction'||linkedCurveLine(object)||['circle','conic'].includes(object.kind)))return {type:'native',id:line.id,label:title(line.id)};
      return null;
    }
    function begin(target){
      select(target.id);const obj=engine.getObject(target.id);
      if(['circle','conic'].includes(obj.kind)){hint('已选中曲线。双击可编辑参数；拖动蓝色中心或半轴手柄可调整形状。');return false;}
      if(obj.op==='line_angle')return true;
      if(obj.op==='point_on')return true;
      const refs=['line','segment','ray','circle'].includes(obj.op)?obj.refs:['parallel','perpendicular'].includes(obj.op)?[obj.refs[0]]:[];
      const free=refs.map(ref=>engine.freePoint(ref));
      if(!free.length||free.some(p=>!p)){hint('这个对象由构造关系决定，不能独立拖动。请拖动它依赖的源点；依赖关系已显示在右侧。');return false;}
      target.free=free;target.starts=free.map(p=>p.get());return true;
    }
    function move(target,p,dx,dy){const obj=engine.getObject(target.id);if(obj.op==='line_angle'){const origin=engine.resolve(obj.refs[0]);if(origin&&distance(origin,p)>EPS){snapPreview=null;const end=directionPoint(origin,p);obj.angle=((Math.atan2(end.y-origin.y,end.x-origin.x)*180/Math.PI)%180+180)%180;}}else if(obj.op==='point_on'){const v=engine.project(obj.refs[0],p);if(v)Object.assign(obj,v);}else target.free?.forEach((ref,i)=>ref.set(api.snap({x:target.starts[i].x+dx,y:target.starts[i].y+dy})));}
    function removeObject(id){
      if(!engine.getObject(id))return;const removed=engine.descendants(id);
      api.transaction(()=>{state.model.objects=state.model.objects.filter(o=>!removed.has(o.id));state.model.lines=state.model.lines.filter(o=>!removed.has(o.id));});
      if(removed.has(selected))select(null);hint(`已删除 ${removed.size} 个对象（含关联构造）；点击撤销可恢复。`);
    }
    function fromEvent(e){const box=canvas.getBoundingClientRect();return {x:e.clientX-box.left,y:e.clientY-box.top};}
    canvas.addEventListener('dblclick',e=>{if(tool)return;const found=shapeAt(fromEvent(e),[],false,true),object=found&&engine.getObject(found.id);if(api.editableConic?.(object)){e.preventDefault();api.editConic(object.id);}});
    canvas.addEventListener('pointerdown',e=>{if(!tool||e.button>0)return;e.stopImmediatePropagation();e.preventDefault();pointer={id:e.pointerId,start:fromEvent(e)};canvas.setPointerCapture(e.pointerId);},{capture:true});
    canvas.addEventListener('pointermove',e=>{if(!tool)return;e.stopImmediatePropagation();const screen=fromEvent(e);if(['tangent','normal'].includes(tool)&&pending.length){const target=curveTarget(screen,pending[0]);hover=target.point||null;snapPreview=hover?{point:hover,label:titles[tool]+'预览 · '+title(pending[0])}:null;}else{snapPreview=pointSnap(screen);hover=snapPreview?.point||api.snap(api.world(screen));if(!snapPreview&&pending.length===1&&['line','line_angle','segment','ray'].includes(tool)){const origin=pendingPoint(pending[0]);if(finitePoint(origin))hover=directionPoint(origin,hover);}}api.render();},{capture:true});
    canvas.addEventListener('pointerleave',()=>{snapPreview=null;if($('snapStatus'))$('snapStatus').textContent='';api.render();});
    canvas.addEventListener('pointerup',e=>{if(!tool)return;e.stopImmediatePropagation();e.preventDefault();if(pointer?.id===e.pointerId&&distance(pointer.start,fromEvent(e))<18)click(fromEvent(e));if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);pointer=null;},{capture:true});
    canvas.addEventListener('pointercancel',e=>{if(!tool)return;e.stopImmediatePropagation();pointer=null;},{capture:true});
    document.querySelectorAll('[data-construct]').forEach(button=>button.addEventListener('click',()=>setTool(button.dataset.construct)));
    $('moveMode').addEventListener('click',()=>setTool(null));$('panMode').addEventListener('click',()=>setTool(null));
    $('undoDrag').addEventListener('click',()=>{resetPending();select(null);});$('redoDrag').addEventListener('click',()=>{resetPending();select(null);});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!document.querySelector('dialog[open]')){setTool(null);$('moveMode').click();}if((e.ctrlKey||e.metaKey)&&['z','y'].includes(e.key.toLowerCase()))resetPending();});
    inspector();
    return {engine,draw,hit,begin,move,active:()=>!!tool,select,remove:removeObject,description:id=>describe(engine.resolve(id)),reset(){resetPending();tool=null;selected=null;document.querySelectorAll('[data-construct]').forEach(b=>b.setAttribute('aria-pressed','false'));inspector();}};
  }
  window.DongConstruct={createEngine,intersect,conicShape,attach};
})();
