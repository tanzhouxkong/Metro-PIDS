<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="visible" class="spot-root" @click.stop>
        <!-- dim layers (leave a hole so user can click the highlighted target) -->
        <div class="spot-dim" :style="dimTopStyle" @click="onDimClick"></div>
        <div class="spot-dim" :style="dimLeftStyle" @click="onDimClick"></div>
        <div class="spot-dim" :style="dimRightStyle" @click="onDimClick"></div>
        <div class="spot-dim" :style="dimBottomStyle" @click="onDimClick"></div>

        <!-- highlight border -->
        <div v-if="hasHole" class="spot-hole" :style="holeStyle"></div>

        <!-- tooltip -->
        <div class="spot-tip" :style="tipStyle" @click.stop>
          <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:10px;">
            <div>
              <div style="font-size:16px; font-weight:900; color:var(--text); letter-spacing:-0.2px;">{{ i18nTitle }}</div>
              <div v-if="i18nStepText" style="font-size:12px; color:var(--muted); margin-top:4px;">{{ i18nStepText }}</div>
            </div>
          </div>
          <div style="margin-top:10px; font-size:13px; line-height:1.75; color:var(--text); white-space:pre-wrap; word-break:break-word;">{{ i18nBody }}</div>

          <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:12px;">
            <button
              v-if="showBack"
              type="button"
              class="btn"
              style="min-width:110px; padding:9px 16px; border-radius:999px; font-weight:900; font-size:13px; cursor:pointer; border:1px solid var(--divider); background:var(--input-bg); color:var(--text);"
              :disabled="busy"
              @click="$emit('back')"
            >
              {{ i18nBackLabel }}
            </button>
            <button
              v-if="showNext"
              type="button"
              class="btn"
              style="min-width:130px; background:#3b82f6; color:white; border:none; padding:9px 18px; border-radius:999px; font-weight:900; font-size:13px; cursor:pointer;"
              :disabled="busy"
              @click="$emit('next')"
            >
              {{ i18nNextLabel }}
            </button>
          </div>

          <!-- arrow -->
          <div v-if="hasHole" class="spot-arrow" :style="arrowStyle"></div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { getLocalizedText } from '../../spotlight-guide-config.js'

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

export default {
  name: 'SpotlightOverlay',
  props: {
    visible: { type: Boolean, default: false },
    targetSelector: { type: String, default: '' },
    title: { type: [String, Object], default: '' },
    body: { type: [String, Object], default: '' },
    stepText: { type: [String, Object], default: '' },
    showBack: { type: Boolean, default: true },
    showNext: { type: Boolean, default: true },
    backLabel: { type: [String, Object], default: '上一步' },
    nextLabel: { type: [String, Object], default: '下一步' },
    busy: { type: Boolean, default: false },
    padding: { type: Number, default: 10 },
    radius: { type: Number, default: 14 }
  },
  emits: ['back', 'next', 'dim-click'],
  setup(props, { emit }) {
    const hole = ref(null) // { left, top, width, height }
    const tip = ref({ left: 40, top: 40 })

    // i18n 文本转换
    const i18nTitle = computed(() => getLocalizedText(props.title))
    const i18nBody = computed(() => getLocalizedText(props.body))
    const i18nStepText = computed(() => getLocalizedText(props.stepText))
    const i18nBackLabel = computed(() => getLocalizedText(props.backLabel))
    const i18nNextLabel = computed(() => getLocalizedText(props.nextLabel))

    const hasHole = computed(() => {
      const h = hole.value
      return !!(h && h.width > 0 && h.height > 0)
    })

    const measure = async () => {
      if (!props.visible) return
      await nextTick()

      let rect = null
      try {
        const sel = String(props.targetSelector || '').trim()
        if (sel) {
          const el = document.querySelector(sel)
          if (el && typeof el.getBoundingClientRect === 'function') rect = el.getBoundingClientRect()
        }
      } catch (e) {
        rect = null
      }

      const vw = window.innerWidth || 0
      const vh = window.innerHeight || 0

      if (!rect || rect.width <= 0 || rect.height <= 0) {
        hole.value = null
        tip.value = { left: Math.max(20, Math.floor(vw / 2 - 220)), top: Math.max(20, Math.floor(vh / 2 - 120)) }
        return
      }

      const pad = Number(props.padding) || 0
      const left = clamp(Math.floor(rect.left - pad), 8, Math.max(8, vw - 8))
      const top = clamp(Math.floor(rect.top - pad), 8, Math.max(8, vh - 8))
      const width = clamp(Math.ceil(rect.width + pad * 2), 10, Math.max(10, vw - left - 8))
      const height = clamp(Math.ceil(rect.height + pad * 2), 10, Math.max(10, vh - top - 8))
      hole.value = { left, top, width, height }

      // tooltip placement
      const preferRight = left + width + 16 + 340 < vw
      const preferLeft = left - 16 - 340 > 0
      let tipLeft = preferRight ? (left + width + 16) : (preferLeft ? (left - 16 - 340) : clamp(left, 16, Math.max(16, vw - 360)))
      let tipTop = clamp(top, 16, Math.max(16, vh - 220))

      // if vertically overflow a lot, try below/above
      if (tipTop + 220 > vh - 12) {
        const belowOk = top + height + 16 + 220 < vh
        if (belowOk) tipTop = top + height + 16
        else tipTop = clamp(top - 16 - 220, 16, Math.max(16, vh - 220))
      }

      tipLeft = clamp(tipLeft, 16, Math.max(16, vw - 360))
      tipTop = clamp(tipTop, 16, Math.max(16, vh - 220))
      tip.value = { left: tipLeft, top: tipTop }
    }

    const onDimClick = () => emit('dim-click')

    let resizeTimer = null
    const onResize = () => {
      clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => measure(), 50)
    }

    onMounted(() => {
      if (typeof window !== 'undefined') {
        window.addEventListener('resize', onResize)
        window.addEventListener('scroll', onResize, true)
      }
    })

    onBeforeUnmount(() => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('resize', onResize)
        window.removeEventListener('scroll', onResize, true)
      }
      clearTimeout(resizeTimer)
    })

    watch(
      () => [props.visible, props.targetSelector, props.padding],
      () => {
        if (props.visible) measure()
      },
      { immediate: true }
    )

    const dimTopStyle = computed(() => ({
      left: '0px',
      top: '0px',
      width: '100vw',
      height: hasHole.value ? `${hole.value.top}px` : '100vh'
    }))

    const dimBottomStyle = computed(() => {
      if (!hasHole.value) return { display: 'none' }
      const h = hole.value
      return {
        left: '0px',
        top: `${h.top + h.height}px`,
        width: '100vw',
        height: `calc(100vh - ${h.top + h.height}px)`
      }
    })

    const dimLeftStyle = computed(() => {
      if (!hasHole.value) return { display: 'none' }
      const h = hole.value
      return {
        left: '0px',
        top: `${h.top}px`,
        width: `${h.left}px`,
        height: `${h.height}px`
      }
    })

    const dimRightStyle = computed(() => {
      if (!hasHole.value) return { display: 'none' }
      const h = hole.value
      return {
        left: `${h.left + h.width}px`,
        top: `${h.top}px`,
        width: `calc(100vw - ${h.left + h.width}px)`,
        height: `${h.height}px`
      }
    })

    const holeStyle = computed(() => {
      if (!hasHole.value) return {}
      const h = hole.value
      const r = Math.max(4, Number(props.radius) || 0)
      return {
        left: `${h.left}px`,
        top: `${h.top}px`,
        width: `${h.width}px`,
        height: `${h.height}px`,
        borderRadius: `${r}px`
      }
    })

    const tipStyle = computed(() => ({
      left: `${tip.value.left}px`,
      top: `${tip.value.top}px`
    }))

    const arrowStyle = computed(() => {
      if (!hasHole.value) return { display: 'none' }
      const h = hole.value
      const t = tip.value
      const centerY = h.top + h.height / 2
      const tipMidY = t.top + 34

      // choose arrow direction based on tooltip placement
      const onRight = t.left > h.left + h.width
      const onLeft = t.left + 340 < h.left

      const size = 10
      const top = clamp(Math.floor(centerY - tipMidY), -40, 180)
      if (onRight) {
        return {
          left: '-10px',
          top: `${clamp(24 + top, 16, 180)}px`,
          borderWidth: `${size}px ${size}px ${size}px 0px`,
          borderColor: `transparent rgba(255,255,255,0.85) transparent transparent`
        }
      }
      if (onLeft) {
        return {
          right: '-10px',
          top: `${clamp(24 + top, 16, 180)}px`,
          borderWidth: `${size}px 0px ${size}px ${size}px`,
          borderColor: `transparent transparent transparent rgba(255,255,255,0.85)`
        }
      }
      // fallback: arrow from top
      return {
        left: '28px',
        top: '-10px',
        borderWidth: `0px ${size}px ${size}px ${size}px`,
        borderColor: `transparent transparent rgba(255,255,255,0.85) transparent`
      }
    })

    return {
      hasHole,
      dimTopStyle,
      dimLeftStyle,
      dimRightStyle,
      dimBottomStyle,
      holeStyle,
      tipStyle,
      arrowStyle,
      onDimClick,
      i18nTitle,
      i18nBody,
      i18nStepText,
      i18nBackLabel,
      i18nNextLabel
    }
  }
}
</script>

<style scoped>
.spot-root {
  position: fixed;
  inset: 0;
  z-index: 26000;
}

.spot-dim {
  position: fixed;
  background: rgba(0, 0, 0, 0.62);
  pointer-events: auto;
}

.spot-hole {
  position: fixed;
  pointer-events: none;
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.72), 0 10px 40px rgba(0, 0, 0, 0.35);
}

.spot-tip {
  position: fixed;
  width: 340px;
  max-width: calc(100vw - 32px);
  padding: 14px 16px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.22);
  background: rgba(255, 255, 255, 0.10);
  color: var(--text);
  backdrop-filter: blur(16px) saturate(160%);
  -webkit-backdrop-filter: blur(16px) saturate(160%);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35);
}

.spot-arrow {
  position: absolute;
  width: 0;
  height: 0;
  border-style: solid;
  filter: drop-shadow(0 6px 10px rgba(0,0,0,0.25));
}
</style>
