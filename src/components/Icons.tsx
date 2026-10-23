/**
 * 内联 SVG 图标（不引入图标库、不使用位图素材）。
 * 全部 aria-hidden，语义由外层按钮的 aria-label 提供。
 */

interface IconProps {
  className?: string;
}

const BASE = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: 'false' as const,
};

export function SearchIcon({ className }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export function CloseIcon({ className }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

export function CheckIcon({ className }: IconProps) {
  return (
    <svg {...BASE} className={className} strokeWidth={2.4}>
      <path d="m5 12.5 4.5 4.5L19 7" />
    </svg>
  );
}

export function StarIcon({ className, filled = false }: IconProps & { filled?: boolean }) {
  return (
    <svg {...BASE} className={className} fill={filled ? 'currentColor' : 'none'}>
      <path d="M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8L3.6 9.7l5.8-.8z" />
    </svg>
  );
}

export function GearIcon({ className }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.9.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 4.7 15a1.7 1.7 0 0 0-1.6-1.1H3a2 2 0 1 1 0-4h.2A1.7 1.7 0 0 0 4.7 8.8a1.7 1.7 0 0 0-.4-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.4H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.6 1.1h.2a2 2 0 1 1 0 4H21a1.7 1.7 0 0 0-1.6 1z" />
    </svg>
  );
}

export function KeyboardIcon({ className }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <rect x="2.5" y="6" width="19" height="12" rx="2.5" />
      <path d="M7 10h.01M11 10h.01M15 10h.01M8 14h8" />
    </svg>
  );
}

export function SignOutIcon({ className }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <path d="M15 12H4m0 0 3.5-3.5M4 12l3.5 3.5" />
      <path d="M11 5.5V4.8A1.8 1.8 0 0 1 12.8 3h4.4A1.8 1.8 0 0 1 19 4.8v14.4a1.8 1.8 0 0 1-1.8 1.8h-4.4A1.8 1.8 0 0 1 11 19.2v-.7" />
    </svg>
  );
}

export function CopyIcon({ className }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M15 6.5V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h1.5" />
    </svg>
  );
}

export function DownloadIcon({ className }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <path d="M12 4v10m0 0 4-4m-4 4-4-4" />
      <path d="M5 18h14" />
    </svg>
  );
}

export function UploadIcon({ className }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <path d="M12 15V5m0 0 4 4m-4-4-4 4" />
      <path d="M5 18h14" />
    </svg>
  );
}

export function TrashIcon({ className }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <path d="M4 7h16M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7m-8 0 .8 12.1A1.9 1.9 0 0 0 9.7 21h4.6a1.9 1.9 0 0 0 1.9-1.9L17 7" />
    </svg>
  );
}

export function ArrowUpRightIcon({ className }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <path d="M7 17 17 7m0 0h-7m7 0v7" />
    </svg>
  );
}

export function InfoIcon({ className }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5M12 8h.01" />
    </svg>
  );
}

export function AlertIcon({ className }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <path d="M12 4.5 3 19h18z" />
      <path d="M12 10v4M12 16.5h.01" />
    </svg>
  );
}

export function PinIcon({ className }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <path d="M14.5 3.5 20.5 9.5l-2.1 2.1c-.6.6-1.5.8-2.3.5l-2.4-.8-3.6 3.6c.3 1.2 0 2.5-1 3.4L4 13.9c.9-.9 2.2-1.3 3.4-1l3.6-3.6-.8-2.4c-.3-.8-.1-1.7.5-2.3z" />
      <path d="m9.5 14.5-5 5" />
    </svg>
  );
}
