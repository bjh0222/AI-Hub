/**
 * Cookie 的 `Secure` 属性策略（纯函数，可单测）。
 *
 * 为什么需要三档而不是一个布尔值 —— 这是本项目踩过的坑：
 *   `Secure` Cookie 在 `http://` 下会被浏览器**静默丢弃**，症状是「密码填了没反应」。
 *   而局域网自用常见的两种访问方式冲突：
 *     · `http://localhost:3000`（本机开发）
 *     · `https://机器名.xxx.ts.net`（Tailscale Serve）或 Caddy 内网 HTTPS
 *   同一个进程同时服务这两种请求，写死 true/false 都会坏掉一半场景。
 *
 * `auto` 的判定依据（任一成立即加 Secure）：
 *   1. 请求 URL 本身是 https（`next dev --experimental-https` 这类直连）
 *   2. 反向代理透传了 `X-Forwarded-Proto: https`（Tailscale Serve / Caddy 都会带）
 *
 * 安全性说明：`auto` 只在「请求本来就是明文 http」时不下发 Secure ——
 * 那条路径无论如何都是明文，不存在被 `auto` 额外降级的问题。
 * 想要硬性要求，用 `COOKIE_SECURE=1`（永远加）或 `=0`（永远不加）。
 */

export type CookieSecureMode = 'always' | 'never' | 'auto';

export function parseCookieSecureMode(raw: unknown): CookieSecureMode {
  if (typeof raw !== 'string') return 'auto';
  const value = raw.trim().toLowerCase();
  if (value.length === 0) return 'auto';
  if (value === '0' || value === 'false' || value === 'never' || value === 'off') return 'never';
  if (value === 'auto') return 'auto';
  // 其余（'1' / 'true' / 'always' / 写错的值）一律按最严格处理
  return 'always';
}

export interface SecureCookieContext {
  /** 反向代理透传的 X-Forwarded-Proto，可能是逗号分隔的列表 */
  forwardedProto?: string | null;
  /** 请求自身 URL 的协议，形如 'https:' 或 'http:' */
  urlProtocol?: string | null;
}

export function shouldUseSecureCookie(
  mode: CookieSecureMode,
  context: SecureCookieContext = {},
): boolean {
  if (mode === 'always') return true;
  if (mode === 'never') return false;

  const forwarded = (context.forwardedProto ?? '').split(',')[0].trim().toLowerCase();
  if (forwarded === 'https') return true;

  const protocol = (context.urlProtocol ?? '').trim().toLowerCase();
  return protocol === 'https:' || protocol === 'https';
}

export function describeCookieSecureMode(mode: CookieSecureMode): string {
  if (mode === 'always') return 'COOKIE_SECURE=1：始终下发 Secure，必须用 https 访问';
  if (mode === 'never') return 'COOKIE_SECURE=0：从不下发 Secure（只适合纯 http 访问，令牌明文过网）';
  return 'COOKIE_SECURE=auto：按请求协议自动决定（http 可用，https 自动加 Secure）';
}
