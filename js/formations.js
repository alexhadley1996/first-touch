/** Formations, links, and chemistry. Original link rules — not a licensed mode. */

const NORM = {
  LWB: "LB",
  RWB: "RB",
  LS: "ST",
  RS: "ST",
  LCB: "CB",
  RCB: "CB",
  LCDM: "CDM",
  RCDM: "CDM",
  LAM: "LW",
  RAM: "RW",
  CF: "ST",
  LM: "LW",
  RM: "RW",
};

const FAMILIES = {
  GK: ["GK"],
  CB: ["CB", "CDM"],
  LB: ["LB", "LW", "CDM"],
  RB: ["RB", "RW", "CDM"],
  CDM: ["CDM", "CM", "CB"],
  CM: ["CM", "CDM", "CAM"],
  CAM: ["CAM", "CM", "ST", "LW", "RW"],
  LW: ["LW", "CAM", "ST", "LB"],
  RW: ["RW", "CAM", "ST", "RB"],
  ST: ["ST", "CAM", "LW", "RW"],
};

function basePos(pos) {
  return NORM[pos] || pos;
}

export function posFit(natural, slotPos) {
  const n = basePos(natural);
  const s = basePos(slotPos);
  if (n === s) return 1;
  const fam = FAMILIES[s] || [s];
  if (fam.includes(n)) return 0.8;
  const line = (p) => {
    if (p === "GK") return "g";
    if (p === "CB" || p === "LB" || p === "RB") return "d";
    if (p === "CDM" || p === "CM" || p === "CAM") return "m";
    return "a";
  };
  if (line(n) === line(s)) return 0.55;
  return 0.36;
}

/** 0–3. Club is the strong link; nation and league are lighter. */
export function linkStrength(a, b) {
  if (!a || !b) return 0;
  const club = a.clubId === b.clubId;
  const nation = a.nation === b.nation;
  const league = a.leagueId === b.leagueId;
  if (club && nation) return 3;
  if (club || (nation && league)) return 2;
  if (nation || league) return 1;
  return 0;
}

export function linkColor(strength) {
  if (strength >= 3) return "#3ddc97";
  if (strength === 2) return "#e2b657";
  if (strength === 1) return "#d7a07a";
  return "#e25b5b";
}

/**
 * Individual chemistry 0–10.
 * Position fit and the average strength of neighbouring links.
 */
export function playerChem(player, slotPos, neighbors) {
  const fit = posFit(player.pos, slotPos);
  const links = neighbors.filter(Boolean);
  const avg = links.length
    ? links.reduce((s, n) => s + linkStrength(player, n), 0) / links.length / 3
    : 0.15;
  const chem = 10 * (0.4 * fit + 0.6 * avg);
  return Math.max(0, Math.min(10, Math.round(chem)));
}

export function chemMultiplier(chem) {
  return 0.92 + 0.12 * (chem / 10);
}

export function teamChemistry(players, formationId) {
  const f = FORMATIONS[formationId];
  const individuals = f.slots.map((slot, i) => {
    const neighbors = f.links
      .filter(([a, b]) => a === i || b === i)
      .map(([a, b]) => players[a === i ? b : a])
      .filter(Boolean);
    return playerChem(players[i], slot.pos, neighbors);
  });
  const avg = individuals.reduce((s, n) => s + n, 0) / individuals.length;
  return {
    team: Math.round(avg * 10),
    players: individuals,
  };
}

export function slotNeighbors(formationId, index) {
  const f = FORMATIONS[formationId];
  return f.links
    .filter(([a, b]) => a === index || b === index)
    .map(([a, b]) => (a === index ? b : a));
}

function slot(label, pos, sx, sy, line) {
  return { label, pos, sx, sy, line };
}

export const FORMATIONS = {
  "433": {
    id: "433",
    name: "4-3-3",
    slots: [
      slot("GK", "GK", 0.07, 0.5, "gk"),
      slot("LB", "LB", 0.24, 0.13, "def"),
      slot("CB", "CB", 0.2, 0.37, "def"),
      slot("CB", "CB", 0.2, 0.63, "def"),
      slot("RB", "RB", 0.24, 0.87, "def"),
      slot("CM", "CM", 0.46, 0.28, "mid"),
      slot("CM", "CM", 0.42, 0.5, "mid"),
      slot("CM", "CM", 0.46, 0.72, "mid"),
      slot("LW", "LW", 0.72, 0.15, "att"),
      slot("ST", "ST", 0.76, 0.5, "att"),
      slot("RW", "RW", 0.72, 0.85, "att"),
    ],
    links: [
      [0, 1], [0, 2], [0, 3], [0, 4],
      [1, 2], [1, 5], [1, 8],
      [2, 3], [2, 6],
      [3, 4], [3, 6],
      [4, 7], [4, 10],
      [5, 6], [5, 8], [5, 9],
      [6, 7], [6, 9],
      [7, 9], [7, 10],
      [8, 9], [9, 10],
    ],
  },
  "442": {
    id: "442",
    name: "4-4-2",
    slots: [
      slot("GK", "GK", 0.07, 0.5, "gk"),
      slot("LB", "LB", 0.24, 0.13, "def"),
      slot("CB", "CB", 0.19, 0.37, "def"),
      slot("CB", "CB", 0.19, 0.63, "def"),
      slot("RB", "RB", 0.24, 0.87, "def"),
      slot("LM", "LW", 0.5, 0.12, "mid"),
      slot("CM", "CM", 0.46, 0.38, "mid"),
      slot("CM", "CM", 0.46, 0.62, "mid"),
      slot("RM", "RW", 0.5, 0.88, "mid"),
      slot("ST", "ST", 0.74, 0.38, "att"),
      slot("ST", "ST", 0.74, 0.62, "att"),
    ],
    links: [
      [0, 1], [0, 2], [0, 3], [0, 4],
      [1, 2], [1, 5], [1, 6],
      [2, 3], [2, 6],
      [3, 4], [3, 7],
      [4, 7], [4, 8],
      [5, 6], [5, 9],
      [6, 7], [6, 9], [6, 10],
      [7, 8], [7, 10],
      [8, 10],
      [9, 10],
    ],
  },
  "4231": {
    id: "4231",
    name: "4-2-3-1",
    slots: [
      slot("GK", "GK", 0.07, 0.5, "gk"),
      slot("LB", "LB", 0.23, 0.13, "def"),
      slot("CB", "CB", 0.19, 0.37, "def"),
      slot("CB", "CB", 0.19, 0.63, "def"),
      slot("RB", "RB", 0.23, 0.87, "def"),
      slot("CDM", "CDM", 0.38, 0.38, "mid"),
      slot("CDM", "CDM", 0.38, 0.62, "mid"),
      slot("LW", "LW", 0.58, 0.16, "att"),
      slot("CAM", "CAM", 0.58, 0.5, "mid"),
      slot("RW", "RW", 0.58, 0.84, "att"),
      slot("ST", "ST", 0.76, 0.5, "att"),
    ],
    links: [
      [0, 1], [0, 2], [0, 3], [0, 4],
      [1, 2], [1, 5], [1, 7],
      [2, 3], [2, 5], [2, 6],
      [3, 4], [3, 6],
      [4, 6], [4, 9],
      [5, 6], [5, 7], [5, 8],
      [6, 8], [6, 9],
      [7, 8], [7, 10],
      [8, 9], [8, 10],
      [9, 10],
    ],
  },
  "352": {
    id: "352",
    name: "3-5-2",
    slots: [
      slot("GK", "GK", 0.07, 0.5, "gk"),
      slot("CB", "CB", 0.22, 0.28, "def"),
      slot("CB", "CB", 0.18, 0.5, "def"),
      slot("CB", "CB", 0.22, 0.72, "def"),
      slot("LWB", "LB", 0.46, 0.1, "def"),
      slot("RWB", "RB", 0.46, 0.9, "def"),
      slot("CM", "CM", 0.48, 0.36, "mid"),
      slot("CM", "CM", 0.48, 0.64, "mid"),
      slot("CAM", "CAM", 0.62, 0.5, "mid"),
      slot("ST", "ST", 0.76, 0.38, "att"),
      slot("ST", "ST", 0.76, 0.62, "att"),
    ],
    links: [
      [0, 1], [0, 2], [0, 3],
      [1, 2], [1, 4], [1, 6],
      [2, 3], [2, 6], [2, 7],
      [3, 5], [3, 7],
      [4, 6], [4, 8], [4, 9],
      [5, 7], [5, 8], [5, 10],
      [6, 7], [6, 8], [6, 9],
      [7, 8], [7, 10],
      [8, 9], [8, 10],
      [9, 10],
    ],
  },
};

export const FORMATION_IDS = ["433", "442", "4231", "352"];

const WEIGHTS = {
  GK: { def: 0.42, phy: 0.22, pas: 0.14, pac: 0.1, dri: 0.08, sho: 0.04 },
  CB: { def: 0.4, phy: 0.24, pac: 0.16, pas: 0.1, dri: 0.06, sho: 0.04 },
  LB: { pac: 0.26, def: 0.26, pas: 0.16, dri: 0.16, phy: 0.12, sho: 0.04 },
  RB: { pac: 0.26, def: 0.26, pas: 0.16, dri: 0.16, phy: 0.12, sho: 0.04 },
  CDM: { def: 0.28, pas: 0.24, phy: 0.18, dri: 0.14, pac: 0.12, sho: 0.04 },
  CM: { pas: 0.28, dri: 0.2, def: 0.16, pac: 0.14, phy: 0.12, sho: 0.1 },
  CAM: { pas: 0.26, dri: 0.24, sho: 0.22, pac: 0.16, phy: 0.08, def: 0.04 },
  LW: { pac: 0.26, dri: 0.24, sho: 0.2, pas: 0.18, phy: 0.08, def: 0.04 },
  RW: { pac: 0.26, dri: 0.24, sho: 0.2, pas: 0.18, phy: 0.08, def: 0.04 },
  ST: { sho: 0.36, pac: 0.22, dri: 0.18, phy: 0.14, pas: 0.08, def: 0.02 },
};

export function overallOf(stats, pos) {
  const w = WEIGHTS[basePos(pos)] || WEIGHTS.CM;
  let o = 0;
  for (const k of Object.keys(w)) o += stats[k] * w[k];
  return Math.round(o);
}

export function applyChem(stats, chem) {
  const m = chemMultiplier(chem);
  const out = {};
  for (const k of ["pac", "sho", "pas", "dri", "def", "phy"]) {
    out[k] = Math.max(40, Math.min(99, Math.round(stats[k] * m)));
  }
  return out;
}

export function lineOf(pos) {
  const p = basePos(pos);
  if (p === "GK") return "gk";
  if (p === "CB" || p === "LB" || p === "RB") return "def";
  if (p === "CDM" || p === "CM" || p === "CAM") return "mid";
  return "att";
}
