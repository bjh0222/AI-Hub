'use client';

import type { Platform, PlatformId } from '@/data/platforms';
import type { MultiOpenOutcome } from '@/lib/client/multi-open';
import { linksAsText } from '@/lib/client/multi-open';
import { copyText } from '@/lib/client/window';
import { ArrowUpRightIcon, CheckIcon, CloseIcon, CopyIcon } from './Icons';

interface MultiOpenPanelProps {
  outcome: MultiOpenOutcome;
  platforms: readonly Platform[];
  onClose: () => void;
  onLinkOpened: (platformId: PlatformId) => void;
  onCopied: (ok: boolean) => void;
}

export function MultiOpenPanel({
  outcome,
  platforms,
  onClose,
  onLinkOpened,
  onCopied,
}: MultiOpenPanelProps) {
  const byId = new Map<PlatformId, Platform>(platforms.map((platform) => [platform.id, platform]));

  const opened = outcome.opened
    .map((id) => byId.get(id))
    .filter((platform): platform is Platform => platform !== undefined);
  const pending = outcome.pending
    .map((id) => byId.get(id))
    .filter((platform): platform is Platform => platform !== undefined);

  async function handleCopy() {
    const ok = await copyText(linksAsText(pending.length > 0 ? pending : opened));
    onCopied(ok);
  }

  return (
    <div className="fixed inset-x-0 bottom-[calc(112px+env(safe-area-inset-bottom))] z-40 px-4 sm:px-6">
      <div className="panel mx-auto max-w-container p-4" role="status" aria-live="polite">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-fg-1">
              请求 {outcome.requested.length} 个 · 已打开 {opened.length} 个 · 待你点击 {pending.length} 个
            </p>
            <p className="mt-1 text-xs text-fg-3">
              {pending.length > 0
                ? `浏览器拦住了 ${pending.length} 个弹出窗口。下面是真实链接，点一下就开；想一次全放行，允许本站的弹出式窗口后重试即可。`
                : '全部打开成功。'}
            </p>
          </div>
          <button type="button" className="icon-btn h-8 w-8" aria-label="关闭" onClick={onClose}>
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        {opened.length > 0 ? (
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {opened.map((platform) => (
              <li key={`opened-${platform.id}`} className="badge gap-1 text-success">
                <CheckIcon className="h-3 w-3" />
                已打开 {platform.name}
              </li>
            ))}
          </ul>
        ) : null}

        {pending.length > 0 ? (
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {pending.map((platform) => (
              <li key={`pending-${platform.id}`}>
                <a
                  href={platform.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => onLinkOpened(platform.id)}
                  className="chip border-border-strong text-fg-1"
                >
                  {platform.name}
                  <ArrowUpRightIcon className="h-3 w-3 text-fg-3" />
                </a>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-3.5 flex flex-wrap items-center gap-2">
          <button type="button" className="btn px-2.5 py-1.5 text-xs" onClick={handleCopy}>
            <CopyIcon className="h-3.5 w-3.5" />
            复制{pending.length > 0 ? '待打开' : ''}链接
          </button>
          <p className="text-[11px] text-fg-3">
            按 <span className="kbd">Esc</span> 可关闭本面板；选中的卡片会一直保留，直到你清空选择。
          </p>
        </div>
      </div>
    </div>
  );
}
