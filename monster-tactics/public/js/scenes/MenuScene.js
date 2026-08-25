class MenuScene extends Phaser.Scene {
  constructor() {
    super('MenuScene');
  }

  create() {
    const { width, height } = this.scale;

    // Reaching the menu inherently means no run is in progress - clears the
    // context flag SanctuaryScene/RosterScene use to route their back
    // button to the Hub instead of here.
    gameState.runActive = false;
    gameState.inMultiplayerWorld = false;

    this.add.tileSprite(width / 2, height / 2, width, height, 'tile-grass');
    this.add.rectangle(width / 2, height / 2, width, height, 0x12151d, 0.55);
    // Radial vignette (see scripts/gen_assets.py make_vignette) on top of
    // the flat darken above - pulls focus toward the title/button column
    // instead of the whole tiled ground reading as one flat wall of green.
    this.add.image(width / 2, height / 2, 'vignette').setDisplaySize(width, height);

    // A scattered handful of background decoration (dim, varied scale) so
    // the menu reads as a clearing in a forest rather than 2 lonely trees
    // floating on a tiled texture - kept low-alpha and off the button
    // column so it stays atmosphere, not clutter.
    const bgDecor = [
      ['rock-1', 120, 520, 1.3], ['rock-3', width - 150, 560, 1.2],
      ['bush-1', 150, 340, 1.1], ['bush-2', width - 170, 300, 1.15],
      ['rock-2', 90, 800, 1.1], ['rock-4', width - 110, 850, 1.15],
      ['bush-1', width - 260, 700, 1.0], ['bush-2', 260, 900, 1.05]
    ];
    bgDecor.forEach(([key, x, y, scale]) => {
      const isBush = key.startsWith('bush');
      const spr = this.add.sprite(x, y, key).setScale(scale).setAlpha(0.65);
      if (isBush) spr.play(`${key}-sway`);
    });

    this.add.sprite(350, 190, 'tree-1').play('tree-1-sway').setScale(1.0).setAlpha(0.55);
    this.add.sprite(width - 350, 190, 'tree-2').play('tree-2-sway').setScale(0.85).setAlpha(0.55);

    // Pre-rendered logo (gradient/outline/shadow baked in - see
    // gen_assets.py make_title_logo) in place of a flat Text title.
    this.add.image(width / 2, 205, 'title-logo').setScale(0.45);

    this.add.text(width / 2, 305, 'hatch monsters, place them along the path, hold the line', {
      fontFamily: 'monospace', fontSize: '22px', color: '#c8ceda'
    }).setOrigin(0.5).setStroke('#1c2530', 4);

    this.add.text(width / 2, 415, `Roster: ${Object.keys(gameState.roster).length} monster(s)`, {
      fontFamily: 'monospace', fontSize: '24px', color: '#e8ecf5'
    }).setOrigin(0.5).setStroke('#1c2530', 4);
    UiKit.iconLabel(this, width / 2, 456, 'icon-essence', `Essence: ${gameState.essence}   Mastery: ${gameState.mastery}`, {
      fontFamily: 'monospace', fontSize: '19px', color: '#f5c94b', stroke: '#1c2530', strokeThickness: 3
    }, 20);

    // Best-effort - a plain HTTP status check (see server/server.js), not a
    // multiplayer connection, so this never registers this player as
    // "present" in the shared world just for sitting on the main menu.
    // Silently shows nothing if there's no server (single-player still
    // needs none, same guarantee as everywhere else this pattern is used).
    this.onlineCountText = this.add.text(width / 2, 490, '', {
      fontFamily: 'monospace', fontSize: '15px', color: '#4a90d9'
    }).setOrigin(0.5).setStroke('#1c2530', 3);
    let leftMenu = false;
    this.events.once('shutdown', () => { leftMenu = true; });
    fetch('/status').then(res => res.ok ? res.json() : null).then(data => {
      if (!data || leftMenu) return; // player already navigated away by the time this resolved
      this.onlineCountText.setText(`● ${data.playerCount} Tamer${data.playerCount === 1 ? '' : 's'} online now`);
    }).catch(() => {});

    // The fast path - jump straight into a battle with whatever roster a
    // player already has (auto-filling a team only if one isn't set, never
    // overwriting a deliberate choice), skipping the Sanctuary/Team Select
    // review a brand-new player used to have to sit through before their
    // very first tower placement.
    UiKit.makeButton(this, width / 2, 580, 'Quick Play', () => {
      if (gameState.team.length === 0) {
        gameState.team = Object.keys(gameState.roster).slice(0, MAX_TEAM_SIZE);
      }
      gameState.resetRun();
      gameState.startStage(FIRST_STAGE_ID);
      this.scene.start('BattleScene');
    }, { size: 'large', tint: 0x8fdc8f });

    UiKit.makeButton(this, width / 2, 675, 'Monster Sanctuary', () => this.scene.start('SanctuaryScene'), { size: 'large' });
    UiKit.makeButton(this, width / 2, 770, 'Team & Battle', () => this.scene.start('RosterScene'), { size: 'large' });
    UiKit.makeButton(this, width / 2, 865, 'Mastery', () => this.scene.start('MasteryScene'), { size: 'large', tint: 0xf5c94b });

    UiKit.makeButton(this, width / 2, 960, 'Multiplayer World (Beta)', () => {
      gameState.inMultiplayerWorld = true;
      this.scene.start('WorldScene');
    }, { size: 'large', tint: 0xbfe8ff });

    UiKit.makeLink(this, width / 2, 1020, 'Leaderboard', () => this.scene.start('LeaderboardScene'), { fontSize: '19px' });

    this.showDailyLoginRewardIfDue();
  }

  // A reason to come back today beyond "I feel like it" - the one hook this
  // project was missing (see README). gameState.claimDailyLoginIfDue()
  // already applied the reward by the time this runs; this is purely the
  // "hey, that happened" moment - skippable/no-op if it's not due (already
  // claimed today, including earlier this same session).
  showDailyLoginRewardIfDue() {
    const reward = gameState.claimDailyLoginIfDue();
    if (!reward) return;

    const { width, height } = this.scale;
    const DEPTH = 100;
    const cy = height / 2;
    const destroyables = [];
    // Interactive with no handler, purely so it intercepts clicks - without
    // this, Quick Play/Monster Sanctuary sit interactive right underneath
    // this panel and a click "through" the modal would trigger them.
    const bg = this.add.rectangle(width / 2, cy, width, height, 0x000000, 0.7).setDepth(DEPTH).setInteractive();
    const panel = this.add.image(width / 2, cy, 'panel-overlay').setDepth(DEPTH);
    const title = this.add.text(width / 2, cy - 170, 'DAILY LOGIN!', {
      fontFamily: 'monospace', fontSize: '40px', color: '#f5c94b', fontStyle: 'bold'
    }).setOrigin(0.5).setStroke('#1c2530', 6).setDepth(DEPTH);
    const streakText = this.add.text(width / 2, cy - 118, `Day ${reward.day} - ${reward.streak} day streak`, {
      fontFamily: 'monospace', fontSize: '19px', color: '#c8ceda'
    }).setOrigin(0.5).setStroke('#1c2530', 4).setDepth(DEPTH);
    destroyables.push(bg, panel, title, streakText);

    // Reward-track preview - what today's claim looks like next to the rest
    // of the 7-day cycle, so a player can see day 7's payoff coming instead
    // of only ever finding out one day at a time.
    const cycleLen = DAILY_LOGIN_CYCLE_ESSENCE.length;
    const boxW = 104, boxGap = 8;
    const trackStartX = width / 2 - ((cycleLen - 1) * (boxW + boxGap)) / 2;
    const trackY = cy - 58;
    for (let i = 0; i < cycleLen; i++) {
      const day = i + 1;
      const isToday = day === reward.day;
      const x = trackStartX + i * (boxW + boxGap);
      const box = this.add.rectangle(x, trackY, boxW, 68, isToday ? 0x2f4a34 : 0x1c202a)
        .setStrokeStyle(isToday ? 3 : 2, isToday ? 0x4caf50 : 0x394258).setDepth(DEPTH);
      const dayLabel = this.add.text(x, trackY - 18, `Day ${day}`, {
        fontFamily: 'monospace', fontSize: '13px', color: isToday ? '#4caf50' : '#8a95ab'
      }).setOrigin(0.5).setDepth(DEPTH);
      const amountLabel = this.add.text(x, trackY + 12, `+${DAILY_LOGIN_CYCLE_ESSENCE[i]}`, {
        fontFamily: 'monospace', fontSize: '15px', color: isToday ? '#f5f7fa' : '#c8ceda', fontStyle: isToday ? 'bold' : 'normal'
      }).setOrigin(0.5).setDepth(DEPTH);
      destroyables.push(box, dayLabel, amountLabel);
    }

    const rewardLabel = UiKit.iconLabel(this, width / 2, cy + 8, 'icon-essence', `+${reward.essence} essence claimed`, {
      fontFamily: 'monospace', fontSize: '24px', color: '#f5f7fa', stroke: '#1c2530', strokeThickness: 4
    }, 22);
    rewardLabel.icon.setDepth(DEPTH);
    rewardLabel.text.setDepth(DEPTH);
    destroyables.push(rewardLabel.icon, rewardLabel.text);

    const claimBtn = UiKit.makeButton(this, width / 2, cy + 90, 'Claim', () => {
      destroyables.forEach(o => o.destroy());
      claimBtn.container.destroy();
    }, { size: 'large', tint: 0xf5c94b });
    claimBtn.container.setDepth(DEPTH);
  }
}
