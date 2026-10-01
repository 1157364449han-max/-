/* Release checks must exercise corruption, not merely a successful offline load. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../dist/service-worker.js'),'utf8');
const version=JSON.parse(fs.readFileSync(path.join(__dirname,'../version.json'),'utf8')).version;
async function navigation(url,{status=200,type='text/html',html=`<meta name="dongjiexi-version" content="${version}">current shell`,offline=false}={}){
  const handlers={},writes=[],pending=[];
  const cache={async put(key,response){writes.push({key:typeof key==='string'?key:key.url,body:await response.text()});},async match(){return new Response('previous-safe-shell');}};
  const self={location:{origin:'https://example.test',href:'https://example.test/-/service-worker.js'},registration:{scope:'https://example.test/-/'},addEventListener:(name,fn)=>handlers[name]=fn};
  vm.runInNewContext(source,{self,URL,Request,Response,Promise,caches:{open:async()=>cache},fetch:async()=>{if(offline)throw new Error('offline');return new Response(html,{status,headers:{'Content-Type':type}});}});
  let answer;handlers.fetch({request:{url,method:'GET',mode:'navigate'},respondWith:p=>answer=p,waitUntil:p=>pending.push(p)});
  const response=answer?await answer:null;await Promise.all(pending);await new Promise(r=>setTimeout(r,0));return{writes,response};
}
(async()=>{
  let result=await navigation('https://example.test/-/missing-page',{status:404,html:'Not found'});
  assert.equal(result.writes.length,0,'A missing page must not overwrite the offline application shell');
  result=await navigation('https://example.test/-/',{status:503,html:'Service unavailable'});
  assert.equal(result.writes.length,0,'A failed homepage must not replace the last valid shell');
  result=await navigation('https://example.test/-/downloads/application.zip',{type:'application/zip',html:'archive bytes'});
  assert.equal(result.writes.length,0,'A download must never become the cached HTML');
  result=await navigation('https://example.test/-/',{html:'<meta name="dongjiexi-version" content="9.99.0">newer shell'});
  assert.equal(result.writes.length,0,'Newer HTML cannot poison an older version-scoped offline shell');
  result=await navigation('https://example.test/-/');assert.equal(result.writes.length,1);assert.equal(result.writes[0].key,'./index.html');
  result=await navigation('https://example.test/-/',{offline:true});assert.equal(await result.response.text(),'previous-safe-shell');
  console.log('PASS navigation safety: error pages, downloads, HTML version isolation and offline recovery');
})().catch(error=>{console.error(error);process.exitCode=1;});
