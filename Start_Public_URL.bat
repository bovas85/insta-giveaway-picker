@echo off
SETLOCAL
title Instagram Analyzer - Public Tunnel

echo ---------------------------------------------------------
echo   Instagram Analyzer: Public URL Generator
echo ---------------------------------------------------------
echo.

:: Check if cloudflared is installed
where cloudflared >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [!] Cloudflared is not installed or not in your PATH.
    echo.
    echo To use this, please:
    echo 1. Download cloudflared-windows-amd64.msi from:
    echo    https://github.com/cloudflare/cloudflared/releases/latest
    echo 2. Install it and restart this terminal.
    echo.
    pause
    exit /b
)

echo [*] Starting Cloudflare Tunnel...
echo [*] NOTE: You may see "ERR Cannot determine default origin certificate". 
echo [*] THIS IS NORMAL. Please wait for the "trycloudflare.com" link to appear.
echo.

cloudflared tunnel --url http://127.0.0.1:3000

pause
