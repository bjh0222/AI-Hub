import { cn } from '@/lib/utils/cn';

interface BrandMarkProps {
  mark: string;
  tintHex: string;
  brandVar: string;
  size?: 'sm' | 'md';
}

/**
 * 平台徽标：识别色 16% 混色底 + 识别色字符。
 * 不使用任何位图素材（设计系统 §1.6 的合法用法 ②）。
 */
export function BrandMark({ mark, tintHex, brandVar, size = 'md' }: BrandMarkProps) {
  return (
    <span
      aria-hidden="true"
      style={{ backgroundColor: tintHex, color: `var(${brandVar})` }}
      className={cn(
        'flex shrink-0 items-center justify-center rounded-md font-bold',
        size === 'sm' ? 'h-7 w-7 text-xs' : 'h-10 w-10 text-base',
      )}
    >
      {mark}
    </span>
  );
}
