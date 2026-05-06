@echo off
cd /d "%~dp0"
echo Stopping Claude Code Web UI...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3001"') do (
    if not "%%a"=="0" taskkill /f /pid %%a >nul 2>&1
)
timeout /t 2 /nobreak >nul
echo Starting with auto-restart watchdog...
start /B /MIN node watch-restart.js
timeout /t 3 /nobreak >nul
echo.
echo Claude Code Web UI restarted!
echo Updates will now auto-restart the server.
echo Visit http://localhost:3001
echo Login: admin / admin123
timeout /t 5 /nobreak >nul
