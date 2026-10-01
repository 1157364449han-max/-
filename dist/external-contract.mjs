/* Offline, data-only import of replies from a user's own AI. No inference or fetch. */
import {SOLVE_SYSTEM, assemble, splitParts} from './cloud-contract.mjs';
import {safeConstructionScene} from './scene-contract.mjs';

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

export function safeExternalScene(raw, options) {
  const graph=safeConstructionScene(raw, options);
  if(graph.scene)graph.scene.provenance={...graph.scene.provenance,externalReply:true};
  return graph;
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
    const graph=safeExternalScene(raw.scene,{partIndexes:expected});result.scene=graph.valid?graph.scene:null;warnings.push(...graph.warnings);graphValid=graph.valid;
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
  if(scene.dynamicLine)construct.intersect(dynamic,{type:'conic',q:curve.q}).slice(0,2).forEach((p,i)=>features.push({...p,name:(scene.dynamicIntersectionLabels||['A','B'])[i]}));
  const engine=construct.createEngine({model:()=>scene,features:()=>features,coeffs:()=>curve.q,origin:()=>origin,angle:()=>scene.theta,conicPoint:curve.pointAt,conicProject:curve.project});
  for(const node of [...scene.lines,...scene.objects]){
    try{
      const value=engine.resolve(node.id);
      if(!value||value.type==='point'&&![value.x,value.y].every(Number.isFinite))issues.push((node.label||node.id)+' 在当前参数下无法构造（可能相离、退化或切点不在曲线上）。');
    }catch{issues.push((node.label||node.id)+' 的构造无法计算。');}
  }
  return [...new Set(issues)];
}
