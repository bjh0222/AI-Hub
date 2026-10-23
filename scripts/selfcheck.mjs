#!/usr/bin/env node
/**
 * 离线静态自检（零依赖，不需要 npm install 之外的东西）。
 * 用法：npm run selfcheck
 *
 * 为什么需要它：这个项目是在「无外网、装不了依赖」的环境里写出来的，
 * 没法跑 tsc / next build。因此这里用纯文本分析补上三类最容易犯、
 * 且**编译器之外很难发现**的错误：
 *
 *   1. 导入路径不存在（相对路径或 @/ 别名写错）
 *   2. 从某个模块导入了它其实没导出的名字（拼错、改名后漏改）
 *   3. Tailwind 类名引用了不存在的设计令牌
 *      —— Tailwind v3 对未知类名**静默忽略**，渲染出来只是"没样式"，最难查
 *
 * 它不能替代 `npm run typecheck` 与 `npm run build`，但能把这三类错误在本地消灭。
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import tailwindConfig from '../tailwind.config.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIR = join(ROOT, 'src');

const problems = [];
const notes = [];

function fail(message) {
  problems.push(message);
}

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else if (/\.(ts|tsx|css)$/.test(entry.name)) files.push(full);
  }
  return files;
}

const sourceFiles = walk(SRC_DIR).filter((file) => /\.(ts|tsx)$/.test(file));
const allFiles = walk(SRC_DIR);

/* -------------------------------------------------------------------------- */
/* 1 + 2：导入路径与导出名                                                      */
/* -------------------------------------------------------------------------- */

const IMPORT_RE = /import\s+(?:type\s+)?(?:(\{[^}]*\})|([A-Za-z_$][\w$]*))?\s*(?:from\s*)?['"]([^'"]+)['"]/g;

const exportCache = new Map();

function exportInfo(file) {
  const cached = exportCache.get(file);
  if (cached !== undefined) return cached;

  const source = readFileSync(file, 'utf8');
  const names = new Set();

  const declRe = /export\s+(?:async\s+)?(?:function|const|let|var|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g;
  for (const match of source.matchAll(declRe)) names.add(match[1]);

  const listRe = /export\s+(?:type\s+)?\{([^}]*)\}/g;
  for (const match of source.matchAll(listRe)) {
    for (const part of match[1].split(',')) {
      const cleaned = part.trim().replace(/^type\s+/, '');
      if (cleaned.length === 0) continue;
      const aliasParts = cleaned.split(/\s+as\s+/);
      names.add((aliasParts[1] ?? aliasParts[0]).trim());
    }
  }

  if (/export\s+default/.test(source)) names.add('default');
  if (/export\s+\*/.test(source)) names.add('*');

  const info = { names, source };
  exportCache.set(file, info);
  return info;
}

const RESOLVE_SUFFIXES = ['', '.ts', '.tsx', '.css', '/index.ts', '/index.tsx'];

function resolveLocal(fromFile, specifier) {
  let base;
  if (specifier.startsWith('@/')) base = join(SRC_DIR, specifier.slice(2));
  else if (specifier.startsWith('.')) base = resolve(dirname(fromFile), specifier);
  else return null; // 裸模块名（react / next / node:）交给 npm 与 TS 处理

  for (const suffix of RESOLVE_SUFFIXES) {
    const candidate = `${base}${suffix}`;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return false; // 解析不到
}

for (const file of sourceFiles) {
  const source = readFileSync(file, 'utf8');
  const relativeFile = relative(ROOT, file);

  for (const match of source.matchAll(IMPORT_RE)) {
    const [, braced, defaultName, specifier] = match;
    if (specifier === undefined) continue;

    const target = resolveLocal(file, specifier);
    if (target === null) continue;

    if (target === false) {
      fail(`[导入路径] ${relativeFile} → 找不到模块 "${specifier}"`);
      continue;
    }

    if (!/\.(ts|tsx)$/.test(target)) continue;

    const { names } = exportInfo(target);
    if (names.has('*')) continue;

    const requested = [];
    if (braced !== undefined) {
      const inner = braced.slice(braced.indexOf('{') + 1, braced.lastIndexOf('}'));
      for (const part of inner.split(',')) {
        const cleaned = part.trim().replace(/^type\s+/, '');
        if (cleaned.length === 0) continue;
        const aliasParts = cleaned.split(/\s+as\s+/);
        requested.push(aliasParts[0].trim());
      }
    }
    if (defaultName !== undefined) requested.push('default');

    for (const name of requested) {
      if (name.length === 0 || name.startsWith('{')) continue;
      if (!names.has(name)) {
        fail(
          `[导出名] ${relativeFile} 从 "${specifier}" 导入了 "${name}"，但该模块没有导出它`,
        );
      }
    }
  }
}

/* -------------------------------------------------------------------------- */
/* 3：Tailwind 令牌                                                             */
/* -------------------------------------------------------------------------- */

const extend = tailwindConfig.theme.extend;

const validClasses = new Set();

const FAMILIES = [
  'bg',
  'text',
  'border',
  'divide',
  'ring',
  'fill',
  'placeholder',
  'outline',
  'accent',
  'caret',
  'decoration',
  'stroke',
  'from',
  'to',
  'via',
];

const colorKeys = [];
for (const [key, value] of Object.entries(extend.colors)) {
  if (typeof value === 'string') colorKeys.push(key);
  else for (const sub of Object.keys(value)) colorKeys.push(`${key}-${sub}`);
}

for (const key of colorKeys) {
  for (const family of FAMILIES) validClasses.add(`${family}-${key}`);
}

for (const key of Object.keys(extend.boxShadow)) validClasses.add(`shadow-${key}`);
for (const key of Object.keys(extend.borderRadius)) validClasses.add(`rounded-${key}`);
for (const key of Object.keys(extend.transitionDuration)) validClasses.add(`duration-${key}`);
for (const key of Object.keys(extend.transitionTimingFunction)) validClasses.add(`ease-${key}`);
for (const key of Object.keys(extend.maxWidth)) validClasses.add(`max-w-${key}`);

/** Tailwind 自带的合法取值（我的 config 是 extend，默认值仍然可用） */
const STANDARD_VALUE_RE =
  /^(?:\d+|px|auto|full|none|DEFAULT|inherit|initial|current|transparent|black|white|xs|sm|base|md|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl|left|center|right|justify|start|end|top|bottom|middle|thin|light|normal|medium|semibold|bold|extrabold|black|tight|snug|relaxed|loose|wider|widest|tighter|ellipsis|clip|wrap|nowrap|balance|pretty|hidden|visible|solid|dashed|dotted|double|fit|min|max|prose|reverse|(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)(?:-\d{2,3})?)$/;

const CLASS_TOKEN_RE = /(?:^|[\s"'`])((?:(?:[a-z-]+:)*)([a-z][a-z0-9]*(?:-[a-z0-9]+)*))(?=[\s"'`]|$)/g;

const checkedFiles = allFiles.filter((file) => /\.(ts|tsx|css)$/.test(file));

for (const file of checkedFiles) {
  const source = readFileSync(file, 'utf8');
  const relativeFile = relative(ROOT, file);

  for (const line of source.split('\n')) {
    // 跳过注释行与文档说明行，避免中文说明里的示例被当成代码
    const trimmed = line.trim();
    if (trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*')) continue;

    for (const match of line.matchAll(CLASS_TOKEN_RE)) {
      const raw = match[1];
      const withoutVariants = raw.includes(':') ? raw.slice(raw.lastIndexOf(':') + 1) : raw;
      if (withoutVariants.includes('[') || withoutVariants.includes('/')) continue;

      const longFamilies = ['max-w', 'duration', 'ease', 'rounded', 'shadow'];
      let family = '';
      for (const candidate of longFamilies) {
        if (withoutVariants.startsWith(`${candidate}-`)) {
          family = candidate;
          break;
        }
      }
      if (family.length === 0) {
        const dashIndex = withoutVariants.indexOf('-');
        if (dashIndex <= 0) continue;
        family = withoutVariants.slice(0, dashIndex);
      }
      if (!FAMILIES.includes(family) && !longFamilies.includes(family)) continue;

      const value = withoutVariants.slice(family.length + 1);
      if (STANDARD_VALUE_RE.test(value)) continue;
      if (validClasses.has(withoutVariants)) continue;

      // 只报「看起来像我们的令牌」的类名，避免把任意类名误判为问题
      const looksLikeOurToken = value.startsWith('surface') ||
        value.startsWith('fg-') ||
        value.startsWith('bg-page') ||
        value.startsWith('accent') ||
        value.startsWith('border-') ||
        value.startsWith('on-accent') ||
        value.startsWith('brand-') ||
        value.startsWith('fill-') ||
        value.startsWith('focus-ring') ||
        value.startsWith('star-tint') ||
        value.startsWith('glow') ||
        value.startsWith('g1') ||
        value.startsWith('g2') ||
        value.startsWith('g3') ||
        value.startsWith('instant') ||
        value.startsWith('fast') ||
        value.startsWith('slow'); 
      if (!looksLikeOurToken) continue;

      fail(`[Tailwind 令牌] ${relativeFile} 用了未知类名 "${raw}"`);
    }
  }
}

/* -------------------------------------------------------------------------- */
/* 4：括号平衡（编写环境没法跑 tsc，这是对「少写一个 }」的最后一道防线）           */
/* -------------------------------------------------------------------------- */

/**
 * 极简词法扫描：只跟踪字符串 / 模板串 / 正则 / 注释状态，然后统计 ()[]{} 的净值。
 * 只在「文件结束时净值不为 0」或「出现多余的闭括号」时报错。
 *
 * 它不需要 100% 精确的词法分析：目标是抓住「少写一个 }」「多写一个 )」这类
 * 会让 `next build` 直接失败、而文本级检查又查不出来的语法事故。
 */
function checkBracketBalance(file, source) {
  const pairs = { ')': '(', ']': '[', '}': '{' };
  const stack = [];
  let state = 'code';
  let quote = '';
  let line = 1;
  let previousSignificant = '';

  // 注意：这里刻意不含 `<`（否则 JSX 的 `</div>` 会被误判成正则起始），
  // 也不含 `)`/`}`/`>`（那几处后面的 `/` 更可能是除法或标签收尾）。
  const REGEX_PRECEDERS = new Set([
    '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', ';', '+', '-', '*', '%', '~', '^', '',
  ]);

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (char === '\n') line += 1;

    if (state === 'line-comment') {
      if (char === '\n') state = 'code';
      continue;
    }

    if (state === 'block-comment') {
      if (char === '*' && next === '/') {
        state = 'code';
        index += 1;
      }
      continue;
    }

    if (state === 'string') {
      if (char === '\\') {
        index += 1;
        continue;
      }
      if (char === quote) state = 'code';
      continue;
    }

    if (state === 'template') {
      if (char === '\\') {
        index += 1;
        continue;
      }
      if (char === '`') {
        state = 'code';
        continue;
      }
      if (char === '$' && next === '{') {
        state = 'code';
        stack.push({ ch: '${', line });
        index += 1;
      }
      continue;
    }

    if (state === 'regex') {
      if (char === '\\') {
        index += 1;
        continue;
      }
      if (char === '[') {
        state = 'regex-class';
        continue;
      }
      if (char === '/') {
        state = 'code';
        previousSignificant = '/';
      }
      continue;
    }

    if (state === 'regex-class') {
      if (char === '\\') {
        index += 1;
        continue;
      }
      if (char === ']') state = 'regex';
      continue;
    }

    // state === 'code'
    if (char === '/' && next === '/') {
      state = 'line-comment';
      index += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      state = 'block-comment';
      index += 1;
      continue;
    }
    if (char === '/' && REGEX_PRECEDERS.has(previousSignificant)) {
      state = 'regex';
      continue;
    }
    if (char === '"' || char === "'") {
      state = 'string';
      quote = char;
      // 关键：进入字符串后把「上一个有效字符」置为引号本身。
      // 否则 `className="..." />` 里那个自我闭合的 `/` 会被当成正则起始。
      previousSignificant = char;
      continue;
    }
    if (char === '`') {
      state = 'template';
      previousSignificant = char;
      continue;
    }
    if (char === '(' || char === '[' || char === '{') {
      stack.push({ ch: char, line });
      previousSignificant = char;
      continue;
    }
    if (char === ')' || char === ']' || char === '}') {
      const top = stack.pop();
      if (top !== undefined && top.ch === '${' && char === '}') {
        state = 'template';
        previousSignificant = char;
        continue;
      }
      if (top === undefined || top.ch !== pairs[char]) {
        fail(
          `[括号] ${relative(ROOT, file)} 第 ${line} 行多出一个 "${char}"（栈顶：${top === undefined ? '空' : `${top.ch} 第 ${top.line} 行`}）`,
        );
        return;
      }
      previousSignificant = char;
      continue;
    }

    if (!/\s/.test(char)) previousSignificant = char;
  }

  if (stack.length > 0) {
    const first = stack[0];
    fail(
      `[括号] ${relative(ROOT, file)} 结束时仍有 ${stack.length} 个括号未闭合（最早一个在 ${first.line} 行的 "${first.ch}"）`,
    );
  }
}

for (const file of sourceFiles) {
  checkBracketBalance(file, readFileSync(file, 'utf8'));
}

/* -------------------------------------------------------------------------- */
/* 结果                                                                        */
/* -------------------------------------------------------------------------- */

notes.push(`扫描 ${sourceFiles.length} 个 TS/TSX 文件与 ${allFiles.length - sourceFiles.length} 个其他文件`);
notes.push(`Tailwind 自定义类名白名单 ${validClasses.size} 条`);

console.log(notes.map((note) => `· ${note}`).join('\n'));

if (problems.length === 0) {
  console.log('\n静态自检通过：导入路径、导出名、Tailwind 令牌都没有发现问题。');
} else {
  console.log(`\n发现 ${problems.length} 个问题：`);
  for (const problem of problems) console.log(`  ✗ ${problem}`);
  process.exitCode = 1;
}
