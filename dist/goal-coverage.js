(function(){
  'use strict';
  const common=['求','写出','确定','计算','给出','的','和','与','以及','并','及','分别','两个','两','所有','各','该','此','点','处','在','到','曲线','椭圆','双曲线','抛物线','圆'];
  const vocabularies={feature:['焦点','顶点','准线','渐近线','离心率','圆心','半径','轴长','长轴长','短轴长','实轴长','虚轴长','长轴','短轴','实轴','虚轴','坐标','方程'],metric:['交点','弦长','弦','长度','距离','中点','坐标','直线'],normal:['法线','标准','方程','直线'],tangent:['切线','标准','方程','直线','证明','证实','验证','互相','相互','垂直'],foot:['垂足','坐标','直线'],equation:['标准','方程'],eccentricity:['离心率']};
  function covered(body,kind,labels=[],conicType){
    const source=String(body||'').replace(/[（(]选取原题[^。；;\n]*问。?[）)]。?/g,'');
    const marker=source.search(/求|写出|确定|计算|给出|证明|证实|验证/);
    if(marker<0||!vocabularies[kind])return false;
    let goal=(window.DongMathInput?.toPlain(source.slice(marker))??source.slice(marker)).replace(/\\(?:left|right)|\\[()[\]]|[\s`$]/g,'').toLowerCase();
    if(kind==='feature'){
      const unsupported=conicType==='circle'?['焦点','顶点','准线','渐近线','离心率','轴长','长轴','短轴','实轴','虚轴']:['圆心','半径'];
      if(conicType==='parabola')unsupported.push('渐近线','轴长','长轴','短轴','实轴','虚轴');
      if(conicType==='ellipse')unsupported.push('渐近线','实轴','虚轴');
      if(conicType==='hyperbola')unsupported.push('长轴','短轴');
      if(unsupported.some(word=>goal.includes(word)))return false;
    }
    for(const word of [...new Set([...common,...vocabularies[kind]])].sort((a,b)=>b.length-a.length))goal=goal.split(word).join('');
    for(const label of [...new Set(labels.filter(Boolean).map(value=>String(value).toLowerCase()))].sort((a,b)=>b.length-a.length))goal=goal.split(label).join('');
    return !goal.replace(/[,、。；;:：!?！？()（）\[\]{}]/g,'');
  }
  window.DongGoalCoverage=Object.freeze({covered});
})();
