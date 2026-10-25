const E = require('../shared/engine.js');
const rows = [];
const t0 = Date.now();
for (let n = 1; n <= 200; n++) {
  const L = E.generateLevel(n);
  let rw = 0, gw = 0; const N = 40;
  for (let i = 0; i < N; i++) {
    if (E.playBot(L, 'random', E.mulberry32(i * 99 + n)).result === 'win') rw++;
    if (E.playBot(L, 'human', E.mulberry32(i * 77 + n)).result === 'win') gw++;
  }
  gw = Math.round((gw / N) * 100);
  rows.push({ n, pods: L.pods.length, grid: L.w + 'x' + L.h, col: L.colors, win: L.window, bays: L.bays, solv: L.solvable ? 'Y' : 'N', noisy: gw, rnd: Math.round((rw / N) * 100) });
}
const pick = process.argv[2] ? process.argv[2].split(',').map(Number) : null;
console.log('lvl pods grid col win bays solv noisy% random%');
for (const r of rows) if (!pick ? (r.n <= 12 || r.n % 5 === 0) : pick.includes(r.n)) console.log(String(r.n).padStart(3), String(r.pods).padStart(4), r.grid.padEnd(5), r.col, String(r.win).padStart(3), r.bays, r.solv, String(r.noisy).padStart(4), String(r.rnd).padStart(5));
const unsolv = rows.filter((r) => r.solv !== 'Y').length;
console.log('unsolvable:', unsolv, 'time(ms):', Date.now() - t0);
