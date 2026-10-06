# Social Command Center

Single-screen analytics dashboard (React + Vite + Tailwind) with a small Node
backend that holds the platform credentials and refreshes data every day at
**00:00 America/Chicago**.

```
Browser ──GET /api/metrics──▶ server/index.ts ──▶ cached payload (.cache/)
                                   │  00:00 America/Chicago
                                   └──▶ server/providers/*  ──▶ YouTube · Instagram · Facebook · TikTok · X
```

The browser never receives a token. `.env.local` is read only by the Node
process; nothing is prefixed `VITE_`.

## Run it

```bash
npm install
cp .env.example .env.local      # fill in what you have; blanks = "Not connected"
npm run dev:all                 # Vite on :5173 (proxies /api) + API on :8787
```

Production: `npm start` (builds, then serves `dist/` and `/api` from one process on `HOST:PORT`).
With no credentials the UI shows a yellow **Demo data** badge; with at least one
platform connected it switches to **Live**.

`GET /api/health` shows which providers are configured and when the next refresh is. No secrets are included.

## How the daily refresh works

| Layer | Mechanism |
| --- | --- |
| Server | `setTimeout` armed for the next 00:00 `America/Chicago` (resolved with `Intl`, so it is 06:00 UTC in winter/CST and **05:00 UTC in summer/CDT**), re-armed after each run. Boot-time and request-time checks also refresh if the cache is from an earlier Chicago day. Partial failures retry every 30 min (max 4). |
| Browser | A timer targeted at the next Chicago midnight (+20 s grace) re-fetches `/api/metrics`; a 30 s tick and tab-visibility check recover from sleep/throttled timers. |

If the host process is not always running, use an OS scheduler instead: run
`npm run server` as a service (systemd/pm2/Windows service) rather than relying on a laptop being awake.

## Credentials: what to get, and where

> Verify each platform's current requirements before relying on them. App-review rules, scopes and
> metric names change often, and **the providers here have not been run against live accounts**.

### YouTube — `YOUTUBE_*`
Daily numbers need the **YouTube Analytics API** (OAuth); the Data API key alone only gives lifetime totals.
1. [Google Cloud Console](https://console.cloud.google.com) → create/select a project → **APIs & Services → Library**: enable **YouTube Data API v3** and **YouTube Analytics API**.
2. **Credentials → Create credentials → API key** → `YOUTUBE_API_KEY` (restrict it to YouTube Data API v3).
3. **OAuth consent screen** (External, add yourself as a test user) → **Credentials → OAuth client ID → Web application**, add `https://developers.google.com/oauthplayground` as a redirect URI → `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`.
4. Open the [OAuth Playground](https://developers.google.com/oauthplayground) → gear icon → *Use your own OAuth credentials* → authorize scopes `https://www.googleapis.com/auth/yt-analytics.readonly` and `https://www.googleapis.com/auth/youtube.readonly` as the channel owner → *Exchange authorization code* → copy the **refresh token** → `YOUTUBE_REFRESH_TOKEN`.
5. While the consent screen is in *Testing*, refresh tokens expire after 7 days. Publish the app (or move to production) for a durable token.

### Instagram + Facebook — `META_*`
1. Instagram must be a **Business or Creator** account linked to a **Facebook Page**.
2. [developers.facebook.com](https://developers.facebook.com) → create an app (type *Business*) → add the **Instagram Graph API** product.
3. Permissions: `instagram_basic`, `instagram_manage_insights`, `pages_show_list`, `pages_read_engagement`, `read_insights`. For your own accounts these work in development mode with you as app admin/tester; no app review is needed for assets you own.
4. Graph API Explorer → generate a user token with those permissions → exchange for a **long-lived token** (`GET /oauth/access_token?grant_type=fb_exchange_token&client_id=…&client_secret=…&fb_exchange_token=…`). A **System User token** in Business Manager avoids the 60-day expiry and is better for a server.
5. `GET /me/accounts` → your Page `id` → `META_PAGE_ID`, and its `access_token` (a long-lived user token yields a non-expiring Page token) → `META_PAGE_ACCESS_TOKEN`.
6. `GET /{page-id}?fields=instagram_business_account` → `META_IG_USER_ID`. Put the long-lived token in `META_ACCESS_TOKEN`.

Mapping caveats: Facebook "likes/view" uses `page_post_engagements` as a proxy and has no share metric; Instagram and Facebook do not report retention (shown as *n/a* and excluded from the weighted average). Meta renames Page insight metrics periodically; if a call returns `#100 … not a valid metric`, update the names in `server/providers/meta.ts`.

### TikTok — `TIKTOK_*`
1. [developers.tiktok.com](https://developers.tiktok.com) → **Manage apps → Connect an app** → add the **Login Kit** and **Display API** products, request scopes `user.info.basic` and `video.list`.
2. Copy **Client key** / **Client secret** → `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`.
3. Run the OAuth authorization-code flow once as the account owner (add yourself as a Sandbox/target user while the app is unaudited) and store the returned **refresh token** (valid ~365 days) → `TIKTOK_REFRESH_TOKEN`. TikTok may rotate it on refresh; the server persists the newest one in `.cache/tiktok-refresh-token`.

The Display API only returns lifetime per-video counters, so daily numbers are the **difference between consecutive days'** totals. **The first day after connecting shows 0** (baseline). Retention is not exposed.

### X / Twitter — `X_*`
1. [developer.x.com](https://developer.x.com) → create a project and app on a tier that includes reading your timeline (the Free tier does not).
2. **Keys and tokens → Bearer Token** → `X_BEARER_TOKEN`.
3. `X_USER_ID` is your numeric ID: `GET https://api.x.com/2/users/by/username/<handle>` with the bearer token.

Same lifetime-counter behaviour (and first-day baseline) as TikTok.

### Not wired yet
LinkedIn, Pinterest, Snapchat, Threads, Reddit and Bluesky appear as *Not connected*. To add one, create `server/providers/<name>.ts` exporting a `Provider` (see `server/providers/types.ts`) and append it to `PROVIDERS` in `server/aggregate.ts`. Nothing in the frontend changes.

## Data shape

`DailyPayload` / `PlatformDailyMetric` are unchanged. `history`, `topPosts`, `source` and `unconnected` are
**optional additions**, so older payloads still render. A `retentionRate` (or other rate) of `0` means "not reported" and renders as *n/a*.

## Theme

Palette comes from the Serfis reference artifact and lives in `tailwind.config.js`:

| Token | Value | Use |
| --- | --- | --- |
| `void` | `#06030F` | page background |
| `plum-950 / 900 / 800 / 700` | `#0B0620 / #0F032D / #1A1140 / #2A1A5E` | panels, hover, borders |
| `violet` · `bright` · `soft` | `#6A3FE6 · #905BF4 · #C084FC` | primary action, chart accent, links |
| `accent.blue` / `accent.fuchsia` | `#3B5BFF` / `#D946EF` | gradients, engagement line |
| `up` / `down` / `warn` | `#3BE08C` / `#FF6B8A` / `#FBBF24` | metric deltas, status badges |
| `ink` · `muted` · `faint` | `#EFEFEF · #A9A3BF · #8A82A6` | text hierarchy |

## Layout

At `lg` and up the page is `h-screen overflow-hidden`; the main grid uses `flex-1 min-h-0` so every panel
shrinks to fit (verified with no vertical scroll at 1920×1080 and 1366×768). Below `lg` it falls back to a normal scrolling stack.

## GitHub Pages demo

`.github/workflows/deploy.yml` builds the frontend on every push to `main` and publishes it to Pages.
Pages is static: there is no `/api`, so the hosted site shows labelled **Demo data** only. Live data needs the
Node server (above), run somewhere that can hold the secrets. Never put platform keys in Pages or in repo files.
