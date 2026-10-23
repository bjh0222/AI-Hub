import { NextResponse } from 'next/server';
import { DEFAULT_COOKIE_NAME, readAuthConfig } from '@/lib/auth/config';
import { shouldUseSecureCookie } from '@/lib/auth/cookie-policy';
import { protocolOf } from '@/lib/utils/url';

export const runtime = 'nodejs';

/**
 * 登出：清掉会话 Cookie 并回到登录页。
 * 客户端用原生 <form method="post"> 提交，因此这里返回 303 跳转而不是 JSON。
 *
 * Secure 策略与登录接口保持一致（同样是 auto/always/never 三档），
 * 否则在某些浏览器上可能出现「删不掉原 Cookie」的怪现象。
 */
export async function POST(request: Request): Promise<NextResponse> {
  const configResult = readAuthConfig();
  const cookieName = configResult.ok ? configResult.config.cookieName : DEFAULT_COOKIE_NAME;
  const secure = configResult.ok
    ? shouldUseSecureCookie(configResult.config.cookieSecureMode, {
        forwardedProto: request.headers.get('x-forwarded-proto'),
        urlProtocol: protocolOf(request.url),
      })
    : true;

  const response = NextResponse.redirect(new URL('/login', request.url), 303);

  response.cookies.set({
    name: cookieName,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: 0,
  });

  return response;
}
