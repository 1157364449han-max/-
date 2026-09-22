/* 董解析 · official GeoGebra Classic integration.
 * GeoGebra® © GeoGebra GmbH, https://www.geogebra.org/
 * Official app assets are loaded on demand, not copied into this package.
 * Embedding: https://geogebra.github.io/docs/reference/en/GeoGebra_Apps_Embedding/
 * API: https://geogebra.github.io/docs/reference/en/GeoGebra_Apps_API/
 * License: https://www.geogebra.org/license (non-commercial use).
 */
(() => {
  'use strict';
  const KEY = 'dongjiexi:geogebra:v1';
  const BACKUP = KEY + ':previous';
  let dialog, host, status, api, loading, scriptPromise, latestScene = null;
  let saveTimer, busy = false, previousFocus, sessionTitle = 'GeoGebra 自由作图';
  const copy = value => value == null ? null : JSON.parse(JSON.stringify(value));
  const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const positive = (value, fallback) => Math.max(0.000001, Math.abs(finite(value, fallback)));
  const number = value => String(Math.round(finite(value) * 1e10) / 1e10);
  const info = message => { if (status) status.textContent = message; };
  const read = key => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } };
  const wrap = fn => (...args) => Promise.resolve().then(() => fn(...args)).catch(error => info(error.message || '操作未完成。'));

  function buildShell() {
    if (dialog) return;
    const css = document.createElement('style');
    css.textContent = `
      .dong-ggb-dialog{position:fixed;inset:0;z-index:10000;width:100vw;height:100dvh;max-width:none;max-height:none;margin:0;padding:0;border:0;background:#f6f8fb;color:#0c1b33;font-family:"Microsoft YaHei UI",system-ui,sans-serif;}
      .dong-ggb-dialog[open]{display:flex;flex-direction:column;}
      .dong-ggb-head{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:10px 16px;border-bottom:1px solid #d7e0eb;background:#fff;}
      .dong-ggb-title{font-size:16px;font-weight:750;margin-right:auto;}
      .dong-ggb-head button,.dong-ggb-import{font:inherit;font-size:13px;border:1px solid #c3d0df;border-radius:7px;background:#f8fafc;color:#163b53;padding:7px 10px;cursor:pointer;}
      .dong-ggb-head button:focus-visible,.dong-ggb-import:focus-within{outline:3px solid #25b8ad;outline-offset:2px;}
      .dong-ggb-head .dong-ggb-close{background:#0f9f99;color:#fff;border-color:#0f9f99;}
      .dong-ggb-note{margin:0;padding:7px 16px;font-size:12px;line-height:1.5;color:#496078;background:#eef7fa;}
      .dong-ggb-note a{color:#176779;}
      .dong-ggb-status{margin:0;padding:6px 16px;min-height:31px;font-size:12px;line-height:1.5;color:#385268;background:#fff;}
      .dong-ggb-host{flex:1;min-height:180px;width:100%;overflow:hidden;background:#fff;}
      .dong-ggb-host>div{height:100%;}
      @media(max-width:700px){.dong-ggb-head{padding:8px;gap:6px}.dong-ggb-title{width:100%;font-size:14px}.dong-ggb-head button,.dong-ggb-import{font-size:12px;padding:6px 8px}.dong-ggb-note{padding:6px 8px}}
    `;
    document.head.append(css);
    dialog = document.createElement('dialog');
    dialog.id = 'dong-geogebra-dialog';
    dialog.className = 'dong-ggb-dialog';
    dialog.setAttribute('aria-label', '董解析 · GeoGebra 动态几何编辑器');
    const header = document.createElement('div');
    header.className = 'dong-ggb-head';
    const title = document.createElement('strong');
    title.className = 'dong-ggb-title';
    title.textContent = '董解析 × GeoGebra · 动态几何编辑器';
    header.append(title);
    const button = (label, fn, className = '') => {
      const el = document.createElement('button');
      el.type = 'button'; el.textContent = label; el.className = className;
      el.addEventListener('click', wrap(fn)); header.append(el); return el;
    };
    button('导入当前画板', () => replaceWithScene(latestScene));
    button('新建空白图', () => replaceWithScene(null));
    button('恢复上一图', restorePrevious);
    button('保存 .ggb', download);
    button('保存图片', exportPng);
    const fileLabel = document.createElement('label');
    fileLabel.className = 'dong-ggb-import'; fileLabel.textContent = '打开 .ggb';
    const file = document.createElement('input');
    file.type = 'file'; file.accept = '.ggb'; file.hidden = true;
    file.addEventListener('change', wrap(async () => {
      const selected = file.files[0];
      if (!selected) return;
      if (selected.size > 25 * 1024 * 1024) throw new Error('请选择小于 25 MB 的 .ggb 文件。');
      await backupCurrent();
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('读取 .ggb 文件失败。'));
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.readAsDataURL(selected);
      });
      await loadBase64(base64);
      sessionTitle = selected.name.replace(/\.ggb$/i, '');
      await save();
      info('已打开 ' + selected.name + '；此图保存在当前设备。');
      file.value = '';
    }));
    fileLabel.append(file); header.append(fileLabel);
    button('返回董解析', close, 'dong-ggb-close');
    const note = document.createElement('p');
    note.className = 'dong-ggb-note';
    note.innerHTML = '选择“移动”后可拖动点、直线和圆；拖动 T 可改变题设动直线。用工具栏作平行线、垂线、切线、交点，输入栏可直接输入方程。此编辑器需要联网加载；图稿单独自动保存在本机，不自动回写题目答案。<br>GeoGebra® © GeoGebra GmbH · <a href="https://www.geogebra.org/" target="_blank" rel="noopener noreferrer">官方网站</a> · <a href="https://www.geogebra.org/license" target="_blank" rel="noopener noreferrer">非商业使用许可</a>';
    status = document.createElement('p'); status.className = 'dong-ggb-status'; status.setAttribute('role', 'status');
    host = document.createElement('div'); host.className = 'dong-ggb-host';
    const target = document.createElement('div'); target.id = 'dong-geogebra-applet'; host.append(target);
    dialog.append(header, note, status, host); document.body.append(dialog);
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    new ResizeObserver(() => {
      if (api && dialog.open) api.setSize(Math.max(300, host.clientWidth), Math.max(180, host.clientHeight));
    }).observe(host);
    document.addEventListener('visibilitychange', () => { if (document.hidden && api) save().catch(() => {}); });
  }

  function loadScript() {
    if (window.GGBApplet) return Promise.resolve();
    if (scriptPromise) return scriptPromise;
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://www.geogebra.org/apps/deployggb.js'; script.async = true;
      const timer = setTimeout(() => { script.remove(); reject(new Error('GeoGebra 加载超时，请检查网络后重新打开。董解析本地画板仍可使用。')); }, 45000);
      script.onload = () => { clearTimeout(timer); window.GGBApplet ? resolve() : reject(new Error('GeoGebra 加载器未能初始化。')); };
      script.onerror = () => { clearTimeout(timer); script.remove(); reject(new Error('无法连接 GeoGebra 官方服务，请检查网络后重新打开。')); };
      document.head.append(script);
    }).catch(error => { scriptPromise = null; throw error; });
    return scriptPromise;
  }

  async function start() {
    if (api) return api;
    if (loading) return loading;
    info('正在联网加载 GeoGebra 官方编辑器，首次加载可能需要一些时间…');
    loading = (async () => {
      await loadScript();
      return new Promise((resolve, reject) => {
        const saved = read(KEY);
        const timer = setTimeout(() => { info('GeoGebra 仍在加载，可返回本地画板继续使用，或检查网络后重试。'); }, 45000);
        const params = {
          id: 'dongGeoGebraApi', appName: 'classic', language: 'zh', country: 'CN',
          width: Math.max(300, host.clientWidth), height: Math.max(180, host.clientHeight),
          showToolBar: true, showAlgebraInput: true, showMenuBar: true,
          showToolBarHelp: false, showZoomButtons: true, showFullscreenButton: true,
          enableUndoRedo: true, enableRightClick: true, enableLabelDrags: true,
          enableShiftDragZoom: true, allowStyleBar: true, enableCAS: true, enable3d: true,
          useBrowserForJS: true, enableFileFeatures: false, showResetIcon: false,
          capturingThreshold: 6, preventFocus: true, showStartTooltip: false,
          appletOnLoad: async loadedApi => {
            clearTimeout(timer); api = loadedApi;
            try {
              api.setErrorDialogsActive(false);
              if (saved && saved.base64) {
                sessionTitle = saved.title || sessionTitle;
                info('已恢复上次的 GeoGebra 图稿。点击“导入当前画板”可载入董解析当前题目。');
              } else {
                populate(latestScene); await save();
                info('已导入当前图形。拖动点或 T，关联直线和交点会同步改变；新增对象可在左侧单独显示或隐藏。');
              }
              listen(); resolve(api);
            } catch (error) { reject(error); }
          }
        };
        if (saved && saved.base64) params.ggbBase64 = saved.base64;
        else params.perspective = 'AG';
        try { new window.GGBApplet(params, true).inject('dong-geogebra-applet'); }
        catch (error) { clearTimeout(timer); reject(error); }
      });
    })().catch(error => { loading = null; throw error; });
    return loading;
  }

  function listen() {
    const schedule = () => {
      if (busy) return;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => { save().catch(error => info(error.message)); }, 650);
    };
    api.registerStoreUndoListener(schedule);
    api.registerAddListener(schedule);
    api.registerRemoveListener(schedule);
    api.registerRenameListener(schedule);
    api.registerClientListener(event => {
      if (['dragEnd', 'undo', 'redo', 'updateStyle', 'viewChanged2D', 'editorStop'].includes(event.type)) schedule();
    });
  }

  function getBase64() {
    if (!api) return Promise.reject(new Error('请等待 GeoGebra 加载完成。'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('保存图稿超时，请使用“保存 .ggb”重试。')), 12000);
      try { api.getBase64(value => { clearTimeout(timer); resolve(value); }); }
      catch (error) { clearTimeout(timer); reject(error); }
    });
  }

  async function save() {
    const base64 = await getBase64();
    const record = { base64, title: sessionTitle, savedAt: new Date().toISOString() };
    try { localStorage.setItem(KEY, JSON.stringify(record)); }
    catch { throw new Error('浏览器存储空间不足，请点击“保存 .ggb”把图稿保存到文件。'); }
    return record;
  }

  async function backupCurrent() {
    if (!api) throw new Error('请等待 GeoGebra 加载完成。');
    const record = await save();
    try { localStorage.setItem(BACKUP, JSON.stringify(record)); }
    catch { throw new Error('无法备份当前图，请先保存 .ggb 文件并清理浏览器存储空间。'); }
  }

  async function loadBase64(base64) {
    if (!api) throw new Error('请等待 GeoGebra 加载完成。');
    busy = true;
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('载入图稿超时，请检查 .ggb 文件是否有效。')), 15000);
        try { api.setBase64(base64, () => { clearTimeout(timer); resolve(); }); }
        catch (error) { clearTimeout(timer); reject(error); }
      });
      listen();
    } finally { busy = false; }
  }

  async function replaceWithScene(scene) {
    await backupCurrent();
    busy = true;
    try { api.newConstruction(); populate(scene); listen(); await save(); }
    finally { busy = false; }
    info(scene ? '已导入当前画板，原 GeoGebra 图稿可用“恢复上一图”取回。' : '已打开空白画板；原图可用“恢复上一图”取回。');
  }

  async function restorePrevious() {
    const previous = read(BACKUP);
    if (!previous || !previous.base64) throw new Error('还没有上一图备份。');
    await backupCurrent(); await loadBase64(previous.base64);
    sessionTitle = previous.title || '恢复的图稿'; await save();
    info('已恢复上一图；再次点击可切换回刚才的图稿。');
  }

  function downloadBlob(blob, filename) {
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob); link.href = url; link.download = filename; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function download() {
    const base64 = await getBase64();
    const bytes = Uint8Array.from(atob(base64), character => character.charCodeAt(0));
    downloadBlob(new Blob([bytes], { type: 'application/vnd.geogebra.file' }), '董解析-GeoGebra图稿.ggb');
    info('已导出 .ggb 图稿，可用 GeoGebra 继续编辑。');
  }

  function exportPng() {
    if (!api) throw new Error('请等待 GeoGebra 加载完成。');
    const bytes = Uint8Array.from(atob(api.getPNGBase64(2, false, 144)), character => character.charCodeAt(0));
    downloadBlob(new Blob([bytes], { type: 'image/png' }), '董解析-GeoGebra画板.png');
  }

  // Commands are generated exclusively from finite numbers and internal labels.
  // User labels are captions, never executable command fragments.
  function populate(raw) {
    if (!api) return;
    const scene = raw && raw.model ? { ...raw.model, ...raw.p, activePart: raw.activePart } : (raw || {});
    sessionTitle = scene.title || 'GeoGebra 自由作图';
    let serial = 0;
    const labels = new Map(), anchors = {}, skipped = [], deferred = [];
    const active = scene.activePart;
    const visible = item => item.visible !== false && (active == null || item.part == null || Number(item.part) === Number(active));
    function object(expression, caption, color = [124, 90, 201], show = true) {
      const serialLabel = 'DG' + (++serial);
      const candidate = String(caption||'').replace(/₁/g,'1').replace(/₂/g,'2').replace(/（.*）/g,'');
      const label = /^[A-Za-z][A-Za-z0-9_]*$/.test(candidate)&&!['x','y','z','e','i'].includes(candidate)&&!api.exists(candidate) ? candidate : serialLabel;
      if (!api.evalCommand(label + (expression.includes('=') ? ':' : '=') + expression)) { skipped.push(caption || expression); return null; }
      if (caption) { api.setCaption(label, String(caption)); api.setLabelStyle(label, 3); api.setLabelVisible(label, true); }
      api.setColor(label, ...color); api.setVisible(label, show); return label;
    }
    function point(x, y, caption, show = true) {
      const label = object('(' + number(x) + ',' + number(y) + ')', caption, [63, 120, 216], show);
      if (label) { api.setPointSize(label, 5); api.setFixed(label, false, true); }
      return label;
    }
    const h = finite(scene.h), k = finite(scene.k), a = positive(scene.a, 3), b = positive(scene.b, 2);
    const r = positive(scene.r, 3), p = positive(scene.p, 2), direction = finite(scene.direction, 1) < 0 ? -1 : 1;
    const vertical = scene.orientation === 'vertical', showFeatures = scene.showFeatures !== false;
    let conic = null, center = null;
    api.setRepaintingActive(false);
    try {
      if (['ellipse', 'hyperbola', 'circle', 'parabola'].includes(scene.type)) {
        center = point(h, k, scene.type === 'parabola' ? 'V' : 'O', showFeatures);
        anchors.center = center; anchors.vertex = center;
        labels.set('O', center); labels.set('V', center);
        const x = '(x-x(' + center + '))', y = '(y-y(' + center + '))';
        if (scene.type === 'ellipse' || scene.type === 'hyperbola') {
          const ax = object(number(a), 'a', [15, 159, 153], false);
          const by = object(number(b), 'b', [15, 159, 153], false);
          const major = vertical ? y : x, minor = vertical ? x : y;
          conic = object(major + '^2/' + ax + '^2' + (scene.type === 'ellipse' ? '+' : '-') + minor + '^2/' + by + '^2=1', 'C', [15, 159, 153], scene.showConic !== false);
          const f = 'sqrt(' + ax + '^2' + (scene.type === 'ellipse' ? '-' : '+') + by + '^2)';
          const focus = sign => vertical ? '(x(' + center + '),y(' + center + ')' + sign + f + ')' : '(x(' + center + ')' + sign + f + ',y(' + center + '))';
          anchors.focus1 = object(focus('-'), 'F₁', [63, 120, 216], showFeatures);
          anchors.focus2 = object(focus('+'), 'F₂', [63, 120, 216], showFeatures);
          labels.set('F₁', anchors.focus1); labels.set('F1', anchors.focus1);
          labels.set('F₂', anchors.focus2); labels.set('F2', anchors.focus2);
        } else if (scene.type === 'circle') {
          const edge = point(h + r, k, 'R（调半径）');
          conic = object('Circle(' + center + ',' + edge + ')', 'C', [15, 159, 153], scene.showConic !== false);
        } else {
          const parameter = object(number(p), 'p', [15, 159, 153], false);
          conic = object((vertical ? x : y) + '^2=' + (4 * direction) + '*' + parameter + '*' + (vertical ? y : x), 'C', [15, 159, 153], scene.showConic !== false);
          const focus = vertical ? '(x(' + center + '),y(' + center + ')+' + direction + '*' + parameter + ')' : '(x(' + center + ')+' + direction + '*' + parameter + ',y(' + center + '))';
          anchors.focus1 = anchors.focus2 = object(focus, 'F', [63, 120, 216], showFeatures);
          labels.set('F', anchors.focus2);
        }
        if (conic) api.setLineThickness(conic, 5);
      }
      for (const [name, coordinates] of Object.entries(scene.points || {})) {
        if (!Array.isArray(coordinates) || coordinates.length < 2) continue;
        if (scene.pointBindings?.[name] && anchors[scene.pointBindings[name]]) { labels.set(name, anchors[scene.pointBindings[name]]); continue; }
        const label = point(coordinates[0], coordinates[1], name, showFeatures);
        labels.set(name, label);
      }
      const objects = Array.isArray(scene.objects) ? scene.objects : [];
      for (const item of objects.filter(value => value.kind === 'point')) {
        const label = point(item.x, item.y, item.label || 'P', visible(item));
        if (item.id) labels.set(item.id, label);
        if (item.label) labels.set(item.label, label);
      }
      for (const item of [...(scene.lines || []), ...objects.filter(value => value.kind !== 'point')]) {
        let label = null;
        if (item.kind === 'circle') {
          const c = point(item.h, item.k, (item.label || '圆') + '心', visible(item));
          const edge = point(finite(item.h) + positive(item.r, 1), item.k, '半径点', visible(item));
          label = object('Circle(' + c + ',' + edge + ')', item.label || '圆', [193, 91, 135], visible(item));
        } else if (item.kind === 'through_points') {
          const first = labels.get(item.a), second = labels.get(item.b);
          if (first && second) label = object((item.infinite ? 'Line' : 'Segment') + '(' + first + ',' + second + ')', item.label || item.a + item.b, [124, 90, 201], visible(item));
          else deferred.push(item);
        } else if (['line', 'slope', 'vertical'].includes(item.kind)) {
          let coords;
          if (item.x != null && Number.isFinite(Number(item.x))) coords = [finite(item.x), k - 2, finite(item.x), k + 2];
          else if (item.m != null && Number.isFinite(Number(item.m))) coords = [h - 2, finite(item.m) * (h - 2) + finite(item.b), h + 2, finite(item.m) * (h + 2) + finite(item.b)];
          if (coords) {
            const first = point(coords[0], coords[1], (item.label || '线') + '₁', visible(item));
            const second = point(coords[2], coords[3], (item.label || '线') + '₂', visible(item));
            label = object('Line(' + first + ',' + second + ')', item.label || '直线', [124, 90, 201], visible(item));
          } else skipped.push(item.label || '不支持的直线');
        } else skipped.push(item.label || item.kind || '对象');
        if (label && item.id) labels.set(item.id, label);
      }
      if (center && conic && scene.showDynamic !== false && scene.dynamicLine !== false && visible({part:scene.dynamicLinePart})) {
        const mode = scene.lineThrough || 'center';
        const pivot = mode.startsWith('point:') ? (labels.get(mode.slice(6)) || center) : (anchors[mode] || center);
        const radius = Math.max(a, b, r, p, 2) * 0.85;
        const ring = object('Circle(' + pivot + ',' + number(radius) + ')', '', [220, 225, 235], false);
        const handle = object('Point(' + ring + ')', 'T（拖动旋转）', [242, 163, 60]);
        const angle = finite(scene.theta, 42) * Math.PI / 180;
        if (handle) api.setCoords(handle, api.getXcoord(pivot) + radius * Math.cos(angle), api.getYcoord(pivot) + radius * Math.sin(angle));
        const line = object('Line(' + pivot + ',' + handle + ')', scene.dynamicLineLabel || 'l', [242, 163, 60]);
        if (line) {
          const first = object('Intersect(' + line + ',' + conic + ',1)', 'A', [223, 91, 98], scene.showConic !== false);
          const second = object('Intersect(' + line + ',' + conic + ',2)', 'B', [223, 91, 98], scene.showConic !== false);
          if(!labels.has('A')) labels.set('A',first);
          if(!labels.has('B')) labels.set('B',second);
        }
      }
      for(const item of deferred){const first=labels.get(item.a),second=labels.get(item.b);if(first&&second)object((item.infinite?'Line':'Segment')+'('+first+','+second+')',item.label||item.a+item.b,[124,90,201],visible(item));else skipped.push(item.label||'缺少端点的线');}
      const size = Math.max(a, b, r, p * 2, 3) * 1.65;
      const rawView=api.getViewProperties(1),view=typeof rawView==='string'?JSON.parse(rawView):rawView;
      const ratio=(view.width||800)/(view.height||600),halfWidth=Math.max(size,size*ratio),halfHeight=halfWidth/ratio;
      api.setCoordSystem(h-halfWidth,h+halfWidth,k-halfHeight,k+halfHeight);
      api.setAxesVisible(true, true); api.setGridVisible(true); api.setMode(0); api.setUndoPoint();
      if (skipped.length) info('已转换支持的图形；未转换对象：' + skipped.join('、') + '。可用 GeoGebra 工具栏补建。');
    } finally { api.setRepaintingActive(true); }
    return { skipped };
  }

  function sync(scene) { latestScene = copy(scene); }
  async function open(scene) {
    if (scene !== undefined) sync(scene);
    buildShell(); previousFocus = document.activeElement;
    if (!dialog.open) dialog.showModal();
    try { await start(); }
    catch (error) { info(error.message || 'GeoGebra 加载失败，请返回画板稍后重试。'); }
  }
  function close() {
    if (api) save().catch(error => info(error.message));
    if (dialog && dialog.open) dialog.close();
    if (previousFocus && previousFocus.isConnected) previousFocus.focus();
  }
  window.DongGeoGebra = Object.freeze({ open, close, sync, download, save, getAPI: () => api });
})();
