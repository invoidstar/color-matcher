import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { Miniflare, createFetchMock } from 'miniflare';

// Run the actual Worker module inside workerd with an isolated D1 SQLite database.
// The ONLY mocked boundary is the outbound Turnstile Siteverify response.
// No production Cloudflare keys, bindings or database are used.
const WORKER_ORIGIN = 'https://color-matcher-guestbook-api.3518925535.workers.dev';
const VISITOR_ORIGIN = 'https://invoidstar.github.io';
const SUCCESS = {
  success: true, hostname: 'invoidstar.github.io', action: 'guestbook_post'
};
const ENTRY = fileURLToPath(new URL('../src/index.js', import.meta.url));
const INIT_SQL = fileURLToPath(new URL('../migrations/0001_init.sql', import.meta.url));
const SESSION_SQL = fileURLToPath(new URL('../migrations/0002_github_sessions.sql', import.meta.url));

test('visitor acceptance: workerd + real local D1 + controlled Siteverify responses', async t => {
  const outbound = createFetchMock();
  outbound.disableNetConnect();
  const siteverify = outbound.get('https://challenges.cloudflare.com');
  const mf = new Miniflare({
    modules: true,
    scriptPath: ENTRY,
    modulesRules: [{ type: 'ESModule', include: ['**/*.js'], fallthrough: true }],
    // Compatible with the workerd version bundled in the CI Miniflare runtime.
    compatibilityDate: '2026-08-06',
    d1Databases: { DB: '00000000-0000-4000-8000-000000000001' },
    bindings: {
      PUBLIC_ENABLED: 'true',
      ALLOWED_ORIGIN: VISITOR_ORIGIN,
      TURNSTILE_HOSTNAME: 'invoidstar.github.io',
      TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
      TURNSTILE_SECRET: 'isolated-test-secret-not-production',
      RATE_LIMIT_SALT: 'visitor-acceptance-test-only-salt-20261009',
      GITHUB_CLIENT_ID: 'Ov23ctbZCJlcKuhDQjU3',
      GITHUB_CLIENT_SECRET: 'isolated-test-github-client-secret-not-real',
      GITHUB_ADMIN_USER_ID: '63053541',
      GITHUB_REDIRECT_URI: WORKER_ORIGIN + '/auth/github/callback'
    },
    fetchMock: outbound
  });
  try {
    const db = await mf.getD1Database('DB');
    // D1.exec splits on newlines; prepare each DDL statement without comments.
    for (const migration of [INIT_SQL, SESSION_SQL]) {
      const sql = readFileSync(migration, 'utf8').split('\n')
        .filter(line => !line.trimStart().startsWith('--')).join('\n');
      for (const statement of sql.split(';').map(x => x.trim()).filter(Boolean)) {
        await db.prepare(statement).run();
      }
    }

    async function req(path, method = 'GET', body, ip = '198.51.100.101', origin = VISITOR_ORIGIN) {
      const headers = { Origin: origin, 'CF-Connecting-IP': ip };
      if (body !== undefined) headers['content-type'] = 'application/json';
      const response = await mf.dispatchFetch(WORKER_ORIGIN + path, {
        method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) })
      });
      const raw = await response.text();
      let payload;
      try { payload = JSON.parse(raw); } catch { payload = raw; }
      return { status: response.status, body: payload, headers: response.headers };
    }
    function mockSiteverify(payload = SUCCESS) {
      siteverify.intercept({
        method: 'POST', path: '/turnstile/v0/siteverify'
      }).reply(200, JSON.stringify(payload));
    }
    const payload = (content, nickname = '访问者') => ({
      nickname, content, category: 'feature',
      turnstileToken: 'XXXX.DUMMY.TOKEN.XXXX'
    });
    async function expectStatus(name, expected, result) {
      assert.equal(result.status, expected, name + ': ' + JSON.stringify(result.body));
      console.log('PASS VISITOR', name, 'HTTP', expected);
      return result;
    }

    await t.test('public config exposes only the dummy site key', async () => {
      const r = await expectStatus('isolated public config', 200, await req('/api/config'));
      assert.equal(r.body.enabled, true);
      assert.equal(r.body.siteKey, '1x00000000000000000000AA');
      assert.equal(JSON.stringify(r.body).includes('isolated-test-secret'), false);
    });
    await t.test('rejects invalid origin and malformed fields without sending challenges', async () => {
      await expectStatus('invalid visitor origin', 403,
        await req('/api/messages', 'POST', payload('origin-rejected'), '198.51.100.2',
          'https://malicious.invalid'));
      await expectStatus('empty text rejected', 422,
        await req('/api/messages', 'POST', payload(''), '198.51.100.2'));
      await expectStatus('too many unicode characters rejected', 422,
        await req('/api/messages', 'POST', payload('猫'.repeat(501)), '198.51.100.2'));
      await expectStatus('unknown category rejected', 422,
        await req('/api/messages', 'POST', { ...payload('category'), category: 'admin' }, '198.51.100.2'));
    });
    await t.test('rejects Turnstile failure, wrong hostname and action; no insert', async () => {
      mockSiteverify({ success: false, 'error-codes': ['invalid-input-response'] });
      await expectStatus('failed challenge', 403,
        await req('/api/messages', 'POST', payload('bad token')));
      mockSiteverify({ success: true, hostname: 'evil.invalid', action: 'guestbook_post' });
      await expectStatus('wrong widget hostname', 403,
        await req('/api/messages', 'POST', payload('bad host')));
      mockSiteverify({ success: true, hostname: 'invoidstar.github.io', action: 'wrong_action' });
      await expectStatus('wrong challenge action', 403,
        await req('/api/messages', 'POST', payload('bad action')));
      const count = await db.prepare('SELECT COUNT(*) AS n FROM messages').first();
      assert.equal(count.n, 0, 'rejected captcha must not create messages');
    });
    await t.test('accepted visitor post persists to real D1 and appears in public list', async () => {
      mockSiteverify();
      const r = await expectStatus('valid anonymous submission', 201,
        await req('/api/messages', 'POST', payload('页面建议 <b>文字标签</b>')));
      assert.equal(r.body.item.nickname, '访问者');
      assert.equal(r.body.item.category, 'feature');
      assert.equal(r.body.item.content, '页面建议 <b>文字标签</b>');
      assert.equal(JSON.stringify(r.body).includes('fingerprint'), false);
      const fromDb = await db.prepare('SELECT status,content,fingerprint FROM messages WHERE id=?')
        .bind(r.body.item.id).first();
      assert.equal(fromDb.status, 'published');
      assert.equal(fromDb.content, r.body.item.content);
      assert.match(fromDb.fingerprint, /^[0-9a-f]{64}$/);
      const list = await expectStatus('latest published visible', 200, await req('/api/messages'));
      assert.ok(list.body.items.some(x => x.id === r.body.item.id));
      assert.equal(JSON.stringify(list.body).includes('fingerprint'), false);
    });
    await t.test('repeated content and minute rate limit', async () => {
      mockSiteverify();
      await expectStatus('same content blocked', 409,
        await req('/api/messages', 'POST', payload('页面建议 <b>文字标签</b>')));
      mockSiteverify();
      await expectStatus('second distinct post', 201,
        await req('/api/messages', 'POST', payload('另一个建议')));
      mockSiteverify();
      await expectStatus('third post in one minute blocked', 429,
        await req('/api/messages', 'POST', payload('第三个建议')));
    });
    await t.test('daily limit counts real D1 rows', async () => {
      const ip = '198.51.100.202';
      mockSiteverify();
      await expectStatus('daily seed', 201,
        await req('/api/messages', 'POST', payload('今天的第一条', '日额度测试'), ip));
      const row = await db.prepare("SELECT fingerprint FROM messages WHERE nickname='日额度测试'")
        .first();
      assert.match(row.fingerprint, /^[a-f0-9]{64}$/);
      const older = Math.floor(Date.now() / 1000) - 120;
      for (let i = 0; i < 11; i++) {
        await db.prepare(
          "INSERT INTO messages (id,nickname,category,content,status,fingerprint,created_at,updated_at) "+
          "VALUES (?,?,?,?,?,?,?,?)"
        ).bind(crypto.randomUUID(), '日额度填充', 'other', 'old-' + i,
          'published', row.fingerprint, older, older).run();
      }
      mockSiteverify();
      const denied = await expectStatus('13th daily post rejected', 429,
        await req('/api/messages', 'POST', payload('超出当天额度'), ip));
      assert.equal(denied.body.error, 'daily_limit');
    });
    await t.test('hidden entries excluded and pagination consistent', async () => {
      const first = await db.prepare(
        "SELECT id FROM messages WHERE content='页面建议 <b>文字标签</b>'"
      ).first();
      await db.prepare("UPDATE messages SET status='hidden' WHERE id=?").bind(first.id).run();
      const r = await expectStatus('hidden messages not public', 200,
        await req('/api/messages?page=1&limit=2'));
      assert.equal(r.body.items.length, 2);
      assert.equal(r.body.page, 1);
      assert.equal(r.body.hasMore, true);
      assert.equal(r.body.nextPage, 2);
      assert.ok(r.body.items.every(x => x.id !== first.id));
      const r2 = await expectStatus('page two follows', 200,
        await req('/api/messages?page=2&limit=2'));
      assert.equal(r2.body.page, 2);
      assert.ok(r2.body.items.every(x => x.id !== first.id));
      await expectStatus('invalid pagination rejected', 400,
        await req('/api/messages?page=0'));
    });
    await t.test('CORS only exposes response to the approved site', async () => {
      const valid = await expectStatus('approved public origin', 200,
        await req('/api/config'));
      assert.equal(valid.headers.get('access-control-allow-origin'), VISITOR_ORIGIN);
      const invalid = await expectStatus('untrusted origin no CORS', 200,
        await req('/api/config', 'GET', undefined, '198.51.100.2', 'https://malicious.invalid'));
      assert.equal(invalid.headers.get('access-control-allow-origin'), null);
    });
    const final = await db.prepare('SELECT COUNT(*) AS n FROM messages').first();
    assert.equal(final.n, 14, 'only accepted and seeded records should be present');
    console.log('PASS VISITOR isolated D1 record count', final.n);
  } finally {
    await mf.dispose();
  }
});
