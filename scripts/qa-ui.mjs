// UI sweep (dev tool, not in npm test): every menu at 4 viewports, reports console/page errors, failed requests,
// horizontal overflow, off-screen or overlapped buttons, clipped text, broken images, unlabeled icon buttons, focus leaks.
//   PORT=3931 node scripts/qa-ui.mjs [--hosted] [--views=phone,tablet] [--shots=DIR]
// Env: PLAYWRIGHT_PATH (module dir, default ~/gll-id/node_modules/playwright), CHROME (executablePath).
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || path.join(os.homedir(), 'gll-id/node_modules/playwright'));
const BASE = `http://127.0.0.1:${process.env.PORT || 3931}`;
const HOSTED = process.argv.includes('--hosted');
const SHOTS = (process.argv.find((a) => a.startsWith('--shots=')) || '').slice(8);
const ALL = { desktop: [1440, 900], laptop: [1280, 720], tablet: [820, 1180], phone: [390, 844] };
const only = (process.argv.find((a) => a.startsWith('--views=')) || '').slice(8).split(',').filter(Boolean);
const VIEWS = Object.fromEntries(Object.entries(ALL).filter(([k]) => !only.length || only.includes(k)));
const MENUS = ['crimson', 'play', 'online', 'perks', 'shop', 'settings', 'changelog', 'about'];

// Runs inside the page: audits whatever is visible now.
const audit = () => {
  const out = [];
  const vw = innerWidth; const vh = innerHeight;
  const de = document.documentElement;
  const dlg = document.querySelector('dialog[open]');
  const top = [document.querySelector('.vote-overlay'), document.querySelector('#auth-overlay:not([hidden])'), document.querySelector('#battlefield:not([hidden])')].find((e) => e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0);
  const scope = dlg || top || document.body; // what the player can actually reach
  const modal = !!(dlg || top);
  if (de.scrollWidth > vw + 1) out.push(`h-scroll: doc ${de.scrollWidth} > ${vw}`);
  if (dlg) { const b = dlg.getBoundingClientRect(); if (b.right > vw + 1 || b.left < -1 || b.bottom > vh + 1) out.push(`dialog outside viewport ${Math.round(b.left)},${Math.round(b.top)},${Math.round(b.right)},${Math.round(b.bottom)}`); }
  const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const name = (el) => (el.id ? '#' + el.id : el.className ? '.' + String(el.className).trim().split(/\s+/)[0] : el.tagName) + ':' + (el.textContent || '').trim().slice(0, 24);
  const inScrollable = (el) => { for (let p = el.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowY; if ((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight) return true; } return false; };
  for (const el of scope.querySelectorAll('button, a[href], input, select, textarea, [role=button]')) {
    if (!vis(el) || el.closest('[hidden]')) continue;
    const r = el.getBoundingClientRect();
    if (r.right > vw + 1 || r.left < -1) out.push(`btn off-screen x: ${name(el)} ${Math.round(r.left)}..${Math.round(r.right)}`);
    else if (modal && !inScrollable(el) && (r.bottom > vh + 1 || r.top < -1)) out.push(`btn off-screen y: ${name(el)} ${Math.round(r.top)}..${Math.round(r.bottom)}`);
    if (r.width < 24 || r.height < 24) out.push(`tiny target ${Math.round(r.width)}x${Math.round(r.height)}: ${name(el)}`);
    const label = el.getAttribute('aria-label') || el.getAttribute('title') || (el.textContent || '').trim() || (el.labels && el.labels.length) || el.getAttribute('placeholder');
    if (!label) out.push(`unlabeled: ${name(el)} <${el.tagName.toLowerCase()}>`);
    else if (el.tagName === 'BUTTON' && !(el.getAttribute('aria-label')) && !/[A-Za-z0-9]/.test((el.textContent || '').trim()) && !el.getAttribute('title')) out.push(`icon-only button no aria-label: ${name(el)}`);
    // overlap: centre point covered by something that is neither the element nor related to it
    const sx = Math.min(Math.max(r.left + r.width / 2, 0), vw - 1); const sy = r.top + r.height / 2;
    if (sy >= 0 && sy < vh && !inScrollable(el)) { const top = document.elementFromPoint(sx, sy); if (top && top !== el && !el.contains(top) && !top.contains(el)) out.push(`overlapped: ${name(el)} by ${name(top)}`); }
  }
  for (const el of scope.querySelectorAll('h1,h2,h3,strong,b,span,small,p,button,label,td,th')) {
    if (!vis(el) || el.closest('[hidden]') || el.closest('svg')) continue;
    const cs = getComputedStyle(el);
    if (el.scrollWidth > el.clientWidth + 2 && (cs.overflowX === 'hidden' || cs.textOverflow === 'ellipsis') && el.children.length === 0) out.push(`clipped text: ${name(el)} ${el.scrollWidth}>${el.clientWidth}`);
    const r = el.getBoundingClientRect();
    if (el.children.length === 0 && r.right > vw + 1 && !inScrollable(el)) out.push(`text past right edge: ${name(el)}`);
  }
  for (const img of scope.querySelectorAll('img')) { if (img.complete && img.naturalWidth === 0) out.push(`broken img: ${img.getAttribute('src')}`); if (!img.hasAttribute('alt')) out.push(`img no alt: ${img.getAttribute('src')}`); }
  return out;
};

const focusLeak = async (page) => {
  const inDlg = () => { const a = document.activeElement; return !a || a === document.body || !!a.closest('dialog'); };
  for (let i = 0; i < 40; i += 1) { await page.keyboard.press('Tab'); if (!(await page.evaluate(inDlg))) return true; }
  return false;
};

const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const report = [];
const seen = new Set();
for (const [vname, [w, h]] of Object.entries(VIEWS)) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  let where = 'boot';
  const note = async (msg) => { const k = `${vname}|${where}|${msg}`; if (seen.has(k)) return; seen.add(k); report.push(k); };
  page.on('pageerror', (e) => note(`PAGEERROR ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') note(`console.error ${m.text().slice(0, 140)}`); });
  page.on('requestfailed', (r) => { if (!/fonts\.g/.test(r.url())) note(`reqfailed ${r.url().replace(BASE, '')} ${r.failure()?.errorText}`); });
  page.on('response', (r) => { if (r.status() >= 400 && !/fonts\.g/.test(r.url())) note(`HTTP ${r.status()} ${r.url().replace(BASE, '')}`); });
  if (HOSTED) await page.route('**/api/hosted', (r) => r.fulfill({ json: { ok: true } }));
  const shot = async (tag) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, `${HOSTED ? 'h-' : ''}${vname}-${tag}.png`) }); } };
  const check = async (tag) => { where = tag; const probs = await page.evaluate(audit); for (const p of probs) await note(p); if (probs.length) await shot(tag); };

  await page.goto(`${BASE}/?cash=2000&cbzwave=8`);
  await page.waitForFunction(() => window.CBZShop && window.CBZCombat);
  await check('login');
  await page.click('#tab-register'); await check('register');
  const id = 'Q' + Date.now().toString(36).toUpperCase().slice(-8) + vname[0];
  await page.fill('#auth-name', id); await page.fill('#auth-email', `${id}@example.com`);
  await page.fill('#auth-passcode', 'qapass1234'); await page.fill('#auth-confirm', 'qapass1234');
  await page.click('#auth-submit');
  await page.waitForSelector('.menu-item[data-menu="play"]', { state: 'visible' });
  await page.waitForTimeout(400);
  await check('home');
  for (const m of MENUS) {
    await page.click(`.menu-item[data-menu="${m}"]`).catch((e) => note(`menu ${m} click failed: ${e.message.split('\n')[0]}`));
    await page.waitForTimeout(600);
    await check(`menu-${m}`);
    if (await page.evaluate(() => !!document.querySelector('dialog[open]'))) {
      if (await focusLeak(page)) await note(`focus leaves dialog (${m})`);
      await page.keyboard.press('Escape');
      if (await page.evaluate(() => !!document.querySelector('dialog[open]'))) { await note(`Escape does not close dialog (${m})`); await page.click('#dialog-close'); }
    } else await note(`dialog did not open (${m})`);
  }
  // loadout lives in the shop screen
  await page.click('.menu-item[data-menu="shop"]'); await page.waitForTimeout(500);
  for (const t of await page.locator('#dialog-body [role=tab], #dialog-body .shop-tab, #dialog-body .tab').all()) { await t.click().catch(() => {}); await page.waitForTimeout(150); await check('shop-tab'); }
  await page.keyboard.press('Escape');
  // terms
  await page.goto(`${BASE}/terms.html`); where = 'terms';
  for (const p of await page.evaluate(audit)) await note(p);
  await page.goto(`${BASE}/?cash=2000&cbzwave=8`); await page.waitForSelector('.menu-item[data-menu="play"]', { state: 'visible' });
  // solo recon -> mission
  await page.click('.menu-item[data-menu="play"]'); await page.waitForTimeout(500); await check('play');
  if (!HOSTED) { await page.click('.bay-recon').catch((e) => note('no .bay-recon: ' + e.message.split('\n')[0])); await page.waitForTimeout(300); await check('play-map-select'); }
  else if (await page.locator('.bay-recon').count()) await note('hosted: lane buttons still present');
  await page.click('.map-card').catch((e) => note('no .map-card: ' + e.message.split('\n')[0]));
  await page.waitForSelector('#deploy-mission', { state: 'visible', timeout: 5000 }).catch(() => note('recon did not open'));
  await page.waitForTimeout(500); await check('recon');
  await page.click('#deploy-mission').catch(() => {});
  await page.waitForTimeout(500); await check('mode-pick');
  await page.click('.mode-card[data-mode="easy"]').catch(() => note('no mode card'));
  await page.waitForTimeout(2500); await check('hud');
  await page.waitForTimeout(3000); await check('hud-later');
  await page.evaluate(() => { const b = document.querySelector('#exit-battle'); b && b.click(); });
  await page.waitForTimeout(500); await check('after-exit');
  await ctx.close();
}
await browser.close();
console.log(report.length ? report.join('\n') : 'no findings');
