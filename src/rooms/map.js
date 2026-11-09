// Snapshot -> plain-data entities for the existing combat renderers. No DOM, no sim calls.
// The server sends full state at 12 Hz; entities are kept by id so the SVG views stay stable between frames,
// and positions ease toward the latest snapshot.

const FLAG_FRIENDLY = 1;
const FLAG_FLYING = 2;

// towers: catalog array ({id, ...}); types: ENEMY_TYPES.
export function createMirror(towers, types) {
  const entries = new Map(towers.map((t) => [t.id, t]));
  const enemies = new Map();
  const towerMap = new Map();
  const shots = new Map();

  // Applies a `snap` frame to `state` (the sim's state object, used only as a data holder).
  // Returns the towers whose level changed or that were removed, so the view can refresh panels.
  function apply(state, snap) {
    state.mode = snap.m || state.mode;
    state.waveIndex = (snap.w || 0) - 1;
    state.cash = snap.cash || 0;
    state.baseHp = snap.hp == null ? state.baseHp : snap.hp;
    state.kills = snap.kl || 0;
    state.countdown = snap.cd || 0;
    state.voteLeft = snap.vote || 0;
    const changed = [];
    const removed = [];

    const seenE = new Set();
    for (const [nid, key, x, y, hp, maxHp, shield, flags] of snap.e || []) {
      seenE.add(nid);
      let e = enemies.get(nid);
      if (!e) {
        const t = types[key] || { name: key, tag: '', size: 10, hp: maxHp };
        e = { nid, key, t, alive: true, friendly: Boolean(flags & FLAG_FRIENDLY), flight: Boolean(flags & FLAG_FLYING), maxShield: t.shield || 0, fx: x, fy: y, gx: x, gy: y, angle: 0, stun: 0 };
        enemies.set(nid, e);
      }
      const dx = x - e.gx;
      const dy = y - e.gy;
      if (dx * dx + dy * dy > 0.5) e.angle = (Math.atan2(dy, dx) * 180) / Math.PI;
      e.gx = x; e.gy = y; e.hp = hp; e.maxHp = maxHp || 1; e.shield = shield;
    }
    for (const nid of enemies.keys()) if (!seenE.has(nid)) enemies.delete(nid);
    state.enemies = [...enemies.values()];

    const seenT = new Set();
    for (const [uid, id, x, y, lvl, owner, aim] of snap.tw || []) {
      const entry = entries.get(id);
      if (!entry) continue;
      seenT.add(uid);
      let t = towerMap.get(uid);
      if (!t) {
        t = { uid, id, entry, x, y, lvl, owner, aim, cd: 0, boost: 1, onPad: false };
        towerMap.set(uid, t);
      } else if (t.lvl !== lvl) { t.lvl = lvl; changed.push(t); }
      t.owner = owner; t.aim = aim;
    }
    for (const [uid, t] of towerMap) if (!seenT.has(uid)) { towerMap.delete(uid); removed.push(t); }
    state.towers = [...towerMap.values()];

    const seenP = new Set();
    for (const [id, kind, x, y] of snap.pr || []) {
      seenP.add(id);
      let p = shots.get(id);
      if (!p) { p = { id, kind, x, y, dead: false }; shots.set(id, p); }
      p.tx = x; p.ty = y;
    }
    for (const id of shots.keys()) if (!seenP.has(id)) shots.delete(id);
    state.projectiles = [...shots.values()];
    return { changed, removed };
  }

  // Ease positions toward the last snapshot (called every animation frame).
  function smooth(state, dt) {
    const k = Math.min(1, dt * 14);
    for (const e of state.enemies) { e.fx += (e.gx - e.fx) * k; e.fy += (e.gy - e.fy) * k; }
    for (const p of state.projectiles) { p.x += (p.tx - p.x) * k; p.y += (p.ty - p.y) * k; }
  }

  function reset() { enemies.clear(); towerMap.clear(); shots.clear(); }
  return { apply, smooth, reset };
}

// A forwarded `ev` entry [type, ...args] -> arguments for emit(). The server replaces object args with a tower
// uid; purge and scream take the tower, so look it up. Returns null when the tower is gone.
const TOWER_EVENTS = new Set(['purge', 'scream']);
export function eventArgs(state, ev) {
  if (!Array.isArray(ev) || typeof ev[0] !== 'string') return null;
  const [type, ...args] = ev;
  if (TOWER_EVENTS.has(type)) {
    const tower = state.towers.find((t) => t.uid === args[0]);
    if (!tower) return null;
    args[0] = tower;
  }
  return [type, ...args];
}
