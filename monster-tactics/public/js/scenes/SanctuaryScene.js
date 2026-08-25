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
    const { width, height } = this.scale;

    this.add.tileSprite(width / 2, height / 2, width, height, 'tile-grass');
    this.add.rectangle(width / 2, height / 2, width, height, 0x12151d, 0.68);
    this.add.image(width / 2, height / 2, 'vignette').setDisplaySize(width, height);

    this.add.text(width / 2, 60, 'MONSTER SANCTUARY', {
      fontFamily: 'monospace', fontSize: '39px', color: '#f5f7fa', fontStyle: 'bold'
    }).setOrigin(0.5).setStroke('#1c2530', 6);
    UiKit.iconLabel(this, width / 2, 102, 'icon-essence', `Essence: ${gameState.essence}`, {
      fontFamily: 'monospace', fontSize: '22px', color: '#f5c94b', stroke: '#1c2530', strokeThickness: 4
    }, 24);

    const backTarget = gameState.inMultiplayerWorld ? 'WorldScene' : (gameState.runActive ? 'HubScene' : 'MenuScene');
    this.backBtn(backTarget, () => this.scene.start(backTarget));

    const cols = 3, cardW = 330, cardH = 195;
    const startX = width / 2 - cardW;
    const startY = 260;
    BANNERS.forEach((banner, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const x = startX + col * cardW;
      const y = startY + row * cardH;
      this.buildBannerCard(banner, x, y, cardW - 24, cardH - 24);
    });
  }

  buildBannerCard(banner, x, y, w, h) {
    // Soft offset shadow - see UiKit.makeButton's identical trick.
    this.add.image(x + 5, y + 7, 'panel-card-banner').setTint(0x000000).setAlpha(0.3);
    const bg = this.add.image(x, y, 'panel-card-banner').setInteractive({ useHandCursor: true });
    bg.on('pointerover', () => bg.setScale(1.03));
    bg.on('pointerout', () => bg.setScale(1));
    bg.on('pointerdown', () => { Sfx.click(); this.showPullView(banner); });

    this.add.text(x, y - 48, banner.icon, { fontSize: '42px' }).setOrigin(0.5);
    this.add.text(x, y - 3, banner.name, {
      fontFamily: 'monospace', fontSize: '19px', color: '#f5f7fa', fontStyle: 'bold'
    }).setOrigin(0.5).setStroke('#1c2530', 4);
    this.add.text(x, y + 30, banner.blurb, {
      fontFamily: 'monospace', fontSize: '15px', color: '#e8ecf5', align: 'center', wordWrap: { width: w - 30 }
    }).setOrigin(0.5).setStroke('#1c2530', 3);
  }

  // ---------- pull view ----------

  showPullView(banner) {
    this.clearScreen();
    this.view = 'pull';
    this.activeBanner = banner;
    const { width, height } = this.scale;

    this.add.tileSprite(width / 2, height / 2, width, height, 'tile-grass');
    this.add.rectangle(width / 2, height / 2, width, height, 0x12151d, 0.68);
    this.add.image(width / 2, height / 2, 'vignette').setDisplaySize(width, height);

    this.add.text(width / 2, 60, `${banner.icon} ${banner.name.toUpperCase()}`, {
      fontFamily: 'monospace', fontSize: '36px', color: '#f5f7fa', fontStyle: 'bold'
    }).setOrigin(0.5).setStroke('#1c2530', 6);

    UiKit.makeLink(this, 30, 30, '< Banners', () => this.showBannerList(), { originX: 0, originY: 0 });

    this.essenceText = UiKit.iconLabel(this, width / 2, 115, 'icon-essence', `Essence: ${gameState.essence}`, {
      fontFamily: 'monospace', fontSize: '24px', color: '#f5c94b', stroke: '#1c2530', strokeThickness: 4
    }, 26).text;

    this.eggY = 320;
    this.eggSprite = this.add.image(width / 2, this.eggY, 'panel-egg');
    this.eggLabel = this.add.text(width / 2, this.eggY, '?', {
      fontFamily: 'monospace', fontSize: '54px', color: '#f5c94b', fontStyle: 'bold'
    }).setOrigin(0.5).setStroke('#1c2530', 6);

    this.resultSprite = null;
    this.resultText = this.add.text(width / 2, 460, '', {
      fontFamily: 'monospace', fontSize: '27px', color: '#f5f7fa', align: 'center'
    }).setOrigin(0.5).setStroke('#1c2530', 4);
    this.resultSubText = this.add.text(width / 2, 500, '', {
      fontFamily: 'monospace', fontSize: '19px', color: '#c8ceda', align: 'center'
    }).setOrigin(0.5).setStroke('#1c2530', 3);

    this.openBtn = UiKit.makeButton(this, width / 2, 600, `Open Egg (${EGG_COST} essence)`, () => this.openEgg(), { size: 'large' });
    this.refreshOpenBtn();

    this.oddsText = this.add.text(width / 2, 690, this.oddsString(banner), {
      fontFamily: 'monospace', fontSize: '17px', color: '#c8ceda', align: 'center'
    }).setOrigin(0.5).setStroke('#1c2530', 3);
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
    Sfx.egg();
    this.updateEssenceText();
    this.refreshOpenBtn();

    const species = rollGachaSpecies(this.activeBanner.types);
    const result = gameState.addToRoster(species.id);

    if (this.resultSprite) this.resultSprite.destroy();
    this.resultSprite = this.add.sprite(this.scale.width / 2, this.eggY, species.sheetKey, species.frame).setScale(0);
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
      const ultimateLine = archetype.ultimateLabel
        ? `\nUltimate: ${archetype.ultimateLabel} (charges on ${archetype.ultimateChargeHits} hits)`
        : '';
      this.resultSubText.setText(
        `Type ${species.type}   HP ${species.maxHp} / ATK ${species.attack}\n` +
        `Attack: ${archetype.attackLabel}   Ability: ${archetype.abilityLabel}${ultimateLine}`
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
    const label = target === 'HubScene' ? '< Hub' : target === 'WorldScene' ? '< World' : '< Menu';
    UiKit.makeLink(this, 30, 30, label, onClick, { originX: 0, originY: 0 });
  }
}
