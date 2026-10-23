<#
.SYNOPSIS
    AI Hub 一键启动：确保服务在跑，然后打开浏览器。

.DESCRIPTION
    - 端口已被监听（服务已在跑）→ 直接打开浏览器，不重复起服务；
    - 没在跑 → 若无生产构建先构建，再以**最小化窗口**后台启动（关闭该窗口即停止服务）；
    - 打开默认浏览器。

.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File start-aihub.ps1
    powershell -NoProfile -ExecutionPolicy Bypass -File start-aihub.ps1 -Port 3010 -NoOpen
#>
param(
    [int]$Port = 3000,
    [switch]$NoOpen
)

$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $MyInvocation.MyCommand.Path
$url = "http://localhost:$Port"

function Test-Port([int]$p) {
    [bool](Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue)
}

if (-not (Test-Port $Port)) {
    # 无生产构建则先构建（正常情况下构建已存在，直接跳过）
    if (-not (Test-Path (Join-Path $project '.next\BUILD_ID'))) {
        Write-Host '首次启动：先构建生产包（约 10~30 秒）...'
        Push-Location $project
        try { & npm run build } finally { Pop-Location }
        if (-not (Test-Path (Join-Path $project '.next\BUILD_ID'))) {
            Write-Host '构建失败，请查看上方输出。'
            exit 1
        }
    }

    Write-Host '正在启动 AI Hub（最小化窗口；关闭该窗口即停止服务）...'
    Start-Process -FilePath $env:ComSpec `
        -ArgumentList '/c', "title AI Hub Server && npm start -- -p $Port" `
        -WorkingDirectory $project -WindowStyle Minimized

    # 等待端口就绪（最多 30 秒）
    $ready = $false
    for ($i = 0; $i -lt 60; $i++) {
        Start-Sleep -Milliseconds 500
        if (Test-Port $Port) { $ready = $true; break }
    }
    if (-not $ready) {
        Write-Host '启动超时：请手动运行 npm start 查看报错。'
        exit 1
    }
    try { Invoke-WebRequest -UseBasicParsing "$url/login" -TimeoutSec 5 | Out-Null } catch {}
    Write-Host '服务已就绪。'
}
else {
    Write-Host 'AI Hub 已在运行，直接打开浏览器。'
}

Write-Host "地址：$url"
if (-not $NoOpen) { Start-Process $url }
