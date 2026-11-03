// Compact end-to-end smoke test: accounts (name + email) + rooms + static files + map recon assets.
// Usage: node scripts/smoke-test.js  (expects server on PORT, default 3111)
const BASE = `http://127.0.0.1:${process.env.PORT || 3111}`;
const { WebSocket } = require('ws');

let passed = 0;
let failed = 0;
function check(label, condition, detail = '') {
  if (condition) { passed += 1; console.log(`  PASS  ${label}`); }
  else { failed += 1; console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`); }
}

async function api(path, payload) {
  const response = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

function wsConnect() {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${process.env.PORT || 3111}/rooms`);
    const inbox = [];
    const waiters = [];
    socket.on('message', (raw) => {
      const message = JSON.parse(raw.toString());
      const index = waiters.findIndex((waiter) => waiter.match(message));
      if (index >= 0) {
        const [waiter] = waiters.splice(index, 1);
        clearTimeout(waiter.timer);
        waiter.resolve(message);
        return;
      }
      inbox.push(message);
    });
    socket.on('open', () => resolve({
      socket,
      send: (message) => socket.send(JSON.stringify(message)),
      close: () => socket.close(),
      wait: (match, ms = 2500, label = 'message') => new Promise((resolveWait, rejectWait) => {
        const found = inbox.findIndex(match);
        if (found >= 0) return resolveWait(inbox.splice(found, 1)[0]);
        const timer = setTimeout(() => rejectWait(new Error(`timeout waiting for ${label}`)), ms);
        waiters.push({ match, resolve: resolveWait, timer });
      }),
    }));
    socket.on('error', reject);
  });
}

(async () => {
  // --- Static files ---
  const home = await fetch(`${BASE}/`).then((r) => r.text());
  check('GET / serves game shell', home.includes('CORE BREACH') && home.includes('auth-overlay'));
  // Root-absolute links 404 on GitHub Pages (site lives under /Core-Breach-Zero/).
  check('no root-absolute links in shell (Pages 404 guard)', !/(href|src)="\//.test(home), (home.match(/(href|src)="\/[^"]*"/g) || []).join(' '));
  const appJs = await fetch(`${BASE}/app.js`);
  check('GET /app.js served as JS', appJs.ok && appJs.headers.get('content-type').includes('javascript'));
  const mapsJs = await fetch(`${BASE}/src/app/maps.js`);
  check('GET /src/app/maps.js has 5 map recon maps', (await mapsJs.text()).match(/\bid: '(easy|medium|hard|insane|cbz)'/g)?.length === 5);
  check('GET /styles.css served', (await fetch(`${BASE}/styles.css`)).ok);
  const health = await fetch(`${BASE}/health`).then((r) => r.json());
  check('GET /health online', health.status === 'online');

  // --- Accounts: register ---
  const reg = await api('/api/register', { name: 'SMOKE1', email: 'Smoke@Mail.com', passcode: 'corebreach' });
  check('register returns token + name + email', reg.status === 200 && reg.body.ok && !!reg.body.token && reg.body.name === 'SMOKE1' && reg.body.email === 'smoke@mail.com');
  check('register normalizes email to lowercase', reg.body.email === 'smoke@mail.com');
  check('register duplicate name rejected', (await api('/api/register', { name: 'SMOKE1', email: 'other@mail.com', passcode: 'corebreach' })).status === 400);
  check('register duplicate email rejected', (await api('/api/register', { name: 'SMOKE2', email: 'smoke@mail.com', passcode: 'corebreach' })).status === 400);
  check('register bad email rejected', (await api('/api/register', { name: 'SMOKE3', email: 'not-an-email', passcode: 'corebreach' })).status === 400);
  check('register short passcode rejected', (await api('/api/register', { name: 'SMOKE3', email: 's3@mail.com', passcode: 'abc' })).status === 400);
  check('register bad name rejected', (await api('/api/register', { name: 'no', email: 's4@mail.com', passcode: 'corebreach' })).status === 400);

  // --- Accounts: login (by name, by email, wrong passcode) ---
  const loginName = await api('/api/login', { identity: 'SMOKE1', passcode: 'corebreach' });
  check('login by name works', loginName.status === 200 && loginName.body.ok && loginName.body.name === 'SMOKE1');
  const loginEmail = await api('/api/login', { identity: 'SMOKE@MAIL.COM', passcode: 'corebreach' });
  check('login by email (case-insensitive) works', loginEmail.status === 200 && loginEmail.body.name === 'SMOKE1');
  check('login wrong passcode rejected', (await api('/api/login', { identity: 'SMOKE1', passcode: 'wrong-code' })).status === 401);
  check('login unknown identity rejected', (await api('/api/login', { identity: 'GHOST9', passcode: 'corebreach' })).status === 401);

  // --- Accounts: session ---
  const session = await api('/api/session', { token: reg.body.token });
  check('session token resolves commander', session.status === 200 && session.body.name === 'SMOKE1' && session.body.email === 'smoke@mail.com');
  check('session bad token rejected', (await api('/api/session', { token: 'deadbeef' })).status === 401);

  // --- Deployment bays over WebSocket (fixed 4-bay room service) ---
  const regAlly = await api('/api/register', { name: 'SMOKE3', email: 's3@mail.com', passcode: 'corebreach' });
  check('ally account registered for bay test', regAlly.status === 200 && !!regAlly.body.token);

  const host = await wsConnect();
  host.send({ type: 'authenticate', token: reg.body.token });
  const linked = await host.wait((m) => m.type === 'linked', 2500, 'linked(host)');
  check('authenticate returns linked + 4 fixed bays', Array.isArray(linked.rooms) && linked.rooms.length === 4 && linked.callsign === 'SMOKE1');

  const stranger = await wsConnect();
  stranger.send({ type: 'rooms' });
  check('unauthenticated bays request rejected', (await stranger.wait((m) => m.type === 'auth-error', 2500, 'auth-error')).type === 'auth-error');

  host.send({ type: 'join', room: 'room-01' });
  const joined = await host.wait((m) => m.type === 'joined', 2500, 'joined(host)');
  check('commander enters bay-01 as lead', joined.room.id === 'room-01' && joined.room.commanders[0].isHost === true);

  const guest = await wsConnect();
  guest.send({ type: 'authenticate', token: regAlly.body.token });
  await guest.wait((m) => m.type === 'linked', 2500, 'linked(guest)');
  guest.send({ type: 'join', room: 'room-01' });
  const joinedAlly = await guest.wait((m) => m.type === 'joined', 2500, 'joined(guest)');
  check('ally joins the same bay', joinedAlly.room.commanders.length === 2);
  const rosterUpdate = await host.wait((m) => m.type === 'room-update' && m.room.commanders.length === 2, 2500, 'roster growth');
  check('lead sees roster grow to 2', rosterUpdate.room.commanders.some((commander) => commander.callsign === 'SMOKE3'));

  guest.send({ type: 'config', map: 'easy' });
  const denied = await guest.wait((m) => m.type === 'error', 2500, 'config denied');
  check('non-lead map config rejected', /room lead/i.test(denied.message));
  host.send({ type: 'config', map: 'medium' });
  const mapPick = await host.wait((m) => m.type === 'room-update' && m.room.map === 'medium', 2500, 'map config');
  check('lead picks the map', mapPick.room.map === 'medium');

  host.send({ type: 'start' });
  const launch = await host.wait((m) => m.type === 'launch', 2500, 'launch(host)');
  const allyLaunch = await guest.wait((m) => m.type === 'launch', 2500, 'launch(guest)');
  check('lead start broadcasts launch to both', launch.room.started === true && allyLaunch.room.started === true && allyLaunch.room.map === 'medium');

  guest.send({ type: 'end' });
  const ended = await host.wait((m) => m.type === 'room-update' && m.room.started === false, 2500, 'end unlock');
  check('mission end unlocks the bay', ended.room.started === false);

  host.close();
  const leaveUpdate = await guest.wait((m) => m.type === 'room-update' && m.room.commanders.length === 1, 2500, 'lead left');
  check('roster shrinks when lead disconnects', leaveUpdate.room.commanders.length === 1);
  guest.close();
  stranger.close();

  // ASSETS AND CACHING: mime types, cache headers, ETag 304, gzip.
  const html = await fetch(`${BASE}/`, { headers: { 'accept-encoding': 'gzip' } });
  check('html revalidates (no-cache) and is gzipped', html.headers.get('cache-control') === 'no-cache' && html.headers.get('content-encoding') === 'gzip');
  const appjs = await fetch(`${BASE}/app.js?v=1`);
  check('?v= script is immutable and has an ETag', /immutable/.test(appjs.headers.get('cache-control') || '') && !!appjs.headers.get('etag'));
  const again = await fetch(`${BASE}/app.js?v=1`, { headers: { 'if-none-match': appjs.headers.get('etag') } });
  check('matching If-None-Match gives 304', again.status === 304);
  const art = await fetch(`${BASE}/assets/towers/sentinel.webp`);
  check('tower art is image/webp with a day of cache', art.headers.get('content-type') === 'image/webp' && /max-age=86400/.test(art.headers.get('cache-control') || ''));

  console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((error) => { console.error('SMOKE TEST CRASH:', error); process.exit(1); });
