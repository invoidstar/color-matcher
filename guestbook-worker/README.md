# Color Matcher 留言板 V1.0 · Cloudflare Worker / D1 部署说明

> 更新：2026-10-09。**Worker 后端已部署并完成 GitHub OAuth、管理员操作及关闭态安全测试；公众留言尚未开放。**  
> 开发分支：`feature/guestbook-v1`；GitHub Pages 生产 `main` 未接入留言页面；`PUBLIC_ENABLED=false`。

## 当前状态

| 部分 | 当前进度 |
| --- | --- |
| Worker `color-matcher-guestbook-api` | 已由 Cloudflare Builds 从开发分支构建部署 |
| 健康检查 | `/health` 返回 `{"service":"color-matcher-guestbook","publicEnabled":false}` |
| D1 `color-matcher-guestbook` | 两张表及三个业务索引由站长通过 Console 手动创建；真实管理员会话/读写已验证 |
| `d1_migrations` | **2026-10-09 远程核对确认不存在**；业务表与三个索引完整，待备份与授权后由 Wrangler 正式登记两份基础迁移 |
| 三个 Secret | 用户确认已配置在 Cloudflare，仓库不得包含其值 |
| 管理后台 | GitHub OAuth 实际登录、回复/隐藏/恢复/删除与 CSRF 403 已验收 |
| 访客投稿 | 隔离 Chromium + 官方 Turnstile 测试密钥 + 本地 D1 验收通过，**生产仍关闭** |

详细测试记录：`../docs/GUESTBOOK_V1_ACCEPTANCE.md`。发布与回滚步骤：`../docs/GUESTBOOK_V1_RELEASE_CHECKLIST.md`。D1 只读核对：`../docs/GUESTBOOK_D1_AUDIT.md`。上线文案：`../docs/GUESTBOOK_RELEASE_COPY.md`。

## 服务目录

- `src/index.js`：公开留言与管理员 API。
- `src/security.js`：昵称/内容校验、Turnstile Siteverify、限流及防重复。
- `src/github-auth.js`：站长 GitHub OAuth、PKCE、D1 哈希会话与 CSRF。
- `src/admin-ui.js` / `src/login-ui.js`：独立后台与登录页面。
- `migrations/0001_init.sql`、`migrations/0002_github_sessions.sql`：基础 D1 版本文件。
- `tests/`：业务安全、隔离 D1、Cloudflare 测试密钥及 Chromium 验收。

## Cloudflare 环境

Worker 地址：https://color-matcher-guestbook-api.3518925535.workers.dev  
GitHub OAuth callback：https://color-matcher-guestbook-api.3518925535.workers.dev/auth/github/callback

当前 `wrangler.jsonc` 指向 D1 数据库 `color-matcher-guestbook`，绑定名 `DB`。公开配置项为：`PUBLIC_ENABLED=false`、`ALLOWED_ORIGIN=https://invoidstar.github.io`、`TURNSTILE_HOSTNAME=invoidstar.github.io`、`TURNSTILE_SITE_KEY`、`GITHUB_CLIENT_ID`、`GITHUB_ADMIN_USER_ID`、`GITHUB_REDIRECT_URI`。

**敏感信息必须且只能存在于 Cloudflare Worker Secrets：**

- `GITHUB_CLIENT_SECRET`：已创建 GitHub OAuth App 的 Secret。
- `TURNSTILE_SECRET`：生产 Turnstile Widget 的 Secret。
- `RATE_LIMIT_SALT`：至少 16 字符且长期固定的随机盐。

不要在聊天、GitHub、前端脚本、D1 审计输出中透露这些值。OAuth 登录仅核对站长数字用户 ID，不需要仓库授权；访客不用登录。

## 已连通的 GitHub 自动部署

Cloudflare → Workers & Pages → `color-matcher-guestbook-api` → Settings → Builds：

| 设置 | 当前值 |
| --- | --- |
| Repository | `invoidstar/color-matcher` |
| Production branch | `feature/guestbook-v1` |
| Root directory | `guestbook-worker` |
| Build command | 无 |
| Deploy command | `npx wrangler deploy` |

向开发分支推送会触发**独立的 Cloudflare Workers Builds 自动部署**。仓库中的 `.github/workflows/guestbook-ci.yml` 只进行测试，**不是 Worker 部署任务**。正式主站 GitHub Pages 只由 `main` 的工作流发布；当前安全打包默认排除留言页面、前端资源、Worker 代码和迁移 SQL。

**不要**再创建一个 Hello World Worker，也不要反复新建 OAuth App、D1 数据库或 Secret。

## D1 迁移版本的特殊处理

由于这次数据库最初是 D1 Console **手动建表**，不应把“表存在”等同于“Wrangler 已登记迁移”。站长已提供真实远程 `sqlite_master` 查询：两张业务表和三个索引完整，**`d1_migrations` 已登记两份基础迁移**。审计记录在 `../docs/GUESTBOOK_D1_AUDIT.md`。该流程已在 2026-10-09 通过 Wrangler 完成，并由站长在 Console 再次核对迁移历史与留言表清理结果；之前已在隔离 SQLite 确认 `IF NOT EXISTS` 的基础脚本重复执行不会清除现有测试数据。**不要再次运行一次性迁移登记**；未来 schema 变更请新增独立版本。请将此前 Cloudflare Builds 的临时 Build command 清空为 None。

## 可访问的接口

- `GET /health`：检查 Worker 与公开开关（**不等于完整数据库写入测试**）。
- `GET /api/config`：公众配置与是否开放。
- `GET/POST /api/messages`：当前未开放时返回 `503 guestbook_not_live`。
- `GET /admin/login`：站长 GitHub 登录页。
- `GET /admin/`：管理员后台，需要有效会话。
- `GET /admin/api/messages`、`PATCH/DELETE /admin/api/messages/:id`：管理员操作。
- `POST /admin/api/logout`：撤销会话，敏感请求强制检查同源及 CSRF。

Session Cookie 使用 Secure / HttpOnly / SameSite=Lax；D1 仅存哈希，默认 8 小时到期。公开投稿受 Turnstile、重复、分钟与日配额控制。

## 正式发布与回滚（尚未批准执行）

1. 在 D1 核对迁移历史与数据结构；保存备份，确认无未解决的阻断问题。
2. 复核生产 Site Key、Secret、GitHub 管理员登录与生产关闭态测试；正式真人投稿需单独的受控验证授权。
3. 得到站长明确批准后，**同步**修改作为部署真相来源的 `wrangler.jsonc` 公开开关、GitHub Pages 打包及导航，再按顺序进行 Worker、Pages 和公告发布。**仅在 Cloudflare 控制台切换的值可能被下一次仓库部署覆盖。**
4. 发布完成后确认 `/health` 返回 `publicEnabled=true`、公开列表与发布可用、后台可及时删除违规内容。
5. 若上线异常，优先将 Worker 的 `PUBLIC_ENABLED` 恢复为 `false` 并重新部署；必要时撤回主站入口/公告。**不要删除 D1 或清空留言表来回滚。**

文案审校与 CI 通过均不等于已获准公开上线。

## 单分支发布维护

正式上线后，GitHub 保留 `main` 作为唯一长期分支。Cloudflare Workers Builds 的 Production branch 应指向 `main`，Root directory 为 `guestbook-worker`，Build command 留空，Deploy command 为 `npx wrangler deploy`。部署或更新后先查看 Workers Builds 成功记录并核对 `/health`、公开 API，再清理旧开发分支。
