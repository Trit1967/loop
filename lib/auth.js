const express = require('express');
const crypto = require('crypto');

const router = express.Router();

const COOKIE_NAME = 'claude_session';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days in ms
const JWT_EXPIRY = 7 * 24 * 60 * 60; // 7 days in seconds

// ---------------------------------------------------------------------------
// JWT helpers (HMAC-SHA256, no external dependency)
// ---------------------------------------------------------------------------

function base64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

function signJWT(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + JWT_EXPIRY };

  const segments = [base64url(JSON.stringify(header)), base64url(JSON.stringify(body))];
  const signingInput = segments.join('.');
  const signature = crypto.createHmac('sha256', secret).update(signingInput).digest();
  segments.push(base64url(signature));
  return segments.join('.');
}

function verifyJWT(token, secret) {
  if (!token || typeof token !== 'string') return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;

  try {
    const signingInput = parts[0] + '.' + parts[1];
    const expected = crypto.createHmac('sha256', secret).update(signingInput).digest('base64url');
    if (expected !== parts[2]) return null;

    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;

    return payload;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Cookie parsing
// ---------------------------------------------------------------------------

function parseCookie(cookieHeader, name) {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

// ---------------------------------------------------------------------------
// GitHub API helpers (native fetch — Node 18+)
// ---------------------------------------------------------------------------

async function exchangeCodeForToken(code) {
  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
    }),
  });

  if (!res.ok) {
    throw new Error(`GitHub token exchange failed: ${res.status}`);
  }

  const data = await res.json();
  if (data.error) {
    throw new Error(`GitHub OAuth error: ${data.error_description || data.error}`);
  }
  return data.access_token;
}

async function fetchGitHubUser(accessToken) {
  const res = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'claude-terminal',
    },
  });

  if (!res.ok) {
    throw new Error(`GitHub user fetch failed: ${res.status}`);
  }

  return res.json();
}

// ---------------------------------------------------------------------------
// Exported: validateJWT(cookieHeader) — for WebSocket auth
// ---------------------------------------------------------------------------

function validateJWT(cookieHeader) {
  const secret = process.env.JWT_SECRET;
  if (!secret) return null;

  const token = parseCookie(cookieHeader, COOKIE_NAME);
  return verifyJWT(token, secret);
}

// ---------------------------------------------------------------------------
// Middleware: requireAuth
// ---------------------------------------------------------------------------

function requireAuth(req, res, next) {
  const payload = validateJWT(req.headers.cookie);
  if (!payload) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  req.user = payload;
  next();
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// GET /auth/login — redirect to GitHub OAuth authorize
router.get('/login', (req, res) => {
  const params = new URLSearchParams({
    client_id: process.env.GITHUB_CLIENT_ID,
    redirect_uri: process.env.GITHUB_CALLBACK_URL,
    scope: 'read:user repo',
  });
  res.redirect(`https://github.com/login/oauth/authorize?${params}`);
});

// GET /auth/callback — exchange code, verify user, issue JWT
router.get('/callback', async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) {
      return res.status(400).send('Missing code parameter');
    }

    const accessToken = await exchangeCodeForToken(code);
    const ghUser = await fetchGitHubUser(accessToken);

    // Check allow-list
    const allowed = (process.env.ALLOWED_USERS || '')
      .split(',')
      .map((u) => u.trim().toLowerCase())
      .filter(Boolean);

    if (allowed.length > 0 && !allowed.includes(ghUser.login.toLowerCase())) {
      return res.status(403).send('Access denied: user not in ALLOWED_USERS');
    }

    // Issue JWT (include GitHub token for repo listing)
    const token = signJWT(
      { sub: ghUser.login, avatar: ghUser.avatar_url, gh: accessToken },
      process.env.JWT_SECRET,
    );

    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: COOKIE_MAX_AGE,
    });

    res.redirect('/');
  } catch (err) {
    console.error('[auth] callback error:', err.message);
    res.status(500).send('Authentication failed');
  }
});

// GET /auth/logout — clear cookie, redirect
router.get('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
  });
  res.redirect('/auth/login');
});

// GET /auth/me — return current user from JWT
router.get('/me', requireAuth, (req, res) => {
  res.json({
    username: req.user.sub,
    avatar: req.user.avatar,
    iat: req.user.iat,
    exp: req.user.exp,
  });
});

module.exports = { router, requireAuth, validateJWT };
