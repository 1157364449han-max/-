const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs'),path=require('node:path');
class D1 {
  constructor(){this.db=new DatabaseSync(':memory:');this.db.exec(fs.readFileSync(path.join(__dirname,'../deploy/cloudflare/schema.sql'),'utf8'));}
  prepare(sql){const db=this.db;return{bind(...args){return{async first(){return db.prepare(sql).get(...args)||null;},async run(){return db.prepare(sql).run(...args);}};}};}
}
(async()=>{
  const {createHandler,modelPayload}=await import('../deploy/cloudflare/worker.mjs');
  const {assemble,safeScene,splitParts}=await import('../dist/cloud-contract.mjs');
  const referenced='已知抛物线C：y^2=2px（p>0）的焦点为F。\n（1）若|AB|=8，中点横坐标为3，求C的方程；\n（2）在（1）的条件下，若倾斜角为45°，求|AB|；\n（3）在（1）（2）的条件下，设M为准线上一点，且MA⊥MB，求M的坐标。';
  const referencedPayload=modelPayload({kind:'solve',text:referenced,model:'deepseek-flash'},{});
  assert.deepEqual(splitParts(referenced).map(p=>p.index),[1,2,3]);
  assert(referencedPayload.messages[1].content.includes('原题：\n'+referenced),'Gateway preserves references and source question');
  const sentParts=JSON.parse(referencedPayload.messages[1].content.split('\n小问编号：')[1].split('\n请先完整作答')[0]);
  assert.deepEqual(sentParts.map(p=>p.index),[1,2,3]);assert(sentParts[2].body.includes('（1）（2）'));
  assert.throws(()=>modelPayload({kind:'solve',text:'（1）求x；（1）求y。',model:'deepseek-flash'},{}),/重复小问/);
  const env={DB:new D1(),SESSION_SECRET:'test-signing-secret-not-used-in-production-000',DONGJIEXI_ACCESS_KEY:'课堂测试',DONGJIEXI_MODEL_API_KEY:'fixture-api-key',DONGJIEXI_DAILY_JOBS:'3'};
  let calls=0,pending=[];
  const context={waitUntil(promise){pending.push(promise);}};
  const sse='data: '+JSON.stringify({choices:[{delta:{content:'测试内容'},finish_reason:null}]})+'\n\ndata: '+JSON.stringify({choices:[{delta:{},finish_reason:'stop'}]})+'\n\ndata: [DONE]\n\n';
  const handler=createHandler(async(url,options)=>{
    assert(url.startsWith('https://api.deepseek.com/'));assert.equal(options.redirect,'manual');assert.equal(options.headers.Authorization,'Bearer fixture-api-key');
    if(url.endsWith('/models'))return Response.json({data:[{id:'deepseek-flash'}]});
    calls++;const payload=JSON.parse(options.body);assert.equal(payload.max_tokens,6000);assert.equal(payload.model,'deepseek-flash');
    assert(!JSON.stringify(payload).includes('fixture-api-key'));
    return new Response(sse,{headers:{'Content-Type':'text/event-stream'}});
  });
  const req=(route,data,token='',extra={})=>new Request('https://fixture.workers.dev'+route,{method:data===undefined?'GET':'POST',headers:{Origin:'https://dongjiexi.github.io','Content-Type':'application/json','CF-Connecting-IP':'192.0.2.1',...(token?{Authorization:'Bearer '+token}:{}),...extra},...(data===undefined?{}:{body:JSON.stringify(data)})});
  const probe=await handler(req('/api/health'),env,context);const health=await probe.json();
  assert.equal(health.app,'董解析');assert.equal(health.capabilities.transport,'sse');assert.deepEqual(health.engine.models,[]);assert.equal(calls,0);
  assert.equal(probe.headers.get('Access-Control-Allow-Origin'),'https://dongjiexi.github.io');
  assert.equal((await handler(req('/api/session',{access_key:'wrong'}),env,context)).status,401);
  const login=await handler(req('/api/session',{access_key:' 课堂测试 '}),env,context);assert.equal(login.status,200);
  const {token}=await login.json();assert(!token.includes('课堂测试'));assert(!token.includes('fixture-api-key'));
  assert.equal((await handler(req('/api/health',undefined,token),env,context)).status,200);
  const data={kind:'solve',text:'已知椭圆 x²/4+y²=1，求离心率。',model:'deepseek-flash',base_url:'https://attacker.invalid'};
  assert.equal((await handler(req('/api/stream',data),env,context)).status,401);
  assert.equal((await handler(req('/api/stream',data,token+'x'),env,context)).status,401);
  assert.equal((await handler(req('/api/stream',data,token,{Origin:'https://attacker.invalid'}),env,context)).status,403);
  assert.equal((await handler(req('/api/stream',{...data,model:'arbitrary'},token),env,context)).status,400);
  assert.equal((await handler(req('/api/stream',{...data,kind:'pull'},token),env,context)).status,400);
  assert.equal((await handler(req('/api/stream',{...data,text:'x'.repeat(66000)},token),env,context)).status,413);
  for(let i=0;i<3;i++){
    const result=await handler(req('/api/stream',data,token),env,context);assert.equal(result.status,200);assert.equal(await result.text(),sse);await Promise.all(pending);pending=[];
    assert.equal(env.DB.db.prepare('SELECT count(*) AS n FROM leases').get().n,0,'Completed streams release concurrency leases');
  }
  const renewal=await handler(req('/api/session',{access_key:'课堂测试'}),env,context);const nextToken=(await renewal.json()).token;
  assert.equal((await handler(req('/api/stream',data,nextToken),env,context)).status,429,'Renewal cannot reset global quotas');assert.equal(calls,3);
  env.DB.db.close();
  const concurrentEnv={...env,DB:new D1(),DONGJIEXI_DAILY_JOBS:'50'};
  concurrentEnv.DB.db.exec("INSERT INTO leases VALUES ('one',9999999999),('two',9999999999)");
  assert.equal((await handler(req('/api/stream',data,token),concurrentEnv,context)).status,429);assert.equal(calls,3);
  const down=createHandler(async()=>Response.json({error:{message:'private fixture-api-key upstream'}},{status:401}));concurrentEnv.DB.db.exec('DELETE FROM leases');
  const rejected=await down(req('/api/stream',data,token),concurrentEnv,context);assert.equal(rejected.status,502);assert(!(await rejected.text()).includes('fixture-api-key'));
  assert.equal(concurrentEnv.DB.db.prepare('SELECT count(*) AS n FROM leases').get().n,0);
  const redirect=createHandler(async()=>new Response(null,{status:302,headers:{Location:'https://attacker.invalid'}}));
  assert.equal((await redirect(req('/api/stream',data,token),concurrentEnv,context)).status,502,'Redirects never forward the API credential to another host');
  assert.equal(concurrentEnv.DB.db.prepare('SELECT count(*) AS n FROM leases').get().n,0);
  concurrentEnv.DB.db.close();
  assert.equal((await handler(req('/api/session',{access_key:'课堂测试'}),{},context)).status,503);
  assert.deepEqual(splitParts('已知条件。（1）求方程。（2）设动点。(i)求轨迹。(ii)求最值。').map(p=>p.index),[1,201,202]);
  const unknown=assemble({parts:[{index:1,answer:'第一问',steps:['计算'],status:'answered'}],scene:{type:'ellipse',a:NaN,b:1}},'已知条件。（1）求方程。（2）证明。','fixture');
  assert.equal(unknown.parts[1].status,'partial');assert.equal(unknown.scene,null);assert.equal(unknown.verification.status,'generated');
  const scene=safeScene({type:'ellipse',a:2,b:1,dynamicLine:true,points:{P:[1,0],A:[999,999]},curvePoints:[{name:'M'}],lines:[{kind:'through_points',a:'M',b:'P',label:'MP'},{kind:'through_points',a:'A',b:'B',label:'AB'},{kind:'slope',m:Infinity,b:0}],objects:[{kind:'code',script:'alert(1)'}]});
  assert.equal(scene.points.A,undefined);assert.equal(scene.lines.length,1);assert.equal(scene.objects.length,2);assert(scene.objects.every(p=>p.kind==='construction'));
  assert.throws(()=>assemble({parts:[{index:0},{index:0}]},'题目','fixture'),/重复/);
  assert.equal(modelPayload({...data,depth:'deep'},env).thinking.type,'enabled');
  console.log('PASS Cloudflare auth, CORS, private keys, fixed upstream, shared quotas, SQL leases, failure cleanup, part and scene contracts');
})().catch(error=>{console.error(error);process.exitCode=1;});
