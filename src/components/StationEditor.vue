<script>
import { reactive, ref, watch, computed, nextTick, Teleport, Transition } from 'vue'
import { useI18n } from 'vue-i18n'
import ColorPicker from './ColorPicker.vue'

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
    const { t } = useI18n()
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

    // 换乘线路剪贴板与右键菜单（复制/粘贴 + 既有功能整合）
    const xferClipboard = ref(null) // null | { type: 'one', data } | { type: 'all', data: [] }
    const menuVisible = ref(false)
    const menuX = ref(0)
    const menuY = ref(0)
    const menuContext = ref(null) // null | { type: 'row', idx } | { type: 'section' }

    const copyXfer = (idx) => {
      const item = form.xfer[idx]
      if (!item) return
      xferClipboard.value = { type: 'one', data: JSON.parse(JSON.stringify({ ...item, exitTransfer: item.exitTransfer || false })) }
    }
    const copyAllXfer = () => {
      if (!form.xfer.length) return
      xferClipboard.value = { type: 'all', data: JSON.parse(JSON.stringify(form.xfer.map((x) => ({ ...x, exitTransfer: x.exitTransfer || false })))) }
    }
    const pasteXfer = (afterIdx) => {
      if (!xferClipboard.value) return
      const clip = xferClipboard.value
      const norm = (x) => ({ line: x.line || '', color: x.color || '#000000', suspended: !!x.suspended, exitTransfer: !!x.exitTransfer })
      if (clip.type === 'one') {
        const insertIdx = afterIdx < 0 ? form.xfer.length : afterIdx + 1
        form.xfer.splice(insertIdx, 0, norm(clip.data))
      } else if (clip.type === 'all' && Array.isArray(clip.data)) {
        const insertIdx = afterIdx < 0 ? form.xfer.length : afterIdx + 1
        clip.data.forEach((x, i) => form.xfer.splice(insertIdx + i, 0, norm(x)))
      }
    }
    const hasClipboard = computed(() => !!xferClipboard.value)

    // 在 nextTick 中调整菜单位置，防止被视口裁切
    const adjustMenuPosition = (clientX, clientY) => {
      nextTick(() => {
        const menuEl = document.querySelector('[data-xfer-context-menu]')
        if (!menuEl) return
        const rect = menuEl.getBoundingClientRect()
        const vw = window.innerWidth
        const vh = window.innerHeight
        let x = clientX
        let y = clientY
        if (x + rect.width > vw) x = clientX - rect.width
        if (y + rect.height > vh) y = clientY - rect.height
        if (x < 0) x = 10
        if (y < 0) y = 10
        menuX.value = x
        menuY.value = y
      })
    }
    const openRowMenu = (e, idx) => {
      menuX.value = e.clientX
      menuY.value = e.clientY
      menuContext.value = { type: 'row', idx }
      menuVisible.value = true
      adjustMenuPosition(e.clientX, e.clientY)
    }
    const openSectionMenu = (e) => {
      menuX.value = e.clientX
      menuY.value = e.clientY
      menuContext.value = { type: 'section' }
      menuVisible.value = true
      adjustMenuPosition(e.clientX, e.clientY)
    }
    const closeMenu = () => {
      menuVisible.value = false
      menuContext.value = null
    }
    const runAndClose = (fn) => {
      if (typeof fn === 'function') fn()
      closeMenu()
    }

    // 换乘线路名称编辑弹窗（改）
    const showXferNameEdit = ref(false)
    const xferNameEditIdx = ref(-1)
    const xferNameEditValue = ref('')
    const openXferNameEdit = (idx) => {
      if (idx < 0 || idx >= form.xfer.length) return
      xferNameEditIdx.value = idx
      xferNameEditValue.value = form.xfer[idx].line || ''
      showXferNameEdit.value = true
    }
    const closeXferNameEdit = () => {
      showXferNameEdit.value = false
      xferNameEditIdx.value = -1
    }
    const confirmXferNameEdit = () => {
      if (xferNameEditIdx.value >= 0 && form.xfer[xferNameEditIdx.value]) {
        form.xfer[xferNameEditIdx.value].line = (xferNameEditValue.value || '').trim()
      }
      closeXferNameEdit()
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
      pickColor,
      xferClipboard,
      menuVisible,
      menuX,
      menuY,
      menuContext,
      hasClipboard,
      copyXfer,
      copyAllXfer,
      pasteXfer,
      openRowMenu,
      openSectionMenu,
      closeMenu,
      runAndClose,
      showXferNameEdit,
      xferNameEditIdx,
      xferNameEditValue,
      openXferNameEdit,
      closeXferNameEdit,
      confirmXferNameEdit,
      t
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
                  <div class="se-title">{{ isNew ? t('stationEditor.titleNew') : t('stationEditor.titleEdit') }}</div>
                </div>
              </div>
<<<<<<< Updated upstream
              <div class="se-titles">
                <div class="se-title">{{ isNew ? t('stationEditor.titleNew') : t('stationEditor.titleEdit') }}</div>
                <div class="se-subtitle">{{ isNew ? t('stationEditor.subtitleNew') : t('stationEditor.subtitleEdit') }}</div>
              </div>
            </div>
=======
>>>>>>> Stashed changes
            <button class="se-close" @click="close" aria-label="关闭">
              <i class="fas fa-times"></i>
            </button>
          </div>

            <div class="se-content">
            <div class="se-grid2">
              <div class="se-field">
                <label class="se-label">{{ t('stationEditor.nameZhLabel') }}</label>
                <input v-model="form.name" class="se-input" :placeholder="t('stationEditor.nameZhPlaceholder')" />
              </div>
              <div class="se-field">
                <label class="se-label">{{ t('stationEditor.nameEnLabel') }}</label>
                <input v-model="form.en" class="se-input" :placeholder="t('stationEditor.nameEnPlaceholder')" />
              </div>
            </div>

            <div class="se-grid3 se-mt">
              <div class="se-field">
                <div class="se-label">{{ t('stationEditor.statusLabel') }}</div>
                <div class="se-seg">
                  <button class="se-seg-btn" :class="{ on: !form.skip }" @click="form.skip = false">{{ t('stationEditor.statusNormal') }}</button>
                  <button class="se-seg-btn" :class="{ on: form.skip, warn: form.skip }" @click="form.skip = true">{{ t('stationEditor.statusSuspended') }}</button>
                </div>
              </div>
              <div class="se-field">
                <div class="se-label">{{ t('stationEditor.doorLabel') }}</div>
                <div class="se-seg">
                  <button class="se-seg-btn" :class="{ on: form.door === 'left' }" @click="form.door = 'left'">{{ t('stationEditor.doorLeft') }}</button>
                  <button class="se-seg-btn" :class="{ on: form.door === 'right' }" @click="form.door = 'right'">{{ t('stationEditor.doorRight') }}</button>
                  <button class="se-seg-btn" :class="{ on: form.door === 'both' }" @click="form.door = 'both'">{{ t('stationEditor.doorBoth') }}</button>
                </div>
              </div>
              <div class="se-field">
                <div class="se-label">{{ t('stationEditor.dockLabel') }}</div>
                <div class="se-seg">
                  <button class="se-seg-btn" :class="{ on: form.dock === 'up' }" @click="form.dock = 'up'">{{ t('stationEditor.dockUp') }}</button>
                  <button class="se-seg-btn" :class="{ on: form.dock === 'down' }" @click="form.dock = 'down'">{{ t('stationEditor.dockDown') }}</button>
                  <button class="se-seg-btn" :class="{ on: form.dock === 'both' }" @click="form.dock = 'both'">{{ t('stationEditor.dockBoth') }}</button>
                </div>
              </div>
            </div>

            <div class="se-grid2 se-mt">
              <div class="se-field">
                <div class="se-label">{{ t('stationEditor.turnbackLabel') }}</div>
                <div class="se-seg">
                  <button class="se-seg-btn" :class="{ on: form.turnback === 'none' }" @click="form.turnback = 'none'">{{ t('stationEditor.turnbackNone') }}</button>
                  <button class="se-seg-btn" :class="{ on: form.turnback === 'pre' }" @click="form.turnback = 'pre'">{{ t('stationEditor.turnbackPre') }}</button>
                  <button class="se-seg-btn" :class="{ on: form.turnback === 'post' }" @click="form.turnback = 'post'">{{ t('stationEditor.turnbackPost') }}</button>
                </div>
              </div>
              <div class="se-field se-field-narrow">
                <div class="se-label">{{ t('stationEditor.expressLabel') }}</div>
                <div class="se-seg">
                  <button class="se-seg-btn" :class="{ on: form.expressStop }" @click="form.expressStop = true">{{ t('stationEditor.expressStop') }}</button>
                  <button class="se-seg-btn" :class="{ on: !form.expressStop }" @click="form.expressStop = false">{{ t('stationEditor.expressSkip') }}</button>
                </div>
              </div>
            </div>

            <div class="se-section" @contextmenu.prevent="openSectionMenu($event)">
              <div class="se-section-head">
                <div class="se-section-title">{{ t('stationEditor.xferSectionTitle') }}</div>
                <span class="se-section-hint">{{ t('stationEditor.xferSectionHint') }}</span>
              </div>

              <div v-if="form.xfer.length === 0" class="se-empty">{{ t('stationEditor.xferEmpty') }}</div>
              <div v-else class="se-xfer-list">
                <div
                  v-for="(xf, idx) in form.xfer"
                  :key="idx"
                  class="se-xfer-row"
                  @contextmenu.prevent.stop="openRowMenu($event, idx)"
                >
                  <span class="se-xfer-name">{{ xf.line || t('stationEditor.xferUnnamed') }}</span>
                  <div v-if="xf.exitTransfer || xf.suspended" class="se-xfer-badges">
                    <span v-if="xf.exitTransfer" class="se-xfer-badge exit">{{ t('stationEditor.xferExitBadge') }}</span>
                    <span v-if="xf.suspended" class="se-xfer-badge suspended">{{ t('stationEditor.xferSuspendedBadge') }}</span>
                  </div>
                  <div
                    class="se-xfer-swatch"
                    :style="{ backgroundColor: xf.color || '#808080' }"
                    :title="t('stationEditor.xferColorTitle')"
                  ></div>
                </div>
              </div>
            </div>
          </div>

          <!-- 换乘线路右键菜单（与站点列表右键菜单风格统一） -->
          <Teleport to="body">
            <div
              v-if="menuVisible"
              class="station-context-menu"
              data-xfer-context-menu
              :style="{ left: menuX + 'px', top: menuY + 'px', position: 'fixed', zIndex: 20002 }"
              @click.stop
              @contextmenu.prevent
            >
              <template v-if="menuContext?.type === 'row'">
                <div class="station-context-menu-item" @click="runAndClose(() => openXferNameEdit(menuContext.idx))">
                  <i class="fas fa-edit"></i> {{ t('stationEditor.menuEditName') }}
                </div>
                <div class="station-context-menu-divider"></div>
                <div class="station-context-menu-item" @click="runAndClose(() => copyXfer(menuContext.idx))">
                  <i class="fas fa-copy"></i> {{ t('stationEditor.menuCopy') }}
                </div>
                <div
                  class="station-context-menu-item"
                  :class="{ disabled: !hasClipboard }"
                  @click="hasClipboard && runAndClose(() => pasteXfer(menuContext.idx))"
                >
                  <i class="fas fa-paste"></i> {{ t('stationEditor.menuPaste') }}
                </div>
                <div class="station-context-menu-divider"></div>
                <div class="station-context-menu-item" @click="runAndClose(() => openColorPicker(menuContext.idx))">
                  <i class="fas fa-palette"></i> {{ t('stationEditor.menuPickColor') }}
                </div>
                <div class="station-context-menu-divider"></div>
                <div
                  class="station-context-menu-item"
                  :class="{ 'xfer-on': form.xfer[menuContext.idx]?.exitTransfer }"
                  :style="form.xfer[menuContext.idx]?.suspended ? { opacity: 0.5, pointerEvents: 'none' } : undefined"
                  @click="!form.xfer[menuContext.idx]?.suspended && runAndClose(() => toggleExitTransfer(menuContext.idx))"
                >
                  <i class="fas fa-door-open"></i> {{ t('stationEditor.menuExitTransfer') }}
                </div>
                <div
                  class="station-context-menu-item"
                  :class="{ 'xfer-on': form.xfer[menuContext.idx]?.suspended }"
                  :style="form.xfer[menuContext.idx]?.exitTransfer ? { opacity: 0.5, pointerEvents: 'none' } : undefined"
                  @click="!form.xfer[menuContext.idx]?.exitTransfer && runAndClose(() => toggleXferSuspended(menuContext.idx))"
                >
                  <i class="fas fa-pause-circle"></i> {{ form.xfer[menuContext.idx]?.suspended ? t('stationEditor.menuSuspendedOn') : t('stationEditor.menuSuspendedOff') }}
                </div>
                <div class="station-context-menu-divider"></div>
                <div class="station-context-menu-item danger" @click="runAndClose(() => removeXfer(menuContext.idx))">
                  <i class="fas fa-trash-alt"></i> {{ t('stationEditor.menuDelete') }}
                </div>
              </template>
              <template v-else-if="menuContext?.type === 'section'">
                <div
                  v-if="form.xfer.length"
                  class="station-context-menu-item"
                  @click="runAndClose(copyAllXfer)"
                >
                  <i class="fas fa-copy"></i> {{ t('stationEditor.menuCopyAll') }}
                </div>
                <div
                  class="station-context-menu-item"
                  :class="{ disabled: !hasClipboard }"
                  @click="hasClipboard && runAndClose(() => pasteXfer(-1))"
                >
                  <i class="fas fa-paste"></i> {{ t('stationEditor.menuPaste') }}
                </div>
                <div class="station-context-menu-divider"></div>
                <div class="station-context-menu-item" @click="runAndClose(addXfer)">
                  <i class="fas fa-plus"></i> {{ t('stationEditor.menuAddXfer') }}
                </div>
              </template>
            </div>
          </Teleport>
          <div v-if="menuVisible" class="se-menu-backdrop" style="z-index: 20001" @click="closeMenu" aria-hidden="true"></div>

          <!-- 换乘线路名称编辑弹窗 -->
          <Teleport to="body">
            <Transition name="fade">
              <div v-if="showXferNameEdit" class="se-name-edit-overlay" @click.self="closeXferNameEdit">
                <div class="se-name-edit-dialog" role="dialog" aria-modal="true">
                  <div class="se-name-edit-title">{{ t('stationEditor.xferNameDialogTitle') }}</div>
                  <input
                    v-model="xferNameEditValue"
                    class="se-input se-name-edit-input"
                    :placeholder="t('stationEditor.xferNamePlaceholder')"
                    @keydown.enter="confirmXferNameEdit"
                  />
                  <div class="se-name-edit-actions">
                    <button type="button" class="se-btn se-btn-gray" @click="closeXferNameEdit">{{ t('stationEditor.btnCancel') }}</button>
                    <button type="button" class="se-btn se-btn-green" @click="confirmXferNameEdit">{{ t('stationEditor.btnConfirm') }}</button>
                  </div>
                </div>
              </div>
            </Transition>
          </Teleport>

          <div class="se-footer">
            <button class="se-btn se-btn-gray" @click="close">{{ t('stationEditor.btnCancel') }}</button>
            <button class="se-btn se-btn-green" @click="save" :disabled="!form.name">{{ t('stationEditor.btnSave') }}</button>
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
  width: 900px;
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
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
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
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}
.se-seg-btn.on {
  background: var(--accent, #1677ff);
  color: #fff;
  box-shadow: 0 2px 8px rgba(22, 119, 255, 0.35);
}
.se-seg-btn.warn.on {
  background: var(--btn-org-bg, #ff9f43);
  color: #fff;
  box-shadow: 0 2px 8px rgba(255, 159, 67, 0.35);
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
.se-section-hint {
  font-size: 11px;
  color: var(--muted, #999);
}
.se-empty {
  color: var(--muted);
  font-size: 12px;
  padding: 10px 0;
}
.se-xfer-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.se-xfer-row {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 6px 8px;
  border-radius: 8px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  transition: background 0.15s, border-color 0.15s;
}
.se-xfer-row:hover {
  background: rgba(0, 0, 0, 0.03);
  border-color: rgba(0, 0, 0, 0.14);
}
.se-xfer-name {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 14px;
  color: var(--text, #333);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.se-xfer-swatch {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: 2px solid rgba(0, 0, 0, 0.12);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
}
.se-xfer-badges {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}
.se-xfer-badge {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 600;
}
.se-xfer-badge.exit {
  background: rgba(255, 159, 67, 0.2);
  color: #c76b1a;
}
.se-xfer-badge.suspended {
  background: rgba(240, 173, 78, 0.25);
  color: #b8860b;
}

/* 换乘线路右键菜单使用 .station-context-menu（与站点列表统一），此处仅补充分隔与选中态 */
.station-context-menu-item.xfer-on {
  background: rgba(22, 119, 255, 0.1);
  color: var(--accent, #1677ff);
}
.station-context-menu-item.xfer-on i {
  color: var(--accent, #1677ff);
}
.se-menu-backdrop {
  position: fixed;
  inset: 0;
  background: transparent;
}

/* 换乘线路名称编辑弹窗 */
.se-name-edit-overlay {
  position: fixed;
  inset: 0;
  z-index: 21001;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.35);
}
.se-name-edit-dialog {
  width: 320px;
  padding: 20px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(0, 0, 0, 0.08);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2);
}
.se-name-edit-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text, #333);
  margin-bottom: 12px;
}
.se-name-edit-input {
  width: 100%;
  margin-bottom: 16px;
  box-sizing: border-box;
}
.se-name-edit-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
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
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}
.se-btn-gray:hover:not(:disabled) {
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.14);
}
.se-btn-green {
  background: #2ed573;
  color: #fff;
  box-shadow: 0 4px 12px rgba(46, 213, 115, 0.4);
}
.se-btn-green:hover:not(:disabled) {
  box-shadow: 0 5px 14px rgba(46, 213, 115, 0.5);
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
  .se-seg {
    background: rgba(50, 50, 50, 0.6);
    border-color: rgba(255, 255, 255, 0.12);
  }
  .se-xfer-row {
    border-color: rgba(255, 255, 255, 0.12);
  }
  .se-xfer-row:hover {
    background: rgba(255, 255, 255, 0.06);
    border-color: rgba(255, 255, 255, 0.2);
  }
  .se-xfer-swatch {
    border-color: rgba(255, 255, 255, 0.2);
  }
  .se-close:hover {
    background: rgba(255, 255, 255, 0.06);
  }
  .se-name-edit-dialog {
    background: rgba(40, 40, 40, 0.96);
    border-color: rgba(255, 255, 255, 0.12);
  }
  .se-name-edit-title {
    color: rgba(255, 255, 255, 0.9);
  }
}

/* 深色模式（class 切换，与 prefers-color-scheme 同时生效） */
:global(html.dark) .se-xfer-row,
:global([data-theme="dark"]) .se-xfer-row {
  border-color: rgba(255, 255, 255, 0.12);
}
:global(html.dark) .se-xfer-row:hover,
:global([data-theme="dark"]) .se-xfer-row:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.2);
}
</style>
