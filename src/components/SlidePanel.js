import { useUIState } from '../composables/useUIState.js'
import { useAutoplay } from '../composables/useAutoplay.js'
import { useFileIO } from '../composables/useFileIO.js'
import { usePidsState } from '../composables/usePidsState.js'
import { useController } from '../composables/useController.js'
import { useSettings } from '../composables/useSettings.js'
import { useCloudConfig, CLOUD_API_BASE } from '../composables/useCloudConfig.js'
import { useStationAudio } from '../composables/useStationAudio.js'
import { DEFAULT_SETTINGS } from '../utils/defaults.js'
import { createDisplaySdk } from '../utils/displaySdk.js'
import dialogService from '../utils/dialogService.js'
import { showNotification } from '../utils/notificationService.js'
import { notification } from 'antdv-next'
import { applyThroughOperation as mergeThroughLines } from '../utils/throughOperation.js'
import { ref, computed, watch, onMounted, onUnmounted, onBeforeUnmount, nextTick, reactive, toRefs, Teleport, Transition } from 'vue'
import ColorPicker from './ColorPicker.vue'
import { langs, setLocale, i18n } from '../locales/index.js'
import { resolveDisplayName as resolveDisplayNameI18n } from '../utils/displayLabels.js'
import '../styles/cp-glass-modal-shell.css'

const ENABLE_SLIDE_LOG = false;
const ENABLE_MAIN_LOG_BRIDGE = false; // 关闭主进程日志转发到渲染层

function isDevBuild() {
    try {
        if (typeof import.meta !== 'undefined' && import.meta.env && typeof import.meta.env.DEV === 'boolean') {
            return !!import.meta.env.DEV;
        }
    } catch (e) {
        // ignore
    }
    return false;
}

const IS_DEV_BUILD = isDevBuild();

let _slidePanelDisplaySdk = null;
function getSlidePanelDisplaySdk() {
  if (_slidePanelDisplaySdk) return _slidePanelDisplaySdk;
  try {
    _slidePanelDisplaySdk = createDisplaySdk({ enableWebSocket: true });
  } catch (e) {
    _slidePanelDisplaySdk = null;
  }
  return _slidePanelDisplaySdk;
}

export default {
  name: 'SlidePanel',
  components: { ColorPicker, Teleport, Transition },
  setup() {
    const isElectronRuntime = typeof navigator !== 'undefined' && /electron/i.test(navigator.userAgent || '');
    const { uiState, closePanel } = useUIState()
        const { state: pidsState, sync: syncState } = usePidsState()
        const { next: controllerNext, sync, getStep } = useController()
        const { settings, saveSettings } = useSettings()
        const cloudConfig = useCloudConfig(CLOUD_API_BASE)
        const { playArrive, playDepart } = useStationAudio(pidsState)

        const playAfterToggle = (prevIdx) => {
            if (settings.vehicleAudioEnabled === false) return;
            const idx = Number.isInteger(pidsState.rt?.idx) ? pidsState.rt.idx : prevIdx;
            if (idx == null) return;
            if (pidsState.rt?.state === 0) playArrive(idx);
            else playDepart(idx);
        };

        const controllerNextWithAudio = async () => {
            const prevIdx = Number.isInteger(pidsState.rt?.idx) ? pidsState.rt.idx : 0;
            await controllerNext();
            playAfterToggle(prevIdx);
        };


        // shouldStop：到达终点站时停止自动播放
        function shouldStop() {
            try {
                if (!pidsState || !pidsState.appData) return false;
                const meta = pidsState.appData.meta || {};
                const idx = (pidsState.rt && typeof pidsState.rt.idx === 'number') ? pidsState.rt.idx : 0;
                // 计算单线/短交路可行索引范围
                const sIdx = (meta.startIdx !== undefined && meta.startIdx !== -1) ? parseInt(meta.startIdx) : 0;
                const eIdx = (meta.termIdx !== undefined && meta.termIdx !== -1) ? parseInt(meta.termIdx) : (pidsState.appData.stations ? pidsState.appData.stations.length - 1 : 0);
                const minIdx = Math.min(sIdx, eIdx);
                const maxIdx = Math.max(sIdx, eIdx);

                // 环线模式不自动停止
                if (meta.mode === 'loop') return false;

                // 根据 getStep 判定方向（>0 向后，<0 向前）
                const step = (typeof getStep === 'function') ? getStep() : 1;
                const terminalIdx = step > 0 ? maxIdx : minIdx;

                // 仅当当前索引抵达方向终点且处于到站态(rt.state===0)才停止，避免刚启动即停
                const rtState = pidsState.rt && (typeof pidsState.rt.state === 'number') ? pidsState.rt.state : 0;
                if (idx === terminalIdx && rtState === 0) return true;
            } catch (e) {
                console.error('shouldStop error', e);
            }
            return false;
        }

        const autoplay = useAutoplay(controllerNextWithAudio, shouldStop)
        const { isPlaying, isPaused, nextIn, start, stop, togglePause } = autoplay

        function normalizeAutoplayIntervalSec(raw) {
            const n = Number(raw)
            if (!Number.isFinite(n)) return 8
            // 合理范围：1s ~ 3600s
            return Math.max(1, Math.min(3600, Math.round(n)))
        }

        function getAutoplayIntervalSec() {
            try {
                if (!settings.autoplay) settings.autoplay = { ...DEFAULT_SETTINGS.autoplay }
                const safe = normalizeAutoplayIntervalSec(settings.autoplay.intervalSec)
                settings.autoplay.intervalSec = safe
                return safe
            } catch (e) {
                return 8
            }
        }

        function applyAutoplayIntervalSec() {
            const safe = getAutoplayIntervalSec()
            try { saveSettings() } catch (e) {}
            // 若正在播放，立即用新间隔重启计时（保持锁定状态不变）
            if (isPlaying.value) {
                try { start(safe) } catch (e) {}
            }
        }
    const fileIO = useFileIO(pidsState)

    // 国际化：当前语言（简体 / 繁体 / 英文）
    const currentLocale = ref(i18n.global.locale.value || 'zh-CN')
        const showLanguageDropdown = ref(false)
        const showThemeModeDropdown = ref(false)
        const themeModeDropdownRef = ref(null)
        const languageDropdownRef = ref(null)
        const themeModeDropdownOpenUp = ref(false)
        const languageDropdownOpenUp = ref(false)
        const dropdownThemeDark = ref(false)
        let dropdownThemeObserver = null
        let dropdownThemeMediaQuery = null
        
        // 显示器3：车辆编组 / 当前车厢 / 屏幕位置下拉
        const showTrainFormationDropdown = ref(false)
        const showActiveCarDropdown = ref(false)
        const showVirtualPosDropdown = ref(false)
        const trainFormationDropdownOpenUp = ref(false)
        const activeCarDropdownOpenUp = ref(false)
        const virtualPosDropdownOpenUp = ref(false)
        const trainFormationDropdownRef = ref(null)
        const activeCarDropdownRef = ref(null)
        const virtualPosDropdownRef = ref(null)

        const languageOptions = langs

        const themeModeOptions = computed(() => [
            { key: 'system', title: i18n.global.t('settings.themeSystem') },
            { key: 'light', title: i18n.global.t('settings.themeLight') },
            { key: 'dark', title: i18n.global.t('settings.themeDark') }
        ])

        const currentThemeModeTitle = computed(() => {
            const option = themeModeOptions.value.find((opt) => opt.key === settings.themeMode)
            return option ? option.title : (settings.themeMode || 'system')
        })

        const selectThemeMode = (modeKey) => {
            settings.themeMode = modeKey
            saveSettings()
            showThemeModeDropdown.value = false
        }

        const getEffectiveViewportRect = (anchorEl) => {
            // SlidePanel 运行在一个被限制尺寸的容器内（如 #admin-app），
            // 直接用 window.innerHeight 会导致“剩余高度”判断不准，从而出现下拉被截断/方向反了。
            try {
                if (typeof window === 'undefined') return { top: 0, bottom: 0, left: 0, right: 0 }
                const vv = window.visualViewport
                const docEl = (typeof document !== 'undefined' && document.documentElement) ? document.documentElement : null

                // 优先基于当前元素所在的面板容器来计算可视边界
                const panel =
                    (anchorEl && typeof anchorEl.closest === 'function' && (anchorEl.closest('.panel-body') || anchorEl.closest('#admin-app'))) ||
                    (typeof document !== 'undefined' ? document.getElementById('admin-app') : null) ||
                    null
                if (panel && typeof panel.getBoundingClientRect === 'function') {
                    return panel.getBoundingClientRect()
                }

                // 兜底：使用 VisualViewport / documentElement 的可视尺寸
                const w = (vv && Number.isFinite(vv.width) ? vv.width : (docEl ? docEl.clientWidth : window.innerWidth)) || window.innerWidth
                const h = (vv && Number.isFinite(vv.height) ? vv.height : (docEl ? docEl.clientHeight : window.innerHeight)) || window.innerHeight
                return { top: 0, left: 0, right: w, bottom: h }
            } catch (e) {
                const w = (typeof window !== 'undefined' ? (window.innerWidth || 0) : 0)
                const h = (typeof window !== 'undefined' ? (window.innerHeight || 0) : 0)
                return { top: 0, left: 0, right: w, bottom: h }
            }
        }

        const resolveDropdownDirection = (containerRef, estimatedMenuHeight = 340) => {
            if (typeof window === 'undefined' || !containerRef || !containerRef.value) return false
            const rect = containerRef.value.getBoundingClientRect()
            const vp = getEffectiveViewportRect(containerRef.value)
            const spaceBelow = (vp.bottom - rect.bottom)
            const spaceAbove = (rect.top - vp.top)
            return spaceBelow < estimatedMenuHeight && spaceAbove > spaceBelow
        }

        const toggleThemeModeDropdown = () => {
            if (!showThemeModeDropdown.value) {
                themeModeDropdownOpenUp.value = resolveDropdownDirection(themeModeDropdownRef, 340)
            }
            showThemeModeDropdown.value = !showThemeModeDropdown.value
        }

        const currentLanguageTitle = computed(() => {
            const option = languageOptions.find((opt) => opt.key === currentLocale.value)
            return option ? option.title : (currentLocale.value || 'zh-CN')
        })

        const selectLanguage = (langKey) => {
            currentLocale.value = langKey
            changeLanguage()
            showLanguageDropdown.value = false
        }

        const toggleLanguageDropdown = () => {
            if (!showLanguageDropdown.value) {
                languageDropdownOpenUp.value = resolveDropdownDirection(languageDropdownRef, 340)
            }
            showLanguageDropdown.value = !showLanguageDropdown.value
        }

        const toggleTrainFormationDropdown = () => {
            if (!showTrainFormationDropdown.value) {
                trainFormationDropdownOpenUp.value = resolveDropdownDirection(trainFormationDropdownRef, 260)
            }
            showTrainFormationDropdown.value = !showTrainFormationDropdown.value
        }

        const selectTrainFormation = (value) => {
            const text = String(value || '').trim()
            const opt = display3TrainFormationOptions.find((o) => o.value === text)
            displayEdit.trainFormation = opt ? opt.value : '6'
            showTrainFormationDropdown.value = false

            // 编组变化时：确保当前车厢号有效（避免从大编组切到小编组后越界）
            try {
                const formationOption = display3TrainFormationOptions.find((o) => o.value === displayEdit.trainFormation)
                const totalCars = formationOption ? formationOption.groups.reduce((sum, g) => sum + g, 0) : 6
                const rawActive = Number(displayEdit.activeCarNo)
                if (!Number.isFinite(rawActive) || rawActive < 1 || rawActive > totalCars) {
                    displayEdit.activeCarNo = Math.ceil(totalCars / 2)
                }
            } catch (e) {}
        }

        const toggleActiveCarDropdown = () => {
            if (!showActiveCarDropdown.value) {
                activeCarDropdownOpenUp.value = resolveDropdownDirection(activeCarDropdownRef, 260)
            }
            showActiveCarDropdown.value = !showActiveCarDropdown.value
        }

        const selectActiveCar = (n) => {
            const num = Number(n)
            if (Number.isFinite(num) && num > 0) {
                displayEdit.activeCarNo = Math.floor(num)
            }
            showActiveCarDropdown.value = false
        }

        const toggleVirtualPosDropdown = () => {
            if (!showVirtualPosDropdown.value) {
                virtualPosDropdownOpenUp.value = resolveDropdownDirection(virtualPosDropdownRef, 260)
            }
            showVirtualPosDropdown.value = !showVirtualPosDropdown.value
        }

        const selectVirtualPos = (value) => {
            const text = String(value || '').trim().toLowerCase()
            if (['left', 'center', 'right'].includes(text)) {
                displayEdit.virtualPosition = text
            }
            showVirtualPosDropdown.value = false
        }

        const updateDropdownThemeState = () => {
            if (typeof document === 'undefined') {
                dropdownThemeDark.value = false
                return
            }
            const root = document.documentElement
            const explicitDark = root.classList.contains('dark') || root.getAttribute('data-theme') === 'dark'
            if (explicitDark) {
                dropdownThemeDark.value = true
                return
            }
            if (typeof window !== 'undefined' && window.matchMedia) {
                dropdownThemeDark.value = window.matchMedia('(prefers-color-scheme: dark)').matches
                return
            }
            dropdownThemeDark.value = false
        }

        const isDarkThemeActive = () => dropdownThemeDark.value
        const isGlassBlurEnabled = () => settings.blurEnabled !== false
        const glassTriggerBackdropFilter = () => (isGlassBlurEnabled() ? 'blur(24px) saturate(190%)' : 'none')
        const contextMenuBackdropFilter = () => (isGlassBlurEnabled() ? 'blur(24px) saturate(190%)' : 'none')

        /** 下拉菜单面板：与弹窗一致使用 v-glassmorphism（blur/opacity/color） */
        const glassDropdownDirective = computed(() => {
            const dark = isDarkThemeActive()
            if (!isGlassBlurEnabled()) {
                return { blur: 0, opacity: 1, color: dark ? '#1c1c20' : '#ffffff' }
            }
            return { blur: 12, opacity: 0.2, color: dark ? '#1c1c20' : '#ffffff' }
        })

        const glassMenuBackground = () => {
            if (!isGlassBlurEnabled()) return isDarkThemeActive() ? '#1c1c20' : '#ffffff'
            return isDarkThemeActive() ? 'rgba(30, 30, 30, 0.40)' : 'rgba(255,255,255,0.40)'
        }
        const glassMenuBorder = () => {
            if (!isGlassBlurEnabled()) return isDarkThemeActive() ? 'rgba(255,255,255,0.16)' : 'rgba(15,23,42,0.16)'
            return 'rgba(255,255,255,0.30)'
        }
        const glassMenuShadow = () => (
            '0 20px 60px rgba(0,0,0,0.3), 0 0 0 0.5px rgba(255,255,255,0.5) inset'
        )
        const glassItemHoverBackground = () => (isDarkThemeActive() ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.32)')
        const glassItemActiveBackground = () => (isDarkThemeActive() ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.38)')
        const glassDividerColor = () => (isDarkThemeActive() ? 'rgba(255,255,255,0.14)' : 'rgba(224,224,224,0.5)')

        const themeModeDropdownMenuStyle = computed(() => ({
            position: 'absolute',
            left: '0',
            right: '0',
            top: themeModeDropdownOpenUp.value ? 'auto' : 'calc(100% + 8px)',
            bottom: themeModeDropdownOpenUp.value ? 'calc(100% + 8px)' : 'auto',
            border: `1px solid ${glassMenuBorder()}`,
            borderRadius: '20px',
            boxShadow: glassMenuShadow(),
            maxHeight: 'min(460px, 56vh)',
            overflowY: 'auto',
            padding: '6px',
            zIndex: 9999
        }))

        const languageDropdownMenuStyle = computed(() => ({
            position: 'absolute',
            left: '0',
            right: '0',
            top: languageDropdownOpenUp.value ? 'auto' : 'calc(100% + 8px)',
            bottom: languageDropdownOpenUp.value ? 'calc(100% + 8px)' : 'auto',
            border: `1px solid ${glassMenuBorder()}`,
            borderRadius: '20px',
            boxShadow: glassMenuShadow(),
            maxHeight: 'min(460px, 56vh)',
            overflowY: 'auto',
            padding: '6px',
            zIndex: 9999
        }))

        
        const showUiVariantDropdown = ref(false);
        const uiVariantDropdownOpenUp = ref(false)
        const uiVariantDropdownRef = ref(null);
        function toggleUiVariantDropdown() {
            if (!showUiVariantDropdown.value) {
                uiVariantDropdownOpenUp.value = resolveDropdownDirection(uiVariantDropdownRef, 160)
            }
            showUiVariantDropdown.value = !showUiVariantDropdown.value;
        }
        function selectUiVariant(val) {
            // displayEdit 是 reactive，不是 ref；这里不能用 displayEdit.value
            displayEdit.display2UiVariant = val;
            showUiVariantDropdown.value = false;
        }

        const uiVariantDropdownMenuStyle = computed(() => ({
            position: 'absolute',
            left: '0',
            right: '0',
            top: uiVariantDropdownOpenUp.value ? 'auto' : 'calc(100% + 8px)',
            bottom: uiVariantDropdownOpenUp.value ? 'calc(100% + 8px)' : 'auto',
            border: `1px solid ${glassMenuBorder()}`,
            borderRadius: '12px',
            boxShadow: glassMenuShadow(),
            maxHeight: 'min(260px, 38vh)',
            overflowY: 'auto',
            padding: '6px',
            zIndex: 25001
        }))

        const activeCarDropdownMenuStyle = computed(() => ({
            position: 'absolute',
            left: '0',
            right: '0',
            top: activeCarDropdownOpenUp.value ? 'auto' : 'calc(100% + 8px)',
            bottom: activeCarDropdownOpenUp.value ? 'calc(100% + 8px)' : 'auto',
            border: `1px solid ${glassMenuBorder()}`,
            borderRadius: '12px',
            boxShadow: glassMenuShadow(),
            maxHeight: 'min(260px, 38vh)',
            overflowY: 'auto',
            padding: '6px',
            zIndex: 25001
        }))

        const virtualPosDropdownMenuStyle = computed(() => ({
            position: 'absolute',
            left: '0',
            right: '0',
            top: virtualPosDropdownOpenUp.value ? 'auto' : 'calc(100% + 8px)',
            bottom: virtualPosDropdownOpenUp.value ? 'calc(100% + 8px)' : 'auto',
            border: `1px solid ${glassMenuBorder()}`,
            borderRadius: '12px',
            boxShadow: glassMenuShadow(),
            maxHeight: 'min(260px, 38vh)',
            overflowY: 'auto',
            padding: '6px',
            zIndex: 25001
        }))
        onMounted(() => {
            const h = (e) => {
                if (uiVariantDropdownRef.value && !uiVariantDropdownRef.value.contains(e.target)) {
                    showUiVariantDropdown.value = false;
                }
            };
            document.addEventListener('click', h);
            onUnmounted(() => document.removeEventListener('click', h));
        });

        const dropdownTriggerStyle = computed(() => ({
            width: '100%',
            padding: '10px 12px',
            borderRadius: '10px',
            border: `1px solid ${glassMenuBorder()}`,
            background: glassMenuBackground(),
            backdropFilter: glassTriggerBackdropFilter(),
            WebkitBackdropFilter: glassTriggerBackdropFilter(),
            color: 'var(--text)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: glassMenuShadow()
        }))

        const display3TrainFormationOptions = [
            { value: '2', labelKey: 'display.display3Formation2', groups: [2] },
            { value: '3', labelKey: 'display.display3Formation3', groups: [3] },
            { value: '4', labelKey: 'display.display3Formation4', groups: [4] },
            { value: '5', labelKey: 'display.display3Formation5', groups: [5] },
            { value: '3+3', labelKey: 'display.display3Formation3x3', groups: [3, 3] },
            { value: '6', labelKey: 'display.display3Formation6', groups: [6] },
            { value: '7', labelKey: 'display.display3Formation7', groups: [7] },
            { value: '8', labelKey: 'display.display3Formation8', groups: [8] },
            { value: '4+4', labelKey: 'display.display3Formation4x4', groups: [4, 4] }
        ]

        const virtualPosOptions = [
            { value: 'left', labelKey: 'display.display3VirtualPosLeft' },
            { value: 'center', labelKey: 'display.display3VirtualPosCenter' },
            { value: 'right', labelKey: 'display.display3VirtualPosRight' }
        ]

        const trainFormationTitle = computed(() => {
            const opt = display3TrainFormationOptions.find((o) => o.value === displayEdit.trainFormation)
            return opt ? i18n.global.t(opt.labelKey) : i18n.global.t('display.display3Formation6')
        })

        function normalizeDisplay3TrainFormation(value) {
            const text = String(value ?? '').trim()
            const compact = text
                .toLowerCase()
                .replace(/编组|重联|consist|cars?|节/g, '')
                .replace(/\s+/g, '')
            const matched = display3TrainFormationOptions.find((item) => item.value === text || item.value === compact)
            return matched ? matched.value : '6'
        }

        const virtualPosTitle = computed(() => {
            const opt = virtualPosOptions.find((o) => o.value === displayEdit.virtualPosition)
            return opt ? i18n.global.t(opt.labelKey) : i18n.global.t('display.display3VirtualPosCenter')
        })

        const handlePreferencesDropdownOutsideClick = (event) => {
            const target = event.target
            if (
                showThemeModeDropdown.value &&
                themeModeDropdownRef.value &&
                !themeModeDropdownRef.value.contains(target)
            ) {
                showThemeModeDropdown.value = false
            }
            if (
                showLanguageDropdown.value &&
                languageDropdownRef.value &&
                !languageDropdownRef.value.contains(target)
            ) {
                showLanguageDropdown.value = false
            }
            if (
                showTrainFormationDropdown.value &&
                trainFormationDropdownRef.value &&
                !trainFormationDropdownRef.value.contains(target)
            ) {
                showTrainFormationDropdown.value = false
            }
            if (
                showActiveCarDropdown.value &&
                activeCarDropdownRef.value &&
                !activeCarDropdownRef.value.contains(target)
            ) {
                showActiveCarDropdown.value = false
            }
            if (
                showVirtualPosDropdown.value &&
                virtualPosDropdownRef.value &&
                !virtualPosDropdownRef.value.contains(target)
            ) {
                showVirtualPosDropdown.value = false
            }
        }

    // 语言切换：同时更新全局 i18n + 应用自身的简/繁配置（供显示端 3 使用）
    const changeLanguage = () => {
      const lang = currentLocale.value || 'zh-CN'
      // 1) vue-i18n 全局语言
      setLocale(lang)

      // 2) Metro-PIDS 自身设置：映射为 hkLang (sc / tc)，供 HKDisplay.vue 使用
      try {
        if (lang === 'zh-CN') {
          settings.hkLang = 'sc'
        } else if (lang === 'zh-TW') {
          settings.hkLang = 'tc'
        } else {
          // 英文暂时保持简体为基础
          settings.hkLang = 'sc'
        }
        // 持久化到 pids_settings_v1，并同步到主进程 / 显示端
        saveSettings()
      } catch (e) {
        console.warn('[SlidePanel] 切换语言时更新 settings.hkLang 失败:', e)
      }
    }

    const showMsg = async (msg, title) => dialogService.alert(msg, title)
    const askUser = async (msg, title) => dialogService.confirm(msg, title)
    const promptUser = async (msg, defaultValue, title) => dialogService.prompt(msg, defaultValue, title)

        const resetOnboardingGuide = async () => {
            try {
                const confirmed = await askUser(
                    i18n.global.t('about.onboarding.resetConfirm'),
                    i18n.global.t('about.onboarding.resetTitle')
                )
                if (!confirmed) return

                const api = (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.onboarding)
                    ? window.electronAPI.onboarding
                    : null
                if (!api || typeof api.reset !== 'function') {
                    await showMsg(i18n.global.t('about.onboarding.resetElectronOnly'), i18n.global.t('console.warning'))
                    return
                }

                const res = await api.reset()
                if (res && res.ok) {
                    try {
                        window.localStorage.removeItem('metro_pids_tour_active')
                        window.localStorage.removeItem('metro_pids_tour_step')
                    } catch (e) {}
                    await showMsg(i18n.global.t('about.onboarding.resetDone'), i18n.global.t('console.info'))
                    return
                }

                await showMsg(
                    i18n.global.t('about.onboarding.resetFailed', { error: (res && res.error) ? res.error : 'unknown' }),
                    i18n.global.t('console.error')
                )
            } catch (e) {
                await showMsg(
                    i18n.global.t('about.onboarding.resetFailed', { error: String((e && (e.message || e)) || e) }),
                    i18n.global.t('console.error')
                )
            }
        }

    // 检查是否有 Electron API
    const hasElectronAPI = computed(() => {
      return typeof window !== 'undefined' && window.electronAPI && window.electronAPI.startColorPick;
    });

        // 局域网 IP / 端口展示（用于 WebSocket Bridge / HTTP API 文案）
        const lanIps = ref([])
        const lanIpsResolved = computed(() => {
            if (lanIps.value && lanIps.value.length > 0) return lanIps.value
            if (typeof window !== 'undefined' && window.location) {
                return [window.location.hostname || 'localhost']
            }
            return ['localhost']
        })
        const wsPortDisplay = computed(() => settings.wsPort || 9400)
        const apiPortDisplay = 9001
        const multiScreenHttpPort = ref(5173)
        const multiScreenEntryUrl = computed(() => {
            const host = (lanIpsResolved.value && lanIpsResolved.value[0])
                ? lanIpsResolved.value[0]
                : ((typeof window !== 'undefined' && window.location) ? (window.location.hostname || '127.0.0.1') : '127.0.0.1')
            const port = Number(multiScreenHttpPort.value) || 5173
            return `http://${host}:${port}/examples/display-switcher.html`
        })
        const multiScreenQrUrl = computed(() => {
            const data = encodeURIComponent(multiScreenEntryUrl.value)
            return `https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=12&data=${data}`
        })
        const showMultiScreenQrDialog = ref(false)
        const showWsClientsDialog = ref(false)
        const wsClientsLoading = ref(false)
        const wsClients = ref([])

        const loadLanIps = async () => {
            try {
                if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.getLanIPs) {
                    const res = await window.electronAPI.getLanIPs()
                    if (res && res.ok && Array.isArray(res.ips)) {
                        lanIps.value = res.ips
                        return
                    }
                }
            } catch (e) {
                console.warn('[SlidePanel] 获取局域网 IP 失败:', e)
            }
            if (typeof window !== 'undefined' && window.location) {
                lanIps.value = [window.location.hostname || 'localhost']
            }
        }

        const loadMultiScreenHttpPort = async () => {
            try {
                if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.getMultiScreenPort) {
                    const res = await window.electronAPI.getMultiScreenPort()
                    const nextPort = Number(res && res.port)
                    if (res && res.ok && Number.isFinite(nextPort) && nextPort > 0 && nextPort <= 65535) {
                        multiScreenHttpPort.value = nextPort
                        return
                    }
                }
            } catch (e) {
                console.warn('[SlidePanel] 获取多屏入口端口失败:', e)
            }
            multiScreenHttpPort.value = 5173
        }

        const closeMultiScreenQrDialog = () => {
            showMultiScreenQrDialog.value = false
        }

        const openMultiScreenQrDialog = () => {
            showMultiScreenQrDialog.value = true
        }

        const closeWsClientsDialog = () => {
            showWsClientsDialog.value = false
        }

        const formatWsClientLatency = (latencyMs) => {
            if (latencyMs == null || !Number.isFinite(Number(latencyMs))) {
                return '未知'
            }
            return `${Number(latencyMs).toFixed(2)}ms`
        }

        const loadWsClients = async () => {
            wsClientsLoading.value = true
            try {
                if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.getWsClients) {
                    const res = await window.electronAPI.getWsClients()
                    if (res && res.ok && Array.isArray(res.clients)) {
                        wsClients.value = res.clients
                        return
                    }
                }
                wsClients.value = []
            } catch (e) {
                console.warn('[SlidePanel] 获取 WS 客户端列表失败:', e)
                wsClients.value = []
            } finally {
                wsClientsLoading.value = false
            }
        }

        const openWsClientsDialog = async () => {
            showWsClientsDialog.value = true
            await loadWsClients()
        }

        const copyMultiScreenEntryUrl = async () => {
            const url = multiScreenEntryUrl.value
            let copied = false
            try {
                if (navigator && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
                    await navigator.clipboard.writeText(url)
                    copied = true
                }
            } catch (e) {}
            if (!copied) {
                try {
                    const ta = document.createElement('textarea')
                    ta.value = url
                    ta.style.position = 'fixed'
                    ta.style.opacity = '0'
                    ta.style.pointerEvents = 'none'
                    document.body.appendChild(ta)
                    ta.focus()
                    ta.select()
                    copied = !!document.execCommand('copy')
                    document.body.removeChild(ta)
                } catch (e) {}
            }
            await showMsg(
                copied
                    ? i18n.global.t('multiScreen.copySuccessMsg')
                    : i18n.global.t('multiScreen.copyFailMsg', { url }),
                copied
                    ? i18n.global.t('multiScreen.copySuccessTitle')
                    : i18n.global.t('multiScreen.copyFailTitle')
            )
        }
    
    // 颜色选择器
    const showColorPicker = ref(false);
    const colorPickerInitialColor = ref('#000000');
    
    // 打开颜色选择器
    function openColorPicker() {
      colorPickerInitialColor.value = pidsState.appData.meta.themeColor || '#000000';
      showColorPicker.value = true;
    }
    
    // 确认颜色选择（运营模式下线路颜色变更：自动静默保存，不弹提示）
    async function onColorConfirm(color) {
      pidsState.appData.meta.themeColor = color;
      saveCfg();
      try {
        await fileIO.saveCurrentLine({ silent: true });
      } catch (e) {
        console.warn('[SlidePanel] 颜色变更静默保存失败', e);
      }
    }
    
    // 取色功能：打开颜色选择器弹窗
    function pickColor() {
      openColorPicker();
    }

    // 兼容旧数据，补齐 serviceMode
    if (!pidsState.appData.meta.serviceMode) pidsState.appData.meta.serviceMode = 'normal';
    
    // 初始化贯通线路设置字段
    // 兼容旧版本：如果存在 lineALineName 和 lineBLineName，转换为新格式
    if (pidsState.appData.meta.throughLineSegments === undefined) {
        if (pidsState.appData.meta.lineALineName && pidsState.appData.meta.lineBLineName) {
            // 迁移旧数据到新格式
            pidsState.appData.meta.throughLineSegments = [
                { lineName: pidsState.appData.meta.lineALineName, throughStationName: '' },
                { lineName: pidsState.appData.meta.lineBLineName, throughStationName: '' }
            ];
        } else {
            // 默认创建两个空的线路段
            pidsState.appData.meta.throughLineSegments = [
                { lineName: '', throughStationName: '' },
                { lineName: '', throughStationName: '' }
            ];
        }
    }
    if (pidsState.appData.meta.throughDirection === undefined) pidsState.appData.meta.throughDirection = '';
    if (pidsState.appData.meta.throughOperationEnabled === undefined) pidsState.appData.meta.throughOperationEnabled = false;
    
    // 兼容旧版本字段（保留用于向后兼容）
    if (pidsState.appData.meta.lineALineName === undefined) pidsState.appData.meta.lineALineName = '';
    if (pidsState.appData.meta.lineBLineName === undefined) pidsState.appData.meta.lineBLineName = '';
    if (pidsState.appData.meta.throughStationIdx === undefined) pidsState.appData.meta.throughStationIdx = -1;

    function changeServiceMode(mode) {
        const meta = pidsState.appData.meta || {};
        meta.serviceMode = mode;
        // 直达车：强制起终点为首尾
        if (mode === 'direct' && pidsState.appData.stations && pidsState.appData.stations.length > 0) {
            meta.startIdx = 0;
            meta.termIdx = pidsState.appData.stations.length - 1;
        }
        saveCfg();
    }

    const serviceModeLabel = computed(() => {
        const mode = (pidsState.appData.meta && pidsState.appData.meta.serviceMode) ? pidsState.appData.meta.serviceMode : 'normal';
        if (mode === 'express') return '大站车';
        if (mode === 'direct') return '直达';
        return '普通';
    });

    function switchLine(idx) {
        pidsState.store.cur = parseInt(idx);
        pidsState.appData = pidsState.store.list[pidsState.store.cur];
        pidsState.rt = { idx: 0, state: 0 };
        // 更新当前文件的路径信息
        if (pidsState.appData && pidsState.appData.meta && pidsState.appData.meta.lineName) {
            const filePath = pidsState.lineNameToFilePath[pidsState.appData.meta.lineName];
            if (filePath) {
                pidsState.currentFilePath = filePath;
            } else {
                pidsState.currentFilePath = null; // 如果没有找到路径，清空
            }
        }
        sync();
    }

    // 通过线路名称切换线路（folderPath 可选，来自线路管理器时传入，确保从正确目录刷新以得到正确的 currentFilePath）
    async function switchLineByName(lineName, folderPath = null) {
        await fileIO.refreshLinesFromFolder(true, folderPath);
        
        // 查找线路（移除颜色标记后比较）
        const cleanName = (name) => {
            if (!name) return '';
            return String(name).replace(/<[^>]+>([^<]*)<\/>/g, '$1');
        };
        const cleanRequestName = cleanName(lineName);
        
        const idx = pidsState.store.list.findIndex(l => {
            if (!l.meta || !l.meta.lineName) return false;
            const cleanLineName = cleanName(l.meta.lineName);
            return cleanLineName === cleanRequestName || l.meta.lineName === lineName;
        });
        
        if (idx >= 0) {
            switchLine(idx);
        }
    }

    async function newLine() {
        const name = await promptUser('请输入新线路名称 (例如: 3号线)', '新线路');
        if (!name) return;
        const newL = JSON.parse(JSON.stringify(pidsState.DEF));
        newL.meta.lineName = name;
        newL.meta.themeColor = '#' + Math.floor(Math.random()*16777215).toString(16);
        if (!newL.meta.serviceMode) newL.meta.serviceMode = 'normal';
        // 清空站点列表
        newL.stations = [];
        pidsState.store.list.push(newL);
        switchLine(pidsState.store.list.length - 1);
    }

    async function delLine() {
        if (pidsState.store.list.length <= 1) { await showMsg('至少保留一条线路！'); return; }
        if (!await askUser('确定要删除当前线路 "' + pidsState.appData.meta.lineName + '" 吗？\n删除后无法恢复！')) return;
        const deletedLineName = pidsState.appData.meta.lineName;
        pidsState.store.list.splice(pidsState.store.cur, 1);
        pidsState.store.cur = 0;
        pidsState.appData = pidsState.store.list[0];
        pidsState.rt = { idx: 0, state: 0 };
        // 清理删除的线路的路径信息
        if (deletedLineName && pidsState.lineNameToFilePath[deletedLineName]) {
            delete pidsState.lineNameToFilePath[deletedLineName];
        }
        // 更新当前文件的路径信息
        if (pidsState.appData && pidsState.appData.meta && pidsState.appData.meta.lineName) {
            const filePath = pidsState.lineNameToFilePath[pidsState.appData.meta.lineName];
            if (filePath) {
                pidsState.currentFilePath = filePath;
            } else {
                pidsState.currentFilePath = null;
            }
        } else {
            pidsState.currentFilePath = null;
        }
        sync();
    }

    function saveCfg() {
        sync();
    }

    async function applyShortTurn() {
        saveCfg();
        const startName = pidsState.appData.meta.startIdx >= 0 ? pidsState.appData.stations[pidsState.appData.meta.startIdx].name : '无';
        const termName = pidsState.appData.meta.termIdx >= 0 ? pidsState.appData.stations[pidsState.appData.meta.termIdx].name : '无';
        await showMsg(`短交路设置已应用！\n起点: ${startName}\n终点: ${termName}`);
    }

    async function clearShortTurn() {
        if (await askUser('确定要清除短交路设置吗？')) {
            pidsState.appData.meta.startIdx = -1;
            pidsState.appData.meta.termIdx = -1;
            saveCfg();
        }
    }

    // 贯通线路设置（支持多条线路）
    const throughLineSegments = ref([]); // 线路段数组，每个元素包含 { lineName, throughStationName }
    const lineStationsMap = ref({}); // 存储每个线路的站点列表 { lineName: stations[] }
    const lineSelectorTarget = ref(null); // 当前选择的线路段索引
    
    // 兼容旧版本：保留这些变量用于向后兼容
    const lineAStations = ref([]);
    const lineBStations = ref([]);
    
    // 打开线路管理器选择线路
    async function openLineManagerForThroughOperation(target) {
        lineSelectorTarget.value = target;
        // 通过 IPC 传递目标信息（在 Electron 环境中）
        if (window.electronAPI && window.electronAPI.openLineManager) {
            await window.electronAPI.openLineManager(target);
        } else {
            // 非 Electron 环境，使用 localStorage
            localStorage.setItem('throughOperationSelectorTarget', target);
            await openLineManagerWindow();
        }
    }
    
    // 处理从线路管理器返回的线路选择
    async function handleLineSelectedForThroughOperation(lineName, targetFromIPC, folderPath = null, runtimeLineData = null) {
        const meta = pidsState.appData.meta || {};
        // 优先使用 IPC 传递的 target，否则使用本地存储的
        const target = (targetFromIPC ?? lineSelectorTarget.value ?? localStorage.getItem('throughOperationSelectorTarget'));
        
        console.log('[贯通线路] handleLineSelectedForThroughOperation:', lineName, 'target:', target, 'targetFromIPC:', targetFromIPC, 'lineSelectorTarget.value:', lineSelectorTarget.value);
        
        if (!lineName) {
            console.warn('[贯通线路] 线路名称为空');
            return;
        }
        
        // 兼容旧版本：如果 target 是 'lineA' 或 'lineB'，转换为新格式
        if (target === 'lineA' || target === 'lineB') {
            if (target === 'lineA') {
                meta.lineALineName = lineName;
            } else {
                meta.lineBLineName = lineName;
            }
            // 更新到新格式
            if (!meta.throughLineSegments || meta.throughLineSegments.length === 0) {
                meta.throughLineSegments = [];
            }
            let segmentIndex = -1;
            if (target === 'lineA' && meta.throughLineSegments.length === 0) {
                meta.throughLineSegments.push({ lineName: lineName, throughStationName: '' });
                segmentIndex = 0;
            } else if (target === 'lineB' && meta.throughLineSegments.length === 1) {
                meta.throughLineSegments.push({ lineName: lineName, throughStationName: '' });
                segmentIndex = 1;
            } else if (target === 'lineA') {
                meta.throughLineSegments[0].lineName = lineName;
                segmentIndex = 0;
            } else if (target === 'lineB') {
                if (meta.throughLineSegments.length < 2) {
                    meta.throughLineSegments.push({ lineName: lineName, throughStationName: '' });
                    segmentIndex = meta.throughLineSegments.length - 1;
                } else {
                    meta.throughLineSegments[1].lineName = lineName;
                    segmentIndex = 1;
                }
            }
            // 加载该线路的站点列表
            if (segmentIndex >= 0) {
                if (runtimeLineData && Array.isArray(runtimeLineData.stations)) {
                    lineStationsMap.value[segmentIndex] = runtimeLineData.stations;
                } else {
                    await loadLineStations(lineName, segmentIndex, folderPath);
                }
            }
        } else if (typeof target === 'number' || (typeof target === 'string' && target.startsWith('segment-'))) {
            // 新格式：target 是线路段索引
            // 确保 throughLineSegments 数组存在
            if (!meta.throughLineSegments) {
                meta.throughLineSegments = [];
            }
            const segmentIndex = typeof target === 'number' ? target : parseInt(target.replace('segment-', ''));
            if (segmentIndex >= 0) {
                // 确保数组足够长
                while (meta.throughLineSegments.length <= segmentIndex) {
                    meta.throughLineSegments.push({ lineName: '', throughStationName: '' });
                }
                meta.throughLineSegments[segmentIndex].lineName = lineName;
                // 加载该线路的站点列表
                if (runtimeLineData && Array.isArray(runtimeLineData.stations)) {
                    lineStationsMap.value[segmentIndex] = runtimeLineData.stations;
                } else {
                    await loadLineStations(lineName, segmentIndex, folderPath);
                }
            }
        } else {
            console.warn('[贯通线路] 无效的 target:', target);
            return;
        }
        
        // 同步更新响应式数据
        throughLineSegments.value = [...(meta.throughLineSegments || [])];
        
        // 清除临时存储
        lineSelectorTarget.value = null;
        localStorage.removeItem('throughOperationSelectorTarget');
        
        // 立即保存配置，确保设置被持久化
        saveCfg();
        
        // 等待一下确保站点列表已更新，然后自动检测贯通站点
        await new Promise(resolve => setTimeout(resolve, 200));
        autoDetectThroughStations();
        // 再次保存，确保贯通站点也被保存
        saveCfg();
        
        // 再次同步更新响应式数据（贯通站点检测后可能更新了 throughStationName）
        throughLineSegments.value = [...(meta.throughLineSegments || [])];
        
        console.log('[贯通线路] 设置完成，线路段数:', meta.throughLineSegments?.length || 0);
    }
    
    // 加载线路的站点列表
    async function loadLineStations(lineName, segmentIndex, folderPath = null) {
        if (!lineName) {
            lineStationsMap.value[segmentIndex] = [];
            return;
        }
        
        const cleanName = (name) => {
            if (!name) return '';
            return String(name).replace(/<[^>]+>([^<]*)<\/>/g, '$1');
        };
        
        const line = pidsState.store.list.find(l => {
            return cleanName(l.meta?.lineName) === cleanName(lineName) || l.meta?.lineName === lineName;
        });
        
        if (line && line.stations) {
            lineStationsMap.value[segmentIndex] = line.stations;
        } else {
            // 不刷新全局线路列表，避免把正在编辑的贯通配置冲掉；改为按目标文件夹直读
            let loadedStations = null;
            if (folderPath && window.electronAPI?.lines?.list && window.electronAPI?.lines?.read) {
                try {
                    const items = await window.electronAPI.lines.list(folderPath);
                    if (Array.isArray(items) && items.length > 0) {
                        for (const item of items) {
                            const readRes = await window.electronAPI.lines.read(item.name, folderPath);
                            const lineData = (readRes && readRes.ok) ? readRes.content : null;
                            const candidateName = cleanName(lineData?.meta?.lineName);
                            if (candidateName && (candidateName === cleanName(lineName) || lineData?.meta?.lineName === lineName)) {
                                loadedStations = Array.isArray(lineData?.stations) ? lineData.stations : [];
                                break;
                            }
                        }
                    }
                } catch (e) {
                    console.warn('[贯通线路] 按文件夹读取线路站点失败:', e);
                }
            }
            lineStationsMap.value[segmentIndex] = loadedStations || [];
        }
    }
    
    // 当线路A改变时，更新站点列表
    async function onLineAChanged() {
        const meta = pidsState.appData.meta || {};
        if (!meta.lineALineName) {
            lineAStations.value = [];
            return;
        }
        
        // 直接从现有线路列表中查找，避免刷新导致数据丢失
        const cleanName = (name) => {
            if (!name) return '';
            return String(name).replace(/<[^>]+>([^<]*)<\/>/g, '$1');
        };
        
        const lineA = pidsState.store.list.find(l => {
            return cleanName(l.meta?.lineName) === cleanName(meta.lineALineName) || l.meta?.lineName === meta.lineALineName;
        });
        
        if (lineA && lineA.stations) {
            lineAStations.value = lineA.stations;
        } else {
            // 如果没找到，尝试刷新一次（但保存贯通设置）
            const savedLineALineName = meta.lineALineName;
            const savedLineBLineName = meta.lineBLineName;
            const savedThroughStationIdx = meta.throughStationIdx;
            const savedThroughDirection = meta.throughDirection;
            
            await fileIO.refreshLinesFromFolder(true);
            
            // 恢复贯通线路设置
            if (pidsState.appData && pidsState.appData.meta) {
                pidsState.appData.meta.lineALineName = savedLineALineName;
                pidsState.appData.meta.lineBLineName = savedLineBLineName;
                if (savedThroughStationIdx !== undefined) pidsState.appData.meta.throughStationIdx = savedThroughStationIdx;
                if (savedThroughDirection !== undefined) pidsState.appData.meta.throughDirection = savedThroughDirection;
            }
            
            // 再次查找
            const lineAAfterRefresh = pidsState.store.list.find(l => {
                return cleanName(l.meta?.lineName) === cleanName(savedLineALineName) || l.meta?.lineName === savedLineALineName;
            });
            
            if (lineAAfterRefresh && lineAAfterRefresh.stations) {
                lineAStations.value = lineAAfterRefresh.stations;
            } else {
                lineAStations.value = [];
            }
        }
    }
    
    // 当线路B改变时，更新站点列表
    async function onLineBChanged() {
        const meta = pidsState.appData.meta || {};
        if (!meta.lineBLineName) {
            lineBStations.value = [];
            return;
        }
        
        // 直接从现有线路列表中查找，避免刷新导致数据丢失
        const cleanName = (name) => {
            if (!name) return '';
            return String(name).replace(/<[^>]+>([^<]*)<\/>/g, '$1');
        };
        
        const lineB = pidsState.store.list.find(l => {
            return cleanName(l.meta?.lineName) === cleanName(meta.lineBLineName) || l.meta?.lineName === meta.lineBLineName;
        });
        
        if (lineB && lineB.stations) {
            lineBStations.value = lineB.stations;
        } else {
            // 如果没找到，尝试刷新一次（但保存贯通设置）
            const savedLineALineName = meta.lineALineName;
            const savedLineBLineName = meta.lineBLineName;
            const savedThroughStationIdx = meta.throughStationIdx;
            const savedThroughDirection = meta.throughDirection;
            
            await fileIO.refreshLinesFromFolder(true);
            
            // 恢复贯通线路设置
            if (pidsState.appData && pidsState.appData.meta) {
                pidsState.appData.meta.lineALineName = savedLineALineName;
                pidsState.appData.meta.lineBLineName = savedLineBLineName;
                if (savedThroughStationIdx !== undefined) pidsState.appData.meta.throughStationIdx = savedThroughStationIdx;
                if (savedThroughDirection !== undefined) pidsState.appData.meta.throughDirection = savedThroughDirection;
            }
            
            // 再次查找
            const lineBAfterRefresh = pidsState.store.list.find(l => {
                return cleanName(l.meta?.lineName) === cleanName(savedLineBLineName) || l.meta?.lineName === savedLineBLineName;
            });
            
            if (lineBAfterRefresh && lineBAfterRefresh.stations) {
                lineBStations.value = lineBAfterRefresh.stations;
            } else {
                lineBStations.value = [];
            }
        }
    }
    
    // 自动检测并设置贯通站点（查找A、B线路中重名的站点，在当前线路中查找）
    function autoDetectThroughStation() {
        const meta = pidsState.appData.meta || {};
        
        // 检查线路A和线路B是否都已选择
        if (!meta.lineALineName || !meta.lineBLineName) {
            throughStationIdx.value = -1;
            meta.throughStationIdx = -1;
            return;
        }
        
        if (lineAStations.value.length === 0 || lineBStations.value.length === 0) {
            throughStationIdx.value = -1;
            meta.throughStationIdx = -1;
            return;
        }
        
        // 清理站点名称（移除颜色标记）
        const cleanStationName = (name) => {
            if (!name) return '';
            return String(name).replace(/<[^>]+>([^<]*)<\/>/g, '$1').trim();
        };
        
        // 找出线路A和线路B中重复的站点名称
        const lineANames = new Set();
        lineAStations.value.forEach((st) => {
            const cleanName = cleanStationName(st.name);
            if (cleanName) {
                lineANames.add(cleanName);
            }
        });
        
        const lineBNames = new Set();
        lineBStations.value.forEach((st) => {
            const cleanName = cleanStationName(st.name);
            if (cleanName) {
                lineBNames.add(cleanName);
            }
        });
        
        // 找出同时存在于A和B线路的站点名称
        const commonNames = new Set();
        lineANames.forEach(name => {
            if (lineBNames.has(name)) {
                commonNames.add(name);
            }
        });
        
        // 调试信息
        console.log('[贯通站点检测] 线路A:', meta.lineALineName, '站点数:', lineAStations.value.length);
        console.log('[贯通站点检测] 线路B:', meta.lineBLineName, '站点数:', lineBStations.value.length);
        console.log('[贯通站点检测] 共同站点名称:', Array.from(commonNames));
        
        // 在线路A中查找第一个共同站点作为贯通站点
        // 注意：贯通站点索引应该在线路A或线路B中查找，不需要依赖当前线路
        // 我们使用线路A中的索引作为参考，合并时会自动转换为合并后的索引
        for (let idx = 0; idx < lineAStations.value.length; idx++) {
            const st = lineAStations.value[idx];
            const cleanName = cleanStationName(st.name);
            if (commonNames.has(cleanName)) {
                console.log('[贯通站点检测] ✓ 找到贯通站点:', cleanName, '在线路A中的索引:', idx);
                // 设置贯通站点索引（这里是在线路A中的索引，合并时会自动处理）
                // 为了兼容性，我们也可以尝试在当前线路中查找（如果当前线路是线路A或线路B）
                const currentLineName = cleanStationName(pidsState.appData.meta?.lineName || '');
                const cleanLineAName = cleanStationName(meta.lineALineName);
                const cleanLineBName = cleanStationName(meta.lineBLineName);
                const isCurrentLineA = currentLineName === cleanLineAName;
                const isCurrentLineB = currentLineName === cleanLineBName;
                
                if (isCurrentLineA || isCurrentLineB) {
                    // 如果当前线路是线路A或线路B，在当前线路中查找对应的索引
                    const currentStations = pidsState.appData.stations || [];
                    for (let currentIdx = 0; currentIdx < currentStations.length; currentIdx++) {
                        const currentSt = currentStations[currentIdx];
                        const currentCleanName = cleanStationName(currentSt.name);
                        if (currentCleanName === cleanName) {
                            console.log('[贯通站点检测] ✓ 在当前线路中找到贯通站点，索引:', currentIdx);
                            throughStationIdx.value = currentIdx;
                            meta.throughStationIdx = currentIdx;
                            return;
                        }
                    }
                }
                
                // 如果当前线路不是线路A或线路B，或者在当前线路中找不到，使用线路A中的索引
                // 注意：这个索引会在合并时被转换为合并后的索引
                console.log('[贯通站点检测] ✓ 使用线路A中的索引:', idx, '(合并时会自动转换)');
                throughStationIdx.value = idx;
                meta.throughStationIdx = idx;
                // 同时保存线路A中的索引，以便合并时使用
                meta.throughStationIdxInLineA = idx;
                return;
            }
        }
        
        // 如果没找到，清除设置
        console.log('[贯通站点检测] ✗ 未找到匹配的贯通站点');
        throughStationIdx.value = -1;
        meta.throughStationIdx = -1;
    }
    
    // 自动检测并设置贯通站点（支持多条线路）
    function autoDetectThroughStations() {
        const meta = pidsState.appData.meta || {};
        const segments = meta.throughLineSegments || [];
        
        if (segments.length < 2) {
            console.log('[贯通站点检测] 线路段数量不足，至少需要2段');
            return;
        }
        
        // 清理站点名称（移除颜色标记）
        const cleanStationName = (name) => {
            if (!name) return '';
            return String(name).replace(/<[^>]+>([^<]*)<\/>/g, '$1').trim();
        };
        
        // 为每相邻的两段线路检测贯通站点
        for (let i = 0; i < segments.length - 1; i++) {
            const currentSegment = segments[i];
            const nextSegment = segments[i + 1];
            
            if (!currentSegment.lineName || !nextSegment.lineName) {
                continue;
            }
            
            const currentStations = lineStationsMap.value[i] || [];
            const nextStations = lineStationsMap.value[i + 1] || [];
            
            if (currentStations.length === 0 || nextStations.length === 0) {
                console.log(`[贯通站点检测] 段${i + 1}或段${i + 2}的站点列表为空`);
                continue;
            }
            
            // 找出两段线路中重复的站点名称
            const currentNames = new Set();
            currentStations.forEach((st) => {
                const cleanName = cleanStationName(st.name);
                if (cleanName) {
                    currentNames.add(cleanName);
                }
            });
            
            const nextNames = new Set();
            nextStations.forEach((st) => {
                const cleanName = cleanStationName(st.name);
                if (cleanName) {
                    nextNames.add(cleanName);
                }
            });
            
            // 找出共同站点（记录站点名称和索引）
            const commonStations = [];
            currentStations.forEach((st, currentIdx) => {
                const cleanName = cleanStationName(st.name);
                if (cleanName && nextNames.has(cleanName)) {
                    // 在当前段和下一段中都查找这个站点
                    const nextIdx = nextStations.findIndex((nextSt) => cleanStationName(nextSt.name) === cleanName);
                    if (nextIdx >= 0) {
                        commonStations.push({
                            name: cleanName,
                            currentIdx: currentIdx,  // 在当前段中的索引
                            nextIdx: nextIdx         // 在下一段中的索引
                        });
                    }
                }
            });
            
            if (commonStations.length > 0) {
                if (commonStations.length === 1) {
                    // 如果只有一个共同站点，自动选择
                    const throughStationName = commonStations[0].name;
                    currentSegment.throughStationName = throughStationName;
                    currentSegment.candidateThroughStations = undefined; // 清除候选列表
                    console.log(`[贯通站点检测] ✓ 段${i + 1}和段${i + 2}的贯通站点: ${throughStationName} (唯一共同站点)`);
                } else {
                    // 如果有多个共同站点，保存候选列表，不自动选择，让用户手动选择
                    currentSegment.candidateThroughStations = commonStations.map(s => s.name);
                    // 如果没有已选择的贯通站点，使用第一个作为默认值
                    if (!currentSegment.throughStationName || !currentSegment.candidateThroughStations.includes(currentSegment.throughStationName)) {
                        currentSegment.throughStationName = commonStations[0].name;
                    }
                    console.log(`[贯通站点检测] ⚠ 段${i + 1}和段${i + 2}找到${commonStations.length}个共同站点，请手动选择:`, currentSegment.candidateThroughStations);
                }
            } else {
                console.warn(`[贯通站点检测] ✗ 段${i + 1}和段${i + 2}未找到共同站点`);
                currentSegment.throughStationName = '';
                currentSegment.candidateThroughStations = undefined; // 清除候选列表
            }
        }
        
        // 最后一段不需要贯通站点
        if (segments.length > 0) {
            segments[segments.length - 1].throughStationName = '';
            segments[segments.length - 1].candidateThroughStations = undefined;
        }
        
        // 保存配置
        saveCfg();
    }
    
    // 清理站点名称（移除颜色标记）的辅助函数
    function cleanStationName(name) {
        if (!name) return '';
        return String(name).replace(/<[^>]+>([^<]*)<\/>/g, '$1').trim();
    }
    
    // 初始化时加载已保存的线路段
    async function initThroughOperationLines() {
        const meta = pidsState.appData.meta || {};
        
        // 兼容旧版本：如果存在 lineALineName 和 lineBLineName，转换为新格式
        if (!meta.throughLineSegments || meta.throughLineSegments.length === 0) {
            if (meta.lineALineName && meta.lineBLineName) {
                meta.throughLineSegments = [
                    { lineName: meta.lineALineName, throughStationName: '' },
                    { lineName: meta.lineBLineName, throughStationName: '' }
                ];
            } else {
                // 默认创建两个空的线路段
                meta.throughLineSegments = [
                    { lineName: '', throughStationName: '' },
                    { lineName: '', throughStationName: '' }
                ];
            }
        }
        
        // 确保至少有两个线路段
        while (meta.throughLineSegments.length < 2) {
            meta.throughLineSegments.push({ lineName: '', throughStationName: '' });
        }
        
        throughLineSegments.value = [...(meta.throughLineSegments || [])];
        
        // 加载每个线路段的站点列表
        for (let i = 0; i < throughLineSegments.value.length; i++) {
            const segment = throughLineSegments.value[i];
            if (segment.lineName) {
                await loadLineStations(segment.lineName, i);
            }
        }
        
        // 等待站点列表加载完成
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // 自动检测贯通站点
        autoDetectThroughStations();
        
        // 同步更新响应式数据（贯通站点检测后可能更新了 throughStationName）
        throughLineSegments.value = [...(meta.throughLineSegments || [])];
    }
    
    // 添加线路段
    function addThroughLineSegment() {
        const meta = pidsState.appData.meta || {};
        if (!meta.throughLineSegments) {
            meta.throughLineSegments = [];
        }
        meta.throughLineSegments.push({ lineName: '', throughStationName: '' });
        throughLineSegments.value = meta.throughLineSegments;
        saveCfg();
    }
    
    // 删除线路段
    async function removeThroughLineSegment(index) {
        const meta = pidsState.appData.meta || {};
        if (!meta.throughLineSegments || index < 0 || index >= meta.throughLineSegments.length) {
            return;
        }
        
        if (meta.throughLineSegments.length <= 2) {
            await showMsg('至少需要保留2条线路');
            return;
        }
        
        meta.throughLineSegments.splice(index, 1);
        // 同步更新响应式数据
        throughLineSegments.value = [...meta.throughLineSegments];
        
        // 清除对应的站点列表
        delete lineStationsMap.value[index];
        // 重新索引站点列表
        const newMap = {};
        Object.keys(lineStationsMap.value).forEach(key => {
            const keyNum = parseInt(key);
            if (keyNum > index) {
                newMap[keyNum - 1] = lineStationsMap.value[key];
            } else if (keyNum < index) {
                newMap[keyNum] = lineStationsMap.value[key];
            }
        });
        lineStationsMap.value = newMap;
        
        // 重新检测贯通站点
        await new Promise(resolve => setTimeout(resolve, 100));
        autoDetectThroughStations();
        // 同步更新响应式数据（贯通站点检测后可能更新了 throughStationName）
        throughLineSegments.value = [...meta.throughLineSegments];
        saveCfg();
    }
    
    // 打开线路管理器选择指定段的线路
    async function openLineManagerForSegment(segmentIndex) {
        lineSelectorTarget.value = segmentIndex;
        const target = `segment-${segmentIndex}`;
        if (window.electronAPI && window.electronAPI.openLineManager) {
            await window.electronAPI.openLineManager(target);
        } else {
            localStorage.setItem('throughOperationSelectorTarget', target);
            await openLineManagerWindow();
        }
    }
    
    async function applyThroughOperation() {
        const meta = pidsState.appData.meta || {};
        const throughDirection = meta.throughDirection;
        const cleanText = (text) => {
            if (text === null || text === undefined) return '';
            return String(text).replace(/<[^>]+>([^<]*)<\/[^>]+>/g, '$1').trim();
        };
        const normalizeForCompare = (text) => cleanText(text).normalize('NFKC').replace(/\s+/g, '').toLowerCase();
        const getSegmentLineName = (seg) => {
            if (!seg || typeof seg !== 'object') return '';
            return cleanText(
                seg.lineName ||
                seg.line ||
                seg.line_name ||
                seg.sourceLineName ||
                seg.name ||
                ''
            );
        };
        const getSegmentThroughStationName = (seg) => {
            if (!seg || typeof seg !== 'object') return '';
            return cleanText(
                seg.throughStationName ||
                seg.throughStation ||
                seg.transferStationName ||
                seg.interchangeStationName ||
                seg.joinStationName ||
                ''
            );
        };
        const getStationDisplayName = (station) => {
            if (!station) return '';
            if (typeof station === 'string') return cleanText(station);
            return cleanText(
                station.name ||
                station.stationName ||
                station.zh ||
                station.cn ||
                station.displayName ||
                ''
            );
        };
        const findLineByName = (lineName, storeList) => {
            const target = normalizeForCompare(lineName);
            if (!target) return null;
            return storeList.find((line) => {
                const candidate = normalizeForCompare(line && line.meta ? line.meta.lineName : '');
                return candidate && candidate === target;
            }) || null;
        };
        const detectThroughStationBetweenLines = (currentLineName, nextLineName, storeList) => {
            const currentLine = findLineByName(currentLineName, storeList);
            const nextLine = findLineByName(nextLineName, storeList);
            if (!currentLine || !nextLine) return '';
            const currentStations = Array.isArray(currentLine.stations) ? currentLine.stations : [];
            const nextStations = Array.isArray(nextLine.stations) ? nextLine.stations : [];
            if (!currentStations.length || !nextStations.length) return '';

            const nextNameSet = new Set();
            nextStations.forEach((station) => {
                const normalized = normalizeForCompare(getStationDisplayName(station));
                if (normalized) nextNameSet.add(normalized);
            });

            for (const station of currentStations) {
                const displayName = getStationDisplayName(station);
                const normalized = normalizeForCompare(displayName);
                if (normalized && nextNameSet.has(normalized)) {
                    return displayName;
                }
            }
            return '';
        };

        // 使用界面显示的 throughLineSegments 作为数据源，避免线路切换或刷新导致 meta 与界面不同步
        const rawSegments = (throughLineSegments.value && throughLineSegments.value.length > 0)
            ? throughLineSegments.value
            : (meta.throughLineSegments || []);
        const segments = rawSegments.map((segment) => ({
            ...(segment || {}),
            lineName: getSegmentLineName(segment),
            throughStationName: getSegmentThroughStationName(segment)
        }));
        // 先同步到 meta，确保数据一致
        meta.throughLineSegments = [...segments];
        throughLineSegments.value = [...segments];
        saveCfg();
        
        // 检查是否有足够的线路段
        if (!segments || segments.length < 2) {
            await showMsg('至少需要选择2条线路才能进行贯通');
            return;
        }
        
        // 检查所有线路段是否都已选择线路
        for (let i = 0; i < segments.length; i++) {
            if (!segments[i].lineName) {
                await showMsg(`请选择第${i + 1}段线路`);
                return;
            }
        }
        
        if (!throughDirection) {
            await showMsg('请选择贯通方向');
            return;
        }
        
        try {
            // 获取所有线路列表
            const storeList = pidsState.store?.list || [];
            if (!storeList || storeList.length === 0) {
                await showMsg('无法获取线路列表，请刷新线路数据');
                return;
            }

            for (let i = 0; i < segments.length - 1; i++) {
                if (!segments[i].throughStationName || !segments[i].throughStationName.trim()) {
                    const detected = detectThroughStationBetweenLines(segments[i].lineName, segments[i + 1].lineName, storeList);
                    if (detected) segments[i].throughStationName = detected;
                }
            }
            meta.throughLineSegments = [...segments];
            throughLineSegments.value = [...segments];
            saveCfg();

            for (let i = 0; i < segments.length - 1; i++) {
                if (!segments[i].throughStationName || !segments[i].throughStationName.trim()) {
                    await showMsg(`第${i + 1}段和第${i + 2}段之间未找到贯通站点，请确保这两条线路有重名站点`);
                    return;
                }
            }
            
            // 合并多条线路（创建一个新的合并线路）
            console.log('[贯通线路] 在控制面板中创建合并线路，线路段数:', segments.length);
            const mergedData = mergeThroughLines(pidsState.appData, storeList, {
                throughLineSegments: segments,
                throughDirection: throughDirection
            });
            
            if (!mergedData || !mergedData.stations || mergedData.stations.length === 0) {
                await showMsg('合并线路失败，请检查线路数据');
                return;
            }
            
            // 设置合并线路的名称和元数据
            const lineNames = segments.map(s => s.lineName).join(' - ');
            const mergedLineName = `${lineNames} (贯通)`;
            mergedData.meta.lineName = mergedLineName;
            mergedData.meta.throughOperationEnabled = true;
            mergedData.meta.throughLineSegments = segments;
            mergedData.meta.throughDirection = throughDirection;
            
            // 将合并后的线路添加到线路列表中
            pidsState.store.list.push(mergedData);
            
            // 切换到新创建的合并线路
            const newLineIndex = pidsState.store.list.length - 1;
            // 使用 nextTick 确保数据更新后再切换
            await nextTick();
            switchLine(newLineIndex);
            
            // 再次等待，确保切换完成
            await nextTick();
            
            // 重置当前索引为0
            pidsState.rt.idx = 0;
            pidsState.rt.state = 0;
            
            // 保存配置
            saveCfg();
            
            // 同步到显示端
            sync();
            
            const directionText = throughDirection === 'up' ? '上行' : (throughDirection === 'down' ? '下行' : (throughDirection === 'outer' ? '外环' : '内环'));
            const throughStations = segments.slice(0, -1).map(s => s.throughStationName).filter(s => s).join('、');
            
            console.log('[贯通线路] 合并完成，站点数:', mergedData.stations.length);
            await showMsg(`贯通线路已创建！\n线路名称: ${mergedLineName}\n线路段数: ${segments.length}\n贯通站点: ${throughStations || '无'}\n贯通方向: ${directionText}\n合并后站点数: ${mergedData.stations.length}\n\n已自动切换到新创建的贯通线路`);
        } catch (error) {
            console.error('[贯通线路] 合并失败:', error);
            await showMsg('合并线路时发生错误: ' + (error.message || error));
        }
    }

    async function clearThroughOperation() {
        if (await askUser('确定要清除贯通线路设置吗？\n注意：这将清除贯通线路配置，但不会删除已创建的贯通线路。')) {
            try {
                const meta = pidsState.appData.meta || {};
                meta.lineALineName = '';
                meta.lineBLineName = '';
                meta.throughStationIdx = -1;
                meta.throughDirection = '';
                meta.throughOperationEnabled = false;
                lineALineName.value = '';
                lineBLineName.value = '';
                lineAStations.value = [];
                lineBStations.value = [];
                throughStationIdx.value = -1;
                
                saveCfg();
                
                await showMsg('贯通线路设置已清除');
            } catch (error) {
                console.error('[贯通线路] 清除失败:', error);
                await showMsg('清除贯通线路设置时发生错误: ' + (error.message || error));
            }
        }
    }

    // 短交路预设管理
    const shortTurnPresets = ref([]);
    const presetContextMenu = ref({ visible: false, x: 0, y: 0, preset: null }); // 预设右键菜单
    
    // 生成分享ID（针对每次分享）
    function generateShareId() {
      try {
        const timestamp = Date.now().toString(36);
        const randomPart = Math.random().toString(36).substring(2, 10);
        const hash = (str) => {
          let h = 0;
          for (let i = 0; i < str.length; i++) {
            h = ((h << 5) - h) + str.charCodeAt(i);
            h = h & h;
          }
          return Math.abs(h).toString(16).toUpperCase();
        };
        const shareId = `SHARE-${timestamp}-${randomPart}-${hash(new Date().toISOString())}`;
        return shareId;
      } catch (e) {
        console.error('生成分享ID失败:', e);
        return 'SHARE-' + Date.now().toString(36);
      }
    }
    
    async function loadShortTurnPresets() {
        if (!window.electronAPI || !window.electronAPI.shortturns) {
            return;
        }
        try {
            const currentLineName = pidsState.appData?.meta?.lineName || null;
            const presets = await window.electronAPI.shortturns.list(currentLineName);
            shortTurnPresets.value = Array.isArray(presets) ? presets : [];
        } catch (e) {
            console.error('加载短交路预设失败:', e);
            shortTurnPresets.value = [];
        }
    }

    async function saveShortTurnPreset() {
        if (!window.electronAPI || !window.electronAPI.shortturns) {
            await showMsg('仅 Electron 环境支持保存短交路预设');
            return;
        }
        const startIdx = pidsState.appData.meta.startIdx;
        const termIdx = pidsState.appData.meta.termIdx;
        if (startIdx === -1 || termIdx === -1) {
            await showMsg('请先设置短交路的起点和终点');
            return;
        }
        const startName = pidsState.appData.stations[startIdx]?.name || `站点${startIdx + 1}`;
        const termName = pidsState.appData.stations[termIdx]?.name || `站点${termIdx + 1}`;
        const defaultName = `${startName}→${termName}`;
        const existingNames = new Set(shortTurnPresets.value.map(p => p.name));
        let suggestedName = defaultName;
        let n = 1;
        while (existingNames.has(suggestedName)) {
            suggestedName = `${defaultName} ${++n}`;
        }
        const presetName = await promptUser('请输入预设名称（留空使用建议名称）', suggestedName);
        const finalName = (presetName && presetName.trim()) ? presetName.trim() : suggestedName;
        if (!finalName) return;
        try {
            const presetData = {
                lineName: pidsState.appData.meta.lineName,
                startIdx: startIdx,
                termIdx: termIdx,
                startStationName: pidsState.appData.stations[startIdx]?.name || '',
                termStationName: pidsState.appData.stations[termIdx]?.name || '',
                createdAt: new Date().toISOString()
            };
            const res = await window.electronAPI.shortturns.save(finalName, presetData);
            if (res && res.ok) {
                notification.success({
                    message: i18n.global.t('console.presetSavedSuccess'),
                    description: i18n.global.t('console.presetSavedNotifyDesc'),
                    placement: 'topRight',
                    duration: 4.5
                })
                await loadShortTurnPresets();
            } else {
                await showMsg('保存失败: ' + (res && res.error));
            }
        } catch (e) {
            await showMsg('保存失败: ' + e.message);
        }
    }

    async function loadShortTurnPreset(presetName) {
        if (!window.electronAPI || !window.electronAPI.shortturns) {
            await showMsg('仅 Electron 环境支持加载短交路预设');
            return;
        }
        try {
            const res = await window.electronAPI.shortturns.read(presetName);
            if (res && res.ok && res.content) {
                const preset = res.content;
                // 验证当前线路名称是否匹配
                if (preset.lineName && preset.lineName !== pidsState.appData.meta.lineName) {
                    if (!(await askUser(`此预设属于线路"${preset.lineName}"，当前线路是"${pidsState.appData.meta.lineName}"，是否继续加载？`))) {
                        return;
                    }
                }
                const stations = pidsState.appData.stations || [];
                const stationCount = stations.length || 0;

                // 优先按站名匹配当前线路中的索引，避免「增删站点」或「预设版本变化」导致索引错位
                const resolveIndex = (name, fallbackIdx) => {
                    if (name) {
                        const found = stations.findIndex(st => st && st.name === name);
                        if (found !== -1) return found;
                    }
                    if (typeof fallbackIdx === 'number' && fallbackIdx >= 0 && fallbackIdx < stationCount) {
                        return fallbackIdx;
                    }
                    return -1;
                };

                const startIdxResolved = resolveIndex(preset.startStationName, preset.startIdx);
                const termIdxResolved  = resolveIndex(preset.termStationName,  preset.termIdx);

                if (startIdxResolved === -1 || termIdxResolved === -1) {
                    await showMsg('预设的起点/终点与当前线路不匹配（可能线路站点已被增删或调整），请重新设置短交路并重新保存预设。');
                    return;
                }

                pidsState.appData.meta.startIdx = startIdxResolved;
                pidsState.appData.meta.termIdx = termIdxResolved;
                saveCfg();
                const startName = stations[startIdxResolved]?.name || `站点${startIdxResolved + 1}`;
                const termName  = stations[termIdxResolved]?.name  || `站点${termIdxResolved + 1}`;
                await showMsg(`已加载预设: ${presetName}\n起点: ${startName}\n终点: ${termName}`);
            } else {
                await showMsg('加载失败: ' + (res && res.error));
            }
        } catch (e) {
            await showMsg('加载失败: ' + e.message);
        }
    }

    async function deleteShortTurnPreset(presetName) {
        if (!window.electronAPI || !window.electronAPI.shortturns) {
            await showMsg('仅 Electron 环境支持删除短交路预设');
            return;
        }
        if (!(await askUser(`确定要删除预设"${presetName}"吗？`))) {
            return;
        }
        try {
            const res = await window.electronAPI.shortturns.delete(presetName);
            if (res && res.ok) {
                notification.success({
                    message: i18n.global.t('console.presetDeletedSuccess'),
                    description: i18n.global.t('console.presetDeletedNotifyDesc'),
                    placement: 'topRight',
                    duration: 4.5
                })
                await loadShortTurnPresets();
            } else {
                await showMsg('删除失败: ' + (res && res.error));
            }
        } catch (e) {
            await showMsg('删除失败: ' + e.message);
        }
    }

    // 显示预设右键菜单
    function showPresetContextMenu(event, preset) {
        event.preventDefault();
        event.stopPropagation();
        
        presetContextMenu.value = {
            visible: true,
            x: event.clientX,
            y: event.clientY,
            preset: preset
        };
        
        // 使用 nextTick 在菜单渲染后调整位置
        nextTick(() => {
            const menuElement = document.querySelector('[data-preset-context-menu]');
            if (menuElement) {
                const rect = menuElement.getBoundingClientRect();
                const vp = getEffectiveViewportRect(event && event.target ? event.target : null);
                const viewportWidth = (vp.right - vp.left) || window.innerWidth;
                const viewportHeight = (vp.bottom - vp.top) || window.innerHeight;
                
                let x = event.clientX;
                let y = event.clientY;
                
                // 如果菜单会在右侧被截断，调整到左侧
                if ((x - (vp.left || 0)) + rect.width > viewportWidth) {
                    x = event.clientX - rect.width;
                }
                
                // 如果菜单会在底部被截断，调整到上方
                if ((y - (vp.top || 0)) + rect.height > viewportHeight) {
                    y = event.clientY - rect.height;
                }
                
                // 确保不会超出左边界
                if (x < (vp.left || 0)) x = (vp.left || 0) + 10;
                
                // 确保不会超出上边界
                if (y < (vp.top || 0)) y = (vp.top || 0) + 10;
                
                // 更新位置
                presetContextMenu.value.x = x;
                presetContextMenu.value.y = y;
            }
        });
    }
    
    // 关闭预设右键菜单
    function closePresetContextMenu() {
        presetContextMenu.value.visible = false;
    }
    
    // 从菜单加载预设
    async function applyPresetFromMenu() {
        if (!presetContextMenu.value.preset) return;
        const presetName = presetContextMenu.value.preset.name;
        closePresetContextMenu(); // 先关闭右键菜单，再弹出对话框
        if (!presetName) return;
        await loadShortTurnPreset(presetName);
    }
    
    // 从菜单删除预设
    async function deletePresetFromMenu() {
        if (!presetContextMenu.value.preset) return;
        const presetName = presetContextMenu.value.preset.name;
        closePresetContextMenu(); // 先关闭右键菜单，再弹出对话框
        if (!presetName) return;
        await deleteShortTurnPreset(presetName);
    }
    
    // 辅助函数：将字符串转换为 Base64（支持 UTF-8）
    function stringToBase64(str) {
        try {
            return btoa(unescape(encodeURIComponent(str)));
        } catch (e) {
            console.error('Base64编码失败:', e);
            return btoa(str);
        }
    }

    // 辅助函数：从 Base64 解码为字符串（支持 UTF-8）
    function base64ToString(b64) {
        try {
            return decodeURIComponent(escape(atob(b64)));
        } catch (e) {
            console.error('Base64解码失败:', e);
            try {
                return atob(b64);
            } catch {
                return '';
            }
        }
    }

    // 生成预设分享码（离线分享）
    async function sharePresetOffline() {
        if (!presetContextMenu.value.preset) return;
        const preset = presetContextMenu.value.preset;
        // 先关闭右键菜单，避免与弹窗叠加
        closePresetContextMenu();
        try {
            // 生成唯一分享ID
            const shareId = generateShareId();
            
            // 创建分享数据包
            const shareData = {
                type: 'preset-share',
                version: '1.0',
                shareId: shareId,
                timestamp: new Date().toISOString(),
                lineName: preset.lineName,
                presetName: preset.name,
                data: {
                    startIdx: preset.startIdx,
                    termIdx: preset.termIdx,
                    startStationName: preset.startStationName,
                    termStationName: preset.termStationName,
                    createdAt: preset.createdAt
                }
            };
            
            const shareCode = stringToBase64(JSON.stringify(shareData));
            
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(shareCode);
                notification.success({
                    message: i18n.global.t('console.presetShareCopiedTitle'),
                    description: i18n.global.t('console.presetShareCopiedDesc', { shareId, length: shareCode.length }),
                    placement: 'topRight',
                    duration: 4.5
                })
            } else {
                const msg = `${i18n.global.t('console.presetShareCode')}（请手动复制）:\n\n${shareCode}\n\n${i18n.global.t('console.presetShareId')}: ${shareId}`;
                await showMsg(msg, i18n.global.t('console.presetShareOfflineTitle'));
            }
        } catch (e) {
            console.error('生成分享码错误:', e);
            await showMsg('生成分享码失败: ' + e.message, '错误');
        }
    }

    // 从分享码导入预设（离线导入）
    async function importPresetFromShareCode() {
        // 打开弹窗前先关闭右键菜单
        closePresetContextMenu();

        if (!window.electronAPI || !window.electronAPI.shortturns) {
            await showMsg('仅 Electron 环境支持导入分享码', '提示');
            return;
        }

        try {
            const inputCode = await promptUser(i18n.global.t('console.presetShareCodePrompt'), '', i18n.global.t('console.presetShareCode'));
            if (!inputCode || !inputCode.trim()) {
                return;
            }
            const shareCode = inputCode.trim();

            const jsonText = base64ToString(shareCode);
            if (!jsonText) {
                await showMsg('分享码格式不正确或已损坏', '错误');
                return;
            }

            let shareData;
            try {
                shareData = JSON.parse(jsonText);
            } catch (e) {
                console.error('解析分享码 JSON 失败:', e);
                await showMsg('分享码内容不是有效的 JSON 数据', '错误');
                return;
            }

            if (!shareData || shareData.type !== 'preset-share' || !shareData.data) {
                await showMsg('分享码类型不匹配或缺少必要字段', '错误');
                return;
            }

            const presetDataFromShare = shareData.data || {};
            const defaultName =
                shareData.presetName ||
                `${presetDataFromShare.startStationName || '起点'}→${presetDataFromShare.termStationName || '终点'}`;

            const nameInput = await promptUser(
                '请输入导入后的预设名称（留空使用分享中的名称）',
                defaultName,
                '导入分享码'
            );
            const finalName = (nameInput && nameInput.trim()) || defaultName;
            if (!finalName) return;

            const presetToSave = {
                lineName: shareData.lineName || (pidsState.appData?.meta?.lineName || ''),
                startIdx: typeof presetDataFromShare.startIdx === 'number' ? presetDataFromShare.startIdx : -1,
                termIdx: typeof presetDataFromShare.termIdx === 'number' ? presetDataFromShare.termIdx : -1,
                startStationName: presetDataFromShare.startStationName || '',
                termStationName: presetDataFromShare.termStationName || '',
                createdAt: presetDataFromShare.createdAt || new Date().toISOString(),
                shareId: shareData.shareId || '',
                importedAt: new Date().toISOString()
            };

            const res = await window.electronAPI.shortturns.save(finalName, presetToSave);
            if (res && res.ok) {
                await showMsg('预设已从分享码导入并保存', '成功');
                await loadShortTurnPresets();
            } else {
                await showMsg('导入失败: ' + (res && res.error), '错误');
            }
        } catch (e) {
            console.error('导入分享码失败:', e);
            await showMsg('导入分享码失败: ' + (e.message || e), '错误');
        } finally {
            closePresetContextMenu();
        }
    }

    // 监听线路切换，自动加载预设列表
    watch(() => pidsState.appData?.meta?.lineName, async () => {
        if (window.electronAPI && window.electronAPI.shortturns) {
            await loadShortTurnPresets();
        }
    }, { immediate: true });

    // 监听分辨率缩放变化
    let lastDevicePixelRatio = typeof window !== 'undefined' ? window.devicePixelRatio : 1;
    let scaleCheckInterval = null;

    function checkScaleChange() {
        if (typeof window === 'undefined') return;
        const currentRatio = window.devicePixelRatio || 1;
        if (Math.abs(currentRatio - lastDevicePixelRatio) > 0.01) {
            // 缩放发生变化
            const scalePercent = Math.round(currentRatio * 100);
            showNotification('系统分辨率缩放已更改', `当前缩放比例：${scalePercent}%，显示效果可能受到影响`, {
                tag: 'scale-changed',
                urgency: 'normal'
            });
            lastDevicePixelRatio = currentRatio;
        }
    }

    // 处理线路切换请求（统一处理 Electron 和网页环境）
    async function handleSwitchLineRequest(lineName, target, folderPath = null) {
        // 检查是否是为贯通线路选择（优先使用传递的 target，否则使用 localStorage）
        const throughTarget = (target ?? lineSelectorTarget.value ?? localStorage.getItem('throughOperationSelectorTarget'));
        console.log('[线路切换] 收到线路切换请求:', lineName, 'target:', throughTarget, 'folderPath:', folderPath);
        
        // 检查是否是为贯通线路选择（支持旧格式 'lineA'/'lineB' 和新格式 'segment-0'/'segment-1' 或数字）
        const isThroughOperation = throughTarget === 'lineA' || 
                                   throughTarget === 'lineB' || 
                                   (typeof throughTarget === 'number') ||
                                   (typeof throughTarget === 'string' && throughTarget.startsWith('segment-'));
        
        if (isThroughOperation) {
            console.log('[贯通线路] 处理贯通线路选择');
            await handleLineSelectedForThroughOperation(lineName, throughTarget, folderPath);
            // 重要：处理完贯通线路选择后，不要切换当前显示的线路
            return; // 提前返回，避免执行 switchLineByName
        } else {
            console.log('[线路切换] 处理普通线路切换');
            await switchLineByName(lineName, folderPath);
        }
    }

    // 存储清理函数（用于网页环境的事件监听器）
    let cleanupWebListeners = null;
    let cleanupWsPortAutoSwitchListener = null;

    // 处理云控/运控线路数据（Electron 与网页环境共用，用于“应用”云控线路）
    async function applyRuntimeLineData(lineData) {
        if (!lineData || !lineData.meta || !lineData.meta.lineName) {
            console.warn('[云控线路] 无效的线路数据:', lineData);
            return;
        }
        try {
            let effectiveLineData = lineData;
            const lineName = String(lineData.meta.lineName || '').trim();
            const hasCloudAudioHint = !!(
                (lineData.meta && lineData.meta.cloudAudioAvailable === true) ||
                (lineData.meta && Number(lineData.meta.cloudAudioCount || 0) > 0) ||
                (lineData.meta && lineData.meta.cloudAudioFiles && typeof lineData.meta.cloudAudioFiles === 'object' && Object.keys(lineData.meta.cloudAudioFiles).length > 0)
            );

            if (!hasCloudAudioHint && lineName) {
                try {
                    const full = await cloudConfig.getRuntimeLine(lineName);
                    const fetched = full?.data || full?.line || null;
                    const fetchedHasCloudAudioHint = !!(
                        fetched?.meta?.cloudAudioAvailable === true ||
                        Number(fetched?.meta?.cloudAudioCount || 0) > 0 ||
                        (fetched?.meta?.cloudAudioFiles && typeof fetched.meta.cloudAudioFiles === 'object' && Object.keys(fetched.meta.cloudAudioFiles).length > 0)
                    );
                    if (fetched && fetchedHasCloudAudioHint) {
                        effectiveLineData = fetched;
                    }
                } catch (e) {
                    console.warn('[云控线路] 补拉完整线路失败，继续使用当前数据:', e);
                }
            }

            pidsState.appData = JSON.parse(JSON.stringify(effectiveLineData));
            pidsState.rt = { idx: 0, state: 0 };
            pidsState.currentFilePath = null;

            try {
                const cloudMap = effectiveLineData?.meta?.cloudAudioFiles;
                const audioKeys = cloudMap && typeof cloudMap === 'object' ? Object.keys(cloudMap) : [];
                const source = effectiveLineData?.meta?.cloudAudioSource || 'unknown';
                const shardCount = Number(effectiveLineData?.meta?.cloudAudioShardCount || 0);
                console.log('[云控线路] 音频加载状态:', {
                    lineName: effectiveLineData?.meta?.lineName || lineName,
                    cloudAudioCount: audioKeys.length,
                    cloudAudioSource: source,
                    cloudAudioShardCount: shardCount,
                    sampleAudioPaths: audioKeys.slice(0, 8)
                });
            } catch (e) {
                console.warn('[云控线路] 打印音频加载日志失败:', e);
            }

            saveCfg();
            sync();
            console.log('[云控线路] 已成功应用云控线路:', effectiveLineData?.meta?.lineName || lineData.meta.lineName);
        } catch (e) {
            console.error('[云控线路] 应用失败:', e);
        }
    }

    // 监听来自线路管理器的线路切换请求
    onMounted(async () => {
        if (typeof document !== 'undefined') {
            document.addEventListener('pointerdown', handlePreferencesDropdownOutsideClick, true)
            updateDropdownThemeState()
            dropdownThemeObserver = new MutationObserver(() => updateDropdownThemeState())
            dropdownThemeObserver.observe(document.documentElement, {
                attributes: true,
                attributeFilter: ['class', 'data-theme']
            })
            if (typeof window !== 'undefined' && window.matchMedia) {
                dropdownThemeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
                if (typeof dropdownThemeMediaQuery.addEventListener === 'function') {
                    dropdownThemeMediaQuery.addEventListener('change', updateDropdownThemeState)
                } else if (typeof dropdownThemeMediaQuery.addListener === 'function') {
                    dropdownThemeMediaQuery.addListener(updateDropdownThemeState)
                }
            }
        }
        // Electron 环境：通过 IPC 监听
        if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.onSwitchLineRequest) {
            try {
                window.electronAPI.onSwitchLineRequest(async (lineName, target, folderPath) => {
                    await handleSwitchLineRequest(lineName, target, folderPath);
                });
            } catch (e) {
                console.warn('无法设置线路切换监听:', e);
            }
            if (window.electronAPI.onSwitchRuntimeLine) {
                try {
                    window.electronAPI.onSwitchRuntimeLine(async (payloadOrLineData) => {
                        const isPayloadObject = !!(payloadOrLineData && typeof payloadOrLineData === 'object' && Object.prototype.hasOwnProperty.call(payloadOrLineData, 'lineData'));
                        const runtimeLineData = isPayloadObject ? payloadOrLineData.lineData : payloadOrLineData;
                        const target = isPayloadObject ? payloadOrLineData.target : null;
                        const isThroughOperation = target === 'lineA' || target === 'lineB' || typeof target === 'number' || (typeof target === 'string' && target.startsWith('segment-'));

                        if (isThroughOperation) {
                            const runtimeLineName = runtimeLineData?.meta?.lineName;
                            if (runtimeLineName) {
                                await handleLineSelectedForThroughOperation(runtimeLineName, target, null, runtimeLineData);
                                return;
                            }
                        }

                        applyRuntimeLineData(runtimeLineData);
                    });
                } catch (e) {
                    console.warn('无法设置云控线路切换监听:', e);
                }
            }
            if (window.electronAPI.onWsPortAutoSwitched) {
                try {
                    cleanupWsPortAutoSwitchListener = window.electronAPI.onWsPortAutoSwitched((payload) => {
                        const nextPort = Number(payload && payload.to);
                        if (!Number.isFinite(nextPort) || nextPort < 1 || nextPort > 65535) return;
                        if (Number(settings.wsPort || 9400) === nextPort) return;
                        settings.wsPort = nextPort;
                        saveSettings();
                        loadLanIps();
                    });
                } catch (e) {
                    console.warn('无法设置 WS 端口自动切换监听:', e);
                }
            }
        }

        // 加载局域网 IP，便于设置页展示
        loadLanIps();
        loadMultiScreenHttpPort();
        
        // 网页环境：监听 postMessage 和 storage 事件
        if (typeof window !== 'undefined' && (!window.electronAPI || !window.electronAPI.onSwitchLineRequest)) {
            // 监听 postMessage（来自线路管理器窗口）
            const messageHandler = async (event) => {
                // 安全检查：只接受来自同源的消息
                if (event.data && event.data.type === 'switch-line-request') {
                    const { lineName, target, folderPath } = event.data;
                    await handleSwitchLineRequest(lineName, target, folderPath);
                } else if (event.data && event.data.type === 'switch-runtime-line') {
                    // 处理运控线路切换
                    const { lineData, target } = event.data;
                    const isThroughOperation = target === 'lineA' || target === 'lineB' || typeof target === 'number' || (typeof target === 'string' && target.startsWith('segment-'));
                    if (lineData) {
                        if (isThroughOperation && lineData?.meta?.lineName) {
                            await handleLineSelectedForThroughOperation(lineData.meta.lineName, target, null, lineData);
                        } else {
                            await applyRuntimeLineData(lineData);
                        }
                    }
                }
            };
            window.addEventListener('message', messageHandler);
            
            // 监听 storage 事件（用于同源页面通信）
            const storageHandler = async (event) => {
                if (event.key === 'lineManagerSelectedLine' && event.newValue) {
                    // 检查是否是运控线路
                    const isRuntimeLine = localStorage.getItem('isRuntimeLine') === 'true';
                    if (isRuntimeLine) {
                        // 运控线路：从 runtimeLineData 获取数据
                        const runtimeData = localStorage.getItem('runtimeLineData');
                        const target = localStorage.getItem('lineManagerSelectedTarget');
                        const isThroughOperation = target === 'lineA' || target === 'lineB' || (typeof target === 'string' && target.startsWith('segment-'));
                        if (runtimeData) {
                            try {
                                const lineData = JSON.parse(runtimeData);
                                if (isThroughOperation && lineData?.meta?.lineName) {
                                    await handleLineSelectedForThroughOperation(lineData.meta.lineName, target, null, lineData);
                                } else {
                                    await applyRuntimeLineData(lineData);
                                }
                            } catch (e) {
                                console.error('[运控线路] 解析数据失败:', e);
                            }
                        }
                        // 清理
                        localStorage.removeItem('runtimeLineData');
                        localStorage.removeItem('isRuntimeLine');
                        localStorage.removeItem('lineManagerSelectedLine');
                        localStorage.removeItem('lineManagerSelectedTarget');
                    } else {
                        // 预设线路：正常处理
                        const lineName = event.newValue;
                        const target = localStorage.getItem('lineManagerSelectedTarget');
                        await handleSwitchLineRequest(lineName, target);
                        // 清理 localStorage
                        localStorage.removeItem('lineManagerSelectedLine');
                        localStorage.removeItem('lineManagerSelectedTarget');
                    }
                }
            };
            window.addEventListener('storage', storageHandler);
            
            // 定期检查 localStorage（作为备用方案，因为 storage 事件可能在某些情况下不触发）
            const checkInterval = setInterval(() => {
                if (document && document.hidden) return;
                const lineName = localStorage.getItem('lineManagerSelectedLine');
                if (lineName) {
                    // 检查是否是运控线路
                    const isRuntimeLine = localStorage.getItem('isRuntimeLine') === 'true';
                    if (isRuntimeLine) {
                        const runtimeData = localStorage.getItem('runtimeLineData');
                        const target = localStorage.getItem('lineManagerSelectedTarget');
                        const isThroughOperation = target === 'lineA' || target === 'lineB' || (typeof target === 'string' && target.startsWith('segment-'));
                        if (runtimeData) {
                            try {
                                const lineData = JSON.parse(runtimeData);
                                if (isThroughOperation && lineData?.meta?.lineName) {
                                    handleLineSelectedForThroughOperation(lineData.meta.lineName, target, null, lineData);
                                } else {
                                    applyRuntimeLineData(lineData);
                                }
                            } catch (e) {
                                console.error('[运控线路] 解析数据失败:', e);
                            }
                        }
                        // 清理
                        localStorage.removeItem('runtimeLineData');
                        localStorage.removeItem('isRuntimeLine');
                        localStorage.removeItem('lineManagerSelectedLine');
                        localStorage.removeItem('lineManagerSelectedTarget');
                    } else {
                        // 预设线路：正常处理
                        const target = localStorage.getItem('lineManagerSelectedTarget');
                        handleSwitchLineRequest(lineName, target);
                        // 清理 localStorage
                        localStorage.removeItem('lineManagerSelectedLine');
                        localStorage.removeItem('lineManagerSelectedTarget');
                    }
                }
            }, 2000);
            
            // 保存清理函数
            cleanupWebListeners = () => {
                window.removeEventListener('message', messageHandler);
                window.removeEventListener('storage', storageHandler);
                clearInterval(checkInterval);
            };
        }
        
        // 初始化预设线路文件（仅在首次启动时）
        try {
            await fileIO.initDefaultLines();
        } catch (e) {
            console.warn('初始化预设线路失败:', e);
        }

        // 启动分辨率缩放监听（每5秒检查一次）
        if (typeof window !== 'undefined') {
            lastDevicePixelRatio = window.devicePixelRatio || 1;
            scaleCheckInterval = setInterval(checkScaleChange, 5000);
        }
        
        // 初始化贯通线路设置
        initThroughOperationLines();
        
        // 监听来自API的编辑显示端请求
        if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.onEditDisplayRequest) {
            try {
                window.electronAPI.onEditDisplayRequest(async (displayId, displayData) => {
                    try {
                        const result = await editDisplayInternal(displayId, displayData);
                        // 发送响应回主进程
                        if (window.electronAPI.sendEditDisplayResult) {
                            window.electronAPI.sendEditDisplayResult(result);
                        }
                    } catch (e) {
                        console.error('[SlidePanel] API编辑显示端失败:', e);
                        if (window.electronAPI.sendEditDisplayResult) {
                            window.electronAPI.sendEditDisplayResult({ 
                                ok: false, 
                                error: String(e.message || e) 
                            });
                        }
                    }
                });
            } catch (e) {
                console.warn('无法设置API编辑显示端监听:', e);
            }
        }
    });

    // 打开线路管理器
    async function openLineManagerWindow() {
        if (window.electronAPI && window.electronAPI.openLineManager) {
            await window.electronAPI.openLineManager();
        } else {
            // 浏览器环境，使用弹窗
            const url = 'line_manager_window.html';
            window.open(url, '_blank', 'width=900,height=600');
        }
    }

    let lineManagerSaveWatcher = null;

    const stopLineManagerSaveWatcher = () => {
        if (lineManagerSaveWatcher) {
            clearInterval(lineManagerSaveWatcher);
            lineManagerSaveWatcher = null;
        }
    };

    function cachePendingLineSave(payload) {
        try {
            localStorage.setItem('pendingLineSaveData', JSON.stringify(payload));
            localStorage.setItem('lineManagerSaveMode', payload.mode || 'line');
            localStorage.removeItem('lineManagerSaveResult');
        } catch (e) {
            console.warn('[线路管理器] 无法写入本地缓存:', e);
        }
    }

    function startLineManagerSaveWatcher(requestId, payload, mode) {
        stopLineManagerSaveWatcher();
        const timeout = Date.now() + 30000;

        lineManagerSaveWatcher = setInterval(async () => {
            if (Date.now() > timeout) {
                stopLineManagerSaveWatcher();
                localStorage.removeItem('lineManagerSaveResult');
                localStorage.removeItem('pendingLineSaveData');
                localStorage.removeItem('lineManagerSaveMode');
                return;
            }
            const raw = localStorage.getItem('lineManagerSaveResult');
            if (!raw) return;

            let result;
            try {
                result = JSON.parse(raw);
            } catch (e) {
                console.warn('[线路管理器] 保存结果解析失败:', e);
                stopLineManagerSaveWatcher();
                return;
            }

            if (result.requestId && result.requestId !== requestId) {
                return;
            }

            stopLineManagerSaveWatcher();
            localStorage.removeItem('lineManagerSaveResult');
            localStorage.removeItem('pendingLineSaveData');
            localStorage.removeItem('lineManagerSaveMode');

            if (result && result.success) {
                const dirPart = (p) => {
                    if (!p || typeof p !== 'string') return null;
                    const idx = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
                    return idx >= 0 ? p.substring(0, idx + 1) : null;
                };

                const cleanName = payload.cleanLineName || payload.lineName || '';

                if (result.folderId) {
                    pidsState.currentFolderId = result.folderId;
                }
                if (result.filePath) {
                    pidsState.currentFilePath = result.filePath;
                    if (cleanName) {
                        pidsState.lineNameToFilePath[cleanName] = result.filePath;
                    }
                    const dir = dirPart(result.filePath);
                    if (dir) pidsState.lastKnownSaveDir = dir;
                } else if (result.folderPath) {
                    const dir = dirPart(result.folderPath);
                    if (dir) pidsState.lastKnownSaveDir = dir;
                }

                if (result.folderPath) {
                    try {
                        await fileIO.refreshLinesFromFolder(true, result.folderPath);
                    } catch (e) {
                        console.warn('[线路管理器] 刷新线路列表失败:', e);
                    }
                }

                try { saveCfg(); } catch (e) {}
                try { sync(); } catch (e) {}

                try {
                    const { showNotification } = await import('../utils/notificationService.js');
                    const folderLabel = result.folderName || result.folderId || '';
                    const targetLabel = folderLabel ? ` -> ${folderLabel}` : '';
                    const modeLabel = mode === 'zip' ? '保存为压缩包' : '保存当前线路';
                    showNotification('保存成功', `${modeLabel}：${payload.lineName || cleanName}${targetLabel}`);
                } catch (e) {}
            } else {
                const errMsg = (result && result.error) ? String(result.error) : '未知错误';
                const isCancelled = !!(result && result.cancelled) || errMsg === 'window-closed' || errMsg === 'cancelled';
                if (isCancelled) {
                    await showMsg('已取消保存', '提示');
                } else {
                    await showMsg('保存失败：' + errMsg, '错误');
                }
            }
        }, 400);
    }

    async function openLineManagerForSave(mode = 'line') {
        const cur = pidsState.appData;
        const lineName = cur && cur.meta ? (cur.meta.lineName || '') : '';
        if (!cur || !cur.meta || !lineName) {
            await showMsg('当前线路数据无效，无法保存');
            return;
        }

        let serializable;
        try {
            serializable = JSON.parse(JSON.stringify(cur));
        } catch (e) {
            await showMsg('保存失败：线路数据无法序列化');
            return;
        }

        const cleanLineName = lineName.replace(/<[^>]+>([^<]*)<\/>/g, '$1').trim();
        const requestId = Date.now();
        const payload = {
            mode,
            lineName,
            cleanLineName,
            lineData: serializable,
            currentFilePath: pidsState.currentFilePath || null,
            currentFolderId: pidsState.currentFolderId || null,
            lastKnownSaveDir: pidsState.lastKnownSaveDir || null,
            requestId,
            ts: Date.now()
        };

        cachePendingLineSave(payload);

        if (window.electronAPI && window.electronAPI.openLineManager) {
            await window.electronAPI.openLineManager();
        } else {
            await openLineManagerWindow();
        }

        startLineManagerSaveWatcher(requestId, payload, mode);
    }

    const keyMapDisplay = computed(() => ({
        arrdep: { label: i18n.global.t('keys.nextState') },
        prev: { label: i18n.global.t('keys.prevStation') },
        next: { label: i18n.global.t('keys.nextStation') }
    }));

    function cachePendingLineSave(payload) {
        try {
            localStorage.setItem('pendingLineSaveData', JSON.stringify(payload));
            localStorage.setItem('lineManagerSaveMode', payload.mode || 'line');
            localStorage.removeItem('lineManagerSaveResult');
        } catch (e) {
            console.warn('[线路管理器] 无法写入本地缓存:', e);
        }
    }

    function startLineManagerSaveWatcher(requestId, payload, mode) {
        stopLineManagerSaveWatcher();
        const timeout = Date.now() + 30000;

        lineManagerSaveWatcher = setInterval(async () => {
            if (Date.now() > timeout) {
                stopLineManagerSaveWatcher();
                localStorage.removeItem('lineManagerSaveResult');
                localStorage.removeItem('pendingLineSaveData');
                localStorage.removeItem('lineManagerSaveMode');
                return;
            }
            const raw = localStorage.getItem('lineManagerSaveResult');
            if (!raw) return;

            let result;
            try {
                result = JSON.parse(raw);
            } catch (e) {
                console.warn('[线路管理器] 保存结果解析失败:', e);
                stopLineManagerSaveWatcher();
                return;
            }

            if (result.requestId && result.requestId !== requestId) {
                return;
            }

            stopLineManagerSaveWatcher();
            localStorage.removeItem('lineManagerSaveResult');
            localStorage.removeItem('pendingLineSaveData');
            localStorage.removeItem('lineManagerSaveMode');

            if (result && result.success) {
                const dirPart = (p) => {
                    if (!p || typeof p !== 'string') return null;
                    const idx = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
                    return idx >= 0 ? p.substring(0, idx + 1) : null;
                };

                const cleanName = payload.cleanLineName || payload.lineName || '';

                if (result.folderId) {
                    pidsState.currentFolderId = result.folderId;
                }
                if (result.filePath) {
                    pidsState.currentFilePath = result.filePath;
                    if (cleanName) {
                        pidsState.lineNameToFilePath[cleanName] = result.filePath;
                    }
                    const dir = dirPart(result.filePath);
                    if (dir) pidsState.lastKnownSaveDir = dir;
                } else if (result.folderPath) {
                    const dir = dirPart(result.folderPath);
                    if (dir) pidsState.lastKnownSaveDir = dir;
                }

                if (result.folderPath) {
                    try {
                        await fileIO.refreshLinesFromFolder(true, result.folderPath);
                    } catch (e) {
                        console.warn('[线路管理器] 刷新线路列表失败:', e);
                    }
                }

                try { saveCfg(); } catch (e) {}
                try { sync(); } catch (e) {}

                try {
                    const { showNotification } = await import('../utils/notificationService.js');
                    const folderLabel = result.folderName || result.folderId || '';
                    const targetLabel = folderLabel ? ` -> ${folderLabel}` : '';
                    const modeLabel = mode === 'zip' ? '保存为压缩包' : '保存当前线路';
                    showNotification('保存成功', `${modeLabel}：${payload.lineName || cleanName}${targetLabel}`);
                } catch (e) {}
            } else {
                const errMsg = (result && result.error) ? String(result.error) : '未知错误';
                const isCancelled = !!(result && result.cancelled) || errMsg === 'window-closed' || errMsg === 'cancelled';
                if (isCancelled) {
                    await showMsg('已取消保存', '提示');
                } else {
                    await showMsg('保存失败：' + errMsg, '错误');
                }
            }
        }, 400);
    }

    async function openLineManagerForSave(mode = 'line') {
        const cur = pidsState.appData;
        const lineName = cur && cur.meta ? (cur.meta.lineName || '') : '';
        if (!cur || !cur.meta || !lineName) {
            await showMsg('当前线路数据无效，无法保存');
            return;
        }

        let serializable;
        try {
            serializable = JSON.parse(JSON.stringify(cur));
        } catch (e) {
            await showMsg('保存失败：线路数据无法序列化');
            return;
        }

        const cleanLineName = lineName.replace(/<[^>]+>([^<]*)<\/>/g, '$1').trim();
        const requestId = Date.now();
        const payload = {
            mode,
            lineName,
            cleanLineName,
            lineData: serializable,
            currentFilePath: pidsState.currentFilePath || null,
            currentFolderId: pidsState.currentFolderId || null,
            lastKnownSaveDir: pidsState.lastKnownSaveDir || null,
            requestId,
            ts: Date.now()
        };

        cachePendingLineSave(payload);

        if (window.electronAPI && window.electronAPI.openLineManager) {
            await window.electronAPI.openLineManager();
        } else {
            await openLineManagerWindow();
        }

        startLineManagerSaveWatcher(requestId, payload, mode);
    }

    function recordKey(keyName, event) {
        event.preventDefault();
        event.stopPropagation();
        settings.keys[keyName] = event.code;
        saveSettings();
        event.target.blur();
    }

    function clearKey(keyName) {
        settings.keys[keyName] = '';
        saveSettings();
    }

    async function resetKeys() {
        if(await askUser('确定要重置所有快捷键吗？')) {
             settings.keys = { arrdep: 'Enter', prev: 'ArrowLeft', next: 'ArrowRight' };
             saveSettings();
        }
    }

        // 更新模块状态（检查中/可用/下载中/已下载）
    const updateState = ref({ checking: false, available: false, downloading: false, downloaded: false, progress: 0, info: null, error: null, isLatest: false });
    
    // 检查更新点击计数（用于连续点击五次触发特殊功能）
    const updateCheckClickCount = ref(0);
    const updateCheckClickTimer = ref(null);

        const version = ref('未知');
        (async () => {
            try {
                if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.getAppVersion) {
                    const r = await window.electronAPI.getAppVersion();
                    if (r && r.ok && r.version) version.value = r.version;
                }
            } catch (e) {}
        })();

        // 配置主进程日志监听（用于调试）
        if (ENABLE_MAIN_LOG_BRIDGE && typeof window !== 'undefined' && window.electronAPI) {
            try {
                window.electronAPI.onMainConsoleLog && window.electronAPI.onMainConsoleLog((msg) => {
                    console.log('[MAIN]', msg);
                });
                window.electronAPI.onMainConsoleError && window.electronAPI.onMainConsoleError((msg) => {
                    console.error('[MAIN]', msg);
                });
            } catch (e) {
                console.warn('无法设置主进程日志监听:', e);
            }
        }
        
        // 配置更新事件监听（仅在 Electron 环境）
        if (typeof window !== 'undefined' && window.electronAPI) {
            try {
                window.electronAPI.onUpdateAvailable((info) => {
                    updateState.value.checking = false;
                    updateState.value.available = true;
                    updateState.value.downloaded = false;
                    updateState.value.info = info || null;
                    // 不再自动弹出对话框，由用户手动点击下载
                    // 发送通知
                    const version = info?.version || '新版本';
                    showNotification('更新可用', `发现新版本 ${version}，请点击检查更新按钮下载`, {
                        tag: 'update-available',
                        urgency: 'normal'
                    });
                });

                window.electronAPI.onUpdateNotAvailable((info) => {
                    updateState.value.checking = false;
                    updateState.value.isLatest = true; // 标记为最新版本
                    const currentVersion = version.value || '未知';
                    if (ENABLE_SLIDE_LOG) console.log('[SlidePanel] 收到 update-not-available 事件', info);
                    // 不显示弹窗，只在界面上显示状态（避免频繁弹窗干扰用户）
                });

                window.electronAPI.onUpdateError((err) => {
                    try {
                        // 确保设置页面保持打开状态
                        if (uiState.activePanel !== 'panel-4') {
                            uiState.activePanel = 'panel-4';
                        }
                        updateState.value.checking = false;
                        updateState.value.downloading = false;
                        const errorMsg = String(err);
                        updateState.value.error = errorMsg;
                        console.error('[SlidePanel] 收到更新错误事件:', err);
                        
                        // 对于校验和错误，提供更友好的提示
                        let userFriendlyMsg = errorMsg;
                        if (errorMsg.includes('checksum') || errorMsg.includes('sha512')) {
                            userFriendlyMsg = '文件校验失败，可能是下载的文件损坏。\n\n建议：\n1. 检查网络连接\n2. 重新尝试下载\n3. 如果问题持续，请从GitHub手动下载';
                        }
                        
                        showMsg('更新错误：' + userFriendlyMsg);
                    } catch (e) {
                        console.error('[SlidePanel] 处理更新错误事件失败:', e);
                    }
                });

                window.electronAPI.onUpdateProgress((p) => {
                    try {
                        if (p && p.percent) {
                            updateState.value.progress = Math.round(p.percent);
                        } else if (p && p.transferred && p.total) {
                            updateState.value.progress = Math.round((p.transferred / p.total) * 100);
                        }
                        // 确保下载状态正确，避免白屏
                        if (!updateState.value.downloading) {
                            updateState.value.downloading = true;
                        }
                        // 确保 available 状态正确，避免按钮区域被隐藏
                        if (!updateState.value.available && updateState.value.info) {
                            updateState.value.available = true;
                        }
                        updateState.value.downloaded = false;
                    } catch (e) {
                        console.error('[SlidePanel] 更新进度处理失败:', e);
                    }
                });

                window.electronAPI.onUpdateDownloaded((info) => {
                    try {
                        // 确保设置页面保持打开状态
                        if (uiState.activePanel !== 'panel-4') {
                            uiState.activePanel = 'panel-4';
                        }
                        updateState.value.downloading = false;
                        updateState.value.progress = 100;
                        updateState.value.downloaded = true;
                        updateState.value.info = info || updateState.value.info;
                        // 不再自动弹出对话框，由用户手动点击安装
                        // 发送通知
                        const version = info?.version || '新版本';
                        showNotification('更新下载完成', `版本 ${version} 已下载完成，点击"重启应用"即可完成更新，无需走安装流程`, {
                            tag: 'update-downloaded',
                            urgency: 'normal'
                        });
                    } catch (e) {
                        console.error('[SlidePanel] 处理下载完成事件失败:', e);
                    }
                });
            } catch (e) {
                // 可忽略监听安装异常
            }
        }

        async function checkForUpdateClicked() {
            // 处理连续点击五次的功能
            updateCheckClickCount.value++;
            
            // 清除之前的计时器
            if (updateCheckClickTimer.value) {
                clearTimeout(updateCheckClickTimer.value);
            }
            
            // 如果连续点击五次，显示开发者按钮
            if (updateCheckClickCount.value >= 5) {
                updateCheckClickCount.value = 0;
                uiState.showDevButton = true;
                // 将开发者按钮状态保存到 localStorage，以便侧边栏 BrowserView 也能读取
                try {
                    localStorage.setItem('metro_pids_dev_button_enabled', 'true');
                } catch (e) {
                    console.warn('无法保存开发者按钮状态到 localStorage:', e);
                }
                showNotification('开发者模式', '开发者按钮已显示在侧边栏', {
                    tag: 'dev-button-enabled',
                    urgency: 'normal'
                });
                return;
            }
            
            // 2秒内如果没有再次点击，重置计数
            updateCheckClickTimer.value = setTimeout(() => {
                updateCheckClickCount.value = 0;
            }, 2000);
            
            if (typeof window === 'undefined' || !window.electronAPI) {
                showMsg('当前不是 Electron 环境，无法检查更新');
                return;
            }
            updateState.value.checking = true;
            updateState.value.available = false;
            updateState.value.downloaded = false;
            updateState.value.error = null; // 清除之前的错误
            updateState.value.isLatest = false; // 清除之前的"已是最新"状态
            
            if (ENABLE_SLIDE_LOG) console.log('[SlidePanel] 开始检查更新...');
            
            try {
                const r = await window.electronAPI.checkForUpdates();
                if (ENABLE_SLIDE_LOG) console.log('[SlidePanel] checkForUpdates 返回:', r);
                
                if (!r || !r.ok) {
                    updateState.value.checking = false;
                    const errorMsg = (r && r.error) ? r.error : '未知错误';
                    updateState.value.error = errorMsg;
                    console.error('[SlidePanel] 检查更新失败:', errorMsg);
                    showMsg('检查更新失败：' + errorMsg);
                } else {
                if (ENABLE_SLIDE_LOG) console.log('[SlidePanel] 检查更新请求已发送，等待事件响应...');
                    // 不在这里设置 checking = false，等待事件响应
                }
            } catch (e) {
                updateState.value.checking = false;
                const errorMsg = String(e);
                updateState.value.error = errorMsg;
                console.error('[SlidePanel] 检查更新异常:', e);
                showMsg('检查更新失败：' + errorMsg);
            }
        }

    async function downloadUpdateNow() {
        if (!window.electronAPI) return;
        // 确保设置页面保持打开状态
        if (uiState.activePanel !== 'panel-4') {
            uiState.activePanel = 'panel-4';
        }
        // 确保 available 状态正确，避免按钮区域被隐藏导致白屏
        if (!updateState.value.available && updateState.value.info) {
            updateState.value.available = true;
        }
        updateState.value.downloading = true;
        updateState.value.downloaded = false;
        updateState.value.error = null; // 清除之前的错误
        
        try {
            const r = await window.electronAPI.downloadUpdate();
            if (!r || !r.ok) {
                updateState.value.downloading = false;
                const errorMsg = r && r.error ? r.error : '未知错误';
                updateState.value.error = errorMsg;
                
                    // 对于校验和错误，提供更友好的提示
                    let userFriendlyMsg = errorMsg;
                    const attempts = r.attempts || 1;
                    const isChecksumError = errorMsg.includes('checksum') || errorMsg.includes('sha512') || r.isChecksumError;
                    
                    if (isChecksumError) {
                        if (attempts >= 3) {
                            userFriendlyMsg = `文件校验失败，已自动重试 ${attempts} 次。\n\n可能原因：\n1. 网络不稳定导致下载文件损坏\n2. 代理服务器干扰下载\n3. GitHub Releases 的校验和信息可能有误\n\n建议：\n1. 检查网络连接或尝试关闭VPN/代理\n2. 点击"清除缓存并重新下载"手动重试\n3. 点击"从GitHub手动下载"按钮手动下载安装包`;
                        } else {
                            userFriendlyMsg = `文件校验失败，已重试 ${attempts} 次。系统会自动重试...`;
                        }
                    }
                    
                    // 只有在不是自动重试中时才显示错误消息
                    if (attempts >= 3 || !isChecksumError) {
                        showMsg('下载失败：' + userFriendlyMsg);
                    }
            }
        } catch (e) {
            updateState.value.downloading = false;
            const errorMsg = String(e);
            updateState.value.error = errorMsg;
            showMsg('下载失败：' + errorMsg);
        }
    }

    async function clearCacheAndRedownload() {
        if (!window.electronAPI) return;
        if (!window.electronAPI.clearCacheAndDownload) {
            // 如果没有清除缓存功能，回退到普通下载
            return downloadUpdateNow();
        }
        
        // 确保设置页面保持打开状态
        if (uiState.activePanel !== 'panel-4') {
            uiState.activePanel = 'panel-4';
        }
        // 确保 available 状态正确，避免按钮区域被隐藏导致白屏
        if (!updateState.value.available && updateState.value.info) {
            updateState.value.available = true;
        }
        updateState.value.downloading = true;
        updateState.value.downloaded = false;
        updateState.value.error = null;
        
        try {
            const r = await window.electronAPI.clearCacheAndDownload();
            if (!r || !r.ok) {
                updateState.value.downloading = false;
                const errorMsg = r && r.error ? r.error : '未知错误';
                updateState.value.error = errorMsg;
                showMsg('重新下载失败：' + errorMsg);
            }
        } catch (e) {
            updateState.value.downloading = false;
            const errorMsg = String(e);
            updateState.value.error = errorMsg;
            showMsg('重新下载失败：' + errorMsg);
        }
    }

    async function installDownloadedUpdate() {
        if (!window.electronAPI) return;
        updateState.value.downloading = false;
        await window.electronAPI.installUpdate();
    }

    async function skipThisVersion() {
        if (!window.electronAPI || !updateState.value.info) return;
        const version = updateState.value.info.version;
        if (version) {
            const r = await window.electronAPI.skipVersion(version);
            if (r && r.ok) {
                updateState.value.available = false;
                updateState.value.downloaded = false;
                showMsg('已跳过此版本，下次有更高版本时会再次提示');
            } else {
                showMsg('跳过版本失败：' + (r && r.error ? r.error : '未知错误'));
            }
        }
    }

    async function openGitHubReleases() {
        const url = 'https://github.com/tanzhouxkong/Metro-PIDS-/releases';
        await openExternalUrl(url);
    }

    /** 使用系统默认浏览器打开 URL */
    async function openExternalUrl(url) {
        try {
            if (typeof window !== 'undefined' && window.electronAPI && typeof window.electronAPI.openExternal === 'function') {
                const res = await window.electronAPI.openExternal(url);
                if (!res || (res.ok === false)) {
                    try { window.open(url, '_blank', 'noopener,noreferrer'); } catch (e) { console.warn('Failed to open external URL', e); }
                }
            } else {
                try { window.open(url, '_blank', 'noopener,noreferrer'); } catch (e) { console.warn('Failed to open external URL', e); }
            }
        } catch (e) {
            try { window.open(url, '_blank', 'noopener,noreferrer'); } catch (e2) { console.warn('Failed to open external URL', e2); }
        }
    }

    // 显示端/第三方相关辅助（展示预览已移除）

    // 自动播放包装：先锁定界面并提示
    // 确保显示端已开启；若未开启则尝试按设置分辨率拉起
    async function ensureDisplayOpen() {
        try {
            // Electron 原生窗口
            if (typeof window !== 'undefined' && window.electronAPI && typeof window.electronAPI.openDisplay === 'function') {
                const currentDisplayConfig = currentDisplay.value;
                
                const dw = currentDisplayConfig.width || 1900;
                const dh = currentDisplayConfig.height || 600;
                const displayId = currentDisplayConfig.id || 'display-1';
                await window.electronAPI.openDisplay(dw, dh, displayId);
                return true;
            }
        } catch (e) {}

        if (isElectronRuntime) {
            return false;
        }

        // 浏览器弹窗
        try {
            const currentDisplayConfig = currentDisplay.value;
            
            const hasPopup = window.__metro_pids_display_popup && !window.__metro_pids_display_popup.closed;
            let url = '';
            if (currentDisplayConfig.source === 'builtin') {
                // 如果配置了本地文件路径，使用该路径；否则使用默认路径
                if (currentDisplayConfig.url) {
                    url = currentDisplayConfig.url;
                } else if (currentDisplayConfig.id === 'display-1') {
                    url = 'display_window.html';
                } else {
                    url = `displays/${currentDisplayConfig.id}/display_window.html`;
                }
            } else if (currentDisplayConfig.source === 'online' || currentDisplayConfig.source === 'custom' || currentDisplayConfig.source === 'gitee') {
                url = currentDisplayConfig.url || '';
            }
            if (!hasPopup && url) {
                const w = window.open(url, `_blank_${currentDisplayConfig.id}`, `width=${currentDisplayConfig.width},height=${currentDisplayConfig.height}`);
                if (w) {
                    window.__metro_pids_display_popup = w;
                    window.__metro_pids_display_popup_ready = false;
                    try { await waitForPopupReady(w, 3000); } catch (e) {}
                    return true;
                }
            }
            return hasPopup;
        } catch (e) {
            return false;
        }
    }

    async function startWithLock(intervalSec = null) {
        if (uiState.autoLocked) return;
        const ok = await askUser(i18n.global.t('console.autoplayLockConfirm'));
        if (!ok) return;
        uiState.autoLocked = true;
        uiState.autoplayTogglePause = togglePause;
        uiState.autoplayIsPausedRef = isPaused;
        try {
            // 确保显示端已打开并绑定
            await ensureDisplayOpen();

            // 发送初次同步，确保显示端状态最新
            try { sync(); } catch(e){}

            const safe = normalizeAutoplayIntervalSec(intervalSec ?? getAutoplayIntervalSec());
            try {
                if (!settings.autoplay) settings.autoplay = { ...DEFAULT_SETTINGS.autoplay }
                settings.autoplay.intervalSec = safe
                saveSettings()
            } catch (e) {}
            start(safe);
        } catch (e) {
            uiState.autoLocked = false;
            uiState.autoplayTogglePause = null;
            uiState.autoplayIsPausedRef = null;
            throw e;
        }
    }

    // 等待弹窗加载：同源可监听 load/readyState，跨域无法读 document 时退回短延时
    function waitForPopupReady(winRef, timeoutMs = 2000) {
        return new Promise((resolve, reject) => {
            if (!winRef) return reject(new Error('no window'));
            let done = false;
            const cleanup = () => { done = true; try { if (winRef && winRef.removeEventListener) winRef.removeEventListener('load', onLoad); } catch(e){} };
            const onLoad = () => {
                try { window.__metro_pids_display_popup_ready = true; } catch (e) {}
                cleanup();
                resolve(true);
            };
            try {
                // 同源情况下尝试绑定 load 事件
                if (winRef.addEventListener) {
                    winRef.addEventListener('load', onLoad, { once: true });
                }
                // 同源情况下轮询 readyState
                let elapsed = 0;
                const step = 100;
                const poll = setInterval(() => {
                    try {
                        if (done) { clearInterval(poll); return; }
                        if (!winRef || winRef.closed) { clearInterval(poll); cleanup(); return reject(new Error('closed')); }
                        let rs = null;
                        try { rs = winRef.document && winRef.document.readyState; } catch (e) { rs = null; }
                        if (rs === 'complete' || rs === 'interactive') {
                            try { window.__metro_pids_display_popup_ready = true; } catch (e) {}
                            clearInterval(poll); cleanup(); return resolve(true);
                        }
                        elapsed += step;
                        if (elapsed >= timeoutMs) {
                            clearInterval(poll);
                            // 超时则标记未就绪但继续
                            try { window.__metro_pids_display_popup_ready = false; } catch (e) {}
                            return resolve(false);
                        }
                    } catch (e) {
                        clearInterval(poll);
                        // 跨域则直接走回退
                        try { window.__metro_pids_display_popup_ready = false; } catch (ee) {}
                        return resolve(false);
                    }
                }, step);
            } catch (e) {
                try { window.__metro_pids_display_popup_ready = false; } catch (ee) {}
                return resolve(false);
            }
        });
    }

    function stopWithUnlock() {
        try { stop(); } catch (e) {}
        uiState.autoLocked = false;
        uiState.autoplayTogglePause = null;
        uiState.autoplayIsPausedRef = null;
        // 发送自动播放结束通知
        showNotification(i18n.global.t('console.autoplayStoppedTitle'), i18n.global.t('console.autoplayStoppedMsg'), {
            tag: 'autoplay-stopped',
            urgency: 'low'
        });
    }

    // 监听 autoLocked 变化，如果外部设置为 false，则停止自动播放
    watch(() => uiState.autoLocked, (newVal) => {
        if (!newVal && isPlaying.value) {
            // 如果 autoLocked 被设置为 false 且正在播放，则停止
            try { stop(); } catch (e) {}
        }
    });

    // 录制前先检查是否已连接显示端
    async function startRecordingWithCheck(bps = 800000, timeoutMs = 1500) {
        try {
            const hasBroadcast = !!(pidsState && pidsState.bcWrap && typeof pidsState.bcWrap.post === 'function');
            // 快速检测：若无广播包装，改用 postMessage 询问弹窗
            let responded = false;

            const onResp = (data) => {
                if (!data) return;
                if (data.t === 'SYNC' || data.t === 'REC_STARTED' || data.t === 'REC_ACK') {
                    responded = true;
                }
            };

            // 若有 BroadcastChannel 包装则监听其消息
            if (hasBroadcast) {
                try {
                    pidsState.bcWrap.onMessage((msg) => onResp(msg));
                } catch (e) {}
            }

            // 同时监听 window message
            const winHandler = (ev) => { try { onResp(ev.data); } catch(e){} };
            if (typeof window !== 'undefined') window.addEventListener('message', winHandler);

            // 发送 REQ 请求显示端回应
            try {
                if (hasBroadcast) pidsState.bcWrap.post({ t: 'REQ' });
                else if (typeof window !== 'undefined' && window.postMessage) window.postMessage({ t: 'REQ' }, '*');
            } catch (e) {}

            // 等待短暂超时
            await new Promise((res) => setTimeout(res, timeoutMs));

            // 清理监听
            try { if (hasBroadcast) {/* wrapper listener will naturally persist; not removing here for simplicity */} } catch(e){}
            if (typeof window !== 'undefined') window.removeEventListener('message', winHandler);

            if (!responded) {
                await showMsg('未检测到已打开的显示端，录制无法启动。请先打开显示端或确认显示端已连接。');
                return false;
            }

            // 发送 REC_START
            try {
                if (hasBroadcast) pidsState.bcWrap.post({ t: 'REC_START', bps });
                else if (typeof window !== 'undefined' && window.postMessage) window.postMessage({ t: 'REC_START', bps }, '*');
            } catch (e) {}

            // 更新本地状态标记
            try { pidsState.isRec = true; } catch (e) {}
            await showMsg('已向显示端发送录制开始命令');
            return true;
        } catch (e) {
            console.error('startRecordingWithCheck error', e);
            await showMsg('启动录制时发生错误：' + String(e));
            return false;
        }
    }

        // 更新日志相关
        const showReleaseNotes = ref(false);
        const releaseNotes = ref([]);
        const loadingNotes = ref(false);
        const releaseNotesSource = ref(''); // 'worker' | 'github' | ''
        const releaseNotesSourceText = computed(() => {
            if (!releaseNotesSource.value) return '';
            const key = releaseNotesSource.value === 'worker' ? 'sourceWorker' : 'sourceGithub';
            return i18n.global.t(`about.releaseNotes.${key}`);
        });

        // 加载更新日志（仅从服务器 Worker 获取，不降级到 GitHub）
        const loadReleaseNotes = async () => {
            if (loadingNotes.value) return;
            loadingNotes.value = true;
            releaseNotes.value = [];
            releaseNotesSource.value = ''; // 默认不显示数据来源
            try {
                const api = typeof window !== 'undefined' && window.electronAPI && window.electronAPI.getGitHubReleases;
                if (!api) {
                    console.warn('[SlidePanel] getGitHubReleases 不可用');
                    return;
                }
                const result = await api();
                
                // 只有成功获取数据时才显示数据来源
                if (result && result.ok && Array.isArray(result.releases) && result.releases.length > 0) {
                    releaseNotes.value = result.releases;
                    // 只有成功时才显示"服务器"作为数据来源
                    releaseNotesSource.value = 'worker';
                    console.log('[SlidePanel] ✅ 更新日志加载成功，数量:', result.releases.length, '来源: 服务器');
                } else {
                    // 失败或数据为空时不显示数据来源
                    releaseNotes.value = [];
                    releaseNotesSource.value = '';
                    if (result && !result.ok) {
                        console.warn('[SlidePanel] ⚠️ 更新日志加载失败:', result.error || '未知错误');
                    } else {
                        console.warn('[SlidePanel] ⚠️ 更新日志为空，result:', result);
                    }
                }
            } catch (e) {
                console.error('[SlidePanel] ❌ 加载更新日志失败:', e);
                releaseNotes.value = [];
                releaseNotesSource.value = ''; // 失败时不显示数据来源
            } finally {
                loadingNotes.value = false;
            }
        }

        // 打开更新日志弹窗：先打开，再异步加载，避免用户感觉要点两次
        const openReleaseNotes = async () => {
            if (!showReleaseNotes.value) {
                showReleaseNotes.value = true;
            }
            // 仅在未加载且未处于加载中时触发加载
            if (!loadingNotes.value && releaseNotes.value.length === 0) {
                loadReleaseNotes();
            }
        }

        // 关闭更新日志弹窗
        const closeReleaseNotes = () => {
            showReleaseNotes.value = false;
        }

        // 内置图片查看器（更新日志内图片点击放大）
        const imageViewerSrc = ref(null);
        const openImageViewer = (src) => {
            if (src) imageViewerSrc.value = src;
        };
        const closeImageViewer = () => { imageViewerSrc.value = null; };
        const onReleaseBodyClick = (e) => {
            const wrap = e.target && e.target.closest && e.target.closest('.release-note-img-wrap');
            if (wrap) {
                const img = wrap.querySelector('img');
                if (img && img.src) {
                    e.preventDefault();
                    e.stopPropagation();
                    openImageViewer(img.src);
                }
            }
        };

        // 格式化更新日志内容（将Markdown转换为简单的HTML）
        const formatReleaseBody = (body, release) => {
            if (!body) return `<div style="color:var(--muted, #999); font-style:italic;">${i18n.global.t('about.releaseNotes.noBody')}</div>`;
            const githubRepo = 'tanzhouxkong/Metro-PIDS-';
            const githubBaseUrl = 'https://github.com';
            const githubRawBaseUrl = 'https://raw.githubusercontent.com';
            
            let formatted = body;
            
            // 处理代码块：```language\ncode\n```
            formatted = formatted.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
                const language = lang || 'text';
                return `<div style="background:var(--bg, #f5f5f5); border:1px solid var(--divider, rgba(0,0,0,0.1)); border-radius:8px; padding:12px; margin:12px 0; overflow-x:auto; font-family:'Consolas','Monaco','Courier New',monospace; font-size:13px; line-height:1.5;"><div style="color:var(--muted, #999); font-size:11px; margin-bottom:8px; text-transform:uppercase; letter-spacing:0.5px;">${language}</div><pre style="margin:0; color:var(--text, #333); white-space:pre-wrap; word-wrap:break-word;">${code.trim()}</pre></div>`;
            });
            
            // 处理行内代码：`code`
            formatted = formatted.replace(/`([^`]+)`/g, '<code style="background:var(--bg, #f5f5f5); border:1px solid var(--divider, rgba(0,0,0,0.1)); border-radius:4px; padding:2px 6px; font-family:\'Consolas\',\'Monaco\',\'Courier New\',monospace; font-size:12px; color:var(--accent, #1677ff);">$1</code>');
            
            // 处理图片：![alt](url) 或 ![alt](url "title")
            formatted = formatted.replace(/!\[([^\]]*)\]\(([^)]+)(?:\s+"[^"]*")?\)/g, (match, alt, url) => {
                let imageUrl = url.trim();
                
                // 如果是相对路径，转换为GitHub releases assets URL
                if (!imageUrl.match(/^https?:\/\//)) {
                    // 相对路径，假设是release assets中的文件
                    const tagName = release?.tag_name || '';
                    if (tagName) {
                        imageUrl = `${githubBaseUrl}/${githubRepo}/releases/download/${tagName}/${imageUrl}`;
                    } else {
                        // 如果没有tag，使用raw.githubusercontent.com（如果图片在repo根目录）
                        imageUrl = `${githubRawBaseUrl}/${githubRepo}/main/${imageUrl}`;
                    }
                }
                
                // 返回img标签，支持点击查看大图
                return `<div class="release-note-img-wrap" style="margin:16px 0; text-align:center;"><img src="${imageUrl}" alt="${alt || ''}" class="release-note-img" style="max-width:100%; height:auto; border-radius:8px; margin:0 auto; box-shadow:0 4px 12px rgba(0,0,0,0.15); display:block; cursor:pointer; transition:opacity 0.2s;" onerror="this.style.display='none';"><div style="color:var(--muted, #999); font-size:12px; margin-top:8px; font-style:italic;">${alt || ''}</div></div>`;
            });
            
            // 处理链接：[text](url)
            formatted = formatted.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" style="color:var(--btn-blue-bg, #1677ff); text-decoration:none; border-bottom:1px solid rgba(22,119,255,0.3); transition:all 0.2s;" onmouseover="this.style.borderBottomColor=\'rgba(22,119,255,0.6)\'" onmouseout="this.style.borderBottomColor=\'rgba(22,119,255,0.3)\'">$1 <i class="fas fa-external-link-alt" style="font-size:10px; margin-left:2px;"></i></a>');
            
            // 处理标题
            formatted = formatted
                .replace(/\n# (.*)/g, '<h2 style="margin-top:24px; margin-bottom:12px; font-size:20px; font-weight:700; color:var(--text, #333); border-bottom:2px solid var(--divider, rgba(0,0,0,0.1)); padding-bottom:8px;">$1</h2>')
                .replace(/\n## (.*)/g, '<h3 style="margin-top:20px; margin-bottom:10px; font-size:17px; font-weight:700; color:var(--text, #333);">$1</h3>')
                .replace(/\n### (.*)/g, '<h4 style="margin-top:16px; margin-bottom:8px; font-size:15px; font-weight:600; color:var(--text, #333);">$1</h4>')
                .replace(/\n#### (.*)/g, '<h5 style="margin-top:12px; margin-bottom:6px; font-size:14px; font-weight:600; color:var(--text, #333);">$1</h5>');
            
            // 处理列表
            formatted = formatted
                .replace(/\n- (.*)/g, '<div style="margin-left:20px; margin-top:6px; margin-bottom:6px; padding-left:8px; position:relative;"><span style="position:absolute; left:0; color:var(--accent, #1677ff);">•</span><span>$1</span></div>')
                .replace(/\n\d+\. (.*)/g, '<div style="margin-left:20px; margin-top:6px; margin-bottom:6px; padding-left:8px; position:relative;"><span style="position:absolute; left:0; color:var(--accent, #1677ff); font-weight:600;">$&</span><span>$1</span></div>');
            
            // 处理强调
            formatted = formatted
                .replace(/\*\*(.*?)\*\*/g, '<strong style="font-weight:700; color:var(--text, #333);">$1</strong>')
                .replace(/\*(.*?)\*/g, '<em style="font-style:italic; color:var(--text, #333);">$1</em>')
                .replace(/~~(.*?)~~/g, '<del style="text-decoration:line-through; color:var(--muted, #999);">$1</del>');
            
            // 处理换行
            formatted = formatted.replace(/\n\n/g, '</p><p style="margin:12px 0;">');
            formatted = '<p style="margin:0;">' + formatted.replace(/\n/g, '<br>') + '</p>';
            
            return formatted;
        }

        // 显示端管理相关方法
        const currentDisplay = computed(() => {
            return settings.display.displays[settings.display.currentDisplayId] || settings.display.displays[Object.keys(settings.display.displays)[0]];
        });

        // 创建本地响应式状态来确保UI更新（新安装/升级时 displays 可能为空，用默认列表避免卡片不显示）
        const initialDisplays = settings.display && settings.display.displays && Object.keys(settings.display.displays).length > 0
            ? settings.display.displays
            : { ...DEFAULT_SETTINGS.display.displays };
        const displayState = reactive({
            currentDisplayId: settings.display.currentDisplayId || 'display-1',
            displays: initialDisplays
        });

        function normalizeDisplaysMap(maybeMap) {
            const raw = (maybeMap && typeof maybeMap === 'object' && !Array.isArray(maybeMap)) ? { ...maybeMap } : {};
            const defaultMap = (DEFAULT_SETTINGS && DEFAULT_SETTINGS.display && DEFAULT_SETTINGS.display.displays && typeof DEFAULT_SETTINGS.display.displays === 'object')
                ? DEFAULT_SETTINGS.display.displays
                : {};
            // 永远兜底补齐系统显示器，避免因任何覆盖/序列化异常导致系统显示器“消失”
            // 并对每个显示器做字段级合并，防止部分更新把 name/description 等字段覆盖丢失
            const merged = {};
            const ids = new Set([...Object.keys(defaultMap), ...Object.keys(raw)]);
            ids.forEach((id) => {
                const def = defaultMap[id] && typeof defaultMap[id] === 'object' ? defaultMap[id] : {};
                const cur = raw[id] && typeof raw[id] === 'object' ? raw[id] : {};
                merged[id] = { ...def, ...cur };
                if (!merged[id].id) merged[id].id = id;
                if (!merged[id].name) merged[id].name = def.name || id;
                if (merged[id].enabled === undefined) merged[id].enabled = def.enabled !== false;
                if (!merged[id].source) merged[id].source = def.source || 'builtin';
            });
            // 强制系统显示器标记
            ['display-1', 'display-2', 'display-3'].forEach((id) => {
                if (merged[id]) merged[id].isSystem = true;
            });
            return merged;
        }

        function isDisplayEnabled(display) {
            if (!display || typeof display !== 'object') return false;
            const value = display.enabled;
            if (value === false || value === 'false' || value === 0 || value === '0') return false;
            return true;
        }

        function getDisplayName(display, fallbackId = '') {
            const resolved = resolveDisplayNameI18n(display);
            if (resolved) return resolved;
            if (fallbackId) return fallbackId;
            return i18n.global.t('display.unnamedDisplay');
        }

        // 监听设置变化，同步到本地状态
        watch(() => settings.display.currentDisplayId, (newId) => {
            if (ENABLE_SLIDE_LOG) console.log('[SlidePanel] 监听到 currentDisplayId 变化:', displayState.currentDisplayId, '->', newId);
            displayState.currentDisplayId = newId;
        }, { immediate: true });

        watch(() => settings.display.displays, (newDisplays) => {
            if (ENABLE_SLIDE_LOG) console.log('[SlidePanel] 监听到 displays 变化');
            displayState.displays = normalizeDisplaysMap(newDisplays);
        }, { deep: true, immediate: true });

        // 当前显示端ID的响应式引用（用于确保模板更新）
        const currentDisplayId = computed(() => {
            if (ENABLE_SLIDE_LOG) console.log('[SlidePanel] currentDisplayId computed:', displayState.currentDisplayId);
            return displayState.currentDisplayId;
        });

        // 检查显示端是否应该显示（考虑云控配置）
        function shouldShowDisplay(display, displayId) {
            if (!display) return false;

            // 开发环境下：完全忽略云控对显示端的限制
            if (IS_DEV_BUILD) {
                return true;
            }

            // 检查云控配置：服务器显式关闭的显示器不显示（系统显示器也遵守）
            const flags = uiState.displayFlags;
            if (flags && flags.displays && typeof flags.displays === 'object') {
                const key = displayId;
                const cloudDisplay = flags.displays[key];
                // 如果云控配置中存在该显示器，则按 enabled 字段决定；不存在则默认显示（向后兼容）
                if (cloudDisplay != null && Object.prototype.hasOwnProperty.call(cloudDisplay, 'enabled')) {
                    const enabled = cloudDisplay.enabled;
                    if (ENABLE_SLIDE_LOG) console.log('[SlidePanel] 检查显示端云控状态:', displayId, { enabled, cloudDisplay });
                    if (enabled === false || enabled === 'false' || enabled === 0) {
                        if (ENABLE_SLIDE_LOG) console.log('[SlidePanel] 显示端被云控关闭，不显示:', displayId);
                        return false;
                    }
                }
            }

            // 检查系统显示器选项（由云端配置控制是否在界面中展示“系统显示器”）
            if (!uiState.showSystemDisplayOption && display.isSystem) {
                return false;
            }
            
            return true;
        }

        // 可见显示端列表：按云控过滤；若过滤后为空则显示全部；显式依赖 uiState.displayFlags
        const visibleDisplayEntries = computed(() => {
            void uiState.displayFlags; // 依赖：云控配置变化时重算
            let fromState = displayState.displays;
            let fromSettings = settings.display && settings.display.displays;
            let displays = (fromState && typeof fromState === 'object' && Object.keys(fromState).length > 0)
                ? fromState
                : (fromSettings && typeof fromSettings === 'object' && Object.keys(fromSettings || {}).length > 0) ? fromSettings : null;
            // 新安装或老设备升级后可能为空，强制使用默认显示器列表，确保显示器1和2的卡片始终可见
            displays = normalizeDisplaysMap(displays);
            const entries = Object.entries(displays)
                .filter(([id, d]) => shouldShowDisplay(d, id));

            if (entries.length === 0) {
                return Object.entries(displays)
                    .map(([id, d]) => [id, d]);
            }
            return entries;
        });

        // 拖拽相关状态
        const draggedDisplayId = ref(null);
        const dragOverDisplayId = ref(null);
        
        // 显示端右键菜单状态
        const displayContextMenu = ref({ visible: false, x: 0, y: 0, displayId: null });

        // 编辑显示端弹窗（与更新日志同风格）
        const showDisplayEditDialog = ref(false);
        const display1WallpaperInput = ref(null);
        // 显示器编辑弹窗需要毛玻璃效果时，全局 html.blur-disabled 会用 !important 禁掉 backdrop-filter。
        // 这里在弹窗打开期间临时移除 blur-disabled，关闭后恢复，确保显示器编辑弹窗 blur 一定生效。
        let __prevBlurDisabledClass = null;
        watch(showDisplayEditDialog, (val) => {
            try {
                if (typeof document === 'undefined') return;
                const html = document.documentElement;
                const hasBlurDisabled = html.classList.contains('blur-disabled');
                if (val) {
                    __prevBlurDisabledClass = hasBlurDisabled;
                    if (hasBlurDisabled) html.classList.remove('blur-disabled');
                } else {
                    if (__prevBlurDisabledClass) html.classList.add('blur-disabled');
                    __prevBlurDisabledClass = null;
                }
            } catch (e) {
                // ignore
            }
        });
        const displayEdit = reactive({
            displayId: '', name: '', source: 'builtin', url: '', description: '',
            // 仅显示器1使用的选项：线路名合并 / C 型开关
            lineNameMerge: false,
            // 显示器1：壁纸（仅到站/结束页背景）
            wallpaperDataUrl: '',
            wallpaperOpacity: 0.35,
            // 仅显示器1使用的选项：线路名合并 / 显示全部站点 / C 型开关
            lineNameMerge: false, showAllStations: false,
            // 显示器2：UI 样式（classic=当前UI, modern=新UI）
            display2UiVariant: 'classic',
            // 显示器2：下一站/到站白屏时长
            nextStationDurationSeconds: 10,
            // 显示器3：车辆编组图标 + 当前车厢 + 虚拟位置
            departDurationSeconds: 8,
            trainFormation: '6',
            activeCarNo: null,
            virtualPosition: 'center',
            isSystem: false, isDisplay1: false, isDisplay2: false, isDisplay3: false
        });

        async function fileToWallpaperDataUrl(file) {
            if (!file) return '';
            const rawDataUrl = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result || ''));
                reader.onerror = () => reject(new Error('FileReader failed'));
                reader.readAsDataURL(file);
            });
            // 降低体积：缩放到最长边 2048，并转 JPEG
            try {
                const img = new Image();
                img.src = rawDataUrl;
                if (img.decode) await img.decode();
                const w = img.naturalWidth || img.width || 0;
                const h = img.naturalHeight || img.height || 0;
                if (!w || !h) return rawDataUrl;
                const maxDim = 2048;
                const ratio = Math.min(1, maxDim / Math.max(w, h));
                if (ratio >= 0.999) return rawDataUrl;

                const canvas = document.createElement('canvas');
                canvas.width = Math.max(1, Math.round(w * ratio));
                canvas.height = Math.max(1, Math.round(h * ratio));
                const ctx = canvas.getContext('2d', { alpha: false });
                if (!ctx) return rawDataUrl;
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                return canvas.toDataURL('image/jpeg', 0.86);
            } catch (e) {
                return rawDataUrl;
            }
        }

        function pickDisplay1Wallpaper() {
            try {
                if (display1WallpaperInput.value) display1WallpaperInput.value.click();
            } catch (e) {}
        }

        async function onDisplay1WallpaperFileChange(e) {
            try {
                const file = e && e.target && e.target.files && e.target.files[0];
                if (!file) return;
                const dataUrl = await fileToWallpaperDataUrl(file);
                displayEdit.wallpaperDataUrl = dataUrl || '';
            } catch (err) {
                console.error('壁纸读取失败:', err);
                showMsg('壁纸读取失败: ' + (err && err.message ? err.message : err));
            } finally {
                try { if (e && e.target) e.target.value = ''; } catch (e2) {}
            }
        }

        function clearDisplay1Wallpaper() {
            displayEdit.wallpaperDataUrl = '';
        }

        function openDisplayEditDialog(displayId) {
            const display = settings.display.displays[displayId];
            if (!display) return;
            let nextStationDurationSeconds = 10;
            let display2UiVariant = 'classic';
            if (settings.display && settings.display.display2NextStationDuration != null) {
                nextStationDurationSeconds = Math.round(settings.display.display2NextStationDuration / 1000);
            }
            if (settings.display && (settings.display.display2UiVariant === 'classic' || settings.display.display2UiVariant === 'modern')) {
                display2UiVariant = settings.display.display2UiVariant;
            }
            displayEdit.displayId = displayId;
            displayEdit.name = display.name || '';
            displayEdit.source = display.source === 'builtin' ? 'builtin' : (display.source === 'online' || display.source === 'custom' || display.source === 'gitee' ? 'online' : 'builtin');
            displayEdit.url = display.url || '';
            displayEdit.description = display.description || '';
            // 显示器1/3 的开关：若当前就是该显示端，以 meta 为准（与显示端实际一致）；否则用 display 的存储值
            const isCurrentTargetDisplay = displayId === settings.display.currentDisplayId;
            const meta = pidsState && pidsState.appData && pidsState.appData.meta;
            if ((displayId === 'display-1' || displayId === 'display-3') && isCurrentTargetDisplay && meta) {
                displayEdit.lineNameMerge = meta.lineNameMerge === true || meta.lineNameMerge === 'true';
            } else {
                displayEdit.lineNameMerge = display.lineNameMerge !== undefined ? display.lineNameMerge : false;
            }
            displayEdit.layoutMode = display.layoutMode !== undefined && (display.layoutMode === 'linear' || display.layoutMode === 'c-type')
                ? display.layoutMode
                : 'linear';
            if (displayId === 'display-1') {
                displayEdit.wallpaperDataUrl = typeof display.wallpaperDataUrl === 'string' ? display.wallpaperDataUrl : '';
                const op = Number.isFinite(display.wallpaperOpacity) ? display.wallpaperOpacity : parseFloat(display.wallpaperOpacity);
                displayEdit.wallpaperOpacity = Number.isFinite(op) ? Math.max(0, Math.min(1, op)) : 0.35;
            } else {
                displayEdit.wallpaperDataUrl = '';
                displayEdit.wallpaperOpacity = 0.35;
            }
            displayEdit.nextStationDurationSeconds = nextStationDurationSeconds;
            displayEdit.display2UiVariant = display2UiVariant;
            displayEdit.trainFormation = normalizeDisplay3TrainFormation(display.trainFormation);

            // 显示器3：出站页面显示时长（秒）
            if (displayId === 'display-3') {
                const rawMs = settings && settings.display && settings.display.display3DepartDuration != null
                    ? Number(settings.display.display3DepartDuration)
                    : 8000;
                const ms = Number.isFinite(rawMs) ? rawMs : 8000;
                displayEdit.departDurationSeconds = Math.max(0, Math.round(ms / 1000));
            }
            // 当前车厢默认值：已有配置优先，否则按编组选中中间一节
            const formationOption = display3TrainFormationOptions.find((o) => o.value === displayEdit.trainFormation);
            const totalCars = formationOption ? formationOption.groups.reduce((sum, g) => sum + g, 0) : 6;
            const rawActive = display.activeCarNo;
            const numActive = Number(rawActive);
            if (Number.isFinite(numActive) && numActive >= 1 && numActive <= totalCars) {
                displayEdit.activeCarNo = Math.floor(numActive);
            } else {
                displayEdit.activeCarNo = Math.ceil(totalCars / 2);
            }
            // 显示器1/3：屏幕虚拟位置（left / center / right）
            const rawVirtual = (display && display.virtualPosition) || 'center';
            const textVirtual = String(rawVirtual || '').trim().toLowerCase();
            if (['left', 'l', '左', '左侧'].includes(textVirtual)) {
                displayEdit.virtualPosition = 'left';
            } else if (['right', 'r', '右', '右侧'].includes(textVirtual)) {
                displayEdit.virtualPosition = 'right';
            } else {
                displayEdit.virtualPosition = 'center';
            }
            displayEdit.isSystem = display.isSystem === true;
            displayEdit.isDisplay1 = displayId === 'display-1';
            displayEdit.isDisplay2 = displayId === 'display-2';
            displayEdit.isDisplay3 = displayId === 'display-3';

            // Display-3：不再在设置页暴露标签/提示级别选项，保持与显示器1一致的简单配置
            showDisplayEditDialog.value = true;
        }

        function closeDisplayEditDialog() {
            showDisplayEditDialog.value = false;
        }

        async function pickDisplayEditFile() {
            try {
                if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.showOpenDialog) {
                    const result = await window.electronAPI.showOpenDialog({
                        filters: [
                            { name: 'HTML文件', extensions: ['html', 'htm'] },
                            { name: '所有文件', extensions: ['*'] }
                        ],
                        properties: ['openFile']
                    });
                    if (result && !result.canceled && result.filePaths && result.filePaths.length > 0) {
                        displayEdit.url = result.filePaths[0];
                    }
                }
            } catch (e) {
                console.error('选择文件失败:', e);
                showMsg('选择文件失败: ' + (e.message || e));
            }
        }

        async function saveDisplayEdit() {
            const id = displayEdit.displayId;
            if (displayEdit.isSystem) {
                // 同步系统显示器的内存设置（特别是 display-3 的虚拟位置与当前车厢），确保保存到 pids_settings_v1
                try {
                        if (settings.display && settings.display.displays && settings.display.displays[id]) {
                            const target = settings.display.displays[id];
                            if (displayEdit.isDisplay3) {
                                // 显示器3：出站时长 / 编组 / 当前车厢 / 虚拟位置
                                target.trainFormation = displayEdit.trainFormation;
                                target.activeCarNo = displayEdit.activeCarNo;
                                target.virtualPosition = displayEdit.virtualPosition;
                                if (!settings.display) settings.display = {};
                                const departSec = Number(displayEdit.departDurationSeconds);
                                const departMs = Number.isFinite(departSec) ? Math.max(0, Math.round(departSec * 1000)) : 8000;
                                settings.display.display3DepartDuration = departMs;
                            }
                            if (displayEdit.isDisplay1) {
                                // 显示器1：屏幕虚拟位置
                                target.virtualPosition = displayEdit.virtualPosition;
                            }
                        }
                } catch (e) {
                    console.warn('[Display-3][SlidePanel] 同步系统显示器设置到本地 settings 失败:', e);
                }

                const payload = displayEdit.isDisplay2
                    ? {
                        display2UiVariant: displayEdit.display2UiVariant,
                        nextStationDuration: displayEdit.nextStationDurationSeconds * 1000,
                        isSystem: true,
                        isDisplay2: true
                    }
                    : {
                        // 仅显示器1支持这些开关
                        lineNameMerge: displayEdit.isDisplay1 ? displayEdit.lineNameMerge : undefined,
                        layoutMode: displayEdit.isDisplay1 ? displayEdit.layoutMode : undefined,
                        // 仅显示器1：壁纸
                        wallpaperDataUrl: displayEdit.isDisplay1 ? displayEdit.wallpaperDataUrl : undefined,
                        wallpaperOpacity: displayEdit.isDisplay1 ? displayEdit.wallpaperOpacity : undefined,
                        showAllStations: displayEdit.isDisplay1 ? displayEdit.showAllStations : undefined,
                        layoutMode: displayEdit.isDisplay1 ? displayEdit.layoutMode : undefined,
                        // 显示器3：出站页面显示时长（毫秒）+ 编组 / 当前车厢 / 虚拟位置
                        departDuration: displayEdit.isDisplay3
                            ? (Number.isFinite(Number(displayEdit.departDurationSeconds))
                                ? Math.max(0, Math.round(Number(displayEdit.departDurationSeconds) * 1000))
                                : 8000)
                            : undefined,
                        trainFormation: displayEdit.isDisplay3
                            ? displayEdit.trainFormation
                            : undefined,
                        activeCarNo: displayEdit.isDisplay3
                            ? displayEdit.activeCarNo
                            : undefined,
                        virtualPosition: (displayEdit.isDisplay3 || displayEdit.isDisplay1)
                            ? displayEdit.virtualPosition
                            : undefined,
                        isSystem: true,
                        isDisplay1: displayEdit.isDisplay1 === true,
                        isDisplay3: displayEdit.isDisplay3 === true
                    };
                const updateResult = await editDisplayInternal(id, payload);
                if (updateResult && updateResult.ok) {
                    // 将更新后的系统显示器设置持久化到本地与主进程（pids_settings_v1）
                    try {
                        await saveSettings();
                    } catch (e) {
                        console.warn('[Display-3][SlidePanel] saveDisplayEdit(系统) 保存全局设置失败:', e);
                    }
                    // 若为系统显示器3：同步当前车厢号到共享 localStorage，并广播给显示端 / 客户端
                    if (displayEdit.isDisplay3) {
                        try {
                            if (typeof window !== 'undefined' && window.localStorage) {
                                const v = displayEdit.activeCarNo != null ? Math.floor(displayEdit.activeCarNo) : '';
                                window.localStorage.setItem('metro_pids_display3_active_car_no', String(v));
                                console.log('[Display-3][SlidePanel] saveDisplayEdit(系统) 写入当前车厢到 localStorage:', {
                                    displayId: id,
                                    activeCarNo: v
                                });
                                // BroadcastChannel 通知显示端3
                                try {
                                    const CHANNEL_NAME = 'metro_pids_v3';
                                    const bc = new BroadcastChannel(CHANNEL_NAME);
                                    bc.postMessage({
                                        t: 'DISPLAY3_ACTIVE_CAR',
                                        d: v
                                    });
                                    console.log('[Display-3][SlidePanel] (系统) 已通过 BroadcastChannel 发送 DISPLAY3_ACTIVE_CAR：', v);
                                } catch (e) {
                                    console.warn('[Display-3][SlidePanel] (系统) 通过 BroadcastChannel 推送 DISPLAY3_ACTIVE_CAR 失败', e);
                                }
                                // WebSocket 通知第三方客户端
                                try {
                                    const sdk = getSlidePanelDisplaySdk();
                                    if (sdk && typeof sdk.sendCmd === 'function') {
                                        sdk.sendCmd('DISPLAY3_ACTIVE_CAR', { d: v });
                                        console.log('[Display-3][SlidePanel] (系统) 已通过 WebSocket 发送 DISPLAY3_ACTIVE_CAR：', v);
                                    }
                                } catch (e) {
                                    console.warn('[Display-3][SlidePanel] (系统) 通过 WebSocket 推送 DISPLAY3_ACTIVE_CAR 失败', e);
                                }
                            } else {
                                console.log('[Display-3][SlidePanel] saveDisplayEdit(系统) 无法访问 window.localStorage');
                            }
                        } catch (e) {
                            console.warn('[Display-3][SlidePanel] saveDisplayEdit(系统) 写入 display-3 当前车厢到 localStorage 失败', e);
                        }
                    }
                    closeDisplayEditDialog();
                    notification.success({
                        key: 'display-config-updated',
                        message: i18n.global.t('display.configUpdatedTitle'),
                        description: i18n.global.t('display.configUpdatedBody', { name: displayEdit.name }),
                        placement: 'topRight',
                        duration: 4.5
                    });
                }
                return;
            }
            const name = (displayEdit.name || '').trim();
            const source = displayEdit.source;
            const url = (displayEdit.url || '').trim();
            const description = (displayEdit.description || '').trim();
            if (!name) {
                showMsg('请输入显示端名称');
                return;
            }
            if (source === 'builtin' && !url) {
                showMsg('请选择本地网页文件');
                return;
            }
            if (source === 'online' && !url) {
                showMsg('请输入在线显示器的URL');
                return;
            }
            if (source === 'online' && url) {
                try { new URL(url); } catch (e) {
                    showMsg('请输入有效的URL格式，例如：https://example.com/display.html');
                    return;
                }
            }
                const result = {
                name, source, url, description,
                // 仅显示器1支持这些开关
                lineNameMerge: displayEdit.isDisplay1 ? displayEdit.lineNameMerge : undefined,
                layoutMode: displayEdit.isDisplay1 ? displayEdit.layoutMode : undefined,
                // 仅显示器1：壁纸
                wallpaperDataUrl: displayEdit.isDisplay1 ? displayEdit.wallpaperDataUrl : undefined,
                wallpaperOpacity: displayEdit.isDisplay1 ? displayEdit.wallpaperOpacity : undefined,
                showAllStations: displayEdit.isDisplay1 ? displayEdit.showAllStations : undefined,
                layoutMode: displayEdit.isDisplay1 ? displayEdit.layoutMode : undefined,
                isDisplay1: displayEdit.isDisplay1,
                display2UiVariant: displayEdit.isDisplay2 ? displayEdit.display2UiVariant : undefined,
                nextStationDuration: displayEdit.isDisplay2 ? displayEdit.nextStationDurationSeconds * 1000 : undefined,
                // 显示器3：编组、当前车厢与屏幕虚拟位置
                trainFormation: displayEdit.isDisplay3 ? displayEdit.trainFormation : undefined,
                activeCarNo: displayEdit.isDisplay3 ? displayEdit.activeCarNo : undefined,
                // 显示器1/3：屏幕虚拟位置
                virtualPosition: (displayEdit.isDisplay3 || displayEdit.isDisplay1) ? displayEdit.virtualPosition : undefined,
                isDisplay2: displayEdit.isDisplay2,
                isDisplay3: displayEdit.isDisplay3
            };
            const updateResult = await editDisplayInternal(id, result);
            if (updateResult && updateResult.ok) {
                // 若为系统显示器3：同步当前车厢号到共享 localStorage，供显示端直接读取，并打日志
                if (displayEdit.isDisplay3) {
                    try {
                        if (typeof window !== 'undefined' && window.localStorage) {
                            const v = displayEdit.activeCarNo != null ? Math.floor(displayEdit.activeCarNo) : '';
                            window.localStorage.setItem('metro_pids_display3_active_car_no', String(v));
                            console.log('[Display-3][SlidePanel] saveDisplayEdit 写入当前车厢到 localStorage:', {
                                displayId: id,
                                activeCarNo: v,
                                rawDisplayActiveCarNo: result.activeCarNo
                            });

                            // 直接通过 BroadcastChannel 将新的当前车厢号推送给显示器3
                            try {
                                const CHANNEL_NAME = 'metro_pids_v3';
                                const bc = new BroadcastChannel(CHANNEL_NAME);
                                bc.postMessage({
                                    t: 'DISPLAY3_ACTIVE_CAR',
                                    d: v
                                });
                                console.log('[Display-3][SlidePanel] 已通过 BroadcastChannel 发送 DISPLAY3_ACTIVE_CAR：', v);
                            } catch (e) {
                                console.warn('[Display-3][SlidePanel] 通过 BroadcastChannel 推送 DISPLAY3_ACTIVE_CAR 失败', e);
                            }
                            
                            // 同步当前车厢号给 WebSocket 客户端（例如 Python/硬件客户端）
                            try {
                                const sdk = getSlidePanelDisplaySdk();
                                if (sdk && typeof sdk.sendCmd === 'function') {
                                    sdk.sendCmd('DISPLAY3_ACTIVE_CAR', { d: v });
                                    console.log('[Display-3][SlidePanel] 已通过 WebSocket 发送 DISPLAY3_ACTIVE_CAR：', v);
                                }
                            } catch (e) {
                                console.warn('[Display-3][SlidePanel] 通过 WebSocket 推送 DISPLAY3_ACTIVE_CAR 失败', e);
                            }
                        } else {
                            console.log('[Display-3][SlidePanel] saveDisplayEdit 无法访问 window.localStorage');
                        }
                    } catch (e) {
                        console.warn('[Display-3][SlidePanel] 写入 display-3 当前车厢到 localStorage 失败', e);
                    }
                } else {
                    console.log('[Display-3][SlidePanel] saveDisplayEdit 更新的不是系统 display-3，id =', id);
                }

                closeDisplayEditDialog();
                notification.success({
                    key: 'display-config-updated',
                    message: i18n.global.t('display.configUpdatedTitle'),
                    description: i18n.global.t('display.configUpdatedBody', { name }),
                    placement: 'topRight',
                    duration: 4.5
                });
            }
        }

        // 点击卡片切换显示端
        async function selectDisplay(displayId) {
            if (ENABLE_SLIDE_LOG) console.log('[SlidePanel] 点击切换显示端到:', displayId);
            
            // 确保显示端存在且已启用
            const targetDisplay = settings.display.displays[displayId];
            if (!targetDisplay) {
                console.warn('[SlidePanel] 显示端不存在:', displayId);
                return;
            }
            
            if (!isDisplayEnabled(targetDisplay)) {
                const displayName = getDisplayName(targetDisplay, displayId);
                notification.warning({
                    key: 'display-disabled',
                    message: i18n.global.t('display.notifyDisabledTitle'),
                    description: i18n.global.t('display.notifyDisabledDesc', { name: displayName }),
                    placement: 'topRight',
                    duration: 4.5
                });
                return;
            }
            
            // 强制更新状态，确保响应性
            const oldDisplayId = settings.display.currentDisplayId;
            
            // 同步更新设置和本地状态（不使用 nextTick，确保立即生效）
            settings.display.currentDisplayId = displayId;
            displayState.currentDisplayId = displayId;
            
            // 强制触发响应性更新
            Object.assign(displayState, {
                currentDisplayId: displayId,
                displays: normalizeDisplaysMap(settings.display.displays)
            });
            
            // 切换到显示器1/3时：同步显示端设置到线路 meta（用于显示端读取）
            if ((displayId === 'display-1' || displayId === 'display-3') && pidsState && pidsState.appData && pidsState.appData.meta && targetDisplay) {
                if (targetDisplay.lineNameMerge !== undefined) {
                    pidsState.appData.meta.lineNameMerge = targetDisplay.lineNameMerge;
                }
                if (displayId === 'display-3' && targetDisplay.display3Tags && typeof targetDisplay.display3Tags === 'object') {
                    pidsState.appData.meta.display3Tags = { ...targetDisplay.display3Tags };
                }
                // 同步到显示端
                sync();
            }
            
            // 立即保存设置到 localStorage，确保侧边栏按钮能读取到最新值
            saveSettings();
            
            // 强制同步 settings 对象，确保响应式更新立即生效
            // 通过重新赋值触发 Vue 的响应式系统
            const currentId = settings.display.currentDisplayId;
            settings.display.currentDisplayId = displayId;
            if (ENABLE_SLIDE_LOG) console.log('[SlidePanel] 已更新 settings.display.currentDisplayId:', currentId, '->', displayId);
            
            // 不再自动打开/切换显示窗口，用户需要通过侧边栏按钮手动打开
            // handleDisplayWindowSwitch();
            
            // 使用 nextTick 延迟显示通知，确保 UI 更新完成
            nextTick(() => {
                const displayName = targetDisplay.name || displayId;
                if (ENABLE_SLIDE_LOG) console.log('[SlidePanel] 显示端切换完成:', oldDisplayId, '->', displayId);
                
                notification.success({
                    key: 'display-switched',
                    message: i18n.global.t('display.notifySwitchedTitle'),
                    description: i18n.global.t('display.notifySwitchedDesc', { name: displayName }),
                    placement: 'topRight',
                    duration: 4.5
                });
            });
        }

        // 处理显示窗口切换
        function handleDisplayWindowSwitch() {
            // 如果有显示窗口正在运行，需要通知更新或重新打开
            if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.switchDisplay) {
                // Electron 环境：通知主进程切换显示端
                try {
                    const currentDisplayConfig = currentDisplay.value;
                    window.electronAPI.switchDisplay(
                        currentDisplayConfig.id,
                        currentDisplayConfig.width || 1900,
                        currentDisplayConfig.height || 600
                    );
                } catch (e) {
                    console.warn('切换显示端失败:', e);
                }
            } else if (typeof window !== 'undefined' && !isElectronRuntime) {
                // 浏览器环境：如果有弹窗显示窗口，关闭并重新打开
                if (window.__metro_pids_display_popup && !window.__metro_pids_display_popup.closed) {
                    try {
                        window.__metro_pids_display_popup.close();
                        window.__metro_pids_display_popup = null;
                        window.__metro_pids_display_popup_ready = false;
                        
                        // 短暂延迟后重新打开新的显示端
                        setTimeout(() => {
                            if (uiState.showDisplay) {
                                // 重新打开显示窗口
                                const currentDisplayConfig = currentDisplay.value;
                                let url = '';
                                
                                if (currentDisplayConfig.source === 'builtin') {
                                    // 如果配置了本地文件路径，使用该路径；否则使用默认路径
                                    if (currentDisplayConfig.url) {
                                        url = currentDisplayConfig.url;
                                    } else if (currentDisplayConfig.id === 'display-1') {
                                        url = 'display_window.html';
                                    } else {
                                        url = `displays/${currentDisplayConfig.id}/display_window.html`;
                                    }
                                } else if (currentDisplayConfig.source === 'gitee') {
                                    url = currentDisplayConfig.url || '';
                                } else {
                                    url = currentDisplayConfig.url || '';
                                }
                                
                                if (url) {
                                    const w = currentDisplayConfig.width || 1900;
                                    const h = currentDisplayConfig.height || 600;
                                    const newWin = window.open(url, `_blank_${currentDisplayConfig.id}`, `width=${w},height=${h}`);
                                    if (newWin) {
                                        window.__metro_pids_display_popup = newWin;
                                        window.__metro_pids_display_popup_ready = false;
                                    }
                                }
                            }
                        }, 100);
                    } catch (e) {
                        console.warn('重新打开显示窗口失败:', e);
                    }
                }
            }
        }

        // 拖拽开始
        function handleDragStart(event, displayId) {
            draggedDisplayId.value = displayId;
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', displayId);
            
            // 添加拖拽样式
            event.target.style.opacity = '0.5';
        }

        // 拖拽结束
        function handleDragEnd(event) {
            event.target.style.opacity = '1';
            draggedDisplayId.value = null;
            dragOverDisplayId.value = null;
        }

        // 拖拽进入
        function handleDragEnter(event, displayId) {
            event.preventDefault();
            if (draggedDisplayId.value && draggedDisplayId.value !== displayId) {
                dragOverDisplayId.value = displayId;
            }
        }

        // 拖拽离开
        function handleDragLeave(event) {
            // 只有当鼠标真正离开元素时才清除高亮
            if (!event.currentTarget.contains(event.relatedTarget)) {
                dragOverDisplayId.value = null;
            }
        }

        // 拖拽悬停
        function handleDragOver(event) {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
        }

        // 拖拽放置
        function handleDrop(event, targetDisplayId) {
            event.preventDefault();
            
            const sourceDisplayId = draggedDisplayId.value;
            if (!sourceDisplayId || sourceDisplayId === targetDisplayId) {
                return;
            }

            // 重新排序显示端
            reorderDisplays(sourceDisplayId, targetDisplayId);
            
            draggedDisplayId.value = null;
            dragOverDisplayId.value = null;
        }

        // 重新排序显示端
        function reorderDisplays(sourceId, targetId) {
            // 兜底：任何重排都必须带上系统显示器，避免“只重排了用户显示器”导致系统显示器从对象里被丢掉
            const displays = normalizeDisplaysMap(settings.display.displays);
            const displayIds = Object.keys(displays);
            
            const sourceIndex = displayIds.indexOf(sourceId);
            const targetIndex = displayIds.indexOf(targetId);
            
            if (sourceIndex === -1 || targetIndex === -1) return;
            
            // 创建新的显示端对象，按新顺序排列
            const newDisplays = {};
            const reorderedIds = [...displayIds];
            
            // 移动元素到新位置
            reorderedIds.splice(sourceIndex, 1);
            reorderedIds.splice(targetIndex, 0, sourceId);
            
            // 重建显示端对象
            reorderedIds.forEach(id => {
                newDisplays[id] = displays[id];
            });
            
            // 同时更新设置和本地状态
            settings.display.displays = normalizeDisplaysMap(newDisplays);
            displayState.displays = normalizeDisplaysMap(settings.display.displays);
            
            saveSettings();
            
            if (ENABLE_SLIDE_LOG) console.log('[SlidePanel] 显示端排序已更新:', sourceId, '->', targetId);
            
            notification.success({
                key: 'display-reordered',
                message: i18n.global.t('display.notifyReorderTitle'),
                description: i18n.global.t('display.notifyReorderDesc', {
                    name: getDisplayName(displays[sourceId], sourceId)
                }),
                placement: 'topRight',
                duration: 4.5
            });
        }

        // 添加新显示端
        async function addNewDisplay() {
            // 兜底：新增前先补齐系统显示器，避免任何异常覆盖导致系统显示器“消失”
            settings.display.displays = normalizeDisplaysMap(settings.display.displays);
            displayState.displays = normalizeDisplaysMap(displayState.displays);

            const name = await promptUser('请输入显示端名称', `显示端 ${Object.keys(settings.display.displays).length + 1}`);
            if (!name) return;

            const newId = `display-${Date.now()}`;
            const newDisplay = {
                id: newId,
                name: name,
                source: 'builtin',
                url: '',
                width: 1900,
                height: 600,
                enabled: true,
                isSystem: false, // 用户添加的显示端不是系统显示器
                description: '用户自定义显示端'
            };
            
            // 使用 nextTick 确保状态更新的正确顺序
            await nextTick();
            
            // 同时更新设置和本地状态
            settings.display.displays[newId] = newDisplay;
            settings.display.displays = normalizeDisplaysMap(settings.display.displays);
            displayState.displays = normalizeDisplaysMap(settings.display.displays);
            
            settings.display.currentDisplayId = newId;
            displayState.currentDisplayId = newId;
            
            saveSettings();
            
            if (ENABLE_SLIDE_LOG) console.log('[SlidePanel] 新显示端已添加:', newId, newDisplay);
            await showMsg(`显示端 "${name}" 已添加并设为当前活动显示端`);
        }

        // 编辑显示端（内部函数，供UI和API调用）
        async function editDisplayInternal(displayId, displayData = null) {
            const display = settings.display.displays[displayId];
            if (!display) {
                return { ok: false, error: '显示端不存在' };
            }
            
            // 如果提供了displayData，说明是API调用，直接更新
            if (displayData) {
                // 检查是否为系统显示器
                if (display.isSystem) {
                    // 系统显示器只能更新开关值（仅显示器1）或显示器2的设置
                    if (displayId === 'display-1' || displayId === 'display-3') {
                        if (displayData.lineNameMerge !== undefined) {
                            display.lineNameMerge = displayData.lineNameMerge;
                        }
                        if (displayData.layoutMode !== undefined && (displayData.layoutMode === 'linear' || displayData.layoutMode === 'c-type')) {
                            display.layoutMode = displayData.layoutMode;
                        }
                            // 显示器1：壁纸
                            if (displayId === 'display-1') {
                                if (displayData.wallpaperDataUrl !== undefined) {
                                    display.wallpaperDataUrl = (typeof displayData.wallpaperDataUrl === 'string') ? displayData.wallpaperDataUrl : '';
                                }
                                if (displayData.wallpaperOpacity !== undefined) {
                                    const op = Number.isFinite(displayData.wallpaperOpacity) ? displayData.wallpaperOpacity : parseFloat(displayData.wallpaperOpacity);
                                    display.wallpaperOpacity = Number.isFinite(op) ? Math.max(0, Math.min(1, op)) : 0.35;
                                }
                            }
                        // 显示器3：编组 / 当前车厢
                        if (displayId === 'display-3' && displayData.departDuration !== undefined) {
                            settings.display.display3DepartDuration = displayData.departDuration;
                        }
                        if (displayId === 'display-3' && displayData.trainFormation !== undefined) {
                            display.trainFormation = normalizeDisplay3TrainFormation(displayData.trainFormation);
                        }
                        if (displayId === 'display-3' && displayData.activeCarNo !== undefined) {
                            const num = Number(displayData.activeCarNo);
                            display.activeCarNo = Number.isFinite(num) && num > 0 ? Math.floor(num) : null;
                        }
                        // 如果这是当前活动的显示端，同步设置到线路数据
                        if (displayId === settings.display.currentDisplayId) {
                            if (pidsState && pidsState.appData && pidsState.appData.meta) {
                                if (displayData.lineNameMerge !== undefined) {
                                    pidsState.appData.meta.lineNameMerge = displayData.lineNameMerge;
                                }
                                sync();
                            }
                        } else {
                            sync();
                        }
                    } else if (displayId === 'display-2') {
                        if (displayData.display2UiVariant === 'classic' || displayData.display2UiVariant === 'modern') {
                            settings.display.display2UiVariant = displayData.display2UiVariant;
                        }
                        // 显示器2：更新"下一站"页面显示时长
                        if (displayData.nextStationDuration !== undefined) {
                            settings.display.display2NextStationDuration = displayData.nextStationDuration;
                        }
                    }
                } else {
                    // 非系统显示器，更新所有字段
                    if (displayData.name !== undefined) display.name = displayData.name;
                    if (displayData.source !== undefined) display.source = displayData.source;
                    if (displayData.url !== undefined) display.url = displayData.url;
                    if (displayData.description !== undefined) display.description = displayData.description;
                    // 显示器1/3：保存开关值
                    if (displayId === 'display-1' || displayId === 'display-3') {
                        if (displayData.lineNameMerge !== undefined) {
                            display.lineNameMerge = displayData.lineNameMerge;
                        }
                        if (displayData.layoutMode !== undefined && (displayData.layoutMode === 'linear' || displayData.layoutMode === 'c-type')) {
                            display.layoutMode = displayData.layoutMode;
                        }
                    }
                    // 显示器1：壁纸
                    if (displayId === 'display-1') {
                        if (displayData.wallpaperDataUrl !== undefined) {
                            display.wallpaperDataUrl = (typeof displayData.wallpaperDataUrl === 'string') ? displayData.wallpaperDataUrl : '';
                        }
                        if (displayData.wallpaperOpacity !== undefined) {
                            const op = Number.isFinite(displayData.wallpaperOpacity) ? displayData.wallpaperOpacity : parseFloat(displayData.wallpaperOpacity);
                            display.wallpaperOpacity = Number.isFinite(op) ? Math.max(0, Math.min(1, op)) : 0.35;
                        }
                    }
                    // 显示器3：保存标签/提示开关
                    if (displayId === 'display-3' && displayData.display3Tags !== undefined) {
                        if (displayData.display3Tags && typeof displayData.display3Tags === 'object') {
                            display.display3Tags = { ...displayData.display3Tags };
                        } else {
                            delete display.display3Tags;
                        }
                    }
                    // 显示器2：更新"下一站"页面显示时长
                    if (displayId === 'display-2') {
                        if (displayData.display2UiVariant === 'classic' || displayData.display2UiVariant === 'modern') {
                            settings.display.display2UiVariant = displayData.display2UiVariant;
                        }
                        if (displayData.nextStationDuration !== undefined) {
                            settings.display.display2NextStationDuration = displayData.nextStationDuration;
                        }
                    }
                    // 显示器3：更新“出站页面显示时长”
                    if (displayId === 'display-3' && displayData.departDuration !== undefined) {
                        settings.display.display3DepartDuration = displayData.departDuration;
                    }
                    if (displayId === 'display-3' && displayData.trainFormation !== undefined) {
                        display.trainFormation = normalizeDisplay3TrainFormation(displayData.trainFormation);
                    }
                }
                
                // 如果这是当前活动的显示端，同步设置到线路数据（display-1/3）
                if (displayId === settings.display.currentDisplayId) {
                    if (pidsState && pidsState.appData && pidsState.appData.meta) {
                        if (displayId === 'display-1' || displayId === 'display-3') {
                            if (displayData.lineNameMerge !== undefined) pidsState.appData.meta.lineNameMerge = displayData.lineNameMerge;
                        }
                        if (displayId === 'display-3' && displayData.display3Tags && typeof displayData.display3Tags === 'object') {
                            pidsState.appData.meta.display3Tags = { ...displayData.display3Tags };
                        }
                        // 同步到显示端
                        try { sync(); } catch (e) {}
                    }
                }

                // 强制更新显示端状态确保响应性
                settings.display.displays = normalizeDisplaysMap(settings.display.displays);
                displayState.displays = normalizeDisplaysMap(settings.display.displays);
                saveSettings();
                
                return { ok: true, message: `显示端 "${display.name}" 已更新` };
            }
            
            // 否则是UI调用，显示编辑弹窗
            return null;
        }

        // 编辑显示端（UI调用）：打开与更新日志同风格的 Vue 弹窗
        function editDisplay(displayId) {
            openDisplayEditDialog(displayId);
        }

        // 显示显示端右键菜单
        function showDisplayContextMenu(event, displayId = null) {
            event.preventDefault();
            event.stopPropagation();
            displayContextMenu.value = {
                visible: true,
                x: event.clientX,
                y: event.clientY,
                displayId: displayId
            };
        }
        
        // 关闭显示端右键菜单
        function closeDisplayContextMenu() {
            displayContextMenu.value.visible = false;
        }
        
        // 从右键菜单编辑显示端
        function editDisplayFromMenu() {
            if (displayContextMenu.value.displayId) {
                editDisplay(displayContextMenu.value.displayId);
            }
            closeDisplayContextMenu();
        }
        
        // 从右键菜单切换显示端启用状态
        function toggleDisplayEnabledFromMenu() {
            if (displayContextMenu.value.displayId) {
                toggleDisplayEnabled(displayContextMenu.value.displayId);
            }
            closeDisplayContextMenu();
        }
        
        // 从右键菜单删除显示端
        async function deleteDisplayFromMenu() {
            const id = displayContextMenu.value.displayId;
            // 先关闭右键菜单，避免删除确认/异步流程期间菜单“卡住不消失”
            closeDisplayContextMenu();
            if (id) {
                await deleteDisplay(id);
            }
        }
        
        // 从右键菜单新建显示端
        async function addNewDisplayFromMenu() {
            closeDisplayContextMenu();
            await addNewDisplay();
        }
        
        // 切换显示端启用状态
        function toggleDisplayEnabled(displayId) {
            const display = settings.display.displays[displayId];
            if (display) {
                display.enabled = !isDisplayEnabled(display);
                
                // 强制更新显示端状态确保响应性
                settings.display.displays = normalizeDisplaysMap(settings.display.displays);
                displayState.displays = normalizeDisplaysMap(settings.display.displays);
                
                saveSettings();
                
                if (ENABLE_SLIDE_LOG) console.log('[SlidePanel] 显示端启用状态已切换:', displayId, display.enabled);
                
                const statusText = isDisplayEnabled(display)
                    ? i18n.global.t('display.statusEnabled')
                    : i18n.global.t('display.statusDisabled');
                const displayName = getDisplayName(display, displayId);
                notification.success({
                    key: 'display-status-changed',
                    message: i18n.global.t('display.notifyStatusTitle'),
                    description: i18n.global.t('display.notifyStatusDesc', { name: displayName, status: statusText }),
                    placement: 'topRight',
                    duration: 4.5
                });
            }
        }

        // 删除显示端
        async function deleteDisplay(displayId) {
            const display = settings.display.displays[displayId];
            if (!display) return;
            
            // 检查是否为系统显示器（双重保护：检查 isSystem 属性和 displayId）
            // display-1、display-2、display-3 是系统显示器，不允许删除
            if (displayId === 'display-1' || displayId === 'display-2' || displayId === 'display-3' || display.isSystem === true) {
                await showMsg('系统显示器不允许删除');
                return;
            }

            if (!(await askUser(`确定要删除显示端 "${display.name}" 吗？`))) return;

            // 使用 nextTick 确保状态更新的正确顺序
            await nextTick();

            // 同时从设置和本地状态中删除
            delete settings.display.displays[displayId];
            
            // 创建新的显示端对象确保响应性
            settings.display.displays = normalizeDisplaysMap(settings.display.displays);
            displayState.displays = normalizeDisplaysMap(settings.display.displays);
            
            // 如果删除的是当前显示端，切换到第一个可用的显示端
            if (settings.display.currentDisplayId === displayId) {
                const remainingIds = Object.keys(settings.display.displays);
                if (remainingIds.length > 0) {
                    settings.display.currentDisplayId = remainingIds[0];
                    displayState.currentDisplayId = remainingIds[0];
                    if (ENABLE_SLIDE_LOG) console.log('[SlidePanel] 删除当前显示端，切换到:', remainingIds[0]);
                }
            }

            saveSettings();
            
            if (ENABLE_SLIDE_LOG) console.log('[SlidePanel] 显示端已删除:', displayId);
            await showMsg(`显示端 "${display.name}" 已删除`);
        }

        // 打开所有启用的显示端
        async function openAllDisplays() {
            const enabledDisplays = Object.values(settings.display.displays).filter((d) => isDisplayEnabled(d));
            
            if (enabledDisplays.length === 0) {
                await showMsg('没有启用的显示端');
                return;
            }

            let openedCount = 0;
            let skippedCount = 0;
            
            for (const display of enabledDisplays) {
                try {
                    if (display.source === 'builtin') {
                        // Electron 原生窗口
                        if (typeof window !== 'undefined' && window.electronAPI && typeof window.electronAPI.openDisplay === 'function') {
                            await window.electronAPI.openDisplay(display.width, display.height, display.id);
                            openedCount++;
                        } else if (!isElectronRuntime) {
                            // 浏览器弹窗
                            let url;
                            // 如果配置了本地文件路径，使用该路径；否则使用默认路径
                            if (display.url) {
                                url = display.url;
                            } else if (display.id === 'display-1') {
                                url = 'display_window.html';
                            } else {
                                url = `displays/${display.id}/display_window.html`;
                            }
                            const popup = window.open(url, `display_${display.id}`, `width=${display.width},height=${display.height}`);
                            if (popup) {
                                openedCount++;
                            }
                        } else {
                            skippedCount++;
                        }
                    } else if (display.source === 'online' || display.source === 'custom' || display.source === 'gitee') {
                        // 在线显示器、自定义URL或Gitee页面
                        const url = display.url;
                        if (url && !isElectronRuntime) {
                            const popup = window.open(url, `display_${display.id}`, `width=${display.width},height=${display.height}`);
                            if (popup) {
                                openedCount++;
                            }
                        } else if (isElectronRuntime) {
                            skippedCount++;
                        }
                    }
                } catch (e) {
                    console.error(`打开显示端 ${display.name} 失败:`, e);
                }
            }

            let message = i18n.global.t('display.openAttempted', { count: openedCount });
            if (skippedCount > 0) {
                message += i18n.global.t('display.openSkipped', { count: skippedCount });
            }
            await showMsg(message);
        }

        // 关闭所有显示端
        async function closeAllDisplays() {
            try {
                // 发送关闭命令到所有显示端
                if (pidsState && pidsState.bcWrap && typeof pidsState.bcWrap.post === 'function') {
                    pidsState.bcWrap.post({ t: 'CMD_UI', cmd: 'winClose' });
                }
                
                // 同时通过 postMessage 发送
                if (typeof window !== 'undefined' && window.postMessage) {
                    window.postMessage({ t: 'CMD_UI', cmd: 'winClose' }, '*');
                }

                await showMsg(i18n.global.t('display.closeCommandSent'));
            } catch (e) {
                console.error('关闭显示端失败:', e);
                await showMsg(i18n.global.t('display.closeError'));
            }
        }

        // 清理分辨率缩放监听
        onUnmounted(() => {
            if (typeof document !== 'undefined') {
                document.removeEventListener('pointerdown', handlePreferencesDropdownOutsideClick, true)
            }
            if (dropdownThemeObserver) {
                dropdownThemeObserver.disconnect()
                dropdownThemeObserver = null
            }
            if (dropdownThemeMediaQuery) {
                if (typeof dropdownThemeMediaQuery.removeEventListener === 'function') {
                    dropdownThemeMediaQuery.removeEventListener('change', updateDropdownThemeState)
                } else if (typeof dropdownThemeMediaQuery.removeListener === 'function') {
                    dropdownThemeMediaQuery.removeListener(updateDropdownThemeState)
                }
                dropdownThemeMediaQuery = null
            }
            if (scaleCheckInterval) {
                clearInterval(scaleCheckInterval);
                scaleCheckInterval = null;
            }
            // 清理网页环境的事件监听器
            if (cleanupWebListeners) {
                cleanupWebListeners();
                cleanupWebListeners = null;
            }
            if (cleanupWsPortAutoSwitchListener) {
                cleanupWsPortAutoSwitchListener();
                cleanupWsPortAutoSwitchListener = null;
            }
            stopLineManagerSaveWatcher();
        });

        return {
            uiState,
            closePanel,
            ...autoplay,
            isPlaying, isPaused, nextIn, start, stop, togglePause,
            fileIO,
            pidsState,
            switchLine, switchLineByName, newLine, delLine, saveCfg, clearShortTurn, applyShortTurn,
            applyThroughOperation, clearThroughOperation,
            openLineManagerForThroughOperation, openLineManagerForSegment,
            throughLineSegments, addThroughLineSegment, removeThroughLineSegment,
            cleanStationName,
            settings, saveSettings, keyMapDisplay, recordKey, clearKey, resetKeys,
            updateState, checkForUpdateClicked, downloadUpdateNow, clearCacheAndRedownload, installDownloadedUpdate, skipThisVersion, openGitHubReleases, openExternalUrl,
            version, hasElectronAPI, pickColor, openColorPicker,
            showColorPicker, colorPickerInitialColor, onColorConfirm,
            startWithLock, stopWithUnlock, startRecordingWithCheck,
            changeServiceMode, serviceModeLabel,
            resetOnboardingGuide,
            showReleaseNotes, releaseNotes, loadingNotes, releaseNotesSource, releaseNotesSourceText, openReleaseNotes, closeReleaseNotes, formatReleaseBody, onReleaseBodyClick, imageViewerSrc, openImageViewer, closeImageViewer,
            shortTurnPresets, loadShortTurnPresets, saveShortTurnPreset, loadShortTurnPreset, deleteShortTurnPreset,
            presetContextMenu, showPresetContextMenu, closePresetContextMenu, applyPresetFromMenu, deletePresetFromMenu, sharePresetOffline, importPresetFromShareCode, generateShareId,
            openLineManagerWindow, openLineManagerForSave,
            lanIpsResolved, loadLanIps, wsPortDisplay, apiPortDisplay,
            openLineManagerWindow, openLineManagerForSave,
            lanIpsResolved, loadLanIps, wsPortDisplay, apiPortDisplay,
            multiScreenHttpPort,
            multiScreenEntryUrl, multiScreenQrUrl, showMultiScreenQrDialog,
            openMultiScreenQrDialog, closeMultiScreenQrDialog, copyMultiScreenEntryUrl,
            showWsClientsDialog, wsClientsLoading, wsClients,
            openWsClientsDialog, closeWsClientsDialog, loadWsClients, formatWsClientLatency,
            // 显示端管理方法
            currentDisplay, currentDisplayId, displayState, selectDisplay, 
            draggedDisplayId, dragOverDisplayId,
            handleDragStart, handleDragEnd, handleDragEnter, handleDragLeave, handleDragOver, handleDrop,
            addNewDisplay, editDisplay, toggleDisplayEnabled, deleteDisplay, openAllDisplays, closeAllDisplays,
            isDisplayEnabled,
            shouldShowDisplay, visibleDisplayEntries, // 显示端可见列表（过滤后若为空则回退为全部）
            // 编辑显示端弹窗（与站点编辑弹窗同架构）
            showDisplayEditDialog, displayEdit, closeDisplayEditDialog, saveDisplayEdit, pickDisplayEditFile,
            display1WallpaperInput, pickDisplay1Wallpaper, onDisplay1WallpaperFileChange, clearDisplay1Wallpaper,
            // 显示端右键菜单
            displayContextMenu, showDisplayContextMenu, closeDisplayContextMenu,
            editDisplayFromMenu, toggleDisplayEnabledFromMenu, deleteDisplayFromMenu, addNewDisplayFromMenu,
            // 主题/语言设置
            themeModeDropdownRef, languageDropdownRef,
            showThemeModeDropdown, toggleThemeModeDropdown, themeModeOptions, currentThemeModeTitle, selectThemeMode, themeModeDropdownMenuStyle,
            currentLocale, languageOptions, changeLanguage,
            showLanguageDropdown, toggleLanguageDropdown, currentLanguageTitle, selectLanguage, languageDropdownMenuStyle,
            glassDropdownDirective,
            dropdownTriggerStyle,
            showUiVariantDropdown, toggleUiVariantDropdown, selectUiVariant, uiVariantDropdownRef, uiVariantDropdownMenuStyle,
            display3TrainFormationOptions,
            // 显示器3：车辆编组 / 当前车厢 / 屏幕位置下拉
            trainFormationTitle, showTrainFormationDropdown, toggleTrainFormationDropdown, selectTrainFormation, trainFormationDropdownRef,
            showActiveCarDropdown, toggleActiveCarDropdown, selectActiveCar, activeCarDropdownRef, activeCarDropdownMenuStyle,
            showVirtualPosDropdown, toggleVirtualPosDropdown, selectVirtualPos, virtualPosDropdownRef, virtualPosDropdownMenuStyle,
            virtualPosOptions, virtualPosTitle,
            glassMenuBackground, glassMenuBorder, glassMenuShadow, glassItemHoverBackground, glassItemActiveBackground, glassDividerColor,
            contextMenuBackdropFilter
        };
    }}


