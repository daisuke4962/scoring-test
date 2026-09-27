@echo off
REM Rebuild the web app after editing files under apps/web.
cd /d "%~dp0"
call npm.cmd run build
pause
