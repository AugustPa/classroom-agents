#!/usr/bin/env node
/**
 * Build the four teaching replays from the lecture trial shelf (when present)
 * and render each one to an mp4 plus a poster frame.
 *
 *   node scripts/render-example-videos.js
 */
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const root = path.join(__dirname, "..");
const replayDir = path.join(root, "examples", "replays");
const videoDir = path.join(root, "examples", "videos");
const posterDir = path.join(root, "examples", "posters");
const sourceFile = path.join(root, "trials", "lecture-trials.json");

const W = 1280;
const H = 720;
const FPS = 12;

const SPECS = [
  {
    file: "echo-with-bridge.json",
    id: "example-echo-bridge",
    sourceId: "614bbccf",
    name: "Example — echo chambers, with a bridge",
    title: "Echo chambers, with a bridge",
    blurb: "Red and blue start about 150° apart. A bridge can see both, and the red chamber is pulled onto the blue heading.",
    citation: "Classroom network demo. The two-group choice is the Couzin et al., Nature (2005) bifurcation; the bridge is the extra link.",
    videoSeconds: 16,
    posterAt: 0.92,
    mode: "echo",
  },
  {
    file: "echo-no-bridge.json",
    id: "example-echo-nobridge",
    sourceId: "5c3ffa80",
    name: "Example — echo chambers, no bridge",
    title: "Echo chambers, no bridge",
    blurb: "Blue stays near 30°. Red settles near 180° and stays there. Nobody can see the other chamber, so the two marches never meet.",
    citation: "Same hidden split, without a bridge. Polarization stays low because the headings do not agree.",
    videoSeconds: 16,
    posterAt: 0.9,
    mode: "echo",
  },
  {
    file: "taxis-social.json",
    id: "example-taxis-social",
    sourceId: "4f5700f1",
    name: "Example — patch finding, social",
    title: "Patch finding, social",
    blurb: "Everyone can see everyone else. The group collects in the slow patch and stays there. The recorded name was mistyped; the visibility rule is all.",
    citation: "Berdahl et al., Science (2013). Social individuals accumulate where conditions are good without a map of the patch.",
    videoSeconds: 18,
    posterAt: 0.85,
    oasis: true,
    mode: "taxis",
  },
  {
    file: "taxis-solo.json",
    id: "example-taxis-solo",
    sourceId: "99128d2f",
    name: "Example — patch finding, solitary",
    title: "Patch finding, solitary",
    blurb: "Nobody can see anyone else. The same patch is still there, but the paths stay scattered and occupancy comes and goes.",
    citation: "Berdahl et al., Science (2013), the asocial control. Individuals do not track the good region the way the group does.",
    videoSeconds: 18,
    posterAt: 0.85,
    oasis: true,
    mode: "taxis",
  },
];

function wrapLat(c) {
  return c - Math.floor(c + 0.5);
}
function toVoronoi(x, y, s) {
  const rt3h = Math.sqrt(3) / 2;
  const v = y / (s * rt3h);
  const u = x / s - v / 2;
  const u0 = wrapLat(u);
  const v0 = wrapLat(v);
  let bx = x;
  let by = y;
  let best = Infinity;
  for (const [du, dv] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1], [-1, 1], [1, -1]]) {
    const wx = s * (u0 + du + (v0 + dv) * 0.5);
    const wy = s * rt3h * (v0 + dv);
    const d = wx * wx + wy * wy;
    if (d < best) {
      best = d;
      bx = wx;
      by = wy;
    }
  }
  return { x: bx, y: by };
}
function minImage(ax, ay, bx, by, s) {
  const rt3h = Math.sqrt(3) / 2;
  const la = (() => {
    const v = ay / (s * rt3h);
    return { u: ax / s - v / 2, v };
  })();
  const lb = (() => {
    const v = by / (s * rt3h);
    return { u: bx / s - v / 2, v };
  })();
  const u0 = wrapLat(lb.u - la.u);
  const v0 = wrapLat(lb.v - la.v);
  let best = { x: bx - ax, y: by - ay, d: Infinity };
  for (const [du, dv] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1], [-1, 1], [1, -1]]) {
    const wx = s * (u0 + du + (v0 + dv) * 0.5);
    const wy = s * rt3h * (v0 + dv);
    const d = wx * wx + wy * wy;
    if (d < best.d) best = { x: wx, y: wy, d };
  }
  return best;
}

function inferOasis(trial) {
  const slow = [];
  for (const sample of trial.samples || []) {
    for (const agent of sample.agents || []) {
      if (agent.type === "bot") continue;
      if (Math.hypot(agent.vx || 0, agent.vy || 0) < 2.4) slow.push(agent);
    }
  }
  if (slow.length < 20) return null;
  const xs = slow.map((a) => a.x).sort((a, b) => a - b);
  const ys = slow.map((a) => a.y).sort((a, b) => a - b);
  const mid = (arr) => arr[Math.floor(arr.length / 2)];
  return { x: mid(xs), y: mid(ys), r: 11 };
}

function refreshReplays() {
  fs.mkdirSync(replayDir, { recursive: true });
  if (!fs.existsSync(sourceFile)) {
    console.log("No lecture-trials.json — rendering the replays already in examples/replays.");
    return;
  }
  const shelf = JSON.parse(fs.readFileSync(sourceFile, "utf8"));
  const byId = new Map((shelf.trials || []).map((tr) => [tr.id, tr]));
  for (const spec of SPECS) {
    const src = byId.get(spec.sourceId);
    if (!src) {
      console.warn("Missing source trial", spec.sourceId, "for", spec.file);
      continue;
    }
    const replay = {
      id: spec.id,
      name: spec.name,
      example: true,
      kept: false,
      preset: src.preset,
      t0: src.t0 || 0,
      t1: src.t1 || (src.t0 || 0) + ((src.metrics || []).at(-1)?.t || 0),
      title: spec.title,
      blurb: spec.blurb,
      citation: spec.citation,
      config: src.config || {},
      oasis: spec.oasis ? inferOasis(src) : null,
      metrics: src.metrics || [],
      samples: src.samples || [],
    };
    fs.writeFileSync(path.join(replayDir, spec.file), JSON.stringify(replay));
    console.log("wrote", spec.file, "samples", replay.samples.length);
  }
}

const FONT = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01111", "10000", "10000", "10011", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
  "6": ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  ",": ["00000", "00000", "00000", "00000", "00100", "00100", "01000"],
  ":": ["00000", "01100", "01100", "00000", "01100", "01100", "00000"],
  "%": ["11001", "11010", "00100", "00100", "01011", "10011", "00000"],
  "'": ["00100", "00100", "01000", "00000", "00000", "00000", "00000"],
};

function chamberOf(color) {
  const hex = String(color || "").toLowerCase();
  const r = parseInt(hex.slice(1, 3), 16) || 0;
  const g = parseInt(hex.slice(3, 5), 16) || 0;
  const b = parseInt(hex.slice(5, 7), 16) || 0;
  if (r > 180 && g > 140 && b < 120) return "bridge";
  if (b > r && b > 80) return "A";
  if (r > b && r > 100) return "B";
  return "other";
}
function rgbOf(agent, mode) {
  if (mode !== "echo") {
    const hex = String(agent.scarfColor || "#94a3b8");
    return [
      parseInt(hex.slice(1, 3), 16) || 148,
      parseInt(hex.slice(3, 5), 16) || 163,
      parseInt(hex.slice(5, 7), 16) || 184,
    ];
  }
  const kind = chamberOf(agent.scarfColor);
  if (kind === "A") return [96, 165, 250];
  if (kind === "B") return [248, 113, 113];
  if (kind === "bridge") return [251, 191, 36];
  return [148, 163, 184];
}

function unwrapTracks(replay) {
  const hex = (replay.config && replay.config.boundaryMode) === "hex_torus";
  const spacing = Number(replay.config && replay.config.hexSpacing) || 24;
  const tracks = new Map();
  for (const sample of replay.samples || []) {
    for (const agent of sample.agents || []) {
      if (agent.type === "bot") continue;
      let track = tracks.get(agent.id);
      if (!track) {
        track = { id: agent.id, scarf: agent.scarfColor, canon: { x: agent.x, y: agent.y }, pts: [] };
        tracks.set(agent.id, track);
      }
      track.scarf = agent.scarfColor || track.scarf;
      let x = agent.x;
      let y = agent.y;
      if (hex && track.pts.length) {
        const step = minImage(track.canon.x, track.canon.y, agent.x, agent.y, spacing);
        const prev = track.pts[track.pts.length - 1];
        x = prev.x + step.x;
        y = prev.y + step.y;
      }
      track.canon = { x: agent.x, y: agent.y };
      track.pts.push({
        t: sample.t,
        x,
        y,
        heading: agent.heading || 0,
        scarf: agent.scarfColor,
      });
    }
  }
  return [...tracks.values()];
}

function makeFrame(w, h, rgb) {
  const buf = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h; i += 1) {
    buf[i * 3] = rgb[0];
    buf[i * 3 + 1] = rgb[1];
    buf[i * 3 + 2] = rgb[2];
  }
  return buf;
}
function put(buf, x, y, rgb, a = 1) {
  x = Math.round(x);
  y = Math.round(y);
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  buf[i] = Math.round(buf[i] * (1 - a) + rgb[0] * a);
  buf[i + 1] = Math.round(buf[i + 1] * (1 - a) + rgb[1] * a);
  buf[i + 2] = Math.round(buf[i + 2] * (1 - a) + rgb[2] * a);
}
function line(buf, x0, y0, x1, y1, rgb, a = 1) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  let dx = Math.abs(x1 - x0);
  let dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  for (;;) {
    put(buf, x0, y0, rgb, a);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 < dx) { err += dx; y0 += sy; }
  }
}
function fillCircle(buf, cx, cy, r, rgb, a = 1) {
  const R = Math.ceil(r);
  for (let y = -R; y <= R; y += 1) {
    for (let x = -R; x <= R; x += 1) {
      if (x * x + y * y <= r * r) put(buf, cx + x, cy + y, rgb, a);
    }
  }
}
function strokeCircle(buf, cx, cy, r, rgb) {
  const steps = Math.max(24, Math.round(r * 2));
  for (let i = 0; i < steps; i += 1) {
    const a0 = (i / steps) * Math.PI * 2;
    const a1 = ((i + 1) / steps) * Math.PI * 2;
    line(buf, cx + Math.cos(a0) * r, cy + Math.sin(a0) * r, cx + Math.cos(a1) * r, cy + Math.sin(a1) * r, rgb, 0.9);
  }
}
function drawText(buf, text, x, y, scale, rgb) {
  let cx = x;
  const up = String(text || "").toUpperCase();
  for (const ch of up) {
    const glyph = FONT[ch] || FONT[" "];
    for (let row = 0; row < 7; row += 1) {
      for (let col = 0; col < 5; col += 1) {
        if (glyph[row][col] === "1") {
          for (let sy = 0; sy < scale; sy += 1) {
            for (let sx = 0; sx < scale; sx += 1) put(buf, cx + col * scale + sx, y + row * scale + sy, rgb, 1);
          }
        }
      }
    }
    cx += 6 * scale;
  }
}
function arrow(buf, x, y, heading, rgb) {
  const len = 16;
  const dx = Math.cos(heading) * len;
  const dy = Math.sin(heading) * len;
  line(buf, x - dx * 0.2, y - dy * 0.2, x + dx, y + dy, rgb, 1);
  const px = -dy * 0.45;
  const py = dx * 0.45;
  line(buf, x + dx, y + dy, x + dx * 0.45 + px, y + dy * 0.45 + py, rgb, 1);
  line(buf, x + dx, y + dy, x + dx * 0.45 - px, y + dy * 0.45 - py, rgb, 1);
  fillCircle(buf, x, y, 3.2, rgb, 1);
}

function viewOf(tracks, oasis) {
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const track of tracks) {
    for (const p of track.pts) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }
  if (oasis) {
    minX = Math.min(minX, oasis.x - oasis.r);
    maxX = Math.max(maxX, oasis.x + oasis.r);
    minY = Math.min(minY, oasis.y - oasis.r);
    maxY = Math.max(maxY, oasis.y + oasis.r);
  }
  const pad = 8;
  minX -= pad; minY -= pad; maxX += pad; maxY += pad;
  const worldW = Math.max(12, maxX - minX);
  const worldH = Math.max(12, maxY - minY);
  const plotL = 36;
  const plotT = 78;
  const plotR = W - 36;
  const plotB = H - 78;
  const plotW = plotR - plotL;
  const plotH = plotB - plotT;
  const scale = Math.min(plotW / worldW, plotH / worldH);
  const ox = plotL + (plotW - worldW * scale) / 2;
  const oy = plotT + (plotH - worldH * scale) / 2;
  return {
    to(x, y) {
      return [ox + (x - minX) * scale, oy + (y - minY) * scale];
    },
    scale,
  };
}

function phiAt(replay, t) {
  const rows = replay.metrics || [];
  let best = rows[0];
  let bestD = Infinity;
  for (const row of rows) {
    const d = Math.abs(row.t - t);
    if (d < bestD) { bestD = d; best = row; }
  }
  return best ? Number(best.humanPolarization) || 0 : 0;
}
function meanHeading(trackPts, kind) {
  let c = 0; let s = 0; let n = 0;
  for (const track of trackPts) {
    const p = track.now;
    if (!p || chamberOf(p.scarf) !== kind) continue;
    c += Math.cos(p.heading);
    s += Math.sin(p.heading);
    n += 1;
  }
  if (!n) return null;
  return Math.round((Math.atan2(s, c) * 180) / Math.PI);
}

function renderReplay(replay, spec) {
  const tracks = unwrapTracks(replay);
  const view = viewOf(tracks, replay.oasis);
  const t1 = (replay.samples || []).at(-1)?.t || 1;
  const frames = Math.round(spec.videoSeconds * FPS);
  const posterIndex = Math.round(frames * spec.posterAt);
  const outPath = path.join(videoDir, spec.file.replace(".json", ".mp4"));
  const posterPath = path.join(posterDir, spec.file.replace(".json", ".png"));
  const ff = spawn("ffmpeg", [
    "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", `${W}x${H}`, "-r", String(FPS), "-i", "-",
    "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", outPath,
  ], { stdio: ["pipe", "ignore", "pipe"] });
  let ffErr = "";
  ff.stderr.on("data", (d) => { ffErr += d.toString(); });
  const done = new Promise((resolve, reject) => {
    ff.on("error", reject);
    ff.on("close", (code) => (code === 0 ? resolve() : reject(new Error(ffErr.slice(-500)))));
  });

  let poster = null;
  for (let frame = 0; frame < frames; frame += 1) {
    const t = (frame / Math.max(1, frames - 1)) * t1;
    const buf = makeFrame(W, H, [8, 14, 28]);
    drawText(buf, spec.title, 36, 22, 3, [241, 245, 249]);
    drawText(buf, `${Math.round(t / 1000)} SEC    ORDER ${(phiAt(replay, t)).toFixed(2)}`, 36, H - 52, 2, [203, 213, 225]);
    if (replay.oasis) {
      const [cx, cy] = view.to(replay.oasis.x, replay.oasis.y);
      fillCircle(buf, cx, cy, replay.oasis.r * view.scale, [14, 165, 233], 0.22);
      strokeCircle(buf, cx, cy, replay.oasis.r * view.scale, [125, 211, 252]);
      drawText(buf, "PATCH", cx - 28, cy - replay.oasis.r * view.scale - 22, 2, [186, 230, 253]);
    }
    for (const track of tracks) {
      const rgb = rgbOf({ scarfColor: track.scarf }, spec.mode);
      let prev = null;
      for (const p of track.pts) {
        if (p.t > t) break;
        const [x, y] = view.to(p.x, p.y);
        if (prev && Math.hypot(x - prev[0], y - prev[1]) < 80) line(buf, prev[0], prev[1], x, y, rgb, 0.45);
        prev = [x, y];
        track.now = p;
      }
    }
    for (const track of tracks) {
      const p = track.now;
      if (!p) continue;
      const [x, y] = view.to(p.x, p.y);
      arrow(buf, x, y, p.heading, rgbOf({ scarfColor: p.scarf || track.scarf }, spec.mode));
    }
    if (spec.mode === "echo") {
      const blue = meanHeading(tracks, "A");
      const red = meanHeading(tracks, "B");
      if (blue !== null) drawText(buf, `BLUE ${blue} DEG`, W - 300, 24, 2, [147, 197, 253]);
      if (red !== null) drawText(buf, `RED ${red} DEG`, W - 300, 48, 2, [252, 165, 165]);
    }
    if (frame === posterIndex) poster = Buffer.from(buf);
    ff.stdin.write(buf);
  }
  ff.stdin.end();
  return done.then(() => {
    if (!poster) return;
    return new Promise((resolve, reject) => {
      const png = spawn("ffmpeg", [
        "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", `${W}x${H}`, "-i", "-", posterPath,
      ], { stdio: ["pipe", "ignore", "pipe"] });
      png.on("error", reject);
      png.on("close", (code) => (code === 0 ? resolve() : reject(new Error("poster failed"))));
      png.stdin.write(poster);
      png.stdin.end();
    });
  }).then(() => {
    console.log("rendered", path.relative(root, outPath));
  });
}

async function main() {
  fs.mkdirSync(videoDir, { recursive: true });
  fs.mkdirSync(posterDir, { recursive: true });
  refreshReplays();
  for (const spec of SPECS) {
    const file = path.join(replayDir, spec.file);
    if (!fs.existsSync(file)) {
      console.warn("skip missing", spec.file);
      continue;
    }
    const replay = JSON.parse(fs.readFileSync(file, "utf8"));
    await renderReplay(replay, spec);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
