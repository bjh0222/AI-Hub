'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { BUILTIN_TEMPLATES, PROMPT_CATEGORIES } from '@/data/prompt-templates';
import type { PromptTemplate } from '@/data/prompt-templates';
import {
  MAX_PINNED_PROMPTS,
  PROMPT_CATEGORY_MAX,
  PROMPT_CONTENT_MAX,
  PROMPT_TITLE_MAX,
  deletePrompt,
  sortPromptsForDisplay,
  togglePromptPin,
  updateSettings,
  upsertPrompt,
} from '@/lib/storage/schema';
import type { HubState, Prompt } from '@/lib/storage/schema';
import { createId } from '@/lib/utils/id';
import { cn } from '@/lib/utils/cn';
import { CloseIcon, PinIcon, SearchIcon } from './Icons';
import type { ToastAction, ToastTone } from './ui/primitives';

type EditorMode =
  | { kind: 'closed' }
  | { kind: 'new' }
  | { kind: 'copy'; template: PromptTemplate }
  | { kind: 'edit'; prompt: Prompt };

interface SidebarGroup {
  id: string;
  label: string;
  prompts: Prompt[];
  templates: PromptTemplate[];
}

/** 模板分组：分类 → 组 id（ASCII，用于折叠状态持久化，须与 schema 的默认集一致） */
const TEMPLATE_GROUP_IDS: Record<string, string> = {
  写作: 'tpl-writing',
  编程: 'tpl-coding',
  翻译: 'tpl-translate',
  总结: 'tpl-summarize',
  学习: 'tpl-learning',
  其他: 'tpl-other',
};

interface PromptSidebarProps {
  open: boolean;
  onClose: () => void;
  state: HubState;
  update: (next: (state: HubState) => HubState) => void;
  notify: (message: string, tone?: ToastTone, action?: ToastAction) => void;
}

export function PromptSidebar({ open, onClose, state, update, notify }: PromptSidebarProps) {
  const [filter, setFilter] = useState('');
  const [editor, setEditor] = useState<EditorMode>({ kind: 'closed' });
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const asideRef = useRef<HTMLElement | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<Element | null>(null);

  const activePrompt = useMemo(
    () => state.prompts.find((prompt) => prompt.id === state.settings.activePromptId) ?? null,
    [state.prompts, state.settings.activePromptId],
  );
  const copiedTemplateIds = useMemo(() => {
    const ids = new Set<string>();
    for (const prompt of state.prompts) {
      if (prompt.builtinId !== null) ids.add(prompt.builtinId);
    }
    return ids;
  }, [state.prompts]);

  const collapsed = state.settings.promptSidebarCollapsed;

  /* -------------------------------------------------------- 分组与过滤 */

  const groups = useMemo<SidebarGroup[]>(() => {
    const pinned = state.pinnedPromptIds
      .map((id) => state.prompts.find((prompt) => prompt.id === id))
      .filter((prompt): prompt is Prompt => prompt !== undefined);
    const mine = state.prompts.filter((prompt) => !state.pinnedPromptIds.includes(prompt.id));

    const groups: SidebarGroup[] = [];
    if (pinned.length > 0) groups.push({ id: 'pinned', label: '置顶', prompts: pinned, templates: [] });
    if (mine.length > 0) groups.push({ id: 'mine', label: '我的提示词', prompts: mine, templates: [] });
    for (const category of [...PROMPT_CATEGORIES, '其他']) {
      const templates = BUILTIN_TEMPLATES.filter((template) => template.category === category);
      if (templates.length === 0) continue;
      groups.push({
        id: TEMPLATE_GROUP_IDS[category] ?? `tpl-${category}`,
        label: `${category}模板`,
        prompts: [],
        templates,
      });
    }
    return groups;
  }, [state.prompts, state.pinnedPromptIds]);

  const filterText = filter.trim().toLowerCase();
  const filtering = filterText.length > 0;

  function groupMatches(group: SidebarGroup): boolean {
    if (!filtering) return true;
    for (const prompt of group.prompts) {
      if (
        prompt.title.toLowerCase().includes(filterText) ||
        prompt.content.toLowerCase().includes(filterText) ||
        prompt.category.toLowerCase().includes(filterText)
      ) {
        return true;
      }
    }
    for (const template of group.templates) {
      if (
        template.title.toLowerCase().includes(filterText) ||
        template.content.toLowerCase().includes(filterText) ||
        template.category.toLowerCase().includes(filterText)
      ) {
        return true;
      }
    }
    return false;
  }

  const visibleGroups = groups.filter(groupMatches);

  function isExpanded(groupId: string): boolean {
    if (filtering) return true; // 过滤时命中分组强制展开
    // 唯一真相来源：collapsed 列表里没有的就是展开的（默认收起集已由 schema 写入该列表）
    return !collapsed.includes(groupId);
  }

  /* -------------------------------------------------------- 交互处理器 */

  function handleUseTemplate(template: PromptTemplate) {
    const now = Date.now();
    const ids = new Set(state.prompts.map((prompt) => prompt.id));
    const prompt: Prompt = {
      id: createId('prm', ids),
      title: template.title,
      content: template.content,
      category: template.category,
      source: 'builtin-copy',
      builtinId: template.id,
      createdAt: now,
      updatedAt: now,
    };
    const draftIsEmpty = state.settings.promptDraft.trim().length === 0;
    update((current) =>
      updateSettings(upsertPrompt(current, prompt, now), {
        activePromptId: prompt.id,
        ...(draftIsEmpty ? { promptDraft: template.content } : {}),
      }),
    );
    notify(
      draftIsEmpty
        ? `已填入输入框：点击卡片即可使用「${template.title}」`
        : `已存入库并设为当前（输入框已有内容，点击卡片时优先用输入框）`,
      'success',
    );
  }

  function handleSetCurrent(prompt: Prompt) {
    const draftIsEmpty = state.settings.promptDraft.trim().length === 0;
    update((current) =>
      updateSettings(current, {
        activePromptId: prompt.id,
        ...(draftIsEmpty ? { promptDraft: prompt.content } : {}),
      }),
    );
    notify(
      draftIsEmpty
        ? `已填入输入框：点击卡片即可使用「${prompt.title}」`
        : `已设为当前（输入框已有内容，点击卡片时优先用输入框）`,
      'success',
    );
  }

  function handleDelete(prompt: Prompt) {
    const snapshot = state;
    update((current) => deletePrompt(current, prompt.id));
    if (editor.kind === 'edit' && editor.prompt.id === prompt.id) setEditor({ kind: 'closed' });
    notify(`已删除「${prompt.title}」`, 'info', {
      label: '撤销',
      run: () => update(() => snapshot),
    });
  }

  function handleClearCurrent() {
    update((current) => updateSettings(current, { activePromptId: null }));
  }

  function handleTogglePin(prompt: Prompt) {
    const pinned = state.pinnedPromptIds.includes(prompt.id);
    if (!pinned && state.pinnedPromptIds.length >= MAX_PINNED_PROMPTS) {
      notify(`最多同时置顶 ${MAX_PINNED_PROMPTS} 个，先取消一个再试`, 'warning');
      return;
    }
    update((current) => togglePromptPin(current, prompt.id));
  }

  function handleToggleGroup(groupId: string) {
    update((current) => {
      const collapsedNow = current.settings.promptSidebarCollapsed;
      const next = collapsedNow.includes(groupId)
        ? collapsedNow.filter((id) => id !== groupId)
        : [...collapsedNow, groupId];
      return updateSettings(current, { promptSidebarCollapsed: next });
    });
  }

  function handleSubmit(
    values: { title: string; category: string; content: string },
    mode: EditorMode,
  ) {
    const now = Date.now();

    if (mode.kind === 'new' || mode.kind === 'copy') {
      const ids = new Set(state.prompts.map((prompt) => prompt.id));
      const prompt: Prompt = {
        id: createId('prm', ids),
        title: values.title,
        content: values.content,
        category: values.category,
        source: mode.kind === 'copy' ? 'builtin-copy' : 'user',
        builtinId: mode.kind === 'copy' ? mode.template.id : null,
        createdAt: now,
        updatedAt: now,
      };
      const draftIsEmpty = state.settings.promptDraft.trim().length === 0;
      update((current) =>
        updateSettings(upsertPrompt(current, prompt, now), {
          activePromptId: prompt.id,
          ...(draftIsEmpty ? { promptDraft: prompt.content } : {}),
        }),
      );
      notify(
        draftIsEmpty
          ? `已填入输入框：点击卡片即可使用「${prompt.title}」`
          : `已保存「${prompt.title}」并设为当前（输入框内容优先）`,
        'success',
      );
      setEditor({ kind: 'closed' });
      return;
    }

    if (mode.kind === 'edit') {
      update((current) =>
        upsertPrompt(
          current,
          { ...mode.prompt, title: values.title, category: values.category, content: values.content },
          now,
        ),
      );
      notify('已保存', 'success');
      setEditor({ kind: 'closed' });
    }
  }

  /* -------------------------------------------------- Esc / 焦点 / 外点关闭 */

  // Esc：菜单 → 编辑器 → 边栏搜索词，逐级收手；都不满足时放行给 HubApp 关边栏
  useEffect(() => {
    if (!open) return undefined;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      if (menuFor !== null) {
        setMenuFor(null);
        event.stopPropagation();
        event.preventDefault();
        return;
      }
      if (editor.kind !== 'closed') {
        setEditor({ kind: 'closed' });
        event.stopPropagation();
        event.preventDefault();
        return;
      }
      if (filter.trim().length > 0) {
        setFilter('');
        event.stopPropagation();
        event.preventDefault();
      }
    }
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [open, menuFor, editor, filter]);

  // 打开时焦点进边栏，关闭时归还（Dialog 同款模式）
  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement;
      const desktop = asideRef.current;
      const target =
        desktop !== null && desktop.offsetParent !== null ? desktop : sheetRef.current;
      target?.focus();
      return undefined;
    }
    const previous = previousFocusRef.current;
    if (previous instanceof HTMLElement) previous.focus();
    previousFocusRef.current = null;
    return undefined;
  }, [open]);

  // ⋯ 菜单的点外关闭。
  // ⚠️ 真实点击菜单项的事件顺序是 mousedown → mouseup → click：
  //    如果这里在 mousedown 时无条件关闭菜单（并把它从 DOM 移除），
  //    菜单项的 click 就永远不会落在它身上 —— 「点了菜单但操作不生效」的根因。
  //    因此：按在菜单容器或 ⋯ 按钮内的 mousedown 不关闭，交给 click 处理。
  useEffect(() => {
    if (menuFor === null) return undefined;
    function onPointerDown(event: MouseEvent) {
      const target = event.target;
      if (target instanceof Element && target.closest('[data-prompt-menu-root]') !== null) return;
      setMenuFor(null);
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [menuFor]);

  /* ---------------------------------------------------------------- 渲染 */

  const content = (
    <PromptSidebarContent
      state={state}
      activePrompt={activePrompt}
      filter={filter}
      onFilterChange={setFilter}
      editor={editor}
      onEditorChange={setEditor}
      menuFor={menuFor}
      onMenuForChange={setMenuFor}
      visibleGroups={visibleGroups}
      isExpanded={isExpanded}
      onToggleGroup={handleToggleGroup}
      copiedTemplateIds={copiedTemplateIds}
      onUseTemplate={handleUseTemplate}
      onSetCurrent={handleSetCurrent}
      onClearCurrent={handleClearCurrent}
      onDelete={handleDelete}
      onTogglePin={handleTogglePin}
      onSubmit={handleSubmit}
      onClose={onClose}
      groupIdPrefix=""
    />
  );

  return (
    <>
      {/* ≥lg：右侧 docked 常驻面板（挤压主内容，网格始终可交互） */}
      <aside
        ref={asideRef}
        data-open={open}
        tabIndex={-1}
        role="complementary"
        aria-label="提示词库"
        className={cn(
          'fixed right-0 top-14 z-20 hidden h-[calc(100vh-3.5rem)] overflow-hidden border-l border-border-subtle bg-surface-1 outline-none lg:block',
          'w-0 transition-[width] duration-base ease-exit',
          'data-[open=true]:w-[320px] data-[open=true]:duration-slow data-[open=true]:ease-standard',
        )}
      >
        <div className="flex h-full w-[320px] flex-col">
          <PromptSidebarContent
            state={state}
            activePrompt={activePrompt}
            filter={filter}
            onFilterChange={setFilter}
            editor={editor}
            onEditorChange={setEditor}
            menuFor={menuFor}
            onMenuForChange={setMenuFor}
            visibleGroups={visibleGroups}
            isExpanded={isExpanded}
            onToggleGroup={handleToggleGroup}
            copiedTemplateIds={copiedTemplateIds}
            onUseTemplate={handleUseTemplate}
            onSetCurrent={handleSetCurrent}
            onClearCurrent={handleClearCurrent}
            onDelete={handleDelete}
            onTogglePin={handleTogglePin}
            onSubmit={handleSubmit}
            onClose={onClose}
            groupIdPrefix=""
          />
        </div>
      </aside>

      {/* <lg：底部弹层（把手 + 遮罩；内容与桌面版完全一致） */}
      <div className="fixed inset-0 z-40 lg:hidden" data-open={open} aria-hidden={!open}>
        <div
          className={cn(
            'fixed inset-0 bg-[var(--overlay-bg)] transition-opacity duration-base ease-exit',
            open ? 'opacity-100' : 'pointer-events-none opacity-0',
          )}
          onClick={onClose}
        />
        <div
          ref={sheetRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label="提示词库"
          className={cn(
            'fixed inset-x-0 bottom-0 z-10 max-h-[72dvh] overflow-hidden rounded-t-2xl border-t border-border-subtle bg-surface-2 shadow-3 outline-none',
            'transition-transform duration-base ease-exit',
            open ? 'translate-y-0 duration-slow ease-emphasized' : 'translate-y-full',
          )}
        >
          <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-border-strong" aria-hidden="true" />
          <div className="flex max-h-[calc(72dvh-1.25rem)] flex-col">
            <PromptSidebarContent
              state={state}
              activePrompt={activePrompt}
              filter={filter}
              onFilterChange={setFilter}
              editor={editor}
              onEditorChange={setEditor}
              menuFor={menuFor}
              onMenuForChange={setMenuFor}
              visibleGroups={visibleGroups}
              isExpanded={isExpanded}
              onToggleGroup={handleToggleGroup}
              copiedTemplateIds={copiedTemplateIds}
              onUseTemplate={handleUseTemplate}
              onSetCurrent={handleSetCurrent}
              onClearCurrent={handleClearCurrent}
              onDelete={handleDelete}
              onTogglePin={handleTogglePin}
              onSubmit={handleSubmit}
              onClose={onClose}
              groupIdPrefix="ms-"
            />
          </div>
        </div>
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* 边栏内容（桌面 / 移动共用）                                                  */
/* -------------------------------------------------------------------------- */

interface SidebarContentProps {
  state: HubState;
  activePrompt: Prompt | null;
  filter: string;
  onFilterChange: (value: string) => void;
  editor: EditorMode;
  onEditorChange: (mode: EditorMode) => void;
  menuFor: string | null;
  onMenuForChange: (id: string | null) => void;
  visibleGroups: SidebarGroup[];
  isExpanded: (groupId: string) => boolean;
  onToggleGroup: (groupId: string) => void;
  copiedTemplateIds: ReadonlySet<string>;
  onUseTemplate: (template: PromptTemplate) => void;
  onSetCurrent: (prompt: Prompt) => void;
  onClearCurrent: () => void;
  onDelete: (prompt: Prompt) => void;
  onTogglePin: (prompt: Prompt) => void;
  onSubmit: (values: { title: string; category: string; content: string }, mode: EditorMode) => void;
  onClose: () => void;
  /** DOM id 前缀：桌面与移动各渲染一份内容，必须避免重复 id */
  groupIdPrefix: string;
}

function PromptSidebarContent({
  state,
  activePrompt,
  filter,
  onFilterChange,
  editor,
  onEditorChange,
  menuFor,
  onMenuForChange,
  visibleGroups,
  isExpanded,
  onToggleGroup,
  copiedTemplateIds,
  onUseTemplate,
  onSetCurrent,
  onClearCurrent,
  onDelete,
  onTogglePin,
  onSubmit,
  onClose,
  groupIdPrefix,
}: SidebarContentProps) {
  return (
    <>
      {/* 标题区 */}
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border-subtle px-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-fg-1">提示词库</span>
          <span className="kbd">p</span>
        </div>
        <button
          type="button"
          className="icon-btn h-8 w-8"
          aria-label="关闭提示词库（Esc）"
          onClick={onClose}
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>

      {editor.kind !== 'closed' ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 pb-4 pt-3">
          <button
            type="button"
            className="btn btn-ghost mb-3 self-start px-2 py-1 text-xs"
            onClick={() => onEditorChange({ kind: 'closed' })}
          >
            ← 返回列表
          </button>
          <PromptEditor
            mode={editor}
            onCancel={() => onEditorChange({ kind: 'closed' })}
            onSubmit={onSubmit}
          />
        </div>
      ) : (
        <>
          {/* 当前提示词摘要 */}
          <div className="mx-3 mt-3 flex items-center justify-between gap-2 rounded-md border border-border-subtle bg-surface-inset px-3 py-2">
            <div className="min-w-0">
              <p className="text-[11px] text-fg-3">当前提示词</p>
              <p className={cn('truncate text-sm', activePrompt === null ? 'text-fg-3' : 'text-fg-1')}>
                {activePrompt === null ? '未选择 —— 点卡片直接打开' : activePrompt.title}
              </p>
            </div>
            {activePrompt === null ? null : (
              <button
                type="button"
                className="icon-btn h-6 w-6 shrink-0"
                aria-label="取消选择当前提示词"
                title="取消选择"
                onClick={onClearCurrent}
              >
                <CloseIcon className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <button
            type="button"
            className="btn btn-primary mx-3 mt-2 h-9 w-[calc(100%-1.5rem)] justify-center"
            onClick={() => onEditorChange({ kind: 'new' })}
          >
            新建提示词
          </button>

          <div className="relative mx-3 mt-2">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-3" />
            <input
              className="input h-9 pl-8"
              placeholder="搜索提示词…"
              aria-label="搜索提示词"
              value={filter}
              onChange={(event) => onFilterChange(event.target.value)}
            />
          </div>

          {/* 分组手风琴 */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-4 pt-2">
            {visibleGroups.length === 0 ? (
              <p className="px-2 py-6 text-center text-xs text-fg-3">
                没有匹配「{filter.trim()}」的提示词。
              </p>
            ) : null}

            {visibleGroups.map((group) => {
              const expanded = isExpanded(group.id);
              const containsCurrent =
                activePrompt !== null &&
                (group.prompts.some((prompt) => prompt.id === activePrompt.id) ||
                  group.templates.some((template) => activePrompt.builtinId === template.id));
              const count = group.prompts.length + group.templates.length;

              return (
                <section key={groupIdPrefix + group.id} className="mb-1">
                  <button
                    type="button"
                    className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-left transition-colors duration-fast ease-standard hover:bg-surface-2"
                    aria-expanded={expanded}
                    aria-controls={`prompt-group-${groupIdPrefix}${group.id}`}
                    onClick={() => onToggleGroup(group.id)}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                      focusable="false"
                      className={cn(
                        'h-3.5 w-3.5 shrink-0 text-fg-3 transition-transform duration-fast ease-standard',
                        expanded ? 'rotate-90' : 'rotate-0',
                      )}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="m9 5 7 7-7 7" />
                    </svg>
                    <span className="text-xs font-medium text-fg-2">{group.label}</span>
                    <span className="badge tabular-nums">{count}</span>
                    {containsCurrent ? (
                      <span
                        className="ml-auto h-1.5 w-1.5 rounded-full bg-accent-500"
                        aria-label="包含当前提示词"
                      />
                    ) : null}
                  </button>

                  <ul
                    id={`prompt-group-${groupIdPrefix}${group.id}`}
                    role="list"
                    hidden={!expanded}
                  >
                    {group.templates.map((template) => (
                      <TemplateRow
                        key={template.id}
                        template={template}
                        hasCopy={copiedTemplateIds.has(template.id)}
                        isCurrent={activePrompt?.builtinId === template.id}
                        menuOpen={menuFor === `tpl-${template.id}`}
                        onMenu={() => onMenuForChange(`tpl-${template.id}`)}
                        onMenuClose={() => onMenuForChange(null)}
                        onUse={() => onUseTemplate(template)}
                        onEdit={() => onEditorChange({ kind: 'copy', template })}
                      />
                    ))}
                    {group.prompts.map((prompt) => (
                      <PromptRow
                        key={prompt.id}
                        prompt={prompt}
                        isPinned={state.pinnedPromptIds.includes(prompt.id)}
                        isCurrent={state.settings.activePromptId === prompt.id}
                        menuOpen={menuFor === prompt.id}
                        onMenu={() => onMenuForChange(prompt.id)}
                        onMenuClose={() => onMenuForChange(null)}
                        onSetCurrent={() => onSetCurrent(prompt)}
                        onEdit={() => onEditorChange({ kind: 'edit', prompt })}
                        onDelete={() => onDelete(prompt)}
                        onTogglePin={() => onTogglePin(prompt)}
                      />
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* 行条目                                                                      */
/* -------------------------------------------------------------------------- */

function preview(content: string): string {
  const firstLine = content.split('\n')[0] ?? '';
  return firstLine.length > 30 ? `${firstLine.slice(0, 30)}…` : firstLine;
}

function RowMenu({
  open,
  items,
}: {
  open: boolean;
  items: Array<{ label: string; danger?: boolean; run: () => void }>;
}) {
  if (!open) return null;
  return (
    <div
      role="menu"
      data-prompt-menu-root
      className="absolute right-1 top-8 z-10 w-36 rounded-md border border-border-subtle bg-surface-2 p-1 shadow-2"
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          className={cn(
            'flex h-8 w-full items-center rounded-sm px-3 text-left text-sm hover:bg-surface-1-hover',
            item.danger === true && 'text-danger',
          )}
          onClick={item.run}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function TemplateRow({
  template,
  hasCopy,
  isCurrent,
  menuOpen,
  onMenu,
  onMenuClose,
  onUse,
  onEdit,
}: {
  template: PromptTemplate;
  hasCopy: boolean;
  isCurrent: boolean;
  menuOpen: boolean;
  onMenu: () => void;
  onMenuClose: () => void;
  onUse: () => void;
  onEdit: () => void;
}) {
  return (
    <li className="group relative flex items-start gap-2 rounded-md px-2 py-2 transition-colors duration-fast ease-standard hover:bg-surface-2">
      <div
        className="min-w-0 flex-1 cursor-pointer"
        title="点击使用：另存副本并填入输入框"
        onClick={onUse}
      >
        <p className="truncate text-sm text-fg-1">
          {template.title}
          {isCurrent ? <span className="badge badge-accent ml-1.5">当前</span> : null}
        </p>
        <p className="truncate text-xs text-fg-3">{preview(template.content)}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1 pt-0.5">
        <button
          type="button"
          className="btn btn-primary h-6 px-2 text-xs"
          onClick={onUse}
        >
          用这个
        </button>
        <button
          type="button"
          className="icon-btn h-6 w-6"
          data-prompt-menu-root
          aria-label={`更多操作：${template.title}`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={(event) => {
            event.stopPropagation();
            onMenu();
          }}
        >
          ⋯
        </button>
      </div>
      <RowMenu
        open={menuOpen}
        items={[{ label: hasCopy ? '再存一份副本' : '另存为副本', run: onEdit }]}
      />
    </li>
  );
}

function PromptRow({
  prompt,
  isPinned,
  isCurrent,
  menuOpen,
  onMenu,
  onMenuClose,
  onSetCurrent,
  onEdit,
  onDelete,
  onTogglePin,
}: {
  prompt: Prompt;
  isPinned: boolean;
  isCurrent: boolean;
  menuOpen: boolean;
  onMenu: () => void;
  onMenuClose: () => void;
  onSetCurrent: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
}) {
  return (
    <li
      className={cn(
        'group relative flex items-start gap-2 rounded-md px-2 py-2 transition-colors duration-fast ease-standard hover:bg-surface-2',
        isCurrent && 'bg-accent-tint before:absolute before:bottom-1.5 before:left-0 before:top-1.5 before:w-0.5 before:rounded-full before:bg-accent-500',
      )}
    >
      {/* 点行 = 主动作（设为当前）；⋯ 菜单与按钮单独处理 */}
      <div
        className="min-w-0 flex-1 cursor-pointer"
        title="点击设为当前（输入框为空时会填入输入框）"
        onClick={onSetCurrent}
      >
        <p className="truncate text-sm text-fg-1">
          {isPinned ? <PinIcon className="mr-1 inline h-3.5 w-3.5 -translate-y-px text-warning" /> : null}
          {prompt.title}
          <span className="badge ml-1.5">{prompt.category}</span>
          {isCurrent ? <span className="badge badge-accent ml-1.5">当前</span> : null}
        </p>
        <p className="truncate text-xs text-fg-3">{preview(prompt.content)}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1 pt-0.5">
        <button
          type="button"
          className="btn btn-primary h-6 px-2 text-xs"
          onClick={onSetCurrent}
        >
          设为当前
        </button>
        <button
          type="button"
          className="icon-btn h-6 w-6"
          data-prompt-menu-root
          aria-label={`更多操作：${prompt.title}`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={(event) => {
            event.stopPropagation();
            onMenu();
          }}
        >
          ⋯
        </button>
      </div>
      <RowMenu
        open={menuOpen}
        items={[
          { label: isPinned ? '取消置顶' : '置顶', run: onTogglePin },
          { label: '编辑', run: onEdit },
          { label: '删除', danger: true, run: onDelete },
        ]}
      />
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/* 编辑器（新建 / 编辑 / 内置另存副本 共用）                                     */
/* -------------------------------------------------------------------------- */

interface PromptEditorProps {
  mode: Exclude<EditorMode, { kind: 'closed' }>;
  onCancel: () => void;
  onSubmit: (values: { title: string; category: string; content: string }, mode: EditorMode) => void;
}

function PromptEditor({ mode, onCancel, onSubmit }: PromptEditorProps) {
  const initial =
    mode.kind === 'edit'
      ? { title: mode.prompt.title, category: mode.prompt.category, content: mode.prompt.content }
      : mode.kind === 'copy'
        ? { title: mode.template.title, category: mode.template.category, content: mode.template.content }
        : { title: '', category: '写作', content: '' };

  const [title, setTitle] = useState(initial.title);
  const [category, setCategory] = useState(initial.category);
  const [content, setContent] = useState(initial.content);
  const [error, setError] = useState('');

  const heading =
    mode.kind === 'edit'
      ? `编辑「${mode.prompt.title}」`
      : mode.kind === 'copy'
        ? `编辑内置模板「${mode.template.title}」`
        : '新建提示词';

  function submit() {
    if (content.trim().length === 0) {
      setError('正文不能为空 —— 复制到剪贴板的就是这段文字。');
      return;
    }
    onSubmit(
      {
        title: title.trim().length > 0 ? title.trim() : '未命名提示词',
        category,
        content,
      },
      mode,
    );
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <h3 className="text-sm font-semibold text-fg-1">{heading}</h3>
      {mode.kind === 'copy' ? (
        <p className="rounded-md bg-surface-inset px-3 py-2 text-xs text-fg-2">
          你正在编辑内置模板，保存时会另存为你的副本，原版始终不变。
        </p>
      ) : null}

      <label className="block">
        <span className="mb-1 block text-xs text-fg-3">名称（{PROMPT_TITLE_MAX} 字以内）</span>
        <input
          className="input"
          value={title}
          maxLength={PROMPT_TITLE_MAX}
          placeholder="如：周报润色"
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-xs text-fg-3">分类</span>
        <select
          className="input"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        >
          {[...PROMPT_CATEGORIES, '其他'].map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="mb-1 flex items-center justify-between text-xs text-fg-3">
          <span>正文（复制到剪贴板的就是它）</span>
          <span className="tabular-nums">
            {content.length}/{PROMPT_CONTENT_MAX}
          </span>
        </span>
        <textarea
          className="input min-h-40 w-full resize-y font-mono text-[13px] leading-relaxed"
          value={content}
          maxLength={PROMPT_CONTENT_MAX}
          placeholder="把提示词写在这里…"
          onChange={(event) => {
            setContent(event.target.value);
            setError('');
          }}
        />
      </label>

      {error.length > 0 ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}

      <div className="flex justify-end gap-2 border-t border-border-subtle pt-3">
        <button type="button" className="btn" onClick={onCancel}>
          取消
        </button>
        <button type="submit" className="btn btn-primary">
          保存并设为当前
        </button>
      </div>
    </form>
  );
}
