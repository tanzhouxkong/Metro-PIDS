import { Teleport, Transition } from 'vue'
import { i18n } from '../locales/index.js'
// 独立线路管理器窗口内须静态导入，勿用模板内 <style>@import（Vite 下可能不注入）
import '../styles/cp-glass-modal-shell.css'

export default {
  name: 'LineManagerDialog',
  components: { Teleport, Transition },
  data() {
    return {
      visible: false,
      title: '',
      message: '',
      inputValue: '',
      resolve: null,
      type: 'prompt' // 'prompt', 'alert', 'confirm'
    }
  },
  computed: {
    glassDirective() {
      let blurEnabled = true
      let isDark = false
      try {
        const root = typeof document !== 'undefined' ? document.documentElement : null
        if (root) {
          isDark = root.classList.contains('dark') || root.getAttribute('data-theme') === 'dark'
          blurEnabled = !root.classList.contains('blur-disabled')
        }
        if (typeof localStorage !== 'undefined') {
          const raw = localStorage.getItem('pids_settings_v1')
          if (raw) {
            const settings = JSON.parse(raw)
            if (settings && settings.blurEnabled === false) blurEnabled = false
          }
        }
      } catch (e) {
        // Ignore invalid persisted settings and fall back to current DOM state.
      }
      if (!blurEnabled) {
        return { blur: 0, opacity: 1, color: isDark ? '#1c1c20' : '#ffffff' }
      }
      return { blur: 12, opacity: 0.2, color: isDark ? '#1c1c20' : '#ffffff' }
    },
    iconBoxStyle() {
      const c = this.getDialogColor()
      return {
        background: `linear-gradient(135deg, ${c} 0%, ${c}dd 100%)`,
        boxShadow: `0 4px 12px ${c}40`
      }
    }
  },
  methods: {
    tCp(key) {
      return i18n.global.t(`colorPicker.${key}`)
    },
    prompt(message, defaultValue = '', title = '新建文件夹') {
      this.title = title
      this.message = message
      this.inputValue = defaultValue || ''
      this.type = 'prompt'
      this.visible = true
      return new Promise((resolve) => {
        this.resolve = resolve
      })
    },
    alert(message, title = '提示') {
      this.title = title
      this.message = message
      this.type = 'alert'
      this.visible = true
      return new Promise((resolve) => {
        this.resolve = resolve
      })
    },
    confirm(message, title = '确认') {
      this.title = title
      this.message = message
      this.type = 'confirm'
      this.visible = true
      return new Promise((resolve) => {
        this.resolve = resolve
      })
    },
    close(result) {
      const resolver = this.resolve
      this.resolve = null
      this.visible = false
      if (resolver) resolver(result)
    },
    handleConfirm() {
      if (this.type === 'prompt') {
        this.close(this.inputValue)
      } else {
        this.close(true)
      }
    },
    handleCancel() {
      this.close(this.type === 'prompt' ? null : false)
    },
    onOverlayClick() {
      if (this.type === 'alert') return
      this.handleCancel()
    },
    getDialogIcon() {
      if (this.type === 'alert') return 'fa-info-circle'
      if (this.type === 'confirm') return 'fa-question-circle'
      if (this.type === 'prompt') return 'fa-edit'
      return 'fa-bell'
    },
    getDialogColor() {
      if (this.type === 'alert') return '#1E90FF'
      if (this.type === 'confirm') return '#FF9F43'
      if (this.type === 'prompt') return '#2ED573'
      return '#1677ff'
    }
  },
  mounted() {
    if (typeof window !== 'undefined') {
      window.__lineManagerDialog = {
        prompt: (msg, defaultValue, title) => this.prompt(msg, defaultValue, title),
        alert: (msg, title) => this.alert(msg, title),
        confirm: (msg, title) => this.confirm(msg, title)
      }
    }
  }
}
