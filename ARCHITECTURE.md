# Claude Terminal Platform — Architecture

**Domain:** `your-domain.com`
**VPS:** Hetzner CX22 (4GB RAM, 2 vCPU, 40GB SSD, ~$4.50/mo)
**OS:** Ubuntu 24.04

## System Diagram

```
Browser (your-domain.com)
│
│  HTTPS / WSS (Cloudflare edge TLS)
│
├─ Cloudflare (WAF, IP rules, DDoS, WebSocket proxy)
│  │
│  └─ Origin: VPS :443 (Cloudflare origin cert)
│     │
│     └─ Session Daemon (Node.js)
│        ├─ Static files ──── public/index.html (dashboard)
│        ├─ REST API ──────── /api/sessions, /api/skills, /api/crons
│        ├─ WebSocket ─────── /ws/terminal/:id (xterm ↔ PTY)
│        ├─ GitHub OAuth ──── /auth/login, /auth/callback, /auth/logout
│        └─ node-pty ──────── tmux
│                              ├─ session-0 → claude (clawdbot repo)
│                              ├─ session-1 → claude (other repo)
│                              └─ cron-job-3 → claude /full-stack-tester
```

## Security Layers

```
Layer 1 │ Cloudflare WAF + IP Access Rules (only allowed IPs)
Layer 2 │ Cloudflare TLS (edge) + Origin Certificate (VPS)
Layer 3 │ UFW: 443 → Cloudflare IPs only, 22 → admin IP only
Layer 4 │ GitHub OAuth2 (must authenticate with GitHub)
Layer 5 │ Username allowlist (only "your-github-user" gets a JWT)
Layer 6 │ JWT cookie (httpOnly, secure, sameSite=strict)
```

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| HTTP server | Express | REST API, static files, OAuth routes |
| WebSocket | ws | Real-time terminal I/O |
| Terminal | node-pty | Spawn PTY processes |
| Persistence | tmux | Session survival across disconnects |
| Auth | GitHub OAuth2 | Identity verification |
| Sessions | jsonwebtoken | Stateless session cookies |
| Scheduling | node-cron | Skill automation |
| Terminal UI | xterm.js + WebGL | Browser terminal rendering |
| Canvas | HTML5 Canvas | Animated background effects |
| TLS | Cloudflare origin cert | End-to-end encryption |

## File Structure

```
platform/claude-terminal/
├── ARCHITECTURE.md          # This file
├── package.json             # Dependencies
├── server.js                # Entry point — Express + WebSocket + static
├── lib/
│   ├── auth.js              # GitHub OAuth + JWT middleware
│   ├── sessions.js          # tmux session management via node-pty
│   ├── skills.js            # Skill scanning from ~/.claude/skills/
│   └── cron.js              # Cron job scheduler + run history
├── public/
│   └── index.html           # Dashboard (canvas + xterm.js + widgets)
├── scripts/
│   ├── setup-vps.sh         # VPS provisioning (root)
│   └── deploy.sh            # Push + restart (local → VPS)
├── .env.example             # Required environment variables
└── claude-terminal.service  # systemd unit file
```

## API Endpoints

### Auth

| Method | Path | Description |
|--------|------|-------------|
| GET | `/auth/login` | Redirect to GitHub OAuth |
| GET | `/auth/callback` | GitHub callback, issue JWT |
| POST | `/auth/logout` | Clear JWT cookie |
| GET | `/auth/me` | Current user info |

### Sessions

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/sessions` | List all tmux sessions |
| POST | `/api/sessions` | Create session (body: `{name, directory}`) |
| DELETE | `/api/sessions/:id` | Kill a session |
| POST | `/api/sessions/:id/skill` | Inject skill command (body: `{skill}`) |

### Skills

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/skills` | List all skills with metadata |
| POST | `/api/skills/:name/install` | Install a skill to VPS |
| DELETE | `/api/skills/:name` | Remove a skill |

### Crons

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/crons` | List scheduled jobs |
| POST | `/api/crons` | Create job (body: `{skill, schedule, directory}`) |
| DELETE | `/api/crons/:id` | Remove a job |
| GET | `/api/crons/:id/history` | Run history for a job |

### WebSocket

| Path | Protocol | Description |
|------|----------|-------------|
| `/ws/terminal/:sessionId` | Binary frames | Bidirectional PTY I/O |

WebSocket upgrade requires valid JWT cookie. Each frame is raw terminal data.

## Auth Flow

```
1. GET your-domain.com → no JWT cookie → 302 /auth/login
2. GET /auth/login → 302 github.com/login/oauth/authorize?client_id=X
3. User authorizes → GitHub 302 /auth/callback?code=X
4. POST github.com/login/oauth/access_token → access_token
5. GET api.github.com/user → { login: "your-github-user" }
6. Check login ∈ ALLOWED_USERS → issue JWT cookie
7. 302 / → dashboard loads with valid cookie
```

## Session Lifecycle

```
Create:
  1. tmux new-session -d -s {name} -c {directory}
  2. tmux send-keys -t {name} "claude" Enter
  3. Record in sessions.json

Connect (browser):
  1. WebSocket upgrade to /ws/terminal/{name}
  2. Validate JWT from cookie
  3. Attach node-pty to: tmux attach-session -t {name}
  4. Pipe PTY ↔ WebSocket bidirectionally

Disconnect (browser closes):
  → WebSocket closes, PTY detaches
  → tmux session continues running

Reconnect:
  → Same as Connect — reattaches to existing tmux session

Kill:
  1. tmux kill-session -t {name}
  2. Remove from sessions.json
```

## Cron Execution

```
Trigger (node-cron fires):
  1. tmux new-session -d -s "cron-{id}-{timestamp}" -c {directory}
  2. tmux send-keys "claude --print '/skill-name' 2>&1 | tee /tmp/cron-{id}.log" Enter
  3. Monitor for exit
  4. Save output to cron history
  5. tmux kill-session -t "cron-{id}-{timestamp}"
```

## Environment Variables

```env
# GitHub OAuth
GITHUB_CLIENT_ID=xxx
GITHUB_CLIENT_SECRET=xxx
GITHUB_CALLBACK_URL=https://your-domain.com/auth/callback
ALLOWED_USERS=your-github-user

# JWT
JWT_SECRET=xxx (random 64-char string)

# Server
PORT=443
TLS_CERT=/etc/ssl/cloudflare/origin.pem
TLS_KEY=/etc/ssl/cloudflare/origin-key.pem

# Claude
CLAUDE_SKILLS_DIR=/home/claude/.claude/skills
PROJECTS_DIR=/home/claude/projects
```

## Dashboard Layout

```
┌──────────────────────────────────────────────────────────┐
│  your-domain.com              @your-github-user  ◐  [logout]   │
├──────────┬───────────────────────────────────────────────┤
│          │  ╔═══════════════════════════════════════════╗ │
│  SKILLS  │  ║  animated particle canvas background     ║ │
│          │  ║                                           ║ │
│  ◉ test  │  ║  ┌─────────────────────────────────────┐ ║ │
│  ◉ build │  ║  │ Session 1 │ Session 2 │  [+]        │ ║ │
│  ◉ grill │  ║  ├─────────────────────────────────────┤ ║ │
│  ◉ audit │  ║  │                                     │ ║ │
│          │  ║  │  $ claude                           │ ║ │
│ ──────── │  ║  │  > What would you like to work on?  │ ║ │
│          │  ║  │  █                                   │ ║ │
│  CRONS   │  ║  │                                     │ ║ │
│          │  ║  └─────────────────────────────────────┘ ║ │
│  + new   │  ║                                           ║ │
│          │  ╚═══════════════════════════════════════════╝ │
│  ┌────┐  │                                               │
│  │drop│  │                                               │
│  │zone│  │                                               │
│  └────┘  │                                               │
└──────────┴───────────────────────────────────────────────┘
```
