# Color Matcher 留言板 V1.0 — GitHub OAuth 开发记录

当前状态：仅 feature/guestbook-v1，未发布。

已实现：匿名昵称留言、分类、Turnstile Siteverify、限流与重复检测、立即展示、分页、手机 UI；站长 GitHub OAuth 登录、数字用户 ID 白名单、D1 哈希会话、同源 CSRF 检查；隐藏、恢复、回复、永久删除和退出登录。

访问者无需 GitHub，只有站长登录后台。已放弃 Cloudflare Access / Zero Trust 依赖。

GitHub OAuth Redirect URL：
https://color-matcher-guestbook-api.3518925535.workers.dev/auth/github/callback

Worker：color-matcher-guestbook-api，D1 名称：color-matcher-guestbook，DB 绑定：DB。
GitHub OAuth Client ID 已配置为 Ov23ctbZCJlcKuhDQjU3，管理员数字 ID 已核实为 63053541。真实 D1 UUID（e136a183-92b3-437c-a823-3f548db341c1）与 Turnstile Site Key（0x4AAAAAAFR_pCEvHTjb0_E1）均已配置；私密 Secret 仍需由用户在 Cloudflare 控制台添加。
所有 Secret 只能放在 Cloudflare Worker，不能提供给助手或写入 GitHub。

上线保护：PUBLIC_ENABLED=false、无生产主站入口、无 D1 远程迁移、没有 Cloudflare Worker 代码发布、main 未改变。管理员需要先通过真实环境登录、隐藏、删除、未授权拒绝和退出失效测试。测试环境中的 Mock 通过并不等于线上认证已经成功。

部署细节请见 guestbook-worker/README.md。
