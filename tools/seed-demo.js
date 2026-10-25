/* Back-fills ~14 days of plausible history so the admin charts are not empty (demo only).
 *   node tools/seed-demo.js [players=400] [days=14]
 * Seeded players are named "Demo-xxxx". Delete data/nova.db to start fresh. */
const crypto = require('crypto');
const { db, q, dayKey } = require('../server/db');
const N = +(process.argv[2] || 400), DAYS = +(process.argv[3] || 14);
const rnd = (a, b) => a + Math.random() * (b - a), pick = (a) => a[Math.floor(Math.random() * a.length)];
const products = [['coins_s', 99], ['coins_m', 299], ['coins_l', 499], ['coins_xl', 999], ['starter', 199], ['adfree', 399], ['plus7', 299], ['plus30', 799], ['pro', 499]];
const insP = q(`INSERT INTO players(device_id,token,name,lang,platform,country,created_at,last_seen,level,best_level,coins,props,stars,wins,losses,playtime_ms,spent_cents) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
const insS = q('INSERT INTO sessions(player_id,start,last_ping,day) VALUES(?,?,?,?)');
const insR = q('INSERT INTO runs(player_id,level,start,end,result,stars,duration_ms,reward,day) VALUES(?,?,?,?,?,?,?,?,?)');
const insA = q('INSERT INTO ad_events(player_id,placement,token,start,done,status,day) VALUES(?,?,?,?,?,?,?)');
const insB = q('INSERT INTO purchases(player_id,product_id,cents,provider,ts,day) VALUES(?,?,?,?,?,?)');
const insM = q('INSERT OR REPLACE INTO metrics_minute(ts,online,playing) VALUES(?,?,?)');
db.exec('BEGIN');
const now = Date.now(); const ids = [];
for (let i = 0; i < N; i++) {
  const created = now - Math.floor(Math.pow(Math.random(), 1.6) * DAYS * 864e5);
  const best = Math.floor(rnd(1, 4) * Math.pow(Math.random(), 0.7) * 14);
  const info = insP.run('demo-' + crypto.randomUUID(), crypto.randomBytes(12).toString('hex'), 'Demo-' + crypto.randomInt(1000, 9999), Math.random() < 0.6 ? 'tr' : 'en', pick(['android', 'android', 'ios', 'web']), pick(['TR', 'TR', 'DE', 'US', 'BR', 'GB', 'FR', 'ID']), created, created, best + 1, best, 200, '{}', best * 2, best, Math.floor(best / 2), best * 45000, 0);
  ids.push([Number(info.lastInsertRowid), created, best]);
}
for (const [pid, created, best] of ids) {
  const days = 1 + Math.floor(Math.pow(Math.random(), 1.8) * DAYS);
  let last = created;
  for (let d = 0; d < days; d++) {
    const t = created + d * 864e5 + rnd(0, 6e5); if (t > now) break;
    if (d > 0 && Math.random() > Math.pow(0.82, d * 0.5)) continue;       // decaying retention
    const len = rnd(2, 24) * 60000;
    insS.run(pid, t, t + len, dayKey(t)); last = Math.max(last, t + len);
    const plays = Math.floor(len / 60000 * rnd(0.6, 1.4));
    for (let r = 0; r < plays; r++) {
      const st = t + r * 55000, win = Math.random() < 0.62, lv = Math.max(1, Math.floor(rnd(1, best + 2)));
      insR.run(pid, lv, st, st + 45000, win ? 'win' : pick(['lose', 'lose', 'quit']), win ? 1 + Math.floor(Math.random() * 3) : 0, 45000, win ? 60 : 0, dayKey(st));
      if (win && Math.random() < 0.3) insA.run(pid, pick(['double_reward', 'double_reward', 'free_prop', 'revive', 'supply']), crypto.randomBytes(6).toString('hex'), st, st + 6000, 'done', dayKey(st));
    }
    if (Math.random() < 0.05) { const [id, c] = pick(products); insB.run(pid, id, c, 'mock', t, dayKey(t)); q('UPDATE players SET spent_cents=spent_cents+? WHERE id=?').run(c, pid); }
  }
  q('UPDATE players SET last_seen=? WHERE id=?').run(last, pid);
}
// hourly concurrency curve for the last 24h
for (let m = 0; m < 24 * 60; m += 5) { const ts = Math.floor((now - m * 60000) / 60000) * 60000; const h = new Date(ts).getUTCHours(); const base = 40 + 60 * Math.sin(((h - 8) / 24) * Math.PI * 2) ** 2; const o = Math.round(base + rnd(-8, 8)); insM.run(ts, o, Math.round(o * rnd(0.35, 0.5))); }
db.exec('COMMIT');
console.log(`seeded ${N} demo players over ${DAYS} days`);
