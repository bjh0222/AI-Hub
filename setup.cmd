@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo AI Hub 导航站 · 首次配置
echo.
where pwsh >nul 2>nul
if errorlevel 1 (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1"
) else (
  pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1"
)
echo.
pause
