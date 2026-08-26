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
const { URL } = require('url');
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

  // A plain HTTP status check (not a WebSocket connection) so MenuScene can
  // show "N Tamers online" without actually joining the shared world -
  // opening a real connection just to read a headcount would register a
  // "player" on the server and leave an idle avatar sitting in WorldScene
  // for everyone else, for someone who never chose to enter it at all.
  if (requestPath === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ playerCount: players.size, worldWave }));
    return;
  }

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
// Taller than the original 2000 - the extra 250px at the top is a dedicated
// arena band for the World Boss (see below), clear of the plot grid's first
// row (which starts at PLOT_ORIGIN_Y - PLOT_H/2, PLOT_H from the client's
// WorldScene.js) rather than competing with it for space.
const WORLD_HEIGHT = 2250;
const PLOT_COUNT = 12;
const PLOT_COLS = 4;
const PLOT_ORIGIN_X = 420;
const PLOT_ORIGIN_Y = 600;
const PLOT_SPACING_X = 620;
const PLOT_SPACING_Y = 520;
const WORLD_WAVE_INTERVAL_MS = 45000;
// Layout snapshots are player-reported "here's what my grid looks like"
// data, not simulated here - cap defensively so one client can't send an
// arbitrarily large payload to broadcast to the whole room. Each cell now
// carries real speciesId/level (not just a cosmetic color) so a raid (see
// below) has actual stats to fight with - the preview color everyone else
// sees is derived client-side from the species' type instead.
const MAX_LAYOUT_CELLS = 200;

// Squad Skirmish raids: walk up to someone else's base, send up to
// RAID_SQUAD_SIZE monsters from your roster, and it plays out as a real
// mini-battle client-side (same trust boundary as everything else on this
// server - see README) using the defender's actual reported layout. This
// server's only jobs are relaying the outcome and remembering the
// consequences: which of the defender's cells are temporarily "fainted"
// (excluded from defending again for a while), and a per-plot cooldown so
// one base can't be piled on repeatedly.
const RAID_SQUAD_SIZE = 3;
const RAID_COOLDOWN_MS = 3 * 60 * 1000;
const RAID_FAINT_MS = 3 * 60 * 1000;

function plotPosition(index) {
  const col = index % PLOT_COLS;
  const row = Math.floor(index / PLOT_COLS);
  return { x: PLOT_ORIGIN_X + col * PLOT_SPACING_X, y: PLOT_ORIGIN_Y + row * PLOT_SPACING_Y };
}

const plots = Array.from({ length: PLOT_COUNT }, (_, i) => ({
  id: i, ownerId: null, ownerName: null, layout: [], wave: 0, stageId: null, ...plotPosition(i)
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

// The one genuinely *shared* piece of gameplay in the world (everything
// else - plots - is one player's own combat, just visible to others). This
// is also the one place this server is authoritative over actual combat
// numbers rather than just presence/relayed cosmetics (see README's
// "trust the client" note on plots) - a shared HP pool that many clients
// hit at once has to live somewhere nobody's individual client controls,
// or two players' clients would each think they landed the finishing blow.
// Kept deliberately simple: a flat, server-decided damage-per-click (not
// trusting a client-reported amount) with a per-player cooldown, rather
// than simulating each player's actual team/stats server-side.
//
// It walks a path through the middle of the plot grid - not a fixed point -
// so where a player builds their base has real spatial meaning: a base near
// the road is a strongpoint everyone passing through benefits from, the
// same way tower placement matters in a normal battle. Reaching the far end
// without dying lets it escape with no rewards for anyone, for real time
// pressure. This is deliberately still not a full merge of plot combat into
// one shared simulation (that would mean moving combat authority for every
// player's own towers server-side too) - just this one shared threat given
// a route instead of a room.
const WORLD_BOSS_MAX_HP = 6000;
const WORLD_BOSS_ATTACK_DAMAGE = 15;
const WORLD_BOSS_ATTACK_COOLDOWN_MS = 500;
const WORLD_BOSS_HIT_RANGE = 140;
const WORLD_BOSS_ESSENCE_POOL = 200; // split across contributors by damage share
const WORLD_BOSS_SPEED = 55; // px/sec
const WORLD_BOSS_TICK_MS = 150;
// Straight across, in the open band between plot row 0 and row 1 (see
// PLOT_ORIGIN_Y/PLOT_SPACING_Y) rather than a separate arena off to the
// side - it visibly threads between bases as it crosses the map. A single
// straight leg is v1; a real winding path (like a stage's pathCells on the
// client) is future work, noted in README.
const WORLD_BOSS_PATH = [
  { x: 100, y: PLOT_ORIGIN_Y + PLOT_SPACING_Y / 2 },
  { x: WORLD_WIDTH - 100, y: PLOT_ORIGIN_Y + PLOT_SPACING_Y / 2 }
];

let worldBoss = { active: false, hp: 0, maxHp: WORLD_BOSS_MAX_HP, x: 0, y: 0, waypointIndex: 0, contributions: new Map() };
const lastBossAttackAt = new Map(); // playerId -> timestamp, for the per-player cooldown

function spawnWorldBoss() {
  const start = WORLD_BOSS_PATH[0];
  worldBoss = {
    active: true, hp: WORLD_BOSS_MAX_HP, maxHp: WORLD_BOSS_MAX_HP,
    x: start.x, y: start.y, waypointIndex: 0, contributions: new Map()
  };
  broadcast({ type: 'worldBossSpawned', hp: worldBoss.hp, maxHp: worldBoss.maxHp, x: worldBoss.x, y: worldBoss.y });
}

function publicWorldBoss() {
  return worldBoss.active
    ? { active: true, hp: worldBoss.hp, maxHp: worldBoss.maxHp, x: worldBoss.x, y: worldBoss.y }
    : { active: false };
}

// Advances the boss one tick along WORLD_BOSS_PATH - mirrors the waypoint-
// stepping shape BattleScene already uses for enemies client-side, just run
// server-side on a timer instead of per render frame, since this has to
// keep moving for every connected player regardless of which of them (if
// any) currently has it on screen.
function advanceWorldBoss() {
  if (!worldBoss.active) return;
  const target = WORLD_BOSS_PATH[worldBoss.waypointIndex + 1];
  if (!target) return; // shouldn't happen - escape is handled the tick it's reached

  const dx = target.x - worldBoss.x, dy = target.y - worldBoss.y;
  const dist = Math.hypot(dx, dy);
  const step = WORLD_BOSS_SPEED * (WORLD_BOSS_TICK_MS / 1000);

  if (dist <= step) {
    worldBoss.x = target.x;
    worldBoss.y = target.y;
    worldBoss.waypointIndex += 1;
    if (!WORLD_BOSS_PATH[worldBoss.waypointIndex + 1]) {
      // Reached the end of the road without dying - it escapes, no rewards.
      broadcast({ type: 'worldBossEscaped' });
      worldBoss = { active: false, hp: 0, maxHp: WORLD_BOSS_MAX_HP, x: 0, y: 0, waypointIndex: 0, contributions: new Map() };
      return;
    }
  } else {
    worldBoss.x += (dx / dist) * step;
    worldBoss.y += (dy / dist) * step;
  }

  broadcast({ type: 'worldBossMoved', x: worldBoss.x, y: worldBoss.y });
}

function attackWorldBoss(attackerId, attackerPlayer) {
  if (!worldBoss.active) return;
  const dx = attackerPlayer.x - worldBoss.x, dy = attackerPlayer.y - worldBoss.y;
  if (Math.hypot(dx, dy) > WORLD_BOSS_HIT_RANGE) return;

  const now = Date.now();
  if (now - (lastBossAttackAt.get(attackerId) || 0) < WORLD_BOSS_ATTACK_COOLDOWN_MS) return;
  lastBossAttackAt.set(attackerId, now);

  const damage = Math.min(WORLD_BOSS_ATTACK_DAMAGE, worldBoss.hp);
  worldBoss.hp -= damage;
  worldBoss.contributions.set(attackerId, (worldBoss.contributions.get(attackerId) || 0) + damage);
  broadcast({ type: 'worldBossHit', hp: worldBoss.hp, maxHp: worldBoss.maxHp, byId: attackerId, damage });

  if (worldBoss.hp <= 0) {
    const totalDamage = worldBoss.maxHp;
    const rewards = [];
    for (const [contributorId, damageDealt] of worldBoss.contributions.entries()) {
      const contributor = players.get(contributorId);
      if (!contributor) continue;
      const essenceReward = Math.max(5, Math.round((damageDealt / totalDamage) * WORLD_BOSS_ESSENCE_POOL));
      send(contributor.ws, { type: 'worldBossReward', essence: essenceReward, damageDealt });
      rewards.push({ name: contributor.name, damageDealt });
    }
    broadcast({ type: 'worldBossDefeated', rewards });
    worldBoss = { active: false, hp: 0, maxHp: WORLD_BOSS_MAX_HP, x: 0, y: 0, waypointIndex: 0, contributions: new Map() };
  }
}

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

// Which of the avatar sheet's characters a player is drawn as (see
// public/js/data/avatars.js). Derived from the persistent clientId rather
// than assigned round-robin from a counter, so a player keeps the same
// look across reconnects - the same reason plot ownership is keyed on
// clientId. Cheap FNV-ish string hash; collisions just mean two players
// share a look, which is fine.
const AVATAR_COUNT = 14;

function avatarForClientId(clientId) {
  let h = 2166136261;
  for (let i = 0; i < clientId.length; i++) {
    h ^= clientId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % AVATAR_COUNT;
}

function publicPlayer(p) {
  return { id: p.id, name: p.name, x: p.x, y: p.y, avatar: p.avatar };
}

// The stage id a plot is built on. Deliberately NOT validated against a
// list of real stages here: the stage pool lives in the client's
// data/stages.js and duplicating it server-side would just invite the two
// to drift. This bounds it to a plausible id instead, and the client
// clamps whatever arrives to a stage that actually exists before using it
// (see WorldScene.plotStageId) - the same "trust the client, sanity-check
// the shape" posture the rest of the plot data already takes.
function sanitizeStageId(value) {
  if (typeof value !== 'string') return null;
  return /^[a-z0-9-]{1,64}$/.test(value) ? value : null;
}

function publicPlot(p) {
  return { id: p.id, ownerId: p.ownerId, ownerName: p.ownerName, layout: p.layout, wave: p.wave, x: p.x, y: p.y, raidedUntil: p.raidedUntil || 0, stageId: p.stageId || null };
}

function snapshotFor(playerId, name, clientId) {
  // Deliver-once catch-up notice for a raid that happened while this
  // clientId's owning connection wasn't around to see the live broadcast
  // (see the 'raid' handler) - cleared immediately so it surfaces exactly
  // once, to whichever connection next asks (fresh connect or an explicit
  // requestState), not on every reconnect afterward.
  let myRaidNotice = null;
  const myPlot = plots.find(p => p.ownerId === clientId && p.raidNotice);
  if (myPlot) {
    myRaidNotice = { ...myPlot.raidNotice, plotId: myPlot.id };
    myPlot.raidNotice = null;
  }

  return {
    id: playerId,
    name,
    players: Array.from(players.values()).map(publicPlayer),
    plots: plots.map(publicPlot),
    worldWidth: WORLD_WIDTH,
    worldHeight: WORLD_HEIGHT,
    worldWave,
    worldWaveDeadline,
    leaderboard,
    worldBoss: publicWorldBoss(),
    myRaidNotice
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

wss.on('connection', (ws, request) => {
  const id = nextPlayerId++;
  const name = `Tamer${id}`;
  // Persistent per-browser id the client generates once and saves to
  // localStorage (see NetClient.loadOrCreateClientId), sent as a query
  // param since a WebSocket handshake has no body. This - NOT the `id`
  // above - is what plot ownership is tracked by: `id` is fresh on every
  // single connection, so a plot claimed under it would look "not yours"
  // the moment a player's browser reconnects for any reason (refresh, a
  // network blip, the laptop sleeping) even though the plot is still
  // sitting there with their name on it. Falls back to the ephemeral `id`
  // for a client that somehow connects without one, so it never crashes -
  // that connection just gets the old (reconnect-fragile) behavior.
  let clientId = `fallback-${id}`;
  try {
    const parsed = new URL(request.url, 'http://localhost');
    clientId = parsed.searchParams.get('clientId') || clientId;
  } catch (e) {
    // malformed request URL - keep the fallback
  }

  // Open ground below the plot grid (last row bottoms out around y=1640,
  // see plotPosition) rather than the map's literal center, which sits
  // right on top of a middle plot - a new player's very first frame
  // shouldn't already be standing inside someone's claimed base.
  const player = {
    id, clientId, name, ws,
    avatar: avatarForClientId(clientId),
    x: WORLD_WIDTH / 2 + (Math.random() - 0.5) * 400,
    y: WORLD_HEIGHT - 150 + (Math.random() - 0.5) * 100
  };
  players.set(id, player);

  // A returning player (same clientId, new connection id) should see their
  // still-standing base labeled with whatever display name this connection
  // got, not whichever name was current when they last connected.
  for (const plot of plots) {
    if (plot.ownerId === clientId) plot.ownerName = player.name;
  }

  send(ws, { type: 'welcome', ...snapshotFor(id, name, clientId) });
  broadcast({ type: 'playerJoined', player: publicPlayer(player) }, id);

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch (e) { return; }
    if (!msg || typeof msg.type !== 'string') return;

    // A bug or a malformed/malicious message in any one case below used to
    // be able to crash the whole process (an uncaught exception inside a
    // 'message' listener kills the Node process, taking every connected
    // player's shared world down with it) - caught here now so a bad
    // message just drops that one message instead.
    try {
      handleMessage(msg);
    } catch (e) {
      console.error('Error handling message type', msg.type, e);
    }
  });

  function handleMessage(msg) {
    switch (msg.type) {
      case 'requestState':
        send(ws, { type: 'state', ...snapshotFor(id, name, clientId) });
        break;

      case 'move': {
        if (typeof msg.x !== 'number' || typeof msg.y !== 'number') return;
        player.x = Math.max(0, Math.min(WORLD_WIDTH, msg.x));
        player.y = Math.max(0, Math.min(WORLD_HEIGHT, msg.y));
        broadcast({ type: 'playerMoved', id, x: player.x, y: player.y }, id);
        break;
      }

      // Plot ownership is checked/stored by clientId (persistent per-browser,
      // survives a reconnect) everywhere below, never the ephemeral
      // connection `id` - see the comment above player.clientId's assignment.
      case 'claimPlot': {
        const plot = plots[msg.plotId];
        if (plot && !plot.ownerId) {
          plot.ownerId = clientId;
          plot.ownerName = player.name;
          plot.stageId = sanitizeStageId(msg.stageId);
          broadcast({
            type: 'plotClaimed', plotId: plot.id, ownerId: clientId,
            ownerName: player.name, stageId: plot.stageId
          });
        }
        break;
      }

      // Which map the owner has built their base on. Broadcast so every
      // other client can draw this plot's preview in its real biome rather
      // than everyone's base looking identical from the outside.
      case 'plotStage': {
        const plot = plots[msg.plotId];
        const stageId = sanitizeStageId(msg.stageId);
        if (plot && plot.ownerId === clientId && stageId) {
          plot.stageId = stageId;
          // Changing the map replaces the base built on the old one -
          // keeping the towers would leave them sitting on cells the new
          // path may run straight through.
          plot.layout = [];
          broadcast({ type: 'plotStageUpdated', plotId: plot.id, stageId, layout: plot.layout });
        }
        break;
      }

      case 'plotLayout': {
        const plot = plots[msg.plotId];
        if (plot && plot.ownerId === clientId && Array.isArray(msg.layout)) {
          // A full replace, not a merge - any previous faintedUntil markers
          // are naturally cleared the moment the owner changes anything
          // about their layout at all. That's deliberate: reinforcing your
          // base (placing or moving even one tower) is how you recover from
          // a raid, on top of just waiting out RAID_FAINT_MS.
          plot.layout = msg.layout.slice(0, MAX_LAYOUT_CELLS).map(c => ({
            col: Number(c.col) || 0, row: Number(c.row) || 0,
            speciesId: String(c.speciesId || '').slice(0, 40),
            level: Math.max(1, Math.min(10, Number(c.level) || 1))
          }));
          broadcast({ type: 'plotLayoutUpdated', plotId: plot.id, layout: plot.layout });
        }
        break;
      }

      case 'waveResult': {
        const plot = plots[msg.plotId];
        if (plot && plot.ownerId === clientId && Number.isInteger(msg.wave)) {
          plot.wave = msg.wave;
          broadcast({ type: 'plotWaveUpdated', plotId: plot.id, wave: plot.wave });
        }
        break;
      }

      // The raid itself already happened client-side by the time this
      // arrives (RaidScene simulated it using the defender's last-known
      // reported layout - same trust boundary as submitScore below). This
      // just applies the lasting, world-visible consequences: a cooldown so
      // the same base can't be piled on repeatedly, and marking whichever
      // specific defending cells actually died in that skirmish as fainted
      // for a while - independent of who won overall, so a defender that
      // barely turns back a raid can still have lost a squad member, same
      // as the attacker risks losing whichever of their own monsters die
      // (tracked client-side only - see RaidScene). Real risk on both sides,
      // not just an all-or-nothing loss condition.
      case 'raid': {
        const plot = plots[msg.targetPlotId];
        if (!plot || !plot.ownerId || plot.ownerId === clientId) break; // no raiding an unclaimed plot or your own base
        const now = Date.now();
        if (plot.raidedUntil && now > plot.raidedUntil) {
          // stale marker from a raid whose cooldown already expired - fine to overwrite
        } else if (plot.raidedUntil && now < plot.raidedUntil) {
          break; // still on cooldown - ignore, don't let a client bypass it by resending
        }
        plot.raidedUntil = now + RAID_COOLDOWN_MS;

        // A defender who's off in BattleScene/the menu (or just not
        // connected at all right now) gets nothing from the broadcast below
        // - broadcast only reaches currently-open sockets. This is the
        // catch-up path: stashed on the plot itself and handed to whichever
        // connection next identifies as this plot's owner (see snapshotFor),
        // then cleared - delivered once, to whichever tab/device happens to
        // reconnect first, not persisted or synced across multiple tabs.
        plot.raidNotice = { attackerName: player.name, attackerWon: !!msg.attackerWon, time: now };

        const faintedCells = [];
        if (Array.isArray(msg.deadDefenderCells)) {
          const faintedUntil = now + RAID_FAINT_MS;
          msg.deadDefenderCells.slice(0, RAID_SQUAD_SIZE).forEach(fc => {
            const cell = plot.layout.find(c => c.col === Number(fc.col) && c.row === Number(fc.row));
            if (cell) { cell.faintedUntil = faintedUntil; faintedCells.push({ col: cell.col, row: cell.row, faintedUntil }); }
          });
        }
        plot.raidNotice.faintedCount = faintedCells.length;

        broadcast({
          type: 'plotRaided', plotId: plot.id, attackerName: player.name,
          attackerWon: !!msg.attackerWon, faintedCells, raidedUntil: plot.raidedUntil
        });
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

      case 'attackBoss':
        attackWorldBoss(id, player);
        break;

      default:
        break;
    }
  }

  ws.on('close', () => {
    players.delete(id);
    broadcast({ type: 'playerLeft', id });
  });
});

// A shared beat every player sees at once (the zombs.io-style "wave hits the
// whole map" rhythm). Each plot still starts its own wave manually via its
// own Start Wave button, but this now also spawns the shared World Boss
// (see attackWorldBoss above) if the last one isn't still standing - never
// stacks a second boss on top of one still being fought.
setInterval(() => {
  if (Date.now() < worldWaveDeadline) return;
  worldWave += 1;
  worldWaveDeadline = Date.now() + WORLD_WAVE_INTERVAL_MS;
  broadcast({ type: 'worldWaveTick', worldWave, worldWaveDeadline });
  if (!worldBoss.active) spawnWorldBoss();
}, 1000);

// Walks the boss along WORLD_BOSS_PATH - see advanceWorldBoss.
setInterval(advanceWorldBoss, WORLD_BOSS_TICK_MS);

httpServer.listen(PORT, () => {
  console.log(`Monster Tactics multiplayer server listening on http://localhost:${PORT}`);
});
