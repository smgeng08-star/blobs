@echo off
chcp 65001 > nul
title Blobs.io Ultra Performance Live Server
color 0B

echo ======================================================
echo    Starting Blobs.io Ultra High Performance Server
echo ======================================================
echo.

:: 1. Start Cloudflare Tunnel in background
echo [*] Initializing high-speed secure tunnel...
start /b "" "%~dp0cloudflared.exe" tunnel --url http://localhost:3000 --logfile "%~dp0tunnel.log"

:: 2. Start Game Server
echo [*] Starting Node.js game engine with V8 optimizations...
set NODE_ENV=production
node --max-old-space-size=4096 --noconcurrent_sweeping --turbo-fast-api-calls production_server.js

pause
