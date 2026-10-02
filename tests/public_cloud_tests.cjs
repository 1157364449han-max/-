const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {DatabaseSync}=require('node:sqlite');
class D1{constructor(){this.db=new DatabaseSync(':memory:');this.db.exec(fs.readFileSync(path.join(__dirname,'../deploy/cloudflare/schema.sql'),'utf8'));}prepare(sql){const db=this.db;return{bind(...args){return{async first(){return db.prepare(sql).get(...args)||null;},async run(){return db.prepare(sql).run(...args);}};}};}}
(async()=>{
  const {createHealthProbe}=await import('../deploy/cloudflare/health-probe.mjs');
  let clock=1000,calls=0,failure='';const cacheEntries=new Map();const cache={async match(k){return cacheEntries.get(k)?.clone();},async put(k,v){cacheEntries.set(k,v.clone());},async delete(k){return cacheEntries.delete(k);}};
  const probe=createHealthProbe(async()=>{calls++;if(failure==='network')throw new TypeError('offline');if(failure==='auth')return new Response(null,{status:401});return Response.json({data:[{id:'deepseek-flash'}]});},{now:()=>clock,cache:()=>cache});
  const providerEnv={DONGJIEXI_MODEL_API_KEY:'private-test-key'};
  const url='https://fixture.workers.dev/api/health',allowed=['deepseek-flash'];
  const initial=await Promise.all(Array.from({length:5},()=>probe(providerEnv,allowed,url)));
  assert.equal(calls,1);assert(initial.every(s=>s.status==='ready'));
  clock+=44000;await probe(providerEnv,allowed,url);assert.equal(calls,1,'Warm healthy snapshots do not ping the provider each time');
  clock+=2000;failure='network';assert.equal((await probe(providerEnv,allowed,url)).status,'degraded');assert.equal(calls,2);
  clock+=120001;assert.equal((await probe(providerEnv,allowed,url)).status,'unverified','Expired successes are not advertised as verified');
  clock+=10001;failure='auth';const denied=await probe(providerEnv,allowed,url);assert.equal(denied.status,'unavailable');assert.deepEqual(denied.models,[]);
  const savedProbe=createHealthProbe(async()=>{throw new Error('Should use edge cache');},{now:()=>clock,cache:()=>cache});
  failure='';clock+=10001;await probe(providerEnv,allowed,url);assert.equal((await savedProbe(providerEnv,allowed,url)).status,'ready');
  for(const response of cacheEntries.values())assert(!(await response.clone().text()).includes('private-test-key'));
  const {createHandler}=await import('../deploy/cloudflare/worker.mjs');
  const env={DB:new D1(),DONGJIEXI_PUBLIC_ACCESS:'true',SESSION_SECRET:'fixture-signing-secret-at-least-thirty-two-characters',DONGJIEXI_MODEL_API_KEY:'private-fixture',DONGJIEXI_DAILY_JOBS:'200'};
  let modelCalls=0,pending=[];const ctx={waitUntil(p){pending.push(p);}};
  const handler=createHandler(async endpoint=>{if(endpoint.endsWith('/models'))return Response.json({data:[{id:'deepseek-flash'}]});modelCalls++;return new Response('data: [DONE]\n\n',{headers:{'Content-Type':'text/event-stream'}});});
  const req=(route,data,token='')=>new Request('https://fixture.workers.dev'+route,{method:data===undefined?'GET':'POST',headers:{Origin:'https://dongjiexi.github.io','Content-Type':'application/json','CF-Connecting-IP':'192.0.2.99',...(token?{Authorization:'Bearer '+token}:{})},...(data===undefined?{}:{body:JSON.stringify(data)})});
  const health=await(await handler(req('/api/health'),env,ctx)).json();assert.equal(health.auth_required,false);assert.equal(health.guest_session,true);assert.equal(health.engine.available,true);assert.deepEqual(health.limits,{per_hour:40,daily:200});
  const id='guest-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',secondId='guest-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const issue=async visitor_id=>{const r=await handler(req('/api/session',{visitor_id}),env,ctx);assert.equal(r.status,200);const result=await r.json();assert.equal(result.guest,true);return result.token;};
  const token=await issue(id),second=await issue(secondId),input={kind:'solve',text:'协议测试',model:'deepseek-flash'};
  assert.equal((await handler(req('/api/session',{visitor_id:'bad'}),env,ctx)).status,400);
  assert.equal((await handler(req('/api/stream',input),env,ctx)).status,401,'Automatic signed credentials still protect counters');
  for(let i=0;i<40;i++){const r=await handler(req('/api/stream',input,token),env,ctx);assert.equal(r.status,200);await r.text();await Promise.all(pending);pending=[];}
  const limited=await handler(req('/api/stream',input,token),env,ctx);assert.equal(limited.status,429);assert.match((await limited.json()).error,/40/);assert(Number(limited.headers.get('Retry-After'))>0);
  const renewed=await issue(id.toUpperCase());assert.equal((await handler(req('/api/stream',input,renewed),env,ctx)).status,429,'Anonymous renewal/case changes cannot reset personal counters');
  const independent=await handler(req('/api/stream',input,second),env,ctx);assert.equal(independent.status,200,'Two browsers on one Wi-Fi have independent personal limits');await independent.text();await Promise.all(pending);
  assert.equal(modelCalls,41);assert.equal(env.DB.db.prepare('SELECT count(*) AS n FROM leases').get().n,0);
  env.DONGJIEXI_PUBLIC_ACCESS='false';env.DONGJIEXI_ACCESS_KEY='fixture';assert.equal((await handler(req('/api/stream',input,second),env,ctx)).status,401,'Restoring protected access revokes guest inference');env.DB.db.close();
  const storage=new Map(),visitors=new Map();let sessions=0,streamCalls=0,visitorIds=[],rate=false;
  const sse='data: '+JSON.stringify({choices:[{delta:{content:'协议回复'}}]})+'\n\ndata: '+JSON.stringify({choices:[{delta:{},finish_reason:'stop'}]})+'\n\ndata: [DONE]\n\n';
  const context={window:{DONGJIEXI_CONFIG:{deployment:'web',apiBase:'https://api.fixture.test',requiresAuth:true}},sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},localStorage:{getItem:k=>visitors.get(k),setItem:(k,v)=>visitors.set(k,v)},crypto,TextDecoder,AbortController,setTimeout,clearTimeout,fetch:async(endpoint,init)=>{
    if(endpoint.endsWith('/api/health'))return Response.json({app:'董解析',auth_required:false,guest_session:true,engine:{available:true}});
    if(endpoint.endsWith('/api/session')){sessions++;visitorIds.push(JSON.parse(init.body).visitor_id);return Response.json({token:'guest-'+sessions,guest:true,expires_in:3600});}
    streamCalls++;if(streamCalls===1)return Response.json({error:'Expired guest'},{status:401});if(rate)return Response.json({error:'Personal limit'},{status:429,headers:{'Retry-After':'60'}});return new Response(sse,{headers:{'Content-Type':'text/event-stream'}});
  }};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../dist/runtime.js'),'utf8'),context);
  const runtime=context.window.DongRuntime;assert.equal((await runtime.probeCloud()).needsAuth,false);assert.equal(runtime.config.requiresAuth,false);
  assert.equal((await runtime.streamJob({kind:'chat',text:'协议测试'})).text,'协议回复');assert.equal(sessions,2);assert.equal(visitorIds[0],visitorIds[1]);
  rate=true;await assert.rejects(runtime.streamJob({kind:'chat',text:'协议测试'}),e=>e.code==='rate_limited'&&e.retryAfter===60);assert.equal(streamCalls,3,'Accepted/rejected model requests are not blindly retried');
  console.log('PASS public anonymous access, 40/hour browser isolation, renewal quota retention, safe cached/degraded health and automatic guest refresh');
})().catch(e=>{console.error(e);process.exitCode=1;});
