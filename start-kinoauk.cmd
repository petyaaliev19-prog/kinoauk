@echo off
cd /d "%~dp0"
if exist kinoauk-server.pid (
  set /p KINOAUK_PID=<kinoauk-server.pid
  tasklist /FI "PID eq %KINOAUK_PID%" | find "%KINOAUK_PID%" >nul
  if not errorlevel 1 (
    start "" http://127.0.0.1:5173
    exit /b 0
  )
  del kinoauk-server.pid >nul 2>nul
)
start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 1; Start-Process 'http://127.0.0.1:5173'"
node server.js
