# 显示器 1（主显示器）

本目录为**主显示器**的入口、页面与**显示逻辑**所在位置，显示器 3 共用本目录逻辑：

- **入口**：`display_window.html` → `display-entry.js` → `DisplayWindow.vue`
- **逻辑**：`displayWindowLogic.js` 位于本目录，支持直线/C 型布局与状态栏切换；显示器 3 的 `DisplayWindow.vue` 引用 `../display-1/displayWindowLogic.js`
- **默认布局**：直线线路图（路径为 `/display-1/` 时自动为 linear；`/display-3/` 为 C 型）
- 在状态栏可随时通过「线路图: 直线 / 线路图: C型」按钮切换布局
