import Link from 'next/link';

export const metadata = { title: 'AI Hub · 离线中' };

/** Service Worker 预缓存的离线兜底页（public/sw.js 的 PRECACHE）。 */
export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-6 text-center">
      <span
        aria-hidden="true"
        className="flex h-16 w-16 items-center justify-center rounded-2xl border border-border-subtle bg-surface-1 text-2xl"
      >
        📴
      </span>
      <h1 className="mt-5 text-lg font-semibold text-fg-1">当前离线</h1>
      <p className="mt-2 text-sm leading-relaxed text-fg-2">
        AI Hub 是本机应用，界面已装好；但「打开平台」需要网络，恢复联网后再试。
      </p>
      <p className="mt-1 text-xs text-fg-3">
        你的收藏、提示词、组合都存在本机，不会因为离线丢失。
      </p>
      <Link href="/" className="btn btn-primary mt-6">
        重试连接
      </Link>
    </main>
  );
}
