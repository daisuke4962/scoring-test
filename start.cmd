@echo off
REM Start the Scoring Test server. Double-click this file, or run it from any terminal.
REM Uses npm.cmd so it works even when PowerShell's execution policy blocks npm.ps1.
cd /d "%~dp0"

if not exist "node_modules" (
  echo Installing dependencies...
  call npm.cmd install || goto :fail
)

if not exist "apps\web\dist" (
  echo Building the web app...
  call npm.cmd run build || goto :fail
)

echo.
call npm.cmd start
goto :eof

:fail
echo.
echo Setup failed. See the messages above.
pause
