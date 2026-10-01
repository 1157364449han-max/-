/* Native canvas projection of actual rotated 3D coordinates, no remote assets. */
(()=>{
  'use strict';
  function attach(api){
    const shell=document.querySelector('.board-shell'),wrap=shell.querySelector('.canvas-wrap');
    let spec=null,key='',currentPart=null,folded=true,yaw=.55,pitch=.62,pointer=null;
    const controls=document.createElement('section');controls.className='fold-controls';controls.hidden=true;
    controls.innerHTML='<div class="fold-switch"><button type="button" data-fold-mode="flat">平面图</button><button type="button" data-fold-mode="folded">折叠图（空间）</button></div><label>动直线倾角 θ <input id="foldTheta" type="range" min="0" max="180" step="0.5" value="45"><output id="foldThetaValue"></output></label><div id="foldReadout" role="status"></div>';
    const overlay=document.createElement('div');overlay.className='fold-space';overlay.hidden=true;
    const canvas=document.createElement('canvas');canvas.id='foldCanvas';canvas.setAttribute('aria-label','圆沿 x 轴折叠后的空间示意图，可拖动旋转视角');overlay.append(canvas);
    const hint=document.createElement('p');hint.className='fold-hint';hint.textContent='拖动旋转视角 · 滑块改变弦 · 空间投影不表示实际长度';overlay.append(hint);
    wrap.before(controls);wrap.append(overlay);
    const range=controls.querySelector('input'),readout=controls.querySelector('#foldReadout');
    const typeset=()=>window.renderMathInElement?.(readout,{delimiters:[{left:'$',right:'$',display:false}],throwOnError:false,trust:false,maxExpand:100});
    const same=()=>api.state.model?.type==='circle'&&Math.abs(api.state.p.h-spec.h)<1e-8&&Math.abs(api.state.p.k)<1e-8&&Math.abs(api.state.p.r**2-spec.r2)<1e-8&&api.state.model.lineThrough==='point:O'&&api.state.model.dynamicIntersectionLabels?.join('')===spec.names.M+spec.names.N;
    function switchMode(value){folded=value;overlay.hidden=!value;shell.classList.toggle('fold-active',value);controls.querySelectorAll('[data-fold-mode]').forEach(b=>b.setAttribute('aria-pressed',String((b.dataset.foldMode==='folded')===value)));draw();}
    controls.querySelectorAll('button').forEach(button=>button.onclick=()=>switchMode(button.dataset.foldMode==='folded'));
    range.oninput=()=>{if(!spec)return;if(same()){api.state.p.theta=Number(range.value);api.render();api.remember();}draw();};
    function refresh(){
      if(!spec||controls.hidden)return;
      if(same()&&Number.isFinite(api.state.p.theta))range.value=String(((api.state.p.theta%180)+180)%180);
      draw();
    }
    function mount(solution){
      // Re-extract original conditions: an imported notebook cannot inject 3D coordinates.
      const candidate=solution?.foldGeometry&&window.DongCircleFold.infer(solution.restatement);
      if(!candidate){spec=null;key='';controls.hidden=true;overlay.hidden=true;shell.classList.remove('fold-active');return;}
      const next=JSON.stringify([candidate.h,candidate.r2,candidate.alpha,candidate.names,solution.restatement]);
      if(next!==key){spec=candidate;key=next;range.value='45';yaw=.55;pitch=.62;currentPart=null;folded=true;}
      controls.hidden=false;
      const part=api.state.activePart;
      if(part!==currentPart){currentPart=part;folded=part==null||Number(part)===spec.indices[2];}
      switchMode(folded);refresh();
    }
    function draw(){
      if(!spec)return;
      const theta=Number(range.value)*Math.PI/180,g=window.DongCircleFold.geometry(spec,theta);
      if(!g)return;
      controls.querySelector('output').textContent=Number(range.value)+'°';
      const bounds=`$${window.DongNumber.tex(Math.sqrt(spec.lo2))}<|${spec.names.M+spec.names.N}|<${window.DongNumber.tex(2*Math.sqrt(spec.r2))}$`;
      readout.textContent=`二面角 $\\alpha=${window.DongNumber.tex(spec.alpha)}$；理论范围 ${bounds}。当前位置读数：|${spec.names.M+spec.names.N}| ≈ ${g.length.toFixed(5)}。`+(g.admissible?'':' 当前为排除的极限位置，不是可取的最值。')+(!same()?' 此空间图仍使用原题圆；平面模型已改动，未套用原题结论。':'');typeset();
      controls.dataset.admissible=String(g.admissible);
      if(overlay.hidden)return;
      const width=wrap.clientWidth,height=wrap.clientHeight;if(width<1||height<1)return;
      const dpr=Math.min(devicePixelRatio||1,2);canvas.width=width*dpr;canvas.height=height*dpr;
      const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
      ctx.fillStyle='#f5fafc';ctx.fillRect(0,0,width,height);
      const radius=Math.sqrt(spec.r2),scale=Math.min(width*.36,height*.34)/(radius+Math.abs(spec.h)*.25);
      function project([x,y,z]){x-=spec.h;const X=x*Math.cos(yaw)-y*Math.sin(yaw),Y=x*Math.sin(yaw)+y*Math.cos(yaw);return[width/2+scale*X,height*.52+scale*(Y*Math.sin(pitch)-z*Math.cos(pitch))];}
      function path(points,color,fill=false,dashed=false){ctx.beginPath();points.forEach((p,i)=>{const [x,y]=project(p);if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);});ctx.strokeStyle=color;ctx.lineWidth=2;ctx.setLineDash(dashed?[5,5]:[]);if(fill){ctx.closePath();ctx.fillStyle=color;ctx.fill();}else ctx.stroke();ctx.setLineDash([]);}
      const half=upper=>Array.from({length:81},(_,i)=>{const t=(upper?0:Math.PI)+i*Math.PI/80,x=spec.h+radius*Math.cos(t),y=radius*Math.sin(t);return upper?[x,y*Math.cos(Math.PI-spec.alpha),y*Math.sin(Math.PI-spec.alpha)]:[x,y,0];});
      for(const upper of [false,true]){const pts=half(upper);path(pts,upper?'rgba(57,118,209,.15)':'rgba(15,159,153,.13)',true);path(pts,upper?'#3976d1':'#0f9f99');}
      path([[spec.h-radius-.4,0,0],[spec.h+radius+.4,0,0]],'#6d7f91');
      const O=[0,0,0];path([g.points.M,O,g.points.N],'#d09c41',false,true);path([g.points.M,g.points.N],g.admissible?'#d34c72':'#9b9b9b');
      path([g.flatN,g.points.N],'#a2afbd',false,true);
      const arc=Array.from({length:41},(_,i)=>{const a=Math.PI-i*spec.alpha/40,ar=radius*.22;return[0,ar*Math.cos(a),ar*Math.sin(a)];});path(arc,'#9460b9');
      const labels=[['O',O],[spec.names.A,[...spec.fixed[spec.names.A],0]],[spec.names.curve,[spec.h,0,0]],[spec.names.M,g.points.M],[spec.names.N,g.points.N]];
      ctx.font='bold 14px system-ui';for(const [name,p] of labels){const [x,y]=project(p);ctx.beginPath();ctx.arc(x,y,4.5,0,Math.PI*2);ctx.fillStyle='#1d425b';ctx.fill();ctx.fillStyle='#fff';ctx.fillRect(x+6,y-21,ctx.measureText(name).width+6,20);ctx.fillStyle='#173f58';ctx.fillText(name,x+9,y-6);}
      const edge=project([spec.h+radius+.4,0,0]);ctx.fillText('x 轴（折轴）',Math.min(width-100,edge[0]-20),edge[1]+22);
      overlay.dataset.length=String(g.length);overlay.dataset.coordinates=JSON.stringify(g.points);
    }
    canvas.addEventListener('pointerdown',event=>{pointer={id:event.pointerId,x:event.clientX,y:event.clientY};canvas.setPointerCapture(event.pointerId);});
    canvas.addEventListener('pointermove',event=>{if(pointer?.id!==event.pointerId)return;yaw+=(event.clientX-pointer.x)*.008;pitch=Math.max(.1,Math.min(1.4,pitch+(event.clientY-pointer.y)*.006));pointer.x=event.clientX;pointer.y=event.clientY;draw();});
    const stop=()=>{pointer=null;};canvas.addEventListener('pointerup',stop);canvas.addEventListener('pointercancel',stop);canvas.addEventListener('lostpointercapture',stop);
    new ResizeObserver(()=>draw()).observe(wrap);
    return{mount,refresh};
  }
  window.DongCircleFoldView={attach};
})();
