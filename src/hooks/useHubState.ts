'use client';

import { useCallback, useEffect, useState } from 'react';
import type { PlatformId } from '@/data/platforms';
import { STORAGE_KEY } from '@/lib/storage/keys';
import {
  clearRecents as clearRecentsPure,
  createEmptyState,
  recordOpen,
  removeRecent as removeRecentPure,
  toggleFavorite as toggleFavoritePure,
  updateSettings,
} from '@/lib/storage/schema';
import type { HubSettings, HubState, OpenMode } from '@/lib/storage/schema';
import { clearAll, isStorageAvailable, loadState, saveState } from '@/lib/storage/store';

export interface HubStateApi {
  state: HubState;
  /** 是否已从 localStorage 读取完毕（首帧为 false，避免水合不一致） */
  loaded: boolean;
  storageAvailable: boolean;
  toggleFavorite: (platformId: PlatformId) => void;
  markOpened: (platformId: PlatformId, mode: OpenMode) => void;
  clearRecents: () => void;
  forgetRecent: (platformId: PlatformId) => void;
  setSetting: <K extends keyof HubSettings>(key: K, value: HubSettings[K]) => void;
  /** 应用一个纯函数状态变更（新增功能的 CRUD 都走这里，配合撤销快照） */
  update: (next: (state: HubState) => HubState) => void;
  replaceState: (next: HubState) => void;
  resetAll: () => void;
}

/**
 * localStorage ⇄ React state。
 * 只在 effect 里读 storage，因此服务端渲染与首帧始终是「空状态」，不会水合报错。
 */
export function useHubState(): HubStateApi {
  const [state, setState] = useState<HubState>(() => createEmptyState());
  const [loaded, setLoaded] = useState(false);
  const [storageAvailable, setStorageAvailable] = useState(true);

  useEffect(() => {
    setState(loadState());
    setStorageAvailable(isStorageAvailable());
    setLoaded(true);

    function handleStorage(event: StorageEvent) {
      if (event.key === STORAGE_KEY || event.key === null) setState(loadState());
    }

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  // 只在读取完成之后写回，避免首帧用空状态覆盖已有数据
  useEffect(() => {
    if (!loaded) return;
    saveState(state);
  }, [state, loaded]);

  const toggleFavorite = useCallback((platformId: PlatformId) => {
    setState((previous) => toggleFavoritePure(previous, platformId));
  }, []);

  const markOpened = useCallback((platformId: PlatformId, mode: OpenMode) => {
    setState((previous) => recordOpen(previous, platformId, mode, Date.now()));
  }, []);

  const clearRecents = useCallback(() => {
    setState((previous) => clearRecentsPure(previous));
  }, []);

  const forgetRecent = useCallback((platformId: PlatformId) => {
    setState((previous) => removeRecentPure(previous, platformId));
  }, []);

  const setSetting = useCallback(<K extends keyof HubSettings>(key: K, value: HubSettings[K]) => {
    setState((previous) => {
      const patch: Partial<HubSettings> = {};
      patch[key] = value;
      return updateSettings(previous, patch);
    });
  }, []);

  const update = useCallback((next: (state: HubState) => HubState) => {
    setState((previous) => next(previous));
  }, []);

  const replaceState = useCallback((next: HubState) => {
    setState(next);
  }, []);

  const resetAll = useCallback(() => {
    clearAll();
    setState(createEmptyState());
  }, []);

  return {
    state,
    loaded,
    storageAvailable,
    toggleFavorite,
    markOpened,
    clearRecents,
    forgetRecent,
    setSetting,
    update,
    replaceState,
    resetAll,
  };
}
