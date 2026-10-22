# 0008 – Importing plans from a URL

**Status:** proposed (recommendation; the owner confirms the open question below) · 2026-10-20

**Context:** PRD §12.2 says URL import "cannot be assumed to work" and that paste-text must always be offered. ADR 0003 sets the CSP to `connect-src 'self'`. "Convert a plan from text" (T8.02, `docs/import-schema.md`) already ships: the user pastes plan text, copies a prompt into an assistant of their choice, and imports the JSON that comes back. Nothing is fetched or uploaded. The question is whether the app should ever fetch a plan URL itself.

**Options evaluated**

1. **No fetch: open the URL, copy the text, paste it (current approach).**
   - Works for every site, including JS-rendered pages, paywalled or logged-in pages and PDFs, because the user's own browser does the reading.
   - No network code, no CSP change, no new data flow. Keeps "no automatic upload / no outbound requests" (PRD §20) literally true.
   - Cost: one extra copy/paste step.
2. **User-initiated `fetch()` from the PWA with a relaxed CSP.**
   - CORS decides this, not the CSP. A cross-origin `fetch` succeeds only if the target sends `Access-Control-Allow-Origin`. Most blogs, coaching sites and CMS pages don't, so it fails for the large majority of real plan pages (and the failure is opaque: the page only sees a network error).
   - It cannot run page JavaScript, so SPA/JS-rendered plan sites return an empty shell. The user gets nothing even when CORS passes.
   - Relaxing `connect-src` to `https:` (the only way to allow arbitrary URLs) removes the main guard against exfiltration if any script bug or injected content ever runs: any code in the page could then send data to any host. That weakens ADR 0003 for the whole app to serve a feature that mostly fails.
   - Fetched HTML is untrusted. It would need size limits, content-type checks, text extraction without DOM injection (never `{@html}`), and redirect/`https`-only handling. The user's IP, the app origin and the plan URL are disclosed to the third-party site. The URL itself can be private (shared links with tokens).
   - SSRF proper does not apply (the request comes from the user's own browser, not a server), but a user could be steered to a hostile URL by a shared link; a client-side fetch of it is low risk by itself yet adds an attack/phishing surface with no offsetting benefit.
3. **A proxy or backend fetch.** Would solve CORS, and at best a headless-render service would solve JS pages. It needs a server, hosting cost, abuse and SSRF protection (private IP ranges, redirects, DNS rebinding), and sends every fetched URL and its content through our infrastructure. AGENTS.md: no backend or paid APIs without a concrete requirement and an ADR; PRD §20: no automatic upload. **Rejected.**
4. **Public third-party CORS proxies.** Rejected: leaks the user's URL to an unvetted party, can alter content, and is unreliable.
5. **Share target / bookmarklet / browser extension.** Out of scope for a platform-neutral PWA (iOS Safari restrictions); revisit only with a native wrapper (PRD §26.4/7).

**Decision (recommended):**
1. **Do not fetch URLs from the app. Keep CSP `connect-src 'self'` unchanged.** No fetch code, no proxy, no relaxed CSP.
2. **"URL import" stays assisted-paste.** The existing "Convert a plan" flow already takes pasted text plus an optional source URL. The source URL is stored as `program.source.url` (http/https only, ≤2000 chars; `javascript:`/`data:` rejected, see `docs/import-schema.md`) for attribution only, never fetched or auto-opened without a user tap (render as a normal external link with `rel="noopener noreferrer"`).
3. **Possible UX improvement, not required:** in the convert screen add a short hint "Open the plan page, select all, copy, paste here" and an optional "Open URL" link that opens it in a new tab. This needs no network permission. Build it only inside the existing convert screen; no follow-up issue is needed for this decision.
4. **Revisit only if** a concrete need appears (e.g. a specific plan source that sends permissive CORS headers and is stable). In that case the minimum acceptable design is a new ADR for a **single allow-listed origin** added to `connect-src`, https only, user-initiated, response size-capped and plain-text-extracted, with the paste path kept as the fallback. A general "any URL" fetch is not acceptable.

**Follow-up issue:** not needed. The decision is "do not build"; the optional hint in (3) is a copy change that can be folded into a future touch of the convert screen. #83 (`T8.32`, blocked on this ADR) should therefore be closed as won't-do or rescoped to the hint.

**Open question for the owner:** is the extra copy/paste step acceptable, or is there a specific plan site worth an allow-listed fetch (decision 4)? Absent an answer, the recommendation above stands.

**Consequences:** No code, bundle, CSP or privacy-posture change. Works on every site including JS-rendered ones. The cost is one manual paste step.
