(function () {
  'use strict';
  const raw = window.DONGJIEXI_CONFIG || {};
  const config = Object.freeze({
    version: String(raw.version || '0.25.0'),
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
      return value;
    } catch { return null; }
  }

  function clearSession() { try { sessionStorage.removeItem(sessionKey); } catch {} }

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
    const response = await fetch(apiUrl(path), {...init, ...options});
    const type = response.headers.get('content-type') || '';
    const data = type.includes('application/json') ? await response.json() : null;
    if (response.status === 401) clearSession();
    if (!response.ok) {
      throw new Error(data?.error || `解题服务暂不可用（HTTP ${response.status}）。`);
    }
    if (!data) throw new Error('解题服务返回了无法识别的数据。');
    return data;
  }

  async function authenticate(accessKey) {
    if (!config.requiresAuth) return {authenticated: true};
    const data = await request('/api/session', {access_key: String(accessKey || '')});
    const expiresAt = Date.now() + Math.max(60, Number(data.expires_in || 0)) * 1000;
    sessionStorage.setItem(sessionKey, JSON.stringify({token: data.token, expiresAt}));
    return data;
  }

  window.DongRuntime = Object.freeze({config, apiUrl, request, authenticate, clearSession, hasSession: () => !!readSession()});
})();
