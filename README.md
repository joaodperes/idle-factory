# Idle Factory

An offline-first factory planning game. Connect real production machines, balance local power networks, sell finished goods, research improvements, and grow your industrial company across investor resets. All game data comes from versioned JSON catalogs; there is no backend.

## Branches and release process

- **`main`** is the production release. Only pushes to `main` run the GitHub Pages deployment workflow (`.github/workflows/deploy.yml`).
- **`dev`** is the integration and playtesting branch. Pushing to `dev` runs validation tests, **not a GitHub Pages deployment** (`.github/workflows/test.yml`).
- Feature branches can branch off `dev`; merge them back into `dev`, test, and open a pull request from `dev` to `main` only when ready to release.
- You can preview `dev` locally without publishing or affecting the production game. Browser saves at `localhost` are separate from saves at `joaodperes.github.io` because they're different origins.

## Test a development build locally

Requires Node.js 20+ and Git.

```sh
git clone https://github.com/joaodperes/idle-factory.git
cd idle-factory
git switch dev
npm run dev
```

Open **http://127.0.0.1:4173/** in your browser. No `npm install` or paid dependencies are needed. The local server serves the same ES modules, styles, and JSON catalogs as GitHub Pages, with caching disabled. You can choose another port with `npm run dev -- --port 4180`.

Run the automated checks before merging:

```sh
npm test
npm run check
```

The source files can be edited while the server runs; reload the browser to pick up edits. For a completely clean first-run test, use a private window on the local preview or delete only the local preview's site data. **Do not erase production browser data**; export a JSON save first if you intend to reset your hosted game.

## New-player experience (development branch)

A fresh save begins with just a Power Station, an Ore Extractor and sufficient starting credits to complete an eight-step guided factory setup. The walkthrough waits for each actual gameplay action: power the extractor, buy a smelter, send ore, power the smelter, buy a trade terminal, connect metal and observe a first sale. Tutorial controls highlight exactly the next port or build button, with a focus button to navigate the canvas. Other tabs and advanced panels appear on completion (or if the player skips).

Already have a factory? Click **? → Start guided walkthrough** to practice in a temporary factory; the original saved factory is restored when you exit. In-progress and imported v3 saves remain compatible. A company prestige reset starts with a working basic line rather than forcing tutorial replay.

The diagram uses live DOM measurements of input and output port centers, including zoom-aware obstacle routing. No consumer machine exposes a power output. Endpoints remain aligned when a node is dragged, resized, or scrolled.

## Reading the resource HUD

- **Credits** are the current spendable balance. Building and upgrading facilities consume them.
- **Run Revenue** is everything this company has earned, even after spending credits. Revenue unlocks facilities and additional per-type limits and contributes to prestige rewards. The HUD shows the next milestone.
- **Factory Level** is driven by persistent Factory XP from sales (base 12% of earnings) and contracts. It expands industrial slots and awards talent points; it is not another currency.
- **Research Data** is produced only by suitably powered and supplied Research Labs and spent on technologies.
- **Power** shows current demand / total generation with a single spare-capacity figure and a usage bar. Disconnected grids can be short of power despite global surplus; these shortages take priority over the spare figure.
- **Capacity** is global industrial slots used / available. **Angels** are persistent prestige-investment points.

Each metric has an explanation on hover/focus; after the tutorial, most metrics also navigate to their relevant game tab.

## Game mechanics

- **Factory:** graph of machines with typed material and power ports, throughput limits, input and output buffers and isolated electrical networks. Power indicators show **available / generated** power, with separate warnings for disconnected grids.
- **Direct power:** Only Power Stations and Solar Arrays have electricity output ports. Connect each consuming machine directly to a generator. Old machine-to-machine power relays are migrated into direct generator links when saves load.
- **Production diagnostics:** machine cards display *measured / ideal* production per second and the named output stock. Inspect a machine to see required inputs, even when empty, and the benefit of its next upgrade.
- **Factory Level:** Company sales and contracts earn persistent Factory XP. Global industrial capacity starts at 26 slots and grows by +2 slots every three Factory Levels. Permanent **Industrial Estate** investments also grant +3 slots per rank, and select talents add more.
- **Facility limits:** per-type caps begin at 1–3 machines. Each run-revenue milestone at 5k, 20k, 80k, or 300k adds one permitted machine of each type; every two Industrial Estate ranks add one more. Previously saved machines are never deleted for exceeding revised limits.
- **Upgrade economy:** level-ups add 50% of base production per level and 25% storage per item; generators add 50% of base power per level. Initial upgrade cost is 55% of a new facility's base cost and rises per level. Duplicates cost +28% multiplicatively beginning with the second copy.
- **Research Lab:** unlocks at 4,000 company-run revenue and costs 3,500 credits. Connect Devices (0.1/s) and power (3 units) to create research data.
- **Diagram routing:** lines are routed outside factory cards using orthogonal paths with rounded corners and update when dragging or zooming. If another card physically blocks a port, a warning marker replaces an impossible route until the cards are separated.
- **Contracts and market:** sell or reserve goods, fulfill orders, earn credits, and react to changing prices.
- **Factory progression & talents:** earn Factory XP from sales and contracts. Factory Levels increase industrial capacity and unlock talent points at Level 5. Combine nodes across three connected talent trees, meeting per-tier level/spend prerequisites; certain doctrines are mutually exclusive and can be respeced.
- **Production health:** Node cards show actual / ideal production, while the factory overview lists underperformers. The facility inspector reports measured input deliveries, shortages, power fraction and blocked output. Click a machine in the overview to locate it on the canvas.
- **Contracts:** Local Construction requires 25 Refined Metal stored at a Trade Terminal. Turn metal Auto Sell off before delivering the order; contracts earn credits and Factory XP.
- **Research and investors:** unlock research through a working laboratory; reset the company for lasting angel-investor upgrades and reusable paid factory blueprints.
- **Saves:** browser localStorage under `idle-factory-save-v3`, plus portable, versioned JSON exports and imports. No account or cross-device sync.

## Project layout

```text
index.html                     Browser UI
src/main.js                    Game rendering, input and onboarding UI
src/styles.css                 App styling
src/core/tutorial.js           Testable guided progression
src/core/engine.js             Deterministic economy and production
src/core/graph.js              Facility and connection operations
src/core/actions.js            Investments, prestige, research, layouts
src/core/state.js              Versioned saves and starter factories
src/core/catalog.js            JSON catalog loader
data/catalog/*.json            Game definitions and balance
scripts/dev-server.mjs         Dependency-free local HTTP preview
tests/                         Automated simulation / tutorial tests
.github/workflows/             Separate dev validation and main deployment
```

## Hosted production

[Play the production version](https://joaodperes.github.io/idle-factory/) · [Source repository](https://github.com/joaodperes/idle-factory)

GitHub Pages uses **Settings → Pages → Build and deployment → Source: GitHub Actions**, and deploys the `main` branch only. The `dev` branch is deliberately **not deployed**.

## License

MIT — see [LICENSE](LICENSE).
