/**
 * Node 模块解析钩子（开发期工具，不影响 Next 构建）。
 *
 * 目的：让 Node 能加载 src/** 里「无扩展名的相对导入」（如 `./schema`），
 * 与 Next/webpack 的解析行为保持一致 —— 这样测试与配置体检脚本可以直接引用源码，
 * 不需要为了跑脚本而把源码里的 import 改成带扩展名的写法。
 */

const EXT_CANDIDATES = ['.ts', '.tsx', '/index.ts', '/index.tsx'];

export async function resolve(specifier, context, nextResolve) {
  const isRelative = specifier.startsWith('./') || specifier.startsWith('../');
  const hasExtension = /\.[cm]?[jt]sx?$/.test(specifier);

  if (isRelative && !hasExtension) {
    for (const suffix of EXT_CANDIDATES) {
      try {
        return await nextResolve(`${specifier}${suffix}`, context);
      } catch {
        // 换下一个候选，全部失败则交回默认解析器报错
      }
    }
  }

  return nextResolve(specifier, context);
}
