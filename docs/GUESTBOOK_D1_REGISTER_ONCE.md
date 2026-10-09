# 留言板 V1.0 · D1 基础迁移一次性登记（云端）

> **当前状态：未执行生产 D1 登记。** 用户已授权进行本次版本登记；仍需在 Cloudflare UI 为现有 Builds 配置一次性命令。页面公开开关保持 `PUBLIC_ENABLED=false`。

## 已确认的数据库

- Cloudflare D1：`color-matcher-guestbook`，UUID `e136a183-92b3-437c-a823-3f548db341c1`。
- 现有 `messages`、`admin_sessions` 两张表及 3 个索引与仓库的 `0001_init.sql` / `0002_github_sessions.sql` 一致。
- 远程 `d1_migrations` 当前不存在（2026-10-09 站长通过 Cloudflare Console 查询确认）。
- 这两份历史脚本只含 `CREATE TABLE/INDEX IF NOT EXISTS`，迁移登记应通过 Wrangler，而不是手写元数据。

## 唯一需要站长在 Cloudflare UI 进行的配置

打开 **Workers & Pages → color-matcher-guestbook-api → Settings → Builds → Production**：

| 项目 | 一次性配置 |
| --- | --- |
| Git repository | `invoidstar/color-matcher`（不变） |
| Production branch | `feature/guestbook-v1`（不变） |
| Root directory | `guestbook-worker`（不变） |
| **Build command** | `node scripts/register-d1-baseline.mjs --register-existing-baseline`（临时） |
| Deploy command | `npx wrangler deploy`（保持不变） |
| Build API token | 必须能编辑这个 D1，同时保留对现有 Worker 的部署权限 |

**权限注意：** Workers Editor 允许部署一个已绑定 D1 的 Worker，但不会自动获得 D1 数据库查询/写入权限。若当前 Build token 只有 Worker 权限，需要在 Cloudflare 创建并选择权限最小化的 token，至少对目标数据库有 **D1 Editor（旧 UI：D1 Edit）**，对现有 Worker 有 Workers Editor。不要在聊天中提供 token 明文。

保存后**不需要**安装本地 Node.js。通知维护者“Build command 已保存”，由维护者在 `feature/guestbook-v1` 推送无代码变动的新提交，触发一次 Cloudflare Workers Builds。

## 自动化脚本执行的步骤

文件：`guestbook-worker/scripts/register-d1-baseline.mjs`。

1. 验证 Worker 名称、D1 名称/UUID、固定的 2 份 SQL 和 `PUBLIC_ENABLED=false`。
2. 使用 **remote D1 SELECT** 读取业务表/索引的 SQL 定义并与仓库迁移逐项比较，存在偏差立即停止。
3. 查询现有业务表记录数；若迁移历史已存在且完整，跳过写操作。
4. 若迁移历史不存在，先记录 Time Travel 当前 bookmark。
5. 仅执行 `npx wrangler d1 migrations apply color-matcher-guestbook --remote`，让官方 Wrangler 登记版本并生成迁移后的备份。
6. 检查 `d1_migrations` 恰好包含 `0001_init.sql`、`0002_github_sessions.sql`，业务表和索引保持不变，原有留言记录未减少。
7. 如果出现权限不足、无法备份、目标 UUID 错误、结构差异、版本异常等，**在写入前停止**；如果迁移已执行但最终核验失败，则停止部署并人工调查，不要手动清空数据库。

## 结束后必须恢复

- Cloudflare Builds **Build command 改回 `None`（留空）**，Deploy command 保持 `npx wrangler deploy`。
- 在 D1 Console 单独查询 `SELECT name FROM d1_migrations ORDER BY name;` 核实历史。
- 再次检查 `/health` 的 `publicEnabled=false`，管理员登录与已有留言正常。
- **本操作不开放留言板，也不自动合并 `main`。** 正式生产投稿验收和公开发布须单独批准。

官方文档：[D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/) · [D1 Wrangler commands](https://developers.cloudflare.com/d1/wrangler-commands/) · [Workers Builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)。
