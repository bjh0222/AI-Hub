/**
 * 客户端状态模型 + 迁移 + 白名单清洗（schema v2）。
 *
 * 设计要点（与 docs/技术架构决策与风险评审.md §4、方案书 §12 一致）：
 *   - 单一根键 aihub:v1:state，schemaVersion 显式记录，迁移表链式升级
 *   - sanitize 采用「白名单 + 丢字段」策略：脏数据一律丢弃，绝不抛异常
 *   - 分级保留策略（ADR）：
 *       · favorites 维持严格平台白名单（未知 id 丢弃 —— 渲染上本来就不存在，丢了无感）
 *       · customTags / combos.platformIds 只做**形态**白名单（键/值合法就保留），
 *         不按「平台当前是否存在」过滤 —— 平台列表是代码常量且会变动，
 *         用户原创数据（标签、组合）因平台暂时下线而被 GC 属于事故。
 *         渲染层负责过滤不存在的平台（孤儿数据对用户不可见但保留）。
 *   - 隐私红线：数据只存本机 localStorage；提示词是用户自己写的模板文本，
 *     不含对话内容；搜索关键词仍然不记录、不上传。
 *
 * 本文件是纯函数模块（只有 import type，无运行时依赖），可被 tests/run.mjs 直接导入。
 */

import type { PlatformId } from '@/data/platforms';

export const SCHEMA_VERSION = 3;
export const MAX_RECENTS = 20;

/* ---------------------------------------------------------------- 上限 */

export const MAX_PROMPTS = 100;
export const PROMPT_TITLE_MAX = 60;
export const PROMPT_CONTENT_MAX = 8000;
export const PROMPT_CATEGORY_MAX = 16;
export const MAX_COMBOS = 20;
export const COMBO_NAME_MAX = 40;
export const MAX_COMBO_PLATFORMS = 8;
export const MAX_TAGS_PER_PLATFORM = 8;
export const TAG_MAX = 16;
export const TAG_MIN = 1;
export const MAX_TAGGED_KEYS = 64;
/** 同时置顶的提示词上限：置顶是「眼前要用的」，超过 5 个说明该建组合了 */
export const MAX_PINNED_PROMPTS = 5;
/** 主输入框的临时提示词草稿上限（单字段覆盖式保存，不是历史记录） */
export const PROMPT_DRAFT_MAX = PROMPT_CONTENT_MAX;

export const KNOWN_PLATFORM_IDS: readonly PlatformId[] = [
  'openai',
  'deepseek',
  'gemini',
  'qwen',
  'kimi',
  'zhipu',
  'doubao',
  'grok',
];

/**
 * 平台 id 的形态白名单：合法的 id 一律是小写字母开头、
 * 只含小写字母/数字/下划线/连字符、长度 ≤ 32。
 * 用于 combos 与 customTags 的「结构保留」：形态合法即保留，
 * 是否真的存在于当前平台列表，由渲染层过滤。
 */
export const PLATFORM_ID_PATTERN = /^[a-z][a-z0-9_-]{0,31}$/;

/** 提示词 / 组合 的 id 形态（createId 生成，形如 prm_xxx / cmb_xxx） */
export const ENTITY_ID_PATTERN = /^[a-z]{1,8}_[a-z0-9_-]{1,64}$/;

export type OpenMode = 'single' | 'multi';

export interface RecentEntry {
  platformId: PlatformId;
  /** 上次打开时间（epoch ms） */
  lastOpenedAt: number;
  /** 累计打开次数 */
  openCount: number;
  /** 上次是通过单开还是多开打开的 */
  lastMode: OpenMode;
}

export type PromptSource = 'user' | 'builtin-copy';

export interface Prompt {
  id: string;
  title: string;
  /** 提示词正文，复制到剪贴板的就是它 */
  content: string;
  category: string;
  /** user = 用户自建；builtin-copy = 从内置模板另存的副本（互不影响） */
  source: PromptSource;
  /** source === 'builtin-copy' 时的来源模板 id，仅用于 UI 角标与「已添加」判断 */
  builtinId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface Combo {
  id: string;
  name: string;
  /** 打开顺序即数组顺序；按形态白名单保留，渲染时过滤掉当前不存在的平台 */
  platformIds: string[];
  /** 可选绑定的提示词：打开组合时若它仍存在则复制其正文 */
  promptId: string | null;
  createdAt: number;
}

/** 键是平台 id（形态合法即保留，含暂时下线的平台），值是用户自定义标签 */
export type CustomTags = Record<string, string[]>;

export interface HubSettings {
  showShortcutHints: boolean;
  /** 库里的「当前提示词」：输入框为空时的复制来源 */
  activePromptId: string | null;
  /**
   * 主输入框（提示词输入框）的草稿。
   * 单字段覆盖式保存 —— 刷新不丢，但**不是历史记录**：每次编辑覆盖旧值，
   * 永不追加、永不上传，符合「不记录使用历史内容」的红线。
   */
  promptDraft: string;
  /** 提示词边栏（≥lg docked 面板）是否展开；只在 ≥lg 应用记忆值 */
  promptSidebarOpen: boolean;
  /** 边栏里被收起的分组 id（如 'mine'、'tpl-writing'），展开状态不记忆 */
  promptSidebarCollapsed: string[];
}

/** 边栏分组的合法 id 形态（ASCII，见 PromptSidebar 的分组定义） */
export const SIDEBAR_GROUP_ID_PATTERN = /^[a-z][a-z0-9-]{0,23}$/;
export const MAX_SIDEBAR_COLLAPSED = 16;

/**
 * 边栏「首次进入」的默认收起分组：内置模板库是「找素材」场景，默认收起来更清爽。
 *
 * ⚠️ 这里必须是**唯一真相来源**：早期实现让模板组在组件里另有一套「默认收起」逻辑，
 *    点击时又往 collapsed 列表里加 id —— 收起被表达了两次，模板组于是永远打不开。
 *    现在的规则只有一条：`collapsed` 列表里没有的就是展开的；列表缺失（首访/老备份）
 *    才套用这份默认值。
 */
export const DEFAULT_COLLAPSED_SIDEBAR_GROUPS: readonly string[] = [
  'tpl-writing',
  'tpl-coding',
  'tpl-translate',
  'tpl-summarize',
  'tpl-learning',
  'tpl-other',
];

export interface HubState {
  schemaVersion: number;
  favorites: PlatformId[];
  recents: RecentEntry[];
  prompts: Prompt[];
  combos: Combo[];
  customTags: CustomTags;
  /** 置顶的提示词 id，数组顺序即置顶顺序（最近置顶在前）；上限 MAX_PINNED_PROMPTS */
  pinnedPromptIds: string[];
  settings: HubSettings;
}

export function isPlatformId(value: unknown): value is PlatformId {
  return typeof value === 'string' && (KNOWN_PLATFORM_IDS as readonly string[]).includes(value);
}

export function createEmptyState(): HubState {
  return {
    schemaVersion: SCHEMA_VERSION,
    favorites: [],
    recents: [],
    prompts: [],
    combos: [],
    customTags: {},
    pinnedPromptIds: [],
    settings: {
      showShortcutHints: true,
      activePromptId: null,
      promptDraft: '',
      promptSidebarOpen: false,
      promptSidebarCollapsed: [...DEFAULT_COLLAPSED_SIDEBAR_GROUPS],
    },
  };
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

/* ---------------------------------------------------------------- 清洗 */

function sanitizePrompt(raw: unknown): Prompt | null {
  const record = asRecord(raw);
  if (record === null) return null;

  const id = asString(record.id);
  if (!ENTITY_ID_PATTERN.test(id)) return null;

  const content = truncate(asString(record.content), PROMPT_CONTENT_MAX);
  if (content.trim().length === 0) return null;

  const title = truncate(asString(record.title).trim(), PROMPT_TITLE_MAX);
  const category = truncate(asString(record.category).trim(), PROMPT_CATEGORY_MAX) || '其他';

  const source: PromptSource = record.source === 'builtin-copy' ? 'builtin-copy' : 'user';
  const builtinIdRaw = asString(record.builtinId).trim();

  return {
    id,
    title: title.length > 0 ? title : '未命名提示词',
    content,
    category,
    source,
    builtinId: source === 'builtin-copy' && builtinIdRaw.length > 0 ? truncate(builtinIdRaw, 64) : null,
    createdAt: Math.max(0, asNumber(record.createdAt, 0)),
    updatedAt: Math.max(0, asNumber(record.updatedAt, 0)),
  };
}

function sanitizeCombo(raw: unknown): Combo | null {
  const record = asRecord(raw);
  if (record === null) return null;

  const id = asString(record.id);
  if (!ENTITY_ID_PATTERN.test(id)) return null;

  const idsRaw = Array.isArray(record.platformIds) ? record.platformIds : [];
  const platformIds: string[] = [];
  for (const item of idsRaw) {
    if (typeof item !== 'string') continue;
    if (!PLATFORM_ID_PATTERN.test(item)) continue;
    if (platformIds.includes(item)) continue;
    platformIds.push(item);
    if (platformIds.length >= MAX_COMBO_PLATFORMS) break;
  }
  if (platformIds.length === 0) return null;

  const name = truncate(asString(record.name).trim(), COMBO_NAME_MAX);

  return {
    id,
    name: name.length > 0 ? name : '未命名组合',
    platformIds,
    promptId: ENTITY_ID_PATTERN.test(asString(record.promptId)) ? asString(record.promptId) : null,
    createdAt: Math.max(0, asNumber(record.createdAt, 0)),
  };
}

function sanitizeCustomTags(raw: unknown): CustomTags {
  const source = asRecord(raw);
  const result: CustomTags = {};
  if (source === null) return result;

  let keyCount = 0;
  for (const [key, value] of Object.entries(source)) {
    if (keyCount >= MAX_TAGGED_KEYS) break;
    if (!PLATFORM_ID_PATTERN.test(key)) continue;
    if (!Array.isArray(value)) continue;

    const tags: string[] = [];
    for (const item of value) {
      if (typeof item !== 'string') continue;
      // 与 addCustomTag 一致：超长截断而不是丢弃（部分保留好过整条丢弃）
      const tag = truncate(item.trim(), TAG_MAX);
      if (tag.length < TAG_MIN) continue;
      if (tags.includes(tag)) continue;
      tags.push(tag);
      if (tags.length >= MAX_TAGS_PER_PLATFORM) break;
    }
    // 空数组的键也保留（用户删光了该平台的标签 ≠ 该键不存在，语义等价但少一次迁移）
    result[key] = tags;
    keyCount += 1;
  }

  return result;
}

/** 白名单清洗：任何不认识的内容都丢掉，绝不抛错 */
export function sanitizeState(input: unknown): HubState {
  const raw = asRecord(input);
  if (raw === null) return createEmptyState();

  const favorites: PlatformId[] = [];
  const favoritesRaw = Array.isArray(raw.favorites) ? raw.favorites : [];
  for (const item of favoritesRaw) {
    if (isPlatformId(item) && !favorites.includes(item)) favorites.push(item);
  }

  const recents: RecentEntry[] = [];
  const recentsRaw = Array.isArray(raw.recents) ? raw.recents : [];
  for (const item of recentsRaw) {
    const entry = asRecord(item);
    if (entry === null) continue;
    const platformId = entry.platformId;
    if (!isPlatformId(platformId)) continue;
    if (recents.some((existing) => existing.platformId === platformId)) continue;
    recents.push({
      platformId,
      lastOpenedAt: Math.max(0, asNumber(entry.lastOpenedAt, 0)),
      openCount: Math.max(0, Math.floor(asNumber(entry.openCount, 0))),
      lastMode: entry.lastMode === 'multi' ? 'multi' : 'single',
    });
  }
  recents.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);

  const promptsRaw = Array.isArray(raw.prompts) ? raw.prompts : [];
  const prompts: Prompt[] = [];
  for (const item of promptsRaw) {
    const prompt = sanitizePrompt(item);
    if (prompt === null) continue;
    if (prompts.some((existing) => existing.id === prompt.id)) continue;
    prompts.push(prompt);
    if (prompts.length >= MAX_PROMPTS) break;
  }

  const combosRaw = Array.isArray(raw.combos) ? raw.combos : [];
  const combos: Combo[] = [];
  for (const item of combosRaw) {
    const combo = sanitizeCombo(item);
    if (combo === null) continue;
    if (combos.some((existing) => existing.id === combo.id)) continue;
    combos.push(combo);
    if (combos.length >= MAX_COMBOS) break;
  }

  const customTags = sanitizeCustomTags(raw.customTags);

  const pinnedRaw = Array.isArray(raw.pinnedPromptIds) ? raw.pinnedPromptIds : [];
  const pinnedPromptIds: string[] = [];
  for (const item of pinnedRaw) {
    if (typeof item !== 'string') continue;
    if (!ENTITY_ID_PATTERN.test(item)) continue;
    if (pinnedPromptIds.includes(item)) continue;
    pinnedPromptIds.push(item);
    if (pinnedPromptIds.length >= MAX_PINNED_PROMPTS) break;
  }

  const settingsRaw = asRecord(raw.settings);
  const showShortcutHints = settingsRaw === null ? true : settingsRaw.showShortcutHints !== false;
  const activePromptRaw = settingsRaw === null ? null : settingsRaw.activePromptId;
  const activePromptId =
    typeof activePromptRaw === 'string' && prompts.some((prompt) => prompt.id === activePromptRaw)
      ? activePromptRaw
      : null;
  // 草稿是单字段覆盖式保存：截断到上限，而不是丢弃（部分保留好过整条丢失）
  const promptDraft = truncate(asString(settingsRaw?.promptDraft), PROMPT_DRAFT_MAX);

  const sidebarOpen = settingsRaw?.promptSidebarOpen === true;
  // 字段缺失（首访 / 老备份）→ 套用默认收起集；字段存在 → 完全按用户状态来（空数组 = 全展开）
  const collapsedRaw = Array.isArray(settingsRaw?.promptSidebarCollapsed)
    ? settingsRaw.promptSidebarCollapsed
    : [...DEFAULT_COLLAPSED_SIDEBAR_GROUPS];
  const promptSidebarCollapsed: string[] = [];
  for (const item of collapsedRaw) {
    if (typeof item !== 'string') continue;
    if (!SIDEBAR_GROUP_ID_PATTERN.test(item)) continue;
    if (promptSidebarCollapsed.includes(item)) continue;
    promptSidebarCollapsed.push(item);
    if (promptSidebarCollapsed.length >= MAX_SIDEBAR_COLLAPSED) break;
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    favorites,
    recents: recents.slice(0, MAX_RECENTS),
    prompts,
    combos,
    customTags,
    pinnedPromptIds,
    settings: {
      showShortcutHints,
      activePromptId,
      promptDraft,
      promptSidebarOpen: sidebarOpen,
      promptSidebarCollapsed,
    },
  };
}

/**
 * 迁移表：键是「来源版本」，值是把该版本数据整形成下一版的函数。
 * 迁移只做「加字段 / 改版本号」，清洗统一在最后跑一遍 —— 职责不混。
 */
const MIGRATIONS: Record<number, (raw: Record<string, unknown>) => Record<string, unknown>> = {
  0: (raw) => ({ ...raw, settings: raw.settings ?? { showShortcutHints: true } }),
  1: (raw) => ({
    ...raw,
    schemaVersion: 2,
    prompts: Array.isArray(raw.prompts) ? raw.prompts : [],
    combos: Array.isArray(raw.combos) ? raw.combos : [],
    customTags: raw.customTags ?? {},
    settings: { ...(asRecord(raw.settings) ?? {}), activePromptId: null },
  }),
  2: (raw) => ({
    ...raw,
    schemaVersion: 3,
    pinnedPromptIds: Array.isArray(raw.pinnedPromptIds) ? raw.pinnedPromptIds : [],
    settings: { ...(asRecord(raw.settings) ?? {}), promptDraft: '' },
  }),
};

export function migrateState(input: unknown): HubState {
  let raw = asRecord(input);
  if (raw === null) return createEmptyState();

  let version = Math.floor(asNumber(raw.schemaVersion, 0));

  // 来自更新版本的数据（比如以后降级回滚）：只保留能安全识别的字段，绝不猜测语义
  if (version > SCHEMA_VERSION) return sanitizeState(raw);

  let guard = 0;
  while (version < SCHEMA_VERSION && guard < 16) {
    const step = MIGRATIONS[version];
    if (step === undefined) break;
    raw = step(raw);
    version += 1;
    guard += 1;
  }

  return sanitizeState(raw);
}

export function parseStored(raw: string | null): HubState {
  if (raw === null || raw.length === 0) return createEmptyState();
  try {
    return migrateState(JSON.parse(raw));
  } catch {
    return createEmptyState();
  }
}

export function serializeState(state: HubState): string {
  return JSON.stringify(sanitizeState(state));
}

/* ---------------------------------------------------------------- CRUD */

export function recordOpen(
  state: HubState,
  platformId: PlatformId,
  mode: OpenMode,
  now: number,
): HubState {
  const previous = state.recents.find((entry) => entry.platformId === platformId);
  const next: RecentEntry = {
    platformId,
    lastOpenedAt: now,
    openCount: (previous === undefined ? 0 : previous.openCount) + 1,
    lastMode: mode,
  };
  const rest = state.recents.filter((entry) => entry.platformId !== platformId);
  return { ...state, recents: [next, ...rest].slice(0, MAX_RECENTS) };
}

export function toggleFavorite(state: HubState, platformId: PlatformId): HubState {
  const exists = state.favorites.includes(platformId);
  return {
    ...state,
    favorites: exists
      ? state.favorites.filter((id) => id !== platformId)
      : [...state.favorites, platformId],
  };
}

export function clearRecents(state: HubState): HubState {
  return { ...state, recents: [] };
}

export function removeRecent(state: HubState, platformId: PlatformId): HubState {
  return { ...state, recents: state.recents.filter((entry) => entry.platformId !== platformId) };
}

export function updateSettings(state: HubState, patch: Partial<HubSettings>): HubState {
  return { ...state, settings: { ...state.settings, ...patch } };
}

export function totalOpenCount(state: HubState): number {
  return state.recents.reduce((sum, entry) => sum + entry.openCount, 0);
}

/** 新建或更新提示词：已存在则替换正文并刷新 updatedAt；新建置顶并受 MAX_PROMPTS 约束 */
export function upsertPrompt(state: HubState, prompt: Prompt, now: number): HubState {
  const existing = state.prompts.find((item) => item.id === prompt.id);
  if (existing !== undefined) {
    return {
      ...state,
      prompts: state.prompts.map((item) =>
        item.id === prompt.id ? { ...prompt, createdAt: item.createdAt, updatedAt: now } : item,
      ),
    };
  }
  return { ...state, prompts: [prompt, ...state.prompts].slice(0, MAX_PROMPTS) };
}

/** 删除提示词；「当前提示词」指向它时一并清空；置顶状态同步清理（组合里的引用保留，渲染判空） */
export function deletePrompt(state: HubState, promptId: string): HubState {
  const prompts = state.prompts.filter((prompt) => prompt.id !== promptId);
  const withSettings = updateSettings(
    { ...state, prompts },
    state.settings.activePromptId === promptId ? { activePromptId: null } : {},
  );
  return { ...withSettings, pinnedPromptIds: withSettings.pinnedPromptIds.filter((id) => id !== promptId) };
}

/* ---------------------------------------------------------- 置顶与排序 */

export function isPromptPinned(state: HubState, promptId: string): boolean {
  return state.pinnedPromptIds.includes(promptId);
}

/** 置顶：最近置顶的排最前；超过 MAX_PINNED_PROMPTS 时忽略并返回原状态（调用方负责提示） */
export function pinPrompt(state: HubState, promptId: string): HubState {
  if (!ENTITY_ID_PATTERN.test(promptId)) return state;
  if (state.pinnedPromptIds.includes(promptId)) return state;
  if (state.pinnedPromptIds.length >= MAX_PINNED_PROMPTS) return state;
  if (!state.prompts.some((prompt) => prompt.id === promptId)) return state;
  return { ...state, pinnedPromptIds: [promptId, ...state.pinnedPromptIds] };
}

export function unpinPrompt(state: HubState, promptId: string): HubState {
  return { ...state, pinnedPromptIds: state.pinnedPromptIds.filter((id) => id !== promptId) };
}

export function togglePromptPin(state: HubState, promptId: string): HubState {
  return isPromptPinned(state, promptId) ? unpinPrompt(state, promptId) : pinPrompt(state, promptId);
}

/**
 * 提示词展示排序（需求二）：
 *   1. 置顶的在前，置顶之间按「置顶顺序」（最近置顶最靠前 —— 眼前要用的排最上）
 *   2. 其余按创建时间倒序（最新创建的排最前）
 *   3. 创建时间相同的按 id 稳定排序，避免每次渲染顺序抖动
 * 分类筛选仍由 PromptPanel 的分类 tab 承担；不做使用频率排序（那要积累行为数据）。
 */
export function sortPromptsForDisplay(prompts: readonly Prompt[], pinnedIds: readonly string[]): Prompt[] {
  const pinnedIndex = new Map<string, number>();
  pinnedIds.forEach((id, index) => pinnedIndex.set(id, index));
  return prompts
    .slice()
    .sort((a, b) => {
      const aPinned = pinnedIndex.get(a.id);
      const bPinned = pinnedIndex.get(b.id);
      if (aPinned !== undefined && bPinned !== undefined) return aPinned - bPinned;
      if (aPinned !== undefined) return -1;
      if (bPinned !== undefined) return 1;
      if (b.createdAt !== a.createdAt) return b.createdAt - a.createdAt;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
}

export interface ComboInput {
  name: string;
  platformIds: string[];
  promptId: string | null;
}

export function addCombo(
  state: HubState,
  input: ComboInput,
  makeId: (existing: ReadonlySet<string>) => string,
  now: number,
): HubState {
  const existingIds = new Set(state.combos.map((combo) => combo.id));
  const combo: Combo = {
    id: makeId(existingIds),
    name: truncate(input.name.trim(), COMBO_NAME_MAX) || '未命名组合',
    platformIds: input.platformIds.slice(0, MAX_COMBO_PLATFORMS),
    promptId: input.promptId,
    createdAt: now,
  };
  // 置顶；超过上限时挤掉最旧的
  return { ...state, combos: [combo, ...state.combos].slice(0, MAX_COMBOS) };
}

export function renameCombo(state: HubState, comboId: string, name: string): HubState {
  const trimmed = truncate(name.trim(), COMBO_NAME_MAX);
  if (trimmed.length === 0) return state;
  return {
    ...state,
    combos: state.combos.map((combo) =>
      combo.id === comboId ? { ...combo, name: trimmed } : combo,
    ),
  };
}

export function deleteCombo(state: HubState, comboId: string): HubState {
  return { ...state, combos: state.combos.filter((combo) => combo.id !== comboId) };
}

/** 给平台加一个自定义标签；空标签/超长/重复都会被安全忽略 */
export function addCustomTag(state: HubState, platformId: string, rawTag: string): HubState {
  if (!PLATFORM_ID_PATTERN.test(platformId)) return state;
  const tag = truncate(rawTag.trim(), TAG_MAX);
  if (tag.length < TAG_MIN) return state;

  const current = state.customTags[platformId] ?? [];
  if (current.includes(tag)) return state;
  if (current.length >= MAX_TAGS_PER_PLATFORM) return state;

  return {
    ...state,
    customTags: { ...state.customTags, [platformId]: [...current, tag] },
  };
}

export function removeCustomTag(state: HubState, platformId: string, tag: string): HubState {
  const current = state.customTags[platformId];
  if (current === undefined) return state;
  const next = current.filter((item) => item !== tag);
  return { ...state, customTags: { ...state.customTags, [platformId]: next } };
}
