# Third-party licenses (commercial-use audit)

Audit for [T8.39](https://github.com/brunocpf/local-first-workout-tracker-pwa/issues/226), done on 2026-10-21 against `package-lock.json` and a production build. Conclusion: **everything shipped is permissively licensed (MIT, Apache-2.0, ISC) and allows use in a commercial, closed-source product.** Nothing is copyleft, non-commercial or unknown. The only obligation is keeping the copyright and license notices with distributed copies, met by [`static/THIRD_PARTY_NOTICES.txt`](../static/THIRD_PARTY_NOTICES.txt), served at `/THIRD_PARTY_NOTICES.txt` in every build.

## What actually ships

`npm`'s "production" dependencies are only `dexie` and `zod`, but SvelteKit/Svelte runtime code is bundled too even though it sits in `devDependencies`. The packages in the built client and service-worker bundles were identified from a source-mapped build (`vite build --sourcemap`):

| Package | Version | License | Where | Notice required |
| --- | --- | --- | --- | --- |
| dexie | 4.4.6 | Apache-2.0 | app bundle | Yes: license + NOTICE |
| zod | 4.6.7 | MIT | app bundle | Yes |
| svelte | 5.57.2 | MIT | app bundle (runtime) | Yes |
| @sveltejs/kit | 3.1.0 | MIT | app bundle (client runtime) | Yes |
| clsx | 2.1.1 | MIT | via svelte | Yes |
| devalue | 5.9.4 | MIT | via kit | Yes |
| Lucide icon geometry | n/a | ISC (+ Feather, MIT) | `src/lib/icons.ts`, inlined paths | Yes |

`relay/` (optional Web Push relay, [ADR 0014](decisions/0014-rest-timer-push.md)) depends on `zod` (MIT) and dev-only `wrangler`; it is deployed separately and not part of the PWA build.

## Full dependency tree

`npx license-checker-rseidelsohn --summary` over all 244 installed packages (dev tooling included): MIT 181, Apache-2.0 25, BSD-2-Clause 10, ISC 9, MPL-2.0 4, BSD-3-Clause 3, MIT-0 2, BlueOak-1.0.0 2, CC0-1.0 1, plus the project itself. No `UNKNOWN`. The not-MIT/ISC/BSD/Apache entries:

| Package | License | Dev-only? | Conclusion |
| --- | --- | --- | --- |
| axe-core, @axe-core/playwright | MPL-2.0 | Yes (e2e a11y tests) | Not shipped. MPL is file-level copyleft and only triggers on distributing modified MPL files. No action. |
| lightningcss (+ platform binary) | MPL-2.0 | Yes (Vite CSS build tool) | Not shipped; its output is our CSS. No action. |
| @csstools/\* | MIT-0 | Yes | Not shipped, no notice needed. |
| lru-cache, minimatch | BlueOak-1.0.0 | Yes | Permissive, not shipped. |
| mdn-data | CC0-1.0 | Yes | Public domain. |
| local-first-workout-tracker-pwa | UNLICENSED | n/a | The project itself: `package.json` has no `license` field and `private: true`, while the root `LICENSE` file is MIT. See "For the owner". |

## Static assets, fonts, data

- **Fonts:** none bundled. `--font-sans`/`--font-mono` in `src/app.css` are system font stacks; no `@font-face`, no remote font requests.
- **Icons:** UI icons are inline SVG paths from Lucide (ISC), see [attribution.md](attribution.md). App icons in `static/` (`icon.svg`, `icon-*.png`, `apple-touch-icon.png`) are project artwork, no third-party source.
- **Exercise catalog:** `src/lib/catalog/seed.ts` is self-written, no third-party text or media ([attribution.md](attribution.md), [ADR 0009](decisions/0009-wger-catalog.md)).
- **Images, sample data:** none other than the above.

## For the owner

- #227 (project license): decide the license for the code. Repo `LICENSE` is MIT while `package.json` implies none; align them there. MIT is compatible with every dependency above. This audit does not touch `LICENSE`.
- Anything added later (a font, icon pack, wger text, media) needs an entry here and in `static/THIRD_PARTY_NOTICES.txt` if its license requires attribution. wger content is CC-BY-SA and would need separate handling.

## Refreshing

When shipped dependencies change: rebuild with `npx vite build --sourcemap`, list `node_modules/<pkg>` entries in the client source maps, re-run `npx license-checker-rseidelsohn --summary`, and regenerate the notices file from each package's LICENSE.
