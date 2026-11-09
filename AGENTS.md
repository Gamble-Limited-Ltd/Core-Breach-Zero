# AGENTS.md

Rules for every agent and human working on Core Breach: Zero. Read this first, every session. If something here is wrong, fix it in the same commit.

## The project
- Browser tower defense game created and owned by Jackson Loomis (`jacksonloomis-commits`), who owns it. Gamble Limited Ltd (GLL, James `TheGeneral4757`) hosts it and helps with hosting, tests, CI, docs and security.
- Stack: plain browser JavaScript, no build step. Node server (`server.js`) with `ws` for rooms. Accounts live in `accounts.json` (not in git).
- License: PolyForm Noncommercial 1.0.0 (`LICENSE`). The author keeps the copyright (`NOTICE`). Play money only: no real-money features, no ads.

## File map
- `index.html`, `styles.css`: the page and styling.
- `app.js`: menus, accounts, rooms, offline LOCAL mode. It is an ES module now; data moved to `src/app/update-log.js` (BUILD + UPDATE_LOG), `src/app/progression.js` (salvage codes, achievements, perks) and `src/app/maps.js` (battle maps). Golden-seal math lives once, in `src/shop/data.js`. `combat.js` and `src/shop/ui.js` still read some `app.js` names as globals: the bridge is the `Object.assign(window, ...)` block at the end of `app.js`. Add a name there when a classic script needs it.
- Hosted builds: if the server answers `GET /api/hosted` with `{ok:true}`, `app.js` skips the old PLAY MENU room lanes (own room service, P2P, relay) and opens SOLO MAP RECON; ONLINE ROOMS is the multiplayer there. The game's own `server.js` has no such route, so it behaves as before.
- `src/sim/core.js`: the combat rules (waves, enemies, towers, projectiles, intents like `placeTower`/`buyTrack`/`sellTower`/`cast*`, `simStep(dt)`, `startSim`/`launchSim`/`simStats`). No DOM, no rAF, no clock reads: a Node host can import it. It holds `state` (a live `export let` binding; the browser keeps the one default, a multi-room Node host makes one per room with `createState(seed)` and rebinds with `useState(s)` before each synchronous step or intent, which also installs the room's own rng from `src/sim/rng.js` `createRng`/`useRng`; `view` and `env` stay module-wide, so the host points its handlers at the current room's event buffer and sets `env.roomPlayers` per step), the `view` handler table, `emit()`, and `env` (what the page used to give through globals: `env.perks.has`, `env.roomPlayers`, `env.debugWave`, `env.debugFreeze`, `env.coopGuest`, `env.guestIntent`). Sim code must never touch `document`, `window`, `ui`, `svgNode`, timers or `Math.random` (use `rand()` from `src/sim/rng.js`); report anything visible with `emit(type, ...)`. Events: `ring float banner sound nuke purge scream bloom flash toast hud boss tipHide panel panelLive panelClose nukeAim nukeBtn range end coreHit line burst wasteOn wasteOff towerAdd towerDrop`. A new event needs a handler in `combat.js` (`view`); a headless host registers none. Map tracks are sampled by `src/sim/track.js` (no DOM; absolute M/H/V/L/Q only, throws on other commands).
- `combat.js`: the view and input of the in-match game (an ES module wrapping one IIFE): `ui` holds DOM handles, pointer and build-mode fields; `view` handlers draw sim events; `renderProjectiles`/`renderEnemies`/`renderTowers`/`makeTowerView`/`towerNodeOf` map plain-data entities to SVG; HUD, tips, vote, end panel, tower panel, build ghost, co-op glue. The co-op guest path (`guestSync`) still keeps its own `node` on guest enemies and towers; it goes away with the old multiplayer. `src/combat/data.js`: enemy roster, wave ladders per protocol, mode curves, foundry and tower rules, nuke constants (pure data).
- `src/rooms/`: the browser client for the server-run online rooms (`/rooms/ws`, JSON frames; the host repo documents the protocol). `client.js` is a pure WebSocket wrapper (auth first frame, ping, reconnect with the same token for 60 s, intent encoders; injectable WebSocket for tests). `map.js` turns `snap` frames into plain-data enemies, towers and projectiles (kept by id, eased between 12 Hz snapshots) and resolves `ev` entries. `view.js` is the lobby in the menu dialog plus the mission glue; it sets `window.CBZRooms`. The only hook in `combat.js` is `online` (set by `CBZCombat.startOnline(map, { intent, frame, abort })`): `tick` skips `simStep` and calls `frame`, `env.guestIntent`, the board click (place, nuke) and the tower panel casts send intents instead of acting, and `restoreRecon` clears it. The sim never runs in the browser during an online mission. `scripts/rooms-client-test.js` runs in `npm test`; `scripts/rooms-e2e.mjs <host-dir>` is a manual check against a running room host.
- `src/shop/data.js`: shop data (tower catalog, categories, ULTIMATUM cards, XP curve), pure, no DOM. `src/shop/ui.js`: the Nexus Shop screen (ES module, still sets `window.CBZShop`). The economy is mirrored in `server.js`: keep them in sync.
- Code split in progress: new code goes in ES modules under `src/` (native `import`/`export`, no bundler). `/src/` is served with revalidation, so imports need no `?v=`.
- `server.js`: static files (ETag, gzip, Cache-Control: `?v=` assets are immutable, html revalidates, art caches a day), account/shop/room API, WebSocket rooms.
- `scripts/golden-run.js`: determinism harness for the combat sim in the browser (seeded RNG, fake clock, 3600 frames, compared with `scripts/golden/solo-easy.json`). Dev tool, needs Playwright (see header); run it before and after any change to sim code, plain and with `--tower=lazermortar` (second golden, covers shells). `GOLDEN_QUERY='&cbzwave=14'` explores other waves with the node-count check only (do not `--update`). Update the golden only for an intended balance change (`--update`).
- `scripts/`: tests (`*-test.js`; `sim-test.js` covers rng and tracks, `sim-intents-test.js` drives the intents headless, `golden-node.js` replays the browser golden through `src/sim/core.js` in Node and must match it, `sim-rooms-test.js` checks that two interleaved missions with different seeds each equal their solo run, `rooms-client-test.js` covers the online rooms client and snapshot mapper; all five run in `npm test` without a browser), `run-tests.js` (what `npm test` runs), `qa-*.sh` browser QA.
- `terms.html`: draft Terms of Service.

## Run and test
- `npm install`, then `npm start` (port 3000, or `PORT=...`).
- `npm test` runs every test on its own throwaway server and accounts file. It must pass before you push.
- `main` is production and the author pushes straight to `main`. So run `npm test` first, every time. Do not push broken code.

## Rules that keep it hostable
- Use relative URLs only. No hardcoded hostnames (the production domain rotates daily).
- Never commit secrets, keys or passwords. The admin key code is the `ADMIN_KEY_CODE` environment variable (see `.env.example`). `.env` and `accounts*.json` stay out of git.
- Do not serve new private files from the root: `server.js` refuses dotfiles and `accounts*.json`; keep it that way.
- Account linking and leaderboards must stay open-ended: do not hardcode the account model or score storage in a way that blocks a future leaderboard or GLL ID/GATE login.
- Keep the glowing home-screen menus and their look.
- Keep `README.md`, `AGENTS.md` and `CLAUDE.md` current in the same commit as the change.
- Tower art is 512px WebP in `assets/towers/`; keep new art at that size and format.
- Bump the `?v=` cache-bust string in `index.html` when you change `app.js`, `combat.js`, `src/shop/ui.js` or `styles.css`.

## Working together
- GLL may open issues and PRs on GitHub. The author replies there.
- Found a bug? Open an issue and say what you saw and how to repeat it.
- Credit line (home footer, login card, About menu, README, Terms): "Game created and owned by Jackson Loomis. Hosted and assisted by Gamble Limited Ltd." Keep it readable, never on in-match screens or near the main logo.
