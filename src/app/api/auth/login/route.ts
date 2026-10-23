import { NextResponse } from 'next/server';
import { authenticatePassword, readAuthConfig, sessionKeyFor } from '@/lib/auth/config';
import { shouldUseSecureCookie } from '@/lib/auth/cookie-policy';
import { MemoryRateLimiter } from '@/lib/auth/rate-limit';
import { signSessionToken } from '@/lib/auth/session';
import { clientKeyFromForwardedFor, isSameOrigin, normalizeNextPath, protocolOf } from '@/lib/utils/url';

export const runtime = 'nodejs';

/**
 * 进程内限流器。重启清零 —— 单人自用足够（技术债台账已记录：
 * 一旦站点暴露到公网，这里要换成共享存储）。
 */
const limiter = new MemoryRateLimiter();

interface LoginPayload {
  password: string;
  next: string;
  /** true = 浏览器原生表单提交（无 JS），需要 303 跳转而不是 JSON */
  isForm: boolean;
}

function textField(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

async function readLoginPayload(request: Request): Promise<LoginPayload> {
  const contentType = (request.headers.get('content-type') ?? '').toLowerCase();

  if (contentType.includes('application/json')) {
    let body: unknown = null;
    try {
      body = await request.json();
    } catch {
      body = null;
    }
    const record = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
    return { password: textField(record.password), next: textField(record.next), isForm: false };
  }

  try {
    const form = await request.formData();
    return {
      password: textField(form.get('password')),
      next: textField(form.get('next')),
      isForm: true,
    };
  } catch {
    return { password: '', next: '', isForm: true };
  }
}

function redirectTo(request: Request, path: string): NextResponse {
  return NextResponse.redirect(new URL(path, request.url), 303);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  const configResult = readAuthConfig();
  if (!configResult.ok) {
    return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 });
  }
  const config = configResult.config;

  // CSRF 第一道闸：跨站表单不会带同源 Origin。
  // 反代（Tailscale Serve / Caddy）可能改写 Host，所以同时看 X-Forwarded-Host。
  if (
    !isSameOrigin(
      request.headers.get('origin'),
      request.headers.get('host'),
      request.headers.get('x-forwarded-host'),
    )
  ) {
    return NextResponse.json({ ok: false, error: 'bad_origin' }, { status: 403 });
  }

  const payload = await readLoginPayload(request);
  const next = normalizeNextPath(payload.next, '/');
  const clientKey = clientKeyFromForwardedFor(request.headers.get('x-forwarded-for'));

  const decision = limiter.check(clientKey, Date.now());
  if (!decision.allowed) {
    if (payload.isForm) {
      return redirectTo(request, `/login?error=locked&next=${encodeURIComponent(next)}`);
    }
    return NextResponse.json(
      { ok: false, error: 'locked', retryAfterSeconds: decision.retryAfterSeconds },
      { status: 429, headers: { 'retry-after': String(decision.retryAfterSeconds) } },
    );
  }

  if (decision.delayMs > 0) await delay(decision.delayMs);

  const password = payload.password;
  const passwordOk = password.length > 0 ? await authenticatePassword(password, config) : false;

  if (!passwordOk) {
    limiter.recordFailure(clientKey, Date.now());
    if (payload.isForm) {
      return redirectTo(request, `/login?error=1&next=${encodeURIComponent(next)}`);
    }
    return NextResponse.json({ ok: false, error: 'invalid' }, { status: 401 });
  }

  limiter.reset(clientKey);

  const token = signSessionToken(sessionKeyFor(config), config.sessionTtlSeconds);
  const response = payload.isForm ? redirectTo(request, next) : NextResponse.json({ ok: true, next });

  response.cookies.set({
    name: config.cookieName,
    value: token,
    httpOnly: true,
    sameSite: 'lax',
    secure: shouldUseSecureCookie(config.cookieSecureMode, {
      forwardedProto: request.headers.get('x-forwarded-proto'),
      urlProtocol: protocolOf(request.url),
    }),
    path: '/',
    maxAge: config.sessionTtlSeconds,
  });

  return response;
}

export function GET(): NextResponse {
  return NextResponse.json({ ok: false, error: 'method_not_allowed' }, { status: 405 });
}
