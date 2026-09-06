#!/usr/bin/env node
/**
 * Automated Sitemap & Multi-Page Crawler for Website Cloner
 * 
 * Usage:
 *   node crawl-sitemap.js --url <base_url> [--out <rehost_dir>] [--max-pages 50] [--routes <routes.json>]
 * 
 * Capabilities:
 *   - Parses robots.txt and sitemap.xml / sitemap_index.xml (including nested sub-sitemaps)
 *   - Falls back to recursive BFS crawl of internal links if sitemap is absent
 *   - Saves pages as <out>/<path>/index.html for complete local browsing without 404s
 *   - Writes routes.json for automated visual diff verification
 */

const https = require('https');
const http = require('http');
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
  console.error("Error: --url <base_url> is required");
  process.exit(1);
}

const OUT_DIR = arg("out", path.join(process.cwd(), "rehost"));
const MAX_PAGES = parseInt(arg("max-pages", "100"), 10);
const ROUTES_OUT = arg("routes", path.join(process.cwd(), "routes.json"));

const parsedTarget = url.parse(TARGET_URL);
const TARGET_HOST = parsedTarget.hostname;
const PROTOCOL = parsedTarget.protocol || 'https:';
const ROOT_ORIGIN = `${PROTOCOL}//${parsedTarget.host}`;

function fetchBuffer(target) {
  return new Promise((resolve) => {
    try {
      const parsed = url.parse(target);
      const client = parsed.protocol === 'https:' ? https : http;
      const req = client.get(target, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br'
        },
        timeout: 12000
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const redirect = url.resolve(target, res.headers.location);
          return resolve(fetchBuffer(redirect));
        }
        let stream = res;
        const encoding = res.headers['content-encoding'];
        if (encoding === 'gzip') stream = res.pipe(zlib.createGunzip());
        else if (encoding === 'deflate') stream = res.pipe(zlib.createInflate());
        else if (encoding === 'br') stream = res.pipe(zlib.createBrotliDecompress());

        const chunks = [];
        stream.on('data', c => chunks.push(c));
        stream.on('end', () => resolve({ status: res.statusCode, buffer: Buffer.concat(chunks), headers: res.headers }));
        stream.on('error', () => resolve({ status: res.statusCode, buffer: Buffer.concat(chunks), headers: res.headers }));
      });
      req.on('error', () => resolve({ status: 0, buffer: Buffer.alloc(0), headers: {} }));
      req.on('timeout', () => { req.destroy(); resolve({ status: 0, buffer: Buffer.alloc(0), headers: {} }); });
    } catch (e) {
      resolve({ status: 0, buffer: Buffer.alloc(0), headers: {} });
    }
  });
}

async function fetchText(target) {
  const res = await fetchBuffer(target);
  return { status: res.status, text: res.buffer.toString('utf8'), headers: res.headers };
}

// Find sitemap URLs from robots.txt and standard locations
async function discoverSitemaps() {
  const list = [];
  const robots = await fetchText(`${ROOT_ORIGIN}/robots.txt`);
  if (robots.status === 200 && robots.text) {
    const matches = robots.text.match(/Sitemap:\s*([^\r\n]+)/gi);
    if (matches) {
      matches.forEach(m => {
        const u = m.replace(/Sitemap:\s*/i, '').trim();
        if (u && !list.includes(u)) list.push(u);
      });
    }
  }

  const defaults = [`${ROOT_ORIGIN}/sitemap.xml`, `${ROOT_ORIGIN}/sitemap_index.xml`];
  for (const s of defaults) {
    if (!list.includes(s)) {
      const res = await fetchText(s);
      if (res.status === 200 && (res.text.includes('<urlset') || res.text.includes('<sitemapindex'))) {
        list.push(s);
      }
    }
  }
  return list;
}

// Recursively parse sitemaps and sub-sitemaps
async function parseSitemap(sitemapUrl, visited = new Set()) {
  if (visited.has(sitemapUrl)) return [];
  visited.add(sitemapUrl);

  const res = await fetchText(sitemapUrl);
  if (res.status !== 200 || !res.text) return [];

  const text = res.text;
  const urls = [];

  // If sitemapindex, recurse on child sitemaps
  if (text.includes('<sitemapindex')) {
    const subMatches = text.match(/<loc>\s*([^<]+)\s*<\/loc>/gi) || [];
    for (const sm of subMatches) {
      const subUrl = sm.replace(/<\/?loc>/gi, '').trim();
      if (subUrl.endsWith('.xml') || subUrl.includes('sitemap')) {
        const children = await parseSitemap(subUrl, visited);
        children.forEach(c => { if (!urls.includes(c)) urls.push(c); });
      }
    }
  }

  // Extract page URLs
  const locMatches = text.match(/<loc>\s*([^<]+)\s*<\/loc>/gi) || [];
  for (const lm of locMatches) {
    const pageUrl = lm.replace(/<\/?loc>/gi, '').trim();
    if (!pageUrl.endsWith('.xml') && !urls.includes(pageUrl)) {
      const parsed = url.parse(pageUrl);
      if (parsed.hostname === TARGET_HOST) {
        urls.push(pageUrl);
      }
    }
  }

  return urls;
}

// Extract internal links from HTML for BFS fallback
function extractLinks(html, currentUrl) {
  const links = new Set();
  const regex = /<a[^>]+href=["']([^"']+)["']/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    let href = match[1].trim();
    if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) {
      continue;
    }
    const resolved = url.resolve(currentUrl, href);
    const parsed = url.parse(resolved);
    if (parsed.hostname === TARGET_HOST) {
      // Exclude media/asset links
      if (!parsed.pathname.match(/\.(png|jpg|jpeg|gif|svg|webp|avif|css|js|woff|woff2|ttf|pdf|mp3|mp4|zip)$/i)) {
        // Normalize: remove query and hash
        const clean = `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
        links.add(clean);
      }
    }
  }
  return Array.from(links);
}

function savePage(pageUrl, content) {
  const parsed = url.parse(pageUrl);
  let pathname = parsed.pathname || '/';
  if (pathname.endsWith('/')) pathname += 'index.html';
  else if (!path.extname(pathname)) pathname += '/index.html';

  const localFile = path.join(OUT_DIR, pathname.startsWith('/') ? pathname.slice(1) : pathname);
  fs.mkdirSync(path.dirname(localFile), { recursive: true });
  fs.writeFileSync(localFile, content);
  return pathname;
}

async function main() {
  console.log(`=== Multi-Page Sitemap & Route Mirror ===`);
  console.log(`Target: ${TARGET_URL}`);
  console.log(`Output: ${OUT_DIR}`);
  console.log(`Max pages: ${MAX_PAGES}`);

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const sitemaps = await discoverSitemaps();
  let candidateUrls = [];

  if (sitemaps.length > 0) {
    console.log(`Discovered ${sitemaps.length} sitemap(s):`);
    sitemaps.forEach(s => console.log(`  - ${s}`));
    for (const s of sitemaps) {
      const extracted = await parseSitemap(s);
      extracted.forEach(u => { if (!candidateUrls.includes(u)) candidateUrls.push(u); });
    }
    console.log(`Extracted ${candidateUrls.length} total URLs from sitemaps.`);
  }

  // If no URLs from sitemap, seed with TARGET_URL for BFS
  if (candidateUrls.length === 0) {
    console.log("No sitemap entries found. Falling back to recursive BFS crawl...");
    candidateUrls.push(TARGET_URL);
  }

  const queue = [...candidateUrls];
  const visited = new Set();
  const routes = [];
  let savedCount = 0;

  while (queue.length > 0 && savedCount < MAX_PAGES) {
    const current = queue.shift();
    if (visited.has(current)) continue;
    visited.add(current);

    console.log(`[${savedCount + 1}/${MAX_PAGES}] Fetching: ${current}`);
    const res = await fetchText(current);
    if (res.status === 200 && res.text) {
      const localPath = savePage(current, res.text);
      savedCount++;

      const parsedCurrent = url.parse(current);
      const routeName = parsedCurrent.pathname.replace(/^\/|\/$/g, '').replace(/\//g, '-') || 'home';
      routes.push({
        name: routeName,
        live: parsedCurrent.pathname,
        local: localPath.startsWith('/') ? localPath : '/' + localPath
      });

      // Find more links if queue is getting low
      if (queue.length < MAX_PAGES) {
        const newLinks = extractLinks(res.text, current);
        newLinks.forEach(l => {
          if (!visited.has(l) && !queue.includes(l)) {
            queue.push(l);
          }
        });
      }
    }
  }

  // Save routes.json
  fs.writeFileSync(ROUTES_OUT, JSON.stringify(routes, null, 2));
  console.log(`\nSuccessfully mirrored ${savedCount} pages to ${OUT_DIR}`);
  console.log(`Saved route map to ${ROUTES_OUT}`);
}

main().catch(err => {
  console.error("Crawl failed:", err);
  process.exit(1);
});
