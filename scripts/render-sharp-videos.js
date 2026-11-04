#!/usr/bin/env node
/**
 * Sharp side-by-side mp4s of the class runs.
 * Patch clips use the last stable recordings and the 4 m patch from the log.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const readline = require("readline");
const { spawn } = require("child_process");

const root = path.join(__dirname, "..");
const shelfPath = path.join(root, "trials", "lecture-trials.json");
const replayDir = path.join(root, "examples", "replays");
const videoDir = path.join(root, "examples", "videos");
const posterDir = path.join(root, "examples", "posters");
const logFile = path.join(root, "logs", "session-2026-11-02T12-58-14-928Z.jsonl");
const W = 1920;
const H = 1080;
const FPS = 12;

function wrapLat(c) { return c - Math.floor(c + 0.5); }
function minImage(ax, ay, bx, by, s) {
  const rt3h = Math.sqrt(3) / 2;
  const laV = ay / (s * rt3h);
  const lbV = by / (s * rt3h);
  const u0 = wrapLat((bx / s - lbV / 2) - (ax / s - laV / 2));
  const v0 = wrapLat(lbV - laV);
  let best = { x: bx - ax, y: by - ay, d: Infinity };
  for (const [du, dv] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1], [-1, 1], [1, -1]]) {
    const wx = s * (u0 + du + (v0 + dv) * 0.5);
    const wy = s * rt3h * (v0 + dv);
    const d = wx * wx + wy * wy;
    if (d < best.d) best = { x: wx, y: wy, d };
  }
  return best;
}

function sliceTrial(trial, t0, t1) {
  const samples = (trial.samples || [])
    .filter((s) => s.t >= t0 && s.t <= t1)
    .map((s) => ({ t: Math.round(s.t - t0), agents: s.agents }));
  const metrics = (trial.metrics || [])
    .filter((m) => m.t >= t0 && m.t <= t1)
    .map((m) => ({ ...m, t: Math.round(m.t - t0) }));
  return { samples, metrics };
}

function tracksOf(replay, echo) {
  const hex = replay.config && replay.config.boundaryMode === "hex_torus";
  const spacing = Number(replay.config && replay.config.hexSpacing) || 24;
  const tracks = new Map();
  for (const sample of replay.samples || []) {
    for (const agent of sample.agents || []) {
      if (agent.type === "bot") continue;
      let track = tracks.get(agent.id);
      if (!track) {
        track = { scarf: agent.scarfColor, canon: { x: agent.x, y: agent.y }, pts: [] };
        tracks.set(agent.id, track);
      }
      let x = agent.x;
      let y = agent.y;
      if (hex && track.pts.length) {
        const step = minImage(track.canon.x, track.canon.y, agent.x, agent.y, spacing);
        const prev = track.pts[track.pts.length - 1];
        x = prev.x + step.x;
        y = prev.y + step.y;
      }
      track.canon = { x: agent.x, y: agent.y };
      const color = echo ? chamberColor(agent.scarfColor) : (agent.scarfColor || "#94a3b8");
      track.pts.push({ t: sample.t, x, y, heading: agent.heading || 0, color });
    }
  }
  return [...tracks.values()];
}

function chamberColor(color) {
  const hex = String(color || "");
  const r = parseInt(hex.slice(1, 3), 16) || 0;
  const g = parseInt(hex.slice(3, 5), 16) || 0;
  const b = parseInt(hex.slice(5, 7), 16) || 0;
  if (r > 180 && g > 140 && b < 120) return "#fbbf24";
  if (b > r && b > 80) return "#60a5fa";
  if (r > b && r > 100) return "#f87171";
  return "#94a3b8";
}

function viewOf(tracks, oasis, box, t) {
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  let any = false;
  for (const track of tracks) {
    for (const p of track.pts) {
      if (t != null && p.t > t) break;
      any = true;
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }
  if (!any) { minX = 0; minY = 0; maxX = 12; maxY = 12; }
  if (oasis) {
    minX = Math.min(minX, oasis.x - oasis.r - 2);
    maxX = Math.max(maxX, oasis.x + oasis.r + 2);
    minY = Math.min(minY, oasis.y - oasis.r - 2);
    maxY = Math.max(maxY, oasis.y + oasis.r + 2);
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const minSpan = 14;
  if (maxX - minX < minSpan) { minX = cx - minSpan / 2; maxX = cx + minSpan / 2; }
  if (maxY - minY < minSpan) { minY = cy - minSpan / 2; maxY = cy + minSpan / 2; }
  const pad = 6;
  minX -= pad; minY -= pad; maxX += pad; maxY += pad;
  const worldW = Math.max(12, maxX - minX);
  const worldH = Math.max(12, maxY - minY);
  const scale = Math.min(box.w / worldW, box.h / worldH);
  const ox = box.x + (box.w - worldW * scale) / 2;
  const oy = box.y + (box.h - worldH * scale) / 2;
  return {
    scale,
    to(x, y) {
      return [ox + (x - minX) * scale, oy + (y - minY) * scale];
    },
  };
}

function timeAt(replay, t) {
  const first = replay.samples && replay.samples[0] ? replay.samples[0].t : 0;
  const last = replay.samples && replay.samples.length ? replay.samples.at(-1).t : t;
  return Math.min(last, Math.max(first, t));
}

function esc(text) {
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;");
}

function panelSvg(replay, label, note, t, box) {
  const echo = replay.mode === "echo";
  const tracks = replay._tracks;
  const view = viewOf(tracks, replay.oasis, box, t);
  const parts = [];
  parts.push(`<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="18" fill="#10192c"/>`);
  if (replay.oasis) {
    const [cx, cy] = view.to(replay.oasis.x, replay.oasis.y);
    const r = replay.oasis.r * view.scale;
    parts.push(`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="rgba(56,189,248,0.22)" stroke="#7dd3fc" stroke-width="3"/>`);
    parts.push(`<text x="${cx.toFixed(1)}" y="${(cy - r - 10).toFixed(1)}" text-anchor="middle" fill="#bae6fd" font-size="18" font-family="Arial, Helvetica, sans-serif">${replay.oasis.r} m patch</text>`);
  }
  let inside = 0;
  let n = 0;
  for (const track of tracks) {
    let d = "";
    let pen = false;
    let prev = null;
    let now = null;
    for (const p of track.pts) {
      if (p.t > t) break;
      const jumped = prev && Math.hypot(p.x - prev.x, p.y - prev.y) > 4;
      const [x, y] = view.to(p.x, p.y);
      if (!pen || jumped) d += `M${x.toFixed(1)} ${y.toFixed(1)}`;
      else d += `L${x.toFixed(1)} ${y.toFixed(1)}`;
      pen = true;
      prev = p;
      now = p;
    }
    if (d) {
      parts.push(`<path d="${d}" fill="none" stroke="${now.color}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>`);
    }
    if (!now) continue;
    n += 1;
    if (replay.oasis && Math.hypot(now.x - replay.oasis.x, now.y - replay.oasis.y) <= replay.oasis.r) inside += 1;
    const [x, y] = view.to(now.x, now.y);
    const dx = Math.cos(now.heading) * 16;
    const dy = Math.sin(now.heading) * 16;
    parts.push(`<line x1="${(x - dx * 0.15).toFixed(1)}" y1="${(y - dy * 0.15).toFixed(1)}" x2="${(x + dx).toFixed(1)}" y2="${(y + dy).toFixed(1)}" stroke="${now.color}" stroke-width="3" stroke-linecap="round"/>`);
    parts.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5.5" fill="${now.color}"/>`);
  }
  parts.push(`<text x="${box.x + 28}" y="${box.y + 42}" fill="#f8fafc" font-size="32" font-weight="700" font-family="Arial, Helvetica, sans-serif">${esc(label)}</text>`);
  parts.push(`<text x="${box.x + 28}" y="${box.y + 74}" fill="#cbd5e1" font-size="20" font-family="Arial, Helvetica, sans-serif">${esc(note)}</text>`);
  const foot = replay.oasis ? `${inside} of ${n} in the patch` : `${n} foxes`;
  parts.push(`<text x="${box.x + 28}" y="${box.y + box.h - 24}" fill="#e2e8f0" font-size="22" font-family="Arial, Helvetica, sans-serif">${esc(foot)}</text>`);
  return parts.join("");
}

function frameSvg(title, clock, panels, chart) {
  const body = panels.map((p) => panelSvg(p.replay, p.label, p.note, p.t, p.box)).join("");
  const plot = chart ? chartSvg(chart) : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#070d18"/>
  <text x="56" y="52" fill="#f8fafc" font-size="32" font-weight="700" font-family="Arial, Helvetica, sans-serif">${esc(title)}</text>
  <text x="${W - 56}" y="52" text-anchor="end" fill="#fde68a" font-size="30" font-family="Arial, Helvetica, sans-serif">${esc(clock)}</text>
  ${body}
  ${plot}
</svg>`;
}

function chartSvg(chart) {
  const x = 56;
  const y = H - 168;
  const w = W - 112;
  const h = 148;
  const padL = 64;
  const padR = 24;
  const padT = 36;
  const padB = 28;
  const pw = w - padL - padR;
  const ph = h - padT - padB;
  const X = (t) => x + padL + (Math.max(0, Math.min(chart.tMax, t)) / chart.tMax) * pw;
  const Y = (v) => y + padT + (1 - Math.max(0, Math.min(chart.yMax, v)) / chart.yMax) * ph;
  const parts = [];
  parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="16" fill="#10192c"/>`);
  parts.push(`<text x="${x + 20}" y="${y + 24}" fill="#f8fafc" font-size="18" font-weight="700" font-family="Arial, Helvetica, sans-serif">${esc(chart.title)}</text>`);
  let legendX = x + w - 24;
  for (const line of [...chart.lines].reverse()) {
    const label = esc(line.name);
    legendX -= label.length * 9 + 28;
    parts.push(`<line x1="${legendX}" y1="${y + 18}" x2="${legendX + 18}" y2="${y + 18}" stroke="${line.color}" stroke-width="3" stroke-linecap="round"/>`);
    parts.push(`<text x="${legendX + 24}" y="${y + 23}" fill="#e2e8f0" font-size="15" font-family="Arial, Helvetica, sans-serif">${label}</text>`);
  }
  for (let g = 0; g <= 4; g += 1) {
    const v = (chart.yMax * g) / 4;
    const yy = Y(v);
    parts.push(`<line x1="${x + padL}" y1="${yy.toFixed(1)}" x2="${x + padL + pw}" y2="${yy.toFixed(1)}" stroke="#1e293b" stroke-width="1"/>`);
    const label = chart.yMax <= 1 ? v.toFixed(1) : String(Math.round(v));
    parts.push(`<text x="${x + padL - 10}" y="${(yy + 4).toFixed(1)}" text-anchor="end" fill="#94a3b8" font-size="13" font-family="Arial, Helvetica, sans-serif">${label}</text>`);
  }
  for (const line of chart.lines) {
    let d = "";
    let last = null;
    for (const p of line.pts) {
      if (p.t > chart.cursor) break;
      const cmd = d ? "L" : "M";
      d += `${cmd}${X(p.t).toFixed(1)} ${Y(p.v).toFixed(1)}`;
      last = p;
    }
    if (last && chart.cursor > last.t) {
      d += `L${X(chart.cursor).toFixed(1)} ${Y(last.v).toFixed(1)}`;
    }
    if (d) parts.push(`<path d="${d}" fill="none" stroke="${line.color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`);
  }
  const cx = X(chart.cursor);
  parts.push(`<line x1="${cx.toFixed(1)}" y1="${y + padT}" x2="${cx.toFixed(1)}" y2="${y + padT + ph}" stroke="#fde68a" stroke-width="1.5" opacity="0.85"/>`);
  return parts.join("");
}

function run(cmd, args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: [input ? "pipe" : "ignore", "ignore", "pipe"] });
    let err = "";
    child.stderr.on("data", (d) => { err += d.toString(); });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(err.slice(-500)))));
    if (input) {
      child.stdin.write(input);
      child.stdin.end();
    }
  });
}

async function pool(items, n, fn) {
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i;
      i += 1;
      await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: n }, worker));
}

async function renderClip(name, seconds, draw) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "classroom-"));
  const frames = Math.round(seconds * FPS);
  const svgs = [];
  for (let i = 0; i < frames; i += 1) svgs.push(draw(i / Math.max(1, frames - 1)));
  await pool(svgs, 8, async (svg, i) => {
    const png = path.join(dir, `f-${String(i).padStart(4, "0")}.png`);
    await run("rsvg-convert", ["-o", png], svg);
  });
  const out = path.join(videoDir, `${name}.mp4`);
  const poster = path.join(posterDir, `${name}.png`);
  await run("ffmpeg", [
    "-y", "-framerate", String(FPS), "-i", path.join(dir, "f-%04d.png"),
    "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "17", "-preset", "medium",
    "-movflags", "+faststart", out,
  ]);
  const posterIndex = String(Math.min(frames - 1, Math.round(frames * 0.92))).padStart(4, "0");
  fs.copyFileSync(path.join(dir, `f-${posterIndex}.png`), poster);
  fs.rmSync(dir, { recursive: true, force: true });
  const stat = fs.statSync(out);
  console.log("wrote", path.relative(root, out), `${(stat.size / 1e6).toFixed(1)} MB`);
}

function medianArrival(replay) {
  const oasis = replay.oasis;
  if (!oasis) return null;
  const first = {};
  for (const sample of replay.samples) {
    for (const agent of sample.agents) {
      if (agent.type === "bot" || first[agent.id] != null) continue;
      if (Math.hypot(agent.x - oasis.x, agent.y - oasis.y) <= oasis.r) first[agent.id] = sample.t;
    }
  }
  const times = Object.values(first).sort((a, b) => a - b);
  if (!times.length) return null;
  return times[Math.floor(times.length / 2)];
}

function buildPatchReplays() {
  const shelf = JSON.parse(fs.readFileSync(shelfPath, "utf8"));
  const byId = (id) => shelf.trials.find((t) => t.id.startsWith(id));
  const socialSrc = byId("28bccc16");
  const soloSrc = byId("4f5700f1");
  const socialSlice = sliceTrial(socialSrc, 18000, socialSrc.samples.at(-1).t);
  const soloSlice = sliceTrial(soloSrc, 0, soloSrc.samples.at(-1).t);
  const social = {
    id: "example-taxis-social",
    name: "Example — patch finding, social",
    example: true,
    kept: false,
    preset: "expt6_taxis",
    title: "Patch finding, social",
    blurb: "The last social take. The patch is 4 m across. By 36 seconds, twelve of the thirteen foxes are stopped inside it.",
    citation: "Berdahl et al., Science (2013).",
    config: { ...socialSrc.config, visibilityRule: "all", boundaryMode: "reflective" },
    oasis: { x: 27.7, y: 27.3, r: 4 },
    mode: "taxis",
    metrics: socialSlice.metrics,
    samples: socialSlice.samples,
  };
  social.clock = {
    walkOnsetMs: 0,
    medianArrivalMs: medianArrival(social),
    togetherMs: 36000,
  };
  const solo = {
    id: "example-taxis-solo",
    name: "Example — patch finding, solitary",
    example: true,
    kept: false,
    preset: "expt6_taxis",
    title: "Patch finding, solitary",
    blurb: "The last solitary take, from the start of the recording. The 4 m patch is empty at the beginning. A few foxes reach it later. The group is still spread at the end.",
    citation: "Berdahl et al., Science (2013), the asocial control.",
    config: { ...soloSrc.config, visibilityRule: "blind_solo", boundaryMode: "reflective" },
    oasis: { x: 52.5, y: 20.5, r: 4 },
    mode: "taxis",
    metrics: soloSlice.metrics,
    samples: soloSlice.samples,
  };
  solo.clock = {
    walkOnsetMs: 0,
    medianArrivalMs: medianArrival(solo),
    togetherMs: null,
  };
  fs.writeFileSync(path.join(replayDir, "taxis-social.json"), JSON.stringify(social));
  fs.writeFileSync(path.join(replayDir, "taxis-solo.json"), JSON.stringify(solo));
  console.log("social", social.samples.length, "median", social.clock.medianArrivalMs, "dur", social.samples.at(-1).t);
  console.log("solo", solo.samples.length, "median", solo.clock.medianArrivalMs, "dur", solo.samples.at(-1).t);
  return { social, solo };
}

function orderOf(agents) {
  let c = 0;
  let s = 0;
  let n = 0;
  for (const agent of agents) {
    if (agent.type === "bot") continue;
    c += Math.cos(agent.heading || 0);
    s += Math.sin(agent.heading || 0);
    n += 1;
  }
  return n ? Math.hypot(c, s) / n : 0;
}

function readLogSamples(tStart, tEnd, scarfById) {
  const buckets = new Map();
  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({ input: fs.createReadStream(logFile), crlfDelay: Infinity });
    rl.on("line", (line) => {
      if (!line.includes('"type":"sample"') || !line.includes('"kind":"human"')) return;
      const tm = line.match(/"t":(\d+)/);
      if (!tm) return;
      const t = Number(tm[1]);
      if (t < tStart || t >= tEnd) return;
      let row;
      try { row = JSON.parse(line); } catch { return; }
      if (row.kind !== "human") return;
      const key = Math.round(t / 200) * 200;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = [];
        buckets.set(key, bucket);
      }
      if (bucket.some((agent) => agent.id === row.id)) return;
      bucket.push({
        id: row.id,
        type: "human",
        x: row.x,
        y: row.y,
        vx: row.vx,
        vy: row.vy,
        heading: row.heading,
        scarfColor: scarfById.get(row.id) || "#94a3b8",
      });
    });
    rl.on("close", () => {
      resolve([...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([t, agents]) => ({ t, agents })));
    });
    rl.on("error", reject);
  });
}

async function extendBridge(replay, trial) {
  const scarfById = new Map();
  for (const sample of replay.samples) {
    for (const agent of sample.agents) scarfById.set(agent.id, agent.scarfColor);
  }
  const leadMs = 14000;
  const lead = await readLogSamples(trial.t0 - leadMs, trial.t0, scarfById);
  if (!lead.length) return replay;
  const origin = lead[0].t;
  const shift = trial.t0 - origin;
  replay.samples = [
    ...lead.map((sample) => ({ t: sample.t - origin, agents: sample.agents })),
    ...replay.samples.map((sample) => ({ ...sample, t: sample.t + shift })),
  ];
  replay.metrics = [
    ...lead.map((sample) => ({ t: sample.t - origin, humanPolarization: Number(orderOf(sample.agents).toFixed(4)) })),
    ...(replay.metrics || []).map((row) => ({ ...row, t: row.t + shift })),
  ];
  replay.leadMs = shift;
  return replay;
}

function phiSeries(replay) {
  const pts = [];
  for (const row of replay.metrics || []) {
    if (!Number.isFinite(row.humanPolarization)) continue;
    if (pts.length && row.t - pts[pts.length - 1].t < 400) continue;
    pts.push({ t: row.t, v: row.humanPolarization });
  }
  return pts;
}

function stillOutsideSeries(replay) {
  const oasis = replay.oasis;
  const arrived = new Set();
  const pts = [];
  let lastT = -1e9;
  for (const sample of replay.samples) {
    const humans = (sample.agents || []).filter((agent) => agent.type !== "bot");
    for (const agent of humans) {
      if (Math.hypot(agent.x - oasis.x, agent.y - oasis.y) <= oasis.r) arrived.add(agent.id);
    }
    if (sample.t - lastT < 400 && sample !== replay.samples.at(-1)) continue;
    lastT = sample.t;
    pts.push({ t: sample.t, v: Math.max(0, humans.length - arrived.size) });
  }
  return pts;
}

async function loadEcho() {
  const shelf = JSON.parse(fs.readFileSync(shelfPath, "utf8"));
  const byId = (id) => shelf.trials.find((trial) => trial.id.startsWith(id));
  const write = (src, meta) => {
    const replay = {
      id: meta.id,
      name: meta.name,
      example: true,
      kept: false,
      preset: src.preset,
      title: meta.title,
      blurb: meta.blurb,
      citation: meta.citation,
      config: src.config || {},
      oasis: null,
      metrics: src.metrics || [],
      samples: src.samples || [],
      mode: "echo",
    };
    return { replay, src, meta };
  };
  const bridgePack = write(byId("89fa7291"), {
    file: "echo-with-bridge.json",
    id: "example-echo-bridge",
    name: "Example — echo chambers, with a bridge",
    title: "Echo chambers, with a bridge",
    blurb: "The bridge take, starting when the chambers were switched on, about 14 seconds before record.",
    citation: "Classroom network demo. The bridge is the extra link between the two chambers.",
  });
  await extendBridge(bridgePack.replay, bridgePack.src);
  fs.writeFileSync(path.join(replayDir, bridgePack.meta.file), JSON.stringify(bridgePack.replay));
  bridgePack.replay._tracks = tracksOf(bridgePack.replay, true);
  const nonePack = write(byId("5c3ffa80"), {
    file: "echo-no-bridge.json",
    id: "example-echo-nobridge",
    name: "Example — echo chambers, no bridge",
    title: "Echo chambers, no bridge",
    blurb: "Blue and red leave on opposite headings and stay there. Nobody can see the other chamber.",
    citation: "Same hidden split, without a bridge.",
  });
  fs.writeFileSync(path.join(replayDir, nonePack.meta.file), JSON.stringify(nonePack.replay));
  nonePack.replay._tracks = tracksOf(nonePack.replay, true);
  console.log("echo bridge", bridgePack.replay.samples.length, "dur", bridgePack.replay.samples.at(-1).t, "lead", bridgePack.replay.leadMs);
  console.log("echo none", nonePack.replay.samples.length, "dur", nonePack.replay.samples.at(-1).t);
  return { bridge: bridgePack.replay, none: nonePack.replay };
}

async function main() {
  fs.mkdirSync(videoDir, { recursive: true });
  fs.mkdirSync(posterDir, { recursive: true });
  const { social, solo } = buildPatchReplays();
  social._tracks = tracksOf(social, false);
  solo._tracks = tracksOf(solo, false);
  const echo = await loadEcho();
  const gap = 36;
  const panelW = (W - 56 * 2 - gap) / 2;
  const panelH = H - 250;
  const top = 72;
  const box = (i) => ({ x: 56 + i * (panelW + gap), y: top, w: panelW, h: panelH });

  const echoEnd = Math.max(echo.bridge.samples.at(-1).t, echo.none.samples.at(-1).t);
  const echoChart = {
    title: "Order  \u03a6",
    yMax: 1,
    tMax: echoEnd,
    lines: [
      { name: "With a bridge", color: "#fde68a", pts: phiSeries(echo.bridge) },
      { name: "No bridge", color: "#7dd3fc", pts: phiSeries(echo.none) },
    ],
  };
  await renderClip("echo-side-by-side", 16, (u) => {
    const shown = u * echoEnd;
    echoChart.cursor = shown;
    return frameSvg("Echo chambers", `${Math.round(shown / 1000)} s`, [
      { replay: echo.bridge, label: "With a bridge", note: "Starts when the chambers switch on", t: timeAt(echo.bridge, shown), box: box(0) },
      { replay: echo.none, label: "No bridge", note: "The two headings never meet", t: timeAt(echo.none, shown), box: box(1) },
    ], echoChart);
  });

  const soloEnd = solo.samples.at(-1).t;
  const taxisChart = {
    title: "Still to arrive",
    yMax: 13,
    tMax: soloEnd,
    lines: [
      { name: "Social", color: "#fde68a", pts: stillOutsideSeries(social) },
      { name: "Solitary", color: "#7dd3fc", pts: stillOutsideSeries(solo) },
    ],
  };
  await renderClip("taxis-side-by-side", 18, (u) => {
    const shown = u * soloEnd;
    taxisChart.cursor = shown;
    const socialT = timeAt(social, shown);
    const socialNote = socialT >= 36000 ? "Stopped together in the 4 m patch" : "Everyone can see everyone";
    const soloNote = shown >= 40000 ? "Still spread across the field" : "Patch empty at the start";
    return frameSvg("Finding the patch", `${Math.round(shown / 1000)} s`, [
      { replay: social, label: "Social", note: socialNote, t: socialT, box: box(0) },
      { replay: solo, label: "Solitary", note: soloNote, t: timeAt(solo, shown), box: box(1) },
    ], taxisChart);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
