import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import {
  getFilteredStations,
  calculateDisplayStationInfo
} from '../../src/utils/displayStationCalculator.js'

export default {
  name: 'JinanDisplay',
  setup() {
    // ============ 响应式数据 ============
    const appData = ref(null)
    const rt = ref({ idx: 0, state: 0 }) // 0=Arr, 1=Run
    const scaleRatio = ref(1)
    const platform = ref('')
    const isDarwin = computed(() => platform.value === 'darwin')
    const isLinux = computed(() => platform.value === 'linux')
    const nowClock = ref(new Date())
    let clockTimer = null
    
    // "下一站"页面显示控制
    const forceShowNextStationPage = ref(false) // 强制显示"下一站"页面（用于定时器控制）
    let nextStationTimer = null // 定时器
    
    // "到站"页面显示控制
    const forceShowArrivalPage = ref(false) // 强制显示"到站"页面（用于定时器控制）
    let arrivalTimer = null // 定时器
    
    // 下一站圆点闪烁控制
    const isNextStationBlinking = ref(false) // 是否正在闪烁
    const blinkColor = ref('red') // 当前闪烁颜色：'red' 或 'green'
    let blinkTimer = null // 闪烁定时器
    
    // 底栏LED文字和水印
    const footerLED = ref('') // LED滚动文字
    const footerWatermark = ref(true) // 是否显示水印
    const footerRotateIndex = ref(0)
    const display2UiVariant = ref('classic') // classic=1.0, modern=2.0
    const display2UiVariantClass = computed(() => display2UiVariant.value === 'modern' ? 'ui-modern' : 'ui-classic')
    const isModernUi = computed(() => display2UiVariant.value === 'modern')
    const useTwoRowLayout = computed(() => {
      return stations.value && stations.value.length > 39
    })

    const FOOTER_TIPS = [
      '请为老、弱、病、残、孕、需要帮助的乘客让座谢谢。',
      '公交车是老百姓的私家车，驾驶员是老百姓的专职司机'
    ]

    // BroadcastChannel
    let bc = null
    let bcNew = null

    // ============ 计算属性 ============
    // 获取所有站点（未过滤）
    const allStations = computed(() => {
      return appData.value?.stations || []
    })
    
    // 获取当前线路方向
    const currentDirection = computed(() => {
      return appData.value?.meta?.dirType || null
    })
    
    // 显示器2配置：方向过滤 + 下行反转
    const display2Config = {
      filterByDirection: true,
      reverseOnDown: true
    }
    
    // 使用站点计算 API 获取过滤后的站点数组
    // 返回过滤后的站点数组，每个站点包含原始索引
    // 下行方向时自动反转站点顺序，使首末站位置对调
    const stations = computed(() => {
      if (!appData.value) return []
      
      const dirType = currentDirection.value
      return getFilteredStations(appData.value, dirType, display2Config)
    })

    // 颜色标记解析：将 <color>文字</> 转为带颜色的 HTML
    const parseColorMarkup = (text) => {
      if (!text || typeof text !== 'string') return text
      const regex = /<([^>]+)>([^<]*)<\/>/g
      let result = text
      let match
      const colorNames = {
        red: 'red',
        blue: 'blue',
        green: 'green',
        yellow: 'yellow',
        orange: 'orange',
        purple: 'purple',
        pink: 'pink',
        black: 'black',
        white: 'white',
        gray: 'gray',
        grey: 'grey',
        brown: 'brown',
        cyan: 'cyan',
        magenta: 'magenta',
        lime: 'lime',
        navy: 'navy',
        olive: 'olive',
        teal: 'teal',
        aqua: 'aqua',
        silver: 'silver',
        maroon: 'maroon',
        fuchsia: 'fuchsia'
      }
      while ((match = regex.exec(text)) !== null) {
        const colorValue = match[1].trim()
        const content = match[2]
        const fullMatch = match[0]
        let cssColor = ''
        if (colorNames[colorValue.toLowerCase()]) {
          cssColor = colorNames[colorValue.toLowerCase()]
        } else if (/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(colorValue)) {
          cssColor = colorValue
        } else if (/^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(,\s*[\d.]+\s*)?\)$/.test(colorValue)) {
          cssColor = colorValue
        }
        if (cssColor) {
          const escapedContent = content
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;')
          const coloredSpan = `<span style="color:${cssColor};">${escapedContent}</span>`
          result = result.replace(fullMatch, coloredSpan)
        }
      }
      return result
    }

    // 去除颜色标记，保留纯文本
    const stripColorMarkup = (text) => {
      if (!text || typeof text !== 'string') return text
      return text.replace(/<[^>]+>([^<]*)<\/>/g, '$1')
    }

    const rawLineName = computed(() => appData.value?.meta?.lineName || '--')

    const lineNameHTML = computed(() => parseColorMarkup(rawLineName.value))

    const lineNumber = computed(() => {
      const plain = stripColorMarkup(rawLineName.value)
      const num = plain.replace(/[^0-9A-Za-z]/g, '')
      return num || plain || '--'
    })

    // 路线信息：路线号
    const routeNumber = computed(() => {
      return lineNumber.value || '--'
    })

    // 路线方向：起始站 → 终点站
    const routeDirection = computed(() => {
      if (stations.value.length === 0) return '-- → --'
      const startStation = stations.value[0]?.name || '--'
      const endStation = stations.value[stations.value.length - 1]?.name || '--'
      return `${startStation} → ${endStation}`
    })

    const modernHeaderFrom = computed(() => {
      if (stations.value.length === 0) return '--'
      return stations.value[0]?.name || '--'
    })

    const modernHeaderTo = computed(() => {
      if (stations.value.length === 0) return '--'
      return stations.value[stations.value.length - 1]?.name || '--'
    })

    const modernHeaderDate = computed(() => {
      const d = nowClock.value || new Date()
      const weekMap = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1)
      const day = String(d.getDate())
      const week = weekMap[d.getDay()] || ''
      return `${y}-${m}-${day} ${week}`
    })

    const modernHeaderTime = computed(() => {
      const d = nowClock.value || new Date()
      const hh = String(d.getHours()).padStart(2, '0')
      const mm = String(d.getMinutes()).padStart(2, '0')
      const ss = String(d.getSeconds()).padStart(2, '0')
      return `${hh}.${mm}.${ss}`
    })

    function updateNowClock() {
      nowClock.value = new Date()
    }

    // 使用站点计算 API 计算当前站和下一站信息
    const stationInfo = computed(() => {
      if (!appData.value || stations.value.length === 0) {
        return { currentIdx: 0, nextIdx: -1, nextStationName: '' }
      }
      
      // 优先使用主程序发送的索引（如果可用）
      if (typeof rt.value.display2CurrentIdx === 'number' && rt.value.display2CurrentIdx >= 0) {
        const currentIdx = Math.min(rt.value.display2CurrentIdx, stations.value.length - 1)
        let nextIdx = -1
        let nextStationName = ''
        
        // 如果主程序也发送了下一站信息，使用它
        if (rt.value.state === 1) {
          if (typeof rt.value.display2NextIdx === 'number' && rt.value.display2NextIdx >= 0) {
            nextIdx = Math.min(rt.value.display2NextIdx, stations.value.length - 1)
          }
          if (rt.value.nextStationName) {
            nextStationName = rt.value.nextStationName
          }
        }
        
        return { currentIdx, nextIdx, nextStationName }
      }
      
      // 否则使用 API 计算
      const rtState = {
        idx: rt.value.idx,
        state: rt.value.state
      }
      return calculateDisplayStationInfo(appData.value, rtState, display2Config)
    })
    
    // 当前活动站点索引（在过滤后的站点数组中的索引）
    const activeStationIdx = computed(() => {
      if (stations.value.length === 0) return 0
      const idx = stationInfo.value.currentIdx
      return idx >= 0 ? Math.min(idx, stations.value.length - 1) : 0
    })
    
    // 获取原始站点索引（用于判断站点状态）
    const getOriginalIndex = (filteredIndex) => {
      if (filteredIndex >= 0 && filteredIndex < stations.value.length) {
        return stations.value[filteredIndex].originalIndex
      }
      return filteredIndex
    }

    // 是否显示"下一站"页面：仅在强制显示时显示（由定时器控制）
    const showNextStationPage = computed(() => {
      if (isModernUi.value) return false
      return forceShowNextStationPage.value && stations.value.length > 0
    })
    
    // 是否显示"到站"页面：仅在强制显示时显示（由定时器控制）
    const showArrivalPage = computed(() => {
      if (isModernUi.value) {
        return rt.value.state === 0 && stations.value.length > 0
      }
      return forceShowArrivalPage.value && stations.value.length > 0
    })
    
    // "下一站"页面显示时长（毫秒），默认10秒，可从设置中读取
    const nextStationDuration = ref(10000)
    
    // "到站"页面显示时长（毫秒），默认10秒，复用 nextStationDuration
    const arrivalDuration = computed(() => nextStationDuration.value)
    
    // 当前站名称：用于"到站"页面显示
    const currentStationName = computed(() => {
      if (stations.value.length === 0 || activeStationIdx.value < 0) return ''
      const currentStation = stations.value[activeStationIdx.value]
      return currentStation?.name || ''
    })

    // 下一站名称：使用站点计算 API 的结果
    const nextStationName = computed(() => {
      if (rt.value.state !== 1) return ''
      // 优先使用主程序发送的下一站名称
      if (rt.value.nextStationName) {
        return rt.value.nextStationName
      }
      // 否则使用 API 计算的结果
      return stationInfo.value.nextStationName || ''
    })
    
    // 下一站索引（在过滤后的站点数组中的索引）
    const nextStationIdx = computed(() => {
      if (stations.value.length === 0) return -1
      if (rt.value.state !== 1) return -1
      
      // 优先使用主程序发送的索引
      if (typeof rt.value.display2NextIdx === 'number' && rt.value.display2NextIdx >= 0) {
        return Math.min(rt.value.display2NextIdx, stations.value.length - 1)
      }
      
      // 如果没有，尝试使用主程序发送的下一站名称查找
      const nameFromMain = rt.value.nextStationName
      if (nameFromMain) {
        const idx = stations.value.findIndex(st => st.name === nameFromMain)
        if (idx >= 0) return idx
      }
      
      // 否则使用 API 计算的结果
      const idx = stationInfo.value.nextIdx
      return idx >= 0 ? Math.min(idx, stations.value.length - 1) : -1
    })

    const footerSignalMessage = computed(() => {
      if (rt.value.state === 1) {
        const terminalName = stations.value.length > 0 ? (stations.value[stations.value.length - 1]?.name || '--') : '--'
        const nextName = nextStationName.value || '--'
        return `本车开往： ${terminalName}，车辆前方到站： ${nextName}。`
      }
      const arrivedName = currentStationName.value || '--'
      return `${arrivedName}  到了。请停稳后再起身，下车注意观察后方。`
    })

    const footerMessageQueue = computed(() => {
      const queue = [footerSignalMessage.value, ...FOOTER_TIPS]
      if (footerLED.value && footerLED.value.trim()) {
        queue.push(footerLED.value.trim())
      }
      return queue.filter(Boolean)
    })

    const displayedFooterLED = computed(() => {
      const queue = footerMessageQueue.value
      if (queue.length === 0) return ''
      const index = ((footerRotateIndex.value % queue.length) + queue.length) % queue.length
      return queue[index]
    })

    const modernDepartureStops = computed(() => {
      const len = stations.value.length
      if (len <= 0) {
        return [
          { key: 's1', name: '--', state: 'past' },
          { key: 's2', name: '--', state: 'current' },
          { key: 's3', name: '--', state: 'future' },
          { key: 's4', name: '--', state: 'future' }
        ]
      }

      const last = len - 1
      const current = Math.max(0, Math.min(activeStationIdx.value, last))
      const highlight = (rt.value.state === 1 && nextStationIdx.value >= 0)
        ? Math.max(0, Math.min(nextStationIdx.value, last))
        : current
      // 固定 4 槽位，使用连续窗口避免末站重复（如 last,last,last）
      // 规则：
      // 1) 站点>=4：始终展示连续 4 站，靠近末站时右侧对齐到终点站
      // 2) 站点<4：展示已有站点并补 '--' 占位
      const windowSize = 4
      const maxStart = Math.max(0, len - windowSize)
      let start = Math.max(0, highlight - 1)
      start = Math.min(start, maxStart)
      const idxList = Array.from({ length: windowSize }, (_, i) => {
        const idx = start + i
        return idx >= 0 && idx < len ? idx : -1
      })

      return idxList.map((idx, i) => {
        let state = 'future'
        if (idx >= 0) {
          if (idx < highlight) state = 'past'
          else if (idx === highlight) state = 'current'
        }
        return {
          key: `s${i + 1}`,
          idx,
          name: idx >= 0 ? (stations.value[idx]?.name || '--') : '--',
          state
        }
      })
    })

    const modernArrivalRows = computed(() => {
      const list = stations.value || []
      if (list.length === 0) return { top: [], bottom: [] }

      const current = Math.max(0, Math.min(activeStationIdx.value, list.length - 1))
      const mapped = list.map((st, idx) => {
        let state = 'future'
        if (idx < current) state = 'passed'
        else if (idx === current) state = 'current'
        return {
          idx,
          name: st?.name || '--',
          state
        }
      })

      const split = Math.ceil(mapped.length / 2)
      return {
        top: mapped.slice(0, split),
        bottom: mapped.slice(split).reverse()
      }
    })

    const modernSingleRowStations = computed(() => {
      const list = stations.value || []
      if (list.length === 0) return []

      const current = Math.max(0, Math.min(activeStationIdx.value, list.length - 1))
      const highlight = (rt.value.state === 1 && nextStationIdx.value >= 0)
        ? Math.max(0, Math.min(nextStationIdx.value, list.length - 1))
        : current
      return list.map((st, idx) => {
        let state = 'future'
        if (idx < highlight) state = 'passed'
        else if (idx === highlight) state = 'current'
        return {
          idx,
          name: st?.name || '--',
          state
        }
      })
    })

    const modernSingleRowSegments = computed(() => {
      const list = modernSingleRowStations.value || []
      if (list.length <= 1) return []
      const current = Math.max(0, Math.min(activeStationIdx.value, list.length - 1))
      const movingSegmentIdx = (rt.value.state === 1 && current >= 0 && current < list.length - 1)
        ? current
        : -1
      return list.slice(0, -1).map((node, idx) => ({
        key: `seg-${idx}`,
        idx,
        state: idx < current
          ? 'passed'
          : (idx === movingSegmentIdx ? 'current' : 'future')
      }))
    })

    function getModernSingleSegmentStyle(segmentIdx) {
      const count = modernSingleRowStations.value.length
      if (count <= 1) return { left: '0%', width: '0%' }
      const cell = 100 / count
      return {
        left: `${(segmentIdx + 0.5) * cell}%`,
        width: `${cell}%`
      }
    }

    const modernTwoRowStations = computed(() => {
      const list = stations.value || []
      if (list.length === 0) return { top: [], bottom: [] }

      const current = Math.max(0, Math.min(activeStationIdx.value, list.length - 1))
      const highlight = (rt.value.state === 1 && nextStationIdx.value >= 0)
        ? Math.max(0, Math.min(nextStationIdx.value, list.length - 1))
        : current
      
      const mapped = list.map((st, idx) => {
        let state = 'future'
        if (idx < highlight) state = 'passed'
        else if (idx === highlight) state = 'current'
        return {
          idx,
          name: st?.name || '--',
          state
        }
      })

      const split = Math.ceil(mapped.length / 2)
      return {
        top: mapped.slice(0, split),
        bottom: mapped.slice(split)
      }
    })

    const modernTwoRowSegments = computed(() => {
      const { top, bottom } = modernTwoRowStations.value
      const list = stations.value || []
      const current = Math.max(0, Math.min(activeStationIdx.value, list.length - 1))
      const movingSegmentIdx = (rt.value.state === 1 && current >= 0 && current < list.length - 1)
        ? current
        : -1
      
      const getSegmentState = (segIdx) => {
        if (segIdx < current) return 'passed'
        if (segIdx === movingSegmentIdx) return 'current'
        return 'future'
      }

      const topSegments = top.slice(0, -1).map((node, i) => {
        const segIdx = node.idx
        return {
          key: `top-seg-${i}`,
          idx: i,
          state: getSegmentState(segIdx)
        }
      })

      const bottomSegments = bottom.slice(0, -1).map((node, i) => {
        const segIdx = node.idx
        return {
          key: `bot-seg-${i}`,
          idx: i,
          state: getSegmentState(segIdx)
        }
      })

      return {
        top: topSegments,
        bottom: bottomSegments
      }
    })

    function getModernTwoRowSegmentStyle(segmentIdx, rowType) {
      const counts = modernTwoRowStations.value
      const count = rowType === 'top' ? counts.top.length : counts.bottom.length
      if (count <= 1) return { left: '0%', width: '0%' }
      const cell = 100 / count
      return {
        left: `${(segmentIdx + 0.5) * cell}%`,
        width: `${cell}%`
      }
    }

    function advanceFooterMessage() {
      const len = footerMessageQueue.value.length
      if (len <= 1) return
      footerRotateIndex.value = (footerRotateIndex.value + 1) % len
    }

    const nextPageFiveStations = computed(() => {
      const len = stations.value.length
      if (len <= 0) {
        return [
          { slot: 'first', idx: -1, name: '--', state: 'future' },
          { slot: 'prev', idx: -1, name: '--', state: 'future' },
          { slot: 'next', idx: -1, name: '--', state: 'future' },
          { slot: 'next2', idx: -1, name: '--', state: 'future' },
          { slot: 'terminal', idx: -1, name: '--', state: 'future' }
        ]
      }

      const firstIdx = 0
      const terminalIdx = len - 1
      const currentIdx = Math.max(0, Math.min(activeStationIdx.value, terminalIdx))

      const interior = []
      for (let i = 1; i < terminalIdx; i++) interior.push(i)

      const rawNextIdx = nextStationIdx.value >= 0
        ? Math.min(nextStationIdx.value, terminalIdx)
        : Math.min(currentIdx + 1, terminalIdx)
      const realNextIdx = rawNextIdx

      let effectiveNextIdx = terminalIdx > 0
        ? Math.max(1, Math.min(rawNextIdx, terminalIdx - 1))
        : 0
      let prevIdx = -1
      let next2Idx = -1

      // 中间三槽位使用“连续窗口”逻辑，避免出现“第一站-空白-第二站...”
      if (interior.length >= 3) {
        const windowStart = Math.max(1, Math.min(effectiveNextIdx - 1, terminalIdx - 3))
        prevIdx = windowStart
        effectiveNextIdx = windowStart + 1
        next2Idx = windowStart + 2
      } else if (interior.length === 2) {
        prevIdx = interior[0]
        effectiveNextIdx = interior[1]
        next2Idx = -1
      } else if (interior.length === 1) {
        prevIdx = interior[0]
        effectiveNextIdx = interior[0]
        next2Idx = -1
      }

      const statusByIdx = (idx) => {
        if (idx < 0 || realNextIdx < 0) return 'future'
        return idx < realNextIdx ? 'passed' : 'future'
      }
      const rawNameByIdx = (idx) => {
        if (idx < 0) return '--'
        const st = stations.value[idx]
        return st && st.name ? st.name : '--'
      }

      const nameBySlot = (slot, idx) => {
        const resolvedIdx = idx
        if (resolvedIdx < 0) return '--'
        if (slot === 'first' || slot === 'terminal' || slot === 'next') {
          return rawNameByIdx(resolvedIdx)
        }
        // prev/next2 避免与首末站、下一站重复显示
        if (resolvedIdx === firstIdx || resolvedIdx === terminalIdx || resolvedIdx === effectiveNextIdx) return '--'
        return rawNameByIdx(resolvedIdx)
      }

      return [
        { slot: 'first', idx: firstIdx, name: nameBySlot('first', firstIdx), state: statusByIdx(firstIdx) },
        { slot: 'prev', idx: prevIdx, name: nameBySlot('prev', prevIdx), state: statusByIdx(prevIdx) },
        { slot: 'next', idx: effectiveNextIdx, name: nameBySlot('next', effectiveNextIdx), state: statusByIdx(effectiveNextIdx) },
        { slot: 'next2', idx: next2Idx, name: nameBySlot('next2', next2Idx), state: statusByIdx(next2Idx) },
        { slot: 'terminal', idx: terminalIdx, name: nameBySlot('terminal', terminalIdx), state: statusByIdx(terminalIdx) }
      ]
    })

    const nextPageLineSegments = computed(() => {
      const points = nextPageFiveStations.value || []
      if (points.length < 2) return []
      const total = points.length - 1
      const segmentWidth = 100 / total
      const nextSlotIndex = points.findIndex((p) => p.slot === 'next')
      const nextNode = points.find((p) => p.slot === 'next')
      const nextGlobalIdx = nextNode && typeof nextNode.idx === 'number' ? nextNode.idx : -1
      const boundaryFlags = nextPageBoundaryFlags.value
      const terminalIdx = Math.max(0, (stations.value.length || 0) - 1)
      const realNextIdx = nextStationIdx.value >= 0 ? nextStationIdx.value : nextGlobalIdx
      const realNextSlotIndex = realNextIdx >= 0
        ? points.findIndex((p) => p && typeof p.idx === 'number' && p.idx === realNextIdx)
        : -1
      const effectiveNextSlotIndex = realNextSlotIndex >= 0 ? realNextSlotIndex : nextSlotIndex
      const forceFirstThreeSolid = (stations.value.length || 0) >= 3 && realNextIdx >= 0 && realNextIdx <= 2
      const finalApproach = nextStationIdx.value >= 0 && nextStationIdx.value === terminalIdx
      const segments = []
      for (let i = 0; i < total; i++) {
        const leftPoint = points[i]
        const rightPoint = points[i + 1]
        const leftIdx = typeof leftPoint?.idx === 'number' ? leftPoint.idx : -1
        const rightIdx = typeof rightPoint?.idx === 'number' ? rightPoint.idx : -1

        let state = 'future'
        if (realNextIdx >= 0 && leftIdx >= 0 && rightIdx >= 0) {
          const segmentRightBound = Math.max(leftIdx, rightIdx)
          state = segmentRightBound < realNextIdx ? 'passed' : 'future'
        } else {
          state = (leftPoint.state === 'passed' && rightPoint.state === 'passed') ? 'passed' : 'future'
        }

        if (finalApproach && i >= total - 2) {
          state = 'passed'
        }

        const aroundNextBySlot = effectiveNextSlotIndex >= 0 && (i === effectiveNextSlotIndex - 1 || i === effectiveNextSlotIndex)
        const aroundNextByIndex = realNextIdx >= 0 && leftIdx >= 0 && rightIdx >= 0
          ? (Math.min(leftIdx, rightIdx) <= realNextIdx && realNextIdx <= Math.max(leftIdx, rightIdx))
          : false
        const nearNext = aroundNextBySlot || aroundNextByIndex
        const edgeSolid = (boundaryFlags.omittedLeft && i === 0) || (boundaryFlags.omittedRight && i === total - 1)
        const alwaysLeftSolid = i === 1
        const firstThreeSolid = forceFirstThreeSolid && i <= 2
        const finalApproachSolid = finalApproach && i >= total - 2
        segments.push({
          id: `seg-${i}`,
          left: `${i * segmentWidth}%`,
          width: `${segmentWidth}%`,
          state,
          nearNext,
          forceSolid: nearNext || edgeSolid || alwaysLeftSolid || firstThreeSolid || finalApproachSolid
        })
      }
      return segments
    })

    const nextPageBoundaryFlags = computed(() => {
      const points = nextPageFiveStations.value || []
      if (points.length < 5) return { omittedLeft: false, omittedRight: false }
      const prevNode = points.find(p => p.slot === 'prev')
      const nextNode = points.find(p => p.slot === 'next')
      const next2Node = points.find(p => p.slot === 'next2')

      if (!prevNode || !nextNode || !next2Node) return { omittedLeft: false, omittedRight: false }

      // 左侧补位：上一站无法位于下一站左边时（接近首站）
      const omittedLeft = typeof prevNode.idx === 'number' && typeof nextNode.idx === 'number'
        ? (prevNode.idx < 0 || prevNode.idx >= nextNode.idx)
        : false

      // 右侧补位：下一站2无法位于下一站右边时（接近末站）
      const omittedRight = typeof next2Node.idx === 'number' && typeof nextNode.idx === 'number'
        ? (next2Node.idx < 0 || next2Node.idx <= nextNode.idx)
        : false

      return { omittedLeft, omittedRight }
    })

    const nextPageOutOfRange = computed(() => {
      const flags = nextPageBoundaryFlags.value
      return flags.omittedLeft || flags.omittedRight
    })

    // 下一站页面：当前站 -> 下一站 动态红点/红线
    const nextPagePulseVisible = ref(false)
    const nextPagePulseProgress = ref(0)
    let nextPagePulseTimer = null
    const NEXT_PAGE_PULSE_MOVE_MS = 3000
    const NEXT_PAGE_PULSE_GAP_MS = 700

    const nextPagePulseTrack = computed(() => {
      const points = nextPageFiveStations.value || []
      if (points.length < 2) return null

      const nextNode = points.find((p) => p.slot === 'next')
      const nextSlotIndex = points.findIndex((p) => p.slot === 'next')
      const fallbackNextIdx = nextNode && typeof nextNode.idx === 'number' ? nextNode.idx : -1
      const nextIdx = nextStationIdx.value >= 0 ? nextStationIdx.value : fallbackNextIdx
      if (nextIdx < 0) return null

      const targetNextSlotIndex = points.findIndex((p) => p && typeof p.idx === 'number' && p.idx === nextIdx)
      const resolvedNextSlotIndex = targetNextSlotIndex >= 0 ? targetNextSlotIndex : nextSlotIndex
      if (resolvedNextSlotIndex < 0) return null

      const currentIdx = nextIdx - 1
      let startSlotIndex = points.findIndex((p) => p && p.idx === currentIdx)

      if (startSlotIndex < 0) {
        let bestIdx = -1
        for (let i = 0; i < points.length; i++) {
          const idx = typeof points[i]?.idx === 'number' ? points[i].idx : -1
          if (idx >= 0 && idx < nextIdx && idx > bestIdx) {
            bestIdx = idx
            startSlotIndex = i
          }
        }
      }

      if (startSlotIndex < 0 || startSlotIndex >= resolvedNextSlotIndex) return null

      const slotToPercent = (slotIndex) => {
        if (points.length <= 1) return 0
        return (slotIndex / (points.length - 1)) * 100
      }

      const startPercent = slotToPercent(startSlotIndex)
      const endPercent = slotToPercent(resolvedNextSlotIndex)
      if (endPercent <= startPercent) return null

      return { startPercent, endPercent }
    })

    const nextPagePulseDotStyle = computed(() => {
      const track = nextPagePulseTrack.value
      if (!track || !nextPagePulseVisible.value) return { display: 'none' }
      const progress = Math.max(0, Math.min(1, nextPagePulseProgress.value))
      const position = track.startPercent + (track.endPercent - track.startPercent) * progress
      return { left: `${position}%` }
    })

    const nextPagePulseTrailStyle = computed(() => {
      const track = nextPagePulseTrack.value
      if (!track || !nextPagePulseVisible.value) return { display: 'none' }
      const progress = Math.max(0, Math.min(1, nextPagePulseProgress.value))
      const position = track.startPercent + (track.endPercent - track.startPercent) * progress
      const width = Math.max(0, position - track.startPercent)
      return {
        left: `${track.startPercent}%`,
        width: `${width}%`
      }
    })

    function stopNextPagePulse() {
      if (nextPagePulseTimer) {
        clearInterval(nextPagePulseTimer)
        nextPagePulseTimer = null
      }
      nextPagePulseVisible.value = false
      nextPagePulseProgress.value = 0
    }

    function startNextPagePulse() {
      stopNextPagePulse()

      if (!showNextStationPage.value || rt.value.state !== 1) return
      if (!nextPagePulseTrack.value) return

      let moving = true
      let phaseStart = Date.now()
      nextPagePulseVisible.value = true
      nextPagePulseProgress.value = 0

      nextPagePulseTimer = setInterval(() => {
        if (!showNextStationPage.value || rt.value.state !== 1 || !nextPagePulseTrack.value) {
          stopNextPagePulse()
          return
        }

        const elapsed = Date.now() - phaseStart

        if (moving) {
          const progress = Math.max(0, Math.min(1, elapsed / NEXT_PAGE_PULSE_MOVE_MS))
          nextPagePulseProgress.value = progress
          nextPagePulseVisible.value = true

          if (progress >= 1) {
            moving = false
            phaseStart = Date.now()
            nextPagePulseVisible.value = false
            nextPagePulseProgress.value = 0
          }
        } else if (elapsed >= NEXT_PAGE_PULSE_GAP_MS) {
          moving = true
          phaseStart = Date.now()
          nextPagePulseVisible.value = true
          nextPagePulseProgress.value = 0
        }
      }, 16)
    }
    
    // 判断站点是否为下一站且正在闪烁
    function isStationBlinking(index) {
      return isNextStationBlinking.value && index === nextStationIdx.value
    }
    
    // 获取站点圆点的闪烁类名
    function getStationDotClass(index) {
      // 如果正在闪烁（出站状态下的下一站）
      if (isStationBlinking(index)) {
        return blinkColor.value === 'red' ? 'passed' : 'future'
      }
      // 如果进站状态且是当前站，圆点显示为红色常亮
      if (rt.value.state === 0 && index === activeStationIdx.value) {
        return 'passed' // 进站时当前站：红色常亮
      }
      // 已过站：红色（包括出站状态下的当前站，因为出站后当前站已经是已过站）
      if (index < activeStationIdx.value || (rt.value.state === 1 && index === activeStationIdx.value)) {
        return 'passed'
      }
      // 未过站：绿色
      return 'future'
    }
    
    // 启动下一站圆点闪烁
    function startNextStationBlink() {
      // 清除之前的闪烁定时器
      if (blinkTimer) {
        clearInterval(blinkTimer)
        blinkTimer = null
      }
      
      // 如果不在出站状态，不启动闪烁
      if (rt.value.state !== 1 || nextStationIdx.value === -1) {
        isNextStationBlinking.value = false
        return
      }
      
      // 启动闪烁
      isNextStationBlinking.value = true
      blinkColor.value = 'red' // 从红色开始
      
      // 每500毫秒切换一次颜色
      blinkTimer = setInterval(() => {
        blinkColor.value = blinkColor.value === 'red' ? 'green' : 'red'
      }, 500)
    }
    
    // 停止下一站圆点闪烁
    function stopNextStationBlink() {
      if (blinkTimer) {
        clearInterval(blinkTimer)
        blinkTimer = null
      }
      isNextStationBlinking.value = false
    }

    const displayQuery = (() => {
      try {
        return new URLSearchParams((window.location && window.location.search) ? window.location.search : '')
      } catch (e) {
        return new URLSearchParams('')
      }
    })()
    const queryWidth = Number(displayQuery.get('dw') || displayQuery.get('designWidth') || 1900)
    const queryHeight = Number(displayQuery.get('dh') || displayQuery.get('designHeight') || 600)
    const SCREEN_WIDTH = Number.isFinite(queryWidth) && queryWidth > 0 ? Math.round(queryWidth) : 1900 // 屏幕宽度
    const SCREEN_HEIGHT = Number.isFinite(queryHeight) && queryHeight > 0 ? Math.round(queryHeight) : 600

    // 地图相关计算
    const PADDING = 40 // 左右内边距
    const PADDING_LEFT = 5 // 左边距（用于站点）
    const PADDING_RIGHT = 40 // 右边距（用于站点）
    const ST_WIDTH = 30 // 每个站点固定宽度
    
    // 计算可用宽度
    const AVAILABLE_WIDTH = computed(() => {
      return SCREEN_WIDTH - PADDING * 2 - PADDING_LEFT - PADDING_RIGHT
    })

    // 根据站点数量动态计算站间距
    const stationGap = computed(() => {
      const totalStations = stations.value.length
      if (totalStations <= 1) return 0
      
      // 计算所有站点占用的总宽度
      const totalStationsWidth = totalStations * ST_WIDTH
      
      // 计算剩余空间
      const remainingSpace = AVAILABLE_WIDTH.value - totalStationsWidth
      
      // 如果有剩余空间，平均分配到站点之间的间距
      if (remainingSpace > 0) {
        return remainingSpace / (totalStations - 1)
      }
      
      // 如果空间不足，返回0（站点会重叠，但至少能显示）
      return 0
    })

    // 计算每个站点的水平位置（根据站点数量动态分布）
    const getStationPosition = (index) => {
      const totalStations = stations.value.length
      if (totalStations === 0) return PADDING_LEFT
      if (totalStations === 1) return PADDING_LEFT + (AVAILABLE_WIDTH.value - ST_WIDTH) / 2
      
      // 计算每个站点之间的间距
      const gap = stationGap.value
      
      // 计算位置：左边距 + 索引 * (站点宽度 + 间距)
      return PADDING_LEFT + index * (ST_WIDTH + gap)
    }

    // 计算右边边缘位置（半圆连接在右边屏幕边缘）
    const rightEdgePosition = computed(() => {
      return SCREEN_WIDTH - PADDING - PADDING_RIGHT
    })

    // 使用显示器1的环线实现方式
    // 计算半圆的半径和位置（参考显示器1的cornerR和trackGap）
    const trackGap = computed(() => {
      const isClassicLargeLayout = !isModernUi.value && SCREEN_HEIGHT >= 600
      if (isClassicLargeLayout) return 52
      return 34
    }) // 上排到下排的距离（与 .track-lines 的高度一致）
    const cornerR = 5 // 半圆半径（间隙约5像素）
    const semicircleRadius = computed(() => {
      return cornerR
    })
    
    // 计算半圆路径的关键点（绘制真正的半圆，向右凸出）
    const semicirclePath = computed(() => {
      // 注意：track-lines 内部坐标系是从左边 padding 开始算起，
      // 上排和下排直线的右端位置
      const lineRightEnd = rightEdgePosition.value - PADDING_LEFT
      // 让半圆向左移动，减少向右的偏移量（从40px减少到10px）
      const x2 = rightEdgePosition.value - PADDING_LEFT + 30

      // 直线高度为 4px，中心分别在 2px 和 trackGap - 2px
      const lineHeight = 4
      const lineCenterOffset = lineHeight / 2 // 2px
      const yTop = lineCenterOffset                  // 上侧直线中心：2
      const yBottom = trackGap.value - lineCenterOffset    // 下侧直线中心
      
      // 计算半圆的半径（从上侧直线中心到下侧直线中心的距离的一半）
      const semicircleRadius = (yBottom - yTop) / 2  // (33 - 2) / 2 = 15.5
      const yCenter = (yTop + yBottom) / 2          // 半圆中心y坐标：17.5
      const xRight = x2 + semicircleRadius           // 半圆最右侧x坐标
      
      // 绘制路径：从上排直线右端 -> 连接线 -> 半圆 -> 连接线 -> 下排直线右端
      // 1. 从上排直线右端到半圆起点（连接线）
      // 2. 绘制半圆
      // 3. 从半圆终点到下排直线右端（连接线）
      // A rx ry x-axis-rotation large-arc-flag sweep-flag x y
      // large-arc-flag = 0 (90度不是大弧)
      // sweep-flag = 1 (顺时针方向)
      return `M ${lineRightEnd} ${yTop} L ${x2} ${yTop} A ${semicircleRadius} ${semicircleRadius} 0 0 1 ${xRight} ${yCenter} A ${semicircleRadius} ${semicircleRadius} 0 0 1 ${x2} ${yBottom} L ${lineRightEnd} ${yBottom}`
    })

    // 获取站点状态类（使用过滤后的索引）
    function getStationClass(index) {
      if (index < activeStationIdx.value) {
        return 'passed' // 已过站：红色
      } else {
        return 'future' // 未过站：黑色（包括当前站）
      }
    }

    // 判断是否为当前站点（使用过滤后的索引）
    function isCurrentStation(index) {
      return index === activeStationIdx.value
    }

    // 判断站点是否已过站（使用过滤后的索引）
    function isPassed(index) {
      return index < activeStationIdx.value
    }

    // 处理站名：根据显示尺寸自适应
    // - 单列模式：默认2-6个字符；在 classic + 600高分辨率下扩展为2-8个字符
    // - 两列换行模式：超过单列阈值时分两列；在 classic + 600高分辨率下第一列固定5个字符，其余进第二列
    // 注意：此函数对所有站点都适用，包括仅在上行或下行停靠的站点
    function formatStationName(name, station = null) {
      if (!name || typeof name !== 'string') return ''
      
      // 将站名拆分成字符数组
      const chars = Array.from(name)
      
      // 对于仅在上行或下行停靠的站点，站名格式化逻辑与普通站点相同
      // 这些站点在显示时已经被过滤（通过 getFilteredStations），
      // 但站名格式化逻辑本身不需要考虑 dock 属性
      
      // 辅助函数：格式化字符数组为HTML（单列模式）
      const formatCharsSingle = (charArray) => {
        return charArray.map(char => {
          const escapedChar = char
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;')
          return `<span class="station-name-char">${escapedChar}</span>`
        }).join('')
      }
      
      // 辅助函数：格式化字符数组为HTML（两列模式，每列单独包装）
      const formatCharsColumn = (charArray) => {
        return charArray.map(char => {
          const escapedChar = char
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;')
          return `<span class="station-name-char">${escapedChar}</span>`
        }).join('')
      }
      
      const isClassicLargeLayout = !isModernUi.value && SCREEN_HEIGHT >= 600
      const singleColumnLimit = isClassicLargeLayout ? 8 : 6
      const firstColumnCount = isClassicLargeLayout ? 5 : 4

      // 如果站名不超过阈值，单列模式：垂直均匀分布
      if (chars.length <= singleColumnLimit) {
        return formatCharsSingle(chars)
      }
      
      // 如果站名超过阈值，需要换行分成两栏
      // 第一列固定字符数，第二列剩余字符
      const breakChars = ['街', '路']
      let breakIndex = -1
      
      // 优先在"街"或"路"处换行（检查所有字符，从后往前找）
      // 第一列为固定字符数，所以检查该位置及之后是否有"街"或"路"
      // 如果找到"街"或"路"，第一列仍然固定，第二列从固定位置开始
      for (let i = chars.length - 1; i >= firstColumnCount; i--) {
        if (breakChars.includes(chars[i])) {
          // 找到"街"或"路"，但第一列固定为固定字符数
          // 所以无论"街"或"路"在哪里，都从固定位置分割
          breakIndex = firstColumnCount
          break
        }
      }
      
      // 如果找到了"街"或"路"，使用固定+剩余字符的分割方式
      if (breakIndex > 0) {
        // 第一部分：第一列固定字符数
        const part1 = chars.slice(0, firstColumnCount)
        // 第二部分：从固定位置开始的所有剩余字符
        const part2 = chars.slice(firstColumnCount)
        
        // 如果两部分都有内容，用两列容器包装
        if (part1.length > 0 && part2.length > 0) {
          return `<span class="station-name-col station-name-col-1">${formatCharsColumn(part1)}</span><span class="station-name-col station-name-col-2">${formatCharsColumn(part2)}</span>`
        } else if (part1.length > 0) {
          return `<span class="station-name-col station-name-col-1">${formatCharsColumn(part1)}</span>`
        } else {
          return `<span class="station-name-col station-name-col-2">${formatCharsColumn(part2)}</span>`
        }
      }
      
      // 如果没有找到"街"或"路"，或者位置不合适，第一列固定字符数，第二列剩余字符
      const part1 = chars.slice(0, firstColumnCount)
      const part2 = chars.slice(firstColumnCount)
      
      if (part2.length > 0) {
        return `<span class="station-name-col station-name-col-1">${formatCharsColumn(part1)}</span><span class="station-name-col station-name-col-2">${formatCharsColumn(part2)}</span>`
      } else {
        return `<span class="station-name-col station-name-col-1">${formatCharsColumn(part1)}</span>`
      }
    }

    // 所有站点，前半部分在上排，后半部分在下排
    // 上排从左到右覆盖整个屏幕，下排从右到左覆盖整个屏幕
    const allStationsWithRow = computed(() => {
      const totalStations = stations.value.length
      const midPoint = Math.ceil(totalStations / 2) // 上排站点数量
      
      return stations.value.map((station, filteredIndex) => {
        // 对所有站点（包括仅在上行或下行停靠的站点）都进行站名格式化
        // 这些站点在显示时已经被过滤（通过 getFilteredStations），
        // 但站名格式化逻辑对所有可见站点都适用
        const formatted = formatStationName(station.name, station)
        const isTwoColumn = formatted.includes('station-name-col')
        
        return {
          ...station,
          index: filteredIndex, // 使用过滤后的索引
          originalIndex: station.originalIndex, // 保留原始索引
          isPassed: isPassed(filteredIndex),
          isCurrent: isCurrentStation(filteredIndex),
          // 前半部分站点在上排，后半部分站点在下排
          isTopRow: filteredIndex < midPoint,
          // 处理后的站名（支持换行）
          formattedName: formatted,
          // 是否为两列模式
          isTwoColumn: isTwoColumn,
          // 是否为下一站（出站信号时，下一站站名显示为红色）
          // 或是否为当前站（进站信号时，当前站站名显示为红色）
          isNextStation: (rt.value.state === 1 && filteredIndex === nextStationIdx.value) ||
                        (rt.value.state === 0 && filteredIndex === activeStationIdx.value)
        }
      })
    })
    
    // 计算上排站点的位置（从左到右，覆盖整个屏幕宽度）
    const getTopStationPosition = (index) => {
      const totalStations = stations.value.length
      const midPoint = Math.ceil(totalStations / 2)
      
      if (index >= midPoint) return 0 // 下排站点，不在上排显示
      if (totalStations === 0) return PADDING_LEFT
      if (midPoint === 1) return PADDING_LEFT + (rightEdgePosition.value - PADDING_LEFT - ST_WIDTH) / 2
      
      // 上排站点从左到右，均匀分布在整个屏幕宽度上
      const gap = (rightEdgePosition.value - PADDING_LEFT - midPoint * ST_WIDTH) / (midPoint - 1)
      // 第一个站点（index === 0）使用更小的左边距，减少空白
      const firstStationPadding = index === 0 ? 0 : PADDING_LEFT
      return firstStationPadding + index * (ST_WIDTH + gap)
    }
    
    // 计算下排站点的位置（从右到左排列，终点站在左边第一个）
    const getBottomStationPosition = (index) => {
      const totalStations = stations.value.length
      const midPoint = Math.ceil(totalStations / 2)
      
      if (index < midPoint) return 0 // 上排站点，不在下排显示
      if (totalStations === 0) return PADDING_LEFT
      
      // 下排站点索引范围：midPoint 到 totalStations-1
      const bottomCount = totalStations - midPoint
      const bottomIndex = index - midPoint // 下排中的相对索引（0到bottomCount-1）
      
      if (bottomCount === 1) {
        // 只有一个下排站点（终点站），显示在左边第一个位置，使用更小的左边距
        return 0
      }
      
      // 计算间距，均匀分布在整个屏幕宽度上
      const gap = (rightEdgePosition.value - PADDING_LEFT - bottomCount * ST_WIDTH) / (bottomCount - 1)
      
      // 下排站点从右到左排列，终点站（最后一个站点）在左边第一个位置
      // 反转顺序：最后一个站点（bottomIndex = bottomCount - 1）应该在左边第一个位置
      const reversedIndex = bottomCount - 1 - bottomIndex
      // 第一个站点（reversedIndex === 0）使用更小的左边距，减少空白
      const firstStationPadding = reversedIndex === 0 ? 0 : PADDING_LEFT
      return firstStationPadding + reversedIndex * (ST_WIDTH + gap)
    }

    // 屏幕适配（窗口打开时检测分辨率和缩放）
    function fitScreen() {
      // 检测分辨率和缩放信息（类似显示器1的逻辑）
      const logicalWidth = window.screen.width || window.innerWidth
      const logicalHeight = window.screen.height || window.innerHeight
      const scaleFactor = window.devicePixelRatio || 1.0
      const physicalWidth = Math.round(logicalWidth * scaleFactor)
      const physicalHeight = Math.round(logicalHeight * scaleFactor)
      
      // 检测是否为4K或2K分辨率
      const is4KResolution = physicalWidth >= 3800 && physicalWidth <= 3900 && 
                             physicalHeight >= 2100 && physicalHeight <= 2200
      const is2KResolution = physicalWidth >= 2500 && physicalWidth <= 2600 && 
                             physicalHeight >= 1400 && physicalHeight <= 1500
      
      // 根据分辨率和缩放调整适配策略
      // 统一使用1.0的baseScale，确保内容完全填充窗口，避免白边
      let baseScale = 1.0
      
      // 计算基础缩放比例
      // 使用 Math.min 确保内容不超出窗口，但配合 baseScale 调整避免白边
      const widthRatio = window.innerWidth / SCREEN_WIDTH
      const heightRatio = window.innerHeight / SCREEN_HEIGHT
      let ratio = Math.min(widthRatio, heightRatio) * baseScale
      
      // 对所有情况都稍微增加缩放比例（1%），确保内容能够完全覆盖窗口，避免白边
      // 这样可以确保在不同分辨率和缩放比例下都能完全填充窗口
      ratio = ratio * 1.01
      
      scaleRatio.value = ratio
    }

    // 处理广播消息
    function handleBroadcastMessage(event) {
      const data = event.data
      if (!data) return
      
      if (data.t === 'SYNC') {
        wsFirstSyncReceived = true
        setWsAccessPromptVisible(false)
        appData.value = data.d
        if (data.r) {
          rt.value = { ...data.r }
        }
        // 如果包含设置信息，更新"下一站"页面显示时长、LED文字和水印
        if (data.settings && data.settings.display) {
          if (data.settings.display.display2UiVariant === 'classic' || data.settings.display.display2UiVariant === 'modern') {
            display2UiVariant.value = data.settings.display.display2UiVariant
          }
          if (data.settings.display.display2NextStationDuration !== undefined) {
            nextStationDuration.value = data.settings.display.display2NextStationDuration
          }
          if (data.settings.display.display2FooterLED !== undefined) {
            footerLED.value = data.settings.display.display2FooterLED || ''
          }
          if (data.settings.display.display2FooterWatermark !== undefined) {
            footerWatermark.value = data.settings.display.display2FooterWatermark !== false
          }
        }
      } else if (data.type === 'update_all') {
        wsFirstSyncReceived = true
        setWsAccessPromptVisible(false)
        appData.value = data.data
        if (data.rt) {
          rt.value = { ...data.rt }
        }
        // 如果包含设置信息，更新"下一站"页面显示时长、LED文字和水印
        if (data.settings && data.settings.display) {
          if (data.settings.display.display2UiVariant === 'classic' || data.settings.display.display2UiVariant === 'modern') {
            display2UiVariant.value = data.settings.display.display2UiVariant
          }
          if (data.settings.display.display2NextStationDuration !== undefined) {
            nextStationDuration.value = data.settings.display.display2NextStationDuration
          }
          if (data.settings.display.display2FooterLED !== undefined) {
            footerLED.value = data.settings.display.display2FooterLED || ''
          }
          if (data.settings.display.display2FooterWatermark !== undefined) {
            footerWatermark.value = data.settings.display.display2FooterWatermark !== false
          }
        }
      } else if (data.type === 'control') {
        handleControl(data.cmd)
      } else if (data.type === 'settings') {
        // 接收设置更新
        if (data.settings && data.settings.display) {
          if (data.settings.display.display2UiVariant === 'classic' || data.settings.display.display2UiVariant === 'modern') {
            display2UiVariant.value = data.settings.display.display2UiVariant
          }
          if (data.settings.display.display2NextStationDuration !== undefined) {
            nextStationDuration.value = data.settings.display.display2NextStationDuration
          }
          if (data.settings.display.display2FooterLED !== undefined) {
            footerLED.value = data.settings.display.display2FooterLED || ''
          }
          if (data.settings.display.display2FooterWatermark !== undefined) {
            footerWatermark.value = data.settings.display.display2FooterWatermark !== false
          }
        }
      }

      // 同步后刷新底栏滚动状态（仅做“布局/存在性”刷新，避免频繁 SYNC 导致跑马灯反复从头开始）
      nextTick(() => {
        updateLEDScroll({ restart: false })
      })
    }
    
    // 处理"下一站"页面显示逻辑
    function handleNextStationPageDisplay() {
      // 清除之前的定时器
      if (nextStationTimer) {
        clearTimeout(nextStationTimer)
        nextStationTimer = null
      }

      // modern UI：禁用“下一站”页面
      if (isModernUi.value) {
        forceShowNextStationPage.value = false
        stopNextStationBlink()
        return
      }
      
      // 如果收到出站信号（state === 1），启动定时器
      if (rt.value.state === 1 && stations.value.length > 0) {
        forceShowNextStationPage.value = true
        
        // 启动定时器，在指定时间后切回线路图并启动闪烁
        nextStationTimer = setTimeout(() => {
          forceShowNextStationPage.value = false
          nextStationTimer = null
          // "下一站"页面结束后，启动下一站圆点闪烁
          startNextStationBlink()
        }, nextStationDuration.value)
      } else {
        // 如果状态不是出站，立即隐藏"下一站"页面并停止闪烁
        forceShowNextStationPage.value = false
        stopNextStationBlink()
      }
    }
    
    // 处理"到站"页面显示逻辑
    function handleArrivalPageDisplay() {
      // 清除之前的定时器
      if (arrivalTimer) {
        clearTimeout(arrivalTimer)
        arrivalTimer = null
      }

      // modern UI：到站页改为信号驱动，不受时长限制
      // 仅在进站信号(state === 0)持续显示，收到出站信号(state === 1)后切走
      if (isModernUi.value) {
        forceShowArrivalPage.value = (rt.value.state === 0 && stations.value.length > 0)
        return
      }
      
      // 如果收到进站信号（state === 0），启动定时器
      if (rt.value.state === 0 && stations.value.length > 0) {
        forceShowArrivalPage.value = true
        
        // 启动定时器，在指定时间后切回线路图
        arrivalTimer = setTimeout(() => {
          forceShowArrivalPage.value = false
          arrivalTimer = null
        }, arrivalDuration.value)
      } else {
        // 如果状态不是进站，立即隐藏"到站"页面
        forceShowArrivalPage.value = false
      }
    }
    
    // 监听 rt.state 的变化
    watch(() => rt.value.state, (newState, oldState) => {
      handleNextStationPageDisplay()
      handleArrivalPageDisplay()
      // 如果状态改变，停止闪烁
      if (newState !== 1) {
        stopNextStationBlink()
      }
    })

    watch(
      [showNextStationPage, nextStationIdx, nextPageFiveStations],
      ([visible]) => {
        if (visible && rt.value.state === 1) {
          startNextPagePulse()
        } else {
          stopNextPagePulse()
        }
      },
      { deep: true }
    )

    // 更新LED滚动效果
    // restart=true: 强制从头开始（用于进/出站信号或文案切换）
    // restart=false: 仅保证元素/事件存在，不打断当前滚动（用于页面切换/水印/resize 等布局变化）
    function updateLEDScroll(options = {}) {
      const { restart = true } = options
      nextTick(() => {
        const ledContent = document.querySelector('.footer-led-content')
        if (!ledContent) return
        
        const ledContainer = document.querySelector('.footer-led')
        if (!ledContainer) return
        
        const text = displayedFooterLED.value || ''
        if (!text.trim()) {
          ledContent.onanimationiteration = null
          ledContent.classList.remove('scrolling')
          ledContent.style.animation = ''
          ledContent.style.animationDuration = ''
          ledContent.style.transform = ''
          ledContent.innerHTML = ''
          return
        }

        if (!restart) {
          // 不打断当前动画：只确保文案已渲染 + iteration 回调存在
          // 注意：避免修改 animationDuration（部分浏览器会导致动画重启）
          if (!ledContent.innerHTML) {
            ledContent.innerHTML = parseColorMarkup(text)
          }
          if (ledContent.classList.contains('scrolling') && !ledContent.onanimationiteration) {
            ledContent.onanimationiteration = () => {
              advanceFooterMessage()
            }
          }
          return
        }

        // restart: 移除之前的滚动类，并强制重置动画（确保每次从右侧重新出现）
        ledContent.onanimationiteration = null
        ledContent.classList.remove('scrolling')
        ledContent.style.animation = 'none'
        ledContent.style.animationDuration = ''
        ledContent.style.transform = ''

        // 每次先恢复为当前文案，避免历史拼接内容影响宽度计算
        ledContent.innerHTML = parseColorMarkup(text)

        // 强制 reflow：确保上面 classList/remove + animation=none 被浏览器应用
        // eslint-disable-next-line no-unused-expressions
        ledContent.offsetHeight
        ledContent.style.animation = ''

        const contentWidth = ledContent.scrollWidth
        const containerWidth = ledContainer.offsetWidth
        const scrollSpeed = 50 // 像素/秒
        const duration = (contentWidth + containerWidth + 40) / scrollSpeed
        ledContent.style.animationDuration = `${Math.max(8, Math.min(30, duration))}s`

        // 下一帧再加回滚动类，确保动画从 0% 重新开始（文字从右侧重新出现）
        requestAnimationFrame(() => {
          ledContent.classList.add('scrolling')
          // LED风格：每滚完一整屏再切下一句，避免中途换句
          ledContent.onanimationiteration = () => {
            advanceFooterMessage()
          }
        })
      })
    }
    
    // 监听底栏显示文字变化
    watch(displayedFooterLED, () => {
      updateLEDScroll()
    })

    // 监听轮播队列变化，校正当前索引并刷新滚动
    watch(footerMessageQueue, () => {
      const len = footerMessageQueue.value.length
      if (len <= 0) {
        footerRotateIndex.value = 0
      } else if (footerRotateIndex.value >= len) {
        footerRotateIndex.value = 0
      }
      nextTick(() => {
        updateLEDScroll()
      })
    }, { deep: true })

    // 收到新的进出站信号时，先显示信号文案（队列第1条）
    watch(() => rt.value.state, () => {
      footerRotateIndex.value = 0
      nextTick(() => {
        updateLEDScroll({ restart: true })
      })
    })

    // 底栏布局变化时也刷新滚动（例如页面切换/水印显示变化）
    watch([footerWatermark, showNextStationPage, showArrivalPage], () => {
      nextTick(() => {
        updateLEDScroll({ restart: false })
      })
    })
    
    // 处理控制命令
    function handleControl(cmd) {
      if (!appData.value || stations.value.length === 0) return
      
      if (cmd === 'next') {
        if (rt.value.state === 0) {
          rt.value.state = 1
        } else {
          rt.value.state = 0
          if (rt.value.idx < stations.value.length - 1) {
            rt.value.idx++
          } else {
            rt.value.idx = 0
          }
        }
      } else if (cmd === 'prev') {
        rt.value.state = 0
        if (rt.value.idx > 0) {
          rt.value.idx--
        }
      }
    }

    // 键盘事件处理
    function handleKeyDown(e) {
      const targetTag = e.target && e.target.tagName
      if (targetTag && ['INPUT', 'TEXTAREA', 'SELECT'].includes(targetTag)) return
      
      if (e.code === 'Space' || e.code === 'Enter') e.preventDefault()
      
      const ignore = new Set([
        'ShiftLeft', 'ShiftRight', 
        'ControlLeft', 'ControlRight', 
        'AltLeft', 'AltRight', 
        'MetaLeft', 'MetaRight',
        'CapsLock', 'NumLock', 'ScrollLock', 'ContextMenu'
      ])
      if (ignore.has(e.code)) return
      
      try {
        const normCode = e.code || e.key
        const normKey = e.key || e.code || null
        
        if (bc) {
          bc.postMessage({ t: 'CMD_KEY', code: e.code, key: e.key, normCode, normKey })
        }
        if (bcNew) {
          bcNew.postMessage({ t: 'CMD_KEY', code: e.code, key: e.key, normCode, normKey })
        }
        if (wsClient && wsClient.readyState === 1) {
          wsClient.send(JSON.stringify({ t: 'CMD_KEY', code: e.code, key: e.key, normCode, normKey }))
        }
      } catch (err) {
        console.warn('Keyboard event error', err)
      }
    }

    let wsClient = null
    let wsReconnectTimer = null
    let wsShouldRun = false

    // 浏览器环境下，多屏协同依赖 WS 与主程序同步；连接失败时显示提示弹窗
    let wsFirstSyncReceived = false
    let wsPromptTimer = null
    let wsPromptMutedUntil = 0
    const isExternalBrowserRenderMode = !(window && window.electronAPI)

    const ensureWsAccessPrompt = () => {
      let overlay = document.getElementById('display2-ws-access-prompt')
      if (overlay) return overlay

      overlay = document.createElement('div')
      overlay.id = 'display2-ws-access-prompt'
      overlay.style.position = 'fixed'
      overlay.style.inset = '0'
      overlay.style.zIndex = '10002'
      overlay.style.display = 'none'
      overlay.style.alignItems = 'center'
      overlay.style.justifyContent = 'center'
      overlay.style.background = 'rgba(0,0,0,0.45)'
      overlay.style.pointerEvents = 'auto'

      const card = document.createElement('div')
      card.style.width = 'min(860px, calc(100vw - 64px))'
      card.style.borderRadius = '12px'
      card.style.boxShadow = '0 4px 20px rgba(0,0,0,0.3)'
      card.style.background = 'rgba(255,255,255,0.98)'
      card.style.color = '#333'
      card.style.fontFamily = '"Microsoft YaHei", sans-serif'
      card.style.padding = '18px 20px'
      card.style.userSelect = 'none'
      card.innerHTML = `
        <div style="display:flex;align-items:center;gap:12px;">
          <div style="font-size:22px;font-weight:900;color:#ff5722;line-height:1;">⚠</div>
          <div style="flex:1;">
            <div style="font-size:16px;font-weight:900;">无法连接到客户端</div>
            <div id="display2-ws-access-prompt-reason" style="margin-top:4px;font-size:13px;color:#666;line-height:1.45;">正在等待客户端同步数据...</div>
          </div>
          <button id="display2-ws-access-prompt-close" style="width:32px;height:28px;border:0;border-radius:6px;background:rgba(0,0,0,0.06);cursor:pointer;font-size:18px;line-height:28px;color:#333;">×</button>
        </div>
        <div style="margin-top:12px;font-size:13px;color:#333;line-height:1.6;">
          <div>此显示页运行在浏览器中，需要启动客户端。</div>
          <div style="margin-top:6px;color:#666;">检查项：1、 客户端是否正常运行。 2、 设备在同一局域网。 3、 多屏协同 IP 地址正确。 </div>
        </div>
      `
      overlay.appendChild(card)
      document.body.appendChild(overlay)

      const closeBtn = overlay.querySelector('#display2-ws-access-prompt-close')
      if (closeBtn) {
        closeBtn.addEventListener('click', () => {
          overlay.style.display = 'none'
          wsPromptMutedUntil = Date.now() + 30000
        })
      }
      return overlay
    }

    const setWsAccessPromptVisible = (visible, reasonText) => {
      if (!isExternalBrowserRenderMode) return
      if (Date.now() < wsPromptMutedUntil) return
      const overlay = ensureWsAccessPrompt()
      if (!overlay) return
      if (visible) {
        const reasonEl = overlay.querySelector('#display2-ws-access-prompt-reason')
        if (reasonEl && typeof reasonText === 'string' && reasonText.trim()) {
          reasonEl.textContent = reasonText.trim()
        }
        overlay.style.display = 'flex'
      } else {
        overlay.style.display = 'none'
      }
    }

    const startWsAccessPromptWatchdog = () => {
      if (!isExternalBrowserRenderMode || !wsShouldRun) return
      if (wsPromptTimer) return
      setTimeout(() => {
        if (wsFirstSyncReceived) return
        setWsAccessPromptVisible(true, '尚未收到主程序同步数据（SYNC），请检查 WebSocket 连接/鉴权/网络。')
      }, 2500)
      wsPromptTimer = setInterval(() => {
        if (wsFirstSyncReceived) {
          setWsAccessPromptVisible(false)
          clearInterval(wsPromptTimer)
          wsPromptTimer = null
          return
        }
        setWsAccessPromptVisible(true, '仍未收到主程序同步数据（SYNC）。')
      }, 8000)
    }

    const connectWs = () => {
      if (!wsShouldRun) return
      const wsHost = (displayQuery.get('wsHost') || window.location.hostname || 'localhost').trim()
      const wsPort = (displayQuery.get('wsPort') || '9400').trim()
      const wsToken = String(displayQuery.get('wsToken') || displayQuery.get('token') || '').trim()
      if (!wsHost) return
      const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsUrl = (() => {
        const base = `${wsProto}//${wsHost}:${wsPort}`
        if (!wsToken) return base
        try {
          const u = new URL(base)
          u.searchParams.set('token', wsToken)
          return u.toString()
        } catch (e) {
          return `${base}/?token=${encodeURIComponent(wsToken)}`
        }
      })()
      try {
        wsClient = new WebSocket(wsUrl)
      } catch (e) {
        wsClient = null
        if (!wsFirstSyncReceived) {
          setWsAccessPromptVisible(true, 'WebSocket 创建失败，请检查 wsHost/wsPort/网络。')
        }
        return
      }
      wsClient.onopen = () => {
        if (wsToken) {
          try { wsClient.send(JSON.stringify({ t: 'HELLO', token: wsToken, meta: { system: 'browser-display' } })) } catch (e) {}
        }
        try { wsClient.send(JSON.stringify({ t: 'REQ' })) } catch (e) {}
      }
      wsClient.onmessage = (event) => {
        let data = null
        try {
          data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
        } catch (e) {
          data = null
        }
        if (data) {
          if (data.t === 'AUTH_REQUIRED') {
            console.warn('[WS] 需要鉴权：请在 URL 添加 wsToken=... 或关闭主程序 METRO_PIDS_WS_TOKEN')
            setWsAccessPromptVisible(true, 'WebSocket 需要鉴权：请在 URL 添加 wsToken=...')
          }
          handleBroadcastMessage({ data })
        }
      }
      wsClient.onclose = () => {
        wsClient = null
        if (!wsShouldRun) return
        if (wsReconnectTimer) clearTimeout(wsReconnectTimer)
        wsReconnectTimer = setTimeout(connectWs, 1500)
        if (!wsFirstSyncReceived) {
          setWsAccessPromptVisible(true, 'WebSocket 已断开，正在重连...')
        }
      }
      wsClient.onerror = () => {
        try { wsClient && wsClient.close() } catch (e) {}
        if (!wsFirstSyncReceived) {
          setWsAccessPromptVisible(true, 'WebSocket 连接错误，正在重试...')
        }
      }
    }

    const closeWs = () => {
      wsShouldRun = false
      if (wsReconnectTimer) {
        clearTimeout(wsReconnectTimer)
        wsReconnectTimer = null
      }
      if (wsClient) {
        try { wsClient.close() } catch (e) {}
        wsClient = null
      }
    }

    // ============ 生命周期 ============
    onMounted(() => {
      if (window.electronAPI && window.electronAPI.platform) {
        platform.value = window.electronAPI.platform
      }
      
      // 初始化 BroadcastChannel
      try {
        bc = new BroadcastChannel('metro_pids_channel')
        bc.onmessage = handleBroadcastMessage
        bc.postMessage({ type: 'REQ' })
      } catch (e) {
        console.warn('BroadcastChannel (metro_pids_channel) not supported', e)
      }
      
      try {
        bcNew = new BroadcastChannel('metro_pids_v3')
        bcNew.onmessage = handleBroadcastMessage
        bcNew.postMessage({ t: 'REQ' })
      } catch (e) {
        console.warn('BroadcastChannel (metro_pids_v3) not supported', e)
      }

      const wsEnabled = ['1', 'true', 'yes', 'on'].includes(String(displayQuery.get('ws') || '').toLowerCase())
      if (wsEnabled) {
        wsShouldRun = true
        connectWs()
        startWsAccessPromptWatchdog()
      }
      
      // 监听 window.postMessage（用于接收主程序发送的数据）
      window.addEventListener('message', (event) => {
        if (event.data && event.data.t === 'SYNC') {
          handleBroadcastMessage({ data: event.data })
        }
      })
      
      fitScreen()
      updateNowClock()
      if (clockTimer) {
        clearInterval(clockTimer)
        clockTimer = null
      }
      clockTimer = setInterval(updateNowClock, 1000)

      // 初始化时触发一次底栏滚动计算
      nextTick(() => {
        updateLEDScroll({ restart: true })
      })
      
      // 初始化时检查是否需要显示"下一站"或"到站"页面
      handleNextStationPageDisplay()
      handleArrivalPageDisplay()
      console.log('[Display-2] 屏幕适配完成，缩放比例:', scaleRatio.value)
      window.addEventListener('resize', () => {
        fitScreen()
        updateLEDScroll({ restart: false }) // 窗口大小变化时仅做布局刷新，避免跑马灯跳回开头
        console.log('[Display-2] 窗口大小变化，新尺寸:', window.innerWidth, 'x', window.innerHeight, '缩放比例:', scaleRatio.value)
      })
      document.addEventListener('keydown', handleKeyDown)
    })

    onBeforeUnmount(() => {
      // 清除定时器
      if (nextStationTimer) {
        clearTimeout(nextStationTimer)
        nextStationTimer = null
      }
      
      if (arrivalTimer) {
        clearTimeout(arrivalTimer)
        arrivalTimer = null
      }
      if (clockTimer) {
        clearInterval(clockTimer)
        clockTimer = null
      }
      
      // 清除闪烁定时器
      stopNextStationBlink()
      stopNextPagePulse()
      
      if (bc) {
        bc.close()
        bc = null
      }
      if (bcNew) {
        bcNew.close()
        bcNew = null
      }
      closeWs()
      window.removeEventListener('resize', fitScreen)
      document.removeEventListener('keydown', handleKeyDown)

      if (wsPromptTimer) {
        clearInterval(wsPromptTimer)
        wsPromptTimer = null
      }
    })

    return {
      appData,
      rt,
      scaleRatio,
      platform,
      isDarwin,
      isLinux,
      stations,
      lineNumber,
      routeNumber,
      routeDirection,
      modernHeaderFrom,
      modernHeaderTo,
      modernHeaderDate,
      modernHeaderTime,
      lineNameHTML,
      activeStationIdx,
      showNextStationPage,
      nextStationName,
      showArrivalPage,
      currentStationName,
      ST_WIDTH,
      stationGap,
      getStationPosition,
      getTopStationPosition,
      getBottomStationPosition,
      allStationsWithRow,
      getStationClass,
      isCurrentStation,
      getStationDotClass,
      nextStationIdx,
      rightEdgePosition,
      semicircleRadius,
      semicirclePath,
      SCREEN_WIDTH,
      SCREEN_HEIGHT,
      PADDING,
      PADDING_RIGHT,
      PADDING_LEFT,
      isModernUi,
      footerLED,
      modernDepartureStops,
      modernArrivalRows,
      modernSingleRowStations,
      modernSingleRowSegments,
      getModernSingleSegmentStyle,
      modernTwoRowStations,
      modernTwoRowSegments,
      getModernTwoRowSegmentStyle,
      displayedFooterLED,
      useTwoRowLayout,
      footerWatermark,
      display2UiVariantClass,
      nextPageFiveStations,
      nextPageLineSegments,
      nextPageBoundaryFlags,
      nextPageOutOfRange,
      nextPagePulseVisible,
      nextPagePulseDotStyle,
      nextPagePulseTrailStyle,
      parseColorMarkup
    }
  },
  template: `
    <div id="display-app" :class="display2UiVariantClass">
      <div id="scaler" :style="{ transform: 'scale(' + scaleRatio + ')' }">
        <!-- Custom Title Bar -->
        <div id="display-titlebar" class="custom-titlebar" :class="{ darwin: isDarwin, linux: isLinux }">
          <div style="
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 0 8px;
          ">
            <i class="fas fa-subway" style="
              color: currentColor;
              font-size: 14px;
            "></i>
            <span style="
              font-size: 13px;
              font-weight: 600;
              color: currentColor;
              white-space: nowrap;
            ">Metro PIDS - Display 2</span>
          </div>
        </div>
        
        <!-- Header: 深蓝色背景，显示路线信息和图例 -->
        <div class="header">
          <template v-if="isModernUi">
            <div class="modern-header-left">
              <div class="modern-header-date">{{ modernHeaderDate }}</div>
              <div class="modern-header-time">{{ modernHeaderTime }}</div>
            </div>
            <div class="modern-header-center">
              <span class="modern-header-line" v-html="lineNameHTML"></span>
              <span class="modern-header-from">{{ modernHeaderFrom }}</span>
              <span class="modern-header-arrow" aria-hidden="true">
                <span class="modern-header-arrow-bar"></span>
                <span class="modern-header-arrow-head"></span>
              </span>
              <span class="modern-header-to">{{ modernHeaderTo }}</span>
            </div>
          </template>
          <template v-else>
          <div class="header-left">
            <span class="header-route" v-html="lineNameHTML"></span>
            <span class="header-direction">{{ routeDirection }}</span>
          </div>
          
          <div class="legend">
            <div class="legend-item">
              <div class="legend-dot passed"></div>
              <span class="legend-text">已过站</span>
            </div>
            <div class="legend-item">
              <div class="legend-dot future"></div>
              <span class="legend-text">未过站</span>
            </div>
          </div>
          </template>
        </div>

        <!-- 下一站页面：全屏白色，仅在出站信号时显示 -->
        <div v-if="showNextStationPage" class="next-station-page next-station-route-page">
          <template v-if="isModernUi">
            <div class="modern-next-wrapper">
              <div class="modern-next-header">
                <span class="modern-next-label">下一站</span>
                <span class="modern-next-name">{{ nextStationName || '--' }}</span>
              </div>
              <div class="modern-next-track">
                <div
                  v-for="(node, idx) in modernDepartureStops"
                  :key="node.key"
                  class="modern-next-node"
                  :class="'state-' + node.state"
                >
                  <div class="modern-next-station-name">{{ node.name }}</div>
                  <div class="modern-next-dot"></div>
                  <div v-if="idx < modernDepartureStops.length - 1" class="modern-next-arrow">➜</div>
                </div>
              </div>
            </div>
          </template>
          <template v-else>
          <div class="next-page-title">
            <span class="next-page-title-label">下一站：</span>
            <span class="next-page-title-name">{{ nextStationName || '--' }}</span>
          </div>
          <div class="next-page-route-card" :class="{ segmented: nextPageOutOfRange }">
            <div class="next-page-segments">
              <div
                v-for="segment in nextPageLineSegments"
                :key="segment.id"
                class="next-page-segment"
                :class="['state-' + segment.state, { 'force-solid-line': segment.forceSolid }]"
                :style="{ left: segment.left, width: segment.width }"
              ></div>
              <div
                v-if="nextPagePulseVisible"
                class="next-page-pulse-trail"
                :style="nextPagePulseTrailStyle"
              ></div>
              <div
                v-if="nextPagePulseVisible"
                class="next-page-pulse-dot"
                :style="nextPagePulseDotStyle"
              ></div>
            </div>
            <div class="next-page-stations">
              <div
                v-for="node in nextPageFiveStations"
                :key="node.slot"
                class="next-page-station"
                :class="['slot-' + node.slot, 'state-' + node.state, { 'forced-left-red': nextPageBoundaryFlags.omittedLeft && node.slot === 'first' }]"
              >
                <div class="next-page-dot"></div>
                <div class="next-page-station-name">{{ node.name }}</div>
              </div>
            </div>
          </div>
          </template>
        </div>

        <!-- 到站页面：全屏白色，仅在进站信号时显示 -->
        <div v-else-if="showArrivalPage" class="next-station-page arrival-page">
          <template v-if="isModernUi">
            <div class="modern-next-wrapper modern-next-wrapper-arrival">
              <div class="modern-next-track">
                <div
                  v-for="(node, idx) in modernDepartureStops"
                  :key="'arr-' + node.key"
                  class="modern-next-node"
                  :class="'state-' + node.state"
                >
                  <div class="modern-next-station-name">{{ node.name }}</div>
                  <div class="modern-next-dot"></div>
                  <div v-if="idx < modernDepartureStops.length - 1" class="modern-next-arrow">➜</div>
                </div>
              </div>
            </div>
          </template>
          <template v-else>
          <div class="next-station-content" style="flex-direction: column; align-items: center;">
            <div>
              <span class="next-station-label">到站：</span>
              <span class="next-station-name">{{ currentStationName }}</span>
            </div>
            <div class="arrival-tip">
              请停稳后再起身，下车注意观察后方
            </div>
          </div>
          </template>
        </div>

        <!-- 线路区域：正常显示线路图 -->
        <div v-else class="route-map" :class="{ 'use-two-rows': useTwoRowLayout }">
          <template v-if="isModernUi">
            <div class="modern-arrival-wrapper modern-arrival-wrapper-route">
              <template v-if="!useTwoRowLayout">
                <div class="modern-arrival-row modern-arrival-row-single">
                  <div class="modern-arrival-segments" aria-hidden="true">
                    <span
                      v-for="seg in modernSingleRowSegments"
                      :key="'route-seg-' + seg.key"
                      class="modern-arrival-segment"
                      :class="'state-' + seg.state"
                      :style="getModernSingleSegmentStyle(seg.idx)"
                    ></span>
                  </div>
                  <div
                    v-for="(node, idx) in modernSingleRowStations"
                    :key="'route-single-' + node.idx"
                    class="modern-arrival-node"
                    :class="'state-' + node.state"
                  >
                    <div class="modern-arrival-dot"></div>
                    <div class="modern-arrival-name">{{ node.name }}</div>
                  </div>
                </div>
              </template>
              <template v-else>
                <div class="modern-arrival-row modern-arrival-row-top">
                  <div class="modern-arrival-segments" aria-hidden="true">
                    <span
                      v-for="seg in modernTwoRowSegments.top"
                      :key="'top-seg-' + seg.key"
                      class="modern-arrival-segment"
                      :class="'state-' + seg.state"
                      :style="getModernTwoRowSegmentStyle(seg.idx, 'top')"
                    ></span>
                  </div>
                  <div
                    v-for="(node, idx) in modernTwoRowStations.top"
                    :key="'route-top-' + node.idx"
                    class="modern-arrival-node"
                    :class="'state-' + node.state"
                  >
                    <div class="modern-arrival-dot"></div>
                    <div class="modern-arrival-name">{{ node.name }}</div>
                  </div>
                </div>

                <div class="modern-arrival-row modern-arrival-row-bottom">
                  <div class="modern-arrival-segments" aria-hidden="true">
                    <span
                      v-for="seg in modernTwoRowSegments.bottom"
                      :key="'bot-seg-' + seg.key"
                      class="modern-arrival-segment"
                      :class="'state-' + seg.state"
                      :style="getModernTwoRowSegmentStyle(seg.idx, 'bottom')"
                    ></span>
                  </div>
                  <div
                    v-for="(node, idx) in modernTwoRowStations.bottom"
                    :key="'route-bot-' + node.idx"
                    class="modern-arrival-node"
                    :class="'state-' + node.state"
                  >
                    <div class="modern-arrival-dot"></div>
                    <div class="modern-arrival-name">{{ node.name }}</div>
                  </div>
                </div>
              </template>
            </div>
          </template>
          <template v-else>
          <!-- 上排站点 - 前半部分站点从左到右排列（覆盖整个屏幕宽度） -->
          <div class="station-row row-top">
            <div 
              v-for="station in allStationsWithRow" 
              :key="'top-' + station.index"
              v-show="station.isTopRow"
              class="station"
              :class="{ 'passed': station.isPassed, 'future': !station.isPassed }"
              :style="{ left: getTopStationPosition(station.index) + 'px' }"
            >
              <span class="station-name" :class="{ 'next-station-name-red': station.isNextStation, 'station-name-two-column': station.isTwoColumn }" v-html="station.formattedName"></span>
              <div class="station-dot" :class="getStationDotClass(station.index)"></div>
            </div>
          </div>

          <!-- 轨道线条 - 半胶囊形状（半圆在右边边缘） -->
          <div class="track-lines">
            <!-- 上排路线：从左到右边边缘 -->
            <div 
              class="track-line-top" 
              :style="{ 
                width: (rightEdgePosition - PADDING_LEFT) + 'px' 
              }"
            ></div>
            
            <!-- 右边半圆连接（使用显示器1的环线实现方式） -->
            <svg 
              class="track-semicircle-svg"
              :style="{ 
                position: 'absolute',
                left: '0',
                top: '0',
                width: '100%',
                height: '100%',
                overflow: 'visible',
                zIndex: '1'
              }"
            >
              <!-- 使用显示器1的路径绘制方式 -->
              <path 
                :d="semicirclePath"
                stroke="#4ade80"
                stroke-width="4"
                fill="none"
                stroke-linecap="round"
              />
            </svg>
            
            <!-- 下排路线：从右边边缘向左延伸 -->
            <div 
              class="track-line-bottom" 
              :style="{ 
                left: PADDING_LEFT + 'px',
                width: (rightEdgePosition - PADDING_LEFT) + 'px'
              }"
            >
              <div class="arrow-left-bottom"></div>
            </div>
          </div>

          <!-- 下排站点 - 后半部分站点从右到左排列（覆盖整个屏幕宽度） -->
          <div class="station-row row-bottom">
            <div 
              v-for="station in allStationsWithRow" 
              :key="'bottom-' + station.index"
              v-show="!station.isTopRow"
              class="station"
              :class="{ 'passed': station.isPassed, 'future': !station.isPassed }"
              :style="{ left: getBottomStationPosition(station.index) + 'px' }"
            >
              <div class="station-dot" :class="getStationDotClass(station.index)"></div>
              <span class="station-name" :class="{ 'next-station-name-red': station.isNextStation, 'station-name-two-column': station.isTwoColumn }" v-html="station.formattedName"></span>
            </div>
          </div>
          </template>
        </div>

        <!-- Footer: 深蓝色底栏 -->
        <div class="footer">
          <!-- LED滚动文字 -->
          <div v-if="displayedFooterLED" class="footer-led">
            <div class="footer-led-content" v-html="parseColorMarkup(displayedFooterLED)"></div>
          </div>
          <!-- 水印 -->
          <div v-if="footerWatermark" class="footer-watermark">
            <div class="watermark-item">Metro PIDS</div>
            <div class="watermark-item">Display 2</div>
          </div>
        </div>
      </div>
    </div>
  `
}
