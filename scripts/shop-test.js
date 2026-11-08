// Nexus Shop endpoint tests — phase 1: fresh economy; phase 2: persistence after server restart.
// Usage: node scripts/shop-test.js 1   (then after server restart)  node scripts/shop-test.js 2
const BASE = `http://127.0.0.1:${process.env.PORT || 3111}`;
const ADMIN_CODE = process.env.ADMIN_KEY_CODE || '';
let pass = 0;
let fail = 0;

function check(name, condition, extra = '') {
  if (condition) {
    pass += 1;
    console.log(`PASS ${name}`);
  } else {
    fail += 1;
    console.log(`FAIL ${name} ${extra}`);
  }
}

async function api(path, payload) {
  const response = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return { status: response.status, data: await response.json().catch(() => ({})) };
}

(async () => {
  const phase = process.argv[2] || '1';
  const home = await fetch(`${BASE}/`);
  check('homepage 200', home.status === 200);
  const shopjs = await fetch(`${BASE}/src/shop/ui.js`);
  check('shop UI module served 200', shopjs.status === 200);
  const decal = await fetch(`${BASE}/assets/towers/sentinel.webp`);
  check('tower decal asset served', decal.ok);
  const sgdecal = await fetch(`${BASE}/assets/towers/shotgunner.webp`);
  check('shotgunner decal asset served', sgdecal.ok);
  const sdecal = await fetch(`${BASE}/assets/towers/sniper.webp`);
  check('sniper decal asset served', sdecal.ok);
  const shdecal = await fetch(`${BASE}/assets/towers/shredder.webp`);
  check('shredder decal asset served', shdecal.ok);

  const identity = { identity: 'SHOPCMDR1', passcode: 'test1234' };
  const reg = await api('/api/register', { name: 'SHOPCMDR1', email: 'shop1@test.io', passcode: 'test1234' });
  let token = reg.data.token;
  check('register (or existing)', reg.data.ok || /already/.test(reg.data.error || ''), JSON.stringify(reg.data));
  if (!token) {
    const login = await api('/api/login', identity);
    token = login.data.token;
    check('login fallback', Boolean(token), JSON.stringify(login.data));
  }

  if (phase === '1') {
    const prof = await api('/api/profile', { token });
    check('profile defaults nc=750 bt=0 lv=1', prof.data.profile && prof.data.profile.nc === 750 && prof.data.profile.bt === 0 && prof.data.profile.level === 1, JSON.stringify(prof.data));
    check('starter sentinel owned', Boolean(prof.data.profile.owned.includes('sentinel')), JSON.stringify(prof.data.profile));
    check('xpNext mirrors formula (55)', prof.data.profile.xpNext === 55, `xpNext=${prof.data.profile.xpNext}`);

    // Reward blueprint stays encrypted until the first Easy Mode clearance.
    const reward = await api('/api/shop/purchase', { token, itemId: 'lazermortar' });
    check('reward blueprint locked 403 before first clear', reward.status === 403, JSON.stringify(reward.data));
    const unknown = await api('/api/shop/purchase', { token, itemId: 'nope' });
    check('unknown blueprint 404', unknown.status === 404);
    const bad = await api('/api/profile', { token: 'garbage' });
    check('bad token 401', bad.status === 401);
    // OPEN ROSTER — the headsman sells in the grid now, but only past Clearance 50.
    const exeLocked = await api('/api/shop/purchase', { token, itemId: 'executioner' });
    check('EXECUTIONER grid card locked 403 below Clearance 50', exeLocked.status === 403, JSON.stringify(exeLocked.data));

    const loss = await api('/api/mission/complete', { token, result: 'loss', wavesCleared: 5, bossesKilled: 1, difficulty: 'easy' });
    check('loss nc = 5*8 + 1*10 = 50', loss.data.rewards.nc === 50, JSON.stringify(loss.data.rewards));
    check('loss bt = 1 (boss only)', loss.data.rewards.bt === 1);
    check('loss xp = 5*12 + 30 = 90', loss.data.rewards.xp === 90);
    check('loss levels up L1->L2 (90 >= 55)', loss.data.rewards.levelsGained === 1 && loss.data.profile.level === 2, JSON.stringify(loss.data.rewards));

    const win = await api('/api/mission/complete', { token, result: 'win', wavesCleared: 15, bossesKilled: 3, flawless: true, difficulty: 'easy' });
    check('win nc = 235 (8*15+10*3+60+25)', win.data.rewards.nc === 235, JSON.stringify(win.data.rewards));
    check('win bt = 10 (3 bosses +2 flawless +5 firstClear)', win.data.rewards.bt === 10, `bt=${win.data.rewards.bt}`);
    check('firstClear flagged once', win.data.rewards.firstClear === true);
    check('win xp = 400 (180+90+80+50)', win.data.rewards.xp === 400);
    check('levels L2->L5 (+3), xp=13 left', win.data.rewards.levelsGained === 3 && win.data.profile.level === 5 && win.data.profile.xp === 13, JSON.stringify(win.data.rewards));
    check('wallet totals nc=1035 bt=11 (750+50+235)', win.data.profile.nc === 1035 && win.data.profile.bt === 11, JSON.stringify(win.data.profile));

    // First clearance decrypts the Lazer Mortar — free reward blueprint.
    const reward2 = await api('/api/shop/purchase', { token, itemId: 'lazermortar' });
    check('lazermortar unlocks after first clear (free)', reward2.data.ok && reward2.data.profile.owned.includes('lazermortar') && reward2.data.profile.nc === 1035, JSON.stringify(reward2.data));
    const dup = await api('/api/shop/purchase', { token, itemId: 'lazermortar' });
    check('duplicate rejected 409', dup.status === 409);

    // Virus costs 2400 NC + 55 BT — partial funds are rejected, then a grind pass funds it.
    const poor = await api('/api/shop/purchase', { token, itemId: 'virus' });
    check('dual-currency shortfall 402', poor.status === 402, `status=${poor.status}`);
    for (let i = 0; i < 8; i++) {
      await api('/api/mission/complete', { token, result: 'win', wavesCleared: 20, bossesKilled: 6, difficulty: 'easy' });
    }
    const funded = await api('/api/profile', { token });
    check('grind banked >= 2400 NC and >= 55 BT', funded.data.profile.nc >= 2400 && funded.data.profile.bt >= 55, JSON.stringify(funded.data.profile));
    const virus = await api('/api/shop/purchase', { token, itemId: 'virus' });
    check('dual-currency purchase deducts both', virus.data.ok && virus.data.profile.owned.includes('virus') && virus.data.profile.nc === funded.data.profile.nc - 2400 && virus.data.profile.bt === funded.data.profile.bt - 55, JSON.stringify(virus.data));

    // Loadout bays on the server side (max 5, unique, owned only).
    const trio = await api('/api/loadout', { token, loadout: ['sentinel', 'lazermortar', 'virus'] });
    check('full unique loadout accepted', trio.data.ok && trio.data.profile.loadout.length === 3, JSON.stringify(trio.data));
    const four = await api('/api/loadout', { token, loadout: ['sentinel', 'sentinel', 'lazermortar', 'virus'] });
    check('duplicate bay rejected 400', four.status === 400, JSON.stringify(four.data));

    const again = await api('/api/mission/complete', { token, result: 'win', wavesCleared: 999, bossesKilled: 99, difficulty: 'easy' });
    check('input clamped: nc=600 (30-wave + 30-boss caps)', again.data.rewards.nc === 600, JSON.stringify(again.data.rewards));
    check('no second firstClear, bt=30 (30-boss cap)', again.data.rewards.firstClear === false && again.data.rewards.bt === 30, JSON.stringify(again.data.rewards));

    // Medium protocol payouts + achievement ledger (mapWins -> OVERDRIVE).
    const medLoss = await api('/api/mission/complete', { token, result: 'loss', wavesCleared: 8, bossesKilled: 3, difficulty: 'medium' });
    check('medium loss nc = 8*10 + 3*12 = 116', medLoss.data.rewards.nc === 116, JSON.stringify(medLoss.data.rewards));
    check('medium loss xp = 8*15 + 3*40 = 240', medLoss.data.rewards.xp === 240, `xp=${medLoss.data.rewards.xp}`);
    const spireEasy = await api('/api/mission/complete', { token, result: 'win', wavesCleared: 20, bossesKilled: 5, difficulty: 'easy', map: 'insane' });
    check('spire easy win records mapWins insane:easy', spireEasy.data.profile.mapWins['insane:easy'] === 1, JSON.stringify(spireEasy.data.profile.mapWins));
    check('overdrive still locked after easy-only spire', spireEasy.data.profile.achievements.overdrive === false, JSON.stringify(spireEasy.data.profile.achievements));
    const spireMed = await api('/api/mission/complete', { token, result: 'win', wavesCleared: 25, bossesKilled: 20, difficulty: 'medium', map: 'insane' });
    check('medium win nc = 25*10 + 20*12 + 100 = 590', spireMed.data.rewards.nc === 590, JSON.stringify(spireMed.data.rewards));
    check('medium win xp = 25*15 + 20*40 + 140 = 1315', spireMed.data.rewards.xp === 1315, `xp=${spireMed.data.rewards.xp}`);
    check('OVERDRIVE unlocked on spire medium win', Array.isArray(spireMed.data.unlocked) && spireMed.data.unlocked.includes('overdrive'), JSON.stringify(spireMed.data));
    check('profile achievements.overdrive true', spireMed.data.profile.achievements.overdrive === true, JSON.stringify(spireMed.data.profile.achievements));
    check('mapWins insane:medium recorded', spireMed.data.profile.mapWins['insane:medium'] === 1, JSON.stringify(spireMed.data.profile.mapWins));
    const spireRepeat = await api('/api/mission/complete', { token, result: 'win', wavesCleared: 25, bossesKilled: 20, difficulty: 'medium', map: 'insane' });
    check('overdrive does not re-unlock', Array.isArray(spireRepeat.data.unlocked) && spireRepeat.data.unlocked.length === 0, JSON.stringify(spireRepeat.data));
    const bogusWin = await api('/api/mission/complete', { token, result: 'win', wavesCleared: 20, bossesKilled: 5, difficulty: 'easy', map: 'notamap' });
    check('unknown map win does not touch mapWins', bogusWin.data.profile.mapWins['notamap:easy'] === undefined, JSON.stringify(bogusWin.data.profile.mapWins));

    // HARD protocol payouts + HARDLINE achievement. Perk loadout is explicit:
    // nothing equipped yet, so the fresh HARDLINE win pays NO salvage bonus.
    const hardWin = await api('/api/mission/complete', { token, result: 'win', wavesCleared: 20, bossesKilled: 5, difficulty: 'hard', map: 'easy' });
    check('hard win nc = 20*12 + 5*18 + 250 = 580 (no perks equipped yet)', hardWin.data.rewards.nc === 580, JSON.stringify(hardWin.data.rewards));
    check('hard win xp = 20*18 + 5*65 + 260 = 945', hardWin.data.rewards.xp === 945, `xp=${hardWin.data.rewards.xp}`);
    check('HARDLINE unlocked on first hard win', Array.isArray(hardWin.data.unlocked) && hardWin.data.unlocked.includes('hardline'), JSON.stringify(hardWin.data.unlocked));
    check('mapWins easy:hard recorded', hardWin.data.profile.mapWins['easy:hard'] === 1, JSON.stringify(hardWin.data.profile.mapWins));
    check('spirebreaker/grandslam still locked after one easy-map hard win', hardWin.data.profile.achievements.spirebreaker === false && hardWin.data.profile.achievements.grandslam === false, JSON.stringify(hardWin.data.profile.achievements));
    const hardLoss = await api('/api/mission/complete', { token, result: 'loss', wavesCleared: 10, bossesKilled: 2, difficulty: 'hard' });
    check('hard loss nc = 10*12 + 2*18 = 156 (perks off until equipped)', hardLoss.data.rewards.nc === 156, JSON.stringify(hardLoss.data.rewards));

    // Perk loadout — two tactical slots, equip-gated mission payouts.
    // Commander has HARDLINE (one hard win) + OVERDRIVE (spire easy+medium) by here.
    const perksBad = await api('/api/perks', { token, perks: ['salvage', 'overdrive', 'deeppockets'] });
    check('three perk slots rejected 400', perksBad.status === 400, JSON.stringify(perksBad.data));
    const perksLocked = await api('/api/perks', { token, perks: ['deeppockets'] });
    check('unearned perk equip rejected 403 (IRONCOMMANDER pending)', perksLocked.status === 403, JSON.stringify(perksLocked.data));
    const perksNope = await api('/api/perks', { token, perks: ['notaperk'] });
    check('unknown perk rejected 404', perksNope.status === 404, JSON.stringify(perksNope.data));
    const perksSet = await api('/api/perks', { token, perks: ['salvage', 'overdrive'] });
    check('equip salvage + overdrive into 2 slots', perksSet.data.ok && perksSet.data.profile.equippedPerks.length === 2 && perksSet.data.profile.equippedPerks.includes('salvage'), JSON.stringify(perksSet.data));
    const hardLossPerked = await api('/api/mission/complete', { token, result: 'loss', wavesCleared: 10, bossesKilled: 2, difficulty: 'hard' });
    check('hard loss with SALVAGE equipped = 156 * 1.1 = 172', hardLossPerked.data.rewards.nc === 172, JSON.stringify(hardLossPerked.data.rewards));
    const perksClear = await api('/api/perks', { token, perks: [] });
    check('perk slots clear to empty', perksClear.data.ok && perksClear.data.profile.equippedPerks.length === 0, JSON.stringify(perksClear.data));
    const hardLossBare = await api('/api/mission/complete', { token, result: 'loss', wavesCleared: 10, bossesKilled: 2, difficulty: 'hard' });
    check('hard loss after clearing slots = 156 again', hardLossBare.data.rewards.nc === 156, JSON.stringify(hardLossBare.data.rewards));

    // Salvage codes — /api/redeem grants once per commander account per code.
    const sealed = await api('/api/profile', { token });
    const beforeNc = sealed.data.profile.nc;
    const beforeBt = sealed.data.profile.bt;
    const noAuth = await api('/api/redeem', { code: 'NULLCORE' });
    check('redeem without token 401', noAuth.status === 401, JSON.stringify(noAuth.data));
    const badcode = await api('/api/redeem', { token, code: 'FREEMONEY' });
    check('unknown code rejected 404', badcode.status === 404, JSON.stringify(badcode.data));
    const nullcore = await api('/api/redeem', { token, code: 'nullcore' });
    check('NULLCORE (lowercase) grants +1500 NC', nullcore.data.ok && nullcore.data.profile.nc === beforeNc + 1500, JSON.stringify(nullcore.data));
    const dupe = await api('/api/redeem', { token, code: 'NULLCORE' });
    check('second NULLCORE rejected 409', dupe.status === 409, JSON.stringify(dupe.data));
    const ghostwire = await api('/api/redeem', { token, code: 'GHOSTWIRE' });
    check('GHOSTWIRE grants +75 BT', ghostwire.data.ok && ghostwire.data.profile.bt === beforeBt + 75, JSON.stringify(ghostwire.data));
    const datacache = await api('/api/redeem', { token, code: 'DATACACHE' });
    check('DATACACHE grants +4000 NC +100 BT', datacache.data.ok && datacache.data.profile.nc === beforeNc + 5500 && datacache.data.profile.bt === beforeBt + 175, JSON.stringify(datacache.data));
    const zeroday = await api('/api/redeem', { token, code: 'zeroday' });
    check('ZERODAY (lowercase) grants +5000 NC +500 BT', zeroday.data.ok && zeroday.data.profile.nc === beforeNc + 10500 && zeroday.data.profile.bt === beforeBt + 675, JSON.stringify(zeroday.data));

    // ADMIN KEY — admin test grant: 10000 NC + 1000 BT + 5000 XP, REPEATABLE (no ledger entry, no 409).
    const xpToNext = (level) => Math.round(55 * Math.pow(level, 0.86));
    const applyXp = (level, xp, gain) => {
      xp += gain;
      while (xp >= xpToNext(level)) { xp -= xpToNext(level); level += 1; } // clearance is UNCAPPED
      return [level, xp];
    };
    const [expLevel1, expXp1] = applyXp(sealed.data.profile.level, sealed.data.profile.xp, 5000);
    const adminRedeem = await api('/api/redeem', { token, code: ADMIN_CODE.toLowerCase() });
    check('ADMIN KEY (lowercase) grants +10000 NC +1000 BT +5000 XP', adminRedeem.data.ok && adminRedeem.data.profile.nc === beforeNc + 20500 && adminRedeem.data.profile.bt === beforeBt + 1675 && adminRedeem.data.granted.xp === 5000, JSON.stringify(adminRedeem.data));
    check('ADMIN KEY level-up loop matches simulation', adminRedeem.data.profile.level === expLevel1 && adminRedeem.data.profile.xp === expXp1 && adminRedeem.data.granted.levelsGained === expLevel1 - sealed.data.profile.level, JSON.stringify(adminRedeem.data));
    check('ADMIN KEY is the admin key — flags profile.admin', adminRedeem.data.ok && adminRedeem.data.profile.admin === true, JSON.stringify(adminRedeem.data.profile));
    const [expLevel2, expXp2] = applyXp(sealed.data.profile.level, sealed.data.profile.xp, 10000);
    const adminRedeem2 = await api('/api/redeem', { token, code: ADMIN_CODE });
    check('ADMIN KEY re-redeemable (repeat grant, no 409)', adminRedeem2.data.ok && adminRedeem2.data.profile.nc === beforeNc + 30500 && adminRedeem2.data.profile.bt === beforeBt + 2675 && adminRedeem2.data.profile.level === expLevel2 && adminRedeem2.data.profile.xp === expXp2, JSON.stringify(adminRedeem2.data));

    // Shotgunner — clearance level 3 gate + dual-currency 800 NC + 10 BT.
    const freshreg = await api('/api/register', { name: 'SHOPCMDR2', email: 'shop2@test.io', passcode: 'test1234' });
    let freshToken = freshreg.data.token;
    if (!freshToken) {
      const freshlogin = await api('/api/login', { identity: 'SHOPCMDR2', passcode: 'test1234' });
      freshToken = freshlogin.data.token;
    }
    const freshBuy = await api('/api/shop/purchase', { token: freshToken, itemId: 'shotgunner' });
    check('level-3 clearance gate blocks fresh account 403', freshBuy.status === 403, JSON.stringify(freshBuy.data));
    const freshBuySniper = await api('/api/shop/purchase', { token: freshToken, itemId: 'sniper' });
    check('level-5 clearance gate blocks fresh account 403', freshBuySniper.status === 403, JSON.stringify(freshBuySniper.data));
    const freshBuyRig = await api('/api/shop/purchase', { token: freshToken, itemId: 'zeroday' });
    check('level-15 clearance gate blocks fresh account 403', freshBuyRig.status === 403, JSON.stringify(freshBuyRig.data));
    // CLASSIFIED blueprint: fresh non-admin account gets a flat 404 — the grid
    // pretends the Corpse Blossom does not exist. Admin log comes further below.
    const freshBuyBlossom = await api('/api/shop/purchase', { token: freshToken, itemId: 'corpseblossom' });
    check('CLASSIFIED blossom: non-admin flat 404 (no leak)', freshBuyBlossom.status === 404, JSON.stringify(freshBuyBlossom.data));
    // IRON RAIN endgame chassis: clearance gates hold for fresh accounts.
    const freshBuyDrone = await api('/api/shop/purchase', { token: freshToken, itemId: 'dronespawner' });
    check('level-20 clearance gate blocks fresh account 403 (DRONE SPAWNER)', freshBuyDrone.status === 403, JSON.stringify(freshBuyDrone.data));
    const freshBuyShred = await api('/api/shop/purchase', { token: freshToken, itemId: 'shredder' });
    check('level-20 clearance gate blocks fresh account 403 (SHREDDER)', freshBuyShred.status === 403, JSON.stringify(freshBuyShred.data));
    const freshBuySilo = await api('/api/shop/purchase', { token: freshToken, itemId: 'missilesilo' });
    check('level-30 clearance gate blocks fresh account 403 (MISSILE SILO)', freshBuySilo.status === 403, JSON.stringify(freshBuySilo.data));
    const freshAdmin = await api('/api/redeem', { token: freshToken, code: ADMIN_CODE });
    check('ADMIN KEY on fresh account jumps past L10 + flags admin', freshAdmin.data.ok && freshAdmin.data.profile.level >= 10 && freshAdmin.data.granted.levelsGained >= 10 && freshAdmin.data.profile.nc === 750 + 10000 && freshAdmin.data.profile.admin === true, JSON.stringify(freshAdmin.data));
    const rich = await api('/api/profile', { token });
    const sgBeforeNc = rich.data.profile.nc;
    const sgBeforeBt = rich.data.profile.bt;
    const sg = await api('/api/shop/purchase', { token, itemId: 'shotgunner' });
    check('shotgunner purchase deducts 800 NC + 10 BT', sg.data.ok && sg.data.profile.owned.includes('shotgunner') && sg.data.profile.nc === sgBeforeNc - 800 && sg.data.profile.bt === sgBeforeBt - 10, JSON.stringify(sg.data));
    const sn = await api('/api/shop/purchase', { token, itemId: 'sniper' });
    check('sniper purchase deducts 1800 NC + 50 BT (L5 gate open)', sn.data.ok && sn.data.profile.owned.includes('sniper') && sn.data.profile.nc === sgBeforeNc - 800 - 1800 && sn.data.profile.bt === sgBeforeBt - 10 - 50, JSON.stringify(sn.data));
    const rigWallet = await api('/api/profile', { token });
    const rigNc = rigWallet.data.profile.nc;
    const rigBt = rigWallet.data.profile.bt;
    const rig = await api('/api/shop/purchase', { token, itemId: 'zeroday' });
    check('zeroday purchase deducts 3600 NC + 30 BT (L15 gate open)', rig.data.ok && rig.data.profile.owned.includes('zeroday') && rig.data.profile.nc === rigNc - 3600 && rig.data.profile.bt === rigBt - 30, JSON.stringify(rig.data));
    // ULTIMATUM era — the Blossom left the NC/BT vault: it is an Ultimatum card now.
    const blossomNC = await api('/api/shop/purchase', { token, itemId: 'corpseblossom' });
    check('blossom no longer sold for NC/BT (Ultimatum-only) 404', blossomNC.status === 404, JSON.stringify(blossomNC.data));
    const ultShallow = await api('/api/ultimatum', { token, action: 'exchange' });
    check('ultimatum exchange with shallow XP bank 400', ultShallow.status === 400, JSON.stringify(ultShallow.data));
    for (let i = 0; i < 12; i++) await api('/api/redeem', { token, code: ADMIN_CODE }); // repeatable +5000 XP — farms past one 50k core
    const farmed = await api('/api/profile', { token });
    check('level cap removed: clearance sails past LV 30', farmed.data.profile.level > 30, `level=${farmed.data.profile.level}`);
    check('lifetime totalXp ledger banks past 50k', farmed.data.profile.totalXp >= 50000, `totalXp=${farmed.data.profile.totalXp}`);
    check('no cores banked before the exchange', farmed.data.profile.ultCores === 0 && farmed.data.profile.ultClaims === 0, JSON.stringify(farmed.data.profile));
    const ultEx = await api('/api/ultimatum', { token, action: 'exchange' });
    check('50k lifetime XP exchanges for 1 Ultimatum core', ultEx.data.ok && ultEx.data.profile.ultCores === 1 && ultEx.data.profile.ultClaims === 1, JSON.stringify(ultEx.data));
    check('exchange never touched the level or owned towers', ultEx.data.profile.level === farmed.data.profile.level && ultEx.data.profile.owned.length === farmed.data.profile.owned.length, 'level/armory intact');
    const ultDupe = await api('/api/ultimatum', { token, action: 'exchange' });
    check('double exchange before the next 50k rejected 400', ultDupe.status === 400, JSON.stringify(ultDupe.data));
    const ultBuy = await api('/api/ultimatum', { token, action: 'buy', card: 'gravewarden' });
    check('Ultimatum card: GRAVE WARDEN acquired for 1 core', ultBuy.data.ok && ultBuy.data.profile.owned.includes('gravewarden') && ultBuy.data.profile.ultCores === 0, JSON.stringify(ultBuy.data));
    const ultRebuy = await api('/api/ultimatum', { token, action: 'buy', card: 'gravewarden' });
    check('second warden rejected 409 (one per commander)', ultRebuy.status === 409, JSON.stringify(ultRebuy.data));
    const blossomBroke = await api('/api/ultimatum', { token, action: 'buy', card: 'corpseblossom' });
    check('blossom with 0 cores 402 (2-core tier enforced)', blossomBroke.status === 402, JSON.stringify(blossomBroke.data));
    const ultUnknown = await api('/api/ultimatum', { token, action: 'buy', card: 'notacard' });
    check('unknown Ultimatum card 404', ultUnknown.status === 404, JSON.stringify(ultUnknown.data));
    const exeVault = await api('/api/ultimatum', { token, action: 'buy', card: 'executioner' });
    check('EXECUTIONER left the vault: ultimatum buy 404', exeVault.status === 404, JSON.stringify(exeVault.data));
    // Non-admin who never touched the admin key: registered clean, still blocked.
    const civreg = await api('/api/register', { name: 'SHOPCIVILIAN', email: 'civ@test.io', passcode: 'test1234' });
    const civToken = civreg.data.token;
    const civAdminFlag = await api('/api/profile', { token: civToken });
    check('civilian profile.admin stays false', civAdminFlag.data.ok && civAdminFlag.data.profile.admin === false, JSON.stringify(civAdminFlag.data));
    const civBlossom = await api('/api/shop/purchase', { token: civToken, itemId: 'corpseblossom' });
    check('civilian blossom purchase blocked 404', civBlossom.status === 404, JSON.stringify(civBlossom.data));
    const civSpark = await api('/api/shop/purchase', { token: civToken, itemId: 'sparkcoil' });
    check('civilian below clearance blocked 403 (L6 gate honest)', civSpark.status === 403, JSON.stringify(civSpark.data));
    // FULL CLEARANCE SHOP — a fresh admin-key account sits BELOW the relay gate
    // (the key's 5,000 XP lands ~L13 < L18) yet buys it anyway: the clearance
    // check is bypassed for admins, while cores still gate the vault.
    const adminFresh = await api('/api/register', { name: 'ADMINFRESH', email: 'adminfresh@test.io', passcode: 'test1234' });
    const adminToken = adminFresh.data.token;
    await api('/api/redeem', { token: adminToken, code: ADMIN_CODE }); // admin flag + 10,000 NC + 1,000 BT
    const adminRelay = await api('/api/shop/purchase', { token: adminToken, itemId: 'relay' });
    check('FULL CLEARANCE: admin buys above clearance 200 (L18 relay below L13)', adminRelay.status === 200 && adminRelay.data.ok && adminRelay.data.profile.owned.includes('relay'), JSON.stringify(adminRelay.data));
    const adminVault = await api('/api/ultimatum', { token: adminToken, action: 'buy', card: 'gravewarden' });
    check('FULL CLEARANCE: admin vault buy below L20 blocked only by cores 402', adminVault.status === 402, JSON.stringify(adminVault.data));
    const civPerks = await api('/api/perks', { token: civToken, perks: ['salvage'] });
    check('civilian perk equip without HARDLINE rejected 403', civPerks.status === 403, JSON.stringify(civPerks.data));
    // DAWN CLEARANCE — the admin decrypts the DAWNBRINGER relic (no event win needed);
    // the civilian stays empty-handed until it survives the actual Crimson Dawn.
    const adminRelic = await api('/api/profile', { token });
    check('DAWN CLEARANCE: relic in admin armory', adminRelic.data.ok && adminRelic.data.profile.owned.includes('dawnbreaker'), JSON.stringify(adminRelic.data.profile.owned));
    const civRelic = await api('/api/profile', { token: civToken });
    check('civilian holds no relic before the dawn', civRelic.data.ok && !civRelic.data.profile.owned.includes('dawnbreaker'), JSON.stringify(civRelic.data.profile.owned));
    const relicArm = await api('/api/loadout', { token, loadout: ['sentinel', 'dawnbreaker'] });
    check('relic arms into the loadout 200', relicArm.status === 200 && relicArm.data.ok && relicArm.data.profile.loadout.includes('dawnbreaker'), JSON.stringify(relicArm.data));
    const civArm = await api('/api/loadout', { token: civToken, loadout: ['sentinel', 'dawnbreaker'] });
    check('civilian relic arm rejected 400', civArm.status === 400, JSON.stringify(civArm.data));
    // FULL CLEARANCE — the admin account (flagged above via ADMIN KEY) equips
    // perks it never earned; the civilian stays locked out of the same vault.
    const adminPerks = await api('/api/perks', { token, perks: ['deeppockets', 'overclock'] });
    check('FULL CLEARANCE: admin equips unearned perks 200 (deeppockets + overclock)', adminPerks.status === 200 && adminPerks.data.ok && adminPerks.data.profile.equippedPerks.length === 2, JSON.stringify(adminPerks.data));
    const civPerkLocked = await api('/api/perks', { token: civToken, perks: ['deeppockets'] });
    check('civilian still blocked from unearned perk 403', civPerkLocked.status === 403, JSON.stringify(civPerkLocked.data));
    const adminPerkClear = await api('/api/perks', { token, perks: [] });
    check('admin perk slots clear back to empty', adminPerkClear.data.ok && adminPerkClear.data.profile.equippedPerks.length === 0, JSON.stringify(adminPerkClear.data));
    const quint = await api('/api/loadout', { token, loadout: ['sentinel', 'lazermortar', 'virus', 'shotgunner', 'sniper'] });
    check('5-bay unique loadout accepted', quint.data.ok && quint.data.profile.loadout.length === 5, JSON.stringify(quint.data));
    const sept = await api('/api/loadout', { token, loadout: ['sentinel', 'lazermortar', 'virus', 'shotgunner', 'sniper', 'zeroday', 'corpseblossom'] });
    check('7-bay loadout rejected 400 (max 5)', sept.status === 400, JSON.stringify(sept.data));
    console.log(`PHASE1 RESULT: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }

  if (phase === '2') {
    const prof = await api('/api/profile', { token });
    const p = prof.data.profile || {};
    check('persisted after restart: full armory', p.owned && p.owned.includes('sentinel') && p.owned.includes('lazermortar') && p.owned.includes('virus') && p.owned.includes('shotgunner') && p.owned.includes('sniper') && p.owned.includes('zeroday') && p.owned.includes('gravewarden'), JSON.stringify(p));
    check('persisted firstClear flag', p.firstClear === true);
    check('persisted full loadout', Array.isArray(p.loadout) && p.loadout.length === 5, JSON.stringify(p.loadout));
    check('persisted redeemed ledger (4 codes, repeatable skips ledger)', Array.isArray(p.redeemed) && p.redeemed.length === 4, JSON.stringify(p.redeemed));
    check('persisted achievement overdrive + hardline', p.achievements && p.achievements.overdrive === true && p.achievements.hardline === true, JSON.stringify(p.achievements));
    check('persisted mapWins spire + hard ledger', p.mapWins && p.mapWins['insane:easy'] === 1 && p.mapWins['insane:medium'] === 2 && p.mapWins['easy:hard'] === 1, JSON.stringify(p.mapWins));
    check('persisted lifetime XP + Ultimatum ledger', typeof p.totalXp === 'number' && p.totalXp >= 50000 && p.ultCores === 0 && p.ultClaims === 1, JSON.stringify({ totalXp: p.totalXp, ultCores: p.ultCores, ultClaims: p.ultClaims }));
    check('persisted uncapped clearance past LV 30', p.level > 30, `level=${p.level}`);
    // --- GOLDEN VETERANS: blossom reprices to 2 cores, DEATHWARRANT joins at 3 ---
    const blossomBroke2 = await api('/api/ultimatum', { token, action: 'buy', card: 'corpseblossom' });
    check('blossom with 0 cores 402 (2-core tier enforced)', blossomBroke2.status === 402, JSON.stringify(blossomBroke2.data));
    for (let i = 0; i < 36; i++) await api('/api/redeem', { token, code: ADMIN_CODE }); // +180k lifetime XP — banks three more 50k cores (48 total redeems ≈ 245k)
    const farmed2 = await api('/api/profile', { token });
    check('second farm pushes lifetime XP past 200k', farmed2.data.profile.totalXp >= 200000, `totalXp=${farmed2.data.profile.totalXp}`);
    await api('/api/ultimatum', { token, action: 'exchange' });
    await api('/api/ultimatum', { token, action: 'exchange' });
    const core3 = await api('/api/ultimatum', { token, action: 'exchange' });
    check('three milestone exchanges bank cores 2-4 (claims 4)', core3.status === 200 && core3.data.profile.ultCores === 3 && core3.data.profile.ultClaims === 4, JSON.stringify(core3.data));
    const blossomBuy = await api('/api/ultimatum', { token, action: 'buy', card: 'corpseblossom' });
    check('corpse blossom costs exactly 2 cores 200', blossomBuy.status === 200 && blossomBuy.data.profile.owned.includes('corpseblossom') && blossomBuy.data.profile.ultCores === 1, JSON.stringify(blossomBuy.data));
    const blossomRebuy = await api('/api/ultimatum', { token, action: 'buy', card: 'corpseblossom' });
    check('blossom rebuy 409', blossomRebuy.status === 409, JSON.stringify(blossomRebuy.data));
    const warrantBroke = await api('/api/ultimatum', { token, action: 'buy', card: 'deathwarrant' });
    check('deathwarrant with 1 core 402 (3-core tier enforced)', warrantBroke.status === 402, JSON.stringify(warrantBroke.data));
    for (let i = 0; i < 12; i++) await api('/api/redeem', { token, code: ADMIN_CODE }); // +60k — banks two more cores
    await api('/api/ultimatum', { token, action: 'exchange' });
    const core5 = await api('/api/ultimatum', { token, action: 'exchange' });
    check('two more exchanges bank cores 5-6 (claims 6)', core5.status === 200 && core5.data.profile.ultCores === 3 && core5.data.profile.ultClaims === 6, JSON.stringify(core5.data));
    const warrantBuy = await api('/api/ultimatum', { token, action: 'buy', card: 'deathwarrant' });
    check('DEATHWARRANT costs exactly 3 cores 200', warrantBuy.status === 200 && warrantBuy.data.profile.owned.includes('deathwarrant') && warrantBuy.data.profile.ultCores === 0, JSON.stringify(warrantBuy.data));
    const warrantRebuy = await api('/api/ultimatum', { token, action: 'buy', card: 'deathwarrant' });
    check('deathwarrant rebuy 409', warrantRebuy.status === 409, JSON.stringify(warrantRebuy.data));
    // --- OPEN ROSTER: the headsman sells in the grid now, vault refuses him ---
    const wallet = await api('/api/profile', { token });
    const headsman = await api('/api/shop/purchase', { token, itemId: 'executioner' });
    check('EXECUTIONER purchased off the grid 200 (12,000 NC + 150 BT)', headsman.status === 200 && headsman.data.ok && headsman.data.profile.owned.includes('executioner') && headsman.data.profile.nc === wallet.data.profile.nc - 12000 && headsman.data.profile.bt === wallet.data.profile.bt - 150, JSON.stringify(headsman.data));
    const headsmanRebuy = await api('/api/shop/purchase', { token, itemId: 'executioner' });
    check('EXECUTIONER rebuy 409', headsmanRebuy.status === 409, JSON.stringify(headsmanRebuy.data));
    const vaultLeft = await api('/api/ultimatum', { token, action: 'buy', card: 'executioner' });
    check('vault no longer sells the headsman 404', vaultLeft.status === 404, JSON.stringify(vaultLeft.data));
    const bothApex = await api('/api/loadout', { token, loadout: ['sentinel', 'lazermortar', 'virus', 'gravewarden', 'executioner'] });
    check('warden + headsman co-arm legal 200 (executioner left ULT_TOWERS)', bothApex.status === 200 && bothApex.data.ok && bothApex.data.profile.loadout.includes('executioner'), JSON.stringify(bothApex.data));
    const duoApex = await api('/api/loadout', { token, loadout: ['sentinel', 'lazermortar', 'virus', 'corpseblossom', 'gravewarden'] });
    check('one-card rule lives: blossom + warden co-arm 400', duoApex.status === 400, JSON.stringify(duoApex.data));
    const duoWarrant = await api('/api/loadout', { token, loadout: ['sentinel', 'lazermortar', 'virus', 'corpseblossom', 'deathwarrant'] });
    check('one-card rule covers the warrant: blossom + deathwarrant co-arm 400', duoWarrant.status === 400, JSON.stringify(duoWarrant.data));
    await api('/api/loadout', { token, loadout: ['sentinel', 'lazermortar', 'virus', 'shotgunner', 'sniper'] });
    console.log(`PHASE2 RESULT: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
  process.exit(1);
})();
