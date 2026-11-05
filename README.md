# Classroom collective behaviour

Fifteen people, one shared field. Each student is a fox. They only see whoever the experiment allows, and the pattern you measure afterwards is the collective behaviour.

This repository is the lecture tool: entrainment, a handoff from bots to students, bifurcation, an informed minority, echo chambers with a bridge, topological versus metric neighbours, a looming threat, social versus solitary search for an invisible patch, stop-and-go, and collision damage. The live class is a Node server. This README and the [browser page](https://pvnkmrksk.github.io/classroom-agents/) play saved class runs. GitHub Pages cannot host the multiplayer server. The page autoplays the videos; GitHub’s README shows a still that links to the same file.

[![First person, walking with the herd](examples/posters/fpv-herd.jpg)](examples/videos/fpv-herd.mp4)

<video src="examples/videos/fpv-herd.mp4" poster="examples/posters/fpv-herd.jpg" muted loop playsinline controls width="100%"></video>

First person in the marching herd, 16 seconds, 30 frames per second, 1600×900. The foxes face the way they are travelling. Neckerchiefs are off in this clip. [Open the video](examples/videos/fpv-herd.mp4). On the [browser page](https://pvnkmrksk.github.io/classroom-agents/) it autoplays, muted, and looped.

## Echo chambers

[![Echo chambers. With a bridge the headings meet. Without one they stay apart.](examples/posters/echo-side-by-side.png)](examples/videos/echo-side-by-side.mp4)

<video src="examples/videos/echo-side-by-side.mp4" poster="examples/posters/echo-side-by-side.png" muted loop playsinline controls width="100%"></video>

Blue sees only blue, red only red. The bridge clip is the later take in the class log (`echo chambers 2`), started when the chambers switch on, with the two colours already on different headings. Order Φ climbs from about 0.3 to 1. The no-bridge take is started at its own switch-on, and Φ stays near 0.2. [Video](examples/videos/echo-side-by-side.mp4).

![Order over time. With a bridge it rises to 1. Without a bridge it stays low.](examples/plots/echo-order.png)

## Finding a patch

[![Social foxes gather in the patch. Solitary foxes stay spread.](examples/posters/taxis-side-by-side.png)](examples/videos/taxis-side-by-side.mp4)

<video src="examples/videos/taxis-side-by-side.mp4" poster="examples/posters/taxis-side-by-side.png" muted loop playsinline controls width="100%"></video>

The last two patch takes. Recording had started while many animals were still inside the previous patch, so both clips begin after the reset, when the new 4&nbsp;m patch is empty. The curve is how many have reached it, so it rises. Social and solitary share the axes. Social: half the group by 34 seconds, all 13 inside by 44 seconds. Solitary: half the group by 47 seconds, and at 122 seconds 10 of 13 have arrived. [Video](examples/videos/taxis-side-by-side.mp4).

![How many foxes have reached the patch. Social rises to 13. Solitary rises more slowly, to 10.](examples/plots/patch-arrivals.png)

## The room

![Teacher dashboard during entrainment. Fourteen bots march across the god view.](examples/figures/god-view.jpg)

The lecturer’s god view during entrainment. One cell is drawn here. On a student’s screen the same foxes are also mirrored into the fog, so the march has no edge.

![God view of the calm patch, with one student outside it.](examples/figures/oasis-god.jpg)

The calm patch, as the teacher sees it during the social taxis preset. Students are not told where it is.

![First person on the grass, with the edge of the calm patch in frame.](examples/figures/oasis-field.jpg)

The same kind of field from a student’s eyes. The blue rim is an optional hint the dashboard can hide.

![Schematic expected results: order, a split, an informed minority, echo chambers, topological neighbours, and social patch finding.](examples/figures/expected-models.png)

Shapes the dashboard sketches for the lecture. These are redrawn schematics, not copies of the paper figures.

## Run the live class

Needs Node 20 or newer. One computer can open the student view and `/admin` together and press the experiment buttons. That is a real single-browser session. A class of laptops needs this server so they share one world. A static GitHub Page cannot do that.

```bash
git clone https://github.com/pvnkmrksk/classroom-agents.git
cd classroom-agents
npm install
npm start
```

- Students: [http://localhost:3000](http://localhost:3000) — name, then join code `matrex`
- Lecturer: [http://localhost:3000/admin](http://localhost:3000/admin) — key `matrexvr`

From another network, in a second terminal:

```bash
npm run public
```

Leave it open. It prints an `https://….trycloudflare.com` link. That link changes every time you start it. Students use the link plus `matrex`. You use the same link with `/admin` and `matrexvr`.

If port 3000 is already taken:

```bash
lsof -ti :3000 | xargs kill -9
pkill -f "cloudflared tunnel --url http://127.0.0.1:3000"
npm run public
```

Students: click to lock the mouse, WASD or arrows to move, mouse to look. Hard-refresh (`Cmd+Shift+R`) after you update the server.

The hour-by-hour lecture plan is [`LECTURE.md`](LECTURE.md). Handover notes for changing the software are [`AGENTS.md`](AGENTS.md).

## Cylinder bifurcation (solo)

Open `/admin` and choose **2C: Cylinder bifurcation (Solo)**. Each participant sees two stationary black vertical cylinders and no other players or bots. Everyone starts at the same position, facing the midpoint between the targets. The lecturer still sees all trajectories.

Use **Bifurcation Split Δθ** and the direction control to position the targets. Cylinder distance, radius and height are adjustable (defaults: 120 m from the start, 2 m radius, 12 m tall). The default targets are about 25 m apart, appearing roughly 12° apart initially. Increasing distance alone preserves their physical spacing and reduces the starting angle. Distance is adjustable from 8–500 m; the open arena lets players reach distant targets. Targets remain fixed in world space while players walk; walking into either target briefly flashes a translucent, text-free rainbow (450 ms) and returns that player to the common start. Held movement keys, velocity and viewing direction carry through the reset without a pause. Other players are unaffected. Each arrival is recorded as a `cylinder_goal` event (player, target, and experiment settings). Wide angles require looking left/right. At 0° the targets overlap.

After setting each condition, press **Reset Positions** and record a new trial using the existing trial controls. Compare initial headings and paths across angles; the live heading plot uses bearings from the starting point, not continuously updated target bearings. No directional instruction is shown to participants. This tests individual responses to two targets, and does not assume a bifurcation will occur.

A shareable setup is `/admin?preset=expt2_cylinders&swarmSplitAngleDeg=12&cylinderDistance=120&cylinderRadius=2&cylinderHeight=12`. The original fox swarm experiment remains available as **2: Bifurcation**.

## What to press

The buttons along the top of the dashboard are the canonical models. One click resets that experiment.

| Button | What the class is doing | What you measure | Source |
|---|---|---|---|
| 1A Entrainment | Students see only a marching swarm. You set its order R and heading θ | Order Φ and entrainment to θ. High R locks the march; R = 0 is a meandering walk | [Vicsek et al., 1995](https://doi.org/10.1103/PhysRevLett.75.1226); [Buhl et al., 2006](https://doi.org/10.1126/science.1125142) |
| 1B Handoff | The swarm vanishes. Students see only each other | Does Φ hold, decay, or pick a new heading | [Buhl et al., 2006](https://doi.org/10.1126/science.1125142) |
| 2 Bifurcation | Two bot streams at ±Δθ/2 | One peak in the heading histogram means they averaged. Two peaks means they split | [Couzin et al., 2005](https://doi.org/10.1038/nature03236) |
| 3 Informed | Three students privately see a beacon. The rest are not told the direction | Does the hidden minority steer all fifteen | [Couzin et al., 2005](https://doi.org/10.1038/nature03236) |
| 4A Echo chambers | Blue sees only blue, red sees only red. One bridge can see both | One shared heading, or two headings that never meet | This lecture’s network. The dashboard does not cite a separate paper |
| 4B Topological | Each student sees their k nearest neighbours, however far | Cohesion when the group is stretched, against a fixed radius | [Ballerini et al., 2008](https://doi.org/10.1073/pnas.0711437105) |
| 5 Looming | One student sees a dive on a straight line and can step off it | Whether the neighbours bolt without seeing the threat | Looming, DCMD-inspired, as labelled on the dashboard. No further paper is named there |
| 6A / 6B Patch | A patch slows everyone down. 6A can see each other. 6B can see no one | Who reaches the patch, and when | [Berdahl et al., 2013](https://doi.org/10.1126/science.1225883) |
| 7 Stop and go | An automatic pause just before a bump | Pause waves through the group | [Ariel et al., 2014](https://doi.org/10.1371/journal.pone.0101636); [Bazazi et al., 2008](https://doi.org/10.1016/j.cub.2008.04.035) |
| 8 Avoid bumps | Contact costs integrity | Whether alignment appears because crossing hurts | [Bazazi et al., 2008](https://doi.org/10.1016/j.cub.2008.04.035); [Romanczuk et al., 2009](https://doi.org/10.1103/PhysRevLett.102.010602) |

Φ is the Vicsek order parameter: 0 when headings are random, 1 when they agree.

**God view.** Global draws the unwrapped path, so a straight march is a straight line. Periodic cell is the single hex. Scroll zooms, drag pans.

**Trials.** Record, stop, uncheck a bad take, and the mean line is only the ones you kept. A restart does not delete saved trials. It does drop whoever is connected.

## Replay files

The four trajectories are in the repo, so someone else can replay them without the original session log (that log is local and is not published).

| Run | Replay | Video |
|---|---|---|
| First person | | [video](examples/videos/fpv-herd.mp4) · [still](examples/posters/fpv-herd.jpg) |
| Echo chambers, side by side | | [video](examples/videos/echo-side-by-side.mp4) · [order plot](examples/plots/echo-order.png) |
| Patch finding, side by side | | [video](examples/videos/taxis-side-by-side.mp4) · [arrivals plot](examples/plots/patch-arrivals.png) |
| Echo chambers, with a bridge | [`examples/replays/echo-with-bridge.json`](examples/replays/echo-with-bridge.json) | trial `echo chambers 2` |
| Echo chambers, no bridge | [`examples/replays/echo-no-bridge.json`](examples/replays/echo-no-bridge.json) | |
| Patch finding, social | [`examples/replays/taxis-social.json`](examples/replays/taxis-social.json) | last social take |
| Patch finding, solitary | [`examples/replays/taxis-solo.json`](examples/replays/taxis-solo.json) | last solitary take |

Source session, for anyone who still has the local log: `logs/session-2026-11-02T12-58-14-928Z.jsonl`. The later files in `logs/` are idle bot sessions, not these takes.

To draw the comparison videos again from `trials/lecture-trials.json` you need `ffmpeg` and `rsvg-convert`:

```bash
npm run examples
```

## References

- Vicsek, T., Czirók, A., Ben-Jacob, E., Cohen, I. and Shochet, O. Novel type of phase transition in a system of self-driven particles. *Physical Review Letters* 75, 1226 (1995). [doi:10.1103/PhysRevLett.75.1226](https://doi.org/10.1103/PhysRevLett.75.1226)
- Buhl, J., Sumpter, D. J. T., Couzin, I. D., Hale, J. J., Despland, E., Miller, E. R. and Simpson, S. J. From disorder to order in marching locusts. *Science* 312, 1402–1406 (2006). [doi:10.1126/science.1125142](https://doi.org/10.1126/science.1125142)
- Couzin, I. D., Krause, J., Franks, N. R. and Levin, S. A. Effective leadership and decision-making in animal groups on the move. *Nature* 433, 513–516 (2005). [doi:10.1038/nature03236](https://doi.org/10.1038/nature03236)
- Ballerini, M., Cabibbo, N., Candelier, R., Cavagna, A., Cisbani, E., Giardina, I., Lecomte, V., Orlandi, A., Parisi, G., Procaccini, A., Viale, M. and Zdravkovic, V. Interaction ruling animal collective behavior depends on topological rather than metric distance. *PNAS* 105, 1232–1237 (2008). [doi:10.1073/pnas.0711437105](https://doi.org/10.1073/pnas.0711437105)
- Berdahl, A., Torney, C. J., Ioannou, C. C., Faria, J. J. and Couzin, I. D. Emergent sensing of complex environments by mobile animal groups. *Science* 339, 574–576 (2013). [doi:10.1126/science.1225883](https://doi.org/10.1126/science.1225883)
- Ariel, G., Ophir, Y., Levi, S., Ben-Jacob, E. and Ayali, A. Individual pause-and-go motion is instrumental to the formation and maintenance of swarms of marching locust nymphs. *PLOS ONE* 9, e101636 (2014). [doi:10.1371/journal.pone.0101636](https://doi.org/10.1371/journal.pone.0101636)
- Bazazi, S., Buhl, J., Hale, J. J., Anstey, M. L., Sword, G. A., Simpson, S. J. and Couzin, I. D. Collective motion and cannibalism in locust migratory bands. *Current Biology* 18, 735–739 (2008). [doi:10.1016/j.cub.2008.04.035](https://doi.org/10.1016/j.cub.2008.04.035)
- Romanczuk, P., Couzin, I. D. and Schimansky-Geier, L. Collective motion due to individual escape and pursuit response. *Physical Review Letters* 102, 010602 (2009). [doi:10.1103/PhysRevLett.102.010602](https://doi.org/10.1103/PhysRevLett.102.010602)
