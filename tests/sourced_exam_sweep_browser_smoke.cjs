const fs=require('node:fs'),path=require('node:path');
module.exports=async({page,context,assert,screenshot})=>{
  const bank=JSON.parse(fs.readFileSync(path.join(__dirname,'../dist/question-bank.json'),'utf8'));
  const additions=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/sourced-exam-additions.json'),'utf8'));
  const replacements=new Set(additions.items.map(q=>q.replaces).filter(Boolean));
  const cases=[...bank.items.filter(q=>q.kind==='gaokao'&&!replacements.has(q.id)),...additions.items];
  assert.equal(cases.length,12,'Count unique sourced questions, not repeated parts');
  await context.route('**/runtime-config.js',r=>r.fulfill({contentType:'application/javascript',body:'window.DONGJIEXI_CONFIG={deployment:"web",apiEnabled:false};'}));
  await page.evaluate(()=>{localStorage.setItem('dongjiexi:solve-mode:v1','local');localStorage.setItem('dongjiexi:local-workflow:v1','native');});
  await page.reload({waitUntil:'domcontentloaded'});
  if(!await page.evaluate(()=>!!window.DongSceneAudit))await page.addScriptTag({content:fs.readFileSync(path.join(__dirname,'../dist/scene-audit.js'),'utf8')});
  const rows=[];
  for(const item of cases){
    await page.locator('#question').fill(item.question);await page.locator('#solveButton').click();
    await page.waitForFunction(()=>['complete','partial'].includes(document.querySelector('#solveProgress').dataset.state));
    const result=await page.evaluate(()=>JSON.parse(localStorage.getItem('zhigeometry:last')).solution);
    assert.equal(result.restatement,item.question,'No reference bank answer dispatch');
    assert.notEqual(result.verification?.status,'reference-reviewed');
    assert(result.parts.every(p=>p.status!=='needs_information'),'Uncovered rules do not certify missing conditions');
    const diagram=await page.evaluate(({scene,q,parts})=>window.DongSceneAudit?.inspect(scene,q,parts,window.DongConstruct)||null,{scene:result.scene,q:item.question,parts:result.parts});
    const parameterChecks=[];
    if(item.testOracle&&typeof item.testOracle==='object'&&result.scene){
      for(const [key,value] of Object.entries(item.testOracle))if(key!=='slope')parameterChecks.push({key,passed:Math.abs(result.scene[key==='a2'?'a':'b']**2-value)<1e-8});
    }
    rows.push({id:item.id,source:item.sources||additions.source,completion:result.completion,parts:result.parts.map(p=>({index:p.index,status:p.status,answer:p.answer})),verification:result.verification,parameterChecks,diagram});
    if(item.id==='2022-ii-21-1'&&!process.env.DONG_EXAM_BASELINE){assert.equal(result.completion.answered,1);assert(Math.abs(result.scene.a**2-2)<1e-9&&Math.abs(result.scene.b**2-2)<1e-9);}
    if(item.id==='2023-i-22'&&!process.env.DONG_EXAM_BASELINE){
      assert.equal(result.completion.answered,2,JSON.stringify(rows.at(-1)));
      assert.equal(diagram.missing.length,0,JSON.stringify(diagram));
      assert.match(result.parts.find(p=>p.index===2).steps.join(' '),/等号|取等/);
      await screenshot('sourced-2023-i-22.png',null);
    }
    if(item.id==='2022-beijing-12'&&!process.env.DONG_EXAM_BASELINE){
      assert.equal(result.completion.answered,1,JSON.stringify(rows.at(-1)));
      assert.match(result.parts[0].answer.replace(/[−–]/g,'-'),/m\s*=\s*-3/);
      assert.equal(result.scene.orientation,'vertical');
      assert(Math.abs(result.scene.a**2-1)<1e-8&&Math.abs(result.scene.b**2-3)<1e-8);
      assert.equal(result.scene.showDynamic,false,'An asymptote question does not need an arbitrary secant');
      await screenshot('sourced-2022-beijing-12.png',null);
    }
    if(item.id==='2023-i-6'&&!process.env.DONG_EXAM_BASELINE){
      assert.equal(result.scene.showDynamic,false,'External-tangent question must not introduce an unrelated moving secant');
      assert.equal(result.scene.lines.filter(n=>n.op==='tangent').length,2);
    }
    if(item.id==='2022-beijing-19-full'){
      if(!process.env.DONG_EXAM_BASELINE){
        assert.equal(result.completion.answered,2,JSON.stringify(rows.at(-1)));
        assert.deepEqual(result.scene.dynamicIntersectionLabels,['B','C']);
        assert(result.scene.objects.some(n=>n.label==='M')&&result.scene.objects.some(n=>n.label==='N'));
        assert(result.parts.find(p=>p.index===2).answer.includes('-4'),JSON.stringify(rows.at(-1)));
        assert.equal(parameterChecks.every(p=>p.passed),true);
        assert.equal(diagram.missing.length,0,JSON.stringify(diagram));
        assert.equal(diagram.invalid.length,0,JSON.stringify(diagram));
      }
      await page.getByRole('button',{name:'第（2）问',exact:true}).click();
      await screenshot('sourced-2022-beijing-19.png',null);
    }
  }
  const report={version:await page.evaluate(()=>document.querySelector('#versionButton').textContent),engine:'native; no inference API and no reference-answer dispatch',questions:rows.length,parts:rows.reduce((n,r)=>n+r.completion.total,0),answeredFlags:rows.reduce((n,r)=>n+r.completion.answered,0),note:'Answered flags are NOT a general correctness rate. Known oracle checks, partial answers and missing objects remain separately reported.',rows};
  const folder=process.env.DONG_TEST_OUTPUT;
  if(folder)fs.writeFileSync(path.join(folder,'sourced-exam-sweep.json'),JSON.stringify(report,null,2));
  console.log('SOURCED EXAM SWEEP '+JSON.stringify({questions:report.questions,parts:report.parts,answeredFlags:report.answeredFlags,missingDiagrams:rows.filter(r=>!r.diagram||r.diagram.missing.length).map(r=>r.id)}));
};
