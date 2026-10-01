/* Bounded, data-only reading of explicit auxiliary constructions in an answer.
 * No eval, invented coordinates, guessed loci or mathematical proof claims. */
(function(root){
  'use strict';
  const pointOps=new Set(['point_on','midpoint','reflect_axis','reflect_center','foot','ellipse_tangent_point','intersection']);
  const token='([A-Z](?:[0-9₀₁₂₃₄₅₆₇₈₉]+)?[′]?)';
  const clean=text=>(root.DongMathInput?.toPlain(text)??String(text||'')).replace(/\\(?:left|right|prime)/g,m=>m.endsWith('prime')?'′':'').replace(/[_{}$\s]/g,'').replace(/'/g,'′');
  function install(scene,parts,construct){
    const report={added:[],unresolved:[],conflicts:[],limitReached:false};if(!scene||!construct||!root.DongSceneAudit?.frame)return report;
    scene.objects||=[];scene.lines||=[];
    const canonical=root.DongSceneAudit.canonical,all=()=>[...scene.lines,...scene.objects];
    const used=new Set(all().map(n=>n.id).filter(Boolean));
    const unique=stem=>{let id=stem,i=1;while(used.has(id))id=stem+'-'+i++;used.add(id);return id;};
    const current=()=>root.DongSceneAudit.frame(scene,construct);
    const point=name=>{
      const matches=all().filter(n=>canonical(n.label)===canonical(name)&&(n.kind==='point'||pointOps.has(n.op)));
      if(matches.length>1)return null;
      if(matches.length){if(!matches[0].id)matches[0].id=unique('answer-ref-point');return matches[0].id;}
      const features=current()?.features.filter(n=>canonical(n.name)===canonical(name))||[];
      return features.length===1?'feature:'+features[0].name:null;
    };
    const samePoint=name=>!!point(name);
    const scope=part=>Number.isInteger(part?.index)?{part:part.index}:{};
    const share=(part,node)=>{if(node&&String(node.id).startsWith('answer-')&&node.source==='derived'&&Number.isInteger(part.index)){node.parts=[...new Set([...(node.parts||[]),...(node.part!=null?[node.part]:[]),part.index])];delete node.part;}return node;};
    const existingPoint=(part,name)=>{const ref=point(name);if(ref)share(part,all().find(n=>n.id===ref));return !!ref;};
    const pending=(part,label,reason)=>{const value={...scope(part),label,reason};if(report.unresolved.length<60&&!report.unresolved.some(n=>n.label===label&&n.part===value.part&&n.reason===reason))report.unresolved.push(value);};
    const checkExisting=(part,name,op,refs)=>{
      if(!existingPoint(part,name))return false;
      if(refs.every(Boolean)){
        const ref=point(name),item={id:unique('answer-check'),kind:'construction',op,refs,branch:0};
        scene.objects.push(item);const engine=current()?.engine,expected=engine?.resolve(item.id),actual=engine?.resolve(ref);scene.objects.pop();
        const conflict=expected?.type!=='point'||actual?.type!=='point'||Math.hypot(expected.x-actual.x,expected.y-actual.y)>1e-7*(1+Math.hypot(expected.x,expected.y,actual.x,actual.y));
        if(conflict&&!report.conflicts.some(n=>n.label===name&&n.part===part.index))report.conflicts.push({...scope(part),label:name,reason:'已有同名点与答案描述的 '+op+' 关系不符或关系当前无法构造，已保留原对象，未覆盖坐标'});
      }
      return true;
    };
    const add=(part,node)=>{
      if(pointOps.has(node.op)&&existingPoint(part,node.label))return null;
      const existing=all().find(n=>(n.op===node.op||node.role&&n.role===node.role)&&JSON.stringify(n.refs)===JSON.stringify(node.refs));
      if(existing&&!pointOps.has(node.op)){
        return share(part,existing);
      }
      if(report.added.length>=60||all().length>=500){report.limitReached=true;pending(part,node.label,'自动补图对象达到上限，请分问查看或手动补充');return null;}
      const item={id:unique('answer-'+node.op+'-'+canonical(node.label).replace(/[^A-Z0-9]/g,'')+'-'+(part.index??'all')),kind:'construction',source:'derived',visible:true,...(Number.isInteger(part.index)?{parts:[part.index]}:{}),...node};
      scene.objects.push(item);
      const resolved=current()?.engine.resolve(item.id);
      if(!resolved){scene.objects.pop();pending(part,node.label,'当前构型无法构造，未猜测坐标或方程');return null;}
      report.added.push({id:item.id,label:item.label,...scope(part)});return item;
    };
    const line=(part,name)=>{
      const key=canonical(name).replace(/^(直线|线段)/,'');
      if(scene.showDynamic!==false&&(scene.showDynamic||scene.dynamicLine)&&key===canonical(scene.dynamicLineLabel||'l'))return '$dynamic';
      const matches=all().filter(n=>canonical(n.label).replace(/^(直线|线段)/,'')===key&&!(n.kind==='point'||pointOps.has(n.op)));
      if(matches.length>1)return null;
      if(matches.length){const node=matches[0];if(!node.id)node.id=unique('answer-ref-line');return node.id;}
      const pair=clean(name).match(new RegExp('^'+token+token+'$'));
      if(!pair)return null;
      const refs=[point(pair[1]),point(pair[2])];
      return refs.every(Boolean)?add(part,{op:'line',refs,label:name})?.id:null;
    };
    for(const part of (parts||[]).slice(0,12)){
      const clauses=[part.answer,...(part.steps||[]).slice(0,40)].filter(s=>typeof s==='string').map(clean).flatMap(s=>s.split(/[。；;\n]/)).filter(s=>s&&s.length<1200&&!/不(?:在|是|作|存在|相交)|无法|不能|假设|反例|如果|若/.test(s)).slice(0,120);
      // Midpoints/feet may feed later constructions; re-read only this bounded
      // vocabulary until the graph stops growing. Never parse arbitrary code.
      for(let pass=0;pass<4;pass++){
        const before=report.added.length;
        for(const s of clauses){
          for(const re of [new RegExp('(?:设|取|记)?(?:点)?'+token+'(?:为|是)(?:线段|弦)?'+token+token+'的?中点','g'),new RegExp('(?:线段|弦)'+token+token+'的?中点(?:为|是|记为)(?:点)?'+token,'g')])for(const m of s.matchAll(re)){
            const order=m[0].startsWith('线段')||m[0].startsWith('弦')?[m[3],m[1],m[2]]:[m[1],m[2],m[3]],refs=[point(order[1]),point(order[2])];
            if(checkExisting(part,order[0],'midpoint',refs))continue;
            if(refs.every(Boolean))add(part,{op:'midpoint',refs,label:order[0]});else pending(part,order[0],'中点的两个端点尚未定位');
          }
          const gradientTargets=new Set();
          for(const m of s.matchAll(new RegExp('(?:在)?(?:点)?'+token+'(?:点)?处(?:的)?切线','g')))gradientTargets.add(m[1]);
          for(const m of s.matchAll(new RegExp('(?:在)?(?:点)?'+token+'[、,，和与]'+token+'(?:两点|点)?(?:处)?(?:的)?切线','g'))){gradientTargets.add(m[1]);gradientTargets.add(m[2]);}
          for(const name of gradientTargets){
            const ref=point(name),label=name+' 点切线';
            if(ref){const node=add(part,{op:'tangent',refs:[ref,'$conic'],label,role:'tangent'});if(!node)pending(part,label,'切点未在主曲线上，或当前无法定位');}
            else pending(part,label,'切点尚未定位');
          }
          for(const m of s.matchAll(new RegExp('(?:点)?'+token+'到直线('+token+token+'|[a-z][′]?)的?垂足(?:为|是|记为)(?:点)?'+token,'g'))){
            const name=m[5],refs=[point(m[1]),line(part,m[2])];if(checkExisting(part,name,'foot',refs))continue;
            if(refs.every(Boolean))add(part,{op:'foot',refs,label:name});else pending(part,name,'垂足所需的点或直线尚未定位');
          }
          for(const m of s.matchAll(new RegExp('直线('+token+token+'|[a-z][′]?)(?:与|和)(?:直线)?('+token+token+'|[a-z][′]?)交于(?:点)?'+token,'g'))){
            const name=m[7],refs=[line(part,m[1]),line(part,m[4])];if(checkExisting(part,name,'intersection',refs))continue;
            if(refs.every(Boolean))add(part,{op:'intersection',refs,branch:0,label:name});else pending(part,name,'交点所需的两条直线尚未定位');
          }
          for(const m of s.matchAll(new RegExp('(?:两条|两)切线交于(?:点)?'+token,'g'))){
            const tangents=all().filter(n=>(n.op==='tangent'||n.role==='tangent')&&n.refs?.[1]==='$conic'&&root.DongSceneAudit.visible(n,part.index));
            if(tangents.length===2){const refs=tangents.map(n=>n.id);if(!checkExisting(part,m[1],'intersection',refs))add(part,{op:'intersection',refs,branch:0,label:m[1]});}else pending(part,m[1],'未能唯一确定本问所指的两条切线');
          }
          for(const m of s.matchAll(new RegExp('(?:连接|连结)'+token+token,'g'))){const refs=[point(m[1]),point(m[2])];if(refs.every(Boolean))add(part,{op:'segment',refs,label:m[1]+m[2]});}
        }
        if(report.added.length===before)break;
      }
    }
    // Successful later passes settle earlier missing prerequisites.
    report.unresolved=report.unresolved.filter(n=>!samePoint(n.label)&&!all().some(o=>o.label===n.label));
    return report;
  }
  root.DongAnswerGeometry={install};
})(typeof window==='object'?window:globalThis);
