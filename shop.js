// Core Breach: Zero — Nexus Shop (blueprints, currencies, commander clearance).
// Loaded after app.js: uses its globals (apiRequest, playSound, showToast).
// Economy tables mirror server.js — keep xpToNext + reward math in sync there.
window.CBZShop = (() => {
  const HORIZON = 10; // locked blueprints stay visible within 10 levels; beyond that they are hidden
  // Clearance is UNCAPPED since the ULTIMATUM era — levels climb forever.
  const xpToNext = (level) => Math.round(55 * Math.pow(level, 0.86));

  // --- GOLDEN SEALS: a sector gilds when all four protocols fall on it -------------
  // Gild all five sectors and the PARAGON materializes in the armory.
  const GOLDEN_PROTOCOLS = ['easy', 'medium', 'hard', 'insane'];
  const GOLDEN_MAPS = ['easy', 'medium', 'hard', 'insane', 'cbz'];
  const mapSeal = (mapWins, mapId) => {
    const wins = mapWins && typeof mapWins === 'object' ? mapWins : {};
    return GOLDEN_PROTOCOLS.every((p) => (wins[`${mapId}:${p}`] || 0) > 0);
  };
  const allSeals = (mapWins) => GOLDEN_MAPS.every((mapId) => mapSeal(mapWins, mapId));

  const CATEGORIES = {
    all: { label: 'ALL LINES' },
    offense: { label: 'OFFENSE' },
    control: { label: 'CONTROL' },
    support: { label: 'SUPPORT' },
    special: { label: 'SPECIAL' },
  };

  const ic = (inner) => `<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

  // --- Blueprint catalog: 5 turret lines, each with ONE linear upgrade track ------
  // track: an ordered ladder of single improvements bought with salvage mid-mission.
  // Every tier's `sets` are absolute stat values applied on install (cumulative).
  const TOWERS = [
    { id: 'sentinel', name: 'SENTINEL TURRET', cat: 'offense', unlock: 1, price: 0, cost: 100, currency: 'nc',
      tagline: 'Rapid kinetic baseline — cheap, dependable, always ready.',
      stats: { dmg: 7, rate: 1.6, rng: 135, tgt: 'SINGLE / GROUND · AA ON PADS' },
      special: '>> The grid standard. Deploy on a hex pad to link anti-air coverage.',
      art: 'assets/towers/sentinel.webp',
      track: [
        { label: 'HIGHER CALIBER', cost: 110, sets: { dmg: 12 }, info: 'DMG 7 → 12' },
        { label: 'BETTER TECH', cost: 165, sets: { rate: 2, rng: 150 }, info: 'RATE 1.6 → 2 · RNG 135 → 150' },
        { label: 'SENTINEL PROMOTION', cost: 280, sets: { dmg: 20, rng: 185 }, info: 'DMG 12 → 20 · RNG 150 → 185' },
      ],
      icon: ic('<path d="M9 33h22"/><path d="M13 33v-7h14v7"/><path d="M20 26V7"/><circle cx="20" cy="6" r="2.4"/>') },
    { id: 'lazermortar', name: 'LAZER MORTAR', cat: 'offense', unlock: 1, price: 0, cost: 250, currency: 'nc', reward: true,
      tagline: 'REWARD BLUEPRINT — beat Easy Mode to decrypt it.',
      stats: { dmg: 60, rate: 0.3, rng: 180, splash: 30, tgt: 'SPLASH 30U · AA ON PADS' },
      special: '>> Lazer shells detonate on impact for full damage inside the blast ring. Trophy chassis for clearing Easy Mode.',
      art: 'assets/towers/lazermortar.webp',
      track: [
        { label: 'BETTER SCOPE', cost: 400, sets: { rng: 210, rate: 0.35 }, info: 'RNG 180 → 210 · RATE 0.3 → 0.35' },
        { label: 'HIGHLY EXPLOSIVE ROUNDS', cost: 500, sets: { splash: 60, dmg: 90 }, info: 'SPLASH 30 → 60 · DMG 60 → 90' },
        { label: 'TRUE MORTAR', cost: 1250, sets: { dmg: 130, splash: 65 }, info: 'DMG 90 → 130 · SPLASH 60 → 65' },
        { label: 'USA FUNDING', cost: 2000, sets: { dmg: 190, rng: 245, splash: 75 }, info: 'DMG 130 → 190 · RNG 210 → 245 · SPLASH 65 → 75' },
      ],
      icon: ic('<path d="M8 34h16"/><path d="M12 34L28 18"/><rect x="27" y="6" width="9" height="9" transform="rotate(45 31.5 10.5)"/><path d="M6 14a26 26 0 0 1 11-10" stroke-dasharray="3 4"/>') },
    { id: 'shotgunner', name: 'SHOTGUNNER', cat: 'offense', unlock: 3, price: { nc: 800, bt: 10 }, cost: 150, currency: 'mixed',
      tagline: 'Close-work scattergun — wide pellet bursts shred tight packs.',
      stats: { dmg: 27, rate: 0.8, rng: 100, splash: 12, tgt: 'SPLASH 12U · GROUND · AA VIA SATELLITE' },
      special: '>> Pellet blasts hammer everything inside the burst ring. Tier-1 Satellite Comms unlocks anti-air without a hex pad.',
      art: 'assets/towers/shotgunner.webp',
      track: [
        { label: 'SATELLITE COMMS', cost: 95, sets: { rng: 105, air: 'yes' }, info: 'RNG 100 → 105 · ANTI-AIR UNLOCKED — no pad needed' },
        { label: 'LARGER SHELLS', cost: 190, sets: { splash: 20 }, info: 'SPLASH 12 → 20' },
        { label: 'HELL SHELLS', cost: 290, sets: { splash: 24, dmg: 36 }, info: 'SPLASH 20 → 24 · DMG 27 → 36' },
        { label: 'EXPERT TRAINING', cost: 350, sets: { rate: 1, rng: 120, dmg: 40 }, info: 'RATE 0.8 → 1 · RNG 105 → 120 · DMG 36 → 40' },
      ],
      icon: ic('<path d="M7 33l12-12"/><path d="M12 35L24 23"/><path d="M24 23l5-5"/><circle cx="31" cy="12" r="2.2"/><circle cx="35" cy="17" r="2.2"/><circle cx="27" cy="7" r="1.8"/>') },
    { id: 'sparkcoil', name: 'SPARK COIL', cat: 'offense', unlock: 6, price: { nc: 950, bt: 15 }, cost: 120, currency: 'mixed',
      tagline: 'Jury-rigged zapper — a wound coil that snaps cheap sparks down the lane.',
      stats: { dmg: 9, rate: 1.2, rng: 100, tgt: 'SINGLE / GROUND · AA ON PADS' },
      special: '>> Grid-jury hardware: hits singles only, never splashes, and the ladder runs out of ambition after three small tiers. It clears the opening drip and then holds a hex like furniture. Filler, honestly — priced like it too. Deploy on a hex pad to link anti-air coverage.',
      art: 'assets/towers/sparkcoil.webp',
      track: [
        { label: 'TIGHTER WINDING', cost: 110, sets: { rate: 1.4 }, info: 'RATE 1.2 → 1.4' },
        { label: 'LONGER ARC', cost: 190, sets: { rng: 115, dmg: 12 }, info: 'RNG 100 → 115 · DMG 9 → 12' },
        { label: 'LAST DISCHARGE', cost: 340, sets: { dmg: 16 }, info: 'DMG 12 → 16 — THE COIL STOPS GROWING HERE' },
      ],
      icon: ic('<path d="M20 34V14"/><circle cx="20" cy="10" r="2.4"/><path d="M14 30h12M13 26h14M15 22h10"/><path d="M12 34h16"/>') },
    { id: 'sniper', name: 'SNIPER', cat: 'offense', unlock: 5, price: { nc: 1800, bt: 50 }, cost: 300, currency: 'mixed',
      tagline: 'Long-reach marksman — one trigger pull, one deletion.',
      stats: { dmg: 130, rate: 0.3, rng: 250, tgt: 'SINGLE / GROUND · AA ON PADS' },
      special: '>> Pinpoint rounds erase the priority threat. Tier-1 Sniper Headset locks every shot onto the highest-HP hostile in reach.',
      art: 'assets/towers/sniper.webp',
      track: [
        { label: 'SNIPER HEADSET', cost: 150, sets: { rng: 270, targeting: 'maxhp' }, info: 'RNG 250 → 270 · ONLY TARGETS THE HIGHEST-HP ENEMY IN RANGE' },
        { label: 'HIGHER CAL', cost: 200, sets: { dmg: 150 }, info: 'DMG 130 → 150' },
        { label: 'AUTO RE-LOADER 9000', cost: 300, sets: { rate: 0.5 }, info: 'RATE 0.3 → 0.5' },
        { label: '50 CAL', cost: 300, sets: { dmg: 215 }, info: 'DMG 150 → 215' },
        { label: 'RAIL GUNNER', cost: 1600, sets: { dmg: 330, rate: 0.4, rng: 350 }, info: 'DMG 215 → 330 · RATE 0.5 → 0.4 · RNG 270 → 350' },
      ],
      icon: ic('<circle cx="20" cy="20" r="9"/><path d="M20 4v7"/><path d="M20 29v7"/><path d="M4 20h7"/><path d="M29 20h7"/><circle cx="20" cy="20" r="1.6" fill="currentColor" stroke="none"/>') },
    { id: 'flakpost', name: 'FLAK POST', cat: 'offense', unlock: 10, price: { nc: 1400, bt: 20 }, cost: 160, currency: 'mixed',
      tagline: 'Sky-warden pair — twin flak barrels that shred drone waves and nothing else.',
      stats: { dmg: 16, rate: 1.5, rng: 150, tgt: 'SINGLES / FLYERS ONLY · GROUND IS BENEATH IT' },
      special: '>> One job: the sky. The twin barrels track and shred flying hostiles without any pad link — and completely ignore everything that walks. Ground waves stroll past it like it is a lawn ornament. Filler with a specialty.',
      art: 'assets/towers/flakpost.webp',
      track: [
        { label: 'SPANNER BARRELS', cost: 150, sets: { rate: 1.8 }, info: 'RATE 1.5 → 1.8' },
        { label: 'FRAG ROUNDS', cost: 280, sets: { dmg: 22, splash: 8 }, info: 'DMG 16 → 22 · FLAK BURST RING 8U' },
        { label: 'SKY SWEEP', cost: 520, sets: { dmg: 26, rate: 2, rng: 170 }, info: 'DMG 22 → 26 · RATE 1.8 → 2 · RNG 150 → 170' },
      ],
      icon: ic('<path d="M12 34h16"/><path d="M14 34l3-10h6l3 10"/><path d="M17 24V10M23 24V10"/><path d="M17 10h-4M23 10h4"/>') },
    { id: 'shredder', name: 'SHREDDER', cat: 'offense', unlock: 20, price: { nc: 2200, bt: 35 }, cost: 90, currency: 'mixed',
      tagline: 'Chaff mulcher — a spinning drum of cheap blades that deletes the early waves and nothing else.',
      stats: { dmg: 11, rate: 3, rng: 105, tgt: 'SINGLE / GROUND · AA ON PADS' },
      special: '>> The early-wave answer: per salvage, nothing on the grid clears runners, files and glitched faster. It never scales — the ladder tops out quick on purpose, so past the opening waves it is salvage bait. Deploy on a hex pad to link anti-air coverage.',
      art: 'assets/towers/shredder.webp',
      track: [
        { label: 'WIDER INTAKE', cost: 120, sets: { rate: 3.5 }, info: 'RATE 3 → 3.5' },
        { label: 'CARBIDE TEETH', cost: 240, sets: { dmg: 15 }, info: 'DMG 11 → 15' },
        { label: 'LAST CALIBER', cost: 480, sets: { dmg: 18, rng: 115 }, info: 'DMG 15 → 18 · RNG 105 → 115 — THE DRUM STOPS GROWING HERE' },
      ],
      icon: ic('<circle cx="20" cy="20" r="10"/><circle cx="20" cy="20" r="3"/><path d="M20 10v4M20 26v4M10 20h4M26 20h4M13 13l2.8 2.8M24.2 24.2L27 27M27 13l-2.8 2.8M15.8 24.2L13 27"/><path d="M20 30v4M14 34h12"/>') },
    { id: 'tarsprayer', name: 'TAR SPRAYER', cat: 'control', unlock: 12, price: { nc: 1750, bt: 25 }, cost: 180, currency: 'mixed',
      tagline: 'Field hazard — no gun at all, just a slick of cold tar across the lane.',
      stats: { dmg: 0, rate: 0, rng: 85, slow: 0.15, tgt: 'FIELD HAZARD · NO DAMAGE · WALKERS ONLY' },
      special: '>> It pumps tar. Everything that walks through the slick drags at 15% less speed while inside — flyers skim right over it, and nothing ever dies to it. Cheap traffic control that never kills anything: pure filler with a purpose.',
      art: 'assets/towers/tarsprayer.webp',
      track: [
        { label: 'HEAVIER BLEND', cost: 210, sets: { slow: 0.2 }, info: 'SLOW 15% → 20%' },
        { label: 'WIDE NOZZLE', cost: 430, sets: { rng: 105, slow: 0.25 }, info: 'RNG 85 → 105 · SLOW 20% → 25%' },
      ],
      icon: ic('<path d="M20 30V12"/><path d="M20 12c-4-1-6-4-6-7 3 0 5 2 6 4 1-2 3-4 6-4 0 3-2 6-6 7"/><path d="M14 34h12"/><circle cx="20" cy="33" r="1.4"/>') },
    { id: 'dronespawner', name: 'DRONE SPAWNER', cat: 'special', unlock: 20, price: { nc: 5200, bt: 85 }, cost: 475, currency: 'mixed', limit: 1,
      tagline: 'Automated carrier — fabricates one-way strike drones straight into traffic.',
      stats: { dmg: 0, rate: 0, rng: 190, drone: 90, launchEvery: 5, tgt: 'SPAWNER // LAUNCHES STRIKE DRONES · ONE PER COMMANDER' },
      special: '>> While hostiles stand inside its ring, the carrier rolls a strike drone off the line every few seconds. The drone rockets across the grid and detonates on the first hostile it intercepts — walkers and flyers alike — for its full payload. The FIELD AUDIT put the line back on a war footing: 90-payload warbirds every 5 seconds stock, and the APEX CARRIER fields 300-payload monsters every 2.6 seconds. Only one carrier deploys per commander.',
      art: 'assets/towers/dronespawner.webp',
      track: [
        { label: 'HUNGER DRONES', cost: 240, sets: { launchEvery: 4 }, info: 'LAUNCH CADENCE 5s → 4s' },
        { label: 'WARBIRD CHASSIS', cost: 420, sets: { drone: 150 }, info: 'DRONE DMG/HULL 90 → 150' },
        { label: 'SWARM LOGIC', cost: 850, sets: { launchEvery: 3.2, drone: 220 }, info: 'LAUNCH 4s → 3.2s · DRONE 150 → 220' },
        { label: 'APEX CARRIER', cost: 1900, sets: { rng: 230, launchEvery: 2.6, drone: 300 }, info: 'RNG 190 → 230 · LAUNCH 3.2s → 2.6s · DRONE 220 → 300' },
      ],
      icon: ic('<rect x="10" y="22" width="20" height="8" rx="1"/><path d="M14 22v-4M26 22v-4"/><path d="M14 14h4M22 14h4"/><circle cx="16" cy="12" r="2.4"/><circle cx="24" cy="12" r="2.4"/><path d="M20 30v4M12 34h16"/>') },
    { id: 'missilesilo', name: 'MISSILE SILO', cat: 'offense', unlock: 30, price: { nc: 9000, bt: 120 }, cost: 650, currency: 'mixed',
      tagline: 'Strategic strike chassis — silo-launched warheads level whole formations.',
      stats: { dmg: 300, rate: 0.22, rng: 300, splash: 55, tgt: 'SPLASH 55U · AIR + GROUND · NO PAD NEEDED' },
      special: '>> The endgame answer. Warheads arc out to anywhere in a huge ring and detonate for full damage inside the blast — air or ground, no hex pad required. MIRV PROTOCOL cracks every shell into cluster bomblets that pepper the whole crater.',
      art: 'assets/towers/missilesilo.webp',
      track: [
        { label: 'WARHEAD CACHE', cost: 520, sets: { dmg: 420 }, info: 'DMG 300 → 420' },
        { label: 'CLUSTER PAYLOAD', cost: 780, sets: { splash: 75 }, info: 'SPLASH 55 → 75' },
        { label: 'SILO AUTOLOADER', cost: 1200, sets: { rate: 0.3, dmg: 500 }, info: 'RATE 0.22 → 0.3 · DMG 420 → 500' },
        { label: 'MIRV PROTOCOL', cost: 2800, sets: { dmg: 650, splash: 80, rng: 340, cluster: 1 }, info: 'DMG 500 → 650 · SPLASH 75 → 80 · RNG 300 → 340 · MIRV CLUSTER BOMBLETS' },
      ],
      icon: ic('<path d="M12 34h16"/><path d="M14 34V14l6-8 6 8v20"/><path d="M17 20h6"/><circle cx="20" cy="26" r="2.4"/><path d="M8 34h24" stroke-dasharray="3 3"/>') },
    { id: 'veteran', name: 'THE VETERAN', cat: 'offense', unlock: 40, price: { nc: 13500, bt: 180 }, cost: 700, currency: 'mixed', limit: 1,
      tagline: 'Tri-weapon hero — one chassis, three switchable guns, and the longest ladder the Nexus has ever minted.',
      stats: { dmg: 60, rate: 1.2, rng: 170, tgt: 'TRI-WEAPON // 3 SWITCHABLE GUNS · AA ON PADS · ONE PER COMMANDER' },
      special: '>> The old soldier carries three guns and knows when each one sings. The BATTLE RIFLE heats up +20% per consecutive hit on the same hull (max +60%), the SCATTERGUN empties a 32u blast ring through air and ground alike, and the LONGRIFLE pierces armor plating to lock the beefiest hull in reach — commanders pay a 1.4x surcharge. Switch guns free and instantly from the tower panel. Eight ladder tiers — the most upgrades ever bolted onto one chassis, and every tier benefits all three guns.',
      art: 'assets/towers/veteran.webp',
      track: [
        { label: 'FIELD SIGHTS', cost: 200, sets: { rng: 190 }, info: 'RNG 170 → 190' },
        { label: 'CHROME BARREL', cost: 420, sets: { dmg: 80 }, info: 'DMG 60 → 80' },
        { label: 'ASSAULT RECEIVER', cost: 700, sets: { rate: 1.5 }, info: 'RATE 1.2 → 1.5' },
        { label: 'AP ROUNDS', cost: 1100, sets: { dmg: 105 }, info: 'DMG 80 → 105' },
        { label: 'VETERAN INSTINCTS', cost: 1600, sets: { rng: 220, rate: 1.7 }, info: 'RNG 190 → 220 · RATE 1.5 → 1.7' },
        { label: 'WARFACE', cost: 2400, sets: { dmg: 135 }, info: 'DMG 105 → 135' },
        { label: 'MASTER MARKSMAN', cost: 3600, sets: { dmg: 165, rng: 250 }, info: 'DMG 135 → 165 · RNG 220 → 250' },
        { label: 'BATTLE-HARDENED', cost: 5200, sets: { dmg: 200, rate: 2, rng: 280 }, info: 'DMG 165 → 200 · RATE 1.7 → 2 · RNG 250 → 280 — 8 TIERS, THE LONGEST LADDER' },
      ],
      icon: ic('<path d="M10 34h20"/><path d="M14 34v-6h12v6"/><path d="M20 28V14"/><path d="M12 14h16"/><circle cx="20" cy="10" r="2.4"/><path d="M8 20h4M28 20h4"/>') },
    { id: 'zeroday', name: 'ZERO DAY-EXPLOIT RIG', cat: 'support', unlock: 15, price: { nc: 3600, bt: 30 }, cost: 350, currency: 'mixed', limit: 1,
      tagline: 'Passive breach engine — no guns, just money printed every wave.',
      stats: { dmg: 0, rate: 0, rng: 0, income: 120, tgt: 'ECONOMY RIG // PAYS EVERY WAVE · ONE PER COMMANDER' },
      special: '>> Prints salvage at the end of every cleared wave. Tier-5 skims +10% off every enemy bounty. Tier-6 arms the Nuclear Fall Out strike — an aimed tactical nuke with radioactive aftermath. Only one rig deploys per commander.',
      art: 'assets/towers/zeroday.webp',
      track: [
        { label: 'BETTER RIG', cost: 140, sets: { income: 170 }, info: 'INCOME 120 → 170/WAVE' },
        { label: 'MORE FABRICATION', cost: 320, sets: { income: 370 }, info: 'INCOME 170 → 370/WAVE' },
        { label: 'BETTER EXPLOITS', cost: 260, sets: { income: 470 }, info: 'INCOME 370 → 470/WAVE' },
        { label: 'ONE DAY-RIG', cost: 750, sets: { income: 770 }, info: 'INCOME 470 → 770/WAVE' },
        { label: 'ZERO DAY', cost: 500, sets: { income: 870, bounty: 0.1 }, info: 'INCOME 770 → 870/WAVE · ENEMY BOUNTIES +10%' },
        { label: 'NUCLEAR FALL OUT', cost: 500, sets: { income: 970 }, info: 'INCOME 870 → 970/WAVE · NUKE ABILITY: $500 CAST · 300s COOLDOWN' },
      ],
      icon: ic('<rect x="8" y="10" width="24" height="18" rx="1"/><path d="M12 15h10M12 19h16M12 23h6"/><path d="M16 28v4M24 28v4M12 32h16"/><circle cx="27" cy="15" r="1.6" fill="currentColor" stroke="none"/>') },
    { id: 'warbonds', name: 'WAR BONDS', cat: 'support', unlock: 14, price: { nc: 2800, bt: 40 }, cost: 300, currency: 'mixed', limit: 1,
      tagline: 'Compound war chest — deposit salvage, watch it grow every cleared wave, withdraw whenever.',
      stats: { dmg: 0, rate: 0, rng: 0, bond: 0.12, bondCap: 3000, tgt: 'ECONOMY // WAR BONDS · DEPOSIT + COMPOUND INTEREST · ONE PER COMMANDER' },
      special: '>> The ZERO DAY rig prints flat salvage every wave — WAR BONDS makes your money WORK instead. Deposit $500 into the bond from the tower panel; every cleared wave pays compound interest straight into the bond (12% base), and WITHDRAW moves the whole war chest back to your wallet whenever you need it. The longer the run, the harder the bond works — GOLD STANDARD compounds 22% against a $12,000 cap. Only one war chest deploys per commander.',
      art: 'assets/towers/warbonds.webp',
      track: [
        { label: 'GREEN STAMPS', cost: 250, sets: { bond: 0.15 }, info: 'WAVE INTEREST 12% → 15%' },
        { label: 'WIDE LEDGER', cost: 450, sets: { bondCap: 5000 }, info: 'BOND CAP $3,000 → $5,000' },
        { label: 'COMPOUND ENGINE', cost: 900, sets: { bond: 0.18 }, info: 'WAVE INTEREST 15% → 18%' },
        { label: 'WAR CHEST', cost: 1600, sets: { bondCap: 8000 }, info: 'BOND CAP $5,000 → $8,000' },
        { label: 'GOLD STANDARD', cost: 2800, sets: { bond: 0.22, bondCap: 12000 }, info: 'INTEREST 18% → 22% · BOND CAP $8,000 → $12,000' },
      ],
      icon: ic('<circle cx="20" cy="20" r="11"/><path d="M16 16h8M16 20h8M16 24h5"/><path d="M20 9v3M20 28v3M9 20h3M28 20h3"/>') },
    { id: 'relay', name: 'COMMAND RELAY', cat: 'support', unlock: 18, price: { nc: 4300, bt: 70 }, cost: 400, currency: 'mixed', limit: 1,
      tagline: 'Network pylon — no guns, it just makes every gun inside its ring better.',
      stats: { dmg: 0, rate: 0, rng: 170, dmgBuff: 0.1, tgt: 'AURA // BUFFS EVERY TOWER IN THE RING · ONE PER COMMANDER' },
      special: '>> The first true support rig. Every tower inside the relay ring hits harder — and the ladder rewires the whole network: a wider ring, more damage, longer reach (TARGET UPLINK), faster clocks (MORALE CORE) and RALLY CRY, a salvage cast that floods the ring with overdrive fire rate. Only one relay deploys per commander.',
      art: 'assets/towers/relay.webp',
      track: [
        { label: 'WIDE NET', cost: 320, sets: { rng: 200 }, info: 'RELAY RING 170 → 200' },
        { label: 'POWER GRID', cost: 640, sets: { dmgBuff: 0.12 }, info: 'RING DAMAGE BUFF +10% → +12%' },
        { label: 'TARGET UPLINK', cost: 980, sets: { rangeBuff: 0.08 }, info: 'TOWERS IN RING GAIN +8% RANGE' },
        { label: 'MORALE CORE', cost: 1500, sets: { rateBuff: 0.08 }, info: 'TOWERS IN RING FIRE +8% FASTER' },
        { label: 'RALLY CRY', cost: 2400, sets: { rally: 1, rallyCost: 600, rallyCd: 45 }, info: 'ABILITY: $600 CAST · RING TOWERS +50% FIRE RATE FOR 6s · 45s COOLDOWN' },
      ],
      icon: ic('<path d="M20 34V16"/><circle cx="20" cy="12" r="2.2"/><path d="M13 15a10 10 0 0 1 3-6M27 15a10 10 0 0 0-3-6"/><path d="M9 19a15 15 0 0 1 4-9M31 19a15 15 0 0 0-4-9"/><path d="M12 34h16"/>') },
    { id: 'wardrums', name: 'WAR DRUMS', cat: 'support', unlock: 22, price: { nc: 3900, bt: 60 }, cost: 420, currency: 'mixed', limit: 1,
      tagline: 'Fragment beat — no gun of its own, but every gun in the ring suddenly splashes.',
      stats: { dmg: 0, rate: 0, rng: 150, frag: 0.1, fragRadius: 35, tgt: 'SUPPORT AURA // FRAG ROUNDS — NEARBY GUNS SPLASH · ONE PER COMMANDER' },
      special: '>> The drum beats and the whole network throws shrapnel: every tower inside the ring splashes 10% of its damage around whatever hull it just hit (35u frag ring). The ladder deepens the beat — wider ring, fatter frag, a 55u cluster ring — and WAR CHOIR teaches the drum to lob its own 140-damage frag shell every 4 seconds. Splash guns have nothing to gain; single-target guns become artillery. Only one drumline deploys per commander.',
      art: 'assets/towers/wardrums.webp',
      track: [
        { label: 'DEEPER SKINS', cost: 380, sets: { frag: 0.14 }, info: 'FRAG SPLASH 10% → 14% OF GUN DMG' },
        { label: 'WIDER BEAT', cost: 700, sets: { rng: 190 }, info: 'DRUM RING 150 → 190' },
        { label: 'CLUSTER BEAT', cost: 1200, sets: { fragRadius: 55 }, info: 'FRAG RING 35U → 55U' },
        { label: 'IRON RHYTHM', cost: 2000, sets: { frag: 0.18 }, info: 'FRAG SPLASH 14% → 18%' },
        { label: 'WAR CHOIR', cost: 3400, sets: { frag: 0.22, lob: 1, lobDmg: 140, lobSplash: 50 }, info: 'FRAG 18% → 22% · THE DRUM LOBS ITS OWN 140 DMG / 50U SHELL EVERY 4s' },
      ],
      icon: ic('<circle cx="20" cy="18" r="9"/><ellipse cx="20" cy="18" rx="9" ry="3"/><path d="M11 18v8M29 18v8M20 27v4M13 31h14"/><path d="M8 10l4 4M32 10l-4 4"/>') },
    { id: 'dawnbreaker', name: 'DAWNBRINGER', cat: 'special', unlock: 1, price: { nc: 250000, bt: 2500 }, cost: 1600, currency: 'mixed', event: true, limit: 1,
      tagline: 'CRIMSON RELIC — a dawn-forged solar lance that treats armor as a rumor.',
      stats: { dmg: 330, rate: 0.8, rng: 320, tgt: 'SINGLE / AIR + GROUND · IGNORES ARMOR · ONE PER COMMANDER' }, art: 'assets/towers/dawnbreaker.webp',
      special: '>> Forged in the only Crimson Dawn the grid will ever see. Every beam burns straight through armor plating at full damage, tracks air and ground without a hex pad, and the ladder ends in SUNSLAUGHTER: 1250-damage rounds with a burning 40-unit splash. The most expensive hardware the Nexus has ever inventoried — 250,000 NC + 2,500 BT declared value, 1,600 salvage to deploy and a doubled forge ladder — because a relic this insane should cost like it. It will never be sold, crafted or given again — survive the dawn or never hold it.',
      track: [
        { label: 'FIRST LIGHT', cost: 1600, sets: { dmg: 500, rate: 0.9 }, info: 'DMG 330 → 500 · RATE 0.8 → 0.9' },
        { label: 'MERIDIAN', cost: 2800, sets: { rng: 360, dmg: 700 }, info: 'RNG 320 → 360 · DMG 500 → 700' },
        { label: 'HIGH NOON', cost: 4500, sets: { dmg: 950, rate: 1 }, info: 'DMG 700 → 950 · RATE 0.9 → 1.0' },
        { label: 'SUNSLAUGHTER', cost: 7000, sets: { dmg: 1250, splash: 40 }, info: 'DMG 950 → 1250 · SOLAR BURN SPLASH 40U' },
      ],
      icon: ic('<circle cx="20" cy="20" r="6"/><path d="M20 4v6M20 30v6M4 20h6M30 20h6M8.6 8.6l4.3 4.3M27.1 27.1l4.3 4.3M31.4 8.6l-4.3 4.3M12.9 27.1l-4.3 4.3"/>') },
    { id: 'paragon', name: 'PARAGON', cat: 'special', unlock: 1, price: 0, cost: 500, currency: 'nc', golden: true, limit: 1,
      tagline: 'GOLDEN STANDARD — the trophy rig. Materializes only when every sector on the grid wears its Golden Seal.',
      stats: { dmg: 90, rate: 1, rng: 200, tithe: 0.15, tgt: 'GOLDEN STANDARD // AIR + GROUND · +15% BOUNTY IN RING · ONE PER COMMANDER' },
      special: '>> The reward for a perfect campaign: beat EASY, MEDIUM, HARD and INSANE on all five battle sectors to gild them, and the PARAGON materializes in your armory — free, singular, permanent. Its gilded barrel tracks air and ground without a pad, and the GOLDEN TITHE taxes every hostile killed inside its ring for +15% bounty (20% at the crown). It is never sold, only earned.',
      art: 'assets/towers/paragon.webp',
      track: [
        { label: 'GILDED BARREL', cost: 300, sets: { dmg: 120 }, info: 'DMG 90 → 120' },
        { label: 'AUREATE SCOPE', cost: 600, sets: { rng: 230 }, info: 'RNG 200 → 230' },
        { label: 'ROYAL WARRANT', cost: 1200, sets: { rate: 1.2, dmg: 150 }, info: 'RATE 1 → 1.2 · DMG 120 → 150' },
        { label: 'SOVEREIGN LOAD', cost: 2200, sets: { dmg: 190 }, info: 'DMG 150 → 190' },
        { label: 'CROWN JEWEL', cost: 4000, sets: { dmg: 240, tithe: 0.2, rng: 260 }, info: 'DMG 190 → 240 · TITHE 15% → 20% · RNG 230 → 260' },
      ],
      icon: ic('<circle cx="20" cy="22" r="6"/><path d="M20 5l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4-3.9-3.8 5.4-.8z"/><path d="M8 34h24" stroke-dasharray="2 3"/>') },
    { id: 'deathwarrant', name: 'DEATHWARRANT', cat: 'special', unlock: 20, cost: 900, limit: 1, ultimatum: true,
      tagline: 'ULTIMATUM CARD — the apex verdict. One shot. Every ten seconds. The biggest thing on the field simply stops existing.',
      stats: { dmg: 1500, rate: 0, rng: 460, warrantPct: 0.25, warrantCd: 12, tgt: 'ANNIHILATOR // ONE VERDICT EVERY 12s · HIGHEST-HULL LOCK · ONE PER COMMANDER' },
      special: '>> The DEATHWARRANT does not fight a battle — it executes a sentence. It locks the beefiest hostile in reach (air or ground, a 460u verdict ring), charges for twelve seconds under a growing ring and a lock reticle, then fires: 1,500 flat damage PLUS 25% of everything the target carries — the fatter the hull, the harder the hit — straight through armor and shields as phase damage. If the sentenced hull dies, DEATH ECHO detonates the corpse for 20% of its max hull across 90u. It fires nothing else. It never has to.',
      art: 'assets/towers/deathwarrant.webp',
      track: [
        { label: 'BLACK SITE OPTICS', cost: 800, sets: { rng: 520 }, info: 'VERDICT RING 460 → 520' },
        { label: 'HEAVY PAYLOAD', cost: 1800, sets: { dmg: 2200 }, info: 'FLAT PAYLOAD 1,500 → 2,200' },
        { label: 'GRAVE SENTENCE', cost: 3200, sets: { warrantPct: 0.3 }, info: 'TARGET MAX-HULL CUT 25% → 30%' },
        { label: 'SWIFT VERDICT', cost: 5000, sets: { warrantCd: 10 }, info: 'VERDICT CADENCE 12s → 10s' },
        { label: 'FINAL SENTENCE', cost: 8000, sets: { dmg: 3200, warrantPct: 0.35, echo: 1 }, info: 'PAYLOAD 2,200 → 3,200 · CUT 30% → 35% · DEATH ECHO UNLOCKED' },
      ],
      icon: ic('<path d="M20 6l8 14-8 14-8-14z"/><path d="M20 14l4 6-4 6-4-6z"/><circle cx="20" cy="20" r="1.6" fill="currentColor" stroke="none"/>') },
    { id: 'corpseblossom', name: 'CORPSE BLOSSOM', cat: 'special', unlock: 20, cost: 350, limit: 1, ultimatum: true,
      tagline: 'ULTIMATUM CARD — the grave warden. Anything that dies near it rises and walks the lane backwards.',
      stats: { dmg: 0, rate: 0, rng: 180, summon: 30, tgt: 'SPAWNER // NO ATTACK · ONE PER COMMANDER' },
      special: '>> The apex tier of the Nexus. When anything dies inside its ring, a weakened copy rises at its TRUE scaled hull and marches back down the track — mowing through up to four hostiles instead of dying on the first bump: every hostile it touches takes damage equal to the risen\u2019s full hull, and each mow costs the risen a quarter of that hull. Its own kills feed the Blood Lust bar — purge it for a burst of stored pain. Obtained only in the ULTIMATUM vault: two cores, one card armed at a time.',
      art: 'assets/towers/corpseblossom.webp',
      track: [
        { label: 'LARGER BRANCHES', cost: 140, sets: { rng: 200 }, info: 'RNG 180 → 200' },
        { label: 'BLOOD VEINS', cost: 550, sets: { veins: 60 }, info: 'AOE PULSE: 60 DMG · RANDOM RATE 0.1-1/s · VEIN KILLS RISE BLOOD STAINED (+50 HP SUMMONS)' },
        { label: 'LIFEBLOOD', cost: 625, sets: { rng: 230, summonHp: 0.38 }, info: 'RNG 200 → 230 · SUMMONS 30% → 38% HP' },
        { label: 'KINETIC STORAGE', cost: 1750, sets: { lust: 1 }, info: 'KILLS FEED BLOOD LUST · UNLOCKS BLOOD PURGE — RELEASES +1 DMG PER LUST ACROSS ALL RANGE' },
        { label: 'TRUE CORPSE BLOSSOM', cost: 3400, sets: { rng: 250, veins: 90, veinRate: [0.45, 1.3], summonHp: 0.6, lust: 3, stainedPct: 1, scream: 1 }, info: 'RNG 230 → 250 · VEINS 60 → 90 DMG · RATE 0.45-1.3/s · SUMMONS 60% HP · STAINED +10% HP · 3 LUST/KILL · BLOOD SCREAM ABILITY' },
      ],
      icon: ic('<circle cx="20" cy="20" r="4"/><path d="M20 16c-5-2-7-6-6-10 4 0 7 3 8 7M24 16c5-2 7-6 6-10-4 0-7 3-8 7M16 22c-4 2-8 2-11-1 2-3 6-4 10-3M24 22c4 2 8 2 11-1-2-3-6-4-10-3M17 25c-3 4-7 5-11 4 1-4 4-6 8-6M23 25c3 4 7 5 11 4-1-4-4-6-8-6"/>') },
    { id: 'gravewarden', name: 'GRAVE WARDEN', cat: 'special', unlock: 20, cost: 400, limit: 1, ultimatum: true,
      tagline: 'ULTIMATUM CARD — the second apex rig. A walled yard where the dead pay toll, the bell never rests, and the core gives up its souls.',
      stats: { dmg: 0, rate: 0, rng: 180, tgt: 'AURA // YARD CONTROL · ONE PER COMMANDER' },
      special: '>> The Warden keeps a walled yard: everything hostile inside drags its heels once the CHILL GRAVE is laid, and every death inside the yard rings the bell sooner. When the DEATH TOLL sounds, the whole yard takes the pulse and chaff is stunned where it stands. Tier 6 raises the SOUL CHOIR: the Warden pulls vengeful souls out of the core itself — hulls forged from the yard\u2019s toll — and the choir does not sing for free. Commanders are beneath its notice. Repriced to ONE core and weighted to match: the bell rings a touch softer, the yard drags a touch less, and the hymns cost $850 on a 40s rest. Obtained only in the ULTIMATUM vault: one card armed at a time.',
      art: 'assets/towers/gravewarden.webp',
      track: [
        { label: 'WIDER YARD', cost: 200, sets: { rng: 200 }, info: 'RNG 180 → 200' },
        { label: 'DEATH TOLL', cost: 600, sets: { bell: 100 }, info: 'BELL PULSE: 100 DMG EVERY 8s · 0.8s STUN · YARD KILLS RING IT SOONER' },
        { label: 'CHILL GRAVE', cost: 900, sets: { yardSlow: 0.4 }, info: 'YARD HOSTILES MOVE 40% SLOWER — WALKERS AND FLYERS ALIKE' },
        { label: 'TOLLING HOURS', cost: 1600, sets: { bell: 190, bellEvery: 6, rng: 220 }, info: 'BELL 100 → 190 DMG · CADENCE 8s → 6s · RNG 200 → 220' },
        { label: 'LAST TOLL', cost: 3200, sets: { bell: 330, bellEvery: 4.5, yardSlow: 0.5, tollStun: 1.4, rng: 245 }, info: 'BELL 190 → 330 DMG · CADENCE 4.5s · YARD -50% SPEED · STUN 1.4s' },
        { label: 'SOUL CHOIR', cost: 5200, sets: { soul: 1, soulCost: 850, soulCd: 40 }, info: 'SUMMON A VENGEFUL SOUL FROM THE CORE · HULL = 10 x TOLL CHARGES (MIN 60) · $850 PER SOUL · 40s COOLDOWN' },
      ],
      icon: ic('<circle cx="20" cy="21" r="8"/><path d="M20 13v-4M16 9h8"/><circle cx="20" cy="21" r="2.2" fill="currentColor" stroke="none"/><path d="M8 21c2-2 4-2 6 0M26 21c2-2 4-2 6 0"/>') },
    { id: 'executioner', name: 'EXECUTIONER', cat: 'special', unlock: 50, price: { nc: 12000, bt: 150 }, cost: 450, currency: 'mixed', limit: 3,
      tagline: 'The headsman\u2019s rail. Decrypts at Clearance 50 — it only has one job.',
      stats: { dmg: 72, rate: 0.45, rng: 240, execute: 0.12, tgt: 'MAX-HULL // AIR + GROUND · UP TO 3 PER COMMANDER', targeting: 'maxhp' },
      special: '>> The rail never wastes a round on the small stuff — chaff soaks a token 15% of the shot, while commanders (mini-bosses and bosses) pay full price. Its true work is the sentence: mark a commander below the execute threshold and the next round takes its head clean off. Only the final boss is beyond the blade. The priciest chassis in the standard rotation — and the only one that hunts commanders. Up to three rails per commander.',
      art: 'assets/towers/executioner.webp',
      track: [
        { label: 'WIDENED SLOTS', cost: 250, sets: { rng: 260 }, info: 'RNG 240 → 260' },
        { label: 'HARDENED ROUNDS', cost: 650, sets: { dmg: 140 }, info: 'DMG 72 → 140' },
        { label: 'BLOOD PRICE', cost: 1200, sets: { dmg: 210, rate: 0.55 }, info: 'DMG 140 → 210 · RATE 0.45 → 0.55' },
        { label: 'HEADSMAN', cost: 2200, sets: { execute: 0.18 }, info: 'EXECUTE THRESHOLD 12% → 18% OF COMMANDER HULL' },
        { label: 'FINAL RITUAL', cost: 3600, sets: { dmg: 330, rate: 0.68, execute: 0.22, chaffPct: 0.16 }, info: 'DMG 210 → 330 · RATE 0.68 · EXECUTE 22% · CHAFF PAYOUT 16%' },
      ],
      icon: ic('<path d="M20 6v22M14 28h12"/><path d="M20 10l9-4-3 8"/><circle cx="20" cy="17" r="3.4"/><path d="M11 28h18" stroke-dasharray="2 2"/>') },
    { id: 'virus', name: 'VIRUS', cat: 'special', unlock: 1, price: { nc: 2400, bt: 55 }, cost: 500, currency: 'mixed',
      tagline: 'Melee swarm chassis — blades that feast at contact range and infect what they touch.',
      stats: { dmg: 12, rate: 3, rng: 90, tgt: 'MELEE / GROUND + AIR' },
      special: '>> Shreds anything that steps into blade range — walkers and flyers alike. The CONTAGION ladder teaches the strain to infect: corrupted hostiles burn for its full tick every second, straight through armor plating and shield lattices. Expensive to field and to upgrade — but nothing mid-lane melts tanks like a maxed strain.',
      art: 'assets/towers/virus.webp',
      track: [
        { label: 'LARGER BLADES', cost: 650, sets: { dmg: 20, rng: 100 }, info: 'DMG 12 → 20 · RNG 90 → 100' },
        { label: 'SUPER VIRUS', cost: 900, sets: { dmg: 30, rate: 3.2, rng: 105 }, info: 'DMG 20 → 30 · RATE 3 → 3.2 · RNG 100 → 105' },
        { label: 'MALWARE STRAIN', cost: 1600, sets: { dmg: 42, rate: 3.5, rng: 110 }, info: 'DMG 30 → 42 · RATE 3.2 → 3.5 · RNG 105 → 110' },
        { label: 'CONTAGION', cost: 2400, sets: { dmg: 52, rate: 3.8, rng: 115, corrupt: 40 }, info: 'DMG 42 → 52 · RATE 3.5 → 3.8 · RNG 110 → 115 · HITS INFECT: 40/S CORRUPTION FOR 5S — IGNORES ARMOR + SHIELDS' },
        { label: 'ZERO PATIENT', cost: 3600, sets: { dmg: 64, rate: 3.8, rng: 120, corrupt: 55 }, info: 'DMG 52 → 64 · RATE 3.8 · RNG 115 → 120 · CORRUPTION 40 → 55/S' },
      ],
      icon: ic('<circle cx="20" cy="21" r="7"/><path d="M20 14V6"/><path d="M20 6l-4 3M20 6l4 3"/><path d="M14 25l-7 5"/><path d="M26 25l7 5"/><circle cx="20" cy="21" r="2.4" fill="currentColor" stroke="none"/>') },
  ];

  // --- ULTIMATUM vault: lifetime XP banks cores, cores buy cards -----------------
  // Mirrors server.js ULT_* — keep in sync.
  const ULT_XP_PER_CORE = 50000;
  const ULT_CARDS = [
    { id: 'corpseblossom', name: 'CORPSE BLOSSOM', cores: 2, unlock: 20,
      blurb: 'The apex reanimator reprices to TWO cores — and earns it: risen copies now forge from their true scaled hull and MOW through four hostiles instead of dying on the first bump.' },
    { id: 'gravewarden', name: 'GRAVE WARDEN', cores: 1, unlock: 20,
      blurb: 'One core banks the Warden: a walled yard where the dead pay toll. Weighted to match the cheaper seal — a softer bell, a lighter yard, and hymns at $850 on a 40s rest.' },
    { id: 'deathwarrant', name: 'DEATHWARRANT', cores: 3, unlock: 20,
      blurb: 'The apex verdict. Three cores buy a single annihilation rig: it locks the beefiest hull on the field, charges twelve seconds, then erases it — flat payload plus a quarter of everything the target carries, straight through armor and shields.' },
  ];

  let profile = { name: '', level: 1, xp: 0, xpNext: xpToNext(1), nc: 0, bt: 0, firstClear: false, owned: ['sentinel'], loadout: ['sentinel'], mapWins: {}, achievements: {}, equippedPerks: [], totalXp: 0, ultCores: 0, ultClaims: 0, admin: false };
  // Belt-and-braces: a profile snapshot may predate the admin flag (login race,
  // old cache), so the shop ALSO honors the admin roster by commander name —
  // mirrors server.js ADMIN_NAMES. Server still enforces purchases.
  const ADMIN_NAMES = new Set(['JACKSONLOOMIS-COMMITS']);
  const isAdminProfile = (p) => Boolean(p && (p.admin || ADMIN_NAMES.has(String(p.name || '').toUpperCase())));
  const MAX_BAYS = 5;

  // Dual-currency prices arrive as { nc, bt }; single-currency as a number.
  const priceOf = (entry) => (typeof entry.price === 'object' ? entry.price : { [entry.currency || 'nc']: entry.price || 0 });
  const canAfford = (entry) => {
    const cost = priceOf(entry);
    return profile.nc >= (cost.nc || 0) && profile.bt >= (cost.bt || 0);
  };
  const priceLabel = (entry) => {
    const cost = priceOf(entry);
    const parts = [];
    if (cost.nc) parts.push(`<i class="tok tok-nc">NC</i>${format(cost.nc)}`);
    if (cost.bt) parts.push(`<i class="tok tok-bt">BT</i>${format(cost.bt)}`);
    return parts.join(' ') || 'FREE';
  };
  // Tower decal art: generated portraits, one unique emblem per chassis.
  const artHtml = (entry) => (entry.art ? `<img class="tw-art" src="${entry.art}" alt="${entry.name} decal" loading="lazy" onerror="this.remove()">` : '');
  const trackHtml = (entry) => (!entry.track ? '' : `<div class="tc-track"><span class="tc-track-head">UPGRADE TRACK — ${entry.track.length} TIERS</span>${entry.track.map((tier, i) =>
    `<div class="tc-tier"><span>${String(i + 1).padStart(2, '0')}</span><b>${tier.label}</b><small>${tier.info}</small><em>$${format(tier.cost)}</em></div>`).join('')}</div>`);
  let container = null;
  let filter = 'all';
  let armed = null;
  let armedTimer = 0;
  let armedCard = null;

  const towerById = (id) => TOWERS.find((entry) => entry.id === id);
  const format = (value) => Number(value || 0).toLocaleString('en-US');

  function setProfile(next) {
    const before = profile.level;
    profile = { ...profile, ...next };
    profile.xpNext = xpToNext(profile.level);
    // A loadout may only ever reference blueprints the commander owns — AND blueprints
    // that still exist. Retired rosters (RIP ARCLANCE) left ghost ids in stored loadouts:
    // the bay rendered EMPTY but the 5-bay cap still counted it, so a fifth tower could
    // never be equipped. Purging catalog-dead ids here heals the strip, the cap check,
    // the header count and the in-mission bar in one stroke.
    profile.loadout = (Array.isArray(profile.loadout) ? profile.loadout : [])
      .map(String).filter((id, index, list) => list.indexOf(id) === index && towerById(id) && profile.owned.includes(id)).slice(0, MAX_BAYS);
    // ULTIMATUM rule — at most ONE Ultimatum card armed at a time.
    let ultSeen = false;
    profile.loadout = profile.loadout.filter((id) => { const e = towerById(id); if (e && e.ultimatum) { if (ultSeen) return false; ultSeen = true; } return true; });
    if (!profile.loadout.length && profile.owned.length) profile.loadout = [profile.owned[0]];
    if (profile.level > before) {
      showToast(`CLEARANCE LEVEL UP — LV ${profile.level} UNLOCKED`);
      playSound();
      const badge = container && container.querySelector('#shop-level-badge');
      if (badge) { badge.classList.remove('levelup'); void badge.offsetWidth; badge.classList.add('levelup'); }
    }
    if (container) repaint();
    if (typeof window.paintWallet === 'function') window.paintWallet();
  }

  function visibility(entry) {
    // FULL CLEARANCE — the site admin sees and buys the entire grid at any level.
    const clearanceOk = isAdminProfile(profile) || profile.level >= entry.unlock;
    // ULTIMATUM cards never render in the blueprint grid — they live in the vault tab.
    if (entry.ultimatum) return profile.owned.includes(entry.id) ? 'owned' : 'ultimatum';
    // CRIMSON RELIC: event = relic blueprints — never purchasable, they materialize
    // in the armory only when the commander survives the event.
    if (profile.owned.includes(entry.id)) return 'owned';
    if (entry.event) return 'event-locked';
    // GOLDEN STANDARD: the PARAGON is never sold — it materializes when every
    // sector wears its Golden Seal (auto-granted server-side; this is the UI).
    if (entry.golden && !allSeals(profile.mapWins)) return 'gold-locked';
    if (entry.reward && !profile.firstClear) return 'reward-locked';
    if (clearanceOk) return 'buy';
    if (profile.level >= entry.unlock - HORIZON) return 'locked';
    return 'hidden';
  }

  function hiddenCount() {
    return TOWERS.filter((entry) => !entry.ultimatum && visibility(entry) === 'hidden').length;
  }

  // --- Deployment loadout: the blueprints carried into a mission -----------------
  const loadoutHeadText = () => `${profile.loadout.length}/${MAX_BAYS} BAYS ARMED // ${profile.owned.length} BLUEPRINT${profile.owned.length === 1 ? '' : 'S'} OWNED — EARN OR BUY MORE TO FILL EVERY BAY`;
  function paintBays() {
    const wrap = container && container.querySelector('#ls-bays');
    if (!wrap) return;
    const head = container.querySelector('.ls-head small');
    if (head) head.textContent = loadoutHeadText();
    const bays = [0, 1, 2, 3, 4].map((index) => {
      const entry = (profile.loadout || [])[index] && towerById(profile.loadout[index]);
      if (!entry) return `<div class="ls-bay ls-empty"><small>BAY ${index + 1}</small><b>EMPTY</b><small>EQUIP BELOW</small></div>`;
      return `<div class="ls-bay filled cat-${entry.cat}"><small>BAY ${index + 1}</small><span class="ls-icon">${artHtml(entry) || entry.icon}</span><b>${entry.name}</b><small>$${entry.cost} SALVAGE IN MISSION</small></div>`;
    });
    wrap.innerHTML = bays.join('');
  }

  function toggleEquip(id) {
    const entry = towerById(id);
    if (!entry || !profile.owned.includes(id)) return;
    const spot = profile.loadout.indexOf(id);
    if (spot >= 0) {
      profile.loadout.splice(spot, 1);
    } else {
      // ULTIMATUM rule — one card armed at a time. Mirrors the Nexus validators.
      const armedCard = profile.loadout.some((bid) => { const other = towerById(bid); return bid !== id && other && other.ultimatum; });
      if (entry.ultimatum && armedCard) {
        playSound('alarm');
        showToast('ONLY ONE ULTIMATUM CARD CAN BE ARMED — unequip the current card first.');
        return;
      }
      if (profile.loadout.length >= MAX_BAYS) {
        playSound('alarm');
        showToast('Loadout full — all 5 bays are occupied. Unequip a blueprint first.');
        return;
      }
      profile.loadout.push(id);
    }
    playSound();
    persistLoadout();
    repaint();
  }

  async function persistLoadout() {
    try { localStorage.setItem('cbz-loadout', JSON.stringify(profile.loadout)); } catch { /* storage optional. */ }
    try {
      const data = await apiRequest('/api/loadout', { token: localStorage.getItem('cbz-token') || '', loadout: profile.loadout });
      const before = profile.level;
      profile = { ...profile, ...data.profile };
      profile.xpNext = xpToNext(profile.level);
      if (profile.level > before && typeof window.paintWallet === 'function') window.paintWallet();
    } catch (error) {
      // The Nexus refused the bay layout — say why instead of silently reverting.
      showToast(error.message || 'Loadout rejected by the Nexus link.');
      repaint();
    }
  }

  function meters(entry) {
    const caps = { dmg: 160, rate: 3.5, rng: 260 };
    const pct = (value, cap) => `${Math.max(3, Math.min(100, Math.round((value / cap) * 100)))}%`;
    const splash = entry.stats.splash ? `<div class="tc-meter"><span>SPLASH</span><div class="tm-track"><i style="width:${pct(entry.stats.splash, 80)}"></i></div><b>${entry.stats.splash}U</b></div>` : '';
    const income = entry.stats.income ? `<div class="tc-meter"><span>INCOME</span><div class="tm-track"><i style="width:${pct(entry.stats.income, 1000)}"></i></div><b>$${format(entry.stats.income)}/WAVE</b></div>` : '';
    const summon = entry.stats.summon ? `<div class="tc-meter"><span>SUMMON</span><div class="tm-track"><i style="width:${pct(entry.stats.summon, 100)}"></i></div><b>${entry.stats.summon}% HP</b></div>` : '';
    const drone = entry.stats.drone ? `<div class="tc-meter"><span>DRONE</span><div class="tm-track"><i style="width:${pct(entry.stats.drone, 300)}"></i></div><b>${entry.stats.drone} DMG/HULL</b></div>` : '';
    const corrupt = entry.stats.corrupt ? `<div class="tc-meter"><span>CONTAGION</span><div class="tm-track"><i style="width:${pct(entry.stats.corrupt, 80)}"></i></div><b>${entry.stats.corrupt}/S · 5S</b></div>` : '';
    const slow = entry.stats.slow ? `<div class="tc-meter"><span>SLICK</span><div class="tm-track"><i style="width:${pct(entry.stats.slow * 100, 50)}"></i></div><b>SLOW ${Math.round(entry.stats.slow * 100)}%</b></div>` : '';
    const buff = entry.stats.dmgBuff ? `<div class="tc-meter"><span>NETWORK</span><div class="tm-track"><i style="width:${pct((entry.stats.dmgBuff || 0) * 100, 30)}"></i></div><b>+${Math.round((entry.stats.dmgBuff || 0) * 100)}% DMG</b></div>` : '';
    const bond = entry.stats.bond ? `<div class="tc-meter"><span>BOND</span><div class="tm-track"><i style="width:${pct(entry.stats.bond * 100, 25)}"></i></div><b>+${Math.round(entry.stats.bond * 100)}%/WAVE · $${format(entry.stats.bondCap || 3000)} CAP</b></div>` : '';
    const frag = entry.stats.frag ? `<div class="tc-meter"><span>FRAG</span><div class="tm-track"><i style="width:${pct(entry.stats.frag * 100, 25)}"></i></div><b>+${Math.round(entry.stats.frag * 100)}% SPLASH · ${entry.stats.fragRadius || 35}U</b></div>` : '';
    const warrant = entry.stats.warrantPct ? `<div class="tc-meter"><span>VERDICT</span><div class="tm-track"><i style="width:${pct(entry.stats.warrantPct * 100, 40)}"></i></div><b>${format(entry.stats.dmg)} + ${Math.round(entry.stats.warrantPct * 100)}% MAX HULL</b></div>` : '';
    const tithe = entry.stats.tithe ? `<div class="tc-meter"><span>TITHE</span><div class="tm-track"><i style="width:${pct(entry.stats.tithe * 100, 25)}"></i></div><b>+${Math.round(entry.stats.tithe * 100)}% BOUNTY</b></div>` : '';
    const row = (label, value, cap, suffix = '') => (value ? `<div class="tc-meter"><span>${label}</span><div class="tm-track"><i style="width:${pct(value, cap)}"></i></div><b>${value >= 999 ? 'INF' : value}${suffix}</b></div>` : '');
    return `${row('DMG', entry.stats.dmg, caps.dmg)}${row('RATE', entry.stats.rate, caps.rate, '/s')}${row('RNG', entry.stats.rng, caps.rng)}${splash}${income}${summon}${drone}${corrupt}${slow}${buff}${bond}${frag}${warrant}${tithe}`;
  }

  function cardHtml(entry) {
    const vis = visibility(entry);
    if (vis === 'locked') {
      return `
        <article class="tower-card state-locked cat-${entry.cat}" data-id="${entry.id}">
          <div class="tc-top"><span class="tc-cat">${CATEGORIES[entry.cat].label}</span><span class="tc-unlock">CLEARANCE ${entry.unlock}</span></div>
          <div class="tc-icon">${artHtml(entry) || entry.icon}</div>
          <h4>${entry.name}</h4>
          <p class="tc-tagline">${entry.tagline}</p>
          <div class="tc-stats">${meters(entry)}</div>
          <div class="tc-target">${entry.stats.tgt}</div>
          <p class="tc-special">${entry.special}</p>
          ${trackHtml(entry)}
          <div class="tc-lock"><span>SIGNAL ENCRYPTED</span><b>LV ${entry.unlock}</b></div>
        </article>`;
    }
    if (vis === 'event-locked') {
      return `
        <article class="tower-card state-event state-locked cat-${entry.cat}" data-id="${entry.id}">
          <div class="tc-top"><span class="tc-cat">${CATEGORIES[entry.cat].label}</span><span class="tc-unlock">CRIMSON RELIC</span></div>
          <div class="tc-icon">${artHtml(entry) || entry.icon}</div>
          <h4>${entry.name}</h4>
          <p class="tc-tagline">${entry.tagline}</p>
          <div class="tc-stats">${meters(entry)}</div>
          <div class="tc-target">${entry.stats.tgt}</div>
          <p class="tc-special">${entry.special}</p>
          ${trackHtml(entry)}
          <div class="tc-lock crimson-lock"><span>EVENT RELIC</span><b>SLAY THE CRIMSON DAWN</b></div>
        </article>`;
    }
    if (vis === 'reward-locked') {
      return `
        <article class="tower-card state-locked state-reward cat-${entry.cat}" data-id="${entry.id}">
          <div class="tc-top"><span class="tc-cat">${CATEGORIES[entry.cat].label}</span><span class="tc-unlock">REWARD BLUEPRINT</span></div>
          <div class="tc-icon">${artHtml(entry) || entry.icon}</div>
          <h4>${entry.name}</h4>
          <p class="tc-tagline">${entry.tagline}</p>
          <div class="tc-stats">${meters(entry)}</div>
          <div class="tc-target">${entry.stats.tgt}</div>
          <p class="tc-special">${entry.special}</p>
          ${trackHtml(entry)}
          <div class="tc-lock"><span>MISSION REWARD</span><b>BEAT EASY MODE</b></div>
        </article>`;
    }
    if (vis === 'gold-locked') {
      return `
        <article class="tower-card state-locked state-gold cat-${entry.cat}" data-id="${entry.id}">
          <div class="tc-top"><span class="tc-cat">${CATEGORIES[entry.cat].label}</span><span class="tc-unlock">GOLDEN STANDARD</span></div>
          <div class="tc-icon">${artHtml(entry) || entry.icon}</div>
          <h4>${entry.name}</h4>
          <p class="tc-tagline">${entry.tagline}</p>
          <div class="tc-stats">${meters(entry)}</div>
          <div class="tc-target">${entry.stats.tgt}</div>
          <p class="tc-special">${entry.special}</p>
          ${trackHtml(entry)}
          <div class="tc-lock gold-lock"><span>PERFECT CAMPAIGN</span><b>GILD ALL 5 SECTORS</b></div>
        </article>`;
    }
    const owned = vis === 'owned';
    const affordable = canAfford(entry);
    const arming = !owned && affordable && armed === entry.id;
    return `
      <article class="tower-card state-${owned ? 'owned' : 'buy'} cat-${entry.cat}" data-id="${entry.id}">
        <div class="tc-top"><span class="tc-cat">${CATEGORIES[entry.cat].label}</span><span class="tc-unlock">${owned ? 'DEPLOYED' : `CLEARANCE ${entry.unlock}`}</span></div>
        <div class="tc-icon">${artHtml(entry) || entry.icon}</div>
        <h4>${entry.name}</h4>
        <p class="tc-tagline">${entry.tagline}</p>
        <div class="tc-stats">${meters(entry)}</div>
        <div class="tc-target">${entry.stats.tgt}</div>
        <p class="tc-special">${entry.special}</p>
        ${trackHtml(entry)}
        ${owned ? `<button class="tc-equip${profile.loadout.includes(entry.id) ? ' on' : ''}" type="button" data-equip="${entry.id}">${profile.loadout.includes(entry.id) ? 'UNEQUIP FROM LOADOUT' : 'EQUIP TO LOADOUT'}</button>` : `<button class="tc-buy${affordable ? '' : ' cant'}${arming ? ' arm' : ''}" type="button" data-buy="${entry.id}">${arming ? 'CONFIRM PURCHASE?' : priceLabel(entry)}</button>`}
      </article>`;
  }

  function render(target) {
    container = target;
    filter = 'all';
    armed = null;
    armedCard = null;
    container.innerHTML = `
      <header class="shop-head">
        <div><span class="shop-kicker">// NEXUS MARKETPLACE</span><h3>BLUEPRINT EXCHANGE</h3></div>
        <span class="shop-horizon">DECRYPT HORIZON: 10 LV</span>
      </header>
      <div class="shop-wallet">
        <div class="shop-level">
          <div class="shop-level-badge" id="shop-level-badge"><b id="shop-level">${profile.level}</b><span>CLEARANCE</span></div>
          <div class="shop-xp"><div class="shop-xp-head"><span>CLEARANCE PROGRESS — UNCAPPED</span><span id="shop-xp-num"></span></div><div class="shop-xp-track"><i id="shop-xp-fill"></i></div></div>
        </div>
        <div class="shop-currencies">
          <div class="cur-chip cur-xp"><i class="tok tok-xp">XP</i><div><b id="shop-totalxp">0</b><span>TOTAL XP // LIFETIME</span></div></div>
          <div class="cur-chip cur-nc"><i class="tok tok-nc">NC</i><div><b id="shop-nc">0</b><span>NEXUS COINS</span></div></div>
          <div class="cur-chip cur-bt"><i class="tok tok-bt">BT</i><div><b id="shop-bt">0</b><span>BREACH TOKENS</span></div></div>
        </div>
      </div>
      <div class="loadout-strip" id="loadout-strip">
        <div class="ls-head"><span>// DEPLOYMENT LOADOUT</span><small></small></div>
        <div class="ls-bays" id="ls-bays"></div>
      </div>
      <p class="shop-note">Nexus Coins flow from every wave, boss and cleared sector. <b>Breach Tokens</b> drop only from boss kills, flawless defenses and first clearances. New blueprints decrypt 10 clearance levels before they unlock — beyond that range, their signals stay hidden. Equipped blueprints deploy from the loadout bar in battle; towers you place claim a clearance box on the grid that blocks overlapping builds.</p>
      <div class="shop-tabs" id="shop-tabs"></div>
      <div class="shop-grid" id="shop-grid"></div>
      <div id="shop-ultimatum" hidden></div>
      <div class="shop-encrypted" id="shop-encrypted" hidden></div>`;
    container.querySelector('#shop-tabs').innerHTML = Object.entries(CATEGORIES).map(([id, cat]) => `<button class="shop-tab${id === 'all' ? ' on' : ''}" type="button" data-cat="${id}">${cat.label}</button>`).join('')
      + '<button class="shop-tab shop-tab-ult" type="button" data-cat="__ult">★ ULTIMATUM</button>';
    container.querySelector('#shop-tabs').addEventListener('click', (event) => {
      const tab = event.target.closest('[data-cat]');
      if (!tab) return;
      filter = tab.dataset.cat;
      container.querySelectorAll('.shop-tab').forEach((el) => el.classList.toggle('on', el === tab));
      playSound();
      repaint();
    });
    container.querySelector('#shop-grid').addEventListener('click', onGridClick);
    container.querySelector('#shop-ultimatum').addEventListener('click', onUltClick);
    repaint();
  }

  function repaint() {
    if (!container) return;
    const grid = container.querySelector('#shop-grid');
    if (!grid) return;
    paintBays();
    const ultView = filter === '__ult';
    const list = TOWERS.filter((entry) => !entry.ultimatum && (filter === 'all' || entry.cat === filter) && visibility(entry) !== 'hidden');
    grid.innerHTML = ultView ? '' : list.map(cardHtml).join('');
    grid.hidden = ultView;
    const ultPanel = container.querySelector('#shop-ultimatum');
    if (ultPanel) {
      ultPanel.hidden = !ultView;
      if (ultView) ultPanel.innerHTML = ultPanelHtml();
    }
    const level = container.querySelector('#shop-level');
    if (level) level.textContent = profile.level;
    const totalXp = container.querySelector('#shop-totalxp');
    if (totalXp) totalXp.textContent = format(profile.totalXp || 0);
    const nc = container.querySelector('#shop-nc');
    if (nc) nc.textContent = format(profile.nc);
    const bt = container.querySelector('#shop-bt');
    if (bt) bt.textContent = format(profile.bt);
    const xpNum = container.querySelector('#shop-xp-num');
    const xpFill = container.querySelector('#shop-xp-fill');
    if (xpNum) xpNum.textContent = `${format(profile.xp)} / ${format(profile.xpNext)} XP`;
    if (xpFill) xpFill.style.width = `${Math.min(100, Math.round((profile.xp / profile.xpNext) * 100))}%`;
    const encrypted = container.querySelector('#shop-encrypted');
    if (encrypted) {
      const count = ultView ? 0 : hiddenCount();
      encrypted.hidden = count === 0;
      encrypted.innerHTML = `<span>▲</span> ${count} ENCRYPTED BLUEPRINT${count === 1 ? '' : 'S'} BEYOND DECRYPT HORIZON <span>▲</span>`;
    }
  }

  // --- ULTIMATUM vault panel -----------------------------------------------------
  function ultPanelHtml() {
    const total = profile.totalXp || 0;
    const banked = Math.floor(total / ULT_XP_PER_CORE);
    const ready = Math.max(0, banked - (profile.ultClaims || 0));
    const intoCore = total % ULT_XP_PER_CORE;
    const pct = Math.min(100, Math.round((intoCore / ULT_XP_PER_CORE) * 100));
    const cards = ULT_CARDS.map((card) => {
      const tower = towerById(card.id);
      const owned = profile.owned.includes(card.id);
      const locked = !isAdminProfile(profile) && profile.level < card.unlock;
      const armedHere = owned && profile.loadout.includes(card.id);
      const arming = !owned && (profile.ultCores || 0) >= card.cores && armedCard === card.id;
      const action = owned
        ? `<button class="ult-buy${armedHere ? ' on' : ''}" type="button" data-equip="${card.id}">${armedHere ? 'UNEQUIP CARD' : 'ARM CARD'}</button>`
        : locked
          ? `<button class="ult-buy cant" type="button" disabled>CLEARANCE ${card.unlock} REQUIRED</button>`
          : `<button class="ult-buy${(profile.ultCores || 0) >= card.cores ? '' : ' cant'}${arming ? ' arm' : ''}" type="button" data-ult-buy="${card.id}">${arming ? 'SPEND THE CORE?' : `<i class="tok tok-ult">UC</i>${card.cores} CORE${card.cores === 1 ? '' : 'S'}`}</button>`;
      return `
        <article class="ult-card${owned ? ' owned' : ''}" data-ult-card="${card.id}">
          <div class="ult-card-top"><span>// ULTIMATUM CARD</span><b>${owned ? 'IN THE ARMORY' : `${card.cores} CORE${card.cores === 1 ? '' : 'S'}`}</b></div>
          ${tower ? artHtml(tower) : ''}
          <h4>${card.name}</h4>
          <p>${card.blurb}</p>
          ${tower ? `<div class="ult-stats"><span>${tower.stats.tgt}</span></div>` : ''}
          ${tower ? trackHtml(tower) : ''}
          ${action}
        </article>`;
    }).join('');
    return `
      <div class="ult-hero">
        <div class="ult-total"><span>★</span> ${format(total)}<small>TOTAL XP // EVERY MISSION, BOSS AND SALVAGE CODE — FOREVER</small></div>
        <div class="ult-core">
          <div class="ult-core-head"><span>PROGRESS INTO THE NEXT CORE</span><b>${format(intoCore)} / ${format(ULT_XP_PER_CORE)} XP</b></div>
          <div class="ult-core-track"><i style="width:${pct}%"></i></div>
          <div class="ult-core-foot"><span>BANKED: ${banked} · CLAIMED: ${profile.ultClaims || 0} · UNSPENT CORES: ${profile.ultCores || 0}</span><span>${ULT_XP_PER_CORE.toLocaleString('en-US')} XP PER CORE</span></div>
        </div>
        <button class="ult-exchange${ready > 0 ? ' ready' : ''}" type="button" data-ult-exchange="1" ${ready > 0 ? '' : 'disabled'}>${ready > 0 ? `EXCHANGE ${format(ULT_XP_PER_CORE)} XP // BANK ${ready} ULTIMATUM CORE${ready === 1 ? '' : 'S'}` : `REACH ${format(ULT_XP_PER_CORE)} TOTAL XP TO BANK A CORE`}</button>
        <p class="ult-note">The progress bar counts into your NEXT core — banking one never resets or spends your TOTAL XP (the ★ number above). The exchange NEVER touches your clearance, wallet or armory — levels and owned towers are safe forever. Cores only ever grow.</p>
      </div>
      <div class="ult-grid">${cards}</div>`;
  }

  async function ultimatumAction(payload, button) {
    if (button) { button.disabled = true; }
    try {
      const data = await apiRequest('/api/ultimatum', { token: localStorage.getItem('cbz-token') || '', ...payload });
      setProfile(data.profile);
      playSound();
      if (payload.action === 'exchange') showToast(`ULTIMATUM CORE BANKED — ${(profile.ultCores || 0)} UNSPENT.`);
      if (payload.action === 'buy') showToast(`ULTIMATUM CARD ACQUIRED: ${ULT_CARDS.find((c) => c.id === payload.card)?.name || 'CARD'} — welcome to the apex tier.`);
      repaint();
    } catch (error) {
      playSound('alarm');
      showToast(error.message);
      armedCard = null;
      repaint();
    }
  }

  function onUltClick(event) {
    const equip = event.target.closest('[data-equip]');
    if (equip) { toggleEquip(equip.dataset.equip); return; }
    const exchange = event.target.closest('[data-ult-exchange]');
    if (exchange && !exchange.disabled) { ultimatumAction({ action: 'exchange' }, exchange); return; }
    const buy = event.target.closest('[data-ult-buy]');
    if (!buy) return;
    const cardId = buy.dataset.ultBuy;
    if (armedCard !== cardId) {
      armedCard = cardId;
      repaint();
      return;
    }
    armedCard = null;
    ultimatumAction({ action: 'buy', card: cardId }, buy);
  }

  function onGridClick(event) {
    const equip = event.target.closest('[data-equip]');
    if (equip) { toggleEquip(equip.dataset.equip); return; }
    const button = event.target.closest('[data-buy]');
    if (!button) return;
    const entry = towerById(button.dataset.buy);
    if (!entry) return;
    if (!canAfford(entry)) {
      playSound('alarm');
      const card = button.closest('.tower-card');
      if (card) { card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake'); }
      const cost = priceOf(entry);
      const short = [];
      if (profile.nc < (cost.nc || 0)) short.push(`${format((cost.nc || 0) - profile.nc)} NC`);
      if (profile.bt < (cost.bt || 0)) short.push(`${format((cost.bt || 0) - profile.bt)} BT`);
      showToast(`SHORT ON SALVAGE FOR ${entry.name}: NEED ${short.join(' + ')} MORE. Boss kills, flawless defenses and first clearances pay Breach Tokens.`);
      return;
    }
    if (armed !== entry.id) {
      armed = entry.id;
      repaint();
      return;
    }
    clearTimeout(armedTimer);
    armed = null;
    purchase(entry, button);
  }

  async function purchase(entry, button) {
    button.disabled = true;
    button.textContent = 'TRANSFERRING…';
    try {
      const data = await apiRequest('/api/shop/purchase', { token: localStorage.getItem('cbz-token') || '', itemId: entry.id });
      setProfile(data.profile);
      playSound();
      showToast(`ACQUIRED: ${entry.name} — added to your armory.`);
      const card = container && container.querySelector(`.tower-card[data-id="${entry.id}"]`);
      if (card) card.classList.add('bought');
    } catch (error) {
      playSound('alarm');
      showToast(error.message);
      repaint();
    }
  }

  async function submitMission(payload) {
    try {
      const data = await apiRequest('/api/mission/complete', { token: localStorage.getItem('cbz-token') || '', ...payload });
      setProfile(data.profile);
      return data;
    } catch {
      return null;
    }
  }

  // Salvage-code redemption — server route + LOCAL mirror share the same contract.
  // Codes validate server-side (and in LOCAL mode) against a one-time-per-commander
  // ledger, so there is no admin surface to abuse.
  // Perk loadout — persist the two tactical slots through the Nexus link.
  async function setPerks(perks) {
    const data = await apiRequest('/api/perks', { token: localStorage.getItem('cbz-token') || '', perks });
    setProfile(data.profile);
    return data.profile;
  }

  async function redeemCode(code) {
    const data = await apiRequest('/api/redeem', { token: localStorage.getItem('cbz-token') || '', code });
    setProfile(data.profile);
    return data.granted || null;
  }

  return { render, setProfile, submitMission, redeemCode, setPerks, profile: () => profile, loadout: () => (profile.loadout || []).map(towerById).filter(Boolean), TOWERS, xpToNext, HORIZON, MAX_BAYS, ULT_CARDS, ULT_XP_PER_CORE, artHtml };
})();
