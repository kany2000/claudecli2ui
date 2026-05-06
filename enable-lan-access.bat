@echo off
cd /d "%~dp0"
echo.
echo ============================================
echo  Claude Code Web UI - LAN Access Setup
echo ============================================
echo.
echo This script adds a Windows Firewall rule to
echo allow other devices on your local network to
echo access Claude Code Web UI (port 3001).
echo.
echo Your current LAN IP addresses:
echo --------------------------------------------
ipconfig | findstr IPv4
echo --------------------------------------------
echo.
echo After running this, other devices can access:
echo   http://<YOUR_LAN_IP>:3001
echo.
echo (Mac, Windows, Linux, phones - any browser)
echo.
net.session >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Please run this script AS ADMINISTRATOR.
    echo     Right-click ^> "Run as administrator"
    echo.
    pause
    exit /b 1
)

echo Adding firewall rule for port 3001...
netsh advfirewall firewall add rule name="Claude Code Web UI" dir=in action=allow protocol=TCP localport=3001 profile=private,domain

if %errorlevel% equ 0 (
    echo.
    echo [OK] Firewall rule added successfully!
    echo.
    echo Other devices can now access:
    echo   http://<YOUR_LAN_IP>:3001
    echo.
    echo Find your LAN IP with: ipconfig ^| findstr IPv4
) else (
    echo.
    echo [FAILED] Could not add firewall rule.
)

echo.
pause
