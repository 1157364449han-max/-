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

assert.equal(app.version, '0.22.0');
assert.equal(web.version, app.version);
assert.equal(releases.current, app.version);
assert.match(app.update_channel, /^https:\/\//);
assert.match(worker, new RegExp(`VERSION = '${app.version.replaceAll('.', '\\.')}'`));
assert.equal(manifest.start_url, './');
assert.equal(manifest.scope, './');
assert.equal(manifest.display, 'standalone');
assert.ok(manifest.icons.some(icon => icon.purpose === 'maskable'));
for (const required of ['manifest.webmanifest', 'runtime-config.js', 'runtime.js?v=0.22.0', 'pwa.js?v=0.22.0', 'equation-builder.js?v=0.22.0', 'math-keyboard.js?v=0.22.0', 'pwaBanner']) {
  assert.ok(html.includes(required), `index missing ${required}`);
}
assert.match(html, /id="draftRecovery"/, 'index must expose draft recovery UI');
assert.match(learningSource, /dongjiexi:draft:v1/, 'learning UI must persist an edit draft');
assert.match(worker, /pathname\.includes\('\/api\/'\)/, 'service worker must bypass API traffic');
assert.match(worker, /'\.\/runtime-config\.js'/, 'runtime config must be part of the first offline app shell');
assert.match(worker, /'\.\/equation-builder\.js'/, 'structured equation templates must work offline');
assert.match(worker, /'\.\/math-keyboard\.js'/, 'math keyboard must work offline');
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
