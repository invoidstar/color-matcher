# Palette data

内置色卡放在 `data/`。使用独立 JavaScript 数据文件，可保持 GitHub Pages/no-build 部署，同时让不同品牌色卡独立维护。

## 樱花（480 色）

`data/qqtq-480.js` 定义 `window.PALETTE_RAW`：

```js
[code, [r, g, b]]
```

保留 QQ001–QQ360 / TQ361–TQ480 色号体系。

## 涵特（当前 620 个已提供色位）

`data/hanter-620.js` 定义 `window.PALETTE_HANTER_RAW`：

```js
[code, [r, g, b], alias, pageStart, row, column]
```

数据来自本次用户提供的 7 张 **HANTE 120D/2 POLYESTER HIGH SPEED EMBROIDERY THREAD COLOR CARD** 图片。

当前文件实际包含：
- 001–300
- 401–720

因此目前网站中可用的是 **620 个色位**。本次上传包没有提供 301–400 色号页，网站不会虚构这些缺失颜色；之后补充该页即可继续扩展到完整色卡。

色值取每个色块中央区域的稳健中位数，属于图片视觉参考值，不等同于标准仪器 Lab 测色。

## 亚丽丝（1680 色）

`data/alice-1680.js` 来自用户提供的 12 张“亚丽丝 75D 涤纶绣花线”色卡照片。每张包含 5 行、每行 28 色，共 60 行 × 28 = 1680 色。

为了保证内部唯一性，每个色位都有稳定 ID `AL0001`–`AL1680`。图片中能够较高置信识别的厂家印刷色号作为 alias 显示和搜索；低置信或发生冲突的位置保留 AL 编号，避免把错误 OCR 结果当成正式色号。

色值取自每个线穗主体中央区域的稳健中位采样，属于实拍视觉参考值，不等同于标准仪器 Lab 测色。

应用启动时把内置数据转换为统一 Palette Entry。通过网页导入的自定义色卡存储在浏览器本地和项目文件中，不修改仓库内置数据。
