const HUB_COUNTDOWN_SECONDS = 20;

class HubScene extends Phaser.Scene {
  constructor() {
    super('HubScene');
  }

  create() {
    const { width } = this.scale;

    this.add.tileSprite(width / 2, 320, width, 640, 'tile-grass');
    this.add.rectangle(width / 2, 320, width, 640, 0x12151d, 0.62);

    this.add.text(width / 2, 40, 'STAGE CLEAR', {
      fontFamily: 'monospace', fontSize: '28px', color: '#f5f7fa', fontStyle: 'bold'
    }).setOrigin(0.5).setStroke('#1c2530', 4);
    this.add.text(width / 2, 72, `Run progress: stage ${gameState.stageInRun}/${RUN_TARGET_STAGES}`, {
      fontFamily: 'monospace', fontSize: '14px', color: '#c8ceda'
    }).setOrigin(0.5).setStroke('#1c2530', 3);
    this.add.text(width / 2, 92, `Lives ${gameState.lives}/${gameState.maxLives}   Score ${gameState.score}   Essence ${gameState.essence}`, {
      fontFamily: 'monospace', fontSize: '13px', color: '#9aa4b8'
    }).setOrigin(0.5).setStroke('#1c2530', 3);

    this.add.text(width / 2, 140, 'Choose the next stage:', {
      fontFamily: 'monospace', fontSize: '15px', color: '#f5f7fa'
    }).setOrigin(0.5).setStroke('#1c2530', 3);

    // A lightweight single-player stand-in for "vote on the next map" - see
    // data/stages.js. Pre-select the first option so Ready/the countdown
    // always has a valid target even if the player never clicks a card.
    this.choices = pickStageChoices(2, gameState.currentStageId);
    this.selectedStageId = this.choices[0].id;
    this.stageCards = [];
    const cardSpacing = 260;
    this.choices.forEach((stage, i) => {
      const x = width / 2 + (i - (this.choices.length - 1) / 2) * cardSpacing;
      this.buildStageCard(stage, x, 230);
    });

    UiKit.makeButton(this, width / 2, 350, 'Monster Sanctuary', () => this.scene.start('SanctuaryScene'));
    UiKit.makeButton(this, width / 2, 415, 'Team & Upgrades', () => this.scene.start('RosterScene'));

    this.readyBtn = UiKit.makeButton(this, width / 2, 500, 'Ready!', () => this.proceed(), { tint: 0x8fdc8f });

    this.countdownText = this.add.text(width / 2, 545, '', {
      fontFamily: 'monospace', fontSize: '13px', color: '#c8ceda'
    }).setOrigin(0.5).setStroke('#1c2530', 3);
    this.remaining = HUB_COUNTDOWN_SECONDS;
    this.updateCountdownText();
    this.countdownEvent = this.time.addEvent({ delay: 1000, loop: true, callback: () => this.tickCountdown() });

    UiKit.makeLink(this, width / 2, 600, 'Abandon Run (return to Menu)', () => this.scene.start('MenuScene'), {
      color: '#5a6478', hoverColor: '#e0562f'
    });
  }

  buildStageCard(stage, x, y) {
    const w = 220, h = 130;
    const bg = this.add.image(x, y, 'panel-card-hub').setInteractive({ useHandCursor: true });
    const selectionRing = this.add.rectangle(x, y, w + 6, h + 6, 0xffffff, 0).setStrokeStyle(3, 0x4caf50).setVisible(false);

    this.add.text(x, y - 30, stage.name, {
      fontFamily: 'monospace', fontSize: '15px', color: '#f5f7fa', fontStyle: 'bold', align: 'center', wordWrap: { width: w - 30 }
    }).setOrigin(0.5).setStroke('#1c2530', 3);
    this.add.text(x, y + 5, `${stage.pathCells.length} turns`, {
      fontFamily: 'monospace', fontSize: '11px', color: '#e8ecf5'
    }).setOrigin(0.5).setStroke('#1c2530', 2);

    const card = { bg, selectionRing, stageId: stage.id };
    this.stageCards.push(card);
    this.refreshStageCard(card);

    bg.on('pointerdown', () => {
      this.selectedStageId = stage.id;
      this.stageCards.forEach(c => this.refreshStageCard(c));
    });
  }

  refreshStageCard(card) {
    card.selectionRing.setVisible(this.selectedStageId === card.stageId);
  }

  tickCountdown() {
    this.remaining -= 1;
    this.updateCountdownText();
    if (this.remaining <= 0) {
      this.proceed();
    }
  }

  updateCountdownText() {
    this.countdownText.setText(`Next stage in ${Math.max(0, this.remaining)}s (or click Ready)`);
  }

  proceed() {
    if (this.countdownEvent) this.countdownEvent.remove(false);
    gameState.startStage(this.selectedStageId);
    this.scene.start('BattleScene');
  }
}
