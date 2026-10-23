# 开发模式启动（热更新，改代码立即生效）
# 用法：在本目录执行   pwsh -File .\dev.ps1

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

if (-not (Test-Path '.env.local')) {
    Write-Host '还没配置：先运行 pwsh -File .\setup.ps1' -ForegroundColor Yellow
    exit 1
}

Write-Host '启动开发模式：http://localhost:3000 （Ctrl+C 停止）' -ForegroundColor Cyan
& npm run dev
