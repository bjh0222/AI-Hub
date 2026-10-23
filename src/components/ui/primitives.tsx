'use client';

import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { CloseIcon } from '@/components/Icons';
import { cn } from '@/lib/utils/cn';

/* -------------------------------------------------------------------------- */
/* 快捷键提示                                                                  */
/* -------------------------------------------------------------------------- */

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}

/* -------------------------------------------------------------------------- */
/* 图标按钮                                                                    */
/* -------------------------------------------------------------------------- */

interface IconButtonProps {
  label: string;
  onClick: () => void;
  children: ReactNode;
  className?: string;
  pressed?: boolean;
}

export function IconButton({ label, onClick, children, className, pressed }: IconButtonProps) {
  return (
    <button
      type="button"
      className={cn('icon-btn', className)}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* 复选框（真实 input + 视觉层）                                                */
/* -------------------------------------------------------------------------- */

interface CheckboxProps {
  checked: boolean;
  onChange: () => void;
  label: string;
  className?: string;
}

export function Checkbox({ checked, onChange, label, className }: CheckboxProps) {
  return (
    <label
      className={cn(
        'relative inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-sm border bg-surface-inset transition-colors duration-fast ease-standard',
        checked ? 'border-border-accent' : 'border-border-strong hover:border-border-hover',
        className,
      )}
    >
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        onChange={onChange}
        aria-label={label}
      />
      {checked ? (
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          focusable="false"
          className="h-4 w-4 text-accent-500"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.6}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m5 12.5 4.5 4.5L19 7" />
        </svg>
      ) : null}
    </label>
  );
}

/* -------------------------------------------------------------------------- */
/* 对话框（设置 / 快捷键帮助）                                                  */
/* -------------------------------------------------------------------------- */

interface DialogProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: 'md' | 'lg';
}

export function Dialog({ title, onClose, children, footer, width = 'md' }: DialogProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<Element | null>(null);

  useEffect(() => {
    previousFocusRef.current = document.activeElement;
    panelRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    }

    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      const previous = previousFocusRef.current;
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center">
      <div
        className="fixed inset-0 bg-[var(--overlay-bg)]"
        aria-hidden="true"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn('panel relative z-10 my-6 w-full', width === 'lg' ? 'max-w-3xl' : 'max-w-xl')}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-5 py-3.5">
          <h2 className="text-sm font-semibold text-fg-1">{title}</h2>
          <button type="button" className="icon-btn h-8 w-8" aria-label="关闭" onClick={onClose}>
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer ? (
          <div className="flex flex-wrap justify-end gap-2 border-t border-border-subtle px-5 py-3">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Toast（aria-live 播报，不抢焦点）                                            */
/* -------------------------------------------------------------------------- */

export type ToastTone = 'info' | 'success' | 'warning' | 'danger';

export interface ToastAction {
  label: string;
  /** 点击后自动关闭 toast；撤销类操作在这里恢复快照 */
  run: () => void;
}

export interface ToastMessage {
  id: number;
  message: string;
  tone: ToastTone;
  /** 「撤销 / 手动复制」这类一步可达的出口；点击后自动关闭 */
  action?: ToastAction;
}

const TONE_CLASS: Record<ToastTone, string> = {
  info: 'text-fg-1',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
};

export function Toast({ toast }: { toast: ToastMessage | null }) {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-[68px] z-40 flex justify-center px-4"
      aria-live="polite"
      aria-atomic="true"
    >
      {toast === null ? null : (
        <div className="glass pointer-events-auto flex items-center gap-3 rounded-md border border-border-subtle px-3.5 py-2 text-sm shadow-3">
          <span className={TONE_CLASS[toast.tone]}>{toast.message}</span>
          {toast.action === undefined ? null : (
            <button
              type="button"
              className="btn px-2 py-0.5 text-xs"
              onClick={() => {
                toast.action?.run();
              }}
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
