/**
 * Claude Terminal Platform — Session Daemon
 *
 * Entry point: Express HTTP(S) server with WebSocket terminal multiplexing.
 * Serves the dashboard, REST API, and real-time PTY streams over WSS.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const express = require('express');
const cookieParser = require('cookie-parser');
const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');

const { router: authRouter, requireAuth, validateJWT } = require('./lib/auth');
const sessions = require('./lib/sessions');
const skills = require('./lib/skills');

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env.PORT, 10) || 3100;
const JWT_SECRET = process.env.JWT_SECRET;
const TLS_CERT = process.env.TLS_CERT;
const TLS_KEY = process.env.TLS_KEY;

if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET is required');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------

const app = express();

app.use(express.json());
app.use(cookieParser());

// Static files — served before auth so the login page can load assets
app.use(express.static(path.join(__dirname, 'public')));

// Direct logout route — bypasses caching
app.get('/logout', (req, res) => {
  res.cookie('claude_session', '', { maxAge: 0, path: '/' });
  res.setHeader('Cache-Control', 'no-store, no-cache');
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Logged out</title>
    <style>body{background:#151820;color:#f0eee8;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
    .b{text-align:center}h1{font-size:24px;margin-bottom:8px}p{color:#b8b5ac;margin-bottom:24px}
    a{color:#5ec4ce;border:1px solid #5ec4ce;padding:10px 24px;border-radius:6px;text-decoration:none;font-weight:600}a:hover{background:#5ec4ce;color:#151820}</style>
    </head><body><div class="b"><h1>Logged out</h1><p>Session ended successfully.</p><a href="/auth/login">Sign in again</a></div></body></html>`);
});

// Auth routes (login, callback, logout, me)
app.use('/auth', authRouter);

// All /api/* routes require authentication
app.use('/api', requireAuth);

// ---------------------------------------------------------------------------
// REST API — GitHub Repos + Projects
// ---------------------------------------------------------------------------

const { execSync } = require('child_process');

// List user's GitHub repos using their OAuth token from JWT
app.get('/api/repos', async (req, res, next) => {
  try {
    const ghToken = req.user && req.user.gh;
    if (!ghToken) return res.status(400).json({ error: 'No GitHub token — re-login to enable repo listing' });
    const resp = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner', {
      headers: { 'Authorization': `token ${ghToken}`, 'User-Agent': 'LoopTerminal/1.0' }
    });
    if (!resp.ok) return res.status(resp.status).json({ error: 'GitHub API error' });
    const repos = await resp.json();
    res.json(repos.map(r => ({ name: r.name, full_name: r.full_name, url: r.clone_url, private: r.private, updated: r.updated_at, description: r.description })));
  } catch (err) { next(err); }
});

app.get('/api/projects', async (_req, res, next) => {
  try {
    const dir = process.env.PROJECTS_DIR || '/home/claude/projects';
    const fs = require('fs');
    if (!fs.existsSync(dir)) { return res.json([]); }
    const entries = fs.readdirSync(dir, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => ({ name: e.name, path: `${dir}/${e.name}` }));
    res.json(entries);
  } catch (err) { next(err); }
});

app.post('/api/projects/clone', async (req, res, next) => {
  try {
    const { repo } = req.body;
    if (!repo) return res.status(400).json({ error: 'repo is required (owner/name or full URL)' });
    const dir = process.env.PROJECTS_DIR || '/home/claude/projects';
    const ghToken = req.user && req.user.gh;
    // Use token in URL for private repo access
    const url = repo.includes('://') ? repo
      : ghToken ? `https://${ghToken}@github.com/${repo}.git`
      : `https://github.com/${repo}.git`;
    const name = repo.split('/').pop().replace('.git', '');
    const target = `${dir}/${name}`;
    const fs = require('fs');
    if (fs.existsSync(target)) return res.status(409).json({ error: 'Project already exists', path: target });
    console.log(`[Clone] Cloning ${repo} to ${target}`);
    execSync(`git clone --depth 1 "${url}" "${target}"`, { timeout: 120000, stdio: 'pipe' });
    console.log(`[Clone] Success: ${name}`);
    res.status(201).json({ name, path: target });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// REST API — Sessions
// ---------------------------------------------------------------------------

app.get('/api/sessions', async (_req, res, next) => {
  try {
    const list = await sessions.list();
    res.json(list);
  } catch (err) { next(err); }
});

app.post('/api/sessions', async (req, res, next) => {
  try {
    const { name, directory, mode } = req.body;
    if (!name || !directory) {
      return res.status(400).json({ error: 'name and directory are required' });
    }
    const session = await sessions.create({ name, directory, mode: mode || 'claude' });
    res.status(201).json(session);
  } catch (err) { next(err); }
});

app.delete('/api/sessions/:id', async (req, res, next) => {
  try {
    await sessions.kill(req.params.id);
    res.status(204).end();
  } catch (err) { next(err); }
});

app.post('/api/sessions/:id/skill', async (req, res, next) => {
  try {
    const { skill } = req.body;
    if (!skill) {
      return res.status(400).json({ error: 'skill is required' });
    }
    await sessions.sendSkill(req.params.id, skill);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// REST API — System Stats
// ---------------------------------------------------------------------------

app.get('/api/stats', async (_req, res, next) => {
  try {
    const { execSync } = require('child_process');
    // CPU: 1-second average via /proc/stat
    let cpu = 0;
    try {
      const out = execSync("awk '/^cpu / {idle=$5+$6; total=0; for(i=2;i<=NF;i++) total+=$i; print int((total-idle)*100/total)}' /proc/stat", { timeout: 2000 }).toString().trim();
      cpu = parseInt(out) || 0;
    } catch {}
    // Memory
    let mem = { used: 0, total: 0, pct: 0 };
    try {
      const mout = execSync("free -b | awk 'NR==2{print $2,$3}'", { timeout: 2000 }).toString().trim().split(' ');
      const total = parseInt(mout[0]) || 1;
      const used = parseInt(mout[1]) || 0;
      mem = { used, total, pct: Math.round(used * 100 / total) };
    } catch {}
    // Disk
    let disk = { used: 0, total: 0, pct: 0 };
    try {
      const dout = execSync("df -B1 / | awk 'NR==2{print $2,$3,$5}'", { timeout: 2000 }).toString().trim().split(' ');
      disk = { total: parseInt(dout[0]) || 0, used: parseInt(dout[1]) || 0, pct: parseInt(dout[2]) || 0 };
    } catch {}
    res.json({ cpu, mem, disk });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// REST API — Claude Usage
// ---------------------------------------------------------------------------

app.get('/api/claude-usage', async (_req, res, next) => {
  try {
    const credsPath = path.join(process.env.HOME || '/root', '.claude', '.credentials.json');
    let creds;
    try { creds = JSON.parse(fs.readFileSync(credsPath, 'utf-8')); }
    catch { return res.json({ available: false, reason: 'no_credentials' }); }

    const oauth = creds.claudeAiOauth;
    if (!oauth || !oauth.accessToken) return res.json({ available: false, reason: 'no_token' });

    // Try the API; if 401, attempt token refresh then retry once
    async function fetchUsage(token) {
      return fetch('https://api.anthropic.com/api/oauth/usage', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'anthropic-beta': 'oauth-2025-04-20',
          'User-Agent': 'claude-code/2.0.37'
        }
      });
    }

    let resp = await fetchUsage(oauth.accessToken);

    // If unauthorized and we have a refresh token, try refreshing
    if (resp.status === 401 && oauth.refreshToken) {
      try {
        const refreshResp = await fetch('https://api.anthropic.com/oauth/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: oauth.refreshToken })
        });
        if (refreshResp.ok) {
          const tokens = await refreshResp.json();
          const newToken = tokens.access_token;
          // Persist refreshed token back to credentials file
          creds.claudeAiOauth.accessToken = newToken;
          if (tokens.expires_in) creds.claudeAiOauth.expiresAt = Date.now() + tokens.expires_in * 1000;
          if (tokens.refresh_token) creds.claudeAiOauth.refreshToken = tokens.refresh_token;
          try { fs.writeFileSync(credsPath, JSON.stringify(creds, null, 2)); } catch {}
          resp = await fetchUsage(newToken);
        }
      } catch {}
    }

    if (!resp.ok) return res.json({ available: false, reason: `api_${resp.status}` });

    const data = await resp.json();
    const fh = data.five_hour || {};
    const sd = data.seven_day || {};
    res.json({
      available: true,
      five_hour: { pct: Math.round((fh.utilization || 0) * 100), resets_at: fh.resets_at || null },
      seven_day: { pct: Math.round((sd.utilization || 0) * 100), resets_at: sd.resets_at || null }
    });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// REST API — Skills
// ---------------------------------------------------------------------------

app.get('/api/skills', async (_req, res, next) => {
  try {
    const list = await skills.list();
    res.json(list);
  } catch (err) { next(err); }
});


// ---------------------------------------------------------------------------
// Error handler
// ---------------------------------------------------------------------------

app.use((err, _req, res, _next) => {
  console.error('[API Error]', err.message || err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({ error: err.message || 'Internal server error' });
});

// ---------------------------------------------------------------------------
// HTTP(S) server
// ---------------------------------------------------------------------------

let server;

if (TLS_CERT && TLS_KEY) {
  try {
    const cert = fs.readFileSync(TLS_CERT);
    const key = fs.readFileSync(TLS_KEY);
    server = https.createServer({ cert, key }, app);
    console.log('[Server] TLS enabled');
  } catch (err) {
    console.error('[Server] Failed to read TLS files, falling back to HTTP:', err.message);
    server = http.createServer(app);
  }
} else {
  console.log('[Server] No TLS_CERT/TLS_KEY — running plain HTTP (dev mode)');
  server = http.createServer(app);
}

// ---------------------------------------------------------------------------
// WebSocket server — terminal multiplexing
// ---------------------------------------------------------------------------

const wss = new WebSocketServer({ noServer: true });

/**
 * Parse a JWT from the Cookie header.
 * Returns the decoded payload or null.
 */
function verifyTokenFromCookies(cookieHeader) {
  if (!cookieHeader) return null;

  // Parse "name=value; name2=value2" by hand — no need for a full parser
  const cookies = {};
  cookieHeader.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx < 0) return;
    const name = pair.substring(0, idx).trim();
    const value = pair.substring(idx + 1).trim();
    cookies[name] = decodeURIComponent(value);
  });

  const token = cookies.token;
  if (!token) return null;

  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

/**
 * Extract sessionId from the upgrade URL.
 * Expects: /ws/terminal/:sessionId
 */
function parseSessionId(url) {
  const match = url.match(/^\/ws\/terminal\/([^/?]+)/);
  return match ? match[1] : null;
}

// Handle HTTP upgrade requests for WebSocket
server.on('upgrade', (req, socket, head) => {
  const sessionId = parseSessionId(req.url);
  if (!sessionId) {
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
    socket.destroy();
    return;
  }

  const user = validateJWT(req.headers.cookie);
  if (!user) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    ws.user = user;
    ws.sessionId = sessionId;
    wss.emit('connection', ws, req);
  });
});

wss.on('connection', (ws) => {
  const { sessionId } = ws;
  let pty = null;

  (async () => {
    try {
      pty = await sessions.attach(sessionId);
    } catch (err) {
      console.error(`[WS] Failed to attach to session "${sessionId}":`, err.message);
      ws.close(1011, 'Session attach failed');
      return;
    }

    // PTY stdout → WebSocket
    pty.onData((data) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(data);
      }
    });

    // PTY exit → close WebSocket
    pty.onExit(({ exitCode }) => {
      console.log(`[WS] PTY for session "${sessionId}" exited (code ${exitCode})`);
      if (ws.readyState === ws.OPEN) {
        ws.close(1000, 'Session ended');
      }
    });

    // WebSocket messages → PTY stdin (or resize)
    ws.on('message', (data) => {
      // Try to parse as JSON for control messages
      if (typeof data === 'string' || (data instanceof Buffer && data[0] === 0x7b)) {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'resize' && msg.cols && msg.rows) {
            pty.resize(msg.cols, msg.rows);
            return;
          }
        } catch {
          // Not JSON — treat as raw terminal input
        }
      }
      pty.write(data.toString());
    });

    // WebSocket close → detach PTY
    ws.on('close', () => {
      console.log(`[WS] Client disconnected from session "${sessionId}"`);
      if (pty && typeof pty.kill === 'function') {
        // Detach: kill the attach process, not the tmux session
        pty.kill();
      }
    });
  })();
});

// ---------------------------------------------------------------------------
// Start listening
// ---------------------------------------------------------------------------

server.listen(PORT, () => {
  const proto = server instanceof https.Server ? 'https' : 'http';
  console.log(`[Server] Claude Terminal listening on ${proto}://0.0.0.0:${PORT}`);
});

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

function shutdown(signal) {
  console.log(`\n[Server] ${signal} received — shutting down...`);

  // Stop accepting new connections
  wss.close(() => {
    console.log('[Server] WebSocket server closed');
  });

  // Close all active WebSocket connections
  for (const client of wss.clients) {
    client.close(1001, 'Server shutting down');
  }

  server.close(() => {
    console.log('[Server] HTTP server closed');

process.exit(0);
  });

  // Force exit after 5 seconds if graceful shutdown stalls
  setTimeout(() => {
    console.error('[Server] Graceful shutdown timed out — forcing exit');
    process.exit(1);
  }, 5000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
