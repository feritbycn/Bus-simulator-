const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1500, height: 900 } });
  const A = path.join(__dirname, '..', 'public', 'assets');
  const imgs = ['bg_harbor','bg_oldtown','bg_neon','bg_gardens','bg_orbit','bg_aurora'].map(n => `<div style="width:200px;height:355px;background:url(${n}.svg) center/cover;border-radius:12px"></div>`).join('');
  require('fs').writeFileSync(A+'/_preview.html',`<body style="margin:0;background:#222;display:flex;gap:10px;padding:10px;flex-wrap:wrap;align-items:flex-start">${imgs}
  <img src="icon.svg" width="170"><img src="logo.svg" width="360" style="background:#2b2b5a;border-radius:12px"><img src="char_mira.svg" height="200"><img src="char_pip.svg" height="170"></body>`);
  await p.goto('file://'+A+'/_preview.html');
  await p.waitForTimeout(500);
  await p.screenshot({ path: process.argv[2] || '/tmp/claude-0/assets_preview.png' });
  await b.close();
})();
