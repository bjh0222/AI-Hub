import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SetupRequired } from '@/components/SetupRequired';
import { isAuthenticated, readAuthConfig } from '@/lib/auth/config';

/**
 * ★ 访问保护的唯一入口 ★
 *
 * 决策记录（docs/技术架构决策与风险评审.md §3）：
 *   - 放在「路由组 layout」里做服务端校验，而不是写 middleware/proxy：
 *     Edge Runtime 没有 node:crypto，且 Next 16 已把 middleware 更名为 proxy，
 *     这里两个坑都不踩。
 *   - 这个 layout 一旦调用 cookies()，整个 (hub) 路由组就是动态渲染，
 *     不会被静态预渲染，天然不存在「鉴权被缓存绕过」的问题。
 *   - 配置缺失时**不放行**，而是渲染配置说明页（fail closed）。
 */
export default async function HubLayout({ children }: { children: ReactNode }) {
  // 先**无条件**读一次 Cookie：只要这个 layout 用了动态 API，整个 (hub) 路由组
  // 就是动态渲染。否则会出现一个很隐蔽的坑：构建机上没有 .env.local 时，
  // 配置提示页会被静态烘焙进产物，部署后即使配好了环境变量也永远只看到提示页。
  const cookieStore = await cookies();

  const configResult = readAuthConfig();

  if (!configResult.ok) {
    return <SetupRequired missing={configResult.missing} />;
  }

  const token = cookieStore.get(configResult.config.cookieName)?.value;

  if (!isAuthenticated(token, configResult.config)) {
    redirect('/login');
  }

  return <>{children}</>;
}
