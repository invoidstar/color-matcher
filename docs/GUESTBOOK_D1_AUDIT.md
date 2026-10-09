# Color Matcher 留言板 · D1 迁移记录只读核对

> 2026-10-09：`messages`、`admin_sessions` 已由站长在 Cloudflare D1 Console 手工创建并完成真实管理员读写验收；但远程 `d1_migrations` 版本记录**尚未核对**。本文只提供只读查询，不会修改正式数据。

## 在 Cloudflare D1 Console 逐条执行

数据库：`color-matcher-guestbook`。**一次只运行一条 SQL**，并保存非敏感结果。

```sql
SELECT name, type, sql FROM sqlite_master
WHERE name IN (
  'messages', 'admin_sessions', 'd1_migrations',
  'idx_messages_status_created',
  'idx_messages_fingerprint_created',
  'idx_admin_sessions_expiry'
)
ORDER BY type, name;
```

```sql
PRAGMA table_info(messages);
```

```sql
PRAGMA table_info(admin_sessions);
```

```sql
SELECT COUNT(*) AS messages_count FROM messages;
```

如果第一条查询存在 `d1_migrations`，再执行：

```sql
PRAGMA table_info(d1_migrations);
```

```sql
SELECT * FROM d1_migrations ORDER BY id;
```

若 `d1_migrations` 不存在，**不要执行**后两条（会报 no such table），也不要手工创建它。

## 核对标准

- 业务表：`messages`、`admin_sessions` 共 2 张；业务索引 3 个，名称见首条查询。
- 列与约束必须与 `guestbook-worker/migrations/0001_init.sql` 和 `0002_github_sessions.sql` **完全一致**。不仅看列名，还应比对 `sqlite_master.sql` 的 CHECK、DEFAULT 和主键。
- `messages` 需有 `fingerprint`、`replied_at`；`admin_sessions` 需有 `session_hash`、`csrf_token`、`github_user_id`、`expires_at`。
- 如果已经有迁移历史，文件名应为 `0001_init.sql` 与 `0002_github_sessions.sql`；不能简单依据“表存在”推断版本已登记。

## 分支判定

| 查询结果 | 判定 | 后续 |
| --- | --- | --- |
| 业务结构一致，`d1_migrations` 不存在 | 手工建表成功，版本未登记 | 保持现状，等备份、授权 Wrangler 运行环境及站长确认后再登记 |
| `d1_migrations` 中已登记上述两份迁移 | 已登记 | 可只读运行 `migrations list --remote` 确认无遗漏 |
| 版本只登记一份、文件名异常 | 状态不一致 | 暂停应用，核对历史与备份 |
| 表结构、约束或索引与仓库不一致 | 存在 schema drift | 暂停应用，先分析差异 |

## 安全登记说明（当前**不要执行**）

Cloudflare 官方使用 `d1_migrations` 记录 Wrangler 应用历史：https://developers.cloudflare.com/d1/reference/migrations/ 。`migrations apply` 会应用缺失版本并由 Wrangler 记录；其官方命令说明：https://developers.cloudflare.com/d1/wrangler-commands/ 。

仓库两份建表迁移仅使用 `CREATE TABLE IF NOT EXISTS` 与 `CREATE INDEX IF NOT EXISTS`。因此**仅在结构与仓库完全匹配、备份已保存且明确批准后**，可通过受信任的 Wrangler 环境执行：

```sh
cd guestbook-worker
npx wrangler d1 migrations list color-matcher-guestbook --remote
npx wrangler d1 migrations apply color-matcher-guestbook --remote
npx wrangler d1 migrations list color-matcher-guestbook --remote
```

请勿在 Cloudflare SQL Console 输入这些 CLI 命令，也不要执行 `DROP`、`DELETE FROM d1_migrations` 或手工插入历史行。没有 Wrangler 环境就保留为待办，不强制安装 Node.js。

最后请将**第一条 SQL 的表名/建表 SQL 输出**及（如果存在）`d1_migrations` 的记录返回给维护者；不要提供 Secret、Cookie 或 OAuth 登录参数。
