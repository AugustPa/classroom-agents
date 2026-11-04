# Collective behaviour lecture — plan

Two hours with a break (about 50 min, 30 min, 50 min). Fifteen students. Each person is one animal in a shared field: they see neighbours, not a diagram, and the group pattern is something you measure afterwards. You run the room from the dashboard. They get a link, a name, and the join code matrex.

The order parameter is **Φ**. It is 0 when headings are random and 1 when everyone moves the same way (Vicsek et al., 1995). **Entrainment** is how well the humans match the bot direction θ. **R** is how ordered the bot swarm itself is: 1 locks them to θ, 0 is a meandering correlated random walk.

## Before anyone arrives

1. In the project folder run `npm run public`. Leave that terminal open.
2. It prints a student link (`https://….trycloudflare.com/`) that works off your Wi‑Fi. The dashboard key is **matrexvr**, so a student who has the link cannot drive the experiment.
3. Open `/admin`, enter **matrexvr** once, and put the student link on the projector or the board.
4. Students open the link, type a name or initials, and the join code **matrex**.

## How to use trials

Treat each condition as a short take, not a one-off.

- Click **Record trial**, let the behaviour settle (often 45–90 s), then **Stop & keep**.
- Do two or three takes of the same setting. If a take is ruined (someone stood up, the group never started, you changed θ halfway), uncheck it or delete it. Checked trials are the ones that count.
- **Repeat-trial Φ(t)** draws every kept take from the moment you pressed record, plus a mean line. That mean is the trend you talk about.
- **Trial distribution** is the cloud of those takes (mean Φ, final Φ, mean entrainment). One lucky run is a dot, not the result.
- **Raw JSON** is the full record (metrics and positions). **Trials CSV** is the same metrics in a table. The older Traj / Metrics / Events CSVs are the continuous session log.

Plots of order, speed, and spread accept scroll-to-zoom and drag-to-pan. Double-click resets the time window. **Replay** on a saved trial plays that take on the god view.

God view has two maps. **Global** unwraps the periodic field, so a straight march is a straight line and a small heading error is a small angle, not a fake diagonal. **Periodic cell** is the single repeating hex: trails stop at the seam instead of slashing across, and clones (the copies students see in the fog) are faint outlines with no extra trails. Scroll zooms and drag pans in both.

## Hour 1 — order, then a decision

| When | What you run | What they experience | What you should see | If it worked | Source |
|---|---|---|---|---|---|
| 0–8 min | Let them join and walk. No speech about the model. | A field of foxes, controls only. | Names, not S1…S15, on the roster. | Everyone is moving. | — |
| 8–25 min | **1A Entrainment.** Bots only, R near 1, pick a θ. Record a trial. Then drop R toward 0 and record another. | They only see bots marching. You do not tell them to follow. | Φ of the bots stays near R. At high R the heading histogram has one peak on θ. At R = 0 the peak flattens and Φ falls. | Humans’ Φ and entrainment rise while R is high, and sag when you disorder the bots. | Vicsek et al., Phys. Rev. Lett. (1995); Buhl et al., Science (2006), locust marching |
| 25–40 min | **1B Handoff**, in place. Record. | Bots vanish. The same people now see each other. | Φ may hold, decay, or swing to a new heading on the polar rose. | You can say whether the march was carried by the bots or by the group. | Buhl et al. (2006) |
| 40–50 min | **2 Bifurcation.** Try a small split (about 20–40°) and a large one (about 100–130°). One trial each. | Two interleaved bot streams. Still no instruction to choose. | Small split: one central peak (they average). Large split: two peaks, and bot Φ falls to about cos(Δθ/2). At 100° that is about 0.64. | The histogram, not the god view, is the crux. | Couzin et al., Nature (2005) |

Break. Leave the room on 1B or pause the sim. Do not start informed or echo before the break; those depend on people not knowing the trick.

## Hour 2 — who is coupled to whom

Do these in order. Skip 6–8 if the argument is already clear; do not skip the reveal on 3 and 4.

| When | What you run | What they experience | What you should see | If it worked | Source |
|---|---|---|---|---|---|
| 0–15 min | **3 Informed**, K = 3. Record. | Three people privately see a golden beacon. Everyone else is only told to stay with the group. | Entrainment of the whole class climbs toward the hidden direction. The uninformed never get the beacon. | A minority steers the fifteen without announcing a heading. | Couzin et al., Nature (2005) |
| 15–30 min | **4A Echo chambers**, or **4B Topological (k = 4)** if you would rather talk about sensing than networks. Record one. | 4A: blue only sees blue, red only sees red, one gold bridge sees both. 4B: each person sees their k nearest, however far. | 4A: two headings can persist on the rose; the matrix shows the cut. 4B: the group stays together when it stretches. Compare with metric radius if you have five minutes. | 4A is a reveal (“you were not in one room”). 4B is “neighbours, not a radius”. | 4A is the classroom network demo. 4B is Ballerini et al., PNAS (2008), starling flocks |
| 30–38 min | **5 Looming**, once. | One person gets an expanding threat. The others only see that neighbour bolt. | A short spike in the moving fraction, then a trail of who turned. | The escape is social: most of them never saw the threat. | Looming / collision-detector tradition (locust DCMD) |
| If time | **6A then 6B** (social oasis, then solo). | Speed drops inside a patch. Nobody is told where it is. Solo they see no one. | A higher fraction in the patch when they can see each other. | The group accumulates where it is slow, without a compass arrow. | Berdahl et al., Science (2013) |
| If time | **7 Stop & go**, then **8 Avoid bumps**. | 7: an automatic pause when someone is about to walk into a neighbour. 8: bumps cost integrity; the bar across the top is the only new cue. | 7: amber pause rings and a stop-go wave. 8: damage rises on contact; ask whether Φ climbs as they stop crossing. | Order can come from not hitting each other, not only from a “match your neighbours” rule. | Bazazi et al. (2008); Ariel et al. (2014); Romanczuk et al. (2009) |

## What you say it was, after each piece

Keep the reveal until the plot is up.

- **Φ(t)** — did order grow, hold, or die? Zoom into the minute you care about.
- **Heading histogram** — one peak means they compromised, two peaks mean they split, a flat histogram is the disordered walk.
- **Polar rose** — the direction they actually picked, which need not be your θ.
- **Global trails** — the path as a path. Use this when you want to see a curve or a steady bearing. Use the periodic cell when you want to see the flock as one dense group, with clones only as ghosts.
- **Kept trials** — the mean line and the spread of dots. Delete the bad take in front of them if you want the room to see that a single run is not the result.

Close on the handoff and the informed minority: the same bodies first copied an external flow, then carried a direction that only three of them could see. That is the bridge to the later insect VR experiments, where the animal is in the world you just put the students in.
