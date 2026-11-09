// Simulation core: everything a host needs to run a mission without a page (no DOM, no rAF, no clock reads).
// The view (combat.js) registers handlers in `view`; a headless host registers none. env carries what the page used to
// provide through globals (perks, room size, debug flags) so the browser and a Node host run the same code.
import { rand, createRng, useRng } from './rng.js';
import { buildSampler } from './track.js';
import { BASE_MAX, BLOAT_EMP_RADIUS, BLOAT_EMP_SECONDS, CORE_CLEAR, EASY_BOSS_RELIEF, EASY_WAVES, ENEMY_TYPES, FOOT_HALF, MODE_BOSS_LEAK, MODE_HP_GROWTH, MODE_HP_SCALE, MODE_LEAK, MODE_SPEED, NUKE_COOLDOWN, NUKE_COST, NUKE_DAMAGE, NUKE_RADIUS, PAD_AIR_BOOST, PAD_SNAP, SEP, SPAWN_GAP, SUMMON_CAP, SURGE_MODS, TOWER_BASE, TOWER_PER_ALLY, TOWER_RULES, TRACK_CLEAR, VETERAN_GUNS, WASTE_DPS, WASTE_RADIUS, WASTE_SECONDS, WAVES, WAVE_HP_SCALE } from '../combat/data.js';

export const view = {};
export function emit(type, ...args) { const handler = view[type]; if (handler) handler(...args); }

// Page-provided inputs. combat.js fills these in; a Node host leaves the defaults.
// guestIntent(kind, tower): the old co-op guest forwards the click instead of acting (returns true when it did).
export const env = { perks: { has: () => false }, roomPlayers: 1, debugWave: 0, debugFreeze: false, coopGuest: () => false, guestIntent: () => false };

// Simulation state: plain data only (the part a server can run). Anything that touches the page lives in combat.js `ui`.
const initialState = () => ({
  mode: 'idle', // idle | vote | countdown | waves | over
  protocol: 'easy', speed2x: false, bossHpMult: 1,
  wasteZones: [],
  map: null, samplers: [], gateEvents: [], zoneRanges: [],
  waveIndex: -1, queue: [], spawnGap: 0, intermission: 0, countdown: 0,
  cash: 0, baseHp: BASE_MAX, enemies: [], kills: 0, bossesKilled: 0, earned: 0, clock: 0, nidSeq: 0,
  towers: [], projectiles: [], pidSeq: 0, tidSeq: 0,
  bonusNc: 0,
  corpseLust: 0, // reserved telemetry: total Blood Lust banked across Blossoms
});
// `state` is a live binding: the browser keeps the one default; a multi-room host makes one per room with createState
// and calls useState(s) before each synchronous room step or intent (JS is single threaded, so nothing interleaves).
export let state = initialState();
// seed given: the room gets its own rng stream (installed by useState); omitted: it uses whatever rand() is set to.
export function createState(seed) {
  const s = initialState();
  if (seed != null) s.rng = createRng(seed);
  return s;
}
export function useState(s) { state = s; if (s.rng) useRng(s.rng); }

// The mission ended: set the mode, then the view shows the result (the host also sends it to rooms).
export function endSim(win) { state.mode = 'over'; emit('end', win); }

export function leakDamage(enemy) {
  const overrides = MODE_LEAK[state.protocol] || {};
  if (!enemy.t.boss && overrides[enemy.key] != null) return overrides[enemy.key];
  return Math.round(enemy.t.dmg * (enemy.t.boss ? (MODE_BOSS_LEAK[state.protocol] || 1) : 1));
}

export function missionWaves() { return WAVES[state.protocol] || EASY_WAVES; }

export function towerLimit() {
  const players = env.roomPlayers || 1;
  const base = TOWER_BASE + TOWER_PER_ALLY * (Math.max(1, Math.min(4, players)) - 1);
  return env.perks.has('saturation') ? base + 5 : base;
}

// Per-blueprint deploy caps: entry.limit is a real COUNT now — the headsman
// musters up to three rails, the one-off rigs stay at one. Mirrored by the
// toast copy so the reason reads right at any cap.
export function limitReached(entry) {
  if (!entry.limit) return false;
  return state.towers.filter((tower) => tower.id === entry.id).length >= entry.limit;
}

export function limitToast(entry) {
  return entry.limit === 1
    ? `${entry.name} is a one-off rig — only one deploys per commander.`
    : `${entry.name} is capped — only ${entry.limit} deploy per commander.`;
}

// --- Track engine: sample every map path once (src/sim/track.js, no DOM), then move by arc length ---
export function buildSamplers(map) { return map.paths.map(buildSampler); }

export function nearestDist(sampler, x, y) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < sampler.pts.length; i++) {
    const dx = sampler.pts[i][0] - x;
    const dy = sampler.pts[i][1] - y;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = i; }
  }
  return { dist: best * sampler.step, err: Math.sqrt(bestD) };
}

export function prepMechanics(map, samplers) {
  // Phase gates: teleport an enemy once, from its position on one track to another track.
  state.gateEvents = (map.gates || []).map((gate, index) => {
    let from = null;
    let to = null;
    samplers.forEach((sampler, pathIdx) => {
      const a = nearestDist(sampler, gate.x, gate.y);
      const b = nearestDist(sampler, gate.toX, gate.toY);
      if (a.err < 30 && (from === null || a.dist < from.dist)) from = { pathIdx, dist: a.dist };
      if (b.err < 30 && (to === null || b.dist < to.dist)) to = { pathIdx, dist: b.dist };
    });
    return { index, gate, from, to };
  }).filter((event) => event.from && event.to);
  // Overcharge zones: haste fields that speed enemies up while inside the ring.
  state.zoneRanges = [];
  (map.zones || []).forEach((zone) => {
    samplers.forEach((sampler, pathIdx) => {
      let open = false;
      let start = 0;
      for (let i = 0; i < sampler.pts.length; i++) {
        const [x, y] = sampler.pts[i];
        const inside = (x - zone.x) ** 2 + (y - zone.y) ** 2 <= zone.r * zone.r;
        if (inside && !open) { open = true; start = i * sampler.step; }
        if (!inside && open) { open = false; state.zoneRanges.push({ pathIdx, a: start, b: i * sampler.step }); }
      }
      if (open) state.zoneRanges.push({ pathIdx, a: start, b: sampler.len });
    });
  });
}

export function inHasteZone(pathIdx, dist) {
  return state.zoneRanges.some((r) => r.pathIdx === pathIdx && dist >= r.a && dist <= r.b);
}

// --- Spawning / damage / death -------------------------------------------------------
export function spawnEnemy(key, pathIdx) {
  const t = ENEMY_TYPES[key];
  const enemy = {
    key, t,
    nid: ++state.nidSeq,
    // Wave pressure: HP scales per wave index, surge modifiers stack on top.
    // Easy relief: commanders (bosses) spawn with slightly less hull on EASY.
    hp: Math.round(t.hp * (t.boss ? state.bossHpMult : 1) * (state.hpScale || 1)), maxHp: Math.round(t.hp * (t.boss ? state.bossHpMult : 1) * (state.hpScale || 1)), shield: 0, maxShield: t.shield || 0,
    pathIdx, dist: env.debugFreeze ? 260 + rand() * 480 : 0, speed: t.speed * (state.surgeSpeed || 1) * (MODE_SPEED[state.protocol] || 1), alive: true,
    usedGates: new Set(), pulseTimer: 8, replicated: false, shielded: false, angle: 0,
  };
  if (t.flying) {
    // Air units leave the track behind: straight flight plan from spawn gate to core.
    const [sx, sy] = state.samplers[pathIdx].at(0);
    const [tx, ty] = corePos();
    enemy.flight = { sx, sy, tx, ty, total: Math.max(1, Math.hypot(tx - sx, ty - sy)) };
    enemy.dist = env.debugFreeze ? Math.min(enemy.flight.total * 0.85, 260 + rand() * 480) : 0;
  }
  state.enemies.push(enemy);
  const [x, y] = enemy.flight ? flightPos(enemy, enemy.dist) : state.samplers[pathIdx].at(enemy.dist);
  enemy.fx = x;
  enemy.fy = y;
  if (state.protocol === 'crimson') emit('ring', x, y, 'fx-ring-crimson'); // the vein spits them out burning
  if (t.boss) { emit('banner', t.name, '// HOSTILE COMMANDER DETECTED', 'banner-red'); emit('boss'); }
  return enemy;
}

export function damageEnemy(enemy, amount, opts = {}) {
  if (enemy.friendly && !opts.friendlyFire) return; // Blossom summons shrug off friendly grid fire
  let left = amount;
  if (!opts.phase && !opts.armorPierce) {
    // Null Beacon collapse modules shred deeper into armor; base weak still halves it.
    const armorMult = enemy.weak ? Math.max(0.05, 0.5 - 0.15 * (enemy.shredLv || 0)) : 1;
    const armor = (enemy.t.armor || 0) * armorMult;
    left *= 1 - armor;
    if (enemy.shield > 0) {
      const absorbed = Math.min(enemy.shield, left);
      enemy.shield -= absorbed;
      left -= absorbed;
    }
  }
  if (enemy.weak) left *= 1 + (enemy.weakAmp || 0.15);
  // Cryo Frostbite: hostiles that are actively slowed take amplified damage.
  if (enemy.frost && (enemy.slow || 0) > 0) left *= 1 + enemy.frost;
  enemy.hp = Math.max(0, enemy.hp - left);
  if (enemy.t.boss) emit('boss'); // the top-bar boss readout tracks every hit
  if (enemy.key === 'leak' && !enemy.replicated && enemy.hp <= enemy.maxHp / 2) replicateLeak(enemy);
  if (enemy.key === 'overseer' && !enemy.shielded && enemy.hp <= enemy.maxHp * 0.25) {
    enemy.shielded = true;
    enemy.shield = enemy.maxShield;
    emit('ring', ...posOf(enemy), 'fx-ring-white');
  }
  if (enemy.hp <= 0) killEnemy(enemy, opts.src);
}

export function killEnemy(enemy, src) {
  if (!enemy.alive) return;
  enemy.alive = false;
  emit('tipHide', enemy);
  if (enemy.friendly) {
    // Summons expire quietly — no bounty, no kill credit, no Blossom chains.
    enemy.fate = 'dying';
    return;
  }
  // Zero Day tier-5 skim: enemy bounties pay +10% while the rig runs that tier.
  const skim = state.towers.some((tower) => tower.id === 'zeroday' && (effStats(tower).bounty || 0) > 0) ? 1.1 : 1;
  const [x, y] = posOf(enemy);
  // PARAGON: the golden standard taxes every kill inside its ring.
  const payout = Math.round(enemy.t.bounty * skim * paragonTithe(x, y));
  state.cash += payout;
  state.earned += payout;
  state.kills += 1;
  if (enemy.t.boss) state.bossesKilled += 1;
  emit('float', x, y - enemy.t.size - 6, `+$${payout}`, 'cash-float');
  emit('ring', x, y, 'fx-ring-red');
  enemy.fate = 'dying';
  if (enemy.key === 'bloat' && !enemy.friendly) empPop(x, y); // death rattle — the grid goes dark around the corpse
  corpseBlossomFeed(enemy, x, y, src);
  graveWardenFeed(enemy, x, y);
  emit('hud');
  if (enemy.t.boss) emit('boss');
}

// --- Corpse Blossom: the dead rise and walk the lane backwards -------------------
export function corpseBlossomFeed(enemy, x, y, src) {
  for (const tower of state.towers) {
    if (tower.id !== 'corpseblossom') continue;
    if (Math.hypot(x - tower.x, y - tower.y) > effStats(tower).rng) continue;
    const lvl = trackLevel(tower);
    if (lvl >= 4) {
      tower.lust = (tower.lust || 0) + (effStats(tower).lust || 1);
      emit('float', tower.x, tower.y - 44, `BLOOD LUST ${tower.lust}`, 'lust-float');
      emit('panelLive', tower); // live lust counter
    }
    spawnSummon(enemy, tower, src === 'veins' && lvl >= 2);
  }
}

// --- Grave Warden: the yard keeps its dead, and the bell keeps the score ----------
// Every hostile that dies inside the yard rings up a charge; charges knock time
// off the next toll. When the bell sounds, everything hostile in the yard takes
// the pulse and chaff is stunned where it stands — commanders walk through unmoved.
export function graveWardenFeed(enemy, x, y) {
  for (const tower of state.towers) {
    if (tower.id !== 'gravewarden') continue;
    if (Math.hypot(x - tower.x, y - tower.y) > effStats(tower).rng) continue;
    tower.tollCharges = (tower.tollCharges || 0) + 1;
    tower.bellCd = Math.max(0, (tower.bellCd || 0) - 0.4);
    emit('panelLive', tower); // live toll counter
  }
}

// Grave Yard slow: hostiles inside a CHILL GRAVE yard drag their heels — flyers too.
export function wardenYardMult(enemy) {
  let mult = 1;
  const [px, py] = posOf(enemy);
  for (const tower of state.towers) {
    if (tower.id !== 'gravewarden') continue;
    const es = effStats(tower);
    if (!es.yardSlow || es.yardSlow >= 1) continue;
    if (Math.hypot(px - tower.x, py - tower.y) <= es.rng) mult = Math.min(mult, 1 - es.yardSlow);
  }
  return mult;
}

export function spawnSummon(enemy, tower, stained) {
  if (state.enemies.filter((item) => item.friendly && item.alive).length >= SUMMON_CAP) return;
  const t = enemy.t;
  const es = effStats(tower);
  // GOLDEN VETERANS fix — risen hulls forge from the SCALED hull (wave curve +
  // surge mods included), not the roster base: a wave-30 Firewall Warden now
  // rises at 60% of ~50,000, not 60% of its 2,400 paper hull.
  const bonus = stained ? 50 + (es.stainedPct ? Math.round(enemy.maxHp * 0.1) : 0) : 0;
  const hp = Math.max(1, Math.round(enemy.maxHp * (es.summonHp || 0.3)) + bonus);
  const summon = {
    key: enemy.key, t, nid: ++state.nidSeq,
    hp, maxHp: hp, shield: 0, maxShield: t.shield || 0,
    pathIdx: enemy.pathIdx, dist: enemy.dist || 0,
    speed: t.speed * 0.85, alive: true, friendly: true, reverse: true,
    pierce: true, hitLog: {}, usedGates: new Set(), angle: 0,
  };
  if (t.flying) {
    // Dead flyers rise where they fell and fly the route BACK to the breach gate.
    const [gx, gy] = state.samplers[enemy.pathIdx].at(0);
    summon.flight = { sx: enemy.fx, sy: enemy.fy, tx: gx, ty: gy, total: Math.max(1, Math.hypot(gx - enemy.fx, gy - enemy.fy)) };
    summon.dist = 0;
    summon.fx = enemy.fx;
    summon.fy = enemy.fy;
  } else {
    const [px, py] = state.samplers[enemy.pathIdx].at(summon.dist);
    summon.fx = px;
    summon.fy = py;
  }
  state.enemies.push(summon);
  emit('bloom', summon.fx, summon.fy, 6);
  emit('ring', summon.fx, summon.fy, 'fx-ring-virus');
  emit('float', summon.fx, summon.fy - t.size - 10, stained ? 'BLOOD STAINED RISES' : 'RISEN', 'summon-float');
  return summon;
}

export function despawnSummon(summon) {
  summon.alive = false;
  summon.fate = 'gone';
  emit('ring', summon.fx, summon.fy, 'fx-ring-virus');
}

// Summons mow the lane: every hostile they touch takes damage equal to the
// summon's full hull. Kamikaze rigs (strike drones, the Warden's souls)
// collapse on first contact — but Blossom risen copies PIERCE now: each mow
// costs the risen a quarter of its hull, so a fresh copy cuts through four
// hostiles instead of dying on the first bump.
export function contactDamage(summon) {
  const [sx, sy] = [summon.fx, summon.fy];
  for (const enemy of state.enemies) {
    if (!enemy.alive || enemy.friendly) continue;
    if (summon.flight || enemy.flight) {
      const [ex, ey] = posOf(enemy);
      if (Math.hypot(ex - sx, ey - sy) > 14) continue;
    } else if (enemy.pathIdx !== summon.pathIdx || Math.abs(enemy.dist - summon.dist) > 12) {
      continue;
    }
    if (summon.pierce && state.clock - (summon.hitLog[enemy.nid] || -9) < 0.8) continue; // no re-hit spam on the same hull
    damageEnemy(enemy, summon.maxHp, { src: 'summon' });
    if (!summon.pierce) { despawnSummon(summon); return; }
    summon.hitLog[enemy.nid] = state.clock;
    summon.hp -= summon.maxHp * 0.25;
    emit('ring', sx, sy, 'fx-ring-virus');
    if (summon.hp <= 0) { despawnSummon(summon); return; }
  }
}

export function moveSummon(summon, dt) {
  if (env.debugFreeze || state.mode !== 'waves') return;
  if (summon.flight) {
    summon.dist += summon.speed * (1 - (summon.slow || 0)) * dt;
    if (summon.dist >= summon.flight.total) { despawnSummon(summon); return; }
    const [fx, fy] = flightPos(summon, summon.dist);
    summon.fx = fx;
    summon.fy = fy;
    contactDamage(summon);
    return;
  }
  summon.dist -= summon.speed * (1 - (summon.slow || 0)) * dt;
  if (summon.dist <= 0) { despawnSummon(summon); return; }
  const [x, y] = state.samplers[summon.pathIdx].at(summon.dist);
  summon.fx = x;
  summon.fy = y;
  contactDamage(summon);
}

// --- Drone Spawner: the carrier fabricates one-way strike drones ---------------------
// Every launchEvery seconds (while a hostile stands inside its ring) the
// carrier rolls a strike drone off the line: a friendly flyer that rockets
// across the grid with target lead and detonates on the first hostile it
// touches for its full payload. Rides the summon pipeline (flight + kamikaze
// contact), so it engages walkers and flyers alike and respects SUMMON_CAP.
export function launchStrikeDrone(tower) {
  if (state.enemies.filter((item) => item.friendly && item.alive).length >= SUMMON_CAP) return false;
  const es = effStats(tower);
  const pool = state.enemies.filter((enemy) => {
    if (!enemy.alive || enemy.friendly) return false;
    const [px, py] = posOf(enemy);
    return Math.hypot(px - tower.x, py - tower.y) <= es.rng;
  });
  if (!pool.length) return false;
  const prey = pool.reduce((best, enemy) => (enemy.dist > best.dist ? enemy : best));
  // Lead the target: aim where the prey will be roughly one flight-time from now.
  const lead = 0.9;
  let aimX;
  let aimY;
  if (prey.flight) {
    const [fx, fy] = flightPos(prey, prey.dist + prey.speed * lead);
    aimX = fx;
    aimY = fy;
  } else {
    const future = Math.min(state.samplers[prey.pathIdx].len, prey.dist + prey.speed * (1 - (prey.slow || 0)) * lead);
    [aimX, aimY] = state.samplers[prey.pathIdx].at(future);
  }
  const t = { ...ENEMY_TYPES.drone, hp: Math.max(1, Math.round(es.drone || 70)), bounty: 0, dmg: 0, name: 'STRIKE DRONE', ability: 'One-way strike unit — detonates on the first hostile it intercepts.' };
  const total = Math.max(1, Math.hypot(aimX - tower.x, aimY - tower.y));
  const drone = {
    key: 'drone', t, nid: ++state.nidSeq,
    hp: t.hp, maxHp: t.hp, shield: 0, maxShield: 0,
    pathIdx: prey.pathIdx, dist: 0,
    speed: Math.max(110, t.speed * 1.5), alive: true, friendly: true, reverse: true,
    usedGates: new Set(), angle: 0,
    flight: { sx: tower.x, sy: tower.y, tx: aimX, ty: aimY, total },
    fx: tower.x, fy: tower.y,
  };
  state.enemies.push(drone);
  emit('bloom', tower.x, tower.y, 6);
  return true;
}

export function replicateLeak(enemy) {
  enemy.replicated = true;
  const [x, y] = posOf(enemy);
  emit('ring', x, y, 'fx-ring-amber');
  for (let i = 0; i < 6; i++) {
    const spawn = spawnEnemy('file', enemy.pathIdx);
    spawn.dist = Math.min(state.samplers[enemy.pathIdx].len - 8, Math.max(0, enemy.dist - 18 + i * 7));
  }
  emit('banner', 'MEMORY LEAK', '// REPLICATION — HOSTILES SPILLED', 'banner-red');
}

export function leakEnemy(enemy) {
  enemy.alive = false;
  emit('tipHide', enemy);
  enemy.fate = 'gone';
  const leakDmg = leakDamage(enemy);
  state.baseHp = Math.max(0, state.baseHp - leakDmg);
  emit('coreHit');
  emit('float', ...corePos(), `-${leakDmg} CORE`, 'core-float');
  emit('hud');
  if (enemy.t.boss) emit('boss');
  if (state.baseHp <= 0 && state.mode === 'waves') endSim(false);
}

export function posOf(enemy) {
  if (enemy.flight) return [enemy.fx, enemy.fy];
  return state.samplers[enemy.pathIdx].at(enemy.dist);
}

export function corePos() {
  return [state.map.core.x, state.map.core.y];
}

// Flying units cruise straight from their spawn gate to the core with a light
// sinusoidal weave that fades out near both ends of the flight plan.
export function flightPos(enemy, progress) {
  const f = enemy.flight;
  const t = Math.min(1, Math.max(0, progress / f.total));
  const dx = f.tx - f.sx;
  const dy = f.ty - f.sy;
  const nx = -dy / f.total;
  const ny = dx / f.total;
  const weave = Math.sin(progress * (Math.PI * 2) / 120) * 8 * Math.sin(t * Math.PI);
  return [f.sx + dx * t + nx * weave, f.sy + dy * t + ny * weave];
}

// One fixed-or-variable sim step: no requestAnimationFrame, no clock reads, no view calls. A host can call it with a fixed dt.
export function simStep(dt) {
  state.clock += dt;
  if (state.mode === 'countdown') {
    state.countdown -= dt;
    const n = Math.ceil(state.countdown);
    if (n !== state.lastCount && n > 0) { state.lastCount = n; emit('banner', String(n), '// DEPLOYING', 'banner-count'); emit('sound'); }
    if (state.countdown <= 0) beginWave(env.debugWave > 0 ? Math.min(missionWaves().length - 1, env.debugWave - 1) : 0);
  }
  if (state.mode === 'waves') runWaves(dt);
  tickWaste(dt);
  for (const enemy of state.enemies) if (enemy.alive) moveEnemy(enemy, dt);
  state.enemies = state.enemies.filter((enemy) => enemy.alive);
  updateTowers(dt);
  updateProjectiles(dt);
}

// RAMPAGE UNIT: berserk drive — the lower the hull, the higher the speed.
export function enrageMult(enemy) {
  if (enemy.key !== 'rampager' || !enemy.maxHp) return 1;
  return 1 + 0.85 * (1 - Math.max(0, enemy.hp) / enemy.maxHp);
}

export function empPop(x, y) {
  emit('ring', x, y, 'fx-ring-emp');
  let hit = 0;
  for (const tower of state.towers) {
    if (Math.hypot(tower.x - x, tower.y - y) <= BLOAT_EMP_RADIUS) {
      tower.offlineT = Math.max(tower.offlineT || 0, BLOAT_EMP_SECONDS);
      emit('ring', tower.x, tower.y, 'fx-ring-emp');
      hit += 1;
    }
  }
  if (hit) emit('float', x, y - 20, `EMP POP — ${hit} OFFLINE`, 'emp-float');
}

export function moveEnemy(enemy, dt) {
  if (enemy.friendly) { moveSummon(enemy, dt); return; }
  if (env.debugFreeze || state.mode !== 'waves') return;
  if (enemy.stun > 0) {
    enemy.stun -= dt;
    return;
  }
  if (enemy.tarT) enemy.tarT -= dt; // tar slick linger decays fast
  if (enemy.corrupt && enemy.corrupt.t > 0) {
    // VIRUS CONTAGION: phase burn ticks every frame; kills credit the strain.
    enemy.corrupt.t -= dt;
    damageEnemy(enemy, enemy.corrupt.dps * dt, { phase: true, src: 'virus' });
    if (!enemy.alive) return;
  }
  if (enemy.flight) {
    // Air route: no tracks, no phase gates, no haste zones — cryo slow, frostbite
    // and gravity still bite, otherwise flyers would ignore every control tower.
    enemy.dist = Math.max(0, enemy.dist - (enemy.pull || 0) * dt);
    enemy.dist += enemy.speed * wardenYardMult(enemy) * tarMult(enemy) * (1 - (enemy.slow || 0)) * (1 - (enemy.gravSlow || 0)) * dt;
    if (enemy.dist >= enemy.flight.total) { leakEnemy(enemy); return; }
    const [fx, fy] = flightPos(enemy, enemy.dist);
    const [px, py] = flightPos(enemy, enemy.dist - 8);
    const heading = (Math.atan2(fy - py, fx - px) * 180) / Math.PI;
    enemy.fx = fx;
    enemy.fy = fy;
    enemy.angle = heading;
    return;
  }
  const haste = inHasteZone(enemy.pathIdx, enemy.dist) ? 1.3 : 1;
  enemy.hasted = haste > 1;
  if (enemy.t.boss && enemy.key === 'virus') {
    enemy.pulseTimer -= dt;
    if (enemy.pulseTimer <= 0) { enemy.pulseTimer = 8; emit('ring', ...posOf(enemy), 'fx-ring-virus'); }
  }
  if (enemy.t.regen && enemy.hp < enemy.maxHp) {
    enemy.hp = Math.min(enemy.maxHp, enemy.hp + enemy.maxHp * enemy.t.regen * dt);
  }
  // NULL SPECTRE: phase shroud cycles — cloaked spans drop every targeting lock.
  if (enemy.t.cloak) {
    enemy.cloakT = (enemy.cloakT === undefined ? enemy.t.cloak.every : enemy.cloakT) - dt;
    if (enemy.cloakT <= 0) {
      enemy.cloaked = !enemy.cloaked;
      enemy.cloakT = enemy.cloaked ? enemy.t.cloak.span : enemy.t.cloak.every;
      emit('ring', ...posOf(enemy), 'fx-ring-phantom');
    }
  }
  // DATA LEECH: siphon field — every second, hostiles near the leech knit hull back.
  if (enemy.t.heal) {
    enemy.healT = (enemy.healT === undefined ? enemy.t.heal.every : enemy.healT) - dt;
    if (enemy.healT <= 0) {
      enemy.healT = enemy.t.heal.every;
      let healed = 0;
      for (const other of state.enemies) {
        if (!other.alive || other.friendly || other === enemy || other.hp >= other.maxHp) continue;
        const [ox, oy] = posOf(other);
        if (Math.hypot(ox - enemy.fx, oy - enemy.fy) <= enemy.t.heal.radius) {
          other.hp = Math.min(other.maxHp, other.hp + other.maxHp * enemy.t.heal.pct);
          healed += 1;
        }
      }
      if (healed) { emit('ring', enemy.fx, enemy.fy, 'fx-ring-heal'); emit('float', enemy.fx, enemy.fy - enemy.t.size - 8, `SIPHON +${healed}`, 'heal-float'); }
    }
  }
  if (enemy.t.blink) {
    enemy.blinkTimer = (enemy.blinkTimer === undefined ? enemy.t.blink.every : enemy.blinkTimer) - dt;
    if (enemy.blinkTimer <= 0) {
      enemy.blinkTimer = enemy.t.blink.every;
      emit('ring', ...posOf(enemy), 'fx-ring-phantom');
      enemy.dist += enemy.t.blink.jump;
    }
  }
  if (enemy.t.boss && enemy.key === 'warden' && !enemy.stormed && enemy.hp <= enemy.maxHp * 0.6) {
    enemy.stormed = true;
    const lane = state.samplers[enemy.pathIdx];
    emit('ring', ...posOf(enemy), 'fx-ring-amber');
    for (let i = 0; i < 4; i++) {
      const spawn = spawnEnemy('hexbug', enemy.pathIdx);
      spawn.dist = Math.min(lane.len - 8, Math.max(0, enemy.dist - 18 + i * 9));
    }
    emit('banner', 'FIREWALL WARDEN', '// PACKET STORM — HEX CRAWLERS SPILLED', 'banner-red');
  }
  enemy.dist = Math.max(0, enemy.dist - (enemy.pull || 0) * dt);
  enemy.dist += enemy.speed * haste * enrageMult(enemy) * wardenYardMult(enemy) * tarMult(enemy) * (1 - (enemy.slow || 0)) * (1 - (enemy.gravSlow || 0)) * dt;
  const sampler = state.samplers[enemy.pathIdx];
  for (const event of state.gateEvents) {
    if (enemy.usedGates.has(event.index)) continue;
    if (event.from.pathIdx === enemy.pathIdx && enemy.dist >= event.from.dist) {
      const [gx, gy] = [event.gate.x, event.gate.y];
      emit('ring', gx, gy, 'fx-ring-gate');
      enemy.pathIdx = event.to.pathIdx;
      enemy.dist = event.to.dist + 2;
      enemy.usedGates.add(event.index);
      emit('ring', event.gate.toX, event.gate.toY, 'fx-ring-gate');
      emit('sound', 'hover');
      return moveEnemy(enemy, 0);
    }
  }
  if (enemy.dist >= sampler.len) { leakEnemy(enemy); return; }
  const [x, y] = sampler.at(enemy.dist);
  const [px, py] = sampler.at(Math.max(0, enemy.dist - 6));
  const angle = (Math.atan2(y - py, x - px) * 180) / Math.PI;
  if (Math.abs(angle - enemy.angle) > 1) enemy.angle = angle;
}

export function runWaves(dt) {
  if (state.queue.length) {
    state.spawnGap -= dt;
    if (state.spawnGap <= 0) {
      const key = state.queue.shift();
      const enemy = spawnEnemy(key, state.spawnSide++ % state.samplers.length);
      state.spawnGap = SPAWN_GAP[key] || 0.8;
    }
  } else if (!state.enemies.some((enemy) => enemy.alive && !enemy.friendly) && state.intermission <= 0) {
    // Income pass: cleared waves pay build money. Rates trimmed — the upgrade
    // ladder is the real salvage sink now, maxing a chassis must hurt.
    // Zero Day rigs skim their wave yield on top.
    let rigYield = 0;
    for (const tower of state.towers) {
      if (tower.id !== 'zeroday') continue;
      const income = effStats(tower).income || 0;
      if (!income) continue;
      rigYield += income;
      emit('float', tower.x, tower.y - 40, `+$${income} RIG`, 'cash-float');
    }
    // WAR BONDS: the war chest compounds — interest rolls INTO the bond itself
    // (it never touches the wallet until the commander withdraws).
    for (const tower of state.towers) {
      if (tower.id !== 'warbonds') continue;
      const es = effStats(tower);
      if (!es.bond || !(tower.bank > 0)) continue;
      const cap = es.bondCap || 3000;
      const interest = Math.min(Math.max(0, cap - tower.bank), Math.round(tower.bank * es.bond));
      if (interest <= 0) continue;
      tower.bank += interest;
      emit('float', tower.x, tower.y - 40, `+$${interest} BOND`, 'cash-float');
      emit('panelLive', tower);
    }
    const hardMult = state.protocol === 'hard' ? 0.85 : state.protocol === 'insane' ? 0.7 : state.protocol === 'crimson' ? 0.7 : 1; // HELL PAYS WORSE — salvage is blood in HARD, the DOUBLED SPIRAL pays 70%, and the dawn bleeds you for 70%
    const bonus = Math.round((30 + (state.waveIndex + 1) * 7) * hardMult) + rigYield;
    state.cash += bonus;
    state.earned += bonus;
    const cleared = state.waveIndex + 1;
    if (env.perks.has('fieldrep') && state.baseHp < BASE_MAX) {
      state.baseHp = Math.min(BASE_MAX, state.baseHp + 2);
      emit('float', ...corePos(), '+2 FIELD REPAIRS', 'repair-float');
    }
    if (cleared >= missionWaves().length) { endSim(true); return; }
    emit('banner', `WAVE ${cleared} CLEARED`, rigYield ? `// +$${bonus} SALVAGE · RIG YIELD $${rigYield}` : `// +$${bonus} SALVAGE`, 'banner-green');
    emit('sound');
    state.intermission = state.protocol === 'crimson' ? 3 : state.protocol === 'insane' ? 2.5 : state.protocol === 'hard' ? 4.5 : 7; // HARD: 4.5s to rebuild — the swarm never waits. DOUBLED INSANE: 2.5s. CRIMSON: 3s
    emit('hud');
  }
  if (state.intermission > 0) {
    state.intermission -= dt;
    if (state.intermission <= 0) beginWave(state.waveIndex + 1);
  }
}

export function beginWave(index) {
  state.mode = 'waves';
  state.waveIndex = index;
  const waves = missionWaves();
  const wave = waves[index];
  const growth = MODE_HP_GROWTH[state.protocol] || 0;
  state.hpScale = growth
    ? Math.pow(1 + growth, index) // HARD: compounding hull curve — every wave prices in the last
    : 1 + (MODE_HP_SCALE[state.protocol] || WAVE_HP_SCALE) * index;
  state.bossHpMult = state.protocol === 'easy' ? EASY_BOSS_RELIEF : 1;
  const surge = wave.mod ? SURGE_MODS[wave.mod] : null;
  state.surgeSpeed = surge ? surge.speed : 1;
  state.surgeMod = wave.mod || null; // crimson visuals: surge waves burn brighter
  if (surge && surge.hp !== 1) state.hpScale *= surge.hp;
  const queue = [];
  const bosses = [];
  for (const [key, count] of wave.groups) {
    for (let i = 0; i < count; i++) (ENEMY_TYPES[key].boss ? bosses : queue).push(key);
  }
  const at = Math.floor(queue.length * 0.45);
  bosses.forEach((key, i) => queue.splice(at + i, 0, key));
  state.queue = queue;
  state.spawnGap = 0;
  state.spawnSide = 0;
  emit('banner', `WAVE ${String(index + 1).padStart(2, '0')} / ${waves.length}`, surge ? `// ${surge.label} — ${surge.note}` : wave.phase ? `// ${wave.phase}` : '// HOSTILES INBOUND', 'banner-wave');
  emit('hud');
}

// Radioactive aftermath: fallout pools burn everything inside them — hostiles
// and risen corpses alike — until the fallout decays.
export function tickWaste(dt) {
  if (!state.wasteZones.length || state.mode !== 'waves') return;
  for (const zone of state.wasteZones) {
    if (state.clock >= zone.until) {
      emit('wasteOff', zone);
      zone.dead = true;
      continue;
    }
    for (const enemy of state.enemies) {
      if (!enemy.alive) continue;
      const [px, py] = posOf(enemy);
      if (Math.hypot(px - zone.x, py - zone.y) <= zone.r) damageEnemy(enemy, WASTE_DPS * dt, { src: 'waste', friendlyFire: true });
    }
  }
  state.wasteZones = state.wasteZones.filter((zone) => !zone.dead);
}

// --- Nuclear Fall Out: aimed tactical strike ---------------------------------------
export function readyRig() {
  return state.towers.find((tower) => tower.id === 'zeroday' && trackLevel(tower) >= 6) || null;
}

export function fireNuke(x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  const rig = readyRig();
  if (!rig || (rig.nukeCd || 0) > 0) { emit('nukeAim', false); return; }
  if (state.cash < NUKE_COST) { emit('sound', 'alarm'); emit('toast', `Need $${NUKE_COST} salvage to call the nuke.`); emit('nukeAim', false); return; }
  state.cash -= NUKE_COST;
  rig.nukeCd = NUKE_COOLDOWN;
  emit('nukeAim', false);
  // Strike: flat devastation inside the blast ring, then lingering fallout.
  for (const enemy of state.enemies) {
    if (!enemy.alive) continue;
    const [px, py] = posOf(enemy);
    if (Math.hypot(px - x, py - y) <= NUKE_RADIUS) damageEnemy(enemy, NUKE_DAMAGE, { src: 'nuke', friendlyFire: true });
  }
  const zone = { x, y, r: WASTE_RADIUS, until: state.clock + WASTE_SECONDS };
  state.wasteZones.push(zone);
  emit('wasteOn', zone);
  emit('nuke', x, y);
  emit('float', x, y - NUKE_RADIUS - 20, 'NUCLEAR FALL OUT', 'core-float');
  emit('sound', 'alarm');
  emit('hud');
}

// --- Corpse Blossom abilities --------------------------------------------------------
export function bloodPurge(tower) {
  if (trackLevel(tower) < 4) return;
  const lust = tower.lust || 0;
  if (lust <= 0) { emit('sound', 'alarm'); emit('toast', 'Blood Lust bar is empty — kills feed it.'); return; }
  const rng = effStats(tower).rng;
  let hits = 0;
  for (const enemy of state.enemies) {
    if (!enemy.alive || enemy.friendly) continue;
    const [px, py] = posOf(enemy);
    if (Math.hypot(px - tower.x, py - tower.y) <= rng) { damageEnemy(enemy, lust, { src: 'purge' }); hits += 1; }
  }
  tower.lust = 0;
  emit('purge', tower);
  emit('float', tower.x, tower.y - 52, `BLOOD PURGE — ${lust} DMG`, 'lust-float');
  emit('sound');
  emit('panel', tower);
  emit('hud');
}

export function bloodScream(tower) {
  if (trackLevel(tower) < 5) return;
  if ((tower.screamCd || 0) > 0) return;
  let buffed = 0;
  for (const summon of state.enemies) {
    if (!summon.alive || !summon.friendly || summon.screamed) continue;
    summon.maxHp *= 2;
    summon.hp *= 2;
    summon.speed *= 2.5;
    summon.screamed = true;
    buffed += 1;
  }
  tower.screamCd = 200;
  emit('scream', tower, buffed);
  emit('banner', 'BLOOD SCREAM', buffed ? `// ${buffed} SUMMONS ENRAGED — 2x HP · +150% SPEED` : '// NO SUMMONS ON THE FIELD', 'banner-red');
  emit('sound');
  emit('panel', tower);
}

export function buildingAllowed() {
  return state.mode === 'countdown' || state.mode === 'waves';
}

// --- Placement engine: anywhere on the grid, clearance boxes enforce spacing -----------
export function canPlace(x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < FOOT_HALF || x > 1000 - FOOT_HALF || y < FOOT_HALF || y > 600 - FOOT_HALF) return { ok: false, reason: 'OUT OF BOUNDS' };
  if (Math.hypot(x - state.map.core.x, y - state.map.core.y) < CORE_CLEAR) return { ok: false, reason: 'KEEP CLEAR OF THE CORE' };
  // The convoy lane is hostile territory — no building on or across the track.
  for (const [tx, ty] of state.trackPts) {
    const dx = tx - x;
    const dy = ty - y;
    if (dx * dx + dy * dy < TRACK_CLEAR * TRACK_CLEAR) return { ok: false, reason: 'KEEP OFF THE TRACK' };
  }
  for (const tower of state.towers) {
    if (Math.abs(tower.x - x) < SEP && Math.abs(tower.y - y) < SEP) return { ok: false, reason: 'TOO CLOSE — CLEARANCE BOX' };
  }
  return { ok: true, reason: '' };
}

// Hex AA pads: a unit deployed on one of the map's hexagon pads gains anti-air
// targeting, even if its chassis is ground-only (Sentinel, Plasma Mortar, ...).
export function padAt(x, y) {
  return ((state.map && state.map.pads) || []).find(([px, py]) => Math.hypot(px - x, py - y) <= PAD_SNAP) || null;
}

export function placeTower(entry, x, y) {
  if (!buildingAllowed()) return false;
  if (state.towers.length >= towerLimit()) { emit('sound', 'alarm'); emit('toast', `Command grid saturated — ${towerLimit()} units max.`); return false; }
  if (limitReached(entry)) {
    emit('sound', 'alarm');
    emit('toast', limitToast(entry));
    return false;
  }
  if (state.cash < entry.cost) { emit('sound', 'alarm'); emit('toast', `Need $${entry.cost} salvage to deploy ${entry.name}.`); return false; }
  state.cash -= entry.cost;
  const tower = { uid: ++state.tidSeq, id: entry.id, entry, x, y, cd: 0.35, boost: 1, lvl: 0 };
  if (entry.id === 'corpseblossom') { tower.veinCd = 0.6; tower.lust = 0; tower.screamCd = 0; }
  if (entry.id === 'gravewarden') { tower.bellCd = 2.5; tower.tollCharges = 0; tower.soulCd = 0; }
  if (entry.id === 'zeroday') tower.nukeCd = 0;
  if (entry.id === 'relay') tower.rallyCd = 0;
  if (entry.id === 'veteran') { tower.gun = 0; tower.heat = 0; tower.heatNid = null; }
  if (entry.id === 'warbonds') tower.bank = 0;
  if (entry.id === 'wardrums') tower.lobCd = 4;
  if (entry.id === 'deathwarrant') { tower.warrantCd = 6; tower.charge = null; }
  const pad = padAt(x, y);
  if (pad) {
    tower.onPad = true;
    tower.pad = pad;
    emit('float', x, y - 46, 'AA PAD LINKED', 'aa-float');
  }
  state.towers.push(tower);
  emit('towerAdd', tower);
  emit('float', x, y - 34, `-$${entry.cost}`, 'cash-float');
  emit('sound');
  emit('hud');
  return true;
}

// --- Upgrade ladder: one linear track per chassis, bought with salvage -------------
// Tiers come from the blueprint catalog (entry.track). Every tier's `sets` are
// absolute stat values applied on install; levels live on the placed unit only —
// scrapped when it is sold, wiped when the mission ends.
export function trackLevel(tower) {
  return tower.lvl || 0;
}

export function towerTrack(tower) {
  return tower.entry.track || [];
}

export function effStats(tower) {
  // Spread the whole base stats object — special chassis carry custom keys
  // (income / veins / summonHp / lust / bounty) that upgrade tiers overwrite.
  const stats = { ...tower.entry.stats };
  for (let i = 0; i < trackLevel(tower); i++) {
    const tier = towerTrack(tower)[i];
    if (tier && tier.sets) Object.assign(stats, tier.sets);
  }
  // THE VETERAN: the active gun multiplies the chassis — every ladder tier
  // benefits all three weapons, and the panel/aim/fire paths all read the merge.
  if (tower.id === 'veteran') {
    const gun = VETERAN_GUNS[tower.gun || 0] || VETERAN_GUNS[0];
    stats.dmg = Math.round(stats.dmg * gun.dmg);
    stats.rate = Math.round(stats.rate * gun.rate * 100) / 100;
    stats.rng = Math.round(stats.rng * gun.rng);
    if (gun.splash) stats.splash = gun.splash;
    if (gun.targeting) stats.targeting = gun.targeting;
    if (gun.air) stats.air = gun.air;
    stats.armorPierce = Boolean(gun.armorPierce);
    stats.bossMult = gun.bossMult || 1;
    stats.gunName = gun.name;
  }
  return { ...stats, infinite: tower.entry.stats.rng >= 999 };
}

export function trackInvested(tower) {
  return tower.entry.cost + towerTrack(tower).slice(0, trackLevel(tower)).reduce((sum, tier) => sum + tier.cost, 0);
}

// --- Command Relay: the network pylon buffs every tower inside its ring ------------
// kind 'dmg' multiplies fire damage, 'rate' multiplies fire rate, 'range'
// multiplies acquisition + painted reach. The relay itself never fires.
export function relayMult(tower, kind) {
  let mult = 1;
  for (const other of state.towers) {
    if (other.id !== 'relay' || other === tower) continue;
    const es = effStats(other);
    const buff = kind === 'dmg' ? es.dmgBuff : kind === 'rate' ? es.rateBuff : es.rangeBuff;
    if (!buff) continue;
    if (Math.hypot(tower.x - other.x, tower.y - other.y) <= es.rng) mult += buff;
  }
  return mult;
}

// RALLY CRY: the relay floods its ring with overdrive — +50% fire rate for 6s.
export function castRally(tower) {
  if (trackLevel(tower) < 5) return;
  const es = effStats(tower);
  if ((tower.rallyCd || 0) > 0) { emit('sound', 'alarm'); emit('toast', `Rally recharging — ${Math.ceil(tower.rallyCd)}s left.`); return; }
  const cost = es.rallyCost || 600;
  if (state.cash < cost) { emit('sound', 'alarm'); emit('toast', `Need $${cost} salvage for RALLY CRY.`); return; }
  state.cash -= cost;
  tower.rallyCd = es.rallyCd || 45;
  let boosted = 0;
  for (const other of state.towers) {
    if (other === tower) continue;
    if (Math.hypot(other.x - tower.x, other.y - tower.y) <= es.rng) { other.rallyT = 6; boosted += 1; emit('ring', other.x, other.y, 'fx-ring-amber'); }
  }
  emit('float', tower.x, tower.y - 46, `RALLY CRY — ${boosted} BOOSTED`, 'lust-float');
  emit('ring', tower.x, tower.y, 'fx-ring-amber');
  emit('sound');
  emit('panel', tower);
  emit('hud');
}

// --- Grave Warden Tier 6: the SOUL CHOIR -------------------------------------------
// The Warden reaches into the core and raises a vengeful soul on the lane of
// the most advanced hostile. Like a Blossom risen it marches the track and
// detonates on the first hostile it touches — but its hull is forged from the
// yard itself: 10 x TOLL CHARGES (min 75). $700 a soul, 35s between hymns.
export function launchWardenSoul(tower) {
  if (state.enemies.filter((item) => item.friendly && item.alive).length >= SUMMON_CAP) return false;
  const pool = state.enemies.filter((enemy) => enemy.alive && !enemy.friendly);
  if (!pool.length) return false;
  const prey = pool.reduce((best, enemy) => (enemy.dist > best.dist ? enemy : best));
  const hull = Math.max(60, 10 * (tower.tollCharges || 0));
  const t = { name: 'VENGEFUL SOUL', tag: 'SUMMON', hp: hull, speed: 55, size: 12, bounty: 0, dmg: 0, color: '#bff1e2', ability: 'The Warden\u2019s choir — detonates on the first hostile it touches for damage equal to its hull. Hull = 10 x TOLL CHARGES.' };
  const lane = state.samplers[prey.pathIdx];
  const soul = {
    key: 'soul', t, nid: ++state.nidSeq,
    hp: hull, maxHp: hull, shield: 0, maxShield: 0,
    pathIdx: prey.pathIdx, dist: Math.max(0, lane.len - 4),
    speed: t.speed, alive: true, friendly: true, reverse: true,
    usedGates: new Set(), angle: 0,
  };
  const [sx, sy] = lane.at(soul.dist);
  soul.fx = sx;
  soul.fy = sy;
  state.enemies.push(soul);
  emit('bloom', sx, sy, 8);
  emit('ring', sx, sy, 'fx-ring-crimson');
  emit('float', sx, sy - 24, 'A SOUL RISES FROM THE CORE', 'summon-float');
  return true;
}

export function castSoul(tower) {
  if (trackLevel(tower) < 6) return;
  const es = effStats(tower);
  if ((tower.soulCd || 0) > 0) { emit('sound', 'alarm'); emit('toast', `The choir rests — ${Math.ceil(tower.soulCd)}s until the next hymn.`); return; }
  const cost = es.soulCost || 900;
  if (state.cash < cost) { emit('sound', 'alarm'); emit('toast', `Need $${cost} salvage to raise a soul from the core.`); return; }
  if (!state.enemies.some((enemy) => enemy.alive && !enemy.friendly)) { emit('sound', 'alarm'); emit('toast', 'The choir needs an audience — no hostiles on the grid.'); return; }
  state.cash -= cost;
  tower.soulCd = es.soulCd || 45;
  launchWardenSoul(tower);
  emit('sound');
  emit('panel', tower);
  emit('hud');
}

// --- PARAGON: the golden standard taxes every kill in its ring --------------------
export function paragonTithe(x, y) {
  let mult = 1;
  for (const tower of state.towers) {
    if (tower.id !== 'paragon') continue;
    const es = effStats(tower);
    if (!es.tithe) continue;
    if (Math.hypot(x - tower.x, y - tower.y) <= es.rng) mult += es.tithe;
  }
  return mult;
}

// Tar Sprayer slick: walkers drag through the tar field — flyers skim over it.
// The sprayer re-inks the tar every upkeep tick; the linger decays fast after.
export function tarMult(enemy) {
  if (enemy.t.flying || !enemy.tarT || enemy.tarT <= 0) return 1;
  return 1 - (enemy.tar || 0);
}

export function buyTrack(tower) {
  if (state.mode !== 'waves' && state.mode !== 'countdown') return;
  if (env.guestIntent('up', tower)) return;
  if (!state.towers.includes(tower)) return; // stale intent: the tower was already sold
  const tiers = towerTrack(tower);
  const lvl = trackLevel(tower);
  if (lvl >= tiers.length) return;
  const tier = tiers[lvl];
  if (state.cash < tier.cost) { emit('sound', 'alarm'); emit('toast', `Need $${tier.cost} salvage for ${tier.label}.`); return; }
  state.cash -= tier.cost;
  tower.lvl = lvl + 1;
  if (tower.id === 'zeroday' && tower.lvl >= 6) { emit('toast', 'NUCLEAR FALL OUT ARMED — the rig can call the strike.'); emit('sound', 'alarm'); }
  emit('range', tower);
  emit('float', tower.x, tower.y - 42, `${tier.label} ONLINE`, 'up-float');
  emit('ring', tower.x, tower.y, 'fx-ring-white');
  emit('sound');
  emit('hud');
  emit('panel', tower); // re-render the panel with the new tier installed
}

export function sellTower(tower) {
  if (env.guestIntent('sell', tower)) return;
  if (!state.towers.includes(tower)) return; // stale intent: a second sell would pay twice
  const refund = Math.floor(trackInvested(tower) * 0.7) + Math.round(tower.bank || 0); // War Bonds: the ledger comes back whole
  state.cash += refund;
  emit('towerDrop', tower);
  state.towers = state.towers.filter((item) => item !== tower);
  const [x, y] = [tower.x, tower.y];
  emit('panelClose');
  emit('float', x, y - 20, `+$${refund} SALVAGED`, 'cash-float');
  emit('ring', x, y, 'fx-ring-amber');
  emit('sound');
  emit('hud');
}

// --- Tower combat brain ------------------------------------------------------------------
export function updateTowers(dt) {
  if (!state.towers.length) { emit('nukeBtn'); return; }
  // Rally clock: RALLY CRY keeps the ring's fire rate flooded for its duration.
  for (const tower of state.towers) {
    tower.rallyT = Math.max(0, (tower.rallyT || 0) - dt);
    tower.boost = tower.rallyT > 0 ? 1.5 : 1;
  }
  // Special chassis upkeep: Blossom curse pulses + ability cooldowns, rig nuke clock.
  // Bloat EMP clock: offline towers drag back online as the timer drains.
  for (const tower of state.towers) {
    tower.offlineT = Math.max(0, (tower.offlineT || 0) - dt);
  }
  for (const tower of state.towers) {
    if (tower.id === 'corpseblossom') {
      tower.screamCd = Math.max(0, (tower.screamCd || 0) - dt);
      const es = effStats(tower);
      if (es.veins) {
        tower.veinCd -= dt;
        if (tower.veinCd <= 0) {
          const [lo, hi] = es.veinRate || [0.1, 1];
          tower.veinCd = lo + rand() * (hi - lo);
          const pool = state.enemies.filter((enemy) => {
            if (!enemy.alive || enemy.friendly) return false;
            const [px, py] = posOf(enemy);
            return Math.hypot(px - tower.x, py - tower.y) <= es.rng;
          });
          if (pool.length) {
            const target = pool[Math.floor(rand() * pool.length)];
            const [tx, ty] = posOf(target);
            emit('burst', tx, ty);
            emit('ring', tx, ty, 'fx-ring-virus');
            for (const enemy of pool) {
              const [px, py] = posOf(enemy);
              if (Math.hypot(px - tx, py - ty) <= 55) damageEnemy(enemy, es.veins, { src: 'veins' });
            }
          }
        }
      }
    }
    if (tower.id === 'dronespawner') {
      // Strike-drone fabrication clock: only launches while hostiles stand in the ring.
      tower.droneCd = Math.max(0, (tower.droneCd || 0) - dt);
      if (tower.droneCd <= 0 && launchStrikeDrone(tower)) {
        tower.droneCd = effStats(tower).launchEvery || 6;
        emit('panelLive', tower); // live launch countdown
      }
    }
    if (tower.id === 'gravewarden') {
      // DEATH TOLL: the bell rings on cadence — everything hostile in the yard
      // takes the pulse, chaff eats a stun, and every yard kill rings it sooner.
      tower.bellCd = Math.max(0, (tower.bellCd || 0) - dt);
      tower.soulCd = Math.max(0, (tower.soulCd || 0) - dt);
      const es = effStats(tower);
      if (es.bell && tower.bellCd <= 0) {
        tower.bellCd = es.bellEvery || 8;
        let toll = 0;
        for (const enemy of state.enemies) {
          if (!enemy.alive || enemy.friendly) continue;
          const [px, py] = posOf(enemy);
          if (Math.hypot(px - tower.x, py - tower.y) <= es.rng) {
            damageEnemy(enemy, es.bell, { src: 'toll' });
            if (enemy.alive && !enemy.t.boss) enemy.stun = Math.max(enemy.stun || 0, es.tollStun || 0.8);
            toll += 1;
          }
        }
        if (toll) {
          emit('ring', tower.x, tower.y, 'fx-ring-crimson');
          emit('float', tower.x, tower.y - 46, `DEATH TOLL — ${toll} CAUGHT`, 'lust-float');
          emit('sound');
        }
      }
    }
    if (tower.id === 'zeroday') tower.nukeCd = Math.max(0, (tower.nukeCd || 0) - dt);
    if (tower.id === 'relay') tower.rallyCd = Math.max(0, (tower.rallyCd || 0) - dt);
    if (tower.id === 'wardrums') {
      // WAR CHOIR: the drum lobs its own frag shell on a 4s cadence (tier 5).
      tower.lobCd = Math.max(0, (tower.lobCd || 0) - dt);
      const es = effStats(tower);
      if (es.lob && tower.lobCd <= 0) {
        const pool = state.enemies.filter((enemy) => {
          if (!enemy.alive || enemy.friendly) return false;
          const [px, py] = posOf(enemy);
          return Math.hypot(px - tower.x, py - tower.y) <= es.rng;
        });
        if (pool.length) {
          tower.lobCd = 4;
          const prey = pool.reduce((best, enemy) => (enemy.dist > best.dist ? enemy : best));
          const [lx, ly] = posOf(prey);
          addProjectile({ kind: 'shell', x: tower.x, y: tower.y, tx: lx, ty: ly, speed: 240, dmg: es.lobDmg || 140, splash: es.lobSplash || 50 });
          emit('ring', tower.x, tower.y, 'fx-ring-amber');
        }
      }
    }
    if (tower.id === 'deathwarrant') {
      // THE DEATHWARRANT: one verdict at a time. Locks the beefiest hull in
      // reach, charges 10-12s under a growing ring + lock reticle, then erases
      // it — flat payload + a fraction of the target's max hull, phase damage.
      tower.warrantCd = Math.max(0, (tower.warrantCd || 0) - dt);
      const es = effStats(tower);
      if (tower.charge) {
        const target = state.enemies.find((enemy) => enemy.alive && !enemy.friendly && enemy.nid === tower.charge.nid);
        if (target) {
          const [px, py] = posOf(target);
          tower.charge.x = px;
          tower.charge.y = py;
        }
        tower.charge.t -= dt;
        if (!target) {
          // The sentenced hull died mid-charge — the verdict transfers to the
          // next beefiest hull in reach, or holds fully wound until one shows.
          const next = acquireWarrantTarget(tower, es);
          if (next) tower.charge.nid = next.nid;
        } else if (tower.charge.t <= 0) {
          fireWarrant(tower, target, es);
        }
      } else if (tower.warrantCd <= 0) {
        const target = acquireWarrantTarget(tower, es);
        if (target) beginWarrantCharge(tower, target, es);
      }
    }
    if (tower.id === 'tarsprayer') {
      // TAR SPRAYER: re-inks the slick every tick — walkers inside drag, flyers skim.
      const es = effStats(tower);
      if (es.slow) {
        for (const enemy of state.enemies) {
          if (!enemy.alive || enemy.friendly || enemy.t.flying) continue;
          const [px, py] = posOf(enemy);
          if (Math.hypot(px - tower.x, py - tower.y) <= es.rng) { enemy.tar = es.slow; enemy.tarT = 0.4; }
        }
      }
    }
  }
  emit('nukeBtn');
  // Fire control.
  const overclockMult = env.perks.has('overclock') ? 1.05 : 1;
  for (const tower of state.towers) {
    if (tower.offlineT > 0) continue; // Bloatware EMP — the gun is down
    const rate = effStats(tower).rate * tower.boost * overclockMult * relayMult(tower, 'rate');
    if (rate <= 0) continue;
    tower.cd -= dt;
    if (tower.cd > 0) continue;
    const target = acquireTarget(tower);
    if (!target) { tower.cd = 0; continue; }
    aimHead(tower, target);
    fireTower(tower, target);
    tower.cd = 1 / rate;
  }
}

export function acquireTarget(tower) {
  const es = effStats(tower);
  // Installed tiers can rewrite chassis rules — Satellite Comms grants the
  // Shotgunner anti-air coverage without an AA pad link.
  const rule = { ...(TOWER_RULES[tower.id] || {}) };
  if (es.air) rule.air = es.air;
  // COMMAND RELAY: TARGET UPLINK widens every gun's acquisition ring.
  const rng = es.infinite ? 9999 : Math.round(es.rng * relayMult(tower, 'range'));
  // Stickiness: pad AA guns ride their target until it dies or escapes the ring —
  // re-picking fresher flyers leaves every drone one burst short of dying.
  if (tower.onPad && tower.target && tower.target.alive && tower.target.t.flying && !tower.target.cloaked) {
    const [sx, sy] = posOf(tower.target);
    if (Math.hypot(sx - tower.x, sy - tower.y) <= rng) return tower.target;
  }
  let pool = state.enemies.filter((enemy) => {
    if (!enemy.alive) return false;
    if (rule.air === 'only' && !enemy.t.flying) return false; // flak post: the ground war is beneath it
    if (enemy.friendly) return false; // Blossom risen + strike drones are OURS — guns never track friendlies
    if (enemy.cloaked) return false; // NULL SPECTRE phase shroud — no gun holds a lock on a cloaked hull
    if (rule.air === 'no' && enemy.t.flying && !tower.onPad) return false;
    const [ex, ey] = posOf(enemy);
    return rng > 900 || Math.hypot(ex - tower.x, ey - tower.y) <= rng;
  });
  if (!pool.length) {
    tower.target = null;
    return null;
  }
  // Sniper Headset rewrites acquisition entirely: only the beefiest hostile in
  // reach is worth a trigger pull — bosses and tanks over track fodder.
  if (es.targeting === 'maxhp') {
    tower.target = pool.reduce((best, enemy) => (enemy.hp > best.hp ? enemy : best));
    return tower.target;
  }
  // Ground-only units linked to an AA pad are the only anti-air there — they
  // prioritize flyers, or drones sail past while track-walkers soak every shot.
  // Pad guns lead the NEAREST flyer: it has the longest flight time left inside
  // the range ring, so the burst actually finishes before the drone exits.
  if (rule.air === 'no' && tower.onPad) {
    const flying = pool.filter((enemy) => enemy.t.flying);
    if (flying.length) {
      tower.target = flying.reduce((best, enemy) => (enemy.dist < best.dist ? enemy : best));
      return tower.target;
    }
  }
  if (rule.air === 'prefer') {
    const flying = pool.filter((enemy) => enemy.t.flying);
    if (flying.length) pool = flying;
  }
  // Priority: the hostile furthest along the track (closest to the core).
  tower.target = pool.reduce((best, enemy) => (enemy.dist > best.dist ? enemy : best));
  return tower.target;
}

export function aimHead(tower, target) {
  const [ex, ey] = posOf(target);
  const angle = (Math.atan2(ey - tower.y, ex - tower.x) * 180) / Math.PI;
  tower.aim = angle;
}

// --- WAR DRUMS aura: FRAG ROUNDS ----------------------------------------------------
// Every gun standing inside a drum ring splashes a fraction of its damage
// around the hull it just hit. Single-target chassis call fragBurst after
// their main hit; guns that already splash have nothing to gain and skip it.
export function fragBurst(tower, target, dealt) {
  if (!target || !target.alive) return;
  let frag = 0;
  let radius = 35;
  for (const drum of state.towers) {
    if (drum.id !== 'wardrums' || drum === tower) continue;
    const es = effStats(drum);
    if (!es.frag) continue;
    if (Math.hypot(tower.x - drum.x, tower.y - drum.y) <= es.rng) {
      frag = Math.max(frag, es.frag);
      radius = Math.max(radius, es.fragRadius || 35);
    }
  }
  if (!frag) return;
  const [tx, ty] = posOf(target);
  let hit = 0;
  for (const enemy of state.enemies) {
    if (!enemy.alive || enemy === target || enemy.friendly) continue;
    const [px, py] = posOf(enemy);
    if (Math.hypot(px - tx, py - ty) <= radius) { damageEnemy(enemy, Math.max(1, Math.round(dealt * frag)), { src: 'frag' }); hit += 1; }
  }
  if (hit) emit('ring', tx, ty, 'fx-ring-amber');
}

// --- DEATHWARRANT: the apex verdict --------------------------------------------------
export function acquireWarrantTarget(tower, es) {
  const rng = es.rng || 460;
  const pool = state.enemies.filter((enemy) => {
    if (!enemy.alive || enemy.friendly || enemy.cloaked) return false;
    const [px, py] = posOf(enemy);
    return Math.hypot(px - tower.x, py - tower.y) <= rng;
  });
  if (!pool.length) return null;
  return pool.reduce((best, enemy) => (enemy.maxHp > best.maxHp ? enemy : best));
}

export function beginWarrantCharge(tower, target, es) {
  const [px, py] = posOf(target);
  tower.charge = { nid: target.nid, x: px, y: py, t: es.warrantCd || 12, total: es.warrantCd || 12 };
  emit('float', tower.x, tower.y - 52, 'VERDICT LOCKED', 'core-float');
  emit('sound', 'alarm');
}

export function dropWarrantCharge(tower) {
  tower.charge = null;
}

export function fireWarrant(tower, target, es) {
  dropWarrantCharge(tower);
  const payload = Math.round(es.dmg + target.maxHp * (es.warrantPct || 0.25));
  const [tx, ty] = posOf(target);
  damageEnemy(target, payload, { phase: true, src: 'warrant' });
  fireLine(tower, target, 'fx-warrant', 7.5);
  fireLine(tower, target, 'fx-warrant-core', 2.6);
  emit('ring', tx, ty, 'fx-ring-white');
  emit('ring', tx, ty, 'fx-ring-crimson');
  emit('float', tx, ty - target.t.size - 12, `ANNIHILATED −${payload}`, 'core-float');
  tower.warrantCd = es.warrantCd || 12;
  if (es.echo && !target.alive) {
    // DEATH ECHO — the kill detonates: everything near the corpse eats a
    // fraction of what the sentenced hull carried.
    for (const enemy of state.enemies) {
      if (!enemy.alive || enemy.friendly) continue;
      const [px, py] = posOf(enemy);
      if (Math.hypot(px - tx, py - ty) <= 90) damageEnemy(enemy, Math.round(target.maxHp * 0.2), { phase: true, src: 'echo' });
    }
    emit('ring', tx, ty, 'fx-ring-amber');
  }
  emit('sound');
}

// --- THE VETERAN: instant free gun switch -------------------------------------------
export function switchGun(tower) {
  tower.gun = ((tower.gun || 0) + 1) % VETERAN_GUNS.length;
  tower.heat = 0;
  tower.heatNid = null;
  emit('range', tower);
  emit('ring', tower.x, tower.y, 'fx-ring-white');
  emit('float', tower.x, tower.y - 44, `${effStats(tower).gunName || 'BATTLE RIFLE'} UP`, 'up-float');
  emit('sound');
  emit('panel', tower);
}

// --- WAR BONDS: deposit + withdraw ----------------------------------------------------
export function bondDeposit(tower) {
  const es = effStats(tower);
  const cap = es.bondCap || 3000;
  if ((tower.bank || 0) >= cap) { emit('sound', 'alarm'); emit('toast', `The bond is full — $${formatCash(cap)} cap. Withdraw or upgrade the ledger.`); return; }
  if (state.cash < 500) { emit('sound', 'alarm'); emit('toast', 'Need $500 salvage to feed the bond.'); return; }
  const amount = Math.min(500, cap - (tower.bank || 0));
  state.cash -= amount;
  tower.bank = (tower.bank || 0) + amount;
  emit('float', tower.x, tower.y - 44, `+$${amount} BONDED`, 'cash-float');
  emit('sound');
  emit('hud');
  emit('panel', tower);
}

export function bondWithdraw(tower) {
  const amount = Math.round(tower.bank || 0);
  if (amount <= 0) return;
  tower.bank = 0;
  state.cash += amount;
  emit('float', tower.x, tower.y - 44, `+$${amount} WITHDRAWN`, 'cash-float');
  emit('ring', tower.x, tower.y, 'fx-ring-amber');
  emit('sound');
  emit('hud');
  emit('panel', tower);
}

export function formatCash(value) {
  return Number(value || 0).toLocaleString('en-US');
}

export function fireLine(tower, target, cls, width = 2) {
  const [ex, ey] = posOf(target);
  emit('line', tower.x, tower.y, ex, ey, `fx-line ${cls}`, width, 300);
  return [ex, ey];
}

export function fireTower(tower, target) {
  let dmg = effStats(tower).dmg;
  // COMMAND RELAY: POWER GRID — towers inside the ring hit harder.
  dmg *= relayMult(tower, 'dmg');
  const [tx, ty] = posOf(target);
  // Pads overcharge linked units against flying hostiles.
  if (tower.onPad && target.t.flying) dmg *= PAD_AIR_BOOST;
  switch (tower.id) {
    case 'sentinel': {
      damageEnemy(target, dmg);
      fireLine(tower, target, 'fx-tracer');
      fragBurst(tower, target, dmg);
      break;
    }
    case 'lazermortar': {
      addProjectile({ kind: 'shell', x: tower.x, y: tower.y, tx, ty, speed: 260, dmg, splash: effStats(tower).splash || 30 });
      break;
    }
    case 'shotgunner': {
      // Scattergun: the whole blast ring takes the hit instantly — no projectile phase.
      const blast = effStats(tower).splash || 15;
      for (const enemy of state.enemies) {
        if (!enemy.alive) continue;
        const [px, py] = posOf(enemy);
        if (Math.hypot(px - tx, py - ty) <= blast) damageEnemy(enemy, dmg);
      }
      // Pellet fan: three amber streaks fanned around the aim line.
      const aim = Math.atan2(ty - tower.y, tx - tower.x);
      const span = Math.hypot(tx - tower.x, ty - tower.y);
      for (const off of [-0.24, 0, 0.24]) {
        const px = tower.x + Math.cos(aim + off) * span;
        const py = tower.y + Math.sin(aim + off) * span;
        emit('line', tower.x, tower.y, px, py, 'fx-line fx-pellet', 2.5, 300);
      }
      emit('ring', tx, ty, 'fx-ring-amber');
      break;
    }
    case 'sniper': {
      // Hitscan marksman: the round lands the instant the trigger breaks —
      // no projectile phase, just a bright rail line and a red impact ring.
      damageEnemy(target, dmg);
      fireLine(tower, target, 'fx-sniper', 1.6);
      emit('ring', tx, ty, 'fx-ring-red');
      fragBurst(tower, target, dmg);
      break;
    }
    case 'shredder': {
      // Chaff mulcher: same instant-hit brain as the Sentinel but the drum
      // spits a ragged amber chip-stream instead of a clean tracer.
      damageEnemy(target, dmg);
      fireLine(tower, target, 'fx-chip', 1.8);
      fragBurst(tower, target, dmg);
      break;
    }
    case 'sparkcoil': {
      // Filler zapper: instant arc, jagged cyan spark instead of a clean tracer.
      damageEnemy(target, dmg);
      fireLine(tower, target, 'fx-spark', 1.8);
      fragBurst(tower, target, dmg);
      break;
    }
    case 'flakpost': {
      // Sky-warden pair: flyers only (fire-control never pools walkers) —
      // FRAG ROUNDS adds a tiny burst ring around the intercepted flyer.
      damageEnemy(target, dmg);
      fireLine(tower, target, 'fx-flak', 1.6);
      const flak = effStats(tower).splash || 0;
      if (flak > 0) {
        for (const enemy of state.enemies) {
          if (!enemy.alive || enemy === target || enemy.friendly || !enemy.t.flying) continue;
          const [px, py] = posOf(enemy);
          if (Math.hypot(px - tx, py - ty) <= flak) damageEnemy(enemy, Math.round(dmg * 0.5));
        }
      }
      emit('ring', tx, ty, 'fx-ring-amber');
      fragBurst(tower, target, dmg);
      break;
    }
    case 'missilesilo': {
      // Strategic strike: the warhead flies a visible arc (slow, dodgeable by
      // nothing — it always lands) and detonates for full damage in the blast.
      // MIRV tiers crack the shell into cluster bomblets on impact.
      const es = effStats(tower);
      addProjectile({ kind: 'missile', x: tower.x, y: tower.y, tx, ty, speed: 210, dmg, splash: es.splash || 55, cluster: es.cluster || 0 });
      emit('ring', tower.x, tower.y, 'fx-ring-amber');
      break;
    }
    case 'virus': {
      // Melee swarm: blades land instantly — no projectile phase at all.
      // CONTAGION tier: every hit infects the target — corruption burns for
      // es.corrupt damage per second over 5s as PHASE damage (armor plating
      // and shield lattices mean nothing to it), refreshed by every blade.
      damageEnemy(target, dmg);
      const es = effStats(tower);
      if (es.corrupt && !target.friendly) {
        target.corrupt = { dps: es.corrupt, t: 5 };
        emit('ring', tx, ty, 'fx-ring-virus');
      }
      emit('line', tower.x, tower.y, tx, ty, 'fx-line fx-tracer fx-slash', 3, 160);
      emit('ring', tx, ty, 'fx-ring-virus');
      fragBurst(tower, target, dmg);
      break;
    }
    case 'executioner': {
      // THE HEADSMAN: a commanders-only rail. Chaff soaks a token fraction of
      // the round; bosses pay full price — and a marked commander below the
      // execute threshold just dies. The final boss is beyond the blade.
      const es = effStats(tower);
      const headsmanShot = target.t.boss ? dmg : Math.max(1, Math.round(dmg * (es.chaffPct || 0.15)));
      damageEnemy(target, headsmanShot);
      fireLine(tower, target, 'fx-sniper', 2.6);
      emit('ring', tx, ty, 'fx-ring-red');
      fragBurst(tower, target, headsmanShot);
      if (target.alive && target.t.boss && target.key !== 'overseer' && target.hp <= target.maxHp * (es.execute || 0.15)) {
        damageEnemy(target, 999999999, { phase: true, src: 'execute' });
        emit('float', tx, ty - target.t.size - 12, 'EXECUTED', 'core-float');
        emit('ring', tx, ty, 'fx-ring-crimson');
      }
      break;
    }
    case 'dawnbreaker': {
      // CRIMSON RELIC: hitscan solar lance — the beam burns straight through
      // armor plating AND shield lattices (phase damage), tracks air natively,
      // and SUNSLAUGHTER tiers splash the burn onto everything near the target.
      damageEnemy(target, dmg, { phase: true, src: 'dawn' });
      // Layered solar lance: a wide corona sheath under a white-hot core —
      // the relic's shot should read as a piece of the dawn, not a tracer.
      fireLine(tower, target, 'fx-dawn-halo', 6.5);
      fireLine(tower, target, 'fx-dawn', 2.6);
      emit('ring', tx, ty, 'fx-ring-amber');
      const burn = effStats(tower).splash || 0;
      if (burn > 0) {
        for (const enemy of state.enemies) {
          if (!enemy.alive || enemy === target || enemy.friendly) continue;
          const [px, py] = posOf(enemy);
          if (Math.hypot(px - tx, py - ty) <= burn) damageEnemy(enemy, Math.round(dmg * 0.6), { phase: true, src: 'dawn' });
        }
      }
      break;
    }
    case 'veteran': {
      // One chassis, three guns. FIRE DISCIPLINE heats the rifle on repeated
      // hulls, the SCATTERGUN empties the whole blast ring at once, and the
      // LONGRIFLE pierces armor to delete the beefiest hull in reach.
      const es = effStats(tower);
      if (es.gunName === 'SCATTERGUN') {
        const blast = es.splash || 32;
        for (const enemy of state.enemies) {
          if (!enemy.alive) continue;
          const [px, py] = posOf(enemy);
          if (Math.hypot(px - tx, py - ty) <= blast) damageEnemy(enemy, dmg);
        }
        const aim = Math.atan2(ty - tower.y, tx - tower.x);
        const span = Math.hypot(tx - tower.x, ty - tower.y);
        for (const off of [-0.22, 0, 0.22]) {
          const px = tower.x + Math.cos(aim + off) * span;
          const py = tower.y + Math.sin(aim + off) * span;
          emit('line', tower.x, tower.y, px, py, 'fx-line fx-pellet', 2.5, 300);
        }
        emit('ring', tx, ty, 'fx-ring-amber');
        break;
      }
      if (es.gunName === 'LONGRIFLE') {
        const shot = target.t.boss ? Math.round(dmg * (es.bossMult || 1.4)) : dmg;
        damageEnemy(target, shot, { armorPierce: true });
        fireLine(tower, target, 'fx-sniper', 2);
        emit('ring', tx, ty, 'fx-ring-red');
        fragBurst(tower, target, shot);
        break;
      }
      // BATTLE RIFLE — fire discipline heats up on the same hull.
      if (tower.heatNid === target.nid) tower.heat = Math.min(3, (tower.heat || 0) + 1);
      else { tower.heatNid = target.nid; tower.heat = 0; }
      const shot = Math.round(dmg * (1 + (tower.heat || 0) * 0.2));
      damageEnemy(target, shot);
      fireLine(tower, target, 'fx-tracer');
      fragBurst(tower, target, shot);
      break;
    }
    default: {
      damageEnemy(target, dmg);
      fireLine(tower, target, 'fx-tracer');
      fragBurst(tower, target, dmg);
      break;
    }
  }
}

export function addProjectile(p) {
  p.id = ++state.pidSeq;
  state.projectiles.push(p);
}

export function updateProjectiles(dt) {
  for (const p of state.projectiles) {
    if (p.kind === 'shell' || p.kind === 'missile') {
      const dx = p.tx - p.x;
      const dy = p.ty - p.y;
      const step = p.speed * dt;
      if (Math.hypot(dx, dy) <= step) {
        p.x = p.tx;
        p.y = p.ty;
        p.dead = true;
        emit('ring', p.tx, p.ty, 'fx-ring-red');
        for (const enemy of state.enemies) {
          if (!enemy.alive) continue;
          const [px, py] = posOf(enemy);
          if (Math.hypot(px - p.tx, py - p.ty) <= (p.splash || 40)) damageEnemy(enemy, p.dmg);
        }
        // MIRV PROTOCOL: the shell cracks open — cluster bomblets pepper a wide
        // secondary ring around the impact crater for partial damage (35% post-nerf).
        if (p.cluster) {
          emit('ring', p.tx, p.ty, 'fx-ring-amber');
          for (const enemy of state.enemies) {
            if (!enemy.alive) continue;
            const [px, py] = posOf(enemy);
            const d = Math.hypot(px - p.tx, py - p.ty);
            if (d > (p.splash || 40) && d <= 130) damageEnemy(enemy, Math.round(p.dmg * 0.35));
          }
        }
      } else {
        p.x += (dx / Math.hypot(dx, dy)) * step;
        p.y += (dy / Math.hypot(dx, dy)) * step;
      }
    }
  }
  state.projectiles = state.projectiles.filter((p) => !p.dead);
}

// Reset the mission state for a map (the sim half of startMission). The caller works out the opening cash (perks, debug).
export function startSim(map, cash) {
  state.map = map;
  state.mode = 'vote';
  state.protocol = null; // the combat protocol locks in at the vote
  state.speed2x = false;
  state.samplers = buildSamplers(map);
  // Flat point cloud of every lane: placement checks + drone spawn gates use it.
  state.trackPts = state.samplers.flatMap((sampler) => sampler.pts);
  prepMechanics(map, state.samplers);
  state.cash = cash;
  state.baseHp = BASE_MAX;
  state.enemies = [];
  state.towers = [];
  state.projectiles = [];
  state.wasteZones = [];
  state.bonusNc = 0;
  state.kills = 0;
  state.bossesKilled = 0;
  state.earned = 0;
  state.waveIndex = -1;
  state.clock = 0;
  state.nidSeq = 0;
  state.guestMap = new Map();
  state.syncT = 0;
  state.syncTitle = '';
  state.syncSeq = 0;
  state.lastSyncSeq = 0;
}

// Lock in the protocol and start the pre-wave countdown (the sim half of launchCombat).
export function launchSim(mode) {
  state.protocol = mode;
  if (mode === 'hard' || mode === 'insane' || mode === 'crimson') state.cash = Math.round(state.cash * (mode === 'crimson' ? 0.7 : mode === 'insane' ? 0.65 : 0.8)); // HELL strips opening salvage
  state.mode = 'countdown';
  state.countdown = 3.4;
  state.lastCount = 4;
}

// Read-only telemetry for QA, tests and the Node golden run.
export function simStats() {
  return ({ mode: state.mode, wave: state.waveIndex + 1, kills: state.kills, cash: Math.round(state.cash), base: state.baseHp, towers: state.towers.length, enemies: state.enemies.filter((enemy) => enemy.alive).length, towersDetail: state.towers.map((t) => ({ id: t.id, onPad: !!t.onPad })), flyingAlive: state.enemies.filter((e) => e.alive && e.t.flying).length, friendliesAlive: state.enemies.filter((e) => e.alive && e.friendly).length, friendlyTargeted: state.towers.some((t) => t.target && t.target.alive && t.target.friendly) });
}
