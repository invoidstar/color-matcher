# Color Matcher 留言板 V1.0 · 发布与回滚清单

**当前：Release Candidate 已准备，但公众留言未开放。**

- 静态站发布候选分支：`release/guestbook-v1` → 待审 PR → `main`。
- Cloudflare Worker 生产分支：`feature/guestbook-v1`，当前 `PUBLIC_ENABLED=false`。
- 当前 GitHub Pages 使用旧版 `main`，没有留言板入口。
- D1 已登记 `0001_init.sql`、`0002_github_sessions.sql`；`messages` 为 0 条。

## 已完成

- [x] 管理员 GitHub OAuth + D1 会话真实验证，隐藏/恢复/回复/删除及 CSRF 403 真实验收。
- [x] 11 组后端安全测试、隔离 D1 访客投稿及限流、真实 Chromium 官方 Turnstile 测试密钥验收、线上关闭态 13 项检查。
- [x] D1 两张表、三个索引和两份历史迁移登记闭环。
- [x] 页面/导航/公告/本页 PV/UV、Service Worker 绕过访客动态 API 缓存。
- [x] 站点默认打包不能公开留言板；Release Candidate 打包能收齐静态资源且不包含 Worker 或敏感配置。
- [x] 正式 Pages 工作流加入 Worker `/health`、`/api/config` 和公开列表上线门禁（只有后端已启用才会发布）。

## 正式上线前的最后动作（**需要明确发布授权**）

1. **恢复 Build command**：Cloudflare Workers & Pages → Worker → Settings → Builds → Production，将一次性 `node scripts/register-d1-baseline.mjs --register-existing-baseline` 清空成 **None**；Deploy command 保持 `npx wrangler deploy`。
2. **明确批准上线**：站长确认对外开放；检查生产 Secret、Turnstile Site Key 和 GitHub 管理员登录有效。
3. **先开启后端**：批准后将 Cloudflare 监控的 `feature/guestbook-v1` 分支 `wrangler.jsonc` 的 `PUBLIC_ENABLED` 改为 `true`，并同步调整原开发分支 CI 的关闭态检查。等待 Workers Builds 部署后确认 `/health.publicEnabled=true`，`/api/config.enabled=true`，`/api/messages` GET 200。
4. **再合并发布候选 PR**：将 `release/guestbook-v1` 合并到 `main`。Pages 将运行包含 `--include-guestbook` 的打包流程并再次检查 Worker 是否已启用；失败则停止新页面部署，旧 Pages 继续在线。
5. **正式密钥的真人投稿验收**：使用 `https://invoidstar.github.io/color-matcher/guestbook.html` 完成真实 Turnstile、匿名提交、刷新后列表可见、管理员删除测试，最后清理测试记录。检查移动端导航、公告和本页 UV/PV。
6. **收尾**：如无异常，确认公告已显示、Github Pages 和 Worker 稳定，再宣布正式开放。

## 失败回滚

- 若投稿接口异常，优先在 Worker 生产分支恢复 `PUBLIC_ENABLED=false` 并部署，不修改或删除 D1 数据。
- 如果需要撤销前端入口，回滚当次发布 PR 在 `main` 上引入的改动，包括 Pages 健康门禁工作流，使 Pages 可以在 Worker 关闭时恢复旧的工作台静态页面。不要为了回滚删除数据库或管理员会话表。
- 记录出现异常的 Worker / Pages 构建日志。切勿发送 Secret、OAuth 回调 `code`、Session Cookie 或私人 Token。

**发布准备不等于上线许可。** 分支、CI、导航和公告的候选代码已准备；目前不主动合并 PR，也不切换正式公开开关。
