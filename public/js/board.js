/* Canvas game view: renders the board, bays, passenger queue and animates the engine's events. */
(function () {
  const E = window.NovaEngine;
  const DIRS = E.DIRS;
  const COLORS = [
    { base: '#ff5a64', light: '#ffa0a6', dark: '#b8283a', sym: 'circle',   key: 'c_coral' },
    { base: '#ffb020', light: '#ffd98a', dark: '#b87100', sym: 'triangle', key: 'c_amber' },
    { base: '#79d93a', light: '#bdf58c', dark: '#3f8f12', sym: 'square',   key: 'c_lime' },
    { base: '#19d3c5', light: '#8cf3ea', dark: '#0a8a86', sym: 'diamond',  key: 'c_aqua' },
    { base: '#3d8bff', light: '#9cc4ff', dark: '#1b4fc4', sym: 'star',     key: 'c_azure' },
    { base: '#9b6bff', light: '#cfb6ff', dark: '#5a34c7', sym: 'hex',      key: 'c_violet' },
    { base: '#ff5ea8', light: '#ffb0d4', dark: '#b81f68', sym: 'plus',     key: 'c_rose' },
  ];
  const SKIN = ['#ffd7b5', '#f0b48a', '#c98b63', '#8d5a3b', '#ffe3c8'];
  const HAIR = ['#2a1647', '#5b3a1e', '#e8c15a', '#c2410c', '#1f2937', '#7c3aed'];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeIn = (t) => t * t;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const frame = () => new Promise((r) => requestAnimationFrame(r));

  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function drawSym(ctx, type, x, y, r, fill) {
    ctx.save(); ctx.translate(x, y); ctx.fillStyle = fill; ctx.beginPath();
    if (type === 'circle') ctx.arc(0, 0, r, 0, 7);
    else if (type === 'triangle') { ctx.moveTo(0, -r); ctx.lineTo(r * 0.95, r * 0.8); ctx.lineTo(-r * 0.95, r * 0.8); ctx.closePath(); }
    else if (type === 'square') { ctx.rect(-r * 0.8, -r * 0.8, r * 1.6, r * 1.6); }
    else if (type === 'diamond') { ctx.moveTo(0, -r); ctx.lineTo(r, 0); ctx.lineTo(0, r); ctx.lineTo(-r, 0); ctx.closePath(); }
    else if (type === 'star') { for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rad = i % 2 ? r * 0.45 : r; ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad); } ctx.closePath(); }
    else if (type === 'hex') { for (let i = 0; i < 6; i++) { const a = (i * Math.PI) / 3; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); }
    else if (type === 'plus') { const k = r * 0.35; ctx.rect(-k, -r, k * 2, r * 2); ctx.rect(-r, -k, r * 2, k * 2); }
    ctx.fill(); ctx.restore();
  }

  /** seat layout in a pod's local frame (pod points up). */
  function seatLayout(n, w, h) {
    const cols = n > 4 ? 3 : 2, rows = Math.ceil(n / cols);
    const pw = w * 0.74, ph = h * 0.48, cy = h * 0.06;
    const out = [];
    for (let i = 0; i < n; i++) {
      const row = Math.floor(i / cols), col = i % cols;
      const inRow = row === rows - 1 ? n - cols * (rows - 1) : cols;
      const x = (col - (inRow - 1) / 2) * (pw / cols);
      const y = rows === 1 ? cy : cy + (row - (rows - 1) / 2) * (ph / rows);
      out.push({ x, y });
    }
    const r = Math.min(pw / cols * 0.4, ph / rows * 0.42);
    return { seats: out, r };
  }

  class GameView {
    constructor(canvas, hooks) {
      this.cv = canvas; this.ctx = canvas.getContext('2d'); this.hooks = hooks || {};
      this.cb = false; this.time = 0; this.paused = false;
      this.parts = []; this.tweens = []; this.flyers = []; this.floaters = [];
      this.evQueue = []; this.running = false; this.endTimer = null;
      this.hintId = -1; this.hintUntil = 0; this.shakeBays = 0;
      this.game = null; this.level = null;
      this._onPtr = (e) => this.pointer(e);
      canvas.addEventListener('pointerdown', this._onPtr);
      this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(canvas);
      this._loop = (t) => { this.update(t); this.draw(); this.raf = requestAnimationFrame(this._loop); };
      this.last = performance.now(); this.raf = requestAnimationFrame(this._loop);
    }
    destroy() { cancelAnimationFrame(this.raf); this.ro.disconnect(); this.cv.removeEventListener('pointerdown', this._onPtr); }

    /* ---------------- level setup ---------------- */
    load(level) {
      this.level = level; this.game = new E.Game(level);
      this.actions = []; this.ended = false; this.evQueue = []; this.running = false; this.parts = []; this.tweens = []; this.flyers = []; this.floaters = [];
      this.hintId = -1; this.streak = 0; this.t0 = performance.now(); this.paused = false;
      clearTimeout(this.endTimer);
      this.podV = {};
      this.slots = Array(level.bays).fill(null);
      for (const p of level.pods) {
        this.podV[p.id] = { id: p.id, color: p.color, cap: p.cap, kind: p.kind, dir: p.dir, gx: p.x, gy: p.y, x: 0, y: 0, rot: p.dir * Math.PI / 2, size: 40, filled: 0, state: 'board', slot: -1, shake: 0, pop: 0, spawn: 0, arrived: false, alpha: 1, flip: 0, vip: false, face: p.dir === 3 ? -1 : 1 };
      }
      this.visLanes = this.game.lanes.map((l) => l.map((c, i) => ({ c, id: Math.random(), x: 0, y: 0, init: false })));
      this.resize(true);
      // intro animation
      let k = 0;
      for (const p of Object.values(this.podV)) { p.spawn = -0.04 * (k++); }
      this.visLanes.forEach((lane) => lane.forEach((it) => { it.x = this.W / 2; it.y = -30; }));
    }

    resize(force) {
      const r = this.cv.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      this.dpr = dpr; this.W = Math.max(200, r.width); this.H = Math.max(200, r.height);
      this.cv.width = Math.round(this.W * dpr); this.cv.height = Math.round(this.H * dpr);
      if (!this.level) return;
      const L = this.level, W = this.W, H = this.H;
      const pad = 8;
      this.platformH = clamp(H * 0.17, 92, 140);
      this.baysH = clamp(H * 0.13, 74, 98);
      const bayN = this.slots.length;
      this.slotW = Math.min(76, (W - 2 * pad) / bayN);
      this.bayY = this.platformH + this.baysH / 2 + 4;
      this.bayPod = Math.min(this.slotW * 0.98, this.baysH * 0.98);
      const top = this.platformH + this.baysH + 16, bh = H - top - 6, bw = W - 2 * pad;
      this.cell = Math.floor(Math.min(bw / L.w, bh / L.h, 96));
      this.bx = Math.round((W - this.cell * L.w) / 2); this.by = Math.round(top + (bh - this.cell * L.h) * 0.18);
      this.laneSp = Math.min(40, (W / 2 - 34) / 6);
    }
    slotX(i) { return this.W / 2 + (i - (this.slots.length - 1) / 2) * this.slotW; }
    cellCenter(gx, gy) { return { x: this.bx + (gx + 0.5) * this.cell, y: this.by + (gy + 0.5) * this.cell }; }
    laneTarget(l, i) { const dir = l === 0 ? -1 : 1; return { x: this.W / 2 + dir * (30 + i * this.laneSp), y: this.platformH * 0.56 }; }

    /* ---------------- input ---------------- */
    pointer(e) {
      if (!this.game || this.paused || this.ended) return;
      const r = this.cv.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      const gx = Math.floor((x - this.bx) / this.cell), gy = Math.floor((y - this.by) / this.cell);
      if (gx < 0 || gy < 0 || gx >= this.level.w || gy >= this.level.h) return;
      const id = this.game.grid[gy][gx];
      if (id === -1) return;
      this.tapPod(id);
    }
    tapPod(id) {
      const g = this.game, pv = this.podV[id];
      const res = g.tap(id);
      if (!res.ok) {
        pv.shake = 1;
        if (res.reason === 'blocked' && res.by >= 0 && this.podV[res.by]) { this.podV[res.by].shake = 1; this.podV[res.by].flash = 1; }
        if (res.reason === 'full') this.shakeBays = 1;
        window.SFX.deny(); this.hooks.onDeny && this.hooks.onDeny(res.reason);
        return false;
      }
      this.actions.push({ t: 'tap', id });
      window.SFX.tap(); window.SFX.whoosh();
      if (this.hintId === id) this.hintId = -1;
      pv.state = 'flying'; pv.arrived = false;
      for (const rid of res.revealed) if (this.podV[rid]) this.podV[rid].flip = 1;
      const evs = g.settle();
      for (const ev of evs) this.evQueue.push({ k: 'board', ...ev });
      this.exitPod(pv);
      this.pump();
      this.hooks.onMove && this.hooks.onMove(this.progress());
      return true;
    }
    progress() { const tot = this.level.total || 1; return clamp(1 - this.game.remaining() / tot, 0, 1); }

    /* ---------------- props ---------------- */
    canUse(name) {
      const g = this.game;
      if (this.ended && name !== 'noop') return false;
      if (name === 'reorder') { const c = g.clone(); return c.useReorder(); }
      if (name === 'bay') return g.extraBays < 2;
      if (name === 'vip') return g.freeBay() >= 0;
      return false;
    }
    applyProp(name) {
      const g = this.game;
      if (name === 'reorder') {
        if (!g.useReorder()) return false;
        this.actions.push({ t: 'reorder' });
        this.evQueue.push({ k: 'reorder', lanes: g.lanes.map((l) => l.slice()) });
      } else if (name === 'bay') {
        if (!g.useExtraBay()) return false;
        this.actions.push({ t: 'bay' });
        this.evQueue.push({ k: 'bay' });
      } else if (name === 'vip') {
        const p = g.useVip(); if (!p) return false;
        this.actions.push({ t: 'vip' });
        this.evQueue.push({ k: 'vip', id: p.id });
      } else return false;
      for (const ev of g.settle()) this.evQueue.push({ k: 'board', ...ev });
      this.ended = false; this.pump(); return true;
    }
    applyRevive() {
      const g = this.game;
      g.revive(); this.actions.push({ t: 'revive' });
      this.evQueue.push({ k: 'bay' });
      this.evQueue.push({ k: 'reorder', lanes: g.lanes.map((l) => l.slice()) });
      for (const ev of g.settle()) this.evQueue.push({ k: 'board', ...ev });
      this.ended = false; this.pump();
    }
    hint() {
      const g = this.game; this.actions.push({ t: 'hint' });
      let id = -1;
      const sol = E.solveFrom(g, { maxNodes: 6000 });
      if (sol && sol.length) id = sol[0];
      else { const ex = g.exitable(); if (ex.length) id = ex[0].id; }
      if (id < 0) return false;
      this.hintId = id; this.hintUntil = performance.now() + 4500; return true;
    }

    /* ---------------- animation helpers ---------------- */
    tween(dur, fn, ease) {
      return new Promise((res) => { this.tweens.push({ t: 0, dur, fn, ease: ease || ((x) => x), res }); });
    }
    burst(x, y, color, n = 10, spd = 120) {
      for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, s = spd * (0.4 + Math.random()); this.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, life: 0.5 + Math.random() * 0.4, t: 0, size: 2 + Math.random() * 3.5, color }); }
    }
    float(text, x, y, color) { this.floaters.push({ text, x, y, t: 0, color: color || '#fff' }); }

    async exitPod(pv) {
      const dir = pv.dir, [dx, dy] = DIRS[dir];
      const c0 = this.cellCenter(pv.gx, pv.gy);
      pv.x = pv.x || c0.x; pv.y = pv.y || c0.y; pv.size = this.cell;
      const L = this.level;
      // exit target: just outside the board in the pod's direction
      let ex = c0.x, ey = c0.y;
      if (dx === 1) ex = this.bx + L.w * this.cell + this.cell * 0.6; if (dx === -1) ex = this.bx - this.cell * 0.6;
      if (dy === -1) ey = this.by - this.cell * 0.5; if (dy === 1) ey = this.by + L.h * this.cell + this.cell * 0.6;
      const dist = Math.hypot(ex - c0.x, ey - c0.y);
      await this.tween(clamp(140 + dist * 0.9, 180, 520), (p) => { pv.x = lerp(c0.x, ex, p); pv.y = lerp(c0.y, ey, p); }, easeIn);
      // wait for a visually free slot
      let slot = -1;
      while (slot < 0) { slot = this.slots.indexOf(null); if (slot < 0) await frame(); }
      this.slots[slot] = pv.id; pv.slot = slot;
      const x0 = pv.x, y0 = pv.y, r0 = pv.rot, s0 = pv.size;
      let rEnd = 0; // shortest rotation to 0
      let d = ((0 - r0) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI; rEnd = r0 + d;
      const cx = (x0 + this.slotX(slot)) / 2, cy = Math.min(y0, this.bayY) - 30;
      await this.tween(380, (p) => {
        const tx = this.slotX(pv.slot), ty = this.bayY;
        const a = (1 - p) * (1 - p), b = 2 * (1 - p) * p, c = p * p;
        pv.x = a * x0 + b * cx + c * tx; pv.y = a * y0 + b * cy + c * ty; pv.rot = lerp(r0, rEnd, p); pv.size = lerp(s0, this.bayPod, p);
      }, easeInOut);
      pv.state = 'bay'; pv.rot = 0; pv.face = 1; pv.arrived = true; pv.pop = 1;
      this.burst(pv.x, pv.y + pv.size * 0.3, COLORS[pv.color >= 0 ? pv.color : 0].light, 6, 70);
    }

    pump() { if (!this.running) this._pump(); }
    async _pump() {
      this.running = true;
      while (this.evQueue.length) {
        const ev = this.evQueue.shift();
        try { await this.playEvent(ev); } catch (e) { console.error(e); }
      }
      this.running = false;
      this.scheduleEndCheck();
    }
    scheduleEndCheck() {
      clearTimeout(this.endTimer);
      this.endTimer = setTimeout(() => this.endCheck(), 260);
    }
    endCheck() {
      if (this.ended || !this.game) return;
      if (this.running || this.evQueue.length) return;
      if (Object.values(this.podV).some((p) => p.state === 'flying')) { this.scheduleEndCheck(); return; }
      const st = this.game.status();
      if (st === 'play') return;
      this.ended = true;
      this.hooks.onEnd && this.hooks.onEnd(st, { actions: this.actions, stars: this.game.stars(), game: this.game });
    }

    async playEvent(ev) {
      if (ev.k === 'bay') { this.slots.push(null); this.resize(); window.SFX.pop(); return; }
      if (ev.k === 'reorder') {
        ev.lanes.forEach((lane, l) => {
          const v = this.visLanes[l];
          lane.forEach((c, i) => { if (v[i]) v[i].c = c; else v.push({ c, id: Math.random(), x: this.laneTarget(l, i).x, y: this.laneTarget(l, i).y }); });
          v.length = lane.length;
        });
        window.SFX.pop(); for (let l = 0; l < 2; l++) for (let i = 0; i < 6; i++) { const t = this.laneTarget(l, i); this.burst(t.x, t.y, '#fff', 2, 60); }
        await sleep(160); return;
      }
      if (ev.k === 'vip') {
        const pv = { id: ev.id, color: -1, cap: 4, kind: 'vip', dir: 0, gx: 0, gy: 0, x: this.W / 2, y: this.H * 0.55, rot: 0, size: this.bayPod, filled: 0, state: 'flying', slot: -1, shake: 0, pop: 1, spawn: 1, arrived: false, alpha: 1, flip: 0, vip: true, face: 1 };
        this.podV[ev.id] = pv;
        let slot = -1; while (slot < 0) { slot = this.slots.indexOf(null); if (slot < 0) await frame(); }
        this.slots[slot] = ev.id; pv.slot = slot; pv.x = this.slotX(slot); pv.y = this.bayY - 60; pv.alpha = 0;
        await this.tween(320, (p) => { pv.y = lerp(this.bayY - 60, this.bayY, p); pv.alpha = p; }, easeOut);
        pv.state = 'bay'; pv.arrived = true; pv.pop = 1; window.SFX.full(); this.burst(pv.x, pv.y, '#ffd34d', 16, 130); return;
      }
      if (ev.k === 'board') {
        const pv = this.podV[ev.pod];
        let guard = 0;
        while ((!pv || !pv.arrived || pv.state !== 'bay') && guard++ < 600) await frame();
        if (!pv) return;
        const lane = this.visLanes[ev.lane]; const item = lane.shift(); if (!item) return;
        const seatIdx = pv.filled;
        const sp = this.seatWorld(pv, seatIdx);
        const x0 = item.x, y0 = item.y, col = ev.color;
        const f = { c: col, x: x0, y: y0, id: item.id, seed: item.id };
        this.flyers.push(f);
        const dur = this.evQueue.length > 4 ? 120 : 230;
        await this.tween(dur, (p) => { const s = this.seatWorld(pv, seatIdx); f.x = lerp(x0, s.x, easeOut(p)); f.y = lerp(y0, s.y, easeOut(p)) - Math.sin(p * Math.PI) * 26; f.r = lerp(15, 6, p); }, (x) => x);
        this.flyers.splice(this.flyers.indexOf(f), 1);
        pv.filled++; pv.pop = 0.7;
        this.streak++; window.SFX.board(this.streak % 9);
        this.burst(sp.x, sp.y, COLORS[col].light, 5, 60);
        this.hooks.onBoard && this.hooks.onBoard(col);
        if (ev.full) {
          this.streak = 0;
          await sleep(80);
          this.leavePod(pv);
        } else await sleep(this.evQueue.length > 4 ? 10 : 50);
      }
    }
    seatWorld(pv, i) {
      const { bw, bh } = this.busDims(pv, pv.size, pv.state === 'board');
      const ww = bw * 0.68 / pv.cap, face = pv.face || 1;
      return { x: pv.x + face * (-bw * 0.44 + (Math.min(i, pv.cap - 1) + 0.5) * ww), y: pv.y - bh * 0.17 };
    }
    leavePod(pv) {
      window.SFX.full();
      if (this.slots[pv.slot] === pv.id) this.slots[pv.slot] = null;
      pv.state = 'leaving';
      const x0 = pv.x, y0 = pv.y, s0 = pv.size;
      const dirx = pv.x < this.W / 2 ? -1 : 1;
      this.burst(pv.x, pv.y, '#fff', 12, 140);
      this.float(pv.vip ? 'VIP' : '✓', pv.x, pv.y - 20, '#9dffb0');
      this.tween(520, (p) => {
        const e = p < 0.18 ? p / 0.18 : 1;
        pv.size = s0 * (p < 0.18 ? 1 + 0.12 * e : lerp(1.12, 0.7, (p - 0.18) / 0.82));
        if (p >= 0.18) { const q = (p - 0.18) / 0.82; pv.x = lerp(x0, x0 + dirx * (this.W * 0.7), easeIn(q)); pv.y = lerp(y0, y0 - this.baysH * 0.9, easeIn(q)); pv.rot = dirx * q * 0.5; pv.alpha = 1 - q * 0.9; }
      }).then(() => { pv.state = 'gone'; });
    }

    /* ---------------- update & draw ---------------- */
    update(now) {
      const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now; this.time += dt;
      if (!this.level) return;
      for (let i = this.tweens.length - 1; i >= 0; i--) {
        const tw = this.tweens[i]; tw.t += dt * 1000; const p = Math.min(1, tw.t / tw.dur);
        tw.fn(tw.ease(p)); if (p >= 1) { this.tweens.splice(i, 1); tw.res(); }
      }
      for (const p of Object.values(this.podV)) {
        if (p.spawn < 1 && p.state === 'board') p.spawn = Math.min(1, p.spawn + dt * 4);
        if (p.shake > 0) p.shake = Math.max(0, p.shake - dt * 3);
        if (p.flash > 0) p.flash = Math.max(0, p.flash - dt * 2.5);
        if (p.pop > 0) p.pop = Math.max(0, p.pop - dt * 4);
        if (p.flip > 0) p.flip = Math.max(0, p.flip - dt * 2.5);
        if (p.state === 'board') { const c = this.cellCenter(p.gx, p.gy); p.x = c.x; p.y = c.y; p.size = this.cell; p.rot = p.dir * Math.PI / 2; }
        else if (p.state === 'bay') { const tx = this.slotX(p.slot), ty = this.bayY; p.x = lerp(p.x, tx, Math.min(1, dt * 14)); p.y = lerp(p.y, ty, Math.min(1, dt * 14)); p.size = lerp(p.size, this.bayPod, Math.min(1, dt * 10)); }
      }
      // lane items glide to their slots
      this.visLanes.forEach((lane, l) => lane.forEach((it, i) => {
        const t = this.laneTarget(l, i);
        if (!it.init) { it.init = true; }
        const k = Math.min(1, dt * (it.x === this.W / 2 && it.y < 0 ? 5 : 9));
        it.x = lerp(it.x, t.x, k); it.y = lerp(it.y, t.y, k);
      }));
      for (let i = this.parts.length - 1; i >= 0; i--) { const p = this.parts[i]; p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 260 * dt; if (p.t > p.life) this.parts.splice(i, 1); }
      for (let i = this.floaters.length - 1; i >= 0; i--) { const f = this.floaters[i]; f.t += dt; if (f.t > 0.9) this.floaters.splice(i, 1); }
      if (this.shakeBays > 0) this.shakeBays = Math.max(0, this.shakeBays - dt * 3);
      if (this.hintId >= 0 && performance.now() > this.hintUntil) this.hintId = -1;
    }

    draw() {
      const ctx = this.ctx; if (!ctx) return;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, this.W, this.H);
      if (!this.level) return;
      this.drawPlatform(ctx); this.drawBays(ctx); this.drawBoard(ctx);
      const pods = Object.values(this.podV);
      for (const p of pods) if (p.state === 'board') this.drawPod(ctx, p);
      for (const p of pods) if (p.state === 'bay') this.drawPod(ctx, p);
      for (const p of pods) if (p.state === 'flying' || p.state === 'leaving') this.drawPod(ctx, p);
      this.drawQueue(ctx);
      for (const f of this.flyers) this.drawPassenger(ctx, f.x, f.y, f.r || 15, f.c, f.seed, false);
      for (const p of this.parts) { ctx.globalAlpha = clamp(1 - p.t / p.life, 0, 1); ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 7); ctx.fill(); }
      ctx.globalAlpha = 1;
      for (const f of this.floaters) { ctx.globalAlpha = clamp(1 - f.t / 0.9, 0, 1); ctx.fillStyle = f.color; ctx.font = '800 20px Baloo 2, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(f.text, f.x, f.y - f.t * 40); }
      ctx.globalAlpha = 1;
    }

    drawPlatform(ctx) {
      const W = this.W, h = this.platformH;
      const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(20,26,90,.0)'); g.addColorStop(1, 'rgba(30,38,120,.55)');
      ctx.fillStyle = g; rr(ctx, 6, 4, W - 12, h - 6, 26); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = 1.5; ctx.stroke();
      // lane rails
      const y = this.platformH * 0.56;
      ctx.lineWidth = 26; ctx.lineCap = 'round';
      for (const dir of [-1, 1]) {
        ctx.strokeStyle = 'rgba(255,255,255,.07)'; ctx.beginPath(); ctx.moveTo(W / 2 + dir * 14, y); ctx.lineTo(W / 2 + dir * (W / 2 - 22), y); ctx.stroke();
      }
      // gate
      ctx.fillStyle = 'rgba(93,255,157,.9)'; rr(ctx, W / 2 - 3, y - 22, 6, 44, 3); ctx.fill();
      // counters
      ctx.font = '800 13px Baloo 2, system-ui, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.75)';
      const rem = this.game.lanes.map((l) => l.length);
      ctx.textAlign = 'left'; ctx.fillText('👥 ' + (this.visLanes[0].length), 16, 22);
      ctx.textAlign = 'right'; ctx.fillText((this.visLanes[1].length) + ' 👥', W - 16, 22);
      ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,.55)';
      ctx.fillText(this.level.hard ? '★ ' + window.T('boss') + ' ★' : '', W / 2, 22);
    }
    drawQueue(ctx) {
      const t = this.time;
      this.visLanes.forEach((lane, l) => {
        const vis = Math.min(lane.length, 8);
        for (let i = vis - 1; i >= 0; i--) {
          const it = lane[i]; if (!it) continue;
          const a = i >= 6 ? 1 - (i - 5) / 3 : 1;
          ctx.globalAlpha = clamp(a, 0, 1);
          this.drawPassenger(ctx, it.x, it.y + Math.sin(t * 3 + it.id * 9) * 1.4, i === 0 ? 17 : 15, it.c, it.id, true);
        }
        ctx.globalAlpha = 1;
        if (lane.length > 7) { const tp = this.laneTarget(l, 7); ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.font = '800 13px Baloo 2, system-ui'; ctx.textAlign = 'center'; ctx.fillText('+' + (lane.length - 7), tp.x + (l === 0 ? -8 : 8), tp.y + 5); }
      });
    }
    drawPassenger(ctx, x, y, r, c, seed, idle) {
      const C = COLORS[c]; if (!C) return;
      const sd = Math.floor((seed * 1000) % 997);
      ctx.save(); ctx.translate(x, y);
      // body
      const g = ctx.createLinearGradient(0, -r * 0.3, 0, r * 1.2); g.addColorStop(0, C.light); g.addColorStop(0.35, C.base); g.addColorStop(1, C.dark);
      ctx.fillStyle = g; rr(ctx, -r * 0.78, -r * 0.2, r * 1.56, r * 1.35, r * 0.6); ctx.fill();
      // head
      ctx.fillStyle = SKIN[sd % SKIN.length]; ctx.beginPath(); ctx.arc(0, -r * 0.62, r * 0.6, 0, 7); ctx.fill();
      ctx.fillStyle = HAIR[(sd >> 2) % HAIR.length]; ctx.beginPath(); ctx.arc(0, -r * 0.78, r * 0.6, Math.PI, 0); ctx.fill();
      ctx.fillStyle = '#2a1647'; ctx.beginPath(); ctx.arc(-r * 0.2, -r * 0.55, r * 0.07, 0, 7); ctx.arc(r * 0.2, -r * 0.55, r * 0.07, 0, 7); ctx.fill();
      if (this.cb || window.NT_CB) drawSym(ctx, C.sym, 0, r * 0.52, r * 0.36, 'rgba(255,255,255,.95)');
      ctx.restore();
    }
    drawBays(ctx) {
      const n = this.slots.length, sw = this.slotW, y = this.bayY;
      const sh = this.shakeBays > 0 ? Math.sin(this.shakeBays * 40) * 6 * this.shakeBays : 0;
      ctx.save(); ctx.translate(sh, 0);
      ctx.fillStyle = 'rgba(10,14,50,.5)'; rr(ctx, this.slotX(0) - sw / 2 - 4, y - this.baysH / 2 - 2, sw * n + 8, this.baysH + 4, 22); ctx.fill();
      for (let i = 0; i < n; i++) {
        const x = this.slotX(i), free = this.slots[i] === null;
        ctx.fillStyle = free ? 'rgba(255,255,255,.07)' : 'rgba(255,255,255,.03)';
        ctx.strokeStyle = i >= this.level.bays ? 'rgba(255,207,74,.7)' : 'rgba(255,255,255,.22)'; ctx.lineWidth = 2; ctx.setLineDash([6, 5]);
        rr(ctx, x - sw / 2 + 4, y - this.baysH / 2 + 4, sw - 8, this.baysH - 8, 16); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
        if (free) { ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.font = '800 15px Baloo 2, system-ui'; ctx.textAlign = 'center'; ctx.fillText(String(i + 1), x, y + 5); }
      }
      ctx.restore();
    }
    drawBoard(ctx) {
      const L = this.level, c = this.cell;
      ctx.fillStyle = 'rgba(8,12,46,.55)'; rr(ctx, this.bx - 8, this.by - 8, L.w * c + 16, L.h * c + 16, 22); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.lineWidth = 1.5; ctx.stroke();
      for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) {
        ctx.fillStyle = (x + y) % 2 ? 'rgba(255,255,255,.045)' : 'rgba(255,255,255,.075)';
        rr(ctx, this.bx + x * c + 2, this.by + y * c + 2, c - 4, c - 4, 10); ctx.fill();
      }
    }
    busDims(p, s, isBoard) { const bw = s * (isBoard ? 0.84 : 0.94); return { bw, bh: bw * 0.5, areaL: -bw * 0.44, areaW: bw * 0.68 }; }
    drawPod(ctx, p) {
      if (p.state === 'gone' || p.spawn < 0) return;
      const g = this.game, lg = g.pod(p.id);
      const kind = lg ? lg.kind : p.kind, lock = lg ? lg.lock : 0, revealed = lg ? lg.revealed : true;
      const isBoard = p.state === 'board';
      let s = p.size * (isBoard ? (0.5 + 0.5 * easeOut(clamp(p.spawn, 0, 1))) : 1);
      if (p.pop > 0) s *= 1 + Math.sin(p.pop * Math.PI) * 0.12;
      const shake = p.shake > 0 ? Math.sin(p.shake * 38) * 5 * p.shake : 0;
      const canGo = isBoard && lg && g.canExit(lg);
      const vip = p.vip || kind === 'vip';
      const hidden = kind === 'mystery' && !revealed;
      const C = vip ? { base: '#ffcf4a', light: '#fff0a8', dark: '#b87100', sym: 'star' } : (hidden ? { base: '#8f98d8', light: '#c9cffa', dark: '#383f72', sym: 'circle' } : COLORS[p.color]);
      const { bw, bh } = this.busDims(p, s, isBoard);
      const face = p.face || 1;
      ctx.save(); ctx.globalAlpha = p.alpha; ctx.translate(p.x + shake, p.y);
      if (isBoard && canGo) { const pulse = 0.5 + 0.5 * Math.sin(this.time * 4 + p.id); ctx.fillStyle = `rgba(255,255,255,${0.05 + pulse * 0.06})`; rr(ctx, -bw * 0.56, -bh * 0.7, bw * 1.12, bh * 1.5, bh * 0.5); ctx.fill(); }
      if (this.hintId === p.id) { const pulse = 0.5 + 0.5 * Math.sin(this.time * 8); ctx.strokeStyle = `rgba(255,236,120,${0.6 + pulse * 0.4})`; ctx.lineWidth = 4; rr(ctx, -bw * 0.58, -bh * 0.75, bw * 1.16, bh * 1.6, bh * 0.55); ctx.stroke(); }
      if (p.flash > 0) { ctx.fillStyle = `rgba(255,80,90,${p.flash * 0.5})`; rr(ctx, -bw * 0.56, -bh * 0.7, bw * 1.12, bh * 1.5, bh * 0.5); ctx.fill(); }
      ctx.scale(face, 1);
      // ground glow
      ctx.fillStyle = C.base; ctx.globalAlpha = p.alpha * 0.35; ctx.beginPath(); ctx.ellipse(0, bh * 0.62, bw * 0.5, bh * 0.1, 0, 0, 7); ctx.fill(); ctx.globalAlpha = p.alpha;
      // body
      const gr = ctx.createLinearGradient(0, -bh / 2, 0, bh / 2); gr.addColorStop(0, '#2f3478'); gr.addColorStop(1, '#0b0d2e');
      ctx.fillStyle = gr; rr(ctx, -bw / 2, -bh / 2, bw, bh, bh * 0.38); ctx.fill();
      ctx.strokeStyle = C.base; ctx.globalAlpha = p.alpha * 0.28; ctx.lineWidth = s * 0.085; ctx.stroke();
      ctx.globalAlpha = p.alpha; ctx.lineWidth = Math.max(2, s * 0.035); ctx.stroke();
      // Premium electric-transit body: sculpted nose, glass roof and two-tone lower skirt.
      ctx.fillStyle = 'rgba(0,0,0,.25)'; rr(ctx, -bw * .43, -bh * .44, bw * .86, bh * .92, bh * .28); ctx.fill();
      // panoramic dark glass band
      const glass = ctx.createLinearGradient(0, -bh * .4, 0, bh * .02);
      glass.addColorStop(0, '#b9f3ff'); glass.addColorStop(.18, '#3e789e'); glass.addColorStop(1, '#101e46');
      ctx.fillStyle = hidden ? 'rgba(160,170,255,.25)' : glass;
      rr(ctx, -bw * .405, -bh * .405, bw * .81, bh * .43, bh * .17); ctx.fill();
      // individual passenger windows with reflections
      const n = p.cap, areaL = -bw * 0.36, areaW = bw * 0.59, ww = areaW / n;
      for (let i = 0; i < n; i++) {
        const wx = areaL + i * ww, filled = i < p.filled && !hidden;
        ctx.fillStyle = hidden ? 'rgba(160,170,255,.25)' : filled ? C.light : '#6ed7f3';
        ctx.globalAlpha = p.alpha * (filled ? .98 : .66);
        rr(ctx, wx + 1, -bh * .35, Math.max(1, ww - 2), bh * .31, Math.max(2, ww * .18)); ctx.fill();
        ctx.globalAlpha = p.alpha;
        ctx.strokeStyle = 'rgba(255,255,255,.36)'; ctx.lineWidth = Math.max(1, s * .012);
        ctx.beginPath(); ctx.moveTo(wx + ww * .18, -bh * .32); ctx.lineTo(wx + ww * .38, -bh * .10); ctx.stroke();
        if (filled) { const hr = Math.min(ww * .19, bh * .07); ctx.fillStyle = vip ? '#fff' : '#2a1647'; ctx.beginPath(); ctx.arc(wx + ww / 2, -bh * .18, hr, 0, 7); ctx.fill(); }
      }
      // front panoramic windshield + route display
      ctx.fillStyle = '#9cecff'; ctx.globalAlpha = p.alpha * .9; rr(ctx, bw * .265, -bh * .37, bw * .13, bh * .32, bh * .1); ctx.fill(); ctx.globalAlpha = p.alpha;
      ctx.fillStyle = '#10172f'; rr(ctx, -bw * .15, -bh * .46, bw * .34, bh * .07, bh * .025); ctx.fill();
      ctx.fillStyle = C.light; ctx.font = `800 ${Math.max(5, s * .065)}px system-ui`; ctx.textAlign = 'center'; ctx.fillText('NOVA • E', bw * .02, -bh * .41);
      // continuous neon beltline and illuminated lower skirt
      ctx.fillStyle = C.base; ctx.globalAlpha = p.alpha * .95; rr(ctx, -bw * .43, bh * .12, bw * .86, bh * .15, bh * .06); ctx.fill(); ctx.globalAlpha = p.alpha;
      ctx.fillStyle = 'rgba(255,255,255,.24)'; rr(ctx, -bw * .34, bh * .15, bw * .42, bh * .025, bh * .01); ctx.fill();
      // side mirrors / sensor pods
      ctx.fillStyle = '#172044'; rr(ctx, -bw * .53, -bh * .12, bw * .11, bh * .13, bh * .045); ctx.fill();
      ctx.fillStyle = C.light; rr(ctx, -bw * .51, -bh * .10, bw * .07, bh * .045, bh * .02); ctx.fill();
      // lights
      ctx.fillStyle = 'rgba(255,249,196,.35)'; ctx.beginPath(); ctx.arc(bw / 2, bh * 0.1, s * 0.07, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(bw / 2 - 1, bh * 0.1, s * 0.03, 0, 7); ctx.fill();
      ctx.fillStyle = '#ff2a4a'; ctx.beginPath(); ctx.arc(-bw / 2 + 1, bh * 0.1, s * 0.025, 0, 7); ctx.fill();
      // wheels
      for (const wx of [-bw * 0.29, bw * 0.29]) {
        ctx.fillStyle = '#070b20'; ctx.beginPath(); ctx.arc(wx, bh * .49, bh * .205, 0, 7); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.42)'; ctx.lineWidth = Math.max(1.5, s * .025); ctx.stroke();
        ctx.fillStyle = '#202b54'; ctx.beginPath(); ctx.arc(wx, bh * .49, bh * .13, 0, 7); ctx.fill();
        ctx.strokeStyle = C.light; ctx.lineWidth = Math.max(1, s * .018); ctx.stroke();
        ctx.fillStyle = C.base; ctx.beginPath(); ctx.arc(wx, bh * .49, bh * .055, 0, 7); ctx.fill();
      }
      // signature LED headlamps and rear light strip
      ctx.fillStyle = '#fff4c2'; rr(ctx, bw * .36, bh * .08, bw * .075, bh * .055, bh * .02); ctx.fill();
      ctx.fillStyle = '#ff365f'; rr(ctx, -bw * .435, bh * .08, bw * .045, bh * .07, bh * .02); ctx.fill();
      // symbol / crown (un-flipped)
      ctx.scale(face, 1);
      if (!vip && !hidden) drawSym(ctx, C.sym, 0, bh * 0.32, s * (this.cb || window.NT_CB ? 0.075 : 0.045), 'rgba(255,255,255,.9)');
      if (vip) { ctx.fillStyle = '#ffd34d'; ctx.font = `800 ${s * 0.13}px Baloo 2, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.fillText('VIP', 0, bh * 0.38); }
      if (hidden) { ctx.fillStyle = '#fff'; ctx.font = `800 ${bh * 0.62}px Baloo 2, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('?', 0, -bh * 0.18); ctx.textBaseline = 'alphabetic'; }
      if (kind === 'lock' && lock > 0) {
        ctx.fillStyle = 'rgba(120,200,255,.5)'; rr(ctx, -bw / 2, -bh / 2, bw, bh * 1.05, bh * 0.38); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = '#fff'; rr(ctx, -s * 0.09, -bh * 0.12, s * 0.18, s * 0.14, s * 0.03); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = s * 0.03; ctx.beginPath(); ctx.arc(0, -bh * 0.12, s * 0.055, Math.PI, 0); ctx.stroke();
        ctx.fillStyle = '#1b4fc4'; ctx.font = `800 ${s * 0.13}px Baloo 2, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.fillText(String(lock), 0, bh * 0.0 + s * 0.045);
      }
      ctx.restore();
      // direction arrow (board only), in real direction
      if (isBoard) {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.dir * Math.PI / 2);
        const horiz = p.dir === 1 || p.dir === 3; const d0 = horiz ? 0.44 : 0.3, d1 = horiz ? 0.58 : 0.45;
        const bob = canGo ? Math.sin(this.time * 6 + p.id) * s * 0.02 : 0;
        ctx.fillStyle = `rgba(255,255,255,${canGo ? 0.95 : 0.3})`; ctx.shadowColor = canGo ? C.base : 'transparent'; ctx.shadowBlur = canGo ? 10 : 0;
        ctx.beginPath(); ctx.moveTo(0, -s * d1 - bob); ctx.lineTo(s * 0.11, -s * d0 - bob); ctx.lineTo(-s * 0.11, -s * d0 - bob); ctx.closePath(); ctx.fill(); ctx.restore();
      }
    }
    setColorblind(v) { this.cb = !!v; window.NT_CB = !!v; }
  }
  window.GameView = GameView;
  window.NT_COLORS = COLORS;
  window.NT_drawSym = drawSym;
})();
