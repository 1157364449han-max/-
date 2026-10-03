/* Data-only motion policy: fixed premises, constrained drivers, explicit exploration. */
(function () {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  const geometryKeys = ['a','b','p','r','h','k','direction'];
  const nodes = model => [...(model?.lines || []), ...(model?.objects || [])];
  const protectedScene = model => model?.problemMotion === true;
  const unrestricted = model => model?.unrestrictedMotion === true;
  const editable = (model, id) => !protectedScene(model) || unrestricted(model) || nodes(model).find(o => o.id === id)?.source === 'user';
  function capture(model, values) {
    if (!protectedScene(model)) return;
    const saved=model.motionBaseline,bounded=n=>Number.isFinite(n)&&Math.abs(n)<=100000;
    const valid=saved&&saved.values&&typeof saved.values==='object'&&Array.isArray(saved.shapes)&&saved.shapes.length<=500&&
      Object.entries(saved.values).every(([key,n])=>geometryKeys.includes(key)&&bounded(n)&&(!['a','b','p','r'].includes(key)||n>0))&&
      (model.type!=='ellipse'||(saved.values.a??values.a)>=(saved.values.b??values.b))&&
      saved.shapes.every(o=>o&&typeof o.id==='string'&&o.kind!=='construction'&&!Object.keys(o).some(key=>['__proto__','constructor','prototype'].includes(key)));
    if(valid)return;
    model.motionBaseline = {
      values: Object.fromEntries(geometryKeys.filter(key => Number.isFinite(values[key])).map(key => [key,values[key]])),
      expressions: Object.fromEntries(Object.entries(model.parameterExpressions||{}).filter(([key,value])=>geometryKeys.includes(key)&&typeof value==='string'&&value.length<=120)),
      shapes: nodes(model).filter(o => o.source !== 'user' && o.kind !== 'construction').map(clone)
    };
  }
  function restorePremises(model, values) {
    const baseline=model.motionBaseline;
    if (!protectedScene(model) || !baseline) return;
    for (const key of geometryKeys) if (Number.isFinite(baseline.values?.[key])) {
      values[key]=baseline.values[key];
      const expression=baseline.expressions?.[key];
      if(typeof expression==='string'&&expression.length<=120){model.parameterExpressions||={};model.parameterExpressions[key]=expression;}
      else if (model.parameterExpressions) delete model.parameterExpressions[key];
    }
    for (const saved of baseline.shapes || []) {
      const current=nodes(model).find(o => o.id === saved.id);
      if (!current || current.source === 'user') continue;
      const {visible,part,parts,label}=current;
      for (const key of Object.keys(current)) delete current[key];
      Object.assign(current,clone(saved),{visible,part,parts,label});
    }
  }
  function overridden(model,id,fallback) {
    if (!unrestricted(model)) return fallback;
    const shape=model.motionOverrides?.[id], bounded=n=>Number.isFinite(n)&&Math.abs(n)<=100000;
    if (shape?.type==='point' && bounded(shape.x) && bounded(shape.y)) return {type:'point',x:shape.x,y:shape.y};
    if (shape?.type==='line' && bounded(shape.o?.x) && bounded(shape.o?.y) && bounded(shape.d?.x) && bounded(shape.d?.y) && Math.hypot(shape.d.x,shape.d.y)>1e-9)
      return {type:'line',o:{...shape.o},d:{...shape.d},segment:shape.segment===true,ray:shape.ray===true};
    if (shape?.type==='circle' && bounded(shape.x) && bounded(shape.y) && bounded(shape.r) && shape.r>0) return {type:'circle',x:shape.x,y:shape.y,r:shape.r};
    return fallback;
  }
  function setOverride(model,id,shape) {
    if (!unrestricted(model) || typeof id!=='string' || ['__proto__','constructor','prototype'].includes(id)) return false;
    model.motionOverrides ||= {};
    model.motionOverrides[id]=clone(shape);
    return true;
  }
  function dragAllowed(model,target) {
    if (!protectedScene(model) || unrestricted(model) || !target || target.type==='dynamic') return true;
    if (target.type==='point') return false;
    if (['center','major','minor','radius','focus'].includes(target.type)) return false;
    const obj=target.obj || target.line || nodes(model).find(o=>o.id===target.id);
    return obj?.source==='user' || target.type==='native' && ['point_on','line_angle'].includes(obj?.op);
  }
  function permittedPoint(object,point) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
    if (object.excludeAxis==='y' && Math.abs(point.x)<1e-7) return false;
    if (object.excludeAxis==='x' && Math.abs(point.y)<1e-7) return false;
    return true;
  }
  function attach(api) {
    const button=document.getElementById('unrestrictedMove'),status=document.getElementById('motionConstraintStatus');
    function sync() {
      const model=api.state.model,free=unrestricted(model);
      button.disabled=!model;button.setAttribute('aria-pressed',String(free));
      button.textContent=free?'无限制移动：已开启':'无限制移动';
      status.textContent=free?'自由探索：可脱离题设；关闭后恢复题设约束。':protectedScene(model)?'按题设移动：固定图形锁定，动点沿轨迹，关联对象实时重算。':'按构造移动：曲线上点保持绑定；自由作图对象可编辑。';
      status.dataset.mode=free?'free':'constrained';
    }
    button.addEventListener('click',()=>{
      if (!api.state.model) return;
      api.stopMotion?.();
      const before=api.checkpoint(),model=api.state.model;
      model.unrestrictedMotion=!unrestricted(model);
      delete model.motionOverrides;
      if (!model.unrestrictedMotion) restorePremises(model,api.state.p);
      api.state.exploring=model.unrestrictedMotion;
      api.record(before);api.changed();api.render();sync();
      api.hint(model.unrestrictedMotion?'无限制移动已开启：图稿可不满足题目条件；解析仍对应原题。':'已恢复题设约束；动点回到最近一次受约束的位置。');
    });
    sync();return {sync};
  }
  const exported={protectedScene,unrestricted,editable,capture,restorePremises,overridden,setOverride,dragAllowed,permittedPoint,attach};
  if(typeof window!=='undefined')window.DongMotion=exported;
  if(typeof module!=='undefined')module.exports=exported;
})();
