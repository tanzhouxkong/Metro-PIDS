<script>
import { computed, ref, watch, nextTick, Teleport } from 'vue'
import { getEffectiveViewportRect } from '../../utils/effectiveViewportRect.js'

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

    async function adjustPosition() {
      if (!props.modelValue) return
      await nextTick()
      const el = menuRef.value
      let x = props.x
      let y = props.y

      if (typeof window !== 'undefined' && el) {
        const rect = el.getBoundingClientRect()
        const vp = getEffectiveViewportRect(el)
        const vw = (vp.right - vp.left) || window.innerWidth || document.documentElement.clientWidth
        const vh = (vp.bottom - vp.top) || window.innerHeight || document.documentElement.clientHeight
        const margin = 8

        if (((x - (vp.left || 0)) + rect.width) > vw - margin) {
          x = Math.max((vp.left || 0) + margin, (vp.left || 0) + vw - rect.width - margin)
        }
        if (((y - (vp.top || 0)) + rect.height) > vh - margin) {
          y = Math.max((vp.top || 0) + margin, (vp.top || 0) + vh - rect.height - margin)
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
      data-line-context-menu
      class="station-context-menu station-context-menu--glass-shell"
      v-glassmorphism="{ blur: 12, opacity: 0.2, color: '#ffffff' }"
      :style="style"
      @click.stop
      @contextmenu.prevent
    >
      <template v-for="(it, idx) in items" :key="idx">
        <div v-if="it.type === 'sep'" class="station-context-menu-divider"></div>
        <div
          v-else
          class="station-context-menu-item"
          :class="{ danger: !!it.danger, disabled: !!it.disabled }"
          @click="onSelect(it)"
        >
          <i v-if="it.icon" :class="it.icon"></i>
          <span>{{ it.label }}</span>
        </div>
      </template>
    </div>
  </Teleport>
  <Teleport to="body">
    <div v-if="modelValue" class="station-context-menu-mask" @click="close"></div>
  </Teleport>
</template>
