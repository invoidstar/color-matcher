import {
  HttpError, CATEGORIES, validateMessage, parsePagination, readJson,
  publicReady, fingerprint, verifyTurnstile, requireAdmin
} from './security.js';
import { ADMIN_HTML, ADMIN_CSS, ADMIN_JS } from './admin-ui.js';

// The public API is intentionally disabled unless PUBLIC_ENABLED is explicitly
// set to "true" AND all D1 / Turnstile / rate-limit secrets are configured.
// Administrator endpoints always require a separately verified Access JWT.

function securityHeaders() {
  return {
    'cache-control': 'no-store, max-age=0',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'x-frame-options': 'DENY',
    'vary': 'Origin'
  };
}

function allowedOrigin(request, env) {
  const origin = request.headers.get('origin');
  return Boolean(origin && origin === (env.ALLOWED_ORIGIN || 'https://invoidstar.github.io'));
}

function corsHeaders(request, env) {
  return allowedOrigin(request, env) ? {
    'access-control-allow-origin': request.headers.get('origin'),
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'Content-Type',
    'access-control-max-age': '3600'
  } : {};
}

function json(data, status = 200, request = null, env = null, publicCors = false) {
  const headers = {
    ...securityHeaders(),
    'content-type': 'application/json; charset=utf-8',
    ...(publicCors && request && env ? corsHeaders(request, env) : {})
  };
  return new Response(JSON.stringify(data), { status, headers });
}

function page(what, contentType) {
  const csp = "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; " +
    "script-src 'self'; style-src 'self'; connect-src 'self'";
  return new Response(what, {
    headers: {
      ...securityHeaders(),
      'content-type': contentType,
      'content-security-policy': csp
    }
  });
}

function database(env) {
  if (!env.DB || typeof env.DB.prepare !== 'function') {
    throw new HttpError(503, 'database_unavailable', '数据库尚未配置');
  }
  return env.DB;
}

function assertPublicReady(env) {
  if (!publicReady(env)) {
    throw new HttpError(503, 'guestbook_not_live', '留言板暂未开放');
  }
}

function assertPublicOrigin(request, env) {
  if (!allowedOrigin(request, env)) {
    throw new HttpError(403, 'origin_not_allowed', '不允许的提交来源');
  }
}

async function getPublicMessages(request, env, url) {
  assertPublicReady(env);
  const { page: current, limit, offset } = parsePagination(url);
  const db = database(env);
  const result = await db.prepare(
    "SELECT id, nickname, category, content, admin_reply, created_at, replied_at " +
    "FROM messages WHERE status = 'published' " +
    "ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?"
  ).bind(limit + 1, offset).all();
  const records = result.results || [];
  const hasMore = records.length > limit;
  return json({
    items: records.slice(0, limit),
    page: current, limit, hasMore, nextPage: hasMore ? current + 1 : null
  }, 200, request, env, true);
}

async function postPublicMessage(request, env) {
  assertPublicReady(env);
  assertPublicOrigin(request, env);
  const db = database(env);
  const body = await readJson(request);
  const fields = validateMessage(body);
  const ip = request.headers.get('CF-Connecting-IP');
  const token = body.turnstileToken;
  // Validate the single-use token before any database write.
  await verifyTurnstile(token, ip, env);
  const fp = await fingerprint(ip, env.RATE_LIMIT_SALT);
  const now = Math.floor(Date.now() / 1000);
  const minute = await db.prepare(
    'SELECT COUNT(*) AS count FROM messages WHERE fingerprint = ? AND created_at >= ?'
  ).bind(fp, now - 60).first();
  if (Number(minute?.count || 0) >= 2) {
    throw new HttpError(429, 'too_many_requests', '提交过于频繁，请稍后再试');
  }
  const daily = await db.prepare(
    'SELECT COUNT(*) AS count FROM messages WHERE fingerprint = ? AND created_at >= ?'
  ).bind(fp, now - 86400).first();
  if (Number(daily?.count || 0) >= 12) {
    throw new HttpError(429, 'daily_limit', '今天提交次数已达上限');
  }
  const duplicate = await db.prepare(
    'SELECT id FROM messages WHERE fingerprint = ? AND content = ? AND created_at >= ? LIMIT 1'
  ).bind(fp, fields.content, now - 1800).first();
  if (duplicate) {
    throw new HttpError(409, 'duplicate_message', '相同内容已提交，请勿重复发送');
  }
  const id = crypto.randomUUID();
  await db.prepare(
    'INSERT INTO messages (id, nickname, category, content, status, fingerprint, created_at, updated_at) ' +
    "VALUES (?, ?, ?, ?, 'published', ?, ?, ?)"
  ).bind(id, fields.nickname, fields.category, fields.content, fp, now, now).run();
  return json({
    message: '留言已发布',
    item: {
      id, nickname: fields.nickname, category: fields.category,
      content: fields.content, admin_reply: null, created_at: now, replied_at: null
    }
  }, 201, request, env, true);
}

async function listAdminMessages(request, env, url) {
  const db = database(env);
  const { page: current, limit, offset } = parsePagination(url, 50);
  const filter = url.searchParams.get('status') || 'all';
  if (!['all', 'published', 'hidden'].includes(filter)) {
    throw new HttpError(400, 'invalid_status', '无效的留言筛选状态');
  }
  const select = 'SELECT id, nickname, category, content, status, admin_reply, ' +
    'created_at, updated_at, replied_at FROM messages ';
  const result = filter === 'all'
    ? await db.prepare(select + 'ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?')
      .bind(limit + 1, offset).all()
    : await db.prepare(select + 'WHERE status = ? ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?')
      .bind(filter, limit + 1, offset).all();
  const records = result.results || [];
  const hasMore = records.length > limit;
  return json({
    items: records.slice(0, limit),
    page: current, limit, hasMore, nextPage: hasMore ? current + 1 : null
  });
}

async function updateAdminMessage(request, env, id) {
  const db = database(env);
  const input = await readJson(request, 3000);
  const action = input?.action;
  const now = Math.floor(Date.now() / 1000);
  let result;
  if (action === 'hide') {
    result = await db.prepare(
      "UPDATE messages SET status = 'hidden', updated_at = ? WHERE id = ?"
    ).bind(now, id).run();
  } else if (action === 'restore') {
    result = await db.prepare(
      "UPDATE messages SET status = 'published', updated_at = ? WHERE id = ?"
    ).bind(now, id).run();
  } else if (action === 'reply') {
    if (typeof input.reply !== 'string' ||
        Array.from(input.reply.trim()).length > 500 ||
        /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(input.reply)) {
      throw new HttpError(422, 'invalid_reply', '回复必须为 0–500 个字符的纯文本');
    }
    const reply = input.reply.trim() || null;
    result = await db.prepare(
      'UPDATE messages SET admin_reply = ?, replied_at = ?, updated_at = ? WHERE id = ?'
    ).bind(reply, reply ? now : null, now, id).run();
  } else {
    throw new HttpError(400, 'invalid_action', '不支持的管理操作');
  }
  if (Number(result?.meta?.changes || 0) < 1) {
    throw new HttpError(404, 'message_not_found', '未找到这条留言');
  }
  return json({ ok: true, action, id });
}

async function deleteAdminMessage(env, id) {
  const db = database(env);
  const result = await db.prepare('DELETE FROM messages WHERE id = ?').bind(id).run();
  if (Number(result?.meta?.changes || 0) < 1) {
    throw new HttpError(404, 'message_not_found', '未找到这条留言');
  }
  return json({ ok: true, deleted: id });
}

async function handleAdmin(request, env, url) {
  // Every admin route is protected, including HTML/CSS/JS. The verified
  // signature, AUD, issuer, expiry and email are checked server-side.
  await requireAdmin(request, env);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  if (request.method === 'GET' && (path === '/admin' || path === '/admin/index.html')) {
    return page(ADMIN_HTML, 'text/html; charset=utf-8');
  }
  if (request.method === 'GET' && path === '/admin/app.js') {
    return page(ADMIN_JS, 'text/javascript; charset=utf-8');
  }
  if (request.method === 'GET' && path === '/admin/styles.css') {
    return page(ADMIN_CSS, 'text/css; charset=utf-8');
  }
  const match = path.match(/^\/admin\/api\/messages\/([a-f0-9-]{36})$/i);
  if (request.method === 'GET' && path === '/admin/api/messages') {
    return listAdminMessages(request, env, url);
  }
  if (match && request.method === 'PATCH') {
    return updateAdminMessage(request, env, match[1]);
  }
  if (match && request.method === 'DELETE') {
    return deleteAdminMessage(env, match[1]);
  }
  throw new HttpError(404, 'not_found', '页面不存在');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    try {
      if (path === '/health' && request.method === 'GET') {
        return json({ service: 'color-matcher-guestbook', publicEnabled: publicReady(env) });
      }
      if (path === '/api/config' && request.method === 'GET') {
        const enabled = publicReady(env);
        return json({ enabled, siteKey: enabled ? env.TURNSTILE_SITE_KEY : null,
          maxContentLength: 500, categories: CATEGORIES }, 200, request, env, true);
      }
      if (path === '/api/messages' && request.method === 'OPTIONS') {
        if (!allowedOrigin(request, env)) {
          throw new HttpError(403, 'origin_not_allowed', '不允许的来源');
        }
        return new Response(null, { status: 204, headers: {
          ...securityHeaders(), ...corsHeaders(request, env)
        } });
      }
      if (path === '/api/messages' && request.method === 'GET') {
        return getPublicMessages(request, env, url);
      }
      if (path === '/api/messages' && request.method === 'POST') {
        return postPublicMessage(request, env);
      }
      if (path === '/admin' || path.startsWith('/admin/')) {
        return handleAdmin(request, env, url);
      }
      throw new HttpError(404, 'not_found', '页面不存在');
    } catch (error) {
      if (error instanceof HttpError) {
        return json({ error: error.code, message: error.message }, error.status,
          request, env, path.startsWith('/api/'));
      }
      // Do not leak SQL errors, IP hashes, Access tokens or Turnstile secrets.
      console.error('guestbook internal error:', error?.name || 'unknown');
      return json({ error: 'internal_error', message: '服务暂时不可用，请稍后再试' },
        500, request, env, path.startsWith('/api/'));
    }
  }
};
