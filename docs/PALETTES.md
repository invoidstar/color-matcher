# Palette data

内置色卡放在 `data/`。使用 JavaScript 数据文件而不是内联 HTML，可保持 GitHub Pages/no-build 部署，同时让色卡版本独立维护。

## 樱花（480 色）

`data/qqtq-480.js` 定义 `window.PALETTE_RAW`：

```js
[code, [r, g, b]]
```

## 昭（720 色，自然光）

`data/natural-720.js` 定义 `window.PALETTE_720_RAW`：

```js
[code, [r, g, b], alias, page, row, column]
```

应用启动时把这些数据转换为统一 Palette Entry。通过网页导入的自定义色卡存储在浏览器本地和项目文件中，不修改仓库内置数据。


## 亚丽丝（1680 色）

`data/alice-1680.js` 来自用户提供的 12 张“亚丽丝 75D 涤纶绣花线”色卡照片。每张包含 5 行、每行 28 色，共 60 行 × 28 = 1680 色。

为了保证内部唯一性，每个色位都有稳定 ID `AL0001`–`AL1680`。图片中能够高置信识别的厂家印刷色号作为 alias 显示和搜索；低置信或发生冲突的位置保留 AL 编号，避免把错误 OCR 结果当成正式色号。

色值取自每个线穗主体中央区域的稳健中位采样，属于实拍视觉参考值，不等同于标准仪器 Lab 测色。
