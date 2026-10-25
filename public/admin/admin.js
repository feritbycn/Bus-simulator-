(function () {
  const $ = (s) => document.querySelector(s);
  let KEY = localStorage.getItem('nt_admin_key') || new URLSearchParams(location.search).get('key') || '';
  const nf = new Intl.NumberFormat('en-US');
  const money = (c) => '$' + (c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const set = (id, v) => { const e = $(id); if (e) e.textContent = v; };
  const delta = (a, b) => { if (!b) return ''; const d = Math.round(((a - b) / b) * 100); return `<span class="${d >= 0 ? 'up' : 'down'}">${d >= 0 ? '▲' : '▼'} ${Math.abs(d)}%</span> vs yesterday`; };

  function line(svg, series, opts) {
    const W = 600, H = 170, pl = 34, pr = 8, pt = 8, pb = 20;
    const n = Math.max(...series.map((s) => s.data.length), 2);
    const max = Math.max(1, ...series.flatMap((s) => s.data)) * 1.12;
    const x = (i) => pl + (i / (n - 1)) * (W - pl - pr), y = (v) => pt + (1 - v / max) * (H - pt - pb);
    let s = '';
    for (let g = 0; g <= 4; g++) { const v = (max / 4) * g, yy = y(v); s += `<line x1="${pl}" x2="${W - pr}" y1="${yy}" y2="${yy}" stroke="rgba(255,255,255,.07)"/><text x="${pl - 5}" y="${yy + 3}" text-anchor="end">${opts && opts.money ? '$' + Math.round(v / 100) : Math.round(v)}</text>`; }
    series.forEach((se) => {
      if (se.bars) { const bw = (W - pl - pr) / n * 0.62; se.data.forEach((v, i) => { s += `<rect x="${x(i) - bw / 2}" y="${y(v)}" width="${bw}" height="${H - pb - y(v)}" rx="3" fill="${se.color}" opacity=".85"/>`; }); return; }
      const pts = se.data.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
      if (se.fill) s += `<path d="M${x(0)},${H - pb} L${pts.join(' L')} L${x(se.data.length - 1)},${H - pb}Z" fill="${se.color}" opacity=".16"/>`;
      s += `<polyline points="${pts.join(' ')}" fill="none" stroke="${se.color}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>`;
    });
    if (opts && opts.labels) opts.labels.forEach((l, i) => { if (l && (i % Math.ceil(n / 7) === 0 || i === n - 1)) s += `<text x="${x(i)}" y="${H - 5}" text-anchor="middle">${l}</text>`; });
    svg.innerHTML = s;
  }
  const tbl = (el, head, rows) => { el.innerHTML = (head ? `<tr>${head.map((h, i) => `<th class="${i ? 'n' : ''}">${h}</th>`).join('')}</tr>` : '') + rows.map((r) => `<tr>${r.map((c, i) => `<td class="${i ? 'n' : ''}">${c}</td>`).join('')}</tr>`).join('') || '<tr><td>—</td></tr>'; };

  function render(o) {
    set('#k-online', nf.format(o.live.online)); set('#k-playing', nf.format(o.live.playing)); set('#k-peak', nf.format(Math.max(o.peak24, o.live.online)));
    set('#k-states', Object.entries(o.live.byState || {}).map(([k, v]) => `${k}: ${v}`).join(' · ') || 'no one connected');
    set('#k-dau', nf.format(o.users.dau)); $('#k-dau-s').innerHTML = delta(o.users.dau, o.users.dauYesterday) || '&nbsp;';
    set('#k-wau', nf.format(o.users.wau)); set('#k-mau', `MAU ${nf.format(o.users.mau)} · stickiness ${o.users.stickiness}%`);
    set('#k-new', nf.format(o.users.newToday)); set('#k-total', `${nf.format(o.users.total)} registered total`);
    set('#k-sess', nf.format(o.sessions.today)); set('#k-sess-s', `avg ${o.sessions.avgMin} min · ${o.sessions.perDau}/player`);
    set('#k-runs', nf.format(o.gameplay.runsToday)); set('#k-runs-s', `win rate ${o.gameplay.winRate}% · max level ${o.gameplay.maxLevel}${o.gameplay.invalid ? ' · ⚠ ' + o.gameplay.invalid + ' invalid' : ''}`);
    set('#k-rev', money(o.revenue.todayCents)); set('#k-rev-s', `${o.revenue.ordersToday} orders · 7d ${money(o.revenue.today7)} · 30d ${money(o.revenue.today30)}`);
    set('#today', o.today + ' UTC'); set('#updated', 'updated ' + new Date(o.now).toLocaleTimeString());

    const ring = o.ring.slice(-120);
    line($('#c-live'), [{ data: ring.map((r) => r.online), color: '#2fd98a', fill: true }, { data: ring.map((r) => r.playing), color: '#17c3ff' }]);
    const hr = o.hourly;
    line($('#c-hourly'), [{ data: hr.map((r) => r.max), color: '#7c5cff', bars: true }, { data: hr.map((r) => r.playing), color: '#ff5ea8' }], { labels: hr.map((r) => new Date(r.ts).getHours() + 'h') });
    const sr = o.series;
    line($('#c-dau'), [{ data: sr.map((r) => r.dau), color: '#17c3ff', fill: true }, { data: sr.map((r) => r.new), color: '#ffcf4a' }], { labels: sr.map((r) => r.day.slice(5)) });
    line($('#c-rev'), [{ data: sr.map((r) => r.cents), color: '#2fd98a', bars: true }], { money: true, labels: sr.map((r) => r.day.slice(5)) });

    const iapC = o.revenue.todayCents, adC = o.ads.estRevenueCents;
    tbl($('#t-money'), null, [
      ['IAP revenue', money(iapC)], ['Ad revenue (est.)', money(adC)], ['Total', `<b>${money(iapC + adC)}</b>`],
      ['ARPDAU', money(o.revenue.arpdauCents)], ['Payers (all time)', `${o.revenue.payers} · ${o.revenue.conversion}%`], ['Lifetime IAP', money(o.revenue.totalCents)],
      ['Rewarded completed', `${o.ads.rewardedDone} / ${o.ads.rewardedStarted} (${o.ads.completionRate}%)`], ['Interstitials shown', o.ads.interstitials], ['eCPM used', '$' + o.ads.ecpm]]);
    const bp = Object.entries(o.ads.byPlacement);
    tbl($('#t-ads'), ['placement', 'started', 'done', 'rate'], bp.map(([k, v]) => [k, v.started, v.done, v.started ? Math.round((v.done / v.started) * 100) + '%' : '—']));
    tbl($('#t-ret'), ['cohort', 'size', 'D1', 'D3', 'D7'], o.retention.map((r) => [r.day.slice(5), r.size, r.d1 == null ? '—' : r.d1 + '%', r.d3 == null ? '—' : r.d3 + '%', r.d7 == null ? '—' : r.d7 + '%']));
    const mx = Math.max(1, ...o.levelDist.map((l) => l.count));
    tbl($('#t-lv'), ['level', '', 'players'], o.levelDist.map((l) => [l.label, `<div class="bar"><i style="width:${(l.count / mx) * 100}%"></i></div>`, l.count]));
    tbl($('#t-hard'), ['level', 'plays', 'win %', 'avg s'], o.hardest.map((h) => [h.level, h.plays, h.winRate + '%', h.avgSec]));
    tbl($('#t-prod'), ['product', 'sold', 'revenue'], o.revenue.byProduct.map((p) => [p.id, p.c, money(p.s)]));
    tbl($('#t-mix'), null, [['platform', o.platforms.map((p) => `${p.p} ${p.n}`).join(' · ')], ['language', o.langs.map((p) => `${p.l} ${p.n}`).join(' · ')], ['country', o.countries.map((p) => `${p.c} ${p.n}`).join(' · ')]]);
    set('#ll-n', `· ${o.liveList.length} shown`);
    tbl($('#t-live'), ['player', 'state', 'level', 'for'], o.liveList.map((p) => [`${p.name} <span style="color:var(--mut)">#${p.id}</span>`, `<span class="tag ${p.state}">${p.state}</span>`, p.level || '—', p.sec + 's']));
  }

  let ws, retry;
  function connect() {
    clearTimeout(retry);
    ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/admin?key=${encodeURIComponent(KEY)}`);
    ws.onopen = () => { $('#wsdot').className = 'dot'; set('#wsstate', 'live'); };
    ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.t === 'overview') render(m); };
    ws.onclose = () => { $('#wsdot').className = 'dot off'; set('#wsstate', 'reconnecting…'); retry = setTimeout(connect, 2500); };
  }
  async function login(k) {
    const r = await fetch('/api/admin/overview?fresh=1', { headers: { 'x-admin-key': k } });
    if (!r.ok) throw new Error('bad key');
    KEY = k; localStorage.setItem('nt_admin_key', k); $('#login').style.display = 'none'; render(await r.json()); connect();
  }
  $('#lf').onsubmit = async (e) => { e.preventDefault(); try { await login($('#key').value.trim()); } catch (err) { set('#lerr', 'Wrong key'); } };
  if (KEY) login(KEY).catch(() => { $('#login').style.display = 'grid'; });
})();
