import { useUIState } from '../composables/useUIState.js'
import SlidePanel from './SlidePanel.js'

export default {
  name: 'SettingsPage',
  components: { SlidePanel },
  setup() {
    const { uiState } = useUIState()
    // 不再自动设置 activePanel，由用户操作（点击侧边栏按钮）来控制
    // 这样可以确保默认启动页面是主页（activePanel 为 null）
    return { uiState }
  },
  template: `
    <div style="flex:1; display:flex; flex-direction:column; overflow:auto; background:var(--bg);">
      <SlidePanel />
    </div>
  `
}

