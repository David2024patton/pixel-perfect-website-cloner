# Workflow Details

Complete breakdown of the website cloning workflow phases.

## Phase 0: Setup

**Purpose**: Prepare folder structure and detect project type

**Actions**:
1. Extract domain from URL
2. Create `.tasks/clone-{domain}/` folder
3. Create `screenshots/` subfolder
4. Create `public/images/`, `public/videos/`, `public/icons/` if not exist
5. Initialize `context.md` with task metadata
6. Detect project type from `package.json`

**Output**:
```
.tasks/clone-{domain}/
├── context.md
└── screenshots/

public/
├── images/
├── videos/
└── icons/
```

---

## Phase 1: Screenshot Capture

**Agent**: `website-screenshotter`

**Purpose**: Create comprehensive visual reference for implementation and QA

**Captures**:
| Type | Naming | Viewports |
|------|--------|-----------|
| Full page | `full-page-{viewport}.png` | 1920x1080, 1024x768, 375x812 |
| Sections | `section-{name}.png` | Primary viewport |
| Components | `component-{name}.png` | As needed |
| Hover states | `component-{name}-hover.png` | As needed |
| Details | `detail-{description}.png` | Zoomed |

**Updates**: `context.md` with screenshot inventory and observed animations

**Depends on**: Phase 0 complete

---

## Phase 2: Asset & Style Extraction

**Agent**: `website-extractor`

**Purpose**: Gather all resources needed for pixel-perfect recreation

**Extracts**:

### Assets (to public/)
| Type | Destination | Naming |
|------|-------------|--------|
| Images | `public/images/` | `{section}-{purpose}.{ext}` |
| Videos | `public/videos/` | `{section}-video.{ext}` |
| Icons | `public/icons/` | `icon-{name}.svg` |

### Styles & Verbatim Content (to context.md & copy.md)
- **Verbatim Copy**: All headings, paragraphs, badge texts, buttons, pricing values, and footer links captured word-for-word. Zero AI hallucinations or lorem ipsum.
- **Colors**: Primary, secondary, backgrounds, text, borders, gradients
- **Typography**: Font families, sizes, weights, line-heights, letter-spacing
- **Spacing**: Section padding, container widths, gaps
- **Components**: Border-radius, shadows, button styles, card styles
- **Animations**: Transitions, on-load, on-scroll, on-hover
- **Layout**: Max-width, breakpoints, grid patterns

**Depends on**: Phase 0 complete (can run parallel with Phase 1)

---

## Phase 3: Implementation

**Agent**: `website-cloner`

**Purpose**: Build the clone according to the classified `DELIVERABLE`:
- If `DELIVERABLE=faithful_rehost`: Serve original files byte-for-byte in `rehost/`, decompressing gzipped CDN assets and keeping engine JS pristine.
- If `DELIVERABLE=fully_functional_copy`: Rehost frontend bundle and launch `local-api-proxy.js` to intercept and mock backend API routes.
- If `DELIVERABLE=simulated_clone` or `react_impl`: Hand-roll the React component using exact verbatim text from `copy.md`.

**Process (for React / Simulated Clone)**:
1. Detect project type (Next.js, TanStack Start, Vite, etc.)
2. Read `context.md` for style values and `copy.md` for verbatim text
3. If `review-notes.md` exists, read and prioritize fixes
4. Apply the Anti-AI-Slop Doctrine:
   - Use verbatim text for all copy (no generic filler)
   - Render all grid and list items completely (no truncation)
   - Use extracted SVGs instead of emojis or generic icon replacements
   - Implement all dropdowns and mobile menus with state interactivity
5. Preview with Playwright and compare

**Output location by framework**:
```
Next.js App Router  → app/clone/page.tsx
Next.js Pages       → pages/clone.tsx
TanStack Start      → src/routes/clone.tsx
Vite                → src/pages/Clone.tsx
Faithful Rehost     → rehost/ (static file bundle)
```

**Component structure**:
```tsx
"use client" // Next.js App Router only

import { motion } from "motion/react"

export default function ClonePage() {
  return (
    <div className="min-h-screen">
      {/* ============================================
          NAVIGATION
          ============================================ */}
      <nav>...</nav>

      {/* ============================================
          HERO SECTION
          ============================================ */}
      <section>...</section>

      {/* Continue for all sections... */}
    </div>
  )
}
```

**Depends on**: Phase 1 and Phase 2 complete

---

## Phase 4: QA Review

**Agent**: `website-qa-reviewer`

**Purpose**: Verify pixel perfection, run the Anti-AI-Slop audit, and check structural layout

**Process**:
1. Start dev server or static server
2. Open original and clone side-by-side
3. Compare systematically at each viewport
4. Run Anti-AI-Slop Audit:
   - Search for AI filler words ("fast-paced", "elevate", "cutting-edge", "lorem ipsum")
   - Verify element count parity across all grids/lists
   - Check network tab for any 404 assets or script errors
   - Test all interactive dropdowns and mobile menu states
5. Run automated visual comparison gate (`scripts/compare-screens.js`)
6. Document all differences in `review-notes.md`
7. Set status

**Issue classification**:

| Severity | Criteria | Examples |
|----------|----------|----------|
| **Critical** | AI slop, truncated items, 404 assets, missing sections, broken layout | AI filler text, 3 cards instead of 12, broken images, broken motion |
| **Major** | Noticeable visual difference | Wrong colors, spacing off by 10-20px, missing hover states |
| **Minor** | Subtle differences | Spacing off <10px, slight animation timing differences |

**Status values**:
- `PERFECT` → Clone is pixel-perfect with verbatim copy, workflow complete
- `ACCEPTABLE` → Minor issues only, ask user if continue
- `NEEDS_WORK` → Critical/major issues or AI slop detected, must iterate

**Depends on**: Phase 3 complete


---

## Phase 5: Iteration Loop

**Purpose**: Refine clone until acceptable

**Logic**:
```
Read review-notes.md status

If PERFECT:
  → Complete! Output summary

If ACCEPTABLE:
  → Ask user: accept or continue?
  → If continue: go to Phase 3
  → If accept: complete

If NEEDS_WORK:
  → Increment iteration counter
  → If counter > 5: stop with warning
  → Else: go to Phase 3
```

**Max iterations**: 5 (prevents infinite loops)

---

## State Management

All state is persisted in `.tasks/clone-{domain}/`:

| File | Purpose | Written by |
|------|---------|------------|
| `context.md` | Styles, structure, asset paths | extractor, screenshotter |
| `screenshots/` | Visual references | screenshotter |
| `review-notes.md` | QA findings and status | qa-reviewer |

Assets are persisted in `public/`:
| Folder | Contents | Written by |
|--------|----------|------------|
| `public/images/` | Photos, logos, backgrounds | extractor |
| `public/videos/` | Background videos | extractor |
| `public/icons/` | SVGs, icons | extractor |

---

## Error Handling

| Error | Response |
|-------|----------|
| Website requires auth | Stop, report to user |
| Bot protection detected | Stop, suggest manual approach |
| Playwright fails | Retry once, then report |
| Max iterations reached | Stop, provide partial output |
| Sub-agent not found | Report missing agent name |
