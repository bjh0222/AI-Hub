@echo off
chcp 65001 >nul
cd /d "%~dp0"
where pwsh >nul 2>nul
if errorlevel 1 (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0dev.ps1"
) else (
  pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0dev.ps1"
)
pause
