// Admin key + login test. Usage: node scripts/admin-test.js enabled|disabled  (server on PORT, default 3111)
// "enabled": server started with ADMIN_KEY_CODE (same value in this process); "disabled": started without it.
const BASE = `http://127.0.0.1:${process.env.PORT || 3111}`;
const mode = process.argv[2] || 'enabled';
const KEY = process.env.ADMIN_KEY_CODE || '';
let fail = 0;
const check = (name, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) fail += 1; };
const api = async (path, payload) => {
  const r = await fetch(`${BASE}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  return { status: r.status, data: await r.json().catch(() => ({})) };
};
(async () => {
  const name = `adm${Date.now().toString(36)}${mode[0]}`.slice(0, 16);
  const reg = await api('/api/register', { name, email: `${name}@example.com`, passcode: 'hunter22' });
  check('register', reg.data.ok);
  const login = await api('/api/login', { identity: name, passcode: 'hunter22' });
  check('login with right passcode', login.data.ok);
  check('login with wrong passcode refused', (await api('/api/login', { identity: name, passcode: 'nope' })).status === 401);
  const token = login.data.token;
  const wrong = await api('/api/redeem', { token, code: 'NOTTHECODE1' });
  check('wrong code is 404', wrong.status === 404);
  const old = await api('/api/redeem', { token, code: ['ADMINLOG', '101011'].join('') });
  check('old hardcoded code is dead', old.status === 404);
  if (mode === 'enabled') {
    const r = await api('/api/redeem', { token, code: KEY });
    check('env admin code grants admin', r.data.ok && r.data.profile.admin === true);
  } else {
    check('no env var: empty code refused', (await api('/api/redeem', { token, code: '' })).status === 404);
  }
  for (const f of ['/accounts.json', '/.env', '/.git/config']) {
    check(`${f} is not served`, (await fetch(`${BASE}${f}`)).status !== 200);
  }
  process.exit(fail ? 1 : 0);
})();
