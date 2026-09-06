# Authenticated capture (login required)

When a target sits behind a login, authenticate BEFORE the visual capture phases so every sub-agent works from the logged-in state.

## When to use

- The user supplies a username and password for the site (e.g. `Email: ... pass: ...`), or the site redirects to a login and the user expects the authenticated view cloned.
- Always take credentials from the user (or a credentials vault / env var). Do NOT invent or guess credentials.

## Automated SaaS Login (auth-login.js)

The fastest and most reliable way to log in is using the automated stealth script:

```bash
node scripts/auth-login.js --url "<URL>" --user "<EMAIL>" --pass "<PASSWORD>" --out "<TASK_DIR>/auth/session.json" --mocks "<TASK_DIR>/auth/mocks.json"
```

### What auth-login.js automates:
1. **Multi-step login flows**: Detects if password input is hidden behind a button (e.g. Sameday.ai "Continue with email" button) and clicks it automatically before filling fields.
2. **Cloudflare clearance**: Detects "Just a moment..." and Turnstile checkboxes and solves or clears them via stealth Chrome flags.
3. **Session persistence**: Exports cookies, `localStorage`, and `sessionStorage` into `session.json`.
4. **API payload harvesting**: Intercepts all XHR/Fetch API responses during the login sequence and exports them to `mocks.json` so `local-api-proxy.js` can mock backend endpoints locally.

## Cloudflare Sites & Turnstile Challenges (stealth-browser.js)

If the site is protected by Cloudflare bot management, Turnstile, or Managed Challenges:

1. Run the stealth browser solver:
   ```bash
   node scripts/stealth-browser.js --url "<URL>" --out "<TASK_DIR>/auth/session.json"
   ```
2. If Cloudflare presents an interactive challenge, launch with `--visible`:
   ```bash
   node scripts/stealth-browser.js --url "<URL>" --out "<TASK_DIR>/auth/session.json" --visible
   ```
   Solve the challenge with one click; the script immediately detects the `cf_clearance` and `__cf_bm` cookies and saves them to `session.json`.

## Alternative: Existing User Browser Session (chrome-cdp)

If you are already logged into the SaaS app on your standard desktop Chrome browser:
- Connect directly to your open browser tab using the `chrome-cdp` skill.
- Dump the cookies and `localStorage` directly from the active tab into `<TASK_DIR>/auth/session.json`.
- This bypasses all 2FA, OTP, CAPTCHA, and SSO barriers instantly.

## Persist the session for sub-agents

Each sub-agent may get a fresh browser, so the logged-in cookie does not carry over automatically. Save the session after login and reuse it:

- Playwright: `context = browser.newContext({ storageState: "<TASK_DIR>/auth/session.json" })`.
- For headless Chrome CDP: inject the saved cookies from `session.json` via `Network.setCookie` before navigating.

## Notes and limits

- Authenticating is to read the DESIGN/LAYOUT/tokens and SCREEN STRUCTURE only. NEVER copy real personal data into the clone: replace every real string (name, phone number, address, email, transcript, record) with synthetic placeholder data. The clone shows the real UI/design with made-up sample data.
- Never store or commit secrets. Use the vault / env, and drop the in-memory credential once the auth step finishes.
- Only clone sites you are authorized to access. Use your own or test credentials.
