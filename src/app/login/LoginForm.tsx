'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { FormEvent } from 'react';

interface LoginFormProps {
  /** 登录成功后的站内跳转目标（服务端已做过白名单校验） */
  next: string;
  /** 服务端带回来的错误（无 JS 表单提交后回显） */
  initialError?: string;
}

interface LoginResponse {
  ok?: boolean;
  error?: string;
  retryAfterSeconds?: number;
}

export function LoginForm({ next, initialError = '' }: LoginFormProps) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState(initialError);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    setPending(true);
    setError('');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password, next }),
      });
      const data = (await response.json().catch(() => ({}))) as LoginResponse;

      if (response.ok && data.ok === true) {
        router.replace(next);
        router.refresh();
        return;
      }

      if (data.error === 'locked') {
        setError(`尝试次数过多，请等 ${data.retryAfterSeconds ?? 60} 秒再试。`);
      } else if (data.error === 'not_configured') {
        setError('服务端还没配置访问密码，请先看 README 的「首次配置」。');
      } else if (data.error === 'bad_origin') {
        setError('请求来源校验失败，请用同一地址重新打开本页。');
      } else {
        setError('密码不对，请再试一次。');
      }
    } catch {
      setError('请求没发出去，请确认服务还在运行。');
    } finally {
      setPending(false);
    }
  }

  return (
    /* 没有 JS 时，浏览器会直接 POST 到 action，路由处理器返回 303 跳转 —— 功能不退化 */
    <form method="post" action="/api/auth/login" onSubmit={handleSubmit} className="space-y-4">
      <input type="hidden" name="next" value={next} />

      <div>
        <label htmlFor="password" className="mb-1.5 block text-sm text-fg-2">
          访问密码
        </label>
        <input
          id="password"
          name="password"
          type="password"
          className="input"
          placeholder="输入密码后回车"
          autoComplete="current-password"
          autoFocus
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>

      {error.length > 0 ? (
        <p role="alert" aria-live="assertive" className="text-sm text-danger">
          {error}
        </p>
      ) : null}

      <button type="submit" className="btn btn-primary w-full" disabled={pending}>
        {pending ? '正在验证…' : '进入'}
      </button>
    </form>
  );
}
