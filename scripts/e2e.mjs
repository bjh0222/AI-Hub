#!/usr/bin/env node
/**
 * 端到端冒烟测试：真的起一个服务，真的走一遍登录链路。
 *
 * 用法：
 *   1) 另开一个窗口：npm run build && npm start
 *   2) 本窗口：AUTH_TEST_PASSWORD="你的访问密码" npm run test:e2e
 *
 * 它会检查：未登录跳转、错密码、跨站 Origin 拦截、正确密码发 Cookie、
 * 篡改令牌被拒、无 JS 表单提交、登出、开放重定向回落、限流生效、响应头与泄露检查。
 *
 * ⚠️ 它用 `X-Forwarded-For` 伪造一个随机 IP 作为限流桶，因此
 *    - 不会污染你自己的限流记录
 *    - 也不会被你自己刚才的失败次数影响
 *    代价：它假设服务端确实读 X-Forwarded-For（本项目的实现就是这么写的）。
 */

const BASE = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000';
const PASSWORD = process.env.AUTH_TEST_PASSWORD ?? process.argv[2] ?? '';

const results = [];
let failed = 0;

function check(name, condition, detail = '') {
  const ok = Boolean(condition);
  if (!ok) failed += 1;
  results.push(`${ok ? '\u2713' : '\u2717'} ${name}${detail ? `  ${detail}` : ''}`);
}

function randomIp() {
  const rand = () => Math.floor(Math.random() * 200) + 10;
  return `10.${rand()}.${rand()}.${rand()}`;
}

const ipDefault = randomIp();
const ipRateLimit = randomIp();

async function request(path, options = {}) {
  const headers = { ...(options.headers ?? {}), 'x-forwarded-for': options.ip ?? ipDefault };
  const response = await fetch(`${BASE}${path}`, { ...options, headers, redirect: 'manual' });
  const text = await response.text().catch(() => '');
  return { status: response.status, headers: response.headers, text };
}

function cookieFrom(response) {
  const raw = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
  const first = raw[0] ?? response.headers.get('set-cookie') ?? '';
  return first.split(';')[0];
}

/* ---------------------------------------------------------------- 1. 可达性 */
try {
  const login = await request('/login');
  check('GET /login 可达且返回 200', login.status === 200, `实际 ${login.status}`);
  check('登录页含密码输入框', login.text.includes('type="password"'));
  check('响应头没有 X-Powered-By', login.headers.get('x-powered-by') === null);
} catch (error) {
  console.log(`无法连接到 ${BASE} —— 先把服务起起来：npm run build; npm start`);
  console.log(`错误：${error.message}`);
  process.exit(1);
}

/* ------------------------------------------------------- 2. 未登录的访问保护 */
const anonymous = await request('/');
check('未登录访问 / 被重定向到 /login', anonymous.status === 307, `实际 ${anonymous.status}`);
check('重定向目标正确', (anonymous.headers.get('location') ?? '').endsWith('/login'));

/* ------------------------------------------------------------ 3. 登录失败路径 */
const wrongPassword = await request('/api/auth/login', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ password: 'definitely-not-the-password', next: '/' }),
});
check('错密码被拒（401）', wrongPassword.status === 401, `实际 ${wrongPassword.status}`);
check('错密码不泄露细节', wrongPassword.text.includes('"invalid"'));

const crossSite = await request('/api/auth/login', {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
  body: JSON.stringify({ password: 'whatever', next: '/' }),
});
check('跨站 Origin 被拒（403）', crossSite.status === 403, `实际 ${crossSite.status}`);

const malformed = await request('/api/auth/login', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: '{"password": not json',
});
check('坏 JSON 被拒（401 而不是 500）', malformed.status === 401, `实际 ${malformed.status}`);

/* ------------------------------------------------------------ 4. 登录成功路径 */
if (PASSWORD.length === 0) {
  console.log('\n没提供 AUTH_TEST_PASSWORD（或第一个命令行参数），跳过登录成功之后的所有检查。');
  console.log('用法：AUTH_TEST_PASSWORD="你的密码" npm run test:e2e\n');
  for (const line of results) console.log(`  ${line}`);
  console.log(`\n通过 ${results.length - failed} 项，失败 ${failed} 项`);
  process.exitCode = failed > 0 ? 1 : 0;
} else {
  const login = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: PASSWORD, next: '/' }),
  });
  const cookie = cookieFrom(login);
  const setCookieHeader = login.headers.get('set-cookie') ?? '';

  check('正确密码登录成功（200）', login.status === 200, `实际 ${login.status} ${login.text}`);
  check('下发 HttpOnly Cookie', setCookieHeader.toLowerCase().includes('httponly'));
  check('Cookie 是 SameSite=Lax', setCookieHeader.toLowerCase().includes('samesite=lax'));
  check('Cookie 路径为 /', /path=\//i.test(setCookieHeader));
  check('HttpOnly 之外的令牌不出现在响应体', !login.text.includes('aihub_session=v1'));

  /* ---- Secure 属性：按 COOKIE_SECURE 的档位分别验 ---- */
  const secureMode = (process.env.COOKIE_SECURE ?? 'auto').trim().toLowerCase();
  const plainLogin = () =>
    request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: PASSWORD, next: '/' }),
    });
  const proxiedLogin = () =>
    request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-proto': 'https' },
      body: JSON.stringify({ password: PASSWORD, next: '/' }),
    });

  if (secureMode === '0' || secureMode === 'never' || secureMode === 'false') {
    check('COOKIE_SECURE=0：http 请求不下发 Secure', !setCookieHeader.toLowerCase().includes('secure'));
    const proxied = await proxiedLogin();
    check(
      'COOKIE_SECURE=0：即使反代说是 https 也不下发 Secure',
      !(proxied.headers.get('set-cookie') ?? '').toLowerCase().includes('secure'),
    );
  } else if (secureMode === '1' || secureMode === 'always' || secureMode === 'true') {
    check('COOKIE_SECURE=1：始终下发 Secure', setCookieHeader.toLowerCase().includes('secure'));
  } else {
    check('COOKIE_SECURE=auto：http 请求不下发 Secure（http://localhost 也能登录）', !setCookieHeader.toLowerCase().includes('secure'));
    const proxied = await proxiedLogin();
    check(
      'COOKIE_SECURE=auto：X-Forwarded-Proto=https 时下发 Secure（Tailscale Serve 场景）',
      (proxied.headers.get('set-cookie') ?? '').toLowerCase().includes('secure'),
    );
  }

  /* ---- 反代改写 Host 时不应误判为跨站 ---- */
  const forwardedOrigin = await request('/api/auth/login', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://ai-hub.tail1234.ts.net',
      host: '127.0.0.1:3000',
      'x-forwarded-host': 'ai-hub.tail1234.ts.net',
      'x-forwarded-proto': 'https',
    },
    body: JSON.stringify({ password: PASSWORD, next: '/' }),
  });
  check(
    '反代改写 Host 时同源校验仍然放行（X-Forwarded-Host）',
    forwardedOrigin.status === 200,
    `实际 ${forwardedOrigin.status} ${forwardedOrigin.text}`,
  );

  const hub = await request('/', { headers: { cookie } });
  check('带 Cookie 访问首页（200）', hub.status === 200, `实际 ${hub.status}`);
  for (const needle of [
    'AI Hub',
    '全部入口',
    '帮我优化论文结构',
    '搜平台',
    'ChatGPT',
    'DeepSeek',
    'Gemini',
    '通义千问',
    'Kimi',
    '智谱清言',
    '豆包',
    '只做跳转',
    '不记录对话内容',
    '未选提示词',
    '+ 标签',
    'data-brand="qwen"',
    'data-brand="zhipu"',
  ]) {
    check(`首页渲染出「${needle}」`, hub.text.includes(needle));
  }
  check('首页不泄露密码哈希', !hub.text.includes('scrypt:') && !hub.text.includes('scrypt$'));
  check('首页不泄露会话令牌', !hub.text.includes('aihub_session=v1.'));

  // PWA：清单 / Service Worker / 离线页
  const manifestResponse = await request('/manifest.webmanifest');
  check('manifest 返回 200', manifestResponse.status === 200, `实际 ${manifestResponse.status}`);
  check(
    'manifest content-type 正确',
    (manifestResponse.headers.get('content-type') ?? '').includes('application/manifest+json'),
  );
  const manifestBody = JSON.parse(manifestResponse.text);
  check(
    'manifest 字段齐全',
    manifestBody.name === 'AI Hub · 模型导航台' &&
      manifestBody.display === 'standalone' &&
      Array.isArray(manifestBody.icons) &&
      manifestBody.icons.length >= 3,
  );
  const swResponse = await request('/sw.js');
  check('sw.js 返回 200', swResponse.status === 200, `实际 ${swResponse.status}`);
  check('sw.js 是本次实现（含缓存名前缀）', swResponse.text.includes('aihub-static-'));
  const offlineResponse = await request('/offline');
  check('离线页可匿名访问（200）', offlineResponse.status === 200, `实际 ${offlineResponse.status}`);
  check('离线页文案挂载', offlineResponse.text.includes('当前离线'));

  const tampered = await request('/', {
    headers: { cookie: `aihub_session=v1.9999999999.1.${'a'.repeat(64)}` },
  });
  check('篡改令牌被拒（307）', tampered.status === 307, `实际 ${tampered.status}`);

  const expired = await request('/', {
    headers: { cookie: 'aihub_session=v1.1.1.' + 'a'.repeat(64) },
  });
  check('过期令牌被拒（307）', expired.status === 307, `实际 ${expired.status}`);

  const formLogin = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'password=' + encodeURIComponent(PASSWORD) + '&next=%2F',
  });
  check('无 JS 表单提交返回 303', formLogin.status === 303, `实际 ${formLogin.status}`);
  check(
    '表单提交落到站内路径',
    (formLogin.headers.get('location') ?? '').endsWith('/'),
    formLogin.headers.get('location') ?? '',
  );

  const openRedirect = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: PASSWORD, next: '//evil.example/steal' }),
  });
  check('开放重定向被拦（next 回落为 /）', openRedirect.status === 200 && openRedirect.text.includes('"next":"/"'), openRedirect.text);

  const logout = await request('/api/auth/logout', { method: 'POST', headers: { cookie } });
  check('登出返回 303', logout.status === 303, `实际 ${logout.status}`);
  const clearedCookie = cookieFrom(logout);
  const afterLogout = await request('/', { headers: { cookie: clearedCookie } });
  check('登出后首页重新要求登录（307）', afterLogout.status === 307, `实际 ${afterLogout.status}`);

  /* ---------------------------------------------------------------- 限流 */
  const codes = [];
  for (let index = 0; index < 14; index += 1) {
    const attempt = await request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: `wrong-${index}`, next: '/' }),
      ip: ipRateLimit,
    });
    codes.push(attempt.status);
  }
  check('连续错密码最终触发 429', codes.includes(429), `状态码序列 ${codes.join(' ')}`);
  check('前几次失败是 401 而不是直接锁死', codes[0] === 401, `首个状态码 ${codes[0]}`);

  const lockedCorrect = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: PASSWORD, next: '/' }),
    ip: ipRateLimit,
  });
  check('限流期间正确密码也被短暂拒绝（429，且给出重试秒数）', lockedCorrect.status === 429 && /\d+/.test(lockedCorrect.text), lockedCorrect.text);
}

console.log('');
for (const line of results) console.log(`  ${line}`);
console.log(`\n通过 ${results.length - failed} 项，失败 ${failed} 项`);
if (failed > 0) process.exitCode = 1;
