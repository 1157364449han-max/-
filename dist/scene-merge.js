/* Merge independently derived nodes with their complete dependency closure. */
(()=>{
  'use strict';
  const pointOps=new Set(['point_on','midpoint','reflect_center','reflect_axis','foot','ellipse_tangent_point','intersection']);
  function category(node){
    if(node.kind==='point'||pointOps.has(node.op))return 'point';
    if(node.kind==='circle'||node.op==='circle')return 'circle';
    if(node.kind==='conic')return 'conic';
    if(node.op==='distance')return 'measure';
    return ['line','slope','vertical','through_points'].includes(node.kind)||['line','segment','ray','parallel','perpendicular','tangent','normal','line_angle'].includes(node.op)?'line':node.kind||node.op;
  }
  function remapReferences(value,mapping){
    if(typeof value==='string')return mapping[value]||value;
    if(Array.isArray(value))return value.map(item=>remapReferences(item,mapping));
    if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,remapReferences(item,mapping)]));
    return value;
  }
  function mergeDerived(target,verified){
    const groups=['objects','lines'],source=new Map(),existing=[];
    for(const group of groups){
      for(const node of verified[group]||[])if(node.id)source.set(node.id,{group,node});
      for(const node of target[group]||[])existing.push({group,node});
    }
    const selected=new Set(),pointAliases=new Map();
    const dynamicNames=new Set(verified.dynamicLine||verified.showDynamic?verified.dynamicIntersectionLabels||['A','B']:[]);
    for(const [id,{node}] of source)if(category(node)==='point'&&node.label&&!Object.hasOwn(verified.points||{},node.label)&&!dynamicNames.has(node.label)){
      const key='feature:'+node.label;pointAliases.set(key,pointAliases.has(key)?null:id);
    }
    function include(id){
      id=pointAliases.get(id)||id;
      if(selected.has(id)||!source.has(id))return;
      selected.add(id);
      for(const ref of source.get(id).node.refs||[])include(ref);
    }
    for(const [id,{node}] of source)if(node.source==='derived')include(id);
    const remap=new Map(),replaced=new Set(),consumed=new Set(),warnings=[];
    const usedIds=new Set(existing.map(e=>e.node.id).filter(Boolean));
    const manual=node=>['user','manual'].includes(node.source);
    for(const id of selected){
      const node=source.get(id).node;
      const compatible=e=>!consumed.has(e.node)&&!manual(e.node)&&category(e.node)===category(node);
      const match=existing.find(e=>e.node.id===id&&compatible(e))||existing.find(e=>node.label&&e.node.label===node.label&&compatible(e));
      let mapped=match?.node.id||id;
      if(!match&&usedIds.has(mapped)){let suffix=1;while(usedIds.has(id+'-derived-'+suffix))suffix++;mapped=id+'-derived-'+suffix;}
      usedIds.add(mapped);if(match)consumed.add(match.node);
      remap.set(id,mapped);if(match)replaced.add(match.node);
    }
    for(const group of groups)target[group]=(target[group]||[]).filter(node=>!replaced.has(node));
    const mapping=Object.fromEntries(remap);
    for(const [alias,id] of pointAliases)if(id&&selected.has(id)&&!Object.hasOwn(target.points||{},alias.slice(8))&&!dynamicNames.has(alias.slice(8)))mapping[alias]=remap.get(id);
    const usedLabels=new Set(groups.flatMap(group=>target[group]).map(node=>node.label).filter(Boolean));
    for(const id of selected){
      const {group,node}=source.get(id),copy=JSON.parse(JSON.stringify(node));
      copy.id=remap.get(id);
      if(copy.refs)copy.refs=remapReferences(copy.refs,mapping);
      if(copy.pointRef)copy.pointRef=remapReferences(copy.pointRef,mapping);
      if(copy.construction?.inputs)copy.construction.inputs=remapReferences(copy.construction.inputs,mapping);
      if(copy.label&&usedLabels.has(copy.label)){
        const original=copy.label;let suffix=1,label=original+'（解析）';while(usedLabels.has(label))label=original+'（解析'+(++suffix)+'）';copy.label=label;
        warnings.push('已保留原有对象 '+original+'；独立复算对象显示为 '+label+'。');
      }
      if(copy.label)usedLabels.add(copy.label);
      target[group].push(copy);
    }
    // Imported feature aliases may refer to constructed points, which are not
    // fixed features. Preserve existing dependents, but bind those aliases to
    // the corrected object ID rather than an unresolvable feature name.
    for(const group of groups)for(const node of target[group])if(!manual(node)&&!selected.has(node.id)){
      if(node.refs)node.refs=node.refs.map(ref=>mapping[ref]&&ref.startsWith('feature:')?mapping[ref]:ref);
    }
    target.provenance={...target.provenance,derivedIdMap:{...target.provenance?.derivedIdMap,...mapping},mergeWarnings:warnings};
    return selected.size;
  }
  window.DongSceneMerge={mergeDerived,remapReferences};
})();
