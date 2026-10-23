/**
 * 零依赖离线自测：node tests/run.mjs
 *
 * 为什么不用 Vitest / Jest：本项目只需验证纯逻辑（签名、迁移、限流、搜索、URL 白名单），
 * Node 自带 TS 类型擦除 + 这里手写的 30 行断言器就够了，省掉一整套依赖与它的维护利息。
 *
 * ⚠️ 只导入「无运行时相对依赖」的纯函数模块 —— 这样 Node 的 ESM 解析器
 *    （不认 @/ 别名与无扩展名 import）也能直接加载它们。
 */

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { isHttpsUrl, isSafeNextPath, isSameOrigin, normalizeNextPath, normalizeHost, protocolOf, safeExternalUrl, hostOf, clientKeyFromForwardedFor } from '../src/lib/utils/url.ts';
import { platformMatches, searchPlatforms, tokenize } from '../src/lib/utils/search.ts';
import { formatRelativeTime, isSameLocalDay, formatStamp } from '../src/lib/utils/time.ts';
import { PLATFORMS, PLATFORM_BY_ID } from '../src/data/platforms.ts';
import {
  ENTITY_ID_PATTERN,
  KNOWN_PLATFORM_IDS,
  MAX_COMBOS,
  MAX_PINNED_PROMPTS,
  MAX_PROMPTS,
  MAX_RECENTS,
  MAX_TAGS_PER_PLATFORM,
  PROMPT_DRAFT_MAX,
  createEmptyState,
  addCombo,
  addCustomTag,
  deleteCombo,
  deletePrompt,
  isPlatformId,
  migrateState,
  parseStored,
  pinPrompt,
  recordOpen,
  removeCustomTag,
  renameCombo,
  sanitizeState,
  serializeState,
  sortPromptsForDisplay,
  toggleFavorite,
  togglePromptPin,
  unpinPrompt,
  updateSettings,
  upsertPrompt,
} from '../src/lib/storage/schema.ts';
import { BUILTIN_TEMPLATES } from '../src/data/prompt-templates.ts';
import { createId } from '../src/lib/utils/id.ts';
import { buildBackup, parseBackup } from '../src/lib/storage/backup.ts';
import {
  deriveSessionKey,
  passwordFingerprint,
  signSessionToken,
  verifySessionToken,
} from '../src/lib/auth/session.ts';
import { hashPassword, parseHash, verifyPassword, verifyPlainPassword } from '../src/lib/auth/password.ts';
import {
  MemoryRateLimiter,
  RATE_LIMIT_MAX_FAILURES,
  RATE_LIMIT_WINDOW_MS,
  evaluateAttempt,
  progressiveDelayMs,
} from '../src/lib/auth/rate-limit.ts';
import {
  authenticatePassword,
  isAuthenticated,
  readAuthConfig,
  sessionKeyFor,
} from '../src/lib/auth/config.ts';
import {
  parseCookieSecureMode,
  shouldUseSecureCookie,
} from '../src/lib/auth/cookie-policy.ts';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  \u2713 ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`  \u2717 ${name}`);
    console.log(`      ${error && error.message ? error.message : String(error)}`);
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  \u2713 ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`  \u2717 ${name}`);
    console.log(`      ${error && error.message ? error.message : String(error)}`);
  }
}

function group(title) {
  console.log(`\n${title}`);
}

// ---------------------------------------------------------------------------
group('1. 数据真源 data/platforms.ts');

test('内置六个平台都在，且 id 唯一（允许你自行增删，但不允许重复或丢失）', () => {
  const ids = PLATFORMS.map((platform) => platform.id);
  assert.equal(new Set(ids).size, ids.length, '存在重复的平台 id');
  for (const required of ['openai', 'deepseek', 'gemini', 'qwen', 'kimi', 'zhipu']) {
    assert.ok(ids.includes(required), `内置平台 ${required} 不见了`);
  }
  assert.ok(PLATFORMS.length >= 6);
});

test('所有入口 URL 都是 https 且可解析', () => {
  for (const platform of PLATFORMS) {
    assert.ok(isHttpsUrl(platform.url), `${platform.name} 的 URL 不是合法 https：${platform.url}`);
  }
});

test('host 字段与 URL 的真实 host 一致', () => {
  for (const platform of PLATFORMS) {
    assert.equal(hostOf(platform.url), platform.host, `${platform.name} 的 host 字段与 URL 不匹配`);
  }
});

test('每个平台都有品牌变量、tint、lastVerified', () => {
  for (const platform of PLATFORMS) {
    assert.match(platform.brandVar, /^--brand-[a-z]+$/);
    assert.match(platform.tintHex, /^#[0-9A-Fa-f]{6}$/);
    assert.match(platform.mark, /^\S{1,2}$/);
    assert.match(platform.lastVerified, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(platform.aliases.length > 0);
  }
});

test('PLATFORM_BY_ID 覆盖全部 id', () => {
  for (const platform of PLATFORMS) {
    assert.equal(PLATFORM_BY_ID[platform.id].url, platform.url);
  }
});

// ---------------------------------------------------------------------------
group('2. 搜索 lib/utils/search.ts');

test('tokenize 处理空串、全角空格、多空格', () => {
  assert.deepEqual(tokenize(''), []);
  assert.deepEqual(tokenize('   '), []);
  assert.deepEqual(tokenize('  GPT\u3000 中文 '), ['gpt', '中文']);
});

test('按英文名 / 别名 / 大小写匹配', () => {
  const results = searchPlatforms(PLATFORMS, 'GPT');
  assert.equal(results.length, 1);
  assert.equal(results[0].id, 'openai');
});

test('按拼音首字母匹配中文平台', () => {
  assert.equal(searchPlatforms(PLATFORMS, 'tyqw')[0].id, 'qwen');
  assert.equal(searchPlatforms(PLATFORMS, 'zpqy')[0].id, 'zhipu');
  assert.equal(searchPlatforms(PLATFORMS, 'km')[0].id, 'kimi');
});

test('按中文名匹配', () => {
  assert.equal(searchPlatforms(PLATFORMS, '通义')[0].id, 'qwen');
  assert.equal(searchPlatforms(PLATFORMS, '清言')[0].id, 'zhipu');
});

test('多关键词是 AND 语义', () => {
  assert.equal(searchPlatforms(PLATFORMS, 'deepseek 代码').length, 1);
  assert.equal(searchPlatforms(PLATFORMS, 'deepseek 多模态').length, 0);
});

test('空查询返回全部；无匹配返回空数组', () => {
  assert.equal(searchPlatforms(PLATFORMS, '').length, PLATFORMS.length);
  assert.equal(searchPlatforms(PLATFORMS, '不存在的模型名').length, 0);
});

test('platformMatches 接受结构化对象（不依赖具体类）', () => {
  const fake = { id: 'x', name: 'X', vendor: 'V', url: 'https://x.example/', aliases: ['alias'], initials: ['xl'], tags: ['tag'] };
  assert.ok(platformMatches(fake, ['alias']));
  assert.ok(!platformMatches(fake, ['nope']));
});

// ---------------------------------------------------------------------------
group('3. URL 白名单 lib/utils/url.ts');

test('safeExternalUrl 只放行 https', () => {
  assert.ok(safeExternalUrl('https://chat.deepseek.com/'));
  assert.equal(safeExternalUrl('http://chat.deepseek.com/'), null);
  assert.equal(safeExternalUrl('javascript:alert(1)'), null);
  assert.equal(safeExternalUrl('https://user:pw@example.com/'), null);
  assert.equal(safeExternalUrl('   '), null);
  assert.equal(safeExternalUrl(42), null);
  assert.equal(safeExternalUrl('https://' + 'a'.repeat(3000) + '.com/'), null);
});

test('isSafeNextPath 拒绝开放重定向向量', () => {
  assert.ok(isSafeNextPath('/'));
  assert.ok(isSafeNextPath('/settings?tab=1'));
  assert.equal(isSafeNextPath('//evil.com'), false);
  assert.equal(isSafeNextPath('https://evil.com'), false);
  assert.equal(isSafeNextPath('/\\evil.com'), false);
  assert.equal(isSafeNextPath('/javascript:alert(1)'), false);
  assert.equal(isSafeNextPath('/a\u0000b'), false);
  assert.equal(isSafeNextPath(''), false);
  assert.equal(isSafeNextPath('/' + 'a'.repeat(600)), false);
  assert.equal(isSafeNextPath(undefined), false);
});

test('normalizeNextPath 有兜底', () => {
  assert.equal(normalizeNextPath('//evil.com'), '/');
  assert.equal(normalizeNextPath('/ok'), '/ok');
  assert.equal(normalizeNextPath(undefined, '/fallback'), '/fallback');
});

test('isSameOrigin 语义：无 Origin 视为通过，跨站拒绝', () => {
  assert.ok(isSameOrigin(null, 'localhost:3000'));
  assert.ok(isSameOrigin('http://localhost:3000', 'localhost:3000'));
  assert.ok(isSameOrigin('https://LOCALHOST:3000', 'localhost:3000'));
  assert.equal(isSameOrigin('https://evil.com', 'localhost:3000'), false);
  assert.equal(isSameOrigin('not a url', 'localhost:3000'), false);
  assert.equal(isSameOrigin('https://evil.com', null), false);
});

test('isSameOrigin 容忍反代改写的 Host（Tailscale Serve / Caddy）', () => {
  // 反代把 Host 改成回源地址，但 X-Forwarded-Host 保留了外部域名
  assert.ok(isSameOrigin('https://ai-hub.tail1234.ts.net', '127.0.0.1:3000', 'ai-hub.tail1234.ts.net'));
  // 默认端口归一化
  assert.ok(isSameOrigin('https://ai-hub.tail1234.ts.net', 'ai-hub.tail1234.ts.net:443'));
  // 依然拦住真正的跨站
  assert.equal(isSameOrigin('https://evil.com', '127.0.0.1:3000', 'ai-hub.tail1234.ts.net'), false);
  // 两边都没有可比对的 Host 时拒绝
  assert.equal(isSameOrigin('https://evil.com', null, null), false);
});

test('normalizeHost 处理逗号列表、大小写与默认端口', () => {
  assert.equal(normalizeHost('Aihub.Example.COM:443'), 'aihub.example.com');
  assert.equal(normalizeHost('aihub.example.com:80'), 'aihub.example.com');
  assert.equal(normalizeHost('aihub.example.com:8443'), 'aihub.example.com:8443');
  assert.equal(normalizeHost('first.example, second.example'), 'first.example');
  assert.equal(normalizeHost('  '), null);
  assert.equal(normalizeHost(null), null);
});

test('protocolOf 解析请求 URL 的协议', () => {
  assert.equal(protocolOf('https://example.com/api/auth/login'), 'https:');
  assert.equal(protocolOf('http://127.0.0.1:3000/'), 'http:');
  assert.equal(protocolOf('不是 URL'), null);
});

test('clientKeyFromForwardedFor 取第一个地址', () => {
  assert.equal(clientKeyFromForwardedFor('1.2.3.4, 5.6.7.8'), '1.2.3.4');
  assert.equal(clientKeyFromForwardedFor(null), 'local');
  assert.equal(clientKeyFromForwardedFor('  '), 'local');
});

// ---------------------------------------------------------------------------
group('4. 状态清洗与迁移 lib/storage/schema.ts');

test('脏数据被丢弃而不是抛异常', () => {
  const state = sanitizeState({
    favorites: ['openai', 'evil', 'openai', 123, null],
    recents: [
      { platformId: 'kimi', lastOpenedAt: 'x', openCount: -5, lastMode: 'hacked' },
      { platformId: 'nope' },
      'garbage',
    ],
    settings: { showShortcutHints: 'yes' },
    extraDangerousField: { a: 1 },
  });
  assert.deepEqual(state.favorites, ['openai']);
  assert.equal(state.recents.length, 1);
  assert.equal(state.recents[0].platformId, 'kimi');
  assert.equal(state.recents[0].lastOpenedAt, 0);
  assert.equal(state.recents[0].openCount, 0);
  assert.equal(state.recents[0].lastMode, 'single');
  assert.equal(state.settings.showShortcutHints, true);
  assert.equal('extraDangerousField' in state, false);
});

test('输入的非法值一律回落到空状态', () => {
  assert.deepEqual(sanitizeState(null), createEmptyState());
  assert.deepEqual(sanitizeState([]), createEmptyState());
  assert.deepEqual(sanitizeState('nope'), createEmptyState());
});

test('isPlatformId 只认六个 id', () => {
  assert.ok(isPlatformId('openai'));
  assert.ok(!isPlatformId('OPENAI'));
  assert.ok(!isPlatformId('evil'));
});

test('v0 数据能迁移到当前版本（v0 → v1 → v2 → v3 全链）', () => {
  const migrated = migrateState({ favorites: ['kimi'], recents: [] });
  assert.equal(migrated.schemaVersion, 3);
  assert.deepEqual(migrated.favorites, ['kimi']);
  assert.equal(migrated.settings.showShortcutHints, true);
  assert.equal(migrated.settings.activePromptId, null);
  assert.equal(migrated.settings.promptDraft, '');
  assert.deepEqual(migrated.prompts, []);
  assert.deepEqual(migrated.combos, []);
  assert.deepEqual(migrated.customTags, {});
  assert.deepEqual(migrated.pinnedPromptIds, []);
});

test('v1 数据迁移到 v2 再到 v3：已有字段保留，新字段空表起步', () => {
  const migrated = migrateState({
    schemaVersion: 1,
    favorites: ['openai'],
    recents: [{ platformId: 'kimi', lastOpenedAt: 5, openCount: 2, lastMode: 'single' }],
    settings: { showShortcutHints: false },
  });
  assert.equal(migrated.schemaVersion, 3);
  assert.deepEqual(migrated.favorites, ['openai']);
  assert.equal(migrated.recents[0].openCount, 2);
  assert.equal(migrated.settings.showShortcutHints, false);
  assert.deepEqual(migrated.prompts, []);
  assert.deepEqual(migrated.combos, []);
  assert.deepEqual(migrated.pinnedPromptIds, []);
});

test('v2 数据迁移到 v3：提示词与「当前提示词」保留', () => {
  const migrated = migrateState({
    schemaVersion: 2,
    prompts: [{ id: 'prm_a', title: 'T', content: 'C', category: '写作', source: 'user', builtinId: null, createdAt: 1, updatedAt: 1 }],
    settings: { showShortcutHints: true, activePromptId: 'prm_a' },
  });
  assert.equal(migrated.schemaVersion, 3);
  assert.equal(migrated.prompts.length, 1);
  assert.equal(migrated.settings.activePromptId, 'prm_a');
  assert.equal(migrated.settings.promptDraft, '');
  assert.deepEqual(migrated.pinnedPromptIds, []);
});

test('当前 schema 重复迁移是幂等的', () => {
  const once = migrateState(migrateState(createEmptyState()));
  const twice = migrateState(once);
  assert.deepEqual(twice, once);
});

test('来自未来版本的数据保守降级，不猜测语义', () => {
  const migrated = migrateState({ schemaVersion: 99, favorites: ['gemini'], unknownFeature: true });
  assert.equal(migrated.schemaVersion, 3);
  assert.deepEqual(migrated.favorites, ['gemini']);
});

test('parseStored 容忍坏 JSON', () => {
  assert.deepEqual(parseStored('{oops'), createEmptyState());
  assert.deepEqual(parseStored(null), createEmptyState());
  assert.deepEqual(parseStored(serializeState(createEmptyState())), createEmptyState());
});

test('recordOpen 累加计数并置顶', () => {
  let state = createEmptyState();
  state = recordOpen(state, 'openai', 'single', 1000);
  state = recordOpen(state, 'kimi', 'single', 2000);
  state = recordOpen(state, 'openai', 'multi', 3000);
  assert.equal(state.recents.length, 2);
  assert.equal(state.recents[0].platformId, 'openai');
  assert.equal(state.recents[0].openCount, 2);
  assert.equal(state.recents[0].lastMode, 'multi');
  assert.equal(state.recents[1].openCount, 1);
});

test('recordOpen 最多保留 MAX_RECENTS 条', () => {
  let state = createEmptyState();
  for (let i = 0; i < MAX_RECENTS + 5; i += 1) {
    state = recordOpen(state, 'openai', 'single', 1000 + i);
  }
  assert.equal(state.recents.length, 1);
  assert.equal(state.recents[0].openCount, MAX_RECENTS + 5);
});

test('toggleFavorite 可收藏与取消', () => {
  let state = createEmptyState();
  state = toggleFavorite(state, 'qwen');
  assert.deepEqual(state.favorites, ['qwen']);
  state = toggleFavorite(state, 'qwen');
  assert.deepEqual(state.favorites, []);
});

test('updateSettings 合并而不是覆盖', () => {
  const state = updateSettings(createEmptyState(), { showShortcutHints: false });
  assert.equal(state.settings.showShortcutHints, false);
});

test('序列化后的数据可以被重新读回', () => {
  let state = createEmptyState();
  state = toggleFavorite(state, 'zhipu');
  state = recordOpen(state, 'zhipu', 'single', 12345);
  const roundTrip = parseStored(serializeState(state));
  assert.deepEqual(roundTrip.favorites, ['zhipu']);
  assert.equal(roundTrip.recents[0].lastOpenedAt, 12345);
});

// ---------------------------------------------------------------------------
group('5. 备份导入导出 lib/storage/backup.ts');

test('导出内容可被导入', () => {
  let state = createEmptyState();
  state = toggleFavorite(state, 'deepseek');
  state = recordOpen(state, 'deepseek', 'multi', 999);
  const text = buildBackup(state, 1700000000000);
  const result = parseBackup(text);
  assert.ok(result.ok);
  assert.equal(result.favorites, 1);
  assert.equal(result.recents, 1);
});

test('裸 state 对象也能导入', () => {
  const result = parseBackup(JSON.stringify({ favorites: ['kimi'], recents: [] }));
  assert.ok(result.ok);
  assert.deepEqual(result.state.favorites, ['kimi']);
});

test('坏文件给出中文错误而不是崩溃', () => {
  assert.equal(parseBackup('').ok, false);
  assert.equal(parseBackup('not json').ok, false);
  assert.equal(parseBackup('[1,2,3]').ok, false);
});

// ---------------------------------------------------------------------------
group('6. 会话令牌 lib/auth/session.ts');

const SECRET = 'test-secret-0123456789abcdefghijklmn';
const KEY = deriveSessionKey(SECRET, passwordFingerprint('scrypt$fake$hash'));

test('签名后能通过校验', () => {
  const now = 1700000000000;
  const token = signSessionToken(KEY, 3600, now);
  const check = verifySessionToken(token, KEY, now + 1000);
  assert.ok(check.ok);
  assert.equal(check.expiresInSeconds, 3599);
});

test('篡改任意一段都会失败', () => {
  const now = 1700000000000;
  const token = signSessionToken(KEY, 3600, now);
  const parts = token.split('.');
  const tamperedSig = `${parts[0]}.${parts[1]}.${parts[2]}.${'a'.repeat(64)}`;
  assert.deepEqual(verifySessionToken(tamperedSig, KEY, now), { ok: false, reason: 'bad_signature' });
  const tamperedExp = `${parts[0]}.${Number(parts[1]) + 99999}.${parts[2]}.${parts[3]}`;
  assert.deepEqual(verifySessionToken(tamperedExp, KEY, now), { ok: false, reason: 'bad_signature' });
});

test('过期令牌被识别为 expired', () => {
  const now = 1700000000000;
  const token = signSessionToken(KEY, 60, now);
  assert.deepEqual(verifySessionToken(token, KEY, now + 61000), { ok: false, reason: 'expired' });
});

test('畸形令牌一律 malformed', () => {
  const now = 1700000000000;
  for (const bad of ['', 'v1', 'v1.abc.def.ghi', 'v2.1.1.' + 'a'.repeat(64), 'v1.1.1.' + 'z'.repeat(64), 'v1.1.1.' + 'a'.repeat(63), null, undefined, 123]) {
    const result = verifySessionToken(bad, KEY, now);
    assert.equal(result.ok, false, `应判为非法：${String(bad)}`);
  }
});

test('换密码指纹后旧令牌立即失效（改密码 = 全端登出）', () => {
  const now = 1700000000000;
  const token = signSessionToken(KEY, 3600, now);
  const newKey = deriveSessionKey(SECRET, passwordFingerprint('another-hash'));
  assert.deepEqual(verifySessionToken(token, newKey, now), { ok: false, reason: 'bad_signature' });
});

test('空的 SESSION_SECRET 会抛错（防止静默使用弱密钥）', () => {
  assert.throws(() => deriveSessionKey('', 'fp'));
});

// ---------------------------------------------------------------------------
group('7. 密码哈希 lib/auth/password.ts');

await testAsync('哈希 → 校验通过 / 错密码不通过', async () => {
  const stored = await hashPassword('正确的密码-123');
  assert.ok(parseHash(stored) !== null);
  assert.equal(await verifyPassword('正确的密码-123', stored), true);
  assert.equal(await verifyPassword('错误的密码-123', stored), false);
  assert.equal(await verifyPassword('', stored), false);
});

await testAsync('同一密码两次哈希不同（盐随机）', async () => {
  const a = await hashPassword('same-password');
  const b = await hashPassword('same-password');
  assert.notEqual(a, b);
  assert.equal(await verifyPassword('same-password', a), true);
  assert.equal(await verifyPassword('same-password', b), true);
});

await testAsync('哈希串不含 $，且是 6 段冒号分隔（dotenv 不会碰坏它）', async () => {
  const stored = await hashPassword('no-dollar-sign-password');
  assert.equal(stored.includes('$'), false, `哈希里出现了 $：${stored}`);
  assert.equal(stored.split(':').length, 6);
  assert.match(stored, /^scrypt:16384:8:1:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/);
});

await testAsync('旧版 $ 分隔格式仍可校验（向后兼容）', async () => {
  const stored = await hashPassword('legacy-password-123');
  const legacy = stored.split(':').join('$');
  assert.equal(await verifyPassword('legacy-password-123', legacy), true);
  assert.equal(await verifyPassword('wrong', legacy), false);
});

test('畸形哈希不会通过校验，也不会抛异常', async () => {
  for (const bad of ['', 'bcrypt:1:2:3:4:5', 'scrypt:abc:8:1:c2FsdA==:aGFzaA==', 'scrypt:99999999:8:1:c2FsdA==:aGFzaA==', 'scrypt$abc$8$1$c2FsdA==$aGFzaA==']) {
    assert.equal(parseHash(bad), null);
  }
});

await testAsync('经 @next/env 解析后哈希一字不变（回归：dotenv 会展开 $）', async () => {
  let loadEnvConfig;
  try {
    // @next/env 是 CommonJS 包：成员在 default 导出上，直接具名导入会失败
    const nextEnv = await import('@next/env');
    loadEnvConfig = nextEnv.default.loadEnvConfig;
  } catch {
    console.log('      （跳过：没装 @next/env，先跑 npm install）');
    return;
  }

  const dir = mkdtempSync(join(tmpdir(), 'aihub-env-'));
  const stored = await hashPassword('dotenv-trap-password');
  writeFileSync(join(dir, '.env.local'), `AUTH_PASSWORD_HASH=${stored}\nCOOKIE_SECURE=0\n`, 'utf8');

  const savedHash = process.env.AUTH_PASSWORD_HASH;
  const savedSecure = process.env.COOKIE_SECURE;
  delete process.env.AUTH_PASSWORD_HASH;
  delete process.env.COOKIE_SECURE;

  try {
    loadEnvConfig(dir, false, { info() {}, error() {}, warn() {} });
    assert.equal(process.env.AUTH_PASSWORD_HASH, stored, '进程读到的哈希被 dotenv 改写了');
    assert.equal(process.env.COOKIE_SECURE, '0');
    assert.equal(await verifyPassword('dotenv-trap-password', process.env.AUTH_PASSWORD_HASH), true);
  } finally {
    if (savedHash === undefined) delete process.env.AUTH_PASSWORD_HASH;
    else process.env.AUTH_PASSWORD_HASH = savedHash;
    if (savedSecure === undefined) delete process.env.COOKIE_SECURE;
    else process.env.COOKIE_SECURE = savedSecure;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('明文比较是定长哈希后比较', () => {
  assert.ok(verifyPlainPassword('abc', 'abc'));
  assert.ok(!verifyPlainPassword('abc', 'abd'));
  assert.ok(!verifyPlainPassword('', ''));
});

// ---------------------------------------------------------------------------
group('8. 限流 lib/auth/rate-limit.ts');

test('失败次数少时放行且无延迟', () => {
  const decision = evaluateAttempt([], 1000);
  assert.ok(decision.allowed);
  assert.equal(decision.delayMs, 0);
});

test('延迟随失败次数递增但有上限', () => {
  assert.equal(progressiveDelayMs(2), 0);
  assert.ok(progressiveDelayMs(4) > 0);
  assert.ok(progressiveDelayMs(50) <= 4000);
});

test('窗口外的失败记录被清理', () => {
  const now = 1000000;
  const stale = [now - RATE_LIMIT_WINDOW_MS - 1, now - 1000];
  const decision = evaluateAttempt(stale, now);
  assert.equal(decision.failuresInWindow, 1);
  assert.ok(decision.allowed);
});

test('达到上限时短暂拒绝，但会给出重试秒数（永不永久锁死）', () => {
  const now = 1000000;
  const failures = new Array(RATE_LIMIT_MAX_FAILURES).fill(0).map((_, index) => now - index * 1000);
  const decision = evaluateAttempt(failures, now);
  assert.equal(decision.allowed, false);
  assert.ok(decision.retryAfterSeconds > 0);
  assert.ok(decision.retryAfterSeconds <= Math.ceil(RATE_LIMIT_WINDOW_MS / 1000));
});

test('MemoryRateLimiter：成功后清零', () => {
  const limiter = new MemoryRateLimiter();
  limiter.recordFailure('ip', 1000);
  limiter.recordFailure('ip', 1001);
  assert.equal(limiter.check('ip', 1002).failuresInWindow, 2);
  limiter.reset('ip');
  assert.equal(limiter.check('ip', 1003).failuresInWindow, 0);
  assert.equal(limiter.size(), 0);
});

// ---------------------------------------------------------------------------
group('9. 时间展示 lib/utils/time.ts');

test('相对时间分档', () => {
  const now = new Date(2026, 9, 9, 12, 0, 0).getTime();
  assert.equal(formatRelativeTime(now - 10 * 1000, now), '刚刚');
  assert.equal(formatRelativeTime(now - 5 * 60000, now), '5 分钟前');
  assert.equal(formatRelativeTime(now - 3 * 3600000, now), '3 小时前');
  assert.equal(formatRelativeTime(new Date(2026, 9, 8, 20, 0, 0).getTime(), now), '昨天');
  assert.equal(formatRelativeTime(new Date(2026, 9, 6, 12, 0, 0).getTime(), now), '3 天前');
  assert.equal(formatRelativeTime(new Date(2026, 8, 1, 12, 0, 0).getTime(), now), '9 月 1 日');
});

test('isSameLocalDay 与 formatStamp', () => {
  assert.ok(isSameLocalDay(new Date(2026, 9, 9, 0, 1).getTime(), new Date(2026, 9, 9, 23, 59).getTime()));
  assert.ok(!isSameLocalDay(new Date(2026, 9, 9, 0, 1).getTime(), new Date(2026, 9, 10, 0, 1).getTime()));
  assert.equal(formatStamp(new Date(2026, 9, 9, 8, 5).getTime()), '20261009-0805');
});

// ---------------------------------------------------------------------------
group('10. 视觉令牌与配置一致性');

const globalsCss = readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8');
const envExample = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const tailwindConfigSource = readFileSync(
  new URL('../tailwind.config.ts', import.meta.url),
  'utf8',
);

test('每个平台的品牌/填充色变量都在 globals.css 里定义', () => {
  for (const platform of PLATFORMS) {
    assert.ok(
      globalsCss.includes(`${platform.brandVar}:`),
      `globals.css 缺少 ${platform.brandVar}`,
    );
    assert.ok(
      globalsCss.includes(`${platform.fillVar}:`),
      `globals.css 缺少 ${platform.fillVar}`,
    );
  }
});

test('每个平台都有 data-brand 选择器（否则卡片取不到色）', () => {
  for (const platform of PLATFORMS) {
    assert.ok(
      globalsCss.includes(`[data-brand='${platform.id}']`),
      `globals.css 缺少 [data-brand='${platform.id}']`,
    );
  }
});

test('平台 tint 底各不相同（避免六张卡看起来一样）', () => {
  const tints = new Set(PLATFORMS.map((platform) => platform.tintHex));
  assert.equal(tints.size, PLATFORMS.length);
});

test('tailwind 主题映射覆盖了设计令牌（色名 ↔ CSS 变量）', () => {
  for (const variable of ['--bg-page', '--surface-1', '--border-strong', '--text-3', '--accent-500']) {
    const bareName = variable.replace('--', '');
    assert.ok(
      tailwindConfigSource.includes(`v('${bareName}')`),
      `tailwind.config.ts 没有映射 ${variable}`,
    );
  }
});

test('新增平台时：storage 白名单必须同步（否则收藏/最近记录会被静默丢弃）', () => {
  const platformIds = PLATFORMS.map((platform) => platform.id).sort();
  const known = [...KNOWN_PLATFORM_IDS].sort();
  for (const id of platformIds) {
    assert.ok(
      known.includes(id),
      `src/lib/storage/schema.ts 的 KNOWN_PLATFORM_IDS 缺少 "${id}"：该平台的收藏与最近使用记录会被 sanitizeState 丢掉`,
    );
  }
  assert.deepEqual(known, platformIds, 'KNOWN_PLATFORM_IDS 与 data/platforms.ts 的名单不一致');
});

test('新增平台时：tailwind 主题映射也要补上 brand/fill 两个色名', () => {
  for (const platform of PLATFORMS) {
    for (const variable of [platform.brandVar, platform.fillVar]) {
      const bareName = variable.replace('--', '');
      assert.ok(
        tailwindConfigSource.includes(`v('${bareName}')`),
        `tailwind.config.ts 缺少 ${variable} 的映射（${platform.name}）`,
      );
    }
  }
});

test('.env.example 列出了全部必需环境变量', () => {
  for (const key of ['SESSION_SECRET', 'AUTH_PASSWORD_HASH', 'AUTH_PASSWORD', 'COOKIE_SECURE', 'COOKIE_NAME', 'SESSION_TTL_SECONDS']) {
    assert.ok(envExample.includes(key), `.env.example 缺少 ${key}`);
  }
});

test('package.json 脚本齐全且没有多余的重依赖', () => {
  for (const script of ['dev', 'build', 'start', 'typecheck', 'test', 'selfcheck', 'verify']) {
    assert.ok(packageJson.scripts[script], `缺少 npm 脚本：${script}`);
  }
  const dependencies = Object.keys(packageJson.dependencies);
  assert.deepEqual(dependencies.sort(), ['next', 'react', 'react-dom']);
  assert.equal(packageJson.dependencies['react'], packageJson.dependencies['react-dom']);
});

// ---------------------------------------------------------------------------
group('11. 服务端配置读取 lib/auth/config.ts');

test('什么都没配时 fail closed 并给出缺什么', () => {
  const result = readAuthConfig({});
  assert.equal(result.ok, false);
  assert.equal(result.missing.length, 2);
});

test('密钥太短也视为未配置', () => {
  const result = readAuthConfig({ SESSION_SECRET: 'short', AUTH_PASSWORD: 'x' });
  assert.equal(result.ok, false);
});

test('配好之后默认是「安全派 + 自适应」：Secure 走 auto，14 天有效期', () => {
  const result = readAuthConfig({
    SESSION_SECRET: 'x'.repeat(40),
    AUTH_PASSWORD_HASH: 'scrypt:1:1:1:c2FsdA:aGFzaA',
  });
  assert.equal(result.ok, true);
  assert.equal(result.config.cookieSecureMode, 'auto');
  assert.equal(result.config.cookieName, 'aihub_session');
  assert.equal(result.config.sessionTtlSeconds, 1209600);
});

test('COOKIE_SECURE=0 → never，=1 → always，乱写一律按最严格处理', () => {
  const base = { SESSION_SECRET: 'x'.repeat(40), AUTH_PASSWORD: 'plain-password' };
  const never = readAuthConfig({ ...base, COOKIE_SECURE: '0' });
  const always = readAuthConfig({ ...base, COOKIE_SECURE: '1' });
  const junk = readAuthConfig({ ...base, COOKIE_SECURE: 'yes-please' });
  assert.equal(never.ok && never.config.cookieSecureMode, 'never');
  assert.equal(always.ok && always.config.cookieSecureMode, 'always');
  assert.equal(junk.ok && junk.config.cookieSecureMode, 'always');
});

test('COOKIE_SECURE 的其他配置项仍然生效', () => {
  const result = readAuthConfig({
    SESSION_SECRET: 'x'.repeat(40),
    AUTH_PASSWORD: 'plain-password',
    COOKIE_SECURE: '0',
    SESSION_TTL_SECONDS: '3600',
    COOKIE_NAME: 'custom',
  });
  assert.equal(result.ok, true);
  assert.equal(result.config.cookieSecureMode, 'never');
  assert.equal(result.config.sessionTtlSeconds, 3600);
  assert.equal(result.config.cookieName, 'custom');
});

test('优先使用哈希而不是明文', async () => {
  const stored = await hashPassword('真密码');
  const result = readAuthConfig({
    SESSION_SECRET: 'x'.repeat(40),
    AUTH_PASSWORD_HASH: stored,
    AUTH_PASSWORD: '明文密码（应被忽略）',
  });
  assert.equal(result.ok, true);
  assert.equal(await authenticatePassword('真密码', result.config), true);
  assert.equal(await authenticatePassword('明文密码（应被忽略）', result.config), false);
});

test('会话密钥由密码派生：改密码即全端登出', () => {
  const base = { SESSION_SECRET: 'x'.repeat(40) };
  const a = readAuthConfig({ ...base, AUTH_PASSWORD: 'password-a' });
  const b = readAuthConfig({ ...base, AUTH_PASSWORD: 'password-b' });
  assert.equal(a.ok && b.ok, true);
  const token = signSessionToken(sessionKeyFor(a.config), 3600, 1700000000000);
  assert.equal(isAuthenticated(token, a.config, 1700000000000), true);
  assert.equal(isAuthenticated(token, b.config, 1700000000000), false);
});

// ---------------------------------------------------------------------------
group('12. Cookie Secure 策略 lib/auth/cookie-policy.ts');

test('parseCookieSecureMode 的完整映射', () => {
  assert.equal(parseCookieSecureMode(undefined), 'auto');
  assert.equal(parseCookieSecureMode(''), 'auto');
  assert.equal(parseCookieSecureMode('auto'), 'auto');
  assert.equal(parseCookieSecureMode('AUTO'), 'auto');
  assert.equal(parseCookieSecureMode('0'), 'never');
  assert.equal(parseCookieSecureMode('false'), 'never');
  assert.equal(parseCookieSecureMode('never'), 'never');
  assert.equal(parseCookieSecureMode('1'), 'always');
  assert.equal(parseCookieSecureMode('true'), 'always');
  assert.equal(parseCookieSecureMode('随便写的值'), 'always');
  assert.equal(parseCookieSecureMode(42), 'auto');
});

test('always / never 无视请求协议', () => {
  assert.equal(shouldUseSecureCookie('always', { forwardedProto: 'http', urlProtocol: 'http:' }), true);
  assert.equal(shouldUseSecureCookie('never', { forwardedProto: 'https', urlProtocol: 'https:' }), false);
});

test('auto：直连 https 加 Secure，http 不加（http://localhost 也能登录）', () => {
  assert.equal(shouldUseSecureCookie('auto', { urlProtocol: 'https:' }), true);
  assert.equal(shouldUseSecureCookie('auto', { urlProtocol: 'http:' }), false);
});

test('auto：反代透传 X-Forwarded-Proto: https 时也加 Secure（Tailscale Serve / Caddy 场景）', () => {
  assert.equal(shouldUseSecureCookie('auto', { forwardedProto: 'https', urlProtocol: 'http:' }), true);
  assert.equal(shouldUseSecureCookie('auto', { forwardedProto: 'HTTPS, http', urlProtocol: 'http:' }), true);
  assert.equal(shouldUseSecureCookie('auto', { forwardedProto: 'http', urlProtocol: 'http:' }), false);
});

test('auto 且拿不到任何协议线索时不加 Secure（宁可可用，也不让浏览器静默丢 Cookie）', () => {
  assert.equal(shouldUseSecureCookie('auto'), false);
  assert.equal(shouldUseSecureCookie('auto', {}), false);
});

// ---------------------------------------------------------------------------
group('13. 提示词 / 组合 / 自定义标签（schema v2）');

test('ENTITY_ID_PATTERN 只认 prm_/cmb_ 形态的 id', () => {
  assert.ok(ENTITY_ID_PATTERN.test('prm_abc123'));
  assert.ok(ENTITY_ID_PATTERN.test('cmb_1'));
  assert.equal(ENTITY_ID_PATTERN.test(''), false);
  assert.equal(ENTITY_ID_PATTERN.test('prm_' + 'x'.repeat(70)), false);
  assert.equal(ENTITY_ID_PATTERN.test('bad id'), false);
});

test('createId：注入随机源可复现，撞车自动重试', () => {
  const seq = ['a', 'b', 'a', 'c'];
  let index = 0;
  const seen = new Set(['prm_a']);
  assert.equal(createId('prm', seen, () => seq[index++]), 'prm_b');
  // 全部撞车时返回最后一次的结果（调用方仍可用 Set 去重）
  assert.equal(createId('prm', new Set(['prm_x']), () => 'x'), 'prm_x');
});

test('sanitize 提示词：垃圾丢弃、空正文丢弃、超长截断、按 id 去重', () => {
  const long = 'x'.repeat(9000);
  const state = sanitizeState({
    prompts: [
      'garbage',
      { id: 'prm_a', title: '', content: '   ' },
      { id: 'prm_b', title: 't'.repeat(100), content: long, category: '编程', createdAt: 5, updatedAt: 6 },
      { id: 'prm_b', title: '重复的会被丢弃', content: 'x' },
      { id: 'bad id', content: 'x' },
    ],
  });
  assert.equal(state.prompts.length, 1);
  assert.equal(state.prompts[0].id, 'prm_b');
  assert.equal(state.prompts[0].content.length, 8000);
  assert.equal(state.prompts[0].title, 't'.repeat(60));
  assert.equal(state.prompts[0].category, '编程');
});

test('sanitize 提示词数量受 MAX_PROMPTS 约束', () => {
  const prompts = [];
  for (let i = 0; i < MAX_PROMPTS + 5; i += 1) {
    prompts.push({ id: `prm_${i}`, title: `t${i}`, content: 'c' });
  }
  assert.equal(sanitizeState({ prompts }).prompts.length, MAX_PROMPTS);
});

test('sanitize 组合：platformIds 按形态过滤去重、封顶 7，空组合丢弃', () => {
  const state = sanitizeState({
    combos: [
      {
        id: 'cmb_a',
        name: 'n'.repeat(100),
        platformIds: ['openai', 'openai', 'EVIL', 'kimi', 'qwen', 'gemini', 'zhipu', 'doubao', 'extra1'],
        promptId: 'not-an-id',
        createdAt: 1,
      },
      { id: 'cmb_b', name: '空组合', platformIds: ['EVIL'], createdAt: 2 }, // 全部 id 形态非法 → 整条丢弃
    ],
  });
  assert.equal(state.combos.length, 1);
  assert.deepEqual(state.combos[0].platformIds, ['openai', 'kimi', 'qwen', 'gemini', 'zhipu', 'doubao', 'extra1']);
  assert.equal(state.combos[0].name, 'n'.repeat(40));
  assert.equal(state.combos[0].promptId, null);
});

test('sanitize 自定义标签：trim、去重、封顶，孤儿平台的标签保留（不静默丢失）', () => {
  const state = sanitizeState({
    customTags: {
      openai: ['  代码强 ', '代码强', '', 'x'.repeat(99), '免费', 'a', 'b', 'c', 'd', 'e', 'f'],
      ghostplatform: ['我还会回来'], // 不在当前平台列表里，也必须保留
      'Bad Key': ['x'],
    },
  });
  assert.deepEqual(state.customTags.openai, ['代码强', 'x'.repeat(16), '免费', 'a', 'b', 'c', 'd', 'e']);
  assert.deepEqual(state.customTags.ghostplatform, ['我还会回来']);
  assert.equal('Bad Key' in state.customTags, false);
});

test('sanitize activePromptId：指向不存在的提示词时置 null，存在时保留', () => {
  const withMissing = sanitizeState({
    prompts: [],
    settings: { activePromptId: 'prm_missing' },
  });
  assert.equal(withMissing.settings.activePromptId, null);

  const withReal = sanitizeState({
    prompts: [{ id: 'prm_ok', title: 'T', content: 'C' }],
    settings: { activePromptId: 'prm_ok' },
  });
  assert.equal(withReal.settings.activePromptId, 'prm_ok');
});

test('upsertPrompt：新建置顶，更新保留创建时间，数量受上限约束', () => {
  let state = createEmptyState();
  state = upsertPrompt(state, { id: 'prm_a', title: 'A', content: 'C1', category: '写作', source: 'user', builtinId: null, createdAt: 1, updatedAt: 1 }, 10);
  state = upsertPrompt(state, { id: 'prm_a', title: 'A2', content: 'C2', category: '写作', source: 'user', builtinId: null, createdAt: 999, updatedAt: 999 }, 20);
  assert.equal(state.prompts.length, 1);
  assert.equal(state.prompts[0].title, 'A2');
  assert.equal(state.prompts[0].createdAt, 1);
  assert.equal(state.prompts[0].updatedAt, 20);

  for (let i = 0; i < MAX_PROMPTS + 3; i += 1) {
    state = upsertPrompt(state, { id: `prm_x${i}`, title: `x${i}`, content: 'c', category: '写作', source: 'user', builtinId: null, createdAt: 1, updatedAt: 1 }, 30);
  }
  assert.equal(state.prompts.length, MAX_PROMPTS);
});

test('deletePrompt：同时清空指向它的「当前提示词」；组合里的引用保留（渲染判空）', () => {
  let state = createEmptyState();
  state = upsertPrompt(state, { id: 'prm_1', title: 'T', content: 'C', category: '写作', source: 'user', builtinId: null, createdAt: 1, updatedAt: 1 }, 1);
  state = updateSettings(state, { activePromptId: 'prm_1' });
  state = addCombo(state, { name: '科研组合', platformIds: ['openai'], promptId: 'prm_1' }, () => 'cmb_1', 1);

  state = deletePrompt(state, 'prm_1');
  assert.equal(state.prompts.length, 0);
  assert.equal(state.settings.activePromptId, null);
  assert.equal(state.combos[0].promptId, 'prm_1');
});

test('addCombo / renameCombo / deleteCombo', () => {
  let counter = 0;
  let state = createEmptyState();
  for (let i = 0; i < MAX_COMBOS + 4; i += 1) {
    state = addCombo(state, { name: `组合 ${i}`, platformIds: ['openai', 'kimi'], promptId: null }, () => `cmb_${(counter += 1)}`, i);
  }
  assert.equal(state.combos.length, MAX_COMBOS);
  assert.equal(state.combos[0].name, `组合 ${MAX_COMBOS + 3}`); // 置顶，最旧的被挤掉

  const oldestSurviving = state.combos[state.combos.length - 1].id;
  state = renameCombo(state, oldestSurviving, '  科研组合  ');
  assert.equal(state.combos.find((c) => c.id === oldestSurviving).name, '科研组合');
  state = renameCombo(state, oldestSurviving, '   ');
  assert.equal(state.combos.find((c) => c.id === oldestSurviving).name, '科研组合');

  state = deleteCombo(state, oldestSurviving);
  assert.equal(state.combos.some((c) => c.id === oldestSurviving), false);
});

test('addCustomTag / removeCustomTag：trim、去重、封顶 8、非法平台 id 忽略', () => {
  let state = createEmptyState();
  state = addCustomTag(state, 'openai', '  代码强  ');
  state = addCustomTag(state, 'openai', '代码强');
  state = addCustomTag(state, 'openai', '');
  state = addCustomTag(state, 'EVIL', 'x');
  assert.deepEqual(state.customTags.openai, ['代码强']);
  assert.equal('EVIL' in state.customTags, false);

  for (const tag of ['免费', '长文本', 'a', 'b', 'c', 'd', 'e', 'f']) {
    state = addCustomTag(state, 'openai', tag);
  }
  assert.equal(state.customTags.openai.length, MAX_TAGS_PER_PLATFORM);
  state = addCustomTag(state, 'openai', '第 9 个');
  assert.equal(state.customTags.openai.length, MAX_TAGS_PER_PLATFORM);

  state = removeCustomTag(state, 'openai', '代码强');
  assert.equal(state.customTags.openai.includes('代码强'), false);
});

test('搜索命中自定义标签（extraTags 并入语料）', () => {
  const platform = { ...PLATFORMS[0], extraTags: ['免费', '代码强'] };
  assert.equal(searchPlatforms([platform], '免费').length, 1);
  assert.equal(searchPlatforms([PLATFORMS[0]], '免费').length, 0);
});

test('内置模板：id 唯一、内容非空、分类合法；副本与模板互不影响', () => {
  const ids = new Set(BUILTIN_TEMPLATES.map((template) => template.id));
  assert.equal(ids.size, BUILTIN_TEMPLATES.length);
  for (const template of BUILTIN_TEMPLATES) {
    assert.ok(template.content.trim().length > 0, `${template.id} 内容为空`);
    assert.ok(ENTITY_ID_PATTERN.test('prm_x') && template.id.startsWith('tpl-'));
  }

  const template = BUILTIN_TEMPLATES[0];
  const copy = { ...template, content: '改过的副本' };
  assert.equal(copy.builtinId, undefined);
  assert.equal(BUILTIN_TEMPLATES[0].content, template.content);
});

// ---------------------------------------------------------------------------
group('14. 提示词草稿 / 置顶与排序（schema v3）');

test('草稿（settings.promptDraft）：超长截断到上限，非字符串回落为空', () => {
  const truncated = sanitizeState({ settings: { promptDraft: 'x'.repeat(9000) } });
  assert.equal(truncated.settings.promptDraft.length, PROMPT_DRAFT_MAX);

  const fallback = sanitizeState({ settings: { promptDraft: 42 } });
  assert.equal(fallback.settings.promptDraft, '');

  const kept = sanitizeState({ settings: { promptDraft: '帮我优化论文结构' } });
  assert.equal(kept.settings.promptDraft, '帮我优化论文结构');
});

test('置顶名单 sanitize：形态过滤、去重、封顶 5；指向缺失提示词的也保留（渲染过滤）', () => {
  const state = sanitizeState({
    pinnedPromptIds: ['prm_a', 'prm_a', 'Bad', 'prm_b', 'prm_c', 'prm_d', 'prm_e', 'prm_f'],
  });
  assert.deepEqual(state.pinnedPromptIds, ['prm_a', 'prm_b', 'prm_c', 'prm_d', 'prm_e']);
});

test('pinPrompt：置顶的排最前；未入库 / 超过上限时忽略', () => {
  let state = createEmptyState();
  state = upsertPrompt(state, { id: 'prm_a', title: 'A', content: 'C', category: '写作', source: 'user', builtinId: null, createdAt: 1, updatedAt: 1 }, 1);
  state = upsertPrompt(state, { id: 'prm_b', title: 'B', content: 'C', category: '写作', source: 'user', builtinId: null, createdAt: 2, updatedAt: 2 }, 2);

  state = pinPrompt(state, 'prm_a');
  state = pinPrompt(state, 'prm_b');
  assert.deepEqual(state.pinnedPromptIds, ['prm_b', 'prm_a']); // 最近置顶在前

  state = pinPrompt(state, 'prm_a'); // 重复置顶无副作用
  assert.deepEqual(state.pinnedPromptIds, ['prm_b', 'prm_a']);

  state = pinPrompt(state, 'prm_ghost'); // 不在库里的 id 忽略
  assert.deepEqual(state.pinnedPromptIds, ['prm_b', 'prm_a']);

  let full = createEmptyState();
  for (let i = 0; i < MAX_PINNED_PROMPTS; i += 1) {
    full = upsertPrompt(full, { id: `prm_p${i}`, title: `p${i}`, content: 'C', category: '写作', source: 'user', builtinId: null, createdAt: i, updatedAt: i }, i);
    full = pinPrompt(full, `prm_p${i}`);
  }
  const before = full.pinnedPromptIds.slice();
  full = pinPrompt(full, 'prm_a');
  assert.deepEqual(full.pinnedPromptIds, before);
});

test('unpinPrompt / togglePromptPin', () => {
  let state = createEmptyState();
  state = upsertPrompt(state, { id: 'prm_a', title: 'A', content: 'C', category: '写作', source: 'user', builtinId: null, createdAt: 1, updatedAt: 1 }, 1);
  state = togglePromptPin(state, 'prm_a');
  assert.deepEqual(state.pinnedPromptIds, ['prm_a']);
  state = togglePromptPin(state, 'prm_a');
  assert.deepEqual(state.pinnedPromptIds, []);
  state = unpinPrompt(state, 'prm_a');
  assert.deepEqual(state.pinnedPromptIds, []);
});

test('删除置顶的提示词时，置顶状态同步清理', () => {
  let state = createEmptyState();
  state = upsertPrompt(state, { id: 'prm_a', title: 'A', content: 'C', category: '写作', source: 'user', builtinId: null, createdAt: 1, updatedAt: 1 }, 1);
  state = pinPrompt(state, 'prm_a');
  assert.deepEqual(state.pinnedPromptIds, ['prm_a']);
  state = deletePrompt(state, 'prm_a');
  assert.deepEqual(state.pinnedPromptIds, []);
  assert.equal(state.prompts.length, 0);
});

test('sortPromptsForDisplay：置顶在前（按置顶顺序），其余按创建时间倒序', () => {
  const prompts = [
    { id: 'prm_old', title: '旧', content: 'c', category: '写作', source: 'user', builtinId: null, createdAt: 100, updatedAt: 100 },
    { id: 'prm_new', title: '新', content: 'c', category: '写作', source: 'user', builtinId: null, createdAt: 300, updatedAt: 300 },
    { id: 'prm_mid', title: '中', content: 'c', category: '写作', source: 'user', builtinId: null, createdAt: 200, updatedAt: 200 },
  ];
  // 无置顶：创建时间倒序
  assert.deepEqual(
    sortPromptsForDisplay(prompts, []).map((p) => p.id),
    ['prm_new', 'prm_mid', 'prm_old'],
  );
  // 置顶（prm_old 最近置顶）→ 置顶组在前，其余保持创建时间倒序
  assert.deepEqual(
    sortPromptsForDisplay(prompts, ['prm_mid', 'prm_old']).map((p) => p.id),
    ['prm_mid', 'prm_old', 'prm_new'],
  );
  // 置顶 id 指向不存在的提示词：不影响排序
  assert.deepEqual(
    sortPromptsForDisplay(prompts, ['prm_ghost']).map((p) => p.id),
    ['prm_new', 'prm_mid', 'prm_old'],
  );
});

test('边栏开合/折叠状态（settings）：缺字段用默认收起集，显式空数组 = 全展开，垃圾 id 被过滤', () => {
  // 首访 / 老备份：字段缺失 → 套用默认收起集（模板组收缩，我的提示词展开）
  const empty = sanitizeState({});
  assert.equal(empty.settings.promptSidebarOpen, false);
  assert.deepEqual(empty.settings.promptSidebarCollapsed, [
    'tpl-writing',
    'tpl-coding',
    'tpl-translate',
    'tpl-summarize',
    'tpl-learning',
    'tpl-other',
  ]);

  // 用户显式把模板组全展开（空数组）→ 必须原样保留，不能被默认值覆盖
  const allExpanded = sanitizeState({ settings: { promptSidebarCollapsed: [] } });
  assert.deepEqual(allExpanded.settings.promptSidebarCollapsed, []);

  const state = sanitizeState({
    settings: {
      promptSidebarOpen: true,
      promptSidebarCollapsed: ['mine', 'tpl-writing', 'tpl-writing', 'Bad Id', 42, 'tpl-learning'],
    },
  });
  assert.equal(state.settings.promptSidebarOpen, true);
  assert.deepEqual(state.settings.promptSidebarCollapsed, ['mine', 'tpl-writing', 'tpl-learning']);
});

// ---------------------------------------------------------------------------
console.log(`\n${'-'.repeat(52)}`);
console.log(`通过 ${passed} 项，失败 ${failed} 项`);
if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log('全部通过。');
}
