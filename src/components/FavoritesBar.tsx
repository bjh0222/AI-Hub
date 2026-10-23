'use client';

import type { Platform, PlatformId } from '@/data/platforms';
import { BrandMark } from './BrandMark';
import { CloseIcon } from './Icons';

interface FavoritesBarProps {
  platforms: readonly Platform[];
  onRemove: (platformId: PlatformId) => void;
  onOpened: (platformId: PlatformId) => void;
}

/** 收藏区：只在有内容时渲染（首访不显示空区块，界面随使用自然生长） */
export function FavoritesBar({ platforms, onRemove, onOpened }: FavoritesBarProps) {
  if (platforms.length === 0) return null;

  return (
    <section className="mt-6" aria-labelledby="favorites-title">
      <div className="mb-2 flex items-center gap-2">
        <h2 id="favorites-title" className="section-title">
          收藏
        </h2>
        <span className="badge">{platforms.length}</span>
      </div>

      <ul className="flex flex-wrap gap-2">
        {platforms.map((platform) => (
          <li key={platform.id}>
            <span className="chip gap-1 py-1 pl-2 pr-1">
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
                className="px-1 text-fg-1"
              >
                {platform.name}
              </a>
              <button
                type="button"
                className="icon-btn h-6 w-6 rounded-full"
                aria-label={`取消收藏 ${platform.name}`}
                title="取消收藏"
                onClick={() => onRemove(platform.id)}
              >
                <CloseIcon className="h-3 w-3" />
              </button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
