const { execSync } = require('child_process');

const NAME_RE = /^[a-zA-Z0-9_-]+$/;

// ---------------------------------------------------------------------------
// Token usage accumulator — resets daily, fed by PTY output scanning
// ---------------------------------------------------------------------------

const ANSI_RE = /\x1b\[[0-9;]*[a-zA-Z]/g;
// Matches: "Tokens: 15,234 input · 2,891 output" or "15.2k input, 2.9k output"
const TOKEN_RE = /[Tt]okens?:\s*([\d,k.]+)\s+input\W+([\d,k.]+)\s+output/;

let _usageDay = new Date().toDateString();
let _usage = { input: 0, output: 0 };

function _parseTok(s) {
  const c = s.replace(/,/g, '');
  if (/k$/i.test(c)) return Math.round(parseFloat(c) * 1000);
  if (/m$/i.test(c)) return Math.round(parseFloat(c) * 1e6);
  return parseInt(c) || 0;
}

function scanTokens(data) {
  const today = new Date().toDateString();
  if (today !== _usageDay) { _usageDay = today; _usage = { input: 0, output: 0 }; }
  const text = (typeof data === 'string' ? data : data.toString()).replace(ANSI_RE, '');
  const m = TOKEN_RE.exec(text);
  if (m) { _usage.input += _parseTok(m[1]); _usage.output += _parseTok(m[2]); }
}

function getUsage() { return { ..._usage }; }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function exec(cmd) {
  return execSync(cmd, { encoding: 'utf-8', timeout: 10000 }).trim();
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
  const escapedName = name.replace(/'/g, "'\\''");
  const escapedDir = dir.replace(/'/g, "'\\''");

  exec(`tmux new-session -d -s '${escapedName}' -c '${escapedDir}'`);

  // Start Claude Code unless mode is 'bash'
  if (mode !== 'bash') {
    exec(`tmux send-keys -t '${escapedName}' 'claude' Enter`);
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

  const escapedId = id.replace(/'/g, "'\\''");
  const escapedSkill = skillName.replace(/'/g, "'\\''");
  exec(`tmux send-keys -t '${escapedId}' '/${escapedSkill}' Enter`);
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

module.exports = { list, create, kill, sendSkill, attach, exists, scanTokens, getUsage };
