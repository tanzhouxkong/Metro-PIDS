import { ref, onMounted, computed } from 'vue'

export default {
    name: 'Topbar',
    setup() {
        const appVersion = ref('');
        const platform = ref('');
        const isDarwin = computed(() => platform.value === 'darwin');
        const isLinux = computed(() => platform.value === 'linux');
        
        onMounted(() => {
            // 获取平台信息
            if (window.electronAPI && window.electronAPI.platform) {
                platform.value = window.electronAPI.platform;
            }
            
            // 获取应用版本
            if (window.electronAPI && window.electronAPI.getAppVersion) {
                window.electronAPI.getAppVersion().then((res) => {
                    if (res && res.ok) {
                        appVersion.value = res.version || '';
                    }
                });
            }
        });
        
        return {
            appVersion,
            platform,
            isDarwin,
            isLinux
        };
    },
        template: `
        <div class="custom-titlebar" :class="{ darwin: isDarwin, linux: isLinux }" style="
            display: flex;
            align-items: center;
            flex-shrink: 0;
            height: 32px;
            width: 100%;
            z-index: 9999;
            background: transparent !important; /* 完全透明，让 mica-electron 的原生模糊效果透出 */
            /* 模糊效果由 mica-electron 原生控制，不使用 CSS backdrop-filter */
            /* 移除边框，避免重复边框 */
            color: var(--text, #333);
            padding-left: 12px;
            font-size: 14px;
            user-select: none;
            -webkit-app-region: drag;
        ">
            <!-- Windows: 左侧显示，MacOS: 居中显示 -->
            <div style="
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 0 8px;
            ">
                <i class="fas fa-subway" style="
                    color: var(--accent, #00b894);
                    font-size: 16px;
                "></i>
                <span style="
                    font-size: 13px;
                    font-weight: 600;
                    color: var(--text, #333);
                    white-space: nowrap;
                ">Metro PIDS Control</span>
                <span v-if="appVersion" style="
                    font-size: 10px;
                    color: var(--muted, #9aa0a6);
                    padding: 2px 6px;
                    background: rgba(0, 184, 148, 0.1);
                    border-radius: 4px;
                    margin-left: 4px;
                ">v{{ appVersion }}</span>
                                                </div>
                                </div>
        `
} 
