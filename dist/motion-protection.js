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
      saved.shapes.every(o=>o&&typeof o.id==='string'&&o.kind!=='construction'&&!Object.keys(o).some(key=>['__proto__','constructor','prototype'].includes(key)))&&
      (saved.points==null||typeof saved.points==='object'&&!Array.isArray(saved.points)&&Object.entries(saved.points).length<=500&&Object.entries(saved.points).every(([name,xy])=>!['__proto__','constructor','prototype'].includes(name)&&Array.isArray(xy)&&xy.length===2&&xy.every(bounded)));
    if(valid){saved.points||=clone(model.points||{});return;}
    model.motionBaseline = {
      values: Object.fromEntries(geometryKeys.filter(key => Number.isFinite(values[key])).map(key => [key,values[key]])),
      expressions: Object.fromEntries(Object.entries(model.parameterExpressions||{}).filter(([key,value])=>geometryKeys.includes(key)&&typeof value==='string'&&value.length<=120)),
      points: clone(model.points||{}),
      shapes: nodes(model).filter(o => o.source !== 'user' && o.kind !== 'construction').map(clone)
    };
  }
  function restorePremises(model, values) {
    const baseline=model.motionBaseline;
    if (!protectedScene(model) || !baseline) return;
    for(const [name,xy] of Object.entries(baseline.points||{}))if(Object.hasOwn(model.points||{},name))model.points[name]=clone(xy);
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
  function permittedPoint(object,point,parameter) {
    if(globalThis.DongMotionDomain)return globalThis.DongMotionDomain.accepts(object,point,parameter);
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
    if (object.excludeAxis==='y' && Math.abs(point.x)<1e-7) return false;
    if (object.excludeAxis==='x' && Math.abs(point.y)<1e-7) return false;
    return true;
  }
  function attach(api) {
    const button=document.getElementById('unrestrictedMove'),status=document.getElementById('motionConstraintStatus');
    const $=id=>document.getElementById(id),rules=$('motionRules'),selector=$('motionRulePoint');let ruleSignature='';
    function ruleKind(domain){return domain.arc?'arc':domain.parameter?'parameter':domain.quadrant?'q'+domain.quadrant:domain.x?'x':domain.y?'y':'none';}
    function ruleFields(){ $('motionRuleBounds').hidden=!['parameter','arc','x','y'].includes($('motionRuleKind').value); }
    function syncRules(){
      if(!rules||!api.engine)return;
      const objects=(api.state.model?.objects||[]).filter(o=>o.op==='point_on'&&api.visible(o)),selected=objects.find(o=>o.id===selector.value)||objects[0];
      // Keep the collapsed entry's height stable. Adding the first bound point
      // must not shift the canvas while a tangent/normal tool is mid-gesture.
      rules.hidden=false;
      const spec=selected&&api.engine.driver(selected),{t,x,y,...configuration}=spec||{};
      // Parameter changes must not overwrite a half-entered range expression.
      const stable=JSON.stringify([objects.map(o=>[o.id,o.label,o.source]),selected?.id,configuration,api.state.activePart,unrestricted(api.state.model)]);
      if(stable===ruleSignature)return;ruleSignature=stable;
      const chosen=selected?.id;selector.replaceChildren(...objects.map(o=>new Option(o.label||o.id,o.id)));
      selector.disabled=!selected;
      if(!selected){$('motionRuleDescription').textContent='尚无可设置的动点：用作图工具“点”点击曲线，可追加一个沿曲线移动的点。';$('motionRuleFields').disabled=true;$('motionRuleFeedback').textContent='';return;}selector.value=chosen;
      const domain=globalThis.DongMotionDomain.validate(spec.motionDomain),kind=ruleKind(domain),bounds=domain[kind]||{};
      $('motionRuleDescription').textContent=globalThis.DongMotionDomain.describe(spec)+(selected.source==='user'?' · 手动追加，可设置':' · 题设约束，仅查看');
      $('motionRuleFields').disabled=selected.source!=='user'||unrestricted(api.state.model);$('motionRuleKind').value=kind;
      for(const key of ['Min','Max'])$('motionRule'+key).value=bounds[key.toLowerCase()]!=null?globalThis.DongNumber?.input(bounds[key.toLowerCase()])??String(bounds[key.toLowerCase()]):'';
      for(const key of ['Min','Max'])$('motionRule'+key+'Closed').checked=bounds[key.toLowerCase()+'Closed']!==false;
      $('motionRuleBranch').value=domain.branch==null?'':String(domain.branch);
      $('motionRuleBranchLabel').hidden=api.engine.resolve(selected.refs[0])?.conicType!=='hyperbola';
      for(const axis of ['X','Y'])$('motionRuleExclude'+axis).checked=(domain.excludeAxes||[]).includes(axis.toLowerCase())||spec.excludeAxis===axis.toLowerCase();
      ruleFields();
    }
    selector?.addEventListener('change',()=>{ruleSignature='';syncRules();$('motionRuleFeedback').textContent='';});
    $('motionRuleKind')?.addEventListener('change',ruleFields);
    $('applyMotionRule')?.addEventListener('click',()=>{
      const object=api.engine.getObject(selector.value);if(object?.source!=='user')return;
      try{
        if(unrestricted(api.state.model))throw new Error('请先关闭无限制移动，再设置动点范围。');
        const kind=$('motionRuleKind').value,domain={excludeAxes:['x','y'].filter(a=>$('motionRuleExclude'+a.toUpperCase()).checked)};
        if(kind.startsWith('q'))domain.quadrant=Number(kind.slice(1));
        else if(kind!=='none'){
          const b={minClosed:$('motionRuleMinClosed').checked,maxClosed:$('motionRuleMaxClosed').checked};
          for(const key of ['min','max']){const text=$('motionRule'+key[0].toUpperCase()+key.slice(1)).value.trim();if(text)b[key]=globalThis.DongEquationBuilder.scalar(text);}
          domain[kind]=b;
        }
        if(!$('motionRuleBranchLabel').hidden&&$('motionRuleBranch').value)domain.branch=Number($('motionRuleBranch').value);
        const clean=globalThis.DongMotionDomain.validate(domain),before=clone(object),point=api.engine.resolve(object.id);
        api.transaction(()=>{
          try{
            const store=globalThis.DongMotionDomain.storage(object,api.state.activePart);store.motionDomain=clean;
            if(point)api.engine.dragDriver(object.id,point);
            if(!api.engine.resolve(object.id)){
              const spec=api.engine.driver(object),bounds=clean.arc||clean.parameter||{min:-Math.PI,max:Math.PI},lo=bounds.min??-4,hi=bounds.max??4;
              let best=null;
              if(spec.mode!=='plane')for(let i=0;i<=360;i++){
                let parameter;try{const shape=api.engine.resolve(object.refs[0]);parameter=globalThis.DongMotionDomain.fit(spec,{t:lo+(hi-lo)*i/360,branch:spec.branch||1},{periodic:shape?.type==='circle'||['circle','ellipse'].includes(shape?.conicType),hyperbola:shape?.conicType==='hyperbola'});}catch{continue;}
                const p=api.engine.pointOn(object.refs[0],parameter);if(!globalThis.DongMotionDomain.accepts(spec,p,parameter))continue;
                const distance=point?Math.hypot(p.x-point.x,p.y-point.y):0;if(!best||distance<best.distance)best={parameter,distance};
              }
              if(best)api.engine.moveDriver(object.id,best.parameter);
            }
            if(!api.engine.resolve(object.id))throw new Error('未找到满足范围的显示位置；已保留原约束。请检查端点、象限与曲线位置。');
          }catch(error){for(const key of Object.keys(object))delete object[key];Object.assign(object,before);throw error;}
        });
        ruleSignature='';syncRules();$('motionRuleFeedback').textContent='已应用范围，动点和关联图形遵守新约束；可撤销。';
      }catch(error){$('motionRuleFeedback').textContent=error.message;}
    });
    function sync() {
      const model=api.state.model,free=unrestricted(model);
      button.disabled=!model;button.setAttribute('aria-pressed',String(free));
      button.textContent=free?'无限制移动：已开启':'无限制移动';
      status.textContent=free?'自由探索：可脱离题设；关闭后恢复题设约束。':protectedScene(model)?'按题设移动：固定图形锁定，动点沿轨迹，关联对象实时重算。':'按构造移动：曲线上点保持绑定；自由作图对象可编辑。';
      status.dataset.mode=free?'free':'constrained';
      syncRules();
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
    sync();return {sync,syncRules};
  }
  const exported={protectedScene,unrestricted,editable,capture,restorePremises,overridden,setOverride,dragAllowed,permittedPoint,attach};
  if(typeof window!=='undefined')window.DongMotion=exported;
  if(typeof module!=='undefined')module.exports=exported;
})();
