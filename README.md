# Color Matcher

纯前端 QQ/TQ 480 色自动匹配工具。上传平涂拆件图后，按独立连通区域识别颜色，并使用 CIELAB + CIEDE2000 (ΔE00) 匹配最接近的 QQ/TQ 色号。

- 同色但分离的部件分别显示
- 默认忽略黑 / 白 / 肤色与小区域
- Top 候选 + 480 色手动选择
- 色号列表 / 原图标注 / 色卡连线图
- CSV / PNG 导出
- 全部处理在浏览器本地完成

GitHub Pages 使用 `.github/workflows/deploy-pages.yml` 发布。
