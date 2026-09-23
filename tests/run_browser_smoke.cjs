/* Portable release regression runner. Dev/CI dependencies only; not needed by users. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const net=require('node:net');
const {spawn}=require('node:child_process');
const {chromium}=require(process.env.DONG_PLAYWRIGHT_PATH||'playwright');
const root=path.resolve(__dirname,'..');
const output=process.env.DONG_TEST_OUTPUT||fs.mkdtempSync(path.join(os.tmpdir(),'dongjiexi-browser-'));
fs.mkdirSync(output,{recursive:true});
const suites=process.argv.slice(2);
if(!suites.length)suites.push('cloud_primary','latex_tangent','curve_edit_tangent','additive_conic_snap','focus_chord','derived_construction','one_stop_solver','desktop_layout','dependent_motion','structured_input','conic_quick_tools','pwa','mobile_touch','solve_switch','photo_ocr','extreme_highlight');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function port(){const probe=net.createServer();await new Promise((resolve,reject)=>probe.once('error',reject).listen(0,'127.0.0.1',resolve));const value=probe.address().port;await new Promise(resolve=>probe.close(resolve));return value;}
async function run(){
  let service,browser,baseURL=process.env.DONG_TEST_BASE_URL;
  try{
    if(!baseURL){
      const value=await port();baseURL=`http://127.0.0.1:${value}`;
      service=spawn(process.env.DONG_PYTHON||'python',['-B',path.join(root,'server.py'),'--host','127.0.0.1','--port',String(value)],{cwd:root,windowsHide:true,env:{...process.env,PYTHONUTF8:'1',PYTHONDONTWRITEBYTECODE:'1'},stdio:['ignore','ignore','pipe']});
      let failure='';service.stderr.on('data',chunk=>failure+=chunk);service.on('error',error=>failure=error.message);
      let ready=false;
      for(let i=0;i<60;i++){try{if((await fetch(baseURL)).ok){ready=true;break;}}catch{}if(service.exitCode!==null)throw new Error(failure||'Test server exited');await delay(150);}
      if(!ready)throw new Error(failure||'Test server did not start');
    }
    browser=await chromium.launch({headless:true,...(process.env.DONG_BROWSER_EXECUTABLE?{executablePath:process.env.DONG_BROWSER_EXECUTABLE}:{}),args:['--no-first-run']});
    for(const suite of suites){
      const filename=suite.endsWith('.cjs')?suite:suite+'_browser_smoke.cjs';
      if(path.basename(filename)!==filename)throw new Error('Use a test filename within tests/');
      const context=await browser.newContext({viewport:{width:1600,height:1050},acceptDownloads:true});
      const page=await context.newPage(),errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      const screenshot=async(name='board.png',selector='.board-shell')=>{
        const target=selector?page.locator(selector):page;
        await target.screenshot({path:path.join(output,path.basename(name)),...(selector?{}:{fullPage:true})});
      };
      try{
        await page.goto(baseURL,{waitUntil:'domcontentloaded'});await page.waitForSelector('#question');
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
