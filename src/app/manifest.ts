import type { MetadataRoute } from 'next';

/** PWA 清单：https://nextjs.org/docs/app/api-reference/file-conventions/manifest */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'AI Hub · 模型导航台',
    short_name: 'AI Hub',
    description: '七个官方 AI 对话入口，一处搜索、一处打开。不接 API、不爬取、不模拟登录。',
    lang: 'zh-CN',
    dir: 'ltr',
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#0B0E14',
    theme_color: '#0B0E14',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      {
        src: '/icons/maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
