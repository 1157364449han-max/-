// Shared geometry whitelist: cloud and clipboard use exactly the same data-only validation.
const finite = n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 100000;
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
const name = s => typeof s === 'string' && !forbidden.has(s) && /^[A-Za-z][A-Za-z0-9_₀₁₂₃′']{0,12}$/.test(s);
const id = s => typeof s === 'string' && !forbidden.has(s) && /^[A-Za-z][A-Za-z0-9_-]{0,47}$/.test(s);
const text = (s, max=6000) => typeof s === 'string' ? s.slice(0,max) : '';
const arity = {line:2, segment:2, ray:2, midpoint:2, reflect_center:2, parallel:2, perpendicular:2, foot:2, tangent:2, normal:2, ellipse_tangent_point:2, intersection:2, circle:2, point_on:1, line_angle:1, reflect_axis:1, distance:2};


const trim=text;
const label=name;
export function sceneScope(item) {
  if (!item || typeof item !== 'object') return {};
  const valid=n=>Number.isInteger(n)&&n>=0&&n<10000;
  if (item.part!=null && valid(item.part)) return {part:item.part};
  if (Array.isArray(item.parts)) {
    const parts=[...new Set(item.parts.filter(valid))].slice(0,12);
    if (parts.length) return {parts};
  }
  return {};
}
const scope=n=>sceneScope({part:n});
export function safeBaseScene(raw) {
  if (!raw || !['ellipse','hyperbola','circle','parabola'].includes(raw.type)) return null;
  const scene={type:raw.type,dynamicLine:raw.dynamicLine===true,showDynamic:raw.dynamicLine===true,points:{},lines:[],objects:[],orientation:raw.orientation==='vertical'?'vertical':'horizontal',direction:raw.direction===-1?-1:1};
  for (const [key,fallback] of [['h',0],['k',0],['theta',42]]) { const value=raw[key]??fallback; if(!finite(value))return null;scene[key]=value; }
  for (const key of {ellipse:['a','b'],hyperbola:['a','b'],circle:['r'],parabola:['p']}[raw.type]) {if(!finite(raw[key])||raw[key]<=0)return null;scene[key]=raw[key];}
  if(raw.type==='ellipse'&&scene.a<=scene.b)return null;
  scene.dynamicIntersectionLabels=Array.isArray(raw.dynamicIntersectionLabels)&&raw.dynamicIntersectionLabels.length===2&&raw.dynamicIntersectionLabels.every(label)&&raw.dynamicIntersectionLabels[0]!==raw.dynamicIntersectionLabels[1]?raw.dynamicIntersectionLabels.slice():['A','B'];
  scene.lineThrough=/^(center|focus1|focus2|vertex|point:[A-Za-z][A-Za-z0-9_]*)$/.test(raw.lineThrough)?raw.lineThrough:'center';
  for(const [name,coords] of Object.entries(raw.points||{}).slice(0,50))if(label(name)&&Array.isArray(coords)&&coords.length===2&&coords.every(finite)&&!(scene.dynamicLine&&scene.dynamicIntersectionLabels.includes(name)))scene.points[name]=coords;
  const moving=new Map();
  for(const point of (Array.isArray(raw.curvePoints)?raw.curvePoints:[]).slice(0,12))if(point&&label(point.name)&&!moving.has(point.name)){
    const id='ai-point-'+point.name;moving.set(point.name,id);delete scene.points[point.name];
    scene.objects.push({id,kind:'construction',op:'point_on',refs:['$conic'],t:.9,label:point.name,visible:true,...sceneScope(point)});
  }
  const known=name=>Object.hasOwn(scene.points,name)||moving.has(name)||(scene.dynamicLine&&scene.dynamicIntersectionLabels.includes(name));
  for(const line of (Array.isArray(raw.lines)?raw.lines:[]).slice(0,50)){
    if(!line||typeof line!=='object')continue;
    const common={label:trim(line.label,40)||'直线',...sceneScope(line)};
    if(line.kind==='slope'&&finite(line.m)&&finite(line.b))scene.lines.push({...common,kind:'slope',m:line.m,b:line.b});
    else if(line.kind==='vertical'&&finite(line.x))scene.lines.push({...common,kind:'vertical',x:line.x});
    else if(line.kind==='through_points'&&known(line.a)&&known(line.b)&&line.a!==line.b){
      if(moving.has(line.a)||moving.has(line.b))scene.objects.push({id:'ai-line-'+scene.objects.length,kind:'construction',op:line.infinite===false?'segment':'line',refs:[moving.get(line.a)||'feature:'+line.a,moving.get(line.b)||'feature:'+line.b],...common,visible:true});
      else scene.lines.push({...common,kind:'through_points',a:line.a,b:line.b,infinite:line.infinite!==false});
    }
  }
  return scene;
}

export function safeConstructionScene(raw, {partIndexes}={}) {
  const warnings=[];
  if(raw==null)return {scene:null,warnings:['回复未提供结构化图形；可复制补充作图请求。'],valid:false};
  const scene=safeBaseScene({...raw,points:{},curvePoints:[],lines:[]});
  if(!scene)return {scene:null,warnings:['主曲线类型或参数无效，本次不替换画板。'],valid:false};
  let valid=true;
  const warn=message=>{warnings.push(message);valid=false;};
  if(raw.dynamicLine!=null&&typeof raw.dynamicLine!=='boolean')warn('dynamicLine 必须为布尔值。');
  if(raw.orientation!=null&&!['horizontal','vertical'].includes(raw.orientation))warn('主曲线方向无效。');
  if(raw.direction!=null&&![1,-1].includes(raw.direction))warn('抛物线开口符号必须为 1 或 -1。');
  if(raw.dynamicIntersectionLabels!=null&&(!Array.isArray(raw.dynamicIntersectionLabels)||raw.dynamicIntersectionLabels.length!==2||!raw.dynamicIntersectionLabels.every(name)||raw.dynamicIntersectionLabels[0]===raw.dynamicIntersectionLabels[1]))warn('动态交点名称无效或重复。');
  if(raw.lineThrough!=null&&!(typeof raw.lineThrough==='string'&&(['center','focus1','focus2','vertex'].includes(raw.lineThrough)||raw.lineThrough.startsWith('point:')&&name(raw.lineThrough.slice(6)))))warn('动直线经过的定点格式无效。');
  else if(raw.lineThrough!=null)scene.lineThrough=raw.lineThrough;
  for(const key of {ellipse:['a','b'],hyperbola:['a','b'],circle:['r'],parabola:['p']}[scene.type]){
    const value=scene[key];
    if(!Number.isFinite(1/value)||!Number.isFinite(1/(value*value)))warn('主曲线参数 '+key+' 太小，无法可靠计算图形。');
  }
  const scope=item=>{
    if(item.part!=null&&(!Number.isInteger(item.part)||item.part<0||item.part>=10000||partIndexes&&!partIndexes.has(item.part)))warn('图形对象的小问编号无效。');
    if(item.parts!=null&&(!Array.isArray(item.parts)||!item.parts.length||item.parts.length>12||item.parts.some(n=>!Number.isInteger(n)||n<0||n>=10000||partIndexes&&!partIndexes.has(n))))warn('图形对象的共用小问编号无效。');
    if(item.visible!=null&&typeof item.visible!=='boolean')warn('图形对象的显示状态必须为布尔值。');
    return sceneScope(item);
  };
  const labels=new Set(scene.dynamicLine?scene.dynamicIntersectionLabels:[]), ids=new Set(), nodes=[];
  const pointOps=new Set(['point_on','midpoint','reflect_center','reflect_axis','foot','ellipse_tangent_point','intersection']);
  const reserve=(node)=>{
    if(!id(node.id)||ids.has(node.id)){warn('对象标识无效或重复：'+text(node.id,48));return false;}
    ids.add(node.id);return true;
  };
  if(raw.points&&(!Array.isArray(raw.points)&&typeof raw.points==='object')){
    if(Object.keys(raw.points).length>50)warn('固定点超过 50 个。');
    for(const [key,p] of Object.entries(raw.points).slice(0,50)){
      if(!name(key)||!Array.isArray(p)||p.length!==2||!p.every(finite)){warn('点 '+text(key,40)+' 的名称或坐标无效。');continue;}
      if(scene.dynamicLine&&scene.dynamicIntersectionLabels.includes(key)){warn('动线交点 '+key+' 不应导入为固定坐标。');continue;}
      scene.points[key]=p.slice();labels.add(key);
    }
  }else if(raw.points!=null)warn('points 必须是点名到坐标的对象。');
  if(raw.curvePoints!=null&&!Array.isArray(raw.curvePoints))warn('curvePoints 必须为数组。');
  if(Array.isArray(raw.curvePoints)&&raw.curvePoints.length>12)warn('曲线上动点超过 12 个。');
  if(Array.isArray(raw.curvePoints))for(const [i,p] of raw.curvePoints.slice(0,12).entries()){
    if(!p||!name(p.name)||labels.has(p.name)){warn('曲线上动点名称无效或重复。');continue;}
    if(p.t!=null&&!finite(p.t)){warn('曲线上点的 t 参数无效。');continue;}
    labels.add(p.name);const node={id:'external-moving-'+i,kind:'construction',op:'point_on',refs:['$conic'],t:p.t??.9,label:p.name,visible:p.visible!==false,...scope(p)};
    reserve(node);nodes.push(node);
  }
  const moving = new Map(nodes.map(n=>[n.label,n.id]));
  const known = key => Object.hasOwn(scene.points,key)||moving.has(key)||(scene.dynamicLine&&scene.dynamicIntersectionLabels.includes(key));
  if(scene.dynamicLine&&scene.lineThrough.startsWith('point:')&&!Object.hasOwn(scene.points,scene.lineThrough.slice(6)))warn('动直线经过的定点未提供固定坐标。');
  if(raw.lines!=null&&!Array.isArray(raw.lines))warn('lines 必须为数组。');
  if(Array.isArray(raw.lines)&&raw.lines.length>50)warn('直线超过 50 条。');
  for(const [i,line] of (Array.isArray(raw.lines)?raw.lines:[]).slice(0,50).entries()){
    if(!line||typeof line!=='object'){warn('直线数据无效。');continue;}
    const clean={id:line.id??'external-line-'+i,label:text(line.label,40)||'直线',visible:line.visible!==false,...scope(line)};
    if(line.kind==='slope'&&finite(line.m)&&finite(line.b))Object.assign(clean,{kind:'slope',m:line.m,b:line.b});
    else if(line.kind==='vertical'&&finite(line.x))Object.assign(clean,{kind:'vertical',x:line.x});
    else if(line.kind==='through_points'&&known(line.a)&&known(line.b)&&line.a!==line.b){
      Object.assign(clean,{kind:'construction',op:line.infinite===false?'segment':'line',refs:[moving.get(line.a)||'feature:'+line.a,moving.get(line.b)||'feature:'+line.b]});
    }else{warn('直线 '+clean.label+' 缺少有效参数或引用点。');continue;}
    if(reserve(clean)){if(clean.kind==='construction')nodes.push(clean);else scene.lines.push(clean);}
  }
  if(raw.constructions!=null&&!Array.isArray(raw.constructions))warn('constructions 必须为数组。');
  if(Array.isArray(raw.constructions)&&raw.constructions.length>60)warn('关联构造超过 60 个。');
  for(const c of (Array.isArray(raw.constructions)?raw.constructions:[]).slice(0,60)){
    if(!c||!Object.hasOwn(arity,c.op)||!Array.isArray(c.refs)||c.refs.length!==arity[c.op]||c.refs.some(ref=>typeof ref!=='string'||ref.length>70)){
      warn('存在不支持的构造，已拒绝：'+text(c?.op,40));continue;
    }
    const node={id:c.id,kind:'construction',op:c.op,refs:c.refs.slice(),label:text(c.label,40)||c.id,visible:c.visible!==false,...scope(c)};
    if(c.op==='point_on'){if(!finite(c.t)||c.branch!=null&&![1,-1].includes(c.branch)){warn('曲线上点缺少有效 t 参数或分支。');continue;}node.t=c.t;node.branch=c.branch===-1?-1:1;}
    if(c.op==='line_angle'){if(!finite(c.angle)){warn('过点直线缺少角度。');continue;}node.angle=c.angle;}
    if(c.op==='reflect_axis'){if(!['x','y'].includes(c.axis)||!finite(c.axisValue??0)){warn('对称轴参数无效。');continue;}node.axis=c.axis;node.axisValue=c.axisValue??0;}
    if(['intersection','ellipse_tangent_point'].includes(c.op)){if(![0,1].includes(c.branch??0)){warn('交点分支必须为 0 或 1。');continue;}node.branch=c.branch??0;}
    if(pointOps.has(c.op)&&labels.has(node.label)){warn('点名重复：'+node.label+'，请为不同点使用不同名称。');continue;}
    if(reserve(node)){nodes.push(node);if(pointOps.has(c.op))labels.add(node.label);}
  }
  if(raw.objects!=null)warn('objects 不是外部回复允许的字段，请用 constructions 描述关联构造。');
  const refKnown=ref=>ids.has(ref)||ref==='$conic'||ref==='$dynamic'&&scene.dynamicLine||ref.startsWith('feature:')&&known(ref.slice(8));
  for(const node of nodes)for(const ref of node.refs)if(!refKnown(ref))warn(node.label+' 引用了不存在的对象：'+ref);
  // Checking existence alone permits e.g. midpoint([$conic,$conic]) and a
  // tangent to a point. Such data cannot be interpreted as a valid graph.
  const allById=new Map([...scene.lines,...nodes].map(n=>[n.id,n]));
  const refType=ref=>ref==='$conic'?'curve':ref==='$dynamic'?'line':ref.startsWith('feature:')&&known(ref.slice(8))?'point':pointOps.has(allById.get(ref)?.op)?'point':allById.get(ref)?.op==='circle'?'curve':allById.get(ref)?.op==='distance'?'measure':allById.has(ref)?'line':null;
  const signatures={line:['point','point'],segment:['point','point'],ray:['point','point'],midpoint:['point','point'],reflect_center:['point','point'],circle:['point','point'],distance:['point','point'],reflect_axis:['point'],line_angle:['point'],parallel:['point','line'],perpendicular:['point','line'],foot:['point','line'],tangent:['point','curve'],normal:['point','curve'],ellipse_tangent_point:['point','curve'],intersection:['shape','shape'],point_on:['shape']};
  for(const node of nodes)node.refs.forEach((ref,index)=>{
    const actual=refType(ref),expected=signatures[node.op]?.[index];
    if(actual&&expected&&(expected==='shape'?!['curve','line'].includes(actual):expected!==actual))warn(node.label+' 的引用对象类型不符合 '+node.op+' 构造。');
  });
  const byId=new Map(nodes.map(n=>[n.id,n])),done=new Set(),active=new Set();
  const visit=key=>{if(active.has(key)){warn('构造存在循环依赖：'+key);return;}if(done.has(key))return;active.add(key);for(const ref of byId.get(key)?.refs||[])if(byId.has(ref))visit(ref);active.delete(key);done.add(key);};
  for(const key of byId.keys())visit(key);
  scene.objects=nodes;scene.provenance={validatedConstructions:true};
  if(!scene.dynamicLine)scene.showDynamic=false;
  return {scene,warnings:[...new Set(warnings)],valid};
}
