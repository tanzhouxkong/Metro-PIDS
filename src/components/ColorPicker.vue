<script>
import { ref, computed, watch, Teleport, Transition } from 'vue'
import { useI18n } from 'vue-i18n'

export default {
  name: 'ColorPicker',
  components: { Teleport, Transition },
  props: {
    modelValue: { type: Boolean, default: false },
    initialColor: { type: String, default: '#000000' }
  },
  emits: ['update:modelValue', 'confirm'],
  setup(props, { emit }) {
    const { t } = useI18n()
    const showDialog = computed({
      get: () => props.modelValue,
      set: (val) => emit('update:modelValue', val)
    })

    const hexColor = ref(props.initialColor || '#000000')
    const rgb = ref({ r: 0, g: 0, b: 0 })
    const pickMode = ref('manual')

    function hexToRgb(hex) {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
      if (result) {
        return {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16)
        }
      }
      return { r: 0, g: 0, b: 0 }
    }

    function rgbToHex(r, g, b) {
      return '#' + [r, g, b].map(x => {
        const hex = Math.max(0, Math.min(255, x)).toString(16)
        return hex.length === 1 ? '0' + hex : hex
      }).join('')
    }

    function updateRgb() {
      rgb.value = hexToRgb(hexColor.value)
    }

    function updateHex() {
      hexColor.value = rgbToHex(rgb.value.r, rgb.value.g, rgb.value.b)
    }

    watch(() => props.initialColor, (newColor) => {
      if (newColor) {
        hexColor.value = newColor
        updateRgb()
      }
    }, { immediate: true })

    watch(hexColor, () => updateRgb())

    const pickColorFromScreen = async () => {
      if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.startColorPick) {
        try {
          pickMode.value = 'picker'
          const result = await window.electronAPI.startColorPick()
          if (result && result.ok && result.color) {
            hexColor.value = result.color
            updateRgb()
          }
        } catch (e) {
          console.error('取色失败:', e)
        } finally {
          pickMode.value = 'manual'
        }
      }
    }

    const confirm = () => {
      emit('confirm', hexColor.value)
      showDialog.value = false
    }

    const cancel = () => {
      showDialog.value = false
    }

    const handlePaste = (event, inputType) => {
      event.stopPropagation()
      event.preventDefault()
      const pastedText = (event.clipboardData || window.clipboardData).getData('text').trim()

      if (inputType === 'hex') {
        let color = pastedText
        if (color.startsWith('#')) color = color.substring(1)
        if (color.length === 3 && /^[0-9A-Fa-f]{3}$/.test(color)) {
          color = color.split('').map(c => c + c).join('')
        }
        if (color.length === 6 && /^[0-9A-Fa-f]{6}$/.test(color)) {
          hexColor.value = '#' + color
          updateRgb()
        }
      } else if (inputType === 'rgb') {
        const rgbMatch = pastedText.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
        if (rgbMatch) {
          rgb.value = {
            r: Math.max(0, Math.min(255, parseInt(rgbMatch[1]))),
            g: Math.max(0, Math.min(255, parseInt(rgbMatch[2]))),
            b: Math.max(0, Math.min(255, parseInt(rgbMatch[3])))
          }
          updateHex()
        }
      }
    }

    const hasElectronAPI = computed(() => {
      return typeof window !== 'undefined' && window.electronAPI && window.electronAPI.startColorPick
    })

    return {
      showDialog,
      hexColor,
      rgb,
      pickMode,
      pickColorFromScreen,
      confirm,
      cancel,
      updateHex,
      hasElectronAPI,
      handlePaste,
      t
    }
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="cp-fade">
      <div v-if="showDialog" class="cp-overlay" @click.self="cancel">
        <div class="cp-dialog" role="dialog" aria-modal="true" @click.stop @paste.stop>
          <div class="cp-header">
            <div class="cp-header-left">
              <div class="cp-icon">
                <i class="fas fa-palette"></i>
              </div>
              <div class="cp-titles">
                <div class="cp-title">{{ t('colorPicker.title') }}</div>
              </div>
            </div>
            <button class="cp-close" @click="cancel" :aria-label="t('colorPicker.closeLabel')">
              <i class="fas fa-times"></i>
            </button>
          </div>

          <div class="cp-content">
            <!-- 颜色预览 -->
            <div class="cp-preview-section">
              <div class="cp-preview" :style="{ backgroundColor: hexColor }"></div>
            </div>

            <!-- 十六进制输入 -->
            <div class="cp-field">
              <label class="cp-label">{{ t('colorPicker.hexLabel') }}</label>
              <div class="cp-hex-row">
                <input
                  type="text"
                  v-model="hexColor"
                  class="cp-input cp-input-hex"
                  placeholder="#000000"
                  @click.stop
                  @paste="handlePaste($event, 'hex')"
                />
                <input
                  type="color"
                  :value="hexColor"
                  @input="hexColor = $event.target.value"
                  class="cp-native-picker"
                />
              </div>
            </div>

            <!-- RGB 输入 -->
            <div class="cp-field">
              <label class="cp-label">{{ t('colorPicker.rgbLabel') }}</label>
              <div class="cp-rgb-grid">
                <div class="cp-rgb-item">
                  <label class="cp-rgb-label">{{ t('colorPicker.rgbRLabel') }}</label>
                  <input
                    type="number"
                    v-model.number="rgb.r"
                    min="0"
                    max="255"
                    class="cp-input"
                    @input="updateHex"
                    @click.stop
                    @paste="handlePaste($event, 'rgb')"
                  />
                </div>
                <div class="cp-rgb-item">
                  <label class="cp-rgb-label">{{ t('colorPicker.rgbGLabel') }}</label>
                  <input
                    type="number"
                    v-model.number="rgb.g"
                    min="0"
                    max="255"
                    class="cp-input"
                    @input="updateHex"
                    @click.stop
                    @paste="handlePaste($event, 'rgb')"
                  />
                </div>
                <div class="cp-rgb-item">
                  <label class="cp-rgb-label">{{ t('colorPicker.rgbBLabel') }}</label>
                  <input
                    type="number"
                    v-model.number="rgb.b"
                    min="0"
                    max="255"
                    class="cp-input"
                    @input="updateHex"
                    @click.stop
                    @paste="handlePaste($event, 'rgb')"
                  />
                </div>
              </div>
            </div>
          </div>

          <div class="cp-footer">
            <button
              v-if="hasElectronAPI"
              @click="pickColorFromScreen"
              class="cp-btn cp-btn-picker"
              :disabled="pickMode === 'picker'"
            >
              <i class="fas fa-eye-dropper"></i> {{ t('colorPicker.pickFromScreen') }}
            </button>
            <div class="cp-footer-right">
              <button @click="cancel" class="cp-btn cp-btn-gray">{{ t('colorPicker.btnCancel') }}</button>
              <button @click="confirm" class="cp-btn cp-btn-green">{{ t('colorPicker.btnConfirm') }}</button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style>
.cp-fade-enter-active,
.cp-fade-leave-active {
  transition: opacity 0.25s ease;
}
.cp-fade-enter-from,
.cp-fade-leave-to {
  opacity: 0;
}

.cp-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 21000;
  background: transparent;
}

.cp-dialog {
  width: 420px;
  max-width: 95%;
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

.cp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
  background: rgba(255, 255, 255, 0.4);
}
.cp-header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}
.cp-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
}
.cp-icon i {
  color: #fff;
  font-size: 18px;
}
.cp-title {
  font-size: 20px;
  font-weight: 800;
  letter-spacing: -0.5px;
  color: var(--text, #333);
}
.cp-subtitle {
  font-size: 12px;
  color: var(--muted, #999);
  margin-top: 2px;
}
.cp-close {
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
.cp-close:hover {
  color: var(--text, #333);
  background: rgba(0, 0, 0, 0.04);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
}

.cp-content {
  flex: 1;
  padding: 20px 24px;
  background: rgba(255, 255, 255, 0.35);
}

.cp-preview-section {
  margin-bottom: 16px;
}
.cp-preview {
  width: 100%;
  height: 80px;
  border-radius: 10px;
  border: 2px solid rgba(0, 0, 0, 0.1);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.cp-field {
  margin-bottom: 16px;
}
.cp-label {
  display: block;
  font-size: 12px;
  font-weight: 700;
  color: var(--muted, #999);
  margin-bottom: 8px;
}

.cp-input {
  width: 100%;
  padding: 10px;
  border-radius: 6px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  background: rgba(255, 255, 255, 0.7);
  color: var(--text, #333);
  outline: none;
  font-size: 14px;
  box-sizing: border-box;
}
.cp-input:focus {
  border-color: var(--accent, #1677ff);
  box-shadow: 0 0 0 3px rgba(22, 119, 255, 0.1);
}
.cp-input-hex {
  font-family: monospace;
}

.cp-hex-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.cp-hex-row .cp-input {
  flex: 1;
}
.cp-native-picker {
  width: 50px;
  height: 42px;
  padding: 0;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
}

.cp-rgb-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}
.cp-rgb-item {
  display: flex;
  flex-direction: column;
}
.cp-rgb-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--muted, #999);
  margin-bottom: 4px;
}

.cp-footer {
  padding: 16px 24px;
  border-top: 1px solid rgba(0, 0, 0, 0.08);
  background: rgba(255, 255, 255, 0.4);
  display: flex;
  gap: 12px;
  justify-content: space-between;
  align-items: center;
}
.cp-footer-right {
  display: flex;
  gap: 12px;
}

.cp-btn {
  padding: 10px 18px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  min-width: 70px;
  transition: all 0.15s;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.cp-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.cp-btn-gray {
  background: var(--btn-gray-bg, #f5f5f5);
  color: var(--btn-gray-text, #666);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}
.cp-btn-gray:hover:not(:disabled) {
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.14);
}
.cp-btn-green {
  background: #2ed573;
  color: #fff;
  box-shadow: 0 4px 12px rgba(46, 213, 115, 0.4);
}
.cp-btn-green:hover:not(:disabled) {
  box-shadow: 0 5px 14px rgba(46, 213, 115, 0.5);
}
.cp-btn-picker {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.35);
}
.cp-btn-picker:hover:not(:disabled) {
  box-shadow: 0 5px 14px rgba(102, 126, 234, 0.45);
}

@media (prefers-color-scheme: dark) {
  .cp-dialog {
    background: rgba(30, 30, 30, 0.85) !important;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }
  .cp-header {
    background: rgba(30, 30, 30, 0.4) !important;
    border-bottom-color: rgba(255, 255, 255, 0.1);
  }
  .cp-content {
    background: rgba(30, 30, 30, 0.3) !important;
  }
  .cp-footer {
    background: rgba(30, 30, 30, 0.4) !important;
    border-top-color: rgba(255, 255, 255, 0.1);
  }
  .cp-input {
    background: rgba(50, 50, 50, 0.6);
    border-color: rgba(255, 255, 255, 0.12);
    color: var(--text, #eee);
  }
  .cp-preview {
    border-color: rgba(255, 255, 255, 0.12);
  }
  .cp-close:hover {
    background: rgba(255, 255, 255, 0.06);
  }
}
</style>
