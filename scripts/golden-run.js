// Golden determinism harness for the combat sim (dev tool, not part of `npm test`: needs Playwright).
// Seeds Math.random, fakes rAF + performance.now, plays a fixed solo mission frame by frame and compares
// checkpoints with scripts/golden/solo-easy.json. Run before and after any sim refactor.
//   PORT=3777 node scripts/golden-run.js [--update]
// Env: PLAYWRIGHT_PATH (module dir, default ~/gll-id/node_modules/playwright), CHROME (executablePath).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || path.join(os.homedir(), 'gll-id/node_modules/playwright'));
const TOWER = (process.argv.find((a) => a.startsWith('--tower=')) || '').slice(8); // e.g. --tower=lazermortar (reward blueprint)
const FILE = path.join(__dirname, TOWER ? `golden/solo-easy-${TOWER}.json` : 'golden/solo-easy.json');
const BASE = `http://127.0.0.1:${process.env.PORT || 3777}`;
const FRAMES = 3600; // 60 s of sim at 60 fps
const EVERY = 300;

(async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.addInitScript(() => {
    let s = 123456789;
    Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    let now = 1000; let queue = [];
    performance.now = () => now;
    window.requestAnimationFrame = (cb) => { queue.push(cb); return queue.length; };
    window.cancelAnimationFrame = () => {};
    window.__step = (n) => { for (let i = 0; i < n; i += 1) { now += 1000 / 60; const q = queue; queue = []; q.forEach((cb) => cb(now)); } };
  });
  await page.goto(`${BASE}/?cash=2000${process.env.GOLDEN_QUERY || ""}`); // GOLDEN_QUERY=&cbzwave=12 explores other waves (view check only; do not --update)
  await page.waitForFunction(() => window.CBZShop && window.CBZCombat);
  const id = 'G' + Date.now().toString(36).toUpperCase();
  if (TOWER) {
    // Account made over the API: earn the reward blueprint and equip it alone, then log in through the page.
    const post = (url, body) => fetch(BASE + url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
    const reg = await post('/api/register', { name: id, email: `${id}@example.com`, passcode: 'goldenpass1' });
    const t = { token: reg.token };
    await post('/api/mission/complete', { ...t, result: 'win', wavesCleared: 10, bossesKilled: 1, difficulty: 'easy' });
    await post('/api/shop/purchase', { ...t, itemId: TOWER });
    const lo = await post('/api/loadout', { ...t, loadout: [TOWER] });
    if (!lo.ok) { console.log('LOADOUT SETUP FAILED', JSON.stringify(lo)); process.exit(1); }
    await page.fill('#auth-identity', id); await page.fill('#auth-passcode', 'goldenpass1');
  } else {
    await page.click('#tab-register');
    await page.fill('#auth-name', id); await page.fill('#auth-email', `${id}@example.com`);
    await page.fill('#auth-passcode', 'goldenpass1'); await page.fill('#auth-confirm', 'goldenpass1');
  }
  await page.click('#auth-submit');
  await page.waitForSelector('.menu-item[data-menu="play"]', { state: 'visible' });
  await page.click('.menu-item[data-menu="play"]'); await page.click('.bay-recon');
  await page.click('.map-card'); await page.waitForSelector('#deploy-mission', { state: 'visible' }); await page.click('#deploy-mission');
  await page.click('.mode-card[data-mode="easy"]');
  await page.evaluate(() => window.__step(2));
  // Pads are always valid deploy spots (and give anti-air), so click the first four pad centres.
  const pads = await page.locator('[data-pad]').evaluateAll((els) => els.slice(0, 4).map((el) => { const r = el.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }));
  for (const [x, y] of pads) {
    await page.click('.lo-slot[data-tower]');
    await page.mouse.move(x, y);
    await page.evaluate(() => window.__step(2));
    await page.mouse.click(x, y);
    await page.evaluate(() => window.__step(2));
  }
  const out = [];
  for (let f = 0; f < FRAMES; f += EVERY) {
    await page.evaluate((n) => window.__step(n), EVERY);
    const st = await page.evaluate(() => { const s = CBZCombat.stats(); delete s.towersDetail; return s; });
    // View check (not part of the golden): every live enemy has exactly one SVG group.
    const nodes = await page.evaluate(() => document.querySelectorAll('g.enemy:not(.dying)').length);
    if (nodes !== st.enemies) { console.log(`VIEW MISMATCH at frame ${f + EVERY}: ${nodes} nodes, ${st.enemies} enemies`); process.exit(1); }
    out.push({ frame: f + EVERY, ...st });
  }
  await browser.close();
  if (errs.length) { console.log('PAGE ERRORS', errs); process.exit(1); }
  const json = JSON.stringify(out, null, 1);
  if (process.argv.includes('--update')) { fs.writeFileSync(FILE, json + '\n'); console.log(`wrote ${FILE}`); return; }
  const want = fs.readFileSync(FILE, 'utf8').trim();
  if (want === json) { console.log(`GOLDEN OK (${out.length} checkpoints)`); return; }
  const w = JSON.parse(want);
  const i = out.findIndex((r, k) => JSON.stringify(r) !== JSON.stringify(w[k]));
  console.log(`GOLDEN DRIFT at checkpoint ${i}\n want ${JSON.stringify(w[i])}\n got  ${JSON.stringify(out[i])}`);
  process.exit(1);
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
