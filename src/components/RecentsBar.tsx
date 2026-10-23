'use client';

import type { Platform, PlatformId } from '@/data/platforms';
import type { RecentEntry } from '@/lib/storage/schema';
import { formatRelativeTime, isSameLocalDay } from '@/lib/utils/time';
import { BrandMark } from './BrandMark';
import { TrashIcon } from './Icons';

export interface RecentItem {
  entry: RecentEntry;
  platform: Platform;
}

interface RecentsBarProps {
  items: readonly RecentItem[];
  now: number;
  onClear: () => void;
  onForget: (platformId: PlatformId) => void;
  onOpened: (platformId: PlatformId) => void;
}

/** 最近使用：只在有记录时渲染；只记录「哪个平台、什么时候、几次」，不含任何对话内容 */
export function RecentsBar({ items, now, onClear, onForget, onOpened }: RecentsBarProps) {
  if (items.length === 0) return null;

  const today = items.filter((item) => isSameLocalDay(item.entry.lastOpenedAt, now));
  const earlier = items.filter((item) => !isSameLocalDay(item.entry.lastOpenedAt, now));

  function renderGroup(title: string, group: readonly RecentItem[]) {
    if (group.length === 0) return null;
    return (
      <div className="mt-2 first:mt-0">
        <p className="mb-1.5 text-[11px] text-fg-3">{title}</p>
        <ul className="flex flex-wrap gap-2">
          {group.map(({ entry, platform }) => (
            <li key={`${title}-${platform.id}`}>
              <span className="chip gap-2">
                <BrandMark
                  mark={platform.mark}
                  tintHex={platform.tintHex}
                  brandVar={platform.brandVar}
                  size="sm"
                />
                <a
                  href={platform.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => onOpened(platform.id)}
                  className="flex items-center gap-1.5 text-fg-1"
                >
                  <span>{platform.name}</span>
                  <span className="text-[11px] text-fg-3">
                    {formatRelativeTime(entry.lastOpenedAt, now)} · {entry.openCount} 次
                  </span>
                </a>
                <button
                  type="button"
                  className="icon-btn h-6 w-6 rounded-full"
                  aria-label={`从最近使用中移除 ${platform.name}`}
                  title="从最近使用中移除"
                  onClick={() => onForget(platform.id)}
                >
                  <TrashIcon className="h-3.5 w-3.5" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <section className="mt-6" aria-labelledby="recents-title">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 id="recents-title" className="section-title">
            最近使用
          </h2>
          <span className="badge">{items.length}</span>
        </div>
        <button type="button" className="btn btn-ghost px-2 py-1 text-xs" onClick={onClear}>
          <TrashIcon className="h-3.5 w-3.5" />
          清空记录
        </button>
      </div>

      {renderGroup('今天', today)}
      {renderGroup('更早', earlier)}
    </section>
  );
}
