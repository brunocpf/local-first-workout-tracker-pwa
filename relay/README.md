# Push relay (optional)

A tiny Cloudflare Worker that sends a Web Push at the end of a rest timer, so the installed app can notify you with the screen locked. See [ADR 0014](../docs/decisions/0014-rest-timer-push.md). The app works fully without it.

**What it stores:** per random device id, a push endpoint URL and a fire time, until the push is sent or cancelled. Never workout data. **What it sends:** an empty, VAPID-signed push; the app's service worker shows "Rest over".

## Deploy (about 10 minutes, free plan)

1. Create a free Cloudflare account at <https://dash.cloudflare.com/sign-up> (no card needed for Workers).
2. Install dependencies and log in:
   ```bash
   cd relay && npm install && npx wrangler login
   ```
3. Generate a VAPID key pair (once) and keep the private key to yourself:
   ```bash
   npm run vapid
   ```
4. Edit `wrangler.toml`: set `ALLOWED_ORIGIN` to your app's production origin (scheme and host only; comma-separate several) and `VAPID_SUBJECT` to `mailto:you@example.com`. **The production origin is still undecided (issue #5): set `ALLOWED_ORIGIN` once it is, and redeploy (`npm run deploy`) if it ever changes.** Nothing in the repo hardcodes it. For local development, put `ALLOW_LOCALHOST=true` in `relay/.dev.vars` to also accept `http://localhost:*` (leave it off in production).
5. Store the keys as secrets (paste the values printed in step 3 when prompted):
   ```bash
   npx wrangler secret put VAPID_PUBLIC_KEY
   npx wrangler secret put VAPID_PRIVATE_KEY
   ```
6. Deploy; Wrangler prints the Worker URL (`https://workout-tracker-push-relay.<you>.workers.dev`):
   ```bash
   npm run deploy
   ```
7. In the GitHub repository, add **Actions variables** (Settings, Secrets and variables, Variables): `PUSH_RELAY_URL` = the Worker URL, `PUSH_VAPID_PUBLIC_KEY` = the public key from step 3 (it is public by design). Re-run the Deploy workflow. For a local build use `VITE_PUSH_RELAY_URL` and `VITE_PUSH_VAPID_PUBLIC_KEY`.
8. On your phone: install the app (iPhone/iPad: Share, Add to Home Screen, open it from there), then Settings, Notifications, turn it on and tap "Send test notification".

If you rotate the VAPID keys, turn notifications off and on again in the app so it re-subscribes.

## API

`POST /schedule` `{ id, subscription: { endpoint, keys? }, fireAt }` and `POST /cancel` `{ id }`. Same `id` replaces the pending push. Limits: 4 KB body, `fireAt` at most 2 hours ahead, https push-service endpoints only, requests only from `ALLOWED_ORIGIN` (and localhost when `ALLOW_LOCALHOST=true`), 20 requests per minute per IP.

## Development

Tests run with the app's suite (`npm test` from the repository root). `npx wrangler dev` runs the Worker locally. No secrets belong in this folder: `.dev.vars` is git-ignored.
