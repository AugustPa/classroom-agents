# AGENTS.md — Handover for Classroom Collective-Behaviour Agents

> **Read this first.** This file is the authoritative context/intent/requirements document so any
> agent (or human) can take over this project cold. The user is a lecturer preparing a
> collective-behaviour course. Optimize for: *works live in front of a class, on student laptops,
> with zero install for students.* Visual quality matters, but reliability and frame rate matter more.
> **Always visually test changes in a real browser before claiming they work** (see §9).

---

## 1. Intent / why this exists

- A browser-based virtual experiment for a lecture on **collective behaviour** (2 × 1 h sessions,
  30 min break), about using video games / VR-style worlds to study collective behaviour — a
  stepping stone to later real insect-VR experiments. **Students are "being the insect"**,
  analogous to locust VR swarming experiments.
- Class size: **N = 15 students**. Design everything for 15 (each student always has N−1 = 14 peers).
- Core deception in Phase 1: students control themselves but initially see only teacher-controlled
  **bots** and must not know whether peers are bots or humans. Then bots are seamlessly replaced
  by the real students (Expt 1B in-place handoff).
- Teacher has a "god view" dashboard with live statistics, can tune everything live, and can
  explain each experiment afterwards with simplified paper statistics.
- Paper figures in the dashboard are **schematic redraws, never copied paper figures**
  (copyright + no source access). Keep it that way.

## 2. How to run

```bash
cd /Users/pavan/classroom-agents
npm install        # only if node_modules missing
npm start          # node index.js, port 3000 (PORT env overrides)
```

- Students: `http://localhost:3000/` — first-person fox, WASD/arrows + mouse (click = pointer lock).
- Teacher: `http://localhost:3000/admin`
- Health: `GET /health` → `{"ok":true}`
- Restart cleanly: `lsof -ti :3000 | xargs kill -9` then `npm start`.
  Background-task notifications with **exit 137 are intentional kills of old servers — ignore them**.
- Students with an old tab must hard-refresh (`Cmd+Shift+R`) after client changes.
- There are **no automated tests** (`npm test` is a stub). Verification = syntax checks
  (`node --check index.js`, `node --check public/admin.js`) + live browser testing (§9).
  Note: `node --check public/app.js` fails with an ESM warning — that is expected (ES module), not a bug.
- Git: repo initialized but most files are still **untracked**. Don't assume a commit history exists.

## 3. Stack & file map

Stack: Node.js + Express 5 + Socket.IO 4 + Three.js 0.187 (served locally, no runtime CDN —
`/vendor/three`, `/vendor/three-addons`). Server is authoritative; tick 50 ms, admin push 200 ms,
JSONL logging every 200 ms to `logs/session-*.jsonl`.

| File | Role |
|---|---|
| `index.js` | Entire server: experiment state, bots, hex-torus boundaries, visibility rules, metrics, logging, CSV exports, presets |
| `public/app.js` | Student client (ES module): Three.js first-person, Fox rendering, mirrored ghosts, instructions, looming |
| `public/index.html` | Student page (HUD + task banner + importmap) |
| `public/admin.html` | Teacher dashboard markup (preset buttons, controls, canvases) |
| `public/admin.js` | Dashboard logic: god view, polar rose, metrics chart, crux histogram, expected-model schematics, roster, visibility matrix, URL config |
| `public/styles.css` | All styling (dark lab theme + student HUD/task banner) |
| `public/assets/models/Fox.glb` | **The** agent model (159 KB Khronos fox, Survey/Walk/Run). Do NOT switch to ToyCar.glb (5.6 MB) |
| `public/assets/skybox/mountain-panorama.jpg` | Equirect sky (Poly Haven fouriesburg_mountain_midday) + cube fallback in same dir |
| `public/assets/textures/` | Grass (`grass.jpg`, `grass_ground/` PBR set) |
| `logs/` | Per-session JSONL; accumulates — safe to prune old sessions |

## 4. The six experiments (requirements — do not break)

All presets are triggered from the dashboard buttons or `admin:experimentAction` socket events
(server: `handleExperimentAction` in `index.js`). One click must fully reset that experiment.

| # | Action (`admin:experimentAction`) | Setup | Students see / are told | Bots |
|---|---|---|---|---|
| 1A | `preset_expt1a_entrain` | `bots_only`, `directed_swarm`, hex torus | 14 bots marching at θ_swarm. "🦗 GO WITH THE FLOW" | 14 (or N−1 if ≥2 humans & match enabled) |
| 1B | `preset_expt1b_handoff` (`resetPositions` bool) | `humans_only`, hex torus | Bots vanish, 15 students see each other. "KEEP THE MARCH GOING" | **0** |
| 2 | `preset_expt2_bifurcation` (`swarmSplitAngleDeg`) | `bots_only`, `bifurcating_swarm` ±Δθ/2, blue/orange branch scarves | Two streams interleaved everywhere. "🔀 PICK A FLOW — AND COMMIT" | 14 |
| 3 | `preset_expt3_informed` (`informedCount`, default 3) | `humans_only`, hex torus | Informed (first K humans) privately see golden beacon + "★ SECRET MISSION"; others see "STAY WITH THE GROUP" — never leak roles | **0** |
| 4A | `preset_expt4_echo` (`colorScarvesByChamber`) | `humans_only`, `echo_chambers` | Chambers A (blue) / B (red) see only own group; human #0 is gold **bridge**. "GO WITH WHO YOU CAN SEE" | **0** |
| 4B | `preset_expt4_topological` (`rule`) | `humans_only`, `topological_k` (k=4 default) or `metric_radius` | "MIND YOUR NEIGHBOURS" | **0** |
| 5 | `preset_expt5_predator` (or `admin:triggerLooming {targetId}`) | `humans_only`, hex torus | One random student gets an expanding dark-red looming disc (DCMD-style) for 3.2 s; others see only reactions. "🦅 PREDATOR COUNTRY" | **0** |
| 6 | `preset_expt6_taxis` (`asocialSolo` bool) | `humans_only`, **reflective finite arena**, oasis ON | Oasis (radius 11 m, placed 15–22 m away) slows you to ×0.32 — nobody is told where. 6A social `all`, 6B solo `blind_solo`. "EXPLORE" | **0** |
| 7 | `preset_expt7_stopgo` (`humansOnly` bool) | `stopAndGoEnabled: true`, `speedVariance: 0.15`, hex torus | Locust stop-and-go collision avoidance (pause ~0.75 s when about to bump a peer within `collisionStopDist=2.3 m` ahead, then resume GO). HUD shows `⏸ STOP (fox ahead)` / `▶ GO`. | 14 (or 0 if `humansOnly`) |
| 8 | `preset_expt8_avoid_bumps` (`withBots` bool) | `collisionScoreEnabled: true`, `botModel: collision_avoid`, hex torus | Every bump (`d <= collisionRadius=1.25 m`) deals impact + contact damage and lowers Score (from 100). "AVOID COLLISIONS" + live Score/Damage/Bumps on student HUD & admin roster. | **0** if ≥2 humans (14 in solo preview) |

Invariants:
- Bots exist **only** in Expt 1A/2. Presets for 3–6 set `botCount=0`; 1A/2 restore 14.
- Bot tags always recycle to B1…B14 (`newAgent` picks smallest free bot seq) — they must never
  inflate to B48 after preset switches. Humans are S1, S2, … in join order (never recycled).
- Presets that don't use informed roles must call `assignInformedRoles(0)` (role leakage between
  experiments was a real bug). Expt 6 also resets echo groups.
- Student instructions come from the server (`instructionFor()` in `index.js`, per preset **and
  role**), pushed in the participant payload — keep instructions **minimal and non-directive**
  (`EXPLORE — Move around the field.`) so collective behaviour emerges naturally rather than being
  instructed, and keep roles/handoffs secret-safe (only informed students in Expt 3 see
  `★ GOLDEN BEACON — Head toward the golden beacon in the distance.`).

## 5. The mirrored infinite swarm (hex torus) — central design, handle with care

User requirement: *endless swarm, nobody ever reaches an edge, no region with only one
bifurcation branch, high density everywhere, cheap on student laptops, and the teacher must not
be overwhelmed by mirrored copies.*

How it works (server `index.js`, client `public/app.js` — maths duplicated in both, keep in sync):

- Simulation lives in **one hexagonal periodic cell**: basis `e1=(S,0)`, `e2=(S/2, S·√3/2)`,
  `S = hexSpacing` (default **24 m**). `worldToLattice/latticeToWorld`, `wrapAgentHex`,
  and `torusDelta` (minimum-image) are used for positions, bot neighbours, and visibility
  distances. `boundaryMode: "hex_torus"` is default for Expts 1–5. Expt 6 is the exception
  (finite oasis needs a real place): `reflective`, ghosts off.
- Spawns (`hexSpawnPoints`) are a **hex grid ~4.4 m apart spread across the whole cell**, shuffled
  so humans/bots and bifurcation branches are spatially interleaved. (The old 2.4 m tight pack
  was a visual disaster: neighbours filled the camera. Don't re-tighten.)
- Client keeps **continuous unwrapped positions (`contTarget`/`contSmooth`) for self and every peer**
  using the exact **7-shift hexagonal Wigner-Seitz Voronoi cell** (`torusDeltaClient`), placing each
  canonical fox at the nearest Voronoi image around the camera so crossing the seam never teleports
  or resets smoothing. Foxes stay **100% full scale (`1.0`) right up to collision** (no close-range
  shrinking) and **disappear cleanly when you collide with them** (`camDistXZ <= collisionRadius`,
  default **1.25 m**).
- **Ghosts (refined 2026-10-31):** every peer (never yourself) is re-rendered across a camera-centered
  hex stencil (`rings + 2`) culled smoothly inside the thick fog disk. Once Fox.glb loads, ghosts use
  the **exact Fox.glb mesh + UV texture + neckerchief + a 17-keyframe Vertex Animation Texture (VAT)**
  (`bakeFoxGhostResources` in `app.js`: symmetric `Survey` `t=0.65` standing pose in `position`, all
  17 exact keyframes of `Walk` in `uFoxVat` `DataTexture`, plus `customDepthMaterial` for shadows and
  matching bandana emissive) — matching the `SkinnedMesh` to `< 5 mm` in **2 instanced draw calls**.
  Canonical foxes reset `neckBone`/`headBone` Euler from the mixer quaternion each frame (preventing
  Euler drift) and ease bone twist to 0 by 9.5 m (inside the 12 m Voronoi boundary) so `canon↔ghost`
  handoffs are invisible. Do not replace ghosts with plain boxes/capsules.
- **Fog masks the tiling edge:** `FogExp2(0xc4cfc0, 0.034)` + ghost shader fog-melt (`18–38 m`) +
  smooth scale ease before `cullDist` + gradual `t^2.8` skybox equator mist so replicas dissolve
  completely into thick mist with zero popping.
- **God view never draws ghosts:** in hex mode the dashboard plots the single canonical cell in
  lattice (u,v) coordinates (`worldToLatAdmin`), with a **Trails Show: Both/Students/Bots/None**
  filter. Trails auto-clear on preset/boundary change.

Tunables (dashboard §4 sidebar, all live): `hexSpacing` 8–45 m, `hexRings` 0–3, `mirrorGhosts`.
Student-side URL overrides: `/?quality=low&rings=1&shadows=0` (lower rings, pixelRatio 1,
no shadows/antialias). Client also auto-degrades (EMA frame > 27 ms → pixelRatio 1, shadows off,
rings capped at 1). Measured: 252 ghosts ≈ 8 ms/frame in the test browser.

## 6. Identity: scarves & tags

- Each fox wears a **neckerchief**: slim torus collar band (rotated so its plane is YZ around the
  forward X axis) + flattened triangular kerchief cone tip on the chest + knot sphere, in the
  agent's `scarfColor` (15-colour `SCARF_PALETTE`, humans/bots by sequence). Ghosts show the same
  colour in their bandana instance colour.
- **Do not** re-add: the old thick torus (read as a coloured blob on the neck) or any ground ring
  under the fox (read as a stray disc). Both were explicitly rejected by the user.
- Optional floating tag sprites (S1…, B1…) exist behind the `showTags` toggle (default off).
- Dashboard roster lets the teacher recolour any individual, rename tags, set role/group,
  or fire a looming stimulus at a specific student (⚡). Roster re-renders only when its
  signature changes (so it doesn't destroy in-progress edits).

## 7. Metrics & statistics (keep simplified, paper-linked)

Computed server-side every 200 ms (`computeGroupStats/computeOrderParameters`), pushed to admin,
logged as `metrics` JSONL rows, kept in `metricsHistory` (600) and exported via CSV:

- Polarization Φ = |Σû|/N (Vicsek order parameter; also move-only variant), entrainment
  ⟨cos(θ−θ_swarm)⟩, branch alignment ⟨max cos to ±Δθ/2 branches⟩, mean heading, mean speed,
  spread R_gyr, oasis fraction, moving/startled fraction.
- Dashboard: KPI cards, Φ(t)/entrainment time series (with phase-event markers), polar heading
  rose (click/drag to steer θ_swarm; two green rays in bifurcation), live heading histogram
  P(θ−θ_swarm) (**the** crux plot: 1 peak = compromise, 2 peaks = bifurcation), and a
  schematic **"Expected in the Model"** panel per preset (redrawn from Vicsek 1995; Buhl et al.
  Science 2006; Couzin et al. Nature 2005; Ballerini et al. PNAS 2008; Berdahl et al. Science 2013).
- Sanity values measured live: directed bots Φ_bots = 1.00; bifurcation at Δθ=100° gives
  Φ_bots ≈ 0.63 ≈ cos(50°) for two equal streams. Use these to check you didn't break the model.
- CSV exports: `/export/samples.csv` (trajectories), `/export/metrics.csv` (order parameters),
  `/export/events.csv` (all JSONL events).

## 8. URL-encoded configuration

- Dashboard: **"🔗 Copy Experiment URL"** button + on-load parsing (`applyUrlConfigOnce` in
  `admin.js`). Example that must keep working:
  `/admin?preset=expt2_bifurcation&swarmSplitAngleDeg=100&hexSpacing=18`
  (`preset` accepts `expt1_entrain|expt1_handoff|expt2_bifurcation|expt3_informed|expt4_echo|
  expt4_sensory|expt5_predator|expt6_taxis` plus numeric config keys).
- Students: performance params only (`quality`, `rings`, `shadows`) — never leak experiment
  internals (roles, oasis position) into student URLs.

## 9. How to test (this is how it was verified — repeat after changes)

The browser tooling merges tabs, so the reliable pattern is:

1. Open one real student tab (`/`), wait ~4 s (Fox.glb loads asynchronously — an early screenshot
   shows fallback shapes), screenshot: peers = 14, task banner correct, ghosts ≈ 252.
2. From inside that student page (CDP `Runtime.evaluate`), open an **admin socket in-page** —
   this keeps the student connected while you drive presets:
   `const {io}=await import('/socket.io/socket.io.esm.min.js'); window.__adm=io({query:{role:'admin'}})`
   then `__adm.emit('admin:experimentAction',{action:'preset_expt2_bifurcation',swarmSplitAngleDeg:100})`.
3. Spawn scripted extra students the same way (participant sockets emitting `input` on an interval)
   to test multi-individual behaviour — 5 simultaneous students were used. Scripted students will
   NOT reproduce human collective behaviour (their Φ stays low); test machinery, not emergence.
4. Check: preset transitions (phase/model/boundary/visibility/bot counts), per-role instructions,
   seam crossing (continuous position must advance at exactly speed × time, e.g. 6.2 m/s × 3 s = 18.6 m),
   looming visibility (face the approach angle — the disc is easy to miss off-axis),
   oasis fraction, CSV endpoints return 200.
5. Screenshot **both** student and `/admin` views and actually look at them. Check: nobody's view
   is blocked by a fox, ghosts look like foxes, no visible tiling edge, bifurcation streams cross,
   dashboard canvases/KPIs/roster (B1–B14) update.

Gotchas already paid for (don't rediscover them):
- Dashboard pushes state every 200 ms — `syncControls()` must not overwrite a control the teacher
  is editing (`CONTROL_IDS` + focus check + 900 ms debounce). Number inputs may show commas;
  always parse with comma→dot replacement.
- Background browser tabs freeze `requestAnimationFrame`: HUD/ghost counts look stale — that's the
  tab, not the app.
- Server config is stateful across browser tests (speeds once got polluted to 60 m/s). Restart
  the server for a clean baseline before visual judgments.
- Fox model: natively faces +Z; `cloned.rotation.y = Math.PI/2` aligns its nose to +X (heading 0).
  Neck/head bones are `b_Neck_04`/`b_Head_05`; head local +X forward, +Z right (used for the
  camera-look bone lead and walk-direction reversal — verified, don't flip signs casually).
- Strafe sign and camera-relative WASD were verified by displacement tests (W → −Z at yaw 0,
  D → +X). If you touch movement code, re-verify numerically, not by eye.

## 10. Open threads / reasonable next steps

- No test with 15 real humans yet (browser tooling limits simultaneous real tabs) — first lecture
  run is the real load test; keep `?quality=low&rings=1` ready for weak laptops.
- Looming predator is a plain expanding disc (faithful to looming stimuli, visually abstract);
  a bird silhouette was discussed but not requested — only change with visual before/after.
- `README.md` is partially stale (asset notes mention the old ToyCar agent). `AGENTS.md`
  (this file) wins where they disagree.
- Possible polish if asked: per-experiment student debrief screen, Φ-vs-noise sweep automation
  (`phaseTransitionCurve` data already exists server-side), replay from JSONL logs.
