const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../dist/runtime.js'),'utf8');
function runtime(fetcher,extra={}){
  const storage=new Map();
  const context={window:{DONGJIEXI_CONFIG:{deployment:'web',apiBase:'https://api.example.test',apiEnabled:true,requiresAuth:true}},
    sessionStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
    fetch:fetcher,AbortController,setTimeout,clearTimeout,...extra};
  vm.runInNewContext(source,context);return{api:context.window.DongRuntime,storage};
}
const response=(status,data,json=true)=>({status,ok:status>=200&&status<300,headers:{get:()=>json?'application/json':'text/html'},json:async()=>data});
async function run(){
  let body;
  const valid=runtime(async(url,init)=>{body=JSON.parse(init.body);return response(200,{token:'test-session',expires_in:600});});
  await valid.api.authenticate('　 课堂口令 \n');
  assert.equal(body.access_key,'课堂口令');assert(valid.api.hasSession());
  const saved=JSON.parse(valid.storage.get('dongjiexi:cloud-session'));assert.equal(saved.apiBase,'https://api.example.test');
  valid.storage.set('dongjiexi:cloud-session',JSON.stringify({...saved,apiBase:'https://other.example.test'}));assert(!valid.api.hasSession());
  for(const [status,code] of [[401,'auth_rejected'],[429,'rate_limited'],[503,'service_unavailable']]){
    const candidate=runtime(async()=>response(status,status===503?null:{error:'Test error'},status!==503));
    await assert.rejects(candidate.api.authenticate('课堂口令'),error=>error.code===code&&error.status===status);
    assert(!candidate.api.hasSession());
  }
  const network=runtime(async()=>{throw new TypeError('Network error');});
  await assert.rejects(network.api.authenticate('课堂口令'),error=>error.code==='network'&&error.message.includes('不表示访问口令错误'));
  const empty=runtime(async()=>{throw new Error('Empty input must not be sent');});
  await assert.rejects(empty.api.authenticate('　 '),error=>error.code==='empty_key');
  const incomplete=runtime(async()=>response(200,{}));
  await assert.rejects(incomplete.api.authenticate('课堂口令'),error=>error.code==='invalid_response');assert(!incomplete.api.hasSession());
  const timeout=runtime(async(url,init)=>new Promise((resolve,reject)=>init.signal.addEventListener('abort',()=>reject(Object.assign(new Error('Aborted'),{name:'AbortError'})))),
    {setTimeout:fn=>{queueMicrotask(fn);return 1;},clearTimeout(){}});
  await assert.rejects(timeout.api.authenticate('课堂口令'),error=>error.code==='timeout');
  let probes=0;
  const publicHealth=runtime(async(url,init)=>{
    probes++;assert.equal(url,'https://api.example.test/api/health');assert.equal(init.method,'GET');
    assert.equal(init.cache,'no-store');assert.equal(init.credentials,'omit');assert.equal(init.body,undefined);
    assert.equal(init.headers.Authorization,undefined);
    return response(200,{app:'董解析',engine:{available:false}});
  });
  const health=await publicHealth.api.probeCloud();assert(health.reachable&&health.needsAuth);assert(!publicHealth.api.hasSession());
  await assert.rejects(publicHealth.api.request('/api/jobs',{}),/尚未授权/);assert.equal(probes,1,'Public probing must not bypass protected job authorization');
  for(const status of [401,429,503]){
    const service=runtime(async()=>response(status,{}));
    if(status===401)assert((await service.api.probeCloud()).needsAuth);
    else await assert.rejects(service.api.probeCloud(),error=>error.code===(status===429?'rate_limited':'service_unavailable'));
  }
  await assert.rejects(network.api.probeCloud(),error=>error.code==='network');
  await assert.rejects(timeout.api.probeCloud(),error=>error.code==='timeout');
  const unrelated=runtime(async()=>response(200,{app:'different-site',engine:{}}));
  await assert.rejects(unrelated.api.probeCloud(),error=>error.code==='invalid_response');
  const html=runtime(async()=>response(200,null,false));
  await assert.rejects(html.api.probeCloud(),error=>error.code==='invalid_response');
  console.log('PASS network/HTTP/auth/timeout classification, Chinese phrase trim, endpoint-bound sessions and invalid tokens');
}
run().catch(error=>{console.error(error);process.exitCode=1;});
