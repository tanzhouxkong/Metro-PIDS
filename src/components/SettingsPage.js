import { useUIState } from '../composables/useUIState.js'
import SlidePanel from './SlidePanel.js'

export default {
  name: 'SettingsPage',
  components: { SlidePanel },
  setup() {
    const { uiState } = useUIState()
    // 确保设置页面显示时，activePanel 是 panel-4
    if (uiState.activePanel !== 'panel-4') {
      uiState.activePanel = 'panel-4'
    }
    return { uiState }
  },
  template: `
    <div style="flex:1; display:flex; flex-direction:column; overflow:auto; background:var(--card);">
      <SlidePanel />
    </div>
  `
}

