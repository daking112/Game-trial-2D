const HUB_COUNTDOWN_SECONDS = 20;

class HubScene extends Phaser.Scene {
  constructor() {
    super('HubScene');
  }

  create() {
    const { width, height } = this.scale;

    this.add.tileSprite(width / 2, height / 2, width, height, 'tile-grass');
    this.add.rectangle(width / 2, height / 2, width, height, 0x12151d, 0.62);
    this.add.image(width / 2, height / 2, 'vignette').setDisplaySize(width, height);

    this.add.text(width / 2, 65, 'STAGE CLEAR', {
      fontFamily: 'monospace', fontSize: '42px', color: '#f5f7fa', fontStyle: 'bold'
    }).setOrigin(0.5).setStroke('#1c2530', 6);
    this.add.text(width / 2, 118, `Run progress: stage ${gameState.stageInRun}/${RUN_TARGET_STAGES}`, {
      fontFamily: 'monospace', fontSize: '21px', color: '#c8ceda'
    }).setOrigin(0.5).setStroke('#1c2530', 4);
    this.add.text(width / 2, 152, `Lives ${gameState.lives}/${gameState.maxLives}   Score ${gameState.score}   Essence ${gameState.essence}`, {
      fontFamily: 'monospace', fontSize: '19px', color: '#9aa4b8'
    }).setOrigin(0.5).setStroke('#1c2530', 3);

    this.add.text(width / 2, 220, 'Choose the next stage:', {
      fontFamily: 'monospace', fontSize: '22px', color: '#f5f7fa'
    }).setOrigin(0.5).setStroke('#1c2530', 4);

    // A lightweight single-player stand-in for "vote on the next map" - see
    // data/stages.js. Pre-select the first option so Ready/the countdown
    // always has a valid target even if the player never clicks a card.
    this.choices = pickStageChoices(2, gameState.currentStageId);
    this.selectedStageId = this.choices[0].id;
    this.stageCards = [];
    const cardSpacing = 390;
    this.choices.forEach((stage, i) => {
      const x = width / 2 + (i - (this.choices.length - 1) / 2) * cardSpacing;
      this.buildStageCard(stage, x, 370);
    });

    UiKit.makeButton(this, width / 2, 560, 'Monster Sanctuary', () => this.scene.start('SanctuaryScene'), { size: 'large' });
    UiKit.makeButton(this, width / 2, 660, 'Team & Upgrades', () => this.scene.start('RosterScene'), { size: 'large' });
    UiKit.makeLink(this, width / 2, 715, `Mastery: ${gameState.mastery} - spend it >`, () => this.scene.start('MasteryScene'), { fontSize: '17px' });

    this.readyBtn = UiKit.makeButton(this, width / 2, 790, 'Ready!', () => this.proceed(), { tint: 0x8fdc8f, size: 'large' });

    this.countdownText = this.add.text(width / 2, 855, '', {
      fontFamily: 'monospace', fontSize: '19px', color: '#c8ceda'
    }).setOrigin(0.5).setStroke('#1c2530', 3);
    this.remaining = HUB_COUNTDOWN_SECONDS;
    this.updateCountdownText();
    this.countdownEvent = this.time.addEvent({ delay: 1000, loop: true, callback: () => this.tickCountdown() });

    UiKit.makeLink(this, width / 2, 950, 'Abandon Run (return to Menu)', () => this.scene.start('MenuScene'), {
      color: '#5a6478', hoverColor: '#e0562f'
    });
  }

  buildStageCard(stage, x, y) {
    const w = 330, h = 195;
    // Soft offset shadow - see UiKit.makeButton's identical trick.
    this.add.image(x + 5, y + 7, 'panel-card-hub').setTint(0x000000).setAlpha(0.3);
    const bg = this.add.image(x, y, 'panel-card-hub').setInteractive({ useHandCursor: true });
    const selectionRing = this.add.rectangle(x, y, w + 8, h + 8, 0xffffff, 0).setStrokeStyle(4, 0x4caf50).setVisible(false);

    this.add.text(x, y - 45, stage.name, {
      fontFamily: 'monospace', fontSize: '22px', color: '#f5f7fa', fontStyle: 'bold', align: 'center', wordWrap: { width: w - 40 }
    }).setOrigin(0.5).setStroke('#1c2530', 4);
    this.add.text(x, y + 8, `${stage.pathCells.length} turns`, {
      fontFamily: 'monospace', fontSize: '17px', color: '#e8ecf5'
    }).setOrigin(0.5).setStroke('#1c2530', 3);

    const card = { bg, selectionRing, stageId: stage.id };
    this.stageCards.push(card);
    this.refreshStageCard(card);

    bg.on('pointerdown', () => {
      Sfx.click();
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
