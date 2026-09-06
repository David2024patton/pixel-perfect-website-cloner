---
name: pixel-perfect-website-cloner
description: Clone a website pixel-identically. For login-gated apps, copy the REAL app so you can log in past the wall (faithful re-host + a local API proxy) when the account is supplied, otherwise a simulated clone with synthetic data. Never copies real personal data. Writes notes.md tracking the site structure and the backends/APIs it uses, and injects a testing toolbar (cache reset, screenshot, view-as-markdown, markup, snapshot) into every clone. Uses an orchestrated 4-sub-agent loop. Use whenever the user wants to clone/replicate a site, get a fully working past-login copy, or copy its design/UI. Invoked as /pixel-perfect-website-cloner <url>.
---

# Website Cloner

Clone a site's look, layout, and behavior so you have a working local version of it. For login-gated apps, build a self-contained local clone: a real-looking UI, a LOCAL login that gets you in, and **synthetic sample data** that looks real but is entirely made up.

**Privacy rule (the hard rule): never copy or embed real personal data.** Real names, phone numbers, addresses, email addresses, call transcripts, customer records, and any user-specific content must NOT be taken from a live account into the clone. Replace all of it with fabricated sample data that looks plausible. The clone is for design/learning/demo purposes and holds no real personal information.

You do NOT hand-build everything yourself in this skill: you dispatch sub-agents and coordinate. The per-agent prompts live in `agents/`; the methodology for each site class lives in `references/`.

## When to trigger

- User names a URL and says "clone this", "make a copy", "copy this site", "mirror this site", "rebuild this".
- User wants a locally-runnable version of a login-gated app, with a login that gets them in and sample data, not just a static picture.
- User wants to copy a site's design/UI or extract its design system.
- User wants (only when they ask) an editable React/Tailwind reimplementation.

Argument = the target URL plus optional credentials, e.g.:
- `/pixel-perfect-website-cloner https://app.example.com Email: user@example.com pass: password123`
- `/pixel-perfect-website-cloner https://app.example.com user:admin pass:secret`
- Or credentials via env vars `BROWSER_USERNAME` / `BROWSER_PASSWORD`.
When credentials are provided, the skill automatically executes `scripts/auth-login.js` to log past the auth wall, bypass Cloudflare challenges, save session tokens to `${TASK_DIR}/auth/session.json`, and capture API responses into `mocks.json`.


## Environment note (ZCode vs. the original)

This skill was authored for Claude Code. Three things are platform-specific here and get mapped as follows:

1. **The command.** Original `/clone-website` is now `/pixel-perfect-website-cloner`. The original command payload is preserved verbatim at `assets/clone-website.md`.
2. **Sub-agents.** The original defines four Claude Code `/agents`. ZCode has no user-defined agent registry, so each phase dispatches a **`general-purpose` Agent** whose `prompt` embeds the instruction body from the matching `agents/*.md` file (see the dispatcher section below).
3. **Browser automation.** The original calls `mcp__playwright__*`. ZCode exposes Playwright under `mcp__plugin_core_playwright__*` when enabled. If those tools are present, use them directly. If not, fall back to the `control-browser` skill (browser-use) for navigation/screenshots and `mcp__node_repl` `evaluate` for computed styles, or `chrome-cdp` for measurement.

## Prerequisites

- A browser-automation path is available (Playwright MCP, `control-browser`, or `chrome-cdp`).
- Network access to the target origin, and a place to save the clone.
- (Optional) a target project directory to write the clone into; if none, create one.

---


## Site types & Universal 100% Fidelity Matrix

Classify the target **first**; it drives every later phase. Set `SITE_TYPE` in `context.md` and read the matching reference before dispatching sub-agents.

| Type | Architecture / Tech Signature | Recommended Deliverable & Strategy |
|---|---|---|
| `standard` | HTML + Tailwind / standard CSS landing pages | `DELIVERABLE=design_copy` (Full React/Tailwind hand-roll OR direct static HTML re-host) |
| `scroll_journey` | Parallax, skrollr, GSAP ScrollTrigger, horizontal wheel tracks | `DELIVERABLE=faithful_rehost` (Real files + original motion JS preserved) |
| `webgl_canvas` | Three.js, PlayCanvas, WebGL shaders, `.glb`/`.ktx2` models, `.wasm` decoders | `DELIVERABLE=faithful_rehost` (Runtime CDP network capture + decoders + raw asset tree) |
| `dynamic_json_api` | Client-rendered SPAs fetching `.json` config/manifests or REST/GraphQL APIs | `DELIVERABLE=fully_functional_copy` (Re-host + `local-api-proxy.js` with `mocks.json` / synthetic backend) |
| `webflow_ix2` | Webflow interactions (`data-w-id`, sticky `.scroll-wrapper`, `spacers.js`) | `DELIVERABLE=faithful_rehost` (Un-gzipped CSS/JS + pristine Webflow JS bundle) |
| `authenticated_spa` | Login-gated SaaS (hashed Vite/Next bundle, SSO/Email wall, `api.` host) | `DELIVERABLE=fully_functional_copy` (Re-host + Local Proxy) OR `simulated_clone` |

`SITE_TYPE=webgl_canvas` when the target uses Canvas/WebGL (Three.js, PlayCanvas, Pixi.js, Babylon.js) with 3D models or WASM decoders (`/vendor/draco`, `/vendor/basis`).
`SITE_TYPE=webflow_ix2` when the target has Webflow IX2 interactions (`data-w-id`, sticky horizontal scroll tracks). Keep original JS pristine to prevent `window.Webflow` from breaking.
`SITE_TYPE=full_site_crawl` when the target has multi-page depth (internal links, docs, blogs, sub-pages). Use BFS crawl with `<path>/index.html` structure so every internal link resolves locally.

### Deliverable (set `DELIVERABLE` in Phase 0)

- `standard` → `DELIVERABLE=design_copy`. Serve the site's real files as a local copy of its design/UI.
- `scroll_journey` → `DELIVERABLE=faithful_rehost` (the real files; its engine drives the motion). If the user prefers a lightweight rebuild, use `react_impl`.
- `authenticated_spa` → 
  * `DELIVERABLE=fully_functional_copy`: Re-host the SPA's real bundle + launch `scripts/local-api-proxy.js` to mock API responses and handle synthetic logins. This produces a 100% pixel-identical local app that lets anyone log in and browse past the wall.
  * `DELIVERABLE=simulated_clone`: A self-contained React/Vite app with a local login component and synthetic sample data (no external backend dependency).
- `react_impl` (ONLY on explicit request) → an editable React/Tailwind reimplementation, still with synthetic data and no real PII.

**Privacy refusal rule:** never bring real personal data into the clone. No real names, phone numbers, addresses, emails, call transcripts, customer records, or user content from a live account. Use made-up sample data that looks plausible. Do NOT bypass a real login to scrape personal data; if login is only needed to see the DESIGN/LAYOUT, capture that and substitute synthetic data everywhere else.

For `authenticated_spa`, read `references/faithful-rehost.md` (its "Authenticated / API-driven SaaS apps" section) plus `references/auth-capture.md` and `references/local-api-proxy.md`.


## Authenticated capture (for design only)

If the target sits behind a login, you may authenticate briefly to capture the DESIGN/LAYOUT/design tokens. You must then REPLACE any real content with synthetic data in the clone. Credentials from a vault/env (`BROWSER_USERNAME`/`BROWSER_PASSWORD`); never guess them.

Security rules (non-negotiable):
- Never write the password into `context.md`, `review-notes.md`, screenshots, or any committed file.
- Never echo or log the password. Use the browser's value/set_value to fill the form.
- If MFA / CAPTCHA appears, stop and ask the user to complete it in the browser; never bypass it.
- After the auth step, persist the session to `TASK_DIR/auth/session.json` for the capture sub-agents (fresh browsers lose the cookie). This session is only for reading the design; no real data is copied into the clone.

What you copy: the UI structure, layout, colors, typography, and behavior. What you do NOT copy: any real content/data. Every real string (name, number, address, transcript, record) is replaced by synthetic sample data.

## Design & style rules

- **No emojis, ever.** Emoji glyphs are never used for UI in a cloned website/app. Use a consistent set of **inline SVG
  line icons** (one icon sprite, `stroke: currentColor`) for nav, buttons, empty states, feature icons, toggles, and status.
- Keep icon weight, size, and color consistent with the app theme; inherit `currentColor` so active/disabled states work.
- Replace every emoji the original uses with an equivalent icon; never keep an emoji as a UI element.
- **Responsive + menus:** capture and reproduce the site's MOBILE layout (e.g. 375x812) as well as desktop, PER PAGE. Reproduce
  every DROPDOWN/MENU (More menu, company/workspace switcher, user/avatar menu, notifications bell, filters) with the same
  trigger, the same items, and the same layout, in BOTH desktop and mobile. Never leave a menu or the mobile layout out.

## The workflow

### Phase 0: Setup

Detect the project type and create the scaffolding.

```bash
DOMAIN=$(echo "$URL" | sed -E 's|https?://([^/]+).*|\1|' | sed 's/www\.//')
TASK_DIR=".tasks/clone-${DOMAIN}"
mkdir -p "${TASK_DIR}/screenshots" "${TASK_DIR}/auth" "${TASK_DIR}/mirror"

cat > "${TASK_DIR}/context.md" << 'EOF'
# Website Clone Task

**Target URL:** <URL>
**Status:** In Progress

---
EOF
```

Detect framework from `package.json` (`"next"`, `"@tanstack/start"`, `"vite"`) and record `TASK_DIR` and the framework.

Run the automated architecture & sitemap detector:
```bash
node scripts/detect-tech.js "<URL>" --out "${TASK_DIR}/tech-report.json"
```
Then classify the site based on `tech-report.json`: set `SITE_TYPE` and `DELIVERABLE` and write them to `context.md`.
If sitemaps are found or the target has multi-page depth, run the sitemap crawler to mirror all sub-pages:
```bash
node scripts/crawl-sitemap.js --url "<URL>" --out "${TASK_DIR}/rehost" --routes "${TASK_DIR}/routes.json"
```
For dynamic WebGL/WebGPU/3D/motion targets, run the headless network harvester to capture runtime assets and verbatim text:
```bash
node scripts/network-capture.js --url "<URL>" --out "${TASK_DIR}/mirror" --copy "${TASK_DIR}/copy.md"
```

If `SITE_TYPE=scroll_journey` or `authenticated_spa`, append a pointer to `references/faithful-rehost.md` (plus `references/scroll-journey.md` for the former, `references/auth-capture.md` for the latter).

Then detect auth: if the user supplied credentials, set `AUTH=user_pass` and write `TASK_DIR/auth/` to `context.md` as the session location; do not write the credential values to disk. Credentials are OPTIONAL: they are only needed to read the design/layout, not to build the clone.


### Phase 0.5: Automated SaaS Login & Cloudflare Clearance

If `AUTH=user_pass` or the site requires login:
1. Run the automated stealth auth harvester:
```bash
node scripts/auth-login.js --url "<URL>" --user "<EMAIL>" --pass "<PASSWORD>" --out "${TASK_DIR}/auth/session.json" --mocks "${TASK_DIR}/auth/mocks.json"
```
2. If the site is protected by Cloudflare Turnstile or Managed Challenges:
```bash
node scripts/stealth-browser.js --url "<URL>" --out "${TASK_DIR}/auth/session.json"
```
Once `session.json` is populated, subsequent phases load it as their browser storageState (`cookies`, `localStorage`, `sessionStorage`).

Dispatch a `general-purpose` Agent that reads `references/auth-capture.md`:

```text
You are the design-capture agent. <embed the body of references/auth-capture.md>
Target URL: <URL>        (the live origin, NOT a localhost server)
Task folder: ${TASK_DIR}
Storage state: ${TASK_DIR}/auth/session.json
Verify the login succeeded and that the app dashboard is visible.
Capture the app's DESIGN/LAYOUT/tokens and its SCREEN STRUCTURE (nav items, screens, components).
If MFA / CAPTCHA appears, solve it or ask the user to complete it in the visible window.
IMPORTANT: you are capturing DESIGN ONLY. Real names, numbers, addresses, transcripts, and records must be
noted as synthetic placeholders (e.g. "CUSTOMER_NAME", "CALLER_ID") in context.md, NOT copied as real values.
```

Wait for completion before Phase 1.



### Phase 1: Capture the design (screenshotter)

Dispatch the **screenshotter** sub-agent. It captures the site's layout/design and, for login-gated apps, enumerates every screen's structure so the clone can reproduce it. It does NOT capture real data as content to embed.

```text
You are the website-screenshotter agent. <embed the body of agents/website-screenshotter.md>
Target URL: <URL>
Task folder: ${TASK_DIR}
Screenshot output: ${TASK_DIR}/screenshots/
Context file: ${TASK_DIR}/context.md
Capture full pages at 1920x1080, 1024x768, 375x812; each section individually;
key components with hover states; any animations/interactive elements.
Then update context.md with the screenshot inventory.

If SITE_TYPE=scroll_journey: read references/scroll-journey.md and follow its capture checklist
(hook frame, each world full-viewport, in-world vertical states for parallax, pager, SCROLL TO BEGIN, desktop-gated fallback).

If AUTH=user_pass: load ${TASK_DIR}/auth/session.json as the browser context storageState before navigating so the
capture reflects the logged-in design. Never write credentials or real personal data into context.md.

If SITE_TYPE=authenticated_spa: enumerate EVERY screen behind the login (nav item per screen), and record each screen's
STRUCTURE (component layout, sections, fields, columns, controls) plus the design tokens AND its LAYOUT SIGNATURE:
whether it has a LEFT SIDEBAR / side nav, the sidebar width, the main content width, and the top-bar nav labels.
Pages DIFFER: some have a left sidebar, some do not. Capture each page's own layout, not one shared shell.
For ALL types, also capture: the MOBILE layout (375x812) of each page, and every DROPDOWN/MENU in its OPEN state (More menu,
company/workspace switcher, user/avatar menu, notifications bell, filters) - screenshot each open menu and record its items.
Capture each screen's visual
layout as screenshot + a STRUCTURE note (what data fields exist), using placeholders like CUSTOMER_NAME / CALLER_ID /
COMPANY_NAME instead of real values. Write the screen inventory + structure + tokens to context.md.
```

Wait for completion before Phase 2.

### Phase 2: Extract design tokens + assets (extractor)

Dispatch the **extractor** sub-agent (`agents/website-extractor.md`). It mirrors the real UI assets (images, fonts, CSS, JS) and records the design system in `context.md`. It does NOT carry real personal data.

```text
You are the website-extractor agent. <embed the body of agents/website-extractor.md>
Target URL: <URL>
Task folder: ${TASK_DIR}
Context file: ${TASK_DIR}/context.md
Mirror the site's real assets (images, videos, SVGs, fonts, CSS, JS) into ${TASK_DIR}/mirror/, preserving paths.
Extract exact colors, fonts, sizes, weights, spacing, radius, shadows, animations, and component structure.
Document asset paths and the design tokens in context.md.
CRITICAL ANTI-AI-SLOP REQUIREMENT: Extract the site's complete VERBATIM text copy from the live DOM (headings,
paragraphs, badges, buttons, pricing, disclaimers, FAQ items, and footer links) into ${TASK_DIR}/copy.md. Never allow
the cloner agent to guess, hallucinate, or write placeholder filler.
Also write notes.md to ${TASK_DIR}/: the SITE STRUCTURE (route list, per-screen layout incl. which screens have a left
sidebar and which do not, the mobile layout, every dropdown + its items) and the BACKEND INVENTORY (API host(s), observed
endpoints, auth method, third-party services like analytics/CDN/fonts). This makes the site exact and easy to customize.

If SITE_TYPE=scroll_journey: read references/scroll-journey.md and also capture the SCROLL MECHANIC
(wheel/scroll wrapper, axis mapping, world count/order, pager, per-layer parallax ranges and z-index, palette).

If AUTH=user_pass: load ${TASK_DIR}/auth/session.json as the context storageState before navigating. Do NOT copy
real personal data into context.md or the mirror; only design tokens, layout, and assets.
```

Phases 1 and 2 can run in parallel. Wait for both before Phase 3.


### Phase 3: Build the clone (cloner)

Dispatch the **cloner** sub-agent (`agents/website-cloner.md`). Its job depends on `DELIVERABLE`; for `simulated_clone` it builds a self-contained local app with a local login and synthetic data.

```text
You are the website-cloner agent. <embed the body of agents/website-cloner.md>
Task folder: ${TASK_DIR}
Screenshots: ${TASK_DIR}/screenshots/
Mirrored assets/files: ${TASK_DIR}/mirror/
Design tokens + structure: ${TASK_DIR}/context.md
Verbatim copy: ${TASK_DIR}/copy.md
Review notes (if present): ${TASK_DIR}/review-notes.md

DELIVERABLE=design_copy: serve the mirrored real files so the copy is the site's design, locally.

DELIVERABLE=faithful_rehost: serve the site's own files + complete asset tree (see references/faithful-rehost.md),
so the real motion/behavior runs. Keep bundled JS byte-for-byte pristine. Decompress any gzipped CDN files.

DELIVERABLE=simulated_clone (authenticated_spa): build a SINGLE self-contained app (React/Tailwind, or a static
HTML/CSS/JS bundle) with:
  - a LOCAL login page that accepts ANY credentials (or a "Enter demo" button) and logs in client-side,
    with NO real backend call;
  - the REAL UI/design/layout structure you captured (top bar, nav rail, every screen, components, sizes, colors, fonts);
  - build EACH screen per its OWN captured layout signature (1:1 per page): pages that have a left sidebar keep it; pages
    that do not, must NOT show one. Do not apply one shared shell to every screen. Left sidebar width and main content
    width must match the live page;
  - SYNTHETIC sample data in every field: made-up names, phone numbers, addresses, emails, table rows, chat/transcript
    text, and statuses. Must look plausible and realistic.

HARD RULE (ANTI-AI-SLOP): Use VERBATIM text from copy.md. Never hallucinate marketing copy, never use "lorem ipsum",
and never invent generic filler ("in today's fast-paced world", "cutting-edge", "elevate").
HARD RULE (ZERO TRUNCATION): If a section has 12 items, 8 testimonials, or 25 logos, implement all of them.
Never truncate lists or write comments like {/* remaining items */}.
HARD RULE: no real personal data. Use placeholder generators (fake names, www./fictional addresses, US-style fake
phone numbers like (555) xxx-xxxx, plausible but invented content). Do not embed anything captured from a real account.
HARD RULE: no emojis. Never use emoji glyphs (e.g. U+1F4F1 phone, U+1F50D magnifier, U+1F4CC clipboard) anywhere in the
clone. Use a consistent set of inline SVG line icons (one icon sprite, stroke currentColor) for nav, buttons, empty states,
feature icons, toggles, and status. Replace any emoji the real site uses with an equivalent icon.

DELIVERABLE=fully_functional_copy (authenticated_spa + creds): re-host the real files, run scripts/local-api-proxy.js
--target <apiHost> --port <proxyPort> --origin <rehostOrigin>, rewrite the re-host's API base host to the proxy, seed the
app's session (localStorage/cookies) on the re-host origin, and verify it is past /login (see references/local-api-proxy.md).
This is the pixel-identical, fully functional copy.

HARD RULE (FULL SUBROUTE & MENU DEPTH):
1. Never stop at top-level navigation bar links. Expand and crawl every single dropdown, nested submenu, and More menu item.
2. Harvest subroute actions and wizards (e.g. /campaigns/new, /agents/create, modal drawers, step wizards).
3. Record and mock master-detail click interactions: clicking table rows, chat threads, or list items must load the detail view, right navigation drawer, or inspector panel with realistic synthetic data.
4. Scan code-split bundles: recursively parse all dynamic `import(...)` and chunk specifiers across all mirrored .js files to ensure 100% of chunk files are downloaded locally to prevent "Failed to fetch dynamically imported module" runtime crashes.
5. Capture non-standard root API endpoints: client bundles often make API calls to root endpoints (e.g. `/workflow-templates/`, `/prompt-sections/`, `/activity`, `/voices/`) rather than standard `/v1/` or `/api/` prefixes. Ensure the local proxy server intercepts these routes and returns valid JSON mock responses instead of falling back to the SPA `index.html`.

ALWAYS: inject the TESTING TOOLBAR into every clone (and any site this skill produces). Copy
scripts/testing-toolbar.js next to the clone and add <script src="scripts/testing-toolbar.js"></script> before </body>.
It adds a white top bar with: Cache Reset (clears storage + reloads), Screenshot, View as Markdown (dumps the page text
as markdown), Markup (draw directly on the screen), and Snapshot (saves the page + markup as a PNG). RULES: no emojis
(text-only buttons); the markup lives only on an in-memory canvas and is NEVER persisted or saved unless the user clicks
Snapshot. This gives every clone a shared test harness so screens can be annotated and shown to the AI agents.
```

Wait for completion.


### Phase 4: QA review (qa-reviewer)

Dispatch the **qa-reviewer** sub-agent (`agents/website-qa-reviewer.md`). It opens the clone and verifies the UI/behavior matches and that no real personal data was used.

```text
You are the website-qa-reviewer agent. <embed the body of agents/website-qa-reviewer.md>
Original: <URL>
Clone: the built clone (serve it and open the clone URL)
Screenshots: ${TASK_DIR}/screenshots/
Copy reference: ${TASK_DIR}/copy.md
Output: ${TASK_DIR}/review-notes.md
Compare the clone vs the original design: layout, typography, colors, spacing, shadows, animations at all viewports.
Verify assets load, every screen is present, the local login works, and there are no console errors.
Classify discrepancies Critical > Major > Minor.

ANTI-AI-SLOP & PARITY AUDIT:
1. Scan clone text against copy.md: verify headlines, paragraphs, and buttons are verbatim.
2. Grep for AI clichés ("fast-paced", "elevate", "cutting-edge", "game-changer", "lorem ipsum"). Any hit = CRITICAL reject.
3. Element count parity: count cards, poses, logos, FAQ items; verify 0 truncation.
4. Console & Network audit: verify 0 console errors and 0 asset 404s (images, fonts, scripts, audio, wasm).
5. Subroute & Wizard audit: verify every action subroute (e.g. "Create Campaign", step-by-step wizards, modals) opens cleanly with 0 error boundaries ("Uh-oh! Something went wrong").
6. Master-Detail Click interaction audit: clicking items in master lists/tables must trigger selection states and display the corresponding detail drawer/inspector with synthetic data.

FINAL 1-TO-1 VISUAL & CODE VERIFICATION GATE:
Run the comprehensive verification engine:
```bash
node scripts/verify-1to1.js --live "<liveBase>" --local "<localBase>" --routes "${TASK_DIR}/routes.json" --out "${TASK_DIR}/comp" [--session "${TASK_DIR}/auth/session.json"]
```
This performs:
1. **Visual Pixel Diffing**: Native canvas pixel diff producing `diff-<route>.png` with highlighted mismatches and an exact Match Percentage (target: >= 95%).
2. **Interactive HTML Split-Slider**: Generates `${TASK_DIR}/comp/compare-viewer.html` allowing side-by-side split slider dragging between live and clone.
3. **DOM Code & Tag Parity**: Checks 100% element count match across images, SVGs, buttons, links, inputs, and headings.
4. **Computed Style Matching**: Audits background colors, text colors, font families, and container widths.
5. **Structural Layout & Menus**: Runs `scripts/compare-screens.js` across both desktop (1440x900) and mobile (375x812) to verify sidebars and open menu states.
STATUS RULE: Visual match < 90%, any missing items, or style discrepancies = NEEDS_WORK.


If SITE_TYPE=scroll_journey: verify the BEHAVIOR on the clone (world travel, parallax, pager, gating) moves like the original.

If SITE_TYPE=authenticated_spa: verify (1) the local login gets you into the app with no real backend, (2) every screen
is present and navigable, (3) the UI/design matches the captured layout, and (4) ALL data is SYNTHETIC: scan for any
real-sounding names, phone numbers, addresses, emails, or transcript text. If any real personal data is present, flag it
as CRITICAL and set NEEDS_WORK.

PRIVACY CHECK: grep the clone for real personal data patterns (full names, real phone/address formats, real emails).
Any match is a Critical issue. The clone must contain only fabricated sample data.

STYLE CHECK: scan the clone for emoji glyphs / emoji codepoints. Any emoji is a Critical issue: replace it with an inline
SVG icon (no emojis, only icons) and set NEEDS_WORK.
```


Wait for completion and read `review-notes.md`.

### Phase 5: Iterate

Read the status in `${TASK_DIR}/review-notes.md`:

- **PERFECT** → done. Emit the completion summary.
- **ACCEPTABLE** → ask the user to accept or continue refining. Continue = back to Phase 3.
- **NEEDS_WORK** → back to Phase 3.

Max 5 iterations. After 5, stop and report the residual issues and where the clone lives.

## Dispatching a sub-agent

ZCode executes sub-agents through the **Agent tool**, not Claude Code's `Task`. For each phase:

1. Read the matching `agents/<name>.md` file to get the instruction body (skip its Claude Code frontmatter: `name`, `description`, `tools`, `model`, `color`).
2. Launch a `general-purpose` Agent with:

```
description: <one-line phase, e.g. "Capture website screenshots">
subagent_type: general-purpose
prompt: <the agent body> + <the phase-specific target/paths/output described above>
```

3. Give the sub-agent the full task-folder path, tell it to read `context.md` first, and to update `context.md` with its output. Always include `SITE_TYPE` and `DELIVERABLE`. When `scroll_journey`, hand it `references/scroll-journey.md`; when `authenticated_spa`, hand it `references/faithful-rehost.md` + `references/auth-capture.md`. Emphasize the privacy rule in every dispatch for a login-gated app.

Keep prompts self-contained: a sub-agent cannot see this conversation.


## Output structure

```
<clone dir>/
├── <mirrored site files>      # the real design/UI assets (for design_copy / faithful_rehost)
├── index.html + bundle        # for simulated_clone: local login + app with SYNTHETIC data
├── .tasks/clone-{domain}/
│   ├── context.md             # site type, deliverable, design tokens + screen structure
│   ├── screenshots/           # visual references
│   ├── auth/session.json      # design-capture session (never committed, no real data copied)
│   └── review-notes.md        # QA findings + STATUS (incl. privacy check)
```

For `react_impl` (explicit request only), additionally the single component file (e.g. `app/clone/page.tsx`) plus Tailwind/motion.

## Tech decisions (summary)

- **Copy the design/UI faithfully**; for login-gated apps deliver a **simulated clone** (local login + synthetic data).
- **Privacy is absolute:** no real personal data in the clone; use fabricated, plausible sample data. The QA reviewer greps for real-person data and fails on any hit.
- **`faithful_rehost`** for scroll-journey / high-motion / Webflow / SPA / WebGL / PlayCanvas sites: `references/faithful-rehost.md` (asset completeness, gzip-decompress rules, keep bundled JS pristine, CDP verification).
- **Design tokens + screen structure** for `simulated_clone`: `references/auth-capture.md` (design-only capture) + `references/faithful-rehost.md`.
- **`react_impl`** (only on explicit ask) uses Tailwind CSS + motion, still synthetic data.

## Error handling

| Situation | Response |
|---|---|
| Site requires login, no creds given | Optional: proceed to build the simulated clone from the public/screen structure; if design capture is needed, ask for creds |
| Login needs MFA / CAPTCHA | Stop; ask the user to complete it in the browser; never bypass it |
| Bot protection / automation blocked | Stop; suggest a manual design capture |
| Real personal data present in the clone | CRITICAL; strip it and regenerate with synthetic data before finishing |
| Sub-agent fails | Retry once with more specific instructions, then report |
| Max iterations reached | Stop, hand over the partial clone and residual issues |

## Troubleshooting

- **Sub-agent prompts not found** → confirm `agents/website-screenshotter.md`, `website-extractor.md`, `website-cloner.md`, `website-qa-reviewer.md` all exist.
- **Clone only shows login and won't get in** → you're serving the real re-host; for a login-gated app use `simulated_clone` (a local login that accepts anything, no real backend).
- **Real data leaked into the clone** → the capture step copied live values; replace them with synthetic placeholders and re-run the QA privacy check.
- **Infinite loop** → the QA reviewer must write a `STATUS` line; stop after 5 iterations.

## Faithful copy (re-host): when to use it

For scroll-journey / high-motion / Webflow / SPA / WebGL / PlayCanvas targets, the only way to be faithful to the MOTION is to copy the site's real files and serve them. Mirror the page(s), all CSS, all JS, fonts, and the COMPLETE image/partial/audio tree (including assets referenced from JS strings), then serve it. An incomplete mirror is the usual cause of a stuck loader, blank modals, and dead scroll. Full guide: `references/faithful-rehost.md`. For login-gated apps, do NOT rely on a bare re-host (it stops at the login wall): build the `simulated_clone` with a local login and synthetic data instead.
