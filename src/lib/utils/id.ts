/**
 * 实体 id 生成（提示词 / 组合）。
 *
 * 为什么不能直接用 crypto.randomUUID：本站按 COOKIE_SECURE=auto 同时服务
 * http://localhost、http://局域网IP 与 https://xxx.ts.net 三种地址，
 * 而 randomUUID 只在 secure context 暴露 —— http 局域网访问时会直接 undefined。
 * 因此这里做回退：优先 randomUUID，否则时间戳 + 随机串，并允许调用方注入
 * 随机源以便单测复现。
 */

export type IdFactory = (existingIds: ReadonlySet<string>) => string;

function defaultRandomBody(): string {
  const globalObject = globalThis as { crypto?: { randomUUID?: () => string } };
  const uuid = globalObject.crypto?.randomUUID?.();
  if (typeof uuid === 'string' && uuid.length > 0) return uuid;
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** 生成形如 `prm_xxx` 的 id；与 existingIds 撞车时自动重试（最多 5 次） */
export function createId(
  prefix: string,
  existingIds: ReadonlySet<string>,
  randomBody: () => string = defaultRandomBody,
): string {
  let last = '';
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const id = `${prefix}_${randomBody()}`;
    last = id;
    if (!existingIds.has(id)) return id;
  }
  return last;
}
