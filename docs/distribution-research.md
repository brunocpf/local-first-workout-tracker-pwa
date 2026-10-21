# Distribution and pricing research

**Status:** research input for the monetization decision (#225, T8.38). It presents facts and tradeoffs; it makes no product decision.
**Checked:** 2026-10-21 (all "checked" dates below are this day unless stated). Store rules change often; re-verify anything here before acting on it.
**Method:** primary pages (store policy/help pages, official docs, App Store listings) were fetched on the check date. Claims are tagged **[P]** primary source, **[S]** secondary/third-party (weigh lower), **[U]** unverified or unknown. Where a page showed no "last updated" date, that is stated. Some Apple guideline text was read through a model-extracted summary of a very long page rather than verbatim; those are marked "(summary)".

Context: the app is a no-backend, no-account, local-first PWA ([ADR 0005](decisions/0005-mvp-scope-and-platforms.md), [AGENTS.md](../AGENTS.md)). Today it is distributed free as a PWA from GitHub Pages. Native store distribution is deferred (PRD §26, #103). Any model below that needs a server, an account system, or a paid third-party service needs its own ADR first.

---

## 1. Competitor pricing

Prices are US App Store listings read on 2026-10-21 **[P]**: developer-supplied, no effective dates, and in several cases the page lists more SKUs than can be mapped to "current" (legacy tiers). Google Play prices were not read and may differ.

| App | Free tier | Paid | Notes / source |
|---|---|---|---|
| **Hevy** | "Free, with no ads"; free tier limits not stated on the listing | Pro: $2.99/mo, $23.99/yr, $74.99 lifetime (a second monthly SKU at $3.99 is also listed, unlabelled) | [App Store](https://apps.apple.com/us/app/hevy-workout-tracker-gym-log/id1458862350) **[P]**. Free limits (about 4 routines, 7 custom exercises, 3-month graphs) come only from a competitor's blog, [SensAI](https://www.sensai.fit/blog/hevy-review-2026) **[S]**; Hevy's help center returned HTTP 403, so **[U]**. |
| **Strong** | "Unlimited workouts, limited to 3 custom routines" | $4.99/mo or $29.99/yr per the description; "Strong PRO Forever" SKUs at $99.99 and $79.99 (unmapped) | [App Store](https://apps.apple.com/us/app/strong-workout-tracker-gym-log/id464254577) **[P]**. Strong's homepage says accounts are free forever. |
| **Fitbod** | Free download with trial (length and free limits not stated) | $12.99 and $15.99 monthly; $79.99 and $95.99 yearly (legacy vs current not labelled; a June 2026 secondary review says $15.99 / $95.99) | [App Store](https://apps.apple.com/us/app/fitbod-gym-fitness-planner/id1041517543) **[P]**; [SensAI](https://www.sensai.fit/blog/fitbod-review-2026) **[S]**. Subscription-only, algorithmic programming; not a like-for-like logger. Declares ad/tracking data in its privacy label. |
| **Liftosaur** | Everything except the Premium list is free: programs, editor, logging, history, import/export | $4.99/mo, $39.99/yr, $99.99 lifetime; 14-day trial. Premium unlocks plate calculator, graphs, muscle views, rest-timer notifications, Apple Watch app, API | [App Store](https://apps.apple.com/us/app/liftosaur/id1661880849) **[P]**; [premium page](https://www.liftosaur.com/features/premium) **[P]** (modified 2026-09-29). The premium page says Premium is not sold in the web app. Source is AGPL-3.0 ([repo](https://github.com/astashov/liftosaur)). Its offline mode needs a cloud account to save progress. |
| **FitNotes** (iOS listing) | Free | "FitNotes PRO" $9.99 (billing type not shown); also $0.99/mo and $4.99/yr items | [App Store](https://apps.apple.com/us/app/fitnotes-workout-tracker/id1059245195) **[P]**. Closest to a "one-time unlock" example. The Android listing (where FitNotes is better known) was not read **[U]**. |
| **Setgraph** | Free, with trial | $29.99 "Pro Membership", $4.99 monthly, $199.99 lifetime | [App Store](https://apps.apple.com/us/app/setgraph-gym-workout-tracker/id1209781676) **[P]**. Its privacy label lists email and user ID, so it is not account-free. |

Takeaways (observations, not recommendations):

- The category norm is free with a feature/limit gate, then monthly + yearly + a **lifetime** option. Lifetime prices cluster at roughly $75–$100 among the established apps; FitNotes at ~$10 is the low outlier.
- Hevy is explicitly ad-free; none of the loggers read advertise ads as their model.
- The free gates are on routines, custom exercises, history depth and extras (graphs, timer notifications, calculators), not on logging itself.
- **Not found:** Gymbook (site had a TLS error) and other local-first/no-account loggers beyond FitNotes. The "2–3 local-first loggers" part of the scope is only partly met; **[U]**. Candidates for a follow-up check: Gymbook, Fitnotes on Play, open-source options.

---

## 2. Store rules and fees

### Google Play

| Topic | Finding | Source |
|---|---|---|
| Developer fee | US$25 one-time | [Play Console Help: get started](https://support.google.com/googleplay/android-developer/answer/6112435) **[P]** (no date shown) |
| Testing gate | Personal accounts created after 2023-11-13 must run a closed test with **at least 12 testers opted in continuously for 14 days** before Production is enabled; Google review after applying usually ≤7 days | [Help: testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465) **[P]** (no date shown). Secondary sources say organization accounts are exempt **[S]**. |
| Free → paid | "Once your app has been offered for free, the app can't be changed to paid"; charging later needs a **new app with a new package name**. Paid → free is allowed | [Help: set up prices](https://support.google.com/googleplay/android-developer/answer/6334373) **[P]** |
| Payments profile | Both paid-app setup paths start with "Set up a payments profile." Whether a free app that only adds in-app purchases needs one is not stated on that page | same page **[P]** / **[U]** |
| Service fee | Page shows two regimes. Markets where the new rules apply (EEA, UK, US from 2026-06-30; Australia and Japan from 2026-09-30): the table lists "10% + 5% billing fee" for auto-renewing subscriptions and 10%/20%/25% + 5% for other transactions in the standard column (cells did not map unambiguously to columns in extraction). Elsewhere, until global rollout: 15% on first $1M/year, 30% above; 15% for subscriptions. Billing fee applies to Play Billing purchases and to the initial purchase of a paid app | [Help: service fees](https://support.google.com/googleplay/android-developer/answer/112622) **[P]** (no date shown, footer ©2026). **Treat the exact rates for a one-time IAP in the US/EU as [U]; read the live table before modeling revenue.** |
| Billing required | Play Billing is required for digital features, including "an ad-free version of an app or new features not available in the free version" | [Payments policy](https://support.google.com/googleplay/android-developer/answer/10281818) **[P]** |
| Billing library | New apps/updates must use Billing Library 8+ by 2026-08-31 | [Play Billing overview](https://developer.android.com/google/play/billing/) **[P]** (updated 2026-10-20) |

### Apple

| Topic | Finding | Source |
|---|---|---|
| Developer fee | US$99 per membership year (waivers for eligible nonprofits, schools, governments) | [What's included](https://developer.apple.com/programs/whats-included/) **[P]** |
| Commission | Small Business Program: 15% on paid apps and IAP if proceeds ≤ $1M in the prior calendar year and the current year. Standard: 30% for digital goods, 15% for qualifying subscriptions | [Small Business Program](https://developer.apple.com/app-store/small-business-program/) **[P]** |
| 4.2 Minimum functionality | App must "elevate it beyond a repackaged website"; not primarily web clippings or a collection of links (summary) | [Review guidelines](https://developer.apple.com/app-store/review/guidelines/) **[P]**, page marked updated 2026-10-16 (summary). No guideline names web wrappers directly. An offline, data-owning logger is a plausible pass, but this is judgment, not a source; no rejection reports for PWA wrappers were found **[U]**. |
| 3.1.1 IAP | Unlocking features/functionality (subscription, "unlocking a full version") **must** use in-app purchase; license keys and own mechanisms are barred (summary). US storefront apps may link to external purchase (3.1.1(a)); other storefronts may not. EU rules are on a separate DMA page that was not read **[U]** | [Review guidelines](https://developer.apple.com/app-store/review/guidelines/) **[P]** (summary) |
| Privacy labels | Must declare data collected by you *or third-party partners/SDKs*. Data processed only on device and never transmitted is not "collected". Ads do not by themselves trigger a label; the ad SDK's data collection does | [App privacy details](https://developer.apple.com/app-store/app-privacy-details/) **[P]** |
| ATT | Tracking or reading the advertising identifier needs ATT consent (iOS 14.5+) | [User privacy and data use](https://developer.apple.com/app-store/user-privacy-and-data-use/) **[P]** |

Not found: whether a paid Apple app can later switch to free + IAP (the IAP page does not say) **[U]**.

### Microsoft Store

- **Fee:** none. Individual and company accounts are both free to register (individuals need ID + selfie verification; company accounts need a D-U-N-S number or business documents and a work-domain email). Source: [open a developer account](https://learn.microsoft.com/en-us/windows/apps/publish/partner-center/open-a-developer-account) **[P]** (ms.date 2025-09-17, updated 2026-07-17).
- **PWA packaging:** no code changes are required; reserve the name in Partner Center, package with PWABuilder (`.msixbundle`), submit; review typically 24–48 h; manifest changes need a repackage, web-content changes do not. Source: [Edge docs](https://learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps/how-to/microsoft-store) **[P]** (ms.date 2023-10-06, updated 2026-09-02). The PWABuilder docs themselves are client-rendered and could not be read **[U]**.
- **Revenue share:** the commonly cited 85/15 split was **not verified**; the store policies (v7.20) contain no percentage and the App Developer Agreement PDF was unreadable **[U]**.
- **IAP:** non-game products may use either a secure third-party purchase API or the Store's, per policy 10.8.1 ([Store policies](https://learn.microsoft.com/en-us/windows/apps/publish/store-policies), effective 2026-10-22) **[P]**. Whether a PWA package can use Store IAP was not established **[U]**.

---

## 3. Payments and IAP by wrapper type

| | **TWA (Bubblewrap / PWABuilder Android)** | **PWABuilder iOS (WKWebView shell)** | **Capacitor** |
|---|---|---|---|
| What it is | Chrome renders the PWA full-screen; needs Digital Asset Links ([TWA overview](https://developer.chrome.com/docs/android/trusted-web-activity/), 2020 page **[P]**). Bubblewrap is "not an officially supported Google product" ([repo](https://github.com/GoogleChromeLabs/bubblewrap)) | Generates a zip with an Xcode project that loads the PWA in a WKWebView; compile on a Mac. The repo is **archived (read-only since 2025-09-11)** and says iOS support is "community driven" ([repo](https://github.com/pwa-builder/pwabuilder-ios-app-store)) **[P]** | Native runtime around the web app ([docs](https://capacitorjs.com/docs)) **[P]**; same web code, native plugins |
| Paid upfront | Yes via Play, but see free→paid immutability: price must be chosen at first publish | Yes (App Store paid app), subject to 4.2 | Yes on both stores |
| In-app purchase | Digital Goods API + Payment Request with `https://play.google.com/billing`; needs a Play listing in a public/closed/internal track and a linked merchant account; Chrome 101+; Bubblewrap ≥1.8.2 with `playBilling` enabled. Source is a **2021** page, so check it against Billing Library 8 **[U]** ([Chrome docs](https://developer.chrome.com/docs/android/trusted-web-activity/receive-payments-play-billing)). The same page says purchases must be acknowledged "on the backend" or are refunded after three days | Not mentioned by the README; StoreKit is not reachable from WKWebView without custom native code **[U]** | Native plugin needed. [RevenueCat's Capacitor SDK](https://www.revenuecat.com/docs/getting-started/installation/capacitor) wraps StoreKit and Play Billing. The Capacitor docs list an IAP guide that was not read **[U]** |
| Ads | Not supported by the web view path; would need native code | Not supported without native code **[U]** | [`@capacitor-community/admob`](https://github.com/capacitor-community/admob) (actively maintained; includes UMP consent and ATT helpers; banner "sits above the WebView and can cover HTML") **[P]** |
| Cost/effort | Lowest of the three | Mac + Xcode, archived tooling, 4.2 review risk | Highest: native build, plugins, two native projects, store review on both |

### What each does to the no-backend rule

- **Upfront paid:** none. Stores handle payment and delivery; the app stays backend-free. The cost is the loss of the free PWA as the main funnel and (on Play) the new-package-name constraint.
- **IAP unlock:** the app needs to know "is Pro unlocked". Play's docs say purchases are acknowledged "on the backend" (a server) for the TWA path **[P]**; a client-side acknowledge may exist in native Billing but that was not verified **[U]**. RevenueCat removes the need to run your own server but is itself a **hosted third-party service**: free up to $2,500 monthly tracked revenue, then 1% (whether 1% applies to the full amount or only the excess was not resolved) ([pricing](https://www.revenuecat.com/pricing/)) **[P]**. That touches the "no accounts / paid APIs without an ADR" rule and would need an ADR. A Play-only, client-side Digital Goods check would be the least-backend path.
- **The web PWA cannot take store payments** (Liftosaur says the same of its web app, [premium page](https://www.liftosaur.com/features/premium) **[P]**). Selling a web unlock would need a payment provider and license/entitlement check, which is a backend. Apple 3.1.1 also bars own-mechanism unlocks inside an iOS store app.
- **Ads:** no backend, but a third-party SDK that phones home (see §4).
- **Entitlement vs local-first:** an unlock must survive backup/restore, reinstall and eviction without an account. Store receipts solve that per store account; the data model should keep entitlement out of the user data backup. (Design note for #225, not a source claim.)

---

## 4. Ads

**Consent.**
- AdMob requires Google's UMP SDK (or another consent solution) for EEA, UK and Switzerland users; `canRequestAds()` stays false until consent info is requested at each launch ([UMP docs](https://developers.google.com/admob/android/privacy), updated 2026-10-20; [EU consent policy](https://developers.google.com/admob/android/privacy/gdpr), updated 2026-10-20) **[P]**.
- iOS needs ATT before reading the ad identifier ([Apple](https://developer.apple.com/app-store/user-privacy-and-data-use/)) **[P]**; from iOS 27.2 an alternative prompt is allowed in the EU, but asking is still required **[P]**.

**Store privacy labels.**
- Google Play: the AdMob SDK "automatically collects and shares" IP address, product interactions, diagnostics and device/account identifiers (ad ID, app set ID), all of which must go in the Data safety form ([SDK disclosure](https://developers.google.com/admob/android/privacy/play-data-disclosure), legacy SDK 25.5.0; [Data safety](https://support.google.com/googleplay/android-developer/answer/10787469)) **[P]**.
- Apple: third-party SDK collection must be declared; tracking declarations follow. Fitbod's listing shows what this looks like (tracking + advertising data); Hevy's says "no ads" ([App Store](https://apps.apple.com/us/app/hevy-workout-tracker-gym-log/id1458862350)) **[P]**.
- Today the app can truthfully claim no data collection. Ads would end that for the wrapped builds.

**Revenue range (indicative only).**
- Reputable 2026 benchmarks for fitness apps were not found. The available figures are Appodeal Q4 2024 data, mostly games, relayed by [Adapty](https://adapty.io/blog/mobile-interstitial-ads/) and [MAF](https://maf.ad/en/blog/mobile-ads-ecpm/) **[S]**: US interstitial eCPM about $14 (iOS and Android); banner eCPM mostly under $1 (US about $0.45–0.68). A [Playio](https://blog.playio.co/mobile-game-ecpm-benchmarks-2026) post gives 2026 US interstitials about $10 and banners about $1.2–1.3, source of data unclear **[S]**. Other countries are materially lower.
- Illustration with stated assumptions (mine, not sourced): banner eCPM $0.50 means $0.50 per 1,000 impressions. A user who opens the logger 20 days a month and generates ~20 banner impressions per day makes ~400 impressions, about **$0.20 per user per month**. A tracker's interstitials would interrupt a workout, which is a UX tradeoff, not just revenue.
- Conclusion for sizing: ad income scales with active users; for a small personal-scale audience it is likely to be small relative to the fixed cost of a developer account. **[U]** because no fitness-specific ARPU source was found.

**Positioning.**
- The product promise is local-first and private. Ads add a third-party SDK, identifiers, consent dialogs and a "data used to track you" label risk. Hevy markets itself as ad-free; none of the compared loggers use ads as a headline model.
- Web ad scripts in the PWA itself are blocked by the strict CSP by design (AGENTS.md "Imported content is untrusted"; `connect-src 'self'`), so ads effectively mean a native wrapper (Capacitor) on every platform that shows them.

---

## 5. Model comparison

| | **A. Paid upfront** | **B. Free + one-time Pro unlock** | **C. Free with ads + one-time ad removal** |
|---|---|---|---|
| Engineering cost | Low: wrapper + store listing. No entitlement code | Medium: wrapper + billing integration + entitlement state + feature gating + restore-purchases flow, per store | High: Capacitor + AdMob + UMP consent + ATT + billing for ad removal + gating |
| Ongoing cost | Dev accounts: Play $25 once, Apple $99/yr, Microsoft $0. Store fee: see §2 | Same accounts; plus billing library upgrades (Play mandates Billing 8 by 2026-08-31) and possibly RevenueCat (free < $2.5k MTR) | Same as B + SDK upgrades, consent compliance, privacy label upkeep |
| Review risk | Apple 4.2 for a WebView shell; Play 12-tester gate for a new personal account | Same as A + Apple 3.1.1 (must use IAP) and Play payments policy (must use Play Billing for digital unlocks) | Highest: all of B + ads/privacy-label/ATT/consent review surface |
| Privacy impact | None (store sees purchase only) | None for the app; store handles purchase | Significant: ad SDK collects identifiers; labels change; consent UI |
| Revenue ceiling | One price × downloads, minus 15–30% store cut where applicable; the free PWA remains a free alternative, which caps the paid audience | Category norm: lifetime $75–$100 among big apps, ~$10 at FitNotes. Conversion unknown **[U]**. Free PWA stays the funnel | Per-user ad income likely cents per month (illustration above); plus a one-time removal price |

### Deal-breakers and flags

1. **Play free → paid is impossible.** Once an app has been offered free on Play, it cannot become paid (only a new package name can). Free + IAP later is fine, but if paid-upfront is ever wanted on Android, decide before the first Play release.
2. **Free PWA vs paid native app.** The PWA at brunocpf.github.io is free and unrestricted. Models A and B imply either gating the native builds only (the web app is the unlocked product) or accepting that the free web build competes with the paid one. This is a product choice for #225.
3. **Ads vs the privacy promise.** Model C ends "no data collected" on the stores and needs Capacitor on iOS and Android (ads cannot run in the strict-CSP web build). That conflicts with the current positioning and with ADR 0005's PWA-first scope.
4. **Native wrappers are not built.** Every model that uses a store requires a wrapper (#103 deferred). The cheapest path to Play is a TWA; iOS via PWABuilder relies on archived tooling; Capacitor is the only path with ads and clean StoreKit.
5. **Backend rule.** Model B/C entitlement is store-side if done natively, but several documented flows (TWA acknowledgement, RevenueCat) involve a server, hosted or yours. Each needs an ADR.
6. **Apple IAP is mandatory** for unlocking features in the iOS store app (3.1.1). Own license keys or a web checkout are not allowed in non-US storefronts.

---

## 6. Unknowns (not guessed)

- Exact current Play service-fee rate for a one-time IAP / paid app in the US and EU under the new 2026 table.
- Whether a Play free app with only IAP needs a payments profile (almost certainly yes to sell, but the page does not state it).
- Microsoft Store revenue share and whether PWA packages can use Store IAP.
- Whether Play Billing from a TWA works end-to-end today with Billing Library 8 (the Chrome guide is from 2021).
- Whether a paid Apple app can later become free or move to IAP.
- Hevy and Fitbod free-tier limits from primary sources; Google Play prices for all competitors; current vs legacy SKUs on the App Store.
- Local-first competitor coverage beyond FitNotes (Gymbook etc.).
- Fitness-app ad ARPU and conversion-to-Pro rates; any 2026 primary benchmark for banner/interstitial eCPM.
- Apple EU/DMA payment and steering rules; Apple 4.2 outcomes for PWABuilder shells (no rejection reports found).
- RevenueCat: whether the 1% applies to all tracked revenue or only above $2,500.

## 7. Sources checked

All fetched 2026-10-21; links are inline above. Primary: Google Play Console Help (answers 112622, 14151465, 6112435, 6334373, 10281818, 10787469), Android/Chrome developer docs, Apple Developer (programs, Small Business Program, review guidelines, app privacy details, user privacy and data use), Microsoft Learn (Partner Center, Edge PWA docs, Store policies), AdMob docs, Capacitor, capacitor-community/admob, RevenueCat, PWABuilder and Bubblewrap repos, App Store listings of the compared apps, liftosaur.com. Secondary: SensAI blog, Adapty, MAF, Playio, TechRadar-style reviews returned by search.
