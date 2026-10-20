# Agent instructions

Read docs/PRD.md first (sections 24–25 are the working rules). Summary:

- Work in small vertical slices: start routine → log set → persist → reload → recover → finish → history.
- Keep business logic (progress, matching, import validation, persistence) out of React; test it.
- No backend, accounts, paid APIs, or sync without a concrete requirement and an ADR.
- Data loss is a serious defect: test migrations, interrupted sessions, restore.
- Imported content is untrusted: validate with Zod, never eval, never render HTML, size-limit.
- Historical sessions snapshot exercise names and routine prescriptions; routine edits never rewrite history.
- Store raw sets; compute aggregates. Weights in kg internally, ISO 8601 timestamps.
- Rest timer uses a stored `endsAt` timestamp, not interval ticks.
- Record notable decisions in docs/decisions/. Keep docs updated with code.
- Prefer the simplest thing; don't add abstractions for hypothetical needs.
