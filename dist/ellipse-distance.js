/* Distance extrema on an axis-aligned ellipse, with the fixed point on a symmetry axis. */
(() => {
  'use strict';
  const near=(a,b)=>Math.abs(a-b)<=1e-10*Math.max(1,Math.abs(a),Math.abs(b));
  const number=x=>Number(x.toPrecision(12)).toString();
  function fraction(x){
    for(let d=1;d<=10000;d++){const n=Math.round(x*d);if(Number.isSafeInteger(n)&&Math.abs(n/d-x)<=1e-11*Math.max(1,Math.abs(x)))return[n,d];}
    return null;
  }
  function tex(x){const f=fraction(x);return f?(f[1]===1?String(f[0]):`${f[0]<0?'-':''}\\frac{${Math.abs(f[0])}}{${f[1]}}`):number(x);}
  function rootTex(x){
    if(near(x,0))return '0';
    const f=fraction(x);if(!f||f[0]<0)return `\\sqrt{${tex(x)}}`;
    let rad=f[0]*f[1],outside=1;
    if(!Number.isSafeInteger(rad)||rad>1e10)return `\\sqrt{${tex(x)}}`;
    for(let n=2;n*n<=rad;n++){while(rad%(n*n)===0){rad/=n*n;outside*=n;}}
    if(rad===1)return tex(outside/f[1]);
    const coefficient=fraction(outside/f[1]),top=`${coefficient[0]===1?'':coefficient[0]}\\sqrt{${rad}}`;
    return coefficient[1]===1?top:`\\frac{${top}}{${coefficient[1]}}`;
  }
  function shiftedRoot(center,squared,sign){
    const root=Math.sqrt(Math.max(0,squared));if(fraction(root))return tex(center+sign*root);
    return `${center?tex(center):''}${sign<0?'-':center?'+':''}${rootTex(squared)}`;
  }
  const shift=(variable,center)=>near(center,0)?variable:`(${variable}${center<0?'+':'-'}${tex(Math.abs(center))})`;
  function polynomial(a,b,c){
    return [[a,'t^2'],[b,'t'],[c,'']].filter(([n])=>!near(n,0)).map(([n,v],i)=>`${n<0?'-':i?'+':''}${v&&near(Math.abs(n),1)?'':tex(Math.abs(n))}${v}`).join('')||'0';
  }
  function compute(model,values,source){
    if(model.type!=='ellipse'||!source?.every(Number.isFinite))return null;
    const h=Number(values.h)||0,k=Number(values.k)||0,rx=Number(model.orientation==='vertical'?values.b:values.a),ry=Number(model.orientation==='vertical'?values.a:values.b);
    if(!(rx>0&&ry>0&&Number.isFinite(rx+ry)))return null;
    const vertical=near(source[0],h),horizontal=near(source[1],k);
    if(!vertical&&!horizontal)return null;
    const radius=vertical?ry:rx,other=vertical?rx:ry,d=vertical?source[1]-k:source[0]-h;
    const quadratic=1-other*other/(radius*radius),linear=-2*d,constant=other*other+d*d;
    const vertex=near(quadratic,0)?null:-linear/(2*quadratic),ts=[-radius,radius];
    if(vertex!=null&&vertex>-radius&&vertex<radius)ts.push(vertex);
    const value=t=>Math.max(0,quadratic*t*t+linear*t+constant),candidates=ts.map(t=>({t,squared:value(t)}));
    function edge(kind){
      const squared=Math[kind](...candidates.map(c=>c.squared)),chosen=candidates.filter(c=>near(c.squared,squared));
      const points=[];
      for(const c of chosen){const otherSquared=Math.max(0,other*other*(1-c.t*c.t/(radius*radius))),offset=Math.sqrt(otherSquared);
        for(const sign of near(offset,0)?[1]:[1,-1]){
          const x=h+(vertical?sign*offset:c.t),y=k+(vertical?c.t:sign*offset);
          if(!points.some(p=>near(p.x,x)&&near(p.y,y)))points.push({x,y,t:c.t,otherSquared,sign});
        }
      }
      return{squared,distance:Math.sqrt(squared),points};
    }
    return{h,k,rx,ry,vertical,radius,other,d,quadratic,linear,constant,vertex,candidates,min:edge('min'),max:edge('max'),constantDistance:near(quadratic,0)&&near(linear,0)};
  }
  function install(scene,raw,part){
    const text=(window.DongMathInput?.toPlain(part.body||raw)??raw).replace(/\s/g,'').toUpperCase();
    if(!/最大|最小|最值|取值范围|最长|最短/.test(text)||/面积|周长|切线|轨迹|夹角|证明/.test(text))return null;
    // Additional restrictions require a different domain, so do not solve them on the whole ellipse.
    const whole=(window.DongMathInput?.toPlain(raw)??raw).replace(/\s/g,'').toUpperCase();
    if(/象限|半平面|弧|不重合|不与|满足|限制|[XY][<>≤≥]|[XY]为(?:正|负)/.test(whole))return null;
    const matches=[];
    for(const moving of scene.model.objects||[]){
      if(moving.op!=='point_on'||moving.refs?.[0]!=='$conic')continue;
      for(const source of Object.keys(scene.model.points||{})){
        if(text.includes(moving.label+source)||text.includes(source+moving.label)||new RegExp(`点?${moving.label}到(?:定?点)?${source}`).test(text))matches.push({moving,source});
      }
    }
    if(matches.length!==1)return null;
    const {moving,source}=matches[0],result=compute(scene.model,scene.values,scene.model.points[source]);if(!result)return null;
    const edges=/范围|最值/.test(text)?['min','max']:[...(/最小|最短/.test(text)?['min']:[]),...(/最大|最长/.test(text)?['max']:[])];
    const spec={moving:moving.label,movingId:moving.id,source,edges,part:part.index};
    scene.model.distanceExtrema||=[];
    if(!scene.model.distanceExtrema.some(s=>s.moving===spec.moving&&s.source===source&&s.part===spec.part))scene.model.distanceExtrema.push(spec);
    const id=`distance-segment-${moving.id}-${source}`;
    if(!scene.model.objects.some(o=>o.id===id))scene.model.objects.push({id,kind:'construction',op:'segment',refs:[moving.id,`feature:${source}`],label:moving.label+source,source:'question',visible:true});
    const pair=moving.label+source,r=result;
    const coordinate=p=>`(${r.vertical?shiftedRoot(r.h,p.otherSquared,p.sign):tex(r.h+p.t)},${r.vertical?tex(r.k+p.t):shiftedRoot(r.k,p.otherSquared,p.sign)})`;
    const steps=[`设动点 ${moving.label} 的坐标为 $(x,y)$，令 $t=${shift(r.vertical?'y':'x',r.vertical?r.k:r.h)}$，由椭圆方程得 $-${tex(r.radius)}\\le t\\le ${tex(r.radius)}$。`,
      `消去另一坐标的平方：$${shift(r.vertical?'x':'y',r.vertical?r.h:r.k)}^2=${tex(r.other*r.other)}\\left(1-\\frac{t^2}{${tex(r.radius*r.radius)}}\\right)$。`,
      `由两点距离公式，$|${pair}|^2=${polynomial(r.quadratic,r.linear,r.constant)}$。`];
    if(r.vertex!=null)steps.push(`配方得 $|${pair}|^2=${tex(r.quadratic)}${shift('t',r.vertex)}^2+${tex(r.constant-r.linear*r.linear/(4*r.quadratic))}$。${r.vertex>=-r.radius&&r.vertex<=r.radius?'顶点在允许区间内。':'顶点不在允许区间内。'}`);
    steps.push(`在闭区间比较两端点${r.vertex!=null&&r.vertex>-r.radius&&r.vertex<r.radius?'及区间内的二次函数顶点':''}：${r.candidates.map(c=>`$t=${tex(c.t)}$ 时 $|${pair}|^2=${tex(c.squared)}$`).join('；')}。`);
    const answer=edges.map(kind=>{
      const e=r[kind],name=kind==='max'?'最大':'最小';
      const coordinates=e.points.map(coordinate).join('\\quad\\text{或}\\quad');
      return `$|${pair}|$ 的${name}值为 $${rootTex(e.squared)}$。${r.constantDistance?'曲线是以定点为圆心的圆，曲线上任意点均取得此值。':`此时 $${moving.label}=${coordinates}$。`}`;
    }).join('\n');
    steps.push('距离非负，距离平方与距离在同一位置取得最大、最小值。将上述坐标代回椭圆方程及距离公式，核对取等条件。','画板标出全部取值位置；可拖动动点或点击“定位”比较。改变题设参数后，画板重新计算，解析仍对应原题。');
    const checks=edges.flatMap(kind=>r[kind].points.map((p,i)=>{const residual=(p.x-r.h)**2/r.rx**2+(p.y-r.k)**2/r.ry**2-1,distance=(p.x-scene.model.points[source][0])**2+(p.y-scene.model.points[source][1])**2;return{id:`distance-${part.index}-${kind}-${i}`,label:'极值点代回核验',status:Math.abs(residual)<1e-8&&near(distance,r[kind].squared)?'verified':'contradicted',detail:'代入椭圆与距离公式；全局最值依据解题步骤中的闭区间二次函数比较。',category:'construction'};}));
    return{status:'answered',answer,steps,checks};
  }
  window.DongEllipseDistance={compute,install,tex,rootTex};
})();
