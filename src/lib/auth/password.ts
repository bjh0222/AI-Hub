/**
 * 密码哈希与校验：scrypt（Node 内置，无第三方依赖）。
 *
 * 存储格式：`scrypt:N:r:p:saltBase64url:hashBase64url`
 *
 * ⚠️ 为什么分隔符是 `:` 而不是常见的 `$`（这是实测踩出来的坑）：
 *    Next.js 用 dotenv-expand 解析 .env / .env.local，**值里的 `$` 会被当成变量引用展开**。
 *    实测：写进 .env.local 的 `scrypt$16384$8$1$...` 被进程读到时变成了 `scrypt6384...`，
 *    结果是「密码永远错」。改用 `:` 分隔 + base64url（只含 A-Za-z0-9-_）之后，
 *    任何 .env 解析器、PowerShell 管道、shell 插值都不会再碰坏它。
 *    为了兼容已经生成的旧哈希，parseHash 仍会把 `$` 归一化成 `:`。
 *
 * 为什么不用 bcrypt/argon2：那需要编译原生模块，在 Windows 上装依赖的失败率
 * 远高于它带来的边际安全收益；scrypt 是 Node 标准库里的内存硬函数，够用。
 */

import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const ALGORITHM = 'scrypt';
const FIELD_SEPARATOR = ':';
const LEGACY_SEPARATOR = '$';
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const MAX_MEM = 64 * 1024 * 1024;

interface ScryptParams {
  N: number;
  r: number;
  p: number;
  maxmem: number;
}

function derive(password: string, salt: Buffer, keylen: number, params: ScryptParams): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, params, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

export interface ParsedHash {
  N: number;
  r: number;
  p: number;
  salt: Buffer;
  hash: Buffer;
}

export function parseHash(stored: string): ParsedHash | null {
  if (typeof stored !== 'string') return null;

  // 旧格式（$ 分隔）依然认，但新生成的哈希不会再出现 $（见文件头说明）
  const normalized = stored.trim().split(LEGACY_SEPARATOR).join(FIELD_SEPARATOR);
  const parts = normalized.split(FIELD_SEPARATOR);
  if (parts.length !== 6) return null;

  const [algorithm, nRaw, rRaw, pRaw, saltEncoded, hashEncoded] = parts;
  if (algorithm !== ALGORITHM) return null;

  const N = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return null;
  // 上界必须有：否则被篡改的哈希值可以让 scrypt 吃掉整台机器的内存
  if (N < 1024 || N > 1048576) return null;
  if (r < 1 || r > 32) return null;
  if (p < 1 || p > 8) return null;

  // base64url 解码器同时也接受标准 base64（+ 与 /），因此旧哈希照样能读
  const salt = Buffer.from(saltEncoded, 'base64url');
  const hash = Buffer.from(hashEncoded, 'base64url');
  if (salt.length < 8 || salt.length > 64) return null;
  if (hash.length < 16 || hash.length > 64) return null;

  return { N, r, p, salt, hash };
}

export async function hashPassword(password: string): Promise<string> {
  if (typeof password !== 'string' || password.length === 0) {
    throw new Error('密码不能为空');
  }
  const salt = randomBytes(SALT_LENGTH);
  const derived = await derive(password, salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: MAX_MEM,
  });
  return [
    ALGORITHM,
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString('base64url'),
    derived.toString('base64url'),
  ].join(FIELD_SEPARATOR);
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parsed = parseHash(stored);
  if (parsed === null) return false;
  try {
    const derived = await derive(password, parsed.salt, parsed.hash.length, {
      N: parsed.N,
      r: parsed.r,
      p: parsed.p,
      maxmem: MAX_MEM,
    });
    if (derived.length !== parsed.hash.length) return false;
    return timingSafeEqual(derived, parsed.hash);
  } catch {
    return false;
  }
}

/** 明文密码比较（仅 .env.local 里用 AUTH_PASSWORD 的本地开发场景） */
export function verifyPlainPassword(password: string, expected: string): boolean {
  if (typeof expected !== 'string' || expected.length === 0) return false;
  const a = createHash('sha256').update(password, 'utf8').digest();
  const b = createHash('sha256').update(expected, 'utf8').digest();
  return timingSafeEqual(a, b);
}
