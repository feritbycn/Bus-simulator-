const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1360, height: 1500 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://localhost:3111/admin?key=' + process.argv[2]); await p.waitForTimeout(4500);
  await p.screenshot({ path: '/tmp/claude-0/shot_admin.png', fullPage: true });
  console.log(errs.join('\n') || 'no errors'); await b.close();
})();
