#!/usr/bin/env node
/**
 * 设计令牌对比度自检：直接读 src/app/globals.css 与 src/data/platforms.ts，
 * 因此**不会**和真实代码脱节（新增一个平台后，这里会自动多出 3 项检查）。
 *
 * 用法：npm run check-contrast
 *
 * 判据：WCAG 2.1
 *   · 正文/图标文字 ≥ 4.5:1（AA）
 *   · 非文本（控件边框、焦点环）≥ 3:1（1.4.11）
 *   · 禁用态文字豁免
 */

import { readFileSync } from 'node:fs';
import { PLATFORMS } from '../src/data/platforms.ts';

const CSS_PATH = new URL('../src/app/globals.css', import.meta.url);
const css = readFileSync(CSS_PATH, 'utf8');

const AA = 4.5;
const NON_TEXT = 3;

/* ------------------------------------------------------------------ 取色 */

const TOKEN_RE = /(--[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g;
const tokens = new Map();
for (const match of css.matchAll(TOKEN_RE)) tokens.set(match[1], match[2].toUpperCase());

const missing = [];
function hex(nameOrHex) {
  if (/^#[0-9a-fA-F]{6}$/.test(nameOrHex)) return nameOrHex.toUpperCase();
  const value = tokens.get(nameOrHex);
  if (value === undefined) {
    missing.push(nameOrHex);
    return null;
  }
  return value;
}

/* ------------------------------------------------------------ 对比度计算 */

function relativeLuminance(hexColor) {
  const body = hexColor.slice(1);
  const channels = [0, 2, 4]
    .map((offset) => parseInt(body.slice(offset, offset + 2), 16) / 255)
    .map((value) => (value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4)));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a, b) {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

/* -------------------------------------------------------------- 用例集 */

/** [说明, 前景, 背景, 阈值]；前景/背景可以是 #hex 或 CSS 变量名 */
const cases = [
  ['文本一级 / 页面底', '--text-1', '--bg-page', AA],
  ['文本一级 / 卡片', '--text-1', '--surface-1', AA],
  ['文本一级 / 浮层', '--text-1', '--surface-2', AA],
  ['文本二级 / 卡片', '--text-2', '--surface-1', AA],
  ['文本二级 / 页面底', '--text-2', '--bg-page', AA],
  ['文本三级 / 卡片', '--text-3', '--surface-1', AA],
  ['文本三级 / 页面底', '--text-3', '--bg-page', AA],
  ['文本三级 / 浮层', '--text-3', '--surface-2', AA],
  ['强调色 / 卡片', '--accent-500', '--surface-1', AA],
  ['强调色 / 页面底', '--accent-500', '--bg-page', AA],
  ['强调色悬停 / 卡片', '--accent-400', '--surface-1', AA],
  ['白字 / 主按钮底', '#FFFFFF', '--accent-600', AA],
  ['危险色 / 卡片', '--danger', '--surface-1', AA],
  ['成功色 / 卡片', '--success', '--surface-1', AA],
  ['警告色 / 卡片', '--warning', '--surface-1', AA],
  ['警告色 / 星标底', '--warning', '--star-tint', AA],
  ['强调色 / 选中底', '--accent-500', '--accent-tint', AA],
  ['文本一级 / 选中底', '--text-1', '--accent-tint', AA],
  ['选中边框 / 卡片（非文本）', '--border-accent', '--surface-1', NON_TEXT],
  ['焦点环 / 页面底（非文本）', '--focus-ring', '--bg-page', NON_TEXT],
  ['控件轮廓 / 页面底（非文本）', '--border-strong', '--bg-page', NON_TEXT],
  ['控件轮廓 / 卡片（非文本）', '--border-strong', '--surface-1', NON_TEXT],
  ['悬停轮廓 / 卡片（非文本）', '--border-hover', '--surface-1', NON_TEXT],
  ['悬停轮廓 / 页面底（非文本）', '--border-hover', '--bg-page', NON_TEXT],
];

/* 平台色：新增平台会自动纳入检查 */
for (const platform of PLATFORMS) {
  cases.push([`${platform.name} 识别色 / 卡片`, platform.brandVar, '--surface-1', AA]);
  cases.push([`${platform.name} 识别色 / 自己的 tint 底`, platform.brandVar, platform.tintHex, AA]);
  cases.push([`白字 / ${platform.name} 填充色`, '#FFFFFF', platform.fillVar, AA]);
}

/* ------------------------------------------------------------------ 执行 */

let failed = 0;
const rows = [];

for (const [label, foregroundRef, backgroundRef, threshold] of cases) {
  const foreground = hex(foregroundRef);
  const background = hex(backgroundRef);
  if (foreground === null || background === null) continue;

  const value = contrast(foreground, background);
  const ok = value >= threshold;
  if (!ok) failed += 1;
  rows.push({ ok, label, value, threshold });
}

const width = Math.max(...rows.map((row) => row.label.length), 10);
for (const row of rows) {
  const status = row.ok ? 'PASS' : 'FAIL';
  console.log(
    `${status}  ${row.value.toFixed(2).padStart(6)}:1  (>=${String(row.threshold).padEnd(4)})  ${row.label.padEnd(width)}  ${''}`,
  );
}

if (missing.length > 0) {
  console.log('\n以下变量在 globals.css 里找不到（检查拼写，或忘了加）：');
  for (const name of [...new Set(missing)]) console.log(`  ✗ ${name}`);
  process.exitCode = 1;
}

console.log(`\n共 ${rows.length} 项；${failed === 0 ? '✅ 全部达标' : `❌ ${failed} 项未达标`}`);
if (failed > 0) process.exitCode = 1;
