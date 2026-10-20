# Program import schema (v1)

This is the single authoritative spec for the program import format, a public contract between the app and external AI assistants. Code: `src/lib/imports/programSchema.ts` (Zod schema) and `src/lib/imports/parseProgram.ts` (parser, warnings). Tests: `tests/import.test.ts`; fixtures: `tests/fixtures/`. The format is independent of the internal domain types and the IndexedDB schema; mapping import → domain entities happens later, in the importer.

## Rules

- `schemaVersion` must be `1`; other versions are rejected with a clear message.
- Raw JSON only. Fenced-block / prose extraction is an explicit P1 step.
- Max input size is 1,000,000 **bytes** (UTF-8), not characters. Every string field has a length limit. Imports are never executed or rendered as HTML.
- **Errors** block saving. **Warnings** never do (see below).
- Unknown fields do not fail the import. They are dropped and reported as warnings with their path.
- Routine `id`s are local to the file, used only for `schedule` references and uniqueness. The app assigns fresh ids when saving, so importing never collides with existing data.
- Exercises are referenced as `{ "id" }` (catalog id) or `{ "name" }` (free text). Resolution in the app: canonical id → alias → normalized name → optional fuzzy match (suggest only) → manual. Unresolved names are settled in the import preview (match, create custom exercise, or drop); ids are never fabricated.
- Units: weights in **kg** (convert from lb before generating), durations in seconds, distances in meters.
- Nothing becomes active without user confirmation.

## Shape

`?` marks optional fields. Anything not marked is required.

```jsonc
{
  "schemaVersion": 1,
  "program": {
    "name": "string (1-100)",
    "description": "string? (<=2000)",
    "goal": "string? (<=100)",
    "experienceLevel": "string? (<=50)",
    "daysPerWeek": 4,                      // int 1-7, optional
    "schedule": {                          // optional
      "type": "weekly",
      "days": [{ "day": "monday", "routine": "routine_id" }]   // 1-14 entries; lowercase English weekdays
    },
    "routines": [{                         // 1-30
      "id": "routine_id",                  // 1-60, unique within the file
      "name": "string (1-100)",
      "exercises": [{                      // 1-40, in performed order
        "exercise": { "id": "catalog_id" },
        // or an unresolved / custom exercise:
        // "exercise": { "name": "Landmine press", "equipment": "landmine"?, "exerciseType": "weighted_reps"? },

        "supersetGroup": "A",              // string? (1-30)
        "restSeconds": 150,                // int 0-3600, optional
        "notes": "string? (<=1000)",

        // EITHER the shorthand ...
        "sets": 3,                         // int 1-50
        "setType": "normal",               // optional
        "repRange": [6, 10],               // optional, [min, max], ints 1-1000, min <= max
        "targetWeight": 80,                // kg, optional, 0-1000
        "targetDurationSeconds": 45,       // optional, int 1-86400
        "targetDistanceMeters": 30,        // optional, number > 0, <= 1,000,000
        "rpe": 8,                          // optional, 1-10
        "rir": 2,                          // optional, 0-10

        // ... OR an explicit list (1-50 entries), each with the same optional fields as above
        "setList": [{ "setType": "warmup", "repRange": [8, 8], "targetWeight": 40 }]
      }]
    }],
    "source": {                            // optional
      "name": "string? (<=200)",
      "url": "string? (http/https only, <=2000)",
      "attribution": "string? (<=500)"
    }
  }
}
```

### Exercise reference

`exercise` is an object with at least one of `id` or `name`.

| Field | Meaning |
| --- | --- |
| `id` | Catalog id (1-100 chars). Use only ids from the catalog list you were given. |
| `name` | Free-text exercise name (1-120). Used when no catalog id applies. |
| `equipment` | Optional free text (<=60) hint for custom exercises, e.g. `"landmine"`. |
| `exerciseType` | Optional: `weighted_reps`, `bodyweight_reps`, `duration`, `distance`. Hint for custom exercises. |

If both `id` and `name` are given, `id` wins; `name` is kept as the display fallback. A reference with no `id` is *unresolved* and must be settled in the preview. It is valid, not an error.

### Sets: `sets` or `setList`, exactly one

- **Shorthand**: `sets: N` creates N identical sets from the exercise-level `setType`, `repRange`, `targetWeight`, `targetDurationSeconds`, `targetDistanceMeters`, `rpe`, `rir`.
- **Explicit**: `setList` is an ordered list of sets (e.g. warm-ups then working sets). Each entry may have `setType`, `repRange`, `targetWeight`, `targetDurationSeconds`, `targetDistanceMeters`, `rpe`, `rir`. When `setList` is used, the exercise-level versions of those fields are an error (ambiguous), so put them on each entry.
- `setType` is `normal` (default), `warmup`, `drop` or `failure`.
- Use `repRange` for rep-based work, `targetDurationSeconds` for holds/time, `targetDistanceMeters` for carries/cardio. Fields that do not fit the exercise are accepted; the preview shows what was imported.

### Supersets

Give consecutive exercises in a routine the same `supersetGroup` value (e.g. `"A"`) to form a superset or circuit. Group names are local to the routine. Members must be adjacent; otherwise a warning is shown.

## Errors (block saving)

- Malformed JSON; input over 1,000,000 bytes; `schemaVersion` missing or not `1`.
- Missing required fields; wrong types; strings over their limits.
- `exercise` with neither `id` nor `name`; `exerciseType` not in the list; a bare string instead of an object.
- `sets` missing together with `setList`, or both present; shorthand prescription fields beside `setList`; empty `setList`.
- Set counts that are zero, negative, fractional or over 50; `repRange` with min > max; negative weights/rest; `rpe` or `rir` out of range; unknown `setType` or weekday.
- Duplicate routine ids; `schedule` entry referencing an unknown routine.
- `source.url` that is not `http:`/`https:` (e.g. `javascript:`, `data:`).

## Warnings (never block saving)

1. **Unsupported field**: any unknown key at any level, e.g. `program.routines[0].exercises[1].tempo: unsupported field, ignored`. The key is dropped. Also reported when the file has errors.
2. **daysPerWeek mismatch**: `daysPerWeek` differs from the number of distinct scheduled weekdays.
3. **Weekday scheduled twice**: the same weekday appears more than once in `schedule.days`.
4. **High volume**: more than 30 working (non-warm-up) sets in one routine.
5. **Superset members not adjacent**: a `supersetGroup` value reappears after another group or ungrouped exercise.

At most 50 messages of each kind are returned; the rest is summarized as `…and N more`. The importer validates structure, not training quality; a warning-free file is not a claim that the program is safe or optimal.

## Complete example

```json
{
  "schemaVersion": 1,
  "program": {
    "name": "Upper / Lower Hypertrophy",
    "description": "Four-day strength-training program",
    "goal": "muscle_gain",
    "experienceLevel": "intermediate",
    "daysPerWeek": 4,
    "schedule": {
      "type": "weekly",
      "days": [
        { "day": "monday", "routine": "upper_a" },
        { "day": "tuesday", "routine": "lower_a" },
        { "day": "thursday", "routine": "upper_b" },
        { "day": "friday", "routine": "lower_b" }
      ]
    },
    "routines": [
      {
        "id": "upper_a",
        "name": "Upper A",
        "exercises": [
          {
            "exercise": { "id": "barbell_bench_press" },
            "setList": [
              { "setType": "warmup", "repRange": [8, 8], "targetWeight": 40 },
              { "setType": "warmup", "repRange": [3, 3], "targetWeight": 60 },
              { "repRange": [6, 10], "targetWeight": 80, "rpe": 8 },
              { "repRange": [6, 10], "targetWeight": 80, "rpe": 8 },
              { "setType": "drop", "repRange": [10, 15], "targetWeight": 60 }
            ],
            "restSeconds": 150,
            "notes": "Use controlled repetitions"
          },
          {
            "exercise": { "id": "lat_pulldown" },
            "supersetGroup": "A",
            "sets": 3,
            "repRange": [8, 12],
            "rir": 2,
            "restSeconds": 90
          },
          {
            "exercise": { "name": "Landmine press", "equipment": "landmine", "exerciseType": "weighted_reps" },
            "supersetGroup": "A",
            "sets": 3,
            "repRange": [8, 12],
            "targetWeight": 20,
            "restSeconds": 90
          }
        ]
      },
      {
        "id": "lower_a",
        "name": "Lower A",
        "exercises": [
          { "exercise": { "id": "back_squat" }, "sets": 3, "repRange": [5, 8], "restSeconds": 180 },
          { "exercise": { "name": "Plank", "exerciseType": "duration" }, "sets": 3, "targetDurationSeconds": 45 },
          { "exercise": { "name": "Farmer's carry", "exerciseType": "distance" }, "sets": 2, "targetDistanceMeters": 30, "targetWeight": 24 }
        ]
      },
      {
        "id": "upper_b",
        "name": "Upper B",
        "exercises": [
          { "exercise": { "id": "overhead_press" }, "sets": 3, "repRange": [6, 10], "restSeconds": 120 }
        ]
      },
      {
        "id": "lower_b",
        "name": "Lower B",
        "exercises": [
          { "exercise": { "id": "romanian_deadlift" }, "sets": 3, "repRange": [6, 10], "restSeconds": 150 }
        ]
      }
    ],
    "source": {
      "name": "Example plan",
      "url": "https://example.com/plans/upper-lower",
      "attribution": "Generated by an AI assistant"
    }
  }
}
```

This example illustrates the format and is not a medically validated training prescription.

## Prompt snippet for AI assistants

The app's "Generate a plan with AI" helper should include text like this, plus the user's constraints and the allowed catalog ids/names:

```text
Create a training program as a single JSON object and return ONLY the JSON: no prose, no markdown fences.

Rules:
- Use exactly the schema below ("schemaVersion": 1). Use only the fields listed; do not add others.
- Reference every exercise as an object. If it is in the catalog list, use { "id": "<catalog id>" } with the id copied exactly. If it is not in the list, use { "name": "<exercise name>" } (optionally "equipment" and "exerciseType"). Never invent or guess ids.
- Weights are in kilograms (convert from pounds). Durations are in seconds, distances in meters.
- For each exercise provide EITHER "sets" (with optional repRange, targetWeight, rpe, rir, ...) OR "setList" (an explicit list of sets, e.g. warm-ups then working sets), never both.
- Weekday names are lowercase English. Routine ids are short unique snake_case strings; "schedule" must reference them.
- Exercises in a superset share the same "supersetGroup" value and are listed next to each other.
- Omit optional fields you do not need.

Schema:
<paste the Shape section here>

Allowed catalog exercises (id: name):
<list>
```
