'use client';

import type { RefObject } from 'react';
import { CloseIcon, SearchIcon } from './Icons';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onEnter: () => void;
  inputRef: RefObject<HTMLInputElement | null>;
  resultCount: number;
  totalCount: number;
  showHint: boolean;
  /** 聚焦快捷键提示（平台搜索已降级为次要入口，默认 s） */
  hintKey?: string;
}

export function SearchBar({
  value,
  onChange,
  onEnter,
  inputRef,
  resultCount,
  totalCount,
  showHint,
  hintKey = 's',
}: SearchBarProps) {
  const searching = value.trim().length > 0;

  return (
    <div>
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-3" />

        <input
          id="model-search"
          ref={inputRef}
          type="text"
          inputMode="search"
          className="input h-11 pr-28 pl-9"
          placeholder="搜索模型：名称 / 拼音首字母 / 标签"
          aria-label="搜索模型"
          aria-describedby="search-status"
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              onEnter();
            }
          }}
        />

        <div className="absolute right-2.5 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
          {value.length > 0 ? (
            <button
              type="button"
              className="icon-btn h-7 w-7"
              aria-label="清空搜索"
              onClick={() => onChange('')}
            >
              <CloseIcon className="h-3.5 w-3.5" />
            </button>
          ) : null}
          {showHint && value.length === 0 ? (
            <span className="kbd" aria-hidden="true">
              {hintKey}
            </span>
          ) : null}
        </div>
      </div>

      <p id="search-status" className="mt-1.5 text-xs text-fg-3" aria-live="polite">
        {searching
          ? resultCount > 0
            ? `匹配 ${resultCount} / ${totalCount} 个入口，回车打开第一个`
            : `没有匹配「${value.trim()}」的入口`
          : `${totalCount} 个官方入口 · 点击卡片用新标签页打开`}
      </p>
    </div>
  );
}
