// Manual end-to-end check (not part of npm test): drives src/rooms/client.js and src/rooms/map.js against a real room host.
//   node scripts/rooms-e2e.mjs <host-dir>   (host-dir has node_modules/ws and src/index.ts; its `game` link points at this repo)
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { createRoomClient } from '../src/rooms/client.js';
import { createMirror } from '../src/rooms/map.js';
import { TOWERS } from '../src/shop/data.js';
import { ENEMY_TYPES } from '../src/combat/data.js';

const hostDir = resolve(process.argv[2] || '.');
const WebSocket = createRequire(join(hostDir, 'package.json'))('ws');
const port = await new Promise((res) => { const s = createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const dir = mkdtempSync(join(tmpdir(), 'cbz-e2e-'));
const srv = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], { cwd: hostDir, env: { ...process.env, PORT: String(port), DB_PATH: join(dir, 'e2e.db') }, stdio: ['ignore', 'ignore', 'inherit'] });
let fail = 0;
const check = (name, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + name); if (!ok) fail++; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) break; } catch { /* not up */ } await wait(100); }
  const reg = await (await fetch(`http://127.0.0.1:${port}/api/register`, { method: 'POST', body: JSON.stringify({ name: 'e2e_cmdr', email: 'e2e@test.test', passcode: 'e2e-pass-1234' }) })).json();
  const c = createRoomClient({ url: `ws://127.0.0.1:${port}/rooms/ws`, token: reg.token, WebSocketCtor: WebSocket });
  const got = { room: [], snap: [], ev: [], err: [] };
  for (const t of Object.keys(got)) c.on(t, (m) => got[t].push(m));
  let hello = false; c.on('hello', () => { hello = true; });
  c.connect();
  for (let i = 0; i < 50 && !hello; i++) await wait(100);
  check('authenticated (hello)', hello);
  c.create('easy', 'easy'); await wait(300);
  check('room created, I am lead', got.room.at(-1)?.owner === 'e2e_cmdr' && got.room.at(-1).phase === 'lobby');
  c.start(); await wait(300);
  c.vote('easy'); await wait(1500);
  check('mission running', got.snap.at(-1)?.ph === 'running');
  const state = { enemies: [], towers: [], projectiles: [] };
  const mirror = createMirror(TOWERS, ENEMY_TYPES);
  c.send({ t: 'place', id: 'sentinel', x: 140, y: 90 }); // may be refused by the pad/path rules: we only need a legal spot, so try a few
  for (const [x, y] of [[300, 300], [500, 200], [200, 450], [700, 400]]) c.send({ t: 'place', id: 'sentinel', x, y });
  await wait(6000);
  mirror.apply(state, got.snap.at(-1));
  check('snapshots flowing (~12 Hz)', got.snap.length > 40);
  check('snapshot mapped: wave, cash, hp', state.waveIndex >= 0 && state.baseHp > 0 && typeof state.cash === 'number');
  check('my tower appears in mapped state', state.towers.length >= 1 && state.towers[0].entry.id === 'sentinel');
  check('enemies appear in mapped state', state.enemies.length >= 1 && state.enemies.every((e) => e.t && Number.isFinite(e.fx)));
  check('events delivered', got.ev.length > 0);
  console.log('towers', state.towers.length, 'enemies', state.enemies.length, 'errs', JSON.stringify(got.err.map((e) => e.error)));
  c.close();
} catch (e) { console.error(e); fail++; }
srv.kill(); rmSync(dir, { recursive: true, force: true });
process.exit(fail ? 1 : 0);
