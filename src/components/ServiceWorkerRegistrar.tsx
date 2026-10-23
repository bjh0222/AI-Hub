'use client';

import { useEffect } from 'react';

/** 注册 Service Worker：仅生产构建；挂载在根布局，登录页与主界面都能获得离线兜底。 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return undefined;
    if (!('serviceWorker' in navigator)) return undefined;

    const register = () => {
      void navigator.serviceWorker.register('/sw.js').catch(() => {
        // 注册失败不打扰使用：PWA 是增强，不是依赖
      });
    };

    if (document.readyState === 'complete') {
      register();
      return undefined;
    }
    window.addEventListener('load', register, { once: true });
    return () => window.removeEventListener('load', register);
  }, []);

  return null;
}
