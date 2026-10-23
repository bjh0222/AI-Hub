/**
 * 客户端持久化层（只在浏览器运行）。
 *
 * 边界纪律：lib/storage/* 只属于客户端，禁止 import lib/auth/*；
 * lib/auth/* 只属于服务端，禁止 import 这里的任何东西。
 *
 * 所有 localStorage 访问都包了 try/catch：隐私模式、禁用存储、
 * 配额写满（QuotaExceededError）都不能让页面崩掉。
 */

import { STORAGE_KEY } from './keys';
import {
  clearRecents as clearRecentsPure,
  createEmptyState,
  parseStored,
  recordOpen as recordOpenPure,
  removeRecent as removeRecentPure,
  serializeState,
  toggleFavorite as toggleFavoritePure,
  updateSettings as updateSettingsPure,
} from './schema';
import type { HubSettings, HubState, OpenMode } from './schema';
import type { PlatformId } from '@/data/platforms';

function getStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function isStorageAvailable(): boolean {
  const storage = getStorage();
  if (storage === null) return false;
  try {
    const probe = `${STORAGE_KEY}:__probe__`;
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

export function loadState(): HubState {
  const storage = getStorage();
  if (storage === null) return createEmptyState();
  try {
    return parseStored(storage.getItem(STORAGE_KEY));
  } catch {
    return createEmptyState();
  }
}

export function saveState(state: HubState): boolean {
  const storage = getStorage();
  if (storage === null) return false;
  try {
    storage.setItem(STORAGE_KEY, serializeState(state));
    return true;
  } catch {
    return false;
  }
}

export function clearAll(): boolean {
  const storage = getStorage();
  if (storage === null) return false;
  try {
    storage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export const storageActions = {
  toggleFavorite: toggleFavoritePure,
  recordOpen: recordOpenPure,
  clearRecents: clearRecentsPure,
  removeRecent: removeRecentPure,
  updateSettings: updateSettingsPure,
};

export type { HubSettings, HubState, OpenMode, PlatformId };

/** 触发浏览器下载一个文本文件（导出备份用） */
export function downloadTextFile(filename: string, text: string): boolean {
  try {
    const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
    return true;
  } catch {
    return false;
  }
}
