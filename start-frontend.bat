@echo off
title RGPV Frontend - Port 5173
cd /d "%~dp0frontend"
echo.
echo =====================================
echo   RGPV Smart Result Manager
echo   Frontend Dev Server - Port 5173
echo =====================================
echo.
echo Starting frontend...
npm run dev
pause
