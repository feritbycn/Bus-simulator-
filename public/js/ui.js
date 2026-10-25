/* UI helpers: modals, toasts, ad overlay, payment sheet, effects. */
(function () {
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const ic = (n, cls) => `<svg class="ic ${cls || ''}"><use href="assets/icons.svg#i-${n}"/></svg>`;
  const fmt = (n) => new Intl.NumberFormat(I18N.lang === 'tr' ? 'tr-TR' : 'en-US').format(n);
  const html = (s) => { const d = document.createElement('div'); d.innerHTML = s.trim(); return d.firstElementChild; };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const settings = { sound: true, haptics: true, cb: false };
  try { Object.assign(settings, JSON.parse(localStorage.getItem('nt_settings') || '{}')); } catch (e) {}
  const saveSettings = () => { try { localStorage.setItem('nt_settings', JSON.stringify(settings)); } catch (e) {} SFX.enabled = settings.sound; };
  SFX.enabled = settings.sound;
  const buzz = (ms) => { if (settings.haptics && navigator.vibrate) try { navigator.vibrate(ms); } catch (e) {} };

  /* ---------- modal ---------- */
  const stack = [];
  function modal({ title, body, foot, closable = true, cls = '', onClose, tabs, noHead }) {
    const root = $('#modal-root');
    const m = html(`<div class="modal"><div class="sheet ${cls}">${noHead ? '' : `<div class="head"><span>${title || ''}</span>${closable ? `<button class="x" aria-label="close">${ic('close')}</button>` : ''}</div>`}<div class="tabs-slot"></div><div class="body"></div><div class="foot"></div></div></div>`);
    const b = $('.body', m), f = $('.foot', m);
    if (typeof body === 'string') b.innerHTML = body; else if (body) b.appendChild(body);
    if (foot) (Array.isArray(foot) ? foot : [foot]).forEach((n) => f.appendChild(typeof n === 'string' ? html(n) : n));
    const api = { el: m, body: b, foot: f, close(res) { if (!m.isConnected) return; m.remove(); const i = stack.indexOf(api); if (i >= 0) stack.splice(i, 1); onClose && onClose(res); }, setBody(h) { b.innerHTML = ''; if (typeof h === 'string') b.innerHTML = h; else b.appendChild(h); } };
    const x = $('.x', m); if (x) x.onclick = () => { SFX.click(); api.close(); };
    if (closable) m.addEventListener('pointerdown', (e) => { if (e.target === m) api.close(); });
    root.appendChild(m); stack.push(api); I18N.apply(m);
    return api;
  }
  const closeAll = () => { while (stack.length) stack[stack.length - 1].close(); };

  function toast(msg, kind) {
    const t = html(`<div class="toast ${kind || ''}">${msg}</div>`);
    const root = $('#toasts'); root.appendChild(t); setTimeout(() => t.remove(), 2800);
    while (root.children.length > 3) root.firstChild.remove();
  }
  const btn = (label, cls, onclick) => { const b = html(`<button class="btn ${cls || ''}">${label}</button>`); b.onclick = () => { SFX.click(); onclick && onclick(b); }; return b; };

  /* ---------- fx: coins + confetti ---------- */
  function flyCoins(fromEl, n = 8) {
    const to = $('.screen.active #btn-coins, .screen.active #btn-coins2'); const app = $('#app');
    if (!to || !fromEl) return;
    const a = app.getBoundingClientRect(), s = fromEl.getBoundingClientRect(), d = to.getBoundingClientRect();
    for (let i = 0; i < n; i++) {
      const c = html(`<div class="coinfly">${ic('coin')}</div>`); c.firstChild.style.cssText = 'width:100%;height:100%';
      c.style.left = s.left - a.left + s.width / 2 - 15 + (Math.random() - 0.5) * 60 + 'px'; c.style.top = s.top - a.top + s.height / 2 - 15 + 'px';
      app.appendChild(c);
      const dx = d.left - a.left + d.width / 2 - 15 - parseFloat(c.style.left), dy = d.top - a.top + d.height / 2 - 15 - parseFloat(c.style.top);
      c.animate([{ transform: 'translate(0,0) scale(.6)', opacity: 0 }, { transform: 'translate(0,-30px) scale(1.1)', opacity: 1, offset: 0.2 }, { transform: `translate(${dx}px,${dy}px) scale(.7)`, opacity: 1 }], { duration: 750 + i * 60, delay: i * 55, easing: 'cubic-bezier(.5,0,.8,.4)', fill: 'both' }).onfinish = () => { c.remove(); if (i % 2 === 0) SFX.coin(); };
    }
  }
  let fxRaf = 0;
  function confetti(ms = 2600) {
    const cv = $('#fx'), r = $('#app').getBoundingClientRect(); const dpr = Math.min(2, devicePixelRatio || 1);
    cv.width = r.width * dpr; cv.height = r.height * dpr; const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cols = ['#ff5a64', '#ffb020', '#79d93a', '#19d3c5', '#3d8bff', '#9b6bff', '#ff5ea8', '#ffe680'];
    const ps = Array.from({ length: 140 }, () => ({ x: r.width / 2 + (Math.random() - 0.5) * 80, y: r.height * 0.4, vx: (Math.random() - 0.5) * 700, vy: -300 - Math.random() * 600, w: 6 + Math.random() * 7, h: 10 + Math.random() * 8, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 12, c: cols[Math.floor(Math.random() * cols.length)] }));
    const t0 = performance.now(); let last = t0; cancelAnimationFrame(fxRaf);
    const step = (now) => {
      const dt = Math.min(0.04, (now - last) / 1000); last = now; ctx.clearRect(0, 0, r.width, r.height);
      for (const p of ps) { p.vy += 900 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.99; p.rot += p.vr * dt; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore(); }
      if (now - t0 < ms) fxRaf = requestAnimationFrame(step); else ctx.clearRect(0, 0, r.width, r.height);
    };
    fxRaf = requestAnimationFrame(step);
  }

  /* ---------- ad provider (swap this for AdMob / AppLovin / Unity Ads) ---------- */
  const MockAdProvider = {
    /** resolves true when the user watched the ad to the end, false if closed early */
    showRewarded({ seconds, rewardText }) { return runAdOverlay({ seconds, rewardText, skippable: false }); },
    showInterstitial() { return runAdOverlay({ seconds: 3, interstitial: true, skippable: true }); },
  };
  function runAdOverlay({ seconds = 5, rewardText = '', interstitial = false, skippable = false }) {
    return new Promise((resolve) => {
      const ov = html(`<div class="ad"><span class="adtag">${T('ad_label')}</span><button class="adx" aria-label="close">✕</button>
        <div class="creative"><div>NOVA<br>TRANSIT<br>${ic('play')}</div></div>
        <div class="reward-note">${interstitial ? '' : `${rewardText ? rewardText + '<br>' : ''}<span class="muted">${T('ad_reward_in')}</span>`}</div>
        <div class="reward-note" style="font-size:40px" id="adcount">${seconds}</div>
        <div class="demo">${T('ad_demo')}</div></div>`);
      $('#app').appendChild(ov);
      const x = $('.adx', ov), cnt = $('#adcount', ov);
      x.style.visibility = interstitial ? 'hidden' : 'visible';
      let left = seconds, done = false;
      const finish = (ok) => { if (done) return; done = true; clearInterval(iv); ov.remove(); resolve(ok); };
      x.onclick = () => finish(false);
      const iv = setInterval(() => {
        left--; cnt.textContent = Math.max(0, left);
        if (interstitial && left <= 0) { x.style.visibility = 'visible'; x.textContent = '✕'; cnt.textContent = ''; }
        if (!interstitial && left <= 0) finish(true);
      }, 1000);
      if (interstitial) { x.onclick = () => finish(true); }
    });
  }
  const AdProvider = MockAdProvider;

  /** server-verified rewarded ad: start -> show -> complete. Returns the complete() response or null. */
  async function rewarded(placement, extra) {
    let start;
    try { start = await API.adStart({ placement, ...(extra || {}) }); }
    catch (e) {
      if (e.code === 'daily_cap' || e.code === 'placement_cap') toast(T('ad_cap'), 'bad');
      else if (e.code === 'cooldown') toast(T('ad_cooldown'), 'bad');
      else toast(T('toast_err'), 'bad');
      return null;
    }
    API.sendState('ad');
    const ok = await AdProvider.showRewarded({ seconds: Math.ceil(start.minMs / 1000) + 1, rewardText: (extra && extra.label) || '' });
    if (!ok) { API.sendState(window.NT_state || 'menu'); return null; }
    try { const r = await API.adComplete({ token: start.token }); API.sendState(window.NT_state || 'menu'); return r; }
    catch (e) { toast(T('ad_failed'), 'bad'); API.sendState(window.NT_state || 'menu'); return null; }
  }

  /* ---------- demo payment sheet ---------- */
  function payment(prod, priceStr) {
    return new Promise((resolve) => {
      const title = prod.title[I18N.lang] || prod.title.en;
      const m = modal({ title: T('pay_demo_title'), cls: 'center', onClose: () => resolve(false),
        body: `<div class="card" style="margin-top:6px"><div class="ci">${ic(prod.cents >= 499 ? 'gift' : 'coin')}</div><div class="ct"><b>${title}</b><small>${priceStr}</small></div></div><p class="muted" style="font-size:14px;line-height:1.3">${T('pay_demo_note')}</p>`,
        foot: [btn(T('pay_confirm') + ' · ' + priceStr, 'gold', () => { m.close(); resolve(true); }), btn(T('cancel'), 'ghost', () => m.close())] });
    });
  }

  /* count-up for numbers */
  function countUp(el, from, to, ms = 600) {
    const t0 = performance.now();
    const step = (now) => { const p = Math.min(1, (now - t0) / ms); el.textContent = fmt(Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3)))); if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  const mmss = (s) => { s = Math.max(0, s | 0); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`; };

  window.UI = { $, $$, ic, fmt, html, sleep, settings, saveSettings, buzz, modal, closeAll, toast, btn, flyCoins, confetti, AdProvider, rewarded, payment, countUp, mmss, stack };
})();
