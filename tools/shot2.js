const { chromium } = require('playwright');
const out = (n) => `/tmp/claude-0/shot_${n}.png`;
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 430, height: 880 }, deviceScaleFactor: 1.5, locale: 'tr-TR' });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|fonts/.test(m.text())) errs.push('CONSOLE ' + m.text()); });
  await p.goto('http://localhost:3111/'); await p.waitForTimeout(2200);
  for (let i = 0; i < 2; i++) { const bt = await p.$('.story-sheet .btn'); if (bt) { await bt.click(); await p.waitForTimeout(250); } }
  await p.waitForTimeout(500);
  await p.screenshot({ path: out('2_home') });
  await p.click('#btn-play'); await p.waitForTimeout(1500);
  // play by following solver order via the real view (taps)
  const ids = await p.evaluate(() => { const S = window.__NT; return NovaEngine.followOrder(S.level); });
  await p.screenshot({ path: out('3_game') });
  for (let i = 0; i < ids.length; i++) {
    await p.evaluate((id) => window.__NT.view.tapPod(id), ids[i]);
    await p.waitForTimeout(i === 1 ? 140 : 450);
    if (i === 1) await p.screenshot({ path: out('4_mid') });
  }
  await p.waitForTimeout(2500);
  await p.screenshot({ path: out('5_win') });
  console.log(errs.join('\n') || 'no errors');
  await b.close();
})();
