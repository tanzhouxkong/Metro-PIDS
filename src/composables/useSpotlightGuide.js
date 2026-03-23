import { ref, onMounted } from 'vue'
import {
  SPOTLIGHT_STEPS,
  SPOTLIGHT_STEP_CONFIG,
  getGuideConfig,
  getGuideVersion,
  setGuideVersion,
  shouldShowGuide,
  resetGuideState
} from '../spotlight-guide-config.js'

// 重新导出配置，供外部使用
export { SPOTLIGHT_STEPS, SPOTLIGHT_STEP_CONFIG }

const STORAGE_KEY = 'metro_pids_spotlight_guide'
const STORAGE_KEY_VERSION = 'metro_pids_spotlight_guide_version'

// 模块级共享状态 - 确保所有组件共享同一个引导状态
let _currentStep = ref('')
let _isVisible = ref(false)
let _isCompleted = ref(false)
let _guideVersion = ref('')
let _isLineManagerMode = ref(false)
let _initialized = false
let _storageListener = null

export function useSpotlightGuide() {
  // 使用模块级共享状态
  const currentStep = _currentStep
  const isVisible = _isVisible
  const isCompleted = _isCompleted
  const guideVersion = _guideVersion
  const isLineManagerMode = _isLineManagerMode

  const loadFromStorage = () => {
    if (typeof window === 'undefined' || !window.localStorage) return

    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const data = JSON.parse(saved)
        currentStep.value = data.currentStep || ''
        isCompleted.value = data.isCompleted || false
        guideVersion.value = data.guideVersion || ''
      }

      const version = localStorage.getItem(STORAGE_KEY_VERSION)
      if (version) {
        guideVersion.value = version
      }
    } catch (e) {
      console.warn('[SpotlightGuide] 加载本地存储失败:', e)
    }
  }

  const saveToStorage = () => {
    if (typeof window === 'undefined' || !window.localStorage) return

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        currentStep: currentStep.value,
        isCompleted: isCompleted.value,
        guideVersion: guideVersion.value,
        updatedAt: Date.now()
      }))
    } catch (e) {
      console.warn('[SpotlightGuide] 保存本地存储失败:', e)
    }
  }

  const saveVersion = (version) => {
    if (typeof window === 'undefined' || !window.localStorage) return
    guideVersion.value = version
    localStorage.setItem(STORAGE_KEY_VERSION, version)
  }

  const startGuide = (version = '') => {
    console.log('[SpotlightGuide] startGuide called, version:', version)

    const config = getGuideConfig()
    const steps = config.mainFlowSteps || ['welcome', 'open_line_manager', 'short_turn_start', 'short_turn_end', 'through_line', 'done']
    const firstStep = steps[0] || 'welcome'

    if (version) {
      saveVersion(version)
    } else {
      saveVersion(config.version)
    }

    currentStep.value = firstStep
    isCompleted.value = false
    isVisible.value = true
    isLineManagerMode.value = false
    saveToStorage()

    console.log('[SpotlightGuide] startGuide set isVisible to true, currentStep:', currentStep.value)
  }

  const startLineManagerGuide = (version = '') => {
    const config = getGuideConfig()
    const steps = config.lineManagerSteps || ['line_manager_new', 'line_manager_edit', 'done']
    const firstStep = steps[0] || 'line_manager_new'

    if (version) {
      saveVersion(version)
    } else {
      saveVersion(config.version)
    }

    currentStep.value = firstStep
    isCompleted.value = false
    isVisible.value = true
    isLineManagerMode.value = true
    saveToStorage()
  }

  const nextStep = () => {
    const config = getGuideConfig()
    const steps = isLineManagerMode.value
      ? (config.lineManagerSteps || ['line_manager_new', 'line_manager_edit', 'done'])
      : (config.mainFlowSteps || ['welcome', 'open_console', 'open_line_manager', 'short_turn_start', 'short_turn_end', 'through_line', 'done'])

    const currentIndex = steps.indexOf(currentStep.value)
    if (currentIndex < steps.length - 1) {
      currentStep.value = steps[currentIndex + 1]
    }

    if (currentStep.value === 'done') {
      isCompleted.value = true
      isVisible.value = false
      // 引导完成后，切回主页
      if (typeof window !== 'undefined' && window.__vueI18n) {
        // 通过事件通知 App 切换到主页
        window.dispatchEvent(new CustomEvent('spotlight-guide-complete'))
      }
    }

    saveToStorage()
  }

  const prevStep = () => {
    const config = getGuideConfig()
    const steps = isLineManagerMode.value
      ? (config.lineManagerSteps || ['line_manager_new', 'line_manager_edit', 'done'])
      : (config.mainFlowSteps || ['welcome', 'open_line_manager', 'short_turn_start', 'short_turn_end', 'through_line', 'done'])

    const currentIndex = steps.indexOf(currentStep.value)
    if (currentIndex > 0) {
      currentStep.value = steps[currentIndex - 1]
    }

    saveToStorage()
  }

  const closeGuide = () => {
    isVisible.value = false
    saveToStorage()
  }

  const resetGuide = () => {
    currentStep.value = ''
    isCompleted.value = false
    isVisible.value = false
    isLineManagerMode.value = false
    resetGuideState()
  }

  const getCurrentStepConfig = () => {
    const step = currentStep.value
    return SPOTLIGHT_STEP_CONFIG[step] || null
  }

  const checkShouldShowGuide = () => {
    return shouldShowGuide()
  }

  onMounted(() => {
    if (_initialized) return
    _initialized = true

    loadFromStorage()

    _storageListener = (e) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          const data = JSON.parse(e.newValue)
          if (data.currentStep !== currentStep.value) {
            currentStep.value = data.currentStep
          }
          if (data.isCompleted !== isCompleted.value) {
            isCompleted.value = data.isCompleted
          }
          if (data.isVisible !== undefined && data.isVisible !== isVisible.value) {
            isVisible.value = data.isVisible
          }
        } catch (e) {}
      }
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('storage', _storageListener)
    }
  })

  return {
    currentStep,
    isVisible,
    isCompleted,
    guideVersion,
    isLineManagerMode,
    startGuide,
    startLineManagerGuide,
    nextStep,
    prevStep,
    closeGuide,
    resetGuide,
    getCurrentStepConfig,
    checkShouldShowGuide,
    SPOTLIGHT_STEPS,
    SPOTLIGHT_STEP_CONFIG
  }
}

export default useSpotlightGuide
