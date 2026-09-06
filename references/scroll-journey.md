# Cloning scroll-journey & parallax sites (the defeatboco pattern)

High-effort sites like defeatboco.com are not standard pages: the **scroll is the navigation**. This reference covers recognizing, capturing, and rebuilding that class of site. Canonical example: defeatboco.com/worlds.html: four "worlds" you travel through.

## When this applies (detection)

A target is a scroll-journey / parallax site when it has any of:

- Multiple distinct "worlds"/scenes/sections you move between by scrolling, not by clicking links.
- Scroll direction maps to axis: horizontal ΔX travels across worlds, vertical ΔY moves within one world.
- A numbered pager / dot indicator showing which world you are in.
- Parallax depth: background layers translate slower than the foreground as you scroll.
- Pinned sections that stay fixed while content advances, or a "SCROLL TO BEGIN" prompt.
- Bespoke scene art (low-poly SVG, one palette per world) as the hero, often desktop-gated.

If any apply → `SITE_TYPE=scroll_journey`. Otherwise `SITE_TYPE=standard`.

## The mechanic to reproduce (defeatboco spec)

- **Hook frame:** N vertical panels side by side, each its own low-poly scene with a number label at the bottom ("four worlds awaiting you"). Reads as horizontal travel.
- **Wheel handler:** custom, not plain page scroll. A wrapper listens for wheel/touchmove. ΔX → horizontal travel (change world index). ΔY → scroll the current world's copy AND camera depth. A single gesture can go either axis.
- **World:** when active it expands full viewport: the landscape, a headline, a paragraph, a small numbered pager (top-left), and a "SCROLL TO BEGIN" hint when it first loads.
- **Art:** unified low-poly, flat-shaded, one palette per world, cohesive set rather than a collage.


## Capture checklist (screenshotter, when scroll_journey)

Capture into `TASK_DIR/screenshots/`:

- The hook frame (the full N-panel layout).
- Each world at full viewport, active state.
- Each world's in-world vertical states: top, each copy block, bottom, to capture the parallax offset range.
- The pager (all states, current-highlighted).
- The "SCROLL TO BEGIN" prompt state.
- Any responsive / desktop-gated fallback (defeatboco is desktop-gated; capture the mobile fallback if present).
- Document the world order and each world's real content (headline + copy), since that is content, not chrome.

## Extraction (extractor, when scroll_journey)

Beyond the standard asset/style pass, capture the **behavior**:

- **Scroll wrapper / handler.** Is the page scrolled by the window, or a custom container (overflow) driven by a JS wheel handler? Read the site JS (e.g. `script.min.js`) to locate the handler.
- **Axis mapping.** Which deltas drive horizontal vs vertical travel, the deadzone/threshold, and how a gesture is resolved to an axis. Note whether a touch/trackpad gesture can be interpreted as either.
- **Worlds.** How many, their indices, each world's headline + paragraph + any CTA, and the world order.
- **Pager.** Structure (N circles), the current-state style, and click-to-jump behavior.
- **Parallax layers.** For each world, list the layers (background, midground, foreground, text), their scroll-relative translate ranges, easing, and z-index / stacking.
- **Camera depth / zoom.** If a world dollies or zooms on scroll, record the scale range and timing/easing.
- **Art.** Extract each world's palette; note whether art is inline SVG, image, or canvas. If SVG, capture the SVG source; if image, download to `public/`.
- Write all of this into `context.md` under a "Scroll mechanic" section.


## Build (cloner, when scroll_journey)

Two viable strategies. Prefer the one that best matches the original behavior.

### A. Custom wheel handler (closest to defeatboco)

Reproduce the manual mapping rather than use a library:

- One full-viewport, fixed `.worlds` wrapper; N `.world` panels absolutely stacked, each translated out by `(worldIndex - current) * 100vw`.
- A wheel/touch handler on the wrapper: if the dominant axis is horizontal, tween between worlds; if vertical, scroll the active world's internal copy and apply parallax translates to its layers. Use a deadzone + cooldown/lerp so one gesture does not skip worlds or double-fire.
- Parallax: `transform: translateY(scrollProgress * layerFactor)` per layer, `layerFactor` smaller for background.
- Pager: circle i active when world i is current. Show "SCROLL TO BEGIN" only on the first world until the first interaction.
- Cross-fade / translate between worlds with `motion` (AnimatePresence) or CSS transitions.

Sketch: keep the whole journey in one component; state = `[world, setWorld]` plus a ref to the active world's internal scroll; on wheel pick axis by dominant delta and drive those two independently.

### B. GSAP ScrollTrigger (more standard, easier to tune)

- Pin each world and scrub through them; use a horizontal scroller via `scrollTrigger` with a scrub tween translating the row of worlds.
- For in-world vertical content, use pinned sections with scrub parallax on layers.
- Keep the pager synced to the active world index.

Desktop-gate it if the original is desktop-only; provide a responsive fallback under a width/height breakpoint, or make it mobile-friendly with vertical stacking.

## QA (qa-reviewer, when scroll_journey)

Verify the **behavior**, not just the pixels:

- Wheel axis resolution: pure ΔX travels worlds, pure ΔY scrolls within a world, and the choice is correct (not both firing).
- World transitions: direction matches the wheel sign; speed/easing matches; no jump across multiple worlds on one gesture.
- In-world parallax: each layer moves at the intended rate (background slower), no jitter.
- Content: each world shows the correct headline + copy + CTA; world order matches the original.
- Pager: current world highlighted, count matches, updates as you travel; click-to-jump works if the original had it.
- "SCROLL TO BEGIN" appears on the first world and is dismissed on first interaction.
- Art: per-world palette and low-poly style are cohesive; assets load; no seams between worlds.
- Gating: responsive / desktop gate matches the original; no page scroll jumps.

## Variants

- **Standard parallax:** hero/background layers translate on scroll (`translateY(-rate)`).
- **Scroll-snap carousel:** CSS scroll-snap between full-height panels.
- **Pinned horizontal section:** GSAP pin a horizontal panel that scrubs as you scroll vertically.
- **Depth/zoom camera:** the world scales/translates on scroll progress (dolly).

## Fidelity ceiling → faithful re-host

For a site as bespoke as defeatboco.com (skrollr + 200rem horizontal tracked scene layers), a hand-rolled
React component will NEVER match the motion. If the user keeps pushing back on it being "static / no
motion", stop hand-rolling and switch to the **faithful self-hosted re-host** of the original files
(see `faithful-rehost.md`): serve the site's own HTML/CSS/JS + full asset tree (including AJAX scene
partials under `assets/html/world-*/` and `parts/`, and `assets/sounds/*`). That runs the genuine motion.
