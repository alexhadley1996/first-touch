const SKIN = ["#f6d7c3", "#e7b892", "#c68642", "#8d5524", "#6b3e26", "#3f2918"];
const HAIR = ["#161616", "#3a2a1c", "#7a4314", "#d9c39a", "#8d93a0", "#efe8dc"];

export function drawPortrait(ctx, player, w, h) {
  const port = player.portrait || { skin: 2, hair: 0, style: 1, beard: 0, eyes: 1 };
  const skin = SKIN[port.skin % SKIN.length];
  const hair = HAIR[port.hair % HAIR.length];
  const kit = player.kit || "#1a3f73";
  const kit2 = player.kit2 || "#e2b657";
  ctx.clearRect(0, 0, w, h);
  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, kit);
  bg.addColorStop(1, "#12100c");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = hexAlpha(kit2, 0.35);
  ctx.beginPath();
  ctx.moveTo(w * 0.42, 0);
  ctx.lineTo(w, 0);
  ctx.lineTo(w, h * 0.58);
  ctx.closePath();
  ctx.fill();

  const cx = w * 0.52;
  const headY = h * 0.42;
  const headR = w * 0.2;

  ctx.fillStyle = kit;
  ctx.beginPath();
  ctx.moveTo(w * 0.08, h);
  ctx.quadraticCurveTo(cx, h * 0.58, w * 0.92, h);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.fill();

  ctx.fillStyle = skin;
  ctx.fillRect(cx - w * 0.055, headY + headR * 0.72, w * 0.11, h * 0.2);

  ctx.fillStyle = kit2;
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.07, h * 0.74);
  ctx.lineTo(cx, h * 0.9);
  ctx.lineTo(cx + w * 0.07, h * 0.74);
  ctx.closePath();
  ctx.fill();

  if (port.style === 2) {
    ctx.fillStyle = hair;
    ctx.beginPath();
    ctx.arc(cx, headY - headR * 0.05, headR * 1.28, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.ellipse(cx - headR * 0.98, headY + headR * 0.05, headR * 0.16, headR * 0.26, 0, 0, Math.PI * 2);
  ctx.ellipse(cx + headR * 0.98, headY + headR * 0.05, headR * 0.16, headR * 0.26, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(cx, headY, headR, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.18)";
  ctx.lineWidth = Math.max(1, w * 0.01);
  ctx.stroke();

  drawHair(ctx, port.style, hair, cx, headY, headR, w);

  const eyeY = headY + headR * 0.02;
  const spread = headR * (0.32 + (port.eyes % 4) * 0.03);
  ctx.fillStyle = "#fbfaf6";
  ctx.beginPath();
  ctx.ellipse(cx - spread, eyeY, headR * 0.15, headR * 0.1, 0, 0, Math.PI * 2);
  ctx.ellipse(cx + spread, eyeY, headR * 0.15, headR * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1c140f";
  ctx.beginPath();
  ctx.arc(cx - spread + headR * 0.02, eyeY, headR * 0.065, 0, Math.PI * 2);
  ctx.arc(cx + spread + headR * 0.02, eyeY, headR * 0.065, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = hair;
  ctx.lineWidth = Math.max(1.5, headR * 0.09);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx - spread - headR * 0.12, eyeY - headR * 0.2);
  ctx.lineTo(cx - spread + headR * 0.16, eyeY - headR * 0.26);
  ctx.moveTo(cx + spread - headR * 0.16, eyeY - headR * 0.26);
  ctx.lineTo(cx + spread + headR * 0.12, eyeY - headR * 0.2);
  ctx.stroke();

  ctx.strokeStyle = "rgba(70,40,30,0.35)";
  ctx.lineWidth = Math.max(1, headR * 0.05);
  ctx.beginPath();
  ctx.moveTo(cx, eyeY + headR * 0.02);
  ctx.quadraticCurveTo(cx + headR * 0.12, eyeY + headR * 0.28, cx - headR * 0.02, eyeY + headR * 0.36);
  ctx.stroke();

  ctx.strokeStyle = "#7a403c";
  ctx.lineWidth = Math.max(1.25, headR * 0.06);
  ctx.beginPath();
  if (port.eyes % 2 === 0) ctx.arc(cx, eyeY + headR * 0.5, headR * 0.16, 0.2, Math.PI - 0.2);
  else {
    ctx.moveTo(cx - headR * 0.14, eyeY + headR * 0.52);
    ctx.lineTo(cx + headR * 0.14, eyeY + headR * 0.52);
  }
  ctx.stroke();

  if (port.beard) {
    ctx.fillStyle = hair;
    ctx.globalAlpha = port.beard === 1 ? 0.45 : 0.9;
    ctx.beginPath();
    if (port.beard === 3) {
      ctx.ellipse(cx, headY + headR * 0.72, headR * 0.72, headR * 0.55, 0, 0, Math.PI);
    } else {
      ctx.ellipse(cx, headY + headR * 0.78, headR * 0.42, headR * 0.34, 0, 0, Math.PI);
    }
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  if (player.tier === "crown" || player.special) {
    ctx.strokeStyle = "#f0d48a";
    ctx.lineWidth = Math.max(2, w * 0.015);
    ctx.strokeRect(w * 0.04, h * 0.04, w * 0.92, h * 0.92);
  }
}

function drawHair(ctx, style, color, cx, headY, r) {
  ctx.fillStyle = color;
  if (style === 6) return;
  ctx.beginPath();
  if (style === 0) {
    ctx.arc(cx, headY - r * 0.12, r * 0.92, Math.PI, Math.PI * 2);
    ctx.fill();
    return;
  }
  if (style === 1) {
    ctx.arc(cx, headY - r * 0.05, r * 1.02, Math.PI * 1.05, Math.PI * 1.95);
    ctx.quadraticCurveTo(cx + r * 0.2, headY - r * 0.1, cx - r * 0.2, headY - r * 0.55);
    ctx.fill();
    return;
  }
  if (style === 3) {
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.arc(cx + i * r * 0.32, headY - r * 0.72, r * 0.28, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }
  if (style === 4) {
    ctx.arc(cx, headY - r * 0.15, r, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(cx - r, headY - r * 0.2, r * 2, r * 0.38);
    return;
  }
  if (style === 5) {
    ctx.arc(cx, headY - r * 0.2, r * 0.95, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(cx - r * 0.18, headY - r * 0.2, r * 0.36, r * 1.3);
    return;
  }
  if (style === 7) {
    ctx.arc(cx - r * 0.1, headY - r * 0.15, r * 1.02, Math.PI * 0.9, Math.PI * 2.05);
    ctx.fill();
    return;
  }
  ctx.arc(cx, headY - r * 0.2, r * 0.98, Math.PI, Math.PI * 2);
  ctx.fill();
}

function hexAlpha(hex, a) {
  const n = parseInt(String(hex).replace("#", ""), 16);
  if (!Number.isFinite(n)) return `rgba(226,182,87,${a})`;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${a})`;
}

export function paintFaces(root) {
  if (!root) return;
  root.querySelectorAll("canvas[data-face]").forEach((canvas) => {
    const id = canvas.getAttribute("data-face");
    const data = canvas._player;
    if (!data) return;
    const ctx = canvas.getContext("2d");
    drawPortrait(ctx, data, canvas.width, canvas.height);
    canvas.dataset.painted = id || "1";
  });
}
