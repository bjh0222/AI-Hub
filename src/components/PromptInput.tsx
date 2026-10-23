'use client';

import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

interface PromptInputProps {
  value: string;
  onChange: (value: string) => void;
  /** 由 HubApp 计算的「点击卡片时会发生什么」说明（复制来源优先级） */
  statusHint: string;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  maxLength?: number;
}

/**
 * 主输入框：提示词（需求一）。
 * 多行、自动增高（2~6 行）；Enter 换行，打开平台靠点卡片。
 * 内容只存本机 localStorage 的单字段草稿（覆盖式，不是历史记录）。
 */
export function PromptInput({ value, onChange, statusHint, inputRef, maxLength = 8000 }: PromptInputProps) {
  const areaRef = useRef<HTMLTextAreaElement | null>(null);

  // 自动增高：跟随内容，2 行起步，封顶约 6 行
  useEffect(() => {
    const area = areaRef.current;
    if (area === null) return;
    area.style.height = 'auto';
    area.style.height = `${Math.min(area.scrollHeight, 176)}px`;
  }, [value]);

  return (
    <div>
      <textarea
        ref={(element) => {
          areaRef.current = element;
          inputRef.current = element;
        }}
        rows={2}
        maxLength={maxLength}
        className="input w-full resize-none overflow-hidden leading-relaxed"
        placeholder={'输入提示词，如：帮我优化论文结构 —— 输入后点击卡片，自动复制并打开'}
        aria-label="提示词输入框"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <p id="prompt-status" className="mt-1.5 text-xs text-fg-3" aria-live="polite">
        {statusHint}
      </p>
    </div>
  );
}
