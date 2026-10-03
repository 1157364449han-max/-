/* Literal motion domains; no expression evaluation or model-provided code. */
(function(){
  'use strict';
  const TAU=2*Math.PI,EPS=1e-8,finite=n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=100000;
  const plain=o=>o&&typeof o==='object'&&!Array.isArray(o);
  const allowed=new Set(['parameter','arc','quadrant','branch','x','y','excludeAxes']);
  function interval(raw,required=false){
    if(!plain(raw)||Object.keys(raw).some(k=>!['min','max','minClosed','maxClosed'].includes(k)))throw new Error('范围只允许数字上下界与开闭端点。');
    if((raw.min==null&&raw.max==null)||(required&&(raw.min==null||raw.max==null)))throw new Error('范围缺少上下界。');
    if(raw.min!=null&&!finite(raw.min)||raw.max!=null&&!finite(raw.max))throw new Error('范围端点必须是有限数字。');
    for(const k of ['minClosed','maxClosed'])if(raw[k]!=null&&typeof raw[k]!=='boolean')throw new Error('范围端点开闭必须为布尔值。');
    if(!required&&raw.min!=null&&raw.max!=null&&(raw.min>raw.max||raw.min===raw.max&&(raw.minClosed===false||raw.maxClosed===false)))throw new Error('范围为空或上下界顺序错误。');
    return {...(raw.min!=null?{min:raw.min}:{}),...(raw.max!=null?{max:raw.max}:{}),minClosed:raw.minClosed!==false,maxClosed:raw.maxClosed!==false};
  }
  function validate(raw){
    if(raw==null)return {};
    if(!plain(raw)||Object.keys(raw).some(k=>!allowed.has(k)))throw new Error('动点范围含不支持的字段。');
    const d={};
    for(const k of ['parameter','x','y'])if(raw[k]!=null)d[k]=interval(raw[k]);
    if(raw.arc!=null){
      d.arc=interval(raw.arc,true);const a=d.arc;
      if(a.max<a.min)a.max+=TAU*Math.ceil((a.min-a.max)/TAU);
      if(a.max-a.min>TAU+EPS||a.max===a.min)throw new Error('圆周弧段必须大于0且不超过一周。');
    }
    if(raw.quadrant!=null){if(![1,2,3,4].includes(raw.quadrant))throw new Error('象限必须为1、2、3或4。');d.quadrant=raw.quadrant;}
    if(raw.branch!=null){if(![1,-1].includes(raw.branch))throw new Error('双曲线分支必须为1或-1。');d.branch=raw.branch;}
    if(raw.excludeAxes!=null){if(!Array.isArray(raw.excludeAxes)||raw.excludeAxes.length>2||raw.excludeAxes.some(k=>!['x','y'].includes(k)))throw new Error('排除轴只能为x或y。');d.excludeAxes=[...new Set(raw.excludeAxes)];}
    return d;
  }
  function validateProfiles(raw,partIndexes){
    if(raw==null)return undefined;
    if(!plain(raw)||Object.keys(raw).length>12)throw new Error('分问运动配置最多12项。');
    const result={};
    for(const [key,p] of Object.entries(raw)){
      if(!/^(0|[1-9]\d{0,3})$/.test(key)||partIndexes&&!partIndexes.has(Number(key))||!plain(p)||Object.keys(p).some(k=>!['mode','x','y','t','branch','motionDomain'].includes(k)))throw new Error('分问运动配置或编号无效。');
      if(!['plane','curve'].includes(p.mode))throw new Error('分问运动模式须为plane或curve。');
      const row={mode:p.mode};
      for(const field of p.mode==='plane'?['x','y']:['t']){if(!finite(p[field]))throw new Error('分问动点缺少有效坐标或参数。');row[field]=p[field];}
      if(p.branch!=null){if(![1,-1].includes(p.branch))throw new Error('分问分支无效。');row.branch=p.branch;}
      row.motionDomain=validate(p.motionDomain);if(p.mode==='plane'&&['parameter','arc','branch'].some(k=>row.motionDomain[k]))throw new Error('平面动点不使用曲线参数范围或分支。');result[key]=row;
    }
    return result;
  }
  function storage(object,part){return part!=null&&Object.hasOwn(object.motionByPart||{},String(part))?object.motionByPart[String(part)]:object;}
  function driver(object,part){const row=storage(object,part);return row===object?{...object,mode:'curve'}:{...object,...row};}
  function contains(v,b){return !b||(b.min==null||(b.minClosed?v>=b.min:v>b.min))&&(b.max==null||(b.maxClosed?v<=b.max:v<b.max));}
  function lift(t,b){
    const center=(b.min+b.max)/2,value=t+TAU*Math.round((center-t)/TAU);
    return [value,value-TAU,value+TAU].find(n=>contains(n,b))??value;
  }
  function accepts(object,point,parameter){
    if(!point||!finite(point.x)||!finite(point.y))return false;
    let d;try{d=validate(object.motionDomain);}catch{return false;}
    if(!contains(point.x,d.x)||!contains(point.y,d.y))return false;
    if(d.quadrant){const [sx,sy]=[[1,1],[-1,1],[-1,-1],[1,-1]][d.quadrant-1];if(point.x*sx<=EPS||point.y*sy<=EPS)return false;}
    if((d.excludeAxes||[]).includes('x')&&Math.abs(point.y)<EPS||(d.excludeAxes||[]).includes('y')&&Math.abs(point.x)<EPS)return false;
    if(object.excludeAxis==='x'&&Math.abs(point.y)<1e-7||object.excludeAxis==='y'&&Math.abs(point.x)<1e-7)return false;
    if(d.parameter&&(!parameter||!contains(parameter.t,d.parameter)))return false;
    if(d.arc&&(!parameter||!finite(parameter.t)||!contains(lift(parameter.t,d.arc),d.arc)))return false;
    if(d.branch!=null&&parameter?.branch!==d.branch)return false;
    return true;
  }
  function clamp(v,b){
    if(!b)return v;
    const width=b.min!=null&&b.max!=null?b.max-b.min:1,margin=Math.min(Math.max(1e-7,Math.abs(width)*1e-8),Math.max(width/4,Number.EPSILON));
    const lo=b.min==null?-Infinity:b.min+(b.minClosed?0:margin),hi=b.max==null?Infinity:b.max-(b.maxClosed?0:margin);
    return Math.max(lo,Math.min(hi,v));
  }
  function fit(object,parameter,{periodic=false,hyperbola=false}={}){
    const d=validate(object.motionDomain),p={...parameter};
    if(d.arc&&!periodic)throw new Error('弧段只适用于圆或椭圆。');
    if(d.branch!=null&&!hyperbola)throw new Error('分支限制只适用于双曲线。');
    if(d.arc)p.t=clamp(lift(p.t,d.arc),d.arc);
    p.t=clamp(p.t,d.parameter);
    if(hyperbola)p.branch=d.branch??object.branch??1;
    return p;
  }
  function describe(object){
    let d;try{d=validate(object.motionDomain);}catch{return '约束配置无效';}
    const fmt=n=>globalThis.DongNumber?.text(n)??String(Number(n.toFixed(5))),range=b=>(b.min!=null&&b.minClosed?'[':'(')+(b.min==null?'-∞':fmt(b.min))+', '+(b.max==null?'∞':fmt(b.max))+(b.max!=null&&b.maxClosed?']':')');
    const bits=[object.mode==='plane'?'平面动点':'沿所在曲线'];
    if(d.quadrant)bits.push('第'+['一','二','三','四'][d.quadrant-1]+'象限');
    if(d.arc)bits.push('弧段 t∈'+range(d.arc)+'（弧度）');
    if(d.parameter)bits.push('t∈'+range(d.parameter));
    if(d.branch!=null)bits.push('固定'+(d.branch===1?'正':'负')+'分支');
    for(const k of ['x','y'])if(d[k])bits.push(k+'∈'+range(d[k]));
    const axes=new Set([...(d.excludeAxes||[]),...(object.excludeAxis?[object.excludeAxis]:[])]);for(const axis of axes)bits.push('排除'+axis+'轴');
    return bits.join('；');
  }
  const exported={TAU,validate,validateProfiles,storage,driver,contains,accepts,fit,describe};
  globalThis.DongMotionDomain=exported;
  if(typeof window!=='undefined')window.DongMotionDomain=exported;
  if(typeof module!=='undefined')module.exports=exported;
})();
