# Roadmap (proposed)

**0.2 — Repository foundation (this starter)**

- [x] Preserve original HTML as a reference
- [x] Separate page, CSS, game catalog JSON, and core math/save modules
- [x] Add GitHub Pages deployment and automated tests
- [x] Add JSON file save export/import and safer loading
- [x] Fix nominal-vs-power-constrained rate display and power-aware offline progression
- [x] Add building sales to prevent slot deadlocks
- [ ] Browser smoke testing on GitHub Pages after first deploy
- [ ] Simulate concurrent tab saves and decide conflict policy

**0.3 — Economic redesign (before editor)**

- [ ] Formalize resource and machine recipe schema
- [ ] Add ore → ingot → component → product supply chains
- [ ] Add budgets, inventory, orders and per-node utilization
- [ ] Write a fixed-step engine with resource conservation tests
- [ ] Add guided onboarding and an in-game field manual

**0.4 — Graph editor**

- [ ] Transition UI to Vite/React/TypeScript and React Flow
- [ ] Drag/drop machine nodes and create validated input/output connections
- [ ] Store graph as ID-based node/edge JSON
- [ ] Add edge capacity, power network, buffers and bottleneck overlays
- [ ] Add undo/redo, grid snap, selection, zoom, inspector and a few ready-made templates
- [ ] Benchmark 100/500/1000-node scenarios

**0.5 — Management identity**

- [ ] 3 talent specializations, each with game-changing unlocks and tradeoffs
- [ ] Workers assigned to teams/machines rather than global bonus-only effect
- [ ] Contracts, product quality, demand and customer relationships
- [ ] Management events and policies with consequences, not just +/- modifiers

**0.6 — Prestige and longevity**

- [ ] Investor-equity valuation model and reset preview
- [ ] Persistent patents and collectible industrial milestones
- [ ] Meaningful new run objectives and branching business strategy
- [ ] Save migration to IndexedDB + exports/imports and explicit backups
- [ ] Balance and progression telemetry (local-only, no personal analytics)

**Later**

- [ ] Challenge modes, achievements, seasonal objectives (without requiring a backend)
- [ ] Localization, keyboard accessibility, reduced-motion options, mobile UI
- [ ] Optional PWA/offline caching, subject to a safe service-worker update strategy
