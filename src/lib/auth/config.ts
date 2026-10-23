/**
 * 服务端专用：环境变量读取 + 鉴权入口。
 *
 * ⚠️ 本文件与 password.ts / session.ts 只允许被服务端代码 import
 *    （app/(hub)/layout.tsx、app/login/page.tsx、app/api/auth/*）。
 *    绝对不要从一个带 'use client' 的组件里 import 它 —— 那会把
 *    签名逻辑和密钥读取路径拖进浏览器 bundle。
 */

import { verifyPassword, verifyPlainPassword } from './password';
import { deriveSessionKey, passwordFingerprint, verifySessionToken } from './session';
import type { SessionCheck } from './session';
import { parseCookieSecureMode } from './cookie-policy';
import type { CookieSecureMode } from './cookie-policy';

export const MIN_SECRET_LENGTH = 32;
export const DEFAULT_TTL_SECONDS = 1209600; // 14 天
export const DEFAULT_COOKIE_NAME = 'aihub_session';

export interface AuthConfig {
  cookieName: string;
  /** Cookie 的 Secure 策略：always / never / auto（默认 auto，按请求协议决定） */
  cookieSecureMode: CookieSecureMode;
  sessionTtlSeconds: number;
  secret: string;
  passwordHash: string | null;
  passwordPlain: string | null;
}

export type AuthConfigResult =
  | { ok: true; config: AuthConfig }
  | { ok: false; missing: string[] };

export function readAuthConfig(
  env: Record<string, string | undefined> = process.env,
): AuthConfigResult {
  const secret = (env.SESSION_SECRET ?? '').trim();
  const passwordHash = (env.AUTH_PASSWORD_HASH ?? '').trim();
  const passwordPlain = (env.AUTH_PASSWORD ?? '').trim();

  const missing: string[] = [];
  if (secret.length < MIN_SECRET_LENGTH) {
    missing.push('SESSION_SECRET（至少 32 个字符，生成：npm run gen-secret）');
  }
  if (passwordHash.length === 0 && passwordPlain.length === 0) {
    missing.push('AUTH_PASSWORD_HASH（生成：npm run hash-password），或临时用 AUTH_PASSWORD');
  }
  if (missing.length > 0) return { ok: false, missing };

  const ttlRaw = Number((env.SESSION_TTL_SECONDS ?? '').trim());
  const sessionTtlSeconds =
    Number.isFinite(ttlRaw) && ttlRaw >= 300 ? Math.floor(ttlRaw) : DEFAULT_TTL_SECONDS;

  const cookieRaw = (env.COOKIE_NAME ?? '').trim();
  const cookieName = cookieRaw.length > 0 ? cookieRaw : DEFAULT_COOKIE_NAME;

  // Secure 策略默认 auto：http 访问时不加（否则浏览器静默丢弃 Cookie，
  // 症状是「填了密码没反应」），https 或反代透传 X-Forwarded-Proto: https 时自动加。
  // 想硬性要求就写 COOKIE_SECURE=1，纯 HTTP 内网强制关闭写 0。
  const cookieSecureMode = parseCookieSecureMode(env.COOKIE_SECURE);

  return {
    ok: true,
    config: {
      cookieName,
      cookieSecureMode,
      sessionTtlSeconds,
      secret,
      passwordHash: passwordHash.length > 0 ? passwordHash : null,
      passwordPlain: passwordPlain.length > 0 ? passwordPlain : null,
    },
  };
}

export function passwordMaterial(config: AuthConfig): string {
  return config.passwordHash ?? config.passwordPlain ?? '';
}

export function sessionKeyFor(config: AuthConfig) {
  return deriveSessionKey(config.secret, passwordFingerprint(passwordMaterial(config)));
}

export function verifySession(
  token: string | undefined,
  config: AuthConfig,
  now?: number,
): SessionCheck {
  return verifySessionToken(token, sessionKeyFor(config), now);
}

export function isAuthenticated(
  token: string | undefined,
  config: AuthConfig,
  now?: number,
): boolean {
  return verifySession(token, config, now).ok;
}

export async function authenticatePassword(
  password: string,
  config: AuthConfig,
): Promise<boolean> {
  if (config.passwordHash !== null) {
    return verifyPassword(password, config.passwordHash);
  }
  if (config.passwordPlain !== null) {
    return verifyPlainPassword(password, config.passwordPlain);
  }
  return false;
}
