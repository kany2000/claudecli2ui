// Watch for package changes and restart server automatically
import { spawn, execSync } from 'child_process';
import { watch, existsSync, statSync } from 'fs';
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
  try {
    // Auto-rotate if too large (5MB)
    if (existsSync(logFile) && statSync(logFile).size > 5 * 1024 * 1024) {
      require('fs').renameSync(logFile, logFile + '.old');
    }
    require('fs').appendFileSync(logFile, line);
  } catch {}
}

const lockFile = resolve(__dirname, 'package-lock.json');
const serverPath = resolve(__dirname, 'node_modules/@cloudcli-ai/cloudcli/dist-server/server/index.js');
const require = createRequire(import.meta.url);
const PORT = 3001;

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
  if (process.execPath) return process.execPath;
  const candidates = [
    'C:\\Program Files\\nodejs\\node.exe',
    'C:\\Program Files (x86)\\nodejs\\node.exe',
    resolve(process.env.LOCALAPPDATA || '', 'fnm', 'nodejs', 'current', 'node.exe'),
  ];
  for (const p of candidates) {
    try { require('fs').accessSync(p); return p; } catch {}
  }
  return 'node';
}

const NODE_EXE = findNodeExecutable();

// ---------------------------------------------------------------------------
// Check if a port is in use (returns PID or null)
// ---------------------------------------------------------------------------
function findPidOnPort(port) {
  try {
    const result = execSync(
      `netstat -ano | findstr ":${port} "`,
      { encoding: 'utf8', timeout: 5000 }
    );
    const lines = result.split('\n').filter(l => l.includes('LISTENING'));
    if (lines.length === 0) return null;
    const parts = lines[0].trim().split(/\s+/);
    return parseInt(parts[parts.length - 1], 10);
  } catch {
    return null;
  }
}

function isPortFree(port) {
  return findPidOnPort(port) === null;
}

// ---------------------------------------------------------------------------
// Async wait helpers
// ---------------------------------------------------------------------------
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// Wait for port to be free, polling every 500ms, up to timeoutMs
async function waitForPortFree(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (isPortFree(port)) return true;
    await sleep(500);
  }
  return isPortFree(port);
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let starting = false;          // 启动锁
let restarting = false;        // 主动重启锁（避免 kill 旧进程触发 exit 事件导致重复启动）
let server = null;             // 当前子进程引用
let serverLogStream = null;

// ---------------------------------------------------------------------------
// Start / restart the server
// ---------------------------------------------------------------------------
async function startServer() {
  if (starting) {
    log('startServer: already starting, skip');
    return;
  }
  starting = true;

  // 1. 杀掉旧进程
  if (server && !server.killed) {
    log('startServer: killing old server (PID: ' + server.pid + ')');
    restarting = true;    // 标记主动重启，防止 exit 事件重复触发 startServer
    server.kill('SIGTERM');
    // 给 SIGTERM 3 秒，没死就 SIGKILL
    await sleep(500);
    if (!server.killed) {
      // 先等一小会儿看进程是否自己退了
      await sleep(2500);
      if (!server.killed) {
        log('startServer: force killing server (PID: ' + server.pid + ')');
        restarting = true;    // 同上
        server.kill('SIGKILL');
        await sleep(500);
      }
    }
  }

  // 2. 等端口释放（最多 10 秒，TIME_WAIT 通常 < 4s）
  log('startServer: waiting for port ' + PORT + ' to be free...');
  const portFree = await waitForPortFree(PORT, 10000);
  if (!portFree) {
    // 端口还被占用但超时了——强杀占用进程
    const pid = findPidOnPort(PORT);
    if (pid) {
      log('startServer: port ' + PORT + ' still held by PID ' + pid + ' after timeout, force killing');
      try { execSync(`taskkill /f /pid ${pid}`, { stdio: 'ignore', timeout: 3000 }); } catch {}
      await sleep(1000);
    }
  }

  // 3. 准备日志流
  if (serverLogStream) try { serverLogStream.end(); } catch {}
  const logPath = resolve(__dirname, 'server.log');
  if (existsSync(logPath) && statSync(logPath).size > 50 * 1024 * 1024) {
    try { require('fs').renameSync(logPath, logPath + '.old'); } catch {}
  }
  serverLogStream = require('fs').createWriteStream(logPath, { flags: 'a' });

  // 4. 启动新进程
  log('startServer: starting server...');
  const child = spawn(NODE_EXE, [serverPath], {
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: __dirname,
    env: { ...process.env, VITE_IS_PLATFORM: 'false' },
    windowsHide: true
  });
  child.stdout.pipe(serverLogStream);
  child.stderr.pipe(serverLogStream);
  server = child;

  child.on('spawn', () => {
    log('startServer: server started (PID: ' + child.pid + ')');
    restarting = false;    // 新进程启动成功，重置主动重启标记
    // 注意：不在 spawn 里解锁 starting——等 exit 处理完再解
  });

  child.on('error', (err) => {
    log('startServer: spawn error: ' + err.message);
    if (child === server) {
      starting = false;
      restarting = false;
      // EADDRINUSE：杀占用进程，等一秒再重试
      if (err.message.includes('EADDRINUSE')) {
        const pid = findPidOnPort(PORT);
        if (pid) {
          log('startServer: EADDRINUSE, killing PID ' + pid);
          try { execSync(`taskkill /f /pid ${pid}`, { stdio: 'ignore', timeout: 3000 }); } catch {}
        }
        setTimeout(() => startServer(), 1500);
      }
    }
  });

  child.on('exit', (code) => {
    if (child !== server) return; // 过期事件，忽略
    if (restarting) {
      log('startServer: ignoring exit (code ' + code + ') during intentional restart');
      return;
    }
    if (code === 0) {
      log('startServer: server exited normally (code 0)');
      starting = false;
      return;
    }
    // 非正常退出——立刻重启
    log('startServer: server exited (code ' + code + '), restarting...');
    starting = false;
    startServer();
  });
}

// ---------------------------------------------------------------------------
// Initial start
// ---------------------------------------------------------------------------
startServer();

// ---------------------------------------------------------------------------
// Watch package-lock.json for changes (npm install writes here)
// ---------------------------------------------------------------------------
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
      const mtime = statSync(lockFile).mtimeMs;
      if (lastMtime && mtime !== lastMtime) {
        log('Package changed, restarting...');
        startServer();
      }
      lastMtime = mtime;
    } catch {}
  }, 10000);
}
