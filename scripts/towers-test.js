// ULTIMATUM validation: uncapped clearance, lifetime XP ledger, core exchange,
// CORPSE BLOSSOM as the first Ultimatum card, one-card equip rule, mirrors + deploy chain.
// Usage: node scripts/towers-test.js  (pure file/logic checks — no server needed)
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let passed = 0;
let failed = 0;
function check(label, condition, detail = '') {
  if (condition) { passed += 1; console.log(`  PASS  ${label}`); }
  else { failed += 1; console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`); }
}
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
// Extract a `const NAME = <literal>;` block. Extra bindings (e.g. shop.js's ic())
// can be preloaded so literals that call helpers still evaluate.
function extractLiteral(src, name, extraBindings = {}) {
  const start = src.indexOf(`const ${name} = `);
  if (start < 0) return undefined;
  const open = src.indexOf('[', start) !== -1 && src.indexOf('{', start) !== -1
    ? Math.min(src.indexOf('[', start), src.indexOf('{', start))
    : Math.max(src.indexOf('[', start), src.indexOf('{', start));
  const openCh = src[open];
  const closeCh = openCh === '[' ? ']' : '}';
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === openCh) depth += 1;
    if (src[i] === closeCh) {
      depth -= 1;
      if (depth === 0) {
        const names = ['WAVE_HP_SCALE', ...Object.keys(extraBindings)];
        const values = [0.12, ...Object.values(extraBindings)];
        return new Function(...names, `return (${src.slice(open, i + 1)})`)(...values);
      }
    }
  }
  return undefined;
}

console.log('--- Blueprint catalog (shop.js) ---');
const shopjs = read('shop.js');
const TOWERS = extractLiteral(shopjs, 'TOWERS', { ic: (inner) => inner });
const silo = TOWERS && TOWERS.find((t) => t.id === 'missilesilo');
const drone = TOWERS && TOWERS.find((t) => t.id === 'dronespawner');
check('MISSILE SILO registered at Clearance 30 (endgame capstone)', silo && silo.unlock === 30, JSON.stringify(silo && silo.unlock));
check('MISSILE SILO is a mixed-currency capstone (9000 NC + 120 BT / 650 salvage)', silo && silo.price.nc === 9000 && silo.price.bt === 120 && silo.cost === 650);
check('MISSILE SILO base: 300 dmg / 0.22 rate / 300 rng / 55 splash', silo && silo.stats.dmg === 300 && silo.stats.rate === 0.22 && silo.stats.rng === 300 && silo.stats.splash === 55);
check('MISSILE SILO has 4-tier ladder ending in MIRV PROTOCOL', silo && silo.track.length === 4 && silo.track[3].label === 'MIRV PROTOCOL' && silo.track[3].sets.cluster === 1 && silo.track[3].sets.dmg === 650);
check('MISSILE SILO has decal art', silo && silo.art === 'assets/towers/missilesilo.png' && fs.existsSync(path.join(ROOT, 'assets/towers/missilesilo.png')));
check('DRONE SPAWNER registered at Clearance 20', drone && drone.unlock === 20, JSON.stringify(drone && drone.unlock));
check('DRONE SPAWNER is one-per-commander (5200 NC + 85 BT / 475 salvage)', drone && drone.limit === 1 && drone.price.nc === 5200 && drone.price.bt === 85 && drone.cost === 475);
check('DRONE SPAWNER base: 90 dmg/hull drone every 5s in a 190 ring (FIELD AUDIT re-arm)', drone && drone.stats.drone === 90 && drone.stats.launchEvery === 5 && drone.stats.rng === 190);
check('DRONE SPAWNER apex tier: 300-damage drones every 2.6s at 230 rng', drone && drone.track[3].label === 'APEX CARRIER' && drone.track[3].sets.drone === 300 && drone.track[3].sets.launchEvery === 2.6 && drone.track[3].sets.rng === 230);
check('DRONE SPAWNER has decal art', drone && drone.art === 'assets/towers/dronespawner.png' && fs.existsSync(path.join(ROOT, 'assets/towers/dronespawner.png')));
check('shop card renders a DRONE meter for the carrier', shopjs.includes("entry.stats.drone ? `<div class=\"tc-meter\"><span>DRONE</span>"));
check('shop card renders a CONTAGION meter for the virus', shopjs.includes("entry.stats.corrupt ? `<div class=\"tc-meter\"><span>CONTAGION</span>"));

console.log('--- SCRAP PROTOCOL balance pass (shop.js) ---');
const se = TOWERS.find((t) => t.id === 'sentinel');
const vi = TOWERS.find((t) => t.id === 'virus');
const sh = TOWERS.find((t) => t.id === 'shredder');
const sg = TOWERS.find((t) => t.id === 'shotgunner');
const sn = TOWERS.find((t) => t.id === 'sniper');
check('SENTINEL buffed: 7 dmg / 1.6 rate / 135 rng', se.stats.dmg === 7 && se.stats.rate === 1.6 && se.stats.rng === 135);
check('SENTINEL ladder rolled up (12 / 2.0+150 / 20+185)', se.track[0].sets.dmg === 12 && se.track[1].sets.rate === 2 && se.track[1].sets.rng === 150 && se.track[2].sets.dmg === 20 && se.track[2].sets.rng === 185);
check('VIRUS is premium now: 2400 NC + 55 BT / 500 salvage', vi.price.nc === 2400 && vi.price.bt === 55 && vi.cost === 500);
check('VIRUS base blades up: 12 dmg at 3/s', vi.stats.dmg === 12 && vi.stats.rate === 3);
check('VIRUS ladder is 5 tiers ending ZERO PATIENT 64 dmg / 3.8 rate', vi.track.length === 5 && vi.track[4].label === 'ZERO PATIENT' && vi.track[4].sets.dmg === 64 && vi.track[4].sets.rate === 3.8);
check('CONTAGION tier infects (corrupt 40) and ZERO PATIENT burns 55/s', vi.track[3].sets.corrupt === 40 && vi.track[4].sets.corrupt === 55);
check('VIRUS blade tiers got pricier (650/900/1600/2400/3600)', vi.track.map((t) => t.cost).join(',') === '650,900,1600,2400,3600');
check('SNIPER trimmed again: 130 dmg base', sn.stats.dmg === 130);
check('SNIPER rail trimmed (150 / 215 / 330)', sn.track[1].sets.dmg === 150 && sn.track[3].sets.dmg === 215 && sn.track[4].sets.dmg === 330);
check('SHREDDER decrypts at Clearance 20 (2200 NC + 35 BT / 90 salvage)', sh && sh.unlock === 20 && sh.price.nc === 2200 && sh.price.bt === 35 && sh.cost === 90);
check('SHREDDER is the early-wave specialist: 11 dmg / 3 rate / 105 rng', sh && sh.stats.dmg === 11 && sh.stats.rate === 3 && sh.stats.rng === 105);
check('SHREDDER ladder tops out on purpose (3 small tiers, cap 18 dmg)', sh && sh.track.length === 3 && sh.track[2].sets.dmg === 18 && sh.track[2].sets.rng === 115);
check('SHREDDER has decal art', sh && sh.art === 'assets/towers/shredder.png' && fs.existsSync(path.join(ROOT, 'assets/towers/shredder.png')));

console.log('--- Nerfs: Shotgunner + Sniper (shop.js) ---');
check('SHOTGUNNER trimmed: 27 dmg / 12U base burst ring', sg.stats.dmg === 27 && sg.stats.splash === 12);
check('SHOTGUNNER ladder trimmed (splash 20/24, dmg 36/40)', sg.track[1].sets.splash === 20 && sg.track[2].sets.splash === 24 && sg.track[2].sets.dmg === 36 && sg.track[3].sets.dmg === 40);
check('SNIPER trimmed: 130 dmg base', sn.stats.dmg === 130);
check('SNIPER rail trimmed (150 / 215 / 330)', sn.track[1].sets.dmg === 150 && sn.track[3].sets.dmg === 215 && sn.track[4].sets.dmg === 330);
check('sniper rng + targeting untouched by the nerf', sn.track[0].sets.targeting === 'maxhp' && sn.track[4].sets.rng === 350 && sn.track[4].sets.rate === 0.4);

console.log('--- Combat wiring (combat.js) ---');
const combat = read('combat.js');
check('MISSILE SILO tracks air natively (no pad needed)', combat.includes("missilesilo: { air: 'yes' }"));
check('SHREDDER is ground-only with pad AA', combat.includes("shredder: { air: 'no' }"));
check('SHREDDER spits a chip-stream (fx-chip tracer)', combat.includes("case 'shredder':") && combat.includes("fireLine(tower, target, 'fx-chip'"));
check('CONTAGION wiring: virus hits infect with a 5s phase burn', combat.includes("target.corrupt = { dps: es.corrupt, t: 5 }") && combat.includes("damageEnemy(enemy, enemy.corrupt.dps * dt, { phase: true, src: 'virus' })"));
check('corruption tick guarded against friendly summons', combat.includes('if (es.corrupt && !target.friendly)'));
check('tower panel shows live CONTAGION intel', combat.includes('<span>CONTAGION</span>'));
check('DRONE SPAWNER is a one-per-commander rig', combat.includes("new Set(['zeroday', 'corpseblossom', 'dronespawner', 'gravewarden'])"));
check('silo fires a visible warhead (kind missile + fx-missile node)', combat.includes("case 'missilesilo':") && combat.includes("kind: 'missile'") && combat.includes("fx-shell fx-missile"));
check('projectile loop flies shells AND missiles', combat.includes("p.kind === 'shell' || p.kind === 'missile'"));
check('MIRV cluster pass: 35% dmg out to 130u beyond the crater', combat.includes('if (p.cluster)') && combat.includes('Math.round(p.dmg * 0.35)') && combat.includes('d <= 130'));
check('strike-drone fabricator exists with target lead', combat.includes('function launchStrikeDrone(tower)') && combat.includes('const lead = 0.9;'));
check('carrier upkeep ticks droneCd and launches on cadence', combat.includes("tower.id === 'dronespawner'") && combat.includes('tower.droneCd <= 0 && launchStrikeDrone(tower)'));
check('strike drones respect the global summon cap', combat.split('launchStrikeDrone(tower)').length > 1 && combat.includes('item.friendly && item.alive).length >= SUMMON_CAP'));
check('tower panel shows live STRIKE DRONE intel', combat.includes('<span>STRIKE DRONE</span>') && combat.includes('<span>NEXT LAUNCH</span>'));

console.log('--- HARD escalation (combat.js) ---');
const ENEMY_TYPES = extractLiteral(combat, 'ENEMY_TYPES');
const SURGE_MODS = extractLiteral(combat, 'SURGE_MODS');
const HARD_WAVES = extractLiteral(combat, 'HARD_WAVES');
check('MODE_HP_GROWTH.hard = 0.1 (1.10x compounding)', combat.includes('MODE_HP_GROWTH = { hard: 0.1, insane: 0.135, crimson: 0.13 }'));
check('MODE_SPEED.hard = 1.15 (+15% hostile speed)', combat.includes('MODE_SPEED = { hard: 1.15, insane: 1.22, crimson: 1.18 }'));
check('HELLFIRE now burns exactly 6 HARD waves', HARD_WAVES.filter((w) => w.mod === 'hellfire').length === 6, `${HARD_WAVES.filter((w) => w.mod === 'hellfire').length}`);
check('DENSE ASSAULT (w20) upgraded to hellfire + phantom escort', HARD_WAVES[19].mod === 'hellfire' && HARD_WAVES[19].groups.some(([k, c]) => k === 'phantom' && c >= 10));
check('GRID LOCK (w25) overclock escalated to hellfire', HARD_WAVES[24].mod === 'hellfire');
check('final escort grows a third Firewall Warden + 5th Juggernaut', HARD_WAVES[29].groups.some(([k, c]) => k === 'warden' && c === 3) && HARD_WAVES[29].groups.some(([k, c]) => k === 'juggernaut' && c === 5));
const hullAt = (i) => Math.pow(1.1, i);
check('hull curve: w10 ≈ 2.36x, w20 ≈ 6.12x, w30 ≈ 15.86x', Math.abs(hullAt(9) - 2.36) < 0.02 && Math.abs(hullAt(19) - 6.12) < 0.03 && Math.abs(hullAt(29) - 15.86) < 0.05, `w10=${hullAt(9).toFixed(2)} w20=${hullAt(19).toFixed(2)} w30=${hullAt(29).toFixed(2)}`);
check('vote card copy warns +15% speed', combat.includes('COMPOUNDING HULLS · +15% SPEED · HELLFIRE SURGES'));
const badKeys = new Set();
for (const wave of HARD_WAVES) for (const [key, count] of wave.groups) {
  if (!ENEMY_TYPES[key]) badKeys.add(key);
  if (!Number.isInteger(count) || count <= 0) badKeys.add(`${key}:${count}`);
  if (wave.mod && !SURGE_MODS[wave.mod]) badKeys.add(wave.mod);
}
check('escalated HARD ladder still validates (keys + mods + counts)', badKeys.size === 0, [...badKeys].join(','));

console.log('--- Shop mirrors (LOCAL + server) ---');
const appjs = read('app.js');
const serverjs = read('server.js');
const localShop = extractLiteral(appjs, 'SHOP');
const serverShop = extractLiteral(serverjs, 'SHOP');
for (const id of ['virus', 'shredder', 'dronespawner', 'missilesilo']) {
  const a = localShop[id];
  const b = serverShop[id];
  const strip = (e) => JSON.stringify({ name: e.name, unlock: e.unlock, price: e.price, currency: e.currency });
  check(`${id} mirror identical (name/unlock/price/currency)`, a && b && strip(a) === strip(b), `${strip(a || {})} vs ${strip(b || {})}`);
}
const localRewards = extractLiteral(appjs, 'REWARDS');
const serverRewards = extractLiteral(serverjs, 'REWARDS');
check('reward tables untouched by IRON RAIN', JSON.stringify(localRewards) === JSON.stringify(serverRewards) && localRewards.hard.winNC === 250 && localRewards.crimson.winNC === 500);

console.log('--- Private Crimson early access (app.js) ---');
check('crimsonEarlyAccess reads the admin flag off the shop profile', appjs.includes('function crimsonEarlyAccess()') && /profile && profile\.admin/.test(appjs));
const phaseIdx = appjs.indexOf('function crimsonPhase(');
const earlyIdx = appjs.indexOf('if (crimsonEarlyAccess()) return \'live\';');
check('early-access gate sits inside the phase machine before the T-0 check', phaseIdx >= 0 && earlyIdx > phaseIdx && earlyIdx < appjs.indexOf("now >= CRIMSON_DEADLINE) return 'live';", phaseIdx));
check('live panel marks the early field test (and nothing more)', appjs.includes('// EARLY FIELD TEST — ONE UNREGISTERED DEPLOY SIGNATURE ACCEPTED'));
check('QA override still wins over early access (?crimson=passed)', appjs.indexOf("CRIMSON_DEBUG === 'passed'") < earlyIdx);
check('non-admin seal untouched: default shop profile has no admin flag', shopjs.includes('ultClaims: 0, admin: false }'));
check('phantom bay fix: setProfile purges catalog-dead blueprint ids', shopjs.includes('towerById(id) && profile.owned.includes(id)'));

console.log('--- FULL CLEARANCE: all-perks admin + event debrief (app.js/combat.js/server.js) ---');
check('CBZPerks.has grants flag-admins every perk without achievements', appjs.includes('if (!profile.admin && (!profile.achievements || !profile.achievements[perk.ach])) return false;'));
check('perks panel renders admin-decrypted cards with the clearance line', appjs.includes('const earned = admin || cleared;') && appjs.includes('>> ADMIN CLEARANCE — DECRYPTED WITHOUT THE RECORD.'));
check('earned-achievement cards still show the standard standby line', appjs.includes("const standby = cleared ? '>> ON STANDBY — EQUIP INTO ONE OF TWO SLOTS.'"));
check('LOCAL /api/perks lets admins equip unearned perks', appjs.includes("if (!ach[achId] && !admin) throw new Error('That perk is still encrypted — earn its achievement first.');"));
check('LOCAL admin check covers roster names AND flag-admins', appjs.includes('const admin = Boolean(meta.admin) || isAdminName(account.name); // FULL CLEARANCE — admins skip the vault'));
check('server /api/perks mirror grants admins the same clearance', serverjs.includes('if (!ach[achId] && !isAdmin(name)) return sendJson(response, 403'));
const crimsonMap = extractLiteral(appjs, 'CRIMSON_MAP');
check('CRIMSON_MAP flagged as an event gamemode', Boolean(crimsonMap) && crimsonMap.event === true && crimsonMap.theme === 'crimson');
check('event debrief omits the retry button entirely', combat.includes("const eventMode = Boolean((state.map && state.map.event) || state.protocol === 'crimson');") && combat.includes("eventMode ? '' : `<button class=\"inline-button\" id=\"end-redeploy\"") && combat.includes("if (!eventMode) panel.querySelector('#end-redeploy')"));
check('non-event debrief keeps RE-DEPLOY / RETRY', combat.includes("${win ? 'RE-DEPLOY' : 'RETRY'}"));
check('event debrief keeps RETURN TO BAY as the exit', combat.includes("<button class=\"inline-button\" id=\"end-bay\" type=\"button\">RETURN TO BAY</button>"));

console.log('--- ULTIMATUM: uncapped clearance + core vault (shop.js/app.js/server.js) ---');
const indexhtml = read('index.html');
const styles = read('styles.css');
check('level cap is gone everywhere (app/server/shop)', !appjs.includes('MAX_LEVEL') && !serverjs.includes('MAX_LEVEL') && !shopjs.includes('MAX_LEVEL'));
check('MAX CLEARANCE display retired from the shop', !shopjs.includes('MAX CLEARANCE'));
check('lifetime XP ledger increments on missions (server + LOCAL)', serverjs.includes('meta.totalXp += xp;') && appjs.includes('meta.totalXp += xp;'));
check('lifetime XP ledger increments on salvage codes (server + LOCAL)', serverjs.includes('meta.totalXp += grant.xp;') && appjs.includes('meta.totalXp += grant.xp;'));
check('veteran backfill from clearance history (server + LOCAL)', serverjs.includes('back += xpToNext(l);') && appjs.includes('back += xpToNext(l);'));
const appUltCards = extractLiteral(appjs, 'ULT_CARDS');
const serverUltCards = extractLiteral(serverjs, 'ULT_CARDS');
check('ULT card catalog mirrors (blossom 2 cores, warden 1, warrant 3, L20)', JSON.stringify(appUltCards) === JSON.stringify(serverUltCards) && Boolean(appUltCards && appUltCards.corpseblossom) && appUltCards.corpseblossom.cores === 2 && appUltCards.gravewarden.cores === 1 && appUltCards.deathwarrant.cores === 3 && appUltCards.corpseblossom.unlock === 20);
check('ULT_XP_PER_CORE mirrors at 50000 (app/server/shop)', /const ULT_XP_PER_CORE = 50000;/.test(appjs) && /const ULT_XP_PER_CORE = 50000;/.test(serverjs) && /const ULT_XP_PER_CORE = 50000;/.test(shopjs));
check('/api/ultimatum lives on server + LOCAL', serverjs.includes("pathname === '/api/ultimatum'") && appjs.includes("path === '/api/ultimatum'"));
check('exchange is a milestone claim (banked vs claims, both sides)', serverjs.includes('banked <= (meta.ultClaims || 0)') && appjs.includes('banked <= (meta.ultClaims || 0)'));
check('purchase guards: 409 dupe + 403 clearance + 402 cores (server)', serverjs.includes("'Ultimatum card already in your armory.'") && serverjs.includes('Clearance level ${card.unlock} required.') && serverjs.includes('Not enough Ultimatum cores'));
check('one-card rule enforced in both loadout validators', serverjs.includes('Only one ULTIMATUM card can be armed at a time') && appjs.includes('Only one ULTIMATUM card can be armed at a time'));
check('blossom left the NC/BT shop mirrors (Ultimatum-only)', !localShop.corpseblossom && !serverShop.corpseblossom);
check('shop catalog flags the blossom ULTIMATUM (adminOnly retired)', shopjs.includes('ultimatum: true') && !shopjs.includes('adminOnly: true'));
check('vault tab + panel + exchange wired in the shop', shopjs.includes('shop-tab-ult') && shopjs.includes('data-cat="__ult"') && shopjs.includes('id="shop-ultimatum"') && shopjs.includes('onUltClick'));
check('exchange button labels the 50k milestone dynamically', shopjs.includes('EXCHANGE ${format(ULT_XP_PER_CORE)} XP // BANK ') && shopjs.includes('REACH ${format(ULT_XP_PER_CORE)} TOTAL XP TO BANK A CORE'));
check('TOTAL XP counter lives in the shop wallet', shopjs.includes('TOTAL XP // LIFETIME') && shopjs.includes('id="shop-totalxp"'));
check('vault card renders blossom art + arm/buy actions', shopjs.includes('data-ult-buy="${card.id}"') && shopjs.includes("ULTIMATUM CARD ACQUIRED"));
check('client one-card guard + setProfile heal in shop.js', shopjs.includes('ONLY ONE ULTIMATUM CARD CAN BE ARMED') && shopjs.includes('let ultSeen = false;'));
check('blueprint grid excludes ULTIMATUM cards', shopjs.includes('!entry.ultimatum && (filter'));
check('ultimatum vault styled (gold hero + card + exchange)', styles.includes('.ult-hero') && styles.includes('.ult-card') && styles.includes('.ult-exchange.ready') && styles.includes('.tok-ult'));

console.log('--- Deploy chain: update log, build, cache-bust ---');
check('BUILD bumped to 2026.11.05', appjs.includes("const BUILD = '2026.11.05';"));
check('UPDATE LOG leads with ULTIMATUM entry', appjs.indexOf("version: '2026.10.28', tag: 'ULTIMATUM'") < appjs.indexOf("version: '2026.10.27'") && appjs.indexOf('FULL CLEARANCE') < appjs.indexOf('SCRAP PROTOCOL'));
check('update log covers cap removal + vault + blossom card + migration', ['clearance cap is GONE', 'ULTIMATUM system goes live', 'first ULTIMATUM card', 'backfilled from their clearance history'].every((s) => appjs.includes(s)));
check('update log covers sentinel buff + shredder + sniper nerf #3 + virus rework', ['SENTINEL TURRET buffed', 'SHREDDER decrypts at Clearance 20', 'SNIPER tuned down again', 'VIRUS reworked', 'MISSILE SILO'].every((s) => appjs.includes(s)));
const busts = indexhtml.match(/\?v=([0-9a-z]+)/g) || [];
check('all 6 index.html assets cache-busted to 20261024l', busts.length === 6 && busts.every((v) => v === '?v=20261024l'), busts.join(' '));
check('shell footer brands GLL FOUNDATIONS', indexhtml.includes('BUILD 2026.11.05 // GLL FOUNDATIONS') && indexhtml.includes('THE CRIMSON WELL IS OPEN') && indexhtml.includes('ULTIMATUM VAULT OPEN'));
check('play menu copy updated to 15% hostiles', appjs.includes('compounding hulls, 15% faster hostiles'));
check('fx-missile warhead styled (orange glow)', styles.includes('.fx-missile') && /fx-missile[^}]*#ff7a45/.test(styles));
check('fx-chip stream styled for the Shredder', styles.includes('.fx-chip'));

console.log('--- INSANE ERA: insane protocol + two new apex cards ---');
const INSANE_WAVES = extractLiteral(combat, 'INSANE_WAVES');
const INSANE_REWARDS_LOCAL = extractLiteral(appjs, 'REWARDS');
const INSANE_REWARDS_SERVER = extractLiteral(serverjs, 'REWARDS');
check('INSANE ladder registered in the WAVES map', combat.includes('WAVES = { easy: EASY_WAVES, medium: MEDIUM_WAVES, hard: HARD_WAVES, insane: INSANE_WAVES, crimson: CRIMSON_WAVES }'));
check('INSANE ladder has 30 waves', Array.isArray(INSANE_WAVES) && INSANE_WAVES.length === 30, String(INSANE_WAVES && INSANE_WAVES.length));
check('insane hull curve: 1.135x compounding — the DOUBLED spiral', combat.includes('MODE_HP_GROWTH = { hard: 0.1, insane: 0.135, crimson: 0.13 }'));
check('insane speed: +22% (hard 15 / dawn 18)', combat.includes('MODE_SPEED = { hard: 1.15, insane: 1.22, crimson: 1.18 }'));
check('insane boss leaks near-core you (12x)', combat.includes('MODE_BOSS_LEAK = { hard: 10, insane: 12, crimson: 10 }'));
check('solo vote flips INSANE to READY with the doubled copy', combat.includes("label: 'INSANE', sub: '30 WAVES // DOUBLED: ~35X HULL · +22% SPEED · 4 NEW ELITE CLASSES") && /label: 'INSANE'[\s\S]{0,220}ready: true/.test(combat));
check('dawnfire burns exactly 2 insane waves (TRIPLE THREAT + SIEGE WALL)', INSANE_WAVES && INSANE_WAVES.filter((w) => w.mod === 'dawnfire').length === 2 && INSANE_WAVES[21].phase === 'TRIPLE THREAT' && INSANE_WAVES[26].phase === 'SIEGE WALL');
check('insane final wave keeps the overseer + 3 wardens escort', INSANE_WAVES && INSANE_WAVES[29].groups.some(([k, c]) => k === 'warden' && c === 3) && INSANE_WAVES[29].groups.some(([k, c]) => k === 'overseer' && c === 1));
check('insane economy: opening -35% / wave pay 70% / rebuild 2.5s', combat.includes("mode === 'insane' ? 0.65 : 0.8") && combat.includes("state.protocol === 'insane' ? 0.7 :") && combat.includes("state.protocol === 'insane' ? 2.5 :"));
check('insane pays 350 NC / 400 XP per win, mirrored exactly', INSANE_REWARDS_LOCAL && INSANE_REWARDS_SERVER && INSANE_REWARDS_LOCAL.insane.winNC === 350 && INSANE_REWARDS_LOCAL.insane.winXP === 400 && JSON.stringify(INSANE_REWARDS_LOCAL.insane) === JSON.stringify(INSANE_REWARDS_SERVER.insane));
check('room protocols carry insane (LOCAL + server sync)', appjs.includes("const ROOM_PROTOCOLS = ['easy', 'medium', 'hard', 'insane'];") && serverjs.includes("const PROTOCOL_CHOICES = ['easy', 'medium', 'hard', 'insane'];"));
check('play menu copy names the spiral', appjs.includes('INSANE (30 waves on the spiral'));
check('OPEN ROSTER: EXECUTIONER sold in the grid (no ULT flag), warden stays apex', TOWERS && TOWERS.some((t) => t.id === 'gravewarden' && t.ultimatum === true && t.limit === 1 && t.cost === 400 && t.track.length === 6) && TOWERS.some((t) => t.id === 'executioner' && !t.ultimatum && t.limit === 3 && t.unlock === 50 && t.price && t.price.nc === 12000 && t.price.bt === 150 && t.track.length === 5));
check('apex decals shipped + dawnbreaker decal', fs.existsSync(path.join(ROOT, 'assets/towers/gravewarden.png')) && fs.existsSync(path.join(ROOT, 'assets/towers/executioner.png')) && fs.existsSync(path.join(ROOT, 'assets/towers/dawnbreaker.png')) && shopjs.includes("art: 'assets/towers/dawnbreaker.png'"));
check('shop ULT_CARDS: vault trio — blossom 2 cores / warden 1 core / warrant 3 cores, headsman gone', /const ULT_CARDS = \[[\s\S]*?corpseblossom[\s\S]*?cores: 2[\s\S]*?gravewarden[\s\S]*?cores: 1[\s\S]*?deathwarrant[\s\S]*?cores: 3[\s\S]*?\];/.test(shopjs) && !shopjs.includes("id: 'executioner', name: 'EXECUTIONER', cores"));
check('free-claim rendering retired with the headsman', !shopjs.includes('CLAIM // FREE AT CLEARANCE') && !shopjs.includes('card.cores === 0'));
check('ULT one-card set grows to the vault trio (server + LOCAL)', serverjs.includes("new Set(['corpseblossom', 'gravewarden', 'deathwarrant'])") && appjs.includes("new Set(['corpseblossom', 'gravewarden', 'deathwarrant'])"));
check('server ULT_CARDS mirror: vault trio', /gravewarden: \{ name: 'GRAVE WARDEN', cores: 1, unlock: 20 \}/.test(serverjs) && /deathwarrant: \{ name: 'DEATHWARRANT', cores: 3, unlock: 20 \}/.test(serverjs) && !serverjs.includes("executioner: { name: 'EXECUTIONER', cores"));
check('LOCAL ULT_CARDS mirror matches server', /gravewarden: \{ name: 'GRAVE WARDEN', cores: 1, unlock: 20 \}/.test(appjs) && /deathwarrant: \{ name: 'DEATHWARRANT', cores: 3, unlock: 20 \}/.test(appjs) && !appjs.includes("executioner: { name: 'EXECUTIONER', cores"));
check('EXECUTIONER priced in both SHOP mirrors at Clearance 50', serverjs.includes("executioner: { name: 'EXECUTIONER', unlock: 50, price: { nc: 12000, bt: 150 }, currency: 'mixed' }") && appjs.includes("executioner: { name: 'EXECUTIONER', unlock: 50, price: { nc: 12000, bt: 150 }, currency: 'mixed' }"));
check('combat: warden + executioner registered as unique rigs with the right AA rules', combat.includes("gravewarden: { air: 'no' }") && combat.includes("executioner: { air: 'yes' }") && combat.includes("new Set(['zeroday', 'corpseblossom', 'dronespawner', 'gravewarden'])"));
check('executioner rail: max-hull targeting + boss-only full damage + execute cut', combat.includes("case 'executioner':") && /target\.t\.boss \? dmg : Math\.max\(1, Math\.round\(dmg \* \(es\.chaffPct \|\| 0\.15\)\)\)/.test(combat) && /target\.key !== 'overseer' && target\.hp <= target\.maxHp \* \(es\.execute \|\| 0\.15\)/.test(combat));
check('grave warden: DEATH TOLL bell + yard slow + kill-charge feed', combat.includes('function graveWardenFeed') && combat.includes('function wardenYardMult') && /es\.bell && tower\.bellCd <= 0/.test(combat) && /enemy\.stun = Math\.max\(enemy\.stun \|\| 0, es\.tollStun \|\| 0\.8\)/.test(combat));
check('yard slow bites walkers AND flyers (both move lines hooked)', (combat.match(/wardenYardMult\(enemy\)/g) || []).length >= 3);
check('tower panel reports apex readouts', combat.includes('COMMANDERS BELOW') && combat.includes('TOLL CHARGES'));
check('UPDATE LOG leads with INSANE ERA entry', appjs.indexOf("version: '2026.10.30', tag: 'INSANE ERA'") >= 0 && appjs.indexOf("version: '2026.10.30'") < appjs.indexOf("version: '2026.10.29'"));
check('update log covers insane + warden + executioner + one-card extension', ['INSANE PROTOCOL goes live', 'GRAVE WARDEN joins the ULTIMATUM vault', 'headsman', 'One-card rule extends'].every((s) => appjs.includes(s)));

console.log('--- DAWN FORGE: 50k cores + relic singular + headsman musters + friendly fire-control ---');
check('update log leads with DAWN FORGE entry', appjs.indexOf("version: '2026.10.33', tag: 'DAWN FORGE'") >= 0 && appjs.indexOf("version: '2026.10.33'") < appjs.indexOf("version: '2026.10.32'"));
check('DAWNBRINGER capped at one per commander', TOWERS.some((t) => t.id === 'dawnbreaker' && t.limit === 1 && t.stats.tgt.includes('ONE PER COMMANDER')));
check('EXECUTIONER nerfed: 72 dmg / 0.45 rate / 12% base execute', TOWERS.some((t) => t.id === 'executioner' && t.stats.dmg === 72 && t.stats.rate === 0.45 && t.stats.execute === 0.12));
check('EXECUTIONER ladder rolled down to FINAL RITUAL 330 / 0.68 / 22% / 16%', TOWERS.some((t) => { const tier = t.track[4]; return tier && tier.sets.dmg === 330 && tier.sets.rate === 0.68 && tier.sets.execute === 0.22 && tier.sets.chaffPct === 0.16; }));
check('EXECUTIONER copy musters three rails', shopjs.includes('UP TO 3 PER COMMANDER') && shopjs.includes('Up to three rails per commander.'));
check('deploy caps are count-based (limitReached + limitToast)', combat.includes('function limitReached(entry)') && combat.includes('state.towers.filter((tower) => tower.id === entry.id).length >= entry.limit') && combat.includes('function limitToast(entry)'));
check('both deploy gates run the count check', (combat.match(/limitReached\(entry\)/g) || []).length >= 2 && !combat.includes('state.towers.some((tower) => tower.id === entry.id)'));
check('fire-control skips friendly summons', /let pool = state\.enemies\.filter\(\(enemy\) => \{[\s\S]{0,220}if \(enemy\.friendly\) return false;/.test(combat));
check('dawn splash skips friendlies too', combat.includes('if (!enemy.alive || enemy === target || enemy.friendly) continue;'));
check('summon intel trimmed to name + tag + live HP (allegiance rows purged)', combat.includes('function showSummonTip(summon, event)') && (combat.match(/showSummonTip\(/g) || []).length >= 3 && combat.includes("'CORPSE BLOSSOM SPAWN'") && combat.includes("'DRONE SPAWNER PAYLOAD'") && !combat.includes('ALLEGIANCE') && !combat.includes('CONTACT DMG'));
check('friendly tip shows live HP only (allegiance rows purged)', !combat.includes('ALLEGIANCE') && !combat.includes('TOWERS IGNORE IT</b>'));
check('ledger reconcile floor in both sanitizers (heal up, never down)', /if \(back > \(meta\.totalXp \|\| 0\)\) meta\.totalXp = back;/.test(serverjs) && /if \(back > \(meta\.totalXp \|\| 0\)\) meta\.totalXp = back;/.test(appjs) && /if \(back > \(legacy\.totalXp \|\| 0\)\) legacy\.totalXp = back;/.test(serverjs));
check('vault panel labels the next-core bar + reassures the ledger', shopjs.includes('PROGRESS INTO THE NEXT CORE') && shopjs.includes('banking one never resets or spends your TOTAL XP'));
check('DAWNBRINGER relic rig: corona rings + sun core + muzzle in combat', combat.includes("entry.id === 'dawnbreaker'") && combat.includes("class: 'tw-corona'") && combat.includes("class: 'tw-suncore'") && combat.includes("class: 'tw-muzzle'"));
check('dawn lance fires a layered beam (halo under core)', combat.includes("fireLine(tower, target, 'fx-dawn-halo', 6.5)") && combat.includes("fireLine(tower, target, 'fx-dawn', 2.6)"));
check('relic rig styled: corona spin + sun pulse + halo sheath + green summon tip', styles.includes('@keyframes corona-spin') && styles.includes('@keyframes sun-pulse') && styles.includes('.fx-dawn-halo') && styles.includes('.tip-head.summon') && styles.includes('.tw-dawnbreaker .tw-barrel'));
check('per-kind tower class hook shipped', combat.includes('tw-${entry.cat} tw-${entry.id}'));

console.log('--- WAR CHEST: nerf pass + warden choir + fillers + relay + cap 15 + unique kits ---');
check('update log leads with SPIRAL ESCALATION entry', appjs.indexOf("version: '2026.11.02', tag: 'SPIRAL ESCALATION'") >= 0 && appjs.indexOf("version: '2026.11.02'") < appjs.indexOf("version: '2026.11.01'"));
check('update log covers nerf pass + choir + fillers + relay + cap + art', ['nerf hammer falls', 'SOUL CHOIR', 'SPARK COIL', 'FLAK POST', 'TAR SPRAYER', 'COMMAND RELAY', 'max 15 towers again', 'WAR MACHINE achievement', '17 unique field rigs'].every((s) => appjs.includes(s)));
check('DAWNBRINGER nerfed: 330 dmg / 0.8 rate base', TOWERS.some((t) => t.id === 'dawnbreaker' && t.stats.dmg === 330 && t.stats.rate === 0.8));
check('SUNSLAUGHTER rolled down to 1250 dmg / 40 splash', TOWERS.some((t) => { const tier = t.track && t.track[3]; return t.id === 'dawnbreaker' && tier && tier.sets.dmg === 1250 && tier.sets.splash === 40; }));
check('VIRUS ZERO PATIENT nerfed: 64 dmg / 3.8 rate / 55 corruption', TOWERS.some((t) => { const tier = t.track && t.track[4]; return t.id === 'virus' && tier && tier.sets.dmg === 64 && tier.sets.rate === 3.8 && tier.sets.corrupt === 55; }));
check('SNIPER RAIL GUNNER trimmed to 330', TOWERS.some((t) => { const tier = t.track && t.track[4]; return t.id === 'sniper' && tier && tier.sets.dmg === 330; }));
check('MIRV PROTOCOL trimmed: 650 dmg / 80 splash', TOWERS.some((t) => { const tier = t.track && t.track[3]; return t.id === 'missilesilo' && tier && tier.sets.dmg === 650 && tier.sets.splash === 80; }));
check('APEX CARRIER re-armed to 300 (FIELD AUDIT)', TOWERS.some((t) => { const tier = t.track && t.track[3]; return t.id === 'dronespawner' && tier && tier.sets.drone === 300; }));
check('ZERO DAY nuke cut to 1700 + MIRV cluster to 35%', combat.includes('const NUKE_DAMAGE = 1700') && combat.includes('Math.round(p.dmg * 0.35)'));
const warden = TOWERS.find((t) => t.id === 'gravewarden');
check('GRAVE WARDEN all-around buffs: 180 base yard, 6-tier ladder', warden && warden.stats.rng === 180 && warden.track.length === 6);
check('warden weighted to ONE core (100 bell / 40% slow / 190+6s / 330+4.5s+50%+1.4s)', warden && warden.track[1].sets.bell === 100 && warden.track[2].sets.yardSlow === 0.4 && warden.track[3].sets.bell === 190 && warden.track[3].sets.bellEvery === 6 && warden.track[4].sets.bell === 330 && warden.track[4].sets.bellEvery === 4.5 && warden.track[4].sets.yardSlow === 0.5 && warden.track[4].sets.tollStun === 1.4);
const soulTier = warden && warden.track[5];
check('SOUL CHOIR rebalanced ($5,200 tier, $850 a soul, 40s hymns)', soulTier && soulTier.label === 'SOUL CHOIR' && soulTier.cost === 5200 && soulTier.sets.soul === 1 && soulTier.sets.soulCost === 850 && soulTier.sets.soulCd === 40);
check('soul summon wired: launchWardenSoul + castSoul + core rise float', combat.includes('function launchWardenSoul(tower)') && combat.includes('function castSoul(tower)') && combat.includes("'A SOUL RISES FROM THE CORE'") && combat.includes("lane.len - 4"));
check('soul hull forges from the yard: 10 x TOLL CHARGES (min 60)', combat.includes('Math.max(60, 10 * (tower.tollCharges || 0))'));
check('soul rides the summon pipeline (friendly + reverse + kamikaze)', combat.includes("key: 'soul', t, node: g, fill, shieldFill: fill") && combat.includes('friendly: true, reverse: true,'));
check('soul hover intel: GRAVE WARDEN CHOIR tag wired', combat.includes("'GRAVE WARDEN CHOIR'") && combat.includes("'VENGEFUL SOUL'"));
check('warden panel shows SOUL CHOIR row + SUMMON SOUL ability', combat.includes('<span>SOUL CHOIR</span>') && combat.includes('SUMMON SOUL — $') && combat.includes("id=\"tp-soul\""));
check('warden soulCd ticks in upkeep', combat.includes('tower.soulCd = Math.max(0, (tower.soulCd || 0) - dt);'));
const spark = TOWERS.find((t) => t.id === 'sparkcoil');
const flak = TOWERS.find((t) => t.id === 'flakpost');
const tar = TOWERS.find((t) => t.id === 'tarsprayer');
const relay = TOWERS.find((t) => t.id === 'relay');
check('SPARK COIL filler registered (L6, 950+15, weak 3-tier ladder)', spark && spark.unlock === 6 && spark.price.nc === 950 && spark.price.bt === 15 && spark.cost === 120 && spark.track.length === 3 && spark.track[2].sets.dmg === 16);
check('FLAK POST filler registered (L10, 1400+20, flyers-only)', flak && flak.unlock === 10 && flak.price.nc === 1400 && flak.price.bt === 20 && flak.cost === 160 && flak.stats.tgt.includes('FLYERS ONLY'));
check('TAR SPRAYER filler registered (L12, 1750+25, no damage, slow 15%)', tar && tar.unlock === 12 && tar.price.nc === 1750 && tar.price.bt === 25 && tar.stats.dmg === 0 && tar.stats.slow === 0.15);
check('COMMAND RELAY support rig registered (L18, 4300+70, limit 1, +10% dmg aura)', relay && relay.unlock === 18 && relay.limit === 1 && relay.stats.dmgBuff === 0.1 && relay.track.length === 5);
check('RALLY CRY is the relay capstone ($600 cast / 45s cd / +50% for 6s)', relay && relay.track[4].label === 'RALLY CRY' && relay.track[4].sets.rallyCost === 600 && relay.track[4].sets.rallyCd === 45);
check('filler + relay decals shipped and wired', ['sparkcoil', 'flakpost', 'tarsprayer', 'relay'].every((id) => { const e = TOWERS.find((t) => t.id === id); return e && e.art === `assets/towers/${id}.png` && fs.existsSync(path.join(ROOT, `assets/towers/${id}.png`)); }));
check('FLAK POST flies a new air rule (only) + fire-control honors it', combat.includes("flakpost: { air: 'only' }") && combat.includes("if (rule.air === 'only' && !enemy.t.flying) return false;"));
check('new fire cases wired (fx-spark + fx-flak + flyer-only burst)', combat.includes("case 'sparkcoil':") && combat.includes("fireLine(tower, target, 'fx-spark'") && combat.includes("case 'flakpost':") && combat.includes("fireLine(tower, target, 'fx-flak'") && combat.includes('!enemy.t.flying) continue;'));
check('tar slick applies to walkers only + drags both move paths', combat.includes('enemy.tar = es.slow; enemy.tarT = 0.4;') && (combat.match(/tarMult\(enemy\)/g) || []).length >= 2 && combat.includes('function tarMult(enemy)'));
check('relay network buffs hook dmg + rate + range', combat.includes("dmg *= relayMult(tower, 'dmg');") && combat.includes("relayMult(tower, 'rate')") && combat.includes("relayMult(tower, 'range')"));
check('RALLY CRY casts: castRally + panel button + rally clock', combat.includes('function castRally(tower)') && combat.includes('other.rallyT = 6') && combat.includes('tower.boost = tower.rallyT > 0 ? 1.5 : 1;') && combat.includes("id=\"tp-rally\""));
check('command ceiling back to 15 (SATURATION DOCTRINE buys 20)', combat.includes('const TOWER_BASE = 15;') && combat.includes("CBZPerks.has('saturation') ? base + 5 : base"));
check('SATURATION DOCTRINE perk + WAR MACHINE achievement registered (app)', appjs.includes("id: 'saturation', name: 'SATURATION DOCTRINE', ach: 'warmachine'") && appjs.includes("id: 'warmachine', name: 'WAR MACHINE'") && /warmachine: Boolean\(bigWins >= 15\)/.test(appjs));
check('perk + achievement mirrors land server-side', serverjs.includes("saturation: 'warmachine'") && /warmachine: Boolean\(bigWins >= 15\)/.test(serverjs));
check('four new blueprints priced in both SHOP mirrors', ['sparkcoil', 'flakpost', 'tarsprayer', 'relay'].every((id) => serverjs.includes(`${id}: { name:`) && appjs.includes(`${id}: { name:`)));
check('artHtml reaches the mission bar + locked card previews', shopjs.includes('ULT_XP_PER_CORE, artHtml }') && combat.includes('CBZShop.artHtml ? CBZShop.artHtml(entry)') && (shopjs.match(/artHtml\(entry\) \|\| entry\.icon/g) || []).length >= 3);
check('per-kind field kits live (kindKit + kit CSS + per-tower paint)', combat.includes('function kindKit(entry, chassis, head)') && combat.includes('kindKit(entry, chassis, head);') && styles.includes('.tw-kit-drum') && styles.includes('.tw-relay .tw-kit-halo') && styles.includes('.tw-tarsprayer .tw-kit-vat'));
check('shop meters gained SLICK + NETWORK rows', shopjs.includes("<span>SLICK</span>") && shopjs.includes("<span>NETWORK</span>"));

console.log('--- SPIRAL ESCALATION: insane x2 + four new elites + trims + warden buff + relic price ---');
const escalTypes = ENEMY_TYPES;
check('four elite classes registered (spectre cloak / leech heal / bloat / rampager)', Boolean(
  escalTypes && escalTypes.spectre && escalTypes.spectre.cloak && escalTypes.spectre.cloak.span === 2.6 &&
  escalTypes.leech && escalTypes.leech.heal && escalTypes.leech.heal.pct === 0.018 &&
  escalTypes.bloat && escalTypes.rampager && escalTypes.rampager.armor === 0.1
));
check('elite silhouettes wired (shroud / siphon arcs / blisters / berserk spikes)', combat.includes("class: 'e-ghost e-shroud'") && combat.includes("class: 'e-siphon'") && combat.includes("class: 'e-blister'") && /key === 'rampager'/.test(combat));
check('spawn gaps cover the four elites', combat.includes('spectre: 0.7, leech: 1.6, bloat: 1.9, rampager: 2.4'));
check('phase shroud drops targeting locks (pool filter + pad stickiness guard)', combat.includes('if (enemy.cloaked) return false; // NULL SPECTRE phase shroud') && combat.includes('tower.target.t.flying && !tower.target.cloaked'));
check('cloak state machine cycles in moveEnemy', combat.includes("enemy.node.classList.toggle('e-cloak', Boolean(enemy.cloaked));"));
check('leech siphon field pulses + heals + paints bars', combat.includes('enemy.healT = (enemy.healT === undefined ? enemy.t.heal.every : enemy.healT) - dt;') && combat.includes("fxRing(enemy.fx, enemy.fy, 'fx-ring-heal')") && combat.includes('SIPHON +'));
check('bloatware EMP: consts + empPop + killEnemy hook', combat.includes('const BLOAT_EMP_RADIUS = 85;') && combat.includes('const BLOAT_EMP_SECONDS = 2.5;') && combat.includes('function empPop(x, y)') && combat.includes("if (enemy.key === 'bloat' && !enemy.friendly) empPop(x, y);"));
check('EMP knocks towers offline: upkeep clock + fire-control skip', combat.includes("tower.offlineT = Math.max(0, (tower.offlineT || 0) - dt);") && combat.includes("tower.node.classList.toggle('tw-offline', tower.offlineT > 0);") && combat.includes('if (tower.offlineT > 0) continue; // Bloatware EMP'));
check('rampager enrage drives the ground move line', combat.includes('function enrageMult(enemy)') && combat.includes('enrageMult(enemy) * wardenYardMult(enemy)'));
check('spiral ladder weaves all four elites + new phases', INSANE_WAVES && [4, 5, 7, 10, 11, 15, 22, 26].every((i) => INSANE_WAVES[i].groups.some(([k]) => k === 'spectre')) && [8, 9, 14, 16, 20, 24, 27].every((i) => INSANE_WAVES[i].groups.some(([k]) => k === 'bloat')) && [12, 13, 18, 23, 28, 29].every((i) => INSANE_WAVES[i].groups.some(([k]) => k === 'leech')) && [17, 19, 21, 25, 28].every((i) => INSANE_WAVES[i].groups.some(([k]) => k === 'rampager')) && INSANE_WAVES[4].phase === 'PHASE SHROUD' && INSANE_WAVES[17].phase === 'BERSERK LINE');
check('every elite debuts where the log says it does', INSANE_WAVES && !INSANE_WAVES.slice(0, 4).some((w) => w.groups.some(([k]) => k === 'spectre')) && !INSANE_WAVES.slice(0, 8).some((w) => w.groups.some(([k]) => k === 'bloat')) && !INSANE_WAVES.slice(0, 12).some((w) => w.groups.some(([k]) => k === 'leech')) && !INSANE_WAVES.slice(0, 16).some((w) => w.groups.some(([k]) => k === 'rampager')));
check('HARD gets a late taste: leech + bloatware on three final waves', HARD_WAVES[23].groups.some(([k, c]) => k === 'leech' && c === 4) && HARD_WAVES[25].groups.some(([k, c]) => k === 'bloat' && c === 5) && HARD_WAVES[28].groups.some(([k, c]) => k === 'leech' && c === 4) && HARD_WAVES[28].groups.some(([k, c]) => k === 'bloat' && c === 5));
check('doubled economy: strip 35% / pay 70% / rebuild 2.5s / leaks 12x', combat.includes("mode === 'insane' ? 0.65 : 0.8") && combat.includes("state.protocol === 'insane' ? 0.7 :") && combat.includes("state.protocol === 'insane' ? 2.5 :") && combat.includes('MODE_BOSS_LEAK = { hard: 10, insane: 12, crimson: 10 }'));
check('relay network aura trimmed (12% dmg / 8% range / 8% rate)', TOWERS.some((t) => { const r = t.track && t.track[1]; const u = t.track && t.track[2]; const m = t.track && t.track[3]; return t.id === 'relay' && r && r.sets.dmgBuff === 0.12 && u && u.sets.rangeBuff === 0.08 && m && m.sets.rateBuff === 0.08; }));
check('blossom trimmed: 38% / 60% summons, veins 90, tighter pulse window', TOWERS.some((t) => { const l = t.track && t.track[2]; const f = t.track && t.track[4]; return t.id === 'corpseblossom' && l && l.sets.summonHp === 0.38 && f && f.sets.summonHp === 0.6 && f.sets.veins === 90 && f.sets.veinRate[0] === 0.45 && f.sets.veinRate[1] === 1.3; }));
check('dawnbringer absurd: 250k NC + 2,500 BT declared, 1,600 deploy, doubled forge ladder', TOWERS.some((t) => t.id === 'dawnbreaker' && t.price && t.price.nc === 250000 && t.price.bt === 2500 && t.currency === 'mixed' && t.cost === 1600 && t.track.map((x) => x.cost).join(',') === '1600,2800,4500,7000'));
check('relic price is the point (log + card copy)', appjs.includes('repriced into legend territory') && shopjs.includes('250,000 NC + 2,500 BT declared value'));
check('elite FX + offline state styled', styles.includes('.e-spectre .e-body') && styles.includes('.e-leech .e-siphon') && styles.includes('.e-bloat .e-blister') && styles.includes('.e-rampager .e-body') && styles.includes('.e-cloak .e-chassis') && styles.includes('.fx-ring-heal') && styles.includes('.fx-ring-emp') && styles.includes('.tw-offline .tw-barrel'));
check('update log covers the escalation (insane x2 + four hostiles + trims + relic)', ['INSANE PROTOCOL DOUBLED', 'FOUR NEW HOSTILES', 'NULL SPECTRE', 'DATA LEECH', 'BLOATWARE', 'RAMPAGE UNIT', 'repriced into legend', 'power creep gets a trim'].every((s) => appjs.includes(s)));

console.log('--- GOLDEN VETERANS: golden seals + five new rigs + summon fixes + full clearance ---');
check('update log leads with GOLDEN VETERANS entry', appjs.indexOf("version: '2026.11.03', tag: 'GOLDEN VETERANS'") >= 0 && appjs.indexOf("version: '2026.11.03'") < appjs.indexOf("version: '2026.11.02'"));
check('log covers the batch (seals + veteran + bonds + drums + warrant + fixes + clearance)', ['GOLDEN SEALS go live', 'THE VETERAN decrypts', 'WAR BONDS', 'WAR DRUMS', 'DEATHWARRANT', 'RISEN HULLS scale', 'Summon intel trimmed', 'FULL clearance'].every((s) => appjs.includes(s)));
const veteran = TOWERS.find((t) => t.id === 'veteran');
check('THE VETERAN: L40, expensive, limit-1, longest ladder (8 tiers)', veteran && veteran.unlock === 40 && veteran.price.nc === 13500 && veteran.price.bt === 180 && veteran.cost === 700 && veteran.limit === 1 && veteran.track.length === 8);
check('veteran ladder tops at 200 dmg / 2 rate / 280 rng ($5,200 last tier)', veteran && veteran.track[7].sets.dmg === 200 && veteran.track[7].sets.rate === 2 && veteran.track[7].sets.rng === 280 && veteran.track[7].cost === 5200);
check('veteran guns: 3 switchable, each with a gimmick (heat / blast ring / armor-pierce maxhp)', /const VETERAN_GUNS = \[[\s\S]*?BATTLE RIFLE[\s\S]*?SCATTERGUN[\s\S]*?splash: 32[\s\S]*?LONGRIFLE[\s\S]*?targeting: 'maxhp'[\s\S]*?armorPierce: true[\s\S]*?bossMult: 1\.4[\s\S]*?\];/.test(combat));
check('veteran effStats merges the active gun over the chassis', combat.includes("if (tower.id === 'veteran') {\n    const gun = VETERAN_GUNS[tower.gun || 0] || VETERAN_GUNS[0];"));
check('veteran fire cases: discipline heat + scatter ring + longrifle pierce', combat.includes('case \'veteran\':') && combat.includes('tower.heat = Math.min(3, (tower.heat || 0) + 1)') && combat.includes("damageEnemy(target, shot, { armorPierce: true })"));
check('gun switch is a panel ability (SWITCH GUN + wiring + state reset)', combat.includes('id="tp-gun"') && combat.includes('function switchGun(tower)') && combat.includes("tower.gun = ((tower.gun || 0) + 1) % VETERAN_GUNS.length") && combat.includes('if (entry.id === \'veteran\') { tower.gun = 0; tower.heat = 0; tower.heatNid = null; }'));
check('armorPierce honored in damageEnemy (skips armor, keeps shields)', combat.includes('if (!opts.phase && !opts.armorPierce) {'));
const warbonds = TOWERS.find((t) => t.id === 'warbonds');
check('WAR BONDS: L14 economy rig, 12% bond at $3,000 cap, 5 tiers', warbonds && warbonds.unlock === 14 && warbonds.stats.bond === 0.12 && warbonds.stats.bondCap === 3000 && warbonds.track.length === 5 && warbonds.track[4].sets.bond === 0.22 && warbonds.track[4].sets.bondCap === 12000);
check('warbonds compound into the bond every cleared wave (not the wallet)', combat.includes("if (tower.id !== 'warbonds') continue;\n      const es = effStats(tower);\n      if (!es.bond || !(tower.bank > 0)) continue;"));
check('warbonds panel: deposit + withdraw abilities wired', combat.includes('id="tp-deposit"') && combat.includes('id="tp-withdraw"') && combat.includes('function bondDeposit(tower)') && combat.includes('function bondWithdraw(tower)'));
const wardrums = TOWERS.find((t) => t.id === 'wardrums');
check('WAR DRUMS: L22 splash support, 10% frag at 35u, WAR CHOIR lobs its own shell', wardrums && wardrums.unlock === 22 && wardrums.stats.frag === 0.1 && wardrums.stats.fragRadius === 35 && wardrums.track[4].sets.frag === 0.22 && wardrums.track[4].sets.lob === 1 && wardrums.track[4].sets.lobDmg === 140);
check('fragBurst aura hooks the single-target guns (7 call sites)', (combat.match(/fragBurst\(tower, target/g) || []).length >= 7 && combat.includes('function fragBurst(tower, target, dealt)'));
check('war drums lob clock ticks in upkeep', combat.includes("if (tower.id === 'wardrums') {\n      // WAR CHOIR: the drum lobs its own frag shell on a 4s cadence (tier 5)."));
const warrant = TOWERS.find((t) => t.id === 'deathwarrant');
check('DEATHWARRANT: ULTIMATUM card, 1,500 flat + 25% max hull, 12s verdict ring', warrant && warrant.ultimatum === true && warrant.stats.dmg === 1500 && warrant.stats.warrantPct === 0.25 && warrant.stats.warrantCd === 12 && warrant.stats.rng === 460 && warrant.track.length === 5);
check('warrant ladder: SWIFT VERDICT 10s + FINAL SENTENCE death echo', warrant && warrant.track[3].sets.warrantCd === 10 && warrant.track[4].sets.echo === 1 && warrant.track[4].sets.dmg === 3200 && warrant.track[4].sets.warrantPct === 0.35);
check('warrant state machine: lock → charge → fire with reticle FX', combat.includes('function acquireWarrantTarget(tower, es)') && combat.includes('function beginWarrantCharge(tower, target, es)') && combat.includes('function fireWarrant(tower, target, es)') && combat.includes('enemy.maxHp > best.maxHp ? enemy : best'));
check('warrant payload scales with target hull + fires as phase damage', combat.includes('const payload = Math.round(es.dmg + target.maxHp * (es.warrantPct || 0.25));') && combat.includes("damageEnemy(target, payload, { phase: true, src: 'warrant' })"));
check('DEATH ECHO detonates the kill at 20% hull across 90u', combat.includes("if (es.echo && !target.alive) {") && combat.includes('Math.round(target.maxHp * 0.2)'));
check('charge transfers when the sentenced hull dies mid-charge', combat.includes('// The sentenced hull died mid-charge') && combat.includes('if (next) tower.charge.nid = next.nid;'));
check('warrant FX styled (growing ring + lock pulse + layered beam)', styles.includes('.fx-warrant-ring') && styles.includes('.fx-warrant-lock') && styles.includes('.fx-line.fx-warrant') && styles.includes('.tw-charging .tw-barrel'));
const paragon = TOWERS.find((t) => t.id === 'paragon');
check('PARAGON: golden trophy rig, never sold, GOLDEN TITHE aura', paragon && paragon.golden === true && paragon.price === 0 && paragon.stats.tithe === 0.15 && paragon.track[4].sets.tithe === 0.2 && paragon.limit === 1);
check('golden tithe pays out in killEnemy', combat.includes('const payout = Math.round(enemy.t.bounty * skim * paragonTithe(x, y));') && combat.includes('function paragonTithe(x, y)'));
check('golden seal math mirrored in three places (server + app + shop)', serverjs.includes("const GOLDEN_PROTOCOLS = ['easy', 'medium', 'hard', 'insane'];") && appjs.includes("const GOLDEN_PROTOCOLS = ['easy', 'medium', 'hard', 'insane'];") && shopjs.includes("const GOLDEN_PROTOCOLS = ['easy', 'medium', 'hard', 'insane'];"));
check('gilding bounty 2,500 NC + 10 BT on both reward paths', serverjs.includes('const GOLDEN_REWARD = { nc: 2500, bt: 10 };') && appjs.includes('const GOLDEN_REWARD = { nc: 2500, bt: 10 };'));
check('mission-complete grants golden seals (server + LOCAL)', serverjs.includes('if (golden.length) rewards.golden = golden;') && appjs.includes('if (golden.length) rewards.golden = golden;'));
check('paragon materializes on the fifth seal (sanitize + mission grant)', serverjs.includes("if (allSeals(meta.mapWins) && !meta.owned.includes('paragon')) meta.owned.push('paragon');") && appjs.includes("if (allSeals(meta.mapWins) && !meta.owned.includes('paragon')) meta.owned.push('paragon');") && appjs.includes("rewards.paragon = true;") && serverjs.includes("rewards.paragon = true;"));
check('payout panel rows for seals + paragon', combat.includes('GOLDEN SEAL — ') && combat.includes('PARAGON DECRYPTED'));
check('map cards gild: golden class + badge in recon AND room bays', appjs.includes("mapIsGolden(map.id) ? ' map-golden' : ''") && appjs.includes('GOLDEN SEAL') && (appjs.match(/goldenBadge\(/g) || []).length >= 3);
check('golden border + badge styled', styles.includes('.map-card.map-golden') && styles.includes('.map-gold-badge') && styles.includes('@keyframes gold-pulse'));
check('gold-locked card renders for the unearned paragon', shopjs.includes("if (entry.golden && !allSeals(profile.mapWins)) return 'gold-locked';") && shopjs.includes('gold-lock') && shopjs.includes('GILD ALL 5 SECTORS'));
check('ripened summons: hull from SCALED maxHp (Firewall Warden fix)', combat.includes('const hp = Math.max(1, Math.round(enemy.maxHp * (es.summonHp || 0.3)) + bonus);') && !combat.includes('Math.round(t.hp * (es.summonHp || 0.3))'));
check('risen copies PIERCE: quarter-hull toll per mow, re-hit guard, 4-deep', combat.includes('pierce: true, hitLog: {}, usedGates: new Set(), angle: 0,') && combat.includes('summon.hp -= summon.maxHp * 0.25;') && combat.includes("if (summon.pierce && state.clock - (summon.hitLog[enemy.nid] || -9) < 0.8) continue;"));
check('souls + drones stay kamikaze (first touch still deletes them)', combat.includes('if (!summon.pierce) { despawnSummon(summon); return; }'));
check('summon tip shows ONLY name + tag + hull (no allegiance, no payload rows)', !combat.includes('ALLEGIANCE') && !combat.includes('CONTACT DMG') && !combat.includes('TOWERS IGNORE IT</b>') && combat.includes('tip-hp-track'));
check('FULL CLEARANCE SHOP: admin bypass wired in visibility + both purchase paths', shopjs.includes('const clearanceOk = isAdminProfile(profile) || profile.level >= entry.unlock;') && serverjs.includes('meta.level < item.unlock && !isAdmin(name)') && appjs.includes('meta.level < item.unlock && !(meta.admin || isAdminName(account.name))') && serverjs.includes('meta.level < card.unlock && !isAdmin(name)') && appjs.includes('meta.level < card.unlock && !(meta.admin || isAdminName(account.name))'));
check('vault tab unlock honors admin too', shopjs.includes('const locked = !isAdminProfile(profile) && profile.level < card.unlock;'));
check('five new decals shipped in the die-cut family', ['veteran', 'warbonds', 'wardrums', 'deathwarrant', 'paragon'].every((id) => fs.existsSync(path.join(ROOT, `assets/towers/${id}.png`))) && shopjs.includes("art: 'assets/towers/veteran.png'") && shopjs.includes("art: 'assets/towers/deathwarrant.png'"));
check('new rigs registered in TOWER_RULES + SHOP mirrors (server + LOCAL)', combat.includes("veteran: { air: 'no' }") && combat.includes("deathwarrant: { air: 'yes' }") && combat.includes("paragon: { air: 'yes' }") && serverjs.includes("veteran: { name: 'THE VETERAN', unlock: 40, price: { nc: 13500, bt: 180 }, currency: 'mixed' }") && appjs.includes("warbonds: { name: 'WAR BONDS', unlock: 14, price: { nc: 2800, bt: 40 }, currency: 'mixed' }"));
check('new tower kits + paints styled on the grid', styles.includes('.tw-kit-trirail') && styles.includes('.tw-kit-vault') && styles.includes('.tw-kit-drumhead') && styles.includes('.tw-kit-spire') && styles.includes('.tw-kit-laurel') && styles.includes('.tw-veteran .tw-base') && styles.includes('.tw-paragon .tw-base'));
check('panel rows for the new rigs (weapon rack / bond / frag / verdict / tithe)', combat.includes('WEAPON RACK') && combat.includes('BOND BALANCE') && combat.includes('FRAG ROUNDS') && combat.includes('NEXT VERDICT') && combat.includes('GOLDEN TITHE'));

console.log('--- FIELD AUDIT (2026.11.04): the whole armory under one ruler ---');
const mortar = TOWERS && TOWERS.find((t) => t.id === 'lazermortar');
// DPS accumulates like effStats does: every tier's sets overwrite the running stats.
const mortarDps = [];
let acc = { ...mortar.stats };
mortarDps.push(acc.dmg * acc.rate);
for (const tier of mortar.track) { Object.assign(acc, tier.sets); mortarDps.push(acc.dmg * acc.rate); }
check('LAZER MORTAR ladder climbs monotonically — every rung strictly adds DPS (18/21/31.5/45.5/66.5)', mortarDps.length === 5 && mortarDps.every((v, i) => i === 0 || v > mortarDps[i - 1]) && Math.abs(mortarDps[4] - 66.5) < 0.01, JSON.stringify(mortarDps));
check('LAZER MORTAR splash widens rung over rung (30→60→65→75)', (() => { let prev = mortar.stats.splash; for (const tier of mortar.track) { if (tier.sets.splash) { if (tier.sets.splash <= prev) return false; prev = tier.sets.splash; } } return prev === 75; })());
check('TRUE MORTAR no longer cuts the clock (rate stays 0.35 after BETTER SCOPE)', mortar.track[2].sets.rate === undefined && mortar.track[3].sets.rate === undefined);
check('DRONE SPAWNER maxed line fields 115 DPS (300 payload / 2.6s cadence)', drone && Math.round(drone.track[3].sets.drone / drone.track[3].sets.launchEvery) === 115);
check('DRONE SPAWNER ladder is monotonic in payload (90/150/220/300)', [drone.stats.drone, ...drone.track.filter((t) => t.sets.drone).map((t) => t.sets.drone)].join(',') === '90,150,220,300');
check('FIELD AUDIT logged: 2026.11.04 entry leads the update log', appjs.indexOf("version: '2026.11.04', tag: 'FIELD AUDIT'") > -1 && appjs.indexOf("version: '2026.11.04'") < appjs.indexOf("version: '2026.11.03'"));
check('BUILD bumped to 2026.11.05', appjs.includes("const BUILD = '2026.11.05';"));
check('footer brands GLL FOUNDATIONS', indexhtml.includes('BUILD 2026.11.05 // GLL FOUNDATIONS'));
check('all 6 assets cache-busted to 20261024l', (indexhtml.match(/\?v=20261024l/g) || []).length === 6);

console.log('--- GLL FOUNDATIONS (2026.11.05): hosting merge, npm test law, env admin key ---');
check('GLL FOUNDATIONS logged: 2026.11.05 entry leads the update log', appjs.indexOf("version: '2026.11.05', tag: 'GLL FOUNDATIONS'") > -1 && appjs.indexOf("version: '2026.11.05'") < appjs.indexOf("version: '2026.11.04'"));
check('npm test wired in package.json', read('package.json').includes('"test": "node scripts/run-tests.js"'));
check('AGENTS.md + run-tests.js + CI workflow shipped', fs.existsSync(path.join(ROOT, 'AGENTS.md')) && fs.existsSync(path.join(ROOT, 'scripts', 'run-tests.js')) && fs.existsSync(path.join(ROOT, '.github', 'workflows', 'ci.yml')));
check('old hardcoded admin code is gone from app + server', !appjs.includes('ADMINLOG101011') && !serverjs.includes('ADMINLOG101011'));
check('ADMIN_KEY_CODE env gates the admin code on the server', serverjs.includes('process.env.ADMIN_KEY_CODE') && serverjs.includes('ADMIN_KEY_CODE.length >= 8'));

console.log('--- Syntax gates ---');
for (const f of ['combat.js', 'app.js', 'server.js', 'shop.js']) {
  try { require('child_process').execSync(`node --check ${path.join(ROOT, f)}`, { stdio: 'pipe' }); check(`${f} parses clean`, true); }
  catch (err) { check(`${f} parses clean`, false, String(err.stderr).slice(0, 200)); }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
