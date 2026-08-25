// Cross-player, all-time top runs (server/server.js `leaderboard` array) -
// the one piece of "how do I compare to everyone else" this game had
// nothing for before. Fed by both single-player run-ends (best-effort, see
// BattleScene.submitScoreBestEffort - single-player still needs no server)
// and multiplayer plot wave-clears.
class LeaderboardScene extends Phaser.Scene {
  constructor() {
    super('LeaderboardScene');
  }

  create() {
    const { width, height } = this.scale;

    this.add.tileSprite(width / 2, height / 2, width, height, 'tile-grass');
    this.add.rectangle(width / 2, height / 2, width, height, 0x12151d, 0.68);

    this.add.text(width / 2, 60, 'LEADERBOARD', {
      fontFamily: 'monospace', fontSize: '42px', color: '#f5f7fa', fontStyle: 'bold'
    }).setOrigin(0.5).setStroke('#1c2530', 6);
    this.add.text(width / 2, 108, 'All-time top runs, across every connected player', {
      fontFamily: 'monospace', fontSize: '17px', color: '#c8ceda'
    }).setOrigin(0.5).setStroke('#1c2530', 3);

    UiKit.makeLink(this, 30, 30, '< Menu', () => this.scene.start('MenuScene'), { originX: 0, originY: 0 });

    this.statusText = this.add.text(width / 2, height / 2, 'Connecting to the multiplayer server...', {
      fontFamily: 'monospace', fontSize: '22px', color: '#c8ceda', align: 'center'
    }).setOrigin(0.5);

    this.rows = [];

    // Two separate message types can carry a fresh leaderboard: a live
    // 'leaderboard' broadcast (someone else just submitted a score) and a
    // 'state' reply to requestState() below - connect() resolves instantly
    // with a possibly-stale cached snapshot when a connection from an
    // earlier scene is still open (see NetClient.connect), so requestState
    // is what actually catches this scene up, and needs its own listener.
    this.leaderboardHandler = (msg) => this.renderLeaderboard(msg.leaderboard);
    this.stateHandler = (msg) => this.renderLeaderboard(msg.leaderboard);
    NetClient.on('leaderboard', this.leaderboardHandler);
    NetClient.on('state', this.stateHandler);
    this.events.once('shutdown', () => {
      NetClient.off('leaderboard', this.leaderboardHandler);
      NetClient.off('state', this.stateHandler);
    });

    NetClient.connect()
      .then((snapshot) => {
        this.renderLeaderboard(snapshot.leaderboard || []);
        NetClient.requestState(); // catch up in case that snapshot was stale
      })
      .catch(() => {
        this.statusText.setText(
          "Couldn't reach the multiplayer server.\n" +
          "The leaderboard needs the game running via the Node server (npm start)."
        );
      });
  }

  // Real fixed-x columns rather than padded monospace strings - a
  // "monospace" CSS font-family fallback isn't reliably fixed-width across
  // every browser/OS font substitution, so padEnd/padStart-built rows drift
  // out of alignment with their header in practice. Each cell is its own
  // Text at a shared x anchor per column instead.
  leaderboardColumns() {
    const centerX = this.scale.width / 2;
    return [
      { key: 'rank', x: centerX - 420, origin: 0 },
      { key: 'name', x: centerX - 350, origin: 0 },
      { key: 'score', x: centerX + 40, origin: 1 },
      { key: 'stage', x: centerX + 130, origin: 1 },
      { key: 'wave', x: centerX + 210, origin: 1 },
      { key: 'result', x: centerX + 260, origin: 0 }
    ];
  }

  renderLeaderboard(entries) {
    this.rows.forEach(r => r.destroy());
    this.rows = [];

    if (!entries || entries.length === 0) {
      this.statusText.setVisible(true).setText('No runs recorded yet - be the first!');
      return;
    }
    this.statusText.setVisible(false);

    const startY = 160;
    const rowH = 34;
    const columns = this.leaderboardColumns();
    const headerLabels = { rank: 'RANK', name: 'NAME', score: 'SCORE', stage: 'STAGE', wave: 'WAVE', result: 'RESULT' };

    columns.forEach(col => {
      const t = this.add.text(col.x, startY, headerLabels[col.key], {
        fontFamily: 'monospace', fontSize: '15px', color: '#9aa4b8'
      }).setOrigin(col.origin, 0.5);
      this.rows.push(t);
    });

    entries.forEach((e, i) => {
      const resultLabel = e.mode === 'plot' ? 'Base' : (e.outcome === 'victory' ? 'Victory!' : 'Run ended');
      const values = { rank: `#${i + 1}`, name: (e.name || '?').slice(0, 14), score: String(e.score), stage: String(e.stageReached), wave: String(e.wave), result: resultLabel };
      const y = startY + 40 + i * rowH;
      const color = i < 3 ? '#f5c94b' : '#e8ecf5';
      columns.forEach(col => {
        const t = this.add.text(col.x, y, values[col.key], {
          fontFamily: 'monospace', fontSize: '17px', color
        }).setOrigin(col.origin, 0.5).setStroke('#1c2530', 3);
        this.rows.push(t);
      });
    });
  }
}
