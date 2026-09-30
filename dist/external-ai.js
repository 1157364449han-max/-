/* Clipboard workflow; all inference happens in the user's chosen external AI. */
(() => {
  'use strict';
  function attach(api) {
    const root=document.createElement('dialog');root.id='externalAIDialog';root.className='study-dialog external-ai-dialog';root.setAttribute('aria-labelledby','externalAITitle');
    root.innerHTML=`<header><h2 id="externalAITitle">使用已有 AI · 复制粘贴解题</h2><button class="button secondary" id="closeExternalAI" type="button">关闭</button></header>
      <p class="help">① 复制请求到你使用的 AI　② 粘贴完整回复　③ 预览并导入。董解析不调用云端模型、不消耗平台解题次数；外部 AI 的使用规则仍然适用。</p>
      <div class="external-request-actions"><button class="button primary" id="copyExternalRequest" type="button">复制解题请求</button><button class="button secondary" id="regenerateExternalRequest" type="button">按当前题目重新生成</button><button class="button secondary" id="exportExternalRequest" type="button">保存请求文本</button></div>
      <details id="externalRequestDetails"><summary>查看完整请求 · 不需要 API 或本机模型</summary><textarea id="externalRequestText" readonly aria-label="完整解题请求" data-no-math></textarea></details>
      <p id="externalQuestionSummary" class="help"></p>
      <label for="externalReply">粘贴 AI 的完整回复（包含解析及 JSON 作图代码块）</label><textarea id="externalReply" placeholder="在你使用的 AI 中获得回复后，将全部内容粘贴到这里。普通文字也可以导入，但不保证自动建图。" maxlength="150000" data-no-math></textarea>
      <div class="external-request-actions"><button class="button primary" id="previewExternalReply" type="button">校验与预览</button><button class="button secondary" id="repairExternalReply" type="button">复制补充 / 修正请求</button></div>
      <p id="externalFeedback" role="status" aria-live="polite"></p><ul id="externalWarnings"></ul>
      <section id="externalPreview" class="solution" hidden></section>
      <div id="externalImportOptions" hidden><label class="external-confirm"><input type="checkbox" id="externalConfirmQuestion">我确认回复对应当前题目</label><label class="external-confirm"><input type="checkbox" id="externalUseScene">同时导入通过数据检查的图形（数学结论仍需核验）</label><p id="externalSceneStatus" class="help"></p><button class="button primary" id="importExternalReply" type="button">导入解析与可用图形</button></div>
      <p class="help">本次仅在浏览器处理文字。原来的内置解题与下载模型仍可从“本机解题方式”选择。复制或取消不会改变当前画板。</p>`;
    document.body.append(root);
    const find=selector=>root.querySelector(selector);
    let request=null,preview=null,lastReply='',modulePromise=null,opening=false;
    const contract=()=>modulePromise??=(import('./external-contract.mjs').catch(error=>{modulePromise=null;throw error;}));
    const feedback=(message,error=false)=>{find('#externalFeedback').textContent=message;find('#externalFeedback').dataset.state=error?'error':'ready';};
    function resetPreview(){preview=null;find('#externalPreview').hidden=true;find('#externalImportOptions').hidden=true;find('#externalWarnings').replaceChildren();}
    function current(){return api.question.value.trim()===request?.question;}
    function validQuestion(){if(!current())throw new Error('原题已修改，请重新生成请求；旧回复不会应用到新题。');}
    async function generate(){
      const question=api.question.value.trim(),core=await contract();
      if(!question)throw new Error('请先输入完整题目。');
      request=core.makeRequest(question,'req-'+crypto.randomUUID());resetPreview();
      find('#externalRequestText').value=request.prompt;find('#externalQuestionSummary').textContent=`本次请求包含 ${request.parts.length} 个小问。完整原题及公式已保留在上方请求文本中。`;
      feedback('请求已在本机生成。复制到你使用的 AI，获得完整回复后粘贴回来。');
    }
    async function copy(value){
      try{await navigator.clipboard.writeText(value);return true;}catch{
        const area=find('#externalRequestText');area.value=value;find('#externalRequestDetails').open=true;area.focus();area.select();
        feedback('浏览器未允许自动复制，文本已选中；电脑按 Ctrl+C，手机长按选择“复制”。');return false;
      }
    }
    async function open(){
      if(opening)return;opening=true;
      try{if(!request||!current())await generate();if(!root.open)root.showModal();api.progress('waiting','等待外部 AI 回复：复制请求后，粘贴回复并导入。');}
      catch(error){api.report(error);}finally{opening=false;}
    }
    const handle=fn=>async()=>{try{await fn();}catch(error){feedback(error.message||String(error),true);api.report(error);}};
    find('#closeExternalAI').onclick=()=>root.close();
    find('#regenerateExternalRequest').onclick=handle(generate);
    find('#copyExternalRequest').onclick=handle(async()=>{validQuestion();if(await copy(request.prompt))feedback('解题请求已复制。请粘贴到你正在使用的 AI。');});
    find('#exportExternalRequest').onclick=handle(()=>{validQuestion();api.download('董解析-外部AI解题请求.txt',new Blob([request.prompt],{type:'text/plain;charset=utf-8'}));});
    find('#externalReply').addEventListener('input',()=>{resetPreview();feedback('回复已修改，请重新校验后导入。');});
    find('#previewExternalReply').onclick=handle(async()=>{
      resetPreview();validQuestion();const core=await contract(),reply=find('#externalReply').value;
      const candidate=core.parseReply(reply,request);
      if(candidate.graphValid){const issues=[...core.inspectGeometry(candidate.result.scene,window.DongConstruct),...(api.checkQuestionGeometry?.(candidate.result.scene,request.question)||[])];if(issues.length){candidate.warnings.push(...issues);candidate.graphValid=false;}}
      validQuestion();preview=candidate;lastReply=reply;
      find('#externalWarnings').replaceChildren(...candidate.warnings.map(message=>{const item=document.createElement('li');item.textContent=message;return item;}));
      const display=find('#externalPreview');display.innerHTML=api.markup(candidate.result,true);display.hidden=false;api.typeset(display);
      const confirm=find('#externalConfirmQuestion');confirm.checked=false;confirm.closest('label').hidden=!candidate.requiresConfirmation;
      const graph=find('#externalUseScene');graph.checked=candidate.graphValid;graph.disabled=!candidate.graphValid;
      find('#externalSceneStatus').textContent=candidate.graphValid?`数据引用及当前构造位置已检查：固定点 ${Object.keys(candidate.result.scene.points).length} 个，直线 ${candidate.result.scene.lines.length} 条，关联构造 ${candidate.result.scene.objects.length} 个。这不等于证明或轨迹已验证。`:'未获得完整可用的图形。本次只导入文字，不替换已有画板；可复制补充作图请求。';
      find('#externalImportOptions').hidden=false;feedback('预览完成。请核对答案及提示，确认后才会修改题稿。');
    });
    find('#repairExternalReply').onclick=handle(async()=>{
      validQuestion();const core=await contract();let warnings=preview?.warnings||[];
      if(!warnings.length)warnings=['请核对全部小问，补齐答案需要的点线与依赖构造，并遵守输出格式。'];
      if(await copy(core.makeRepairRequest(request,find('#externalReply').value,warnings)))feedback('修正请求已复制，发给原来的 AI 后，将新的完整回复粘贴回来。');
    });
    find('#importExternalReply').onclick=handle(()=>{
      validQuestion();if(!preview||lastReply!==find('#externalReply').value)throw new Error('回复已改变或尚未预览，请先校验。');
      if(preview.requiresConfirmation&&!find('#externalConfirmQuestion').checked)throw new Error('请确认这份回复对应当前原题。');
      const useScene=preview.graphValid&&find('#externalUseScene').checked;
      const result=JSON.parse(JSON.stringify(preview.result));if(!useScene)result.scene=null;
      if(api.accept(result,request.question,{installGraph:useScene})===false)throw new Error('未导入，请核对当前题目。');
      root.close();
    });
    root.addEventListener('close',()=>{if(api.getProgress()==='waiting')api.progress('idle','复制粘贴窗口已关闭，当前题稿保持不变。');});
    return {open};
  }
  window.DongExternalAI={attach};
})();
