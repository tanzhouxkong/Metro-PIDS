import { ref, onMounted, computed } from 'vue'

export default {
    name: 'LineManagerTopbar',
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
        <div class="custom-titlebar lmw-titlebar" :class="{ darwin: isDarwin, linux: isLinux }">
            <div class="lmw-titlebar-left" style="-webkit-app-region: drag;">
                <i class="fas fa-folder-open" style="color: var(--accent, #00b894); font-size: 16px;"></i>
                <span style="font-size: 13px; font-weight: 600; color: var(--text, #333); white-space: nowrap;">线路管理器</span>
            </div>
            <div class="lmw-titlebar-slot">
                <slot></slot>
            </div>
            <div class="lmw-titlebar-spacer"></div>
        </div>
    `
}
