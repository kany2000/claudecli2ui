@echo off
cd /d "%~dp0"
echo Starting Claude Code Web UI...
echo Visit http://localhost:3001
echo Login: admin / admin123
echo.
start /B /MIN node "node_modules\@cloudcli-ai\cloudcli\dist-server\server\index.js"
