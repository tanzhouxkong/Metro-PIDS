import { ref, onMounted, onUnmounted, computed } from 'vue'

export default {
    name: 'Topbar',
    setup() {
        const appVersion = ref('')
        const platform = ref('')
        const isDarkTheme = ref(false)
        const isDarwin = computed(() => platform.value === 'darwin')
        const isLinux = computed(() => platform.value === 'linux')

        let themeObserver = null
        let mediaQueryList = null
        let mediaQueryHandler = null

        const updateThemeState = () => {
            try {
                if (typeof document === 'undefined') return
                const root = document.documentElement
                const byClass = root.classList.contains('dark') || root.getAttribute('data-theme') === 'dark'
                const byMedia = typeof window !== 'undefined' && window.matchMedia
                    ? window.matchMedia('(prefers-color-scheme: dark)').matches
                    : false
                isDarkTheme.value = byClass || byMedia
            } catch (e) {
                isDarkTheme.value = false
            }
        }

        const titlebarStyle = {
            display: 'flex',
            alignItems: 'center',
            flexShrink: '0',
            height: '32px',
            width: '100%',
            zIndex: 9999,
            background: 'transparent',
            color: 'var(--text, #333)',
            paddingLeft: '12px',
            fontSize: '14px',
            userSelect: 'none',
            WebkitUserSelect: 'none',
            WebkitAppRegion: 'drag'
        }

        const titleInnerStyle = {
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '0 8px'
        }

        const iconStyle = computed(() => ({
            color: titleTextStyle.value.color,
            fontSize: '16px'
        }))

        const titleTextStyle = computed(() => ({
            fontSize: '13px',
            fontWeight: 600,
            color: isDarkTheme.value ? '#EAF2FF' : '#2F3542',
            whiteSpace: 'nowrap'
        }))

        const versionChipStyle = computed(() => ({
            fontSize: '11px',
            color: titleTextStyle.value.color,
            padding: '2px 8px',
            background: isDarkTheme.value ? 'rgba(255, 255, 255, 0.14)' : 'rgba(0, 0, 0, 0.06)',
            borderRadius: '999px',
            marginLeft: '6px',
            fontWeight: 600,
            border: isDarkTheme.value
                ? '1px solid rgba(255, 255, 255, 0.22)'
                : '1px solid rgba(0, 0, 0, 0.18)'
        }))

        onMounted(() => {
            updateThemeState()

            if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined') {
                themeObserver = new MutationObserver(() => updateThemeState())
                themeObserver.observe(document.documentElement, {
                    attributes: true,
                    attributeFilter: ['class', 'data-theme']
                })
            }

            if (typeof window !== 'undefined' && window.matchMedia) {
                mediaQueryList = window.matchMedia('(prefers-color-scheme: dark)')
                mediaQueryHandler = () => updateThemeState()
                if (typeof mediaQueryList.addEventListener === 'function') {
                    mediaQueryList.addEventListener('change', mediaQueryHandler)
                } else if (typeof mediaQueryList.addListener === 'function') {
                    mediaQueryList.addListener(mediaQueryHandler)
                }
            }

            if (window.electronAPI && window.electronAPI.platform) {
                platform.value = window.electronAPI.platform
            }

            if (window.electronAPI && window.electronAPI.getAppVersion) {
                window.electronAPI.getAppVersion().then((res) => {
                    if (res && res.ok) {
                        appVersion.value = res.version || ''
                    }
                })
            }
        })

        onUnmounted(() => {
            if (themeObserver) {
                themeObserver.disconnect()
                themeObserver = null
            }
            if (mediaQueryList && mediaQueryHandler) {
                if (typeof mediaQueryList.removeEventListener === 'function') {
                    mediaQueryList.removeEventListener('change', mediaQueryHandler)
                } else if (typeof mediaQueryList.removeListener === 'function') {
                    mediaQueryList.removeListener(mediaQueryHandler)
                }
            }
            mediaQueryList = null
            mediaQueryHandler = null
        })

        return {
            appVersion,
            platform,
            isDarwin,
            isLinux,
            titlebarStyle,
            titleInnerStyle,
            iconStyle,
            titleTextStyle,
            versionChipStyle
        }
    },
    template: `
        <div class="custom-titlebar" :class="{ darwin: isDarwin, linux: isLinux }" :style="titlebarStyle">
            <div :style="titleInnerStyle">
                <i class="fas fa-subway" :style="iconStyle"></i>
                <span :style="titleTextStyle">Metro PIDS Control</span>
                <span v-if="appVersion" :style="versionChipStyle">v{{ appVersion }}</span>
            </div>
        </div>
    `
}
