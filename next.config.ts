import type { NextConfig } from 'next';

/**
 * 故意保持最小配置：本项目是单页导航站，没有任何服务端数据源。
 *
 * ⚠️ 如果你装的是 Next 16.x，并且 `npm run build` 报「prerender 与 cookies() 冲突」，
 *    在下面对象里加一行 `cacheComponents: false,` 再重试（详见 README「常见坑」）。
 *    这里不预置该字段，是为了让同一份代码在 Next 15 与 16 上都能通过类型检查。
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // 本项目刻意不引入 ESLint 配置；显式关掉构建期 lint，
  // 避免「没有 ESLint 配置」时出现交互式提示卡住构建。
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
