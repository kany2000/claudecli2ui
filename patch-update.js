/**
 * Patch cloudcli's update endpoint to work on Windows.
 *
 * 1. Replaces hardcoded `spawn('sh', ...)` with platform-aware `cmd.exe` / `sh`.
 * 2. Replaces `npm install -g` (global) with local `npm install` so the project's
 *    own node_modules gets updated, not the global prefix.
 * 3. Fixes cwd to process.cwd() on Windows so npm installs into the correct
 *    project root instead of inside node_modules (which creates nested installs).
 * 4. Adds /api/system/version endpoint for upgrade verification.
 * 5. Changes static asset cache to must-revalidate so browser picks up new
 *    frontend bundle after upgrade.
 * 6. Adds .updating sentinel file around the update process so the watchdog
 *    doesn't kill the server while npm install is still running.
 * 7. Enables SO_REUSEADDR on the server socket to prevent EADDRINUSE crash
 *    loops on Windows (TIME_WAIT prevents immediate port reuse).
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
// Patch 3 — cwd: use process.cwd() on Windows instead of projectRoot
//            projectRoot points inside node_modules, which confuses npm
//            about where to install the updated package (it creates a
//            nested node_modules instead of updating the top-level one).
// ---------------------------------------------------------------------------
const oldCwd =
  "const updateCwd = IS_PLATFORM || installMode === 'git'\n" +
  '            ? projectRoot\n' +
  '            : os.homedir();';
const patchedCwd =
  "const updateCwd = process.platform === 'win32'\n" +
  '            ? process.cwd()\n' +
  "            : IS_PLATFORM || installMode === 'git'\n" +
  '                ? projectRoot\n' +
  '                : os.homedir();';

// ---------------------------------------------------------------------------
// Patch 3b — cwd: already has Windows check but uses projectRoot.
//            Replace projectRoot with process.cwd() on the Windows branch.
// ---------------------------------------------------------------------------
const oldPatchedCwdPart =
  "const updateCwd = process.platform === 'win32'\n" +
  "            ? projectRoot";

const newPatchedCwdPart =
  "const updateCwd = process.platform === 'win32'\n" +
  "            ? process.cwd()";

// ---------------------------------------------------------------------------
// Patch 4 — Add /api/system/version endpoint after /health
//            Two variants: server/index.js has an empty line after "});",
//            dist-server/server/index.js doesn't.
// ---------------------------------------------------------------------------
const oldHealthEnd =
  "        installMode\n" +
  "    });\n" +
  "});\n" +
  "// Optional API key validation (if configured)";
const oldHealthEndExtraLine =
  "        installMode\n" +
  "    });\n" +
  "});\n" +
  "\n" +
  "// Optional API key validation (if configured)";

const newHealthEnd =
  "        installMode\n" +
  "    });\n" +
  "});\n" +
  "// --- patch: version endpoint ---\n" +
  "app.get('/api/system/version', (req, res) => {\n" +
  "    try {\n" +
  "        const p = JSON.parse(fs.readFileSync(path.join(APP_ROOT, 'package.json'), 'utf8'));\n" +
  "        res.json({ version: p.version, installMode });\n" +
  "    } catch {\n" +
  "        res.json({ version: 'unknown', installMode });\n" +
  "    }\n" +
  "});\n" +
  "// --- end patch ---\n" +
  "// Optional API key validation (if configured)";

// ---------------------------------------------------------------------------
// Patch 5 — Fix static asset caching: ensure JS/CSS etc. always revalidate
//            so the browser picks up the new frontend bundle after upgrade.
// ---------------------------------------------------------------------------
const oldCache =
  "            // Cache static assets for 1 year (they have hashed names)\n" +
  "            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');";

const newCache =
  "            // Cache for 1 year but always revalidate via ETag, so after upgrade\n" +
  "            // the browser fetches the new bundle instead of serving stale cache.\n" +
  "            res.setHeader('Cache-Control', 'public, max-age=31536000, must-revalidate');";

// ---------------------------------------------------------------------------
// Patch 6 — Sentinel file (.updating) to prevent watchdog killing server mid-update
// ---------------------------------------------------------------------------
const sentinelFile = "try { fs.writeFileSync(path.join(process.cwd(), '.updating'), '1'); } catch {}";

// 6a — insert sentinel creation before spawn
const oldSpawnLine =
  "        const child = spawn(process.platform === 'win32' ? 'cmd.exe' : 'sh', [process.platform === 'win32' ? '/c' : '-c', updateCommand], {";
const newSpawnLine =
  "        " + sentinelFile + "\n        const child = spawn(process.platform === 'win32' ? 'cmd.exe' : 'sh', [process.platform === 'win32' ? '/c' : '-c', updateCommand], {";

// 6b — insert sentinel deletion at the start of close handler
const oldCloseStart =
  "        child.on('close', (code) => {\n            if (code === 0) {";
const newCloseStart =
  "        child.on('close', (code) => {\n            try { fs.unlinkSync(path.join(process.cwd(), '.updating')); } catch {}\n            if (code === 0) {";

// 6c — insert sentinel deletion at the start of error handler
const oldErrorStart =
  "        child.on('error', (error) => {\n            console.error('Update process error:', error);";
const newErrorStart =
  "        child.on('error', (error) => {\n            try { fs.unlinkSync(path.join(process.cwd(), '.updating')); } catch {}\n            console.error('Update process error:', error);";

// ---------------------------------------------------------------------------
// Patch 7 — SO_REUSEADDR on server socket (fix EADDRINUSE crash loop on Windows)
// ---------------------------------------------------------------------------
const oldListen =
  "server.listen(SERVER_PORT, HOST, async () => {";
const newListen =
  "server.listen({ port: SERVER_PORT, host: HOST, reuseAddr: true }, async () => {";

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

    // Patch 3 — cwd (original: uses os.homedir, needs full replacement)
    if (code.includes(oldCwd)) {
      code = code.replace(oldCwd, patchedCwd);
      console.log(`  ✓ cwd (full) → ${file}`);
      patched++;
    } else if (code.includes(patchedCwd)) {
      console.log(`  → cwd already patched: ${file}`);
    } else {
      // Patch 3b — cwd (already has Windows check but uses projectRoot)
      if (code.includes(oldPatchedCwdPart)) {
        code = code.replace(oldPatchedCwdPart, newPatchedCwdPart);
        console.log(`  ✓ cwd (partial) → ${file}`);
        patched++;
      } else {
        console.log(`  ⚠ cwd pattern not found: ${file}`);
      }
    }

    // Patch 4 — version endpoint
    if (code.includes(oldHealthEnd)) {
      code = code.replace(oldHealthEnd, newHealthEnd);
      console.log(`  ✓ version endpoint → ${file}`);
      patched++;
    } else if (code.includes(oldHealthEndExtraLine)) {
      code = code.replace(oldHealthEndExtraLine, newHealthEnd);
      console.log(`  ✓ version endpoint (extra line) → ${file}`);
      patched++;
    } else if (code.includes(newHealthEnd)) {
      console.log(`  → version endpoint already patched: ${file}`);
    } else {
      console.log(`  ⚠ version endpoint pattern not found: ${file}`);
    }

    // Patch 5 — static asset cache
    if (code.includes(oldCache)) {
      code = code.replace(oldCache, newCache);
      console.log(`  ✓ cache headers → ${file}`);
      patched++;
    } else if (code.includes(newCache)) {
      console.log(`  → cache headers already patched: ${file}`);
    } else {
      console.log(`  ⚠ cache pattern not found: ${file}`);
    }

    // Patch 6 — sentinel file (.updating) for watchdog
    // 6a — create .updating before spawn
    if (code.includes(oldSpawnLine)) {
      code = code.replace(oldSpawnLine, newSpawnLine);
      console.log(`  ✓ sentinel (spawn) → ${file}`);
      patched++;
    } else if (code.includes(newSpawnLine)) {
      console.log(`  → sentinel (spawn) already patched: ${file}`);
    } else {
      console.log(`  ⚠ sentinel (spawn) pattern not found: ${file}`);
    }

    // 6b — delete .updating in close handler
    if (code.includes(oldCloseStart)) {
      code = code.replace(oldCloseStart, newCloseStart);
      console.log(`  ✓ sentinel (close) → ${file}`);
      patched++;
    } else if (code.includes(newCloseStart)) {
      console.log(`  → sentinel (close) already patched: ${file}`);
    } else {
      console.log(`  ⚠ sentinel (close) pattern not found: ${file}`);
    }

    // 6c — delete .updating in error handler
    if (code.includes(oldErrorStart)) {
      code = code.replace(oldErrorStart, newErrorStart);
      console.log(`  ✓ sentinel (error) → ${file}`);
      patched++;
    } else if (code.includes(newErrorStart)) {
      console.log(`  → sentinel (error) already patched: ${file}`);
    } else {
      console.log(`  ⚠ sentinel (error) pattern not found: ${file}`);
    }

    // Patch 7 — SO_REUSEADDR on server socket
    if (code.includes(oldListen)) {
      code = code.replace(oldListen, newListen);
      console.log(`  ✓ reuseAddr → ${file}`);
      patched++;
    } else if (code.includes(newListen)) {
      console.log(`  → reuseAddr already patched: ${file}`);
    } else {
      console.log(`  ⚠ reuseAddr pattern not found: ${file}`);
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