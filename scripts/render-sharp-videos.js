#!/usr/bin/env node
/**
 * Sharp side-by-side mp4s of the class runs.
 * Patch clips use the last stable recordings and the 4 m patch from the log.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const root = path.join(__dirname, "..");
const shelfPath = path.join(root, "trials", "lecture-trials.json");
const replayDir = path.join(root, "examples", "replays");
const videoDir = path.join(root, "examples", "videos");
const posterDir = path.join(root, "examples", "posters");
const SOURCE_LOG = "session-2026-11-02T12-58-14-928Z.jsonl";
const W = 1920;
const H = 1360;
const FPS = 12;
const CHART_H = 480;
const plotDir = path.join(root, "examples", "plots");
const figureDir = path.join(root, "examples", "figures");

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

function chartSvg(chart, box) {
  const x = box ? box.x : 56;
  const y = box ? box.y : H - CHART_H - 28;
  const w = box ? box.w : W - 112;
  const h = box ? box.h : CHART_H;
  const padL = Math.round(h * 0.16);
  const padR = Math.round(h * 0.06);
  const padT = Math.round(h * 0.16);
  const padB = Math.round(h * 0.14);
  const titleSize = Math.max(22, Math.round(h * 0.07));
  const tickSize = Math.max(16, Math.round(h * 0.045));
  const legendSize = Math.max(16, Math.round(h * 0.048));
  const stroke = Math.max(3.2, h * 0.009);
  const pw = w - padL - padR;
  const ph = h - padT - padB;
  const X = (t) => x + padL + (Math.max(0, Math.min(chart.tMax, t)) / chart.tMax) * pw;
  const Y = (v) => y + padT + (1 - Math.max(0, Math.min(chart.yMax, v)) / chart.yMax) * ph;
  const parts = [];
  parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="16" fill="#10192c"/>`);
  parts.push(`<text x="${x + 22}" y="${y + titleSize + 8}" fill="#f8fafc" font-size="${titleSize}" font-weight="700" font-family="Arial, Helvetica, sans-serif">${esc(chart.title)}</text>`);
  if (chart.yLabel) {
    parts.push(`<text x="${x + 18}" y="${y + h / 2}" fill="#cbd5e1" font-size="${tickSize}" font-family="Arial, Helvetica, sans-serif" transform="rotate(-90 ${x + 18} ${y + h / 2})">${esc(chart.yLabel)}</text>`);
  }
  let legendX = x + w - 28;
  for (const line of [...chart.lines].reverse()) {
    const label = esc(line.name);
    legendX -= label.length * legendSize * 0.56 + 36;
    parts.push(`<line x1="${legendX}" y1="${y + titleSize}" x2="${legendX + 28}" y2="${y + titleSize}" stroke="${line.color}" stroke-width="${stroke}" stroke-linecap="round"/>`);
    parts.push(`<text x="${legendX + 34}" y="${y + titleSize + 6}" fill="#e2e8f0" font-size="${legendSize}" font-family="Arial, Helvetica, sans-serif">${label}</text>`);
  }
  for (let g = 0; g <= 4; g += 1) {
    const v = (chart.yMax * g) / 4;
    const yy = Y(v);
    parts.push(`<line x1="${x + padL}" y1="${yy.toFixed(1)}" x2="${x + padL + pw}" y2="${yy.toFixed(1)}" stroke="#1e293b" stroke-width="1"/>`);
    const label = chart.yMax <= 1 ? v.toFixed(1) : String(Math.round(v));
    parts.push(`<text x="${x + padL - 12}" y="${(yy + tickSize * 0.35).toFixed(1)}" text-anchor="end" fill="#cbd5e1" font-size="${tickSize}" font-family="Arial, Helvetica, sans-serif">${label}</text>`);
  }
  for (let g = 0; g <= 4; g += 1) {
    const t = (chart.tMax * g) / 4;
    const xx = X(t);
    parts.push(`<text x="${xx.toFixed(1)}" y="${(y + padT + ph + tickSize + 8).toFixed(1)}" text-anchor="middle" fill="#94a3b8" font-size="${tickSize}" font-family="Arial, Helvetica, sans-serif">${Math.round(t / 1000)}</text>`);
  }
  const xLabel = chart.xLabel || "seconds";
  parts.push(`<text x="${x + padL + pw}" y="${y + h - 8}" text-anchor="end" fill="#94a3b8" font-size="${tickSize}" font-family="Arial, Helvetica, sans-serif">${esc(xLabel)}</text>`);
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
    if (d) parts.push(`<path d="${d}" fill="none" stroke="${line.color}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"/>`);
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

function lastMassJumpMs(trial) {
  const prev = new Map();
  let cut = 0;
  for (const sample of trial.samples || []) {
    let moved = 0;
    for (const agent of sample.agents || []) {
      if (agent.type === "bot") continue;
      const p = prev.get(agent.id);
      if (p && Math.hypot(agent.x - p.x, agent.y - p.y) > 8) moved += 1;
      prev.set(agent.id, { x: agent.x, y: agent.y });
    }
    if (moved >= 6) cut = sample.t;
  }
  return cut;
}

function sliceAfterReset(trial) {
  const cut = lastMassJumpMs(trial);
  return sliceTrial(trial, cut + 1, trial.samples.at(-1).t);
}

function groupHalfArrival(replay) {
  const oasis = replay.oasis;
  if (!oasis) return null;
  const arrived = new Set();
  let n = 0;
  for (const sample of replay.samples) {
    const humans = (sample.agents || []).filter((agent) => agent.type !== "bot");
    n = humans.length;
    for (const agent of humans) {
      if (Math.hypot(agent.x - oasis.x, agent.y - oasis.y) <= oasis.r) arrived.add(agent.id);
    }
    if (n && arrived.size >= Math.ceil(n / 2)) return sample.t;
  }
  return null;
}

function allInsideMs(replay) {
  const oasis = replay.oasis;
  if (!oasis) return null;
  const arrived = new Set();
  let n = 0;
  for (const sample of replay.samples) {
    const humans = (sample.agents || []).filter((agent) => agent.type !== "bot");
    n = humans.length;
    for (const agent of humans) {
      if (Math.hypot(agent.x - oasis.x, agent.y - oasis.y) <= oasis.r) arrived.add(agent.id);
    }
    if (n && arrived.size >= n) return sample.t;
  }
  return null;
}

function buildPatchReplays() {
  const shelf = JSON.parse(fs.readFileSync(shelfPath, "utf8"));
  const byId = (id) => shelf.trials.find((t) => t.id.startsWith(id) && !t.example);
  // Last two taxis takes in session-2026-11-02T12-58-14-928Z. Earlier takes
  // move the patch several times. Record also starts a few seconds before the
  // preset, while foxes are still inside the previous patch, so the clip
  // begins on the sample after the last position reset.
  const socialSrc = byId("28bccc16");
  const soloSrc = byId("4f5700f1");
  const socialSlice = sliceAfterReset(socialSrc);
  const soloSlice = sliceAfterReset(soloSrc);
  const social = {
    id: "example-taxis-social",
    name: "Example — patch finding, social",
    example: true,
    kept: false,
    preset: "expt6_taxis",
    title: "Patch finding, social",
    blurb: "Last social take, from the moment the new 4 m patch is empty. Everyone can see everyone. All 13 reach it.",
    citation: "Berdahl et al., Science (2013).",
    config: { ...socialSrc.config, visibilityRule: "all", boundaryMode: "reflective" },
    oasis: { x: 28.0, y: 27.6, r: 4 },
    mode: "taxis",
    metrics: socialSlice.metrics,
    samples: socialSlice.samples,
    source: {
      log: SOURCE_LOG,
      trialId: socialSrc.id,
      trialName: socialSrc.name,
      why: "Final social flock take. Starts after the last reset, when the new patch is empty.",
    },
  };
  social.clock = {
    walkOnsetMs: 0,
    medianArrivalMs: groupHalfArrival(social),
    togetherMs: allInsideMs(social),
  };
  const solo = {
    id: "example-taxis-solo",
    name: "Example — patch finding, solitary",
    example: true,
    kept: false,
    preset: "expt6_taxis",
    title: "Patch finding, solitary",
    blurb: "Last solitary take, from the moment the new 4 m patch is empty. Nobody can see anyone else. Several are still out at the end.",
    citation: "Berdahl et al., Science (2013), the asocial control.",
    config: { ...soloSrc.config, visibilityRule: "blind_solo", boundaryMode: "reflective" },
    oasis: { x: 52.8, y: 20.6, r: 4 },
    mode: "taxis",
    metrics: soloSlice.metrics,
    samples: soloSlice.samples,
    source: {
      log: SOURCE_LOG,
      trialId: soloSrc.id,
      trialName: soloSrc.name,
      why: "Final asocial take. The recording itself starts while most foxes are still in the previous social patch; this clip starts after that reset.",
    },
  };
  solo.clock = {
    walkOnsetMs: 0,
    medianArrivalMs: groupHalfArrival(solo),
    togetherMs: allInsideMs(solo),
  };
  fs.writeFileSync(path.join(replayDir, "taxis-social.json"), JSON.stringify(social));
  fs.writeFileSync(path.join(replayDir, "taxis-solo.json"), JSON.stringify(solo));
  console.log("social", social.samples.length, "half", social.clock.medianArrivalMs, "all", social.clock.togetherMs, "dur", social.samples.at(-1).t);
  console.log("solo", solo.samples.length, "half", solo.clock.medianArrivalMs, "all", solo.clock.togetherMs, "dur", solo.samples.at(-1).t);
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

function phiSeries(replay) {
  const pts = [];
  let lastT = -1e9;
  for (const sample of replay.samples || []) {
    if (sample.t - lastT < 400 && sample !== replay.samples.at(-1)) continue;
    lastT = sample.t;
    pts.push({ t: sample.t, v: orderOf(sample.agents || []) });
  }
  return pts;
}

function arrivedSeries(replay) {
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
    pts.push({ t: sample.t, v: arrived.size });
  }
  return pts;
}

function loadEcho() {
  const shelf = JSON.parse(fs.readFileSync(shelfPath, "utf8"));
  const byId = (id) => shelf.trials.find((trial) => trial.id.startsWith(id) && !trial.example);
  const packs = [
    {
      src: byId("614bbccf"),
      file: "echo-with-bridge.json",
      id: "example-echo-bridge",
      name: "Example — echo chambers, with a bridge",
      title: "Echo chambers, with a bridge",
      blurb: "The later bridge take. It starts when the chambers are switched on, with the two colours already on different headings. Order then rises to 1.",
      citation: "Classroom network demo. The bridge is the extra link between the two chambers. No separate paper is cited in the dashboard.",
      why: "Trial echo chambers 2, not the earlier take that was already aligned and then jumped. Starts just after the chamber reset.",
    },
    {
      src: byId("5c3ffa80"),
      file: "echo-no-bridge.json",
      id: "example-echo-nobridge",
      name: "Example — echo chambers, no bridge",
      title: "Echo chambers, no bridge",
      blurb: "Blue and red leave on different headings and stay there. Order stays low.",
      citation: "Same classroom network, with the bridge removed.",
      why: "The no-bridge take. Starts just after its chamber reset, not in the middle of the split.",
    },
  ];
  const out = {};
  for (const meta of packs) {
    const sliced = sliceAfterReset(meta.src);
    const replay = {
      id: meta.id,
      name: meta.name,
      example: true,
      kept: false,
      preset: meta.src.preset,
      title: meta.title,
      blurb: meta.blurb,
      citation: meta.citation,
      config: meta.src.config || {},
      oasis: null,
      metrics: sliced.metrics,
      samples: sliced.samples,
      mode: "echo",
      source: {
        log: SOURCE_LOG,
        trialId: meta.src.id,
        trialName: meta.src.name,
        why: meta.why,
      },
    };
    fs.writeFileSync(path.join(replayDir, meta.file), JSON.stringify(replay));
    replay._tracks = tracksOf(replay, true);
    console.log(meta.file, replay.samples.length, "dur", replay.samples.at(-1).t, "phi0", orderOf(replay.samples[0].agents).toFixed(2), "phi1", orderOf(replay.samples.at(-1).agents).toFixed(2));
    out[meta.file] = replay;
  }
  return { bridge: out["echo-with-bridge.json"], none: out["echo-no-bridge.json"] };
}

function plotSvg(chart) {
  const w = 2200;
  const h = 860;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="${w}" height="${h}" fill="#070d18"/>
  ${chartSvg(chart, { x: 36, y: 28, w: w - 72, h: h - 56 })}
</svg>`;
}

function schematicSheet() {
  const card = (x, y, w, h, title, body) => `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="18" fill="#10192c"/>
    <text x="${x + 22}" y="${y + 36}" fill="#f8fafc" font-size="22" font-weight="700" font-family="Arial, Helvetica, sans-serif">${esc(title)}</text>
    ${body}`;
  const w = 1600;
  const h = 1680;
  const cw = 740;
  const ch = 390;
  const gap = 36;
  const ox = 42;
  const oy = 88;
  const cells = [
    card(ox, oy, cw, ch, "Order without a leader", `
      <text x="${ox + 22}" y="${oy + 68}" fill="#94a3b8" font-size="16" font-family="Arial, Helvetica, sans-serif">Vicsek 1995 · Buhl 2006</text>
      <polyline fill="none" stroke="#38bdf8" stroke-width="4" points="${ox + 70},${oy + 300} ${ox + 220},${oy + 292} ${ox + 340},${oy + 250} ${ox + 460},${oy + 140} ${ox + 680},${oy + 110}"/>
      <text x="${ox + 80}" y="${oy + 340}" fill="#94a3b8" font-size="15" font-family="Arial, Helvetica, sans-serif">noise high</text>
      <text x="${ox + 560}" y="${oy + 340}" fill="#94a3b8" font-size="15" font-family="Arial, Helvetica, sans-serif">noise low →</text>
      <text x="${ox + 70}" y="${oy + 100}" fill="#7dd3fc" font-size="15" font-family="Arial, Helvetica, sans-serif">Φ → 1</text>`),
    card(ox + cw + gap, oy, cw, ch, "One peak, or two", `
      <text x="${ox + cw + gap + 22}" y="${oy + 68}" fill="#94a3b8" font-size="16" font-family="Arial, Helvetica, sans-serif">Couzin 2005</text>
      <rect x="${ox + cw + gap + 40}" y="${oy + 110}" width="300" height="180" fill="none" stroke="#334155"/>
      <rect x="${ox + cw + gap + 160}" y="${oy + 150}" width="36" height="140" fill="#38bdf8"/>
      <text x="${ox + cw + gap + 70}" y="${oy + 320}" fill="#94a3b8" font-size="15" font-family="Arial, Helvetica, sans-serif">small split: they average</text>
      <rect x="${ox + cw + gap + 390}" y="${oy + 110}" width="300" height="180" fill="none" stroke="#334155"/>
      <rect x="${ox + cw + gap + 430}" y="${oy + 170}" width="36" height="120" fill="#38bdf8"/>
      <rect x="${ox + cw + gap + 610}" y="${oy + 170}" width="36" height="120" fill="#fbbf24"/>
      <text x="${ox + cw + gap + 410}" y="${oy + 320}" fill="#94a3b8" font-size="15" font-family="Arial, Helvetica, sans-serif">large split: they choose</text>`),
    card(ox, oy + ch + gap, cw, ch, "A few informed foxes", `
      <text x="${ox + 22}" y="${oy + ch + gap + 68}" fill="#94a3b8" font-size="16" font-family="Arial, Helvetica, sans-serif">Couzin 2005</text>
      <text x="${ox + 48}" y="${oy + ch + gap + 140}" fill="#fde68a" font-size="18" font-family="Arial, Helvetica, sans-serif">★ ★ ★  informed minority</text>
      <text x="${ox + 48}" y="${oy + ch + gap + 200}" fill="#7dd3fc" font-size="18" font-family="Arial, Helvetica, sans-serif">the rest only match who they can see</text>
      <text x="${ox + 48}" y="${oy + ch + gap + 280}" fill="#e2e8f0" font-size="18" font-family="Arial, Helvetica, sans-serif">The hidden direction can steer all fifteen.</text>`),
    card(ox + cw + gap, oy + ch + gap, cw, ch, "Echo chambers", `
      <text x="${ox + cw + gap + 22}" y="${oy + ch + gap + 68}" fill="#94a3b8" font-size="16" font-family="Arial, Helvetica, sans-serif">This lecture’s network. Not a copied paper figure.</text>
      <circle cx="${ox + cw + gap + 150}" cy="${oy + ch + gap + 180}" r="54" fill="none" stroke="#60a5fa" stroke-width="3"/>
      <circle cx="${ox + cw + gap + 430}" cy="${oy + ch + gap + 180}" r="54" fill="none" stroke="#f87171" stroke-width="3"/>
      <circle cx="${ox + cw + gap + 290}" cy="${oy + ch + gap + 180}" r="16" fill="#fbbf24"/>
      <text x="${ox + cw + gap + 120}" y="${oy + ch + gap + 270}" fill="#93c5fd" font-size="16" font-family="Arial, Helvetica, sans-serif">blue sees blue</text>
      <text x="${ox + cw + gap + 380}" y="${oy + ch + gap + 270}" fill="#fca5a5" font-size="16" font-family="Arial, Helvetica, sans-serif">red sees red</text>
      <text x="${ox + cw + gap + 40}" y="${oy + ch + gap + 330}" fill="#e2e8f0" font-size="16" font-family="Arial, Helvetica, sans-serif">Gold is the bridge. Without it, the headings need not meet.</text>`),
    card(ox, oy + 2 * (ch + gap), cw, ch, "Neighbours, not a radius", `
      <text x="${ox + 22}" y="${oy + 2 * (ch + gap) + 68}" fill="#94a3b8" font-size="16" font-family="Arial, Helvetica, sans-serif">Ballerini 2008</text>
      <polyline fill="none" stroke="#2dd4bf" stroke-width="4" points="${ox + 80},${oy + 2 * (ch + gap) + 300} ${ox + 280},${oy + 2 * (ch + gap) + 220} ${ox + 680},${oy + 2 * (ch + gap) + 120}"/>
      <polyline fill="none" stroke="#94a3b8" stroke-width="3" points="${ox + 80},${oy + 2 * (ch + gap) + 310} ${ox + 360},${oy + 2 * (ch + gap) + 280} ${ox + 680},${oy + 2 * (ch + gap) + 250}"/>
      <text x="${ox + 500}" y="${oy + 2 * (ch + gap) + 110}" fill="#5eead4" font-size="16" font-family="Arial, Helvetica, sans-serif">k nearest</text>
      <text x="${ox + 520}" y="${oy + 2 * (ch + gap) + 245}" fill="#94a3b8" font-size="16" font-family="Arial, Helvetica, sans-serif">fixed radius</text>
      <text x="${ox + 80}" y="${oy + 2 * (ch + gap) + 350}" fill="#94a3b8" font-size="15" font-family="Arial, Helvetica, sans-serif">group stretched →</text>`),
    card(ox + cw + gap, oy + 2 * (ch + gap), cw, ch, "The patch you cannot see", `
      <text x="${ox + cw + gap + 22}" y="${oy + 2 * (ch + gap) + 68}" fill="#94a3b8" font-size="16" font-family="Arial, Helvetica, sans-serif">Berdahl 2013</text>
      <polyline fill="none" stroke="#fde68a" stroke-width="4" points="${ox + cw + gap + 70},${oy + 2 * (ch + gap) + 300} ${ox + cw + gap + 220},${oy + 2 * (ch + gap) + 260} ${ox + cw + gap + 360},${oy + 2 * (ch + gap) + 150} ${ox + cw + gap + 680},${oy + 2 * (ch + gap) + 120}"/>
      <polyline fill="none" stroke="#7dd3fc" stroke-width="4" points="${ox + cw + gap + 70},${oy + 2 * (ch + gap) + 300} ${ox + cw + gap + 280},${oy + 2 * (ch + gap) + 270} ${ox + cw + gap + 480},${oy + 2 * (ch + gap) + 230} ${ox + cw + gap + 680},${oy + 2 * (ch + gap) + 200}"/>
      <text x="${ox + cw + gap + 520}" y="${oy + 2 * (ch + gap) + 110}" fill="#fde68a" font-size="16" font-family="Arial, Helvetica, sans-serif">social</text>
      <text x="${ox + cw + gap + 540}" y="${oy + 2 * (ch + gap) + 190}" fill="#7dd3fc" font-size="16" font-family="Arial, Helvetica, sans-serif">solitary</text>
      <text x="${ox + cw + gap + 70}" y="${oy + 2 * (ch + gap) + 350}" fill="#94a3b8" font-size="15" font-family="Arial, Helvetica, sans-serif">time →    foxes that have reached the calm patch</text>`),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="${w}" height="${h}" fill="#070d18"/>
  <text x="42" y="52" fill="#f8fafc" font-size="32" font-weight="700" font-family="Arial, Helvetica, sans-serif">What the models lead you to expect</text>
  ${cells.join("\n")}
</svg>`;
}

async function renderStill(svg, outPath) {
  await run("rsvg-convert", ["-o", outPath], svg);
}

async function main() {
  fs.mkdirSync(videoDir, { recursive: true });
  fs.mkdirSync(posterDir, { recursive: true });
  fs.mkdirSync(plotDir, { recursive: true });
  fs.mkdirSync(figureDir, { recursive: true });
  await renderStill(schematicSheet(), path.join(figureDir, "expected-models.png"));
  console.log("wrote expected-models.png");

  const { social, solo } = buildPatchReplays();
  social._tracks = tracksOf(social, false);
  solo._tracks = tracksOf(solo, false);
  const echo = loadEcho();
  const gap = 36;
  const top = 72;
  const panelH = H - top - CHART_H - 56;
  const panelW = (W - 56 * 2 - gap) / 2;
  const box = (i) => ({ x: 56 + i * (panelW + gap), y: top, w: panelW, h: panelH });

  const echoEnd = Math.max(echo.bridge.samples.at(-1).t, echo.none.samples.at(-1).t);
  const echoChart = {
    title: "Order  \u03a6",
    yLabel: "\u03a6",
    yMax: 1,
    tMax: echoEnd,
    lines: [
      { name: "With a bridge", color: "#fde68a", pts: phiSeries(echo.bridge) },
      { name: "No bridge", color: "#7dd3fc", pts: phiSeries(echo.none) },
    ],
  };
  echoChart.cursor = echoEnd;
  await renderStill(plotSvg(echoChart), path.join(plotDir, "echo-order.png"));
  await renderClip("echo-side-by-side", 18, (u) => {
    const shown = u * echoEnd;
    echoChart.cursor = shown;
    return frameSvg("Echo chambers", `${Math.round(shown / 1000)} s`, [
      { replay: echo.bridge, label: "With a bridge", note: "Chambers switch on with two headings", t: timeAt(echo.bridge, shown), box: box(0) },
      { replay: echo.none, label: "No bridge", note: "The two headings never meet", t: timeAt(echo.none, shown), box: box(1) },
    ], echoChart);
  });

  const soloEnd = solo.samples.at(-1).t;
  const taxisChart = {
    title: "How many have reached the patch",
    yLabel: "foxes",
    yMax: 13,
    tMax: soloEnd,
    lines: [
      { name: "Social", color: "#fde68a", pts: arrivedSeries(social) },
      { name: "Solitary", color: "#7dd3fc", pts: arrivedSeries(solo) },
    ],
  };
  taxisChart.cursor = soloEnd;
  await renderStill(plotSvg(taxisChart), path.join(plotDir, "patch-arrivals.png"));
  const socialAll = social.clock.togetherMs;
  await renderClip("taxis-side-by-side", 20, (u) => {
    const shown = u * soloEnd;
    taxisChart.cursor = shown;
    const socialT = timeAt(social, shown);
    const socialNote = socialAll != null && socialT >= socialAll ? "All of them are in the 4 m patch" : "Everyone can see everyone";
    const soloNote = shown < 8000 ? "The 4 m patch is empty" : "Still spread. Nobody can see a neighbour";
    return frameSvg("Finding the patch", `${Math.round(shown / 1000)} s`, [
      { replay: social, label: "Social", note: socialNote, t: socialT, box: box(0) },
      { replay: solo, label: "Solitary", note: soloNote, t: timeAt(solo, shown), box: box(1) },
    ], taxisChart);
  });
  console.log("clocks", JSON.stringify({ social: social.clock, solo: solo.clock }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
