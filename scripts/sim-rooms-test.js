// Multi-room core test: createState/useState let one process run N independent missions. Two missions with different
// seeds, stepped interleaved, must each equal their solo run (no leaking through the shared module state or rng).
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const imp = (p) => import(pathToFileURL(path.join(__dirname, '..', p)).href);
let pass = 0; let fail = 0;
const check = (name, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (ok) pass += 1; else fail += 1; };

(async () => {
  const core = await imp('src/sim/core.js');
  const { BATTLE_MAPS } = await imp('src/app/maps.js');
  const { TOWERS } = await imp('src/shop/data.js');
  const map = BATTLE_MAPS.easy;
  const entry = TOWERS.filter((t) => !t.limit && t.track && t.track.length).sort((a, b) => a.cost - b.cost)[0];
  // The Corpse Blossom is one of the few rand() users (vein timing and targets), so it makes the seed matter.
  const blossom = TOWERS.find((x) => x.id === 'corpseblossom');
  const FRAMES = 2400;

  const start = (seed, layout) => {
    const s = core.createState(seed);
    core.useState(s);
    core.startSim(map, 9000);
    core.launchSim('easy');
    layout.forEach(([x, y]) => core.placeTower(entry, x, y));
    core.placeTower(blossom, map.pads[0][0], map.pads[0][1]);
    const bt = s.towers[s.towers.length - 1];
    while (bt.lvl < bt.entry.track.length && !core.effStats(bt).veins) core.buyTrack(bt);
    return s;
  };
  const print = (s) => { core.useState(s); return JSON.stringify([core.simStats(), s.cash, s.enemies.map((e) => [e.nid, e.hp, e.fx, e.fy]), s.projectiles.length]); };
  const layoutA = map.pads.slice(1, 4);
  const layoutB = [[map.pads[1][0] + 30, map.pads[1][1] + 40], [map.pads[2][0] - 30, map.pads[2][1] + 40]];

  // solo runs, one after the other
  const solo = (seed, layout) => { const s = start(seed, layout); for (let i = 0; i < FRAMES; i++) core.simStep(1 / 60); return print(s); };
  const soloA = solo(11, layoutA); const soloB = solo(99, layoutB);
  check('solo run is repeatable', solo(11, layoutA) === soloA);
  check('different seeds/layouts differ', soloA !== soloB);
  check('the seed alone changes the run (rng is live)', solo(12345, layoutA) !== soloA);

  // interleaved: alternate a frame of A and a frame of B
  const A = start(11, layoutA); const B = start(99, layoutB);
  for (let i = 0; i < FRAMES; i++) { core.useState(A); core.simStep(1 / 60); core.useState(B); core.simStep(1 / 60); }
  check('interleaved mission A equals its solo run', print(A) === soloA);
  check('interleaved mission B equals its solo run', print(B) === soloB);
  check('A really progressed (enemies or kills)', core.simStats && A.kills + A.enemies.length > 0 && A.waveIndex >= 0);

  // an intent on B does not touch A
  core.useState(A); const beforeA = print(A);
  core.useState(B); core.placeTower(entry, 700, 120);
  check('an intent in room B leaves room A untouched', print(A) === beforeA);

  // the default state is untouched by all of this
  core.useState(core.state);
  console.log(`\n${pass} PASSED / ${fail} FAILED`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FAIL', e.stack || e.message); process.exit(1); });
