/* Real-time presence: who is connected, who is inside a level right now. */
const { q, dayKey } = require('./db');

const players = new Map();       // playerId -> { sockets:Set, state, level, since, name }
const SESSION_GAP = 5 * 60 * 1000;
const ring = [];                 // in-memory 10s samples for the live chart
const RING_MAX = 360;            // 1 hour

const selSess = q('SELECT id,last_ping FROM sessions WHERE player_id=? ORDER BY last_ping DESC LIMIT 1');
const insSess = q('INSERT INTO sessions(player_id,start,last_ping,day) VALUES(?,?,?,?)');
const updSess = q('UPDATE sessions SET last_ping=? WHERE id=?');
const updSeen = q('UPDATE players SET last_seen=? WHERE id=?');
const insMin = q('INSERT OR REPLACE INTO metrics_minute(ts,online,playing) VALUES(?,?,?)');

function touchSession(playerId) {
  const now = Date.now();
  const s = selSess.get(playerId);
  if (s && now - s.last_ping < SESSION_GAP) updSess.run(now, s.id);
  else insSess.run(playerId, now, now, dayKey(now));
  updSeen.run(now, playerId);
}

function attach(playerId, ws, name) {
  let p = players.get(playerId);
  if (!p) { p = { sockets: new Set(), state: 'menu', level: 0, since: Date.now(), name }; players.set(playerId, p); }
  p.sockets.add(ws); p.name = name || p.name;
  touchSession(playerId);
}
function detach(playerId, ws) {
  const p = players.get(playerId);
  if (!p) return;
  p.sockets.delete(ws);
  if (!p.sockets.size) { touchSession(playerId); players.delete(playerId); }
}
function setState(playerId, state, level) {
  const p = players.get(playerId);
  if (!p) return;
  if (p.state !== state) p.since = Date.now();
  p.state = state; p.level = level | 0;
}
function ping(playerId) { if (players.has(playerId)) touchSession(playerId); }

function counts() {
  let online = 0, playing = 0;
  for (const p of players.values()) { online++; if (p.state === 'playing') playing++; }
  return { online, playing };
}
function snapshot() {
  const byState = {};
  for (const p of players.values()) byState[p.state] = (byState[p.state] || 0) + 1;
  return { ...counts(), byState };
}
function sample() {
  const c = counts(); const ts = Date.now();
  ring.push({ ts, ...c }); if (ring.length > RING_MAX) ring.shift();
  return { ts, ...c };
}
function persistMinute() { const c = counts(); insMin.run(Math.floor(Date.now() / 60000) * 60000, c.online, c.playing); }
function recentRing() { return ring; }
function liveList(limit = 30) {
  const out = [];
  for (const [id, p] of players) out.push({ id, name: p.name, state: p.state, level: p.level, sec: Math.round((Date.now() - p.since) / 1000) });
  return out.sort((a, b) => a.sec - b.sec).slice(0, limit);
}
/** broadcast to every connected player socket */
function broadcast(obj) {
  const msg = JSON.stringify(obj);
  for (const p of players.values()) for (const ws of p.sockets) if (ws.readyState === 1) ws.send(msg);
}
/** drop players that have not pinged for a while (half-open sockets) */
function sweep(maxIdleMs = 70000) {
  const now = Date.now();
  for (const [id, p] of players) for (const ws of [...p.sockets]) if (now - (ws._lastPing || 0) > maxIdleMs) { try { ws.terminate(); } catch (e) {} detach(id, ws); }
}
module.exports = { attach, detach, setState, ping, counts, snapshot, sample, persistMinute, recentRing, liveList, broadcast, sweep, touchSession };
