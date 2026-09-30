(function () {
  'use strict';
  const raw = window.DONGJIEXI_CONFIG || {};
  const config = Object.freeze({
    version: String(raw.version || '0.41.3'),
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
      if (controller?.signal.aborted) throw failure('timeout', path === '/api/session' ? '云端连接超时，访问口令尚未完成验证。' : '云端连接超时，请稍后重试或改用本机解题。');
      if (error.name === 'AbortError') throw error;
      throw failure('network', '无法连接云端服务，请检查网络，或由管理员检查服务地址。这不表示访问口令错误。');
    }
    finally { if (timer) clearTimeout(timer); }
    const type = response.headers.get('content-type') || '';
    const data = type.includes('application/json') ? await response.json() : null;
    if (response.status === 401) clearSession();
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
    const timer = setTimeout(() => controller.abort(), 7000);
    try {
      const response = await fetch(url, {method: 'GET', cache: 'no-store', credentials: 'omit',
        headers: session ? {Authorization: `Bearer ${session.token}`} : {}, signal: controller.signal});
      if (response.status === 401) return {reachable: true, needsAuth: true};
      if (!response.ok) throw failure(response.status === 429 ? 'rate_limited' : 'service_unavailable', `云端服务暂不可用（HTTP ${response.status}）。`, response.status);
      const data = (response.headers.get('content-type') || '').includes('application/json') ? await response.json() : null;
      if (!data || !['董解析', '智几何'].includes(data.app) || !data.engine || typeof data.engine !== 'object')
        throw failure('invalid_response', '服务地址未返回董解析健康信息，请联系管理员。');
      return {reachable: true, needsAuth: config.requiresAuth && !session, data};
    } catch (error) {
      if (controller.signal.aborted) throw failure('timeout', '云端连接超时，请稍后重试或改用本机解题。');
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

  window.DongRuntime = Object.freeze({config, apiUrl, request, probeCloud, authenticate, clearSession, hasSession: () => !!readSession()});
})();
