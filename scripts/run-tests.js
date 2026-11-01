// npm test: runs every scripts/*-test.js. Starts its own server on a throwaway accounts file
// (never touches your real accounts.json) with a random test admin code.
const { spawn, spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '..');
const PORT = String(process.env.PORT || 3111);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cbz-test-'));
const env = { ...process.env, PORT, ACCOUNTS_FILE: path.join(tmp, 'accounts.json'), ADMIN_KEY_CODE: `T${crypto.randomBytes(8).toString('hex')}` };
const failed = [];
let server = null;

const run = (args, e = env) => {
  console.log(`\n=== node ${args.join(' ')}`);
  const r = spawnSync(process.execPath, args, { cwd: root, env: e, stdio: 'inherit' });
  if (r.status !== 0) failed.push(args.join(' '));
};
const wait = (ms) => new Promise((res) => setTimeout(res, ms));
async function start(e = env) {
  server = spawn(process.execPath, ['server.js'], { cwd: root, env: e, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`http://127.0.0.1:${e.PORT}/health`)).ok) return; } catch {}
    await wait(200);
  }
  throw new Error('server did not start');
}
const stop = async () => { server.kill(); await wait(300); };

(async () => {
  for (const t of ['towers', 'crimson', 'hard']) run([`scripts/${t}-test.js`]);
  // Public MQTT brokers flake occasionally — one retry keeps the gate honest
  // about OUR code instead of failing CI over third-party network noise.
  run(['scripts/relay-test.js']); // needs internet (public MQTT brokers)
  if (failed.includes('scripts/relay-test.js')) {
    failed.splice(failed.indexOf('scripts/relay-test.js'), 1);
    console.log('\n=== retrying scripts/relay-test.js (public broker flake)');
    run(['scripts/relay-test.js']);
  }
  await start();
  for (const t of ['smoke', 'room']) run([`scripts/${t}-test.js`]);
  run(['scripts/admin-test.js', 'enabled']);
  run(['scripts/shop-test.js', '1']);
  run(['scripts/loadout-test.js', '1']);
  await stop(); // restart: phase 2 checks that data survived
  await start();
  run(['scripts/shop-test.js', '2']);
  run(['scripts/loadout-test.js', '2']);
  await stop();
  const noAdmin = { ...env, PORT: String(Number(PORT) + 1), ADMIN_KEY_CODE: '' };
  await start(noAdmin);
  run(['scripts/admin-test.js', 'disabled'], noAdmin);
  await stop();
})().catch((e) => { console.error(e); failed.push('runner'); }).finally(() => {
  if (server) server.kill();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(failed.length ? `\nFAILED: ${failed.join(', ')}` : '\nALL TEST FILES PASSED');
  process.exit(failed.length ? 1 : 0);
});
