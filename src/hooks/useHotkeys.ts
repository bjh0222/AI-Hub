'use client';

import { useEffect, useRef } from 'react';

export interface HotkeyHandlers {
  /** `/`：聚焦提示词输入框（主输入框） */
  onFocusPrompt: () => void;
  /** `s`：展开/收起平台搜索（收起时清空搜索词） */
  onTogglePlatformSearch: () => void;
  /** Esc：逐级收手（清搜索词 → 清选择 → 失焦） */
  onEscape: () => void;
  /** `f`：收藏/取消收藏当前聚焦的卡片 */
  onToggleFavorite: () => void;
  /** 空格：把当前聚焦的卡片加入/移出多开选择 */
  onToggleSelect: () => void;
  /** `?`：快捷键说明 */
  onToggleHelp: () => void;
  /** `p`：开/关提示词库 */
  onTogglePrompts: () => void;
  /** `1`–`9`：载入第 N 个组合（再按同一数字直接打开，与 chip 两段式语义一致） */
  onDigit: (digit: number) => void;
  /** Ctrl/Cmd + Enter：打开选中的全部 */
  onOpenSelected: () => void;
}

/**
 * 全站快捷键。
 * 两条纪律（来自 UX 走查）：
 *   1. 输入框聚焦时，单键快捷键全部让路（否则没法输 `/` 和空格）
 *   2. 不拦截 Ctrl/Cmd + 数字，避免和浏览器切标签页打架
 */
export function useHotkeys(handlers: HotkeyHandlers, enabled: boolean): void {
  const handlersRef = useRef(handlers);
  const enabledRef = useRef(enabled);

  useEffect(() => {
    handlersRef.current = handlers;
    enabledRef.current = enabled;
  });

  useEffect(() => {
    function isTypingTarget(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (!enabledRef.current) return;
      const current = handlersRef.current;
      const typing = isTypingTarget(event.target);

      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        current.onOpenSelected();
        return;
      }

      if (event.key === 'Escape') {
        current.onEscape();
        return;
      }

      if (typing) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.key === '/') {
        event.preventDefault();
        current.onFocusPrompt();
        return;
      }
      if (event.key === 's' || event.key === 'S') {
        event.preventDefault();
        current.onTogglePlatformSearch();
        return;
      }
      if (event.key === '?') {
        event.preventDefault();
        current.onToggleHelp();
        return;
      }
      if (event.key === 'f' || event.key === 'F') {
        event.preventDefault();
        current.onToggleFavorite();
        return;
      }
      if (event.key === 'p' || event.key === 'P') {
        event.preventDefault();
        current.onTogglePrompts();
        return;
      }
      if (/^[1-9]$/.test(event.key)) {
        event.preventDefault();
        current.onDigit(Number(event.key));
        return;
      }
      if (event.key === ' ' || event.key === 'Spacebar') {
        event.preventDefault();
        current.onToggleSelect();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}
