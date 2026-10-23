/**
 * 备份导出/导入（纯函数部分；文件读写动作在 store.ts / 组件里）。
 * 导入一律经过 migrateState + sanitizeState，坏数据不会污染现有状态。
 */

import { createEmptyState, migrateState, serializeState } from './schema';
import type { HubState } from './schema';

export interface BackupPayload {
  app: 'ai-hub-nav';
  exportedAt: string;
  schemaVersion: number;
  state: HubState;
}

export function buildBackup(state: HubState, now: number): string {
  const payload: BackupPayload = {
    app: 'ai-hub-nav',
    exportedAt: new Date(now).toISOString(),
    schemaVersion: state.schemaVersion,
    state,
  };
  return JSON.stringify(payload, null, 2);
}

export type ParseBackupResult =
  | { ok: true; state: HubState; favorites: number; recents: number }
  | { ok: false; error: string };

export function parseBackup(text: string): ParseBackupResult {
  if (typeof text !== 'string' || text.trim().length === 0) {
    return { ok: false, error: '文件是空的。' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: '不是合法的 JSON 文件。' };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: '文件结构不对，预期是一个对象。' };
  }

  const record = parsed as Record<string, unknown>;
  const hasWrapper = typeof record.app === 'string' && 'state' in record;
  const candidate = hasWrapper ? record.state : record;

  try {
    const state = migrateState(candidate);
    return { ok: true, state, favorites: state.favorites.length, recents: state.recents.length };
  } catch {
    return { ok: false, error: '文件内容无法识别。' };
  }
}

export function emptyStateForImport(): HubState {
  return createEmptyState();
}

export function stateToText(state: HubState): string {
  return serializeState(state);
}
