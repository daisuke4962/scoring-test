@echo off
REM Build the installer people receive. Leaves it in apps\desktop\release\upload.
cd /d "%~dp0"

echo Installing dependencies...
call npm.cmd install || goto :fail

echo Building the pages...
call npm.cmd run build || goto :fail

echo Building the installer (this takes a few minutes the first time)...
call npm.cmd run dist -w apps/desktop || goto :fail

echo.
echo Done. Upload the files in apps\desktop\release\upload to the update site.
pause
goto :eof

:fail
echo.
echo Build failed. See the messages above.
pause
