/** 拼接 className，过滤掉 false / undefined / null。 */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter((part): part is string => typeof part === 'string' && part.length > 0).join(' ');
}
