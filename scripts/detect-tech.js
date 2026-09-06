#!/usr/bin/env node
/**
 * Automated Technology & Architecture Detector for Website Cloner
 * 
 * Usage:
 *   node detect-tech.js <url> [--out <file.json>]
 * 
 * Detects:
 *   - WebGPU / WebGL (Three.js, Babylon.js, PlayCanvas, Spline, Rive, Lottie)
 *   - Motion / Scroll engines (Webflow IX2, GSAP ScrollTrigger, Lenis, Skrollr)
 *   - Modern Frameworks (Astro, Next.js, Nuxt, Flutter Web, Blazor WASM)
 *   - Sitemaps & robots.txt (finds all sub-links automatically)
 *   - Auth / Login walls (SSO, password forms, API bases)
 */

const https = require('https');
const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');

const targetUrl = process.argv[2];
if (!targetUrl) {
  console.error("Usage: node detect-tech.js <url> [--out <output.json>]");
  process.exit(1);
}

function arg(name, def) {
  const i = process.argv.indexOf("--" + name);
  return i > -1 ? process.argv[i + 1] : def;
}

const outFile = arg("out", null);

function fetchText(target) {
  return new Promise((resolve) => {
    try {
      const parsed = url.parse(target);
      const client = parsed.protocol === 'https:' ? https : http;
      const req = client.get(target, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9'
        },
        timeout: 10000
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const redirect = url.resolve(target, res.headers.location);
          return resolve(fetchText(redirect));
        }
        let data = '';
        res.on('data', chunk => { if (data.length < 2000000) data += chunk; });
        res.on('end', () => resolve({ status: res.statusCode, text: data, headers: res.headers }));
      });
      req.on('error', () => resolve({ status: 0, text: '', headers: {} }));
      req.on('timeout', () => { req.destroy(); resolve({ status: 0, text: '', headers: {} }); });
    } catch (e) {
      resolve({ status: 0, text: '', headers: {} });
    }
  });
}

async function checkSitemaps(base) {
  const parsed = url.parse(base);
  const root = `${parsed.protocol}//${parsed.host}`;
  const found = [];

  // Check robots.txt
  const robotsRes = await fetchText(`${root}/robots.txt`);
  if (robotsRes.status === 200 && robotsRes.text) {
    const sitemapMatches = robotsRes.text.match(/Sitemap:\s*([^\r\n]+)/gi);
    if (sitemapMatches) {
      sitemapMatches.forEach(m => {
        const u = m.replace(/Sitemap:\s*/i, '').trim();
        if (u && !found.includes(u)) found.push(u);
      });
    }
  }

  // Common sitemap locations
  const common = [`${root}/sitemap.xml`, `${root}/sitemap_index.xml`, `${root}/sitemap-index.xml`];
  for (const s of common) {
    if (!found.includes(s)) {
      const res = await fetchText(s);
      if (res.status === 200 && res.text.includes('<urlset') || res.text.includes('<sitemapindex')) {
        found.push(s);
      }
    }
  }

  return found;
}

async function analyze() {
  console.log(`Analyzing target architecture: ${targetUrl}`);
  const res = await fetchText(targetUrl);
  const html = res.text || '';
  const lowerHtml = html.toLowerCase();

  const report = {
    url: targetUrl,
    status: res.status,
    technologies: [],
    signatures: {},
    sitemaps: [],
    siteType: 'standard_landing',
    deliverable: 'design_copy',
    notes: []
  };

  // 1. WebGPU / WebGL / 3D Engines
  const hasWebGPU = lowerHtml.includes('navigator.gpu') || lowerHtml.includes('webgpu') || lowerHtml.includes('.wgsl');
  const hasThree = lowerHtml.includes('three.js') || lowerHtml.includes('three.min.js') || lowerHtml.includes('three-fiber') || lowerHtml.includes('three/build');
  const hasPlayCanvas = lowerHtml.includes('playcanvas') || lowerHtml.includes('__game-scripts.js') || lowerHtml.includes('pc.application');
  const hasBabylon = lowerHtml.includes('babylon.js') || lowerHtml.includes('babylonjs');
  const hasSpline = lowerHtml.includes('.splinecode') || lowerHtml.includes('@splinetool') || lowerHtml.includes('spline-viewer');
  const hasRive = lowerHtml.includes('.riv') || lowerHtml.includes('@rive-app') || lowerHtml.includes('rive-canvas');
  const hasLottie = lowerHtml.includes('lottie') || lowerHtml.includes('.lottie') || lowerHtml.includes('bodymovin');
  const hasModels = /\.glb|\.gltf|\.ktx2|\.basis|draco|basis_transcoder/i.test(html);
  const hasCanvas = /<canvas/i.test(html);

  if (hasWebGPU) report.technologies.push('WebGPU');
  if (hasThree) report.technologies.push('Three.js');
  if (hasPlayCanvas) report.technologies.push('PlayCanvas');
  if (hasBabylon) report.technologies.push('Babylon.js');
  if (hasSpline) report.technologies.push('Spline 3D');
  if (hasRive) report.technologies.push('Rive Interactive Animation');
  if (hasLottie) report.technologies.push('Lottie Animations');
  if (hasModels) report.technologies.push('3D Binary Models / KTX2 / Draco');
  if (hasCanvas) report.technologies.push('HTML5 Canvas');

  // 2. Motion / Scroll Engines
  const hasWebflow = lowerHtml.includes('data-w-id') || lowerHtml.includes('wf-page') || lowerHtml.includes('webflow.js') || lowerHtml.includes('spacers.js');
  const hasGSAP = lowerHtml.includes('gsap') || lowerHtml.includes('scrolltrigger') || lowerHtml.includes('scrollsmoother');
  const hasLenis = lowerHtml.includes('lenis') || lowerHtml.includes('locomotive');
  const hasSkrollr = lowerHtml.includes('skrollr');

  if (hasWebflow) report.technologies.push('Webflow IX2');
  if (hasGSAP) report.technologies.push('GSAP ScrollTrigger');
  if (hasLenis) report.technologies.push('Lenis / Smooth Scroll');
  if (hasSkrollr) report.technologies.push('Skrollr');

  // 3. Web Frameworks
  const hasNext = lowerHtml.includes('__next_data__') || lowerHtml.includes('/_next/');
  const hasAstro = lowerHtml.includes('astro-island') || lowerHtml.includes('/_astro/');
  const hasNuxt = lowerHtml.includes('__nuxt__') || lowerHtml.includes('/_nuxt/');
  const hasFlutter = lowerHtml.includes('flutter.js') || lowerHtml.includes('canvaskit');
  const hasBlazor = lowerHtml.includes('blazor.webassembly.js') || lowerHtml.includes('_framework/blazor');
  const hasVite = lowerHtml.includes('/@vite/') || lowerHtml.includes('main-') && lowerHtml.includes('.js');

  if (hasNext) report.technologies.push('Next.js');
  if (hasAstro) report.technologies.push('Astro Islands');
  if (hasNuxt) report.technologies.push('Nuxt.js');
  if (hasFlutter) report.technologies.push('Flutter Web');
  if (hasBlazor) report.technologies.push('Blazor WebAssembly');
  if (hasVite) report.technologies.push('Vite / React');

  // 4. Auth Walls / SaaS
  const hasPasswordField = /<input[^>]+type=["']password["']/i.test(html);
  const hasSSO = /continue with (google|microsoft|apple|github)|sign in with/i.test(html);
  const isAuthApp = hasPasswordField || (hasSSO && (lowerHtml.includes('login') || lowerHtml.includes('signin')));

  if (isAuthApp) report.technologies.push('Login-gated Auth App');

  // 5. Check Sitemaps
  report.sitemaps = await checkSitemaps(targetUrl);

  // 6. Deduce Classification & Deliverable
  if (isAuthApp) {
    report.siteType = 'authenticated_spa';
    report.deliverable = 'fully_functional_copy';
    report.notes.push("Target is an authenticated SaaS application. Use local-api-proxy.js with mocks.json to allow past-login browsing without external auth failures.");
  } else if (hasWebGPU || hasThree || hasPlayCanvas || hasBabylon || hasSpline || hasModels) {
    report.siteType = 'webgl_canvas';
    report.deliverable = 'faithful_rehost';
    report.notes.push("Target features WebGPU/WebGL/3D runtime logic. Use faithful re-host and record runtime network requests to mirror WASM decoders and dynamic 3D assets.");
  } else if (hasWebflow || hasSkrollr || hasGSAP) {
    report.siteType = 'webflow_ix2';
    report.deliverable = 'faithful_rehost';
    report.notes.push("Target uses Webflow IX2 or bespoke scroll engines. Decompress gzipped CSS/JS and keep engine bundles byte-for-byte pristine.");
  } else if (report.sitemaps.length > 0) {
    report.siteType = 'multi_page_site';
    report.deliverable = 'faithful_rehost';
    report.notes.push(`Discovered ${report.sitemaps.length} sitemaps. Use crawl-sitemap.js to mirror all sub-pages as <path>/index.html for complete multi-page fidelity.`);
  } else {
    report.siteType = 'standard';
    report.deliverable = 'design_copy';
    report.notes.push("Target is a standard web page. Can be cloned via faithful re-host or rebuilt cleanly in React/Tailwind with verbatim copy.");
  }

  console.log("\n=== Tech Detection Summary ===");
  console.log(`Site Type:    ${report.siteType}`);
  console.log(`Deliverable:  ${report.deliverable}`);
  console.log(`Technologies: ${report.technologies.join(', ') || 'Standard HTML/CSS'}`);
  console.log(`Sitemaps:     ${report.sitemaps.length > 0 ? report.sitemaps.join(', ') : 'None found (use BFS crawl)'}`);
  if (report.notes.length) console.log(`Guidance:     ${report.notes.join(' ')}`);

  if (outFile) {
    fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
    console.log(`Report written to ${outFile}`);
  }

  return report;
}

analyze().catch(err => {
  console.error("Detection failed:", err);
  process.exit(1);
});
