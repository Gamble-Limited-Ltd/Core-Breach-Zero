// Node twin of scripts/golden-run.js: plays the same solo mission through src/sim/core.js with no browser and compares
// every checkpoint with scripts/golden/solo-easy.json (the file the browser run is checked against). Part of `npm test`.
//   node scripts/golden-node.js [--update-trace]   (--update-trace prints the checkpoints, never writes the golden)
// Mirrors the browser harness: Math.random is the same seeded LCG, time advances by the same float steps as its fake
// performance.now (dt = (now - last) / 1000 per frame), and two sentinels go on pads 0 and 2 (the harness's slot click
// toggles build mode, so pads 1 and 3 get no tower).
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const imp = (p) => import(pathToFileURL(path.join(__dirname, '..', p)).href);

(async () => {
  let s = 123456789;
  Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const core = await imp('src/sim/core.js');
  const { BATTLE_MAPS } = await imp('src/app/maps.js');
  const { TOWERS } = await imp('src/shop/data.js');
  const { state, simStep, startSim, launchSim, simStats, placeTower } = core;

  let now = 1000; let last = 1000;
  const frames = (n) => {
    for (let i = 0; i < n; i += 1) {
      now += 1000 / 60;
      let dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (state.speed2x) dt *= 2;
      simStep(dt);
    }
  };

  const map = BATTLE_MAPS.easy;
  startSim(map, 2000);
  launchSim('easy');
  frames(2);
  const sentinel = TOWERS.find((t) => t.id === 'sentinel');
  const place = (pad) => placeTower(sentinel, pad[0], pad[1]);
  // Same frame budget as the browser harness: 2 frames after each slot click and after each pad click.
  frames(2); place(map.pads[0]); frames(2);
  frames(2); frames(2);
  frames(2); place(map.pads[2]); frames(2);
  frames(2); frames(2);

  const out = [];
  for (let f = 0; f < 3600; f += 300) {
    frames(300);
    const st = simStats(); delete st.towersDetail;
    out.push({ frame: f + 300, ...st });
  }
  if (process.argv.includes('--update-trace')) { console.log(JSON.stringify(out, null, 1)); return; }
  const want = JSON.parse(fs.readFileSync(path.join(__dirname, 'golden/solo-easy.json'), 'utf8'));
  const i = out.findIndex((r, k) => JSON.stringify(r) !== JSON.stringify(want[k]));
  if (i === -1 && out.length === want.length) { console.log(`PASS node run matches the browser golden (${out.length} checkpoints)`); return; }
  console.log(`FAIL node run drifts from the browser golden at checkpoint ${i}\n want ${JSON.stringify(want[i])}\n got  ${JSON.stringify(out[i])}`);
  process.exit(1);
})().catch((e) => { console.error('FAIL', e.stack || e.message); process.exit(1); });
