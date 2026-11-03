// HELL PROTOCOL validation: Hard-mode overhaul integrity + balance math + deploy checks.
// Usage: node scripts/hard-test.js  (pure file/logic checks — no server needed)
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
// Extract a `const NAME = <literal>;` block and eval just that literal.
// Literals may reference earlier combat constants (e.g. WAVE_HP_SCALE) — preload them.
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

console.log('--- HELL PROTOCOL: combat.js difficulty core ---');
const combat = read('combat.js');
const ENEMY_TYPES = extractLiteral(combat, 'ENEMY_TYPES');
const SURGE_MODS = extractLiteral(combat, 'SURGE_MODS');
const HARD_WAVES = extractLiteral(combat, 'HARD_WAVES');
const EASY_WAVES = extractLiteral(combat, 'EASY_WAVES');
const MEDIUM_WAVES = extractLiteral(combat, 'MEDIUM_WAVES');
const MODE_HP_SCALE = extractLiteral(combat, 'MODE_HP_SCALE');
const MODE_HP_GROWTH = extractLiteral(combat, 'MODE_HP_GROWTH');
const MODE_SPEED = extractLiteral(combat, 'MODE_SPEED');

check('MODE_HP_GROWTH.hard = 0.1 (compounding curve armed)', MODE_HP_GROWTH && MODE_HP_GROWTH.hard === 0.1);
check('MODE_SPEED.hard = 1.15 (hostiles +15% speed)', MODE_SPEED && MODE_SPEED.hard === 1.15);
check('HELLFIRE SURGE defined (+65% HP / +20% speed)', SURGE_MODS && SURGE_MODS.hellfire && SURGE_MODS.hellfire.hp === 1.65 && SURGE_MODS.hellfire.speed === 1.2);
check('legacy linear table intact for easy/medium', MODE_HP_SCALE && MODE_HP_SCALE.easy === 0.12 && MODE_HP_SCALE.medium === 0.14);
check('beginWave uses compounding branch for hard', /growth\s*\?\s*Math\.pow\(1 \+ growth, index\)/.test(combat));
check('spawnEnemy applies protocol speed multiplier', /speed: t\.speed \* \(state\.surgeSpeed \|\| 1\) \* \(MODE_SPEED\[state\.protocol\] \|\| 1\)/.test(combat));
check('wave payout squeeze: hard 0.85x / insane 0.7x / crimson 0.7x', /hardMult = state\.protocol === 'hard' \? 0\.85 : state\.protocol === 'insane' \? 0\.7 : state\.protocol === 'crimson' \? 0\.7 : 1/.test(combat));
check('rebuild window: hard 4.5s / insane 2.5s / crimson 3s', /state\.intermission = state\.protocol === 'crimson' \? 3 : state\.protocol === 'insane' \? 2\.5 : state\.protocol === 'hard' \? 4\.5 : 7/.test(combat));
check('opening salvage stripped on lock-in (hard 0.8 / insane 0.65 / crimson 0.7)', /mode === 'insane' \|\| mode === 'crimson'\) state\.cash = Math\.round\(state\.cash \* \(mode === 'crimson' \? 0\.7 : mode === 'insane' \? 0\.65 : 0\.8\)\)/.test(combat));
check('vote card copy warns about hell', combat.includes('COMPOUNDING HULLS · +15% SPEED · HELLFIRE SURGES'));

console.log('--- HARD ladder integrity ---');
check('HARD ladder has 30 waves', Array.isArray(HARD_WAVES) && HARD_WAVES.length === 30, String(HARD_WAVES && HARD_WAVES.length));
check('EASY ladder untouched at 20 waves', Array.isArray(EASY_WAVES) && EASY_WAVES.length === 20);
check('MEDIUM ladder untouched at 30 waves', Array.isArray(MEDIUM_WAVES) && MEDIUM_WAVES.length === 30);
const badKeys = new Set();
const badMods = new Set();
let hostiles = 0;
let bosses = 0;
for (const wave of HARD_WAVES) {
  for (const [key, count] of wave.groups) {
    if (!ENEMY_TYPES[key]) badKeys.add(key);
    if (!Number.isInteger(count) || count <= 0) badKeys.add(`${key}:${count}`);
    if (ENEMY_TYPES[key] && ENEMY_TYPES[key].boss) bosses += count; else hostiles += count;
  }
  if (wave.mod && !SURGE_MODS[wave.mod]) badMods.add(wave.mod);
}
check('every HARD enemy key exists in roster', badKeys.size === 0, [...badKeys].join(','));
check('every HARD surge mod exists', badMods.size === 0, [...badMods].join(','));
check('HELLFIRE used on >= 3 HARD waves', HARD_WAVES.filter((w) => w.mod === 'hellfire').length >= 3, `${HARD_WAVES.filter((w) => w.mod === 'hellfire').length} waves`);
check('final wave: double Firewall escort', HARD_WAVES[29].groups.some(([k, c]) => k === 'warden' && c >= 2));
check('final wave: overseer present', HARD_WAVES[29].groups.some(([k]) => k === 'overseer'));
check('final wave: double Virus + double Leak stack', HARD_WAVES[29].groups.some(([k, c]) => k === 'virus' && c >= 2) && HARD_WAVES[29].groups.some(([k, c]) => k === 'leak' && c >= 2));
check('armor columns from wave 7 (hardened)', HARD_WAVES[6].mod === 'hardened');
check('Juggernaut packs from wave 10', HARD_WAVES[9].groups.some(([k, c]) => k === 'juggernaut' && c >= 3));
check('ladder density: > 2100 hostiles + > 44 bosses across 30 waves', hostiles > 2100 && bosses > 44, `${hostiles} hostiles / ${bosses} bosses`);

console.log('--- Balance math sanity ---');
const hullAt = (i) => Math.pow(1.1, i);
check('wave 10 hull ≈ 2.36x (escalates early)', Math.abs(hullAt(9) - 2.36) < 0.02, hullAt(9).toFixed(2));
check('wave 20 hull ≈ 6.12x (mid-run bleed)', Math.abs(hullAt(19) - 6.12) < 0.03, hullAt(19).toFixed(2));
check('wave 30 hull ≈ 15.86x (final hell)', Math.abs(hullAt(29) - 15.86) < 0.05, hullAt(29).toFixed(2));
check('final hull far above old linear 5.93x ceiling', hullAt(29) > 15);
// Hellfire wave 14 (index 13): 1.10^13 * 1.65
const hellfireWave = hullAt(13) * 1.65;
check('hellfire wave 14 hull ≈ 5.70x', hellfireWave > 5.5 && hellfireWave < 5.9, hellfireWave.toFixed(2));

console.log('--- Deploy chain: update log, rewards, cache-bust ---');
const appjs = read('app.js');
const serverjs = read('server.js');
const indexhtml = read('index.html');
check('BUILD bumped to 2026.11.06', appjs.includes("const BUILD = '2026.11.06';"));
check('UPDATE LOG leads with IRON RAIN entry, then CRIMSON SIGNAL then HELL PROTOCOL', appjs.indexOf('IRON RAIN') < appjs.indexOf('CRIMSON SIGNAL') && appjs.indexOf('CRIMSON SIGNAL') < appjs.indexOf('HELL PROTOCOL') && appjs.indexOf('HELL PROTOCOL') < appjs.indexOf('RELAY NET'));
const appRewards = extractLiteral(appjs, 'REWARDS');
const serverRewards = extractLiteral(serverjs, 'REWARDS');
check('LOCAL hard rewards bumped (winNC 250 / winXP 260)', appRewards && appRewards.hard.winNC === 250 && appRewards.hard.winXP === 260);
check('LOCAL hard boss + flawless bumped (18 NC / 65 XP / 100 NC flawless)', appRewards && appRewards.hard.bossNC === 18 && appRewards.hard.bossXP === 65 && appRewards.hard.flawlessNC === 100);
check('server.js REWARDS.hard mirrors LOCAL exactly', JSON.stringify(appRewards.hard) === JSON.stringify(serverRewards.hard));
check('easy/medium rewards untouched', appRewards.easy.winNC === 60 && appRewards.medium.winNC === 100);
const busts = indexhtml.match(/\?v=([0-9a-z]+)/g) || [];
check('all 6 index.html assets cache-busted to 20261024n', busts.length === 6 && busts.every((v) => v === '?v=20261024n'), busts.join(' '));
check('play menu copy names the hell pass', appjs.includes('30 waves of pure hell'));

console.log('--- Syntax gates ---');
for (const f of ['combat.js', 'app.js', 'server.js', 'src/shop/data.js', 'src/shop/ui.js']) {
  try { require('child_process').execSync(f.startsWith('src/') ? 'node --input-type=module --check' : `node --check ${path.join(ROOT, f)}`, { stdio: 'pipe', input: f.startsWith('src/') ? fs.readFileSync(path.join(ROOT, f)) : undefined }); check(`${f} parses clean`, true); }
  catch (err) { check(`${f} parses clean`, false, String(err.stderr).slice(0, 200)); }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
