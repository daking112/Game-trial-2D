// Shared button/panel factory backed by the hand-stitched UI textures (see
// assets/ui/*.png and the generation notes in README.md). Every scene used
// to hand-roll its own makeButton() as a plain rectangle + stroke; this
// replaces all of those with one consistent, reusable look.
const UiKit = {
  makeButton(scene, x, y, label, onClick, opts = {}) {
    const size = opts.size || 'medium'; // 'large' | 'medium'
    const textureKey = size === 'large' ? 'btn-large' : 'btn-medium';
    const fontSize = opts.fontSize || (size === 'large' ? '27px' : '23px');

    const bg = scene.add.image(0, 0, textureKey);
    if (opts.tint) bg.setTint(opts.tint);
    bg.setInteractive({ useHandCursor: true });

    const text = scene.add.text(0, 0, label, {
      fontFamily: 'monospace', fontSize, color: '#f5f7fa', fontStyle: 'bold'
    }).setOrigin(0.5).setStroke('#1c2530', 4);

    const container = scene.add.container(x, y, [bg, text]);

    // Hover-only feedback (no separate press-tween) - some callers (e.g.
    // BattleScene's overlay) dynamically swap the click handler later via
    // bg.off('pointerdown')/bg.once('pointerdown', ...), which would also
    // strip a press animation bundled into the same listener.
    bg.on('pointerover', () => container.setScale(1.03));
    bg.on('pointerout', () => container.setScale(1));
    bg.on('pointerdown', onClick);

    return {
      container, bg, text,
      setLabel: (t) => text.setText(t),
      setPosition: (nx, ny) => container.setPosition(nx, ny)
    };
  },

  // Small text link (context-nav / detour links) - not a full button, just a
  // consistent hover-color treatment so every scene's "< Back" / secondary
  // link reads the same.
  makeLink(scene, x, y, label, onClick, opts = {}) {
    const text = scene.add.text(x, y, label, {
      fontFamily: 'monospace', fontSize: opts.fontSize || '19px', color: opts.color || '#9aa4b8'
    }).setOrigin(opts.originX ?? 0.5, opts.originY ?? 0.5).setInteractive({ useHandCursor: true });
    const hoverColor = opts.hoverColor || '#f5f7fa';
    const baseColor = opts.color || '#9aa4b8';
    text.on('pointerover', () => text.setColor(hoverColor));
    text.on('pointerout', () => text.setColor(baseColor));
    text.on('pointerdown', onClick);
    return text;
  },

  panel(scene, x, y, textureKey) {
    return scene.add.image(x, y, textureKey);
  },

  // A centered "icon + text" pair (e.g. a coin/essence icon next to its
  // count) - text is created first so its actual rendered width positions
  // the icon immediately to its left, rather than guessing an offset.
  iconLabel(scene, x, y, iconKey, label, textStyle, iconSize = 16) {
    const text = scene.add.text(x, y, label, textStyle).setOrigin(0, 0.5);
    const iconGap = 6;
    const halfWidth = (text.width + iconSize + iconGap) / 2;
    text.setX(x - halfWidth + iconSize + iconGap);
    const icon = scene.add.image(x - halfWidth + iconSize / 2, y, iconKey)
      .setOrigin(0.5).setDisplaySize(iconSize, iconSize);
    return { icon, text };
  }
};
