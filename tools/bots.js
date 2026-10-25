/* Load / demo simulator: spawns fake players that register, stay connected over WebSocket,
 * play levels (server-verified), watch rewarded ads, spin, claim dailies and sometimes buy.
 *   node tools/bots.js --n 60 --url http://localhost:3000 --speed 3 --minutes 10
 */
const WebSocket = require('ws');
const E = require('../shared/engine.js');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const N = +arg('n', 40), URL_ = arg('url', 'http://localhost:3000'), SPEED = +arg('speed', 2), MINUTES = +arg('minutes', 0), PREFIX = arg('prefix', 'bot');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms / SPEED));
const realSleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rnd = (a, b) => a + Math.random() * (b - a);

async function call(token, path, body) {
  const r = await fetch(URL_ + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(token ? { 'x-token': token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({})); if (!r.ok) { const e = new Error(j.error || r.status); e.code = j.error; throw e; } return j;
}
const stats = { runs: 0, wins: 0, ads: 0, buys: 0, errors: 0 };

async function bot(i) {
  const device = `${PREFIX}-${String(i).padStart(5, '0')}-device`;
  const reg = await call(null, '/api/register', { deviceId: device, lang: Math.random() < 0.6 ? 'tr' : 'en', platform: ['android', 'ios', 'web'][i % 3], country: ['TR', 'DE', 'US', 'BR', 'GB', 'FR'][i % 6] });
  const token = reg.token; let profile = reg.profile;
  const skill = rnd(0.45, 0.95);
  let ws, state = 'menu', level = 0, alive = true;
  const send = (o) => ws && ws.readyState === 1 && ws.send(JSON.stringify(o));
  const open = () => { ws = new WebSocket(URL_.replace('http', 'ws') + '/ws?token=' + token); ws.on('open', () => send({ t: 'state', s: state, level })); ws.on('error', () => {}); };
  open(); const ping = setInterval(() => send({ t: 'ping' }), 20000);
  const setState = (s, l) => { state = s; level = l || 0; send({ t: 'state', s, level }); };
  try {
    await sleep(rnd(0, 6000));
    if (!profile.daily.claimedToday) await call(token, '/api/daily/claim', {}).catch(() => {});
    while (alive) {
      const roll = Math.random();
      if (roll < 0.72) {
        const lv = Math.max(1, Math.min(profile.level, Math.round(profile.level - (Math.random() < 0.2 ? rnd(0, 3) : 0))));
        const st = await call(token, '/api/level/start', { level: lv }); setState('playing', lv);
        const order = E.followOrder(st.level) || [];
        const win = Math.random() < Math.pow(skill, 1 + lv / 25);
        await sleep(rnd(8000, 28000) * (win ? 1 : 0.6));
        stats.runs++;
        if (win) {
          const r = await call(token, '/api/level/finish', { runId: st.runId, result: 'win', actions: order.map((id) => ({ t: 'tap', id })), durationMs: 15000 }); profile = r.profile; stats.wins++;
          if (Math.random() < 0.35) { try { const a = await call(token, '/api/ad/start', { placement: 'double_reward', runId: st.runId }); setState('ad'); await realSleep(4600); await call(token, '/api/ad/complete', { token: a.token }); stats.ads++; } catch (e) {} }
        } else {
          const part = order.slice(0, Math.floor(order.length * rnd(0.3, 0.9)));
          const r = await call(token, '/api/level/finish', { runId: st.runId, result: Math.random() < 0.7 ? 'lose' : 'quit', actions: part.map((id) => ({ t: 'tap', id })), durationMs: 9000 }); profile = r.profile;
        }
        setState('menu');
      } else if (roll < 0.82) {
        try { const a = await call(token, '/api/ad/start', { placement: 'free_prop', prop: ['reorder', 'bay', 'vip'][Math.floor(Math.random() * 3)] }); setState('ad'); await realSleep(4600); const r = await call(token, '/api/ad/complete', { token: a.token }); profile = r.profile; stats.ads++; } catch (e) {}
        setState('menu');
      } else if (roll < 0.9) {
        if (profile.spin.freeIn === 0) { try { const r = await call(token, '/api/spin', { mode: 'free' }); profile = r.profile; } catch (e) {} }
        else if (profile.supply.readyIn === 0) { try { const r = await call(token, '/api/supply/claim', {}); profile = r.profile; } catch (e) {} }
      } else if (roll < 0.905 && profile.bestLevel >= 3) {
        const ids = ['coins_s', 'coins_m', 'coins_l', 'starter', 'adfree', 'plus7', 'coins_xl'];
        try { const r = await call(token, '/api/shop/purchase', { productId: ids[Math.floor(Math.random() * ids.length)], provider: 'mock' }); profile = r.profile; stats.buys++; } catch (e) {}
      }
      await sleep(rnd(2500, 9000));
      if (Math.random() < 0.015) { // leave for a while (churn / session end)
        clearInterval(ping); ws && ws.close(); await sleep(rnd(20000, 90000)); open(); }
    }
  } catch (e) { stats.errors++; if (stats.errors < 4) console.error('bot error', i, e.message); }
  clearInterval(ping); ws && ws.close();
  return () => { alive = false; };
}

(async () => {
  console.log(`spawning ${N} bots -> ${URL_} (speed x${SPEED})`);
  const stops = [];
  for (let i = 0; i < N; i++) { bot(i).then((s) => s && stops.push(s)); await new Promise((r) => setTimeout(r, 120)); }
  const t = setInterval(() => console.log('bots', JSON.stringify(stats)), 10000);
  if (MINUTES) setTimeout(() => { clearInterval(t); console.log('done', stats); process.exit(0); }, MINUTES * 60000);
})();
