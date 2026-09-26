/* LaTeX input adapter and safe display preparation; no code evaluation. */
(() => {
  'use strict';
  function toPlain(value){
    let s=String(value??'').replace(/[＋－＝＊／＾０-９Ａ-Ｚａ-ｚ]/g,c=>String.fromCharCode(c.charCodeAt(0)-0xfee0));
    if(s.length>18000)return s;
    s=s.replace(/```(?:latex|math|tex)?\s*\n?([\s\S]*?)```/gi,'$1')
      .replace(/\\(?:left|right|displaystyle|textstyle)\b/g,'')
      .replace(/\\(?:begin|end)\{(?:aligned|align\*?|equation\*?|gathered)\}/g,'')
      .replace(/\\(?:\[|\]|\(|\))/g,'').replace(/\$/g,'')
      .replace(/\\(?:,|;|!|quad\b|qquad\b)/g,' ')
      .replace(/\\(?:cdot|times)\b/g,'*').replace(/\\(?:leq?|geq?)\b/g,m=>m.startsWith('\\l')?'≤':'≥')
      .replace(/\\pi\b/g,'π').replace(/\\div\b/g,'/')
      .replace(/\\pm\b/g,'±').replace(/\\perp\b/g,'垂直').replace(/\\triangle\b/gi,'△');
    const group=(text,start)=>{if(text[start]!=='{')return null;let depth=0;for(let i=start;i<text.length;i++){if(text[i]==='{')depth++;if(text[i]==='}'&&!--depth)return{body:text.slice(start+1,i),end:i+1};}return null;};
    for(let pass=0;pass<200;pass++){
      let changed=false;
      const command=/\\(dfrac|tfrac|frac|sqrt|text|mathrm|operatorname)\s*/g;let match;
      while((match=command.exec(s))){
        const a=group(s,match.index+match[0].length);if(!a)continue;
        let end=a.end,replacement;
        if(/frac/.test(match[1])){let j=a.end;while(/\s/.test(s[j]||'')&&j<s.length)j++;const b=group(s,j);if(!b)continue;end=b.end;const simple=t=>/^[+-]?\d+(?:\.\d+)?$/.test(t)||/^[a-z](?:\^\{?\d+\}?)?$/i.test(t);replacement=`${simple(a.body)?a.body:'('+a.body+')'}/${simple(b.body)?b.body:'('+b.body+')'}`;}
        else if(match[1]==='sqrt')replacement=/^\d+(?:\.\d+)?$/.test(a.body)?String(Math.sqrt(Number(a.body))):`sqrt(${a.body})`;
        else replacement=a.body;
        s=s.slice(0,match.index)+replacement+s.slice(end);changed=true;break;
      }
      if(!changed)break;
    }
    return s.replace(/\^\{([^{}]+)\}/g,'^$1').replace(/_\{([^{}]+)\}/g,'$1').replace(/_([12])/g,'$1')
      .replace(/\(([xy])\^([23])\)/gi,'$1^$2').replace(/\(\(([xy][+-][\d.]+)\)\^2\)/gi,'($1)^2')
      .replace(/\\\\/g,'\n').replace(/&/g,'');
  }
  function prepare(value){
    const source=String(value??'').replace(/```(?:latex|math|tex)\s*\n?([\s\S]*?)```/gi,(_,body)=>'$$'+body.trim()+'$$');
    // Protect complete display blocks before processing lines; never nest $ inside $$.
    return source.split(/(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|(?<!\\)\$(?:\\[\s\S]|[^$])*?(?<!\\)\$)/g).map((part,index)=>{
      if(index%2)return part;
      return part.replace(/[^\u3400-\u9fff。；：\n]+/g,chunk=>/\\(?:[dt]?frac|sqrt|begin|sum|int|vec|overline|alpha|beta|theta|left)\b/.test(chunk)?'$'+chunk.trim()+'$':chunk);
    }).join('');
  }
  function preview(input,target){
    target.textContent=prepare(input.value);
    window.renderMathInElement?.(target,{delimiters:[{left:'$$',right:'$$',display:true},{left:'\\[',right:'\\]',display:true},{left:'\\(',right:'\\)',display:false},{left:'$',right:'$',display:false}],throwOnError:false,trust:false,strict:'ignore',maxExpand:300,maxSize:20});
  }
  function toTex(value){
    let s=String(value??'').replace(/²/g,'^{2}').replace(/³/g,'^{3}').replace(/₁/g,'_{1}').replace(/₂/g,'_{2}').replace(/₃/g,'_{3}').replace(/[−–]/g,'-').replace(/π/g,'\\pi ').replace(/θ/g,'\\theta ').replace(/∞/g,'\\infty ').replace(/≤/g,'\\le ').replace(/≥/g,'\\ge ').replace(/≠/g,'\\ne ').replace(/·/g,'\\cdot ');
    s=s.replace(/√\(([^()]*)\)/g,'\\sqrt{$1}').replace(/√([\d.]+)/g,'\\sqrt{$1}');
    return s.replace(/(\([^()]+\)(?:\^\{[23]\})?|[a-zA-Z](?:\^\{[23]\})?|\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?|[a-zA-Z](?:\^\{[23]\})?)/g,'\\frac{$1}{$2}').replace(/[\u3400-\u9fff]+/g,'\\text{$&}');
  }
  const options={throwOnError:false,trust:false,strict:'ignore',maxExpand:300,maxSize:20};
  function formula(target,value){
    if(!target||!window.katex)return;
    const source=String(value??'');target.dataset.mathSource=source;target.setAttribute('aria-label',source);
    window.katex.render(toTex(source),target,{...options,output:'htmlAndMathml'});
  }
  function installGlobal(){
    const skip='script,style,textarea,input,select,option,pre,code,svg,canvas,.katex,.katex-error,.global-math,[contenteditable="true"],[data-no-math]';
    const formulaSelector='#equation,.equation-preview,[data-live-equation]';
    const render=root=>{
      if(!root?.querySelectorAll||root.closest?.(skip))return;
      for(const element of [...(root.matches?.(formulaSelector)?[root]:[]),...root.querySelectorAll(formulaSelector)]){
        if(element.querySelector('.katex'))continue;
        const source=element.textContent;
        if(source&&/[=^²³/]/.test(source))formula(element,source);
      }
      const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),nodes=[];
      while(walker.nextNode()){const node=walker.currentNode;if(!node.parentElement?.closest(skip)&&/\$|\\(?:[()[\]]|frac\b|dfrac\b|sqrt\b|begin\b)/.test(node.nodeValue))nodes.push(node);}
      for(const node of nodes){const span=document.createElement('span');span.className='global-math';span.textContent=prepare(node.nodeValue);node.replaceWith(span);window.renderMathInElement?.(span,{...options,delimiters:[{left:'$$',right:'$$',display:true},{left:'\\[',right:'\\]',display:true},{left:'\\(',right:'\\)',display:false},{left:'$',right:'$',display:false}]});}
    };
    let pending=false;const roots=new Set();
    const observer=new MutationObserver(records=>{
      for(const record of records){const element=record.target.nodeType===1?record.target:record.target.parentElement;if(element&&!element.closest(skip))roots.add(element);}
      if(pending||!roots.size)return;pending=true;
      requestAnimationFrame(()=>{pending=false;observer.disconnect();try{for(const root of roots)if(root.isConnected)render(root);}finally{roots.clear();observer.observe(document.body,{childList:true,subtree:true,characterData:true});}});
    });
    render(document.body);observer.observe(document.body,{childList:true,subtree:true,characterData:true});
    // Text inputs remain editable source. A neighbouring preview shows the formula without changing values or caret positions.
    document.addEventListener('input',event=>{
      const input=event.target;if(!input.matches('input[type="text"],input:not([type])')||!input.closest('.equation-fields,.condition-grid,.param-stack,#advancedEquation'))return;
      let output=input.nextElementSibling;if(!output?.matches('.parameter-math-preview')){output=document.createElement('span');output.className='parameter-math-preview';input.after(output);}
      if(!input.value.trim()){output.textContent='';return;}formula(output,input.value);
    });
    return {render};
  }
  window.DongMathInput={toPlain,prepare,preview,toTex,formula,installGlobal};
  if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',installGlobal,{once:true});
})();
