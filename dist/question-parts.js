/* Shared bounded question headings. References and arithmetic remain verbatim. */
(function(root,factory){
  'use strict';
  const api=factory();root.DongQuestionParts=api;
  if(root.window&&root.window!==root)root.window.DongQuestionParts=api;
  if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const MAX_TEXT=18000,MAX_PARTS=12;
  const ROMAN={i:1,ii:2,iii:3,iv:4,v:5,vi:6,vii:7,viii:8};
  const TOKEN='(?:\\d{1,2}|viii|vii|vi|iv|v|iii|ii|i)';
  const stripWrap=value=>value.replace(/(?:\$|\\\(|\\\)|\\\[|\\\])+/g,'');
  function fail(code,message){const error=new Error(message);error.code=code;throw error;}
  function checkedText(value){
    if(typeof value!=='string')fail('QUESTION_PARTS_TEXT','题目必须是文字。');
    if(value.length>MAX_TEXT)fail('QUESTION_PARTS_LENGTH',`题目超过 ${MAX_TEXT} 字符，请缩短或分题输入。`);
    return value;
  }
  function isHeading(text,start,end){
    const before=stripWrap(text.slice(Math.max(0,start-160),start)),after=stripWrap(text.slice(end,end+180)),left=before.trimEnd(),right=after.trimStart();
    // Function arguments, radicals, arithmetic coefficients and adjacent citations.
    if(/^[+\-*/^=<>≤≥),%\d]/.test(right))return false;
    const adjacentRight=new RegExp('^[（(]\\s*'+TOKEN+'\\s*[）)]','i');
    const adjacentLeft=new RegExp('[（(]\\s*'+TOKEN+'\\s*[）)]\\s*$','i');
    if(adjacentRight.test(right)||adjacentLeft.test(left))return false;
    // Common references: 在（1）的条件下、由（2）可知、原题第（1）问。
    if(/^(?:的?(?:条件|结论|结果|基础|假设|范围|小问)|问(?:[。；;,，）)]|$)|中(?:的|所得|所求|给出|提到|求)|所得|所求|给出|提到|可知|可得|成立|所示|与|和|、|及|或|至|到)/.test(right))return false;
    const lineLeft=text.slice(Math.max(text.lastIndexOf('\n',start-1),text.lastIndexOf('\r',start-1))+1,start);
    if(/^(?:\s|\$|\\[()\[\]])*$/.test(lineLeft))return true;
    if(/[A-Za-z0-9_√π*/^+=-]\s*$/.test(left))return false;
    if(/(?:在|由|根据|依据|利用|结合|参见|见|第|前述|上述|小问|问题|题|求出|求|证明|式|编号|条件)\s*$/.test(left))return false;
    if(/[。；;:：!?！？]\s*$/.test(left))return true;
    // Inline parts can start with conditions or named mathematical subjects.
    return /^(?:求|证明|求证|若|当|设|已知|写出|确定|计算|讨论|判断|说明|试|找出|给出|建立|作|研究|分析|选择|是否|在|椭圆|双曲线|抛物线|圆|直线|点|函数|数列|矩形|三角形|向量)/.test(right);
  }
  function scan(text,roman=false){
    const pattern=roman?/[（(]\s*(viii|vii|vi|iv|v|iii|ii|i)\s*[）)]/gi:/[（(]\s*(\d{1,2})\s*[）)]/g,result=[];
    for(const match of text.matchAll(pattern)){
      if(!isHeading(text,match.index,match.index+match[0].length))continue;
      const value=roman?match[1].toLowerCase():Number(match[1]);
      if(!roman&&value<1)continue;
      result.push({index:match.index,end:match.index+match[0].length,number:value,raw:match[0]});
    }
    return result;
  }
  function headings(value){return scan(checkedText(value));}
  function splitParts(value){
    const text=checkedText(value),matches=scan(text);
    if(!matches.length){const body=text.trim();return[{index:0,label:'完整题目',question:body,body}];}
    const parents=new Set();
    for(const heading of matches){if(parents.has(heading.number))fail('QUESTION_PARTS_DUPLICATE',`题目包含重复小问编号（${heading.number}），请修正编号后重试。`);parents.add(heading.number);}
    const preamble=text.slice(0,matches[0].index).trim(),parts=[];
    matches.forEach((heading,i)=>{
      const segment=text.slice(heading.end,matches[i+1]?.index??text.length),nested=scan(segment,true),number=heading.number;
      if(!nested.length){const body=segment.trim();parts.push({index:number,label:`第（${number}）问`,question:(preamble+'\n'+body).trim(),body});return;}
      const setup=segment.slice(0,nested[0].index).trim(),seen=new Set();
      nested.forEach((sub,j)=>{
        if(seen.has(sub.number))fail('QUESTION_PARTS_DUPLICATE',`题目包含重复小问编号（${number}）（${sub.number}），请修正编号后重试。`);seen.add(sub.number);
        const subBody=segment.slice(sub.end,nested[j+1]?.index??segment.length).trim(),body=(setup?setup+'\n'+subBody:subBody).trim();
        parts.push({index:number*100+ROMAN[sub.number],label:`第（${number}）（${sub.number}）问`,question:(preamble+'\n'+body).trim(),body,parent_index:number,sub_index:sub.number});
      });
    });
    if(parts.length>MAX_PARTS)fail('QUESTION_PARTS_MAX',`题目共有 ${parts.length} 个小问，超过最多 ${MAX_PARTS} 个的限制，请分题输入。`);
    return parts;
  }
  return {splitParts,headings,MAX_TEXT,MAX_PARTS};
});
