/* Sourced lessons are deliberately separate from autonomous AI solving. */
(function () {
  'use strict';
  function paperGroup(item) {
    if (item.kind !== 'gaokao') return '';
    const paper = String(item.paper || '').replace(/\s/g, '');
    if (/(?:全国|新高考|新课标).*(?:Ⅱ|II|二|2)卷/.test(paper)) return 'national-ii';
    if (/(?:全国|新高考|新课标).*(?:Ⅰ|I|一|1)卷/.test(paper)) return 'national-i';
    return paper;
  }
  function select(items, filters = {}) {
    const query = String(filters.query || '').trim().toLocaleLowerCase();
    return items.filter(item => (!filters.kind || item.kind === filters.kind) &&
      (!filters.year || String(item.year) === String(filters.year)) &&
      (!filters.paper || paperGroup(item) === filters.paper) &&
      (!filters.curve || item.curve === filters.curve) &&
      (!filters.topic || item.tags.includes(filters.topic)) &&
      (!query || [item.title, item.paper, paperGroup(item)==='national-i'?'全国一卷 新高考一卷 新课标一卷':paperGroup(item)==='national-ii'?'全国二卷 新高考二卷 新课标二卷':'', item.number, item.question, ...item.tags, ...(item.knowledge||[]).flatMap(topic=>[topic.name,topic.description])].join(' ').toLocaleLowerCase().includes(query)));
  }
  function sceneFor(item) {
    if (!item.scene) return null;
    const scene = JSON.parse(JSON.stringify(item.scene));
    scene.problemMotion = true;
    scene.title = item.title;
    scene.lines = (scene.lines || []).map(line => {
      if (!Number.isFinite(line.a) || !Number.isFinite(line.b) || !Number.isFinite(line.c)) return line;
      const {a, b, c, ...rest} = line;
      return Math.abs(b) < 1e-12 ? {...rest, kind: 'vertical', x: -c / a} : {...rest, kind: 'slope', m: -a / b, b: -c / b};
    });
    if (item.id === '2023-i-6') {
      scene.points ||= {};
      for (const [index, line] of scene.lines.entries()) {
        const m = line.m, d = (2 * m - 2) / (m * m + 1);
        scene.points[index === 0 ? 'A' : 'B'] = [2 - m * d, d];
      }
    }
    return scene;
  }
  function lesson(item, style, solveDeterministic) {
    const exact = item.solver && solveDeterministic ? solveDeterministic(item.question) : null;
    if (item.solver && (!exact?.scene || exact.parts?.some(part => part.status !== 'answered')))
      throw new Error('本题的联动图形未完成校验，暂不能载入参考讲解。');
    const parts = JSON.parse(JSON.stringify(exact?.parts || item.parts)).map(part => ({
      ...part, status: 'answered', verification: {status: 'reference-reviewed', message: '题库参考推导'}
    }));
    const solution = {
      ...exact, mode: 'reference-lesson', title: item.title + ' · 题库参考讲解',
      restatement: item.question, model: '题库参考讲解（非 AI 现场生成）',
      parts, completion: {answered: parts.length, total: parts.length},
      answer: parts.map(part => part.answer).join('\n'),
      strategy: item.tags.join(' → '),
      quality_notice: '这是有出处的预置参考讲解，不代表任意输入题目的自动解题能力。',
      verification: {status: 'reference-reviewed', message: '题面已核对公开来源，推导经重新计算。图形用于辅助理解，不能替代一般性证明。', checks: []},
      lessonSource: {id: item.id, year: item.year, paper: item.paper, number: item.number, scope: item.scope, sources: item.sources, pitfall: item.pitfall},
      scene_notice: item.sceneNote || '图形按本题参数绘制；自由修改参数后不再保证满足原题条件。',
      study: {mode: style === 'full' ? 'full' : 'step', counts: {}, answers: {}, notes: '', review: 'new'}
    };
    return {format: 'dongjiexi-lesson', version: 1, question: item.question, solution,
      scene: exact?.scene || sceneFor(item), activePart: parts[0].index, exploring: false};
  }
  function attach(api) {
    const find = selector => document.querySelector(selector);
    const button = find('#openQuestionBank');
    const dialog = document.createElement('dialog'); dialog.id = 'questionBankDialog'; dialog.className = 'question-bank-dialog';
    dialog.setAttribute('aria-labelledby', 'questionBankTitle');
    dialog.innerHTML = '<header><div><h2 id="questionBankTitle">高考真题题库</h2><p class="help" id="bankCoverage">正在读取题库…</p></div><button id="closeQuestionBank" class="button secondary" type="button">关闭</button></header>' +
      '<div class="bank-filter-actions"><button type="button" id="bankResetFilters">清除筛选</button></div>' +
      '<div class="bank-filters"><label>找题<input id="bankSearch" type="search" placeholder="题号、知识点、关键字"></label><label>题库<select id="bankKind"><option value="">全部</option><option value="gaokao">近五年高考真题</option><option value="classic">经典例题</option></select></label><label>卷别<select id="bankPaper"><option value="">全部卷别</option><option value="national-i">全国一卷（新高考／新课标）</option><option value="national-ii">全国二卷（新高考／新课标）</option></select></label><label>年份<select id="bankYear"><option value="">全部年份</option></select></label><label>曲线<select id="bankCurve"><option value="">全部曲线</option><option>椭圆</option><option>双曲线</option><option>抛物线</option><option>圆</option></select></label><label>考点<select id="bankTopic"><option value="">全部考点</option></select></label></div>' +
      '<p class="help">先看考点与学习目标，再选择题目；此处不会提前展示答案。</p><p id="bankResultCount" role="status" aria-live="polite"></p><div class="bank-layout"><nav id="bankList" aria-label="题目列表"></nav><section id="bankDetail" aria-label="题目详情"><p>选择一道题开始。</p></section></div>';
    document.body.append(dialog);
    let data = null, selected = null, loading = null;
    const typeLabel = item => item.year ? `${item.year} · ${item.paper} · 第 ${item.number} 题` : item.paper;
    function textElement(tag, value, className) {const node = document.createElement(tag); node.textContent = value; if (className) node.className = className; return node;}
    function typeset(node) {window.renderMathInElement?.(node, {throwOnError: false, trust: false, delimiters: [{left: '$$', right: '$$', display: true}, {left: '$', right: '$', display: false}]});}
    function display(item) {
      selected = item;
      find('#bankList').querySelectorAll('button').forEach(node => node.setAttribute('aria-pressed', String(node.dataset.bankId === item.id)));
      const detail = find('#bankDetail'); detail.replaceChildren();
      detail.append(textElement('h3', item.title), textElement('p', typeLabel(item) + ' · ' + item.scope, 'help'),
        textElement('p', item.level + ' · ' + item.tags.join(' / '), 'bank-tags'));
      const knowledge = document.createElement('section'); knowledge.className = 'bank-knowledge';
      knowledge.append(textElement('h4', '本题考查什么'));
      const topics = document.createElement('ul');
      for (const topic of item.knowledge || []) {
        const row = document.createElement('li'); row.append(textElement('strong', topic.name + '：'), document.createTextNode(topic.description)); topics.append(row);
      }
      knowledge.append(topics); detail.append(knowledge, textElement('div', item.question, 'bank-question math-content'));
      const sources = document.createElement('details'), summary = textElement('summary', '题目出处与整理说明');
      sources.append(summary, textElement('p', data.rights, 'help'));
      for (const source of item.sources) {
        const url = new URL(source.url); if (url.protocol !== 'https:') continue;
        const link = textElement('a', source.title); link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer';
        const row = document.createElement('p'); row.append(link); sources.append(row);
      }
      const actions = document.createElement('div'); actions.className = 'bank-actions';
      for (const [mode, label] of [['practice', '独立练习 · 逐步提示'], ['full', '查看参考讲解'], ['teach', '进入讲题模式']]) {
        const action = textElement('button', label, 'button ' + (mode === 'practice' ? 'primary' : 'secondary'));
        action.type = 'button'; action.dataset.bankAction = mode;
        action.addEventListener('click', () => {
          try {
            const record = lesson(item, mode, api.solveDeterministic);
            if (api.question.value.trim()) api.saveCurrent();
            api.restoreLesson(record); dialog.close(); api.showLearning();
            if (mode === 'teach') find('#startClassroom').click();
            if (window.matchMedia('(max-width: 760px)').matches) find('[data-mobile-panel="lesson"]')?.click();
            api.setStatus('已载入' + item.scope + '。' + (mode === 'practice' ? '先独立作答，再点击提示；参考结论默认隐藏。' : '参考讲解已载入；可保存到题本、记录错因。'));
          } catch (error) {api.setStatus(error.message || String(error), true);}
        }); actions.append(action);
      }
      detail.append(actions, textElement('p', '参考讲解是独立入口；点击主界面的“解题”仍使用你选择的解题引擎。', 'help'), sources);
      const pitfall = document.createElement('details'); pitfall.append(textElement('summary', '易错点提示'), textElement('p', item.pitfall)); detail.append(pitfall);
      typeset(detail);
    }
    function render() {
      if (!data) return;
      const items = select(data.items, {query: find('#bankSearch').value, kind: find('#bankKind').value, paper: find('#bankPaper').value, year: find('#bankYear').value, curve: find('#bankCurve').value, topic: find('#bankTopic').value});
      find('#questionBankTitle').textContent = find('#bankKind').value === 'classic' ? '经典例题' : find('#bankKind').value === 'gaokao' ? '高考真题题库' : '真题与经典题';
      find('#bankResultCount').textContent = `找到 ${items.length} / ${data.items.length} 道题 · 每题保留来源与收录范围`;
      const list = find('#bankList'); list.replaceChildren();
      for (const item of items) {
        const row = document.createElement('button'); row.type = 'button'; row.dataset.bankId = item.id;
        row.append(textElement('strong', item.title), textElement('span', typeLabel(item)), textElement('small', item.scope + ' · ' + item.curve + ' · ' + item.level));
        row.append(textElement('span', (item.knowledge || []).map(topic => topic.name + '：' + topic.description).join('；'), 'bank-topic-summary'));
        row.addEventListener('click', () => display(item)); list.append(row);
      }
      if (items.length) display(items.find(item => item.id === selected?.id) || items[0]);
      else {selected = null; find('#bankDetail').replaceChildren(textElement('p', '没有符合条件的题目，请减少筛选条件。'));}
    }
    async function load() {
      if (data) return;
      if (!loading) loading = (async () => {
        const response = await fetch(new URL('question-bank.json', document.baseURI));
        if (!response.ok) throw new Error('题库读取失败，请刷新网页后重试。');
        const value = await response.json();
        if (value.schema !== 'dongjiexi-question-bank/v1' || !Array.isArray(value.items)) throw new Error('题库版本不兼容。');
        data = value; find('#bankCoverage').textContent = value.coverage;
        for (const paper of [...new Set(value.items.map(paperGroup).filter(key => key && !key.startsWith('national-')))]) find('#bankPaper').add(new Option(paper, paper));
        for (const year of [...new Set(value.items.map(item => item.year).filter(Boolean))].sort((a,b) => b-a)) find('#bankYear').add(new Option(year, year));
        for (const topic of [...new Set(value.items.flatMap(item => item.tags))].sort()) find('#bankTopic').add(new Option(topic, topic));
      })().finally(() => {loading = null;});
      await loading;
    }
    button.addEventListener('click', async () => {
      if (!dialog.open) dialog.showModal();
      try {await load(); find('#bankKind').value='gaokao';render();} catch (error) {find('#bankCoverage').textContent = error.message;}
    });
    find('#closeQuestionBank').addEventListener('click', () => dialog.close());
    for (const id of ['bankSearch', 'bankKind', 'bankPaper', 'bankYear', 'bankCurve', 'bankTopic']) find('#' + id).addEventListener(id === 'bankSearch' ? 'input' : 'change', () => {if(id === 'bankKind' && find('#bankKind').value === 'classic') find('#bankPaper').value = ''; render();});
    find('#bankResetFilters').addEventListener('click', () => {for(const id of ['bankSearch','bankPaper','bankYear','bankCurve','bankTopic']) find('#'+id).value = ''; render();});
    return {open: () => button.click()};
  }
  const exported = {paperGroup, select, sceneFor, lesson, attach};
  if (typeof window !== 'undefined') window.DongQuestionBank = exported;
  if (typeof module !== 'undefined') module.exports = exported;
})();
