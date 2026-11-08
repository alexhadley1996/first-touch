import { createStarter, chemistryFor, pickOpponent, templateById } from "./squads.js";
import { FORMATIONS, posFit } from "./formations.js";
import { DIVISIONS, PACKS, ROSTER, releaseValue } from "./roster.js";
import { makeRng } from "./rng.js";

const KEY = "first-touch-career-v1";
const memory = new Map();

function bucket() {
  try {
    if (typeof localStorage !== "undefined" && localStorage) return localStorage;
  } catch {
    /* private mode */
  }
  return {
    getItem: (k) => (memory.has(k) ? memory.get(k) : null),
    setItem: (k, v) => memory.set(k, v),
    removeItem: (k) => memory.delete(k),
  };
}

export function loadCareer() {
  const raw = bucket().getItem(KEY);
  if (!raw) return freshCareer();
  try {
    const data = JSON.parse(raw);
    if (!data || data.v !== 1 || !Array.isArray(data.xi) || data.xi.length !== 11) return freshCareer();
    return data;
  } catch {
    return freshCareer();
  }
}

export function saveCareer(state) {
  bucket().setItem(KEY, JSON.stringify(state));
}

export function freshCareer() {
  const starter = createStarter();
  const state = {
    v: 1,
    clubName: "North Pier",
    coins: 600,
    owned: starter.owned,
    xi: starter.xi,
    bench: starter.bench,
    formation: starter.formation,
    division: 6,
    points: 0,
    lossStreak: 0,
    season: { played: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 },
    history: [],
    settings: { sound: true, vibrate: true },
    seenHelp: false,
    next: { seed: 4100, avoid: null },
    uidSeq: 40,
  };
  saveCareer(state);
  return state;
}

export function resetCareer() {
  bucket().removeItem(KEY);
  return freshCareer();
}

export function cardByUid(state, uid) {
  const row = state.owned.find((o) => o.uid === uid);
  if (!row) return null;
  const tpl = templateById(row.tid);
  if (!tpl) return null;
  return { ...tpl, uid: row.uid, isNew: !!row.isNew };
}

export function lineup(state) {
  return state.xi.map((uid) => cardByUid(state, uid)).filter(Boolean);
}

export function benchCards(state) {
  return state.bench.map((uid) => cardByUid(state, uid)).filter(Boolean);
}

export function squadChemistry(state) {
  const cards = lineup(state);
  if (cards.length !== 11) return { team: 0, players: [] };
  return chemistryFor(state.xi, state.formation, (uid) => cardByUid(state, uid));
}

export function xiOverall(state) {
  const cards = lineup(state);
  if (!cards.length) return 0;
  return Math.round(cards.reduce((s, p) => s + p.ovr, 0) / cards.length);
}

export function ensureOpponent(state) {
  if (!state.next) state.next = { seed: 4100 + state.season.played, avoid: null };
  return pickOpponent(state.division, state.next.seed, state.next.avoid);
}

export function renameClub(state, name) {
  const clean = String(name || "").replace(/\s+/g, " ").trim().slice(0, 18);
  if (clean.length < 2) return false;
  state.clubName = clean;
  saveCareer(state);
  return true;
}

export function setFormation(state, id) {
  if (!FORMATIONS[id] || id === state.formation) return;
  const pool = [...state.xi, ...state.bench].map((uid) => cardByUid(state, uid)).filter(Boolean);
  const used = new Set();
  const xi = [];
  for (const slot of FORMATIONS[id].slots) {
    let best = null;
    let bestScore = -1;
    for (const card of pool) {
      if (used.has(card.uid)) continue;
      const score = posFit(card.pos, slot.pos) * 10 + card.ovr / 100;
      if (score > bestScore) {
        bestScore = score;
        best = card;
      }
    }
    if (!best) return;
    used.add(best.uid);
    xi.push(best.uid);
  }
  state.formation = id;
  state.xi = xi;
  state.bench = pool.filter((c) => !used.has(c.uid)).map((c) => c.uid);
  saveCareer(state);
}

export function swapPlayers(state, a, b) {
  if (!a || !b || a === b) return;
  const ia = state.xi.indexOf(a);
  const ib = state.xi.indexOf(b);
  const ba = state.bench.indexOf(a);
  const bb = state.bench.indexOf(b);
  if (ia >= 0 && ib >= 0) {
    state.xi[ia] = b;
    state.xi[ib] = a;
  } else if (ia >= 0 && bb >= 0) {
    state.xi[ia] = b;
    state.bench[bb] = a;
  } else if (ba >= 0 && ib >= 0) {
    state.xi[ib] = a;
    state.bench[ba] = b;
  } else return;
  saveCareer(state);
}

export function markSeen(state, uid) {
  const row = state.owned.find((o) => o.uid === uid);
  if (row && row.isNew) {
    row.isNew = false;
    saveCareer(state);
  }
}

export function canRelease(state, uid) {
  if (state.xi.includes(uid)) return "Take them out of the XI first.";
  if (state.owned.length <= 16) return "Keep at least 16 players in the club.";
  const card = cardByUid(state, uid);
  if (!card) return "That card is gone.";
  const gks = state.owned.filter((o) => o.uid !== uid && templateById(o.tid)?.pos === "GK");
  if (card.pos === "GK" && gks.length < 1) return "You need a goalkeeper.";
  return "";
}

export function releaseCard(state, uid) {
  const reason = canRelease(state, uid);
  if (reason) return { error: reason };
  const card = cardByUid(state, uid);
  const value = releaseValue(card);
  state.owned = state.owned.filter((o) => o.uid !== uid);
  state.bench = state.bench.filter((id) => id !== uid);
  state.coins += value;
  saveCareer(state);
  return { value, name: card.name };
}

export function openPack(state, packId) {
  const pack = PACKS[packId];
  if (!pack) return { error: "Unknown pack." };
  if (state.coins < pack.cost) return { error: `You need ${pack.cost - state.coins} more coins.` };
  state.coins -= pack.cost;
  const rng = makeRng((Date.now() ^ (state.uidSeq * 131)) >>> 0);
  const pulls = [];
  for (let i = 0; i < pack.count; i++) {
    const tier = rollTier(pack.weights, rng);
    let pool = ROSTER.filter((p) => p.tier === tier);
    if (!pool.length) pool = ROSTER.filter((p) => p.tier === "silver");
    const tpl = pool[Math.floor(rng() * pool.length)];
    const uid = `c${state.uidSeq++}`;
    state.owned.push({ uid, tid: tpl.id, isNew: true });
    state.bench.push(uid);
    pulls.push(uid);
  }
  saveCareer(state);
  return { pulls };
}

function rollTier(weights, rng) {
  const total = weights.reduce((s, pair) => s + pair[1], 0) || 1;
  let r = rng() * total;
  for (const [tier, weight] of weights) {
    r -= weight;
    if (r <= 0) return tier;
  }
  return "bronze";
}

export function applyResult(state, payload) {
  const div = DIVISIONS[state.division];
  const us = payload.us;
  const them = payload.them;
  let outcome = us > them ? "win" : us === them ? "draw" : "loss";
  if (payload.forfeit) outcome = "loss";
  const coins = outcome === "win" ? div.win : outcome === "draw" ? div.draw : div.loss;
  const pts = outcome === "win" ? 3 : outcome === "draw" ? 1 : 0;
  state.coins += coins;
  state.points += pts;
  state.season.played += 1;
  state.season.gf += us;
  state.season.ga += them;
  if (outcome === "win") state.season.w += 1;
  else if (outcome === "draw") state.season.d += 1;
  else state.season.l += 1;
  state.history.unshift({
    opp: payload.opp,
    abbr: payload.abbr,
    us,
    them,
    outcome,
    coins,
    pts,
  });
  state.history = state.history.slice(0, 14);
  if (outcome === "loss") state.lossStreak += 1;
  else state.lossStreak = 0;
  let promo = false;
  let rel = false;
  let bonus = 0;
  if (state.points >= div.need && state.division > 1) {
    bonus = div.bonus;
    state.coins += bonus;
    state.division -= 1;
    state.points = 0;
    state.lossStreak = 0;
    promo = true;
  } else if (state.lossStreak >= 3 && state.division < 6 && !promo) {
    state.division += 1;
    state.points = 0;
    state.lossStreak = 0;
    rel = true;
  }
  const faced = payload.clubId || null;
  state.next = { seed: (state.next?.seed || 4100) + 19, avoid: faced };
  saveCareer(state);
  return { coins, pts, bonus, promo, rel, outcome, division: state.division, points: state.points };
}

export function updateSettings(state, patch) {
  state.settings = { ...state.settings, ...patch };
  saveCareer(state);
}

export function seenHelp(state) {
  state.seenHelp = true;
  saveCareer(state);
}
