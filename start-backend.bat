@echo off
title RGPV Backend - Port 5002
cd /d "%~dp0backend"
echo.
echo =====================================
echo   RGPV Smart Result Manager
echo   Backend Server - Port 5002
echo =====================================
echo.
echo Starting server...
node src/server.js
pause
