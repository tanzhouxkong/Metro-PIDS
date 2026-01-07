import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'

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

    // BroadcastChannel
    let bc = null
    let bcNew = null

    // ============ 计算属性 ============
    const themeColor = computed(() => {
      return appData.value?.meta?.themeColor || '#009F4D'
    })

    const lineNumber = computed(() => {
      if (!appData.value?.meta?.lineName) return '--'
      const num = appData.value.meta.lineName.replace(/[^0-9]/g, '')
      return num || appData.value.meta.lineName
    })

    const stations = computed(() => {
      return appData.value?.stations || []
    })

    const destinationCn = computed(() => {
      if (stations.value.length === 0) return '--'
      return stations.value[stations.value.length - 1].name || '--'
    })

    const destinationEn = computed(() => {
      if (stations.value.length === 0) return '--'
      return stations.value[stations.value.length - 1].en || '--'
    })

    const activeStationIdx = computed(() => {
      if (stations.value.length === 0) return 0
      if (rt.value.state === 1) {
        return Math.min(rt.value.idx + 1, stations.value.length - 1)
      }
      return rt.value.idx
    })

    const nextStopCn = computed(() => {
      if (stations.value.length === 0) return '--'
      return stations.value[activeStationIdx.value]?.name || '--'
    })

    const nextStopEn = computed(() => {
      if (stations.value.length === 0) return '--'
      return stations.value[activeStationIdx.value]?.en || '--'
    })

    const isArriving = computed(() => {
      return rt.value.state === 0
    })

    const nextStopLabel = computed(() => {
      return isArriving.value ? '当前到达 Arriving' : '即将到达 Next Stop'
    })

    const currentCarriage = computed(() => {
      return '3号车厢'
    })

    const doorWillOpen = computed(() => {
      if (!appData.value || stations.value.length === 0) return false
      const currentStation = stations.value[rt.value.idx]
      if (!currentStation) return false
      // 检查车门方向
      const door = currentStation._effectiveDoor || currentStation.door || 'left'
      return door === 'right'
    })

    const doorTextCn = computed(() => {
      return doorWillOpen.value ? '对侧开门' : '左侧开门'
    })

    const doorTextEn = computed(() => {
      return doorWillOpen.value ? 'Opposite Door' : 'Left Door'
    })

    // 地图相关计算
    const SCREEN_WIDTH = 1900 // 屏幕宽度
    const MARGIN = 100 // 左右边距（各50px）
    const AVAILABLE_WIDTH = SCREEN_WIDTH - MARGIN // 可用宽度
    
    // 根据站点数量动态计算站间距，使得所有站点都能显示在屏幕上
    const ST_WIDTH = computed(() => {
      if (stations.value.length === 0) return 160
      // 最后一个站点需要半个宽度，第一个站点也需要半个宽度
      // 所以总宽度 = (stations.length - 1) * ST_WIDTH + ST_WIDTH = stations.length * ST_WIDTH
      return AVAILABLE_WIDTH / stations.value.length
    })

    // 基于主题色生成渐变色变体的函数
    function hexToRgb(hex) {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
      return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
      } : { r: 0, g: 158, b: 77 } // 默认绿色
    }

    function rgbToHex(r, g, b) {
      return '#' + [r, g, b].map(x => {
        const hex = Math.round(x).toString(16)
        return hex.length === 1 ? '0' + hex : hex
      }).join('')
    }

    function adjustBrightness(hex, percent) {
      const rgb = hexToRgb(hex)
      const r = Math.min(255, Math.max(0, rgb.r * (1 + percent)))
      const g = Math.min(255, Math.max(0, rgb.g * (1 + percent)))
      const b = Math.min(255, Math.max(0, rgb.b * (1 + percent)))
      return rgbToHex(r, g, b)
    }

    function adjustSaturation(hex, percent) {
      const rgb = hexToRgb(hex)
      const gray = rgb.r * 0.299 + rgb.g * 0.587 + rgb.b * 0.114
      const r = Math.min(255, Math.max(0, gray + (rgb.r - gray) * (1 + percent)))
      const g = Math.min(255, Math.max(0, gray + (rgb.g - gray) * (1 + percent)))
      const b = Math.min(255, Math.max(0, gray + (rgb.b - gray) * (1 + percent)))
      return rgbToHex(r, g, b)
    }

    // 基于主题色生成相邻段的渐变颜色（相邻段有轻微差异，但整体保持统一）
    const segmentColors = computed(() => {
      const baseColor = themeColor.value || '#009F4D'
      
      // 生成6组渐变色，每组内部有轻微渐变（从稍深到稍浅）
      // 相邻组之间有非常轻微的颜色差异（±2-3%亮度），保持整体统一感
      const brightnessOffsets = [
        0,      // 基准色
        0.02,   // +2%亮度（非常轻微）
        -0.02,  // -2%亮度（非常轻微）
        0.03,   // +3%亮度
        -0.01,  // -1%亮度
        0.02,   // +2%亮度
      ]

      return brightnessOffsets.map(offset => {
        // 每段内部有轻微渐变：从基准色-5%到基准色+5%
        const color1 = adjustBrightness(baseColor, offset - 0.05) // 稍深（-5%）
        const color2 = adjustBrightness(baseColor, offset + 0.05) // 稍浅（+5%）
        return [color1, color2]
      })
    })

    const railWidth = computed(() => {
      if (stations.value.length === 0) return 0
      // 轨道宽度等于所有站点占用的宽度
      return stations.value.length * ST_WIDTH.value
    })

    // 线路条高度，根据站点间距按比例计算（原始比例：24/160 = 0.15）
    const railHeight = computed(() => {
      return ST_WIDTH.value * 0.15
    })

    // 箭头大小，根据站点间距按比例计算
    const arrowSize = computed(() => {
      return ST_WIDTH.value * 0.15 // 箭头高度（border-top/bottom）
    })

    // 箭头宽度，根据站点间距按比例计算（原始比例：30/160 = 0.1875）
    const arrowWidth = computed(() => {
      return ST_WIDTH.value * 0.1875 // 箭头宽度（border-left）
    })

    // 计算每段线路的信息
    const railSegments = computed(() => {
      if (stations.value.length < 2) return []
      
      const colors = segmentColors.value
      const stWidth = ST_WIDTH.value
      const segments = []
      for (let i = 0; i < stations.value.length - 1; i++) {
        // 站点中心位置
        const station1Center = (i * stWidth) + (stWidth / 2)
        const station2Center = ((i + 1) * stWidth) + (stWidth / 2)
        const fullWidth = station2Center - station1Center
        
        const segmentColor = colors[i % colors.length]
        
        // 判断这段是否已通过
        const isPassed = i < activeStationIdx.value
        // 判断是否是当前运行的段
        const isCurrent = rt.value.state === 1 && i === rt.value.idx
        
        let segmentLeft, segmentWidth
        
        // 第一个线段：从第一个站点中心开始，只显示到中间位置
        // 第一个站点占据 0 到 stWidth，中心在 stWidth/2
        // 线段从 stWidth/2 开始，宽度是 fullWidth * 0.5 = stWidth * 0.5
        // 结束位置是 stWidth，不会延伸到第一个站点之前（0位置）
        if (i === 0) {
          segmentLeft = station1Center // stWidth / 2
          segmentWidth = fullWidth * 0.5 // stWidth * 0.5
          // 确保线段不会延伸到第一个站点之前（位置0）
          // 线段从 stWidth/2 开始，宽度是 stWidth/2，结束在 stWidth，这是正确的
        }
        // 最后一个线段：从中间位置开始，到最后一个站点中心结束
        // 最后一个站点占据 (stations.length - 1) * stWidth 到 stations.length * stWidth
        // 中心在 (stations.length - 1) * stWidth + stWidth / 2
        // 线段从 (stations.length - 1) * stWidth 开始，宽度是 stWidth * 0.5
        // 结束在最后一个站点中心，不会延伸到最后一个站点之后
        else if (i === stations.value.length - 2) {
          segmentLeft = station1Center + (fullWidth * 0.5) // (stations.length - 1) * stWidth
          segmentWidth = fullWidth * 0.5 // stWidth * 0.5
          // 确保线段不会延伸到最后一个站点之后
          // 线段从 (stations.length - 1) * stWidth 开始，宽度是 stWidth/2
          // 结束在 (stations.length - 1) * stWidth + stWidth/2 = 最后一个站点中心，这是正确的
        }
        // 中间线段：显示中间50%的部分
        else {
          segmentWidth = fullWidth * 0.5
          segmentLeft = station1Center + (fullWidth * 0.25)
        }
        
        segments.push({
          index: i,
          left: segmentLeft,
          width: segmentWidth,
          colors: segmentColor,
          isPassed: isPassed,
          isCurrent: isCurrent,
          progress: 1 // 所有段都完整显示（100%），通过颜色区分状态
        })
      }
      return segments
    })

    const progressWidth = computed(() => {
      if (stations.value.length === 0) return 0
      
      const stWidth = ST_WIDTH.value
      let progressPx = 0
      
      if (rt.value.state === 0) {
        // 到站状态：箭头指向 activeIdx 圆心
        progressPx = (activeStationIdx.value * stWidth) + (stWidth / 2)
      } else {
        // 运行状态：箭头指向两站中间
        const startX = (rt.value.idx * stWidth) + (stWidth / 2)
        const endX = ((rt.value.idx + 1) * stWidth) + (stWidth / 2)
        progressPx = startX + (endX - startX) * 0.6 // 走到 60% 位置
      }
      
      return progressPx + 15 // +15px 让箭头尖端盖住圆心
    })

    // 摄像机固定，不移动 - 轨道居中显示
    const trackTranslateX = computed(() => {
      if (stations.value.length === 0) return 0
      // 让轨道在屏幕上居中显示
      // track-wrap 从屏幕中心开始（padding-left: 50vw），轨道内容需要偏移到居中
      const screenCenter = SCREEN_WIDTH / 2
      const trackCenter = railWidth.value / 2
      // 计算偏移量：让轨道中心对齐屏幕中心
      return screenCenter - trackCenter
    })

    // ============ 方法 ============
    function getStationClass(index) {
      if (index < activeStationIdx.value) {
        return 'passed'
      } else if (index === activeStationIdx.value) {
        return 'active'
      } else {
        return 'future'
      }
    }

    // 获取段的背景样式
    function getSegmentBackground(segment) {
      const [color1, color2] = segment.colors
      
      // 已通过的段：显示灰色
      if (segment.isPassed) {
        return 'linear-gradient(to right, #d0d0d0, #e0e0e0)' // 灰色渐变
      }
      
      // 未来段：显示高亮（使用原始颜色）
      return `linear-gradient(to right, ${color1}, ${color2})`
    }

    // 计算线段上三个箭头的位置（相对于线段起点）
    function getSegmentArrows(segment) {
      const arrows = []
      // 将线段分成4等份，箭头在1/4, 2/4, 3/4位置
      for (let i = 1; i <= 3; i++) {
        arrows.push({
          left: segment.width * i / 4 // 相对于线段起点的位置
        })
      }
      return arrows
    }

    // 获取已通过段的压暗颜色
    function getDimmedColor(color) {
      return adjustBrightness(color, -0.4) // 降低40%亮度
    }

    function fitScreen() {
      const ratio = Math.min(window.innerWidth / 1900, window.innerHeight / 600)
      scaleRatio.value = ratio
    }

    function handleBroadcastMessage(event) {
      const data = event.data
      if (!data) return
      
      // 兼容两种消息格式
      if (data.t === 'SYNC') {
        // 新格式：{ t: 'SYNC', d: appData, r: rt }
        appData.value = data.d
        if (data.r) {
          rt.value = { ...data.r }
        }
      } else if (data.type === 'update_all') {
        // 旧格式：{ type: 'update_all', data: appData, rt: rt }
        appData.value = data.data
        if (data.rt) {
          rt.value = { ...data.rt }
        }
      } else if (data.type === 'control') {
        // 控制命令
        handleControl(data.cmd)
      }
    }

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

    // 键盘事件规范化函数
    function normalizeKeyNameGlobal(name) {
      if (!name) return name
      const s = String(name)
      if (s === 'NumpadEnter') return 'Enter'
      if (s === ' ' || s.toLowerCase() === 'spacebar') return 'Space'
      if (/^space$/i.test(s)) return 'Space'
      if (/^[a-zA-Z]$/.test(s)) return 'Key' + s.toUpperCase()
      return s
    }

    // 键盘事件处理
    function handleKeyDown(e) {
      const targetTag = e.target && e.target.tagName
      // 忽略输入框中的按键
      if (targetTag && ['INPUT', 'TEXTAREA', 'SELECT'].includes(targetTag)) return
      
      // 阻止Space和Enter的默认行为
      if (e.code === 'Space' || e.code === 'Enter') e.preventDefault()
      
      // 忽略修饰键
      const ignore = new Set([
        'ShiftLeft', 'ShiftRight', 
        'ControlLeft', 'ControlRight', 
        'AltLeft', 'AltRight', 
        'MetaLeft', 'MetaRight',
        'CapsLock', 'NumLock', 'ScrollLock', 'ContextMenu'
      ])
      if (ignore.has(e.code)) return
      
      try {
        const normCode = normalizeKeyNameGlobal(e.code || e.key)
        const normKey = normalizeKeyNameGlobal(e.key || e.code || null)
        
        // 通过BroadcastChannel发送按键事件到控制端
        if (bc) {
          bc.postMessage({ t: 'CMD_KEY', code: e.code, key: e.key, normCode, normKey })
        }
        if (bcNew) {
          bcNew.postMessage({ t: 'CMD_KEY', code: e.code, key: e.key, normCode, normKey })
        }
      } catch (err) {
        // 忽略异常
        console.warn('Keyboard event error', err)
      }
    }

    // ============ 生命周期 ============
    onMounted(() => {
      // 获取平台信息
      if (window.electronAPI && window.electronAPI.platform) {
        platform.value = window.electronAPI.platform
      }
      
      // 初始化 BroadcastChannel - 兼容两种channel名称
      try {
        bc = new BroadcastChannel('metro_pids_channel')
        bc.onmessage = handleBroadcastMessage
        // 请求初始数据（旧格式）
        bc.postMessage({ type: 'REQ' })
      } catch (e) {
        console.warn('BroadcastChannel (metro_pids_channel) not supported', e)
      }
      
      // 同时监听新格式的channel
      try {
        bcNew = new BroadcastChannel('metro_pids_v3')
        bcNew.onmessage = handleBroadcastMessage
        // 请求初始数据（新格式）
        bcNew.postMessage({ t: 'REQ' })
      } catch (e) {
        console.warn('BroadcastChannel (metro_pids_v3) not supported', e)
      }
      
      // 窗口大小适配
      fitScreen()
      window.addEventListener('resize', fitScreen)
      
      // 添加键盘事件监听
      document.addEventListener('keydown', handleKeyDown)
    })

    onBeforeUnmount(() => {
      if (bc) {
        bc.close()
        bc = null
      }
      if (bcNew) {
        bcNew.close()
        bcNew = null
      }
      window.removeEventListener('resize', fitScreen)
      document.removeEventListener('keydown', handleKeyDown)
    })

    // 监听主题色变化，更新CSS变量
    watch(themeColor, (newColor) => {
      document.documentElement.style.setProperty('--theme', newColor)
    }, { immediate: true })

    return {
      appData,
      rt,
      scaleRatio,
      themeColor,
      lineNumber,
      stations,
      destinationCn,
      destinationEn,
      activeStationIdx,
      nextStopCn,
      nextStopEn,
      isArriving,
      nextStopLabel,
      currentCarriage,
      doorWillOpen,
      doorTextCn,
      doorTextEn,
      railWidth,
      progressWidth,
      trackTranslateX,
      railSegments,
      getStationClass,
      getSegmentBackground,
      getSegmentArrows,
      getDimmedColor,
      ST_WIDTH,
      railHeight,
      arrowSize,
      arrowWidth
    }
  },
  template: `
    <div id="display-app">
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
              color: #fff;
              font-size: 14px;
            "></i>
            <span style="
              font-size: 13px;
              font-weight: 600;
              color: #fff;
              white-space: nowrap;
            ">Metro PIDS - Jinan Display</span>
          </div>
        </div>
        <!-- Header -->
        <div class="header">
          <div class="h-left">
            <div class="logo-box"><i class="fas fa-subway"></i></div>
            <div class="logo-txt">
              <span class="lt-cn">济南地铁</span>
              <span class="lt-en">JINAN METRO</span>
            </div>
            <div class="line-tag" :style="{ background: themeColor }">
              <span class="ln-num">{{ lineNumber }}</span>
              <div class="ln-lbl"><span>号线</span><span>Line</span></div>
            </div>
          </div>

          <div class="h-center">
            <div class="info-col">
              <span class="lbl">开往 Bound for</span>
              <span class="val" :style="{ color: themeColor }">{{ destinationCn }}</span>
              <span class="val-en" :style="{ color: themeColor }">{{ destinationEn }}</span>
            </div>
            <div class="info-col">
              <span class="lbl">{{ nextStopLabel }}</span>
              <span 
                class="val" 
                :class="{ blink: isArriving }"
                :style="{ color: themeColor }"
              >
                {{ nextStopCn }}
              </span>
              <span 
                class="val-en" 
                :class="{ blink: isArriving }"
                :style="{ color: themeColor }"
              >
                {{ nextStopEn }}
              </span>
            </div>
            <div class="info-col">
              <span class="lbl">您当前在 Current Carriage</span>
              <span class="val black">{{ currentCarriage }}</span>
            </div>
          </div>

          <div class="h-right">
            <div class="door-box">
              <div class="door-txt">
                <div class="dt-cn">{{ doorTextCn }}</div>
                <div class="dt-en">{{ doorTextEn }}</div>
              </div>
              <div class="door-icon" :class="{ 'door-open': doorWillOpen, 'door-close': !doorWillOpen }">
                <i :class="doorWillOpen ? 'fas fa-check' : 'fas fa-times'"></i>
              </div>
            </div>
          </div>
        </div>

        <!-- Map Area -->
        <div class="map-area">
          <div 
            class="track-wrap" 
            id="map-track"
          >
            <div class="rail-bg" :style="{ width: railWidth + 'px', left: trackTranslateX + 'px', height: railHeight + 'px', borderRadius: (railHeight / 2) + 'px' }"></div>
            <!-- 分段线路条 -->
            <div 
              v-for="segment in railSegments" 
              :key="'segment-' + segment.index"
              class="rail-segment"
              :class="{ 'segment-passed': segment.isPassed, 'segment-current': segment.isCurrent }"
              :style="{
                left: (trackTranslateX + segment.left) + 'px',
                width: segment.width + 'px',
                height: railHeight + 'px',
                borderRadius: (railHeight / 2) + 'px',
                background: getSegmentBackground(segment)
              }"
            >
              <!-- 线段上的三个箭头 -->
              <div
                v-for="(arrow, arrowIdx) in getSegmentArrows(segment)"
                :key="'arrow-' + segment.index + '-' + arrowIdx"
                class="segment-arrow"
                :style="{
                  left: arrow.left + 'px',
                  marginLeft: (-arrowSize) + 'px',
                  borderTopWidth: arrowSize + 'px',
                  borderBottomWidth: arrowSize + 'px',
                  borderLeftWidth: arrowWidth + 'px',
                  borderLeftColor: segment.isPassed ? '#b0b0b0' : themeColor
                }"
              ></div>
            </div>
            <!-- Progress arrow -->
            <div 
              class="rail-arrow" 
              :style="{ 
                left: (trackTranslateX + progressWidth) + 'px',
                marginLeft: (-arrowSize) + 'px',
                borderTopWidth: arrowSize + 'px',
                borderBottomWidth: arrowSize + 'px',
                borderLeftWidth: arrowWidth + 'px',
                borderLeftColor: themeColor
              }"
            ></div>
            <!-- Stations -->
            <div id="nodes-container" class="nodes-container" :style="{ left: trackTranslateX + 'px', width: railWidth + 'px' }">
              <div 
                v-for="(station, index) in stations" 
                :key="index"
                class="st-node"
                :class="getStationClass(index)"
                :id="'st-' + index"
                :style="{ width: ST_WIDTH + 'px' }"
              >
                <div class="st-txt">
                  <div class="st-cn" :class="{ active: index === activeStationIdx }">
                    {{ station.name }}
                  </div>
                  <div class="st-en" :class="{ active: index === activeStationIdx }">
                    {{ station.en }}
                  </div>
                </div>
                <div class="st-dot" :class="{ active: index === activeStationIdx }">
                  {{ index + 1 }}
                </div>
                <div v-if="station.xfer && station.xfer.length" class="xfer-row">
                  <div 
                    v-for="(xfer, xIdx) in station.xfer" 
                    :key="xIdx"
                    class="x-badge"
                    :style="{ background: xfer.color || '#999' }"
                  >
                    {{ xfer.line }}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `
}

