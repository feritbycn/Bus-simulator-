const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const { DATA_DIR } = require('./db');
const G = require('./game');
const live = require('./live');
const stats = require('./stats');

const PORT = +(process.env.PORT || 3000);
const PUBLIC = path.join(__dirname, '..', 'public');
const SHARED = path.join(__dirname, '..', 'shared');

/* admin key: env or generated once and stored in data/admin.key */
let ADMIN_KEY = process.env.ADMIN_KEY;
if (!ADMIN_KEY) {
  const f = path.join(DATA_DIR, 'admin.key');
  if (fs.existsSync(f)) ADMIN_KEY = fs.readFileSync(f, 'utf8').trim();
  else { ADMIN_KEY = crypto.randomBytes(9).toString('base64url'); fs.writeFileSync(f, ADMIN_KEY); }
}
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '200kb' }));
/* CORS for the Android/iOS app shell (Capacitor origins). Auth is by x-token header, not cookies. */
app.use('/api', (req, res, next) => {
  const o = req.get('origin');
  if (o && /^(https?:\/\/localhost|capacitor:\/\/localhost)(:\d+)?$/.test(o)) {
    res.setHeader('Access-Control-Allow-Origin', o);
    res.setHeader('Access-Control-Allow-Headers', 'content-type,x-token');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Vary', 'Origin');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
  }
  next();
});
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

/* tiny in-memory rate limiter: per player token (authed) or per IP (anonymous) */
const hits = new Map();
setInterval(() => hits.clear(), 60000).unref();
const LIM_TOKEN = +(process.env.RATE_PER_PLAYER || 240), LIM_IP = +(process.env.RATE_PER_IP || 3000);
app.use('/api', (req, res, next) => {
  const t = req.get('x-token'); const k = t ? 't:' + t : 'i:' + req.ip;
  const n = (hits.get(k) || 0) + 1; hits.set(k, n);
  if (n > (t ? LIM_TOKEN : LIM_IP)) return res.status(429).json({ error: 'rate_limited' });
  next();
});

/* ---------- public ---------- */
app.get('/api/config', (req, res) => res.json(G.publicConfig()));
app.get('/api/live', (req, res) => res.json(live.counts()));
app.get('/api/level/:n', (req, res) => {
  const n = Math.max(1, Math.min(100000, parseInt(req.params.n, 10) || 1));
  res.json(G.getLevel(n));
});
app.get('/healthz', (req, res) => res.json({ ok: true, ...live.counts() }));

app.post('/api/register', (req, res) => {
  const country = req.headers['cf-ipcountry'] || req.headers['x-vercel-ip-country'] || (req.body && req.body.country) || '';
  const { p, created } = G.register({ ...req.body, country });
  live.touchSession(p.id);
  res.json({ token: p.token, created, profile: G.profile(p), live: live.counts() });
});

/* ---------- authed ---------- */
const auth = (req, res, next) => {
  const p = G.loadByToken(req.get('x-token'));
  if (!p) return res.status(401).json({ error: 'unauthorized' });
  req.player = p; next();
};
/** wrap handler: loads player, runs fn(p) -> extra, saves, returns profile+extra */
const act = (fn, { save = true } = {}) => (req, res, next) => {
  try {
    const p = req.player;
    const extra = fn(p, req.body || {}, req) || {};
    if (save) G.save(p);
    res.json({ ok: true, ...extra, profile: G.profile(p) });
  } catch (e) { next(e); }
};

app.get('/api/me', auth, (req, res) => { live.ping(req.player.id); res.json({ profile: G.profile(req.player), live: live.counts() }); });
app.post('/api/profile', auth, act((p, b) => {
  const name = String(b.name || '').replace(/[^\p{L}\p{N} _.\-]/gu, '').trim().slice(0, 16);
  if (name.length >= 2) p.name = name;
  if (['tr', 'en'].includes(b.lang)) p.lang = b.lang;
}));
app.post('/api/level/start', auth, act((p, b) => G.startLevel(p, b.level), { save: false }));
app.post('/api/level/finish', auth, act((p, b) => G.finishLevel(p, b), { save: false }));
app.post('/api/prop/use', auth, act((p, b) => { G.useProp(p, b); }));
app.post('/api/prop/buy', auth, act((p, b) => { G.buyProp(p, b.prop); }));
app.post('/api/ad/start', auth, act((p, b) => G.adStart(p, b), { save: false }));
app.post('/api/ad/complete', auth, act((p, b) => G.adComplete(p, b), { save: false }));
app.post('/api/ad/fail', auth, act((p, b) => { G.adFail(p, b.token); }, { save: false }));
app.post('/api/ad/interstitial', auth, act((p) => G.interstitialCheck(p), { save: false }));
app.post('/api/daily/claim', auth, act((p) => G.dailyClaim(p)));
app.post('/api/spin', auth, act((p, b) => G.spin(p, b.mode)));
app.post('/api/supply/claim', auth, act((p) => G.supplyClaim(p)));
app.post('/api/mission/claim', auth, act((p, b) => G.missionClaim(p, b.index)));
app.post('/api/mission/chest', auth, act((p) => G.chestClaim(p)));
app.post('/api/vip/claim', auth, act((p) => G.vipClaim(p)));
app.post('/api/shop/purchase', auth, act((p, b) => G.purchase(p, b)));
app.get('/api/leaderboard', auth, (req, res) => res.json(G.leaderboard(req.player)));

/* ---------- admin ---------- */
const adminAuth = (req, res, next) => {
  if (!safeEq(req.get('x-admin-key') || req.query.key || '', ADMIN_KEY)) return res.status(401).json({ error: 'unauthorized' });
  next();
};
app.get('/api/admin/overview', adminAuth, (req, res) => res.json(stats.overviewCached(req.query.fresh ? 0 : 5000)));
app.get('/api/admin/players', adminAuth, (req, res) => res.json({ players: stats.recentPlayers(+req.query.limit || 50) }));

/* ---------- static ---------- */
app.use('/shared', express.static(SHARED, { maxAge: '5m' }));
app.use(express.static(PUBLIC, { maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0, extensions: ['html'] }));
app.get('/admin', (req, res) => res.sendFile(path.join(PUBLIC, 'admin', 'index.html')));

app.use((e, req, res, next) => {
  if (e instanceof G.ApiError) return res.status(e.status).json({ error: e.code, ...(e.extra || {}) });
  console.error(e);
  res.status(500).json({ error: 'server_error' });
});

/* ---------- WebSocket ---------- */
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });
const wssAdmin = new WebSocketServer({ noServer: true, maxPayload: 1024 });

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/ws') {
    const p = G.loadByToken(url.searchParams.get('token'));
    if (!p) { socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, (ws) => { ws._pid = p.id; ws._name = p.name; wss.emit('connection', ws, req); });
  } else if (url.pathname === '/ws/admin') {
    if (!safeEq(url.searchParams.get('key') || '', ADMIN_KEY)) { socket.destroy(); return; }
    wssAdmin.handleUpgrade(req, socket, head, (ws) => wssAdmin.emit('connection', ws, req));
  } else socket.destroy();
});

wss.on('connection', (ws) => {
  ws._lastPing = Date.now();
  live.attach(ws._pid, ws, ws._name);
  ws.send(JSON.stringify({ t: 'live', ...live.counts() }));
  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    ws._lastPing = Date.now();
    if (m.t === 'ping') { live.ping(ws._pid); ws.send('{"t":"pong"}'); }
    else if (m.t === 'state' && ['menu', 'playing', 'shop', 'ad', 'story'].includes(m.s)) live.setState(ws._pid, m.s, m.level);
  });
  ws.on('close', () => live.detach(ws._pid, ws));
  ws.on('error', () => {});
});

wssAdmin.on('connection', (ws) => {
  ws.send(JSON.stringify({ t: 'overview', ...stats.overviewCached(0) }));
  ws.on('error', () => {});
});

/* ---------- timers ---------- */
setInterval(() => live.sample(), 10000).unref();
setInterval(() => live.persistMinute(), 60000).unref();
setInterval(() => live.sweep(), 30000).unref();
setInterval(() => live.broadcast({ t: 'live', ...live.counts() }), 5000).unref();
setInterval(() => {
  if (!wssAdmin.clients.size) return;
  const msg = JSON.stringify({ t: 'overview', ...stats.overviewCached(6000) });
  for (const c of wssAdmin.clients) if (c.readyState === 1) c.send(msg);
}, 3000).unref();

server.listen(PORT, () => {
  console.log(`\n  Nova Transit server   http://localhost:${PORT}`);
  console.log(`  Admin dashboard       http://localhost:${PORT}/admin   (key: ${ADMIN_KEY})\n`);
});
module.exports = { app, server };
