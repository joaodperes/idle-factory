# Save protocol

## Current

Browser localStorage key: `factory-idle-v2`. JSON object `version: 2`. The engine validates and whitelists numeric fields, workers, research, meta, and building IDs on import, keeping a compatible version number. Legacy saves on a different origin must be exported manually from the old site and imported here.

Exported JSON saves may be edited by players. This is a single-player game, so tampering is not a security problem *unless* an imported save is allowed to compromise the runtime. Treat JSON as untrusted: no eval, no arbitrary HTML injection, no unknown prototypes, bounded numeric values, and explicit migrations.

At this stage the save migration story is minimal: versions newer than 2 are rejected. Before changing to a graph format, add proper migration tests and keep a tested fixture for v2.

## Target v3 proposal

```json
{
  "schemaVersion": 3,
  "catalogVersion": "2026.11",
  "savedAt": "2026-11-02T00:00:00.000Z",
  "profile": {"talentPoints": 0, "talents": []},
  "run": {"cash": 0, "inventory": {}, "contracts": []},
  "layout": {"nodes": [], "edges": []},
  "prestige": {"investorPoints": 0, "patents": []}
}
```

This is a **design sketch only** and cannot currently be imported as a game save.
