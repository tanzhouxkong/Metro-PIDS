# 显示器 3（北京地铁LCD）

本目录为**显示器 3**（北京地铁LCD风格）的入口与页面所在位置：

- **入口**：`display_window.html` → `display-entry.js` → `DisplayWindow.vue`
- **逻辑**：`DisplayWindow.vue` 引用 `../display-1/displayWindowLogic.js` 文件，共用直线/C型布局与状态栏切换功能
- **默认布局**：直线线路图（与display-1相同）
- **共享逻辑**：与显示器1共用 displayWindowLogic.js，支持相同的功能和切换

## 特点
- 尺寸：1900x600（与显示器1相同）
- 风格：北京地铁LCD显示风格
- 左边面板：显示下一站信息和换乘信息
- 右边面板：显示线路图和到站信息
