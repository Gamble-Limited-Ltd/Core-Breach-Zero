// Core Breach: Zero - progression tables: salvage codes, achievements, perks, golden-seal payout.
// Pure data and derivations. Mirrored in server.js + LOCAL (app.js): keep in sync.

// Salvage codes — redeemable once per commander account, in SETTINGS & LOGS.
// Mirrored in server.js: same codes, same grants, same one-time ledger.
export const REDEEM_CODES = {
  NULLCORE: { nc: 1500, bt: 0 },
  GHOSTWIRE: { nc: 0, bt: 75 },
  DATACACHE: { nc: 4000, bt: 100 },
  ZERODAY: { nc: 5000, bt: 500 },
};

// --- Achievements & perks -------------------------------------------------------
// Achievement progress derives from profile.mapWins — a ledger keyed by
// `${mapId}:${protocol}` that /api/mission/complete bumps on every recorded win.
// Mirrored in server.js — keep the derivation in sync there.
export const ACHIEVEMENTS = [
  {
    id: 'overdrive', name: 'OVERDRIVE', glyph: '⚡', map: 'insane',
    protocols: ['easy', 'medium'],
    desc: 'Clear the OVERLOAD SPIRE sector on both the EASY and MEDIUM combat protocols.',
    reward: 'Decrypts the OVERDRIVE perk — a TIME x2 button for missions.',
  },
  {
    id: 'hardline', name: 'HARDLINE', glyph: '☠', map: 'any',
    protocols: ['hard'],
    desc: 'Clear any sector on the HARD combat protocol — 30 waves of torture with near-lethal boss breaches.',
    reward: 'Decrypts the SALVAGE PROTOCOL perk — every mission payout pays +10% Nexus Coins.',
  },
  {
    id: 'ironcommander', name: 'IRON COMMANDER', glyph: '⚑', map: 'any',
    protocols: ['hard'],
    count: 5,
    desc: 'Rack up 5 HARD protocol victories across any sectors. The grid starts taking you seriously.',
    reward: 'Decrypts the DEEP POCKETS perk — every mission opens with +150 salvage.',
  },
  {
    id: 'spirebreaker', name: 'SPIRE BREAKER', glyph: '▲', map: 'insane',
    protocols: ['hard'],
    desc: 'Clear the OVERLOAD SPIRE sector on the HARD combat protocol.',
    reward: 'Decrypts the FIELD REPAIRS perk — the core self-repairs 2 HP after every cleared wave.',
  },
  {
    id: 'grandslam', name: 'GRAND SLAM', glyph: '★', map: 'all',
    protocols: ['hard'],
    desc: 'Clear every battle sector — PERIMETER PATROL, IRON JUNCTION, MELTDOWN GRID, OVERLOAD SPIRE and CORE: ZERO — on the HARD protocol.',
    reward: 'Decrypts the BOUNTY HUNTER perk — hostile commanders pay +25% bounty.',
  },
  {
    id: 'apexpredator', name: 'APEX PREDATOR', glyph: '✚', map: 'any',
    protocols: ['hard'],
    count: 10,
    desc: 'Rack up 10 HARD protocol victories. The grid learns to fear your ledger.',
    reward: 'Decrypts the OVERCLOCK MATRIX perk — every turret fires 5% faster.',
  },
  {
    id: 'warmachine', name: 'WAR MACHINE', glyph: '⬢', map: 'any',
    protocols: ['hard'],
    count: 15,
    desc: 'Rack up 15 victories on the HARD protocol or better — HARD, INSANE and the Crimson Dawn all count. The grid clears you for full saturation.',
    reward: 'Decrypts the SATURATION DOCTRINE perk — +5 deployment slots (command ceiling 15 → 20).',
  },
];
export function achievementsFrom(mapWins) {
  const wins = mapWins && typeof mapWins === 'object' ? mapWins : {};
  const hardWins = Object.keys(wins).reduce((sum, key) => sum + (key.endsWith(':hard') ? (wins[key] || 0) : 0), 0);
  const bigWins = Object.keys(wins).reduce((sum, key) => sum + (/:(hard|insane|crimson)$/.test(key) ? (wins[key] || 0) : 0), 0);
  return {
    overdrive: Boolean((wins['insane:easy'] || 0) > 0 && (wins['insane:medium'] || 0) > 0),
    hardline: Boolean(hardWins >= 1),
    ironcommander: Boolean(hardWins >= 5),
    spirebreaker: Boolean((wins['insane:hard'] || 0) > 0),
    grandslam: Boolean(['easy', 'medium', 'hard', 'insane', 'cbz'].every((mapId) => (wins[`${mapId}:hard`] || 0) > 0)),
    apexpredator: Boolean(hardWins >= 10),
    warmachine: Boolean(bigWins >= 15),
  };
}


// GOLDEN_PROTOCOLS / GOLDEN_MAPS / mapSeal / allSeals live in ../shop/data.js
export const GOLDEN_REWARD = { nc: 2500, bt: 10 }; // one-time payout the first time a sector gilds

export const PERKS = [
  {
    id: 'overdrive', name: 'OVERDRIVE PROTOCOL', ach: 'overdrive',
    desc: 'Time-compression rig. Adds a TIME x2 toggle to the mission HUD — flip it and the entire battlefield runs at double speed.',
    req: 'OVERDRIVE ACHIEVEMENT',
  },
  {
    id: 'salvage', name: 'SALVAGE PROTOCOL', ach: 'hardline',
    desc: 'Reclamation routines strip every wreck twice. All mission payouts pay +10% Nexus Coins.',
    req: 'HARDLINE ACHIEVEMENT',
  },
  {
    id: 'deeppockets', name: 'DEEP POCKETS', ach: 'ironcommander',
    desc: 'Off-grid credit lines open the moment you deploy. Every mission starts with +150 salvage.',
    req: 'IRON COMMANDER ACHIEVEMENT',
  },
  {
    id: 'fieldrep', name: 'FIELD REPAIRS', ach: 'spirebreaker',
    desc: 'Nanite repair swarms patch the core between assaults — +2 core HP after every cleared wave.',
    req: 'SPIRE BREAKER ACHIEVEMENT',
  },
  {
    id: 'bounty', name: 'BOUNTY HUNTER', ach: 'grandslam',
    desc: 'Command bounties renegotiated in your favor — hostile commanders pay +25% bounty salvage.',
    req: 'GRAND SLAM ACHIEVEMENT',
  },
  {
    id: 'overclock', name: 'OVERCLOCK MATRIX', ach: 'apexpredator',
    desc: 'Weapons-grade clock boost across the whole network — every turret fires 5% faster.',
    req: 'APEX PREDATOR ACHIEVEMENT',
  },
  {
    id: 'saturation', name: 'SATURATION DOCTRINE', ach: 'warmachine',
    desc: 'Full-spectrum deployment clearance — the command ceiling climbs from 15 to 20 deployed units.',
    req: 'WAR MACHINE ACHIEVEMENT',
  },
];
