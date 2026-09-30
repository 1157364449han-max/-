const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const app = JSON.parse(read('version.json'));
const web = JSON.parse(read('dist/app-version.json'));
const releases = JSON.parse(read('dist/releases.json'));
const manifest = JSON.parse(read('dist/manifest.webmanifest'));
const html = read('dist/index.html');
const worker = read('dist/service-worker.js');
const runtimeSource = read('dist/runtime.js');
const learningSource = read('dist/learning-ui.js');
const workflow = read('.github/workflows/deploy-dongjiexi.yml');

assert.match(app.version, /^\d+\.\d+\.\d+$/);
assert.equal(web.version, app.version);
assert.equal(releases.current, app.version);
assert.match(app.update_channel, /^https:\/\//);
assert.match(worker, new RegExp(`VERSION = '${app.version.replaceAll('.', '\\.')}'`));
assert.equal(manifest.start_url, './');
assert.equal(manifest.scope, './');
assert.equal(manifest.display, 'standalone');
assert.ok(manifest.icons.some(icon => icon.purpose === 'maskable'));
for (const required of ['manifest.webmanifest', 'runtime-config.js', `runtime.js?v=${app.version}`, `pwa.js?v=${app.version}`, `equation-builder.js?v=${app.version}`, `math-keyboard.js?v=${app.version}`, `mathlive-adapter.js?v=${app.version}`, 'pwaBanner']) {
  assert.ok(html.includes(required), `index missing ${required}`);
}
assert.match(html, /id="draftRecovery"/, 'index must expose draft recovery UI');
assert.match(learningSource, /dongjiexi:draft:v1/, 'learning UI must persist an edit draft');
assert.match(worker, /pathname\.includes\('\/api\/'\)/, 'service worker must bypass API traffic');
assert.match(worker, /'\.\/runtime-config\.js'/, 'runtime config must be part of the first offline app shell');
assert.match(worker, /'\.\/equation-builder\.js'/, 'structured equation templates must work offline');
assert.match(worker, /'\.\/math-keyboard\.js'/, 'math keyboard must work offline');
assert.match(worker, /'\.\/mathlive-adapter\.js'/, 'MathLive adapter must work offline');
assert.match(worker, /vendor\/mathlive\/mathlive\.min\.mjs/, 'Self-hosted MathLive must be cached for offline input');
assert.match(worker, /'\.\/ellipse-distance\.js'/, 'distance solver must be available offline');
assert.match(worker, /'\.\/orthogonal-chord\.js'/, 'orthogonal chord solver must be available offline');
assert.match(worker, /'\.\/ellipse-focal-chord\.js'/, 'ellipse focal chord solver must be available offline');
assert.match(worker, /'\.\/number-display\.js'/, 'exact number formatting must be available offline');
assert.match(worker, /SKIP_WAITING/);
assert.match(workflow, /update-manifest\.json/);
assert.match(workflow, /sha256/);
assert.match(workflow, /dongjiexi-v\{version\}\.zip/);
new vm.Script(worker, {filename: 'service-worker.js'});

const disabled = {window: {DONGJIEXI_CONFIG: {version: app.version, deployment: 'web', apiBase: '', apiEnabled: false, requiresAuth: false}}, sessionStorage: {getItem:()=>null,removeItem(){},setItem(){}}};
vm.createContext(disabled);
new vm.Script(runtimeSource).runInContext(disabled);
assert.throws(() => disabled.window.DongRuntime.apiUrl('/api/health'), /尚未配置云端解题服务/);

let requested = '';
const enabled = {
  AbortController, setTimeout, clearTimeout,
  window: {DONGJIEXI_CONFIG: {version: app.version, deployment: 'web', apiBase: 'https://api.example.test/', apiEnabled: true, requiresAuth: false}},
  sessionStorage: {getItem:()=>null,removeItem(){},setItem(){}},
  fetch: async url => { requested = url; return {ok: true, headers: {get: () => 'application/json'}, json: async () => ({ok: true})}; }
};
vm.createContext(enabled);
new vm.Script(runtimeSource).runInContext(enabled);
enabled.window.DongRuntime.request('/api/health').then(data => {
  assert.equal(requested, 'https://api.example.test/api/health');
  assert.equal(data.ok, true);
  assert.ok(fs.existsSync(path.join(root, 'Dockerfile')));
  assert.ok(fs.existsSync(path.join(root, '.github/workflows/deploy-dongjiexi.yml')));
  console.log('PWA deployment contracts passed');
}).catch(error => { console.error(error); process.exitCode = 1; });
