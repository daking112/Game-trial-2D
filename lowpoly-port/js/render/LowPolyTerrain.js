// Low-poly battle-grid terrain: one faceted ground+path mesh (hand-built,
// non-indexed so path/grass boundaries stay hard-edged instead of blending),
// plus a scatter of low-poly trees/rocks along the grid's margins, both
// colored from data/biomes.js so the same stage reads as the same biome as
// the pixel-art version (grass/snow/desert/volcanic/cloud/crystal).
const LowPolyTerrain = (() => {
  function seededRandom(x, y, salt) {
    const v = Math.sin(x * 12.9898 + y * 78.233 + salt * 37.719) * 43758.5453;
    return v - Math.floor(v);
  }

  function biomeColors(biome) {
    const ground = new THREE.Color(biome.previewColor);
    const path = ground.clone().lerp(new THREE.Color(0x000000), 0.35).lerp(new THREE.Color(biome.pathFleckColors[0]), 0.4);
    return { ground, path };
  }

  // One big non-indexed BufferGeometry: 2 triangles (6 verts) per grid cell,
  // each cell's 6 verts sharing one flat color/height so cell boundaries -
  // especially the path/grass edge - stay crisp rather than gradient-blended.
  function buildGroundMesh(pathBlockedCells, biome) {
    const { ground, path } = biomeColors(biome);
    const positions = [], normals = [], colors = [];

    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        const isPath = pathBlockedCells.has(r + ',' + c);
        const { x: cx, z: cz } = cellToWorld(c, r);
        const x0 = cx - CELL / 2, x1 = cx + CELL / 2;
        const z0 = cz - CELL / 2, z1 = cz + CELL / 2;
        const h = isPath ? 0 : seededRandom(c, r, 11) * 0.07;

        const col = isPath
          ? path.clone().lerp(new THREE.Color(biome.pathFleckColors[seededRandom(c, r, 22) > 0.6 ? 1 : 0]), seededRandom(c, r, 33) * 0.3)
          : ground.clone().offsetHSL(0, 0, (seededRandom(c, r, 44) - 0.5) * 0.08);

        // Winding matters here (not just the normal attribute) - WebGL
        // culls back faces by actual triangle winding, and this order is
        // CCW as seen from above (+Y), matching the (0,1,0) normal pushed
        // below. The flipped order silently culled the whole ground plane
        // from the default top-down camera - caught via a Playwright shot
        // that showed empty sky where the grid should be.
        const verts = [
          [x0, h, z0], [x0, h, z1], [x1, h, z1],
          [x0, h, z0], [x1, h, z1], [x1, h, z0]
        ];
        verts.forEach(([vx, vy, vz]) => {
          positions.push(vx, vy, vz);
          normals.push(0, 1, 0);
          colors.push(col.r, col.g, col.b);
        });
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    return mesh;
  }

  function flatMat(color) {
    return new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85 });
  }

  function meshAt(geo, mat, x, y, z) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  function buildTree(tint) {
    const g = new THREE.Group();
    const trunkColor = tint ? new THREE.Color(0x6b4a2f).lerp(new THREE.Color(tint), 0.35) : 0x6b4a2f;
    const leafColor = tint ? new THREE.Color(0x2f8f4f).lerp(new THREE.Color(tint), 0.45) : 0x2f8f4f;
    const leafColor2 = tint ? new THREE.Color(0x3aa85c).lerp(new THREE.Color(tint), 0.45) : 0x3aa85c;
    g.add(meshAt(new THREE.CylinderGeometry(0.09, 0.13, 0.75, 6), flatMat(trunkColor), 0, 0.38, 0));
    g.add(meshAt(new THREE.ConeGeometry(0.6, 1.1, 7), flatMat(leafColor), 0, 1.15, 0));
    g.add(meshAt(new THREE.ConeGeometry(0.42, 0.8, 7), flatMat(leafColor2), 0, 1.6, 0));
    return g;
  }

  function buildRock(tint) {
    const geo = new THREE.IcosahedronGeometry(0.32, 0);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const s = 0.85 + Math.random() * 0.3;
      pos.setXYZ(i, pos.getX(i) * s, pos.getY(i) * s, pos.getZ(i) * s);
    }
    geo.computeVertexNormals();
    const color = tint ? new THREE.Color(0x8a8a8a).lerp(new THREE.Color(tint), 0.4) : 0x8a8a8a;
    const rock = meshAt(geo, flatMat(color), 0, 0.2, 0);
    rock.rotation.set(Math.random(), Math.random(), Math.random());
    return rock;
  }

  function buildDecorations(biome) {
    const group = new THREE.Group();
    const tint = biome.decorTint;
    const halfW = (GRID_COLS / 2) * CELL, halfH = (GRID_ROWS / 2) * CELL;
    const marginX = halfW + 1.3;
    const rowSpacing = CELL * 2.2;
    const rows = Math.ceil((GRID_ROWS * CELL) / rowSpacing);
    for (let i = 0; i < rows; i++) {
      const z = -halfH + i * rowSpacing + rowSpacing / 2;
      [-marginX, marginX].forEach((x, side) => {
        const kind = (i + side) % 3 === 0 ? 'rock' : 'tree';
        const deco = kind === 'tree' ? buildTree(tint) : buildRock(tint);
        deco.position.set(x + (Math.random() - 0.5) * 0.6, 0, z + (Math.random() - 0.5) * 0.6);
        deco.rotation.y = Math.random() * Math.PI * 2;
        deco.scale.setScalar(0.85 + Math.random() * 0.35);
        group.add(deco);
      });
    }
    return group;
  }

  function build(stage, pathBlockedCells) {
    const biome = getBiome(stage.biome);
    const group = new THREE.Group();
    group.add(buildGroundMesh(pathBlockedCells, biome));
    group.add(buildDecorations(biome));
    return group;
  }

  return { build };
})();
