/* 董解析本地拖拽控制器。使用 Pointer Events，鼠标、笔和触摸共用同一构造规则。 */
(() => {
  'use strict';
  window.DongDrag = {attach(api) {
    const {canvas, ctx, state, xy, worldX, worldY} = api;
    const undo = [], redo = [];
    let drag = null, selection = null, mode = 'move', snap = false;
    const clone = value => JSON.parse(JSON.stringify(value));
    const $ = id => document.getElementById(id);
    const snapshot = () => ({model:clone(state.model),p:clone(state.p),grid:state.grid,guides:state.guides});
    const hint = message => { $('dragHint').textContent = message; };
    const fmt = value => Number(value.toFixed(4)).toString();
    const bounded = v => Math.max(-100000, Math.min(100000,v));
    const snapped = v => bounded(snap ? Math.round(v*2)/2 : v);
    const screen = event => { const r=canvas.getBoundingClientRect(); return {x:event.clientX-r.left,y:event.clientY-r.top}; };
    const world = p => ({x:worldX(p.x),y:worldY(p.y)});
    const distance = (p,q) => Math.hypot(p.x-q.x,p.y-q.y);
    function syncButtons() { $('undoDrag').disabled=!undo.length; $('redoDrag').disabled=!redo.length; }
    function record(before) {
      if(JSON.stringify(before)===JSON.stringify(snapshot()))return;
      undo.push(before); if(undo.length>60)undo.shift(); redo.length=0; syncButtons();
    }
    function restore(saved) { state.model=clone(saved.model);state.p=clone(saved.p);if(typeof saved.grid==='boolean')state.grid=saved.grid;if(typeof saved.guides==='boolean')state.guides=saved.guides;selection=null;api.changed();api.render(); }
    function undoAction(){if(!undo.length)return;redo.push(snapshot());restore(undo.pop());syncButtons();hint('已撤销一次操作。');}
    function redoAction(){if(!redo.length)return;undo.push(snapshot());restore(redo.pop());syncButtons();hint('已重做一次操作。');}
    function resolvePoint(name) {
      if(Object.prototype.hasOwnProperty.call(state.model.points||{},name)&&!state.model.pointBindings?.[name]) {
        return {get:()=>({x:state.model.points[name][0],y:state.model.points[name][1]}),set:p=>{state.model.points[name]=[p.x,p.y];}};
      }
      const object=(state.model.objects||[]).find(o=>o.kind==='point'&&o.label===name);
      return object ? {get:()=>({x:object.x,y:object.y}),set:p=>Object.assign(object,p)} : null;
    }
    function visible(obj){return api.visible(obj);}
    function lineLabel(line){return 'x' in line&&line.m==null?`x = ${fmt(line.x)}`:`y = ${fmt(line.m)}x ${line.b<0?'−':'+'} ${fmt(Math.abs(line.b||0))}`;}
    function applyLine(line, pivot, theta) {
      if(Math.abs(Math.cos(theta))<0.002){delete line.m;delete line.b;line.x=pivot.x;if(line.kind!=='line')line.kind='vertical';}
      else {line.m=Math.tan(theta);line.b=pivot.y-line.m*pivot.x;delete line.x;if(line.kind!=='line')line.kind='slope';}
      if(line.userEquation)line.label=lineLabel(line);
    }
    function projection(line) {
      const ends=api.endpoints(line); if(!ends)return null;
      const v=state.view,c={x:(v.xmin+v.xmax)/2,y:(v.ymin+v.ymax)/2};
      const dx=ends.b.x-ends.a.x,dy=ends.b.y-ends.a.y,l2=dx*dx+dy*dy;
      if(l2<1e-12)return null;
      const t=((c.x-ends.a.x)*dx+(c.y-ends.a.y)*dy)/l2;
      const pivot={x:ends.a.x+t*dx,y:ends.a.y+t*dy};
      const step=(v.xmax-v.xmin)/state.cssW*95;
      const len=Math.sqrt(l2);
      return {pivot,handle:{x:pivot.x+dx/len*step,y:pivot.y+dy/len*step}};
    }
    function handles() {
      if(!state.model)return [];
      const list=[],m=state.model,p=state.p,vertical=m.orientation==='vertical';
      if(m.showFeatures!==false){
        for(const [name,coords] of Object.entries(m.points||{}))if(!m.pointBindings?.[name])list.push({type:'point',name,point:{x:coords[0],y:coords[1]},label:`点 ${name}`});
      }
      for(const obj of m.objects||[]){if(!visible(obj))continue;
        if(obj.kind==='point')list.push({type:'userPoint',obj,point:{x:obj.x,y:obj.y},label:`点 ${obj.label}`});
        if(obj.kind==='circle') {
          list.push({type:'circleCenter',obj,point:{x:obj.h,y:obj.k},label:`${obj.label} 圆心`});
          list.push({type:'circleRadius',obj,point:{x:obj.h+obj.r,y:obj.k},label:`${obj.label} 半径`});
        }
        if(obj.kind==='conic'){
          const ov=obj.orientation==='vertical';
          list.push({type:'objectConicCenter',obj,point:{x:obj.h,y:obj.k},label:`${obj.label} ${obj.conicType==='parabola'?'顶点':'中心'}`});
          if(['ellipse','hyperbola'].includes(obj.conicType)){
            list.push({type:'objectConicMajor',obj,point:ov?{x:obj.h,y:obj.k+obj.a}:{x:obj.h+obj.a,y:obj.k},label:`${obj.label} 调整 a`});
            list.push({type:'objectConicMinor',obj,point:ov?{x:obj.h+obj.b,y:obj.k}:{x:obj.h,y:obj.k+obj.b},label:`${obj.label} 调整 b`});
          }else list.push({type:'objectConicFocus',obj,point:ov?{x:obj.h,y:obj.k+(obj.direction||1)*obj.p}:{x:obj.h+(obj.direction||1)*obj.p,y:obj.k},label:`${obj.label} 调整焦距与开口`});
        }
      }
      if(m.showConic!==false){
        list.push({type:'center',point:{x:p.h,y:p.k},label:m.type==='parabola'?'拖动顶点平移抛物线':'拖动中心平移曲线'});
        if(['ellipse','hyperbola'].includes(m.type)){
          for(const sign of [-1,1])list.push({type:'major',point:vertical?{x:p.h,y:p.k+sign*p.a}:{x:p.h+sign*p.a,y:p.k},label:'拖动顶点调整 a'});
          list.push({type:'minor',point:vertical?{x:p.h+p.b,y:p.k}:{x:p.h,y:p.k+p.b},label:'拖动蓝色手柄调整 b'});
        }else if(m.type==='circle')list.push({type:'radius',point:{x:p.h+p.r,y:p.k},label:'拖动圆周手柄调整半径'});
        else list.push({type:'focus',point:vertical?{x:p.h,y:p.k+(p.direction||1)*p.p}:{x:p.h+(p.direction||1)*p.p,y:p.k},label:'拖动焦点调整开口与焦距'});
      }
      if(m.showDynamic!==false&&visible({part:m.dynamicLinePart})) {
        const origin=api.lineOrigin(),rad=p.theta*Math.PI/180;
        const d=(state.view.xmax-state.view.xmin)/state.cssW*110;
        list.push({type:'dynamic',point:{x:origin.x+d*Math.cos(rad),y:origin.y+d*Math.sin(rad)},label:'拖动橙色手柄旋转动直线'});
        if(m.showConic!==false)for(const point of api.intersections())list.push({type:'dynamic',point,label:'交点受约束：拖动以旋转过定点的直线'});
      }
      if(selection?.type==='line'&&[...m.lines||[],...m.objects||[]].includes(selection.line)&&visible(selection.line)&&selection.line.kind!=='through_points'){
        const projected=projection(selection.line);
        if(projected)list.unshift({type:'rotateLine',line:selection.line,...projected,point:projected.handle,label:'拖动旋转手柄改变直线倾角'});
      }
      return list;
    }
    function segmentDistance(p,a,b,infinite) {
      const dx=b.x-a.x,dy=b.y-a.y,l2=dx*dx+dy*dy;if(l2<1e-10)return Infinity;
      let t=((p.x-a.x)*dx+(p.y-a.y)*dy)/l2;if(!infinite)t=Math.max(0,Math.min(1,t));
      return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);
    }
    function hitTest(p,touch=false) {
      const threshold=touch?22:12;
      const candidates=handles().map(h=>({...h,distance:distance(p,xy(h.point.x,h.point.y))})).filter(h=>h.distance<threshold);
      if(candidates.length){candidates.sort((a,b)=>a.distance-b.distance);return candidates[0];}
      const native=api.nativeHit?.(p,touch);if(native)return native;
      const m=state.model;
      for(const line of [...m.objects||[],...m.lines||[]]){
        if(!visible(line)||!['line','slope','vertical','through_points'].includes(line.kind))continue;
        const ends=api.endpoints(line);if(!ends)continue;
        if(segmentDistance(p,xy(ends.a.x,ends.a.y),xy(ends.b.x,ends.b.y),line.infinite!==false)<threshold)
          return {type:'line',line,label:`拖动平移 ${line.label||'直线'}；选中后可拖动旋转手柄`};
      }
      if(m.showDynamic!==false&&visible({part:m.dynamicLinePart})){
        const o=api.lineOrigin(),rad=state.p.theta*Math.PI/180,a=xy(o.x,o.y),b=xy(o.x+Math.cos(rad),o.y+Math.sin(rad));
        if(segmentDistance(p,a,b,true)<threshold)return {type:'dynamic',label:'旋转动直线，保持通过题设定点'};
      }
      return null;
    }
    function begin(event) {
      if(!state.model||event.button>0||drag)return;
      const pos=screen(event),target=mode==='pan'?null:hitTest(pos,event.pointerType==='touch');
      if(target?.type==='native'&&!api.nativeBegin(target))return;
      api.picked?.(target);
      selection=target?.type==='rotateLine'?{type:'line',line:target.line}:target;
      drag={id:event.pointerId,pos,start:world(pos),before:snapshot(),view:clone(state.view),target,moved:false};
      if(target?.type==='line'){
        drag.line=clone(target.line);
        if(target.line.kind==='through_points'){
          drag.refs=[resolvePoint(target.line.a),resolvePoint(target.line.b)];
          drag.refStart=drag.refs.map(ref=>ref?.get());
          if(drag.refs.some(ref=>!ref)){hint('这条线由受约束的点确定，请拖动它的自由端点；中点、交点等会保持构造关系。');drag=null;return;}
        }
      }
      canvas.setPointerCapture(event.pointerId);canvas.style.cursor='grabbing';event.preventDefault();
      hint(target?.label||'拖动画布平移视野');api.render();
    }
    function move(event) {
      const pos=screen(event);
      if(!drag){if(state.model&&mode==='move'){const target=hitTest(pos,event.pointerType==='touch');canvas.style.cursor=target?'grab':'crosshair';}return;}
      if(event.pointerId!==drag.id)return;
      if(!drag.moved&&distance(pos,drag.pos)<3)return;
      drag.moved=true;event.preventDefault();
      const current=world(pos),dx=current.x-drag.start.x,dy=current.y-drag.start.y,t=drag.target,p=state.p,m=state.model;
      if(!t){const sx=(pos.x-drag.pos.x)/state.cssW*(drag.view.xmax-drag.view.xmin),sy=(pos.y-drag.pos.y)/state.cssH*(drag.view.ymax-drag.view.ymin);state.view={xmin:drag.view.xmin-sx,xmax:drag.view.xmax-sx,ymin:drag.view.ymin+sy,ymax:drag.view.ymax+sy};api.render();return;}
      const v={x:snapped(current.x),y:snapped(current.y)};
      if(t.type==='native')api.nativeMove(t,v,dx,dy);
      if(t.type==='point')m.points[t.name]=[v.x,v.y];
      if(t.type==='userPoint')Object.assign(t.obj,v);
      if(t.type==='circleCenter'){t.obj.h=v.x;t.obj.k=v.y;}
      if(t.type==='circleRadius')t.obj.r=Math.max(.05,distance(v,{x:t.obj.h,y:t.obj.k}));
      if(t.type==='objectConicCenter'){t.obj.h=v.x;t.obj.k=v.y;}
      if(t.type==='objectConicMajor')t.obj.a=Math.max(t.obj.conicType==='ellipse'?t.obj.b+.01:.05,Math.abs(t.obj.orientation==='vertical'?v.y-t.obj.k:v.x-t.obj.h));
      if(t.type==='objectConicMinor'){t.obj.b=Math.max(.05,Math.abs(t.obj.orientation==='vertical'?v.x-t.obj.h:v.y-t.obj.k));if(t.obj.conicType==='ellipse')t.obj.b=Math.min(t.obj.b,t.obj.a-.01);}
      if(t.type==='objectConicFocus'){const d=t.obj.orientation==='vertical'?v.y-t.obj.k:v.x-t.obj.h;t.obj.p=Math.max(.05,Math.abs(d));t.obj.direction=d<0?-1:1;}
      if(t.type==='center'){p.h=snapped(drag.before.p.h+dx);p.k=snapped(drag.before.p.k+dy);}
      if(t.type==='radius')p.r=Math.max(.05,distance(v,{x:p.h,y:p.k}));
      if(t.type==='major'){p.a=Math.max(m.type==='ellipse'?p.b+.01:.05,Math.abs(m.orientation==='vertical'?v.y-p.k:v.x-p.h));}
      if(t.type==='minor'){p.b=Math.max(.05,Math.abs(m.orientation==='vertical'?v.x-p.h:v.y-p.k));if(m.type==='ellipse')p.b=Math.min(p.b,p.a-.01);}
      if(t.type==='focus'){const d=m.orientation==='vertical'?v.y-p.k:v.x-p.h;p.p=Math.max(.05,Math.abs(d));p.direction=d<0?-1:1;}
      if(t.type==='dynamic'){
        const origin=api.lineOrigin();if(distance(origin,v)>.01){let angle=Math.atan2(v.y-origin.y,v.x-origin.x)*180/Math.PI;angle=((angle%180)+180)%180;p.theta=snap?Math.round(angle/5)*5:angle;}
      }
      if(t.type==='line'){
        const line=t.line,initial=drag.line;
        if(line.kind==='through_points'){drag.refs.forEach((ref,i)=>ref.set({x:snapped(drag.refStart[i].x+dx),y:snapped(drag.refStart[i].y+dy)}));}
        else if(initial.m==null)line.x=snapped(initial.x+dx);
        else line.b=snapped(initial.b+dy-initial.m*dx);
        if(line.userEquation)line.label=lineLabel(line);
      }
      if(t.type==='rotateLine'){
        if(distance(t.pivot,v)>.01)applyLine(t.line,t.pivot,Math.atan2(v.y-t.pivot.y,v.x-t.pivot.x));
      }
      state.exploring=true;
      hint(t.type==='line'||t.type==='rotateLine'?`${t.line.kind==='through_points'?t.line.label:lineLabel(t.line)}`:`${t.label} · (${fmt(v.x)}, ${fmt(v.y)})`);
      api.liveChanged();api.render();
    }
    function end(event,cancel=false) {
      if(!drag||drag.id!==event.pointerId)return;
      const previous=drag;drag=null;
      if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);
      canvas.style.cursor='crosshair';
      if(cancel){if(previous.target)restore(previous.before);else{state.view=previous.view;api.render();}hint('已取消这次拖动。');return;}
      if(previous.moved&&previous.target){record(previous.before);api.changed();api.render();hint('已更新方程与关联图形。Ctrl+Z 可撤销；原题解析保留原条件。');}
    }
    function draw() {
      if(!state.model||mode==='pan'||api.constructing?.())return;
      ctx.save();
      for(const h of handles()){
        const p=xy(h.point.x,h.point.y);if(p.x<0||p.y<0||p.x>state.cssW||p.y>state.cssH)continue;
        const color=h.type==='dynamic'?'#b7790e':'#356cb0';
        ctx.beginPath();ctx.arc(p.x,p.y,h.type==='dynamic'?7:6,0,Math.PI*2);ctx.fillStyle='#ffffff';ctx.fill();ctx.lineWidth=2;ctx.strokeStyle=color;ctx.stroke();
        ctx.beginPath();ctx.arc(p.x,p.y,2,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();
      }
      ctx.restore();
    }
    canvas.addEventListener('pointerdown',begin);
    canvas.addEventListener('pointermove',move);
    canvas.addEventListener('pointerup',e=>end(e));
    canvas.addEventListener('pointercancel',e=>end(e,true));
    $('undoDrag').addEventListener('click',undoAction);$('redoDrag').addEventListener('click',redoAction);
    $('moveMode').addEventListener('click',()=>{mode='move';$('moveMode').setAttribute('aria-pressed','true');$('panMode').setAttribute('aria-pressed','false');hint('拖点改坐标；拖直线平移，选中后拖手柄旋转；拖空白处移动视野。');api.render();});
    $('panMode').addEventListener('click',()=>{mode='pan';$('moveMode').setAttribute('aria-pressed','false');$('panMode').setAttribute('aria-pressed','true');hint('平移模式：可从画板任意位置拖动视野。');api.render();});
    $('snapDrag').addEventListener('change',e=>{snap=e.target.checked;});
    document.addEventListener('keydown',e=>{
      if(/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)||e.target.isContentEditable)return;
      if(document.querySelector('#dong-geogebra-dialog[open]'))return;
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redoAction():undoAction();}
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();redoAction();}
      if(e.key==='Escape'&&drag)end({pointerId:drag.id},true);
    });
    syncButtons();
    return {draw,checkpoint:snapshot,record,undo:undoAction,redo:redoAction,reset(){undo.length=0;redo.length=0;drag=null;selection=null;syncButtons();}};
  }};
})();
