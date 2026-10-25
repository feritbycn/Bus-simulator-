const E = require('../shared/engine.js');
let bad = 0;
for (let n = 1; n <= 300; n++) {
  const L = E.generateLevel(n);
  const sol = E.followOrder(L);
  const r = sol && E.replay(L, sol.map((id) => ({ t: 'tap', id })));
  if (!L.solvable || !sol || !r || r.status !== 'win') { bad++; console.log('FAIL level', n); }
}
console.log(bad ? `${bad} failing levels` : 'OK: levels 1-300 are solvable and replay-verified');
process.exit(bad ? 1 : 0);
