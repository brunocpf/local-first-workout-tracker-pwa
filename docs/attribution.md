# Exercise data attribution

The MVP ships a **self-written seed catalog** (~100 exercises in `src/lib/catalog/seed.ts`: names, aliases, muscle/equipment tags, instructions and form cues written for this project, no third-party media or text), so nothing needs attribution yet. Exercise names are generic descriptions of movements, not copied from any dataset.

Evaluation of [wger](https://wger.de/) ([docs](https://wger.readthedocs.io/en/latest/), [repo](https://github.com/wger-project/wger)) as a larger catalog was evaluated in [ADR 0009](decisions/0009-wger-catalog.md): wger text and media are **not** bundled; at most an optional text-only, CC-BY-SA "Extended catalog" pack may follow on demand, never images or video. Before bundling anything third-party: verify the API/schema, check the license per data type (text, images, video differ), record attribution + license in each exercise's `source`, and provide fallbacks for missing media.

Exercise demonstration media (free-exercise-db, wger, ExerciseDB, MuscleWiki, YouTube) was evaluated in [ADR 0015](decisions/0015-exercise-media.md): none is bundled, embedded or downloaded; any in-app diagrams would be drawn for this project.

_No third-party data is bundled._

## Icons

The icon set in `src/lib/icons.ts` uses geometry from [Lucide](https://lucide.dev) (ISC licence; portions derived from Feather, MIT). Copyright (c) for Lucide Contributors and Cole Bemis 2013-2022. Icons are inlined as path data; no icon font, sprite or remote file is shipped.

> Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.

See [licenses.md](licenses.md) for the full dependency audit; the bundled library notices ship as `/THIRD_PARTY_NOTICES.txt`.
