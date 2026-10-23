<#
.SYNOPSIS
    停止 AI Hub 服务。只结束 node 进程；端口被其他程序占用时如实报告、不误杀。
#>
param([int]$Port = 3000)

$connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if (-not $connections) {
    Write-Host "端口 $Port 上没有运行中的服务。"
    exit 0
}

$ids = $connections | Select-Object -ExpandProperty OwningProcess -Unique
foreach ($pid_ in $ids) {
    $proc = Get-Process -Id $pid_ -ErrorAction SilentlyContinue
    if ($null -eq $proc) { continue }
    if ($proc.ProcessName -eq 'node') {
        Stop-Process -Id $pid_ -Force
        Write-Host "已停止 AI Hub（node，PID $pid_）。"
    }
    else {
        Write-Host "端口 $Port 被 $($proc.ProcessName)（PID $pid_）占用，不是 AI Hub，未动它。"
    }
}
