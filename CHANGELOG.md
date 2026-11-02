# Changelog

## 0.2.0 — Repository starter (2026-11-02)

- Kept the original monolithic prototype in `legacy/`.
- Moved four gameplay catalogs to standalone JSON files.
- Split formatting, economic calculations, and validated save schema into modules.
- Added GitHub Pages deployment and checks, five unit tests, and technical/gameplay design documents.
- Added JSON file backups and imports, building sales with a 50% refund, and a responsive action row.
- Fixed rate display to consider current power availability; offline progress now reflects power limits; active large gaps are accounted up to the 8-hour cap instead of silently discarding all but 10 seconds.

### Still outstanding

- Browser QA in a deployed GitHub Pages build; local Chromium smoke testing was unavailable in the creation environment.
- Full graph editor, production recipes, talents, contracts, and revamped prestige have **not** been implemented.
- Simulation still uses the legacy single-tick economy, not a fixed-step deterministic graph simulation.
- Multi-tab save conflict prevention and larger-save IndexedDB persistence remain to be implemented.
