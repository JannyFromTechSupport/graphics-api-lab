/* 
  TVA GLITCH — HTML5 Canvas Graphics API Game 
  by Janny Jonyo. Inspired by Marvel's Loki series. 
  
  [APPLICATION]: Game logic, input, physics, collision
  [GEOMETRY]: Transforms (translate, rotate, scale) on all objects
  [RASTERISATION]: Pixel-level drawing: transparency, layering, effects
*/

// Canvas Setup 

const bgCanvas = document.getElementById("canvas-bg");
const gameCanvas = document.getElementById("canvas-game");
const fxCanvas = document.getElementById("canvas-fx");
const bgCtx = bgCanvas.getContext("2d");
const gCtx = gameCanvas.getContext("2d");
const fxCtx = fxCanvas.getContext("2d");

let W = 800, H = 550;

function resizeCanvas() {
  const wrap = document.getElementById("canvas-wrap");
  const rect = wrap.getBoundingClientRect();
  W = Math.round(rect.width);
  H = Math.round(rect.height);
  [bgCanvas, gameCanvas, fxCanvas].forEach(c => {
    c.width = W;
    c.height = H;
    c.style.width = "100%";
    c.style.height = "100%";
  });
  drawBackground();
}

globalThis.addEventListener("resize", resizeCanvas);
globalThis.addEventListener("orientationchange", resizeCanvas);
document.addEventListener("DOMContentLoaded", resizeCanvas);

// Audio Engine (Web Audio API) 
let audioCtx = null,
  muted = false;

function initAudio() {
  if (audioCtx) return;
  const AudioCtx = globalThis.AudioContext || globalThis.webkitAudioContext;
  audioCtx = new AudioCtx();
}

function playTone(freq, type, duration, volume = 0.15, startTime = 0) {
  if (muted || !audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.type = type;
  osc.frequency.setValueAtTime(freq, audioCtx.currentTime + startTime);
  gain.gain.setValueAtTime(volume, audioCtx.currentTime + startTime);
  gain.gain.exponentialRampToValueAtTime(
    0.001,
    audioCtx.currentTime + startTime + duration,
  );
  osc.start(audioCtx.currentTime + startTime);
  osc.stop(audioCtx.currentTime + startTime + duration + 0.01);
}

function playCollect() {
  // Ascending TVA-theme arpeggio 
  playTone(440, "sine", 0.1, 0.2, 0);
  playTone(554, "sine", 0.1, 0.2, 0.08);
  playTone(659, "sine", 0.15, 0.25, 0.16);
}

function playPrune() {
  playTone(200, "sawtooth", 0.4, 0.3, 0);
  playTone(150, "sawtooth", 0.4, 0.3, 0.1);
  playTone(100, "square", 0.5, 0.3, 0.2);
}

function playWave() {
  [523, 659, 784, 1047].forEach((f, i) =>
    playTone(f, "triangle", 0.2, 0.2, i * 0.1),
  );
}

function playTick() {
  playTone(1200, "square", 0.03, 0.08);
}

// Game State 
// [APPLICATION STAGE] — All state managed here before geometry/rasterisation 
const state = {
  phase: "start", // 'start' | 'playing' | 'paused' | 'over'
  score: 0,
  lives: 3,
  wave: 1,
  crystalsCaught: 0,
  crystalsPerWave: 5,
  frameCount: 0,
  tickTimer: 0,
  glitchTimer: 0,
  shakeX: 0,
  shakeY: 0,
};

// Input 
const keys = {};
document.addEventListener("keydown", (e) => {
  keys[e.key] = true;
  if (e.key === "p" || e.key === "P") togglePause();
  if (e.key === "m" || e.key === "M") muted = !muted;
  e.preventDefault();
});
document.addEventListener("keyup", (e) => {
  keys[e.key] = false;
});

function bindTouchControls() {
  const movementButtons = document.querySelectorAll("#touch-controls .tc-btn[data-key]");

  movementButtons.forEach((btn) => {
    const key = btn.dataset.key;
    if (!key) return;

    let activePointerId = null;

    const press = (e) => {
      e.preventDefault();
      activePointerId = e.pointerId;
      btn.setPointerCapture(e.pointerId);
      keys[key] = true;
      btn.classList.add("is-pressed");
    };

    const release = (e) => {
      e.preventDefault();
      if (activePointerId !== null && e.pointerId !== activePointerId) return;
      activePointerId = null;
      keys[key] = false;
      btn.classList.remove("is-pressed");
    };

    btn.addEventListener("pointerdown", press);
    btn.addEventListener("pointerup", release);
    btn.addEventListener("pointercancel", release);
  });
}

// Variant (Player) 
// Object 1: The Variant — geometric object with movement transforms
const variant = {
  x: 400,
  y: 275,
  vx: 0,
  vy: 0,
  speed: 3.2,
  radius: 14,
  angle: 0, // [GEOMETRY] rotation angle, updated each frame
  trail: [], // [RASTERISATION] motion trail for layering effect
  invincible: 0, // frames of invincibility after being hit
};

// Ms. Minutes 
// Object 2: Ms. Minutes — clock-face enemy with rotation & pursuit AI
const msMins = {
  x: 100,
  y: 100,
  vx: 1.2,
  vy: 0.8,
  speed: 1.2,
  radius: 26,
  angle: 0, // [GEOMETRY] rotates her clock hands over time
  handAngle: 0, // inner clock hand rotation
  pulseScale: 1.0, // [GEOMETRY] scale pulsing
  pulseDir: 1,
  warningFlash: 0, // [RASTERISATION] red flash when close to player
  corruptAura: 0, // aura radius growth for rasterisation stage
};

// Time Crystals 
// Object 3: Collectibles — rotating, pulsing hexagons with alpha layers 
let crystals = [];

function spawnCrystal() {
  let cx, cy;
  do {
    cx = 60 + Math.random() * (W - 120);
    cy = 60 + Math.random() * (H - 120);
  } while (dist(cx, cy, variant.x, variant.y) < 100);
  crystals.push({
    x: cx,
    y: cy,
    angle: Math.random() * Math.PI * 2, // [GEOMETRY] starting rotation
    scale: 0, // starts at 0, animates in [GEOMETRY] scale transform
    scaleTarget: 1,
    pulseT: Math.random() * Math.PI * 2, // phase offset for pulsing
    alpha: 0, // [RASTERISATION] fades in
    collected: false,
    collectAnim: 0,
  });
}

// TVA Drones 
// Object 4: Triangle-shaped TVA drones that patrol and appear in later waves
let drones = [];

function spawnDrone() {
  const side = Math.floor(Math.random() * 4);
  let dx, dy;
  if (side === 0) {
    dx = Math.random() * W;
    dy = -20;
  } else if (side === 1) {
    dx = W + 20;
    dy = Math.random() * H;
  } else if (side === 2) {
    dx = Math.random() * W;
    dy = H + 20;
  } else {
    dx = -20;
    dy = Math.random() * H;
  }
  drones.push({
    x: dx,
    y: dy,
    angle: 0, // [GEOMETRY] heading angle, rotated toward player
    speed: 0.8 + state.wave * 0.15,
    radius: 12,
    alpha: 0,
  });
}

// Particles 
// [RASTERISATION] — particle system for visual effects
let particles = [];

function spawnParticles(x, y, color, count = 12, speed = 3) {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    particles.push({
      x,
      y,
      vx: Math.cos(a) * speed * (0.5 + Math.random()),
      vy: Math.sin(a) * speed * (0.5 + Math.random()),
      radius: 2 + Math.random() * 3,
      alpha: 1,
      color,
      decay: 0.03 + Math.random() * 0.02,
    });
  }
}

// Glitch Strips 
// [RASTERISATION] — horizontal scan-line glitch effect strips
let glitchStrips = [];

function triggerGlitch(intensity = 1) {
  state.glitchTimer = 30 * intensity;
  state.shakeX = (Math.random() - 0.5) * 8 * intensity;
  state.shakeY = (Math.random() - 0.5) * 8 * intensity;
  for (let i = 0; i < 5 * intensity; i++) {
    glitchStrips.push({
      y: Math.random() * H,
      h: 2 + Math.random() * 12,
      offsetX: (Math.random() - 0.5) * 40,
      life: 8 + Math.random() * 12,
      alpha: 0.4 + Math.random() * 0.4,
    });
  }
}

// Utility 
function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function pad(n, len = 4) {
  return String(Math.floor(n)).padStart(len, "0");
}

// Background: Grid Draw 
// [APPLICATION STAGE] — set up the static grid once; redraw on wave change
function drawBackground() {
  bgCtx.clearRect(0, 0, W, H);

  // Deep TVA golden background
  bgCtx.fillStyle = "#0a0800";
  bgCtx.fillRect(0, 0, W, H);

  // [RASTERISATION] — layered grid: major and minor lines with transparency
  const gridSize = 40;
  bgCtx.strokeStyle = "rgba(245, 200, 66, 0.07)";
  bgCtx.lineWidth = 0.5;
  for (let x = 0; x <= W; x += gridSize) {
    bgCtx.beginPath();
    bgCtx.moveTo(x, 0);
    bgCtx.lineTo(x, H);
    bgCtx.stroke();
  }
  for (let y = 0; y <= H; y += gridSize) {
    bgCtx.beginPath();
    bgCtx.moveTo(0, y);
    bgCtx.lineTo(W, y);
    bgCtx.stroke();
  }

  // Minor grid
  bgCtx.strokeStyle = "rgba(245, 200, 66, 0.03)";
  for (let x = 0; x <= W; x += gridSize / 2) {
    bgCtx.beginPath();
    bgCtx.moveTo(x, 0);
    bgCtx.lineTo(x, H);
    bgCtx.stroke();
  }
  for (let y = 0; y <= H; y += gridSize / 2) {
    bgCtx.beginPath();
    bgCtx.moveTo(0, y);
    bgCtx.lineTo(W, y);
    bgCtx.stroke();
  }

  // Corner brackets (TVA aesthetic)
  bgCtx.strokeStyle = "rgba(245,200,66,0.25)";
  bgCtx.lineWidth = 1;
  const bk = 20,
    bpad = 10;
  [
    [bpad, bpad],
    [W - bpad, bpad],
    [bpad, H - bpad],
    [W - bpad, H - bpad],
  ].forEach(([cx, cy]) => {
    const sx = cx === bpad ? 1 : -1;
    const sy = cy === bpad ? 1 : -1;
    bgCtx.beginPath();
    bgCtx.moveTo(cx + sx * bk, cy);
    bgCtx.lineTo(cx, cy);
    bgCtx.lineTo(cx, cy + sy * bk);
    bgCtx.stroke();
  });
}

// Draw Ms. Minutes 
// Object 2: Complex clock-face object demonstrating:
// [GEOMETRY] — translate + rotate transforms, scale pulsing
// [RASTERISATION] — transparency, layered circles, clock hands, glow
function drawMsMinutes(ctx) {
  const m = msMins;

  ctx.save();

  // [GEOMETRY] — Translate to Ms. Minutes' position, then apply scale transform
  ctx.translate(m.x, m.y);
  ctx.scale(m.pulseScale, m.pulseScale); // [GEOMETRY] scale transformation

  const R = m.radius;
  const closeToPlayer = dist(m.x, m.y, variant.x, variant.y) < 120;

  // [RASTERISATION] — Outer corrupt aura (semi-transparent, layered)
  if (m.corruptAura > 0) {
    const grad = ctx.createRadialGradient(0, 0, R, 0, 0, R + m.corruptAura);
    grad.addColorStop(0, "rgba(200, 50, 50, 0.25)");
    grad.addColorStop(1, "rgba(200, 50, 50, 0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, R + m.corruptAura, 0, Math.PI * 2);
    ctx.fill();
  }

  // [RASTERISATION] — Clock body (layered: outer ring → face → details)
  // Outer ring
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, Math.PI * 2);
  ctx.fillStyle = closeToPlayer
    ? "rgba(80, 10, 10, 0.95)"
    : "rgba(30, 20, 5, 0.95)";
  ctx.fill();
  ctx.strokeStyle =
    m.warningFlash > 0
      ? `rgba(255, 80, 80, ${0.5 + 0.5 * Math.sin(m.warningFlash * 0.5)})`
      : "rgba(245, 200, 66, 0.8)";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Inner face ring
  ctx.beginPath();
  ctx.arc(0, 0, R - 4, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(245, 200, 66, 0.2)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Clock tick marks (12 marks around the face)
  ctx.strokeStyle = "rgba(245, 200, 66, 0.6)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const inner = i % 3 === 0 ? R - 9 : R - 7;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
    ctx.lineTo(Math.cos(a) * (R - 4), Math.sin(a) * (R - 4));
    ctx.stroke();
  }

  // [GEOMETRY] — Rotate the clock hands (inner rotation transform applied here)
  ctx.rotate(m.angle); // [GEOMETRY] continuous rotation

  // Hour hand
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -(R - 10));
  ctx.strokeStyle = "rgba(245, 200, 66, 0.9)";
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  ctx.stroke();

  // Minute hand (rotates faster)
  ctx.rotate(m.angle * 4); // [GEOMETRY] compound rotation
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -(R - 6));
  ctx.strokeStyle = "rgba(255, 100, 100, 0.85)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Center pin
  ctx.beginPath();
  ctx.arc(0, 0, 3, 0, Math.PI * 2);
  ctx.fillStyle = "#f5c842";
  ctx.fill();

  // [RASTERISATION] — Eyes drawn on top face (emoji-like, layered)
  ctx.rotate(-m.angle * 5); // undo rotation for eyes to stay upright
  ctx.fillStyle = "rgba(245, 200, 66, 0.9)";
  // Left eye
  ctx.beginPath();
  ctx.arc(-7, -5, 3, 0, Math.PI * 2);
  ctx.fill();
  // Right eye
  ctx.beginPath();
  ctx.arc(7, -5, 3, 0, Math.PI * 2);
  ctx.fill();
  // Pupils (tracking direction toward player for character expression)
  ctx.fillStyle = "#0a0800";
  const eyeDirX = variant.x - m.x,
    eyeDirY = variant.y - m.y;
  const eyeDist = Math.hypot(eyeDirX, eyeDirY) || 1;
  const pupilOff = 1.2;
  ctx.beginPath();
  ctx.arc(
    -7 + (eyeDirX / eyeDist) * pupilOff,
    -5 + (eyeDirY / eyeDist) * pupilOff,
    1.5,
    0,
    Math.PI * 2,
  );
  ctx.fill();
  ctx.beginPath();
  ctx.arc(
    7 + (eyeDirX / eyeDist) * pupilOff,
    -5 + (eyeDirY / eyeDist) * pupilOff,
    1.5,
    0,
    Math.PI * 2,
  );
  ctx.fill();
  // Smile/grimace based on proximity to player
  ctx.strokeStyle = "rgba(245, 200, 66, 0.85)";
  ctx.lineWidth = 1.5;
  ctx.lineCap = "round";
  ctx.beginPath();
  if (closeToPlayer) {
    // Grimace (bared teeth look)
    ctx.moveTo(-7, 6);
    ctx.lineTo(7, 6);
  } else {
    // Smile
    ctx.arc(0, 4, 7, 0.1 * Math.PI, 0.9 * Math.PI);
  }
  ctx.stroke();

  ctx.restore();
}

// Draw Variant (Player) 
// Object 1: Player character — geometric arrow shape
// [GEOMETRY] — translate + rotate based on movement direction
// [RASTERISATION] — motion trail with decreasing alpha, layered glow
function drawVariant(ctx) {
  const v = variant;
  if (v.invincible > 0 && Math.floor(v.invincible / 4) % 2 === 0) return; // blink

  // [RASTERISATION] — Motion trail: each past position drawn with reduced alpha (layering)
  v.trail.forEach((t, i) => {
    const alpha = (i / v.trail.length) * 0.25; // [RASTERISATION] transparency gradient
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.rotate(t.angle); // [GEOMETRY] each trail segment preserves rotation
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#4ff7b0";
    ctx.beginPath();
    // Arrow shape pointing up
    ctx.moveTo(0, -10);
    ctx.lineTo(-7, 8);
    ctx.lineTo(0, 4);
    ctx.lineTo(7, 8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  });

  ctx.save();

  // [GEOMETRY] — Core geometric transform: translate to position, rotate to heading
  ctx.translate(v.x, v.y);
  ctx.rotate(v.angle); // [GEOMETRY] rotation based on movement direction

  // [RASTERISATION] — Outer glow (semi-transparent layer under main shape)
  ctx.beginPath();
  ctx.moveTo(0, -14);
  ctx.lineTo(-10, 11);
  ctx.lineTo(0, 6);
  ctx.lineTo(10, 11);
  ctx.closePath();
  ctx.shadowBlur = 16;
  ctx.shadowColor = "#4ff7b0";
  ctx.fillStyle = "rgba(79, 247, 176, 0.25)"; // [RASTERISATION] transparent glow layer
  ctx.fill();
  ctx.shadowBlur = 0;

  // [RASTERISATION] — Main shape (opaque, on top)
  ctx.beginPath();
  ctx.moveTo(0, -12);
  ctx.lineTo(-8, 10);
  ctx.lineTo(0, 5);
  ctx.lineTo(8, 10);
  ctx.closePath();
  ctx.fillStyle = "#4ff7b0";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.6)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // TVA insignia — small inner diamond
  ctx.beginPath();
  ctx.moveTo(0, -2);
  ctx.lineTo(-3, 3);
  ctx.lineTo(0, 1);
  ctx.lineTo(3, 3);
  ctx.closePath();
  ctx.fillStyle = "rgba(10, 8, 0, 0.6)";
  ctx.fill();

  ctx.restore();
}

// Draw Time Crystal 
// Object 3: Collectible crystals — hexagons with rotation and alpha
// [GEOMETRY] — continuous rotation + scale animation
// [RASTERISATION] — layered concentric hexagons, pulsing alpha, inner glow
function drawCrystal(ctx, c) {
  if (c.collected && c.collectAnim <= 0) return;

  ctx.save();

  // [GEOMETRY] — Translate to crystal position
  ctx.translate(c.x, c.y);
  // [GEOMETRY] — Apply scale transform (spawn animation and pulse)
  const pulse = 1 + 0.08 * Math.sin(c.pulseT);
  ctx.scale(c.scale * pulse, c.scale * pulse); // [GEOMETRY] scale transform
  // [GEOMETRY] — Apply rotation transform
  ctx.rotate(c.angle); // [GEOMETRY] rotation

  const hexPath = (r) => {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 6;
      i === 0
        ? ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r)
        : ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
  };

  if (c.collected) {
    // [RASTERISATION] — Burst expand animation on collect
    ctx.globalAlpha = c.collectAnim * c.alpha;
    hexPath(18 * (1 - c.collectAnim / 1.5));
    ctx.strokeStyle = "#4ff7b0";
    ctx.lineWidth = 2;
    ctx.stroke();
  } else {
    // [RASTERISATION] — Layered concentric hexagons with decreasing alpha (transparency layers)
    ctx.globalAlpha = c.alpha * 0.15;
    hexPath(22);
    ctx.fillStyle = "#4ff7b0";
    ctx.fill();

    ctx.globalAlpha = c.alpha * 0.25;
    hexPath(17);
    ctx.fillStyle = "#4ff7b0";
    ctx.fill();

    ctx.globalAlpha = c.alpha * 0.8;
    hexPath(13);
    ctx.fillStyle = "rgba(10,8,0,0.7)";
    ctx.fill();
    ctx.strokeStyle = "#4ff7b0";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // [RASTERISATION] — Inner glowing core with alpha
    ctx.globalAlpha = c.alpha * (0.6 + 0.4 * Math.sin(c.pulseT * 2));
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

// Draw TVA Drone 
// Object 4: TVA drones — triangles that rotate to face player
// [GEOMETRY] — rotate to face movement direction
// [RASTERISATION] — semi-transparent, fade in on spawn
function drawDrone(ctx, d) {
  ctx.save();
  ctx.translate(d.x, d.y);
  ctx.rotate(d.angle); // [GEOMETRY] rotation transform to face player
  ctx.globalAlpha = d.alpha; // [RASTERISATION] transparency for spawn fade

  // Triangle drone shape
  ctx.beginPath();
  ctx.moveTo(0, -d.radius);
  ctx.lineTo(-d.radius * 0.7, d.radius * 0.6);
  ctx.lineTo(d.radius * 0.7, d.radius * 0.6);
  ctx.closePath();
  ctx.fillStyle = "rgba(180, 80, 20, 0.7)"; // [RASTERISATION] semi-transparent fill
  ctx.fill();
  ctx.strokeStyle = "#f5c842";
  ctx.lineWidth = 1;
  ctx.stroke();

  // TVA label
  ctx.rotate(-d.angle); // undo rotation for text
  ctx.fillStyle = "rgba(245,200,66,0.9)";
  ctx.font = "bold 6px Courier New";
  ctx.textAlign = "center";
  ctx.fillText("TVA", 0, 2);

  ctx.restore();
}

// Draw Particles 
// [RASTERISATION] — pure pixel-level visual effects, all transparency-based
function drawParticles(ctx) {
  particles.forEach((p) => {
    ctx.save();
    ctx.globalAlpha = p.alpha; // [RASTERISATION] alpha for each particle
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.fill();
    ctx.restore();
  });
}

// Glitch Rasterisation Effect 
// [RASTERISATION] — horizontal scan-line strips offset for CRT glitch look
function drawGlitch(ctx) {
  if (state.glitchTimer <= 0) return;
  glitchStrips.forEach((strip) => {
    ctx.save();
    ctx.globalAlpha = strip.alpha * (strip.life / 20);
    // [RASTERISATION] — Sample and shift a horizontal band of pixels
    try {
      const imgData = gameCanvas
        .getContext("2d")
        .getImageData(0, strip.y, W, strip.h);
      ctx.putImageData(imgData, strip.offsetX, strip.y);
    } catch (e) {}
    ctx.restore();
  });

  // Scanline overlay
  ctx.save();
  ctx.globalAlpha = 0.04 * (state.glitchTimer / 30); // [RASTERISATION] overlay transparency
  for (let y = 0; y < H; y += 3) {
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, y, W, 1);
  }
  ctx.restore();
}

// Application Stage Update Loop 
// [APPLICATION STAGE] — all game logic, physics, collision before drawing
function update() {
  if (state.phase !== "playing") return;
  state.frameCount++;

  // Player Input & Velocity 
  // [APPLICATION STAGE] — input processing
  let dx = 0,
    dy = 0;
  if (keys["ArrowLeft"] || keys["a"] || keys["A"]) dx -= 1;
  if (keys["ArrowRight"] || keys["d"] || keys["D"]) dx += 1;
  if (keys["ArrowUp"] || keys["w"] || keys["W"]) dy -= 1;
  if (keys["ArrowDown"] || keys["s"] || keys["S"]) dy += 1;

  if (dx !== 0 || dy !== 0) {
    const mag = Math.hypot(dx, dy);
    variant.vx = (dx / mag) * variant.speed;
    variant.vy = (dy / mag) * variant.speed;
    // [GEOMETRY] — Compute rotation angle from velocity vector
    variant.angle = Math.atan2(variant.vy, variant.vx) + Math.PI / 2;
  } else {
    variant.vx *= 0.85; // deceleration
    variant.vy *= 0.85;
  }

  // Apply velocity and clamp to canvas bounds
  variant.x = clamp(variant.x + variant.vx, 20, W - 20);
  variant.y = clamp(variant.y + variant.vy, 20, H - 20);

  // [RASTERISATION] — Update motion trail (history of past positions)
  variant.trail.push({ x: variant.x, y: variant.y, angle: variant.angle });
  if (variant.trail.length > 12) variant.trail.shift();

  if (variant.invincible > 0) variant.invincible--;

  // Ms. Minutes AI & Geometry Update 
  // [GEOMETRY] — Update her position (translation), rotation angle
  // [APPLICATION] — pursuit AI: steer toward player
  const toVarX = variant.x - msMins.x;
  const toVarY = variant.y - msMins.y;
  const toVarDist = Math.hypot(toVarX, toVarY) || 1;
  msMins.vx += (toVarX / toVarDist) * 0.08 * (1 + state.wave * 0.1);
  msMins.vy += (toVarY / toVarDist) * 0.08 * (1 + state.wave * 0.1);

  // Speed cap for Ms. Minutes (increases with wave)
  const msSpeed = msMins.speed + state.wave * 0.18;
  const msCurSpeed = Math.hypot(msMins.vx, msMins.vy);
  if (msCurSpeed > msSpeed) {
    msMins.vx = (msMins.vx / msCurSpeed) * msSpeed;
    msMins.vy = (msMins.vy / msCurSpeed) * msSpeed;
  }

  msMins.x = clamp(msMins.x + msMins.vx, 30, W - 30);
  msMins.y = clamp(msMins.y + msMins.vy, 30, H - 30);

  // [GEOMETRY] — Rotate clock hands continuously
  msMins.angle += 0.025 + state.wave * 0.005;

  // [GEOMETRY] — Pulse scale animation
  msMins.pulseScale += 0.006 * msMins.pulseDir;
  if (msMins.pulseScale > 1.08 || msMins.pulseScale < 0.94)
    msMins.pulseDir *= -1;

  // [RASTERISATION] — Corrupt aura grows when close to player
  const msDist = dist(msMins.x, msMins.y, variant.x, variant.y);
  msMins.corruptAura = clamp(80 - msDist * 0.5, 0, 40);
  msMins.warningFlash = msDist < 100 ? msMins.warningFlash + 1 : 0;

  // Crystal Updates
  crystals.forEach((c) => {
    if (!c.collected) {
      // [GEOMETRY] — Rotate crystal each frame
      c.angle += 0.018;
      c.pulseT += 0.06;

      // [GEOMETRY] — Scale animation (spawn in)
      if (c.scale < 1) c.scale = Math.min(1, c.scale + 0.06);

      // [RASTERISATION] — Alpha fade in
      c.alpha = Math.min(1, c.alpha + 0.04);

      // [APPLICATION] — Collision detection
      if (dist(c.x, c.y, variant.x, variant.y) < variant.radius + 13) {
        c.collected = true;
        c.collectAnim = 1.5;
        state.score += 100 + state.wave * 50;
        state.crystalsCaught++;
        playCollect();
        spawnParticles(c.x, c.y, "#4ff7b0", 16, 4);
        updateHUD();
      }
    } else {
      // Collect burst animation
      c.collectAnim = Math.max(0, c.collectAnim - 0.08);
    }
  });

  // Advance wave when enough crystals collected
  if (state.crystalsCaught >= state.crystalsPerWave) {
    advanceWave();
  }

  // Spawn a new crystal if none remain uncollected
  if (crystals.filter((c) => !c.collected).length === 0) {
    spawnCrystal();
    spawnCrystal();
  }

  // Drone Updates
  drones.forEach((d, i) => {
    // [GEOMETRY] — Rotate drone to face variant
    const toDx = variant.x - d.x;
    const toDy = variant.y - d.y;
    d.angle = Math.atan2(toDy, toDx) + Math.PI / 2; // [GEOMETRY] heading angle

    d.x += (toDx / (Math.hypot(toDx, toDy) || 1)) * d.speed;
    d.y += (toDy / (Math.hypot(toDx, toDy) || 1)) * d.speed;
    d.alpha = Math.min(1, d.alpha + 0.02); // [RASTERISATION] fade in

    if (
      variant.invincible === 0 &&
      dist(d.x, d.y, variant.x, variant.y) < variant.radius + d.radius
    ) {
      takeDamage();
      drones.splice(i, 1);
    }
  });

  // Drone spawn (wave 2+, periodic)
  if (
    state.wave >= 2 &&
    state.frameCount % Math.max(180, 360 - state.wave * 30) === 0
  ) {
    spawnDrone();
  }

  // Ms. Minutes Collision
  // [APPLICATION STAGE] — collision detection
  if (variant.invincible === 0 && msDist < variant.radius + msMins.radius - 4) {
    takeDamage();
  }

  // Particles & Glitch
  // [RASTERISATION] — update particle physics
  particles.forEach((p) => {
    p.x += p.vx;
    p.y += p.vy;
    p.vx *= 0.96;
    p.vy *= 0.96;
    p.radius *= 0.97;
    p.alpha -= p.decay;
  });
  particles = particles.filter((p) => p.alpha > 0.01);

  glitchStrips.forEach((g) => {
    g.life--;
  });
  glitchStrips = glitchStrips.filter((g) => g.life > 0);
  if (state.glitchTimer > 0) state.glitchTimer--;
  state.shakeX *= 0.8;
  state.shakeY *= 0.8;

  // Clock tick audio
  state.tickTimer++;
  if (state.tickTimer % 30 === 0) playTick();

  // Ambient glitch on timeline instability
  const integrity = Math.max(0, 100 - state.wave * 8);
  document.getElementById("integrity").textContent = integrity + "%";
  if (state.frameCount % Math.max(60, 200 - state.wave * 15) === 0) {
    triggerGlitch(0.5 + state.wave * 0.1);
  }
}

function takeDamage() {
  if (variant.invincible > 0) return;
  state.lives--;
  variant.invincible = 90;
  playPrune();
  triggerGlitch(2);
  spawnParticles(variant.x, variant.y, "#ff4444", 20, 5);
  updateHUD();
  if (state.lives <= 0) endGame();
}

function advanceWave() {
  state.wave++;
  state.crystalsCaught = 0;
  state.crystalsPerWave = 5 + state.wave;
  crystals = [];
  drones = [];
  playWave();
  triggerGlitch(3);
  for (let i = 0; i < 2 + state.wave; i++) spawnCrystal();
  state.score += state.wave * 200;
  updateHUD();
  document.getElementById("wave-display").textContent =
    `WAVE ${pad(state.wave, 2)}`;
  // Ms. Minutes gets faster each wave
  msMins.speed = 1.2 + (state.wave - 1) * 0.2;
}

// Main Render Loop 
// [GEOMETRY] — Global canvas-shake transform applied each frame
// [RASTERISATION] — Composite all layers
function render() {
  // Clear game canvas
  gCtx.clearRect(0, 0, W, H);
  fxCtx.clearRect(0, 0, W, H);

  // [GEOMETRY] — Canvas shake: a global translation applied to the game layer
  gCtx.save();
  gCtx.translate(state.shakeX, state.shakeY); // [GEOMETRY] camera shake transform

  // Draw all game objects
  crystals.forEach((c) => drawCrystal(gCtx, c));
  drones.forEach((d) => drawDrone(gCtx, d));
  drawVariant(gCtx);
  drawMsMinutes(gCtx);
  drawParticles(gCtx);

  gCtx.restore();

  // [RASTERISATION] — FX layer: glitch strips on top of everything
  drawGlitch(fxCtx);

  // [RASTERISATION] — Vignette: radial gradient overlay for cinematic depth
  const vig = fxCtx.createRadialGradient(
    W / 2,
    H / 2,
    H * 0.3,
    W / 2,
    H / 2,
    H * 0.9,
  );
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(1, "rgba(0,0,0,0.45)");
  fxCtx.fillStyle = vig;
  fxCtx.fillRect(0, 0, W, H);
}

// HUD Update 
function updateHUD() {
  document.getElementById("score-display").textContent = pad(state.score, 6);
  ["h1", "h2", "h3"].forEach((id, i) => {
    document.getElementById(id).classList.toggle("empty", i >= state.lives);
  });
}

// Game Lifecycle 
function startGame() {
  initAudio();
  state.score = 0;
  state.lives = 3;
  state.wave = 1;
  state.crystalsCaught = 0;
  state.crystalsPerWave = 5;
  state.frameCount = 0;
  state.tickTimer = 0;
  state.glitchTimer = 0;
  state.phase = "playing";

  variant.x = 400;
  variant.y = 275;
  variant.vx = 0;
  variant.vy = 0;
  variant.angle = 0;
  variant.trail = [];
  variant.invincible = 0;

  msMins.x = 80;
  msMins.y = 80;
  msMins.vx = 1;
  msMins.vy = 0.5;
  msMins.speed = 1.2;
  msMins.angle = 0;
  msMins.pulseScale = 1;

  crystals = [];
  drones = [];
  particles = [];
  glitchStrips = [];
  for (let i = 0; i < 3; i++) spawnCrystal();

  document.getElementById("screen-start").style.display = "none";
  document.getElementById("screen-over").style.display = "none";
  document.getElementById("screen-pause").style.display = "none";
  document.getElementById("wave-display").textContent = "WAVE 01";
  document.getElementById("integrity").textContent = "100%";

  updateHUD();
  drawBackground();
  playWave();
}

function endGame() {
  state.phase = "over";
  document.getElementById("final-score").textContent = pad(state.score, 6);
  document.getElementById("final-wave").textContent =
    `REACHED WAVE ${pad(state.wave, 2)}`;
  document.getElementById("screen-over").style.display = "flex";
  triggerGlitch(5);
}

function togglePause() {
  if (state.phase === "playing") {
    state.phase = "paused";
    document.getElementById("screen-pause").style.display = "flex";
  } else if (state.phase === "paused") {
    state.phase = "playing";
    document.getElementById("screen-pause").style.display = "none";
  }
}

// Main Loop 
function gameLoop() {
  update(); // [APPLICATION STAGE]
  render(); // [GEOMETRY] + [RASTERISATION]
  requestAnimationFrame(gameLoop);
}

// Boot
document.getElementById("btn-start").addEventListener("click", startGame);
document.getElementById("btn-restart").addEventListener("click", startGame);
bindTouchControls();

drawBackground(); // Draw static background on load
gameLoop();
