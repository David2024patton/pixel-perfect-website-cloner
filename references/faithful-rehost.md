# Faithful self-hosted re-host (the fallback when real motion cannot be hand-rolled)

## When this applies

A `scroll_journey` / high-motion site whose animation is driven by its OWN JavaScript library
(skrollr, GSAP ScrollTrigger, a custom directional wheel handler) operating on hundreds of
individually-positioned SVG/canvas layers. `defeatboco.com` is the canonical case: `script.min.js` is
**skrollr**, the journey is a `width:200rem` horizontal track transformed by a custom wheel handler, and
the scenes are dozens of layered `.world__*` elements.

Here a React/Tailwind single-component clone CANNOT reproduce the motion: you would be re-implementing a
bespoke engine. If the user keeps rejecting the hand-rolled clone ("it's static, it has no motion"), the
correct move is to **switch to a faithful re-host**: serve the site's own HTML/CSS/JS/assets locally. It
runs the genuine code, so the motion and every interaction are authentic. This is almost always the ONLY
way to be pixel AND motion perfect on this class of site.

## Approach

1. Save the original pages verbatim: `index.html` (splash) and `worlds.html` (journey).
2. Mirror the COMPLETE asset tree under `assets/`, preserving relative paths.
3. Serve statically and open it, e.g. `python3 -m http.server 5180` inside `<rehost>/` ->
   `http://localhost:5180/`.

## Reference implementation

The working crawler lives at `G:\Business\defeatboco-clone\.tasks\clone-defeatboco.com\raw\`
(`fetch_all.py`, `fetch_scenes.py`, `fetch_quiz.py`) and produced a 657-file re-host. Pattern:
crawl the 2 HTML pages + `style.min.css` + **the site's JS files** for `assets/...` refs, resolve CSS
`url(...)` relative to the css dir, then download each asset from the live origin into `<rehost>`
preserving the path.

## Asset completeness checklist (skipping ANY item breaks the site)

- `assets/css/*.css` and `assets/js/*.js` (every JS the pages load).
- `assets/font/*` (woff2/woff/ttf/eot).
- `assets/img/**`: ALL images, including ones referenced ONLY from scene partials and CSS backgrounds.
- `assets/html/world-*/scene-*.html`: the scene partials the JS AJAX-loads as you scroll. Many
  scene-name x world combos 404 by design; download the ones that exist.
- `assets/html/world-*/parts/*.html`: quiz/modal content partials loaded via AJAX.
- `assets/sounds/**/*.mp3`: audio; **filenames often contain spaces**, so handle `%20`/raw spaces.
- External embeds (Wistia video), GTM, and analytics stay remote: that is fine.

## Symptom -> cause map

| Symptom on the re-host | Root cause |
|---|---|
| Stuck loader (spinner forever) | A scene partial the loader preloads 404s. The loader counts AJAX successes (e.g. `quantityBlock`), so a 404 means it never reaches 0. Mirror ALL initial scene partials. |
| Modal opens as a blank white box | The modal's content is AJAX-loaded (e.g. `quiz-questions.html`); that partial is missing. |
| Scene-art layers blank | Images referenced only from scene partials or CSS `background` were not mirrored. |
| A reveal that should animate stays hidden | Compare the same computed state on the LIVE site first: sometimes `opacity:0` on both is the intended later reveal, not a regression. |

## Verification (headless Chrome CDP)

The model may not reliably view screenshots, so verify with CDP `Runtime.evaluate` + network capture
(launch `chrome --headless=new --remote-debugging-port=9223`, talk via Node `fetch`/`WebSocket`):

- Loader clears: read `.loading` computed `display`/class: must not be stuck with `active`/opacity 1.
- Network parity: capture `Network.requestWillBeSent`/`responseReceived` and confirm the initial scene +
  `parts/*` partials return non-4xx.
- Behavioral parity: load the LIVE site and compare a computed style / class state; if both sides show
  the same value (e.g. a `menu` staying `opacity:0` after the intro), it is NOT a regression.
- CAUTION: a synthetic `WheelEvent` / `window.scrollTo` does NOT drive skrollr or a scroll-jacked custom
  container: do not use them to "prove" scrolling works. Verify world-travel by clicking the site's own
  nav/pager handlers and reading the track `transform`.

## Re-host vs React-clone decision (run this before Phase 1)

- If the target's motion is bespoke (skrollr/GSAP/scroll-jack/tons of layered SVG) AND the user cares about
  motion fidelity over owning the code -> use the faithful re-host. Say so explicitly; don't burn cycles
  hand-rolling a React component that cannot match it.
- If the user specifically wants a portable React codebase -> it will be an approximation; set that
  expectation and keep the re-host as the reference for pixel/motion parity.

## Webflow-specific gotcha (spacers.wannathis.one, 2026-09-05)

Webflow sites bundle the **Webflow IX2 runtime inside their exported JS** (often a single `spacers.js` /
`webflow.js`). That runtime **initializes only if its original asset/domain URLs are intact**: if you blanket
rewrite `https://cdn/...` -> `../` across ALL files, the bundled JS can fail to spawn `window.Webflow`, silently
killing every scroll interaction (horizontal side-scroll, scroll-jack parallax).

Rule: rewrite CDN absolute URLs to local only in **HTML and CSS**; leave the site's bundled **JS byte-for-byte
pristine** (keep its original URLs). The horizontal-scroll symptom is `.scroll-content` (or a `.poses` /
sticky `.scroll-wrapper` inside a tall `section-*`) staying `transform: none` while the live site's translates.
Fix = restore the original (unrewritten, gzip-decompressed) js file.

Also: mirror `webflow.css`, `normalize.css`, all site css, and gzip-decompress every css/js (CloudFront gzips
them; serving raw gzip as text yields a corrupt 4KB "css" that silently breaks layout).

## How to DETECT a Webflow IX2 / scroll-jack site (what to look for, before Phase 1)

Run these on the live page (curl the HTML + read it; then confirm at runtime with CDP):

- **HTML markers:** classes `wf-section`/`wf-page`, many `data-w-id="..."` attributes, `data-wf-page`.
- **Scripts:** the site loads a bundled JS named `spacers.js` / `webflow.js` (Webflow export). It usually does
  NOT load webflow.js separately: the runtime is bundled into that one file. Confirm `window.Webflow` is truthy
  after load (if false, interactions never run).
- **Scroll-jack structure:** a very tall `section-*` (e.g. 6000px+) containing a `position:sticky` wrapper
  (`.scroll-wrapper`) with `overflow-x:hidden`, and an inner `.scroll-content` holding a wide flex strip
  (`.poses`, each item `min-width:30-50vw`). As you scroll, `.scroll-content` translates X (this is the
  horizontal side-scroll). `<video>` embeds are common in the scroll sections.
- **Broken-interaction symptom:** the horizontal strip's computed `transform` stays `none` at every scroll
  position while the live site's translates X (e.g. `-890 -> -2041 -> -2732` at increasing scrollY).

## Hard rules for Webflow re-hosts

1. **gzip-decompress every `.css` and `.js`** you mirror: CloudFront gzips them; serving raw gzip as text yields
   a tiny corrupt file (a "css" of ~4KB) that silently breaks layout and the horizontal scroll.
2. **Leave the bundled JS byte-for-byte pristine** (its ORIGINAL URLs intact). Do NOT blanket-rewrite
   `https://cdn/...` -> `../` in the JS: the Webflow runtime will not initialize without its original URLs, so
   `window.Webflow` stays undefined and every scroll interaction dies. Rewrite CDN URLs to local only in
   **HTML** (`assets/`) and **CSS** (`../`).
3. After mirroring, verify `window.Webflow === true` and that the horizontal strip translates X on scroll
   before calling it done.

## Framework-SPA / WebGL re-hosts (why.zero.university, 2026-09-05)

A modern framework SPA (Vite/React/Next, hashed `main-*.js`/`main-*.css`) is a baked production build: the
faithful re-host = serve that build. Detect via: tiny `<body>` with an empty shell (`#root`/`#ui-container`),
`<script type="module" crossorigin src="/assets/main-<hash>.js">`, `canvas`/WebGL refs, a `webgl-loader-overlay`.

Steps: mirror `index.html` + `/assets/*` (js/css/images/fonts), then **capture the runtime network requests**
(the JS builds asset paths dynamically, e.g. `'/assets/atlases/'+name+'.ktx2'`, so static regex misses most of
them). Load the live site, scroll through, and log every `requestWillBeSent` URL; download each. Then:

- **`/vendor/` decoders are REQUIRED**: three.js GLTF/DRACO loads `.glb` via
  `/vendor/draco/{draco_wasm_wrapper.js,draco_decoder.wasm}`, and KTX2 textures via
  `/vendor/basis/{basis_transcoder.js,basis_transcoder.wasm}`. If these 4 are missing, every model/texture
  fails with `[AssetLoader] "x" failed (try 1/4)... fetch for "<origin>/vendor/draco/..."`: the WebGL canvas
  renders but the 3D content is blank. Symptom -> mirror the vendor files.
- Verify the WebGL context actually starts: `document.querySelector('canvas')` has size and
  `canvas.getContext('webgl/webgl2')` returns truthy, `window.Webflow`/framework booted, and ZERO
  `[AssetLoader] failed` warnings in the console.
- Some content assets (company/tool logos, origami, stage-specific atlases) load only on deep interaction:
  mirror the ones enumerated from the JS and note the rest as follow-up if the user interacts and sees gaps.

## PlayCanvas WebGL experiences (lr.doesbook.kr, 2026-09-05)

Detect: boots via `__start__.js` / `__settings__.js` / `__loading__.js` / `__modules__.js` + `playcanvas-stable.min.js`,
a `SCENE_PATH` (e.g. `1458494.json`), `PRELOAD_MODULES` with `Ammo` + `BASIS` wasm, and a `files/assets/<id>/<rev>/<file>`
asset tree (config.json + scene references). Faithful re-host = copy all boot files + `config.json` + scene + the whole
`files/assets/` tree.

Gotchas:
- **Assets have URL-encoded spaces / special chars** (`Kyobo%20Handwriting%202019.png`, audio like
  `[4. 29-1]...mp3`, `'!'` in names). A static regex that stops at spaces truncates them -> 404. Save files with the
  **decoded** name (server resolves `%20` requests). ALSO mirror the **`__game-scripts.js`** bundle (the game logic),
  which is not in config.json.
- The only reliable way to get every URL (encoded names, lazy assets, `__game-scripts.js`) is a **runtime network
  capture**: load the live site, log every `requestWillBeSent`, decode + download each.
- Verify: `window.pc` truthy, `canvas` has size + WebGL, and ZERO console errors (the PlayCanvas app logs
  `Error loading Texture/Audio from: <url>` per missing asset).

## Authenticated / API-driven SaaS apps (app.sameday.ai, 2026-09-05)

A login-gated React/Vite SPA (hashed `index-*.js/.css`, `api.` calls, SSO + email/password) is a DIFFERENT case:
a plain re-host shows only the login wall, because the content needs the backend API + an auth session. The correct
deliverable is a **simulated clone**: reproduce the real UI/design/layout as a self-contained local app, with a LOCAL
login that lets anyone in (no real backend), and **synthetic sample data**.

**Privacy rule:** never copy real personal data. If you log in (your own test account) to read the design/layout, capture
only the layout, design tokens, and screen STRUCTURE. Replace every real string (names, phone numbers, addresses, email
addresses, transcripts, customer records) with fabricated placeholder data in the clone. No real personal data is stored.

### Steps to read the design (login, then capture structure)

- Probe the login. Click the EXACT "Continue with email" BUTTON (a `button[type=submit]`): it reveals
  `input[name=email]` + `input[name=password]` and a "Log in" submit. Do NOT click "Continue with Google / Outlook"
  (those trigger SSO and fail in automation).
- Fill the email + password, click "Log in", and wait for the app shell (e.g. URL becomes a company-scoped `/home`).
- Navigate each route (read the nav `a[href]` slugs, e.g. `/{company}/conversations`, `/campaigns`, `/coach`, `/phone`)
  and capture the screen STRUCTURE + design tokens (`getComputedStyle`) + a screenshot per screen, noting data fields as
  placeholders (CUSTOMER_NAME, CALLER_ID, COMPANY_NAME).

### Distinction to remember

**re-host** = serve the site's real files byte-for-byte (for motion/scroll sites);
**simulated clone** = login-gated API apps, where you reproduce the UI with a local login and synthetic data, never real PII.

## Multi-page / full-site re-host (browseable local site)

A target is usually MORE than one page. To make the re-host "fully working minus backend" so you can browse
around, **crawl the whole site, not just index.html**:

- BFS from `/`, following internal `href`s (skip asset extensions: css/js/png/webp/svg/woff2/video, and external
  hosts/E-mail/tel/#/`//`). Save each page as `<path>/index.html` (so `/pricing/` works via the static server's
  directory index). Cap at a sane page count if the site is huge (blog SEO sites can be 100+ post pages).
- Reuse the SHARED assets (css/js/fonts/img) already mirrored; additionally download any NEW asset referenced by a
  crawled page, and add newly-discovered internal page links to the queue.
- Note path gotchas up front: mirror the REAL asset base (sameday.ai uses `/media/img/...`; a naive crawl matched
  the `/img/` substring and 404'd). The runtime network capture gives the true asset URLs.
- Serve with the static server pointing at the rehost dir; each page links to the others because the same relative
  paths + directory-index layout are preserved. Verify a few deep pages (title + h1 + images load + interlink count +
  0 console errors) before declaring done: this is the sameday.ai pattern (120 pages, ~454 files).

This is the "identical minus backend + all pages linked" deliverable the user asked for.

## Serve each clone on its own subdomain (no localhost ports)

Don't leave clones on `localhost:PORT`. On a server with Docker/Dokploy (or any reverse proxy like Traefik/Caddy),
deploy each clone as its OWN static-file container and give it a subdomain. Add to the skill so it's automatic:

1. Each clone = a static dir (the `rehost/` folder). Containerize it as a tiny static server
   (nginx serving that dir, or `python3 -m http.server` in a container) -> one container per clone.
2. Point a dedicated subdomain at it through the reverse proxy: `sameday-mkt.<root>`, `spacers.<root>`,
   `kakao.<root>`, `zero.<root>`, etc. Traefik/Dokploy label or Caddy file per app.
3. The clone dirs are self-contained (relative `assets/`, `/media/img/`, `/_astro/` paths), so any static server
   + subdomain works with zero path rewrites.
4. Record each clone's URL + subdomain + container name in memory, so you can open it from anywhere, not just localhost.

This is the "each clone gets its own subdomain" deliverable. (Full-site clones: an Astro/multi-page re-host that serves
`<path>/index.html` needs the container to fall back to directory index, which nginx does by default.)

## Universal 100% Fidelity Protocol (WebGPU, WebGL, Spline, Rive, WASM, Sitemaps)

To guarantee a **100% exact local clone** for ANY site regardless of tech stack:

1. **Automated Pre-flight Detection**:
   - Always run `node scripts/detect-tech.js "<URL>"` to inspect headers, frameworks, 3D engines, and sitemaps.

2. **WebGPU, WebGL & 3D Engines (Three.js, Babylon.js, PlayCanvas, Spline, Rive)**:
   - **Runtime Network Capture**: Always execute `node scripts/network-capture.js --url "<URL>" --out "<mirror_dir>"` to catch dynamically loaded binary assets:
     * 3D scenes: `.glb`, `.gltf`, `.splinecode`, `.riv`, `.lottie`, `.json`.
     * Texture atlases: `.ktx2`, `.basis`, compressed `.dds`/`.pvr`.
     * Engine decoders: `/vendor/draco/`, `/vendor/basis/`, `Ammo.js`, `__game-scripts.js`.
     * Audio and video: `.mp3`, `.wav`, `.mp4`, `.webm`.
   - **WebGPU Shaders**: If the site uses WebGPU, preserve `.wgsl` shader files and serve with appropriate CORS and MIME headers.

3. **Flutter Web & WebAssembly (WASM) Applications**:
   - Flutter web sites render to an HTML5 Canvas via `canvaskit.wasm`.
   - Mirror `flutter.js`, `main.dart.js`, `canvaskit/canvaskit.wasm`, and `assets/FontManifest.json`.
   - The entire app executes on the client canvas once CanvasKit is mirrored.

4. **Webflow IX2, Parallax & Scroll-Jack Engines (Skrollr, GSAP ScrollTrigger, Lenis)**:
   - **Decompress Gzip**: CloudFront and CDNs serve gzipped `.css` and `.js`. Always inflate responses so raw text is written to disk.
   - **Keep Engine JS Pristine**: Never run blanket regex string replacements over `webflow.js` or `spacers.js`. If engine JS internal domain strings are mutated, `window.Webflow` fails to instantiate and scroll transforms freeze.

5. **Client-Side JSON APIs, Manifests & Local Mock Proxy**:
   - Inspect all `.json` configuration files (i18n translations, animation JSON Lottie definitions, app manifests).
   - For authenticated or API-driven apps, run `scripts/local-api-proxy.js` with `mocks.json` so client-side fetch calls resolve cleanly.
   - **Root API Interception**: SaaS SPA frontends frequently issue requests to non-standard root routes (e.g. `/workflow-templates/`, `/prompt-sections/`, `/activity`, `/voices/`) instead of standard `/v1/` or `/api/` paths. The proxy must intercept these root endpoints and serve mock JSON payloads rather than falling back to the SPA `index.html`.

6. **Sitemap Discovery & Deep Multi-Page Mirroring**:
   - Always run `node scripts/crawl-sitemap.js --url "<URL>" --out "<rehost_dir>"`:
     * Discovers `robots.txt` and `sitemap.xml` (including recursive sub-sitemaps).
     * Falls back to recursive BFS crawl of all internal links if sitemap is absent.
     * Saves every sub-page as `<path>/index.html` (e.g. `/features/phone-system` -> `/features/phone-system/index.html`).
     * Produces `routes.json` mapping every single internal route for automated verification with `compare-screens.js`.

7. **Code-Split Chunk Mirroring & Recursive Import Scanning**:
   - Modern Vite/Webpack SPAs use dynamic `import("./chunk-name.js")` for lazy-loaded route views and widgets.
   - If any chunk is missing, React throws `TypeError: Failed to fetch dynamically imported module` and crashes into an error boundary.
   - Run a recursive AST/regex scanner over all downloaded `.js` files to identify all `import(...)`, `__vite__mapDeps`, and chunk filenames, ensuring 100% of chunk files are mirrored locally.

8. **The Gold-Standard `wget` Mirror Command (For Static Sites & Landing Pages)**:
   - For static HTML, WordPress, documentation, and traditional marketing sites, the canonical recursive mirror command is:
     ```bash
     wget --mirror --convert-links --adjust-extension --page-requisites --no-parent -e robots=off --wait=0.5 --random-wait -U "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36" <URL>
     ```
   - Breakdown of flags:
     * `--mirror` (`-m`): Turns on recursion, timestamping, infinite depth, and keeps FTP/HTTP directory listings.
     * `--page-requisites` (`-p`): Downloads all inline assets needed to display the page properly (images, CSS, JS, fonts).
     * `--convert-links` (`-k`): Rewrites links in documents so they point to local files for offline browsing.
     * `--adjust-extension` (`-E`): Appends `.html` to URLs without extensions so local web servers serve them with proper MIME types.
     * `--no-parent` (`-np`): Prevents ascending to parent directories.
     * `-e robots=off`: Bypasses robots.txt disallows when authorized to mirror the full site.
     * `-U "..."`: Passes a modern browser User-Agent to prevent 403 Forbidden blocks.
   - **Why `wget` alone is not enough for Modern SPAs**:
     * `wget` is a static HTTP crawler. It does NOT execute JavaScript.
     * On client-rendered SPAs (React, Vue, Vite, Next.js client bundles, login-gated dashboards), `wget` only downloads the raw shell (`<div id="root"></div>`) without rendering DOM, executing `fetch()`/XHR, downloading dynamic code-split chunks, solving Cloudflare challenges, or passing auth walls.
     * Use `wget` for traditional multi-page sites; use our CDP headless browser + proxy + chunk scanner for modern interactive SPAs.

