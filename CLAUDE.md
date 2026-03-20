# CLAUDE.md — Loop Terminal

## What This Is

Loop Terminal — a remote Claude Code session manager at `loop.seafin.ai`. Three-panel dashboard (skills sidebar, terminal workspace, context panel) with GitHub OAuth, tmux session persistence, and workflow layouts.

## Design Context

### Users
Solo developer (Rob) managing multiple Claude Code sessions on a remote VPS. Primary device: desktop. Uses this daily to spin up sessions against GitHub repos, run skills, and monitor system health. Power user who values density, speed, and keyboard shortcuts.

### Brand Personality
**Bold, technical, alive.** This is a command center — not a passive dashboard. It should feel like sitting at mission control with everything visible and responsive. High-energy engineering with visible systems and dynamic feedback.

### Emotional Goal
**Control & power.** Opening Loop should feel like having everything at your fingertips. Nothing hidden, nothing ambiguous. The interface should make you feel capable and in command.

### Aesthetic Direction
**Reference: Linear.app** — Clean, fast, keyboard-first. Sharp accent colors against a dark base. Strong typographic hierarchy. Every element is purposeful.

**Tone:** Dark mode, warm-tinted. Not cold blue — warm charcoal with personality. Surfaces differentiated by subtle tone shifts, not heavy borders or shadows.

**Palette — 4 Wire Colors (muted, not neon):**
- Teal `#4db8c2` — primary actions, active states, links
- Dusty Rose `#c75878` — secondary emphasis, quick actions
- Sage `#5cb87a` — status, success, live indicators
- Gold `#c9a040` — schedules, warnings, tertiary accent

**Typography:**
- UI: Space Grotesk (distinctive geometric sans, readable at all sizes)
- Terminal/code only: JetBrains Mono
- Minimum readable size: 13px body, 11px labels
- Hierarchy through weight and size, not decoration

**Canvas:** Particle mesh background using the 4 wire colors at low opacity. Subtle, alive, not distracting.

### Anti-References
- **Retro terminal** — No green-on-black, no CRT scan lines, no faux-vintage aesthetics
- **Neon/gaming** — No glowing borders, no cyberpunk
- **AI slop patterns** — No gradient text, no glassmorphism, no cyan-on-dark neon, no ALL CAPS labels, no glow box-shadows

### Design Principles
1. **The terminal is the star.** Everything else is context that supports the active session. Sidebar and panel should never compete for attention with the terminal.
2. **Readable first.** Font sizes that work on a real screen. No 9px labels. If you squint, it's too small.
3. **Warm, not cold.** Tint neutrals warm. Pure gray feels dead. A slight warmth in the dark backgrounds creates subconscious comfort.
4. **Motion means something.** 120ms ease-out for state changes. No bounce, no elastic. The particle canvas provides ambient life — UI transitions should be fast and functional.
5. **Earn every element.** No decorative glows. No redundant labels. No uppercase for style. Every pixel teaches, informs, or enables action.

## Tech Stack
- Server: Node.js + Express + ws + node-pty
- Terminal: xterm.js + WebGL addon
- Auth: GitHub OAuth2 + JWT
- Sessions: tmux
- Deployment: Hetzner VPS, Cloudflare TLS

## Key Commands
```bash
# Deploy — push to master, GitHub Actions handles the rest
git push origin master
# Actions runs: git fetch && git reset --hard origin/master && systemctl restart claude-terminal

# Logs (via SSH if needed)
ssh -i ~/.ssh/VPS_KEY root@VPS_IP "journalctl -u claude-terminal -n 20"

# Self-hosted runner on VPS — push triggers deploy in ~10s, no SSH secrets needed
# Runner installed at /opt/actions-runner, runs as systemd service (auto-starts)
```
