const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const root = require('node:path').resolve(__dirname, '..');
const html = fs.readFileSync(root + '/dist/index.html', 'utf8');
const ui = fs.readFileSync(root + '/dist/learning-ui.js', 'utf8');

for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
  if (match[1].trim()) new vm.Script(match[1]);
}
new vm.Script(ui);

assert(html.includes('linearIntersection:true'), '一次联立必须单独标记');
assert(html.includes('不能据此判相切'), '一次联立不得显示为相切');
assert(ui.includes('局部代数核验通过'), '界面必须展示局部核验状态');
assert(ui.includes('题面仍含“[看不清]”'), '模糊 OCR 必须阻止直接求解');
assert(ui.includes('proof_obligations'), '界面必须展示证明义务');
assert(html.includes("gradientValidity.get(first)===true&&gradientValidity.get(second)===true"),
  '双切线垂直关系必须先通过两条切线各自的规范构造校验');
console.log('browser trust contracts: 6 passed');
