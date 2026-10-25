/* Generates all artwork as SVG (and PNG via Playwright in tools/rasterize.js). */
const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, '..', 'public', 'assets');
fs.mkdirSync(OUT, { recursive: true });
const E = require('../shared/engine.js');
const R = (seed) => E.mulberry32(seed);
const f = (n) => Math.round(n * 10) / 10;
const W = 1080, H = 1920;

function stars(rnd, n, ymax, color = '#fff') {
  let s = '';
  for (let i = 0; i < n; i++) s += `<circle cx="${f(rnd() * W)}" cy="${f(rnd() * ymax)}" r="${f(0.6 + rnd() * 1.8)}" fill="${color}" opacity="${f(0.2 + rnd() * 0.8)}"/>`;
  return s;
}
/** a skyline layer: buildings with lit windows */
function skyline(rnd, o) {
  const { base, minH, maxH, minW, maxW, fill, win, winProb = 0.35, glow, roof } = o;
  let s = '', x = -20;
  while (x < W + 20) {
    const bw = minW + rnd() * (maxW - minW), bh = minH + rnd() * (maxH - minH);
    const y = base - bh;
    s += `<rect x="${f(x)}" y="${f(y)}" width="${f(bw)}" height="${f(bh + 400)}" fill="${fill}"/>`;
    if (roof && rnd() < 0.35) s += `<rect x="${f(x + bw * 0.45)}" y="${f(y - 40 - rnd() * 60)}" width="4" height="${f(60 + rnd() * 60)}" fill="${fill}"/>`;
    if (roof && rnd() < 0.25) s += `<path d="M${f(x)} ${f(y)} L${f(x + bw / 2)} ${f(y - 50 - rnd() * 40)} L${f(x + bw)} ${f(y)}Z" fill="${fill}"/>`;
    if (win) {
      const cols = Math.max(1, Math.floor(bw / 22)), rows = Math.floor(bh / 34);
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        if (rnd() < winProb) {
          const col = Array.isArray(win) ? win[Math.floor(rnd() * win.length)] : win;
          s += `<rect x="${f(x + 8 + c * 22)}" y="${f(y + 12 + r * 34)}" width="9" height="14" rx="2" fill="${col}" opacity="${f(0.55 + rnd() * 0.45)}"${glow ? ' filter="url(#soft)"' : ''}/>`;
        }
      }
    }
    x += bw + (rnd() < 0.3 ? 4 + rnd() * 10 : 0);
  }
  return s;
}
const defsCommon = `<filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2"/></filter>
<filter id="blur8" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="8"/></filter>
<filter id="blur30" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="30"/></filter>`;
const svgWrap = (inner, defs = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice"><defs>${defsCommon}${defs}</defs>${inner}</svg>`;
const grad = (id, stops, vertical = true) => `<linearGradient id="${id}" x1="0" y1="0" x2="${vertical ? 0 : 1}" y2="${vertical ? 1 : 0}">${stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</linearGradient>`;

const BG = {
  harbor() {
    const r = R(11);
    const defs = grad('sky', [[0, '#071733'], [0.45, '#1c4a7a'], [0.72, '#ff9a6b'], [1, '#ffd2a1']]) + grad('sea', [[0, '#0e2a4d'], [1, '#050d1f']]);
    let s = `<rect width="${W}" height="${H}" fill="url(#sky)"/>` + stars(r, 90, 700);
    s += `<circle cx="760" cy="1060" r="190" fill="#ffe3b0" opacity=".85"/><circle cx="760" cy="1060" r="330" fill="#ffb27a" opacity=".25" filter="url(#blur30)"/>`;
    s += skyline(r, { base: 1210, minH: 120, maxH: 330, minW: 60, maxW: 130, fill: '#16345c', win: '#ffd88a', winProb: 0.18 });
    // cranes
    for (const cx of [140, 420, 880]) s += `<g stroke="#0a1a33" stroke-width="7" fill="none"><path d="M${cx} 1300 V880 M${cx - 90} 880 H${cx + 190} M${cx - 20} 880 L${cx + 160} 780 M${cx + 160} 880 V960"/></g><circle cx="${cx + 160}" cy="780" r="7" fill="#ff5a5a"/>`;
    // lighthouse
    s += `<polygon points="560,1300 600,1300 590,1000 570,1000" fill="#f4efe6"/><rect x="568" y="1040" width="24" height="26" fill="#d94b4b"/><rect x="566" y="990" width="28" height="22" fill="#ffe28a"/><polygon points="580,1000 1080,930 1080,1070" fill="#ffe28a" opacity=".16"/>`;
    s += skyline(r, { base: 1330, minH: 60, maxH: 170, minW: 70, maxW: 150, fill: '#0b1f3d', win: '#ffcf70', winProb: 0.3 });
    s += `<rect y="1300" width="${W}" height="${H - 1300}" fill="url(#sea)"/>`;
    for (let i = 0; i < 38; i++) s += `<rect x="${f(r() * W)}" y="${f(1330 + r() * 520)}" width="${f(60 + r() * 170)}" height="3" rx="1.5" fill="#ffc98f" opacity="${f(0.1 + r() * 0.35)}"/>`;
    return svgWrap(s, defs);
  },
  oldtown() {
    const r = R(22);
    const defs = grad('sky', [[0, '#150d2e'], [0.5, '#46286a'], [1, '#f08a6a']]) + grad('gl', [[0, '#ffbe6b'], [1, '#ff7a45']]);
    let s = `<rect width="${W}" height="${H}" fill="url(#sky)"/>` + stars(r, 60, 600, '#ffe9d0');
    s += `<circle cx="250" cy="420" r="90" fill="#fff2d8"/><circle cx="215" cy="400" r="86" fill="#46286a"/>`;
    s += skyline(r, { base: 1250, minH: 140, maxH: 380, minW: 70, maxW: 140, fill: '#2a1a4d', win: ['#ffb866', '#ffd9a0'], winProb: 0.28, roof: true });
    // clock tower + domes
    s += `<rect x="470" y="720" width="130" height="600" fill="#1b1036"/><polygon points="460,720 535,590 610,720" fill="#1b1036"/><circle cx="535" cy="790" r="42" fill="#ffe8b8"/><path d="M535 790 V762 M535 790 L555 796" stroke="#1b1036" stroke-width="5" stroke-linecap="round"/>`;
    for (const [cx, rr] of [[200, 90], [860, 110]]) s += `<path d="M${cx - rr} 1250 A${rr} ${rr} 0 0 1 ${cx + rr} 1250Z" fill="#1b1036"/><rect x="${cx - 4}" y="${1250 - rr - 70}" width="8" height="70" fill="#1b1036"/>`;
    s += skyline(r, { base: 1420, minH: 80, maxH: 210, minW: 80, maxW: 160, fill: '#120a28', win: '#ffb866', winProb: 0.35, glow: true });
    // tram wires + lamps
    s += `<path d="M0 1500 Q540 1440 1080 1500" stroke="#0a0518" stroke-width="3" fill="none"/>`;
    for (let i = 0; i < 9; i++) { const x = 60 + i * 125; s += `<rect x="${x}" y="1470" width="5" height="160" fill="#0a0518"/><circle cx="${x + 2}" cy="1470" r="11" fill="#ffd08a" filter="url(#soft)"/>`; }
    s += `<rect y="1620" width="${W}" height="300" fill="#0a0518"/>`;
    return svgWrap(s, defs);
  },
  neon() {
    const r = R(33);
    const defs = grad('sky', [[0, '#05020f'], [0.55, '#240a47'], [1, '#c2186f']]);
    let s = `<rect width="${W}" height="${H}" fill="url(#sky)"/>` + stars(r, 40, 500, '#ffd0ff');
    s += `<circle cx="540" cy="900" r="360" fill="#ff2e93" opacity=".22" filter="url(#blur30)"/>`;
    s += skyline(r, { base: 1250, minH: 260, maxH: 760, minW: 70, maxW: 130, fill: '#190b36', win: ['#38f3ff', '#ff4fb5', '#b58cff'], winProb: 0.22, roof: true, glow: true });
    // neon signs
    const signs = [[90, 760, '#38f3ff'], [330, 640, '#ff4fb5'], [640, 820, '#7dffb0'], [860, 700, '#ffe14d']];
    for (const [x, y, c] of signs) s += `<rect x="${x}" y="${y}" width="120" height="46" rx="10" fill="none" stroke="${c}" stroke-width="5" filter="url(#soft)"/><rect x="${x}" y="${y}" width="120" height="46" rx="10" fill="none" stroke="${c}" stroke-width="2"/>`;
    s += skyline(r, { base: 1450, minH: 120, maxH: 300, minW: 80, maxW: 170, fill: '#0e0522', win: ['#38f3ff', '#ff4fb5'], winProb: 0.28, glow: true });
    for (let i = 0; i < 110; i++) { const x = r() * W, y = r() * H; s += `<line x1="${f(x)}" y1="${f(y)}" x2="${f(x - 14)}" y2="${f(y + 60)}" stroke="#bfe9ff" stroke-width="1.5" opacity="${f(0.05 + r() * 0.16)}"/>`; }
    s += `<rect y="1600" width="${W}" height="320" fill="#080316"/><rect y="1600" width="${W}" height="4" fill="#ff4fb5" opacity=".8"/>`;
    return svgWrap(s, defs);
  },
  gardens() {
    const r = R(44);
    const defs = grad('sky', [[0, '#01161a'], [0.5, '#08504f'], [1, '#6ef2c0']]);
    let s = `<rect width="${W}" height="${H}" fill="url(#sky)"/>` + stars(r, 70, 700, '#d8fff0');
    s += skyline(r, { base: 1220, minH: 140, maxH: 360, minW: 60, maxW: 120, fill: '#0c3f45', win: '#c3fff0', winProb: 0.16 });
    // glass domes
    for (const [cx, rr] of [[250, 210], [800, 260]]) s += `<path d="M${cx - rr} 1300 A${rr} ${rr} 0 0 1 ${cx + rr} 1300Z" fill="#9ffbe0" opacity=".16"/><path d="M${cx - rr} 1300 A${rr} ${rr} 0 0 1 ${cx + rr} 1300Z" fill="none" stroke="#b9ffee" stroke-width="3" opacity=".7"/>`;
    // crystal trees
    for (let i = 0; i < 16; i++) { const x = 30 + i * 70 + r() * 30, h = 120 + r() * 220, c = ['#5ff5c2', '#8cf0ff', '#b7ff8a'][Math.floor(r() * 3)]; s += `<path d="M${f(x)} 1500 L${f(x - 26)} ${f(1500 - h * 0.35)} L${f(x)} ${f(1500 - h)} L${f(x + 26)} ${f(1500 - h * 0.35)}Z" fill="${c}" opacity="${f(0.45 + r() * 0.4)}"/>`; }
    for (let i = 0; i < 50; i++) s += `<circle cx="${f(r() * W)}" cy="${f(900 + r() * 700)}" r="${f(2 + r() * 4)}" fill="#e9fff5" opacity="${f(0.3 + r() * 0.6)}" filter="url(#soft)"/>`;
    s += `<rect y="1560" width="${W}" height="360" fill="#03211f"/>`;
    return svgWrap(s, defs);
  },
  orbit() {
    const r = R(55);
    const defs = grad('sky', [[0, '#01020b'], [0.6, '#0a1240'], [1, '#2a3fa8']]) + grad('pl', [[0, '#ffb86b'], [1, '#c2417f']]);
    let s = `<rect width="${W}" height="${H}" fill="url(#sky)"/>` + stars(r, 260, 1500);
    s += `<circle cx="780" cy="560" r="300" fill="url(#pl)"/><circle cx="700" cy="500" r="300" fill="#0a1240" opacity=".35"/>`;
    s += `<ellipse cx="780" cy="560" rx="460" ry="90" fill="none" stroke="#ffd9a8" stroke-width="10" opacity=".6" transform="rotate(-18 780 560)"/>`;
    // station ring
    s += `<g transform="translate(540 1220)"><ellipse rx="520" ry="140" fill="none" stroke="#7a8cff" stroke-width="22"/><ellipse rx="520" ry="140" fill="none" stroke="#c7d0ff" stroke-width="3"/>`;
    for (let i = 0; i < 28; i++) { const a = (i / 28) * Math.PI * 2; s += `<rect x="${f(Math.cos(a) * 520 - 5)}" y="${f(Math.sin(a) * 140 - 4)}" width="10" height="8" fill="#ffe58a" filter="url(#soft)"/>`; }
    s += `<rect x="-70" y="-300" width="140" height="520" rx="30" fill="#25327f"/><rect x="-24" y="-340" width="48" height="60" rx="14" fill="#7a8cff"/></g>`;
    s += `<rect y="1560" width="${W}" height="360" fill="#050824"/>`;
    for (let i = 0; i < 12; i++) s += `<rect x="${i * 95}" y="1560" width="6" height="360" fill="#16217a" opacity=".6"/>`;
    return svgWrap(s, defs);
  },
  aurora() {
    const r = R(66);
    const defs = grad('sky', [[0, '#02050f'], [0.6, '#08233f'], [1, '#0f5a68']]) + grad('au1', [[0, '#5dffb0'], [1, '#5dffb000']]) + grad('au2', [[0, '#b46bff'], [1, '#b46bff00']]);
    let s = `<rect width="${W}" height="${H}" fill="url(#sky)"/>` + stars(r, 160, 1100);
    for (let k = 0; k < 4; k++) {
      const y0 = 250 + k * 110, c = k % 2 ? 'au2' : 'au1';
      s += `<path d="M-50 ${y0} C 200 ${y0 - 160}, 420 ${y0 + 120}, 640 ${y0 - 80} S 980 ${y0 + 60}, 1130 ${y0 - 120} V ${y0 + 700} H -50Z" fill="url(#${c})" opacity="${f(0.5 - k * 0.07)}" filter="url(#blur8)"/>`;
    }
    s += skyline(r, { base: 1330, minH: 120, maxH: 360, minW: 60, maxW: 120, fill: '#0b2f4a', win: ['#9dffe0', '#d8b8ff'], winProb: 0.3, glow: true, roof: true });
    // core tower
    s += `<polygon points="500,1330 540,560 580,1330" fill="#12496b"/><polygon points="520,1330 540,560 560,1330" fill="#2cc7c3" opacity=".8"/><circle cx="540" cy="540" r="34" fill="#e6fff8"/><circle cx="540" cy="540" r="140" fill="#7dffd5" opacity=".28" filter="url(#blur30)"/>`;
    s += skyline(r, { base: 1520, minH: 80, maxH: 220, minW: 80, maxW: 160, fill: '#06192b', win: '#9dffe0', winProb: 0.3, glow: true });
    s += `<rect y="1600" width="${W}" height="320" fill="#041320"/>`;
    return svgWrap(s, defs);
  },
};
for (const [id, fn] of Object.entries(BG)) fs.writeFileSync(path.join(OUT, `bg_${id}.svg`), fn());

/* ---------------- logo & icon ---------------- */
function podShape(x, y, s, body, dark) {
  return `<g transform="translate(${x} ${y}) scale(${s})">
  <rect x="-70" y="-40" width="140" height="80" rx="34" fill="${body}"/>
  <rect x="-70" y="-40" width="140" height="80" rx="34" fill="url(#shine)"/>
  <rect x="-48" y="-24" width="96" height="32" rx="14" fill="${dark}"/>
  <rect x="-40" y="-18" width="22" height="20" rx="7" fill="#a8f0ff"/><rect x="-12" y="-18" width="22" height="20" rx="7" fill="#a8f0ff"/><rect x="16" y="-18" width="22" height="20" rx="7" fill="#a8f0ff"/>
  <circle cx="-44" cy="30" r="12" fill="${dark}"/><circle cx="44" cy="30" r="12" fill="${dark}"/>
  <rect x="58" y="-4" width="14" height="12" rx="5" fill="#fff6b0"/></g>`;
}
const iconDefs = `<linearGradient id="bgI" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7c5cff"/><stop offset="1" stop-color="#17c3ff"/></linearGradient>
<linearGradient id="shine" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient>
<linearGradient id="pod" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffb347"/><stop offset="1" stop-color="#ff5e62"/></linearGradient>${defsCommon}`;
fs.writeFileSync(path.join(OUT, 'icon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs>${iconDefs}</defs>
<rect width="512" height="512" rx="112" fill="url(#bgI)"/>
<circle cx="256" cy="256" r="200" fill="#fff" opacity=".08"/>
<g opacity=".9"><rect x="70" y="360" width="50" height="90" rx="6" fill="#0d1b4a" opacity=".55"/><rect x="130" y="320" width="60" height="130" rx="6" fill="#0d1b4a" opacity=".55"/><rect x="330" y="340" width="56" height="110" rx="6" fill="#0d1b4a" opacity=".55"/><rect x="396" y="380" width="46" height="70" rx="6" fill="#0d1b4a" opacity=".55"/></g>
<path d="M60 380 Q256 300 452 380" stroke="#fff" stroke-opacity=".5" stroke-width="6" fill="none" stroke-dasharray="2 16" stroke-linecap="round"/>
${podShape(256, 250, 2.1, 'url(#pod)', '#2a1647')}
<ellipse cx="256" cy="402" rx="140" ry="16" fill="#0d1b4a" opacity=".35" filter="url(#soft)"/></svg>`);

fs.writeFileSync(path.join(OUT, 'logo.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 300"><defs>${iconDefs}
<linearGradient id="tx" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#b9c6ff"/></linearGradient>
<linearGradient id="tx2" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#17c3ff"/><stop offset="1" stop-color="#ff5ea8"/></linearGradient></defs>
<g font-family="'Baloo 2','Nunito','Trebuchet MS',system-ui,sans-serif" font-weight="800" text-anchor="middle">
<text x="380" y="148" font-size="150" letter-spacing="2" fill="#2a1a6e" stroke="#2a1a6e" stroke-width="18" stroke-linejoin="round">NOVA</text>
<text x="380" y="148" font-size="150" letter-spacing="2" fill="url(#tx)">NOVA</text>
<text x="380" y="262" font-size="86" letter-spacing="14" fill="#2a1a6e" stroke="#2a1a6e" stroke-width="14" stroke-linejoin="round">TRANSIT</text>
<text x="380" y="262" font-size="86" letter-spacing="14" fill="url(#tx2)">TRANSIT</text></g>
${podShape(655, 70, 0.62, 'url(#pod)', '#2a1647')}</svg>`);

/* ---------------- characters ---------------- */
fs.writeFileSync(path.join(OUT, 'char_mira.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 480"><defs><linearGradient id="jk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7c5cff"/><stop offset="1" stop-color="#3b2aa8"/></linearGradient><linearGradient id="hr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#19d3c5"/><stop offset="1" stop-color="#0a7f9c"/></linearGradient></defs>
<ellipse cx="200" cy="462" rx="130" ry="14" fill="#000" opacity=".25"/>
<path d="M70 470 C70 360 120 320 200 320 C280 320 330 360 330 470Z" fill="url(#jk)"/>
<path d="M170 322 L200 400 L230 322Z" fill="#f3f0ff"/><rect x="186" y="395" width="28" height="6" rx="3" fill="#ffd34d"/>
<rect x="172" y="268" width="56" height="62" rx="24" fill="#d99671"/>
<path d="M92 200 C92 90 140 56 200 56 C262 56 310 96 308 210 C300 250 292 280 262 298 L262 200 C262 140 140 140 138 200 L138 298 C108 280 98 250 92 200Z" fill="url(#hr)"/>
<ellipse cx="200" cy="198" rx="86" ry="96" fill="#e8a984"/>
<path d="M108 178 C130 98 270 98 292 178 C260 140 140 140 108 178Z" fill="url(#hr)"/>
<ellipse cx="164" cy="204" rx="11" ry="14" fill="#2a1647"/><ellipse cx="236" cy="204" rx="11" ry="14" fill="#2a1647"/>
<circle cx="168" cy="199" r="4" fill="#fff"/><circle cx="240" cy="199" r="4" fill="#fff"/>
<ellipse cx="146" cy="232" rx="14" ry="8" fill="#ff8aa0" opacity=".45"/><ellipse cx="254" cy="232" rx="14" ry="8" fill="#ff8aa0" opacity=".45"/>
<path d="M176 244 Q200 266 224 244" stroke="#8a3b2e" stroke-width="6" fill="none" stroke-linecap="round"/>
<path d="M112 206 C108 150 140 124 200 124" stroke="#2a1647" stroke-width="10" fill="none" stroke-linecap="round"/>
<rect x="96" y="196" width="24" height="46" rx="12" fill="#2a1647"/><path d="M108 240 Q126 276 170 274" stroke="#2a1647" stroke-width="6" fill="none" stroke-linecap="round"/><circle cx="174" cy="274" r="9" fill="#ffd34d"/></svg>`);
fs.writeFileSync(path.join(OUT, 'char_pip.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300"><defs><radialGradient id="pb" cx=".35" cy=".3" r=".9"><stop offset="0" stop-color="#ffffff"/><stop offset=".55" stop-color="#cfd8ff"/><stop offset="1" stop-color="#7c8cff"/></radialGradient></defs>
<ellipse cx="150" cy="276" rx="70" ry="10" fill="#000" opacity=".25"/>
<line x1="150" y1="40" x2="150" y2="70" stroke="#9aa6ff" stroke-width="6"/><circle cx="150" cy="34" r="12" fill="#ff5ea8"/><circle cx="150" cy="34" r="22" fill="#ff5ea8" opacity=".3"/>
<circle cx="150" cy="160" r="104" fill="url(#pb)"/>
<rect x="76" y="118" width="148" height="84" rx="42" fill="#1b1448"/>
<ellipse cx="120" cy="160" rx="16" ry="20" fill="#59f3ff"/><ellipse cx="180" cy="160" rx="16" ry="20" fill="#59f3ff"/>
<circle cx="125" cy="153" r="5" fill="#fff"/><circle cx="185" cy="153" r="5" fill="#fff"/>
<path d="M136 190 Q150 202 164 190" stroke="#59f3ff" stroke-width="5" fill="none" stroke-linecap="round"/>
<ellipse cx="46" cy="170" rx="22" ry="12" fill="#9aa6ff" transform="rotate(-18 46 170)"/><ellipse cx="254" cy="170" rx="22" ry="12" fill="#9aa6ff" transform="rotate(18 254 170)"/></svg>`);

/* ---------------- icon sprite ---------------- */
const ic = (id, body) => `<symbol id="i-${id}" viewBox="0 0 48 48">${body}</symbol>`;
const sprite = `<svg xmlns="http://www.w3.org/2000/svg" style="display:none"><defs>
<linearGradient id="gGold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe680"/><stop offset="1" stop-color="#ff9f1a"/></linearGradient>
<linearGradient id="gBlue" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7be3ff"/><stop offset="1" stop-color="#3d7bff"/></linearGradient>
<linearGradient id="gPink" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff9fcf"/><stop offset="1" stop-color="#ff3d8b"/></linearGradient>
<linearGradient id="gGreen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9dffb0"/><stop offset="1" stop-color="#1fc77a"/></linearGradient>
<linearGradient id="gPurple" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c9a8ff"/><stop offset="1" stop-color="#7a4dff"/></linearGradient></defs>
${ic('coin', '<circle cx="24" cy="24" r="20" fill="url(#gGold)" stroke="#b86a00" stroke-width="3"/><circle cx="24" cy="24" r="13" fill="none" stroke="#b86a00" stroke-width="3" opacity=".55"/><path d="M24 14 L27 22 L35 22 L29 27 L31 35 L24 30 L17 35 L19 27 L13 22 L21 22Z" fill="#fff6c8" opacity=".95"/>')}
${ic('gem', '<path d="M12 10 H36 L44 20 L24 42 L4 20Z" fill="url(#gBlue)" stroke="#1f4fc9" stroke-width="3" stroke-linejoin="round"/><path d="M4 20 H44 M16 20 L24 42 L32 20 M12 10 L16 20 L24 10 L32 20 L36 10" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="2"/>')}
${ic('play', '<circle cx="24" cy="24" r="21" fill="url(#gGreen)" stroke="#0c7a49" stroke-width="3"/><path d="M19 14 L35 24 L19 34Z" fill="#fff"/>')}
${ic('gift', '<rect x="6" y="20" width="36" height="22" rx="4" fill="url(#gPink)" stroke="#b01459" stroke-width="3"/><rect x="4" y="13" width="40" height="9" rx="3" fill="url(#gPink)" stroke="#b01459" stroke-width="3"/><rect x="21" y="13" width="6" height="29" fill="#ffe680"/><path d="M24 13 C16 3 8 8 14 13 M24 13 C32 3 40 8 34 13" fill="none" stroke="#ffe680" stroke-width="4" stroke-linecap="round"/>')}
${ic('wheel', '<circle cx="24" cy="24" r="21" fill="#2a1f66" stroke="#fff" stroke-width="3"/><path d="M24 24 L24 3 A21 21 0 0 1 42.2 13.5Z" fill="#ff5ea8"/><path d="M24 24 L42.2 13.5 A21 21 0 0 1 42.2 34.5Z" fill="#ffd34d"/><path d="M24 24 L42.2 34.5 A21 21 0 0 1 24 45Z" fill="#59f3ff"/><path d="M24 24 L24 45 A21 21 0 0 1 5.8 34.5Z" fill="#7cff9b"/><path d="M24 24 L5.8 34.5 A21 21 0 0 1 5.8 13.5Z" fill="#b58cff"/><path d="M24 24 L5.8 13.5 A21 21 0 0 1 24 3Z" fill="#ff9a4d"/><circle cx="24" cy="24" r="6" fill="#fff"/>')}
${ic('shuffle', '<path d="M6 14 H14 C24 14 24 34 34 34 H40 M6 34 H14 C24 34 24 14 34 14 H40" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/><path d="M36 8 L43 14 L36 20 M36 28 L43 34 L36 40" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>')}
${ic('bay', '<rect x="5" y="14" width="38" height="22" rx="6" fill="none" stroke="#fff" stroke-width="4" stroke-dasharray="6 5"/><path d="M24 20 V30 M19 25 H29" stroke="#fff" stroke-width="5" stroke-linecap="round"/>')}
${ic('vip', '<path d="M6 34 L10 14 L18 24 L24 10 L30 24 L38 14 L42 34Z" fill="url(#gGold)" stroke="#b86a00" stroke-width="3" stroke-linejoin="round"/><rect x="6" y="34" width="36" height="6" rx="3" fill="#ff9f1a" stroke="#b86a00" stroke-width="3"/>')}
${ic('gear', '<circle cx="24" cy="24" r="8" fill="none" stroke="#fff" stroke-width="5"/><path d="M24 4 V10 M24 38 V44 M4 24 H10 M38 24 H44 M10 10 L14 14 M34 34 L38 38 M38 10 L34 14 M14 34 L10 38" stroke="#fff" stroke-width="5" stroke-linecap="round"/>')}
${ic('pause', '<rect x="12" y="10" width="8" height="28" rx="3" fill="#fff"/><rect x="28" y="10" width="8" height="28" rx="3" fill="#fff"/>')}
${ic('trophy', '<path d="M14 6 H34 V20 A10 10 0 0 1 14 20Z" fill="url(#gGold)" stroke="#b86a00" stroke-width="3"/><path d="M14 10 H7 V14 A8 8 0 0 0 14 22 M34 10 H41 V14 A8 8 0 0 1 34 22" fill="none" stroke="#b86a00" stroke-width="3"/><rect x="21" y="29" width="6" height="8" fill="#ff9f1a"/><rect x="14" y="37" width="20" height="6" rx="2" fill="url(#gGold)" stroke="#b86a00" stroke-width="3"/>')}
${ic('cart', '<path d="M4 8 H11 L16 32 H37 L42 14 H13" fill="none" stroke="#fff" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="19" cy="39" r="3.5" fill="#fff"/><circle cx="34" cy="39" r="3.5" fill="#fff"/>')}
${ic('star', '<path d="M24 3 L30 17 L45 18 L33.5 28 L37.5 43 L24 35 L10.5 43 L14.5 28 L3 18 L18 17Z" fill="url(#gGold)" stroke="#b86a00" stroke-width="3" stroke-linejoin="round"/>')}
${ic('starOff', '<path d="M24 3 L30 17 L45 18 L33.5 28 L37.5 43 L24 35 L10.5 43 L14.5 28 L3 18 L18 17Z" fill="#ffffff22" stroke="#ffffff55" stroke-width="3" stroke-linejoin="round"/>')}
${ic('lock', '<rect x="9" y="21" width="30" height="21" rx="6" fill="#ffffffcc"/><path d="M15 21 V15 A9 9 0 0 1 33 15 V21" fill="none" stroke="#ffffffcc" stroke-width="5"/>')}
${ic('close', '<path d="M12 12 L36 36 M36 12 L12 36" stroke="#fff" stroke-width="6" stroke-linecap="round"/>')}
${ic('home', '<path d="M6 24 L24 7 L42 24 V41 H29 V30 H19 V41 H6Z" fill="#fff"/>')}
${ic('people', '<circle cx="17" cy="16" r="7" fill="#fff"/><circle cx="33" cy="18" r="6" fill="#ffffffaa"/><path d="M4 41 C4 30 10 26 17 26 C24 26 30 30 30 41Z" fill="#fff"/><path d="M30 28 C38 26 44 30 44 41 H34" fill="#ffffffaa"/>')}
${ic('check', '<path d="M10 25 L20 35 L39 13" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>')}
${ic('hint', '<path d="M24 4 C14 4 8 11 8 19 C8 26 13 29 15 34 H33 C35 29 40 26 40 19 C40 11 34 4 24 4Z" fill="url(#gGold)" stroke="#b86a00" stroke-width="3"/><rect x="17" y="37" width="14" height="6" rx="3" fill="#b86a00"/>')}
${ic('noads', '<circle cx="24" cy="24" r="19" fill="none" stroke="#fff" stroke-width="5"/><path d="M10 38 L38 10" stroke="#fff" stroke-width="5"/><text x="24" y="30" font-size="16" font-weight="800" text-anchor="middle" fill="#fff" font-family="system-ui,sans-serif">AD</text>')}
</svg>`;
fs.writeFileSync(path.join(OUT, 'icons.svg'), sprite);
console.log('assets written to', OUT, fs.readdirSync(OUT).join(', '));
