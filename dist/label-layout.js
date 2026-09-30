/* Screen-space label placement only: never changes mathematical coordinates. */
(function(root){
  'use strict';
  const MAX_CACHE=512, PAD=3, VIEW_PAD=4, GAP=8, WORLD_EPS=1e-9;
  const DEFAULT_FONT='600 13px Microsoft YaHei UI, sans-serif';
  const SUB='₀₁₂₃₄₅₆₇₈₉';
  const finite=Number.isFinite;
  const clone=value=>JSON.parse(JSON.stringify(value));
  const pointText=value=>String(value??'').replace(/\^\s*(?:\{\s*(?:\\prime|['′’])\s*\}|\\prime|['′’])/g,'′').replace(/\\prime/g,'′').replace(/['’]/g,'′').replace(/_\{([0-9]+)\}|_([0-9]+)/g,(_,a,b)=>[...(a||b)].map(n=>SUB[Number(n)]).join(''));
  const nearWorld=(a,b)=>Math.abs(a-b)<=Math.max(WORLD_EPS,32*Number.EPSILON*Math.max(1,Math.abs(a),Math.abs(b)));
  const sameWorld=(a,b)=>finite(a.worldX)&&finite(a.worldY)&&finite(b.worldX)&&finite(b.worldY)
    &&nearWorld(a.worldX,b.worldX)&&nearWorld(a.worldY,b.worldY);
  const overlap=(a,b,margin=1)=>Math.max(0,Math.min(a.x+a.width+margin,b.x+b.width+margin)-Math.max(a.x-margin,b.x-margin))
    *Math.max(0,Math.min(a.y+a.height+margin,b.y+b.height+margin)-Math.max(a.y-margin,b.y-margin));
  const rectOf=value=>{
    const x=Number(value?.x??value?.left),y=Number(value?.y??value?.top);
    const width=Number(value?.width??(Number(value?.right)-x)),height=Number(value?.height??(Number(value?.bottom)-y));
    return [x,y,width,height].every(finite)&&width>=0&&height>=0?{x,y,width,height}:null;
  };
  function create(ctx){
    if(!ctx||typeof ctx.measureText!=='function')throw new TypeError('A 2D canvas context is required.');
    let width=1,height=1,sceneKey='',frame=0,queue=[],reserved=[],placements=[],groups=[];
    const cache=new Map();
    function begin(w,h,options={}){
      width=finite(Number(w))?Math.max(1,Number(w)):1;
      height=finite(Number(h))?Math.max(1,Number(h)):1;
      const next=String(options.sceneKey??'');
      if(next!==sceneKey){cache.clear();sceneKey=next;}
      frame++;queue=[];reserved=[];placements=[];groups=[];
      return api;
    }
    function reserve(value){
      const rect=rectOf(value);
      if(rect)reserved.push({...rect,...(value.tag!=null?{tag:String(value.tag)}:{}),...(value.text!=null?{text:String(value.text)}:{})});
      return api;
    }
    function enqueue(value,kind){
      if(!value||!finite(value.x)||!finite(value.y))return api;
      // Panning must not pull labels of cropped-out points back onto the board.
      // Retain anchors within one marker radius so edge-visible points stay named.
      if(kind==='point'&&(value.x< -6||value.y< -6||value.x>width+6||value.y>height+6))return api;
      const text=kind==='point'?pointText(value.text):String(value.text??'');
      if(!text.trim())return api;
      const worldX=finite(value.worldX)?value.worldX:null,worldY=finite(value.worldY)?value.worldY:null;
      const key=String(value.key??`${kind}:${worldX??value.x}:${worldY??value.y}:${text}`);
      queue.push({kind,x:value.x,y:value.y,worldX,worldY,text,key,color:String(value.color||'#203b5b'),
        priority:finite(value.priority)?value.priority:0,font:String(value.font||DEFAULT_FONT),index:queue.length});
      return api;
    }
    function collect(){
      const result=[];
      // Screen-near points remain distinct. Only numerical world coincidence or
      // an identical object key at the identical anchor may share one label.
      for(const item of queue){
        let group=item.kind==='point'?result.find(g=>g.kind==='point'&&(sameWorld(g,item)
          ||g.members.some(m=>m.key===item.key&&Math.abs(m.x-item.x)<1e-6&&Math.abs(m.y-item.y)<1e-6))):null;
        if(item.kind==='annotation'&&result.some(g=>g.kind==='annotation'&&g.members.some(m=>m.key===item.key&&m.text===item.text&&m.x===item.x&&m.y===item.y)))continue;
        if(!group){group={...item,members:[]};result.push(group);}
        group.members.push(item);
      }
      for(const group of result){
        group.members.sort((a,b)=>b.priority-a.priority||a.text.localeCompare(b.text)||a.key.localeCompare(b.key));
        const first=group.members[0];
        Object.assign(group,{x:first.x,y:first.y,worldX:first.worldX,worldY:first.worldY,color:first.color,font:first.font,priority:first.priority});
        group.names=[...new Set(group.members.map(m=>m.text))];
        group.keys=[...new Set(group.members.map(m=>m.key))].sort();
        group.text=group.names.join(' / ');
        group.key=`${group.kind}:${group.keys.join('|')}:${group.names.slice().sort().join('|')}`;
        group.size=group.members.length;
      }
      return result.sort((a,b)=>b.priority-a.priority||a.key.localeCompare(b.key));
    }
    function measure(group){
      ctx.font=group.font;
      const sample=ctx.measureText('Mg'),fontSize=Number(group.font.match(/([0-9.]+)px/)?.[1])||13;
      const ascent=finite(sample.actualBoundingBoxAscent)&&sample.actualBoundingBoxAscent>0?sample.actualBoundingBoxAscent:fontSize*.8;
      const descent=finite(sample.actualBoundingBoxDescent)?sample.actualBoundingBoxDescent:fontSize*.25;
      const lineHeight=Math.ceil(Math.max(fontSize+3,ascent+descent+3));
      const maxTextWidth=Math.max(1,width-2*VIEW_PAD-2*PAD),lines=[];
      let line='';
      // Wrap, rather than omit, long combined aliases. Array.from keeps Unicode
      // subscript and prime characters intact; ordinary names stay on one line.
      for(const char of Array.from(group.text)){
        if(char==='\n'){lines.push(line);line='';continue;}
        if(line&&ctx.measureText(line+char).width>maxTextWidth){lines.push(line.trimEnd());line=char.trimStart();}
        else line+=char;
      }
      if(line||!lines.length)lines.push(line);
      const textWidth=Math.max(...lines.map(text=>ctx.measureText(text).width));
      return {lines,ascent,lineHeight,width:Math.min(width,textWidth+2*PAD),height:lines.length*lineHeight+2*PAD};
    }
    function candidates(group,box){
      const gaps=[GAP,16,28,44,68,100,144,208];
      // Dense scenes get a deterministic viewport-wide callout search. The
      // anchor stays unchanged; a leader exposes a distant label's association.
      const stepX=Math.max(12,Math.min(80,box.width+4)),stepY=Math.max(12,Math.min(48,box.height+4));
      const columns=1+Math.floor((Math.max(VIEW_PAD,width-box.width-VIEW_PAD)-VIEW_PAD)/stepX);
      const rows=1+Math.floor((Math.max(VIEW_PAD,height-box.height-VIEW_PAD)-VIEW_PAD)/stepY);
      // Lazy indexed candidates avoid constructing thousands of grid objects
      // every frame when the first nearby position is already collision-free.
      return {length:gaps.length*8+columns*rows,at(index){
        if(index>=gaps.length*8){const cell=index-gaps.length*8;return {x:VIEW_PAD+(cell%columns)*stepX,y:VIEW_PAD+Math.floor(cell/columns)*stepY,index};}
        const gap=gaps[Math.floor(index/8)],direction=index%8;
        const x=direction<3?group.x+gap:direction<6?group.x-box.width-gap:group.x-box.width/2;
        const y=[0,3,6].includes(direction)?group.y-box.height-gap:[1,4].includes(direction)?group.y-box.height/2:group.y+gap;
        return {x,y,index};
      }};
    }
    function clamped(candidate,box){
      return {x:Math.max(Math.min(VIEW_PAD,Math.max(0,width-box.width)),Math.min(candidate.x,Math.max(0,width-box.width-VIEW_PAD))),
        y:Math.max(Math.min(VIEW_PAD,Math.max(0,height-box.height)),Math.min(candidate.y,Math.max(0,height-box.height-VIEW_PAD))),width:box.width,height:box.height};
    }
    function leader(group,rect){
      const end={x:Math.max(rect.x,Math.min(group.x,rect.x+rect.width)),y:Math.max(rect.y,Math.min(group.y,rect.y+rect.height))};
      return Math.hypot(end.x-group.x,end.y-group.y)>14?{from:{x:group.x,y:group.y},to:end}:null;
    }
    function draw(group,box,placement){
      ctx.save();ctx.font=group.font;ctx.textAlign='left';ctx.textBaseline='alphabetic';
      if(placement.leader){ctx.beginPath();ctx.moveTo(placement.leader.from.x,placement.leader.from.y);ctx.lineTo(placement.leader.to.x,placement.leader.to.y);ctx.lineWidth=1;ctx.strokeStyle=group.color;ctx.globalAlpha=.6;ctx.stroke();ctx.globalAlpha=1;}
      const rect=placement.rect;
      ctx.fillStyle='rgba(255,255,255,0.93)';
      ctx.fillRect(rect.x,rect.y,rect.width,rect.height);
      ctx.fillStyle=group.color;
      box.lines.forEach((text,index)=>ctx.fillText(text,rect.x+PAD,rect.y+PAD+box.ascent+index*box.lineHeight));
      ctx.restore();
    }
    function flush(){
      groups=collect();placements=[];
      const occupied=reserved.map(r=>({...r}));
      // Keep label backing clear of all point markers, including lower-priority
      // points whose labels have not yet been placed.
      for(const group of groups)if(group.kind==='point')occupied.push({x:group.x-5,y:group.y-5,width:10,height:10});
      for(const group of groups){
        const box=measure(group),choices=candidates(group,box),previous=cache.get(group.key);
        const cachedIndex=previous&&previous.candidate<choices.length?previous.candidate:null;
        let selected=null,bestScore=Infinity;
        for(let attempt=0;attempt<choices.length;attempt++){
          // Move the cached candidate to the front without materializing the
          // whole grid; candidate indices still retain their stable identity.
          const index=cachedIndex==null?attempt:attempt===0?cachedIndex:attempt<=cachedIndex?attempt-1:attempt;
          const candidate=choices.at(index);
          const rect=clamped(candidate,box);let area=0,count=0;
          for(const obstacle of occupied){const amount=overlap(rect,obstacle);if(amount>0){area+=amount;count++;}}
          const end={x:Math.max(rect.x,Math.min(group.x,rect.x+rect.width)),y:Math.max(rect.y,Math.min(group.y,rect.y+rect.height))};
          const distance=Math.hypot(end.x-group.x,end.y-group.y);
          const score=area*10000+count*1000+distance+Math.hypot(rect.x-candidate.x,rect.y-candidate.y)*.1;
          if(score<bestScore){bestScore=score;selected={rect,candidate:candidate.index,overlaps:count};}
          if(count===0){selected={rect,candidate:candidate.index,overlaps:0};break;}
        }
        const placement={key:group.key,kind:group.kind,text:group.text,lines:box.lines,names:group.names,keys:group.keys,
          x:group.x,y:group.y,worldX:group.worldX,worldY:group.worldY,priority:group.priority,...selected,
          leader:leader(group,selected.rect),groupSize:group.size};
        placements.push(placement);occupied.push(selected.rect);
        cache.delete(group.key);cache.set(group.key,{candidate:selected.candidate,frame});
        while(cache.size>MAX_CACHE)cache.delete(cache.keys().next().value);
        draw(group,box,placement);
      }
      for(const [key,value] of cache)if(frame-value.frame>120)cache.delete(key);
      return clone(placements);
    }
    function snapshot(){
      return clone({width,height,sceneKey,placements,reserved,groups:groups.map(({members,index,font,...group})=>group),cacheSize:cache.size});
    }
    function clear(){queue=[];reserved=[];placements=[];groups=[];cache.clear();frame=0;sceneKey='';return api;}
    const api={begin,reserve,point:value=>enqueue(value,'point'),annotation:value=>enqueue(value,'annotation'),flush,snapshot,clear};
    return api;
  }
  root.DongLabelLayout={create,MAX_CACHE};
  if(typeof module!=='undefined'&&module.exports)module.exports=root.DongLabelLayout;
})(typeof window!=='undefined'?window:globalThis);
