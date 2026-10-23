/**
 * 浏览器窗口相关的工具（只在客户端调用）。
 *
 * ⚠️ 弹窗规则（docs/技术架构决策与风险评审.md §5.1）：
 *    window.open 必须在用户手势的**同步调用栈**里执行。
 *    任何 await / setTimeout / Promise.then 之后再调用，都会被浏览器拦截。
 *    因此本项目只同步打开 1 个，其余走真实 <a> 链接（100% 可达）。
 */

export function openPlatformWindow(url: string): boolean {
  if (typeof window === 'undefined') return false;

  let opened: Window | null = null;
  try {
    opened = window.open(url, '_blank');
  } catch {
    return false;
  }

  if (opened === null || opened === undefined) return false;

  // 断掉 window.opener：与 noopener 等价的安全效果，
  // 但保留「返回 null 即被拦截」的可检测性（noopener 会让返回值恒为 null）。
  try {
    opened.opener = null;
  } catch {
    // 忽略：个别浏览器不允许写入
  }

  try {
    opened.focus();
  } catch {
    // 忽略
  }

  return true;
}

/** 复制文本：优先 Clipboard API（需要 HTTPS / localhost），否则退回到 execCommand */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (
      typeof navigator !== 'undefined' &&
      navigator.clipboard !== undefined &&
      typeof window !== 'undefined' &&
      window.isSecureContext
    ) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 落到下面的兜底方案
  }

  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', 'readonly');
    area.style.position = 'fixed';
    area.style.top = '-2000px';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.focus();
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

export type PromptCopyRequest =
  | { mode: 'api'; promise: Promise<boolean> }
  | { mode: 'manual' };

/**
 * 在「打开平台」的用户手势里发起提示词复制（CTO 决策 §3）：
 *
 *   1. 同步 window.open（晚一行就会被弹窗拦截 —— 主收益不能被复制拖累）
 *   2. 不 await，同步发起 writeText；结果用 chip/toast 汇报
 *   3. http 非 secure context 直接转「手动兜底」——
 *      不在这里跑 execCommand：window.open 之后文档即将失焦，
 *      此时 execCommand 大概率静默失败，而且失败了用户也无法确认
 *
 * 兜底 UI（手动复制 Dialog）里的「再试一次」是一个**新的用户手势**，
 * 那才是 execCommand / writeText 重试的可靠时机 —— 用 copyText() 即可。
 */
export function requestPromptCopy(text: string): PromptCopyRequest {
  if (
    typeof navigator !== 'undefined' &&
    navigator.clipboard !== undefined &&
    typeof window !== 'undefined' &&
    window.isSecureContext
  ) {
    const promise = navigator.clipboard
      .writeText(text)
      .then(() => true)
      .catch(() => false);
    return { mode: 'api', promise };
  }
  return { mode: 'manual' };
}
