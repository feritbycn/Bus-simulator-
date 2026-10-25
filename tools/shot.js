// usage: node tools/shot.js <scenario>   (needs server on :3111)
const { chromium } = require('playwright');
const out = (n) => `/tmp/claude-0/shot_${n}.png`;
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 430, height: 880 }, deviceScaleFactor: 1.5, locale: 'tr-TR' });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  await p.goto('http://localhost:3111/'); await p.waitForTimeout(2500);
  await p.screenshot({ path: out('1_story') });
  await p.click('.story-sheet .btn'); await p.waitForTimeout(300); await p.screenshot({ path: out('1b_story2') });
  await p.click('.story-sheet .btn'); await p.waitForTimeout(600);
  await p.screenshot({ path: out('2_home') });
  await p.click('#btn-play'); await p.waitForTimeout(1800);
  await p.screenshot({ path: out('3_game') });
  console.log(errs.join('\n') || 'no errors');
  await b.close();
})();
