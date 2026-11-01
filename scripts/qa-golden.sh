#!/bin/bash
# GOLDEN VETERANS QA: golden seal map cards -> PARAGON lock card + admin full clearance ->
# new shop cards (veteran 8 tiers / bonds / drums / vault trio) -> live grid (gun switch,
# bond deposit/withdraw, warrant charge + annihilation) -> summon intel trimmed to HP.
cd /home/z/my-project/Core-Breach-Zero
SS=/home/z/my-project/download/screenshots
mkdir -p "$SS"
B="agent-browser"
PASS=0; FAIL=0
ok() { if [ "$2" = "true" ]; then echo "  PASS  $1"; PASS=$((PASS+1)); else echo "  FAIL  $1 (got: $2)"; FAIL=$((FAIL+1)); fi; }
START_AT=${START_AT:-1}
STOP_AT=${STOP_AT:-99}

pkill -f "node server.js" 2>/dev/null; sleep 0.3
rm -f accounts.json
(PORT=3111 node server.js > /tmp/cbz-qa-golden.log 2>&1 &)
sleep 1.4

$B set viewport 1440 900
$B open "http://127.0.0.1:3111/" > /dev/null
$B wait --load networkidle; sleep 0.8
$B find first "#tab-register" click; sleep 0.3
$B find first "#auth-name" fill "GOLDENQA"
$B find first "#auth-email" fill "golden@mail.com"
$B find first "#auth-passcode" fill "corebreach"
$B find first "#auth-confirm" fill "corebreach"
$B find first "#auth-submit" click
$B wait --fn "document.querySelector('#auth-overlay').hidden === true" --timeout 8000
sleep 0.5
# Farm the SERVER account past the veteran gate (browser purchases are server-validated).
$B eval "(async () => { for (let i = 0; i < 7; i++) await apiRequest('/api/redeem', { token: localStorage.getItem('cbz-token'), code: '$ADMIN_KEY_CODE' }); const prof = await apiRequest('/api/profile', { token: localStorage.getItem('cbz-token') }); window.CBZShop.setProfile(prof.profile); return prof.profile.level; })()" > /dev/null
sleep 1.2

if [ "$START_AT" -le 1 ] && [ "$STOP_AT" -ge 1 ]; then
echo "--- flow 1: golden seals on the map cards + PARAGON lock card + admin clearance"
$B eval "window.CBZShop.setProfile({ name: 'GOLDENQA', level: 8, xp: 0, nc: 50000, bt: 400, owned: ['sentinel'], loadout: ['sentinel'], mapWins: { 'easy:easy': 1, 'easy:medium': 1, 'easy:hard': 1, 'easy:insane': 1 } }); 'armed'" > /dev/null
$B find first "[data-menu=\"play\"]" click; sleep 0.6
$B find text "SOLO MAP RECON" click; sleep 0.6
ok "EASY sector gilds (map-golden class + living border)" "$($B eval "Boolean(document.querySelector('.map-card[data-map=\"easy\"].map-golden'))")"
ok "gilded sector wears the GOLDEN SEAL badge" "$($B eval "(document.querySelector('.map-card[data-map=\"easy\"] .map-gold-badge') || {textContent:''}).textContent.includes('GOLDEN SEAL')")"
ok "ungilded sectors stay clean" "$($B eval "!document.querySelector('.map-card[data-map=\"medium\"].map-golden') && !document.querySelector('.map-card[data-map=\"cbz\"].map-golden')")"
ok "recon copy explains the seal + the paragon bounty" "$($B eval "document.querySelector('.dialog-copy').textContent.includes('GOLDEN SEAL') && document.querySelector('.dialog-copy').textContent.includes('2,500 NC')")"
$B find first "#dialog-close" click; sleep 0.4
$B eval "window.CBZShop.setProfile({ name: 'GOLDENQA', level: 8, xp: 0, nc: 50000, bt: 400, owned: ['sentinel'], loadout: ['sentinel'], mapWins: {} }); 'clean'" > /dev/null
$B find first "[data-menu=\"shop\"]" click; sleep 1.2
ok "PARAGON renders the gold-locked card before the fifth seal" "$($B eval "(document.querySelector('.tower-card[data-id=\"paragon\"]') || {textContent:''}).textContent.includes('GILD ALL 5 SECTORS')")"
ok "all five seals flip paragon into a FREE claim (visibility heal)" "$($B eval "(() => { const wins = { easy: 1, medium: 1, hard: 1, insane: 1, cbz: 1 }; const mw = {}; for (const m of Object.keys(wins)) for (const p of ['easy', 'medium', 'hard', 'insane']) mw[m + ':' + p] = 1; window.CBZShop.setProfile({ name: 'GOLDENQA', level: 8, xp: 0, nc: 50000, bt: 400, owned: ['sentinel'], loadout: ['sentinel'], mapWins: mw }); const btn = (document.querySelector('.tower-card[data-id=\"paragon\"] .tc-buy') || {textContent:''}).textContent; window.CBZShop.setProfile({ name: 'GOLDENQA', level: 8, xp: 0, nc: 50000, bt: 400, owned: ['sentinel'], loadout: ['sentinel'], mapWins: {} }); return btn.includes('FREE'); })()")"
ok "admin clearance: level-8 admin sees SPARK COIL as BUYABLE" "$($B eval "window.CBZShop.setProfile({ name: 'GOLDENQA', level: 8, xp: 0, nc: 50000, bt: 400, admin: true, owned: ['sentinel'], loadout: ['sentinel'], mapWins: {} }); Boolean(document.querySelector('.tower-card[data-id=\"sparkcoil\"] .tc-buy'))")"
ok "civilian level-8 does NOT see the L10 FLAK POST buy button" "$($B eval "window.CBZShop.setProfile({ name: 'GOLDENQA', level: 8, xp: 0, nc: 50000, bt: 400, admin: false, owned: ['sentinel'], loadout: ['sentinel'], mapWins: {} }); !document.querySelector('.tower-card[data-id=\"flakpost\"] .tc-buy')")"
$B find first "#dialog-close" click; sleep 0.4
fi

if [ "$START_AT" -le 2 ] && [ "$STOP_AT" -ge 2 ]; then
echo "--- flow 2: the new shop cards + the repriced vault trio"
$B eval "window.CBZShop.setProfile({ name: 'GOLDENQA', level: 55, xp: 0, nc: 90000, bt: 900, admin: false, owned: ['sentinel'], loadout: ['sentinel'], mapWins: {} }); 'rich'" > /dev/null
$B find first "[data-menu=\"shop\"]" click; sleep 1.2
ok "THE VETERAN card renders with 8 tiers + TRI-WEAPON" "$($B eval "(document.querySelector('.tower-card[data-id=\"veteran\"]') || {textContent:''}).textContent.includes('8 TIERS') && (document.querySelector('.tower-card[data-id=\"veteran\"]') || {textContent:''}).textContent.includes('TRI-WEAPON')")"
ok "WAR BONDS card shows the BOND meter (12% + cap)" "$($B eval "(document.querySelector('.tower-card[data-id=\"warbonds\"]') || {textContent:''}).textContent.includes('BOND') && (document.querySelector('.tower-card[data-id=\"warbonds\"]') || {textContent:''}).textContent.includes('+12%/WAVE')")"
ok "WAR DRUMS card shows the FRAG meter" "$($B eval "(document.querySelector('.tower-card[data-id=\"wardrums\"]') || {textContent:''}).textContent.includes('FRAG') && (document.querySelector('.tower-card[data-id=\"wardrums\"]') || {textContent:''}).textContent.includes('35U')")"
ok "veteran decal renders on its card" "$($B eval "Boolean(document.querySelector('.tower-card[data-id=\"veteran\"] img.tw-art[src=\"assets/towers/veteran.png\"]'))")"
ok "veteran buy button shows the dual price" "$($B eval "(document.querySelector('.tower-card[data-id=\"veteran\"] .tc-buy') || {textContent:''}).textContent.includes('13,500')")"
$B eval "document.querySelector('.tower-card[data-id=\"veteran\"] .tc-buy').click(); 'armed'" > /dev/null; sleep 0.5
ok "first click arms the confirm state" "$($B eval "(document.querySelector('.tower-card[data-id=\"veteran\"] .tc-buy') || {textContent:''}).textContent.includes('CONFIRM PURCHASE?')")"
$B eval "document.querySelector('.tower-card[data-id=\"veteran\"] .tc-buy').click(); 'bought'" > /dev/null; sleep 0.9
ok "second click buys THE VETERAN (card flips to owned)" "$($B eval "Boolean(document.querySelector('.tower-card[data-id=\"veteran\"] .tc-equip'))")"
$B find first "[data-cat=\"__ult\"]" click; sleep 0.8
ok "vault trio: blossom 2 CORES / warden 1 CORE / warrant 3 CORES" "$($B eval "const t = (document.querySelector('#shop-ultimatum') || {textContent:''}).textContent; t.includes('CORPSE BLOSSOM') && t.includes('2 CORES') && t.includes('GRAVE WARDEN') && t.includes('1 CORE') && t.includes('DEATHWARRANT') && t.includes('3 CORES')")"
ok "warrant vault card declares the verdict (25% max hull)" "$($B eval "(document.querySelector('[data-ult-card=\"deathwarrant\"]') || {textContent:''}).textContent.includes('25%')")"
$B find first "#dialog-close" click; sleep 0.4
fi

if [ "$START_AT" -le 3 ] && [ "$STOP_AT" -ge 3 ]; then
echo "--- flow 3: live grid — gun switch + bond deposit/withdraw + field kits"
$B open "http://127.0.0.1:3111/?cbzwave=5&freeze=1&cash=99999" > /dev/null
$B wait --load networkidle; sleep 1.6
$B eval "window.CBZShop.setProfile({ name: 'GOLDENQA', level: 55, xp: 0, nc: 90000, bt: 900, admin: false, owned: ['sentinel','veteran','warbonds','wardrums','corpseblossom','deathwarrant'], loadout: ['veteran','warbonds','wardrums','deathwarrant','sentinel'], mapWins: {} }); 're-armed'" > /dev/null
sleep 0.4
$B find first "[data-menu=\"play\"]" click; sleep 0.5
$B find text "SOLO MAP RECON" click; sleep 0.4
$B find first ".map-card" click; sleep 0.4
$B find first "#deploy-mission" click; sleep 0.4
$B find first ".mode-card:not(.locked)" click
$B wait --fn "!document.querySelector('.vote-overlay')" --timeout 6000
$B wait --fn "document.querySelectorAll('.enemy').length >= 1" --timeout 15000
$B eval "(() => { const board = document.querySelector('#board'); const rect = board.getBoundingClientRect(); const scale = Math.min(rect.width/1000, rect.height/600); const ox = (rect.width - 1000*scale)/2; const oy = (rect.height - 600*scale)/2; const clicks = []; for (let gx = 60; gx <= 940; gx += 70) { for (let gy = 60; gy <= 540; gy += 70) clicks.push([rect.left + ox + gx*scale, rect.top + oy + gy*scale]); } window.__gClicks = clicks; window.__placeUntil = (n, entry) => { let guard = 0; const slot = document.querySelector('.lo-slot[data-tower=\"' + entry + '\"]'); slot.click(); while (document.querySelectorAll('.layer-towers .tower.tw-' + entry).length < n && guard < window.__gClicks.length) { const [x, y] = window.__gClicks[guard]; board.dispatchEvent(new MouseEvent('click', { clientX: x, clientY: y, bubbles: true })); guard++; } slot.click(); return document.querySelectorAll('.layer-towers .tower.tw-' + entry).length; }; return window.__gClicks.length; })()" > /dev/null
ok "THE VETERAN deploys with its tri-rail kit" "$($B eval "window.__placeUntil(1, 'veteran') >= 1 && Boolean(document.querySelector('.tw-veteran .tw-kit-trirail'))")"
$B eval "document.querySelector('.layer-towers .tower.tw-veteran').dispatchEvent(new MouseEvent('click', { bubbles: true })); 'panel'" > /dev/null; sleep 0.5
ok "veteran panel shows the WEAPON RACK (rifle active)" "$($B eval "(() => { const row = document.querySelector('.tp-abil-row.vet'); return Boolean(row) && row.textContent.includes('BATTLE RIFLE') && Boolean(row.querySelector('i.on')); })()")"
$B eval "document.querySelector('#tp-gun').click(); 'switched'" > /dev/null; sleep 0.5
ok "SWITCH GUN flips to the SCATTERGUN instantly" "$($B eval "(() => { const row = document.querySelector('.tp-abil-row.vet'); return Boolean(row) && Boolean(row.querySelector('i.on')) && row.querySelector('i.on').textContent === 'SCATTERGUN'; })()")"
$B eval "document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); 'esc'" > /dev/null; sleep 0.3
ok "WAR BONDS deploys with the vault kit" "$($B eval "window.__placeUntil(1, 'warbonds') >= 1 && Boolean(document.querySelector('.tw-warbonds .tw-kit-vault'))")"
$B eval "document.querySelector('.layer-towers .tower.tw-warbonds').dispatchEvent(new MouseEvent('click', { bubbles: true })); 'panel'" > /dev/null; sleep 0.5
$B eval "document.querySelector('#tp-deposit').click(); 'deposited'" > /dev/null; sleep 0.5
ok "DEPOSIT \$500 lands in the bond" "$($B eval "(document.querySelector('.tp-abil-row.bond') || {textContent:''}).textContent.includes('\$500 / \$3,000')")"
$B eval "document.querySelector('#tp-withdraw').click(); 'withdrew'" > /dev/null; sleep 0.5
ok "WITHDRAW empties the bond back to the wallet" "$($B eval "(document.querySelector('.tp-abil-row.bond') || {textContent:''}).textContent.includes('\$0 / \$3,000')")"
$B eval "document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); 'esc'" > /dev/null; sleep 0.3
ok "WAR DRUMS deploys with the drum kit" "$($B eval "window.__placeUntil(1, 'wardrums') >= 1 && Boolean(document.querySelector('.tw-wardrums .tw-kit-drumhead'))")"
ok "drums panel declares FRAG ROUNDS at 10%" "$($B eval "document.querySelector('.layer-towers .tower.tw-wardrums').dispatchEvent(new MouseEvent('click', { bubbles: true })); (document.querySelector('.tp-abil-row') || {textContent:''}).textContent.includes('FRAG ROUNDS')")"
$B eval "document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); 'esc'" > /dev/null; sleep 0.3
fi

if [ "$START_AT" -le 4 ] && [ "$STOP_AT" -ge 4 ]; then
echo "--- flow 4: THE DEATHWARRANT locks the beefiest hull and annihilates it"
ok "DEATHWARRANT deploys with the spire kit" "$($B eval "window.__placeUntil(1, 'deathwarrant') >= 1 && Boolean(document.querySelector('.tw-deathwarrant .tw-kit-spire'))")"
# Bash-side polling: long waits must never live inside a single eval (eval timeout).
STABLE="false"; LAST=""; SAME=0
for i in $(seq 1 45); do
  N=$($B eval "String(CBZCombat.stats().enemies)")
  if [ -n "$N" ] && [ "$N" = "$LAST" ] && [ "$N" != "0" ]; then SAME=$((SAME+1)); else SAME=0; fi
  LAST="$N"
  if [ "$SAME" -ge 2 ]; then STABLE="true"; break; fi
  sleep 2
done
$B eval "window.__warrantBefore = $LAST" > /dev/null
ok "wave spawn queue drains (enemies stable 4s: $LAST on the field)" "$STABLE"
CHARGE="false"
for i in $(seq 1 12); do
  R=$($B eval "Boolean(document.querySelector('.fx-warrant-ring') && document.querySelector('.fx-warrant-lock'))")
  if [ "$R" = "true" ]; then CHARGE="true"; break; fi
  sleep 1.5
done
ok "verdict charge begins (growing ring + lock reticle)" "$CHARGE"
ANNIH="false"
for i in $(seq 1 18); do
  R=$($B eval "CBZCombat.stats().enemies < window.__warrantBefore")
  if [ "$R" = "true" ]; then ANNIH="true"; break; fi
  sleep 2.5
done
ok "the annihilation lands (enemy count drops below the drained wave)" "$ANNIH"
ok "warrant panel declares the PAYLOAD row" "$($B eval "document.querySelector('.layer-towers .tower.tw-deathwarrant').dispatchEvent(new MouseEvent('click', { bubbles: true })); (document.querySelector('.tp-abil-row.warrant') || {textContent:''}).textContent.includes('NEXT VERDICT')")"
$B eval "document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); 'esc'" > /dev/null; sleep 0.3
fi

if [ "$START_AT" -le 5 ] && [ "$STOP_AT" -ge 5 ]; then
echo "--- flow 5: summon intel trimmed to the hull only (fresh page — one card per mission)"
$B open "http://127.0.0.1:3111/?cbzwave=5&freeze=1&cash=99999" > /dev/null
$B wait --load networkidle; sleep 1.6
$B eval "window.CBZShop.setProfile({ name: 'GOLDENQA', level: 55, xp: 0, nc: 90000, bt: 900, admin: false, owned: ['sentinel','veteran','corpseblossom'], loadout: ['corpseblossom','sentinel'], mapWins: {} }); 'blossom-armed'" > /dev/null; sleep 0.4
$B find first "[data-menu=\"play\"]" click; sleep 0.5
$B find text "SOLO MAP RECON" click; sleep 0.4
$B find first ".map-card" click; sleep 0.4
$B find first "#deploy-mission" click; sleep 0.4
$B find first ".mode-card:not(.locked)" click
$B wait --fn "!document.querySelector('.vote-overlay')" --timeout 6000
$B wait --fn "document.querySelectorAll('.enemy').length >= 1" --timeout 15000
$B eval "(() => { const board = document.querySelector('#board'); const rect = board.getBoundingClientRect(); const scale = Math.min(rect.width/1000, rect.height/600); const ox = (rect.width - 1000*scale)/2; const oy = (rect.height - 600*scale)/2; const clicks = []; for (let gx = 60; gx <= 940; gx += 70) { for (let gy = 60; gy <= 540; gy += 70) clicks.push([rect.left + ox + gx*scale, rect.top + oy + gy*scale]); } window.__gClicks = clicks; window.__placeUntil = (n, entry) => { let guard = 0; const slot = document.querySelector('.lo-slot[data-tower=\"' + entry + '\"]'); slot.click(); while (document.querySelectorAll('.layer-towers .tower.tw-' + entry).length < n && guard < window.__gClicks.length) { const [x, y] = window.__gClicks[guard]; board.dispatchEvent(new MouseEvent('click', { clientX: x, clientY: y, bubbles: true })); guard++; } slot.click(); return document.querySelectorAll('.layer-towers .tower.tw-' + entry).length; }; return window.__gClicks.length; })()" > /dev/null
ok "blossom placed beside the frozen lane" "$($B eval "window.__placeUntil(1, 'corpseblossom') >= 1")"
$B eval "document.querySelector('.layer-towers .tower.tw-corpseblossom').dispatchEvent(new MouseEvent('click', { bubbles: true })); 'panel'" > /dev/null; sleep 0.5
for i in 1 2 3 4 5 6; do $B eval "[...document.querySelectorAll('.tp-buy')].find((b) => !b.disabled)?.click(); 'tier'" > /dev/null; sleep 0.4; done
ok "blossom maxed (TRUE CORPSE BLOSSOM installed)" "$($B eval "[...document.querySelectorAll('.tp-up')].at(-1).textContent.includes('ONLINE')")"
$B eval "CBZCombat.stats().enemies; window.__summonBefore = CBZCombat.stats().friendliesAlive; 'counted'" > /dev/null
ok "vein kills raise a risen copy (friendly count climbs)" "$($B eval "new Promise((res) => { const t0 = Date.now(); const iv = setInterval(() => { if (CBZCombat.stats().friendliesAlive > 0) { clearInterval(iv); res(true); } else if (Date.now() - t0 > 25000) { clearInterval(iv); res(false); } }, 300); })")"
ok "risen hover card shows the hull and NOTHING else (no allegiance, no payload)" "$($B eval "(() => { const s = document.querySelector('.e-summon'); if (!s) return false; s.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true })); const tip = (document.querySelector('.enemy-tip') || {textContent:''}).textContent; return tip.includes('RISEN') && tip.includes('HP') && !tip.includes('ALLEGIANCE') && !tip.includes('CONTACT DMG') && !tip.includes('TARGETING'); })()")"
$B screenshot "$SS/qa-golden-final.png" > /dev/null
fi

pkill -f "node server.js" 2>/dev/null
echo ""
echo "QA RESULT: $PASS passed, $FAIL failed"
exit $((FAIL > 0 ? 1 : 0))
