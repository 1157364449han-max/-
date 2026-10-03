/* Portable release regression runner. Dev/CI dependencies only; not needed by users. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const net=require('node:net');
const {spawn}=require('node:child_process');
const {chromium}=require(process.env.DONG_PLAYWRIGHT_PATH||'playwright');
const root=path.resolve(__dirname,'..');
const sourceRoot=process.env.DONG_TEST_SOURCE_ROOT?path.resolve(process.env.DONG_TEST_SOURCE_ROOT):root;
const output=process.env.DONG_TEST_OUTPUT||fs.mkdtempSync(path.join(os.tmpdir(),'dongjiexi-browser-'));
fs.mkdirSync(output,{recursive:true});
const suites=process.argv.slice(2);
if(!suites.length)suites.push('question_bank','solve_progress_implicit','mobile_panels','orthogonal_chord','ellipse_focal_chord','hyperbola_focal_chord_condition','hyperbola_conditions','cloud_auth','cloud_outage','cloud_primary','cloud_primary_hyperbola','cloud_vision','latex_tangent','curve_edit_tangent','additive_conic_snap','focus_chord','derived_construction','one_stop_solver','desktop_layout','dependent_motion','named_points','reflected_chord','structured_input','conic_quick_tools','viewport_quick_draw','polygon_problem_sweep','ellipse_distance','parameter_selection','pwa','mobile_touch','solve_switch','photo_ocr','extreme_highlight','mathlive_input','point_hover');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
if(process.argv.length===2)suites.unshift('national_bank','circle_dot','public_cloud','deepseek_vision','circle_fold','cloud_mobile_health','answer_geometry','cloud_only','draft_lifecycle','generic_goal_scope','parabola_focal_data','hyperbola_iteration','parabola_locus','proof_scope','label_layout','step_graph_link','scene_consistency','sourced_exam_sweep','external_ai','cloud_stream');
async function port(){const probe=net.createServer();await new Promise((resolve,reject)=>probe.once('error',reject).listen(0,'127.0.0.1',resolve));const value=probe.address().port;await new Promise(resolve=>probe.close(resolve));return value;}
async function run(){
  let service,browser,baseURL=process.env.DONG_TEST_BASE_URL;
  try{
    if(!baseURL){
      const value=await port();baseURL=`http://127.0.0.1:${value}`;
      service=spawn(process.env.DONG_PYTHON||'python',['-B',path.join(sourceRoot,'server.py'),'--host','127.0.0.1','--port',String(value)],{cwd:sourceRoot,windowsHide:true,env:{...process.env,PYTHONUTF8:'1',PYTHONDONTWRITEBYTECODE:'1'},stdio:['ignore','ignore','pipe']});
      let failure='';service.stderr.on('data',chunk=>failure+=chunk);service.on('error',error=>failure=error.message);
      let ready=false;
      for(let i=0;i<60;i++){try{if((await fetch(baseURL)).ok){ready=true;break;}}catch{}if(service.exitCode!==null)throw new Error(failure||'Test server exited');await delay(150);}
      if(!ready)throw new Error(failure||'Test server did not start');
    }
    browser=await chromium.launch({headless:true,...(process.env.DONG_BROWSER_EXECUTABLE?{executablePath:process.env.DONG_BROWSER_EXECUTABLE}:{}),args:['--no-first-run']});
    for(const suite of suites){
      const filename=suite.endsWith('.cjs')?suite:suite+'_browser_smoke.cjs';
      if(path.basename(filename)!==filename)throw new Error('Use a test filename within tests/');
      const publicCloud=new Set(['public_cloud','deepseek_vision','circle_fold','cloud_mobile_health','answer_geometry','cloud_only','cloud_auth','cloud_stream','cloud_primary','cloud_primary_hyperbola','pwa']).has(suite.replace(/_browser_smoke\.cjs$/,''));
      const legacyOffline=suite.replace(/_browser_smoke\.cjs$/,'')==='external_ai';
      const context=await browser.newContext({viewport:{width:1600,height:1050},acceptDownloads:true,serviceWorkers:publicCloud||legacyOffline?'allow':'block'});
      // Native/clipboard engines remain regression-tested, but are not publicly exposed.
      // This HTML rewrite lives ONLY in the test runner: production has no URL/global bypass.
      if(!publicCloud)await context.route('**/*',async route=>{if(route.request().resourceType()!=='document')return route.fallback();const response=await route.fetch();const html=await response.text();await route.fulfill({response,body:html.replace('<body data-cloud-only="true">','<body data-cloud-only="false">')});});
      if(legacyOffline)await context.route('**/service-worker.js',route=>{
        // Fixture-only navigation rewrite lets the retained clipboard path run
        // through offline reloads; the public PWA tests use the original Worker.
        const worker=fs.readFileSync(path.join(sourceRoot,'dist/service-worker.js'),'utf8');
        const replacement="const response = await fetch(request).then(async response=>{if(!(response.headers.get('content-type')||'').includes('text/html'))return response;return new Response((await response.text()).replace('<body data-cloud-only=\"true\">','<body data-cloud-only=\"false\">'),{status:response.status,headers:response.headers});});";
        return route.fulfill({contentType:'application/javascript',body:worker.replace('const response = await fetch(request);',replacement)});
      });
      await context.addInitScript(({mode,native})=>{try{if(!localStorage.getItem('dongjiexi:solve-mode:v1'))localStorage.setItem('dongjiexi:solve-mode:v1',mode);if(native&&!localStorage.getItem('dongjiexi:local-workflow:v1'))localStorage.setItem('dongjiexi:local-workflow:v1','native');}catch{}},{mode:publicCloud?'cloud':'local',native:!publicCloud&&suite!=='external_ai'&&suite!=='external_ai_browser_smoke.cjs'});
      const page=await context.newPage(),errors=[];
      page.on('pageerror',error=>errors.push(error.stack||error.message));
      const screenshot=async(name='board.png',selector='.board-shell')=>{
        const target=selector?page.locator(selector):page;
        await target.screenshot({path:path.join(output,path.basename(name)),...(selector?{}:{fullPage:true})});
      };
      try{
        await page.goto(baseURL,{waitUntil:'domcontentloaded'});await page.waitForSelector('#question');
        if(legacyOffline){
          await page.waitForFunction(()=>navigator.serviceWorker?.controller,null,{timeout:15000});
          // Explicit test fixture for the retained offline clipboard engine.
          // Public PWA coverage uses the untouched cloud-only page separately.
          await page.evaluate(async()=>{for(const key of await caches.keys()){const cache=await caches.open(key);for(const request of await cache.keys()){if(!['/','index.html'].some(end=>new URL(request.url).pathname.endsWith(end)))continue;const response=await cache.match(request);if(!(response.headers.get('content-type')||'').includes('text/html'))continue;const body=(await response.text()).replace('<body data-cloud-only="true">','<body data-cloud-only="false">');await cache.put(request,new Response(body,{status:response.status,headers:response.headers}));}}});
        }
        await require(path.join(__dirname,filename))({page,context,baseURL,assert,screenshot,errors});
        assert.deepEqual(errors,[],'No browser JavaScript errors');
        console.log('PASS '+filename);
      }catch(error){await screenshot(filename+'.png',null).catch(()=>{});throw error;}
      finally{await context.close();}
    }
    console.log(JSON.stringify({passed:suites.length,output}));
  }finally{
    await browser?.close();
    if(service){const stopped=new Promise(resolve=>service.once('exit',resolve));service.kill();await Promise.race([stopped,delay(2000)]);}
  }
}
run().catch(error=>{console.error(error);process.exitCode=1;});
