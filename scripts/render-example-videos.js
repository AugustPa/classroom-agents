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

let W = 1280;
let H = 720;
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
    blurb: "Everyone can see everyone else. Record was already running for a few seconds before the walk, and the patch had just been placed, so the clock starts when most of them are moving. The median fox is in the patch at 10 seconds. Half the group is inside by 54 seconds, and they stay.",
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
    blurb: "Nobody can see anyone else. The walk starts a few seconds after record. The median fox reaches the patch at 75 seconds, and half the group is inside only around 78 seconds. Occupancy then breaks up.",
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

function fitOasis(trial) {
  const metrics = trial.metrics || [];
  const samples = trial.samples || [];
  if (!metrics.length || !samples.length) return null;
  const fracAt = (t) => {
    let best = metrics[0];
    let bestD = Infinity;
    for (const row of metrics) {
      const d = Math.abs(row.t - t);
      if (d < bestD) { bestD = d; best = row; }
    }
    return Number(best.oasisFraction) || 0;
  };
  const picks = [];
  const step = Math.max(1, Math.floor(samples.length / 70));
  for (let i = 0; i < samples.length; i += step) {
    const sample = samples[i];
    if (sample.t < 8000) continue;
    const agents = (sample.agents || []).filter((a) => a.type !== "bot");
    if (agents.length) picks.push({ agents, target: fracAt(sample.t) });
  }
  if (picks.length < 8) return null;
  let best = null;
  const score = (x, y) => {
    let err = 0;
    for (const pick of picks) {
      let inside = 0;
      for (const agent of pick.agents) {
        if (Math.hypot(agent.x - x, agent.y - y) <= 11) inside += 1;
      }
      const frac = inside / pick.agents.length;
      err += (frac - pick.target) ** 2;
    }
    return err;
  };
  for (let x = 8; x <= 82; x += 2) {
    for (let y = 4; y <= 66; y += 2) {
      const err = score(x, y);
      if (!best || err < best.err) best = { x, y, err };
    }
  }
  const cx = best.x;
  const cy = best.y;
  for (let x = cx - 2; x <= cx + 2; x += 0.2) {
    for (let y = cy - 2; y <= cy + 2; y += 0.2) {
      const err = score(x, y);
      if (err < best.err) best = { x, y, err };
    }
  }
  return {
    x: Number(best.x.toFixed(2)),
    y: Number(best.y.toFixed(2)),
    r: 11,
  };
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
      oasis: spec.oasis ? fitOasis(src) : null,
      metrics: src.metrics || [],
      samples: src.samples || [],
    };
    if (replay.oasis) {
      const onset = movementOnset(replay);
      const median = medianArrival(replay, onset);
      const group = groupHalfArrival(replay, onset);
      replay.clock = {
        walkOnsetMs: Math.round(onset),
        medianArrivalMs: median == null ? null : Math.round(median),
        groupHalfMs: group == null ? null : Math.round(group),
      };
    }
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
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
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
        const jumped = prev && Math.hypot(p.x - prev.wx, p.y - prev.wy) > 4;
        if (prev && !jumped) line(buf, prev.x, prev.y, x, y, rgb, 0.55);
        prev = { x, y, wx: p.x, wy: p.y };
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
  if (!process.env.SKIP_SINGLES) {
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
  if (process.env.ONLY !== "taxis") {
    await renderPair(
      ["echo-with-bridge.json", "echo-no-bridge.json"],
      ["WITH A BRIDGE", "NO BRIDGE"],
      "echo-side-by-side",
      "echo",
      16,
      { syncWalk: false, spanMs: 42000 },
    );
    await toGif("examples/videos/echo-side-by-side.mp4", "examples/videos/echo-side-by-side.gif", 960);
  }
  if (process.env.ONLY !== "echo") {
    await renderPair(
      ["taxis-social.json", "taxis-solo.json"],
      ["SOCIAL", "SOLITARY"],
      "taxis-side-by-side",
      "taxis",
      18,
      { syncWalk: true, spanMs: 90000, posterAt: 0.62 },
    );
    await toGif("examples/videos/taxis-side-by-side.mp4", "examples/videos/taxis-side-by-side.gif", 960);
  }
}

function movementOnset(replay) {
  let streak = 0;
  for (const sample of replay.samples || []) {
    const humans = (sample.agents || []).filter((a) => a.type !== "bot");
    const moving = humans.filter((a) => Math.hypot(a.vx || 0, a.vy || 0) > 1.2).length;
    if (humans.length && moving / humans.length >= 0.45) streak += 1;
    else streak = 0;
    if (streak >= 3) return Math.max(0, sample.t - 600);
  }
  return 0;
}

function medianArrival(replay, onset) {
  const oasis = replay.oasis;
  if (!oasis) return null;
  const first = {};
  for (const sample of replay.samples || []) {
    for (const agent of sample.agents || []) {
      if (agent.type === "bot" || first[agent.id] != null) continue;
      if (Math.hypot(agent.x - oasis.x, agent.y - oasis.y) <= oasis.r) first[agent.id] = sample.t;
    }
  }
  const times = Object.values(first).map((t) => t - onset).filter((t) => t >= -500).sort((a, b) => a - b);
  if (!times.length) return null;
  return times[Math.floor(times.length / 2)];
}

function groupHalfArrival(replay, onset) {
  let streak = 0;
  for (const row of replay.metrics || []) {
    if (row.t < onset + 1500) {
      streak = 0;
      continue;
    }
    if ((Number(row.oasisFraction) || 0) >= 0.5) streak += 1;
    else streak = 0;
    if (streak >= 3) return row.t - onset;
  }
  return null;
}

function paintPanel(buf, replay, specMode, tData, originX, originY, panelW, panelH, label, arrivalMs, groupMs, shownMs) {
  const tracks = unwrapTracks(replay);
  const savedW = W;
  const savedH = H;
  W = panelW;
  H = panelH;
  const local = makeFrame(panelW, panelH, [8, 14, 28]);
  const view = viewOf(tracks, replay.oasis);
  if (replay.oasis) {
    const [cx, cy] = view.to(replay.oasis.x, replay.oasis.y);
    fillCircle(local, cx, cy, replay.oasis.r * view.scale, [14, 165, 233], 0.28);
    strokeCircle(local, cx, cy, replay.oasis.r * view.scale, [186, 230, 253]);
  }
  for (const track of tracks) {
    const rgb = rgbOf({ scarfColor: track.scarf }, specMode);
    let prev = null;
    for (const p of track.pts) {
      if (p.t > tData) break;
      const [x, y] = view.to(p.x, p.y);
      const jumped = prev && Math.hypot(p.x - prev.wx, p.y - prev.wy) > 4;
      if (prev && !jumped) line(local, prev.x, prev.y, x, y, rgb, 0.6);
      prev = { x, y, wx: p.x, wy: p.y };
      track.now = p;
    }
  }
  let inside = 0;
  let n = 0;
  for (const track of tracks) {
    const p = track.now;
    if (!p) continue;
    n += 1;
    if (replay.oasis && Math.hypot(p.x - replay.oasis.x, p.y - replay.oasis.y) <= replay.oasis.r) inside += 1;
    const [x, y] = view.to(p.x, p.y);
    arrow(local, x, y, p.heading, rgbOf({ scarfColor: p.scarf || track.scarf }, specMode));
  }
  W = savedW;
  H = savedH;
  for (let y = 0; y < panelH; y += 1) {
    for (let x = 0; x < panelW; x += 1) {
      const si = (y * panelW + x) * 3;
      const di = ((originY + y) * W + (originX + x)) * 3;
      buf[di] = local[si];
      buf[di + 1] = local[si + 1];
      buf[di + 2] = local[si + 2];
    }
  }
  drawText(buf, label, originX + 16, originY + 14, 2, [241, 245, 249]);
  if (replay.oasis) {
    const pct = n ? Math.round((100 * inside) / n) : 0;
    drawText(buf, `IN PATCH ${pct}%`, originX + 16, originY + panelH - 28, 2, [186, 230, 253]);
    if (arrivalMs != null) {
      const sec = Math.max(0, Math.round(arrivalMs / 1000));
      const hit = shownMs >= arrivalMs;
      drawText(buf, `MEDIAN IN ${sec} SEC`, originX + 16, originY + 40, 2, hit ? [253, 224, 71] : [203, 213, 225]);
    }
    if (groupMs != null) {
      const sec = Math.max(0, Math.round(groupMs / 1000));
      const hit = shownMs >= groupMs;
      drawText(buf, `HALF THE GROUP ${sec} SEC`, originX + 16, originY + 64, 2, hit ? [253, 224, 71] : [148, 163, 184]);
    }
  }
}

function renderPair(files, labels, stem, mode, videoSeconds, options = {}) {
  const replays = files.map((file) => JSON.parse(fs.readFileSync(path.join(replayDir, file), "utf8")));
  const onsets = options.syncWalk ? replays.map(movementOnset) : replays.map(() => 0);
  const arrivals = replays.map((replay, i) => medianArrival(replay, onsets[i]));
  const groups = replays.map((replay, i) => groupHalfArrival(replay, onsets[i]));
  const spanMs = options.spanMs || 70000;
  const panelW = 760;
  const panelH = 640;
  const gap = 24;
  W = panelW * 2 + gap + 48;
  H = panelH + 120;
  const frames = Math.round(videoSeconds * FPS);
  const outPath = path.join(videoDir, `${stem}.mp4`);
  const posterPath = path.join(posterDir, `${stem}.png`);
  const ff = spawn("ffmpeg", [
    "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", `${W}x${H}`, "-r", String(FPS), "-i", "-",
    "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", outPath,
  ], { stdio: ["pipe", "ignore", "pipe"] });
  let ffErr = "";
  ff.stderr.on("data", (d) => { ffErr += d.toString(); });
  const done = new Promise((resolve, reject) => {
    ff.on("error", reject);
    ff.on("close", (code) => (code === 0 ? resolve() : reject(new Error(ffErr.slice(-400)))));
  });
  let poster = null;
  for (let frame = 0; frame < frames; frame += 1) {
    const shown = (frame / Math.max(1, frames - 1)) * spanMs;
    const buf = makeFrame(W, H, [6, 10, 20]);
    const clock = options.syncWalk
      ? `${Math.round(shown / 1000)} SEC AFTER WALKING STARTS`
      : `${Math.round(shown / 1000)} SEC`;
    drawText(buf, clock, 24, 18, 2, [226, 232, 240]);
    replays.forEach((replay, i) => {
      paintPanel(
        buf,
        replay,
        mode,
        onsets[i] + shown,
        24 + i * (panelW + gap),
        56,
        panelW,
        panelH,
        labels[i],
        arrivals[i],
        groups[i],
        shown,
      );
    });
    if (frame === Math.round(frames * (options.posterAt ?? 0.72))) poster = Buffer.from(buf);
    ff.stdin.write(buf);
  }
  ff.stdin.end();
  return done.then(() => new Promise((resolve, reject) => {
    if (!poster) return resolve();
    const png = spawn("ffmpeg", ["-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", `${W}x${H}`, "-i", "-", posterPath], { stdio: ["pipe", "ignore", "pipe"] });
    png.on("error", reject);
    png.on("close", (code) => (code === 0 ? resolve() : reject(new Error("sbs poster failed"))));
    png.stdin.write(poster);
    png.stdin.end();
  })).then(() => console.log(
    "rendered",
    stem,
    "onsets",
    onsets.map((t) => Math.round(t / 100) / 10),
    "arrivals",
    arrivals.map((t) => (t == null ? null : Math.round(t / 100) / 10)),
    "group",
    groups.map((t) => (t == null ? null : Math.round(t / 100) / 10)),
  ));
}

function toGif(mp4Rel, gifRel, scale) {
  const mp4 = path.join(root, mp4Rel);
  const gif = path.join(root, gifRel);
  return new Promise((resolve, reject) => {
    const ff = spawn("ffmpeg", [
      "-y", "-i", mp4,
      "-vf", `fps=10,scale=${scale}:-1:flags=lanczos,split[s0][s1];[s0]palettegen=stats_mode=diff:max_colors=96[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3`,
      gif,
    ], { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    ff.stderr.on("data", (d) => { err += d.toString(); });
    ff.on("close", (code) => (code === 0 ? resolve(console.log("gif", gifRel)) : reject(new Error(err.slice(-400)))));
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
