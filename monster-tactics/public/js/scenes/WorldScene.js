// The shared multiplayer overworld (see server/server.js + net/NetClient.js).
// Every connected player walks the same map; each claimed plot renders a
// live mini-preview of that player's tower layout to everyone else, and a
// shared "world wave" clock ticks in the corner as a common rhythm. Walking
// into your own claimed plot and pressing E hands off into the ordinary
// single-player BattleScene - it doesn't know or care it's being used from
// here beyond the gameState.multiplayerPlotId hook a few of its methods
// check (report layout/wave changes back, route "back" here instead of the
// single-player menu/hub).
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
    if (this.ready) {
      this.worldWave = snapshot.worldWave;
      this.worldWaveDeadline = snapshot.worldWaveDeadline;
      this.syncPlayers(snapshot.players);
      this.syncPlots(snapshot.plots);
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
    this.myAvatar = this.buildAvatar(this.myX, this.myY, `${NetClient.name} (you)`, 0x4caf50);
    this.cameras.main.startFollow(this.myAvatar.marker, true, 0.15, 0.15);

    snapshot.players.forEach(p => { if (p.id !== NetClient.id) this.onPlayerJoined(p); });
    snapshot.plots.forEach(p => this.createPlotPanel(p));

    this.buildHud();
    this.buildControls();
  }

  syncPlayers(players) {
    const seen = new Set();
    players.forEach(p => {
      seen.add(p.id);
      if (p.id === NetClient.id) {
        this.myX = p.x; this.myY = p.y;
        this.myAvatar.marker.setPosition(p.x, p.y);
        this.myAvatar.label.setPosition(p.x, p.y - 34);
        return;
      }
      if (this.otherPlayers.has(p.id)) {
        const op = this.otherPlayers.get(p.id);
        op.x = op.targetX = p.x; op.y = op.targetY = p.y;
        op.marker.setPosition(p.x, p.y); op.label.setPosition(p.x, p.y - 34);
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
      if (p.ownerId === NetClient.id) this.myPlotId = p.id;
      this.refreshPlotPanel(panel);
    });
  }

  // ---------- players ----------

  buildAvatar(x, y, name, color) {
    const marker = this.add.circle(x, y, 16, color).setStrokeStyle(2, 0x1c2530);
    const label = this.add.text(x, y - 34, name, {
      fontFamily: 'monospace', fontSize: '14px', color: '#f5f7fa'
    }).setOrigin(0.5).setStroke('#1c2530', 3);
    return { marker, label };
  }

  onPlayerJoined(p) {
    if (p.id === NetClient.id || this.otherPlayers.has(p.id)) return;
    const avatar = this.buildAvatar(p.x, p.y, p.name, 0x4a90d9);
    this.otherPlayers.set(p.id, { x: p.x, y: p.y, targetX: p.x, targetY: p.y, ...avatar });
  }

  onPlayerLeft(id) {
    const op = this.otherPlayers.get(id);
    if (!op) return;
    op.marker.destroy();
    op.label.destroy();
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
      op.x = Phaser.Math.Linear(op.x, op.targetX, t);
      op.y = Phaser.Math.Linear(op.y, op.targetY, t);
      op.marker.setPosition(op.x, op.y);
      op.label.setPosition(op.x, op.y - 34);
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
      layout: p.layout || [], wave: p.wave || 0
    };
    panel.border = this.add.rectangle(p.x, p.y, PLOT_W, PLOT_H, 0x1c2530, 0.35).setStrokeStyle(3, 0x394258);
    panel.title = this.add.text(p.x, p.y - PLOT_H / 2 + 22, '', {
      fontFamily: 'monospace', fontSize: '18px', color: '#e8ecf5', fontStyle: 'bold'
    }).setOrigin(0.5).setStroke('#1c2530', 3);
    panel.previewGfx = this.add.graphics();
    panel.hint = this.add.text(p.x, p.y + PLOT_H / 2 - 20, '', {
      fontFamily: 'monospace', fontSize: '15px', color: '#9aa4b8'
    }).setOrigin(0.5).setStroke('#1c2530', 3);

    if (p.ownerId === NetClient.id) this.myPlotId = p.id;
    this.plots.set(p.id, panel);
    this.refreshPlotPanel(panel);
  }

  refreshPlotPanel(panel) {
    const mine = panel.ownerId === NetClient.id;
    const unclaimed = panel.ownerId == null;
    panel.title.setText(
      unclaimed ? `Plot ${panel.id + 1} - unclaimed` :
      mine ? `Plot ${panel.id + 1} - YOUR BASE (wave ${panel.wave || 1})` :
      `Plot ${panel.id + 1} - ${panel.ownerName}'s base (wave ${panel.wave || 1})`
    );
    panel.border.setStrokeStyle(3, mine ? 0x4caf50 : (unclaimed ? 0x394258 : 0xe0562f));
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
    panel.layout.forEach(cell => {
      panel.previewGfx.fillStyle(cell.color, 0.9);
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
    if (msg.ownerId === NetClient.id) this.myPlotId = msg.plotId;
    this.refreshPlotPanel(panel);
  }

  onPlotLayoutUpdated(msg) {
    const panel = this.plots.get(msg.plotId);
    if (!panel) return;
    panel.layout = msg.layout;
    this.drawPlotPreview(panel);
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

  // ---------- hud / controls ----------

  buildHud() {
    const { width } = this.scale;
    this.add.rectangle(width / 2, 34, width, 68, 0x0b0d12, 0.7).setScrollFactor(0);
    this.worldWaveText = this.add.text(20, 18, '', {
      fontFamily: 'monospace', fontSize: '20px', color: '#f5c94b'
    }).setScrollFactor(0);
    this.add.text(20, 44, `You are ${NetClient.name} - WASD/arrows to walk`, {
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
  }

  buildControls() {
    this.moveKeys = this.input.keyboard.addKeys('W,A,S,D,UP,LEFT,DOWN,RIGHT');
    this.enterKey = this.input.keyboard.addKey('E');
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
    if (dx === 0 && dy === 0) return;
    if (dx !== 0 && dy !== 0) { dx *= Math.SQRT1_2; dy *= Math.SQRT1_2; }

    this.myX = Phaser.Math.Clamp(this.myX + dx * step, 20, this.worldWidth - 20);
    this.myY = Phaser.Math.Clamp(this.myY + dy * step, 20, this.worldHeight - 20);
    this.myAvatar.marker.setPosition(this.myX, this.myY);
    this.myAvatar.label.setPosition(this.myX, this.myY - 34);

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
    for (const panel of this.plots.values()) {
      const inside = Math.abs(this.myX - panel.x) < PLOT_W / 2 && Math.abs(this.myY - panel.y) < PLOT_H / 2;
      if (!inside) continue;
      if (panel.ownerId === NetClient.id) nearOwnedByMe = panel;
      else if (panel.ownerId == null && this.myPlotId == null) nearUnclaimed = panel;
    }

    this.nearOwnPlot = nearOwnedByMe;
    this.nearUnclaimedPlot = nearUnclaimed;
    const hasTeam = gameState.team.length > 0;
    this.enterHintText.setVisible(!!nearOwnedByMe && hasTeam);
    this.needTeamText.setVisible(!!nearOwnedByMe && !hasTeam);
    this.claimHintText.setVisible(!!nearUnclaimed);
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
  }
}
