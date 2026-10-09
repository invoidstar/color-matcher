# Color Matcher 留言板 V1.0 — 访客侧隔离验收记录

日期：2026-10-09

## 范围与界限

- 开发分支：`feature/guestbook-v1`；生产 GitHub Pages 的 `main` 不变。
- Cloudflare Worker 已部署，公开服务仍维持 `PUBLIC_ENABLED=false`。
- 本次使用两种互补测试：
  1. **隔离集成测试**：Cloudflare workerd / Miniflare 运行实际 `src/index.js`；隔离本地 D1 SQLite 执行两份迁移 SQL；只模拟对 Turnstile Siteverify 的返回结果。
  2. **正式线上关闭态黑盒测试**：真实 `workers.dev` 端点，验证公开读取/投稿被拒绝、无会话管理员 API 被拒绝、来源限制生效；不创建生产留言。
- 单独用 Cloudflare 官方 **Turnstile dummy test secret** 向真实 Siteverify API 发起成功/失败请求，不使用生产密钥。
- GitHub OAuth 实际登录、管理员真实读写操作及 CSRF 拒绝由站长在浏览器验证，测试截图已确认。

## 结果

- 原有后端单元/集成安全测试：11/11 通过。
- Workerd + 隔离 D1 访客集成测试：9/9 通过（测试分组）。
  - 合法匿名投稿 HTTP 201 + D1 持久化 + 列表可见；
  - 必填、长度和分类合法性检查；
  - 失败的人机验证、错误 Hostname/Action 拒绝且不插入数据库；
  - 同 IP 重复内容 409、分钟及日配额 429；
  - 隐藏消息过滤、分页、敏感指纹不公开；
  - 跨域限制和前端仅暴露公开 Site Key。
- 官方 Siteverify 测试向量：始终成功和始终失败两种 dummy secret 均返回预期结果。
- 生产关闭态黑盒测试：13/13 通过。
- 一次完整 GitHub Actions 验收记录：
  https://github.com/invoidstar/color-matcher/actions/runs/37909924447

## 真实 Chromium 浏览器受控验收（2026-10-09）

- 测试：`guestbook-worker/tests/visitor-browser.e2e.mjs`，用真实 Chromium 打开原版 `guestbook.html`、加载 Cloudflare 官方 Turnstile **测试 Site Key**，等待小组件回调获得 `XXXX.DUMMY.TOKEN.XXXX` 测试令牌。
- 该令牌通过 Cloudflare 官方 **测试 Secret** 调用真实 Siteverify，返回 `success=true`。注意：官方 dummy Siteverify 返回 `hostname=example.com`、无 `action`；因此仅在隔离测试适配层中补齐本地测试期望的 hostname/action，**生产 Worker 严格校验代码完全没有放宽**。
- Chromium 填写昵称、正文并点击发布；实际 Worker 代码返回成功，独立 Miniflare D1 创建记录，页面立即显示该留言。测试验证记录在 SQLite 中真实存在。
- 测试使用独立 D1 SQL 删除其测试记录，刷新浏览器后确认列表显示空状态。此处的清理是隔离数据库内的 SQL 删除，**不是在同一次脚本里使用真实 GitHub OAuth 管理员删除**；管理员真实隐藏、回复、恢复、删除之前已经由站长在浏览器单独通过。
- 浏览器 API 使用保留测试域名 `https://guestbook-acceptance.invalid`，由 Playwright 严格拦截后交给本地 Worker 运行；不会连接生产 Worker，也没有调用真实生产 D1 或 Secret。
- 浏览器端到端测试、既有后端测试、官方 Turnstile 测试密钥校验及生产关闭态 13 项检测均通过。
- 最新 Chromium 证据：https://github.com/invoidstar/color-matcher/actions/runs/37912711360 ，测试运行附带 `guestbook-visitor-browser` 截图 Artifact（填写/提交成功/清理后）。隔离 Chromium 验收成功不等于生产访客开关已启用。
- 为避免每次推送都安装 Chromium，该浏览器步骤仅在含 `[browser-e2e]` 的提交或明确的手动运行时触发。

## 尚未覆盖（正式上线前门禁）

- **生产 Site Key / Secret 的真人提交闭环**：隔离 Chromium 测试已使用真实浏览器和官方测试密钥验证通路，但仍未调用生产密钥提交真实生产 D1。在正式公开前，如需要强生产验收，应在单独授权的发布窗口执行一次人工操作，并清理其测试数据。
- 重复、限流、分页、非法 Token 与管理员操作已在隔离后端及真实管理员环境分别覆盖；正式真人投稿测试仍需单独批准。不要直接在生产 Worker 上开启匿名发布以替代隔离验收。
- 数据库由站长通过 D1 Console 手工初始化，两张业务表及索引已存在，手工 SQL 与仓库基础迁移语义一致；但 **`d1_migrations` 版本记录仍待远程只读核对**。具体 SQL、情形判断与授权后的登记流程见 [`GUESTBOOK_D1_AUDIT.md`](GUESTBOOK_D1_AUDIT.md)，此时禁止盲目应用远程迁移。
- 部署与上线文案已整理至 [`guestbook-worker/README.md`](../guestbook-worker/README.md) 和 [`GUESTBOOK_RELEASE_COPY.md`](GUESTBOOK_RELEASE_COPY.md)；仍需站长明确发布许可。禁止未经授权切换 `PUBLIC_ENABLED` 或在 `main` 添加公开入口。

## 参考测试与工作流

- `guestbook-worker/tests/guestbook.test.mjs`
- `guestbook-worker/tests/visitor-d1.integration.mjs`
- `guestbook-worker/tests/turnstile-siteverify.smoke.mjs`
- `guestbook-worker/tests/visitor-browser.e2e.mjs`
- `.github/workflows/guestbook-ci.yml`

此文档不包含、也不应包含 GitHub Client Secret、Turnstile Secret、RATE_LIMIT_SALT 或管理员 Session 凭据。
