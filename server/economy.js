/* All tunable economy numbers live here. Sent to the client via /api/config. */
const E = require('../shared/engine.js');

const ECONOMY = {
  startCoins: 250,
  startProps: { reorder: 2, bay: 1, vip: 1, hint: 2 },
  propPrice: { reorder: 150, bay: 200, vip: 300, hint: 60 },
  rewardedDailyCap: 24,            // max completed rewarded ads / player / day
  interstitial: { fromLevel: 8, everyWins: 3, minGapSec: 90 },
  ad: {
    minWatchMs: 4000,              // server rejects completions faster than this
    ecpmUsd: 12,                   // only used for the *estimated* ad revenue in the admin panel
    placements: {
      double_reward: {},           // x2 level reward
      revive:        {},           // continue after a loss
      free_prop:     { cap: 6 },
      supply:        { cooldownSec: 1800 },
      spin:          { cap: 3 },
      hint:          {},
    },
  },
  supply: { coins: 40, adMultiplier: 3, cooldownSec: 1800 },
  daily: [                         // 7-day login calendar
    { coins: 100 }, { prop: 'reorder', n: 1 }, { coins: 200 }, { prop: 'bay', n: 1 },
    { coins: 300 }, { prop: 'vip', n: 1 }, { coins: 800, prop2: 'reorder', n2: 2 },
  ],
  spin: {
    freeEverySec: 86400,
    slices: [
      { id: 0, coins: 50,   w: 24 }, { id: 1, coins: 100, w: 22 }, { id: 2, prop: 'reorder', n: 1, w: 14 },
      { id: 3, coins: 200,  w: 14 }, { id: 4, prop: 'bay', n: 1, w: 9 }, { id: 5, coins: 500, w: 7 },
      { id: 6, prop: 'vip', n: 1, w: 7 }, { id: 7, coins: 1500, w: 3 },
    ],
  },
  levelReward: (n, stars, hard) => Math.round((40 + Math.min(60, Math.floor(n / 2)) + 10 * (stars - 1)) * (hard ? 1.5 : 1)),
  vipDailyCoins: 250,
  missions: {
    templates: [
      { id: 'deliver', goal: [40, 60, 90], reward: { coins: 120 } },
      { id: 'wins',    goal: [2, 3, 4],    reward: { coins: 150 } },
      { id: 'stars3',  goal: [1, 2],       reward: { prop: 'reorder', n: 1 } },
      { id: 'deliverColor', goal: [18, 24], reward: { coins: 100 } },
      { id: 'noprops', goal: [1, 2],       reward: { prop: 'bay', n: 1 } },
    ],
    chest: { coins: 300, prop: 'vip', n: 1 },
  },
  // price in USD cents. `grant` is applied server-side after a (verified) purchase.
  products: [
    { id: 'coins_s',   cents: 99,   grant: { coins: 1200 },  title: { tr: 'Küçük Para Paketi', en: 'Small Coin Pack' } },
    { id: 'coins_m',   cents: 299,  grant: { coins: 4000 },  title: { tr: 'Orta Para Paketi',  en: 'Medium Coin Pack' }, badge: 'popular' },
    { id: 'coins_l',   cents: 499,  grant: { coins: 7500 },  title: { tr: 'Büyük Para Paketi', en: 'Large Coin Pack' }, badge: 'value' },
    { id: 'coins_xl',  cents: 999,  grant: { coins: 18000 }, title: { tr: 'Mega Para Paketi',  en: 'Mega Coin Pack' } },
    { id: 'starter',   cents: 199,  grant: { coins: 1500, props: { reorder: 3, bay: 3, vip: 3 } }, oneTime: true, unlockLevel: 3, title: { tr: 'Başlangıç Paketi', en: 'Starter Bundle' }, badge: 'once' },
    { id: 'pro',       cents: 499,  grant: { coins: 6000, props: { reorder: 6, bay: 5, vip: 5 } }, unlockLevel: 12, title: { tr: 'Pro Paketi', en: 'Pro Bundle' } },
    { id: 'adfree',    cents: 399,  grant: { adFree: true },  title: { tr: 'Reklamsız', en: 'Ad-Free' }, desc: { tr: 'Tüm zorunlu reklamlar kalkar. Ödüllü videolar isteğe bağlı kalır.', en: 'Removes all forced ads. Rewarded videos stay optional.' } },
    { id: 'plus7',     cents: 299,  grant: { vipDays: 7 },   title: { tr: 'Nova+ 7 Gün', en: 'Nova+ 7 days' }, desc: { tr: 'Günlük 250 jeton + reklamsız + her bölümde ekstra park yeri', en: 'Daily 250 coins + ad-free + a free extra bay each level' } },
    { id: 'plus30',    cents: 799,  grant: { vipDays: 30 },  title: { tr: 'Nova+ 30 Gün', en: 'Nova+ 30 days' }, badge: 'value', desc: { tr: 'Günlük 250 jeton + reklamsız + her bölümde ekstra park yeri', en: 'Daily 250 coins + ad-free + a free extra bay each level' } },
  ],
};

function product(id) { return ECONOMY.products.find((p) => p.id === id); }

function weightedPick(slices, rnd) {
  const tot = slices.reduce((a, s) => a + s.w, 0);
  let r = rnd() * tot;
  for (const s of slices) { r -= s.w; if (r <= 0) return s; }
  return slices[0];
}

/** deterministic daily missions per player + UTC day */
function missionsFor(playerId, dayKey) {
  const rnd = E.mulberry32(Number(playerId) * 977 + Number(dayKey.replace(/-/g, '')));
  const pool = ECONOMY.missions.templates.slice();
  const picked = [];
  while (picked.length < 3) {
    const t = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
    const goal = t.goal[Math.floor(rnd() * t.goal.length)];
    const m = { id: t.id, goal, progress: 0, claimed: false, reward: t.reward };
    if (t.id === 'deliverColor') m.color = Math.floor(rnd() * 4);
    picked.push(m);
  }
  return picked;
}

module.exports = { ECONOMY, product, weightedPick, missionsFor };
