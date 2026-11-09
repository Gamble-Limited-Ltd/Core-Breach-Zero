import { BUILD, UPDATE_LOG } from './src/app/update-log.js';
import { REDEEM_CODES, ACHIEVEMENTS, achievementsFrom, GOLDEN_REWARD, PERKS } from './src/app/progression.js';
import { BATTLE_MAPS, CRIMSON_MAP } from './src/app/maps.js';
import { GOLDEN_MAPS, mapSeal, allSeals } from './src/shop/data.js';
const dialog = document.querySelector('#menu-dialog');
const body = document.querySelector('#dialog-body');
const authOverlay = document.querySelector('#auth-overlay');
const port = window.location.port || (window.location.protocol === 'https:' ? '443' : '80');
let socket;
let soundEnabled = true;
let audioContext;
let toastTimer;
let authToken = localStorage.getItem('cbz-token') || '';
let myName = '';
let authMode = 'login';

document.querySelector('#server-port').textContent = `PORT ${port}`;
document.querySelector('#preview-port').textContent = port;


// --- CRIMSON DAWN event clock -------------------------------------------------------
// An unregistered broadcast went live with build 2026.10.23: 192 hours of static,
// then the dawn. The deadline is a FIXED UTC instant — the site is static-hosted,
// so every commander on the grid counts down to the same second. The window runs
// 7 days, then the signal fades and the relic is gone for good.
const CRIMSON_DEADLINE = Date.parse('2026-10-30T18:00:00Z'); // ~192h after deploy
const CRIMSON_END = Date.parse('2026-11-06T18:00:00Z');      // 7-day event window
const CRIMSON_DEBUG = new URLSearchParams(location.search).get('crimson'); // QA override: live | passed
// Early dawn entry — the site admin's deploy signature alone forces the sealed
// signal open ahead of the countdown. Every other commander waits for T-0.
// The mirror of the admin surface in shop.js/server.js (roster name + admin key flag).
function crimsonEarlyAccess() {
  const shop = window.CBZShop;
  const profile = shop && shop.profile ? shop.profile() : null;
  return Boolean(profile && profile.admin);
}
function crimsonPhase(now = Date.now()) {
  if (CRIMSON_DEBUG === 'live') return 'live';
  if (CRIMSON_DEBUG === 'passed') return 'passed';
  if (now >= CRIMSON_END) return 'passed';
  if (crimsonEarlyAccess()) return 'live';
  if (now >= CRIMSON_DEADLINE) return 'live';
  return 'sealed';
}
function crimsonCountdownText() {
  const ms = Math.max(0, CRIMSON_DEADLINE - Date.now());
  const h = Math.floor(ms / 3600000);
  const m = Math.floor(ms / 60000) % 60;
  const s = Math.floor(ms / 1000) % 60;
  return `T-${String(h).padStart(3, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
function crimsonWindowText() {
  return new Date(CRIMSON_END).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC';
}

const menus = {
  crimson: {
    tag: 'SIGNAL INTERCEPT', title: '???',
    description: 'An unregistered broadcast is bleeding into the sector grid. Origin unknown. Protocol unknown. The countdown will not stop.',
    stats: () => {
      const phase = crimsonPhase();
      return [
        ['SIGNAL', phase === 'sealed' ? 'ENCRYPTED' : phase === 'live' ? 'DECRYPTED' : 'FADED'],
        ['DAWN IN', phase === 'sealed' ? crimsonCountdownText() : phase === 'live' ? 'NOW' : '—'],
        ['ORIGIN', 'UNKNOWN'],
      ];
    },
  },
  play: {
    tag: 'DEPLOYMENT HUB', title: 'PLAY MENU',
    description: 'Enter one of four rooms for up to four commanders, or recon any of the 5 battle maps solo. Combat protocols live: EASY (20 waves), MEDIUM (30 waves), HARD (30 waves of pure hell — compounding hulls, 15% faster hostiles, HELLFIRE surges and boss breaches that near-kill the core) and INSANE (30 waves on the spiral — hulls compound past HARD, +16% speed, DAWNFIRE surges, runs on any battle map; only the two-entranced Well keeps CRIMSON DAWN meaner).',
    stats: [['ROOMS', '4 DEPLOYMENT BAYS'], ['SQUAD SIZE', 'UP TO 4 COMMANDERS'], ['SERVER PORT', port]],
  },
  perks: {
    tag: 'SKILL MATRIX', title: 'TOWER & PERKS',
    description: 'The skill matrix runs two tabs: PERKS and ACHIEVEMENTS. Earn achievement records on the grid to decrypt commander perks — starting with OVERDRIVE, the 2x mission time-compression rig.',
    stats: () => {
      const shop = window.CBZShop;
      const profile = shop && shop.profile ? shop.profile() : null;
      const earned = profile && profile.achievements ? Object.values(profile.achievements).filter(Boolean).length : 0;
      return [['TABS', 'PERKS + ACHIEVEMENTS'], ['ACHIEVEMENTS', `${earned} / ${ACHIEVEMENTS.length} EARNED`], ['PERKS DEPLOYED', `${PERKS.length}`]];
    },
  },
  shop: {
    tag: 'NEXUS MARKETPLACE', title: 'NEXUS SHOP',
    description: 'The Nexus exchange is live. Spend Nexus Coins on turret blueprints and rare Breach Tokens on experimental hardware. New blueprints decrypt as your clearance level rises.',
    stats: () => {
      const shop = window.CBZShop;
      const profile = shop ? shop.profile() : null;
      return [
        ['CURRENCIES', 'NEXUS COINS + BREACH TOKENS'],
        ['BLUEPRINTS', `${shop ? shop.TOWERS.length : 16} TURRET LINES`],
        ['WALLET', profile ? `LV ${profile.level} // ${Number(profile.nc).toLocaleString('en-US')} NC // ${profile.bt} BT` : 'SYNCING…'],
      ];
    },
  },
  settings: {
    tag: 'SYSTEM CONFIG', title: 'SETTINGS & LOGS',
    description: 'The mission server is live. Choose a port with the PORT environment variable. Commander accounts (name + email) persist in accounts.json beside the server.',
    stats: [['MENU SERVER', `PORT ${port}`], ['ROOM SIZE', 'UP TO 4 COMMANDERS'], ['ACCOUNT LEDGER', 'ACTIVE']],
  },
  changelog: {
    tag: 'PATCH RECORDS', title: 'UPDATE LOG',
    description: 'Every deployment to the Core Breach grid, newest first. The grid keeps receipts.',
    stats: [['ENTRIES', `${UPDATE_LOG.length}`], ['LATEST', UPDATE_LOG[0].version], ['BUILD', BUILD]],
  },
  online: {
    tag: 'ONLINE ROOMS', title: 'ONLINE ROOMS',
    description: 'Server-run squad missions for up to four commanders: create a room or join one by code. The server plays the sim, your browser shows it.',
    stats: [['ROOMS', 'ONLINE'], ['SQUAD', 'UP TO 4'], ['SIM', 'ON THE SERVER']],
  },
  about: {
    tag: 'CREDITS', title: 'ABOUT & CREDITS',
    description: 'Game created and owned by Jackson Loomis. Hosted and assisted by Gamble Limited Ltd.',
    stats: [['CREATED BY', 'JACKSON LOOMIS'], ['HOSTED BY', 'GAMBLE LIMITED LTD'], ['LICENSE', 'POLYFORM NONCOMMERCIAL 1.0.0']],
  },
};

function playSound(kind = 'click') {
  if (!soundEnabled) return;
  try {
    audioContext ||= new window.AudioContext();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const now = audioContext.currentTime;
    oscillator.type = kind === 'hover' ? 'sine' : 'triangle';
    oscillator.frequency.setValueAtTime(kind === 'hover' ? 800 : 390, now);
    oscillator.frequency.exponentialRampToValueAtTime(kind === 'hover' ? 1100 : 160, now + .05);
    gain.gain.setValueAtTime(.04, now);
    gain.gain.exponentialRampToValueAtTime(.001, now + .06);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + .06);
  } catch { /* Sound is optional when browser audio is unavailable. */ }
}

function showToast(message) {
  const toast = document.querySelector('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

// --- Local Nexus fallback --------------------------------------------------------
// Static hosts (GitHub Pages) cannot run the Node backend: POST /api/* returns a
// non-JSON 405 page there. When that happens we flip to a fully local Nexus that
// mirrors server.js — same tables, same rules, same error strings — with accounts,
// sessions, wallet, purchases, loadouts and mission payouts persisted in
// localStorage. Progress is per-browser; the real server remains authoritative
// whenever the site is actually served by `node server.js`.
// The client-side read: golden state for map cards comes from the live profile.
function mapIsGolden(mapId) {
  const shop = window.CBZShop;
  const profile = shop && shop.profile ? shop.profile() : null;
  return Boolean(profile && mapSeal(profile.mapWins, mapId));
}
window.CBZPerks = {
  list: PERKS,
  has(id) {
    const perk = PERKS.find((entry) => entry.id === id);
    if (!perk) return false;
    const shop = window.CBZShop;
    const profile = shop && shop.profile ? shop.profile() : null;
    if (!profile) return false;
    // FULL CLEARANCE: flag-admins walk the grid with every perk decrypted —
    // no achievement record required. Non-admins still earn each one.
    if (!profile.admin && (!profile.achievements || !profile.achievements[perk.ach])) return false;
    // Perk loadout is explicit: only EQUIPPED perks (max 2) run in missions.
    const equipped = profile.equippedPerks;
    return Array.isArray(equipped) ? equipped.includes(id) : false;
  },
};

const LOCAL = (() => {
  const ACCOUNTS_KEY = 'cbz-local-accounts';
  const SESSIONS_KEY = 'cbz-local-sessions';
  const NAME_RE = /^[A-Za-z0-9_-]{3,16}$/;
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
  // Clearance is UNCAPPED since the ULTIMATUM era — levels climb forever.
  const xpToNext = (level) => Math.round(55 * Math.pow(level, 0.86));
  // Mirrors server.js SHOP — keep in sync (name/unlock/price/currency only).
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
  const REWARDS = {
    easy: { waveNC: 8, waveXP: 12, bossNC: 10, bossBT: 1, bossXP: 30, winNC: 60, winXP: 80, flawlessNC: 25, flawlessBT: 2, flawlessXP: 50, firstClearBT: 5 },
    medium: { waveNC: 10, waveXP: 15, bossNC: 12, bossBT: 1, bossXP: 40, winNC: 100, winXP: 140, flawlessNC: 40, flawlessBT: 3, flawlessXP: 80, firstClearBT: 5 },
    hard: { waveNC: 12, waveXP: 18, bossNC: 18, bossBT: 1, bossXP: 65, winNC: 250, winXP: 260, flawlessNC: 100, flawlessBT: 4, flawlessXP: 130, firstClearBT: 5 },
    insane: { waveNC: 13, waveXP: 20, bossNC: 20, bossBT: 1, bossXP: 70, winNC: 350, winXP: 400, flawlessNC: 140, flawlessBT: 6, flawlessXP: 160, firstClearBT: 5 },
    crimson: { waveNC: 15, waveXP: 25, bossNC: 25, bossBT: 2, bossXP: 80, winNC: 500, winXP: 600, flawlessNC: 200, flawlessBT: 10, flawlessXP: 300, firstClearBT: 10 },
  };
  let down = false;

  function readJson(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; }
  }
  function writeJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage optional. */ }
  }
  const readAccounts = () => readJson(ACCOUNTS_KEY, {});
  const readSessions = () => readJson(SESSIONS_KEY, {});
  const defaultMeta = () => ({ nc: 750, bt: 0, xp: 0, level: 1, firstClear: false, owned: ['sentinel'], loadout: ['sentinel'], mapWins: {}, goldenClaimed: {}, equippedPerks: [], totalXp: 0, ultCores: 0, ultClaims: 0 });

  // Mirror of server.js PERK_ACH + admin surface — keep in sync.
  const PERK_ACH = {
    overdrive: 'overdrive',
    salvage: 'hardline',
    deeppockets: 'ironcommander',
    fieldrep: 'spirebreaker',
    bounty: 'grandslam',
    overclock: 'apexpredator',
    saturation: 'warmachine',
  };
  const ADMIN_NAMES = new Set(['JACKSONLOOMIS-COMMITS']);
  const isAdminName = (name) => ADMIN_NAMES.has(String(name || '').toUpperCase());
  // ULTIMATUM vault — lifetime XP banks cores; cores buy ULTIMATUM cards.
  // Mirrors server.js ULT_* — keep in sync.
  const ULT_XP_PER_CORE = 50000;
  const ULT_CARDS = {
    corpseblossom: { name: 'CORPSE BLOSSOM', cores: 2, unlock: 20 },
    gravewarden: { name: 'GRAVE WARDEN', cores: 1, unlock: 20 },
    deathwarrant: { name: 'DEATHWARRANT', cores: 3, unlock: 20 },
  };
  const ULT_TOWERS = new Set(['corpseblossom', 'gravewarden', 'deathwarrant']);
  // Enforce access rules on a LOCAL meta: perk-slot default + economy migrations.
  // ULTIMATUM era: legacy metas get their lifetime XP ledger reconciled from the
  // level history — the ledger never sits below what the clearance history implies,
  // and a correct one is never lowered. Mirrors server.js sanitizeMeta.
  function sanitizeMeta(account) {
    if (!account || !account.meta) return;
    const meta = account.meta;
    if (!Array.isArray(meta.equippedPerks)) meta.equippedPerks = [];
    let back = Number(meta.xp) || 0;
    for (let l = 1; l < (meta.level || 1); l += 1) back += xpToNext(l);
    if (back > (meta.totalXp || 0)) meta.totalXp = back;
    if (!Number.isFinite(meta.ultCores)) meta.ultCores = 0;
    if (!Number.isFinite(meta.ultClaims)) meta.ultClaims = 0;
    // DAWN CLEARANCE — full clearance decrypts every blueprint the grid can mint,
    // the Crimson relic included: the site admin holds the DAWNBRINGER without
    // waiting for the event window (mirrors server.js sanitizeMeta — keep in sync).
    if ((meta.admin || isAdminName(account.name)) && !meta.owned.includes('dawnbreaker')) meta.owned.push('dawnbreaker');
    // GOLDEN STANDARD — gild every sector and the PARAGON materializes in the
    // armory, free and permanent (mirrors server.js sanitizeMeta — keep in sync).
    if (allSeals(meta.mapWins) && !meta.owned.includes('paragon')) meta.owned.push('paragon');
    if (!meta.goldenClaimed || typeof meta.goldenClaimed !== 'object') meta.goldenClaimed = {};
  }

  function randomHex(bytes) {
    const array = new Uint8Array(bytes);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(array);
    else for (let i = 0; i < array.length; i += 1) array[i] = Math.floor(Math.random() * 256);
    return [...array].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  async function hashPasscode(passcode, salt) {
    const seeded = `${salt}::${passcode}::core-breach-zero`;
    if (window.crypto && crypto.subtle && crypto.subtle.digest) {
      try {
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(seeded));
        return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
      } catch { /* fall through to the manual scramble. */ }
    }
    // Non-secure-context fallback: deterministic scramble (cosmetic — local saves only).
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let i = 0; i < seeded.length; i += 1) {
      const ch = seeded.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return `${(h2 >>> 0).toString(16).padStart(8, '0')}${(h1 >>> 0).toString(16).padStart(8, '0')}`;
  }

  function createSession(name) {
    const token = randomHex(24);
    const sessions = readSessions();
    sessions[token] = { name, expiresAt: Date.now() + SESSION_MS };
    writeJson(SESSIONS_KEY, sessions);
    return token;
  }

  function sessionName(token) {
    const sessions = readSessions();
    const entry = sessions[token];
    if (!entry || Date.now() > entry.expiresAt) {
      if (entry) { delete sessions[token]; writeJson(SESSIONS_KEY, sessions); }
      return null;
    }
    return entry.name;
  }

  function profilePayload(account) {
    const meta = account.meta;
    sanitizeMeta(account);
    return { name: account.name, level: meta.level, xp: meta.xp, xpNext: xpToNext(meta.level), nc: meta.nc, bt: meta.bt, firstClear: meta.firstClear, owned: meta.owned, loadout: meta.loadout || [], redeemed: meta.redeemed || [], mapWins: meta.mapWins || {}, achievements: achievementsFrom(meta.mapWins), equippedPerks: meta.equippedPerks || [], totalXp: meta.totalXp || 0, ultCores: meta.ultCores || 0, ultClaims: meta.ultClaims || 0, admin: Boolean(meta.admin) || isAdminName(account.name) };
  }

  function requireAccount(body) {
    const name = sessionName(String((body || {}).token || ''));
    const account = name ? readAccounts()[name] : null;
    if (!name || !account) throw new Error('Session expired. Log in again.');
    return account;
  }

  async function handle(path, payload) {
    const body = payload || {};
    if (path === '/api/register') {
      const name = String(body.name || '').trim();
      const email = String(body.email || '').trim().toLowerCase();
      const passcode = String(body.passcode || '');
      if (!NAME_RE.test(name)) throw new Error('Name must be 3-16 characters (letters, numbers, - or _).');
      if (!EMAIL_RE.test(email)) throw new Error('Enter a valid email address.');
      if (passcode.length < 4 || passcode.length > 64) throw new Error('Passcode must be 4-64 characters.');
      const accounts = readAccounts();
      if (accounts[name]) throw new Error('That commander name is already taken.');
      if (Object.values(accounts).some((entry) => entry.email === email)) throw new Error('That email is already registered.');
      const salt = randomHex(16);
      accounts[name] = { name, email, salt, hash: await hashPasscode(passcode, salt), createdAt: new Date().toISOString(), meta: defaultMeta(), local: true };
      writeJson(ACCOUNTS_KEY, accounts);
      return { ok: true, token: createSession(name), name, email };
    }
    if (path === '/api/login') {
      const identity = String(body.identity || '').trim();
      const email = identity.toLowerCase();
      const passcode = String(body.passcode || '');
      const accounts = readAccounts();
      const account = accounts[identity] || Object.values(accounts).find((entry) => entry.email === email);
      if (!account) throw new Error('No account found for that name or email.');
      if ((await hashPasscode(passcode, account.salt)) !== account.hash) throw new Error('Wrong passcode. Try again.');
      return { ok: true, token: createSession(account.name), name: account.name, email: account.email };
    }
    if (path === '/api/session') {
      const name = sessionName(String(body.token || ''));
      const account = name ? readAccounts()[name] : null;
      if (!account) throw new Error('Session expired. Log in again.');
      return { ok: true, name, email: account.email };
    }
    if (path === '/api/profile') {
      return { ok: true, profile: profilePayload(requireAccount(body)) };
    }
    if (path === '/api/shop/purchase') {
      const account = requireAccount(body);
      const item = SHOP[String(body.itemId || '')];
      if (!item) throw new Error('Unknown blueprint.');
      const meta = account.meta;
      if (meta.owned.includes(String(body.itemId || ''))) throw new Error('Blueprint already in your armory.');
      // FULL CLEARANCE — admins buy the whole grid at any clearance level.
      if (meta.level < item.unlock && !(meta.admin || isAdminName(account.name))) throw new Error(`Clearance level ${item.unlock} required.`);
      if (item.firstClear && !meta.firstClear) throw new Error('Reward locked — beat Easy Mode to decrypt this blueprint.');
      const cost = typeof item.price === 'object' ? item.price : { [item.currency === 'bt' ? 'bt' : 'nc']: item.price || 0 };
      if ((cost.nc || 0) > 0 && meta.nc < cost.nc) throw new Error('Not enough Nexus Coins.');
      if ((cost.bt || 0) > 0 && meta.bt < cost.bt) throw new Error('Not enough Breach Tokens.');
      if (cost.nc) meta.nc -= cost.nc;
      if (cost.bt) meta.bt -= cost.bt;
      meta.owned.push(String(body.itemId || ''));
      const accounts = readAccounts();
      accounts[account.name] = account;
      writeJson(ACCOUNTS_KEY, accounts);
      return { ok: true, profile: profilePayload(account) };
    }
    if (path === '/api/loadout') {
      const account = requireAccount(body);
      sanitizeMeta(account); // DAWN CLEARANCE — the relic decrypt lands before the armory check
      const meta = account.meta;
      const list = Array.isArray(body.loadout) ? body.loadout.map((id) => String(id || '')) : null;
      if (!list) throw new Error('Loadout payload must be a list of blueprint ids.');
      const clean = [...new Set(list)].filter((id) => id && meta.owned.includes(id)).slice(0, 5);
      if (clean.length !== list.length) {
        const missing = list.find((id) => !id || !meta.owned.includes(id));
        throw new Error(missing
          ? `"${missing}" is not in your Nexus armory — log in, claim or purchase it here first, then re-equip. Bays hold max 5 blueprints you own.`
          : 'Loadouts hold max 5 bays and only blueprints you own.');
      }
      // ULTIMATUM rule — at most ONE Ultimatum card armed at a time.
      if (clean.filter((id) => ULT_TOWERS.has(id)).length > 1) throw new Error('Only one ULTIMATUM card can be armed at a time — unequip one first.');
      meta.loadout = clean;
      const accounts = readAccounts();
      accounts[account.name] = account;
      writeJson(ACCOUNTS_KEY, accounts);
      return { ok: true, profile: profilePayload(account) };
    }
    if (path === '/api/mission/complete') {
      const account = requireAccount(body);
      const table = REWARDS[String(body.difficulty)] || REWARDS.easy;
      const win = body.result === 'win';
      const waves = Math.max(0, Math.min(30, Number(body.wavesCleared) || 0));
      const bosses = Math.max(0, Math.min(30, Number(body.bossesKilled) || 0));
      const flawless = Boolean(win && body.flawless);
      const bonusNc = Math.max(0, Math.min(600, Math.round(Number(body.bonusNc) || 0))); // Scrap Foundry yield
      const meta = account.meta;
      const beforeAch = achievementsFrom(meta.mapWins);
      let nc = waves * table.waveNC + bosses * table.bossNC + bonusNc;
      let bt = bosses * table.bossBT;
      let xp = waves * table.waveXP + bosses * table.bossXP;
      if (win) { nc += table.winNC; xp += table.winXP; }
      if (flawless) { nc += table.flawlessNC; bt += table.flawlessBT; xp += table.flawlessXP; }
      let firstClear = false;
      if (win && !meta.firstClear) { meta.firstClear = true; firstClear = true; bt += table.firstClearBT; }
      // Achievement ledger: wins on known maps/protocols bump `${map}:${protocol}`.
      const rewards = {}; // golden seals / paragon attach below; payout fields fill at return
      if (win && BATTLE_MAPS[String(body.map || '')] && REWARDS[String(body.difficulty || '')]) {
        meta.mapWins = meta.mapWins && typeof meta.mapWins === 'object' ? meta.mapWins : {};
        const winKey = `${String(body.map)}:${String(body.difficulty)}`;
        meta.mapWins[winKey] = (meta.mapWins[winKey] || 0) + 1;
        // GOLDEN SEALS — the first time a sector gilds, the commander collects
        // a one-time gilding bounty (mirrors server.js — keep in sync).
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
      // one per commander, never purchasable. It exists in no shop price table.
      let relic = false;
      if (win && String(body.difficulty) === 'crimson' && !meta.owned.includes('dawnbreaker')) {
        meta.owned.push('dawnbreaker');
        relic = true;
      }
      const afterAch = achievementsFrom(meta.mapWins);
      // Perk multipliers — perk loadout is explicit: only EQUIPPED perks (max 2)
      // run. SALVAGE PROTOCOL = +10% NC; BOUNTY HUNTER = +25% commander bounty NC.
      const equippedPerks = Array.isArray(meta.equippedPerks) ? meta.equippedPerks : [];
      if (equippedPerks.includes('salvage') && afterAch.hardline) nc = Math.round(nc * 1.1);
      if (equippedPerks.includes('bounty') && afterAch.grandslam) nc += Math.round(bosses * table.bossNC * 0.25);
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
      const accounts = readAccounts();
      accounts[account.name] = account;
      writeJson(ACCOUNTS_KEY, accounts);
      Object.assign(rewards, { nc, bt, xp, bonusNc, firstClear, relic, levelsGained: meta.level - before });
      return { ok: true, rewards, unlocked, profile: profilePayload(account) };
    }
    if (path === '/api/redeem') {
      // Salvage-code redemption — mirrors server.js exactly (same codes, same grants).
      const account = requireAccount(body);
      const code = String((body || {}).code || '').trim().toUpperCase();
      const grant = REDEEM_CODES[code];
      if (!grant) throw new Error('Unknown salvage code. The grid does not recognize it.');
      account.meta.redeemed = Array.isArray(account.meta.redeemed) ? account.meta.redeemed : [];
      if (!grant.repeat) {
        if (account.meta.redeemed.includes(code)) throw new Error('Code already redeemed by this commander.');
        account.meta.redeemed.push(code);
      }
      account.meta.nc += grant.nc;
      account.meta.bt += grant.bt;
      if (grant.admin) account.meta.admin = true; // admin key codes promote the commander permanently
      if (grant.firstClear) account.meta.firstClear = true; // admin key decrypts reward blueprints (Lazer Mortar)
      const meta = account.meta;
      const before = meta.level;
      if (grant.xp) {
        meta.xp += grant.xp;
        meta.totalXp += grant.xp; // lifetime ledger — banks Ultimatum cores
        while (meta.xp >= xpToNext(meta.level)) { // clearance is UNCAPPED
          meta.xp -= xpToNext(meta.level);
          meta.level += 1;
        }
      }
      const accounts = readAccounts();
      accounts[account.name] = account;
      writeJson(ACCOUNTS_KEY, accounts);
      return { ok: true, granted: { nc: grant.nc, bt: grant.bt, xp: grant.xp || 0, levelsGained: meta.level - before, admin: Boolean(grant.admin), firstClear: Boolean(grant.firstClear) }, profile: profilePayload(account) };
    }
    if (path === '/api/perks') {
      // Perk loadout — two tactical slots, validated against earned achievements.
      const account = requireAccount(body);
      const meta = account.meta;
      const list = Array.isArray(body.perks) ? body.perks.map((id) => String(id || '')) : null;
      if (!list) throw new Error('Perk payload must be a list of perk ids.');
      const clean = [...new Set(list)].filter(Boolean);
      if (clean.length > 2) throw new Error('Only two perk slots are wired into the mission HUD — unequip one first.');
      const ach = achievementsFrom(meta.mapWins);
      const admin = Boolean(meta.admin) || isAdminName(account.name); // FULL CLEARANCE — admins skip the vault
      for (const id of clean) {
        const achId = PERK_ACH[id];
        if (!achId) throw new Error('Unknown perk protocol.');
        if (!ach[achId] && !admin) throw new Error('That perk is still encrypted — earn its achievement first.');
      }
      meta.equippedPerks = clean;
      const accounts = readAccounts();
      accounts[account.name] = account;
      writeJson(ACCOUNTS_KEY, accounts);
      return { ok: true, profile: profilePayload(account) };
    }
    if (path === '/api/ultimatum') {
      // ULTIMATUM vault — mirrors server.js. Milestone exchange + card purchases.
      const account = requireAccount(body);
      const meta = account.meta;
      const action = String((body || {}).action || '');
      if (action === 'exchange') {
        const banked = Math.floor((meta.totalXp || 0) / ULT_XP_PER_CORE);
        if (banked <= (meta.ultClaims || 0)) throw new Error(`Not enough lifetime XP — an Ultimatum core costs ${ULT_XP_PER_CORE.toLocaleString('en-US')} TOTAL XP.`);
        meta.ultCores = (meta.ultCores || 0) + 1;
        meta.ultClaims = (meta.ultClaims || 0) + 1;
        const accounts = readAccounts();
        accounts[account.name] = account;
        writeJson(ACCOUNTS_KEY, accounts);
        return { ok: true, granted: { cores: meta.ultCores, claims: meta.ultClaims }, profile: profilePayload(account) };
      }
      if (action === 'buy') {
        const cardId = String((body || {}).card || '');
        const card = ULT_CARDS[cardId];
        if (!card) throw new Error('Unknown Ultimatum card.');
        if (meta.owned.includes(cardId)) throw new Error('Ultimatum card already in your armory.');
        // FULL CLEARANCE — admins buy any vault card at any clearance level.
        if (meta.level < card.unlock && !(meta.admin || isAdminName(account.name))) throw new Error(`Clearance level ${card.unlock} required.`);
        if ((meta.ultCores || 0) < card.cores) throw new Error(`Not enough Ultimatum cores — ${card.name} costs ${card.cores}.`);
        meta.ultCores -= card.cores;
        meta.owned.push(cardId);
        const accounts = readAccounts();
        accounts[account.name] = account;
        writeJson(ACCOUNTS_KEY, accounts);
        return { ok: true, acquired: cardId, profile: profilePayload(account) };
      }
      throw new Error('Unknown Ultimatum action.');
    }
    throw new Error('Unknown API endpoint.');
  }

  function markDown() {
    if (down) return;
    down = true;
    paintNetBadge();
  }

  return { handle, markDown, down: () => down };
})();

function paintNetBadge() {
  const badge = document.querySelector('#net-badge');
  if (badge) badge.hidden = !LOCAL.down();
}

// --- Commander authentication ---------------------------------------------------
async function apiRequest(path, payload) {
  if (LOCAL.down()) return LOCAL.handle(path, payload);
  let response;
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    LOCAL.markDown(); // network failure — no Node backend reachable
    return LOCAL.handle(path, payload);
  }
  const type = response.headers.get('content-type') || '';
  if (!type.includes('application/json')) {
    // Static host (GitHub Pages): POST endpoints return an HTML 405 page here.
    LOCAL.markDown();
    return LOCAL.handle(path, payload);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data.error || 'Auth system failure.');
  return data;
}

function setAuthMode(mode) {
  authMode = mode;
  document.querySelector('#tab-login').classList.toggle('on', mode === 'login');
  document.querySelector('#tab-register').classList.toggle('on', mode === 'register');
  document.querySelector('#auth-identity-field').hidden = mode !== 'login';
  document.querySelector('#auth-name-field').hidden = mode !== 'register';
  document.querySelector('#auth-email-field').hidden = mode !== 'register';
  document.querySelector('#auth-confirm-field').hidden = mode !== 'register';
  document.querySelector('#auth-kicker').textContent = mode === 'login' ? '// COMMANDER AUTHENTICATION' : '// NEW COMMANDER REGISTRATION';
  document.querySelector('#auth-submit').firstChild.textContent = mode === 'login' ? 'AUTHENTICATE ' : 'CREATE ACCOUNT ';
  document.querySelector('#auth-error').textContent = '';
}

function enterDeck(name) {
  myName = name;
  const chip = document.querySelector('#cmdr-chip');
  chip.hidden = false;
  chip.textContent = `CMDR: ${name}`;
  document.querySelector('#sign-out').hidden = false;
  authOverlay.hidden = true;
  setStatus(LOCAL.down() ? 'LOCAL NEXUS ONLINE // PROGRESS SAVES IN THIS BROWSER' : 'ACCOUNT LINKED // MENU SYSTEM READY');
  loadProfile();
}

async function submitAuth(event) {
  event.preventDefault();
  const errorLine = document.querySelector('#auth-error');
  const submit = document.querySelector('#auth-submit');
  errorLine.textContent = '';
  let payload;
  if (authMode === 'register') {
    const passcode = document.querySelector('#auth-passcode').value;
    if (passcode !== document.querySelector('#auth-confirm').value) {
      errorLine.textContent = 'Passcodes do not match.';
      return;
    }
    payload = {
      name: document.querySelector('#auth-name').value.trim(),
      email: document.querySelector('#auth-email').value.trim(),
      passcode,
    };
  } else {
    payload = {
      identity: document.querySelector('#auth-identity').value.trim(),
      passcode: document.querySelector('#auth-passcode').value,
    };
  }
  submit.disabled = true;
  try {
    const data = await apiRequest(authMode === 'login' ? '/api/login' : '/api/register', payload);
    authToken = data.token;
    localStorage.setItem('cbz-token', authToken);
    enterDeck(data.name);
    playSound();
    showToast(`Welcome, ${data.name}. The grid awaits.`);
  } catch (error) {
    errorLine.textContent = error.message;
    playSound('alarm');
  } finally {
    submit.disabled = false;
  }
}

async function restoreSession() {
  if (!authToken) {
    authOverlay.hidden = false;
    return;
  }
  try {
    const data = await apiRequest('/api/session', { token: authToken });
    enterDeck(data.name);
  } catch {
    authToken = '';
    localStorage.removeItem('cbz-token');
    authOverlay.hidden = false;
  }
}

function signOut() {
  localStorage.removeItem('cbz-token');
  authToken = '';
  location.reload();
}

function setStatus(text) {
  document.querySelector('#server-status').textContent = text;
}

function updatePreview(key) {
  const item = menus[key];
  if (!item) return;
  document.querySelectorAll('.menu-item').forEach((button) => button.classList.toggle('selected', button.dataset.menu === key));
  document.querySelector('#preview-tag').textContent = item.tag;
  document.querySelector('#preview-title').textContent = item.title;
  document.querySelector('#preview-desc').textContent = item.description;
  const stats = typeof item.stats === 'function' ? item.stats() : item.stats;
  document.querySelector('#preview-stats').innerHTML = stats.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></div>`).join('');
}

function openMenu(key) {
  const item = menus[key];
  if (!item) return;
  playSound();
  if (key !== 'online' && window.CBZRooms) CBZRooms.close();
  updatePreview(key);
  document.querySelector('#dialog-kicker').textContent = `// ${item.tag}`;
  document.querySelector('#dialog-title').textContent = item.title;
  if (key === 'play') openPlayMenu();
  else if (key === 'crimson') renderCrimsonPanel(item);
  else if (key === 'shop') renderNexusShop();
  else if (key === 'perks') renderPerksMenu(item);
  else if (key === 'settings') renderSettingsPanel(item);
  else if (key === 'changelog') renderUpdateLog(item);
  else if (key === 'online' && window.CBZRooms) CBZRooms.open(body);
  else renderDetails(item);
  dialog.showModal();
}

// --- Crimson Dawn panel: sealed signal -> live event -> faded -----------------------
function crimsonLoreHtml() {
  return `
    <div class="crimson-lore">
      >> SIGNAL INTERCEPT 09-DELTA // ORIGIN: <b>UNKNOWN</b><br>
      >> DECRYPTION: <b>FAILED</b> — 192 HOURS TO FORCED ENTRY<br>
      >> CONTENT FRAGMENT: "...the dawn does not ask permission. it does not bargain. it arrives, and the grid <b>burns in colors you have never survived</b>."<br>
      >> ATTACHMENT DETECTED: 1 RELIC BLUEPRINT — <b>DAWNBRINGER</b> // ENCRYPTED<br>
      >> THE GRID REMEMBERS: NOTHING STAYS BURIED.
    </div>`;
}
function renderCrimsonPanel(item) {
  const phase = crimsonPhase();
  if (phase === 'sealed') {
    body.innerHTML = `
      <div class="crimson-panel">
        <div class="crimson-sigil">✦</div>
        <div class="crimson-big" id="crimson-big">${crimsonCountdownText()}<small>UNTIL THE DAWN</small></div>
        ${crimsonLoreHtml()}
        <p class="dialog-copy" style="text-align:center; margin-top:14px;">The broadcast repeats the same fragment every hour. Command has no record of this transmission. The countdown is not ours. The dawn approaches.</p>
      </div>`;
    return;
  }
  if (phase === 'passed') {
    const shop = window.CBZShop;
    const profile = shop && shop.profile ? shop.profile() : null;
    const relic = Boolean(profile && profile.owned && profile.owned.includes('dawnbreaker'));
    document.querySelector('#dialog-kicker').textContent = '// SIGNAL LOST';
    document.querySelector('#dialog-title').textContent = 'THE DAWN HAS PASSED';
    body.innerHTML = `
      <div class="crimson-panel">
        <div class="crimson-sigil" style="opacity:0.35; animation:none;">✦</div>
        <p class="crimson-faded">THE BROADCAST WENT SILENT — THE WINDOW IS CLOSED</p>
        <p class="dialog-copy" style="text-align:center; margin-top:12px;">${relic
          ? 'The grid records your name. The DAWNBRINGER relic is held in your armory — a survivor\u2019s mark from the only Crimson Dawn there will ever be.'
          : 'The dawn came and went. Whatever burned in those seven days burned without you — the DAWNBRINGER relic is gone with it. Nothing stays buried, but nothing returns either.'}</p>
      </div>`;
    return;
  }
  document.querySelector('#dialog-kicker').textContent = '// EVENT PROTOCOL';
  document.querySelector('#dialog-title').textContent = 'THE CRIMSON DAWN';
  const earlyEntry = Date.now() < CRIMSON_DEADLINE;
  body.innerHTML = `
    <div class="crimson-panel">
      <div class="crimson-sigil">✦</div>
      <div class="crimson-lore">
        >> FORCED ENTRY COMPLETE. THE BROADCAST IS <b>THE EVENT</b>.<br>
        >> 20 WAVES. HULL PRESSURE <b>COMPOUNDS 1.13x EVERY WAVE</b> — wave 10 ≈ 3x hull, wave 20 ≈ 10.2x.<br>
        >> HOSTILES RUN <b>18% FASTER</b>. DAWNFIRE SURGES STACK <b>+80% HP / +25% SPEED</b> onto the worst waves.<br>
        >> COMMANDER BREACHES HIT THE CORE FOR <b>x10 DAMAGE</b>. REBUILD WINDOWS: 3 SECONDS. SALVAGE PAYS 70%.<br>
        >> REWARD: 1x <b>DAWNBRINGER</b> RELIC — solar lance, armor-immune beams, air + ground without pads, 1600 DMG SUNSLAUGHTER tier. <b>NEVER OBTAINABLE AGAIN.</b><br>
        >> WINDOW CLOSES: <b>${escapeHtml(crimsonWindowText())}</b>
      </div>
      ${earlyEntry ? '<p class="crimson-faded" style="letter-spacing:0.18em;">// EARLY FIELD TEST — ONE UNREGISTERED DEPLOY SIGNATURE ACCEPTED</p>' : ''}
      <button class="crimson-deploy" id="crimson-deploy" type="button">DEPLOY INTO THE DAWN <span>→</span></button>
      <p class="dialog-copy" style="text-align:center; margin-top:10px;">Solo deployment // phase-grid sector // no protocol vote — the dawn chooses for you.</p>
    </div>`;
  body.querySelector('#crimson-deploy').addEventListener('click', () => {
    playSound();
    dialog.close();
    openBattlefield(CRIMSON_MAP);
    if (window.CBZCombat) CBZCombat.startMission(CRIMSON_MAP, true, 'crimson');
  });
}
setInterval(() => {
  const phase = crimsonPhase();
  const button = document.querySelector('#menu-crimson');
  if (button) {
    button.classList.toggle('crimson-live', phase === 'live');
    const count = document.querySelector('#crimson-count');
    const title = document.querySelector('#crimson-title');
    const sub = document.querySelector('#crimson-sub');
    if (count) count.textContent = phase === 'sealed' ? crimsonCountdownText() : phase === 'live' ? 'THE DAWN IS HERE' : 'SIGNAL LOST';
    if (title) title.textContent = phase === 'live' ? 'CRIMSON DAWN' : '???';
    if (sub) sub.textContent = phase === 'live' ? 'The Dawn has arrived — the window is open' : phase === 'passed' ? 'The signal went silent' : 'The Crimson Dawn Approaches';
  }
  const big = document.querySelector('#crimson-big');
  if (big && phase === 'sealed') big.innerHTML = `${crimsonCountdownText()}<small>UNTIL THE DAWN</small>`;
}, 1000);

// --- Skill matrix: PERKS + ACHIEVEMENTS tabs --------------------------------------
function renderPerksMenu(item) {
  const shop = window.CBZShop;
  const profile = shop && shop.profile ? shop.profile() : null;
  const paint = (tab) => {
    const achievements = (profile && profile.achievements) || {};
    const mapWins = (profile && profile.mapWins) || {};
    const panel = body.querySelector('#matrix-panel');
    if (!panel) return;
    panel.innerHTML = tab === 'achievements' ? achievementsPanelHtml(achievements, mapWins) : perksPanelHtml(achievements);
    if (tab !== 'achievements') wirePerkSlots(panel);
  };
  body.innerHTML = `
    <p class="dialog-copy">${escapeHtml(item.description)}</p>
    <div class="matrix-tabs" id="matrix-tabs">
      <button class="matrix-tab on" type="button" data-tab="perks">PERKS</button>
      <button class="matrix-tab" type="button" data-tab="achievements">ACHIEVEMENTS</button>
    </div>
    <div id="matrix-panel"></div>`;
  body.querySelector('#matrix-tabs').addEventListener('click', (event) => {
    const tab = event.target.closest('[data-tab]');
    if (!tab || tab.classList.contains('on')) return;
    body.querySelectorAll('.matrix-tab').forEach((el) => el.classList.toggle('on', el === tab));
    playSound();
    paint(tab.dataset.tab);
  });
  paint('perks');
}

function perksPanelHtml(achievements) {
  const shop = window.CBZShop;
  const profile = shop && shop.profile ? shop.profile() : null;
  const equipped = (profile && Array.isArray(profile.equippedPerks)) ? profile.equippedPerks : [];
  const admin = Boolean(profile && profile.admin); // FULL CLEARANCE — every perk decrypts for the admin
  const cards = PERKS.map((perk) => {
    const cleared = Boolean(achievements[perk.ach]);
    const earned = admin || cleared;
    const on = earned && equipped.includes(perk.id);
    const state = on ? 'EQUIPPED' : earned ? 'STANDBY' : 'LOCKED';
    const action = !earned ? '' : `
      <button class="perk-slot-btn${on ? ' on' : ''}" type="button" data-perk="${escapeHtml(perk.id)}">${on ? 'UNEQUIP SLOT' : 'EQUIP SLOT'}</button>`;
    const standby = cleared ? '>> ON STANDBY — EQUIP INTO ONE OF TWO SLOTS.' : '>> ADMIN CLEARANCE — DECRYPTED WITHOUT THE RECORD.';
    return `
      <article class="perk-card${earned ? ' earned' : ''}${on ? ' on' : ''}" data-perk-card="${escapeHtml(perk.id)}">
        <div class="perk-head"><b>${escapeHtml(perk.name)}</b><span class="perk-state">${state}</span></div>
        <p>${escapeHtml(perk.desc)}</p>
        ${action}
        <div class="perk-req">${on ? '>> WIRED INTO THE MISSION HUD.' : earned ? standby : `>> REQUIREMENT: ${escapeHtml(perk.req)}`}</div>
      </article>`;
  }).join('');
  return `
    <div class="perk-slots-head"><span>// TACTICAL SLOTS</span><b class="perk-slot-count${equipped.length >= 2 ? ' full' : ''}">${equipped.length} / 2 EQUIPPED</b><small>ONLY EQUIPPED PERKS RUN IN MISSIONS — PICK TWO</small></div>
    <div class="perk-grid">
      ${cards}
      <article class="perk-card placeholder">
        <div class="perk-head"><b>MORE PERKS INCOMING</b><span class="perk-state">SIGNAL PENDING</span></div>
        <p>The skill matrix expands as new achievement records decrypt. Keep clearing sectors.</p>
      </article>
    </div>`;
}

function wirePerkSlots(panel) {
  panel.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-perk]');
    if (!button) return;
    const shop = window.CBZShop;
    const profile = shop && shop.profile ? shop.profile() : null;
    if (!profile) return;
    const perkId = button.dataset.perk;
    const equipped = Array.isArray(profile.equippedPerks) ? profile.equippedPerks.slice() : [];
    const next = equipped.includes(perkId) ? equipped.filter((id) => id !== perkId) : [...equipped, perkId];
    if (!equipped.includes(perkId) && equipped.length >= 2) {
      playSound('alarm');
      showToast('ONLY TWO PERK SLOTS — UNEQUIP ONE FIRST.');
      const card = button.closest('.perk-card');
      if (card) { card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake'); }
      return;
    }
    button.disabled = true;
    try {
      await shop.setPerks(next);
      playSound();
      const count = next.length;
      showToast(count ? `PERK LOADOUT UPDATED — ${count}/2 SLOTS WIRED.` : 'PERK SLOTS CLEARED.');
    } catch (error) {
      playSound('alarm');
      showToast(String(error.message || 'Perk loadout rejected.').toUpperCase());
    } finally {
      const panelNow = body.querySelector('#matrix-panel');
      if (panelNow) {
        const achievements = (profile && profile.achievements) || {};
        panelNow.innerHTML = perksPanelHtml(achievements);
        wirePerkSlots(panelNow);
      }
    }
  });
}

function achievementsPanelHtml(achievements, mapWins) {
  const cards = ACHIEVEMENTS.map((ach) => {
    const earned = Boolean(achievements[ach.id]);
    const wins = mapWins && typeof mapWins === 'object' ? mapWins : {};
    const steps = ach.protocols.map((protocol) => {
      const done = (wins[`${ach.map}:${protocol}`] || 0) > 0;
      return `<span class="ach-step${done ? ' done' : ''}">${escapeHtml(protocol.toUpperCase())} PROTOCOL — ${done ? 'CLEARED' : 'NOT CLEARED'}</span>`;
    }).join('');
    return `
      <article class="ach-card${earned ? ' earned' : ''}">
        <div class="ach-icon" aria-hidden="true">${ach.glyph}</div>
        <div class="ach-body">
          <div class="ach-head"><b>${escapeHtml(ach.name)}</b><span class="ach-state">${earned ? 'UNLOCKED' : 'LOCKED'}</span></div>
          <p>${escapeHtml(ach.desc)}</p>
          <div class="ach-steps">${steps}</div>
          <div class="ach-reward">REWARD // ${escapeHtml(ach.reward)}</div>
        </div>
      </article>`;
  }).join('');
  return `<div class="ach-list">${cards}</div>`;
}

// --- Room service: four fixed deployment bays, room lead starts the mission ------
let roomList = [];
let currentRoom = null;
let showingBays = false;
let myCallsign = '';
let roomLaunch = false;
let launchTimer = 0;

// Commanders in the current squad — combat reads this for the tower limit.
window.CBZ_ROOM_PLAYERS = 1;
function roomPlayerCount() {
  return Math.max(1, Math.min(4, Number(window.CBZ_ROOM_PLAYERS) || 1));
}

// --- LOCAL ROOM SERVICE ----------------------------------------------------------
// GitHub Pages has no Node backend, so the four deployment bays also run in the
// browser off localStorage, speaking the exact same message protocol as the
// server's room service. Solo launch works immediately, and a second tab on this
// machine can drop into the same bay as a real squadmate — shared roster, shared
// map pick, synchronized launch.
const LOCAL_ROOMS = (() => {
  const KEY = 'cbz-local-rooms';
  const MAX_PLAYERS = 4;
  const STALE_MS = 20000; // a seat whose tab stops beating this long is abandoned
  const BAYS = [
    ['room-01', 'ROOM 01 // ALPHA'],
    ['room-02', 'ROOM 02 // BRAVO'],
    ['room-03', 'ROOM 03 // CHARLIE'],
    ['room-04', 'ROOM 04 // DELTA'],
  ];
  let callsign = '';
  let myRoom = null;
  let launchedFor = null;
  let wired = false;
  let TAB_ID = '';
  try {
    TAB_ID = sessionStorage.getItem('cbz-tab') || '';
    if (!TAB_ID) {
      TAB_ID = `t${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
      sessionStorage.setItem('cbz-tab', TAB_ID);
    }
  } catch { TAB_ID = `t${Math.floor(Math.random() * 1e9).toString(36)}`; }

  function fresh() {
    return BAYS.map(([id, name]) => ({ id, name, players: [], map: null, protocol: null, started: false, launchId: null }));
  }
  function prune(rooms) {
    const now = Date.now();
    for (const room of rooms) {
      room.players = (room.players || []).filter((player) => now - (player.lastSeen || 0) < STALE_MS);
      if (!room.players.length && (room.map || room.started)) {
        // An abandoned bay resets, exactly like the server's empty-room rule.
        room.map = null;
        room.protocol = null;
        room.started = false;
        room.launchId = null;
      }
    }
    return rooms;
  }
  function read() {
    let rooms = null;
    try { rooms = JSON.parse(localStorage.getItem(KEY)); } catch { rooms = null; }
    return prune(Array.isArray(rooms) ? rooms : fresh());
  }
  function write(rooms) {
    try { localStorage.setItem(KEY, JSON.stringify(rooms)); } catch { /* storage optional. */ }
  }
  function snapshot(room) {
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
  const snapshots = (rooms) => rooms.map(snapshot);
  function findMine(rooms) {
    return rooms.find((room) => room.players.some((player) => player.tab === TAB_ID)) || null;
  }

  // Another tab changed the bay state — refresh this tab's UI and follow a launch.
  function syncFromStorage() {
    const rooms = read();
    roomList = snapshots(rooms);
    const mine = findMine(rooms);
    if (mine) {
      currentRoom = snapshot(mine);
      if (mine.started && mine.map && mine.launchId && launchedFor !== mine.launchId) {
        launchedFor = mine.launchId;
        showLaunchSequence(mine.map, mine.protocol);
        return;
      }
      if (dialog.open) {
        if (showingBays) renderBays();
        else renderLobby();
      }
    } else {
      currentRoom = null;
      if (dialog.open && showingBays) renderBays();
    }
  }

  function handle(message) {
    const rooms = read();
    if (message.type === 'authenticate') {
      callsign = (message.callsign || callsign || 'COMMANDER').toUpperCase();
      handleServiceMessage({ type: 'linked', callsign, rooms: snapshots(rooms) });
      return;
    }
    if (message.type === 'rooms') {
      handleServiceMessage({ type: 'rooms', rooms: snapshots(rooms) });
      return;
    }
    if (message.type === 'join') {
      const room = rooms.find((bay) => bay.id === String(message.room || ''));
      if (!room) return handleServiceMessage({ type: 'error', message: 'Room not found.' });
      if (myRoom) return handleServiceMessage({ type: 'error', message: 'Leave your current room before switching.' });
      if (room.started) return handleServiceMessage({ type: 'error', message: 'This room has already started.' });
      if (room.players.length >= MAX_PLAYERS) return handleServiceMessage({ type: 'error', message: 'Room is full. Choose another room.' });
      room.players.push({ callsign, tab: TAB_ID, lastSeen: Date.now() });
      myRoom = room.id;
      write(rooms);
      handleServiceMessage({ type: 'joined', you: callsign, room: snapshot(room) });
      return;
    }
    if (message.type === 'config') {
      const room = findMine(rooms);
      if (room && !room.started && room.players[0] && room.players[0].tab === TAB_ID) {
        if (message.map) room.map = message.map;
        if (message.protocol && ROOM_PROTOCOLS.includes(message.protocol)) room.protocol = message.protocol;
        write(rooms);
        syncFromStorage();
      }
      return;
    }
    if (message.type === 'start') {
      const room = findMine(rooms);
      if (!room || !room.map || room.started) return;
      if (!room.players[0] || room.players[0].tab !== TAB_ID) {
        return handleServiceMessage({ type: 'error', message: 'Only the room lead can start the mission.' });
      }
      room.started = true;
      room.launchId = `${Date.now()}`;
      write(rooms);
      launchedFor = room.launchId;
      handleServiceMessage({ type: 'launch', room: snapshot(room) });
      return;
    }
    if (message.type === 'leave') {
      const room = findMine(rooms);
      if (room) {
        room.players = room.players.filter((player) => player.tab !== TAB_ID);
        if (!room.players.length) { room.map = null; room.protocol = null; room.started = false; room.launchId = null; }
        write(rooms);
      }
      myRoom = null;
      handleServiceMessage({ type: 'rooms', rooms: snapshots(read()) });
      return;
    }
    if (message.type === 'end') {
      const room = findMine(rooms);
      if (room && room.started) {
        room.started = false;
        room.launchId = null;
        write(rooms);
      }
      return;
    }
  }

  function wake() {
    if (wired) return;
    wired = true;
    callsign = (myName || 'COMMANDER').toUpperCase();
    // A fresh page load can't still be holding a seat — clear this tab's crash leftovers.
    const rooms = read();
    let cleaned = false;
    for (const room of rooms) {
      const before = room.players.length;
      room.players = room.players.filter((player) => player.tab !== TAB_ID);
      if (room.players.length !== before) cleaned = true;
    }
    if (cleaned) write(rooms);
    window.addEventListener('storage', (event) => {
      if (event.key === KEY) syncFromStorage();
    });
    const dropSeat = () => {
      const current = read();
      const room = findMine(current);
      if (room) {
        room.players = room.players.filter((player) => player.tab !== TAB_ID);
        if (!room.players.length) { room.map = null; room.started = false; room.launchId = null; }
        write(current);
      }
    };
    window.addEventListener('pagehide', dropSeat);
    window.addEventListener('beforeunload', dropSeat);
    setInterval(() => {
      const current = read();
      const room = findMine(current);
      if (!room) return;
      const me = room.players.find((player) => player.tab === TAB_ID);
      if (me) { me.lastSeen = Date.now(); write(current); }
    }, 5000);
  }

  function role() {
    // Squad seat for the co-op relay: the tab holding seat 0 of a started bay leads.
    const mine = findMine(read());
    if (!mine || !mine.started || !mine.players.length) return 'solo';
    const seat = mine.players.findIndex((player) => player.tab === TAB_ID);
    return seat === 0 ? 'host' : 'guest';
  }

  return { handle, wake, snapshots: () => snapshots(read()), role };
})();

// --- P2P ROOM SERVICE (WebRTC over PeerJS) ----------------------------------------
// GitHub Pages serves static files only: no Node process, no /rooms WebSocket.
// LOCAL_ROOMS above can only link tabs of one browser, so real players on
// different machines could never share a bay. This service restores multiplayer
// on any static host: the room lead's browser claims the bay's peer ID on
// PeerJS's free public broker and becomes the authority, speaking the exact
// same message protocol as the server's room service (join / config / start /
// launch / coop / chat / end). Guests reach the bay directly over WebRTC data
// channels — entering a bay always lands somewhere: claim it when empty, join
// as crew when a room lead already holds it. If the broker script never loads
// (offline, blocked), every path degrades back to LOCAL_ROOMS tab linking.
const P2P_ROOMS = (() => {
  const NS = 'cbz-cbz0-v1'; // peer-ID namespace base on the public broker
  // Peer IDs are global on the broker: scope them per deployment host so the
  // Pages site, dev servers, and any fork never fight over the same bays.
  const HOST_KEY = (String(location.hostname || 'local').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)) || 'local';
  const BAYS = [
    ['room-01', 'ROOM 01 // ALPHA'],
    ['room-02', 'ROOM 02 // BRAVO'],
    ['room-03', 'ROOM 03 // CHARLIE'],
    ['room-04', 'ROOM 04 // DELTA'],
  ];
  const MAX_PLAYERS = 4;
  const CLAIM_MS = 10000;  // broker registration window for a bay claim
  const LINK_MS = 10000;   // guest handshake window
  const PROBE_MS = 4500;   // bay scan window
  const SCAN_GAP = 2500;   // minimum gap between scans of one bay
  const VIEW_TTL = 30000;  // scanned snapshots expire, like server room lists
  const CHAT_HISTORY = 50;

  // Relay lane: public MQTT brokers over WSS. WebRTC cannot punch symmetric
  // NAT / CGNAT (every free TURN relay on the open grid is dead — verified
  // 2026-10-21), so when the peer link fails the bay keeps running through
  // the relay: plain outbound TCP, identical room protocol, per-seat
  // adapters. P2P stays primary; the relay is the safety net that makes
  // cross-device multiplayer work for EVERYONE, not just easy NATs.
  const RELAY_URLS = ['wss://broker.hivemq.com:8884/mqtt', 'wss://broker.emqx.io:8084/mqtt'];
  const FORCE_RELAY = /[?&]cbzrelay\b/.test(location.search); // QA hook: skip P2P, ride the relay lane
  const STATE_PUB_MS = 3000;   // bay heartbeat on the relay (drives guest scans)
  const RELAY_SYNC_MS = 240;   // coop sync throttle per relay seat (~4Hz)
  const RELAY_JOIN_MS = 14000; // relay handshake window

  // ICE ladder: Google STUN + Cloudflare STUN for ordinary NATs. Every free
  // public TURN relay is dead (OpenRelay/AnyFirewall verified dead 2026-10-21),
  // so hard-NAT players no longer try a doomed relay hop — the relay LANE
  // below carries them instead, which no NAT can block (outbound TCP).
  const PEER_CONFIG = {
    debug: 0,
    config: {
      iceServers: [
        { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] },
      ],
      iceCandidatePoolSize: 2,
    },
  };

  let clientPeer = null;   // random-id peer: bay scans + guest links ride on it
  let hubPeer = null;      // bay-id peer claimed while hosting a bay
  let clientReady = false;
  let p2pBroken = false;     // PeerJS lane unusable this session (broker dead)
  let relayDead = false;     // mqtt lib missing — relay lane impossible
  let relay = null;          // {client} — shared public-broker connection
  let relayReady = false;    // broker session live right now
  const cid = Math.random().toString(36).slice(2, 10); // per-tab relay identity
  let relayIdx = 0;          // RELAY_URLS cursor across reconnect cycles
  let relayTries = 0;        // failed connect cycles on the current URL
  const relayHandlers = new Map(); // topic -> handler(message)
  let relayWatching = false; // subscribed to the four bay state topics
  let stateTimer = 0;        // host bay heartbeat interval
  let callsign = '';
  let myBay = null;        // HOST: {id, name, map, started, launchId, players:[{callsign, conn}]}
  let guestLink = null;    // GUEST: {id, conn, room}
  let views = new Map();   // bay id -> {room, seen} from bay scans
  let scans = new Map();   // bay id -> {conn, timer}
  let lastScan = new Map();
  let chatLog = [];
  let wired = false;
  let onClientOpen = null; // queued join that arrived before the broker handshake
  let lastPong = 0;        // last heartbeat echo from the room lead

  const peerId = (bay) => `${NS}-${HOST_KEY}-${bay}`;
  // Zombie escape: a crashed or suspended session can leave its deterministic
  // bay ID registered on the public signaling cloud. The dead holder blocks
  // both the claim (unavailable-id) and the join (peer-unavailable) forever.
  // Hosts escape to suffixed IDs (-r, -rr); relay dual-homing keeps those bays
  // discoverable because relay topics derive from the bay, not the peer ID.
  const HOST_SUFFIXES = ['', '-r', '-rr'];
  const nextSuffix = (suffix) => {
    const at = HOST_SUFFIXES.indexOf(suffix);
    return at >= 0 && at < HOST_SUFFIXES.length - 1 ? HOST_SUFFIXES[at + 1] : null;
  };
  const bayName = (bay) => (BAYS.find(([id]) => id === bay) || [bay, bay])[1];
  const p2pUsable = () => !p2pBroken && typeof window.Peer === 'function';
  const relayUsable = () => !relayDead && typeof window.mqtt === 'object' && Boolean(window.mqtt) && typeof window.mqtt.connect === 'function';
  const usable = () => p2pUsable() || relayUsable();
  const inRoom = () => Boolean(myBay || guestLink);
  const guestConns = () => (myBay ? myBay.players.slice(1).map((player) => player.conn) : []);

  function send(conn, message) {
    if (!conn || !conn.open) return;
    try {
      // Relay seats are adapters that take the raw object and publish it
      // addressed; peer seats speak JSON over the data channel.
      if (conn.lane === 'mqtt') conn.send(message);
      else conn.send(JSON.stringify(message));
    } catch { /* link already gone. */ }
  }

  function closeConn(conn) { try { if (conn) conn.close(); } catch { /* ignore. */ } }

  // The bay browser repaints only when a scan actually changed something, so a
  // dialog full of probes never flickers.
  function paintBays() {
    const next = snapshots();
    if (JSON.stringify(next) === JSON.stringify(roomList)) return;
    roomList = next;
    if (dialog.open && showingBays && !currentRoom) renderBays();
  }

  function ensureClient() {
    if (clientPeer && !clientPeer.destroyed) {
      if (clientReady) return clientPeer;
      if (clientPeer.disconnected) { try { clientPeer.reconnect(); } catch { /* ignore */ } }
      return clientPeer;
    }
    clientReady = false;
    try {
      clientPeer = new window.Peer(PEER_CONFIG);
    } catch {
      p2pBroken = true;
      return null;
    }
    clientPeer.on('open', () => {
      clientReady = true;
      scan(true); // a bays view may already be open, waiting on this handshake
      if (onClientOpen) { const queued = onClientOpen; onClientOpen = null; queued(); }
    });
    clientPeer.on('disconnected', () => {
      clientReady = false;
      try { clientPeer.reconnect(); } catch { /* ignore */ }
    });
    clientPeer.on('error', (error) => {
      const type = error && error.type;
      if (type === 'peer-unavailable') {
        // "Could not connect to peer <id>" — that bay has no room lead right now.
        const target = String(error.message || '').trim().split(/\s+/).pop();
        for (const [bay, entry] of scans) {
          if (peerId(bay) === target) finishScan(bay, null);
        }
        for (const bay of [...views.keys()]) {
          if (peerId(bay) === target) views.delete(bay);
        }
        paintBays();
        return;
      }
      if (type === 'browser-incompatible' || type === 'server-error' || type === 'socket-error') {
        p2pBroken = true;
        paintBays();
      }
    });
    return clientPeer;
  }

  function finishScan(bay, room) {
    const entry = scans.get(bay);
    scans.delete(bay);
    if (entry) {
      clearTimeout(entry.timer);
      closeConn(entry.conn);
    }
    // room === undefined: scan timed out, keep the last known view.
    if (room) views.set(bay, { room, seen: Date.now() });
    else if (room === null) views.delete(bay); // bay confirmed empty by the broker
    paintBays();
  }

  // Live bay scan: one short-lived data connection per bay asks any room lead
  // for its current snapshot. A self-healing tick keeps it running while the
  // bays browser is on screen — probes fired before the broker handshake
  // finishes are dropped, so the tick retries until real results land.
  function scan(force) {
    if (!p2pUsable() || myBay || guestLink) return;
    const peer = ensureClient();
    if (!peer) return;
    const now = Date.now();
    for (const [bay] of BAYS) {
      if (scans.has(bay)) continue;
      if (!force && now - (lastScan.get(bay) || 0) < SCAN_GAP) continue;
      lastScan.set(bay, now);
      let conn;
      try { conn = peer.connect(peerId(bay), { reliable: true }); } catch { continue; }
      const entry = { conn, timer: setTimeout(() => finishScan(bay, undefined), PROBE_MS) };
      scans.set(bay, entry);
      conn.on('open', () => send(conn, { type: 'state' }));
      conn.on('data', (raw) => {
        let message;
        try { message = JSON.parse(raw); } catch { return; }
        if (message.type === 'room-state' && message.room) finishScan(bay, message.room);
      });
      conn.on('close', () => { if (scans.get(bay) === entry) finishScan(bay, undefined); });
      conn.on('error', () => { if (scans.get(bay) === entry) finishScan(bay, undefined); });
    }
  }

  function hostSnapshot() {
    return {
      id: myBay.id,
      name: myBay.name,
      map: myBay.map,
      protocol: myBay.protocol || null,
      maxPlayers: MAX_PLAYERS,
      started: myBay.started,
      commanders: myBay.players.map((player, index) => ({ callsign: player.callsign, isHost: index === 0 })),
    };
  }

  function snapshots() {
    const now = Date.now();
    return BAYS.map(([id, name]) => {
      if (myBay && myBay.id === id) return hostSnapshot();
      if (guestLink && guestLink.id === id && guestLink.room) return guestLink.room;
      const view = views.get(id);
      if (view && now - view.seen < VIEW_TTL) return view.room;
      return { id, name, map: null, maxPlayers: MAX_PLAYERS, started: false, commanders: [] };
    });
  }

  function role() {
    if (myBay && myBay.started) return 'host';
    if (guestLink && guestLink.room && guestLink.room.started) return 'guest';
    return 'solo';
  }

  function wake() {
    if (wired) {
      // Re-arm the peer net each time the play menu wakes up — a broker hiccup
      // or a dead Wi-Fi moment must never permanently disable multiplayer.
      if (p2pBroken && !myBay && !guestLink) p2pBroken = false;
      return;
    }
    wired = true;
    callsign = (myName || 'COMMANDER').toUpperCase();
    // Dropping the page must free the bay for everyone — destroy the hub peer
    // so every guest link closes immediately, exactly like the server would.
    const dropBay = () => {
      if (hubPeer) { try { hubPeer.destroy(); } catch { /* ignore */ } hubPeer = null; }
      if (myBay) relayDropBay(myBay.id);
    };
    window.addEventListener('pagehide', dropBay);
    window.addEventListener('beforeunload', dropBay);
    ensureClient();
    if (relayUsable()) ensureRelay();
    // Bay scan heartbeat: only acts while the bays browser is on screen.
    setInterval(() => {
      if (dialog.open && showingBays && !currentRoom && usable()) scan();
      relayWatch(dialog.open && showingBays && !currentRoom && !myBay && !guestLink);
    }, 1200);
    // Seat keepalive: WebRTC fires no timely close when a tab dies (consent
    // expiry can lag 30s+), so both ends ping every 5s and sweep silent links.
    setInterval(() => {
      const now = Date.now();
      if (myBay) {
        for (const seat of myBay.players) {
          if (seat.conn && now - (seat.lastSeen || 0) > 16000) {
            closeConn(seat.conn);
            dropConn(seat.conn);
          }
        }
      }
      if (guestLink && guestLink.conn) {
        if (lastPong && now - lastPong > 16000) {
          closeConn(guestLink.conn);
          linkLost();
        } else {
          send(guestLink.conn, { type: 'ping' });
        }
      }
    }, 5000);
  }

  function handle(message) {
    if (!usable()) return;
    wake();
    switch (message.type) {
      case 'authenticate':
        callsign = (myName || message.callsign || 'COMMANDER').toUpperCase();
        handleServiceMessage({ type: 'linked', callsign, rooms: snapshots(), chat: chatLog });
        return;
      case 'rooms':
        scan();
        paintBays();
        return;
      case 'join': return enterBay(String(message.room || ''));
      case 'config': return configure(message.map, message.protocol);
      case 'start': return startMission();
      case 'leave': return leaveBay();
      case 'end': return conclude();
      case 'chat': return chat(String(message.text || ''));
      case 'coop': return relayOut(message.kind, message.data);
    }
  }

  function enterBay(bay) {
    if (!BAYS.some(([id]) => id === bay)) return handleServiceMessage({ type: 'error', message: 'Room not found.' });
    if (myBay || guestLink) return handleServiceMessage({ type: 'error', message: 'Leave your current room before switching.' });
    if (FORCE_RELAY) return joinRelay(bay); // QA hook: exercise the relay lane directly
    claim(bay, 0);
  }

  // First handshake: try to claim the bay as room lead. If another commander
  // already holds the peer ID, fall through and join as crew instead — either
  // way, ENTER ROOM lands you inside the bay.
  function claim(bay, attempt, suffix = '') {
    let peer;
    try { peer = new window.Peer(peerId(bay) + suffix, PEER_CONFIG); } catch { p2pBroken = true; return; }
    let settled = false;
    let timer = 0;
    const settle = (fn) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    timer = setTimeout(() => settle(() => {
      try { peer.destroy(); } catch { /* ignore */ }
      // The broker never answered: ONE retry (brokers hiccup) before the peer
      // lane is marked dead and the relay lane takes over hosting.
      if (attempt < 1) { scan(true); claim(bay, attempt + 1, suffix); return; }
      p2pBroken = true;
      if (relayUsable()) { mqttHost(bay); return; }
      handleServiceMessage({ type: 'error', message: 'PEER NET UNREACHABLE // BAYS LINK TABS ON THIS MACHINE ONLY' });
    }), CLAIM_MS);
    peer.on('open', () => settle(() => {
      hubPeer = peer;
      myBay = { id: bay, name: bayName(bay), map: null, protocol: null, started: false, launchId: null, players: [{ callsign, conn: null, lastSeen: Date.now() }] };
      wireHub(peer);
      relayServeBay(bay); // dual-home the bay: relay guests can scan + join too
      handleServiceMessage({ type: 'joined', you: callsign, room: hostSnapshot() });
    }));
    peer.on('error', (error) => {
      if (error && error.type === 'unavailable-id') {
        settle(() => { try { peer.destroy(); } catch { /* ignore */ } join(bay, attempt, suffix); });
        return;
      }
      if (!settled) settle(() => { try { peer.destroy(); } catch { /* ignore */ } });
    });
  }

  function uniqueName(name) {
    const taken = new Set(myBay.players.map((player) => player.callsign));
    if (!taken.has(name)) return name;
    for (let i = 2; ; i += 1) if (!taken.has(`${name}-${i}`)) return `${name}-${i}`;
  }

  function join(bay, attempt, suffix = '') {
    const peer = ensureClient();
    if (!peer) return;
    if (!clientReady) {
      // Broker handshake still running — queue the join for the moment it lands.
      onClientOpen = () => join(bay, attempt, suffix);
      return;
    }
    let conn;
    try { conn = peer.connect(peerId(bay) + suffix, { reliable: true }); } catch { return; }
    let settled = false;
    let timer = 0;
    let zombieProbe = null;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (zombieProbe && typeof peer.off === 'function') { try { peer.off('error', zombieProbe); } catch { /* listener stays; it no-ops once settled */ } }
    };
    // The holder never answered — a zombie registration or hard NAT. Escape to
    // a free suffixed ID (as a future claim) before leaning on the relay.
    const zombieEscape = () => {
      const next = nextSuffix(suffix);
      if (next) { scan(true); claim(bay, 0, next); return true; }
      return false;
    };
    const bayDead = () => {
      // A real (dual-homed) host answers on the relay regardless of which
      // signaling instance holds the peer ID — try the relay join FIRST so a
      // live room is joined, not shadow-hosted. Only when the relay cannot
      // deliver us does a suffixed claim give the player a room of their own.
      if (relayUsable()) { joinRelay(bay, suffix); return; }
      if (zombieEscape()) return;
      handleServiceMessage({ type: 'error', message: 'BAY DID NOT ANSWER // TRY AGAIN OR PICK ANOTHER ROOM' });
    };
    timer = setTimeout(() => {
      if (settled) return;
      finish();
      closeConn(conn);
      // Peer link never opened (typical hard-NAT or zombie-holder outcome):
      // escape to a suffixed claim first, then fall through to the relay.
      bayDead();
    }, LINK_MS);
    conn.on('open', () => send(conn, { type: 'join', callsign }));
    // A dead registration answers nothing but errors fast: three
    // peer-unavailable signals on this exact target mean zombie — no need to
    // burn the whole handshake window.
    let deadSignals = 0;
    zombieProbe = (error) => {
      if (settled) return;
      if (error && error.type === 'peer-unavailable' && String(error.message || '').includes(peerId(bay) + suffix)) {
        deadSignals += 1;
        if (deadSignals >= 3) {
          finish();
          closeConn(conn);
          bayDead();
        }
      }
    };
    peer.on('error', zombieProbe);
    conn.on('data', (raw) => {
      let message;
      try { message = JSON.parse(raw); } catch { return; }
      if (message.type === 'joined') {
        finish();
        guestLink = { id: bay, conn, room: message.room };
        callsign = message.you || callsign;
        lastPong = Date.now();
        handleServiceMessage({ type: 'joined', you: callsign, room: message.room });
        if (Array.isArray(message.chat)) message.chat.forEach(appendChat);
        return;
      }
      if (message.type === 'error') {
        finish();
        closeConn(conn);
        handleServiceMessage({ type: 'error', message: message.message });
        return;
      }
      guestMessages(conn, message);
    });
    conn.on('close', () => {
      if (guestLink && guestLink.conn === conn) return linkLost();
      if (settled) return;
      finish();
      // The lead vanished between our scan and join — try claiming the bay.
      if (attempt < 2) claim(bay, attempt + 1, suffix);
      else handleServiceMessage({ type: 'error', message: 'BAY DID NOT ANSWER // TRY AGAIN OR PICK ANOTHER ROOM' });
    });
    conn.on('error', () => { if (!settled) { finish(); closeConn(conn); if (relayUsable()) joinRelay(bay, suffix); else zombieEscape(); } });
  }

  // Everything a linked guest can receive once the handshake is done. Same
  // message shapes the node server sends over its /rooms socket.
  function guestMessages(conn, message) {
    if (message.type === 'ping') { lastPong = Date.now(); return; }
    if (message.type === 'room-update') {
      if (guestLink && guestLink.conn === conn) guestLink.room = message.room;
      handleServiceMessage(message);
      return;
    }
    if (message.type === 'launch') {
      // Carry the started room into the link BEFORE the bridge reads its role.
      if (guestLink && guestLink.conn === conn) guestLink.room = message.room;
      handleServiceMessage(message);
      return;
    }
    if (['chat', 'coop', 'error', 'rooms'].includes(message.type)) {
      handleServiceMessage(message);
    }
  }

  function linkLost() {
    guestLink = null;
    if (currentRoom) {
      currentRoom = null;
      showToast('ROOM LEAD LINK LOST // BAY CLOSED');
      setStatus('ROOM SERVICE ONLINE');
      if (dialog.open) renderBays();
    }
  }

  // --- Relay lane: public MQTT brokers over WSS --------------------------------
  // Same room protocol, different pipe. Host adapters live inside
  // myBay.players like any peer seat, so hubMessage/pushRoomUpdate/
  // startMission all run unmodified for relay guests.
  const relayTopic = (bay, kind) => `cbz0/${HOST_KEY}/${bay}/${kind}`;

  function ensureRelay() {
    if (relay) return relay;
    const lib = window.mqtt;
    if (!lib || typeof lib.connect !== 'function') { relayDead = true; return null; }
    try {
      const client = lib.connect(RELAY_URLS[relayIdx], {
        clientId: `cbz-${cid}-${Math.random().toString(36).slice(2, 6)}`,
        clean: true,
        connectTimeout: 8000,
        reconnectPeriod: 6000,
        keepalive: 30,
      });
      client.on('connect', () => {
        relayReady = true;
        relayTries = 0;
        // Re-arm every subscription this session owns (fresh broker session).
        for (const topic of relayHandlers.keys()) { try { client.subscribe(topic); } catch { /* retried on next watch tick */ } }
        paintBays();
      });
      client.on('close', () => { relayReady = false; });
      client.on('error', () => { /* mqtt.js keeps retrying; relayPub no-ops while down */ });
      client.on('message', (topic, raw) => {
        const handler = relayHandlers.get(topic);
        if (!handler) return;
        let message;
        try { message = JSON.parse(raw.toString()); } catch { return; }
        handler(message);
      });
      relay = { client };
      // Cycle URLs when this broker stays unreachable (2 failed cycles = swap).
      setInterval(() => {
        if (!relay || relay.client.connected || relay.client.disconnecting) return;
        relayTries += 1;
        if (relayTries < 2) return;
        relayTries = 0;
        relayIdx = (relayIdx + 1) % RELAY_URLS.length;
        try { relay.client.end(true); } catch { /* ignore */ }
        relay = null;
        relayWatching = false;
      }, 12000);
    } catch {
      relayDead = true;
      relay = null;
    }
    return relay;
  }

  function relaySub(topic, handler) {
    const r = ensureRelay();
    if (!r) return;
    relayHandlers.set(topic, handler);
    try { if (r.client.connected) r.client.subscribe(topic); } catch { /* re-armed on connect */ }
  }

  function relayUnsub(topic) {
    relayHandlers.delete(topic);
    try { if (relay && relay.client.connected) relay.client.unsubscribe(topic); } catch { /* ignore */ }
  }

  function relayPub(topic, message) {
    const r = ensureRelay();
    if (!r || !r.client.connected) return;
    try { r.client.publish(topic, JSON.stringify(message)); } catch { /* link blip; next tick re-sends */ }
  }

  // Bay discovery over the relay: while the bays browser is on screen we
  // subscribe to every bay's state heartbeat. Live-only (no retained
  // messages) — a dead room lead's bay simply goes quiet and drops out.
  function relayWatch(open) {
    if (!relayUsable()) { if (relayWatching) dropWatch(); return; }
    if (open && !relayWatching) {
      relayWatching = true;
      for (const [bay] of BAYS) {
        relaySub(relayTopic(bay, 'state'), (message) => {
          if (myBay || guestLink) return;
          if (message && message.offline) { views.delete(bay); paintBays(); return; }
          if (message && message.id === bay) { views.set(bay, { room: message, seen: Date.now() }); paintBays(); }
        });
      }
      paintBays();
    } else if (!open && relayWatching) dropWatch();
  }

  function dropWatch() {
    relayWatching = false;
    for (const [bay] of BAYS) relayUnsub(relayTopic(bay, 'state'));
  }

  // HOST: serve one bay over the relay — guest joins ride the up topic, every
  // reply is addressed back through the down topic, and the bay heartbeat
  // publishes on the state topic so relay scanners can find the room.
  function relayServeBay(bay) {
    const up = relayTopic(bay, 'up');
    const dn = relayTopic(bay, 'dn');
    relaySub(up, (message) => {
      if (!myBay || myBay.id !== bay || !message || typeof message.cid !== 'string') return;
      if (message.type === 'join') { mqttGuestJoin(bay, message); return; }
      const seat = myBay.players.find((player) => player.conn && player.conn.lane === 'mqtt' && player.conn.cid === message.cid);
      if (seat) hubMessage(seat.conn, message);
    });
    clearInterval(stateTimer);
    stateTimer = setInterval(() => {
      if (myBay && myBay.id === bay) relayPub(relayTopic(bay, 'state'), hostSnapshot());
    }, STATE_PUB_MS);
  }

  function relayDropBay(bay) {
    clearInterval(stateTimer);
    stateTimer = 0;
    relayPub(relayTopic(bay, 'state'), { offline: true });
    relayUnsub(relayTopic(bay, 'up'));
    relayUnsub(relayTopic(bay, 'state'));
  }

  function mqttGuestJoin(bay, message) {
    if (!myBay || myBay.id !== bay) return;
    const dn = relayTopic(bay, 'dn');
    // Duplicate knocks (public-broker latency) must never spawn phantom seats.
    const existing = myBay.players.find((player) => player.conn && player.conn.lane === 'mqtt' && player.conn.cid === message.cid);
    if (existing) return send(existing.conn, { type: 'joined', you: existing.callsign, room: hostSnapshot(), chat: chatLog });
    const seat = {
      lane: 'mqtt',
      cid: message.cid,
      open: true,
      lastSeen: Date.now(),
      send: (reply) => relayPub(dn, { ...reply, to: message.cid }),
      close: () => { try { relayPub(dn, { to: message.cid, type: 'error', message: 'ROOM LEAD CLOSED THE BAY.' }); } catch { /* ignore */ } },
    };
    hubMessage(seat, { type: 'join', callsign: message.callsign });
  }

  // HOST fallback: the peer broker never answered, so hold the bay purely on
  // the relay. Scanners on either lane still find it; guests join via relay.
  function mqttHost(bay) {
    if (myBay || guestLink) return;
    if (!relayUsable()) return handleServiceMessage({ type: 'error', message: 'PEER NET UNREACHABLE // BAYS LINK TABS ON THIS MACHINE ONLY' });
    myBay = { id: bay, name: bayName(bay), map: null, protocol: null, started: false, launchId: null, players: [{ callsign, conn: null, lastSeen: Date.now() }] };
    relayServeBay(bay);
    handleServiceMessage({ type: 'joined', you: callsign, room: hostSnapshot() });
  }

  // GUEST relay link: subscribe the bay's down topic, knock on the up topic
  // until the lead answers. Once joined, the SAME link carries the full room
  // protocol (room updates, launch, chat, coop sync) — adapters keep the
  // runtime code lane-agnostic.
  function joinRelay(bay, suffix = '') {
    if (myBay || guestLink) return;
    if (!relayUsable()) return handleServiceMessage({ type: 'error', message: 'RELAY NET UNREACHABLE // BAYS LINK TABS ON THIS MACHINE ONLY' });
    const up = relayTopic(bay, 'up');
    const dn = relayTopic(bay, 'dn');
    let settled = false;
    let knocks = 0;
    const link = {
      lane: 'mqtt',
      open: true,
      send: (message) => relayPub(up, { ...message, cid }),
      close: () => {
        try { relayPub(up, { type: 'leave', cid }); } catch { /* ignore */ }
        relayUnsub(dn);
      },
    };
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      clearInterval(knock);
      relayUnsub(dn);
      // Nobody answered on the relay either: the holder is dead or unreachable.
      // Escape to a free suffixed peer ID (host there) before giving up.
      const next = nextSuffix(suffix);
      if (next) { scan(true); claim(bay, 0, next); return; }
      handleServiceMessage({ type: 'error', message: 'BAY DID NOT ANSWER // TRY AGAIN OR PICK ANOTHER ROOM' });
    }, RELAY_JOIN_MS);
    const knock = setInterval(() => {
      if (settled || knocks > 10) return;
      knocks += 1;
      relayPub(up, { type: 'join', callsign, cid });
    }, 1400);
    relaySub(dn, (message) => {
      if (!message || (message.to && message.to !== cid)) return;
      if (!settled) {
        if (message.type === 'joined') {
          settled = true;
          clearTimeout(timer);
          clearInterval(knock);
          guestLink = { id: bay, lane: 'mqtt', conn: link, room: message.room };
          callsign = message.you || callsign;
          lastPong = Date.now();
          handleServiceMessage({ type: 'joined', you: callsign, room: message.room });
          if (Array.isArray(message.chat)) message.chat.forEach(appendChat);
        } else if (message.type === 'error') {
          settled = true;
          clearTimeout(timer);
          clearInterval(knock);
          relayUnsub(dn);
          handleServiceMessage({ type: 'error', message: message.message });
        }
        return;
      }
      if (guestLink && guestLink.conn === link) guestMessages(link, message);
    });
    relayPub(up, { type: 'join', callsign, cid });
  }

  function wireHub(peer) {
    peer.on('connection', (conn) => {
      conn.on('data', (raw) => {
        let message;
        try { message = JSON.parse(raw); } catch { return; }
        hubMessage(conn, message);
      });
      conn.on('close', () => dropConn(conn));
      conn.on('error', () => dropConn(conn));
    });
    peer.on('disconnected', () => { try { peer.reconnect(); } catch { /* ignore */ } });
    peer.on('error', () => { /* claim errors surface elsewhere; keep the bay alive. */ });
  }

  // The hub speaks the server's room protocol verbatim.
  function hubMessage(conn, message) {
    if (!myBay) return;
    if (message.type === 'ping') {
      const player = myBay.players.find((seat) => seat.conn === conn);
      if (player) player.lastSeen = Date.now();
      send(conn, { type: 'ping' });
      return;
    }
    if (message.type === 'state') {
      send(conn, { type: 'room-state', room: hostSnapshot() });
      setTimeout(() => closeConn(conn), 400);
      return;
    }
    if (message.type === 'join') {
      if (myBay.started) return send(conn, { type: 'error', message: 'This room has already started.' });
      if (myBay.players.length >= MAX_PLAYERS) return send(conn, { type: 'error', message: 'Room is full. Choose another room.' });
      const name = uniqueName(
        String(message.callsign || 'COMMANDER').toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 16) || 'COMMANDER',
      );
      myBay.players.push({ callsign: name, conn, lastSeen: Date.now() });
      send(conn, { type: 'joined', you: name, room: hostSnapshot(), chat: chatLog });
      pushRoomUpdate();
      return;
    }
    const seat = myBay.players.findIndex((player) => player.conn === conn);
    if (seat === -1) return;
    const sender = myBay.players[seat];
    if (message.type === 'leave') { closeConn(conn); return dropConn(conn); }
    if (message.type === 'end') return conclude();
    if (message.type === 'chat') {
      const text = String(message.text || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 280);
      if (!text) return;
      const entry = { from: sender.callsign, text, ts: Date.now() };
      chatLog.push(entry);
      if (chatLog.length > CHAT_HISTORY) chatLog.splice(0, chatLog.length - CHAT_HISTORY);
      appendChat(entry);
      for (const other of guestConns()) if (other !== conn) send(other, { type: 'chat', ...entry });
      return;
    }
    // Squad relay: guests ship placements/installs to the lead — the lead's sim
    // validates them, exactly like the node server forwards intents.
    if (message.type === 'coop' && message.kind === 'intent') {
      if (window.CBZCombat) CBZCombat.coopHandle({ k: 'intent', ...(message.data || {}) });
    }
  }

  function dropConn(conn) {
    if (!myBay) return;
    const index = myBay.players.findIndex((player) => player.conn === conn);
    if (index === -1) return;
    myBay.players.splice(index, 1);
    if (!myBay.players.length) Object.assign(myBay, { map: null, protocol: null, started: false, launchId: null });
    pushRoomUpdate();
  }

  function pushRoomUpdate() {
    if (!myBay) return;
    const room = hostSnapshot();
    if (currentRoom && currentRoom.id === myBay.id) {
      currentRoom = room;
      if (dialog.open && !showingBays) renderLobby();
    }
    for (const conn of guestConns()) send(conn, { type: 'room-update', room });
  }

  function configure(map, protocol) {
    if (!myBay || myBay.started) return;
    if (map && Object.keys(BATTLE_MAPS).includes(map)) myBay.map = map;
    if (protocol && ROOM_PROTOCOLS.includes(protocol)) myBay.protocol = protocol;
    pushRoomUpdate();
  }

  function startMission() {
    if (!myBay || myBay.started) return;
    if (!myBay.map) return handleServiceMessage({ type: 'error', message: 'Select a map before starting.' });
    myBay.started = true;
    myBay.launchId = `${Date.now()}`;
    const room = hostSnapshot();
    for (const conn of guestConns()) send(conn, { type: 'launch', room });
    handleServiceMessage({ type: 'launch', room });
  }

  function conclude() {
    if (myBay && myBay.started) {
      myBay.started = false;
      myBay.launchId = null;
      pushRoomUpdate();
      return;
    }
    if (guestLink && guestLink.conn) send(guestLink.conn, { type: 'end' });
  }

  function leaveBay() {
    if (guestLink) {
      send(guestLink.conn, { type: 'leave' });
      closeConn(guestLink.conn);
      guestLink = null;
      return;
    }
    if (myBay) {
      for (const conn of guestConns()) send(conn, { type: 'error', message: 'ROOM LEAD CLOSED THE BAY.' });
      try { hubPeer.destroy(); } catch { /* ignore */ }
      hubPeer = null;
      relayDropBay(myBay.id);
      myBay = null;
    }
  }

  // Squad relay: the room lead broadcasts authoritative snapshots; guests ship
  // intents back for the lead's sim to validate — same contract as the server.
  function relayOut(kind, data) {
    if (myBay && myBay.started) {
      if (kind !== 'sync' && kind !== 'over') return;
      const now = Date.now();
      for (const conn of guestConns()) {
        // Relay seats ride a public broker: throttle snapshot spam to ~4Hz.
        if (conn.lane === 'mqtt') {
          if (kind === 'sync' && now - (conn.lastSync || 0) < RELAY_SYNC_MS) continue;
          conn.lastSync = now;
        }
        send(conn, { type: 'coop', kind, data, from: callsign });
      }
      return;
    }
    if (guestLink && guestLink.conn) send(guestLink.conn, { type: 'coop', kind, data, from: callsign });
  }

  function chat(text) {
    const clean = String(text || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 280);
    if (!clean) return;
    const entry = { from: callsign || chatIdentity(), text: clean, ts: Date.now() };
    if (myBay) {
      chatLog.push(entry);
      if (chatLog.length > CHAT_HISTORY) chatLog.splice(0, chatLog.length - CHAT_HISTORY);
      appendChat(entry);
      for (const conn of guestConns()) send(conn, { type: 'chat', ...entry });
      return;
    }
    if (guestLink && guestLink.conn) {
      appendChat(entry);
      send(guestLink.conn, { type: 'chat', text: clean });
    }
  }

  function bridge() {
    if (!inRoom()) return null;
    return {
      role: role(),
      send: (msg) => { const { k, ...data } = msg; relayOut(k, data); },
    };
  }

  return { usable, p2pUsable, relayUsable, wake, handle, snapshots, scan, role, inRoom, bridge, chat };
})();

function sendToService(message) {
  if (LOCAL.down()) {
    // Static host: prefer the peer-net relay (real cross-device multiplayer);
    // fall back to same-browser tab linking when the broker is unavailable.
    if (P2P_ROOMS.usable()) P2P_ROOMS.handle(message);
    else LOCAL_ROOMS.handle(message);
    return;
  }
  if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function connectRoom() {
  if (socket && socket.readyState < WebSocket.CLOSING) socket.close();
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  socket = new WebSocket(`${protocol}//${location.host}/rooms`);
  socket.addEventListener('open', () => {
    document.querySelector('#server-status').textContent = 'ROOM SERVICE CONNECTED';
    // Bays require a commander session — the same token that logged you in.
    sendToService({ type: 'authenticate', token: authToken });
  });
  socket.addEventListener('message', ({ data }) => {
    let message;
    try { message = JSON.parse(data); } catch { return; }
    handleServiceMessage(message);
  });
  socket.addEventListener('close', () => {
    document.querySelector('#server-status').textContent = myName ? 'ACCOUNT LINKED // MENU SYSTEM READY' : 'MENU SYSTEM READY';
  });
  socket.addEventListener('error', () => showToast('Could not reach the room service. Check the server port.'));
}

// Hosted build (core-breach-host answers /api/hosted): the old room lanes have no service here, ONLINE ROOMS is the multiplayer.
let hostedBuild = false;
fetch('/api/hosted', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((j) => {
  hostedBuild = !!(j && j.ok);
  if (!hostedBuild) return;
  // The room lanes are hidden here, so the PLAY MENU copy must not promise them.
  menus.play.description = menus.play.description.replace('Enter one of four rooms for up to four commanders, or recon any of the 5 battle maps solo.', 'Recon any of the 5 battle maps solo. Squad missions for up to four commanders live in ONLINE ROOMS.');
  menus.play.stats = [['MAP RECON', '5 SECTORS'], ['SQUAD MISSIONS', 'ONLINE ROOMS'], ['SERVER PORT', port]];
  document.querySelector('.menu-item[data-menu="play"] small').textContent = 'Solo map recon';
  if (document.querySelector('.menu-item.selected')?.dataset.menu === 'play') updatePreview('play');
}).catch(() => {});

function openPlayMenu() {
  if (hostedBuild) { showingBays = false; return renderMapSelect(); }
  if (LOCAL.down()) {
    showingBays = true;
    if (P2P_ROOMS.usable()) {
      // Peer net: commanders claim bays across the open grid — no server needed.
      P2P_ROOMS.wake();
      if (currentRoom && P2P_ROOMS.inRoom()) return renderLobby();
      roomList = P2P_ROOMS.snapshots();
      renderBays();
      return;
    }
    // Broker script unavailable: the four bays run locally off localStorage —
    // join one, pick a map, launch. Links tabs of this browser only.
    LOCAL_ROOMS.wake();
    roomList = LOCAL_ROOMS.snapshots();
    renderBays();
    return;
  }
  // Already linked to the room service? Show the live lobby/bays without
  // reconnecting — a fresh socket would eject this commander from their room.
  if (socket && socket.readyState === WebSocket.OPEN) {
    if (currentRoom) return renderLobby();
    showingBays = true;
    renderBays();
    sendToService({ type: 'rooms' });
    return;
  }
  document.querySelector('#server-status').textContent = 'CONNECTING...';
  body.innerHTML = '<p class="lobby-state" role="status">LINKING TO ROOM SERVICE...</p>';
  showingBays = true; // 'linked' will flip this view into the live bay browser
  connectRoom();
}

function renderBays() {
  showingBays = true;
  currentRoom = null;
  window.CBZ_ROOM_PLAYERS = 1;
  document.querySelector('#dialog-kicker').textContent = '// AVAILABLE ROOMS';
  document.querySelector('#dialog-title').textContent = 'SELECT A ROOM';
  const reconButton = '<button class="action-button bay-recon" id="map-recon" type="button"><b>SOLO MAP RECON</b><small>Open one of the five maps without joining a room</small></button>';
  if (!roomList.length) {
    body.innerHTML = `<p class="dialog-copy">Enter one of four rooms for up to four commanders. Select a map after entering.</p>${reconButton}<p class="lobby-state">LINKING TO ROOMS...</p>`;
    document.querySelector('#map-recon').addEventListener('click', renderMapSelect);
    return;
  }
  const netLine = LOCAL.down()
    ? (P2P_ROOMS.p2pUsable() && P2P_ROOMS.relayUsable()
      ? '<p class="lobby-state net-ok">PEER NET ONLINE // RELAY NET ARMED — EVERY COMMANDER GETS IN, EVEN BEHIND STUBBORN NATS</p>'
      : P2P_ROOMS.p2pUsable()
        ? '<p class="lobby-state net-ok">PEER NET ONLINE // COMMANDERS LINK UP ACROSS THE OPEN GRID</p>'
        : P2P_ROOMS.relayUsable()
          ? '<p class="lobby-state net-ok">RELAY NET ONLINE // LINKING THROUGH THE PUBLIC RELAY GRID</p>'
          : '<p class="lobby-state net-bad">NET OFFLINE // BAYS LINK TABS ON THIS MACHINE ONLY — REOPEN THE PLAY MENU TO RETRY THE GRID</p>')
    : '';
  body.innerHTML = `
    <p class="dialog-copy">Enter an open room for up to four commanders. Choose a map, wait for at least one teammate, and let the room lead start when ready.</p>
    ${reconButton}
    ${netLine}
    <div class="bays-grid">${roomList.map((room) => {
      const count = room.commanders.length;
      const full = count >= room.maxPlayers;
      const started = room.started;
      const map = room.map && BATTLE_MAPS[room.map];
      const state = started ? 'started' : count === 0 ? 'empty' : full ? 'full' : 'open';
      const stateText = started ? 'MISSION STARTED' : full ? `FULL // ${count}/${room.maxPlayers} COMMANDERS` : `${count}/${room.maxPlayers} COMMANDERS // WAITING`;
      const buttonText = started ? 'IN PROGRESS' : full ? 'ROOM FULL' : 'ENTER ROOM';
      return `<article class="bay-card is-${state}">
        <header><strong>${escapeHtml(room.name)}</strong><span class="bay-status">${escapeHtml(stateText)}</span></header>
        <p class="bay-map">${map ? `${escapeHtml(map.difficulty)} // ${escapeHtml(map.name)}` : 'MAP: NOT SELECTED'}${room.protocol ? ` // ${escapeHtml(String(room.protocol).toUpperCase())}` : ''}</p>
        <button class="join-button" type="button" data-bay="${escapeHtml(room.id)}" ${full || started ? 'disabled' : ''}>${buttonText}</button>
      </article>`;
    }).join('')}</div>`;
  document.querySelector('#map-recon').addEventListener('click', renderMapSelect);
  body.querySelectorAll('[data-bay]').forEach((button) => button.addEventListener('click', () => {
    playSound();
    sendToService({ type: 'join', room: button.dataset.bay });
  }));
  const invite = new URLSearchParams(location.search).get('room');
  if (invite && roomList.some((room) => room.id === invite && !room.started && room.commanders.length < room.maxPlayers)) {
    sendToService({ type: 'join', room: invite });
  }
  // Keep the bay scan alive while the browser is on screen (peer net only).
  if (LOCAL.down() && P2P_ROOMS.usable() && !currentRoom) P2P_ROOMS.scan();
}

// Combat protocols a room can run — keep in sync with server.js PROTOCOL_CHOICES.
const ROOM_PROTOCOLS = ['easy', 'medium', 'hard', 'insane'];

function isRoomLead(room) {
  return room.commanders.some((commander) => commander.isHost && commander.callsign === myCallsign);
}

function protocolRow(room, roomLead) {
  const active = room.protocol || 'easy';
  if (!roomLead || room.started) {
    return `<div class="proto-row static"><span>// COMBAT PROTOCOL</span><b>${escapeHtml(active.toUpperCase())}</b>${roomLead ? '' : '<small>ROOM LEAD SELECTS</small>'}</div>`;
  }
  return `<div class="proto-row"><span>// COMBAT PROTOCOL</span>${ROOM_PROTOCOLS.map((protocol) =>
    `<button class="proto-chip${protocol === active ? ' on' : ''}" type="button" data-proto="${protocol}">${protocol.toUpperCase()}</button>`).join('')}<small>SET THE WAVE LADDER THE SQUAD RUNS</small></div>`;
}

function renderRoomMapCard(map, room, roomLead) {
  const selected = room.map === map.id;
  return `<article class="room-map-entry">
    <button class="map-card${map.id === 'cbz' ? ' map-cbz' : ''}${mapIsGolden(map.id) ? ' map-golden' : ''}${selected ? ' selected' : ''}" type="button" data-map="${map.id}" aria-pressed="${selected}" ${roomLead && !room.started ? '' : 'disabled'}>
      ${goldenBadge(map.id)}
      <span class="map-diff">${map.difficulty}</span>
      <strong>${escapeHtml(map.name)}</strong>
      <small>${escapeHtml(map.sector)}</small>
      <span class="map-mech">${escapeHtml(map.mechanic)}</span>
      <em>${escapeHtml(map.hint)}</em>
    </button>
    <button class="map-preview-button" type="button" data-recon="${map.id}">OPEN RECON</button>
  </article>`;
}

function renderLobby() {
  if (!currentRoom) return renderBays();
  showingBays = false;
  window.CBZ_ROOM_PLAYERS = currentRoom.commanders.length;
  const room = currentRoom;
  const roomLead = isRoomLead(room);
  document.querySelector('#dialog-kicker').textContent = room.started ? '// MISSION IN PROGRESS' : '// ROOM LINK ESTABLISHED';
  document.querySelector('#dialog-title').textContent = room.name;
  const roster = room.commanders.map((commander) => `
    <li class="${commander.callsign === myCallsign ? 'you' : ''}">
      <span class="slot-tag">${commander.callsign === myCallsign ? 'YOU' : 'ALLY'}</span>
      <strong>${escapeHtml(commander.callsign)}</strong>
      <em class="${commander.isHost ? 'host-tag' : 'crew-tag'}">${commander.isHost ? 'ROOM LEAD' : 'CREW'}</em>
    </li>`).join('');
  const emptySlots = Array.from(
    { length: Math.max(0, room.maxPlayers - room.commanders.length) },
    () => '<li class="slot-empty"><span class="slot-tag">//</span><strong>AWAITING COMMANDER</strong></li>',
  ).join('');
  body.innerHTML = `
    <div class="lobby-grid">
      <section class="roster-panel">
        <h3>SQUAD ROSTER</h3>
        <ul class="roster-list">${roster}${emptySlots}</ul>
        <button class="ghost-button" id="leave-room" type="button">LEAVE ROOM</button>
      </section>
      <section class="config-panel">
        <h3>SELECT MAP // ${roomLead ? 'ROOM LEAD CONTROL' : 'ROOM LEAD SELECTS'}</h3>
        ${roomLead && !room.started ? `<p class="dialog-copy">${LOCAL.down() ? (P2P_ROOMS.usable() ? 'Choose a map and launch when ready. Commanders across the net can drop into this bay while you hold it.' : 'Choose a map and launch when ready. Other commanders can drop into this bay from another tab on this machine.') : 'Choose a map. Your squad waits here until at least one teammate joins and you start.'}</p>` : ''}
        <div class="map-grid">${Object.values(BATTLE_MAPS).map((map) => renderRoomMapCard(map, room, roomLead)).join('')}</div>
        ${protocolRow(room, roomLead)}
        ${roomLead && !room.started ? `<button class="start-button" id="start-room" type="button" ${room.map && (LOCAL.down() || room.commanders.length >= 2) ? '' : 'disabled'}>START WHEN READY <span>→</span></button>` : ''}
        ${room.started ? '<p class="standby-note">MISSION STARTED // DEPLOYMENT LOCKED. FINISH OR EXIT TO REGROUP.</p>' : !roomLead ? '<p class="standby-note">STANDBY // WAITING FOR THE ROOM LEAD TO START.</p>' : ''}
      </section>
    </div>`;
  document.querySelector('#leave-room').addEventListener('click', () => {
    playSound();
    sendToService({ type: 'leave' });
    currentRoom = null;
    window.CBZ_ROOM_PLAYERS = 1;
    setStatus('ROOM SERVICE ONLINE');
    renderBays();
  });
  body.querySelectorAll('[data-map]').forEach((button) => button.addEventListener('click', () => {
    if (!roomLead || room.started) return;
    playSound();
    sendToService({ type: 'config', map: button.dataset.map, protocol: room.protocol || 'easy' });
  }));
  body.querySelectorAll('[data-proto]').forEach((button) => button.addEventListener('click', () => {
    if (!roomLead || room.started) return;
    playSound();
    sendToService({ type: 'config', map: room.map, protocol: button.dataset.proto });
  }));
  const startButton = document.querySelector('#start-room');
  if (startButton) startButton.addEventListener('click', () => {
    playSound();
    sendToService({ type: 'start' });
  });
  body.querySelectorAll('[data-recon]').forEach((button) => button.addEventListener('click', () => {
    openBattlefield(button.dataset.recon);
  }));
}

function handleServiceMessage(message) {
  if (message.type === 'auth-error') {
    showToast(message.message);
    if (dialog.open && !showingBays) renderBays();
    setStatus('ROOM SERVICE // SIGN IN REQUIRED FOR ROOMS');
    return;
  }
  if (message.type === 'linked') {
    myCallsign = message.callsign;
    roomList = message.rooms;
    if (Array.isArray(message.chat)) message.chat.forEach(appendChat);
    setStatus('ROOM SERVICE ONLINE');
    if (dialog.open && showingBays) renderBays();
    return;
  }
  if (message.type === 'chat') {
    appendChat(message);
    return;
  }
  if (message.type === 'coop') {
    if (window.CBZCombat) CBZCombat.coopHandle({ k: message.kind, ...(message.data || {}) });
    return;
  }
  if (message.type === 'rooms') {
    roomList = message.rooms;
    if (dialog.open && showingBays) renderBays();
    return;
  }
  if (message.type === 'error') {
    showToast(message.message);
    if (dialog.open) {
      if (currentRoom) renderLobby();
      else renderBays();
    }
    return;
  }
  if (message.type === 'joined') {
    myCallsign = message.you;
    currentRoom = message.room;
    if (Array.isArray(message.chat)) message.chat.forEach(appendChat);
    setStatus(`ROOM LINKED // ${currentRoom.name}`);
    renderLobby();
    return;
  }
  if (message.type === 'room-update') {
    roomList = roomList.map((room) => room.id === message.room.id ? message.room : room);
    if (currentRoom && currentRoom.id === message.room.id) {
      currentRoom = message.room;
      if (dialog.open && !showingBays) renderLobby();
    } else if (dialog.open && showingBays) {
      renderBays();
    }
    return;
  }
  if (message.type === 'launch') {
    currentRoom = message.room;
    showLaunchSequence(currentRoom.map, currentRoom.protocol);
  }
}

function showLaunchSequence(mapId, protocol = null) {
  clearTimeout(launchTimer);
  const map = BATTLE_MAPS[mapId];
  if (!map) {
    showToast('Room launch referenced an unknown map.');
    if (currentRoom && dialog.open) renderLobby();
    return;
  }
  if (dialog.open) dialog.close();
  roomLaunch = true;
  window.CBZ_ROOM_PLAYERS = currentRoom ? currentRoom.commanders.length : 1;
  // Squad relay: the room lead's sim is authoritative — everyone else mirrors it
  // and ships intents. Server rooms relay over WebSocket; peer-net bays relay
  // over WebRTC to the room lead; LOCAL bays relay over a BroadcastChannel
  // between tabs on this machine.
  if (LOCAL.down()) {
    if (P2P_ROOMS.usable() && P2P_ROOMS.inRoom()) {
      window.CBZCoopBridge = P2P_ROOMS.bridge();
    } else {
      const channel = new BroadcastChannel(`cbz-coop-${currentRoom ? currentRoom.id : 'solo'}`);
      channel.onmessage = (event) => { if (window.CBZCombat) CBZCombat.coopHandle(event.data); };
      window.CBZCoopBridge = { role: LOCAL_ROOMS.role(), send: (msg) => channel.postMessage(msg) };
    }
  } else {
    window.CBZCoopBridge = {
      role: currentRoom && isRoomLead(currentRoom) ? 'host' : 'guest',
      send: (msg) => { const { k, ...data } = msg; sendToService({ type: 'coop', kind: k, data }); },
    };
  }
  const overlay = document.querySelector('#loading-overlay');
  const state = document.querySelector('#loading-state');
  state.textContent = `SQUAD LINKED // LOADING ${map.name}`;
  overlay.hidden = false;
  setStatus('SQUAD LAUNCH // SYNCHRONIZING');
  launchTimer = setTimeout(() => {
    overlay.hidden = true;
    openBattlefield(mapId);
    // Room launch skips the solo vote — the room lead locked the protocol in config.
    if (window.CBZCombat) CBZCombat.startMission(map, true, protocol || 'easy');
  }, 1600);
}

function renderDetails(item) {
  body.innerHTML = `<p class="dialog-copy">${escapeHtml(item.description)}</p><div class="detail-list">${item.stats.map(([label, value]) => `<div class="detail-row"><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></div>`).join('')}</div>`;
}

// Settings & Logs carries one interactive extra: salvage-code redemption.
function renderUpdateLog(item) {
  body.innerHTML = `
    <p class="dialog-copy">${escapeHtml(item.description)}</p>
    <div class="log-list">${UPDATE_LOG.map((entry) => `
      <article class="log-entry">
        <header class="log-head"><span class="log-version">v${escapeHtml(entry.version)}</span><span class="log-tag">// ${escapeHtml(entry.tag)}</span></header>
        <ul class="log-items">${entry.items.map(([kind, text]) => `<li><b class="log-kind log-${escapeHtml(kind.toLowerCase())}">${escapeHtml(kind)}</b>${escapeHtml(text)}</li>`).join('')}</ul>
      </article>`).join('')}</div>`;
}

function renderSettingsPanel(item) {
  body.innerHTML = `<p class="dialog-copy">${escapeHtml(item.description)}</p><div class="detail-list">${item.stats.map(([label, value]) => `<div class="detail-row"><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></div>`).join('')}</div>
    <div class="redeem-block">
      <div class="redeem-head">// INTERCEPTED TRANSMISSIONS</div>
      <p class="redeem-copy">Salvage codes surface on intercepted net traffic. Each code redeems once per commander.</p>
      <div class="redeem-row">
        <input id="redeem-input" maxlength="24" autocomplete="off" spellcheck="false" placeholder="ENTER CODE" aria-label="Salvage code">
        <button id="redeem-button" class="redeem-button" type="button">REDEEM</button>
      </div>
      <div class="redeem-status" id="redeem-status" hidden></div>
    </div>`;
  const input = body.querySelector('#redeem-input');
  const button = body.querySelector('#redeem-button');
  const status = body.querySelector('#redeem-status');
  function paintStatus(text, bad) {
    status.hidden = !text;
    status.textContent = text;
    status.classList.toggle('bad', Boolean(bad));
    status.classList.toggle('good', !bad);
  }
  async function submit() {
    const code = input.value.trim().toUpperCase();
    if (!code) { paintStatus('ENTER A CODE FIRST.', true); input.focus(); return; }
    if (!authToken || !window.CBZShop) { paintStatus('LINK A COMMANDER FIRST — CODES PAY INTO YOUR ACCOUNT.', true); return; }
    button.disabled = true;
    paintStatus('TRANSMITTING…');
    try {
      const granted = await window.CBZShop.redeemCode(code);
      if (!granted) throw new Error('Transfer rejected.');
      paintWallet();
      playSound();
      const parts = [];
      if (granted.nc) parts.push(`+${Number(granted.nc).toLocaleString('en-US')} NC`);
      if (granted.bt) parts.push(`+${granted.bt} BT`);
      if (granted.xp) parts.push(`+${Number(granted.xp).toLocaleString('en-US')} XP`);
      if (granted.levelsGained) parts.push(`LEVEL UP +${granted.levelsGained}`);
      if (granted.admin) parts.push('CLASSIFIED CLEARANCE GRANTED');
      if (granted.firstClear) parts.push('REWARD BLUEPRINTS DECRYPTED');
      const amount = parts.join(' / ') || 'NOTHING?!';
      showToast(`SALVAGE CODE ${code} — ${amount} INJECTED`);
      paintStatus(`CODE ACCEPTED — ${amount}.`, false);
      input.value = '';
    } catch (error) {
      paintStatus(String((error && error.message) || 'REJECTED BY THE GRID.').toUpperCase(), true);
    } finally {
      button.disabled = false;
      input.focus();
    }
  }
  button.addEventListener('click', submit);
  input.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); submit(); } });
  input.focus();
}

// --- Nexus shop + commander wallet ---------------------------------------------
function renderNexusShop() {
  if (!window.CBZShop) return renderDetails(menus.shop);
  dialog.classList.add('shop-open');
  CBZShop.render(body);
}

async function loadProfile() {
  if (!authToken || !window.CBZShop) return;
  try {
    const data = await apiRequest('/api/profile', { token: authToken });
    CBZShop.setProfile(data.profile);
    paintWallet();
  } catch { /* wallet keeps defaults if the profile API is unreachable. */ }
}

function paintWallet() {
  const wallet = document.querySelector('#wallet');
  const shop = window.CBZShop;
  if (!wallet || !shop) return;
  const profile = shop.profile();
  wallet.hidden = false;
  document.querySelector('#wallet-lv').textContent = `LV ${profile.level}`;
  document.querySelector('#wallet-nc').textContent = Number(profile.nc || 0).toLocaleString('en-US');
  document.querySelector('#wallet-bt').textContent = Number(profile.bt || 0).toLocaleString('en-US');
  const levelLine = document.querySelector('#menu-level');
  if (levelLine) levelLine.textContent = `COMMANDER LV ${profile.level}`;
}
window.paintWallet = paintWallet;

// --- Global comms: one shared channel, in the menu or mid-mission -----------------------
const CHAT_KEY = 'cbz-global-chat';
function chatIdentity() {
  return myCallsign || myName || 'GUEST';
}
function chatOnline() {
  return !LOCAL.down() && socket && socket.readyState === WebSocket.OPEN;
}
function appendChat(entry) {
  const log = document.querySelector('#chat-log');
  if (!log || !entry || !entry.text) return;
  const line = document.createElement('div');
  line.className = 'chat-line';
  line.innerHTML = `<b>${escapeHtml(String(entry.from || 'GRID'))}</b><span>${escapeHtml(String(entry.text))}</span>`;
  log.appendChild(line);
  while (log.children.length > 80) log.removeChild(log.firstChild);
  log.scrollTop = log.scrollHeight;
}
function sendChat(text) {
  const clean = String(text || '').trim().slice(0, 280);
  if (!clean) return;
  if (chatOnline()) {
    socket.send(JSON.stringify({ type: 'chat', text: clean }));
    return;
  }
  // Peer net: the bay's room lead relays comms between linked commanders.
  if (LOCAL.down() && P2P_ROOMS.usable() && P2P_ROOMS.inRoom()) {
    P2P_ROOMS.chat(clean);
    return;
  }
  // Static host: relay through localStorage so tabs on this machine stay linked.
  const entry = { from: chatIdentity(), text: clean, ts: Date.now() };
  try {
    const list = JSON.parse(localStorage.getItem(CHAT_KEY) || '[]');
    list.push(entry);
    localStorage.setItem(CHAT_KEY, JSON.stringify(list.slice(-50)));
  } catch { /* storage optional. */ }
  appendChat(entry);
}
window.addEventListener('storage', (event) => {
  if (event.key !== CHAT_KEY || !event.newValue) return;
  try {
    const list = JSON.parse(event.newValue);
    const last = list[list.length - 1];
    if (last) appendChat(last);
  } catch { /* malformed storage — ignore. */ }
});
(function ensureComms() {
  if (document.querySelector('#comms-toggle')) return;
  const toggle = document.createElement('button');
  toggle.id = 'comms-toggle';
  toggle.type = 'button';
  toggle.textContent = 'COMMS';
  const panel = document.createElement('div');
  panel.id = 'comms-panel';
  panel.hidden = true;
  panel.innerHTML = `
    <div class="comms-head"><span>// GLOBAL NET</span><b id="comms-scope">LOCAL RELAY</b></div>
    <div class="chat-log" id="chat-log"></div>
    <form class="chat-form" id="chat-form"><input id="chat-input" maxlength="280" autocomplete="off" placeholder="Transmit to the grid..."><button type="submit">SEND</button></form>`;
  document.body.appendChild(toggle);
  document.body.appendChild(panel);
  toggle.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    if (!panel.hidden) {
      document.querySelector('#comms-scope').textContent = chatOnline() ? 'SERVER RELAY' : (LOCAL.down() && P2P_ROOMS.usable() && P2P_ROOMS.inRoom() ? 'P2P RELAY' : 'LOCAL RELAY');
      const log = document.querySelector('#chat-log');
      if (log) log.scrollTop = log.scrollHeight;
    }
  });
  panel.querySelector('#chat-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const input = panel.querySelector('#chat-input');
    sendChat(input.value);
    input.value = '';
  });
})();

// --- Map recon: battle maps (no waves, no enemies, no game mode) -----------------
const SVG_NS = 'http://www.w3.org/2000/svg';

function hexPoints(x, y, r) {
  return Array.from({ length: 6 }, (_, i) => {
    const angle = Math.PI / 3 * i - Math.PI / 6;
    return `${(x + r * Math.cos(angle)).toFixed(1)},${(y + r * Math.sin(angle)).toFixed(1)}`;
  }).join(' ');
}

function svgNode(name, attributes, text) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  if (text !== undefined) node.textContent = text;
  return node;
}

function buildBoard(map) {
  const board = document.querySelector('#board');
  board.innerHTML = '';
  if (map.theme) board.dataset.theme = map.theme;
  else board.removeAttribute('data-theme');
  const layer = (name) => {
    const group = svgNode('g', { class: `layer-${name}` });
    board.appendChild(group);
    return group;
  };
  // Crimson decor renders beneath every gameplay layer — the Well bleeds first.
  if (map.theme === 'crimson') {
    const decor = layer('decor');
    const defs = svgNode('defs', {});
    const grad = svgNode('radialGradient', { id: 'crim-vign', cx: '50%', cy: '50%', r: '72%' });
    grad.appendChild(svgNode('stop', { offset: '55%', 'stop-color': '#2a0a12', 'stop-opacity': '0' }));
    grad.appendChild(svgNode('stop', { offset: '100%', 'stop-color': '#2a0a12', 'stop-opacity': '.6' }));
    defs.appendChild(grad);
    decor.appendChild(defs);
    decor.appendChild(svgNode('rect', { class: 'crimson-vignette', x: 0, y: 0, width: 1000, height: 600, fill: 'url(#crim-vign)' }));
    // Ritual rings — slow counter-rotating seals around the Well.
    decor.appendChild(svgNode('circle', { class: 'crimson-ritual', cx: map.core.x, cy: map.core.y, r: 52 }));
    decor.appendChild(svgNode('circle', { class: 'crimson-ritual r2', cx: map.core.x, cy: map.core.y, r: 66 }));
    // Breach sigils — the veins' entry points pulse where the dawn pours in.
    for (const [sx, sy] of map.spawns) decor.appendChild(svgNode('polygon', { class: 'crimson-runesigil', points: hexPoints(sx, sy, 27) }));
  }
  const zones = layer('zones');
  const tracks = layer('tracks');
  const gates = layer('gates');
  const spawns = layer('spawns');
  const pads = layer('pads');
  for (const zone of map.zones) {
    zones.appendChild(svgNode('circle', { class: 'zone-circle', cx: zone.x, cy: zone.y, r: zone.r }));
    zones.appendChild(svgNode('text', { class: 'zone-label', x: zone.x, y: zone.y - zone.r + 16, 'text-anchor': 'middle' }, zone.label));
  }
  for (const d of map.paths) {
    tracks.appendChild(svgNode('path', { class: 'track-glow', d }));
    tracks.appendChild(svgNode('path', { class: 'track-road', d }));
    tracks.appendChild(svgNode('path', { class: 'track-line', d }));
  }
  for (const gate of map.gates) {
    gates.appendChild(svgNode('rect', { class: 'gate-node', x: gate.x - 9, y: gate.y - 9, width: 18, height: 18, transform: `rotate(45 ${gate.x} ${gate.y})` }));
    gates.appendChild(svgNode('rect', { class: 'gate-exit', x: gate.toX - 7, y: gate.toY - 7, width: 14, height: 14, transform: `rotate(45 ${gate.toX} ${gate.toY})` }));
    gates.appendChild(svgNode('text', { class: 'gate-label', x: gate.x, y: gate.y - 16, 'text-anchor': 'middle' }, 'PHASE'));
  }
  for (const [sx, sy] of map.spawns) {
    spawns.appendChild(svgNode('polygon', { class: 'spawn-node', points: hexPoints(sx, sy, 16) }));
    spawns.appendChild(svgNode('text', { class: 'spawn-label', x: Math.max(36, Math.min(964, sx)), y: sy + 32, 'text-anchor': 'middle' }, 'BREACH'));
  }
  spawns.appendChild(svgNode('circle', { class: 'core-ring', cx: map.core.x, cy: map.core.y, r: 30 }));
  spawns.appendChild(svgNode('polygon', { class: 'core-node', points: hexPoints(map.core.x, map.core.y, 20) }));
  spawns.appendChild(svgNode('text', { class: 'core-label', x: map.core.x, y: map.core.y + 42, 'text-anchor': 'middle' }, 'CORE'));
  for (const [x, y] of map.pads) {
    pads.appendChild(svgNode('polygon', { class: 'pad', points: hexPoints(x, y, 17), 'data-pad': `${x},${y}` }));
  }
}

function renderMapSelect() {
  playSound();
  document.querySelector('#dialog-kicker').textContent = '// MAP RECON';
  document.querySelector('#dialog-title').textContent = 'SELECT A MAP';
  body.innerHTML = `<p class="dialog-copy">Recon flyovers only — no hostiles, no objectives. Walk each sector's grid before combat systems come online. Beat EASY, MEDIUM, HARD and INSANE on a sector to gild it with a GOLDEN SEAL — first gild pays 2,500 NC + 10 BT, and gilding all five decrypts the PARAGON.</p><div class="map-grid">${Object.values(BATTLE_MAPS).map(mapCard).join('')}</div>`;
  body.querySelectorAll('[data-map]').forEach((card) => card.addEventListener('click', () => openBattlefield(card.dataset.map)));
}

function goldenBadge(mapId) {
  return mapIsGolden(mapId) ? '<span class="map-gold-badge">★ GOLDEN SEAL</span>' : '';
}

function mapCard(map) {
  return `<button class="map-card${map.id === 'cbz' ? ' map-cbz' : ''}${mapIsGolden(map.id) ? ' map-golden' : ''}" type="button" data-map="${map.id}">${goldenBadge(map.id)}<span class="map-diff">${map.difficulty}</span><strong>${escapeHtml(map.name)}</strong><small>${escapeHtml(map.sector)}</small><span class="map-mech">${escapeHtml(map.mechanic)}</span><em>${escapeHtml(map.hint)}</em></button>`;
}

function openBattlefield(mapId) {
  // Accepts a BATTLE_MAPS id OR a map object (the event-exclusive CRIMSON_MAP).
  const map = typeof mapId === 'object' && mapId ? mapId : BATTLE_MAPS[mapId];
  if (!map) return;
  playSound();
  dialog.close();
  // Map recon is always a solo sim — any squad bridge from a previous mission dies here.
  if (!roomLaunch) window.CBZCoopBridge = null;
  document.querySelector('#battle-map-name').textContent = map.name;
  document.querySelector('#battle-map-sector').textContent = map.sector;
  document.querySelector('#battle-map-mech').textContent = map.mechanic;
  buildBoard(map);
  const deploy = document.querySelector('#deploy-mission');
  deploy.hidden = false;
  deploy.onclick = () => window.CBZCombat && CBZCombat.startMission(map);
  document.querySelector('#battlefield').hidden = false;
  setStatus(`MAP RECON // ${map.name}`);
}

function exitBattlefield() {
  if (window.CBZCombat) CBZCombat.abort();
  document.querySelector('#battlefield').hidden = true;
  document.querySelector('#board').innerHTML = '';
  const returnedFromRoom = roomLaunch;
  roomLaunch = false;
  setStatus(currentRoom ? `ROOM LINKED // ${currentRoom.name}` : myName ? 'ACCOUNT LINKED // MENU SYSTEM READY' : 'MENU SYSTEM READY');
  if (returnedFromRoom && currentRoom) {
    renderLobby();
    dialog.showModal();
  }
  playSound();
}

document.querySelectorAll('[data-menu]').forEach((button) => {
  button.addEventListener('mouseenter', () => updatePreview(button.dataset.menu));
  button.addEventListener('focus', () => updatePreview(button.dataset.menu));
  button.addEventListener('click', () => openMenu(button.dataset.menu));
});
document.querySelector('#dialog-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => dialog.classList.remove('shop-open'));
document.querySelector('#exit-battle').addEventListener('click', exitBattlefield);
dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
document.querySelector('#sound-toggle').addEventListener('click', (event) => {
  const button = event.currentTarget;
  const enabled = button.getAttribute('aria-pressed') === 'true';
  soundEnabled = !enabled;
  button.setAttribute('aria-pressed', String(soundEnabled));
  button.textContent = `SFX: ${soundEnabled ? 'ON' : 'OFF'}`;
  if (soundEnabled) playSound();
});
document.querySelector('#tab-login').addEventListener('click', () => setAuthMode('login'));
document.querySelector('#tab-register').addEventListener('click', () => setAuthMode('register'));
document.querySelector('#auth-form').addEventListener('submit', submitAuth);
document.querySelector('#sign-out').addEventListener('click', signOut);

const roomFromUrl = new URLSearchParams(location.search).get('room');
if (roomFromUrl) openMenu('play');

setAuthMode('login');
paintNetBadge();
restoreSession();

// --- Bridge to the classic scripts ------------------------------------------------
// app.js is an ES module now, so its names are no longer global. combat.js (classic)
// and src/shop/ui.js still read these by bare name. shortcut: window globals, shrink
// this list as combat.js is split into modules.
Object.assign(window, { BATTLE_MAPS, LOCAL, apiRequest, body, escapeHtml, exitBattlefield, hexPoints, loadProfile, menus, openBattlefield, openMenu, playSound, sendToService, setStatus, showToast, svgNode });
Object.defineProperties(window, { // live bindings: these are reassigned inside app.js
  myName: { get: () => myName, configurable: true },
  currentRoom: { get: () => currentRoom, configurable: true },
  cbzToken: { get: () => authToken, configurable: true }, // for src/rooms/view.js
});
