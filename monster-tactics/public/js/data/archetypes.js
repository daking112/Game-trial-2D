// Combat archetypes: this is what makes a monster's TYPE matter mechanically,
// not just cosmetically. Every species of a given type shares its archetype's
// Attack (applied on every basic hit) and Ability (a stronger, longer-cooldown
// effect triggered independently of the basic attack).
//
// Scope note: this is "Attack + Ability" only. "Ultimate" (a third, rarer/
// charge-gated tier) is intentionally not implemented yet - each archetype
// below has room for one (see the commented `ultimate` shape) so it can be
// added later without restructuring this file or BattleScene's combat loop.

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
    })
    // ultimate: { label: 'Wildfire', chargeHits: 20, effect: (attack) => ({...}) }
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
    })
  },

  EARTH: {
    attackLabel: 'Crushing Blow',
    attackKind: 'splash',
    attackEffect: (attack) => ({ kind: 'splash', radiusPx: CELL * 1.5, damage: Math.round(attack * 0.5) }),
    abilityLabel: 'Seismic Slam',
    abilityCooldownMs: 8000,
    abilityKind: 'aoe-damage',
    abilityEffect: (attack) => ({ splashDamage: Math.round(attack * 1.2) })
  },

  ELECTRIC: {
    attackLabel: 'Spark Jolt',
    attackKind: 'chain',
    attackEffect: () => ({ kind: 'chain', jumps: 2, jumpRangePx: CELL * 1.2, falloff: [0.6, 0.35] }),
    abilityLabel: 'Chain Overload',
    abilityCooldownMs: 5500,
    abilityKind: 'chain-burst',
    abilityEffect: () => ({ kind: 'chain', jumps: 4, jumpRangePx: CELL * 1.4, falloff: [0.7, 0.6, 0.5, 0.4] })
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
    aura: { attackSpeedMultiplier: 1.25 }
  }
};
