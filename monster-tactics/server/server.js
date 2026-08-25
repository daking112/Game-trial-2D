// Shared multiplayer world server for the "zombs.io-style" overworld
// (see WorldScene.js / net/NetClient.js on the client side). Deliberately
// thin: this process is authoritative ONLY for who's connected, where their
// avatar is, and who owns which plot - it does not simulate combat at all.
// Combat stays entirely client-side inside BattleScene exactly as it already
// worked in single-player; a plot's owner just reports the outcome (their
// tower layout, and wave-cleared events) here so everyone else's WorldScene
// can render a live preview of it. See monster-tactics/README.md for the
// reasoning ("client-trusted combat now, harden later if it matters").
//
// Also serves public/ as plain static files, so `npm start` is the one
// command that runs the whole game (both single-player, which needs no
// server at all, and the multiplayer world, which does).

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8080;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8'
};

const httpServer = http.createServer((req, res) => {
  const requestPath = decodeURIComponent(req.url.split('?')[0]);
  const relative = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '');
  const filePath = path.join(PUBLIC_DIR, relative);

  // Refuse anything that resolves outside public/ (e.g. "..%2f..%2f").
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

// ---------- shared world state ----------

const WORLD_WIDTH = 3200;
const WORLD_HEIGHT = 2000;
const PLOT_COUNT = 12;
const PLOT_COLS = 4;
const PLOT_ORIGIN_X = 420;
const PLOT_ORIGIN_Y = 400;
const PLOT_SPACING_X = 620;
const PLOT_SPACING_Y = 520;
const WORLD_WAVE_INTERVAL_MS = 45000;
// Layout snapshots are player-reported "here's what my grid looks like"
// data, not simulated here - cap defensively so one client can't send an
// arbitrarily large payload to broadcast to the whole room.
const MAX_LAYOUT_CELLS = 200;

function plotPosition(index) {
  const col = index % PLOT_COLS;
  const row = Math.floor(index / PLOT_COLS);
  return { x: PLOT_ORIGIN_X + col * PLOT_SPACING_X, y: PLOT_ORIGIN_Y + row * PLOT_SPACING_Y };
}

const plots = Array.from({ length: PLOT_COUNT }, (_, i) => ({
  id: i, ownerId: null, ownerName: null, layout: [], wave: 0, ...plotPosition(i)
}));

const players = new Map(); // id -> { id, name, x, y, ws }
let nextPlayerId = 1;
let worldWave = 1;
let worldWaveDeadline = Date.now() + WORLD_WAVE_INTERVAL_MS;

// All-time top runs, across every connected player, single-player and
// multiplayer-plot alike - the one piece of cross-player visibility this
// game had none of before. In-memory only (see README) - resets if the
// server process restarts, same as the shared-world state above.
const LEADERBOARD_MAX = 25;
let leaderboard = [];

function submitScore(playerName, entry) {
  leaderboard.push({
    name: playerName,
    score: Math.max(0, Math.floor(Number(entry.score) || 0)),
    stageReached: Math.max(0, Math.floor(Number(entry.stageReached) || 0)),
    wave: Math.max(0, Math.floor(Number(entry.wave) || 0)),
    mode: entry.mode === 'plot' ? 'plot' : 'run',
    outcome: entry.outcome === 'victory' ? 'victory' : 'ended',
    at: Date.now()
  });
  leaderboard.sort((a, b) => b.score - a.score);
  leaderboard = leaderboard.slice(0, LEADERBOARD_MAX);
  broadcast({ type: 'leaderboard', leaderboard });
}

function publicPlayer(p) {
  return { id: p.id, name: p.name, x: p.x, y: p.y };
}

function publicPlot(p) {
  return { id: p.id, ownerId: p.ownerId, ownerName: p.ownerName, layout: p.layout, wave: p.wave, x: p.x, y: p.y };
}

function snapshotFor(playerId, name) {
  return {
    id: playerId,
    name,
    players: Array.from(players.values()).map(publicPlayer),
    plots: plots.map(publicPlot),
    worldWidth: WORLD_WIDTH,
    worldHeight: WORLD_HEIGHT,
    worldWave,
    worldWaveDeadline,
    leaderboard
  };
}

function send(ws, msg) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function broadcast(msg, exceptId) {
  const data = JSON.stringify(msg);
  for (const p of players.values()) {
    if (p.id === exceptId) continue;
    if (p.ws.readyState === p.ws.OPEN) p.ws.send(data);
  }
}

wss.on('connection', (ws) => {
  const id = nextPlayerId++;
  const name = `Tamer${id}`;
  // Open ground below the plot grid (last row bottoms out around y=1640,
  // see plotPosition) rather than the map's literal center, which sits
  // right on top of a middle plot - a new player's very first frame
  // shouldn't already be standing inside someone's claimed base.
  const player = {
    id, name, ws,
    x: WORLD_WIDTH / 2 + (Math.random() - 0.5) * 400,
    y: WORLD_HEIGHT - 150 + (Math.random() - 0.5) * 100
  };
  players.set(id, player);

  send(ws, { type: 'welcome', ...snapshotFor(id, name) });
  broadcast({ type: 'playerJoined', player: publicPlayer(player) }, id);

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch (e) { return; }
    if (!msg || typeof msg.type !== 'string') return;

    switch (msg.type) {
      case 'requestState':
        send(ws, { type: 'state', ...snapshotFor(id, name) });
        break;

      case 'move': {
        if (typeof msg.x !== 'number' || typeof msg.y !== 'number') return;
        player.x = Math.max(0, Math.min(WORLD_WIDTH, msg.x));
        player.y = Math.max(0, Math.min(WORLD_HEIGHT, msg.y));
        broadcast({ type: 'playerMoved', id, x: player.x, y: player.y }, id);
        break;
      }

      case 'claimPlot': {
        const plot = plots[msg.plotId];
        if (plot && !plot.ownerId) {
          plot.ownerId = id;
          plot.ownerName = player.name;
          broadcast({ type: 'plotClaimed', plotId: plot.id, ownerId: id, ownerName: player.name });
        }
        break;
      }

      case 'plotLayout': {
        const plot = plots[msg.plotId];
        if (plot && plot.ownerId === id && Array.isArray(msg.layout)) {
          plot.layout = msg.layout.slice(0, MAX_LAYOUT_CELLS).map(c => ({
            col: Number(c.col) || 0, row: Number(c.row) || 0, color: Number(c.color) || 0xffffff
          }));
          broadcast({ type: 'plotLayoutUpdated', plotId: plot.id, layout: plot.layout });
        }
        break;
      }

      case 'waveResult': {
        const plot = plots[msg.plotId];
        if (plot && plot.ownerId === id && Number.isInteger(msg.wave)) {
          plot.wave = msg.wave;
          broadcast({ type: 'plotWaveUpdated', plotId: plot.id, wave: plot.wave });
        }
        break;
      }

      // Sent by both single-player run-ends (best-effort - see NetClient
      // usage in BattleScene, single-player itself never requires a
      // connection) and multiplayer plot wave-clears. No account system to
      // check identity against, so this just trusts the client-reported
      // score - same "trust the client for combat" tradeoff the rest of
      // this server already makes (see README).
      case 'submitScore':
        submitScore(player.name, msg);
        break;

      default:
        break;
    }
  });

  ws.on('close', () => {
    players.delete(id);
    broadcast({ type: 'playerLeft', id });
  });
});

// A shared beat every player sees at once (the zombs.io-style "wave hits the
// whole map" rhythm) - purely informational for now (see README), each plot
// still starts its own wave manually via its own Start Wave button.
setInterval(() => {
  if (Date.now() < worldWaveDeadline) return;
  worldWave += 1;
  worldWaveDeadline = Date.now() + WORLD_WAVE_INTERVAL_MS;
  broadcast({ type: 'worldWaveTick', worldWave, worldWaveDeadline });
}, 1000);

httpServer.listen(PORT, () => {
  console.log(`Monster Tactics multiplayer server listening on http://localhost:${PORT}`);
});
