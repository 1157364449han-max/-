const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../dist/service-worker.js'),'utf8');
const version=JSON.parse(fs.readFileSync(path.join(__dirname,'../version.json'),'utf8')).version;
async function scenario(url,{mode='cors',offline=false,exact=false}={}){
  const events={},matches=[],opened=[],puts=[];
  const bucket={async match(request,options){matches.push({request:typeof request==='string'?request:request.url,options});if(typeof request==='string')return new Response('current-html');return options?.ignoreSearch||exact?new Response('current-shell'):undefined;},async put(request,response){puts.push(request.url);}};
  const sandbox={URL,Request,Response,Promise,self:{location:{origin:'https://example.test',href:'https://example.test/-/service-worker.js'},addEventListener:(event,handler)=>events[event]=handler},caches:{async open(name){opened.push(name);return bucket;},match(){throw new Error('Cross-version global cache lookup is forbidden');}},fetch:async()=>{if(offline)throw new Error('offline');return new Response('fresh-network');}};
  vm.runInNewContext(source,sandbox);
  let pending;events.fetch({request:{url,method:'GET',mode},respondWith:value=>pending=value});
  return {response:pending?await pending:null,matches,opened,puts};
}
(async()=>{
  let result=await scenario(`https://example.test/-/step-highlight.js?v=${version}`,{offline:true});
  assert.equal(await result.response.text(),'current-shell');assert.equal(result.matches[0].options.ignoreSearch,true);
  assert(result.opened.every(name=>name===`dongjiexi-app-${version}`));
  result=await scenario('https://example.test/-/step-highlight.js?v=9.99.0');
  assert.equal(await result.response.text(),'fresh-network');assert.equal(result.matches[0].options.ignoreSearch,false);
  assert.deepEqual(result.puts,['https://example.test/-/step-highlight.js?v=9.99.0']);
  result=await scenario('https://example.test/-/step-highlight.js?v=9.99.0',{offline:true});
  assert.equal(result.response.type,'error','Do not silently substitute an older module for an unavailable version');
  result=await scenario('https://example.test/-/step-highlight.js?v=9.99.0',{offline:true,exact:true});
  assert.equal(await result.response.text(),'current-shell','An exact-version previously fetched cache entry remains usable');
  result=await scenario('https://example.test/-/',{mode:'navigate',offline:true});assert.equal(await result.response.text(),'current-html');
  result=await scenario('https://example.test/-/vendor/katex/katex.min.js',{offline:true});assert.equal(await result.response.text(),'current-shell');
  result=await scenario('https://example.test/-/api/solve');assert.equal(result.response,null,'Inference never enters static caches');
  result=await scenario('https://api.example.test/assets.js');assert.equal(result.response,null,'Third-party requests are untouched');
  console.log('PASS: offline shell cache is version scoped; newer module URLs never receive old scripts; exact versions, vendor, navigation and API bypass preserved.');
})().catch(error=>{console.error(error);process.exitCode=1;});
