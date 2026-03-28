import { defineConfig } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import { copyFileSync, existsSync, mkdirSync, cpSync } from 'fs'
import { join } from 'path'

const DEV_SERVER_PORT = Number(process.env.PIDS_DEV_SERVER_PORT || '5180')

// 立即执行：确保 main.js 文件在 electron-vite 检查之前就存在
const outDir = resolve(__dirname, 'out', 'main')
const target = join(outDir, 'main.js')
const source = resolve(__dirname, 'main.js')
const mainModulesSourceDir = resolve(__dirname, 'main')
const mainModulesTargetDir = join(outDir, 'main')
const mainModulesExists = existsSync(mainModulesSourceDir)

if (!existsSync(outDir)) {
  mkdirSync(outDir, { recursive: true })
}

if (existsSync(source)) {
  try {
    copyFileSync(source, target)
    console.log('[electron-vite-config] ✅ Ensured main.js exists at', target)
    if (existsSync(target)) {
      const stat = require('fs').statSync(target)
      console.log('[electron-vite-config] ✅ File verified, size:', stat.size, 'bytes')
    }

    // 同时确保解耦出来的主进程模块目录可在 out/main 运行时被 require
    if (existsSync(mainModulesSourceDir)) {
      cpSync(mainModulesSourceDir, mainModulesTargetDir, { recursive: true, force: true })
      console.log('[electron-vite-config] ✅ Ensured main/ exists at', mainModulesTargetDir)
    }
  } catch (e) {
    console.error('[electron-vite-config] ❌ Failed to copy main.js:', e)
  }
}

// 构建后钩子：确保 main.js 文件存在（用于热重载时更新）
const ensureMainFile = () => {
  const copyMainFile = () => {
    if (!existsSync(outDir)) {
      mkdirSync(outDir, { recursive: true })
    }
    
    if (existsSync(source)) {
      try {
        copyFileSync(source, target)
        console.log('[vite-plugin] ✅ Ensured main.js exists at', target)

        if (existsSync(mainModulesSourceDir)) {
          cpSync(mainModulesSourceDir, mainModulesTargetDir, { recursive: true, force: true })
          console.log('[vite-plugin] ✅ Ensured main/ exists at', mainModulesTargetDir)
        }
      } catch (e) {
        console.error('[vite-plugin] ❌ Failed to copy main.js:', e)
      }
    }
  }
  
  // 延迟复制函数：在下一个事件循环中执行，确保在 electron-vite 检查之前完成
  const copyMainFileDelayed = () => {
    // 立即复制一次
    copyMainFile()
    // 然后在下一个事件循环中再次复制（确保在 electron-vite 检查之前）
    setImmediate(() => {
      copyMainFile()
      // 再延迟一次，确保文件在 electron-vite 启动 Electron 之前存在
      setTimeout(copyMainFile, 50)
    })
  }
  
  return {
    name: 'ensure-main-file',
    configResolved() {
      // 在配置解析后立即复制（比 buildStart 更早）
      copyMainFile()
    },
    buildStart() {
      copyMainFile()
    },
    buildEnd() {
      copyMainFileDelayed()
    },
    closeBundle() {
      copyMainFileDelayed()
    },
    writeBundle() {
      // 在写入完成后立即复制，并使用延迟确保文件存在
      copyMainFileDelayed()
    }
  }
}

// 复制 assets 目录到构建输出的插件
const copyAssets = () => {
  return {
    name: 'copy-assets',
    writeBundle() {
      const assetsSource = resolve(__dirname, 'assets')
      const assetsTarget = resolve(__dirname, 'out/renderer/assets')
      
      if (existsSync(assetsSource)) {
        try {
          if (!existsSync(assetsTarget)) {
            mkdirSync(assetsTarget, { recursive: true })
          }
          cpSync(assetsSource, assetsTarget, { recursive: true })
          console.log('[copy-assets] ✅ Copied assets directory to out/renderer/assets')
        } catch (e) {
          console.error('[copy-assets] ❌ Failed to copy assets:', e)
        }
      }
    }
  }
}

// 复制 i18n 语言包到构建输出，确保打包后应用支持多语言
const copyLocales = () => {
  return {
    name: 'copy-locales',
    writeBundle() {
      const localesSource = resolve(__dirname, 'src/locales')
      const localesTarget = resolve(__dirname, 'out/renderer/locales')
      if (!existsSync(localesSource)) return
      try {
        if (!existsSync(localesTarget)) {
          mkdirSync(localesTarget, { recursive: true })
        }
        cpSync(localesSource, localesTarget, { recursive: true })
        console.log('[copy-locales] ✅ Copied src/locales to out/renderer/locales for i18n')
      } catch (e) {
        console.error('[copy-locales] ❌ Failed to copy locales:', e)
      }
    }
  }
}

export default defineConfig({
  // 主进程配置 - 支持热重启 🔥
  main: {
    plugins: [ensureMainFile()],
    build: {
      outDir: 'out/main',
      emptyOutDir: false,
      externalizeDeps: true, // electron-vite 5.0+ 使用配置项替代插件
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'main.js')
        },
        output: {
          entryFileNames: 'main.js',
          format: 'cjs' // CommonJS 格式（Node.js/Electron 主进程）
        }
      }
    },
    // ESBuild 配置：确保主进程 ES6+ 代码被正确转译
    esbuild: {
      target: 'node18', // Electron 32 基于 Node.js 18+，使用 node18 目标
      // 移除 console 和 debugger（生产环境）
      drop: process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : [],
      // 启用 tree-shaking
      treeShaking: true,
      // 保持 CommonJS 格式
      format: 'cjs'
    }
  },

  // 预加载脚本配置 - 支持热重载 🔄
  preload: {
    build: {
      outDir: 'out/main',
      externalizeDeps: true, // electron-vite 5.0+ 使用配置项替代插件
      rollupOptions: {
        input: {
          preload: resolve(__dirname, 'preload.js')
        },
        output: {
          entryFileNames: 'preload.js',
          format: 'cjs' // CommonJS 格式（Node.js/Electron 预加载脚本）
        }
      }
    },
    // ESBuild 配置：确保预加载脚本 ES6+ 代码被正确转译
    esbuild: {
      target: 'node18', // Electron 32 基于 Node.js 18+，使用 node18 目标
      // 移除 console 和 debugger（生产环境）
      drop: process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : [],
      // 启用 tree-shaking
      treeShaking: true,
      // 保持 CommonJS 格式
      format: 'cjs'
    }
  },

  // 渲染进程配置 - 支持 HMR ⚡️
  renderer: {
    root: __dirname,
    // 配置 base 路径，确保资源路径在开发和生产环境一致
    base: './',
    // 关闭 Vite 的 publicDir 映射：
    // - 本项目的静态资源本身就在仓库根目录的 `assets/` 下（HTML 里也以 `assets/...` 引用）
    // - 若把 publicDir 设为 'assets'，Vite 会把它映射到站点根 `/`，导致 `/assets/...` 在开发环境 404，
    //   进而出现 FontAwesome 图标缺失、importmap 指向的 `./assets/vue.esm-browser.js` 取到错误内容等问题
    // - 生产构建的拷贝由 copyAssets() 插件负责
    publicDir: false,
    plugins: [
      // Vue 插件配置：确保模板在构建时预编译
      vue({
        // Vite 会在构建时自动预编译所有 .vue 文件和 template 选项
        // 开发环境：支持运行时编译（HMR）
        // 生产环境：所有模板在构建时预编译，无需运行时编译
        template: {
          compilerOptions: {
            // 生产环境优化：移除注释、压缩空白
            // 注意：这些选项在构建时生效，不影响开发环境
            ...(process.env.NODE_ENV === 'production' ? {
              comments: false,
              whitespace: 'condense'
            } : {}),
            // 修复 transition 相关错误：确保所有标签都被正确解析
            isCustomElement: (tag) => false
          }
        },
        // 让 .vue 和 .js 里的 template 都在构建时编译，便于在构建阶段定位 compiler-23 的具体文件/行号
        // 修复模板解析问题：禁用响应式转换以避免兼容性问题
        reactivityTransform: false
      }),
      copyAssets(),
      copyLocales()
    ],
    resolve: {
      // 使用带编译器的构建，以支持运行时 template 选项（开发环境）
      // 生产环境：Vite 会在构建时预编译所有模板
      alias: {
        vue: 'vue/dist/vue.esm-bundler.js',
        '@': resolve(__dirname, 'src')
      },
      extensions: ['.js', '.jsx', '.ts', '.tsx', '.json', '.vue'],
      // 确保 node_modules 中的文件不会被 Vue 编译器错误解析
      dedupe: ['vue']
    },
    // Vite 开发服务器配置 - 启用 HMR
    server: {
      port: DEV_SERVER_PORT,
      strictPort: true,
      host: '0.0.0.0', // 允许局域网访问
      hmr: true,
      cors: true,
      // 确保依赖预构建正常工作
      fs: {
        // 允许访问项目根目录之外的文件（如果需要）
        strict: false
      }
    },
    build: {
      // 性能优化：确保 ES6+ 代码被转译为 ES5（兼容性）或 ES2015（现代浏览器）
      target: 'chrome128', // Electron 渲染进程推荐使用明确的 Chrome 目标
      // 启用代码压缩和优化
      minify: 'esbuild', // esbuild 比 terser 更快，速度比 terser 快 10-100 倍
      // 生产环境禁用 sourcemap 以减小体积和提升性能
      // electron-vite 在构建时会自动设置 mode，生产构建时 sourcemap 会被禁用
      sourcemap: false, // 生产环境禁用 sourcemap，减小体积约 30-50%
      // 代码分割优化
      rollupOptions: {
        // 多页面入口
        input: {
          index: resolve(__dirname, 'index.html'),
          display: resolve(__dirname, 'display_window.html'),
          lineManager: resolve(__dirname, 'line_manager_window.html'),
          devWindow: resolve(__dirname, 'dev_window.html'),
          electronAlert: resolve(__dirname, 'electron_alert.html'),
          // BrowserView 复合布局页面
          topbar: resolve(__dirname, 'topbar.html'),
          sidebar: resolve(__dirname, 'sidebar.html'),
          // 示例与测试页面
          // debugDisplayRing: resolve(__dirname, 'debug_display_ring.html'), // 暂时移除，drawRing 未导出
          testMultiDisplay: resolve(__dirname, 'test_multi_display.html'),
          // 自定义显示端示例
          display1: resolve(__dirname, 'displays/display-1/display_window.html'),
          display2: resolve(__dirname, 'displays/display-2/display_window.html'),
          display3: resolve(__dirname, 'displays/display-3/display_window.html')
        },
        output: {
          // 代码分割：将大型依赖分离到单独的 chunk
          manualChunks: {
            'vue-vendor': ['vue']
          },
          // 优化 chunk 文件名
          chunkFileNames: 'chunks/[name]-[hash].js',
          entryFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash].[ext]'
        }
      },
      // 提高构建性能
      chunkSizeWarningLimit: 1000, // 增加 chunk 大小警告阈值
      // 启用 CSS 代码分割
      cssCodeSplit: true
    },
    optimizeDeps: {
      // antdv-next 的语言包为 deep import，不加入 include 时易在 HMR/缓存更新后出现 504 Outdated Optimize Dep
      include: [
        'vue',
        'vue-i18n',
        'antdv-next',
        'antdv-next/locale/zh_CN',
        '@v-c/pagination/locale/zh_CN',
        '@antdv-next/cssinjs'
      ],
      exclude: [],
      // 强制重新预构建（开发环境）- 临时启用以修复缓存问题
      force: process.env.FORCE_VITE_OPTIMIZE === 'true', // 通过环境变量控制
      // 预构建优化
      esbuildOptions: {
        target: 'es2015', // 确保依赖也被转译为 ES2015
        // 确保 esbuild 不会错误地解析字符串中的 HTML 标签
        legalComments: 'none'
      },
      // 确保 Vue 依赖被正确预构建，避免编译器错误解析
      esbuild: {
        logOverride: { 'this-is-undefined-in-esm': 'silent' }
      }
    },
    // ESBuild 配置：确保 ES6+ 代码被正确转译
    esbuild: {
      target: 'es2015', // 转译目标：ES2015（现代浏览器支持）
      // 移除 console 和 debugger（生产环境）
      drop: process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : [],
      // 启用 tree-shaking
      treeShaking: true
    }
  }
})
