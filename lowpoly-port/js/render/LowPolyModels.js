// Procedural low-poly creature models, one function call per species.
//
// There are 99 tower species (33 base + 66 evolved) and 12 enemy species in
// data/monsters.js - far too many to hand-sculpt individually for this port.
// Instead every species gets a REAL, distinct-looking low-poly creature built
// from a deterministic recipe keyed off its own data: a hash of the species
// id picks one of six body archetypes (quadruped/biped/serpentine/winged/
// blob/armored) and a silhouette variation within it, species.type picks the
// base color family (same TYPE_COLORS used by the pixel-art version), and
// evolution tier (base/mid/final, see towerTier below) scales size and adds
// extra detail (horns, wings, a glow ring) so an evolved form reads as a
// grown-up version of the same creature, not a random new one - same
// intent as the pixel game's real sprite chains, just procedural instead of
// hand-drawn. The same species id always builds the same model.
const LowPoly = (() => {
  function hashStr(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  // Deterministic PRNG (mulberry32) seeded from the hash above - same
  // species id always produces the same sequence of "random" shape choices.
  function rngFor(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
  function range(rng, lo, hi) { return lo + rng() * (hi - lo); }

  // base (SPECIES) -> tier 0, "_mid" evolved -> tier 1, "_evo" evolved -> tier 2.
  // Enemies aren't tiered the same way - bosses just get tier 2 for scale/detail.
  function towerTier(speciesId) {
    if (speciesId.endsWith('_evo')) return 2;
    if (speciesId.endsWith('_mid')) return 1;
    return 0;
  }

  function toThreeColor(hex) {
    return new THREE.Color(hex);
  }

  // A handful of tint variants derived from the type's base color so
  // same-type species aren't all one identical flat hue.
  function paletteFromType(typeHex, rng) {
    const base = toThreeColor(typeHex);
    const hsl = { h: 0, s: 0, l: 0 };
    base.getHSL(hsl);
    const primary = new THREE.Color().setHSL(
      (hsl.h + range(rng, -0.04, 0.04) + 1) % 1,
      THREE.MathUtils.clamp(hsl.s + range(rng, -0.1, 0.1), 0.25, 1),
      THREE.MathUtils.clamp(hsl.l + range(rng, -0.08, 0.05), 0.25, 0.72)
    );
    const secondary = primary.clone().offsetHSL(0, -0.05, -0.16);
    const belly = primary.clone().offsetHSL(0, -0.35, 0.28);
    return { primary, secondary, belly };
  }

  function flatMat(color, opts) {
    return new THREE.MeshStandardMaterial(Object.assign({
      color, flatShading: true, roughness: 0.75, metalness: 0.05
    }, opts || {}));
  }

  function eyeMat() {
    return new THREE.MeshStandardMaterial({
      color: 0xfff4d6, emissive: 0x554400, emissiveIntensity: 0.5, flatShading: true
    });
  }

  function mesh(geo, mat, x, y, z) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  function jitterIcosahedron(radius, detail, amount, rng) {
    const geo = new THREE.IcosahedronGeometry(radius, detail);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const s = 1 + (rng() - 0.5) * amount;
      pos.setXYZ(i, pos.getX(i) * s, pos.getY(i) * s, pos.getZ(i) * s);
    }
    geo.computeVertexNormals();
    return geo;
  }

  function addEyes(group, mat, y, z, spread) {
    [-spread, spread].forEach((ex) => group.add(mesh(new THREE.SphereGeometry(0.045, 6, 5), mat, ex, y, z)));
  }

  // ---------------- body archetypes ---------------- //
  // Each returns a THREE.Group centered at ground level (y=0 is the feet /
  // resting point), roughly unit-scale before the caller's tier/rarity scale.

  function buildQuadruped(pal, rng, tier) {
    const g = new THREE.Group();
    const bodyMat = flatMat(pal.primary), accentMat = flatMat(pal.secondary), bellyMat = flatMat(pal.belly);
    const bodyLen = range(rng, 0.85, 1.15);
    const body = mesh(jitterIcosahedron(0.42, 1, 0.12, rng), bodyMat, 0, 0.5, 0);
    body.scale.set(1, 0.85, bodyLen);
    g.add(body);
    g.add(mesh(new THREE.ConeGeometry(0.28, 0.5, 5), bellyMat, 0, 0.32, 0.15).rotateX(Math.PI / 2));

    const headScale = range(rng, 0.85, 1.05);
    const head = mesh(jitterIcosahedron(0.3, 0, 0.15, rng), bodyMat, 0, 0.78, 0.55 * bodyLen);
    head.scale.setScalar(headScale);
    g.add(head);
    const snoutStyle = pick(rng, ['cone', 'box']);
    const snout = snoutStyle === 'cone'
      ? mesh(new THREE.ConeGeometry(0.14, 0.32, 5), bellyMat, 0, 0.72, 0.85 * bodyLen)
      : mesh(new THREE.BoxGeometry(0.2, 0.16, 0.24), bellyMat, 0, 0.7, 0.85 * bodyLen);
    if (snoutStyle === 'cone') snout.rotation.x = Math.PI / 2;
    g.add(snout);
    addEyes(g, eyeMat(), 0.86, 0.72 * bodyLen, 0.13);

    const earStyle = pick(rng, ['ears', 'horns']);
    [[-0.2, 5], [0.2, -5]].forEach(([ex, tilt]) => {
      const ear = earStyle === 'ears'
        ? mesh(new THREE.ConeGeometry(0.11, 0.28, 4), accentMat, ex, 1.02, 0.5 * bodyLen)
        : mesh(new THREE.ConeGeometry(0.06, 0.4, 4), accentMat, ex, 1.0, 0.5 * bodyLen);
      ear.rotation.z = THREE.MathUtils.degToRad(tilt);
      g.add(ear);
    });

    const legR = 0.09, legH = 0.42;
    [[-0.28, 0.32], [0.28, 0.32], [-0.24, -0.32], [0.24, -0.32]].forEach(([lx, lz]) => {
      g.add(mesh(new THREE.CylinderGeometry(legR, legR * 0.8, legH, 5), accentMat, lx, legH / 2, lz * bodyLen));
    });

    if (tier >= 1) {
      const tail = mesh(new THREE.ConeGeometry(0.12, 0.55, 5), accentMat, 0, 0.55, -0.6 * bodyLen);
      tail.rotation.x = Math.PI / 2.4;
      g.add(tail);
    }
    if (tier >= 2) {
      [[-0.32, 0.9, 12], [0.32, 0.9, -12]].forEach(([sx, sy, tilt]) => {
        const spike = mesh(new THREE.ConeGeometry(0.07, 0.3, 4), accentMat, sx, sy, 0.1 * bodyLen);
        spike.rotation.z = THREE.MathUtils.degToRad(tilt);
        g.add(spike);
      });
    }
    return { group: g, legHeight: legH };
  }

  function buildBiped(pal, rng, tier) {
    const g = new THREE.Group();
    const bodyMat = flatMat(pal.primary), accentMat = flatMat(pal.secondary), bellyMat = flatMat(pal.belly);
    const torso = mesh(jitterIcosahedron(0.36, 1, 0.1, rng), bodyMat, 0, 0.85, 0);
    torso.scale.set(1, 1.15, 0.9);
    g.add(torso);
    g.add(mesh(new THREE.ConeGeometry(0.2, 0.4, 5), bellyMat, 0, 0.65, 0.24).rotateX(Math.PI / 2.1));

    const head = mesh(jitterIcosahedron(0.24, 0, 0.14, rng), bodyMat, 0, 1.42, 0.05);
    g.add(head);
    addEyes(g, eyeMat(), 1.46, 0.2, 0.1);
    const hornStyle = pick(rng, ['single', 'pair', 'none']);
    if (hornStyle !== 'none') {
      const count = hornStyle === 'pair' ? 2 : 1;
      for (let i = 0; i < count; i++) {
        const hx = count === 1 ? 0 : (i === 0 ? -0.13 : 0.13);
        const horn = mesh(new THREE.ConeGeometry(0.06, 0.32, 4), accentMat, hx, 1.68, -0.02);
        horn.rotation.x = -0.3;
        g.add(horn);
      }
    }

    [[-0.24, 1.0], [0.24, 1.0]].forEach(([ax]) => {
      g.add(mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.55, 5), accentMat, ax, 0.75, 0));
    });
    [[-0.14, 0.42], [0.14, 0.42]].forEach(([lx]) => {
      g.add(mesh(new THREE.CylinderGeometry(0.11, 0.09, 0.5, 5), accentMat, lx, 0.42 / 2, 0));
    });

    if (tier >= 1) {
      g.add(mesh(new THREE.ConeGeometry(0.14, 0.3, 4), accentMat, 0, 1.05, -0.32).rotateX(Math.PI / 2.6));
    }
    if (tier >= 2) {
      [[-0.4, 1.15], [0.4, 1.15]].forEach(([wx]) => {
        const spike = mesh(new THREE.ConeGeometry(0.05, 0.4, 4), accentMat, wx, 0.72, 0.05);
        spike.rotation.z = wx < 0 ? 0.9 : -0.9;
        g.add(spike);
      });
    }
    return { group: g, legHeight: 0.42 };
  }

  function buildSerpentine(pal, rng, tier) {
    const g = new THREE.Group();
    const bodyMat = flatMat(pal.primary), accentMat = flatMat(pal.secondary);
    const segCount = 4 + tier;
    const amp = range(rng, 0.22, 0.34);
    let prevR = 0.34;
    for (let i = 0; i < segCount; i++) {
      const t = i / (segCount - 1);
      const r = 0.34 * (1 - t * 0.55);
      const x = Math.sin(t * Math.PI * 1.6) * amp;
      const y = 0.28 + t * 0.12;
      const z = -t * 1.15;
      const seg = mesh(new THREE.SphereGeometry(r, 7, 6), i % 2 === 0 ? bodyMat : accentMat, x, y, z);
      g.add(seg);
      prevR = r;
    }
    const head = mesh(jitterIcosahedron(0.4, 0, 0.1, rng), bodyMat, 0, 0.34, 0.28);
    head.scale.set(1, 0.85, 1.15);
    g.add(head);
    addEyes(g, eyeMat(), 0.42, 0.5, 0.15);
    if (tier >= 1) {
      [[-0.16, 3], [0.16, -3]].forEach(([fx, ry]) => {
        const fin = mesh(new THREE.ConeGeometry(0.08, 0.26, 3), accentMat, fx, 0.34, 0.05);
        fin.rotation.y = THREE.MathUtils.degToRad(ry * 20);
        fin.rotation.z = Math.PI / 2;
        g.add(fin);
      });
    }
    if (tier >= 2) {
      const crest = mesh(new THREE.ConeGeometry(0.1, 0.3, 4), accentMat, 0, 0.62, 0.15);
      g.add(crest);
    }
    return { group: g, legHeight: 0.2, groundOffset: 0.14 };
  }

  function buildWinged(pal, rng, tier) {
    const g = new THREE.Group();
    const bodyMat = flatMat(pal.primary), accentMat = flatMat(pal.secondary), bellyMat = flatMat(pal.belly);
    const body = mesh(jitterIcosahedron(0.32, 1, 0.12, rng), bodyMat, 0, 0.55, 0);
    body.scale.set(0.85, 1, 1.1);
    g.add(body);
    g.add(mesh(new THREE.ConeGeometry(0.16, 0.3, 5), bellyMat, 0, 0.4, 0.14).rotateX(Math.PI / 2));

    const head = mesh(jitterIcosahedron(0.2, 0, 0.12, rng), bodyMat, 0, 0.88, 0.28);
    g.add(head);
    g.add(mesh(new THREE.ConeGeometry(0.08, 0.22, 4), accentMat, 0, 0.84, 0.46).rotateX(Math.PI / 2));
    addEyes(g, eyeMat(), 0.92, 0.36, 0.09);

    const wingShape = new THREE.Shape();
    wingShape.moveTo(0, 0);
    wingShape.lineTo(0.65, 0.18);
    wingShape.lineTo(0.85, -0.05);
    wingShape.lineTo(0.5, -0.3);
    wingShape.lineTo(0, -0.1);
    wingShape.closePath();
    const wingGeo = new THREE.ShapeGeometry(wingShape);
    const wingMat = flatMat(pal.secondary, { side: THREE.DoubleSide });
    const wingL = new THREE.Mesh(wingGeo, wingMat);
    wingL.position.set(-0.12, 0.6, -0.05);
    wingL.rotation.y = Math.PI;
    wingL.rotation.z = 0.25;
    wingL.castShadow = true;
    const wingR = wingL.clone();
    wingR.position.x = 0.12;
    wingR.rotation.y = 0;
    wingR.rotation.z = -0.25;
    g.add(wingL, wingR);

    [[-0.1, 0.16], [0.1, 0.16]].forEach(([lx]) => {
      g.add(mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.22, 5), accentMat, lx, 0.11, 0));
    });

    if (tier >= 1) {
      const tail = mesh(new THREE.ConeGeometry(0.07, 0.4, 4), accentMat, 0, 0.5, -0.4);
      tail.rotation.x = Math.PI / 2.2;
      g.add(tail);
    }
    if (tier >= 2) {
      const crest = mesh(new THREE.ConeGeometry(0.07, 0.28, 4), accentMat, 0, 1.1, 0.22);
      g.add(crest);
    }
    return { group: g, legHeight: 0.22 };
  }

  function buildBlob(pal, rng, tier) {
    const g = new THREE.Group();
    const bodyMat = flatMat(pal.primary, { transparent: true, opacity: 0.92 });
    const accentMat = flatMat(pal.secondary, { emissive: pal.secondary, emissiveIntensity: 0.25 });
    const body = mesh(jitterIcosahedron(0.42, 1, 0.18, rng), bodyMat, 0, 0.62, 0);
    g.add(body);
    addEyes(g, eyeMat(), 0.68, 0.36, 0.13);
    g.add(mesh(new THREE.TorusGeometry(0.14, 0.03, 5, 10, Math.PI), flatMat(pal.belly), 0, 0.5, 0.4).rotateX(Math.PI));

    const orbitCount = 2 + tier;
    for (let i = 0; i < orbitCount; i++) {
      const ang = (i / orbitCount) * Math.PI * 2 + rng() * 0.5;
      const r = 0.55;
      const ox = Math.cos(ang) * r, oz = Math.sin(ang) * r;
      g.add(mesh(new THREE.OctahedronGeometry(0.09, 0), accentMat, ox, 0.55 + Math.sin(ang) * 0.15, oz));
    }
    if (tier >= 2) {
      const ring = mesh(new THREE.TorusGeometry(0.5, 0.03, 6, 16), accentMat, 0, 0.62, 0);
      ring.rotation.x = Math.PI / 2;
      g.add(ring);
    }
    return { group: g, legHeight: 0.16, floats: true };
  }

  function buildArmored(pal, rng, tier) {
    const g = new THREE.Group();
    const bodyMat = flatMat(pal.primary), accentMat = flatMat(pal.secondary), bellyMat = flatMat(pal.belly);
    const shell = mesh(jitterIcosahedron(0.44, 1, 0.08, rng), bodyMat, 0, 0.5, 0);
    shell.scale.set(1.1, 0.62, 1.2);
    g.add(shell);
    const head = mesh(jitterIcosahedron(0.2, 0, 0.1, rng), bellyMat, 0, 0.42, 0.5);
    g.add(head);
    addEyes(g, eyeMat(), 0.46, 0.62, 0.08);

    [[-0.4, 0.32, 0.28, 30], [0.4, 0.32, 0.28, -30]].forEach(([cx, cy, cz, rz]) => {
      const claw = mesh(new THREE.ConeGeometry(0.1, 0.34, 4), accentMat, cx, cy, cz);
      claw.rotation.z = THREE.MathUtils.degToRad(rz);
      claw.rotation.x = Math.PI / 2.5;
      g.add(claw);
    });

    const legR = 0.07, legH = 0.24;
    [[-0.3, 0.34], [0.3, 0.34], [-0.32, -0.1], [0.32, -0.1], [-0.28, -0.4], [0.28, -0.4]].forEach(([lx, lz]) => {
      g.add(mesh(new THREE.CylinderGeometry(legR, legR, legH, 5), accentMat, lx, legH / 2, lz));
    });

    if (tier >= 1) {
      const bump = mesh(new THREE.ConeGeometry(0.12, 0.2, 5), accentMat, 0, 0.78, -0.1);
      g.add(bump);
    }
    if (tier >= 2) {
      [[-0.15, 0.75, -0.2], [0.15, 0.75, -0.2]].forEach(([sx, sy, sz]) => {
        g.add(mesh(new THREE.ConeGeometry(0.07, 0.22, 4), accentMat, sx, sy, sz));
      });
    }
    return { group: g, legHeight: legH };
  }

  const ARCHETYPES = [buildQuadruped, buildBiped, buildSerpentine, buildWinged, buildBlob, buildArmored];

  const RARITY_SCALE = { COMMON: 1, RARE: 1.08, EPIC: 1.18, LEGENDARY: 1.3 };

  function buildModel(id, typeHex, rarityId, tier, isBoss) {
    const seed = hashStr(id);
    const rng = rngFor(seed);
    const archIdx = Math.floor(rng() * ARCHETYPES.length);
    const pal = paletteFromType(typeHex, rng);
    const built = ARCHETYPES[archIdx](pal, rng, tier);
    const wrapper = new THREE.Group();
    wrapper.add(built.group);

    let scale = 0.62 * (RARITY_SCALE[rarityId] || 1) * (1 + tier * 0.14);
    if (isBoss) scale *= 1.6;
    wrapper.scale.setScalar(scale);

    if (tier >= 2 || isBoss) {
      const haloColor = new THREE.Color(typeHex).offsetHSL(0, 0.1, 0.15);
      const halo = mesh(
        new THREE.RingGeometry(0.5, 0.58, 16),
        new THREE.MeshBasicMaterial({ color: haloColor, transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
        0, 0.03, 0
      );
      halo.rotation.x = -Math.PI / 2;
      wrapper.add(halo);
    }

    wrapper.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    wrapper.userData.bobOffset = rng() * Math.PI * 2;
    wrapper.userData.baseScale = scale;
    return wrapper;
  }

  // Public API ---------------------------------------------------------- //

  function buildTowerModel(species) {
    const tier = towerTier(species.id);
    return buildModel(species.id, TYPE_COLORS[species.type], species.rarity, tier, false);
  }

  function buildEnemyModel(species) {
    return buildModel(species.id, TYPE_COLORS[species.type], 'COMMON', species.boss ? 2 : 0, !!species.boss);
  }

  return { buildTowerModel, buildEnemyModel, towerTier, hashStr, rngFor };
})();
