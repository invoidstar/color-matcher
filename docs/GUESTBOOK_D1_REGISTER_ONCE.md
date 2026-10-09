# D1 初始迁移版本登记 · 已完成（历史记录）

**2026-10-09 已结案，请勿再次执行一次性登记脚本。**

此前因两张业务表由 D1 Console 手动创建，迁移元数据不存在。通过 `guestbook-worker/scripts/register-d1-baseline.mjs` 与 Cloudflare Builds 完成受控登记，并由站长复核：

- `0001_init.sql`：已登记；
- `0002_github_sessions.sql`：已登记；
- `messages` 表行数：0（验收数据已清理）。

**唯一需要在 Cloudflare Console 确认的后续动作：** 将 Worker 的 **Settings → Builds → Production → Build command** 从一次性命令恢复为 **None**（留空），保留 Deploy command = `npx wrangler deploy`。

一旦 Cloudflare 配置恢复正常，此文档作为历史审计记录即可。今后按正常版本化迁移维护，勿重跑旧脚本。敏感 Build Token 不要提供给他人；如为此次数据库登记临时创建了额外权限 Token，确认无其他用途后可撤销。 
