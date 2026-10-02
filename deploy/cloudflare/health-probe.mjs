// Probe metadata separately from inference; a /models outage is not proof that
// chat completions are unavailable. Never cache prompts, replies or credentials.
export function createHealthProbe(fetcher, {now=Date.now,cache=()=>globalThis.caches?.default}={}) {
  let state=null,pending=null,lastGood=null,scope='';
  return async function probe(env,allowed,url) {
    const nextScope=String(env.DONGJIEXI_MODEL_API_KEY)+'\n'+allowed.join(',');
    if(scope!==nextScope){scope=nextScope;state=null;pending=null;lastGood=null;}
    if(state&&now()<state.nextCheck)return state;
    if(pending)return pending;
    const activeScope=scope;
    pending=(async()=>{
      const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(activeScope)));
      const cacheKey=new URL('/__dongjiexi/provider-health/0.45.0/'+Array.from(digest,x=>x.toString(16).padStart(2,'0')).join(''),url).href;
      try{
        const hit=await cache()?.match(cacheKey);const saved=hit?await hit.json():null;
        if(saved&&Array.isArray(saved.models)&&saved.models.length&&saved.models.every(m=>allowed.includes(m))&&Number.isFinite(saved.checkedAt)&&now()>=saved.checkedAt&&now()-saved.checkedAt<120000){
          lastGood=saved;
          if(now()-saved.checkedAt<45000)return state={...saved,status:'ready',error:'',nextCheck:saved.checkedAt+45000};
        }
      }catch{/* Cache availability must never determine model availability. */}
      let error='',permanent=false,available=[];
      try{
        const response=await fetcher('https://api.deepseek.com/models',{headers:{Authorization:'Bearer '+env.DONGJIEXI_MODEL_API_KEY},redirect:'manual',signal:AbortSignal.timeout(7000)});
        if(!response.ok){error='upstream-http-'+response.status;permanent=response.status<500&&response.status!==429;await response.body?.cancel();}
        else{
          const data=await response.json();if(!Array.isArray(data.data))throw new SyntaxError('Invalid model list');
          const present=new Set(data.data.map(p=>p?.id));available=allowed.filter(m=>present.has(m));
          if(!available.length){error='upstream-models-unavailable';permanent=true;}
        }
      }catch(e){error=e.name==='TimeoutError'||e.name==='AbortError'?'upstream-timeout':e.name==='SyntaxError'?'upstream-json':'upstream-network';}
      const checkedAt=now();
      if(scope!==activeScope)return {models:[],checkedAt,status:'unavailable',error:'configuration-changed',nextCheck:0};
      if(!error){
        lastGood={models:available,checkedAt};state={...lastGood,status:'ready',error:'',nextCheck:checkedAt+45000};
        try{await cache()?.put(cacheKey,Response.json(lastGood,{headers:{'Cache-Control':'public, max-age=120'}}));}catch{}
      }else if(permanent){lastGood=null;state={models:[],checkedAt,status:'unavailable',error,nextCheck:checkedAt+10000};try{await cache()?.delete(cacheKey);}catch{}}
      else if(lastGood&&checkedAt-lastGood.checkedAt<120000)state={...lastGood,status:'degraded',error,nextCheck:checkedAt+10000};
      else state={models:allowed,checkedAt:null,status:'unverified',error,nextCheck:checkedAt+10000};
      return state;
    })();
    try{return await pending;}finally{if(scope===activeScope)pending=null;}
  };
}
