import { useUIState } from '../composables/useUIState.js'
import { ref } from 'vue'
import SlidePanel from './SlidePanel.vue'
import { appendDiagnosticLog, getRendererDiagnosticsSnapshot } from '../utils/rendererDiagnostics.js'

export default {
  name: 'SettingsPage',
  components: { SlidePanel },
  setup() {
    const { uiState } = useUIState()
    const hasSlidePanelError = ref(false)
    const slidePanelErrorMessage = ref('')
    const slidePanelDiagnosticLog = ref('')
    const slidePanelRenderKey = ref(0)

    const recoverSlidePanel = () => {
      hasSlidePanelError.value = false
      slidePanelErrorMessage.value = ''
      slidePanelDiagnosticLog.value = ''
      slidePanelRenderKey.value += 1
    }

    const copyDiagnosticLog = async () => {
      const text = String(slidePanelDiagnosticLog.value || getRendererDiagnosticsSnapshot() || '')
      if (!text) return
      try {
        if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text)
          return
        }
      } catch (e) {}
      try {
        const ta = document.createElement('textarea')
        ta.value = text
        ta.setAttribute('readonly', 'readonly')
        ta.style.position = 'fixed'
        ta.style.left = '-9999px'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      } catch (e) {}
    }
    // 不再自动设置 activePanel，由用户操作（点击侧边栏按钮）来控制
    // 这样可以确保默认启动页面是主页（activePanel 为 null）
    return { uiState, hasSlidePanelError, slidePanelErrorMessage, slidePanelDiagnosticLog, slidePanelRenderKey, recoverSlidePanel, copyDiagnosticLog }
  },
  errorCaptured(err, _instance, info) {
    try {
      const message = String(err && err.message ? err.message : err)
      const stack = err && err.stack ? String(err.stack) : ''
      appendDiagnosticLog('settings.errorCaptured', message, { info: String(info || ''), stack })
      this.hasSlidePanelError = true
      this.slidePanelErrorMessage = `[SettingsPage] ${String(info || 'render error')}: ${message}`
      this.slidePanelDiagnosticLog = getRendererDiagnosticsSnapshot()
      console.error(this.slidePanelErrorMessage, err)
    } catch (e) {}
    return false
  }
}
