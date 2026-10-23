'use client';

import { useState } from 'react';
import type { Platform, PlatformId } from '@/data/platforms';
import { cn } from '@/lib/utils/cn';
import { formatRelativeTime } from '@/lib/utils/time';
import { BrandMark } from './BrandMark';
import { ArrowUpRightIcon } from './Icons';
import { Checkbox, IconButton } from './ui/primitives';

export interface RecentSummary {
  lastOpenedAt: number;
  openCount: number;
}

interface PlatformCardProps {
  platform: Platform;
  index: number;
  favorite: boolean;
  selected: boolean;
  /** roving tabindex：只有当前聚焦的卡片可 Tab 进入 */
  focusable: boolean;
  recent: RecentSummary | null;
  now: number;
  /** 用户自定义标签（customTags）；随卡片展示、参与搜索 */
  customTags: readonly string[];
  /** 全站已有自定义标签（用于输入建议，防同义标签分裂） */
  knownTags: readonly string[];
  onToggleFavorite: (platformId: PlatformId) => void;
  onToggleSelect: (platformId: PlatformId) => void;
  onOpened: (platformId: PlatformId) => void;
  onAddTag: (platformId: PlatformId, tag: string) => void;
  onRemoveTag: (platformId: PlatformId, tag: string) => void;
  onFocusCard: (index: number) => void;
  registerRef: (index: number, element: HTMLAnchorElement | null) => void;
}

export function PlatformCard({
  platform,
  index,
  favorite,
  selected,
  focusable,
  recent,
  now,
  customTags,
  knownTags,
  onToggleFavorite,
  onToggleSelect,
  onOpened,
  onAddTag,
  onRemoveTag,
  onFocusCard,
  registerRef,
}: PlatformCardProps) {
  const [addingTag, setAddingTag] = useState(false);

  function submitTag(raw: string) {
    const tag = raw.trim();
    setAddingTag(false);
    if (tag.length === 0) return;
    onAddTag(platform.id, tag);
  }

  const suggestions = knownTags.filter((tag) => !customTags.includes(tag)).slice(0, 5);

  return (
    <div
      data-brand={platform.id}
      data-selected={selected ? 'true' : 'false'}
      className="card group flex h-full flex-col"
    >
      {/* 角标按钮：绝对定位在 <a> 之外，避免嵌套交互元素（非法 HTML + 键盘混乱） */}
      <div className="absolute right-3 top-3 z-10 flex items-center gap-1.5">
        <Checkbox
          checked={selected}
          onChange={() => onToggleSelect(platform.id)}
          label={`${selected ? '取消选择' : '加入多开选择'}：${platform.name}`}
        />
        <IconButton
          label={favorite ? `取消收藏 ${platform.name}` : `收藏 ${platform.name}`}
          pressed={favorite}
          onClick={() => onToggleFavorite(platform.id)}
          className={cn('h-6 w-6 rounded-sm', favorite && 'text-warning')}
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            focusable="false"
            fill={favorite ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
          >
            <path d="M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8L3.6 9.7l5.8-.8z" />
          </svg>
        </IconButton>
      </div>

      <a
        ref={(element) => registerRef(index, element)}
        href={platform.url}
        target="_blank"
        rel="noopener noreferrer"
        tabIndex={focusable ? 0 : -1}
        onFocus={() => onFocusCard(index)}
        onClick={() => onOpened(platform.id)}
        className="flex flex-1 flex-col rounded-lg p-4 text-left"
      >
        <div className="flex items-start gap-3 pr-16">
          <BrandMark mark={platform.mark} tintHex={platform.tintHex} brandVar={platform.brandVar} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-base font-semibold text-fg-1">{platform.name}</span>
              <ArrowUpRightIcon className="h-3.5 w-3.5 shrink-0 text-fg-3 opacity-0 transition-opacity group-hover:opacity-100" />
            </div>
            <p className="truncate text-xs text-fg-3">
              {platform.vendor} · {platform.host}
            </p>
          </div>
        </div>

        <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-fg-2">{platform.tagline}</p>

        <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
          {platform.tags.map((tag) => (
            <span key={tag} className="badge">
              {tag}
            </span>
          ))}
          {recent === null ? null : (
            <span className="badge badge-accent">
              已打开 {recent.openCount} 次 · {formatRelativeTime(recent.lastOpenedAt, now)}
            </span>
          )}
        </div>
      </a>

      {/* 自定义标签行：放在 <a> 之外（里面有交互元素），视觉上仍是卡片的一部分 */}
      <div className="border-t border-border-subtle px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {customTags.map((tag) => (
            <span
              key={tag}
              className="group/tag inline-flex items-center gap-1 rounded-full border border-dashed border-border-strong px-2 py-0.5 text-xs text-fg-2"
            >
              {tag}
              <button
                type="button"
                className="icon-btn h-4 w-4 rounded-full opacity-0 transition-opacity group-hover/tag:opacity-100"
                aria-label={`移除标签「${tag}」`}
                title="移除标签"
                onClick={() => onRemoveTag(platform.id, tag)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </span>
          ))}

          {addingTag ? (
            <input
              autoFocus
              className="input w-36 px-2 py-0.5 text-xs"
              placeholder="输入标签，回车确认"
              aria-label={`给 ${platform.name} 添加标签`}
              list={`tag-suggestions-${platform.id}`}
              maxLength={16}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  submitTag(event.currentTarget.value);
                }
                if (event.key === 'Escape') {
                  event.preventDefault();
                  setAddingTag(false);
                }
              }}
              onBlur={(event) => submitTag(event.currentTarget.value)}
            />
          ) : (
            <button
              type="button"
              className="chip border-dashed px-2 py-0.5 text-xs text-fg-3 opacity-70 transition-opacity hover:opacity-100"
              aria-label={`给 ${platform.name} 添加标签`}
              onClick={() => setAddingTag(true)}
            >
              + 标签
            </button>
          )}
        </div>

        {addingTag && suggestions.length > 0 ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            {suggestions.map((tag) => (
              <button
                key={tag}
                type="button"
                className="chip px-1.5 py-0.5 text-[11px]"
                onClick={() => {
                  onAddTag(platform.id, tag);
                  setAddingTag(false);
                }}
              >
                {tag}
              </button>
            ))}
          </div>
        ) : null}
        {addingTag ? (
          <datalist id={`tag-suggestions-${platform.id}`}>
            {knownTags.map((tag) => (
              <option key={tag} value={tag} />
            ))}
          </datalist>
        ) : null}
      </div>
    </div>
  );
}
