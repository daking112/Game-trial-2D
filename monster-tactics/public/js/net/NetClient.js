// Thin WebSocket wrapper for the shared multiplayer world (see
// server/server.js). One connection per browser tab, kept alive for the
// whole session rather than reconnected every time the player walks into
// and out of their plot - WorldScene owns *when* to connect, everything
// else (BattleScene reporting a layout/wave update) just calls send() on
// whatever connection is already open. A plain event-emitter (on/off/emit)
// rather than exposing the raw WebSocket, so scenes never touch JSON
// parsing directly.
const NetClient = {
  ws: null,
  id: null,
  name: null,
  connected: false,
  lastSnapshot: null,
  handlers: {},
  connectPromise: null,

  wsUrl() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${location.host}/ws`;
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
