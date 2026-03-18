/**
 * Music Frame — relaxing audio-reactive border
 * Falls back to gentle breathing if no audio permission
 * Low power: throttled canvas draw, no heavy processing
 */
(function () {
  // ── Canvas overlay ──────────────────────────────────────────────────────────
  const canvas = document.createElement("canvas");
  canvas.id = "music-frame-canvas";
  canvas.style.cssText = [
    "position:fixed", "top:0", "left:0",
    "width:100%", "height:100%",
    "pointer-events:none",
    "z-index:9997",
    "opacity:0",
    "transition:opacity 1.2s ease"
  ].join(";");
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");

  // ── State ───────────────────────────────────────────────────────────────────
  let analyser = null;
  let dataArray = null;
  let audioCtx = null;
  let phase = 0;          // slow phase for breathing
  let energy = 0;         // smoothed audio energy (0–1)
  let lastFrame = 0;
  const TARGET_FPS = 30;  // cap at 30fps — relaxing + low power
  const MS_PER_FRAME = 1000 / TARGET_FPS;

  // ── Palette (calm: deep teal, soft violet, sky blue) ───────────────────────
  const COLORS = [
    { r: 56,  g: 189, b: 248 },  // sky blue
    { r: 139, g: 92,  b: 246 },  // violet
    { r: 34,  g: 211, b: 238 },  // cyan
    { r: 99,  g: 102, b: 241 },  // indigo
    { r: 0,   g: 212, b: 161 },  // teal
  ];

  function lerpColor(a, b, t) {
    return {
      r: Math.round(a.r + (b.r - a.r) * t),
      g: Math.round(a.g + (b.g - a.g) * t),
      b: Math.round(a.b + (b.b - a.b) * t),
    };
  }

  function getColor(t) {
    // t in [0,1] → cycles through palette
    const scaled = ((t % 1) + 1) % 1 * COLORS.length;
    const i = Math.floor(scaled) % COLORS.length;
    const j = (i + 1) % COLORS.length;
    const c = lerpColor(COLORS[i], COLORS[j], scaled - Math.floor(scaled));
    return `rgb(${c.r},${c.g},${c.b})`;
  }

  // ── Resize ──────────────────────────────────────────────────────────────────
  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener("resize", resize);
  resize();

  // ── Draw frame ──────────────────────────────────────────────────────────────
  function drawFrame(ts) {
    if (ts - lastFrame < MS_PER_FRAME) {
      requestAnimationFrame(drawFrame);
      return;
    }
    lastFrame = ts;

    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    // Update audio energy
    if (analyser && dataArray) {
      analyser.getByteFrequencyData(dataArray);
      // Use only bass+mid (low indices) for calmer movement
      const slice = Math.floor(dataArray.length * 0.25);
      let sum = 0;
      for (let i = 0; i < slice; i++) sum += dataArray[i];
      const raw = sum / (slice * 255);
      energy += (raw - energy) * 0.08; // smooth
    } else {
      // Gentle breathing when no audio
      energy += (Math.sin(phase * 0.4) * 0.18 + 0.22 - energy) * 0.05;
    }

    phase += 0.018;

    // Border thickness: base 3px + up to 12px from energy
    const thickness = 3 + energy * 12;
    // Glow spread: base 8px + up to 40px from energy
    const glow = 8 + energy * 40;
    // Alpha: 0.35 to 0.75
    const alpha = 0.35 + energy * 0.4;
    // Color slowly cycles
    const colorT = phase * 0.04;
    const c1 = getColor(colorT);
    const c2 = getColor(colorT + 0.33);
    const c3 = getColor(colorT + 0.66);

    // ── Draw 4 glowing edges ──────────────────────────────────────────────────
    const edges = [
      { x1: 0, y1: 0,      x2: W, y2: 0      }, // top
      { x1: 0, y1: H,      x2: W, y2: H      }, // bottom
      { x1: 0, y1: 0,      x2: 0, y2: H      }, // left
      { x1: W, y1: 0,      x2: W, y2: H      }, // right
    ];

    for (const e of edges) {
      const grad = ctx.createLinearGradient(e.x1, e.y1, e.x2, e.y2);
      grad.addColorStop(0,    `rgba(${hexToRgb(c1)},0)`);
      grad.addColorStop(0.3,  `rgba(${hexToRgb(c2)},${alpha})`);
      grad.addColorStop(0.7,  `rgba(${hexToRgb(c3)},${alpha})`);
      grad.addColorStop(1,    `rgba(${hexToRgb(c1)},0)`);

      ctx.save();
      ctx.strokeStyle = grad;
      ctx.lineWidth = thickness;
      ctx.shadowColor = c2;
      ctx.shadowBlur = glow;

      ctx.beginPath();
      ctx.moveTo(e.x1, e.y1);
      ctx.lineTo(e.x2, e.y2);
      ctx.stroke();

      // Second softer pass for depth
      ctx.globalAlpha = 0.3;
      ctx.lineWidth = thickness * 2.5;
      ctx.shadowBlur = glow * 1.8;
      ctx.stroke();
      ctx.restore();
    }

    // ── Subtle corner glows ───────────────────────────────────────────────────
    const corners = [
      { x: 0, y: 0 }, { x: W, y: 0 },
      { x: 0, y: H }, { x: W, y: H },
    ];
    const cornerR = 60 + energy * 60;
    corners.forEach((c, i) => {
      const cg = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, cornerR);
      const col = getColor(colorT + i * 0.25);
      cg.addColorStop(0,   `rgba(${hexToRgb(col)},${alpha * 0.6})`);
      cg.addColorStop(1,   `rgba(${hexToRgb(col)},0)`);
      ctx.save();
      ctx.fillStyle = cg;
      ctx.fillRect(c.x - cornerR, c.y - cornerR, cornerR * 2, cornerR * 2);
      ctx.restore();
    });

    requestAnimationFrame(drawFrame);
  }

  // ── Helper: parse "rgb(r,g,b)" → "r,g,b" ───────────────────────────────────
  function hexToRgb(str) {
    const m = str.match(/\d+/g);
    return m ? m.join(",") : "255,255,255";
  }

  // ── Try to connect audio ────────────────────────────────────────────────────
  async function initAudio() {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const source = audioCtx.createMediaStreamSource(stream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.85;
      dataArray = new Uint8Array(analyser.frequencyBinCount);
      source.connect(analyser);
    } catch {
      // No mic / denied — breathing animation continues
      analyser = null;
    }
  }

  // ── Init ────────────────────────────────────────────────────────────────────
  function start() {
    canvas.style.opacity = "1";
    requestAnimationFrame(drawFrame);
    initAudio();
  }

  // Start after page loads so it doesn't block anything
  if (document.readyState === "complete") {
    setTimeout(start, 800);
  } else {
    window.addEventListener("load", () => setTimeout(start, 800));
  }
})();
