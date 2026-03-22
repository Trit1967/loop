const { execSync, execFileSync } = require('child_process');

const NAME_RE = /^[a-zA-Z0-9_-]+$/;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function exec(cmd) {
  return execSync(cmd, { encoding: 'utf-8', timeout: 10000 }).trim();
}

// Shell-free exec: passes args as an array, no shell parsing
function execF(file, args, opts = {}) {
  return execFileSync(file, args, { encoding: 'utf-8', timeout: 10000, ...opts }).trim();
}

function isTmuxRunning() {
  try {
    execSync('tmux list-sessions', { encoding: 'utf-8', stdio: 'pipe', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

function validateName(name) {
  if (!name || typeof name !== 'string') {
    throw new Error('Session name is required');
  }
  if (!NAME_RE.test(name)) {
    throw new Error('Session name must be alphanumeric, dashes, or underscores only');
  }
}

// ---------------------------------------------------------------------------
// list()
// ---------------------------------------------------------------------------

function list() {
  if (!isTmuxRunning()) return [];

  try {
    const raw = exec('tmux list-sessions -F "#{session_name}:#{session_path}:#{session_created}"');
    if (!raw) return [];

    return raw.split('\n').filter(Boolean).map((line) => {
      const [name, directory, createdTs] = line.split(':');
      return {
        id: name,
        name,
        directory: directory || '',
        created: createdTs ? new Date(parseInt(createdTs, 10) * 1000).toISOString() : null,
      };
    });
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// create({ name, directory })
// ---------------------------------------------------------------------------

function create({ name, directory, mode }) {
  validateName(name);

  const dir = directory || process.env.HOME || '/tmp';

  execF('tmux', ['new-session', '-d', '-s', name, '-c', dir]);

  // Configure tmux server for low-latency interactive use.
  try { exec('tmux set-option -sg escape-time 0'); } catch {}
  try { exec('tmux set-option -g default-terminal "tmux-256color"'); } catch {}
  // Hide the tmux status bar — we have our own UI chrome
  try { exec('tmux set-option -g status off'); } catch {}

  // Fill the pane with blank lines so the prompt anchors near the bottom.
  execF('tmux', ['send-keys', '-t', name, 'printf "\\n%.0s" {1..60}', 'Enter']);

  // Start Claude Code unless mode is 'bash'
  if (mode !== 'bash') {
    execF('tmux', ['send-keys', '-t', name, 'claude', 'Enter']);
    // Auto-confirm the trust dialog — Loop sessions are always user-initiated
    // from authenticated project selections, so trust is implicit.
    // Send Enter after startup delay; ignore if session has gone away.
    setTimeout(() => {
      try { execFileSync('tmux', ['send-keys', '-t', name, 'Enter'], { timeout: 3000, stdio: 'pipe' }); } catch {}
    }, 2500);
  }

  return {
    id: name,
    name,
    directory: dir,
    created: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// kill(id)
// ---------------------------------------------------------------------------

function kill(id) {
  validateName(id);

  if (!exists(id)) {
    throw new Error(`Session "${id}" not found`);
  }

  const escapedId = id.replace(/'/g, "'\\''");
  exec(`tmux kill-session -t '${escapedId}'`);
}

// ---------------------------------------------------------------------------
// sendSkill(id, skillName)
// ---------------------------------------------------------------------------

function sendSkill(id, skillName) {
  validateName(id);

  if (!skillName || typeof skillName !== 'string') {
    throw new Error('Skill name is required');
  }

  if (!exists(id)) {
    throw new Error(`Session "${id}" not found`);
  }

  execF('tmux', ['send-keys', '-t', id, `/${skillName}`, 'Enter']);
}

// ---------------------------------------------------------------------------
// attach(sessionId) — returns a node-pty process
// ---------------------------------------------------------------------------

function attach(sessionId) {
  validateName(sessionId);

  if (!exists(sessionId)) {
    throw new Error(`Session "${sessionId}" not found`);
  }

  const pty = require('node-pty');
  const escapedId = sessionId.replace(/'/g, "'\\''");

  const proc = pty.spawn('tmux', ['attach-session', '-t', escapedId], {
    name: 'xterm-256color',
    cols: 120,
    rows: 40,
    cwd: process.env.HOME || '/tmp',
    env: process.env,
  });

  return proc;
}

// ---------------------------------------------------------------------------
// exists(id)
// ---------------------------------------------------------------------------

function exists(id) {
  if (!id || typeof id !== 'string') return false;
  if (!isTmuxRunning()) return false;

  try {
    const escapedId = id.replace(/'/g, "'\\''");
    exec(`tmux has-session -t '${escapedId}'`);
    return true;
  } catch {
    return false;
  }
}

module.exports = { list, create, kill, sendSkill, attach, exists };
