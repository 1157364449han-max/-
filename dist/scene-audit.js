/* Data-only diagram coverage and part visibility; numerical checks are NOT proofs. */
(function(root){
  'use strict';
  const canonical=s=>String(s||'').replace(/\\(?:prime)/g,'′').replace(/'/g,'′').replace(/[_{}\s]/g,'').replace(/[₀₁₂₃₄₅₆₇₈₉]/g,c=>'₀₁₂₃₄₅₆₇₈₉'.indexOf(c)).toUpperCase();
  const plain=s=>String(s||'').replace(/\\(?:left|right|,|;|!)/g,'').replace(/\\(?:triangle|Delta)/g,'△').replace(/\\prime/g,'′').replace(/[_{}$\s]/g,'').replace(/'/g,'′');
  const pointOps=new Set(['point_on','midpoint','reflect_axis','reflect_center','foot','ellipse_tangent_point','intersection']);
  const finite=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
  function declared(text){
    // A symbolic family P_n is not a distinct point named P. Numeric indices
    // remain concrete names, including multi-digit/subscripted ones.
    const s=plain(text),names=new Set(),n="([A-Z](?:[0-9₀₁₂₃₄₅₆₇₈₉]+)?[′]?)(?![a-z0-9₀₁₂₃₄₅₆₇₈₉])";
    const add=value=>{if(value)names.add(canonical(value));};
    for(const re of [new RegExp('(?:定点|动点|点|焦点|顶点|中点|切点)'+n,'g'),new RegExp(n+'[（(][^()（）]{1,50}[,，][^()（）]{1,50}[）)]','g'),new RegExp('(?:交于(?:不同的)?(?:两点|点)?|切点(?:分别)?为|中点(?:记)?为|对称点(?:记)?为)'+n+'(?:[、,，和与及]'+n+')?','g'),new RegExp(n+'(?:为|是)(?:点|线段|弦|三角形)','g')])for(const m of s.matchAll(re)){add(m[1]);add(m[2]);}
    for(const m of s.matchAll(/(?:△|三角形|四边形|矩形|平行四边形|正方形)([A-Z]{3,4})(?![A-Z])/g))for(const c of m[1])add(c);
    for(const m of s.matchAll(new RegExp('(?:连接|连结|直线|线段)'+n+n,'g'))){add(m[1]);add(m[2]);}
    return [...names];
  }
  function visible(item,active){
    if(item?.visible===false)return false;
    if(active==null||Number(active)===0)return true;
    if(item?.part!=null)return Number(item.part)===Number(active);
    return !Array.isArray(item?.parts)||!item.parts.length||item.parts.some(p=>Number(p)===Number(active));
  }
  function prepare(scene,question,parts=[]){
    if(!scene)return scene;
    // Absence of a moving line is intentional. Never manufacture A/B by default.
    scene.showDynamic=scene.showDynamic??scene.dynamicLine??false;
    const objects=[...(scene.objects||[]),...(scene.lines||[])],s=plain(question);
    const externalContacts=objects.filter(n=>n.op==='ellipse_tangent_point');
    const needsSecant=/动直线|直线[^。；]{0,80}交(?:于|椭圆|曲线)|弦(?:AB|PQ|BC)/.test(s)||objects.some(n=>(n.refs||[]).some(r=>r==='$dynamic'||r==='$dynamic2'));
    if(externalContacts.length>=2&&/切线|相切/.test(s)&&!needsSecant)scene.showDynamic=false;
    scene.dynamicLine=scene.showDynamic!==false;
    const first=String(question).search(/[（(]\s*\d{1,2}\s*[）)]/),global=new Set(declared(first<0?question:String(question).slice(0,first)));
    const partNames=new Map(parts.map(p=>[Number(p.index),new Set(declared(p.body||p.question||''))]));
    const nodes=[...(scene.objects||[]),...(scene.lines||[]),...(scene.polygons||[])];
    scene.pointParts||={};
    for(const node of nodes){
      if(node.part!=null||node.parts?.length||global.has(canonical(node.label)))continue;
      const ids=[...partNames].filter(([,names])=>names.has(canonical(node.label))).map(([i])=>i);
      if(ids.length)node.parts=ids;
    }
    const byId=new Map(nodes.filter(n=>n.id).map(n=>[n.id,n]));
    const scopes=n=>n.part!=null?[Number(n.part)]:n.parts||null;
    // An inferred parent is shared by every dependent part. Explicit user scope wins.
    for(let pass=0;pass<=nodes.length;pass++){
      let changed=false;
      for(const node of nodes){
        const required=scopes(node);if(!required?.length)continue;
        for(const ref of node.refs||[]){
          if(ref.startsWith('feature:')){
            const name=ref.slice(8);if(global.has(canonical(name)))continue;
            const before=scene.pointParts[name]||[],after=[...new Set([...before,...required])];
            if(after.length!==before.length){scene.pointParts[name]=after;changed=true;}
          }else{
            const parent=byId.get(ref);if(!parent||parent.part!=null||global.has(canonical(parent.label)))continue;
            const before=parent.parts||[],after=[...new Set([...before,...required])];
            if(after.length!==before.length){parent.parts=after;changed=true;}
          }
        }
      }
      if(!changed)break;
    }
    for(const name of Object.keys(scene.points||{})){
      if(global.has(canonical(name)))continue;
      const ids=[...partNames].filter(([,names])=>names.has(canonical(name))).map(([i])=>i);
      if(ids.length)scene.pointParts[name]=[...new Set([...(scene.pointParts[name]||[]),...ids])];
    }
    return scene;
  }
  function inspect(scene,question,parts=[],construct){
    const expected=declared(question),report={expected,missing:[],missingLines:[],invalid:[],checks:[],note:'生成时当前位置的数值核对，不是一般性证明；拖动后需重新核对。'};
    if(!scene){report.missing=expected;return report;}
    const h=Number(scene.h)||0,k=Number(scene.k)||0,labels=new Set(Object.keys(scene.points||{}).map(canonical));
    for(const n of ['O',...(scene.type==='parabola'?['F','V']:scene.type==='circle'?[]:['F1','F2','A1','A2'])])labels.add(n);
    for(const n of scene.objects||[])if(n.kind==='point'||pointOps.has(n.op))labels.add(canonical(n.label));
    if(scene.showDynamic!==false&&(scene.showDynamic===true||scene.dynamicLine===true))for(const n of scene.dynamicIntersectionLabels||['A','B'])labels.add(canonical(n));
    if(scene.pairedChord)for(const n of scene.pairedChord.labels||[])labels.add(canonical(n));
    if(scene.fixedPoint)labels.add(canonical(scene.fixedPoint.name||'T'));
    report.missing=expected.filter(n=>!labels.has(n));
    const all=[...(scene.objects||[]),...(scene.lines||[])],qs=plain(question);
    const lineNames=[...qs.matchAll(/直线([a-zA-Z][0-9₀₁₂₃′]?|[A-Z][′]?[A-Z][′]?)(?![a-zA-Z])/g)].map(m=>canonical(m[1]));
    const present=new Set(all.filter(n=>['line','slope','vertical','through_points'].includes(n.kind)||['line','segment','ray','tangent','normal','parallel','perpendicular','line_angle'].includes(n.op)).map(n=>canonical(n.label).replace(/^(直线|线段|连接)/,'')));
    if(scene.showDynamic===true){present.add(canonical(scene.dynamicLineLabel||'l'));const pair=scene.dynamicIntersectionLabels||['A','B'];present.add(canonical(pair.join('')));present.add(canonical([...pair].reverse().join('')));}
    for(const n of all)if(n.kind==='through_points'){present.add(canonical(n.a+n.b));present.add(canonical(n.b+n.a));}
    report.missingLines=[...new Set(lineNames)].filter(n=>!present.has(n));
    const contacts=new Map(all.filter(n=>n.op==='ellipse_tangent_point').map(n=>[n.id,n]));
    const tangents=all.filter(n=>n.op==='tangent'||n.role==='tangent'||n.op==='line'&&n.refs?.some(ref=>contacts.has(ref)&&n.refs.includes(contacts.get(ref).refs?.[0])));
    if(/(?:两条|两点|两切线|[A-Z][、,，和与][A-Z][^。；]{0,15})(?:[^。；]{0,20})切线|相切的两条直线/.test(qs)&&tangents.length<2)report.missingLines.push('两条切线（当前仅找到 '+tangents.length+' 条）');
    if(!construct)return report;
    try{
      const curve=scene.type==='circle'?{q:{A:1,B:0,C:1,D:-2*h,E:-2*k,F:h*h+k*k-scene.r**2},pointAt:t=>({x:h+scene.r*Math.cos(t),y:k+scene.r*Math.sin(t)})}:construct.conicShape({...scene,conicType:scene.type});
      if(!curve?.q)return report;
      const fs=Object.entries(scene.points||{}).map(([name,p])=>({name,x:p[0],y:p[1]}));
      const add=(name,x,y)=>{if(!fs.some(p=>canonical(p.name)===canonical(name)))fs.push({name,x,y});};
      add('O',scene.type==='circle'?h:0,scene.type==='circle'?k:0);add('V',h,k);
      const c=scene.type==='ellipse'?Math.sqrt(scene.a**2-scene.b**2):scene.type==='hyperbola'?Math.hypot(scene.a,scene.b):(scene.p||0)*(scene.direction||1),v=scene.orientation==='vertical';
      add('F₁',h-(v?0:c),k-(v?c:0));add('F₂',h+(v?0:c),k+(v?c:0));add('F',h+(v?0:c),k+(v?c:0));
      let origin={x:h,y:k};
      if(scene.lineThrough?.startsWith('point:'))origin=fs.find(p=>p.name===scene.lineThrough.slice(6))||origin;
      else if(scene.lineThrough==='focus1')origin=fs.find(p=>p.name==='F₁');
      else if(scene.lineThrough==='focus2')origin=fs.find(p=>p.name==='F₂');
      const theta=Number.isFinite(scene.theta)?scene.theta:42,rad=theta*Math.PI/180;
      if(scene.showDynamic!==false&&(scene.showDynamic===true||scene.dynamicLine===true))construct.intersect({type:'line',o:origin,d:{x:Math.cos(rad),y:Math.sin(rad)}},{type:'conic',q:curve.q}).slice(0,2).forEach((p,i)=>add((scene.dynamicIntersectionLabels||['A','B'])[i],p.x,p.y));
      const engine=construct.createEngine({model:()=>scene,features:()=>fs,coeffs:()=>curve.q,origin:()=>origin,angle:()=>theta,conicPoint:curve.pointAt,conicProject:curve.project});
      for(const node of [...(scene.lines||[]),...(scene.objects||[])]){
        if(!node.id)continue;
        const value=engine.resolve(node.id);
        if(!value||value.type==='point'&&!finite(value)){report.invalid.push(node.label||node.id);continue;}
        if(node.op==='tangent'){
          const point=engine.resolve(node.refs[0]),conic=engine.resolve(node.refs[1]);
          if(!finite(point)||!conic?.q)continue;
          const q=conic.q,{x,y}=point,residual=q.A*x*x+q.B*x*y+q.C*y*y+q.D*x+q.E*y+q.F,scale=1+Math.abs(q.A*x*x)+Math.abs(q.B*x*y)+Math.abs(q.C*y*y)+Math.abs(q.D*x)+Math.abs(q.E*y)+Math.abs(q.F);
          const gx=2*q.A*x+q.B*y+q.D,gy=q.B*x+2*q.C*y+q.E,den=Math.hypot(gx,gy)*Math.hypot(value.d?.x||0,value.d?.y||0),dot=den?Math.abs(gx*value.d.x+gy*value.d.y)/den:Infinity;
          report.checks.push({label:node.label||node.id,kind:'tangent',passed:Math.abs(residual)/scale<1e-7&&dot<1e-7,part:node.part,parts:node.parts,detail:'切点在曲线上，切线方向与梯度垂直（当前位置）'});
        }
        if(node.op==='midpoint'){
          const a=engine.resolve(node.refs[0]),b=engine.resolve(node.refs[1]);
          if(finite(a)&&finite(b))report.checks.push({label:node.label||node.id,kind:'midpoint',passed:Math.hypot(value.x-(a.x+b.x)/2,value.y-(a.y+b.y)/2)<1e-7*(1+Math.hypot(a.x,a.y,b.x,b.y)),part:node.part,parts:node.parts,detail:'与两端点坐标平均值一致（当前位置）'});
        }
      }
    }catch{report.invalid.push('部分构造无法核对');}
    report.invalid=[...new Set(report.invalid)];
    return report;
  }
  root.DongSceneAudit={canonical,declared,visible,prepare,inspect};
})(typeof window==='object'?window:globalThis);
