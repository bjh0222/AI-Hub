#!/usr/bin/env node
/**
 * 配置体检：**完全按 Next.js 的方式**加载 .env.local，再校验访问保护配置能不能真的用。
 *
 * 用法：
 *   npm run check-env                 # 只校验格式、密钥强度、是否被 dotenv 破坏
 *   '你的密码' | npm run check-env     # 顺带验证「这个密码能不能登录」
 *
 * 为什么需要它：Next.js 用 dotenv-expand 解析 .env*，值里的 `$` 会被当成变量展开。
 * 我们实测过：写进去的 `scrypt$16384$8$1$...` 被读成 `scrypt6384...`，
 * 症状是「密码怎么输都不对」。本脚本用同一套解析器读一遍，把这类问题在启动前拦下来。
 */

import { createInterface } from 'node:readline';
import nextEnv from '@next/env';
import { parseHash, verifyPassword } from '../src/lib/auth/password.ts';
import { MIN_SECRET_LENGTH } from '../src/lib/auth/config.ts';
import { describeCookieSecureMode, parseCookieSecureMode } from '../src/lib/auth/cookie-policy.ts';

// @next/env 是 CommonJS 包，必须从默认导出上取成员
const { loadEnvConfig } = nextEnv;
const problems = [];
const notes = [];

// 必须传一个安静的 logger，否则会把加载过程刷屏
loadEnvConfig(process.cwd(), process.env.NODE_ENV !== 'production', {
  info() {},
  error() {},
  warn() {},
});

const secret = (process.env.SESSION_SECRET ?? '').trim();
const hash = (process.env.AUTH_PASSWORD_HASH ?? '').trim();
const plain = (process.env.AUTH_PASSWORD ?? '').trim();

/* ---------- SESSION_SECRET ---------- */
if (secret.length === 0) {
  problems.push('SESSION_SECRET 未设置（生成：npm run gen-secret）');
} else if (secret.length < MIN_SECRET_LENGTH) {
  problems.push(`SESSION_SECRET 太短（${secret.length} 字符，至少 ${MIN_SECRET_LENGTH}）`);
} else {
  notes.push(`SESSION_SECRET 长度 ${secret.length}，合格`);
}

/* ---------- 密码 ---------- */
if (hash.length === 0 && plain.length === 0) {
  problems.push('没配密码：AUTH_PASSWORD_HASH 与 AUTH_PASSWORD 都是空的');
}
if (hash.length > 0) {
  if (plain.length > 0) notes.push('AUTH_PASSWORD_HASH 与 AUTH_PASSWORD 同时存在，将使用哈希');
  if (hash.includes('$')) {
    problems.push('哈希里含 “$” —— dotenv 会把它当变量展开。请重新运行 npm run hash-password 生成冒号分隔的新哈希');
  }
  const parsed = parseHash(hash);
  if (parsed === null) {
    problems.push('AUTH_PASSWORD_HASH 格式无法解析（期望 scrypt:N:r:p:salt:hash）');
  } else {
    notes.push(
      `AUTH_PASSWORD_HASH 格式正常（实际生效长度 ${hash.length}，N=${parsed.N}, r=${parsed.r}, p=${parsed.p}）`,
    );
  }
}
if (plain.length > 0 && plain.includes('$')) {
  problems.push('AUTH_PASSWORD 里含 “$”，会被 dotenv 展开 —— 请改用哈希方式');
}

/* ---------- Cookie ---------- */
const cookieSecureMode = parseCookieSecureMode(process.env.COOKIE_SECURE);
notes.push(describeCookieSecureMode(cookieSecureMode));

/* ---------- 可选：真的验一次密码 ---------- */
function readStdinIfPiped() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      resolve('');
      return;
    }
    const lines = [];
    const rl = createInterface({ input: process.stdin, terminal: false });
    rl.on('line', (line) => lines.push(line));
    rl.on('close', () => resolve(lines.join('\n').trim()));
    rl.on('error', () => resolve(''));
  });
}

const providedPassword = await readStdinIfPiped();

if (providedPassword.length > 0) {
  if (hash.length > 0) {
    const ok = parseHash(hash) !== null && (await verifyPassword(providedPassword, hash));
    if (ok) notes.push(`用管道送进来的密码：✅ 验证通过（实际生效的哈希长度 ${hash.length}）`);
    else problems.push('用管道送进来的密码：❌ 验证失败。要么密码不是这个，要么哈希被 .env 解析改坏了');
  } else if (plain.length > 0) {
    notes.push(
      providedPassword === plain
        ? '用管道送进来的密码：✅ 与 AUTH_PASSWORD 一致'
        : '用管道送进来的密码：❌ 与 AUTH_PASSWORD 不一致',
    );
  }
}

/* ---------- 报告 ---------- */
console.log('AI Hub 配置体检（按 Next.js 的方式解析 .env*）\n');
for (const note of notes) console.log(`  · ${note}`);
if (problems.length > 0) {
  console.log('\n发现以下问题：');
  for (const problem of problems) console.log(`  ✗ ${problem}`);
  process.exitCode = 1;
} else {
  console.log('\n配置可用。');
}
