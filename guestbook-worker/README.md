# Color Matcher 专用留言板 V1.0 — 尚未上线

仅服务 Color Matcher，不支持多网站共用。**当前只有 feature/guestbook-v1 开发分支中的代码；没有修改 main，也没有部署 Worker / 迁移正式 D1 数据库。**

## 已确认资源与待补充信息

| 配置 | 现有信息 | 当前状态 |
| --- | --- | --- |
| Worker 地址 | https://color-matcher-guestbook-api.3518925535.workers.dev | 用户已创建原始 Worker；未部署留言代码 |
| D1 数据库名称 | color-matcher-guestbook | 用户已创建 |
| D1 Binding | DB | 用户已绑定 |
| D1 Database UUID | 未提供 | wrangler.jsonc 有占位符 |
| Turnstile Widget 名称 | color-matcher-guestbook | 用户已创建 |
| **真正的 Turnstile Site Key** | 未提供 | 需要 Cloudflare 中生成的公开 Key |
| TURNSTILE_SECRET | 私密，不发送到聊天或 GitHub | 后续在 Cloudflare Secret 中设置 |
| Cloudflare Access | 尚未完成 | **正式上线阻塞项** |

用户曾提供的“D1 Database ID”与数据库名称一致，而“Turnstile Site Key”与 Widget 名称一致。这两项**不能视为真实 UUID / Site Key**。因此代码保留了安全占位，不能直接作为生产配置部署。

## 已开发内容

- guestbook.html + css/guestbook.css + js/guestbook.js：与 v4.0 风格一致的匿名留言页，当前主站没有导航入口。
- js/guestbook-config.js：仅公开 Worker URL，不包含密钥。
- guestbook-worker/src/index.js：留言 API、隐藏、恢复、删除、回复、分页。
- guestbook-worker/src/security.js：提交校验、Turnstile Siteverify、HMAC 限流和 JWT 校验。
- guestbook-worker/src/admin-ui.js：仅管理员可访问的手机友好型后台。
- guestbook-worker/migrations/0001_init.sql：版本化 D1 初始表结构。
- guestbook-worker/tests/guestbook.test.mjs：安全与 CRUD 集成测试。
- .github/workflows/guestbook-ci.yml：仅开发分支运行，**不部署**。

## API

| Method | Path | 权限 |
| --- | --- | --- |
| GET | /health | 公开，只返回状态 |
| GET | /api/config | 公开，返回是否开放、公开 Site Key |
| GET | /api/messages?page=1&limit=10 | 开放后显示公开留言 |
| POST | /api/messages | 通过 Turnstile 后立即发布 |
| GET | /admin/ | 验证通过的管理员 |
| GET | /admin/api/messages?status=all&page=1&limit=20 | 验证通过的管理员 |
| PATCH | /admin/api/messages/:id | 隐藏、恢复、保存/清空回复 |
| DELETE | /admin/api/messages/:id | 永久删除当前 D1 记录 |

PATCH JSON 操作示例：{"action":"hide"}、{"action":"restore"} 或 {"action":"reply","reply":"感谢反馈"}。

## 关键安全机制

1. **PUBLIC_ENABLED 默认为 false**。必须显式改为 true 且 D1、Turnstile Site Key、Turnstile Secret、IP 限流盐全部配置，匿名 API 才能开放。
2. Turnstile 必须经过 Worker 服务端 Siteverify，并检查 hostname=invoidstar.github.io 和 action=guestbook_post。
3. Worker 拒绝非 https://invoidstar.github.io 来源的浏览器提交；CORS 不是安全鉴权，另外还有 Turnstile 防刷。
4. 内容用 textContent 渲染，不允许不可信 HTML。
5. 留言频率限制为每来源每分钟 2 次、每天 12 次；仅保存用长随机盐加密散列的 IP 指纹，不保存原始 IP。
6. 管理员每次请求校验 **Cloudflare Access JWT 的 RSA 签名、issuer、aud、exp、email**，Access 未配置时默认拒绝。
7. 删除后的公开读取禁用缓存。永久删除不等于云平台历史备份/Time Travel 立即清除。

## 上线前：你需要操作的部分（此处只是文档，不代表已经执行）

1. 从 Cloudflare D1 数据库页面获取实际 Database ID **UUID**，替换 guestbook-worker/wrangler.jsonc 中的 REPLACE_WITH_D1_DATABASE_UUID。
2. 从 Turnstile Widget 页面复制真正的 **Site Key**，写入 wrangler.jsonc 中的 TURNSTILE_SITE_KEY。它是公开值，不是 Secret。
3. 在 Worker 的私密 Variables / Secrets 中配置：
   - TURNSTILE_SECRET：真实 Secret Key。
   - RATE_LIMIT_SALT：至少 16 位、随机且长期稳定的私密字符串。
   - CF_ACCESS_TEAM_DOMAIN：例如 myteam.cloudflareaccess.com。
   - CF_ACCESS_AUD：管理员 Access 应用的 Audience Tag。
   - ADMIN_EMAIL：唯一允许访问后台的站长邮箱。
4. 创建仅保护 Worker 上 /admin 与 /admin/* 的 Cloudflare Access Self-hosted 应用，只允许管理员邮箱登录。**不要保护整个 Worker**，否则将来普通访客无法匿名留言。后台本身也会验证 JWT，不能只靠隐藏 UI。
5. 如之前曾在 D1 手动执行旧版 messages 表结构，不要直接执行迁移；先检查是否已有不兼容字段。没有表时，从 guestbook-worker 目录运行：
   
       npx wrangler d1 migrations apply color-matcher-guestbook --remote

6. 用户确认后，才手动将代码部署到 Worker：

       npx wrangler deploy

   先保持 PUBLIC_ENABLED=false，完成管理员登录、隐藏、恢复、删除和未授权访问测试后，最后才允许改为 true。
7. 真实联调完成、用户明确批准上线后，才在 Color Matcher 主站加入口并合并开发分支。GitHub Pages 生产部署必须排除 guestbook-worker/ 源码和私有文件。

## 本地/CI 测试

在仓库根目录执行：

    node --test guestbook-worker/tests/*.test.mjs

检查语法：

    node --check guestbook-worker/src/index.js
    node --check guestbook-worker/src/security.js
    node --check guestbook-worker/src/admin-ui.js
    node --check js/guestbook.js

开发分支 CI 还会在内存 SQLite 中运行初始 D1 schema，并检查公开开关关闭、未给主站加留言入口。

**现在不要填写真实 Secrets 到 wrangler.jsonc、.dev.vars 或 GitHub 提交，也不要发送给聊天助手。**
