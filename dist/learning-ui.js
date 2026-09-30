(function () {
  'use strict';
  const escapeText = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  const textBlock = value => `<div class="math-content">${escapeText(window.DongMathInput?.prepare(value)??value).replace(/\*\*([^*\n]+)\*\*/g,'<strong>$1</strong>')}</div>`;
  const statusNames = {answered:'已生成完整作答',partial:'尚未完整解答',needs_information:'AI 认为条件不足（待核实）'};
  const verificationNames = {generated:'仅生成 · 待核验','locally-verified':'局部代数核验通过',conflict:'发现确定性冲突','fully-verified':'完整验证通过','reference-reviewed':'题库参考讲解 · 非机器证明'};
  const checkNames = {verified:'通过',contradicted:'冲突',unresolved:'未决'};
  const hasUncertainty = value => /\[(?:看不清|模糊|无法辨认|不确定)[^\]]*\]|(?:看不清|无法辨认)处|[?？]{3,}/i.test(String(value||''));
  function questionRepairSuggestion(value) {
    const plain=window.DongMathInput?.toPlain(value)??String(value||'');
    const target=/直线\s*[（(]?\s*P\s*Q\s*[）)]?(?=\s*与\s*(?:椭圆\s*)?C\s*的?\s*(?:另一个|另一)\s*交点\s*(?:为|是)?\s*R)/i;
    if(!target.test(plain))return null;
    return{
      issue:'直线 PQ 已与二次曲线 C 交于 P、Q，不可能再有第三个交点 R。',
      suggestion:'原题应为“直线 PO 与 C 的另一个交点为 R”。',
      corrected:plain.replace(target,'直线 PO')
    };
  }
  function typeset(element) {
    if (!window.renderMathInElement) return;
    window.renderMathInElement(element, {delimiters:[{left:'$$',right:'$$',display:true},{left:'\\[',right:'\\]',display:true},{left:'\\(',right:'\\)',display:false},{left:'$',right:'$',display:false}],throwOnError:false,trust:false,strict:'ignore',maxExpand:300,maxSize:20});
  }
  function lessonText(solution) {
    return [solution.title,solution.restatement,solution.strategy,...(solution.parts||[]).flatMap(part=>[part.label,part.answer,...(part.steps||[])]),solution.external?.plain?solution.rawReply:'',solution.verification?.message].filter(Boolean).join('\n\n');
  }
  function attach(api) {
    const find = selector => document.querySelector(selector);
    const runtime = window.DongRuntime;
    const mobileNav=find('.mobile-panel-nav'),workspace=find('.workspace');
    const solveProgress=find('#solveProgress');
    function progress(state,message){solveProgress.dataset.state=state;solveProgress.textContent=message;}
    api.question.addEventListener('input',()=>progress('idle','题目已修改，等待重新解题。'));
    mobileNav.querySelectorAll('[data-mobile-panel]').forEach(button=>button.addEventListener('click',()=>{
      workspace.dataset.mobileView=button.dataset.mobilePanel;
      mobileNav.querySelectorAll('button').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
      if(button.dataset.mobilePanel==='lesson')setInspectorView('lesson');
      // Hidden canvas dimensions are zero; redraw only after the selected panel is laid out.
      requestAnimationFrame(()=>{api.render();window.scrollTo({top:Math.max(0,workspace.getBoundingClientRect().top+window.scrollY-mobileNav.offsetHeight),behavior:'instant'});});
    }));
    const notebookKey = 'dongjiexi:notebook:v1';
    const draftKey = 'dongjiexi:draft:v1';
    const modelKey = 'dongjiexi:model';
    const modeKey = 'dongjiexi:solve-mode:v1';
    let solveMode = ['cloud','local'].includes(localStorage.getItem(modeKey)) ? localStorage.getItem(modeKey) : null;
    const workflowKey='dongjiexi:local-workflow:v1';
    let localWorkflow=['clipboard','native','model'].includes(localStorage.getItem(workflowKey))?localStorage.getItem(workflowKey):'clipboard';
    const workflowRow=document.createElement('div');workflowRow.id='localWorkflowRow';workflowRow.className='local-workflow-row';
    workflowRow.innerHTML='<label for="localWorkflow">本机解题方式</label><select id="localWorkflow"><option value="clipboard">使用已有 AI · 复制粘贴（推荐）</option><option value="native">内置数学引擎 · 无需 AI</option><option value="model">已下载模型 · 电脑本机版</option></select>';
    find('#engineRouteSummary').after(workflowRow);
    const workflowSelect=find('#localWorkflow');workflowSelect.value=localWorkflow;
    if(runtime.config.deployment==='web'||runtime.config.apiBase)workflowSelect.querySelector('[value="model"]').disabled=true;
    const modePanel = find('#solveModePanel'), modeToggle = find('#solveModeToggle');
    const cloudDialog=find('#cloudAuthDialog'),cloudFeedback=find('#cloudAuthFeedback');
    let cloudCheckPending=false, lastCloudCheck=0, cloudUnavailable=false;
    function showCloudFallback(show,message=''){
      cloudUnavailable=show;
      const warning=find('#cloudOutage');
      warning.hidden=!show||solveMode!=='cloud';
      renderCloudShortcut();
      if(message)find('#cloudOutageMessage').textContent=message;
      find('#cloudAuthUseLocal').hidden=!show;
    }
    function renderCloudShortcut(){
      const visible=cloudUnavailable&&solveMode==='cloud';
      find('#cloudOutageShortcut').hidden=!visible;
      mobileNav.querySelector('[data-mobile-panel="input"]').textContent=visible?'题目 · 云端异常':'题目';
    }
    function cloudFailure(error){
      if(solveMode!=='cloud')return;
      if(['auth_rejected','session_expired'].includes(error.code)){showCloudFallback(false);return;}
      if(['network','timeout','service_unavailable','invalid_response','rate_limited'].includes(error.code)){
        const message=error.code==='rate_limited'?'云端当前请求较多，建议稍后重试或改用本机解题。':navigator.onLine===false?'当前设备已离线，无法连接云端。推荐改用本机解题。':'云端暂时无法连接，可能是网络或服务中断。推荐改用本机解题。';
        const firstFailure=!cloudUnavailable;
        engineReady=false;showCloudFallback(true,message);
        find('#engineStatus').classList.remove('ready');find('#engineStatus').textContent='云端增强暂不可用 · 可改用本机内置解题';
        find('#cloudVisionChoice').hidden=true;renderEngineRoute();
        if(firstFailure)api.setStatus(message,true);
        setCloudConnection('failed',error.code==='rate_limited'?'云端：请求过于频繁':runtime.hasSession()?'云端：已授权，但服务连接失败':'云端：服务连接失败，口令尚未验证');
      }
    }
    async function checkCloudConnection(force=false){
      if(solveMode!=='cloud'||!runtime.config.apiEnabled||processing||cloudCheckPending||document.hidden||(!force&&Date.now()-lastCloudCheck<45000))return;
      cloudCheckPending=true;lastCloudCheck=Date.now();
      try{
        if(navigator.onLine===false)throw Object.assign(new Error('设备已离线'),{code:'network'});
        const result=await runtime.probeCloud();
        if(solveMode!=='cloud')return;
        if(result.needsAuth&&!runtime.hasSession()){showCloudFallback(false);await refreshEngine();setCloudConnection('disconnected','云端：服务可达，请输入访问口令');}
        else await refreshEngine();
      }catch(error){cloudFailure(error);}
      finally{cloudCheckPending=false;}
    }
    function setCloudConnection(state,message){
      const panel=find('#cloudConnection'),text=find('#cloudConnectionText');
      panel.hidden=solveMode!=='cloud';panel.dataset.state=state;text.textContent=message;
      find('#openCloudAuth').textContent=runtime.config.requiresAuth&&!runtime.hasSession()&&(state==='disconnected'||state==='failed')?'输入口令':'连接设置';
    }
    function openCloudAuthDialog(message=''){
      if(!runtime.config.apiEnabled){api.setStatus('在线版尚未配置云端解题服务。',true);return;}
      if(!runtime.config.requiresAuth){void refreshEngine(true);return;}
      cloudFeedback.dataset.state='idle';cloudFeedback.textContent=message||'输入口令后点击“验证并连接”。';
      if(!cloudDialog.open)cloudDialog.showModal();
      setTimeout(()=>find('#cloudAccessKey').focus(),30);
    }
    function showModes(show) { modePanel.hidden=!show;modeToggle.setAttribute('aria-expanded',String(show)); }
    function selectMode(mode) { if(processing){api.setStatus('当前解题仍在运行；可先停止，再切换解题方式。');return;}solveMode=mode;localStorage.setItem(modeKey,mode);modePanel.querySelectorAll('[data-solve-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.solveMode===mode)));showModes(false);renderEngineRoute();api.setStatus((mode==='cloud'?'云端':'本机')+'解题已选定；点击“解题”开始。');void refreshEngine();if(mode==='cloud'&&runtime.config.requiresAuth&&!runtime.hasSession())openCloudAuthDialog(); }
    function useLocalSolver(){
      if(processing){api.setStatus('请先停止当前解题任务，再切换本机解题。');return;}
      cloudDialog.close();selectMode('local');
      api.setStatus('已改用本机解题，题目和图稿已保留。默认复制请求到已有 AI，再粘贴回复；也可选择内置数学引擎。');
    }
    find('#useLocalSolver').addEventListener('click',useLocalSolver);
    find('#cloudAuthUseLocal').addEventListener('click',useLocalSolver);
    find('#cloudOutageShortcut').addEventListener('click',useLocalSolver);
    find('#retryCloudConnection').addEventListener('click',()=>checkCloudConnection(true));
    window.addEventListener('offline',()=>cloudFailure({code:'network'}));
    window.addEventListener('online',()=>checkCloudConnection(true));
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)void checkCloudConnection(true);});
    setInterval(()=>checkCloudConnection(),45000);
    modePanel.querySelectorAll('[data-solve-mode]').forEach(button=>button.addEventListener('click',()=>selectMode(button.dataset.solveMode)));
    modeToggle.addEventListener('click',()=>showModes(modePanel.hidden));
    modePanel.querySelectorAll('[data-solve-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.solveMode===solveMode)));
    workflowSelect.addEventListener('change',()=>{
      if(processing){workflowSelect.value=localWorkflow;api.setStatus('请先停止当前解题任务。');return;}
      localWorkflow=workflowSelect.value;localStorage.setItem(workflowKey,localWorkflow);void refreshEngine();
    });
    let activeJob = null;
    let streamController = null;
    let cloudTransport = 'jobs';
    let processing = false;
    let imageURL = null;
    let draftTimer = null;
    let lastModel = localStorage.getItem(modelKey) || '';
    let engineReady = false;
    let cloudPrimary = false;
    let visionAvailable = true;
    let selectedImage = null;
    let ocrScriptPromise = null;
    function modelOwner(name){const value=String(name||'').toLowerCase();if(value.includes('deepseek'))return 'DeepSeek';if(value.includes('qwen'))return '通义千问';if(value.includes('gemini'))return 'Gemini';if(value.includes('gpt'))return 'OpenAI';return 'AI';}
    function renderEngineRoute(){
      const remote=runtime.config.deployment==='web'||!!runtime.config.apiBase;
      const summary=find('#engineRouteSummary'),title=find('#engineRouteTitle'),detail=find('#engineRouteDetail');
      const row=find('#modelSelectorRow'),select=find('#modelName'),label=find('#modelNameLabel span');
      workflowRow.hidden=solveMode!=='local';
      find('#solveDepth').closest('.learning-settings').hidden=solveMode==='local'&&localWorkflow!=='model';
      find('#cloudConnection').hidden=solveMode!=='cloud';
      find('#cloudOutage').hidden=solveMode!=='cloud'||!cloudUnavailable;
      renderCloudShortcut();
      if(!solveMode){summary.dataset.route='';title.textContent='尚未选择解题路径';detail.textContent='点击上方“云端解题”或“本机解题”。';row.hidden=true;return;}
      summary.dataset.route=solveMode;
      if(solveMode==='cloud'){
        title.textContent='当前路径：云端解题';
        detail.textContent=engineReady&&select.value?`云端服务提供：${modelOwner(select.value)} · ${select.value}。当前设备无需下载该模型。`:'将通过在线服务调用 AI 模型；当前设备无需下载。';
        row.hidden=false;label.textContent='云端 AI 模型（运行于在线服务）';select.setAttribute('aria-label','云端 AI 模型');
      }else{
        title.textContent='当前路径：本机解题';
        detail.textContent=localWorkflow==='clipboard'?'使用你已有的 AI：复制请求、粘贴回复；不调用上方云端模型，也不假称 AI 在本机运行。':localWorkflow==='native'?'使用当前浏览器或本机内置数学引擎，不调用上方云端模型；未覆盖题型不会伪装成已解答。':'使用安装在这台电脑上的模型，不调用上方云端模型。';
        row.hidden=remote||localWorkflow!=='model';label.textContent='本机 AI 模型（运行于这台电脑）';select.setAttribute('aria-label','本机 AI 模型');
      }
    }
    renderEngineRoute();
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
    let selectedStep=null,lastStepPart=api.state.activePart,lastStepQuestion=api.question.value;
    function updateStepControls(){
      const panel=find('#solution');
      panel.querySelectorAll('[data-step-graph-index]').forEach(button=>{
        const active=!!selectedStep&&Number(button.dataset.stepGraphPart)===selectedStep.part&&Number(button.dataset.stepGraphIndex)===selectedStep.index;
        button.setAttribute('aria-pressed',String(active));
        button.textContent=active?'取消高亮':'对应图形';
      });
      const toolbar=panel.querySelector('.step-graph-toolbar');
      if(!toolbar)return;
      toolbar.hidden=!selectedStep;
      if(!selectedStep)return;
      const {matched,missing}=selectedStep;
      const messages=[matched.length?`按名称已高亮：${matched.join('、')}。`:'本步未匹配到可见图形。'];
      if(missing.length)messages.push(`未找到或未显示：${missing.join('、')}。`);
      messages.push('仅用于图形定位，不代表本步证明通过。');
      toolbar.querySelector('[data-step-graph-status]').textContent=messages.join('');
    }
    function clearStepHighlight(){
      selectedStep=null;
      api.clearStepHighlight?.();
      updateStepControls();
    }
    function bindStepLinks(panel,solution){
      panel.querySelector('[data-step-graph-clear]')?.addEventListener('click',clearStepHighlight);
      panel.querySelectorAll('[data-step-graph-index]').forEach(button=>button.addEventListener('click',()=>{
        const part=Number(button.dataset.stepGraphPart),index=Number(button.dataset.stepGraphIndex);
        if(selectedStep?.part===part&&selectedStep.index===index){clearStepHighlight();return;}
        const current=(solution.parts||[]).find(item=>Number(item.index)===part);
        const text=current?.steps?.[index]??(part===0?solution.steps?.[index]:undefined);
        if(typeof text!=='string'||api.state.solution!==solution||api.question.value.trim()!==String(solution.restatement||'').trim()){
          clearStepHighlight();api.setStatus('题目或步骤已变化，请先重新解题再定位对应图形。');return;
        }
        try{
          const result=api.highlightStep({text,part,index})||{};
          const names=values=>Array.isArray(values)?[...new Set(values.filter(value=>typeof value==='string').map(value=>value.slice(0,160)))].slice(0,80):[];
          selectedStep={part,index,matched:names(result.matched),missing:names(result.missing)};
          updateStepControls();
        }catch(error){clearStepHighlight();api.setStatus('当前步骤的图形定位未完成：'+(error.message||String(error)),true);}
      }));
    }
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
      find('#followupPanel').hidden=!solution||!['local-ollama','cloud-ai'].includes(solution.mode);
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
      const trust=`<div class="trust-summary ${escapeText(report.status||'generated')}"><strong>${escapeText(verificationNames[report.status]||'核验状态未知')}</strong>${report.status==='reference-reviewed'?'':`<span>通过 ${Number(counts.verified)||0} · 冲突 ${Number(counts.contradicted)||0} · 未决 ${Number(counts.unresolved)||0}</span>`}</div>`;
      const source=solution.lessonSource;
      const provenance=source?`<details class="reference-source"><summary>真题出处 · ${escapeText(source.year||'经典题')} · ${escapeText(source.paper)} · ${escapeText(source.number)} · ${escapeText(source.scope)}</summary>${(source.sources||[]).filter(item=>/^https:\/\//.test(item.url)).map(item=>`<p><a href="${escapeText(item.url)}" target="_blank" rel="noopener noreferrer">${escapeText(item.title)}</a></p>`).join('')}<p>易错点：${escapeText(source.pitfall)}</p></details>`:'';
      const externalReply=solution.mode==='external-ai'&&solution.rawReply?`<details class="external-original"${solution.external?.plain?' open':''}><summary>外部 AI 原始回复 · 未执行其中代码</summary>${textBlock(solution.rawReply)}</details>`:'';
      const model=solution.problemModel;
      const modelDetails=model?`<details class="problem-model"><summary>结构化题目模型 · ${model.curve?escapeText(model.curve.kind):'曲线未确定'} · ${model.parts?.length||0} 问</summary><p>输入确认：${model.source?.confirmed?'已确认':'存在模糊字段'}；点 ${model.points?.length||0} 个；直线 ${model.lines?.length||0} 条。</p>${model.source?.ambiguities?.length?`<p class="verification-conflict">未确认：${escapeText(model.source.ambiguities.join('、'))}</p>`:''}</details>`:'';
      const checkList=(part)=>{const checks=(report.checks||[]).filter(item=>item.part==null||Number(item.part)===Number(part.index));if(!checks.length)return '';return `<details class="verification-details"><summary>查看本问机器核验（${checks.length} 项）</summary><ul>${checks.map(item=>`<li class="check-${escapeText(item.status)}"><strong>${escapeText(checkNames[item.status]||item.status)}</strong> · ${escapeText(item.label)}：${escapeText(item.detail)}${item.formula?textBlock('$'+item.formula+'$'):''}</li>`).join('')}</ul></details>`;};
      const audit=solution.sceneAudit;
      const diagramReport=audit?`<details class="diagram-audit"><summary>图形核对 · 缺失点 ${audit.missing?.length||0} · 缺失线 ${audit.missingLines?.length||0} · 无效构造 ${audit.invalid?.length||0}</summary><p>${escapeText(audit.note)}</p>${!all?'<button type="button" class="button secondary" data-diagram-recheck>重新核对当前图形</button>':''}${audit.missing?.length?`<p class="verification-conflict">题目声明但未找到的点：${escapeText(audit.missing.join('、'))}。请补充构造或复制修正请求。</p>`:''}${audit.missingLines?.length?`<p class="verification-conflict">尚未找到的直线或切线：${escapeText(audit.missingLines.join('、'))}。</p>`:''}${audit.invalid?.length?`<p class="verification-conflict">当前无法构造：${escapeText(audit.invalid.join('、'))}。</p>`:''}<ul>${(audit.checks||[]).filter(c=>all||window.DongSceneAudit.visible(c,active)).map(c=>`<li>${c.passed?'✓':'未通过'} ${escapeText(c.label)}：${escapeText(c.detail)}</li>`).join('')}</ul></details>`:'';
      const stepLinks=!all&&typeof api.highlightStep==='function';
      const linkToolbar=stepLinks?'<div class="step-graph-toolbar" hidden><span data-step-graph-status role="status" aria-live="polite"></span><button type="button" data-step-graph-clear>清除高亮</button></div>':'';
      const partMarkup=visible.map(part=>{const partTrust=part.verification||(solution.mode==='symbolic-fallback'&&part.status==='answered'?{status:report.status||'generated',message:'内置确定性复算'}:{status:'generated',message:'仅生成'});const derivation=part.derivation||{};const obligations=derivation.proof_obligations||[];return `<section class="part-body" data-part-index="${escapeText(part.index)}"><h3>${escapeText(part.label||'本问')}</h3><span class="answer-status ${['answered','partial','needs_information'].includes(part.status)?part.status:'partial'}">${escapeText(statusNames[part.status]||'请核对解答')}</span><span class="verification-status ${escapeText(partTrust.status||'generated')}">${escapeText(verificationNames[partTrust.status]||partTrust.message||'待核验')}</span><div class="answer-summary">${textBlock(part.answer)}</div><ol>${(part.steps||[]).map((step,index)=>'<li>'+textBlock(step)+(stepLinks?`<button type="button" class="step-graph-link" data-step-graph-part="${Number(part.index)||0}" data-step-graph-index="${index}" aria-pressed="false" aria-label="高亮第 ${index+1} 步对应图形">对应图形</button>`:'')+'</li>').join('')}</ol>${obligations.length?`<details class="proof-obligations"><summary>尚需完成的证明义务（${obligations.length}）</summary><ul>${obligations.map(item=>'<li>'+textBlock(item)+'</li>').join('')}</ul></details>`:''}${part.quality_notice?`<p class="verification-conflict">${escapeText(part.quality_notice)}</p>`:''}${part.model_answer?`<details><summary>查看 AI 原始判断（未证实）</summary>${textBlock(part.model_answer)}</details>`:''}${checkList(part)}</section>`;}).join('');
      return `<h3>${escapeText(solution.title||'解题结果')}</h3><p>${escapeText(summary)}${solution.model?' · '+escapeText(solution.model):''}</p>${trust}${provenance}${stale}${solution.quality_notice?`<p class="verification-conflict">${escapeText(solution.quality_notice)}</p>`:''}<details><summary>查看原题</summary>${textBlock(solution.restatement)}</details>${modelDetails}${tabs}${solution.knowns?.length?`<details><summary>已知条件</summary><ul>${solution.knowns.map(value=>'<li>'+textBlock(value)+'</li>').join('')}</ul></details>`:''}${solution.strategy?`<div class="method-overview"><p><strong>解题方法</strong></p>${textBlock(solution.strategy)}</div>`:''}${linkToolbar}${partMarkup}${diagramReport}${externalReply}${solution.assumptions?.length?`<p class="lesson-assumptions">使用的假设：${escapeText(solution.assumptions.join('；'))}</p>`:''}<div class="proof">${escapeText(report.message||'尚未核验')}${solution.scene_notice?'<p>'+escapeText(solution.scene_notice)+'</p>':''}</div>`;
    }
    function bindTabs(element) {
      element.querySelectorAll('[data-study-part]').forEach(button=>button.addEventListener('click',()=>{
        api.state.activePart=button.dataset.studyPart==='all'?null:Number(button.dataset.studyPart);
        renderSolution();api.refreshLayers();api.syncMotionButton?.();api.render();api.remember();
      }));
    }
    function renderSolution() {
      const solution=api.state.solution;
      if(solution!==lastSolution||api.state.activePart!==lastStepPart||api.question.value!==lastStepQuestion)clearStepHighlight();
      lastStepPart=api.state.activePart;lastStepQuestion=api.question.value;
      if(solution!==lastSolution){lastSolution=solution;inspectorView=solution?.mode==='local-ollama'?'lesson':'geometry';inspector.scrollTop=0;}
      setInspectorView(inspectorView);
      if(!solution){find('#solution').hidden=true;renderChat();classroom?.decorate();return;}
      const panel=find('#solution');
      panel.innerHTML=`<div class="lesson-actions"><button data-lesson-action="read">展开解析</button><button data-lesson-action="copy">复制解析</button><button data-lesson-action="print">打印 / PDF</button><button data-lesson-action="save">保存本题</button></div>`+markup(solution);
      panel.hidden=false;bindTabs(panel);bindStepLinks(panel,solution);typeset(panel);renderChat();classroom?.decorate();
      if(selectedStep){const selected=[...panel.querySelectorAll('[data-step-graph-index]')].find(button=>Number(button.dataset.stepGraphPart)===selectedStep.part&&Number(button.dataset.stepGraphIndex)===selectedStep.index);if(!selected||selected.closest('li')?.hidden)clearStepHighlight();else updateStepControls();}
      panel.querySelector('[data-diagram-recheck]')?.addEventListener('click',()=>{
        if(!api.state.model||!solution.scene)return;
        solution.sceneAudit=window.DongSceneAudit.inspect(api.sceneData(),solution.restatement,solution.parts,window.DongConstruct);
        solution.sceneAudit.note=api.state.exploring?'当前已调整参数；这是当前图形的数值核对，不验证原题答案及一般性证明。':'已核对当前图形的数值构造，不是一般性证明。';
        renderSolution();find('#solution .diagram-audit').open=true;api.remember();
      });
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
      find('#cancelJob').hidden=!activeJob;
      find('#solveButton').textContent=value?'正在处理…':'解题';
    }
    async function refreshEngine(start=false) {
      const requestedMode=solveMode;
      const remote=runtime.config.deployment==='web'||!!runtime.config.apiBase;
      const notice=find('#deploymentNotice');
      notice.hidden=false;
      notice.textContent=remote?'内置确定性解题与画板无需另装模型；配置在线服务后可继续增强开放题推理。':'内置确定性解题无需下载模型；本机模型仅用于尚未覆盖的开放题增强。';
      find('#cloudAuth').hidden=true;
      if(!solveMode){engineReady=false;find('#cloudConnection').hidden=true;find('#cloudVisionChoice').hidden=true;find('#pullModel').hidden=true;find('#engineStatus').classList.remove('ready');find('#engineStatus').textContent='请选择云端解题或本机解题';renderEngineRoute();return;}
      if(solveMode==='local'&&localWorkflow==='clipboard'){
        engineReady=false;cloudPrimary=false;find('#cloudConnection').hidden=true;find('#cloudVisionChoice').hidden=true;find('#pullModel').hidden=true;find('#engineStatus').classList.add('ready');find('#engineStatus').textContent='本机浏览器复制粘贴流程已就绪 · 不调用云端模型';renderEngineRoute();return;
      }
      if(remote&&solveMode==='local'){
        engineReady=false;cloudPrimary=true;find('#cloudConnection').hidden=true;find('#cloudVisionChoice').hidden=true;find('#pullModel').hidden=true;find('#engineStatus').classList.add('ready');find('#engineStatus').textContent='本机浏览器内置解题引擎已就绪 · 不调用云端模型';renderEngineRoute();return;
      }
      if(!runtime.config.apiEnabled){
        engineReady=false;
        if(solveMode==='cloud')setCloudConnection('failed','云端：服务尚未配置');
        find('#cloudVisionChoice').hidden=true;
        find('#engineStatus').classList.remove('ready');
        find('#engineStatus').textContent='内置解题与离线画板已就绪 · 开放题智能增强未配置';
        find('#pullModel').hidden=true;
        find('#solveButton').disabled=processing;
        find('#engineRefresh').disabled=true;
        renderEngineRoute();return;
      }
      const needsLogin=remote&&runtime.config.requiresAuth&&!runtime.hasSession();
      find('#cloudAuth').hidden=!remote||!runtime.config.requiresAuth||solveMode!=='cloud';
      if(needsLogin){
        engineReady=false;
        setCloudConnection('disconnected','云端：尚未连接，请输入访问口令');
        find('#cloudVisionChoice').hidden=true;
        find('#engineStatus').classList.remove('ready');
        find('#engineStatus').textContent='在线解题需要授权 · 请输入访问口令';
        find('#pullModel').hidden=true;
        find('#solveButton').disabled=processing;
        find('#engineRefresh').disabled=true;
        renderEngineRoute();if(start)openCloudAuthDialog('当前没有有效会话，请重新输入访问口令。');void checkCloudConnection();return;
      }
      try{
        if(remote&&solveMode==='cloud')setCloudConnection('checking','云端：正在检测连接…');
        if(start&&!remote)await request('/api/ai/start',{});
        const data=await request('/api/health');
        if(solveMode!==requestedMode)return;
        if(!data.engine||typeof data.engine!=='object')throw Object.assign(new Error('云端健康信息不完整，请联系管理员。'),{code:'invalid_response'});
        cloudPrimary=data.engine.remote===true;
        cloudTransport=data.capabilities?.transport==='sse'?'sse':'jobs';
        visionAvailable=data.engine.vision!==false;
        find('#cloudVisionChoice').hidden=!(remote&&visionAvailable&&data.engine.available);
        const names=data.engine.models||[];
        const recommended='hf.co/bartowski/DeepSeek-R1-Distill-Llama-8B-GGUF:Q4_K_M';
        const localNames=names.filter(name=>!/qwen/i.test(name)&&!/^deepseek-r1:(?:1\.5b|7b|8b|14b|32b)$/i.test(name));
        const choices=remote?[...names]:[...new Set([...localNames,data.default_model||recommended,recommended])];
        const select=find('#modelName');
        const remembered=remote?lastModel:(/qwen/i.test(lastModel)?'':lastModel);
        const chosen=remembered||select.value||data.default_model||recommended;
        select.replaceChildren(...choices.map(name=>{const option=document.createElement('option');option.value=name;option.textContent=remote?`云端 · ${modelOwner(name)} · ${name}`:`本机 · ${modelOwner(name)} · ${name} · ${names.includes(name)?'已下载':'未下载'}`;return option;}));
        select.value=choices.includes(chosen)?chosen:(names[0]||choices[0]);
        const selectedReady=data.engine.available&&names.includes(select.value);
        engineReady=selectedReady;
        if(remote&&solveMode==='cloud'){
          if(cloudUnavailable&&selectedReady)api.setStatus('云端连接已恢复，模型已就绪。点击“解题”开始，当前题稿保持不变。');
          showCloudFallback(!selectedReady,selectedReady?'':'云端服务已连接，但当前模型暂不可用。推荐改用本机解题，或稍后重试。');
        }
        if(remote&&solveMode==='cloud')setCloudConnection('connected',selectedReady?'云端：连接成功 · 模型已就绪':'云端：已连接 · 模型暂不可用');
        find('#engineStatus').classList.toggle('ready',selectedReady);
        find('#engineStatus').textContent=selectedReady?(remote?'内置解题 + 在线智能增强已就绪':'内置解题 + 可选本机智能增强已就绪'):data.engine.available?(remote?'内置解题可用 · 在线增强模型未选择':'内置解题可用 · 可选择已安装模型增强'):data.engine.installed?'内置解题可用 · 智能增强组件可选':remote?'内置解题可用 · 在线增强暂不可用':'内置解题已就绪 · 无需安装额外模型';
        find('#pullModel').hidden=remote||cloudPrimary||selectedReady;
        find('#engineSetup').hidden=false;
        renderEngineRoute();
      }catch(error){if(solveMode!==requestedMode)return;engineReady=false;if(remote&&solveMode==='cloud')setCloudConnection('failed',runtime.config.requiresAuth&&!runtime.hasSession()?'云端：授权已失效':'云端：连接失败');cloudFailure(error);find('#cloudVisionChoice').hidden=true;find('#engineStatus').classList.remove('ready');find('#engineStatus').textContent=remote?'内置浏览器解题可用；在线增强暂不可用。':'无法连接本机服务；浏览器内置解题仍可使用。';find('#solveButton').disabled=processing;renderEngineRoute();if(start)report(error);}
    }
    async function runJob(body,done) {
      if(activeJob)return;
      activeJob='pending';find('#cancelJob').disabled=true;
      busy(true);find('#jobPhase').textContent='正在连接解题引擎…';
      try{
        if(solveMode==='cloud'&&cloudTransport==='sse'&&['solve','chat'].includes(body.kind)){
          streamController=new AbortController();activeJob='stream';find('#cancelJob').disabled=false;
          const result=await runtime.streamJob(body,{signal:streamController.signal,onProgress:count=>{find('#jobPhase').textContent=`云端正在整理解答 · ${count} 字符`;}});
          await done(result);return;
        }
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
        if(current.status==='cancelled'){if(body.kind==='solve')progress('error','本次解题已停止。');api.setStatus('任务已停止，已有题目和解析仍保留。');return;}
        await done(current.result);
      }catch(error){if(error.name==='AbortError'){if(body.kind==='solve')progress('error','本次解题已停止。');api.setStatus('任务已停止，当前题稿保留。');return;}if(body.kind==='solve')progress('error','解题未完成：'+(error.message||String(error)));cloudFailure(error);report(error);}
      finally{streamController=null;activeJob=null;busy(false);refreshEngine();}
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
      restore.onclick=()=>{clearStepHighlight();api.question.value=draft.question;localStorage.removeItem(draftKey);box.hidden=true;api.remember();api.setStatus('已恢复上次编辑的题目草稿。');};
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
      clearStepHighlight();
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
    function acceptSolution(result,original,{installGraph=true}={}){
      if(api.question.value.trim()!==original){api.setStatus('题目已修改，本次旧题结果未应用。请点击“解题”求解当前题目。');return false;}
      if(['cloud-ai','local-ollama','external-ai'].includes(result.mode)){
        let exactSolution;
        try{exactSolution=api.solveDeterministic?.(original);}catch{}
        const exactScene=exactSolution?.scene,completion=exactSolution?.completion||{};
        const exactComplete=Number(completion.total)>0&&Number(completion.answered)===Number(completion.total);
        if(exactSolution?.parts?.length){
          const exactByIndex=new Map(exactSolution.parts.filter(part=>part.status==='answered').map(part=>[Number(part.index),part]));
          let corrected=false;
          result.parts=(result.parts||[]).map(part=>{const exact=exactByIndex.get(Number(part.index));if(!exact)return part;corrected=true;return{...part,model_answer:part.model_answer||(part.answer!==exact.answer?part.answer:undefined),answer:exact.answer,steps:exact.steps,status:'answered',verification:exact.verification||{status:exactSolution.verification?.status||'generated',message:'题面独立复算，不代表已证明全部 AI 推导'},derivation:exact.derivation,source:'symbolic-verified-override'};});
          if(corrected){
            result.completion={answered:result.parts.filter(part=>part.status==='answered').length,total:result.parts.length};
            if(result.parts.length===1){result.answer=result.parts[0].answer;result.steps=result.parts[0].steps;}
            const verifiedParts=result.parts.filter(p=>p.source==='symbolic-verified-override').length;
            const nativeReport=exactSolution.verification||{},checks=nativeReport.checks||[],counts=nativeReport.counts||{};
            result.verification={status:nativeReport.status||'generated',checks,counts:{verified:counts.verified||0,contradicted:counts.contradicted||0,unresolved:(counts.unresolved||0)+result.parts.length-verifiedParts},message:`内置引擎从原题独立复算了 ${verifiedParts} 个已覆盖小问；其它推导及一般性证明仍需核验。`};
            result.quality_notice='已覆盖的小问由内置数学引擎独立复算，最终结论以该小问的核验结果为准。';
          }
        }
        if(result.mode!=='external-ai'&&exactComplete&&exactScene&&!result.scene?.objects?.length&&!result.scene?.lines?.length){
          result.scene=exactScene;
          result.scene_notice='AI 已先完成解答；画板由原题的独立符号模型对齐题目与答案。';
        }else if(result.scene&&(exactComplete||exactScene?.inferredFromConditions||exactScene?.inferred_from_conditions)&&exactScene?.type===result.scene.type){
          // Keep the validated reply's dependency graph while correcting primary parameters.
          for(const key of ['a','b','r','p','h','k','direction','orientation'])if(exactScene[key]!=null)result.scene[key]=exactScene[key];
          const declared=new Set(window.DongSceneAudit.declared(original));
          result.scene.points||={};
          for(const [name,point] of Object.entries(exactScene.points||{}))if(declared.has(window.DongSceneAudit.canonical(name)))result.scene.points[name]=point;
          if(exactSolution.engineExtensions?.includes('axis-intercept-chord')){
            for(const key of ['theta','lineThrough','dynamicIntersectionLabels','showDynamic'])if(exactScene[key]!=null)result.scene[key]=exactScene[key];
            window.DongSceneMerge.mergeDerived(result.scene,exactScene);
          }
          result.scene.exact=exactScene.exact||{};
          result.scene_notice='题面支持的主曲线参数已复算；AI 回复的关联构造保留，其它结论仍需核验。';
        }else if(result.mode!=='external-ai'&&exactScene&&(!result.scene||exactComplete||exactScene.inferredFromConditions||exactScene.inferred_from_conditions)){
          result.scene=exactScene;
          result.scene_notice='AI 已先完成解答；画板再由可核验的符号模型对齐题目与答案。';
        }
      }
      if(installGraph)result=api.enrichSolvedScene?.(result,original)||result;
      else{result.scene=null;result.scene_notice='仅导入文字；原画板未替换，不应当作本题的新图形。';}
      api.showSolution(result);
      if(result.scene){try{api.installScene(api.modelFromJson(JSON.stringify(result.scene)),['local-ollama','cloud-ai','external-ai'].includes(result.mode)?'智能生成图形（需核验）':'内置精确建模');}catch(error){result.scene_notice='图形未能载入，解析已保留：'+error.message;}}
      else if(api.state.model){api.state.exploring=true;find('#exploreNotice').hidden=false;find('#exploreNotice').textContent='本题没有生成新图形，画板仍是此前的图稿，不对应当前解析。';}
      inspectorView='lesson';renderSolution();api.remember();
      if(api.question.value.trim()===original){try{saveLesson(true);}catch(error){report(error);return;}}
      const completion=result.completion||{answered:0,total:(result.parts||[]).length||1};
      progress(completion.answered===completion.total?'complete':'partial',`解题完成：已解答 ${completion.answered}/${completion.total} 问${completion.answered<completion.total?'，其余待推导':''}。`);
      api.setStatus(`${result.mode==='external-ai'?'外部 AI 回复已导入':result.mode==='cloud-ai'?'云端 AI 返回':'内置引擎已完成'} ${completion.answered}/${completion.total} 问；${verificationNames[result.verification?.status]||'请核对步骤'}。${result.scene_notice||''}`);
      return completion;
    }
    function checkQuestionGeometry(scene,question){
      const native=api.solveDeterministic?.(question),expected=native?.scene;
      if(!expected||!native.completion?.total||native.completion.answered!==native.completion.total)return [];
      if(expected.type!==scene.type)return ['作图主曲线与题面的内置复算结果冲突。'];
      for(const key of ['a','b','r','p','h','k'])if(Number.isFinite(expected[key])&&Number.isFinite(scene[key])&&Math.abs(expected[key]-scene[key])>1e-8*Math.max(1,Math.abs(expected[key])))return ['作图参数 '+key+' 与题面复算结果冲突。'];
      for(const [key,p] of Object.entries(expected.points||{}))if(scene.points[key]&&p.some((v,i)=>Math.abs(v-scene.points[key][i])>1e-8*Math.max(1,Math.abs(v))))return ['固定点 '+key+' 的坐标与题面冲突。'];
      return [];
    }
    const externalAI=window.DongExternalAI.attach({question:api.question,download:api.download,report,progress,getProgress:()=>solveProgress.dataset.state,markup,typeset,accept:acceptSolution,checkQuestionGeometry});
    async function solve() {
      if(processing)return;
      if(!solveMode){showModes(true);api.setStatus('请先选择云端解题或本机解题。');return;}
      let original=api.question.value.trim();
      if(!original){report(new Error(find('#imageFile').files[0]?'请先点击“识别题图”，核对文字后解答。':'请先输入完整题目。'));return;}
      if(hasUncertainty(original)){report(new Error('题面仍含“[看不清]”或其它未确认字段。请先补正后再解题。'));return;}
      const repair=questionRepairSuggestion(original);
      if(repair){
        const accepted=window.confirm(`${repair.issue}\n\n${repair.suggestion}\n\n是否按照原题“PO”修正后继续解题？`);
        if(!accepted){progress('error','题面冲突，已停止解题。');api.setStatus('请核对 PQ/PO 后再解题。');return;}
        clearStepHighlight();api.question.value=repair.corrected;original=repair.corrected.trim();api.remember();api.setStatus('已在你确认后将矛盾的“直线 PQ”修正为“直线 PO”，正在继续解题。');
      }
      if(solveMode==='cloud'&&(runtime.config.deployment==='web'||!!runtime.config.apiBase)&&runtime.config.requiresAuth&&(!engineReady||!cloudPrimary)){
        progress('error','云端解题尚未就绪，本次未改用内置规则。');
        api.setStatus('你选择的是云端解题，但当前云端会话或模型尚未就绪。请先完成访问验证，并等待状态显示“已就绪”；系统不会再把内置规则的结果冒充成云端回答。');
        if(!runtime.hasSession())openCloudAuthDialog('请先输入访问口令，验证成功后会自动检测云端模型。');
        void refreshEngine();
        return;
      }
      if(solveMode==='local'&&localWorkflow==='clipboard'){await externalAI.open();return;}
      progress('solving','正在解题：识别条件、推导并核对结果…');
      const acceptResult=result=>acceptSolution(result,original);
      if(solveMode==='cloud'&&engineReady&&cloudPrimary){
        api.setStatus('云端 AI 正在先识别题意并完成答案；答案确定后再建立对应图形。');
        await runJob({kind:'solve',text:original,model:find('#modelName').value,depth:find('#solveDepth').value},acceptResult);
        return;
      }
      if(solveMode==='local'&&localWorkflow==='model'&&engineReady&&!cloudPrimary){
        api.setStatus('本机 AI 正在先识别题意并完成答案；答案确定后再建立对应图形。');
        await runJob({kind:'solve',text:original,model:find('#modelName').value,depth:find('#solveDepth').value},acceptResult);
        return;
      }
      let deterministic;
      busy(true);find('#jobPhase').textContent='正在进行内置识题、符号推导与图形校验…';
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      try{
        const browser=api.solveDeterministic?.(original);
        if(browser?.engineExtensions?.length)deterministic=browser;
        if(!deterministic&&runtime.config.apiEnabled&&(solveMode==='cloud'||(runtime.config.deployment!=='web'&&!runtime.config.apiBase))){try{deterministic=await request('/api/solve',{text:original,rules_only:true});}catch(error){if(!api.solveDeterministic)throw error;}}
        if(!deterministic)deterministic=browser;
        if(!deterministic)throw new Error('当前环境未能启动内置解题模块。');
        acceptResult(deterministic);
      }catch(error){progress('error','解题未完成：'+(error.message||String(error)));report(error);return;}
      finally{busy(false);}
      if(api.question.value.trim()!==original)return;
      const completion=deterministic.completion||{answered:0,total:(deterministic.parts||[]).length||1};
      if(completion.answered<completion.total&&engineReady&&solveMode==='local'&&localWorkflow==='model'&&!cloudPrimary){
        api.setStatus(`内置引擎先完成 ${completion.answered}/${completion.total} 问；正在用可选智能引擎补充其余小问。`);
        await runJob({kind:'solve',text:original,model:find('#modelName').value,depth:find('#solveDepth').value},acceptResult);
      }else if(completion.answered<completion.total){
        api.setStatus(`内置引擎已完成 ${completion.answered}/${completion.total} 问；其余小问待推导。${solveMode==='cloud'?'云端服务当前未就绪，请检查连接。':'如需智能增强，请在电脑本机版下载模型。'}`);
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
        cloudFeedback.dataset.state='checking';cloudFeedback.textContent='正在验证口令并检测云端服务…';setCloudConnection('checking','云端：正在验证访问口令…');
        await runtime.authenticate(input.value);
        await runtime.request('/api/health');
        input.value='';
        for(const id of ['solveButton','recognizeButton','engineRefresh'])find('#'+id).disabled=false;
        cloudFeedback.dataset.state='success';cloudFeedback.textContent='授权成功，正在确认云端模型状态。';setCloudConnection('connected','云端：连接成功 · 正在读取模型');
        api.setStatus('在线解题授权成功，本次浏览器会话内有效。');
        await refreshEngine();
        cloudFeedback.dataset.state=engineReady?'success':'error';cloudFeedback.textContent=engineReady?'连接成功。云端模型已就绪。':'授权成功，但云端模型暂不可用。可以改用本机解题。';
        if(engineReady)setTimeout(()=>{if(cloudDialog.open)cloudDialog.close();},500);
      }catch(error){cloudFeedback.dataset.state='error';cloudFeedback.textContent=error.message||'连接失败，请检查网络或服务状态。';const label=error.code==='auth_rejected'?'云端：口令错误':error.code==='session_expired'?'云端：会话失效':error.code==='rate_limited'?'云端：尝试过于频繁':error.code==='empty_key'?'云端：请输入口令':runtime.hasSession()?'云端：已授权，但服务连接失败':'云端：服务连接失败，口令尚未验证';setCloudConnection('failed',label);cloudFailure(error);report(error);input.focus();input.select();}
      finally{find('#cloudLogin').disabled=false;}
    });
    find('#cloudAccessKey').addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.isComposing)find('#cloudLogin').click();});
    find('#openCloudAuth').addEventListener('click',()=>openCloudAuthDialog());
    find('#openCloudAuthInSetup').addEventListener('click',()=>openCloudAuthDialog());
    find('#closeCloudAuth').addEventListener('click',()=>cloudDialog.close());
    find('#toggleCloudSecret').addEventListener('click',event=>{const input=find('#cloudAccessKey'),hidden=input.classList.toggle('secret-text');event.currentTarget.textContent=hidden?'显示':'隐藏';event.currentTarget.setAttribute('aria-pressed',String(!hidden));input.focus();});
    find('#clearButton').addEventListener('click',renderSolution);
    find('#modelName').addEventListener('change',event=>{lastModel=event.target.value;localStorage.setItem(modelKey,lastModel);renderEngineRoute();refreshEngine();});
    find('#pullModel').addEventListener('click',()=>runJob({kind:'pull',model:find('#modelName').value},result=>api.setStatus(result.message)));
    find('#cancelJob').addEventListener('click',async()=>{if(streamController){streamController.abort();find('#jobPhase').textContent='正在停止，请稍候…';return;}if(activeJob){try{await request('/api/jobs/'+activeJob+'/cancel',{});find('#jobPhase').textContent='正在停止，请稍候…';}catch(error){report(error);}}});
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
    find('#confirmRecognition').addEventListener('click',()=>{const recognized=find('#recognizedText').value;if(hasUncertainty(recognized)){report(new Error('识别结果仍含“[看不清]”或其它未确认字段。请在此窗口补正后再确认。'));return;}clearStepHighlight();api.question.value=recognized;find('#recognitionDialog').close();api.remember();api.setStatus('题面已确认，可以开始解题。');});
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
      clearStepHighlight();
      if(formulaPreview.open)refreshFormula();
      api.remember();
      clearTimeout(draftTimer);
      draftTimer=setTimeout(saveDraft,300);
      if(api.state.solution)renderSolution();
    });
    api.question.addEventListener('keydown',event=>{if(event.ctrlKey&&event.key==='Enter')solve();});
    window.addEventListener('beforeunload',event=>{if(activeJob){event.preventDefault();event.returnValue='';}});
    classroom=window.DongClassroom.attach({...api,renderSolution,sendFeedback:followup,showLearning:()=>setInspectorView('lesson'),saveStudy(){if(api.state.solution&&api.question.value.trim()===api.state.solution.restatement.trim()){try{saveLesson(true);}catch(error){report(error);}}}});
    window.DongQuestionBank?.attach({...api,restoreLesson,saveCurrent:()=>saveLesson(true),showLearning:()=>setInspectorView('lesson')});
    renderDraftRecovery();
    return {refreshEngine,renderSolution,solve,clearStepHighlight};
  }
  window.DongLearning={attach,questionRepairSuggestion};
})();
