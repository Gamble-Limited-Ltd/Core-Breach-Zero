# AGENTS.md

Rules for every agent and human working on Core Breach: Zero. Read this first, every session. If something here is wrong, fix it in the same commit.

## The project
- Browser tower defense game by Loomis (`jacksonloomis-commits`), who owns it. Gamble Limited Ltd (GLL, James `TheGeneral4757`) hosts it and helps with hosting, tests, CI, docs and security.
- Stack: plain browser JavaScript, no build step. Node server (`server.js`) with `ws` for rooms. Accounts live in `accounts.json` (not in git).
- License: PolyForm Noncommercial 1.0.0 (`LICENSE`). The author keeps the copyright (`NOTICE`). Play money only: no real-money features, no ads.

## File map
- `index.html`, `styles.css`: the page and styling.
- `app.js`: menus, accounts, rooms, offline LOCAL mode.
- `combat.js`: the in-match game.
- `shop.js`: the Nexus Shop UI (economy is mirrored in `server.js`: keep them in sync).
- `server.js`: static files, account/shop/room API, WebSocket rooms.
- `scripts/`: tests (`*-test.js`), `run-tests.js` (what `npm test` runs), `qa-*.sh` browser QA.
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
- Bump the `?v=` cache-bust string in `index.html` when you change `app.js`, `combat.js`, `shop.js` or `styles.css`.

## Working together
- GLL may open issues and PRs on GitHub. The author replies there.
- Found a bug? Open an issue and say what you saw and how to repeat it.
