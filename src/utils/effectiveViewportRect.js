export function getEffectiveViewportRect(anchorEl) {
  // 在 Metro-PIDS 中，主内容区经常被 #admin-app / .panel-body 限制尺寸，
  // 不能直接用 window.innerHeight/innerWidth 作为可用视口，否则下拉/菜单会被截断或方向判断错误。
  try {
    if (typeof window === 'undefined') return { top: 0, bottom: 0, left: 0, right: 0 }

    const vv = window.visualViewport
    const docEl = (typeof document !== 'undefined' && document.documentElement) ? document.documentElement : null

    const panel =
      (anchorEl && typeof anchorEl.closest === 'function' && (anchorEl.closest('.panel-body') || anchorEl.closest('#admin-app'))) ||
      (typeof document !== 'undefined' ? document.getElementById('admin-app') : null) ||
      null

    if (panel && typeof panel.getBoundingClientRect === 'function') {
      return panel.getBoundingClientRect()
    }

    const w = (vv && Number.isFinite(vv.width) ? vv.width : (docEl ? docEl.clientWidth : window.innerWidth)) || window.innerWidth
    const h = (vv && Number.isFinite(vv.height) ? vv.height : (docEl ? docEl.clientHeight : window.innerHeight)) || window.innerHeight
    return { top: 0, left: 0, right: w, bottom: h }
  } catch (e) {
    const w = (typeof window !== 'undefined' ? (window.innerWidth || 0) : 0)
    const h = (typeof window !== 'undefined' ? (window.innerHeight || 0) : 0)
    return { top: 0, left: 0, right: w, bottom: h }
  }
}

