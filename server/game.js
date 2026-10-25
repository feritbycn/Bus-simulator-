/* Server-authoritative game services: profile, economy, runs, ads, shop. */
const crypto = require('crypto');
const E = require('../shared/engine.js');
const { q, dayKey } = require('./db');
const { ECONOMY, product, weightedPick, missionsFor } = require('./economy');

const rnd = () => crypto.randomInt(0, 1e9) / 1e9;
const levelCache = new Map();
function getLevel(n) {
  let L = levelCache.get(n);
  if (!L) { L = E.generateLevel(n); levelCache.set(n, L); if (levelCache.size > 600) levelCache.delete(levelCache.keys().next().value); }
  return L;
}

class ApiError extends Error { constructor(status, code, extra) { super(code); this.status = status; this.code = code; this.extra = extra; } }
const fail = (status, code, extra) => { throw new ApiError(status, code, extra); };

/* ---------------- players ---------------- */
const selByDevice = q('SELECT * FROM players WHERE device_id=?');
const selByToken = q('SELECT * FROM players WHERE token=?');
const selById = q('SELECT * FROM players WHERE id=?');
const insPlayer = q(`INSERT INTO players(device_id,token,name,lang,platform,country,created_at,last_seen,coins,props,missions,missions_day)
  VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`);

function hydrate(row) {
  if (!row) return null;
  const p = Object.assign({}, row);
  p.props = JSON.parse(row.props || '{}');
  p.missions = JSON.parse(row.missions || '[]');
  p.one_time = JSON.parse(row.one_time || '[]');
  return p;
}
function save(p) {
  q(`UPDATE players SET name=?,lang=?,level=?,best_level=?,coins=?,props=?,stars=?,ad_free=?,vip_until=?,vip_last_daily=?,daily_day=?,daily_last=?,daily_doubled=?,
     spin_last_free=?,spin_extra=?,supply_last=?,missions=?,missions_day=?,chest_claimed=?,wins=?,losses=?,playtime_ms=?,spent_cents=?,one_time=?,wins_since_inter=?,last_inter=?,flags=?,last_seen=? WHERE id=?`)
    .run(p.name, p.lang, p.level, p.best_level, p.coins, JSON.stringify(p.props), p.stars, p.ad_free, p.vip_until, p.vip_last_daily, p.daily_day, p.daily_last, p.daily_doubled,
      p.spin_last_free, p.spin_extra, p.supply_last, JSON.stringify(p.missions), p.missions_day, p.chest_claimed, p.wins, p.losses, p.playtime_ms, p.spent_cents, JSON.stringify(p.one_time), p.wins_since_inter, p.last_inter, p.flags, Date.now(), p.id);
}
const loadByToken = (t) => (t ? hydrate(selByToken.get(String(t))) : null);
const load = (id) => hydrate(selById.get(id));

function randomName() {
  const a = ['Nova', 'Pixel', 'Turbo', 'Lumi', 'Comet', 'Neon', 'Orbit', 'Zippy', 'Aero', 'Cosmo', 'Echo', 'Flux'];
  return a[crypto.randomInt(a.length)] + '-' + crypto.randomInt(1000, 9999);
}

function register({ deviceId, lang, platform, country }) {
  if (typeof deviceId !== 'string' || deviceId.length < 8 || deviceId.length > 80) fail(400, 'bad_device');
  let row = selByDevice.get(deviceId);
  let created = false;
  if (!row) {
    const now = Date.now();
    const token = crypto.randomBytes(24).toString('hex');
    const missions = missionsFor(1, dayKey());
    insPlayer.run(deviceId, token, randomName(), ['tr', 'en'].includes(lang) ? lang : 'en', String(platform || 'web').slice(0, 12), String(country || '').slice(0, 3),
      now, now, ECONOMY.startCoins, JSON.stringify(ECONOMY.startProps), '[]', '');
    row = selByDevice.get(deviceId); created = true;
  }
  const p = hydrate(row);
  refreshDaily(p); save(p);
  return { p, created };
}

/** roll over daily missions / VIP stipend if the UTC day changed */
function refreshDaily(p) {
  const today = dayKey();
  if (p.missions_day !== today) { p.missions = missionsFor(p.id, today); p.missions_day = today; p.chest_claimed = 0; }
}
const isVip = (p) => p.vip_until > Date.now();
const noAds = (p) => !!p.ad_free || isVip(p);

function profile(p) {
  refreshDaily(p);
  const now = Date.now(), today = dayKey();
  const adsToday = q("SELECT COUNT(*) c FROM ad_events WHERE player_id=? AND day=? AND status='done'").get(p.id, today).c;
  return {
    id: p.id, name: p.name, lang: p.lang, level: p.level, bestLevel: p.best_level, coins: p.coins, props: p.props, stars: p.stars,
    adFree: noAds(p), vip: isVip(p), vipUntil: p.vip_until,
    vipClaimable: isVip(p) && p.vip_last_daily !== today,
    daily: { day: p.daily_day, claimedToday: p.daily_last === today, doubled: p.daily_doubled === today,
      next: p.daily_last === today ? p.daily_day : (p.daily_last === dayKey(now - 864e5) ? (p.daily_day % 7) + 1 : 1) },
    spin: { freeIn: Math.max(0, Math.ceil((p.spin_last_free + ECONOMY.spin.freeEverySec * 1000 - now) / 1000)), extra: p.spin_extra },
    supply: { readyIn: Math.max(0, Math.ceil((p.supply_last + ECONOMY.supply.cooldownSec * 1000 - now) / 1000)) },
    missions: p.missions, chestClaimed: !!p.chest_claimed,
    oneTime: p.one_time, wins: p.wins, losses: p.losses, adsToday, serverTime: now,
  };
}

function grant(p, g) {
  if (!g) return;
  if (g.coins) p.coins += g.coins;
  if (g.prop) p.props[g.prop] = (p.props[g.prop] || 0) + (g.n || 1);
  if (g.prop2) p.props[g.prop2] = (p.props[g.prop2] || 0) + (g.n2 || 1);
  if (g.props) for (const [k, v] of Object.entries(g.props)) p.props[k] = (p.props[k] || 0) + v;
  if (g.adFree) p.ad_free = 1;
  if (g.vipDays) p.vip_until = Math.max(Date.now(), p.vip_until) + g.vipDays * 864e5;
}

/* ---------------- runs ---------------- */
const insRun = q('INSERT INTO runs(player_id,level,start,day,attempt) VALUES(?,?,?,?,?)');
const selRun = q('SELECT * FROM runs WHERE id=? AND player_id=?');
function startLevel(p, level) {
  level = level | 0;
  if (level < 1 || level > p.level) fail(400, 'level_locked');
  // close dangling runs of this player as quit
  q("UPDATE runs SET result='quit', end=? WHERE player_id=? AND result='started'").run(Date.now(), p.id);
  const attempt = q('SELECT COUNT(*) c FROM runs WHERE player_id=? AND level=?').get(p.id, level).c + 1;
  const info = insRun.run(p.id, level, Date.now(), dayKey(), attempt);
  const L = getLevel(level);
  return { runId: Number(info.lastInsertRowid), level: L, attempt, freeBay: isVip(p) };
}

function useProp(p, { runId, prop }) {
  if (!['reorder', 'bay', 'vip', 'hint'].includes(prop)) fail(400, 'bad_prop');
  const run = selRun.get(runId | 0, p.id);
  if (!run || run.result !== 'started') fail(400, 'no_run');
  if ((p.props[prop] || 0) < 1) fail(409, 'no_stock');
  p.props[prop]--;
  const ch = JSON.parse(run.charged || '{}'); ch[prop] = (ch[prop] || 0) + 1;
  q('UPDATE runs SET charged=? WHERE id=?').run(JSON.stringify(ch), run.id);
  return true;
}
function buyProp(p, prop) {
  const price = ECONOMY.propPrice[prop];
  if (!price) fail(400, 'bad_prop');
  if (p.coins < price) fail(402, 'not_enough_coins');
  p.coins -= price; p.props[prop] = (p.props[prop] || 0) + 1;
}

function missionProgress(p, game, stars, won) {
  for (const m of p.missions) {
    if (m.claimed) continue;
    if (m.id === 'deliver') m.progress += game.delivered;
    else if (m.id === 'deliverColor') m.progress += game.byColor[m.color] || 0;
    else if (won && m.id === 'wins') m.progress += 1;
    else if (won && m.id === 'stars3' && stars === 3) m.progress += 1;
    else if (won && m.id === 'noprops' && game.propsUsed === 0) m.progress += 1;
    m.progress = Math.min(m.progress, m.goal);
  }
}

function finishLevel(p, { runId, result, actions, durationMs }) {
  const run = selRun.get(runId | 0, p.id);
  if (!run) fail(400, 'no_run');
  if (run.result !== 'started') fail(409, 'run_closed');
  const now = Date.now();
  const dur = Math.max(0, Math.min(durationMs | 0, now - run.start + 2000));
  const level = getLevel(run.level);
  p.playtime_ms += dur;
  let reward = 0, stars = 0, outcome = result === 'win' ? 'win' : (result === 'lose' ? 'lose' : 'quit');

  if (outcome === 'win') {
    const r = E.replay(level, actions);
    if (r.error || r.status !== 'win') { p.flags++; save(p); q("UPDATE runs SET result='invalid',end=?,duration_ms=? WHERE id=?").run(now, dur, run.id); fail(422, 'invalid_run'); }
    const ch = JSON.parse(run.charged || '{}');
    const freeBay = isVip(p) ? 1 : 0;
    if ((r.used.reorder > (ch.reorder || 0)) || (r.used.vip > (ch.vip || 0)) || (r.used.bay > (ch.bay || 0) + freeBay) || (r.used.revive > run.revives)) {
      p.flags++; save(p); q("UPDATE runs SET result='invalid',end=?,duration_ms=? WHERE id=?").run(now, dur, run.id); fail(422, 'invalid_run');
    }
    stars = r.game.stars();
    reward = ECONOMY.levelReward(run.level, stars, level.hard);
    p.coins += reward; p.wins++; p.stars += stars; p.wins_since_inter++;
    if (run.level === p.level) p.level++;
    p.best_level = Math.max(p.best_level, run.level);
    refreshDaily(p); missionProgress(p, r.game, stars, true);
  } else {
    if (outcome === 'lose') p.losses++;
    // credit partial progress for delivery missions on losses
    const r = Array.isArray(actions) && actions.length ? E.replay(level, actions) : null;
    if (r && !r.error) { refreshDaily(p); missionProgress(p, r.game, 0, false); }
  }
  q('UPDATE runs SET result=?,end=?,stars=?,duration_ms=?,reward=? WHERE id=?').run(outcome, now, stars, dur, reward, run.id);
  save(p);
  return { outcome, reward, stars, nextLevel: p.level };
}

/* ---------------- rewarded ads ---------------- */
const insAd = q('INSERT INTO ad_events(player_id,placement,token,extra,start,day) VALUES(?,?,?,?,?,?)');
function adStart(p, { placement, runId, prop }) {
  const cfg = ECONOMY.ad.placements[placement];
  if (!cfg) fail(400, 'bad_placement');
  const today = dayKey();
  const done = q("SELECT COUNT(*) c FROM ad_events WHERE player_id=? AND day=? AND status='done' AND placement<>'interstitial'").get(p.id, today).c;
  if (done >= ECONOMY.rewardedDailyCap) fail(429, 'daily_cap');
  if (cfg.cap) {
    const c = q("SELECT COUNT(*) c FROM ad_events WHERE player_id=? AND day=? AND status='done' AND placement=?").get(p.id, today, placement).c;
    if (c >= cfg.cap) fail(429, 'placement_cap');
  }
  if (placement === 'supply' && p.supply_last + ECONOMY.supply.cooldownSec * 1000 > Date.now()) fail(429, 'cooldown');
  if (placement === 'free_prop' && !['reorder', 'bay', 'vip', 'hint'].includes(prop)) fail(400, 'bad_prop');
  if (['double_reward', 'revive', 'hint'].includes(placement)) {
    const run = selRun.get(runId | 0, p.id);
    if (!run) fail(400, 'no_run');
    if (placement === 'double_reward' && (run.result !== 'win' || run.doubled)) fail(409, 'not_eligible');
    if (placement === 'revive' && run.result !== 'started') fail(409, 'not_eligible');
  }
  if (placement === 'daily_double' && (p.daily_last !== today || p.daily_doubled === today)) fail(409, 'not_eligible');
  const token = crypto.randomBytes(16).toString('hex');
  insAd.run(p.id, placement, token, JSON.stringify({ runId: runId | 0, prop: prop || '' }), Date.now(), today);
  return { token, minMs: ECONOMY.ad.minWatchMs };
}
function adFail(p, token) {
  q("UPDATE ad_events SET status='failed', done=? WHERE token=? AND player_id=? AND status='started'").run(Date.now(), String(token), p.id);
}
function adComplete(p, { token }) {
  const ev = q('SELECT * FROM ad_events WHERE token=? AND player_id=?').get(String(token), p.id);
  if (!ev) fail(404, 'unknown_ad');
  if (ev.status !== 'started') fail(409, 'already_used');
  const now = Date.now();
  if (now - ev.start < ECONOMY.ad.minWatchMs - 400) { q("UPDATE ad_events SET status='rejected', done=? WHERE id=?").run(now, ev.id); p.flags++; fail(422, 'too_fast'); }
  const extra = JSON.parse(ev.extra || '{}');
  const granted = {};
  switch (ev.placement) {
    case 'double_reward': {
      const run = selRun.get(extra.runId, p.id);
      if (!run || run.result !== 'win' || run.doubled) fail(409, 'not_eligible');
      p.coins += run.reward; granted.coins = run.reward;
      q('UPDATE runs SET doubled=1 WHERE id=?').run(run.id);
      break;
    }
    case 'revive': {
      const run = selRun.get(extra.runId, p.id);
      if (!run || run.result !== 'started') fail(409, 'not_eligible');
      q('UPDATE runs SET revives=revives+1 WHERE id=?').run(run.id); granted.revive = true;
      break;
    }
    case 'free_prop': p.props[extra.prop] = (p.props[extra.prop] || 0) + 1; granted.prop = extra.prop; break;
    case 'supply': {
      if (p.supply_last + ECONOMY.supply.cooldownSec * 1000 > now) fail(429, 'cooldown');
      const c = ECONOMY.supply.coins * ECONOMY.supply.adMultiplier; p.coins += c; p.supply_last = now; granted.coins = c; break;
    }
    case 'spin': p.spin_extra++; granted.spin = 1; break;
    case 'hint': granted.hint = true; break;
    case 'daily_double': {
      const today = dayKey();
      if (p.daily_last !== today || p.daily_doubled === today) fail(409, 'not_eligible');
      const d = ECONOMY.daily[(p.daily_day - 1) % 7]; grant(p, d); p.daily_doubled = today; granted.daily = d; break;
    }
  }
  q("UPDATE ad_events SET status='done', done=? WHERE id=?").run(now, ev.id);
  save(p);
  return { granted };
}
function interstitialCheck(p) {
  const c = ECONOMY.interstitial, now = Date.now();
  if (noAds(p) || p.level < c.fromLevel) return { show: false };
  if (p.wins_since_inter < c.everyWins || now - p.last_inter < c.minGapSec * 1000) return { show: false };
  p.wins_since_inter = 0; p.last_inter = now;
  q('INSERT INTO ad_events(player_id,placement,token,start,done,status,day) VALUES(?,?,?,?,?,?,?)').run(p.id, 'interstitial', crypto.randomBytes(8).toString('hex'), now, now, 'done', dayKey());
  save(p);
  return { show: true };
}

/* ---------------- daily / spin / supplies / missions / vip ---------------- */
function dailyClaim(p) {
  const today = dayKey();
  if (p.daily_last === today) fail(409, 'already_claimed');
  const yesterday = dayKey(Date.now() - 864e5);
  p.daily_day = p.daily_last === yesterday ? (p.daily_day % 7) + 1 : 1;
  p.daily_last = today;
  const d = ECONOMY.daily[p.daily_day - 1]; grant(p, d);
  return { day: p.daily_day, reward: d };
}
function spin(p, mode) {
  const now = Date.now();
  if (mode === 'free') {
    if (p.spin_last_free + ECONOMY.spin.freeEverySec * 1000 > now) fail(429, 'not_ready');
    p.spin_last_free = now;
  } else if (mode === 'extra') {
    if (p.spin_extra < 1) fail(409, 'no_spin'); p.spin_extra--;
  } else fail(400, 'bad_mode');
  const s = weightedPick(ECONOMY.spin.slices, rnd); grant(p, s);
  return { slice: s };
}
function supplyClaim(p) {
  const now = Date.now();
  if (p.supply_last + ECONOMY.supply.cooldownSec * 1000 > now) fail(429, 'cooldown');
  p.supply_last = now; p.coins += ECONOMY.supply.coins;
  return { coins: ECONOMY.supply.coins };
}
function missionClaim(p, idx) {
  refreshDaily(p);
  const m = p.missions[idx | 0];
  if (!m) fail(400, 'bad_mission');
  if (m.claimed || m.progress < m.goal) fail(409, 'not_ready');
  m.claimed = true; grant(p, m.reward);
  return { reward: m.reward };
}
function chestClaim(p) {
  refreshDaily(p);
  if (p.chest_claimed || !p.missions.every((m) => m.claimed)) fail(409, 'not_ready');
  p.chest_claimed = 1; grant(p, ECONOMY.missions.chest);
  return { reward: ECONOMY.missions.chest };
}
function vipClaim(p) {
  const today = dayKey();
  if (!isVip(p) || p.vip_last_daily === today) fail(409, 'not_ready');
  p.vip_last_daily = today;
  const prop = ['reorder', 'bay', 'vip'][crypto.randomInt(3)];
  grant(p, { coins: ECONOMY.vipDailyCoins, prop, n: 1 });
  return { coins: ECONOMY.vipDailyCoins, prop };
}

/* ---------------- shop ---------------- */
function purchase(p, { productId, provider, receipt }) {
  const prod = product(productId);
  if (!prod) fail(400, 'bad_product');
  if (prod.oneTime && p.one_time.includes(prod.id)) fail(409, 'already_owned');
  if (prod.unlockLevel && p.best_level + 1 < prod.unlockLevel) fail(403, 'locked');
  if (provider === 'mock') {
    if (process.env.ALLOW_MOCK_PURCHASE === '0') fail(403, 'mock_disabled');
  } else if (provider === 'google' || provider === 'apple') {
    // TODO: verify `receipt` with Google Play Developer API / App Store Server API here.
    fail(501, 'store_verification_not_configured');
  } else fail(400, 'bad_provider');
  grant(p, prod.grant);
  if (prod.oneTime) p.one_time.push(prod.id);
  p.spent_cents += prod.cents;
  q('INSERT INTO purchases(player_id,product_id,cents,provider,ts,day) VALUES(?,?,?,?,?,?)').run(p.id, prod.id, prod.cents, provider, Date.now(), dayKey());
  return { productId: prod.id };
}

/* ---------------- leaderboard ---------------- */
function leaderboard(p) {
  const top = q('SELECT id,name,best_level,stars FROM players WHERE best_level>0 ORDER BY best_level DESC, stars DESC, id ASC LIMIT 25').all();
  const me = q('SELECT COUNT(*)+1 AS r FROM players WHERE best_level > ? OR (best_level = ? AND stars > ?)').get(p.best_level, p.best_level, p.stars).r;
  return { top: top.map((r, i) => ({ rank: i + 1, id: r.id, name: r.name, level: r.best_level, stars: r.stars, me: r.id === p.id })), me: { rank: me, level: p.best_level, stars: p.stars } };
}

function publicConfig() {
  return {
    ...ECONOMY,
    levelRewardSample: [1, 10, 25, 50, 100].map((n) => ({ n, c: ECONOMY.levelReward(n, 2, false) })),
    districts: E.DISTRICTS.map((d) => ({ id: d.id, from: d.from, to: d.to === Infinity ? null : d.to, name: d.name })),
  };
}

module.exports = {
  ApiError, fail, getLevel, register, loadByToken, load, save, profile, startLevel, useProp, buyProp, finishLevel,
  adStart, adComplete, adFail, interstitialCheck, dailyClaim, spin, supplyClaim, missionClaim, chestClaim, vipClaim,
  purchase, leaderboard, publicConfig, isVip, noAds, refreshDaily,
};
