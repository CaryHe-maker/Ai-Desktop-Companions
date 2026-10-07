@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\activate-build.ps1"
if errorlevel 1 (
  echo Close Deskbot from the tray menu, then run this updater again.
  pause
  exit /b 1
)
start "" "%~dp0dist\Deskbot-win32-x64\Deskbot.exe"
