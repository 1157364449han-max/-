/* Infer one unknown denominator from a homogeneous asymptote identity. */
(()=>{
  'use strict';
  const tex=x=>window.DongNumber?.tex(x)||String(x);
  function infer(source){
    if(!/双曲线/.test(source)||!source.includes('渐近线'))return null;
    const s=source.replace(/\s|[{}$]/g,'').replace(/²/g,'^2').replace(/[−–]/g,'-').replace(/\*(?=[xy])/g,'');
    const n='(?:\\d+(?:\\.\\d+)?(?:/\\d+(?:\\.\\d+)?)?)',den=`(?:${n}|[a-z])`,t=`(?:${n})?[xy]\\^2(?:/${den})?`;
    const equation=s.match(new RegExp(`([+-]?${t})([+-])(${t})=([+-]?${n})(?![a-z0-9])`));
    if(!equation)return null;
    const scalar=raw=>{try{return window.DongEquationBuilder.scalar(raw);}catch{return NaN;}};
    const parse=(raw,sign)=>{
      const m=raw.match(new RegExp(`^([+-]?)(${n})?([xy])\\^2(?:/(${den}))?$`));
      if(!m)return null;
      const coefficient=(m[1]==='-'?-1:1)*sign*scalar(m[2]||'1'),unknown=/^[a-z]$/.test(m[4]||'');
      return{axis:m[3],coefficient,unknown,name:unknown?m[4]:null,denominator:unknown?null:scalar(m[4]||'1')};
    };
    const terms=[parse(equation[1],1),parse(equation[3],equation[2]==='-'?-1:1)];
    if(terms.some(t=>!t)||terms[0].axis===terms[1].axis||terms.filter(t=>t.unknown).length!==1)return null;
    const tail=s.slice(s.indexOf('渐近线')),line=tail.match(/([xy])=(?:±|\+-)?([^=。；,，]+?)([xy])(?:[^a-z]|$)/);
    if(!line||line[1]===line[3])return null;
    const factor=scalar(line[2]),slope=line[1]==='y'?factor:1/factor;
    if(!Number.isFinite(slope)||Math.abs(slope)<1e-12)return null;
    const unknown=terms.find(t=>t.unknown),known=terms.find(t=>!t.unknown),knownCoefficient=known.coefficient/known.denominator,rhs=scalar(equation[4]);
    if(['x','y'].includes(unknown.name)||known.denominator===0)return null;
    const value=unknown.axis==='x'?-unknown.coefficient/(knownCoefficient*slope**2):-unknown.coefficient*slope**2/knownCoefficient;
    if(!Number.isFinite(value)||Math.abs(value)<1e-12||!Number.isFinite(rhs)||rhs===0)return null;
    const limits=[...s.matchAll(new RegExp(unknown.name+`([<>≥≤])(${n})(?![a-z0-9])`,'g'))];
    for(const limit of limits){const bound=scalar(limit[2]);if(!(limit[1]==='>'?value>bound:limit[1]==='<'?value<bound:limit[1]==='≥'?value>=bound:value<=bound))return null;}
    const coefficients=Object.fromEntries(terms.map(t=>[t.axis,t.coefficient/(t.unknown?value:t.denominator)/rhs]));
    if(!(coefficients.x*coefficients.y<0))return null;
    const horizontal=coefficients.x>0,a2=1/(horizontal?coefficients.x:coefficients.y),b2=-1/(horizontal?coefficients.y:coefficients.x);
    const reconstructed=-coefficients.x/coefficients.y;
    if(Math.abs(reconstructed-slope**2)>1e-9*(1+slope**2)||!(a2>0&&b2>0))return null;
    const relation=unknown.axis==='x'?`${tex(unknown.coefficient)}/${unknown.name}=-(${tex(knownCoefficient)})(${tex(slope)})^2`:`${tex(unknown.coefficient)}/${unknown.name}=-(${tex(knownCoefficient)})/(${tex(slope)})^2`;
    const parameterSolution={name:unknown.name,value,slope,a2,b2,relation,coefficients};
    return{type:'hyperbola',a:Math.sqrt(a2),b:Math.sqrt(b2),h:0,k:0,orientation:horizontal?'horizontal':'vertical',inferred_from_conditions:true,parameterSolution,exact:{a2:tex(a2),b2:tex(b2)},derivation:[`保留题中参数的符号，不能先假设 $${unknown.name}>0$。`,`渐近线满足曲线的齐次二次项 $A_xx^2+C_yy^2=0$，代入斜率得 $A_x+C_y s^2=0$。`,`因此 $${relation}$，解得 $${unknown.name}=${tex(value)}$。回代后两平方项异号，符合双曲线条件。`]};
  }
  function solvePart(part,context){
    if(!context)return null;
    const body=(part.body||part.question||'').replace(/\s/g,'');
    if(!new RegExp(`(?:求|则)${context.name}(?:的值|=|为|是|[？?]|$)`).test(body))return null;
    return{status:'answered',answer:`$${context.name}=${tex(context.value)}$。`,steps:[
      '双曲线标准形式的两个平方项符号相反。未知分母的符号必须从条件推导，不能预设为正。',
      `把渐近线代入曲线的齐次二次项，得 $${context.relation}$。`,
      `解得 $${context.name}=${tex(context.value)}$；回代可得 $a^2=${tex(context.a2)}$，$b^2=${tex(context.b2)}$，渐近线斜率平方与题设一致。`,
      '未知分母非零、两平方项异号及半轴平方为正均已检查，所得曲线确为双曲线。'
    ]};
  }
  function checks(context){
    if(!context)return [];
    const {coefficients:c,slope,value,a2,b2}=context;
    const close=Math.abs(c.x+c.y*slope**2)<1e-9*(1+Math.abs(c.x)+Math.abs(c.y*slope**2));
    const domain=Number.isFinite(value)&&Math.abs(value)>1e-12&&a2>0&&b2>0&&c.x*c.y<0;
    return [{id:'conic-parameter-domain',status:domain?'verified':'contradicted',label:'原题未知分母与曲线类型',detail:'分母非零、平方项异号、半轴平方为正。',category:'curve'},
      {id:'conic-parameter-asymptote',status:close?'verified':'contradicted',label:'原题渐近线回代',detail:'从原题系数复算 Aₓ+Cᵧs²=0，不使用 AI 的结果作为前提。',category:'curve'}];
  }
  window.DongConicParameter={infer,solvePart,checks};
})();
