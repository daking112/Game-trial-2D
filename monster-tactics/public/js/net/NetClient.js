// Thin WebSocket wrapper for the shared multiplayer world (see
// server/server.js). One connection per browser tab, kept alive for the
// whole session rather than reconnected every time the player walks into
// and out of their plot - WorldScene owns *when* to connect, everything
// else (BattleScene reporting a layout/wave update) just calls send() on
// whatever connection is already open. A plain event-emitter (on/off/emit)
// rather than exposing the raw WebSocket, so scenes never touch JSON
// parsing directly.
const CLIENT_ID_STORAGE_KEY = 'monster-tactics:clientId';

const NetClient = {
  ws: null,
  id: null, // ephemeral per-connection id from the server - changes on every reconnect, fine for avatar/position tracking
  clientId: null, // persistent per-browser id - see loadOrCreateClientId; this is what plot ownership is tracked by
  name: null,
  connected: false,
  lastSnapshot: null,
  handlers: {},
  connectPromise: null,

  // A random id saved to localStorage the first time this browser connects,
  // reused on every future connection - this is what lets "press E to enter
  // your base" keep recognizing a plot as yours across a reconnect (a page
  // refresh, a brief network drop, a laptop sleeping). Before this existed,
  // plot ownership was tracked by the ephemeral per-connection `id` the
  // server hands out fresh on every connection, so any reconnect silently
  // orphaned your own base - it was still there, still labeled with your
  // name, but the game no longer recognized it as yours to enter.
  loadOrCreateClientId() {
    try {
      let id = localStorage.getItem(CLIENT_ID_STORAGE_KEY);
      if (!id) {
        id = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
        localStorage.setItem(CLIENT_ID_STORAGE_KEY, id);
      }
      return id;
    } catch (e) {
      // localStorage unavailable (private mode, etc) - falls back to a
      // fresh id every connection, same orphaning risk as before for this
      // one browser, but never throws.
      return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
  },

  wsUrl() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    if (!this.clientId) this.clientId = this.loadOrCreateClientId();
    return `${proto}//${location.host}/ws?clientId=${encodeURIComponent(this.clientId)}`;
  },

  // Resolves with the server's initial snapshot. Safe to call repeatedly -
  // if already connected it resolves immediately with the last snapshot
  // rather than opening a second socket; callers that need fresh data after
  // being away (e.g. re-entering WorldScene from a battle) should follow up
  // with requestState() rather than calling connect() again.
  connect() {
    if (this.connected) return Promise.resolve(this.lastSnapshot);
    if (this.connectPromise) return this.connectPromise;

    this.connectPromise = new Promise((resolve, reject) => {
      let settled = false;
      let ws;
      try {
        ws = new WebSocket(this.wsUrl());
      } catch (e) {
        this.connectPromise = null;
        reject(e);
        return;
      }
      this.ws = ws;

      ws.onmessage = (evt) => {
        let msg;
        try { msg = JSON.parse(evt.data); } catch (e) { return; }
        if (!msg || typeof msg.type !== 'string') return;

        if (msg.type === 'welcome' && !settled) {
          settled = true;
          this.id = msg.id;
          this.name = msg.name;
          this.connected = true;
          this.lastSnapshot = msg;
          resolve(msg);
        }
        if (msg.type === 'state') this.lastSnapshot = msg;
        this.emit(msg.type, msg);
      };

      ws.onclose = () => {
        this.connected = false;
        this.connectPromise = null;
        this.emit('disconnected', {});
        if (!settled) { settled = true; reject(new Error('connection closed before handshake')); }
      };

      ws.onerror = () => {
        if (!settled) { settled = true; reject(new Error('websocket error')); }
      };
    });

    return this.connectPromise;
  },

  requestState() {
    this.send('requestState');
  },

  on(type, cb) {
    (this.handlers[type] || (this.handlers[type] = [])).push(cb);
  },

  off(type, cb) {
    if (!this.handlers[type]) return;
    this.handlers[type] = this.handlers[type].filter(h => h !== cb);
  },

  emit(type, msg) {
    (this.handlers[type] || []).forEach(cb => cb(msg));
  },

  send(type, payload = {}) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, ...payload }));
    }
  }
};
