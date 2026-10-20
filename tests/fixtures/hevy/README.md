# Hevy export sample

`sample.csv` is a real Hevy "Export Workout Data" CSV (29 workouts, Jul–Oct 2026, 546 set rows) with the only free-text content (three exercise notes) replaced by dummy text. The complete original is kept privately and must never be committed.

Observed format (see the T5.01 mapping spec for the analysis):

- Header: `title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_kg,reps,distance_km,duration_seconds,rpe`; one row per set; every field double-quoted when text.
- `start_time`/`end_time` look like `Oct 13, 2026, 9:50 PM`: no time zone, no seconds. The importer must take the time zone from the user.
- Weight is always `weight_kg`, regardless of the app's unit setting.
- `set_type` values present: `normal`, `warmup`. Drop/failure, supersets, RPE, distance and lb are not present in this sample.
- Exercise names carry the equipment in brackets (`Bench Press (Barbell)`) or have none (`Landmine Row`). Cardio rows (`Treadmill`) use `duration_seconds` with empty weight and reps.
