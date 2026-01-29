<script>
import { reactive, ref, watch, computed, Teleport, Transition } from 'vue'
import ColorPicker from './ColorPicker.js'

export default {
  name: 'StationEditor',
  components: { Teleport, Transition, ColorPicker },
  props: {
    modelValue: { type: Boolean, default: false },
    station: { type: Object, default: () => ({}) },
    isNew: { type: Boolean, default: false }
  },
  emits: ['update:modelValue', 'save'],
  setup(props, { emit }) {
    const form = reactive({
      name: '',
      en: '',
      skip: false,
      door: 'left',
      dock: 'both',
      turnback: 'none',
      xfer: [],
      expressStop: false
    })

    watch(
      () => props.station,
      (newVal) => {
        if (!newVal) return
        form.name = newVal.name || ''
        form.en = newVal.en || ''
        form.skip = newVal.skip || false
        form.door = newVal.door || 'left'
        form.dock = newVal.dock || 'both'
        form.turnback = newVal.turnback || 'none'
        form.expressStop = newVal.expressStop !== undefined ? !!newVal.expressStop : false
        form.xfer = newVal.xfer
          ? JSON.parse(JSON.stringify(newVal.xfer.map((x) => ({ ...x, exitTransfer: x.exitTransfer || false }))))
          : []
      },
      { immediate: true, deep: true }
    )

    const isDarkTheme = computed(() => {
      try {
        const el = document.documentElement
        return !!(el && (el.classList.contains('dark') || el.getAttribute('data-theme') === 'dark'))
      } catch (e) {
        return false
      }
    })

    const close = () => emit('update:modelValue', false)
    const save = () => {
      if (!form.name) return
      emit('save', JSON.parse(JSON.stringify(form)))
      close()
    }

    const addXfer = () => {
      form.xfer.push({ line: '', color: '#000000', suspended: false, exitTransfer: false })
    }
    const removeXfer = (idx) => form.xfer.splice(idx, 1)
    const toggleXferSuspended = (idx) => {
      const xf = form.xfer[idx]
      xf.suspended = !xf.suspended
      if (xf.suspended) xf.exitTransfer = false
    }
    const toggleExitTransfer = (idx) => {
      const xf = form.xfer[idx]
      xf.exitTransfer = !xf.exitTransfer
      if (xf.exitTransfer) xf.suspended = false
    }

    // Color picker
    const showColorPicker = ref(false)
    const colorPickerIndex = ref(-1)
    const colorPickerInitialColor = ref('#000000')
    const openColorPicker = (idx) => {
      colorPickerIndex.value = idx
      colorPickerInitialColor.value = form.xfer[idx]?.color || '#808080'
      showColorPicker.value = true
    }
    const onColorConfirm = (color) => {
      if (colorPickerIndex.value >= 0 && form.xfer[colorPickerIndex.value]) {
        form.xfer[colorPickerIndex.value].color = color
      }
      colorPickerIndex.value = -1
    }

    const hasElectronAPI = typeof window !== 'undefined' && window.electronAPI && window.electronAPI.startColorPick
    const pickColor = async (idx) => {
      if (hasElectronAPI) {
        try {
          const result = await window.electronAPI.startColorPick()
          if (result && result.ok && result.color) form.xfer[idx].color = result.color
          return
        } catch (e) {
          console.error('取色失败:', e)
        }
      }
      openColorPicker(idx)
    }

    return {
      form,
      isDarkTheme,
      close,
      save,
      addXfer,
      removeXfer,
      toggleXferSuspended,
      toggleExitTransfer,
      showColorPicker,
      colorPickerInitialColor,
      openColorPicker,
      onColorConfirm,
      pickColor
    }
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="modelValue" class="se-overlay" @click.self="close">
        <div class="se-dialog" role="dialog" aria-modal="true">
          <div class="se-header">
            <div class="se-header-left">
              <div class="se-icon">
                <i :class="isNew ? 'fas fa-plus' : 'fas fa-edit'"></i>
              </div>
              <div class="se-titles">
                <div class="se-title">{{ isNew ? '新建站点' : '站点编辑' }}</div>
                <div class="se-subtitle">{{ isNew ? 'New Station' : 'Edit Station' }}</div>
              </div>
            </div>
            <button class="se-close" @click="close" aria-label="关闭">
              <i class="fas fa-times"></i>
            </button>
          </div>

          <div class="se-content">
            <div class="se-grid2">
              <div class="se-field">
                <label class="se-label">中文站名</label>
                <input v-model="form.name" class="se-input" placeholder="例如: 人民广场" />
              </div>
              <div class="se-field">
                <label class="se-label">英文站名 (English)</label>
                <input v-model="form.en" class="se-input" placeholder="e.g. People's Square" />
              </div>
            </div>

            <div class="se-grid3 se-mt">
              <div class="se-field">
                <div class="se-label">站点状态 (Status)</div>
                <div class="se-seg">
                  <button class="se-seg-btn" :class="{ on: !form.skip }" @click="form.skip = false">正常运营</button>
                  <button class="se-seg-btn" :class="{ on: form.skip, warn: form.skip }" @click="form.skip = true">暂缓开通</button>
                </div>
              </div>
              <div class="se-field">
                <div class="se-label">开门方向 (Door)</div>
                <div class="se-seg">
                  <button class="se-seg-btn" :class="{ on: form.door === 'left' }" @click="form.door = 'left'">左侧</button>
                  <button class="se-seg-btn" :class="{ on: form.door === 'right' }" @click="form.door = 'right'">右侧</button>
                  <button class="se-seg-btn" :class="{ on: form.door === 'both' }" @click="form.door = 'both'">双侧</button>
                </div>
              </div>
              <div class="se-field">
                <div class="se-label">停靠方向 (Dock)</div>
                <div class="se-seg">
                  <button class="se-seg-btn" :class="{ on: form.dock === 'up' }" @click="form.dock = 'up'">仅上行</button>
                  <button class="se-seg-btn" :class="{ on: form.dock === 'down' }" @click="form.dock = 'down'">仅下行</button>
                  <button class="se-seg-btn" :class="{ on: form.dock === 'both' }" @click="form.dock = 'both'">双向</button>
                </div>
              </div>
            </div>

            <div class="se-grid2 se-mt">
              <div class="se-field">
                <div class="se-label">折返位置 (Turnback)</div>
                <div class="se-seg">
                  <button class="se-seg-btn" :class="{ on: form.turnback === 'none' }" @click="form.turnback = 'none'">无</button>
                  <button class="se-seg-btn" :class="{ on: form.turnback === 'pre' }" @click="form.turnback = 'pre'">站前折返</button>
                  <button class="se-seg-btn" :class="{ on: form.turnback === 'post' }" @click="form.turnback = 'post'">站后折返</button>
                </div>
              </div>
              <div class="se-field se-field-narrow">
                <div class="se-label">大站停靠</div>
                <div class="se-seg">
                  <button class="se-seg-btn" :class="{ on: form.expressStop }" @click="form.expressStop = true">停靠</button>
                  <button class="se-seg-btn" :class="{ on: !form.expressStop }" @click="form.expressStop = false">跳过</button>
                </div>
              </div>
            </div>

            <div class="se-section">
              <div class="se-section-head">
                <div class="se-section-title">换乘线路</div>
                <button class="se-mini" @click.prevent="addXfer">+ 添加换乘</button>
              </div>

              <div v-if="form.xfer.length === 0" class="se-empty">暂无换乘</div>
              <div v-else class="se-xfer-list">
                <div v-for="(xf, idx) in form.xfer" :key="idx" class="se-xfer-row">
                  <input v-model="xf.line" class="se-input se-xfer-line" placeholder="线路名称/编号" />

                  <div class="se-color">
                    <div class="se-color-swatch" :style="{ backgroundColor: xf.color || '#808080' }" @click="openColorPicker(idx)" title="选择颜色"></div>
                    <button class="se-mini" @click.prevent="pickColor(idx)" title="取色">取色</button>
                  </div>

                  <button
                    class="se-tag"
                    :class="{ on: xf.exitTransfer }"
                    :disabled="xf.suspended"
                    :title="xf.suspended ? '暂缓时不能设置出站换乘' : '出站换乘'"
                    @click="!xf.suspended && toggleExitTransfer(idx)"
                  >
                    出站
                  </button>

                  <button
                    class="se-tag warn"
                    :class="{ on: xf.suspended }"
                    :disabled="xf.exitTransfer"
                    :title="xf.exitTransfer ? '出站换乘时不能暂缓' : xf.suspended ? '暂缓' : '正常'"
                    @click="!xf.exitTransfer && toggleXferSuspended(idx)"
                  >
                    {{ xf.suspended ? '暂缓' : '正常' }}
                  </button>

                  <button class="se-danger" @click="removeXfer(idx)" title="删除">
                    <i class="fas fa-times"></i>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div class="se-footer">
            <button class="se-btn se-btn-gray" @click="close">取消</button>
            <button class="se-btn se-btn-green" @click="save" :disabled="!form.name">保存</button>
          </div>
        </div>

        <ColorPicker v-model="showColorPicker" :initial-color="colorPickerInitialColor" @confirm="onColorConfirm" />
      </div>
    </Transition>
  </Teleport>
</template>

<style>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.se-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 20000;
  background: transparent; /* 不压暗 */
}

.se-dialog {
  width: 680px;
  max-width: 95%;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3), 0 0 0 0.5px rgba(255, 255, 255, 0.5) inset;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.3);
}

.se-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24px 28px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
  background: rgba(255, 255, 255, 0.4);
}
.se-header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.se-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: linear-gradient(135deg, #1677ff 0%, #ff9f43 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(22, 119, 255, 0.3);
  flex: 0 0 auto;
}
.se-icon i {
  color: #fff;
  font-size: 18px;
}
.se-title {
  font-size: 22px;
  font-weight: 800;
  letter-spacing: -0.5px;
  color: var(--text, #333);
}
.se-subtitle {
  font-size: 12px;
  color: var(--muted, #999);
  margin-top: 2px;
}
.se-close {
  background: none;
  border: none;
  color: var(--muted, #999);
  cursor: pointer;
  font-size: 20px;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  transition: all 0.2s;
}
.se-close:hover {
  color: var(--text, #333);
  background: rgba(0, 0, 0, 0.04);
}

.se-content {
  flex: 1;
  overflow: auto;
  padding: 24px 28px;
  background: rgba(255, 255, 255, 0.35);
}

.se-grid2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.se-grid3 {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 12px;
}
.se-mt {
  margin-top: 12px;
}
.se-field {
  min-width: 0;
}
.se-field-narrow {
  max-width: 260px;
}
.se-label {
  display: block;
  font-size: 12px;
  font-weight: 700;
  color: var(--muted);
  margin-bottom: 6px;
}

.se-input {
  width: 100%;
  padding: 10px;
  border-radius: 6px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  background: rgba(255, 255, 255, 0.7);
  color: var(--text);
  outline: none;
}

.se-seg {
  display: flex;
  padding: 4px;
  border-radius: 6px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  background: rgba(255, 255, 255, 0.7);
}
.se-seg-btn {
  flex: 1;
  border: none;
  background: transparent;
  color: var(--muted);
  padding: 8px;
  border-radius: 4px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s;
}
.se-seg-btn.on {
  background: var(--accent, #1677ff);
  color: #fff;
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.12);
}
.se-seg-btn.warn.on {
  background: var(--btn-org-bg, #ff9f43);
  color: #fff;
}

.se-section {
  margin-top: 16px;
}
.se-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 8px;
  border-bottom: 1px dashed rgba(0, 0, 0, 0.1);
  margin-bottom: 12px;
}
.se-section-title {
  font-weight: 800;
  font-size: 14px;
  color: var(--text);
}
.se-mini {
  height: 34px;
  min-width: 52px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: none;
  background: rgba(255, 255, 255, 0.7);
  border: 1px solid rgba(0, 0, 0, 0.1);
  color: var(--accent, #1677ff);
  font-size: 12px;
  padding: 0 12px;
  border-radius: 6px;
  cursor: pointer;
}
.se-mini:hover {
  background: rgba(255, 255, 255, 0.75);
}
.se-empty {
  color: var(--muted);
  font-size: 12px;
  padding: 8px 0;
}
.se-xfer-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.se-xfer-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.se-xfer-line {
  flex: 1 1 auto;
}
.se-color {
  display: flex;
  gap: 8px;
  align-items: center;
}
.se-color-swatch {
  width: 40px;
  height: 34px;
  border-radius: 6px;
  border: 2px solid rgba(0, 0, 0, 0.1);
  cursor: pointer;
}
.se-tag {
  height: 34px;
  min-width: 52px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 12px;
  border-radius: 6px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  background: rgba(255, 255, 255, 0.7);
  color: var(--text);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}
.se-tag:hover:not(:disabled):not(.on) {
  background: rgba(255, 255, 255, 0.78);
}
.se-tag.on {
  background: var(--btn-blue-bg, #1677ff);
  border-color: transparent;
  color: #fff;
}
.se-tag.warn.on {
  background: var(--btn-org-bg, #ff9f43);
  border-color: transparent;
  color: #fff;
}
.se-tag:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.se-danger {
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 6px;
  background: var(--btn-red-bg, #ff4444);
  color: #fff;
  cursor: pointer;
}
.se-danger:hover {
  filter: brightness(1.05);
}

.se-footer {
  padding: 20px 28px;
  border-top: 1px solid rgba(0, 0, 0, 0.08);
  background: rgba(255, 255, 255, 0.4);
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}
.se-btn {
  padding: 10px 20px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  min-width: 80px;
  transition: all 0.15s;
}
.se-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.se-btn-gray {
  background: var(--btn-gray-bg, #f5f5f5);
  color: var(--btn-gray-text, #666);
}
.se-btn-green {
  background: #2ed573;
  color: #fff;
  box-shadow: 0 4px 12px rgba(46, 213, 115, 0.4);
}

@media (prefers-color-scheme: dark) {
  .se-dialog {
    background: rgba(30, 30, 30, 0.85) !important;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }
  .se-header {
    background: rgba(30, 30, 30, 0.4) !important;
    border-bottom-color: rgba(255, 255, 255, 0.1);
  }
  .se-content {
    background: rgba(30, 30, 30, 0.3) !important;
  }
  .se-footer {
    background: rgba(30, 30, 30, 0.4) !important;
    border-top-color: rgba(255, 255, 255, 0.1);
  }
  .se-input,
  .se-seg,
  .se-mini,
  .se-tag {
    background: rgba(50, 50, 50, 0.6);
    border-color: rgba(255, 255, 255, 0.12);
  }
  .se-color-swatch {
    border-color: rgba(255, 255, 255, 0.12);
  }
  .se-close:hover {
    background: rgba(255, 255, 255, 0.06);
  }
}
</style>
