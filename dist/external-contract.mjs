/* Offline, data-only import of replies from a user's own AI. No inference or fetch. */
import {SOLVE_SYSTEM, assemble, safeScene, splitParts} from './cloud-contract.mjs';

export const SCHEMA = 'dongjiexi-external-v1';
export const MAX_REPLY = 150000;
const finite = n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 100000;
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
const name = s => typeof s === 'string' && !forbidden.has(s) && /^[A-Za-z][A-Za-z0-9_₀₁₂₃′']{0,12}$/.test(s);
const id = s => typeof s === 'string' && !forbidden.has(s) && /^[A-Za-z][A-Za-z0-9_-]{0,47}$/.test(s);
const text = (s, max=6000) => typeof s === 'string' ? s.slice(0,max) : '';
const arity = {line:2, segment:2, ray:2, midpoint:2, reflect_center:2, parallel:2, perpendicular:2, foot:2, tangent:2, normal:2, ellipse_tangent_point:2, intersection:2, circle:2, point_on:1, line_angle:1, reflect_axis:1, distance:2};

export function makeRequest(question, requestId) {
  question = String(question || '').trim();
  if (!question || question.length > 18000) throw new Error('请先输入完整题目，长度不超过 18000 字。');
  if (!id(requestId)) throw new Error('请求标识无效，请重新生成。');
  const parts = splitParts(question);
  const request = {schema:SCHEMA, requestId, question, parts};
  const example = {schema:SCHEMA, requestId, title:'题目解析', parts:parts.map(p=>({index:p.index,answer:'本问结论，公式用 $LaTeX$',steps:['实际推导步骤'],status:'answered'})),scene:null};
  request.prompt = `请解答下面这道高中数学题，并为董解析提供可交互作图数据。这不是让你访问网站或执行程序。\n\n原题（保持全部条件与小问）：\n${question}\n\n输出要求：\n${SOLVE_SYSTEM}\n\n本次请求标识：${requestId}\n顶层必须包含 schema="${SCHEMA}" 和 requestId="${requestId}"。小问编号为 ${JSON.stringify(parts.map(p=>({index:p.index,label:p.label})))}。\n请返回一个完整的 JSON 代码块；可在代码块前另附可读讲解，但不能遗漏 JSON 中的证明与计算。反斜杠须遵守 JSON 转义，不要输出可运行代码。\n\n补充动态构造协议：scene 可增加 constructions 数组。每项为 {id:"唯一英文标识",op:"允许的构造",refs:[引用],label:"对象名称",part:小问编号}。引用是其他构造或直线的 id、"feature:点名"、"$conic"（主曲线）或 "$dynamic"（主动态直线）。固定点先放入 points；不要将曲线上动点写成固定坐标。\n允许构造与引用顺序：point_on:[曲线或直线]（增加 t 数值）；line/segment/ray/midpoint/circle/distance:[点,点]；tangent/normal/ellipse_tangent_point:[点,曲线]（外点切点增加 branch:0或1）；intersection:[线或曲线,线或曲线]（branch:0或1）；parallel/perpendicular/foot:[点,直线]；reflect_center:[点,对称中心]；reflect_axis:[点]（axis:"x"或"y",axisValue:数值）；line_angle:[点]（angle:度数）。\n直线 slope/vertical/through_points 可增加唯一 id 供构造引用。请列出答案需要的切线、中点、交点、对称点；依赖关系由画板重算。scene 中所有坐标和参数用有限数值，答案仍保留分数和根式。无法给出可靠图形时使用 scene:null，不编造坐标，不隐瞒未解答小问。\n\n顶层格式示意（请替换占位内容）：\n${JSON.stringify(example,null,2)}`;
  return request;
}

function checkKeys(value, depth=0) {
  if (depth > 24) throw new Error('回复数据嵌套过深。');
  if (!value || typeof value !== 'object') return;
  for (const key of Object.keys(value)) {
    if (forbidden.has(key)) throw new Error('回复含禁止的对象字段，未执行或导入。');
    checkKeys(value[key],depth+1);
  }
}

/* Reject damaged data rather than repairing quotes/LaTeX and changing meaning. */
function extractReply(source) {
  source=String(source||'').trim();
  if (!source) throw new Error('请粘贴 AI 的完整回复。');
  if (source.length>MAX_REPLY) throw new Error('回复超过 150000 字，请分题导入。');
  const blocks=[...source.matchAll(/```([^\n`]*)\n([\s\S]*?)```/g)];
  const candidates=[];
  for(const block of blocks)if(/^(?:json|dongjiexi)?\s*$/i.test(block[1])&&block[2].trim().startsWith('{'))candidates.push(block[2].trim());
  if(source.startsWith('{'))candidates.push(source);
  if(candidates.length>1)throw new Error('检测到多份 JSON，请只保留本题的一份完整作图回复。');
  if(candidates.length){
    let raw;try{raw=JSON.parse(candidates[0]);}catch{throw new Error('JSON 不完整或公式转义错误。请复制完整回复，或让原 AI 修正格式；原题稿未改变。');}
    checkKeys(raw);return {raw,source};
  }
  if(/```\s*(?:json|dongjiexi)\b/i.test(source))throw new Error('作图代码块未完整闭合，请复制完整回复。');
  return {raw:null,source};
}

export function safeExternalScene(raw) {
  const warnings=[];
  if(raw==null)return {scene:null,warnings:['回复未提供结构化图形；可复制补充作图请求。'],valid:false};
  const scene=safeScene({...raw,points:{},curvePoints:[],lines:[]});
  if(!scene)return {scene:null,warnings:['主曲线类型或参数无效，本次不替换画板。'],valid:false};
  let valid=true;
  const warn=message=>{warnings.push(message);valid=false;};
  const scope=n=>Number.isInteger(n)&&n>0&&n<10000?{part:n}:{};
  const labels=new Set(scene.dynamicLine?['A','B']:[]), ids=new Set(), nodes=[];
  const pointOps=new Set(['point_on','midpoint','reflect_center','reflect_axis','foot','ellipse_tangent_point','intersection']);
  const reserve=(node)=>{
    if(!id(node.id)||ids.has(node.id)){warn('对象标识无效或重复：'+text(node.id,48));return false;}
    ids.add(node.id);return true;
  };
  if(raw.points&&(!Array.isArray(raw.points)&&typeof raw.points==='object')){
    if(Object.keys(raw.points).length>50)warn('固定点超过 50 个。');
    for(const [key,p] of Object.entries(raw.points).slice(0,50)){
      if(!name(key)||!Array.isArray(p)||p.length!==2||!p.every(finite)){warn('点 '+text(key,40)+' 的名称或坐标无效。');continue;}
      if(scene.dynamicLine&&['A','B'].includes(key)){warn('动线交点 '+key+' 不应导入为固定坐标。');continue;}
      scene.points[key]=p.slice();labels.add(key);
    }
  }else if(raw.points!=null)warn('points 必须是点名到坐标的对象。');
  if(raw.curvePoints!=null&&!Array.isArray(raw.curvePoints))warn('curvePoints 必须为数组。');
  if(Array.isArray(raw.curvePoints)&&raw.curvePoints.length>12)warn('曲线上动点超过 12 个。');
  if(Array.isArray(raw.curvePoints))for(const [i,p] of raw.curvePoints.slice(0,12).entries()){
    if(!p||!name(p.name)||labels.has(p.name)){warn('曲线上动点名称无效或重复。');continue;}
    labels.add(p.name);const node={id:'external-moving-'+i,kind:'construction',op:'point_on',refs:['$conic'],t:finite(p.t)?p.t:.9,label:p.name,visible:true,...scope(p.part)};
    reserve(node);nodes.push(node);
  }
  const moving = new Map(nodes.map(n=>[n.label,n.id]));
  const known = key => Object.hasOwn(scene.points,key)||moving.has(key)||(scene.dynamicLine&&['A','B'].includes(key));
  if(raw.lines!=null&&!Array.isArray(raw.lines))warn('lines 必须为数组。');
  if(Array.isArray(raw.lines)&&raw.lines.length>50)warn('直线超过 50 条。');
  for(const [i,line] of (Array.isArray(raw.lines)?raw.lines:[]).slice(0,50).entries()){
    if(!line||typeof line!=='object'){warn('直线数据无效。');continue;}
    const clean={id:line.id??'external-line-'+i,label:text(line.label,40)||'直线',visible:true,...scope(line.part)};
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
    const node={id:c.id,kind:'construction',op:c.op,refs:c.refs.slice(),label:text(c.label,40)||c.id,visible:true,...scope(c.part)};
    if(c.op==='point_on'){if(!finite(c.t)){warn('曲线上点缺少有效 t 参数。');continue;}node.t=c.t;node.branch=c.branch===-1?-1:1;}
    if(c.op==='line_angle'){if(!finite(c.angle)){warn('过点直线缺少角度。');continue;}node.angle=c.angle;}
    if(c.op==='reflect_axis'){if(!['x','y'].includes(c.axis)||!finite(c.axisValue??0)){warn('对称轴参数无效。');continue;}node.axis=c.axis;node.axisValue=c.axisValue??0;}
    if(['intersection','ellipse_tangent_point'].includes(c.op)){if(![0,1].includes(c.branch??0)){warn('交点分支必须为 0 或 1。');continue;}node.branch=c.branch??0;}
    if(pointOps.has(c.op)&&labels.has(node.label)){warn('点名重复：'+node.label+'，请为不同点使用不同名称。');continue;}
    if(reserve(node)){nodes.push(node);if(pointOps.has(c.op))labels.add(node.label);}
  }
  if(raw.objects!=null)warn('objects 不是外部回复允许的字段，请用 constructions 描述关联构造。');
  const refKnown=ref=>ids.has(ref)||ref==='$conic'||ref==='$dynamic'&&scene.dynamicLine||ref.startsWith('feature:')&&known(ref.slice(8));
  for(const node of nodes)for(const ref of node.refs)if(!refKnown(ref))warn(node.label+' 引用了不存在的对象：'+ref);
  const byId=new Map(nodes.map(n=>[n.id,n])),done=new Set(),active=new Set();
  const visit=key=>{if(active.has(key)){warn('构造存在循环依赖：'+key);return;}if(done.has(key))return;active.add(key);for(const ref of byId.get(key)?.refs||[])if(byId.has(ref))visit(ref);active.delete(key);done.add(key);};
  for(const key of byId.keys())visit(key);
  scene.objects=nodes;scene.provenance={externalReply:true};
  if(!scene.dynamicLine)scene.showDynamic=false;
  return {scene,warnings:[...new Set(warnings)],valid};
}

export function parseReply(source, request) {
  if(!request?.question||!request.requestId)throw new Error('请先生成本题的解题请求。');
  const extracted=extractReply(source),raw=extracted.raw;
  let result,warnings=[],requiresConfirmation=false,graphValid=false;
  if(raw){
    if(raw.schema!=null&&raw.schema!==SCHEMA)throw new Error('回复格式版本不支持，请使用本次生成的请求。');
    if(raw.requestId!=null&&raw.requestId!==request.requestId)throw new Error('回复属于另一份解题请求，未导入。请核对原题。');
    if(raw.requestId==null){requiresConfirmation=true;warnings.push('回复没有请求标识，必须确认它对应当前原题。');}
    if(raw.question!=null&&String(raw.question).trim()!==request.question)throw new Error('回复中的原题与当前请求不同，未导入。');
    if(!Array.isArray(raw.parts))throw new Error('回复缺少 parts 小问数组，请让原 AI 按请求补齐。');
    const expected=new Set(request.parts.map(p=>p.index));
    for(const part of raw.parts||[])if(!expected.has(part.index))throw new Error('回复包含不属于本题的小问编号：'+part.index);
    result=assemble({...raw,scene:null},request.question,'外部 AI · 用户粘贴');
    const graph=safeExternalScene(raw.scene);result.scene=graph.scene;warnings.push(...graph.warnings);graphValid=graph.valid;
    if(result.parts.some(p=>p.status!=='answered'))warnings.push('部分小问未完整作答，不能视为全题已解决。');
  }else{
    requiresConfirmation=true;warnings.push('这是普通文字回复：保留原文和公式，不假定它已完成全部小问或包含可用作图数据。');
    result={title:'外部 AI 文字解答',restatement:request.question,parts:request.parts.map(p=>({...p,answer:'请查看下方原始回复；本问未建立结构化解答。',steps:[],status:'partial',verification:{status:'generated',verified:false}})),completion:{answered:0,total:request.parts.length},scene:null,knowns:[],assumptions:[],verification:{status:'generated',message:'普通文字回复尚未完成分问解析和数学核验。'}};
  }
  result.mode='external-ai';result.model='外部 AI · 用户粘贴';result.rawReply=extracted.source;
  result.external={schema:SCHEMA,requestId:request.requestId,plain:!raw,graphValid};
  result.verification={status:'generated',level:0,counts:{verified:0,contradicted:0,unresolved:result.parts.length},message:'外部 AI 回复仅作为数据导入。网站会复算已覆盖题型，其余推导仍需核验。'};
  result.scene_notice=graphValid?'已检查作图数据的字段和引用；几何存在性与数学结论仍需核验。':'回复没有完整有效的作图数据，本次默认只导入文字，不替换原画板。';
  return {result,warnings,requiresConfirmation,graphValid};
}

export function makeRepairRequest(request,reply,warnings) {
  return `${request.prompt}\n\n请保留下面已有解答中正确的结论，补齐每个小问及可靠的作图数据，修复格式或对象依赖，不编造答案。返回同一 requestId 的一份完整 JSON。\n待处理问题：\n${warnings.map(s=>'- '+s).join('\n')}\n\n已有回复（仅供核对）：\n${String(reply||'').slice(0,MAX_REPLY)}`;
}

/* Existence checks at the preview position, not a proof of a theorem or locus. */
export function inspectGeometry(scene, construct) {
  if(!scene||!construct)return [];
  const issues=[],h=scene.h||0,k=scene.k||0;
  const curve=scene.type==='circle'?{q:{A:1,B:0,C:1,D:-2*h,E:-2*k,F:h*h+k*k-scene.r*scene.r},pointAt:t=>({x:h+scene.r*Math.cos(t),y:k+scene.r*Math.sin(t)})}:construct.conicShape({...scene,conicType:scene.type});
  const features=Object.entries(scene.points).map(([name,p])=>({name,x:p[0],y:p[1]}));
  let origin={x:h,y:k};
  if(scene.lineThrough.startsWith('point:')){const p=scene.points[scene.lineThrough.slice(6)];if(!p)issues.push('动直线经过的定点未定义。');else origin={x:p[0],y:p[1]};}
  else if(['focus1','focus2','vertex'].includes(scene.lineThrough)){
    let d=scene.type==='ellipse'?Math.sqrt(scene.a**2-scene.b**2):scene.type==='hyperbola'?Math.hypot(scene.a,scene.b):scene.type==='parabola'?scene.p*scene.direction:0;
    if(scene.lineThrough==='focus1')d=-d;if(scene.lineThrough==='vertex')d=0;
    origin=scene.orientation==='vertical'?{x:h,y:k+d}:{x:h+d,y:k};
  }
  const angle=scene.theta*Math.PI/180,dynamic={type:'line',o:origin,d:{x:Math.cos(angle),y:Math.sin(angle)}};
  if(scene.dynamicLine)construct.intersect(dynamic,{type:'conic',q:curve.q}).slice(0,2).forEach((p,i)=>features.push({...p,name:['A','B'][i]}));
  const engine=construct.createEngine({model:()=>scene,features:()=>features,coeffs:()=>curve.q,origin:()=>origin,angle:()=>scene.theta,conicPoint:curve.pointAt,conicProject:curve.project});
  for(const node of [...scene.lines,...scene.objects]){
    try{
      const value=engine.resolve(node.id);
      if(!value||value.type==='point'&&![value.x,value.y].every(Number.isFinite))issues.push((node.label||node.id)+' 在当前参数下无法构造（可能相离、退化或切点不在曲线上）。');
    }catch{issues.push((node.label||node.id)+' 的构造无法计算。');}
  }
  return [...new Set(issues)];
}
