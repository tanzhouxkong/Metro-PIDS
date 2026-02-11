<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import {
  getFilteredStations,
  calculateDisplayStationInfo
} from '../../src/utils/displayStationCalculator.js'

const appData = ref(null)
const rt = ref({ idx: 0, state: 0 })
const settings = ref({})

const bc = ref(null)

// 简体 / 繁体 语言模式（sc: 简体, tc: 繁体）
const langMode = ref('sc')

// 非完整字库，仅覆盖常见的简→繁字符；其余字符保持不变
const SIMPLE_SC_TO_TC_MAP = {
  线: '線',
  东: '東',
  国: '國',
  广: '廣',
  里: '裡',
  台: '臺',
  厂: '廠',
  后: '後',
  发: '發',
  为: '為',
  画: '畫',
  会: '會',
  块: '塊',
  乐: '樂',
  马: '馬',
  门: '門',
  车: '車',
  铁: '鐵',
  体: '體',
  间: '間',
  号: '號',
  灯: '燈',
  灾: '災',
  无: '無',
  杀: '殺',
  万: '萬',
  单: '單',
  飞: '飛',
  风: '風',
  业: '業',
  当: '當',
  录: '錄',
  请: '請'
}

const convertScToTc = (text) => {
  if (!text || typeof text !== 'string') return text || ''
  return text.replace(/./g, (ch) => SIMPLE_SC_TO_TC_MAP[ch] || ch)
}

const activeZhText = (text) => {
  if (!text || typeof text !== 'string') return text || ''
  return langMode.value === 'tc' ? convertScToTc(text) : text
}

// 方向过滤但不反转：香港风格，左→右恒定
const displayConfig = {
  filterByDirection: true,
  reverseOnDown: false
}

const lineMeta = computed(() => appData.value?.meta || {})
const allStations = computed(() => appData.value?.stations || [])
const dirType = computed(() => lineMeta.value.dirType || null)

const stations = computed(() => {
  if (!appData.value) return []
  return getFilteredStations(appData.value, dirType.value, displayConfig)
})

// 线路颜色：优先 meta.themeColor，与显示器1保持一致的默认色
const lineColor = computed(() => {
  // 与显示器1逻辑对齐：如果没有 themeColor，就用默认绿 (#00b894)
  const c = lineMeta.value.themeColor || '#00b894'

  if (typeof document !== 'undefined' && c) {
    document.documentElement.style.setProperty('--hk-line-color', c)
  }

  return c
})

const rawLineName = computed(() => lineMeta.value.lineName || '')

const stripColorMarkup = (text) => {
  if (!text || typeof text !== 'string') return text || ''
  return text.replace(/<[^>]+>([^<]*)<\/>/g, '$1')
}

const lineNamePlain = computed(() => stripColorMarkup(rawLineName.value).trim() || '--')

// 根据当前语言模式返回中文线路名
const lineNameZh = computed(() => {
  const base = lineNamePlain.value
  if (!base || base === '--') return '--'
  return activeZhText(base)
})

const lineNameEn = computed(() => {
  const s = lineNamePlain.value
  if (!s || s === '--') return 'LINE'
  const en = s.replace(/[^\w\s\-]/g, '').trim()
  return (en || s).toUpperCase()
})

const routeDirection = computed(() => {
  const list = stations.value
  if (!list.length) return '-- → --'
  const first = list[0]?.name || '--'
  const last = list[list.length - 1]?.name || '--'
  return `${activeZhText(first)} → ${activeZhText(last)}`
})

const stationInfo = computed(() => {
  if (!appData.value || !stations.value.length) {
    return { currentIdx: 0, nextIdx: -1, nextStationName: '' }
  }

  const rtVal = rt.value || {}
  if (typeof rtVal.display2CurrentIdx === 'number' && rtVal.display2CurrentIdx >= 0) {
    const currentIdx = Math.min(rtVal.display2CurrentIdx, stations.value.length - 1)
    let nextIdx = -1
    let nextStationName = ''
    if (rtVal.state === 1) {
      if (typeof rtVal.display2NextIdx === 'number' && rtVal.display2NextIdx >= 0) {
        nextIdx = Math.min(rtVal.display2NextIdx, stations.value.length - 1)
      }
      if (rtVal.nextStationName) {
        nextStationName = rtVal.nextStationName
      }
    }
    return { currentIdx, nextIdx, nextStationName }
  }

  const rtState = { idx: rtVal.idx, state: rtVal.state }
  return calculateDisplayStationInfo(appData.value, rtState, displayConfig)
})

const currentIdx = computed(() => {
  if (!stations.value.length) return 0
  const i = stationInfo.value.currentIdx
  return i >= 0 ? Math.min(i, stations.value.length - 1) : 0
})

const nextIdx = computed(() => {
  if (!stations.value.length) return -1
  if (rt.value.state !== 1) return -1
  if (typeof rt.value.display2NextIdx === 'number' && rt.value.display2NextIdx >= 0) {
    return Math.min(rt.value.display2NextIdx, stations.value.length - 1)
  }
  const i = stationInfo.value.nextIdx
  return i >= 0 ? Math.min(i, stations.value.length - 1) : -1
})

const nextStationName = computed(() => {
  if (rt.value.state !== 1) return ''
  if (rt.value.nextStationName) return rt.value.nextStationName
  return stationInfo.value.nextStationName || ''
})

const getStationState = (index) => {
  const cur = currentIdx.value
  const n = nextIdx.value
  const state = rt.value.state
  if (index === cur && state === 0) return 'current'
  if (index === cur && state === 1) return 'passed'
  if (index === n && state === 1) return 'next'
  if (index < cur || (state === 1 && index === cur)) return 'passed'
  return 'future'
}

const stationDotClass = (index) => {
  const s = getStationState(index)
  if (s === 'current') return 'current'
  if (s === 'passed') return 'passed'
  return 'future'
}

const stationTextClass = (index) => {
  const s = getStationState(index)
  if (s === 'current') return 'current'
  if (s === 'passed') return 'passed'
  return 'future'
}

const showNextArrow = computed(() => nextIdx.value >= 0 && rt.value.state === 1)

const isArriving = computed(() => rt.value.state === 0)
const isDeparting = computed(() => rt.value.state === 1)

const currentStation = computed(() => {
  if (!stations.value.length) return null
  const idx = currentIdx.value
  return stations.value[idx] || null
})

const currentStationNameZh = computed(() => {
  const name = currentStation.value?.name || '--'
  return activeZhText(name)
})

const currentStationNameEn = computed(() => currentStation.value?.en || '')

// 出站页面：以“下一站”为中心，截取最多 4 个站点（上一站 + 当前/下一站 + 后续最多 2 站）
const departCenterIndex = computed(() => {
  if (!stations.value.length) return 0
  if (nextIdx.value >= 0) return nextIdx.value
  return currentIdx.value
})

const departStripStations = computed(() => {
  const list = displayStations.value
  if (!list.length) return []
  const center = departCenterIndex.value
  const indices = []
  for (let offset = -1; offset <= 2; offset++) {
    const i = center + offset
    if (i >= 0 && i < list.length) indices.push(i)
  }
  return indices.map((idx) => ({
    ...list[idx],
    _idx: idx
  }))
})

// 定义一些常见线路的颜色映射，用于渲染换乘胶囊背景
const LINE_COLOR_MAP = {
  '屯马线': 'pill-brown',
  'Tuen Ma Line': 'pill-brown',
  '观塘线': 'pill-green',
  'Kwun Tong Line': 'pill-green',
  '荃湾线': 'pill-red',
  'Tsuen Wan Line': 'pill-red',
  '港岛线': 'pill-blue',
  'Island Line': 'pill-blue',
  '东铁线': 'pill-azure',
  'East Rail Line': 'pill-azure'
}

const getLinePillClass = (xferItem) => {
  if (!xferItem) return ''
  const key = xferItem.line || xferItem.text || ''
  for (const k in LINE_COLOR_MAP) {
    if (key.includes(k)) return LINE_COLOR_MAP[k]
  }
  return 'pill-brown'
}

// 修改节点状态判断逻辑，以匹配图片 (Passed=灰, Next=白, Future=黄)
const getDepartNodeClass = (globalIdx) => {
  const cur = currentIdx.value
  const n = nextIdx.value
  const state = rt.value.state

  if (globalIdx < cur) return 'hk-depart-node--passed'
  if (globalIdx === cur || (state === 1 && globalIdx === n)) {
    return 'hk-depart-node--next'
  }
  return 'hk-depart-node--future'
}

// 箭头位置计算：在截取窗口内第 0 和第 1 个站之间
const arrowPositionStyle = computed(() => {
  const list = departStripStations.value
  if (list.length < 2) return { display: 'none' }

  const count = list.length
  const segmentWidth = 100 / (count - 1)
  const leftPos = segmentWidth * 0.5

  return { left: `${leftPos}%` }
})

// 背景条渐变：左灰右蓝（东铁线蓝）
const departBandGradient = computed(() => {
  const list = departStripStations.value
  if (list.length < 2) return {}

  const count = list.length
  const segmentWidth = 100 / (count - 1)

  const splitPercent = segmentWidth * 0.5
  const gray = '#cccccc'
  const blue = '#529ecc'

  return {
    background: `linear-gradient(to right, ${gray} 0%, ${gray} ${splitPercent}%, ${blue} ${splitPercent}%, ${blue} 100%)`
  }
})

const footerText = computed(() => {
  if (!stations.value.length) return activeZhText('正在载入线路数据…')

  // 到达站页面：提示小心空隙
  if (isArriving.value) {
    return activeZhText('请小心月台空隙')
  }

  const last = stations.value[stations.value.length - 1]
  if (!last) return activeZhText('列车运行中')
  const base = `往${last.name}方向列车，请在本站转乘 / 换乘其他线路`
  return activeZhText(base)
})

const footerTextEn = computed(() => {
  if (!stations.value.length) return 'Loading line data…'

  // 到达站页面：展示英文提示
  if (isArriving.value) {
    return 'Please mind the gap'
  }

  return 'For interchange, please alight at this station'
})

// 站点数组包装一层，便于根据简/繁返回展示用中文名，同时临时注入换乘模拟数据
const displayStations = computed(() =>
  stations.value.map((st) => {
    let mockXfer = st.xfer || []
    if (st.name === '红磡' || st.name === 'Hung Hom') {
      mockXfer = [{ line: '屯马线', en: 'Tuen Ma Line' }]
    }
    if (st.name === '九龙塘' || st.name === 'Kowloon Tong') {
      mockXfer = [{ line: '观塘线', en: 'Kwun Tong Line' }]
    }
    if (st.name === '金钟' || st.name === 'Admiralty') {
      mockXfer = [{ line: '荃湾线', en: 'Tsuen Wan Line' }]
    }

    return {
      ...st,
      displayName: activeZhText(st.name || '--'),
      xfer: mockXfer
    }
  })
)

const displayNextStationName = computed(() => activeZhText(nextStationName.value))

const handleMessage = (ev) => {
  const data = ev && ev.data
  if (!data || typeof data !== 'object') return
  if (data.t === 'SYNC') {
    if (data.d) appData.value = data.d
    if (data.r) rt.value = data.r
    if (data.settings) {
      settings.value = data.settings
      // 如果上位机传入显示语言配置，则同步到本地
      const langFromSettings =
        data.settings.hkLang ||
        data.settings.langHK ||
        data.settings.display3Lang
      if (langFromSettings === 'sc' || langFromSettings === 'tc') {
        langMode.value = langFromSettings
      }
    }
  }
}

onMounted(() => {
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const ch = new BroadcastChannel('metro_pids_v3')
      bc.value = ch
      ch.addEventListener('message', handleMessage)
      ch.postMessage({ t: 'REQ', from: 'display-3' })
    }
  } catch (e) {
    console.warn('[Display-3] BroadcastChannel 初始化失败:', e)
  }
})

onBeforeUnmount(() => {
  if (bc.value) {
    try {
      bc.value.removeEventListener('message', handleMessage)
      bc.value.close()
    } catch (e) {}
  }
})
</script>

<template>
  <div style="width:100%;height:100%;display:flex;flex-direction:column;">
    <!-- 顶部状态栏（可拖动窗口 + 窗口按钮），白色，对齐系统标题栏高度 -->
    <div
      id="display-statusbar"
      style="width:100%;max-width:1900px;margin:0 auto;display:flex;align-items:center;justify-content:center;height:32px;padding:0 8px;background:#ffffff;color:#000;border-bottom:1px solid rgba(0,0,0,0.1);-webkit-app-region:drag;cursor:move;box-sizing:border-box;"
    >
      <div
        id="display-statusbar-inner"
        style="width:100%;display:flex;align-items:center;-webkit-app-region:drag;cursor:move;"
      >
        <div
          class="app-name"
          style="display:flex;align-items:center;gap:6px;font-size:13px;-webkit-app-region:drag;cursor:move;"
        >
          <i class="fas fa-subway"></i>
          <span>Metro PIDS</span>
        </div>
      </div>
    </div>

    <div
      class="hk-root"
      style="width:100%;flex:1 1 auto;display:flex;flex-direction:column;"
    >
      <!-- 顶部信息条：运行中显示抬头，出站页面不显示，到站时仅保留右侧下车提示 -->
      <div
        v-if="!isArriving && !isDeparting"
        class="hk-header"
      >
        <div class="hk-header-left">
          <div class="hk-line-pill">
            {{ lineNameZh }}
          </div>
          <div class="hk-line-text">
            <div class="hk-line-ch">
              {{ lineNameZh }}
            </div>
            <div class="hk-line-en">
              {{ lineNameEn }}
            </div>
          </div>
        </div>
        <div class="hk-header-right">
          <div class="hk-dir">{{ routeDirection }}</div>
          <div v-if="displayNextStationName">
            下一站 Next: <strong>{{ displayNextStationName }}</strong>
          </div>
          <div class="hk-lang-toggle">
            <button
              type="button"
              :class="{ active: langMode === 'sc' }"
              @click="langMode = 'sc'"
            >
              简
            </button>
            <button
              type="button"
              :class="{ active: langMode === 'tc' }"
              @click="langMode = 'tc'"
            >
              繁
            </button>
          </div>
        </div>
      </div>

      <!-- 中部主体区域：
           - 出站(state=1)：精简出站页面（只显示附近少量站点 + 换乘信息）
           - 到站(state=0)：大站名字样 + 中央黄色圆点
           - 其他：显示完整线路图
      -->
      <div class="hk-main">
        <template v-if="isDeparting">
          <div
            v-if="departStripStations.length"
            class="hk-depart-strip"
          >
            <div class="hk-depart-line">
              
              <div class="hk-depart-band-wrapper">
                <div class="hk-depart-band" :style="departBandGradient"></div>
              </div>

              <div class="hk-depart-arrow-icon" :style="arrowPositionStyle">
                <i class="fas fa-arrow-right"></i>
              </div>

              <div class="hk-depart-stations">
                <div
                  v-for="(st, i) in departStripStations"
                  :key="st._idx"
                  class="hk-depart-node"
                  :class="getDepartNodeClass(st._idx)"
                >
                  <!-- 换乘站：从圆点引出竖直胶囊
                       - 单线路：宽度与圆点一致
                       - 多线路：较细，用于组合多线 -->
                  <div
                    v-if="st.xfer && st.xfer.length && getDepartNodeClass(st._idx) !== 'hk-depart-node--passed'"
                    class="hk-transfer-stem"
                    :class="[
                      getLinePillClass(st.xfer[0]),
                      st.xfer.length <= 1 ? 'hk-transfer-stem--single' : ''
                    ]"
                  ></div>
                  <div
                    v-if="st.xfer && st.xfer.length && getDepartNodeClass(st._idx) !== 'hk-depart-node--passed'"
                    class="hk-transfer-pill"
                    :class="getLinePillClass(st.xfer[0])"
                  >
                    <div class="hk-transfer-line-zh">
                      {{ st.xfer[0].line || st.xfer[0].text }}
                    </div>
                    <div class="hk-transfer-line-en">
                      {{ st.xfer[0].en || 'Interchange' }}
                    </div>
                  </div>

                  <div class="hk-depart-dot-outer"></div>

                  <div class="hk-depart-text-group">
                    <div class="hk-depart-label-zh">
                      {{ st.displayName }}
                    </div>
                    <div class="hk-depart-label-en">
                      {{ st.en || '' }}
                    </div>
                  </div>

                </div>
              </div>
            </div>
          </div>
        </template>

        <!-- 到达站页面：大站名 + 中央黄色圆点 -->
        <template v-else-if="isArriving">
          <div
            v-if="currentStation"
            class="hk-arrival-row"
          >
            <div class="hk-arrival-name hk-arrival-name-zh">
              {{ currentStationNameZh }}
            </div>
            <div class="hk-arrival-dot-wrap">
              <div class="hk-arrival-dot"></div>
            </div>
            <div class="hk-arrival-name hk-arrival-name-en">
              {{ currentStationNameEn }}
            </div>
          </div>
        </template>

        <!-- 其他情况：显示完整线路图 -->
        <template v-else>
          <div class="hk-line-wrapper">
            <div class="hk-line-band"></div>
            <div class="hk-line-band-inner"></div>
            <div class="hk-station-layer">
              <div
                v-for="(st, idx) in displayStations"
                :key="idx"
                class="hk-station-node"
              >
                <div class="hk-station-dot-wrap">
                  <div
                    class="hk-station-dot"
                    :class="stationDotClass(idx)"
                  ></div>
                  <div
                    v-if="showNextArrow && idx === nextIdx"
                    class="hk-next-arrow"
                  >
                    <i class="fas fa-arrow-right"></i>
                  </div>
                </div>
                <div class="hk-station-label">
                  <div
                    class="hk-station-name"
                    :class="stationTextClass(idx)"
                  >
                    {{ st.displayName }}
                  </div>
                  <div
                    class="hk-station-en"
                    :class="stationTextClass(idx)"
                  >
                    {{ st.en || '' }}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>

      <!-- 底部提示条：到达站时变为黄色警示栏 -->
      <div
        class="hk-footer"
        :class="{ 'hk-footer-warning': isArriving }"
      >
        <span>{{ footerText }}</span>
        <span class="hk-footer-en">{{ footerTextEn }}</span>
      </div>
    </div>
  </div>
</template>

