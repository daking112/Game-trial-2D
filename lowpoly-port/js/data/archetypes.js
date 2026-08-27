// Combat archetypes: this is what makes a monster's TYPE matter mechanically,
// not just cosmetically. Every species of a given type shares its archetype's
// Attack (applied on every basic hit), Ability (a stronger, longer-cooldown
// effect triggered independently of the basic attack), and now an Ultimate -
// a third, rarer tier gated by *charge* (ultimateChargeHits basic attacks
// landed, tracked per-ally as ally.ultimateCharge in BattleScene) rather than
// a cooldown timer. That's a deliberately different trigger, not just a
// bigger Ability: a tower's own attack speed (species base, Normal-type aura,
// Rally Pulse/Unstoppable buffs) directly controls how often its Ultimate
// fires, so investing in attack speed pays off twice.
const COMBAT_ARCHETYPES = {
  FIRE: {
    attackLabel: 'Burning Strike',
    attackKind: 'dot',
    attackEffect: (attack) => ({ kind: 'dot', color: 0xe0562f, damagePerTick: Math.round(attack * 0.3), ticks: 3, tickIntervalMs: 700 }),
    abilityLabel: 'Ember Nova',
    abilityCooldownMs: 6000,
    abilityKind: 'aoe-dot',
    abilityEffect: (attack) => ({
      splashDamage: Math.round(attack * 0.4),
      dot: { kind: 'dot', color: 0xe0562f, damagePerTick: Math.round(attack * 0.5), ticks: 4, tickIntervalMs: 700 }
    }),
    ultimateLabel: 'Wildfire',
    ultimateChargeHits: 20,
    ultimateRangeMultiplier: 1.6,
    ultimateEffect: (attack) => ({
      splashDamage: Math.round(attack * 2.2),
      dot: { kind: 'dot', color: 0xe0562f, damagePerTick: Math.round(attack * 0.7), ticks: 6, tickIntervalMs: 600 }
    })
  },

  WATER: {
    attackLabel: 'Chilling Shot',
    attackKind: 'slow',
    attackEffect: () => ({ kind: 'slow', color: 0x3d8fd6, multiplier: 0.6, durationMs: 1500 }),
    abilityLabel: 'Frost Pulse',
    abilityCooldownMs: 7000,
    abilityKind: 'aoe-slow',
    abilityEffect: (attack) => ({
      splashDamage: Math.round(attack * 0.6),
      slow: { kind: 'slow', color: 0x3d8fd6, multiplier: 0.35, durationMs: 2500 }
    }),
    ultimateLabel: 'Absolute Zero',
    ultimateChargeHits: 20,
    ultimateRangeMultiplier: 1.6,
    ultimateEffect: (attack) => ({
      splashDamage: Math.round(attack * 1.5),
      slow: { kind: 'slow', color: 0x3d8fd6, multiplier: 0.15, durationMs: 3500 }
    })
  },

  GRASS: {
    attackLabel: 'Venom Bite',
    attackKind: 'dot',
    attackEffect: (attack) => ({ kind: 'dot', color: 0x8a4de0, damagePerTick: Math.round(attack * 0.35), ticks: 4, tickIntervalMs: 600 }),
    abilityLabel: 'Toxic Cloud',
    abilityCooldownMs: 6500,
    abilityKind: 'aoe-dot',
    abilityEffect: (attack) => ({
      splashDamage: 0,
      dot: { kind: 'dot', color: 0x8a4de0, damagePerTick: Math.round(attack * 0.5), ticks: 5, tickIntervalMs: 600 }
    }),
    ultimateLabel: 'Bloom of Decay',
    ultimateChargeHits: 20,
    ultimateRangeMultiplier: 1.6,
    ultimateEffect: (attack) => ({
      dot: { kind: 'dot', color: 0x8a4de0, damagePerTick: Math.round(attack * 0.9), ticks: 7, tickIntervalMs: 550 }
    })
  },

  EARTH: {
    attackLabel: 'Crushing Blow',
    attackKind: 'splash',
    attackEffect: (attack) => ({ kind: 'splash', radiusPx: CELL * 1.5, damage: Math.round(attack * 0.5) }),
    abilityLabel: 'Seismic Slam',
    abilityCooldownMs: 8000,
    abilityKind: 'aoe-damage',
    abilityEffect: (attack) => ({ splashDamage: Math.round(attack * 1.2) }),
    ultimateLabel: 'Cataclysm',
    ultimateChargeHits: 20,
    ultimateRangeMultiplier: 1.6,
    ultimateEffect: (attack) => ({ splashDamage: Math.round(attack * 2.6) })
  },

  ELECTRIC: {
    attackLabel: 'Spark Jolt',
    attackKind: 'chain',
    attackEffect: () => ({ kind: 'chain', jumps: 2, jumpRangePx: CELL * 1.2, falloff: [0.6, 0.35] }),
    abilityLabel: 'Chain Overload',
    abilityCooldownMs: 5500,
    abilityKind: 'chain-burst',
    abilityEffect: () => ({ kind: 'chain', jumps: 4, jumpRangePx: CELL * 1.4, falloff: [0.7, 0.6, 0.5, 0.4] }),
    ultimateLabel: 'Overload Surge',
    ultimateChargeHits: 20,
    ultimateRangeMultiplier: 1.4,
    ultimateEffect: () => ({ kind: 'chain', jumps: 8, jumpRangePx: CELL * 1.5, falloff: [0.8, 0.7, 0.6, 0.55, 0.5, 0.45, 0.4, 0.35] })
  },

  NORMAL: {
    attackLabel: 'Steady Strike',
    attackKind: 'plain',
    attackEffect: () => null,
    abilityLabel: 'Rally Pulse',
    abilityCooldownMs: 9000,
    abilityKind: 'team-buff',
    abilityEffect: () => ({ attackSpeedMultiplier: 1.5, durationMs: 4000 }),
    // Passive aura: continuously boosts allies within range, independent of
    // the ability above (which is a bigger, whole-team burst on a cooldown).
    aura: { attackSpeedMultiplier: 1.25 },
    ultimateLabel: 'Unstoppable',
    ultimateChargeHits: 20,
    ultimateKind: 'team-buff',
    ultimateEffect: () => ({ attackSpeedMultiplier: 2.2, durationMs: 6000 })
  }
};
