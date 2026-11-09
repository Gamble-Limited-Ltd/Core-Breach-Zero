// Defence in depth for hosts: the sim must shrug off non-finite coordinates and double sells.
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const imp = (p) => import(pathToFileURL(path.join(__dirname, '..', p)).href);
let fail = 0;
const check = (name, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) fail += 1; };
(async () => {
  const core = await imp('src/sim/core.js');
  const { BATTLE_MAPS } = await imp('src/app/maps.js');
  const { TOWERS } = await imp('src/shop/data.js');
  const entry = TOWERS.filter((t) => !t.limit && t.track && t.track.length).sort((a, b) => a.cost - b.cost)[0];
  const fresh = (cash) => { for (const k of Object.keys(core.view)) delete core.view[k]; core.startSim(BATTLE_MAPS.easy, cash); core.launchSim('easy'); };

  fresh(5000);
  for (const bad of [NaN, Infinity, -Infinity, undefined, '5', null]) {
    check(`canPlace rejects ${String(bad)} x`, core.canPlace(bad, 300).ok === false);
    check(`canPlace rejects ${String(bad)} y`, core.canPlace(300, bad).ok === false);
  }

  fresh(5000);
  const [px, py] = BATTLE_MAPS.easy.pads[0];
  core.placeTower(entry, px, py);
  const t = core.state.towers[0];
  const before = core.state.cash;
  core.sellTower(t);
  const afterOne = core.state.cash;
  core.sellTower(t);
  check('selling the same tower twice pays once', core.state.cash === afterOne && afterOne > before);

  fresh(5000);
  const rig = TOWERS.find((e) => e.id === 'zeroday');
  if (rig) {
    core.placeTower(rig, px, py);
    const r = core.state.towers[0]; r.lvl = 6;
    const cash = core.state.cash;
    core.fireNuke(NaN, 100);
    check('fireNuke ignores NaN target', core.state.cash === cash && core.state.wasteZones.length === 0);
  }
  console.log(fail ? 'FAILED' : 'OK');
  process.exit(fail ? 1 : 0);
})();
