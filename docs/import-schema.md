# Program import schema (v1)

Public contract for AI-generated programs. Implemented in `src/imports/programSchema.ts`; fixture at `tests/fixtures/program-valid.json`.

## Rules

- `schemaVersion` must be `1`; other versions are rejected with a clear message.
- Raw JSON only. Fenced-block / prose extraction is an explicit P1 step.
- Max input size 1 MB. Imports are never executed or rendered as HTML.
- Errors block saving; warnings (e.g. unusual volume) do not.
- Exercise resolution (in app): canonical id → alias → normalized name → optional fuzzy (suggest only) → manual. Unresolved names are resolved in preview, never fabricated.
- Nothing becomes active without user confirmation.

## Shape

```json
{
  "schemaVersion": 1,
  "program": {
    "name": "string",
    "description": "string?", "goal": "string?", "experienceLevel": "string?", "daysPerWeek": 1,
    "schedule": { "type": "weekly", "days": [{ "day": "monday", "routine": "routine_id" }] },
    "routines": [{
      "id": "routine_id", "name": "string",
      "exercises": [{
        "exercise": "catalog_id_or_name", "sets": 3, "repRange": [6, 10],
        "targetWeight": 0, "restSeconds": 150, "setType": "normal", "rpe": 8, "rir": 2, "notes": "string?"
      }]
    }],
    "source": { "name": "?", "url": "?", "attribution": "?" }
  }
}
```

Optional: everything marked `?` plus `repRange`, `targetWeight`, `restSeconds`, `setType`, `rpe`, `rir`, `schedule`.
