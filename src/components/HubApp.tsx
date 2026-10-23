'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Platform, PlatformId } from '@/data/platforms';
import { useHotkeys } from '@/hooks/useHotkeys';
import { useHubState } from '@/hooks/useHubState';
import { useToast } from '@/hooks/useToast';
import { buildMultiOpenOutcome } from '@/lib/client/multi-open';
import type { MultiOpenOutcome } from '@/lib/client/multi-open';
import { openPlatformWindow, requestPromptCopy } from '@/lib/client/window';
import {
  addCombo,
  addCustomTag,
  deleteCombo,
  deletePrompt,
  removeCustomTag,
  renameCombo,
} from '@/lib/storage/schema';
import type { Combo, Prompt, RecentEntry } from '@/lib/storage/schema';
import { createId } from '@/lib/utils/id';
import { cn } from '@/lib/utils/cn';
import { SearchIcon } from '@/components/Icons';
import { searchPlatforms } from '@/lib/utils/search';
import { FavoritesBar } from './FavoritesBar';
import { ManualCopyDialog } from './ManualCopyDialog';
import { MultiOpenBar } from './MultiOpenBar';
import { MultiOpenPanel } from './MultiOpenPanel';
import { PlatformGrid } from './PlatformGrid';
import { PromptInput } from './PromptInput';
import { PromptSidebar } from './PromptSidebar';
import { RecentsBar } from './RecentsBar';
import type { RecentItem } from './RecentsBar';
import { SearchBar } from './SearchBar';
import { SettingsPanel } from './SettingsPanel';
import { ShortcutsHelp } from './ShortcutsHelp';
import { TopBar } from './TopBar';
import { Toast } from './ui/primitives';

interface HubAppProps {
  platforms: readonly Platform[];
}

export function HubApp({ platforms }: HubAppProps) {
  const {
    state,
    loaded,
    storageAvailable,
    toggleFavorite,
    markOpened,
    clearRecents,
    forgetRecent,
    setSetting,
    replaceState,
    resetAll,
    update,
  } = useHubState();
  const { toast, show } = useToast();

  const [platformQuery, setPlatformQuery] = useState('');
  const [selected, setSelected] = useState<PlatformId[]>([]);
  const [focusIndex, setFocusIndex] = useState(0);
  const [outcome, setOutcome] = useState<MultiOpenOutcome | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showPlatformSearch, setShowPlatformSearch] = useState(false);
  const [focusPlatformSearch, setFocusPlatformSearch] = useState(false);
  const [manualCopy, setManualCopy] = useState<{ title: string; content: string } | null>(null);
  const [copyFlash, setCopyFlash] = useState(false);
  const [armedComboId, setArmedComboId] = useState<string | null>(null);
  const [renamingComboId, setRenamingComboId] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const promptInputRef = useRef<HTMLTextAreaElement | null>(null);
  const platformSearchRef = useRef<HTMLInputElement | null>(null);
  const flashTimerRef = useRef<number | null>(null);

  const platformById = useMemo(() => {
    const map = new Map<PlatformId, Platform>();
    for (const platform of platforms) map.set(platform.id, platform);
    return map;
  }, [platforms]);

  const activePrompt = useMemo(
    () => state.prompts.find((prompt) => prompt.id === state.settings.activePromptId) ?? null,
    [state.prompts, state.settings.activePromptId],
  );

  /** 提示词边栏（≥lg docked / <lg 底部弹层）的开合，记忆在 settings */
  const sidebarOpen = state.settings.promptSidebarOpen;

  // 自定义标签并入搜索语料（内置 tags + extraTags 一起参与匹配）
  const searchablePlatforms = useMemo(
    () =>
      platforms.map((platform) => ({
        ...platform,
        extraTags: state.customTags[platform.id] ?? [],
      })),
    [platforms, state.customTags],
  );

  const results = useMemo(
    () => searchPlatforms(searchablePlatforms, platformQuery),
    [searchablePlatforms, platformQuery],
  );

  const knownTags = useMemo(() => {
    const tags = new Set<string>();
    for (const list of Object.values(state.customTags)) {
      for (const tag of list) tags.add(tag);
    }
    return [...tags];
  }, [state.customTags]);

  const favoritePlatforms = useMemo(
    () => state.favorites.map((id) => platformById.get(id)).filter((platform): platform is Platform => platform !== undefined),
    [state.favorites, platformById],
  );

  const recentItems = useMemo<RecentItem[]>(
    () =>
      state.recents
        .map((entry) => {
          const platform = platformById.get(entry.platformId);
          return platform === undefined ? null : { entry, platform };
        })
        .filter((item): item is RecentItem => item !== null),
    [state.recents, platformById],
  );

  const selectedPlatforms = useMemo(
    () => selected.map((id) => platformById.get(id)).filter((platform): platform is Platform => platform !== undefined),
    [selected, platformById],
  );

  const recentsForGrid = useMemo<RecentEntry[]>(() => state.recents, [state.recents]);

  /** 输入框里的临时提示词（草稿）：覆盖式保存在本机，不是历史记录 */
  const draft = state.settings.promptDraft;
  const handleDraftChange = useCallback(
    (value: string) => {
      setSetting('promptDraft', value);
    },
    [setSetting],
  );

  // 时间只在客户端算：服务端与浏览器时区不同会水合不一致
  useEffect(() => {
    if (!loaded) return undefined;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, [loaded]);

  useEffect(() => {
    setFocusIndex((current) => (current > results.length - 1 ? 0 : current));
  }, [results.length]);

  /* ------------------------------------------------------------ 复制管线 */
  /* CTO §3：同步开窗为主收益；复制不 await、同步发起；失败转「手动复制」兜底 */

  interface CopySource {
    title: string;
    content: string;
  }

  const copyPromptNow = useCallback(
    (source: CopySource) => {
      const request = requestPromptCopy(source.content);

      if (request.mode === 'manual') {
        show('浏览器没放行复制（非 HTTPS 页面限制剪贴板）', 'danger', {
          label: '手动复制',
          run: () => setManualCopy({ title: source.title, content: source.content }),
        });
        return;
      }

      void request.promise.then((ok) => {
        if (ok) {
          setCopyFlash(true);
          if (flashTimerRef.current !== null) window.clearTimeout(flashTimerRef.current);
          flashTimerRef.current = window.setTimeout(() => setCopyFlash(false), 10000);
          show(`已复制「${source.title}」，新标签页里 Ctrl+V 即可`, 'success');
          return;
        }
        show('浏览器没放行复制（剪贴板权限被拒）', 'danger', {
          label: '手动复制',
          run: () => setManualCopy({ title: source.title, content: source.content }),
        });
      });
    },
    [show],
  );

  /** 复制来源优先级（需求一）：输入框草稿 > 指定的库提示词 > 「当前提示词」 */
  const resolveCopySource = useCallback(
    (promptId: string | null): CopySource | null => {
      if (draft.trim().length > 0) return { title: '输入框提示词', content: draft };
      if (promptId !== null) {
        const bound = state.prompts.find((prompt) => prompt.id === promptId);
        if (bound !== undefined) return { title: bound.title, content: bound.content };
      }
      if (activePrompt !== null) return { title: activePrompt.title, content: activePrompt.content };
      return null;
    },
    [draft, state.prompts, activePrompt],
  );

  const copySourceForOpen = useMemo<CopySource | null>(() => {
    if (draft.trim().length > 0) return { title: '输入框提示词', content: draft };
    if (activePrompt !== null) return { title: activePrompt.title, content: activePrompt.content };
    return null;
  }, [draft, activePrompt]);

  const promptStatusHint = useMemo(() => {
    const trimmed = draft.trim();
    if (trimmed.length > 0) {
      return `点击卡片时复制这里的提示词（${trimmed.length} 字）并打开平台；清空输入框则回退到当前提示词`;
    }
    if (activePrompt !== null) {
      return `输入框为空：点击卡片将复制当前提示词「${activePrompt.title}」`;
    }
    return '输入提示词后点击卡片 = 自动复制并打开；直接点卡片 = 仅打开';
  }, [draft, activePrompt]);

  /* -------------------------------------------------------------- 打开流程 */

  /** ⚠️ 必须在用户手势的同步栈里执行（中间不能 await），否则 window.open 被拦 */
  const openMany = useCallback(
    (ids: readonly PlatformId[], source: CopySource | null) => {
      if (ids.length === 0) return;

      // 尽力连开：同一个手势的同步循环里逐个 window.open，
      // 每个都检测返回值 —— 被拦的如实记入 pending，绝不谎报成功。
      const opened: PlatformId[] = [];
      for (const id of ids) {
        const platform = platformById.get(id);
        if (platform === undefined) continue;
        if (openPlatformWindow(platform.url)) opened.push(id);
      }

      for (const id of opened) markOpened(id, 'multi');
      if (source !== null) copyPromptNow(source);

      const result = buildMultiOpenOutcome(ids, opened, Date.now());
      if (result.pending.length === 0) {
        setOutcome(null);
        // 复制反馈已经说了「已复制」，就不再叠加「已打开 N 个」
        if (source === null) show(`已打开 ${opened.length} 个`, 'success');
        return;
      }
      setOutcome(result);
    },
    [platformById, markOpened, copyPromptNow, show],
  );

  const handleOpenSingle = useCallback(
    (platformId: PlatformId) => {
      markOpened(platformId, 'single');
      if (copySourceForOpen !== null) copyPromptNow(copySourceForOpen);
    },
    [markOpened, copySourceForOpen, copyPromptNow],
  );

  const handleOpenSelected = useCallback(() => {
    if (selected.length === 0) return;
    openMany(selected, copySourceForOpen);
  }, [selected, copySourceForOpen, openMany]);

  const handleSearchEnter = useCallback(() => {
    const target = results[0];
    if (target === undefined) return;
    openPlatformWindow(target.url);
    markOpened(target.id, 'single');
    if (copySourceForOpen !== null) copyPromptNow(copySourceForOpen);
  }, [results, markOpened, copySourceForOpen, copyPromptNow]);

  /* ------------------------------------------------------------ 选择与组合 */

  const handleToggleSelect = useCallback((platformId: PlatformId) => {
    setArmedComboId(null);
    setSelected((previous) =>
      previous.includes(platformId)
        ? previous.filter((id) => id !== platformId)
        : [...previous, platformId],
    );
  }, []);

  const handleArmCombo = useCallback(
    (combo: Combo) => {
      // 过滤掉当前不存在的平台（组合按形态白名单保留，孤儿 id 渲染时过滤）
      const ids = combo.platformIds.filter((id): id is PlatformId => platformById.has(id as PlatformId));
      if (ids.length === 0) {
        show(`组合「${combo.name}」里的平台都已下线`, 'warning');
        return;
      }

      // 两段式：第一次点 = 载入勾选；再点同一组合 = 直接打开
      if (armedComboId === combo.id) {
        setSelected(ids);
        setArmedComboId(null);
        openMany(ids, resolveCopySource(combo.promptId));
        return;
      }

      setSelected(ids);
      setArmedComboId(combo.id);
      setOutcome(null);
    },
    [armedComboId, platformById, openMany, resolveCopySource, show],
  );

  const handleSaveCombo = useCallback(() => {
    if (selected.length < 2) return;
    const now = Date.now();
    const id = createId('cmb', new Set(state.combos.map((combo) => combo.id)));
    const autoName = `组合 ${state.combos.length + 1} · ${selected.length}`;
    update((current) =>
      addCombo(
        current,
        { name: autoName, platformIds: [...selected], promptId: state.settings.activePromptId },
        () => id,
        now,
      ),
    );
    // 保存时刻不强制起名：先给自动名，立即进入行内改名
    setRenamingComboId(id);
    show('已保存组合，可以直接改名', 'success');
  }, [selected, state.combos, state.settings.activePromptId, update, show]);

  const handleRenameCombo = useCallback(
    (comboId: string, name: string) => {
      update((current) => renameCombo(current, comboId, name));
      setRenamingComboId(null);
    },
    [update],
  );

  const handleDeleteCombo = useCallback(
    (combo: Combo) => {
      const snapshot = state;
      update((current) => deleteCombo(current, combo.id));
      if (armedComboId === combo.id) setArmedComboId(null);
      show(`已删除组合「${combo.name}」`, 'info', {
        label: '撤销',
        run: () => replaceState(snapshot),
      });
    },
    [state, update, armedComboId, replaceState, show],
  );

  /* ------------------------------------------------------------ 自定义标签 */

  const handleAddTag = useCallback(
    (platformId: PlatformId, tag: string) => {
      update((current) => addCustomTag(current, platformId, tag));
    },
    [update],
  );

  const handleRemoveTag = useCallback(
    (platformId: PlatformId, tag: string) => {
      const snapshot = state;
      update((current) => removeCustomTag(current, platformId, tag));
      show(`已移除「${tag}」`, 'info', {
        label: '撤销',
        run: () => replaceState(snapshot),
      });
    },
    [state, update, replaceState, show],
  );

  /* ------------------------------------------------------------ 快捷键 */

  const focusedId =
    results.length === 0 ? undefined : results[Math.min(focusIndex, results.length - 1)].id;

  const handleDigit = useCallback(
    (digit: number) => {
      const combo = state.combos[digit - 1];
      if (combo === undefined) return;
      handleArmCombo(combo);
    },
    [state.combos, handleArmCombo],
  );

  useHotkeys(
    {
      onFocusPrompt: () => {
        promptInputRef.current?.focus();
      },
      onTogglePlatformSearch: () => {
        const expanding = !showPlatformSearch;
        setShowPlatformSearch(expanding);
        if (expanding) setFocusPlatformSearch(true);
        else setPlatformQuery('');
      },
      onEscape: () => {
        if (outcome !== null) {
          setOutcome(null);
          return;
        }
        // 边栏是最上层上下文：先关它（边栏内部的菜单/编辑器/搜索词由边栏自己逐级收手）
        if (sidebarOpen) {
          setSetting('promptSidebarOpen', false);
          return;
        }
        if (platformQuery.length > 0) {
          setPlatformQuery('');
          return;
        }
        if (selected.length > 0) {
          setSelected([]);
          setArmedComboId(null);
          return;
        }
        promptInputRef.current?.blur();
      },
      onToggleFavorite: () => {
        if (focusedId !== undefined) toggleFavorite(focusedId);
      },
      onToggleSelect: () => {
        if (focusedId !== undefined) handleToggleSelect(focusedId);
      },
      onToggleHelp: () => setShowHelp((previous) => !previous),
      onTogglePrompts: () => setSetting('promptSidebarOpen', !sidebarOpen),
      onDigit: handleDigit,
      onOpenSelected: () => handleOpenSelected(),
    },
    !showHelp && !showSettings && manualCopy === null,
  );

  // 展开平台搜索后把焦点送进输入框（扩展开关在快捷键/按钮里设置标记）
  useEffect(() => {
    if (!focusPlatformSearch) return undefined;
    platformSearchRef.current?.focus();
    setFocusPlatformSearch(false);
    return undefined;
  }, [focusPlatformSearch]);

  const searching = platformQuery.trim().length > 0;
  const anyDialogOpen = showHelp || showSettings || manualCopy !== null;

  return (
    <div data-sidebar-open={sidebarOpen}>
      <TopBar
        entryCount={platforms.length}
        favoriteCount={state.favorites.length}
        onOpenHelp={() => setShowHelp(true)}
        onOpenSettings={() => setShowSettings(true)}
      />

      <main className="mx-auto w-full max-w-container px-4 pb-40 pt-5 transition-[margin] duration-slow ease-standard lg:mr-[var(--sidebar-w)] sm:px-6">
        <div className="flex flex-wrap items-start gap-2.5">
          <div className="min-w-0 flex-1">
            <PromptInput
              value={draft}
              onChange={handleDraftChange}
              statusHint={promptStatusHint}
              inputRef={promptInputRef}
            />
          </div>

          <div className="flex flex-col items-end gap-2">
            {/* 当前提示词 chip：常驻可见，点开/收起提示词边栏（UX：状态即入口） */}
            <button
              type="button"
              className={cnChip(copyFlash)}
              aria-pressed={sidebarOpen}
              aria-label="当前提示词，点击打开或收起提示词边栏"
              title="提示词边栏（快捷键 p）"
              onClick={() => setSetting('promptSidebarOpen', !sidebarOpen)}
            >
              {copyFlash
                ? '✓ 已复制'
                : activePrompt === null
                  ? '未选提示词 ▸'
                  : `当前：${activePrompt.title} ▸`}
            </button>

            {/* 平台搜索（次要入口）：默认收起，s 键或按钮展开 */}
            <button
              type="button"
              className={cn('chip', showPlatformSearch && 'border-border-accent bg-accent-tint text-fg-1')}
              aria-pressed={showPlatformSearch}
              title="平台搜索（快捷键 s）"
              onClick={() => {
                const expanding = !showPlatformSearch;
                setShowPlatformSearch(expanding);
                if (expanding) setFocusPlatformSearch(true);
                else setPlatformQuery('');
              }}
            >
              搜平台 <span className="kbd">s</span>
            </button>
          </div>
        </div>

        {showPlatformSearch ? (
          <div className="mt-2.5">
            <SearchBar
              hintKey="s"
              value={platformQuery}
              onChange={setPlatformQuery}
              onEnter={handleSearchEnter}
              inputRef={platformSearchRef}
              resultCount={results.length}
              totalCount={platforms.length}
              showHint
            />
          </div>
        ) : null}

        {/* 首访不渲染空区块：界面随使用自然生长，而不是先展示一堆「空」 */}
        {loaded && !searching ? (
          <FavoritesBar
            platforms={favoritePlatforms}
            onRemove={toggleFavorite}
            onOpened={handleOpenSingle}
          />
        ) : null}

        {loaded && !searching ? (
          <RecentsBar
            items={recentItems}
            now={now}
            onClear={clearRecents}
            onForget={forgetRecent}
            onOpened={handleOpenSingle}
          />
        ) : null}

        {results.length > 0 ? (
          <section className="mt-6" aria-labelledby="grid-title">
            <div className="mb-2.5 flex items-center justify-between gap-2">
              <h2 id="grid-title" className="section-title">
                {searching ? '搜索结果' : '全部入口'}
              </h2>
              <span className="text-xs tabular-nums text-fg-3">
                {results.length} / {platforms.length}
              </span>
            </div>

            <PlatformGrid
              platforms={results}
              favorites={state.favorites}
              selected={selected}
              recents={recentsForGrid}
              customTags={state.customTags}
              knownTags={knownTags}
              now={now}
              focusIndex={focusIndex}
              onToggleFavorite={toggleFavorite}
              onToggleSelect={handleToggleSelect}
              onOpened={handleOpenSingle}
              onAddTag={handleAddTag}
              onRemoveTag={handleRemoveTag}
              onMoveFocus={setFocusIndex}
            />
          </section>
        ) : (
          <div className="mt-10 rounded-lg border border-border-subtle bg-surface-1 p-8 text-center">
            <span
              aria-hidden="true"
              className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-border-subtle bg-surface-inset text-fg-3"
            >
              <SearchIcon className="h-5 w-5" />
            </span>
            <p className="mt-3 text-sm text-fg-1">没有匹配「{platformQuery.trim()}」的入口</p>
            <p className="mt-1.5 text-xs text-fg-3">
              可以试试「Kimi」「tyqw」「中文」「代码」，或你自己加过的标签。
            </p>
            <button
              type="button"
              className="btn mx-auto mt-4"
              onClick={() => {
                setPlatformQuery('');
                setShowPlatformSearch(false);
              }}
            >
              清空搜索
            </button>
          </div>
        )}

        <footer className="mt-10 border-t border-border-subtle pt-4 text-xs leading-relaxed text-fg-3">
          <p>
            只做跳转：不调用模型 API、不爬取网页、不模拟登录。点击卡片会用新标签页打开对应平台的官方对话网页。
          </p>
          <p className="mt-1">
            收藏、最近使用、提示词、组合、自定义标签只存在这台浏览器里，不上传任何数据；不记录对话内容与搜索关键词。
          </p>
        </footer>
      </main>

      <MultiOpenBar
        platforms={selectedPlatforms}
        combos={state.combos}
        armedComboId={armedComboId}
        renamingComboId={renamingComboId}
        onArmCombo={handleArmCombo}
        onRenameCombo={handleRenameCombo}
        onCancelRename={() => setRenamingComboId(null)}
        onDeleteCombo={handleDeleteCombo}
        onSaveCombo={handleSaveCombo}
        onOpenSelected={handleOpenSelected}
        onClearSelection={() => {
          setSelected([]);
          setArmedComboId(null);
        }}
      />

      {outcome !== null ? (
        <MultiOpenPanel
          outcome={outcome}
          platforms={platforms}
          onClose={() => setOutcome(null)}
          onLinkOpened={(platformId) => markOpened(platformId, 'multi')}
          onCopied={(ok) => show(ok ? '链接已复制' : '复制失败，请手动选中文本', ok ? 'success' : 'danger')}
        />
      ) : null}

      <PromptSidebar
        open={sidebarOpen}
        onClose={() => setSetting('promptSidebarOpen', false)}
        state={state}
        update={update}
        notify={show}
      />

      {manualCopy !== null ? (
        <ManualCopyDialog
          title={manualCopy.title}
          content={manualCopy.content}
          onRetry={() => {
            const target = manualCopy;
            const request = requestPromptCopy(target.content);
            if (request.mode === 'api') {
              void request.promise.then((ok) => {
                if (ok) {
                  setManualCopy(null);
                  show('已复制，去平台页面里 Ctrl+V 即可', 'success');
                  return;
                }
                show('还是没放行 —— 文字已全选，直接 Ctrl+C 也行', 'warning');
              });
              return;
            }
            show('这个页面不支持自动复制 —— 文字已全选，直接 Ctrl+C 也行', 'warning');
          }}
          onClose={() => setManualCopy(null)}
        />
      ) : null}

      {showHelp ? <ShortcutsHelp onClose={() => setShowHelp(false)} /> : null}

      {showSettings ? (
        <SettingsPanel
          platforms={platforms}
          state={state}
          storageAvailable={storageAvailable}
          onClose={() => setShowSettings(false)}
          onRestore={replaceState}
          onClearRecents={clearRecents}
          onResetAll={resetAll}
          onToggleShortcutHints={(value) => setSetting('showShortcutHints', value)}
        />
      ) : null}

      <Toast toast={toast} />
    </div>
  );
}

function cnChip(flash: boolean): string {
  const base =
    'inline-flex max-w-56 shrink-0 items-center truncate rounded-full border px-3 py-2 text-sm transition-colors duration-fast ease-standard';
  if (flash) return `${base} border-border-accent bg-accent-tint text-success`;
  return `${base} border-border-strong bg-surface-2 text-fg-2 hover:border-border-hover hover:text-fg-1`;
}
