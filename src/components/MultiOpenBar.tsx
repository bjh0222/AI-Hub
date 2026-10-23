'use client';

import { useEffect, useRef, useState } from 'react';
import type { Platform } from '@/data/platforms';
import type { Combo } from '@/lib/storage/schema';
import { cn } from '@/lib/utils/cn';

interface MultiOpenBarProps {
  platforms: readonly Platform[];
  /** 当前平台勾选集合对应的组合 id（两段式点击的第二击用） */
  armedComboId: string | null;
  combos: readonly Combo[];
  /** 正在行内命名/改名的组合 id；null 表示没有 */
  renamingComboId: string | null;
  onArmCombo: (combo: Combo) => void;
  onRenameCombo: (comboId: string, name: string) => void;
  onCancelRename: () => void;
  onDeleteCombo: (combo: Combo) => void;
  onSaveCombo: () => void;
  onOpenSelected: () => void;
  onClearSelection: () => void;
}

export function MultiOpenBar({
  platforms,
  armedComboId,
  combos,
  renamingComboId,
  onArmCombo,
  onRenameCombo,
  onCancelRename,
  onDeleteCombo,
  onSaveCombo,
  onOpenSelected,
  onClearSelection,
}: MultiOpenBarProps) {
  if (platforms.length === 0 && combos.length === 0) return null;

  return (
    <div className="glass fixed bottom-0 left-0 z-30 border-t border-border-subtle pb-[env(safe-area-inset-bottom)] transition-[right] duration-slow ease-standard right-[var(--sidebar-w,0px)]">
      {combos.length > 0 ? (
        <div className="mx-auto flex max-w-container flex-wrap items-center gap-1.5 px-4 pt-2.5 sm:px-6">
          <span className="mr-1 text-[11px] text-fg-3">组合：</span>
          {combos.map((combo, index) =>
            renamingComboId === combo.id ? (
              <ComboNameInput
                key={`rename-${combo.id}`}
                initialName={combo.name}
                placeholder="名字，如：科研组合"
                onConfirm={(name) => onRenameCombo(combo.id, name)}
                onCancel={onCancelRename}
              />
            ) : (
              <ComboChip
                key={combo.id}
                combo={combo}
                index={index + 1}
                armed={armedComboId === combo.id}
                onArm={() => onArmCombo(combo)}
                onRename={() => onRenameCombo(combo.id, combo.name)}
                onDelete={() => onDeleteCombo(combo)}
              />
            ),
          )}
        </div>
      ) : null}

      <div className="mx-auto flex max-w-container flex-wrap items-center justify-between gap-3 px-4 pt-3 sm:px-6">
        <div className="min-w-0">
          <p className="text-sm text-fg-1">
            已选 <span className="font-semibold text-accent-500">{platforms.length}</span> 个
          </p>
          <p className="truncate text-xs text-fg-3">
            {platforms.map((platform) => platform.name).join(' · ')}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn btn-ghost"
            disabled={platforms.length < 2}
            title={platforms.length < 2 ? '先勾选 2 个以上平台' : '把当前勾选存成一个组合'}
            onClick={onSaveCombo}
          >
            存为组合
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClearSelection}>
            清空选择
          </button>
          <button type="button" className="btn btn-primary" onClick={onOpenSelected}>
            打开选中的 {platforms.length} 个
          </button>
        </div>
      </div>

      <p className="mx-auto max-w-container px-4 pb-2 pt-1.5 text-[11px] text-fg-3 sm:px-6">
        会尽力一次全开；被浏览器拦住的会变成可点链接并如实报数，绝不静默失败。组合：单击载入，再点一次直接打开。
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 组合 chip：单击载入，再点直接打开；hover 出改名/删除                          */
/* -------------------------------------------------------------------------- */

function ComboChip({
  combo,
  index,
  armed,
  onArm,
  onRename,
  onDelete,
}: {
  combo: Combo;
  index: number;
  armed: boolean;
  onArm: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  return (
    <span
      className={cn(
        'chip group/combo pl-2',
        armed && 'border-border-accent bg-accent-tint text-fg-1',
      )}
    >
      <span className="kbd mr-0.5 !min-w-0 px-1 py-0 text-[10px]" aria-hidden="true">
        {index}
      </span>
      <button
        type="button"
        className="text-fg-1"
        title={armed ? '已载入 · 再点一次直接打开' : '载入这个组合（再点一次直接打开）'}
        onClick={onArm}
      >
        {combo.name}
        <span className="ml-1 text-[11px] text-fg-3">{combo.platformIds.length}</span>
      </button>
      <button
        type="button"
        className="icon-btn h-5 w-5 rounded-full opacity-0 transition-opacity group-hover/combo:opacity-100"
        aria-label={`重命名组合 ${combo.name}`}
        title="重命名"
        onClick={onRename}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3z" />
        </svg>
      </button>
      <button
        type="button"
        className="icon-btn h-5 w-5 rounded-full opacity-0 transition-opacity group-hover/combo:opacity-100"
        aria-label={`删除组合 ${combo.name}`}
        title="删除"
        onClick={onDelete}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      </button>
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* 行内命名输入（保存后自动命名 + 立即改名；不用 window.prompt）                 */
/* -------------------------------------------------------------------------- */

function ComboNameInput({
  initialName,
  placeholder,
  onConfirm,
  onCancel,
}: {
  initialName: string;
  placeholder: string;
  onConfirm: (name: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initialName);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  function confirm() {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      onCancel();
      return;
    }
    onConfirm(trimmed);
  }

  return (
    <input
      ref={inputRef}
      className="input w-44 px-2 py-1 text-xs"
      value={value}
      maxLength={40}
      placeholder={placeholder}
      aria-label="组合名称"
      onChange={(event) => setValue(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          confirm();
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          onCancel();
        }
      }}
      onBlur={confirm}
    />
  );
}
