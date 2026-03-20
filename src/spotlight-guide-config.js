// 镂空聚光灯新手引导配置
// 此文件可被云端配置覆盖（通过 localStorage 或远程 API）

const DEFAULT_GUIDE_CONFIG = {
  // 当前引导版本号，云端可通过更新此版本号来强制重新显示引导
  // 如果引导版本 <= 客户端版本，则不显示引导
  version: '1.6.7',

  // 客户端版本号（从 package.json 读取）
  clientVersion: '1.6.7',

  // 是否启用引导
  enabled: true,

  // 引导步骤配置
  // title 和 body 支持两种格式：
  // 1. 字符串：直接显示文本
  // 2. i18n 对象：{ zh-CN: '中文', en: 'English' }，会自动根据 locale 选择
  steps: [
    {
      id: 'welcome',
      title: { 'zh-CN': '欢迎使用 Metro-PIDS', 'en': 'Welcome to Metro-PIDS', 'ja': 'Metro-PIDSへようこそ', 'ko': 'Metro-PIDS에 오신 것을 환영합니다' },
      body: { 'zh-CN': '这是一个简短的新手引导，将带你了解核心功能。', 'en': 'This is a short guide that will introduce you to the core features.', 'ja': 'これはコア機能を紹介する短いガイドです.', 'ko': '핵심 기능을 소개하는 짧은 가이드입니다.' },
      targetSelector: '',
      showBack: false,
      showNext: true,
      nextLabel: { 'zh-CN': '开始', 'en': 'Start', 'ja': '開始', 'ko': '시작' },
      backLabel: '',
      isLineManagerStep: false
    },
    {
      id: 'open_console',
      title: { 'zh-CN': '打开 PIDS 控制台', 'en': 'Open PIDS Console', 'ja': 'PIDSコンソールを開く', 'ko': 'PIDS 콘솔 열기' },
      body: { 'zh-CN': '点击侧边栏的控制台按钮，打开 PIDS 控制台页面。', 'en': 'Click the console button in the sidebar to open the PIDS control page.', 'ja': 'サイドバーのコンソールボタンをクリックしてPIDSコントロールページを開きます.', 'ko': '사이드바의 콘솔 버튼을 클릭하여 PIDS 컨트롤 페이지를 엽니다.' },
      targetSelector: '',
      showBack: false,
      showNext: true,
      nextLabel: { 'zh-CN': '下一步', 'en': 'Next', 'ja': '次へ', 'ko': '다음' },
      backLabel: { 'zh-CN': '上一步', 'en': 'Back', 'ja': '前へ', 'ko': '뒤로' },
      isLineManagerStep: false
    },
    {
      id: 'open_line_manager',
      title: { 'zh-CN': '打开线路管理器', 'en': 'Open Line Manager', 'ja': 'ライン管理を開く', 'ko': '노선 관리자 열기' },
      body: { 'zh-CN': '点击此按钮可打开线路管理器，用于管理本地线路配置。', 'en': 'Click this button to open the line manager for managing local line configurations.', 'ja': 'このボタンをクリックしてローカルライン設定を管理するためのライン管理を開きます.', 'ko': '로컬 노선 구성을 관리하기 위한 노선 관리자를 여는 버튼입니다.' },
      targetSelector: '',
      showBack: true,
      showNext: true,
      nextLabel: { 'zh-CN': '下一步', 'en': 'Next', 'ja': '次へ', 'ko': '다음' },
      backLabel: { 'zh-CN': '上一步', 'en': 'Back', 'ja': '前へ', 'ko': '뒤로' },
      isLineManagerStep: false
    },
    {
      id: 'short_turn_start',
      title: { 'zh-CN': '设置短交路起点', 'en': 'Set Short Turn Start', 'ja': '短折り返し開始駅を設定', 'ko': '단축 구간 시작역 설정' },
      body: { 'zh-CN': '在此选择短交路的起点站，限制列车的运行范围。', 'en': 'Select the starting station for the short turn to limit the train operation range.', 'ja': 'ここで短折り返しの始発駅を選択して、列車運行範囲を制限します.', 'ko': '여기에서 단축 구간의 시작역을 선택하여 열차 운영 범위를 제한합니다.' },
      targetSelector: '',
      showBack: true,
      showNext: true,
      nextLabel: { 'zh-CN': '下一步', 'en': 'Next', 'ja': '次へ', 'ko': '다음' },
      backLabel: { 'zh-CN': '上一步', 'en': 'Back', 'ja': '前へ', 'ko': '뒤로' },
      isLineManagerStep: false
    },
    {
      id: 'short_turn_end',
      title: { 'zh-CN': '设置短交路终点', 'en': 'Set Short Turn End', 'ja': '短折り返し終点駅を設定', 'ko': '단축 구간 종점역 설정' },
      body: { 'zh-CN': '在此选择短交路的终点站。', 'en': 'Select the ending station for the short turn.', 'ja': 'ここで短折り返しの終点駅を選択します.', 'ko': '여기에서 단축 구간의 종점역을 선택합니다.' },
      targetSelector: '',
      showBack: true,
      showNext: true,
      nextLabel: { 'zh-CN': '下一步', 'en': 'Next', 'ja': '次へ', 'ko': '다음' },
      backLabel: { 'zh-CN': '上一步', 'en': 'Back', 'ja': '前へ', 'ko': '뒤로' },
      isLineManagerStep: false
    },
    {
      id: 'through_line',
      title: { 'zh-CN': '贯通线路', 'en': 'Through Line', 'ja': '直通運転', 'ko': '直通 노선' },
      body: { 'zh-CN': '可设置贯通线路，让列车在两条线路间贯通运行。', 'en': 'You can set up through lines to allow trains to operate between two lines.', 'ja': '直通運転を設定して、列車に2つのライン間で運行させることができます.', 'ko': '통과 노선을 설정하여 열차가 두 노선 사이를 운행하도록 할 수 있습니다.' },
      targetSelector: '',
      showBack: true,
      showNext: true,
      nextLabel: { 'zh-CN': '下一步', 'en': 'Next', 'ja': '次へ', 'ko': '다음' },
      backLabel: { 'zh-CN': '上一步', 'en': 'Back', 'ja': '前へ', 'ko': '뒤로' },
      isLineManagerStep: false
    },
    {
      id: 'line_manager_new',
      title: { 'zh-CN': '新建线路', 'en': 'Create New Line', 'ja': '新規ライン作成', 'ko': '새 노선 만들기' },
      body: { 'zh-CN': '在线路管理器中，右键点击空白区域可创建新线路。', 'en': 'In the line manager, right-click on a blank area to create a new line.', 'ja': 'ライン管理で空白 영역を右クリックして新規ラインを作成できます.', 'ko': '노선 관리자에서 빈 영역을 마우스 오른쪽 버튼으로 클릭하여 새 노선을 만들 수 있습니다.' },
      targetSelector: '',
      showBack: true,
      showNext: true,
      nextLabel: { 'zh-CN': '下一步', 'en': 'Next', 'ja': '次へ', 'ko': '다음' },
      backLabel: { 'zh-CN': '上一步', 'en': 'Back', 'ja': '前へ', 'ko': '뒤로' },
      isLineManagerStep: true
    },
    {
      id: 'line_manager_edit',
      title: { 'zh-CN': '编辑线路', 'en': 'Edit Line', 'ja': 'ライン編集', 'ko': '노선 편집' },
      body: { 'zh-CN': '双击线路可打开编辑器进行修改。', 'en': 'Double-click on a line to open the editor for modifications.', 'ja': 'ラインをダブルクリックしてエディタを開いて変更できます.', 'ko': '노선을 더블 클릭하여 편집기를 열어 수정할 수 있습니다.' },
      targetSelector: '',
      showBack: true,
      showNext: true,
      nextLabel: { 'zh-CN': '完成引导', 'en': 'Finish Guide', 'ja': 'ガイド完了', 'ko': '가이드 완료' },
      backLabel: { 'zh-CN': '上一步', 'en': 'Back', 'ja': '前へ', 'ko': '뒤로' },
      isLineManagerStep: true
    },
    {
      id: 'done',
      title: { 'zh-CN': '引导完成', 'en': 'Guide Complete', 'ja': 'ガイド完了', 'ko': '가이드 완료' },
      body: { 'zh-CN': '恭喜你已完成新手引导！现在你可以开始使用 Metro-PIDS 了。', 'en': 'Congratulations! You have completed the guide. Now you can start using Metro-PIDS.', 'ja': 'おめでとうございます！ガイドが完了しました。今すぐMetro-PIDSの使用を開始できます.', 'ko': '축하합니다! 가이드를 완료했습니다. 이제 Metro-PIDS 사용을 시작할 수 있습니다.' },
      targetSelector: '',
      showBack: true,
      showNext: false,
      nextLabel: { 'zh-CN': '完成', 'en': 'Done', 'ja': '完了', 'ko': '완료' },
      backLabel: '',
      isLineManagerStep: false
    }
  ],

  // 线路管理器引导步骤（独立流程）
  lineManagerSteps: ['line_manager_new', 'line_manager_edit', 'done'],

  // 主流程引导步骤
  mainFlowSteps: ['welcome', 'open_console', 'open_line_manager', 'short_turn_start', 'short_turn_end', 'through_line', 'done']
}

// 本地存储键名
const STORAGE_KEY = 'metro_pids_spotlight_guide'
const STORAGE_KEY_VERSION = 'metro_pids_spotlight_guide_version'
const STORAGE_KEY_CONFIG = 'metro_pids_spotlight_guide_config'

// 导出配置
export const GUIDE_CONFIG = DEFAULT_GUIDE_CONFIG

// 导出步骤 ID 常量
export const SPOTLIGHT_STEPS = DEFAULT_GUIDE_CONFIG.steps.reduce((acc, step) => {
  acc[step.id.toUpperCase()] = step.id
  return acc
}, {})

// 导出步骤配置映射
export const SPOTLIGHT_STEP_CONFIG = DEFAULT_GUIDE_CONFIG.steps.reduce((acc, step) => {
  acc[step.id] = step
  return acc
}, {})

// 获取当前 locale 的辅助函数
function getCurrentLocale() {
  if (typeof window === 'undefined') return 'zh-CN'

  // 尝试从 vue-i18n 获取 locale
  try {
    if (window.__vueI18n && window.__vueI18n.global && window.__vueI18n.global.locale) {
      return window.__vueI18n.global.locale
    }
  } catch (e) {}

  // 尝试从 localStorage 获取
  try {
    if (window.localStorage) {
      const saved = localStorage.getItem('vite-ui-language') || localStorage.getItem('i18n_redirected') || localStorage.getItem('i18n_locale')
      if (saved) return saved
    }
  } catch (e) {}

  // 尝试从 navigator 获取
  try {
    const nav = window.navigator
    if (nav) {
      const lang = nav.language || nav.userLanguage || 'zh-CN'
      if (lang.startsWith('zh')) return 'zh-CN'
      if (lang.startsWith('ja')) return 'ja'
      if (lang.startsWith('ko')) return 'ko'
      return 'en'
    }
  } catch (e) {}

  return 'zh-CN'
}

// 根据 locale 获取 i18n 文本
export function getLocalizedText(textConfig) {
  if (!textConfig) return ''
  if (typeof textConfig === 'string') return textConfig
  if (typeof textConfig !== 'object') return String(textConfig)

  const locale = getCurrentLocale()
  return textConfig[locale] || textConfig['zh-CN'] || textConfig['en'] || Object.values(textConfig)[0] || ''
}

// 获取引导配置的函数（支持云端覆盖）
export function getGuideConfig() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return DEFAULT_GUIDE_CONFIG
  }

  try {
    // 优先使用云端配置
    const cloudConfig = localStorage.getItem(STORAGE_KEY_CONFIG)
    if (cloudConfig) {
      const parsed = JSON.parse(cloudConfig)
      return { ...DEFAULT_GUIDE_CONFIG, ...parsed }
    }
  } catch (e) {
    console.warn('[SpotlightGuide] 读取云端配置失败:', e)
  }

  return DEFAULT_GUIDE_CONFIG
}

// 设置云端引导配置（供云控调用）
export function setGuideConfig(config) {
  if (typeof window === 'undefined' || !window.localStorage) return

  try {
    localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(config))
    console.log('[SpotlightGuide] 云端配置已更新:', config)
  } catch (e) {
    console.error('[SpotlightGuide] 保存云端配置失败:', e)
  }
}

// 获取当前引导版本
export function getGuideVersion() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return DEFAULT_GUIDE_CONFIG.version
  }

  return localStorage.getItem(STORAGE_KEY_VERSION) || DEFAULT_GUIDE_CONFIG.version
}

// 设置引导版本
export function setGuideVersion(version) {
  if (typeof window === 'undefined' || !window.localStorage) return

  localStorage.setItem(STORAGE_KEY_VERSION, version)
}

// 检查是否应该显示引导
// 规则：引导版本 > 客户端版本时才显示引导
export function shouldShowGuide() {
  const config = getGuideConfig()
  if (!config.enabled) return false

  const guideVersion = config.version
  const clientVersion = config.clientVersion || guideVersion
  const storedVersion = localStorage.getItem(STORAGE_KEY_VERSION) || ''

  // 如果存储的引导版本为空，说明从未显示过引导，需要比较
  if (!storedVersion) {
    // 从未显示过引导，比较引导版本和客户端版本
    if (compareVersions(guideVersion, clientVersion) <= 0) {
      // 引导版本 <= 客户端版本，不显示
      return false
    }
    return true
  }

  // 如果存储的版本小于引导版本，说明需要更新引导
  if (compareVersions(storedVersion, guideVersion) < 0) {
    return true
  }

  return false
}

// 版本比较函数：返回 1 如果 v1 > v2，0 如果相等，-1 如果 v1 < v2
function compareVersions(v1, v2) {
  const parse = (v) => {
    return String(v).split('.').map((p) => {
      const num = parseInt(p, 10)
      return isNaN(num) ? 0 : num
    })
  }

  const parts1 = parse(v1)
  const parts2 = parse(v2)

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0
    const p2 = parts2[i] || 0

    if (p1 > p2) return 1
    if (p1 < p2) return -1
  }

  return 0
}

// 重置引导状态
export function resetGuideState() {
  if (typeof window === 'undefined' || !window.localStorage) return

  localStorage.removeItem(STORAGE_KEY)
  localStorage.removeItem(STORAGE_KEY_VERSION)
  // 注意：不删除 STORAGE_KEY_CONFIG，保留云端配置
}

export default {
  GUIDE_CONFIG,
  SPOTLIGHT_STEPS,
  SPOTLIGHT_STEP_CONFIG,
  getGuideConfig,
  setGuideConfig,
  getGuideVersion,
  setGuideVersion,
  shouldShowGuide,
  resetGuideState,
  getLocalizedText,
  getCurrentLocale
}
