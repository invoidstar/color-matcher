# Color Matcher 留言板 V1.0 · 开发与上线状态

**状态（2026-10-09）：后端已部署、管理员真实验收通过；公众尚未开放。**

- 开发分支：`feature/guestbook-v1`；GitHub Pages `main` 未合并留言板，没有公众入口。
- Worker：`color-matcher-guestbook-api`，已通过 Cloudflare Workers Builds 自动部署；`GET /health` 返回 `publicEnabled=false`。
- D1：`color-matcher-guestbook`，绑定 `DB`；站长已通过 Console 的远程只读查询确认两张业务表及三个索引完整，**`d1_migrations` 已登记 `0001_init.sql` 与 `0002_github_sessions.sql`**，详见 `GUESTBOOK_D1_AUDIT.md`。
- 访客免 GitHub 登录，昵称 1–24 字、正文 1–500 字；Turnstile 通过后立即公开，支持分类、最新留言、分页与站长回复。
- 站长通过 GitHub OAuth 与数字用户 ID 校验登录管理后台，Session 哈希存在 D1；支持隐藏、恢复、回复、永久删除和退出，敏感请求需 CSRF。
- 三个运行时 Secret 已由站长配置在 Cloudflare；绝不写入仓库或对话。
- 正式环境管理员登录、D1 会话与留言管理由站长真实验收；GitHub Actions 完成隔离 Chromium/Turnstile 测试密钥投稿、D1 清理与生产关闭态安全检查。
- **未完成**：真实生产密钥投稿及正式对外发布。当前 `PUBLIC_ENABLED=false`，不要发布“已开放”公告。

独立发布候选分支 `release/guestbook-v1` 已准备好页面导航、公告、PWA 缓存和 Pages 健康门禁，但不包含生产开关修改，未经批准不要合并。

详见：`GUESTBOOK_V1_RELEASE_CHECKLIST.md`（发布清单）、`../guestbook-worker/README.md`（部署）、`GUESTBOOK_V1_ACCEPTANCE.md`（验收）、`GUESTBOOK_D1_AUDIT.md`（只读 D1 审计）、`GUESTBOOK_RELEASE_COPY.md`（上线文案）。

只有获得站长**明确发布许可**后，才开放访客提交、合并/发布 GitHub Pages 入口与上线公告。
