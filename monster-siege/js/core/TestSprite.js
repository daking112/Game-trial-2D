// Placeholder pixel-art sprite for verifying the render pipeline (billboard
// facing, alpha cutout, shadow casting, animation frame stepping) before
// the real species art pipeline (piece #45) exists. A simple 2-frame idle
// blob - not meant to pass any art critique itself.
const PX = 4; // final on-screen pixels per grid cell, before the engine's own low-res upscale

function drawPixelGrid(ctx, rows, palette, offsetX) {
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.') continue;
      ctx.fillStyle = palette[ch];
      ctx.fillRect(offsetX + x * PX, y * PX, PX, PX);
    }
  }
}

function makeTestSlimeCanvas() {
  const palette = { K: '#1c2530', b: '#3d8fd6', c: '#2a6fae', h: '#bfe0ff', e: '#0b1520' };
  const bodyDown = [
    '................',
    '.....KKKKKK.....',
    '....KbbbbbbK....',
    '...KbbbbbbbbK...',
    '..KbbcbbbbcbbK..',
    '..KbbcbbbbcbbK..',
    '.Kbbbbbbbbbbbbк.'.replace('к', 'K'),
    '.KbhhKbbbbKhhbK.',
    '.KbhhKbeebKhhbK.',
    '.Kbbbbbeebbbbbк.'.replace('к', 'K'),
    '..Kbbbbbbbbbbк..'.replace('к', 'K'),
    '..KccbbbbbbccK..',
    '...KcccccccK....',
    '....KKKKKKK.....',
    '................',
    '................'
  ];
  const bodyBob = bodyDown.slice(1).concat(['................']);

  const cvs = document.createElement('canvas');
  cvs.width = 16 * PX * 2;
  cvs.height = 16 * PX;
  const ctx = cvs.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  drawPixelGrid(ctx, bodyDown, palette, 0);
  drawPixelGrid(ctx, bodyBob, palette, 16 * PX);
  return cvs;
}
