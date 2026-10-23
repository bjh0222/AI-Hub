interface SetupRequiredProps {
  missing: readonly string[];
}

/**
 * 环境变量没配好时展示的页面。
 * 关键点：**不放行**（fail closed），而不是「配置缺失就先让人进来」。
 */
export function SetupRequired({ missing }: SetupRequiredProps) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center px-5 py-12">
      <h1 className="text-xl font-semibold text-fg-1">还差两步就能用了</h1>
      <p className="mt-2 text-sm text-fg-2">
        服务端没读到必需的访问保护配置，因此本站暂时不放行任何页面。请按下面步骤操作：
      </p>

      <ol className="mt-5 space-y-3 text-sm text-fg-2">
        <li>
          <span className="text-fg-1">1. 生成会话密钥</span>
          <pre className="mt-1.5 overflow-x-auto rounded-md bg-surface-inset p-3 text-xs">
            npm run gen-secret
          </pre>
        </li>
        <li>
          <span className="text-fg-1">2. 生成密码哈希</span>
          <pre className="mt-1.5 overflow-x-auto rounded-md bg-surface-inset p-3 text-xs">
            {`$s = Read-Host -AsSecureString "设置访问密码"
[Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)) | npm run hash-password`}
          </pre>
        </li>
        <li>
          <span className="text-fg-1">3. 把结果写进项目根目录的 .env.local</span>
          <pre className="mt-1.5 overflow-x-auto rounded-md bg-surface-inset p-3 text-xs">
            {`SESSION_SECRET=上一步的输出
AUTH_PASSWORD_HASH=第二步的输出
COOKIE_SECURE=auto   # auto 自动适配 http/https；硬性要求就用 1`}
          </pre>
        </li>
        <li>
          <span className="text-fg-1">4. 重启服务</span>
          <span className="block text-fg-3">环境变量只在进程启动时读取一次，改完必须重启。</span>
        </li>
      </ol>

      <div className="mt-6 rounded-md border border-border-subtle bg-surface-1 p-4">
        <p className="text-xs font-medium text-warning">当前缺失：</p>
        <ul className="mt-1.5 space-y-1 text-xs text-fg-2">
          {missing.map((item) => (
            <li key={item}>· {item}</li>
          ))}
        </ul>
      </div>

      <p className="mt-6 text-xs text-fg-3">
        详细说明见项目根目录的 README.md「首次配置」一节。
      </p>
    </main>
  );
}
