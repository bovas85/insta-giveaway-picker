@echo off
title Instagram Analyzer Web Server
color 0A

:: Configuration
set PROJECT_DIR=%~dp0

echo ========================================================
echo        INSTAGRAM GIVEAWAY ANALYZER (WEB)
echo ========================================================
echo.
echo Starting local server...
echo.

cd /d "%PROJECT_DIR%"

:: Open the browser automatically
start http://localhost:3000

:: Start the server
call npm run serve

pause