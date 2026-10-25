const E = require('../shared/engine.js');
const N = 60;
const buckets = {};
for (let n = 1; n <= 150; n++) {
  const L = E.generateLevel(n); const ph = n % 10; const kind = (ph === 4 || ph === 5) ? 'relax' : (ph === 0 && n >= 10 ? 'boss' : 'normal');
  let w = 0; for (let i = 0; i < N; i++) if (E.playBot(L, 'human', E.mulberry32(i * 77 + n)).result === 'win') w++;
  const b = Math.floor((n - 1) / 15) * 15 + 1 + '-' + (Math.floor((n - 1) / 15) * 15 + 15);
  buckets[b] = buckets[b] || { normal: [], relax: [], boss: [] }; buckets[b][kind].push(w / N * 100);
}
const avg = (a) => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : '-';
for (const [b, v] of Object.entries(buckets)) console.log(b.padEnd(8), 'normal', String(avg(v.normal)).padStart(3), 'relax', String(avg(v.relax)).padStart(3), 'boss', String(avg(v.boss)).padStart(3));
