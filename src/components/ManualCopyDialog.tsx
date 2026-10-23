'use client';

import { useEffect, useRef } from 'react';
import { Dialog } from './ui/primitives';

interface ManualCopyDialogProps {
  title: string;
  content: string;
  /** 「再试一次」：这是一个全新的用户手势，此时重试剪贴板才可靠 */
  onRetry: () => void;
  onClose: () => void;
}

/**
 * 剪贴板失败时的手动兜底（CTO §3 / UX A4）：
 * 打开时自动全选正文，用户 Ctrl+C 即可；「再试一次」用新手势重试 Clipboard API。
 */
export function ManualCopyDialog({ title, content, onRetry, onClose }: ManualCopyDialogProps) {
  const areaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const area = areaRef.current;
    if (area === null) return undefined;
    area.focus();
    area.select();
    return undefined;
  }, []);

  return (
    <Dialog title="手动复制提示词" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-fg-2">
          复制对象：<span className="text-fg-1">{title}</span>
        </p>
        <textarea
          ref={areaRef}
          readOnly
          className="input min-h-44 w-full font-mono text-[13px] leading-relaxed"
          value={content}
          onFocus={(event) => event.target.select()}
          aria-label="提示词全文（已全选）"
        />
        <p className="text-xs text-fg-3">已全选，直接 Ctrl+C 也行；然后到平台页面里 Ctrl+V。</p>
        <div className="flex justify-end gap-2 border-t border-border-subtle pt-3">
          <button type="button" className="btn" onClick={onRetry}>
            再试一次
          </button>
          <button type="button" className="btn btn-primary" onClick={onClose}>
            我自己 Ctrl+C
          </button>
        </div>
      </div>
    </Dialog>
  );
}
