// The shared multiplayer overworld (see server/server.js + net/NetClient.js).
// Every connected player walks the same map; each claimed plot renders a
// live mini-preview of that player's tower layout to everyone else, and a
// shared "world wave" clock ticks in the corner as a common rhythm - which
// also spawns the World Boss (see the "world boss" methods below), the one
// piece of gameplay here that's genuinely shared rather than one player's
// own combat rendered for others to watch: everyone converges on it and
// fights it together, HP tracked server-side so it can't diverge between
// clients. Walking into your own claimed plot and pressing E hands off into
// the ordinary single-player BattleScene - it doesn't know or care it's
// being used from here beyond the gameState.multiplayerPlotId hook a few of
// its methods check (report layout/wave changes back, route "back" here
// instead of the single-player menu/hub).
const AVATAR_SPEED = 260; // px/sec
const MOVE_BROADCAST_MS = 90;
const PLOT_W = 520;
const PLOT_H = 400;

class WorldScene extends Phaser.Scene {
  constructor() {
    super('WorldScene');
  }

  create() {
    const { width, height } = this.scale;

    this.ready = false;
    this.otherPlayers = new Map();
    this.plots = new Map();
    this.myPlotId = null;
    this.nearOwnPlot = null;
    this.nearUnclaimedPlot = null;
    this.claimInFlight = false;
    this.moveTimerMs = 0;
    this.worldWave = 1;
    this.worldWaveDeadline = Date.now();

    this.add.rectangle(width / 2, height / 2, width, height, 0x12151d, 1).setScrollFactor(0);
    this.statusText = this.add.text(width / 2, height / 2, 'Connecting to the shared world...', {
      fontFamily: 'monospace', fontSize: '26px', color: '#c8ceda', align: 'center'
    }).setOrigin(0.5).setScrollFactor(0);

    this.registerNetHandlers();

    NetClient.connect()
      .then((snapshot) => {
        this.applyState(snapshot);
        // Covers re-entry on an already-open socket (see NetClient.connect) -
        // the cached snapshot from first connect could be stale by now.
        NetClient.requestState();
      })
      .catch(() => {
        this.statusText.setText(
          "Couldn't reach the multiplayer server.\n" +
          "Make sure the game is running via the Node server (npm start),\n" +
          "not just a static file server, then come back to the menu and retry."
        );
      });
  }

  registerNetHandlers() {
    this.netHandlers = [
      ['state', (msg) => this.applyState(msg)],
      ['playerJoined', (msg) => this.onPlayerJoined(msg.player)],
      ['playerLeft', (msg) => this.onPlayerLeft(msg.id)],
      ['playerMoved', (msg) => this.onPlayerMoved(msg)],
      ['plotClaimed', (msg) => this.onPlotClaimed(msg)],
      ['plotLayoutUpdated', (msg) => this.onPlotLayoutUpdated(msg)],
      ['plotWaveUpdated', (msg) => this.onPlotWaveUpdated(msg)],
      ['worldWaveTick', (msg) => this.onWorldWaveTick(msg)],
      ['leaderboard', (msg) => this.onLeaderboardUpdate(msg.leaderboard)],
      ['worldBossSpawned', (msg) => this.onWorldBossSpawned(msg)],
      ['worldBossMoved', (msg) => this.onWorldBossMoved(msg)],
      ['worldBossHit', (msg) => this.onWorldBossHit(msg)],
      ['worldBossDefeated', (msg) => this.onWorldBossDefeated()],
      ['worldBossEscaped', () => this.onWorldBossEscaped()],
      ['worldBossReward', (msg) => this.onWorldBossReward(msg)],
      ['plotRaided', (msg) => this.onPlotRaided(msg)],
      ['disconnected', () => this.onDisconnected()]
    ];
    this.netHandlers.forEach(([type, fn]) => NetClient.on(type, fn));
    // NetClient is a page-lifetime singleton, so handlers registered here
    // must be torn down on scene shutdown or re-entering WorldScene later
    // would stack duplicate listeners on top of these.
    this.events.once('shutdown', () => {
      this.netHandlers.forEach(([type, fn]) => NetClient.off(type, fn));
    });
  }

  // ---------- state sync ----------

  applyState(snapshot) {
    // Catch-up delivery for a raid that happened while this player wasn't
    // connected (or was off in BattleScene/the menu) to see the live
    // plotRaided broadcast - see server.js snapshotFor. Delivered at most
    // once per raid, whichever connect/requestState round-trip sees it
    // first.
    if (snapshot.myRaidNotice) this.showRaidNotice(snapshot.myRaidNotice);

    if (this.ready) {
      this.worldWave = snapshot.worldWave;
      this.worldWaveDeadline = snapshot.worldWaveDeadline;
      this.syncPlayers(snapshot.players);
      this.syncPlots(snapshot.plots);
      this.onLeaderboardUpdate(snapshot.leaderboard || []);
      this.syncWorldBoss(snapshot.worldBoss);
      return;
    }

    this.ready = true;
    this.statusText.destroy();

    this.worldWidth = snapshot.worldWidth;
    this.worldHeight = snapshot.worldHeight;
    this.worldWave = snapshot.worldWave;
    this.worldWaveDeadline = snapshot.worldWaveDeadline;

    this.add.tileSprite(this.worldWidth / 2, this.worldHeight / 2, this.worldWidth, this.worldHeight, 'tile-grass');
    this.cameras.main.setBounds(0, 0, this.worldWidth, this.worldHeight);

    const me = snapshot.players.find(p => p.id === NetClient.id) || { x: this.worldWidth / 2, y: this.worldHeight / 2 };
    this.myX = me.x;
    this.myY = me.y;
    this.myAvatar = this.buildAvatar(this.myX, this.myY, `${NetClient.name} (you)`, 0x4caf50, me.avatar);
    // Follows the Container, not .marker - marker is now a child positioned
    // in container-local space (always 0,0), not world space, since
    // buildAvatar bundled marker/label/shadow/glow into one Container.
    this.cameras.main.startFollow(this.myAvatar.container, true, 0.15, 0.15);

    snapshot.players.forEach(p => { if (p.id !== NetClient.id) this.onPlayerJoined(p); });
    snapshot.plots.forEach(p => this.createPlotPanel(p));

    this.buildHud();
    this.buildControls();
    this.buildLeaderboardPanel();
    this.onLeaderboardUpdate(snapshot.leaderboard || []);
    if (snapshot.worldBoss && snapshot.worldBoss.active) this.onWorldBossSpawned(snapshot.worldBoss);
  }

  syncPlayers(players) {
    const seen = new Set();
    players.forEach(p => {
      seen.add(p.id);
      if (p.id === NetClient.id) {
        this.myX = p.x; this.myY = p.y;
        this.myAvatar.container.setPosition(p.x, p.y);
        return;
      }
      if (this.otherPlayers.has(p.id)) {
        const op = this.otherPlayers.get(p.id);
        op.x = op.targetX = p.x; op.y = op.targetY = p.y;
        op.container.setPosition(p.x, p.y);
      } else {
        this.onPlayerJoined(p);
      }
    });
    Array.from(this.otherPlayers.keys()).forEach(id => { if (!seen.has(id)) this.onPlayerLeft(id); });
  }

  syncPlots(serverPlots) {
    serverPlots.forEach(p => {
      const panel = this.plots.get(p.id);
      if (!panel) { this.createPlotPanel(p); return; }
      panel.ownerId = p.ownerId;
      panel.ownerName = p.ownerName;
      panel.layout = p.layout;
      panel.wave = p.wave;
      panel.raidedUntil = p.raidedUntil || 0;
      if (p.ownerId === NetClient.clientId) this.myPlotId = p.id;
      this.refreshPlotPanel(panel);
    });
  }

  // ---------- players ----------

  // A real animated character sprite (see data/avatars.js) rather than the
  // flat colored circle this used to be. The circle is kept only as a soft
  // glow ring *behind* the sprite, still tinted by `color`, because that's
  // what distinguishes you (green) from everyone else (blue) at a glance -
  // the sprites themselves are picked by the server per player, so color is
  // the only reliable "which one is me" cue. Ground shadow and the name on
  // a small dark pill are unchanged. Everything lives in one Container so
  // every caller moves the whole avatar with a single setPosition.
  buildAvatar(x, y, name, color, avatarIndex) {
    const index = safeAvatarIndex(avatarIndex);
    const shadow = this.add.ellipse(0, 20, 26, 10, 0x000000, 0.35);
    const glow = this.add.circle(0, 4, 20, color, 0.20);
    // Native art is 16x20; scaled up to roughly the footprint the old
    // circle marker occupied so plot-proximity distances still feel the
    // same to walk around.
    const sprite = this.add.sprite(0, 0, AVATAR_SHEET).setDisplaySize(38, 48);
    sprite.play(avatarAnimKey(index, 'idle-down'));
    const labelText = this.add.text(0, 0, name, {
      fontFamily: 'monospace', fontSize: '14px', color: '#f5f7fa'
    }).setOrigin(0.5).setStroke('#1c2530', 3);
    const labelBg = this.add.rectangle(0, 0, labelText.width + 14, labelText.height + 6, 0x0b0d12, 0.55)
      .setStrokeStyle(1, 0x394258);
    labelBg.setPosition(0, -38);
    labelText.setPosition(0, -38);
    const container = this.add.container(x, y, [shadow, glow, sprite, labelBg, labelText]);
    return { container, sprite, label: labelText, avatarIndex: index, facing: 'down', moving: false };
  }

  // Switches an avatar between its walk and idle loops and turns it to face
  // where it's going. Facing left is the side art flipped rather than its
  // own row (see data/avatars.js).
  //
  // Checks what the sprite is *actually* playing rather than trusting the
  // tracked state alone. Avatars built while handling the welcome snapshot
  // come up unresolved - observed frozen with a __MISSING texture and no
  // current anim, where avatars built later from a playerJoined broadcast
  // were fine - so buildAvatar's initial play() cannot be relied on. Since
  // this runs every frame anyway, re-asserting whenever the sprite has
  // drifted from the intended anim heals that on the next frame with no
  // special case, and comparing the resolved key still means a walk cycle
  // mid-loop is never restarted.
  setAvatarMotion(avatar, moving, facing) {
    const key = avatarAnimKey(avatar.avatarIndex, avatarRowKind(moving, facing));
    const current = avatar.sprite.anims.currentAnim;
    const onCorrectAnim = current && current.key === key && avatar.sprite.anims.isPlaying;
    if (avatar.moving === moving && avatar.facing === facing && onCorrectAnim) return;
    avatar.moving = moving;
    avatar.facing = facing;
    avatar.sprite.setFlipX(facing === 'left');
    avatar.sprite.play(key);
  }

  // Which way an avatar should face for a movement delta. Diagonals prefer
  // the horizontal (side) art, which reads better than picking up/down for
  // a mostly-sideways walk.
  facingFor(dx, dy) {
    if (dx === 0 && dy === 0) return null;
    if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 'right' : 'left';
    return dy > 0 ? 'down' : 'up';
  }

  onPlayerJoined(p) {
    if (p.id === NetClient.id || this.otherPlayers.has(p.id)) return;
    const avatar = this.buildAvatar(p.x, p.y, p.name, 0x4a90d9, p.avatar);
    this.otherPlayers.set(p.id, { x: p.x, y: p.y, targetX: p.x, targetY: p.y, ...avatar });
  }

  onPlayerLeft(id) {
    const op = this.otherPlayers.get(id);
    if (!op) return;
    op.container.destroy();
    this.otherPlayers.delete(id);
  }

  onPlayerMoved(msg) {
    const op = this.otherPlayers.get(msg.id);
    if (!op) return;
    op.targetX = msg.x;
    op.targetY = msg.y;
  }

  interpolateOtherPlayers(delta) {
    const t = Math.min(1, delta / 120);
    for (const op of this.otherPlayers.values()) {
      const prevX = op.x, prevY = op.y;
      op.x = Phaser.Math.Linear(op.x, op.targetX, t);
      op.y = Phaser.Math.Linear(op.y, op.targetY, t);
      op.container.setPosition(op.x, op.y);

      // Drive walk/idle off the interpolated step rather than the raw
      // network target: position updates only arrive every
      // MOVE_BROADCAST_MS, so keying on those directly would make remote
      // players stutter between walking and idling. The threshold ignores
      // the sub-pixel drift of an easing that never quite lands.
      const dx = op.x - prevX, dy = op.y - prevY;
      const moving = Math.hypot(dx, dy) > 0.15;
      this.setAvatarMotion(op, moving, moving ? this.facingFor(dx, dy) : op.facing);
    }
  }

  onDisconnected() {
    if (!this.ready) return;
    this.statusText = this.add.text(this.scale.width / 2, 90, 'Disconnected from the multiplayer server.', {
      fontFamily: 'monospace', fontSize: '20px', color: '#e0562f'
    }).setOrigin(0.5).setScrollFactor(0).setStroke('#1c2530', 4);
  }

  // ---------- plots ----------

  createPlotPanel(p) {
    const panel = {
      id: p.id, x: p.x, y: p.y,
      ownerId: p.ownerId, ownerName: p.ownerName,
      layout: p.layout || [], wave: p.wave || 0, raidedUntil: p.raidedUntil || 0
    };
    // A soft offset shadow (see UiKit.makeButton's identical trick) plus a
    // rounded, gradient-filled border redrawn per-state in refreshPlotPanel
    // (owner color changes) - was a flat single-color Rectangle with a
    // plain stroke, no depth or texture at all.
    panel.shadow = this.add.graphics();
    panel.shadow.fillStyle(0x000000, 0.28);
    panel.shadow.fillRoundedRect(p.x - PLOT_W / 2 + 7, p.y - PLOT_H / 2 + 9, PLOT_W, PLOT_H, 16);
    panel.border = this.add.graphics();
    panel.title = this.add.text(p.x, p.y - PLOT_H / 2 + 22, '', {
      fontFamily: 'monospace', fontSize: '18px', color: '#e8ecf5', fontStyle: 'bold'
    }).setOrigin(0.5).setStroke('#1c2530', 3);
    panel.previewGfx = this.add.graphics();
    panel.hint = this.add.text(p.x, p.y + PLOT_H / 2 - 20, '', {
      fontFamily: 'monospace', fontSize: '15px', color: '#9aa4b8'
    }).setOrigin(0.5).setStroke('#1c2530', 3);

    if (p.ownerId === NetClient.clientId) this.myPlotId = p.id;
    this.plots.set(p.id, panel);
    this.refreshPlotPanel(panel);
  }

  refreshPlotPanel(panel) {
    const mine = panel.ownerId === NetClient.clientId;
    const unclaimed = panel.ownerId == null;
    panel.title.setText(
      unclaimed ? `Plot ${panel.id + 1} - unclaimed` :
      mine ? `Plot ${panel.id + 1} - YOUR BASE (wave ${panel.wave || 1})` :
      `Plot ${panel.id + 1} - ${panel.ownerName}'s base (wave ${panel.wave || 1})`
    );
    const accent = mine ? 0x4caf50 : (unclaimed ? 0x394258 : 0xe0562f);
    const left = panel.x - PLOT_W / 2, top = panel.y - PLOT_H / 2;
    panel.border.clear();
    // A faint vertical gradient fill (dark base, barely-lighter top) instead
    // of one flat translucent color - same "reads as a real card, not a
    // painted rectangle" reasoning as UiKit's button/panel sheen.
    panel.border.fillGradientStyle(0x232c38, 0x232c38, 0x171b22, 0x171b22, 0.55, 0.55, 0.55, 0.55);
    panel.border.fillRoundedRect(left, top, PLOT_W, PLOT_H, 16);
    panel.border.lineStyle(3, accent, 1);
    panel.border.strokeRoundedRect(left, top, PLOT_W, PLOT_H, 16);
    panel.hint.setText(unclaimed ? 'Walk in and press E to claim it' : (mine ? 'Walk in, press E to enter' : ''));
    this.drawPlotPreview(panel);
  }

  drawPlotPreview(panel) {
    panel.previewGfx.clear();
    if (!panel.layout || panel.layout.length === 0) return;
    const cellW = (PLOT_W - 40) / GRID_COLS;
    const cellH = (PLOT_H - 70) / GRID_ROWS;
    const originX = panel.x - PLOT_W / 2 + 20;
    const originY = panel.y - PLOT_H / 2 + 44;
    const now = Date.now();
    panel.layout.forEach(cell => {
      // Layout cells carry real species/level (see BattleScene.reportPlotLayout)
      // rather than a stored color, so a raid outcome (server.js 'raid'
      // handler) can mark specific cells faintedUntil without the client
      // needing to know anything about combat - a fainted cell just renders
      // dim here until its cooldown passes.
      const species = getSpecies(cell.speciesId);
      if (!species) return;
      const fainted = cell.faintedUntil && cell.faintedUntil > now;
      panel.previewGfx.fillStyle(TYPE_COLORS[species.type], fainted ? 0.25 : 0.9);
      panel.previewGfx.fillRect(
        originX + cell.col * cellW, originY + cell.row * cellH,
        Math.max(2, cellW - 1), Math.max(2, cellH - 1)
      );
    });
  }

  onPlotClaimed(msg) {
    const panel = this.plots.get(msg.plotId);
    if (!panel) return;
    panel.ownerId = msg.ownerId;
    panel.ownerName = msg.ownerName;
    if (msg.ownerId === NetClient.clientId) this.myPlotId = msg.plotId;
    this.refreshPlotPanel(panel);
  }

  onPlotLayoutUpdated(msg) {
    const panel = this.plots.get(msg.plotId);
    if (!panel) return;
    panel.layout = msg.layout;
    this.drawPlotPreview(panel);
  }

  // Broadcast to everyone (see server.js 'raid' handler) so every client's
  // preview reflects fainted defenders immediately, not just the two
  // participants - and so the actual defender gets a heads-up even if they
  // were off doing something else in the world when it happened.
  onPlotRaided(msg) {
    const panel = this.plots.get(msg.plotId);
    if (!panel) return;
    panel.raidedUntil = msg.raidedUntil;
    msg.faintedCells.forEach(fc => {
      const cell = panel.layout.find(c => c.col === fc.col && c.row === fc.row);
      if (cell) cell.faintedUntil = fc.faintedUntil;
    });
    this.drawPlotPreview(panel);
    if (panel.ownerId === NetClient.clientId) {
      this.announceBossBanner(
        msg.attackerWon ? `${msg.attackerName} raided your base and won!` : `${msg.attackerName} raided your base and lost!`,
        msg.attackerWon ? '#e0562f' : '#4caf50'
      );
    }
  }

  // The catch-up counterpart to onPlotRaided's live banner - shown once,
  // from applyState, for a raid the player wasn't around (or wasn't in
  // WorldScene) to see happen in real time.
  showRaidNotice(notice) {
    this.announceBossBanner(
      notice.attackerWon
        ? `While you were away: ${notice.attackerName} raided your base and won!`
        : `While you were away: ${notice.attackerName} raided your base and lost!`,
      notice.attackerWon ? '#e0562f' : '#4caf50'
    );
  }

  onPlotWaveUpdated(msg) {
    const panel = this.plots.get(msg.plotId);
    if (!panel) return;
    panel.wave = msg.wave;
    this.refreshPlotPanel(panel);
  }

  onWorldWaveTick(msg) {
    this.worldWave = msg.worldWave;
    this.worldWaveDeadline = msg.worldWaveDeadline;
  }

  // ---------- world boss ----------
  //
  // The one genuinely shared piece of gameplay here - every plot is still
  // one player's own combat, just visible to others. The server (see
  // server.js attackWorldBoss) owns the real HP number and validates range/
  // cooldown; this scene just renders whatever it's told and fires attack
  // attempts, so a player mashing keys or lying about position can't do
  // anything except waste their own clicks.

  onWorldBossSpawned(state) {
    this.destroyBossVisual();
    this.bossX = state.x;
    this.bossY = state.y;
    this.bossMaxHp = state.maxHp;

    this.bossSprite = this.add.sprite(state.x, state.y, RETROMON_SHEET, 24).setScale(3).setInteractive({ useHandCursor: true });
    this.bossSprite.on('pointerdown', () => this.attemptBossAttack());
    this.bossNameLabel = this.add.text(state.x, state.y - 130, 'WORLD BOSS', {
      fontFamily: 'monospace', fontSize: '22px', color: '#e0562f', fontStyle: 'bold'
    }).setOrigin(0.5).setStroke('#1c2530', 4);
    this.bossHpBg = this.add.rectangle(state.x, state.y - 100, 260, 16, 0x1c202a).setStrokeStyle(2, 0x394258);
    this.bossHpFill = this.add.rectangle(state.x - 130, state.y - 100, 260, 16, 0xe0562f).setOrigin(0, 0.5);
    this.bossHpFill.scaleX = Math.max(0, state.hp / state.maxHp);
    this.bossHint = this.add.text(state.x, state.y + 90, 'It\'s on the move - click it, or catch up and press SPACE!', {
      fontFamily: 'monospace', fontSize: '15px', color: '#f5c94b'
    }).setOrigin(0.5).setStroke('#1c2530', 3);

    this.announceBossBanner('WORLD BOSS HAS APPEARED!', '#e0562f');
  }

  destroyBossVisual() {
    [this.bossSprite, this.bossNameLabel, this.bossHpBg, this.bossHpFill, this.bossHint].forEach(o => o && o.destroy());
    this.bossSprite = null;
  }

  // Repositions every piece of the boss's visual together - called on every
  // movement tick from the server (see server.js advanceWorldBoss), so it's
  // walking a real path rather than sitting in one spot. Snaps rather than
  // tweens between ticks: WORLD_BOSS_TICK_MS (150ms) is frequent enough that
  // a snap reads as smooth motion, and staying snapped to the server's
  // authoritative position (not a locally-predicted one) means the visible
  // position always matches what attackWorldBoss is actually range-checking
  // against server-side.
  moveBossVisualTo(x, y) {
    if (!this.bossSprite) return;
    this.bossX = x;
    this.bossY = y;
    this.bossSprite.setPosition(x, y);
    this.bossNameLabel.setPosition(x, y - 130);
    this.bossHpBg.setPosition(x, y - 100);
    this.bossHpFill.setPosition(x - 130, y - 100);
    this.bossHint.setPosition(x, y + 90);
  }

  onWorldBossMoved(msg) {
    this.moveBossVisualTo(msg.x, msg.y);
  }

  onWorldBossHit(msg) {
    if (!this.bossSprite) return;
    this.bossHpFill.scaleX = Math.max(0, msg.hp / msg.maxHp);
    if (msg.byId === NetClient.id) {
      this.showFloatingText(this.bossX + (Math.random() * 40 - 20), this.bossY - 40, `-${msg.damage}`, '#fff2c4');
    }
  }

  onWorldBossDefeated() {
    this.announceBossBanner('WORLD BOSS DEFEATED!', '#4caf50');
    this.destroyBossVisual();
  }

  // Reached the far end of its path without dying - it escapes, nobody gets
  // a reward. Distinct from onWorldBossDefeated so the outcome actually
  // reads differently (no green victory banner for letting it through).
  onWorldBossEscaped() {
    this.announceBossBanner('WORLD BOSS ESCAPED!', '#e0562f');
    this.destroyBossVisual();
  }

  // Only sent to players who actually landed a hit (see server.js
  // attackWorldBoss) - essence split by each contributor's damage share.
  onWorldBossReward(msg) {
    gameState.earnEssence(msg.essence);
    this.showFloatingText(this.myX, this.myY - 50, `+${msg.essence} essence!`, '#f5c94b');
  }

  syncWorldBoss(state) {
    if (!state) return;
    if (state.active && !this.bossSprite) { this.onWorldBossSpawned(state); return; }
    if (state.active && this.bossSprite) {
      this.bossHpFill.scaleX = Math.max(0, state.hp / state.maxHp);
      this.moveBossVisualTo(state.x, state.y); // catches up a reconnecting client to wherever it's walked to
      return;
    }
    if (!state.active && this.bossSprite) this.destroyBossVisual();
  }

  attemptBossAttack() {
    if (!this.bossSprite) return;
    NetClient.send('attackBoss');
  }

  announceBossBanner(text, color) {
    const banner = this.add.text(this.scale.width / 2, 220, text, {
      fontFamily: 'monospace', fontSize: '40px', color, fontStyle: 'bold'
    }).setOrigin(0.5).setStroke('#1c2530', 6).setScrollFactor(0).setDepth(60);
    this.tweens.add({ targets: banner, alpha: 0, delay: 2000, duration: 600, onComplete: () => banner.destroy() });
  }

  // Same rise-then-fade split as BattleScene.showDamageNumber - a single
  // tween easing both position and alpha fades the alpha almost to nothing
  // in the first quarter of the animation, unreadable in practice.
  showFloatingText(x, y, text, color) {
    const t = this.add.text(x, y, text, {
      fontFamily: 'monospace', fontSize: '18px', color, fontStyle: 'bold'
    }).setOrigin(0.5).setStroke('#1c2530', 3).setDepth(50);
    this.tweens.add({ targets: t, y: t.y - 34, duration: 550, ease: 'Cubic.Out' });
    this.tweens.add({ targets: t, alpha: 0, delay: 280, duration: 270, ease: 'Linear', onComplete: () => t.destroy() });
  }

  // ---------- hud / controls ----------

  buildHud() {
    const { width } = this.scale;
    this.add.rectangle(width / 2, 34, width, 68, 0x0b0d12, 0.7).setScrollFactor(0);
    this.worldWaveText = this.add.text(20, 18, '', {
      fontFamily: 'monospace', fontSize: '20px', color: '#f5c94b'
    }).setScrollFactor(0);
    this.add.text(20, 44, `You are ${NetClient.name} - WASD/arrows to walk, E to claim/enter, SPACE to hit the boss, R to raid`, {
      fontFamily: 'monospace', fontSize: '15px', color: '#9aa4b8'
    }).setScrollFactor(0);

    UiKit.makeLink(this, width - 210, 30, 'Team & Upgrades', () => {
      gameState.inMultiplayerWorld = true;
      this.scene.start('RosterScene');
    }, { fontSize: '17px' }).setScrollFactor(0);

    UiKit.makeLink(this, width - 30, 30, '< Leave World', () => {
      gameState.inMultiplayerWorld = false;
      gameState.multiplayerPlotId = null;
      this.scene.start('MenuScene');
    }, { originX: 1, fontSize: '17px' }).setScrollFactor(0);

    this.enterHintText = this.add.text(width / 2, this.scale.height - 40, 'Press E to enter your base', {
      fontFamily: 'monospace', fontSize: '19px', color: '#4caf50'
    }).setOrigin(0.5).setStroke('#1c2530', 4).setScrollFactor(0).setVisible(false);

    this.needTeamText = this.add.text(width / 2, this.scale.height - 40, "You'll need a team first - see Team & Upgrades above", {
      fontFamily: 'monospace', fontSize: '17px', color: '#e0562f'
    }).setOrigin(0.5).setStroke('#1c2530', 4).setScrollFactor(0).setVisible(false);

    this.claimHintText = this.add.text(width / 2, this.scale.height - 40, 'Press E to claim this plot as your base', {
      fontFamily: 'monospace', fontSize: '19px', color: '#f5c94b'
    }).setOrigin(0.5).setStroke('#1c2530', 4).setScrollFactor(0).setVisible(false);

    this.raidHintText = this.add.text(width / 2, this.scale.height - 40, '', {
      fontFamily: 'monospace', fontSize: '19px', color: '#e0562f'
    }).setOrigin(0.5).setStroke('#1c2530', 4).setScrollFactor(0).setVisible(false);
  }

  // A compact live top-5, pinned to the corner - the full sortable list
  // with stage/wave/result detail lives on LeaderboardScene (also
  // reachable without ever entering the world, from the main menu).
  buildLeaderboardPanel() {
    const { width } = this.scale;
    const panelX = width - 190, panelTop = 100;
    // Same rounded-corner/gradient/shadow treatment as the plot panels
    // (see refreshPlotPanel) instead of a flat stroked Rectangle.
    const pw = 320, ph = 230, left = panelX - pw / 2, top = panelTop + 110 - ph / 2;
    this.add.graphics().setScrollFactor(0)
      .fillStyle(0x000000, 0.28).fillRoundedRect(left + 5, top + 7, pw, ph, 12);
    this.add.graphics().setScrollFactor(0)
      .fillGradientStyle(0x1c2530, 0x1c2530, 0x0b0d12, 0x0b0d12, 0.8, 0.8, 0.8, 0.8)
      .fillRoundedRect(left, top, pw, ph, 12)
      .lineStyle(2, 0x394258, 1).strokeRoundedRect(left, top, pw, ph, 12);
    this.add.text(panelX, panelTop, 'TOP RUNS', {
      fontFamily: 'monospace', fontSize: '16px', color: '#f5c94b', fontStyle: 'bold'
    }).setOrigin(0.5).setScrollFactor(0);
    UiKit.makeLink(this, panelX, panelTop + 205, 'Full Leaderboard >', () => this.scene.start('LeaderboardScene'), {
      fontSize: '13px'
    }).setScrollFactor(0);
    this.leaderboardRows = [];
    this.leaderboardPanelX = panelX;
    this.leaderboardPanelTop = panelTop;
  }

  onLeaderboardUpdate(entries) {
    if (!this.leaderboardRows) return; // panel not built yet - applyState builds it before calling this
    this.leaderboardRows.forEach(r => r.destroy());
    this.leaderboardRows = [];

    const top = (entries || []).slice(0, 5);
    const x = this.leaderboardPanelX - 145, startY = this.leaderboardPanelTop + 35;
    if (top.length === 0) {
      const t = this.add.text(this.leaderboardPanelX, startY + 40, 'No runs yet - be the first!', {
        fontFamily: 'monospace', fontSize: '13px', color: '#9aa4b8'
      }).setOrigin(0.5).setScrollFactor(0);
      this.leaderboardRows.push(t);
      return;
    }
    top.forEach((e, i) => {
      const t = this.add.text(x, startY + i * 22, `#${i + 1} ${(e.name || '?').slice(0, 10)}  ${e.score}`, {
        fontFamily: 'monospace', fontSize: '14px', color: i === 0 ? '#f5c94b' : '#e8ecf5'
      }).setOrigin(0, 0.5).setScrollFactor(0);
      this.leaderboardRows.push(t);
    });
  }

  buildControls() {
    this.moveKeys = this.input.keyboard.addKeys('W,A,S,D,UP,LEFT,DOWN,RIGHT');
    this.enterKey = this.input.keyboard.addKey('E');
    this.attackKey = this.input.keyboard.addKey('SPACE');
    this.raidKey = this.input.keyboard.addKey('R');
  }

  updateWorldWaveHud() {
    const remaining = Math.max(0, Math.round((this.worldWaveDeadline - Date.now()) / 1000));
    this.worldWaveText.setText(`World Wave ${this.worldWave} - next in ${remaining}s`);
  }

  // ---------- movement ----------

  handleMovement(delta) {
    const step = (AVATAR_SPEED * delta) / 1000;
    let dx = 0, dy = 0;
    if (this.moveKeys.A.isDown || this.moveKeys.LEFT.isDown) dx -= 1;
    if (this.moveKeys.D.isDown || this.moveKeys.RIGHT.isDown) dx += 1;
    if (this.moveKeys.W.isDown || this.moveKeys.UP.isDown) dy -= 1;
    if (this.moveKeys.S.isDown || this.moveKeys.DOWN.isDown) dy += 1;
    if (dx === 0 && dy === 0) {
      // Keep the last facing, just drop to that direction's idle loop.
      this.setAvatarMotion(this.myAvatar, false, this.myAvatar.facing);
      return;
    }
    this.setAvatarMotion(this.myAvatar, true, this.facingFor(dx, dy));
    if (dx !== 0 && dy !== 0) { dx *= Math.SQRT1_2; dy *= Math.SQRT1_2; }

    this.myX = Phaser.Math.Clamp(this.myX + dx * step, 20, this.worldWidth - 20);
    this.myY = Phaser.Math.Clamp(this.myY + dy * step, 20, this.worldHeight - 20);
    this.myAvatar.container.setPosition(this.myX, this.myY);

    this.moveTimerMs += delta;
    if (this.moveTimerMs >= MOVE_BROADCAST_MS) {
      this.moveTimerMs = 0;
      NetClient.send('move', { x: this.myX, y: this.myY });
    }
  }

  // Deliberately requires pressing E rather than auto-claiming on overlap
  // (see update()) - players spawn near the middle of the plot grid, so an
  // earlier auto-claim-on-walk-in version had new players silently claim
  // whatever plot happened to be under their spawn point with no say in it.
  checkPlotProximity() {
    let nearOwnedByMe = null;
    let nearUnclaimed = null;
    let nearRaidable = null;
    const now = Date.now();
    for (const panel of this.plots.values()) {
      const inside = Math.abs(this.myX - panel.x) < PLOT_W / 2 && Math.abs(this.myY - panel.y) < PLOT_H / 2;
      if (!inside) continue;
      if (panel.ownerId === NetClient.clientId) nearOwnedByMe = panel;
      else if (panel.ownerId == null && this.myPlotId == null) nearUnclaimed = panel;
      else if (panel.ownerId != null) {
        // Raidable: someone else's base, not on cooldown, and has at least
        // one non-fainted defender - an empty or fully-fainted base has
        // nothing for a Squad Skirmish to actually fight (see RaidScene).
        const onCooldown = panel.raidedUntil && panel.raidedUntil > now;
        const hasDefenders = (panel.layout || []).some(c => !c.faintedUntil || c.faintedUntil <= now);
        if (!onCooldown && hasDefenders) nearRaidable = panel;
      }
    }

    this.nearOwnPlot = nearOwnedByMe;
    this.nearUnclaimedPlot = nearUnclaimed;
    this.nearRaidablePlot = nearRaidable;
    const hasTeam = gameState.team.length > 0;
    this.enterHintText.setVisible(!!nearOwnedByMe && hasTeam);
    this.needTeamText.setVisible(!!nearOwnedByMe && !hasTeam);
    this.claimHintText.setVisible(!!nearUnclaimed);
    this.raidHintText.setVisible(!!nearRaidable && hasTeam);
    if (nearRaidable) this.raidHintText.setText(`Press R to raid ${nearRaidable.ownerName}'s base!`);
  }

  startRaid(panel) {
    if (gameState.team.length === 0) return;
    gameState.raidTargetPlotId = panel.id;
    gameState.raidTargetName = panel.ownerName;
    gameState.raidTargetLayout = panel.layout;
    this.scene.start('RaidScene');
  }

  claimPlot(panel) {
    if (this.claimInFlight) return;
    this.claimInFlight = true;
    NetClient.send('claimPlot', { plotId: panel.id });
    this.time.delayedCall(500, () => { this.claimInFlight = false; });
  }

  enterPlot(panel) {
    if (gameState.team.length === 0) return;
    gameState.multiplayerPlotId = panel.id;
    gameState.resetRun();
    gameState.startStage(FIRST_STAGE_ID);
    this.scene.start('BattleScene');
  }

  update(time, delta) {
    if (!this.ready) return;
    this.handleMovement(delta);
    this.interpolateOtherPlayers(delta);
    this.checkPlotProximity();
    this.updateWorldWaveHud();

    if (Phaser.Input.Keyboard.JustDown(this.enterKey)) {
      if (this.nearOwnPlot) this.enterPlot(this.nearOwnPlot);
      else if (this.nearUnclaimedPlot) this.claimPlot(this.nearUnclaimedPlot);
    }
    if (Phaser.Input.Keyboard.JustDown(this.raidKey) && this.nearRaidablePlot) this.startRaid(this.nearRaidablePlot);
    if (Phaser.Input.Keyboard.JustDown(this.attackKey)) this.attemptBossAttack();
  }
}
