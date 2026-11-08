// Core Breach: Zero — Nexus Shop (blueprints, currencies, commander clearance).
// Loaded after app.js: uses its globals (apiRequest, playSound, showToast).
// Data lives in ./data.js; this file is the shop UI. Still sets window.CBZShop for app.js and combat.js.
import { HORIZON, xpToNext, allSeals, CATEGORIES, TOWERS, ULT_XP_PER_CORE, ULT_CARDS } from './data.js';

window.CBZShop = (() => {
  let profile = { name: '', level: 1, xp: 0, xpNext: xpToNext(1), nc: 0, bt: 0, firstClear: false, owned: ['sentinel'], loadout: ['sentinel'], mapWins: {}, achievements: {}, equippedPerks: [], totalXp: 0, ultCores: 0, ultClaims: 0, admin: false };
  // Belt-and-braces: a profile snapshot may predate the admin flag (login race,
  // old cache), so the shop ALSO honors the admin roster by commander name —
  // mirrors server.js ADMIN_NAMES. Server still enforces purchases.
  const ADMIN_NAMES = new Set(['JACKSONLOOMIS-COMMITS']);
  const isAdminProfile = (p) => Boolean(p && (p.admin || ADMIN_NAMES.has(String(p.name || '').toUpperCase())));
  const MAX_BAYS = 5;

  // Dual-currency prices arrive as { nc, bt }; single-currency as a number.
  const priceOf = (entry) => (typeof entry.price === 'object' ? entry.price : { [entry.currency || 'nc']: entry.price || 0 });
  const canAfford = (entry) => {
    const cost = priceOf(entry);
    return profile.nc >= (cost.nc || 0) && profile.bt >= (cost.bt || 0);
  };
  const priceLabel = (entry) => {
    const cost = priceOf(entry);
    const parts = [];
    if (cost.nc) parts.push(`<i class="tok tok-nc">NC</i>${format(cost.nc)}`);
    if (cost.bt) parts.push(`<i class="tok tok-bt">BT</i>${format(cost.bt)}`);
    return parts.join(' ') || 'FREE';
  };
  // Tower decal art: generated portraits, one unique emblem per chassis.
  const artHtml = (entry) => (entry.art ? `<img class="tw-art" src="${entry.art}" alt="${entry.name} decal" loading="lazy" onerror="this.remove()">` : '');
  const trackHtml = (entry) => (!entry.track ? '' : `<div class="tc-track"><span class="tc-track-head">UPGRADE TRACK — ${entry.track.length} TIERS</span>${entry.track.map((tier, i) =>
    `<div class="tc-tier"><span>${String(i + 1).padStart(2, '0')}</span><b>${tier.label}</b><small>${tier.info}</small><em>$${format(tier.cost)}</em></div>`).join('')}</div>`);
  let container = null;
  let filter = 'all';
  let armed = null;
  let armedTimer = 0;
  let armedCard = null;

  const towerById = (id) => TOWERS.find((entry) => entry.id === id);
  const format = (value) => Number(value || 0).toLocaleString('en-US');

  function setProfile(next) {
    const before = profile.level;
    profile = { ...profile, ...next };
    profile.xpNext = xpToNext(profile.level);
    // A loadout may only ever reference blueprints the commander owns — AND blueprints
    // that still exist. Retired rosters (RIP ARCLANCE) left ghost ids in stored loadouts:
    // the bay rendered EMPTY but the 5-bay cap still counted it, so a fifth tower could
    // never be equipped. Purging catalog-dead ids here heals the strip, the cap check,
    // the header count and the in-mission bar in one stroke.
    profile.loadout = (Array.isArray(profile.loadout) ? profile.loadout : [])
      .map(String).filter((id, index, list) => list.indexOf(id) === index && towerById(id) && profile.owned.includes(id)).slice(0, MAX_BAYS);
    // ULTIMATUM rule — at most ONE Ultimatum card armed at a time.
    let ultSeen = false;
    profile.loadout = profile.loadout.filter((id) => { const e = towerById(id); if (e && e.ultimatum) { if (ultSeen) return false; ultSeen = true; } return true; });
    if (!profile.loadout.length && profile.owned.length) profile.loadout = [profile.owned[0]];
    if (profile.level > before) {
      showToast(`CLEARANCE LEVEL UP — LV ${profile.level} UNLOCKED`);
      playSound();
      const badge = container && container.querySelector('#shop-level-badge');
      if (badge) { badge.classList.remove('levelup'); void badge.offsetWidth; badge.classList.add('levelup'); }
    }
    if (container) repaint();
    if (typeof window.paintWallet === 'function') window.paintWallet();
  }

  function visibility(entry) {
    // FULL CLEARANCE — the site admin sees and buys the entire grid at any level.
    const clearanceOk = isAdminProfile(profile) || profile.level >= entry.unlock;
    // ULTIMATUM cards never render in the blueprint grid — they live in the vault tab.
    if (entry.ultimatum) return profile.owned.includes(entry.id) ? 'owned' : 'ultimatum';
    // CRIMSON RELIC: event = relic blueprints — never purchasable, they materialize
    // in the armory only when the commander survives the event.
    if (profile.owned.includes(entry.id)) return 'owned';
    if (entry.event) return 'event-locked';
    // GOLDEN STANDARD: the PARAGON is never sold — it materializes when every
    // sector wears its Golden Seal (auto-granted server-side; this is the UI).
    if (entry.golden && !allSeals(profile.mapWins)) return 'gold-locked';
    if (entry.reward && !profile.firstClear) return 'reward-locked';
    if (clearanceOk) return 'buy';
    if (profile.level >= entry.unlock - HORIZON) return 'locked';
    return 'hidden';
  }

  function hiddenCount() {
    return TOWERS.filter((entry) => !entry.ultimatum && visibility(entry) === 'hidden').length;
  }

  // --- Deployment loadout: the blueprints carried into a mission -----------------
  const loadoutHeadText = () => `${profile.loadout.length}/${MAX_BAYS} BAYS ARMED // ${profile.owned.length} BLUEPRINT${profile.owned.length === 1 ? '' : 'S'} OWNED — EARN OR BUY MORE TO FILL EVERY BAY`;
  function paintBays() {
    const wrap = container && container.querySelector('#ls-bays');
    if (!wrap) return;
    const head = container.querySelector('.ls-head small');
    if (head) head.textContent = loadoutHeadText();
    const bays = [0, 1, 2, 3, 4].map((index) => {
      const entry = (profile.loadout || [])[index] && towerById(profile.loadout[index]);
      if (!entry) return `<div class="ls-bay ls-empty"><small>BAY ${index + 1}</small><b>EMPTY</b><small>EQUIP BELOW</small></div>`;
      return `<div class="ls-bay filled cat-${entry.cat}"><small>BAY ${index + 1}</small><span class="ls-icon">${artHtml(entry) || entry.icon}</span><b>${entry.name}</b><small>$${entry.cost} SALVAGE IN MISSION</small></div>`;
    });
    wrap.innerHTML = bays.join('');
  }

  function toggleEquip(id) {
    const entry = towerById(id);
    if (!entry || !profile.owned.includes(id)) return;
    const spot = profile.loadout.indexOf(id);
    if (spot >= 0) {
      profile.loadout.splice(spot, 1);
    } else {
      // ULTIMATUM rule — one card armed at a time. Mirrors the Nexus validators.
      const armedCard = profile.loadout.some((bid) => { const other = towerById(bid); return bid !== id && other && other.ultimatum; });
      if (entry.ultimatum && armedCard) {
        playSound('alarm');
        showToast('ONLY ONE ULTIMATUM CARD CAN BE ARMED — unequip the current card first.');
        return;
      }
      if (profile.loadout.length >= MAX_BAYS) {
        playSound('alarm');
        showToast('Loadout full — all 5 bays are occupied. Unequip a blueprint first.');
        return;
      }
      profile.loadout.push(id);
    }
    playSound();
    persistLoadout();
    repaint();
  }

  async function persistLoadout() {
    try { localStorage.setItem('cbz-loadout', JSON.stringify(profile.loadout)); } catch { /* storage optional. */ }
    try {
      const data = await apiRequest('/api/loadout', { token: localStorage.getItem('cbz-token') || '', loadout: profile.loadout });
      const before = profile.level;
      profile = { ...profile, ...data.profile };
      profile.xpNext = xpToNext(profile.level);
      if (profile.level > before && typeof window.paintWallet === 'function') window.paintWallet();
    } catch (error) {
      // The Nexus refused the bay layout — say why instead of silently reverting.
      showToast(error.message || 'Loadout rejected by the Nexus link.');
      repaint();
    }
  }

  function meters(entry) {
    const caps = { dmg: 160, rate: 3.5, rng: 260 };
    const pct = (value, cap) => `${Math.max(3, Math.min(100, Math.round((value / cap) * 100)))}%`;
    const splash = entry.stats.splash ? `<div class="tc-meter"><span>SPLASH</span><div class="tm-track"><i style="width:${pct(entry.stats.splash, 80)}"></i></div><b>${entry.stats.splash}U</b></div>` : '';
    const income = entry.stats.income ? `<div class="tc-meter"><span>INCOME</span><div class="tm-track"><i style="width:${pct(entry.stats.income, 1000)}"></i></div><b>$${format(entry.stats.income)}/WAVE</b></div>` : '';
    const summon = entry.stats.summon ? `<div class="tc-meter"><span>SUMMON</span><div class="tm-track"><i style="width:${pct(entry.stats.summon, 100)}"></i></div><b>${entry.stats.summon}% HP</b></div>` : '';
    const drone = entry.stats.drone ? `<div class="tc-meter"><span>DRONE</span><div class="tm-track"><i style="width:${pct(entry.stats.drone, 300)}"></i></div><b>${entry.stats.drone} DMG/HULL</b></div>` : '';
    const corrupt = entry.stats.corrupt ? `<div class="tc-meter"><span>CONTAGION</span><div class="tm-track"><i style="width:${pct(entry.stats.corrupt, 80)}"></i></div><b>${entry.stats.corrupt}/S · 5S</b></div>` : '';
    const slow = entry.stats.slow ? `<div class="tc-meter"><span>SLICK</span><div class="tm-track"><i style="width:${pct(entry.stats.slow * 100, 50)}"></i></div><b>SLOW ${Math.round(entry.stats.slow * 100)}%</b></div>` : '';
    const buff = entry.stats.dmgBuff ? `<div class="tc-meter"><span>NETWORK</span><div class="tm-track"><i style="width:${pct((entry.stats.dmgBuff || 0) * 100, 30)}"></i></div><b>+${Math.round((entry.stats.dmgBuff || 0) * 100)}% DMG</b></div>` : '';
    const bond = entry.stats.bond ? `<div class="tc-meter"><span>BOND</span><div class="tm-track"><i style="width:${pct(entry.stats.bond * 100, 25)}"></i></div><b>+${Math.round(entry.stats.bond * 100)}%/WAVE · $${format(entry.stats.bondCap || 3000)} CAP</b></div>` : '';
    const frag = entry.stats.frag ? `<div class="tc-meter"><span>FRAG</span><div class="tm-track"><i style="width:${pct(entry.stats.frag * 100, 25)}"></i></div><b>+${Math.round(entry.stats.frag * 100)}% SPLASH · ${entry.stats.fragRadius || 35}U</b></div>` : '';
    const warrant = entry.stats.warrantPct ? `<div class="tc-meter"><span>VERDICT</span><div class="tm-track"><i style="width:${pct(entry.stats.warrantPct * 100, 40)}"></i></div><b>${format(entry.stats.dmg)} + ${Math.round(entry.stats.warrantPct * 100)}% MAX HULL</b></div>` : '';
    const tithe = entry.stats.tithe ? `<div class="tc-meter"><span>TITHE</span><div class="tm-track"><i style="width:${pct(entry.stats.tithe * 100, 25)}"></i></div><b>+${Math.round(entry.stats.tithe * 100)}% BOUNTY</b></div>` : '';
    const row = (label, value, cap, suffix = '') => (value ? `<div class="tc-meter"><span>${label}</span><div class="tm-track"><i style="width:${pct(value, cap)}"></i></div><b>${value >= 999 ? 'INF' : value}${suffix}</b></div>` : '');
    return `${row('DMG', entry.stats.dmg, caps.dmg)}${row('RATE', entry.stats.rate, caps.rate, '/s')}${row('RNG', entry.stats.rng, caps.rng)}${splash}${income}${summon}${drone}${corrupt}${slow}${buff}${bond}${frag}${warrant}${tithe}`;
  }

  function cardHtml(entry) {
    const vis = visibility(entry);
    if (vis === 'locked') {
      return `
        <article class="tower-card state-locked cat-${entry.cat}" data-id="${entry.id}">
          <div class="tc-top"><span class="tc-cat">${CATEGORIES[entry.cat].label}</span><span class="tc-unlock">CLEARANCE ${entry.unlock}</span></div>
          <div class="tc-icon">${artHtml(entry) || entry.icon}</div>
          <h4>${entry.name}</h4>
          <p class="tc-tagline">${entry.tagline}</p>
          <div class="tc-stats">${meters(entry)}</div>
          <div class="tc-target">${entry.stats.tgt}</div>
          <p class="tc-special">${entry.special}</p>
          ${trackHtml(entry)}
          <div class="tc-lock"><span>SIGNAL ENCRYPTED</span><b>LV ${entry.unlock}</b></div>
        </article>`;
    }
    if (vis === 'event-locked') {
      return `
        <article class="tower-card state-event state-locked cat-${entry.cat}" data-id="${entry.id}">
          <div class="tc-top"><span class="tc-cat">${CATEGORIES[entry.cat].label}</span><span class="tc-unlock">CRIMSON RELIC</span></div>
          <div class="tc-icon">${artHtml(entry) || entry.icon}</div>
          <h4>${entry.name}</h4>
          <p class="tc-tagline">${entry.tagline}</p>
          <div class="tc-stats">${meters(entry)}</div>
          <div class="tc-target">${entry.stats.tgt}</div>
          <p class="tc-special">${entry.special}</p>
          ${trackHtml(entry)}
          <div class="tc-lock crimson-lock"><span>EVENT RELIC</span><b>SLAY THE CRIMSON DAWN</b></div>
        </article>`;
    }
    if (vis === 'reward-locked') {
      return `
        <article class="tower-card state-locked state-reward cat-${entry.cat}" data-id="${entry.id}">
          <div class="tc-top"><span class="tc-cat">${CATEGORIES[entry.cat].label}</span><span class="tc-unlock">REWARD BLUEPRINT</span></div>
          <div class="tc-icon">${artHtml(entry) || entry.icon}</div>
          <h4>${entry.name}</h4>
          <p class="tc-tagline">${entry.tagline}</p>
          <div class="tc-stats">${meters(entry)}</div>
          <div class="tc-target">${entry.stats.tgt}</div>
          <p class="tc-special">${entry.special}</p>
          ${trackHtml(entry)}
          <div class="tc-lock"><span>MISSION REWARD</span><b>BEAT EASY MODE</b></div>
        </article>`;
    }
    if (vis === 'gold-locked') {
      return `
        <article class="tower-card state-locked state-gold cat-${entry.cat}" data-id="${entry.id}">
          <div class="tc-top"><span class="tc-cat">${CATEGORIES[entry.cat].label}</span><span class="tc-unlock">GOLDEN STANDARD</span></div>
          <div class="tc-icon">${artHtml(entry) || entry.icon}</div>
          <h4>${entry.name}</h4>
          <p class="tc-tagline">${entry.tagline}</p>
          <div class="tc-stats">${meters(entry)}</div>
          <div class="tc-target">${entry.stats.tgt}</div>
          <p class="tc-special">${entry.special}</p>
          ${trackHtml(entry)}
          <div class="tc-lock gold-lock"><span>PERFECT CAMPAIGN</span><b>GILD ALL 5 SECTORS</b></div>
        </article>`;
    }
    const owned = vis === 'owned';
    const affordable = canAfford(entry);
    const arming = !owned && affordable && armed === entry.id;
    return `
      <article class="tower-card state-${owned ? 'owned' : 'buy'} cat-${entry.cat}" data-id="${entry.id}">
        <div class="tc-top"><span class="tc-cat">${CATEGORIES[entry.cat].label}</span><span class="tc-unlock">${owned ? 'DEPLOYED' : `CLEARANCE ${entry.unlock}`}</span></div>
        <div class="tc-icon">${artHtml(entry) || entry.icon}</div>
        <h4>${entry.name}</h4>
        <p class="tc-tagline">${entry.tagline}</p>
        <div class="tc-stats">${meters(entry)}</div>
        <div class="tc-target">${entry.stats.tgt}</div>
        <p class="tc-special">${entry.special}</p>
        ${trackHtml(entry)}
        ${owned ? `<button class="tc-equip${profile.loadout.includes(entry.id) ? ' on' : ''}" type="button" data-equip="${entry.id}">${profile.loadout.includes(entry.id) ? 'UNEQUIP FROM LOADOUT' : 'EQUIP TO LOADOUT'}</button>` : `<button class="tc-buy${affordable ? '' : ' cant'}${arming ? ' arm' : ''}" type="button" data-buy="${entry.id}">${arming ? 'CONFIRM PURCHASE?' : priceLabel(entry)}</button>`}
      </article>`;
  }

  function render(target) {
    container = target;
    filter = 'all';
    armed = null;
    armedCard = null;
    container.innerHTML = `
      <header class="shop-head">
        <div><span class="shop-kicker">// NEXUS MARKETPLACE</span><h3>BLUEPRINT EXCHANGE</h3></div>
        <span class="shop-horizon">DECRYPT HORIZON: 10 LV</span>
      </header>
      <div class="shop-wallet">
        <div class="shop-level">
          <div class="shop-level-badge" id="shop-level-badge"><b id="shop-level">${profile.level}</b><span>CLEARANCE</span></div>
          <div class="shop-xp"><div class="shop-xp-head"><span>CLEARANCE PROGRESS — UNCAPPED</span><span id="shop-xp-num"></span></div><div class="shop-xp-track"><i id="shop-xp-fill"></i></div></div>
        </div>
        <div class="shop-currencies">
          <div class="cur-chip cur-xp"><i class="tok tok-xp">XP</i><div><b id="shop-totalxp">0</b><span>TOTAL XP // LIFETIME</span></div></div>
          <div class="cur-chip cur-nc"><i class="tok tok-nc">NC</i><div><b id="shop-nc">0</b><span>NEXUS COINS</span></div></div>
          <div class="cur-chip cur-bt"><i class="tok tok-bt">BT</i><div><b id="shop-bt">0</b><span>BREACH TOKENS</span></div></div>
        </div>
      </div>
      <div class="loadout-strip" id="loadout-strip">
        <div class="ls-head"><span>// DEPLOYMENT LOADOUT</span><small></small></div>
        <div class="ls-bays" id="ls-bays"></div>
      </div>
      <p class="shop-note">Nexus Coins flow from every wave, boss and cleared sector. <b>Breach Tokens</b> drop only from boss kills, flawless defenses and first clearances. New blueprints decrypt 10 clearance levels before they unlock — beyond that range, their signals stay hidden. Equipped blueprints deploy from the loadout bar in battle; towers you place claim a clearance box on the grid that blocks overlapping builds.</p>
      <div class="shop-tabs" id="shop-tabs"></div>
      <div class="shop-grid" id="shop-grid"></div>
      <div id="shop-ultimatum" hidden></div>
      <div class="shop-encrypted" id="shop-encrypted" hidden></div>`;
    container.querySelector('#shop-tabs').innerHTML = Object.entries(CATEGORIES).map(([id, cat]) => `<button class="shop-tab${id === 'all' ? ' on' : ''}" type="button" data-cat="${id}">${cat.label}</button>`).join('')
      + '<button class="shop-tab shop-tab-ult" type="button" data-cat="__ult">★ ULTIMATUM</button>';
    container.querySelector('#shop-tabs').addEventListener('click', (event) => {
      const tab = event.target.closest('[data-cat]');
      if (!tab) return;
      filter = tab.dataset.cat;
      container.querySelectorAll('.shop-tab').forEach((el) => el.classList.toggle('on', el === tab));
      playSound();
      repaint();
    });
    container.querySelector('#shop-grid').addEventListener('click', onGridClick);
    container.querySelector('#shop-ultimatum').addEventListener('click', onUltClick);
    repaint();
  }

  function repaint() {
    if (!container) return;
    const grid = container.querySelector('#shop-grid');
    if (!grid) return;
    paintBays();
    const ultView = filter === '__ult';
    const list = TOWERS.filter((entry) => !entry.ultimatum && (filter === 'all' || entry.cat === filter) && visibility(entry) !== 'hidden');
    grid.innerHTML = ultView ? '' : list.map(cardHtml).join('');
    grid.hidden = ultView;
    const ultPanel = container.querySelector('#shop-ultimatum');
    if (ultPanel) {
      ultPanel.hidden = !ultView;
      if (ultView) ultPanel.innerHTML = ultPanelHtml();
    }
    const level = container.querySelector('#shop-level');
    if (level) level.textContent = profile.level;
    const totalXp = container.querySelector('#shop-totalxp');
    if (totalXp) totalXp.textContent = format(profile.totalXp || 0);
    const nc = container.querySelector('#shop-nc');
    if (nc) nc.textContent = format(profile.nc);
    const bt = container.querySelector('#shop-bt');
    if (bt) bt.textContent = format(profile.bt);
    const xpNum = container.querySelector('#shop-xp-num');
    const xpFill = container.querySelector('#shop-xp-fill');
    if (xpNum) xpNum.textContent = `${format(profile.xp)} / ${format(profile.xpNext)} XP`;
    if (xpFill) xpFill.style.width = `${Math.min(100, Math.round((profile.xp / profile.xpNext) * 100))}%`;
    const encrypted = container.querySelector('#shop-encrypted');
    if (encrypted) {
      const count = ultView ? 0 : hiddenCount();
      encrypted.hidden = count === 0;
      encrypted.innerHTML = `<span>▲</span> ${count} ENCRYPTED BLUEPRINT${count === 1 ? '' : 'S'} BEYOND DECRYPT HORIZON <span>▲</span>`;
    }
  }

  // --- ULTIMATUM vault panel -----------------------------------------------------
  function ultPanelHtml() {
    const total = profile.totalXp || 0;
    const banked = Math.floor(total / ULT_XP_PER_CORE);
    const ready = Math.max(0, banked - (profile.ultClaims || 0));
    const intoCore = total % ULT_XP_PER_CORE;
    const pct = Math.min(100, Math.round((intoCore / ULT_XP_PER_CORE) * 100));
    const cards = ULT_CARDS.map((card) => {
      const tower = towerById(card.id);
      const owned = profile.owned.includes(card.id);
      const locked = !isAdminProfile(profile) && profile.level < card.unlock;
      const armedHere = owned && profile.loadout.includes(card.id);
      const arming = !owned && (profile.ultCores || 0) >= card.cores && armedCard === card.id;
      const action = owned
        ? `<button class="ult-buy${armedHere ? ' on' : ''}" type="button" data-equip="${card.id}">${armedHere ? 'UNEQUIP CARD' : 'ARM CARD'}</button>`
        : locked
          ? `<button class="ult-buy cant" type="button" disabled>CLEARANCE ${card.unlock} REQUIRED</button>`
          : `<button class="ult-buy${(profile.ultCores || 0) >= card.cores ? '' : ' cant'}${arming ? ' arm' : ''}" type="button" data-ult-buy="${card.id}">${arming ? 'SPEND THE CORE?' : `<i class="tok tok-ult">UC</i>${card.cores} CORE${card.cores === 1 ? '' : 'S'}`}</button>`;
      return `
        <article class="ult-card${owned ? ' owned' : ''}" data-ult-card="${card.id}">
          <div class="ult-card-top"><span>// ULTIMATUM CARD</span><b>${owned ? 'IN THE ARMORY' : `${card.cores} CORE${card.cores === 1 ? '' : 'S'}`}</b></div>
          ${tower ? artHtml(tower) : ''}
          <h4>${card.name}</h4>
          <p>${card.blurb}</p>
          ${tower ? `<div class="ult-stats"><span>${tower.stats.tgt}</span></div>` : ''}
          ${tower ? trackHtml(tower) : ''}
          ${action}
        </article>`;
    }).join('');
    return `
      <div class="ult-hero">
        <div class="ult-total"><span>★</span> ${format(total)}<small>TOTAL XP // EVERY MISSION, BOSS AND SALVAGE CODE — FOREVER</small></div>
        <div class="ult-core">
          <div class="ult-core-head"><span>PROGRESS INTO THE NEXT CORE</span><b>${format(intoCore)} / ${format(ULT_XP_PER_CORE)} XP</b></div>
          <div class="ult-core-track"><i style="width:${pct}%"></i></div>
          <div class="ult-core-foot"><span>BANKED: ${banked} · CLAIMED: ${profile.ultClaims || 0} · UNSPENT CORES: ${profile.ultCores || 0}</span><span>${ULT_XP_PER_CORE.toLocaleString('en-US')} XP PER CORE</span></div>
        </div>
        <button class="ult-exchange${ready > 0 ? ' ready' : ''}" type="button" data-ult-exchange="1" ${ready > 0 ? '' : 'disabled'}>${ready > 0 ? `EXCHANGE ${format(ULT_XP_PER_CORE)} XP // BANK ${ready} ULTIMATUM CORE${ready === 1 ? '' : 'S'}` : `REACH ${format(ULT_XP_PER_CORE)} TOTAL XP TO BANK A CORE`}</button>
        <p class="ult-note">The progress bar counts into your NEXT core — banking one never resets or spends your TOTAL XP (the ★ number above). The exchange NEVER touches your clearance, wallet or armory — levels and owned towers are safe forever. Cores only ever grow.</p>
      </div>
      <div class="ult-grid">${cards}</div>`;
  }

  async function ultimatumAction(payload, button) {
    if (button) { button.disabled = true; }
    try {
      const data = await apiRequest('/api/ultimatum', { token: localStorage.getItem('cbz-token') || '', ...payload });
      setProfile(data.profile);
      playSound();
      if (payload.action === 'exchange') showToast(`ULTIMATUM CORE BANKED — ${(profile.ultCores || 0)} UNSPENT.`);
      if (payload.action === 'buy') showToast(`ULTIMATUM CARD ACQUIRED: ${ULT_CARDS.find((c) => c.id === payload.card)?.name || 'CARD'} — welcome to the apex tier.`);
      repaint();
    } catch (error) {
      playSound('alarm');
      showToast(error.message);
      armedCard = null;
      repaint();
    }
  }

  function onUltClick(event) {
    const equip = event.target.closest('[data-equip]');
    if (equip) { toggleEquip(equip.dataset.equip); return; }
    const exchange = event.target.closest('[data-ult-exchange]');
    if (exchange && !exchange.disabled) { ultimatumAction({ action: 'exchange' }, exchange); return; }
    const buy = event.target.closest('[data-ult-buy]');
    if (!buy) return;
    const cardId = buy.dataset.ultBuy;
    if (armedCard !== cardId) {
      armedCard = cardId;
      repaint();
      return;
    }
    armedCard = null;
    ultimatumAction({ action: 'buy', card: cardId }, buy);
  }

  function onGridClick(event) {
    const equip = event.target.closest('[data-equip]');
    if (equip) { toggleEquip(equip.dataset.equip); return; }
    const button = event.target.closest('[data-buy]');
    if (!button) return;
    const entry = towerById(button.dataset.buy);
    if (!entry) return;
    if (!canAfford(entry)) {
      playSound('alarm');
      const card = button.closest('.tower-card');
      if (card) { card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake'); }
      const cost = priceOf(entry);
      const short = [];
      if (profile.nc < (cost.nc || 0)) short.push(`${format((cost.nc || 0) - profile.nc)} NC`);
      if (profile.bt < (cost.bt || 0)) short.push(`${format((cost.bt || 0) - profile.bt)} BT`);
      showToast(`SHORT ON SALVAGE FOR ${entry.name}: NEED ${short.join(' + ')} MORE. Boss kills, flawless defenses and first clearances pay Breach Tokens.`);
      return;
    }
    if (armed !== entry.id) {
      armed = entry.id;
      repaint();
      return;
    }
    clearTimeout(armedTimer);
    armed = null;
    purchase(entry, button);
  }

  async function purchase(entry, button) {
    button.disabled = true;
    button.textContent = 'TRANSFERRING…';
    try {
      const data = await apiRequest('/api/shop/purchase', { token: localStorage.getItem('cbz-token') || '', itemId: entry.id });
      setProfile(data.profile);
      playSound();
      showToast(`ACQUIRED: ${entry.name} — added to your armory.`);
      const card = container && container.querySelector(`.tower-card[data-id="${entry.id}"]`);
      if (card) card.classList.add('bought');
    } catch (error) {
      playSound('alarm');
      showToast(error.message);
      repaint();
    }
  }

  async function submitMission(payload) {
    try {
      const data = await apiRequest('/api/mission/complete', { token: localStorage.getItem('cbz-token') || '', ...payload });
      setProfile(data.profile);
      return data;
    } catch {
      return null;
    }
  }

  // Salvage-code redemption — server route + LOCAL mirror share the same contract.
  // Codes validate server-side (and in LOCAL mode) against a one-time-per-commander
  // ledger, so there is no admin surface to abuse.
  // Perk loadout — persist the two tactical slots through the Nexus link.
  async function setPerks(perks) {
    const data = await apiRequest('/api/perks', { token: localStorage.getItem('cbz-token') || '', perks });
    setProfile(data.profile);
    return data.profile;
  }

  async function redeemCode(code) {
    const data = await apiRequest('/api/redeem', { token: localStorage.getItem('cbz-token') || '', code });
    setProfile(data.profile);
    return data.granted || null;
  }
  return { render, setProfile, submitMission, redeemCode, setPerks, profile: () => profile, loadout: () => (profile.loadout || []).map(towerById).filter(Boolean), TOWERS, xpToNext, HORIZON, MAX_BAYS, ULT_CARDS, ULT_XP_PER_CORE, artHtml };
})();
