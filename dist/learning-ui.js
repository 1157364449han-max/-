(function () {
  'use strict';
  const escapeText = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  const textBlock = value => `<div class="math-content">${escapeText(window.DongMathInput?.prepare(value)??value).replace(/\*\*([^*\n]+)\*\*/g,'<strong>$1</strong>')}</div>`;
  const statusNames = {answered:'已生成完整作答',partial:'尚未完整解答',needs_information:'需要补充条件'};
  const verificationNames = {generated:'仅生成 · 待核验','locally-verified':'局部代数核验通过',conflict:'发现确定性冲突','fully-verified':'完整验证通过'};
  const checkNames = {verified:'通过',contradicted:'冲突',unresolved:'未决'};
  const hasUncertainty = value => /\[(?:看不清|模糊|无法辨认|不确定)[^\]]*\]|(?:看不清|无法辨认)处|[?？]{3,}/i.test(String(value||''));
  function typeset(element) {
    if (!window.renderMathInElement) return;
    window.renderMathInElement(element, {delimiters:[{left:'$$',right:'$$',display:true},{left:'\\[',right:'\\]',display:true},{left:'\\(',right:'\\)',display:false},{left:'$',right:'$',display:false}],throwOnError:false,trust:false,strict:'ignore',maxExpand:300,maxSize:20});
  }
  function lessonText(solution) {
    return [solution.title,solution.restatement,solution.strategy,...(solution.parts||[]).flatMap(part=>[part.label,part.answer,...(part.steps||[])]),solution.verification?.message].filter(Boolean).join('\n\n');
  }
  function attach(api) {
    const find = selector => document.querySelector(selector);
    const runtime = window.DongRuntime;
    const notebookKey = 'dongjiexi:notebook:v1';
    const draftKey = 'dongjiexi:draft:v1';
    const modelKey = 'dongjiexi:model';
    let activeJob = null;
    let processing = false;
    let imageURL = null;
    let draftTimer = null;
    let lastModel = localStorage.getItem(modelKey) || '';
    let engineReady = false;
    let cloudPrimary = false;
    let visionAvailable = true;
    let selectedImage = null;
    let ocrScriptPromise = null;
    function loadBrowserOcr() {
      if (window.Tesseract) return Promise.resolve(window.Tesseract);
      if (!ocrScriptPromise) ocrScriptPromise = new Promise((resolve,reject)=>{
        const script=document.createElement('script');
        script.src='https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js';
        script.onload=()=>window.Tesseract?resolve(window.Tesseract):reject(new Error('OCR 组件加载失败。'));
        script.onerror=()=>reject(new Error('无法加载浏览器 OCR 组件，请检查网络，或直接输入题目。'));
        document.head.append(script);
      }).catch(error=>{ocrScriptPromise=null;throw error;});
      return ocrScriptPromise;
    }
    async function preprocessOcrImage(file) {
      const bitmap=await createImageBitmap(file);
      try {
        const longest=Math.max(bitmap.width,bitmap.height),scale=Math.min(3,Math.min(2400,Math.max(1800,longest))/longest);
        const canvas=document.createElement('canvas');
        canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);
        const ctx=canvas.getContext('2d',{willReadFrequently:true});
        ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
        const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);
        for(let i=0;i<pixels.data.length;i+=4){
          const grey=.299*pixels.data[i]+.587*pixels.data[i+1]+.114*pixels.data[i+2];
          const enhanced=Math.max(0,Math.min(255,(grey-128)*1.45+128));
          pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=enhanced;
        }
        ctx.putImageData(pixels,0,0);
        return canvas;
      } finally {bitmap.close();}
    }
    const inspector=find('.inspect');
    const studyPane=document.createElement('div');studyPane.id='studyPane';
    studyPane.append(find('#solution'),find('#followupPanel'));
    const switcher=document.createElement('div');switcher.className='inspector-switch';switcher.hidden=true;
    switcher.innerHTML='<button data-inspector-view="lesson" aria-pressed="true">解析 / 追问</button><button data-inspector-view="geometry" aria-pressed="false">参数 / 图层</button>';
    const inspectorHeading=find('.inspect-heading');
    if(inspectorHeading)inspectorHeading.after(switcher,studyPane);else inspector.prepend(switcher,studyPane);
    let inspectorView='geometry',lastSolution=null,classroom=null;
    function setInspectorView(view){
      inspectorView=view;
      studyPane.hidden=view!=='lesson'||!api.state.solution;
      find('.inspect-grid').hidden=view==='lesson'&&!!api.state.solution;
      switcher.hidden=!api.state.solution;
      switcher.querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.inspectorView===view)));
    }
    switcher.querySelectorAll('button').forEach(button=>button.addEventListener('click',()=>setInspectorView(button.dataset.inspectorView)));
    const request = (url, body) => runtime.request(url, body);
    const report = error => api.setStatus(error.message||String(error),true);
    function renderChat() {
      const solution=api.state.solution;
      find('#followupPanel').hidden=!solution||solution.mode!=='local-ollama';
      const conversation=solution?.conversation||[];
      find('#chatMessages').innerHTML=conversation.map(item=>`<div class="chat-bubble ${item.role==='user'?'user':'assistant'}"><strong>${item.role==='user'?'我的追问':'AI 解答'}</strong>${textBlock(item.content)}</div>`).join('');
      typeset(find('#chatMessages'));
    }
    function markup(solution, all=false) {
      const parts=Array.isArray(solution.parts)&&solution.parts.length?solution.parts:[{index:0,label:'完整题目',answer:solution.answer,steps:solution.steps||[],status:'partial'}];
      const active=api.state.activePart;
      const visible=all||active==null?parts:parts.filter(part=>Number(part.index)===Number(active));
      const tabs=!all&&parts.length>1?`<div class="part-tabs"><button data-study-part="all" class="part-tab${active==null?' active':''}">全部解析 / 图层</button>${parts.map(part=>`<button data-study-part="${escapeText(part.index)}" class="part-tab${active!=null&&Number(active)===Number(part.index)?' active':''}">${escapeText(part.label)}</button>`).join('')}</div>`:'';
      const report=solution.verification||{status:'generated',message:'尚未核验',checks:[]};
      const summary=solution.completion?`逐问作答：${solution.completion.answered} / ${solution.completion.total}`:solution.mode==='symbolic-fallback'?'内置确定性解题结果':'解题结果';
      const stale=api.question.value.trim()!==String(solution.restatement||'').trim()?'<p class="stale-question">输入框已修改，以下解析仍对应下方保存的原题。请重新解答以更新。</p>':'';
      const counts=report.counts||{};
      const trust=`<div class="trust-summary ${escapeText(report.status||'generated')}"><strong>${escapeText(verificationNames[report.status]||'核验状态未知')}</strong><span>通过 ${Number(counts.verified)||0} · 冲突 ${Number(counts.contradicted)||0} · 未决 ${Number(counts.unresolved)||0}</span></div>`;
      const model=solution.problemModel;
      const modelDetails=model?`<details class="problem-model"><summary>结构化题目模型 · ${model.curve?escapeText(model.curve.kind):'曲线未确定'} · ${model.parts?.length||0} 问</summary><p>输入确认：${model.source?.confirmed?'已确认':'存在模糊字段'}；点 ${model.points?.length||0} 个；直线 ${model.lines?.length||0} 条。</p>${model.source?.ambiguities?.length?`<p class="verification-conflict">未确认：${escapeText(model.source.ambiguities.join('、'))}</p>`:''}</details>`:'';
      const checkList=(part)=>{const checks=(report.checks||[]).filter(item=>item.part==null||Number(item.part)===Number(part.index));if(!checks.length)return '';return `<details class="verification-details"><summary>查看本问机器核验（${checks.length} 项）</summary><ul>${checks.map(item=>`<li class="check-${escapeText(item.status)}"><strong>${escapeText(checkNames[item.status]||item.status)}</strong> · ${escapeText(item.label)}：${escapeText(item.detail)}${item.formula?textBlock('$'+item.formula+'$'):''}</li>`).join('')}</ul></details>`;};
      const partMarkup=visible.map(part=>{const partTrust=part.verification||{status:'generated',message:'仅生成'};const derivation=part.derivation||{};const obligations=derivation.proof_obligations||[];return `<section class="part-body" data-part-index="${escapeText(part.index)}"><h3>${escapeText(part.label||'本问')}</h3><span class="answer-status ${['answered','partial','needs_information'].includes(part.status)?part.status:'partial'}">${escapeText(statusNames[part.status]||'请核对解答')}</span><span class="verification-status ${escapeText(partTrust.status||'generated')}">${escapeText(verificationNames[partTrust.status]||partTrust.message||'待核验')}</span><div class="answer-summary">${textBlock(part.answer)}</div><ol>${(part.steps||[]).map(step=>'<li>'+textBlock(step)+'</li>').join('')}</ol>${obligations.length?`<details class="proof-obligations"><summary>尚需完成的证明义务（${obligations.length}）</summary><ul>${obligations.map(item=>'<li>'+textBlock(item)+'</li>').join('')}</ul></details>`:''}${checkList(part)}</section>`;}).join('');
      return `<h3>${escapeText(solution.title||'解题结果')}</h3><p>${escapeText(summary)}${solution.model?' · '+escapeText(solution.model):''}</p>${trust}${stale}<details><summary>查看原题</summary>${textBlock(solution.restatement)}</details>${modelDetails}${tabs}${solution.knowns?.length?`<details><summary>已知条件</summary><ul>${solution.knowns.map(value=>'<li>'+textBlock(value)+'</li>').join('')}</ul></details>`:''}${solution.strategy?`<div class="method-overview"><p><strong>解题方法</strong></p>${textBlock(solution.strategy)}</div>`:''}${partMarkup}${solution.assumptions?.length?`<p class="lesson-assumptions">使用的假设：${escapeText(solution.assumptions.join('；'))}</p>`:''}<div class="proof">${escapeText(report.message||'尚未核验')}${solution.scene_notice?'<p>'+escapeText(solution.scene_notice)+'</p>':''}</div>`;
    }
    function bindTabs(element) {
      element.querySelectorAll('[data-study-part]').forEach(button=>button.addEventListener('click',()=>{
        api.state.activePart=button.dataset.studyPart==='all'?null:Number(button.dataset.studyPart);
        renderSolution();api.refreshLayers();api.render();api.remember();
      }));
    }
    function renderSolution() {
      const solution=api.state.solution;
      if(solution!==lastSolution){lastSolution=solution;inspectorView=solution?.mode==='local-ollama'?'lesson':'geometry';inspector.scrollTop=0;}
      setInspectorView(inspectorView);
      if(!solution){find('#solution').hidden=true;renderChat();classroom?.decorate();return;}
      const panel=find('#solution');
      panel.innerHTML=`<div class="lesson-actions"><button data-lesson-action="read">展开解析</button><button data-lesson-action="copy">复制解析</button><button data-lesson-action="print">打印 / PDF</button><button data-lesson-action="save">保存本题</button></div>`+markup(solution);
      panel.hidden=false;bindTabs(panel);typeset(panel);renderChat();classroom?.decorate();
      panel.querySelectorAll('[data-lesson-action]').forEach(button=>button.addEventListener('click',async()=>{
        try{
          if(button.dataset.lessonAction==='read'){find('#readingContent').innerHTML='<section class="solution">'+markup(solution,true)+'</section>';typeset(find('#readingContent'));find('#readingDialog').showModal();}
          if(button.dataset.lessonAction==='copy'){await navigator.clipboard.writeText(lessonText(solution));api.setStatus('完整解析已复制。');}
          if(button.dataset.lessonAction==='save')saveLesson();
          if(button.dataset.lessonAction==='print')printLesson();
        }catch(error){report(error);}
      }));
    }
    function busy(value) {
      processing=value;
      ['solveButton','recognizeButton','sendFollowup','pullModel','parseButton','clearButton','saveLesson','openNotebook','confirmRecognition','engineRefresh','reviewAttempt'].forEach(identifier=>{const button=find('#'+identifier);if(button)button.disabled=value;});
      if(!value&&!runtime.config.apiEnabled)find('#engineRefresh').disabled=true;
      find('#jobPanel').hidden=!value;
      find('#solveButton').textContent=value?'正在处理…':'一站式解题';
    }
    async function refreshEngine(start=false) {
      const remote=runtime.config.deployment==='web'||!!runtime.config.apiBase;
      const notice=find('#deploymentNotice');
      notice.hidden=false;
      notice.textContent=remote?'内置确定性解题与画板无需另装模型；配置在线服务后可继续增强开放题推理。':'内置确定性解题无需下载模型；本机模型仅用于尚未覆盖的开放题增强。';
      if(!runtime.config.apiEnabled){
        engineReady=false;
        find('#cloudVisionChoice').hidden=true;
        find('#engineStatus').classList.remove('ready');
        find('#engineStatus').textContent='内置解题与离线画板已就绪 · 开放题智能增强未配置';
        find('#pullModel').hidden=true;
        find('#solveButton').disabled=processing;
        find('#engineRefresh').disabled=true;
        return;
      }
      const needsLogin=remote&&runtime.config.requiresAuth&&!runtime.hasSession();
      find('#cloudAuth').hidden=!remote||!runtime.config.requiresAuth;
      if(needsLogin){
        engineReady=false;
        find('#cloudVisionChoice').hidden=true;
        find('#engineStatus').classList.remove('ready');
        find('#engineStatus').textContent='在线解题需要授权 · 请输入访问口令';
        find('#pullModel').hidden=true;
        find('#solveButton').disabled=processing;
        find('#engineRefresh').disabled=true;
        return;
      }
      try{
        if(start&&!remote)await request('/api/ai/start',{});
        const data=await request('/api/health');
        cloudPrimary=data.engine.remote===true;
        visionAvailable=data.engine.vision!==false;
        find('#cloudVisionChoice').hidden=!(remote&&visionAvailable&&data.engine.available);
        const names=data.engine.models||[];
        const choices=remote?[...names]:[...new Set([...names,data.default_model||'qwen3.5:4b','qwen3.5:9b'])];
        const select=find('#modelName');
        const chosen=lastModel||select.value||data.default_model;
        select.replaceChildren(...choices.map(name=>{const option=document.createElement('option');option.value=name;option.textContent=name+(remote?' · 云端服务':names.includes(name)?' · 已下载':' · 未下载');return option;}));
        select.value=choices.includes(chosen)?chosen:(names[0]||choices[0]);
        const selectedReady=data.engine.available&&names.includes(select.value);
        engineReady=selectedReady;
        find('#engineStatus').classList.toggle('ready',selectedReady);
        find('#engineStatus').textContent=selectedReady?(remote?'内置解题 + 在线智能增强已就绪':'内置解题 + 可选本机智能增强已就绪'):data.engine.available?(remote?'内置解题可用 · 在线增强模型未选择':'内置解题可用 · 可选择已安装模型增强'):data.engine.installed?'内置解题可用 · 智能增强组件可选':remote?'内置解题可用 · 在线增强暂不可用':'内置解题已就绪 · 无需安装额外模型';
        find('#pullModel').hidden=remote||cloudPrimary||selectedReady;
        find('#engineSetup').hidden=false;
      }catch(error){engineReady=false;find('#cloudVisionChoice').hidden=true;find('#engineStatus').classList.remove('ready');find('#engineStatus').textContent=remote?'内置浏览器解题可用；在线增强暂不可用。':'无法连接本机服务；浏览器内置解题仍可使用。';find('#solveButton').disabled=processing;if(start)report(error);}
    }
    async function runJob(body,done) {
      if(activeJob)return;
      activeJob='pending';find('#cancelJob').disabled=true;
      busy(true);find('#jobPhase').textContent='正在连接解题引擎…';
      try{
        const job=await request('/api/jobs',body);
        activeJob=job.id;
        find('#cancelJob').disabled=false;
        let current=job;
        while(current.status==='running'||current.status==='cancelling'){
          find('#jobPhase').textContent=`${current.phase} · ${current.elapsed||0} 秒`;
          await new Promise(resolve=>setTimeout(resolve,800));
          current=await request('/api/jobs/'+job.id);
        }
        if(current.status==='failed')throw new Error(current.error||'解题任务未完成。');
        if(current.status==='cancelled'){api.setStatus('任务已停止，已有题目和解析仍保留。');return;}
        await done(current.result);
      }catch(error){report(error);}
      finally{activeJob=null;busy(false);refreshEngine();}
    }
    function snapshot() {
      return {format:'dongjiexi-lesson',version:1,id:crypto.randomUUID(),savedAt:new Date().toISOString(),title:api.state.solution?.title||api.question.value.slice(0,32)||'未命名图稿',question:api.question.value,scene:api.state.model?api.sceneData():null,solution:api.state.solution||null,activePart:api.state.activePart,exploring:!!api.state.exploring};
    }
    function readNotebook(){try{const entries=JSON.parse(localStorage.getItem(notebookKey)||'[]');return Array.isArray(entries)?entries:[];}catch{return [];}}
    function readDraft(){
      try{
        const draft=JSON.parse(localStorage.getItem(draftKey)||'null');
        return draft&&typeof draft.question==='string'&&draft.question.length<=18000?draft:null;
      }catch{return null;}
    }
    function renderDraftRecovery(){
      const box=find('#draftRecovery'),draft=readDraft();
      if(!box||!draft||api.question.value.trim())return;
      box.replaceChildren();
      const message=document.createElement('span');
      const savedAt=Number.isFinite(Date.parse(draft.savedAt||''))?new Date(draft.savedAt).toLocaleString():'刚刚';
      message.textContent=`发现上次未完成的题目草稿（${savedAt}），是否恢复？`;
      const restore=document.createElement('button');restore.type='button';restore.textContent='恢复草稿';
      restore.onclick=()=>{api.question.value=draft.question;localStorage.removeItem(draftKey);box.hidden=true;api.remember();api.setStatus('已恢复上次编辑的题目草稿。');};
      const discard=document.createElement('button');discard.type='button';discard.textContent='删除草稿';
      discard.onclick=()=>{localStorage.removeItem(draftKey);box.hidden=true;};
      box.append(message,restore,discard);box.hidden=false;
    }
    function saveDraft(){
      const question=api.question.value;
      if(!question.trim()){localStorage.removeItem(draftKey);return;}
      try{localStorage.setItem(draftKey,JSON.stringify({question,savedAt:new Date().toISOString()}));}catch{}
    }
    function saveLesson(silent=false) {
      if(!api.question.value.trim()&&!api.state.model)throw new Error('请先输入题目或建立图形。');
      const record=snapshot();
      const entries=readNotebook().filter(item=>item.question!==record.question);
      const combined=[record,...entries].slice(0,50);
      try{localStorage.setItem(notebookKey,JSON.stringify(combined));}catch{throw new Error('题本空间不足，当前结果仍在页面中；请导出题稿保存。');}
      try{localStorage.removeItem(draftKey);}catch{}
      const draftBox=find('#draftRecovery');if(draftBox)draftBox.hidden=true;
      if(!silent)api.setStatus('本题、全部解析和图形已存入“我的题本”。');
      renderNotebook();
    }
    function restoreLesson(record) {
      if(record.format!=='dongjiexi-lesson'||record.version!==1||typeof record.question!=='string'||record.question.length>18000)throw new Error('不是支持的董解析题稿。');
      if(record.solution&&(!Array.isArray(record.solution.parts)||record.solution.parts.length>12||record.solution.parts.some(part=>!part||!Array.isArray(part.steps)||part.steps.length>100)))throw new Error('解析数据格式不完整。');
      if(record.solution){
        for(const field of ['knowns','assumptions','conversation'])if(record.solution[field]!=null&&!Array.isArray(record.solution[field]))throw new Error('解析数据格式无效。');
        if(record.solution.parts.some(part=>part.steps.some(step=>typeof step!=='string')))throw new Error('推导步骤必须是文字。');
        if(record.solution.conversation?.some(item=>!item||!['user','assistant'].includes(item.role)||typeof item.content!=='string'))throw new Error('追问记录格式无效。');
        if(record.solution.study!=null&&(typeof record.solution.study!=='object'||Array.isArray(record.solution.study)))throw new Error('学习记录格式无效。');
      }
      if(record.scene?.objects?.length>500)throw new Error('图稿对象超过 500 个。');
      const parsedScene=record.scene?api.modelFromJson(JSON.stringify(record.scene)):null;
      api.clear();api.question.value=record.question;
      api.state.solution=record.solution;api.state.activePart=record.activePart??null;
      if(parsedScene)api.installScene(parsedScene,'题本');
      api.state.exploring=!!record.exploring;find('#exploreNotice').hidden=!api.state.exploring;
      renderSolution();api.refreshLayers();api.render();api.remember();api.setStatus('题目、解析、图形与追问已恢复。');
    }
    function renderNotebook() {
      const query=find('#notebookSearch').value.toLowerCase();
      const filter=find('#reviewFilter')?.value||'all';
      const entries=readNotebook().filter(item=>(item.title+' '+item.question+' '+(item.solution?.study?.notes||'')).toLowerCase().includes(query)&&(filter==='all'||item.solution?.study?.review===filter));
      find('#notebookList').innerHTML=entries.length?entries.map(item=>`<article class="notebook-entry"><div><strong>${escapeText(item.title)}</strong><p>${escapeText(item.question.slice(0,100))}</p><small>${escapeText(new Date(item.savedAt).toLocaleString())}</small></div><button class="button secondary" data-open-lesson="${escapeText(item.id)}">打开</button></article>`).join(''):'<p>还没有符合条件的题目。解答后会自动保存，也可以点击“保存本题”。</p>';
      find('#notebookList').querySelectorAll('[data-open-lesson]').forEach(button=>button.addEventListener('click',()=>{try{restoreLesson(entries.find(item=>item.id===button.dataset.openLesson));find('#notebookDialog').close();}catch(error){report(error);}}));
    }
    function printLesson() {
      if(!api.state.solution)throw new Error('请先生成解析。');
      const target=find('#printLesson');
      target.innerHTML='<h1>董解析 · 学习题稿</h1>'+textBlock(api.state.solution.restatement)+'<section class="solution">'+markup(api.state.solution,true)+'</section>';
      if(api.state.model){const image=document.createElement('img');image.src=api.canvas.toDataURL('image/png');image.alt='当前图形';target.append(image);if(api.state.exploring)target.insertAdjacentHTML('beforeend','<p>此图已调整参数；解析仍对应原题。</p>');}
      typeset(target);window.print();
    }
    async function solve() {
      if(processing)return;
      const original=api.question.value.trim();
      if(!original){report(new Error(find('#imageFile').files[0]?'请先点击“识别题图”，核对文字后解答。':'请先输入完整题目。'));return;}
      if(hasUncertainty(original)){report(new Error('题面仍含“[看不清]”或其它未确认字段。请先补正后再解题。'));return;}
      const acceptResult=result=>{
        if(api.question.value.trim()!==original){api.setStatus('题目已修改，本次旧题结果未应用。请点击“一站式解题”求解当前题目。');return;}
        result=api.enrichSolvedScene?.(result,original)||result;
        api.showSolution(result);
        if(result.scene){try{api.installScene(api.modelFromJson(JSON.stringify(result.scene)),['local-ollama','cloud-ai'].includes(result.mode)?'智能生成图形（需核验）':'内置精确建模');}catch(error){result.scene_notice='图形未能载入，解析已保留：'+error.message;}}
        else if(api.state.model){api.state.exploring=true;find('#exploreNotice').hidden=false;find('#exploreNotice').textContent='本题没有生成新图形，画板仍是此前的图稿，不对应当前解析。';}
        inspectorView='lesson';renderSolution();api.remember();
        if(api.question.value.trim()===original){try{saveLesson(true);}catch(error){report(error);return;}}
        const completion=result.completion||{answered:0,total:(result.parts||[]).length||1};
        api.setStatus(`${result.mode==='cloud-ai'?'云端 AI 返回':'内置引擎已完成'} ${completion.answered}/${completion.total} 问；${verificationNames[result.verification?.status]||'请核对步骤'}。${result.scene_notice||''}`);
        return completion;
      };
      if(engineReady&&cloudPrimary){
        api.setStatus('正在由独立云端理解完整题目、生成解析并进行数学核验；不会占用你的电脑运行模型。');
        await runJob({kind:'solve',text:original,model:find('#modelName').value,depth:find('#solveDepth').value},acceptResult);
        return;
      }
      let deterministic;
      busy(true);find('#jobPhase').textContent='正在进行内置识题、符号推导与图形校验…';
      try{
        const browser=api.solveDeterministic?.(original);
        if(browser?.engineExtensions?.length)deterministic=browser;
        if(!deterministic&&runtime.config.apiEnabled){try{deterministic=await request('/api/solve',{text:original,rules_only:true});}catch(error){if(!api.solveDeterministic)throw error;}}
        if(!deterministic)deterministic=browser;
        if(!deterministic)throw new Error('当前环境未能启动内置解题模块。');
        acceptResult(deterministic);
      }catch(error){report(error);return;}
      finally{busy(false);}
      if(api.question.value.trim()!==original)return;
      const completion=deterministic.completion||{answered:0,total:(deterministic.parts||[]).length||1};
      if(completion.answered<completion.total&&engineReady){
        api.setStatus(`内置引擎先完成 ${completion.answered}/${completion.total} 问；正在用可选智能引擎补充其余小问。`);
        await runJob({kind:'solve',text:original,model:find('#modelName').value,depth:find('#solveDepth').value},acceptResult);
      }else if(completion.answered<completion.total){
        api.setStatus(`内置引擎已完成 ${completion.answered}/${completion.total} 问；其余小问已明确标为待推导，不要求下载额外模型。`);
      }
    }
    async function recognize() {
      const file=selectedImage;
      if(!file){report(new Error('请先添加题图。'));return;}
      if(file.size>8*1024*1024){report(new Error('题图请压缩至 8 MB 以内。'));return;}
      if(find('#preferCloudVision').checked&&!find('#cloudVisionChoice').hidden){
        const image=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});
        await runJob({kind:'recognize',image,model:find('#modelName').value},result=>{find('#recognizedText').value=result.text;find('#recognitionDialog').showModal();api.setStatus('云端视觉识题已完成，请逐字核对公式与小问编号。');});
        return;
      }
      busy(true);
      find('#jobPhase').textContent='正在加载浏览器 OCR…';
      let worker;
      try {
        const tesseract=await loadBrowserOcr();
        worker=await tesseract.createWorker(['chi_sim','eng'],1,{logger:progress=>{
          if(progress.status==='recognizing text')find('#jobPhase').textContent=`正在识别题图 ${Math.round((progress.progress||0)*100)}%`;
        }});
        let result=await worker.recognize(file,{rotateAuto:true});
        if((result.data?.confidence||0)<72||String(result.data?.text||'').trim().length<40){
          try{const processed=await preprocessOcrImage(file);find('#jobPhase').textContent='正在复核增强后的题图…';const second=await worker.recognize(processed,{rotateAuto:true});if((second.data?.confidence||0)>(result.data?.confidence||0)+3)result=second;}catch(error){/* Unsupported image decoding leaves the first OCR result available. */}
        }
        const recognized=String(result.data?.text||'').trim();
        find('#recognizedText').value=recognized;
        find('#recognitionDialog').showModal();
        api.setStatus(recognized?`题图已在浏览器内识别（文字置信度约 ${Math.round(result.data?.confidence||0)}%）。请认真核对数学公式后确认。`:'图片未识别出文字；可在核对框中手动输入，或换更清晰的照片。',!recognized);
      } finally {
        if(worker)await worker.terminate();
        busy(false);
      }
    }
    async function followup() {
      const solution=api.state.solution;
      const question=find('#followupInput').value.trim();
      if(!solution||!question){report(new Error('请填写追问内容。'));return;}
      const conversation=solution.conversation||[];
      await runJob({kind:'chat',text:solution.restatement,context:lessonText(solution),history:conversation,followup:`当前查看小问：${api.state.activePart??'全部'}。\n${question}`,model:find('#modelName').value,depth:find('#solveDepth').value},result=>{
        if(api.state.solution!==solution){api.setStatus('题目已切换，此次追问未写入新题。',true);return;}
        solution.conversation=[...conversation,{role:'user',content:question},{role:'assistant',content:result.text}].slice(-30);
        find('#followupInput').value='';renderChat();api.remember();try{saveLesson(true);}catch(error){report(error);}
        api.setStatus('追问已完成，原解析保留；若模型纠正了结论，请重新解答整题以更新图形。');
      });
    }
    find('#engineRefresh').addEventListener('click',()=>refreshEngine(true));
    find('#cloudLogin').addEventListener('click',async()=>{
      const input=find('#cloudAccessKey');
      try{
        find('#cloudLogin').disabled=true;
        await runtime.authenticate(input.value);
        input.value='';
        for(const id of ['solveButton','recognizeButton','engineRefresh'])find('#'+id).disabled=false;
        api.setStatus('在线解题授权成功，本次浏览器会话内有效。');
        await refreshEngine();
      }catch(error){report(error);}
      finally{find('#cloudLogin').disabled=false;}
    });
    find('#cloudAccessKey').addEventListener('keydown',event=>{if(event.key==='Enter')find('#cloudLogin').click();});
    find('#clearButton').addEventListener('click',renderSolution);
    find('#modelName').addEventListener('change',event=>{lastModel=event.target.value;localStorage.setItem(modelKey,lastModel);refreshEngine();});
    find('#pullModel').addEventListener('click',()=>runJob({kind:'pull',model:find('#modelName').value},result=>api.setStatus(result.message)));
    const localChoice=document.createElement('details');localChoice.id='localModelChoice';
    const localTitle=document.createElement('summary');localTitle.textContent='可选：使用本机模型，分担云端压力';
    const localHelp=document.createElement('p');localHelp.className='help';localHelp.textContent='已有 Windows 本机版：运行程序目录中的“安装本地AI.bat”，再在本机版检测并下载模型。题目在本机处理，不自动转发云端。模型占用下载流量、磁盘和内存；手机仍建议使用云端。公开网页不会擅自连接你的 localhost；通用免环境桌面安装包尚待完善。';
    localChoice.append(localTitle,localHelp);find('#engineSetup').after(localChoice);
    find('#cancelJob').addEventListener('click',async()=>{if(activeJob){try{await request('/api/jobs/'+activeJob+'/cancel',{});find('#jobPhase').textContent='正在停止，请稍候…';}catch(error){report(error);}}});
    find('#recognizeButton').addEventListener('click',()=>recognize().catch(report));
    function selectImage(file){
      if(imageURL)URL.revokeObjectURL(imageURL);
      selectedImage=file||null;imageURL=file?URL.createObjectURL(file):null;
      find('#imagePreview').hidden=!file;
      if(file){find('#questionImage').src=imageURL;api.setStatus('已添加题图。点击“识别题图”，核对文字后再解答。');}
      else find('#questionImage').removeAttribute('src');
    }
    for(const id of ['imageFile','cameraFile'])find('#'+id).addEventListener('change',event=>selectImage(event.target.files[0]));
    find('#removeImage').addEventListener('click',()=>{find('#imageFile').value='';find('#cameraFile').value='';selectImage(null);});
    find('#confirmRecognition').addEventListener('click',()=>{const recognized=find('#recognizedText').value;if(hasUncertainty(recognized)){report(new Error('识别结果仍含“[看不清]”或其它未确认字段。请在此窗口补正后再确认。'));return;}api.question.value=recognized;find('#recognitionDialog').close();api.remember();api.setStatus('题面已确认，可以开始解题。');});
    document.querySelectorAll('[data-close-dialog]').forEach(button=>button.addEventListener('click',()=>button.closest('dialog').close()));
    find('#openNotebook').addEventListener('click',()=>{try{renderNotebook();find('#notebookDialog').showModal();}catch(error){report(error);}});
    find('#saveLesson').addEventListener('click',()=>{try{saveLesson();}catch(error){report(error);}});
    find('#notebookSearch').addEventListener('input',renderNotebook);
    const reviewFilter=document.createElement('select');reviewFilter.id='reviewFilter';reviewFilter.setAttribute('aria-label','题本掌握情况筛选');reviewFilter.innerHTML='<option value="all">全部题目</option><option value="review">错题 · 需要复习</option><option value="mastered">已掌握</option>';find('#notebookSearch').after(reviewFilter);reviewFilter.addEventListener('change',renderNotebook);
    find('#exportLesson').addEventListener('click',()=>{const record=snapshot();api.download('董解析-题稿.json',new Blob([JSON.stringify(record,null,2)],{type:'application/json'}));});
    find('#importLesson').addEventListener('change',async event=>{try{const file=event.target.files[0];if(!file)return;if(file.size>5*1024*1024)throw new Error('题稿超过 5 MB。');restoreLesson(JSON.parse(await file.text()));find('#notebookDialog').close();}catch(error){report(error);}finally{event.target.value='';}});
    find('#sendFollowup').addEventListener('click',followup);
    document.querySelectorAll('[data-followup]').forEach(button=>button.addEventListener('click',()=>{find('#followupInput').value=button.dataset.followup;find('#followupInput').focus();}));
    find('#followupInput').addEventListener('keydown',event=>{if(event.ctrlKey&&event.key==='Enter')followup();});
    const formulaPreview=document.createElement('details');formulaPreview.className='question-formula-preview';
    const previewTitle=document.createElement('summary');previewTitle.textContent='题目公式预览 · 支持 LaTeX';
    const previewBody=document.createElement('div');previewBody.className='math-content';
    formulaPreview.append(previewTitle,previewBody);api.question.after(formulaPreview);
    const refreshFormula=()=>window.DongMathInput?.preview(api.question,previewBody);
    formulaPreview.addEventListener('toggle',()=>{if(formulaPreview.open)refreshFormula();});
    refreshFormula();
    api.question.addEventListener('input',()=>{
      if(formulaPreview.open)refreshFormula();
      api.remember();
      clearTimeout(draftTimer);
      draftTimer=setTimeout(saveDraft,300);
      if(api.state.solution)renderSolution();
    });
    api.question.addEventListener('keydown',event=>{if(event.ctrlKey&&event.key==='Enter')solve();});
    window.addEventListener('beforeunload',event=>{if(activeJob){event.preventDefault();event.returnValue='';}});
    classroom=window.DongClassroom.attach({...api,renderSolution,sendFeedback:followup,showLearning:()=>setInspectorView('lesson'),saveStudy(){if(api.state.solution&&api.question.value.trim()===api.state.solution.restatement.trim()){try{saveLesson(true);}catch(error){report(error);}}}});
    renderDraftRecovery();
    return {refreshEngine,renderSolution,solve};
  }
  window.DongLearning={attach};
})();
