import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { ServiceWorkerRegistrar } from '@/components/ServiceWorkerRegistrar';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI Hub · 模型导航台',
  description: '六个官方 AI 对话入口，一处搜索、一处打开。不接 API、不爬取、不模拟登录。',
  // 私人工具站：明确告诉爬虫不要收录
  robots: { index: false, follow: false, nocache: true },
  // PWA：清单 + 独立 App 模式（图标走 src/app/icon.png、apple-icon.png 文件约定，Next 自动生成 <link>）
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'AI Hub', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0B0E14',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-bg-page text-fg-1 antialiased">
        <div className="relative z-10">{children}</div>
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
