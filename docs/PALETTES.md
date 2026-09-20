# Palette data

内置色卡放在 `data/`。使用 JavaScript 数据文件而不是内联 HTML，可保持 GitHub Pages/no-build 部署，同时让色卡版本独立维护。

## QQ/TQ 480

`data/qqtq-480.js` 定义 `window.PALETTE_RAW`：

```js
[code, [r, g, b]]
```

## Natural-light 720

`data/natural-720.js` 定义 `window.PALETTE_720_RAW`：

```js
[code, [r, g, b], alias, page, row, column]
```

应用启动时把这些数据转换为统一 Palette Entry。通过网页导入的自定义色卡存储在浏览器本地和项目文件中，不修改仓库内置数据。
