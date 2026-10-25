/* Procedural sound effects (no audio files). */
(function () {
  let ctx = null, on = true;
  function ac() {
    if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function tone(freq, dur, type = 'sine', vol = 0.15, slideTo = null, delay = 0) {
    if (!on) return; const c = ac(); if (!c) return;
    const t0 = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(c.destination); o.start(t0); o.stop(t0 + dur + 0.02);
  }
  const S = {
    tap: () => tone(520, 0.09, 'triangle', 0.12, 760),
    whoosh: () => { tone(300, 0.28, 'sawtooth', 0.05, 900); },
    board: (i = 0) => tone(660 + Math.min(i, 8) * 60, 0.1, 'sine', 0.13),
    full: () => { tone(784, 0.12, 'triangle', 0.14); tone(1047, 0.18, 'triangle', 0.14, null, 0.09); },
    deny: () => { tone(180, 0.18, 'square', 0.09, 110); },
    win: () => { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.22, 'triangle', 0.15, null, i * 0.09)); },
    lose: () => { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.25, 'sawtooth', 0.08, null, i * 0.13)); },
    coin: () => { tone(988, 0.08, 'square', 0.07); tone(1319, 0.16, 'square', 0.07, null, 0.07); },
    pop: () => tone(400, 0.12, 'sine', 0.12, 900),
    spin: () => tone(300 + Math.random() * 300, 0.04, 'square', 0.04),
    click: () => tone(440, 0.05, 'triangle', 0.08),
  };
  window.SFX = Object.assign({ set enabled(v) { on = !!v; }, get enabled() { return on; }, unlock: ac }, S);
  Object.defineProperty(window.SFX, 'enabled', { get: () => on, set: (v) => { on = !!v; } });
  const unlock = () => { ac(); window.removeEventListener('pointerdown', unlock); };
  window.addEventListener('pointerdown', unlock);
})();
