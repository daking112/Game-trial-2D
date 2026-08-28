// Monster Siege - gacha/collection meta layer, public entry point (meta #4).
//
// Owns the DOM overlay (a fixed layer above the WebGL canvas - it never
// touches the three.js scene), the two screens (SUMMON and ROSTER), the
// monster detail panel, and the `window.GachaMeta` API the rest of the game
// talks to.
//
// Wiring contract for the host game:
//   GachaMeta.mount()                    - build the overlay (idempotent)
//   GachaMeta.open('summon'|'roster')    - show it
//   GachaMeta.close() / .toggle()
//   GachaMeta.addCurrency(n, reason)     - wave clears / kills feed this
//   GachaMeta.getOwned()                 - [{id,name,rarity,level,copies,stats}]
//     for the tower-defence core to build its deployable roster from
//   GachaMeta.on(event, fn)              - 'pull','unlock','levelup','currency',
//                                          'open','close'
// It also fires window CustomEvents for anything that would rather listen
// globally (the audio layer in particular): gacha:charge, gacha:tell,
// gacha:reveal, gacha:levelup, gacha:unlock, gacha:pull, gacha:currency.

const GachaMeta = (function () {
  'use strict';

  const D = () => GachaData;
  let state = null;
  let hasStorage = true;
  let root = null, screens = {}, tabBtns = {}, shardEl = null, launcher = null;
  let current = 'summon';
  let busy = false;
  let rosterFilter = 'all';
  const listeners = {};

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }
  function on(evt, fn) { (listeners[evt] = listeners[evt] || []).push(fn); return () => off(evt, fn); }
  function off(evt, fn) { const a = listeners[evt]; if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); } }
  function fire(evt, data) {
    (listeners[evt] || []).forEach(fn => { try { fn(data); } catch (e) { console.error('[GachaMeta] listener', evt, e); } });
    try { window.dispatchEvent(new CustomEvent('gacha:' + evt, { detail: data })); } catch (e) { /* no-op */ }
  }

  function ensureState() {
    if (state) return;
    const r = D().load();
    state = r.state;
    hasStorage = r.storage;
  }
  function persist() { if (!D().save(state)) hasStorage = false; }

  // -------------------------------------------------------------------
  // header / shards
  // -------------------------------------------------------------------
  function renderShards() {
    if (shardEl) shardEl.textContent = state.shards.toLocaleString();
    if (launcher) {
      const owned = Object.keys(state.owned).length;
      const lbl = launcher.querySelector('.gm-launch-sub');
      if (lbl) lbl.textContent = owned + '/' + D().MONSTERS.length;
    }
    updateSummonButtons();
  }

  function addCurrency(n, reason) {
    ensureState();
    const v = Math.floor(Number(n) || 0);
    if (!v) return state.shards;
    state.shards = Math.max(0, state.shards + v);
    persist();
    renderShards();
    fire('currency', { amount: v, total: state.shards, reason: reason || null });
    return state.shards;
  }

  // -------------------------------------------------------------------
  // SUMMON screen
  // -------------------------------------------------------------------
  let pityWrap = null, btnOne = null, btnTen = null, fastToggle = null;

  function buildSummon() {
    const s = el('div', 'gm-screen gm-screen-summon');

    const altar = el('div', 'gm-altar');
    for (let i = 0; i < 3; i++) altar.appendChild(el('div', 'gm-altar-ring gm-altar-ring-' + i));
    altar.appendChild(el('div', 'gm-altar-core'));
    const glyph = el('div', 'gm-altar-glyph', '◆');
    altar.appendChild(glyph);
    s.appendChild(altar);

    s.appendChild(el('h1', 'gm-screen-title', 'THE SUMMONING CIRCLE'));
    s.appendChild(el('p', 'gm-screen-lead', 'Spend Ember Shards to call a monster to the wall. Duplicates are not wasted — every copy raises that monster’s level.'));

    pityWrap = el('div', 'gm-pity');
    s.appendChild(pityWrap);

    const btns = el('div', 'gm-summon-btns');
    btnOne = el('button', 'gm-btn gm-btn-primary gm-summon-btn');
    btnOne.type = 'button';
    btnOne.innerHTML = '<span class="gm-btn-main">SUMMON ×1</span><span class="gm-btn-cost">◆ ' + D().COST_SINGLE + '</span>';
    btnOne.addEventListener('click', () => doPull(1));
    btnTen = el('button', 'gm-btn gm-btn-gold gm-summon-btn');
    btnTen.type = 'button';
    btnTen.innerHTML = '<span class="gm-btn-main">SUMMON ×10</span><span class="gm-btn-cost">◆ ' + D().COST_MULTI
      + ' <em>save ' + (D().COST_SINGLE * D().MULTI_SIZE - D().COST_MULTI) + '</em></span>';
    btnTen.addEventListener('click', () => doPull(D().MULTI_SIZE));
    btns.appendChild(btnOne); btns.appendChild(btnTen);
    s.appendChild(btns);

    const opts = el('div', 'gm-summon-opts');
    fastToggle = el('button', 'gm-toggle');
    fastToggle.type = 'button';
    fastToggle.addEventListener('click', () => {
      state.fastMode = !state.fastMode; persist(); renderFastToggle();
    });
    opts.appendChild(fastToggle);

    const ratesBtn = el('button', 'gm-link', 'view rates ▾');
    ratesBtn.type = 'button';
    const rates = el('div', 'gm-rates');
    rates.appendChild(ratesTable());
    rates.style.display = 'none';
    ratesBtn.addEventListener('click', () => {
      const openNow = rates.style.display === 'none';
      rates.style.display = openNow ? '' : 'none';
      ratesBtn.textContent = openNow ? 'hide rates ▴' : 'view rates ▾';
    });
    opts.appendChild(ratesBtn);
    s.appendChild(opts);
    s.appendChild(rates);

    const warn = el('div', 'gm-warn');
    warn.textContent = 'Saving is unavailable in this browser — progress will be lost when the page closes.';
    warn.style.display = hasStorage ? 'none' : '';
    s._warn = warn;
    s.appendChild(warn);

    renderFastToggle();
    renderPity();
    return s;
  }

  function ratesTable() {
    const t = el('div', 'gm-ratestable');
    D().RARITY_ORDER.slice().reverse().forEach(id => {
      const r = D().RARITIES[id];
      const row = el('div', 'gm-raterow');
      row.style.setProperty('--rc', r.color);
      row.appendChild(el('span', 'gm-ratename', r.name));
      row.appendChild(el('span', 'gm-ratestars', '★'.repeat(r.stars)));
      row.appendChild(el('span', 'gm-ratepct', (r.weight * 100).toFixed(0) + '%'));
      row.appendChild(el('span', 'gm-ratecount', D().POOL[id].length + ' monsters'));
      t.appendChild(row);
    });
    const note = el('p', 'gm-ratenote');
    note.innerHTML = 'Guaranteed <b>Rare+</b> at least every ' + D().PITY.rare + ' summons, <b>Epic+</b> every '
      + D().PITY.epic + ', <b>Legendary</b> every ' + D().PITY.legHard
      + '. From summon ' + (D().PITY.legSoftStart + 1) + ' of a Legendary drought the Legendary rate climbs +'
      + Math.round(D().PITY.legSoftStep * 100) + '% per summon.';
    t.appendChild(note);
    return t;
  }

  function renderFastToggle() {
    if (!fastToggle) return;
    fastToggle.classList.toggle('gm-toggle-on', !!state.fastMode);
    fastToggle.innerHTML = '<span class="gm-toggle-box">' + (state.fastMode ? '✔' : '') + '</span>Fast mode — skip the summoning animation';
  }

  function renderPity() {
    if (!pityWrap) return;
    pityWrap.innerHTML = '';
    pityWrap.appendChild(el('div', 'gm-pity-title', 'PITY · guaranteed by summon count'));
    D().pityView(state).forEach(p => {
      const row = el('div', 'gm-pity-row');
      row.style.setProperty('--rc', p.color);
      const head = el('div', 'gm-pity-head');
      head.appendChild(el('span', 'gm-pity-label', p.label));
      const remain = Math.max(0, p.cap - p.have);
      head.appendChild(el('span', 'gm-pity-count', remain === 0 ? 'next summon!' : 'in ' + remain));
      row.appendChild(head);
      const bar = el('div', 'gm-pity-bar');
      const fill = el('div', 'gm-pity-fill');
      fill.style.width = Math.min(100, (p.have / p.cap) * 100) + '%';
      bar.appendChild(fill);
      row.appendChild(bar);
      const sub = el('div', 'gm-pity-sub', p.have + ' / ' + p.cap + (p.note ? '  ·  ' + p.note : ''));
      row.appendChild(sub);
      pityWrap.appendChild(row);
    });
    pityWrap.appendChild(el('div', 'gm-pity-total', state.totalPulls + ' summons total'));
  }

  function updateSummonButtons() {
    if (!btnOne) return;
    const canOne = state.shards >= D().COST_SINGLE;
    const canTen = state.shards >= D().COST_MULTI;
    btnOne.disabled = busy || !canOne;
    btnTen.disabled = busy || !canTen;
    btnOne.classList.toggle('gm-cant', !canOne);
    btnTen.classList.toggle('gm-cant', !canTen);
  }

  // -------------------------------------------------------------------
  // pulling
  // -------------------------------------------------------------------
  function doPull(count) {
    ensureState();
    if (busy) return;
    const cost = count > 1 ? D().COST_MULTI : D().COST_SINGLE;
    if (state.shards < cost) { flashShards(); return; }
    state.shards -= cost;
    busy = true;
    updateSummonButtons();

    const results = [];
    for (let i = 0; i < count; i++) {
      const roll = D().rollOne(state);
      const res = D().applyPull(state, roll);
      if (res.isNew) { state.seen[res.monsterId] = true; fire('unlock', res); }
      results.push(res);
    }
    persist();
    renderShards();
    renderPity();
    fire('pull', { count: count, results: results, spent: cost });

    GachaReveal.play({
      results: results,
      host: root,
      fast: !!state.fastMode,
      onCard: (res) => openDetail(res.monsterId),
      onAgain: (n) => { setTimeout(() => doPull(n), 60); },
      onDone: () => {
        busy = false;
        renderShards();
        renderPity();
        renderRoster();
      },
    });
  }

  function flashShards() {
    if (!shardEl) return;
    const chip = shardEl.parentNode;
    chip.classList.remove('gm-shake');
    void chip.offsetWidth;
    chip.classList.add('gm-shake');
  }

  // -------------------------------------------------------------------
  // ROSTER screen
  // -------------------------------------------------------------------
  let rosterGrid = null, rosterCount = null, filterBtns = {};

  function buildRoster() {
    const s = el('div', 'gm-screen gm-screen-roster');
    const head = el('div', 'gm-roster-head');
    head.appendChild(el('h1', 'gm-screen-title', 'MONSTER ROSTER'));
    rosterCount = el('div', 'gm-roster-count');
    head.appendChild(rosterCount);
    const filters = el('div', 'gm-filters');
    [['all', 'All'], ['owned', 'Owned'], ['missing', 'Missing']].forEach(([id, label]) => {
      const b = el('button', 'gm-filter', label);
      b.type = 'button';
      b.addEventListener('click', () => { rosterFilter = id; renderRoster(); });
      filterBtns[id] = b;
      filters.appendChild(b);
    });
    head.appendChild(filters);
    s.appendChild(head);
    rosterGrid = el('div', 'gm-roster-grid');
    s.appendChild(rosterGrid);
    return s;
  }

  function renderRoster() {
    if (!rosterGrid) return;
    rosterGrid.innerHTML = '';
    const ownedIds = Object.keys(state.owned);
    rosterCount.innerHTML = '<b>' + ownedIds.length + '</b> / ' + D().MONSTERS.length + ' collected';
    Object.keys(filterBtns).forEach(k => filterBtns[k].classList.toggle('gm-filter-on', k === rosterFilter));

    const list = D().MONSTERS.slice().sort((a, b) => {
      const d = D().rarityRank(b.rarity) - D().rarityRank(a.rarity);
      if (d) return d;
      return a.name.localeCompare(b.name);
    });

    let shown = 0;
    list.forEach(m => {
      const copies = state.owned[m.id] || 0;
      const owned = copies > 0;
      if (rosterFilter === 'owned' && !owned) return;
      if (rosterFilter === 'missing' && owned) return;
      shown++;
      rosterGrid.appendChild(rosterCard(m, copies, owned));
    });
    if (!shown) rosterGrid.appendChild(el('div', 'gm-empty', rosterFilter === 'owned' ? 'Nothing summoned yet.' : 'Every monster collected.'));
  }

  function rosterCard(m, copies, owned) {
    const rar = D().RARITIES[m.rarity];
    const c = el('button', 'gm-rcard gm-rcard-' + m.rarity + (owned ? '' : ' gm-rcard-locked'));
    c.type = 'button';
    c.style.setProperty('--rc', rar.color);
    c.style.setProperty('--rg', rar.glow);
    const art = el('div', 'gm-rcard-art');
    const sprite = GachaSprites.create(m.id, { boxW: 86, boxH: 86, animate: owned, ms: 240 });
    if (!owned) sprite.classList.add('gm-silhouette');
    art.appendChild(sprite);
    c.appendChild(art);

    const st = GachaReveal.stars(m.rarity);
    st.classList.add('gm-stars-sm', 'gm-stars-static');
    c.appendChild(st);
    c.appendChild(el('div', 'gm-rcard-name', m.name));
    if (owned) {
      const lv = D().levelForCopies(copies);
      const meta = el('div', 'gm-rcard-meta');
      meta.innerHTML = '<span class="gm-rcard-lv">Lv.' + lv + '</span><span class="gm-rcard-x">×' + copies + '</span>';
      c.appendChild(meta);
      const p = D().levelProgress(copies);
      const bar = el('div', 'gm-rcard-bar');
      const fill = el('div', 'gm-rcard-fill');
      fill.style.width = Math.round(p.frac * 100) + '%';
      if (p.max) fill.classList.add('gm-max');
      bar.appendChild(fill);
      c.appendChild(bar);
    } else {
      c.appendChild(el('div', 'gm-rcard-meta gm-rcard-lock', 'NOT SUMMONED'));
      c.appendChild(el('div', 'gm-rcard-bar'));
    }
    c.addEventListener('click', () => openDetail(m.id));
    return c;
  }

  // -------------------------------------------------------------------
  // detail panel
  // -------------------------------------------------------------------
  function openDetail(monsterId) {
    const m = D().MONSTER_BY_ID[monsterId];
    if (!m) return;
    const copies = state.owned[monsterId] || 0;
    const owned = copies > 0;
    const lv = owned ? D().levelForCopies(copies) : 1;
    const rar = D().RARITIES[m.rarity];
    const p = D().levelProgress(copies);

    const back = el('div', 'gm-modal');
    back.style.setProperty('--rc', rar.color);
    back.style.setProperty('--rg', rar.glow);
    const panel = el('div', 'gm-modal-panel');
    const close = el('button', 'gm-modal-x', '✕');
    close.type = 'button';
    close.addEventListener('click', () => back.remove());
    panel.appendChild(close);

    const top = el('div', 'gm-detail-top');
    const art = el('div', 'gm-detail-art');
    const box = Math.min(190, Math.max(90, Math.floor((window.innerWidth - 140) / 2)));
    const sp = GachaSprites.create(monsterId, { boxW: box, boxH: box, animate: owned, ms: 200 });
    if (!owned) sp.classList.add('gm-silhouette');
    art.appendChild(sp);
    top.appendChild(art);

    const info = el('div', 'gm-detail-info');
    const st = GachaReveal.stars(m.rarity); st.classList.add('gm-stars-static');
    info.appendChild(st);
    info.appendChild(el('h2', 'gm-detail-name', owned ? m.name : m.name));
    const stats = D().statsFor(monsterId, lv);
    info.appendChild(el('div', 'gm-detail-sub', rar.name + ' · ' + m.element + ' · ' + stats.role));
    if (owned) {
      const lvline = el('div', 'gm-detail-lv');
      lvline.innerHTML = '<span class="gm-detail-lvn">Lv.' + lv + '</span><span class="gm-detail-cap">/ ' + D().MAX_LEVEL + '</span><span class="gm-detail-copies">×' + copies + ' copies</span>';
      info.appendChild(lvline);
      const bar = el('div', 'gm-bar');
      const fill = el('div', 'gm-bar-fill');
      fill.style.width = Math.round(p.frac * 100) + '%';
      bar.appendChild(fill);
      info.appendChild(bar);
      info.appendChild(el('div', 'gm-detail-prog', p.max
        ? 'Max level — further copies convert to ◆' + D().DUPE_REFUND[m.rarity]
        : p.have + ' / ' + p.need + ' copies toward Lv.' + (lv + 1)));
    } else {
      info.appendChild(el('div', 'gm-detail-lock', 'Not yet summoned'));
    }
    top.appendChild(info);
    panel.appendChild(top);

    const table = el('div', 'gm-stats');
    const next = lv < D().MAX_LEVEL ? D().statsFor(monsterId, lv + 1) : null;
    [['HP', 'hp', ''], ['DMG', 'dmg', ''], ['RATE', 'rate', '/s'], ['RANGE', 'rng', '']].forEach(([label, key, unit]) => {
      const cell = el('div', 'gm-statcell');
      cell.appendChild(el('div', 'gm-statcell-l', label));
      cell.appendChild(el('div', 'gm-statcell-v', stats[key] + unit));
      if (owned && next && next[key] > stats[key]) {
        cell.appendChild(el('div', 'gm-statcell-n', '→ ' + next[key] + unit));
      }
      table.appendChild(cell);
    });
    panel.appendChild(table);
    panel.appendChild(el('p', 'gm-flavor', m.flavor));

    back.appendChild(panel);
    back.addEventListener('click', (e) => { if (e.target === back) back.remove(); });
    root.appendChild(back);
    requestAnimationFrame(() => back.classList.add('gm-in'));
  }

  // -------------------------------------------------------------------
  // shell
  // -------------------------------------------------------------------
  function setScreen(name) {
    current = name;
    Object.keys(screens).forEach(k => screens[k].classList.toggle('gm-active', k === name));
    Object.keys(tabBtns).forEach(k => tabBtns[k].classList.toggle('gm-tab-on', k === name));
    if (name === 'roster') renderRoster();
    if (name === 'summon') renderPity();
  }

  function mount(opts) {
    const o = opts || {};
    ensureState();
    if (root) return api;

    root = el('div', 'gm-root');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'Monster summoning and collection');

    const shell = el('div', 'gm-shell');
    const header = el('header', 'gm-header');
    const tabs = el('nav', 'gm-tabs');
    [['summon', 'SUMMON'], ['roster', 'ROSTER']].forEach(([id, label]) => {
      const b = el('button', 'gm-tab', label);
      b.type = 'button';
      b.addEventListener('click', () => setScreen(id));
      tabBtns[id] = b; tabs.appendChild(b);
    });
    header.appendChild(tabs);

    const right = el('div', 'gm-header-right');
    const chip = el('div', 'gm-shardchip');
    chip.appendChild(el('span', 'gm-shardicon', '◆'));
    shardEl = el('span', 'gm-shardnum', '0');
    chip.appendChild(shardEl);
    chip.appendChild(el('span', 'gm-shardlabel', 'Ember Shards'));
    right.appendChild(chip);
    const x = el('button', 'gm-close', '✕');
    x.type = 'button';
    x.setAttribute('aria-label', 'Close');
    x.addEventListener('click', () => close());
    right.appendChild(x);
    header.appendChild(right);
    shell.appendChild(header);

    const body = el('div', 'gm-body');
    screens.summon = buildSummon();
    screens.roster = buildRoster();
    body.appendChild(screens.summon);
    body.appendChild(screens.roster);
    shell.appendChild(body);
    root.appendChild(shell);
    (o.container || document.body).appendChild(root);

    if (o.launcher !== false) {
      launcher = el('button', 'gm-launcher');
      launcher.type = 'button';
      launcher.innerHTML = '<span class="gm-launch-icon">◆</span><span class="gm-launch-txt">SUMMON<span class="gm-launch-sub">0/0</span></span>';
      launcher.addEventListener('click', () => toggle());
      (o.container || document.body).appendChild(launcher);
    }

    setScreen(o.screen || 'summon');
    renderShards();
    renderRoster();
    root.classList.add('gm-hidden');
    return api;
  }

  function open(screen) {
    ensureState();
    if (!root) mount();
    if (screen) setScreen(screen);
    root.classList.remove('gm-hidden');
    requestAnimationFrame(() => root.classList.add('gm-open'));
    if (launcher) launcher.classList.add('gm-launcher-hidden');
    fire('open', { screen: current });
  }
  function close() {
    if (!root) return;
    root.classList.remove('gm-open');
    setTimeout(() => { if (root && !root.classList.contains('gm-open')) root.classList.add('gm-hidden'); }, 200);
    if (launcher) launcher.classList.remove('gm-launcher-hidden');
    fire('close', {});
  }
  function isOpen() { return !!root && !root.classList.contains('gm-hidden'); }
  function toggle() { isOpen() ? close() : open(); }

  // -------------------------------------------------------------------
  // data for the rest of the game
  // -------------------------------------------------------------------
  function getOwned() {
    ensureState();
    return Object.keys(state.owned).map(id => {
      const m = D().MONSTER_BY_ID[id];
      const copies = state.owned[id];
      const level = D().levelForCopies(copies);
      return { id: id, species: m.species, name: m.name, rarity: m.rarity, element: m.element,
               copies: copies, level: level, stats: D().statsFor(id, level) };
    }).sort((a, b) => D().rarityRank(b.rarity) - D().rarityRank(a.rarity) || b.level - a.level);
  }
  function getMonster(id) {
    ensureState();
    const m = D().MONSTER_BY_ID[id];
    if (!m) return null;
    const copies = state.owned[id] || 0;
    const level = copies ? D().levelForCopies(copies) : 0;
    return { id: id, species: m.species, name: m.name, rarity: m.rarity, element: m.element,
             owned: copies > 0, copies: copies, level: level, stats: D().statsFor(id, Math.max(1, level)) };
  }
  function getState() { ensureState(); return JSON.parse(JSON.stringify(state)); }
  function getCurrency() { ensureState(); return state.shards; }
  function spendCurrency(n) {
    ensureState();
    const v = Math.max(0, Math.floor(Number(n) || 0));
    if (state.shards < v) return false;
    state.shards -= v; persist(); renderShards();
    fire('currency', { amount: -v, total: state.shards, reason: 'spend' });
    return true;
  }
  function reset() {
    D().clear();
    state = D().freshState();
    persist();
    renderShards(); renderPity(); renderRoster();
  }
  // testing / debug seam - lets the harness force a specific pull outcome
  function debugPull(monsterId, count) {
    ensureState();
    const n = Math.max(1, count || 1);
    const results = [];
    for (let i = 0; i < n; i++) {
      const m = D().MONSTER_BY_ID[monsterId];
      results.push(D().applyPull(state, { monsterId: m.id, rarity: m.rarity, pityKind: null }));
    }
    persist(); renderShards(); renderPity(); renderRoster();
    return results;
  }
  function debugShow(results, opts) {
    if (!root) mount();
    open('summon');
    busy = true;
    GachaReveal.play({
      results: results, host: root, fast: (opts && opts.fast) || false,
      onCard: (r) => openDetail(r.monsterId),
      onDone: () => { busy = false; renderShards(); renderPity(); renderRoster(); },
    });
  }

  const api = {
    mount, open, close, toggle, isOpen, setScreen,
    addCurrency, spendCurrency, getCurrency,
    getOwned, getMonster, getState, reset,
    pull: doPull,
    on, off,
    hasStorage: () => hasStorage,
    data: () => GachaData,
    _debugPull: debugPull, _debugShow: debugShow,
  };
  return api;
})();

if (typeof window !== 'undefined') window.GachaMeta = GachaMeta;
