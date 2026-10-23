/**
 * 纯函数工具：URL 与站内跳转路径校验。
 * 无任何依赖，可直接被 tests/run.mjs 与浏览器/服务端两侧复用。
 */

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/** 只接受 https，且不允许携带账号密码信息 */
export function safeExternalUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 2048) return null;
  if (!/^https:\/\//i.test(trimmed)) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') return null;
    if (parsed.username.length > 0 || parsed.password.length > 0) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function isHttpsUrl(value: unknown): boolean {
  return safeExternalUrl(value) !== null;
}

export function hostOf(value: string): string | null {
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return null;
  }
}

/** 请求 URL 的协议，形如 'https:'；解析失败返回 null */
export function protocolOf(value: string): string | null {
  try {
    return new URL(value).protocol.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * 归一化 Host：取 X-Forwarded-Host 这类可能逗号分隔列表的第一项，
 * 小写，并去掉默认端口（:80 / :443）。
 */
export function normalizeHost(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const first = value.split(',')[0].trim().toLowerCase();
  if (first.length === 0) return null;
  return first.replace(/:(?:80|443)$/, '');
}

/**
 * 站内跳转白名单：只接受以单个 `/` 开头的相对路径。
 * 拒绝 `//evil.com`、`https://evil.com`、`/\evil.com`、`/javascript:` 等开放重定向向量。
 */
export function isSafeNextPath(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (value.length === 0 || value.length > 512) return false;
  if (!value.startsWith('/')) return false;
  if (value.startsWith('//')) return false;
  if (value.includes('\\')) return false;
  if (CONTROL_CHARS.test(value)) return false;
  // `/javascript:alert(1)` 这类「看起来像路径、实际是协议」的写法
  if (/^\/[a-z][a-z0-9+.-]*:/i.test(value)) return false;
  return true;
}

export function normalizeNextPath(value: unknown, fallback = '/'): string {
  return isSafeNextPath(value) ? value : fallback;
}

/**
 * 同源校验（登录接口的 CSRF 第一道闸）。
 * 浏览器表单/同源 fetch 会带 Origin；非浏览器客户端（curl）没有 Origin，
 * 此时交由 Cookie 的 SameSite=Lax 兜底。
 *
 * 第三个参数是反向代理透传的 `X-Forwarded-Host`：Tailscale Serve / Caddy 这类
 * 反代可能改写 Host，只看 Host 会导致「明明是同源却 403」。
 * 接受它是否削弱防护？不会：这是一个非 CORS 安全列表头，
 * 网页里的 JS 无法给跨站的简单表单请求加上它，而能自己造请求头的客户端
 * 本来就不是 CSRF 的攻击面（它得先拿到受害者的 Cookie）。
 */
export function isSameOrigin(
  origin: string | null,
  host: string | null,
  forwardedHost?: string | null,
): boolean {
  if (origin === null || origin.length === 0 || origin === 'null') return true;

  const originHost = (() => {
    try {
      return normalizeHost(new URL(origin).host);
    } catch {
      return null;
    }
  })();
  if (originHost === null) return false;

  const candidates = [normalizeHost(host), normalizeHost(forwardedHost)].filter(
    (value): value is string => value !== null,
  );
  if (candidates.length === 0) return false;
  return candidates.includes(originHost);
}

export function clientKeyFromForwardedFor(forwardedFor: string | null): string {
  if (forwardedFor === null || forwardedFor.length === 0) return 'local';
  const first = forwardedFor.split(',')[0];
  const trimmed = (first ?? '').trim();
  return trimmed.length > 0 ? trimmed : 'local';
}
