// Online rooms client: a thin WebSocket wrapper for the server's /rooms/ws endpoint. No DOM, no globals
// except the defaults below, so Node can drive it in tests (inject WebSocketCtor and timers).
// Protocol: JSON text frames with a `t` field. First frame is {t:'auth', token}. The server answers `hello`,
// then `room` / `snap` / `ev` / `end` / `err` / `pong`. After a drop we reconnect with the same token for up to
// `reconnectMs` (the server keeps the seat for 60 s).

// Relative to the page, so a rotating hostname or a sub-path never breaks it.
export function roomsUrl(href) {
  const u = new URL('rooms/ws', href);
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
  return u.href;
}

// Player actions as wire messages, in one place so the view and the tests agree.
export const intents = {
  place: (id, x, y) => ({ t: 'place', id, x, y }),
  upgrade: (uid) => ({ t: 'upgrade', uid }),
  sell: (uid) => ({ t: 'sell', uid }),
  cast: (uid, kind) => ({ t: 'cast', uid, kind }),
  nuke: (x, y) => ({ t: 'nuke', x, y }),
};

export function createRoomClient({ url, token, WebSocketCtor = globalThis.WebSocket, reconnectMs = 60000, retryMs = 1500, pingMs = 20000, setTimer = setTimeout, clearTimer = clearTimeout, now = Date.now }) {
  const handlers = new Map();
  let ws = null;
  let authed = false;
  let closing = false;
  let downSince = null;
  let retryTimer = null;
  let pingTimer = null;

  const emit = (type, msg) => { for (const fn of [...(handlers.get(type) || [])]) fn(msg); };
  const on = (type, fn) => {
    if (!handlers.has(type)) handlers.set(type, new Set());
    handlers.get(type).add(fn);
    return () => handlers.get(type).delete(fn);
  };
  const raw = (msg) => { ws.send(JSON.stringify(msg)); };
  const send = (msg) => {
    if (!ws || !authed || ws.readyState !== 1) return false; // intents are dropped, not queued: a late place would surprise the player
    raw(msg);
    return true;
  };

  function stopPing() { if (pingTimer) { clearTimer(pingTimer); pingTimer = null; } }
  function schedulePing() {
    stopPing();
    pingTimer = setTimer(() => { send({ t: 'ping' }); schedulePing(); }, pingMs);
  }

  function connect() {
    retryTimer = null;
    ws = new WebSocketCtor(url);
    ws.onopen = () => {
      raw({ t: 'auth', token }); // the first frame must be auth (5 s window on the server)
    };
    ws.onmessage = (event) => {
      let msg;
      try { msg = JSON.parse(String(event.data)); } catch { return; }
      if (!msg || typeof msg.t !== 'string') return;
      if (msg.t === 'hello') {
        const wasDown = downSince !== null;
        authed = true;
        downSince = null;
        schedulePing();
        emit(wasDown ? 'reconnected' : 'open', msg);
      }
      emit(msg.t, msg);
    };
    ws.onclose = (event) => {
      authed = false;
      stopPing();
      if (closing) { emit('close', event); return; }
      if (downSince === null) downSince = now();
      // 1008 = refused (bad token / policy): retrying cannot help.
      const refused = event && event.code === 1008;
      if (refused || now() - downSince > reconnectMs) { emit('gone', event); return; }
      emit('reconnecting', event);
      retryTimer = setTimer(connect, retryMs);
    };
    ws.onerror = () => {}; // onclose follows and does the work
  }

  function close() {
    closing = true;
    if (retryTimer) clearTimer(retryTimer);
    stopPing();
    if (ws) ws.close();
  }

  const lobby = {
    create: (map, mode) => send({ t: 'create', map, mode }),
    join: (code) => send({ t: 'join', code: String(code).trim().toUpperCase() }),
    leave: () => send({ t: 'leave' }),
    config: (cfg) => send({ t: 'config', ...cfg }),
    ready: (ready = true) => send({ t: 'ready', ready }),
    start: () => send({ t: 'start' }),
    vote: (mode) => send({ t: 'vote', mode }),
    again: () => send({ t: 'again' }),
  };

  return { connect, close, on, send, isOpen: () => authed, ...lobby };
}
