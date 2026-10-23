import type { Config } from 'tailwindcss';

/**
 * 设计令牌与 Tailwind 的映射关系。
 * 所有色值定义在 src/app/globals.css 的 :root 中（唯一真源），这里只做「名字 → var()」绑定。
 *
 * ⚠️ 已知限制：Tailwind v3 无法对 var() 颜色做透明度运算，
 *    因此**不要**写 `bg-brand-openai/16` 这类类名；平台 tint 底请用 platforms.ts 里
 *    预先算好的 tintHex（如 `#183335`）内联，或 `color-mix(...)`。
 */
const v = (name: string) => `var(--${name})`;

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'bg-page': v('bg-page'),
        'surface-1': v('surface-1'),
        'surface-1-hover': v('surface-1-hover'),
        'surface-2': v('surface-2'),
        'surface-inset': v('surface-inset'),
        'border-subtle': v('border-subtle'),
        'border-strong': v('border-strong'),
        'border-hover': v('border-hover'),
        'border-accent': v('border-accent'),
        'fg-1': v('text-1'),
        'fg-2': v('text-2'),
        'fg-3': v('text-3'),
        'fg-disabled': v('text-disabled'),
        'on-accent': v('text-on-accent'),
        accent: {
          400: v('accent-400'),
          500: v('accent-500'),
          600: v('accent-600'),
          tint: v('accent-tint'),
        },
        'focus-ring': v('focus-ring'),
        success: v('success'),
        warning: v('warning'),
        danger: v('danger'),
        'star-tint': v('star-tint'),
        brand: {
          openai: v('brand-openai'),
          deepseek: v('brand-deepseek'),
          gemini: v('brand-gemini'),
          qwen: v('brand-qwen'),
          kimi: v('brand-kimi'),
          zhipu: v('brand-zhipu'),
          doubao: v('brand-doubao'),
          grok: v('brand-grok')
        },
        fill: {
          openai: v('fill-openai'),
          deepseek: v('fill-deepseek'),
          gemini: v('fill-gemini'),
          qwen: v('fill-qwen'),
          kimi: v('fill-kimi'),
          zhipu: v('fill-zhipu'),
          doubao: v('fill-doubao'),
          grok: v('fill-grok'),
        },
      },
      borderRadius: {
        sm: '6px',
        md: '10px',
        lg: '14px',
        xl: '20px',
        '2xl': '24px',
      },
      boxShadow: {
        1: v('shadow-1'),
        2: v('shadow-2'),
        3: v('shadow-3'),
        g1: v('glow-1'),
        g2: v('glow-2'),
        g3: v('glow-3'),
      },
      transitionTimingFunction: {
        standard: 'cubic-bezier(0.2, 0, 0, 1)',
        emphasized: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
        exit: 'cubic-bezier(0.4, 0, 1, 1)',
        spring: 'cubic-bezier(0.34, 1.40, 0.64, 1)',
      },
      transitionDuration: {
        instant: '100ms',
        fast: '150ms',
        base: '200ms',
        slow: '300ms',
        slower: '420ms',
      },
      screens: {
        sm: '640px',
        md: '768px',
        lg: '1024px',
        xl: '1280px',
        '2xl': '1536px',
      },
      maxWidth: {
        container: '1400px',
      },
      spacing: {
        'safe-b': 'env(safe-area-inset-bottom)',
        'toolbar-h': '60px',
      },
    },
  },
  plugins: [],
} satisfies Config;
