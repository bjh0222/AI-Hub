/**
 * 无状态会话令牌：HMAC-SHA256 签名的自包含 token。
 * 仅依赖 node:crypto，是纯函数模块，可被 tests/run.mjs 直接导入单测。
 *
 * 令牌结构：`v1.<expEpochSeconds>.<iatEpochSeconds>.<hmacHex40? 否, 64 位 hex>`
 *
 * 关键设计：签名密钥不是直接用 SESSION_SECRET，而是
 *   key = HMAC(SESSION_SECRET, 'aihub.session.v1|' + sha256(密码材料).slice(0,32))
 * 于是「改密码」天然等于「所有已登录设备立即失效」，不需要任何会话表。
 */

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const TOKEN_PREFIX = 'v1';
export const SIG_HEX_LENGTH = 64;
const HMAC_CONTEXT = 'aihub.session.v1';
const HEX_RE = /^[0-9a-f]{64}$/;
const NUM_RE = /^\d{1,12}$/;
const MAX_TOKEN_LENGTH = 512;
const CLOCK_SKEW_SECONDS = 300;

/** 密码材料的指纹（只取前 32 个 hex 字符，足够区分且不泄露长度信息） */
export function passwordFingerprint(material: string): string {
  return createHash('sha256').update(material, 'utf8').digest('hex').slice(0, 32);
}

export function deriveSessionKey(secret: string, fingerprint: string): Buffer {
  if (typeof secret !== 'string' || secret.length === 0) {
    throw new Error('SESSION_SECRET 不能为空');
  }
  return createHmac('sha256', secret).update(`${HMAC_CONTEXT}|${fingerprint}`).digest();
}

function sign(key: Buffer, payload: string): string {
  return createHmac('sha256', key).update(payload, 'utf8').digest('hex');
}

export function signSessionToken(key: Buffer, ttlSeconds: number, now: number = Date.now()): string {
  const iat = Math.floor(now / 1000);
  const safeTtl = Number.isFinite(ttlSeconds) ? Math.max(60, Math.floor(ttlSeconds)) : 1209600;
  const exp = iat + safeTtl;
  const payload = `${TOKEN_PREFIX}.${exp}.${iat}`;
  return `${payload}.${sign(key, payload)}`;
}

export type SessionCheck =
  | { ok: true; exp: number; iat: number; expiresInSeconds: number }
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' };

export function verifySessionToken(
  token: string | undefined | null,
  key: Buffer,
  now: number = Date.now(),
): SessionCheck {
  if (typeof token !== 'string') return { ok: false, reason: 'malformed' };
  if (token.length === 0 || token.length > MAX_TOKEN_LENGTH) return { ok: false, reason: 'malformed' };

  const parts = token.split('.');
  if (parts.length !== 4) return { ok: false, reason: 'malformed' };

  const [prefix, expRaw, iatRaw, signature] = parts;
  if (prefix !== TOKEN_PREFIX) return { ok: false, reason: 'malformed' };
  if (!NUM_RE.test(expRaw) || !NUM_RE.test(iatRaw)) return { ok: false, reason: 'malformed' };
  // 先做 hex 白名单，再 Buffer.from —— 否则非法字符会被静默忽略，
  // 导致 timingSafeEqual 在长度不一致时抛错（这也是常见实现 bug）。
  if (!HEX_RE.test(signature)) return { ok: false, reason: 'malformed' };

  const payload = `${prefix}.${expRaw}.${iatRaw}`;
  const expected = sign(key, payload);
  const providedBuf = Buffer.from(signature, 'hex');
  const expectedBuf = Buffer.from(expected, 'hex');
  if (providedBuf.length !== expectedBuf.length) return { ok: false, reason: 'bad_signature' };
  if (!timingSafeEqual(providedBuf, expectedBuf)) return { ok: false, reason: 'bad_signature' };

  const exp = Number(expRaw);
  const iat = Number(iatRaw);
  const nowSeconds = Math.floor(now / 1000);
  if (!Number.isFinite(exp) || !Number.isFinite(iat)) return { ok: false, reason: 'malformed' };
  if (exp <= nowSeconds) return { ok: false, reason: 'expired' };
  if (iat > nowSeconds + CLOCK_SKEW_SECONDS) return { ok: false, reason: 'malformed' };

  return { ok: true, exp, iat, expiresInSeconds: exp - nowSeconds };
}
