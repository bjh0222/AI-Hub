#!/usr/bin/env node
/**
 * 生成 SESSION_SECRET（会话签名密钥）。
 * 用法：npm run gen-secret
 *
 * 输出是 32 字节随机数的 base64（44 个字符），直接写进 .env.local 即可。
 * 泄露 = 任何人都能伪造登录态，所以：不要进 git、不要贴聊天记录。
 */

import { randomBytes } from 'node:crypto';

const secret = randomBytes(32).toString('base64');

console.log('');
console.log('把下面这一行写进项目根目录的 .env.local：');
console.log('');
console.log(`SESSION_SECRET=${secret}`);
console.log('');
console.log('换掉这个值会让所有已登录设备立即失效（需要重新输入密码）。');
