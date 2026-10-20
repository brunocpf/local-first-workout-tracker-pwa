# 0013 – Built-in AI (external API, progression suggestions)

**Status:** proposed (recommendation; the owner confirms the open question below) · 2026-10-20

**Context:** PRD §1 lists "AI coaching with recurring inference cost" as a non-goal and §20 says no data is uploaded automatically and any built-in AI must document exactly what leaves the device and obtain consent. AGENTS.md: no backend, accounts or paid APIs without a concrete requirement and an ADR. ADR 0003 sets the CSP to `connect-src 'self'`. Two things already cover the useful AI cases without any API: the plan converter and prompt generator (PRD §11, `docs/import-schema.md`: the user pastes text or copies a prompt into an assistant of their choice and imports the validated JSON that comes back), and the deterministic, explained double-progression rules (PRD §17, T8.22). The question is whether the app should call an AI service itself, for plan generation/conversion or for progression suggestions.

**Options evaluated**

1. **None: copy/paste prompt flow + deterministic rules (current approach).**
   - Nothing leaves the device unless the user pastes it elsewhere. No key, no network code, no CSP change, works offline (the assistant step happens outside the app).
   - Progression suggestions come from double progression (and later percentage/RPE/deload rules): pure functions over raw sets, unit-testable, offline, every suggestion shows its rule (PRD §17).
   - Cost: one copy/paste round trip for plan generation; no free-form coaching.
2. **User-supplied API key stored locally, calling a provider directly from the PWA.**
   - There is no backend, so the key can only live in the browser (IndexedDB/localStorage). It is readable by any script running on the origin, and the origin `brunocpf.github.io` is shared with other project sites (ADR 0003); a bug or injected content would expose a key that can spend the user's money. It would be included in backups unless explicitly excluded, and must never be in code, fixtures or the repo.
   - Needs `connect-src` widened to the provider origin, the largest weakening of ADR 0003's exfiltration guard; at minimum a single allow-listed origin, never `https:`. Provider CORS support from browsers is not guaranteed and varies by provider and over time; it would also tie the app to one vendor's API shape.
   - Privacy: every request sends prompt content (and any included history) to a third party, with the user's IP and key. Needs a clear per-request consent screen showing exactly the payload.
   - Offline: unusable offline; must degrade to a clear "needs network" state and never block logging.
   - Cost: paid per use by the user; usage unbounded unless the app adds caps. Responses are untrusted and must pass the same Zod schema validation, size limits and preview-and-confirm as pasted JSON, so the app gains no safety over the paste flow, only saves a copy/paste.
3. **Our own proxy/backend holding a key.** Recurring cost for the owner, accounts or abuse protection, and every prompt flows through our infrastructure. **Rejected** (PRD §1, §20, §23; AGENTS.md).
4. **On-device models (WebGPU/WASM LLMs, or browser built-in AI APIs where present).**
   - Fully private and offline once downloaded, but model downloads are hundreds of MB to GB, need WebGPU/large memory not reliably available on iOS Safari (the most constrained target, PRD §2.2), storage can be evicted, and small models produce unreliable structured output and training advice. Browser built-in APIs are not available on all primary targets, so they cannot be required.
   - **Not now.** Possible as a progressive enhancement later if support and quality become uniform.
5. **AI progression suggestions (any of the above).** Training-load advice from a model is not explainable or reproducible, risks being wrong or unsafe, and PRD §17 requires suggestions that are transparent, user-controlled and explain their rule. Deterministic rules satisfy that and cost nothing. **Rejected** for the app; a user can still paste their own history into an assistant (PRD §11.4, opt-in) for ad hoc advice.

**Decision (recommended):**
1. **Do not build a built-in AI feature.** No API client, no key storage, no CSP change, no proxy, no on-device model. `connect-src 'self'` stays.
2. **Plan generation/conversion stays assisted-paste** (prompt generator, convert-from-text). It is the supported AI path and keeps the "bring your own assistant" flexibility with zero lock-in.
3. **Progression suggestions are deterministic and explained** (T8.22 double progression; further rule types later), user-triggered, never automatic, never AI-generated.
4. **Revisit only on a concrete need** (e.g. the paste round trip proves too painful after real use). Then a new ADR must specify at minimum: opt-in per feature; user-supplied key stored locally only, excluded from backups/exports by default, removable, never in code; a single allow-listed provider origin in `connect-src` (never `https:`); a per-request preview showing exactly what is sent and whether any history is included, with explicit confirmation; no history by default; offline state handled without affecting logging; responses validated like any import (Zod, size limit, preview, no auto-save); and a documented provider CORS check. Sync to any account or hosted key remains out of scope.

**Follow-up issue:** not needed; this is a "do not build" decision. The prompt generator and T8.22 are already planned.

**Open question for the owner:** is the copy/paste round trip acceptable for plan generation, or is there a concrete workflow that justifies the key-handling and CSP trade-offs of option 2? Absent an answer, the recommendation above stands.

**Consequences:** No code, bundle, CSP, storage or privacy-posture change; no recurring cost; nothing leaves the device automatically. The cost is manual copy/paste for AI-assisted planning and no free-form in-app coaching.
