/* Merge independently derived nodes with their complete dependency closure. */
(()=>{
  'use strict';
  function mergeDerived(target,verified){
    const groups=['objects','lines'],source=new Map(),existing=[];
    for(const group of groups){
      for(const node of verified[group]||[])if(node.id)source.set(node.id,{group,node});
      for(const node of target[group]||[])existing.push({group,node});
    }
    const selected=new Set();
    function include(id){
      if(selected.has(id)||!source.has(id))return;
      selected.add(id);
      for(const ref of source.get(id).node.refs||[])include(ref);
    }
    for(const [id,{node}] of source)if(node.source==='derived')include(id);
    const remap=new Map(),replaced=new Set();
    for(const id of selected){
      const node=source.get(id).node;
      const match=existing.find(e=>e.node.id===id)||existing.find(e=>node.label&&e.node.label===node.label);
      const mapped=match?.node.id||id;
      remap.set(id,mapped);if(match)replaced.add(match.node);
    }
    for(const group of groups)target[group]=(target[group]||[]).filter(node=>!replaced.has(node));
    for(const id of selected){
      const {group,node}=source.get(id),copy=JSON.parse(JSON.stringify(node));
      copy.id=remap.get(id);
      if(copy.refs)copy.refs=copy.refs.map(ref=>remap.get(ref)||ref);
      target[group].push(copy);
    }
    return selected.size;
  }
  window.DongSceneMerge={mergeDerived};
})();
