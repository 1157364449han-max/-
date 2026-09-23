/* One reusable polar-line construction, independent of question examples. */
(() => {
  'use strict';
  function contactsFromQuadratic(q,p){
    if(!q||!p||![q.A,q.B,q.C,q.D,q.E,q.F,p.x,p.y].every(Number.isFinite))return null;
    if(Math.abs(q.B)>1e-12||q.A*q.C<=0)return null;
    const h=-q.D/(2*q.A),k=-q.E/(2*q.C),scale=-(q.F+q.D*h/2+q.E*k/2);
    const rx=Math.sqrt(scale/q.A),ry=Math.sqrt(scale/q.C);
    if(!(rx>0&&ry>0&&Number.isFinite(rx+ry)))return null;
    const u=(p.x-h)/rx,v=(p.y-k)/ry,d=u*u+v*v;
    if(!Number.isFinite(d))return null;
    const base={h,k,rx,ry,u,v,d,points:[]};
    if(d<1-1e-10)return base;
    const root=Math.sqrt(Math.max(0,d-1));
    base.points=(root<1e-10?[1]:[1,-1]).map(sign=>{
      const xi=(u-sign*v*root)/d,eta=(v+sign*u*root)/d;
      return {x:h+rx*xi,y:k+ry*eta,xi,eta};
    });
    return base;
  }
  const number=n=>Math.abs(n)<1e-12?'0':Number(n.toPrecision(10)).toString();
  const shift=(name,n)=>n?`(${name}${n<0?'+':'-'}${number(Math.abs(n))})`:name;
  function install(scene,text,q){
    if(!['ellipse','circle'].includes(scene.model.type)||!/切线|相切|切于/.test(text))return null;
    const found=text.match(/(?:过|由|从)(?:定?点)?\s*([A-Za-z](?:[12])?)\s*(?:[（(][^）)]+[）)])?[^。；\n]{0,60}?(?:作|引|引出|作出|做)?[^。；\n]{0,12}(?:切线|相切|切于)/);
    if(!found)return null;
    const name=found[1].toUpperCase(),position=scene.model.points?.[name];
    if(!position)return null;
    const source={x:position[0],y:position[1]},result=contactsFromQuadratic(q,source);if(!result)return null;
    const names=text.match(/(?:切点(?:分别)?(?:为|是)?|分别切于|切于|切点为)\s*([A-Za-z])\s*[、，,和与]\s*([A-Za-z])/);
    const labels=names?[names[1].toUpperCase(),names[2].toUpperCase()]:['T₁','T₂'];
    // Existing named points must never be silently replaced by generated contacts.
    if(new Set(labels).size!==2||labels.some(label=>scene.model.points?.[label]||scene.model.objects.some(o=>o.label===label)))return null;
    const ids=labels.map((_,i)=>`external-contact-${name}-${i}`),lines=[];
    if(result.points.length){
      // Keep both branches in the dependency graph: the second can reappear after a drag.
      ids.forEach((id,branch)=>{
        scene.model.objects.push({id,kind:'construction',op:'ellipse_tangent_point',refs:[`feature:${name}`,'$conic'],branch,label:labels[branch],source:'derived',role:'external_contact',visible:true});
        const line={id:`external-tangent-${name}-${branch}`,kind:'construction',op:'tangent',refs:[id,'$conic'],label:`${labels[branch]} 点切线`,source:'derived',role:'external_tangent',visible:true};
        scene.model.lines.push(line);lines.push(line);
      });
    }
    const checks=result.points.map((p,i)=>{
      const surface=((p.x-result.h)/result.rx)**2+((p.y-result.k)/result.ry)**2-1;
      const incidence=p.xi*result.u+p.eta*result.v-1,ok=Math.abs(surface)<1e-8&&Math.abs(incidence)<1e-8;
      return {id:`external-contact-check-${i}`,status:ok?'verified':'contradicted',label:`${labels[i]} 切点数值代回`,detail:'分别代入曲线方程和过源点的切线条件；这是数值核验，通用推导见解题步骤。',category:'construction'};
    });
    return {...result,name,source,labels,ids,lines,checks};
  }
  function solvePart(scene,part,c){
    if(!c)return null;
    const body=part.body||part.question;
    const wantsTangents=/切线|切点/.test(body),wantsArea=/面积/.test(body),wantsLength=/切线长|切线段.*长/.test(body);
    if(!wantsTangents&&!wantsArea&&!wantsLength)return null;
    const steps=[
      `把曲线化为单位圆：令 $X=\\frac{x-${number(c.h)}}{${number(c.rx)}},\\ Y=\\frac{y-${number(c.k)}}{${number(c.ry)}}$，则 $X^2+Y^2=1$。下方小数结果为近似值。`,
      `源点变为 $(u,v)$，其中 $u=${number(c.u)},\\ v=${number(c.v)},\\ d=u^2+v^2=${number(c.d)}$。`,
      '设切点为 $(\\xi,\\eta)$。切线为 $\\xi X+\\eta Y=1$，过源点给出 $u\\xi+v\\eta=1$，另有 $\\xi^2+\\eta^2=1$。',
      '联立得到 $\\xi_{\\pm}=\\frac{u\\mp v\\sqrt{d-1}}d,\\quad\\eta_{\\pm}=\\frac{v\\pm u\\sqrt{d-1}}d$。因此 $d>1$ 有两条切线，$d=1$ 有一条，$d<1$ 无实切线。'
    ];
    if(/证明|定值|定点|最值|范围|轨迹|夹角|垂直|平行/.test(body))return {status:'partial',answer:'已建立外点切线模型，但本问的证明、范围或其它结论尚未完成。',steps};
    if(c.d<1-1e-10)return {status:'answered',answer:`点 ${c.name} 在曲线内部，d<1，不存在过该点的实切线${wantsArea?'，题述切线三角形不存在':''}。`,steps};
    const descriptions=c.points.map((p,i)=>{
      const equation=`${number(p.xi/c.rx)}${shift('x',c.h)}+(${number(p.eta/c.ry)})${shift('y',c.k)}=1`;
      return `${c.labels[i]} 的坐标约为 $(${number(p.x)},${number(p.y)})$，对应切线约为 $${equation}$。`;
    });
    steps.push(...descriptions,'切点与切线已加入画板；拖动源点后，依赖图形实时重算。解析数值对应本次题设，不随探索自动重写。');
    let answer=descriptions.join('\n');
    if(wantsArea){
      const triangle=body.match(/(?:△|三角形)\s*([A-Za-z])\s*([A-Za-z])\s*([A-Za-z])/);
      if(!triangle||[c.name,...c.labels].some(n=>!triangle.slice(1).map(x=>x.toUpperCase()).includes(n)))return {status:'partial',answer:'已求出切线，但尚未确认本问面积所指的三个顶点；没有把其它三角形的面积当作答案。',steps};
      if(c.points.length<2)return {status:'answered',answer:'源点在曲线上，两条切线合并，不能形成题述三角形。',steps};
      const [a,b]=c.points,p=c.source,area=Math.abs((a.x-p.x)*(b.y-p.y)-(a.y-p.y)*(b.x-p.x))/2;
      steps.push('用坐标行列式：$S=\\frac12|(x_A-x_P)(y_B-y_P)-(y_A-y_P)(x_B-x_P)|$。');
      answer+=`\n$S_{\\triangle ${triangle.slice(1).join('')}}\\approx ${number(area)}$。`;
      const edges=[[`feature:${c.name}`,c.ids[0]],[`feature:${c.name}`,c.ids[1]],c.ids];
      edges.forEach((refs,i)=>{const id=`external-triangle-${c.name}-${part.index}-${i}`;if(!scene.model.objects.some(o=>o.id===id))scene.model.objects.push({id,kind:'construction',op:'segment',refs,label:`切线三角形边 ${i+1}`,part:part.index,visible:true,source:'derived'});});
    }
    if(wantsLength){
      c.points.forEach((p,i)=>{answer+=`\n$|${c.name}${c.labels[i]}|\\approx ${number(Math.hypot(p.x-c.source.x,p.y-c.source.y))}$。`;});
      steps.push('分别使用两点距离公式求切线段长；椭圆的两条切线段不一定等长。');
    }
    // Do not silently answer only the tangent subgoal of a compound request.
    if(/周长|距离|最大|最小|取值|存在|是否|交点|中点/.test(body))return {status:'partial',answer:answer+'\n切线部分已完成，其余目标尚需推导。',steps};
    return {status:'answered',answer,steps};
  }
  window.DongTangentSolver={contactsFromQuadratic,install,solvePart};
})();
