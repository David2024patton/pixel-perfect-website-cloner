#!/usr/bin/env node
/**
 * Headless CDP Network Asset & Verbatim Content Harvester
 * 
 * Usage:
 *   node network-capture.js --url <target_url> [--out <mirror_dir>] [--copy <copy.md>] [--port 9334]
 * 
 * Intercepts all live network requests at runtime:
 *   - 3D models and textures (.glb, .gltf, .ktx2, .basis)
 *   - WASM decoders and engines (Draco, Basis, Ammo, Unity/Godot wasm)
 *   - Spline 3D (.splinecode), Rive (.riv), Lottie (.json)
 *   - Video and audio (.mp4, .webm, .mp3, .wav)
 *   - Web fonts (.woff2, .woff, .ttf)
 *   - Dynamically injected SVGs and images
 *   - Verbatim DOM text dump to copy.md (eliminating AI slop)
 */

const { spawn } = require('child_process');
const http = require('http');
const https = require('https');
const url = require('url');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function arg(name, def) {
  const i = process.argv.indexOf("--" + name);
  return i > -1 ? process.argv[i + 1] : def;
}

const TARGET_URL = arg("url", null);
if (!TARGET_URL) {
  console.error("Error: --url <target_url> is required");
  process.exit(1);
}

const OUT_DIR = arg("out", path.join(process.cwd(), "mirror"));
const COPY_FILE = arg("copy", path.join(process.cwd(), "copy.md"));
const PORT = parseInt(arg("port", "9334"), 10);
const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const sleep = ms => new Promise(r => setTimeout(r, ms));

const parsedTarget = url.parse(TARGET_URL);
const TARGET_HOST = parsedTarget.hostname;

function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const ready = new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  ws.onmessage = e => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    } catch (_) {}
  };
  return {
    ready,
    send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const i = ++id;
        pending.set(i, msg => msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result));
        ws.send(JSON.stringify({ id: i, method, params }));
      });
    },
    on(event, handler) {
      ws.addEventListener('message', e => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.method === event) handler(msg.params);
        } catch (_) {}
      });
    },
    close() { ws.close(); }
  };
}

function fetchDirect(reqUrl) {
  return new Promise((resolve) => {
    try {
      const p = url.parse(reqUrl);
      const client = p.protocol === 'https:' ? https : http;
      client.get(reqUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept-Encoding': 'gzip, deflate, br'
        },
        timeout: 10000
      }, res => {
        let stream = res;
        const enc = res.headers['content-encoding'];
        if (enc === 'gzip') stream = res.pipe(zlib.createGunzip());
        else if (enc === 'deflate') stream = res.pipe(zlib.createInflate());
        else if (enc === 'br') stream = res.pipe(zlib.createBrotliDecompress());

        const chunks = [];
        stream.on('data', c => chunks.push(c));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', () => resolve(null));
      }).on('error', () => resolve(null));
    } catch (_) {
      resolve(null);
    }
  });
}

async function launchChrome() {
  const ud = path.join(process.env.TEMP || "C:/tmp", "chrome-netcap-" + Date.now());
  fs.mkdirSync(ud, { recursive: true });
  const ch = spawn(CHROME, [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${ud}`,
    "--window-size=1440,900",
    "about:blank"
  ], { stdio: "ignore", detached: true });
  ch.unref();

  for (let i = 0; i < 30; i++) {
    await sleep(400);
    try {
      const res = await fetch(`http://localhost:${PORT}/json/list`);
      if (res.ok) {
        const list = await res.json();
        const page = list.find(x => x.type === "page");
        if (page) return { chrome: ch, page };
      }
    } catch (_) {}
  }
  throw new Error("Failed to connect to headless Chrome on port " + PORT);
}

async function main() {
  console.log(`=== Runtime Network & Content Harvester ===`);
  console.log(`Target: ${TARGET_URL}`);
  console.log(`Output: ${OUT_DIR}`);

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const { chrome, page } = await launchChrome();
  const client = cdp(page.webSocketDebuggerUrl);
  await client.ready;

  await client.send("Page.enable");
  await client.send("Network.enable");
  await client.send("Runtime.enable");

  const capturedUrls = new Set();
  let downloadedCount = 0;

  client.on("Network.requestWillBeSent", async (params) => {
    const reqUrl = params.request.url;
    if (!reqUrl || reqUrl.startsWith('data:') || reqUrl.startsWith('blob:')) return;
    const parsed = url.parse(reqUrl);

    // Only capture assets for target domain or relevant CDNs
    const isAsset = /\.(png|jpg|jpeg|gif|svg|webp|avif|css|js|woff|woff2|ttf|eot|glb|gltf|ktx2|basis|wasm|splinecode|riv|lottie|json|mp3|mp4|webm)$/i.test(parsed.pathname || '');
    if (isAsset && !capturedUrls.has(reqUrl)) {
      capturedUrls.add(reqUrl);
      const buf = await fetchDirect(reqUrl);
      if (buf && buf.length > 0) {
        let cleanPath = parsed.pathname.replace(/^\//, '');
        // Preserve clean relative file paths
        const dest = path.join(OUT_DIR, cleanPath);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, buf);
        downloadedCount++;
      }
    }
  });

  console.log("Navigating to target page...");
  await client.send("Page.navigate", { url: TARGET_URL });
  await sleep(4000);

  // Smooth scroll down to trigger lazy loading, WebGL shaders, and scroll-jack interactions
  console.log("Scrolling through page to trigger all dynamic assets...");
  await client.send("Runtime.evaluate", {
    expression: `(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 400) {
        window.scrollTo(0, y);
        await new Promise(r => setTimeout(r, 100));
      }
      window.scrollTo(0, 0);
    })()`,
    awaitPromise: true
  });
  await sleep(2000);

  // Extract verbatim DOM text tree
  console.log("Extracting verbatim DOM text hierarchy to prevent AI slop...");
  const textHierarchy = await client.send("Runtime.evaluate", {
    expression: `(() => {
      const out = [];
      function walk(el, depth = 0) {
        const tag = el.tagName ? el.tagName.toLowerCase() : '';
        if (['script', 'style', 'noscript', 'svg'].includes(tag)) return;
        if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)) {
          const t = el.innerText ? el.innerText.trim() : '';
          if (t) out.push('\\n' + '#'.repeat(parseInt(tag[1])) + ' ' + t);
        } else if (tag === 'p') {
          const t = el.innerText ? el.innerText.trim() : '';
          if (t) out.push('\\n' + t);
        } else if (tag === 'button' || el.getAttribute('role') === 'button') {
          const t = el.innerText ? el.innerText.trim() : '';
          if (t) out.push('- [BUTTON]: ' + t);
        } else if (tag === 'li') {
          const t = el.innerText ? el.innerText.trim() : '';
          if (t) out.push('  * ' + t);
        }
        for (const child of el.children) walk(child, depth + 1);
      }
      walk(document.body);
      return out.join('\\n');
    })()`,
    returnByValue: true
  });

  if (textHierarchy.result && textHierarchy.result.value) {
    fs.mkdirSync(path.dirname(COPY_FILE), { recursive: true });
    fs.writeFileSync(COPY_FILE, `# Verbatim Page Text Copy\n\nTarget URL: ${TARGET_URL}\n\n${textHierarchy.result.value}\n`);
    console.log(`Saved verbatim copy reference to: ${COPY_FILE}`);
  }

  client.close();
  console.log(`\nSuccessfully harvested ${downloadedCount} dynamic assets into ${OUT_DIR}`);
  console.log(`Ready for pixel-perfect reproduction with zero AI slop.`);
}

main().catch(err => {
  console.error("Harvester failed:", err);
  process.exit(1);
});
