(function () {
  'use strict';
  const banner = document.getElementById('pwaBanner');
  const message = document.getElementById('pwaMessage');
  const updateButton = document.getElementById('pwaUpdate');
  const dismissButton = document.getElementById('pwaDismiss');
  const installButton = document.getElementById('pwaInstall');
  let registration = null;
  let installPrompt = null;
  let refreshing = false;
  let controlledAtStart = !!navigator.serviceWorker?.controller;

  function show(text, {update = false, dismiss = true} = {}) {
    if (!banner || !message) return;
    message.textContent = text;
    updateButton.hidden = !update;
    dismissButton.hidden = !dismiss;
    banner.hidden = false;
  }

  function watchWaiting(worker) {
    if (!worker) return;
    show('董解析有新版本可用。更新后电脑与手机将使用同一版本。', {update: true});
    updateButton.onclick = () => {
      updateButton.disabled = true;
      message.textContent = '正在切换到新版本…';
      worker.postMessage({type: 'SKIP_WAITING'});
    };
  }

  async function checkVersion() {
    try {
      const response = await fetch(`app-version.json?t=${Date.now()}`, {cache: 'no-store'});
      if (!response.ok) return;
      const remote = await response.json();
      const current = localStorage.getItem('dongjiexi:app-version');
      if (!current) localStorage.setItem('dongjiexi:app-version', remote.version);
      if (current && current !== remote.version) {
        await registration?.update();
        if (!registration?.waiting) show(`已检测到 v${remote.version}，正在准备安全更新…`, {dismiss: false});
      }
    } catch {
      // 离线时保持当前可用版本，不打断做题。
    }
  }

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
    if (installButton) installButton.hidden = false;
  });
  installButton?.addEventListener('click', async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    installPrompt = null;
    installButton.hidden = true;
  });
  dismissButton?.addEventListener('click', () => { banner.hidden = true; });
  window.addEventListener('offline', () => show('当前处于离线状态：画板和已保存题稿可继续使用，AI 解题需联网。'));
  window.addEventListener('online', () => { if (banner && updateButton.hidden) banner.hidden = true; checkVersion(); });

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!controlledAtStart) {
        controlledAtStart = true;
        return;
      }
      if (refreshing) return;
      refreshing = true;
      sessionStorage.setItem('dongjiexi:just-updated', '1');
      location.reload();
    });
    window.addEventListener('load', async () => {
      try {
        registration = await navigator.serviceWorker.register('./service-worker.js', {updateViaCache: 'none'});
        if (registration.waiting) watchWaiting(registration.waiting);
        registration.addEventListener('updatefound', () => {
          const installing = registration.installing;
          installing?.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) watchWaiting(installing);
          });
        });
        if (sessionStorage.getItem('dongjiexi:just-updated')) {
          sessionStorage.removeItem('dongjiexi:just-updated');
          localStorage.setItem('dongjiexi:app-version', window.DongRuntime?.config.version || '0.34.0');
          show('董解析已更新到最新版本。', {dismiss: true});
        }
        await registration.update();
        await checkVersion();
        setInterval(checkVersion, 30 * 60 * 1000);
        document.addEventListener('visibilitychange', () => { if (!document.hidden) checkVersion(); });
      } catch {
        show('离线安装暂不可用，但当前网页仍可继续使用。');
      }
    });
  }
})();
