(function () {
  'use strict';
  const raw = window.DONGJIEXI_CONFIG || {};
  const config = Object.freeze({
    version: String(raw.version || '0.43.3'),
    deployment: raw.deployment === 'web' ? 'web' : 'desktop',
    apiBase: String(raw.apiBase || '').trim().replace(/\/+$/, ''),
    apiEnabled: raw.apiEnabled !== false,
    requiresAuth: raw.requiresAuth === true,
    updateChannel: String(raw.updateChannel || 'stable')
  });

  const sessionKey = 'dongjiexi:cloud-session';
  function readSession() {
    try {
      const value = JSON.parse(sessionStorage.getItem(sessionKey) || 'null');
      if (!value?.token || Number(value.expiresAt || 0) <= Date.now() + 5000) return null;
      if (value.apiBase != null && value.apiBase !== config.apiBase) return null;
      return value;
    } catch { return null; }
  }

  function clearSession() { try { sessionStorage.removeItem(sessionKey); } catch {} }
  function clearRejectedSession(sent) {
    // A delayed rejection of an old token must not erase a freshly renewed one.
    if (sent && readSession()?.token === sent.token) clearSession();
  }

  function failure(code, message, status = 0) {
    const error = new Error(message); error.code = code; error.status = status; return error;
  }

  function apiUrl(path) {
    if (!config.apiEnabled) {
      throw new Error('在线版尚未配置云端解题服务。离线画板仍可使用；完整 AI 解题需要管理员部署独立 HTTPS 服务。');
    }
    const route = '/' + String(path || '').replace(/^\/+/, '');
    return config.apiBase ? config.apiBase + route : route;
  }

  async function request(path, body, options = {}) {
    const session = readSession();
    if (config.requiresAuth && path !== '/api/session' && !session) {
      throw new Error('在线解题尚未授权，请先输入访问口令。');
    }
    const init = body === undefined ? {} : {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(body)
    };
    init.headers = {...(init.headers || {}), ...(session ? {Authorization: `Bearer ${session.token}`} : {})};
    const url = apiUrl(path);
    let response;
    const controller = options.signal ? null : new AbortController();
    const timer = controller ? setTimeout(() => controller.abort(), 20000) : null;
    try { response = await fetch(url, {...init, ...options, signal: options.signal || controller.signal}); }
    catch (error) {
      if (controller?.signal.aborted) throw failure('timeout', path === '/api/session' ? '云端连接超时，访问口令尚未完成验证。' : '云端连接超时，请稍后重试。画板与题稿仍可使用。');
      if (error.name === 'AbortError') throw error;
      throw failure('network', '无法连接云端服务，请检查网络，或由管理员检查服务地址。这不表示访问口令错误。');
    }
    finally { if (timer) clearTimeout(timer); }
    const type = response.headers.get('content-type') || '';
    const data = type.includes('application/json') ? await response.json() : null;
    if (response.status === 401) clearRejectedSession(session);
    if (!response.ok) {
      const code = response.status === 401 ? (path === '/api/session' ? 'auth_rejected' : 'session_expired') :
        response.status === 429 ? 'rate_limited' : 'service_unavailable';
      throw failure(code, data?.error || `云端服务暂不可用（HTTP ${response.status}），请稍后重试；这不表示访问口令错误。`, response.status);
    }
    if (!data) throw failure('invalid_response', '解题服务返回了无法识别的数据。');
    return data;
  }

  // Only this read-only endpoint is public. A probe never creates or replaces a session.
  async function probeCloud() {
    const url = apiUrl('/api/health'), session = readSession();
    const controller = new AbortController();
    // Gateway model probing takes up to 7s; allow mobile network transit too.
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(url, {method: 'GET', cache: 'no-store', credentials: 'omit',
        headers: session ? {Authorization: `Bearer ${session.token}`} : {}, signal: controller.signal});
      if (response.status === 401) { clearRejectedSession(session); return {reachable: true, needsAuth: true}; }
      if (!response.ok) throw failure(response.status === 429 ? 'rate_limited' : 'service_unavailable', `云端服务暂不可用（HTTP ${response.status}）。`, response.status);
      const data = (response.headers.get('content-type') || '').includes('application/json') ? await response.json() : null;
      if (!data || !['董解析', '智几何'].includes(data.app) || !data.engine || typeof data.engine !== 'object')
        throw failure('invalid_response', '服务地址未返回董解析健康信息，请联系管理员。');
      return {reachable: true, needsAuth: config.requiresAuth && !session, data};
    } catch (error) {
      if (controller.signal.aborted) throw failure('timeout', '云端连接超时，请稍后重试。画板与题稿仍可使用。');
      if (error.code) throw error;
      throw failure('network', '无法连接云端服务。这不表示访问口令错误。');
    } finally { clearTimeout(timer); }
  }

  async function authenticate(accessKey) {
    if (!config.requiresAuth) return {authenticated: true};
    const phrase = String(accessKey || '').normalize('NFC').trim();
    if (!phrase) throw failure('empty_key', '请输入访问口令。');
    const data = await request('/api/session', {access_key: phrase});
    if (typeof data.token !== 'string' || !data.token.trim()) throw failure('invalid_response', '云端返回的授权信息不完整，请联系管理员；这不表示口令错误。');
    const expiresAt = Date.now() + Math.max(60, Number(data.expires_in || 0)) * 1000;
    sessionStorage.setItem(sessionKey, JSON.stringify({token: data.token, expiresAt, apiBase: config.apiBase}));
    return data;
  }

  async function streamJob(body, {signal, onProgress} = {}) {
    const session=readSession();
    if(config.requiresAuth&&!session)throw failure('session_expired','请先输入访问口令。',401);
    const controller=new AbortController(),abort=()=>controller.abort(signal?.reason);
    if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
    const timer=setTimeout(()=>controller.abort(),300000);
    let reader;
    try{
      const response=await fetch(apiUrl('/api/stream'),{method:'POST',headers:{'Content-Type':'application/json',...(session?{Authorization:`Bearer ${session.token}`}:{})},body:JSON.stringify(body),signal:controller.signal});
      if(!response.ok){
        const data=(response.headers.get('content-type')||'').includes('application/json')?await response.json():null;
        if(response.status===401)clearSession();
        throw failure(response.status===401?'session_expired':response.status===429?'rate_limited':'service_unavailable',data?.error||'云端解题服务暂不可用。',response.status);
      }
      if(!(response.headers.get('content-type')||'').includes('text/event-stream')||!response.body)throw failure('invalid_response','云端没有返回流式答案。');
      reader=response.body.getReader();const decoder=new TextDecoder('utf-8',{fatal:true});
      let pending='',content='',complete=false,wireBytes=0;
      const event=value=>{
        const data=value.split(/\r?\n/).filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');
        if(!data||data==='[DONE]')return;
        let item;try{item=JSON.parse(data);}catch{throw failure('invalid_response','云端答案片段格式无效。');}
        if(item.error)throw failure('service_unavailable','云端模型中断了本次解题。');
        for(const choice of item.choices||[]){
          if(choice.finish_reason&&choice.finish_reason!=='stop')throw failure('incomplete_response','答案未完整生成，请分问解答或重试。');
          complete=complete||choice.finish_reason==='stop';
          const token=choice.delta?.content||'';
          if(typeof token!=='string')throw failure('invalid_response','云端答案格式无效。');
          content+=token;if(content.length>100000)throw failure('invalid_response','云端答案过长，请分问解答。');
          if(token)onProgress?.(content.length);
        }
      };
      while(true){
        const {value,done}=await reader.read();if(done)break;
        // Per-token SSE metadata can outweigh the answer. Bound wire overhead separately;
        // retain the 100000-character answer/event caps and the request deadline below.
        wireBytes+=value.byteLength;if(wireBytes>8*1024*1024)throw failure('invalid_response','云端响应过长，请分问解答。');
        pending+=decoder.decode(value,{stream:true});let match;
        while((match=/\r?\n\r?\n/.exec(pending))){event(pending.slice(0,match.index));pending=pending.slice(match.index+match[0].length);}
        if(pending.length>100000)throw failure('invalid_response','云端响应片段过长。');
      }
      pending+=decoder.decode();if(pending.trim())event(pending);
      if(!complete||!content.trim())throw failure('incomplete_response','云端响应中断；没有把不完整内容作为答案。');
      if(body.kind==='chat')return {text:content};
      let raw;try{raw=JSON.parse(content);}catch{throw failure('invalid_response','云端答案 JSON 不完整，请重试。');}
      const {assemble}=await import('./cloud-contract.mjs');return assemble(raw,body.text,body.model);
    }catch(error){
      if(signal?.aborted)throw Object.assign(new Error('任务已停止。'),{name:'AbortError'});
      if(controller.signal.aborted)throw failure('timeout','本题解答超时，请重试或分问解答。');
      if(error.code)throw error;
      throw failure('network','云端连接中断，请稍后重试。画板与题稿仍可使用。');
    }finally{
      clearTimeout(timer);signal?.removeEventListener('abort',abort);
      if(reader){await reader.cancel().catch(()=>{});reader.releaseLock();}
    }
  }
  window.DongRuntime = Object.freeze({config, apiUrl, request, streamJob, probeCloud, authenticate, clearSession, hasSession: () => !!readSession()});
})();
