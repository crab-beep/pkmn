import { useState, useRef, useEffect, useCallback } from "react";

// ─── POKEAPI ─────────────────────────────────────────────────────────────────
const API = "https://pokeapi.co/api/v2";
const _cache = {};

async function apiFetch(url) {
  if (_cache[url]) return _cache[url];
  const r = await fetch(url);
  if (!r.ok) throw new Error(`API ${r.status}: ${url}`);
  const d = await r.json();
  _cache[url] = d;
  return d;
}

async function fetchPokemonById(id) {
  const [poke, species] = await Promise.all([
    apiFetch(`${API}/pokemon/${id}`),
    apiFetch(`${API}/pokemon-species/${id}`).catch(() => null),
  ]);
  const stats = Object.fromEntries(poke.stats.map(s => [s.stat.name, s.base_stat]));
  return {
    id,
    name: poke.name,
    displayName: poke.name.split("-").map(w => w[0].toUpperCase() + w.slice(1)).join(" "),
    types: poke.types.map(t => t.type.name),
    hp: stats.hp,
    speed: stats.speed,
    bst: poke.stats.reduce((s, x) => s + x.base_stat, 0),
    sprite: poke.sprites.front_default,
    spriteBack: poke.sprites.back_default,
    artwork: poke.sprites.other?.["official-artwork"]?.front_default || poke.sprites.front_default,
    evolutionChainUrl: species?.evolution_chain?.url || null,
    legendary: species?.is_legendary || species?.is_mythical || false,
  };
}

// Returns flat linear evo chain: [{id, minLevel}]
const _evoCache = {};
async function fetchEvoChain(url) {
  if (_evoCache[url]) return _evoCache[url];
  const data = await apiFetch(url);
  const chain = [];
  function walk(node) {
    const id = parseInt(node.species.url.split("/").filter(Boolean).pop());
    const det = node.evolution_details?.[0];
    const minLevel = det?.min_level || null;
    chain.push({ id, minLevel });
    // Only follow first branch (linear chain)
    if (node.evolves_to?.length) walk(node.evolves_to[0]);
  }
  walk(data.chain);
  _evoCache[url] = chain;
  return chain;
}

// Pre-load a set of IDs, returns map id -> pokemonData
async function preloadPokemon(ids) {
  const unique = [...new Set(ids)];
  const results = await Promise.allSettled(unique.map(id => fetchPokemonById(id)));
  const map = {};
  results.forEach((r, i) => {
    if (r.status === "fulfilled") map[unique[i]] = r.value;
  });
  return map;
}

// Pre-load evo chains for a map of pokemon
async function preloadEvoChains(pokedex) {
  const evoMap = {}; // baseId -> [evoId, minLevel]
  const chainUrls = [...new Set(Object.values(pokedex).map(p => p.evolutionChainUrl).filter(Boolean))];
  const chains = await Promise.allSettled(chainUrls.map(url => fetchEvoChain(url)));
  chains.forEach(r => {
    if (r.status !== "fulfilled") return;
    const chain = r.value;
    for (let i = 0; i < chain.length - 1; i++) {
      const cur = chain[i], next = chain[i + 1];
      if (next.minLevel !== null) {
        evoMap[cur.id] = [next.id, next.minLevel];
      }
    }
  });
  return evoMap;
}

// ─── GAME DATA ────────────────────────────────────────────────────────────────
const REGIONS = {
  kanto: {
    name: "Kanto", starters: [1, 4, 7],
    stages: [
      { type: "route",    name: "Route 1",              level: 5,  pool: [16, 19, 21, 56] },
      { type: "route",    name: "Route 2",              level: 8,  pool: [16, 19, 10, 13, 21, 56] },
      { type: "gym",      name: "Pewter Gym",            level: 12, leader: "Brock",     badge: "Boulder Badge", team: [{id:74,lv:12},{id:95,lv:14}] },
      { type: "route",    name: "Route 3",              level: 14, pool: [23, 27, 39, 41, 46] },
      { type: "route",    name: "Mt. Moon",             level: 16, pool: [41, 74, 138, 140, 35] },
      { type: "gym",      name: "Cerulean Gym",          level: 21, leader: "Misty",     badge: "Cascade Badge", team: [{id:120,lv:18},{id:121,lv:21}] },
      { type: "route",    name: "Route 6",              level: 22, pool: [43, 52, 60, 63, 69] },
      { type: "route",    name: "Route 11",             level: 24, pool: [23, 41, 52, 69, 84] },
      { type: "gym",      name: "Vermilion Gym",         level: 26, leader: "Lt. Surge", badge: "Thunder Badge", team: [{id:100,lv:21},{id:100,lv:21},{id:26,lv:24}] },
      { type: "route",    name: "Rock Tunnel",          level: 28, pool: [66, 74, 95, 41, 42] },
      { type: "route",    name: "Route 8",              level: 29, pool: [23, 41, 52, 58, 63] },
      { type: "gym",      name: "Celadon Gym",           level: 29, leader: "Erika",     badge: "Rainbow Badge", team: [{id:71,lv:29},{id:114,lv:24},{id:45,lv:29}] },
      { type: "route",    name: "Route 12",             level: 31, pool: [60, 98, 102, 129] },
      { type: "route",    name: "Safari Zone",          level: 33, pool: [111, 113, 115, 123, 127, 128, 133], legendary: true },
      { type: "gym",      name: "Fuchsia Gym",           level: 37, leader: "Koga",      badge: "Soul Badge",   team: [{id:109,lv:37},{id:109,lv:39},{id:110,lv:43},{id:49,lv:37}] },
      { type: "route",    name: "Route 15",             level: 39, pool: [43, 84, 102, 112, 114], legendary: true },
      { type: "route",    name: "Route 16",             level: 41, pool: [84, 112, 132, 143], legendary: true },
      { type: "gym",      name: "Saffron Gym",           level: 43, leader: "Sabrina",   badge: "Marsh Badge",  team: [{id:64,lv:38},{id:122,lv:37},{id:49,lv:38},{id:65,lv:43}] },
      { type: "route",    name: "Seafoam Islands",      level: 44, pool: [86, 87, 90, 91, 124], legendary: true },
      { type: "route",    name: "Route 21",             level: 46, pool: [72, 73, 98, 99, 129], legendary: true },
      { type: "gym",      name: "Cinnabar Gym",          level: 47, leader: "Blaine",    badge: "Volcano Badge",team: [{id:58,lv:42},{id:77,lv:40},{id:78,lv:42},{id:59,lv:47}] },
      { type: "route",    name: "Route 22",             level: 48, pool: [29, 32, 56, 104, 111], legendary: true },
      { type: "route",    name: "Route 23",             level: 50, pool: [23, 24, 66, 67, 111, 112], legendary: true },
      { type: "gym",      name: "Viridian Gym",          level: 50, leader: "Giovanni",  badge: "Earth Badge",  team: [{id:111,lv:45},{id:51,lv:42},{id:53,lv:44},{id:112,lv:45},{id:34,lv:50}] },
      { type: "elite4",   name: "Elite Four – Lorelei",  level: 54, leader: "Lorelei",   team: [{id:86,lv:54},{id:87,lv:54},{id:91,lv:56},{id:124,lv:54},{id:131,lv:56}] },
      { type: "elite4",   name: "Elite Four – Bruno",    level: 56, leader: "Bruno",     team: [{id:95,lv:53},{id:95,lv:55},{id:107,lv:55},{id:106,lv:55},{id:68,lv:56}] },
      { type: "elite4",   name: "Elite Four – Agatha",   level: 58, leader: "Agatha",    team: [{id:94,lv:54},{id:93,lv:56},{id:42,lv:56},{id:94,lv:58}] },
      { type: "elite4",   name: "Elite Four – Lance",    level: 60, leader: "Lance",     team: [{id:130,lv:56},{id:148,lv:56},{id:149,lv:58},{id:142,lv:58},{id:148,lv:60}] },
      { type: "champion", name: "Champion – Blue",       level: 65, leader: "Blue",      badge: "Hall of Fame", team: [{id:18,lv:65},{id:59,lv:63},{id:65,lv:63},{id:112,lv:61},{id:149,lv:63}] },
    ],
  },
  johto: {
    name: "Johto", starters: [152, 155, 158],
    stages: [
      { type: "route",    name: "Route 29",             level: 5,  pool: [161, 163, 167, 194] },
      { type: "route",    name: "Route 30",             level: 8,  pool: [163, 167, 177, 187] },
      { type: "gym",      name: "Violet Gym",            level: 9,  leader: "Falkner", badge: "Zephyr Badge",  team: [{id:21,lv:7},{id:22,lv:9}] },
      { type: "route",    name: "Route 32",             level: 13, pool: [60, 69, 163, 187, 194] },
      { type: "route",    name: "Union Cave",           level: 15, pool: [41, 74, 95, 104, 194] },
      { type: "gym",      name: "Azalea Gym",            level: 17, leader: "Bugsy",   badge: "Hive Badge",    team: [{id:213,lv:15},{id:123,lv:15},{id:212,lv:17}] },
      { type: "route",    name: "Ilex Forest",          level: 19, pool: [43, 44, 163, 177] },
      { type: "route",    name: "Route 34",             level: 21, pool: [29, 32, 43, 92, 186] },
      { type: "gym",      name: "Goldenrod Gym",         level: 23, leader: "Whitney",  badge: "Plain Badge",   team: [{id:35,lv:18},{id:241,lv:23}] },
      { type: "route",    name: "Route 36",             level: 25, pool: [29, 32, 48, 193, 203] },
      { type: "route",    name: "Route 37",             level: 27, pool: [58, 163, 175, 193] },
      { type: "gym",      name: "Ecruteak Gym",          level: 25, leader: "Morty",    badge: "Fog Badge",     team: [{id:92,lv:21},{id:92,lv:21},{id:93,lv:23},{id:94,lv:25}] },
      { type: "route",    name: "Route 39",             level: 29, pool: [29, 32, 39, 40, 241] },
      { type: "route",    name: "Route 41",             level: 31, pool: [72, 73, 130, 170, 171] },
      { type: "gym",      name: "Cianwood Gym",          level: 29, leader: "Chuck",    badge: "Storm Badge",   team: [{id:62,lv:27},{id:107,lv:29}] },
      { type: "route",    name: "Route 42",             level: 32, pool: [66, 111, 177, 203, 206], legendary: true },
      { type: "route",    name: "Mt. Mortar",           level: 34, pool: [66, 74, 95, 236, 246], legendary: true },
      { type: "gym",      name: "Olivine Gym",           level: 35, leader: "Jasmine",  badge: "Mineral Badge", team: [{id:208,lv:30},{id:208,lv:30},{id:82,lv:35}] },
      { type: "route",    name: "Route 44",             level: 37, pool: [62, 98, 186, 213, 214], legendary: true },
      { type: "route",    name: "Ice Path",             level: 39, pool: [86, 87, 220, 221, 225], legendary: true },
      { type: "gym",      name: "Mahogany Gym",          level: 35, leader: "Pryce",    badge: "Glacier Badge", team: [{id:86,lv:27},{id:87,lv:29},{id:131,lv:31}] },
      { type: "route",    name: "Route 45",             level: 41, pool: [66, 74, 111, 246, 247], legendary: true },
      { type: "route",    name: "Route 46",             level: 43, pool: [29, 32, 56, 95, 246], legendary: true },
      { type: "gym",      name: "Blackthorn Gym",        level: 40, leader: "Clair",    badge: "Rising Badge",  team: [{id:148,lv:37},{id:148,lv:37},{id:148,lv:37},{id:230,lv:40}] },
      { type: "elite4",   name: "Elite Four – Will",     level: 42, leader: "Will",     team: [{id:178,lv:40},{id:124,lv:41},{id:196,lv:41},{id:197,lv:41},{id:178,lv:42}] },
      { type: "elite4",   name: "Elite Four – Koga",     level: 44, leader: "Koga",     team: [{id:49,lv:40},{id:110,lv:43},{id:169,lv:41},{id:89,lv:43},{id:49,lv:44}] },
      { type: "elite4",   name: "Elite Four – Bruno",    level: 46, leader: "Bruno",    team: [{id:95,lv:42},{id:237,lv:41},{id:95,lv:42},{id:106,lv:42},{id:68,lv:46}] },
      { type: "elite4",   name: "Elite Four – Karen",    level: 48, leader: "Karen",    team: [{id:197,lv:42},{id:45,lv:41},{id:94,lv:41},{id:229,lv:44},{id:248,lv:47}] },
      { type: "champion", name: "Champion – Lance",      level: 50, leader: "Lance",    badge: "Hall of Fame",  team: [{id:149,lv:46},{id:149,lv:46},{id:148,lv:47},{id:142,lv:46},{id:149,lv:50}] },
    ],
  },
};

const KANTO_LEGENDARIES = [144, 145, 146];
const JOHTO_LEGENDARIES = [243, 244, 245];
const REGION_LEGENDARIES = { kanto: KANTO_LEGENDARIES, johto: JOHTO_LEGENDARIES };
const EEVEE_EVOS = [134, 135, 136, 196, 197];

const SPECIAL_EVENTS = [
  { id: "school",  label: "🎓 Pokémon School",   desc: "A trainer school runs free lessons. Your team gains 2 bonus levels that carry until the next gym.", effect: "bonus", value: 2 },
  { id: "training",label: "🏔️ Harsh Training",   desc: "Grueling terrain hardens your team. +3 bonus levels until the next gym.", effect: "bonus", value: 3 },
  { id: "rival",   label: "🏆 Rival Battle",      desc: "Your rival shows up. The clash toughens everyone. +4 bonus levels until the next gym.", effect: "bonus", value: 4 },
  { id: "trade",   label: "🔄 Mystery Trade",     desc: "A trainer offers a trade for one of your Pokémon.", effect: "trade" },
  { id: "gift",    label: "🎁 Injured Pokémon",   desc: "You found a hurt Pokémon and nursed it back. It wants to join!", effect: "gift" },
];

// ─── TYPE CHART ───────────────────────────────────────────────────────────────
const WEAK = {
  normal:["fighting"], fire:["water","ground","rock"], water:["electric","grass"],
  electric:["ground"], grass:["fire","ice","poison","flying","bug"],
  ice:["fire","fighting","rock","steel"], fighting:["flying","psychic","fairy"],
  poison:["ground","psychic"], ground:["water","grass","ice"],
  flying:["electric","ice","rock"], psychic:["bug","ghost","dark"],
  bug:["fire","flying","rock"], rock:["water","grass","fighting","ground","steel"],
  ghost:["ghost","dark"], dragon:["ice","dragon","fairy"],
  dark:["fighting","bug","fairy"], steel:["fire","fighting","ground"], fairy:["poison","steel"],
};
const RESISTS = {
  fire:["fire","grass","ice","bug","steel","fairy"], water:["fire","water","ice","steel"],
  electric:["electric","flying","steel"], grass:["water","electric","grass","ground"],
  ice:["ice"], fighting:["bug","rock","dark"], poison:["grass","fighting","poison","bug","fairy"],
  ground:["poison","rock"], flying:["grass","fighting","bug"], psychic:["fighting","psychic"],
  bug:["grass","fighting","ground"], rock:["normal","fire","poison","flying"],
  ghost:["poison","bug"], dragon:["fire","water","grass","electric"], dark:["ghost","dark"],
  steel:["normal","grass","ice","flying","psychic","bug","rock","dragon","steel","fairy"],
  fairy:["fighting","bug","dark"],
};
const IMMUNE = {
  normal:["ghost"], electric:["ground"], flying:["ground"], ghost:["normal","fighting"],
  dragon:["fairy"], dark:["psychic"], steel:["poison"], fairy:["dragon"],
};

function effectiveness(atkType, defTypes) {
  let m = 1;
  for (const dt of defTypes) {
    if ((IMMUNE[dt]||[]).includes(atkType)) return 0;
    if ((WEAK[dt]||[]).includes(atkType)) m *= 2;
    if ((RESISTS[dt]||[]).includes(atkType)) m *= 0.5;
  }
  return m;
}
function bestAttack(atkTypes, defTypes) {
  let best = { mult: -1, type: atkTypes[0] };
  for (const t of atkTypes) {
    const m = effectiveness(t, defTypes);
    if (m > best.mult) best = { mult: m, type: t };
  }
  if (best.mult < 0) best.mult = 0;
  return best;
}

// ─── BATTLE SIM ───────────────────────────────────────────────────────────────
function simulateBattle(playerTeam, enemyTeam, style = "between") {
  // Deep-copy teams, track both internal state (curHp/alive) and pokemon identity
  const pTeam = playerTeam.map(p => ({ ...p, curHp: p.hp, alive: true }));
  const eTeam = enemyTeam.map(e => ({ ...e, curHp: e.hp, alive: true }));
  const frames = [];
  let pi = 0, ei = 0;

  const aliveCount = t => t.filter(p => p.alive).length;

  function hpPcts() {
    return {
      playerHpPcts: pTeam.map(p => Math.max(0, p.curHp / p.hp)),
      enemyHpPcts: eTeam.map(e => Math.max(0, e.curHp / e.hp)),
    };
  }

  function pushFrame(extra) {
    const safepi = (pi >= 0 && pi < pTeam.length && pTeam[pi]?.alive) ? pi : pTeam.findIndex(p => p.alive);
    const safeei = (ei >= 0 && ei < eTeam.length && eTeam[ei]?.alive) ? ei : eTeam.findIndex(e => e.alive);
    frames.push({
      playerIdx: Math.max(0, safepi),
      enemyIdx: Math.max(0, safeei),
      ...hpPcts(),
      playerAttacking: false, enemyAttacking: false,
      playerFainted: false, enemyFainted: false,
      message: "", msgColor: "#E2E8F0",
      ...extra,
    });
  }

  function dmg(atker, dfer, eff) {
    const crit = Math.random() < 0.0625;
    const variance = 0.85 + Math.random() * 0.30;
    const raw = (atker.bst / Math.max(dfer.bst, 1)) * eff.mult * (atker.hp * 0.28);
    return { val: Math.max(4, Math.round(raw * variance * (crit ? 1.5 : 1))), crit };
  }

  function nextAliveAfter(team, idx) {
    const after = team.findIndex((p, i) => i > idx && p.alive);
    return after !== -1 ? after : team.findIndex(p => p.alive);
  }

  // Rotate current player pokemon to back: push SWITCH frame with NEW pi, then update pi
  function rotatePlayerToBack(msg) {
    const nextPi = pTeam.findIndex((p, i) => i !== pi && p.alive);
    if (nextPi === -1) return;
    // Rotate in array
    const cur = pTeam.splice(pi, 1)[0];
    pTeam.push(cur);
    // pi stays at same index (now points to next alive since we spliced)
    // Find new pi = first alive
    pi = pTeam.findIndex(p => p.alive);
    // Push switch frame with UPDATED pi
    pushFrame({ playerIdx: pi, enemyIdx: ei, ...hpPcts(), message: msg, msgColor: "#FBBF24" });
  }

  let rounds = 0;
  while (aliveCount(pTeam) > 0 && aliveCount(eTeam) > 0 && rounds++ < 300) {
    // Ensure valid indices
    if (!pTeam[pi]?.alive) { pi = pTeam.findIndex(p => p.alive); if (pi === -1) break; }
    if (!eTeam[ei]?.alive) { ei = eTeam.findIndex(e => e.alive); if (ei === -1) break; }

    const P = pTeam[pi], E = eTeam[ei];
    const pAtk = bestAttack(P.types, E.types);
    const eAtk = bestAttack(E.types, P.types);
    const pFirst = P.speed >= E.speed;

    const [first, second, fEff, sEff, firstIsPlayer] = pFirst
      ? [P, E, pAtk, eAtk, true]
      : [E, P, eAtk, pAtk, false];

    // ── First strike ──
    const { val: d1, crit: c1 } = dmg(first, second, fEff);
    second.curHp = Math.max(0, second.curHp - d1);
    const eff1txt = c1 ? " ⚡ Crit!" : fEff.mult >= 2 ? " ✦ Super effective!" : fEff.mult === 0 ? " No effect." : fEff.mult < 1 ? " Not very effective." : "";
    pushFrame({
      playerIdx: pi, enemyIdx: ei, ...hpPcts(),
      playerAttacking: firstIsPlayer, enemyAttacking: !firstIsPlayer,
      message: `${first.displayName} → ${second.displayName}${eff1txt ? " —" + eff1txt : "!"}`,
      msgColor: c1 ? "#FBBF24" : fEff.mult >= 2 ? "#4ADE80" : fEff.mult === 0 ? "#9CA3AF" : "#E2E8F0",
    });

    if (second.curHp <= 0) {
      second.alive = false;
      pushFrame({
        playerIdx: pi, enemyIdx: ei, ...hpPcts(),
        playerFainted: !firstIsPlayer, enemyFainted: firstIsPlayer,
        message: `${second.displayName} fainted!`, msgColor: "#EF4444",
      });

      if (firstIsPlayer) {
        // Enemy fainted — bring in next enemy
        const newEi = nextAliveAfter(eTeam, ei);
        if (newEi !== -1 && eTeam[newEi]?.alive) {
          ei = newEi;
          pushFrame({ playerIdx: pi, enemyIdx: ei, ...hpPcts(), message: `Foe sends out ${eTeam[ei].displayName}!`, msgColor: "#FBBF24" });
        }
        // Low HP rotate after beating enemy (between/weakswitch)
        if ((style === "between" || style === "weakswitch") && aliveCount(eTeam) > 0) {
          if (P.curHp / P.hp < 0.30 && aliveCount(pTeam) > 1) {
            rotatePlayerToBack(`${P.displayName} is hurt — switching!`);
          }
        }
      } else {
        // Player pokemon fainted — bring in next
        const newPi = nextAliveAfter(pTeam, pi);
        if (newPi !== -1 && pTeam[newPi]?.alive) {
          pi = newPi;
          pushFrame({ playerIdx: pi, enemyIdx: ei, ...hpPcts(), message: `Go, ${pTeam[pi].displayName}!`, msgColor: "#FBBF24" });
        }
      }
      continue;
    }

    // ── Second strike (if both still alive) ──
    if (!first.alive || !second.alive) continue;

    const { val: d2, crit: c2 } = dmg(second, first, sEff);
    first.curHp = Math.max(0, first.curHp - d2);
    const eff2txt = c2 ? " ⚡ Crit!" : sEff.mult >= 2 ? " ✦ Super effective!" : sEff.mult === 0 ? " No effect." : sEff.mult < 1 ? " Not very effective." : "";
    pushFrame({
      playerIdx: pi, enemyIdx: ei, ...hpPcts(),
      playerAttacking: !firstIsPlayer, enemyAttacking: firstIsPlayer,
      message: `${second.displayName} strikes back${eff2txt ? " —" + eff2txt : "!"}`,
      msgColor: c2 ? "#FBBF24" : sEff.mult >= 2 ? "#4ADE80" : sEff.mult === 0 ? "#9CA3AF" : "#E2E8F0",
    });

    // weakswitch: player took second strike and now < 20% HP → switch (enemy gets free hit)
    if (!firstIsPlayer && style === "weakswitch" && first.curHp > 0 && aliveCount(pTeam) > 1) {
      if ((P.curHp / P.hp) < 0.20) {
        const freeHit = dmg(E, P, eAtk);
        P.curHp = Math.max(0, P.curHp - freeHit.val);
        pushFrame({
          playerIdx: pi, enemyIdx: ei, ...hpPcts(),
          enemyAttacking: true,
          message: `${E.displayName} hits ${P.displayName} while retreating!`, msgColor: "#FBBF24",
        });
        if (P.curHp <= 0) {
          P.alive = false;
          pushFrame({ playerIdx: pi, enemyIdx: ei, ...hpPcts(), playerFainted: true, message: `${P.displayName} fainted!`, msgColor: "#EF4444" });
        }
        if (aliveCount(pTeam) > 0) rotatePlayerToBack(`${P.displayName} is low — switching!`);
        continue;
      }
    }

    if (first.curHp <= 0) {
      first.alive = false;
      pushFrame({
        playerIdx: pi, enemyIdx: ei, ...hpPcts(),
        playerFainted: firstIsPlayer, enemyFainted: !firstIsPlayer,
        message: `${first.displayName} fainted!`, msgColor: "#EF4444",
      });
      if (firstIsPlayer) {
        const newPi = nextAliveAfter(pTeam, pi);
        if (newPi !== -1 && pTeam[newPi]?.alive) {
          pi = newPi;
          pushFrame({ playerIdx: pi, enemyIdx: ei, ...hpPcts(), message: `Go, ${pTeam[pi].displayName}!`, msgColor: "#FBBF24" });
        }
      } else {
        const newEi = nextAliveAfter(eTeam, ei);
        if (newEi !== -1 && eTeam[newEi]?.alive) {
          ei = newEi;
          pushFrame({ playerIdx: pi, enemyIdx: ei, ...hpPcts(), message: `Foe sends out ${eTeam[ei].displayName}!`, msgColor: "#FBBF24" });
        }
      }
    }
  }

  const won = aliveCount(eTeam) === 0;
  const finalPi = Math.max(0, pTeam.findIndex(p => p.alive));
  const finalEi = Math.max(0, eTeam.findIndex(e => e.alive));
  pushFrame({
    playerIdx: finalPi, enemyIdx: finalEi, ...hpPcts(),
    message: won ? "🎉 Victory!" : "💀 Defeated...", msgColor: won ? "#4ADE80" : "#EF4444",
  });

  // Return surviving/fainted pokemon OBJECTS (not IDs) so caller doesn't need to re-match
  return {
    won,
    frames,
    // These are the actual pTeam objects — caller uses these directly
    survivedPokemon: pTeam.filter(p => p.alive).map(p => {
      // Find the original party member by baseId
      const orig = playerTeam.find(x => (x.baseId || x.id) === (p.baseId || p.id));
      return orig || p;
    }),
    faintedPokemon: pTeam.filter(p => !p.alive).map(p => {
      const orig = playerTeam.find(x => (x.baseId || x.id) === (p.baseId || p.id));
      return orig || p;
    }),
    finalPlayerTeam: pTeam, // for arena display
    finalEnemyTeam: eTeam,
  };
}

// ─── TYPE COLORS ─────────────────────────────────────────────────────────────
const TYPE_COLOR = {
  normal:"#A8A77A", fire:"#EE8130", water:"#6390F0", electric:"#F7D02C",
  grass:"#7AC74C", ice:"#96D9D6", fighting:"#C22E28", poison:"#A33EA1",
  ground:"#E2BF65", flying:"#A98FF3", psychic:"#F95587", bug:"#A6B91A",
  rock:"#B6A136", ghost:"#735797", dragon:"#6F35FC", dark:"#705746",
  steel:"#B7B7CE", fairy:"#D685AD",
};

// ─── COMPONENTS ───────────────────────────────────────────────────────────────
function TypePill({ type }) {
  return (
    <span style={{
      background: TYPE_COLOR[type] || "#888", color: "#fff",
      fontSize: 10, fontWeight: 700, padding: "2px 7px",
      borderRadius: 20, letterSpacing: "0.05em", textTransform: "uppercase",
    }}>{type}</span>
  );
}

function Sprite({ id, back, size = 48, style: sx }) {
  const urls = back
    ? [`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/back/${id}.png`,
       `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`]
    : [`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`,
       `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`];
  const [urlIdx, setUrlIdx] = useState(0);
  const [failed, setFailed] = useState(false);
  useEffect(() => { setUrlIdx(0); setFailed(false); }, [id, back]);
  if (failed) {
    const colors = ["#6390F0","#EE8130","#7AC74C","#F95587","#F7D02C","#96D9D6","#A98FF3","#A6B91A","#B6A136","#735797"];
    return (
      <div style={{ width: size, height: size, borderRadius: "50%", background: colors[id % colors.length], display: "flex", alignItems: "center", justifyContent: "center", fontSize: Math.floor(size * 0.28), fontWeight: 800, color: "#fff", flexShrink: 0, ...sx }}>
        {id}
      </div>
    );
  }
  return (
    <img src={urls[urlIdx]} alt="" onError={() => urlIdx < urls.length - 1 ? setUrlIdx(i => i + 1) : setFailed(true)}
      style={{ width: size, height: size, imageRendering: "pixelated", flexShrink: 0, ...sx }} />
  );
}

function HpBar({ pct }) {
  const color = pct > 0.5 ? "#4ADE80" : pct > 0.25 ? "#FBBF24" : "#EF4444";
  return (
    <div style={{ width: "100%", height: 8, background: "#374151", borderRadius: 4, overflow: "hidden" }}>
      <div style={{ width: `${Math.max(0, pct * 100)}%`, height: "100%", background: color, borderRadius: 4, transition: "width 0.4s ease" }} />
    </div>
  );
}

function PartySlot({ poke, dead, compact }) {
  if (!poke) return <div style={{ border: "1.5px dashed #E5E7EB", borderRadius: 10, height: compact ? 52 : 60, opacity: 0.4 }} />;
  return (
    <div style={{ background: dead ? "#111" : "#fff", border: `1.5px solid ${dead ? "#2a2a2a" : "#E8ECF0"}`, borderRadius: 10, padding: compact ? "7px 10px" : "10px 12px", display: "flex", alignItems: "center", gap: 8, opacity: dead ? 0.5 : 1 }}>
      <Sprite id={poke.id} size={compact ? 32 : 40} style={{ filter: dead ? "grayscale(1)" : poke.legendary ? "drop-shadow(0 0 4px gold)" : "none" }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}>
          {poke.legendary && <span style={{ fontSize: 10 }}>⭐</span>}
          <span style={{ fontWeight: 700, fontSize: compact ? 11 : 12, color: dead ? "#666" : "#1E2533" }}>{poke.displayName}</span>
          <span style={{ fontSize: 10, color: "#9CA3AF" }}>Lv{poke.level}</span>
          {dead && <span style={{ fontSize: 10 }}>💀</span>}
        </div>
        <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>{poke.types.map(t => <TypePill key={t} type={t} />)}</div>
      </div>
    </div>
  );
}

// ─── BATTLE ARENA ─────────────────────────────────────────────────────────────
function BattleArena({ frames, playerTeam, enemyTeam, onDone }) {
  const [fi, setFi] = useState(0);
  const [done, setDone] = useState(false);
  const timerRef = useRef();
  useEffect(() => { setFi(0); setDone(false); }, [frames]);
  useEffect(() => {
    if (!frames?.length) return;
    if (fi >= frames.length - 1) { if (!done) { setDone(true); onDone?.(); } return; }
    timerRef.current = setTimeout(() => setFi(i => i + 1), 700);
    return () => clearTimeout(timerRef.current);
  }, [fi, frames, done, onDone]);

  if (!frames?.length) return null;
  const frame = frames[Math.min(fi, frames.length - 1)];
  const { playerIdx, enemyIdx, playerHpPcts, enemyHpPcts,
    playerAttacking, enemyAttacking, playerFainted, enemyFainted, message, msgColor } = frame;

  // Use playerIdx/enemyIdx from the frame to pick the right pokemon
  const P = playerTeam[playerIdx];
  const E = enemyTeam[enemyIdx];

  return (
    <div style={{ background: "linear-gradient(180deg,#1a2540 0%,#2d3a5e 58%,#3d5a3e 58%,#2a4020 100%)", borderRadius: 12, padding: "16px 14px 14px", userSelect: "none" }}>
      {/* Enemy row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 14, gap: 10 }}>
        <div style={{ background: "rgba(0,0,0,0.6)", borderRadius: 8, padding: "8px 12px", flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#fff", marginBottom: 3 }}>
            {E?.legendary && <span style={{ color: "gold", marginRight: 4 }}>⭐</span>}
            {E?.displayName} <span style={{ fontSize: 10, color: "#9CA3AF" }}>Lv{E?.level}</span>
          </div>
          <HpBar pct={enemyHpPcts[enemyIdx] ?? 1} />
          <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 2 }}>{((enemyHpPcts[enemyIdx] ?? 1) * 100).toFixed(0)}%</div>
          <div style={{ display: "flex", gap: 3, marginTop: 4 }}>
            {enemyTeam.map((_, i) => <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: enemyHpPcts[i] > 0 ? "#4ADE80" : "#EF4444", opacity: i > enemyIdx ? 0.35 : 1 }} />)}
          </div>
        </div>
        <div style={{ transition: "transform 0.15s, opacity 0.35s", transform: enemyFainted ? "translateY(40px)" : enemyAttacking ? "translateX(-18px)" : "translateX(0)", opacity: enemyFainted ? 0 : 1, flexShrink: 0 }}>
          {E && <Sprite id={E.id} size={80} />}
        </div>
      </div>
      {/* Message */}
      <div style={{ background: "rgba(0,0,0,0.75)", borderRadius: 6, padding: "6px 12px", marginBottom: 14, minHeight: 28, display: "flex", alignItems: "center" }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: msgColor || "#E2E8F0", letterSpacing: "0.02em" }}>{message || "…"}</span>
      </div>
      {/* Player row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 10 }}>
        <div style={{ transition: "transform 0.15s, opacity 0.35s", transform: playerFainted ? "translateY(40px)" : playerAttacking ? "translateX(18px)" : "translateX(0)", opacity: playerFainted ? 0 : 1, flexShrink: 0 }}>
          {P && <Sprite id={P.id} back size={80} />}
        </div>
        <div style={{ background: "rgba(0,0,0,0.6)", borderRadius: 8, padding: "8px 12px", flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#fff", marginBottom: 3 }}>
            {P?.legendary && <span style={{ color: "gold", marginRight: 4 }}>⭐</span>}
            {P?.displayName} <span style={{ fontSize: 10, color: "#9CA3AF" }}>Lv{P?.level}</span>
          </div>
          <HpBar pct={playerHpPcts[playerIdx] ?? 1} />
          <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 2 }}>{((playerHpPcts[playerIdx] ?? 1) * 100).toFixed(0)}%</div>
          <div style={{ display: "flex", gap: 3, marginTop: 4 }}>
            {playerTeam.map((_, i) => <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: playerHpPcts[i] > 0 ? "#4ADE80" : "#EF4444", opacity: i > playerIdx ? 0.35 : 1 }} />)}
          </div>
        </div>
      </div>
      <div style={{ textAlign: "center", marginTop: 8, fontSize: 10, color: "rgba(255,255,255,0.25)" }}>
        {Math.min(fi + 1, frames.length)} / {frames.length}
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  // ── loading state ──
  const [loadState, setLoadState] = useState("idle"); // idle | loading | ready | error
  const [loadMsg, setLoadMsg] = useState("");
  const [pokedex, setPokedex] = useState({});   // id -> pokemonData
  const [evoMap, setEvoMap] = useState({});      // baseId -> [evoId, minLevel]
  const eeveeKeyRef = useRef({});               // baseId unique key -> chosen evo id

  // ── game state ──
  const [screen, setScreen] = useState("setup");
  const [regionKey, setRegionKey] = useState("kanto");
  const [party, setParty] = useState([]);
  const [grave, setGrave] = useState([]);
  const [si, setSi] = useState(0);
  const [bonusLevels, setBonusLevels] = useState(0); // carried bonus until next gym
  const [runLog, setRunLog] = useState([]);
  const [starterOpts, setStarterOpts] = useState([]);
  const [encounterOpts, setEncounterOpts] = useState([]);
  const [catchResult, setCatchResult] = useState(null);
  const [battleFrames, setBattleFrames] = useState([]);
  const [battlePlayerTeam, setBattlePlayerTeam] = useState([]);
  const [battleEnemyTeam, setBattleEnemyTeam] = useState([]);
  const [battleDone, setBattleDone] = useState(null);
  const [battleAnimDone, setBattleAnimDone] = useState(false);
  const [event, setEvent] = useState(null);
  const [tradeOffer, setTradeOffer] = useState(null);
  const [releaseFor, setReleaseFor] = useState(null);
  const [subscreen, setSubscreen] = useState("main");
  const [reorderMode, setReorderMode] = useState(false);
  const [dragIdx, setDragIdx] = useState(null);
  const [battleStyle, setBattleStyle] = useState("between");

  const region = REGIONS[regionKey];
  const stage = region.stages[si] || null;
  const isGymStage = stage && (stage.type === "gym" || stage.type === "elite4" || stage.type === "champion");

  function log(msg) { setRunLog(prev => [msg, ...prev].slice(0, 50)); }

  // ── PokéAPI loading ──
  async function loadAllData(rKey) {
    const reg = REGIONS[rKey];
    setLoadState("loading");
    setLoadMsg("Loading Pokémon data from PokéAPI…");
    try {
      // Collect all IDs needed
      const allIds = new Set([
        ...reg.starters,
        ...(REGION_LEGENDARIES[rKey] || []),
        ...reg.stages.flatMap(s => [
          ...(s.pool || []),
          ...(s.team || []).map(e => e.id),
        ]),
      ]);
      // Also add evolution targets (we'll discover these after loading)
      setLoadMsg(`Fetching ${allIds.size} Pokémon…`);
      const pd = await preloadPokemon([...allIds]);

      // Now fetch evolution chains
      setLoadMsg("Loading evolution chains…");
      const em = await preloadEvoChains(pd);

      // Fetch any additional evolved forms referenced in the evo map
      const evoTargets = Object.values(em).map(([evoId]) => evoId).filter(id => !pd[id]);
      if (evoTargets.length > 0) {
        setLoadMsg(`Loading ${evoTargets.length} evolved forms…`);
        const extraPd = await preloadPokemon(evoTargets);
        Object.assign(pd, extraPd);
        // Re-run evo chains to get deeper evolutions
        const em2 = await preloadEvoChains(pd);
        Object.assign(em, em2);
        // One more pass for anything missed
        const evoTargets2 = Object.values(em).map(([evoId]) => evoId).filter(id => !pd[id]);
        if (evoTargets2.length > 0) {
          const extraPd2 = await preloadPokemon(evoTargets2);
          Object.assign(pd, extraPd2);
        }
      }

      // Load Eevee evolutions
      setLoadMsg("Loading Eevee evolutions…");
      const eeveeEvoData = await preloadPokemon(EEVEE_EVOS);
      Object.assign(pd, eeveeEvoData);

      setPokedex(pd);
      setEvoMap(em);
      // Compute starters now while we have local refs — don't rely on state flush
      const starterList = REGIONS[rKey].starters.map(id => {
        let cur = id;
        let safety = 0;
        while (em[cur] && safety++ < 10) {
          const [nextId, minLvl] = em[cur];
          if (5 >= minLvl) cur = nextId; else break;
        }
        const base = pd[cur] || pd[id];
        return base ? { ...base, level: 5, baseId: id } : null;
      }).filter(Boolean);
      setStarterOpts(starterList);
      setLoadState("ready");
      setLoadMsg("");
      return { pd, em };
    } catch (e) {
      console.error(e);
      setLoadState("error");
      setLoadMsg(e.message || "Network error");
      return null;
    }
  }

  // ── Pokemon helpers (use loaded data) ──
  function getPokemonAtLevel(baseId, level, eeveeKey) {
    // Eevee special case
    if (baseId === 133 && level >= 28) {
      const key = eeveeKey || `eevee_${baseId}`;
      if (!eeveeKeyRef.current[key]) {
        eeveeKeyRef.current[key] = EEVEE_EVOS[Math.floor(Math.random() * EEVEE_EVOS.length)];
      }
      const evo = pokedex[eeveeKeyRef.current[key]];
      if (evo) return { ...evo, level, baseId, eeveeKey: key };
    }
    // Walk evo chain
    let id = baseId;
    let safety = 0;
    while (evoMap[id] && safety++ < 10) {
      const [nextId, minLvl] = evoMap[id];
      if (level >= minLvl) id = nextId;
      else break;
    }
    const base = pokedex[id] || pokedex[baseId];
    if (!base) return null;
    return { ...base, level, baseId };
  }

  function levelUpParty(currentParty, toLevel) {
    return currentParty.map(p => {
      const evolved = getPokemonAtLevel(p.baseId || p.id, toLevel, p.eeveeKey);
      if (!evolved) return { ...p, level: toLevel };
      if (evolved.id !== p.id) log(`✨ ${p.displayName} evolved into ${evolved.displayName}!`);
      return { ...evolved, baseId: p.baseId || p.id, eeveeKey: p.eeveeKey };
    });
  }

  // ── Stage transitions ──
  function enterStage(idx, currentParty, currentBonus = bonusLevels) {
    const s = region.stages[idx];
    if (!s) { setScreen("win"); return; }

    // Level up: apply bonus to route levels too, reset at gym start (gym fights at +bonus)
    const targetLevel = s.level + currentBonus;
    const leveled = levelUpParty(currentParty, targetLevel);
    setParty(leveled);

    resetBattle();
    setCatchResult(null);
    setEvent(null);
    setTradeOffer(null);
    setReleaseFor(null);
    setSi(idx);

    if (s.type === "route") {
      const eventsInLog = runLog.filter(l => l.startsWith("🎉")).length;
      if (eventsInLog < 4 && Math.random() < 0.30) {
        setEvent(SPECIAL_EVENTS[Math.floor(Math.random() * SPECIAL_EVENTS.length)]);
        setSubscreen("event");
      } else {
        buildEncounter(s, idx, leveled);
        setSubscreen("encounter");
      }
    } else {
      setReorderMode(false);
      setSubscreen("battle");
    }
  }

  function buildEncounter(s, stageIdx, currentParty) {
    const encounterChance = Math.max(0.6, 0.95 - (stageIdx / region.stages.length) * 0.35);
    if (Math.random() > encounterChance) {
      log("🌿 Nothing in the tall grass…");
      setTimeout(() => nextStage(currentParty || party), 1200);
      setEncounterOpts([]);
      setSubscreen("encounter");
      return;
    }
    let pool = [...s.pool].sort(() => Math.random() - 0.5).slice(0, 3);
    if (s.legendary && Math.random() < 0.12) {
      const legs = REGION_LEGENDARIES[regionKey] || [];
      if (legs.length) pool = [legs[Math.floor(Math.random() * legs.length)], ...pool.slice(0, 2)];
    }
    const catchRate = (isLeg, si2) => isLeg ? 0.05 : Math.max(0.55, 0.80 - (si2 / region.stages.length) * 0.25);
    const opts = pool.map(id => {
      const p = getPokemonAtLevel(id, s.level);
      if (!p) return null;
      return { ...p, catchChance: catchRate(!!p.legendary, stageIdx) };
    }).filter(Boolean);
    setEncounterOpts(opts);
  }

  function resetBattle() {
    setBattleFrames([]);
    setBattlePlayerTeam([]);
    setBattleEnemyTeam([]);
    setBattleDone(null);
    setBattleAnimDone(false);
  }

  function nextStage(currentParty) {
    enterStage(si + 1, currentParty, bonusLevels);
  }

  // ── Catch ──
  function tryAttemptCatch(poke) {
    Math.random() < poke.catchChance
      ? setCatchResult({ status: "success", poke })
      : setCatchResult({ status: "fail", poke });
  }

  function confirmCatch(poke) {
    setCatchResult(null);
    const withBase = { ...poke, baseId: poke.baseId || poke.id };
    if (party.length >= 6) {
      setReleaseFor(withBase);
      setSubscreen("release");
    } else {
      const next = [...party, withBase];
      setParty(next);
      log(`🎉 ${poke.displayName} joined!`);
      nextStage(next);
    }
  }

  function skipEncounter() { log("🏃 Skipped."); nextStage(party); }

  function handleRelease(releaseId) {
    const released = party.find(p => p.id === releaseId);
    const next = party.filter(p => p.id !== releaseId).concat([releaseFor]);
    setParty(next);
    log(`🔄 Released ${released?.displayName}. ${releaseFor.displayName} joined!`);
    setReleaseFor(null);
    nextStage(next);
  }

  // ── Events ──
  function handleEvent(ev) {
    const s = stage;
    if (ev.effect === "bonus") {
      // Add to bonusLevels — it will be applied on the NEXT stage enter, and cleared after gym
      const newBonus = bonusLevels + ev.value;
      setBonusLevels(newBonus);
      // Apply immediately to current party too (they're on this route)
      const boosted = levelUpParty(party, s.level + newBonus);
      setParty(boosted);
      log(`🎉 ${ev.label}: +${ev.value} bonus levels! (total +${newBonus} until next gym)`);
      setEvent(null);
      buildEncounter(s, si, boosted);
      setSubscreen("encounter");
    } else if (ev.effect === "trade") {
      const allIds = region.stages.flatMap(x => x.pool || []);
      const offered = getPokemonAtLevel(allIds[Math.floor(Math.random() * allIds.length)], s.level);
      if (offered) { setTradeOffer(offered); setEvent(null); setSubscreen("trade"); }
    } else if (ev.effect === "gift") {
      const allIds = region.stages.flatMap(x => x.pool || []);
      const gift = getPokemonAtLevel(allIds[Math.floor(Math.random() * allIds.length)], s.level);
      if (!gift) return;
      log(`🎉 ${ev.label}`);
      const withBase = { ...gift, baseId: gift.baseId || gift.id };
      if (party.length < 6) {
        const next = [...party, withBase]; setParty(next);
        log(`${gift.displayName} joined!`); setEvent(null); nextStage(next);
      } else {
        setReleaseFor(withBase); setEvent(null); setSubscreen("release");
      }
    }
  }

  function skipEvent() { setEvent(null); buildEncounter(stage, si, party); setSubscreen("encounter"); }

  function acceptTrade(myId) {
    const mine = party.find(p => p.id === myId);
    const withBase = { ...tradeOffer, baseId: tradeOffer.baseId || tradeOffer.id };
    const next = party.filter(p => p.id !== myId).concat([withBase]);
    setParty(next);
    log(`🔄 Traded ${mine?.displayName} for ${tradeOffer.displayName}!`);
    setTradeOffer(null); nextStage(next);
  }
  function skipTrade() { setTradeOffer(null); buildEncounter(stage, si, party); setSubscreen("encounter"); }

  // ── Battle ──
  function startBattle() {
    const s = stage;
    // Enemy levels are fixed from stage data (not boosted by bonusLevels — player advantage)
    const enemies = s.team.map(e => {
      const p = getPokemonAtLevel(e.id, e.lv);
      return p ? { ...p, baseId: e.id } : null;
    }).filter(Boolean);

    const result = simulateBattle(party, enemies, battleStyle);

    // Snapshot teams for arena display
    setBattlePlayerTeam([...party]);
    setBattleEnemyTeam(enemies);
    setBattleFrames(result.frames);

    // Store result — use the OBJECTS returned by simulateBattle directly
    setBattleDone({
      won: result.won,
      survivedPokemon: result.survivedPokemon,
      faintedPokemon: result.faintedPokemon,
    });
  }

  function afterBattle() {
    if (!battleDone) return;
    const { won, survivedPokemon, faintedPokemon } = battleDone;
    const stageSnap = region.stages[si];

    // ── Always move fainted to grave, remove from party — regardless of win/loss ──
    setGrave(prev => [...prev, ...faintedPokemon]);
    faintedPokemon.forEach(p => log(`💀 ${p.displayName} fell permanently.`));

    if (won) {
      if (stageSnap?.badge) log(`🏅 ${stageSnap.badge} obtained! Defeated ${stageSnap.leader}.`);
      else log(`✅ Defeated ${stageSnap?.leader}!`);

      if (survivedPokemon.length === 0) {
        log("💔 No Pokémon left. Run over.");
        setParty([]);
        setScreen("over");
        return;
      }

      // Clear bonus levels after a gym
      const nextBonus = 0;
      setBonusLevels(0);
      log("💊 Healed at Pokémon Center!");

      // Heal survivors to full HP by re-fetching their stats at current level
      const healed = levelUpParty(survivedPokemon, stageSnap.level + bonusLevels);
      setParty(healed);
      enterStage(si + 1, healed, nextBonus);
    } else {
      log(`❌ Defeated by ${stageSnap?.leader}.`);
      setParty(survivedPokemon);
      setScreen("over");
    }
  }

  function movePartySlot(from, to) {
    if (from === to) return;
    const next = [...party];
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m);
    setParty(next);
  }

  function fullReset() {
    setScreen("setup"); setParty([]); setGrave([]); setRunLog([]); setSi(0);
    setBonusLevels(0); resetBattle(); setCatchResult(null); setSubscreen("main");
    setEvent(null); setTradeOffer(null); setReleaseFor(null); setReorderMode(false);
    setStarterOpts([]); setEncounterOpts([]);
  }

  // ─── RENDER ─────────────────────────────────────────────────────────────────
  const base = { minHeight: "100vh", fontFamily: "'Inter',system-ui,sans-serif", background: "#F8FAFC" };

  // ── SETUP ──
  if (screen === "setup" && loadState !== "ready") return (
    <div style={{ ...base, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ maxWidth: 440, width: "100%", padding: 32 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", color: "#E53935", textTransform: "uppercase", marginBottom: 8 }}>Nuzlocke Simulator</div>
        <h1 style={{ fontSize: 38, fontWeight: 800, color: "#1E2533", margin: "0 0 8px", lineHeight: 1.1 }}>Choose your<br />adventure.</h1>
        <p style={{ color: "#6B7280", fontSize: 14, lineHeight: 1.6, marginBottom: 28 }}>Catch Pokémon, battle gym leaders, survive. If one faints — it's gone forever.</p>

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>Region</div>
          <div style={{ display: "flex", gap: 10 }}>
            {Object.entries(REGIONS).map(([k, r]) => (
              <button key={k} onClick={() => setRegionKey(k)} style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: `2px solid ${regionKey === k ? "#E53935" : "#E5E7EB"}`, background: regionKey === k ? "#FFF5F5" : "#fff", fontWeight: 700, fontSize: 14, color: regionKey === k ? "#E53935" : "#374151", cursor: "pointer" }}>
                {r.name}
              </button>
            ))}
          </div>
        </div>

        {loadState === "error" && (
          <div style={{ background: "#FEF2F2", border: "1px solid #FCA5A5", borderRadius: 10, padding: "12px 16px", marginBottom: 16, fontSize: 13, color: "#DC2626" }}>
            ⚠️ Failed to load: {loadMsg}
          </div>
        )}

        <button onClick={() => { if (loadState === "idle" || loadState === "error") loadAllData(regionKey); }}
          disabled={loadState === "loading"}
          style={{ width: "100%", padding: "16px 0", background: loadState === "loading" ? "#9CA3AF" : "#E53935", color: "#fff", border: "none", borderRadius: 12, fontWeight: 800, fontSize: 16, cursor: loadState === "loading" ? "not-allowed" : "pointer" }}>
          {loadState === "loading" ? loadMsg || "Loading…" : "Begin Adventure →"}
        </button>
      </div>
    </div>
  );

  // ── STARTER PICKER (shown after loading completes) ──
  if (screen === "setup" && loadState === "ready") {
    // handled below
  }

  // (starter screen transition is handled directly in the button's onClick)

  if (screen === "starter" || (screen === "setup" && loadState === "ready")) return (
    <div style={{ ...base, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ maxWidth: 480, width: "100%", padding: 32 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", color: "#E53935", textTransform: "uppercase", marginBottom: 8 }}>{region.name}</div>
        <h2 style={{ fontSize: 28, fontWeight: 800, color: "#1E2533", margin: "0 0 6px" }}>Choose your starter.</h2>
        <p style={{ color: "#6B7280", fontSize: 13, marginBottom: 24 }}>Your first partner. Choose wisely.</p>
        {starterOpts.length === 0
          ? <div style={{ color: "#9CA3AF" }}>Loading…</div>
          : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {starterOpts.map(p => (
                <button key={p.id} onClick={() => {
                  const poke = { ...p, baseId: p.id };
                  setParty([poke]);
                  setGrave([]);
                  setSi(0);
                  setBonusLevels(0);
                  setRunLog([`🌍 Adventure in ${region.name} begins!`, `🎯 You chose ${p.displayName}!`]);
                  enterStage(0, [poke], 0);
                  setScreen("game");
                }} style={{ background: "#fff", border: "2px solid #E5E7EB", borderRadius: 14, padding: "14px 16px", display: "flex", alignItems: "center", gap: 14, cursor: "pointer", textAlign: "left" }}>
                  <img src={p.artwork || p.sprite} alt={p.displayName} style={{ width: 72, height: 72, objectFit: "contain" }} />
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 18, color: "#1E2533", marginBottom: 4 }}>{p.displayName}</div>
                    <div style={{ display: "flex", gap: 6, marginBottom: 4 }}>{p.types.map(t => <TypePill key={t} type={t} />)}</div>
                    <div style={{ fontSize: 11, color: "#9CA3AF" }}>HP {p.hp} · Spd {p.speed} · BST {p.bst}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
      </div>
    </div>
  );

  // ── OVER / WIN ──
  if (screen === "over" || screen === "win") {
    const won = screen === "win";
    return (
      <div style={{ ...base, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ maxWidth: 520, width: "100%", padding: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>{won ? "🏆" : "💀"}</div>
          <h1 style={{ fontSize: 32, fontWeight: 800, color: "#1E2533", margin: "0 0 4px" }}>{won ? "Champion!" : "Run Over."}</h1>
          <p style={{ color: "#6B7280", fontSize: 14, marginBottom: 24 }}>{won ? `You conquered ${region.name}!` : "Your team was wiped out."}</p>
          {party.length > 0 && <>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.1em" }}>Survivors</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>{party.map((p, i) => <PartySlot key={i} poke={p} />)}</div>
          </>}
          {grave.length > 0 && <>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.1em" }}>Fallen</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 24 }}>{grave.map((p, i) => <PartySlot key={i} poke={p} dead />)}</div>
          </>}
          <button onClick={fullReset} style={{ padding: "12px 28px", background: "#1E2533", color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>Play Again</button>
        </div>
      </div>
    );
  }

  // ── GAME ──
  return (
    <div style={{ ...base, display: "flex", minHeight: "100vh" }}>
      {/* Sidebar */}
      <div style={{ width: 220, background: "#fff", borderRight: "1px solid #E8ECF0", padding: "20px 12px", display: "flex", flexDirection: "column", gap: 8, flexShrink: 0, overflowY: "auto" }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.15em", color: "#9CA3AF", textTransform: "uppercase", marginBottom: 4 }}>Party</div>
        {[0, 1, 2, 3, 4, 5].map(i => <PartySlot key={i} poke={party[i] || null} compact />)}
        {bonusLevels > 0 && (
          <div style={{ background: "#FFFBEB", border: "1px solid #FCD34D", borderRadius: 8, padding: "6px 10px", fontSize: 11, color: "#D97706", fontWeight: 700, marginTop: 4 }}>
            +{bonusLevels} bonus Lv until gym
          </div>
        )}
        {grave.length > 0 && <>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: "#9CA3AF", textTransform: "uppercase", marginTop: 12 }}>Fallen</div>
          {grave.map((p, i) => <PartySlot key={i} poke={p} dead compact />)}
        </>}
      </div>

      {/* Main */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto" }}>
        {/* Header */}
        <div style={{ borderBottom: "1px solid #E8ECF0", padding: "14px 24px", display: "flex", alignItems: "center", gap: 16, background: "#fff", flexShrink: 0 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", letterSpacing: "0.1em", textTransform: "uppercase" }}>
              {region.name} · Stage {si + 1}/{region.stages.length}
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#1E2533", marginTop: 1 }}>{stage?.name || "—"}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 10, color: "#9CA3AF" }}>Team level</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: "#E53935" }}>
              Lv{stage ? stage.level + bonusLevels : "—"}
            </div>
          </div>
        </div>

        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>

          {/* ── ENCOUNTER ── */}
          {subscreen === "encounter" && (
            <div style={{ background: "#fff", border: "1.5px solid #E8ECF0", borderRadius: 14, padding: 20 }}>
              {encounterOpts.length === 0
                ? <div style={{ color: "#9CA3AF", fontSize: 14 }}>🌿 Nothing appeared…</div>
                : (<>
                  <div style={{ fontWeight: 800, fontSize: 16, color: "#1E2533", marginBottom: 4 }}>Wild Pokémon!</div>
                  <p style={{ color: "#6B7280", fontSize: 13, marginBottom: 16 }}>You have one chance to catch — or skip.</p>

                  {catchResult && (
                    <div style={{ background: catchResult.status === "success" ? "#F0FDF4" : "#FEF2F2", border: `1px solid ${catchResult.status === "success" ? "#86EFAC" : "#FCA5A5"}`, borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 13, fontWeight: 700, color: catchResult.status === "success" ? "#16A34A" : "#DC2626" }}>
                      {catchResult.status === "success"
                        ? `✅ Caught ${catchResult.poke.displayName}!`
                        : `❌ ${catchResult.poke.displayName} broke free!`}
                    </div>
                  )}

                  {!catchResult && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 12 }}>
                      {encounterOpts.map((p, i) => (
                        <button key={i} onClick={() => tryAttemptCatch(p)} style={{ background: p.legendary ? "#FFFBEB" : "#F8FAFC", border: `1.5px solid ${p.legendary ? "#FCD34D" : "#E5E7EB"}`, borderRadius: 12, padding: "12px 14px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", textAlign: "left" }}>
                          <Sprite id={p.id} size={48} />
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 14, color: "#1E2533" }}>
                              {p.legendary && <span style={{ color: "goldenrod" }}>⭐ </span>}
                              {p.displayName} <span style={{ color: "#9CA3AF", fontWeight: 400, fontSize: 12 }}>Lv{p.level}</span>
                            </div>
                            <div style={{ display: "flex", gap: 4, marginTop: 3 }}>{p.types.map(t => <TypePill key={t} type={t} />)}</div>
                            <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 3 }}>
                              HP {p.hp} · Spd {p.speed} · BST {p.bst}
                              {p.legendary && <span style={{ color: "#D97706", fontWeight: 700 }}> · {Math.round(p.catchChance * 100)}% catch</span>}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {catchResult?.status === "success" && (
                    <button onClick={() => confirmCatch(catchResult.poke)} style={{ padding: "10px 20px", background: "#16A34A", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer", marginRight: 8 }}>
                      Add to Party →
                    </button>
                  )}
                  {(catchResult?.status === "fail" || !catchResult) && (
                    <button onClick={skipEncounter} style={{ padding: "8px 16px", background: "#F3F4F6", border: "none", borderRadius: 8, color: "#6B7280", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
                      {catchResult?.status === "fail" ? "Continue →" : "Skip encounter"}
                    </button>
                  )}
                </>)}
            </div>
          )}

          {/* ── EVENT ── */}
          {subscreen === "event" && event && (
            <div style={{ background: "#FFFBEB", border: "1.5px solid #FCD34D", borderRadius: 14, padding: 20 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#D97706", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Special Event</div>
              <div style={{ fontWeight: 800, fontSize: 18, color: "#1E2533", marginBottom: 6 }}>{event.label}</div>
              <p style={{ color: "#6B7280", fontSize: 13, marginBottom: 16 }}>{event.desc}</p>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => handleEvent(event)} style={{ padding: "10px 20px", background: "#F59E0B", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Accept</button>
                <button onClick={skipEvent} style={{ padding: "10px 16px", background: "#F3F4F6", border: "none", borderRadius: 8, color: "#6B7280", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>Skip</button>
              </div>
            </div>
          )}

          {/* ── TRADE ── */}
          {subscreen === "trade" && tradeOffer && (
            <div style={{ background: "#fff", border: "1.5px solid #E8ECF0", borderRadius: 14, padding: 20 }}>
              <div style={{ fontWeight: 800, fontSize: 16, color: "#1E2533", marginBottom: 4 }}>🔄 Trade Offer</div>
              <p style={{ color: "#6B7280", fontSize: 13, marginBottom: 12 }}>A trainer offers their <strong>{tradeOffer.displayName}</strong> (Lv{tradeOffer.level}). Which do you give?</p>
              <div style={{ background: "#F8FAFC", border: "1.5px solid #E5E7EB", borderRadius: 10, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <Sprite id={tradeOffer.id} size={44} />
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "#1E2533" }}>{tradeOffer.displayName} <span style={{ color: "#9CA3AF", fontSize: 12 }}>Lv{tradeOffer.level}</span></div>
                  <div style={{ display: "flex", gap: 4, marginTop: 3 }}>{tradeOffer.types.map(t => <TypePill key={t} type={t} />)}</div>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                {party.map((p, i) => (
                  <button key={i} onClick={() => acceptTrade(p.id)} style={{ background: "#FFF5F5", border: "1.5px solid #FCA5A5", borderRadius: 10, padding: "8px 12px", display: "flex", alignItems: "center", gap: 8, cursor: "pointer", textAlign: "left" }}>
                    <Sprite id={p.id} size={32} />
                    <span style={{ fontWeight: 700, fontSize: 13, color: "#E53935" }}>Trade {p.displayName}</span>
                  </button>
                ))}
              </div>
              <button onClick={skipTrade} style={{ padding: "8px 16px", background: "#F3F4F6", border: "none", borderRadius: 8, color: "#6B7280", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>Decline</button>
            </div>
          )}

          {/* ── RELEASE ── */}
          {subscreen === "release" && releaseFor && (
            <div style={{ background: "#fff", border: "1.5px solid #E8ECF0", borderRadius: 14, padding: 20 }}>
              <div style={{ fontWeight: 800, fontSize: 16, color: "#1E2533", marginBottom: 4 }}>Party Full!</div>
              <p style={{ color: "#6B7280", fontSize: 13, marginBottom: 12 }}>Release a Pokémon to make room for <strong>{releaseFor.displayName}</strong>.</p>
              <div style={{ background: "#F8FAFC", border: "1.5px solid #E5E7EB", borderRadius: 10, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <Sprite id={releaseFor.id} size={40} />
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#1E2533" }}>{releaseFor.displayName} <span style={{ color: "#9CA3AF", fontSize: 12 }}>Lv{releaseFor.level}</span></div>
                  <div style={{ display: "flex", gap: 4, marginTop: 3 }}>{releaseFor.types.map(t => <TypePill key={t} type={t} />)}</div>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                {party.map((p, i) => (
                  <button key={i} onClick={() => handleRelease(p.id)} style={{ background: "#FFF5F5", border: "1.5px solid #FCA5A5", borderRadius: 10, padding: "8px 12px", display: "flex", alignItems: "center", gap: 8, cursor: "pointer", textAlign: "left" }}>
                    <Sprite id={p.id} size={32} />
                    <span style={{ fontWeight: 700, fontSize: 13, color: "#E53935" }}>Release {p.displayName}</span>
                  </button>
                ))}
              </div>
              <button onClick={() => { setReleaseFor(null); nextStage(party); }} style={{ padding: "8px 16px", background: "#F3F4F6", border: "none", borderRadius: 8, color: "#6B7280", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>Skip</button>
            </div>
          )}

          {/* ── BATTLE ── */}
          {subscreen === "battle" && stage && (
            <div style={{ background: "#fff", border: "1.5px solid #E8ECF0", borderRadius: 14, padding: 20 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#E53935", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>
                {stage.type === "champion" ? "Champion" : stage.type === "elite4" ? "Elite Four" : "Gym Battle"}
              </div>
              <div style={{ fontWeight: 800, fontSize: 22, color: "#1E2533", marginBottom: 2 }}>{stage.leader}</div>
              {stage.badge && <div style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 14 }}>· {stage.badge}</div>}

              {!battleFrames.length && (<>
                {/* Enemy team preview */}
                <div style={{ fontSize: 11, fontWeight: 600, color: "#9CA3AF", marginBottom: 8 }}>Enemy team</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
                  {stage.team.map((e, i) => {
                    const p = getPokemonAtLevel(e.id, e.lv);
                    return (
                      <div key={i} style={{ background: "#F8FAFC", border: "1.5px solid #E5E7EB", borderRadius: 8, padding: "6px 10px", display: "flex", alignItems: "center", gap: 6 }}>
                        <Sprite id={e.id} size={28} />
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "#1E2533" }}>{p?.displayName || `#${e.id}`}</div>
                          <div style={{ fontSize: 10, color: "#9CA3AF" }}>Lv{e.lv}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Battle style */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#9CA3AF", marginBottom: 8 }}>Battle style</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    {[
                      { key: "allout", label: "All Out", desc: "Never switch. Fight to the end." },
                      { key: "between", label: "Between Fights", desc: "Switch out if <30% HP after beating a foe." },
                      { key: "weakswitch", label: "Switch When Weak", desc: "Also mid-fight at <20% HP — take one free hit." },
                    ].map(({ key, label, desc }) => (
                      <button key={key} onClick={() => setBattleStyle(key)} style={{ textAlign: "left", padding: "8px 12px", borderRadius: 8, border: `1.5px solid ${battleStyle === key ? "#E53935" : "#E5E7EB"}`, background: battleStyle === key ? "#FFF5F5" : "#F8FAFC", cursor: "pointer" }}>
                        <span style={{ fontWeight: 700, fontSize: 12, color: battleStyle === key ? "#E53935" : "#1E2533" }}>{label}</span>
                        <span style={{ fontSize: 11, color: "#9CA3AF", marginLeft: 8 }}>{desc}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Party reorder */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#9CA3AF" }}>Party order (lead goes first)</div>
                    <button onClick={() => setReorderMode(r => !r)} style={{ fontSize: 10, padding: "2px 8px", background: reorderMode ? "#E53935" : "#F3F4F6", color: reorderMode ? "#fff" : "#6B7280", border: "none", borderRadius: 6, fontWeight: 700, cursor: "pointer" }}>
                      {reorderMode ? "Done" : "Reorder ↕"}
                    </button>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    {party.map((p, i) => (
                      <div key={p.id}
                        draggable={reorderMode}
                        onDragStart={() => setDragIdx(i)}
                        onDragOver={e => e.preventDefault()}
                        onDrop={() => { movePartySlot(dragIdx, i); setDragIdx(null); }}
                        style={{ background: dragIdx === i ? "#FFF5F5" : "#F8FAFC", border: `1.5px solid ${dragIdx === i ? "#E53935" : "#E5E7EB"}`, borderRadius: 10, padding: "8px 12px", display: "flex", alignItems: "center", gap: 8, cursor: reorderMode ? "grab" : "default" }}>
                        {reorderMode && <span style={{ fontSize: 14, color: "#9CA3AF", userSelect: "none" }}>☰</span>}
                        <span style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", minWidth: 16 }}>{i + 1}</span>
                        <Sprite id={p.id} size={32} />
                        <div style={{ flex: 1 }}>
                          <span style={{ fontWeight: 700, fontSize: 12, color: "#1E2533" }}>{p.displayName}</span>
                          <span style={{ fontSize: 10, color: "#9CA3AF", marginLeft: 5 }}>Lv{p.level}</span>
                        </div>
                        <div style={{ display: "flex", gap: 3 }}>{p.types.map(t => <TypePill key={t} type={t} />)}</div>
                        {reorderMode && i > 0 && <button onClick={() => movePartySlot(i, i - 1)} style={{ padding: "2px 6px", background: "#F3F4F6", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 12 }}>↑</button>}
                        {reorderMode && i < party.length - 1 && <button onClick={() => movePartySlot(i, i + 1)} style={{ padding: "2px 6px", background: "#F3F4F6", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 12 }}>↓</button>}
                      </div>
                    ))}
                  </div>
                </div>

                <button onClick={() => { setReorderMode(false); startBattle(); }} style={{ padding: "12px 24px", background: "#E53935", color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>⚔️ Fight!</button>
              </>)}

              {battleFrames.length > 0 && (
                <>
                  <BattleArena
                    frames={battleFrames}
                    playerTeam={battlePlayerTeam}
                    enemyTeam={battleEnemyTeam}
                    onDone={() => setBattleAnimDone(true)}
                  />
                  {battleDone && battleAnimDone && (
                    <div style={{ marginTop: 14 }}>
                      <div style={{ fontWeight: 800, fontSize: 20, color: battleDone.won ? "#16A34A" : "#E53935", marginBottom: 12 }}>
                        {battleDone.won ? "🎉 Victory!" : "💀 Defeated."}
                      </div>
                      <button onClick={afterBattle} style={{ padding: "12px 24px", background: battleDone.won ? "#16A34A" : "#E53935", color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                        {battleDone.won ? "Continue →" : "See Results"}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Run log */}
          {runLog.length > 0 && (
            <div style={{ background: "#fff", border: "1.5px solid #E8ECF0", borderRadius: 14, padding: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>Run Log</div>
              {runLog.map((e, i) => (
                <div key={i} style={{ fontSize: 12, color: "#374151", lineHeight: 1.7, opacity: Math.max(0.3, 1 - i * 0.07) }}>{e}</div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
