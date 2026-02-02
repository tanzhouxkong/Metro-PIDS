<template>
  <div v-if="showDialog" 
       class="plugin-manager-overlay"
       @click.self="showDialog = false">
    <div class="plugin-manager-dialog" @click.stop>
      <div class="plugin-manager-header">
        <div>
          <h2>🔌 插件管理</h2>
          <div class="plugin-manager-subtitle">类 WordPress 的可插拔模块，彩蛋与节日统一管理</div>
        </div>
        <button class="plugin-manager-close" @click="showDialog = false">&times;</button>
      </div>
      <div class="plugin-manager-content">
        <div v-if="loading" class="plugin-manager-loading">
          <i class="fas fa-spinner fa-spin"></i>
          <div>加载中...</div>
        </div>
        <div v-else class="plugin-manager-list">
          <div v-for="plugin in plugins" :key="plugin.slug" class="plugin-card">
            <div class="plugin-card-header">
              <span class="plugin-title">{{ plugin.title }}</span>
              <span class="plugin-version">v{{ plugin.version }}</span>
            </div>
            <div class="plugin-desc">{{ plugin.description }}</div>
            <div class="plugin-actions">
              <a v-if="plugin.slug === 'easter-egg'" href="#" @click.prevent="openEasterEggConfig">配置彩蛋</a>
              <a v-if="plugin.slug === 'new-year-lantern'" href="#" @click.prevent="openNewYearLanternConfig">配置新年灯笼</a>
              <a v-if="plugin.slug === 'holiday'" href="#" @click.prevent="openHolidayConfig">配置节日</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed } from 'vue'
import easterEggManifest from '../plugins/metro-pids-easter-egg/plugin.json'
import newYearLanternManifest from '../plugins/metro-pids-new-year-lantern/plugin.json'
import holidayManifest from '../plugins/metro-pids-holiday/plugin.json'

const PLUGIN_MANIFESTS = [
  { slug: 'easter-egg', ...easterEggManifest },
  { slug: 'new-year-lantern', ...newYearLanternManifest },
  { slug: 'holiday', ...holidayManifest }
]

export default {
  name: 'PluginManager',
  props: {
    modelValue: { type: Boolean, default: false }
  },
  emits: ['update:modelValue', 'openEasterEgg', 'openNewYearLantern', 'openHoliday'],
  setup(props, { emit }) {
    const showDialog = computed({
      get: () => props.modelValue,
      set: (v) => emit('update:modelValue', v)
    })
    const loading = ref(false)
    const plugins = ref(PLUGIN_MANIFESTS)

    function openEasterEggConfig() {
      emit('openEasterEgg')
    }
    function openNewYearLanternConfig() {
      emit('openNewYearLantern')
    }
    function openHolidayConfig() {
      emit('openHoliday')
    }

    return {
      showDialog,
      loading,
      plugins,
      openEasterEggConfig,
      openNewYearLanternConfig,
      openHolidayConfig
    }
  }
}
</script>

<style scoped>
.plugin-manager-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 20000;
  background: rgba(0,0,0,0.5);
  backdrop-filter: blur(4px);
}
.plugin-manager-dialog {
  background: var(--card, #fff);
  border-radius: 12px;
  width: 90%;
  max-width: 560px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0,0,0,0.3);
  overflow: hidden;
}
.plugin-manager-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--divider, #eee);
}
.plugin-manager-header h2 {
  margin: 0 0 4px;
  font-size: 20px;
  font-weight: bold;
  color: var(--text, #333);
}
.plugin-manager-subtitle {
  font-size: 12px;
  color: var(--muted, #999);
}
.plugin-manager-close {
  background: none;
  border: none;
  color: var(--muted);
  cursor: pointer;
  font-size: 24px;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
}
.plugin-manager-close:hover {
  background: var(--bg, #f5f5f5);
}
.plugin-manager-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}
.plugin-manager-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 120px;
  color: var(--muted);
  gap: 12px;
}
.plugin-manager-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.plugin-card {
  padding: 16px;
  background: var(--bg, #f8f8f8);
  border-radius: 8px;
  border: 1px solid var(--divider, #eee);
}
.plugin-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.plugin-title {
  font-weight: 600;
  color: var(--text);
}
.plugin-version {
  font-size: 11px;
  color: var(--muted);
}
.plugin-desc {
  font-size: 13px;
  color: var(--muted);
  line-height: 1.5;
  margin-bottom: 12px;
}
.plugin-actions a {
  font-size: 13px;
  color: var(--accent, #00b894);
  text-decoration: none;
}
.plugin-actions a:hover {
  text-decoration: underline;
}
</style>
