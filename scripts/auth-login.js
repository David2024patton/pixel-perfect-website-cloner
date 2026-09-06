#!/usr/bin/env node
/**
 * Automated SaaS & Cloudflare-Resistant Auth Login Harvester
 * 
 * Usage:
 *   node auth-login.js --url <url> --user <email> --pass <password> [--out <session.json>] [--mocks <mocks.json>] [--port 9335] [--visible]
 * 
 * Handles:
 *   - Direct credentials parsing (e.g. Email: ... pass: ...)
 *   - Multi-step login flows (e.g. "Continue with email" button in sameday.ai)
 *   - Cloudflare challenge detection ("Just a moment...", Turnstile)
 *   - Persisting cookies, localStorage, and sessionStorage to session.json
 *   - Capturing API response payloads into mocks.json for offline proxying
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
const USERNAME = arg("user", process.env.BROWSER_USERNAME || "");
const PASSWORD = arg("pass", process.env.BROWSER_PASSWORD || "");
const OUT_FILE = arg("out", path.join(process.cwd(), "auth", "session.json"));
const MOCKS_FILE = arg("mocks", path.join(process.cwd(), "auth", "mocks.json"));
const PORT = parseInt(arg("port", "9335"), 10);
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

async function launchStealthChrome() {
  const ud = getTempDir("chrome-auth-");

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
  console.log(`=== Automated SaaS & Cloudflare-Resistant Auth Login ===`);
  console.log(`Target URL: ${TARGET_URL}`);
  console.log(`User:       ${USERNAME ? USERNAME.slice(0, 3) + '***' : '[None supplied]'}`);

  const { chrome, page } = await launchStealthChrome();
  const client = cdp(page.webSocketDebuggerUrl);
  await client.ready;

  await client.send("Page.enable");
  await client.send("Network.enable");
  await client.send("Runtime.enable");

  // Mask webdriver
  await client.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      window.chrome = { runtime: {} };
    `
  });

  const apiMocks = {};

  client.on("Network.responseReceived", async (params) => {
    const resUrl = params.response.url;
    const mime = params.response.mimeType || '';
    if (mime.includes('json') || resUrl.includes('/api/')) {
      try {
        const bodyRes = await client.send("Network.getResponseBody", { requestId: params.requestId });
        if (bodyRes && bodyRes.body) {
          const parsed = url.parse(resUrl);
          const reqPath = parsed.pathname;
          try {
            apiMocks[reqPath] = {
              status: params.response.status,
              body: JSON.parse(bodyRes.body)
            };
          } catch (_) {
            apiMocks[reqPath] = {
              status: params.response.status,
              body: bodyRes.body
            };
          }
        }
      } catch (_) {}
    }
  });

  console.log("Navigating to target...");
  await client.send("Page.navigate", { url: TARGET_URL });
  await sleep(4000);

  // 1. Cloudflare Challenge Detection
  const isCloudflare = await client.send("Runtime.evaluate", {
    expression: `
      document.title.includes("Just a moment") || 
      !!document.querySelector("#challenge-running, #cf-turnstile, #cf-challenge, iframe[src*='cloudflare']")
    `,
    returnByValue: true
  });

  if (isCloudflare.result && isCloudflare.result.value) {
    console.log("Cloudflare Challenge detected! Waiting for challenge clearance...");
    for (let i = 0; i < 20; i++) {
      await sleep(1500);
      const titleRes = await client.send("Runtime.evaluate", {
        expression: `document.title`,
        returnByValue: true
      });
      const t = (titleRes.result && titleRes.result.value) || '';
      if (!t.includes("Just a moment") && !t.includes("Cloudflare")) {
        console.log("Cloudflare challenge successfully cleared!");
        break;
      }
    }
  }

  // 2. Multi-step login handling (e.g. Sameday.ai "Continue with email" button)
  if (USERNAME && PASSWORD) {
    console.log("Checking for login form / multi-step login triggers...");
    await client.send("Runtime.evaluate", {
      expression: `
        (() => {
          // If password input is not visible, look for 'Continue with email' button
          const pw = document.querySelector('input[type=password]');
          if (!pw || pw.offsetParent === null) {
            const btns = [...document.querySelectorAll('button, a')];
            const emailBtn = btns.find(b => {
              const t = (b.innerText || '').toLowerCase();
              return t.includes('continue with email') || t.includes('email') && t.includes('log in');
            });
            if (emailBtn) emailBtn.click();
          }
        })()
      `
    });
    await sleep(1500);

    // 3. Fill Credentials
    console.log("Filling login credentials...");
    const fillSuccess = await client.send("Runtime.evaluate", {
      expression: `
        (() => {
          const userField = document.querySelector('input[name=email], input[type=email], input[name=username], input[id*=email], input[type=text]');
          const passField = document.querySelector('input[name=password], input[type=password]');
          if (userField) {
            userField.value = ${JSON.stringify(USERNAME)};
            userField.dispatchEvent(new Event('input', { bubbles: true }));
            userField.dispatchEvent(new Event('change', { bubbles: true }));
          }
          if (passField) {
            passField.value = ${JSON.stringify(PASSWORD)};
            passField.dispatchEvent(new Event('input', { bubbles: true }));
            passField.dispatchEvent(new Event('change', { bubbles: true }));
          }
          return !!(userField && passField);
        })()
      `,
      returnByValue: true
    });

    if (fillSuccess.result && fillSuccess.result.value) {
      console.log("Submitting login form...");
      await client.send("Runtime.evaluate", {
        expression: `
          (() => {
            const submitBtn = document.querySelector('button[type=submit], input[type=submit]') || 
              [...document.querySelectorAll('button')].find(b => {
                const t = (b.innerText || '').toLowerCase();
                return t.includes('log in') || t.includes('sign in') || t.includes('continue');
              });
            if (submitBtn) submitBtn.click();
          })()
        `
      });

      console.log("Waiting for dashboard redirect...");
      for (let i = 0; i < 25; i++) {
        await sleep(1000);
        const curUrlRes = await client.send("Runtime.evaluate", { expression: "location.href", returnByValue: true });
        const cur = (curUrlRes.result && curUrlRes.result.value) || '';
        if (!cur.includes('/login') && !cur.includes('/signin') && !cur.includes('/auth')) {
          console.log(`Successfully logged in! Current URL: ${cur}`);
          break;
        }
      }

      // Deep route harvesting: open More menu, discover all links, and harvest interactive subroutes
      console.log("Discovering navigation links, dropdowns, and action subroutes...");
      await client.send("Runtime.evaluate", {
        expression: `
          (() => {
            const moreButtons = Array.from(document.querySelectorAll('button, a')).filter(el => {
              const t = (el.innerText || el.textContent || '').trim().toLowerCase();
              return t.includes('more') || el.getAttribute('aria-haspopup') === 'menu';
            });
            moreButtons.forEach(b => { try { b.click(); } catch (_) {} });
          })()
        `
      });
      await sleep(1000);

      const navLinksRes = await client.send("Runtime.evaluate", {
        expression: `
          (() => {
            const links = new Set();
            document.querySelectorAll('a[href]').forEach(a => {
              const h = a.getAttribute('href');
              if (h && !h.startsWith('#') && !h.startsWith('javascript:') && !h.startsWith('mailto:')) {
                try {
                  const resolved = new URL(h, location.href).href;
                  links.add(resolved);
                } catch (_) {}
              }
            });
            return Array.from(links);
          })()
        `,
        returnByValue: true
      });

      const discoveredLinks = (navLinksRes.result && navLinksRes.result.value) || [];
      console.log(`Discovered ${discoveredLinks.length} navigation and dropdown subroutes.`);

      // Visit each unique in-app subroute to capture full API mock suite
      const currentHost = url.parse(TARGET_URL).host;
      const visitedSubroutes = new Set();
      for (const link of discoveredLinks) {
        try {
          const parsedLink = url.parse(link);
          if (parsedLink.host === currentHost && !visitedSubroutes.has(parsedLink.pathname)) {
            visitedSubroutes.add(parsedLink.pathname);
            console.log(`  -> Harvesting API payloads for subroute: ${parsedLink.pathname}`);
            await client.send("Page.navigate", { url: link });
            await sleep(2500);

            // Trigger master-detail item clicks if present (e.g. list rows, conversation threads, action buttons)
            await client.send("Runtime.evaluate", {
              expression: `
                (() => {
                  const rows = document.querySelectorAll('tr, [role="row"], div[class*="item"], div[class*="thread"]');
                  if (rows.length > 0 && rows[0]) {
                    try { rows[0].click(); } catch (_) {}
                  }
                })()
              `
            });
            await sleep(1000);
          }
        } catch (_) {}
      }
    } else {
      console.log("Login form fields not immediately found; continuing to capture available state...");
    }
  }

  // 4. Capture Cookies and Web Storage
  console.log("Capturing authenticated storage state...");
  const cookiesRes = await client.send("Network.getCookies", {});
  const storageState = await client.send("Runtime.evaluate", {
    expression: `
      (() => {
        const ls = {};
        const ss = {};
        try {
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            ls[k] = localStorage.getItem(k);
          }
        } catch (_) {}
        try {
          for (let i = 0; i < sessionStorage.length; i++) {
            const k = sessionStorage.key(i);
            ss[k] = sessionStorage.getItem(k);
          }
        } catch (_) {}
        return { localStorage: ls, sessionStorage: ss };
      })()
    `,
    returnByValue: true
  });

  const sessionData = {
    url: TARGET_URL,
    timestamp: new Date().toISOString(),
    cookies: cookiesRes.cookies || [],
    localStorage: (storageState.result && storageState.result.value && storageState.result.value.localStorage) || {},
    sessionStorage: (storageState.result && storageState.result.value && storageState.result.value.sessionStorage) || {}
  };

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(sessionData, null, 2));
  console.log(`Saved authenticated session to: ${OUT_FILE}`);

  if (Object.keys(apiMocks).length > 0) {
    fs.mkdirSync(path.dirname(MOCKS_FILE), { recursive: true });
    fs.writeFileSync(MOCKS_FILE, JSON.stringify(apiMocks, null, 2));
    console.log(`Captured ${Object.keys(apiMocks).length} API endpoints to: ${MOCKS_FILE}`);
  }

  client.close();
  console.log("Auth capture completed successfully.");
}

main().catch(err => {
  console.error("Auth login process failed:", err);
  process.exit(1);
});
