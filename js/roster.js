import { makeRng, pick } from "./rng.js";
import { overallOf } from "./formations.js";

export const LEAGUES = [
  { id: "alder", name: "Alder Crown" },
  { id: "solara", name: "Solara Primera" },
  { id: "vespera", name: "Vespera Serie" },
  { id: "nord", name: "Nordlicht" },
];

export const CLUBS = [
  { id: "harbour", name: "Harbour City", abbr: "HBR", leagueId: "alder", city: "Harbour", prestige: 5, crown: true, style: "technical", home: "#16325c", away: "#e8e0d0", nations: ["England", "England", "Scotland", "Wales", "Ireland"] },
  { id: "ironbridge", name: "Ironbridge Athletic", abbr: "IRB", leagueId: "alder", city: "Ironbridge", prestige: 4, crown: false, style: "direct", home: "#8d2433", away: "#1b1b1b", nations: ["England", "England", "Scotland", "Ireland"] },
  { id: "kingsmere", name: "Kingsmere", abbr: "KGM", leagueId: "alder", city: "Kingsmere", prestige: 4, crown: false, style: "direct", home: "#6e2438", away: "#f3efe6", nations: ["England", "Wales", "Scotland", "Ireland"] },
  { id: "northwick", name: "Northwick Rovers", abbr: "NWK", leagueId: "alder", city: "Northwick", prestige: 2, crown: false, style: "direct", home: "#1f5f8a", away: "#e2a31b", nations: ["England", "Scotland", "Ireland", "Wales"] },
  { id: "solara", name: "Solara FC", abbr: "SOL", leagueId: "solara", city: "Solara", prestige: 5, crown: true, style: "technical", home: "#d06a2b", away: "#f6e7cf", nations: ["Spain", "Spain", "Portugal", "Argentina"] },
  { id: "puerto", name: "Puerto Verde", abbr: "PVE", leagueId: "solara", city: "Puerto Verde", prestige: 4, crown: true, style: "technical", home: "#1e7a52", away: "#f4f1e6", nations: ["Spain", "Portugal", "Colombia", "Argentina"] },
  { id: "sierra", name: "Sierra Alta", abbr: "SIE", leagueId: "solara", city: "Sierra Alta", prestige: 3, crown: false, style: "technical", home: "#5c3d86", away: "#e6c56a", nations: ["Spain", "Portugal", "Mexico", "Argentina"] },
  { id: "cala", name: "Cala Blanca", abbr: "CLB", leagueId: "solara", city: "Cala Blanca", prestige: 2, crown: false, style: "technical", home: "#2f7f99", away: "#f7f4ee", nations: ["Spain", "Portugal", "Uruguay", "Mexico"] },
  { id: "velora", name: "Velora", abbr: "VEL", leagueId: "vespera", city: "Velora", prestige: 5, crown: true, style: "counter", home: "#141414", away: "#c6a15b", nations: ["Italy", "Italy", "Croatia", "Serbia"] },
  { id: "adriano", name: "Adriano", abbr: "ADR", leagueId: "vespera", city: "Adriano", prestige: 4, crown: true, style: "technical", home: "#0f2740", away: "#8ec3e0", nations: ["Italy", "Italy", "Croatia", "Argentina"] },
  { id: "monteluce", name: "Monteluce", abbr: "MON", leagueId: "vespera", city: "Monteluce", prestige: 3, crown: false, style: "counter", home: "#2c6b45", away: "#e4ddcf", nations: ["Italy", "Serbia", "Croatia", "Switzerland"] },
  { id: "cittanove", name: "Città Nove", abbr: "CTN", leagueId: "vespera", city: "Città Nove", prestige: 2, crown: false, style: "direct", home: "#e07a3d", away: "#1e3344", nations: ["Italy", "Italy", "Poland", "Serbia"] },
  { id: "frostholm", name: "Frostholm BK", abbr: "FRS", leagueId: "nord", city: "Frostholm", prestige: 4, crown: true, style: "press", home: "#1c3d52", away: "#d5e4f2", nations: ["Sweden", "Norway", "Denmark", "Germany"] },
  { id: "eisenwald", name: "Eisenwald", abbr: "EIS", leagueId: "nord", city: "Eisenwald", prestige: 4, crown: false, style: "press", home: "#1d4034", away: "#c5ccc8", nations: ["Germany", "Germany", "Austria", "Switzerland"] },
  { id: "rheinmark", name: "Rheinmark", abbr: "RHM", leagueId: "nord", city: "Rheinmark", prestige: 3, crown: false, style: "press", home: "#9a2433", away: "#f0e6d4", nations: ["Germany", "Germany", "Netherlands", "Austria"] },
  { id: "hafenstern", name: "Hafenstern", abbr: "HAF", leagueId: "nord", city: "Hafenstern", prestige: 3, crown: false, style: "direct", home: "#1a1a1a", away: "#e0b03a", nations: ["Germany", "Netherlands", "Denmark", "Poland"] },
];

const FOREIGN = [
  "Brazil", "Argentina", "Nigeria", "Ghana", "Senegal", "Japan", "South Korea",
  "United States", "Croatia", "Morocco", "France", "Spain", "Portugal",
  "Netherlands", "Colombia", "Cameroon", "Côte d'Ivoire", "Mexico", "Uruguay",
  "Egypt", "Belgium", "Serbia", "Poland", "Sweden", "Denmark", "Australia", "Turkey",
];

const NAMES = {
  England: {
    first: ["Ellis", "Callum", "Jude", "Harris", "Nolan", "Arthur", "Freddie", "Reuben", "Jonah", "Leighton", "Kit", "Owen", "Tobias", "Oscar", "Rowan", "Alec", "Mason", "Elliot"],
    last: ["Harlow", "Beckett", "Ward", "Crowe", "Hale", "Ashworth", "Fenwick", "Lang", "Cartwright", "Renshaw", "Tindall", "Pembroke", "Colby", "Moffat", "Sutton", "Priory"],
  },
  Scotland: {
    first: ["Fraser", "Finlay", "Hamish", "Ewan", "Callan", "Brodie", "Angus", "Rory", "Gregor", "Murray"],
    last: ["McBride", "Dunbar", "Kelso", "Lamont", "Strachan", "Baird", "Cairns", "Nairn", "Melrose", "Drummond"],
  },
  Wales: {
    first: ["Rhys", "Ioan", "Bryn", "Gareth", "Owain", "Dylan", "Macsen", "Tomos"],
    last: ["Pryce", "Cadogan", "Beynon", "Griff", "Llewellyn", "Vaughan", "Howells", "Teague"],
  },
  Ireland: {
    first: ["Cian", "Niall", "Declan", "Shay", "Oisin", "Paddy", "Darragh", "Eoin"],
    last: ["Keane", "Dunne", "Gallagher", "Nolan", "Quill", "Breslin", "Corcoran", "Malone"],
  },
  Spain: {
    first: ["Mateo", "Iker", "Alvaro", "Hugo", "Nicolas", "Sergio", "Adrian", "Unai", "Gonzalo", "Martin"],
    last: ["Soler", "Varela", "Crespo", "Ibáñez", "Navarrete", "Paredes", "Olmo", "Delgado", "Herrera", "Quintero"],
  },
  Portugal: {
    first: ["Duarte", "Gonçalo", "Tiago", "Afonso", "Martim", "Rui", "Nuno", "Diogo"],
    last: ["Pacheco", "Veloso", "Carmo", "Figueiredo", "Lemos", "Barroso", "Queirós", "Moutinho"],
  },
  Italy: {
    first: ["Luca", "Matteo", "Andrea", "Niccolò", "Stefano", "Enzo", "Pietro", "Davide", "Lorenzo", "Marco"],
    last: ["Ferrante", "Bellandi", "Ruggieri", "Moretti", "Santoro", "Greco", "Vitali", "Lombardi", "Conte", "Pellegrini"],
  },
  Germany: {
    first: ["Jonas", "Lukas", "Finn", "Mats", "Leon", "Niklas", "Jannik", "Erik", "Ben"],
    last: ["Keller", "Brandt", "Voss", "Hartmann", "Kruger", "Vogel", "Seidel", "Albrecht", "Neumann"],
  },
  France: {
    first: ["Adrien", "Hugo", "Mathis", "Enzo", "Sacha", "Léo", "Noam", "Ilan", "Baptiste"],
    last: ["Marchand", "Duval", "Morel", "Laurent", "Perrot", "Blanchet", "Garnier", "Roussel", "Clément"],
  },
  Netherlands: {
    first: ["Sem", "Daan", "Bram", "Stijn", "Joris", "Luuk", "Thijs", "Mees"],
    last: ["Veldkamp", "De Vries", "Bakker", "Smit", "Kuipers", "Hoekstra", "Postma", "Van Dijk"],
  },
  Brazil: {
    first: ["Caio", "Rafa", "Davi", "Igor", "Cauê", "Heitor", "Breno", "Vinicius", "Luan"],
    last: ["Nogueira", "Teles", "Barreto", "Falcão", "Macedo", "Pimentel", "Azevedo", "Dutra", "Correia"],
  },
  Argentina: {
    first: ["Lautaro", "Bautista", "Thiago", "Facundo", "Joaquin", "Valentin", "Santiago", "Franco"],
    last: ["Alderete", "Paredes", "Sosa", "Ledesma", "Godoy", "Bustos", "Riquelme", "Acuña"],
  },
  Uruguay: {
    first: ["Agustin", "Nahuel", "Bruno", "Diego", "Maxi"],
    last: ["Cabrera", "Pereyra", "Varela", "Suarez", "Gonzalez"],
  },
  Colombia: {
    first: ["Camilo", "Andres", "Jhon", "Esteban", "Felipe"],
    last: ["Restrepo", "Cardenas", "Montoya", "Ospina", "Quintero"],
  },
  Mexico: {
    first: ["Emiliano", "Santiago", "Diego", "Iker", "Rodrigo"],
    last: ["Navarrete", "Cervantes", "Solis", "Aguirre", "Palacios"],
  },
  Nigeria: {
    first: ["Idris", "Chinedu", "Emeka", "Tobi", "Kelechi", "Zubair"],
    last: ["Okoye", "Adeyemi", "Bassey", "Balogun", "Nwosu", "Okafor"],
  },
  Ghana: {
    first: ["Kofi", "Kwame", "Kwesi", "Yaw", "Kojo"],
    last: ["Mensah", "Boateng", "Owusu", "Appiah", "Asante"],
  },
  Senegal: {
    first: ["Sekou", "Boubacar", "Malik", "Ibrahima", "Cheikh"],
    last: ["Diallo", "Sow", "Camara", "Diop", "Sarr"],
  },
  Cameroon: {
    first: ["Jabari", "Samuel", "Eric", "Patrick"],
    last: ["Nkong", "Mbarga", "Tchoupo", "Essono"],
  },
  "Côte d'Ivoire": {
    first: ["Latif", "Yao", "Serge", "Wilfried"],
    last: ["Konate", "Traore", "Kouassi", "Bamba"],
  },
  Morocco: {
    first: ["Amir", "Youssef", "Hamza", "Anas", "Ayoub"],
    last: ["El-Masri", "Cherif", "Haddad", "Bennani", "Amrani"],
  },
  Egypt: {
    first: ["Omar", "Hassan", "Farid", "Mahmoud", "Tariq"],
    last: ["Farouk", "Nasser", "Sharif", "Khalil", "Darwish"],
  },
  Japan: {
    first: ["Kenji", "Haruto", "Ren", "Sota", "Daiki", "Kaito", "Minato"],
    last: ["Arai", "Fujimoto", "Mori", "Nakano", "Okada", "Ishikawa", "Sato"],
  },
  "South Korea": {
    first: ["Minjae", "Jisung", "Hyunwoo", "Taemin", "Seojun"],
    last: ["Park", "Choi", "Han", "Jung", "Yoon"],
  },
  "United States": {
    first: ["Cole", "Miles", "Evan", "Wesley", "Grant", "Andre"],
    last: ["Callahan", "Brooks", "Decker", "Hollis", "Ramsey", "Whitaker"],
  },
  Croatia: {
    first: ["Luka", "Ivan", "Ante", "Borna", "Duje"],
    last: ["Kovacic", "Maric", "Babic", "Peric", "Novak"],
  },
  Serbia: {
    first: ["Nemanja", "Dusan", "Aleksa", "Vuk", "Stefan"],
    last: ["Petrovic", "Jovanovic", "Ilic", "Kostic", "Markovic"],
  },
  Sweden: {
    first: ["Soren", "Albin", "Elias", "Noel", "Viktor"],
    last: ["Lind", "Holm", "Bergstrom", "Ahlgren", "Nyberg"],
  },
  Norway: {
    first: ["Sander", "Magnus", "Henrik", "Eirik"],
    last: ["Solberg", "Dahl", "Hauge", "Nilsen"],
  },
  Denmark: {
    first: ["Mikkel", "Kasper", "Oliver", "Malthe"],
    last: ["Sørensen", "Holm", "Kruse", "Lindholm"],
  },
  Austria: {
    first: ["Marcel", "Florian", "David", "Christoph"],
    last: ["Gruber", "Huber", "Leitner", "Aigner"],
  },
  Switzerland: {
    first: ["Nico", "Remo", "Yanis", "Lars"],
    last: ["Meier", "Frei", "Graf", "Widmer"],
  },
  Belgium: {
    first: ["Louis", "Arthur", "Seppe", "Wout"],
    last: ["Peeters", "Jacobs", "Claes", "Goossens"],
  },
  Poland: {
    first: ["Kacper", "Bartek", "Oliwier", "Tymon"],
    last: ["Kowalski", "Nowak", "Wojcik", "Kaminski"],
  },
  Australia: {
    first: ["Lachlan", "Mitchell", "Cooper", "Bailey"],
    last: ["Hartley", "McKenzie", "Rowe", "Bennett"],
  },
  Turkey: {
    first: ["Emre", "Kerem", "Burak", "Yusuf"],
    last: ["Demir", "Yilmaz", "Aydin", "Kaya"],
  },
};

const TEMPLATE = [
  { pos: "GK", role: "first" },
  { pos: "GK", role: "rotate" },
  { pos: "LB", role: "first" },
  { pos: "CB", role: "first" },
  { pos: "CB", role: "first" },
  { pos: "RB", role: "first" },
  { pos: "CDM", role: "first" },
  { pos: "CM", role: "first" },
  { pos: "CM", role: "rotate" },
  { pos: "CAM", role: "first" },
  { pos: "LW", role: "first" },
  { pos: "RW", role: "first" },
  { pos: "ST", role: "star" },
  { pos: "ST", role: "rotate" },
  { pos: "CM", role: "rotate" },
];

const TARGET = {
  star: { 5: 90, 4: 86, 3: 82, 2: 77 },
  first: { 5: 84, 4: 80, 3: 76, 2: 72 },
  rotate: { 5: 77, 4: 74, 3: 70, 2: 66 },
};

const BIAS = {
  GK: { pac: -6, sho: -8, pas: -2, dri: -4, def: 8, phy: 4 },
  CB: { pac: -3, sho: -8, pas: 0, dri: -3, def: 8, phy: 6 },
  LB: { pac: 6, sho: -3, pas: 2, dri: 2, def: 2, phy: 0 },
  RB: { pac: 6, sho: -3, pas: 2, dri: 2, def: 2, phy: 0 },
  CDM: { pac: 0, sho: -4, pas: 3, dri: 0, def: 6, phy: 3 },
  CM: { pac: 0, sho: 0, pas: 5, dri: 2, def: 1, phy: 0 },
  CAM: { pac: 1, sho: 3, pas: 5, dri: 5, def: -6, phy: -2 },
  LW: { pac: 6, sho: 2, pas: 2, dri: 5, def: -6, phy: -2 },
  RW: { pac: 6, sho: 2, pas: 2, dri: 5, def: -6, phy: -2 },
  ST: { pac: 3, sho: 8, pas: -2, dri: 2, def: -8, phy: 2 },
};

function leagueName(id) {
  return LEAGUES.find((l) => l.id === id).name;
}

function makeStats(rng, pos, target) {
  const bias = BIAS[pos];
  const stats = {};
  for (const k of ["pac", "sho", "pas", "dri", "def", "phy"]) {
    const spread = (rng() * 10 - 5) + (rng() < 0.15 ? (rng() < 0.5 ? -4 : 6) : 0);
    stats[k] = Math.round(target + bias[k] + spread);
  }
  let guard = 0;
  while (overallOf(stats, pos) < target && guard++ < 12) {
    const keys = Object.keys(stats).sort((a, b) => (BIAS[pos][b] || 0) - (BIAS[pos][a] || 0));
    stats[keys[0]] += 1;
  }
  while (overallOf(stats, pos) > target + 1 && guard++ < 24) {
    const keys = Object.keys(stats).sort((a, b) => (BIAS[pos][a] || 0) - (BIAS[pos][b] || 0));
    stats[keys[0]] -= 1;
  }
  for (const k of Object.keys(stats)) stats[k] = Math.max(48, Math.min(96, stats[k]));
  return stats;
}

function nationOf(rng, club) {
  if (rng() < 0.68) return pick(rng, club.nations);
  return pick(rng, FOREIGN);
}

function fullName(rng, nation, used) {
  const pool = NAMES[nation] || NAMES.England;
  for (let i = 0; i < 40; i++) {
    const name = `${pick(rng, pool.first)} ${pick(rng, pool.last)}`;
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
  }
  const name = `${pick(rng, pool.first)} ${pick(rng, pool.last)} ${Math.floor(rng() * 90 + 10)}`;
  used.add(name);
  return name;
}

function portraitOf(rng) {
  return {
    skin: Math.floor(rng() * 6),
    hair: Math.floor(rng() * 6),
    style: Math.floor(rng() * 8),
    beard: rng() < 0.42 ? Math.floor(rng() * 3) + 1 : 0,
    eyes: Math.floor(rng() * 4),
  };
}

function buildRoster() {
  const rng = makeRng(20261108);
  const used = new Set();
  const players = [];
  for (const club of CLUBS) {
    TEMPLATE.forEach((tpl, index) => {
      let role = tpl.role;
      if (role === "star" && club.prestige <= 2) role = "first";
      const target = TARGET[role][club.prestige];
      const nation = nationOf(rng, club);
      const name = fullName(rng, nation, used);
      const stats = makeStats(rng, tpl.pos, target);
      const special = club.crown && role === "star";
      if (special) {
        stats.sho = Math.min(96, stats.sho + 1);
        stats.pac = Math.min(96, stats.pac + 1);
      }
      const ovr = overallOf(stats, tpl.pos);
      let tier = "bronze";
      if (special) tier = "crown";
      else if (ovr >= 83) tier = "gold";
      else if (ovr >= 75) tier = "silver";
      players.push({
        id: `${club.id}-${index}`,
        name,
        last: name.split(" ").slice(-1)[0],
        pos: tpl.pos,
        nation,
        clubId: club.id,
        clubName: club.name,
        leagueId: club.leagueId,
        leagueName: leagueName(club.leagueId),
        stats,
        ovr,
        tier,
        special,
        kit: club.home,
        kit2: club.away,
        portrait: portraitOf(rng),
        number: index === 0 ? 1 : index === 1 ? 13 : index + 1,
      });
    });
  }
  return players;
}

export const ROSTER = buildRoster();

export function clubById(id) {
  return CLUBS.find((c) => c.id === id);
}

export function leagueById(id) {
  return LEAGUES.find((l) => l.id === id);
}

export function playerById(id) {
  return ROSTER.find((p) => p.id === id);
}

export const USER_KIT = {
  shirt: "#1a3f73",
  shirt2: "#102844",
  shorts: "#f3efe4",
  number: "#f0d48a",
  gk: "#c4493a",
  gkNum: "#fff7ea",
};

export function tierLabel(tier) {
  if (tier === "crown") return "Crown";
  if (tier === "gold") return "Gold";
  if (tier === "silver") return "Silver";
  return "Bronze";
}

export function releaseValue(player) {
  if (player.tier === "crown") return 3200;
  if (player.tier === "gold") return 1400;
  if (player.tier === "silver") return 420;
  return 160;
}

export const PACKS = {
  bronze: {
    id: "bronze",
    name: "Dock Pack",
    blurb: "Three scouting cards. Mostly bronze, with a chance of silver.",
    cost: 800,
    count: 3,
    weights: [
      ["bronze", 76],
      ["silver", 21],
      ["gold", 3],
      ["crown", 0],
    ],
  },
  silver: {
    id: "silver",
    name: "Harbour Pack",
    blurb: "Four cards. The reliable way to strengthen a division side.",
    cost: 4000,
    count: 4,
    weights: [
      ["bronze", 34],
      ["silver", 50],
      ["gold", 15],
      ["crown", 1],
    ],
  },
  gold: {
    id: "gold",
    name: "Crown Pack",
    blurb: "Five cards. Gold is common. A Crown card is rare.",
    cost: 9000,
    count: 5,
    weights: [
      ["bronze", 8],
      ["silver", 42],
      ["gold", 45],
      ["crown", 5],
    ],
  },
};

export const DIVISIONS = {
  6: { id: 6, name: "Docklands", need: 12, win: 1200, draw: 550, loss: 280, bonus: 800, opp: 70 },
  5: { id: 5, name: "Borough", need: 12, win: 1500, draw: 650, loss: 320, bonus: 1000, opp: 74 },
  4: { id: 4, name: "Provincial", need: 15, win: 1800, draw: 800, loss: 380, bonus: 1400, opp: 77 },
  3: { id: 3, name: "Continental", need: 15, win: 2300, draw: 1000, loss: 450, bonus: 1800, opp: 81 },
  2: { id: 2, name: "Laurels", need: 15, win: 2800, draw: 1200, loss: 520, bonus: 2400, opp: 85 },
  1: { id: 1, name: "Crown", need: 99, win: 3600, draw: 1500, loss: 640, bonus: 0, opp: 88 },
};

export function divisionList() {
  return [6, 5, 4, 3, 2, 1].map((id) => DIVISIONS[id]);
}
