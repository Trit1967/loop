const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync, exec } = require('child_process');
const cron = require('node-cron');

const DATA_DIR = path.join(__dirname, '..', 'data');
const CRONS_FILE = path.join(DATA_DIR, 'crons.json');
const HISTORY_FILE = path.join(DATA_DIR, 'cron-history.json');

const POLL_INTERVAL_MS = 5000;
const EXECUTION_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const OUTPUT_MAX_CHARS = 5000;

/** Active node-cron tasks keyed by cron ID */
const activeTasks = new Map();

/**
 * Ensure the data directory and a JSON file exist.
 */
function ensureFile(filePath, defaultContent) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultContent, null, 2), 'utf-8');
  }
}

function readJSON(filePath, defaultContent) {
  ensureFile(filePath, defaultContent);
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return defaultContent;
  }
}

function writeJSON(filePath, data) {
  ensureFile(filePath, []);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

function loadCrons() {
  return readJSON(CRONS_FILE, []);
}

function saveCrons(crons) {
  writeJSON(CRONS_FILE, crons);
}

function loadHistory() {
  return readJSON(HISTORY_FILE, []);
}

function saveHistory(history) {
  writeJSON(HISTORY_FILE, history);
}

/**
 * Execute a cron job: run the skill via claude --print in a tmux session,
 * capture output, and save to history.
 */
async function executeCron(cronJob) {
  const timestamp = Date.now();
  const sessionName = `cron-${cronJob.id}-${timestamp}`;
  const startedAt = new Date().toISOString();
  let output = '';
  let success = false;

  try {
    // 1. Create a detached tmux session in the specified directory
    execSync(
      `tmux new-session -d -s "${sessionName}" -c "${cronJob.directory}"`,
      { stdio: 'ignore' }
    );

    // 2. Send the claude command
    execSync(
      `tmux send-keys -t "${sessionName}" "claude --print '/${cronJob.skill}'" Enter`,
      { stdio: 'ignore' }
    );

    // 3. Wait for the tmux session to end (poll every 5s, timeout 10 min)
    const deadline = Date.now() + EXECUTION_TIMEOUT_MS;
    let sessionAlive = true;

    while (sessionAlive && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
      try {
        execSync(`tmux has-session -t "${sessionName}"`, { stdio: 'ignore' });
        sessionAlive = true;
      } catch {
        // has-session returns non-zero when session doesn't exist
        sessionAlive = false;
      }
    }

    // 4. Capture output if session is still alive
    if (sessionAlive) {
      try {
        execSync(`tmux capture-pane -t "${sessionName}" -p -S -`, { stdio: 'ignore' });
        output = execSync(`tmux capture-pane -t "${sessionName}" -p -S -`, {
          encoding: 'utf-8',
          timeout: 5000,
        });
      } catch {
        output = '(failed to capture output)';
      }
    } else {
      // Session ended on its own -- try to capture from buffer before it vanished
      output = '(session ended before output could be captured)';
    }

    success = !sessionAlive; // Completed naturally = success
  } catch (err) {
    output = `Execution error: ${err.message}`;
    success = false;
  } finally {
    // 7. Kill the tmux session if it's still running
    try {
      execSync(`tmux kill-session -t "${sessionName}"`, { stdio: 'ignore' });
    } catch {
      // Already gone
    }
  }

  // 6. Truncate output and save to history
  const truncatedOutput = output.length > OUTPUT_MAX_CHARS
    ? output.slice(0, OUTPUT_MAX_CHARS)
    : output;

  const finishedAt = new Date().toISOString();
  const historyEntry = {
    cronId: cronJob.id,
    startedAt,
    finishedAt,
    output: truncatedOutput,
    success,
  };

  const allHistory = loadHistory();
  allHistory.push(historyEntry);
  saveHistory(allHistory);
}

/**
 * Schedule a single cron job with node-cron.
 */
function scheduleCron(cronJob) {
  if (!cronJob.enabled) return;
  if (activeTasks.has(cronJob.id)) return;

  const task = cron.schedule(cronJob.schedule, () => {
    executeCron(cronJob).catch(err => {
      console.error(`Cron ${cronJob.id} execution failed:`, err.message);
    });
  });

  activeTasks.set(cronJob.id, task);
}

/**
 * Initialize the cron system: load saved crons and schedule enabled ones.
 */
function init() {
  const crons = loadCrons();
  for (const cronJob of crons) {
    scheduleCron(cronJob);
  }
}

/**
 * List all cron jobs with their config and enabled status.
 */
function list() {
  return loadCrons();
}

/**
 * Create a new cron job.
 * @param {Object} opts
 * @param {string} opts.skill - Skill/command name to run
 * @param {string} opts.schedule - Cron expression (validated by node-cron)
 * @param {string} opts.directory - Working directory for execution
 * @param {string} opts.name - Human-readable name
 * @returns {Object} The created cron object
 */
function create({ skill, schedule, directory, name }) {
  if (!cron.validate(schedule)) {
    throw new Error(`Invalid cron expression: ${schedule}`);
  }

  const cronJob = {
    id: crypto.randomUUID(),
    name: name || skill,
    skill,
    schedule,
    directory: directory || process.cwd(),
    enabled: true,
    createdAt: new Date().toISOString(),
  };

  const crons = loadCrons();
  crons.push(cronJob);
  saveCrons(crons);

  scheduleCron(cronJob);

  return cronJob;
}

/**
 * Remove a cron job by ID. Stops the scheduled task and removes from storage.
 */
function remove(id) {
  const task = activeTasks.get(id);
  if (task) {
    task.stop();
    activeTasks.delete(id);
  }

  const crons = loadCrons();
  const idx = crons.findIndex(c => c.id === id);
  if (idx === -1) {
    throw new Error(`Cron not found: ${id}`);
  }

  const removed = crons.splice(idx, 1)[0];
  saveCrons(crons);

  return removed;
}

/**
 * Get run history for a specific cron job.
 */
function history(id) {
  const allHistory = loadHistory();
  return allHistory.filter(entry => entry.cronId === id);
}

module.exports = { init, list, create, remove, history };
