@echo off
cd /d "%~dp0"

set STOPPED=0

if exist kinoauk-server.pid (
  set /p KINOAUK_PID=<kinoauk-server.pid
  taskkill /PID %KINOAUK_PID% /T /F >nul 2>nul
  if not errorlevel 1 set STOPPED=1
  del kinoauk-server.pid >nul 2>nul
)

for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":5173 .*LISTENING"') do (
  taskkill /PID %%P /T /F >nul 2>nul
  if not errorlevel 1 set STOPPED=1
)

if "%STOPPED%"=="1" (
  echo Kinoauk server stopped.
) else (
  echo Kinoauk server is not running on port 5173.
)
pause
