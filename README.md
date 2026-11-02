# Factory Idle

A browser-based incremental factory-management prototype, being expanded into a diagram-driven industrial strategy game. Designed to run **entirely on GitHub Pages** with no server, accounts, or backend database.

> **Status: 0.2.0 starter.** Gameplay still reflects the original 0.1/v2 HTML prototype: buildings generate parts/data, power limits production, research has three branches, workers gain XP, and prestige earns Blueprints. The planned factory graph, material recipes, talents, and contracts are **not implemented yet**. Don't confuse the design documents with shipped features.

## Run locally

Open a terminal in the repository root and serve the directory over HTTP:

```sh
python -m http.server 8000
```

Open `http://localhost:8000` in your browser. Do not double-click `index.html` using `file://`: ES modules fetch JSON catalogs and need an HTTP origin. There is **no npm install step** for this version.

## Test

Node.js 20+:

```sh
npm test
npm run check
```

## Deploy to GitHub Pages

1. Create a new GitHub repository (for example, `factory-idle`).
2. Commit the **contents** of this folder to the `main` branch, including `.github/`.
3. Repository **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. Push to `main`, then check the deployment Action. The URL will be `https://YOUR-USERNAME.github.io/REPO-NAME/`.

No manual `base` configuration is required for this static version because all links and catalog URLs are relative. If switching to Vite later, configure its `base` for the repo path.

## What changed from legacy HTML

- Preserved a copy of the original in `legacy/factory-idle-v2.html`.
- Split HTML, CSS, game code, economic calculations, save schema, and JSON catalogs.
- Added file-based `.json` export/import in addition to the old text area and browser auto-saving.
- Normalized imported save data against whitelisted field names and numeric limits.
- Added a **Sell** action (50% of last paid cost, to recover occupied slots).
- Made the displayed parts/data rate account for available power, including near-term stored power.
- Made offline progress account for insufficient power and removed the old 10-second active tick truncation, subject to an 8-hour cap.
- Added test automation and GitHub Pages workflow.

## Saves and compatibility

The game saves automatically to browser **localStorage** under the key `factory-idle-v2` (compatible with the old key on the same origin). The save is browser- and origin-specific, can be erased by clearing site data, and will not automatically transfer between devices or different hostnames.

Use **Settings → Download JSON Save** and **Import JSON File** for portable backups. The save object is distinct from the static JSON catalogs. Import rejects unknown future versions. Keep a backup before importing saves from an older development build.

For larger future graph saves, migrate to IndexedDB while retaining JSON export/import and a versioned migration layer.

## Structure

```text
index.html                  UI shell
src/styles.css              visual presentation
src/main.js                 original UI, events, and actions (next to modularize)
src/core/catalog.js         load immutable game definitions
src/core/economy.js         testable power/production/prestige calculations
src/core/save.js            v2 save schema and input sanitization
data/catalog/               buildings, research, workers, prestige JSON
legacy/                     preserved original uploaded prototype
src/core/format.js          numbers and duration formatting
docs/                       design plan, technical direction, milestones
.github/workflows/          deployment and tests
tests/                      Node built-in test suite
```

## Next focus

Implement recipes and a **headless, deterministic factory graph simulation** before integrating an interactive editor. The diagram must drive production and bottlenecks, not merely depict a decorative layout. See `docs/GAME_DESIGN.md`, `docs/ARCHITECTURE.md`, and `docs/ROADMAP.md`.

## License

Currently MIT licensed as an open-source starter. **Review the license before publishing the repository** if you prefer source-available or more restrictive terms.
