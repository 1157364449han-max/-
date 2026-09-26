'use strict';

/* Structured, browser-only equation templates for the PC construction panel. */
(function () {
  const typeNames = {
    point: '点', line: '直线', circle: '圆', ellipse: '椭圆',
    hyperbola: '双曲线', parabola: '抛物线', function: '函数曲线'
  };

  function tokenize(raw) {
    let source = String(window.DongMathInput?.toPlain(raw) ?? raw ?? '').trim()
      .replace(/[，]/g, '.').replace(/[−–—]/g, '-').replace(/[×·]/g, '*')
      .replace(/[÷]/g, '/').replace(/[（]/g, '(').replace(/[）]/g, ')')
      .replace(/[πΠ]/g, 'pi').replace(/[²]/g, '^2').replace(/[³]/g, '^3')
      .replace(/\s+/g, '').toLowerCase();
    if (!source) throw new Error('请填写所有需要的参数。');
    source = source.replace(/√/g, 'sqrt');
    const rawTokens = source.match(/(?:\d+(?:\.\d+)?|\.\d+)|(?:pi|sqrt|e)|[()+\-*/^]/g) || [];
    if (rawTokens.join('') !== source) throw new Error('参数只支持数字、分数、π、根号和四则运算。');
    const tokens = [];
    const isLeft = token => /^(?:\d|\.)/.test(token) || token === 'pi' || token === 'e' || token === ')';
    const isRight = token => /^(?:\d|\.)/.test(token) || token === 'pi' || token === 'e' || token === 'sqrt' || token === '(';
    rawTokens.forEach(token => {
      if (tokens.length && isLeft(tokens[tokens.length - 1]) && isRight(token)) tokens.push('*');
      tokens.push(token);
    });
    return tokens;
  }

  function scalar(raw) {
    const tokens = tokenize(raw);
    let index = 0;
    const peek = () => tokens[index];
    const take = () => tokens[index++];
    function primary() {
      const token = take();
      if (token === '+') return primary();
      if (token === '-') return -primary();
      if (token === 'pi') return Math.PI;
      if (token === 'e') return Math.E;
      if (token === 'sqrt') {
        const value = primary();
        if (value < 0) throw new Error('根号内不能是负数。');
        return Math.sqrt(value);
      }
      if (token === '(') {
        const value = addSub();
        if (take() !== ')') throw new Error('参数中的括号没有配对。');
        return value;
      }
      const value = Number(token);
      if (!Number.isFinite(value)) throw new Error('参数不是有效数值。');
      return value;
    }
    function power() {
      let value = primary();
      if (peek() === '^') { take(); value = value ** power(); }
      return value;
    }
    function mulDiv() {
      let value = power();
      while (peek() === '*' || peek() === '/') {
        const op = take(), right = power();
        if (op === '/' && Math.abs(right) < 1e-14) throw new Error('参数中不能除以 0。');
        value = op === '*' ? value * right : value / right;
      }
      return value;
    }
    function addSub() {
      let value = mulDiv();
      while (peek() === '+' || peek() === '-') {
        const op = take(), right = mulDiv();
        value = op === '+' ? value + right : value - right;
      }
      return value;
    }
    const value = addSub();
    if (index !== tokens.length || !Number.isFinite(value)) throw new Error('参数表达式无法计算。');
    return value;
  }

  const field = (key, label, value, extra = {}) => ({key, label, value: String(value), ...extra});
  const select = (key, label, value, options) => ({key, label, value, options});
  const n = (values, key) => scalar(values[key]);
  const positive = (values, key, label) => {
    const value = n(values, key);
    if (!(value > 0)) throw new Error(`${label}必须大于 0。`);
    return value;
  };
  const finiteObject = object => {
    const values = JSON.stringify(object);
    if (values.includes('null')) throw new Error('参数计算结果无效。');
    return object;
  };
  let expressionHints=null;
  const fmt = value => {
    if(window.DongNumber){const s=window.DongNumber.exact(value)?.text??expressionHints?.get(value)??String(value);return /[\/+*]|\d[-+]/.test(s)?`(${s})`:s;}
    if (!Number.isFinite(value)) return '—';
    const rounded = Math.abs(value) < 1e-12 ? 0 : Number(value.toFixed(6));
    return String(rounded).replace('-', '−');
  };
  const signed = value => value < 0 ? `−${fmt(Math.abs(value))}` : `+${fmt(value)}`;
  const shifted = (variable, value) => Math.abs(value) < 1e-12 ? variable : `(${variable}${value < 0 ? '+' : '−'}${fmt(Math.abs(value))})`;
  const id = () => `u${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const objectResult = (object, equation) => ({object: finiteObject({id: id(), visible: true, ...object, equation}), equation});

  const templates = {
    point: [
      {id:'coordinates', label:'坐标点 P(x, y)', fields:[field('x','x 坐标',0),field('y','y 坐标',0)], build(v){const x=n(v,'x'),y=n(v,'y');return objectResult({kind:'point',x,y,label:'P'},`P(${fmt(x)}, ${fmt(y)})`);}}
    ],
    line: [
      {id:'slope', label:'斜截式 y = kx + b', fields:[field('k','斜率 k',1),field('b','截距 b',0)], build(v){const k=n(v,'k'),b=n(v,'b');return objectResult({kind:'line',m:k,b},`y=${fmt(k)}x${signed(b)}`);}},
      {id:'vertical', label:'竖直线 x = c', fields:[field('c','横坐标 c',0)], build(v){const x=n(v,'c');return objectResult({kind:'line',x},`x=${fmt(x)}`);}},
      {id:'pointSlope', label:'点斜式 y−y₀ = k(x−x₀)', fields:[field('x0','已知点 x₀',0),field('y0','已知点 y₀',0),field('k','斜率 k',1)], build(v){const x=n(v,'x0'),y=n(v,'y0'),k=n(v,'k');return objectResult({kind:'line',m:k,b:y-k*x},`y−${fmt(y)}=${fmt(k)}(x−${fmt(x)})`);}},
      {id:'general', label:'一般式 Ax + By + C = 0', fields:[field('A','A',1),field('B','B',-1),field('C','C',0)], build(v){const A=n(v,'A'),B=n(v,'B'),C=n(v,'C');if(Math.abs(A)+Math.abs(B)<1e-12)throw new Error('A、B 不能同时为 0。');const object=Math.abs(B)>1e-12?{kind:'line',m:-A/B,b:-C/B}:{kind:'line',x:-C/A};return objectResult(object,`${fmt(A)}x${signed(B)}y${signed(C)}=0`);}},
      {id:'twoPoints', label:'过两点 P₁、P₂', fields:[field('x1','P₁ 的 x',-1),field('y1','P₁ 的 y',0),field('x2','P₂ 的 x',1),field('y2','P₂ 的 y',2)], build(v){const x1=n(v,'x1'),y1=n(v,'y1'),x2=n(v,'x2'),y2=n(v,'y2');if(Math.hypot(x2-x1,y2-y1)<1e-12)throw new Error('两个点不能重合。');const object=Math.abs(x2-x1)<1e-12?{kind:'line',x:x1}:{kind:'line',m:(y2-y1)/(x2-x1),b:y1-(y2-y1)/(x2-x1)*x1};return objectResult(object,`过 (${fmt(x1)},${fmt(y1)})、(${fmt(x2)},${fmt(y2)})`);}}
    ],
    circle: [
      {id:'centerRadius', label:'圆心—半径 (x−h)²+(y−k)²=r²', fields:[field('h','圆心 h',0),field('k','圆心 k',0),field('r','半径 r',3)], build(v){const h=n(v,'h'),k=n(v,'k'),r=positive(v,'r','半径');return objectResult({kind:'circle',h,k,r},`${shifted('x',h)}²+${shifted('y',k)}²=${fmt(r*r)}`);}},
      {id:'centerPoint', label:'圆心 + 圆上一点', fields:[field('h','圆心 h',0),field('k','圆心 k',0),field('x1','圆上一点 x',3),field('y1','圆上一点 y',0)], build(v){const h=n(v,'h'),k=n(v,'k'),x=n(v,'x1'),y=n(v,'y1'),r=Math.hypot(x-h,y-k);if(r<1e-12)throw new Error('圆上一点不能与圆心重合。');return objectResult({kind:'circle',h,k,r},`${shifted('x',h)}²+${shifted('y',k)}²=${fmt(r*r)}`);}},
      {id:'diameter', label:'直径两端点', fields:[field('x1','端点 A 的 x',-3),field('y1','端点 A 的 y',0),field('x2','端点 B 的 x',3),field('y2','端点 B 的 y',0)], build(v){const x1=n(v,'x1'),y1=n(v,'y1'),x2=n(v,'x2'),y2=n(v,'y2'),h=(x1+x2)/2,k=(y1+y2)/2,r=Math.hypot(x2-x1,y2-y1)/2;if(r<1e-12)throw new Error('直径两端点不能重合。');return objectResult({kind:'circle',h,k,r},`${shifted('x',h)}²+${shifted('y',k)}²=${fmt(r*r)}`);}},
      {id:'threePoints', label:'过三个点的圆', fields:[field('x1','Aₓ',-2),field('y1','Aᵧ',0),field('x2','Bₓ',2),field('y2','Bᵧ',0),field('x3','Cₓ',0),field('y3','Cᵧ',3)], build(v){const x1=n(v,'x1'),y1=n(v,'y1'),x2=n(v,'x2'),y2=n(v,'y2'),x3=n(v,'x3'),y3=n(v,'y3'),d=2*(x1*(y2-y3)+x2*(y3-y1)+x3*(y1-y2));if(Math.abs(d)<1e-10)throw new Error('三个点共线，不能唯一确定圆。');const h=((x1*x1+y1*y1)*(y2-y3)+(x2*x2+y2*y2)*(y3-y1)+(x3*x3+y3*y3)*(y1-y2))/d,k=((x1*x1+y1*y1)*(x3-x2)+(x2*x2+y2*y2)*(x1-x3)+(x3*x3+y3*y3)*(x2-x1))/d,r=Math.hypot(x1-h,y1-k);return objectResult({kind:'circle',h,k,r},`${shifted('x',h)}²+${shifted('y',k)}²=${fmt(r*r)}`);}}
    ],
    ellipse: [
      {id:'axes', label:'中心—半轴标准式', fields:[field('h','中心 h',0),field('k','中心 k',0),field('a','长半轴 a',4),field('b','短半轴 b',2),select('orientation','长轴方向','horizontal',[['horizontal','水平'],['vertical','竖直']])], build(v){const h=n(v,'h'),k=n(v,'k'),a=positive(v,'a','长半轴'),b=positive(v,'b','短半轴'),orientation=v.orientation;if(a<b)throw new Error('椭圆需要 a ≥ b；若方向不对，请切换长轴方向。');const xDen=orientation==='horizontal'?a*a:b*b,yDen=orientation==='horizontal'?b*b:a*a;return objectResult({kind:'conic',conicType:'ellipse',h,k,a,b,orientation},`${shifted('x',h)}²/${fmt(xDen)}+${shifted('y',k)}²/${fmt(yDen)}=1`);}},
      {id:'focus', label:'中心—长半轴—焦距', fields:[field('h','中心 h',0),field('k','中心 k',0),field('a','长半轴 a',5),field('c','半焦距 c',3),select('orientation','焦点方向','horizontal',[['horizontal','水平'],['vertical','竖直']])], build(v){const h=n(v,'h'),k=n(v,'k'),a=positive(v,'a','长半轴'),c=positive(v,'c','半焦距');if(c>=a)throw new Error('椭圆需要 0 < c < a。');const b=Math.sqrt(a*a-c*c),orientation=v.orientation;return objectResult({kind:'conic',conicType:'ellipse',h,k,a,b,orientation},`${shifted('x',h)}²/${fmt(orientation==='horizontal'?a*a:b*b)}+${shifted('y',k)}²/${fmt(orientation==='horizontal'?b*b:a*a)}=1`);}},
      {id:'eccentricity', label:'中心—长半轴—离心率', fields:[field('h','中心 h',0),field('k','中心 k',0),field('a','长半轴 a',4),field('e','离心率 e','1/2'),select('orientation','长轴方向','horizontal',[['horizontal','水平'],['vertical','竖直']])], build(v){const h=n(v,'h'),k=n(v,'k'),a=positive(v,'a','长半轴'),e=n(v,'e');if(!(e>=0&&e<1))throw new Error('椭圆离心率需要 0 ≤ e < 1。');const b=a*Math.sqrt(1-e*e),orientation=v.orientation;return objectResult({kind:'conic',conicType:'ellipse',h,k,a,b,orientation},`${shifted('x',h)}²/${fmt(orientation==='horizontal'?a*a:b*b)}+${shifted('y',k)}²/${fmt(orientation==='horizontal'?b*b:a*a)}=1`);}}
    ],
    hyperbola: [
      {id:'axes', label:'中心—实轴—虚轴标准式', fields:[field('h','中心 h',0),field('k','中心 k',0),field('a','实半轴 a',3),field('b','虚半轴 b',2),select('orientation','开口方向','horizontal',[['horizontal','左右'],['vertical','上下']])], build(v){const h=n(v,'h'),k=n(v,'k'),a=positive(v,'a','实半轴'),b=positive(v,'b','虚半轴'),orientation=v.orientation,equation=orientation==='horizontal'?`${shifted('x',h)}²/${fmt(a*a)}−${shifted('y',k)}²/${fmt(b*b)}=1`:`${shifted('y',k)}²/${fmt(a*a)}−${shifted('x',h)}²/${fmt(b*b)}=1`;return objectResult({kind:'conic',conicType:'hyperbola',h,k,a,b,orientation},equation);}},
      {id:'focus', label:'中心—实半轴—焦距', fields:[field('h','中心 h',0),field('k','中心 k',0),field('a','实半轴 a',3),field('c','半焦距 c',5),select('orientation','开口方向','horizontal',[['horizontal','左右'],['vertical','上下']])], build(v){const h=n(v,'h'),k=n(v,'k'),a=positive(v,'a','实半轴'),c=positive(v,'c','半焦距');if(c<=a)throw new Error('双曲线需要 c > a。');const b=Math.sqrt(c*c-a*a),orientation=v.orientation,equation=orientation==='horizontal'?`${shifted('x',h)}²/${fmt(a*a)}−${shifted('y',k)}²/${fmt(b*b)}=1`:`${shifted('y',k)}²/${fmt(a*a)}−${shifted('x',h)}²/${fmt(b*b)}=1`;return objectResult({kind:'conic',conicType:'hyperbola',h,k,a,b,orientation},equation);}},
      {id:'eccentricity', label:'中心—实半轴—离心率', fields:[field('h','中心 h',0),field('k','中心 k',0),field('a','实半轴 a',3),field('e','离心率 e','5/3'),select('orientation','开口方向','horizontal',[['horizontal','左右'],['vertical','上下']])], build(v){const h=n(v,'h'),k=n(v,'k'),a=positive(v,'a','实半轴'),e=n(v,'e');if(!(e>1))throw new Error('双曲线离心率需要 e > 1。');const b=a*Math.sqrt(e*e-1),orientation=v.orientation,equation=orientation==='horizontal'?`${shifted('x',h)}²/${fmt(a*a)}−${shifted('y',k)}²/${fmt(b*b)}=1`:`${shifted('y',k)}²/${fmt(a*a)}−${shifted('x',h)}²/${fmt(b*b)}=1`;return objectResult({kind:'conic',conicType:'hyperbola',h,k,a,b,orientation},equation);}}
    ],
    parabola: [
      {id:'vertexP', label:'顶点—焦参数—开口方向', fields:[field('h','顶点 h',0),field('k','顶点 k',0),field('p','焦参数 p',2),select('direction','开口方向','right',[['right','向右'],['left','向左'],['up','向上'],['down','向下']])], build(v){const h=n(v,'h'),k=n(v,'k'),p=positive(v,'p','焦参数'),vertical=['up','down'].includes(v.direction),direction=['left','down'].includes(v.direction)?-1:1,equation=vertical?`${shifted('x',h)}²=${fmt(4*p*direction)}${shifted('y',k)}`:`${shifted('y',k)}²=${fmt(4*p*direction)}${shifted('x',h)}`;return objectResult({kind:'conic',conicType:'parabola',h,k,p,orientation:vertical?'vertical':'horizontal',direction},equation);}},
      {id:'vertexFocus', label:'顶点 + 焦点', fields:[field('h','顶点 h',0),field('k','顶点 k',0),field('fx','焦点 x',2),field('fy','焦点 y',0)], build(v){const h=n(v,'h'),k=n(v,'k'),fx=n(v,'fx'),fy=n(v,'fy'),dx=fx-h,dy=fy-k;if(Math.hypot(dx,dy)<1e-12)throw new Error('焦点不能与顶点重合。');if(Math.abs(dx)>1e-10&&Math.abs(dy)>1e-10)throw new Error('当前模板支持轴与坐标轴平行的抛物线；焦点需与顶点同横坐标或同纵坐标。');const vertical=Math.abs(dy)>Math.abs(dx),direction=(vertical?dy:dx)<0?-1:1,p=Math.abs(vertical?dy:dx),equation=vertical?`${shifted('x',h)}²=${fmt(4*p*direction)}${shifted('y',k)}`:`${shifted('y',k)}²=${fmt(4*p*direction)}${shifted('x',h)}`;return objectResult({kind:'conic',conicType:'parabola',h,k,p,orientation:vertical?'vertical':'horizontal',direction},equation);}}
    ],
    function: [
      {id:'quadratic', label:'二次函数 y = ax² + bx + c', fields:[field('a','a',1),field('b','b',0),field('c','c',0)], build(v){const params={a:n(v,'a'),b:n(v,'b'),c:n(v,'c')};if(Math.abs(params.a)<1e-12)throw new Error('二次函数的 a 不能为 0。');return objectResult({kind:'function',family:'quadratic',params},`y=${fmt(params.a)}x²${signed(params.b)}x${signed(params.c)}`);}},
      {id:'cubic', label:'三次函数 y = ax³ + bx² + cx + d', fields:[field('a','a',1),field('b','b',0),field('c','c',0),field('d','d',0)], build(v){const params={a:n(v,'a'),b:n(v,'b'),c:n(v,'c'),d:n(v,'d')};if(Math.abs(params.a)<1e-12)throw new Error('三次函数的 a 不能为 0。');return objectResult({kind:'function',family:'cubic',params},`y=${fmt(params.a)}x³${signed(params.b)}x²${signed(params.c)}x${signed(params.d)}`);}},
      {id:'absolute', label:'绝对值 y = a|x−h| + k', fields:[field('a','伸缩 a',1),field('h','平移 h',0),field('k','平移 k',0)], build(v){const params={a:n(v,'a'),h:n(v,'h'),k:n(v,'k')};return objectResult({kind:'function',family:'absolute',params},`y=${fmt(params.a)}|${shifted('x',params.h)}|${signed(params.k)}`);}},
      {id:'reciprocal', label:'反比例 y = a/(x−h) + k', fields:[field('a','系数 a',1),field('h','平移 h',0),field('k','平移 k',0)], build(v){const params={a:n(v,'a'),h:n(v,'h'),k:n(v,'k')};if(Math.abs(params.a)<1e-12)throw new Error('反比例函数的 a 不能为 0。');return objectResult({kind:'function',family:'reciprocal',params},`y=${fmt(params.a)}/${shifted('x',params.h)}${signed(params.k)}`);}},
      {id:'exponential', label:'指数 y = a·b^(x−h) + k', fields:[field('a','伸缩 a',1),field('b','底数 b',2),field('h','平移 h',0),field('k','平移 k',0)], build(v){const params={a:n(v,'a'),b:n(v,'b'),h:n(v,'h'),k:n(v,'k')};if(!(params.b>0)||Math.abs(params.b-1)<1e-12)throw new Error('指数函数底数 b 需要大于 0 且不等于 1。');return objectResult({kind:'function',family:'exponential',params},`y=${fmt(params.a)}·${fmt(params.b)}^${shifted('x',params.h)}${signed(params.k)}`);}},
      {id:'logarithm', label:'对数 y = a·log_b(x−h) + k', fields:[field('a','伸缩 a',1),field('b','底数 b',2),field('h','平移 h',0),field('k','平移 k',0)], build(v){const params={a:n(v,'a'),b:n(v,'b'),h:n(v,'h'),k:n(v,'k')};if(!(params.b>0)||Math.abs(params.b-1)<1e-12)throw new Error('对数函数底数 b 需要大于 0 且不等于 1。');return objectResult({kind:'function',family:'logarithm',params},`y=${fmt(params.a)}log_${fmt(params.b)}${shifted('x',params.h)}${signed(params.k)}`);}},
      {id:'sine', label:'正弦 y = A·sin(ωx+φ) + d', fields:[field('A','振幅 A',1),field('w','角频率 ω',1),field('phi','相位 φ',0),field('d','上下平移 d',0)], build(v){const params={A:n(v,'A'),w:n(v,'w'),phi:n(v,'phi'),d:n(v,'d')};return objectResult({kind:'function',family:'sine',params},`y=${fmt(params.A)}sin(${fmt(params.w)}x${signed(params.phi)})${signed(params.d)}`);}},
      {id:'cosine', label:'余弦 y = A·cos(ωx+φ) + d', fields:[field('A','振幅 A',1),field('w','角频率 ω',1),field('phi','相位 φ',0),field('d','上下平移 d',0)], build(v){const params={A:n(v,'A'),w:n(v,'w'),phi:n(v,'phi'),d:n(v,'d')};return objectResult({kind:'function',family:'cosine',params},`y=${fmt(params.A)}cos(${fmt(params.w)}x${signed(params.phi)})${signed(params.d)}`);}},
      {id:'tangent', label:'正切 y = A·tan(ωx+φ) + d', fields:[field('A','伸缩 A',1),field('w','角频率 ω',1),field('phi','相位 φ',0),field('d','上下平移 d',0)], build(v){const params={A:n(v,'A'),w:n(v,'w'),phi:n(v,'phi'),d:n(v,'d')};return objectResult({kind:'function',family:'tangent',params},`y=${fmt(params.A)}tan(${fmt(params.w)}x${signed(params.phi)})${signed(params.d)}`);}},
      {id:'squareRoot', label:'根式 y = a√(x−h) + k', fields:[field('a','伸缩 a',1),field('h','起点 h',0),field('k','平移 k',0)], build(v){const params={a:n(v,'a'),h:n(v,'h'),k:n(v,'k')};return objectResult({kind:'function',family:'squareRoot',params},`y=${fmt(params.a)}√${shifted('x',params.h)}${signed(params.k)}`);}}
    ]
  };

  // Read from the live numerical model, never the possibly stale imported equation.
  function curveSpec(object) {
    const type=object?.kind==='circle'?'circle':object?.kind==='conic'?object.conicType:null;
    if(!['circle','ellipse','hyperbola','parabola'].includes(type))return null;
    const values={h:String(object.h??0),k:String(object.k??0)};
    if(type==='circle')values.r=String(object.r);
    else if(type==='parabola')Object.assign(values,{p:String(object.p),direction:object.orientation==='vertical'?(object.direction===-1?'down':'up'):(object.direction===-1?'left':'right')});
    else Object.assign(values,{a:String(object.a),b:String(object.b),orientation:object.orientation==='vertical'?'vertical':'horizontal'});
    return {type,values};
  }
  function curveEquation(object) {
    const spec=curveSpec(object);if(!spec)return null;
    for(const key of Object.keys(spec.values))if(Number.isFinite(Number(spec.values[key])))spec.values[key]=window.DongNumber?.input(Number(spec.values[key]),object.inputExpressions?.[key])??spec.values[key];
    try{return buildTemplate(templates[spec.type][0],spec.values).equation;}catch{return null;}
  }
  function buildTemplate(template,values){
    const previous=expressionHints;expressionHints=new Map();
    for(const raw of Object.values(values)){try{const value=scalar(raw),expression=String(raw).replace(/sqrt/g,'√');expressionHints.set(value,expression);expressionHints.set(value*value,`(${expression})²`);}catch{}}
    try{const result=template.build(values);result.object.inputExpressions={...values};return result;}finally{expressionHints=previous;}
  }
  function editSpec(object){
    if(object?.refs?.length||object?.construction)return null;
    let spec=curveSpec(object);
    if(spec)spec.template=templates[spec.type][0];
    else if(object?.kind==='function')spec={type:'function',values:{...object.params},template:templates.function.find(t=>t.id===object.family)};
    else if(['line','slope'].includes(object?.kind)&&object.m!=null)spec={type:'line',values:{k:object.m,b:object.b||0},template:templates.line.find(t=>t.id==='slope')};
    else if(['line','vertical'].includes(object?.kind)&&object.x!=null)spec={type:'line',values:{c:object.x},template:templates.line.find(t=>t.id==='vertical')};
    else if(object?.kind==='point')spec={type:'point',values:{x:object.x,y:object.y},template:templates.point[0]};
    if(!spec?.template)return null;
    for(const field of spec.template.fields){const value=spec.values[field.key];if(!field.options)spec.values[field.key]=window.DongNumber?.input(Number(value),object.inputExpressions?.[field.key])??String(value);}
    return spec;
  }

  function functionValue(object, x) {
    const p = object.params || {};
    switch (object.family) {
      case 'quadratic': return p.a*x*x+p.b*x+p.c;
      case 'cubic': return p.a*x*x*x+p.b*x*x+p.c*x+p.d;
      case 'absolute': return p.a*Math.abs(x-p.h)+p.k;
      case 'reciprocal': return p.a/(x-p.h)+p.k;
      case 'exponential': return p.a*(p.b**(x-p.h))+p.k;
      case 'logarithm': return x>p.h ? p.a*Math.log(x-p.h)/Math.log(p.b)+p.k : NaN;
      case 'sine': return p.A*Math.sin(p.w*x+p.phi)+p.d;
      case 'cosine': return p.A*Math.cos(p.w*x+p.phi)+p.d;
      case 'tangent': return p.A*Math.tan(p.w*x+p.phi)+p.d;
      case 'squareRoot': return x>=p.h ? p.a*Math.sqrt(x-p.h)+p.k : NaN;
      default: return NaN;
    }
  }

  function attach(options) {
    const {typeSelect, templateSelect, fields, preview, error} = options;
    let active = null;
    const values = () => Object.fromEntries([...fields.querySelectorAll('[data-equation-param]')].map(input => [input.dataset.equationParam,input.value]));
    function read() {
      if (!active) throw new Error('请先选择方程模板。');
      return buildTemplate(active,values());
    }
    function updatePreview() {
      try {
        const result = read();
        preview.textContent = result.equation;
        preview.classList.remove('invalid');
        error.textContent = '';
      } catch (problem) {
        preview.textContent = '填写参数后自动生成方程';
        preview.classList.add('invalid');
        error.textContent = problem.message;
      }
    }
    function renderFields() {
      const list = templates[typeSelect.value] || [];
      active = list.find(item => item.id === templateSelect.value) || list[0] || null;
      fields.replaceChildren();
      if (!active) return updatePreview();
      for (const spec of active.fields) {
        const label = document.createElement('label');
        const caption = document.createElement('span'); caption.textContent = spec.label;
        let control;
        if (spec.options) {
          control = document.createElement('select');
          for (const [value,text] of spec.options) { const option=document.createElement('option');option.value=value;option.textContent=text;control.append(option); }
        } else {
          control = document.createElement('input');control.type='text';control.inputMode='decimal';control.autocomplete='off';control.spellcheck=false;
        }
        control.dataset.equationParam = spec.key;
        control.id = `${fields.id==='equationFields'?'objectParam':fields.id+'Param'}-${spec.key}`;
        control.value = spec.value;
        control.setAttribute('aria-label', spec.label);
        label.append(caption,control);fields.append(label);
      }
      updatePreview();
    }
    function setType(type = typeSelect.value) {
      if (typeSelect.value !== type) typeSelect.value = type;
      const list = templates[type] || [];
      templateSelect.replaceChildren(...list.map(item => {const option=document.createElement('option');option.value=item.id;option.textContent=item.label;return option;}));
      renderFields();
    }
    function loadObject(object){
      const spec=curveSpec(object);if(!spec)throw new Error('暂不支持用曲线模板编辑此对象。');
      setType(spec.type);
      for(const control of fields.querySelectorAll('[data-equation-param]')){const key=control.dataset.equationParam;if(spec.values[key]!=null)control.value=control.tagName==='SELECT'?spec.values[key]:window.DongNumber?.input(Number(spec.values[key]),object.inputExpressions?.[key])??spec.values[key];}
      updatePreview();
    }
    typeSelect.addEventListener('change', () => setType());
    templateSelect.addEventListener('change', renderFields);
    fields.addEventListener('input', updatePreview);
    fields.addEventListener('change', updatePreview);
    setType();
    return {read,setType,loadObject,updatePreview,typeNames};
  }

  window.DongEquationBuilder = {attach, scalar, functionValue, curveSpec, curveEquation, editSpec, buildTemplate, typeNames, templates};
})();
