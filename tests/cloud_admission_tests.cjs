const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
class D1{constructor(){this.db=new DatabaseSync(':memory:');this.db.exec(fs.readFileSync(path.join(__dirname,'../deploy/cloudflare/schema.sql'),'utf8'));}prepare(sql){const db=this.db;return{bind(...args){return{async first(){return db.prepare(sql).get(...args)||null;},async run(){return db.prepare(sql).run(...args);}};}};}}
(async()=>{
  const {createHandler}=await import('../deploy/cloudflare/worker.mjs');
  const env={DB:new D1(),SESSION_SECRET:'fixture-signing-secret-at-least-thirty-two-characters',DONGJIEXI_ACCESS_KEY:'fixture',DONGJIEXI_MODEL_API_KEY:'fixture',DONGJIEXI_DAILY_JOBS:'1',DONGJIEXI_JOBS_PER_10_MINUTES:'20'};
  const req=(route,data,token='')=>new Request('https://fixture.workers.dev'+route,{method:'POST',headers:{Origin:'https://dongjiexi.github.io','Content-Type':'application/json','CF-Connecting-IP':'192.0.2.44',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(data)});
  let calls=0,pending=[];
  const context={waitUntil(p){pending.push(p);}};
  const good=createHandler(async()=>{calls++;return new Response('data: [DONE]\n\n',{headers:{'Content-Type':'text/event-stream'}});});
  const token=(await (await good(req('/api/session',{access_key:'fixture'}),env,context)).json()).token;
  const data={text:'椭圆x²/4+y²=1，求离心率。',kind:'solve',model:'deepseek-flash'};
  const daily=()=>env.DB.db.prepare("SELECT COALESCE(sum(count),0) AS n FROM counters WHERE id LIKE 'global-day:%'").get().n;
  const leases=()=>env.DB.db.prepare('SELECT count(*) AS n FROM leases').get().n;
  env.DB.db.exec("INSERT INTO leases VALUES ('one',9999999999),('two',9999999999)");
  assert.equal((await good(req('/api/stream',data,token),env,context)).status,429);
  assert.equal(daily(),0,'A busy rejection must not spend the daily model budget');assert.equal(calls,0);
  env.DB.db.exec('DELETE FROM leases');
  for(const upstream of [async()=>Response.json({error:'private detail'},{status:401}),async()=>new Response('not SSE'),async()=>{throw new Error('network unavailable');}]){
    const failed=await createHandler(upstream)(req('/api/stream',data,token),env,context);
    assert([502,503].includes(failed.status));assert.equal(daily(),0,'A rejected/non-SSE/network request must refund its reservation');assert.equal(leases(),0);
  }
  const result=await good(req('/api/stream',data,token),env,context);assert.equal(result.status,200);await result.text();await Promise.all(pending);pending=[];
  assert.equal(daily(),1);assert.equal(leases(),0);
  assert.equal((await good(req('/api/stream',data,token),env,context)).status,429);assert.equal(calls,1);assert.equal(leases(),0,'Quota rejection must release the reserved concurrency lease');assert.equal(daily(),1);
  env.DB.db.close();console.log('PASS cloud admission: busy requests and upstream failures do not spend daily budget; successful streams do; all leases released');
})().catch(error=>{console.error(error);process.exitCode=1;});
