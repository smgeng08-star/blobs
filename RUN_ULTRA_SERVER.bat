@echo off
chcp 65001 > nul
title Blobs.io Game Server [Ultra High Performance]
color 0A

echo ======================================================
echo    Blobs.io Ultra Performance Game Server (Self-Hosted)
echo ======================================================
echo.

:: 1. Check & Open Firewall Port 3000 if running as admin
net session >nul 2>&1
if %errorlevel% == 0 (
    echo [*] Setting up Windows Firewall rule for Port 3000...
    netsh advfirewall firewall delete rule name="Blobs Game Server Port 3000" >nul 2>&1
    netsh advfirewall firewall add rule name="Blobs Game Server Port 3000" dir=in action=allow protocol=TCP localport=3000 profile=any >nul 2>&1
    echo [OK] Firewall rule configured!
) else (
    echo [i] Tip: Run as Administrator once if external friends cannot connect through Firewall.
)

:: 2. Display Network Information
echo.
echo ------------------------------------------------------
echo  Local Address (for your browser): http://localhost:3000
echo  Local Network IP (for devices at home): http://192.168.1.40:3000
echo ------------------------------------------------------
echo.

:: 3. Launch with maximum V8 performance flags and memory headroom
echo [*] Starting game server with optimized V8 engine...
set NODE_ENV=production
node --max-old-space-size=4096 --noconcurrent_sweeping --turbo-fast-api-calls production_server.js

pause
