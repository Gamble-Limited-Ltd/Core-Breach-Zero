// Hostile requests must get an error response, never crash the server. Usage: node scripts/server-hardening-test.js (server on PORT, default 3111)
const net = require('node:net');
const PORT = Number(process.env.PORT || 3111);
let failed = 0;
const raw = (s) => new Promise((resolve) => {
  const c = net.connect(PORT, '127.0.0.1', () => c.write(s));
  let d = '';
  c.on('data', (x) => { d += x; });
  c.on('error', (e) => resolve(`ERR ${e.code}`));
  c.on('close', () => resolve(d.split('\r\n')[0] || 'closed'));
  setTimeout(() => c.destroy(), 1500);
});
const alive = async () => (await raw('GET /health HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n')).includes('200');
const post = (path, body) => `POST ${path} HTTP/1.1\r\nHost: x\r\nContent-Length: ${body.length}\r\nConnection: close\r\n\r\n${body}`;
(async () => {
  const cases = {
    'bad percent escape': 'GET /%E0%A4%A HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n',
    'null byte path': 'GET /%00 HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n',
    'malformed Host header': 'GET /health HTTP/1.1\r\nHost: a b\r\nConnection: close\r\n\r\n',
    'dotfile': 'GET /.git/config HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n',
    'accounts file': 'GET /accounts.json HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n',
    'traversal': 'GET /..%2f..%2fetc/passwd HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n',
    '__proto__ login': post('/api/login', '{"name":"__proto__","passcode":"abcd"}'),
    'constructor login': post('/api/login', '{"name":"constructor","passcode":"abcd"}'),
    'array body': post('/api/login', '[1,2]'),
    'proto token': post('/api/profile', '{"token":"__proto__"}'),
  };
  for (const [name, req] of Object.entries(cases)) {
    const line = await raw(req);
    const ok = (await alive()) && !line.startsWith('ERR') && !/ 200 /.test(/dotfile|accounts|traversal/.test(name) ? line : '');
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name} (${line})`);
    if (!ok) failed += 1;
    if (!(await alive())) { console.log('server is down, stopping'); break; }
  }
  // WebSocket frames that parse to non-objects must not throw inside the message handler.
  const { WebSocket } = require('ws');
  for (const frame of ['null', '5', '"x"', '[]']) {
    await new Promise((res) => { const w = new WebSocket(`ws://127.0.0.1:${PORT}/rooms`); w.on('open', () => w.send(frame)); w.on('error', res); w.on('close', res); setTimeout(res, 600); });
    const ok = await alive();
    console.log(`${ok ? 'PASS' : 'FAIL'} ws frame ${frame}`);
    if (!ok) { failed += 1; break; }
  }
  process.exit(failed ? 1 : 0);
})();
