import { reactive } from 'vue'

const uiState = reactive({
    activePanel: null, // 当前激活面板标识（如 'panel-1', 'panel-2'）
    sidebarCollapsed: false,
    showDisplay: false,
    autoLocked: false,
    showDevButton: false, // 是否显示开发者按钮
    // 自动播放弹窗用：暂停/继续回调与状态（由 ConsolePage/SlidePanel 的 startWithLock 注册）
    autoplayTogglePause: null,
    autoplayIsPausedRef: null,
    // 云控显示端相关：是否在界面中展示“系统显示器”选项（由云端配置控制）
    showSystemDisplayOption: true,
    // 云控显示端配置完整对象（包含 displays、时间范围、地理位置等），供其他组件使用
    displayFlags: null
})

export function useUIState() {
    function togglePanel(panelId) {
        if (uiState.activePanel === panelId) {
            uiState.activePanel = null
        } else {
            uiState.activePanel = panelId
        }
    }
    
    function closePanel() {
        uiState.activePanel = null
    }

    function toggleDisplay() {
        uiState.showDisplay = !uiState.showDisplay
    }

    return {
        uiState,
        togglePanel,
        closePanel,
        toggleDisplay
    }
}
