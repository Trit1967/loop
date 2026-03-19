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

const { router: authRouter, requireAuth } = require('./lib/auth');
const sessions = require('./lib/sessions');
const skills = require('./lib/skills');
const cron = require('./lib/cron');

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

// Auth routes (login, callback, logout, me)
app.use('/auth', authRouter);

// All /api/* routes require authentication
app.use('/api', requireAuth);

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
    const { name, directory } = req.body;
    if (!name || !directory) {
      return res.status(400).json({ error: 'name and directory are required' });
    }
    const session = await sessions.create({ name, directory });
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
// REST API — Skills
// ---------------------------------------------------------------------------

app.get('/api/skills', async (_req, res, next) => {
  try {
    const list = await skills.list();
    res.json(list);
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// REST API — Crons
// ---------------------------------------------------------------------------

app.get('/api/crons', async (_req, res, next) => {
  try {
    const list = await cron.list();
    res.json(list);
  } catch (err) { next(err); }
});

app.post('/api/crons', async (req, res, next) => {
  try {
    const { skill, schedule, directory } = req.body;
    if (!skill || !schedule || !directory) {
      return res.status(400).json({ error: 'skill, schedule, and directory are required' });
    }
    const job = await cron.create({ skill, schedule, directory });
    res.status(201).json(job);
  } catch (err) { next(err); }
});

app.delete('/api/crons/:id', async (req, res, next) => {
  try {
    await cron.remove(req.params.id);
    res.status(204).end();
  } catch (err) { next(err); }
});

app.get('/api/crons/:id/history', async (req, res, next) => {
  try {
    const history = await cron.history(req.params.id);
    res.json(history);
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

  const user = verifyTokenFromCookies(req.headers.cookie);
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

    // Clean up cron jobs
    try { cron.shutdown(); } catch { /* ignore */ }

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
