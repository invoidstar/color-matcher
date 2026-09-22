# Major update announcements

大版本公告由 `data/announcements.js` 驱动。

## 规则

每次有明显影响用户体验的“大更新”时，在数组最前面增加一条公告，并使用新的唯一 `id`：

```js
{
  id: 'vX.Y-short-name',
  version: 'vX.Y',
  date: 'YYYY-MM-DD',
  title: '更新标题',
  summary: '一句话说明',
  details: ['更新点 1', '更新点 2'],
  link: './some-page.html',
  linkText: '查看'
}
```

新的 `id` 会让用户重新看到一次弹窗。用户关闭公告横幅后，同一条公告不会反复打扰；顶部“公告”按钮仍可随时重新打开最新公告。
