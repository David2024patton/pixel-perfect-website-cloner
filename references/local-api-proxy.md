# Fully functional copy (login bypass via a local API proxy)

Goal: a login-gated API-backed app copied **pixel-identical and fully functional**, so the clone runs the real
code AND gets past the login with the supplied account. A bare re-host shows only the login (the backend is
cross-origin); the fix is to re-host the real files, proxy the backend, rewrite the API base, and seed the session.

## When this applies

`SITE_TYPE=authenticated_spa` and the user supplied credentials and wants the real, working app (not a look-alike).

## Steps

1. **Faithful re-host** the app's real files (index.html + the whole build: hashed JS/CSS, fonts, assets, icons).
   Serve them (e.g. `python -m http.server 5190`). See `faithful-rehost.md`.
2. **Find the backend.** From the JS bundle / a runtime network capture, note:
   - the API base host(s), e.g. `https://api.sameday.ai`;
   - the auth method (an `Authorization: Bearer <token>` from localStorage, or cookies);
   - any third-party services (analytics, fonts/CDNs, an auth provider like Firebase).
3. **Start the proxy.** Run the bundled script once:
   ```bash
   node scripts/local-api-proxy.js --target https://api.sameday.ai --port 5199 --origin http://localhost:5190
   ```
   It forwards every request to the target and adds CORS so the re-host origin is allowed.
4. **Rewrite the API base** in the re-host's JS bundle: replace the API host string
   (`https://api.sameday.ai` or its `api.` base) with `http://localhost:5199`. Do this ONLY for the API base /
   endpoint URL strings; leave fonts, analytics, and asset CDN URLs alone. Confirm the replacement count.
5. **Seed the session** on the RE-HOST origin (localStorage is per-origin, so the live token is not there).
   Load the re-host origin in a headless browser and set the app's auth keys (from the live logged-in
   `localStorage`) into `http://localhost:5190`'s localStorage; reload. Now the copy is already authenticated.
6. **Verify**: the re-host is NOT on `/login`, the app shell renders (company pill, nav/sidebar, screens), and an
   API call reaches the proxy and returns 2xx. Run `scripts/compare-screens.js` at desktop + mobile for the gate.

## Notes & backend inventory (write `notes.md` during scraping)

As you scrape, maintain `notes.md` (in the task dir) so site inspiration is exact and customization is easy:
- **Structure**: the route list (nav `a[href]`), the layout per screen (which screens have a left sidebar/side nav,
  top bar contents, content column width), every dropdown (trigger + items), and the mobile layout (hamburger,
  stacked content, bottom bar).
- **Backends**: API host(s), the endpoints you observe, the auth method (Bearer token key / cookie name), and
  third-party services (analytics, CDN, fonts, auth/payment providers). Note which are proxied vs left remote.
- **Design tokens**: palette, fonts, spacing, radii, radii from `getComputedStyle`.

## Auth caveats (be honest)

- Firebase / SSO idTokens **expire** (~1h). The app may refresh via its auth domain (e.g. `auth.sameday.ai`),
  which is NOT proxied, so after expiry it can sign out. Remedy: re-capture a fresh token, or also proxy the auth
  domain. 
- Cookies on the API host are dropped by the proxy (we strip the `cookie` header); prefer Bearer-token auth.
- The proxy holds the account's session token and exposes it on `localhost` only. Do not expose it publicly.
- Some apps verify the Host/Origin; if a call 403s, also proxy the originating `Origin` header for that host.

## Synthetic Mock Fallback Mode (For 100% Offline / Local Browsing)

When the live API is unreachable, or to avoid reliance on expiring session tokens:
1. Configure `scripts/local-api-proxy.js` to run in mock mode by supplying `mocks.json`.
2. Intercept auth endpoints (`/api/auth/login`, `/api/v1/session`) to return an HTTP 200 with synthetic user profile metadata (`{ id: "usr_1", name: "David Patton", email: "david@itak.live" }`).
3. Intercept core data routes (`/api/conversations`, `/api/campaigns`, `/api/settings`) to return populated synthetic JSON lists matching the captured UI structure.
4. This guarantees that entering any credentials on the local login screen immediately succeeds and lets the user explore the entire app with fully interactive mock data.

