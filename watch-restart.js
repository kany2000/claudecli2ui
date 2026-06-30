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
let crashCount = 0;            // 连续崩溃计数（用于退避）
let lastCrashTime = 0;         // 上次崩溃时间戳
const MAX_CRASH_INTERVAL = 30000; // 30 秒内超过 3 次崩溃则长等待
const MAX_CRASH_COUNT = 3;

// ---------------------------------------------------------------------------
// Start / restart the server
// ---------------------------------------------------------------------------
async function startServer() {
  if (starting) {
    log('startServer: already starting, skip');
    return;
  }
  starting = true;
  // DEBUG: log call stack to find where the 2nd startServer() comes from
  const e = new Error();
  log('startServer: called from ' + (e.stack ? e.stack.split('\n').slice(2,5).join(' | ') : 'unknown'));

  // 清理可能残留的 .updating 标记（更新进程意外退出时可能留下）
  try { require('fs').unlinkSync(updatingFile); } catch {}

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
      // Windows TIME_WAIT 可能持续 2-4 分钟，等久一点再试
      await sleep(3000);
      if (!isPortFree(PORT)) {
        const pid2 = findPidOnPort(PORT);
        if (pid2) {
          log('startServer: port still held, killing again PID ' + pid2);
          try { execSync(`taskkill /f /pid ${pid2}`, { stdio: 'ignore', timeout: 3000 }); } catch {}
          await sleep(2000);
        }
      }
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
      restarting = false;
      // EADDRINUSE：杀占用进程，等一会再重试
      if (err.message.includes('EADDRINUSE')) {
        const pid = findPidOnPort(PORT);
        if (pid) {
          log('startServer: EADDRINUSE, killing PID ' + pid);
          try { execSync(`taskkill /f /pid ${pid}`, { stdio: 'ignore', timeout: 3000 }); } catch {}
        }
        setTimeout(() => {
          starting = false;
          startServer();
        }, 3000);
      }
    }
  });

  child.on('exit', (code) => {
    if (child !== server) return; // 过期事件，忽略
    if (restarting) {
      log('startServer: ignoring exit (code ' + code + ') during intentional restart');
      return;
    }
    const pid = child.pid;
    if (code === 0) {
      log('startServer: server PID ' + pid + ' exited normally (code 0)');
      starting = false;
      return;
    }
    // 非正常退出——用退避延迟重启
    // 注意：不在这里 reset starting，由 setTimeout 回调负责，
    // 防止当前 startServer 还在运行时另一个 exit 再触发一次。
    const now = Date.now();
    if (now - lastCrashTime > MAX_CRASH_INTERVAL) {
      crashCount = 0;  // 超过间隔重置计数
    }
    crashCount++;
    lastCrashTime = now;
    const backoff = crashCount > MAX_CRASH_COUNT ? 30000 : 3000;
    log('startServer: server PID ' + pid + ' exited (code ' + code + '), crash #' + crashCount + ', restarting in ' + backoff + 'ms');
    setTimeout(() => {
      starting = false;
      startServer();
    }, backoff);
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
const updatingFile = resolve(__dirname, '.updating');
function isUpdating() {
  try { return require('fs').existsSync(updatingFile); } catch { return false; }
}
try {
  watch(lockFile, (event) => {
    if (event === 'change') {
      // 如果正在更新中（.updating 标记存在），不触发重启，等待下次变化
      if (isUpdating()) {
        log('Package change detected during update, deferring restart');
        return;
      }
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        // double-check after debounce
        if (isUpdating()) {
          log('Update still in progress after debounce, skipping restart');
          return;
        }
        log('Package changed, restarting...');
        startServer();
      }, 5000);
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