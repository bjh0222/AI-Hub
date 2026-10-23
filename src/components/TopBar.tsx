'use client';

import { GearIcon, KeyboardIcon, SignOutIcon } from './Icons';
import { IconButton } from './ui/primitives';

interface TopBarProps {
  entryCount: number;
  favoriteCount: number;
  onOpenHelp: () => void;
  onOpenSettings: () => void;
}

export function TopBar({ entryCount, favoriteCount, onOpenHelp, onOpenSettings }: TopBarProps) {
  return (
    <header className="glass sticky top-0 z-30 border-b border-border-subtle">
      <div className="mx-auto flex h-14 max-w-container items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden="true"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent-600 text-sm font-bold text-on-accent"
          >
            A
          </span>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-semibold text-fg-1">AI Hub</p>
            <p className="truncate text-[11px] text-fg-3">
              {entryCount} 个入口
              {favoriteCount > 0 ? ` · 已收藏 ${favoriteCount}` : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-0.5">
          <IconButton label="快捷键说明（?）" onClick={onOpenHelp}>
            <KeyboardIcon className="h-4 w-4" />
          </IconButton>
          <IconButton label="设置与数据" onClick={onOpenSettings}>
            <GearIcon className="h-4 w-4" />
          </IconButton>
          {/* 用原生表单退出：不依赖 JS，也不需要 CSRF token */}
          <form action="/api/auth/logout" method="post" className="flex">
            <button type="submit" className="icon-btn" aria-label="退出登录" title="退出登录">
              <SignOutIcon className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
