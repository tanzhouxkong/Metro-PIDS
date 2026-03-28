import { ref, onMounted, onUnmounted, computed } from 'vue'

export default {
    name: 'LineManagerTopbar',
    setup() {
        const appVersion = ref('');
        const platform = ref('');
        const isDarwin = computed(() => platform.value === 'darwin');
        const isLinux = computed(() => platform.value === 'linux');
        const isDarkTheme = ref(false);

        let themeObserver = null;
        let mediaQueryList = null;
        let mediaQueryHandler = null;

        const updateThemeState = () => {
            try {
                if (typeof document === 'undefined') return;
                const root = document.documentElement;
                const byClass = root.classList.contains('dark') || root.getAttribute('data-theme') === 'dark';
                const byMedia = typeof window !== 'undefined' && window.matchMedia
                    ? window.matchMedia('(prefers-color-scheme: dark)').matches
                    : false;
                isDarkTheme.value = byClass || byMedia;
            } catch (e) {
                isDarkTheme.value = false;
            }
        };

        const titleColor = computed(() => (isDarkTheme.value ? '#EAF2FF' : '#2F3542'));
        
        onMounted(() => {
            updateThemeState();

            if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined') {
                themeObserver = new MutationObserver(() => updateThemeState());
                themeObserver.observe(document.documentElement, {
                    attributes: true,
                    attributeFilter: ['class', 'data-theme']
                });
            }

            if (typeof window !== 'undefined' && window.matchMedia) {
                mediaQueryList = window.matchMedia('(prefers-color-scheme: dark)');
                mediaQueryHandler = () => updateThemeState();
                if (typeof mediaQueryList.addEventListener === 'function') {
                    mediaQueryList.addEventListener('change', mediaQueryHandler);
                } else if (typeof mediaQueryList.addListener === 'function') {
                    mediaQueryList.addListener(mediaQueryHandler);
                }
            }

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
            if (themeObserver) {
                themeObserver.disconnect();
                themeObserver = null;
            }
            if (mediaQueryList && mediaQueryHandler) {
                if (typeof mediaQueryList.removeEventListener === 'function') {
                    mediaQueryList.removeEventListener('change', mediaQueryHandler);
                } else if (typeof mediaQueryList.removeListener === 'function') {
                    mediaQueryList.removeListener(mediaQueryHandler);
                }
            }
            mediaQueryList = null;
            mediaQueryHandler = null;
        });
        
        return {
            appVersion,
            platform,
            isDarwin,
            isLinux,
            titleColor
        };
    }}
