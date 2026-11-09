// CRIMSON DAWN validation: teaser + 192h countdown + event protocol + relic grant chain.
// Usage: node scripts/crimson-test.js  (pure file/logic checks — no server needed)
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
function extractLiteral(src, name) {
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
    if (src[i] === closeCh) { depth -= 1; if (depth === 0) return new Function('WAVE_HP_SCALE', `return (${src.slice(open, i + 1)})`)(0.12); }
  }
  return undefined;
}

console.log('--- Crimson clock (app.js) ---');
const appjs = ['src/app/update-log.js', 'app.js', 'src/app/progression.js', 'src/app/maps.js', 'src/combat/data.js'].map(read).join('\n');
check('BUILD bumped to 2026.11.06', appjs.includes("const BUILD = '2026.11.06';"));
check('deadline is a fixed UTC instant (static-host safe)', appjs.includes("Date.parse('2026-10-30T18:00:00Z')"));
check('192h gate: window is 7 days after unlock', appjs.includes("Date.parse('2026-11-06T18:00:00Z')"));
check('phase machine: sealed -> live -> passed', /now >= CRIMSON_END\).*passed[\s\S]*?now >= CRIMSON_DEADLINE\).*live[\s\S]*?return 'sealed'/.test(appjs));
check('QA override param ?crimson=live|passed', appjs.includes(".get('crimson')"));
check('countdown format T-HHH:MM:SS', /T-\$\{String\(h\).padStart\(3, '0'\)/.test(appjs));
check('menu ticker repaints every second', appjs.includes("setInterval(() => {"));
check('ticker drives button title/sub/count + crimson-live class', appjs.includes("crimson-live") && appjs.includes("THE DAWN IS HERE") && appjs.includes("SIGNAL LOST"));
check('crimson menu entry registered', appjs.includes("crimson: {\n    tag: 'SIGNAL INTERCEPT', title: '???',"));
check('event panel deploys onto THE CRIMSON WELL', appjs.includes("CBZCombat.startMission(CRIMSON_MAP, true, 'crimson')"));
check('CRIMSON_MAP is a dedicated event battleground (not in BATTLE_MAPS)', appjs.includes("name: 'THE CRIMSON WELL'") && appjs.includes("id: 'crimson', difficulty: 'CRIMSON'") && /const BATTLE_MAPS = \{[\s\S]*?\n\};[\s\S]*?const CRIMSON_MAP = \{/.test(appjs));
check('CRIMSON_MAP carries the crimson board theme + phase tears', appjs.includes("theme: 'crimson'") && appjs.includes("mechanic: 'TWIN VEINS + PHASE TEARS'"));
check('buildBoard paints the crimson decor + theme hook', appjs.includes("board.dataset.theme = map.theme") && appjs.includes("class: 'crimson-ritual'") && appjs.includes("class: 'crimson-runesigil'"));
check('openBattlefield accepts a map object for the event map', appjs.includes("typeof mapId === 'object' && mapId ? mapId : BATTLE_MAPS[mapId]"));

console.log('--- Crimson protocol (combat.js) ---');
const combat = [read('combat.js'), read('src/sim/core.js'), read('src/combat/data.js')].join('\n');
const CRIMSON_WAVES = extractLiteral(combat, 'CRIMSON_WAVES');
const ENEMY_TYPES = extractLiteral(combat, 'ENEMY_TYPES');
const SURGE_MODS = extractLiteral(combat, 'SURGE_MODS');
check('MODE_HP_GROWTH.crimson = 0.13 (1.13x compounding)', combat.includes('MODE_HP_GROWTH = { hard: 0.1, insane: 0.135, crimson: 0.13 }'));
check('MODE_SPEED.crimson = 1.18 (+18% hostile speed)', combat.includes('MODE_SPEED = { hard: 1.15, insane: 1.22, crimson: 1.18 }'));
check('MODE_BOSS_LEAK.crimson = 10', combat.includes('MODE_BOSS_LEAK = { hard: 10, insane: 12, crimson: 10 }'));
check('DAWNFIRE SURGE defined (+80% HP / +25% speed)', SURGE_MODS && SURGE_MODS.dawnfire && SURGE_MODS.dawnfire.hp === 1.8 && SURGE_MODS.dawnfire.speed === 1.25);
check('crimson pays 0.7x wave salvage', combat.includes("state.protocol === 'hard' ? 0.85 : state.protocol === 'insane' ? 0.7 : state.protocol === 'crimson' ? 0.7 : 1"));
check('crimson rebuild window 3s', combat.includes("state.protocol === 'crimson' ? 3 : state.protocol === 'insane' ? 2.5 : state.protocol === 'hard' ? 4.5 : 7"));
check('crimson opening salvage stripped 30%', combat.includes("(mode === 'crimson' ? 0.7 : mode === 'insane' ? 0.65 : 0.8)"));
check('crimson wave ladder registered in WAVES map', combat.includes('WAVES = { easy: EASY_WAVES, medium: MEDIUM_WAVES, hard: HARD_WAVES, insane: INSANE_WAVES, crimson: CRIMSON_WAVES }'));
check('CRIMSON ladder has 20 waves', Array.isArray(CRIMSON_WAVES) && CRIMSON_WAVES.length === 20, String(CRIMSON_WAVES && CRIMSON_WAVES.length));
const badKeys = new Set(); const badMods = new Set(); let bosses = 0; let hostiles = 0;
for (const wave of CRIMSON_WAVES) {
  for (const [key, count] of wave.groups) {
    if (!ENEMY_TYPES[key]) badKeys.add(key);
    if (ENEMY_TYPES[key] && ENEMY_TYPES[key].boss) bosses += count; else hostiles += count;
  }
  if (wave.mod && !SURGE_MODS[wave.mod]) badMods.add(wave.mod);
}
check('every crimson enemy key exists in roster', badKeys.size === 0, [...badKeys].join(','));
check('every crimson surge mod exists', badMods.size === 0, [...badMods].join(','));
check('DAWNFIRE burns >= 3 crimson waves', CRIMSON_WAVES.filter((w) => w.mod === 'dawnfire').length >= 3, `${CRIMSON_WAVES.filter((w) => w.mod === 'dawnfire').length}`);
check('final hour: overseer + 2 wardens + 3 viruses + 3 leaks under dawnfire', CRIMSON_WAVES[19].mod === 'dawnfire' && CRIMSON_WAVES[19].groups.some(([k, c]) => k === 'warden' && c >= 2) && CRIMSON_WAVES[19].groups.some(([k, c]) => k === 'virus' && c >= 3) && CRIMSON_WAVES[19].groups.some(([k, c]) => k === 'leak' && c >= 3));
check('ladder density: > 1300 hostiles + > 35 bosses', hostiles > 1300 && bosses > 35, `${hostiles} hostiles / ${bosses} bosses`);
const hullAt = (i) => Math.pow(1.13, i);
check('crimson hull: wave 10 ≈ 3.0x, wave 20 ≈ 10.2x', Math.abs(hullAt(9) - 3.0) < 0.03 && Math.abs(hullAt(19) - 10.2) < 0.1, `w10=${hullAt(9).toFixed(2)} w20=${hullAt(19).toFixed(2)}`);
check('dawnbreaker combat case: phase damage + splash burn', combat.includes("case 'dawnbreaker':") && combat.includes("{ phase: true, src: 'dawn' }"));
check('dawnbreaker tracks air natively', combat.includes("dawnbreaker: { air: 'yes' }"));

console.log('--- Relic grant chain (server + LOCAL mirrors) ---');
const serverjs = read('server.js');
const serverRewards = extractLiteral(serverjs, 'REWARDS');
const localRewards = extractLiteral(appjs, 'REWARDS');
check('server REWARDS.crimson exists (winNC 500 / winXP 600)', serverRewards && serverRewards.crimson && serverRewards.crimson.winNC === 500 && serverRewards.crimson.winXP === 600);
check('LOCAL REWARDS.crimson mirrors server exactly', JSON.stringify(serverRewards.crimson) === JSON.stringify(localRewards.crimson));
check('easy/medium/hard rewards untouched by event', localRewards.easy.winNC === 60 && localRewards.medium.winNC === 100 && localRewards.hard.winNC === 250);
const grantRe = /difficulty\) === 'crimson' && !meta\.owned\.includes\('dawnbreaker'\)[\s\S]{0,80}meta\.owned\.push\('dawnbreaker'\)/;
check('server grants relic on crimson win', grantRe.test(serverjs));
check('LOCAL grants relic on crimson win', grantRe.test(appjs));
check('relic flag returned in both payloads', (serverjs.match(/relic, levelsGained/g) || []).length === 1 && (appjs.match(/relic, levelsGained/g) || []).length === 1);
check('dawnbreaker NOT in LOCAL shop mirror (unpurchasable)', !/dawnbreaker: \{ name: 'DAWNBRINGER'/.test(appjs));

console.log('--- Shop relic card (src/shop/data.js) ---');
const shopjs = read('src/shop/data.js') + read('src/shop/ui.js');
check('DAWNBRINGER blueprint registered as event relic', shopjs.includes("id: 'dawnbreaker'") && shopjs.includes('event: true'));
check('event-locked visibility gate (never buyable)', shopjs.includes("if (entry.event) return 'event-locked';"));
check('event-locked card renders SLAY THE CRIMSON DAWN lock', shopjs.includes('SLAY THE CRIMSON DAWN'));
check('relic stats: 330 dmg / air+ground / ignores armor / one per commander', shopjs.includes("stats: { dmg: 330, rate: 0.8, rng: 320, tgt: 'SINGLE / AIR + GROUND · IGNORES ARMOR · ONE PER COMMANDER' }") && shopjs.includes("event: true, limit: 1,"));
check('SUNSLAUGHTER top tier: 1250 dmg + 40 splash', shopjs.includes("dmg: 1250, splash: 40"));

console.log('--- DAWN CLEARANCE: admin relic decrypt ---');
check('server sanitizeMeta grants the relic to the admin', serverjs.includes("if (isAdmin(name) && !meta.owned.includes('dawnbreaker')) meta.owned.push('dawnbreaker');"));
check('LOCAL sanitizeMeta mirrors the admin decrypt', appjs.includes("if ((meta.admin || isAdminName(account.name)) && !meta.owned.includes('dawnbreaker')) meta.owned.push('dawnbreaker');"));
check('LOCAL loadout link heals the armory before the bay check', /path === '\/api\/loadout'[\s\S]{0,140}sanitizeMeta\(account\)/.test(appjs));
check('civilian grant is name-gated (admin roster only)', appjs.includes("new Set(['JACKSONLOOMIS-COMMITS'])") && serverjs.includes("new Set(['JACKSONLOOMIS-COMMITS'])"));
check('UPDATE LOG leads with DAWN CLEARANCE, then INSANE ERA', appjs.indexOf("version: '2026.10.31', tag: 'DAWN CLEARANCE'") >= 0 && appjs.indexOf("version: '2026.10.31'") < appjs.indexOf("version: '2026.10.30'"));
check('event clock untouched by the decrypt (sealed until T-0 for everyone else)', appjs.includes("Date.parse('2026-10-30T18:00:00Z')") && appjs.includes("Date.parse('2026-11-06T18:00:00Z')"));
check('relic ships with its own decal, wired into the card', shopjs.includes("art: 'assets/towers/dawnbreaker.webp'") && fs.existsSync(path.join(ROOT, 'assets/towers/dawnbreaker.webp')));

console.log('--- Shell + styles ---');
const indexhtml = read('index.html');
const styles = read('styles.css');
check('menu button ??? with crimson subtext', indexhtml.includes('data-menu="crimson"') && indexhtml.includes('???</strong>') && indexhtml.includes('The Crimson Dawn Approaches'));
check('countdown line lives on the button', indexhtml.includes('id="crimson-count"'));
check('all 6 assets cache-busted to 20261024p', (indexhtml.match(/\?v=20261024p/g) || []).length === 6);
check('eerie glow styles: menu pulse + big countdown + deploy button', styles.includes('.menu-item.menu-crimson') && styles.includes('.crimson-big') && styles.includes('.crimson-deploy'));
check('dawn beam style for the relic', styles.includes('.fx-dawn'));
check('footer brands the Well', indexhtml.includes('THE CRIMSON WELL IS OPEN'));
check('UPDATE LOG leads with CRIMSON VEINS, then IRON RAIN, then CRIMSON SIGNAL', appjs.indexOf('CRIMSON VEINS') < appjs.indexOf('IRON RAIN') && appjs.indexOf('IRON RAIN') < appjs.indexOf('CRIMSON SIGNAL') && appjs.indexOf('CRIMSON SIGNAL') < appjs.indexOf('HELL PROTOCOL'));

console.log('--- Crimson hostiles + Well theme (combat.js + styles.css) ---');
check('hostiles of the dawn carry the e-crimson mark', combat.includes('` e-crimson${') && combat.includes("class: 'e-aura'"));
check('crimson spawn burns an ember ring', combat.includes("emit('ring', x, y, 'fx-ring-crimson')"));
check('surge waves burn brighter (state.surgeMod tracked)', combat.includes('state.surgeMod = wave.mod || null;') && combat.includes(" e-surge"));
check('Well styles: bleeding lanes + ritual seals + sigils + vignette', styles.includes('#board[data-theme="crimson"] .track-line') && styles.includes('.crimson-ritual') && styles.includes('.crimson-runesigil') && styles.includes('.crimson-vignette'));
check('hostile styles: aura pulse + ember glow + red hull readout', styles.includes('.e-crimson .e-aura') && styles.includes('.e-crimson .e-chassis') && styles.includes('.e-crimson .hp-fill'));
check('private early-access gate exists and never leaks to non-admins', appjs.includes('function crimsonEarlyAccess()') && appjs.includes("if (crimsonEarlyAccess()) return 'live';"));

console.log('--- Flight Corridor: drone nerf + corridor pads ---');
const CRIMSON_MAP = extractLiteral(appjs, 'CRIMSON_MAP');
check('MODE_LEAK table: crimson drones leak 1 core dmg', combat.includes('MODE_LEAK = { crimson: { drone: 1 } }'));
check('base drone core dmg untouched outside crimson (2)', ENEMY_TYPES && ENEMY_TYPES.drone && ENEMY_TYPES.drone.dmg === 2);
check('leakEnemy routes through the leakDamage helper', /function leakEnemy[\s\S]{0,200}?const leakDmg = leakDamage\(enemy\);/.test(combat));
check('leakDamage honors per-protocol overrides before boss multiplier', /function leakDamage[\s\S]*?overrides\[enemy\.key\] != null[\s\S]*?MODE_BOSS_LEAK/.test(combat));
check('hostile intel tip reports protocol-adjusted CORE DMG', combat.includes('<div><span>CORE DMG</span><b>${leakDamage(enemy)}</b></div>'));
check('boss 10x leak rule untouched', combat.includes('MODE_BOSS_LEAK = { hard: 10, insane: 12, crimson: 10 }'));
const pads = (CRIMSON_MAP && Array.isArray(CRIMSON_MAP.pads)) ? CRIMSON_MAP.pads : [];
check('CRIMSON_MAP lays 20 AA pads', pads.length === 20, String(pads.length));
const hasPad = (x, y) => pads.some(([px, py]) => px === x && py === y);
check('west corridor pad at (300, 225)', hasPad(300, 225));
check('east corridor pad at (700, 365)', hasPad(700, 365));
check('all 18 original pads preserved', [[60,60],[300,60],[505,60],[700,60],[940,60],[140,210],[60,300],[505,180],[700,200],[860,180],[940,300],[900,400],[140,420],[300,420],[505,420],[400,540],[820,540],[200,540]].every(([x, y]) => hasPad(x, y)));
const lineDist = (spawn, core, pad) => Math.abs((core[1] - spawn[1]) * (pad[0] - spawn[0]) - (core[0] - spawn[0]) * (pad[1] - spawn[1])) / Math.hypot(core[0] - spawn[0], core[1] - spawn[1]);
const segDist = (p, a, b) => {
  const [px, py] = p, [ax, ay] = a, [bx, by] = b;
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};
check('west pad sits on the (0,120)->core flight line (<10u)', lineDist([0, 120], [505, 300], [300, 225]) < 10);
check('east pad sits on the (1060,480)->core flight line (<10u)', lineDist([1060, 480], [505, 300], [700, 365]) < 10);
check('corridor pads clear of the veins (>=36u, deploy-legal)', segDist([300, 225], [290, 300], [380, 300]) >= 36 && segDist([300, 225], [220, 190], [220, 240]) >= 36 && segDist([700, 365], [690, 300], [790, 300]) >= 36 && segDist([700, 365], [790, 360], [790, 410]) >= 36);
check('UPDATE LOG leads with FLIGHT CORRIDOR entry', appjs.indexOf("version: '2026.10.29', tag: 'FLIGHT CORRIDOR'") >= 0 && appjs.indexOf("version: '2026.10.29'") < appjs.indexOf("version: '2026.10.28'"));
check('update log covers drone nerf + corridor pads + intel readout', ['1 core damage per leak', 'Two AA pads laid directly under the drone approach lines', 'protocol-adjusted CORE DMG'].every((s) => appjs.includes(s)));

console.log('--- Syntax gates ---');
for (const f of ['app.js', 'combat.js', 'server.js', 'src/shop/data.js', 'src/shop/ui.js', 'src/app/update-log.js', 'src/app/progression.js', 'src/app/maps.js', 'src/combat/data.js', 'src/sim/core.js']) {
  try { require('child_process').execSync((f === 'app.js' || f === 'combat.js' || f.startsWith('src/')) ? 'node --input-type=module --check' : `node --check ${path.join(ROOT, f)}`, { stdio: 'pipe', input: (f === 'app.js' || f === 'combat.js' || f.startsWith('src/')) ? fs.readFileSync(path.join(ROOT, f)) : undefined }); check(`${f} parses clean`, true); }
  catch (err) { check(`${f} parses clean`, false, String(err.stderr).slice(0, 200)); }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
