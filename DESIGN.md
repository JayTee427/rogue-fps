# HOLLOW SIGNAL — design bible

*A roguelike first-person shooter. Browser-native. Three.js. Every run is a
different game.*

## The one-line promise

You are a salvage drone dropped into a derelict station whose rooms rearrange
between visits. You fight through it with a gun that changes every time you find
something. When you die — and you will — the station rearranges again, and the
only thing you keep is what you learned.

## The fantasy, in feel terms

- **Fast.** Ground speed is high, air control is generous, there is a dash on a
  short cooldown. Standing still is how you die.
- **Loud.** Every hit lands with hitstop, screen kick, and a sound. Every kill
  pops. Feedback is over-tuned on purpose — this is arcade, not mil-sim.
- **Legible.** Enemies telegraph. Damage sources are colour-coded. You always
  know why you died.
- **Greedy.** The core tension is *one more room*. Rewards escalate; so does risk.
  Extraction is always available and always feels like quitting.

## The loop

```
DROP  →  ROOM (fight, or not)  →  REWARD (choose 1 of 3)  →  DOOR (choose)  →  …
                                                                  ↓
                                              BOSS FLOOR every 5 rooms
                                                                  ↓
                                          EXTRACT (bank the run)  or  DEEPER (multiplier ×)
```

A **run** is a sequence of **floors**; a floor is 5 rooms and a boss. Each door
shows what is behind it (a reward type, a hazard tag, an elite marker) so every
choice is informed. Death ends the run and banks nothing — except **meta
unlocks**, which are permanent and widen the item pool.

## Roguelike systems — where the randomness lives

Every one of these is seeded. Same seed, same run — that is a promise the tests
enforce, and it is what makes runs shareable ("try seed 7734").

| System | What varies per run |
| --- | --- |
| **Floor layout** | room sequence, door options, hazard tags, elite placement |
| **Reward draft** | 3 items offered per room, weighted by rarity and floor depth, no repeats of what you hold |
| **Enemy roster** | which archetypes spawn, in what mix, with what affixes |
| **Weapon rolls** | the starting weapon's base stats jitter ±10%; found weapons roll rarity + 1–3 mods |
| **Room modifiers** | low gravity, darkness, double enemies half health, no dash, time pressure |
| **Boss** | 1 of N bosses per floor, with a random affix |
| **Curses** | optional: take a curse for a stronger reward |
| **Daily seed** | one fixed seed per calendar day, shared leaderboard |

## Weapons

Six base archetypes. Every found weapon is an archetype + a rarity + rolled mods.

| Archetype | Feel | Base stats to roll |
| --- | --- | --- |
| **Sidearm** | reliable, fast reload, the fallback | dmg 12, rof 5/s, mag 12, spread 1° |
| **Scattergun** | close, brutal, pellet spread | 8 pellets × 9, rof 1.2/s, mag 6, spread 8° |
| **Carbine** | mid-range workhorse | dmg 18, rof 8/s, mag 30, spread 2° |
| **Railgun** | slow, pierces everything, huge crit | dmg 90, rof 0.7/s, mag 3, spread 0° |
| **Launcher** | splash, self-damage, arcs | dmg 60 splash r=3, rof 1/s, mag 4 |
| **Beam** | continuous, ramps up, overheats | 30 dps → 90 dps over 2s, heat cap 4s |

**Weapon mods** (rolled 1–3 per found weapon, more on higher rarity):
ricochet, pierce+1, homing (weak), incendiary, cryo, chain lightning, lifesteal,
mag +50%, reload −40%, crit chance +15%, crit dmg +50%, spread halved, spread
doubled but dmg +40%, every 4th shot free, projectiles bounce off floors,
bullets bigger, bullets slower but +dmg, tighter while ADS.

## Items — the 50+ (this is the fun part)

Items are the game. Each one changes a rule. They stack, they interact, and the
best runs are the ones where three of them combine into something absurd.
Rarity: **common / uncommon / rare / legendary / cursed**.

### Offense
1. **Hot Rounds** — +15% damage. Stacks. (common)
2. **Glass Cannon** — +60% damage, −40% max HP. (rare)
3. **Overclock** — +25% fire rate. Stacks. (common)
4. **Executioner** — enemies below 20% HP die instantly. (rare)
5. **Bloodhound Rounds** — shots home slightly toward the nearest enemy. (uncommon)
6. **Shrapnel** — kills explode for 30% of the kill's damage in r=2. (uncommon)
7. **Chain Reaction** — Shrapnel explosions can chain. Requires Shrapnel. (rare)
8. **Crit Lens** — +20% crit chance. Stacks. (common)
9. **Headhunter** — crits deal ×3 instead of ×2. (rare)
10. **First Blood** — first shot after a reload deals ×2.5. (uncommon)
11. **Last Round** — last bullet in the mag deals ×4. (uncommon)
12. **Bottomless** — 25% chance a shot doesn't consume ammo. Stacks. (common)
13. **Twin Link** — every 3rd shot fires twice. (rare)
14. **Static Charge** — every 8th hit chains lightning to 3 enemies. (uncommon)
15. **Frostbite** — hits slow enemies 30% for 2s. (uncommon)
16. **Ignition** — hits ignite for 5 dps over 4s. Stacks duration. (uncommon)
17. **Wildfire** — burning enemies spread fire on death. Requires Ignition. (rare)
18. **Punch Through** — projectiles pierce +1 enemy. Stacks. (uncommon)
19. **Ricochet Plate** — projectiles bounce once off walls. (uncommon)
20. **Big Iron** — projectiles 2× size, −20% speed. (uncommon)

### Defense & sustain
21. **Plating** — +25 max HP. Stacks. (common)
22. **Second Wind** — on lethal damage, survive at 1 HP once per floor. (rare)
23. **Vampiric Rounds** — heal 2% of damage dealt. Stacks. (uncommon)
24. **Kill Drip** — heal 5 HP per kill. Stacks. (common)
25. **Regen Coil** — 1 HP/s out of combat. (common)
26. **Bulwark** — −20% damage taken while standing still. (uncommon)
27. **Bullet Time Sense** — time slows 40% for 1s when hit below 30% HP; 20s cd. (rare)
28. **Deflector** — 15% chance to negate a projectile. Stacks (diminishing). (uncommon)
29. **Overshield** — start each room with 30 shield that decays. (uncommon)
30. **Thorns** — melee attackers take 20 damage. (common)

### Mobility
31. **Long Legs** — +15% move speed. Stacks. (common)
32. **Double Jump** — a second jump. (uncommon)
33. **Air Brakes** — full air control. (uncommon)
34. **Blink Dash** — dash teleports and phases through enemies. (rare)
35. **Dash Reset** — kills refund the dash. (uncommon)
36. **Momentum** — +2% damage per 1 m/s of speed, cap +40%. (rare)
37. **Slide** — crouching while moving slides; shots while sliding crit. (rare)
38. **Feather** — 50% gravity. (uncommon)

### Economy & meta-run
39. **Magpie** — +1 reward option per draft (4 instead of 3). (rare)
40. **Reroll Token** — one reroll of a draft, per floor. (uncommon)
41. **Greed** — rewards +1 rarity tier; enemies +30% HP. (rare)
42. **Cartographer** — see two doors ahead. (uncommon)
43. **Skeleton Key** — open one locked door per floor. (uncommon)
44. **Duplicator** — the next item you take, you take twice. Consumed. (legendary)
45. **Lucky Coin** — +10% rare-or-better chance. Stacks. (common)

### Legendary (rule-breakers)
46. **Infinite Mag** — no reloads; fire rate −25%. (legendary)
47. **Gunfu** — reloading fires a 360° burst. (legendary)
48. **Singularity Rounds** — every 10th shot spawns a black hole that pulls enemies for 2s. (legendary)
49. **Ghost** — enemies cannot see you for 2s after a kill. (legendary)
50. **The Loop** — on death, restart the *current floor* with your items; once per run. (legendary)

### Cursed (strong upside, real cost — offered only if you opt in)
51. **Berserker Pact** — +100% damage, cannot heal. (cursed)
52. **Glass Legs** — +40% speed, fall damage. (cursed)
53. **Hoarder's Curse** — +2 reward options, but you MUST take one every room. (cursed)
54. **Blindfire** — +50% fire rate, +100% spread. (cursed)
55. **Borrowed Time** — +50% everything; run ends in 6 minutes regardless. (cursed)

**Interaction promises the tests enforce:** items stack additively within a
stat and multiplicatively across stat categories; "requires X" items are never
offered without X; cursed items are never offered unless the run has curses
enabled; a draft never offers an item the player already holds unless it stacks.

## Enemies

Six archetypes, each with a clear silhouette and a clear tell:

| Archetype | Role | Tell |
| --- | --- | --- |
| **Skitter** | swarm melee, fast, weak | chittering, red eyes |
| **Sentinel** | ranged, hitscan-ish tracer, holds distance | laser sight before firing |
| **Brute** | slow, charges, huge melee | roars, glows before charge |
| **Popper** | suicide, runs at you, explodes | beeping accelerates |
| **Warden** | shield-bearer, blocks from the front | shield hum |
| **Wisp** | flies, erratic, drops mines | high whine |

**Affixes** (elites roll one): armoured, hasty, regenerating, explosive death,
splitting, shielded, vampiric.

**Scaling** is a pure function of floor depth and room index. Tests pin the curve.

## Bosses (one per floor, random affix)

- **The Custodian** — a huge Warden with rotating shield segments; shoot the gap.
- **Chorus** — three Sentinels sharing a health pool; they revive each other.
- **The Landlord** — a Brute that smashes the floor into hazard tiles.

## Mobile

Not a port — a first-class mode. Left thumb: virtual joystick. Right thumb: look
by drag, tap-to-fire on the right half, dedicated dash and reload buttons. Auto-
aim assist on touch (soft magnetism, tunable). UI scales by viewport; HUD stays
out of the thumb zones. Performance target: 60 fps on a mid-range phone at
reduced resolution — the renderer picks a quality tier from a startup benchmark.

## Deployment

Vite build, static output, deployed to Vercel. No backend. Daily seed derives
from the date client-side. Leaderboard is local (localStorage) for v1.

## Quality bar

"AAA" here means: no jank in the loop, feedback on everything, nothing unclear,
and a run always feels like it was *your* choices that mattered. It does not mean
photoreal — the look is stylised (flat-shaded, strong colour, emissive accents)
because that reads well at any resolution and runs on a phone.

## Out of scope for v1

Multiplayer. Server leaderboards. Cutscenes. Voice. Save-mid-run.
