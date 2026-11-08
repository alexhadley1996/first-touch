import { FORMATIONS, FORMATION_IDS, teamChemistry, applyChem, posFit } from "./formations.js";
import { ROSTER, CLUBS, clubById, DIVISIONS, USER_KIT, releaseValue } from "./roster.js";
import { makeRng } from "./rng.js";

export function templateById(id) {
  return ROSTER.find((p) => p.id === id);
}

export function chemistryFor(ids, formationId, resolve) {
  const players = ids.map((id) => resolve(id));
  return teamChemistry(players, formationId);
}

export function averageOvr(players) {
  if (!players.length) return 0;
  return Math.round(players.reduce((s, p) => s + p.ovr, 0) / players.length);
}

function sortPool(list, strength) {
  const copy = list.slice();
  if (strength >= 0.66) copy.sort((a, b) => b.ovr - a.ovr || a.id.localeCompare(b.id));
  else if (strength <= 0.34) copy.sort((a, b) => a.ovr - b.ovr || a.id.localeCompare(b.id));
  else copy.sort((a, b) => b.ovr - a.ovr || a.id.localeCompare(b.id));
  return copy;
}

export function chooseXI(clubPlayers, formationId, strength = 1) {
  const formation = FORMATIONS[formationId];
  const used = new Set();
  const xi = [];
  for (const slot of formation.slots) {
    const ranked = sortPool(
      clubPlayers.filter((p) => !used.has(p.id)),
      strength
    );
    let pool = ranked.filter((p) => posFit(p.pos, slot.pos) >= 0.8);
    if (!pool.length) pool = ranked.filter((p) => posFit(p.pos, slot.pos) >= 0.55);
    if (!pool.length) pool = ranked;
    let pick = pool[0];
    if (strength > 0.34 && strength < 0.66 && pool.length > 2) pick = pool[1];
    used.add(pick.id);
    xi.push(pick);
  }
  return xi;
}

export function clubPool(clubId) {
  return ROSTER.filter((p) => p.clubId === clubId);
}

export function rateXI(xi) {
  return averageOvr(xi);
}

export function pickOpponent(division, seed, avoidClubId) {
  const target = DIVISIONS[division].opp;
  const rng = makeRng(seed);
  let best = null;
  let bestGap = 1e9;
  const options = [];
  for (const club of CLUBS) {
    if (club.id === avoidClubId) continue;
    const pool = clubPool(club.id);
    const formation = styleFormation(club.style);
    for (const strength of [0.2, 0.5, 0.85, 1]) {
      const xi = chooseXI(pool, formation, strength);
      const ovr = rateXI(xi);
      const gap = Math.abs(ovr - target) + rng() * 1.4;
      options.push({ club, formation, strength, xi, ovr, gap });
      if (gap < bestGap) {
        bestGap = gap;
        best = options[options.length - 1];
      }
    }
  }
  return best;
}

export function styleFormation(style) {
  if (style === "technical") return "433";
  if (style === "press") return "4231";
  if (style === "counter") return "352";
  return "442";
}

export function toMatchPlayer(card, chem) {
  const stats = applyChem(card.stats, chem ?? 8);
  return {
    id: card.uid || card.id,
    name: card.name,
    last: card.last || card.name.split(" ").slice(-1)[0],
    pos: card.pos,
    num: card.number,
    ovr: card.ovr,
    stats,
  };
}

export function sideFromXI(xi, formationId, chemList, kit, meta) {
  return {
    name: meta.name,
    abbr: meta.abbr,
    style: meta.style || "direct",
    formation: formationId,
    shirt: kit.shirt,
    shirt2: kit.shirt2 || kit.away || kit.shirt,
    shorts: kit.shorts || "#f4f1ea",
    number: kit.number || "#f7f4ee",
    gk: kit.gk || "#d6e04a",
    gkNum: kit.gkNum || "#1a1a1a",
    players: xi.map((p, i) => toMatchPlayer(p, chemList ? chemList[i] : 8)),
  };
}

export function opponentSide(opp) {
  const chem = teamChemistry(opp.xi, opp.formation);
  const club = opp.club;
  const homeTooClose = colorDist(club.home, USER_KIT.shirt) < 78;
  const shirt = homeTooClose ? club.away : club.home;
  const shirt2 = homeTooClose ? club.home : club.away;
  const dark = hexLuma(shirt) < 140;
  return sideFromXI(opp.xi, opp.formation, chem.players, {
    shirt,
    shirt2,
    shorts: dark ? "#f3efe4" : "#1c2430",
    number: dark ? "#f7f4ee" : "#1a1a1a",
    gk: "#d6e04a",
    gkNum: "#14200a",
  }, {
    name: club.name,
    abbr: club.abbr,
    style: club.style,
  });
}

export function userSide(cards, formationId, chemList, clubName) {
  const abbr = clubName.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase() || "NOR";
  return sideFromXI(cards, formationId, chemList, {
    shirt: USER_KIT.shirt,
    shirt2: USER_KIT.shirt2,
    shorts: USER_KIT.shorts,
    number: USER_KIT.number,
    gk: USER_KIT.gk,
    gkNum: USER_KIT.gkNum,
  }, { name: clubName, abbr, style: "technical" });
}

function colorDist(a, b) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const dr = ((pa >> 16) & 255) - ((pb >> 16) & 255);
  const dg = ((pa >> 8) & 255) - ((pb >> 8) & 255);
  const db = (pa & 255) - (pb & 255);
  return Math.hypot(dr, dg, db);
}

function hexLuma(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function take(pool, pos, n, used) {
  const list = pool
    .filter((p) => p.pos === pos && !used.has(p.id))
    .sort((a, b) => b.ovr - a.ovr || a.id.localeCompare(b.id));
  const out = list.slice(0, n);
  out.forEach((p) => used.add(p.id));
  return out;
}

/** A mixed starting club: a league spine, plus outsiders so links are unfinished. */
export function createStarter() {
  const used = new Set();
  const north = clubPool("northwick");
  const king = clubPool("kingsmere");
  const gk = take(north, "GK", 1, used)[0];
  const cbs = take(north, "CB", 2, used);
  const cmN = take(north, "CM", 1, used)[0];
  const st = take(north, "ST", 1, used)[0];
  const lb = take(king, "LB", 1, used)[0];
  const rb = take(king, "RB", 1, used)[0];
  const cmK = take(king, "CM", 1, used)[0];
  const wings = ROSTER.filter((p) => (p.pos === "LW" || p.pos === "RW") && p.ovr <= 76 && p.ovr >= 68 && !used.has(p.id));
  const lw = wings.find((p) => p.pos === "LW");
  const rw = wings.find((p) => p.pos === "RW" && p.nation !== lw?.nation);
  if (lw) used.add(lw.id);
  if (rw) used.add(rw.id);
  const extraCm = ROSTER.filter((p) => p.pos === "CM" && p.ovr >= 70 && p.ovr <= 76 && !used.has(p.id) && p.leagueId !== "alder").sort((a, b) => a.ovr - b.ovr)[0];
  if (extraCm) used.add(extraCm.id);
  const xiIds = [gk, lb, cbs[0], cbs[1], rb, extraCm || cmK, cmN, cmK, lw, st, rw].map((p) => p.id);

  const benchPool = ROSTER.filter((p) => !used.has(p.id) && p.ovr <= 76 && p.ovr >= 66);
  const bench = [];
  const want = ["GK", "CB", "CDM", "CAM", "ST", "LW", "CM"];
  for (const pos of want) {
    const p = benchPool.find((q) => q.pos === pos && !bench.includes(q.id) && !used.has(q.id));
    if (p) {
      bench.push(p.id);
      used.add(p.id);
    }
  }
  const owned = [];
  let n = 1;
  for (const id of xiIds) owned.push({ uid: `s${n++}`, tid: id, isNew: false });
  for (const id of bench) owned.push({ uid: `s${n++}`, tid: id, isNew: false });
  const byTid = Object.fromEntries(owned.map((o) => [o.tid, o.uid]));
  return {
    owned,
    xi: xiIds.map((id) => byTid[id]),
    bench: bench.map((id) => byTid[id]),
    formation: "433",
  };
}

export function difficultyFor(division) {
  const table = {
    6: { mistake: 0.24, press: 0.8, shoot: 0.86, pass: 0.8 },
    5: { mistake: 0.18, press: 0.9, shoot: 0.92, pass: 0.86 },
    4: { mistake: 0.14, press: 0.98, shoot: 0.98, pass: 0.9 },
    3: { mistake: 0.1, press: 1.05, shoot: 1.02, pass: 0.95 },
    2: { mistake: 0.07, press: 1.12, shoot: 1.08, pass: 1 },
    1: { mistake: 0.045, press: 1.2, shoot: 1.14, pass: 1.04 },
  };
  return table[division] || table[4];
}

export function userMateDiff() {
  return { mistake: 0.16, press: 0.92, shoot: 0.9, pass: 0.88 };
}

export { FORMATION_IDS, releaseValue, clubById };
