// Headless smoke test for src/sim/core.js: intents and the step loop with no browser or server.
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const imp = (p) => import(pathToFileURL(path.join(__dirname, '..', p)).href);
let pass = 0; let fail = 0;
const check = (name, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (ok) pass += 1; else fail += 1; };

(async () => {
  const core = await imp('src/sim/core.js');
  const { BATTLE_MAPS } = await imp('src/app/maps.js');
  const { TOWERS } = await imp('src/shop/data.js');
  const { BASE_MAX } = await imp('src/combat/data.js');
  const { state, view } = core;

  // Plain tower with a track and no one-off cap: the cheapest such catalog entry.
  const entry = TOWERS.filter((t) => !t.limit && t.track && t.track.length).sort((a, b) => a.cost - b.cost)[0];
  const map = BATTLE_MAPS.easy;
  const [px, py] = map.pads[0];
  const events = [];
  const listen = () => {
    events.length = 0;
    for (const k of Object.keys(view)) delete view[k];
    for (const k of ['ring', 'float', 'banner', 'sound', 'toast', 'hud', 'panel', 'panelClose', 'range', 'end', 'towerAdd', 'towerDrop', 'nukeBtn', 'coreHit', 'line', 'burst', 'flash']) view[k] = (...a) => events.push(k, a);
  };
  const saw = (k) => events.includes(k);
  const fresh = (cash) => { listen(); core.startSim(map, cash); core.launchSim('easy'); };
  const run = (secs) => { for (let i = 0; i < Math.round(secs * 60); i++) core.simStep(1 / 60); };

  // 1 modes
  listen(); core.startSim(map, 2000); core.launchSim('easy');
  check('launchSim gives countdown', state.mode === 'countdown');
  for (let i = 0; i < 300; i++) core.simStep(1 / 60);
  check('300 steps reach waves', state.mode === 'waves');

  // 2 place
  fresh(2000);
  check('map has pads', Array.isArray(map.pads) && map.pads.length > 0);
  const ok = core.placeTower(entry, px, py);
  check('placeTower returns true', ok === true);
  check('cash drops by cost', state.cash === 2000 - entry.cost);
  check('one tower placed', state.towers.length === 1);
  check('emits towerAdd and hud', saw('towerAdd') && saw('hud'));
  check('pad links the tower', state.towers[0].onPad === true);

  // 3 poor
  fresh(entry.cost - 1);
  events.length = 0;
  check('placeTower with low cash returns false', core.placeTower(entry, px, py) === false);
  check('low cash toasts, no state change', saw('toast') && state.towers.length === 0 && state.cash === entry.cost - 1);

  // 4 upgrade
  fresh(5000);
  core.placeTower(entry, px, py);
  const t = state.towers[0]; const cashBefore = state.cash;
  core.buyTrack(t);
  check('buyTrack raises lvl by one', t.lvl === 1);
  check('buyTrack lowers cash', state.cash === cashBefore - entry.track[0].cost);

  // 5 sell
  const invested = core.trackInvested(t);
  const c2 = state.cash; events.length = 0;
  core.sellTower(t);
  check('sellTower removes the tower', state.towers.length === 0);
  check('sell refunds 70 percent of invested', state.cash === c2 + Math.floor(invested * 0.7));
  check('sell emits towerDrop', saw('towerDrop'));

  // 6 limit
  fresh(1e6);
  const lim = core.towerLimit();
  let placed = 0;
  for (let i = 0; i < lim; i++) if (core.placeTower(entry, 20 + i * 5, 20)) placed += 1;
  events.length = 0;
  check('tower limit fills exactly', placed === lim && state.towers.length === lim);
  check('tower over the limit is refused', core.placeTower(entry, 500, 500) === false && state.towers.length === lim && saw('toast'));

  // 7 waves
  const play = () => {
    fresh(2000);
    for (let i = 0; i < 4; i++) core.placeTower(entry, px + i * 40, py + 40);
    let maxBase = 0; let maxEnemies = 0;
    for (let i = 0; i < 3600; i++) { core.simStep(1 / 60); maxBase = Math.max(maxBase, state.baseHp); maxEnemies = Math.max(maxEnemies, state.enemies.length); }
    return { maxBase, maxEnemies };
  };
  const r = play();
  check('enemies spawn in 60 s', r.maxEnemies > 0);
  check('kills is a number', typeof state.kills === 'number' && Number.isFinite(state.kills));
  check('base never exceeds BASE_MAX', r.maxBase <= BASE_MAX);

  // headless: no handlers at all
  let threw = null;
  try { fresh(2000); for (const k of Object.keys(view)) delete view[k]; core.placeTower(entry, px, py); run(30); } catch (e) { threw = e; }
  check('runs with an empty view', threw === null);
  if (threw) console.log(threw.stack);

  // 8 determinism
  const realRandom = Math.random;
  const seeded = () => { let s = 123456789; Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };
  const once = () => { seeded(); play(); return JSON.stringify(core.simStats()); };
  const a = once(); const b = once();
  Math.random = realRandom;
  check('two seeded runs give identical simStats', a === b);

  // 9 stale and edge intents (a room host may repeat or reorder them)
  fresh(5000);
  core.placeTower(entry, px, py);
  const gone = state.towers[0]; core.sellTower(gone);
  const afterSell = state.cash;
  core.sellTower(gone); core.buyTrack(gone);
  check('selling a sold tower pays nothing more', state.cash === afterSell);
  const bonds = TOWERS.find((t) => t.id === 'warbonds');
  fresh(50000);
  core.placeTower(bonds, px, py);
  const bondTower = state.towers[0]; core.bondDeposit(bondTower);
  const beforeBondSell = state.cash;
  core.sellTower(bondTower);
  check('selling War Bonds returns the banked cash too', state.cash === beforeBondSell + Math.floor(bonds.cost * 0.7) + 500);
  fresh(5000); state.mode = 'over';
  check('no building after the mission ends', core.placeTower(entry, px, py) === false && state.towers.length === 0);

  console.log(`\n${pass} PASSED / ${fail} FAILED`);
  process.exit(fail ? 1 : 0);
})();
