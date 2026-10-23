<#
    AI Hub 导航站 · 首次配置向导
    用法（在本目录打开 PowerShell 后）：
        pwsh -File .\setup.ps1
    或：右键本文件 → 使用 PowerShell 运行

    它会做四件事：
      1. 检查 Node 版本（需要 >= 22.18）
      2. 安装依赖（node_modules 不存在时）
      3. 生成 SESSION_SECRET，并让你输入两次访问密码，生成 scrypt 哈希
      4. 写出 .env.local（默认 COOKIE_SECURE=0，配好 HTTPS 后再改成 1）

    幂等：重复运行会询问是否覆盖已有的 .env.local。
#>

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

function Write-Step([string]$Text) { Write-Host "`n==> $Text" -ForegroundColor Cyan }
function Write-Ok([string]$Text) { Write-Host "    $Text" -ForegroundColor Green }
function Write-Warn([string]$Text) { Write-Host "    $Text" -ForegroundColor Yellow }

Write-Host 'AI Hub 导航站 · 首次配置' -ForegroundColor White
Write-Host '本项目只做官方网页跳转：不调用模型 API、不爬取网页、不模拟登录。' -ForegroundColor DarkGray

# ---------- 1. Node 版本 ----------
Write-Step '检查 Node.js 版本'
$nodeVersion = (& node -v) 2>$null
if (-not $nodeVersion) {
    Write-Warn '没有找到 node 命令。请先安装 Node.js 22.18 或更高版本：https://nodejs.org/'
    exit 1
}
$major = [int]($nodeVersion.TrimStart('v').Split('.')[0])
$minor = [int]($nodeVersion.TrimStart('v').Split('.')[1])
if ($major -lt 22 -or ($major -eq 22 -and $minor -lt 18)) {
    Write-Warn "当前是 $nodeVersion，本项目脚本需要 >= 22.18（用到 Node 自带的 TypeScript 类型擦除）。"
    exit 1
}
Write-Ok "Node $nodeVersion"

# ---------- 2. 依赖 ----------
Write-Step '安装依赖'
if (Test-Path (Join-Path $PSScriptRoot 'node_modules')) {
    Write-Ok 'node_modules 已存在，跳过（要重装就删掉它再跑本脚本）'
} else {
    & npm install --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { Write-Warn 'npm install 失败，请把上面的报错贴出来。'; exit 1 }
    Write-Ok '依赖安装完成'
}

# ---------- 3. 密钥与密码 ----------
Write-Step '生成会话密钥'
$secret = (node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64'))").Trim()
Write-Ok "SESSION_SECRET 已生成（$($secret.Length) 个字符）"

Write-Step '设置访问密码'
Write-Host '    要求：至少 12 位；建议用密码管理器生成的随机串。' -ForegroundColor DarkGray
Write-Host '    输入时不会回显。' -ForegroundColor DarkGray

$attempt = 0
$password = $null
while ($attempt -lt 3) {
    $attempt++
    $first = Read-Host -AsSecureString '    输入访问密码'
    $second = Read-Host -AsSecureString '    再输一次确认'

    $plainFirst = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($first))
    $plainSecond = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($second))

    if ($plainFirst.Length -lt 12) {
        Write-Warn '太短了，至少 12 位。'
        continue
    }
    if ($plainFirst -ne $plainSecond) {
        Write-Warn '两次输入不一致，请重来。'
        continue
    }
    $password = $plainFirst
    break
}

if (-not $password) {
    Write-Warn '三次都没配对，退出。'
    exit 1
}

# 通过管道把明文交给脚本，明文不进命令行参数、不进历史记录
$hash = ($password | node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/hash-password.mjs 2>&1 | Select-String -Pattern '^AUTH_PASSWORD_HASH=' | Select-Object -First 1)
if (-not $hash) {
    Write-Warn '生成哈希失败，请手动运行：npm run hash-password'
    exit 1
}
$hashLine = $hash.ToString().Trim()
Write-Ok '密码哈希已生成'

# ---------- 4. 写 .env.local ----------
Write-Step '写出 .env.local'
$envPath = Join-Path $PSScriptRoot '.env.local'

if (Test-Path $envPath) {
    $answer = Read-Host '    .env.local 已存在，覆盖？(y/N)'
    if ($answer -notmatch '^(y|Y)$') {
        Write-Warn '已取消，原有配置保持不变。'
        exit 0
    }
}

$lines = @(
    '# 由 setup.ps1 生成 —— 不要提交到 git',
    'SESSION_SECRET=' + $secret,
    $hashLine,
    '# auto 会按请求协议自动决定 Secure：http 能用，https（含 Tailscale/Caddy 反代）自动加',
    'COOKIE_SECURE=auto',
    'SESSION_TTL_SECONDS=1209600',
    'COOKIE_NAME=aihub_session'
)
Set-Content -LiteralPath $envPath -Value $lines -Encoding ASCII
Write-Ok ".env.local 已写入（$envPath）"

# ---------- 5. 自检：用刚输入的密码真的验证一遍 ----------
Write-Step '自检：确认服务端解析到的哈希与刚才的密码匹配'
$checkOutput = ($password | & node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --import ./scripts/register.mjs scripts/check-env.mjs) 2>&1 | Out-String
Write-Host $checkOutput
if ($LASTEXITCODE -ne 0) {
    Write-Warn '配置体检没通过。常见原因：哈希在复制过程中被截断，或 .env 解析器改写了它。'
    Write-Warn '请把上面的输出贴出来，或重跑一次本脚本。'
    exit 1
}
Write-Ok '配置体检通过：这个密码现在就能登录'

Write-Host ''
Write-Host '完成。接下来：' -ForegroundColor White
Write-Host '  启动开发模式： pwsh -File .\dev.ps1     或   npm run dev' -ForegroundColor Gray
Write-Host '  生产模式：     npm run build; npm start' -ForegroundColor Gray
Write-Host '  局域网/HTTPS： 见 README.md 第 4 节（Tailscale 或 Caddy）' -ForegroundColor Gray
Write-Host '  改密码：       重跑本脚本的密码部分，或 npm run hash-password' -ForegroundColor Gray
