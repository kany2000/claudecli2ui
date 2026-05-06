@echo off
cd /d "%~dp0"
echo Starting Claude Code Web UI...
echo Visit http://localhost:3001 to open the interface
echo Login with: admin / admin123
echo.
start /B /MIN node watch-restart.js
