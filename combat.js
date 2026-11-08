// Core Breach: Zero — Combat Protocol (Easy Mode).
// Loaded after app.js: uses its globals (BATTLE_MAPS, svgNode, playSound, showToast...).
// Mode voting (EASY + MEDIUM) + per-protocol wave ladders + enemies that follow every map's tracks and mechanics.
import { rand } from './src/sim/rng.js';
import { buildSampler } from './src/sim/track.js';
import { BASE_MAX, BLOAT_EMP_RADIUS, BLOAT_EMP_SECONDS, CORE_CLEAR, EASY_BOSS_RELIEF, EASY_WAVES, ENEMY_TYPES, FOOT_HALF, MODE_BOSS_LEAK, MODE_HP_GROWTH, MODE_HP_SCALE, MODE_LEAK, MODE_SPEED, NUKE_COOLDOWN, NUKE_COST, NUKE_DAMAGE, NUKE_RADIUS, PAD_AIR_BOOST, PAD_SNAP, SEP, SPAWN_GAP, START_SALVAGE, SUMMON_CAP, SURGE_MODS, TOWER_BASE, TOWER_PER_ALLY, TOWER_RULES, TRACK_CLEAR, VETERAN_GUNS, WASTE_DPS, WASTE_RADIUS, WASTE_SECONDS, WAVES, WAVE_HP_SCALE } from './src/combat/data.js';
(() => {
const board = document.querySelector('#board');
const battlefield = document.querySelector('#battlefield');






function leakDamage(enemy) {
  const overrides = MODE_LEAK[state.protocol] || {};
  if (!enemy.t.boss && overrides[enemy.key] != null) return overrides[enemy.key];
  return Math.round(enemy.t.dmg * (enemy.t.boss ? (MODE_BOSS_LEAK[state.protocol] || 1) : 1));
}
function missionWaves() { return WAVES[state.protocol] || EASY_WAVES; }


function towerLimit() {
  const players = (typeof window !== 'undefined' && Number(window.CBZ_ROOM_PLAYERS)) || 1;
  const base = TOWER_BASE + TOWER_PER_ALLY * (Math.max(1, Math.min(4, players)) - 1);
  return window.CBZPerks && CBZPerks.has('saturation') ? base + 5 : base;
}



// Per-blueprint deploy caps: entry.limit is a real COUNT now — the headsman
// musters up to three rails, the one-off rigs stay at one. Mirrored by the
// toast copy so the reason reads right at any cap.
function limitReached(entry) {
  if (!entry.limit) return false;
  return state.towers.filter((tower) => tower.id === entry.id).length >= entry.limit;
}
function limitToast(entry) {
  return entry.limit === 1
    ? `${entry.name} is a one-off rig — only one deploys per commander.`
    : `${entry.name} is capped — only ${entry.limit} deploy per commander.`;
}

// --- Upgrade ladder data rides on the blueprint catalog (shop.js entry.track) ------
// Nothing module-shaped lives here anymore: one chassis, one linear ladder.


// --- Mission state ----------------------------------------------------------------
// --- Presentation events ----------------------------------------------------------------
// The sim reports what happened (rings, floating text, banners, sounds); the view decides how to show it.
// A headless host (the server) simply registers no handlers. Dispatch is synchronous, so order is unchanged.
const view = {};
function emit(type, ...args) { const handler = view[type]; if (handler) handler(...args); }

// Simulation state: plain data only (the part a server can run). Anything that touches the page lives in `ui`.
const state = {
  mode: 'idle', // idle | vote | countdown | waves | over
  protocol: 'easy', speed2x: false, bossHpMult: 1,
  wasteZones: [],
  map: null, samplers: [], gateEvents: [], zoneRanges: [],
  waveIndex: -1, queue: [], spawnGap: 0, intermission: 0, countdown: 0,
  cash: 0, baseHp: BASE_MAX, enemies: [], kills: 0, bossesKilled: 0, earned: 0, clock: 0, nidSeq: 0,
  towers: [], projectiles: [], pidSeq: 0, tidSeq: 0,
  bonusNc: 0,
  corpseLust: 0, // reserved telemetry: total Blood Lust banked across Blossoms
};

// View/input state: DOM handles, pointer, build mode, frame timer. Never read by sim rules.
const ui = {
  speedBtn: null, nukeBtn: null, nukeAim: false, crosshair: null,
  building: null, ghost: null, bar: null, towerPanel: null, panelTower: null,
  mouseX: 500, mouseY: 300, mouseOn: false,
  raf: 0, last: 0,
  hud: null, bossBar: null, tip: null, tipTarget: null, votePanel: null, endPanel: null, banner: null,
  layers: null, deployBtn: null,
};

const debugWave = Number(new URLSearchParams(location.search).get('cbzwave') || 0);
const debugCash = Number(new URLSearchParams(location.search).get('cash') || 0);
const debugFreeze = new URLSearchParams(location.search).has('freeze');

// --- Track engine: sample every map path once (src/sim/track.js, no DOM), then move by arc length ---
function buildSamplers(map) { return map.paths.map(buildSampler); }

function nearestDist(sampler, x, y) {
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

function prepMechanics(map, samplers) {
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

function inHasteZone(pathIdx, dist) {
  return state.zoneRanges.some((r) => r.pathIdx === pathIdx && dist >= r.a && dist <= r.b);
}

// --- Enemy visuals: one distinct silhouette per archetype ---------------------------
function shapeFor(key, t) {
  const nodes = [];
  const add = (name, attrs, text) => nodes.push(svgNode(name, attrs, text));
  if (key === 'glitched') {
    add('rect', { class: 'e-ghost', x: -8, y: -9, width: 7, height: 5 });
    add('rect', { class: 'e-ghost e-ghost-2', x: 2, y: 5, width: 6, height: 4 });
    add('rect', { class: 'e-body', x: -6, y: -6, width: 12, height: 12 });
    add('rect', { class: 'e-core', x: -2, y: -2, width: 4, height: 4 });
  } else if (key === 'runner') {
    add('line', { class: 'e-trail', x1: -22, y1: 0, x2: -9, y2: 0 });
    add('polygon', { class: 'e-body', points: '11,0 -7,6 -3,0 -7,-6' });
  } else if (key === 'file') {
    add('polygon', { class: 'e-body', points: '0,-6 5,3 -5,3' });
    add('polygon', { class: 'e-ghost', points: '5,3 10,9 2,8' });
    add('polygon', { class: 'e-ghost e-ghost-2', points: '-6,2 -11,7 -3,9' });
  } else if (key === 'shielded') {
    add('circle', { class: 'e-ghost', r: 14 });
    add('polygon', { class: 'e-body', points: hexPoints(0, 0, 10) });
    add('rect', { class: 'e-core', x: -3, y: -3, width: 6, height: 6 });
  } else if (key === 'drone') {
    add('g', { class: 'e-rotor-wrap' }, '');
    const rotor = nodes[nodes.length - 1];
    rotor.appendChild(svgNode('line', { class: 'e-rotor', x1: -12, y1: 0, x2: 12, y2: 0 }));
    rotor.appendChild(svgNode('line', { class: 'e-rotor', x1: 0, y1: -12, x2: 0, y2: 12 }));
    add('circle', { class: 'e-body', r: 6 });
    add('circle', { class: 'e-core', r: 2.5 });
  } else if (key === 'nullcore') {
    add('polygon', { class: 'e-ghost', points: hexPoints(0, 0, 17) });
    add('polygon', { class: 'e-body', points: hexPoints(0, 0, 13) });
    add('line', { class: 'e-plate', x1: -7, y1: -7, x2: 7, y2: 7 });
    add('line', { class: 'e-plate', x1: 7, y1: -7, x2: -7, y2: 7 });
    add('circle', { class: 'e-core', r: 3 });
  } else if (key === 'hexbug') {
    add('polygon', { class: 'e-ghost', points: hexPoints(0, 0, 13) });
    add('polygon', { class: 'e-body', points: hexPoints(0, 0, 9) });
    add('circle', { class: 'e-core', r: 3 });
  } else if (key === 'juggernaut') {
    add('rect', { class: 'e-ghost', x: -14, y: -12, width: 28, height: 24 });
    add('rect', { class: 'e-body', x: -10, y: -8, width: 20, height: 16 });
    add('line', { class: 'e-plate', x1: -6, y1: 0, x2: 6, y2: 0 });
    add('rect', { class: 'e-core', x: -3, y: -4, width: 6, height: 8 });
  } else if (key === 'phantom') {
    add('circle', { class: 'e-ghost e-ghost-2', r: 11 });
    add('polygon', { class: 'e-body', points: '0,-9 8,0 0,9 -8,0' });
    add('circle', { class: 'e-core', r: 2.5 });
  } else if (key === 'spectre') {
    add('circle', { class: 'e-ghost e-shroud', r: 13 });
    add('polygon', { class: 'e-body', points: '0,-10 7,0 0,10 -7,0' });
    add('line', { class: 'e-plate', x1: -4, y1: 0, x2: 4, y2: 0 });
    add('circle', { class: 'e-core', r: 2.4 });
  } else if (key === 'leech') {
    add('path', { class: 'e-siphon', d: 'M-14,-8 A16,16 0 0,1 -14,8' });
    add('path', { class: 'e-siphon e-siphon-2', d: 'M14,-8 A16,16 0 0,0 14,8' });
    add('circle', { class: 'e-body', r: 9 });
    add('circle', { class: 'e-core', r: 3 });
  } else if (key === 'bloat') {
    add('circle', { class: 'e-ghost', r: 15 });
    add('circle', { class: 'e-blister', cx: -6, cy: -5, r: 3 });
    add('circle', { class: 'e-blister e-blister-2', cx: 7, cy: 3, r: 2.4 });
    add('circle', { class: 'e-blister e-blister-3', cx: -2, cy: 7, r: 2 });
    add('circle', { class: 'e-body', r: 11 });
    add('circle', { class: 'e-core', r: 4 });
  } else if (key === 'rampager') {
    add('line', { class: 'e-trail', x1: -26, y1: 0, x2: -12, y2: 0 });
    add('polygon', { class: 'e-body', points: '15,0 -9,9 -4,0 -9,-9' });
    add('line', { class: 'e-spike', x1: -2, y1: -8, x2: 3, y2: -14 });
    add('line', { class: 'e-spike', x1: -2, y1: 8, x2: 3, y2: 14 });
    add('circle', { class: 'e-core', r: 2.6 });
  } else if (key === 'warden') {
    add('circle', { class: 'e-orbit', r: 24 });
    add('polygon', { class: 'e-ghost', points: hexPoints(0, 0, 20) });
    add('polygon', { class: 'e-body', points: hexPoints(0, 0, 16) });
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i;
      add('line', { class: 'e-plate', x1: Math.cos(a) * 8, y1: Math.sin(a) * 8, x2: Math.cos(a) * 15, y2: Math.sin(a) * 15 });
    }
    add('circle', { class: 'e-core', r: 5.5 });
  } else if (key === 'virus') {
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI / 4) * i;
      add('line', { class: 'e-spike', x1: Math.cos(a) * 10, y1: Math.sin(a) * 10, x2: Math.cos(a) * 19, y2: Math.sin(a) * 19 });
    }
    add('circle', { class: 'e-body', r: 11 });
    add('circle', { class: 'e-core', r: 4.5 });
  } else if (key === 'leak') {
    add('circle', { class: 'e-drip e-drip-2', cx: 12, cy: 10, r: 4 });
    add('circle', { class: 'e-drip', cx: -10, cy: 12, r: 3 });
    add('circle', { class: 'e-body', r: 14 });
    add('circle', { class: 'e-core', r: 6 });
  } else if (key === 'overseer') {
    add('circle', { class: 'e-orbit', r: 24 });
    add('polygon', { class: 'e-ghost', points: hexPoints(0, 0, 19) });
    add('polygon', { class: 'e-body', points: hexPoints(0, 0, 14) });
    add('circle', { class: 'e-core', r: 5.5 });
    add('circle', { class: 'e-shield-ring', r: 21 });
  } else {
    add('circle', { class: 'e-body', r: t.size });
  }
  return nodes;
}

// --- Enemy view -------------------------------------------------------------------------
// Enemies are plain data. One SVG group per enemy id lives here: built on first sight, posed from
// fx/fy/angle and status fields every tick, retired when the sim marks the enemy dead (fate).
const enemyViews = new Map();

function buildEnemyView(enemy) {
  const { key, t } = enemy;
  let g;
  let barW = 22;
  const chassis = svgNode('g', { class: 'e-chassis' });
  if (key === 'soul') {
    g = svgNode('g', { class: 'enemy e-summon e-soul' });
    chassis.appendChild(svgNode('circle', { class: 'soul-halo', r: 11 }));
    chassis.appendChild(svgNode('circle', { class: 'soul-core', r: 5 }));
    chassis.appendChild(svgNode('circle', { class: 'soul-eye', cx: -2, cy: -1.4, r: 1.2 }));
    chassis.appendChild(svgNode('circle', { class: 'soul-eye', cx: 2.4, cy: -1.4, r: 1.2 }));
  } else {
    if (key === 'drone') g = svgNode('g', { class: 'enemy e-summon e-drone e-strike' });
    else if (enemy.friendly) g = svgNode('g', { class: `enemy e-summon e-${key}` });
    else {
      barW = t.boss ? 34 : 22;
      g = svgNode('g', { class: `enemy e-${key}${t.boss ? ' e-boss' : ''}${state.protocol === 'crimson' ? ` e-crimson${state.surgeMod ? ' e-surge' : ''}` : ''}` });
    }
    for (const node of shapeFor(key, t)) chassis.appendChild(node);
  }
  // Shapes live in an inner chassis so CSS spawn/death/hover animations can scale or bob them
  // freely: a CSS transform on this outer group would override the per-frame position attribute.
  g.appendChild(chassis);
  // The dawn marks its own: a pulsing crimson aura ring orbits every hostile.
  if (!enemy.friendly && state.protocol === 'crimson') g.insertBefore(svgNode('circle', { class: 'e-aura', r: t.size + 7 }), chassis);
  const barY = -(t.size + 13);
  g.appendChild(svgNode('rect', { class: 'hp-bg', x: -barW / 2, y: barY, width: barW, height: 3.4 }));
  const fill = svgNode('rect', { class: 'hp-fill', x: -barW / 2, y: barY, width: barW, height: 3.4 });
  g.appendChild(fill);
  let shieldFill = fill;
  if (!enemy.friendly) {
    shieldFill = svgNode('rect', { class: 'shield-fill', x: -barW / 2, y: barY - 4, width: 0, height: 2.4 });
    g.appendChild(shieldFill);
  }
  const tipIn = enemy.friendly ? showSummonTip : showTip;
  g.addEventListener('pointerenter', (event) => tipIn(enemy, event));
  g.addEventListener('pointermove', moveTip);
  g.addEventListener('pointerleave', () => hideTip(enemy));
  ui.layers.enemies.appendChild(g);
  if (key !== 'drone') {
    g.classList.add('spawn-in');
    setTimeout(() => g.classList.remove('spawn-in'), 420);
  }
  return { g, fill, shieldFill, barW };
}

function renderEnemies() {
  if (!ui.layers) return;
  const seen = new Set();
  for (const enemy of state.enemies) {
    if (enemy.guest) continue;
    seen.add(enemy.nid);
    let v = enemyViews.get(enemy.nid);
    if (!v) { v = buildEnemyView(enemy); v.enemy = enemy; enemyViews.set(enemy.nid, v); }
    const spin = enemy.flight && !enemy.friendly ? ` rotate(${enemy.angle.toFixed(1)})` : enemy.key === 'runner' ? ` rotate(${enemy.angle.toFixed(1)})` : '';
    v.g.setAttribute('transform', `translate(${enemy.fx.toFixed(1)} ${enemy.fy.toFixed(1)})${spin}`);
    v.g.classList.toggle('e-stunned', enemy.stun > 0);
    v.g.classList.toggle('e-haste', Boolean(enemy.hasted));
    v.g.classList.toggle('e-cloak', Boolean(enemy.cloaked));
    if (enemy.shielded) { const ring = v.g.querySelector('.e-shield-ring'); if (ring) ring.classList.add('on'); }
  }
  for (const [nid, v] of enemyViews) {
    const enemy = v.enemy;
    if (enemy.alive && !seen.has(nid)) { v.g.remove(); enemyViews.delete(nid); continue; } // mission reset dropped it
    if (enemy.alive) {
      v.fill.setAttribute('width', (v.barW * enemy.hp) / enemy.maxHp);
      v.fill.classList.toggle('low', enemy.hp / enemy.maxHp < 0.35);
      v.shieldFill.setAttribute('width', enemy.maxShield ? (v.barW * enemy.shield) / enemy.maxShield : 0);
    } else {
      if (enemy.fate === 'dying') { v.g.classList.add('dying'); setTimeout(() => v.g.remove(), 300); } else v.g.remove();
      enemyViews.delete(nid);
    }
  }
}

// --- Tower view -------------------------------------------------------------------------
// Towers are plain data (x, y, lvl, offlineT, charge, aim...). The SVG group, head rotation, status
// classes and the Deathwarrant's lock graphics live here, keyed by tower uid. Co-op guest towers
// (tower.guest) still carry their own node.
const towerViews = new Map();

function makeTowerView(tower) {
  const node = towerNode(tower.entry, tower.x, tower.y);
  node.dataset.uid = tower.uid;
  ui.layers.towers.appendChild(node);
  const v = { node, head: node.querySelector('.tw-head'), tower, warrant: null };
  towerViews.set(tower.uid, v);
  return v;
}

function towerNodeOf(tower) {
  if (tower.guest) return tower.node;
  const v = towerViews.get(tower.uid);
  return v ? v.node : null;
}

function dropTowerView(tower) {
  const v = towerViews.get(tower.uid);
  if (!v) return;
  v.node.remove();
  if (v.warrant) for (const el of Object.values(v.warrant)) el.remove();
  towerViews.delete(tower.uid);
}

function renderTowers() {
  if (!ui.layers) return;
  const seen = new Set();
  for (const tower of state.towers) {
    if (tower.guest) continue;
    seen.add(tower.uid);
    const v = towerViews.get(tower.uid) || makeTowerView(tower);
    v.node.classList.toggle('tw-offline', (tower.offlineT || 0) > 0);
    v.node.classList.toggle('tw-charging', Boolean(tower.charge));
    if (v.head && tower.aim !== undefined && tower.aim !== v.aim) { v.aim = tower.aim; v.head.setAttribute('transform', `rotate(${tower.aim.toFixed(1)})`); }
    const charge = tower.charge;
    if (charge && !v.warrant) {
      const ring = svgNode('circle', { class: 'fx-warrant-ring', cx: tower.x, cy: tower.y, r: 6 });
      const lock = svgNode('g', { class: 'fx-warrant-lock' });
      lock.appendChild(svgNode('path', { d: 'M0 -14 L14 0 L0 14 L-14 0 Z' }));
      const line = svgNode('line', { class: 'fx-warrant-line', x1: tower.x, y1: tower.y, x2: charge.x.toFixed(1), y2: charge.y.toFixed(1) });
      ui.layers.fx.appendChild(line);
      ui.layers.fx.appendChild(ring);
      ui.layers.fx.appendChild(lock);
      v.warrant = { ring, lock, line };
    }
    if (charge && v.warrant) {
      const { ring, lock, line } = v.warrant;
      lock.setAttribute('transform', `translate(${charge.x.toFixed(1)} ${charge.y.toFixed(1)})`);
      line.setAttribute('x2', charge.x.toFixed(1));
      line.setAttribute('y2', charge.y.toFixed(1));
      ring.setAttribute('r', (6 + 30 * (1 - Math.max(0, charge.t) / charge.total)).toFixed(1));
    } else if (v.warrant) {
      for (const el of Object.values(v.warrant)) el.remove();
      v.warrant = null;
    }
  }
  for (const [uid, v] of towerViews) if (!seen.has(uid)) dropTowerView(v.tower); // sold or mission reset
}

// --- Spawning / damage / death -------------------------------------------------------
function spawnEnemy(key, pathIdx) {
  const t = ENEMY_TYPES[key];
  const enemy = {
    key, t,
    nid: ++state.nidSeq,
    // Wave pressure: HP scales per wave index, surge modifiers stack on top.
    // Easy relief: commanders (bosses) spawn with slightly less hull on EASY.
    hp: Math.round(t.hp * (t.boss ? state.bossHpMult : 1) * (state.hpScale || 1)), maxHp: Math.round(t.hp * (t.boss ? state.bossHpMult : 1) * (state.hpScale || 1)), shield: 0, maxShield: t.shield || 0,
    pathIdx, dist: debugFreeze ? 260 + rand() * 480 : 0, speed: t.speed * (state.surgeSpeed || 1) * (MODE_SPEED[state.protocol] || 1), alive: true,
    usedGates: new Set(), pulseTimer: 8, replicated: false, shielded: false, angle: 0,
  };
  if (t.flying) {
    // Air units leave the track behind: straight flight plan from spawn gate to core.
    const [sx, sy] = state.samplers[pathIdx].at(0);
    const [tx, ty] = corePos();
    enemy.flight = { sx, sy, tx, ty, total: Math.max(1, Math.hypot(tx - sx, ty - sy)) };
    enemy.dist = debugFreeze ? Math.min(enemy.flight.total * 0.85, 260 + rand() * 480) : 0;
  }
  state.enemies.push(enemy);
  const [x, y] = enemy.flight ? flightPos(enemy, enemy.dist) : state.samplers[pathIdx].at(enemy.dist);
  enemy.fx = x;
  enemy.fy = y;
  if (state.protocol === 'crimson') emit('ring', x, y, 'fx-ring-crimson'); // the vein spits them out burning
  if (t.boss) { emit('banner', t.name, '// HOSTILE COMMANDER DETECTED', 'banner-red'); updateBossBar(); }
  return enemy;
}

function damageEnemy(enemy, amount, opts = {}) {
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
  if (enemy.t.boss) updateBossBar(); // the top-bar boss readout tracks every hit
  if (enemy.key === 'leak' && !enemy.replicated && enemy.hp <= enemy.maxHp / 2) replicateLeak(enemy);
  if (enemy.key === 'overseer' && !enemy.shielded && enemy.hp <= enemy.maxHp * 0.25) {
    enemy.shielded = true;
    enemy.shield = enemy.maxShield;
    emit('ring', ...posOf(enemy), 'fx-ring-white');
  }
  if (enemy.hp <= 0) killEnemy(enemy, opts.src);
}

function paintGuestBars(enemy) {
  const barW = enemy.t.boss ? 34 : 22;
  enemy.fill.setAttribute('width', (barW * enemy.hp) / enemy.maxHp);
  enemy.fill.classList.toggle('low', enemy.hp / enemy.maxHp < 0.35);
  enemy.shieldFill.setAttribute('width', enemy.maxShield ? (barW * enemy.shield) / enemy.maxShield : 0);
}

function killEnemy(enemy, src) {
  if (!enemy.alive) return;
  enemy.alive = false;
  hideTip(enemy);
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
  updateHud();
  if (enemy.t.boss) updateBossBar();
}

// --- Corpse Blossom: the dead rise and walk the lane backwards -------------------
function corpseBlossomFeed(enemy, x, y, src) {
  for (const tower of state.towers) {
    if (tower.id !== 'corpseblossom') continue;
    if (Math.hypot(x - tower.x, y - tower.y) > effStats(tower).rng) continue;
    const lvl = trackLevel(tower);
    if (lvl >= 4) {
      tower.lust = (tower.lust || 0) + (effStats(tower).lust || 1);
      emit('float', tower.x, tower.y - 44, `BLOOD LUST ${tower.lust}`, 'lust-float');
      if (ui.panelTower === tower) openTowerPanel(tower); // live lust counter
    }
    spawnSummon(enemy, tower, src === 'veins' && lvl >= 2);
  }
}

// --- Grave Warden: the yard keeps its dead, and the bell keeps the score ----------
// Every hostile that dies inside the yard rings up a charge; charges knock time
// off the next toll. When the bell sounds, everything hostile in the yard takes
// the pulse and chaff is stunned where it stands — commanders walk through unmoved.
function graveWardenFeed(enemy, x, y) {
  for (const tower of state.towers) {
    if (tower.id !== 'gravewarden') continue;
    if (Math.hypot(x - tower.x, y - tower.y) > effStats(tower).rng) continue;
    tower.tollCharges = (tower.tollCharges || 0) + 1;
    tower.bellCd = Math.max(0, (tower.bellCd || 0) - 0.4);
    if (ui.panelTower === tower) openTowerPanel(tower); // live toll counter
  }
}

// Grave Yard slow: hostiles inside a CHILL GRAVE yard drag their heels — flyers too.
function wardenYardMult(enemy) {
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

function spawnSummon(enemy, tower, stained) {
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

function despawnSummon(summon) {
  summon.alive = false;
  summon.fate = 'gone';
  emit('ring', summon.fx, summon.fy, 'fx-ring-virus');
}

// Summons mow the lane: every hostile they touch takes damage equal to the
// summon's full hull. Kamikaze rigs (strike drones, the Warden's souls)
// collapse on first contact — but Blossom risen copies PIERCE now: each mow
// costs the risen a quarter of its hull, so a fresh copy cuts through four
// hostiles instead of dying on the first bump.
function contactDamage(summon) {
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

function moveSummon(summon, dt) {
  if (debugFreeze || state.mode !== 'waves') return;
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
function launchStrikeDrone(tower) {
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

function replicateLeak(enemy) {
  enemy.replicated = true;
  const [x, y] = posOf(enemy);
  emit('ring', x, y, 'fx-ring-amber');
  for (let i = 0; i < 6; i++) {
    const spawn = spawnEnemy('file', enemy.pathIdx);
    spawn.dist = Math.min(state.samplers[enemy.pathIdx].len - 8, Math.max(0, enemy.dist - 18 + i * 7));
  }
  emit('banner', 'MEMORY LEAK', '// REPLICATION — HOSTILES SPILLED', 'banner-red');
}

function leakEnemy(enemy) {
  enemy.alive = false;
  hideTip(enemy);
  enemy.fate = 'gone';
  const leakDmg = leakDamage(enemy);
  state.baseHp = Math.max(0, state.baseHp - leakDmg);
  board.classList.remove('core-hit');
  void board.offsetWidth;
  board.classList.add('core-hit');
  setTimeout(() => board.classList.remove('core-hit'), 550);
  emit('float', ...corePos(), `-${leakDmg} CORE`, 'core-float');
  updateHud();
  if (enemy.t.boss) updateBossBar();
  if (state.baseHp <= 0 && state.mode === 'waves') endMission(false);
}

function posOf(enemy) {
  if (enemy.flight) return [enemy.fx, enemy.fy];
  return state.samplers[enemy.pathIdx].at(enemy.dist);
}

function corePos() {
  return [state.map.core.x, state.map.core.y];
}

// Flying units cruise straight from their spawn gate to the core with a light
// sinusoidal weave that fades out near both ends of the flight plan.
function flightPos(enemy, progress) {
  const f = enemy.flight;
  const t = Math.min(1, Math.max(0, progress / f.total));
  const dx = f.tx - f.sx;
  const dy = f.ty - f.sy;
  const nx = -dy / f.total;
  const ny = dx / f.total;
  const weave = Math.sin(progress * (Math.PI * 2) / 120) * 8 * Math.sin(t * Math.PI);
  return [f.sx + dx * t + nx * weave, f.sy + dy * t + ny * weave];
}

// --- FX -------------------------------------------------------------------------------
function fxRing(x, y, cls) {
  const ring = svgNode('circle', { class: `fx-ring ${cls}`, cx: x, cy: y, r: 6 });
  ui.layers.fx.appendChild(ring);
  setTimeout(() => ring.remove(), 650);
}

// Cinematic Nuclear Fall Out impact: white-out flash over the whole board +
// twin expanding shockwave rings + the lingering fallout pool.
function fxNukeBlast(x, y) {
  const flash = document.createElement('div');
  flash.className = 'nuke-flash';
  battlefield.appendChild(flash);
  setTimeout(() => flash.remove(), 900);
  for (const [cls, delay] of [['fx-nuke-ring', 0], ['fx-nuke-ring slow', 150]]) {
    setTimeout(() => {
      const ring = svgNode('circle', { class: `fx-ring ${cls}`, cx: x, cy: y, r: 10 });
      ui.layers.fx.appendChild(ring);
      setTimeout(() => ring.remove(), 1400);
    }, delay);
  }
  emit('ring', x, y, 'fx-ring-red');
}

// Blood Purge: crimson shockwave swells to the full curse radius.
function fxPurgeBlast(tower) {
  const ring = svgNode('circle', { class: 'fx-ring fx-purge-ring', cx: tower.x, cy: tower.y, r: 8 });
  ui.layers.fx.appendChild(ring);
  setTimeout(() => ring.remove(), 950);
  emit('ring', tower.x, tower.y, 'fx-ring-virus');
}

// Blood Scream: screen-edge crimson vignette + every enraged summon shudders.
function fxScreamBlast(tower, buffed) {
  const vignette = document.createElement('div');
  vignette.className = 'scream-vignette';
  battlefield.appendChild(vignette);
  setTimeout(() => vignette.remove(), 1100);
  for (const summon of state.enemies) {
    if (!summon.alive || !summon.friendly) continue;
    emit('flash', summon);
  }
  emit('ring', tower.x, tower.y, 'fx-ring-virus');
}

function floatText(x, y, text, cls) {
  const label = svgNode('text', { class: `float-text ${cls}`, x, y, 'text-anchor': 'middle' }, text);
  ui.layers.fx.appendChild(label);
  setTimeout(() => label.remove(), 950);
}

view.bloom = (x, y, r) => { const bloom = svgNode('circle', { class: 'fx-ring fx-bloom', cx: x, cy: y, r }); ui.layers.fx.appendChild(bloom); setTimeout(() => bloom.remove(), 720); };
view.flash = (summon) => { const v = enemyViews.get(summon.nid); if (!v) return; v.g.classList.add('screamed-flash'); setTimeout(() => v.g.classList.remove('screamed-flash'), 900); };
Object.assign(view, { ring: fxRing, float: floatText, banner, sound: (...a) => playSound(...a), nuke: fxNukeBlast, purge: fxPurgeBlast, scream: fxScreamBlast });

// --- Main loop ------------------------------------------------------------------------
function tick(ts) {
  ui.raf = requestAnimationFrame(tick);
  let dt = Math.min(0.05, (ts - ui.last) / 1000 || 0);
  ui.last = ts;
  if (state.speed2x) dt *= 2; // OVERDRIVE perk: the whole sim runs at double tempo
  if (coopGuest()) { state.clock += dt; guestFrame(dt); return; }
  simStep(dt);
  renderProjectiles();
  renderEnemies();
  renderTowers();
  if (coopHost()) {
    state.syncT -= dt;
    if (state.syncT <= 0) { state.syncT = 0.12; coopBroadcast(); }
  }
}

// One fixed-or-variable sim step: no requestAnimationFrame, no clock reads, no view calls. A host can call it with a fixed dt.
function simStep(dt) {
  state.clock += dt;
  if (state.mode === 'countdown') {
    state.countdown -= dt;
    const n = Math.ceil(state.countdown);
    if (n !== state.lastCount && n > 0) { state.lastCount = n; emit('banner', String(n), '// DEPLOYING', 'banner-count'); emit('sound'); }
    if (state.countdown <= 0) beginWave(debugWave > 0 ? Math.min(missionWaves().length - 1, debugWave - 1) : 0);
  }
  if (state.mode === 'waves') runWaves(dt);
  tickWaste(dt);
  for (const enemy of state.enemies) if (enemy.alive) moveEnemy(enemy, dt);
  state.enemies = state.enemies.filter((enemy) => enemy.alive);
  updateTowers(dt);
  updateProjectiles(dt);
}

// RAMPAGE UNIT: berserk drive — the lower the hull, the higher the speed.
function enrageMult(enemy) {
  if (enemy.key !== 'rampager' || !enemy.maxHp) return 1;
  return 1 + 0.85 * (1 - Math.max(0, enemy.hp) / enemy.maxHp);
}

function empPop(x, y) {
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

function moveEnemy(enemy, dt) {
  if (enemy.friendly) { moveSummon(enemy, dt); return; }
  if (debugFreeze || state.mode !== 'waves') return;
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

function runWaves(dt) {
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
      if (ui.panelTower === tower) openTowerPanel(tower);
    }
    const hardMult = state.protocol === 'hard' ? 0.85 : state.protocol === 'insane' ? 0.7 : state.protocol === 'crimson' ? 0.7 : 1; // HELL PAYS WORSE — salvage is blood in HARD, the DOUBLED SPIRAL pays 70%, and the dawn bleeds you for 70%
    const bonus = Math.round((30 + (state.waveIndex + 1) * 7) * hardMult) + rigYield;
    state.cash += bonus;
    state.earned += bonus;
    const cleared = state.waveIndex + 1;
    if (window.CBZPerks && CBZPerks.has('fieldrep') && state.baseHp < BASE_MAX) {
      state.baseHp = Math.min(BASE_MAX, state.baseHp + 2);
      emit('float', ...corePos(), '+2 FIELD REPAIRS', 'repair-float');
    }
    if (cleared >= missionWaves().length) { endMission(true); return; }
    emit('banner', `WAVE ${cleared} CLEARED`, rigYield ? `// +$${bonus} SALVAGE · RIG YIELD $${rigYield}` : `// +$${bonus} SALVAGE`, 'banner-green');
    emit('sound');
    state.intermission = state.protocol === 'crimson' ? 3 : state.protocol === 'insane' ? 2.5 : state.protocol === 'hard' ? 4.5 : 7; // HARD: 4.5s to rebuild — the swarm never waits. DOUBLED INSANE: 2.5s. CRIMSON: 3s
    updateHud();
  }
  if (state.intermission > 0) {
    state.intermission -= dt;
    if (state.intermission <= 0) beginWave(state.waveIndex + 1);
  }
}

function beginWave(index) {
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
  updateHud();
}

// --- Combat HUD -----------------------------------------------------------------------
function ensureHud() {
  if (!ui.hud) {
    ui.hud = document.createElement('div');
    ui.hud.className = 'combat-hud';
    ui.hud.innerHTML = `
      <div class="hud-block hud-wave"><span class="hud-label">WAVE</span><strong id="combat-wave">—</strong></div>
      <div class="hud-block hud-protocol"><span class="hud-label">PROTOCOL</span><strong id="combat-protocol">—</strong></div>
      <div class="hud-block hud-base"><span class="hud-label">BASE INTEGRITY</span><div class="base-track"><div class="base-fill" id="base-fill"></div></div><b id="base-num">100</b></div>
      <div class="hud-block hud-cash"><span class="hud-label">SALVAGE</span><strong id="combat-cash">$0</strong></div>`;
    if (!ui.bossBar) {
      ui.bossBar = document.createElement('div');
      ui.bossBar.className = 'boss-bar';
      ui.bossBar.hidden = true;
      ui.bossBar.innerHTML = `<span class="hud-label" id="boss-name">BOSS</span><div class="boss-track"><div class="boss-fill" id="boss-fill"></div><div class="boss-shield" id="boss-shield"></div></div>`;
      battlefield.appendChild(ui.bossBar);
    }
  }
  const exit = document.querySelector('#exit-battle');
  const deploy = document.querySelector('#deploy-mission');
  ui.deployBtn = deploy;
  exit.textContent = 'ABORT MISSION';
  exit.classList.add('aborting');
  deploy.hidden = true;
  document.querySelector('.field-hud').insertBefore(ui.hud, exit);
  // OVERDRIVE perk: TIME x2 toggle — only rendered once the achievement decrypts it.
  if (!ui.speedBtn && window.CBZPerks && CBZPerks.has('overdrive')) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'speed-toggle';
    btn.textContent = 'TIME x1';
    btn.addEventListener('click', () => {
      state.speed2x = !state.speed2x;
      btn.textContent = state.speed2x ? 'TIME x2' : 'TIME x1';
      btn.classList.toggle('on', state.speed2x);
      emit('sound');
    });
    ui.speedBtn = btn;
  }
  if (ui.speedBtn) {
    state.speed2x = false;
    ui.speedBtn.textContent = 'TIME x1';
    ui.speedBtn.classList.remove('on');
    document.querySelector('.field-hud').insertBefore(ui.speedBtn, exit);
  }
  // Nuclear Fall Out: strike button lives next to the time toggle once a rig deploys.
  if (!ui.nukeBtn) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'nuke-toggle';
    btn.hidden = true;
    btn.addEventListener('click', () => {
      const rig = readyRig();
      if (!rig) { emit('sound', 'alarm'); showToast('Nuclear strike needs the rig at Tier 6 — Nuclear Fall Out.'); return; }
      if (ui.nukeAim) { setNukeAim(false); return; }
      if ((rig.nukeCd || 0) > 0) { emit('sound', 'alarm'); showToast(`Nuke recharging — ${Math.ceil(rig.nukeCd)}s left.`); return; }
      if (state.cash < NUKE_COST) { emit('sound', 'alarm'); showToast(`Need $${NUKE_COST} salvage to call the nuke.`); return; }
      setNukeAim(true);
      emit('sound');
    });
    ui.nukeBtn = btn;
  }
  ui.nukeAim = false;
  if (ui.crosshair) { ui.crosshair.remove(); ui.crosshair = null; }
  paintNukeButton();
  document.querySelector('.field-hud').insertBefore(ui.nukeBtn, exit);
}

function updateHud() {
  if (!ui.hud) return;
  document.querySelector('#combat-wave').textContent = state.waveIndex < 0 ? '—' : `${String(state.waveIndex + 1).padStart(2, '0')}/${missionWaves().length}`;
  document.querySelector('#combat-cash').textContent = `$${state.cash}`;
  const fill = document.querySelector('#base-fill');
  fill.style.width = `${(state.baseHp / BASE_MAX) * 100}%`;
  fill.classList.toggle('warn', state.baseHp <= 60);
  fill.classList.toggle('crit', state.baseHp <= 30);
  document.querySelector('#base-num').textContent = Math.round(state.baseHp);
  refreshBarAfford();
  refreshPanelAfford();
}

// Radioactive aftermath: fallout pools burn everything inside them — hostiles
// and risen corpses alike — until the fallout decays.
function tickWaste(dt) {
  if (!state.wasteZones.length || state.mode !== 'waves') return;
  for (const zone of state.wasteZones) {
    if (state.clock >= zone.until) {
      if (zone.node) zone.node.remove();
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
function readyRig() {
  return state.towers.find((tower) => tower.id === 'zeroday' && trackLevel(tower) >= 6) || null;
}

function setNukeAim(on) {
  ui.nukeAim = Boolean(on);
  if (ui.crosshair) { ui.crosshair.remove(); ui.crosshair = null; }
  if (ui.nukeAim) {
    setBuilding(null);
    ui.crosshair = svgNode('g', { class: 'nuke-crosshair' });
    ui.crosshair.appendChild(svgNode('circle', { class: 'nuke-blast', r: NUKE_RADIUS }));
    ui.crosshair.appendChild(svgNode('circle', { class: 'nuke-waste', r: WASTE_RADIUS }));
    const label = svgNode('text', { class: 'nuke-label', y: -NUKE_RADIUS - 12, 'text-anchor': 'middle' }, 'NUCLEAR FALL OUT');
    ui.crosshair.appendChild(label);
    ui.layers.fx.appendChild(ui.crosshair);
    paintGhost(ui.mouseX, ui.mouseY);
  }
  if (ui.nukeBtn) paintNukeButton();
}

function paintNukeButton() {
  if (!ui.nukeBtn) return;
  const rig = state.towers.find((tower) => tower.id === 'zeroday') || null;
  const armed = readyRig();
  ui.nukeBtn.hidden = !rig;
  ui.nukeBtn.disabled = Boolean(rig) && !armed; // visible the moment a rig deploys — locked until Tier 6
  if (!rig) return;
  const cd = armed ? (armed.nukeCd || 0) : 0;
  ui.nukeBtn.textContent = ui.nukeAim ? 'CLICK TARGET — ESC CANCELS'
    : !armed ? 'NUKE — RIG TIER 6 REQUIRED'
    : cd > 0 ? `NUKE ${Math.ceil(cd)}s`
    : `NUKE READY — $${NUKE_COST}`;
  ui.nukeBtn.classList.toggle('on', ui.nukeAim);
  ui.nukeBtn.classList.toggle('cd', cd > 0 && !ui.nukeAim);
  ui.nukeBtn.classList.toggle('lock', Boolean(rig) && !armed);
}

function fireNuke(x, y) {
  const rig = readyRig();
  if (!rig || (rig.nukeCd || 0) > 0) { setNukeAim(false); return; }
  if (state.cash < NUKE_COST) { emit('sound', 'alarm'); showToast(`Need $${NUKE_COST} salvage to call the nuke.`); setNukeAim(false); return; }
  state.cash -= NUKE_COST;
  rig.nukeCd = NUKE_COOLDOWN;
  setNukeAim(false);
  // Strike: flat devastation inside the blast ring, then lingering fallout.
  for (const enemy of state.enemies) {
    if (!enemy.alive) continue;
    const [px, py] = posOf(enemy);
    if (Math.hypot(px - x, py - y) <= NUKE_RADIUS) damageEnemy(enemy, NUKE_DAMAGE, { src: 'nuke', friendlyFire: true });
  }
  const node = svgNode('circle', { class: 'fx-waste', cx: x, cy: y, r: WASTE_RADIUS });
  ui.layers.fx.appendChild(node);
  state.wasteZones.push({ x, y, r: WASTE_RADIUS, until: state.clock + WASTE_SECONDS, node });
  emit('nuke', x, y);
  emit('float', x, y - NUKE_RADIUS - 20, 'NUCLEAR FALL OUT', 'core-float');
  emit('sound', 'alarm');
  updateHud();
}

// --- Corpse Blossom abilities --------------------------------------------------------
function bloodPurge(tower) {
  if (trackLevel(tower) < 4) return;
  const lust = tower.lust || 0;
  if (lust <= 0) { emit('sound', 'alarm'); showToast('Blood Lust bar is empty — kills feed it.'); return; }
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
  openTowerPanel(tower);
  updateHud();
}

function bloodScream(tower) {
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
  openTowerPanel(tower);
}

function updateBossBar() {
  const boss = state.enemies.find((enemy) => enemy.alive && enemy.t.boss && !enemy.friendly);
  ui.bossBar.hidden = !boss;
  ui.bossBar.style.display = boss ? '' : 'none';
  if (!boss) return;
  document.querySelector('#boss-name').textContent = `${boss.t.tag} // ${boss.t.name}`;
  document.querySelector('#boss-fill').style.width = `${(boss.hp / boss.maxHp) * 100}%`;
  document.querySelector('#boss-shield').style.width = boss.maxShield ? `${(boss.shield / boss.maxShield) * 25}%` : '0%';
}

// --- Enemy hover tooltip ----------------------------------------------------------------
function ensureTip() {
  if (ui.tip) return;
  ui.tip = document.createElement('div');
  ui.tip.className = 'enemy-tip';
  ui.tip.hidden = true;
  battlefield.appendChild(ui.tip);
}

function showTip(enemy, event) {
  ensureTip();
  ui.tipTarget = enemy;
  const t = enemy.t;
  const armor = t.armor ? `${Math.round(t.armor * 100)}% PLATE` : 'NONE';
  ui.tip.innerHTML = `
    <div class="tip-head"><b>${t.name}</b><span class="tip-tag">${t.tag}</span></div>
    <div class="tip-hp"><div class="tip-hp-track"><div class="tip-hp-fill" style="width:${(enemy.hp / enemy.maxHp) * 100}%"></div></div><span>${Math.ceil(enemy.hp)}/${enemy.maxHp} HP${enemy.shield > 0 ? ` +${Math.ceil(enemy.shield)} SHLD` : ''}</span></div>
    <div class="tip-rows">
      <div><span>SPEED</span><b>${t.speed >= 120 ? 'VERY FAST' : t.speed >= 90 ? 'FAST' : t.speed >= 60 ? 'AVERAGE' : t.speed >= 40 ? 'SLOW' : 'VERY SLOW'}</b></div>
      <div><span>ARMOR</span><b>${armor}</b></div>
      <div><span>CORE DMG</span><b>${leakDamage(enemy)}</b></div>
      <div><span>BOUNTY</span><b>$${t.bounty}</b></div>
    </div>
    <p class="tip-ability">${t.ability}</p>`;
  ui.tip.hidden = false;
  moveTip(event);
}

function moveTip(event) {
  if (!ui.tip || ui.tip.hidden) return;
  const pad = 16;
  const x = event ? event.clientX : ui.mouseX || 100;
  const y = event ? event.clientY : ui.mouseY || 100;
  ui.mouseX = x;
  ui.mouseY = y;
  const wide = ui.tip.offsetWidth || 240;
  ui.tip.style.left = `${Math.min(window.innerWidth - wide - 10, x + pad)}px`;
  ui.tip.style.top = `${Math.max(10, y - ui.tip.offsetHeight - pad)}px`;
}

function hideTip(enemy) {
  if (!ui.tip || (enemy && ui.tipTarget !== enemy)) return;
  ui.tip.hidden = true;
  ui.tipTarget = null;
}

// Friendly intel — Blossom risen copies and strike drones get their own readout.
// GOLDEN VETERANS: the card is trimmed to what a commander actually needs —
// name, tag and the live hull. No allegiance chatter, no payload rows.
function showSummonTip(summon, event) {
  ensureTip();
  ui.tipTarget = summon;
  const t = summon.t;
  const soul = summon.key === 'soul';
  const drone = summon.key === 'drone';
  const head = soul ? 'VENGEFUL SOUL' : drone ? 'STRIKE DRONE' : `RISEN ${t.name}`;
  const tag = soul ? 'GRAVE WARDEN CHOIR' : drone ? 'DRONE SPAWNER PAYLOAD' : 'CORPSE BLOSSOM SPAWN';
  ui.tip.innerHTML = `
    <div class="tip-head summon"><b>${head}</b><span class="tip-tag">${tag}</span></div>
    <div class="tip-hp"><div class="tip-hp-track"><div class="tip-hp-fill" style="width:${(summon.hp / summon.maxHp) * 100}%"></div></div><span>${Math.ceil(summon.hp)}/${summon.maxHp} HP</span></div>`;
  ui.tip.hidden = false;
  moveTip(event);
}

// --- Banners ---------------------------------------------------------------------------
function banner(title, sub, cls) {
  state.syncTitle = String(title || '');
  state.syncSeq = (state.syncSeq || 0) + 1;
  if (!ui.banner) {
    ui.banner = document.createElement('div');
    ui.banner.className = 'wave-banner';
    battlefield.appendChild(ui.banner);
  }
  ui.banner.className = `wave-banner ${cls || 'banner-wave'}`;
  ui.banner.innerHTML = `<strong>${title}</strong>${sub ? `<span>${sub}</span>` : ''}`;
  void ui.banner.offsetWidth;
  ui.banner.classList.add('show');
  clearTimeout(ui.bannerTimer);
  ui.bannerTimer = setTimeout(() => ui.banner.classList.remove('show'), 2100);
}

// --- Mode vote (EASY + MEDIUM live, the rest coming soon) --------------------------------
const MODES = [
  { id: 'easy', label: 'EASY', sub: '20 WAVES // 6 BOSS WAVES // GENTLER BOSSES', ready: true },
  { id: 'medium', label: 'MEDIUM', sub: '30 WAVES // DENSER, FASTER, ANGRIER', ready: true },
  { id: 'hard', label: 'HARD', sub: '30 WAVES // COMPOUNDING HULLS · +15% SPEED · HELLFIRE SURGES // BOSS LEAKS NEAR-KILL THE CORE', ready: true },
  { id: 'insane', label: 'INSANE', sub: '30 WAVES // DOUBLED: ~35X HULL · +22% SPEED · 4 NEW ELITE CLASSES // BOSS LEAKS NEAR-CORE YOU', ready: true },
  { id: 'cbz', label: 'CBZ', sub: 'PHASE GRID PROTOCOL', ready: false },
];

function showVote(context) {
  closeVote();
  state.mode = 'vote';
  const panel = document.createElement('div');
  panel.className = 'vote-overlay';
  panel.innerHTML = `
    <div class="vote-card">
      <div class="eyebrow">// SOLO DEPLOYMENT</div>
      <h2>CHOOSE COMBAT PROTOCOL</h2>
      <div class="mode-grid">${MODES.map((mode) => `
        <button class="mode-card${mode.ready ? '' : ' locked'}" type="button" data-mode="${mode.id}" ${mode.ready ? '' : 'disabled'}>
          <span class="mode-stamp">${mode.ready ? 'READY' : 'COMING SOON'}</span>
          <b>${mode.label}</b><small>${mode.sub}</small>
        </button>`).join('')}</div>
      <p class="vote-state" id="vote-state">Select a protocol to deploy.</p>
      <button class="inline-button" id="vote-cancel" type="button">CANCEL</button>
    </div>`;
  battlefield.appendChild(panel);
  ui.votePanel = panel;
  panel.querySelector('#vote-cancel').addEventListener('click', () => { closeVote(); restoreRecon(); });
  panel.querySelectorAll('.mode-card:not(.locked)').forEach((card) => card.addEventListener('click', () => castVote(card.dataset.mode)));
  emit('sound');
}

function castVote(mode) {
  emit('sound');
  state.myVote = mode;
  launchCombat(mode);
}

function closeVote() {
  if (ui.votePanel) { ui.votePanel.remove(); ui.votePanel = null; }
}

// --- Mission lifecycle ------------------------------------------------------------------
function startMission(map, skipVote = false, forcedProtocol = null) {
  if (state.mode !== 'idle' && state.mode !== 'over') return;
  state.map = map;
  state.mode = 'vote';
  state.protocol = null; // the combat protocol locks in at the vote
  state.speed2x = false;
  state.samplers = buildSamplers(map);
  // Flat point cloud of every lane — placement checks + drone spawn gates use it.
  state.trackPts = state.samplers.flatMap((sampler) => sampler.pts);
  prepMechanics(map, state.samplers);
  state.cash = (debugCash || START_SALVAGE) + (window.CBZPerks && CBZPerks.has('deeppockets') ? 150 : 0);
  state.baseHp = BASE_MAX;
  state.enemies = [];
  state.towers = [];
  state.projectiles = [];
  state.wasteZones = [];
  ui.nukeAim = false;
  state.bonusNc = 0;
  ui.building = null;
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
  ensureLayers();
  ensureHud();
  ensureLoadoutBar();
  ensureTip();
  updateHud();
  setStatus(`COMBAT PROTOCOL // ${map.name}`);
  if (skipVote) launchCombat(forcedProtocol || 'easy');
  else showVote('solo');
}

function launchCombat(mode) {
  closeVote();
  state.protocol = mode;
  if (mode === 'hard' || mode === 'insane' || mode === 'crimson') state.cash = Math.round(state.cash * (mode === 'crimson' ? 0.7 : mode === 'insane' ? 0.65 : 0.8)); // HELL strips 20% of opening salvage, the DOUBLED SPIRAL 35%, and the DAWN 30% — you deploy wounded
  const proto = document.querySelector('#combat-protocol');
  if (proto) proto.textContent = String(mode).toUpperCase();
  state.mode = 'countdown';
  state.countdown = 3.4;
  state.lastCount = 4;
  ui.last = performance.now();
  ui.raf = requestAnimationFrame(tick);
  emit('sound');
}

function restoreRecon() {
  state.mode = 'idle';
  const exit = document.querySelector('#exit-battle');
  exit.textContent = 'EXIT RECON';
  exit.classList.remove('aborting');
  if (ui.deployBtn) ui.deployBtn.hidden = false;
  if (ui.hud) { ui.hud.remove(); ui.hud = null; }
  if (ui.speedBtn) { ui.speedBtn.remove(); ui.speedBtn = null; }
  state.speed2x = false;
  if (ui.nukeBtn) { ui.nukeBtn.remove(); ui.nukeBtn = null; }
  ui.nukeAim = false;
  if (ui.crosshair) { ui.crosshair.remove(); ui.crosshair = null; }
  state.wasteZones = [];
  if (ui.bossBar) ui.bossBar.hidden = true;
  if (ui.endPanel) { ui.endPanel.remove(); ui.endPanel = null; }
  setBuilding(null);
  closeTowerPanel();
  if (ui.bar) { ui.bar.remove(); ui.bar = null; }
  if (ui.layers) { ui.layers.enemies.remove(); ui.layers.fx.remove(); if (ui.layers.towers) ui.layers.towers.remove(); ui.layers = null; }
  state.enemies = [];
  state.towers = [];
  state.projectiles = [];
  state.bonusNc = 0;
  setStatus(myName ? `MAP RECON // ${state.map ? state.map.name : ''}` : 'MENU SYSTEM READY');
}

function paintPayout(panel, data) {
  const box = panel.querySelector('#end-rewards');
  if (!box) return;
  if (!data) {
    box.innerHTML = '<div class="payout-offline">NEXUS LINK OFFLINE — REWARDS NOT BANKED</div>';
    box.classList.add('on');
    return;
  }
  const r = data.rewards;
  const rows = [
    `<div class="payout-row payout-nc"><span>NEXUS COINS</span><b>+${r.nc} NC</b></div>`,
    r.bt > 0 ? `<div class="payout-row payout-bt"><span>BREACH TOKENS</span><b>+${r.bt} BT</b></div>` : '',
    r.firstClear ? '<div class="payout-row payout-bt"><span>FIRST CLEARANCE BONUS</span><b>+5 BT</b></div>' : '',
    ...(data.unlocked || []).map((id) => `<div class="payout-row payout-ach"><span>ACHIEVEMENT UNLOCKED</span><b>${escapeHtml(String(id).toUpperCase())}</b></div>`),
    ...(r.golden || []).map((mapId) => `<div class="payout-row payout-gold"><span>GOLDEN SEAL — ${escapeHtml(String(mapId).toUpperCase())}</span><b>+2,500 NC · +10 BT</b></div>`),
    r.paragon ? '<div class="payout-row payout-gold"><span>PARAGON DECRYPTED</span><b>ALL SECTORS GOLDEN</b></div>' : '',
    r.bonusNc > 0 ? `<div class="payout-row payout-nc"><span>SCRAP FOUNDRY YIELD</span><b>+${r.bonusNc} NC</b></div>` : '',
    `<div class="payout-row payout-xp"><span>COMBAT XP</span><b>+${r.xp} XP</b></div>`,
    r.levelsGained > 0 ? `<div class="payout-row payout-lvl"><span>CLEARANCE LEVEL UP</span><b>LV ${data.profile.level} ▲${r.levelsGained > 1 ? ` ×${r.levelsGained}` : ''}</b></div>` : '',
  ];
  box.innerHTML = `<div class="payout-head">// NEXUS TRANSFER COMPLETE</div>${rows.join('')}`;
  box.classList.add('on');
}

function endMission(win, fromSync = false) {
  state.mode = 'over';
  cancelAnimationFrame(ui.raf);
  if (coopHost()) { const bridge = window.CBZCoopBridge; if (bridge && bridge.send) bridge.send({ k: 'over', win }); }
  closeVote();
  hideTip();
  const panel = document.createElement('div');
  panel.className = `mission-end ${win ? 'win' : 'lose'}`;
  // Event gamemodes (the Crimson Dawn + every future event map) never offer a
  // retry — the redeploy path relaunches the standard protocol vote, which can
  // never re-arm an event run. The debrief offers one clean exit: RETURN TO BAY.
  const eventMode = Boolean((state.map && state.map.event) || state.protocol === 'crimson');
  panel.innerHTML = `
    <div class="end-card">
      <div class="eyebrow">${win ? '// PROTOCOL COMPLETE' : '// CORE LOST'}</div>
      <h2>${win ? 'SECTOR CLEARED' : 'CORE BREACHED'}</h2>
      <div class="end-stats">
        <div><span>OUTCOME</span><b>${win ? `ALL ${missionWaves().length} WAVES REPELLED` : `FELL ON WAVE ${state.waveIndex + 1}`}</b></div>
        <div><span>ELIMINATIONS</span><b>${state.kills}</b></div>
        <div><span>SALVAGE EARNED</span><b>$${state.earned}</b></div>
        <div><span>BASE INTEGRITY</span><b>${Math.round(state.baseHp)}/${BASE_MAX}</b></div>
        <div><span>MISSION TIME</span><b>${Math.floor(state.clock / 60)}:${String(Math.floor(state.clock % 60)).padStart(2, '0')}</b></div>
      </div>
      <div class="end-rewards" id="end-rewards"></div>
      <div class="end-actions">
        ${eventMode ? '' : `<button class="inline-button" id="end-redeploy" type="button">${win ? 'RE-DEPLOY' : 'RETRY'}</button>`}
        <button class="inline-button" id="end-bay" type="button">RETURN TO BAY</button>
      </div>
    </div>`;
  battlefield.appendChild(panel);
  ui.endPanel = panel;
  if (window.CBZShop) {
    CBZShop.submitMission({
      result: win ? 'win' : 'loss',
      wavesCleared: win ? missionWaves().length : state.waveIndex + 1,
      bossesKilled: state.bossesKilled,
      flawless: Boolean(win && state.baseHp >= BASE_MAX),
      bonusNc: state.bonusNc,
      difficulty: state.protocol || 'easy',
      map: state.map ? state.map.id : '',
    }).then((data) => paintPayout(panel, data));
  }
  if (!eventMode) panel.querySelector('#end-redeploy').addEventListener('click', () => { panel.remove(); ui.endPanel = null; resetBoard(); startMission(state.map); });
  panel.querySelector('#end-bay').addEventListener('click', () => { resetBoard(); restoreRecon(); openMenu('play'); });
  notifyRoomEnded();
  emit('banner', win ? 'SECTOR CLEARED' : 'CORE BREACHED', win ? '// VICTORY TOKEN EARNED' : '// EVACUATE', win ? 'banner-green' : 'banner-red');
  emit('sound');
}

function resetBoard() {
  if (ui.layers) { ui.layers.enemies.remove(); ui.layers.fx.remove(); }
  state.enemies = [];
  ensureLayers();
}

function ensureLayers() {
  board.querySelectorAll('.layer-enemies, .layer-fx, .layer-towers, .layer-ghost').forEach((layer) => layer.remove());
  const towers = svgNode('g', { class: 'layer-towers' });
  const enemies = svgNode('g', { class: 'layer-enemies' });
  const fx = svgNode('g', { class: 'layer-fx' });
  board.appendChild(towers);
  board.appendChild(enemies);
  board.appendChild(fx);
  ui.layers = { towers, enemies, fx, ghost: null };
  ui.ghost = null;
}

function abort() {
  if (state.mode === 'idle') return;
  cancelAnimationFrame(ui.raf);
  closeVote();
  if (ui.endPanel) { ui.endPanel.remove(); ui.endPanel = null; }
  if (ui.tip) ui.tip.hidden = true;
  restoreRecon();
}

// --- Deployment loadout bar (the 5 bays you brought) -----------------------------------
function ensureLoadoutBar() {
  if (ui.bar) ui.bar.remove();
  const shop = window.CBZShop;
  const loadout = shop && shop.loadout ? shop.loadout() : [];
  const bar = document.createElement('div');
  bar.className = 'loadout-bar';
  const slots = [0, 1, 2, 3, 4].map((index) => {
    const entry = loadout[index];
    if (!entry) return `<div class="lo-slot lo-empty"><span class="lo-key">${index + 1}</span><b>EMPTY BAY</b><small>EQUIP IN NEXUS SHOP</small></div>`;
    const art = window.CBZShop && CBZShop.artHtml ? CBZShop.artHtml(entry) : '';
    return `<button class="lo-slot" type="button" data-tower="${entry.id}"><span class="lo-key">${index + 1}</span><span class="lo-icon cat-${entry.cat}">${art || entry.icon}</span><b>${entry.name}</b><span class="lo-cost">$${entry.cost}</span></button>`;
  }).join('');
  bar.innerHTML = `
    <div class="lo-head"><span>// DEPLOYMENT LOADOUT</span><b>${loadout.length}/5 BAYS ARMED</b></div>
    <div class="lo-slots">${slots}</div>
    <div class="lo-hint">PICK A BAY (1-5) → CLICK THE GRID TO DEPLOY · HEX PADS = ANTI-AIR · CLICK A DEPLOYED UNIT → UPGRADE LADDER · RIGHT-CLICK / ESC TO STOP</div>`;
  battlefield.appendChild(bar);
  ui.bar = bar;
  bar.addEventListener('click', (event) => {
    const slot = event.target.closest('.lo-slot[data-tower]');
    if (!slot) return;
    toggleBuild(slot.dataset.tower);
  });
}

function refreshBarAfford() {
  if (!ui.bar) return;
  ui.bar.querySelectorAll('.lo-slot[data-tower]').forEach((slot) => {
    const entry = window.CBZShop && CBZShop.TOWERS.find((item) => item.id === slot.dataset.tower);
    slot.classList.toggle('poor', Boolean(entry && state.cash < entry.cost));
  });
  const head = ui.bar.querySelector('.lo-head b');
  if (head) head.textContent = `${state.towers.length}/${towerLimit()} DEPLOYED`;
}

function refreshPanelAfford() {
  if (!ui.towerPanel || !ui.panelTower) return;
  const tower = ui.panelTower;
  const tiers = towerTrack(tower);
  const lvl = trackLevel(tower);
  const next = tiers[lvl];
  ui.towerPanel.querySelectorAll('.tp-buy').forEach((button) => {
    const index = Number(button.dataset.tier);
    if (Number.isNaN(index) || index !== lvl) { button.disabled = true; return; }
    button.disabled = Boolean(next) && state.cash < next.cost;
  });
}

function buildingAllowed() {
  return state.mode === 'countdown' || state.mode === 'waves';
}

function toggleBuild(id) {
  if (!buildingAllowed()) return;
  if (ui.building && ui.building.id === id) { setBuilding(null); return; }
  const entry = window.CBZShop && CBZShop.TOWERS.find((item) => item.id === id);
  if (!entry) return;
  const limit = towerLimit();
  if (state.towers.length >= limit) { emit('sound', 'alarm'); showToast(`Command grid saturated — ${limit} units max at ${window.CBZ_ROOM_PLAYERS || 1} commander(s).`); return; }
  if (limitReached(entry)) {
    emit('sound', 'alarm');
    showToast(limitToast(entry));
    return;
  }
  if (state.cash < entry.cost) { emit('sound', 'alarm'); showToast(`Need $${entry.cost} salvage to deploy ${entry.name}.`); return; }
  setBuilding(entry);
}

function setBuilding(entry) {
  ui.building = entry || null;
  board.classList.toggle('placing', Boolean(ui.building));
  closeTowerPanel();
  if (ui.bar) {
    ui.bar.querySelectorAll('.lo-slot[data-tower]').forEach((slot) => {
      slot.classList.toggle('on', Boolean(ui.building) && slot.dataset.tower === ui.building.id);
    });
  }
  if (ui.building) {
    ensureGhost();
    paintGhost(ui.mouseX, ui.mouseY);
  } else if (ui.ghost) {
    ui.ghost.remove();
    ui.ghost = null;
  }
  emit('sound', 'hover');
}

// --- Placement engine: anywhere on the grid, clearance boxes enforce spacing -----------
function canPlace(x, y) {
  if (x < FOOT_HALF || x > 1000 - FOOT_HALF || y < FOOT_HALF || y > 600 - FOOT_HALF) return { ok: false, reason: 'OUT OF BOUNDS' };
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
function padAt(x, y) {
  return ((state.map && state.map.pads) || []).find(([px, py]) => Math.hypot(px - x, py - y) <= PAD_SNAP) || null;
}

function boardPoint(event) {
  const point = board.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  const ctm = board.getScreenCTM();
  if (!ctm) return [0, 0];
  const mapped = point.matrixTransform(ctm.inverse());
  return [mapped.x, mapped.y];
}

function toScreen(x, y) {
  const rect = board.getBoundingClientRect();
  const scale = Math.min(rect.width / 1000, rect.height / 600);
  const offsetX = (rect.width - 1000 * scale) / 2;
  const offsetY = (rect.height - 600 * scale) / 2;
  return [rect.left + offsetX + x * scale, rect.top + offsetY + y * scale];
}

function ensureGhost() {
  if (!ui.layers || !ui.building) return;
  if (ui.ghost && ui.ghostEntry === ui.building) return;
  if (ui.ghost) { ui.ghost.remove(); ui.ghost = null; }
  if (!ui.layers.ghost) {
    const ghost = svgNode('g', { class: 'layer-ghost' });
    board.appendChild(ghost);
    ui.layers.ghost = ghost;
  }
  const entry = ui.building;
  const rng = entry.stats.rng >= 999 ? 300 : entry.stats.rng;
  const g = svgNode('g', { class: 'tw-ghost' });
  g.appendChild(svgNode('circle', { class: 'tw-range', r: rng }));
  g.appendChild(svgNode('rect', { class: 'tw-footprint', x: -FOOT_HALF, y: -FOOT_HALF, width: FOOT_HALF * 2, height: FOOT_HALF * 2 }));
  g.appendChild(svgNode('polygon', { class: 'tw-base', points: hexPoints(0, 0, 16) }));
  g.appendChild(svgNode('circle', { class: 'tw-ped', r: 9 }));
  const head = svgNode('g', { class: 'tw-head' });
  head.appendChild(svgNode('rect', { class: 'tw-barrel', x: 4, y: -2.5, width: 16, height: 5 }));
  head.appendChild(svgNode('circle', { class: 'tw-hub', r: 4.5 }));
  g.appendChild(head);
  const note = svgNode('text', { class: 'tw-ghost-note', y: -34, 'text-anchor': 'middle' }, entry.name);
  g.appendChild(note);
  g.appendChild(svgNode('text', { class: 'tw-ghost-reason', y: 44, 'text-anchor': 'middle' }, ''));
  ui.layers.ghost.appendChild(g);
  ui.ghost = g;
  ui.ghostEntry = entry;
}

function paintGhost(x, y) {
  if (!ui.ghost || !ui.building) return;
  const verdict = canPlace(x, y);
  const broke = state.cash < ui.building.cost;
  const ok = verdict.ok && !broke;
  ui.ghost.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
  ui.ghost.classList.toggle('bad', !ok);
  ui.ghost.classList.toggle('off', !ui.mouseOn);
  const reason = ui.ghost.querySelector('.tw-ghost-reason');
  if (reason) {
    if (broke) reason.textContent = `NEED $${ui.building.cost} SALVAGE`;
    else if (verdict.ok && padAt(x, y)) reason.textContent = 'AA PAD — THIS UNIT CAN HIT FLYERS';
    else reason.textContent = verdict.reason;
  }
}

function rejectPlace(x, y, reason) {
  emit('float', x, y - 20, `✕ ${reason}`, 'block-float');
  emit('sound', 'alarm');
}

function placeTower(entry, x, y) {
  if (state.towers.length >= towerLimit()) { emit('sound', 'alarm'); showToast(`Command grid saturated — ${towerLimit()} units max.`); return false; }
  if (limitReached(entry)) {
    emit('sound', 'alarm');
    showToast(limitToast(entry));
    return false;
  }
  if (state.cash < entry.cost) { emit('sound', 'alarm'); showToast(`Need $${entry.cost} salvage to deploy ${entry.name}.`); return false; }
  state.cash -= entry.cost;
  const tower = { uid: ++state.tidSeq, id: entry.id, entry, x, y, cd: 0.35, boost: 1, lvl: 0 };
  const node = makeTowerView(tower).node;
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
    node.classList.add('tw-on-pad');
    const padNode = document.querySelector(`[data-pad="${pad[0]},${pad[1]}"]`);
    if (padNode) padNode.classList.add('occupied');
    emit('float', x, y - 46, 'AA PAD LINKED', 'aa-float');
  }
  state.towers.push(tower);
  node.classList.add('placed');
  setTimeout(() => node.classList.remove('placed'), 620);
  emit('float', x, y - 34, `-$${entry.cost}`, 'cash-float');
  emit('sound');
  updateHud();
  return true;
}

function towerNode(entry, x, y) {
  const g = svgNode('g', { class: `tower tw-${entry.cat} tw-${entry.id}` });
  const rng = entry.stats.rng >= 999 ? 300 : entry.stats.rng;
  g.appendChild(svgNode('circle', { class: 'tw-range', r: rng }));
  g.appendChild(svgNode('rect', { class: 'tw-footprint', x: -FOOT_HALF, y: -FOOT_HALF, width: FOOT_HALF * 2, height: FOOT_HALF * 2 }));
  // Chassis keeps CSS placement animation away from this group's position transform.
  const chassis = svgNode('g', { class: 'tw-chassis' });
  chassis.appendChild(svgNode('polygon', { class: 'tw-base', points: hexPoints(0, 0, 16) }));
  chassis.appendChild(svgNode('circle', { class: 'tw-ped', r: 9 }));
  if (entry.id === 'dawnbreaker') {
    // CRIMSON RELIC rig: a burning corona ring and a warm solar under-glow set
    // the dawn-forged lance apart from every production chassis on the grid.
    chassis.appendChild(svgNode('circle', { class: 'tw-sunglow', r: 15 }));
    chassis.appendChild(svgNode('circle', { class: 'tw-corona', r: 13.5 }));
    chassis.appendChild(svgNode('circle', { class: 'tw-corona rev', r: 10.5 }));
  }
  const head = svgNode('g', { class: 'tw-head' });
  head.appendChild(svgNode('rect', { class: 'tw-barrel', x: 4, y: -2.5, width: 16, height: 5 }));
  head.appendChild(svgNode('circle', { class: 'tw-hub', r: 4.5 }));
  if (entry.id === 'dawnbreaker') {
    // The muzzle carries a miniature sun — the lance ends in a disc of dawn.
    head.appendChild(svgNode('circle', { class: 'tw-muzzle', cx: 21.5, cy: 0, r: 3.4 }));
    head.appendChild(svgNode('circle', { class: 'tw-suncore', r: 5.6 }));
  }
  // Per-kind field kit: every chassis gets its own silhouette on the grid —
  // drums, dishes, petals, bells, rails and halos so no two rigs read alike.
  kindKit(entry, chassis, head);
  chassis.appendChild(head);
  g.appendChild(chassis);
  g.appendChild(svgNode('text', { class: 'tw-tag', y: -28, 'text-anchor': 'middle' }, entry.name.split(' ')[0]));
  g.setAttribute('transform', `translate(${x} ${y})`);
  return g;
}

// --- Per-kind field kits: one silhouette per chassis -----------------------------
// Rotating pieces go on the head (aim with the gun), static ornaments on the
// chassis. Combined with the per-kind paint rules in styles.css, every tower
// on the grid reads as its own machine.
function kindKit(entry, chassis, head) {
  switch (entry.id) {
    case 'sentinel':
      chassis.appendChild(svgNode('rect', { class: 'tw-kit-crate', x: -14, y: 7, width: 9, height: 6 }));
      head.appendChild(svgNode('rect', { class: 'tw-kit-vent', x: 8, y: -4, width: 3, height: 8 }));
      break;
    case 'lazermortar':
      chassis.appendChild(svgNode('rect', { class: 'tw-kit-plate', x: -12, y: 7, width: 24, height: 5 }));
      head.appendChild(svgNode('rect', { class: 'tw-kit-tube', x: 2, y: -4, width: 15, height: 8 }));
      head.appendChild(svgNode('circle', { class: 'tw-kit-mouth', cx: 19, cy: 0, r: 3.4 }));
      break;
    case 'shotgunner':
      chassis.appendChild(svgNode('rect', { class: 'tw-kit-plate', x: -11, y: 8, width: 22, height: 4 }));
      head.appendChild(svgNode('rect', { class: 'tw-kit-tube', x: 3, y: -5.2, width: 14, height: 3.4 }));
      head.appendChild(svgNode('rect', { class: 'tw-kit-tube', x: 3, y: 1.8, width: 14, height: 3.4 }));
      break;
    case 'sniper':
      head.appendChild(svgNode('rect', { class: 'tw-kit-rail', x: 4, y: -1.6, width: 24, height: 3.2 }));
      head.appendChild(svgNode('circle', { class: 'tw-kit-scope', cx: 1, cy: -5, r: 2.6 }));
      break;
    case 'shredder':
      head.appendChild(svgNode('circle', { class: 'tw-kit-drum', r: 7 }));
      head.appendChild(svgNode('rect', { class: 'tw-kit-tooth', x: -8, y: -1, width: 16, height: 2 }));
      head.appendChild(svgNode('rect', { class: 'tw-kit-tooth', x: -1, y: -8, width: 2, height: 16 }));
      break;
    case 'virus':
      head.appendChild(svgNode('line', { class: 'tw-kit-blade', x1: 3, y1: 0, x2: 21, y2: -7 }));
      head.appendChild(svgNode('line', { class: 'tw-kit-blade', x1: 3, y1: 0, x2: 19, y2: 9 }));
      head.appendChild(svgNode('line', { class: 'tw-kit-blade', x1: 3, y1: 0, x2: 11, y2: 15 }));
      head.appendChild(svgNode('circle', { class: 'tw-kit-pustule', r: 3 }));
      break;
    case 'dronespawner':
      chassis.appendChild(svgNode('rect', { class: 'tw-kit-rack', x: -11, y: 8, width: 22, height: 5 }));
      chassis.appendChild(svgNode('circle', { class: 'tw-kit-dronebit', cx: -5, cy: 10.5, r: 1.6 }));
      chassis.appendChild(svgNode('circle', { class: 'tw-kit-dronebit', cx: 5, cy: 10.5, r: 1.6 }));
      head.appendChild(svgNode('rect', { class: 'tw-kit-tube', x: 2, y: -3, width: 12, height: 6 }));
      break;
    case 'missilesilo':
      chassis.appendChild(svgNode('rect', { class: 'tw-kit-silo', x: -9, y: -9, width: 18, height: 18 }));
      chassis.appendChild(svgNode('circle', { class: 'tw-kit-hatch', r: 4.5 }));
      head.appendChild(svgNode('line', { class: 'tw-kit-mast', x1: 0, y1: 0, x2: 0, y2: -12 }));
      break;
    case 'zeroday':
      chassis.appendChild(svgNode('line', { class: 'tw-kit-mast', x1: -8, y1: 4, x2: -8, y2: -10 }));
      chassis.appendChild(svgNode('circle', { class: 'tw-kit-dish', cx: -8, cy: -12, r: 3.4 }));
      head.appendChild(svgNode('rect', { class: 'tw-kit-crate', x: 4, y: -3, width: 9, height: 6 }));
      break;
    case 'corpseblossom':
      for (let i = 0; i < 6; i += 1) {
        chassis.appendChild(svgNode('ellipse', { class: 'tw-kit-petal', cx: 0, cy: -11.5, rx: 3.6, ry: 7.5, transform: `rotate(${i * 60})` }));
      }
      chassis.appendChild(svgNode('circle', { class: 'tw-kit-heart', r: 4 }));
      break;
    case 'gravewarden':
      chassis.appendChild(svgNode('circle', { class: 'tw-kit-cage', r: 9.5 }));
      chassis.appendChild(svgNode('path', { class: 'tw-kit-bell', d: 'M-4.5 5 L-2.5 -6 L2.5 -6 L4.5 5 Z' }));
      chassis.appendChild(svgNode('circle', { class: 'tw-kit-clapper', cy: 6.5, r: 1.6 }));
      break;
    case 'executioner':
      head.appendChild(svgNode('rect', { class: 'tw-kit-rail', x: 4, y: -1.5, width: 21, height: 3 }));
      head.appendChild(svgNode('rect', { class: 'tw-kit-brake', x: 23, y: -4, width: 2, height: 8 }));
      head.appendChild(svgNode('rect', { class: 'tw-kit-brake', x: 19, y: -4, width: 2, height: 8 }));
      chassis.appendChild(svgNode('circle', { class: 'tw-kit-sight', cx: -7, cy: -7, r: 1.4 }));
      break;
    case 'sparkcoil':
      head.appendChild(svgNode('circle', { class: 'tw-kit-coil', cx: 8, cy: 0, r: 2.4 }));
      head.appendChild(svgNode('circle', { class: 'tw-kit-coil', cx: 12.5, cy: 0, r: 3.6 }));
      head.appendChild(svgNode('circle', { class: 'tw-kit-coil', cx: 17.5, cy: 0, r: 4.8 }));
      head.appendChild(svgNode('circle', { class: 'tw-kit-sparktip', cx: 21, cy: 0, r: 1.8 }));
      break;
    case 'flakpost':
      head.appendChild(svgNode('rect', { class: 'tw-kit-tube', x: 3, y: -4.6, width: 11, height: 3 }));
      head.appendChild(svgNode('rect', { class: 'tw-kit-tube', x: 3, y: 1.6, width: 11, height: 3 }));
      chassis.appendChild(svgNode('path', { class: 'tw-kit-fin', d: 'M-4 -8 L-9 -13 L-11 -9 Z' }));
      break;
    case 'tarsprayer':
      chassis.appendChild(svgNode('circle', { class: 'tw-kit-vat', cx: -6, cy: 5, r: 5.5 }));
      head.appendChild(svgNode('rect', { class: 'tw-kit-nozzle', x: 3, y: -3, width: 10, height: 6 }));
      head.appendChild(svgNode('circle', { class: 'tw-kit-drip', cx: 15.5, cy: 0, r: 2 }));
      break;
    case 'relay':
      chassis.appendChild(svgNode('line', { class: 'tw-kit-mast', x1: 0, y1: 2, x2: 0, y2: -14 }));
      chassis.appendChild(svgNode('circle', { class: 'tw-kit-halo', cy: -17, r: 4.5 }));
      chassis.appendChild(svgNode('circle', { class: 'tw-kit-halo wide', cy: -17, r: 8 }));
      chassis.appendChild(svgNode('circle', { class: 'tw-kit-beacon', cy: -17, r: 1.8 }));
      break;
    case 'veteran':
      // THE VETERAN: ammo crate on the deck, tri-rail clip on the head.
      chassis.appendChild(svgNode('rect', { class: 'tw-kit-ammo', x: -13, y: 7, width: 10, height: 6 }));
      chassis.appendChild(svgNode('rect', { class: 'tw-kit-ammo tw-kit-ammo-2', x: 3, y: 8, width: 8, height: 5 }));
      head.appendChild(svgNode('rect', { class: 'tw-kit-trirail', x: 2, y: -4.5, width: 18, height: 2 }));
      head.appendChild(svgNode('rect', { class: 'tw-kit-trirail', x: 2, y: 2.5, width: 18, height: 2 }));
      head.appendChild(svgNode('circle', { class: 'tw-kit-beret', cx: -1, cy: -6, r: 2.2 }));
      break;
    case 'warbonds':
      // WAR BONDS: a vault drum with a coin slot and a ledger plate.
      chassis.appendChild(svgNode('circle', { class: 'tw-kit-vault', r: 8 }));
      chassis.appendChild(svgNode('rect', { class: 'tw-kit-slot', x: -4, y: -1.4, width: 8, height: 2.8 }));
      head.appendChild(svgNode('rect', { class: 'tw-kit-ledger', x: 3, y: -5, width: 13, height: 10 }));
      head.appendChild(svgNode('line', { class: 'tw-kit-ledline', x1: 6, y1: -1.5, x2: 13, y2: -1.5 }));
      head.appendChild(svgNode('line', { class: 'tw-kit-ledline', x1: 6, y1: 1.5, x2: 13, y2: 1.5 }));
      break;
    case 'wardrums':
      // WAR DRUMS: a deep war drum with two beating sticks on the head.
      chassis.appendChild(svgNode('circle', { class: 'tw-kit-drumhead', r: 9 }));
      chassis.appendChild(svgNode('circle', { class: 'tw-kit-drumhub', r: 2.6 }));
      chassis.appendChild(svgNode('rect', { class: 'tw-kit-drumrim', x: -10, y: 6, width: 20, height: 4 }));
      head.appendChild(svgNode('line', { class: 'tw-kit-stick', x1: 4, y1: -8, x2: 16, y2: -3 }));
      head.appendChild(svgNode('line', { class: 'tw-kit-stick s2', x1: 4, y1: 8, x2: 16, y2: 3 }));
      break;
    case 'deathwarrant':
      // THE DEATHWARRANT: an obsidian verdict spire with a lock diamond.
      chassis.appendChild(svgNode('polygon', { class: 'tw-kit-spire', points: '0,-18 7,-2 0,8 -7,-2' }));
      chassis.appendChild(svgNode('polygon', { class: 'tw-kit-lockgem', points: hexPoints(0, -4, 3.4) }));
      head.appendChild(svgNode('polygon', { class: 'tw-kit-verdict', points: '18,0 13,-4 8,0 13,4' }));
      head.appendChild(svgNode('rect', { class: 'tw-kit-verdictbar', x: 2, y: -1.4, width: 12, height: 2.8 }));
      break;
    case 'paragon':
      // PARAGON: a gilded laurel halo around a golden barrel.
      chassis.appendChild(svgNode('circle', { class: 'tw-kit-laurel', r: 12 }));
      chassis.appendChild(svgNode('circle', { class: 'tw-kit-laurel inner', r: 9 }));
      chassis.appendChild(svgNode('circle', { class: 'tw-kit-crown', cy: -13, r: 2.4 }));
      head.appendChild(svgNode('rect', { class: 'tw-kit-goldbarrel', x: 4, y: -2, width: 17, height: 4 }));
      head.appendChild(svgNode('circle', { class: 'tw-kit-goldtip', cx: 22, cy: 0, r: 2.2 }));
      break;
    default:
      break; // dawnbreaker rides its own forge-built rig above
  }
}

// --- Upgrade ladder: one linear track per chassis, bought with salvage -------------
// Tiers come from the blueprint catalog (entry.track). Every tier's `sets` are
// absolute stat values applied on install; levels live on the placed unit only —
// scrapped when it is sold, wiped when the mission ends.
function trackLevel(tower) {
  return tower.lvl || 0;
}

function towerTrack(tower) {
  return tower.entry.track || [];
}

function effStats(tower) {
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

function trackInvested(tower) {
  return tower.entry.cost + towerTrack(tower).slice(0, trackLevel(tower)).reduce((sum, tier) => sum + tier.cost, 0);
}

function paintTowerRange(tower) {
  const es = effStats(tower);
  const r = es.infinite ? 300 : Math.round(es.rng * relayMult(tower, 'range'));
  const node = towerNodeOf(tower);
  if (!node) return;
  const range = node.querySelector('.tw-range');
  if (range) range.setAttribute('r', r);
  const aura = node.querySelector('.tw-aura');
  if (aura) aura.setAttribute('r', r);
}

// --- Command Relay: the network pylon buffs every tower inside its ring ------------
// kind 'dmg' multiplies fire damage, 'rate' multiplies fire rate, 'range'
// multiplies acquisition + painted reach. The relay itself never fires.
function relayMult(tower, kind) {
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
function castRally(tower) {
  if (trackLevel(tower) < 5) return;
  const es = effStats(tower);
  if ((tower.rallyCd || 0) > 0) { emit('sound', 'alarm'); showToast(`Rally recharging — ${Math.ceil(tower.rallyCd)}s left.`); return; }
  const cost = es.rallyCost || 600;
  if (state.cash < cost) { emit('sound', 'alarm'); showToast(`Need $${cost} salvage for RALLY CRY.`); return; }
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
  openTowerPanel(tower);
  updateHud();
}

// --- Grave Warden Tier 6: the SOUL CHOIR -------------------------------------------
// The Warden reaches into the core and raises a vengeful soul on the lane of
// the most advanced hostile. Like a Blossom risen it marches the track and
// detonates on the first hostile it touches — but its hull is forged from the
// yard itself: 10 x TOLL CHARGES (min 75). $700 a soul, 35s between hymns.
function launchWardenSoul(tower) {
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

function castSoul(tower) {
  if (trackLevel(tower) < 6) return;
  const es = effStats(tower);
  if ((tower.soulCd || 0) > 0) { emit('sound', 'alarm'); showToast(`The choir rests — ${Math.ceil(tower.soulCd)}s until the next hymn.`); return; }
  const cost = es.soulCost || 900;
  if (state.cash < cost) { emit('sound', 'alarm'); showToast(`Need $${cost} salvage to raise a soul from the core.`); return; }
  if (!state.enemies.some((enemy) => enemy.alive && !enemy.friendly)) { emit('sound', 'alarm'); showToast('The choir needs an audience — no hostiles on the grid.'); return; }
  state.cash -= cost;
  tower.soulCd = es.soulCd || 45;
  launchWardenSoul(tower);
  emit('sound');
  openTowerPanel(tower);
  updateHud();
}

// --- PARAGON: the golden standard taxes every kill in its ring --------------------
function paragonTithe(x, y) {
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
function tarMult(enemy) {
  if (enemy.t.flying || !enemy.tarT || enemy.tarT <= 0) return 1;
  return 1 - (enemy.tar || 0);
}

function buyTrack(tower) {
  if (state.mode !== 'waves' && state.mode !== 'countdown') return;
  if (coopGuest()) { coopIntent({ a: 'up', t: state.towers.indexOf(tower) }); return; }
  const tiers = towerTrack(tower);
  const lvl = trackLevel(tower);
  if (lvl >= tiers.length) return;
  const tier = tiers[lvl];
  if (state.cash < tier.cost) { emit('sound', 'alarm'); showToast(`Need $${tier.cost} salvage for ${tier.label}.`); return; }
  state.cash -= tier.cost;
  tower.lvl = lvl + 1;
  if (tower.id === 'zeroday' && tower.lvl >= 6) { showToast('NUCLEAR FALL OUT ARMED — the rig can call the strike.'); emit('sound', 'alarm'); }
  paintTowerRange(tower);
  emit('float', tower.x, tower.y - 42, `${tier.label} ONLINE`, 'up-float');
  emit('ring', tower.x, tower.y, 'fx-ring-white');
  emit('sound');
  updateHud();
  openTowerPanel(tower); // re-render the panel with the new tier installed
}

// --- Tower intel panel (stats + field modules + sell) ------------------------------------
function openTowerPanel(tower) {
  closeTowerPanel();
  const entry = tower.entry;
  const es = effStats(tower);
  const refund = Math.floor(trackInvested(tower) * 0.7);
  const fmt = {
    dmg: (v) => String(Math.round(v)),
    rate: (v) => v.toFixed(1),
    rng: (v) => (entry.stats.rng >= 999 ? 'INF' : String(Math.round(v))),
  };
  const pips = (level, max) => Array.from({ length: max }, (unused, i) => `<i class="${i < level ? 'on' : ''}"></i>`).join('');
  const tiers = towerTrack(tower);
  const lvl = trackLevel(tower);
  const rows = tiers.map((tier, index) => {
    const installed = index < lvl;
    const next = index === lvl;
    return `
      <div class="tp-up${installed ? ' maxed' : ''}" data-tier="${index}">
        <div class="tp-up-head"><span>${String(index + 1).padStart(2, '0')} · ${tier.label}</span>${installed ? '<b class="tp-val">ONLINE</b>' : `<span class="tp-info">${tier.info}</span>`}</div>
        <div class="tp-pips">${pips(installed ? 1 : 0, 1)}</div>
        <button class="tp-buy" type="button" data-tier="${index}" ${next ? '' : 'disabled'}>${installed ? 'INSTALLED' : next ? `$${tier.cost}` : 'LOCKED'}</button>
      </div>`;
  }).join('');
  const specials = [];
  if (entry.id === 'corpseblossom') {
    specials.push(`<div class="tp-abil-row"><span>SUMMON HP</span><b>${Math.round((es.summonHp || 0.3) * 100)}%</b></div>`);
    if (trackLevel(tower) >= 4) specials.push(`<div class="tp-abil-row lust"><span>BLOOD LUST</span><b>${tower.lust || 0}</b></div>`);
  }
  if (entry.id === 'dronespawner') {
    specials.push(`<div class="tp-abil-row"><span>STRIKE DRONE</span><b>${Math.round(es.drone || 70)} DMG/HULL</b></div>`);
    specials.push(`<div class="tp-abil-row"><span>NEXT LAUNCH</span><b>${state.mode === 'waves' ? `${Math.ceil(tower.droneCd || 0)}s` : `${Math.round(es.launchEvery || 6)}s CADENCE`}</b></div>`);
  }
  if (entry.id === 'virus' && es.corrupt) specials.push(`<div class="tp-abil-row"><span>CONTAGION</span><b>${es.corrupt}/S · 5S BURN</b></div>`);
  if (entry.id === 'gravewarden') {
    if (es.bell) {
      specials.push(`<div class="tp-abil-row"><span>DEATH TOLL</span><b>${es.bell} DMG · ${es.tollStun || 0.8}s STUN</b></div>`);
      specials.push(`<div class="tp-abil-row"><span>NEXT TOLL</span><b>${state.mode === 'waves' ? `${Math.ceil(tower.bellCd || 0)}s` : `${es.bellEvery || 8}s CADENCE`}</b></div>`);
      specials.push(`<div class="tp-abil-row"><span>TOLL CHARGES</span><b>${tower.tollCharges || 0}</b></div>`);
    }
    if (es.yardSlow) specials.push(`<div class="tp-abil-row"><span>GRAVE YARD</span><b>-${Math.round(es.yardSlow * 100)}% SPEED</b></div>`);
    if (es.soul) specials.push(`<div class="tp-abil-row soul"><span>SOUL CHOIR</span><b>NEXT HULL ${Math.max(60, 10 * (tower.tollCharges || 0))} · $${es.soulCost || 850} PER SOUL</b></div>`);
  }
  if (entry.id === 'relay') {
    const parts = [`+${Math.round((es.dmgBuff || 0) * 100)}% DMG`];
    if (es.rangeBuff) parts.push(`+${Math.round(es.rangeBuff * 100)}% RANGE`);
    if (es.rateBuff) parts.push(`+${Math.round(es.rateBuff * 100)}% RATE`);
    specials.push(`<div class="tp-abil-row"><span>NETWORK</span><b>${parts.join(' · ')}</b></div>`);
    if (es.rally) specials.push(`<div class="tp-abil-row rally"><span>RALLY CRY</span><b>${state.mode === 'waves' ? `${Math.ceil(tower.rallyCd || 0)}s CD` : `$${es.rallyCost || 600} · ${es.rallyCd || 45}s CD`}</b></div>`);
  }
  if (entry.id === 'executioner') {
    specials.push(`<div class="tp-abil-row"><span>EXECUTE</span><b>COMMANDERS BELOW ${Math.round((es.execute || 0.15) * 100)}% HULL</b></div>`);
    specials.push(`<div class="tp-abil-row"><span>CHAFF PAYOUT</span><b>${Math.round((es.chaffPct || 0.15) * 100)}% DMG</b></div>`);
  }
  if (entry.id === 'veteran') {
    const guns = VETERAN_GUNS.map((g, i) => `<i class="${i === (tower.gun || 0) ? 'on' : ''}">${g.name}</i>`).join(' ');
    specials.push(`<div class="tp-abil-row vet"><span>WEAPON RACK</span><b>${guns}</b></div>`);
    if (es.gunName === 'BATTLE RIFLE') specials.push(`<div class="tp-abil-row"><span>FIRE DISCIPLINE</span><b>+${(tower.heat || 0) * 20}% HEAT · +20%/HIT MAX +60%</b></div>`);
    if (es.gunName === 'SCATTERGUN') specials.push(`<div class="tp-abil-row"><span>BLAST RING</span><b>${es.splash || 32}U · AIR + GROUND</b></div>`);
    if (es.gunName === 'LONGRIFLE') specials.push(`<div class="tp-abil-row"><span>ARMOR PIERCE</span><b>MAX-HULL LOCK · COMMANDERS ×1.4</b></div>`);
  }
  if (entry.id === 'warbonds') {
    specials.push(`<div class="tp-abil-row bond"><span>BOND BALANCE</span><b>$${Math.round(tower.bank || 0)} / $${formatCash(es.bondCap || 3000)}</b></div>`);
    specials.push(`<div class="tp-abil-row"><span>WAVE INTEREST</span><b>+${Math.round((es.bond || 0) * 100)}% COMPOUND INTO THE BOND</b></div>`);
  }
  if (entry.id === 'wardrums') {
    specials.push(`<div class="tp-abil-row"><span>FRAG ROUNDS</span><b>+${Math.round((es.frag || 0) * 100)}% OF GUN DMG · ${es.fragRadius || 35}U RING</b></div>`);
    if (es.lob) specials.push(`<div class="tp-abil-row"><span>WAR CHOIR LOB</span><b>${es.lobDmg || 140} DMG SHELL · 4s</b></div>`);
  }
  if (entry.id === 'deathwarrant') {
    specials.push(`<div class="tp-abil-row warrant"><span>NEXT VERDICT</span><b>${tower.charge ? `${Math.ceil(tower.charge.t)}s CHARGE` : `${Math.ceil(tower.warrantCd || 0)}s TO LOCK`}</b></div>`);
    specials.push(`<div class="tp-abil-row"><span>PAYLOAD</span><b>${Math.round(es.dmg)} + ${Math.round((es.warrantPct || 0.25) * 100)}% TARGET MAX HULL · PHASE</b></div>`);
    if (es.echo) specials.push(`<div class="tp-abil-row"><span>DEATH ECHO</span><b>KILL BLAST · 20% HULL · 90U</b></div>`);
  }
  if (entry.id === 'paragon') {
    specials.push(`<div class="tp-abil-row gold"><span>GOLDEN TITHE</span><b>+${Math.round((es.tithe || 0.15) * 100)}% BOUNTY ON KILLS IN RING</b></div>`);
  }
  if (entry.id === 'zeroday') specials.push(`<div class="tp-abil-row"><span>WAVE INCOME</span><b>$${es.income || 0}/WAVE</b></div>`);
  const abilities = [];
  if (entry.id === 'corpseblossom' && trackLevel(tower) >= 4) {
    abilities.push(`<button class="tp-ability purge" type="button" id="tp-purge" ${tower.lust > 0 ? '' : 'disabled'}>BLOOD PURGE — RELEASE ${tower.lust || 0} LUST</button>`);
  }
  if (entry.id === 'corpseblossom' && trackLevel(tower) >= 5) {
    const cd = Math.ceil(tower.screamCd || 0);
    abilities.push(`<button class="tp-ability scream" type="button" id="tp-scream" ${cd > 0 ? 'disabled' : ''}>BLOOD SCREAM${cd > 0 ? ` — ${cd}s` : ' — READY'}</button>`);
  }
  if (entry.id === 'gravewarden' && trackLevel(tower) >= 6) {
    const cd = Math.ceil(tower.soulCd || 0);
    abilities.push(`<button class="tp-ability soul" type="button" id="tp-soul" ${cd > 0 ? 'disabled' : ''}>SUMMON SOUL — $${effStats(tower).soulCost || 850}${cd > 0 ? ` — ${cd}s` : ' — READY'}</button>`);
  }
  if (entry.id === 'relay' && trackLevel(tower) >= 5) {
    const cd = Math.ceil(tower.rallyCd || 0);
    abilities.push(`<button class="tp-ability rally" type="button" id="tp-rally" ${cd > 0 ? 'disabled' : ''}>RALLY CRY — $${effStats(tower).rallyCost || 600}${cd > 0 ? ` — ${cd}s` : ' — READY'}</button>`);
  }
  if (entry.id === 'veteran') {
    const nextGun = VETERAN_GUNS[((tower.gun || 0) + 1) % VETERAN_GUNS.length].name;
    abilities.push(`<button class="tp-ability vet" type="button" id="tp-gun">SWITCH GUN → ${nextGun}</button>`);
  }
  if (entry.id === 'warbonds') {
    abilities.push(`<button class="tp-ability deposit" type="button" id="tp-deposit">DEPOSIT $500 INTO THE BOND</button>`);
    abilities.push(`<button class="tp-ability withdraw" type="button" id="tp-withdraw" ${(tower.bank || 0) > 0 ? '' : 'disabled'}>WITHDRAW $${formatCash(Math.round(tower.bank || 0))}</button>`);
  }
  const panel = document.createElement('div');
  panel.className = `tower-panel tw-${entry.cat}`;
  panel.innerHTML = `
    <div class="tp-head"><b>${entry.name}</b><span class="tp-cat">${entry.cat.toUpperCase()}</span></div>
    <div class="tp-stats">
      <div><span>DMG</span><b>${Math.round(es.dmg) || '—'}</b></div>
      <div><span>RATE</span><b>${es.rate ? `${es.rate.toFixed(1)}/s` : '—'}</b></div>
      <div><span>RNG</span><b>${es.infinite ? 'INF' : Math.round(es.rng)}</b></div>
      ${es.splash ? `<div><span>SPLASH</span><b>${Math.round(es.splash)}U</b></div>` : ''}
    </div>
    ${specials.length ? `<div class="tp-specials">${specials.join('')}</div>` : ''}
    <p class="tp-special">${entry.special.replace('>> ', '')}</p>
    <div class="tp-ups"><div class="tp-ups-head"><span>// UPGRADE LADDER</span><b>TIER ${Math.min(lvl + 1, tiers.length)} / ${tiers.length} · THIS MISSION</b></div>${rows}</div>
    ${abilities.length ? `<div class="tp-abilities">${abilities.join('')}</div>` : ''}
    <button class="tp-sell" type="button">SALVAGE BACK +$${refund}</button>
    <p class="tp-note">UPGRADES ARE SCRAPPED ON SELL &amp; WHEN THE MISSION ENDS</p>`;
  battlefield.appendChild(panel);
  // Clamp with MEASURED panel size — 5/6-tier tracks + ability buttons make the
  // panel far taller than the old 330px guess, which pushed menus off-screen.
  const [sx, sy] = toScreen(tower.x, tower.y);
  const margin = 10;
  const pw = panel.offsetWidth || 224;
  const ph = panel.offsetHeight || 330;
  let left = sx + 26;
  if (left + pw > window.innerWidth - margin) left = sx - pw - 26; // flip left near the right edge
  panel.style.left = `${Math.max(margin, Math.min(window.innerWidth - pw - margin, left))}px`;
  panel.style.top = `${Math.max(margin, Math.min(window.innerHeight - ph - margin, sy - 120))}px`;
  ui.towerPanel = panel;
  ui.panelTower = tower;
  towerNodeOf(tower).classList.add('selected');
  panel.querySelectorAll('.tp-buy').forEach((button) => button.addEventListener('click', () => buyTrack(tower)));
  panel.querySelector('.tp-sell').addEventListener('click', () => sellTower(tower));
  const purge = panel.querySelector('#tp-purge');
  if (purge) purge.addEventListener('click', () => bloodPurge(tower));
  const scream = panel.querySelector('#tp-scream');
  if (scream) scream.addEventListener('click', () => bloodScream(tower));
  const soul = panel.querySelector('#tp-soul');
  if (soul) soul.addEventListener('click', () => castSoul(tower));
  const rally = panel.querySelector('#tp-rally');
  if (rally) rally.addEventListener('click', () => castRally(tower));
  const gunBtn = panel.querySelector('#tp-gun');
  if (gunBtn) gunBtn.addEventListener('click', () => switchGun(tower));
  const depositBtn = panel.querySelector('#tp-deposit');
  if (depositBtn) depositBtn.addEventListener('click', () => bondDeposit(tower));
  const withdrawBtn = panel.querySelector('#tp-withdraw');
  if (withdrawBtn) withdrawBtn.addEventListener('click', () => bondWithdraw(tower));
  refreshPanelAfford();
}

function closeTowerPanel() {
  if (ui.panelTower) { const node = towerNodeOf(ui.panelTower); if (node) node.classList.remove('selected'); }
  if (ui.towerPanel) { ui.towerPanel.remove(); ui.towerPanel = null; }
  ui.panelTower = null;
}

function sellTower(tower) {
  if (coopGuest()) { coopIntent({ a: 'sell', t: state.towers.indexOf(tower) }); closeTowerPanel(); return; }
  const refund = Math.floor(trackInvested(tower) * 0.7);
  state.cash += refund;
  dropTowerView(tower);
  if (tower.pad) {
    const padNode = document.querySelector(`[data-pad="${tower.pad[0]},${tower.pad[1]}"]`);
    if (padNode) padNode.classList.remove('occupied');
  }
  state.towers = state.towers.filter((item) => item !== tower);
  const [x, y] = [tower.x, tower.y];
  closeTowerPanel();
  emit('float', x, y - 20, `+$${refund} SALVAGED`, 'cash-float');
  emit('ring', x, y, 'fx-ring-amber');
  emit('sound');
  updateHud();
}

// --- Tower combat brain ------------------------------------------------------------------
function updateTowers(dt) {
  if (!state.towers.length) { paintNukeButton(); return; }
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
            const burst = svgNode('circle', { class: 'fx-ring fx-veins-burst', cx: tx, cy: ty, r: 6 });
            ui.layers.fx.appendChild(burst);
            setTimeout(() => burst.remove(), 620);
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
        if (ui.panelTower === tower) openTowerPanel(tower); // live launch countdown
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
  paintNukeButton();
  // Fire control.
  const overclockMult = window.CBZPerks && CBZPerks.has('overclock') ? 1.05 : 1;
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

function acquireTarget(tower) {
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

function aimHead(tower, target) {
  const [ex, ey] = posOf(target);
  const angle = (Math.atan2(ey - tower.y, ex - tower.x) * 180) / Math.PI;
  tower.aim = angle;
}

// --- WAR DRUMS aura: FRAG ROUNDS ----------------------------------------------------
// Every gun standing inside a drum ring splashes a fraction of its damage
// around the hull it just hit. Single-target chassis call fragBurst after
// their main hit; guns that already splash have nothing to gain and skip it.
function fragBurst(tower, target, dealt) {
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
function acquireWarrantTarget(tower, es) {
  const rng = es.rng || 460;
  const pool = state.enemies.filter((enemy) => {
    if (!enemy.alive || enemy.friendly || enemy.cloaked) return false;
    const [px, py] = posOf(enemy);
    return Math.hypot(px - tower.x, py - tower.y) <= rng;
  });
  if (!pool.length) return null;
  return pool.reduce((best, enemy) => (enemy.maxHp > best.maxHp ? enemy : best));
}

function beginWarrantCharge(tower, target, es) {
  const [px, py] = posOf(target);
  tower.charge = { nid: target.nid, x: px, y: py, t: es.warrantCd || 12, total: es.warrantCd || 12 };
  emit('float', tower.x, tower.y - 52, 'VERDICT LOCKED', 'core-float');
  emit('sound', 'alarm');
}

function dropWarrantCharge(tower) {
  tower.charge = null;
}

function fireWarrant(tower, target, es) {
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
function switchGun(tower) {
  tower.gun = ((tower.gun || 0) + 1) % VETERAN_GUNS.length;
  tower.heat = 0;
  tower.heatNid = null;
  paintTowerRange(tower);
  emit('ring', tower.x, tower.y, 'fx-ring-white');
  emit('float', tower.x, tower.y - 44, `${effStats(tower).gunName || 'BATTLE RIFLE'} UP`, 'up-float');
  emit('sound');
  openTowerPanel(tower);
}

// --- WAR BONDS: deposit + withdraw ----------------------------------------------------
function bondDeposit(tower) {
  const es = effStats(tower);
  const cap = es.bondCap || 3000;
  if ((tower.bank || 0) >= cap) { emit('sound', 'alarm'); showToast(`The bond is full — $${formatCash(cap)} cap. Withdraw or upgrade the ledger.`); return; }
  if (state.cash < 500) { emit('sound', 'alarm'); showToast('Need $500 salvage to feed the bond.'); return; }
  const amount = Math.min(500, cap - (tower.bank || 0));
  state.cash -= amount;
  tower.bank = (tower.bank || 0) + amount;
  emit('float', tower.x, tower.y - 44, `+$${amount} BONDED`, 'cash-float');
  emit('sound');
  updateHud();
  openTowerPanel(tower);
}

function bondWithdraw(tower) {
  const amount = Math.round(tower.bank || 0);
  if (amount <= 0) return;
  tower.bank = 0;
  state.cash += amount;
  emit('float', tower.x, tower.y - 44, `+$${amount} WITHDRAWN`, 'cash-float');
  emit('ring', tower.x, tower.y, 'fx-ring-amber');
  emit('sound');
  updateHud();
  openTowerPanel(tower);
}

function formatCash(value) {
  return Number(value || 0).toLocaleString('en-US');
}

function fireLine(tower, target, cls, width = 2) {
  const [ex, ey] = posOf(target);
  const line = svgNode('line', { class: `fx-line ${cls}`, x1: tower.x, y1: tower.y, x2: ex, y2: ey, 'stroke-width': width });
  ui.layers.fx.appendChild(line);
  setTimeout(() => line.remove(), 300);
  return [ex, ey];
}

function fireTower(tower, target) {
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
        const pellet = svgNode('line', { class: 'fx-line fx-pellet', x1: tower.x, y1: tower.y, x2: px, y2: py, 'stroke-width': 2.5 });
        ui.layers.fx.appendChild(pellet);
        setTimeout(() => pellet.remove(), 300);
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
      const slash = svgNode('line', { class: 'fx-line fx-tracer fx-slash', x1: tower.x, y1: tower.y, x2: tx, y2: ty, 'stroke-width': 3 });
      ui.layers.fx.appendChild(slash);
      setTimeout(() => slash.remove(), 160);
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
          const pellet = svgNode('line', { class: 'fx-line fx-pellet', x1: tower.x, y1: tower.y, x2: px, y2: py, 'stroke-width': 2.5 });
          ui.layers.fx.appendChild(pellet);
          setTimeout(() => pellet.remove(), 300);
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

function addProjectile(p) {
  p.id = ++state.pidSeq;
  state.projectiles.push(p);
}

// View: one SVG node per projectile id, created on first sight, moved every tick, dropped when the sim forgets it.
const projNodes = new Map();
function renderProjectiles() {
  if (!ui.layers) return;
  const live = new Set();
  for (const p of state.projectiles) {
    if (p.dead) continue;
    live.add(p.id);
    let node = projNodes.get(p.id);
    if (!node) {
      node = svgNode('circle', { class: p.kind === 'missile' ? 'fx-shell fx-missile' : 'fx-shell', r: p.kind === 'missile' ? 5 : 4, cx: p.x, cy: p.y });
      ui.layers.fx.appendChild(node);
      projNodes.set(p.id, node);
    }
    node.setAttribute('cx', p.x.toFixed(1));
    node.setAttribute('cy', p.y.toFixed(1));
  }
  for (const [id, node] of projNodes) if (!live.has(id)) { node.remove(); projNodes.delete(id); }
}

function updateProjectiles(dt) {
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

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const span = dx * dx + dy * dy;
  const t = span ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / span)) : 0;
  return Math.hypot(px - (x1 + dx * t), py - (y1 + dy * t));
}

// --- Board plumbing: pointer tracking, deploy clicks, cancel gestures --------------------
board.addEventListener('pointermove', (event) => {
  const [x, y] = boardPoint(event);
  ui.mouseX = x;
  ui.mouseY = y;
  ui.mouseOn = true;
  if (ui.crosshair) ui.crosshair.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
  if (ui.building) paintGhost(x, y);
});

board.addEventListener('pointerleave', () => {
  ui.mouseOn = false;
  if (ui.ghost) ui.ghost.classList.add('off');
});

board.addEventListener('click', (event) => {
  if (!ui.bar || !buildingAllowed()) return;
  const [x, y] = boardPoint(event);
  if (ui.nukeAim) { fireNuke(x, y); return; }
  if (ui.building) {
    const verdict = canPlace(x, y);
    if (!verdict.ok) { rejectPlace(x, y, verdict.reason); return; }
    if (coopGuest()) {
      coopIntent({ a: 'place', id: ui.building.id, x, y });
      emit('float', x, y - 20, 'SYNC → SQUAD LEAD', 'sync-float');
      setBuilding(null);
      return;
    }
    if (state.cash < ui.building.cost) { rejectPlace(x, y, `NEED $${ui.building.cost} SALVAGE`); return; }
    placeTower(ui.building, x, y);
    return;
  }
  const node = event.target.closest ? event.target.closest('.tower') : null;
  if (node) {
    const tower = state.towers.find((item) => (item.uid ? String(item.uid) === node.dataset.uid : item.node === node));
    if (tower) openTowerPanel(tower);
  }
});

board.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  if (ui.building) setBuilding(null);
  else closeTowerPanel();
});

document.addEventListener('keydown', (event) => {
  if (document.querySelector('#battlefield').hidden) return;
  if (event.key === 'Escape') { setBuilding(null); closeTowerPanel(); if (ui.nukeAim) setNukeAim(false); return; }
  const digit = Number(event.key);
  if (digit >= 1 && digit <= 5 && ui.bar && buildingAllowed()) {
    const slots = ui.bar.querySelectorAll('.lo-slot[data-tower]');
    const slot = slots[digit - 1];
    if (slot) toggleBuild(slot.dataset.tower);
  }
});

// --- Room sync ----------------------------------------------------------------------------
function notifyRoomEnded() {
  // Mission concluded while deployed from a squad room — unlock the bay for everyone.
  try {
    if (typeof sendToService === 'function' && typeof currentRoom !== 'undefined' && currentRoom) {
      sendToService({ type: 'end' });
    }
  } catch { /* room service optional — solo missions never hit this. */ }
}

// --- Squad sync: host-authoritative state relay -----------------------------------------
// Solo missions run a purely local sim. Squad missions (Node room or a LOCAL bay)
// elect the room lead as host: the host runs the full simulation and broadcasts
// ~8Hz snapshots; every other commander renders from those snapshots and ships
// intents (deploy / install / salvage) back to the host for validation.
function coopRole() {
  const bridge = window.CBZCoopBridge;
  return bridge && bridge.role ? bridge.role : 'solo';
}
const coopHost = () => coopRole() === 'host';
const coopGuest = () => coopRole() === 'guest';

function coopBroadcast() {
  const bridge = window.CBZCoopBridge;
  if (!bridge || !bridge.send) return;
  const boss = state.enemies.find((enemy) => enemy.alive && enemy.t.boss && !enemy.friendly);
  bridge.send({
    k: 'sync',
    m: state.mode, w: state.waveIndex, c: Math.round(state.cash), b: Math.max(0, Math.ceil(state.baseHp)),
    kk: state.kills, bk: state.bossesKilled, er: Math.round(state.earned),
    sq: state.syncSeq || 0, st: state.syncTitle || '',
    tw: state.towers.map((tower, index) => [index, tower.id, Math.round(tower.x), Math.round(tower.y), tower.lvl || 0, tower.onPad ? 1 : 0]),
    en: state.enemies.filter((enemy) => enemy.alive).map((enemy) => [enemy.nid, enemy.key, Math.round(enemy.fx), Math.round(enemy.fy), Math.round(enemy.hp), enemy.maxHp, Math.round(enemy.shield || 0), enemy.t.flying ? 1 : 0, enemy.friendly ? 1 : 0]),
    bo: boss ? [boss.nid, Math.round(boss.hp), boss.maxHp, Math.round(boss.shield || 0)] : null,
  });
}

function coopIntent(payload) {
  const bridge = window.CBZCoopBridge;
  if (bridge && bridge.send) bridge.send({ k: 'intent', ...payload });
}

function coopApplyIntent(message) {
  if (!message) return;
  if (message.a === 'place') {
    const entry = window.CBZShop && CBZShop.TOWERS.find((item) => item.id === message.id);
    if (!entry || !canPlace(message.x, message.y).ok) return;
    placeTower(entry, message.x, message.y);
  } else if (message.a === 'up') {
    const tower = state.towers[message.t];
    if (tower) buyTrack(tower);
  } else if (message.a === 'sell') {
    const tower = state.towers[message.t];
    if (tower) sellTower(tower);
  }
}

function coopApplySync(snap) {
  if (!state.guestMap) return;
  state.mode = snap.m === 'waves' || snap.m === 'countdown' ? snap.m : state.mode;
  state.waveIndex = snap.w;
  state.cash = snap.c;
  state.baseHp = snap.b;
  state.kills = snap.kk;
  state.bossesKilled = snap.bk;
  state.earned = snap.er;
  if (snap.sq && snap.sq !== state.lastSyncSeq) {
    state.lastSyncSeq = snap.sq;
    if (snap.st) emit('banner', snap.st, '// SQUAD LINK', 'banner-wave');
  }
  // Towers appear as the host builds them; ladder installs repaint their rings.
  const seenTowers = new Set();
  for (const [gid, id, x, y, lvl, pad] of snap.tw) {
    seenTowers.add(gid);
    let tower = state.towers.find((item) => item.gid === gid);
    if (!tower && window.CBZShop) {
      const entry = CBZShop.TOWERS.find((item) => item.id === id);
      if (!entry) continue;
      const node = towerNode(entry, x, y);
      ui.layers.towers.appendChild(node);
      tower = { id, entry, x, y, node, head: node.querySelector('.tw-head'), cd: 0, boost: 1, lvl, gid, onPad: Boolean(pad), guest: true };
      state.towers.push(tower);
      node.classList.add('placed');
      setTimeout(() => node.classList.remove('placed'), 620);
    } else if (tower && tower.lvl !== lvl) {
      tower.lvl = lvl;
      paintTowerRange(tower);
    }
  }
  state.towers = state.towers.filter((tower) => {
    if (tower.guest && !seenTowers.has(tower.gid)) { tower.node.remove(); return false; }
    return true;
  });
  // Enemies keyed by host spawn id: create missing, refresh bars, drop the dead.
  const alive = new Set();
  for (const [nid, key, x, y, hp, maxHp, shield, flying, friendly] of snap.en) {
    alive.add(nid);
    let enemy = state.guestMap.get(nid);
    if (!enemy) {
      const t = ENEMY_TYPES[key];
      if (!t) continue;
      const g = svgNode('g', { class: `enemy e-${key}${t.boss ? ' e-boss' : ''}` });
      const chassis = svgNode('g', { class: 'e-chassis' });
      for (const node of shapeFor(key, t)) chassis.appendChild(node);
      g.appendChild(chassis);
      const barY = -(t.size + 13);
      const barW = t.boss ? 34 : 22;
      g.appendChild(svgNode('rect', { class: 'hp-bg', x: -barW / 2, y: barY, width: barW, height: 3.4 }));
      const fill = svgNode('rect', { class: 'hp-fill', x: -barW / 2, y: barY, width: barW, height: 3.4 });
      g.appendChild(fill);
      const shieldFill = svgNode('rect', { class: 'shield-fill', x: -barW / 2, y: barY - 4, width: 0, height: 2.4 });
      g.appendChild(shieldFill);
      ui.layers.enemies.appendChild(g);
      enemy = { key, t, node: g, fill, shieldFill, hp, maxHp, shield, maxShield: t.shield || 0, alive: true, gx: x, gy: y, fx: x, fy: y, angle: 0, guest: true, guestNid: nid, friendly: Boolean(friendly) };
      state.guestMap.set(nid, enemy);
      g.classList.add('spawn-in');
      setTimeout(() => g.classList.remove('spawn-in'), 420);
    }
    enemy.gx = x;
    enemy.gy = y;
    if (enemy.hp !== hp || enemy.shield !== shield) {
      enemy.hp = hp;
      enemy.shield = shield;
      paintGuestBars(enemy);
    }
  }
  for (const [nid, enemy] of state.guestMap) {
    if (!alive.has(nid)) {
      enemy.node.remove();
      state.guestMap.delete(nid);
    }
  }
  state.enemies = [...state.guestMap.values()];
  updateHud();
  updateBossBar();
}

function guestFrame(dt) {
  const k = Math.min(1, dt * 12);
  for (const enemy of state.guestMap.values()) {
    enemy.fx += (enemy.gx - enemy.fx) * k;
    enemy.fy += (enemy.gy - enemy.fy) * k;
    enemy.node.setAttribute('transform', `translate(${enemy.fx.toFixed(1)} ${enemy.fy.toFixed(1)})`);
  }
  updateBossBar();
}

function coopHandle(message) {
  if (!message) return;
  if (message.k === 'sync') { if (coopGuest()) coopApplySync(message); return; }
  if (message.k === 'intent') { if (coopHost()) coopApplyIntent(message); return; }
  if (message.k === 'over') { if (coopGuest() && state.mode !== 'over') endMission(Boolean(message.win), true); return; }
}

window.CBZCombat = {
  startMission,
  abort,
  coopHandle,
  active: () => state.mode !== 'idle',
  // Read-only telemetry for QA + tests.
  stats: () => ({ mode: state.mode, wave: state.waveIndex + 1, kills: state.kills, cash: Math.round(state.cash), base: state.baseHp, towers: state.towers.length, enemies: state.enemies.filter((enemy) => enemy.alive).length, towersDetail: state.towers.map((t) => ({ id: t.id, onPad: !!t.onPad })), flyingAlive: state.enemies.filter((e) => e.alive && e.t.flying).length, friendliesAlive: state.enemies.filter((e) => e.alive && e.friendly).length, friendlyTargeted: state.towers.some((t) => t.target && t.target.alive && t.target.friendly) }),
};
})();
