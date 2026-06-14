import { useState, useRef, useEffect } from "react";

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
    id, name: poke.name,
    displayName: poke.name.split("-").map(w => w[0].toUpperCase() + w.slice(1)).join(" "),
    types: poke.types.map(t => t.type.name),
    hp: stats.hp, speed: stats.speed,
    bst: poke.stats.reduce((s, x) => s + x.base_stat, 0),
    sprite: poke.sprites.front_default,
    artwork: poke.sprites.other?.["official-artwork"]?.front_default || poke.sprites.front_default,
    evolutionChainUrl: species?.evolution_chain?.url || null,
    legendary: species?.is_legendary || species?.is_mythical || false,
  };
}
const _evoCache = {};
async function fetchEvoChain(url) {
  if (_evoCache[url]) return _evoCache[url];
  const data = await apiFetch(url);
  const chain = [];
  function walk(node) {
    const id = parseInt(node.species.url.split("/").filter(Boolean).pop());
    chain.push({ id, minLevel: node.evolution_details?.[0]?.min_level || null });
    if (node.evolves_to?.length) walk(node.evolves_to[0]);
  }
  walk(data.chain);
  _evoCache[url] = chain;
  return chain;
}
async function preloadPokemon(ids) {
  const unique = [...new Set(ids)];
  const results = await Promise.allSettled(unique.map(id => fetchPokemonById(id)));
  const map = {};
  results.forEach((r, i) => { if (r.status === "fulfilled") map[unique[i]] = r.value; });
  return map;
}
async function preloadEvoChains(pokedex) {
  const evoMap = {};
  const urls = [...new Set(Object.values(pokedex).map(p => p.evolutionChainUrl).filter(Boolean))];
  const chains = await Promise.allSettled(urls.map(url => fetchEvoChain(url)));
  chains.forEach(r => {
    if (r.status !== "fulfilled") return;
    const chain = r.value;
    for (let i = 0; i < chain.length - 1; i++) {
      if (chain[i + 1].minLevel !== null) evoMap[chain[i].id] = [chain[i + 1].id, chain[i + 1].minLevel];
    }
  });
  return evoMap;
}

// ─── GAME DATA ────────────────────────────────────────────────────────────────
const REGIONS = {
  kanto: {
    name: "Kanto", starters: [1, 4, 7],
    // trainerId: NPC trainer IDs for gym leaders (from PokeAPI trainer-sprites)
    gymLeaders: {
      "Brock": { npc: "brock" }, "Misty": { npc: "misty" }, "Lt. Surge": { npc: "lt-surge" },
      "Erika": { npc: "erika" }, "Koga": { npc: "koga" }, "Sabrina": { npc: "sabrina" },
      "Blaine": { npc: "blaine" }, "Giovanni": { npc: "giovanni" },
      "Lorelei": { npc: "lorelei" }, "Bruno": { npc: "bruno" }, "Agatha": { npc: "agatha" },
      "Lance": { npc: "lance" }, "Blue": { npc: "blue-oak" },
    },
    stages: [
      { type:"route",    name:"Route 1",              level:5,  pool:[16,19,21,56] },
      { type:"route",    name:"Route 2",              level:8,  pool:[16,19,10,13,21,56] },
      { type:"gym",      name:"Pewter Gym",            level:12, leader:"Brock",    badge:"Boulder Badge", team:[{id:74,lv:12},{id:95,lv:14}] },
      { type:"route",    name:"Route 3",              level:14, pool:[23,27,39,41,46] },
      { type:"route",    name:"Mt. Moon",             level:16, pool:[41,74,138,140,35] },
      { type:"gym",      name:"Cerulean Gym",          level:21, leader:"Misty",    badge:"Cascade Badge",  team:[{id:120,lv:18},{id:121,lv:21}] },
      { type:"route",    name:"Route 6",              level:22, pool:[43,52,60,63,69] },
      { type:"route",    name:"Route 11",             level:24, pool:[23,41,52,69,84] },
      { type:"gym",      name:"Vermilion Gym",         level:26, leader:"Lt. Surge",badge:"Thunder Badge",  team:[{id:100,lv:21},{id:100,lv:21},{id:26,lv:24}] },
      { type:"route",    name:"Rock Tunnel",          level:28, pool:[66,74,95,41,42] },
      { type:"route",    name:"Route 8",              level:29, pool:[23,41,52,58,63] },
      { type:"gym",      name:"Celadon Gym",           level:29, leader:"Erika",    badge:"Rainbow Badge",  team:[{id:71,lv:29},{id:114,lv:24},{id:45,lv:29}] },
      { type:"route",    name:"Route 12",             level:31, pool:[60,98,102,129] },
      { type:"route",    name:"Safari Zone",          level:33, pool:[111,113,115,123,127,128,133], legendary:true },
      { type:"gym",      name:"Fuchsia Gym",           level:37, leader:"Koga",     badge:"Soul Badge",     team:[{id:109,lv:37},{id:109,lv:39},{id:110,lv:43},{id:49,lv:37}] },
      { type:"route",    name:"Route 15",             level:39, pool:[43,84,102,112,114], legendary:true },
      { type:"route",    name:"Route 16",             level:41, pool:[84,112,132,143], legendary:true },
      { type:"gym",      name:"Saffron Gym",           level:43, leader:"Sabrina",  badge:"Marsh Badge",    team:[{id:64,lv:38},{id:122,lv:37},{id:49,lv:38},{id:65,lv:43}] },
      { type:"route",    name:"Seafoam Islands",      level:44, pool:[86,87,90,91,124], legendary:true },
      { type:"route",    name:"Route 21",             level:46, pool:[72,73,98,99,129], legendary:true },
      { type:"gym",      name:"Cinnabar Gym",          level:47, leader:"Blaine",   badge:"Volcano Badge",  team:[{id:58,lv:42},{id:77,lv:40},{id:78,lv:42},{id:59,lv:47}] },
      { type:"route",    name:"Route 22",             level:48, pool:[29,32,56,104,111], legendary:true },
      { type:"route",    name:"Route 23",             level:50, pool:[23,24,66,67,111,112], legendary:true },
      { type:"gym",      name:"Viridian Gym",          level:50, leader:"Giovanni",  badge:"Earth Badge",    team:[{id:111,lv:45},{id:51,lv:42},{id:53,lv:44},{id:112,lv:45},{id:34,lv:50}] },
      { type:"elite4",   name:"Elite Four – Lorelei",  level:54, leader:"Lorelei",  team:[{id:86,lv:54},{id:87,lv:54},{id:91,lv:56},{id:124,lv:54},{id:131,lv:56}] },
      { type:"elite4",   name:"Elite Four – Bruno",    level:56, leader:"Bruno",    team:[{id:95,lv:53},{id:95,lv:55},{id:107,lv:55},{id:106,lv:55},{id:68,lv:56}] },
      { type:"elite4",   name:"Elite Four – Agatha",   level:58, leader:"Agatha",   team:[{id:94,lv:54},{id:93,lv:56},{id:42,lv:56},{id:94,lv:58}] },
      { type:"elite4",   name:"Elite Four – Lance",    level:60, leader:"Lance",    team:[{id:130,lv:56},{id:148,lv:56},{id:149,lv:58},{id:142,lv:58},{id:148,lv:60}] },
      { type:"champion", name:"Champion – Blue",       level:65, leader:"Blue",     badge:"Hall of Fame",   team:[{id:18,lv:65},{id:59,lv:63},{id:65,lv:63},{id:112,lv:61},{id:149,lv:63}] },
    ],
  },
  johto: {
    name: "Johto", starters: [152, 155, 158],
    gymLeaders: {
      "Falkner":{npc:"falkner"}, "Bugsy":{npc:"bugsy"}, "Whitney":{npc:"whitney"},
      "Morty":{npc:"morty"}, "Chuck":{npc:"chuck"}, "Jasmine":{npc:"jasmine"},
      "Pryce":{npc:"pryce"}, "Clair":{npc:"clair"},
      "Will":{npc:"will"}, "Koga":{npc:"koga"}, "Bruno":{npc:"bruno"},
      "Karen":{npc:"karen"}, "Lance":{npc:"lance"},
    },
    stages: [
      { type:"route",    name:"Route 29",             level:5,  pool:[161,163,167,194] },
      { type:"route",    name:"Route 30",             level:8,  pool:[163,167,177,187] },
      { type:"gym",      name:"Violet Gym",            level:9,  leader:"Falkner", badge:"Zephyr Badge",   team:[{id:21,lv:7},{id:22,lv:9}] },
      { type:"route",    name:"Route 32",             level:13, pool:[60,69,163,187,194] },
      { type:"route",    name:"Union Cave",           level:15, pool:[41,74,95,104,194] },
      { type:"gym",      name:"Azalea Gym",            level:17, leader:"Bugsy",   badge:"Hive Badge",     team:[{id:213,lv:15},{id:123,lv:15},{id:212,lv:17}] },
      { type:"route",    name:"Ilex Forest",          level:19, pool:[43,44,163,177] },
      { type:"route",    name:"Route 34",             level:21, pool:[29,32,43,92,186] },
      { type:"gym",      name:"Goldenrod Gym",         level:23, leader:"Whitney",  badge:"Plain Badge",    team:[{id:35,lv:18},{id:241,lv:23}] },
      { type:"route",    name:"Route 36",             level:25, pool:[29,32,48,193,203] },
      { type:"route",    name:"Route 37",             level:27, pool:[58,163,175,193] },
      { type:"gym",      name:"Ecruteak Gym",          level:25, leader:"Morty",    badge:"Fog Badge",      team:[{id:92,lv:21},{id:92,lv:21},{id:93,lv:23},{id:94,lv:25}] },
      { type:"route",    name:"Route 39",             level:29, pool:[29,32,39,40,241] },
      { type:"route",    name:"Route 41",             level:31, pool:[72,73,130,170,171] },
      { type:"gym",      name:"Cianwood Gym",          level:29, leader:"Chuck",    badge:"Storm Badge",    team:[{id:62,lv:27},{id:107,lv:29}] },
      { type:"route",    name:"Route 42",             level:32, pool:[66,111,177,203,206], legendary:true },
      { type:"route",    name:"Mt. Mortar",           level:34, pool:[66,74,95,236,246], legendary:true },
      { type:"gym",      name:"Olivine Gym",           level:35, leader:"Jasmine",  badge:"Mineral Badge",  team:[{id:208,lv:30},{id:208,lv:30},{id:82,lv:35}] },
      { type:"route",    name:"Route 44",             level:37, pool:[62,98,186,213,214], legendary:true },
      { type:"route",    name:"Ice Path",             level:39, pool:[86,87,220,221,225], legendary:true },
      { type:"gym",      name:"Mahogany Gym",          level:35, leader:"Pryce",    badge:"Glacier Badge",  team:[{id:86,lv:27},{id:87,lv:29},{id:131,lv:31}] },
      { type:"route",    name:"Route 45",             level:41, pool:[66,74,111,246,247], legendary:true },
      { type:"route",    name:"Route 46",             level:43, pool:[29,32,56,95,246], legendary:true },
      { type:"gym",      name:"Blackthorn Gym",        level:40, leader:"Clair",    badge:"Rising Badge",   team:[{id:148,lv:37},{id:148,lv:37},{id:148,lv:37},{id:230,lv:40}] },
      { type:"elite4",   name:"Elite Four – Will",     level:42, leader:"Will",     team:[{id:178,lv:40},{id:124,lv:41},{id:196,lv:41},{id:197,lv:41},{id:178,lv:42}] },
      { type:"elite4",   name:"Elite Four – Koga",     level:44, leader:"Koga",     team:[{id:49,lv:40},{id:110,lv:43},{id:169,lv:41},{id:89,lv:43},{id:49,lv:44}] },
      { type:"elite4",   name:"Elite Four – Bruno",    level:46, leader:"Bruno",    team:[{id:95,lv:42},{id:237,lv:41},{id:95,lv:42},{id:106,lv:42},{id:68,lv:46}] },
      { type:"elite4",   name:"Elite Four – Karen",    level:48, leader:"Karen",    team:[{id:197,lv:42},{id:45,lv:41},{id:94,lv:41},{id:229,lv:44},{id:248,lv:47}] },
      { type:"champion", name:"Champion – Lance",      level:50, leader:"Lance",    badge:"Hall of Fame",   team:[{id:149,lv:46},{id:149,lv:46},{id:148,lv:47},{id:142,lv:46},{id:149,lv:50}] },
    ],
  },
};

const KANTO_LEGENDARIES = [144, 145, 146];
const JOHTO_LEGENDARIES = [243, 244, 245];
const REGION_LEGENDARIES = { kanto: KANTO_LEGENDARIES, johto: JOHTO_LEGENDARIES };
const EEVEE_EVOS = [134, 135, 136, 196, 197];

const SPECIAL_EVENTS = [
  { id:"school",   label:"🎓 Pokémon School",   desc:"Free lessons. +2 bonus levels until next gym.", effect:"bonus", value:2 },
  { id:"training", label:"🏔️ Harsh Training",   desc:"Grueling terrain. +3 bonus levels until next gym.", effect:"bonus", value:3 },
  { id:"rival",    label:"🏆 Rival Battle",      desc:"Your rival shows up. +4 bonus levels until next gym.", effect:"bonus", value:4 },
  { id:"trade",    label:"🔄 Mystery Trade",     desc:"A trainer offers a trade for one of your Pokémon.", effect:"trade" },
  { id:"gift",     label:"🎁 Injured Pokémon",   desc:"You found a hurt Pokémon and nursed it back. It wants to join!", effect:"gift" },
];

// ─── TYPE CHART ───────────────────────────────────────────────────────────────
const WEAK = {
  normal:["fighting"],fire:["water","ground","rock"],water:["electric","grass"],
  electric:["ground"],grass:["fire","ice","poison","flying","bug"],
  ice:["fire","fighting","rock","steel"],fighting:["flying","psychic","fairy"],
  poison:["ground","psychic"],ground:["water","grass","ice"],
  flying:["electric","ice","rock"],psychic:["bug","ghost","dark"],
  bug:["fire","flying","rock"],rock:["water","grass","fighting","ground","steel"],
  ghost:["ghost","dark"],dragon:["ice","dragon","fairy"],
  dark:["fighting","bug","fairy"],steel:["fire","fighting","ground"],fairy:["poison","steel"],
};
const RESISTS = {
  fire:["fire","grass","ice","bug","steel","fairy"],water:["fire","water","ice","steel"],
  electric:["electric","flying","steel"],grass:["water","electric","grass","ground"],
  ice:["ice"],fighting:["bug","rock","dark"],poison:["grass","fighting","poison","bug","fairy"],
  ground:["poison","rock"],flying:["grass","fighting","bug"],psychic:["fighting","psychic"],
  bug:["grass","fighting","ground"],rock:["normal","fire","poison","flying"],
  ghost:["poison","bug"],dragon:["fire","water","grass","electric"],dark:["ghost","dark"],
  steel:["normal","grass","ice","flying","psychic","bug","rock","dragon","steel","fairy"],
  fairy:["fighting","bug","dark"],
};
const IMMUNE = {
  normal:["ghost"],electric:["ground"],flying:["ground"],ghost:["normal","fighting"],
  dragon:["fairy"],dark:["psychic"],steel:["poison"],fairy:["dragon"],
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
  let best = { mult: 0.5, type: atkTypes[0] };
  for (const t of atkTypes) {
    const m = effectiveness(t, defTypes);
    if (m > best.mult) best = { mult: m, type: t };
  }
  return best;
}

// ─── BATTLE SIM ───────────────────────────────────────────────────────────────
function simulateBattle(playerTeam, enemyTeam, style = "between") {
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
    const spi = (pTeam[pi]?.alive) ? pi : Math.max(0, pTeam.findIndex(p => p.alive));
    const sei = (eTeam[ei]?.alive) ? ei : Math.max(0, eTeam.findIndex(e => e.alive));
    frames.push({
      playerIdx: spi, enemyIdx: sei, ...hpPcts(),
      playerAttacking:false, enemyAttacking:false, playerFainted:false, enemyFainted:false,
      isBadgeFrame:false, message:"", msgColor:"#E2E8F0", ...extra,
    });
  }
  function dmg(atker, dfer, eff) {
    const crit = Math.random() < 0.0625;
    const raw = (atker.bst / Math.max(dfer.bst,1)) * eff.mult * (atker.hp * 0.28);
    return { val: Math.max(4, Math.round(raw * (0.85 + Math.random()*0.3) * (crit?1.5:1))), crit };
  }
  function nextAlive(team, idx) {
    const after = team.findIndex((p,i) => i > idx && p.alive);
    return after !== -1 ? after : team.findIndex(p => p.alive);
  }
  // Switch out current player pokemon (rotate to back); incoming pokemon takes free hit if weakswitch
  function doSwitch(msg, incomingTakesHit = false) {
    const cur = pTeam.splice(pi, 1)[0];
    pTeam.push(cur);
    pi = pTeam.findIndex(p => p.alive);
    if (pi === -1) return;
    pushFrame({ playerIdx: pi, enemyIdx: ei, ...hpPcts(), message: msg, msgColor:"#FBBF24" });
    if (incomingTakesHit && aliveCount(eTeam) > 0) {
      const incoming = pTeam[pi];
      const E = eTeam[ei];
      const eAtk = bestAttack(E.types, incoming.types);
      const { val, crit } = dmg(E, incoming, eAtk);
      incoming.curHp = Math.max(0, incoming.curHp - val);
      const eff = crit?" ⚡ Crit!": eAtk.mult>=2?" ✦ Super effective!": eAtk.mult===0?" No effect.":"";
      pushFrame({ playerIdx:pi, enemyIdx:ei, ...hpPcts(), enemyAttacking:true,
        message:`${E.displayName} hits ${incoming.displayName} as it comes in!${eff}`, msgColor:"#F87171" });
      if (incoming.curHp <= 0) {
        incoming.alive = false;
        pushFrame({ playerIdx:pi, enemyIdx:ei, ...hpPcts(), playerFainted:true,
          message:`${incoming.displayName} fainted!`, msgColor:"#EF4444" });
        pi = nextAlive(pTeam, pi);
        if (pi !== -1) pushFrame({ playerIdx:pi, enemyIdx:ei, ...hpPcts(),
          message:`Go, ${pTeam[pi].displayName}!`, msgColor:"#FBBF24" });
      }
    }
  }

  let rounds = 0;
  while (aliveCount(pTeam) > 0 && aliveCount(eTeam) > 0 && rounds++ < 300) {
    if (!pTeam[pi]?.alive) { pi = pTeam.findIndex(p=>p.alive); if(pi===-1) break; }
    if (!eTeam[ei]?.alive) { ei = eTeam.findIndex(e=>e.alive); if(ei===-1) break; }
    const P = pTeam[pi], E = eTeam[ei];
    const pAtk = bestAttack(P.types, E.types);
    const eAtk = bestAttack(E.types, P.types);
    const pFirst = P.speed >= E.speed;
    const [first, second, fEff, sEff, fIsP] = pFirst
      ? [P, E, pAtk, eAtk, true] : [E, P, eAtk, pAtk, false];

    // First strike
    const { val:d1, crit:c1 } = dmg(first, second, fEff);
    second.curHp = Math.max(0, second.curHp - d1);
    const e1 = c1?" ⚡ Crit!": fEff.mult>=2?" ✦ Super effective!": fEff.mult===0?" No effect.": fEff.mult<1?" Not very effective.":"";
    pushFrame({ playerIdx:pi, enemyIdx:ei, ...hpPcts(),
      playerAttacking:fIsP, enemyAttacking:!fIsP,
      message:`${first.displayName} → ${second.displayName}${e1||"!"}`,
      msgColor: c1?"#FBBF24": fEff.mult>=2?"#4ADE80": fEff.mult===0?"#9CA3AF":"#E2E8F0" });

    if (second.curHp <= 0) {
      second.alive = false;
      pushFrame({ playerIdx:pi, enemyIdx:ei, ...hpPcts(),
        playerFainted:!fIsP, enemyFainted:fIsP,
        message:`${second.displayName} fainted!`, msgColor:"#EF4444" });
      if (fIsP) {
        // enemy fainted
        const newEi = nextAlive(eTeam, ei);
        if (newEi !== -1 && eTeam[newEi]?.alive) {
          ei = newEi;
          pushFrame({ playerIdx:pi, enemyIdx:ei, ...hpPcts(),
            message:`Foe sends out ${eTeam[ei].displayName}!`, msgColor:"#FBBF24" });
        }
        // between/weakswitch: player rotates out if low HP, incoming enemy takes the switch hit? No — player retreats, INCOMING player takes free hit if weakswitch
        if ((style==="between"||style==="weakswitch") && aliveCount(eTeam)>0) {
          if (P.curHp/P.hp < 0.30 && aliveCount(pTeam)>1) {
            doSwitch(`${P.displayName} is hurt — retreating!`, style==="weakswitch");
          }
        }
      } else {
        // player fainted
        const newPi = nextAlive(pTeam, pi);
        if (newPi !== -1 && pTeam[newPi]?.alive) {
          pi = newPi;
          pushFrame({ playerIdx:pi, enemyIdx:ei, ...hpPcts(),
            message:`Go, ${pTeam[pi].displayName}!`, msgColor:"#FBBF24" });
        }
      }
      continue;
    }

    // Second strike
    if (!first.alive || !second.alive) continue;
    const { val:d2, crit:c2 } = dmg(second, first, sEff);
    first.curHp = Math.max(0, first.curHp - d2);
    const e2 = c2?" ⚡ Crit!": sEff.mult>=2?" ✦ Super effective!": sEff.mult===0?" No effect.": sEff.mult<1?" Not very effective.":"";
    pushFrame({ playerIdx:pi, enemyIdx:ei, ...hpPcts(),
      playerAttacking:!fIsP, enemyAttacking:fIsP,
      message:`${second.displayName} → ${first.displayName}${e2||"!"}`,
      msgColor: c2?"#FBBF24": sEff.mult>=2?"#4ADE80": sEff.mult===0?"#9CA3AF":"#E2E8F0" });

    // weakswitch mid-fight: player is at <20%, switch out — incoming takes free hit
    if (!fIsP && style==="weakswitch" && P.curHp>0 && aliveCount(pTeam)>1 && P.curHp/P.hp<0.20) {
      doSwitch(`${P.displayName} is low — retreating!`, true);
      continue;
    }

    if (first.curHp <= 0) {
      first.alive = false;
      pushFrame({ playerIdx:pi, enemyIdx:ei, ...hpPcts(),
        playerFainted:fIsP, enemyFainted:!fIsP,
        message:`${first.displayName} fainted!`, msgColor:"#EF4444" });
      if (fIsP) {
        const newPi = nextAlive(pTeam, pi);
        if (newPi!==-1 && pTeam[newPi]?.alive) {
          pi = newPi;
          pushFrame({ playerIdx:pi, enemyIdx:ei, ...hpPcts(),
            message:`Go, ${pTeam[pi].displayName}!`, msgColor:"#FBBF24" });
        }
      } else {
        const newEi = nextAlive(eTeam, ei);
        if (newEi!==-1 && eTeam[newEi]?.alive) {
          ei = newEi;
          pushFrame({ playerIdx:pi, enemyIdx:ei, ...hpPcts(),
            message:`Foe sends out ${eTeam[ei].displayName}!`, msgColor:"#FBBF24" });
        }
      }
    }
  }

  const won = aliveCount(eTeam) === 0;
  // Final frame — if won, show badge frame (no fainted ghost)
  const finalPi = Math.max(0, pTeam.findIndex(p=>p.alive));
  const finalEi = won ? ei : Math.max(0, eTeam.findIndex(e=>e.alive));
  pushFrame({
    playerIdx:finalPi, enemyIdx:finalEi, ...hpPcts(),
    isBadgeFrame:won,
    message: won?"🎉 Victory!":"💀 Defeated...",
    msgColor: won?"#4ADE80":"#EF4444",
  });

  return {
    won, frames,
    survivedPokemon: pTeam.filter(p=>p.alive).map(p => playerTeam.find(x=>(x.baseId||x.id)===(p.baseId||p.id)) || p),
    faintedPokemon:  pTeam.filter(p=>!p.alive).map(p => playerTeam.find(x=>(x.baseId||x.id)===(p.baseId||p.id)) || p),
  };
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const TYPE_COLOR = {
  normal:"#A8A77A",fire:"#EE8130",water:"#6390F0",electric:"#F7D02C",grass:"#7AC74C",
  ice:"#96D9D6",fighting:"#C22E28",poison:"#A33EA1",ground:"#E2BF65",flying:"#A98FF3",
  psychic:"#F95587",bug:"#A6B91A",rock:"#B6A136",ghost:"#735797",dragon:"#6F35FC",
  dark:"#705746",steel:"#B7B7CE",fairy:"#D685AD",
};

// ─── SMALL COMPONENTS ────────────────────────────────────────────────────────
function TypePill({ type }) {
  return <span style={{ background:TYPE_COLOR[type]||"#888", color:"#fff", fontSize:10, fontWeight:700, padding:"2px 7px", borderRadius:20, letterSpacing:"0.05em", textTransform:"uppercase" }}>{type}</span>;
}

function Sprite({ id, back, size=64, style:sx={} }) {
  const baseUrl = back
    ? `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/back/${id}.png`
    : `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;
  const artUrl = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;
  const [src, setSrc] = useState(baseUrl);
  const [failed, setFailed] = useState(false);
  useEffect(() => { setSrc(back ? `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/back/${id}.png` : `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`); setFailed(false); }, [id, back]);
  if (failed) {
    const cols = ["#6390F0","#EE8130","#7AC74C","#F95587","#F7D02C","#96D9D6","#A98FF3"];
    return <div style={{ width:size, height:size, borderRadius:"50%", background:cols[id%cols.length], display:"flex", alignItems:"center", justifyContent:"center", fontSize:Math.floor(size*0.25), fontWeight:800, color:"#fff", flexShrink:0, ...sx }}>{id}</div>;
  }
  return <img src={src} alt="" onError={() => src===baseUrl && !back ? setSrc(artUrl) : setFailed(true)} style={{ width:size, height:size, imageRendering:"pixelated", flexShrink:0, objectFit:"contain", ...sx }} />;
}

function HpBar({ pct, height=8 }) {
  const color = pct>0.5?"#4ADE80":pct>0.25?"#FBBF24":"#EF4444";
  return <div style={{ width:"100%", height, background:"#374151", borderRadius:height/2, overflow:"hidden" }}>
    <div style={{ width:`${Math.max(0,pct*100)}%`, height:"100%", background:color, borderRadius:height/2, transition:"width 0.35s ease" }}/>
  </div>;
}

function PartySlot({ poke, dead, compact }) {
  if (!poke) return <div style={{ border:"1.5px dashed #E5E7EB", borderRadius:10, height:compact?52:64, opacity:0.35 }}/>;
  return (
    <div style={{ background:dead?"#111":"#fff", border:`1.5px solid ${dead?"#2a2a2a":"#E8ECF0"}`, borderRadius:10, padding:compact?"7px 10px":"10px 12px", display:"flex", alignItems:"center", gap:8, opacity:dead?0.5:1 }}>
      <Sprite id={poke.id} size={compact?36:48} style={{ filter:dead?"grayscale(1)":poke.legendary?"drop-shadow(0 0 4px gold)":"none" }}/>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:"flex", alignItems:"center", gap:4, marginBottom:2 }}>
          {poke.legendary&&<span style={{fontSize:9}}>⭐</span>}
          <span style={{ fontWeight:700, fontSize:compact?11:13, color:dead?"#666":"#1E2533" }}>{poke.displayName}</span>
          <span style={{ fontSize:10, color:"#9CA3AF" }}>Lv{poke.level}</span>
          {dead&&<span style={{fontSize:10}}>💀</span>}
        </div>
        <div style={{ display:"flex", gap:3, flexWrap:"wrap" }}>{poke.types.map(t=><TypePill key={t} type={t}/>)}</div>
      </div>
    </div>
  );
}

// ─── BATTLE ARENA ─────────────────────────────────────────────────────────────
// FF-style: attacker lunges toward defender then snaps back
function BattleArena({ frames, playerTeam, enemyTeam, badgeInfo, onDone }) {
  const [fi, setFi] = useState(0);
  const [phase, setPhase] = useState("idle"); // idle | lunge | back
  const [done, setDone] = useState(false);
  const timer = useRef();

  useEffect(() => { setFi(0); setPhase("idle"); setDone(false); }, [frames]);

  useEffect(() => {
    if (!frames?.length) return;
    if (fi >= frames.length - 1) {
      if (!done) { setDone(true); onDone?.(); }
      return;
    }
    const frame = frames[fi];
    const isAttack = frame.playerAttacking || frame.enemyAttacking;
    if (isAttack && phase === "idle") {
      setPhase("lunge");
      timer.current = setTimeout(() => { setPhase("back"); timer.current = setTimeout(() => { setPhase("idle"); setFi(i=>i+1); }, 160); }, 180);
    } else {
      timer.current = setTimeout(() => { setPhase("idle"); setFi(i=>i+1); }, 700);
    }
    return () => clearTimeout(timer.current);
  }, [fi, phase, frames, done, onDone]);

  if (!frames?.length) return null;
  const frame = frames[Math.min(fi, frames.length-1)];
  const { playerIdx, enemyIdx, playerHpPcts, enemyHpPcts,
    playerAttacking, enemyAttacking, playerFainted, enemyFainted, isBadgeFrame, message, msgColor } = frame;

  const P = playerTeam[playerIdx];
  const E = enemyTeam[enemyIdx];

  const pLunge = playerAttacking && phase==="lunge";
  const eLunge = enemyAttacking && phase==="lunge";

  // Transform: lunge forward, snap back
  const pTransform = playerFainted ? "translateY(50px) scale(0.5)"
    : pLunge ? "translateX(60px) translateY(-8px) scale(1.1)"
    : phase==="back" && playerAttacking ? "translateX(0) translateY(0) scale(1)"
    : "translateX(0)";
  const eTransform = enemyFainted ? "translateY(50px) scale(0.5)"
    : eLunge ? "translateX(-60px) translateY(-8px) scale(1.1)"
    : phase==="back" && enemyAttacking ? "translateX(0) translateY(0) scale(1)"
    : "translateX(0)";

  const pOpacity = playerFainted ? 0 : 1;
  const eOpacity = enemyFainted ? 0 : 1;

  // On badge/victory frame, hide enemy entirely
  const showEnemy = !isBadgeFrame;

  return (
    <div style={{ background:"linear-gradient(180deg,#0f1923 0%,#1a2d4a 50%,#2d5a20 50%,#1a3a10 100%)", borderRadius:14, padding:"20px 16px 14px", userSelect:"none", position:"relative", overflow:"hidden" }}>
      {/* Sky stars */}
      {[...Array(8)].map((_,i)=><div key={i} style={{ position:"absolute", width:2, height:2, background:"rgba(255,255,255,0.4)", borderRadius:"50%", top:`${5+i*5}%`, left:`${10+i*12}%` }}/>)}

      {/* Enemy row */}
      <div style={{ display:"flex", justifyContent:"flex-end", alignItems:"flex-end", marginBottom:8, gap:12, minHeight:120 }}>
        <div style={{ background:"rgba(0,0,0,0.65)", backdropFilter:"blur(4px)", borderRadius:10, padding:"10px 14px", flex:1, maxWidth:240 }}>
          {showEnemy && E ? <>
            <div style={{ fontSize:13, fontWeight:700, color:"#fff", marginBottom:5 }}>
              {E.legendary&&<span style={{color:"gold",marginRight:4}}>⭐</span>}
              {E.displayName} <span style={{fontSize:11,color:"#9CA3AF"}}>Lv{E.level}</span>
            </div>
            <HpBar pct={enemyHpPcts[enemyIdx]??1} height={10}/>
            <div style={{ fontSize:10, color:"#9CA3AF", marginTop:3 }}>{Math.round((enemyHpPcts[enemyIdx]??1)*100)}%</div>
            <div style={{ display:"flex", gap:4, marginTop:6 }}>
              {enemyTeam.map((_,i)=><div key={i} style={{ width:10, height:10, borderRadius:"50%", background:(enemyHpPcts[i]??1)>0?"#4ADE80":"#EF4444" }}/>)}
            </div>
          </> : isBadgeFrame && badgeInfo ? (
            <div style={{ textAlign:"center", padding:"8px 0" }}>
              <div style={{ fontSize:28, marginBottom:4 }}>🏅</div>
              <div style={{ fontWeight:800, fontSize:14, color:"#FBBF24" }}>{badgeInfo.badge}</div>
              <div style={{ fontSize:11, color:"#9CA3AF", marginTop:2 }}>obtained!</div>
            </div>
          ) : null}
        </div>
        {showEnemy && E && (
          <div style={{ transition:"transform 0.18s cubic-bezier(.4,2,.6,1), opacity 0.35s", transform:eTransform, opacity:eOpacity, flexShrink:0 }}>
            <Sprite id={E.id} size={110}/>
          </div>
        )}
      </div>

      {/* Message bar */}
      <div style={{ background:"rgba(0,0,0,0.8)", borderRadius:8, padding:"8px 14px", marginBottom:12, minHeight:34, display:"flex", alignItems:"center" }}>
        <span style={{ fontSize:13, fontWeight:600, color:msgColor||"#E2E8F0", letterSpacing:"0.02em" }}>{message||"…"}</span>
      </div>

      {/* Player row */}
      <div style={{ display:"flex", alignItems:"flex-end", gap:12, minHeight:120 }}>
        <div style={{ transition:"transform 0.18s cubic-bezier(.4,2,.6,1), opacity 0.35s", transform:pTransform, opacity:pOpacity, flexShrink:0 }}>
          {P && <Sprite id={P.id} back size={110}/>}
        </div>
        <div style={{ background:"rgba(0,0,0,0.65)", backdropFilter:"blur(4px)", borderRadius:10, padding:"10px 14px", flex:1 }}>
          {P && <>
            <div style={{ fontSize:13, fontWeight:700, color:"#fff", marginBottom:5 }}>
              {P.legendary&&<span style={{color:"gold",marginRight:4}}>⭐</span>}
              {P.displayName} <span style={{fontSize:11,color:"#9CA3AF"}}>Lv{P.level}</span>
            </div>
            <HpBar pct={playerHpPcts[playerIdx]??1} height={10}/>
            <div style={{ fontSize:10, color:"#9CA3AF", marginTop:3 }}>{Math.round((playerHpPcts[playerIdx]??1)*100)}%</div>
            <div style={{ display:"flex", gap:4, marginTop:6 }}>
              {playerTeam.map((_,i)=><div key={i} style={{ width:10, height:10, borderRadius:"50%", background:(playerHpPcts[i]??1)>0?"#4ADE80":"#EF4444" }}/>)}
            </div>
          </>}
        </div>
      </div>

      <div style={{ textAlign:"center", marginTop:6, fontSize:10, color:"rgba(255,255,255,0.2)" }}>
        {Math.min(fi+1,frames.length)}/{frames.length}
      </div>
    </div>
  );
}

// ─── GYM LEADER PORTRAIT ─────────────────────────────────────────────────────
function LeaderPortrait({ leaderName, region }) {
  const leaders = REGIONS[region]?.gymLeaders || {};
  const info = leaders[leaderName];
  if (!info) return null;
  // PokéAPI trainer sprites
  const url = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/trainers/${info.npc}.png`;
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [leaderName]);
  if (failed) return null;
  return <img src={url} alt={leaderName} onError={()=>setFailed(true)} style={{ width:96, height:96, imageRendering:"pixelated", objectFit:"contain" }}/>;
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [loadState, setLoadState] = useState("idle");
  const [loadMsg, setLoadMsg] = useState("");
  const [pokedex, setPokedex] = useState({});
  const [evoMap, setEvoMap] = useState({});
  const eeveeKeyRef = useRef({});

  const [screen, setScreen] = useState("setup");
  const [regionKey, setRegionKey] = useState("kanto");
  const [party, setParty] = useState([]);
  const [grave, setGrave] = useState([]);
  const [si, setSi] = useState(0);
  const [bonusLevels, setBonusLevels] = useState(0);
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
  const isGymStage = stage && (stage.type==="gym"||stage.type==="elite4"||stage.type==="champion");

  function log(msg) { setRunLog(prev=>[msg,...prev].slice(0,50)); }

  // ── Load ──
  async function loadAllData(rKey) {
    const reg = REGIONS[rKey];
    setLoadState("loading"); setLoadMsg("Fetching Pokémon data…");
    try {
      const allIds = new Set([...reg.starters,...(REGION_LEGENDARIES[rKey]||[]),...reg.stages.flatMap(s=>[...(s.pool||[]),...(s.team||[]).map(e=>e.id)])]);
      const pd = await preloadPokemon([...allIds]);
      setLoadMsg("Loading evolution chains…");
      const em = await preloadEvoChains(pd);
      const evoTargets = Object.values(em).map(([id])=>id).filter(id=>!pd[id]);
      if (evoTargets.length) {
        const extra = await preloadPokemon(evoTargets);
        Object.assign(pd, extra);
        const em2 = await preloadEvoChains(pd);
        Object.assign(em, em2);
        const evoTargets2 = Object.values(em).map(([id])=>id).filter(id=>!pd[id]);
        if (evoTargets2.length) Object.assign(pd, await preloadPokemon(evoTargets2));
      }
      setLoadMsg("Loading Eevee evolutions…");
      Object.assign(pd, await preloadPokemon(EEVEE_EVOS));
      setPokedex(pd); setEvoMap(em);
      const starterList = reg.starters.map(id=>{
        let cur=id, s=0;
        while(em[cur]&&s++<10){ const[nid,ml]=em[cur]; if(5>=ml) cur=nid; else break; }
        const b=pd[cur]||pd[id];
        return b?{...b,level:5,baseId:id}:null;
      }).filter(Boolean);
      setStarterOpts(starterList);
      setLoadState("ready"); setLoadMsg("");
      return { pd, em };
    } catch(e) {
      setLoadState("error"); setLoadMsg(e.message||"Network error"); return null;
    }
  }

  function getPokemonAtLevel(baseId, level, eeveeKey) {
    if (baseId===133&&level>=28) {
      const key=eeveeKey||`eevee_${baseId}`;
      if (!eeveeKeyRef.current[key]) eeveeKeyRef.current[key]=EEVEE_EVOS[Math.floor(Math.random()*EEVEE_EVOS.length)];
      const evo=pokedex[eeveeKeyRef.current[key]];
      if (evo) return {...evo,level,baseId,eeveeKey:key};
    }
    let id=baseId, s=0;
    while(evoMap[id]&&s++<10){ const[nid,ml]=evoMap[id]; if(level>=ml) id=nid; else break; }
    const base=pokedex[id]||pokedex[baseId];
    return base?{...base,level,baseId}:null;
  }

  function levelUpParty(currentParty, toLevel) {
    return currentParty.map(p=>{
      const ev=getPokemonAtLevel(p.baseId||p.id,toLevel,p.eeveeKey);
      if (!ev) return {...p,level:toLevel};
      if (ev.id!==p.id) log(`✨ ${p.displayName} evolved into ${ev.displayName}!`);
      return {...ev,baseId:p.baseId||p.id,eeveeKey:p.eeveeKey};
    });
  }

  function resetBattle() { setBattleFrames([]); setBattlePlayerTeam([]); setBattleEnemyTeam([]); setBattleDone(null); setBattleAnimDone(false); }

  function enterStage(idx, currentParty, currentBonus=bonusLevels) {
    const s=region.stages[idx];
    if (!s) { setScreen("win"); return; }
    const leveled=levelUpParty(currentParty, s.level+currentBonus);
    setParty(leveled); resetBattle(); setCatchResult(null);
    setEvent(null); setTradeOffer(null); setReleaseFor(null); setSi(idx);
    if (s.type==="route") {
      const evts=runLog.filter(l=>l.startsWith("🎉")).length;
      if (evts<4&&Math.random()<0.30) { setEvent(SPECIAL_EVENTS[Math.floor(Math.random()*SPECIAL_EVENTS.length)]); setSubscreen("event"); }
      else { buildEncounter(s,idx,leveled); setSubscreen("encounter"); }
    } else { setReorderMode(false); setSubscreen("battle"); }
  }

  function buildEncounter(s, stageIdx, currentParty) {
    if (Math.random() > Math.max(0.6, 0.95-(stageIdx/region.stages.length)*0.35)) {
      log("🌿 Nothing in the tall grass…");
      setTimeout(()=>nextStage(currentParty||party), 1200);
      setEncounterOpts([]); setSubscreen("encounter"); return;
    }
    let pool=[...s.pool].sort(()=>Math.random()-0.5).slice(0,3);
    if (s.legendary&&Math.random()<0.12) {
      const legs=REGION_LEGENDARIES[regionKey]||[];
      if (legs.length) pool=[legs[Math.floor(Math.random()*legs.length)],...pool.slice(0,2)];
    }
    const cr=(isLeg,si2)=>isLeg?0.05:Math.max(0.55,0.80-(si2/region.stages.length)*0.25);
    setEncounterOpts(pool.map(id=>{ const p=getPokemonAtLevel(id,s.level); return p?{...p,catchChance:cr(!!p.legendary,stageIdx)}:null; }).filter(Boolean));
  }

  function nextStage(cur) { enterStage(si+1, cur, bonusLevels); }

  function tryAttemptCatch(poke) {
    setCatchResult(Math.random()<poke.catchChance?{status:"success",poke}:{status:"fail",poke});
  }
  function confirmCatch(poke) {
    setCatchResult(null);
    const w={...poke,baseId:poke.baseId||poke.id};
    if (party.length>=6) { setReleaseFor(w); setSubscreen("release"); }
    else { const n=[...party,w]; setParty(n); log(`🎉 ${poke.displayName} joined!`); nextStage(n); }
  }
  function skipEncounter() { log("🏃 Skipped."); nextStage(party); }
  function handleRelease(releaseId) {
    const rel=party.find(p=>p.id===releaseId);
    const n=party.filter(p=>p.id!==releaseId).concat([releaseFor]);
    setParty(n); log(`🔄 Released ${rel?.displayName}. ${releaseFor.displayName} joined!`);
    setReleaseFor(null); nextStage(n);
  }

  function handleEvent(ev) {
    const s=stage;
    if (ev.effect==="bonus") {
      const nb=bonusLevels+ev.value; setBonusLevels(nb);
      const boosted=levelUpParty(party,s.level+nb); setParty(boosted);
      log(`🎉 ${ev.label}: +${ev.value} bonus levels!`);
      setEvent(null); buildEncounter(s,si,boosted); setSubscreen("encounter");
    } else if (ev.effect==="trade") {
      const ids=region.stages.flatMap(x=>x.pool||[]);
      const off=getPokemonAtLevel(ids[Math.floor(Math.random()*ids.length)],s.level);
      if (off) { setTradeOffer(off); setEvent(null); setSubscreen("trade"); }
    } else if (ev.effect==="gift") {
      const ids=region.stages.flatMap(x=>x.pool||[]);
      const gift=getPokemonAtLevel(ids[Math.floor(Math.random()*ids.length)],s.level);
      if (!gift) return;
      log(`🎉 ${ev.label}`);
      const w={...gift,baseId:gift.baseId||gift.id};
      if (party.length<6) { const n=[...party,w]; setParty(n); log(`${gift.displayName} joined!`); setEvent(null); nextStage(n); }
      else { setReleaseFor(w); setEvent(null); setSubscreen("release"); }
    }
  }
  function skipEvent() { setEvent(null); buildEncounter(stage,si,party); setSubscreen("encounter"); }
  function acceptTrade(myId) {
    const mine=party.find(p=>p.id===myId);
    const w={...tradeOffer,baseId:tradeOffer.baseId||tradeOffer.id};
    const n=party.filter(p=>p.id!==myId).concat([w]);
    setParty(n); log(`🔄 Traded ${mine?.displayName} for ${tradeOffer.displayName}!`);
    setTradeOffer(null); nextStage(n);
  }
  function skipTrade() { setTradeOffer(null); buildEncounter(stage,si,party); setSubscreen("encounter"); }

  function startBattle() {
    const s=stage;
    const enemies=s.team.map(e=>{ const p=getPokemonAtLevel(e.id,e.lv); return p?{...p,baseId:e.id}:null; }).filter(Boolean);
    const result=simulateBattle(party,enemies,battleStyle);
    setBattlePlayerTeam([...party]); setBattleEnemyTeam(enemies);
    setBattleFrames(result.frames);
    setBattleDone({ won:result.won, survivedPokemon:result.survivedPokemon, faintedPokemon:result.faintedPokemon });
  }

  function afterBattle() {
    if (!battleDone) return;
    const { won, survivedPokemon, faintedPokemon } = battleDone;
    const stageSnap=region.stages[si];
    setGrave(prev=>[...prev,...faintedPokemon]);
    faintedPokemon.forEach(p=>log(`💀 ${p.displayName} fell permanently.`));
    if (won) {
      if (stageSnap?.badge) log(`🏅 ${stageSnap.badge} obtained! Defeated ${stageSnap.leader}.`);
      else log(`✅ Defeated ${stageSnap?.leader}!`);
      if (survivedPokemon.length===0) { log("💔 No Pokémon left."); setParty([]); setScreen("over"); return; }
      setBonusLevels(0);
      log("💊 Healed at Pokémon Center!");
      const healed=levelUpParty(survivedPokemon, stageSnap.level);
      setParty(healed); enterStage(si+1,healed,0);
    } else {
      log(`❌ Defeated by ${stageSnap?.leader}.`);
      setParty(survivedPokemon); setScreen("over");
    }
  }

  function movePartySlot(from, to) {
    if (from===to) return;
    const n=[...party]; const [m]=n.splice(from,1); n.splice(to,0,m); setParty(n);
  }

  function fullReset() {
    setScreen("setup"); setParty([]); setGrave([]); setRunLog([]); setSi(0);
    setBonusLevels(0); resetBattle(); setCatchResult(null); setSubscreen("main");
    setEvent(null); setTradeOffer(null); setReleaseFor(null); setReorderMode(false);
    setStarterOpts([]); setEncounterOpts([]);
    // Reset load state so user can pick a different region
    setLoadState("idle"); setLoadMsg("");
  }

  // ─── RENDER ──────────────────────────────────────────────────────────────────
  const font = { fontFamily:"'Inter',system-ui,sans-serif" };

  // ── SETUP ──
  if (screen==="setup" && loadState!=="ready") return (
    <div style={{ ...font, minHeight:"100vh", background:"#F8FAFC", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ maxWidth:440, width:"100%", padding:32 }}>
        <div style={{ fontSize:11, fontWeight:700, letterSpacing:"0.15em", color:"#E53935", textTransform:"uppercase", marginBottom:8 }}>Nuzlocke Simulator</div>
        <h1 style={{ fontSize:38, fontWeight:800, color:"#1E2533", margin:"0 0 8px", lineHeight:1.1 }}>Choose your<br/>adventure.</h1>
        <p style={{ color:"#6B7280", fontSize:14, lineHeight:1.6, marginBottom:28 }}>Catch Pokémon, battle gym leaders, survive. If one faints — it's gone forever.</p>
        <div style={{ marginBottom:20 }}>
          <div style={{ fontSize:11, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:10 }}>Region</div>
          <div style={{ display:"flex", gap:10 }}>
            {Object.entries(REGIONS).map(([k,r])=>(
              <button key={k} onClick={()=>setRegionKey(k)} style={{ flex:1, padding:"12px 0", borderRadius:10, border:`2px solid ${regionKey===k?"#E53935":"#E5E7EB"}`, background:regionKey===k?"#FFF5F5":"#fff", fontWeight:700, fontSize:14, color:regionKey===k?"#E53935":"#374151", cursor:"pointer" }}>{r.name}</button>
            ))}
          </div>
        </div>
        {loadState==="error"&&<div style={{ background:"#FEF2F2", border:"1px solid #FCA5A5", borderRadius:10, padding:"12px 16px", marginBottom:16, fontSize:13, color:"#DC2626" }}>⚠️ {loadMsg}</div>}
        <button onClick={()=>{ if(loadState==="idle"||loadState==="error") loadAllData(regionKey); }}
          disabled={loadState==="loading"}
          style={{ width:"100%", padding:"16px 0", background:loadState==="loading"?"#9CA3AF":"#E53935", color:"#fff", border:"none", borderRadius:12, fontWeight:800, fontSize:16, cursor:loadState==="loading"?"not-allowed":"pointer" }}>
          {loadState==="loading"? loadMsg||"Loading…" : "Begin Adventure →"}
        </button>
      </div>
    </div>
  );

  // ── STARTER ──
  if (screen==="setup"||screen==="starter") return (
    <div style={{ ...font, minHeight:"100vh", background:"#F8FAFC", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ maxWidth:520, width:"100%", padding:32 }}>
        <div style={{ fontSize:11, fontWeight:700, letterSpacing:"0.15em", color:"#E53935", textTransform:"uppercase", marginBottom:8 }}>{region.name}</div>
        <h2 style={{ fontSize:28, fontWeight:800, color:"#1E2533", margin:"0 0 6px" }}>Choose your starter.</h2>
        <p style={{ color:"#6B7280", fontSize:13, marginBottom:24 }}>Your first partner. Choose wisely.</p>
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          {starterOpts.map(p=>(
            <button key={p.id} onClick={()=>{
              const poke={...p,baseId:p.id};
              setParty([poke]); setGrave([]); setSi(0); setBonusLevels(0);
              setRunLog([`🌍 Adventure in ${region.name} begins!`,`🎯 You chose ${p.displayName}!`]);
              enterStage(0,[poke],0); setScreen("game");
            }} style={{ background:"#fff", border:"2px solid #E5E7EB", borderRadius:14, padding:"16px 18px", display:"flex", alignItems:"center", gap:16, cursor:"pointer", textAlign:"left" }}>
              <img src={p.artwork||p.sprite} alt={p.displayName} style={{ width:80, height:80, objectFit:"contain" }}/>
              <div>
                <div style={{ fontWeight:800, fontSize:20, color:"#1E2533", marginBottom:4 }}>{p.displayName}</div>
                <div style={{ display:"flex", gap:6, marginBottom:6 }}>{p.types.map(t=><TypePill key={t} type={t}/>)}</div>
                <div style={{ fontSize:12, color:"#9CA3AF" }}>HP {p.hp} · Spd {p.speed} · BST {p.bst}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  // ── OVER / WIN ──
  if (screen==="over"||screen==="win") {
    const won=screen==="win";
    return (
      <div style={{ ...font, minHeight:"100vh", background:won?"#F0FDF4":"#FFF5F5", display:"flex", alignItems:"center", justifyContent:"center" }}>
        <div style={{ maxWidth:520, width:"100%", padding:32 }}>
          <div style={{ fontSize:48, marginBottom:8 }}>{won?"🏆":"💀"}</div>
          <h1 style={{ fontSize:32, fontWeight:800, color:"#1E2533", margin:"0 0 4px" }}>{won?"Champion!":"Run Over."}</h1>
          <p style={{ color:"#6B7280", fontSize:14, marginBottom:24 }}>{won?`You conquered ${region.name}!`:"Your team was wiped out."}</p>
          {party.length>0&&<><div style={{ fontSize:11, fontWeight:700, color:"#6B7280", marginBottom:8, textTransform:"uppercase" }}>Survivors</div><div style={{ display:"flex", flexDirection:"column", gap:6, marginBottom:20 }}>{party.map((p,i)=><PartySlot key={i} poke={p}/>)}</div></>}
          {grave.length>0&&<><div style={{ fontSize:11, fontWeight:700, color:"#9CA3AF", marginBottom:8, textTransform:"uppercase" }}>Fallen</div><div style={{ display:"flex", flexDirection:"column", gap:6, marginBottom:24 }}>{grave.map((p,i)=><PartySlot key={i} poke={p} dead/>)}</div></>}
          <button onClick={fullReset} style={{ padding:"12px 28px", background:"#1E2533", color:"#fff", border:"none", borderRadius:10, fontWeight:700, fontSize:14, cursor:"pointer" }}>← Back to Home</button>
        </div>
      </div>
    );
  }

  // ── GAME ──
  const isMobile = typeof window !== "undefined" && window.innerWidth < 700;

  // Card style helper
  const card = { background:"#fff", border:"1.5px solid #E8ECF0", borderRadius:14, padding:20 };

  const PartyPanel = () => (
    <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
      <div style={{ fontSize:10, fontWeight:700, letterSpacing:"0.15em", color:"#9CA3AF", textTransform:"uppercase", marginBottom:4 }}>Party</div>
      {[0,1,2,3,4,5].map(i=><PartySlot key={i} poke={party[i]||null}/>)}
      {bonusLevels>0&&<div style={{ background:"#FFFBEB", border:"1px solid #FCD34D", borderRadius:8, padding:"6px 10px", fontSize:11, color:"#D97706", fontWeight:700 }}>+{bonusLevels} bonus Lv until gym</div>}
      {grave.length>0&&<>
        <div style={{ fontSize:10, fontWeight:700, color:"#9CA3AF", textTransform:"uppercase", marginTop:8 }}>Fallen</div>
        {grave.map((p,i)=><PartySlot key={i} poke={p} dead/>)}
      </>}
    </div>
  );

  const LogPanel = () => runLog.length>0 ? (
    <div style={{ ...card }}>
      <div style={{ fontSize:10, fontWeight:700, color:"#9CA3AF", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:10 }}>Run Log</div>
      {runLog.map((e,i)=><div key={i} style={{ fontSize:12, color:"#374151", lineHeight:1.7, opacity:Math.max(0.3,1-i*0.07) }}>{e}</div>)}
    </div>
  ) : null;

  const MainContent = () => (<>
    {/* Header */}
    <div style={{ borderBottom:"1px solid #E8ECF0", padding:"14px 0 14px", display:"flex", alignItems:"center", gap:16, background:"#fff", marginBottom:16, borderRadius:14, paddingLeft:20, paddingRight:20 }}>
      <div style={{ flex:1 }}>
        <div style={{ fontSize:10, fontWeight:700, color:"#9CA3AF", letterSpacing:"0.1em", textTransform:"uppercase" }}>{region.name} · Stage {si+1}/{region.stages.length}</div>
        <div style={{ fontSize:22, fontWeight:800, color:"#1E2533", marginTop:1 }}>{stage?.name||"—"}</div>
      </div>
      <div style={{ textAlign:"right" }}>
        <div style={{ fontSize:10, color:"#9CA3AF" }}>Team level</div>
        <div style={{ fontSize:28, fontWeight:800, color:"#E53935" }}>Lv{stage?stage.level+bonusLevels:"—"}</div>
      </div>
    </div>

    {/* ENCOUNTER */}
    {subscreen==="encounter"&&(
      <div style={card}>
        {encounterOpts.length===0
          ? <div style={{ color:"#9CA3AF", fontSize:14 }}>🌿 Nothing appeared…</div>
          : (<>
            <div style={{ fontWeight:800, fontSize:18, color:"#1E2533", marginBottom:4 }}>Wild Pokémon!</div>
            <p style={{ color:"#6B7280", fontSize:13, marginBottom:16 }}>One chance to catch — or skip.</p>
            {catchResult&&(
              <div style={{ background:catchResult.status==="success"?"#F0FDF4":"#FEF2F2", border:`1px solid ${catchResult.status==="success"?"#86EFAC":"#FCA5A5"}`, borderRadius:10, padding:"10px 14px", marginBottom:14, fontSize:13, fontWeight:700, color:catchResult.status==="success"?"#16A34A":"#DC2626" }}>
                {catchResult.status==="success"?`✅ Caught ${catchResult.poke.displayName}!`:`❌ ${catchResult.poke.displayName} broke free!`}
              </div>
            )}
            {!catchResult&&(
              <div style={{ display:"flex", flexDirection:"column", gap:12, marginBottom:14 }}>
                {encounterOpts.map((p,i)=>(
                  <button key={i} onClick={()=>tryAttemptCatch(p)} style={{ background:p.legendary?"#FFFBEB":"#F8FAFC", border:`1.5px solid ${p.legendary?"#FCD34D":"#E5E7EB"}`, borderRadius:12, padding:"14px 16px", display:"flex", alignItems:"center", gap:14, cursor:"pointer", textAlign:"left" }}>
                    <Sprite id={p.id} size={64}/>
                    <div>
                      <div style={{ fontWeight:700, fontSize:16, color:"#1E2533" }}>{p.legendary&&<span style={{color:"goldenrod"}}>⭐ </span>}{p.displayName} <span style={{ color:"#9CA3AF", fontWeight:400, fontSize:13 }}>Lv{p.level}</span></div>
                      <div style={{ display:"flex", gap:4, marginTop:4 }}>{p.types.map(t=><TypePill key={t} type={t}/>)}</div>
                      <div style={{ fontSize:12, color:"#9CA3AF", marginTop:4 }}>HP {p.hp} · Spd {p.speed} · BST {p.bst}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {catchResult?.status==="success"&&<button onClick={()=>confirmCatch(catchResult.poke)} style={{ padding:"10px 20px", background:"#16A34A", color:"#fff", border:"none", borderRadius:8, fontWeight:700, fontSize:13, cursor:"pointer", marginRight:8 }}>Add to Party →</button>}
            {(catchResult?.status==="fail"||!catchResult)&&<button onClick={skipEncounter} style={{ padding:"8px 16px", background:"#F3F4F6", border:"none", borderRadius:8, color:"#6B7280", fontWeight:600, fontSize:13, cursor:"pointer" }}>{catchResult?.status==="fail"?"Continue →":"Skip"}</button>}
          </>)}
      </div>
    )}

    {/* EVENT */}
    {subscreen==="event"&&event&&(
      <div style={{ background:"#FFFBEB", border:"1.5px solid #FCD34D", borderRadius:14, padding:20 }}>
        <div style={{ fontSize:10, fontWeight:700, color:"#D97706", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:6 }}>Special Event</div>
        <div style={{ fontWeight:800, fontSize:20, color:"#1E2533", marginBottom:6 }}>{event.label}</div>
        <p style={{ color:"#6B7280", fontSize:13, marginBottom:16 }}>{event.desc}</p>
        <div style={{ display:"flex", gap:10 }}>
          <button onClick={()=>handleEvent(event)} style={{ padding:"10px 20px", background:"#F59E0B", color:"#fff", border:"none", borderRadius:8, fontWeight:700, fontSize:13, cursor:"pointer" }}>Accept</button>
          <button onClick={skipEvent} style={{ padding:"10px 16px", background:"#F3F4F6", border:"none", borderRadius:8, color:"#6B7280", fontWeight:600, fontSize:13, cursor:"pointer" }}>Skip</button>
        </div>
      </div>
    )}

    {/* TRADE */}
    {subscreen==="trade"&&tradeOffer&&(
      <div style={card}>
        <div style={{ fontWeight:800, fontSize:18, color:"#1E2533", marginBottom:4 }}>🔄 Trade Offer</div>
        <p style={{ color:"#6B7280", fontSize:13, marginBottom:12 }}>A trainer offers their <strong>{tradeOffer.displayName}</strong> (Lv{tradeOffer.level}). Give which?</p>
        <div style={{ background:"#F8FAFC", border:"1.5px solid #E5E7EB", borderRadius:10, padding:"12px 14px", display:"flex", alignItems:"center", gap:12, marginBottom:16 }}>
          <Sprite id={tradeOffer.id} size={56}/>
          <div><div style={{ fontWeight:700, fontSize:15, color:"#1E2533" }}>{tradeOffer.displayName} <span style={{ color:"#9CA3AF", fontSize:12 }}>Lv{tradeOffer.level}</span></div><div style={{ display:"flex", gap:4, marginTop:4 }}>{tradeOffer.types.map(t=><TypePill key={t} type={t}/>)}</div></div>
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:12 }}>
          {party.map((p,i)=>(
            <button key={i} onClick={()=>acceptTrade(p.id)} style={{ background:"#FFF5F5", border:"1.5px solid #FCA5A5", borderRadius:10, padding:"10px 12px", display:"flex", alignItems:"center", gap:10, cursor:"pointer", textAlign:"left" }}>
              <Sprite id={p.id} size={40}/><span style={{ fontWeight:700, fontSize:13, color:"#E53935" }}>Trade {p.displayName}</span>
            </button>
          ))}
        </div>
        <button onClick={skipTrade} style={{ padding:"8px 16px", background:"#F3F4F6", border:"none", borderRadius:8, color:"#6B7280", fontWeight:600, fontSize:13, cursor:"pointer" }}>Decline</button>
      </div>
    )}

    {/* RELEASE */}
    {subscreen==="release"&&releaseFor&&(
      <div style={card}>
        <div style={{ fontWeight:800, fontSize:18, color:"#1E2533", marginBottom:4 }}>Party Full!</div>
        <p style={{ color:"#6B7280", fontSize:13, marginBottom:12 }}>Release one to make room for <strong>{releaseFor.displayName}</strong>.</p>
        <div style={{ background:"#F8FAFC", border:"1.5px solid #E5E7EB", borderRadius:10, padding:"12px 14px", display:"flex", alignItems:"center", gap:12, marginBottom:16 }}>
          <Sprite id={releaseFor.id} size={56}/>
          <div><div style={{ fontWeight:700, fontSize:14, color:"#1E2533" }}>{releaseFor.displayName} <span style={{ color:"#9CA3AF", fontSize:12 }}>Lv{releaseFor.level}</span></div><div style={{ display:"flex", gap:4, marginTop:4 }}>{releaseFor.types.map(t=><TypePill key={t} type={t}/>)}</div></div>
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:12 }}>
          {party.map((p,i)=><button key={i} onClick={()=>handleRelease(p.id)} style={{ background:"#FFF5F5", border:"1.5px solid #FCA5A5", borderRadius:10, padding:"10px 12px", display:"flex", alignItems:"center", gap:10, cursor:"pointer", textAlign:"left" }}><Sprite id={p.id} size={40}/><span style={{ fontWeight:700, fontSize:13, color:"#E53935" }}>Release {p.displayName}</span></button>)}
        </div>
        <button onClick={()=>{ setReleaseFor(null); nextStage(party); }} style={{ padding:"8px 16px", background:"#F3F4F6", border:"none", borderRadius:8, color:"#6B7280", fontWeight:600, fontSize:13, cursor:"pointer" }}>Skip</button>
      </div>
    )}

    {/* BATTLE */}
    {subscreen==="battle"&&stage&&(
      <div style={card}>
        <div style={{ fontSize:10, fontWeight:700, color:"#E53935", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:4 }}>
          {stage.type==="champion"?"Champion":stage.type==="elite4"?"Elite Four":"Gym Battle"}
        </div>

        {/* Leader portrait + name */}
        <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:16 }}>
          <LeaderPortrait leaderName={stage.leader} region={regionKey}/>
          <div>
            <div style={{ fontWeight:800, fontSize:24, color:"#1E2533" }}>{stage.leader}</div>
            {stage.badge&&<div style={{ fontSize:13, color:"#9CA3AF" }}>· {stage.badge}</div>}
          </div>
        </div>

        {!battleFrames.length&&(<>
          {/* Enemy team preview */}
          <div style={{ fontSize:11, fontWeight:600, color:"#9CA3AF", marginBottom:10 }}>Enemy team</div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:10, marginBottom:20 }}>
            {stage.team.map((e,i)=>{
              const p=getPokemonAtLevel(e.id,e.lv);
              return <div key={i} style={{ background:"#F8FAFC", border:"1.5px solid #E5E7EB", borderRadius:10, padding:"8px 12px", display:"flex", alignItems:"center", gap:8 }}>
                <Sprite id={e.id} size={48}/>
                <div><div style={{ fontSize:13, fontWeight:700, color:"#1E2533" }}>{p?.displayName||`#${e.id}`}</div><div style={{ fontSize:11, color:"#9CA3AF" }}>Lv{e.lv}</div></div>
              </div>;
            })}
          </div>

          {/* Battle style */}
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:11, fontWeight:600, color:"#9CA3AF", marginBottom:8 }}>Switch style</div>
            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              {[
                {key:"allout",    label:"All Out",           desc:"Never switch."},
                {key:"between",   label:"Between Fights",    desc:"Switch if <30% HP after beating a foe."},
                {key:"weakswitch",label:"Switch When Weak",  desc:"Also mid-fight at <20% — incoming takes free hit."},
              ].map(({key,label,desc})=>(
                <button key={key} onClick={()=>setBattleStyle(key)} style={{ textAlign:"left", padding:"9px 12px", borderRadius:8, border:`1.5px solid ${battleStyle===key?"#E53935":"#E5E7EB"}`, background:battleStyle===key?"#FFF5F5":"#F8FAFC", cursor:"pointer" }}>
                  <span style={{ fontWeight:700, fontSize:13, color:battleStyle===key?"#E53935":"#1E2533" }}>{label}</span>
                  <span style={{ fontSize:11, color:"#9CA3AF", marginLeft:8 }}>{desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Party reorder */}
          <div style={{ marginBottom:20 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
              <div style={{ fontSize:11, fontWeight:600, color:"#9CA3AF" }}>Party order</div>
              <button onClick={()=>setReorderMode(r=>!r)} style={{ fontSize:10, padding:"3px 8px", background:reorderMode?"#E53935":"#F3F4F6", color:reorderMode?"#fff":"#6B7280", border:"none", borderRadius:6, fontWeight:700, cursor:"pointer" }}>{reorderMode?"Done":"Reorder ↕"}</button>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              {party.map((p,i)=>(
                <div key={p.id} draggable={reorderMode} onDragStart={()=>setDragIdx(i)} onDragOver={e=>e.preventDefault()} onDrop={()=>{ movePartySlot(dragIdx,i); setDragIdx(null); }}
                  style={{ background:dragIdx===i?"#FFF5F5":"#F8FAFC", border:`1.5px solid ${dragIdx===i?"#E53935":"#E5E7EB"}`, borderRadius:10, padding:"10px 14px", display:"flex", alignItems:"center", gap:10, cursor:reorderMode?"grab":"default" }}>
                  {reorderMode&&<span style={{ fontSize:14, color:"#9CA3AF" }}>☰</span>}
                  <span style={{ fontSize:11, fontWeight:700, color:"#9CA3AF", minWidth:16 }}>{i+1}</span>
                  <Sprite id={p.id} size={40}/>
                  <div style={{ flex:1 }}><span style={{ fontWeight:700, fontSize:13, color:"#1E2533" }}>{p.displayName}</span><span style={{ fontSize:11, color:"#9CA3AF", marginLeft:6 }}>Lv{p.level}</span></div>
                  <div style={{ display:"flex", gap:3 }}>{p.types.map(t=><TypePill key={t} type={t}/>)}</div>
                  {reorderMode&&i>0&&<button onClick={()=>movePartySlot(i,i-1)} style={{ padding:"2px 7px", background:"#F3F4F6", border:"none", borderRadius:4, cursor:"pointer", fontSize:12 }}>↑</button>}
                  {reorderMode&&i<party.length-1&&<button onClick={()=>movePartySlot(i,i+1)} style={{ padding:"2px 7px", background:"#F3F4F6", border:"none", borderRadius:4, cursor:"pointer", fontSize:12 }}>↓</button>}
                </div>
              ))}
            </div>
          </div>

          <button onClick={()=>{ setReorderMode(false); startBattle(); }} style={{ padding:"14px 28px", background:"#E53935", color:"#fff", border:"none", borderRadius:10, fontWeight:800, fontSize:15, cursor:"pointer" }}>⚔️ Fight!</button>
        </>)}

        {battleFrames.length>0&&(<>
          <BattleArena
            frames={battleFrames}
            playerTeam={battlePlayerTeam}
            enemyTeam={battleEnemyTeam}
            badgeInfo={stage.badge?{badge:stage.badge}:null}
            onDone={()=>setBattleAnimDone(true)}
          />
          {battleDone&&battleAnimDone&&(
            <div style={{ marginTop:16 }}>
              <div style={{ fontWeight:800, fontSize:22, color:battleDone.won?"#16A34A":"#E53935", marginBottom:12 }}>
                {battleDone.won?"🎉 Victory!":"💀 Defeated."}
              </div>
              <button onClick={afterBattle} style={{ padding:"13px 28px", background:battleDone.won?"#16A34A":"#E53935", color:"#fff", border:"none", borderRadius:10, fontWeight:700, fontSize:14, cursor:"pointer" }}>
                {battleDone.won?"Continue →":"See Results"}
              </button>
            </div>
          )}
        </>)}
      </div>
    )}
  </>);

  // Desktop layout: left 30% party, right 70% main
  // Mobile layout: main top, party middle, log bottom
  return (
    <div style={{ ...font, minHeight:"100vh", background:"#F0F2F5" }}>
      <style>{`
        @media (min-width:700px) {
          .game-layout { display:flex; min-height:100vh; }
          .party-col { width:30%; min-width:220px; max-width:320px; background:#fff; border-right:1px solid #E8ECF0; padding:20px 16px; overflow-y:auto; }
          .main-col { flex:1; padding:20px 24px; overflow-y:auto; }
          .log-inline { display:none; }
          .log-sidebar { display:block; margin-top:16px; }
        }
        @media (max-width:699px) {
          .game-layout { display:flex; flex-direction:column; }
          .party-col { width:100%; background:#fff; border-bottom:1px solid #E8ECF0; padding:16px; }
          .main-col { width:100%; padding:16px; }
          .log-inline { display:block; margin-top:12px; }
          .log-sidebar { display:none; }
        }
      `}</style>
      <div className="game-layout">
        {/* Desktop: party on left */}
        <div className="party-col">
          <PartyPanel/>
          <div className="log-sidebar"><LogPanel/></div>
        </div>
        {/* Main content */}
        <div className="main-col">
          <MainContent/>
          <div className="log-inline" style={{ marginTop:16 }}><LogPanel/></div>
        </div>
      </div>
    </div>
  );
}
