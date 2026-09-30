/* Link explanation text to existing, visible objects only. This is not a proof engine. */
(function () {
  'use strict';
  const primes = value => String(value ?? '').replace(/\^\s*(?:\{\s*(?:\\prime|['′’])\s*\}|\\prime|['′’])/g,'′').replace(/\\prime/g,'′').replace(/['’]/g,'′');
  const name = value => primes(value).replace(/[₀₁₂₃₄₅₆₇₈₉]/g,c=>'₀₁₂₃₄₅₆₇₈₉'.indexOf(c)).replace(/[_{}\s]/g,'');
  function plain(value) {
    return primes(value).replace(/\\(?:triangle|Delta)/g,'△').replace(/\\[a-zA-Z]+/g,' ').replace(/[₀₁₂₃₄₅₆₇₈₉]/g,c=>'₀₁₂₃₄₅₆₇₈₉'.indexOf(c)).replace(/[_{}$]/g,'');
  }
  function mentioned(text, label) {
    const target=name(label);if(!target)return false;
    const source=plain(text);
    if(!/^[A-Za-z][0-9′]*(?:[A-Z][0-9′]*)*$/.test(target))return target.length>1&&source.includes(target);
    const words=source.match(/[A-Za-z][A-Za-z0-9′]*/g)||[];
    const tokens=words.flatMap(word=>/^[A-Z0-9′]+$/.test(word)?word.match(/[A-Z][0-9]*′*/g)||[]:[word]);
    if(tokens.includes(target))return true;
    // AB, A′B, F₁F₂ and polygon names must not be confused with arbitrary words.
    if(/^[A-Z]/.test(target))return words.includes(target);
    return false;
  }
  function select(text, entries) {
    const matched=entries.filter(entry=>mentioned(text,entry.label));
    const known=new Set(matched.map(entry=>name(entry.label)));
    const declared=window.DongSceneAudit?.declared(text)||[];
    const missing=declared.filter(label=>!known.has(name(label)));
    return {matched:[...new Set(matched.map(entry=>entry.label))],missing:[...new Set(missing)],ids:[...new Set(matched.map(entry=>entry.id))]};
  }
  function attach(api) {
    let selection=null;
    function clear(){selection=null;}
    function valid(){if(!selection)return true;if(selection.model!==api.model()||(selection.part!=null&&api.part()!=null&&Number(selection.part)!==Number(api.part())))return false;const visible=new Set(api.entries().map(entry=>entry.id));return selection.ids.every(id=>visible.has(id));}
    function highlight({text,part,index}={}) {
      const result=select(String(text??''),api.entries());
      selection={ids:result.ids,part,index,model:api.model()};
      api.render();return {matched:result.matched,missing:result.missing};
    }
    function draw() {
      if(!selection)return;
      if(!valid()){clear();return;}
      const byId=new Map(api.entries().map(entry=>[entry.id,entry]));
      const ctx=api.ctx;ctx.save();ctx.strokeStyle='#d88708';ctx.fillStyle='rgba(235,166,36,.14)';ctx.lineWidth=4;ctx.lineJoin='round';
      for(const id of selection.ids){const entry=byId.get(id);if(!entry)continue;const shape=entry.shape;
        if(shape?.type==='point'){const q=api.xy(shape.x,shape.y);if(!Number.isFinite(q.x)||!Number.isFinite(q.y))continue;ctx.beginPath();ctx.arc(q.x,q.y,10,0,Math.PI*2);ctx.fill();ctx.stroke();}
        else if(entry.paths){for(const path of entry.paths){ctx.beginPath();let first=true;for(const p of path){const q=api.xy(p.x,p.y);if(!Number.isFinite(q.x)||!Number.isFinite(q.y))continue;first?ctx.moveTo(q.x,q.y):ctx.lineTo(q.x,q.y);first=false;}ctx.stroke();}}
        else if(shape?.type==='line'){const ends=api.clip(shape);if(ends){const a=api.xy(ends.a.x,ends.a.y),b=api.xy(ends.b.x,ends.b.y);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}}
        else if(shape?.type==='circle'){ctx.beginPath();for(let i=0;i<=180;i++){const t=i*Math.PI/90,q=api.xy(shape.x+shape.r*Math.cos(t),shape.y+shape.r*Math.sin(t));i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y);}ctx.stroke();}
        else if(shape?.type==='polygon'&&shape.points?.length>=3){ctx.beginPath();shape.points.forEach((p,i)=>{const q=api.xy(p.x,p.y);i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y);});ctx.closePath();ctx.fill();ctx.stroke();}
      }
      ctx.restore();
    }
    return {highlight,clear,draw,valid,snapshot:()=>selection?{ids:[...selection.ids],part:selection.part,index:selection.index}:null};
  }
  window.DongStepHighlight={attach,select,mentioned};
})();
