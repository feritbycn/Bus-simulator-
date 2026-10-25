const { q, dayKey } = require('./db');
const live = require('./live');
const { ECONOMY } = require('./economy');

const dayStart = (d) => Date.parse(d + 'T00:00:00Z');
const addDays = (d, n) => dayKey(dayStart(d) + n * 864e5);
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);

function distinctDau(from, to) { return q('SELECT COUNT(DISTINCT player_id) c FROM sessions WHERE day>=? AND day<=?').get(from, to).c; }

function retention(today) {
  const out = [];
  for (let i = 1; i <= 8; i++) {
    const day = addDays(today, -i);
    const cohort = q('SELECT id FROM players WHERE created_at>=? AND created_at<?').all(dayStart(day), dayStart(day) + 864e5).map((r) => r.id);
    const row = { day, size: cohort.length, d1: null, d3: null, d7: null };
    if (cohort.length) {
      const back = (n) => {
        if (addDays(day, n) > today) return null;
        const d = addDays(day, n);
        const c = q(`SELECT COUNT(DISTINCT player_id) c FROM sessions WHERE day=? AND player_id IN (SELECT id FROM players WHERE created_at>=? AND created_at<?)`).get(d, dayStart(day), dayStart(day) + 864e5).c;
        return pct(c, cohort.length);
      };
      row.d1 = back(1); row.d3 = back(3); row.d7 = back(7);
    }
    out.push(row);
  }
  return out;
}

function overview() {
  const now = Date.now(), today = dayKey(now), yesterday = addDays(today, -1);
  const t0 = dayStart(today);
  const lv = live.snapshot();

  const dau = distinctDau(today, today), dauY = distinctDau(yesterday, yesterday);
  const wau = distinctDau(addDays(today, -6), today), mau = distinctDau(addDays(today, -29), today);
  const total = q('SELECT COUNT(*) c FROM players').get().c;
  const newToday = q('SELECT COUNT(*) c FROM players WHERE created_at>=?').get(t0).c;
  const newYesterday = q('SELECT COUNT(*) c FROM players WHERE created_at>=? AND created_at<?').get(t0 - 864e5, t0).c;
  const sess = q('SELECT COUNT(*) c, AVG(last_ping-start) a FROM sessions WHERE day=?').get(today);
  const runs = q("SELECT COUNT(*) c, SUM(result='win') w, SUM(result='lose') l, SUM(result='quit') qq, SUM(result='invalid') inv FROM runs WHERE day=?").get(today);
  const ads = q('SELECT placement, status, COUNT(*) c FROM ad_events WHERE day=? GROUP BY placement,status').all(today);
  const adAgg = { rewardedStarted: 0, rewardedDone: 0, interstitials: 0, byPlacement: {} };
  for (const r of ads) {
    if (r.placement === 'interstitial') { adAgg.interstitials += r.c; continue; }
    adAgg.rewardedStarted += r.c; if (r.status === 'done') adAgg.rewardedDone += r.c;
    const b = adAgg.byPlacement[r.placement] || (adAgg.byPlacement[r.placement] = { started: 0, done: 0 }); b.started += r.c; if (r.status === 'done') b.done += r.c;
  }
  const impressions = adAgg.rewardedDone + adAgg.interstitials;
  const adRevToday = Math.round((impressions * ECONOMY.ad.ecpmUsd) / 1000 * 100); // cents (estimate)
  const rev = (from) => q('SELECT COALESCE(SUM(cents),0) s, COUNT(*) c FROM purchases WHERE day>=?').get(from);
  const revToday = rev(today), rev7 = rev(addDays(today, -6)), rev30 = rev(addDays(today, -29));
  const revTotal = q('SELECT COALESCE(SUM(cents),0) s, COUNT(*) c, COUNT(DISTINCT player_id) p FROM purchases').get();
  const byProduct = q('SELECT product_id id, COUNT(*) c, SUM(cents) s FROM purchases GROUP BY product_id ORDER BY s DESC').all();

  const maxLevel = q('SELECT COALESCE(MAX(best_level),0) m FROM players').get().m;
  const buckets = q('SELECT CASE WHEN level<=5 THEN 1 WHEN level<=15 THEN 2 WHEN level<=35 THEN 3 WHEN level<=60 THEN 4 WHEN level<=100 THEN 5 ELSE 6 END b, COUNT(*) c FROM players GROUP BY b').all();
  const labels = ['1-5', '6-15', '16-35', '36-60', '61-100', '100+'];
  const levelDist = labels.map((l, i) => ({ label: l, count: (buckets.find((x) => x.b === i + 1) || { c: 0 }).c }));
  const hardest = q(`SELECT level, COUNT(*) plays, SUM(result='win') wins, SUM(result IN ('lose','quit')) fails, AVG(duration_ms) avg_ms FROM runs WHERE result IN ('win','lose','quit') GROUP BY level HAVING plays>=5 ORDER BY (1.0*SUM(result IN ('lose','quit'))/COUNT(*)) DESC, plays DESC LIMIT 10`).all()
    .map((r) => ({ level: r.level, plays: r.plays, winRate: pct(r.wins, r.plays), avgSec: Math.round((r.avg_ms || 0) / 1000) }));
  const countries = q("SELECT CASE WHEN country='' THEN '??' ELSE country END c, COUNT(*) n FROM players GROUP BY c ORDER BY n DESC LIMIT 8").all();
  const platforms = q('SELECT platform p, COUNT(*) n FROM players GROUP BY platform ORDER BY n DESC').all();
  const langs = q('SELECT lang l, COUNT(*) n FROM players GROUP BY lang ORDER BY n DESC').all();

  // 14-day series
  const series = [];
  for (let i = 13; i >= 0; i--) {
    const d = addDays(today, -i);
    series.push({
      day: d,
      dau: distinctDau(d, d),
      new: q('SELECT COUNT(*) c FROM players WHERE created_at>=? AND created_at<?').get(dayStart(d), dayStart(d) + 864e5).c,
      runs: q('SELECT COUNT(*) c FROM runs WHERE day=?').get(d).c,
      cents: q('SELECT COALESCE(SUM(cents),0) s FROM purchases WHERE day=?').get(d).s,
      ads: q("SELECT COUNT(*) c FROM ad_events WHERE day=? AND status='done'").get(d).c,
    });
  }
  // hourly concurrent (last 24h) from minute samples
  const since = now - 24 * 3600e3;
  const hourly = q('SELECT (ts/3600000) h, MAX(online) maxo, CAST(AVG(online) AS INTEGER) avgo, MAX(playing) maxp FROM metrics_minute WHERE ts>=? GROUP BY h ORDER BY h').all(since)
    .map((r) => ({ ts: r.h * 3600000, max: r.maxo, avg: r.avgo, playing: r.maxp }));
  const peak24 = hourly.reduce((m, r) => Math.max(m, r.max), 0);

  return {
    now, today,
    live: lv,
    users: { total, dau, dauYesterday: dauY, wau, mau, newToday, newYesterday, stickiness: pct(dau, mau) },
    sessions: { today: sess.c, avgMin: Math.round(((sess.a || 0) / 60000) * 10) / 10, perDau: dau ? Math.round((sess.c / dau) * 10) / 10 : 0 },
    gameplay: { runsToday: runs.c, wins: runs.w || 0, losses: runs.l || 0, quits: runs.qq || 0, invalid: runs.inv || 0, winRate: pct(runs.w || 0, runs.c), maxLevel },
    ads: { ...adAgg, completionRate: pct(adAgg.rewardedDone, adAgg.rewardedStarted), estRevenueCents: adRevToday, ecpm: ECONOMY.ad.ecpmUsd },
    revenue: { todayCents: revToday.s, today7: rev7.s, today30: rev30.s, totalCents: revTotal.s, orders: revTotal.c, payers: revTotal.p, ordersToday: revToday.c,
      conversion: pct(revTotal.p, total), arpdauCents: dau ? Math.round((revToday.s + adRevToday) / dau) : 0, byProduct },
    retention: retention(today),
    levelDist, hardest, countries, platforms, langs, series, hourly, peak24,
    ring: live.recentRing().slice(-120),
    liveList: live.liveList(25),
  };
}

let cache = { t: 0, v: null };
function overviewCached(ttl = 8000) {
  if (!cache.v || Date.now() - cache.t > ttl) { cache = { t: Date.now(), v: overview() }; }
  return Object.assign({}, cache.v, { live: live.snapshot(), ring: live.recentRing().slice(-120), liveList: live.liveList(25) });
}

function recentPlayers(limit = 50) {
  return q('SELECT id,name,lang,platform,country,level,best_level,coins,stars,spent_cents,created_at,last_seen,flags FROM players ORDER BY last_seen DESC LIMIT ?').all(limit);
}
module.exports = { overview, overviewCached, recentPlayers };
