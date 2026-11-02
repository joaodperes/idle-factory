# Game design direction (proposed — not yet implemented)

## Vision

**An industrial idle/management game where designing efficient production networks matters more than buying the largest generator.** Early game is intuitive; complexity emerges gradually through interconnected resources, research, contracts, workforce traits, network topology, and strategic resets.

## Primary loop

1. Inspect supply, production bottlenecks, energy, inventory, and product demand.
2. Build and connect factories through a workflow/ERD-like diagram.
3. Configure recipes and allocate staff, technical infrastructure, and budgets.
4. Fulfill orders, earn revenue/reputation, fund expansion and R&D.
5. Select mutually constraining research directions and player talents.
6. When growth stalls, sell the company/restructure to unlock permanent advantages; choose a new strategy next run.

## Graph rules

**Nodes:** extractors, refineries, assemblers, labs, warehouses, substations, distributors, waste-processing, shipping/markets. Nodes have ID, level, coordinates, recipe, inputs, outputs, buffers, power draw, maintenance, assigned workers, and throughput.

**Edges:** material transport (item typed, capacity/sec, optional latency) and separate energy-grid connections. Connections must validate port types and direction. Cycles can be legal only when supported by buffered inventory and well-defined simulation steps.

**Simulation:** deterministic fixed time steps and a resource ledger; upstream supply and edge capacity constrain downstream production. No resource should appear without an upstream source, paid input, or explicit recipe output. Bottleneck utilization should be visible on each node/edge.

**First playable example:** Extractor (6 ore/sec) → two Smelters (3 ore/sec each, yielding 1 ingot/sec each) → Assembler (2 ingots/sec → 1 widget/sec). A single smelter halves widget throughput. Expanding the ore source without adding a second smelter yields no improvement. Power and connection limits add secondary constraints.

**Planning controls:** grid/snap, drag nodes, pan/zoom, multi-select, undo/redo, templates/blueprints, optional orthogonal connectors, mini-map, throughput overlay, invalid-link warnings, bottleneck highlights, and a projected versus actual output comparison.

## Strategic identity

Three broad operator archetypes, each viable rather than flat percentage bonuses:

- **Industrial Engineer:** machine reliability, higher product quality, rework/scrap reduction, maintenance scheduling, compact factory layouts.
- **Automation Architect:** predictive buffers, smart routing, dynamic recipe priorities, higher edge throughput, lower idle power.
- **Commercial Strategist:** order pricing, contract risk, financing, inventory hedging, customer loyalty, premium product lines.

Talents should change actual actions or constraints. E.g. "Adaptive Routing" lets a splitter switch priority automatically based on downstream buffers, whereas "Lean Manufacturing" reduces work-in-progress inventory but increases vulnerability to shocks. Talent points come from meaningful production/contract achievements; soft resets should not force players to reselect every routine preference.

## Management decisions

- Fixed-rate predictable contracts versus volatile spot sales.
- Maximum short-term output versus equipment wear and maintenance cost.
- Skilled expensive staff versus cheap scalable automation.
- Specialized profitable production lines versus flexible lines that can switch products.
- Pollution/energy costs versus customer reputation or regulatory requirements (optional later-phase dimension).

## Reset loops

Retain the existing Blueprint mechanic for compatibility. Over time, separate:

- **Run progression:** buildings, inventories, workers, technology, current contracts, cash.
- **Persistent progression:** investor/equity points, patents, unlocked industries, saved layout templates, career achievements, cosmetic trophies.

A soft reset should present *why* selling now is worthwhile: current company value, investor points earned, value to next reward, retained patents, and an estimated strategic advantage next run. Rewards should favor value creation/fulfilled contracts, not meaningless spam of one resource. Prevent repeated reset farming with clear progression thresholds.

## UX principle

There should always be a clear answer to "What is limiting my output?" Nodes and edges show available supply, capacity, utilization, idle reasons, and recoverable solutions. This is where factory-diagram polish directly supports gameplay depth.
