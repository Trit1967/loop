const fs = require('fs');
const path = require('path');

/**
 * Parse YAML frontmatter from markdown content.
 * Expects content starting with --- delimiter.
 * Returns parsed key-value pairs or empty object.
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};

  const frontmatter = {};
  const lines = match[1].split(/\r?\n/);
  for (const line of lines) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    // Strip surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key) frontmatter[key] = value;
  }
  return frontmatter;
}

/**
 * Count files in a directory (non-recursive).
 */
function countFiles(dirPath) {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    return entries.filter(e => e.isFile()).length;
  } catch {
    return 0;
  }
}

/**
 * Scan skill directories. Each subdirectory in CLAUDE_SKILLS_DIR
 * that contains SKILL.md or skill.md is treated as a skill.
 */
function scanSkills(skillsDir) {
  const skills = [];
  if (!skillsDir) return skills;

  let entries;
  try {
    entries = fs.readdirSync(skillsDir, { withFileTypes: true });
  } catch {
    return skills;
  }

  for (const entry of entries) {
    // Follow symlinks — isDirectory() returns false for symlinks-to-directories
    const dirPath = path.join(skillsDir, entry.name);
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    try { if (!fs.statSync(dirPath).isDirectory()) continue; } catch { continue; }
    const skillMdPath = ['SKILL.md', 'skill.md']
      .map(f => path.join(dirPath, f))
      .find(f => fs.existsSync(f));

    if (!skillMdPath) continue;

    let frontmatter = {};
    try {
      const content = fs.readFileSync(skillMdPath, 'utf-8');
      frontmatter = parseFrontmatter(content);
    } catch {
      // Proceed with defaults
    }

    skills.push({
      id: entry.name,
      name: frontmatter.name || entry.name,
      description: frontmatter.description || '',
      type: frontmatter.type === 'loop-skill' ? 'loop-skill' : 'skill',
      path: dirPath,
      fileCount: countFiles(dirPath),
    });
  }

  return skills;
}

/**
 * Scan command files. Each .md file in CLAUDE_COMMANDS_DIR
 * is treated as a command.
 */
function scanCommands(commandsDir) {
  const commands = [];
  if (!commandsDir) return commands;

  let entries;
  try {
    entries = fs.readdirSync(commandsDir, { withFileTypes: true });
  } catch {
    return commands;
  }

  for (const entry of entries) {
    if (!entry.name.endsWith('.md')) continue;
    // Follow symlinks — isFile() returns false for symlinks-to-files
    const filePath = path.join(commandsDir, entry.name);
    if (!entry.isFile() && !entry.isSymbolicLink()) continue;
    try { if (!fs.statSync(filePath).isFile()) continue; } catch { continue; }
    const baseName = entry.name.replace(/\.md$/, '');

    let frontmatter = {};
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      frontmatter = parseFrontmatter(content);
    } catch {
      // Proceed with defaults
    }

    const name = frontmatter.name || baseName;

    commands.push({
      id: 'cmd-' + name,
      name,
      description: frontmatter.description || '',
      type: 'command',
      path: filePath,
      fileCount: 1,
    });
  }

  return commands;
}

/**
 * List all skills and commands.
 * Reads CLAUDE_SKILLS_DIR and CLAUDE_COMMANDS_DIR from process.env.
 * Returns sorted array: skills first (alphabetical), then commands (alphabetical).
 */
function list() {
  const skillsDir = process.env.CLAUDE_SKILLS_DIR || null;
  const commandsDir = process.env.CLAUDE_COMMANDS_DIR || null;

  const skills = scanSkills(skillsDir);
  const commands = scanCommands(commandsDir);

  skills.sort((a, b) => a.name.localeCompare(b.name));
  commands.sort((a, b) => a.name.localeCompare(b.name));

  return [...skills, ...commands];
}

module.exports = { list };
