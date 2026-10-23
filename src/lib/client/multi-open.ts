import type { Platform, PlatformId } from '@/data/platforms';

/** 一次「一键多开」的结果，用于向用户如实汇报（绝不谎报成功） */
export interface MultiOpenOutcome {
  at: number;
  /** 本次请求打开的平台（按选择顺序） */
  requested: PlatformId[];
  /** 真的打开了的（浏览器放行） */
  opened: PlatformId[];
  /** 被浏览器拦住、需要用户点链接的 */
  pending: PlatformId[];
}

export function buildMultiOpenOutcome(
  requested: readonly PlatformId[],
  opened: readonly PlatformId[],
  at: number,
): MultiOpenOutcome {
  const openedSet = new Set(opened);
  return {
    at,
    requested: requested.slice(),
    opened: opened.slice(),
    pending: requested.filter((id) => !openedSet.has(id)),
  };
}

/** 复制全部链接使用的文本格式：一行一个「名称 + 地址」，便于粘进任何地方 */
export function linksAsText(platforms: readonly Platform[]): string {
  return platforms.map((platform) => `${platform.name}\t${platform.url}`).join('\n');
}
