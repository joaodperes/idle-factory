# Idle Factory v1.0

**Idle Factory** is a browser-only industrial strategy game. Design production chains on a node diagram, route goods, connect local power grids, fulfill commercial contracts, earn management talents and rebuild with angel investors.

**Play:** [joaodperes.github.io/idle-factory/](https://joaodperes.github.io/idle-factory/) (after GitHub Pages is enabled for the repository).

## Gameplay

1. Your starter network produces ore → metal and automatically sells metal at its trade terminal. Revenue is your building currency.
2. Click `+` to add facilities. Click an **output port** then a matching **input port** to connect them. Gold ports form the power grid; teal ports transport goods. Drag headers to arrange the diagram and click links to delete them.
3. Each edge moves a finite quantity per second. Machines need both raw materials and power from their connected grid. Inspect local buffers to diagnose bottlenecks.
4. Deliver contracts using goods at market terminals, or sell goods for continuously fluctuating market prices. Toggle metal auto-sale **off** to accumulate metal for your first contract.
5. Earn XP and invest in Industrial Engineer, Automation Architect or Commercial Strategist talent paths. Only the selected path's passive bonuses are active; talent allocations persist.
6. Research new process improvements with data produced by device-fed laboratories. Sell and rebuild your company to earn angel investors, buy permanent upgrades and reuse a saved factory blueprint.

## Run & test

No third-party dependencies or build tooling are needed. This is a native ES-module app with an SVG/DOM editor.

```bash
python3 -m http.server 8000
# visit http://localhost:8000
npm test
npm run check
```

Do not run the game with `file://`; JSON catalogs are fetched over HTTP. Node.js 20+ is recommended for tests.

## GitHub Pages

Go to **Settings → Pages → Build and deployment → Source: GitHub Actions**. The included `.github/workflows/deploy.yml` validates and publishes the root folder after every push to `main`. No secrets, server, or database are required.

## Save and privacy

- The browser saves automatically in `localStorage` under `idle-factory-save-v3` every 10 seconds, on page hide, and after player actions.
- **Settings → Download JSON** exports a portable save. **Import JSON** loads a validated save; make a backup first. Import accepts v2 starter saves as a one-time migration. The original `factory-idle-v2` localStorage entry is not deleted.
- When loading, the game simulates up to **8 hours** of offline progress at 50% speed (or 100% with Autonomous Operations research). Power, stock and logistics limits remain enforced.
- Clearing browser site data or changing device/hostname will not transfer saves. No user information is sent to a server.

## Files

```text
index.html                    Game UI
src/main.js                   Rendering, input events, storage wiring
src/styles.css                Responsive industrial-theme interface
src/core/engine.js            Headless factory simulation and economics
src/core/graph.js             Construction, connections and capacity
src/core/actions.js           Upgrades, talents, research, resets, layouts
src/core/state.js             Save validation and migration
src/core/catalog.js           Static JSON data loading
src/core/format.js            Number/time formatting
data/catalog/*.json           Facilities, resources, research, talents, contracts, investments
.github/workflows/            Automated Node tests and Pages deployment
tests/                        Deterministic gameplay and save tests
```

## Design constraints

This is intentionally a **compact, self-contained 1.0**, not a heavyweight spatial logistics simulator. Power shares supply inside each connected power network. Material links have bounded throughput; each facility has bounded inventories. Contracts and prices encourage different products and layouts. Power and material links can be disconnected or rearranged at any time. Blueprints are planning templates, not free machines: applying one recycles the previous layout and purchases the target layout using available credits.

## License

MIT — see [LICENSE](LICENSE).
