const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { Server } = require("socket.io");

const PORT = Number(process.env.PORT || 3000);
const lecturerKey = String(process.env.LECTURE_KEY || "matrexvr");
fs.writeFileSync(path.join(__dirname, ".lecturer-key"), `${lecturerKey}\n`, { mode: 0o600 });
let publicJoinUrl = "";
const TICK_MS = 50;
const LOG_SAMPLE_MS = 200;
const ADMIN_PUSH_MS = 200;
const WORLD = { width: 90, height: 70 };

const SCARF_PALETTE = [
  "#ef4444", // Red
  "#3b82f6", // Blue
  "#10b981", // Emerald
  "#f59e0b", // Amber
  "#a855f7", // Purple
  "#ec4899", // Pink
  "#06b6d4", // Cyan
  "#84cc16", // Lime
  "#f97316", // Orange
  "#14b8a6", // Teal
  "#eab308", // Yellow
  "#6366f1", // Indigo
  "#f43f5e", // Rose
  "#22c55e", // Green
  "#d946ef", // Fuchsia
];

const DEFAULT_TUNING = {
  humanSpeed: 6.2,
  botSpeed: 5.5,
  speedVariance: 0.15, // fractional speed spread across individuals & time (0 = uniform, 0.15 = 15% variance)
  humanSize: 1.0,
  botSize: 1.0,
  randomWalkTurnRate: 0.12,
  randomWalkSpeedJitter: 0.15,
  swarmDirectionDeg: 0, // 0 deg = +X (East), 90 deg = +Z (South)
  swarmR: 0.96, // resultant vector length R in [0, 1] for Biased Correlated Random Walk (0 = isotropic CRW, 1 = locked flow)
  swarmSplitAngleDeg: 70, // for bifurcating_swarm: two streams at +/- splitAngle/2
  swarmNoise: 0.08, // angular noise (synced with swarmR)
  swarmAlignStrength: 0.35,
  boundaryMode: "hex_torus", // hex_torus (infinite mirrored swarm) | open_flow | periodic | reflective
  hexSpacing: 24, // meters between mirrored replica centres (hex lattice period)
  hexRings: 2, // replica rings rendered around each student (0 = nearest only)
  mirrorGhosts: true,
  matchBotsToHumans: false,
  humanSpawnRadius: 7,
  botSpawnRadius: 12,
  // Visibility network topology rules (Expt 3 & 4)
  visibilityRule: "all", // all | metric_radius | topological_k | echo_chambers | star_leader | directed_ring | blind_solo
  metricRadius: 10, // meters for metric_radius
  topologicalK: 4, // k nearest neighbors for topological_k
  // Individual identity & scarves
  showScarves: true,
  showTags: false,
  showBotTrails: true, // admin god-view: lecture-critical toggle, synced across control + projector tabs
  showHumanTrails: true,
  // Expt 3: Informed minority
  informedCount: 0,
  // Expt 6: Collective taxis oasis
  oasisEnabled: false,
  oasisShowHint: true,
  oasisX: 62,
  oasisY: 35,
  oasisRadius: 11,
  oasisSlowFactor: 0.32, // speed multiplier inside oasis
  // Expt 7 & 8: Locust stop-and-go collision avoidance & collision damage/score mode
  stopAndGoEnabled: false,
  collisionStopDist: 2.3, // meters ahead at which an agent pauses before bumping
  collisionScoreEnabled: false,
  collisionRadius: 1.25, // meters center-to-center for collision / disappearing / bump damage
  deadTimeSec: 8, // seconds frozen after integrity hits 0; 0 = stay down until Reset Dmg
  joinCode: "matrex", // students must enter this with their name; blank turns the check off
};

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));
app.use(
  "/vendor/three",
  express.static(path.join(__dirname, "node_modules", "three", "build")),
);
app.use(
  "/vendor/three-addons",
  express.static(path.join(__dirname, "node_modules", "three", "examples", "jsm")),
);
app.get("/admin", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});
app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

const logsDir = path.join(__dirname, "logs");
fs.mkdirSync(logsDir, { recursive: true });
const logFile = path.join(
  logsDir,
  `session-${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`,
);
const logStream = fs.createWriteStream(logFile, { flags: "a" });

function writeLog(type, payload = {}) {
  const row = { t: Date.now(), type, ...payload };
  logStream.write(`${JSON.stringify(row)}\n`);
}

function escapeCsv(value) {
  if (value === undefined || value === null) return "";
  const text = String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, "\"\"")}"`;
  }
  return text;
}

function parseLogLines() {
  try {
    const raw = fs.readFileSync(logFile, "utf8");
    const rows = [];
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      try {
        rows.push(JSON.parse(line));
      } catch (_err) {
        // Keep export resilient if one row is malformed.
      }
    }
    return rows;
  } catch (_err) {
    return [];
  }
}

function requestHasLecturerKey(req) {
  const given = String(req.query.key || req.get("x-lecturer-key") || "");
  return given === lecturerKey;
}

app.use("/export", (req, res, next) => {
  if (!requestHasLecturerKey(req)) {
    res.status(403).type("text/plain").send("Lecturer key required");
    return;
  }
  next();
});

app.get("/join-info", (_req, res) => {
  res.json({ needsCode: Boolean(experiment.joinCode) });
});

app.post("/local/public-url", express.json(), (req, res) => {
  if (String(req.body?.key || "") !== lecturerKey) {
    res.status(403).json({ ok: false });
    return;
  }
  publicJoinUrl = String(req.body?.url || "").trim().slice(0, 200);
  res.json({ ok: true, url: publicJoinUrl });
});

app.get("/export/samples.csv", (_req, res) => {
  const lines = parseLogLines().filter((row) => row.type === "sample");
  const header = [
    "t",
    "activePreset",
    "phase",
    "botModel",
    "visibilityRule",
    "swarmDirectionDeg",
    "swarmSplitAngleDeg",
    "running",
    "id",
    "tag",
    "kind",
    "role",
    "group",
    "x",
    "y",
    "vx",
    "vy",
    "heading",
    "pitch",
    "inOasis",
    "score",
    "damage",
    "bumps",
    "stoppedByCollision",
  ];
  const body = lines.map((row) => header.map((k) => row[k]));
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="trajectories.csv"');
  res.write(`${header.join(",")}\n`);
  for (const entry of body) {
    res.write(`${entry.map(escapeCsv).join(",")}\n`);
  }
  res.end();
});

app.get("/export/metrics.csv", (_req, res) => {
  const lines = parseLogLines().filter((row) => row.type === "metrics");
  const header = [
    "t",
    "activePreset",
    "phase",
    "botModel",
    "visibilityRule",
    "swarmDirectionDeg",
    "swarmR",
    "swarmSplitAngleDeg",
    "swarmNoise",
    "humans",
    "bots",
    "humanPolarization",
    "humanMovePolarization",
    "botPolarization",
    "allPolarization",
    "humanEntrainment",
    "botEntrainment",
    "branchAlignment",
    "oasisFraction",
    "startledFraction",
    "humanMeanHeadingDeg",
    "botMeanHeadingDeg",
    "humanMeanSpeed",
    "humanSpreadRadius",
    "speedVariance",
    "humanStoppedFraction",
    "botStoppedFraction",
    "humanCollidingFraction",
    "humanMeanScore",
    "humanMeanDamage",
    "humanTotalBumps",
  ];
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="order_parameters.csv"');
  res.write(`${header.join(",")}\n`);
  for (const row of lines) {
    const cells = header.map((k) => row[k]);
    res.write(`${cells.map(escapeCsv).join(",")}\n`);
  }
  res.end();
});

app.get("/export/events.csv", (_req, res) => {
  const lines = parseLogLines();
  const header = ["t", "type", "payload_json"];
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="events.csv"');
  res.write(`${header.join(",")}\n`);
  for (const row of lines) {
    const payload = { ...row };
    delete payload.t;
    delete payload.type;
    const cells = [row.t, row.type, JSON.stringify(payload)];
    res.write(`${cells.map(escapeCsv).join(",")}\n`);
  }
  res.end();
});

const experiment = {
  activePreset: "expt1_entrain",
  phase: "bots_only", // bots_only | humans_only | mixed
  botCount: 14, // Tuned for a 15-student class (N - 1 = 14 peers)
  botModel: "directed_swarm", // directed_swarm | bifurcating_swarm | random_walk | swirl | drift
  running: true,
  ...DEFAULT_TUNING,
};

const socketsToAgentId = new Map();
const agentIdToSocketId = new Map();
const humans = new Map();
const bots = new Map();
const adminSockets = new Set();
const inputs = new Map();
const visibilityOverrides = new Map(); // observerId -> Map(targetId -> boolean)
const dynamicNeighborSet = new Map(); // observerId -> Set(targetId) computed per tick for metric/topological/network rules
const metricsHistory = []; // rolling buffer of last 600 metric points
const phaseTransitionCurve = []; // [{ noise, humanPolarization, botPolarization, k, phase }]
const phaseEvents = []; // [{ t, label, phase, botModel }]
let humanSeq = 1;
let botSeq = 1;
let lastStartleAt = 0;

function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function shortestAngleDiff(from, to) {
  const twoPi = Math.PI * 2;
  let d = (to - from) % twoPi;
  if (d > Math.PI) d -= twoPi;
  if (d < -Math.PI) d -= twoPi;
  return d;
}

function degToRad(deg) {
  return (deg * Math.PI) / 180;
}

function radToDeg(rad) {
  let d = (rad * 180) / Math.PI;
  while (d <= -180) d += 360;
  while (d > 180) d -= 360;
  return d;
}

function getAnchorCenter() {
  if (humans.size > 0) {
    let sx = 0;
    let sy = 0;
    for (const h of humans.values()) {
      sx += h.x;
      sy += h.y;
    }
    return { x: sx / humans.size, y: sy / humans.size };
  }
  return { x: WORLD.width / 2, y: WORLD.height / 2 };
}

function streamTargetAngleRad(agent) {
  const baseRad = degToRad(experiment.swarmDirectionDeg);
  if (experiment.botModel === "bifurcating_swarm") {
    const halfSplit = degToRad(experiment.swarmSplitAngleDeg * 0.5);
    const sign = agent.streamBranch === 1 ? 1 : -1;
    return baseRad + sign * halfSplit;
  }
  return baseRad;
}

// Smooth bell-shaped standard normal approximation (Irwin-Hall n=3: mean 0, variance 1)
function sampleStdNormal() {
  return (Math.random() + Math.random() + Math.random() - 1.5) * 1.1547005;
}

function initialBotHeadingForR(agent) {
  const r = clampNumber(Number(experiment.swarmR ?? 0.96), 0, 1);
  if (r <= 0.04) return randomRange(-Math.PI, Math.PI);
  const sigmaTheta = Math.sqrt(-2 * Math.log(Math.max(0.04, r)));
  return streamTargetAngleRad(agent) + sampleStdNormal() * sigmaTheta;
}

// --- Hexagonal periodic (torus) helpers: the swarm is one small hex cell, mirrored forever ---
function hexBasis() {
  const s = Math.max(6, Number(experiment.hexSpacing) || 20);
  return { s, e1: { x: s, y: 0 }, e2: { x: s / 2, y: (s * Math.sqrt(3)) / 2 } };
}
function worldToLattice(x, y) {
  const { s } = hexBasis();
  const v = y / (s * (Math.sqrt(3) / 2));
  const u = x / s - v / 2;
  return { u, v };
}
function latticeToWorld(u, v) {
  const { s } = hexBasis();
  return { x: s * (u + v / 2), y: s * (Math.sqrt(3) / 2) * v };
}
function wrapLatticeCoord(c) {
  return c - Math.floor(c + 0.5); // wrap to [-0.5, 0.5)
}
function wrapAgentHex(agent) {
  const { u, v } = worldToLattice(agent.x, agent.y);
  const p = latticeToWorld(wrapLatticeCoord(u), wrapLatticeCoord(v));
  agent.x = p.x;
  agent.y = p.y;
}
// Shortest displacement from a to b on the hex torus (exact hexagonal Wigner-Seitz Voronoi cell)
const HEX_VORONOI_SHIFTS = [
  [0, 0],
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
  [-1, 1],
  [1, -1],
];
function torusDelta(a, b) {
  if (experiment.boundaryMode !== "hex_torus") {
    return { x: b.x - a.x, y: b.y - a.y, dist: Math.hypot(b.x - a.x, b.y - a.y) };
  }
  const { s } = hexBasis();
  const rt3h = Math.sqrt(3) / 2;
  const la = worldToLattice(a.x, a.y);
  const lb = worldToLattice(b.x, b.y);
  const u0 = wrapLatticeCoord(lb.u - la.u);
  const v0 = wrapLatticeCoord(lb.v - la.v);
  let bestX = 0;
  let bestY = 0;
  let bestD2 = Infinity;
  for (let i = 0; i < HEX_VORONOI_SHIFTS.length; i += 1) {
    const u = u0 + HEX_VORONOI_SHIFTS[i][0];
    const v = v0 + HEX_VORONOI_SHIFTS[i][1];
    const wx = s * (u + v * 0.5);
    const wy = s * rt3h * v;
    const d2 = wx * wx + wy * wy;
    if (d2 < bestD2) {
      bestD2 = d2;
      bestX = wx;
      bestY = wy;
    }
  }
  return { x: bestX, y: bestY, dist: Math.sqrt(bestD2) };
}
function hexSpawnPoints(count) {
  // Hexagonal grid of spawn slots spread across the WHOLE cell (~4.4 m apart), so the
  // mirrored replicas tile into one uniform swarm instead of a tight pack repeated with gaps.
  const { s } = hexBasis();
  const step = Math.max(4.2, s * 0.19);
  const maxR = s * 0.46;
  const pts = [];
  for (let q = -4; q <= 4; q += 1) {
    for (let r = -4; r <= 4; r += 1) {
      const x = step * (q + r / 2);
      const y = step * (Math.sqrt(3) / 2) * r;
      if (Math.hypot(x, y) <= maxR) pts.push({ x, y });
    }
  }
  if (pts.length === 0) pts.push({ x: 0, y: 0 });
  // Shuffle so humans/bots and bifurcation branches are spatially interleaved everywhere
  for (let i = pts.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pts[i], pts[j]] = [pts[j], pts[i]];
  }
  return pts;
}

function applyBoundary(agent) {
  if (experiment.boundaryMode === "hex_torus") {
    wrapAgentHex(agent);
    return;
  }
  if (experiment.boundaryMode === "open_flow") {
    if (agent.type === "bot") {
      const anchor = getAnchorCenter();
      const maxRange = Math.max(22, experiment.botSpawnRadius * 2.1);
      const dx = agent.x - anchor.x;
      const dy = agent.y - anchor.y;
      const dist = Math.hypot(dx, dy);
      if (dist > maxRange) {
        if (experiment.botModel === "directed_swarm" || experiment.botModel === "bifurcating_swarm") {
          const dirRad = streamTargetAngleRad(agent);
          const upwindDist = maxRange * randomRange(0.62, 0.9);
          const lateral = randomRange(-maxRange * 0.65, maxRange * 0.65);
          const perpX = -Math.sin(dirRad);
          const perpY = Math.cos(dirRad);
          agent.x = anchor.x - Math.cos(dirRad) * upwindDist + perpX * lateral;
          agent.y = anchor.y - Math.sin(dirRad) * upwindDist + perpY * lateral;
          agent.heading = dirRad + randomRange(-0.14, 0.14);
        } else {
          agent.x = anchor.x - dx * 0.85;
          agent.y = anchor.y - dy * 0.85;
        }
      }
    }
    return;
  }

  if (experiment.boundaryMode === "periodic") {
    if (agent.x < 0) agent.x += WORLD.width;
    else if (agent.x > WORLD.width) agent.x -= WORLD.width;
    if (agent.y < 0) agent.y += WORLD.height;
    else if (agent.y > WORLD.height) agent.y -= WORLD.height;
    return;
  }

  // reflective
  const margin = 2.5;
  if (agent.x < margin) {
    agent.x = margin;
    agent.vx = Math.abs(agent.vx);
    if (Math.cos(agent.heading) < 0) {
      agent.heading = Math.atan2(Math.sin(agent.heading), -Math.cos(agent.heading));
    }
  } else if (agent.x > WORLD.width - margin) {
    agent.x = WORLD.width - margin;
    agent.vx = -Math.abs(agent.vx);
    if (Math.cos(agent.heading) > 0) {
      agent.heading = Math.atan2(Math.sin(agent.heading), -Math.cos(agent.heading));
    }
  }
  if (agent.y < margin) {
    agent.y = margin;
    agent.vy = Math.abs(agent.vy);
    if (Math.sin(agent.heading) < 0) {
      agent.heading = -agent.heading;
    }
  } else if (agent.y > WORLD.height - margin) {
    agent.y = WORLD.height - margin;
    agent.vy = -Math.abs(agent.vy);
    if (Math.sin(agent.heading) > 0) {
      agent.heading = -agent.heading;
    }
  }
}

function spawnPointFor(type, centerOverride = null) {
  if (experiment.boundaryMode === "hex_torus" && !centerOverride) {
    const pts = hexSpawnPoints(40);
    return pts[Math.floor(Math.random() * pts.length)];
  }
  const center = centerOverride || getAnchorCenter();
  const radius = type === "human" ? experiment.humanSpawnRadius : experiment.botSpawnRadius;
  const r = Math.sqrt(Math.random()) * clampNumber(radius, 2, 80);
  const a = randomRange(-Math.PI, Math.PI);
  const x = center.x + Math.cos(a) * r;
  const y = center.y + Math.sin(a) * r;
  return { x, y };
}

function newAgent(id, type, centerOverride = null) {
  const spawn = spawnPointFor(type, centerOverride);
  let seq;
  if (type === "human") {
    seq = humanSeq++;
  } else {
    // Recycle the smallest free bot number so tags always stay B1..B14 across preset switches
    const used = new Set([...bots.values()].map((b) => b.seq));
    seq = 1;
    while (used.has(seq)) seq += 1;
    botSeq = Math.max(botSeq, seq + 1);
  }
  const streamBranch = seq % 2 === 0 ? 1 : -1;
  const scarfColor = SCARF_PALETTE[(seq - 1) % SCARF_PALETTE.length];
  const tag = type === "human" ? `S${seq}` : `B${seq}`;
  const group = seq % 2 === 0 ? "A" : "B";

  const agent = {
    id,
    type,
    seq,
    tag,
    scarfColor,
    role: "normal", // normal | informed | bridge
    group, // A | B | bridge
    streamBranch,
    speedTrait: Math.sin(seq * 2.3999632), // balanced [-1, 1] individual speed offset
    speedPhase: (seq * 1.6180339) % (Math.PI * 2),
    score: 100,
    damage: 0,
    bumps: 0,
    deadUntil: 0,
    bumpingNow: false,
    stoppedByCollision: false,
    stopStartedAt: 0,
    stopUntil: 0,
    goUntil: 0,
    lastBumpByPeer: new Map(),
    x: spawn.x,
    y: spawn.y,
    vx: 0,
    vy: 0,
    angVel: 0,
    heading: randomRange(-Math.PI, Math.PI),
    pitch: 0,
    inOasis: false,
    colorSeed: crypto.createHash("md5").update(id).digest("hex").slice(0, 6),
  };

  if (type === "bot" && (experiment.botModel === "directed_swarm" || experiment.botModel === "bifurcating_swarm")) {
    agent.heading = initialBotHeadingForR(agent);
  }
  return agent;
}

function effectiveTargetBotCount() {
  if (experiment.matchBotsToHumans) {
    if (humans.size >= 2) {
      return humans.size - 1;
    }
    if (humans.size === 1) {
      return Math.max(1, experiment.botCount);
    }
  }
  return experiment.botCount;
}

function ensureBotCount() {
  const target = effectiveTargetBotCount();
  while (bots.size < target) {
    const id = `b-${crypto.randomUUID().slice(0, 8)}`;
    bots.set(id, newAgent(id, "bot"));
  }
  while (bots.size > target) {
    const first = bots.keys().next().value;
    bots.delete(first);
  }
}

function assignInformedRoles(count) {
  const humanArr = [...humans.values()];
  experiment.informedCount = clampNumber(Math.floor(count), 0, 15);
  for (let i = 0; i < humanArr.length; i += 1) {
    humanArr[i].role = i < experiment.informedCount ? "informed" : "normal";
  }
}

function assignEchoChambers(colorByGroup = false) {
  const humanArr = [...humans.values()];
  for (let i = 0; i < humanArr.length; i += 1) {
    const h = humanArr[i];
    if (i === 0 && humanArr.length >= 3) {
      h.group = "bridge";
      h.role = "bridge";
      if (colorByGroup) h.scarfColor = "#fbbf24"; // Gold bridge
    } else if (i % 2 === 0) {
      h.group = "A";
      h.role = "normal";
      if (colorByGroup) h.scarfColor = "#3b82f6"; // Blue chamber A
    } else {
      h.group = "B";
      h.role = "normal";
      if (colorByGroup) h.scarfColor = "#ef4444"; // Red chamber B
    }
  }
}

function resetAllPositions(options = {}) {
  const cx = WORLD.width / 2;
  const cy = WORLD.height / 2;
  const center = { x: cx, y: cy };
  if (experiment.boundaryMode === "hex_torus") {
    const all = [...humans.values(), ...bots.values()];
    const pts = hexSpawnPoints(Math.max(20, all.length));
    all.forEach((a, i) => {
      const p = pts[i % pts.length];
      a.x = p.x; a.y = p.y; a.vx = 0; a.vy = 0; a.angVel = 0;
      if (a.type === "bot") {
        a.heading =
          experiment.botModel === "directed_swarm" || experiment.botModel === "bifurcating_swarm"
            ? initialBotHeadingForR(a)
            : randomRange(-Math.PI, Math.PI);
      }
      wrapAgentHex(a);
    });
    if (experiment.oasisEnabled && options.repositionOasis) {
      experiment.oasisX = 18; experiment.oasisY = 10;
    }
    writeLog("reset_positions", { phase: experiment.phase, botModel: experiment.botModel, humans: humans.size, bots: bots.size, hex: true });
    return;
  }
  const alignBotsToSwarm =
    options.alignBotsToSwarm ??
    (experiment.botModel === "directed_swarm" || experiment.botModel === "bifurcating_swarm");

  for (const h of humans.values()) {
    const p = spawnPointFor("human", center);
    h.x = p.x;
    h.y = p.y;
    h.vx = 0;
    h.vy = 0;
  }
  for (const b of bots.values()) {
    const p = spawnPointFor("bot", center);
    b.x = p.x;
    b.y = p.y;
    b.vx = 0;
    b.vy = 0;
    b.angVel = 0;
    b.heading = alignBotsToSwarm ? initialBotHeadingForR(b) : randomRange(-Math.PI, Math.PI);
  }
  if (experiment.oasisEnabled && options.repositionOasis) {
    const angle = randomRange(-Math.PI, Math.PI);
    const dist = randomRange(15, 22);
    experiment.oasisX = Number((cx + Math.cos(angle) * dist).toFixed(1));
    experiment.oasisY = Number((cy + Math.sin(angle) * dist).toFixed(1));
  }
  writeLog("reset_positions", {
    phase: experiment.phase,
    botModel: experiment.botModel,
    humans: humans.size,
    bots: bots.size,
  });
}

function phaseAllowsTarget(observer, target) {
  if (experiment.phase === "bots_only") {
    return target.type === "bot";
  }
  if (experiment.phase === "humans_only") {
    return target.type === "human";
  }
  return true;
}

function rebuildDynamicVisibilitySets() {
  dynamicNeighborSet.clear();
  const rule = experiment.visibilityRule || "all";
  if (rule === "all") return;

  const all = listAgents();
  const humanArr = [...humans.values()];

  for (const obs of humanArr) {
    const allowed = new Set();
    const candidates = all.filter((t) => t.id !== obs.id && phaseAllowsTarget(obs, t));

    if (rule === "blind_solo") {
      // Asocial control (e.g., for Taxis solo baseline): see nobody else
    } else if (rule === "metric_radius") {
      const rMax = Math.max(1, Number(experiment.metricRadius) || 10);
      for (const c of candidates) {
        if (torusDelta(obs, c).dist <= rMax) {
          allowed.add(c.id);
        }
      }
    } else if (rule === "topological_k") {
      const k = Math.max(1, Math.floor(Number(experiment.topologicalK) || 4));
      const sorted = candidates
        .map((c) => ({ id: c.id, d: torusDelta(obs, c).dist }))
        .sort((a, b) => a.d - b.d);
      for (let i = 0; i < Math.min(k, sorted.length); i += 1) {
        allowed.add(sorted[i].id);
      }
    } else if (rule === "echo_chambers") {
      for (const c of candidates) {
        if (obs.group === "bridge" || c.group === "bridge" || obs.group === c.group) {
          allowed.add(c.id);
        }
      }
    } else if (rule === "star_leader") {
      const leaderId = humanArr[0]?.id || candidates[0]?.id;
      if (obs.id === leaderId) {
        // Leader only sees bots (if any in phase), or nobody in humans_only
        for (const c of candidates) {
          if (c.type === "bot") allowed.add(c.id);
        }
      } else if (leaderId) {
        allowed.add(leaderId);
      }
    } else if (rule === "directed_ring") {
      const idx = humanArr.findIndex((h) => h.id === obs.id);
      if (idx >= 0 && humanArr.length >= 2) {
        const nextHuman = humanArr[(idx + 1) % humanArr.length];
        allowed.add(nextHuman.id);
      }
    }

    dynamicNeighborSet.set(obs.id, allowed);
  }
}

function defaultVisibility(observer, target) {
  if (observer.id === target.id) return true;
  if (observer.type === "admin") return true;
  if (observer.type === "bot") return true;

  if (!phaseAllowsTarget(observer, target)) return false;

  const rule = experiment.visibilityRule || "all";
  if (rule !== "all") {
    const set = dynamicNeighborSet.get(observer.id);
    return set ? set.has(target.id) : false;
  }
  return true;
}

function canSee(observer, target) {
  const observerOverride = visibilityOverrides.get(observer.id);
  if (observerOverride && observerOverride.has(target.id)) {
    return observerOverride.get(target.id);
  }
  return defaultVisibility(observer, target);
}

function listAgents() {
  return [...humans.values(), ...bots.values()];
}

function short(agent) {
  return {
    id: agent.id,
    type: agent.type,
    tag: agent.tag,
    scarfColor: agent.scarfColor,
    role: agent.role,
    group: agent.group,
    streamBranch: agent.streamBranch,
    x: Number(agent.x.toFixed(2)),
    y: Number(agent.y.toFixed(2)),
    vx: Number(agent.vx.toFixed(2)),
    vy: Number(agent.vy.toFixed(2)),
    heading: Number(agent.heading.toFixed(4)),
    pitch: Number((agent.pitch || 0).toFixed(4)),
    inOasis: !!agent.inOasis,
    score: Math.round(agent.score ?? 100),
    damage: Number((agent.damage || 0).toFixed(1)),
    bumps: agent.bumps || 0,
    bumpingNow: !!agent.bumpingNow,
    stoppedByCollision: !!agent.stoppedByCollision,
    knockedOut: !!(agent.deadUntil && agent.deadUntil > Date.now()),
    colorSeed: agent.colorSeed,
  };
}

function buildVisibilityMatrix() {
  const all = listAgents();
  const ids = all.map((a) => a.id);
  const tags = all.map((a) => a.tag);
  const types = all.map((a) => a.type);
  const byId = new Map(all.map((a) => [a.id, a]));
  const rows = ids.map((observerId) => {
    const observer = byId.get(observerId);
    return ids.map((targetId) => {
      const target = byId.get(targetId);
      return canSee(observer, target) ? 1 : 0;
    });
  });
  return { ids, tags, types, rows };
}

function isInsideOasis(x, y) {
  if (!experiment.oasisEnabled) return false;
  return Math.hypot(x - experiment.oasisX, y - experiment.oasisY) <= experiment.oasisRadius;
}

function resetAllScores() {
  for (const a of listAgents()) {
    a.score = 100;
    a.damage = 0;
    a.bumps = 0;
    a.deadUntil = 0;
    a.bumpingNow = false;
    a.stoppedByCollision = false;
    a.stopStartedAt = 0;
    a.stopUntil = 0;
    a.goUntil = 0;
    if (a.lastBumpByPeer) a.lastBumpByPeer.clear();
    else a.lastBumpByPeer = new Map();
  }
}

function speedVarianceFactor(agent, now) {
  const v = clampNumber(Number(experiment.speedVariance) || 0, 0, 0.85);
  if (v <= 0.001) return 1.0;
  // Smooth individual speed trait + slow sinusoidal wave (zero per-tick random jitter so bots never stutter)
  const wave = Math.sin(now * 0.0016 + (agent.speedPhase || 0));
  const trait = agent.speedTrait || 0;
  const delta = v * (0.68 * trait + 0.32 * wave);
  return clampNumber(1.0 + delta, 0.35, 1.85);
}

// Locust stop-and-go collision avoidance: when about to bump a peer ahead, pause briefly, then resume.
function applyStopAndGo(agent, desiredVx, desiredVy, now, candidates) {
  const spd = Math.hypot(desiredVx, desiredVy);
  if (!experiment.stopAndGoEnabled || spd <= 0.05) {
    agent.stoppedByCollision = false;
    return { vx: desiredVx, vy: desiredVy };
  }

  const ux = desiredVx / spd;
  const uy = desiredVy / spd;
  const stopDist = clampNumber(Number(experiment.collisionStopDist) || 2.3, 1.25, 5.0);
  let blockedAhead = false;

  for (const other of candidates) {
    if (other.id === agent.id) continue;
    if (agent.type === "human" && !canSee(agent, other)) continue;
    const td = torusDelta(agent, other); // displacement agent -> other
    const d = td.dist;
    if (d <= 0.001 || d >= stopDist) continue;
    const fwd = td.x * ux + td.y * uy;
    const latSigned = -td.x * uy + td.y * ux;
    const lat = Math.abs(latSigned);
    if (fwd > 0.20 && lat < 1.05) {
      blockedAhead = true;
      break;
    }
  }

  const stopUntil = agent.stopUntil || 0;
  const goUntil = agent.goUntil || 0;

  if (now < stopUntil) {
    // Hold the full locust pause bout (~650-850 ms) so stop-and-go waves propagate cleanly
    agent.stoppedByCollision = true;
    return { vx: 0, vy: 0 };
  }

  if (now < goUntil) {
    agent.stoppedByCollision = false;
    return { vx: desiredVx, vy: desiredVy };
  }

  if (blockedAhead) {
    const pauseMs = 680 + Math.round(Math.abs(agent.speedTrait || 0) * 220);
    agent.stopStartedAt = now;
    agent.stopUntil = now + pauseMs;
    agent.goUntil = agent.stopUntil + 780;
    agent.stoppedByCollision = true;
    return { vx: 0, vy: 0 };
  }

  // In locust stop-and-go mode, bots also take intermittent spontaneous pauses
  // which seeds realistic backward-propagating stop-and-go traffic waves across the swarm.
  if (agent.type === "bot" && Math.random() < 0.015) {
    const pauseMs = 700 + Math.round(Math.random() * 220);
    agent.stopStartedAt = now;
    agent.stopUntil = now + pauseMs;
    agent.goUntil = agent.stopUntil + 1350;
    agent.stoppedByCollision = true;
    return { vx: 0, vy: 0 };
  }

  agent.stoppedByCollision = false;
  return { vx: desiredVx, vy: desiredVy };
}

function reviveIfReady(agent, now) {
  if (agent.deadUntil && now >= agent.deadUntil) {
    agent.deadUntil = 0;
    agent.damage = 0;
    agent.score = 100;
    agent.safeUntil = now + 1600;
  }
}

function isKnockedOut(agent, now) {
  return !!(agent.deadUntil && agent.deadUntil > now);
}

function beginKnockout(agent, now) {
  if (isKnockedOut(agent, now)) return;
  const secs = clampNumber(Number(experiment.deadTimeSec) || 0, 0, 180);
  agent.deadUntil = secs <= 0 ? now + 7 * 24 * 3600 * 1000 : now + Math.round(secs * 1000);
  agent.damage = 100;
  agent.score = 0;
  agent.vx = 0;
  agent.vy = 0;
}

function updateHuman(agent, dt, now, allAgents) {
  reviveIfReady(agent, now);
  if (isKnockedOut(agent, now)) {
    agent.vx = 0;
    agent.vy = 0;
    return;
  }
  const input = inputs.get(agent.id) || {};
  const strafe = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const forward = (input.up ? 1 : 0) - (input.down ? 1 : 0);
  const len = Math.hypot(strafe, forward);

  if (Number.isFinite(input.aim)) {
    agent.heading = input.aim;
  }
  if (Number.isFinite(input.pitch)) {
    agent.pitch = clampNumber(input.pitch, -1.2, 1.2);
  }

  let worldX = 0;
  let worldY = 0;

  if (len > 0) {
    const s = strafe / len;
    const f = forward / len;
    const cos = Math.cos(agent.heading);
    const sin = Math.sin(agent.heading);
    worldX = f * cos - s * sin;
    worldY = f * sin + s * cos;
  }

  agent.inOasis = isInsideOasis(agent.x, agent.y);
  const speedMultiplier = agent.inOasis ? clampNumber(experiment.oasisSlowFactor, 0.1, 1.0) : 1.0;
  const effSpeed = experiment.humanSpeed * speedMultiplier;

  const desiredVx = worldX * effSpeed;
  const desiredVy = worldY * effSpeed;
  const sg = applyStopAndGo(agent, desiredVx, desiredVy, now, allAgents);
  agent.vx = sg.vx;
  agent.vy = sg.vy;

  agent.x += agent.vx * dt;
  agent.y += agent.vy * dt;
  agent.inOasis = isInsideOasis(agent.x, agent.y);
  applyBoundary(agent);
}

function updateBot(agent, dt, now, allBots, allAgents) {
  reviveIfReady(agent, now);
  if (isKnockedOut(agent, now)) {
    agent.vx = 0;
    agent.vy = 0;
    return;
  }
  const anchor = getAnchorCenter();
  const dx = agent.x - anchor.x;
  const dy = agent.y - anchor.y;
  const distFromCenter = Math.hypot(dx, dy);
  const speedScale = speedVarianceFactor(agent, now);
  const tauOmega = 0.65; // CRW turning persistence time constant (s)
  const alpha = Math.exp(-dt / tauOmega);
  const ouScale = Math.sqrt(Math.max(0, 1 - alpha * alpha));

  if (experiment.botModel === "directed_swarm" || experiment.botModel === "bifurcating_swarm") {
    // Smooth biased correlated random walk (BCRW) in heading space, parameterized by (R, θ):
    //   R = 0   isotropic CRW (persistent meander, no preferred direction)
    //   0<R<1   circular OU around θ whose equilibrium resultant length is R
    //   R = 1   locked directed flow along θ
    // dθ = κ·err dt + σ dW,  Var(θ) = σ²/(2κ) = −2 ln R  ⇒  σ = 2√(κ (−ln R))
    const targetRad = streamTargetAngleRad(agent);
    const R = clampNumber(Number(experiment.swarmR ?? 0.96), 0, 1);
    const alignGain = clampNumber(Number(experiment.swarmAlignStrength) || 0.35, 0.05, 1.0) / 0.35;

    if (R <= 0.015) {
      const sigmaOmega = 0.95;
      agent.angVel = (agent.angVel || 0) * alpha + sigmaOmega * ouScale * sampleStdNormal();
      const dTheta = agent.angVel * dt;
      agent.heading = Math.atan2(Math.sin(agent.heading + dTheta), Math.cos(agent.heading + dTheta));
    } else if (R >= 0.995) {
      agent.angVel *= 0.35;
      const err = shortestAngleDiff(agent.heading, targetRad);
      const blend = 1 - Math.exp(-dt / 0.28);
      agent.heading = Math.atan2(
        Math.sin(agent.heading + err * blend),
        Math.cos(agent.heading + err * blend),
      );
    } else {
      const kappa = (1.15 + 1.35 * R) * Math.min(1.6, Math.max(0.55, alignGain));
      const sigmaEq = Math.sqrt(-2 * Math.log(R));
      const sigmaProc = sigmaEq * Math.sqrt(2 * kappa);
      const err = shortestAngleDiff(agent.heading, targetRad);
      const dTheta = kappa * err * dt + sigmaProc * Math.sqrt(Math.max(dt, 1e-4)) * sampleStdNormal();
      agent.angVel = dTheta / Math.max(dt, 1e-4);
      agent.heading = Math.atan2(Math.sin(agent.heading + dTheta), Math.cos(agent.heading + dTheta));
    }

    const speed = experiment.botSpeed * speedScale;
    agent.vx = Math.cos(agent.heading) * speed;
    agent.vy = Math.sin(agent.heading) * speed;
  } else if (experiment.botModel === "collision_avoid") {
    // Smooth CRW + soft collision-avoidance steering (no single-tick heading whips)
    let steerRate = 0;
    const peers = allAgents || allBots;
    for (const other of peers) {
      if (other.id === agent.id) continue;
      const td = torusDelta(other, agent); // other -> agent
      const d = td.dist;
      if (d > 0.001 && d < 3.2) {
        const push = Math.pow((3.2 - d) / 3.2, 1.25);
        const awayAngle = Math.atan2(td.y, td.x);
        steerRate += shortestAngleDiff(agent.heading, awayAngle) * push * 2.2;
        if (other.heading !== undefined) {
          steerRate += shortestAngleDiff(agent.heading, other.heading) * push * 0.85;
        }
      }
    }
    const sigmaOmega = clampNumber(experiment.swarmNoise || 0.08, 0.02, 1.0) * 5.0;
    agent.angVel = (agent.angVel || 0) * alpha + sigmaOmega * ouScale * sampleStdNormal();
    const turnRate = clampNumber(steerRate + agent.angVel, -3.2, 3.2);
    agent.heading = Math.atan2(
      Math.sin(agent.heading + turnRate * dt),
      Math.cos(agent.heading + turnRate * dt),
    );
    const speed = experiment.botSpeed * speedScale;
    agent.vx = Math.cos(agent.heading) * speed;
    agent.vy = Math.sin(agent.heading) * speed;
  } else if (experiment.botModel === "random_walk") {
    // Pure isotropic Correlated Random Walk (CRW)
    const sigmaOmega = clampNumber(experiment.randomWalkTurnRate || 0.12, 0.02, 1.6) * 11.0;
    agent.angVel = (agent.angVel || 0) * alpha + sigmaOmega * ouScale * sampleStdNormal();
    let centerPull = 0;
    const softRadius = Math.max(8, experiment.botSpawnRadius);
    if (experiment.boundaryMode !== "hex_torus" && distFromCenter > softRadius) {
      const toCenter = Math.atan2(anchor.y - agent.y, anchor.x - agent.x);
      centerPull = shortestAngleDiff(agent.heading, toCenter) * Math.min(1.8, ((distFromCenter - softRadius) / softRadius) * 1.2);
    }
    const turnRate = clampNumber(agent.angVel + centerPull, -4.0, 4.0);
    agent.heading = Math.atan2(
      Math.sin(agent.heading + turnRate * dt),
      Math.cos(agent.heading + turnRate * dt),
    );
    const speed = experiment.botSpeed * speedScale;
    agent.vx = Math.cos(agent.heading) * speed;
    agent.vy = Math.sin(agent.heading) * speed;
  } else if (experiment.botModel === "swirl") {
    const tangential = Math.atan2(dy, dx) + Math.PI / 2;
    const wobble = Math.sin(now / 900 + dx * 0.14 + dy * 0.14) * 0.25;
    agent.heading = tangential + wobble;
    const speed = experiment.botSpeed * speedScale;
    agent.vx = Math.cos(agent.heading) * speed;
    agent.vy = Math.sin(agent.heading) * speed;
  } else {
    const driftX = Math.sin(now / 1300 + agent.x * 0.08) * 0.7;
    const driftY = Math.cos(now / 1600 + agent.y * 0.08) * 0.7;
    agent.vx = agent.vx * 0.88 + driftX * experiment.botSpeed * speedScale * 0.22;
    agent.vy = agent.vy * 0.88 + driftY * experiment.botSpeed * speedScale * 0.22;
    agent.heading = Math.atan2(agent.vy, agent.vx);
  }

  agent.inOasis = isInsideOasis(agent.x, agent.y);
  const botOasisMult = agent.inOasis ? clampNumber(experiment.oasisSlowFactor, 0.1, 1.0) : 1.0;
  const sg = applyStopAndGo(agent, agent.vx * botOasisMult, agent.vy * botOasisMult, now, allAgents || allBots);
  agent.vx = sg.vx;
  agent.vy = sg.vy;

  agent.x += agent.vx * dt;
  agent.y += agent.vy * dt;
  agent.inOasis = isInsideOasis(agent.x, agent.y);
  applyBoundary(agent);
}

function updateCollisionsAndDamage(dt, now, allAgents) {
  const collideR = clampNumber(Number(experiment.collisionRadius) || 1.25, 0.6, 3.5);
  for (const a of allAgents) {
    a.bumpingNow = false;
    if (!a.lastBumpByPeer) a.lastBumpByPeer = new Map();
  }
  for (let i = 0; i < allAgents.length; i += 1) {
    const a = allAgents[i];
    if (isKnockedOut(a, now)) continue;
    for (let j = 0; j < allAgents.length; j += 1) {
      if (i === j) continue;
      const b = allAgents[j];
      if (a.type === "human" && !canSee(a, b)) continue;
      if (a.type === "bot" && !phaseAllowsTarget(a, b) && experiment.phase !== "bots_only") continue;
      const td = torusDelta(a, b);
      if (td.dist <= collideR && td.dist > 0.04 && j > i && !isKnockedOut(b, now)) {
        const nx = td.x / td.dist;
        const ny = td.y / td.dist;
        const gap = (collideR - td.dist) * 0.42;
        a.x -= nx * gap;
        a.y -= ny * gap;
        b.x += nx * gap;
        b.y += ny * gap;
        const intoA = a.vx * nx + a.vy * ny;
        if (intoA > 0) {
          a.vx -= nx * intoA;
          a.vy -= ny * intoA;
        }
        const intoB = -(b.vx * nx + b.vy * ny);
        if (intoB > 0) {
          b.vx += nx * intoB;
          b.vy += ny * intoB;
        }
      }
      if (td.dist <= collideR) {
        a.bumpingNow = true;
        if (experiment.collisionScoreEnabled && !(a.safeUntil > now)) {
          const relSpd = Math.hypot((a.vx || 0) - (b.vx || 0), (a.vy || 0) - (b.vy || 0));
          const ov = clampNumber((collideR - td.dist) / collideR, 0.15, 1.0);
          const lastHit = a.lastBumpByPeer.get(b.id) || 0;
          if (now - lastHit > 650) {
            a.lastBumpByPeer.set(b.id, now);
            a.bumps = (a.bumps || 0) + 1;
            const impactDmg = 4.0 + Math.min(6.0, relSpd * 0.45);
            a.damage = Math.min(100, Number(((a.damage || 0) + impactDmg).toFixed(2)));
          }
          const contDmg = (5.0 + relSpd * 0.55) * (0.35 + 0.65 * ov) * dt;
          a.damage = Math.min(100, Number(((a.damage || 0) + contDmg).toFixed(2)));
          a.score = Math.max(0, Math.round(100 - a.damage));
        }
      }
    }
  }
  for (const a of allAgents) {
    if (experiment.collisionScoreEnabled && (a.damage || 0) >= 100) beginKnockout(a, now);
    if (isKnockedOut(a, now)) {
      a.vx = 0;
      a.vy = 0;
      a.bumpingNow = false;
    }
  }
}

function computeGroupStats(agentArray, swarmRad, halfSplitRad) {
  const n = agentArray.length;
  if (n === 0) {
    return {
      polarization: 0,
      movePolarization: 0,
      entrainment: 0,
      branchAlignment: 0,
      oasisFraction: 0,
      startledFraction: 0,
      stoppedFraction: 0,
      collidingFraction: 0,
      meanScore: 100,
      meanDamage: 0,
      totalBumps: 0,
      meanHeadingDeg: 0,
      meanSpeed: 0,
      spreadRadius: 0,
    };
  }

  let sumCos = 0;
  let sumSin = 0;
  let moveCos = 0;
  let moveSin = 0;
  let movingCount = 0;
  let sumEntrain = 0;
  let sumBranch = 0;
  let sumSpeed = 0;
  let inOasisCount = 0;
  let startledCount = 0;
  let stoppedCount = 0;
  let collidingCount = 0;
  let sumScore = 0;
  let sumDamage = 0;
  let totalBumps = 0;
  let cx = 0;
  let cy = 0;

  for (const a of agentArray) {
    const spd = Math.hypot(a.vx, a.vy);
    const dir = spd > 0.2 ? Math.atan2(a.vy, a.vx) : a.heading;
    const c = Math.cos(dir);
    const s = Math.sin(dir);
    sumCos += c;
    sumSin += s;
    if (spd > 0.2) {
      moveCos += c;
      moveSin += s;
      movingCount += 1;
    }
    if (spd > 0.8) {
      startledCount += 1;
    }
    if (a.inOasis) {
      inOasisCount += 1;
    }
    if (a.stoppedByCollision) {
      stoppedCount += 1;
    }
    if (a.bumpingNow) {
      collidingCount += 1;
    }
    sumScore += a.score ?? 100;
    sumDamage += a.damage || 0;
    totalBumps += a.bumps || 0;
    sumEntrain += Math.cos(dir - swarmRad);
    const b1 = Math.cos(dir - (swarmRad + halfSplitRad));
    const b2 = Math.cos(dir - (swarmRad - halfSplitRad));
    sumBranch += Math.max(b1, b2);
    sumSpeed += spd;
    cx += a.x;
    cy += a.y;
  }

  cx /= n;
  cy /= n;
  let sumDistSq = 0;
  if (experiment.boundaryMode === "hex_torus") {
    let cuCos = 0;
    let cuSin = 0;
    let cvCos = 0;
    let cvSin = 0;
    for (const a of agentArray) {
      const lv = worldToLattice(a.x, a.y);
      const au = lv.u * Math.PI * 2;
      const av = lv.v * Math.PI * 2;
      cuCos += Math.cos(au);
      cuSin += Math.sin(au);
      cvCos += Math.cos(av);
      cvSin += Math.sin(av);
    }
    const uMean = Math.atan2(cuSin, cuCos) / (Math.PI * 2);
    const vMean = Math.atan2(cvSin, cvCos) / (Math.PI * 2);
    const refCenter = latticeToWorld(uMean, vMean);
    for (const a of agentArray) {
      const td = torusDelta(refCenter, a);
      sumDistSq += td.dist * td.dist;
    }
  } else {
    for (const a of agentArray) {
      const dx = a.x - cx;
      const dy = a.y - cy;
      sumDistSq += dx * dx + dy * dy;
    }
  }

  const polarization = Math.hypot(sumCos, sumSin) / n;
  const movePolarization = movingCount > 0 ? Math.hypot(moveCos, moveSin) / movingCount : polarization;
  const meanHeadingDeg = radToDeg(Math.atan2(sumSin, sumCos));
  const entrainment = sumEntrain / n;
  const branchAlignment = sumBranch / n;
  const oasisFraction = inOasisCount / n;
  const startledFraction = startledCount / n;
  const stoppedFraction = stoppedCount / n;
  const collidingFraction = collidingCount / n;
  const meanScore = sumScore / n;
  const meanDamage = sumDamage / n;
  const meanSpeed = sumSpeed / n;
  const spreadRadius = Math.sqrt(sumDistSq / n);

  return {
    polarization: Number(polarization.toFixed(4)),
    movePolarization: Number(movePolarization.toFixed(4)),
    entrainment: Number(entrainment.toFixed(4)),
    branchAlignment: Number(branchAlignment.toFixed(4)),
    oasisFraction: Number(oasisFraction.toFixed(4)),
    startledFraction: Number(startledFraction.toFixed(4)),
    stoppedFraction: Number(stoppedFraction.toFixed(4)),
    collidingFraction: Number(collidingFraction.toFixed(4)),
    meanScore: Number(meanScore.toFixed(1)),
    meanDamage: Number(meanDamage.toFixed(1)),
    totalBumps,
    meanHeadingDeg: Number(meanHeadingDeg.toFixed(2)),
    meanSpeed: Number(meanSpeed.toFixed(2)),
    spreadRadius: Number(spreadRadius.toFixed(2)),
  };
}

function computeOrderParameters(now) {
  const swarmRad = degToRad(experiment.swarmDirectionDeg);
  const halfSplitRad = degToRad((experiment.swarmSplitAngleDeg || 0) * 0.5);
  const humanArr = [...humans.values()];
  const botArr = [...bots.values()];
  const allArr = [...humanArr, ...botArr];

  const hStats = computeGroupStats(humanArr, swarmRad, halfSplitRad);
  const bStats = computeGroupStats(botArr, swarmRad, halfSplitRad);
  const allStats = computeGroupStats(allArr, swarmRad, halfSplitRad);

  const pt = {
    t: now,
    activePreset: experiment.activePreset,
    phase: experiment.phase,
    botModel: experiment.botModel,
    visibilityRule: experiment.visibilityRule,
    swarmDirectionDeg: experiment.swarmDirectionDeg,
    swarmR: experiment.swarmR,
    swarmSplitAngleDeg: experiment.swarmSplitAngleDeg,
    swarmNoise: experiment.swarmNoise,
    speedVariance: experiment.speedVariance,
    humans: humanArr.length,
    bots: botArr.length,
    humanPolarization: hStats.polarization,
    humanMovePolarization: hStats.movePolarization,
    botPolarization: bStats.polarization,
    allPolarization: allStats.polarization,
    humanEntrainment: hStats.entrainment,
    botEntrainment: bStats.entrainment,
    branchAlignment: hStats.branchAlignment,
    oasisFraction: hStats.oasisFraction,
    startledFraction: hStats.startledFraction,
    humanStoppedFraction: hStats.stoppedFraction,
    botStoppedFraction: bStats.stoppedFraction,
    humanCollidingFraction: hStats.collidingFraction,
    humanMeanScore: hStats.meanScore,
    humanMeanDamage: hStats.meanDamage,
    humanTotalBumps: hStats.totalBumps,
    humanMeanHeadingDeg: hStats.meanHeadingDeg,
    botMeanHeadingDeg: bStats.meanHeadingDeg,
    humanMeanSpeed: hStats.meanSpeed,
    humanSpreadRadius: hStats.spreadRadius,
  };

  phaseTransitionCurve.push({
    t: now,
    noise: experiment.swarmNoise,
    humanPolarization: hStats.polarization,
    botPolarization: bStats.polarization,
    entrainment: hStats.entrainment,
    splitAngle: experiment.swarmSplitAngleDeg,
    branchAlignment: hStats.branchAlignment,
  });
  if (phaseTransitionCurve.length > 300) {
    phaseTransitionCurve.splice(0, phaseTransitionCurve.length - 300);
  }

  return pt;
}

function instructionFor(observer) {
  const p = experiment.activePreset;
  // Show instructions ONLY when relevant to the participant's task so collective behaviour emerges naturally.
  if (p === "expt3_informed" && observer.role === "informed") {
    return {
      title: "★ GOLDEN BEACON",
      body: "Head toward the golden beacon in the distance.",
    };
  }
  if (experiment.collisionScoreEnabled) {
    return {
      title: "AVOID COLLISIONS",
      body: "Do not bump into others — every collision deals damage.",
    };
  }
  return {
    title: "",
    body: "",
  };
}

function participantPayload(observer) {
  const all = listAgents();
  const visible = all.filter((target) => canSee(observer, target)).map(short);
  const isInformed = observer.role === "informed";

  return {
    t: Date.now(),
    world: WORLD,
    phase: experiment.phase,
    counts: {
      humans: humans.size,
      bots: bots.size,
      total: humans.size + bots.size,
    },
    you: observer.id,
    yourTag: observer.tag,
    yourRole: observer.role,
    yourGroup: observer.group,
    inOasis: !!observer.inOasis,
    yourScore: Math.round(observer.score ?? 100),
    yourDamage: Number((observer.damage || 0).toFixed(1)),
    yourBumps: observer.bumps || 0,
    bumpingNow: !!observer.bumpingNow,
    youAreDead: !!(observer.deadUntil && observer.deadUntil > Date.now()),
    deadLeftSec: observer.deadUntil && observer.deadUntil > Date.now()
      ? Number(((observer.deadUntil - Date.now()) / 1000).toFixed(1))
      : 0,
    stoppedByCollision: !!observer.stoppedByCollision,
    informedTargetDeg: isInformed ? experiment.swarmDirectionDeg : null,
    activePreset: experiment.activePreset,
    instruction: instructionFor(observer),
    config: {
      phase: experiment.phase,
      activePreset: experiment.activePreset,
      boundaryMode: experiment.boundaryMode,
      hexSpacing: experiment.hexSpacing,
      hexRings: experiment.hexRings,
      mirrorGhosts: experiment.mirrorGhosts,
      visibilityRule: experiment.visibilityRule,
      showScarves: experiment.showScarves,
      showTags: experiment.showTags,
      oasisEnabled: experiment.oasisEnabled,
      oasisShowHint: experiment.oasisShowHint,
      oasisX: experiment.oasisX,
      oasisY: experiment.oasisY,
      oasisRadius: experiment.oasisRadius,
      humanSize: experiment.humanSize,
      botSize: experiment.botSize,
      humanSpeed: experiment.humanSpeed,
      botSpeed: experiment.botSpeed,
      speedVariance: experiment.speedVariance,
      stopAndGoEnabled: experiment.stopAndGoEnabled,
      collisionStopDist: experiment.collisionStopDist,
      collisionScoreEnabled: experiment.collisionScoreEnabled,
      collisionRadius: experiment.collisionRadius,
      randomWalkTurnRate: experiment.randomWalkTurnRate,
      randomWalkSpeedJitter: experiment.randomWalkSpeedJitter,
    },
    agents: visible,
  };
}

function pushParticipantWorld() {
  for (const [socketId, agentId] of socketsToAgentId) {
    const socket = io.sockets.sockets.get(socketId);
    const observer = humans.get(agentId);
    if (!socket || !observer) continue;
    socket.emit("world", participantPayload(observer));
  }
}

function pushAdminState(latestMetrics) {
  const all = listAgents().map(short);
  const matrix = buildVisibilityMatrix();
  const payload = {
    t: Date.now(),
    world: WORLD,
    logFile,
    lastStartleAt,
    config: { ...experiment },
    counts: {
      humans: humans.size,
      bots: bots.size,
      total: humans.size + bots.size,
    },
    agents: all,
    matrix,
    metrics: latestMetrics,
    metricsHistory: metricsHistory.slice(-240),
    phaseTransitionCurve: phaseTransitionCurve.slice(-180),
    phaseEvents: phaseEvents.slice(-30),
    publicUrl: publicJoinUrl,
    trialLive: liveTrial
      ? { id: liveTrial.id, name: liveTrial.name, t0: liveTrial.t0, n: liveTrial.metrics.length }
      : null,
    trials: trials.map(trialSummary),
  };
  for (const socketId of adminSockets) {
    io.to(socketId).emit("admin:state", payload);
  }
}

const trialsDir = path.join(__dirname, "trials");
fs.mkdirSync(trialsDir, { recursive: true });
const trialsFile = path.join(trialsDir, "lecture-trials.json");
const trials = [];
let liveTrial = null;
const TRIAL_METRIC_KEYS = [
  "humanPolarization",
  "botPolarization",
  "humanEntrainment",
  "branchAlignment",
  "humanMeanSpeed",
  "botMeanSpeed",
  "humanSpreadRadius",
  "oasisFraction",
  "startledFraction",
  "humanMeanHeadingDeg",
  "humanStoppedFraction",
  "humanCollidingFraction",
  "humanMeanDamage",
];

function loadTrialsFromDisk() {
  try {
    const raw = JSON.parse(fs.readFileSync(trialsFile, "utf8"));
    if (!Array.isArray(raw.trials)) return;
    for (const row of raw.trials) {
      if (row && row.id && Array.isArray(row.metrics)) trials.push(row);
    }
  } catch (_err) {
    // First lecture, or a truncated file — start with an empty shelf.
  }
}

function saveTrials() {
  const body = JSON.stringify({ trials: trials.filter((tr) => !tr.example) });
  fs.writeFile(trialsFile, body, () => {});
}

function trialSummary(tr) {
  const rows = tr.metrics || [];
  const avg = (key) => (rows.length ? rows.reduce((sum, row) => sum + Number(row[key] || 0), 0) / rows.length : 0);
  const last = rows.length ? rows[rows.length - 1] : {};
  return {
    id: tr.id,
    name: tr.name,
    t0: tr.t0,
    t1: tr.t1 || null,
    kept: tr.kept !== false,
    preset: tr.preset,
    n: rows.length,
    meanPhi: Number(avg("humanPolarization").toFixed(3)),
    finalPhi: Number(Number(last.humanPolarization || 0).toFixed(3)),
    meanEntrain: Number(avg("humanEntrainment").toFixed(3)),
    finalEntrain: Number(Number(last.humanEntrainment || 0).toFixed(3)),
    meanPhiBots: Number(avg("botPolarization").toFixed(3)),
  };
}

function downsampleRows(rows, maxN) {
  if (!rows || rows.length <= maxN) return rows || [];
  const step = Math.ceil(rows.length / maxN);
  const out = [];
  for (let i = 0; i < rows.length; i += step) out.push(rows[i]);
  if (out[out.length - 1] !== rows[rows.length - 1]) out.push(rows[rows.length - 1]);
  return out;
}

function emitTrialSeries() {
  const payload = {
    trials: trials.map((tr) => ({
      ...trialSummary(tr),
      metrics: downsampleRows(tr.metrics, 360),
    })),
  };
  for (const socketId of adminSockets) {
    io.to(socketId).emit("admin:trialSeries", payload);
  }
}

function configSnap() {
  return {
    activePreset: experiment.activePreset,
    phase: experiment.phase,
    botModel: experiment.botModel,
    swarmR: experiment.swarmR,
    swarmDirectionDeg: experiment.swarmDirectionDeg,
    swarmSplitAngleDeg: experiment.swarmSplitAngleDeg,
    visibilityRule: experiment.visibilityRule,
    boundaryMode: experiment.boundaryMode,
    hexSpacing: experiment.hexSpacing,
    botCount: experiment.botCount,
    speedVariance: experiment.speedVariance,
  };
}

function startTrial(name) {
  const label = String(name || "").trim().slice(0, 48) || `Trial ${trials.length + 1}`;
  liveTrial = {
    id: crypto.randomBytes(4).toString("hex"),
    name: label,
    t0: Date.now(),
    t1: null,
    kept: true,
    preset: experiment.activePreset,
    config: configSnap(),
    metrics: [],
    samples: [],
  };
  recordPhaseEvent(`Trial start: ${label}`);
}

function stopTrial() {
  if (!liveTrial) return null;
  liveTrial.t1 = Date.now();
  trials.push(liveTrial);
  const saved = liveTrial;
  liveTrial = null;
  saveTrials();
  emitTrialSeries();
  recordPhaseEvent(`Trial saved: ${saved.name}`);
  return saved;
}

function deleteTrial(id) {
  const index = trials.findIndex((tr) => tr.id === id);
  if (index >= 0) trials.splice(index, 1);
  saveTrials();
  emitTrialSeries();
}

function setTrialKept(id, kept) {
  const tr = trials.find((row) => row.id === id);
  if (!tr) return;
  tr.kept = Boolean(kept);
  saveTrials();
  emitTrialSeries();
}

function renameTrial(id, name) {
  const tr = trials.find((row) => row.id === id);
  if (!tr) return;
  const label = String(name || "").trim().slice(0, 48);
  if (label) tr.name = label;
  saveTrials();
  emitTrialSeries();
}

function recordTrialFrame(now, metrics) {
  if (!liveTrial) return;
  const rel = now - liveTrial.t0;
  if (rel > 12 * 60 * 1000) {
    stopTrial();
    return;
  }
  const row = { t: rel };
  for (const key of TRIAL_METRIC_KEYS) row[key] = Number(metrics?.[key] || 0);
  liveTrial.metrics.push(row);
  liveTrial.samples.push({
    t: rel,
    agents: listAgents().map((agent) => ({
      id: agent.id,
      tag: agent.tag,
      type: agent.type,
      x: Number(agent.x.toFixed(2)),
      y: Number(agent.y.toFixed(2)),
      vx: Number(agent.vx.toFixed(2)),
      vy: Number(agent.vy.toFixed(2)),
      heading: Number(agent.heading.toFixed(3)),
      scarfColor: agent.scarfColor,
    })),
  });
}

loadTrialsFromDisk();
loadExampleReplays();

function loadExampleReplays() {
  const dir = path.join(__dirname, "examples", "replays");
  if (!fs.existsSync(dir)) return;
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".json")) continue;
    try {
      const row = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
      if (!row || !row.id || !Array.isArray(row.metrics)) continue;
      if (trials.some((tr) => tr.id === row.id)) continue;
      row.example = true;
      row.kept = false;
      trials.push(row);
    } catch (_err) {
      // Skip a damaged example file rather than blocking the lecture.
    }
  }
}

function recordPhaseEvent(label) {
  const ev = {
    t: Date.now(),
    label,
    phase: experiment.phase,
    botModel: experiment.botModel,
    visibilityRule: experiment.visibilityRule,
    swarmDirectionDeg: experiment.swarmDirectionDeg,
    humans: humans.size,
    bots: bots.size,
  };
  phaseEvents.push(ev);
  writeLog("phase_event", ev);
}

function sanitizeConfigUpdate(payload) {
  if (!payload || typeof payload !== "object") return;
  const prevPhase = experiment.phase;
  const prevModel = experiment.botModel;
  const prevRule = experiment.visibilityRule;

  if (payload.phase === "bots_only" || payload.phase === "humans_only" || payload.phase === "mixed") {
    experiment.phase = payload.phase;
  }
  if (
    payload.botModel === "directed_swarm" ||
    payload.botModel === "bifurcating_swarm" ||
    payload.botModel === "collision_avoid" ||
    payload.botModel === "random_walk" ||
    payload.botModel === "swirl" ||
    payload.botModel === "drift"
  ) {
    experiment.botModel = payload.botModel;
  }
  if (
    payload.boundaryMode === "open_flow" ||
    payload.boundaryMode === "periodic" ||
    payload.boundaryMode === "reflective" ||
    payload.boundaryMode === "hex_torus"
  ) {
    experiment.boundaryMode = payload.boundaryMode;
  }
  if (Number.isFinite(payload.hexSpacing)) experiment.hexSpacing = clampNumber(payload.hexSpacing, 8, 45);
  if (Number.isFinite(payload.hexRings)) experiment.hexRings = clampNumber(Math.floor(payload.hexRings), 0, 3);
  if (typeof payload.mirrorGhosts === "boolean") experiment.mirrorGhosts = payload.mirrorGhosts;
  if (
    payload.visibilityRule === "all" ||
    payload.visibilityRule === "metric_radius" ||
    payload.visibilityRule === "topological_k" ||
    payload.visibilityRule === "echo_chambers" ||
    payload.visibilityRule === "star_leader" ||
    payload.visibilityRule === "directed_ring" ||
    payload.visibilityRule === "blind_solo"
  ) {
    experiment.visibilityRule = payload.visibilityRule;
  }
  if (typeof payload.matchBotsToHumans === "boolean") {
    experiment.matchBotsToHumans = payload.matchBotsToHumans;
  }
  if (typeof payload.showScarves === "boolean") {
    experiment.showScarves = payload.showScarves;
  }
  if (typeof payload.showTags === "boolean") {
    experiment.showTags = payload.showTags;
  }
  if (typeof payload.oasisEnabled === "boolean") {
    experiment.oasisEnabled = payload.oasisEnabled;
  }
  if (typeof payload.oasisShowHint === "boolean") {
    experiment.oasisShowHint = payload.oasisShowHint;
  }
  if (typeof payload.stopAndGoEnabled === "boolean") {
    experiment.stopAndGoEnabled = payload.stopAndGoEnabled;
    if (!experiment.stopAndGoEnabled) {
      for (const a of listAgents()) {
        a.stoppedByCollision = false;
        a.stopUntil = 0;
        a.goUntil = 0;
      }
    }
  }
  if (typeof payload.collisionScoreEnabled === "boolean") {
    const wasEnabled = experiment.collisionScoreEnabled;
    experiment.collisionScoreEnabled = payload.collisionScoreEnabled;
    if (experiment.collisionScoreEnabled && !wasEnabled) {
      resetAllScores();
    }
  }
  if (Number.isFinite(payload.collisionStopDist)) {
    experiment.collisionStopDist = clampNumber(payload.collisionStopDist, 1.25, 5.0);
  }
  if (Number.isFinite(payload.collisionRadius)) {
    experiment.collisionRadius = clampNumber(payload.collisionRadius, 0.6, 3.5);
  }
  if (Number.isFinite(payload.deadTimeSec)) {
    experiment.deadTimeSec = clampNumber(payload.deadTimeSec, 0, 180);
  }
  if (typeof payload.running === "boolean") {
    experiment.running = payload.running;
  }
  if (Number.isFinite(payload.botCount)) {
    experiment.botCount = Math.max(0, Math.min(500, Math.floor(payload.botCount)));
  }
  if (Number.isFinite(payload.swarmDirectionDeg)) {
    experiment.swarmDirectionDeg = clampNumber(payload.swarmDirectionDeg, -180, 360);
  }
  if (Number.isFinite(payload.swarmR)) {
    const nextR = clampNumber(payload.swarmR, 0.0, 1.0);
    experiment.swarmR = Number(nextR.toFixed(3));
    experiment.swarmNoise = Number((0.02 + (1 - nextR) * 0.78).toFixed(3));
  }
  if (typeof payload.showBotTrails === "boolean") {
    experiment.showBotTrails = payload.showBotTrails;
  }
  if (typeof payload.showHumanTrails === "boolean") {
    experiment.showHumanTrails = payload.showHumanTrails;
  }
  if (typeof payload.joinCode === "string") {
    experiment.joinCode = payload.joinCode.trim().slice(0, 40);
  }
  if (Number.isFinite(payload.swarmSplitAngleDeg)) {
    experiment.swarmSplitAngleDeg = clampNumber(payload.swarmSplitAngleDeg, 0, 180);
  }
  if (Number.isFinite(payload.swarmNoise) && !Number.isFinite(payload.swarmR)) {
    experiment.swarmNoise = clampNumber(payload.swarmNoise, 0.0, 1.4);
    experiment.swarmR = Number(clampNumber(Math.exp(-experiment.swarmNoise * 1.15), 0.0, 1.0).toFixed(3));
  }
  if (Number.isFinite(payload.swarmAlignStrength)) {
    experiment.swarmAlignStrength = clampNumber(payload.swarmAlignStrength, 0.02, 1.0);
  }
  if (Number.isFinite(payload.metricRadius)) {
    experiment.metricRadius = clampNumber(payload.metricRadius, 1, 100);
  }
  if (Number.isFinite(payload.topologicalK)) {
    experiment.topologicalK = clampNumber(Math.floor(payload.topologicalK), 1, 30);
  }
  if (Number.isFinite(payload.informedCount)) {
    assignInformedRoles(payload.informedCount);
  }
  if (Number.isFinite(payload.oasisX)) {
    experiment.oasisX = clampNumber(payload.oasisX, -200, 300);
  }
  if (Number.isFinite(payload.oasisY)) {
    experiment.oasisY = clampNumber(payload.oasisY, -200, 300);
  }
  if (Number.isFinite(payload.oasisRadius)) {
    experiment.oasisRadius = clampNumber(payload.oasisRadius, 2, 50);
  }
  if (Number.isFinite(payload.oasisSlowFactor)) {
    experiment.oasisSlowFactor = clampNumber(payload.oasisSlowFactor, 0.1, 1.0);
  }
  if (Number.isFinite(payload.humanSpeed)) {
    experiment.humanSpeed = clampNumber(payload.humanSpeed, 0.5, 60);
  }
  if (Number.isFinite(payload.botSpeed)) {
    experiment.botSpeed = clampNumber(payload.botSpeed, 0, 60);
  }
  if (Number.isFinite(payload.speedVariance)) {
    experiment.speedVariance = clampNumber(payload.speedVariance, 0.0, 0.85);
    experiment.randomWalkSpeedJitter = experiment.speedVariance;
  }
  if (Number.isFinite(payload.humanSize)) {
    experiment.humanSize = clampNumber(payload.humanSize, 0.2, 5);
  }
  if (Number.isFinite(payload.botSize)) {
    experiment.botSize = clampNumber(payload.botSize, 0.2, 5);
  }
  if (Number.isFinite(payload.randomWalkTurnRate)) {
    experiment.randomWalkTurnRate = clampNumber(payload.randomWalkTurnRate, 0.0, 1.6);
  }
  if (Number.isFinite(payload.randomWalkSpeedJitter) && !Number.isFinite(payload.speedVariance)) {
    experiment.randomWalkSpeedJitter = clampNumber(payload.randomWalkSpeedJitter, 0.0, 0.95);
    experiment.speedVariance = clampNumber(payload.randomWalkSpeedJitter, 0.0, 0.85);
  }
  if (Number.isFinite(payload.humanSpawnRadius)) {
    experiment.humanSpawnRadius = clampNumber(payload.humanSpawnRadius, 2, 80);
  }
  if (Number.isFinite(payload.botSpawnRadius)) {
    experiment.botSpawnRadius = clampNumber(payload.botSpawnRadius, 2, 80);
  }

  ensureBotCount();
  if (prevPhase !== experiment.phase || prevModel !== experiment.botModel || prevRule !== experiment.visibilityRule) {
    recordPhaseEvent(`${experiment.phase} | ${experiment.botModel} | ${experiment.visibilityRule}`);
  }
  writeLog("config", { config: { ...experiment } });
}

function updateAgentMeta(payload) {
  if (!payload || typeof payload !== "object") return;
  const agent = humans.get(payload.id) || bots.get(payload.id);
  if (!agent) return;
  if (typeof payload.scarfColor === "string" && payload.scarfColor.trim()) {
    agent.scarfColor = payload.scarfColor.trim();
  }
  if (typeof payload.tag === "string" && payload.tag.trim()) {
    agent.tag = payload.tag.trim().slice(0, 12);
  }
  if (payload.role === "normal" || payload.role === "informed" || payload.role === "bridge") {
    agent.role = payload.role;
  }
  if (payload.group === "A" || payload.group === "B" || payload.group === "bridge") {
    agent.group = payload.group;
  }
  writeLog("agent_meta_update", {
    id: agent.id,
    tag: agent.tag,
    scarfColor: agent.scarfColor,
    role: agent.role,
    group: agent.group,
  });
}

function resetDefaultGroupsAndScarves() {
  for (const h of humans.values()) {
    h.group = h.seq % 2 === 0 ? "A" : "B";
    h.scarfColor = SCARF_PALETTE[(h.seq - 1) % SCARF_PALETTE.length];
  }
  for (const b of bots.values()) {
    b.group = b.seq % 2 === 0 ? "A" : "B";
    b.scarfColor = SCARF_PALETTE[(b.seq - 1) % SCARF_PALETTE.length];
  }
}

function triggerLoomingStimulus(targetAgentId = null) {
  const humanArr = [...humans.values()];
  if (humanArr.length === 0) return;
  let target = humanArr.find((h) => h.id === targetAgentId);
  if (!target) {
    target = humanArr[Math.floor(Math.random() * humanArr.length)];
  }
  const sockId = agentIdToSocketId.get(target.id);
  const sock = sockId ? io.sockets.sockets.get(sockId) : null;
  lastStartleAt = Date.now();
  // Approach from within the targeted student's forward field of view (±16°) so the looming dive is unmistakable
  const baseHeading = Number.isFinite(target.heading) ? target.heading : 0;
  const jitter = randomRange(-0.28, 0.28);
  const dirAngle = Math.atan2(Math.sin(baseHeading + jitter), Math.cos(baseHeading + jitter));
  if (sock) {
    sock.emit("stimulus:looming", {
      t: lastStartleAt,
      approachAngle: dirAngle,
      durationMs: 3200,
    });
  }
  recordPhaseEvent(`Looming Stimulus -> ${target.tag}`);
  writeLog("looming_stimulus", { targetId: target.id, targetTag: target.tag, approachAngle: dirAngle });
}

function handleExperimentAction(payload) {
  if (!payload || typeof payload !== "object") return;
  const action = payload.action;

  if (action === "preset_expt1a_entrain") {
    // Expt 1A: Locust Swarm Entrainment (14 bots marching, students only see bots)
    experiment.activePreset = "expt1_entrain";
    experiment.botCount = 14;
    experiment.matchBotsToHumans = false;
    experiment.phase = "bots_only";
    experiment.botModel = "directed_swarm";
    experiment.boundaryMode = "hex_torus";
    experiment.visibilityRule = "all";
    experiment.oasisEnabled = false;
    experiment.stopAndGoEnabled = false;
    experiment.collisionScoreEnabled = false;
    if (Number.isFinite(payload.swarmR)) {
      experiment.swarmR = clampNumber(payload.swarmR, 0, 1);
    } else if ((experiment.swarmR ?? 0.96) < 0.25) {
      experiment.swarmR = 0.96;
    }
    assignInformedRoles(0);
    experiment.running = true;
    visibilityOverrides.clear();
    ensureBotCount();
    resetDefaultGroupsAndScarves();
    resetAllScores();
    resetAllPositions({ alignBotsToSwarm: true });
    recordPhaseEvent(`Expt 1A: Locust Entrainment (R=${experiment.swarmR}, θ=${experiment.swarmDirectionDeg}°)`);
  } else if (action === "preset_expt1b_handoff") {
    // Expt 1B: Handoff to 15 Real Students (bots hidden, students see each other)
    experiment.activePreset = "expt1_handoff";
    experiment.botCount = 0; experiment.matchBotsToHumans = false;
    assignInformedRoles(0);
    for (const h of humans.values()) { h.group = h.seq % 2 === 0 ? "A" : "B"; }
    experiment.phase = "humans_only";
    experiment.boundaryMode = "hex_torus";
    experiment.visibilityRule = "all";
    experiment.oasisEnabled = false;
    experiment.stopAndGoEnabled = false;
    experiment.collisionScoreEnabled = false;
    experiment.running = true;
    visibilityOverrides.clear();
    ensureBotCount();
    resetAllScores();
    if (payload.resetPositions) {
      resetDefaultGroupsAndScarves();
      resetAllPositions({ alignBotsToSwarm: false });
    }
    recordPhaseEvent(payload.resetPositions ? "Expt 1B: 15 Students (Reset)" : "Expt 1B: 15 Students (In-Place)");
  } else if (action === "preset_expt2_bifurcation") {
    // Expt 2: Couzin Two-Stream Bifurcation
    experiment.activePreset = "expt2_bifurcation";
    experiment.botCount = 14; experiment.matchBotsToHumans = false;
    assignInformedRoles(0);
    experiment.phase = "bots_only";
    experiment.botModel = "bifurcating_swarm";
    experiment.boundaryMode = "hex_torus";
    experiment.visibilityRule = "all";
    experiment.oasisEnabled = false;
    experiment.stopAndGoEnabled = false;
    experiment.collisionScoreEnabled = false;
    if (Number.isFinite(payload.swarmSplitAngleDeg)) {
      experiment.swarmSplitAngleDeg = clampNumber(payload.swarmSplitAngleDeg, 0, 180);
    }
    if (Number.isFinite(payload.swarmR)) {
      experiment.swarmR = clampNumber(payload.swarmR, 0, 1);
    } else if ((experiment.swarmR ?? 0.96) < 0.25) {
      experiment.swarmR = 0.96;
    }
    experiment.running = true;
    visibilityOverrides.clear();
    ensureBotCount();
    resetDefaultGroupsAndScarves();
    resetAllScores();
    // Color bot scarves by stream branch so you can optionally reveal the two streams
    for (const b of bots.values()) {
      b.scarfColor = b.streamBranch === 1 ? "#3b82f6" : "#f97316";
    }
    resetAllPositions({ alignBotsToSwarm: true });
    recordPhaseEvent(`Expt 2: Bifurcation (Δθ=${experiment.swarmSplitAngleDeg}°)`);
  } else if (action === "preset_expt3_informed") {
    // Expt 3: Informed Minority in 15-Student Flock
    experiment.activePreset = "expt3_informed";
    experiment.botCount = 0; experiment.matchBotsToHumans = false;
    experiment.phase = "humans_only";
    experiment.boundaryMode = "hex_torus";
    experiment.visibilityRule = "all";
    experiment.oasisEnabled = false;
    experiment.stopAndGoEnabled = false;
    experiment.collisionScoreEnabled = false;
    ensureBotCount();
    resetDefaultGroupsAndScarves();
    resetAllScores();
    const k = Number.isFinite(payload.informedCount) ? payload.informedCount : 3;
    assignInformedRoles(k);
    experiment.running = true;
    visibilityOverrides.clear();
    resetAllPositions({ alignBotsToSwarm: false });
    recordPhaseEvent(`Expt 3: Informed Minority (K=${experiment.informedCount})`);
  } else if (action === "preset_expt4_echo") {
    // Expt 4: Social Network Echo Chambers + Bridge Individual
    experiment.activePreset = "expt4_echo";
    experiment.botCount = 0; experiment.matchBotsToHumans = false;
    assignInformedRoles(0);
    experiment.phase = "humans_only";
    experiment.boundaryMode = "hex_torus";
    experiment.visibilityRule = "echo_chambers";
    experiment.oasisEnabled = false;
    experiment.stopAndGoEnabled = false;
    experiment.collisionScoreEnabled = false;
    ensureBotCount();
    resetAllScores();
    assignEchoChambers(Boolean(payload.colorScarvesByChamber));
    experiment.running = true;
    visibilityOverrides.clear();
    resetAllPositions({ alignBotsToSwarm: false });
    recordPhaseEvent("Expt 4: Echo Chambers (A / B + Bridge)");
  } else if (action === "preset_expt4_topological") {
    // Expt 4B: Topological k-Nearest vs Metric Radius
    experiment.activePreset = "expt4_sensory";
    experiment.botCount = 0; experiment.matchBotsToHumans = false;
    assignInformedRoles(0);
    experiment.phase = "humans_only";
    experiment.boundaryMode = "hex_torus";
    experiment.visibilityRule = payload.rule === "metric_radius" ? "metric_radius" : "topological_k";
    experiment.oasisEnabled = false;
    experiment.stopAndGoEnabled = false;
    experiment.collisionScoreEnabled = false;
    experiment.running = true;
    visibilityOverrides.clear();
    ensureBotCount();
    resetDefaultGroupsAndScarves();
    resetAllScores();
    recordPhaseEvent(`Expt 4: ${experiment.visibilityRule}`);
  } else if (action === "preset_expt5_predator") {
    // Expt 5: Looming Predator Startle Cascade
    experiment.activePreset = "expt5_predator";
    experiment.botCount = 0; experiment.matchBotsToHumans = false;
    assignInformedRoles(0);
    for (const h of humans.values()) { h.group = h.seq % 2 === 0 ? "A" : "B"; }
    experiment.phase = "humans_only";
    experiment.boundaryMode = "hex_torus";
    experiment.visibilityRule = "all";
    experiment.oasisEnabled = false;
    experiment.stopAndGoEnabled = false;
    experiment.collisionScoreEnabled = false;
    experiment.running = true;
    ensureBotCount();
    resetAllScores();
    triggerLoomingStimulus(payload.targetId || null);
  } else if (action === "preset_expt6_taxis") {
    // Expt 6: Collective Taxis / Emergent Gradient Climbing (Berdahl et al.)
    experiment.activePreset = "expt6_taxis";
    experiment.botCount = 0; experiment.matchBotsToHumans = false;
    assignInformedRoles(0);
    ensureBotCount();
    resetDefaultGroupsAndScarves();
    resetAllScores();
    const soloMode = Boolean(payload.asocialSolo);
    experiment.phase = "humans_only";
    experiment.boundaryMode = "reflective";
    experiment.visibilityRule = soloMode ? "blind_solo" : "all";
    experiment.oasisEnabled = true;
    experiment.stopAndGoEnabled = false;
    experiment.collisionScoreEnabled = false;
    experiment.running = true;
    visibilityOverrides.clear();
    resetAllPositions({ alignBotsToSwarm: false, repositionOasis: true });
    recordPhaseEvent(soloMode ? "Expt 6: Taxis (Asocial Solo Control)" : "Expt 6: Collective Taxis (Social Flock)");
  } else if (action === "preset_expt7_stopgo") {
    // Expt 7: Locust Stop-and-Go Collision Avoidance (intermittent locomotion)
    experiment.activePreset = "expt7_stopgo";
    const useHumansOnly = Boolean(payload.humansOnly);
    experiment.botCount = useHumansOnly ? 0 : 14;
    experiment.matchBotsToHumans = false;
    assignInformedRoles(0);
    experiment.phase = useHumansOnly ? "humans_only" : "bots_only";
    experiment.botModel = "directed_swarm";
    experiment.boundaryMode = "hex_torus";
    experiment.visibilityRule = "all";
    experiment.oasisEnabled = false;
    experiment.stopAndGoEnabled = true;
    experiment.collisionScoreEnabled = false;
    if (!experiment.speedVariance || experiment.speedVariance < 0.05) {
      experiment.speedVariance = 0.15;
      experiment.randomWalkSpeedJitter = 0.15;
    }
    experiment.running = true;
    visibilityOverrides.clear();
    ensureBotCount();
    resetDefaultGroupsAndScarves();
    resetAllScores();
    resetAllPositions({ alignBotsToSwarm: true });
    recordPhaseEvent("Expt 7: Locust Stop & Go Collision Avoidance");
  } else if (action === "preset_expt8_avoid_bumps") {
    // Expt 8: Avoid Bumping / Collision Damage Score Mode (test emergent alignment from avoiding collisions)
    experiment.activePreset = "expt8_avoid_bumps";
    const multiHuman = humans.size >= 2 && !payload.withBots;
    experiment.botCount = multiHuman ? 0 : 14;
    experiment.matchBotsToHumans = false;
    assignInformedRoles(0);
    experiment.phase = multiHuman ? "humans_only" : "bots_only";
    experiment.botModel = "collision_avoid";
    experiment.boundaryMode = "hex_torus";
    experiment.visibilityRule = "all";
    experiment.oasisEnabled = false;
    experiment.stopAndGoEnabled = false;
    experiment.collisionScoreEnabled = true;
    if (!experiment.speedVariance || experiment.speedVariance < 0.05) {
      experiment.speedVariance = 0.15;
      experiment.randomWalkSpeedJitter = 0.15;
    }
    experiment.running = true;
    visibilityOverrides.clear();
    ensureBotCount();
    resetDefaultGroupsAndScarves();
    resetAllScores();
    resetAllPositions({ alignBotsToSwarm: false });
    recordPhaseEvent("Expt 8: Avoid Bumps (Collision Damage & Score)");
  } else if (action === "reset_scores") {
    resetAllScores();
    recordPhaseEvent("Reset Collision Scores & Damage");
  } else if (action === "colorize_scarves_unique") {
    let idx = 0;
    for (const a of listAgents()) {
      a.scarfColor = SCARF_PALETTE[idx % SCARF_PALETTE.length];
      idx += 1;
    }
    experiment.showScarves = true;
    recordPhaseEvent("Assigned Unique Scarf Colors");
  } else if (action === "colorize_scarves_uniform") {
    for (const a of listAgents()) {
      a.scarfColor = "#f97316";
    }
    recordPhaseEvent("Assigned Uniform Scarf Colors");
  } else if (action === "match_bots_now") {
    experiment.matchBotsToHumans = true;
    if (humans.size >= 2) {
      experiment.botCount = humans.size - 1;
    } else {
      experiment.botCount = 14;
    }
    ensureBotCount();
    recordPhaseEvent(`Matched Bots (${bots.size}) to Class Size`);
  } else if (action === "start_trial") {
    startTrial(payload.name);
  } else if (action === "stop_trial") {
    stopTrial();
  } else if (action === "delete_trial") {
    deleteTrial(String(payload.id || ""));
  } else if (action === "set_trial_kept") {
    setTrialKept(String(payload.id || ""), Boolean(payload.kept));
  } else if (action === "rename_trial") {
    renameTrial(String(payload.id || ""), payload.name);
  } else if (action === "reset_positions") {
    resetAllPositions({ repositionOasis: experiment.oasisEnabled });
    recordPhaseEvent("Reset Positions");
  } else if (action === "clear_history") {
    metricsHistory.length = 0;
    phaseTransitionCurve.length = 0;
    phaseEvents.length = 0;
    recordPhaseEvent("Cleared Plots");
  }
}

function applyVisibilityOverrides(edgeList) {
  if (!Array.isArray(edgeList)) return;
  for (const edge of edgeList) {
    if (!edge || typeof edge !== "object") continue;
    const { observerId, targetId, canSee: value } = edge;
    if (typeof observerId !== "string" || typeof targetId !== "string" || typeof value !== "boolean") {
      continue;
    }
    if (!visibilityOverrides.has(observerId)) {
      visibilityOverrides.set(observerId, new Map());
    }
    visibilityOverrides.get(observerId).set(targetId, value);
  }
  writeLog("visibility_override_update", { edgeCount: edgeList.length });
}

ensureBotCount();
writeLog("session_start", { world: WORLD, config: { ...experiment } });
recordPhaseEvent("Session Start (15-Student Lab)");

function cleanDisplayName(raw) {
  return String(raw || "")
    .replace(/[^\p{L}\p{N} .'-]/gu, "")
    .trim()
    .slice(0, 18);
}

function claimDisplayTag(name, seq) {
  const base = cleanDisplayName(name);
  if (!base) return `S${seq}`;
  const used = new Set(listAgents().map((agent) => agent.tag));
  if (!used.has(base)) return base;
  for (let n = 2; n < 40; n += 1) {
    const tag = `${base.slice(0, 14)} ${n}`;
    if (!used.has(tag)) return tag;
  }
  return `S${seq}`;
}

io.on("connection", (socket) => {
  const role = socket.handshake.query?.role;
  if (role === "admin") {
    const key = String(socket.handshake.query?.key || "");
    if (key !== lecturerKey) {
      socket.emit("admin:denied");
      setTimeout(() => socket.disconnect(true), 30);
      return;
    }
    adminSockets.add(socket.id);
    emitTrialSeries();
    writeLog("admin_join", { socketId: socket.id });

    socket.on("admin:setConfig", (payload) => {
      sanitizeConfigUpdate(payload);
    });
    socket.on("admin:experimentAction", (payload) => {
      handleExperimentAction(payload);
    });
    socket.on("admin:updateAgentMeta", (payload) => {
      updateAgentMeta(payload);
    });
    socket.on("admin:triggerLooming", (payload) => {
      triggerLoomingStimulus(payload?.targetId || null);
    });
    socket.on("admin:setVisibilityOverrides", (payload) => {
      applyVisibilityOverrides(payload?.edges);
    });
    socket.on("admin:clearVisibilityOverrides", () => {
      visibilityOverrides.clear();
      writeLog("visibility_override_clear");
    });
    socket.on("disconnect", () => {
      adminSockets.delete(socket.id);
      writeLog("admin_leave", { socketId: socket.id });
    });
    return;
  }

  const givenCode = String(socket.handshake.query?.code || "");
  if (experiment.joinCode && givenCode !== experiment.joinCode) {
    socket.emit("join:rejected", { reason: "code" });
    setTimeout(() => socket.disconnect(true), 30);
    return;
  }

  const agentId = `h-${crypto.randomUUID().slice(0, 8)}`;
  const agent = newAgent(agentId, "human");
  agent.tag = claimDisplayTag(socket.handshake.query?.name, agent.seq);
  humans.set(agentId, agent);
  socketsToAgentId.set(socket.id, agentId);
  agentIdToSocketId.set(agentId, socket.id);
  inputs.set(agentId, {
    up: false,
    down: false,
    left: false,
    right: false,
    aim: agent.heading,
    pitch: 0,
  });

  ensureBotCount();
  writeLog("join", { agentId, tag: agent.tag, socketId: socket.id, type: "human" });

  socket.emit("joined", { id: agentId, tag: agent.tag, world: WORLD });

  socket.on("input", (payload) => {
    const prev = inputs.get(agentId) || {};
    inputs.set(agentId, {
      up: Boolean(payload?.up),
      down: Boolean(payload?.down),
      left: Boolean(payload?.left),
      right: Boolean(payload?.right),
      aim: Number.isFinite(payload?.aim) ? payload.aim : prev.aim,
      pitch: Number.isFinite(payload?.pitch) ? payload.pitch : prev.pitch || 0,
    });
  });

  socket.on("looming:resolved", (payload) => {
    const agent = humans.get(agentId);
    if (!agent) return;
    const hit = Boolean(payload?.hit);
    writeLog("looming_result", { agentId, tag: agent.tag, hit });
    if (!hit || isKnockedOut(agent, Date.now()) || agent.safeUntil > Date.now()) return;
    if (!experiment.collisionScoreEnabled) return;
    agent.damage = Math.min(100, Number(((agent.damage || 0) + 40).toFixed(2)));
    agent.score = Math.max(0, Math.round(100 - agent.damage));
    if (agent.damage >= 100) beginKnockout(agent, Date.now());
  });

  socket.on("disconnect", () => {
    humans.delete(agentId);
    socketsToAgentId.delete(socket.id);
    agentIdToSocketId.delete(agentId);
    inputs.delete(agentId);
    visibilityOverrides.delete(agentId);
    for (const map of visibilityOverrides.values()) {
      map.delete(agentId);
    }
    ensureBotCount();
    writeLog("leave", { agentId, socketId: socket.id, type: "human" });
  });
});

let lastTick = Date.now();
let lastSample = Date.now();
let lastAdminPush = Date.now();
let latestMetrics = computeOrderParameters(Date.now());

setInterval(() => {
  const now = Date.now();
  const dt = Math.max(0.001, Math.min(0.2, (now - lastTick) / 1000));
  lastTick = now;

  ensureBotCount();
  rebuildDynamicVisibilitySets();

  const allAgents = listAgents();
  if (experiment.running) {
    for (const agent of humans.values()) {
      updateHuman(agent, dt, now, allAgents);
    }
    const allBots = [...bots.values()];
    for (const agent of allBots) {
      updateBot(agent, dt, now, allBots, allAgents);
    }
    updateCollisionsAndDamage(dt, now, allAgents);
  }

  rebuildDynamicVisibilitySets();
  pushParticipantWorld();

  if (now - lastSample >= LOG_SAMPLE_MS) {
    latestMetrics = computeOrderParameters(now);
    metricsHistory.push(latestMetrics);
    recordTrialFrame(now, latestMetrics);
    if (metricsHistory.length > 600) {
      metricsHistory.splice(0, metricsHistory.length - 600);
    }
    writeLog("metrics", latestMetrics);

    for (const agent of listAgents()) {
      writeLog("sample", {
        activePreset: experiment.activePreset,
        phase: experiment.phase,
        botModel: experiment.botModel,
        visibilityRule: experiment.visibilityRule,
        swarmDirectionDeg: experiment.swarmDirectionDeg,
        swarmSplitAngleDeg: experiment.swarmSplitAngleDeg,
        running: experiment.running,
        id: agent.id,
        tag: agent.tag,
        kind: agent.type,
        role: agent.role,
        group: agent.group,
        x: Number(agent.x.toFixed(2)),
        y: Number(agent.y.toFixed(2)),
        vx: Number(agent.vx.toFixed(2)),
        vy: Number(agent.vy.toFixed(2)),
        heading: Number(agent.heading.toFixed(4)),
        pitch: Number((agent.pitch || 0).toFixed(4)),
        inOasis: !!agent.inOasis,
        score: Math.round(agent.score ?? 100),
        damage: Number((agent.damage || 0).toFixed(1)),
        bumps: agent.bumps || 0,
        stoppedByCollision: !!agent.stoppedByCollision,
      });
    }
    lastSample = now;
  }

  if (now - lastAdminPush >= ADMIN_PUSH_MS) {
    pushAdminState(latestMetrics);
    lastAdminPush = now;
  }
}, TICK_MS);

app.get("/export/trials.csv", (_req, res) => {
  const header = ["trialId", "trialName", "kept", "preset", "tRelMs", ...TRIAL_METRIC_KEYS];
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="trials.csv"');
  res.write(`${header.join(",")}\n`);
  for (const tr of trials) {
    for (const row of tr.metrics || []) {
      const cells = [
        tr.id,
        tr.name,
        tr.kept !== false,
        tr.preset,
        row.t,
        ...TRIAL_METRIC_KEYS.map((key) => row[key] ?? ""),
      ];
      res.write(`${cells.map(escapeCsv).join(",")}\n`);
    }
  }
  res.end();
});

app.get("/export/trials.json", (_req, res) => {
  res.json({ trials });
});

app.get("/export/trial/:id.json", (req, res) => {
  const tr = trials.find((row) => row.id === req.params.id);
  if (!tr) {
    res.status(404).json({ error: "trial not found" });
    return;
  }
  res.json(tr);
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`classroom-agents server running on http://localhost:${PORT}`);
  // eslint-disable-next-line no-console
  console.log(`admin dashboard: http://localhost:${PORT}/admin`);
  // eslint-disable-next-line no-console
  console.log(`Lecturer key (dashboard only, not for students): ${lecturerKey}`);
  // eslint-disable-next-line no-console
  console.log(`log file: ${logFile}`);
});
