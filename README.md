# Plush Color Matcher

面向毛绒娃娃设计与制作的纯前端配色工作台。项目部署在 GitHub Pages，图片、项目与色卡处理默认在浏览器本地完成。

## 当前版本：v3.2

本次版本不改变 V3.0 的核心工作流，重点是把原先集中在一个 `index.html` 中的代码和色卡数据拆成可维护的静态工程结构。

### 目录

```text
color-matcher/
├── index.html
├── manifest.webmanifest
├── sw.js
├── icon.svg
├── css/
│   ├── base.css
│   ├── theme.css
│   └── features.css
├── js/
│   ├── app.js
│   └── core/
│       └── color.js
├── data/
│   ├── qqtq-480.js
│   └── natural-720.js
├── docs/
│   ├── ARCHITECTURE.md
│   └── PALETTES.md
└── .github/workflows/
    └── deploy-pages.yml
```

## 现有功能

- Main Region + Detail Region 层级区域识别
- 点击补区域、画笔、橡皮、多选合并、画线拆分
- 重复 / 对称部件联动
- 多张拆件图项目
- `.plushcolor.json` 项目保存 / 恢复与 IndexedDB 自动保存
- 果黑（480 色）+ 昭（720 色，自然光）
- 自定义色卡导入 / 导出 / 校准
- CIELAB + CIEDE2000 色差匹配
- 匹配可信度 / 风险提示
- 跨色卡比较
- 配色预览、A/B 方案
- BOM、用色统计、限色优化
- 标注图 / 色卡连线图 / 打印制作单
- PWA / 离线缓存

## 本地运行

不需要安装依赖。在仓库目录运行任意静态服务器，例如：

```bash
python -m http.server 8000
```

然后打开 `http://localhost:8000/`。

## 部署

推送到 `main` 后，GitHub Actions 会校验 HTML/JavaScript 和关键静态资源，并自动部署 GitHub Pages。

在线地址：https://invoidstar.github.io/color-matcher/

完整使用说明见 [`docs/USER_GUIDE.md`](docs/USER_GUIDE.md)，结构说明见 `docs/ARCHITECTURE.md`。
