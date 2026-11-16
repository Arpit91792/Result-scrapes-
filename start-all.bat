@echo off
echo Starting RGPV Smart Result Manager...
echo.
echo [1/2] Starting Backend on port 5002...
start "RGPV Backend" cmd /k "cd /d "%~dp0backend" && node src/server.js"
timeout /t 3 /nobreak >nul
echo [2/2] Starting Frontend on port 5173...
start "RGPV Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"
timeout /t 4 /nobreak >nul
echo.
echo Both servers started!
echo   Backend:  http://localhost:5002
echo   Frontend: http://localhost:5173
echo.
start "" "http://localhost:5173"
