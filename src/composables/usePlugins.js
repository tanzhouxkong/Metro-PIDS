/**
 * Metro-PIDS 插件系统
 * 类 WordPress 的插件架构，彩蛋与节日统一为可插拔模块
 */

import { ref, onMounted } from 'vue'
import { addAction, doAction, BUILTIN_PLUGINS } from '../plugins/registry.js'
import * as easterEggPlugin from '../plugins/metro-pids-easter-egg/index.js'
import * as newYearLanternPlugin from '../plugins/metro-pids-new-year-lantern/index.js'
import * as holidayPlugin from '../plugins/metro-pids-holiday/index.js'

const pluginsLoaded = ref(false)

export function usePlugins(cloudConfig) {
  function initPlugins() {
    if (pluginsLoaded.value) return
    if (!cloudConfig) return

    // 彩蛋：从 getEasterEggs 读取配置
    easterEggPlugin.setConfigLoader(async () => {
      const res = await cloudConfig.getEasterEggs()
      return res?.data ?? res
    })

    // 新年灯笼：从 getNewYearLantern 读取配置
    newYearLanternPlugin.setConfigLoader(async () => {
      const res = await cloudConfig.getNewYearLantern()
      return res?.data ?? res
    })

    // 节日：从 getActiveHolidays 读取激活节日
    holidayPlugin.setConfigLoader(async () => {
      const res = await cloudConfig.getActiveHolidays()
      return res?.data ?? res
    })

    pluginsLoaded.value = true
  }

  return {
    addAction,
    doAction,
    BUILTIN_PLUGINS,
    initPlugins,
    pluginsLoaded
  }
}

export { doAction, addAction } from '../plugins/registry.js'
