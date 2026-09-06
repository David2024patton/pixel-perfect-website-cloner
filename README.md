# Pixel-Perfect Website Cloner

> **An agentic, multi-phase website cloning engine.**  
> Clones modern websites and authenticated SaaS platforms with 100% fidelity using headless Chrome CDP, recursive chunk pre-fetching, stealth Cloudflare bypassing, and a local API proxy.

---

## Why This Exists (Moving Beyond "Vibe Coding")

Most AI website cloners attempt to inspect a screenshot and hallucinate a React component. In practice, this hits the **"80% trap"**:
- Spacing and typography are guessed rather than measured.
- Complex motion (GSAP, Skrollr, Webflow horizontal tracks, WebGL/Three.js shaders) fails.
- Client-rendered SPAs (Vite, Next.js) crash on missing code-split chunks.
- Authenticated dashboards break into error boundaries when API calls return 404s or fallback HTML.

**Pixel-Perfect Website Cloner** solves this with the **Universal 100% Fidelity Protocol**:
1. **Verbatim DOM Extraction**: Captures raw text (`copy.md`) and computed styles directly from the live DOM.
2. **Faithful Re-Host (`DELIVERABLE=faithful_rehost`)**: Preserves the original asset tree and bytecode-pristine runtime JS.
3. **Automated SaaS Login & Session Seeding (`scripts/auth-login.js`)**: Solves Cloudflare Turnstile, enters credentials, and seeds local session storage.
4. **Local Dynamic API Proxy (`scripts/local-api-proxy.js`)**: Intercepts root and subroute API endpoints and serves JSON mock responses.
5. **Recursive Chunk Pre-fetching**: Scans dynamic `import(...)` and Vite dependencies to guarantee zero missing modules.
6. **In-Browser Verification Harness**: Injects an on-screen testing toolbar (`#zbar`) and generates a split-slider visual diff viewer (`scripts/verify-1to1.js`).

---

## Quick Start

### 1. Installation

Clone this repository and install dependencies:
```bash
git clone https://github.com/David2024patton/pixel-perfect-website-cloner.git
cd pixel-perfect-website-cloner
npm install
```

### 2. Using as an AI Agent Skill

This repository is structured as a native skill for coding agents (Antigravity, Claude Code, Cursor, Windsurf, OpenCode).

Invoke via slash command:
```bash
# Public landing page or marketing site
/pixel-perfect-website-cloner https://example.com

# Login-gated SaaS portal (stealth auth + session seeding)
/pixel-perfect-website-cloner https://app.example.com Email: user@example.com pass: secret123
```

---

## Core Scripts & Tooling

| Script | Description |
| :--- | :--- |
| `scripts/auth-login.js` | Stealth Chrome launcher with Cloudflare clearance, multi-step login handling, and deep subroute discovery. |
| `scripts/local-api-proxy.js` | Local mock proxy that intercepts API calls, handles query/prefix matching, and serves JSON mocks for SPAs. |
| `scripts/crawl-sitemap.js` | Automated recursive sitemap parser and BFS link crawler that mirrors pages as `<path>/index.html`. |
| `scripts/network-capture.js` | Captures runtime binary assets (GLB 3D models, textures, audio, WASM decoders) via CDP. |
| `scripts/detect-tech.js` | Analyzes site architecture (Webflow, Vite, Next.js, Three.js, Flutter WASM, WordPress). |
| `scripts/verify-1to1.js` | Comprehensive pixel-diff engine generating side-by-side interactive split-sliders and DOM parity reports. |
| `scripts/testing-toolbar.js` | Floating client toolbar injected into clones: Cache Reset, Screenshot, Markdown Dump, and On-Screen Markup. |

---

## Deliverable Modes

- **`DELIVERABLE=faithful_rehost`**: Serves genuine mirrored HTML/CSS/JS with runtime scripts kept byte-for-byte pristine. Best for Webflow IX2, GSAP, and 3D WebGL canvases.
- **`DELIVERABLE=fully_functional_copy`**: Re-hosts the frontend bundle and pairs it with `local-api-proxy.js` to simulate a fully functional SaaS application past the auth wall.
- **`DELIVERABLE=simulated_clone`**: Builds a single-component React/Tailwind application powered by synthetic data.

---

## Privacy & The Anti-AI-Slop Rule

- **Zero Real Personal Data**: Real customer names, phone numbers, addresses, and call recordings are strictly replaced with plausible synthetic data (e.g. Alex Taylor, `+1 (555) 019-2831`).
- **Zero Placeholder Filler**: No "Lorem ipsum" or generic marketing fluff ("In today's fast-paced world"). All headlines, badges, and button labels are extracted verbatim.
- **Zero Lazy Truncation**: Every list, carousel item, and dropdown option captured on the live site is rendered completely.
- **No Emojis for Icons**: Uses clean, inline SVG line icons matching the source design.

---

## License

MIT
