# Data model

Types live in `src/types.ts` (logical model from PRD §15).

## Conventions

- IDs: stable strings (never names as foreign keys).
- Timestamps: ISO 8601.
- Weight unit: **kg internally**; display unit is a setting.
- Raw sets are stored; aggregates are computed.
- Sessions snapshot `exerciseNameSnapshot` and `routineSnapshot`; editing routines/exercises never rewrites history.
- Unknown fields are preserved on import/export upgrades where safe.

## Metrics definitions

- Set volume = `weight × reps`, completed non-warm-up sets only.
- Exercise volume = sum of set volumes. Bodyweight/duration exercises are kept separate.
- Unilateral exercises: reps are per side, not doubled (document any change).
- Estimated 1RM: Epley `w × (1 + reps/30)`, valid for 1–12 reps; `undefined` outside that range.
- Rest timer remaining = `max(0, ceil((endsAt − now)/1000))`.
