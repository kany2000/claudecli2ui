// Watch for package changes and restart server automatically
import { spawn } from 'child_process';
import { watch } from 'fs';
import { resolve, dirname } from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// No self-relaunch needed — launcher.exe creates the process with DETACHED_PROCESS
// which completely prevents any console allocation.

// Simple file logger (console.log won't work with DETACHED_PROCESS — no console)
const logFile = resolve(__dirname, 'watch-restart.log');
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try { require('fs').appendFileSync(logFile, line); } catch {}
}

const lockFile = resolve(__dirname, 'package-lock.json');
const serverPath = resolve(__dirname, 'node_modules/@cloudcli-ai/cloudcli/dist-server/server/index.js');
const require = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// Load .env from the project root (the server's own load-env.js looks in the
// cloudcli package directory, which doesn't have a .env file).
// ---------------------------------------------------------------------------
try {
  const envPath = resolve(__dirname, '.env');
  const envFile = require('fs').readFileSync(envPath, 'utf8');
  envFile.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx > 0) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        if (key && !process.env[key]) process.env[key] = val;
      }
    }
  });
} catch (e) {
  // Project .env not found; that's fine
}

// ---------------------------------------------------------------------------
// Locate the node executable. Using the full path avoids PATH
// resolution failures when spawned from a hidden VBS window at startup.
// ---------------------------------------------------------------------------
function findNodeExecutable() {
  // 1. Try the NVM/original path from where this script is running
  if (process.execPath) return process.execPath;
  // 2. Common install locations
  const candidates = [
    'C:\\Program Files\\nodejs\\node.exe',
    'C:\\Program Files (x86)\\nodejs\\node.exe',
    resolve(process.env.LOCALAPPDATA || '', 'fnm', 'nodejs', 'current', 'node.exe'),
  ];
  for (const p of candidates) {
    try { require('fs').accessSync(p); return p; } catch {}
  }
  // 3. Fallback — hope PATH works
  return 'node';
}

const NODE_EXE = findNodeExecutable();

let server = null;
let currentServer = null;

let serverLogStream = null;

function startServer() {
  if (server) {
    server.kill('SIGTERM');
    setTimeout(() => { if (server && !server.killed) server.kill('SIGKILL'); }, 5000);
  }
  log('Starting server...');
  // Pipe server stdout/stderr to a log file so we never need a console
  if (serverLogStream) try { serverLogStream.end(); } catch {}
  serverLogStream = require('fs').createWriteStream(resolve(__dirname, 'server.log'), { flags: 'a' });
  const child = spawn(NODE_EXE, [serverPath], {
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: __dirname,
    env: { ...process.env, VITE_IS_PLATFORM: 'false' },
    windowsHide: true
  });
  child.stdout.pipe(serverLogStream);
  child.stderr.pipe(serverLogStream);
  currentServer = child;
  server = child;
  child.on('exit', (code) => {
    // Only auto-restart if this is still the current server (not a stale one from a previous restart)
    if (code !== 0 && child === currentServer) {
      log('Server exited unexpectedly (code ' + code + '), restarting...');
      startServer();
    }
  });
  child.on('spawn', () => log('Server started (PID: ' + child.pid + ')'));
}

// Initial start
startServer();

// Watch package-lock.json for changes (npm install writes here)
log('Watching for package changes...');
let debounce = null;
try {
  watch(lockFile, (event) => {
    if (event === 'change') {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        log('Package changed, restarting...');
        startServer();
      }, 2000);
    }
  });
} catch (e) {
  log('Could not watch lock file, polling every 10s instead');
  let lastMtime = null;
  setInterval(() => {
    try {
      const { statSync } = require('fs');
      const mtime = statSync(lockFile).mtimeMs;
      if (lastMtime && mtime !== lastMtime) {
        log('Package changed, restarting...');
        startServer();
      }
      lastMtime = mtime;
    } catch {}
  }, 10000);
}
