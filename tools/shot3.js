const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 430, height: 880 }, deviceScaleFactor: 1.2, locale: 'tr-TR' })).newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://localhost:3111/'); await p.waitForTimeout(2200);
  for (let i = 0; i < 2; i++) { const bt = await p.$('.story-sheet .btn'); if (bt) { await bt.click(); await p.waitForTimeout(250); } }
  await p.waitForTimeout(600);
  const close = async () => { await p.evaluate(() => document.querySelectorAll('#modal-root .x').forEach((x) => x.click())); await p.waitForTimeout(200); };
  await close();
  for (const [sel, name] of [['[data-nav=shop]', 'shop'], ['[data-nav=spin]', 'spin'], ['[data-nav=missions]', 'missions'], ['#btn-settings', 'settings']]) {
    await p.click(sel); await p.waitForTimeout(500); await p.screenshot({ path: `/tmp/claude-0/shot_m_${name}.png` }); await close();
  }
  // lose flow: fill bays with wrong colours
  await p.click('#btn-play'); await p.waitForTimeout(1500);
  await p.evaluate(() => { const v = window.__NT.view; for (const pod of v.game.pods) v.tapPod(pod.id); });
  await p.waitForTimeout(4000); await p.screenshot({ path: '/tmp/claude-0/shot_lose.png' });
  console.log(errs.join('\n') || 'no errors'); await b.close();
})();
