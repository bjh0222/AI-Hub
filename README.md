# AI Hub 导航站

一个只给自己用的「多模型入口台」：把 **ChatGPT / DeepSeek / Gemini / 通义千问 / Kimi / 智谱清言 / 豆包** 七个官方对话网页收在一个页面里，搜索、收藏、一键多开、最近使用四件事做顺，减少来回找标签页的成本。
（入口名单不是写死的：加减平台看 §5.5，界面上的入口数量、搜索、收藏都是数据驱动的。）

**技术栈**：Next.js（App Router）+ React + TypeScript + Tailwind CSS
**访问保护**：密码 + HMAC 签名会话 Cookie（服务端校验，无数据库）
**数据存储**：只存这台浏览器的 localStorage

---

## 0. 这个项目做什么、不做什么

| 做 | 不做 |
|---|---|
| 点击卡片，用新标签页打开**官方对话网页** | ❌ 调用任何模型 API |
| 搜索、收藏、一键多开、最近使用记录 | ❌ 爬取网页、解析页面内容 |
| 密码访问保护（HttpOnly 签名 Cookie） | ❌ 模拟登录、注入脚本、绕过验证码或限流 |
| 本地 localStorage 保存偏好 | ❌ 上传任何数据到服务器；❌ 记录对话内容 |

**红线写在这里，是为了半年后你（或别人）翻代码时不用猜。** 任何把它改成「内嵌 iframe 聊天」或「抓接口」的想法，都会同时踩到平台条款与登录态安全两条线，本项目不做。

---

## 1. 目录结构

```
ai-hub-nav/
├─ .env.example                 环境变量模板（复制成 .env.local 填写）
├─ README.md                    本文件
├─ setup.cmd / setup.ps1        ★ 一键配置向导（装依赖 + 生成密钥 + 设密码 + 自检）
├─ dev.cmd / dev.ps1            一键启动开发模式
├─ next.config.ts               极简配置（见 §9 关于 Next 16 的提醒）
├─ tailwind.config.ts           设计令牌 → Tailwind 名字映射
├─ postcss.config.mjs
├─ tsconfig.json                strict: true，@/* → src/*
├─ scripts/
│  ├─ gen-secret.mjs            生成 SESSION_SECRET
│  ├─ hash-password.mjs         从 stdin 读密码，输出 scrypt 哈希
│  ├─ check-env.mjs             ★ 配置体检：按 Next 的方式解析 .env* 并真的验一次密码
│  ├─ check-contrast.mjs        ★ 对比度自检：直接读 globals.css + platforms.ts，新增平台自动纳入
│  ├─ e2e.mjs                   端到端冒烟测试（47 项，需要服务在跑）
│  ├─ selfcheck.mjs             离线静态自检（导入路径 / 导出名 / Tailwind 令牌 / 括号）
│  ├─ ts-loader.mjs             开发期 Node 解析钩子
│  └─ register.mjs              注册上面的钩子
├─ tests/
│  └─ run.mjs                   零依赖单元测试（96 项）
├─ docs/
│  ├─ 方案书.md                 需求拆解、优先级、数据流、开发步骤、实测发现
│  ├─ 设计系统.md               视觉规范（含对比度实算）
│  ├─ 体验走查.md               逐屏体验走查、微文案、快捷键
│  └─ 技术架构决策与风险评审.md   架构决策、部署、风险与技术债台账
└─ src/
   ├─ app/
   │  ├─ layout.tsx             根布局（html/body/元信息，lang=zh-CN）
   │  ├─ globals.css            设计令牌 + 基础层 + 组件层（唯一色值真源）
   │  ├─ login/
   │  │  ├─ page.tsx            登录页（服务端组件）
   │  │  └─ LoginForm.tsx       登录表单（无 JS 也能提交）
   │  ├─ (hub)/
   │  │  ├─ layout.tsx          ★ 访问保护唯一入口（await cookies() → 校验 → redirect）
   │  │  └─ page.tsx            ★ 主界面（路径 /）
   │  └─ api/auth/
   │     ├─ login/route.ts      登录接口（限流 + 时序安全比较 + 写 Cookie）
   │     └─ logout/route.ts     登出接口（清 Cookie → 303 回登录页）
   ├─ components/               UI 组件（无数据获取、无业务规则）
   ├─ data/
   │  ├─ platforms.ts           ★ 平台入口地址的唯一真源（当前 7 个；加减平台见 §5.5）
   │  └─ prompt-templates.ts    内置提示词模板（只读；应用 = 另存副本）
   ├─ hooks/                    useHubState / useToast / useHotkeys / useColumns
   └─ lib/
      ├─ auth/                  服务端专用：config / session / password / rate-limit / cookie-policy
      ├─ storage/               客户端专用：schema(v2) / keys / store / backup
      ├─ client/                浏览器专用：window.open、多开结果模型、剪贴板管线
      └─ utils/                 纯函数：search / url / time / cn / id（可单测）
```

**两条架构边界**（比任何分层都重要）：

1. `lib/auth/*` 只允许服务端 import，`lib/storage/*` 只允许客户端 import，两者**不许互相 import**。
2. `data/platforms.ts` 是入口地址的唯一真源，组件里不许硬编码 URL。

---

## 2. 首次配置（Windows）

前置：Node.js ≥ 22.18（本项目在 Node **v24.21.0 / npm 11.19.0** 上验证过脚本与测试）。
为什么要求 22.18：`npm test` 与 `npm run selfcheck` 直接用 Node 自带的 TS 类型擦除加载源码，不装 Vitest/Jest/ts-node。

### 方式一：一键配置（推荐）

双击项目根目录的 **`setup.cmd`**（或在项目目录的 PowerShell 里执行 `pwsh -File .\setup.ps1`）。
它会自动：检查 Node 版本 → `npm install` → 生成 `SESSION_SECRET` → 让你输入两次访问密码（不回显）并生成哈希 → 写出 `.env.local` → **跑一次配置体检，确认这个密码真的能登录**（不通过就报错退出，不会留给你一个「密码怎么输都不对」的残局）。

配好之后双击 **`dev.cmd`**（或 `pwsh -File .\dev.ps1`）启动开发模式。

### 方式二：手动配置

```powershell
# 在项目目录打开 PowerShell（开始菜单搜 “PowerShell” 或 “Windows Terminal”）
cd "D:\桌面\dsh\ai-hub-nav"

# 1) 安装依赖（需要外网）
npm install

# 2) 生成会话密钥
npm run gen-secret
#    输出示例：SESSION_SECRET=XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX

# 3) 生成密码哈希（密码不回显）
$s = Read-Host -AsSecureString "设置访问密码"
[Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)) | npm run hash-password
#    输出示例：AUTH_PASSWORD_HASH=scrypt:16384:8:1:Lwu-HB0MaFdZE...:9Kn...

# 4) 建 .env.local，把上面两行写进去
Copy-Item .env.example .env.local
notepad .env.local

# 5) 自检：确认服务端解析到的配置真的能让你登录（强烈建议做，10 秒）
#    把刚才那个密码通过管道送进去
'你的访问密码' | npm run check-env
```

> `&&` 的提醒：Windows 自带的 **Windows PowerShell 5.1 不支持 `&&`**（PowerShell 7 才支持）。
> 在 5.1 里请分行执行，或用 `;` 连接，例如 `npm run build; npm start`。

`.env.local` 最小内容：

```ini
SESSION_SECRET=上一步的输出
AUTH_PASSWORD_HASH=第三步的输出
COOKIE_SECURE=auto       # auto：http/https 都能用，https 自动加 Secure（推荐）
```

> ⚠️ **最常见的坑**：把 `COOKIE_SECURE` 写死成 `1` 却用 `http://` 访问 —— 浏览器会静默丢弃 Secure Cookie，症状是「填了密码没反应」。用默认的 `auto` 就没有这个问题；只有确定「永远只用 https」时才写 `1`。
>
> ⚠️ **第二个坑（实测踩到过）**：Next.js 用 dotenv-expand 解析 `.env*`，**值里的 `$` 会被当成变量展开**。所以哈希的分隔符是冒号 `scrypt:16384:8:1:...` 而不是常见的 `$`。用 `npm run hash-password` 生成、用 `npm run check-env` 验证，就不会中招。

---

## 3. 启动

```powershell
# 开发模式（热更新）
npm run dev
# 打开 http://localhost:3000 —— 会先跳到 /login

# 生产模式（局域网日常用这个：更省内存、无 HMR 开销）
npm run build
npm start
```

`next dev` 与 `next start` **默认就监听 `0.0.0.0`**，局域网访问不需要改任何代码。

---

## 4. 部署

### 4.1 局域网 + 外网自用 + HTTPS（你选定的路线：Tailscale Serve）

Tailscale 会把本机的 3000 端口变成一个**证书自动签发、浏览器信任**的 HTTPS 地址，不碰路由器、不用买域名、不用装根证书；出门在外（手机流量）也能访问，因为它是私有网络而不是公网暴露。

```powershell
# ---------- 只做一次 ----------
# 1) 安装 Tailscale for Windows（官方安装包），登录你的账号
# 2) 打开管理后台，在 DNS 页面启用 MagicDNS 与 HTTPS Certificates
#    （不开 HTTPS 证书，第 4 步的 serve 拿不到受信任证书）
#    入口：https://login.tailscale.com/admin/dns
# 3) 确认本机在 tailnet 里的名字
tailscale status
# 4) 让界面/命令行都能看到：管理员权限的终端里跑（Windows 下不要加 sudo）
#    Tailscale 安装后托盘图标里也有操作入口

# ---------- 每次要用时 ----------
# 5) 启动本站（首次先 npm run build）
cd "D:\桌面\dsh\ai-hub-nav"
npm run build
npm start                       # 监听 0.0.0.0:3000

# 6) 另开一个终端，把 3000 端口发布到 tailnet（--bg = 后台常驻）
tailscale serve --bg 3000
#    输出形如：Available within your tailnet: https://<机器名>.<你的tailnet>.ts.net
```

然后**用那个 https 地址访问**，输入访问密码即可。手机/平板装上 Tailscale、登录同一账号，也能直接打开这个地址。

- 查看当前发布状态：`tailscale serve status`
- 关掉发布：`tailscale serve off`
- 语法以官方文档为准（本文用到的两个命令已在 docs 里核对过）：[Tailscale Serve 文档](https://tailscale.com/docs/features/tailscale-serve) · [CLI 参考](https://tailscale.com/docs/reference/tailscale-cli/serve)

> **关于 `COOKIE_SECURE`：本项目默认 `auto`，走 Tailscale 时你什么都不用改。**
> `auto` 会在请求来自 https（或反代透传 `X-Forwarded-Proto: https`）时自动加 `Secure`，
> 来自 `http://localhost` 时自动不加 —— 两个地址都能正常登录，不会再出现「填了密码没反应」。
> 想硬性要求安全属性就写 `COOKIE_SECURE=1`（那时必须只用 https 地址访问）。

**路线 B（备选）：Caddy 内网证书（完全本地，不依赖第三方）**

```caddyfile
# Caddyfile
ai-hub.home.lan {
    tls internal
    reverse_proxy 127.0.0.1:3000
}
```

```powershell
caddy trust      # 需要管理员：把 Caddy 内部根证书装进 Windows 受信任根
caddy run        # 或 caddy start
```

再在 `C:\Windows\System32\drivers\etc\hosts` 里加一行 `127.0.0.1 ai-hub.home.lan`，访问 `https://ai-hub.home.lan`（`COOKIE_SECURE=auto` 同样适用）。

> **反代注意事项**：登录接口会校验 `Origin` 与 `Host` 是否同源，并且**同时接受 `X-Forwarded-Host`**
> —— 因为 Tailscale Serve / Caddy 可能把 Host 改成回源地址。真要遇到 `403 bad_origin`，
> 说明你一会儿用 `localhost:3000`、一会儿用外部域名访问；固定用一个地址即可。

### 4.2 放行 Windows 防火墙（局域网直连时才需要）

管理员 PowerShell，只对专用网络放行，别开到公用网络：

```powershell
New-NetFirewallRule -DisplayName "AI Hub 3000" -Direction Inbound `
  -Protocol TCP -LocalPort 3000 -Action Allow -Profile Private
```

### 4.3 Vercel（想在任何地方用）

1. 推到 GitHub 私有仓库，Import 到 Vercel。
2. Settings → Environment Variables 配 5 个：
   `SESSION_SECRET`、`AUTH_PASSWORD_HASH`、`COOKIE_SECURE=1`、`SESSION_TTL_SECONDS`、`COOKIE_NAME`（Vercel 全站 HTTPS，写 `1` 或 `auto` 都行）
3. 部署后访问 `https://<项目>.vercel.app/login`。

注意：Vercel 版是公网可访问地址，安全性完全取决于你的密码强度；本项目没有做二次验证，建议至少 16 位随机密码。

### 4.4 自有 Windows 机器常驻（三种方式）

**方式一：pm2**

```powershell
npm i -g pm2
pm2 start npm --name ai-hub -- start
pm2 save
pm2 logs ai-hub
```
Windows 上 `pm2 startup` 不支持开机自启，需要配「任务计划」开机跑 `pm2 resurrect`。

**方式二：NSSM（Windows 服务，推荐）**

```powershell
# 先把 nssm.exe 放到 C:\tools\nssm（从官方发布页下载，自行校验来源）
C:\tools\nssm\nssm.exe install AIHub "C:\Program Files\nodejs\npm.cmd" "start"
C:\tools\nssm\nssm.exe set AIHub AppDirectory "D:\桌面\dsh\ai-hub-nav"
C:\tools\nssm\nssm.exe set AIHub Start SERVICE_AUTO_START
C:\tools\nssm\nssm.exe start AIHub
```

**方式三：任务计划程序（够用，但有个经典坑）**

```powershell
$action  = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c npm start" -WorkingDirectory "D:\桌面\dsh\ai-hub-nav"
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero)   # ← 不设 0，任务会在 3 天后被强杀
Register-ScheduledTask -TaskName "AIHub" -Action $action -Trigger $trigger -Settings $settings
```

想要更小的内存占用，可在 `next.config.ts` 里加 `output: 'standalone'`，然后用 `.next/standalone` 里的 `node server.js` 启动（不必再装 node_modules）。

---

## 5. 日常操作

| 想做什么 | 怎么做 |
|---|---|
| 改入口地址 | 编辑 `src/data/platforms.ts`，改 `url` 与 `host`，更新 `lastVerified` |
| 改访问密码 | 重新 `npm run hash-password` → 更新 `.env.local` → **重启服务**（所有设备需重新登录，这是设计） |
| 备份收藏/记录 | 右上角齿轮 → 导出备份（下载 JSON） |
| 换设备 | 导出 → 在新设备导入 |
| 清空数据 | 齿轮 → 清空全部数据 |
| 看哪些地址待核对 | 齿轮 → 入口地址核对清单（含每个平台的核对日期） |

### 主输入框 = 提示词（2026-10-11 起）

顶部的大输入框现在是**提示词输入框**（多行、自动增高）：

- 在这里输入一段提示词（如「帮我优化论文结构」），**点击任何平台卡片 = 自动把这段提示词复制到剪贴板 + 打开官方页**，新标签页里直接 Ctrl+V；
- 复制来源的优先级：**输入框里的内容 > 提示词库的「当前提示词」> 不复制直接打开**（输入框下方的灰字会实时说明当前会复制哪个）；
- 草稿覆盖式保存在本机（刷新不丢；只是单个草稿字段，**不是历史记录**，每次编辑覆盖旧值，永不上传）；
- 原来的平台搜索降级为次要入口：点「搜平台」chip 或按 `s` 展开/收起（收起即清空），搜索能力不变。

### 快捷键

| 键 | 作用 |
|---|---|
| `/` | 聚焦提示词输入框 |
| `s` | 展开 / 收起平台搜索（收起即清空） |
| `Enter` | 平台搜索时：打开结果里的第一个 |
| `p` | 打开 / 关闭提示词库 |
| `1`–`9` | 载入第 N 个组合；**再按同一数字直接打开** |
| `↑ ↓ ← →` / `Home` / `End` | 在卡片间移动（按整行跳） |
| `Enter` | 打开当前聚焦的卡片 |
| `f` | 收藏 / 取消收藏当前卡片 |
| `Space` | 把当前卡片加入 / 移出多开选择 |
| `Ctrl + Enter` | 打开选中的全部 |
| `?` | 快捷键说明 |
| `Esc` | 逐级收手：关面板 → 清搜索词 → 清选择 → 取消聚焦 |

### 提示词库 / 多开组合 / 自定义标签（2026-10 新增）

**提示词库 = 右侧可折叠边栏**（快捷键 `p`，或点输入框右侧的「当前提示词」chip）
- ≥lg 是**右侧常驻面板**（320px，挤压主内容而非遮挡 —— 边看卡片边点提示词，网格始终可交互）；<lg 是底部弹层；
- 内容按分类**手风琴折叠**：置顶 / 我的提示词 / 内置 5 类模板，组头有箭头、计数徽标，含当前提示词的组带蓝点；折叠状态记忆在本机；
- **点行任意位置即主动作**（模板行 = 用这个；我的提示词行 = 设为当前并填入输入框），不需要先找按钮；⋯ 菜单里是置顶 / 编辑 / 删除；
- 内置模板点「用这个」= 另存副本并填入输入框（原版永不变）；自建提示词可置顶、编辑、删除（删除带 5 秒撤销，无确认弹窗）；
- **置顶**：图钉标识，最多同时 5 个，置顶的永远排在最前，其余按创建时间倒序；删除置顶的提示词会同步清理置顶状态；
- 库内自带搜索框（过滤标题/正文/分类，过滤时命中分组强制展开）；Esc 在边栏内逐级收手：菜单 → 编辑器 → 搜索词 → 关边栏；
- 设了「当前提示词」且输入框为空时，**点击任何平台卡片都会自动复制它**再打开官方页 —— 新标签页里直接 Ctrl+V；
- 复制失败（纯 http 页面浏览器会限制剪贴板）时：平台页照常打开，同时给你「手动复制」按钮，全文已全选，Ctrl+C 即可；
- 提示词只存这台浏览器的 localStorage，不上传；站点不做任何「自动填入平台对话框」的注入。
- 边栏开合状态也记忆在本机（只在 ≥lg 应用；<lg 每次从关闭开始）。

**多开组合**
- 勾选 ≥2 个平台 → 「存为组合」：先给自动名（组合 1 · 4），chip 立即进入改名，Enter 确认、Esc 保留自动名；
- 点组合 chip = 载入勾选；**再点同一 chip = 直接打开**（防误开 6 个标签页）；
- 快捷键 `1`–`9` 与 chip 同语义；删除/改名走 chip 上的小图标，删除带撤销；
- 组合可绑定保存时刻的「当前提示词」，打开时若该提示词还在就自动复制。

**自定义标签**
- 卡片底部虚线框 chip 是你自己的标签（与实底的内置标签区分），点「+ 标签」行内输入，Enter 确认；
- 输入时给出已有标签建议（防「代码强 / 编程强」同义分裂）；自定义标签与内置标签一起参与搜索；
- 删除点 chip 上的 ×，带撤销；平台暂时下线后，你打的标签**不会**被清掉（分级保留策略，渲染时自动隐藏）。

### PWA：安装成桌面/任务栏应用（2026-10-15 新增）

零新依赖实现：`src/app/manifest.ts`（Next 原生清单约定）+ 手写 `public/sw.js` + Pillow 生成的图标（`public/icons/`、`src/app/icon.png`、`src/app/apple-icon.png`，取色与设计系统一致）。

**安装（你要做的唯一一步）**：用 Edge/Chrome 打开站点，地址栏右侧出现「安装」图标（或菜单 → 应用 → 将此站点作为应用安装），确认后它会以**独立窗口**出现在开始菜单/任务栏/桌面，不再有浏览器地址栏。

**离线行为（如实说明）**：
- Service Worker 只缓存站点自身：带哈希的静态资源（缓存优先）+ `/offline` 兜底页（预缓存）；
- 页面导航**网络优先、不缓存 HTML**——带 Cookie 的动态页被缓存会造成状态错乱，所以断网时显示的是「当前离线」页，而不是残缺的主界面；
- 各平台官网（跨域）、`/api/*`、非 GET 请求完全不经手。

**更新**：`sw.js` 内 `VERSION` 常量即缓存版本——改静态缓存策略时递增它，旧缓存自动清理；页面本身网络优先，重新构建后刷新即新。SW 注册失败会静默跳过（PWA 是增强不是依赖）。

### 一键启动 / 停止（2026-10-16 新增）

- **桌面快捷方式「AI Hub」** → 系统 `powershell.exe`（隐藏窗口）→ `start-aihub.ps1`：端口已在监听就直接开浏览器；没在跑则（缺构建时先构建）以最小化窗口后台启动，等就绪后开浏览器。脚本支持 `-Port` / `-NoOpen` 参数。
- **停止**：关掉那个最小化的「AI Hub Server」窗口，或运行 `stop-aihub.ps1`（只结束 node 进程；端口被其他程序占用时如实报告、不误杀）。
- 代码有改动时：先 `npm run build` 再点快捷方式（`next start` 只服务已构建产物）。

**快捷方式图标的三个坑（都是实测踩出来的）**：

1. **ICO 必须用 BMP 帧**：Pillow 默认把 ICO 各尺寸写成 PNG 帧，而 Windows 只认 256×256 的 PNG 帧，小尺寸帧必须是 BMP（`bitmap_format='bmp'`），否则 Explorer 和图标选择器都读不出。
2. **不要用编译出来的 exe 当启动器**：`csc` 编译的 exe 没有签名，Windows 11 的**智能应用控制（SAC）**会直接拦截且无「仍要运行」选项；快捷方式指向**系统自带的 powershell.exe**（受信任签名二进制）则完全不触发。另外图标选择器只接受 `.ico/.exe/.dll`，**不能选 `.png`**。
3. **快捷方式必须由 `wscript.exe`（.vbs）创建**：实测由 PowerShell 的 COM 互操作（`WScript.Shell`）写出的 `.lnk`，其 IconLocation 字段在本机会失效（Explorer 渲染成空白文档图标）；由 WSH 原生宿主写出的同一内容则一切正常。生成器已收在 `tools/make-shortcut.vbs`（UTF-16LE，双击运行一次即可重建快捷方式；图标源自动复制到 `%LOCALAPPDATA%\AIHub\aihub.ico`，项目根留有 `AI Hub.ico` 副本）。

### 「一键多开」的连开策略与如实汇报

浏览器对「一次用户操作能开几个标签页」**没有规范保证**，`window.open` 还必须在用户手势的同步调用栈里执行（中间只要有一次 `await` 就必被拦）。

所以本项目的策略是：**同一个手势的同步循环里尽力逐个打开，每个都检测是否真的打开了**；被拦的渲染成真实链接 + 提供「复制链接」兜底。
`window.open(..., 'noopener')` 会让返回值恒为 `null`，于是「检测被拦」与「安全」冲突 —— 这里选了**先 `window.open`，再立刻把 `opener` 置空**：既断了 `window.opener` 引用，又保留了可检测性。

绝不静默失败：面板会如实告诉你「请求 3 个 · 已打开 2 个 · 待你点击 1 个」，并附真实链接。
如果你的浏览器把大部分都拦了，想一次全开：点地址栏右侧的「弹出式窗口」图标，选择「始终允许此网站」，再点一次即可。

---

## 5.5 如何添加一个新模型入口

**好消息**：搜索、收藏、最近使用、一键多开、快捷键、响应式栅格全是**数据驱动**的 —— 你只要加一条数据，功能自动全都有。
**坏消息**：有 4 个地方需要同步改，漏掉任何一处，自动化检查都会立刻报错（已实测验证过：故意配错会被 4 项检查同时抓住）。

> **已经用它加过一次**：豆包于 2026-10-09 按下面这套流程加进来（第 7 个平台），
> 想对照实物直接看 `src/data/platforms.ts` 里的 `doubao` 条目、`globals.css` 里的 `--brand-doubao`。

### 第 1 步：`src/data/platforms.ts`（唯一真源）

① 在 `PlatformId` 联合类型里加 id：

```ts
export type PlatformId = 'openai' | 'deepseek' | 'gemini' | 'qwen' | 'kimi' | 'zhipu' | 'doubao';
```

② 在 `PLATFORMS` 数组里加一条（照抄模板改值）：

```ts
{
  id: 'doubao',                  // 与上一行的联合类型一致
  name: '豆包',                   // 卡片标题
  vendor: '字节跳动',              // 卡片副标题的厂商名
  mark: '豆',                     // 徽标字符，1~2 个字符
  tagline: '中文日常问答与写作，接入门槛低。',   // 一句话定位（卡片正文，也是搜索语料）
  url: 'https://www.doubao.com/chat/',   // ⚠️ 官方入口，必须 https，自己点开核对
  host: 'www.doubao.com',        // 必须与 url 的 host 完全一致（有测试校验）
  aliases: ['doubao', 'db', '豆包'],      // 英文/缩写/常见误拼，搜索用
  initials: ['db'],              // 拼音首字母：中文输入法下打 db 就能找到
  tags: ['中文', '日常'],          // 卡片标签，也参与搜索
  brandVar: '--brand-doubao',    // 第 3 步要在 globals.css 里定义
  tintHex: '#2A2F4A',            // 徽标底色：识别色 16% 混在卡片底上的预计算值
  fillVar: '--fill-doubao',      // 实心填充色（白字要在它上面达标）
  lastVerified: '2026-10-09',    // 你核对入口地址的日期
}
```

### 第 2 步：`src/lib/storage/schema.ts` 的 `KNOWN_PLATFORM_IDS`

```ts
export const KNOWN_PLATFORM_IDS: readonly PlatformId[] = [
  'openai', 'deepseek', 'gemini', 'qwen', 'kimi', 'zhipu',
  'doubao',                      // ← 加在这里
];
```

> ⚠️ **这一步最容易漏，而且漏了不会报错、只会静默丢数据**：`sanitizeState` 只认白名单里的 id，没登记的平台的**收藏与最近使用记录每次刷新都会被丢掉**。
> 现在有测试兜底了（`新增平台时：storage 白名单必须同步`），漏了 `npm test` 会直接失败。

### 第 3 步：`src/app/globals.css` 加两个色变量 + 一个选择器

```css
:root {
  /* ---- 平台识别色（近似示意值，不是官方规范）---- */
  --brand-doubao: #8FA6FF;       /* 图标/文字用的识别色 */
  --fill-doubao: #3B5BDB;        /* 实心填充色（白字压在上面） */
  ...
}

/* 平台色统一从 data-brand 取，组件里只写 data-brand 与内联 tintHex */
[data-brand='doubao'] {
  --brand: var(--brand-doubao);
  --fill: var(--fill-doubao);
}
```

### 第 4 步：`tailwind.config.ts` 补两个色名（保持主题映射完整）

```ts
brand: {
  openai: v('brand-openai'),
  ...
  doubao: v('brand-doubao'),     // ← 加
},
fill: {
  openai: v('fill-openai'),
  ...
  doubao: v('fill-doubao'),      // ← 加
},
```

### 第 5 步：跑检查（会告诉你颜色和遗漏）

```powershell
npm run verify          # 96 项单测 + 类型检查 + 静态自检 + 对比度，一条命令全过一遍
npm run check-contrast  # 只想看配色是否达标就看这个（新增平台会自动多出 3 项检查）
```

四个关卡分别拦住什么：

| 检查 | 会拦住 |
|---|---|
| `npm test` | CSS 变量漏定义、`data-brand` 选择器漏写、`KNOWN_PLATFORM_IDS` 漏登记、tailwind 映射漏写、id 重复、`url` 不是 https、`host` 与 url 不一致、`mark` 不是 1~2 字符、tint 底撞色 |
| `npm run check-contrast` | 识别色在卡片底/自身 tint 底上对比度 < 4.5:1；白字压在填充色上 < 4.5:1；引用了不存在的色变量 |
| `npm run typecheck` | `id` 写成联合类型里没有的值 |
| 浏览器 | 最终观感（这一步没有自动化，你自己看一眼） |

**配色怎么算**：识别色要在两种底上都达标，所以通常比"印象中的品牌色"亮一档：
`tintHex ≈ 识别色 × 16% + 卡片底 #141922 × 84%`（写进 `platforms.ts` 的那个值）。
拿不准就先随便填，`npm run check-contrast` 报 FAIL 后按它给的比值微调亮度即可。

### 第 6 步：重建 + 重启 + 刷新浏览器

```powershell
npm run build
npm start
```

> 记住那条纪律：`npm start` 跑的是构建产物，**改了数据必须重新 build**。用 `npm run dev`（或双击 `dev.cmd`）开发则自动热更新。
> 已有的收藏与最近使用不会丢（localStorage 里按 id 存，新增 id 不影响旧数据）。

### 第 7 步（可选）：删掉一个平台

反向操作即可。特别注意：删掉 id 会让该平台的收藏/最近记录在下次清洗时被丢掉（这是预期行为），另外别忘了 `KNOWN_PLATFORM_IDS` 里也要删，否则测试会提示"两边名单不一致"。

---

## 6. 验证与测试

```powershell
npm test                 # 96 项零依赖单元测试（签名/篡改/过期/迁移/限流/搜索/URL 白名单/令牌一致性/新增平台护栏/schema v3）
npm run selfcheck        # 离线静态自检：导入路径、导出名、Tailwind 令牌、括号平衡
npm run check-contrast   # 对比度自检：42 项 WCAG 检查（新增平台会自动多出 3 项）
npm run typecheck # tsc --noEmit
npm run verify    # test + typecheck
npm run check-env # 配置体检：按 Next 的方式解析 .env*，可选地把密码管道进来验一次
npm run test:e2e  # 端到端冒烟（41 项，需要服务已在跑）：AUTH_TEST_PASSWORD="密码" npm run test:e2e
npm run build     # 真正的构建验证
```

### 交付时的验证状态（据实说明）

| 项 | 状态 |
|---|---|
| `npm install` | ✅ 通过（103 个包，Next 15.5.27 / React 19.3.0 / Tailwind 3.4.19 / TS 5.9.3） |
| `npm run build` | ✅ 通过（`/` 与 `/login` 均为按需动态渲染，First Load JS 114 kB） |
| `npm run typecheck` | ✅ 0 错误 |
| 96 项单元测试 | ✅ 通过（含「dotenv 会不会改坏哈希」「新增平台护栏」「schema v2/v3 迁移与清洗」「置顶排序」的回归测试） |
| 静态自检（导入/导出/令牌/括号） | ✅ 通过 |
| `npm run test:e2e`（47 项真实 HTTP 冒烟） | ✅ 全部通过（含 Cookie 属性、篡改令牌、限流、开放重定向、反代 Host、新功能挂载点、泄露检查） |
| `npm run check-contrast`（42 项对比度） | ✅ 全部达标 |
| 浏览器实测（点击、多开、收藏、localStorage） | ⚠️ **需你手工过一遍** —— 自动化只能验到 HTTP 与渲染层，见下面的手工清单 |

### 端到端冒烟测试

```powershell
# 另开一个窗口起服务
npm run build; npm start

# 本窗口跑冒烟（用你自己的访问密码）
$env:AUTH_TEST_PASSWORD="你的访问密码"; npm run test:e2e
```

它会用 `X-Forwarded-For` 造一个随机 IP 当限流桶，因此**不会污染你真实的失败计数**，也不会被你自己刚失败过的次数影响。

### 手工验收清单（自动化代替不了，约 15 分钟）

**A. 登录链路（5 项）**
1. 未登录直接访问 `/` → 应跳到 `/login`
2. 输错密码 → 就地红字提示，**不清空输入框**
3. 连错 12 次 → 出现「尝试次数过多，请等 N 秒」，等待后仍可再试（**永不永久锁死**）
4. 输对密码 → 进入主界面；刷新后仍保持登录
5. 点退出 → 回到登录页，再次直接访问 `/` 仍被拦

**B. 功能（6 项）**
1. 搜索 `tyqw`、`通义`、`GPT` 都能命中；无结果时给出空状态与清空按钮
2. 收藏三个平台 → 顶部收藏区出现，刷新后仍在
3. 勾选 3 个 → 底部操作栏显示「已选 3 个」→ 点打开：自动开 1 个，面板列出另外 2 个真实链接
4. 面板里点链接 → 能打开，且该平台进入最近使用
5. 最近使用显示相对时间与次数，`清空记录` 生效
6. 依次按 `/`、`f`、`Space`、`Ctrl+Enter`、`?`、`Esc`，行为与 §5 一致

**C. 兼容性（4 项）**
1. Chrome / Edge / Firefox 各走一遍 A1–A4
2. 窗口宽度 375 / 768 / 1024 / 1440：卡片分别是 1 / 2 / 3 / 4 列
3. 浏览器缩放 200%，布局不重叠、按钮可点
4. 禁用 JavaScript：登录页仍能提交（原生表单 + 303 跳转）

**D. 异常（4 项）**
1. 浏览器禁用 localStorage → 页面仍可用，设置页给出提示
2. 弹窗被拦截 → 面板如实显示「已打开 0 个 · 待你点击 3 个」，链接仍可点
3. 登录态过期（把 Cookie 删掉）→ 操作时自动回到登录页，不白屏
4. 断网后点卡片 → 浏览器自己的错误页（本站不做处理，符合预期）

**E. 隐私与安全（5 项，不可跳过）**
1. DevTools → Network：除 `/api/auth/login` 外不应有任何把密码/数据发出去的请求
2. Application → Local Storage：只有 `aihub:v1:state`，内容里没有对话文本、没有搜索关键词
3. 手动把 Cookie 值改一个字符 → 刷新应被判为非法并回到登录页（HMAC 校验生效）
4. 直接 POST `https://你的域名/api/auth/login` 且带跨站 `Origin` → 返回 403
5. 响应头里没有 `X-Powered-By`（`poweredByHeader: false` 已生效）

---

## 7. 隐私与合规

- **不接模型 API**：本站没有调用任何平台的接口，因此不涉及 API 条款、配额与计费。
- **不爬取、不模拟登录**：只做浏览器跳转到官方页面，不解析页面内容、不注入脚本、不绕过验证码与限流。
- **不存对话内容**：localStorage 里只有 `platformId`、时间戳、打开次数与几个开关。
- **服务端唯一持有的数据**：`.env.local` 里的会话密钥与密码哈希。没有数据库，没有日志记录密码。
- **品牌与色值**：各平台的名称、图标归属各自公司；本项目只做文字与首字母徽标，**品牌色是近似示意值**，仅自用；若对外发布请替换为官方色值并重跑 `npm run check-contrast`。
- 页面已设置 `robots: noindex, nofollow`，避免被搜索引擎收录。

---

## 8. 安全设计要点（给未来的自己）

| 威胁 | 缓解 |
|---|---|
| 会话伪造 | HMAC-SHA256 签名令牌；`timingSafeEqual` 定长比较；签名前先做 hex 白名单 |
| 改密码后旧会话仍有效 | 签名密钥 = HMAC(SESSION_SECRET, sha256(密码材料))，改密码即全端登出，无需会话表 |
| 暴力破解 | 进程内滑动窗口限流 + 递增延迟（上限 4 秒），**永不永久锁死**（单人自用锁死自己是最坏结果） |
| XSS 偷令牌 | Cookie `httpOnly` + `sameSite=lax`；令牌不进 JS 可达的存储 |
| CSRF | 登录/登出都是 POST + `Origin`/`Host` 同源校验 + SameSite=Lax |
| 开放重定向 | `?next=` 白名单：只接受单个 `/` 开头的站内相对路径 |
| 弱配置静默放行 | 配置缺失时 `fail closed`：不进入应用，而是渲染配置说明页 |
| 令牌明文过网 | 走 HTTPS（见 §4.1）；`COOKIE_SECURE=auto` 会在 https 请求上自动加 `Secure` |

技术债（已知但按当前约束接受）：限流是**进程内**内存实现，重启清零，多进程不共享；触发还债的信号是「站点暴露到公网」或「日志里出现陌生 IP 连续失败」。

---

## 9. 常见坑

| 症状 | 原因与处理 |
|---|---|
| 填了密码「没反应」 | `COOKIE_SECURE` 写死成 `1` 但你在用 `http://` → 改成 `auto`（默认值）并重启 |
| 密码怎么输都说「密码不对」 | 哈希被 `.env` 解析器改坏了（`$` 展开）。跑 `'你的密码' \| npm run check-env` 一眼看出来；用 `npm run hash-password` 重新生成冒号分隔的哈希 |
| `403 bad_origin` | 你用了和登录时不同的地址/端口访问（或反代没透传 Host） |
| 页面提示「服务端还没配置访问密码」 | `.env.local` 没建、键名写错，或改了之后没重启（环境变量只在启动时读一次） |
| **改了代码却「没生效」** | `npm start` 跑的是 `npm run build` 的产物：**改完代码必须重新 build 再 start**。只想热更新就用 `npm run dev`（实测踩过：修了密码逻辑却没重建，白排查一轮） |
| 构建报 `cookies()` 与 prerender 冲突 | 你装的可能是 Next 16.x 且默认开启了 Cache Components：在 `next.config.ts` 里加 `cacheComponents: false` |
| `npm test` 报 `Unknown file extension ".ts"` | Node 版本低于 22.18：升级 Node，或改用 `npm run typecheck` + 手工清单 |
| 端口 3000 被占用 | `npm run dev -- -p 3001`（记得同步改访问地址）；若上一个 `next start` 没退干净，先结束占用 3000 的进程 |
| 局域网打不开 | 检查防火墙入站规则是否只放行了 Private 配置文件；确认访问的是本机局域网 IPv4 而不是 `localhost` |
| 一键多开只开出一个 | 这是**预期行为**，见 §5；其余用面板里的链接 |

---

## 10. 下一步可以做什么（现在不做）

- 多设备同步（需要数据库 + 账号体系，本项目刻意不做）
- 深色/浅色主题切换（当前只做深色，浅色需要重跑整套对比度）
- 更多平台（改 `src/data/platforms.ts` 一处即可，注意 tint 底色要重新算对比度）
- 自定义快捷键、卡片排序拖拽
