'use client';

import { useCallback, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import type { Platform, PlatformId } from '@/data/platforms';
import type { CustomTags, RecentEntry } from '@/lib/storage/schema';
import { useColumns } from '@/hooks/useColumns';
import { PlatformCard } from './PlatformCard';

interface PlatformGridProps {
  platforms: readonly Platform[];
  favorites: readonly PlatformId[];
  selected: readonly PlatformId[];
  recents: readonly RecentEntry[];
  customTags: CustomTags;
  /** 全站已有自定义标签（去重后的建议列表） */
  knownTags: readonly string[];
  now: number;
  focusIndex: number;
  onToggleFavorite: (platformId: PlatformId) => void;
  onToggleSelect: (platformId: PlatformId) => void;
  onOpened: (platformId: PlatformId) => void;
  onAddTag: (platformId: PlatformId, tag: string) => void;
  onRemoveTag: (platformId: PlatformId, tag: string) => void;
  onMoveFocus: (index: number) => void;
}

export function PlatformGrid({
  platforms,
  favorites,
  selected,
  recents,
  customTags,
  knownTags,
  now,
  focusIndex,
  onToggleFavorite,
  onToggleSelect,
  onOpened,
  onAddTag,
  onRemoveTag,
  onMoveFocus,
}: PlatformGridProps) {
  const columns = useColumns();
  const refs = useRef<Array<HTMLAnchorElement | null>>([]);

  const registerRef = useCallback((index: number, element: HTMLAnchorElement | null) => {
    refs.current[index] = element;
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const total = platforms.length;
    if (total === 0) return;

    const current = Math.min(Math.max(focusIndex, 0), total - 1);
    let next = current;

    if (event.key === 'ArrowRight') next = current + 1;
    else if (event.key === 'ArrowLeft') next = current - 1;
    else if (event.key === 'ArrowDown') next = current + columns;
    else if (event.key === 'ArrowUp') next = current - columns;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = total - 1;
    else return;

    event.preventDefault();
    const clamped = Math.min(Math.max(next, 0), total - 1);
    onMoveFocus(clamped);
    refs.current[clamped]?.focus();
  }

  return (
    <div
      role="list"
      onKeyDown={handleKeyDown}
      className="grid grid-cols-1 gap-[var(--grid-gap)] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
    >
      {platforms.map((platform, index) => {
        const recent = recents.find((entry) => entry.platformId === platform.id) ?? null;
        return (
          <div role="listitem" key={platform.id} className="h-full">
            <PlatformCard
              platform={platform}
              index={index}
              favorite={favorites.includes(platform.id)}
              selected={selected.includes(platform.id)}
              focusable={index === focusIndex}
              recent={recent === null ? null : { lastOpenedAt: recent.lastOpenedAt, openCount: recent.openCount }}
              now={now}
              customTags={customTags[platform.id] ?? []}
              knownTags={knownTags}
              onToggleFavorite={onToggleFavorite}
              onToggleSelect={onToggleSelect}
              onOpened={onOpened}
              onAddTag={onAddTag}
              onRemoveTag={onRemoveTag}
              onFocusCard={onMoveFocus}
              registerRef={registerRef}
            />
          </div>
        );
      })}
    </div>
  );
}
