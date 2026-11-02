# Architecture

## Current deployed starter (no build tooling)

A static HTML shell, CSS stylesheet, ES module (`src/main.js`), and separate JSON catalog files. `src/core/economy.js` contains calculation functions that can be unit-tested in Node. `src/core/save.js` owns the current save schema and validation. GitHub Pages simply serves the files as-is.

This design intentionally **preserves the uploaded prototype** during initial repo setup. `src/main.js` is still large and couples event handlers, DOM rendering, and game actions; modularizing it is a follow-up task, not a solved problem.

## Target architecture for the diagram milestone

```text
UI / React + React Flow  (render nodes, inspector, flows, interactions)
             |
Application controller (commands, undo/redo, selector/subscription)
             |
Deterministic domain engine (time step, resource conservation, constraints)
             |
Catalog data + save state (versioned and schema validated)
             |
IndexedDB repository + portable JSON import/export
```

Vite + React + TypeScript is recommended when implementing the real graph editor. [`@xyflow/react`](https://reactflow.dev/) is MIT-licensed and provides node positioning/links, pan/zoom, and selection; it does *not* decide production mechanics for us. The actual graph simulation must remain UI-agnostic. Rete.js is an alternative if the editor should eventually become a full visual programming environment. Evaluate advanced plugin licenses independently.

### Proposed future layout

```text
src/
  app/              routing and state orchestration
  engine/           deterministic tick, graph, resources, constraints, economics
  components/       reusable UI controls
  features/
    factory-graph/  React Flow canvas, node/edge rendering, inspector
    research/       research UI and progression
    workforce/      staff, talents, training
    prestige/       reset and metagame
    saves/          import/export and recovery
  data/             JSON definitions validated by schema
  persistence/      IndexedDB, migrations, local backups
  types/            TypeScript domain types
```

### Simulation invariants

- Inputs consumed ≤ stock actually available upstream.
- Edges never exceed capacity/sec.
- Outputs appear only when a recipe runs and consumes its inputs (or in explicitly defined generators).
- Identical state, choices, catalog version, and simulated elapsed time yield identical results.
- Save timestamps advance once for each accounted interval; importing is atomic.
- Offline progression applies resource and power constraints, and respects a documented cap.
- Balance tests measure time to milestones and timing of prestige opportunities.

### GitHub Pages caveats

GitHub Pages is static hosting. It provides no authenticated cross-device save sync, shared database, or anti-cheat authority. `localStorage` is browser-managed site data, *not* the HTTP cache; browser cache or Service Worker cache should not be treated as permanent save storage. JSON export is essential. IndexedDB is preferable for larger graphs and backups; support schema migrations as catalogs evolve.

With a future Vite build, configure `base: '/REPO-NAME/'` for repository sites or use a custom-domain root path. Keep asset references relative to the configured base.
