(function(){
  'use strict';
  function attach(api){
    const find=selector=>document.querySelector(selector);
    const controls=document.createElement('section');controls.id='studyTools';controls.className='study-tools';controls.hidden=true;
    controls.innerHTML='<div class="study-mode-row"><label for="learningStyle">学习方式</label><select id="learningStyle"><option value="full">完整解析</option><option value="step">先思考 · 逐步提示</option></select></div><div class="lesson-actions"><button id="startClassroom">进入讲题模式</button><button id="printWorksheet">打印练习页</button></div><details id="studyNotes"><summary>我的思路与错题记录</summary><label for="studentAttempt">先写下你的尝试、卡住的步骤或错因</label><textarea id="studentAttempt" maxlength="12000" placeholder="例如：我能列出方程，但不确定斜率不存在时该怎么处理。"></textarea><label for="reviewState">掌握情况</label><select id="reviewState"><option value="new">尚未标记</option><option value="review">加入错题 · 需要复习</option><option value="mastered">已掌握</option></select><button id="reviewAttempt" class="button secondary">请 AI 点评我的思路</button><p class="help">笔记随题稿保存。AI 点评用于参考，不作为考试评分。</p></details>';
    find('#studyPane').prepend(controls);
    const castbar=document.createElement('div');castbar.id='classroomBar';castbar.hidden=true;
    castbar.innerHTML='<strong>讲题模式</strong><select id="classroomPart" aria-label="讲解的小问"></select><button id="previousStep">← 上一步</button><button id="nextStep">下一步 →</button><span id="classroomProgress"></span><button id="classroomAnswer">显示 / 隐藏结论</button><select id="lectureFont" aria-label="讲题字号"><option value="18">大字</option><option value="22">特大字</option><option value="26">投影大字</option></select><button id="inkToggle" aria-pressed="false">红笔批注</button><button id="undoInk">撤销批注</button><button id="clearInk">清除批注</button><button id="classroomFullscreen">全屏</button><button id="exitClassroom">退出 · Esc</button>';
    document.body.prepend(castbar);
    const ink=document.createElement('canvas');ink.id='classroomInk';ink.hidden=true;ink.setAttribute('aria-label','讲题屏幕批注');find('.canvas-wrap').append(ink);
    let casting=false,pen=false,strokes=[],activeStroke=null,solutionRef=null;
    const context=ink.getContext('2d');
    function study(){
      const solution=api.state.solution;if(!solution)return null;
      if(!solution.study||typeof solution.study!=='object'||Array.isArray(solution.study))solution.study={};
      const data=solution.study;
      if(!data.counts||typeof data.counts!=='object')data.counts={};
      if(!data.answers||typeof data.answers!=='object')data.answers={};
      return data;
    }
    function currentPart(){const parts=api.state.solution?.parts||[];return parts.find(part=>Number(part.index)===Number(api.state.activePart))||parts[0];}
    function persist(){api.remember();api.saveStudy();}
    function showInk(){
      const bounds=ink.getBoundingClientRect();if(bounds.width<=0||bounds.height<=0)return;
      const ratio=window.devicePixelRatio||1;ink.width=Math.round(bounds.width*ratio);ink.height=Math.round(bounds.height*ratio);context.setTransform(ratio,0,0,ratio,0,0);
      for(const stroke of strokes){if(!stroke.length)continue;context.beginPath();context.moveTo(stroke[0][0]*bounds.width,stroke[0][1]*bounds.height);for(const point of stroke.slice(1))context.lineTo(point[0]*bounds.width,point[1]*bounds.height);context.strokeStyle='#d92835';context.lineWidth=3;context.lineCap='round';context.lineJoin='round';context.stroke();}
    }
    function updateCastBar(){
      const part=currentPart(),data=study();if(!part||!data)return;
      find('#classroomPart').replaceChildren(...api.state.solution.parts.map(item=>{const option=document.createElement('option');option.value=item.index;option.textContent=item.label;return option;}));
      find('#classroomPart').value=String(part.index);
      const count=Math.min(part.steps.length,Math.max(0,Number(data.counts[part.index])||0));
      find('#classroomProgress').textContent=`${count} / ${part.steps.length} 步`;
      find('#previousStep').disabled=count===0;find('#nextStep').disabled=count>=part.steps.length;
    }
    function changeStep(delta){
      const part=currentPart(),data=study();if(!part||!data)return;
      data.mode='step';data.counts[part.index]=Math.max(0,Math.min(part.steps.length,(Number(data.counts[part.index])||0)+delta));
      api.renderSolution();persist();
      const shown=[...document.querySelectorAll('#solution .part-body li:not([hidden])')].at(-1);if(casting)shown?.scrollIntoView({block:'nearest'});
    }
    function answerToggle(){const part=currentPart(),data=study();if(!part||!data)return;data.answers[part.index]=!data.answers[part.index];api.renderSolution();persist();}
    function leave(){casting=false;pen=false;document.body.classList.remove('classroom-mode');castbar.hidden=true;ink.hidden=true;ink.style.pointerEvents='none';find('#inkToggle').setAttribute('aria-pressed','false');if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});api.render();}
    function enter(){
      if(!api.state.solution){api.setStatus('请先载入本题解析。',true);return;}
      const part=currentPart();api.state.activePart=part.index;const data=study();data.mode='step';data.counts={};data.answers={};
      casting=true;document.body.classList.add('classroom-mode');castbar.hidden=false;ink.hidden=false;ink.style.pointerEvents='none';
      api.showLearning();api.renderSolution();api.refreshLayers();api.render();updateCastBar();requestAnimationFrame(showInk);persist();
    }
    function decorate(){
      const solution=api.state.solution,data=study();controls.hidden=!solution;
      if(!solution){if(casting)leave();return;}
      if(solution!==solutionRef){solutionRef=solution;strokes=[];showInk();}
      const stepped=data.mode==='step';find('#learningStyle').value=stepped?'step':'full';
      find('#studentAttempt').value=typeof data.notes==='string'?data.notes:'';
      find('#reviewState').value=['review','mastered'].includes(data.review)?data.review:'new';
      const panel=find('#solution');panel.classList.toggle('step-learning',stepped);
      if(stepped){const title=panel.querySelector(':scope > h3');if(title)title.textContent='先独立思考，再逐步展开';}
      panel.querySelectorAll('.part-body').forEach(section=>{
        const index=section.dataset.partIndex;
        const steps=[...section.querySelectorAll('ol>li')];
        const count=Math.min(steps.length,Math.max(0,Number(data.counts[index])||0));
        steps.forEach((step,position)=>step.hidden=stepped&&position>=count);
        section.querySelector('.answer-summary').hidden=stepped&&!data.answers[index];
        if(!stepped)return;
        const navigation=document.createElement('div');navigation.className='step-navigation';
        const caption=document.createElement('span');caption.textContent=`已展开 ${count} / ${steps.length} 步`;
        const next=document.createElement('button');next.textContent=count===0?'给我第一步提示':'展开下一步';next.disabled=count>=steps.length;
        next.addEventListener('click',()=>{data.counts[index]=count+1;api.renderSolution();persist();});
        const answer=document.createElement('button');answer.textContent=data.answers[index]?'隐藏结论':'显示结论';answer.addEventListener('click',()=>{data.answers[index]=!data.answers[index];api.renderSolution();persist();});
        const reset=document.createElement('button');reset.textContent='重新尝试';reset.addEventListener('click',()=>{data.counts[index]=0;data.answers[index]=false;api.renderSolution();persist();});
        navigation.append(caption,next,answer,reset);section.insertBefore(navigation,section.querySelector('ol'));
      });
      updateCastBar();
    }
    find('#learningStyle').addEventListener('change',event=>{const data=study();if(!data)return;data.mode=event.target.value;api.renderSolution();persist();});
    find('#studentAttempt').addEventListener('input',event=>{const data=study();if(data){data.notes=event.target.value;persist();}});
    find('#reviewState').addEventListener('change',event=>{const data=study();if(data){data.review=event.target.value;persist();}});
    find('#reviewAttempt').addEventListener('click',()=>{const notes=study()?.notes?.trim();if(!notes){api.setStatus('请先写下你的解题尝试或卡住的地方。',true);return;}find('#followupInput').value='请点评我的解题思路，指出第一处错误或需要补充的依据，先给改进提示，不直接重写完整答案。我的尝试：\n'+notes;find('#followupInput').focus();find('#followupInput').scrollIntoView({block:'nearest'});api.sendFeedback();});
    find('#startClassroom').addEventListener('click',enter);find('#exitClassroom').addEventListener('click',leave);
    find('#previousStep').addEventListener('click',()=>changeStep(-1));find('#nextStep').addEventListener('click',()=>changeStep(1));find('#classroomAnswer').addEventListener('click',answerToggle);
    find('#classroomPart').addEventListener('change',event=>{api.state.activePart=Number(event.target.value);api.renderSolution();api.refreshLayers();api.render();persist();});
    find('#lectureFont').addEventListener('change',event=>document.body.style.setProperty('--lecture-font',event.target.value+'px'));
    find('#classroomFullscreen').addEventListener('click',()=>{if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});else document.documentElement.requestFullscreen().catch(()=>api.setStatus('浏览器未允许全屏，讲题布局仍可使用。'));});
    find('#inkToggle').addEventListener('click',()=>{pen=!pen;ink.style.pointerEvents=pen?'auto':'none';find('#inkToggle').setAttribute('aria-pressed',String(pen));api.setStatus(pen?'红笔为屏幕批注，不改变几何对象；关闭红笔后可拖动图形。':'已返回图形拖动。');});
    find('#undoInk').addEventListener('click',()=>{strokes.pop();showInk();});find('#clearInk').addEventListener('click',()=>{strokes=[];showInk();});
    const inkPoint=event=>{const bounds=ink.getBoundingClientRect();return[(event.clientX-bounds.left)/bounds.width,(event.clientY-bounds.top)/bounds.height];};
    ink.addEventListener('pointerdown',event=>{if(!pen)return;event.preventDefault();ink.setPointerCapture(event.pointerId);activeStroke=[inkPoint(event)];strokes.push(activeStroke);});
    ink.addEventListener('pointermove',event=>{if(activeStroke){activeStroke.push(inkPoint(event));showInk();}});
    ink.addEventListener('pointerup',()=>{activeStroke=null;});ink.addEventListener('pointercancel',()=>{activeStroke=null;});
    window.addEventListener('resize',()=>requestAnimationFrame(showInk));
    document.addEventListener('keydown',event=>{if(!casting||/INPUT|TEXTAREA|SELECT/.test(event.target.tagName)||event.target.isContentEditable||document.querySelector('dialog[open]'))return;if(event.key==='Escape'){leave();return;}if(['ArrowRight','PageDown'].includes(event.key)){event.preventDefault();changeStep(1);}if(['ArrowLeft','PageUp'].includes(event.key)){event.preventDefault();changeStep(-1);}});
    find('#printWorksheet').addEventListener('click',()=>{const solution=api.state.solution;if(!solution)return;const target=find('#printLesson');target.replaceChildren();const title=document.createElement('h1');title.textContent='董解析 · 独立练习';const name=document.createElement('p');name.textContent='姓名：________________　班级：________________　日期：________________';const problem=document.createElement('div');problem.textContent=solution.restatement;problem.style.whiteSpace='pre-wrap';const space=document.createElement('div');space.className='worksheet-space';space.textContent='作答区';target.append(title,name,problem,space);window.print();});
    return {decorate,leave};
  }
  window.DongClassroom={attach};
})();
