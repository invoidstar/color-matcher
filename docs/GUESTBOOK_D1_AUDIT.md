# Color Matcher 留言板 V1.0 · D1 审计与迁移结案

**状态：2026-10-09 已完成。** 目标数据库 `color-matcher-guestbook`。

用户在 Cloudflare D1 Console 核对两张业务表 `messages`、`admin_sessions`，三个索引 `idx_messages_status_created`、`idx_messages_fingerprint_created`、`idx_admin_sessions_expiry`，字段、约束和索引定义与仓库 `0001_init.sql`、`0002_github_sessions.sql` 一致。

数据库起初在 Console 手工创建，缺少 `d1_migrations`；随后经站长授权由 Cloudflare Builds 执行 Wrangler 迁移登记。用户再次查询：

```sql
SELECT name FROM d1_migrations ORDER BY name;
```

返回：

```text
0001_init.sql
0002_github_sessions.sql
```

`SELECT COUNT(*) AS message_count FROM messages;` 返回 **0**，符合验收测试清理后的数据库状态。

## 今后维护

- **无需重新建表或登记旧版本**，不要手动插入、删除 `d1_migrations`。
- 以后结构变化应新增 `0003_*.sql` 等新迁移，不要改动已登记的 `0001` / `0002`。
- 执行新的远程迁移前先核对目标 D1、查看待应用列表并保存备份；失败时停止操作、保存日志，不通过清空表回滚。
- 迁移完成与公开留言是两件事：当前 `PUBLIC_ENABLED=false`，正式发布须另行审批。

见 [发布及回滚清单](GUESTBOOK_V1_RELEASE_CHECKLIST.md)。
