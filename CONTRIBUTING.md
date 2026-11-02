# Contributing

For any mechanics change, add or revise a test for the economic implication and update `docs/GAME_DESIGN.md` or `docs/ROADMAP.md` as appropriate. Keep new catalogs in JSON and avoid adding game definitions directly to HTML/JS. Maintain browser save compatibility or add explicit migrations before changing the save schema. Do not directly mutate user saves during import before validating them. Run `npm test` and `npm run check` before opening a pull request.
