import {MathfieldElement} from './vendor/mathlive/mathlive.min.mjs';

MathfieldElement.fontsDirectory = './vendor/mathlive/fonts';
MathfieldElement.soundsDirectory = null;

let activeTarget = null;
let activeField = null;
let syncing = false;
let fieldEditing = false;

document.addEventListener('input', event => {
  if (syncing || event.target !== activeTarget || !activeField) return;
  syncing = true;
  activeField.value = window.DongMathInput?.toTex(activeTarget.value) || activeTarget.value || '';
  requestAnimationFrame(() => { syncing = false; });
});

function targetSupportsFormulaEditor(target) {
  return target?.matches?.('input[type="text"],input:not([type])') && !target.disabled && !target.readOnly;
}

function targetName(target) {
  return target?.getAttribute('aria-label') || target?.closest('label')?.firstChild?.textContent?.trim() || '公式参数';
}

function connect(panel, target) {
  const host = panel?.querySelector('[data-mathlive-host]');
  if (!host) return;
  if (!targetSupportsFormulaEditor(target)) {
    activeTarget = null;
    host.innerHTML = '<p class="mathlive-note">题干可继续使用下方中文兼容键盘；选中方程或参数输入格，可启用完整 LaTeX 公式编辑器。</p>';
    return;
  }
  activeTarget = target;
  let configureField = false;
  if (!activeField) {
    activeField = new MathfieldElement();
    activeField.id = 'mathLiveField';
    activeField.setAttribute('aria-label', '完整 LaTeX 公式编辑器');
    configureField = true;
    activeField.addEventListener('beforeinput', () => { if (!syncing) fieldEditing = true; });
    activeField.addEventListener('input', () => {
      if (syncing || !fieldEditing || !activeTarget) return;
      fieldEditing = false;
      syncing = true;
      activeTarget.value = activeField.value;
      activeTarget.dispatchEvent(new Event('input', {bubbles: true}));
      syncing = false;
    });
  }
  host.replaceChildren();
  const label = document.createElement('label');
  label.className = 'mathlive-label';
  label.textContent = `完整公式编辑器 · ${targetName(target)}`;
  const help = document.createElement('span');
  help.className = 'mathlive-note';
  help.textContent = '支持分式、根式、上下标、函数、集合、希腊字母与矩阵；内容实时写回原输入格。';
  const openKeyboard = document.createElement('button');
  openKeyboard.type = 'button';
  openKeyboard.className = 'mathlive-open-keyboard';
  openKeyboard.textContent = '展开完整符号键盘';
  openKeyboard.addEventListener('click', () => {
    const keyboard = window.mathVirtualKeyboard;
    if (!keyboard) return;
    keyboard.layouts = ['numeric', 'symbols', 'functions', 'greek', 'alphabetic'];
    activeField.focus();
    keyboard.show();
  });
  host.append(label, activeField, help, openKeyboard);
  if (configureField) {
    activeField.mathVirtualKeyboardPolicy = 'manual';
    activeField.smartFence = true;
    activeField.smartSuperscript = true;
    activeField.inlineShortcuts = {sqrt: '\\sqrt{#0}', frac: '\\frac{#0}{#?}'};
  }
  syncing = true;
  fieldEditing = false;
  activeField.value = window.DongMathInput?.toTex(target.value) || target.value || '';
  requestAnimationFrame(() => { syncing = false; });
  requestAnimationFrame(() => activeField.focus());
}

function close() {
  activeTarget = null;
  window.mathVirtualKeyboard?.hide();
}

window.DongMathLive = Object.freeze({connect, close, version: '0.110.0'});
document.dispatchEvent(new CustomEvent('dong-mathlive-ready'));
