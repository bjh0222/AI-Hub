/**
 * 纯函数：搜索匹配。
 * 无任何依赖（类型用结构化接口描述），因此可被 tests/run.mjs 直接导入单测。
 */

export interface SearchablePlatform {
  id: string;
  name: string;
  vendor: string;
  url: string;
  aliases: readonly string[];
  initials: readonly string[];
  tags: readonly string[];
  /** 用户自定义标签（customTags），与内置 tags 一起参与搜索 */
  extraTags?: readonly string[];
}

export function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .replace(/[\u3000]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenize(query: string): string[] {
  const normalized = normalizeText(query);
  if (normalized.length === 0) return [];
  return normalized.split(' ').filter((token) => token.length > 0);
}

export function searchableFields(platform: SearchablePlatform): string[] {
  const raw = [
    platform.name,
    platform.vendor,
    platform.id,
    platform.url,
    ...platform.aliases,
    ...platform.initials,
    ...platform.tags,
    ...(platform.extraTags ?? []),
  ];
  return raw.map(normalizeText).filter((field) => field.length > 0);
}

/** 多关键词 = AND 语义；每个关键词只需命中任意一个字段 */
export function platformMatches(platform: SearchablePlatform, tokens: readonly string[]): boolean {
  if (tokens.length === 0) return true;
  const haystack = searchableFields(platform).join(' \u0000 ');
  return tokens.every((token) => haystack.includes(token));
}

export function searchPlatforms<T extends SearchablePlatform>(
  platforms: readonly T[],
  query: string,
): T[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return platforms.slice();
  return platforms.filter((platform) => platformMatches(platform, tokens));
}
