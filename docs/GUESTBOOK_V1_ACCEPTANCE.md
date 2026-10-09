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

## 尚未覆盖（正式上线前门禁）

- **真实网页 + 真实 Turnstile Widget + 生产 Secret 的人工提交闭环**：在公开接口保持关闭时，不能执行成功写入的生产 E2E。因此本次通过的是*隔离端到端业务验收*与生产闭合态检查，不应误称正式生产投稿已验证。
- 正式开放需要受控预发布环境，或明确批准的短时发布窗口。应当用真实浏览器生成单次 Token，验证即时发布、重复提交、错误 Token、分页与管理员隐藏/删除，并清理测试数据；结束后恢复开关。
- 数据库最初由站长在 D1 Console 手工初始化，两张表已经存在。Wrangler 的 `d1_migrations` 元数据是否与 `0001`/`0002` 一致仍待后续只读核对；不要直接执行可能冲突的远程 migration apply。
- 正式开放前必须更新旧部署说明，并取得明确发布许可。禁止在未验收的情况下切换 `PUBLIC_ENABLED` 或在 `main` 添加公开入口。

## 参考测试与工作流

- `guestbook-worker/tests/guestbook.test.mjs`
- `guestbook-worker/tests/visitor-d1.integration.mjs`
- `guestbook-worker/tests/turnstile-siteverify.smoke.mjs`
- `.github/workflows/guestbook-ci.yml`

此文档不包含、也不应包含 GitHub Client Secret、Turnstile Secret、RATE_LIMIT_SALT 或管理员 Session 凭据。
