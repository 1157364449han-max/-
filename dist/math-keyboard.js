'use strict';

/* Offline math-symbol keyboard for mixed Chinese question/equation input. */
(function () {
  const groups = [
    {id:'common', name:'常用', keys:[
      ...'1234567890'.split('').map(value=>({label:value,insert:value})),
      ...['x','y','a','b','h','k','p','t'].map(value=>({label:value,insert:value})),
      {label:'+ ',insert:'+'},{label:'−',insert:'−'},{label:'×',insert:'×'},{label:'÷',insert:'÷'},
      {label:'=',insert:'='},{label:'≠',insert:'≠'},{label:'≈',insert:'≈'},{label:'<',insert:'<'},{label:'>',insert:'>'},
      {label:'≤',insert:'≤'},{label:'≥',insert:'≥'},{label:'(',insert:'('},{label:')',insert:')'},
      {label:'[ ]',insert:'[]',caret:-1},{label:'{ }',insert:'{}',caret:-1},{label:'| |',insert:'||',caret:-1},
      {label:',',insert:','},{label:';',insert:';'},{label:':',insert:':'},{label:'∞',insert:'∞'}
    ]},
    {id:'algebra', name:'代数与函数', keys:[
      {label:'x²',insert:'x²'},{label:'x³',insert:'x³'},{label:'上标 ^',insert:'^'},
      {label:'√',insert:'√()',caret:-1},{label:'∛',insert:'∛()',caret:-1},{label:'分数',insert:'()/()',caret:-4},
      {label:'π',insert:'π'},{label:'e',insert:'e'},{label:'sin',insert:'sin()',caret:-1},{label:'cos',insert:'cos()',caret:-1},
      {label:'tan',insert:'tan()',caret:-1},{label:'log',insert:'log()',caret:-1},{label:'ln',insert:'ln()',caret:-1},
      {label:'|x|',insert:'|x|',caret:-1},{label:'Σ',insert:'Σ'},{label:'∑',insert:'∑'},{label:'∏',insert:'∏'},
      {label:'lim',insert:'lim'},{label:'max',insert:'max'},{label:'min',insert:'min'},
      {label:'f(x)',insert:'f(x)'},{label:'g(x)',insert:'g(x)'},{label:'→',insert:'→'}
    ]},
    {id:'geometry', name:'几何与圆锥', keys:[
      {label:'点坐标',insert:'P(,)',caret:-2},{label:'直线',insert:'y=kx+b'},
      {label:'圆',insert:'(x−h)²+(y−k)²=r²'},
      {label:'椭圆',insert:'(x−h)²/a²+(y−k)²/b²=1'},
      {label:'双曲线',insert:'(x−h)²/a²−(y−k)²/b²=1'},
      {label:'抛物线→',insert:'(y−k)²=4p(x−h)'},{label:'抛物线↑',insert:'(x−h)²=4p(y−k)'},
      {label:'∠',insert:'∠'},{label:'△',insert:'△'},{label:'⊥',insert:'⊥'},{label:'∥',insert:'∥'},
      {label:'≌',insert:'≌'},{label:'∽',insert:'∽'},{label:'°',insert:'°'},{label:'弧',insert:'⌒'},
      {label:'向量',insert:'→'},{label:'单位向量',insert:'⃗'},{label:'·',insert:'·'},
      {label:'斜率',insert:'k='},{label:'距离',insert:'d='},{label:'离心率',insert:'e='},{label:'Δ',insert:'Δ'}
    ]},
    {id:'greek', name:'希腊与集合', keys:[
      ...['α','β','γ','δ','ε','ζ','η','θ','λ','μ','ν','ξ','π','ρ','σ','τ','φ','χ','ψ','ω'].map(value=>({label:value,insert:value})),
      {label:'∈',insert:'∈'},{label:'∉',insert:'∉'},{label:'⊂',insert:'⊂'},{label:'⊆',insert:'⊆'},
      {label:'∪',insert:'∪'},{label:'∩',insert:'∩'},{label:'∅',insert:'∅'},{label:'ℝ',insert:'ℝ'},
      {label:'ℤ',insert:'ℤ'},{label:'ℕ',insert:'ℕ'},{label:'⇒',insert:'⇒'},{label:'⇔',insert:'⇔'},
      {label:'∀',insert:'∀'},{label:'∃',insert:'∃'},{label:'∵',insert:'∵'},{label:'∴',insert:'∴'}
    ]}
  ];

  function attach({defaultTarget} = {}) {
    const panel = document.createElement('section');
    panel.id = 'mathKeyboard';panel.className = 'math-keyboard';panel.hidden = true;
    panel.setAttribute('role','dialog');panel.setAttribute('aria-labelledby','mathKeyboardTitle');panel.setAttribute('aria-describedby','mathKeyboardHelp');
    panel.innerHTML = '<header><div><strong id="mathKeyboardTitle">数学键盘</strong><span id="mathKeyboardHelp">点按符号会插入到当前参数或文字输入框</span><span id="mathKeyboardTarget" aria-live="polite"></span></div><div class="math-keyboard-edit"><button type="button" data-key-command="left" aria-label="光标左移">←</button><button type="button" data-key-command="right" aria-label="光标右移">→</button><button type="button" data-key-command="backspace" aria-label="退格">⌫</button><button type="button" data-key-command="close">关闭</button></div></header><div class="math-keyboard-tabs" role="tablist"></div><div class="math-keyboard-keys"></div>';
    document.body.append(panel);
    const tabBox=panel.querySelector('.math-keyboard-tabs'),keyBox=panel.querySelector('.math-keyboard-keys');
    let activeGroup=groups[0].id,lastTarget=defaultTarget || null;

    const usable = element => element && element.matches('textarea,input[type="text"],input[type="search"],input:not([type])') && !element.disabled && !element.readOnly && !element.closest('#mathKeyboard');
    const targetName = target => target?.getAttribute('aria-label') || target?.closest('label')?.firstChild?.textContent?.trim() || target?.placeholder || '输入框';
    const announceTarget = () => {const output=panel.querySelector('#mathKeyboardTarget');if(output)output.textContent=`当前输入：${targetName(lastTarget)}`;};
    document.addEventListener('focusin', event => {if(usable(event.target)){lastTarget=event.target;if(!panel.hidden)announceTarget();}});

    function insert(text, caret = 0) {
      const target=usable(lastTarget)?lastTarget:defaultTarget;
      if(!usable(target))return;
      const start=Number.isInteger(target.selectionStart)?target.selectionStart:target.value.length;
      const end=Number.isInteger(target.selectionEnd)?target.selectionEnd:start;
      target.setRangeText(text,start,end,'end');
      const position=Math.max(0,target.selectionStart+caret);
      target.setSelectionRange(position,position);target.focus();
      target.dispatchEvent(new Event('input',{bubbles:true}));
    }
    function command(value){
      const target=usable(lastTarget)?lastTarget:defaultTarget;if(!usable(target))return;
      let start=target.selectionStart??target.value.length,end=target.selectionEnd??start;
      if(value==='backspace'){
        if(start===end&&start>0)start--;
        target.setRangeText('',start,end,'end');target.dispatchEvent(new Event('input',{bubbles:true}));
      }else{
        const position=Math.max(0,Math.min(target.value.length,start+(value==='left'?-1:1)));
        target.setSelectionRange(position,position);
      }
      target.focus();
    }
    function renderGroup() {
      const group=groups.find(item=>item.id===activeGroup) || groups[0];
      [...tabBox.children].forEach(button=>{const selected=button.dataset.group===group.id;button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;});
      keyBox.replaceChildren(...group.keys.map(key=>{const button=document.createElement('button');button.type='button';button.className=key.insert.length>10?'wide':'';button.textContent=key.label;button.title=`插入 ${key.insert}`;button.addEventListener('click',()=>insert(key.insert,key.caret||0));return button;}));
    }
    for(const group of groups){const button=document.createElement('button');button.type='button';button.role='tab';button.dataset.group=group.id;button.textContent=group.name;button.addEventListener('click',()=>{activeGroup=group.id;renderGroup();});tabBox.append(button);}
    renderGroup();

    function open(target){
      if(usable(target))lastTarget=target;
      // A native <dialog> lives in the browser top layer.  A fixed keyboard
      // left under <body> cannot receive pointer events above that dialog, so
      // temporarily mount it inside the active dialog for preview/OCR fields.
      const modal=usable(lastTarget)?lastTarget.closest('dialog[open]'):null;
      if(modal&&panel.parentNode!==modal)modal.append(panel);
      else if(!modal&&panel.parentNode!==document.body)document.body.append(panel);
      panel.hidden=false;document.body.classList.add('math-keyboard-open');renderGroup();announceTarget();if(usable(lastTarget))lastTarget.focus();
    }
    function close(){panel.hidden=true;document.body.classList.remove('math-keyboard-open');if(panel.parentNode!==document.body)document.body.append(panel);if(usable(lastTarget))lastTarget.focus();}
    function toggle(target){panel.hidden?open(target):close();}
    document.addEventListener('click',event=>{const trigger=event.target.closest('[data-open-math-keyboard]');if(!trigger)return;event.preventDefault();const scope=trigger.dataset.mathScope?document.querySelector(trigger.dataset.mathScope):null;let target=usable(lastTarget)&&(!scope||scope.contains(lastTarget))?lastTarget:null;if(!target&&trigger.dataset.mathTarget)target=document.querySelector(trigger.dataset.mathTarget);if(!panel.hidden&&target&&target!==lastTarget)open(target);else toggle(target||lastTarget);});
    panel.addEventListener('click',event=>{const button=event.target.closest('[data-key-command]');if(!button)return;const value=button.dataset.keyCommand;if(value==='close')close();else command(value);});
    document.addEventListener('keydown',event=>{if(event.ctrlKey&&event.shiftKey&&event.key.toLowerCase()==='k'){event.preventDefault();toggle(document.activeElement);}else if(event.key==='Escape'&&!panel.hidden)close();});
    return {open,close,insert,get target(){return lastTarget;}};
  }

  window.DongMathKeyboard={attach,groups};
})();
