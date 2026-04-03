/**
 * 毛玻璃 v-glassmorphism：替代 vue3-glassmorphism 的 mounted 钩子。
 * 原库在 mounted 才写内联样式，首帧已有弹窗但 backdrop-filter 未就绪，会闪一下；
 * 右键菜单等纯 CSS 无此问题。在 beforeMount 同步写入即可与首帧合成一致。
 */

function hexToRgbComma(hex) {
  let h = String(hex || '#ffffff').toLowerCase()
  const parts = []
  if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(h)) {
    console.warn(
      'v-glassmorphism: 颜色应为 #fff 或 #ffffff. The color value should be #fff or #ffffff.'
    )
    return '255, 255, 255'
  }
  if (h.length === 4) {
    let expanded = '#'
    for (let i = 1; i < 4; i += 1) {
      expanded += h.slice(i, i + 1) + h.slice(i, i + 1)
    }
    h = expanded
  }
  for (let i = 1; i < 7; i += 2) {
    parts.push(parseInt(`0x${h.slice(i, i + 2)}`, 16))
  }
  return parts.join(', ')
}

function apply(el, binding) {
  const v = binding.value || {}
  let color = v.color
  let blur = v.blur ?? 3
  let opacity = v.opacity ?? 0.2
  try {
    const root = typeof document !== 'undefined' ? document.documentElement : null
    const blurDisabled = !!(root && root.classList.contains('blur-disabled'))
    if (blurDisabled) {
      const dark = root.classList.contains('dark') || root.getAttribute('data-theme') === 'dark'
      color = dark ? '#1c1c20' : '#ffffff'
      blur = 0
      opacity = 1
    }
  } catch (e) {
    // Fall back to binding values if root theme detection is unavailable.
  }
  const rgb = hexToRgbComma(color)
  el.style.background = `rgba(${rgb}, ${opacity})`
  if (blur === 0) {
    el.style.backdropFilter = 'none'
    el.style.webkitBackdropFilter = 'none'
  } else {
    const f = `blur(${blur}px)`
    el.style.backdropFilter = f
    el.style.webkitBackdropFilter = f
  }
}

export const glassmorphismDirective = {
  created(el, binding) {
    apply(el, binding)
  },
  beforeMount(el, binding) {
    apply(el, binding)
  },
  mounted(el, binding) {
    apply(el, binding)
  },
  updated(el, binding) {
    apply(el, binding)
  }
}

export default {
  install(app) {
    app.directive('glassmorphism', glassmorphismDirective)
  }
}
