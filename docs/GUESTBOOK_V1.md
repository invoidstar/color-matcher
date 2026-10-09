# Color Matcher 留言板 V1.0 开发规格

状态：**feature/guestbook-v1 开发分支，不公开上线**。

## 用户需求

- 专供 Color Matcher，不做多租户、多网站共用。
- 访客无需登录，填写昵称、分类和 1–500 字正文即可留言。
- 通过 Turnstile 验证后立即发布，不需要站长预审。
- 留言按时间倒序分页；站长可以公开回复。
- 管理员在手机、电脑随时一键隐藏、恢复，或确认后永久删除。
- 仅站长有删除权限，Cloudflare Access 尚未配置完成时必须默认拒绝管理请求。
- 初版不支持图片上传；仅显示纯文本，不执行用户 HTML。
- 后续可以加新留言通知，但本次不建设通知服务。

## 开发文件

- 网站端：guestbook.html、css/guestbook.css、js/guestbook.js、js/guestbook-config.js。
- Worker：guestbook-worker/src/index.js、src/security.js、src/admin-ui.js。
- 数据库：guestbook-worker/migrations/0001_init.sql，单张消息表。
- CI：guestbook-worker/tests/guestbook.test.mjs、.github/workflows/guestbook-ci.yml。
- Worker 地址： https://color-matcher-guestbook-api.3518925535.workers.dev

## 当前防上线设计

- PUBLIC_ENABLED=false；其他私密变量未提交，因此公共发布接口不可能误开启。
- 管理员每次调用都校验 Access JWT RSA 签名、issuer、audience、有效期和管理员邮箱。
- 未获取实际 D1 UUID 和 Turnstile Site Key，只保留明显的占位配置。
- 当前 main 的 index.html、sw.js 与网站导航都不引用留言板页面。
- 此开发分支不触发 GitHub Pages 部署，也未请求 Cloudflare Worker 部署。

## 必须通过的验收

1. PUBLIC_ENABLED=false 时禁止公开写入和读取留言。
2. 缺少 Turnstile Secret 或 Siteverify 失败不能提交。
3. 合法请求 201 后立即进入公开列表。
4. 频率限制、重复提交、错误来源、字段过长等均被拒绝。
5. 未登录/伪造/错误邮箱的请求无法使用管理 API。
6. 站长登录后能隐藏、恢复、回复和永久删除；删除后公开接口立即不再返回内容。
7. 移动端留言表单和管理员后台在触控设备上可用。
8. 真实 Worker + D1 + Turnstile + Access 的环境联调必须在未来进行，现阶段只完成代码与模拟测试。
9. 面向中国大陆访客的 Worker 和 Turnstile 连通性需要实测。

## 下一个阶段

先解决 Cloudflare Access 的具体阻塞问题，并确认真实 Database UUID 和 Turnstile Site Key。Secret 只配置到 Cloudflare。之后部署时先关闭 PUBLIC_ENABLED，完整验证后台权限和删除能力，再由用户决定是否公开上线。
