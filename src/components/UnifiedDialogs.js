import { Teleport, Transition } from 'vue'
import { notification } from 'antdv-next'
import { i18n } from '../locales/index.js'

export default {
  name: 'UnifiedDialogs',
  components: { Teleport, Transition },
  data() {
    return {
      visible: false,
      title: '',
      msg: '',
      inputVal: '',
      type: 'alert',
      resolve: null,
      inputMenuVisible: false,
      inputMenuX: 0,
      inputMenuY: 0,
      shareCode: '',
      shareId: '',
      shareLength: 0
    }
  },
  computed: {
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
    onOverlayClick() {
      if (this.type === 'alert') return
      this.closeDialog(this.type === 'confirm' ? false : null)
    },
    closeDialog(result) {
      const resolver = this.resolve
      this.resolve = null
      this.visible = false
      this.inputMenuVisible = false
      if (resolver) resolver(result)
    },
    alert(msg, title) {
      this.title = title || '提示'
      this.msg = msg || ''
      this.type = 'alert'
      this.visible = true
      return new Promise((res) => { this.resolve = res })
    },
    confirm(msg, title) {
      this.title = title || '确认'
      this.msg = msg || ''
      this.type = 'confirm'
      this.visible = true
      return new Promise((res) => { this.resolve = res })
    },
    prompt(msg, defaultValue, title) {
      this.title = title || '输入'
      this.msg = msg || ''
      this.inputVal = defaultValue || ''
      this.type = 'prompt'
      this.visible = true
      return new Promise((res) => { this.resolve = res })
    },
    showShareCode(code, id, title) {
      this.title = title || '离线分享'
      this.shareCode = code || ''
      this.shareId = id || ''
      this.shareLength = code ? code.length : 0
      this.type = 'shareCode'
      this.visible = true
      return new Promise((res) => { this.resolve = res })
    },
    methodsBridge(action, msg, a2, a3) {
      if (action === 'alert') return this.alert(msg, a2)
      if (action === 'confirm') return this.confirm(msg, a2)
      if (action === 'prompt') return this.prompt(msg, a2, a3)
      if (action === 'shareCode') return this.showShareCode(msg, a2, a3)
      return Promise.resolve()
    },
    async copyShareCode() {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(this.shareCode)
        } else {
          const textarea = document.createElement('textarea')
          textarea.value = this.shareCode
          textarea.style.position = 'fixed'
          textarea.style.opacity = '0'
          document.body.appendChild(textarea)
          textarea.select()
          document.execCommand('copy')
          document.body.removeChild(textarea)
        }
        notification.success({
          message: i18n.global.t('console.presetShareCopiedTitle'),
          description: i18n.global.t('console.presetShareCopiedDesc', {
            shareId: this.shareId,
            length: this.shareCode ? this.shareCode.length : 0
          }),
          placement: 'topRight',
          duration: 4.5
        })
      } catch (e) {
        console.error('复制失败', e)
        notification.error({
          message: i18n.global.t('multiScreen.copyFailTitle'),
          description: String(e && e.message ? e.message : e),
          placement: 'topRight',
          duration: 4.5
        })
      }
    },
    getDialogIcon() {
      if (this.type === 'alert') return 'fa-info-circle'
      if (this.type === 'confirm') return 'fa-question-circle'
      if (this.type === 'prompt') return 'fa-edit'
      if (this.type === 'shareCode') return 'fa-share-alt'
      return 'fa-bell'
    },
    getDialogColor() {
      if (this.type === 'alert') return '#1E90FF'
      if (this.type === 'confirm') return '#FF9F43'
      if (this.type === 'prompt') return '#2ED573'
      if (this.type === 'shareCode') return '#1677ff'
      return '#1677ff'
    },
    isDarkTheme() {
      try {
        const el = document.documentElement
        return !!(el && (el.classList.contains('dark') || el.getAttribute('data-theme') === 'dark'))
      } catch (e) {
        return false
      }
    },
    onInputContextMenu(e) {
      try {
        e.preventDefault()
        e.stopPropagation()
        this.inputMenuVisible = true
        this.inputMenuX = e.clientX
        this.inputMenuY = e.clientY
      } catch (err) {}
    },
    closeInputMenu() {
      this.inputMenuVisible = false
    },
    async copyInput() {
      try {
        const text = this.inputVal || ''
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text)
        } else if (document && document.execCommand) {
          const input = document.getElementById('ud-input')
          if (input) {
            const prev = input.value
            input.value = text
            input.select()
            document.execCommand('copy')
            input.value = prev
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
          if (typeof text === 'string') {
            this.inputVal = text
          }
        }
      } catch (e) {
        console.error('粘贴失败', e)
      } finally {
        this.closeInputMenu()
      }
    }
  },
  mounted() {
    try {
      window.__ui = window.__ui || {}
      window.__ui.dialog = {
        alert: (m, t) => this.methodsBridge('alert', m, t),
        confirm: (m, t) => this.methodsBridge('confirm', m, t),
        prompt: (m, d, t) => this.methodsBridge('prompt', m, d, t),
        shareCode: (code, id, t) => this.methodsBridge('shareCode', code, id, t)
      }
    } catch (e) {}
  }}
