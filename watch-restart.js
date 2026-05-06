// Watch for package changes and restart server automatically
import { spawn } from 'child_process';
import { watch } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const lockFile = resolve(__dirname, 'package-lock.json');
const serverPath = resolve(__dirname, 'node_modules/@cloudcli-ai/cloudcli/dist-server/server/index.js');

let server = null;

function startServer() {
  if (server) {
    server.kill('SIGTERM');
    setTimeout(() => { if (server && !server.killed) server.kill('SIGKILL'); }, 5000);
  }
  console.log('[watch] Starting server...');
  server = spawn('node', [serverPath], { stdio: 'inherit', cwd: __dirname });
  server.on('exit', (code) => {
    if (code !== 0) console.log('[watch] Server exited with code', code);
  });
}

// Initial start
startServer();

// Watch package-lock.json for changes (npm install writes here)
console.log('[watch] Watching for package changes...');
let debounce = null;
try {
  watch(lockFile, (event) => {
    if (event === 'change') {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        console.log('[watch] Package changed, restarting...');
        startServer();
      }, 2000);
    }
  });
} catch (e) {
  console.log('[watch] Could not watch lock file, polling every 10s instead');
  let lastMtime = null;
  setInterval(() => {
    try {
      const { statSync } = require('fs');
      const mtime = statSync(lockFile).mtimeMs;
      if (lastMtime && mtime !== lastMtime) {
        console.log('[watch] Package changed, restarting...');
        startServer();
      }
      lastMtime = mtime;
    } catch {}
  }, 10000);
}
