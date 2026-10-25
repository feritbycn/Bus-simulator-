/* Thin API + realtime client. */
(function () {
  const LS = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } };
  let token = LS('nt_token');
  let deviceId = LS('nt_device');
  if (!deviceId) { deviceId = (crypto.randomUUID ? crypto.randomUUID() : 'd-' + Math.random().toString(36).slice(2) + Date.now().toString(36)); LS('nt_device', deviceId); }
  let ws = null, wsTimer = null, pingTimer = null, wsState = { s: 'menu', level: 0 };
  const listeners = { live: [] };

  const BASE = (window.NT_SERVER || '').replace(/\/$/, '');
  async function req(path, body, method) {
    const opt = { method: method || (body ? 'POST' : 'GET'), headers: { 'content-type': 'application/json' } };
    if (token) opt.headers['x-token'] = token;
    if (body) opt.body = JSON.stringify(body);
    const r = await fetch(BASE + path, opt);
    let j = null; try { j = await r.json(); } catch (e) {}
    if (!r.ok) { const err = new Error((j && j.error) || 'http_' + r.status); err.status = r.status; err.code = (j && j.error) || 'http'; throw err; }
    return j;
  }
  async function register(lang) {
    const j = await req('/api/register', { deviceId, lang, platform: /android/i.test(navigator.userAgent) ? 'android' : /iphone|ipad/i.test(navigator.userAgent) ? 'ios' : 'web' });
    token = j.token; LS('nt_token', token);
    return j;
  }
  function connectWS() {
    if (!token) return;
    clearTimeout(wsTimer);
    const wsBase = BASE ? BASE.replace(/^http/, 'ws') : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;
    try { ws = new WebSocket(`${wsBase}/ws?token=${token}`); } catch (e) { return; }
    ws.onopen = () => { sendState(wsState.s, wsState.level); clearInterval(pingTimer); pingTimer = setInterval(() => ws && ws.readyState === 1 && ws.send('{"t":"ping"}'), 20000); };
    ws.onmessage = (ev) => { let m; try { m = JSON.parse(ev.data); } catch (e) { return; } if (m.t === 'live') listeners.live.forEach((f) => f(m)); };
    ws.onclose = () => { clearInterval(pingTimer); wsTimer = setTimeout(connectWS, 2500 + Math.random() * 2000); };
    ws.onerror = () => { try { ws.close(); } catch (e) {} };
  }
  function sendState(s, level) { wsState = { s, level: level || 0 }; if (ws && ws.readyState === 1) ws.send(JSON.stringify({ t: 'state', s, level: level || 0 })); }
  window.API = {
    get token() { return token; },
    register, connectWS, sendState,
    onLive(f) { listeners.live.push(f); },
    config: () => req('/api/config'),
    me: () => req('/api/me'),
    live: () => req('/api/live'),
    setProfile: (b) => req('/api/profile', b),
    startLevel: (level) => req('/api/level/start', { level }),
    finishLevel: (b) => req('/api/level/finish', b),
    useProp: (runId, prop) => req('/api/prop/use', { runId, prop }),
    buyProp: (prop) => req('/api/prop/buy', { prop }),
    adStart: (b) => req('/api/ad/start', b),
    adComplete: (b) => req('/api/ad/complete', b),
    adFail: (token) => req('/api/ad/fail', { token }),
    interstitial: () => req('/api/ad/interstitial', {}),
    dailyClaim: () => req('/api/daily/claim', {}),
    spin: (mode) => req('/api/spin', { mode }),
    supplyClaim: () => req('/api/supply/claim', {}),
    missionClaim: (index) => req('/api/mission/claim', { index }),
    chestClaim: () => req('/api/mission/chest', {}),
    vipClaim: () => req('/api/vip/claim', {}),
    purchase: (productId) => req('/api/shop/purchase', { productId, provider: 'mock' }),
    leaderboard: () => req('/api/leaderboard'),
  };
})();
