class SanctuaryScene extends Phaser.Scene {
  constructor() {
    super('SanctuaryScene');
  }

  create() {
    this.view = 'banners'; // 'banners' | 'pull'
    this.activeBanner = null;
    this.showBannerList();
  }

  clearScreen() {
    this.children.removeAll(true);
  }

  // ---------- banner list ----------

  showBannerList() {
    this.clearScreen();
    this.view = 'banners';
    const { width } = this.scale;

    this.add.tileSprite(width / 2, 320, width, 640, 'tile-grass');
    this.add.rectangle(width / 2, 320, width, 640, 0x12151d, 0.68);

    this.add.text(width / 2, 40, 'MONSTER SANCTUARY', {
      fontFamily: 'monospace', fontSize: '26px', color: '#f5f7fa', fontStyle: 'bold'
    }).setOrigin(0.5).setStroke('#1c2530', 4);
    this.add.text(width / 2, 68, `Essence: ${gameState.essence}`, {
      fontFamily: 'monospace', fontSize: '15px', color: '#f5c94b'
    }).setOrigin(0.5).setStroke('#1c2530', 3);

    const backTarget = gameState.runActive ? 'HubScene' : 'MenuScene';
    this.backBtn(backTarget, () => this.scene.start(backTarget));

    const cols = 3, cardW = 220, cardH = 130;
    const startX = width / 2 - cardW;
    const startY = 160;
    BANNERS.forEach((banner, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const x = startX + col * cardW;
      const y = startY + row * cardH;
      this.buildBannerCard(banner, x, y, cardW - 16, cardH - 16);
    });
  }

  buildBannerCard(banner, x, y, w, h) {
    const bg = this.add.image(x, y, 'panel-card-banner').setInteractive({ useHandCursor: true });
    bg.on('pointerover', () => bg.setScale(1.03));
    bg.on('pointerout', () => bg.setScale(1));
    bg.on('pointerdown', () => this.showPullView(banner));

    this.add.text(x, y - 32, banner.icon, { fontSize: '28px' }).setOrigin(0.5);
    this.add.text(x, y - 2, banner.name, {
      fontFamily: 'monospace', fontSize: '13px', color: '#f5f7fa', fontStyle: 'bold'
    }).setOrigin(0.5).setStroke('#1c2530', 3);
    this.add.text(x, y + 20, banner.blurb, {
      fontFamily: 'monospace', fontSize: '10px', color: '#e8ecf5', align: 'center', wordWrap: { width: w - 20 }
    }).setOrigin(0.5).setStroke('#1c2530', 2);
  }

  // ---------- pull view ----------

  showPullView(banner) {
    this.clearScreen();
    this.view = 'pull';
    this.activeBanner = banner;
    const { width } = this.scale;

    this.add.tileSprite(width / 2, 320, width, 640, 'tile-grass');
    this.add.rectangle(width / 2, 320, width, 640, 0x12151d, 0.68);

    this.add.text(width / 2, 40, `${banner.icon} ${banner.name.toUpperCase()}`, {
      fontFamily: 'monospace', fontSize: '24px', color: '#f5f7fa', fontStyle: 'bold'
    }).setOrigin(0.5).setStroke('#1c2530', 4);

    UiKit.makeLink(this, 24, 24, '< Banners', () => this.showBannerList(), { originX: 0, originY: 0 });

    this.essenceText = this.add.text(width / 2, 78, '', {
      fontFamily: 'monospace', fontSize: '16px', color: '#f5c94b'
    }).setOrigin(0.5).setStroke('#1c2530', 3);
    this.updateEssenceText();

    this.eggSprite = this.add.image(width / 2, 210, 'panel-egg');
    this.eggLabel = this.add.text(width / 2, 210, '?', {
      fontFamily: 'monospace', fontSize: '36px', color: '#f5c94b', fontStyle: 'bold'
    }).setOrigin(0.5).setStroke('#1c2530', 4);

    this.resultSprite = null;
    this.resultText = this.add.text(width / 2, 310, '', {
      fontFamily: 'monospace', fontSize: '18px', color: '#f5f7fa', align: 'center'
    }).setOrigin(0.5).setStroke('#1c2530', 3);
    this.resultSubText = this.add.text(width / 2, 335, '', {
      fontFamily: 'monospace', fontSize: '13px', color: '#c8ceda', align: 'center'
    }).setOrigin(0.5).setStroke('#1c2530', 2);

    this.openBtn = UiKit.makeButton(this, width / 2, 410, `Open Egg (${EGG_COST} essence)`, () => this.openEgg(), { size: 'large' });
    this.refreshOpenBtn();

    this.oddsText = this.add.text(width / 2, 470, this.oddsString(banner), {
      fontFamily: 'monospace', fontSize: '11px', color: '#c8ceda', align: 'center'
    }).setOrigin(0.5).setStroke('#1c2530', 2);
  }

  oddsString(banner) {
    const pool = banner.types ? SPECIES.filter(s => banner.types.includes(s.type)) : SPECIES;
    const availableRarities = Object.values(RARITY).filter(r => pool.some(s => s.rarity === r.id));
    const total = availableRarities.reduce((s, r) => s + r.weight, 0);
    return availableRarities.map(r => `${r.label} ${Math.round((r.weight / total) * 100)}%`).join('   ');
  }

  updateEssenceText() {
    this.essenceText.setText(`Essence: ${gameState.essence}`);
  }

  refreshOpenBtn() {
    const affordable = gameState.essence >= EGG_COST;
    this.openBtn.bg.setTint(affordable ? 0xffffff : 0x777777);
    this.openBtn.text.setColor(affordable ? '#f5f7fa' : '#8a95ab');
  }

  openEgg() {
    if (!gameState.spendEssence(EGG_COST)) return;
    this.updateEssenceText();
    this.refreshOpenBtn();

    const species = rollGachaSpecies(this.activeBanner.types);
    const result = gameState.addToRoster(species.id);

    if (this.resultSprite) this.resultSprite.destroy();
    this.resultSprite = this.add.sprite(this.scale.width / 2, 210, species.sheetKey, species.frame).setScale(0);
    this.eggSprite.setVisible(false);
    this.eggLabel.setVisible(false);

    this.tweens.add({
      targets: this.resultSprite,
      scale: 2.0,
      duration: 300,
      ease: 'Back.Out',
      onComplete: () => {
        this.time.delayedCall(700, () => {
          this.eggSprite.setVisible(true);
          this.eggLabel.setVisible(true);
          if (this.resultSprite) { this.resultSprite.destroy(); this.resultSprite = null; }
        });
      }
    });

    const rarity = RARITY[species.rarity];
    const archetype = COMBAT_ARCHETYPES[species.type];
    this.resultText.setColor(Phaser.Display.Color.IntegerToColor(rarity.color).rgba);

    if (result.isNew) {
      this.resultText.setText(`New! ${rarity.label}: ${species.name}`);
      this.resultSubText.setText(
        `Type ${species.type}   HP ${species.maxHp} / ATK ${species.attack}\n` +
        `Attack: ${archetype.attackLabel}   Ability: ${archetype.abilityLabel}`
      );
    } else {
      this.resultText.setText(`Duplicate: ${species.name}`);
      this.resultSubText.setText(
        `+${result.essenceGained} Monster Essence for ${species.name}\n` +
        `(spend it in Team Select to level them up)`
      );
    }
  }

  backBtn(target, onClick) {
    const label = target === 'HubScene' ? '< Hub' : '< Menu';
    UiKit.makeLink(this, 24, 24, label, onClick, { originX: 0, originY: 0 });
  }
}
