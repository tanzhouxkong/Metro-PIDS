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
  background: #fff;
  border: 1px solid rgba(0,0,0,0.12);
  border-radius: 10px;
  box-shadow: 0 10px 30px rgba(0,0,0,0.18);
  padding: 6px;
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
.lmcm-item.danger{ color: #ff4444; }
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
.lmcm-item.danger .lmcm-icon{ color: #ff4444; }
.lmcm-sep{
  height: 1px;
  margin: 6px 4px;
  background: rgba(0,0,0,0.08);
}
.lmcm-mask{
  position: fixed;
  inset: 0;
  z-index: 9998;
  background: transparent;
}
</style>

