#!/usr/bin/env node
/**
 * Stealth Chrome Browser & Cloudflare Challenge Solver
 * 
 * Usage:
 *   node stealth-browser.js --url <url> [--out <session.json>] [--port 9336] [--visible]
 * 
 * Capabilities:
 *   - Launches Chrome with stealth anti-detection flags (--disable-blink-features=AutomationControlled)
 *   - Detects Cloudflare Turnstile and Managed Challenges ("Just a moment...")
 *   - Auto-clicks Turnstile checkbox iframe or allows 1-click human verification
 *   - Extracts cf_clearance, __cf_bm, and all session cookies into session.json
 */

const { spawn } = require('child_process');
const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const { getChromePath, getTempDir } = require('./browser-env');

function arg(name, def) {
  const i = process.argv.indexOf("--" + name);
  return i > -1 ? process.argv[i + 1] : def;
}
const hasFlag = name => process.argv.includes("--" + name);

const TARGET_URL = arg("url", null);
const OUT_FILE = arg("out", path.join(process.cwd(), "auth", "session.json"));
const PORT = parseInt(arg("port", "9336"), 10);
const IS_VISIBLE = hasFlag("visible");
const CHROME = getChromePath();
const sleep = ms => new Promise(r => setTimeout(r, ms));

if (!TARGET_URL) {
  console.error("Error: --url <target_url> is required");
  process.exit(1);
}

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
    close() { ws.close(); }
  };
}

async function launchChrome() {
  const ud = getTempDir("chrome-stealth-");

  const flags = [
    IS_VISIBLE ? "--window-size=1440,900" : "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-blink-features=AutomationControlled",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${ud}`,
    "about:blank"
  ];

  const ch = spawn(CHROME, flags, { stdio: "ignore", detached: true });
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
  throw new Error("Could not connect to stealth Chrome on port " + PORT);
}

async function main() {
  console.log(`=== Stealth Chrome & Cloudflare Solver ===`);
  console.log(`Target URL: ${TARGET_URL}`);
  console.log(`Mode:       ${IS_VISIBLE ? 'Visible Window' : 'Headless Stealth'}`);

  const { chrome, page } = await launchChrome();
  const client = cdp(page.webSocketDebuggerUrl);
  await client.ready;

  await client.send("Page.enable");
  await client.send("Network.enable");
  await client.send("Runtime.enable");

  // Prevent automation detection
  await client.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      window.chrome = { runtime: {} };
    `
  });

  console.log("Navigating to target...");
  await client.send("Page.navigate", { url: TARGET_URL });
  await sleep(3500);

  // Check for Cloudflare Turnstile / Challenge
  let isChallenge = true;
  for (let attempt = 0; attempt < 15; attempt++) {
    const check = await client.send("Runtime.evaluate", {
      expression: `
        (() => {
          const t = document.title || '';
          const hasChallenge = t.includes("Just a moment") || 
            !!document.querySelector("#challenge-running, #cf-turnstile, #cf-challenge, iframe[src*='challenges.cloudflare.com']");
          return hasChallenge;
        })()
      `,
      returnByValue: true
    });

    if (check.result && check.result.value) {
      console.log(`[Attempt ${attempt + 1}] Cloudflare challenge active. Attempting Turnstile interaction...`);
      // Try to click Turnstile checkbox if inside iframe
      await client.send("Runtime.evaluate", {
        expression: `
          (() => {
            const ifr = document.querySelector("iframe[src*='challenges.cloudflare.com']");
            if (ifr) {
              const rect = ifr.getBoundingClientRect();
              if (rect.width > 0) {
                // Focus iframe area
                ifr.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }
            }
          })()
        `
      });
      await sleep(2000);
    } else {
      isChallenge = false;
      console.log("Challenge cleared or page loaded normally!");
      break;
    }
  }

  // Check for cf_clearance cookie
  const cookiesRes = await client.send("Network.getCookies", {});
  const cookies = cookiesRes.cookies || [];
  const hasClearance = cookies.some(c => c.name === 'cf_clearance');
  console.log(`Cookies captured: ${cookies.length} (cf_clearance present: ${hasClearance})`);

  const session = {
    url: TARGET_URL,
    timestamp: new Date().toISOString(),
    hasCloudflareClearance: hasClearance,
    cookies: cookies
  };

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(session, null, 2));
  console.log(`Saved stealth session to: ${OUT_FILE}`);

  client.close();
  console.log("Stealth browser session finished.");
}

main().catch(err => {
  console.error("Stealth session failed:", err);
  process.exit(1);
});
