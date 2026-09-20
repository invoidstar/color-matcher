# Architecture

Plush Color Matcher 保持 **无构建步骤（no-build）的静态 GitHub Pages 架构**。V3.1 将原先约 170 KB 的单体 HTML 按职责拆分，降低后续修改和回归成本。

## Runtime entry points

- `index.html`：只保留 DOM 结构和资源引用。
- `css/`：全部样式。
- `js/core/color.js`：可复用颜色数学，包括 RGB → Lab、CIEDE2000、HSV、HEX。
- `js/app.js`：应用状态、区域识别/编辑、项目持久化、BOM、多色卡、A/B 方案及 UI 编排。
- `data/*.js`：内置色卡数据，在 `app.js` 之前加载。
- `sw.js` / `manifest.webmanifest`：PWA 与离线缓存。

## Dependency order

`color.js` → 内置色卡数据 → `app.js`。

项目继续保持无 npm、无 bundler、无后端；普通静态 HTTP Server 即可本地运行。

## CSS layers

- `base.css`：基础布局、通用组件、原始响应式规则。
- `theme.css`：浅紫工作台视觉主题与 Workflow 样式。
- `features.css`：色卡/BOM/项目管理/编辑器/V3 功能样式。

## 修改约束

1. 可复用的颜色数学放入 `js/core/color.js`。
2. 内置色卡只放在 `data/`，不再写入 HTML。
3. 新样式按职责进入对应 CSS 文件，不再使用内联 `<style>`。
4. `index.html` 只维护结构，不写内联脚本。
5. 用户导入的项目/色卡仍保留在浏览器本地，不提交到仓库。
6. 新增大功能时优先形成清晰的子模块边界，而不是继续扩大 HTML。

## 下一步模块化策略

目前 `js/app.js` 仍承担应用编排职责。后续某个子系统发生较大变化时，可逐步拆到 `js/editor/`、`js/project/`、`js/palette/`，通过小型全局模块接口连接；避免一次性重写整个应用。
