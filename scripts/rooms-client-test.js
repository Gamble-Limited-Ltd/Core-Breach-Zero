// Online rooms client (src/rooms/client.js) against a fake WebSocket, and the snapshot mapper (src/rooms/map.js). No browser, no server.
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const imp = (p) => import(pathToFileURL(path.join(__dirname, '..', p)).href);
let pass = 0; let fail = 0;
const check = (name, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (ok) pass += 1; else fail += 1; };

(async () => {
  const { createRoomClient, roomsUrl, intents } = await imp('src/rooms/client.js');
  const { createMirror, eventArgs } = await imp('src/rooms/map.js');
  const { TOWERS } = await imp('src/shop/data.js');
  const { ENEMY_TYPES } = await imp('src/combat/data.js');

  check('url: http -> ws, relative to the page path', roomsUrl('http://h.test:8/a/b.html') === 'ws://h.test:8/a/rooms/ws');
  check('url: https -> wss', roomsUrl('https://h.test/') === 'wss://h.test/rooms/ws');

  const made = [];
  class FakeWS {
    constructor(url) { this.url = url; this.sent = []; this.readyState = 0; made.push(this); }
    send(d) { this.sent.push(JSON.parse(d)); }
    close() { this.readyState = 3; if (this.onclose) this.onclose({ code: 1000 }); }
    open() { this.readyState = 1; this.onopen(); }
    recv(m) { this.onmessage({ data: typeof m === 'string' ? m : JSON.stringify(m) }); }
    drop(code = 1006) { this.readyState = 3; this.onclose({ code }); }
  }
  const timers = [];
  let clock = 0;
  const c = createRoomClient({ url: 'ws://x/rooms/ws', token: 'tok', WebSocketCtor: FakeWS, now: () => clock, setTimer: (fn, ms) => { const t = { fn, ms }; timers.push(t); return t; }, clearTimer: (t) => { const i = timers.indexOf(t); if (i >= 0) timers.splice(i, 1); } });
  const seen = [];
  for (const t of ['open', 'reconnecting', 'reconnected', 'gone', 'room', 'snap', 'ev', 'end', 'err', 'pong']) c.on(t, (m) => seen.push(t));
  c.connect();
  const ws = made[0];
  check('nothing sent before open; send refused before auth', ws.sent.length === 0 && c.send({ t: 'ping' }) === false);
  ws.open();
  check('first frame is auth with the token', ws.sent.length === 1 && ws.sent[0].t === 'auth' && ws.sent[0].token === 'tok');
  check('intents dropped until hello', c.join('abcd') === false);
  ws.recv({ t: 'hello', name: 'n' });
  check('hello -> open event, authed', seen.includes('open') && c.isOpen());
  c.join(' abcd ');
  c.create('easy', 'hard');
  c.send(intents.place('sentinel', 10, 20));
  c.send(intents.upgrade(7)); c.send(intents.sell(7)); c.send(intents.cast(7, 'rally')); c.send(intents.nuke(5, 6));
  check('join uppercases and trims the code', ws.sent[1].t === 'join' && ws.sent[1].code === 'ABCD');
  check('create frame', JSON.stringify(ws.sent[2]) === '{"t":"create","map":"easy","mode":"hard"}');
  check('intent encoding', JSON.stringify(ws.sent.slice(3)) === JSON.stringify([{ t: 'place', id: 'sentinel', x: 10, y: 20 }, { t: 'upgrade', uid: 7 }, { t: 'sell', uid: 7 }, { t: 'cast', uid: 7, kind: 'rally' }, { t: 'nuke', x: 5, y: 6 }]));
  ws.recv('not json'); ws.recv({ nope: 1 }); ws.recv({ t: 'room', code: 'A' }); ws.recv({ t: 'snap' }); ws.recv({ t: 'ev', ev: [] }); ws.recv({ t: 'end' }); ws.recv({ t: 'err', error: 'x' });
  check('frames parsed and routed, garbage ignored', ['room', 'snap', 'ev', 'end', 'err'].every((t) => seen.includes(t)) && !seen.includes('gone'));
  const ping = timers.find((t) => t.ms === 20000);
  ping.fn();
  check('ping timer sends ping', ws.sent[ws.sent.length - 1].t === 'ping');

  ws.drop();
  check('drop -> reconnecting, retry scheduled', seen.includes('reconnecting') && timers.some((t) => t.ms === 1500));
  timers.find((t) => t.ms === 1500).fn();
  const ws2 = made[1];
  ws2.open();
  check('reconnect re-sends auth with the same token', made.length === 2 && ws2.sent[0].t === 'auth' && ws2.sent[0].token === 'tok');
  ws2.recv({ t: 'hello', name: 'n' });
  check('hello after drop -> reconnected', seen.includes('reconnected'));

  timers.length = 0; ws2.drop(); clock += 61000;
  const rt = timers.find((t) => t.ms === 1500); timers.splice(timers.indexOf(rt), 1); rt.fn(); made[2].drop();
  check('gives up after the reconnect window', seen.includes('gone') && !timers.some((t) => t.ms === 1500));

  const c2 = createRoomClient({ url: 'u', token: 't', WebSocketCtor: FakeWS, now: () => clock, setTimer: () => 0, clearTimer: () => {} });
  const seen2 = []; c2.on('gone', () => seen2.push('gone')); c2.connect(); made[made.length - 1].drop(1008);
  check('1008 (refused) is final, no retry', seen2.length === 1);

  // --- mapper ---
  const mirror = createMirror(TOWERS, ENEMY_TYPES);
  const state = { enemies: [], towers: [], projectiles: [] };
  const tid = TOWERS[0].id; const ekey = Object.keys(ENEMY_TYPES)[0];
  const snap = (extra) => ({ t: 'snap', ph: 'running', m: 'waves', w: 3, W: 20, cash: 450, hp: 90, kl: 12, cd: 0, vote: 0, e: [[1, ekey, 100, 50, 8, 10, 0, 0]], tw: [[5, tid, 200, 100, 0, 0, 30]], pr: [[9, 'shell', 10, 10]], ...extra });
  mirror.apply(state, snap());
  check('hud fields', state.mode === 'waves' && state.waveIndex === 2 && state.cash === 450 && state.baseHp === 90 && state.kills === 12);
  check('enemy entity', state.enemies.length === 1 && state.enemies[0].t === ENEMY_TYPES[ekey] && state.enemies[0].fx === 100 && state.enemies[0].hp === 8 && state.enemies[0].alive);
  check('tower entity has catalog entry', state.towers[0].uid === 5 && state.towers[0].entry.id === tid && state.towers[0].aim === 30);
  const e0 = state.enemies[0];
  const r = mirror.apply(state, snap({ e: [[1, ekey, 110, 50, 7, 10, 0, 2]], tw: [[5, tid, 200, 100, 1, 0, 40]] }));
  check('same enemy object kept, target moves, heading set', state.enemies[0] === e0 && e0.gx === 110 && e0.fx === 100 && Math.abs(e0.angle) < 1e-9);
  check('level change reported', r.changed.length === 1 && state.towers[0].lvl === 1);
  mirror.smooth(state, 1 / 60);
  check('smoothing eases toward target', e0.fx > 100 && e0.fx < 110);
  const r2 = mirror.apply(state, snap({ e: [], tw: [], pr: [] }));
  check('gone entities removed', state.enemies.length === 0 && state.towers.length === 0 && state.projectiles.length === 0 && r2.removed.length === 1);
  mirror.apply(state, snap({ tw: [[6, 'no-such-tower', 1, 1, 0, 0, 0]] }));
  check('unknown tower id skipped', state.towers.length === 0);
  mirror.apply(state, snap());
  check('purge event resolves tower uid', eventArgs(state, ['purge', 5])[1] === state.towers[0] && eventArgs(state, ['scream', 99]) === null);
  check('plain event passes through', JSON.stringify(eventArgs(state, ['ring', 1, 2, 'fx'])) === '["ring",1,2,"fx"]');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
