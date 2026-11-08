// Core Breach: Zero - combat data: enemy roster, wave ladders per protocol, mode curves,
// foundry (placement) rules, tower rules, nuke constants. Pure data, no DOM, no mission state.

// --- Enemy roster (Easy Mode) ---------------------------------------------------
// Rebalance pass: bounties roughly doubled so a real defense network is affordable
// by the mid waves, and every archetype still hits the core for a unique amount.
export const ENEMY_TYPES = {
  glitched: { name: 'GLITCHED BIT', tag: 'NORMAL', hp: 15, speed: 84, size: 9, bounty: 3, dmg: 1, color: '#70e1d0', ability: 'None — cheap fodder that arrives in numbers.' },
  runner: { name: 'DATA RUNNER', tag: 'FAST', hp: 10, speed: 124, size: 8, bounty: 5, dmg: 2, color: '#a5d58b', ability: 'Very fast — outruns reaction time.' },
  file: { name: 'CORRUPTED FILE', tag: 'SWARM', hp: 8, speed: 62, size: 6, bounty: 2, dmg: 1, color: '#c49bef', ability: 'Spawns in dense clusters.' },
  shielded: { name: 'SHIELDED BYTE', tag: 'ARMORED', hp: 45, speed: 40, size: 11, bounty: 9, dmg: 3, color: '#8fb7c9', armor: 0.2, ability: 'Armor plating absorbs 20% of incoming damage.' },
  drone: { name: 'OVERCLOCKED DRONE', tag: 'FLYING', hp: 25, speed: 88, size: 10, bounty: 8, dmg: 2, color: '#ffb45a', flying: true, ability: 'Air unit — flies a straight line to the core, ignoring tracks, gates and haste fields.' },
  nullcore: { name: 'NULL CORE', tag: 'TANK', hp: 150, speed: 28, size: 14, bounty: 19, dmg: 4, color: '#7f8fa0', ability: 'Dense hull soaks heavy damage.' },
  virus: { name: 'SYSTEM VIRUS', tag: 'MINI-BOSS', hp: 600, speed: 48, size: 20, bounty: 120, dmg: 6, color: '#ff5e7a', boss: true, ability: 'Malware Pulse — emits a stunning shockwave every 8s.' },
  leak: { name: 'MEMORY LEAK', tag: 'MINI-BOSS', hp: 1200, speed: 34, size: 22, bounty: 225, dmg: 8, color: '#ffb45a', boss: true, ability: 'Replication — spills 6 Corrupted Files at 50% HP.' },
  overseer: { name: 'CORE BREACH: ZERO', tag: 'FINAL BOSS', hp: 4200, speed: 27, size: 26, bounty: 750, dmg: 25, color: '#ff4d5e', boss: true, shield: 400, ability: 'Overheat — shockwave disables a tower for 4s. Shielding Matrix — gains a 400 HP shield at 25% HP.' },
  hexbug: { name: 'HEX CRAWLER', tag: 'REGEN', hp: 55, speed: 58, size: 10, bounty: 12, dmg: 2, color: '#6ee7a0', regen: 0.03, ability: 'Nanite Weave — knits 3% hull back per second. Burst it down or it outlives your DPS.' },
  juggernaut: { name: 'DATA JUGGERNAUT', tag: 'SUPERARMOR', hp: 320, speed: 24, size: 17, bounty: 55, dmg: 5, color: '#98a7b8', armor: 0.45, ability: 'Ablative megaplate — absorbs 45% of all incoming damage.' },
  phantom: { name: 'PHANTOM PACKET', tag: 'PHASE', hp: 40, speed: 70, size: 9, bounty: 14, dmg: 2, color: '#9ad1ff', blink: { every: 3.2, jump: 90 }, ability: 'Phase Jump — blinks 90u up the lane every few seconds, dodging chokepoint DPS.' },
  warden: { name: 'FIREWALL WARDEN', tag: 'HARD BOSS', hp: 2400, speed: 31, size: 23, bounty: 420, dmg: 12, color: '#ff8a3d', boss: true, shield: 700, ability: 'Packet Storm — spills 4 Hex Crawlers at 60% hull. Shield Lattice — spawns with a 700 HP shield.' },
  // SPIRAL ESCALATION elite classes — the INSANE protocol's answer to a maxed grid.
  spectre: { name: 'NULL SPECTRE', tag: 'STEALTH', hp: 70, speed: 66, size: 10, bounty: 16, dmg: 3, color: '#dfe8ff', cloak: { every: 4.8, span: 2.6 }, ability: 'Phase Shroud — drops out of every targeting lock for a few seconds at a time. Splash, veins, the bell and the nuke still catch it while cloaked.' },
  leech: { name: 'DATA LEECH', tag: 'SUPPORT', hp: 90, speed: 52, size: 11, bounty: 18, dmg: 2, color: '#ff6ec7', heal: { every: 1, pct: 0.018, radius: 90 }, ability: 'Siphon Field — pulses every second, knitting 1.8% of max hull back into every hostile around it. Kill the doctor first.' },
  bloat: { name: 'BLOATWARE', tag: 'DETONATE', hp: 130, speed: 38, size: 13, bounty: 20, dmg: 4, color: '#d6ff4f', ability: 'Death Rattle — pops on death: every tower near the corpse goes OFFLINE for 2.5 seconds. Give it distance or spread the grid.' },
  rampager: { name: 'RAMPAGE UNIT', tag: 'ENRAGE', hp: 240, speed: 46, size: 15, bounty: 42, dmg: 6, armor: 0.1, ability: 'Berserk Drive — accelerates as it bleeds: up to +85% speed at near-fatal hull. Finish it early or chase it down.' },
};

// --- Easy Mode: 20 waves, 6 boss encounters ---------------------------------------
// Wave pressure compounds: every wave index adds +10% enemy HP on top of the
// roster, so the same towers that cruised wave 3 start bleeding around wave 8-10
// unless the defense network grows with it. Surge modifiers stack on top.
export const WAVE_HP_SCALE = 0.12;  // +12% HP per wave index — pressure compounds faster

export const SURGE_MODS = {
  overclock: { hp: 1, speed: 1.25, label: 'OVERCLOCK SURGE', note: 'HOSTILES RUN 25% FASTER' },
  hardened: { hp: 1.4, speed: 1, label: 'HARDENED HULLS', note: 'HOSTILES +40% HP' },
  crush: { hp: 1.5, speed: 1.15, label: 'CRUSH PROTOCOL', note: 'HOSTILES +50% HP · 15% FASTER' },
  hellfire: { hp: 1.65, speed: 1.2, label: 'HELLFIRE SURGE', note: 'HOSTILES +65% HP · 20% FASTER' },
  dawnfire: { hp: 1.8, speed: 1.25, label: 'DAWNFIRE SURGE', note: 'HOSTILES +80% HP · 25% FASTER' },
};

export const EASY_WAVES = [
  { groups: [['glitched', 16]] },
  { groups: [['glitched', 20], ['runner', 8]] },
  { groups: [['glitched', 16], ['runner', 10], ['file', 12]] },
  { groups: [['shielded', 12], ['glitched', 14]] },
  { groups: [['runner', 24], ['shielded', 10], ['virus', 1]], phase: 'MINI-BOSS // SYSTEM VIRUS' },
  { groups: [['drone', 10], ['glitched', 16]], phase: 'AIR DEBUT' },
  { groups: [['shielded', 18], ['drone', 14]] },
  { groups: [['nullcore', 4], ['file', 26]] },
  { groups: [['nullcore', 6], ['drone', 14], ['runner', 18]], mod: 'overclock' },
  { groups: [['shielded', 10], ['nullcore', 5], ['leak', 1]], phase: 'MINI-BOSS // MEMORY LEAK' },
  { groups: [['file', 36], ['runner', 14]], phase: 'SWARM SURGE', mod: 'overclock' },
  { groups: [['nullcore', 10], ['drone', 18]] },
  { groups: [['virus', 1], ['leak', 1], ['shielded', 12]], phase: 'DOUBLE TROUBLE' },
  { groups: [['shielded', 20], ['drone', 22], ['glitched', 30]] },
  { groups: [['runner', 30], ['drone', 16]], phase: 'BLITZ RUN', mod: 'overclock' },
  { groups: [['nullcore', 12], ['shielded', 16]], phase: 'ARMOR COLUMN', mod: 'hardened' },
  { groups: [['drone', 26], ['runner', 20]], phase: 'AIR ARMADA', mod: 'overclock' },
  { groups: [['virus', 2], ['file', 40], ['glitched', 30]], phase: 'VIRULENT SURGE' },
  { groups: [['leak', 2], ['nullcore', 10], ['drone', 20]], phase: 'LEAK STORM', mod: 'hardened' },
  { groups: [['shielded', 20], ['nullcore', 10], ['overseer', 1], ['drone', 20]], phase: 'FINAL BOSS // CORE BREACH: ZERO' },
];

// --- Medium Protocol: 30 waves, denser, angrier -----------------------------------
// Same roster, but the pressure dials all turn clockwise: bigger groups, more
// overlapping boss waves, more surge modifiers and a steeper HP curve. The
// final wave throws the CORE BREACH: ZERO overseer at you WITH a mini-boss escort.
export const MEDIUM_WAVES = [
  { groups: [['glitched', 22], ['runner', 12]] },
  { groups: [['glitched', 20], ['file', 18], ['runner', 12]] },
  { groups: [['shielded', 16], ['glitched', 20]], mod: 'hardened' },
  { groups: [['runner', 28], ['drone', 10], ['virus', 1]], phase: 'MINI-BOSS // SYSTEM VIRUS' },
  { groups: [['drone', 16], ['glitched', 22], ['file', 20]], phase: 'AIR PRESSURE' },
  { groups: [['nullcore', 7], ['file', 32]], mod: 'overclock' },
  { groups: [['shielded', 22], ['drone', 18], ['runner', 16]] },
  { groups: [['nullcore', 8], ['leak', 1], ['file', 26]], phase: 'MINI-BOSS // MEMORY LEAK' },
  { groups: [['file', 42], ['runner', 22]], phase: 'SWARM STORM', mod: 'overclock' },
  { groups: [['virus', 1], ['leak', 1], ['shielded', 18]], phase: 'DOUBLE TROUBLE', mod: 'hardened' },
  { groups: [['nullcore', 13], ['drone', 22], ['runner', 20]] },
  { groups: [['drone', 30], ['runner', 26]], phase: 'AIR ARMADA', mod: 'overclock' },
  { groups: [['shielded', 26], ['nullcore', 11], ['glitched', 32]], mod: 'hardened' },
  { groups: [['virus', 2], ['file', 46], ['drone', 20]], phase: 'VIRULENT SURGE' },
  { groups: [['leak', 2], ['nullcore', 13], ['drone', 24]], phase: 'LEAK STORM', mod: 'hardened' },
  { groups: [['runner', 36], ['drone', 22], ['file', 32]], phase: 'BLITZ RUN', mod: 'overclock' },
  { groups: [['nullcore', 15], ['shielded', 24], ['virus', 1]], phase: 'ARMOR COLUMN' },
  { groups: [['drone', 32], ['runner', 28], ['glitched', 36]], mod: 'overclock' },
  { groups: [['virus', 2], ['leak', 2], ['shielded', 22]], phase: 'COMMANDER WALL', mod: 'hardened' },
  { groups: [['nullcore', 17], ['drone', 26], ['file', 42]], phase: 'DENSE ASSAULT' },
  { groups: [['runner', 42], ['drone', 26]], phase: 'FULL SPRINT', mod: 'overclock' },
  { groups: [['virus', 2], ['leak', 2], ['nullcore', 13]], phase: 'TRIPLE THREAT', mod: 'hardened' },
  { groups: [['shielded', 30], ['drone', 28], ['runner', 30], ['file', 38]], mod: 'overclock' },
  { groups: [['nullcore', 15], ['virus', 2], ['leak', 2], ['drone', 26]], phase: 'PRE-FINAL ONSLAUGHT', mod: 'hardened' },
  { groups: [['file', 48], ['nullcore', 14], ['drone', 24]], phase: 'GRID LOCK', mod: 'overclock' },
  { groups: [['shielded', 30], ['nullcore', 14], ['runner', 30]], mod: 'hardened' },
  { groups: [['virus', 2], ['leak', 2], ['drone', 28]], phase: 'SIEGE PAIR', mod: 'overclock' },
  { groups: [['nullcore', 16], ['file', 50], ['glitched', 40]], phase: 'DEAD STACK' },
  { groups: [['runner', 40], ['drone', 30], ['shielded', 26]], phase: 'LAST BREACH', mod: 'overclock' },
  { groups: [['shielded', 26], ['nullcore', 13], ['overseer', 1], ['virus', 1], ['leak', 1], ['drone', 26]], phase: 'FINAL BOSS // CORE BREACH: ZERO' },
];

// --- Hard Protocol: 30 waves of pure hell -------------------------------------------
// The HELL PROTOCOL pass (escalated twice): HARD ladders the Medium roster with
// four elite classes (Hex Crawlers regen, Data Juggernauts tank, Phantom Packets
// blink past chokepoints, Firewall Wardens spill swarms) and cranks every dial
// past the stops: +20-40% hostile counts per wave, armor columns from wave 7,
// Juggernaut packs from wave 10, doubled boss stacks mid-ladder, HELLFIRE
// surges on SIX of the ugliest indices and a final escort of 3 Wardens + 2
// Viruses + 2 Leaks behind the overseer. The compounding hull curve does the rest.
export const HARD_WAVES = [
  { groups: [['glitched', 30], ['runner', 20]] },
  { groups: [['glitched', 28], ['file', 28], ['runner', 20]] },
  { groups: [['shielded', 24], ['glitched', 30], ['hexbug', 8]], phase: 'NANITE DEBUT', mod: 'hardened' },
  { groups: [['runner', 40], ['drone', 18], ['virus', 1]], phase: 'MINI-BOSS // SYSTEM VIRUS' },
  { groups: [['drone', 24], ['glitched', 32], ['phantom', 10]], phase: 'PHASE PRESSURE' },
  { groups: [['nullcore', 12], ['file', 44], ['hexbug', 10]], mod: 'overclock' },
  { groups: [['shielded', 30], ['drone', 26], ['runner', 24]], mod: 'hardened' },
  { groups: [['nullcore', 14], ['leak', 1], ['file', 36], ['phantom', 10]], phase: 'MINI-BOSS // MEMORY LEAK' },
  { groups: [['file', 58], ['runner', 30], ['hexbug', 14]], phase: 'SWARM STORM', mod: 'overclock' },
  { groups: [['virus', 2], ['leak', 1], ['shielded', 26], ['juggernaut', 3]], phase: 'DOUBLE TROUBLE', mod: 'hardened' },
  { groups: [['nullcore', 20], ['drone', 30], ['runner', 28]], mod: 'overclock' },
  { groups: [['drone', 42], ['runner', 34], ['phantom', 12]], phase: 'AIR ARMADA', mod: 'overclock' },
  { groups: [['shielded', 34], ['nullcore', 16], ['glitched', 42], ['hexbug', 12]], mod: 'hellfire' },
  { groups: [['virus', 2], ['leak', 2], ['file', 56], ['drone', 28], ['juggernaut', 3]], phase: 'VIRULENT SURGE', mod: 'hardened' },
  { groups: [['leak', 2], ['nullcore', 18], ['drone', 32]], phase: 'LEAK STORM', mod: 'hellfire' },
  { groups: [['runner', 48], ['drone', 30], ['file', 44], ['phantom', 12]], phase: 'BLITZ RUN', mod: 'overclock' },
  { groups: [['nullcore', 20], ['shielded', 32], ['virus', 2], ['juggernaut', 4]], phase: 'ARMOR COLUMN', mod: 'hardened' },
  { groups: [['drone', 44], ['runner', 36], ['glitched', 48]], mod: 'overclock' },
  { groups: [['virus', 3], ['leak', 2], ['shielded', 30], ['warden', 1]], phase: 'FIREWALL RISING', mod: 'hardened' },
  { groups: [['nullcore', 22], ['drone', 34], ['file', 54], ['juggernaut', 3], ['phantom', 10]], phase: 'DENSE ASSAULT', mod: 'hellfire' },
  { groups: [['runner', 54], ['drone', 34], ['hexbug', 16]], phase: 'FULL SPRINT', mod: 'overclock' },
  { groups: [['virus', 3], ['leak', 3], ['nullcore', 18], ['juggernaut', 4]], phase: 'TRIPLE THREAT', mod: 'hellfire' },
  { groups: [['shielded', 38], ['drone', 36], ['runner', 38], ['file', 50]], mod: 'overclock' },
  { groups: [['nullcore', 20], ['virus', 3], ['leak', 3], ['drone', 34], ['warden', 2], ['leech', 4]], phase: 'PRE-FINAL ONSLAUGHT', mod: 'hardened' },
  { groups: [['file', 62], ['nullcore', 20], ['drone', 32], ['phantom', 14]], phase: 'GRID LOCK', mod: 'hellfire' },
  { groups: [['shielded', 38], ['nullcore', 20], ['runner', 38], ['juggernaut', 5], ['bloat', 5]], mod: 'hellfire' },
  { groups: [['virus', 4], ['leak', 3], ['drone', 36], ['hexbug', 16]], phase: 'SIEGE WALL', mod: 'overclock' },
  { groups: [['nullcore', 22], ['file', 62], ['glitched', 50], ['warden', 2]], phase: 'DEAD STACK', mod: 'hardened' },
  { groups: [['runner', 52], ['drone', 38], ['shielded', 34], ['phantom', 14], ['leech', 4], ['bloat', 5]], phase: 'LAST BREACH', mod: 'overclock' },
  { groups: [['shielded', 34], ['nullcore', 20], ['warden', 3], ['overseer', 1], ['virus', 2], ['leak', 2], ['drone', 36], ['juggernaut', 5], ['phantom', 10]], phase: 'FINAL BOSS // CORE BREACH: ZERO' },
];

// --- Crimson Dawn: 20 waves of the impossible (LIMITED-TIME EVENT) ------------------
// The event protocol makes HARD look like a tutorial. Elite classes only get
// featured from wave 3, boss stacks land every other wave from wave 10, DAWNFIRE
// surges (the strongest modifier in the game) burn four of the last seven waves
// and the final hour buries the overseer under 2 Wardens, 3 Viruses and 3 Leaks
// under DAWNFIRE. Hull pressure compounds at 1.13x per wave — wave 10 ≈ 3x,
// wave 20 ≈ 10.2x roster hull. The prize: the DAWNBRINGER relic blueprint.
export const CRIMSON_WAVES = [
  { groups: [['glitched', 34], ['runner', 26]] },
  { groups: [['shielded', 30], ['glitched', 36], ['runner', 24]], mod: 'overclock' },
  { groups: [['drone', 30], ['file', 44], ['hexbug', 12]], phase: 'NANITE DEBUT', mod: 'hardened' },
  { groups: [['runner', 48], ['drone', 24], ['virus', 1]], phase: 'MINI-BOSS // SYSTEM VIRUS', mod: 'overclock' },
  { groups: [['shielded', 36], ['drone', 32], ['phantom', 14]], phase: 'PHASE PRESSURE', mod: 'hardened' },
  { groups: [['nullcore', 18], ['file', 52], ['hexbug', 14]], mod: 'overclock' },
  { groups: [['shielded', 40], ['nullcore', 16], ['runner', 34]], phase: 'ARMOR COLUMN', mod: 'crush' },
  { groups: [['nullcore', 18], ['leak', 2], ['file', 44], ['phantom', 12]], phase: 'MINI-BOSS // MEMORY LEAK', mod: 'hardened' },
  { groups: [['file', 66], ['runner', 38], ['hexbug', 18]], phase: 'SWARM STORM', mod: 'overclock' },
  { groups: [['virus', 3], ['leak', 2], ['shielded', 34], ['juggernaut', 5]], phase: 'DOUBLE TROUBLE', mod: 'dawnfire' },
  { groups: [['drone', 48], ['runner', 40], ['phantom', 14]], phase: 'AIR ARMADA', mod: 'overclock' },
  { groups: [['shielded', 44], ['nullcore', 22], ['glitched', 52], ['hexbug', 16]], phase: 'DAWNFIRE COLUMN', mod: 'dawnfire' },
  { groups: [['virus', 3], ['leak', 3], ['file', 62], ['drone', 34], ['juggernaut', 4]], phase: 'VIRULENT SURGE', mod: 'hardened' },
  { groups: [['leak', 3], ['nullcore', 22], ['drone', 38]], phase: 'LEAK STORM', mod: 'hellfire' },
  { groups: [['runner', 58], ['drone', 36], ['file', 52], ['phantom', 16]], phase: 'BLITZ RUN', mod: 'overclock' },
  { groups: [['nullcore', 24], ['shielded', 40], ['virus', 3], ['juggernaut', 6]], phase: 'ARMOR COLUMN', mod: 'dawnfire' },
  { groups: [['drone', 52], ['runner', 44], ['glitched', 56]], mod: 'overclock' },
  { groups: [['virus', 4], ['leak', 3], ['shielded', 38], ['warden', 2]], phase: 'FIREWALL RISING', mod: 'hardened' },
  { groups: [['nullcore', 26], ['file', 68], ['drone', 40], ['phantom', 16], ['warden', 2]], phase: 'PRE-FINAL ONSLAUGHT', mod: 'hellfire' },
  { groups: [['shielded', 40], ['nullcore', 24], ['warden', 2], ['overseer', 1], ['virus', 3], ['leak', 3], ['drone', 40], ['juggernaut', 5], ['phantom', 12]], phase: 'FINAL DAWN // THE CRIMSON HOUR', mod: 'dawnfire' },
];

// Per-protocol pressure: Medium compounds HP faster than Easy on top of denser waves.
// HARD dials snap off twice — hull pressure COMPOUNDS every wave
// ((1.10)^index: wave 10 ≈ 2.4x, wave 20 ≈ 6.1x, wave 30 ≈ 15.9x roster hull —
// the run escalates, it never plateaus) and every hostile moves 15% faster.
// CRIMSON DAWN (event) compounds steeper still at 1.13x — wave 20 ≈ 21.7x hull —
// and every hostile moves 18% faster. Nothing comes back from that.
export const MODE_HP_SCALE = { easy: WAVE_HP_SCALE, medium: 0.14, hard: 0.17 }; // legacy linear curve (easy/medium)

export const MODE_HP_GROWTH = { hard: 0.1, insane: 0.135, crimson: 0.13 }; // compounding hull curves — hell, the spiral and the dawn are exponential. The SPIRAL doubled: wave 30 arrives at ~35x hull (was ~20x)

export const MODE_SPEED = { hard: 1.15, insane: 1.22, crimson: 1.18 };     // hostile protocol speed multipliers — the spiral now outruns the dawn

// Easy pass: commanders (bosses) spawn with 10% less hull — a gentler first exposure.
export const EASY_BOSS_RELIEF = 0.9;

// Hard pass: a boss that breaches the core hits it for 10x damage — a leaked
// commander all but ends the run (virus 60, leak 80, warden 120, overseer 250).
// Crimson Dawn keeps the same rule: at 21x hull, one leak should end you.
export const MODE_BOSS_LEAK = { hard: 10, insane: 12, crimson: 10 }; // the spiral raised the stakes: a leaked mini-boss all but cores you (virus 72, leak 96, warden 144, overseer 300)

// Flight Corridor pass: OVERCLOCKED DRONES burn the Well's core for 1 per leak,
// down from 2 — the event map's AA hexes sit far off the flight corridors, so a
// leaked armada shouldn't core you through the middle. Absolute per-hostile
// overrides for non-boss leaks (future event protocols: add rows).
export const MODE_LEAK = { crimson: { drone: 1 } };

// --- Insane Protocol: 30 waves on the doubled spiral ---------------------------------
// SPIRAL ESCALATION: the ladder was rebuilt from the ground up — counts climb
// another 12-25% past the old spiral, DAWNFIRE still burns TRIPLE THREAT +
// SIEGE WALL, and four elite classes debut in the rotation: NULL SPECTRES drop
// targeting locks (w5), BLOATWARE pops EMPs on your grid (w9), DATA LEECHES
// knit the swarm back together (w13) and RAMPAGE UNITS go berserk as they bleed
// (w18). The hull curve compounds at 1.135x/wave — wave 30 arrives at ~35x hull,
// nearly double the old spiral's 20x — and every hostile moves 22% faster.
export const INSANE_WAVES = [
  { groups: [['glitched', 38], ['runner', 26]] },
  { groups: [['glitched', 36], ['file', 36], ['runner', 26]] },
  { groups: [['shielded', 30], ['glitched', 38], ['hexbug', 12]], phase: 'NANITE DEBUT', mod: 'hardened' },
  { groups: [['runner', 52], ['drone', 24], ['virus', 1]], phase: 'MINI-BOSS // SYSTEM VIRUS' },
  { groups: [['drone', 30], ['glitched', 40], ['phantom', 14], ['spectre', 6]], phase: 'PHASE SHROUD' },
  { groups: [['nullcore', 16], ['file', 56], ['hexbug', 14], ['spectre', 8]], mod: 'overclock' },
  { groups: [['shielded', 38], ['drone', 34], ['runner', 30]], mod: 'hardened' },
  { groups: [['nullcore', 18], ['leak', 1], ['file', 48], ['phantom', 14], ['spectre', 8]], phase: 'MINI-BOSS // MEMORY LEAK' },
  { groups: [['file', 72], ['runner', 38], ['hexbug', 18], ['bloat', 6]], phase: 'SWARM STORM', mod: 'overclock' },
  { groups: [['virus', 2], ['leak', 1], ['shielded', 34], ['juggernaut', 5], ['bloat', 6]], phase: 'DOUBLE TROUBLE', mod: 'hardened' },
  { groups: [['nullcore', 26], ['drone', 38], ['runner', 36], ['spectre', 10]], mod: 'overclock' },
  { groups: [['drone', 54], ['runner', 42], ['phantom', 16], ['spectre', 10]], phase: 'AIR ARMADA', mod: 'overclock' },
  { groups: [['shielded', 42], ['nullcore', 22], ['glitched', 54], ['hexbug', 16], ['leech', 5]], mod: 'hellfire' },
  { groups: [['virus', 2], ['leak', 2], ['file', 70], ['drone', 36], ['juggernaut', 5], ['leech', 5]], phase: 'VIRULENT SURGE', mod: 'hardened' },
  { groups: [['leak', 2], ['nullcore', 24], ['drone', 40], ['bloat', 8]], phase: 'LEAK STORM', mod: 'hellfire' },
  { groups: [['runner', 60], ['drone', 38], ['file', 56], ['phantom', 16], ['spectre', 12]], phase: 'BLITZ RUN', mod: 'overclock' },
  { groups: [['nullcore', 26], ['shielded', 40], ['virus', 2], ['juggernaut', 6], ['bloat', 8]], phase: 'ARMOR COLUMN', mod: 'hardened' },
  { groups: [['drone', 56], ['runner', 46], ['glitched', 60], ['rampager', 3]], phase: 'BERSERK LINE', mod: 'overclock' },
  { groups: [['virus', 3], ['leak', 2], ['shielded', 38], ['warden', 1], ['leech', 6]], phase: 'FIREWALL RISING', mod: 'hardened' },
  { groups: [['nullcore', 28], ['drone', 42], ['file', 68], ['juggernaut', 6], ['phantom', 14], ['rampager', 3]], phase: 'DENSE ASSAULT', mod: 'hellfire' },
  { groups: [['runner', 66], ['drone', 42], ['hexbug', 20], ['bloat', 10]], phase: 'FULL SPRINT', mod: 'overclock' },
  { groups: [['virus', 3], ['leak', 3], ['nullcore', 24], ['juggernaut', 6], ['rampager', 4]], phase: 'TRIPLE THREAT', mod: 'dawnfire' },
  { groups: [['shielded', 46], ['drone', 44], ['runner', 46], ['file', 62], ['spectre', 14]], mod: 'overclock' },
  { groups: [['nullcore', 26], ['virus', 3], ['leak', 3], ['drone', 42], ['warden', 2], ['leech', 7]], phase: 'PRE-FINAL ONSLAUGHT', mod: 'hardened' },
  { groups: [['file', 76], ['nullcore', 26], ['drone', 40], ['phantom', 18], ['bloat', 10]], phase: 'GRID LOCK', mod: 'hellfire' },
  { groups: [['shielded', 46], ['nullcore', 26], ['runner', 46], ['juggernaut', 7], ['rampager', 5]], mod: 'hellfire' },
  { groups: [['virus', 4], ['leak', 4], ['drone', 44], ['hexbug', 20], ['spectre', 14]], phase: 'SIEGE WALL', mod: 'dawnfire' },
  { groups: [['nullcore', 28], ['file', 76], ['glitched', 62], ['warden', 2], ['bloat', 12]], phase: 'DEAD STACK', mod: 'hardened' },
  { groups: [['runner', 64], ['drone', 46], ['shielded', 42], ['phantom', 18], ['rampager', 6], ['leech', 8]], phase: 'LAST BREACH', mod: 'overclock' },
  { groups: [['shielded', 42], ['nullcore', 26], ['warden', 3], ['overseer', 1], ['virus', 2], ['leak', 2], ['drone', 44], ['juggernaut', 6], ['phantom', 14], ['leech', 8]], phase: 'FINAL BOSS // CORE BREACH: ZERO' },
];

export const WAVES = { easy: EASY_WAVES, medium: MEDIUM_WAVES, hard: HARD_WAVES, insane: INSANE_WAVES, crimson: CRIMSON_WAVES };

// Pace pass: wider spawn gaps so waves stream in instead of dumping all at once.
export const SPAWN_GAP = { file: 0.45, glitched: 0.75, runner: 0.65, shielded: 1.0, drone: 0.95, nullcore: 1.85, virus: 2.5, leak: 2.5, overseer: 2.75, hexbug: 0.7, juggernaut: 2.2, phantom: 0.8, warden: 3.0, spectre: 0.7, leech: 1.6, bloat: 1.9, rampager: 2.4 };

export const BASE_MAX = 100;

// --- Foundry rules: free placement + clearance boxes ---------------------------------
export const START_SALVAGE = 200;   // mission opening funds — enough to open with 2-3 bays

export const FOOT_HALF = 24;        // clearance box is 48x48 around every placed unit

export const SEP = 56;              // min axis distance between two unit centers (box + gap)

export const CORE_CLEAR = 58;       // nothing deploys inside the reactor ring

export const PAD_SNAP = 24;         // hex AA pads: deploy this close to a pad center to link anti-air

export const PAD_AIR_BOOST = 1.5;   // pads overcharge linked units: +50% damage vs flying hostiles

export const TRACK_CLEAR = 36;      // nothing deploys on the convoy lane itself

// Tower limit scales with the squad: every extra commander brings their own
// hardware allotment to the shared grid. SATURATION DOCTRINE (perk) buys the
// old 20-unit ceiling back while equipped.
export const TOWER_BASE = 15;       // solo ceiling

export const TOWER_PER_ALLY = 9;    // +9 slots per additional commander in the room

// air: 'no' = ground only (a hex pad grants AA), 'yes' = anything,
// 'only' = FLYERS ONLY (the Flak Post idles through ground waves on purpose).
export const TOWER_RULES = {
  sentinel: { air: 'no' },
  lazermortar: { air: 'no' },
  shotgunner: { air: 'no' },
  sniper: { air: 'no' },
  shredder: { air: 'no' },     // chaff mulcher — pad links grant AA like the Sentinel
  sparkcoil: { air: 'no' },    // filler zapper — pad links grant AA like the Sentinel
  flakpost: { air: 'only' },   // sky-warden pair — tracks flyers natively, ignores the ground war
  tarsprayer: { air: 'no' },   // field hazard — never targets; the slick drags walkers only
  relay: { air: 'no' },        // network pylon — never targets; it buffs the guns that do
  virus: { air: 'yes' },
  zeroday: { air: 'no' },      // economy rig — never fires; rule kept for pad-link copy
  corpseblossom: { air: 'no' }, // spawner — never targets; veins curse flyers directly
  gravewarden: { air: 'no' },  // yard keeper — never targets; the bell tolls for everything inside
  executioner: { air: 'yes' }, // headsman rail — tracks anything with a hull; commanders pay full price
  dawnbreaker: { air: 'yes' },  // CRIMSON RELIC — dawn-forged lance tracks air natively
  veteran: { air: 'no' },       // TRI-WEAPON hero — the rifle needs a pad for AA; the other two guns see everything
  warbonds: { air: 'no' },      // war chest — never targets; the bond compounds every cleared wave
  wardrums: { air: 'no' },      // support aura — never targets; the beat frags what the guns hit
  deathwarrant: { air: 'yes' }, // ANNIHILATOR — the verdict locks the beefiest hull in reach, air or ground
  paragon: { air: 'yes' },      // GOLDEN STANDARD — the gilded barrel tracks anything with a hull
  missilesilo: { air: 'yes' },  // MISSILE SILO — warheads track air and ground without a pad
  dronespawner: { air: 'no' },  // spawner — never targets; strike drones hit anything they intercept
};

// One-off rigs: only a single unit of these chassis may deploy per commander.
export const UNIQUE_TOWERS = new Set(['zeroday', 'corpseblossom', 'dronespawner', 'gravewarden']); // limit-1 rigs; the headsman now musters three

// --- THE VETERAN: one chassis, three switchable guns ------------------------------
// Every gun MULTIPLIES the chassis stats, so all eight ladder tiers benefit all
// three weapons. The switch is instant and free from the tower panel. Each gun
// keeps its own gimmick: FIRE DISCIPLINE heats the rifle on repeated hulls, the
// SCATTERGUN empties a blast ring air + ground, the LONGRIFLE pierces armor and
// locks the beefiest hull in reach (commanders pay a 1.4x surcharge).
export const VETERAN_GUNS = [
  { name: 'BATTLE RIFLE', dmg: 1, rate: 1, rng: 1 },
  { name: 'SCATTERGUN', dmg: 0.55, rate: 0.85, rng: 0.72, splash: 32, air: 'yes' },
  { name: 'LONGRIFLE', dmg: 3.4, rate: 0.35, rng: 1.65, targeting: 'maxhp', air: 'yes', armorPierce: true, bossMult: 1.4 },
];

export const NUKE_DAMAGE = 1700;      // Nuclear Fall Out: flat strike damage inside the blast (nerfed from 2200 — the rig prints money, the strike no longer deletes commanders)

export const NUKE_RADIUS = 240;       // strike decimates everything inside this ring

export const NUKE_COST = 500;         // salvage price per cast

export const NUKE_COOLDOWN = 300;     // seconds between casts

export const WASTE_RADIUS = 130;      // radioactive aftermath pool

export const WASTE_SECONDS = 100;     // fallout lingers this long

export const WASTE_DPS = 30;          // small tick damage inside the fallout

export const SUMMON_CAP = 60;         // global ceiling so Blossom chains stay performant

// BLOATWARE death rattle: the corpse pops an EMP — towers near the blast go
// OFFLINE for a few seconds (first real tower-disable in the roster).
export const BLOAT_EMP_RADIUS = 85;

export const BLOAT_EMP_SECONDS = 2.5;
