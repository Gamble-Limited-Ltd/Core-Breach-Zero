// Pure-sim checks that need no browser or server: seeded rng and the DOM-free track sampler.
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const imp = (p) => import(pathToFileURL(path.join(__dirname, '..', p)).href);
let pass = 0; let fail = 0;
const check = (name, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (ok) pass += 1; else fail += 1; };

(async () => {
  const rng = await imp('src/sim/rng.js');
  const { buildSampler } = await imp('src/sim/track.js');
  const { BATTLE_MAPS } = await imp('src/app/maps.js');

  rng.setSeed(42); const a = [rng.rand(), rng.rand(), rng.rand()];
  rng.setSeed(42); const b = [rng.rand(), rng.rand(), rng.rand()];
  check('same seed gives the same stream', a.join() === b.join());
  check('rand stays in [0,1)', a.every((v) => v >= 0 && v < 1));
  rng.setSeed(43); check('different seed differs', rng.rand() !== a[0]);
  rng.clearSeed(); check('clearSeed returns to Math.random', typeof rng.rand() === 'number');

  const straight = buildSampler('M 0 0 H 100 V 50');
  check('straight path length is 150', Math.abs(straight.len - 150) < 1e-6);
  check('at(0) is the start', straight.at(0)[0] === 0 && straight.at(0)[1] === 0);
  check('at(past the end) clamps to the end', straight.at(9999)[0] === 100 && straight.at(9999)[1] >= 48);
  check('points sit 2 px apart', straight.pts.length === 76);
  const curve = buildSampler('M 0 0 Q 50 0 50 50');
  check('quadratic arc length near the true 81.16', Math.abs(curve.len - 81.1613) < 0.05);
  let threw = false; try { buildSampler('M 0 0 C 1 1 2 2 3 3'); } catch { threw = true; }
  check('unsupported path command throws', threw);

  const all = Object.values(BATTLE_MAPS).flatMap((m) => m.paths || []);
  check('every map path samples with a positive length', all.length > 0 && all.every((d) => buildSampler(d).len > 100));
  console.log(`\n${pass} PASSED / ${fail} FAILED`);
  process.exit(fail ? 1 : 0);
})();
