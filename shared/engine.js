/*!
 * Nova Transit – shared rules engine + procedural level generator.
 * Runs unchanged in the browser (window.NovaEngine) and in Node (require).
 * Deterministic: the same level number always produces the same level.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NovaEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // up, right, down, left

  /* ------------------------------------------------------------------ */
  /* Story / district table (also used by the client for the meta-map)    */
  /* ------------------------------------------------------------------ */
  const DISTRICTS = [
    { id: 'harbor',  from: 1,   to: 14,       name: { tr: 'Liman Işıkları',  en: 'Harbor Lights' } },
    { id: 'oldtown', from: 15,  to: 34,       name: { tr: 'Eski Şehir',       en: 'Old Town' } },
    { id: 'neon',    from: 35,  to: 59,       name: { tr: 'Neon Çarşı',       en: 'Neon Quarter' } },
    { id: 'gardens', from: 60,  to: 89,       name: { tr: 'Kristal Bahçeler', en: 'Crystal Gardens' } },
    { id: 'orbit',   from: 90,  to: 129,      name: { tr: 'Yörünge İstasyonu',en: 'Orbit Station' } },
    { id: 'aurora',  from: 130, to: Infinity, name: { tr: 'Aurora Çekirdeği', en: 'Aurora Core' } },
  ];
  function districtOf(n) {
    for (let i = 0; i < DISTRICTS.length; i++) if (n >= DISTRICTS[i].from && n <= DISTRICTS[i].to) return i;
    return DISTRICTS.length - 1;
  }

  /* ------------------------------------------------------------------ */
  /* RNG                                                                  */
  /* ------------------------------------------------------------------ */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(arr, rnd) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  /* ------------------------------------------------------------------ */
  /* Difficulty curve                                                     */
  /* ------------------------------------------------------------------ */
  function paramsFor(n) {
    const phase = n % 10;                       // saw-tooth: 4,5 are breathers, 0 is a "boss"
    const relax = phase === 4 || phase === 5;
    const hard = phase === 0 && n >= 10;
    const colors = Math.min(7, 3 + Math.floor((n - 1) / 11));
    let pods = Math.min(40, 6 + Math.floor(n * 0.5));
    if (relax) pods = Math.max(6, pods - 3);
    if (hard) pods = Math.min(44, pods + 3);
    const w = Math.min(6, 4 + Math.floor(n / 22));
    const h = Math.max(4, Math.min(9, Math.ceil((pods * 1.55) / w)));
    const bays = 5;
    // seat mix
    const big = n < 5 ? 0 : Math.min(0.55, 0.1 + n * 0.008);
    const mystery = n < 10 ? 0 : Math.min(0.26, (n - 8) * 0.011) * (relax ? 0.5 : 1);
    const lock = n < 20 ? 0 : Math.min(0.18, (n - 18) * 0.006) * (relax ? 0.5 : 1);
    let window = n < 3 ? 0 : Math.min(8, 1 + Math.floor(n / 9));
    if (relax) window = Math.floor(window * 0.5);
    if (hard) window = Math.min(10, Math.ceil(window * 1.25));
    return { n, colors, pods, w, h, bays, big, mystery, lock, window, relax, hard, district: districtOf(n) };
  }

  /* ------------------------------------------------------------------ */
  /* Game state machine                                                   */
  /* ------------------------------------------------------------------ */
  class Game {
    constructor(level) { this.level = level; this.reset(); }

    reset() {
      const L = this.level;
      this.w = L.w; this.h = L.h;
      this.pods = L.pods.map((p) => Object.assign({ state: 'board', filled: 0, bay: -1, revealed: p.kind !== 'mystery' }, p, { lock: p.lock || 0 }));
      this.grid = Array.from({ length: this.h }, () => Array(this.w).fill(-1));
      for (const p of this.pods) this.grid[p.y][p.x] = p.id;
      this.lanes = L.lanes.map((l) => l.slice());
      this.bays = Array(L.bays).fill(null);
      this.turn = 0; this.taps = 0; this.peak = 0; this.delivered = 0; this.byColor = {};
      this.propsUsed = 0; this.extraBays = 0; this.nextVip = 1000;
      this._reveal();
    }

    clone() {
      const g = Object.create(Game.prototype);
      g.level = this.level; g.w = this.w; g.h = this.h;
      g.pods = this.pods.map((p) => Object.assign({}, p));
      g.grid = this.grid.map((r) => r.slice());
      g.lanes = this.lanes.map((l) => l.slice());
      g.bays = this.bays.slice();
      g.turn = this.turn; g.taps = this.taps; g.peak = this.peak; g.delivered = this.delivered; g.byColor = Object.assign({}, this.byColor);
      g.propsUsed = this.propsUsed; g.extraBays = this.extraBays; g.nextVip = this.nextVip;
      return g;
    }

    pod(id) { return this.pods.find((p) => p.id === id); }

    rayClear(p) {
      const [dx, dy] = DIRS[p.dir];
      let x = p.x + dx, y = p.y + dy;
      while (x >= 0 && y >= 0 && x < this.w && y < this.h) {
        if (this.grid[y][x] !== -1) return false;
        x += dx; y += dy;
      }
      return true;
    }
    blocker(p) {
      const [dx, dy] = DIRS[p.dir];
      let x = p.x + dx, y = p.y + dy;
      while (x >= 0 && y >= 0 && x < this.w && y < this.h) {
        if (this.grid[y][x] !== -1) return this.grid[y][x];
        x += dx; y += dy;
      }
      return -1;
    }
    canExit(p) { return p.state === 'board' && !(p.kind === 'lock' && p.lock > 0) && this.rayClear(p); }
    freeBay() { return this.bays.indexOf(null); }
    exitable() { return this.pods.filter((p) => this.canExit(p)); }
    occupied() { return this.bays.filter((b) => b !== null).length; }

    _reveal() {
      const out = [];
      for (const p of this.pods) {
        if (p.kind === 'mystery' && !p.revealed && p.state === 'board' && this.rayClear(p)) { p.revealed = true; out.push(p.id); }
      }
      return out;
    }

    /** Player taps a pod on the board. */
    tap(id) {
      const p = this.pod(id);
      if (!p || p.state !== 'board') return { ok: false, reason: 'invalid' };
      if (p.kind === 'lock' && p.lock > 0) return { ok: false, reason: 'locked' };
      if (!this.rayClear(p)) return { ok: false, reason: 'blocked', by: this.blocker(p) };
      const bay = this.freeBay();
      if (bay < 0) return { ok: false, reason: 'full' };
      this.grid[p.y][p.x] = -1;
      p.state = 'bay'; p.bay = bay; this.bays[bay] = p.id;
      this.taps++;
      this.peak = Math.max(this.peak, this.occupied());
      const unlocked = [];
      for (const q of this.pods) if (q.kind === 'lock' && q.lock > 0 && q.state === 'board') { q.lock--; if (q.lock === 0) unlocked.push(q.id); }
      const revealed = this._reveal();
      return { ok: true, bay, revealed, unlocked };
    }

    /** Next possible boarding (does it). Returns null when nothing can board. */
    board() {
      for (let k = 0; k < 2; k++) {
        const l = (this.turn + k) % 2;
        const lane = this.lanes[l];
        if (!lane.length) continue;
        const c = lane[0];
        let best = null;
        for (const bid of this.bays) {
          if (bid === null) continue;
          const p = this.pod(bid);
          if (p.filled >= p.cap) continue;
          if (!(p.vip || p.color === c)) continue;
          if (!best || p.filled > best.filled) best = p;
        }
        if (!best) continue;
        lane.shift();
        best.filled++; this.delivered++; this.byColor[c] = (this.byColor[c] || 0) + 1;
        this.turn = (l + 1) % 2;
        const full = best.filled >= best.cap;
        if (full) { best.state = 'gone'; this.bays[best.bay] = null; }
        return { lane: l, color: c, pod: best.id, bay: best.bay, seat: best.filled - 1, full, vip: !!best.vip };
      }
      return null;
    }
    settle() { const ev = []; let e; while ((e = this.board())) ev.push(e); return ev; }

    remaining() { return this.lanes[0].length + this.lanes[1].length; }
    status() {
      if (this.remaining() === 0) return 'win';
      if (this._canBoard()) return 'play';
      if (this.freeBay() >= 0 && this.exitable().length) return 'play';
      return 'lose';
    }
    _canBoard() {
      for (let l = 0; l < 2; l++) {
        const c = this.lanes[l][0];
        if (c === undefined) continue;
        for (const bid of this.bays) {
          if (bid === null) continue;
          const p = this.pod(bid);
          if (p.filled < p.cap && (p.vip || p.color === c)) return true;
        }
      }
      return false;
    }
    stars() {
      const B = this.level.bays + this.extraBays;
      let s = this.peak <= B - 2 ? 3 : this.peak <= B - 1 ? 2 : 1;
      if (this.propsUsed > 0) s = Math.max(1, s - 1);
      return s;
    }

    /* ----- power-ups ----- */
    /** Re-order the first 10 passengers of each lane so wanted colours come first. */
    useReorder() {
      const want = {};
      for (const bid of this.bays) { if (bid === null) continue; const p = this.pod(bid); if (!p.vip) want[p.color] = (want[p.color] || 0) + (p.cap - p.filled); }
      let changed = false;
      for (const lane of this.lanes) {
        const head = lane.slice(0, 10), tail = lane.slice(10);
        const w = Object.assign({}, want);
        const good = [], rest = [];
        for (const c of head) { if (w[c] > 0) { w[c]--; good.push(c); } else rest.push(c); }
        const nh = good.concat(rest);
        if (nh.some((c, i) => c !== head[i])) changed = true;
        lane.length = 0; lane.push(...nh, ...tail);
      }
      if (changed) this.propsUsed++;
      return changed;
    }
    useExtraBay() { if (this.extraBays >= 2) return false; this.bays.push(null); this.extraBays++; this.propsUsed++; return true; }
    useVip() {
      const bay = this.freeBay(); if (bay < 0) return null;
      const p = { id: this.nextVip++, x: -1, y: -1, dir: 0, color: -1, cap: 4, kind: 'vip', vip: true, state: 'bay', filled: 0, bay, revealed: true, lock: 0 };
      this.pods.push(p); this.bays[bay] = p.id; this.propsUsed++;
      this.peak = Math.max(this.peak, this.occupied());
      return p;
    }
    /** After a lost run: free a bay and grant one extra, so the player can continue. */
    revive() {
      // give two extra bays temporarily and reshuffle front of lanes towards needs
      this.bays.push(null);
      this.extraBays++;
      this.useReorder();
      this.propsUsed++;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Solver (DFS with memo) – used to guarantee solvable levels           */
  /* ------------------------------------------------------------------ */
  function stateKey(g) {
    let k = '';
    for (const p of g.pods) k += p.state === 'board' ? (p.kind === 'lock' ? 'l' + p.lock : 'b') : (p.state === 'bay' ? 'y' + p.filled : 'g');
    return k + '|' + g.lanes[0].length + ',' + g.lanes[1].length + '|' + g.bays.map((b) => (b === null ? '-' : b)).join(',') + g.turn;
  }
  function heuristicOrder(g, cands) {
    const fronts = [g.lanes[0][0], g.lanes[1][0]];
    const soon = new Set(); for (let l = 0; l < 2; l++) for (let i = 0; i < 4; i++) if (g.lanes[l][i] !== undefined) soon.add(g.lanes[l][i]);
    return cands.map((p) => ({ p, s: (fronts.includes(p.color) ? 10 : 0) + (soon.has(p.color) ? 3 : 0) + p.cap * 0.01 })).sort((a, b) => b.s - a.s).map((x) => x.p);
  }
  function solve(level, opts) { return solveFrom(new Game(level), opts); }
  function solveFrom(startGame, opts) {
    const maxNodes = (opts && opts.maxNodes) || 20000;
    const root = startGame.clone();
    const seen = new Set(); let nodes = 0;
    function dfs(g, path) {
      if (nodes++ > maxNodes) return null;
      g.settle();
      const st = g.status();
      if (st === 'win') return path;
      if (st === 'lose') return null;
      const key = stateKey(g);
      if (seen.has(key)) return null;
      seen.add(key);
      if (g.freeBay() < 0) return null;
      for (const p of heuristicOrder(g, g.exitable())) {
        const c = g.clone();
        c.tap(p.id);
        const r = dfs(c, path.concat(p.id));
        if (r) return r;
        if (nodes > maxNodes) return null;
      }
      return null;
    }
    return dfs(root, []);
  }

  /** Fast validity proof: tap pods strictly in the generator's removal order (`ord`). */
  function followOrder(level) {
    const g = new Game(level);
    const order = level.pods.slice().sort((a, b) => a.ord - b.ord).map((p) => p.id);
    let i = 0;
    for (let guard = 0; guard < 2000; guard++) {
      g.settle();
      if (g.status() === 'win') return order.slice(0, i);
      if (i < order.length && g.freeBay() >= 0) {
        const r = g.tap(order[i]);
        if (!r.ok) return null;
        i++;
      } else {
        return null;
      }
    }
    return null;
  }

  /* ------------------------------------------------------------------ */
  /* Level generator                                                      */
  /* ------------------------------------------------------------------ */
  function generateLevel(n) {
    const P = paramsFor(n);
    const rnd = mulberry32(n * 7919 + 104729);
    const W = P.w, H = P.h;
    const cells = []; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) cells.push([x, y]);

    // 1. place pods in REVERSE removal order so a valid removal order always exists
    const placed = []; // in reverse removal order
    const occ = Array.from({ length: H }, () => Array(W).fill(false));
    const target = Math.min(P.pods, cells.length - 2);
    function rayEmpty(x, y, d) {
      let cx = x + DIRS[d][0], cy = y + DIRS[d][1];
      while (cx >= 0 && cy >= 0 && cx < W && cy < H) { if (occ[cy][cx]) return false; cx += DIRS[d][0]; cy += DIRS[d][1]; }
      return true;
    }
    const order = shuffle(cells.slice(), rnd);
    for (const [x, y] of order) {
      if (placed.length >= target) break;
      const ds = shuffle([0, 1, 2, 3], rnd).filter((d) => rayEmpty(x, y, d));
      if (!ds.length) continue;
      // bias towards the nearest edge (reads naturally on screen)
      const near = (d) => (d === 0 ? y : d === 2 ? H - 1 - y : d === 3 ? x : W - 1 - x);
      ds.sort((a, b) => near(a) - near(b) + (rnd() - 0.5) * 2.2);
      occ[y][x] = true;
      placed.push({ x, y, dir: ds[0] });
    }
    const removal = placed.slice().reverse();         // removal[0] leaves first

    // 2. attributes
    const nPods = removal.length;
    const colorBag = [];
    for (let i = 0; i < nPods; i++) colorBag.push(i % P.colors);
    shuffle(colorBag, rnd);
    const pods = removal.map((r, i) => {
      const bigRoll = rnd();
      const cap = n < 5 ? 3 : bigRoll < P.big * 0.35 ? 6 : bigRoll < P.big ? 4 : 3;
      let kind = 'normal', lock = 0;
      if (i > 3) {
        const r2 = rnd();
        if (r2 < P.lock) { kind = 'lock'; lock = 1 + Math.floor(rnd() * Math.min(3, i - 1)); }
        else if (r2 < P.lock + P.mystery) kind = 'mystery';
      }
      return { id: 0, x: r.x, y: r.y, dir: r.dir, color: colorBag[i], cap, kind, lock, ord: i };
    });
    // ids by board position (do not leak the solution order)
    pods.slice().sort((a, b) => a.y * 16 + a.x - (b.y * 16 + b.x)).forEach((p, i) => { p.id = i; });

    // 3. passenger sequence in solution order, then locally shuffled by `window`
    const seq = [];
    for (const p of pods) for (let k = 0; k < p.cap; k++) seq.push(p.color);
    let win = P.window, lanes, ok = false, level;
    while (true) {
      const s = seq.slice();
      if (win >= 2) {
        const r2 = mulberry32(n * 31337 + win);
        for (let off of [0, Math.floor(win / 2)]) {
          for (let i = off; i < s.length; i += win) {
            const part = s.slice(i, Math.min(s.length, i + win));
            shuffle(part, r2);
            for (let j = 0; j < part.length; j++) s[i + j] = part[j];
          }
        }
      }
      lanes = [[], []];
      s.forEach((c, i) => lanes[i % 2].push(c));
      level = {
        n, seed: n * 7919 + 104729, w: W, h: H, bays: P.bays, colors: P.colors,
        district: P.district, hard: P.hard, relax: P.relax, window: win,
        pods: pods.map((p) => ({ id: p.id, x: p.x, y: p.y, dir: p.dir, color: p.color, cap: p.cap, kind: p.kind, lock: p.lock, ord: p.ord })),
        lanes,
      };
      if (win < 2) { ok = true; break; }
      if (followOrder(level)) { ok = true; break; }
      win -= 1;
    }
    level.solvable = ok;
    level.total = seq.length;
    return level;
  }

  /** Server-side verification: re-play a recorded action list on a fresh game. */
  function replay(level, actions) {
    const g = new Game(level);
    const used = { reorder: 0, bay: 0, vip: 0, revive: 0, hint: 0 };
    if (!Array.isArray(actions) || actions.length > 600) return { error: 'bad_actions' };
    for (const a of actions) {
      if (!a || typeof a.t !== 'string') return { error: 'bad_actions' };
      if (a.t === 'tap') { if (!g.tap(a.id | 0).ok) return { error: 'illegal_tap' }; }
      else if (a.t === 'reorder') { g.useReorder(); used.reorder++; }
      else if (a.t === 'bay') { if (!g.useExtraBay()) return { error: 'illegal_prop' }; used.bay++; }
      else if (a.t === 'vip') { if (!g.useVip()) return { error: 'illegal_prop' }; used.vip++; }
      else if (a.t === 'revive') { g.revive(); used.revive++; }
      else if (a.t === 'hint') { used.hint++; continue; }
      else return { error: 'bad_actions' };
      g.settle();
    }
    return { game: g, status: g.status(), used };
  }

  /* ------------------------------------------------------------------ */
  /* Greedy / random bots – used by tests and the load simulator          */
  /* ------------------------------------------------------------------ */
  /** Rough model of a thoughtful player: serve the colours the queue needs soonest, unblock others, avoid duplicating colours already waiting. */
  function humanPick(g, ex, rnd) {
    if (rnd() < 0.08) return ex[Math.floor(rnd() * ex.length)];
    const first = {};
    for (let i = 0; i < 12; i++) for (let l = 0; l < 2; l++) { const c = g.lanes[l][i]; if (c !== undefined && first[c] === undefined) first[c] = i; }
    const open = {};
    for (const bid of g.bays) { if (bid === null) continue; const q = g.pod(bid); open[q.color] = (open[q.color] || 0) + q.cap - q.filled; }
    let best = null, bs = -1e9;
    for (const p of ex) {
      const f = first[p.color] === undefined ? 14 : first[p.color];
      let unblock = 0; for (const q of g.pods) if (q.state === 'board' && q.id !== p.id && g.blocker(q) === p.id) unblock++;
      const dup = open[p.color] > 0 ? 6 : 0;
      const sc = -f - dup + unblock * 1.2 + (p.cap > 3 ? 0.3 : 0);
      if (sc > bs) { bs = sc; best = p; }
    }
    return best;
  }
  function playBot(level, mode, rnd) {
    const g = new Game(level);
    rnd = rnd || Math.random;
    for (let guard = 0; guard < 500; guard++) {
      g.settle();
      const st = g.status();
      if (st !== 'play') return { result: st, game: g };
      const ex = g.exitable();
      if (!ex.length || g.freeBay() < 0) return { result: 'lose', game: g };
      let pick;
      if (mode === 'random') pick = ex[Math.floor(rnd() * ex.length)];
      else if (mode === 'noisy') pick = rnd() < 0.2 ? ex[Math.floor(rnd() * ex.length)] : heuristicOrder(g, ex)[0];
      else if (mode === 'human') pick = humanPick(g, ex, rnd);
      else pick = heuristicOrder(g, ex)[0];
      g.tap(pick.id);
    }
    return { result: 'lose', game: g };
  }

  return { DIRS, DISTRICTS, districtOf, paramsFor, Game, solve, solveFrom, followOrder, replay, generateLevel, playBot, mulberry32 };
});
