import { ref, onMounted, onUnmounted, computed } from 'vue'
import { observeThemeState } from '../utils/themeObserver.js'

export default {
    name: 'LineManagerTopbar',
    setup() {
        const appVersion = ref('');
        const platform = ref('');
        const isDarwin = computed(() => platform.value === 'darwin');
        const isLinux = computed(() => platform.value === 'linux');
        const isDarkTheme = ref(false);

        let stopThemeObserver = null;

        const titleColor = computed(() => (isDarkTheme.value ? '#EAF2FF' : '#2F3542'));
        
        onMounted(() => {
            stopThemeObserver = observeThemeState((value) => {
                isDarkTheme.value = value;
            });

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

        onUnmounted(() => {
            if (stopThemeObserver) {
                stopThemeObserver();
                stopThemeObserver = null;
            }
        });
        
        return {
            appVersion,
            platform,
            isDarwin,
            isLinux,
            titleColor
        };
    }}
