import { ref, onMounted, onUnmounted, computed } from 'vue'
import { observeThemeState } from '../utils/themeObserver.js'

export default {
    name: 'Topbar',
    setup() {
        const appVersion = ref('')
        const platform = ref('')
        const isDarkTheme = ref(false)
        const isDarwin = computed(() => platform.value === 'darwin')
        const isLinux = computed(() => platform.value === 'linux')

        let stopThemeObserver = null

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
            stopThemeObserver = observeThemeState((value) => {
                isDarkTheme.value = value
            })

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
            if (stopThemeObserver) {
                stopThemeObserver()
                stopThemeObserver = null
            }
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
    }}
