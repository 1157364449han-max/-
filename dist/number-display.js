/* Display simple exact forms without changing numerical geometry storage. */
(() => {
  'use strict';
  function rational(x,maxDen=1000){
    if(!Number.isFinite(x)||Math.abs(x)>1e9)return null;
    const sign=x<0?-1:1,v=Math.abs(x),tolerance=16*Number.EPSILON*Math.max(1,v);
    let a=v,p0=0,p1=1,q0=1,q1=0;
    for(let i=0;i<24;i++){
      const k=Math.floor(a),p=k*p1+p0,q=k*q1+q0;
      if(q>maxDen||!Number.isSafeInteger(p))break;
      if((p!==0||v===0)&&Math.abs(p/q-v)<=tolerance)return[sign*p,q];
      const remainder=a-k;if(remainder===0)break;
      [p0,p1,q0,q1]=[p1,p,q1,q];a=1/remainder;
    }
    return null;
  }
  function ratio(n,d,symbol='',latexSymbol=symbol){
    const sign=n<0?'-':'',a=Math.abs(n),top=`${symbol&&a===1?'':a}${symbol}`,texTop=`${symbol&&a===1?'':a}${latexSymbol}`;
    return{text:sign+(d===1?top:`${top}/${d}`),tex:sign+(d===1?texTop:`\\frac{${texTop}}{${d}}`)};
  }
  function exact(x){
    if(!Number.isFinite(x))return null;
    if(Number.isSafeInteger(x))return{text:String(x),tex:String(x)};
    if(x===0)return{text:'0',tex:'0'};
    const f=rational(x);if(f)return ratio(...f);
    const pi=rational(x/Math.PI,100);if(pi&&Math.abs(pi[0])<=1000)return ratio(...pi,'π','\\pi');
    const square=rational(x*x,1000);
    if(!square||square[0]<=0||square[0]*square[1]>1e8)return null;
    let rad=square[0]*square[1],factor=1;
    for(let n=2;n*n<=rad;n++)while(rad%(n*n)===0){factor*=n;rad/=n*n;}
    // Check the reconstruction at floating point roundoff, not display precision.
    if(Math.abs(factor*Math.sqrt(rad)/square[1]-Math.abs(x))>16*Number.EPSILON*Math.max(1,Math.abs(x)))return null;
    const coefficient=rational((x<0?-factor:factor)/square[1]);
    return coefficient?ratio(...coefficient,`√${rad}`,`\\sqrt{${rad}}`):null;
  }
  function input(x,source){
    if(source!=null){try{if(Math.abs(window.DongEquationBuilder.scalar(source)-x)<=16*Number.EPSILON*Math.max(1,Math.abs(x)))return String(source);}catch{}}
    return exact(x)?.text??String(x);
  }
  const text=x=>Number.isFinite(x)?exact(x)?.text??`≈${Number(x.toPrecision(8))}`:'—';
  const tex=x=>Number.isFinite(x)?exact(x)?.tex??`\\approx ${Number(x.toPrecision(8))}`:'\\text{未定义}';
  window.DongNumber={rational,exact,input,text,tex};
})();
