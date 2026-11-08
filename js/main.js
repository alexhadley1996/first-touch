import { createMatch } from "./engine.js";
import { drawMatch, createCamera } from "./render.js";
import { paintFaces } from "./portraits.js";
import { createAudio } from "./audio.js";
import { DIVISIONS, divisionList, PACKS, releaseValue } from "./roster.js";
import { difficultyFor, opponentSide, userMateDiff, userSide } from "./squads.js";
import { FORMATIONS, FORMATION_IDS, linkColor, linkStrength } from "./formations.js";
import {
  applyResult,
  benchCards,
  canRelease,
  cardByUid,
  ensureOpponent,
  freshCareer,
  lineup,
  loadCareer,
  markSeen,
  openPack,
  releaseCard,
  renameClub,
  resetCareer,
  saveCareer,
  seenHelp,
  setFormation,
  squadChemistry,
  swapPlayers,
  updateSettings,
  xiOverall,
} from "./storage.js";

const audio = createAudio();
const view = document.getElementById("view");
const app = document.getElementById("app");
const toastEl = document.getElementById("toast");

let career = loadCareer();
let selected = null;
let helpNext = "prematch";
let match = null;
let oppMeta = null;
let cam = createCamera();
let raf = 0;
let lastT = 0;
let paused = false;
let finished = false;
let crowdBoost = 0;
let stickId = null;
const held = {};
const edges = { pass: false, through: false, shootRelease: false, tackle: false, switch: false };
const axes = { x: 0, y: 0, sprint: false, shoot: false, contain: false };
const keys = new Set();

boot();

function boot() {
  const splash = document.getElementById("splash");
  setTimeout(() => splash.classList.add("hide"), 500);
  setTimeout(() => splash.remove(), 1000);
  audio.enabled = career.settings.sound !== false;
  window.addEventListener("pointerdown", () => audio.unlock());
  window.addEventListener("keydown", onKey);
  window.addEventListener("keyup", onKeyUp);
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
  show("home");
}

function show(name) {
  stopMatchLoop();
  app.classList.remove("match-mode");
  view.classList.remove("bare");
  audio.stopCrowd();
  if (name === "home") renderHome();
  else if (name === "squad") renderSquad();
  else if (name === "packs") renderPacks();
  else if (name === "season") renderSeason();
  else if (name === "settings") renderSettings();
  else if (name === "help") renderHelp();
  else if (name === "prematch") renderPrematch();
  else if (name === "pack") renderPackTheater();
  window.scrollTo(0, 0);
}

function shell(body, tab) {
  view.innerHTML = `${body}${nav(tab)}`;
}

function nav(tab) {
  const item = (id, label) => `<button type="button" data-nav="${id}" class="${tab === id ? "on" : ""}">${label}</button>`;
  return `<nav class="nav">${item("home", "Home")}${item("squad", "Squad")}${item("packs", "Packs")}${item("season", "Season")}</nav>`;
}

function bindNav() {
  view.querySelectorAll("[data-nav]").forEach((btn) => {
    btn.addEventListener("click", () => {
      audio.ui();
      show(btn.dataset.nav);
    });
  });
}

function renderHome() {
  const ovr = xiOverall(career);
  const chem = squadChemistry(career);
  const div = DIVISIONS[career.division];
  const opp = ensureOpponent(career);
  const oppOvr = Math.round(opp.xi.reduce((s, p) => s + p.ovr, 0) / 11);
  shell(`
    <header class="topbar">
      <div class="word">FIRST TOUCH</div>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="btn slim ghost" type="button" id="gear">Settings</button>
        <div class="coins">${money(career.coins)}</div>
      </div>
    </header>
    <section class="hero">
      <div class="ovr-ring"><div><b>${ovr}</b><span>XI OVR</span></div></div>
      <div>
        <button class="club-btn" type="button" id="rename"><strong>${escapeHtml(career.clubName)}</strong></button>
        <div class="pills">
          <span class="pill">${FORMATIONS[career.formation].name}</span>
          <span class="pill">Chem ${chem.team}</span>
          <span class="pill">${div.name}</span>
        </div>
        <p class="small muted">${escapeHtml(chemNote(chem.team))}</p>
      </div>
    </section>
    <section class="panel" style="margin-bottom:14px">
      <div class="spread"><span class="kicker">This division</span><span class="results">${(career.history.slice(0, 6).map((h) => `<i class="${h.outcome}">${h.outcome === "win" ? "W" : h.outcome === "draw" ? "D" : "L"}</i>`).join("")) || `<span class="small muted">No matches yet</span>`}</span></div>
      <p class="small muted" style="margin-bottom:0">Win ${money(div.win)} · draw ${money(div.draw)} · loss ${money(div.loss)}. Halves are three minutes. Attack to the right.</p>
      <p class="small muted" id="install" hidden>To keep it on your phone, open the browser menu and choose Add to Home Screen.</p>
    </section>
    <section class="panel">
      <div class="kicker">Next fixture</div>
      <div class="opp-name">${escapeHtml(opp.club.name)}</div>
      <p class="small muted">${escapeHtml(opp.club.leagueId ? leagueName(opp.club) : "")} · OVR ${oppOvr} · ${div.name}</p>
      <p class="small">Points ${career.points}/${div.need === 99 ? "—" : div.need} · Season ${career.season.w}-${career.season.d}-${career.season.l}</p>
      <button class="btn" type="button" id="kick">Kick off</button>
    </section>
  `, "home");
  bindNav();
  document.getElementById("kick").onclick = () => {
    audio.ui();
    if (!career.seenHelp) {
      helpNext = "prematch";
      show("help");
    } else show("prematch");
  };
  const install = document.getElementById("install");
  const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
  if (install && !standalone) install.hidden = false;
  document.getElementById("gear").onclick = () => show("settings");
  document.getElementById("rename").onclick = renameFlow;
}

function leagueName(club) {
  return club.leagueId === "alder" ? "Alder Crown"
    : club.leagueId === "solara" ? "Solara Primera"
    : club.leagueId === "vespera" ? "Vespera Serie"
    : "Nordlicht";
}

function renderSquad() {
  const chem = squadChemistry(career);
  const cards = lineup(career);
  const slots = FORMATIONS[career.formation].slots;
  const lines = FORMATIONS[career.formation].links.map(([a, b]) => {
    const pa = cards[a];
    const pb = cards[b];
    const s = linkStrength(pa, pb);
    const A = slots[a];
    const B = slots[b];
    return `<line x1="${A.sy * 100}" y1="${(1 - A.sx) * 100}" x2="${B.sy * 100}" y2="${(1 - B.sx) * 100}" stroke="${linkColor(s)}" stroke-width="1.1" stroke-linecap="round" opacity="0.9"/>`;
  }).join("");
  const tokens = cards.map((card, i) => {
    const slot = slots[i];
    return `<button class="token ${card.tier} ${selected === card.uid ? "on" : ""}" type="button" data-uid="${card.uid}" style="left:${slot.sy * 100}%;top:${(1 - slot.sx) * 100}%">
      <span><b>${card.ovr}</b><small>${slot.label}</small></span>
    </button>`;
  }).join("");
  const bench = benchCards(career).map((card) => miniCard(card)).join("");
  shell(`
    <header class="spread">
      <div>
        <div class="kicker">My squad</div>
        <h1>${escapeHtml(career.clubName)}</h1>
      </div>
      <div class="chem-tag">Chem <b>${chem.team}</b></div>
    </header>
    <p class="small muted">Links follow each card's club, league, and nation. A full link trims the gap between a bronze side and a richer one.</p>
    <div class="seg" id="forms">
      ${FORMATION_IDS.map((id) => `<button type="button" data-form="${id}" class="${id === career.formation ? "on" : ""}">${FORMATIONS[id].name}</button>`).join("")}
    </div>
    <div class="pitch-board">
      <svg class="lines" viewBox="0 0 100 100" preserveAspectRatio="none">
        <rect x="4" y="4" width="92" height="92" fill="none" stroke="rgba(255,255,255,0.75)" stroke-width="0.6"/>
        <line x1="4" y1="50" x2="96" y2="50" stroke="rgba(255,255,255,0.75)" stroke-width="0.4"/>
        <circle cx="50" cy="50" r="10" fill="none" stroke="rgba(255,255,255,0.75)" stroke-width="0.4"/>
        <rect x="22" y="4" width="56" height="16" fill="none" stroke="rgba(255,255,255,0.75)" stroke-width="0.4"/>
        <rect x="22" y="80" width="56" height="16" fill="none" stroke="rgba(255,255,255,0.75)" stroke-width="0.4"/>
        ${lines}
      </svg>
      ${tokens}
    </div>
    <div class="kicker">Bench · tap a starter, then a card</div>
    <div class="bench" id="bench">${bench || `<p class="muted">The bench is empty. Open a scout pack.</p>`}</div>
  `, "squad");
  bindNav();
  bindFaces(view, [...cards, ...benchCards(career)]);
  view.querySelectorAll("[data-form]").forEach((btn) => {
    btn.onclick = () => {
      setFormation(career, btn.dataset.form);
      career = loadCareer();
      audio.ui();
      toast(`Shape set to ${FORMATIONS[btn.dataset.form].name}`);
      renderSquad();
    };
  });
  view.querySelectorAll(".token").forEach((btn) => {
    btn.onclick = () => onSquadTap(btn.dataset.uid);
  });
  view.querySelectorAll(".pcard").forEach((btn) => {
    btn.onclick = () => onSquadTap(btn.dataset.uid);
  });
}

function onSquadTap(uid) {
  audio.click();
  if (selected && selected !== uid) {
    swapPlayers(career, selected, uid);
    career = loadCareer();
    selected = null;
    toast("XI updated");
    renderSquad();
    return;
  }
  selected = uid;
  renderSquad();
  openSheet(uid);
}

function openSheet(uid) {
  const card = cardByUid(career, uid);
  if (!card) return;
  markSeen(career, uid);
  career = loadCareer();
  const inXi = career.xi.includes(uid);
  const idx = career.xi.indexOf(uid);
  const chem = squadChemistry(career);
  const block = canRelease(career, uid);
  const existing = document.getElementById("sheet");
  if (existing) existing.remove();
  const sheet = document.createElement("div");
  sheet.className = "sheet";
  sheet.id = "sheet";
  sheet.innerHTML = `
    <div class="card-wrap">${bigCard(card)}</div>
    <p class="small">${escapeHtml(card.clubName)} · ${escapeHtml(card.leagueName)} · ${escapeHtml(card.nation)}</p>
    <p class="small muted">${inXi ? `Slot chemistry ${chem.players[idx]}/10 in the ${FORMATIONS[career.formation].slots[idx].label} role.` : "On the bench. Tap them after a starter to bring them in."}</p>
    <div class="stack">
      ${inXi ? "" : `<button class="btn" type="button" id="sheet-play">Select for a swap</button>`}
      <button class="btn ghost" type="button" id="sheet-sell" ${block ? "disabled" : ""}>${block ? escapeHtml(block) : `Release for ${money(releaseValue(card))}`}</button>
      <button class="btn ghost" type="button" id="sheet-close">Close</button>
    </div>
  `;
  document.body.appendChild(sheet);
  bindFaces(sheet, [card]);
  sheet.querySelector("#sheet-close").onclick = () => {
    sheet.remove();
    selected = null;
    renderSquad();
  };
  const play = sheet.querySelector("#sheet-play");
  if (play) play.onclick = () => {
    selected = uid;
    sheet.remove();
    toast("Now tap the starter to replace");
    renderSquad();
  };
  sheet.querySelector("#sheet-sell").onclick = async () => {
    const ok = await confirmBox("Release player", `${card.name} leaves the club for ${money(releaseValue(card))}.`);
    if (!ok) return;
    const res = releaseCard(career, uid);
    career = loadCareer();
    sheet.remove();
    selected = null;
    if (res.error) toast(res.error);
    else toast(`${res.name} released · +${money(res.value)}`);
    renderSquad();
  };
}

function renderPacks() {
  const cards = Object.values(PACKS).map((pack) => `
    <button class="pack" type="button" data-pack="${pack.id}" ${career.coins < pack.cost ? "disabled" : ""}>
      <div class="kicker">${pack.count} cards</div>
      <strong>${escapeHtml(pack.name)}</strong>
      <p class="small muted">${escapeHtml(pack.blurb)}</p>
      <div class="price">${money(pack.cost)}</div>
    </button>
  `).join("");
  shell(`
    <header class="spread">
      <div>
        <div class="kicker">Scout packs</div>
        <h1>Find a player</h1>
      </div>
      <div class="coins">${money(career.coins)}</div>
    </header>
    <p class="small muted">Coins come from seasons. A win in ${DIVISIONS[career.division].name} pays ${money(DIVISIONS[career.division].win)}.</p>
    <div class="packs">${cards}</div>
  `, "packs");
  bindNav();
  view.querySelectorAll("[data-pack]").forEach((btn) => {
    btn.onclick = () => {
      const res = openPack(career, btn.dataset.pack);
      if (res.error) {
        toast(res.error);
        return;
      }
      career = loadCareer();
      audio.ui();
      sessionStorage.setItem("ft-pack", JSON.stringify(res.pulls));
      show("pack");
    };
  });
}

function renderPackTheater() {
  let pulls = [];
  try { pulls = JSON.parse(sessionStorage.getItem("ft-pack") || "[]"); } catch { pulls = []; }
  const cards = pulls.map((uid) => cardByUid(career, uid)).filter(Boolean);
  view.classList.add("bare");
  view.innerHTML = `
    <div class="theater" id="theater">
      <div class="sealed" id="sealed">SCOUT<br>PACK</div>
      <div class="reveal-row" id="row" hidden>
        ${cards.map((card, i) => `
          <button class="flip" type="button" data-i="${i}">
            <div class="inner">
              <div class="back">FT</div>
              <div class="face">${miniCard(card)}</div>
            </div>
          </button>
        `).join("")}
      </div>
      <button class="btn" type="button" id="pack-next" style="max-width:280px">Open</button>
    </div>
  `;
  bindFaces(view, cards);
  const sealed = document.getElementById("sealed");
  const row = document.getElementById("row");
  const next = document.getElementById("pack-next");
  let index = -1;
  const flips = () => [...view.querySelectorAll(".flip")];
  next.onclick = () => {
    audio.unlock();
    if (index < 0) {
      sealed.remove();
      row.hidden = false;
      index = 0;
      next.textContent = "Reveal";
      return;
    }
    const nodes = flips();
    if (index < nodes.length) {
      nodes[index].classList.add("open");
      const card = cards[index];
      audio.reveal(card.tier);
      if (card.tier === "crown" || card.tier === "gold") buzz([20, 30, 40]);
      index += 1;
      if (index >= nodes.length) next.textContent = "To the squad";
      return;
    }
    sessionStorage.removeItem("ft-pack");
    toast("New cards are on your bench");
    show("squad");
  };
  flips().forEach((node) => {
    node.onclick = () => {
      if (node.classList.contains("open")) return;
      node.classList.add("open");
      audio.reveal(cards[Number(node.dataset.i)].tier);
    };
  });
}

function renderSeason() {
  const div = DIVISIONS[career.division];
  const rungs = divisionList().map((d) => `
    <div class="rung ${d.id === career.division ? "on" : ""}">
      <div>
        <strong>${d.name}</strong>
        <div class="small muted">Win ${money(d.win)} · opp ~${d.opp} OVR</div>
      </div>
      <div>${d.id === 1 ? "Top" : `${d.need} pts`}</div>
    </div>
  `).join("");
  const recent = career.history.map((h) => `<i class="${h.outcome}">${h.outcome === "win" ? "W" : h.outcome === "draw" ? "D" : "L"}</i>`).join("");
  shell(`
    <div class="kicker">Club seasons</div>
    <h1>${div.name}</h1>
    <p class="small muted">3 points for a win, 1 for a draw. ${div.id === 1 ? "Crown has no further promotion." : `${div.need} points promotes you.`} Three losses in a row drop you a division, except in Docklands.</p>
    <div class="panel">
      <div class="spread"><span>Points</span><b>${career.points}${div.need === 99 ? "" : ` / ${div.need}`}</b></div>
      <div class="spread"><span>Record</span><b>${career.season.w}-${career.season.d}-${career.season.l}</b></div>
      <div class="spread"><span>Goals</span><b>${career.season.gf}-${career.season.ga}</b></div>
      <div class="spread"><span>Loss streak</span><b>${career.lossStreak}</b></div>
      <div class="results" style="margin-top:10px">${recent || `<span class="muted small">No matches yet.</span>`}</div>
    </div>
    <h2 style="margin:16px 0 8px">Ladder</h2>
    <div class="ladder">${rungs}</div>
  `, "season");
  bindNav();
}

function renderSettings() {
  shell(`
    <div class="kicker">Club office</div>
    <h1>Settings</h1>
    <div class="stack" style="margin-top:14px">
      <label class="panel spread"><span>Sound</span><input id="sound" type="checkbox" ${career.settings.sound ? "checked" : ""}></label>
      <label class="panel spread"><span>Vibration</span><input id="vib" type="checkbox" ${career.settings.vibrate ? "checked" : ""}></label>
      <button class="btn ghost" type="button" id="how">How to play</button>
      <button class="btn ghost" type="button" id="reset">Reset club</button>
      <button class="btn" type="button" id="back">Back home</button>
    </div>
  `, "home");
  bindNav();
  document.getElementById("sound").onchange = (e) => {
    audio.enabled = e.target.checked;
    updateSettings(career, { sound: e.target.checked });
    career = loadCareer();
  };
  document.getElementById("vib").onchange = (e) => {
    updateSettings(career, { vibrate: e.target.checked });
    career = loadCareer();
  };
  document.getElementById("how").onclick = () => {
    helpNext = "settings";
    show("help");
  };
  document.getElementById("back").onclick = () => show("home");
  document.getElementById("reset").onclick = async () => {
    const ok = await confirmBox("Reset North Pier?", "Coins, squad, and season progress return to the opening club. This stays on this device.");
    if (!ok) return;
    career = resetCareer();
    selected = null;
    toast("A new club is ready");
    show("home");
  };
  audio.enabled = !!career.settings.sound;
}

function renderHelp() {
  shell(`
    <div class="kicker">On the pitch</div>
    <h1>How you play</h1>
    <ul class="help">
      <li>Turn the phone sideways. You attack to the right.</li>
      <li>Left thumb: move, and aim. Passes go to the best teammate that way. Shots use that aim plus power.</li>
      <li>Pass, Through, and Shoot are on the right. Hold Shoot, then let go.</li>
      <li>Hold Sprint to run. It drains stamina, and a tired player is slower and less accurate.</li>
      <li>Tap Tackle to lunge. Hold it to jockey and contain.</li>
      <li>Swap picks the teammate closest to the ball.</li>
      <li>Chemistry is real. Linked players keep more of their pace, passing, and shooting.</li>
    </ul>
    <button class="btn" type="button" id="ready">${helpNext === "prematch" ? "I'm ready" : "Back"}</button>
  `, "home");
  bindNav();
  document.getElementById("ready").onclick = () => {
    seenHelp(career);
    career = loadCareer();
    show(helpNext === "prematch" ? "prematch" : "home");
  };
}

function renderPrematch() {
  const chem = squadChemistry(career);
  const mine = xiOverall(career);
  const opp = ensureOpponent(career);
  const oppOvr = Math.round(opp.xi.reduce((s, p) => s + p.ovr, 0) / 11);
  const div = DIVISIONS[career.division];
  shell(`
    <div class="kicker">${div.name}</div>
    <h1>${escapeHtml(career.clubName)}</h1>
    <p class="small muted">versus</p>
    <h2>${escapeHtml(opp.club.name)}</h2>
    <div class="panel" style="margin:14px 0">
      <div class="spread"><span>Your XI</span><b>${mine}</b></div>
      <div class="spread"><span>Opponent</span><b>${oppOvr}</b></div>
      <div class="spread"><span>Chemistry</span><b>${chem.team}</b></div>
      <p class="small muted">${escapeHtml(chemNote(chem.team))} Halves are three minutes. You attack to the right.</p>
    </div>
    <div class="stack">
      <button class="btn" type="button" id="start">Start match</button>
      <button class="btn ghost" type="button" id="cancel">Not now</button>
    </div>
  `, "home");
  bindNav();
  document.getElementById("cancel").onclick = () => show("home");
  document.getElementById("start").onclick = () => startMatch(opp, chem);
}

function startMatch(opp, chem) {
  const cards = lineup(career);
  if (cards.length !== 11) {
    toast("Your XI is short a player");
    return;
  }
  oppMeta = opp;
  const home = userSide(cards, career.formation, chem.players, career.clubName);
  const away = opponentSide(opp);
  const requestedHalf = Number(new URLSearchParams(location.search).get("half"));
  const halfSeconds = requestedHalf >= 10 && requestedHalf <= 240 ? requestedHalf : 180;
  match = createMatch({
    seed: (Date.now() % 100000) + career.season.played * 17,
    halfSeconds,
    human: true,
    home,
    away,
    homeDiff: userMateDiff(),
    awayDiff: difficultyFor(career.division),
  });
  finished = false;
  paused = false;
  cam = createCamera();
  app.classList.add("match-mode");
  view.classList.add("bare");
  const fine = window.matchMedia("(pointer: fine)").matches;
  view.innerHTML = `
    <div class="match" id="match">
      <canvas id="pitch"></canvas>
      <button class="pause" type="button" id="pause">II</button>
      <div class="scorebug">
        <b id="us-abbr">NOR</b>
        <div class="clk"><b id="score">0-0</b><span id="clock">00:00</span></div>
        <b id="them-abbr">OPP</b>
      </div>
      <div class="who"><span id="who">Kickoff</span><span class="stam"><i id="stam"></i></span></div>
      <div class="stick" id="stick"><div class="knob" id="knob"></div></div>
      <div class="actions">
        <button class="act swap" type="button" data-act="switch">SWAP</button>
        <button class="act thru" type="button" data-act="through">THRU</button>
        <button class="act tackle" type="button" data-act="tackle">TACKLE</button>
        <button class="act pass" type="button" data-act="pass">PASS</button>
        <button class="act sprint" type="button" data-act="sprint">SPRINT</button>
        <button class="act shoot" type="button" data-act="shoot">SHOOT<span class="pow"><i id="pow"></i></span></button>
      </div>
      <div class="moverlay" id="moverlay" hidden></div>
      <div class="rotate" id="rotate" hidden>
        <div>
          <div class="mark" style="margin:0 auto 12px">FT</div>
          <h1>Turn sideways</h1>
          <p>Matches are played in landscape, with a thumb on each side.</p>
        </div>
      </div>
      ${fine ? `<p class="keys">Arrows or WASD move · J pass · K through · L shoot · Shift sprint · Space tackle · U swap</p>` : ""}
    </div>
  `;
  document.getElementById("us-abbr").textContent = home.abbr;
  document.getElementById("them-abbr").textContent = away.abbr;
  bindMatchInput();
  audio.unlock();
  audio.startCrowd();
  audio.setCrowd(0.018);
  lastT = performance.now();
  raf = requestAnimationFrame(loop);
}

function bindMatchInput() {
  const stick = document.getElementById("stick");
  const knob = document.getElementById("knob");
  const moveStick = (e) => {
    const rect = stick.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = e.clientX - cx;
    let dy = e.clientY - cy;
    const max = rect.width * 0.34;
    const mag = Math.hypot(dx, dy) || 1;
    const limit = Math.min(max, mag);
    dx = (dx / mag) * limit;
    dy = (dy / mag) * limit;
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    axes.x = dx / max;
    axes.y = -dy / max;
  };
  stick.addEventListener("pointerdown", (e) => {
    stickId = e.pointerId;
    stick.setPointerCapture(e.pointerId);
    moveStick(e);
  });
  stick.addEventListener("pointermove", (e) => {
    if (e.pointerId === stickId) moveStick(e);
  });
  const endStick = (e) => {
    if (e.pointerId !== stickId) return;
    stickId = null;
    knob.style.transform = "translate(0px, 0px)";
    axes.x = 0;
    axes.y = 0;
  };
  stick.addEventListener("pointerup", endStick);
  stick.addEventListener("pointercancel", endStick);

  view.querySelectorAll(".act").forEach((btn) => {
    const name = btn.dataset.act;
    btn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      btn.setPointerCapture(e.pointerId);
      btn.classList.add("on");
      held[name] = performance.now();
      audio.click();
      buzz(8);
      if (name === "pass") edges.pass = true;
      if (name === "through") edges.through = true;
      if (name === "switch") edges.switch = true;
      if (name === "shoot") axes.shoot = true;
      if (name === "sprint") axes.sprint = true;
    });
    const up = () => {
      btn.classList.remove("on");
      const dur = performance.now() - (held[name] || 0);
      held[name] = 0;
      if (name === "shoot") {
        axes.shoot = false;
        edges.shootRelease = true;
      }
      if (name === "sprint") axes.sprint = false;
      if (name === "tackle") {
        axes.contain = false;
        if (dur < 210) edges.tackle = true;
      }
    };
    btn.addEventListener("pointerup", up);
    btn.addEventListener("pointercancel", up);
  });
  document.getElementById("pause").onclick = () => {
    if (finished) return;
    paused = true;
    openPause();
  };
}

function loop(now) {
  raf = requestAnimationFrame(loop);
  if (!match) return;
  const dt = Math.min(0.05, (now - lastT) / 1000 || 0);
  lastT = now;
  const gated = window.matchMedia("(pointer: coarse)").matches && window.innerHeight > window.innerWidth + 30;
  const gate = document.getElementById("rotate");
  if (gate) gate.hidden = !gated;
  if (!gated && !paused && !finished) {
    if (held.tackle && performance.now() - held.tackle > 90) axes.contain = true;
    if (keys.has("Space") && performance.now() - (held.keyboardTackle || 0) > 90) axes.contain = true;
    const events = match.update(dt, consumeInput());
    for (const e of events) handleEvent(e);
    const phase = match.state.phase;
    if (phase === "ht") showBreak("half");
    if (phase === "ft") finishMatch(false);
    const attacking = match.state.ball.x > 70 ? 0.04 : 0.02;
    audio.setCrowd(attacking + crowdBoost * 0.06);
    crowdBoost = Math.max(0, crowdBoost - dt);
  }
  const canvas = document.getElementById("pitch");
  if (!canvas) return;
  const w = window.innerWidth;
  const h = window.innerHeight;
  drawMatch(canvas, match.state, cam, w, h);
  paintHud();
}

function paintHud() {
  if (!match) return;
  const s = match.state;
  const score = document.getElementById("score");
  const clock = document.getElementById("clock");
  if (!score) return;
  score.textContent = `${s.score[0]}-${s.score[1]}`;
  const secs = Math.min(s.half === 2 ? 90 : 45, s.minute);
  const whole = Math.floor(secs);
  const frac = Math.floor((secs - whole) * 60);
  const base = s.half === 2 ? 45 : 0;
  const showMin = Math.min(s.half === 2 ? 90 : 45, base + (s.halfElapsed / s.halfSeconds) * 45);
  const mm = Math.floor(showMin);
  const ss = Math.floor((showMin - mm) * 60);
  clock.textContent = `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  const focus = s.players.find((p) => p.id === s.focusId);
  const who = document.getElementById("who");
  const stam = document.getElementById("stam");
  if (who) {
    const hint = phaseHint(s);
    who.textContent = hint || (focus ? `${focus.num} ${focus.last} · ${focus.pos}` : "");
  }
  if (focus && stam) stam.style.width = `${Math.round(focus.stamina)}%`;
  const pow = document.getElementById("pow");
  if (pow) pow.style.width = `${Math.round((s.charge || 0) * 100)}%`;
  if (frac < 0) clock.textContent = clock.textContent;
}

function consumeInput() {
  syncKeys();
  const frame = {
    x: axes.x,
    y: axes.y,
    sprint: axes.sprint || keys.has("ShiftLeft") || keys.has("ShiftRight"),
    shoot: axes.shoot || keys.has("KeyL"),
    contain: axes.contain,
    pass: edges.pass,
    through: edges.through,
    shootRelease: edges.shootRelease,
    tackle: edges.tackle,
    switch: edges.switch,
  };
  edges.pass = edges.through = edges.shootRelease = edges.tackle = edges.switch = false;
  return frame;
}

function syncKeys() {
  let x = 0;
  let y = 0;
  if (keys.has("ArrowRight") || keys.has("KeyD")) x += 1;
  if (keys.has("ArrowLeft") || keys.has("KeyA")) x -= 1;
  if (keys.has("ArrowUp") || keys.has("KeyW")) y += 1;
  if (keys.has("ArrowDown") || keys.has("KeyS")) y -= 1;
  if (stickId == null && (x || y)) {
    const mag = Math.hypot(x, y) || 1;
    axes.x = x / mag;
    axes.y = y / mag;
  }
}

function onKey(e) {
  if (e.repeat) return;
  keys.add(e.code);
  if (!match || finished) return;
  if (e.code === "KeyJ") edges.pass = true;
  if (e.code === "KeyK") edges.through = true;
  if (e.code === "KeyU") edges.switch = true;
  if (e.code === "KeyL") axes.shoot = true;
  if (e.code === "Space") {
    held.keyboardTackle = performance.now();
    e.preventDefault();
  }
}

function onKeyUp(e) {
  keys.delete(e.code);
  if (e.code === "KeyL") {
    axes.shoot = false;
    edges.shootRelease = true;
  }
  if (e.code === "Space") {
    const dur = performance.now() - (held.keyboardTackle || 0);
    axes.contain = false;
    if (dur < 220) edges.tackle = true;
  }
  if ((e.code.startsWith("Arrow") || ["KeyA", "KeyW", "KeyS", "KeyD"].includes(e.code)) && stickId == null) {
    const still = ["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown", "KeyA", "KeyW", "KeyS", "KeyD"].some((k) => keys.has(k));
    if (!still) {
      axes.x = 0;
      axes.y = 0;
    }
  }
}

function phaseHint(s) {
  if (s.phase === "kickoff" || s.setKind === "kickoff") return "Kickoff · aim at a teammate, then pass";
  if (s.setKind === "throw") return "Throw-in · aim, then pass";
  if (s.setKind === "corner") return "Corner · aim a cross, or shoot";
  if (s.setKind === "goalkick") return "Goal kick · pass, or hold shoot to clear";
  if (s.setKind === "freekick") return "Free kick · pass or shoot";
  if (s.phase === "goal") return "Goal";
  return "";
}

function handleEvent(e) {
  if (!e) return;
  if (e.type === "goal") {
    audio.goal();
    crowdBoost = 1.4;
    buzz([28, 40, 80]);
    cam.shake = 12;
    document.getElementById("match")?.classList.add("flash");
    setTimeout(() => document.getElementById("match")?.classList.remove("flash"), 420);
  } else if (e.type === "save" || e.type === "post") {
    audio.save();
    buzz(16);
  } else if (e.type === "tackle") {
    audio.tackle();
    buzz(14);
  } else if (e.type === "shot") {
    audio.shot();
  } else if (e.type === "pass" || e.type === "clear") {
    audio.pass(e.kind);
  } else if (e.type === "kickoff" || e.type === "halftime" || e.type === "fulltime" || e.type === "offside" || e.type === "foul") {
    audio.whistle();
  } else if (e.type === "set") audio.kick();
}

function showBreak(kind) {
  const el = document.getElementById("moverlay");
  if (!el || !el.hidden) return;
  const s = match.state;
  const poss = s.poss[0] + s.poss[1] || 1;
  el.hidden = false;
  if (match) match.state.banner = { text: "", t: 0 };
  el.innerHTML = `
    <div class="mcard panel">
      <div class="kicker">${kind === "half" ? "Halftime" : "Pause"}</div>
      <div class="scoreline">${s.score[0]} – ${s.score[1]}</div>
      <p class="small muted">Shots ${s.stats[0].shots}-${s.stats[1].shots} · Possession ${Math.round((s.poss[0] / poss) * 100)}%</p>
      ${kind === "half" ? `<button class="btn" type="button" id="go2">Second half</button>` : `
        <div class="stack">
          <button class="btn" type="button" id="resume">Resume</button>
          <button class="btn ghost" type="button" id="forfeit">Forfeit</button>
        </div>`}
    </div>
  `;
  if (kind === "half") {
    document.getElementById("go2").onclick = () => {
      match.beginSecondHalf();
      el.hidden = true;
      audio.whistle();
    };
  }
}

function openPause() {
  const el = document.getElementById("moverlay");
  if (!el) return;
  const s = match.state;
  el.hidden = false;
  el.innerHTML = `
    <div class="mcard panel">
      <div class="kicker">Paused</div>
      <div class="scoreline">${s.score[0]} – ${s.score[1]}</div>
      <div class="stack">
        <button class="btn" type="button" id="resume">Resume</button>
        <button class="btn ghost" type="button" id="forfeit">Forfeit match</button>
      </div>
    </div>
  `;
  document.getElementById("resume").onclick = () => {
    if (match.state.phase === "ht") return;
    paused = false;
    el.hidden = true;
  };
  document.getElementById("forfeit").onclick = async () => {
    const ok = await confirmBox("Forfeit?", "Leaving now is a loss. You still collect the loss purse.");
    if (!ok) return;
    finishMatch(true);
  };
}

function finishMatch(forfeit) {
  if (finished || !match) return;
  finished = true;
  paused = true;
  const s = match.state;
  let us = s.score[0];
  let them = s.score[1];
  if (forfeit && us >= them) them = us + 1;
  const reward = applyResult(career, {
    us,
    them,
    forfeit,
    opp: oppMeta.club.name,
    abbr: oppMeta.club.abbr,
    clubId: oppMeta.club.id,
  });
  career = loadCareer();
  audio.stopCrowd();
  audio.whistle();
  if (match) match.state.banner = { text: "", t: 0 };
  const poss = s.poss[0] + s.poss[1] || 1;
  const scorers = s.scorers.map((g) => `${g.minute}' ${g.name}`).join(" · ") || "No goals";
  const div = DIVISIONS[career.division];
  const el = document.getElementById("moverlay");
  el.hidden = false;
  el.innerHTML = `
    <div class="mcard panel">
      <div class="kicker">${forfeit ? "Forfeit" : "Full time"}</div>
      <div class="scoreline">${us} – ${them}</div>
      <p>${escapeHtml(oppMeta.club.name)}</p>
      <p class="small muted">${escapeHtml(scorers)}</p>
      <p class="small">Shots ${s.stats[0].shots}-${s.stats[1].shots} · On target ${s.stats[0].onTarget}-${s.stats[1].onTarget} · Possession ${Math.round((s.poss[0] / poss) * 100)}%</p>
      <p><b>+${money(reward.coins)}</b> · ${reward.pts} pts${reward.promo ? ` · Promoted to ${div.name}` : ""}${reward.rel ? ` · Relegated to ${div.name}` : ""}</p>
      ${reward.bonus ? `<p class="small">Promotion purse +${money(reward.bonus)}</p>` : ""}
      <div class="stack">
        <button class="btn" type="button" id="to-packs">Open packs</button>
        <button class="btn ghost" type="button" id="to-squad">Squad</button>
        <button class="btn ghost" type="button" id="to-home">Home</button>
      </div>
    </div>
  `;
  document.getElementById("to-packs").onclick = () => show("packs");
  document.getElementById("to-squad").onclick = () => show("squad");
  document.getElementById("to-home").onclick = () => show("home");
}

function stopMatchLoop() {
  cancelAnimationFrame(raf);
  raf = 0;
  match = null;
  const sheet = document.getElementById("sheet");
  if (sheet) sheet.remove();
}

function miniCard(card) {
  return `<article class="pcard ${card.tier}" data-uid="${card.uid}">
    ${card.isNew ? `<span class="newdot">NEW</span>` : ""}
    <div class="ovr">${card.ovr}</div>
    <div class="pos">${card.pos}</div>
    <canvas width="180" height="140" data-face="${card.uid}"></canvas>
    <div class="pname">${escapeHtml(card.last)}</div>
    <div class="six">${statBits(card)}</div>
    <div class="clubline">${escapeHtml(card.clubName)}</div>
  </article>`;
}

function bigCard(card) {
  return `<article class="pcard lg ${card.tier}">
    <div class="ovr">${card.ovr}</div>
    <div class="pos">${card.pos}${card.tier === "crown" ? " · CROWN" : ""}</div>
    <canvas width="320" height="220" data-face="${card.uid}"></canvas>
    <div class="pname">${escapeHtml(card.name)}</div>
    <div class="six">${statBits(card)}</div>
    <div class="clubline">${escapeHtml(card.nation)}</div>
  </article>`;
}

function statBits(card) {
  return ["pac", "sho", "pas", "dri", "def", "phy"]
    .map((k) => `<span><b>${k.toUpperCase()}</b>${card.stats[k]}</span>`)
    .join("");
}

function bindFaces(root, players) {
  const map = new Map(players.filter(Boolean).map((p) => [p.uid || p.id, p]));
  root.querySelectorAll("canvas[data-face]").forEach((canvas) => {
    canvas._player = map.get(canvas.dataset.face);
  });
  paintFaces(root);
}

function chemNote(team) {
  const avg = team / 10;
  const mult = 0.92 + 0.12 * (avg / 10);
  const pct = Math.round((mult - 1) * 1000) / 10;
  const sign = pct > 0 ? "+" : "";
  return `Chemistry ${team}. Linked players reach ${sign}${pct}% of their card in the match.`;
}

function money(n) {
  return `${Number(n || 0).toLocaleString("en-US")} coins`;
}

function toast(message) {
  toastEl.textContent = message;
  toastEl.classList.add("show");
  clearTimeout(toastEl._t);
  toastEl._t = setTimeout(() => toastEl.classList.remove("show"), 2200);
}

function confirmBox(title, body) {
  const modal = document.getElementById("modal");
  document.getElementById("modal-title").textContent = title;
  document.getElementById("modal-body").textContent = body;
  modal.hidden = false;
  return new Promise((resolve) => {
    const yes = document.getElementById("modal-yes");
    const no = document.getElementById("modal-no");
    const close = (value) => {
      modal.hidden = true;
      yes.onclick = null;
      no.onclick = null;
      resolve(value);
    };
    yes.onclick = () => close(true);
    no.onclick = () => close(false);
  });
}

function renameFlow() {
  const modal = document.getElementById("modal");
  document.getElementById("modal-title").textContent = "Club name";
  document.getElementById("modal-body").innerHTML = `<input class="rename" id="namebox" maxlength="18" value="${escapeHtml(career.clubName)}">`;
  modal.hidden = false;
  const input = document.getElementById("namebox");
  input.focus();
  const yes = document.getElementById("modal-yes");
  const no = document.getElementById("modal-no");
  yes.textContent = "Save";
  const close = () => {
    modal.hidden = true;
    yes.textContent = "Confirm";
    yes.onclick = null;
    no.onclick = null;
    document.getElementById("modal-body").textContent = "";
  };
  yes.onclick = () => {
    if (renameClub(career, input.value)) {
      career = loadCareer();
      toast("Club renamed");
    }
    close();
    show("home");
  };
  no.onclick = () => {
    close();
  };
}

function buzz(pattern) {
  if (!career.settings.vibrate) return;
  if (navigator.vibrate) navigator.vibrate(pattern);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch]));
}
