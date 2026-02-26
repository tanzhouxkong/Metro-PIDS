<script>
import { computed, ref, watch, nextTick, Teleport } from 'vue'

export default {
  name: 'ContextMenu',
  components: { Teleport },
  props: {
    modelValue: { type: Boolean, default: false },
    x: { type: Number, default: 0 },
    y: { type: Number, default: 0 },
    minWidth: { type: Number, default: 160 },
    items: { type: Array, default: () => [] }
  },
  emits: ['update:modelValue', 'select'],
  setup(props, { emit }) {
    const menuRef = ref(null)
    const pos = ref({ x: 0, y: 0 })

    const style = computed(() => ({
      left: pos.value.x + 'px',
      top: pos.value.y + 'px',
      minWidth: props.minWidth + 'px'
    }))

    // 根据窗口大小自动调整菜单位置，避免被裁剪
    async function adjustPosition() {
      if (!props.modelValue) return
      await nextTick()
      const el = menuRef.value
      let x = props.x
      let y = props.y

      if (typeof window !== 'undefined' && el) {
        const rect = el.getBoundingClientRect()
        const vw = window.innerWidth || document.documentElement.clientWidth
        const vh = window.innerHeight || document.documentElement.clientHeight
        const margin = 8

        if (x + rect.width > vw - margin) {
          x = Math.max(margin, vw - rect.width - margin)
        }
        if (y + rect.height > vh - margin) {
          y = Math.max(margin, vh - rect.height - margin)
        }
      }

      pos.value = { x, y }
    }

    watch(
      () => [props.modelValue, props.x, props.y],
      () => {
        if (props.modelValue) adjustPosition()
      }
    )

    function close() {
      emit('update:modelValue', false)
    }

    function onSelect(item) {
      if (!item || item.disabled) return
      emit('select', item)
      close()
    }

    return { style, close, onSelect, menuRef }
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="modelValue"
      ref="menuRef"
      class="lmcm"
      :style="style"
      @click.stop
      @contextmenu.prevent
    >
      <template v-for="(it, idx) in items" :key="idx">
        <div v-if="it.type === 'sep'" class="lmcm-sep"></div>
        <div
          v-else
          class="lmcm-item"
          :class="{ danger: !!it.danger, disabled: !!it.disabled }"
          @click="onSelect(it)"
        >
          <i v-if="it.icon" :class="it.icon" class="lmcm-icon"></i>
          <span class="lmcm-label">{{ it.label }}</span>
        </div>
      </template>
    </div>
  </Teleport>
  <Teleport to="body">
    <div v-if="modelValue" class="lmcm-mask" @click="close"></div>
  </Teleport>
</template>

<style>
.lmcm{
  position: fixed;
  z-index: 10000;
  background: rgba(255, 255, 255, 0.68);
  backdrop-filter: blur(18px) saturate(150%) contrast(1.05);
  -webkit-backdrop-filter: blur(18px) saturate(150%) contrast(1.05);
  border: 1px solid rgba(255,255,255,0.45);
  border-radius: 12px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.18), 0 0 0 1px rgba(0, 0, 0, 0.04);
  padding: 8px;
}
.lmcm-item{
  height: 34px;
  padding: 0 10px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  user-select: none;
  font-size: 13px;
  color: var(--text, #333);
}
.lmcm-item:hover{
  background: rgba(0,0,0,0.05);
}
.lmcm-item.danger{ color: var(--btn-red-bg, #ff4444); }
.lmcm-item.disabled{
  opacity: .5;
  cursor: not-allowed;
}
.lmcm-icon{
  width: 16px;
  text-align: center;
  color: var(--muted, #666);
  font-size: 12px;
}
.lmcm-item.danger .lmcm-icon{ color: var(--btn-red-bg, #ff4444); }
.lmcm-sep{
  height: 1px;
  margin: 6px 4px;
  background: var(--divider, rgba(0,0,0,0.08));
}
.lmcm-mask{
  position: fixed;
  inset: 0;
  z-index: 9998;
  background: transparent;
}

/* 深色模式 */
html.dark .lmcm{
  background: rgba(28, 28, 32, 0.62);
  backdrop-filter: blur(18px) saturate(150%) contrast(1.05);
  -webkit-backdrop-filter: blur(18px) saturate(150%) contrast(1.05);
  border: 1px solid rgba(255,255,255,0.18);
  box-shadow: 0 8px 30px rgba(0,0,0,0.34), 0 0 0 1px rgba(255,255,255,0.06);
}
html.dark .lmcm-item{
  color: var(--text);
}
html.dark .lmcm-item:hover{
  background: rgba(255,255,255,0.10);
}
html.dark .lmcm-item.danger{
  color: var(--btn-red-bg);
}
html.dark .lmcm-item.danger .lmcm-icon{
  color: var(--btn-red-bg);
}
html.dark .lmcm-icon{
  color: var(--muted);
}
html.dark .lmcm-sep{
  background: var(--divider);
}
</style>

