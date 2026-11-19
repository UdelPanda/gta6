# gta6

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/UdelPanda/gta6/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/UdelPanda/gta6/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

## Solstice City — an open-world crime story

An original 2D top-down open-world crime game, built for the make.fun bounty
**gta6-01** ("Make GTA 6"). No assets, no network, no Rockstar material:
everything — city, characters, vehicles, story, art, sound and music — is
drawn, written and synthesised by the code in this repo.

## Run it

```sh
node serve.ts            # serves game/ on http://localhost:8080
```

Open http://localhost:8080 in desktop Chrome. Keyboard and mouse, no build
step, no dependencies. `?seed=N` fixes the city; `?shot=cover|chase|mission|foot`
stages a screenshot scene instead of the title screen.

## The game

You are **Rico Vega**, a wheelman who owes the Countess three grand. Dottie Ray
hands you jobs across **Solstice City**, a 4800×4800 coastal city with a beach
and sea on its south edge.

- **On foot and by car** — walk the sidewalks, steal any car (E), drive with
  real-ish physics: acceleration, braking, steering, off-road drag, collisions.
- **Traffic and pedestrians** — 34 cars follow the street grid (and swing
  around parked cars), 16 parked cars to steal, 56 pedestrians who walk the
  sidewalks and flee gunfire and fast cars.
- **Wanted level 0–5 stars** — stealing, hitting pedestrians, shooting and
  killing cops raise the heat. Up to 6 police units chase you in cars, ram
  you, get out on foot to arrest you, and shoot at wanted 3+. Lose them for
  14 seconds and the heat decays a level at a time.
- **Combat** — punch (F), pistol with mouse aim (12-round mag, R reload,
  ammo pickups), skid marks, smoke, tracers.
- **Five missions, one story** — First Fare, Borrowed Wheels, Hot Cargo, The
  Countess, Clean Getaway. Each pays out; finishing all five completes the
  game. Get busted or wasted and you lose a cut of your cash and wake up at
  the precinct or the hospital.
- **HUD and minimap** — cash, wanted stars, health, ammo, objective with
  distance, speedometer, toasts, and a live minimap with roads, the player,
  police and the mission marker.
- **Save** — progress autosaves to localStorage (cash, mission, pistol,
  best cash); the title screen offers Continue.
- **Sound and music** — synthesised WebAudio only: engine hum, sirens,
  gunshots, and a 96 BPM bass-and-chords loop (M mutes).

## Files

- `game/index.html` — the page and canvas.
- `game/src/` — one module per job: `config` (tuning), `random` (seeded RNG),
  `city` (streets, blocks, landmarks, beach), `entities` (traffic, peds,
  pickups), `player` (on foot, driving, combat), `police` (wanted, pursuit,
  arrest), `missions` (story and objectives), `save`, `audio`, `input`,
  `render` (world, HUD, minimap, screens), `shots` (the four staged
  screenshot scenes), `main` (boot and loop).
- `screenshots/` — the four renders of the game above (1280×800).
- `shots.json` — which scene each screenshot shows.
- `main.ts` — the make.fun entrypoint: copies `game/` and `screenshots/` to
  the output directory and writes `dossier.json`.
- `serve.ts` — the tiny static server for local play.
- `vendor/makefun-game.ts` — the kit's dossier builder (untouched).

## Screenshots

1. `1-cover.jpg` — cruising the avenue in traffic.
2. `2-chase.jpg` — three stars, three police cars on the tail.
3. `3-mission.jpg` — Hot Cargo: driving the package up to the Hideout.
4. `4-foot.jpg` — on foot outside the Countess Casino, pistol out, four stars.

## License

MIT — see `LICENSE`.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
