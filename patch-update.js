/**
 * Patch cloudcli's update endpoint to work on Windows.
 *
 * 1. Replaces hardcoded `spawn('sh', ...)` with platform-aware `cmd.exe` / `sh`.
 * 2. Replaces `npm install -g` (global) with local `npm install` so the project's
 *    own node_modules gets updated, not the global prefix.
 * 3. Forces cwd to projectRoot on Windows (npm install needs the project's
 *    package.json / node_modules layout; os.homedir() doesn't have it).
 *
 * Runs after every `npm install` to survive dependency reinstall.
 */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const targets = [
  join(__dirname, 'node_modules', '@cloudcli-ai', 'cloudcli', 'server', 'index.js'),
  join(__dirname, 'node_modules', '@cloudcli-ai', 'cloudcli', 'dist-server', 'server', 'index.js'),
];

// ---------------------------------------------------------------------------
// Patch 1 — spawn shell
// ---------------------------------------------------------------------------
const oldSpawn = "spawn('sh', ['-c', updateCommand], {";
const newSpawn = "spawn(process.platform === 'win32' ? 'cmd.exe' : 'sh', [process.platform === 'win32' ? '/c' : '-c', updateCommand], {";

// ---------------------------------------------------------------------------
// Patch 2 — npm install (drop -g, add --force)
// ---------------------------------------------------------------------------
const oldNpmInstall = "npm install -g @cloudcli-ai/cloudcli@latest'";
const newNpmInstall = "npm install @cloudcli-ai/cloudcli@latest --force'";

// ---------------------------------------------------------------------------
// Patch 3 — cwd: use projectRoot on Windows instead of os.homedir()
// ---------------------------------------------------------------------------
const oldCwd =
  "const updateCwd = IS_PLATFORM || installMode === 'git'\n" +
  '            ? projectRoot\n' +
  '            : os.homedir();';
const newCwd =
  "const updateCwd = process.platform === 'win32'\n" +
  '            ? projectRoot\n' +
  "            : IS_PLATFORM || installMode === 'git'\n" +
  '                ? projectRoot\n' +
  '                : os.homedir();';

let patched = 0;
for (const file of targets) {
  try {
    let code = readFileSync(file, 'utf-8');
    const original = code;

    // Patch 1 — spawn shell
    if (code.includes(oldSpawn)) {
      code = code.replace(oldSpawn, newSpawn);
      console.log(`  ✓ spawn shell → ${file}`);
      patched++;
    } else if (code.includes(newSpawn)) {
      console.log(`  → spawn shell already patched: ${file}`);
    } else {
      console.log(`  ⚠ spawn pattern not found: ${file}`);
    }

    // Patch 2 — npm install
    if (code.includes(oldNpmInstall)) {
      code = code.replace(oldNpmInstall, newNpmInstall);
      console.log(`  ✓ npm local install → ${file}`);
      patched++;
    } else if (code.includes(newNpmInstall)) {
      console.log(`  → npm local install already patched: ${file}`);
    } else {
      console.log(`  ⚠ npm install pattern not found: ${file}`);
    }

    // Patch 3 — cwd
    if (code.includes(oldCwd)) {
      code = code.replace(oldCwd, newCwd);
      console.log(`  ✓ cwd → ${file}`);
      patched++;
    } else if (code.includes(newCwd)) {
      console.log(`  → cwd already patched: ${file}`);
    } else {
      console.log(`  ⚠ cwd pattern not found: ${file}`);
    }

    if (code !== original) {
      writeFileSync(file, code, 'utf-8');
    }
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.log(`  - skipped (not found): ${file}`);
    } else {
      console.error(`  ✗ error ${file}: ${err.message}`);
    }
  }
}

if (patched > 0) {
  console.log(`Update patch applied (${patched} change${patched > 1 ? 's' : ''}).`);
}