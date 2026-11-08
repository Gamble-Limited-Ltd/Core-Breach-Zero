// --- Update log: every deployment to the grid, newest first ----------------------
export const BUILD = '2026.11.06';
export const UPDATE_LOG = [
  {
    version: '2026.11.06', tag: 'HOSTING PREP',
    items: [
      ['UI', 'Credits you can read — "Game created and owned by Jackson Loomis. Hosted and assisted by Gamble Limited Ltd." now shows on the home screen, the login card and a new ABOUT & CREDITS menu entry (never inside a match).'],
      ['PERF', 'Tower art went from 2.7 MB of mislabelled JPEGs to 850 KB of 512px WebP, and the server now sends cache headers, ETags and gzip: repeat visits revalidate with a 304, versioned scripts cache for a year, and text files shrink by about three quarters on school networks.'],
      ['OPS', 'The code split begins — the Nexus Shop and the menu shell moved into native ES modules (src/shop/*, app.js plus src/app/ for the update log, progression tables and battle maps, combat.js plus src/combat/data.js for the enemy roster, wave ladders and tower rules): same game, smaller files to maintain.'],
      ['OPS', 'Image types (png, webp, svg) now carry their real content type; the smoke test covers mime, cache, 304 and gzip.'],
    ],
  },
  {
    version: '2026.11.05', tag: 'GLL FOUNDATIONS',
    items: [
      ['NEW', 'GLL hosting merge — Gamble Limited Ltd now hosts the grid (HALL): PolyForm Noncommercial license + NOTICE, a draft Terms page, and an AGENTS.md rulebook that every agent and human reads first, every session.'],
      ['OPS', 'npm test is law — one command runs every suite (towers, crimson, hard, relay, smoke, rooms, admin, shop, loadout), each on its own throwaway server + accounts file, with a mid-run restart that proves account data survives reboot. CI enforces it on every push to main.'],
      ['SEC', 'The hardcoded admin salvage code is retired — the admin key now loads from the ADMIN_KEY_CODE environment variable only (8+ characters, empty = disabled), and the static file server refuses dotfiles and accounts files outright. ACCOUNTS_FILE is now configurable for hosters.'],
      ['UI', 'Footer credit line — Made by Loomis / Hosted by Gamble Limited Ltd / Terms.'],
    ],
  },
  {
    version: '2026.11.04', tag: 'FIELD AUDIT',
    items: [
      ['BAL', 'THE FIELD AUDIT — every chassis on the grid went under the same ruler: raw damage-per-second per salvage invested, base AND maxed, every rung of every ladder, splash rings priced at realistic pack density. Verdict: the roster sits in a healthy band — SHREDDER 15 salvage-per-DPS maxed, SENTINEL 16, FLAK POST 21, SNIPER 22, SHOTGUNNER 27, THE VETERAN 27 (40 without Fire Discipline heat), MISSILE SILO 31, VIRUS 32, EXECUTIONER 37 — and the fillers keep their cheap-and-limited identity by design (SPARK COIL 34, TAR SPRAYER never kills). The support shelf (RELAY, WAR DRUMS, WAR BONDS, ZERO DAY) is aura/economy math, not DPS math, and passes. Two chassis failed the audit and get rebuilt below.'],
      ['MORTAR', 'LAZER MORTAR\u2019s ladder ran UPSIDE DOWN — TRUE MORTAR actually LOWERED the mortar\u2019s damage-per-second (the 0.35→0.25 rate cut bit deeper than the 80→100 damage raised it) and USA FUNDING only clawed back to 28 DPS for 2,000 salvage. The Easy-Mode trophy now climbs like one: HIGHLY EXPLOSIVE ROUNDS 80→90 damage, TRUE MORTAR 130 damage with the 0.35 clock kept, and USA FUNDING 190-damage shells on a 75-unit splash at 245 reach. Every rung is strictly better: 21 → 31 → 45 → 66 DPS.'],
      ['CARRIER', 'DRONE SPAWNER was the worst salvage-to-damage rig on the grid — maxed APEX CARRIER worked out to ~67 DPS for 3,885 invested. The line goes back on a war footing: the base fabricates 90-payload warbirds every 5 seconds (was 70 every 6), WARBIRD CHASSIS 110→150, SWARM LOGIC 160→220 on a 3.2s cadence, and the APEX CARRIER fields 300-payload monsters every 2.6 seconds at 230u reach — 115 DPS of pad-free, air-and-ground delivery that cannot be dodged, only outrun.'],
    ],
  },
  {
    version: '2026.11.03', tag: 'GOLDEN VETERANS',
    items: [
      ['GOLDEN', 'GOLDEN SEALS go live — beat EASY, MEDIUM, HARD and INSANE on a battle sector and it GILDS: a living gold border on the map card in recon AND squad bays. The first time a sector gilds, the commander collects a one-time gilding bounty: 2,500 NC + 10 BT. Gild all five sectors and the PARAGON materializes in the armory — free, singular, permanent: a gilded all-rounder that tracks air and ground and taxes every kill in its ring +15% bounty (the GOLDEN TITHE). It is never sold, only earned.'],
      ['NEW', 'THE VETERAN decrypts at Clearance 40 — the tri-weapon hero, one per commander. Three switchable guns, each with its own gimmick: the BATTLE RIFLE heats up +20% per consecutive hit on the same hull (FIRE DISCIPLINE, max +60%), the SCATTERGUN empties a 32u blast ring through air and ground alike, and the LONGRIFLE pierces armor plating to lock the beefiest hull in reach — commanders pay a 1.4x surcharge. Switch guns free and instantly from the tower panel. Eight ladder tiers — the most upgrades ever bolted onto one chassis — and every tier benefits all three guns. Expensive: 13,500 NC + 180 BT, $700 to deploy.'],
      ['NEW', 'Two more rigs join the standard grid. WAR BONDS (Clearance 14) — the compound war chest: deposit $500 into the bond, every cleared wave pays compound interest INTO the bond (12% base, 22% at GOLD STANDARD against a $12,000 cap), and WITHDRAW moves the whole chest back to your wallet whenever you need it. WAR DRUMS (Clearance 22) — the fragment beat: every gun inside the drum ring splashes 10-22% of its damage around whatever hull it just hit, and the WAR CHOIR tier teaches the drum to lob its own 140-damage frag shell every 4 seconds.'],
      ['ULTIMATUM', 'The vault reprices and grows. CORPSE BLOSSOM now costs TWO cores; GRAVE WARDEN drops to ONE and is weighted to match (bell 330, yard -50%, hymns $850 on a 40s rest, hull floor 60). And the third apex card arrives: DEATHWARRANT — three cores. It locks the beefiest hostile in a 460u verdict ring, charges twelve seconds under a growing ring and a lock reticle, then fires 1,500 flat damage PLUS 25% of everything the target carries — the fatter the hull, the harder the hit — straight through armor and shields. SWIFT VERDICT cuts the cadence to 10s and FINAL SENTENCE unlocks the DEATH ECHO: the kill detonates for 20% of the sentenced hull across 90u.'],
      ['FIX', 'RISEN HULLS scale with the wave at last — the summon pipeline was forging copies from the roster’s paper hull instead of the scaled one, so a 50,000-HP Firewall Warden rose as a 1,800-HP shadow. Risen copies now rise at their true scaled hull — and they MOW: instead of dying on the first hostile they touch, they plow through up to four (every touch deals the risen’s full hull, each mow costs a quarter of it).'],
      ['FIX', 'Summon intel trimmed to what a commander actually needs — hovering any risen copy, strike drone or vengeful soul now shows exactly the name, the tag and the live hull. The allegiance line and contact-payload rows are gone; the only number that matters is the HP.'],
      ['SHOP', 'FULL CLEARANCE means FULL clearance — the site admin now sees and buys the ENTIRE blueprint grid and vault at any clearance level (the old code promised it, the wiring never delivered). Civilian commanders still earn every gate the honest way. The shop also ships five new decals and the Golden Seal badge system.'],
    ],
  },
  {
    version: '2026.11.02', tag: 'SPIRAL ESCALATION',
    items: [
      ['INSANE', 'INSANE PROTOCOL DOUBLED — the spiral you beat last week is gone. The hull curve compounds at 1.135x per wave now (wave 30 arrives at ~35x roster hull, nearly double the old 20x), every hostile moves 22% faster, leaked commanders hit the core for 12x instead of 10x, opening salvage is stripped 35%, wave pay drops to 70%, and the rebuild window slams shut at 2.5 seconds. The ladder itself was rebuilt: +12-25% hostiles per wave and four elite classes woven through all thirty indices. DAWNFIRE still burns TRIPLE THREAT and SIEGE WALL.'],
      ['NEW', 'FOUR NEW HOSTILES debut on the spiral. NULL SPECTRE (wave 5) — phase shroud drops it out of every targeting lock for seconds at a time; splash, veins, the bell and the nuke still catch it. DATA LEECH (wave 13) — siphon field knits 1.8% of max hull per second back into every hostile around it; kill the doctor first. BLOATWARE (wave 9) — death rattle: the corpse pops an EMP and every tower nearby goes OFFLINE for 2.5 seconds, the first real tower-disable in the game. RAMPAGE UNIT (wave 18) — berserk drive accelerates it up to +85% speed as it bleeds. HARD gets a late taste: leeches and bloatware join three of the final waves.'],
      ['BAL', 'The power creep gets a trim, not a hammer. COMMAND RELAY: POWER GRID +15%→+12% ring damage, TARGET UPLINK +10%→+8% range, MORALE CORE +10%→+8% fire rate — the stacking network aura was quietly multiplying everything. CORPSE BLOSSOM: LIFEBLOOD summons rise at 38% hull instead of 45%, TRUE CORPSE BLOSSOM at 60% instead of 75%, and the vein pulse rolls down to 90 damage on a tighter window.'],
      ['WARDEN', 'GRAVE WARDEN buffed across the yard: DEATH TOLL 90→100 damage, TOLLING HOURS 180→210, LAST TOLL 330→380 with the yard slow up to 55% and chaff stun to 1.6s, CHILL GRAVE 40→45%. The SOUL CHOIR sings cheaper: $700 per soul (was $900) on a 35s cooldown (was 45s), and every soul\u2019s hull now floors at 75 instead of 50.'],
      ['RELIC', 'DAWNBRINGER repriced into legend territory — a relic this insane should cost like it. In-mission deploy cost 900→1,600 salvage (the priciest deployment in the game), the forge ladder doubles (1,600 / 2,800 / 4,500 / 7,000 salvage to SUNSLAUGHTER), and the declared value is now 250,000 NC + 2,500 BT. The card still says it will never be sold — the number is the point.'],
    ],
  },
  {
    version: '2026.11.01', tag: 'WAR CHEST',
    items: [
      ['BAL', 'The nerf hammer falls on the whole top shelf — the heavy hitters were broken and everyone knew it. DAWNBRINGER 420→330 damage / 0.9→0.8 rate with SUNSLAUGHTER rolled down to 1250 / 40U burn; VIRUS ZERO PATIENT 80→64 damage / 4.2→3.8 rate / corruption 70→55 a second; SNIPER RAIL GUNNER 375→330; MISSILE SILO MIRV 780→650 with the crater trimmed to 80U and cluster bomblets down to 35%; DRONE SPAWNER apex payload 240→200; and the ZERO DAY nuke 2200→1700. The ladders still climb — they just don\u2019t touch the sky anymore.'],
      ['WARDEN', 'GRAVE WARDEN mastery: every line of the rig climbs — base yard 170→180 reach, DEATH TOLL 70→90 damage, CHILL GRAVE 35→40%, TOLLING HOURS 180 damage on a 5.5s cadence, LAST TOLL 330 damage / 4s / 50% slow / 1.4s stun — and a new Tier 6 that costs more than any upgrade ever minted: SOUL CHOIR ($5,200). The Warden now pulls vengeful souls OUT OF THE CORE: they march the lane like a Blossom risen and detonate on the first hostile they touch. Soul hull = 10 x TOLL CHARGES (min 50) — the yard\u2019s dead forge the payload. And the choir does not sing for free: $900 per soul, 45s between hymns.'],
      ['NEW', 'Three filler chassis decrypt for commanders who like options more than power: SPARK COIL (Clearance 6) — a jury-rigged zapper whose ladder tops out fast; FLAK POST (Clearance 10) — twin barrels that shred flyers and completely ignore the ground war; TAR SPRAYER (Clearance 12) — no gun at all, just a slick that drags walkers 15-25%. Filler, by design — priced like it too.'],
      ['NEW', 'COMMAND RELAY (Clearance 18, one per commander) — the first true support rig. Every tower inside its ring hits harder, and the ladder rewires the network: a wider ring (WIDE NET), +15% damage (POWER GRID), +10% range (TARGET UPLINK), +10% fire rate (MORALE CORE) and RALLY CRY — a $600 cast that floods the ring with +50% fire rate for 6 seconds. No guns. It makes YOUR guns better.'],
      ['CAP', 'The command ceiling comes back down — 20 units was a siege, 15 is a doctrine. Every commander deploys max 15 towers again (co-op squads still stack +9 per extra commander). And for the commanders who NEED the old ceiling back: the new WAR MACHINE achievement (15 HARD-protocol or better victories) decrypts the SATURATION DOCTRINE perk — equip it and the ceiling climbs back to 20.'],
      ['ART', 'Every chassis on the grid gets its own face — 17 unique field rigs. Per-tower chassis kits (the Shredder\u2019s drum, the Blossom\u2019s petals, the Warden\u2019s bell, the Relay\u2019s halo mast, the Virus\u2019s blades...) and a unique paint job per unit, live on the board, in the armory cards, in the locked-card previews AND the mission loadout bar. New decals ship for all four new towers.'],
    ],
  },
  {
    version: '2026.10.33', tag: 'DAWN FORGE',
    items: [
      ['ECON', 'ULTIMATUM cores reprice — 50,000 lifetime XP per core, down from 100,000. And the ledger math is confirmed: the exchange NEVER spends your TOTAL XP — banking a core only counts milestones, the ★ lifetime number never drops. The vault panel now labels the bar PROGRESS INTO THE NEXT CORE so the remainder after a bank can not be misread as your total. Both sanitizers also reconcile the ledger against your clearance history on every read: if the stored total ever sits below what your level implies, it heals up — never down.'],
      ['RELIC', 'DAWNBRINGER is now strictly one per commander — the relic is singular, so the deploy cap says so. The rig itself got the forge treatment: two counter-rotating corona rings and a pulsing solar under-glow on the chassis, a sun-disc muzzle and white-hot core on the turret head, and its lance now fires as a layered beam — a wide corona sheath under the crimson core. New card art to match.'],
      ['BAL', 'EXECUTIONER brought in line — base rail 90→72 damage, rate 0.5→0.45, execute cut 15%→12%; the FINAL RITUAL tier lands at 330 damage / 0.68 rate / 22% execute / 16% chaff payout (was 420 / 0.75 / 28% / 20%). The cap lifts to match the price tag: up to three rails deploy per commander — headsman squads are legal, still never against the overseer.'],
      ['FIX', 'CORPSE BLOSSOM spawns are finally ignored by your own guns — the risen copies and strike drones were legal targets for every tower\u2019s fire-control, so turrets burned salvos on friendlies that shrug off the damage. Fire-control now skips them entirely, the dawn\u2019s splash skips them too, and hovering any spawn shows a green friendly-intel card: live HP, contact payload, and who it answers to.'],
    ],
  },
  {
    version: '2026.10.32', tag: 'OPEN ROSTER',
    items: [
      ['BAL', 'EXECUTIONER leaves the ULTIMATUM vault and joins the standard blueprint grid — Clearance 50, priced like the top shelf it is: 12,000 NC + 150 BT, the priciest chassis in the rotation. Same headsman rail: max-hull tracking, chaff soaks a token 15% of the shot, and commanders below the execute threshold lose their heads. One rail per commander, and it co-arms freely with the vault cards — only one ULTIMATUM card at a time still applies to blossom and warden. Commanders who claimed the free climb keep it; the armory never claws back.'],
      ['NEW', 'DAWNBRINGER ships with its own decal — the dawn-forged solar lance finally shows its face in the armory: a sun-disc emitter, gold-sigiled hex base and an amber solar core, sticker-cut like every other chassis in the roster.'],
    ],
  },
  {
    version: '2026.10.31', tag: 'DAWN CLEARANCE',
    items: [
      ['RELIC', 'DAWN CLEARANCE — the site admin decrypts the DAWNBRINGER. Full clearance means FULL clearance: every blueprint the grid can mint, the Crimson relic included. The dawn-forged solar lance sits in the armory from first login — no seven-day vigil, no sealed signal, no 20-wave gauntlet between the admin and 1600-damage SUNSLAUGHTER rounds that ignore armor and track air without a pad. Every other commander still earns it the old way: survive the dawn or never hold it.'],
      ['FIX', 'LOCAL armory heal — the LOCAL loadout link now runs the same access-rules pass the Nexus runs before it checks bay contents, so clearance-granted blueprints arm cleanly on offline rigs instead of bouncing off a stale armory snapshot.'],
    ],
  },
  {
    version: '2026.10.30', tag: 'INSANE ERA',
    items: [
      ['NEW', 'INSANE PROTOCOL goes live — 30 waves on the spiral, playable on ANY battle map and lockable in squad rooms. Built from the HARD ladder and pushed past it: hostile counts climb another 6-10%, hulls compound at 1.105x per wave (wave 30 arrives at ~20x hull), hostiles run 16% faster, and DAWNFIRE surges burn on TRIPLE THREAT and SIEGE WALL. Opening salvage stripped 25%, wave pay 80%, 3.5s rebuilds, boss leaks still near-kill the core. On paper it sits just under CRIMSON DAWN — in practice the dawn stays meaner, because the Well only offers two entrances. Pays 350 NC / 400 XP per win.'],
      ['NEW', 'GRAVE WARDEN joins the ULTIMATUM vault — the second apex card, 2 cores. A walled yard where the dead pay toll: every yard death rings the bell sooner, the DEATH TOLL pulse damages everything hostile in the yard and stuns chaff, and the CHILL GRAVE slows walkers AND flyers up to 45%. Commanders are beneath its notice.'],
      ['NEW', 'EXECUTIONER — the headsman\u2019s rail. The third Ultimatum card costs NO cores: it claims free at Clearance 50 and beyond. A commanders-only rail that tracks the beefiest hull in range — chaff soaks a token 15% of the round while bosses pay full price, and any marked commander below the execute threshold loses its head on the spot (mini-bosses and wardens included; the final boss is beyond the blade).'],
      ['BAL', 'One-card rule extends to the new apex rigs: GRAVE WARDEN and EXECUTIONER arm under the same ULTIMATUM constraint — at most one apex card in the loadout at a time, enforced server-side and in the LOCAL validator.'],
    ],
  },
  {
    version: '2026.10.29', tag: 'FLIGHT CORRIDOR',
    items: [
      ['BAL', 'Crimson Dawn drone nerf: OVERCLOCKED DRONES now burn the Well for 1 core damage per leak, down from 2 — event battleground only. The Well\u2019s AA hexes sit far off the flight corridors, so a leaked armada no longer cores you through the middle. Drones keep their full 2-damage bite on every other protocol.'],
      ['NEW', 'Two AA pads laid directly under the drone approach lines on THE CRIMSON WELL — one on the west corridor, one on the east — so ground-only units can finally take the AA link where the flyers actually fly. All 18 original pads untouched.'],
      ['FIX', 'Hostile intel panel now reports protocol-adjusted CORE DMG — scanning a drone on the Well reads 1, everywhere else reads 2. No more lying readouts.'],
    ],
  },
  {
    version: '2026.10.28', tag: 'ULTIMATUM',
    items: [
      ['NEW', 'The clearance cap is GONE — LV 30 was a ceiling, now it is a rumor. Levels climb forever, every XP point counts, and every level-gated blueprint you already own stays yours. The horizon is yours to push.'],
      ['NEW', 'ULTIMATUM system goes live in the Nexus Shop: a TOTAL XP counter now sits in the shop wallet tracking every scrap of experience you have ever earned, and a new ULTIMATUM tab holds the vault. Every 100,000 lifetime XP banks one claimable ULTIMATUM CORE — hit the exchange button inside the tab to bank it. Cores are the apex currency: they cannot be bought, only earned across the whole career.'],
      ['NEW', 'CORPSE BLOSSOM leaves the CLASSIFIED vault and becomes the first ULTIMATUM card. The grave warden now costs exactly 1 Ultimatum core — 100,000 lifetime XP, roughly a hundred HARD clears. No admin key, no salary gate: the reanimator is finally earnable by anyone stubborn enough. ULTIMATUM cards are armed in the loadout like any tower — but you can only equip ONE card at a time. Choose your poison.'],
      ['BAL', 'Veteran migration: existing commanders get their lifetime XP ledger backfilled from their clearance history, so the grind you already put in counts toward your first core. Nothing is taken — levels, wallets, armory and loadouts all survive the era change untouched.'],
    ],
  },
  {
    version: '2026.10.27', tag: 'FULL CLEARANCE',
    items: [
      ['CLASSIFIED', 'Commander clearance expanded — the site admin now walks the grid with EVERY perk in the arsenal decrypted. All six tactical rigs (OVERDRIVE, SALVAGE PROTOCOL, DEEP POCKETS, FIELD REPAIRS, BOUNTY HUNTER, OVERCLOCK MATRIX) go live from first login — no achievement records required, the perk panel marks them ADMIN CLEARANCE. The two-slot loadout rule still applies, so pick wisely. Everyone else: the HARD protocol still gates the vault.'],
      ['FIX', 'Event debrief rebuilt — the RETRY button is gone from the CORE BREACHED screen on the Crimson Dawn. It never re-armed the dawn anyway: the button silently dropped you into the standard protocol vote instead of relaunching the event. The debrief now offers one clean exit — RETURN TO BAY — and that policy is wired into the event system itself, so every future event gamemode ships without a retry. The dawn only rises once per deployment.'],
    ],
  },
  {
    version: '2026.10.26', tag: 'SCRAP PROTOCOL',
    items: [
      ['BAL', 'SENTINEL TURRET buffed — the grid standard rolls hotter: 7 damage at 1.6 rounds/s with reach out to 135 (was 6 / 1.5 / 130), and the whole ladder climbs with it — HIGHER CALIBER 12 dmg, BETTER TECH 2.0 rate, SENTINEL PROMOTION 20 dmg at 185 range. The baseline earns its hex again.'],
      ['NEW', 'The SHREDDER decrypts at Clearance 20 — the early-wave specialist. Per salvage, nothing on the grid mulches runners, files and glitched faster: 11 damage at 3 rounds/s for only $90 deployed. And that is ALL it is good for — the ladder deliberately tops out after three small tiers, so past the opening waves the drum is salvage bait. Cheap to buy, cheap to run, priced to retire.'],
      ['BAL', 'SNIPER tuned down again — the marksman was still overbudget. Rail damage trimmed across the ladder: 145 → 130 base, HIGHER CAL 150, 50 CAL 215, RAIL GUNNER 420 → 375. Range, rate and max-hp targeting untouched.'],
      ['BAL', 'VIRUS reworked into a premium lane-melter — it now costs real money (1,000 → 2,400 NC / 30 → 55 BT, deploy 400 → 500 salvage, every blade tier pricier) but finally fights for it: base blades up 7 → 12 damage, the ladder grows to five tiers topping at 80 dmg / 4.2 rounds/s, and the new CONTAGION tier infects every hostile the blades touch — corruption burns 40/s for 5 seconds straight through armor plating AND shield lattices, refreshed by every hit. ZERO PATIENT pushes the burn to 70/s. Early, mid and late game: the strain is viable everywhere now.'],
      ['FX', 'The Shredder spits a ragged amber chip-stream instead of clean tracers, and corrupted hostiles pulse the viral ring as the burn eats through them.'],
    ],
  },
  {
    version: '2026.10.25', tag: 'CRIMSON VEINS',
    items: [
      ['FIX', 'Phantom bay exorcised — loadouts now refuse blueprints that no longer exist in the catalog. A retired roster (RIP ARCLANCE) could leave a ghost id occupying a loadout bay: the strip showed four filled bays while the cap swore all five were armed, and the fifth tower could never be equipped. Equipping a tower now heals the stored layout for good.'],
      ['NEW', 'The Crimson Dawn deploys onto its own battleground: THE CRIMSON WELL — twin winding veins that graft into a single artery before the Well, two phase tears that hurl hostiles clear across the sector, and eighteen build hexes. CORE: ZERO is retired from event duty.'],
      ['NEW', 'The Well bleeds: a full crimson board theme — blood-red lanes, counter-rotating ritual seals around the core, pulsing breach sigils where the veins enter, and a dark red horizon vignette.'],
      ['NEW', 'Every hostile of the dawn arrives marked: crimson aura rings, ember glow and red hull readouts — and hostiles caught in a DAWNFIRE surge burn brighter still.'],
    ],
  },
  {
    version: '2026.10.24', tag: 'IRON RAIN',
    items: [
      ['NEW', 'Two endgame chassis decrypt: the MISSILE SILO (Clearance 30) and the DRONE SPAWNER (Clearance 20) — heavy hardware forged for commanders fighting in the HARD era.'],
      ['NEW', 'MISSILE SILO — strategic warheads (300 dmg / 55U blast) that track air and ground without a hex pad. MIRV PROTOCOL cracks every shell into cluster bomblets that pepper the whole crater.'],
      ['NEW', 'DRONE SPAWNER — an automated carrier that fabricates one-way strike drones; each drone detonates on the first hostile it intercepts for its full payload. Apex tier: 240-damage drones every 3 seconds.'],
      ['BAL', 'SHOTGUNNER + SNIPER tuned down — the burst ring and the rail round were overbudget. Scattergun splash and marksman damage trimmed across both upgrade ladders.'],
      ['BAL', 'HARD escalates again: hull pressure compounds at 1.10x per wave (wave 30 ≈ 15.9x hull, was 12.2x), hostiles run 15% faster, HELLFIRE burns six waves and the final escort grows a third Firewall Warden.'],
      ['CLASSIFIED', 'Field test window open: one unregistered deploy signature has been cleared to force-entry the sealed dawn signal ahead of the countdown. If you know, you know.'],
    ],
  },
  {
    version: '2026.10.23', tag: 'CRIMSON SIGNAL',
    items: [
      ['NEW', 'A new button sits at the top of the menu: ??? — an unregistered broadcast bleeding into the sector grid. Origin unknown. The Crimson Dawn Approaches.'],
      ['NEW', 'The signal carries a 192-hour countdown. When it hits zero, the dawn goes live: a limited-time combat protocol that makes HARD look like a tutorial.'],
      ['NEW', 'Event rules leak: 20 waves, hull pressure compounding at 1.13x every wave, hostiles 18% faster, DAWNFIRE surges (+80% HP / +25% speed) and boss breaches that hit for x10 core damage.'],
      ['RELIC', 'Survive all 20 waves and the DAWNBRINGER relic is yours — a dawn-forged solar lance that ignores armor, hits air and ground without a pad, and tops out at 1600 damage with a burning splash. It will never be obtainable again.'],
      ['NET', 'The event window runs 7 days from unlock, then the signal fades for good. The countdown is the same for every commander on the grid.'],
    ],
  },
  {
    version: '2026.10.22', tag: 'HELL PROTOCOL',
    items: [
      ['NEW', 'HARD rebalance — hull pressure now COMPOUNDS every wave (was linear). Wave 10 hostiles roll at ~2.2x hull, wave 20 at ~5x, wave 30 at ~12x. The run escalates, it never plateaus.'],
      ['NEW', 'HELLFIRE SURGE — a new +65% hull / +20% speed modifier stacked onto the ugliest HARD waves, including a final escort of 2 Firewalls + 2 Viruses + 2 Leaks behind the overseer.'],
      ['BAL', 'HARD hostiles move 12% faster across the board — less reaction time on every lane, every wave.'],
      ['BAL', 'HARD economy squeezed: opening salvage cut 20%, wave payouts down 15%, rebuild windows cut 7s → 4.5s.'],
      ['BAL', 'Denser HARD ladders — +20-40% hostile counts, armor columns from wave 7, Juggernaut packs from wave 10, doubled boss stacks mid-ladder.'],
      ['ECON', 'Beating HARD pays proper hell-wages: win bounty 150 → 250 NC, win XP 200 → 260, bigger boss and flawless payouts.'],
    ],
  },
  {
    version: '2026.10.21', tag: 'RELAY NET',
    items: [
      ['NEW', 'RELAY NET fallback — bays auto-fall back to a public relay grid when peer-to-peer cannot punch through (dorm, hotel, hotspot and CGNAT networks). Multiplayer now works for everyone, not just easy NATs.'],
      ['NEW', 'This UPDATE LOG panel — every deployment to the grid, newest first.'],
      ['NET', 'Dead TURN relays removed from the ICE ladder; Cloudflare STUN added for faster peer discovery. The bays view now shows which net lanes are live.'],
    ],
  },
  {
    version: '2026.10.20', tag: 'LOADOUT + CLASSIFIED',
    items: [
      ['NEW', 'Perk loadout — equip at most 2 perks at a time from the earned pool (TOWER & PERKS panel).'],
      ['NEW', 'CORPSE BLOSSOM is now CLASSIFIED — visible and purchasable by the site admin only.'],
      ['FIX', 'Upgrade panels clamp to the screen and scroll when they would run off the edge.'],
      ['FIX', 'Sniper purchase flow — the shortfall toast names the exact missing currency and the confirm step no longer expires mid-click.'],
      ['NET', 'PeerJS vendored into the site — a flaky CDN can never break multiplayer again.'],
    ],
  },
  {
    version: '2026.10.19', tag: 'HARD PROTOCOL',
    items: [
      ['NEW', 'HARD combat protocol — 30 waves of torture with boss breaches that deal x10 core damage.'],
      ['NEW', '4 new hostiles: HEXBUG (regenerates), JUGGERNAUT (armored), PHANTOM (blinks), FIREWALL WARDEN (shield boss + packet storm).'],
      ['NEW', '5 achievements (hardline, ironcommander, spirebreaker, grandslam, apexpredator) + 5 perks with real combat effects.'],
      ['FIX', 'Nuke button visible the moment a Zero Day Rig is placed (locked until Tier 6).'],
      ['FX', 'Nuke blast, Blood Purge/Scream, Veins burst and summon bloom effects.'],
      ['ECON', 'Zero Day-Exploit Rig 3,600 NC / 30 BT — Corpse Blossom 7,777 NC / 777 BT.'],
    ],
  },
  {
    version: '2026.10.18', tag: 'SALVAGE CODES',
    items: [
      ['NEW', 'Admin salvage code — +10,000 NC / +1,000 BT / +5,000 XP, repeatable.'],
      ['FIX', 'Cache-busting on every asset — deploys always serve fresh code, no more stale menus.'],
    ],
  },
  {
    version: '2026.10.17', tag: 'EXPANSION',
    items: [
      ['NEW', 'ZERO DAY-EXPLOIT RIG — wave-income economy with an aimable nuclear at Tier 6.'],
      ['NEW', 'CORPSE BLOSSOM — kills feed its blood lust; purge and scream to command the risen.'],
      ['NEW', 'MEDIUM protocol extended to 30 waves + room combat-protocol picker (per-room EASY/MEDIUM/HARD).'],
    ],
  },
  {
    version: '2026.10.16', tag: 'FOUNDATION',
    items: [
      ['NEW', 'MEDIUM combat protocol, skill matrix (perks + achievements) and the OVERDRIVE 2x perk.'],
      ['FIX', 'Easy-mode boss relief + cheaper Sentinel tiers + tower decals.'],
    ],
  },
];
