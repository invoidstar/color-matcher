# Color Matcher Guestbook V1.0 — GitHub 登录版（尚未上线）

当前开发分支：feature/guestbook-v1。仅为 Color Matcher 一个网站提供匿名留言。
生产 main 尚未修改，Cloudflare Worker/D1 也尚未由本分支部署。

## 核心功能

- 访客免登录：昵称 1–24 字符、类别、正文 1–500 字符，通过 Turnstile 验证后立即公开。
- 公开分页、最新留言、站长回复。
- 管理员通过 GitHub OAuth 登录；验证固定的 GitHub 数字用户 ID。
- 管理员一键隐藏、恢复、回复、永久删除，手机端可操作。
- 管理员 Session 使用随机 Cookie + D1 保存哈希，8 小时到期，可退出撤销。
- 任何隐藏/回复/删除操作必须使用同源请求和 CSRF Token。
- PUBLIC_ENABLED 默认为 false，未明确启用时访客不可提交；另外只有 GitHub OAuth 管理员登录的必要配置也齐备后才可能开放留言。
- 不再依赖 Cloudflare Zero Trust / Access。

## GitHub OAuth App 注册

GitHub Developer Settings → OAuth Apps → New OAuth App

| 配置 | 内容 |
| --- | --- |
| Application name | Color Matcher Guestbook Admin |
| Homepage URL | https://invoidstar.github.io/color-matcher/ |
| Redirect URL | https://color-matcher-guestbook-api.3518925535.workers.dev/auth/github/callback |
| Allow wildcard matching | 不勾选 |
| Enable Device Flow | 不勾选 |
| Expire user access tokens | 保留勾选即可 |

GitHub 页面显示的 Redirect URL 就是旧称 Authorization callback URL。
本项目只要求读取当前登录用户的 GitHub 数字 ID，不要求仓库访问权限。

注册成功后：
- 公开 Client ID → Worker 变量 GITHUB_CLIENT_ID。
- 私密 Client Secret → Worker Secret GITHUB_CLIENT_SECRET；**不要发送到聊天或 GitHub**。
- 管理员数字 ID → Worker 变量 GITHUB_ADMIN_USER_ID（不是用户名或邮箱）。
- Worker 变量 GITHUB_REDIRECT_URI 已预置正确地址，必须与上面 Redirect URL 完全一致。

## Cloudflare 环境配置（暂时不要部署）

用户已建立 Worker URL：
https://color-matcher-guestbook-api.3518925535.workers.dev

已建立 D1 数据库名称：color-matcher-guestbook，绑定名 DB。
D1 Database ID UUID 已由用户确认：e136a183-92b3-437c-a823-3f548db341c1。
此值是公开部署标识，不属于密钥。

已建立 Turnstile Widget 名称：color-matcher-guestbook。
Turnstile Site Key（公开）已由用户确认：0x4AAAAAAFR_pCEvHTjb0_E1。
仍需仅保存在 Cloudflare 中的私密 Secret。

Worker wrangler.jsonc 的配置项：
- PUBLIC_ENABLED=false（联调期间不要开启）
- ALLOWED_ORIGIN=https://invoidstar.github.io
- TURNSTILE_HOSTNAME=invoidstar.github.io
- TURNSTILE_SITE_KEY=0x4AAAAAAFR_pCEvHTjb0_E1（已配置，公开值）
- GITHUB_CLIENT_ID=Ov23ctbZCJlcKuhDQjU3（已填写，公开 Client ID）
- GITHUB_ADMIN_USER_ID=63053541（已从连接的 GitHub invoidstar 账号核实）
- GITHUB_REDIRECT_URI=https://color-matcher-guestbook-api.3518925535.workers.dev/auth/github/callback
- D1 binding DB、database_name=color-matcher-guestbook、database_id=e136a183-92b3-437c-a823-3f548db341c1（已配置）

Cloudflare Worker Secrets（**切勿提交到仓库**，Wrangler 会在部署时检查这三项已设置）：
- GITHUB_CLIENT_SECRET：GitHub OAuth App 私钥
- TURNSTILE_SECRET：Turnstile 私钥
- RATE_LIMIT_SALT：自生成随机且长期稳定的限流盐，至少 16 字符

## 目录与 API

- src/index.js：公共留言 API / 管理 API
- src/security.js：字段校验、Turnstile Siteverify、匿名限流
- src/github-auth.js：OAuth 流程、管理员 Session、CSRF
- src/admin-ui.js、src/login-ui.js：管理页面和登录样式
- migrations/0001_init.sql：messages 表
- migrations/0002_github_sessions.sql：admin_sessions 表
- tests/guestbook.test.mjs：自动化集成及安全测试

公开接口：GET/POST /api/messages（仅 PUBLIC_ENABLED=true 时开放）。
管理员认证：GET /admin/login、GET /auth/github/start、GET /auth/github/callback。
管理后台：GET /admin/、GET /admin/api/session、GET /admin/api/messages。
管理员变更：PATCH/DELETE /admin/api/messages/:id、POST /admin/api/logout。

GitHub OAuth access_token 只用来读取 /user 的数字 ID，不会保存。
Session Cookie 设置 Secure、HttpOnly、SameSite=Lax；D1 只存储哈希。OAuth 使用 state + PKCE（S256）组合，避免授权码被截获后重用。
状态 state Cookie 阻止 OAuth 登录 CSRF，后台更改操作需要 CSRF header。

## 下一步（尚未执行）

GitHub OAuth 的公开 Client ID 与站长数字 ID **已经配置完毕**，无需重复创建应用。

1. **配置已完成：** 真实 D1 UUID、Turnstile Site Key、GitHub Client ID、GitHub 管理员数字 ID 均已写入 wrangler.jsonc，不需要重复查找。
2. 在 Cloudflare Workers & Pages → color-matcher-guestbook-api → Settings → Variables and Secrets 中将 GITHUB_CLIENT_SECRET、TURNSTILE_SECRET、RATE_LIMIT_SALT 都保存为 **Secret**。不要提交到 GitHub，也不要在聊天中发送。
3. **先只读检查 D1 当前表结构，不要直接执行旧 SQL。** 打开 Cloudflare → D1 → color-matcher-guestbook → Console，依次执行：

       SELECT name FROM sqlite_master WHERE type='table' AND name IN ('messages','admin_sessions');
       PRAGMA table_info(messages);

   如果 messages 表不存在，说明尚未初始化，可以进入下一步。若已存在，请确认有 id、nickname、category、content、status、fingerprint、created_at、updated_at、admin_reply、replied_at 等字段。**特别注意 fingerprint 与 replied_at：旧版示例 SQL 可能没有。** 一旦发现缺少字段或原表有现有数据，先暂停迁移，保留截图或非敏感列名给我分析，不要 DROP/DELETE 表。直接执行 CREATE TABLE IF NOT EXISTS 不会自动补充旧表缺失字段。

4. 在确认表结构兼容或为空之后，从 guestbook-worker 目录受控执行：

       npx wrangler d1 migrations list color-matcher-guestbook --remote
       npx wrangler d1 migrations apply color-matcher-guestbook --remote

   以上操作需要本机 Wrangler 登录 Cloudflare；第二条会按版本依次应用 0001 和 0002。**目前我没有直接操作你的 Cloudflare 账号，也未执行这些命令。**

5. 配置好三个 Secret 后，才单独手动部署 Worker：

       npx wrangler deploy

   部署阶段保持 PUBLIC_ENABLED=false，首先测试 GitHub 登录、隐藏/回复/删除、退出、越权拒绝。Cloudflare 的 required secrets 校验可以防止遗漏环境变量，但不代替真实管理员权限测试。

6. 管理权限实测通过并获得用户明确批准后，再开启匿名提交并把入口合并到 GitHub Pages 主站。

静态部署安全门禁现已完成：`scripts/stage_pages.py` 会将 GitHub Pages 的部署内容复制到 `_site/`，**默认排除**整个 Worker 后端以及留言板页面和前端脚本。即便以后先合并代码，GitHub Pages 也不会自动开放留言入口。只有正式验收通过，单独批准后才能显式采用 `--include-guestbook` 公共打包参数，并添加主站导航。

本分支 GitHub Actions 只运行 Node 测试、SQL 迁移验证和静态产物隔离检查，**不会部署 Worker 或正式 GitHub Pages**。
