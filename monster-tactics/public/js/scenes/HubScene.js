const HUB_COUNTDOWN_SECONDS = 20;

class HubScene extends Phaser.Scene {
  constructor() {
    super('HubScene');
  }

  create() {
    const { width } = this.scale;

    this.add.text(width / 2, 40, 'STAGE CLEAR', {
      fontFamily: 'monospace', fontSize: '28px', color: '#f5f7fa', fontStyle: 'bold'
    }).setOrigin(0.5);
    this.add.text(width / 2, 72, `Run progress: stage ${gameState.stageInRun}/${RUN_TARGET_STAGES}`, {
      fontFamily: 'monospace', fontSize: '14px', color: '#c8ceda'
    }).setOrigin(0.5);
    this.add.text(width / 2, 92, `Lives ${gameState.lives}/${gameState.maxLives}   Score ${gameState.score}   Essence ${gameState.essence}`, {
      fontFamily: 'monospace', fontSize: '13px', color: '#9aa4b8'
    }).setOrigin(0.5);

    this.add.text(width / 2, 140, 'Choose the next stage:', {
      fontFamily: 'monospace', fontSize: '15px', color: '#f5f7fa'
    }).setOrigin(0.5);

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

    this.makeButton(width / 2, 350, 'Monster Sanctuary', () => this.scene.start('SanctuaryScene'));
    this.makeButton(width / 2, 415, 'Team & Upgrades', () => this.scene.start('RosterScene'));

    this.readyBtn = this.makeButton(width / 2, 500, 'Ready!', () => this.proceed(), 0x2f4a34, '#4caf50');

    this.countdownText = this.add.text(width / 2, 545, '', {
      fontFamily: 'monospace', fontSize: '13px', color: '#9aa4b8'
    }).setOrigin(0.5);
    this.remaining = HUB_COUNTDOWN_SECONDS;
    this.updateCountdownText();
    this.countdownEvent = this.time.addEvent({ delay: 1000, loop: true, callback: () => this.tickCountdown() });

    const abandon = this.add.text(width / 2, 600, 'Abandon Run (return to Menu)', {
      fontFamily: 'monospace', fontSize: '12px', color: '#5a6478'
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    abandon.on('pointerover', () => abandon.setColor('#e0562f'));
    abandon.on('pointerout', () => abandon.setColor('#5a6478'));
    abandon.on('pointerdown', () => this.scene.start('MenuScene'));
  }

  buildStageCard(stage, x, y) {
    const w = 220, h = 130;
    const bg = this.add.rectangle(x, y, w, h, 0x2a3040).setStrokeStyle(2, 0x4a5468);
    bg.setInteractive({ useHandCursor: true });

    this.add.text(x, y - 30, stage.name, {
      fontFamily: 'monospace', fontSize: '15px', color: '#f5f7fa', fontStyle: 'bold', align: 'center', wordWrap: { width: w - 20 }
    }).setOrigin(0.5);
    this.add.text(x, y, `${stage.pathCells.length} turns`, {
      fontFamily: 'monospace', fontSize: '11px', color: '#9aa4b8'
    }).setOrigin(0.5);

    const card = { bg, stageId: stage.id };
    this.stageCards.push(card);
    this.refreshStageCard(card);

    bg.on('pointerdown', () => {
      this.selectedStageId = stage.id;
      this.stageCards.forEach(c => this.refreshStageCard(c));
    });
  }

  refreshStageCard(card) {
    const selected = this.selectedStageId === card.stageId;
    card.bg.setStrokeStyle(selected ? 3 : 2, selected ? 0x4caf50 : 0x4a5468);
    card.bg.setFillStyle(selected ? 0x223428 : 0x2a3040);
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

  makeButton(x, y, label, onClick, fillColor, textColor) {
    const w = 240, h = 48;
    const bg = this.add.rectangle(x, y, w, h, fillColor || 0x2a3040).setStrokeStyle(2, 0x4a5468);
    const text = this.add.text(x, y, label, {
      fontFamily: 'monospace', fontSize: '16px', color: textColor || '#f5f7fa'
    }).setOrigin(0.5);

    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerover', () => bg.setFillStyle(0x394258));
    bg.on('pointerout', () => bg.setFillStyle(fillColor || 0x2a3040));
    bg.on('pointerdown', onClick);

    return { bg, text };
  }
}
