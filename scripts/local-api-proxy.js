/**
 * Local API Proxy & Mock Server for Authenticated SPA Clones
 * 
 * Usage:
 *   node local-api-proxy.js --target-port 5173 --proxy-port 5001 --mock-file ./mocks.json
 * 
 * This server proxies static asset/frontend requests to the re-hosted frontend server
 * and intercepts hardcoded API routes to return synthetic mock responses, allowing
 * login-gated SPAs (like app.sameday.ai) to function locally past the auth wall.
 */

const http = require('http');
const https = require('https');
const url = require('url');
const fs = require('fs');
const path = require('path');

const TARGET_PORT = process.env.TARGET_PORT || 5173;
const MOCK_FILE = process.env.MOCK_FILE || path.join(__dirname, 'mocks.json');

let mocks = {
  "/api/auth/login": { status: 200, body: { token: "synthetic-jwt-token-12345", user: { id: "usr_1", name: "David Patton", email: "david@itak.live" } } },
  "/api/user/me": { status: 200, body: { id: "usr_1", name: "David Patton", email: "david@itak.live", organization: "Patriot Pest Control Co" } }
};

if (fs.existsSync(MOCK_FILE)) {
  try {
    mocks = JSON.parse(fs.readFileSync(MOCK_FILE, 'utf8'));
  } catch (e) {
    console.error('Failed to load mock file:', e);
  }
}

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const reqPath = parsedUrl.pathname;

  // CORS headers to ensure SPA can call this proxy smoothly
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Check if request matches a mock endpoint
  if (mocks[reqPath]) {
    const mock = mocks[reqPath];
    console.log(`[MOCK MATCH] ${req.method} ${reqPath} -> HTTP ${mock.status}`);
    res.writeHead(mock.status || 200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(mock.body || {}));
    return;
  }

  // Try matching full URL with query
  if (mocks[req.url]) {
    const mock = mocks[req.url];
    console.log(`[MOCK QUERY MATCH] ${req.method} ${req.url} -> HTTP ${mock.status}`);
    res.writeHead(mock.status || 200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(mock.body || {}));
    return;
  }

  // Try prefix matching for parameterized or trailing slash routes
  for (const [k, v] of Object.entries(mocks)) {
    const pureK = k.split('?')[0];
    if (pureK === reqPath || (pureK.endsWith('/') && reqPath + '/' === pureK)) {
      console.log(`[MOCK PURE MATCH] ${req.method} ${reqPath} -> HTTP ${v.status}`);
      res.writeHead(v.status || 200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(v.body || {}));
      return;
    }
  }

  // Root API Interception: prevent API routes from falling back to frontend HTML
  const isApiRoute = reqPath.startsWith('/v1/') ||
                     reqPath.startsWith('/api/') ||
                     reqPath.startsWith('/activity') ||
                     reqPath.startsWith('/workflow-templates') ||
                     reqPath.startsWith('/prompt-sections') ||
                     reqPath.startsWith('/voices') ||
                     reqPath.startsWith('/agents') ||
                     reqPath.startsWith('/campaigns') ||
                     reqPath.startsWith('/companies') ||
                     reqPath.startsWith('/copilotkit/') ||
                     reqPath.startsWith('/flags');

  if (isApiRoute) {
    console.log(`[API FALLBACK JSON] ${req.method} ${reqPath}`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, data: [] }));
    return;
  }

  // Handle generic auth login fallback if not explicitly in mocks
  if (reqPath.includes('/login') || reqPath.includes('/auth') || reqPath.includes('/session')) {
    console.log(`[SYNTHETIC AUTH] ${req.method} ${reqPath}`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      token: "synthetic-token-david-itak-live",
      user: { id: "usr_david", email: "david@itak.live", name: "David Patton" }
    }));
    return;
  }

  // Proxy remaining requests to static frontend server
  const proxyReq = http.request({
    host: '127.0.0.1',
    port: TARGET_PORT,
    path: req.url,
    method: req.method,
    headers: req.headers
  }, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on('error', (err) => {
    console.error(`[PROXY ERR] ${req.url}:`, err.message);
    res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end('Bad Gateway');
  });

  req.pipe(proxyReq, { end: true });
});

const PORT = process.env.PORT || 5001;
server.listen(PORT, () => {
  console.log(`Local API Proxy & Mock Server running on http://127.0.0.1:${PORT}`);
  console.log(`Proxying unhandled routes to http://127.0.0.1:${TARGET_PORT}`);
});
