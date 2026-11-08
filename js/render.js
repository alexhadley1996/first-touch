import * as THREE from "../vendor/three.module.js";
import { PITCH_W, PITCH_H, GOAL_Y0, GOAL_Y1 } from "./engine.js";
import { clamp } from "./rng.js";

const OX = PITCH_W / 2;
const OZ = PITCH_H / 2;
const SKINS = [0xf3d0b8, 0xe0b08a, 0xc68642, 0x8d5524, 0x6b3f28, 0x3f2918];
const HAIR = [0x1a1a1a, 0x3b2a1c, 0x6b4423, 0xc4a574, 0x8d9098, 0xd8d2c8];

const _look = new THREE.Vector3();
const _pos = new THREE.Vector3();
const _shadow = new THREE.Vector3();

let renderer = null;
let scene = null;
let camera = null;
let boundCanvas = null;
let sun = null;
let athletes = new Map();
let ballMesh = null;
let ballShadow = null;
let focusRing = null;
let smoothReady = false;

const geo = {};

export function createCamera() {
  return { x: PITCH_W / 2, y: PITCH_H / 2 };
}

export function frameMetrics() {
  return { viewW: 64, viewH: 42 };
}

export function countInFrame(state, _w, _h, camX, camY) {
  const { viewW, viewH } = frameMetrics();
  let home = 0;
  let away = 0;
  for (const p of state.players) {
    if (Math.abs(p.x - camX) > viewW / 2 || Math.abs(p.y - camY) > viewH / 2) continue;
    if (p.team === 0) home += 1;
    else away += 1;
  }
  return { home, away, total: home + away, viewW, viewH };
}

export function drawMatch(canvas, state, _cam, w, h) {
  if (!canvas || w < 2 || h < 2) return;
  ensure(canvas);
  const dpr = Math.min(1.75, typeof devicePixelRatio === "number" ? devicePixelRatio : 1);
  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h, false);
  updateWorld(state);
  renderer.render(scene, camera);
}

function ensure(canvas) {
  if (renderer && boundCanvas === canvas) return;
  if (renderer) {
    renderer.dispose();
    renderer = null;
  }
  boundCanvas = canvas;
  athletes = new Map();
  smoothReady = false;
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07111c);
  scene.fog = new THREE.Fog(0x102033, 70, 190);
  camera = new THREE.PerspectiveCamera(42, 1, 0.2, 280);
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  buildGeometries();
  buildPitch();
  buildStadium();
  buildGoals();
  buildLights();
  ballMesh = makeBall();
  scene.add(ballMesh);
  ballShadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.42, 16),
    new THREE.MeshBasicMaterial({ color: 0x041008, transparent: true, opacity: 0.4, depthWrite: false })
  );
  ballShadow.rotation.x = -Math.PI / 2;
  ballShadow.position.y = 0.03;
  scene.add(ballShadow);
  focusRing = new THREE.Mesh(
    new THREE.RingGeometry(0.72, 0.9, 24),
    new THREE.MeshBasicMaterial({ color: 0xf0d48a, side: THREE.DoubleSide, transparent: true, opacity: 0.9 })
  );
  focusRing.rotation.x = -Math.PI / 2;
  focusRing.position.y = 0.04;
  scene.add(focusRing);
}

function buildGeometries() {
  geo.torso = new THREE.BoxGeometry(0.42, 0.52, 0.24);
  geo.head = new THREE.SphereGeometry(0.135, 14, 12);
  geo.hair = new THREE.SphereGeometry(0.142, 12, 8);
  geo.hip = new THREE.BoxGeometry(0.36, 0.2, 0.22);
  geo.upperLeg = new THREE.CapsuleGeometry(0.09, 0.28, 3, 6);
  geo.shin = new THREE.CapsuleGeometry(0.07, 0.28, 3, 6);
  geo.boot = new THREE.BoxGeometry(0.12, 0.08, 0.24);
  geo.upperArm = new THREE.CapsuleGeometry(0.055, 0.22, 2, 6);
  geo.fore = new THREE.CapsuleGeometry(0.045, 0.2, 2, 6);
  geo.sock = new THREE.CylinderGeometry(0.075, 0.07, 0.16, 8);
}

function std(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.72,
    metalness: opts.metalness ?? 0.02,
  });
}

function buildLights() {
  const hemi = new THREE.HemisphereLight(0xb7cbe0, 0x1c3a28, 0.85);
  scene.add(hemi);
  const fill = new THREE.AmbientLight(0x6e84a0, 0.35);
  scene.add(fill);
  sun = new THREE.DirectionalLight(0xfff3d6, 2.6);
  sun.position.set(-18, 28, 14);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 90;
  sun.shadow.camera.left = -28;
  sun.shadow.camera.right = 28;
  sun.shadow.camera.top = 22;
  sun.shadow.camera.bottom = -22;
  sun.shadow.bias = -0.0008;
  scene.add(sun);
  scene.add(sun.target);
  const spots = [
    [-58, 48],
    [58, 48],
    [-58, -48],
    [58, -48],
  ];
  for (const [x, z] of spots) {
    const poleMat = std(0xc5ccd4, { roughness: 0.35, metalness: 0.6 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 14, 6), poleMat);
    pole.position.set(x, 7, z);
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 0.28, 0.55),
      new THREE.MeshStandardMaterial({ color: 0xfff6df, emissive: 0xffe7b0, emissiveIntensity: 1.4, roughness: 0.3 })
    );
    head.position.set(x, 14.1, z);
    const spot = new THREE.SpotLight(0xfff4dd, 18, 120, 0.7, 0.45, 1);
    spot.position.set(x, 13.6, z);
    spot.target.position.set(0, 0, 0);
    scene.add(pole, head, spot, spot.target);
  }
}

function buildPitch() {
  const tex = pitchTexture();
  const grass = new THREE.Mesh(
    new THREE.PlaneGeometry(PITCH_W, PITCH_H),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92, metalness: 0 })
  );
  grass.rotation.x = -Math.PI / 2;
  grass.receiveShadow = true;
  scene.add(grass);
  const apron = new THREE.Mesh(
    new THREE.PlaneGeometry(PITCH_W + 36, PITCH_H + 28),
    std(0x163322, { roughness: 1 })
  );
  apron.rotation.x = -Math.PI / 2;
  apron.position.y = -0.02;
  apron.receiveShadow = true;
  scene.add(apron);
  const boardMat = new THREE.MeshStandardMaterial({ map: boardTexture(), roughness: 0.6 });
  const boardH = 1.15;
  const boards = [
    [0, -OZ - 2.2, PITCH_W + 4, 0],
    [0, OZ + 2.2, PITCH_W + 4, Math.PI],
    [-OX - 2.2, 0, PITCH_H + 4, Math.PI / 2],
    [OX + 2.2, 0, PITCH_H + 4, -Math.PI / 2],
  ];
  for (const [x, z, len, rot] of boards) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(len, boardH, 0.18), boardMat);
    mesh.position.set(x, boardH / 2, z);
    mesh.rotation.y = rot;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
}

function pitchTexture() {
  const c = document.createElement("canvas");
  c.width = 2048;
  c.height = Math.round(2048 * (PITCH_H / PITCH_W));
  const g = c.getContext("2d");
  const W = c.width;
  const H = c.height;
  const X = (m) => (m / PITCH_W) * W;
  const Y = (m) => (m / PITCH_H) * H;
  for (let i = 0; i < 14; i++) {
    g.fillStyle = i % 2 === 0 ? "#2e9a52" : "#176b38";
    g.fillRect((W / 14) * i, 0, W / 14 + 1, H);
  }
  const img = g.getImageData(0, 0, W, H);
  for (let p = 0; p < img.data.length; p += 16) {
    const n = (Math.random() - 0.5) * 18;
    img.data[p] = clamp(img.data[p] + n, 0, 255);
    img.data[p + 1] = clamp(img.data[p + 1] + n, 0, 255);
    img.data[p + 2] = clamp(img.data[p + 2] + n * 0.4, 0, 255);
  }
  g.putImageData(img, 0, 0);
  g.strokeStyle = "rgba(255,255,255,0.92)";
  g.lineWidth = Math.max(3, W * 0.004);
  g.strokeRect(X(0.4), Y(0.4), X(PITCH_W - 0.8), Y(PITCH_H - 0.8));
  g.beginPath();
  g.moveTo(X(PITCH_W / 2), Y(0.4));
  g.lineTo(X(PITCH_W / 2), Y(PITCH_H - 0.4));
  g.stroke();
  g.beginPath();
  g.arc(X(PITCH_W / 2), Y(PITCH_H / 2), X(9.15), 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = "rgba(255,255,255,0.92)";
  g.beginPath();
  g.arc(X(PITCH_W / 2), Y(PITCH_H / 2), X(0.28), 0, Math.PI * 2);
  g.fill();
  paintBox(g, X, Y, 0);
  paintBox(g, X, Y, PITCH_W);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function paintBox(g, X, Y, goalLine) {
  const left = goalLine < 1;
  const box = 16.5;
  const six = 5.5;
  const wide = 40.32;
  const narrow = 18.32;
  const y0 = (PITCH_H - wide) / 2;
  const s0 = (PITCH_H - narrow) / 2;
  const x = left ? 0.4 : PITCH_W - box;
  const sx = left ? 0.4 : PITCH_W - six;
  g.strokeRect(X(x), Y(y0), X(box), Y(wide));
  g.strokeRect(X(sx), Y(s0), X(six), Y(narrow));
  const spot = left ? 11 : PITCH_W - 11;
  g.beginPath();
  g.arc(X(spot), Y(PITCH_H / 2), X(0.22), 0, Math.PI * 2);
  g.fill();
}

function boardTexture() {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 128;
  const g = c.getContext("2d");
  g.fillStyle = "#101826";
  g.fillRect(0, 0, 1024, 128);
  g.strokeStyle = "#e2b657";
  g.lineWidth = 6;
  g.strokeRect(4, 4, 1016, 120);
  g.fillStyle = "#f0d48a";
  g.font = "700 54px sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("FIRST TOUCH    ·    ALDER    ·    SOLARA    ·    VESPERA    ·    NORDLICHT", 512, 66);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(2, 1);
  return tex;
}

function buildStadium() {
  const seat = seatTexture();
  const mat = new THREE.MeshStandardMaterial({ map: seat, roughness: 0.9 });
  const tiers = [
    { w: PITCH_W + 16, d: 7, h: 5, z: OZ + 8, y: 2.6 },
    { w: PITCH_W + 26, d: 8, h: 7, z: OZ + 15, y: 6 },
    { w: PITCH_W + 16, d: 7, h: 6.5, z: -OZ - 7.5, y: 3.4 },
    { w: PITCH_W + 26, d: 9, h: 9, z: -OZ - 15, y: 7.2 },
  ];
  for (const t of tiers) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(t.w, t.h, t.d), mat);
    mesh.position.set(0, t.y, t.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
  const endTiers = [
    { d: PITCH_H + 8, w: 7, h: 4, x: -OX - 12, y: 2.2 },
    { d: PITCH_H + 16, w: 7, h: 5.5, x: -OX - 18, y: 4.6 },
    { d: PITCH_H + 8, w: 7, h: 4, x: OX + 12, y: 2.2 },
    { d: PITCH_H + 16, w: 7, h: 5.5, x: OX + 18, y: 4.6 },
  ];
  for (const t of endTiers) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(t.w, t.h, t.d), mat);
    mesh.position.set(t.x, t.y, 0);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
  const roof = std(0x141a22, { roughness: 0.5, metalness: 0.3 });
  for (const z of [OZ + 20, -OZ - 20]) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(PITCH_W + 30, 0.35, 10), roof);
    mesh.position.set(0, 8.2, z);
    scene.add(mesh);
  }
}

function seatTexture() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 128;
  const g = c.getContext("2d");
  g.fillStyle = "#121820";
  g.fillRect(0, 0, 256, 128);
  const colors = ["#243044", "#c4493a", "#e2b657", "#1e7a52", "#8d2433", "#d7dee8", "#1a3f73", "#f4f1ea"];
  for (let i = 0; i < 900; i++) {
    g.fillStyle = colors[i % colors.length];
    g.globalAlpha = 0.55 + (i % 4) * 0.1;
    g.fillRect((i * 17) % 256, (i * 13) % 128, 3, 3);
  }
  g.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 2);
  return tex;
}

function buildGoals() {
  addGoal(0, -1);
  addGoal(PITCH_W, 1);
}

function addGoal(x, dir) {
  const white = std(0xf7f4ee, { roughness: 0.35, metalness: 0.25 });
  const postGeo = new THREE.CylinderGeometry(0.07, 0.07, 2.5, 8);
  for (const y of [GOAL_Y0, GOAL_Y1]) {
    const post = new THREE.Mesh(postGeo, white);
    post.position.set(x - OX, 1.25, y - OZ);
    post.castShadow = true;
    scene.add(post);
  }
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, GOAL_Y1 - GOAL_Y0, 8), white);
  bar.rotation.x = Math.PI / 2;
  bar.position.set(x - OX, 2.5, (GOAL_Y0 + GOAL_Y1) / 2 - OZ);
  bar.castShadow = true;
  scene.add(bar);
  const netMat = new THREE.MeshBasicMaterial({
    color: 0xf4f7fb,
    transparent: true,
    opacity: 0.28,
    wireframe: true,
    side: THREE.DoubleSide,
  });
  const depth = 1.8;
  const net = new THREE.Mesh(new THREE.BoxGeometry(depth, 2.44, GOAL_Y1 - GOAL_Y0), netMat);
  net.position.set(x - OX + dir * (depth / 2), 1.22, (GOAL_Y0 + GOAL_Y1) / 2 - OZ);
  scene.add(net);
}

function makeBall() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 128;
  const g = c.getContext("2d");
  g.fillStyle = "#f7f8fb";
  g.fillRect(0, 0, 256, 128);
  g.fillStyle = "#1c2430";
  g.beginPath();
  g.arc(128, 64, 22, 0, Math.PI * 2);
  g.fill();
  for (const [x, y] of [[70, 40], [186, 40], [70, 90], [186, 90], [128, 20], [128, 110]]) {
    g.beginPath();
    g.arc(x, y, 12, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.34, 20, 16),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.42, metalness: 0.04 })
  );
  mesh.castShadow = true;
  const patch = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0x1a1e26, roughness: 0.5 })
  );
  const spots = [
    [0, 0.22, 0.22],
    [0.2, 0.12, -0.18],
    [-0.2, 0.08, -0.16],
    [0.16, -0.16, 0.16],
    [-0.14, -0.18, 0.12],
  ];
  for (const [x, y, z] of spots) {
    const bit = patch.clone();
    bit.position.set(x, y, z);
    mesh.add(bit);
  }
  return mesh;
}

function hashId(id) {
  let h = 2166136261;
  const s = String(id || "p");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function makeAthlete(p) {
  const h = hashId(p.id);
  const skin = std(SKINS[h % SKINS.length], { roughness: 0.65 });
  const hairMat = std(HAIR[(h >> 4) % HAIR.length], { roughness: 0.8 });
  const shirt = std(p.shirt || 0x1a3f73, { roughness: 0.55 });
  const trim = std(p.shirt2 || 0xe2b657, { roughness: 0.5 });
  const shorts = std(p.shorts || 0xf4f1ea, { roughness: 0.7 });
  const sock = std(p.team === 0 ? 0xf4f1ea : 0x1c2430, { roughness: 0.8 });
  const boot = std(0x1a1c20, { roughness: 0.4 });
  const root = new THREE.Group();
  const hips = new THREE.Group();
  hips.position.y = 0.98;
  root.add(hips);
  const pelvis = new THREE.Mesh(geo.hip, shorts);
  pelvis.castShadow = true;
  hips.add(pelvis);
  const torso = new THREE.Mesh(geo.torso, shirt);
  torso.position.y = 0.36;
  torso.castShadow = true;
  hips.add(torso);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.08, 0.25), trim);
  stripe.position.y = 0.12;
  torso.add(stripe);
  const head = new THREE.Mesh(geo.head, skin);
  head.position.y = 0.72;
  head.castShadow = true;
  torso.add(head);
  const hair = new THREE.Mesh(geo.hair, hairMat);
  hair.scale.set(1, 0.55, 1);
  hair.position.y = 0.08;
  head.add(hair);
  const armL = limb(geo.upperArm, shirt, geo.fore, skin, -0.28, 0.18);
  const armR = limb(geo.upperArm, shirt, geo.fore, skin, 0.28, 0.18);
  torso.add(armL.pivot, armR.pivot);
  const legL = limb(geo.upperLeg, shorts, geo.shin, sock, -0.1, -0.08);
  const legR = limb(geo.upperLeg, shorts, geo.shin, sock, 0.1, -0.08);
  const bootL = new THREE.Mesh(geo.boot, boot);
  bootL.position.set(0, -0.4, 0.05);
  bootL.castShadow = true;
  legL.lower.add(bootL);
  const bootR = bootL.clone();
  legR.lower.add(bootR);
  hips.add(legL.pivot, legR.pivot);
  const shade = new THREE.Mesh(
    new THREE.CircleGeometry(0.48, 14),
    new THREE.MeshBasicMaterial({ color: 0x031008, transparent: true, opacity: 0.38, depthWrite: false })
  );
  shade.rotation.x = -Math.PI / 2;
  shade.position.y = 0.025;
  root.add(shade);
  root.scale.setScalar(1.12);
  root.userData = { hips, torso, head, armL, armR, legL, legR };
  scene.add(root);
  return root;
}

function limb(upperGeo, upperMat, lowerGeo, lowerMat, x, y) {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, 0);
  const upper = new THREE.Mesh(upperGeo, upperMat);
  upper.position.y = -0.2;
  upper.castShadow = true;
  pivot.add(upper);
  const lowerPivot = new THREE.Group();
  lowerPivot.position.y = -0.36;
  const lower = new THREE.Mesh(lowerGeo, lowerMat);
  lower.position.y = -0.16;
  lower.castShadow = true;
  lowerPivot.add(lower);
  upper.add(lowerPivot);
  return { pivot, upper, lower: lowerPivot };
}

function updateWorld(state) {
  const ball = state.ball;
  const seen = new Set();
  for (const p of state.players) {
    seen.add(p.id);
    let actor = athletes.get(p.id);
    if (!actor) {
      actor = makeAthlete(p);
      athletes.set(p.id, actor);
    }
    poseAthlete(actor, p, state);
  }
  for (const [id, actor] of athletes) {
    if (!seen.has(id)) {
      scene.remove(actor);
      athletes.delete(id);
    }
  }
  const lift = Math.max(0, ball.z || 0);
  ballMesh.position.set(ball.x - OX, 0.28 + lift, ball.y - OZ);
  ballMesh.rotation.z -= (ball.vx || 0) * 0.02;
  ballMesh.rotation.x += (ball.vy || 0) * 0.02;
  ballShadow.position.set(ball.x - OX, 0.03, ball.y - OZ);
  ballShadow.scale.setScalar(1 + lift * 0.35);
  ballShadow.material.opacity = clamp(0.45 - lift * 0.08, 0.08, 0.45);
  const focus = state.players.find((p) => p.id === state.focusId);
  if (focus) {
    focusRing.visible = true;
    focusRing.position.set(focus.x - OX, 0.04, focus.y - OZ);
  } else focusRing.visible = false;

  _look.set(ball.x - OX + clamp(ball.vx || 0, -6, 6) * 0.18, 0.4, ball.y - OZ);
  _pos.set(_look.x - 1.2, 19.5, _look.z + 31);
  if (!smoothReady) {
    camera.position.copy(_pos);
    sun.position.set(_look.x - 16, 26, _look.z + 10);
    smoothReady = true;
  }
  camera.position.lerp(_pos, 0.12);
  camera.lookAt(_look.x, 0.8, _look.z);
  sun.position.lerp(_shadow.set(_look.x - 16, 26, _look.z + 10), 0.08);
  sun.target.position.set(_look.x, 0, _look.z);
  sun.target.updateMatrixWorld();
}

function poseAthlete(root, p, state) {
  root.position.set(p.x - OX, 0, p.y - OZ);
  root.rotation.y = Math.PI / 2 - (p.facing || 0);
  const speed = Math.hypot(p.vx || 0, p.vy || 0);
  const moving = speed > 0.8;
  const phase = (state.time || 0) * (7 + speed * 0.9) + hashId(p.id) * 0.01;
  const swing = moving ? Math.sin(phase) * clamp(speed / 6.5, 0.25, 1) : 0;
  const { legL, legR, armL, armR, torso, hips } = root.userData;
  const kicking = (p.kickLock || 0) > 0;
  const lunging = (p.lunging || 0) > 0;
  legL.pivot.rotation.x = kicking ? -1.1 : swing * 0.9;
  legR.pivot.rotation.x = kicking ? 0.4 : -swing * 0.9;
  legL.lower.rotation.x = moving ? 0.45 + Math.max(0, -swing) * 0.55 : 0.12;
  legR.lower.rotation.x = moving ? 0.45 + Math.max(0, swing) * 0.55 : 0.12;
  armL.pivot.rotation.x = kicking ? 0.6 : -swing * 0.7;
  armR.pivot.rotation.x = kicking ? -0.4 : swing * 0.7;
  torso.rotation.x = lunging ? 0.7 : moving ? 0.12 : 0.04;
  hips.position.y = 0.98 + (moving ? Math.abs(Math.sin(phase * 2)) * 0.035 : 0);
  if (p.line === "gk" && state.ball.shot && Math.hypot(p.x - state.ball.x, p.y - state.ball.y) < 6) {
    const side = state.ball.y > p.y ? 1 : -1;
    torso.rotation.z = side * 0.7;
    armL.pivot.rotation.z = 0.8;
    armR.pivot.rotation.z = -0.8;
  } else {
    torso.rotation.z = 0;
    armL.pivot.rotation.z = 0.55;
    armR.pivot.rotation.z = -0.55;
  }
  root.rotation.z = 0;
}
