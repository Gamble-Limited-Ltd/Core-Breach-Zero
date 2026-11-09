// Online rooms screen: lobby in the menu dialog, then the mission on the normal battlefield. The server runs the
// sim; this file only shows what it sends and ships intents back. Sets window.CBZRooms = { open(container) }.
import { createRoomClient, roomsUrl } from './client.js';
import { createMirror, eventArgs } from './map.js';
import { state, emit } from '../sim/core.js';
import { ENEMY_TYPES } from '../combat/data.js';
import { TOWERS } from '../shop/data.js';

const MODES = ['easy', 'medium', 'hard', 'insane'];
const esc = (v) => window.escapeHtml(String(v));

let client = null;
let room = null; // latest `room` frame
let notice = '';
let inMission = false;
let ended = false;
let baseline = null; // wallet before the mission, to show what the server paid
let host = null; // element the lobby renders into
const mirror = createMirror(TOWERS, ENEMY_TYPES);

function token() { return window.cbzToken || ''; }

function ensureClient() {
  if (client) return;
  client = createRoomClient({ url: roomsUrl(location.href), token: token() });
  client.on('open', () => { notice = ''; paint(); });
  client.on('reconnecting', () => { notice = 'LINK LOST // RECONNECTING...'; paint(); });
  client.on('reconnected', () => { notice = ''; paint(); });
  client.on('gone', () => { notice = 'DISCONNECTED FROM THE ROOM SERVER.'; client = null; room = null; leaveMission(); paint(); });
  client.on('err', (m) => { notice = String(m.error || 'Request refused.'); window.showToast(notice); paint(); });
  client.on('room', onRoom);
  client.on('snap', onSnap);
  client.on('ev', (m) => { if (!inMission) return; for (const ev of m.ev || []) { const args = eventArgs(state, ev); if (args) emit(...args); } });
  client.on('end', onEnd);
  client.connect();
}

function onRoom(msg) {
  room = msg;
  if (msg.phase === 'running' && !inMission) startMission();
  if (inMission && msg.mode) setProtocol(msg.mode);
  if (msg.phase === 'lobby' && ended) return; // keep the result panel up until the player leaves it
  paint();
}

let dirty = false;
function onSnap(snap) {
  if (snap.ph === 'vote') { if (room) room.voteLeft = snap.vote; paintVoteClock(snap.vote); return; }
  // The server sends no `room` frame when the vote ends, so the first running snapshot starts the mission.
  if (snap.ph === 'running' && room && !inMission) { room.phase = 'running'; startMission(); }
  if (!inMission) return;
  const { changed } = mirror.apply(state, snap);
  for (const t of changed) emit('panelLive', t);
  dirty = true;
}

function startMission() {
  const map = window.BATTLE_MAPS[room.map];
  if (!map || !window.CBZCombat) return;
  mirror.reset();
  inMission = true;
  ended = false;
  const profile = window.CBZShop ? CBZShop.profile() : {};
  baseline = { nc: profile.nc || 0, bt: profile.bt || 0, level: profile.level || 1 };
  window.openBattlefield(map);
  document.querySelector('#deploy-mission').hidden = true;
  CBZCombat.startOnline(map, {
    intent: (msg) => client && client.send(msg),
    frame: (dt) => { mirror.smooth(state, dt); const d = dirty; dirty = false; return d; },
    abort: () => { if (!ended && client) { client.leave(); room = null; } leaveMission(); }, // after the result the player stays in the room
  });
  setProtocol(room.mode);
}

function setProtocol(mode) {
  state.protocol = mode;
  const el = document.querySelector('#combat-protocol');
  if (el) el.textContent = String(mode).toUpperCase();
}

function leaveMission() { inMission = false; ended = false; mirror.reset(); }

async function onEnd(msg) {
  if (!inMission) return;
  ended = true;
  state.mode = 'over';
  const panel = document.createElement('div');
  panel.className = `mission-end ${msg.win ? 'win' : 'lose'}`;
  panel.innerHTML = `
    <div class="end-card">
      <div class="eyebrow">${msg.win ? '// PROTOCOL COMPLETE' : '// CORE LOST'}</div>
      <h2>${msg.win ? 'SECTOR CLEARED' : 'CORE BREACHED'}</h2>
      <div class="end-stats">
        <div><span>OUTCOME</span><b>${msg.win ? `ALL ${msg.waves} WAVES REPELLED` : `FELL ON WAVE ${msg.wave}`}</b></div>
        <div><span>ELIMINATIONS</span><b>${msg.kills}</b></div>
        <div><span>SALVAGE EARNED</span><b>$${msg.earned}</b></div>
        <div><span>BASE INTEGRITY</span><b>${Math.round(msg.base)}</b></div>
        <div><span>COMMANDERS</span><b>${esc((msg.players || []).join(', '))}</b></div>
      </div>
      <div class="end-rewards" id="end-rewards"></div>
      <div class="end-actions"><button class="inline-button" id="end-room" type="button">BACK TO ROOM</button></div>
    </div>`;
  document.querySelector('#battlefield').appendChild(panel);
  panel.querySelector('#end-room').addEventListener('click', () => { window.exitBattlefield(); leaveMission(); window.openMenu('online'); });
  // The server pays before or just after this frame; read the wallet now and once more shortly after.
  for (const delay of [0, 2000]) {
    await new Promise((r) => setTimeout(r, delay));
    await window.loadProfile();
    paintRewards(panel);
  }
}

function paintRewards(panel) {
  const box = panel.querySelector('#end-rewards');
  if (!box || !window.CBZShop) return;
  const p = CBZShop.profile();
  const nc = (p.nc || 0) - baseline.nc;
  const bt = (p.bt || 0) - baseline.bt;
  const rows = [
    `<div class="payout-row payout-nc"><span>NEXUS COINS</span><b>+${nc} NC</b></div>`,
    bt > 0 ? `<div class="payout-row payout-bt"><span>BREACH TOKENS</span><b>+${bt} BT</b></div>` : '',
    (p.level || 1) > baseline.level ? `<div class="payout-row payout-lvl"><span>CLEARANCE LEVEL UP</span><b>LV ${p.level}</b></div>` : '',
  ];
  box.innerHTML = `<div class="payout-head">// NEXUS TRANSFER COMPLETE</div>${rows.join('')}`;
  box.classList.add('on');
}

// --- Lobby ------------------------------------------------------------------------------------------
function paintVoteClock(secs) {
  const el = host && host.querySelector('#rooms-vote-clock');
  if (el) el.textContent = `${secs}s`;
}

function paint() {
  if (!host || !host.isConnected) return;
  const maps = Object.values(window.BATTLE_MAPS).filter((m) => !m.event && m.id !== 'cbz');
  const note = notice ? `<p class="standby-note">${esc(notice)}</p>` : '';
  if (!room) {
    // Repaints (link open, notices) must not wipe what the player already typed or picked.
    const keep = Object.fromEntries(['#rooms-code', '#rooms-map', '#rooms-mode'].map((id) => [id, host.querySelector(id)?.value]));
    host.innerHTML = `
      <div class="lobby-grid">
        <section class="config-panel">
          <h3>CREATE A ROOM</h3>
          <p class="dialog-copy">Up to four commanders. The server runs the mission; you need to be logged in.</p>
          <select id="rooms-map" class="inline-button" aria-label="Map">${maps.map((m) => `<option value="${esc(m.id)}">${esc(m.name)}</option>`).join('')}</select>
          <select id="rooms-mode" class="inline-button" aria-label="Combat protocol">${MODES.map((m) => `<option value="${m}">${m.toUpperCase()}</option>`).join('')}</select>
          <button class="start-button" id="rooms-create" type="button">CREATE ROOM <span>→</span></button>
        </section>
        <section class="config-panel">
          <h3>JOIN BY CODE</h3>
          <input id="rooms-code" maxlength="8" placeholder="ROOM CODE" aria-label="Room code" autocomplete="off">
          <button class="start-button" id="rooms-join" type="button">JOIN <span>→</span></button>
        </section>
      </div>${note}`;
    for (const [id, v] of Object.entries(keep)) if (v !== undefined) host.querySelector(id).value = v;
    // send() drops frames until the link is authenticated: say so instead of doing nothing.
    const act = (fn) => { if (client && fn()) return; notice = 'CONNECTING TO THE ROOM SERVER... TRY AGAIN IN A MOMENT.'; paint(); };
    host.querySelector('#rooms-create').onclick = () => act(() => client.create(host.querySelector('#rooms-map').value, host.querySelector('#rooms-mode').value));
    host.querySelector('#rooms-join').onclick = () => act(() => client.join(host.querySelector('#rooms-code').value));
    return;
  }
  const me = window.myName;
  const lead = room.owner === me;
  const mine = room.members.find((m) => m.name === me);
  const roster = room.members.map((m) => `
    <li class="${m.name === me ? 'you' : ''}"><span class="slot-tag">${m.name === me ? 'YOU' : 'ALLY'}</span><strong>${esc(m.name)}</strong>
      <em class="${m.name === room.owner ? 'host-tag' : 'crew-tag'}">${m.name === room.owner ? 'ROOM LEAD' : m.ready ? 'READY' : 'NOT READY'}${m.online ? '' : ' // OFFLINE'}</em></li>`).join('');
  let action = '';
  if (room.phase === 'lobby') {
    action = lead
      ? `<select id="rooms-cfg-map" class="inline-button" aria-label="Map">${maps.map((m) => `<option value="${esc(m.id)}"${m.id === room.map ? ' selected' : ''}>${esc(m.name)}</option>`).join('')}</select>
         <select id="rooms-cfg-mode" class="inline-button" aria-label="Combat protocol">${MODES.map((m) => `<option value="${m}"${m === room.mode ? ' selected' : ''}>${m.toUpperCase()}</option>`).join('')}</select>
         <button class="start-button" id="rooms-start" type="button">START <span>→</span></button>`
      : `<p class="standby-note">MAP ${esc(room.map.toUpperCase())} // ${esc(room.mode.toUpperCase())}</p>
         <button class="start-button" id="rooms-ready" type="button">${mine && mine.ready ? 'NOT READY' : 'READY'}</button>`;
  } else if (room.phase === 'vote') {
    action = `<p class="standby-note">VOTE THE COMBAT PROTOCOL // <b id="rooms-vote-clock">${room.voteLeft || ''}</b></p>
      <div class="mode-grid">${MODES.map((m) => `<button class="mode-card" type="button" data-vote="${m}"><b>${m.toUpperCase()}</b></button>`).join('')}</div>`;
  } else if (room.phase === 'over') {
    action = lead ? '<button class="start-button" id="rooms-again" type="button">PLAY AGAIN <span>→</span></button>' : '<p class="standby-note">WAITING FOR THE ROOM LEAD.</p>';
  } else {
    action = '<p class="standby-note">MISSION IN PROGRESS</p>';
  }
  host.innerHTML = `
    <div class="lobby-grid">
      <section class="roster-panel"><h3>ROOM ${esc(room.code)}</h3><ul class="roster-list">${roster}</ul>
        <button class="ghost-button" id="rooms-leave" type="button">LEAVE ROOM</button></section>
      <section class="config-panel"><h3>${esc(room.phase.toUpperCase())}</h3>${action}</section>
    </div>${note}`;
  const $ = (id) => host.querySelector(id);
  $('#rooms-leave').onclick = () => { client.leave(); room = null; paint(); };
  if ($('#rooms-start')) $('#rooms-start').onclick = () => client.start();
  if ($('#rooms-ready')) $('#rooms-ready').onclick = () => client.ready(!(mine && mine.ready));
  if ($('#rooms-again')) $('#rooms-again').onclick = () => client.again();
  if ($('#rooms-cfg-map')) $('#rooms-cfg-map').onchange = (e) => client.config({ map: e.target.value });
  if ($('#rooms-cfg-mode')) $('#rooms-cfg-mode').onchange = (e) => client.config({ mode: e.target.value });
  host.querySelectorAll('[data-vote]').forEach((b) => { b.onclick = () => client.vote(b.dataset.vote); });
}

window.CBZRooms = {
  close() { host = null; }, // another menu took the dialog: late link events must not repaint over it
  open(container) {
    host = container;
    if (!token()) { notice = 'LOG IN FIRST: rooms need a commander account.'; client = null; room = null; paint(); return; }
    notice = '';
    ensureClient();
    paint();
  },
};
