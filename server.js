const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { WebSocketServer } = require('ws');

const port = Number(process.env.PORT || 3000);
const root = __dirname;
const accountsFile = process.env.ACCOUNTS_FILE || path.join(root, 'accounts.json');
const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};
const compressible = new Set(['.css', '.html', '.js', '.json', '.svg']);
const gzipCache = new Map(); // filePath -> { etag, body }

// --- Commander accounts (persisted to accounts.json) ---------------------------
const NAME_RE = /^[A-Za-z0-9_-]{3,16}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SESSION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const sessions = new Map(); // token -> { name, expiresAt }

function loadAccounts() {
  try {
    return JSON.parse(fs.readFileSync(accountsFile, 'utf8'));
  } catch {
    return {};
  }
}

const accounts = loadAccounts();

// --- Nexus economy (mirrored in src/shop/data.js — keep in sync) -----------------------
// Clearance is UNCAPPED since the ULTIMATUM era — levels climb forever.
const xpToNext = (level) => Math.round(55 * Math.pow(level, 0.86));
const SHOP = {
  sentinel: { name: 'SENTINEL TURRET', unlock: 1, price: 0, currency: 'nc' },
  lazermortar: { name: 'LAZER MORTAR', unlock: 1, price: 0, currency: 'nc', firstClear: true },
  virus: { name: 'VIRUS', unlock: 1, price: { nc: 2400, bt: 55 }, currency: 'mixed' },
  shotgunner: { name: 'SHOTGUNNER', unlock: 3, price: { nc: 800, bt: 10 }, currency: 'mixed' },
  sniper: { name: 'SNIPER', unlock: 5, price: { nc: 1800, bt: 50 }, currency: 'mixed' },
  shredder: { name: 'SHREDDER', unlock: 20, price: { nc: 2200, bt: 35 }, currency: 'mixed' },
  dronespawner: { name: 'DRONE SPAWNER', unlock: 20, price: { nc: 5200, bt: 85 }, currency: 'mixed' },
  missilesilo: { name: 'MISSILE SILO', unlock: 30, price: { nc: 9000, bt: 120 }, currency: 'mixed' },
  zeroday: { name: 'ZERO DAY-EXPLOIT RIG', unlock: 15, price: { nc: 3600, bt: 30 }, currency: 'mixed' },
  executioner: { name: 'EXECUTIONER', unlock: 50, price: { nc: 12000, bt: 150 }, currency: 'mixed' },
  sparkcoil: { name: 'SPARK COIL', unlock: 6, price: { nc: 950, bt: 15 }, currency: 'mixed' },
  flakpost: { name: 'FLAK POST', unlock: 10, price: { nc: 1400, bt: 20 }, currency: 'mixed' },
  tarsprayer: { name: 'TAR SPRAYER', unlock: 12, price: { nc: 1750, bt: 25 }, currency: 'mixed' },
  relay: { name: 'COMMAND RELAY', unlock: 18, price: { nc: 4300, bt: 70 }, currency: 'mixed' },
  veteran: { name: 'THE VETERAN', unlock: 40, price: { nc: 13500, bt: 180 }, currency: 'mixed' },
  warbonds: { name: 'WAR BONDS', unlock: 14, price: { nc: 2800, bt: 40 }, currency: 'mixed' },
  wardrums: { name: 'WAR DRUMS', unlock: 22, price: { nc: 3900, bt: 60 }, currency: 'mixed' },
};

// ULTIMATUM vault — lifetime TOTAL XP banks Ultimatum cores (50,000 XP per core);
// cores buy ULTIMATUM cards. Mirrored in app.js LOCAL — keep in sync.
const ULT_XP_PER_CORE = 50000;
const ULT_CARDS = {
  corpseblossom: { name: 'CORPSE BLOSSOM', cores: 2, unlock: 20 },
  gravewarden: { name: 'GRAVE WARDEN', cores: 1, unlock: 20 },
  deathwarrant: { name: 'DEATHWARRANT', cores: 3, unlock: 20 },
};
// ULTIMATUM-class towers: at most ONE may be armed in the loadout at a time.
const ULT_TOWERS = new Set(['corpseblossom', 'gravewarden', 'deathwarrant']);

// --- GOLDEN SEALS: a sector gilds when all four protocols fall on it --------------
// Gild every sector and the PARAGON materializes in the armory. Mirrored in
// app.js (LOCAL + client) and src/shop/ — keep the derivation in sync.
const GOLDEN_PROTOCOLS = ['easy', 'medium', 'hard', 'insane'];
const GOLDEN_MAPS = ['easy', 'medium', 'hard', 'insane', 'cbz'];
const GOLDEN_REWARD = { nc: 2500, bt: 10 }; // one-time payout the first time a sector gilds
function mapSeal(mapWins, mapId) {
  const wins = mapWins && typeof mapWins === 'object' ? mapWins : {};
  return GOLDEN_PROTOCOLS.every((p) => (wins[`${mapId}:${p}`] || 0) > 0);
}
function allSeals(mapWins) {
  return GOLDEN_MAPS.every((mapId) => mapSeal(mapWins, mapId));
}

// Admin surface: accounts flagged by redeeming the admin key code (set via ADMIN_KEY_CODE)
// or listed here by exact name. Admins see/purchase CLASSIFIED blueprints.
const ADMIN_NAMES = new Set(['JACKSONLOOMIS-COMMITS']);
function isAdmin(name) {
  const account = accounts[name];
  return Boolean(account && (account.meta.admin || ADMIN_NAMES.has(String(name).toUpperCase())));
}
const REWARDS = {
  easy: { waveNC: 8, waveXP: 12, bossNC: 10, bossBT: 1, bossXP: 30, winNC: 60, winXP: 80, flawlessNC: 25, flawlessBT: 2, flawlessXP: 50, firstClearBT: 5 },
  medium: { waveNC: 10, waveXP: 15, bossNC: 12, bossBT: 1, bossXP: 40, winNC: 100, winXP: 140, flawlessNC: 40, flawlessBT: 3, flawlessXP: 80, firstClearBT: 5 },
  hard: { waveNC: 12, waveXP: 18, bossNC: 18, bossBT: 1, bossXP: 65, winNC: 250, winXP: 260, flawlessNC: 100, flawlessBT: 4, flawlessXP: 130, firstClearBT: 5 },
  insane: { waveNC: 13, waveXP: 20, bossNC: 20, bossBT: 1, bossXP: 70, winNC: 350, winXP: 400, flawlessNC: 140, flawlessBT: 6, flawlessXP: 160, firstClearBT: 5 },
  crimson: { waveNC: 15, waveXP: 25, bossNC: 25, bossBT: 2, bossXP: 80, winNC: 500, winXP: 600, flawlessNC: 200, flawlessBT: 10, flawlessXP: 300, firstClearBT: 10 },
};
const PROTOCOLS = Object.keys(REWARDS);

// Achievement ledger — derived from meta.mapWins (`${mapId}:${protocol}` -> win count).
// Mirrored in app.js LOCAL — keep the derivation in sync there.
function achievementsFrom(mapWins) {
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

function defaultMeta() {
  return { nc: 750, bt: 0, xp: 0, level: 1, firstClear: false, owned: ['sentinel'], loadout: ['sentinel'], mapWins: {}, goldenClaimed: {}, equippedPerks: [], totalXp: 0, ultCores: 0, ultClaims: 0 };
}

// Perk loadout: id -> achievement that decrypts it. Mirrored in app.js LOCAL.
const PERK_ACH = {
  overdrive: 'overdrive',
  salvage: 'hardline',
  deeppockets: 'ironcommander',
  fieldrep: 'spirebreaker',
  bounty: 'grandslam',
  overclock: 'apexpredator',
  saturation: 'warmachine',
};

// Enforce access rules on a meta: perk-slot default + economy migrations.
// ULTIMATUM era: legacy metas get their lifetime XP ledger backfilled from the
// level history, so veteran commanders bank Ultimatum cores on the same curve
// as fresh ones. Nobody loses owned towers — levels only ever climb now.
function sanitizeMeta(name) {
  const account = accounts[name];
  if (!account) return;
  const meta = account.meta;
  if (!Array.isArray(meta.equippedPerks)) meta.equippedPerks = [];
  // Ledger reconcile: the lifetime XP floor is what the clearance history implies
  // (current level progress + every threshold crossed). If the stored ledger ever
  // sits below that floor — legacy backfill quirks, older curves, frozen counters —
  // it heals up to the floor and never decreases a correct one. Exchange milestones
  // only ever READ this ledger, so banking a core can never spend total XP.
  let back = Number(meta.xp) || 0;
  for (let l = 1; l < (meta.level || 1); l += 1) back += xpToNext(l);
  if (back > (meta.totalXp || 0)) meta.totalXp = back;
  if (!Number.isFinite(meta.ultCores)) meta.ultCores = 0;
  if (!Number.isFinite(meta.ultClaims)) meta.ultClaims = 0;
  // DAWN CLEARANCE — full clearance decrypts every blueprint the grid can mint,
  // the Crimson relic included: the site admin holds the DAWNBRINGER without
  // waiting for the event window (mirrors app.js LOCAL sanitizeMeta — keep in sync).
  if (isAdmin(name) && !meta.owned.includes('dawnbreaker')) meta.owned.push('dawnbreaker');
  // GOLDEN STANDARD — gild every sector and the PARAGON materializes in the
  // armory, free and permanent. Derived from the win ledger, so legacy profiles
  // that already qualify heal up on the next read.
  if (allSeals(meta.mapWins) && !meta.owned.includes('paragon')) meta.owned.push('paragon');
  if (!meta.goldenClaimed || typeof meta.goldenClaimed !== 'object') meta.goldenClaimed = {};
}

// Grant legacy accounts the Nexus wallet without touching their credentials.
for (const name of Object.keys(accounts)) {
  const legacy = accounts[name].meta && typeof accounts[name].meta === 'object' ? accounts[name].meta : {};
  // Boot-time ledger reconcile — same floor rule as sanitizeMeta (keep in sync).
  let back = Number(legacy.xp) || 0;
  for (let l = 1; l < (legacy.level || 1); l += 1) back += xpToNext(l);
  if (back > (legacy.totalXp || 0)) legacy.totalXp = back;
  accounts[name].meta = { ...defaultMeta(), ...legacy };
  sanitizeMeta(name);
}
saveAccounts();

// Salvage codes — redeemable once per commander account, in SETTINGS & LOGS.
const REDEEM_CODES = {
  NULLCORE: { nc: 1500, bt: 0 },
  GHOSTWIRE: { nc: 0, bt: 75 },
  DATACACHE: { nc: 4000, bt: 100 },
  ZERODAY: { nc: 5000, bt: 500 },
};
// Admin key code comes from the environment only. Unset (or under 8 chars) = admin code disabled.
const ADMIN_KEY_CODE = String(process.env.ADMIN_KEY_CODE || '').trim().toUpperCase();
if (ADMIN_KEY_CODE.length >= 8) REDEEM_CODES[ADMIN_KEY_CODE] = { nc: 10000, bt: 1000, xp: 5000, repeat: true, admin: true, firstClear: true }; // heavy wallet + XP + CLASSIFIED clearance + reward decryption, repeatable

function profilePayload(account) {
  const meta = account.meta;
  sanitizeMeta(account.name);
  return { name: account.name, level: meta.level, xp: meta.xp, xpNext: xpToNext(meta.level), nc: meta.nc, bt: meta.bt, firstClear: meta.firstClear, owned: meta.owned, loadout: meta.loadout || [], redeemed: meta.redeemed || [], mapWins: meta.mapWins || {}, achievements: achievementsFrom(meta.mapWins), equippedPerks: meta.equippedPerks || [], totalXp: meta.totalXp || 0, ultCores: meta.ultCores || 0, ultClaims: meta.ultClaims || 0, admin: isAdmin(account.name) };
}

function saveAccounts() {
  fs.writeFile(accountsFile, JSON.stringify(accounts, null, 2), () => {});
}

function hashPasscode(passcode, salt) {
  return crypto.scryptSync(passcode, salt, 32).toString('hex');
}

function createSession(name) {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, { name, expiresAt: Date.now() + SESSION_MS });
  return token;
}

function sessionName(token) {
  const session = sessions.get(token);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return null;
  }
  return session.name;
}

function sendJson(response, status, payload) {
  response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  response.end(JSON.stringify(payload));
}

function readBody(request) {
  return new Promise((resolve) => {
    let raw = '';
    request.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 4096) {
        resolve(null);
        request.destroy();
      }
    });
    request.on('end', () => {
      if (!raw) return resolve(null);
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve(null);
      }
    });
    request.on('error', () => resolve(null));
  });
}

async function handleApi(request, response, pathname) {
  if (pathname === '/api/register' && request.method === 'POST') {
    const body = await readBody(request);
    if (!body) return sendJson(response, 400, { ok: false, error: 'Invalid request.' });
    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const passcode = String(body.passcode || '');
    if (!NAME_RE.test(name)) return sendJson(response, 400, { ok: false, error: 'Name must be 3-16 characters (letters, numbers, - or _).' });
    if (!EMAIL_RE.test(email)) return sendJson(response, 400, { ok: false, error: 'Enter a valid email address.' });
    if (passcode.length < 4 || passcode.length > 64) return sendJson(response, 400, { ok: false, error: 'Passcode must be 4-64 characters.' });
    if (accounts[name]) return sendJson(response, 400, { ok: false, error: 'That commander name is already taken.' });
    if (Object.values(accounts).some((account) => account.email === email)) {
      return sendJson(response, 400, { ok: false, error: 'That email is already registered.' });
    }
    const salt = crypto.randomBytes(16).toString('hex');
    accounts[name] = { name, email, salt, hash: hashPasscode(passcode, salt), createdAt: new Date().toISOString(), meta: defaultMeta() };
    saveAccounts();
    return sendJson(response, 200, { ok: true, token: createSession(name), name, email });
  }

  if (pathname === '/api/login' && request.method === 'POST') {
    const body = await readBody(request);
    if (!body) return sendJson(response, 400, { ok: false, error: 'Invalid request.' });
    const identity = String(body.identity || '').trim();
    const email = identity.toLowerCase();
    const passcode = String(body.passcode || '');
    const account = accounts[identity] || Object.values(accounts).find((entry) => entry.email === email);
    if (!account) return sendJson(response, 401, { ok: false, error: 'No account found for that name or email.' });
    const attempt = hashPasscode(passcode, account.salt);
    const expected = account.hash;
    if (attempt.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(attempt), Buffer.from(expected))) {
      return sendJson(response, 401, { ok: false, error: 'Wrong passcode. Try again.' });
    }
    return sendJson(response, 200, { ok: true, token: createSession(account.name), name: account.name, email: account.email });
  }

  if (pathname === '/api/session' && request.method === 'POST') {
    const body = await readBody(request);
    const token = body ? String(body.token || '') : '';
    const name = sessionName(token);
    if (!name || !accounts[name]) return sendJson(response, 401, { ok: false, error: 'Session expired. Log in again.' });
    return sendJson(response, 200, { ok: true, name, email: accounts[name].email });
  }

  if (pathname === '/api/profile' && request.method === 'POST') {
    const body = await readBody(request);
    const name = sessionName(body ? String(body.token || '') : '');
    if (!name || !accounts[name]) return sendJson(response, 401, { ok: false, error: 'Session expired. Log in again.' });
    return sendJson(response, 200, { ok: true, profile: profilePayload(accounts[name]) });
  }

  if (pathname === '/api/shop/purchase' && request.method === 'POST') {
    const body = await readBody(request);
    const name = sessionName(body ? String(body.token || '') : '');
    if (!name || !accounts[name]) return sendJson(response, 401, { ok: false, error: 'Session expired. Log in again.' });
    const itemId = String(body.itemId || '');
    const item = SHOP[itemId];
    if (!item) return sendJson(response, 404, { ok: false, error: 'Unknown blueprint.' });
    const meta = accounts[name].meta;
    if (meta.owned.includes(itemId)) return sendJson(response, 409, { ok: false, error: 'Blueprint already in your armory.' });
    // FULL CLEARANCE — admins buy the whole grid at any clearance level.
    if (meta.level < item.unlock && !isAdmin(name)) return sendJson(response, 403, { ok: false, error: `Clearance level ${item.unlock} required.` });
    if (item.firstClear && !meta.firstClear) return sendJson(response, 403, { ok: false, error: 'Reward locked — beat Easy Mode to decrypt this blueprint.' });
    // Prices may be single-currency (number) or dual-currency ({ nc, bt }).
    const cost = typeof item.price === 'object' ? item.price : { [item.currency === 'bt' ? 'bt' : 'nc']: item.price || 0 };
    if ((cost.nc || 0) > 0 && meta.nc < cost.nc) return sendJson(response, 402, { ok: false, error: 'Not enough Nexus Coins.' });
    if ((cost.bt || 0) > 0 && meta.bt < cost.bt) return sendJson(response, 402, { ok: false, error: 'Not enough Breach Tokens.' });
    if (cost.nc) meta.nc -= cost.nc;
    if (cost.bt) meta.bt -= cost.bt;
    meta.owned.push(itemId);
    saveAccounts();
    return sendJson(response, 200, { ok: true, profile: profilePayload(accounts[name]) });
  }

  if (pathname === '/api/loadout' && request.method === 'POST') {
    const body = await readBody(request);
    const name = sessionName(body ? String(body.token || '') : '');
    if (!name || !accounts[name]) return sendJson(response, 401, { ok: false, error: 'Session expired. Log in again.' });
    const meta = accounts[name].meta;
    const list = Array.isArray(body.loadout) ? body.loadout.map((id) => String(id || '')) : null;
    if (!list) return sendJson(response, 400, { ok: false, error: 'Loadout payload must be a list of blueprint ids.' });
    const clean = [...new Set(list)].filter((id) => id && meta.owned.includes(id)).slice(0, 5);
    if (clean.length !== list.length) {
      const missing = list.find((id) => !id || !meta.owned.includes(id));
      const why = missing
        ? `"${missing}" is not in your Nexus armory — log in, claim or purchase it here first, then re-equip. Bays hold max 5 blueprints you own.`
        : 'Loadouts hold max 5 bays and only blueprints you own.';
      return sendJson(response, 400, { ok: false, error: why });
    }
    // ULTIMATUM rule — at most ONE Ultimatum card armed at a time.
    const ultArmed = clean.filter((id) => ULT_TOWERS.has(id)).length;
    if (ultArmed > 1) return sendJson(response, 400, { ok: false, error: 'Only one ULTIMATUM card can be armed at a time — unequip one first.' });
    meta.loadout = clean;
    saveAccounts();
    return sendJson(response, 200, { ok: true, profile: profilePayload(accounts[name]) });
  }

  if (pathname === '/api/mission/complete' && request.method === 'POST') {
    const body = await readBody(request);
    const name = sessionName(body ? String(body.token || '') : '');
    if (!name || !accounts[name]) return sendJson(response, 401, { ok: false, error: 'Session expired. Log in again.' });
    const table = REWARDS[String(body.difficulty)] || REWARDS.easy;
    const win = body.result === 'win';
    const waves = Math.max(0, Math.min(30, Number(body.wavesCleared) || 0));
    const bosses = Math.max(0, Math.min(30, Number(body.bossesKilled) || 0));
    const flawless = Boolean(win && body.flawless);
    const bonusNc = Math.max(0, Math.min(600, Math.round(Number(body.bonusNc) || 0))); // Scrap Foundry yield
    const meta = accounts[name].meta;
    const beforeAch = achievementsFrom(meta.mapWins);
    let nc = waves * table.waveNC + bosses * table.bossNC + bonusNc;
    let bt = bosses * table.bossBT;
    let xp = waves * table.waveXP + bosses * table.bossXP;
    if (win) { nc += table.winNC; xp += table.winXP; }
    if (flawless) { nc += table.flawlessNC; bt += table.flawlessBT; xp += table.flawlessXP; }
    let firstClear = false;
    if (win && !meta.firstClear) { meta.firstClear = true; firstClear = true; bt += table.firstClearBT; }
    const rewards = {}; // golden seals / paragon attach below; payout fields fill at return
    // Achievement ledger: wins on known maps/protocols bump `${map}:${protocol}`.
    if (win && MAP_PROTOCOLS.includes(String(body.map || '')) && PROTOCOLS.includes(String(body.difficulty || ''))) {
      meta.mapWins = meta.mapWins && typeof meta.mapWins === 'object' ? meta.mapWins : {};
      const winKey = `${String(body.map)}:${String(body.difficulty)}`;
      meta.mapWins[winKey] = (meta.mapWins[winKey] || 0) + 1;
      // GOLDEN SEALS — the first time a sector gilds (all four protocols beaten
      // on it), the commander collects a one-time gilding bounty.
      meta.goldenClaimed = meta.goldenClaimed && typeof meta.goldenClaimed === 'object' ? meta.goldenClaimed : {};
      const golden = [];
      for (const mapId of GOLDEN_MAPS) {
        if (meta.goldenClaimed[mapId] || !mapSeal(meta.mapWins, mapId)) continue;
        meta.goldenClaimed[mapId] = true;
        nc += GOLDEN_REWARD.nc;
        bt += GOLDEN_REWARD.bt;
        golden.push(mapId);
      }
      if (golden.length) rewards.golden = golden;
      // GOLDEN STANDARD — gild every sector and the PARAGON materializes.
      if (allSeals(meta.mapWins) && !meta.owned.includes('paragon')) {
        meta.owned.push('paragon');
        rewards.paragon = true;
      }
    }
    // Crimson Dawn relic — surviving the event grants the DAWNBRINGER blueprint,
    // one per commander, never purchasable (it exists in no shop price table).
    let relic = false;
    if (win && String(body.difficulty) === 'crimson' && !meta.owned.includes('dawnbreaker')) {
      meta.owned.push('dawnbreaker');
      relic = true;
    }
    const afterAch = achievementsFrom(meta.mapWins);
    // Perk multipliers — perk loadout is explicit: only EQUIPPED perks (max 2)
    // run. SALVAGE PROTOCOL = +10% NC; BOUNTY HUNTER = +25% commander bounty NC.
    const equipped = Array.isArray(meta.equippedPerks) ? meta.equippedPerks : [];
    if (equipped.includes('salvage') && afterAch.hardline) nc = Math.round(nc * 1.1);
    if (equipped.includes('bounty') && afterAch.grandslam) nc += Math.round(bosses * table.bossNC * 0.25);
    const unlocked = Object.keys(afterAch).filter((id) => afterAch[id] && !beforeAch[id]);
    const before = meta.level;
    meta.nc += nc;
    meta.bt += bt;
    meta.xp += xp;
    meta.totalXp += xp; // lifetime ledger — banks Ultimatum cores, never decreases
    while (meta.xp >= xpToNext(meta.level)) { // clearance is UNCAPPED
      meta.xp -= xpToNext(meta.level);
      meta.level += 1;
    }
    Object.assign(rewards, { nc, bt, xp, bonusNc, firstClear, relic, levelsGained: meta.level - before });
    saveAccounts();
    return sendJson(response, 200, { ok: true, rewards, unlocked, profile: profilePayload(accounts[name]) });
  }

  // Salvage codes — playtesting funds. One redemption per commander account per
  // code; the ledger lives on the account meta. Mirrored in app.js LOCAL mode.
  if (pathname === '/api/redeem' && request.method === 'POST') {
    const body = await readBody(request);
    const name = sessionName(body ? String(body.token || '') : '');
    if (!name || !accounts[name]) return sendJson(response, 401, { ok: false, error: 'Session expired. Log in again.' });
    const code = String(body.code || '').trim().toUpperCase();
    const grant = REDEEM_CODES[code];
    if (!grant) return sendJson(response, 404, { ok: false, error: 'Unknown salvage code. The grid does not recognize it.' });
    const meta = accounts[name].meta;
    meta.redeemed = Array.isArray(meta.redeemed) ? meta.redeemed : [];
    if (!grant.repeat) {
      if (meta.redeemed.includes(code)) return sendJson(response, 409, { ok: false, error: 'Code already redeemed by this commander.' });
      meta.redeemed.push(code);
    }
    meta.nc += grant.nc;
    meta.bt += grant.bt;
    if (grant.admin) meta.admin = true; // admin key codes promote the commander permanently
    if (grant.firstClear) meta.firstClear = true; // admin key decrypts reward blueprints (Lazer Mortar)
    const before = meta.level;
    if (grant.xp) {
      meta.xp += grant.xp;
      meta.totalXp += grant.xp; // lifetime ledger — banks Ultimatum cores
      while (meta.xp >= xpToNext(meta.level)) { // clearance is UNCAPPED
        meta.xp -= xpToNext(meta.level);
        meta.level += 1;
      }
    }
    saveAccounts();
    return sendJson(response, 200, { ok: true, granted: { nc: grant.nc, bt: grant.bt, xp: grant.xp || 0, levelsGained: meta.level - before, admin: Boolean(grant.admin), firstClear: Boolean(grant.firstClear) }, profile: profilePayload(accounts[name]) });
  }

  // Perk loadout — two tactical slots, server-validated against earned achievements.
  if (pathname === '/api/perks' && request.method === 'POST') {
    const body = await readBody(request);
    const name = sessionName(body ? String(body.token || '') : '');
    if (!name || !accounts[name]) return sendJson(response, 401, { ok: false, error: 'Session expired. Log in again.' });
    const meta = accounts[name].meta;
    const list = Array.isArray(body.perks) ? body.perks.map((id) => String(id || '')) : null;
    if (!list) return sendJson(response, 400, { ok: false, error: 'Perk payload must be a list of perk ids.' });
    const clean = [...new Set(list)].filter(Boolean);
    if (clean.length > 2) return sendJson(response, 400, { ok: false, error: 'Only two perk slots are wired into the mission HUD — unequip one first.' });
    const ach = achievementsFrom(meta.mapWins);
    for (const id of clean) {
      const achId = PERK_ACH[id];
      if (!achId) return sendJson(response, 404, { ok: false, error: 'Unknown perk protocol.' });
      // FULL CLEARANCE — admins equip any perk without the achievement record (mirrors app.js LOCAL).
      if (!ach[achId] && !isAdmin(name)) return sendJson(response, 403, { ok: false, error: 'That perk is still encrypted — earn its achievement first.' });
    }
    meta.equippedPerks = clean;
    saveAccounts();
    return sendJson(response, 200, { ok: true, profile: profilePayload(accounts[name]) });
  }

  // ULTIMATUM vault — lifetime XP banks Ultimatum cores; cores buy ULTIMATUM cards.
  // Mirrored in app.js LOCAL — keep the contract in sync.
  if (pathname === '/api/ultimatum' && request.method === 'POST') {
    const body = await readBody(request);
    const name = sessionName(body ? String(body.token || '') : '');
    if (!name || !accounts[name]) return sendJson(response, 401, { ok: false, error: 'Session expired. Log in again.' });
    const meta = accounts[name].meta;
    const action = String((body || {}).action || '');
    if (action === 'exchange') {
      // Milestone claim: every ULT_XP_PER_CORE of LIFETIME XP banks one core.
      // The ledger never decreases — levels, wallets and owned towers are untouched.
      const banked = Math.floor((meta.totalXp || 0) / ULT_XP_PER_CORE);
      if (banked <= (meta.ultClaims || 0)) return sendJson(response, 400, { ok: false, error: `Not enough lifetime XP — an Ultimatum core costs ${ULT_XP_PER_CORE.toLocaleString('en-US')} TOTAL XP.` });
      meta.ultCores = (meta.ultCores || 0) + 1;
      meta.ultClaims = (meta.ultClaims || 0) + 1;
      saveAccounts();
      return sendJson(response, 200, { ok: true, granted: { cores: meta.ultCores, claims: meta.ultClaims }, profile: profilePayload(accounts[name]) });
    }
    if (action === 'buy') {
      const cardId = String((body || {}).card || '');
      const card = ULT_CARDS[cardId];
      if (!card) return sendJson(response, 404, { ok: false, error: 'Unknown Ultimatum card.' });
      if (meta.owned.includes(cardId)) return sendJson(response, 409, { ok: false, error: 'Ultimatum card already in your armory.' });
      if (meta.level < card.unlock && !isAdmin(name)) return sendJson(response, 403, { ok: false, error: `Clearance level ${card.unlock} required.` });
      if ((meta.ultCores || 0) < card.cores) return sendJson(response, 402, { ok: false, error: `Not enough Ultimatum cores — ${card.name} costs ${card.cores}.` });
      meta.ultCores -= card.cores;
      meta.owned.push(cardId);
      saveAccounts();
      return sendJson(response, 200, { ok: true, acquired: cardId, profile: profilePayload(accounts[name]) });
    }
    return sendJson(response, 400, { ok: false, error: 'Unknown Ultimatum action.' });
  }

  return sendJson(response, 404, { ok: false, error: 'Unknown API endpoint.' });
}

const server = http.createServer((request, response) => {
  let reqUrl;
  try { reqUrl = new URL(request.url, 'http://localhost'); } catch { response.writeHead(400).end('Bad request'); return; }
  const pathname = reqUrl.pathname;
  if (pathname.startsWith('/api/')) {
    handleApi(request, response, pathname);
    return;
  }
  if (pathname === '/health') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ status: 'online' }));
    return;
  }

  let requestedPath;
  try { requestedPath = pathname === '/' ? '/index.html' : decodeURIComponent(pathname); } catch { response.writeHead(400).end('Bad request'); return; }
  if (requestedPath.includes('\0')) { response.writeHead(400).end('Bad request'); return; }
  const filePath = path.resolve(root, `.${requestedPath}`);
  const relParts = path.relative(root, filePath).split(path.sep);
  if (!filePath.startsWith(`${root}${path.sep}`) || relParts.some((p) => p.startsWith('.')) || /^accounts.*\.json$/i.test(relParts[0])) {
    response.writeHead(403).end('Forbidden');
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(error.code === 'ENOENT' ? 404 : 500).end('Not found');
      return;
    }
    const ext = path.extname(filePath);
    const etag = `"${crypto.createHash('sha1').update(content).digest('base64url')}"`;
    // ?v= assets never change under that URL; html and /src/ modules (imported without ?v=) always revalidate; other assets (art) for a day.
    const cache = ext === '.html' || requestedPath.startsWith('/src/') ? 'no-cache' : reqUrl.searchParams.has('v') ? 'public, max-age=31536000, immutable' : 'public, max-age=86400';
    const headers = {
      'content-type': mimeTypes[ext] || 'application/octet-stream',
      'x-content-type-options': 'nosniff',
      'cache-control': cache,
      etag,
      vary: 'accept-encoding',
    };
    if (request.headers['if-none-match'] === etag) {
      response.writeHead(304, headers).end();
      return;
    }
    let body = content;
    if (compressible.has(ext) && content.length > 1024 && /\bgzip\b/.test(request.headers['accept-encoding'] || '')) {
      let hit = gzipCache.get(filePath);
      if (!hit || hit.etag !== etag) { hit = { etag, body: zlib.gzipSync(content) }; gzipCache.set(filePath, hit); }
      body = hit.body;
      headers['content-encoding'] = 'gzip';
    }
    response.writeHead(200, headers);
    response.end(body);
  });
});

// --- Fixed deployment bays: four rooms, up to four commanders each ---------------
// Restored room browser: every client sees all four bays live, the room lead
// picks the map, and the room lead starts when at least one teammate joined.
const rooms = new Map();
for (const [id, name] of [
  ['room-01', 'ROOM 01 // ALPHA'],
  ['room-02', 'ROOM 02 // BRAVO'],
  ['room-03', 'ROOM 03 // CHARLIE'],
  ['room-04', 'ROOM 04 // DELTA'],
]) {
  rooms.set(id, { id, name, players: [], map: null, protocol: null, started: false });
}
const MAP_PROTOCOLS = ['easy', 'medium', 'hard', 'insane', 'cbz'];
const PROTOCOL_CHOICES = ['easy', 'medium', 'hard', 'insane']; // combat protocols a room lead can lock in
const MAX_PLAYERS = 4;

const webSockets = new WebSocketServer({ server, path: '/rooms' });

function send(socket, message) {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
}

function roomSnapshot(room) {
  return {
    id: room.id,
    name: room.name,
    map: room.map,
    protocol: room.protocol || null,
    maxPlayers: MAX_PLAYERS,
    started: room.started,
    commanders: room.players.map((player, index) => ({ callsign: player.callsign, isHost: index === 0 })),
  };
}

function roomsSnapshot() {
  return [...rooms.values()].map(roomSnapshot);
}

// --- Global comms ---------------------------------------------------------------------
const CHAT_HISTORY = 50;
const chatLog = [];
function pushChat(entry) {
  chatLog.push(entry);
  if (chatLog.length > CHAT_HISTORY) chatLog.splice(0, chatLog.length - CHAT_HISTORY);
}
function chatHistory() {
  return chatLog.slice();
}

function broadcastRooms() {
  const message = JSON.stringify({ type: 'rooms', rooms: roomsSnapshot() });
  for (const client of webSockets.clients) {
    if (client.readyState === client.OPEN) client.send(message);
  }
}

function broadcastRoom(room) {
  // send() stringifies — pass an object here, not pre-encoded JSON.
  const message = { type: 'room-update', room: roomSnapshot(room) };
  for (const player of room.players) send(player.socket, message);
}

function removePlayer(room, socket) {
  const index = room.players.findIndex((player) => player.socket === socket);
  if (index === -1) return;
  room.players.splice(index, 1);
  socket.roomId = null;
  if (room.players.length === 0) Object.assign(room, { map: null, protocol: null, started: false });
  else broadcastRoom(room);
  broadcastRooms();
}

webSockets.on('connection', (socket) => {
  socket.roomId = null;
  socket.authenticated = false;

  socket.on('message', (raw) => {
    if (raw.length > 65536) return socket.close(1009, 'Message too large');
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return send(socket, { type: 'error', message: 'Invalid message.' });
    }

    if (!socket.authenticated) {
      if (message.type !== 'authenticate') {
        send(socket, { type: 'auth-error', message: 'Authenticate before entering a room.' });
        return socket.close(1008, 'Authentication required');
      }
      const token = typeof message.token === 'string' ? message.token : '';
      const name = sessionName(token);
      if (!name || !accounts[name]) {
        send(socket, { type: 'auth-error', message: 'Session expired. Log in again.' });
        return socket.close(1008, 'Invalid session');
      }
      socket.authenticated = true;
      socket.sessionToken = token;
      socket.callsign = name;
      send(socket, { type: 'linked', callsign: name, rooms: roomsSnapshot(), chat: chatHistory() });
      return;
    }

    if (!sessionName(socket.sessionToken)) {
      send(socket, { type: 'auth-error', message: 'Session expired. Log in again.' });
      return socket.close(1008, 'Session expired');
    }

    if (message.type === 'rooms') return send(socket, { type: 'rooms', rooms: roomsSnapshot() });

    // Global comms: every authenticated commander shares one channel, in the menu
    // or mid-mission. Server relays to all linked clients and keeps a short history.
    if (message.type === 'chat') {
      const text = String(message.text || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 280);
      if (!text) return;
      const entry = { type: 'chat', from: socket.callsign, text, ts: Date.now() };
      pushChat(entry);
      const payload = JSON.stringify(entry);
      for (const client of webSockets.clients) {
        if (client.readyState === client.OPEN && client.authenticated) client.send(payload);
      }
      return;
    }

    // Squad relay: host snapshots flow outward, guest intents flow back to the lead.
    if (message.type === 'coop') {
      const kind = String(message.kind || '');
      if (!['sync', 'intent', 'over'].includes(kind)) return send(socket, { type: 'error', message: 'Unknown coop packet.' });
      const coopRoom = rooms.get(socket.roomId);
      if (!coopRoom || !coopRoom.started || !coopRoom.players.length) return;
      const lead = coopRoom.players[0];
      if (kind === 'intent') {
        // Guests ship placements/installs to the lead — the lead's sim validates them.
        if (lead.socket !== socket) return send(lead.socket, { type: 'coop', kind: 'intent', data: message.data, from: socket.callsign });
        return;
      }
      if (lead.socket !== socket) return; // only the lead broadcasts sync / over
      const payload = JSON.stringify({ type: 'coop', kind, data: message.data, from: socket.callsign });
      for (const player of coopRoom.players) {
        if (player.socket !== socket && player.socket.readyState === player.socket.OPEN) player.socket.send(payload);
      }
      return;
    }

    if (message.type === 'join') {
      const room = rooms.get(String(message.room || ''));
      if (!room) return send(socket, { type: 'error', message: 'Room not found.' });
      if (socket.roomId) return send(socket, { type: 'error', message: 'Leave your current room before switching.' });
      if (room.started) return send(socket, { type: 'error', message: 'This room has already started.' });
      if (room.players.length >= MAX_PLAYERS) return send(socket, { type: 'error', message: 'Room is full. Choose another room.' });
      room.players.push({ socket, callsign: socket.callsign });
      socket.roomId = room.id;
      send(socket, { type: 'joined', you: socket.callsign, room: roomSnapshot(room) });
      broadcastRoom(room);
      return broadcastRooms();
    }

    const room = rooms.get(socket.roomId);
    if (!room) return;
    const playerIndex = room.players.findIndex((player) => player.socket === socket);
    if (playerIndex === -1) return;

    if (message.type === 'leave') return removePlayer(room, socket);
    if (message.type === 'config') {
      if (playerIndex !== 0) return send(socket, { type: 'error', message: 'Only the room lead can change the map.' });
      if (room.started) return send(socket, { type: 'error', message: 'This room has already started.' });
      if (message.map !== undefined && message.map !== null) {
        if (!MAP_PROTOCOLS.includes(message.map)) return send(socket, { type: 'error', message: 'Unknown map protocol.' });
        room.map = message.map;
      }
      if (message.protocol !== undefined && message.protocol !== null) {
        if (!PROTOCOL_CHOICES.includes(message.protocol)) return send(socket, { type: 'error', message: 'Unknown combat protocol.' });
        room.protocol = message.protocol;
      }
      broadcastRoom(room);
      return broadcastRooms();
    }
    if (message.type === 'start') {
      if (playerIndex !== 0) return send(socket, { type: 'error', message: 'Only the room lead can start the mission.' });
      if (room.started) return send(socket, { type: 'error', message: 'This room has already started.' });
      if (!room.map) return send(socket, { type: 'error', message: 'Select a map before starting.' });
      if (room.players.length < 2) return send(socket, { type: 'error', message: 'Wait for at least one other commander before starting.' });
      room.started = true;
      const snapshot = roomSnapshot(room);
      for (const player of room.players) send(player.socket, { type: 'launch', room: snapshot });
      broadcastRooms();
      return;
    }
    if (message.type === 'end') {
      // Any commander can call the mission concluded — unlocks the bay for a re-run.
      if (!room.started) return;
      room.started = false;
      broadcastRoom(room);
      return broadcastRooms();
    }
  });

  socket.on('close', () => {
    const room = rooms.get(socket.roomId);
    if (room) removePlayer(room, socket);
  });
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Core Breach: Zero listening on http://0.0.0.0:${port}`);
});
