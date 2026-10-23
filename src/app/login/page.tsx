import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { LoginForm } from './LoginForm';
import { isAuthenticated, readAuthConfig } from '@/lib/auth/config';
import { normalizeNextPath } from '@/lib/utils/url';

export const metadata: Metadata = {
  title: '登录 · AI Hub',
  robots: { index: false, follow: false },
};

interface LoginPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = (await searchParams) ?? {};

  const next = normalizeNextPath(params.next, '/');
  const errorParam = typeof params.error === 'string' ? params.error : '';
  const initialError =
    errorParam === 'locked'
      ? '尝试次数过多，请稍后再试。'
      : errorParam.length > 0
        ? '密码不对，请再试一次。'
        : '';

  const configResult = readAuthConfig();

  // 无条件读一次 Cookie：理由同 (hub)/layout.tsx —— 让本页始终动态渲染，
  // 避免构建机没配环境变量时把「未配置」提示页静态烘焙进产物。
  const cookieStore = await cookies();

  // 已登录就直接进站，不需要再输一次
  if (configResult.ok) {
    const token = cookieStore.get(configResult.config.cookieName)?.value;
    if (isAuthenticated(token, configResult.config)) redirect(next);
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-5 py-12">
      <div className="mb-8">
        <div className="mb-3 flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="flex h-9 w-9 items-center justify-center rounded-md bg-accent-600 text-base font-bold text-on-accent"
          >
            A
          </span>
          <span className="text-lg font-semibold tracking-tight text-fg-1">AI Hub</span>
        </div>
        <h1 className="text-xl font-semibold text-fg-1">需要访问密码</h1>
        <p className="mt-1.5 text-sm text-fg-2">
          这是个私人导航页，只有你自己用。密码验证通过后，登录态会保持 14 天。
        </p>
      </div>

      <div className="panel p-5">
        {configResult.ok ? (
          <LoginForm next={next} initialError={initialError} />
        ) : (
          <div className="space-y-2">
            <p className="text-sm font-medium text-warning">服务端还没配置访问密码</p>
            <p className="text-sm text-fg-2">
              在项目根目录创建 <code className="kbd">.env.local</code>，至少填上：
            </p>
            <pre className="overflow-x-auto rounded-md bg-surface-inset p-3 text-xs text-fg-2">
              {`SESSION_SECRET=<npm run gen-secret 的输出>
AUTH_PASSWORD_HASH=<npm run hash-password 的输出>
COOKIE_SECURE=auto   # auto 会自动适配 http/https；想硬性要求就写 1`}
            </pre>
            <p className="text-xs text-fg-3">缺：{configResult.missing.join('；')}</p>
          </div>
        )}
      </div>

      <p className="mt-6 text-xs leading-relaxed text-fg-3">
        本站只做跳转：不调用任何模型 API、不爬取网页、不模拟登录。点击卡片会用新标签页打开对应平台的官方网页。
      </p>
    </main>
  );
}
