/**
 * 登录限流（进程内内存实现，纯逻辑部分可单测）。
 *
 * 设计原则（照抄 UX 走查的结论）：
 *   - **绝不永久锁死**：单人自用，把自己锁在门外是最坏结果
 *   - 失败越多延迟越长，但延迟有上限（4 秒），且 5 分钟窗口一过自动清零
 *   - 限流键是客户端 IP：局域网里通常是路由器地址，够用即可
 */

export const RATE_LIMIT_WINDOW_MS = 300000; // 5 分钟
export const RATE_LIMIT_MAX_FAILURES = 12;
export const BASE_DELAY_MS = 400;
export const MAX_DELAY_MS = 4000;

export interface AttemptDecision {
  allowed: boolean;
  delayMs: number;
  failuresInWindow: number;
  retryAfterSeconds: number;
}

export function pruneFailures(timestamps: readonly number[], now: number): number[] {
  return timestamps.filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS).sort((a, b) => a - b);
}

export function progressiveDelayMs(failuresInWindow: number): number {
  if (failuresInWindow <= 2) return 0;
  const exponent = Math.min(failuresInWindow - 3, 4);
  return Math.min(BASE_DELAY_MS * Math.pow(2, exponent), MAX_DELAY_MS);
}

export function evaluateAttempt(timestamps: readonly number[], now: number): AttemptDecision {
  const recent = pruneFailures(timestamps, now);
  const failures = recent.length;

  if (failures >= RATE_LIMIT_MAX_FAILURES) {
    const oldest = recent[0];
    const remainingMs = RATE_LIMIT_WINDOW_MS - (now - oldest);
    return {
      allowed: false,
      delayMs: 0,
      failuresInWindow: failures,
      retryAfterSeconds: Math.max(1, Math.ceil(remainingMs / 1000)),
    };
  }

  return {
    allowed: true,
    delayMs: progressiveDelayMs(failures),
    failuresInWindow: failures,
    retryAfterSeconds: 0,
  };
}

export class MemoryRateLimiter {
  private readonly buckets = new Map<string, number[]>();

  check(key: string, now: number): AttemptDecision {
    const current = pruneFailures(this.buckets.get(key) ?? [], now);
    if (current.length === 0) this.buckets.delete(key);
    else this.buckets.set(key, current);
    return evaluateAttempt(current, now);
  }

  recordFailure(key: string, now: number): number {
    const current = pruneFailures(this.buckets.get(key) ?? [], now);
    current.push(now);
    this.buckets.set(key, current);
    return current.length;
  }

  reset(key: string): void {
    this.buckets.delete(key);
  }

  size(): number {
    return this.buckets.size;
  }
}
