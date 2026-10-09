# Color Matcher 留言板 · D1 迁移记录只读核对

> **2026-10-09 已确认的远程状态：** 站长在 Cloudflare D1 Console 提供 `sqlite_master` 查询结果：`messages` 和 `admin_sessions` 共两张业务表、三条业务索引全部存在且与基础迁移定义吻合；**`d1_migrations` 迁移历史表确实不存在**。本次只读审计没有改动正式数据。

## 已完成的远程核对（2026-10-09）

确认存在的对象：

| 对象 | 类型 | 结构核对 |
| --- | --- | --- |
| `messages` | table | 字段、主键、NOT NULL、状态/分类 CHECK、DEFAULT 均与 `0001_init.sql` 一致 |
| `idx_messages_status_created` | index | `messages(status, created_at DESC, id DESC)` |
| `idx_messages_fingerprint_created` | index | `messages(fingerprint, created_at DESC)` |
| `admin_sessions` | table | 字段、主键、NOT NULL、默认创建时间与 `0002_github_sessions.sql` 一致 |
| `idx_admin_sessions_expiry` | index | `admin_sessions(expires_at)` |

已确认 **`d1_migrations` 不存在**：数据库之前在 D1 Console 手工建立，尚未通过 Wrangler 正式登记这两份基础迁移。无需再重复此首轮查询，除非数据库之后发生变更。

**影响：** 当前留言板业务表正常，之前真实管理员登录/读写已经通过；迁移历史缺失本身不会使 API 停用。但下一次使用 Wrangler 应用新的 schema 变更前，应先妥善补齐旧版本登记，避免后续重复执行或混淆历史。不要手工补写版本记录。

## 在 Cloudflare D1 Console 逐条执行（将来需要复核时）

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

2026-10-09 的首轮只读查询已经由站长提供并完成核对；**不用再发送相同结果**。下一步在明确授权、已有备份且可使用可信 Wrangler 环境时再登记迁移历史，并核验 `d1_migrations` 中恰好登记 `0001_init.sql` 和 `0002_github_sessions.sql`。不要提供 Secret、Cookie 或 OAuth 登录参数。
