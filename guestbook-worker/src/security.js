// Color Matcher guestbook V1: validation and Turnstile protection.
export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const CATEGORIES = Object.freeze({
  experience: '使用体验',
  bug: '问题反馈',
  feature: '功能建议',
  other: '其他'
});

export function validateMessage(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new HttpError(400, 'invalid_body', '请求内容无效');
  }
  if (typeof input.nickname !== 'string' || typeof input.content !== 'string' ||
      typeof input.category !== 'string') {
    throw new HttpError(422, 'invalid_fields', '昵称、分类和留言内容均为必填项');
  }
  const nickname = input.nickname.replace(/\s+/g, ' ').trim();
  const content = input.content.replace(/\r\n?/g, '\n').trim();
  const category = input.category;
  const nicknameLength = Array.from(nickname).length;
  const contentLength = Array.from(content).length;
  if (nicknameLength < 1 || nicknameLength > 24) {
    throw new HttpError(422, 'nickname_length', '昵称需为 1–24 个字符');
  }
  if (contentLength < 1 || contentLength > 500) {
    throw new HttpError(422, 'content_length', '留言内容需为 1–500 个字符');
  }
  if (!Object.hasOwn(CATEGORIES, category)) {
    throw new HttpError(422, 'invalid_category', '请选择有效的留言类型');
  }
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(nickname + content)) {
    throw new HttpError(422, 'control_characters', '留言包含不支持的控制字符');
  }
  return { nickname, category, content };
}

export function parsePagination(url, maxLimit = 20) {
  const pageRaw = url.searchParams.get('page') || '1';
  const limitRaw = url.searchParams.get('limit') || '10';
  if (!/^\d{1,5}$/.test(pageRaw) || !/^\d{1,2}$/.test(limitRaw)) {
    throw new HttpError(400, 'invalid_pagination', '分页参数无效');
  }
  const page = Number(pageRaw);
  const limit = Number(limitRaw);
  if (page < 1 || page > 1000 || limit < 1 || limit > maxLimit) {
    throw new HttpError(400, 'invalid_pagination', '分页参数超出范围');
  }
  return { page, limit, offset: (page - 1) * limit };
}

export async function readJson(request, maxBytes = 4096) {
  if (!/application\/json/i.test(request.headers.get('content-type') || '')) {
    throw new HttpError(415, 'unsupported_media_type', '请使用 JSON 格式提交');
  }
  const hintedSize = Number(request.headers.get('content-length') || '0');
  if (hintedSize > maxBytes) {
    throw new HttpError(413, 'body_too_large', '提交内容过大');
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > maxBytes) {
    throw new HttpError(413, 'body_too_large', '提交内容过大');
  }
  try { return JSON.parse(raw); }
  catch { throw new HttpError(400, 'invalid_json', '无法识别请求内容'); }
}

export function publicReady(env) {
  return env.PUBLIC_ENABLED === 'true' && Boolean(
    env.DB && env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET &&
    env.TURNSTILE_HOSTNAME && env.RATE_LIMIT_SALT &&
    String(env.RATE_LIMIT_SALT).length >= 16
  );
}

export async function fingerprint(ip, salt) {
  if (!ip || !salt || String(salt).length < 16) {
    throw new HttpError(503, 'rate_limit_unavailable', '留言服务暂不可用');
  }
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(salt),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(ip));
  return Array.from(new Uint8Array(signature), b => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyTurnstile(token, ip, env) {
  if (!env.TURNSTILE_SECRET || !env.TURNSTILE_HOSTNAME) {
    throw new HttpError(503, 'captcha_unavailable', '人机验证暂不可用');
  }
  if (typeof token !== 'string' || token.length < 1 || token.length > 2048) {
    throw new HttpError(422, 'captcha_required', '请完成人机验证');
  }
  let result;
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ secret: env.TURNSTILE_SECRET, response: token, remoteip: ip }),
      signal: AbortSignal.timeout(6000)
    });
    if (!response.ok) throw new Error('siteverify_unavailable');
    result = await response.json();
  } catch {
    throw new HttpError(503, 'captcha_network', '人机验证服务繁忙，请稍后重试');
  }
  if (!result || result.success !== true ||
      result.hostname !== env.TURNSTILE_HOSTNAME ||
      result.action !== 'guestbook_post') {
    throw new HttpError(403, 'captcha_failed', '人机验证未通过，请重新验证');
  }
}

