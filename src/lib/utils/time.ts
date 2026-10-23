/**
 * 纯函数：时间展示。
 * 只在客户端调用（服务端渲染的时间与浏览器时区可能不同，会导致水合不一致）。
 */

const MINUTE_MS = 60000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

export function isSameLocalDay(a: number, b: number): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate()
  );
}

export function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`;
}

export function formatClock(ts: number): string {
  const d = new Date(ts);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function formatRelativeTime(ts: number, now: number): string {
  const diff = now - ts;
  if (!Number.isFinite(diff) || diff < MINUTE_MS) return '刚刚';
  if (diff < HOUR_MS) return `${Math.floor(diff / MINUTE_MS)} 分钟前`;
  if (isSameLocalDay(ts, now)) return `${Math.floor(diff / HOUR_MS)} 小时前`;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameLocalDay(ts, yesterday.getTime())) return '昨天';

  const days = Math.floor(diff / DAY_MS);
  if (days >= 1 && days < 7) return `${days} 天前`;
  return formatDate(ts);
}

export function formatStamp(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}`;
}
