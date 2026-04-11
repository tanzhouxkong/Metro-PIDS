import { Teleport, Transition } from 'vue'
import { i18n } from '../locales/index.js'
import '../styles/cp-glass-modal-shell.css'
import '../styles/station-context-menu.css'

export default {
  name: 'LineManagerDialog',
  components: { Teleport, Transition },
  data() {
    return {
      visible: false,
      title: '',
      message: '',
      inputValue: '',
      inputMenuVisible: false,
      inputMenuX: 0,
      inputMenuY: 0,
      resolve: null,
      type: 'prompt' // 'prompt' | 'alert' | 'confirm'
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
      } catch (e) {}
      if (!blurEnabled) return { blur: 0, opacity: 1, color: isDark ? '#1c1c20' : '#ffffff' }
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
    tUd(key) {
      return i18n.global.t(`unifiedDialog.${key}`)
    },
    prompt(message, defaultValue = '', title = '输入') {
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
      this.inputMenuVisible = false
      if (resolver) resolver(result)
    },
    handleConfirm() {
      if (this.type === 'prompt') this.close(this.inputValue)
      else this.close(true)
    },
    handleCancel() {
      this.close(this.type === 'prompt' ? null : false)
    },
    onOverlayClick() {
      if (this.type === 'alert') return
      this.handleCancel()
    },
    onInputContextMenu(event) {
      try {
        event.preventDefault()
        event.stopPropagation()
        this.inputMenuVisible = true
        this.inputMenuX = event.clientX
        this.inputMenuY = event.clientY
        this.$nextTick(() => this.adjustInputMenuPosition())
      } catch (e) {}
    },
    adjustInputMenuPosition() {
      const el = this.$refs.inputMenuRef
      if (!el || typeof window === 'undefined') return
      const rect = el.getBoundingClientRect()
      const root = document.documentElement
      const vw = window.innerWidth || root.clientWidth || 0
      const vh = window.innerHeight || root.clientHeight || 0
      const margin = 8
      let x = this.inputMenuX
      let y = this.inputMenuY
      if (x + rect.width > vw - margin) x = Math.max(margin, vw - rect.width - margin)
      if (y + rect.height > vh - margin) y = Math.max(margin, vh - rect.height - margin)
      if (x < margin) x = margin
      if (y < margin) y = margin
      this.inputMenuX = x
      this.inputMenuY = y
    },
    closeInputMenu() {
      this.inputMenuVisible = false
    },
    async copyInput() {
      try {
        const text = this.inputValue || ''
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text)
        } else if (document && document.execCommand) {
          const input = document.getElementById('lm-dialog-input')
          if (input) {
            input.focus()
            input.select()
            document.execCommand('copy')
          }
        }
      } catch (e) {
        console.error('复制失败', e)
      } finally {
        this.closeInputMenu()
      }
    },
    async pasteInput() {
      try {
        if (navigator.clipboard && navigator.clipboard.readText) {
          const text = await navigator.clipboard.readText()
          if (typeof text === 'string') this.inputValue = text
        }
      } catch (e) {
        console.error('粘贴失败', e)
      } finally {
        this.closeInputMenu()
      }
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
      window.addEventListener('pointerdown', this.closeInputMenu, true)
    }
  },
  beforeUnmount() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('pointerdown', this.closeInputMenu, true)
    }
  }
}
