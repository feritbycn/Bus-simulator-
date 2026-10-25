/* Nova Transit – app flow: boot, home, game loop, shop, spin, daily, missions, leaderboard, settings. */
(function () {
  const { $, $$, ic, fmt, html, sleep, settings, saveSettings, buzz, modal, toast, btn, flyCoins, confetti, rewarded, payment, countUp, mmss } = UI;
  const E = window.NovaEngine;
  const S = { profile: null, config: null, view: null, run: null, level: null, live: { online: 0, playing: 0 }, screen: 'boot', busy: false, coinShown: 0, paused: false, endedModal: null };
  const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const BG = (id) => `url(assets/bg_${id}.svg)`;
  const dName = (d) => d.name[I18N.lang] || d.name.en;
  const propIcon = { reorder: 'shuffle', bay: 'bay', vip: 'vip', hint: 'hint' };
  const propName = (p) => T('prop_' + p);

  function show(name) {
    $$('.screen').forEach((s) => s.classList.toggle('active', s.id === 'screen-' + name));
    S.screen = name; window.NT_state = name === 'game' ? 'playing' : 'menu';
    API.sendState(window.NT_state, S.level ? S.level.n : 0);
  }
  const bootMsg = (k, pct) => { $('#boot-msg').textContent = T(k); if (pct != null) $('#boot-fill').style.width = pct + '%'; };

  /* =================== boot =================== */
  async function boot() {
    const saved = localStorage.getItem('nt_lang');
    I18N.setLang(saved || I18N.detect());
    bootMsg('connecting', 15);
    for (let attempt = 0; ; attempt++) {
      try {
        const r = await API.register(I18N.lang);
        S.profile = r.profile; S.live = r.live; break;
      } catch (e) { bootMsg('offline_msg'); await sleep(Math.min(5000, 1200 + attempt * 600)); }
    }
    bootMsg('loading', 55);
    try { S.config = await API.config(); } catch (e) { S.config = { daily: [], spin: { slices: [] }, products: [], propPrice: {}, districts: [] }; }
    if (S.profile.lang && !saved) I18N.setLang(S.profile.lang);
    API.onLive((m) => { S.live = { online: m.online, playing: m.playing }; renderLive(); });
    API.connectWS();
    bootMsg('loading', 100);
    // preload backgrounds
    await Promise.all(E.DISTRICTS.map((d) => new Promise((r) => { const i = new Image(); i.onload = i.onerror = r; i.src = `assets/bg_${d.id}.svg`; })));
    bindHome(); bindGame(); applyCbSetting();
    renderHome(); show('home');
    if (S.profile.bestLevel === 0 && !lsGet('nt_intro', false)) { lsSet('nt_intro', true); await story([{ w: 'mira', k: 's_intro1' }, { w: 'pip', k: 's_intro2' }], 'harbor'); }
    else autoPopups();
    setInterval(tick, 1000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshProfile(); });
  }

  async function refreshProfile() { try { const r = await API.me(); S.profile = r.profile; S.live = r.live; renderHome(); renderLive(); } catch (e) {} }
  function setProfile(p, animate = true) {
    const old = S.profile ? S.profile.coins : 0; S.profile = p;
    if (animate && p.coins !== S.coinShown) { countUp($('#hud-coins'), S.coinShown, p.coins); countUp($('#hud-coins2'), S.coinShown, p.coins); }
    else { $('#hud-coins').textContent = fmt(p.coins); $('#hud-coins2').textContent = fmt(p.coins); }
    S.coinShown = p.coins;
    renderHome(false); updateProps();
  }
  function autoPopups() {
    const p = S.profile;
    if (!p.daily.claimedToday && p.bestLevel >= 1) setTimeout(() => S.screen === 'home' && openDaily(), 500);
  }

  /* =================== home =================== */
  function curDistrict() { return E.DISTRICTS[E.districtOf(S.profile.level)]; }
  function renderHome(full = true) {
    const p = S.profile; if (!p) return;
    const d = curDistrict(); const di = E.districtOf(p.level);
    if (full) $('#home-bg').style.backgroundImage = BG(d.id);
    $('#hud-name').textContent = p.name; $('#hud-stars').innerHTML = `${ic('star')}${p.stars}`;
    $('#hud-coins').textContent = fmt(p.coins); S.coinShown = p.coins;
    $('#play-level').textContent = `${T('level')} ${p.level}`;
    $('#dc-name').textContent = dName(d);
    if (d.to === Infinity) { $('#dc-pct').textContent = '∞'; $('#dc-fill').style.width = '100%'; $('#dc-sub').textContent = `${T('level')} ${p.level}`; }
    else {
      const total = d.to - d.from + 1, done = Math.max(0, p.level - d.from); const pct = Math.round((done / total) * 100);
      $('#dc-pct').textContent = '💡 ' + pct + '%'; $('#dc-fill').style.width = pct + '%';
      const nx = E.DISTRICTS[di + 1];
      $('#dc-sub').textContent = `${T('city_lit')} · ${d.to - p.level + 1} ${T('levels_left')}${nx ? ' → ' + dName(nx) : ''}`;
    }
    $('#badge-daily').hidden = p.daily.claimedToday;
    $('#badge-spin').hidden = !(p.spin.freeIn === 0 || p.spin.extra > 0);
    $('#badge-missions').hidden = !p.missions.some((m) => !m.claimed && m.progress >= m.goal) && !(p.missions.every((m) => m.claimed) && !p.chestClaimed);
    // offer button
    const offer = $('#btn-offer'); const sp = S.config && S.config.products.find((x) => x.id === 'starter');
    let label = null;
    if (p.bestLevel + 1 >= 3 && sp && !p.oneTime.includes('starter')) label = T('offer_starter');
    else if (p.bestLevel + 1 >= 12 && !p.vip) label = T('offer_plus');
    offer.hidden = !label; if (label) $('#offer-label').textContent = label;
    $('#btn-noads').hidden = p.adFree;
    renderLive(); renderTimers();
  }
  function renderLive() {
    const l = S.live || { online: 0, playing: 0 };
    $('#live-text').textContent = `${fmt(l.online)} ${T('online')} · ${fmt(l.playing)} ${T('playing_now')}`;
  }
  function renderTimers() {
    const p = S.profile; if (!p) return;
    const el = $('#badge-supply'); const left = Math.max(0, p.supply.readyIn - (Date.now() - (S._profileAt || Date.now())) / 1000);
    el.textContent = left > 0 ? mmss(left) : '!'; el.className = 'badge' + (left > 0 ? ' timer' : '');
  }
  function tick() {
    if (!S.profile) return;
    renderTimers();
  }
  const tips = ['tip1', 'tip2', 'tip3', 'tip4', 'tip5']; let tipI = 0;
  setInterval(() => { const b = $('#pip-bubble'); if (b && S.screen === 'home') { b.textContent = T(tips[tipI++ % tips.length]); } }, 7000);

  function bindHome() {
    $('#btn-play').onclick = () => { SFX.click(); startLevel(S.profile.level); };
    $('#btn-coins').onclick = () => openShop('coins');
    $('#btn-profile').onclick = () => openSettings();
    $('#btn-settings').onclick = () => openSettings();
    $('#btn-daily').onclick = () => openDaily();
    $('#btn-supply').onclick = () => openSupply();
    $('#btn-offer').onclick = () => openShop(S.profile.oneTime.includes('starter') ? 'plus' : 'offers');
    $('#btn-noads').onclick = () => openShop('offers');
    $$('#nav button').forEach((b) => (b.onclick = () => {
      SFX.click(); const n = b.dataset.nav;
      if (n === 'shop') openShop('offers'); else if (n === 'missions') openMissions(); else if (n === 'spin') openSpin(); else if (n === 'rank') openRank();
    }));
    $('#pip-bubble').textContent = T(tips[0]);
  }

  /* =================== story =================== */
  function story(lines, districtId, opts) {
    return new Promise((resolve) => {
      let i = 0;
      const d = E.DISTRICTS.find((x) => x.id === districtId) || E.DISTRICTS[0];
      const m = modal({ noHead: true, closable: false, cls: 'story-sheet', body: '', onClose: () => resolve() });
      const draw = () => {
        const ln = lines[i];
        m.setBody(`${i === 0 ? `<div class="story-city" style="background-image:${BG(d.id)}"><small>${opts && opts.label ? opts.label : T('new_district')}</small><b>${dName(d)}</b></div>` : `<div class="story-city" style="background-image:${BG(d.id)}"><b>${dName(d)}</b></div>`}
          <div class="story"><img src="assets/char_${ln.w}.svg" alt=""><div class="says"><small>${T(ln.w)}</small>${ln.text || T(ln.k, ln.vars)}</div></div>`);
        m.foot.innerHTML = ''; m.foot.style.display = '';
        m.foot.appendChild(btn(i < lines.length - 1 ? T('story_next') : T('ok'), 'green', () => { i++; if (i >= lines.length) m.close(); else draw(); }));
      };
      m.foot.style.display = ''; draw();
    });
  }
  const districtStory = { oldtown: 's_oldtown', neon: 's_neon', gardens: 's_gardens', orbit: 's_orbit', aurora: 's_aurora' };

  /* =================== game =================== */
  function bindGame() {
    S.view = new GameView($('#cv'), { onEnd: onGameEnd, onDeny: onDeny, onMove: onMove });
    $('#btn-pause').onclick = () => { SFX.click(); openPause(); };
    $$('#props .prop').forEach((b) => (b.onclick = () => onProp(b.dataset.prop)));
  }
  function applyCbSetting() { S.view.setColorblind(settings.cb); }
  function onDeny(reason) {
    buzz(40);
    if (reason === 'blocked') toast(T('toast_blocked'), 'bad');
    else if (reason === 'full') toast(T('toast_full'), 'bad');
    else if (reason === 'locked') toast(T('toast_locked'), 'bad');
  }
  function onMove(p) { $('#hud-progress').style.width = Math.round(p * 100) + '%'; hideCoach(); }
  function hideCoach() { const c = $('#coach'); if (!c.hidden) c.hidden = true; }
  function coach(key) { const c = $('#coach'); c.textContent = T(key); c.hidden = false; clearTimeout(coach.t); coach.t = setTimeout(hideCoach, 9000); }

  async function startLevel(n) {
    if (S.busy) return; S.busy = true;
    try {
      const r = await API.startLevel(n);
      S.run = { id: r.runId, attempt: r.attempt, start: Date.now() }; S.level = r.level; setProfile(r.profile, false);
      const d = E.DISTRICTS[r.level.district];
      // district intro story, once
      const seen = lsGet('nt_seen_story', {});
      if (districtStory[d.id] && !seen[d.id] && n === d.from) { seen[d.id] = true; lsSet('nt_seen_story', seen); await story([{ w: 'mira', k: districtStory[d.id] }], d.id); }
      $('#game-bg').style.backgroundImage = BG(d.id);
      $('#hud-district').textContent = dName(d); $('#hud-level').textContent = `${T('level')} ${n}`;
      $('#hud-progress').style.width = '0%';
      show('game');
      await sleep(60);
      S.view.setColorblind(settings.cb);
      S.view.load(r.level);
      if (r.freeBay) S.view.applyProp('bay');
      updateProps();
      // tutorial coach marks
      const tutKey = { 1: 'tut1', 2: 'tut2', 3: 'tut3', 4: 'tut4' }[n];
      const seenTips = lsGet('nt_tips', {});
      if (tutKey && !seenTips[tutKey]) { seenTips[tutKey] = 1; lsSet('nt_tips', seenTips); coach(tutKey); }
      else if (r.level.pods.some((p) => p.kind === 'mystery') && !seenTips.tut_mystery) { seenTips.tut_mystery = 1; lsSet('nt_tips', seenTips); coach('tut_mystery'); }
      else if (r.level.pods.some((p) => p.kind === 'lock') && !seenTips.tut_lock) { seenTips.tut_lock = 1; lsSet('nt_tips', seenTips); coach('tut_lock'); }
      else hideCoach();
      if (r.level.hard) toast('⚡ ' + T('boss'));
    } catch (e) {
      if (e.code === 'level_locked') { toast(T('toast_err'), 'bad'); refreshProfile(); }
      else toast(T('toast_err'), 'bad');
    } finally { S.busy = false; }
  }

  function updateProps() {
    const p = S.profile; if (!p || !S.level) return;
    $$('#props .prop').forEach((b) => {
      const k = b.dataset.prop, n = p.props[k] || 0, c = $('.cnt', b);
      if (n > 0) { c.textContent = n; c.classList.remove('ad'); b.classList.remove('empty'); }
      else { c.textContent = '▶'; c.classList.add('ad'); b.classList.add('empty'); }
    });
  }

  async function onProp(name) {
    if (!S.view.game || S.view.ended || S.view.paused || S.busy) return;
    const p = S.profile;
    if (name !== 'hint' && !S.view.canUse(name)) { toast(name === 'vip' ? T('toast_no_bay') : T('toast_busy'), 'bad'); return; }
    if ((p.props[name] || 0) < 1) { openGetProp(name); return; }
    S.busy = true;
    try {
      const r = await API.useProp(S.run.id, name); setProfile(r.profile, false);
      if (name === 'hint') { const ok = S.view.hint(); toast(ok ? T('toast_hint') : T('toast_nohint'), ok ? 'good' : 'bad'); }
      else { S.view.applyProp(name); SFX.pop(); }
    } catch (e) { toast(e.code === 'no_stock' ? T('toast_nocoins') : T('toast_err'), 'bad'); refreshProfile(); }
    finally { S.busy = false; }
  }
  function openGetProp(name) {
    S.view.paused = true;
    const price = S.config.propPrice[name];
    const m = modal({ title: propName(name), cls: 'center', onClose: () => { S.view.paused = false; },
      body: `<div class="card"><div class="ci">${ic(propIcon[name])}</div><div class="ct"><b>${propName(name)}</b><small>${T('prop_' + name + '_d')}</small></div></div>`,
      foot: [
        btn(`${ic('play')} ${T('get_prop_ad')}`, 'green', async () => { const r = await rewarded('free_prop', { prop: name, label: propName(name) + ' +1' }); if (r) { setProfile(r.profile); toast(`${T('toast_got')} ${propName(name)} +1`, 'good'); m.close(); } }),
        btn(`${ic('coin')} ${fmt(price)} · ${T('get_prop_coin')}`, 'gold', async () => {
          if (S.profile.coins < price) { toast(T('toast_nocoins'), 'bad'); return; }
          try { const r = await API.buyProp(name); setProfile(r.profile); toast(`${T('toast_got')} ${propName(name)} +1`, 'good'); m.close(); } catch (e) { toast(T('toast_err'), 'bad'); }
        }),
      ] });
  }

  function openPause() {
    S.view.paused = true;
    const m = modal({ title: T('pause'), cls: 'center', closable: false,
      body: `<div class="muted" style="padding:6px 0 4px">${T('level')} ${S.level.n}</div>`,
      foot: [btn(T('resume'), 'green', () => { S.view.paused = false; m.close(); }),
        btn(T('restart'), 'ghost', async () => { m.close(); await finishRun('quit'); startLevel(S.level.n); }),
        btn(T('quit'), 'ghost', async () => { m.close(); await finishRun('quit'); goHome(); })] });
  }
  async function finishRun(result, extra) {
    if (!S.run) return null;
    const run = S.run; S.run = null;
    try { const r = await API.finishLevel({ runId: run.id, result, actions: S.view.actions, durationMs: Date.now() - run.start, ...(extra || {}) }); setProfile(r.profile, false); return r; }
    catch (e) { if (e.code === 'invalid_run') toast('⚠️ ' + e.code, 'bad'); await refreshProfile(); return null; }
  }
  function goHome() { show('home'); renderHome(); }

  /* ---- end of level ---- */
  async function onGameEnd(status, info) {
    if (status === 'win') await onWin(info); else onLose(info);
  }
  async function onWin(info) {
    SFX.win(); buzz([30, 40, 60]); confetti();
    const run = S.run; const res = await finishRun('win');
    if (!res) { goHome(); return; }
    const level = S.level, d = E.DISTRICTS[level.district];
    const firstRun = { id: run.id };
    let reward = res.reward, doubled = false;
    const bossNote = level.hard ? `<div class="muted">⚡ ${T('boss')}</div>` : '';
    const stars = `<div class="stars">${[1, 2, 3].map((i) => ic(i <= res.stars ? 'star' : 'starOff')).join('')}</div>`;
    const lines = (r) => `<div class="reward-line">${ic('coin')} +<span id="rw">${fmt(r)}</span></div>`;
    const m = modal({ title: T('win'), closable: false, cls: 'center', body: `${stars}${bossNote}<div class="muted">${T('earned')}</div>${lines(reward)}`,
      foot: [] });
    const x2 = btn(`${ic('play')} ${T('x2')} <small style="display:inline;margin-left:4px">+${fmt(reward)}</small>`, 'green', async () => {
      x2.disabled = true;
      const r = await rewarded('double_reward', { runId: run.id, label: `+${fmt(reward)} ${ic('coin')}` });
      if (r) { doubled = true; setProfile(r.profile); const rw = $('#rw', m.el); countUp(rw, reward, reward * 2, 700); flyCoins(rw, 10); x2.remove(); }
      else x2.disabled = false;
    });
    const next = btn(`${T('next')} ›`, 'gold', async () => { m.close(); await afterWin(level, d, res); });
    m.foot.appendChild(x2); m.foot.appendChild(next);
    flyCoins($('.reward-line', m.el), 8);
    await sleep(0);
  }
  async function afterWin(level, d, res) {
    // district completed?
    if (level.n === d.to) {
      confetti(3200);
      const nx = E.DISTRICTS[E.districtOf(level.n + 1)];
      await story([{ w: 'pip', text: `${T('s_win_d', { d: dName(d) })}` }], d.id, { label: '💡 ' + T('restored') });
    }
    // interstitial (server decides; never for ad-free / VIP players)
    try {
      const r = await API.interstitial();
      if (r.show) { API.sendState('ad'); await UI.AdProvider.showInterstitial(); }
    } catch (e) {}
    startLevel(S.profile.level);
  }
  function onLose(info) {
    SFX.lose(); buzz(120);
    const p = S.profile, price = S.config.propPrice.bay;
    const m = modal({ title: T('lose'), closable: false, cls: 'center', body: `<div class="muted" style="margin-bottom:8px">${T('lose_sub')}</div><div style="font-size:68px;line-height:1">😮</div>`, foot: [] });
    const revive = btn(`${ic('play')} ${T('revive')}<small style="display:block;letter-spacing:0;font-size:12px;opacity:.9">${T('revive_sub')}</small>`, 'green', async () => {
      revive.disabled = true;
      const r = await rewarded('revive', { runId: S.run.id, label: T('revive') });
      if (r) { m.close(); S.view.applyRevive(); toast('+1 ' + T('p_bay'), 'good'); }
      else revive.disabled = false;
    });
    const buyBay = btn(`${ic('bay')} ${T('buy_bay')} · ${ic('coin')} ${fmt(price)}`, 'gold', async () => {
      if (p.props.bay > 0) { try { const r = await API.useProp(S.run.id, 'bay'); setProfile(r.profile, false); m.close(); S.view.applyProp('bay'); } catch (e) { toast(T('toast_err'), 'bad'); } return; }
      if (S.profile.coins < price) { toast(T('toast_nocoins'), 'bad'); return; }
      try { await API.buyProp('bay'); const r = await API.useProp(S.run.id, 'bay'); setProfile(r.profile, false); m.close(); S.view.applyProp('bay'); } catch (e) { toast(T('toast_err'), 'bad'); }
    });
    const retry = btn(T('retry'), 'ghost', async () => { m.close(); await finishRun('lose'); startLevel(S.level.n); });
    const home = btn(T('quit'), 'ghost', async () => { m.close(); await finishRun('lose'); goHome(); });
    m.foot.append(revive, buyBay, retry, home);
  }

  /* =================== daily =================== */
  function rewardIcon(r) { return r.prop ? ic(propIcon[r.prop]) : ic('coin'); }
  function rewardText(r) { return r.prop ? `×${r.n}${r.coins ? ' +' + fmt(r.coins) : ''}` : fmt(r.coins); }
  function openDaily() {
    const p = S.profile, cfg = S.config.daily;
    const m = modal({ title: T('daily_title'), body: '' });
    const draw = () => {
      const pr = S.profile, next = pr.daily.claimedToday ? pr.daily.day : pr.daily.next;
      const cells = cfg.map((r, i) => {
        const cls = (i + 1 === next && !pr.daily.claimedToday) ? 'cur' : (i + 1 <= pr.daily.day && pr.daily.claimedToday) || (i + 1 < next) ? 'done' : '';
        const extra = i === 6 ? 'big' : '';
        return `<div class="d ${cls} ${extra}"><div class="muted" style="font-size:12px">${T('daily_day')} ${i + 1}</div>${rewardIcon(r)}<div>${rewardText(r)}${r.prop2 ? ' +' + ic(propIcon[r.prop2]) + '×' + r.n2 : ''}</div></div>`;
      }).join('');
      m.setBody(`<div class="daily-grid">${cells}</div>`);
      m.foot.innerHTML = ''; m.foot.style.display = '';
      if (!pr.daily.claimedToday) m.foot.appendChild(btn(T('daily_claim'), 'green', async (b) => {
        b.disabled = true;
        try { const r = await API.dailyClaim(); setProfile(r.profile); SFX.coin(); flyCoins(m.body, 8); draw(); } catch (e) { toast(T('toast_err'), 'bad'); }
      }));
      else {
        if (!pr.daily.doubled) m.foot.appendChild(btn(`${ic('play')} ${T('daily_x2')}`, 'green', async (b) => {
          b.disabled = true; const r = await rewarded('daily_double', { label: T('daily_x2') }); if (r) { setProfile(r.profile); flyCoins(m.body, 8); draw(); } else b.disabled = false;
        }));
        m.foot.appendChild(html(`<div class="muted">${T('daily_done')}</div>`));
      }
      if (pr.vipClaimable) m.foot.appendChild(btn(`${ic('vip')} ${T('vip_claim')}`, 'gold', async () => { try { const r = await API.vipClaim(); setProfile(r.profile); flyCoins(m.body, 8); draw(); } catch (e) {} }));
    };
    draw();
  }

  /* =================== supplies (free gift) =================== */
  function openSupply() {
    const cfg = S.config.supply;
    const m = modal({ title: T('supply_title'), cls: 'center', body: '' });
    let iv;
    const draw = () => {
      const p = S.profile; const left = Math.max(0, p.supply.readyIn - (Date.now() - (S._profileAt || Date.now())) / 1000);
      m.setBody(`<div style="font-size:84px;line-height:1.1">${ic('gift', '')}</div><div class="reward-line" style="font-size:30px">${ic('coin')} ${fmt(cfg.coins)}</div>${left > 0 ? `<p class="muted">${T('supply_wait')} <b id="sleft">${mmss(left)}</b></p>` : ''}`);
      $('.ic', m.body).style.cssText = 'width:96px;height:96px';
      m.foot.innerHTML = ''; m.foot.style.display = '';
      const free = btn(T('supply_free'), 'gold', async () => { try { const r = await API.supplyClaim(); setProfile(r.profile); flyCoins(m.body, 6); await sleep(400); m.close(); } catch (e) { toast(T('ad_cooldown'), 'bad'); } });
      const ad = btn(`${ic('play')} ${T('supply_ad')} · ${fmt(cfg.coins * cfg.adMultiplier)}`, 'green', async () => { const r = await rewarded('supply', { label: `+${fmt(cfg.coins * cfg.adMultiplier)} ${ic('coin')}` }); if (r) { setProfile(r.profile); flyCoins(m.body, 10); await sleep(500); m.close(); } });
      if (left > 0) { free.disabled = true; ad.disabled = true; }
      m.foot.append(ad, free);
    };
    draw(); iv = setInterval(() => { if (!m.el.isConnected) return clearInterval(iv); const p = S.profile; const left = p.supply.readyIn - (Date.now() - (S._profileAt || Date.now())) / 1000; const el = $('#sleft', m.el); if (el) el.textContent = mmss(left); if (left <= 0 && el) draw(); }, 1000);
  }

  /* =================== spin =================== */
  const SLICE_COLORS = ['#ff5a64', '#ffb020', '#79d93a', '#19d3c5', '#3d8bff', '#9b6bff', '#ff5ea8', '#ff8a3d'];
  function wheelSVG(slices) {
    const n = slices.length, a = 360 / n, R = 140;
    const pt = (deg, r) => { const t = (deg - 90) * Math.PI / 180; return [150 + r * Math.cos(t), 150 + r * Math.sin(t)]; };
    let s = `<svg id="wheel" viewBox="0 0 300 300"><circle cx="150" cy="150" r="148" fill="#2a1f66" stroke="#fff" stroke-width="4"/>`;
    slices.forEach((sl, i) => {
      const [x1, y1] = pt(i * a, R), [x2, y2] = pt((i + 1) * a, R);
      s += `<path d="M150 150 L${x1} ${y1} A${R} ${R} 0 0 1 ${x2} ${y2}Z" fill="${SLICE_COLORS[i % SLICE_COLORS.length]}" stroke="#fff" stroke-width="2"/>`;
      const mid = i * a + a / 2, [tx, ty] = pt(mid, 98);
      const label = sl.coins ? `<text y="30" text-anchor="middle" font-size="22" font-weight="800" fill="#fff" stroke="#0006" stroke-width="3" paint-order="stroke" font-family="Baloo 2,system-ui,sans-serif">${sl.coins}</text><use href="assets/icons.svg#i-coin" x="-14" y="-18" width="28" height="28"/>`
        : `<use href="assets/icons.svg#i-${propIcon[sl.prop]}" x="-16" y="-20" width="32" height="32"/><text y="30" text-anchor="middle" font-size="20" font-weight="800" fill="#fff" stroke="#0006" stroke-width="3" paint-order="stroke" font-family="Baloo 2,system-ui,sans-serif">×${sl.n}</text>`;
      s += `<g transform="translate(${tx} ${ty}) rotate(${mid})">${label}</g>`;
    });
    s += `<circle cx="150" cy="150" r="22" fill="#fff"/><circle cx="150" cy="150" r="14" fill="#ff5ea8"/></svg>`;
    return s;
  }
  function openSpin() {
    const slices = S.config.spin.slices; let rot = 0, spinning = false;
    const m = modal({ title: T('spin_title'), cls: 'center', body: `<div class="wheel-wrap"><div class="pointer"></div>${wheelSVG(slices)}</div><div id="spin-info" class="muted"></div>`, foot: [] });
    const info = $('#spin-info', m.el);
    const draw = () => {
      const p = S.profile; const left = Math.max(0, p.spin.freeIn - (Date.now() - (S._profileAt || Date.now())) / 1000);
      m.foot.innerHTML = '';
      if (left <= 0) m.foot.appendChild(btn(T('spin_free'), 'gold', () => go('free')));
      else if (p.spin.extra > 0) m.foot.appendChild(btn(`${T('spin_extra')} (${p.spin.extra})`, 'gold', () => go('extra')));
      else {
        m.foot.appendChild(btn(`${ic('play')} ${T('spin_ad')}`, 'green', async () => { const r = await rewarded('spin', { label: T('spin_title') }); if (r) { setProfile(r.profile); draw(); } }));
      }
      info.textContent = left > 0 ? `${T('spin_next')} ${mmss(left)}` : '';
    };
    async function go(mode) {
      if (spinning) return; spinning = true; m.foot.innerHTML = '';
      try {
        const r = await API.spin(mode); const sl = r.slice, idx = slices.findIndex((x) => x.id === sl.id);
        const a = 360 / slices.length; rot += 360 * 6 + ((-(idx * a + a / 2) - rot) % 360 + 360) % 360;
        const w = $('#wheel', m.el); w.style.transform = `rotate(${rot}deg)`;
        const tk = setInterval(() => SFX.spin(), 120);
        await sleep(4300); clearInterval(tk);
        SFX.win(); confetti(1800); setProfile(r.profile); flyCoins($('.wheel-wrap', m.el), sl.coins ? 10 : 3);
        info.innerHTML = `${T('spin_won')} ${sl.coins ? `${ic('coin')} ${fmt(sl.coins)}` : `${ic(propIcon[sl.prop])} ×${sl.n}`}`;
      } catch (e) { toast(T('toast_err'), 'bad'); }
      spinning = false; setTimeout(draw, 1400);
    }
    draw();
    const iv = setInterval(() => { if (!m.el.isConnected) return clearInterval(iv); if (!spinning) draw(); }, 1000);
  }

  /* =================== missions =================== */
  function missionText(m) {
    const col = m.color != null ? T(NT_COLORS[m.color].key) : '';
    return T('m_' + m.id, { n: m.goal, c: col });
  }
  function openMissions() {
    const m = modal({ title: T('missions_title'), body: '' });
    const draw = () => {
      const p = S.profile; const allClaimed = p.missions.every((x) => x.claimed);
      const rows = p.missions.map((x, i) => {
        const done = x.progress >= x.goal;
        return `<div class="mission"><div class="ci" style="width:48px;height:48px;border-radius:14px;background:rgba(255,255,255,.1);display:grid;place-items:center">${rewardIcon(x.reward)}</div>
          <div class="mt"><b>${missionText(x)}</b><div class="mbar"><i style="width:${Math.min(100, (x.progress / x.goal) * 100)}%"></i></div><div class="mp">${x.progress}/${x.goal} · ${x.reward.prop ? '×' + x.reward.n + ' ' + propName(x.reward.prop) : '+' + fmt(x.reward.coins)}</div></div>
          <button class="btn ${x.claimed ? 'ghost' : done ? 'green' : 'ghost'}" data-i="${i}" ${(!done || x.claimed) ? 'disabled' : ''} style="min-height:42px;padding:0 14px;font-size:16px">${x.claimed ? '✓' : T('claim')}</button></div>`;
      }).join('');
      const ch = S.config.missions.chest;
      m.setBody(`${rows}<div class="mission" style="border-color:var(--gold)"><div class="ci" style="width:48px;height:48px;display:grid;place-items:center">${ic('gift')}</div><div class="mt"><b>${T('mission_chest')}</b><div class="mp">${T('mission_chest_note')}<br>+${fmt(ch.coins)} ${ic('coin')} · ×${ch.n} ${ic('vip')}</div></div><button class="btn gold" id="chest" ${allClaimed && !p.chestClaimed ? '' : 'disabled'} style="min-height:42px;padding:0 14px;font-size:16px">${p.chestClaimed ? '✓' : T('claim')}</button></div><p class="muted" style="text-align:center;font-size:13px">${T('mission_resets')}</p>`);
      $$('button[data-i]', m.body).forEach((b) => (b.onclick = async () => { try { const r = await API.missionClaim(+b.dataset.i); setProfile(r.profile); flyCoins(b, 6); SFX.coin(); draw(); } catch (e) { toast(T('toast_err'), 'bad'); } }));
      const c = $('#chest', m.body); if (c) c.onclick = async () => { try { const r = await API.chestClaim(); setProfile(r.profile); confetti(1600); flyCoins(c, 12); draw(); } catch (e) {} };
    };
    draw();
  }

  /* =================== shop =================== */
  const price = (c) => '$' + (c / 100).toFixed(2);
  function grantText(g) {
    const a = [];
    if (g.coins) a.push(`${ic('coin')} ${fmt(g.coins)}`);
    if (g.props) for (const [k, v] of Object.entries(g.props)) a.push(`${ic(propIcon[k])}×${v}`);
    if (g.adFree) a.push(`${ic('noads')}`);
    if (g.vipDays) a.push(`${ic('vip')} ${g.vipDays} ${I18N.lang === 'tr' ? 'gün' : 'days'}`);
    return a.join(' &nbsp; ');
  }
  function openShop(tab) {
    const m = modal({ title: T('shop_title'), body: '' });
    const tabsEl = html(`<div class="tabs"></div>`); $('.tabs-slot', m.el).appendChild(tabsEl);
    const TABS = [['offers', 'tab_offers'], ['coins', 'tab_coins'], ['plus', 'tab_plus'], ['props', 'tab_props']];
    let cur = tab || 'offers';
    const draw = () => {
      tabsEl.innerHTML = TABS.map(([id, k]) => `<button data-t="${id}" class="${id === cur ? 'on' : ''}">${T(k)}</button>`).join('');
      $$('button', tabsEl).forEach((b) => (b.onclick = () => { SFX.click(); cur = b.dataset.t; draw(); }));
      const p = S.profile; const prods = S.config.products;
      let list = [];
      if (cur === 'offers') list = prods.filter((x) => ['starter', 'pro', 'adfree'].includes(x.id));
      if (cur === 'coins') list = prods.filter((x) => x.id.startsWith('coins_'));
      if (cur === 'plus') list = prods.filter((x) => x.id.startsWith('plus'));
      let h = '';
      if (cur === 'plus') h += p.vip ? `<div class="card" style="border-color:var(--gold)"><div class="ci">${ic('vip')}</div><div class="ct"><b>${T('plus_active')}</b><small>${Math.ceil((p.vipUntil - Date.now()) / 864e5)} ${T('days_left')}</small></div></div>` : '';
      if (cur === 'props') {
        h += ['reorder', 'bay', 'vip', 'hint'].map((k) => `<div class="card"><div class="ci">${ic(propIcon[k])}</div><div class="ct"><b>${propName(k)} <span class="muted">×${p.props[k] || 0}</span></b><small>${T('prop_' + k + '_d')}</small></div><button class="btn gold" data-prop="${k}">${ic('coin')} ${fmt(S.config.propPrice[k])}</button></div>`).join('');
      }
      h += list.map((pr) => {
        const owned = (pr.oneTime && p.oneTime.includes(pr.id)) || (pr.id === 'adfree' && p.adFree && !p.vip && false) || (pr.id === 'adfree' && S.profile.adFree && !S.profile.vip && S.profile._adFreeBought);
        const locked = pr.unlockLevel && p.bestLevel + 1 < pr.unlockLevel;
        const tag = pr.badge === 'popular' ? `<span class="tag">${I18N.lang === 'tr' ? 'POPÜLER' : 'POPULAR'}</span>` : pr.badge === 'value' ? `<span class="tag gold">${I18N.lang === 'tr' ? 'AVANTAJ' : 'BEST VALUE'}</span>` : pr.badge === 'once' ? `<span class="tag">${I18N.lang === 'tr' ? 'TEK SEFER' : 'ONE-TIME'}</span>` : '';
        const title = pr.title[I18N.lang] || pr.title.en, desc = pr.desc ? (pr.desc[I18N.lang] || pr.desc.en) : '';
        return `<div class="card ${owned ? 'dim' : ''}">${tag}<div class="ci">${ic(pr.id === 'adfree' ? 'noads' : pr.id.startsWith('plus') ? 'vip' : pr.cents >= 499 ? 'gift' : 'coin')}</div><div class="ct"><b>${title}</b><small>${desc || grantText(pr.grant)}</small>${desc ? `<small>${grantText(pr.grant)}</small>` : ''}${locked ? `<small style="color:var(--gold)">🔒 ${T('locked_lv', { n: pr.unlockLevel })}</small>` : ''}</div>
          <button class="btn green" data-pid="${pr.id}" ${owned || locked ? 'disabled' : ''}>${owned ? T('owned') : price(pr.cents)}</button></div>`;
      }).join('');
      m.setBody(h);
      $$('button[data-pid]', m.body).forEach((b) => (b.onclick = async () => {
        const pr = S.config.products.find((x) => x.id === b.dataset.pid);
        const ok = await payment(pr, price(pr.cents)); if (!ok) return;
        try { const r = await API.purchase(pr.id); setProfile(r.profile); SFX.win(); confetti(1500); toast(T('toast_bought'), 'good'); flyCoins(b, 10); draw(); }
        catch (e) { toast(T('toast_err') + ' (' + e.code + ')', 'bad'); }
      }));
      $$('button[data-prop]', m.body).forEach((b) => (b.onclick = async () => {
        const k = b.dataset.prop; if (S.profile.coins < S.config.propPrice[k]) { toast(T('toast_nocoins'), 'bad'); return; }
        try { const r = await API.buyProp(k); setProfile(r.profile); SFX.coin(); draw(); } catch (e) { toast(T('toast_err'), 'bad'); }
      }));
    };
    draw();
  }

  /* =================== leaderboard =================== */
  async function openRank() {
    const m = modal({ title: T('rank_title'), body: '<div class="muted" style="text-align:center;padding:30px">…</div>' });
    try {
      const r = await API.leaderboard();
      const medal = (i) => (i === 1 ? '🥇' : i === 2 ? '🥈' : i === 3 ? '🥉' : i);
      let h = r.top.map((x) => `<div class="lb-row ${x.me ? 'me' : ''}"><span class="r">${medal(x.rank)}</span><span class="n">${x.name.replace(/</g, '&lt;')}</span><span class="l">${T('level')} ${x.level}</span><span class="l">${ic('star')}${x.stars}</span></div>`).join('');
      if (!r.top.some((x) => x.me)) h += `<div class="muted" style="text-align:center">⋯</div><div class="lb-row me"><span class="r">${r.me.rank}</span><span class="n">${T('your_rank')}</span><span class="l">${T('level')} ${r.me.level}</span><span class="l">${ic('star')}${r.me.stars}</span></div>`;
      m.setBody(h || `<div class="muted" style="text-align:center;padding:30px">—</div>`);
    } catch (e) { m.setBody(`<div class="muted" style="text-align:center">${T('toast_err')}</div>`); }
  }

  /* =================== settings =================== */
  function openSettings() {
    const p = S.profile;
    const m = modal({ title: T('settings'), body: '' });
    const draw = () => {
      m.setBody(`<div class="toggle"><span>${T('name')}</span><span style="display:flex;gap:8px;max-width:60%"><input class="field" id="nm" maxlength="16" value="${p.name.replace(/"/g, '')}" style="padding:8px 10px;font-size:16px"><button class="btn green" id="nmsave" style="min-height:42px;padding:0 14px;font-size:15px">${T('save')}</button></span></div>
        <div class="toggle"><span>${T('language')}</span><span class="seg"><button data-l="tr" class="${I18N.lang === 'tr' ? 'on' : ''}">TR</button><button data-l="en" class="${I18N.lang === 'en' ? 'on' : ''}">EN</button></span></div>
        <div class="toggle"><span>${T('sound')}</span><span class="sw ${settings.sound ? 'on' : ''}" data-k="sound"></span></div>
        <div class="toggle"><span>${T('haptics')}</span><span class="sw ${settings.haptics ? 'on' : ''}" data-k="haptics"></span></div>
        <div class="toggle"><span>${T('colorblind')}</span><span class="sw ${settings.cb ? 'on' : ''}" data-k="cb"></span></div>
        <p class="muted" style="font-size:12px;text-align:center;margin:12px 0 0">ID #${p.id} · ${T('privacy')}</p>`);
      $$('.sw', m.body).forEach((s) => (s.onclick = () => { const k = s.dataset.k; settings[k] = !settings[k]; saveSettings(); if (k === 'cb') S.view.setColorblind(settings.cb); SFX.click(); draw(); }));
      $$('.seg button', m.body).forEach((b) => (b.onclick = async () => { localStorage.setItem('nt_lang', b.dataset.l); I18N.setLang(b.dataset.l); try { await API.setProfile({ lang: b.dataset.l }); } catch (e) {} renderHome(); m.close(); openSettings(); }));
      $('#nmsave', m.body).onclick = async () => { try { const r = await API.setProfile({ name: $('#nm', m.body).value }); setProfile(r.profile); toast(T('toast_got') + ' ✓', 'good'); } catch (e) { toast(T('toast_err'), 'bad'); } };
    };
    draw();
  }

  window.__NT = S;
  window.addEventListener('load', () => boot());
  // stamp every profile assignment (used for client-side countdowns)
  let _p = null;
  Object.defineProperty(S, 'profile', { get() { return _p; }, set(v) { _p = v; S._profileAt = Date.now(); }, configurable: true });
})();
