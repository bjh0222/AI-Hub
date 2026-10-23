#!/usr/bin/env node
/**
 * 生成密码哈希：把密码从标准输入读进来，输出可直接粘进 .env.local 的哈希串。
 *
 * 为什么从 stdin 读：明文密码不落进命令行历史（argv 会被记进 PSReadLine 与进程列表）。
 *
 * PowerShell 用法（密码不回显）：
 *   $s = Read-Host -AsSecureString "设置访问密码"
 *   [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)) | npm run hash-password
 *
 * 直接运行（密码会回显，自己看着办）：
 *   npm run hash-password
 */

import { createInterface } from 'node:readline';
import { hashPassword, verifyPassword } from '../src/lib/auth/password.ts';

function readPasswordFromStdin() {
  return new Promise((resolve, reject) => {
    const lines = [];
    const rl = createInterface({ input: process.stdin, terminal: false });
    rl.on('line', (line) => lines.push(line));
    rl.on('close', () => resolve(lines.join('\n').trim()));
    rl.on('error', reject);
  });
}

const password = await readPasswordFromStdin();

if (password.length === 0) {
  console.error('没有读到密码。请用管道把密码送进来，或直接运行后在提示符下输入。');
  console.error('用法示例见 README.md 的「首次配置」一节。');
  process.exit(1);
}

if (password.length < 8) {
  console.error('密码太短了：这个页面虽然只在内网用，也建议至少 12 位。');
  process.exit(1);
}

const hash = await hashPassword(password);

// 立刻自检一次，避免把打错的哈希贴进 .env.local 之后才发现登不进去
const verified = await verifyPassword(password, hash);
if (!verified) {
  console.error('哈希自检失败，请重试。');
  process.exit(1);
}

console.log('');
console.log('把下面这一行写进项目根目录的 .env.local：');
console.log('');
console.log(`AUTH_PASSWORD_HASH=${hash}`);
console.log('');
console.log('（改完密码必须重启服务；改密码会让所有已登录设备自动失效，这是有意的。）');
