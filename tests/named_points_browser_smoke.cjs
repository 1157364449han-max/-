module.exports = async ({page, assert}) => {
  await page.locator('#question').fill('已知椭圆 C：x²/9+y²/4=1，点 P(1,0)。过点 P 的动直线 l 与椭圆 C 交于 M、N 两点，设 Q 为弦 MN 的中点，求 Q 的位置。');
  await page.locator('#solveButton').click();
  await page.waitForFunction(() => !document.querySelector('#solveButton')?.disabled);
  const scene = JSON.parse(await page.locator('#sceneJson').inputValue());
  assert.deepEqual(scene.dynamicIntersectionLabels, ['M', 'N']);
  const midpoint = scene.objects.find(item => item.label === 'Q' && item.op === 'midpoint');
  assert.deepEqual(midpoint?.refs, ['feature:M', 'feature:N']);
  const metrics = await page.locator('#metrics').innerText();
  assert.match(metrics, /交点 M/);
  assert.match(metrics, /交点 N/);
  assert.match(metrics, /Q（中点）/);
  assert.doesNotMatch(metrics, /Q（中点）\s*暂未定位/);
  await page.locator('#sceneJson').evaluate((el,json)=>{el.value=json;document.querySelector('#applyJson').click();},JSON.stringify({...scene, showFeatures:false}));
  assert.match(await page.locator('#metrics').innerText(), /交点 N/);
};
