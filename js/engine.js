import { FORMATIONS } from "./formations.js";
import { makeRng, clamp, angNorm, dist } from "./rng.js";

export const PITCH_W = 105;
export const PITCH_H = 68;
export const GOAL_Y0 = (PITCH_H - 7.32) / 2;
export const GOAL_Y1 = GOAL_Y0 + 7.32;
const GRAV = 16;
const STEP = 1 / 60;

function emptyStats() {
  return {
    shots: 0,
    onTarget: 0,
    passes: 0,
    completed: 0,
    tackles: 0,
    saves: 0,
    goals: 0,
    fouls: 0,
    offsides: 0,
    corners: 0,
  };
}

function worldFromSlot(attack, sx, sy) {
  if (attack > 0) return { x: sx * PITCH_W, y: sy * PITCH_H };
  return { x: (1 - sx) * PITCH_W, y: (1 - sy) * PITCH_H };
}

function teamAttacking(m, sign) {
  return m.teams[0].attack === sign ? 0 : 1;
}

function ownGoalX(team) {
  return team.attack > 0 ? 0 : PITCH_W;
}

function nearestOppDist(m, p) {
  let best = 99;
  for (const o of m.players) {
    if (o.team === p.team) continue;
    const d = dist(o.x, o.y, p.x, p.y);
    if (d < best) best = d;
  }
  return best;
}

function nearestPlayer(m, x, y, pred) {
  let best = null;
  let bd = 1e9;
  for (const p of m.players) {
    if (pred && !pred(p)) continue;
    const d = dist(p.x, p.y, x, y);
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best;
}

function distPointToSeg(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const len2 = abx * abx + aby * aby || 1;
  let t = ((px - ax) * abx + (py - ay) * aby) / len2;
  t = clamp(t, 0, 1);
  return dist(px, py, ax + abx * t, ay + aby * t);
}

function inOwnBox(m, x, y, team) {
  const attack = m.teams[team].attack;
  const inX = attack > 0 ? x < 16.5 : x > PITCH_W - 16.5;
  const inY = y > (PITCH_H - 40.32) / 2 && y < (PITCH_H + 40.32) / 2;
  return inX && inY;
}

function inAttackBox(m, p) {
  const attack = m.teams[p.team].attack;
  const inX = attack > 0 ? p.x > PITCH_W - 16.5 : p.x < 16.5;
  const inY = p.y > (PITCH_H - 40.32) / 2 && p.y < (PITCH_H + 40.32) / 2;
  return inX && inY;
}

function maxSpeed(p, sprint, carrying) {
  let s = 5.2 + (p.stats.pac - 60) * 0.05;
  if (p.line === "gk") s *= 0.84;
  if (sprint && p.stamina > 1) s *= 1.26;
  if (p.stamina < 15) s *= 0.83;
  if (p.jockey) s *= 0.75;
  if (carrying) s *= 0.9 + p.stats.dri * 0.00085;
  return s;
}

/**
 * Create an 11v11 match.
 * input: { x, y, pass, through, shoot, shootRelease, sprint, tackle, contain, switch }
 * x is right-positive, y is screen-up-positive.
 * Home always attacks toward +x (the right).
 */
export function createMatch(opts) {
  const rng = makeRng(opts.seed ?? 1);
  const formHome = FORMATIONS[opts.home.formation || "433"];
  const formAway = FORMATIONS[opts.away.formation || "433"];
  const m = {
    players: [],
    teams: [makeTeam(opts.home, 1), makeTeam(opts.away, -1)],
    ball: {
      x: PITCH_W / 2,
      y: PITCH_H / 2,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      owner: null,
      lastTeam: 0,
      lastPlayerId: null,
      shot: null,
      pass: null,
      aerialDone: false,
    },
    score: [0, 0],
    scorers: [],
    stats: [emptyStats(), emptyStats()],
    poss: [0, 0],
    phase: "intro",
    setKind: null,
    half: 1,
    halfElapsed: 0,
    halfSeconds: opts.halfSeconds || 180,
    time: 0,
    acc: 0,
    human: !!opts.human,
    humanId: null,
    taker: null,
    takerSpot: null,
    setX: PITCH_W / 2,
    setY: PITCH_H / 2,
    setTimer: 0,
    introT: 1.05,
    goalT: 0,
    banner: { text: "", t: 0 },
    charge: 0,
    aim: 0,
    aimFresh: 0,
    hint: null,
    ping: null,
    focusId: null,
    minute: 0,
    presser: [null, null],
    chaser: [null, null],
    possession: 0,
    kickGrace: 0,
    lastKickerId: null,
    idle: 0,
    chain: 0,
    autoSwitchCd: 0,
    lastSwitch: -10,
    homeDiff: opts.homeDiff || { mistake: 0.14, press: 0.95, shoot: 0.92, pass: 0.9 },
    awayDiff: opts.awayDiff || { mistake: 0.12, press: 1, shoot: 1, pass: 1 },
    seed: opts.seed ?? 1,
  };

  buildPlayers(m, opts.home.players, 0, formHome);
  buildPlayers(m, opts.away.players, 1, formAway);
  resetPositions(m, 0);
  m.phase = "intro";
  m.introT = 1.05;

  function update(dt, input) {
    dt = clamp(dt || 0, 0, 0.05);
    m.acc += dt;
    const events = [];
    const inp = normInput(input);
    let first = true;
    let guard = 0;
    while (m.acc >= STEP && guard++ < 6) {
      const slice = first
        ? inp
        : {
            ...inp,
            pass: false,
            through: false,
            shootRelease: false,
            tackle: false,
            switch: false,
          };
      events.push(...step(slice, STEP));
      m.acc -= STEP;
      first = false;
    }
    return events;
  }

  function beginSecondHalf() {
    if (m.phase !== "ht") return;
    m.half = 2;
    m.halfElapsed = 0;
    for (const p of m.players) p.stamina = Math.min(100, p.stamina + 30);
    m.banner = { text: "", t: 0 };
    resetPositions(m, 1);
  }

  function step(input, dt) {
    const ev = [];
    m._ev = ev;
    m.time += dt;
    if (m.banner.t < 40) {
      m.banner.t -= dt;
      if (m.banner.t <= 0) m.banner.text = "";
    }
    if (m.aimFresh > 0) m.aimFresh -= dt;
    if (m.ping) {
      m.ping.t -= dt;
      if (m.ping.t <= 0) m.ping = null;
    }
    if (m.autoSwitchCd > 0) m.autoSwitchCd -= dt;
    if (m.kickGrace > 0) m.kickGrace -= dt;
    for (const p of m.players) {
      if (p.tackleCd > 0) p.tackleCd -= dt;
      if (p.kickLock > 0) p.kickLock -= dt;
      if (p.touch > 0) p.touch -= dt;
      if (p.runT > 0) p.runT -= dt;
      p.jockey = false;
    }

    if (m.phase === "ft") return ev;
    if (m.phase === "intro") {
      m.introT -= dt;
      if (m.introT <= 0) {
        resetPositions(m, 0);
        ev.push({ type: "kickoff" });
      }
      publish();
      return ev;
    }
    if (m.phase === "goal") {
      m.goalT -= dt;
      if (m.goalT <= 0) afterGoal();
      publish();
      return ev;
    }
    if (m.phase === "ht") {
      publish();
      return ev;
    }

    const clocking = m.phase === "play" || m.phase === "set" || m.phase === "kickoff";
    if (clocking) m.halfElapsed += dt;

    readAim(input);
    if (m.human && input.switch) manualSwitch();

    const human = humanPlayer();
    if (human && m.phase === "play" && input.tackle) tryTackle(human);

    if (input.shoot && actorIsHome()) m.charge = Math.min(1, m.charge + dt / 0.68);
    else if (!input.shootRelease) m.charge = 0;

    let kicked = false;
    if (input.shootRelease && actorIsHome()) {
      const power = m.charge < 0.08 ? 0.38 : 0.26 + m.charge * 0.74;
      m.charge = 0;
      kicked = humanKick("shoot", power);
    }
    if (!kicked && input.through && actorIsHome()) kicked = humanKick("through");
    if (!kicked && input.pass && actorIsHome()) kicked = humanKick("pass");

    if ((m.phase === "set" || m.phase === "kickoff") && m.taker) {
      m.setTimer += dt;
      const aiControlled = !(m.human && m.taker.team === 0);
      const wait = m.setKind === "kickoff" ? 0.55 : 0.75;
      if ((aiControlled && m.setTimer > wait) || (m.setTimer > 7.5 && m.taker.team === 0)) {
        aiTakeSet(m.taker);
      }
    }

    assignRoles();
    const targets = new Map();
    for (const p of m.players) targets.set(p, desired(p));
    alignBackLine(targets);

    for (const p of m.players) {
      if (p.lunging > 0) {
        p.lunging -= dt;
        p.vx *= Math.exp(-1.4 * dt);
        p.vy *= Math.exp(-1.4 * dt);
      } else if (p.isHuman && m.phase === "play") {
        driveHuman(p, input, dt);
      } else if (m.ball.owner === p && m.phase === "play" && p.line !== "gk") {
        p.thinkT -= dt;
        if (p.thinkT <= 0) {
          p.thinkT = 0.36 + rng() * 0.28;
          thinkOnBall(p);
        }
        if (m.ball.owner === p && m.phase === "play") {
          const ang = p.dribbleAng ?? (m.teams[p.team].attack > 0 ? 0 : Math.PI);
          steer(p, p.x + Math.cos(ang) * 5.5, p.y + Math.sin(ang) * 5.5, dt, p.sprinting && p.stamina > 12, 1);
        }
      } else if (m.ball.owner === p && p.line === "gk" && m.phase === "play") {
        doClear(p);
      } else {
        moveAI(p, targets.get(p), dt);
      }
      regen(p, dt);
      if (!(m.taker === p && (m.phase === "set" || m.phase === "kickoff"))) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
    }

    if (m.phase === "kickoff") holdKickoffLines();
    separate();
    clampPlayers();
    resolveLunges(ev);

    if (m.ball.owner && (m.phase === "play")) stickBall(dt);
    else if (m.phase === "set" || m.phase === "kickoff") pinSetBall();
    else if (!m.ball.owner) {
      const prev = flyBall(dt);
      if (m.ball.shot) m.ball.shot.age += dt;
      gkSave();
      deflectShot();
      const dead = checkDeadBall(prev);
      if (!dead) {
        aerial();
        tryPickup();
      }
    }

    if (m.ball.shot && m.ball.shot.age > 3.6) m.ball.shot = null;
    contact();
    watchdog();
    updatePoss(dt);
    maybeAutoSwitch(input);
    refreshHint();
    checkClock(ev);
    publish();
    return ev;
  }

  function publish() {
    m.minute = minuteNow();
    const focus = m.phase === "set" || m.phase === "kickoff" ? m.taker : humanPlayer();
    m.focusId = focus ? focus.id : m.humanId;
    m.hintId = m.hint ? m.hint.id : null;
  }

  function minuteNow() {
    const base = m.half === 2 ? 45 : 0;
    const add = (m.halfElapsed / m.halfSeconds) * 45;
    return Math.min(m.half === 2 ? 90 : 45, base + add);
  }

  function afterGoal() {
    if (m.halfElapsed >= m.halfSeconds - 0.05) {
      if (m.half === 1) whistleHalf();
      else finish();
      return;
    }
    const last = m.scorers[m.scorers.length - 1];
    const kick = last && last.team === 0 ? 1 : 0;
    resetPositions(m, kick);
  }

  function whistleHalf() {
    m.phase = "ht";
    banner("HALFTIME", 99);
    m._ev.push({ type: "halftime", score: m.score.slice() });
  }

  function finish() {
    m.phase = "ft";
    banner("FULL TIME", 99);
    m._ev.push({
      type: "fulltime",
      score: m.score.slice(),
      scorers: m.scorers.slice(),
      stats: m.stats,
      poss: m.poss.slice(),
    });
  }

  function checkClock(ev) {
    if (m.halfElapsed < m.halfSeconds) return;
    if (m.ball.shot && m.ball.shot.age < 1.8 && m.phase === "play") return;
    if (m.phase === "goal") return;
    if (m.half === 1) whistleHalf();
    else finish();
  }

  function humanPlayer() {
    return m.players.find((p) => p.isHuman) || null;
  }

  function actorIsHome() {
    if (m.phase === "set" || m.phase === "kickoff") return !!(m.taker && m.taker.team === 0 && m.human);
    return !!(m.ball.owner && m.ball.owner.isHuman);
  }

  function humanKick(kind, power) {
    const p = m.phase === "set" || m.phase === "kickoff" ? m.taker : m.ball.owner;
    if (!p || p.team !== 0) return false;
    if (kind === "shoot") {
      if (m.setKind === "throw" || m.setKind === "goalkick") {
        passIntoSpace(p, "clear");
        return true;
      }
      doShot(p, power ?? 0.6, m.aimFresh > 0 ? m.aim : null);
      return true;
    }
    const dir = m.aimFresh > 0 ? m.aim : m.teams[0].attack > 0 ? 0 : Math.PI;
    const mode = kind === "through" ? "through" : "ground";
    if (m.setKind === "corner" && kind === "through") {
      const attack = 1;
      launch(p, PITCH_W - 9, clamp(PITCH_H / 2 + (dir > 0 ? 4 : -4), 12, PITCH_H - 12), "lob", null);
      return true;
    }
    const rec = selectReceiver(p, dir, mode);
    if (rec) doPass(p, rec, mode === "through" ? "through" : m.setKind === "goalkick" ? "lob" : "ground");
    else passIntoSpace(p, mode === "through" ? "through" : "ground");
    return true;
  }

  function aiTakeSet(p) {
    const attack = m.teams[p.team].attack;
    const forward = attack > 0 ? 0 : Math.PI;
    if (m.setKind === "kickoff") {
      const mates = m.players
        .filter((q) => q.team === p.team && q !== p && q.line !== "gk")
        .sort((a, b) => dist(a.x, a.y, p.x, p.y) - dist(b.x, b.y, p.x, p.y));
      if (mates[0]) doPass(p, mates[Math.floor(rng() * Math.min(3, mates.length))], "ground");
      else passIntoSpace(p, "ground");
      return;
    }
    if (m.setKind === "corner") {
      const boxX = attack > 0 ? PITCH_W - 8.5 : 8.5;
      const ty = 28 + rng() * 12;
      launch(p, boxX, ty, "lob", null);
      return;
    }
    if (m.setKind === "freekick") {
      const goalX = attack > 0 ? PITCH_W : 0;
      const dGoal = Math.abs(goalX - p.x);
      if (dGoal < 32 && Math.abs(p.y - PITCH_H / 2) < 20 && rng() < 0.5) doShot(p, 0.7 + rng() * 0.2, null);
      else {
        const rec = selectReceiver(p, forward, "ground");
        if (rec) doPass(p, rec, "ground");
        else passIntoSpace(p, "ground");
      }
      return;
    }
    if (m.setKind === "goalkick") {
      const mates = m.players.filter((q) => q.team === p.team && q.line === "att");
      const rec = mates[Math.floor(rng() * mates.length)];
      if (rec && rng() < 0.55) launch(p, rec.x, rec.y, "lob", rec);
      else {
        const side = selectReceiver(p, forward, "through") || selectReceiver(p, forward, "ground");
        if (side) doPass(p, side, "lob");
        else passIntoSpace(p, "clear");
      }
      return;
    }
    const rec = selectReceiver(p, forward, "ground") || selectReceiver(p, forward + 0.8, "ground");
    if (rec) doPass(p, rec, "ground");
    else passIntoSpace(p, "ground");
  }

  function thinkOnBall(p) {
    if (p.touch > 0.04) {
      p.dribbleAng = dribbleAngle(p);
      p.sprinting = false;
      return;
    }
    const diff = p.team === 0 ? m.homeDiff : m.awayDiff;
    const attack = m.teams[p.team].attack;
    const goalX = attack > 0 ? PITCH_W : 0;
    const dGoal = dist(p.x, p.y, goalX, PITCH_H / 2);
    const press = nearestOppDist(m, p);
    const ownX = ownGoalX(m.teams[p.team]);
    const deep = Math.abs(p.x - ownX) < 26;
    if (deep && press < 6.5 && p.line !== "att") {
      if (rng() < 0.7) {
        doClear(p);
        return;
      }
    }
    const central = Math.abs(p.y - PITCH_H / 2) < (dGoal < 16 ? 12 : 16);
    let shootP = 0;
    if (dGoal < 14.5 && central) shootP = 0.64;
    else if (dGoal < 21 && central && press > 2.6) shootP = 0.24;
    else if (dGoal < 27 && Math.abs(p.y - PITCH_H / 2) < 8 && press > 6) shootP = 0.06;
    shootP *= diff.shoot * (0.72 + p.stats.sho / 220);
    if (rng() < diff.mistake) shootP *= 0.45;
    if (rng() < shootP && laneOk(p)) {
      doShot(p, dGoal < 16 ? 0.5 + rng() * 0.28 : 0.66 + rng() * 0.24, null);
      return;
    }
    const dir = Math.atan2((PITCH_H / 2 - p.y) * 0.45, goalX - p.x);
    if (rng() < 0.2 * diff.pass && press > 3 && p.line !== "def") {
      const thru = selectReceiver(p, dir, "through");
      if (thru) {
        doPass(p, thru, "through");
        return;
      }
    }
    const rec = selectReceiver(p, dir, "ground");
    let urge = press < 4.2 ? 0.72 : press < 8 ? 0.4 : 0.16;
    urge *= diff.pass;
    if (rng() < diff.mistake) urge *= 0.5;
    if (rec && rng() < urge) {
      doPass(p, rec, "ground");
      return;
    }
    if (press < 2.8 && rec) {
      doPass(p, rec, "ground");
      return;
    }
    p.dribbleAng = dribbleAngle(p);
    p.sprinting = press > 4.5 && p.stamina > 24 && Math.abs(goalX - p.x) > 12;
  }

  function dribbleAngle(p) {
    const goalX = m.teams[p.team].attack > 0 ? PITCH_W : 0;
    let dx = goalX - p.x;
    let dy = (PITCH_H / 2 - p.y) * 0.55;
    let nd = 1e9;
    let nearest = null;
    for (const o of m.players) {
      if (o.team === p.team) continue;
      const d = dist(o.x, o.y, p.x, p.y);
      if (d < nd) {
        nd = d;
        nearest = o;
      }
    }
    if (nearest && nd < 6.5) {
      dx += (p.x - nearest.x) * 1.15;
      dy += (p.y - nearest.y) * 1.15;
    }
    return Math.atan2(dy, dx);
  }

  function laneOk(p) {
    const goalX = m.teams[p.team].attack > 0 ? PITCH_W : 0;
    for (const o of m.players) {
      if (o.team === p.team || o.line === "gk") continue;
      const along = distPointToSeg(o.x, o.y, p.x, p.y, goalX, PITCH_H / 2);
      const d = dist(o.x, o.y, p.x, p.y);
      if (along < 1.35 && d < 7 && d > 1.1) return false;
    }
    return true;
  }

  function selectReceiver(p, dir, kind) {
    let best = null;
    let bestScore = -1e9;
    const attack = m.teams[p.team].attack;
    for (const mate of m.players) {
      if (mate === p || mate.line === "gk") continue;
      const dx = mate.x - p.x;
      const dy = mate.y - p.y;
      const d = Math.hypot(dx, dy);
      const minD = kind === "through" ? 7 : 4.2;
      const maxD = kind === "through" ? 40 : 30;
      if (d < minD || d > maxD) continue;
      const ang = Math.atan2(dy, dx);
      const diff = Math.abs(angNorm(ang - dir));
      const cone = kind === "through" ? 0.8 : 0.98;
      if (diff > cone) continue;
      const open = nearestOppDist(m, mate);
      const forward = (mate.x - p.x) * attack;
      let score = open * 1.25 + forward * 0.085 - diff * 4.6 - Math.abs(d - 13) * 0.03;
      if (kind === "through" && mate.line === "att") score += 2.4;
      if (isOffside(p, mate)) score -= 7;
      if (laneBlocker(p, mate)) score -= 3.2;
      if (score > bestScore) {
        bestScore = score;
        best = mate;
      }
    }
    return best;
  }

  function laneBlocker(a, b) {
    for (const o of m.players) {
      if (o.team === a.team) continue;
      if (distPointToSeg(o.x, o.y, a.x, a.y, b.x, b.y) < 1.55) return o;
    }
    return null;
  }

  function isOffside(passer, rec) {
    if (!rec || rec.team !== passer.team || rec.line === "gk") return false;
    if (m.setKind === "throw" || m.setKind === "goalkick" || m.setKind === "kickoff") return false;
    const attack = m.teams[passer.team].attack;
    const inOpp = attack > 0 ? rec.x > PITCH_W / 2 : rec.x < PITCH_W / 2;
    if (!inOpp) return false;
    const ahead = attack > 0 ? rec.x > m.ball.x - 0.2 : rec.x < m.ball.x + 0.2;
    if (!ahead) return false;
    let closer = 0;
    for (const o of m.players) {
      if (o.team === passer.team) continue;
      const oc = attack > 0 ? o.x > rec.x + 0.2 : o.x < rec.x - 0.2;
      if (oc) closer++;
    }
    return closer < 2;
  }

  function doPass(p, rec, kind) {
    if (!rec) {
      passIntoSpace(p, kind);
      return;
    }
    if ((kind === "ground" || kind === "through") && isOffside(p, rec)) {
      callOffside(rec);
      return;
    }
    let tx;
    let ty;
    if (kind === "through") {
      const attack = m.teams[p.team].attack;
      const lead = 7 + Math.min(7, dist(p.x, p.y, rec.x, rec.y) * 0.2);
      tx = clamp(rec.x + attack * lead, 2, PITCH_W - 2);
      ty = clamp(rec.y, 2, PITCH_H - 2);
      rec.runTarget = { x: tx, y: ty };
      rec.runT = 1.65;
      rec.sprinting = true;
    } else {
      tx = clamp(rec.x + rec.vx * 0.22, 1.5, PITCH_W - 1.5);
      ty = clamp(rec.y + rec.vy * 0.22, 1.5, PITCH_H - 1.5);
      rec.runTarget = { x: tx, y: ty };
      rec.runT = 1.2;
    }
    launch(p, tx, ty, kind, rec);
  }

  function passIntoSpace(p, kind) {
    const fallback = m.teams[p.team].attack > 0 ? 0 : Math.PI;
    const ang = m.aimFresh > 0 ? m.aim : p.dribbleAng ?? fallback;
    const lead = kind === "through" ? 20 : kind === "clear" ? 32 : 13;
    const tx = clamp(m.ball.x + Math.cos(ang) * lead, 2, PITCH_W - 2);
    const ty = clamp(m.ball.y + Math.sin(ang) * lead, 2, PITCH_H - 2);
    launch(p, tx, ty, kind === "ground" ? "ground" : kind, null);
  }

  function doClear(p) {
    const attack = m.teams[p.team].attack;
    const tx = clamp(p.x + attack * (24 + rng() * 22) + (rng() - 0.5) * 8, 1.2, PITCH_W - 1.2);
    const ty = clamp(4 + rng() * (PITCH_H - 8), 1.2, PITCH_H - 1.2);
    launch(p, tx, ty, "clear", null);
  }

  function launch(p, tx, ty, kind, rec) {
    const press = nearestOppDist(m, p);
    const dx = tx - m.ball.x;
    const dy = ty - m.ball.y;
    const d = Math.hypot(dx, dy) || 1;
    const errBase = (1 - p.stats.pas / 118) * (kind === "through" || kind === "clear" ? 0.2 : 0.12);
    const err = errBase + (press < 3 ? 0.07 : 0);
    const ang = Math.atan2(dy, dx) + (rng() - 0.5) * err;
    let sp = clamp(10 + d * 0.5, 12, 16.2 + p.stats.pas * 0.03);
    if (kind === "through") sp = clamp(sp + 3.2, 14, 21);
    if (kind === "clear" || kind === "lob") sp = clamp(15 + d * 0.18, 15, 23);
    if (kind === "throw") sp = clamp(9 + d * 0.35, 10, 16);
    m.ball.owner = null;
    p.touch = 0;
    m.ball.vx = Math.cos(ang) * sp;
    m.ball.vy = Math.sin(ang) * sp;
    if (kind === "lob" || kind === "clear" || kind === "throw") {
      const time = Math.max(0.4, d / sp);
      const arc = kind === "throw" ? 0.85 : kind === "clear" ? 0.5 : 0.7;
      m.ball.vz = 0.8 / time + 0.5 * GRAV * time * arc;
      m.ball.z = kind === "throw" ? 1.1 : 0.05;
    } else if (kind === "through") {
      m.ball.vz = 1.15;
      m.ball.z = 0;
    } else {
      m.ball.vz = 0.25;
      m.ball.z = 0;
    }
    m.ball.pass = rec ? { team: p.team, to: rec.id, kind } : { team: p.team, to: null, kind };
    m.ball.shot = null;
    m.ball.aerialDone = false;
    m.ball.lastTeam = p.team;
    m.ball.lastPlayerId = p.id;
    m.lastKickerId = p.id;
    m.kickGrace = 0.16;
    p.kickLock = 0.22;
    m.stats[p.team].passes++;
    if (rec) m.ping = { x: tx, y: ty, t: 0.55, team: p.team };
    m._ev.push({ type: kind === "clear" ? "clear" : "pass", kind, team: p.team });
    m.phase = "play";
    m.setKind = null;
    m.taker = null;
    m.chain = Math.max(0, m.chain - 1);
    if (rec && rec.runT > 0 && p.team === 0 && m.human) setHuman(rec);
    else if (rec && p.isHuman && p.team === 0) setHuman(rec);
  }

  function doShot(p, power, aimAngle) {
    power = clamp(power, 0.22, 1);
    const attack = m.teams[p.team].attack;
    const goalX = attack > 0 ? PITCH_W : 0;
    const press = nearestOppDist(m, p);
    const shotDist = Math.abs(goalX - m.ball.x);
    const distFactor = clamp(shotDist / 15, 0.62, 2.5);
    const err =
      (1 - p.stats.sho / 128) * (0.5 + power * 1.15) * distFactor +
      (press < 2.4 ? 0.42 : press < 4 ? 0.16 : 0) +
      (p.stamina < 20 ? 0.22 : 0) +
      (shotDist > 18 ? (shotDist - 18) * 0.055 : 0);
    let aimY = PITCH_H / 2;
    if (aimAngle != null) {
      const dx = Math.cos(aimAngle);
      const dy = Math.sin(aimAngle);
      const toward = attack > 0 ? dx : -dx;
      if (toward > 0.2) {
        const t = Math.abs(goalX - m.ball.x) / toward;
        aimY = m.ball.y + dy * t;
      } else aimY = PITCH_H / 2 + dy * 6;
    } else {
      aimY = PITCH_H / 2 + (rng() - 0.5) * 2.4 * (p.stats.sho / 90);
    }
    aimY += (rng() - 0.5) * err * 6.4;
    if (rng() < err * 0.38) aimY += (rng() < 0.5 ? -1 : 1) * (3.2 + rng() * 2.4);
    const dx = goalX - m.ball.x;
    const dy = aimY - m.ball.y;
    const d = Math.hypot(dx, dy) || 1;
    const sp = 17.5 + power * 12.5 + p.stats.sho * 0.03;
    m.ball.owner = null;
    p.touch = 0;
    m.ball.vx = (dx / d) * sp;
    m.ball.vy = (dy / d) * sp;
    const time = Math.max(0.28, d / sp);
    const targetZ = 0.45 + power * 0.9;
    m.ball.vz = targetZ / time + 0.5 * GRAV * time;
    m.ball.vz *= 1 + (rng() - 0.5) * err * 1.05;
    m.ball.z = 0.05;
    m.ball.shot = { team: p.team, power, sho: p.stats.sho, by: p, age: 0, resolved: false };
    m.ball.pass = null;
    m.ball.aerialDone = false;
    m.ball.lastTeam = p.team;
    m.ball.lastPlayerId = p.id;
    m.lastKickerId = p.id;
    m.kickGrace = 0.14;
    p.kickLock = 0.26;
    m.stats[p.team].shots++;
    m._ev.push({ type: "shot", team: p.team, power });
    m.phase = "play";
    m.setKind = null;
    m.taker = null;
  }

  function callOffside(rec) {
    m.stats[rec.team].offsides++;
    const other = rec.team === 0 ? 1 : 0;
    banner("OFFSIDE", 1.15);
    m._ev.push({ type: "offside", team: rec.team });
    startSet("freekick", other, clamp(rec.x, 2, PITCH_W - 2), clamp(rec.y, 3, PITCH_H - 3));
  }

  function tryTackle(p) {
    if (!p || p.tackleCd > 0 || p.line === "gk") return;
    p.tackleCd = 0.82;
    p.lunging = 0.2;
    const ang = m.aimFresh > 0 && p.isHuman ? m.aim : Math.atan2(m.ball.y - p.y, m.ball.x - p.x);
    p.facing = ang;
    p.vx += Math.cos(ang) * 10.5;
    p.vy += Math.sin(ang) * 10.5;
  }

  function resolveLunges(ev) {
    for (const p of m.players) {
      if (p.lunging <= 0) continue;
      const carrier = m.ball.owner;
      if (carrier && carrier.team !== p.team && dist(p.x, p.y, carrier.x, carrier.y) < 1.55 && dist(p.x, p.y, m.ball.x, m.ball.y) < 1.75) {
        const behind = fromBehind(p, carrier);
        let win =
          (p.stats.def * 0.62 + p.stats.phy * 0.42) /
          (p.stats.def * 0.62 + p.stats.phy * 0.42 + carrier.stats.dri * 0.72 + carrier.stats.phy * 0.36 + 8);
        if (behind) win *= 0.58;
        if (carrier.touch > 0) win += 0.1;
        if (carrier.sprinting) win += 0.16;
        if (rng() < win) {
          m.ball.owner = null;
          carrier.touch = 0;
          m.ball.vx = Math.cos(p.facing) * 6.5;
          m.ball.vy = Math.sin(p.facing) * 6.5;
          m.ball.vz = 0.15;
          m.ball.z = 0;
          m.ball.lastTeam = p.team;
          m.ball.lastPlayerId = p.id;
          m.ball.pass = null;
          m.ball.shot = null;
          m.kickGrace = 0.1;
          m.stats[p.team].tackles++;
          banner("TACKLE", 0.4);
          ev.push({ type: "tackle", team: p.team });
        } else if (behind && rng() < 0.5) {
          m.stats[p.team].fouls++;
          ev.push({ type: "foul", team: p.team });
          banner("FOUL", 1);
          startSet("freekick", carrier.team, clamp(carrier.x, 2.5, PITCH_W - 2.5), clamp(carrier.y, 3, PITCH_H - 3));
        }
        p.lunging = 0;
      } else if (!carrier && m.ball.z < 0.8 && dist(p.x, p.y, m.ball.x, m.ball.y) < 1.2 && m.kickGrace <= 0) {
        receive(p);
        p.lunging = 0;
      }
    }
  }

  function fromBehind(tackler, carrier) {
    const dx = tackler.x - carrier.x;
    const dy = tackler.y - carrier.y;
    const ang = Math.atan2(dy, dx);
    return Math.abs(angNorm(ang - (carrier.facing + Math.PI))) < 1.05;
  }

  function receive(p) {
    const spd = Math.hypot(m.ball.vx, m.ball.vy);
    const control = p.stats.dri / 100;
    const press = nearestOppDist(m, p);
    let heavy = clamp((spd - 12.5) / 16, 0, 0.42) * (1.08 - control);
    if (press < 1.7) heavy += 0.12 * (1 - control);
    if (p.line === "gk") heavy *= 0.25;
    const wasPass = m.ball.pass && m.ball.pass.team === p.team;
    if (rng() < heavy) {
      const attack = m.teams[p.team].attack;
      m.ball.vx = m.ball.vx * 0.42 + attack * 2.4;
      m.ball.vy *= 0.42;
      m.ball.owner = null;
      m.kickGrace = 0.08;
      m.ball.pass = null;
      m.ball.lastTeam = p.team;
      return;
    }
    m.ball.owner = p;
    m.ball.vx = 0;
    m.ball.vy = 0;
    m.ball.vz = 0;
    m.ball.z = 0;
    m.ball.lastTeam = p.team;
    m.ball.lastPlayerId = p.id;
    m.ball.shot = null;
    p.touch = 0.05 + (1 - control) * 0.14 + Math.min(0.12, spd / 110);
    if (wasPass) m.stats[p.team].completed++;
    m.ball.pass = null;
    m.possession = p.team;
    if (p.team === 0 && m.human && p.line !== "gk") setHuman(p);
  }

  function tryPickup() {
    if (m.ball.owner || m.kickGrace > 0 || m.ball.z > 1.05 || m.phase !== "play") return;
    const spd = Math.hypot(m.ball.vx, m.ball.vy);
    let best = null;
    let bd = 1e9;
    for (const p of m.players) {
      if (p.kickLock > 0) continue;
      if (p.id === m.lastKickerId && m.kickGrace > 0) continue;
      const d = dist(p.x, p.y, m.ball.x, m.ball.y);
      const reach = p.line === "gk" ? 1.65 : m.ball.pass ? 1.28 : 1.08;
      if (p.line === "gk" && m.ball.shot && spd > 7) continue;
      if (d < reach && d < bd) {
        if (spd > 14 && d > 0.62) continue;
        best = p;
        bd = d;
      }
    }
    if (best) receive(best);
  }

  function deflectShot() {
    if (!m.ball.shot || m.ball.owner || m.kickGrace > 0 || m.ball.z > 1.6) return;
    for (const p of m.players) {
      if (p.team === m.ball.shot.team || p.line === "gk") continue;
      if (dist(p.x, p.y, m.ball.x, m.ball.y) > 0.78) continue;
      m.ball.lastTeam = p.team;
      m.ball.lastPlayerId = p.id;
      const goalX = m.teams[p.team].attack > 0 ? 0 : PITCH_W;
      if (inOwnBox(m, p.x, p.y, p.team) && rng() < 0.7) {
        const wide = p.y < PITCH_H / 2 ? 4 : PITCH_H - 4;
        m.ball.vx = Math.sign(goalX - p.x || 1) * (18 + rng() * 6);
        m.ball.vy = (wide - m.ball.y) * 2.4;
      } else {
        m.ball.vx = m.ball.vx * 0.3 + (rng() - 0.5) * 8;
        m.ball.vy = m.ball.vy * 0.3 + (rng() - 0.5) * 8;
      }
      m.ball.vz = 1.1 + rng() * 1.4;
      m.ball.shot = null;
      m.kickGrace = 0.1;
      m._ev.push({ type: "deflect" });
      break;
    }
  }

  function gkSave() {
    const shot = m.ball.shot;
    if (!shot || shot.resolved || m.ball.z > 2.65) return;
    const def = shot.team === 0 ? 1 : 0;
    const gk = m.players.find((p) => p.team === def && p.line === "gk");
    if (!gk) return;
    if (!inOwnBox(m, m.ball.x, m.ball.y, def) && dist(gk.x, gk.y, m.ball.x, m.ball.y) > 3) return;
    const d = dist(gk.x, gk.y, m.ball.x, m.ball.y);
    const reach = 1.45 + gk.stats.def / 80 + gk.stats.phy / 220;
    if (d > reach) return;
    shot.resolved = true;
    m.stats[shot.team].onTarget++;
    let saveP = 0.34 + gk.stats.def / 170 - shot.power * 0.3 - (shot.sho - 72) / 240;
    if (d < reach * 0.55) saveP += 0.12;
    if (m.ball.z > 1.7) saveP -= 0.1;
    saveP = clamp(saveP, 0.08, 0.86);
    if (rng() < saveP) {
      m.stats[def].saves++;
      m._ev.push({ type: "save", team: def });
      banner("SAVE", 0.7);
      if (shot.power < 0.6 && rng() < 0.6) {
        m.ball.owner = gk;
        m.ball.vx = m.ball.vy = m.ball.vz = 0;
        m.ball.z = 0;
        m.ball.shot = null;
        m.ball.pass = null;
        m.ball.lastTeam = def;
        startSet("goalkick", def, m.teams[def].attack > 0 ? 9 : PITCH_W - 9, PITCH_H / 2 + (rng() - 0.5) * 6);
      } else {
        m.ball.shot = null;
        m.ball.lastTeam = def;
        m.kickGrace = 0.16;
        if (rng() < 0.34) {
          const line = m.teams[def].attack > 0 ? -0.2 : PITCH_W + 0.2;
          m.ball.vx = Math.sign(line - m.ball.x || 1) * (15 + rng() * 5);
          m.ball.vy = (m.ball.y < PITCH_H / 2 ? -1 : 1) * (12 + rng() * 4);
          m.ball.vz = 0.8;
        } else {
          m.ball.vx = (rng() - 0.5) * 9 + m.teams[def].attack * 5;
          m.ball.vy = (rng() - 0.5) * 11;
          m.ball.vz = 2 + rng() * 2;
        }
      }
    }
  }

  function aerial() {
    if (m.ball.owner || m.ball.aerialDone || m.ball.z < 0.5 || m.ball.z > 1.9 || m.ball.vz > 0.4) return;
    const near = m.players.filter((p) => dist(p.x, p.y, m.ball.x, m.ball.y) < 1.45 && p.line !== "gk");
    if (!near.length) return;
    near.sort((a, b) => b.stats.phy + b.stats.pac * 0.15 - (a.stats.phy + a.stats.pac * 0.15));
    const win = near[0];
    if (dist(win.x, win.y, m.ball.x, m.ball.y) > 1.2) return;
    m.ball.aerialDone = true;
    if (inAttackBox(m, win) && rng() < 0.5 + win.stats.sho / 400) {
      m.ball.x = win.x;
      m.ball.y = win.y;
      doShot(win, 0.46 + rng() * 0.2, null);
    } else receive(win);
  }

  function guidePass(dt) {
    const b = m.ball;
    if (!b.pass || !b.pass.to || b.shot || b.owner || b.z > 0.85) return;
    const rec = m.players.find((p) => p.id === b.pass.to);
    if (!rec || rec.team !== b.pass.team) return;
    const dx = rec.x + rec.vx * 0.15 - b.x;
    const dy = rec.y + rec.vy * 0.15 - b.y;
    const d = Math.hypot(dx, dy);
    if (d < 1.3 || d > 32) return;
    let blocker = 99;
    for (const o of m.players) {
      if (o.team === rec.team) continue;
      blocker = Math.min(blocker, dist(o.x, o.y, b.x, b.y));
    }
    if (blocker < Math.min(3.2, d * 0.45)) return;
    const desired = Math.atan2(dy, dx);
    const current = Math.atan2(b.vy, b.vx);
    const turn = clamp(angNorm(desired - current), -1.6 * dt, 1.6 * dt);
    const sp = Math.hypot(b.vx, b.vy);
    const ang = current + turn;
    b.vx = Math.cos(ang) * sp;
    b.vy = Math.sin(ang) * sp;
  }

  function flyBall(dt) {
    const b = m.ball;
    const prev = { x: b.x, y: b.y, z: b.z };
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.z += b.vz * dt;
    b.vz -= GRAV * dt;
    if (b.z <= 0) {
      b.z = 0;
      if (Math.abs(b.vz) > 1.5) b.vz *= -0.28;
      else b.vz = 0;
      b.aerialDone = false;
    }
    const drag = b.shot ? 0.12 : b.z > 0.3 ? 0.2 : 0.32;
    const damp = Math.exp(-drag * dt);
    b.vx *= damp;
    b.vy *= damp;
    if (b.z === 0 && !b.shot) {
      const sp = Math.hypot(b.vx, b.vy) || 1;
      const ns = Math.max(0, sp - 1.15 * dt);
      b.vx *= ns / sp;
      b.vy *= ns / sp;
    }
    guidePass(dt);
    return prev;
  }

  function stickBall(dt) {
    const p = m.ball.owner;
    const extra = (p.sprinting ? 1.05 : 0) + (p.touch > 0 ? 0.4 : 0) + (1 - p.stats.dri / 100) * 0.28;
    const off = 0.72 + extra;
    const tx = p.x + Math.cos(p.facing) * off;
    const ty = p.y + Math.sin(p.facing) * off;
    const k = Math.min(1, dt * 18);
    m.ball.x += (tx - m.ball.x) * k;
    m.ball.y += (ty - m.ball.y) * k;
    m.ball.z = 0;
    m.ball.vz = 0;
  }

  function pinSetBall() {
    m.ball.x = m.setX;
    m.ball.y = m.setY;
    m.ball.z = m.setKind === "throw" ? 1.05 : 0;
    m.ball.vx = m.ball.vy = m.ball.vz = 0;
    m.ball.owner = m.taker;
    if (m.taker) {
      m.taker.x = m.takerSpot.x;
      m.taker.y = m.takerSpot.y;
      m.taker.vx = 0;
      m.taker.vy = 0;
    }
  }

  function checkDeadBall(prev) {
    const b = m.ball;
    if (!Number.isFinite(b.x) || !Number.isFinite(b.y)) {
      dropCenter();
      return true;
    }
    for (const line of [0, PITCH_W]) {
      const crossed = line === 0 ? prev.x > 0 && b.x <= 0 : prev.x < PITCH_W && b.x >= PITCH_W;
      if (!crossed) continue;
      const t = (line - prev.x) / (b.x - prev.x || 1e-6);
      const y = prev.y + (b.y - prev.y) * t;
      const z = Math.max(0, prev.z + (b.z - prev.z) * t);
      const scoring = line === PITCH_W ? teamAttacking(m, 1) : teamAttacking(m, -1);
      if (y >= GOAL_Y0 && y <= GOAL_Y1 && z <= 2.44) {
        scoreGoal(scoring);
        return true;
      }
      const between = y >= GOAL_Y0 && y <= GOAL_Y1;
      const post =
        Math.abs(y - GOAL_Y0) < 0.55 ||
        Math.abs(y - GOAL_Y1) < 0.55 ||
        (between && z >= 2.3 && z <= 2.9);
      if (post && z < 3 && y > GOAL_Y0 - 0.8 && y < GOAL_Y1 + 0.8) {
        b.x = line === 0 ? 0.6 : PITCH_W - 0.6;
        b.y = clamp(y, 1, PITCH_H - 1);
        b.vx *= -0.42;
        b.vy += (rng() - 0.5) * 3;
        b.vz = Math.abs(b.vz) * 0.3;
        b.shot = null;
        banner("WOODWORK", 0.7);
        m._ev.push({ type: "post" });
        return true;
      }
      if (between && z > 2.44) banner("OVER", 0.6);
      else banner(b.lastTeam === scoring ? "WIDE" : "WIDE", 0.5);
      if (b.lastTeam === scoring) {
        const def = scoring === 0 ? 1 : 0;
        const gx = m.teams[def].attack > 0 ? 8.5 : PITCH_W - 8.5;
        startSet("goalkick", def, gx, clamp(y, 22, PITCH_H - 22));
      } else {
        startSet("corner", scoring, line === PITCH_W ? PITCH_W - 0.6 : 0.6, y < PITCH_H / 2 ? 0.7 : PITCH_H - 0.7);
      }
      return true;
    }
    if (b.y < -0.05 || b.y > PITCH_H + 0.05) {
      const team = b.lastTeam === 0 ? 1 : 0;
      const y = b.y < 0 ? 0.75 : PITCH_H - 0.75;
      startSet("throw", team, clamp(prev.x, 1.2, PITCH_W - 1.2), y);
      return true;
    }
    return false;
  }

  function scoreGoal(team) {
    m.score[team] += 1;
    const shooter = m.ball.shot?.by || m.players.find((p) => p.id === m.ball.lastPlayerId);
    const og = shooter && shooter.team !== team;
    const name = shooter ? `${shooter.last || shooter.name}${og ? " (OG)" : ""}` : "Goal";
    const minute = Math.max(1, Math.round(minuteNow()));
    m.scorers.push({ team, name, minute, og: !!og });
    m.stats[team].goals++;
    if (m.ball.shot && !m.ball.shot.resolved) m.stats[m.ball.shot.team].onTarget++;
    banner("GOAL", 2.4);
    m.phase = "goal";
    m.goalT = 2.25;
    m.ball.vx = m.ball.vy = m.ball.vz = 0;
    m.ball.owner = null;
    m.ball.shot = null;
    m._ev.push({ type: "goal", team, name, minute });
  }

  function startSet(kind, team, x, y) {
    m.chain += 1;
    if (m.chain > 7) {
      dropCenter();
      return;
    }
    if (kind === "corner") m.stats[team].corners++;
    const attack = m.teams[team].attack;
    let taker;
    if (kind === "goalkick") taker = m.players.find((p) => p.team === team && p.line === "gk");
    else taker = nearestPlayer(m, x, y, (p) => p.team === team && p.line !== "gk") || m.players.find((p) => p.team === team);
    m.phase = kind === "kickoff" ? "kickoff" : "set";
    m.setKind = kind;
    m.setX = x;
    m.setY = y;
    m.setTimer = 0;
    m.taker = taker;
    m.ball.owner = taker;
    m.ball.shot = null;
    m.ball.pass = null;
    m.ball.vx = m.ball.vy = m.ball.vz = 0;
    m.ball.lastTeam = team;
    const infieldX = kind === "throw" ? x : x + (kind === "corner" ? (attack > 0 ? -1.3 : 1.3) : 0);
    const infieldY = kind === "throw" ? (y < 2 ? y + 1.3 : y - 1.3) : y;
    m.takerSpot = { x: clamp(infieldX, 0.8, PITCH_W - 0.8), y: clamp(infieldY, 0.8, PITCH_H - 0.8) };
    if (taker) {
      taker.x = m.takerSpot.x;
      taker.y = m.takerSpot.y;
      taker.vx = 0;
      taker.vy = 0;
    }
    const label = kind === "throw" ? "THROW" : kind === "corner" ? "CORNER" : kind === "goalkick" ? "GOAL KICK" : kind === "freekick" ? "FREE KICK" : "";
    if (label) banner(label, 0.9);
    m._ev.push({ type: "set", kind, team });
    if (taker && taker.team === 0) {
      const mate = m.players.find((q) => q.team === 0 && q !== taker && q.line !== "gk");
      if (mate) m.aim = Math.atan2(mate.y - y, mate.x - x);
      m.aimFresh = 1.2;
    }
  }

  function dropCenter() {
    m.phase = "play";
    m.setKind = null;
    m.taker = null;
    m.chain = 0;
    m.ball.x = PITCH_W / 2;
    m.ball.y = PITCH_H / 2;
    m.ball.z = 0;
    m.ball.vx = m.ball.vy = m.ball.vz = 0;
    m.ball.owner = null;
    m.ball.shot = null;
  }

  function resetPositions(m2, kickTeam) {
    for (const p of m.players) {
      let sx = Math.min(p.slot.sx, p.team === kickTeam ? 0.47 : 0.45);
      let sy = p.slot.sy;
      const w = worldFromSlot(m.teams[p.team].attack, sx, sy);
      p.x = w.x;
      p.y = w.y;
      p.vx = 0;
      p.vy = 0;
      p.facing = m.teams[p.team].attack > 0 ? 0 : Math.PI;
      p.lunging = 0;
      p.touch = 0;
      p.runT = 0;
    }
    const taker =
      nearestPlayer(m, PITCH_W / 2, PITCH_H / 2, (p) => p.team === kickTeam && p.line === "mid") ||
      m.players.find((p) => p.team === kickTeam && p.line !== "gk");
    m.setX = PITCH_W / 2;
    m.setY = PITCH_H / 2;
    m.taker = taker;
    m.takerSpot = { x: PITCH_W / 2 - m.teams[kickTeam].attack * 1.4, y: PITCH_H / 2 };
    if (taker) {
      taker.x = m.takerSpot.x;
      taker.y = m.takerSpot.y;
      for (const mate of m.players) {
        if (mate === taker || mate.team !== kickTeam) continue;
        if (dist(mate.x, mate.y, taker.x, taker.y) < 3.4) {
          mate.y = clamp(mate.y + (mate.y >= taker.y ? 3.6 : -3.6), 4, PITCH_H - 4);
        }
      }
    }
    m.ball.x = m.setX;
    m.ball.y = m.setY;
    m.ball.z = 0;
    m.ball.vx = m.ball.vy = m.ball.vz = 0;
    m.ball.owner = taker;
    m.ball.lastTeam = kickTeam;
    m.ball.shot = null;
    m.ball.pass = null;
    m.phase = "kickoff";
    m.setKind = "kickoff";
    m.setTimer = 0;
    m.kickGrace = 0;
    m.chain = 0;
    if (m.human) {
      const start = m.players.find((p) => p.team === 0 && p.line === "mid") || m.players.find((p) => p.team === 0);
      setHuman(start);
    }
    const mate = m.players.find((q) => q.team === kickTeam && q !== taker && q.line !== "gk");
    if (mate && taker) m.aim = Math.atan2(mate.y - taker.y, mate.x - taker.x);
    m.aimFresh = 1;
  }

  function holdKickoffLines() {
    for (const p of m.players) {
      if (p === m.taker) continue;
      const attack = m.teams[p.team].attack;
      if (attack > 0 && p.x > PITCH_W / 2 - 0.8) p.x = PITCH_W / 2 - 0.8;
      if (attack < 0 && p.x < PITCH_W / 2 + 0.8) p.x = PITCH_W / 2 + 0.8;
    }
  }

  function assignRoles() {
    m.possession = m.ball.owner ? m.ball.owner.team : m.ball.lastTeam ?? 0;
    m.presser = [null, null];
    m.chaser = [null, null];
    if (!m.ball.owner && m.phase === "play") {
      for (const side of [0, 1]) {
        m.chaser[side] = nearestPlayer(m, m.ball.x + m.ball.vx * 0.25, m.ball.y + m.ball.vy * 0.25, (p) => p.team === side && p.line !== "gk");
      }
    }
    for (const side of [0, 1]) {
      if (m.possession === side) continue;
      let best = null;
      let bd = 1e9;
      for (const p of m.players) {
        if (p.team !== side || p.line === "gk" || p.isHuman) continue;
        const d = dist(p.x, p.y, m.ball.x, m.ball.y);
        if (d < bd) {
          bd = d;
          best = p;
        }
      }
      m.presser[side] = best;
    }
    for (const p of m.players) p.mark = null;
    for (const side of [0, 1]) {
      if (m.possession === side) continue;
      const markers = m.players.filter((p) => p.team === side && p !== m.presser[side] && !p.isHuman && (p.line === "def" || p.line === "mid"));
      const used = new Set();
      for (const mk of markers) {
        let best = null;
        let bs = 1e9;
        for (const th of m.players) {
          if (th.team === side || th.line === "gk" || used.has(th)) continue;
          const s = dist(mk.x, mk.y, th.x, th.y) + Math.abs((mk.slot?.sy || 0.5) - (th.slot?.sy || 0.5)) * 8;
          if (s < bs) {
            bs = s;
            best = th;
          }
        }
        if (best && bs < 26) {
          mk.mark = best;
          used.add(best);
        }
      }
    }
  }

  function desired(p) {
    if (p.runT > 0 && p.runTarget && m.possession === p.team) return p.runTarget;
    const team = m.teams[p.team];
    if (p.line === "gk") return gkTarget(p);
    if (!m.ball.owner && m.chaser[p.team] === p) {
      return {
        x: clamp(m.ball.x + m.ball.vx * 0.32, 1, PITCH_W - 1),
        y: clamp(m.ball.y + m.ball.vy * 0.32, 1, PITCH_H - 1),
      };
    }
    if (m.presser[p.team] === p && m.possession !== p.team) {
      if (m.ball.owner) return containPoint(p, m.ball.owner);
      return {
        x: clamp(m.ball.x + m.ball.vx * 0.3, 1, PITCH_W - 1),
        y: clamp(m.ball.y + m.ball.vy * 0.3, 1, PITCH_H - 1),
      };
    }
    if (p.mark && m.possession !== p.team && dist(p.mark.x, p.mark.y, m.ball.x, m.ball.y) < 34) {
      return markPoint(p, p.mark);
    }
    const attack = team.attack;
    const bsx = attack > 0 ? m.ball.x / PITCH_W : 1 - m.ball.x / PITCH_W;
    const bsy = attack > 0 ? m.ball.y / PITCH_H : 1 - m.ball.y / PITCH_H;
    let sx = p.slot.sx * 0.66 + bsx * 0.34;
    let sy = p.slot.sy * 0.82 + bsy * 0.18;
    const ours = m.possession === p.team;
    sx += ours ? 0.045 : -0.05;
    if (team.style === "press" && !ours) sx += 0.04;
    if (team.style === "counter" && !ours) sx -= 0.04;
    if (p.line === "def") sx = clamp(Math.min(sx, bsx - 0.02), 0.12, team.style === "press" ? 0.68 : 0.56);
    if (p.line === "mid") sx = clamp(sx, 0.22, 0.74);
    if (p.line === "att") {
      if (ours) sx = clamp(Math.max(sx, bsx + 0.08), 0.4, 0.86);
      else sx = clamp(sx - 0.03, 0.42, 0.76);
      if (!(p.runT > 0)) sx = Math.min(sx, offsideLine(p.team) + (m.possession === p.team ? 0.012 : -0.01));
    }
    sx = clamp(sx, 0.06, 0.9);
    sy = clamp(sy, 0.06, 0.94);
    return worldFromSlot(attack, sx, sy);
  }

  function offsideLine(attackTeam) {
    const attack = m.teams[attackTeam].attack;
    const xs = m.players.filter((p) => p.team !== attackTeam).map((p) => (attack > 0 ? p.x : PITCH_W - p.x));
    xs.sort((a, b) => b - a);
    const second = xs[1] ?? xs[0] ?? PITCH_W * 0.6;
    return second / PITCH_W;
  }

  function alignBackLine(targets) {
    for (const side of [0, 1]) {
      const defs = m.players.filter(
        (p) => p.team === side && p.line === "def" && !p.isHuman && m.presser[side] !== p && !p.mark
      );
      if (defs.length < 2) continue;
      const attack = m.teams[side].attack;
      const xs = defs.map((p) => targets.get(p).x);
      const lineX = attack > 0 ? Math.min(...xs) : Math.max(...xs);
      for (const p of defs) targets.get(p).x = lineX;
    }
  }

  function containPoint(p, carrier) {
    const gx = ownGoalX(m.teams[p.team]);
    const dx = gx - carrier.x;
    const dy = (PITCH_H / 2 - carrier.y) * 0.25;
    const d = Math.hypot(dx, dy) || 1;
    return {
      x: clamp(carrier.x + (dx / d) * 1.75, 1, PITCH_W - 1),
      y: clamp(carrier.y + (dy / d) * 1.75, 1, PITCH_H - 1),
    };
  }

  function markPoint(p, opp) {
    const gx = ownGoalX(m.teams[p.team]);
    const dx = gx - opp.x;
    const dy = PITCH_H / 2 - opp.y;
    const d = Math.hypot(dx, dy) || 1;
    return {
      x: clamp(opp.x + (dx / d) * 2.15, 1, PITCH_W - 1),
      y: clamp(opp.y + (dy / d) * 1.15, 1.2, PITCH_H - 1.2),
    };
  }

  function gkTarget(p) {
    const team = m.teams[p.team];
    const ownX = team.attack > 0 ? 1.5 : PITCH_W - 1.5;
    const center = PITCH_H / 2;
    const track = 0.4 + p.stats.def / 260;
    const y = center + (clamp(m.ball.y, GOAL_Y0 - 0.2, GOAL_Y1 + 0.2) - center) * track;
    const along = Math.abs(m.ball.x - ownX);
    const come = along < 24 ? Math.min(6, (24 - along) * 0.26) : 0;
    return { x: ownX + team.attack * come, y: clamp(y, GOAL_Y0 - 0.3, GOAL_Y1 + 0.3) };
  }

  function moveAI(p, target, dt) {
    if ((m.phase === "set" || m.phase === "kickoff") && p === m.taker) {
      p.vx = 0;
      p.vy = 0;
      return;
    }
    if (p.kickLock > 0) {
      p.vx *= Math.exp(-6 * dt);
      p.vy *= Math.exp(-6 * dt);
      return;
    }
    const d = dist(p.x, p.y, target.x, target.y);
    const chasing = m.chaser[p.team] === p || m.presser[p.team] === p || p.runT > 0;
    const sprint = p.stamina > 20 && chasing && d > 3.2;
    p.sprinting = sprint;
    steer(p, target.x, target.y, dt, sprint, 1);
    if (m.presser[p.team] === p && m.ball.owner && m.ball.owner.team !== p.team && m.phase === "play") {
      const dd = dist(p.x, p.y, m.ball.owner.x, m.ball.owner.y);
      if (dd < 1.85 && p.tackleCd <= 0) {
        const diff = p.team === 0 ? m.homeDiff : m.awayDiff;
        const rate = 1.35 * diff.press * (0.5 + p.stats.def / 140) * (m.ball.owner.sprinting ? 1.45 : 1);
        if (rng() < rate * dt) tryTackle(p);
      }
    }
  }

  function driveHuman(p, input, dt) {
    const mag = Math.hypot(input.x || 0, input.y || 0);
    if (input.tackle && p.tackleCd > 0) {
      /* already swung */
    }
    if (mag > 0.14) {
      const ang = Math.atan2(-(input.y || 0), input.x || 0);
      m.aim = ang;
      m.aimFresh = 0.4;
      const sprint = !!input.sprint && p.stamina > 1;
      p.sprinting = sprint;
      const carrying = m.ball.owner === p;
      const max = maxSpeed(p, sprint, carrying);
      const want = max * Math.min(1, (mag - 0.14) / 0.72);
      const tx = Math.cos(ang) * want;
      const ty = Math.sin(ang) * want;
      const k = Math.min(1, dt * (12 + p.stats.pac * 0.05 + (carrying ? p.stats.dri * 0.035 : 0)));
      p.vx += (tx - p.vx) * k;
      p.vy += (ty - p.vy) * k;
      p.facing = ang;
      p.runT = 0;
      return;
    }
    if (input.contain && m.ball.owner && m.ball.owner.team !== p.team) {
      p.jockey = true;
      p.sprinting = false;
      const t = containPoint(p, m.ball.owner);
      steer(p, t.x, t.y, dt, false, 0.78);
      p.facing = Math.atan2(m.ball.y - p.y, m.ball.x - p.x);
      return;
    }
    if (!m.ball.owner && m.chaser[0] === p) {
      const sprint = dist(p.x, p.y, m.ball.x, m.ball.y) > 6 && p.stamina > 18;
      p.sprinting = sprint;
      steer(p, m.ball.x + m.ball.vx * 0.25, m.ball.y + m.ball.vy * 0.25, dt, sprint, 1);
      return;
    }
    if (p.runT > 0 && p.runTarget) {
      p.sprinting = p.stamina > 12;
      steer(p, p.runTarget.x, p.runTarget.y, dt, p.sprinting, 1);
      return;
    }
    p.sprinting = false;
    p.vx *= Math.exp(-11 * dt);
    p.vy *= Math.exp(-11 * dt);
  }

  function steer(p, tx, ty, dt, sprint, speedMul) {
    const dx = tx - p.x;
    const dy = ty - p.y;
    const d = Math.hypot(dx, dy) || 1;
    let max = maxSpeed(p, sprint, m.ball.owner === p) * speedMul;
    if (d < 1.4) max *= Math.max(0.15, d / 1.4);
    const k = Math.min(1, dt * (10 + p.stats.pac * 0.04 + (m.ball.owner === p ? p.stats.dri * 0.04 : 0)));
    p.vx += ((dx / d) * max - p.vx) * k;
    p.vy += ((dy / d) * max - p.vy) * k;
    const sp = Math.hypot(p.vx, p.vy);
    const cap = p.lunging > 0 ? 13 : max * 1.08;
    if (sp > cap && sp > 0) {
      p.vx = (p.vx / sp) * cap;
      p.vy = (p.vy / sp) * cap;
    }
    if (sp > 0.4) p.facing = Math.atan2(p.vy, p.vx);
  }

  function regen(p, dt) {
    const moving = Math.hypot(p.vx, p.vy) > 3.1;
    if (p.sprinting && moving && p.stamina > 0) {
      const drain = 5.1 * (1.1 - p.stats.phy / 240);
      p.stamina -= dt * drain;
    } else p.stamina += dt * (p.line === "gk" ? 4.5 : 3.15);
    p.stamina = clamp(p.stamina, 0, 100);
    if (p.stamina <= 0) p.sprinting = false;
  }

  function separate() {
    for (let n = 0; n < 2; n++) {
      for (let i = 0; i < m.players.length; i++) {
        for (let j = i + 1; j < m.players.length; j++) {
          const a = m.players[i];
          const b = m.players[j];
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          let d = Math.hypot(dx, dy);
          const min = 0.92;
          if (d < min) {
            if (d < 0.001) {
              dx = 0.01;
              dy = 0;
              d = 0.01;
            }
            const push = (min - d) / 2;
            const ux = dx / d;
            const uy = dy / d;
            a.x -= ux * push;
            a.y -= uy * push;
            b.x += ux * push;
            b.y += uy * push;
          }
        }
      }
    }
  }

  function clampPlayers() {
    for (const p of m.players) {
      const pad = p.line === "gk" ? 0.35 : 0.7;
      p.x = clamp(p.x, pad, PITCH_W - pad);
      p.y = clamp(p.y, pad, PITCH_H - pad);
    }
  }

  function contact() {
    const c = m.ball.owner;
    if (!c || m.phase !== "play") return;
    for (const o of m.players) {
      if (o.team === c.team) continue;
      if (dist(o.x, o.y, c.x, c.y) < 0.92) {
        c.vx *= 0.92;
        c.vy *= 0.92;
      }
    }
  }

  function watchdog() {
    const b = m.ball;
    if (!b.owner && Math.hypot(b.vx, b.vy) < 0.3 && b.z < 0.15 && m.phase === "play") {
      m.idle += STEP;
      if (m.idle > 2.4) {
        const n = nearestPlayer(m, b.x, b.y);
        if (n) {
          const a = Math.atan2(n.y - b.y, n.x - b.x);
          b.vx = Math.cos(a) * 4.5;
          b.vy = Math.sin(a) * 4.5;
        }
        m.idle = 0;
      }
    } else m.idle = 0;
  }

  function updatePoss(dt) {
    if (m.phase !== "play" && m.phase !== "set" && m.phase !== "kickoff") return;
    const side = m.ball.owner ? m.ball.owner.team : m.ball.lastTeam;
    if (side === 0 || side === 1) m.poss[side] += dt;
  }

  function maybeAutoSwitch(input) {
    if (!m.human || m.phase !== "play" || m.possession === 0) return;
    if (m.autoSwitchCd > 0) return;
    const mag = Math.hypot(input.x || 0, input.y || 0);
    if (mag > 0.22) return;
    const h = humanPlayer();
    if (!h) return;
    const near = nearestPlayer(m, m.ball.x, m.ball.y, (p) => p.team === 0 && p.line !== "gk");
    if (!near || near === h) return;
    if (dist(h.x, h.y, m.ball.x, m.ball.y) > dist(near.x, near.y, m.ball.x, m.ball.y) + 10) {
      setHuman(near);
      m.autoSwitchCd = 1.8;
    }
  }

  function manualSwitch() {
    const h = humanPlayer();
    const mates = m.players
      .filter((p) => p.team === 0 && p.line !== "gk" && p !== h)
      .sort((a, b) => dist(a.x, a.y, m.ball.x, m.ball.y) - dist(b.x, b.y, m.ball.x, m.ball.y));
    if (!mates.length) return;
    if (m.time - m.lastSwitch < 1.1 && mates[1]) setHuman(mates[1]);
    else setHuman(mates[0]);
    m.lastSwitch = m.time;
    m.autoSwitchCd = 1.5;
  }

  function setHuman(p) {
    if (!m.human || !p || p.line === "gk" || p.team !== 0) return;
    for (const q of m.players) q.isHuman = false;
    p.isHuman = true;
    m.humanId = p.id;
  }

  function refreshHint() {
    m.hint = null;
    if (!m.human) return;
    const p = m.phase === "set" || m.phase === "kickoff" ? (m.taker && m.taker.team === 0 ? m.taker : null) : m.ball.owner && m.ball.owner.isHuman ? m.ball.owner : null;
    if (!p) return;
    const dir = m.aimFresh > 0 ? m.aim : m.teams[p.team].attack > 0 ? 0 : Math.PI;
    m.hint = selectReceiver(p, dir, "ground");
  }

  function readAim(input) {
    const mag = Math.hypot(input.x || 0, input.y || 0);
    if (mag > 0.18 && (m.phase === "set" || m.phase === "kickoff" || (m.ball.owner && m.ball.owner.isHuman))) {
      m.aim = Math.atan2(-(input.y || 0), input.x || 0);
      m.aimFresh = 0.45;
    }
  }

  function banner(text, time) {
    m.banner.text = text;
    m.banner.t = time;
  }

  function normInput(input) {
    const i = input || {};
    return {
      x: i.x || 0,
      y: i.y || 0,
      pass: !!i.pass,
      through: !!i.through,
      shoot: !!i.shoot,
      shootRelease: !!i.shootRelease,
      sprint: !!i.sprint,
      tackle: !!i.tackle,
      contain: !!i.contain,
      switch: !!i.switch,
    };
  }

  return { state: m, update, beginSecondHalf };
}

function makeTeam(src, attack) {
  return {
    name: src.name,
    abbr: src.abbr || src.name.slice(0, 3).toUpperCase(),
    attack,
    style: src.style || "direct",
    shirt: src.shirt,
    shirt2: src.shirt2 || src.shirt,
    shorts: src.shorts,
    number: src.number,
    gk: src.gk,
    gkNum: src.gkNum,
  };
}

function buildPlayers(m, list, team, formation) {
  list.forEach((src, i) => {
    const slot = formation.slots[i];
    const isGk = slot.line === "gk";
    m.players.push({
      id: src.id || `${team}-${i}`,
      name: src.name,
      last: src.last || src.name.split(" ").slice(-1)[0],
      pos: src.pos,
      num: src.num || src.number || i + 1,
      ovr: src.ovr,
      team,
      line: slot.line,
      slot,
      stats: src.stats,
      shirt: isGk ? m.teams[team].gk : m.teams[team].shirt,
      shirt2: isGk ? m.teams[team].gk : m.teams[team].shirt2,
      shorts: isGk ? m.teams[team].gk : m.teams[team].shorts,
      numColor: isGk ? m.teams[team].gkNum : m.teams[team].number,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      facing: attackFacing(m.teams[team].attack),
      stamina: 100,
      isHuman: false,
      touch: 0,
      lunging: 0,
      tackleCd: 0,
      kickLock: 0,
      thinkT: (i % 5) * 0.07,
      dribbleAng: 0,
      sprinting: false,
      jockey: false,
      runT: 0,
      runTarget: null,
      mark: null,
    });
  });
}

function attackFacing(attack) {
  return attack > 0 ? 0 : Math.PI;
}
