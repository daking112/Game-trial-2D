// DOM screen manager - the low-poly port's equivalent of the pixel game's
// Menu/Sanctuary/Roster/Hub/Mastery/Victory Phaser scenes. Same gameState,
// same data, same navigation rules (see each pixel scene's backTarget
// logic) - just rendered as plain HTML/CSS instead of a Phaser scene, since
// menus don't benefit from a 3D pass the way the battle grid does. Only
// BattleGame.js (the actual tower-defense loop) gets the Three.js
// low-poly treatment - see README.
const App = (() => {
  const root = document.getElementById('app');
  let battleGame = null;

  function screenEl() {
    const el = document.createElement('div');
    el.className = 'screen';
    root.innerHTML = '';
    root.appendChild(el);
    return el;
  }

  function backTarget() {
    return gameState.runActive ? 'hub' : 'menu';
  }

  function goBack() {
    backTarget() === 'hub' ? showHub() : showMenu();
  }

  function btn(label, onClick, opts) {
    const b = document.createElement('button');
    b.className = 'lp-btn' + (opts && opts.large ? ' lp-btn-large' : '') + (opts && opts.cls ? ' ' + opts.cls : '');
    b.textContent = label;
    b.onclick = onClick;
    return b;
  }

  function backLink(label, onClick) {
    const b = document.createElement('button');
    b.className = 'lp-link lp-back-link';
    b.textContent = label;
    b.onclick = onClick;
    return b;
  }

  // ---------------- Menu ---------------- //

  function showMenu() {
    gameState.runActive = false;
    const el = screenEl();
    el.innerHTML = `
      <div class="title-logo">MONSTER TACTICS <span style="color:#4caf50">// LOW POLY</span></div>
      <div class="subtitle">hatch monsters, place them along the path, hold the line</div>
      <div class="stat-line">Roster: ${Object.keys(gameState.roster).length} monster(s)</div>
      <div class="essence-line">Essence: ${gameState.essence}&nbsp;&nbsp;&nbsp;Mastery: ${gameState.mastery}</div>
      <div class="online-line" id="lp-online"></div>
    `;
    el.appendChild(btn('Quick Play', () => {
      if (gameState.team.length === 0) gameState.team = Object.keys(gameState.roster).slice(0, MAX_TEAM_SIZE);
      gameState.resetRun();
      gameState.startStage(FIRST_STAGE_ID);
      startBattle();
    }, { large: true, cls: 'lp-btn-blue' }));
    el.appendChild(btn('Monster Sanctuary', showSanctuaryBanners, { large: true }));
    el.appendChild(btn('Team & Battle', showRoster, { large: true }));
    el.appendChild(btn('Mastery', showMastery, { large: true, cls: 'lp-btn-gold' }));

    fetch('/status').then(r => r.ok ? r.json() : null).then(data => {
      if (!data) return;
      const t = document.getElementById('lp-online');
      if (t) t.textContent = `● ${data.playerCount} Tamer${data.playerCount === 1 ? '' : 's'} online now`;
    }).catch(() => {});

    showDailyLoginIfDue();
  }

  function showDailyLoginIfDue() {
    const reward = gameState.claimDailyLoginIfDue();
    if (!reward) return;
    const overlay = document.createElement('div');
    overlay.className = 'lp-daily-overlay';
    const track = DAILY_LOGIN_CYCLE_ESSENCE.map((amt, i) => {
      const day = i + 1, isToday = day === reward.day;
      return `<div class="lp-daily-box${isToday ? ' today' : ''}"><div class="d">Day ${day}</div><div class="a">+${amt}</div></div>`;
    }).join('');
    overlay.innerHTML = `
      <div class="lp-daily-panel">
        <h2>DAILY LOGIN!</h2>
        <div>Day ${reward.day} - ${reward.streak} day streak</div>
        <div class="lp-daily-track">${track}</div>
        <div class="essence-line" style="font-size:20px">+${reward.essence} essence claimed</div>
      </div>
    `;
    const claim = btn('Claim', () => overlay.remove(), { large: true, cls: 'lp-btn-gold' });
    overlay.querySelector('.lp-daily-panel').appendChild(claim);
    document.body.appendChild(overlay);
  }

  // ---------------- Sanctuary (gacha pulls) ---------------- //

  function showSanctuaryBanners() {
    const el = screenEl();
    el.appendChild(backLink('< Back', goBack));
    el.innerHTML += `
      <div class="title-logo" style="font-size:32px">MONSTER SANCTUARY</div>
      <div class="essence-line">Essence: ${gameState.essence}</div>
    `;
    const grid = document.createElement('div');
    grid.className = 'card-grid banners';
    BANNERS.forEach(banner => {
      const card = document.createElement('div');
      card.className = 'lp-card';
      card.innerHTML = `<div class="icon">${banner.icon}</div><div class="name">${banner.name}</div><div class="blurb">${banner.blurb}</div>`;
      card.onclick = () => showSanctuaryPull(banner);
      grid.appendChild(card);
    });
    el.appendChild(grid);
  }

  function oddsString(banner) {
    const pool = banner.types ? SPECIES.filter(s => banner.types.includes(s.type)) : SPECIES;
    const availableRarities = Object.values(RARITY).filter(r => pool.some(s => s.rarity === r.id));
    const total = availableRarities.reduce((s, r) => s + r.weight, 0);
    return availableRarities.map(r => `${r.label} ${Math.round((r.weight / total) * 100)}%`).join('   ');
  }

  function showSanctuaryPull(banner) {
    const el = screenEl();
    el.appendChild(backLink('< Banners', showSanctuaryBanners));
    el.innerHTML += `<div class="title-logo" style="font-size:30px">${banner.icon} ${banner.name.toUpperCase()}</div>`;
    const essenceLine = document.createElement('div');
    essenceLine.className = 'essence-line';
    essenceLine.id = 'lp-sanct-essence';
    essenceLine.textContent = `Essence: ${gameState.essence}`;
    el.appendChild(essenceLine);

    const eggWrap = document.createElement('div');
    eggWrap.className = 'egg-wrap';
    eggWrap.innerHTML = `<div class="egg-shape" id="lp-egg">?</div>`;
    el.appendChild(eggWrap);

    const resultText = document.createElement('div');
    resultText.className = 'reveal-result';
    const resultSub = document.createElement('div');
    resultSub.className = 'reveal-sub';
    el.appendChild(resultText);
    el.appendChild(resultSub);

    const openBtn = btn(`Open Egg (${EGG_COST} essence)`, () => openEgg(), { large: true });
    el.appendChild(openBtn);
    const odds = document.createElement('div');
    odds.className = 'odds-line';
    odds.textContent = oddsString(banner);
    el.appendChild(odds);

    function refreshOpenBtn() {
      openBtn.disabled = gameState.essence < EGG_COST;
    }
    refreshOpenBtn();

    function openEgg() {
      if (!gameState.spendEssence(EGG_COST)) return;
      document.getElementById('lp-sanct-essence').textContent = `Essence: ${gameState.essence}`;
      refreshOpenBtn();

      const species = rollGachaSpecies(banner.types);
      const result = gameState.addToRoster(species.id);

      const eggEl = document.getElementById('lp-egg');
      eggEl.style.display = 'none';
      const preview = document.createElement('div');
      preview.className = 'reveal-wrap';
      preview.innerHTML = `<img src="${PreviewRenderer.forSpecies(species)}" style="width:130px;height:130px;image-rendering:auto;">`;
      eggWrap.appendChild(preview);
      setTimeout(() => { preview.remove(); eggEl.style.display = ''; }, 1600);

      const rarity = RARITY[species.rarity];
      const archetype = COMBAT_ARCHETYPES[species.type];
      resultText.style.color = cssColor(rarity.color);
      if (result.isNew) {
        resultText.textContent = `New! ${rarity.label}: ${species.name}`;
        const ultimateLine = archetype.ultimateLabel ? `\nUltimate: ${archetype.ultimateLabel} (charges on ${archetype.ultimateChargeHits} hits)` : '';
        resultSub.textContent =
          `Type ${species.type}   HP ${species.maxHp} / ATK ${species.attack}\n` +
          `Attack: ${archetype.attackLabel}   Ability: ${archetype.abilityLabel}${ultimateLine}`;
      } else {
        resultText.textContent = `Duplicate: ${species.name}`;
        resultSub.textContent = `+${result.essenceGained} Monster Essence for ${species.name}\n(spend it in Team Select to level them up)`;
      }
    }
  }

  // ---------------- Roster / Team Select ---------------- //

  function showRoster() {
    const el = screenEl();
    el.appendChild(backLink('< Back', goBack));
    el.innerHTML += `<div class="title-logo" style="font-size:32px">TEAM SELECT</div>`;

    gameState.team = gameState.team.filter(id => gameState.roster[id]);
    const rosterEntries = Object.values(gameState.roster);

    if (rosterEntries.length === 0) {
      const msg = document.createElement('div');
      msg.className = 'subtitle';
      msg.style.marginTop = '40px';
      msg.textContent = 'No monsters yet. Visit the Sanctuary first!';
      el.appendChild(msg);
      el.appendChild(btn('Monster Sanctuary', showSanctuaryBanners, { large: true }));
      return;
    }

    const teamLabel = document.createElement('div');
    teamLabel.className = 'stat-line';
    teamLabel.id = 'lp-team-label';
    teamLabel.textContent = `Team: ${gameState.team.length} / ${MAX_TEAM_SIZE}`;
    el.appendChild(teamLabel);

    const grid = document.createElement('div');
    grid.className = 'card-grid roster';
    el.appendChild(grid);

    function refreshCard(card, entry) {
      const species = getSpecies(card.speciesId);
      const effective = getEffectiveStats(species, entry.level);
      card.el.classList.toggle('selected', gameState.team.includes(card.speciesId));
      card.nameEl.textContent = `${species.name} Lv.${entry.level}`;
      card.statsEl.textContent = `HP ${effective.maxHp} / ATK ${effective.attack}`;

      if (entry.level >= MAX_MONSTER_LEVEL) {
        const evolvesTo = EVOLUTION_MAP[card.speciesId];
        if (!evolvesTo) {
          card.essEl.textContent = 'MAX LEVEL';
          card.upBtn.textContent = 'Maxed';
          card.upBtn.disabled = true;
          card.upBtn.classList.remove('affordable');
        } else {
          const canEvolve = entry.essence >= EVOLUTION_ESSENCE_COST;
          card.essEl.textContent = `Essence ${entry.essence}/${EVOLUTION_ESSENCE_COST}`;
          card.upBtn.textContent = canEvolve ? `Evolve! (${getSpecies(evolvesTo).name})` : 'Evolve';
          card.upBtn.disabled = !canEvolve;
          card.upBtn.classList.toggle('affordable', canEvolve);
        }
      } else {
        const cost = essenceForNextLevel(entry.level);
        const affordable = entry.essence >= cost;
        card.essEl.textContent = `Essence ${entry.essence}/${cost}`;
        card.upBtn.textContent = affordable ? `Upgrade to Lv.${entry.level + 1}` : 'Upgrade';
        card.upBtn.disabled = !affordable;
        card.upBtn.classList.toggle('affordable', affordable);
      }
    }

    rosterEntries.forEach(entry => {
      const species = getSpecies(entry.speciesId);
      const rarity = RARITY[species.rarity];
      const cardEl = document.createElement('div');
      cardEl.className = 'lp-card';
      cardEl.innerHTML = `
        <div class="rarity-dot" style="background:${cssColor(rarity.color)}"></div>
        <img class="model-preview" src="${PreviewRenderer.forSpecies(species)}">
        <div class="name"></div>
        <div class="stats"></div>
        <div class="essence"></div>
        <button class="upgrade-btn"></button>
      `;
      const card = {
        el: cardEl, speciesId: entry.speciesId,
        nameEl: cardEl.querySelector('.name'), statsEl: cardEl.querySelector('.stats'),
        essEl: cardEl.querySelector('.essence'), upBtn: cardEl.querySelector('.upgrade-btn')
      };
      cardEl.onclick = (ev) => {
        if (ev.target === card.upBtn) return;
        if (!gameState.toggleTeamMember(entry.speciesId)) return;
        refreshCard(card, gameState.roster[entry.speciesId]);
        teamLabel.textContent = `Team: ${gameState.team.length} / ${MAX_TEAM_SIZE}`;
        refreshStartBtn();
      };
      card.upBtn.onclick = (ev) => {
        ev.stopPropagation();
        const current = gameState.roster[entry.speciesId];
        if (!current) return;
        if (current.level >= MAX_MONSTER_LEVEL) {
          if (gameState.canEvolve(entry.speciesId)) {
            gameState.evolveMonster(entry.speciesId);
            showRoster(); // species id changed - rebuild from fresh gameState, same as the pixel version's scene.restart()
          }
          return;
        }
        if (gameState.upgradeMonster(entry.speciesId)) refreshCard(card, gameState.roster[entry.speciesId]);
      };
      grid.appendChild(cardEl);
      refreshCard(card, entry);
    });

    let startBtnEl = null;
    function refreshStartBtn() {
      if (!startBtnEl) return;
      startBtnEl.disabled = gameState.team.length === 0;
    }

    if (gameState.runActive) {
      const msg = document.createElement('div');
      msg.className = 'subtitle';
      msg.style.marginTop = '20px';
      msg.textContent = "Head back to the Hub when you're ready";
      el.appendChild(msg);
    } else {
      startBtnEl = btn('Start Run', () => {
        if (gameState.team.length === 0) return;
        gameState.resetRun();
        gameState.startStage(FIRST_STAGE_ID);
        startBattle();
      }, { large: true });
      el.appendChild(startBtnEl);
      refreshStartBtn();
    }
  }

  // ---------------- Hub (post-stage-clear choice) ---------------- //

  const HUB_COUNTDOWN_SECONDS = 20;

  function showHub() {
    const el = screenEl();
    el.innerHTML = `
      <div class="hub-header">
        <div class="title-logo" style="font-size:32px">STAGE CLEAR</div>
        <div class="hub-meta">Run progress: stage ${gameState.stageInRun}/${RUN_TARGET_STAGES}</div>
        <div class="hub-meta">Lives ${gameState.lives}/${gameState.maxLives}   Score ${gameState.score}   Essence ${gameState.essence}</div>
      </div>
      <div class="subtitle" style="margin-top:22px">Choose the next stage:</div>
    `;
    const choices = pickStageChoices(2, gameState.currentStageId);
    let selectedStageId = choices[0].id;

    const grid = document.createElement('div');
    grid.className = 'card-grid stages';
    el.appendChild(grid);
    const cardEls = [];
    choices.forEach(stage => {
      const cardEl = document.createElement('div');
      cardEl.className = 'lp-card';
      cardEl.innerHTML = `<div class="name">${stage.name}</div><div class="blurb">${stage.pathCells.length} turns</div>`;
      cardEl.onclick = () => { selectedStageId = stage.id; refresh(); };
      cardEl.dataset.id = stage.id;
      grid.appendChild(cardEl);
      cardEls.push(cardEl);
    });
    function refresh() { cardEls.forEach(c => c.classList.toggle('selected', c.dataset.id === selectedStageId)); }
    refresh();

    el.appendChild(btn('Monster Sanctuary', showSanctuaryBanners, { large: true }));
    el.appendChild(btn('Team & Upgrades', showRoster, { large: true }));
    const masteryLink = document.createElement('button');
    masteryLink.className = 'lp-link';
    masteryLink.textContent = `Mastery: ${gameState.mastery} - spend it >`;
    masteryLink.onclick = showMastery;
    el.appendChild(masteryLink);

    const readyBtn = btn('Ready!', proceed, { large: true, cls: 'lp-btn-blue' });
    el.appendChild(readyBtn);

    const countdownLine = document.createElement('div');
    countdownLine.className = 'countdown-line';
    el.appendChild(countdownLine);

    let remaining = HUB_COUNTDOWN_SECONDS;
    function updateCountdown() { countdownLine.textContent = `Next stage in ${Math.max(0, remaining)}s (or click Ready)`; }
    updateCountdown();
    const timer = setInterval(() => {
      remaining -= 1;
      updateCountdown();
      if (remaining <= 0) proceed();
    }, 1000);

    function proceed() {
      clearInterval(timer);
      gameState.startStage(selectedStageId);
      startBattle();
    }

    const abandon = document.createElement('button');
    abandon.className = 'lp-link';
    abandon.style.marginTop = '18px';
    abandon.textContent = 'Abandon Run (return to Menu)';
    abandon.onclick = () => { clearInterval(timer); showMenu(); };
    el.appendChild(abandon);
  }

  // ---------------- Mastery ---------------- //

  function showMastery() {
    const el = screenEl();
    el.appendChild(backLink(backTarget() === 'hub' ? '< Hub' : '< Menu', goBack));
    el.innerHTML += `
      <div class="title-logo" style="font-size:32px">MASTERY</div>
      <div class="subtitle">Permanent upgrades earned by completing runs - never resets, win or lose.</div>
      <div class="essence-line" id="lp-mastery-total" style="font-size:20px">Mastery: ${gameState.mastery}</div>
    `;
    const grid = document.createElement('div');
    grid.className = 'card-grid talents';
    el.appendChild(grid);

    TALENTS.forEach(talent => {
      const cardEl = document.createElement('div');
      cardEl.className = 'lp-card';
      cardEl.style.cursor = 'default';
      cardEl.innerHTML = `
        <div class="icon">${talent.icon}</div>
        <div class="name">${talent.name}</div>
        <div class="stats" style="margin-top:6px"></div>
        <div class="blurb"></div>
        <button class="upgrade-btn" style="margin-top:14px"></button>
      `;
      const levelEl = cardEl.querySelector('.stats');
      const effectEl = cardEl.querySelector('.blurb');
      const upBtn = cardEl.querySelector('.upgrade-btn');

      function refresh() {
        const level = gameState.talents[talent.id] || 0;
        const maxed = level >= talent.maxLevel;
        levelEl.textContent = `Level ${level}/${talent.maxLevel}`;
        effectEl.textContent = talent.describe(level);
        if (maxed) {
          upBtn.textContent = 'MAXED';
          upBtn.disabled = true;
          upBtn.classList.remove('affordable');
        } else {
          const cost = talentCostForLevel(talent, level);
          const affordable = gameState.mastery >= cost;
          upBtn.textContent = `Upgrade - ${cost} Mastery`;
          upBtn.disabled = !affordable;
          upBtn.classList.toggle('affordable', affordable);
        }
      }
      upBtn.onclick = () => {
        if (gameState.upgradeTalent(talent.id)) {
          document.getElementById('lp-mastery-total').textContent = `Mastery: ${gameState.mastery}`;
          refresh();
        }
      };
      grid.appendChild(cardEl);
      refresh();
    });
  }

  // ---------------- Victory ---------------- //

  function showVictory() {
    const el = screenEl();
    el.innerHTML = `
      <div class="title-logo" style="font-size:46px;color:#f5c94b;margin-top:80px">RUN COMPLETE!</div>
      <div class="stat-line">Cleared all ${RUN_TARGET_STAGES} stages</div>
      <div class="essence-line">Final Score: ${gameState.score}   Lives remaining: ${gameState.lives}/${gameState.maxLives}</div>
      <div class="essence-line">+${gameState.lastMasteryEarned || 0} Mastery earned (${gameState.mastery} total) - spend it on permanent upgrades</div>
    `;
    el.appendChild(btn('Start New Run', () => { gameState.runActive = false; showRoster(); }, { large: true }));
    el.appendChild(btn('Spend Mastery', showMastery, { large: true, cls: 'lp-btn-gold' }));
    el.appendChild(btn('Return to Menu', showMenu, { large: true }));
  }

  // ---------------- Battle ---------------- //

  function startBattle() {
    root.innerHTML = '<div id="battle-root"></div>';
    const battleRoot = document.getElementById('battle-root');
    battleGame = new BattleGame(battleRoot, {
      onExit: () => { battleGame.destroy(); battleGame = null; goBack(); },
      onWaveClearedRun: () => { battleGame.destroy(); battleGame = null; showHub(); },
      onRunComplete: () => { battleGame.destroy(); battleGame = null; showVictory(); },
      onGameOverRun: () => { battleGame.destroy(); battleGame = null; showRoster(); }
    });
    battleGame.mount();
    window.__bg = battleGame; // debug handle
  }

  function cssColor(hex) { return '#' + hex.toString(16).padStart(6, '0'); }

  return { init: showMenu, showMenu, showHub, showRoster, showMastery };
})();

window.addEventListener('DOMContentLoaded', () => App.init());
