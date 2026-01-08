import { defineConfig } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import { copyFileSync, existsSync, mkdirSync, cpSync } from 'fs'
import { join } from 'path'

// 立即执行：确保 main.js 文件在 electron-vite 检查之前就存在
const outDir = resolve(__dirname, 'out', 'main')
const target = join(outDir, 'main.js')
const source = resolve(__dirname, 'main.js')

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
          format: 'cjs'
        }
      }
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
          entryFileNames: 'preload.js'
        }
      }
    }
  },

  // 渲染进程配置 - 支持 HMR ⚡️
  renderer: {
    root: __dirname,
    plugins: [vue(), copyAssets()],
    resolve: {
      // 使用带编译器的构建，以支持运行时 template 选项
      alias: {
        vue: 'vue/dist/vue.esm-bundler.js',
        '@': resolve(__dirname, 'src')
      },
      extensions: ['.js', '.jsx', '.ts', '.tsx', '.json', '.vue']
    },
    // Vite 开发服务器配置 - 启用 HMR
    server: {
      port: 5173,
      strictPort: false,
      hmr: {
        protocol: 'ws',
        host: 'localhost',
        port: 5173
      },
      cors: true
    },
    build: {
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
          display2: resolve(__dirname, 'displays/display-2/display_window.html')
        }
      },
      minify: 'esbuild',
      sourcemap: true
    },
    optimizeDeps: {
      include: ['vue'],
      exclude: []
    }
  }
})
