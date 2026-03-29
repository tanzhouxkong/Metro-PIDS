import { useUIState } from '../composables/useUIState.js'
import { useAutoplay } from '../composables/useAutoplay.js'
import { showNotification } from '../utils/notificationService.js'
import { useFileIO } from '../composables/useFileIO.js'
import { usePidsState } from '../composables/usePidsState.js'
import { useController } from '../composables/useController.js'
import { useSettings } from '../composables/useSettings.js'
import { useStationAudio } from '../composables/useStationAudio.js'
import dialogService from '../utils/dialogService.js'
import { applyThroughOperation as mergeThroughLines } from '../utils/throughOperation.js'
import { DEFAULT_SETTINGS } from '../utils/defaults.js'
import { getEffectiveViewportRect } from '../utils/effectiveViewportRect.js'
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick, toRaw } from 'vue'
import { useI18n } from 'vue-i18n'
import { notification } from 'antdv-next'
import ColorPicker from './ColorPicker.vue'

export default {
  name: 'ConsolePage',
  components: { ColorPicker },
  setup() {
    const { state: pidsState, sync: syncState } = usePidsState()
    const { next: controllerNext, sync, getStep } = useController()
    const { uiState } = useUIState()
    const fileIO = useFileIO(pidsState)
    const { settings, saveSettings } = useSettings()
    const { playArrive, playDepart } = useStationAudio(pidsState)
    const { t } = useI18n()
    const showShortTurnStartDropdown = ref(false)
    const showShortTurnEndDropdown = ref(false)
    const shortTurnStartDropdownRef = ref(null)
    const shortTurnEndDropdownRef = ref(null)
    const shortTurnStartDropdownOpenUp = ref(false)
    const shortTurnEndDropdownOpenUp = ref(false)
    const throughStationDropdownIndex = ref(null)
    const recordingDropdownOpenKey = ref(null)
    const dropdownThemeDark = ref(false)
    let dropdownThemeObserver = null
    let dropdownThemeMediaQuery = null

    const shortTurnStartTitle = computed(() => {
        const idx = pidsState.appData?.meta?.startIdx
        if (idx === -1 || idx == null) return '无'
        const station = pidsState.appData?.stations?.[idx]
        return station ? `[${idx + 1}] ${station.name}` : '无'
    })

    const shortTurnEndTitle = computed(() => {
        const idx = pidsState.appData?.meta?.termIdx
        if (idx === -1 || idx == null) return '无'
        const station = pidsState.appData?.stations?.[idx]
        return station ? `[${idx + 1}] ${station.name}` : '无'
    })

    const isLoopFullRangeShortTurn = (startIdx, termIdx) => {
        const meta = pidsState?.appData?.meta || {}
        const stations = pidsState?.appData?.stations || []
        if (meta.mode !== 'loop') return false
        if (!Array.isArray(stations) || stations.length <= 0) return false
        if (startIdx === -1 || termIdx === -1) return false
        if (!Number.isInteger(startIdx) || !Number.isInteger(termIdx)) return false
        if (startIdx < 0 || termIdx < 0 || startIdx >= stations.length || termIdx >= stations.length) return false
        return (Math.abs(termIdx - startIdx) + 1) >= stations.length
    }

    const isInvalidShortTurnSelection = (startIdx, termIdx) => {
        if (startIdx === -1 || termIdx === -1) return false
        if (Number.isInteger(startIdx) && Number.isInteger(termIdx) && startIdx === termIdx) return true
        return isLoopFullRangeShortTurn(startIdx, termIdx)
    }

    const selectShortTurnStart = async (idx) => {
        const currentTerm = pidsState.appData?.meta?.termIdx
        if (isInvalidShortTurnSelection(idx, currentTerm)) {
            await showMsg(t('console.invalidRouteRuleRetry'))
            showShortTurnStartDropdown.value = false
            return
        }
        pidsState.appData.meta.startIdx = idx
        unlockAutoShortTurn()
        saveCfg()
        showShortTurnStartDropdown.value = false
    }

    const selectShortTurnEnd = async (idx) => {
        const currentStart = pidsState.appData?.meta?.startIdx
        if (isInvalidShortTurnSelection(currentStart, idx)) {
            await showMsg(t('console.invalidRouteRuleRetry'))
            showShortTurnEndDropdown.value = false
            return
        }
        pidsState.appData.meta.termIdx = idx
        unlockAutoShortTurn()
        saveCfg()
        showShortTurnEndDropdown.value = false
    }

    const resolveDropdownDirection = (containerRef, estimatedMenuHeight = 360) => {
        if (typeof window === 'undefined' || !containerRef || !containerRef.value) return false
        const rect = containerRef.value.getBoundingClientRect()
        const vp = getEffectiveViewportRect(containerRef.value)
        const spaceBelow = (vp.bottom - rect.bottom)
        const spaceAbove = (rect.top - vp.top)
        return spaceBelow < estimatedMenuHeight && spaceAbove > spaceBelow
    }

    const toggleShortTurnStartDropdown = () => {
        if (!showShortTurnStartDropdown.value) {
            shortTurnStartDropdownOpenUp.value = resolveDropdownDirection(shortTurnStartDropdownRef, 360)
        }
        showShortTurnStartDropdown.value = !showShortTurnStartDropdown.value
    }

    const toggleShortTurnEndDropdown = () => {
        if (!showShortTurnEndDropdown.value) {
            shortTurnEndDropdownOpenUp.value = resolveDropdownDirection(shortTurnEndDropdownRef, 360)
        }
        showShortTurnEndDropdown.value = !showShortTurnEndDropdown.value
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
    const shortTurnTriggerBackdropFilter = () => (isGlassBlurEnabled() ? 'blur(18px) saturate(170%)' : 'none')

    /** 下拉菜单面板：v-glassmorphism（与 SlidePanel / 弹窗一致） */
    const glassDropdownDirective = computed(() => {
        const dark = isDarkThemeActive()
        if (!isGlassBlurEnabled()) {
            return { blur: 0, opacity: 1, color: dark ? '#1c1c20' : '#ffffff' }
        }
        return { blur: 12, opacity: 0.2, color: dark ? '#1c1c20' : '#ffffff' }
    })

    const shortTurnMenuBackground = () => {
        if (!isGlassBlurEnabled()) return isDarkThemeActive() ? '#1c1c20' : '#ffffff'
        return isDarkThemeActive() ? 'rgba(28, 28, 32, 0.78)' : 'rgba(255,255,255,0.58)'
    }
    const shortTurnMenuBorder = () => {
        if (!isGlassBlurEnabled()) return isDarkThemeActive() ? 'rgba(255,255,255,0.16)' : 'rgba(15,23,42,0.16)'
        return isDarkThemeActive() ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.6)'
    }
    const shortTurnMenuShadow = () => (isDarkThemeActive()
        ? '0 14px 36px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.08), 0 0 0 1px rgba(255,255,255,0.06)'
        : '0 14px 36px rgba(15,23,42,0.22), inset 0 1px 0 rgba(255,255,255,0.5)')
    const shortTurnItemHoverBackground = () => (isDarkThemeActive() ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.32)')
    const shortTurnItemActiveBackground = () => (isDarkThemeActive() ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.38)')

    const shortTurnDropdownTriggerStyle = computed(() => ({
        width: '100%',
        minWidth: 0,
        boxSizing: 'border-box',
        padding: '8px 12px',
        borderRadius: '10px',
        border: `1px solid ${shortTurnMenuBorder()}`,
        background: shortTurnMenuBackground(),
        backdropFilter: shortTurnTriggerBackdropFilter(),
        WebkitBackdropFilter: shortTurnTriggerBackdropFilter(),
        color: 'var(--text)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '8px',
        boxShadow: shortTurnMenuShadow()
    }))

    const shortTurnStartDropdownMenuStyle = computed(() => ({
        position: 'absolute',
        left: '0',
        right: '0',
        top: shortTurnStartDropdownOpenUp.value ? 'auto' : 'calc(100% + 8px)',
        bottom: shortTurnStartDropdownOpenUp.value ? 'calc(100% + 8px)' : 'auto',
        maxHeight: 'min(460px, 56vh)',
        overflowY: 'auto',
        border: `1px solid ${shortTurnMenuBorder()}`,
        borderRadius: '12px',
        boxShadow: shortTurnMenuShadow(),
        padding: '6px',
        zIndex: 9999
    }))

    const shortTurnEndDropdownMenuStyle = computed(() => ({
        position: 'absolute',
        left: '0',
        right: '0',
        top: shortTurnEndDropdownOpenUp.value ? 'auto' : 'calc(100% + 8px)',
        bottom: shortTurnEndDropdownOpenUp.value ? 'calc(100% + 8px)' : 'auto',
        maxHeight: 'min(460px, 56vh)',
        overflowY: 'auto',
        border: `1px solid ${shortTurnMenuBorder()}`,
        borderRadius: '12px',
        boxShadow: shortTurnMenuShadow(),
        padding: '6px',
        zIndex: 9999
    }))

    const throughStationLabelStyle = computed(() => ({
        color: 'var(--muted)',
        fontSize: '12px',
        fontWeight: 600,
        lineHeight: '1.2'
    }))

    const throughStationControlStyle = computed(() => ({
        width: '100%',
        padding: '5px 10px',
        borderRadius: '6px',
        border: `1px solid ${shortTurnMenuBorder()}`,
        background: shortTurnMenuBackground(),
        backdropFilter: shortTurnTriggerBackdropFilter(),
        WebkitBackdropFilter: shortTurnTriggerBackdropFilter(),
        color: 'var(--text)',
        fontSize: '12px',
        minHeight: '28px',
        boxShadow: shortTurnMenuShadow()
    }))

    const throughStationDropdownMenuStyle = computed(() => ({
        position: 'absolute',
        left: '0',
        right: '0',
        top: 'calc(100% + 8px)',
        maxHeight: 'min(320px, 42vh)',
        overflowY: 'auto',
        border: `1px solid ${shortTurnMenuBorder()}`,
        borderRadius: '12px',
        boxShadow: shortTurnMenuShadow(),
        padding: '6px',
        zIndex: 9999
    }))

    const toggleThroughStationDropdown = (index) => {
        throughStationDropdownIndex.value = (throughStationDropdownIndex.value === index) ? null : index
    }

    const selectThroughStation = (index, stationName) => {
        if (throughLineSegments.value[index]) {
            throughLineSegments.value[index].throughStationName = stationName || ''
            saveCfg()
        }
        throughStationDropdownIndex.value = null
    }

    const recordingSelectStyle = computed(() => ({
        width: '100%',
        padding: '8px 10px',
        borderRadius: '8px',
        border: `1px solid ${shortTurnMenuBorder()}`,
        background: shortTurnMenuBackground(),
        backdropFilter: shortTurnTriggerBackdropFilter(),
        WebkitBackdropFilter: shortTurnTriggerBackdropFilter(),
        color: 'var(--text)',
        fontSize: '13px',
        boxShadow: shortTurnMenuShadow()
    }))

    const recordingDropdownMenuStyle = computed(() => ({
        position: 'absolute',
        left: '0',
        right: '0',
        top: 'calc(100% + 8px)',
        maxHeight: 'min(320px, 42vh)',
        overflowY: 'auto',
        border: `1px solid ${shortTurnMenuBorder()}`,
        borderRadius: '12px',
        boxShadow: shortTurnMenuShadow(),
        padding: '6px',
        zIndex: 9999
    }))

    const recordingEncoderOptions = computed(() => {
        const options = [
            {
                value: 'cpu',
                label: recordingState.value.hardware.cpuModel
                    ? (recordingState.value.hardware.cpuModel + ' CPU')
                    : t('console.recordingEncoderCPU')
            }
        ]
        if (recordingState.value.availableEncoders.gpu.length > 0) {
            options.push({
                value: 'gpu',
                label: recordingState.value.hardware.gpuModel
                    ? (recordingState.value.hardware.gpuModel + ' GPU')
                    : t('console.recordingEncoderGPU')
            })
        }
        return options
    })

    const recordingCodecOptions = computed(() => ([
        { value: 'h264', label: t('console.recordingCodecH264') },
        { value: 'h265', label: t('console.recordingCodecH265') },
        { value: 'vp9', label: t('console.recordingCodecVP9') }
    ]))

    const recordingContainerOptions = computed(() => ([
        { value: 'mp4', label: 'MP4' },
        { value: 'avi', label: 'AVI' },
        { value: 'mov', label: 'MOV' },
        { value: 'wmv', label: 'WMV' },
        { value: 'mkv', label: 'MKV' },
        { value: 'webm', label: 'WEBM' }
    ]))

    const recordingFpsOptions = computed(() => ([
        { value: 30, label: '30' },
        { value: 60, label: '60' }
    ]))

    const recordingParallelismOptions = computed(() => ([
        { value: 1, label: '1' },
        { value: 2, label: '2' },
        { value: 3, label: '3' },
        { value: 4, label: '4' }
    ]))

    const getRecordingOptionLabel = (options, value) => {
        const hit = (options || []).find((item) => String(item.value) === String(value))
        return hit ? hit.label : ''
    }

    const toggleRecordingDropdown = (key) => {
        if (recordingState.value.isRecording) return
        recordingDropdownOpenKey.value = (recordingDropdownOpenKey.value === key) ? null : key
    }

    const selectRecordingDropdownValue = (key, value) => {
        if (recordingState.value.isRecording) return
        if (key === 'fps' || key === 'parallelism') {
            recordingState.value[key] = Number(value)
        } else {
            recordingState.value[key] = value
        }
        recordingDropdownOpenKey.value = null
    }

    const handleShortTurnDropdownOutsideClick = (event) => {
        const target = event.target
        if (
            showShortTurnStartDropdown.value &&
            shortTurnStartDropdownRef.value &&
            !shortTurnStartDropdownRef.value.contains(target)
        ) {
            showShortTurnStartDropdown.value = false
        }
        if (
            showShortTurnEndDropdown.value &&
            shortTurnEndDropdownRef.value &&
            !shortTurnEndDropdownRef.value.contains(target)
        ) {
            showShortTurnEndDropdown.value = false
        }
        if (
            throughStationDropdownIndex.value !== null &&
            !(target && typeof target.closest === 'function' && target.closest('.through-station-dropdown'))
        ) {
            throughStationDropdownIndex.value = null
        }
        if (
            recordingDropdownOpenKey.value !== null &&
            !(target && typeof target.closest === 'function' && target.closest('.recording-dropdown'))
        ) {
            recordingDropdownOpenKey.value = null
        }
    }

    const playAfterToggle = (prevIdx) => {
        if (recordingState?.value?.isRecording) return;
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
    
    const showMsg = async (msg, title) => dialogService.alert(msg, title)
    const askUser = async (msg, title) => dialogService.confirm(msg, title)
    const promptUser = async (msg, defaultValue, title) => dialogService.prompt(msg, defaultValue, title)
    
    // 检查是否有 Electron API
    const hasElectronAPI = computed(() => {
      return typeof window !== 'undefined' && window.electronAPI && window.electronAPI.startColorPick;
    });
    
    // Mica Electron 测试相关
    const micaInfo = ref({
      isWindows11: false,
      isWindows10: false,
      currentEffect: null,
      currentTheme: 'auto',
      backgroundColor: '#00000000'
    });
    
    const micaTestLogs = ref([]);
    
    // 添加日志
    const addMicaLog = (message, type = 'info') => {
      const timestamp = new Date().toLocaleTimeString();
      micaTestLogs.value.unshift({
        timestamp,
        message,
        type
      });
      // 只保留最近 50 条日志
      if (micaTestLogs.value.length > 50) {
        micaTestLogs.value = micaTestLogs.value.slice(0, 50);
      }
    };
    
    // 获取 Mica 信息
    const getMicaInfo = async () => {
      if (!window.electronAPI || !window.electronAPI.mica) {
        addMicaLog('Mica Electron API 不可用', 'error');
        return;
      }
      try {
        const info = await window.electronAPI.mica.getInfo();
        micaInfo.value = {
          ...micaInfo.value,
          ...info
        };
        addMicaLog(`获取 Mica 信息成功: ${JSON.stringify(info)}`, 'success');
      } catch (e) {
        addMicaLog(`获取 Mica 信息失败: ${e.message}`, 'error');
      }
    };
    
    // 设置 Mica 效果
    const setMicaEffect = async () => {
      if (!window.electronAPI || !window.electronAPI.mica) {
        addMicaLog('Mica Electron API 不可用', 'error');
        return;
      }
      try {
        const result = await window.electronAPI.mica.setMicaEffect();
        if (result && result.ok) {
          micaInfo.value.currentEffect = 'mica';
          addMicaLog('✅ 已设置 Mica 效果', 'success');
          await getMicaInfo();
        } else {
          addMicaLog(`设置 Mica 效果失败: ${result?.error || '未知错误'}`, 'error');
        }
      } catch (e) {
        addMicaLog(`设置 Mica 效果失败: ${e.message}`, 'error');
      }
    };
    
    // 设置 Acrylic 效果
    const setAcrylicEffect = async () => {
      if (!window.electronAPI || !window.electronAPI.mica) {
        addMicaLog('Mica Electron API 不可用', 'error');
        return;
      }
      try {
        const result = await window.electronAPI.mica.setAcrylic();
        if (result && result.ok) {
          micaInfo.value.currentEffect = 'acrylic';
          addMicaLog('✅ 已设置 Acrylic 效果', 'success');
          await getMicaInfo();
        } else {
          addMicaLog(`设置 Acrylic 效果失败: ${result?.error || '未知错误'}`, 'error');
        }
      } catch (e) {
        addMicaLog(`设置 Acrylic 效果失败: ${e.message}`, 'error');
      }
    };
    
    // 设置主题
    const setMicaTheme = async (theme) => {
      if (!window.electronAPI || !window.electronAPI.mica) {
        addMicaLog('Mica Electron API 不可用', 'error');
        return;
      }
      try {
        let result;
        if (theme === 'light') {
          result = await window.electronAPI.mica.setLightTheme();
        } else if (theme === 'dark') {
          result = await window.electronAPI.mica.setDarkTheme();
        } else {
          result = await window.electronAPI.mica.setAutoTheme();
        }
        if (result && result.ok) {
          micaInfo.value.currentTheme = theme;
          addMicaLog(`✅ 已设置主题: ${theme}`, 'success');
          await getMicaInfo();
        } else {
          addMicaLog(`设置主题失败: ${result?.error || '未知错误'}`, 'error');
        }
      } catch (e) {
        addMicaLog(`设置主题失败: ${e.message}`, 'error');
      }
    };
    
    // 设置窗口背景色
    const setBackgroundColor = async (color) => {
      if (!window.electronAPI || !window.electronAPI.mica) {
        addMicaLog('Mica Electron API 不可用', 'error');
        return;
      }
      try {
        const result = await window.electronAPI.mica.setBackgroundColor(color);
        if (result && result.ok) {
          micaInfo.value.backgroundColor = color;
          addMicaLog(`✅ 已设置背景色: ${color}`, 'success');
          await getMicaInfo();
        } else {
          addMicaLog(`设置背景色失败: ${result?.error || '未知错误'}`, 'error');
        }
      } catch (e) {
        addMicaLog(`设置背景色失败: ${e.message}`, 'error');
      }
    };
    
    // 设置圆角
    const setRoundedCorner = async () => {
      if (!window.electronAPI || !window.electronAPI.mica) {
        addMicaLog('Mica Electron API 不可用', 'error');
        return;
      }
      try {
        const result = await window.electronAPI.mica.setRoundedCorner();
        if (result && result.ok) {
          addMicaLog('✅ 已设置窗口圆角', 'success');
        } else {
          addMicaLog(`设置圆角失败: ${result?.error || '未知错误'}`, 'error');
        }
      } catch (e) {
        addMicaLog(`设置圆角失败: ${e.message}`, 'error');
      }
    };
    
    // 清除日志
    const clearMicaLogs = () => {
      micaTestLogs.value = [];
      addMicaLog('日志已清除', 'info');
    };
    
    // 颜色选择器
    const showColorPicker = ref(false);
    const colorPickerInitialColor = ref('#000000');
    
    // 打开颜色选择器
    function openColorPicker() {
      colorPickerInitialColor.value = pidsState.appData.meta.themeColor || '#000000';
      showColorPicker.value = true;
    }
    
    // 确认颜色选择
    function onColorConfirm(color) {
      pidsState.appData.meta.themeColor = color;
      saveCfg();
    }
    
    // 取色功能：打开颜色选择器弹窗
    function pickColor() {
      openColorPicker();
    }
    
    // 兼容旧数据，补齐 serviceMode
    if (!pidsState.appData.meta.serviceMode) pidsState.appData.meta.serviceMode = 'normal';
    // 兼容旧数据，补齐线路名合并开关
    if (pidsState.appData.meta.lineNameMerge === undefined) pidsState.appData.meta.lineNameMerge = false;
    // 初始化贯通线路设置字段
    if (pidsState.appData.meta.throughLineSegments === undefined) {
        if (pidsState.appData.meta.lineALineName && pidsState.appData.meta.lineBLineName) {
            pidsState.appData.meta.throughLineSegments = [
                { lineName: pidsState.appData.meta.lineALineName, throughStationName: '' },
                { lineName: pidsState.appData.meta.lineBLineName, throughStationName: '' }
            ];
        } else {
            pidsState.appData.meta.throughLineSegments = [
                { lineName: '', throughStationName: '' },
                { lineName: '', throughStationName: '' }
            ];
        }
    }
    
    // 贯通线路设置
    const throughLineSegments = ref([]);
    const lineStationsMap = ref({});
    const throughLineDataMap = ref({});
    const lineSelectorTarget = ref(null);
    
    // 初始化throughLineSegments响应式数据
    throughLineSegments.value = [...(pidsState.appData.meta.throughLineSegments || [])];
    
    function changeServiceMode(mode) {
        const meta = pidsState.appData.meta || {};
        meta.serviceMode = mode;
        if (mode === 'direct' && pidsState.appData.stations && pidsState.appData.stations.length > 0) {
            meta.startIdx = 0;
            meta.termIdx = pidsState.appData.stations.length - 1;
        }
        saveCfg();
    }

    /** 环线 / 单线：独立按钮切换 */
    function setLineMode(mode) {
        const meta = pidsState.appData.meta || {};
        if (meta.mode === mode) return;
        meta.mode = mode;
        saveCfg();
    }

    /** 环线：外圈 / 内圈；单线：上行 / 下行 — 独立按钮 */
    function setDirType(dir) {
        const meta = pidsState.appData.meta || {};
        if (meta.dirType === dir) return;
        meta.dirType = dir;
        saveCfg();
    }

    function saveCfg() {
        // 归一化布尔值，避免字符串 "true"/"false" 影响显示端判断
        if (pidsState?.appData?.meta) {
            pidsState.appData.meta.lineNameMerge = !!pidsState.appData.meta.lineNameMerge;
        }
        sync();
    }

    // 运营模式下线路/颜色等变更：自动静默保存到文件，不弹提示
    async function saveCfgAndPersistSilent() {
        saveCfg();
        try {
            await fileIO.saveCurrentLine({ silent: true });
        } catch (e) {
            console.warn('[ConsolePage] 运营模式变更静默保存失败', e);
        }
    }
    
    async function applyShortTurn() {
        const startIdx = pidsState.appData?.meta?.startIdx
        const termIdx = pidsState.appData?.meta?.termIdx
        if (isInvalidShortTurnSelection(startIdx, termIdx)) {
            await showMsg(t('console.invalidRouteRuleRetry'))
            return
        }
        // 一旦用户手动应用短交路，视为“手动设置”，避免被自动短交路逻辑覆盖
        if (pidsState?.appData?.meta) {
            pidsState.appData.meta.autoShortTurn = false;
        }
        saveCfg();
        const startName = pidsState.appData.meta.startIdx >= 0 ? pidsState.appData.stations[pidsState.appData.meta.startIdx].name : '无';
        const termName = pidsState.appData.meta.termIdx >= 0 ? pidsState.appData.stations[pidsState.appData.meta.termIdx].name : '无';
        await showMsg(`短交路设置已应用！\n起点: ${startName}\n终点: ${termName}`);
    }
    
    async function clearShortTurn() {
        if (await askUser('确定要清除短交路设置吗？')) {
            pidsState.appData.meta.startIdx = -1;
            pidsState.appData.meta.termIdx = -1;
            if (pidsState?.appData?.meta) {
                pidsState.appData.meta.autoShortTurn = false;
            }
            saveCfg();
        }
    }

    function unlockAutoShortTurn() {
        if (!pidsState?.appData?.meta) return;
        // 将“自动短交路”切换为“手动短交路”，保留当前 startIdx/termIdx 作为初始值
        pidsState.appData.meta.autoShortTurn = false;
        saveCfg();
    }
    
    // 加载线路的站点列表
    async function loadLineStations(lineName, segmentIndex, folderPath = null) {
        if (!lineName) {
            lineStationsMap.value[segmentIndex] = [];
            throughLineDataMap.value[segmentIndex] = null;
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
            throughLineDataMap.value[segmentIndex] = line;
        } else {
            let loadedStations = null;
            let loadedLineData = null;
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
                                loadedLineData = lineData || null;
                                break;
                            }
                        }
                    }
                } catch (e) {
                    console.warn('[贯通线路] 按文件夹读取线路站点失败:', e);
                }
            }
            lineStationsMap.value[segmentIndex] = loadedStations || [];
            throughLineDataMap.value[segmentIndex] = loadedLineData;
        }
    }
    
    // 自动检测并设置贯通站点
    function autoDetectThroughStations() {
        const meta = pidsState.appData.meta || {};
        const segments = meta.throughLineSegments || [];
        
        // 如果线路段数量不足，静默返回（这是正常状态，不需要日志）
        if (segments.length < 2) {
            return;
        }
        
        const cleanStationName = (name) => {
            if (!name) return '';
            return String(name).replace(/<[^>]+>([^<]*)<\/>/g, '$1').trim();
        };
        
        for (let i = 0; i < segments.length - 1; i++) {
            const currentSegment = segments[i];
            const nextSegment = segments[i + 1];
            
            if (!currentSegment.lineName || !nextSegment.lineName) {
                continue;
            }
            
            const currentStations = lineStationsMap.value[i] || [];
            const nextStations = lineStationsMap.value[i + 1] || [];
            
            if (currentStations.length === 0 || nextStations.length === 0) {
                continue;
            }
            
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
            
            const commonStations = [];
            currentStations.forEach((st, currentIdx) => {
                const cleanName = cleanStationName(st.name);
                if (cleanName && nextNames.has(cleanName)) {
                    const nextIdx = nextStations.findIndex((nextSt) => cleanStationName(nextSt.name) === cleanName);
                    if (nextIdx >= 0) {
                        commonStations.push({
                            name: cleanName,
                            currentIdx: currentIdx,
                            nextIdx: nextIdx
                        });
                    }
                }
            });
            
            if (commonStations.length > 0) {
                if (commonStations.length === 1) {
                    const throughStationName = commonStations[0].name;
                    currentSegment.throughStationName = throughStationName;
                    currentSegment.candidateThroughStations = undefined;
                    console.log(`[贯通站点检测] ✓ 段${i + 1}和段${i + 2}的贯通站点: ${throughStationName}`);
                } else {
                    currentSegment.candidateThroughStations = commonStations.map(s => s.name);
                    if (!currentSegment.throughStationName || !currentSegment.candidateThroughStations.includes(currentSegment.throughStationName)) {
                        currentSegment.throughStationName = commonStations[0].name;
                    }
                    console.log(`[贯通站点检测] ⚠ 段${i + 1}和段${i + 2}找到${commonStations.length}个共同站点`);
                }
            } else {
                currentSegment.throughStationName = '';
                currentSegment.candidateThroughStations = undefined;
            }
        }
        
        if (segments.length > 0) {
            segments[segments.length - 1].throughStationName = '';
            segments[segments.length - 1].candidateThroughStations = undefined;
        }
        
        saveCfg();
    }
    
    // 处理从线路管理器返回的线路选择
    async function handleLineSelectedForThroughOperation(lineName, targetFromIPC, folderPath = null) {
        const meta = pidsState.appData.meta || {};
        const target = (targetFromIPC ?? lineSelectorTarget.value ?? localStorage.getItem('throughOperationSelectorTarget'));
        
        if (!lineName) {
            return;
        }
        
        if (typeof target === 'number' || (typeof target === 'string' && target.startsWith('segment-'))) {
            if (!meta.throughLineSegments) {
                meta.throughLineSegments = [];
            }
            const segmentIndex = typeof target === 'number' ? target : parseInt(target.replace('segment-', ''));
            if (segmentIndex >= 0) {
                while (meta.throughLineSegments.length <= segmentIndex) {
                    meta.throughLineSegments.push({ lineName: '', throughStationName: '' });
                }
                meta.throughLineSegments[segmentIndex].lineName = lineName;
                await loadLineStations(lineName, segmentIndex, folderPath);
            }
        }
        
        // 确保至少保持2个线路段的结构（防止清空后再选择时丢失其他线路）
        while (meta.throughLineSegments.length < 2) {
            meta.throughLineSegments.push({ lineName: '', throughStationName: '' });
        }
        
        throughLineSegments.value = [...(meta.throughLineSegments || [])];
        lineSelectorTarget.value = null;
        localStorage.removeItem('throughOperationSelectorTarget');
        saveCfg();
        await new Promise(resolve => setTimeout(resolve, 200));
        autoDetectThroughStations();
        saveCfg();
        throughLineSegments.value = [...(meta.throughLineSegments || [])];
    }
    
    // 初始化时加载已保存的线路段
    async function initThroughOperationLines() {
        const meta = pidsState.appData.meta || {};
        
        if (!meta.throughLineSegments || meta.throughLineSegments.length === 0) {
            if (meta.lineALineName && meta.lineBLineName) {
                meta.throughLineSegments = [
                    { lineName: meta.lineALineName, throughStationName: '' },
                    { lineName: meta.lineBLineName, throughStationName: '' }
                ];
            } else {
                meta.throughLineSegments = [
                    { lineName: '', throughStationName: '' },
                    { lineName: '', throughStationName: '' }
                ];
            }
        }
        
        while (meta.throughLineSegments.length < 2) {
            meta.throughLineSegments.push({ lineName: '', throughStationName: '' });
        }
        
        throughLineSegments.value = [...(meta.throughLineSegments || [])];
        
        for (let i = 0; i < throughLineSegments.value.length; i++) {
            const segment = throughLineSegments.value[i];
            if (segment.lineName) {
                await loadLineStations(segment.lineName, i);
            }
        }
        
        await new Promise(resolve => setTimeout(resolve, 200));
        autoDetectThroughStations();
        throughLineSegments.value = [...(meta.throughLineSegments || [])];
    }
    
    function addThroughLineSegment() {
        const meta = pidsState.appData.meta || {};
        if (!meta.throughLineSegments) {
            meta.throughLineSegments = [];
        }
        meta.throughLineSegments.push({ lineName: '', throughStationName: '' });
        throughLineSegments.value = meta.throughLineSegments;
        saveCfg();
    }
    
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
        throughLineSegments.value = [...meta.throughLineSegments];
        
        delete lineStationsMap.value[index];
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
        
        await new Promise(resolve => setTimeout(resolve, 100));
        autoDetectThroughStations();
        throughLineSegments.value = [...meta.throughLineSegments];
        saveCfg();
    }
    
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

        const segments = rawSegments.map((segment, index) => ({
            ...(segment || {}),
            __segmentIndex: index,
            lineName: getSegmentLineName(segment),
            throughStationName: getSegmentThroughStationName(segment)
        }));

        // 先同步到 meta，确保数据一致
        meta.throughLineSegments = [...segments];
        throughLineSegments.value = [...segments];
        saveCfg();
        
        // 只处理连续的有线路名称的段（从第一段开始，连续的有线路名称的段）
        const validSegments = [];
        for (let i = 0; i < segments.length; i++) {
            if (segments[i] && segments[i].lineName && segments[i].lineName.trim()) {
                validSegments.push(segments[i]);
            } else {
                // 遇到空段就停止（只处理连续的段）
                break;
            }
        }
        
        if (validSegments.length < 2) {
            await showMsg('至少需要选择2条线路才能进行贯通');
            return;
        }

        const storeList = pidsState.store?.list || [];
        if (!storeList || storeList.length === 0) {
            await showMsg('无法获取线路列表，请刷新线路数据');
            return;
        }

        for (let i = 0; i < validSegments.length - 1; i++) {
            if (!validSegments[i].throughStationName || !validSegments[i].throughStationName.trim()) {
                const detected = detectThroughStationBetweenLines(validSegments[i].lineName, validSegments[i + 1].lineName, storeList);
                if (detected) {
                    validSegments[i].throughStationName = detected;
                }
            }
        }

        meta.throughLineSegments = [...segments];
        throughLineSegments.value = [...segments];
        saveCfg();
        
        // 检查每两段之间的贯通站点
        for (let i = 0; i < validSegments.length - 1; i++) {
            if (!validSegments[i].throughStationName || !validSegments[i].throughStationName.trim()) {
                await showMsg(`第${i + 1}段和第${i + 2}段之间未找到贯通站点`);
                return;
            }
        }
        
        try {
            const effectiveStoreList = Array.isArray(storeList) ? [...storeList] : [];
            for (const seg of validSegments) {
                const segIdx = typeof seg.__segmentIndex === 'number' ? seg.__segmentIndex : -1;
                if (segIdx < 0) continue;
                const cachedLine = throughLineDataMap.value[segIdx];
                if (!cachedLine || !cachedLine.meta || !cachedLine.meta.lineName) continue;
                const exists = findLineByName(seg.lineName, effectiveStoreList);
                if (!exists) {
                    effectiveStoreList.push(cachedLine);
                }
            }

            const mergedData = mergeThroughLines(pidsState.appData, effectiveStoreList, {
                throughLineSegments: validSegments
            });
            
            if (!mergedData || !mergedData.stations || mergedData.stations.length === 0) {
                await showMsg('合并线路失败，请检查线路数据');
                return;
            }
            
            const lineNames = validSegments.map(s => s.lineName).join(' - ');
            const mergedLineName = `${lineNames} (贯通)`;
            mergedData.meta.lineName = mergedLineName;
            mergedData.meta.throughOperationEnabled = true;
            mergedData.meta.throughLineSegments = validSegments;
            
            pidsState.store.list.push(mergedData);
            const newLineIndex = pidsState.store.list.length - 1;
            await nextTick();
            
            pidsState.store.cur = newLineIndex;
            pidsState.appData = pidsState.store.list[newLineIndex];
            pidsState.rt.idx = 0;
            pidsState.rt.state = 0;
            
            // 清除线路名称到文件路径的映射（如果存在）
            const cleanLineName = mergedLineName.replace(/<[^>]+>([^<]*)<\/>/g, '$1').trim();
            if (pidsState.lineNameToFilePath && pidsState.lineNameToFilePath[cleanLineName]) {
                delete pidsState.lineNameToFilePath[cleanLineName];
            }
            
            // 清除线路管理器选择目标（避免影响后续线路切换）
            lineSelectorTarget.value = null;
            localStorage.removeItem('throughOperationSelectorTarget');
            
            // 创建一个纯 JSON 可序列化的对象（移除不可序列化的内容，如函数、循环引用等）
            let serializableData;
            try {
                serializableData = JSON.parse(JSON.stringify(mergedData));
            } catch (e) {
                console.error('[贯通线路] 序列化失败:', e);
                await showMsg('序列化线路数据失败: ' + (e.message || e), '错误');
                // 回滚
                pidsState.store.list.pop();
                if (pidsState.store.cur >= pidsState.store.list.length) {
                    pidsState.store.cur = Math.max(0, pidsState.store.list.length - 1);
                }
                if (pidsState.store.list.length > 0) {
                    pidsState.appData = pidsState.store.list[pidsState.store.cur];
                }
                return;
            }

            // 收集贯通来源线路路径（用于另存时补齐音频来源）
            const sourcePathSet = new Set();
            const linePathMap = pidsState.lineNameToFilePath || {};
            const cleanName = (name) => (name && String(name).replace(/<[^>]+>([^<]*)<\/>/g, '$1').trim()) || '';
            for (const seg of validSegments) {
                const rawName = seg && seg.lineName ? String(seg.lineName) : '';
                const pureName = cleanName(rawName);
                const p = linePathMap[rawName] || linePathMap[pureName] || seg?.filePath || seg?.lineFilePath || null;
                if (p && String(p).trim()) sourcePathSet.add(String(p).trim());
            }
            if (pidsState.currentFilePath && String(pidsState.currentFilePath).trim()) {
                sourcePathSet.add(String(pidsState.currentFilePath).trim());
            }
            const sourceLinePaths = Array.from(sourcePathSet);
            
            // 将贯通线路数据存储到 localStorage，供线路管理器读取
            localStorage.setItem('pendingThroughLineData', JSON.stringify({
                lineData: serializableData,
                lineName: mergedLineName,
                cleanLineName: cleanLineName,
                validSegments: validSegments,
                sourceLinePaths
            }));
            
            // 设置保存模式标记（必须在打开窗口之前设置）
            localStorage.setItem('throughOperationSelectorTarget', 'save-through-line');
            
            // 打开线路管理器窗口，让用户选择保存位置
            if (window.electronAPI && window.electronAPI.openLineManager) {
                await window.electronAPI.openLineManager('save-through-line');
            } else {
                await openLineManagerWindow();
            }
            
            // 监听保存完成事件
            const checkSaveResult = setInterval(async () => {
                const saveResult = localStorage.getItem('throughLineSaveResult');
                if (saveResult) {
                    clearInterval(checkSaveResult);
                    localStorage.removeItem('throughLineSaveResult');
                    localStorage.removeItem('pendingThroughLineData');
                    
                    const result = JSON.parse(saveResult);
                    if (result.success) {
                        // 保存成功，更新状态
                        pidsState.currentFolderId = result.folderId;
                        pidsState.currentFilePath = result.filePath;
                        
                        // 刷新线路列表（从保存的文件夹）
                        if (result.folderPath) {
                            const prevAppData = pidsState.appData;
                            const prevStoreCur = pidsState.store?.cur;
                            await fileIO.refreshLinesFromFolder(true, result.folderPath);
                            if (!pidsState.appData && prevAppData) {
                                pidsState.appData = prevAppData;
                                if (pidsState.store && typeof prevStoreCur === 'number') {
                                    pidsState.store.cur = prevStoreCur;
                                }
                            }
                        }
                        
                        // 获取文件夹名称用于显示
                        const folderName = pidsState.folders.find(f => f.id === result.folderId)?.name || result.folderId;
                        const folderInfo = `\n保存位置: ${folderName}`;
                        
                        saveCfg();
                        sync();
                        
                        const throughStations = validSegments.slice(0, -1).map(s => s.throughStationName).filter(s => s).join('、');
                        
                        // 等待线路管理器窗口完全关闭后再显示通知（确保通知在线路管理器保存完成后弹出）
                        await new Promise(resolve => setTimeout(resolve, 500));
                        
                        // 使用系统通知显示成功消息
                        const { showNotification } = await import('../utils/notificationService.js');
                        const notificationMessage = `贯通线路已创建并保存！\n线路名称: ${mergedLineName}\n线路段数: ${validSegments.length}\n贯通站点: ${throughStations || '无'}\n合并后站点数: ${mergedData.stations.length}${folderInfo}\n\n已自动切换到新创建的贯通线路`;
                        showNotification('贯通线路保存成功', notificationMessage);
                    } else {
                        // 保存失败或被取消，回滚
                        pidsState.store.list.pop();
                        if (pidsState.store.cur >= pidsState.store.list.length) {
                            pidsState.store.cur = Math.max(0, pidsState.store.list.length - 1);
                        }
                        if (pidsState.store.list.length > 0) {
                            pidsState.appData = pidsState.store.list[pidsState.store.cur];
                        }
                        if (result.error && result.error !== 'cancelled') {
                            await showMsg('保存贯通线路失败: ' + result.error, '错误');
                        } else {
                            await showMsg('已取消创建贯通线路', '提示');
                        }
                    }
                }
            }, 500);
            
            // 30秒后清除监听（防止内存泄漏）
            setTimeout(() => {
                clearInterval(checkSaveResult);
            }, 30000);
        } catch (error) {
            console.error('[贯通线路] 合并失败:', error);
            await showMsg('合并线路时发生错误: ' + (error.message || error));
        }
    }
    
    async function clearThroughOperation() {
        if (await askUser('确定要清除贯通线路设置吗？\n注意：这将清除贯通线路配置，但不会删除已创建的贯通线路。')) {
            try {
                const meta = pidsState.appData.meta || {};
                // 清除旧的贯通线路字段
                meta.lineALineName = '';
                meta.lineBLineName = '';
                meta.throughStationIdx = -1;
                meta.throughOperationEnabled = false;
                // 清除新的贯通线路段配置并重置为2个空元素（保持结构，防止后续选择时丢失）
                meta.throughLineSegments = [
                    { lineName: '', throughStationName: '' },
                    { lineName: '', throughStationName: '' }
                ];
                // 清除自定义颜色范围（贯通线路特有）
                delete meta.customColorRanges;
                // 重置响应式数据
                throughLineSegments.value = [
                    { lineName: '', throughStationName: '' },
                    { lineName: '', throughStationName: '' }
                ];
                // 清除线路管理器选择目标（避免影响正常切换线路）
                lineSelectorTarget.value = null;
                localStorage.removeItem('throughOperationSelectorTarget');
                // 同步状态到store
                if (pidsState.store && pidsState.store.list && pidsState.store.cur >= 0) {
                    pidsState.store.list[pidsState.store.cur] = pidsState.appData;
                }
                saveCfg();
                sync();
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
        // 使用时间戳+随机数+预设名的组合生成唯一ID
        const timestamp = Date.now().toString(36);
        const randomPart = Math.random().toString(36).substring(2, 10);
        // 简单的哈希函数
        const hash = (str) => {
          let h = 0;
          for (let i = 0; i < str.length; i++) {
            h = ((h << 5) - h) + str.charCodeAt(i);
            h = h & h; // Convert to 32bit integer
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
        if (isInvalidShortTurnSelection(startIdx, termIdx)) {
            await showMsg(t('console.invalidRouteRuleRetry'));
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
                    message: t('console.presetSavedSuccess'),
                    description: t('console.presetSavedNotifyDesc'),
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
                if (isInvalidShortTurnSelection(startIdxResolved, termIdxResolved)) {
                    await showMsg(t('console.invalidRouteRuleRetry'));
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
                    message: t('console.presetDeletedSuccess'),
                    description: t('console.presetDeletedNotifyDesc'),
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
                const vp = getEffectiveViewportRect(event && event.target ? event.target : menuElement)
                const viewportWidth = (vp.right - vp.left) || window.innerWidth
                const viewportHeight = (vp.bottom - vp.top) || window.innerHeight
                
                let x = event.clientX;
                let y = event.clientY;
                
                // 如果菜单会在右侧被截断，调整到左侧
                if (((x - (vp.left || 0)) + rect.width) > viewportWidth) {
                    x = event.clientX - rect.width;
                }
                
                // 如果菜单会在底部被截断，调整到上方
                if (((y - (vp.top || 0)) + rect.height) > viewportHeight) {
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
                shareId: shareId,  // 分享ID
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
            
            // 使用 Base64 编码生成分享码
            const shareCodeBase64 = stringToBase64(JSON.stringify(shareData));
            const shareCode = t('console.shareCodePrefix') + '\n' + shareCodeBase64;
            
            // 使用自定义分享码对话框显示
            if (window.__ui && window.__ui.dialog && window.__ui.dialog.shareCode) {
                await window.__ui.dialog.shareCode(shareCode, shareId, t('console.presetShareOfflineTitle'));
            } else {
                // 降级方案：显示分享码供手动复制
                const msg = `${t('console.presetShareCode')}:\n\n${shareCode}\n\n${t('console.presetShareId')}: ${shareId}\n${t('console.shareCodeLength')}: ${shareCode.length} ${t('console.shareCodeChars')}`;
                await showMsg(msg, t('console.presetShareOfflineTitle'));
            }
        } catch (e) {
            console.error('生成分享码错误:', e);
            await showMsg(t('console.presetShareError') + ': ' + e.message, t('console.error'));
        }
    }

    // 从分享码导入预设（离线导入）
    async function importPresetFromShareCode() {
        // 打开弹窗前先关闭右键菜单
        closePresetContextMenu();

        // 仅在 Electron 环境下可用
        if (!window.electronAPI || !window.electronAPI.shortturns) {
            await showMsg(t('console.electronOnlyError'), t('console.info'));
            return;
        }

        try {
            const inputCode = await promptUser(t('console.presetShareCodePrompt'), '', t('console.presetShareCode'));
            if (!inputCode || !inputCode.trim()) {
                return;
            }
            
            // 过滤前缀 "Metro-PIDS短交路分享码"
            let shareCode = inputCode.trim();
            const prefix = t('console.shareCodePrefix');
            if (shareCode.startsWith(prefix)) {
                shareCode = shareCode.substring(prefix.length).trim();
            }

            // 解码并解析分享数据
            const jsonText = base64ToString(shareCode);
            if (!jsonText) {
                await showMsg(t('console.shareCodeInvalid'), t('console.error'));
                return;
            }

            let shareData;
            try {
                shareData = JSON.parse(jsonText);
            } catch (e) {
                console.error('解析分享码 JSON 失败:', e);
                await showMsg(t('console.shareCodeJsonError'), t('console.error'));
                return;
            }

            if (!shareData || shareData.type !== 'preset-share' || !shareData.data) {
                await showMsg(t('console.shareCodeTypeMismatch'), t('console.error'));
                return;
            }

            // 验证站点匹配（改为基于站点验证，而非线路名称）
            const presetDataFromShare = shareData.data || {};
            const currentStations = pidsState.appData?.stations || [];
            const startStationName = presetDataFromShare.startStationName || '';
            const termStationName = presetDataFromShare.termStationName || '';
            
            // 检查起点站和终点站是否都存在于当前线路中
            const hasStartStation = currentStations.some(s => s.name === startStationName);
            const hasTermStation = currentStations.some(s => s.name === termStationName);
            
            if (!hasStartStation || !hasTermStation) {
                const missingStations = [];
                if (!hasStartStation) missingStations.push(startStationName);
                if (!hasTermStation) missingStations.push(termStationName);
                
                await showMsg(
                    `${t('console.stationNotFound')}${missingStations.join('、')}。\n\n${t('console.stationNotFoundDetail')}`,
                    t('console.stationMismatch')
                );
                return;
            }

            // 默认名称：优先使用分享内的预设名，其次用“起点→终点”
            const defaultName =
                shareData.presetName ||
                `${presetDataFromShare.startStationName || '起点'}→${presetDataFromShare.termStationName || '终点'}`;

            const nameInput = await promptUser(
                t('console.presetImportNamePrompt'),
                defaultName,
                t('console.presetImportTitle')
            );
            const finalName = (nameInput && nameInput.trim()) || defaultName;
            if (!finalName) return;

            // 根据站点名称重新计算索引（因为不同线路的站点索引可能不同）
            const currentStationsArray = pidsState.appData?.stations || [];
            const newStartIdx = currentStationsArray.findIndex(s => s.name === startStationName);
            const newTermIdx = currentStationsArray.findIndex(s => s.name === termStationName);
            
            if (newStartIdx === -1 || newTermIdx === -1) {
                await showMsg('无法在当前线路中定位站点索引，导入失败', '错误');
                return;
            }

            // 组装要保存的预设数据（使用当前线路名称和重新计算的索引）
            const presetToSave = {
                lineName: pidsState.appData?.meta?.lineName || '',  // 使用当前线路名称
                startIdx: newStartIdx,  // 重新计算的起点索引
                termIdx: newTermIdx,    // 重新计算的终点索引
                startStationName: startStationName,
                termStationName: termStationName,
                createdAt: presetDataFromShare.createdAt || new Date().toISOString(),
                // 记录分享元数据，方便将来调试或展示
                shareId: shareData.shareId || '',
                shareLineName: shareData.lineName || '',  // 记录原始分享线路名
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
    
    // 切换线路
    function switchLine(idx) {
        if (idx < 0 || idx >= pidsState.store.list.length) return;
        pidsState.store.cur = idx;
        pidsState.appData = pidsState.store.list[idx];
        pidsState.rt.idx = 0;
        pidsState.rt.state = 0;
        // 更新当前文件的路径信息
        if (pidsState.appData && pidsState.appData.meta && pidsState.appData.meta.lineName) {
            const filePath = pidsState.lineNameToFilePath[pidsState.appData.meta.lineName];
            if (filePath) {
                pidsState.currentFilePath = filePath;
            } else {
                pidsState.currentFilePath = null; // 如果没有找到路径，清空
            }
        } else {
            pidsState.currentFilePath = null;
        }
        saveCfg();
        sync();
    }
    
    // 通过线路名称切换线路（folderPath 可选，来自线路管理器时传入，确保从正确目录刷新以得到正确的 currentFilePath）
    async function switchLineByName(lineName, folderPath = null) {
        console.log('[ConsolePage] switchLineByName 被调用, lineName:', lineName, 'folderPath:', folderPath);
        await fileIO.refreshLinesFromFolder(true, folderPath);
        
        // 查找线路（移除颜色标记后比较）
        const cleanName = (name) => {
            if (!name) return '';
            return String(name).replace(/<[^>]+>([^<]*)<\/>/g, '$1');
        };
        const cleanRequestName = cleanName(lineName);
        
        let idx = pidsState.store.list.findIndex(l => {
            if (!l.meta || !l.meta.lineName) return false;
            const cleanLineName = cleanName(l.meta.lineName);
            return cleanLineName === cleanRequestName || l.meta.lineName === lineName;
        });
        
        console.log('[ConsolePage] switchLineByName 查找结果, idx:', idx, '线路列表长度:', pidsState.store.list.length);
        if (idx >= 0) {
            switchLine(idx);
            console.log('[ConsolePage] switchLineByName 切换成功, 切换到索引:', idx);
            return;
        }
        
        console.warn('[ConsolePage] switchLineByName 在当前文件夹未找到线路:', lineName, '，尝试在其他文件夹中查找');
        
        // -------------------------
        // 兜底方案：在所有线路文件夹中查找该线路
        // 解决“线路文件不在当前文件夹里就无法切换”的问题
        // -------------------------
        if (!(window.electronAPI && window.electronAPI.lines && window.electronAPI.lines.folders)) {
            console.warn('[ConsolePage] Electron 文件夹 API 不可用，无法在其他文件夹中查找线路');
            return;
        }
        
        try {
            const foldersRes = await window.electronAPI.lines.folders.list();
            if (!(foldersRes && foldersRes.ok && Array.isArray(foldersRes.folders))) {
                console.warn('[ConsolePage] 获取线路文件夹列表失败或为空:', foldersRes);
                return;
            }
            
            const folders = foldersRes.folders;
            let foundFolderId = null;
            let foundFolderPath = null;
            
            for (const folder of folders) {
                if (!folder || !folder.path || !folder.id) continue;
                
                try {
                    const items = await window.electronAPI.lines.list(folder.path);
                    if (!Array.isArray(items) || items.length === 0) continue;
                    
                    for (const it of items) {
                        try {
                            const res = await window.electronAPI.lines.read(it.name, folder.path);
                            if (!(res && res.ok && res.content)) continue;
                            
                            const d = res.content;
                            if (!d || !d.meta || !d.meta.lineName) continue;
                            
                            const cleanLineName = cleanName(d.meta.lineName);
                            if (cleanLineName === cleanRequestName || d.meta.lineName === lineName) {
                                foundFolderId = folder.id;
                                foundFolderPath = folder.path;
                                console.log('[ConsolePage] 在其他文件夹中找到了匹配线路:', d.meta.lineName, 'folderId:', folder.id, 'path:', folder.path);
                            }
                        } catch (e) {
                            console.warn('[ConsolePage] 读取线路文件失败', it && it.name, e);
                        }
                        
                        if (foundFolderId) break;
                    }
                } catch (e) {
                    console.warn('[ConsolePage] 列出文件夹内线路失败，folder.path =', folder.path, e);
                }
                
                if (foundFolderId) break;
            }
            
            if (!foundFolderId || !foundFolderPath) {
                console.warn('[ConsolePage] 在所有文件夹中都没有找到线路:', lineName);
                return;
            }
            
            // 找到了所在文件夹：更新当前文件夹ID，然后刷新线路列表
            // 更新全局的 currentFolderId，确保后续保存时使用正确的文件夹
            if (foundFolderId) {
                pidsState.currentFolderId = foundFolderId;
            }
            // 直接从该物理路径刷新线路列表，然后再用原有逻辑切换
            // 不再依赖主进程的"当前文件夹"配置，避免出现"文件夹不存在"等问题
            await fileIO.refreshLinesFromFolder(true, foundFolderPath);
            idx = pidsState.store.list.findIndex(l => {
                if (!l.meta || !l.meta.lineName) return false;
                const cleanLineName = cleanName(l.meta.lineName);
                return cleanLineName === cleanRequestName || l.meta.lineName === lineName;
            });
            
            console.log('[ConsolePage] switchLineByName 兜底查找结果, idx:', idx, '线路列表长度:', pidsState.store.list.length);
            if (idx >= 0) {
                switchLine(idx);
                console.log('[ConsolePage] switchLineByName 兜底切换成功, 切换到索引:', idx);
        } else {
                console.warn('[ConsolePage] 即使在找到的文件夹中刷新后仍未找到线路:', lineName);
            }
        } catch (e) {
            console.warn('[ConsolePage] 在所有文件夹中查找线路时发生异常:', e);
        }
    }
    
    // 处理线路切换请求
    async function handleSwitchLineRequest(lineName, target, folderPath = null) {
        console.log('[ConsolePage] handleSwitchLineRequest 被调用, lineName:', lineName, 'target:', target, 'folderPath:', folderPath);
        const throughTarget = (target ?? lineSelectorTarget.value ?? localStorage.getItem('throughOperationSelectorTarget'));
        
        const isThroughOperation = throughTarget === 'lineA' || 
                       throughTarget === 'lineB' || 
                       (typeof throughTarget === 'number') ||
                       (typeof throughTarget === 'string' && throughTarget.startsWith('segment-'));
        
        if (isThroughOperation) {
            await handleLineSelectedForThroughOperation(lineName, throughTarget, folderPath);
            return;
        } else {
            await switchLineByName(lineName, folderPath);
        }
    }
    
    // 监听来自线路管理器的线路切换请求
    onMounted(async () => {
        if (typeof document !== 'undefined') {
            document.addEventListener('pointerdown', handleShortTurnDropdownOutsideClick, true)
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
        // 初始化 Mica 信息
        if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.mica) {
            await getMicaInfo();
            addMicaLog('Mica Electron 测试模块已加载', 'info');
        } else {
            addMicaLog('Mica Electron API 不可用（可能不在 Electron 环境）', 'warning');
        }
        
        // 初始化录制监听
        if (hasElectronAPI.value && window.electronAPI?.recording) {
            loadAvailableEncoders();
            recordingProgressUnsubscribe = window.electronAPI.recording.onRecordingProgress((progress) => {
                if (progress) {
                    // 主进程负责 elapsed，并在录制异常/停止时下发 isRecording=false + error
                    if (progress.mode === 'parallel') {
                        // 并行模式：主进程直接给 overall progress/duration
                        if (typeof progress.duration === 'number' && progress.duration > 0) {
                            recordingState.value.totalDuration = progress.duration;
                        }
                        if (typeof progress.progress === 'number' && recordingState.value.totalDuration > 0) {
                            // 用 progress 反推 elapsed，复用现有“剩余时间/进度条”展示
                            recordingState.value.elapsed = (recordingState.value.totalDuration * progress.progress) / 100;
                        } else if (typeof progress.elapsed === 'number') {
                            recordingState.value.elapsed = progress.elapsed;
                        }
                        if (progress.stage) recordingState.value.parallelStage = String(progress.stage);
                        if (Array.isArray(progress.segments)) {
                            const done = progress.segments.filter(s => s.status === 'done').length;
                            const err = progress.segments.filter(s => s.status === 'error').length;
                            recordingState.value.segmentSummary = { done, err, total: progress.segments.length };
                        }
                    } else {
                        if (typeof progress.elapsed === 'number') {
                            recordingState.value.elapsed = progress.elapsed;
                        }
                    }
                    if (progress.isRecording === false) {
                        // 主进程已停止（可能是完成、用户停止或异常），本地立刻退出录制态并清理计时器
                        recordingState.value.isRecording = false;
                        recordingState.value.progress = 0;
                        recordingState.value.nextIn = 0;
                        recordingState.value.totalSteps = 0;
                        recordingState.value.totalDuration = 0;
                        recordingState.value.parallelStage = '';
                        recordingState.value.segmentSummary = null;
                        try { if (recordingStepTimer) clearInterval(recordingStepTimer); } catch (e) {}
                        recordingStepTimer = null;

                        // 并行录制完成时，补一条“录制已停止”的系统通知
                        if (progress.mode === 'parallel' && progress.completed && !progress.error) {
                            showNotification('录制已停止', t('console.recordingStopped'), {
                                tag: 'recording-stopped',
                                urgency: 'normal'
                            });
                        }

                        if (progress.error) {
                            try { void showMsg(t('console.recordingError') + ': ' + String(progress.error)); } catch (e) {}
                        }
                    }
                }
            });
        }
        
        if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.onSwitchLineRequest) {
            try {
                window.electronAPI.onSwitchLineRequest(async (lineName, target, folderPath) => {
                    await handleSwitchLineRequest(lineName, target, folderPath);
                });
            } catch (e) {
                console.warn('无法设置线路切换监听:', e);
            }
        }
        
        if (typeof window !== 'undefined' && (!window.electronAPI || !window.electronAPI.onSwitchLineRequest)) {
            const messageHandler = async (event) => {
                if (event.data && event.data.type === 'switch-line-request') {
                    const { lineName, target, folderPath } = event.data;
                    await handleSwitchLineRequest(lineName, target, folderPath);
                }
            };
            window.addEventListener('message', messageHandler);
            
            const storageHandler = async (event) => {
                if (event.key === 'lineManagerSelectedLine' && event.newValue) {
                    const lineName = event.newValue;
                    const target = localStorage.getItem('lineManagerSelectedTarget');
                    await handleSwitchLineRequest(lineName, target);
                    localStorage.removeItem('lineManagerSelectedLine');
                    localStorage.removeItem('lineManagerSelectedTarget');
                }
            };
            window.addEventListener('storage', storageHandler);
            
            const checkInterval = setInterval(() => {
                const lineName = localStorage.getItem('lineManagerSelectedLine');
                if (lineName) {
                    const target = localStorage.getItem('lineManagerSelectedTarget');
                    handleSwitchLineRequest(lineName, target);
                    localStorage.removeItem('lineManagerSelectedLine');
                    localStorage.removeItem('lineManagerSelectedTarget');
                }
            }, 500);
        }
        
        try {
            await fileIO.initDefaultLines();
        } catch (e) {
            console.warn('初始化预设线路失败:', e);
        }
        
        initThroughOperationLines();
    });
    
    // 组件卸载时清理录制监听
    onBeforeUnmount(() => {
        if (typeof document !== 'undefined') {
            document.removeEventListener('pointerdown', handleShortTurnDropdownOutsideClick, true)
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
        if (recordingProgressUnsubscribe) {
            recordingProgressUnsubscribe();
            recordingProgressUnsubscribe = null;
        }
        stopLineManagerSaveWatcher();
    });
    
    // 监听线路切换，自动加载预设列表
    watch(() => pidsState.appData?.meta?.lineName, async () => {
        if (window.electronAPI && window.electronAPI.shortturns) {
            await loadShortTurnPresets();
        }
    }, { immediate: true });

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

    watch(
        () => settings.vehicleAudioEnabled,
        async (enabled) => {
            if (!recordingState.value.isRecording) return;
            const allow = enabled !== false;
            try {
                if (typeof window !== 'undefined') {
                    window.__disableStationAudioDuringRecording = !allow;
                    window.__recordingAudioCaptureEnabled = !!allow;
                    if (allow && (!window.__recordingAudioStartAt || Number(window.__recordingAudioStartAt) <= 0)) {
                        window.__recordingAudioStartAt = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
                    }
                }
            } catch (e) {}
            if (!allow) {
                try {
                    if (typeof window !== 'undefined' && typeof window.__stopStationAudio === 'function') {
                        await window.__stopStationAudio();
                    }
                } catch (e) {}
            }
        }
    )

    const autoplay = useAutoplay(controllerNextWithAudio, shouldStop)
    const { isPlaying, isPaused, nextIn, start, stop, togglePause } = autoplay

    function normalizeAutoplayIntervalSec(raw) {
        const n = Number(raw)
        if (!Number.isFinite(n)) return 8
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
        if (isPlaying.value) {
            try { start(safe) } catch (e) {}
        }
    }

    // 开启自动播放时确保当前选中的显示器已打开
    async function ensureDisplayOpen() {
        try {
            if (typeof window === 'undefined' || !window.electronAPI) return;
            const disp = settings.display;
            if (!disp || !disp.displays) return;
            const displayId = disp.currentDisplayId || 'display-1';
            const displayConfig = disp.displays[displayId] || disp.displays['display-1'] || disp.displays[Object.keys(disp.displays)[0]];
            if (!displayConfig) return;
            const w = displayConfig.width ? Number(displayConfig.width) : 1900;
            const h = displayConfig.height ? Number(displayConfig.height) : 600;
            const id = displayConfig.id || displayId;
            if (typeof window.electronAPI.openDisplay === 'function') {
                await window.electronAPI.openDisplay(w, h, id);
                return true;
            }
            if (typeof window.electronAPI.switchDisplay === 'function') {
                await window.electronAPI.switchDisplay(id, w, h);
                return true;
            }
        } catch (e) {}
        return false;
    }

    // 自动播放控制函数（与 SlidePanel 一致：确认弹窗 + 锁定弹窗 + 自动打开当前显示器）
    async function startWithLock(interval = null) {
        if (uiState.autoLocked) return;
        const ok = await askUser(t('console.autoplayLockConfirm'));
        if (!ok) return;
        uiState.autoLocked = true;
        uiState.autoplayTogglePause = togglePause;
        uiState.autoplayIsPausedRef = isPaused;
        try {
            await ensureDisplayOpen();
            try { sync(); } catch (e) {}
            const safe = normalizeAutoplayIntervalSec(interval ?? getAutoplayIntervalSec());
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

    function stopWithUnlock() {
        try { stop(); } catch (e) {}
        uiState.autoLocked = false;
        uiState.autoplayTogglePause = null;
        uiState.autoplayIsPausedRef = null;
        showNotification(t('console.autoplayStoppedTitle'), t('console.autoplayStoppedMsg'), {
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

    // 打开线路管理器窗口
    function openLineManagerWindow() {
        if (window.electronAPI && window.electronAPI.openLineManager) {
            window.electronAPI.openLineManager();
        } else {
            // 如果没有 Electron API，可以打开一个新窗口或显示提示
            alert('线路管理器功能需要 Electron 环境');
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
                    const folderLabel = result.folderName || result.folderId || '';
                    const targetLabel = folderLabel ? ` -> ${folderLabel}` : '';
                    const modeLabel = mode === 'zip' ? '保存为压缩包' : '保存当前线路';
                    showNotification(t('console.saveSuccessTitle'), t('console.saveSuccessMsg', {
                        mode: mode === 'zip' ? t('console.saveAsZip') : t('console.saveCurrentLine'),
                        lineName: payload.lineName || cleanName,
                        folder: folderLabel ? ` -> ${folderLabel}` : ''
                    }));
                } catch (e) {}
            } else {
                const errMsg = (result && result.error) ? String(result.error) : t('console.saveUnknownError');
                const isCancelled = !!(result && result.cancelled) || errMsg === 'window-closed' || errMsg === 'cancelled';
                if (isCancelled) {
                    await showMsg(t('console.saveCancelled'), t('console.saveHint'));
                } else {
                    await showMsg(t('console.saveFail', { err: errMsg }), t('console.saveError'));
                }
            }
        }, 400);
    }

    async function openLineManagerForSave(mode = 'line') {
        const cur = pidsState.appData;
        const lineName = cur && cur.meta ? (cur.meta.lineName || '') : '';
        if (!cur || !cur.meta || !lineName) {
            await showMsg(t('console.saveInvalid'), t('console.saveError'));
            return;
        }

        let serializable;
        try {
            serializable = JSON.parse(JSON.stringify(cur));
        } catch (e) {
            await showMsg(t('console.saveSerializeFail'), t('console.saveError'));
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
            openLineManagerWindow();
        }

        startLineManagerSaveWatcher(requestId, payload, mode);
    }

    // ========== 视频录制相关 ==========
    const recordingState = ref({
        isRecording: false,
        mode: 'single',      // single | parallel
        encoder: 'cpu',
        codec: 'h264',
        container: 'mp4',   // 输出封装格式
        bitrate: 8,          // Mbps
        fps: 30,
        intervalSec: 8,      // 像自动播放一样：多少秒后“下一步”
        parallelEnabled: false,
        parallelism: 2,
        stepsPerSegment: 20,
        progress: 0,         // 保留字段（单次间隔进度），整体进度由 elapsed/totalDuration 计算
        elapsed: 0,          // 已录制秒数（来自主进程）
        nextIn: 0,           // 距离下一步还有多少秒（用于“多少秒后下一步”展示）
        totalSteps: 0,       // 本次录制预计总步数（首末站之间的“下一步”次数）
        totalDuration: 0,    // 本次录制预计总时长（秒），= totalSteps * intervalSec
        parallelStage: '',
        segmentSummary: null,
        availableEncoders: { cpu: [], gpu: [] },
        hardware: { cpuModel: '', gpuModel: '' }
    });

    let recordingStepTimer = null;

    // 录制整体进度
    // 并行模式：按主进程给的 elapsed/totalDuration 显示
    // 单线程模式：时间进度不允许超过线路实际进度，避免“尚未到终点，进度已 100%”
    const recordingProgressPercent = computed(() => {
        if (!recordingState.value.isRecording) return 0;
        const total = Number(recordingState.value.totalDuration) || 0;
        if (!total || total <= 0) return 0;
        const elapsed = Math.max(0, Number(recordingState.value.elapsed) || 0);
        const timeBased = Math.min(100, Math.max(0, (elapsed / total) * 100));

        // 并行模式直接使用时间进度
        if (recordingState.value.mode === 'parallel') {
            return timeBased;
        }

        // 单线程模式：结合当前 rt.idx/rt.state 与首末站，计算一个“线路进度”作为上限
        try {
            const meta = (pidsState.appData && pidsState.appData.meta) ? pidsState.appData.meta : {};
            const stations = (pidsState.appData && Array.isArray(pidsState.appData.stations))
                ? pidsState.appData.stations
                : [];
            if (!stations.length) return timeBased;

            const sIdx = (meta.startIdx !== undefined && meta.startIdx !== -1)
                ? parseInt(meta.startIdx)
                : 0;
            const eIdx = (meta.termIdx !== undefined && meta.termIdx !== -1)
                ? parseInt(meta.termIdx)
                : (stations.length - 1);
            const minIdx = Math.min(sIdx, eIdx);
            const maxIdx = Math.max(sIdx, eIdx);
            const stationCount = Math.max(1, maxIdx - minIdx + 1);
            const totalSteps = Math.max(1, 2 * (stationCount - 1));

            const stepDir = (typeof getStep === 'function' ? getStep() : 1) > 0 ? 1 : -1;
            const rtIdx = (pidsState.rt && typeof pidsState.rt.idx === 'number') ? pidsState.rt.idx : sIdx;
            const rtState = (pidsState.rt && typeof pidsState.rt.state === 'number') ? pidsState.rt.state : 0;

            const clampedIdx = Math.max(minIdx, Math.min(maxIdx, rtIdx));
            const stationOffset = stepDir > 0
                ? (clampedIdx - minIdx)
                : (maxIdx - clampedIdx);
            const stepFromStart = Math.max(0, stationOffset * 2 + (rtState === 1 ? 1 : 0));

            const routePercent = Math.min(100, Math.max(0, (stepFromStart / totalSteps) * 100));

            // 不让时间进度超过线路进度，确保只有达到终点时才出现 100%
            return Math.min(timeBased, routePercent);
        } catch (e) {
            console.warn('recordingProgressPercent route-based calc failed:', e);
            return timeBased;
        }
    });

    function formatRecordingTime(sec) {
        const s = Math.max(0, Math.round(Number(sec) || 0));
        const mm = String(Math.floor(s / 60)).padStart(2, '0');
        const ss = String(s % 60).padStart(2, '0');
        return `${mm}:${ss}`;
    }

    const parallelStageLabel = computed(() => {
        const stage = recordingState.value.parallelStage;
        if (!stage) return '';
        const map = {
            'segments-start': t('console.recordingStageSegmentsStart'),
            'segments-running': t('console.recordingStageSegmentsRunning'),
            'segments-done': t('console.recordingStageSegmentsDone'),
            'concat-start': t('console.recordingStageConcatStart')
        };
        return map[stage] || stage;
    });

    const recordingRemainingTimeText = computed(() => {
        if (!recordingState.value.isRecording) return '00:00';
        const total = Number(recordingState.value.totalDuration) || 0;
        if (!total || total <= 0) return '00:00';
        const elapsed = Math.max(0, Number(recordingState.value.elapsed) || 0);
        const remain = Math.max(0, total - elapsed);
        return formatRecordingTime(remain);
    });

    // 当前录制对应的“当前站 + 进/出站状态”
    const recordingCurrentStationName = computed(() => {
        const stations = (pidsState.appData && Array.isArray(pidsState.appData.stations))
            ? pidsState.appData.stations
            : [];
        const idx = (pidsState.rt && typeof pidsState.rt.idx === 'number') ? pidsState.rt.idx : 0;
        if (!stations.length || idx < 0 || idx >= stations.length) return '-';
        return stations[idx]?.name || '-';
    });

    const recordingArrDepLabel = computed(() => {
        const rtState = pidsState.rt && (typeof pidsState.rt.state === 'number') ? pidsState.rt.state : 0;
        return rtState === 0 ? t('consoleButtons.arrive') : t('consoleButtons.depart');
    });

    // 当前录制所用显示端：沿用设置页的 currentDisplayId
    const currentRecordingDisplay = computed(() => {
        if (!settings.display) return null;
        const displays = settings.display.displays && Object.keys(settings.display.displays).length
            ? { ...DEFAULT_SETTINGS.display.displays, ...settings.display.displays }
            : DEFAULT_SETTINGS.display.displays || {};
        const id = settings.display.currentDisplayId || 'display-1';
        const d = displays[id];
        if (!d) return null;
        return { id, name: d.name || id };
    });

    // 获取可用编码器
    async function loadAvailableEncoders() {
        if (!hasElectronAPI.value || !window.electronAPI?.recording) return;
        try {
            const result = await window.electronAPI.recording.getAvailableEncoders();
            if (result && result.ok) {
                if (result.encoders) {
                    recordingState.value.availableEncoders = result.encoders;
                }
                if (result.hardware) {
                    recordingState.value.hardware = {
                        cpuModel: result.hardware.cpuModel || '',
                        gpuModel: result.hardware.gpuModel || ''
                    };
                }
            }
        } catch (e) {
            console.error('加载可用编码器失败:', e);
        }
    }

    // 开始录制
    async function startRecording() {
        if (!hasElectronAPI.value || !window.electronAPI?.recording) {
            await showMsg('录制功能需要 Electron 环境');
            return;
        }
        if (recordingState.value.isRecording) return;

        const displayInfo = currentRecordingDisplay.value;
        if (!displayInfo) {
            await showMsg(t('console.recordingSelectDisplay'));
            return;
        }

        try {
            // 约束码率与间隔
            const safeBitrate = Math.max(1, Math.min(50, Number(recordingState.value.bitrate) || 8));
            const safeInterval = Math.max(1, Number(recordingState.value.intervalSec) || 8);

            recordingState.value.bitrate = safeBitrate;
            recordingState.value.intervalSec = safeInterval;
            recordingState.value.progress = 0;
            recordingState.value.elapsed = 0;
            recordingState.value.nextIn = safeInterval;

            // 计算本次录制的预计总步数和总时长：
            // 以运营区首末站为范围，按 getStep() 方向，从起点到终点的“下一步”次数 × 间隔秒数
            try {
                const meta = (pidsState.appData && pidsState.appData.meta) ? pidsState.appData.meta : {};
                const stations = (pidsState.appData && Array.isArray(pidsState.appData.stations))
                    ? pidsState.appData.stations
                    : [];

                // 环线模式无法预估完整录制时长，保持为 0
                if (meta.mode === 'loop' || !stations.length) {
                    recordingState.value.totalSteps = 0;
                    recordingState.value.totalDuration = 0;
                } else {
                    const sIdx = (meta.startIdx !== undefined && meta.startIdx !== -1)
                        ? parseInt(meta.startIdx)
                        : 0;
                    const eIdx = (meta.termIdx !== undefined && meta.termIdx !== -1)
                        ? parseInt(meta.termIdx)
                        : (stations.length - 1);
                    const minIdx = Math.min(sIdx, eIdx);
                    const maxIdx = Math.max(sIdx, eIdx);
                    const stationCount = Math.max(1, maxIdx - minIdx + 1);
                    // 每两个站之间有两步：出站 + 下一站进站，因此总步数约为 2 * (stationCount - 1)
                    const totalSteps = Math.max(1, 2 * (stationCount - 1));
                    recordingState.value.totalSteps = totalSteps;
                    recordingState.value.totalDuration = totalSteps * safeInterval;
                }
            } catch (e) {
                console.warn('计算录制预计时长失败:', e);
                recordingState.value.totalSteps = 0;
                recordingState.value.totalDuration = 0;
            }

            // 如果启用并行分段录制：由主进程独立推进 SYNC，不再驱动 controllerNext
            const enableParallel = !!recordingState.value.parallelEnabled;
            recordingState.value.mode = enableParallel ? 'parallel' : 'single';
            recordingState.value.isRecording = true;
            const vehicleAudioEnabled = settings.vehicleAudioEnabled !== false;
            const options = {
                encoder: recordingState.value.encoder,
                codec: recordingState.value.codec,
                container: recordingState.value.container,
                bitrate: safeBitrate,     // Mbps
                fps: recordingState.value.fps,
                intervalSec: safeInterval,
                vehicleAudioEnabled: vehicleAudioEnabled
            };

            let result;
            if (enableParallel) {
                // 计算并行分段需要的起点索引与方向
                const meta = (pidsState.appData && pidsState.appData.meta) ? pidsState.appData.meta : {};
                const stations = (pidsState.appData && Array.isArray(pidsState.appData.stations))
                    ? pidsState.appData.stations
                    : [];
                const stepDir = (typeof getStep === 'function' ? getStep() : 1) > 0 ? 1 : -1;
                const sIdx = (meta.startIdx !== undefined && meta.startIdx !== -1) ? parseInt(meta.startIdx) : 0;
                const eIdx = (meta.termIdx !== undefined && meta.termIdx !== -1) ? parseInt(meta.termIdx) : (stations.length ? stations.length - 1 : 0);
                const minIdx = Math.min(sIdx, eIdx);
                const maxIdx = Math.max(sIdx, eIdx);
                const startIdx = stepDir > 0 ? minIdx : maxIdx;

                // IPC 传参必须是可结构化克隆的纯对象（Vue 响应式 Proxy 会导致 An object could not be cloned）
                let appDataPlain = null;
                try {
                    appDataPlain = JSON.parse(JSON.stringify(toRaw(pidsState.appData)));
                } catch (e) {
                    try {
                        appDataPlain = JSON.parse(JSON.stringify(pidsState.appData));
                    } catch (e2) {
                        recordingState.value.isRecording = false;
                        await showMsg(t('console.recordingError') + ': ' + 'appData 无法序列化（请检查线路数据是否包含不可序列化字段）');
                        return;
                    }
                }

                result = await window.electronAPI.recording.startParallelRecording(
                    displayInfo.id,
                    {
                        ...options,
                        appData: appDataPlain,
                        totalSteps: recordingState.value.totalSteps || 0,
                        stepDir,
                        startIdx,
                        parallelism: Math.max(1, Math.min(4, Number(recordingState.value.parallelism) || 2)),
                        stepsPerSegment: Math.max(1, Number(recordingState.value.stepsPerSegment) || 20)
                    }
                );
            } else {
                result = await window.electronAPI.recording.startRecording(
                    displayInfo.id,
                    options
                );
            }
            if (result && result.ok) {
                showNotification('录制已开始', t('console.recordingStarted'), {
                    tag: 'recording-started',
                    urgency: 'normal'
                });

                // single 模式才驱动“下一步”
                if (!enableParallel) {
                    try { if (recordingStepTimer) clearInterval(recordingStepTimer); } catch (e) {}
                    recordingStepTimer = setInterval(async () => {
                        if (!recordingState.value.isRecording) return;
                        // 到终点站时不要再推进（停止逻辑由 watch(rt.idx)+shouldStop 触发）
                        if (shouldStop()) return;

                        recordingState.value.nextIn = Math.max(0, (recordingState.value.nextIn || 0) - 1);
                        const interval = Math.max(1, Number(recordingState.value.intervalSec) || 8);
                        const passed = interval - recordingState.value.nextIn;
                        recordingState.value.progress = Math.min(100, Math.max(0, (passed / interval) * 100));

                        if (recordingState.value.nextIn <= 0) {
                            try { await controllerNextWithAudio(); } catch (e) {}
                            recordingState.value.nextIn = interval;
                            recordingState.value.progress = 0;
                        }
                    }, 1000);
                } else {
                    try { if (recordingStepTimer) clearInterval(recordingStepTimer); } catch (e) {}
                    recordingStepTimer = null;
                }
            } else {
                recordingState.value.isRecording = false;
                await showMsg(result?.error || t('console.recordingError'));
            }
        } catch (e) {
            recordingState.value.isRecording = false;
            console.error('开始录制失败:', e);
            await showMsg(t('console.recordingError') + ': ' + String(e));
        }
    }

    // 停止录制
    async function stopRecording() {
        if (!hasElectronAPI.value || !window.electronAPI?.recording) return;
        if (!recordingState.value.isRecording) return;

        try {
            const result = (recordingState.value.mode === 'parallel')
                ? await window.electronAPI.recording.stopParallelRecording()
                : await window.electronAPI.recording.stopRecording();
            if (result && result.ok) {
                recordingState.value.isRecording = false;
                recordingState.value.progress = 0;
                recordingState.value.nextIn = 0;
                recordingState.value.totalSteps = 0;
                recordingState.value.totalDuration = 0;
                recordingState.value.parallelStage = '';
                recordingState.value.segmentSummary = null;
                showNotification('录制已停止', t('console.recordingStopped'), {
                    tag: 'recording-stopped',
                    urgency: 'normal'
                });
            }
        } catch (e) {
            console.error('停止录制失败:', e);
        }

        try { if (recordingStepTimer) clearInterval(recordingStepTimer); } catch (e) {}
        recordingStepTimer = null;
    }

    // 录制按钮：在“开始录制 / 停止录制”之间切换
    async function toggleRecording() {
        if (recordingState.value.isRecording) {
            await stopRecording();
        } else {
            await startRecording();
        }
    }

    // 打开视频输出文件夹
    async function openRecordingFolder() {
        try {
            if (!hasElectronAPI.value || !window.electronAPI?.recording?.openOutputFolder) return;
            const res = await window.electronAPI.recording.openOutputFolder();
            if (!res || !res.ok) {
                await showMsg(t('console.recordingError') + (res && res.error ? (': ' + String(res.error)) : ''));
            }
        } catch (e) {
            await showMsg(t('console.recordingError') + ': ' + String(e));
        }
    }

    // 监听录制进度（订阅句柄在 onMounted 中赋值）
    let recordingProgressUnsubscribe = null;

    // 线路到达终点站后自动停止录制（复用自动播放的 shouldStop 逻辑）
    watch(
        () => pidsState.rt && pidsState.rt.idx,
        (idx) => {
            if (!recordingState.value.isRecording) return;
            try {
                if (typeof idx === 'number' && shouldStop(idx)) {
                    stopRecording();
                }
            } catch (e) {
                console.warn('录制自动停止检测失败:', e);
            }
        }
    );

    return {
        pidsState,
        fileIO,
        settings,
        isPlaying,
        isPaused,
        nextIn,
        startWithLock,
        stopWithUnlock,
        togglePause,
        applyAutoplayIntervalSec,
        openLineManagerWindow,
        openLineManagerForSave,
        saveCfg,
        saveCfgAndPersistSilent,
        changeServiceMode,
        setLineMode,
        setDirType,
        hasElectronAPI,
        pickColor,
        showColorPicker,
        colorPickerInitialColor,
        onColorConfirm,
        clearShortTurn,
        applyShortTurn,
        unlockAutoShortTurn,
        showShortTurnStartDropdown,
        showShortTurnEndDropdown,
        toggleShortTurnStartDropdown,
        toggleShortTurnEndDropdown,
        shortTurnStartDropdownRef,
        shortTurnEndDropdownRef,
        shortTurnDropdownTriggerStyle,
        glassDropdownDirective,
        shortTurnStartDropdownMenuStyle,
        shortTurnEndDropdownMenuStyle,
        shortTurnItemHoverBackground,
        shortTurnItemActiveBackground,
        throughStationLabelStyle,
        throughStationControlStyle,
        throughStationDropdownMenuStyle,
        throughStationDropdownIndex,
        toggleThroughStationDropdown,
        selectThroughStation,
        recordingSelectStyle,
        recordingDropdownMenuStyle,
        recordingDropdownOpenKey,
        recordingEncoderOptions,
        recordingCodecOptions,
        recordingContainerOptions,
        recordingFpsOptions,
        recordingParallelismOptions,
        getRecordingOptionLabel,
        toggleRecordingDropdown,
        selectRecordingDropdownValue,
        shortTurnStartTitle,
        shortTurnEndTitle,
        selectShortTurnStart,
        selectShortTurnEnd,
        shortTurnPresets,
        loadShortTurnPresets,
        saveShortTurnPreset,
        loadShortTurnPreset,
        deleteShortTurnPreset,
        presetContextMenu,
        showPresetContextMenu,
        closePresetContextMenu,
        applyPresetFromMenu,
        deletePresetFromMenu,
        sharePresetOffline,
        importPresetFromShareCode,
        generateShareId,
        throughLineSegments,
        addThroughLineSegment,
        removeThroughLineSegment,
        openLineManagerForSegment,
        clearThroughOperation,
        applyThroughOperation,
        // Mica Electron 测试
        micaInfo,
        micaTestLogs,
        getMicaInfo,
        setMicaEffect,
        setAcrylicEffect,
        setMicaTheme,
        setBackgroundColor,
        setRoundedCorner,
        clearMicaLogs,
                t,
                recordingState,
                parallelStageLabel,
                recordingProgressPercent,
                recordingRemainingTimeText,
                recordingCurrentStationName,
                recordingArrDepLabel,
                currentRecordingDisplay,
                startRecording,
                stopRecording,
                toggleRecording,
                openRecordingFolder,
                loadAvailableEncoders,
    }
  }
}
