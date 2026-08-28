// Monster Siege - the summon reveal sequence (meta #3).
//
// This is the payoff moment, so it is built as an explicit, interruptible
// timeline rather than a pile of CSS animations firing at once:
//
//   CHARGE   colour-NEUTRAL build-up (white/gold runes, converging motes, a
//            core that swells while the ring spin and screen shake ramp).
//            Deliberately carries zero information about the result - if the
//            build-up telegraphed the rarity there would be nothing to wait
//            for.
//   TELL     the rarity read, and the thing a player actually learns to read:
//            the burst ALWAYS opens at Common blue, then ESCALATES one tier at
//            a time with a hard "hitch" (everything freezes and dims for a
//            beat) between steps. Blue... it's holding... it's going purple...
//            it's GOLD. A legendary therefore costs three hitches of dread; a
//            common resolves on the first beat.
//   REVEAL   the creature as its animated pixel sprite at a large integer
//            scale, with a card whose choreography differs for a new unlock
//            (silhouette snaps into colour, stamp slams in, stars pop one by
//            one) versus a dupe (level badge is present from the start, the
//            copy bar sweeps, a level-up flips the badge and floats the stat
//            deltas) - a dupe is a different EVENT, not a recoloured one.
//
// A 10x never plays ten of these. It plays ONE build-up whose tell escalates
// to the best rarity in the batch, then flips the ten cards into a results
// grid in pull order; any card can be tapped for the full-size card.
//
// Everything is skippable at any instant (click / tap / space / enter), fast
// mode drops the build-up entirely, and prefers-reduced-motion collapses the
// whole timeline to a cross-fade.

const GachaReveal = (function () {
  'use strict';

  const D = () => GachaData;
  const ORDER = ['common', 'rare', 'epic', 'legendary'];

  // phase durations (ms)
  const T = {
    charge: 900,
    firstTell: 400,
    hitch: 200,
    step: 420,
    settle: 520,
    gridStagger: 65,
  };

  function prefersReduced() {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
    catch (e) { return false; }
  }

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function stars(rarity) {
    const r = D().RARITIES[rarity];
    const wrap = el('div', 'gm-stars');
    for (let i = 0; i < r.stars; i++) {
      const s = el('span', 'gm-star', '★');
      s.style.animationDelay = (i * 90) + 'ms';
      wrap.appendChild(s);
    }
    return wrap;
  }

  function emit(name, detail) {
    try { window.dispatchEvent(new CustomEvent(name, { detail: detail })); } catch (e) { /* no-op */ }
  }

  // -------------------------------------------------------------------
  // Sequence: an array of {at, fn} run off one setTimeout chain that skip()
  // can flush. Flushing runs every remaining step immediately in order, which
  // is why "skip" always lands on a correct final state instead of a
  // half-built card.
  // -------------------------------------------------------------------
  function Timeline() {
    this.steps = [];
    this.timer = null;
    this.i = 0;
    this.t0 = 0;
    this.done = false;
  }
  Timeline.prototype.add = function (at, fn) { this.steps.push({ at, fn }); return this; };
  Timeline.prototype.start = function () {
    this.t0 = performance.now();
    this._schedule();
  };
  Timeline.prototype._schedule = function () {
    if (this.done || this.i >= this.steps.length) return;
    const s = this.steps[this.i];
    const wait = Math.max(0, s.at - (performance.now() - this.t0));
    this.timer = setTimeout(() => {
      if (this.done) return;
      this.i++;
      s.fn();
      this._schedule();
    }, wait);
  };
  Timeline.prototype.flush = function () {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    while (this.i < this.steps.length) { const s = this.steps[this.i++]; s.fn(); }
  };
  Timeline.prototype.stop = function () {
    this.done = true;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
  };

  // -------------------------------------------------------------------
  // card builders
  // -------------------------------------------------------------------
  function statRow(label, before, after, unit) {
    const row = el('div', 'gm-statrow');
    row.appendChild(el('span', 'gm-statlabel', label));
    const v = el('span', 'gm-statval', String(after) + (unit || ''));
    row.appendChild(v);
    if (before !== undefined && before !== null && after > before) {
      row.appendChild(el('span', 'gm-statdelta', '+' + Math.round((after - before) * 10) / 10));
    }
    return row;
  }

  // The full-size result card. `res` is a GachaData.applyPull result.
  function buildCard(res, opts) {
    const o = opts || {};
    const m = D().MONSTER_BY_ID[res.monsterId];
    const rar = D().RARITIES[res.rarity];
    const card = el('div', 'gm-card gm-card-' + res.rarity);
    card.dataset.rarity = res.rarity;
    card.style.setProperty('--rc', rar.color);
    card.style.setProperty('--rg', rar.glow);

    const aura = el('div', 'gm-card-aura');
    card.appendChild(aura);
    const beams = el('div', 'gm-card-beams');
    card.appendChild(beams);

    const stage = el('div', 'gm-card-stage');
    const box = o.spriteBox || 300;
    const scale = GachaSprites.fitScale(res.monsterId, box, box);
    const sprite = GachaSprites.create(res.monsterId, { scale: scale, ms: 200 });
    sprite.classList.add('gm-card-sprite');
    stage.appendChild(el('div', 'gm-card-pedestal'));
    stage.appendChild(sprite);
    card.appendChild(stage);

    const plate = el('div', 'gm-plate');
    plate.appendChild(stars(res.rarity));
    plate.appendChild(el('h2', 'gm-name', m.name));
    plate.appendChild(el('div', 'gm-sub', rar.name + ' · ' + m.element + ' · ' + D().statsFor(m.id, res.levelAfter).role));
    card.appendChild(plate);

    // status: the new/dupe/level-up/max distinction
    const status = el('div', 'gm-status');
    const lvBadge = el('div', 'gm-lv');
    lvBadge.innerHTML = '<span class="gm-lv-l">Lv.</span><span class="gm-lv-n">' + (res.isNew ? res.levelAfter : res.levelBefore) + '</span>';
    const bar = el('div', 'gm-bar');
    const fill = el('div', 'gm-bar-fill');
    bar.appendChild(fill);
    const barTxt = el('div', 'gm-bar-txt');

    if (res.isNew) {
      const stamp = el('div', 'gm-stamp', 'NEW');
      card.appendChild(stamp);
      status.classList.add('gm-status-new');
      fill.style.width = Math.round(res.progress.frac * 100) + '%';
      barTxt.textContent = res.progress.max
        ? 'MAX LEVEL'
        : res.progress.have + ' / ' + res.progress.need + ' copies to Lv.' + (res.levelAfter + 1);
    } else if (res.progress.max && res.levelBefore >= D().MAX_LEVEL) {
      status.classList.add('gm-status-max');
      fill.style.width = '100%';
      barTxt.textContent = 'MAX LEVEL · converted to ' + res.refund + ' shards';
    } else {
      status.classList.add(res.leveledUp ? 'gm-status-up' : 'gm-status-dupe');
      fill.style.width = Math.round(res.progressBefore.frac * 100) + '%';
      barTxt.textContent = 'copy ' + res.copiesBefore + ' → ' + res.copiesAfter;
    }

    const barWrap = el('div', 'gm-barwrap');
    barWrap.appendChild(lvBadge);
    const barCol = el('div', 'gm-barcol');
    barCol.appendChild(bar);
    barCol.appendChild(barTxt);
    barWrap.appendChild(barCol);
    status.appendChild(barWrap);

    const tag = el('div', 'gm-tag');
    tag.textContent = res.isNew ? 'NEW MONSTER'
      : res.progress.max && res.levelBefore >= D().MAX_LEVEL ? 'DUPLICATE · +' + res.refund + ' SHARDS'
      : res.leveledUp ? 'LEVEL UP' : 'DUPLICATE · PROGRESS';
    status.appendChild(tag);
    card.appendChild(status);

    if (res.pityKind) {
      const p = el('div', 'gm-pitytag',
        res.pityKind === 'soft' ? 'soft pity rate-up' : res.pityKind + ' pity guaranteed');
      card.appendChild(p);
    }

    // stat deltas float up on a level-up - the concrete reason a dupe matters
    if (res.leveledUp) {
      const sb = D().statsFor(res.monsterId, res.levelBefore);
      const sa = D().statsFor(res.monsterId, res.levelAfter);
      const fl = el('div', 'gm-floats');
      fl.appendChild(el('span', 'gm-float', 'HP +' + (sa.hp - sb.hp)));
      fl.appendChild(el('span', 'gm-float', 'DMG +' + (sa.dmg - sb.dmg)));
      card.appendChild(fl);
      card._floats = fl;
    }

    card._parts = { fill, barTxt, lvBadge, tag, sprite, status };
    card._res = res;
    return card;
  }

  // Play the post-entrance beat of a card: the bar sweep / level flip. Split
  // out so the grid tiles and the big card share it, and so skip() can call it
  // with instant=true.
  function animateCardProgress(card, instant) {
    const res = card._res;
    const p = card._parts;
    if (!p || res.isNew) return;
    if (res.progress.max && res.levelBefore >= D().MAX_LEVEL) return;
    const apply = () => {
      p.fill.style.width = Math.round(res.progress.frac * 100) + '%';
      p.barTxt.textContent = res.progress.max
        ? 'MAX LEVEL'
        : res.progress.have + ' / ' + res.progress.need + ' copies to Lv.' + (res.levelAfter + 1);
      if (res.leveledUp) {
        card.classList.add('gm-levelled');
        const n = p.lvBadge.querySelector('.gm-lv-n');
        if (n) n.textContent = res.levelAfter;
        if (card._floats) card._floats.classList.add('gm-floats-go');
        emit('gacha:levelup', { monsterId: res.monsterId, level: res.levelAfter });
      }
    };
    if (instant) apply(); else setTimeout(apply, 420);
  }

  // Compact tile for the 10x results grid.
  function buildTile(res, index) {
    const m = D().MONSTER_BY_ID[res.monsterId];
    const rar = D().RARITIES[res.rarity];
    const t = el('button', 'gm-tile gm-tile-' + res.rarity);
    t.type = 'button';
    t.style.setProperty('--rc', rar.color);
    t.style.setProperty('--rg', rar.glow);
    t.style.setProperty('--i', index);
    const inner = el('div', 'gm-tile-in');
    const art = el('div', 'gm-tile-art');
    art.appendChild(GachaSprites.create(res.monsterId, { boxW: 78, boxH: 78, ms: 230 }));
    inner.appendChild(art);
    inner.appendChild(el('div', 'gm-tile-name', m.name));
    const st = stars(res.rarity);
    st.classList.add('gm-stars-sm');
    inner.appendChild(st);
    const badge = el('div', 'gm-tile-badge');
    if (res.isNew) { badge.textContent = 'NEW'; badge.classList.add('gm-badge-new'); }
    else if (res.leveledUp) { badge.textContent = 'Lv.' + res.levelBefore + '→' + res.levelAfter; badge.classList.add('gm-badge-up'); }
    else if (res.refund) { badge.textContent = '+' + res.refund; badge.classList.add('gm-badge-shard'); }
    else { badge.textContent = 'Lv.' + res.levelAfter + ' · ×' + res.copiesAfter; }
    inner.appendChild(badge);
    t.appendChild(inner);
    return t;
  }

  // -------------------------------------------------------------------
  // the sequence itself
  // -------------------------------------------------------------------
  // opts: { results:[applyPull], host: HTMLElement, fast: bool,
  //         onCard: fn(res) opens detail, onDone: fn(), onAgain: fn(count) }
  function play(opts) {
    const results = opts.results;
    const host = opts.host;
    const reduced = prefersReduced();
    const fast = !!opts.fast;
    const multi = results.length > 1;
    const best = results.reduce((a, r) => D().rarityRank(r.rarity) > D().rarityRank(a.rarity) ? r : a, results[0]);

    const root = el('div', 'gm-reveal');
    root.dataset.phase = 'charge';
    root.dataset.tier = 'none';
    if (reduced) root.classList.add('gm-reduced');

    const sky = el('div', 'gm-rv-sky'); root.appendChild(sky);
    const rings = el('div', 'gm-rv-rings');
    for (let i = 0; i < 3; i++) { const r = el('div', 'gm-ring gm-ring-' + i); rings.appendChild(r); }
    root.appendChild(rings);

    const motes = el('div', 'gm-rv-motes');
    if (!reduced) {
      for (let i = 0; i < 18; i++) {
        const mo = el('div', 'gm-mote');
        const ang = (i / 18) * Math.PI * 2 + Math.random() * 0.4;
        const dist = 200 + Math.random() * 220;
        mo.style.setProperty('--mx', Math.cos(ang) * dist + 'px');
        mo.style.setProperty('--my', Math.sin(ang) * dist + 'px');
        mo.style.animationDelay = (Math.random() * 700) + 'ms';
        motes.appendChild(mo);
      }
    }
    root.appendChild(motes);

    const core = el('div', 'gm-rv-core'); root.appendChild(core);
    const rays = el('div', 'gm-rv-rays');
    for (let i = 0; i < 12; i++) {
      const r = el('div', 'gm-ray');
      r.style.setProperty('--a', (i * 30) + 'deg');
      rays.appendChild(r);
    }
    root.appendChild(rays);
    const flash = el('div', 'gm-rv-flash'); root.appendChild(flash);
    const shock = el('div', 'gm-rv-shock'); root.appendChild(shock);

    const stageWrap = el('div', 'gm-rv-stage'); root.appendChild(stageWrap);

    const hint = el('div', 'gm-rv-hint', fast ? '' : 'click / space to skip');
    root.appendChild(hint);
    host.appendChild(root);

    let finished = false;
    let stage = 'build';   // build -> shown -> closed
    const tl = new Timeline();

    function setTier(t) {
      root.dataset.tier = t;
      root.classList.remove('gm-hitch');
      emit('gacha:tell', { tier: t, final: t === best.rarity });
    }
    function hitchOn() { root.classList.add('gm-hitch'); }

    function spriteBox() {
      const w = host.clientWidth || window.innerWidth;
      const h = host.clientHeight || window.innerHeight;
      return Math.max(96, Math.min(320, Math.floor(Math.min(w - 80, h - 300))));
    }

    // ---- final states ------------------------------------------------
    function showSingle() {
      if (stage !== 'build') return;
      stage = 'shown';
      root.dataset.phase = 'reveal';
      stageWrap.innerHTML = '';
      const card = buildCard(results[0], { spriteBox: spriteBox() });
      stageWrap.appendChild(card);
      requestAnimationFrame(() => card.classList.add('gm-in'));
      animateCardProgress(card, reduced);
      hint.textContent = 'click to continue';
      const cont = el('button', 'gm-btn gm-btn-primary gm-rv-cont', 'CONTINUE');
      cont.type = 'button';
      cont.addEventListener('click', (e) => { e.stopPropagation(); finish(); });
      stageWrap.appendChild(cont);
      emit('gacha:reveal', { results: results, rarity: results[0].rarity, multi: false });
    }

    function showGrid() {
      if (stage !== 'build') return;
      stage = 'shown';
      root.dataset.phase = 'grid';
      stageWrap.innerHTML = '';
      const panel = el('div', 'gm-results');
      const head = el('div', 'gm-results-head');
      head.appendChild(el('h2', 'gm-results-title', 'SUMMON ×' + results.length));
      const bm = D().MONSTER_BY_ID[best.monsterId];
      const sum = el('div', 'gm-results-sub');
      const newCount = results.filter(r => r.isNew).length;
      const upCount = results.filter(r => r.leveledUp).length;
      sum.innerHTML = '<span class="gm-chip" style="--rc:' + D().RARITIES[best.rarity].color + '">BEST · ' + bm.name + '</span>'
        + '<span class="gm-chip">' + newCount + ' new</span>'
        + '<span class="gm-chip">' + upCount + ' levelled</span>';
      head.appendChild(sum);
      panel.appendChild(head);

      const grid = el('div', 'gm-grid');
      results.forEach((r, i) => {
        const t = buildTile(r, i);
        if (r === best) t.classList.add('gm-tile-best');
        t.addEventListener('click', (e) => {
          e.stopPropagation();
          if (opts.onCard) opts.onCard(r);
        });
        grid.appendChild(t);
        // flip each tile in on its own stagger; reduced motion drops the
        // stagger entirely rather than making the player wait through it
        setTimeout(() => t.classList.add('gm-in'), reduced ? 0 : i * T.gridStagger);
      });
      panel.appendChild(grid);

      const foot = el('div', 'gm-results-foot');
      const again = el('button', 'gm-btn gm-btn-ghost', 'SUMMON ×' + results.length + '  ◆' + D().COST_MULTI);
      again.type = 'button';
      again.addEventListener('click', (e) => { e.stopPropagation(); finish(); if (opts.onAgain) opts.onAgain(results.length); });
      const done = el('button', 'gm-btn gm-btn-primary', 'DONE');
      done.type = 'button';
      done.addEventListener('click', (e) => { e.stopPropagation(); finish(); });
      foot.appendChild(again); foot.appendChild(done);
      panel.appendChild(foot);
      stageWrap.appendChild(panel);
      requestAnimationFrame(() => panel.classList.add('gm-in'));
      hint.textContent = '';
      emit('gacha:reveal', { results: results, rarity: best.rarity, multi: true });
    }

    const showFinal = () => (multi ? showGrid() : showSingle());

    // ---- build the timeline -----------------------------------------
    if (fast || reduced) {
      root.dataset.phase = 'reveal';
      root.dataset.tier = best.rarity;
      setTimeout(showFinal, 0);
    } else {
      emit('gacha:charge', { multi: multi });
      let t = 0;
      tl.add(t, () => { root.dataset.phase = 'charge'; });
      t += T.charge;
      // the escalation ladder: always start at common, climb to the real tier
      const ladder = ORDER.slice(0, D().rarityRank(best.rarity) + 1);
      tl.add(t, () => { root.dataset.phase = 'burst'; setTier(ladder[0]); });
      t += T.firstTell;
      for (let i = 1; i < ladder.length; i++) {
        tl.add(t, () => hitchOn());
        t += T.hitch;
        tl.add(t, ((tier) => () => setTier(tier))(ladder[i]));
        t += T.step;
      }
      t += T.settle;
      tl.add(t, showFinal);
      tl.start();
    }

    // ---- input -------------------------------------------------------
    function skip() {
      if (stage === 'build') { tl.stop(); root.dataset.tier = best.rarity; showFinal(); }
      else finish();
    }
    function finish() {
      if (finished) return;
      finished = true;
      tl.stop();
      document.removeEventListener('keydown', onKey, true);
      root.classList.add('gm-out');
      setTimeout(() => { if (root.parentNode) root.parentNode.removeChild(root); }, reduced ? 0 : 220);
      if (opts.onDone) opts.onDone();
    }
    function onKey(e) {
      if (e.key === ' ' || e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault(); e.stopPropagation();
        if (e.key === 'Escape') { if (stage === 'build') { tl.stop(); root.dataset.tier = best.rarity; showFinal(); } else finish(); }
        else skip();
      }
    }
    root.addEventListener('click', skip);
    document.addEventListener('keydown', onKey, true);

    return { skip, finish, root };
  }

  return { play, buildCard, buildTile, stars, prefersReduced };
})();
