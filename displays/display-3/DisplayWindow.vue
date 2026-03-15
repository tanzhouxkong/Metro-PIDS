<template>
  <div class="display3-shell">
    <!-- 带有高斯模糊的标题/状态栏 -->
    <div id="display-titlebar" class="custom-titlebar">
      <div class="titlebar-inner">
        <i class="fas fa-subway" style="font-size: 14px;"></i>
        <span>Metro PIDS - Display 3</span>
      </div>
    </div>

    <div class="display3-viewport">
      <div class="display3-stage" :style="stageStyle">
        <div class="display3-app" :style="themeVars">
        <section class="left-panel-theme">
          <div class="pattern-bg"></div>
          
          <div class="theme-top">
            <div class="theme-top-left">
              <div class="theme-top-stack">
                <div class="theme-time">
                  {{ nowTime }}
                  <button
                    v-if="runtimeEnvironment !== 'electron'"
                    type="button"
                    class="d3-browser-settings-trigger"
                    aria-label="Display-3 browser settings"
                    @click.stop="toggleBrowserSettings"
                  ></button>
                </div>

                <div
                  v-if="runtimeEnvironment !== 'electron' && browserSettingsOpen"
                  class="d3-browser-settings-modal"
                  role="dialog"
                  aria-modal="true"
                  @click.self="closeBrowserSettings"
                >
                  <div class="d3-browser-settings-card">
                    <div class="d3-browser-settings-card-head">
                      <div class="d3-browser-settings-title">设置</div>
                      <button type="button" class="d3-browser-settings-close" @click.stop="closeBrowserSettings" aria-label="Close">×</button>
                    </div>

                    <div class="d3-browser-settings-row">
                      <span class="d3-browser-settings-label">虚拟位置</span>
                      <div class="d3-browser-settings-actions">
                        <select
                          class="d3-browser-settings-select"
                          :value="displayVirtualPosition"
                          @change="onBrowserVirtualPositionChange"
                        >
                          <option value="left">左</option>
                          <option value="center">中</option>
                          <option value="right">右</option>
                        </select>
                      </div>
                    </div>

                    <div class="d3-browser-settings-row">
                      <span class="d3-browser-settings-label">当前车厢</span>
                      <div class="d3-browser-settings-actions">
                        <select
                          class="d3-browser-settings-select"
                          :value="String(activeFormationCarNoSetting ?? '')"
                          @change="onBrowserActiveCarSelect"
                        >
                          <option value="">默认</option>
                          <option
                            v-for="n in formationCarOptions"
                            :key="`car-${n}`"
                            :value="String(n)"
                          >
                            {{ n }}
                          </option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="merged-lines-container">
                  <div
                    class="merged-line-badge"
                    v-for="(line, index) in parsedMergedLines"
                    :key="index"
                    :style="getMergedLineBadgeStyle(index)"
                  >
                    <div class="merged-line-number">{{ line.numPart }}</div>
                    <div class="merged-line-text">
                      <div class="merged-line-cn">{{ line.suffixPart }}</div>
                      <div class="merged-line-en">{{ line.enPart }}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <div class="theme-bottom">
            <div class="dest-info">
              <div class="dest-labels">
                <span class="dest-label-cn">开往</span>
                <span class="dest-label-en">To</span>
              </div>
              <div class="dest-texts" style="display: flex; flex-direction: column; justify-content: center; gap: 0px;">
                <!-- 中文终点站独立滚动 -->
                <div class="marquee-box" ref="destCnBoxRef" style="line-height: 1.1;">
                  <div ref="destCnContentRef" class="marquee-content dest-cn-text" :class="{ scrolling: destCnShouldScroll }" :style="{ animationDuration: destCnDuration, display: 'inline-flex', alignItems: 'center' }">
                    <span>{{ destCnText }}</span>
                    <template v-if="destCnShouldScroll">
                      <span style="display: inline-block; width: 60px; flex-shrink: 0;"></span>
                      <span>{{ destCnText }}</span>
                      <span style="display: inline-block; width: 60px; flex-shrink: 0;"></span>
                    </template>
                  </div>
                </div>
                <!-- 英文终点站独立滚动 -->
                <div class="marquee-box" ref="destEnBoxRef" style="line-height: 1.1;">
                  <div ref="destEnContentRef" class="marquee-content dest-en-text" :class="{ scrolling: destEnShouldScroll }" :style="{ animationDuration: destEnDuration, display: 'inline-flex', alignItems: 'center' }">
                    <span>{{ destEnText }}</span>
                    <template v-if="destEnShouldScroll">
                      <span style="display: inline-block; width: 60px; flex-shrink: 0;"></span>
                      <span>{{ destEnText }}</span>
                      <span style="display: inline-block; width: 60px; flex-shrink: 0;"></span>
                    </template>
                  </div>
                </div>
              </div>
            </div>

            <div class="next-header-row">
              <div class="next-label-group">
                <div class="next-label">
                  <span class="next-label-cn">{{ focusLabelCn }}</span>
                  <span class="next-label-en">{{ focusLabelEn }}</span>
                </div>
              </div>
            </div>
            
            <div class="next-texts" style="display: flex; flex-direction: column; justify-content: center; gap: 0px; min-width: 0; margin-top: 4px;">
              <!-- 下一站中文独立滚动 -->
              <div class="marquee-box" ref="nextCnBoxRef" style="line-height: 1.1; min-width: 0;">
                <div ref="nextCnContentRef" class="marquee-content next-cn-text" :class="{ scrolling: nextCnShouldScroll }" :style="{ animationDuration: nextCnDuration, display: 'inline-flex', alignItems: 'center' }">
                  <span>{{ nextCnText }}</span>
                  <template v-if="nextCnShouldScroll">
                    <span style="display: inline-block; width: 60px; flex-shrink: 0;"></span>
                    <span>{{ nextCnText }}</span>
                    <span style="display: inline-block; width: 60px; flex-shrink: 0;"></span>
                  </template>
                </div>
              </div>
              <!-- 下一站英文独立滚动 -->
              <div class="marquee-box" ref="nextEnBoxRef" style="line-height: 1.1; margin-top: 4px; min-width: 0;">
                <div ref="nextEnContentRef" class="marquee-content next-en-text" :class="{ scrolling: nextEnShouldScroll }" :style="{ animationDuration: nextEnDuration, display: 'inline-flex', alignItems: 'center' }">
                  <span>{{ nextEnText }}</span>
                  <template v-if="nextEnShouldScroll">
                    <span style="display: inline-block; width: 60px; flex-shrink: 0;"></span>
                    <span>{{ nextEnText }}</span>
                    <span style="display: inline-block; width: 60px; flex-shrink: 0;"></span>
                  </template>
                </div>
              </div>
            </div>
            <!-- 已到达 / 下一站：统一把换乘信息放在站名下方 -->
            <div
              class="transfers transfers-below"
              v-if="ui.transfers.length"
            >
              <div class="transfers-label">
                <span class="transfers-label-cn">换乘</span>
                <span class="transfers-label-en">Transfer</span>
              </div>
              <div class="transfers-badges">
                <span
                  class="transfer-badge"
                  :class="{
                    suspended: tr.status === 'suspended',
                    exit: tr.status === 'exit'
                  }"
                  :style="{ background: tr.color || '#aacc00' }"
                  v-for="(tr, idx) in ui.transfers"
                  :key="idx"
                >
                  {{ tr.shortName }}
                </span>
              </div>
            </div>
            <div class="door-status left-door-status" :class="doorStatusClass">
              <div class="door-indicator" :class="doorArrowClass">
                <svg viewBox="0 0 100 78" class="door-arrow-svg door-panel-icon" aria-hidden="true">
                  <g class="door-leaf left">
                    <rect class="leaf-body" x="4" y="4" width="43" height="70" rx="2.5" />
                    <rect class="leaf-window" x="11" y="11" width="27" height="29" rx="4.5" />
                  </g>
                  <path class="door-center-line" d="M50 4V74" />
                  <g class="door-leaf right">
                    <rect class="leaf-body" x="53" y="4" width="43" height="70" rx="2.5" />
                    <rect class="leaf-window" x="60" y="11" width="27" height="29" rx="4.5" />
                  </g>
                </svg>
                <svg
                  v-if="doorPresentation.showForbidden"
                  viewBox="0 0 100 100"
                  class="door-no-open-icon"
                  aria-hidden="true"
                >
                  <circle cx="50" cy="50" r="38" fill="none" stroke="#ff1b12" stroke-width="12" />
                  <path d="M24 24L76 76" fill="none" stroke="#ff1b12" stroke-width="12" stroke-linecap="round" />
                </svg>
              </div>
              <div class="door-text">
                <div class="door-text-cn">{{ doorPresentation.cn }}</div>
                <div class="door-text-en">{{ doorPresentation.en }}</div>
              </div>
            </div>
          </div>
        </section>

        <section class="right-area">
          <div v-if="!isFormationScreen" class="route-backdrop">
            <!-- 非环线：使用原来的 C 型线路图 -->
            <template v-if="!isLoopLine">
              <svg class="route-svg" :viewBox="`0 0 ${ROUTE_AREA_WIDTH} 600`" preserveAspectRatio="none" aria-hidden="true">
                <defs>
                  <linearGradient id="d3BgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#5ed2ff" />
                    <stop offset="100%" stop-color="#138fff" />
                  </linearGradient>
                  <linearGradient id="d3TrackGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stop-color="rgba(255,255,255,0.65)" />
                    <stop offset="100%" stop-color="rgba(255,255,255,0.98)" />
                  </linearGradient>
                </defs>
                <!-- 移除下一站页面右侧的蓝色背景块，仅保留轨道本身 -->
                <!-- 与显示器1一致：灰色背景轨 + 分段高亮轨（支持贯通多色） -->
                <path
                  ref="trackPathRef"
                  class="track-bg"
                  :d="routePath"
                  fill="none"
                  stroke="#ccc"
                  stroke-width="18"
                  stroke-linecap="round"
                />
                <path
                  v-for="seg in cTypeSegmentPaths"
                  :key="seg.key"
                  class="track-segment"
                  :d="routePath"
                  fill="none"
                  :stroke="seg.stroke"
                  stroke-width="18"
                  stroke-linecap="round"
                  :stroke-dasharray="seg.strokeDasharray"
                  :stroke-dashoffset="seg.strokeDashoffset"
                />
              </svg>
              <!-- 运营方向箭头（与显示器1一致，仅在高亮段显示） -->
              <div
                v-for="arr in cTypeArrows"
                :key="arr.key"
                class="c-type-arrow"
                :class="{ 'c-type-arrow-current': arr.isCurrent }"
                :style="{ left: arr.x + 'px', top: (arr.y + 1) + 'px', transform: `translate(-50%, -50%) rotate(${arr.angle}deg)` }"
              >
                <i class="fas fa-chevron-right"></i>
              </div>
              <div class="stations-layer">
                <div
                  v-for="station in plottedStations"
                  :key="station.key"
                  class="station-node"
                  :class="[station.status, { skip: station.skip }]"
                  :style="{ left: station.x + 'px', top: station.y + 'px' }"
                >
                  <div
                    class="station-node-dot"
                    :class="{ 'dot-skip': station.skip }"
                    :style="getStationDotStyle(station)"
                  ></div>
                  <div
                    class="station-node-text"
                    :class="{ current: station.status === 'current' }"
                    :style="getStationTextStyle(station)"
                  >
                    <div class="station-node-cn" :style="station.nameFontStyle">{{ station.name }}</div>
                    <div class="station-node-en">
                      <div
                        v-for="(ln, i) in station.nameEnLines || ['']"
                        :key="`en-${station.key}-${i}`"
                      >
                        {{ ln }}
                      </div>
                    </div>
                  </div>
                  <div
                    v-if="Array.isArray(station.transfers) && station.transfers.length"
                    class="station-node-transfers"
                  >
                    <span
                      v-for="(tr, tIndex) in station.transfers"
                      :key="`xf-${station.key}-${tIndex}`"
                      class="station-transfer-badge"
                      :class="{
                        suspended: tr.status === 'suspended',
                        exit: tr.status === 'exit'
                      }"
                      :style="{ background: tr.color || '#8a8a8a' }"
                    >
                      <span class="station-transfer-main">{{ tr.shortName }}</span>
                      <span
                        v-if="tr.subText"
                        class="station-transfer-sub"
                      >
                        {{ tr.subText }}
                      </span>
                      <span
                        v-else-if="tr.status === 'suspended'"
                        class="station-transfer-sub"
                      >
                        暂缓
                      </span>
                      <span
                        v-else-if="tr.status === 'exit'"
                        class="station-transfer-sub"
                      >
                        出站
                      </span>
                    </span>
                  </div>
                </div>
              </div>
            </template>

            <!-- 环线：使用 computeRingLayoutGeometry 绘制闭合环形轨道（后续可继续补充站名/箭头） -->
            <template v-else>
              <svg
                class="route-svg"
                :viewBox="`0 0 ${ringLayoutGeometry.viewBoxWidth} ${ringLayoutGeometry.viewBoxHeight}`"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <path
                  ref="trackPathRef"
                  class="track-bg"
                  :d="ringLayoutGeometry.pathD"
                  fill="none"
                  stroke="#ccc"
                  stroke-width="18"
                  stroke-linecap="round"
                />
              </svg>
            </template>
          </div>
          <section v-if="!isExitMode" class="middle-stations-panel">
          <div class="mini-route-list">
            <div class="mini-route-track-bg" :style="miniRouteTrackBaseStyle"></div>
            <div
              v-for="segment in miniRouteActiveTrackSegments"
              :key="segment.key"
              class="mini-route-track-active"
              :style="segment.style"
            ></div>
            <div
              v-for="arrow in miniRouteArrows"
              :key="`mini-arrow-${arrow.segmentIndex}`"
              class="mini-route-arrow-pair"
              :class="{ reverse: arrow.reverse, current: arrow.current }"
              :style="{ top: arrow.top, opacity: 1 }"
            >
              <i class="fas fa-chevron-down"></i>
              <i class="fas fa-chevron-down"></i>
            </div>
            <div
              v-for="station in nearbyStations"
              :key="`mini-${station.originalIndex}-${station.name}`"
              class="mini-route-item"
              :class="station.state"
              :style="getMiniRouteItemStyle(station)"
            >
              <div class="mini-route-transfers">
                <span
                  v-for="(badge, transferIndex) in station.sideBadges || []"
                  :key="`mini-transfer-${station.originalIndex}-${badge.key || transferIndex}`"
                  class="mini-route-transfer-badge"
                  :class="{
                    suspended: badge.status === 'suspended',
                    exit: badge.status === 'exit',
                    'station-deferred': badge.status === 'station-deferred',
                    'station-express': badge.status === 'station-express',
                    'has-sub': !!badge.subText
                  }"
                  :style="{ background: badge.color || '#8a8a8a' }"
                >
                  <span class="mini-route-transfer-main">{{ badge.text || '--' }}</span>
                  <span v-if="badge.subText" class="mini-route-transfer-sub">{{ badge.subText }}</span>
                </span>
              </div>
              <div class="mini-route-rail">
                <div class="mini-route-dot"></div>
              </div>
              <div class="mini-route-text">
                <div class="mini-route-cn">{{ station.name }}</div>
                <div class="mini-route-en">{{ station.nameEn }}</div>
              </div>
            </div>
          </div>
          </section>
          <div v-if="isFormationScreen" class="right-area-formation">
            <ArrivalFormationPanel
              :fallback-welcome-text="formationFallbackWelcomeText"
              :fallback-line-name="formationFallbackLineName"
              :flat-cars="formationFlatCars"
              :active-car-no="activeFormationCarNo"
              :travel-direction="formationTravelDirection"
              :profile-total="formationProfile.total"
            />
          </div>
        </section>
        </div>
      </div>
    </div>
  </div>
</template>
<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import ArrivalFormationPanel from './components/ArrivalFormationPanel.vue'
import { createDisplaySdk } from '../../src/utils/displaySdk.js'
import {
  computeCTypeArrowPlacements,
  getStationNameFontStyle,
  splitEnglishNameIntoLines,
  calculateNextStationIndex,
  computeRingLayoutGeometry
} from '../../src/utils/displayStationCalculator.js'

const BASE_WIDTH = 1900
const BASE_HEIGHT = 600
// 左侧面板逻辑宽度与布局列宽保持一致（420px）
// 实际视觉缩小 40px 已通过 CSS 的 grid-template-columns 从 460px 调整为 420px 实现
const LEFT_PANEL_WIDTH = 420
const ROUTE_AREA_WIDTH = BASE_WIDTH - LEFT_PANEL_WIDTH
const ROUTE_VIEWBOX_WIDTH = 1200
const ROUTE_SCALE = ROUTE_AREA_WIDTH / ROUTE_VIEWBOX_WIDTH
// C 型线路图参数（与显示器1完全一致：左侧开口、右侧小 R 角 + 竖线 + 小 R 角）
const C_TYPE_PADDING_X = 75
const C_TYPE_PADDING_RIGHT = 50
const C_TYPE_CORNER_R = 30
const C_TYPE_TOP_Y = 120
const C_TYPE_BOTTOM_Y = 360
const C_TYPE_RIGHT_EDGE = C_TYPE_PADDING_X + (ROUTE_AREA_WIDTH - C_TYPE_PADDING_X - C_TYPE_PADDING_RIGHT)
const C_TYPE_ARC_START_X = C_TYPE_RIGHT_EDGE - C_TYPE_CORNER_R
const C_TYPE_HORIZONTAL_LENGTH = C_TYPE_ARC_START_X - C_TYPE_PADDING_X
const C_TYPE_NODE_RESERVE_TOP = Math.min(80, C_TYPE_HORIZONTAL_LENGTH * 0.15)
const C_TYPE_NODE_RESERVE_BOTTOM = Math.min(110, C_TYPE_HORIZONTAL_LENGTH * 0.2)
const C_TYPE_TRACK_HEIGHT = C_TYPE_BOTTOM_Y - C_TYPE_TOP_Y
const C_TYPE_VERTICAL_LEN = Math.max(0, C_TYPE_TRACK_HEIGHT - 2 * C_TYPE_CORNER_R)
const C_TYPE_ARC_LEN = Math.PI * C_TYPE_CORNER_R + C_TYPE_VERTICAL_LEN
const C_TYPE_PERIMETER = 2 * C_TYPE_HORIZONTAL_LENGTH + C_TYPE_ARC_LEN
const SNAPSHOT_KEY = 'metro_pids_display_snapshot_d3'
const CHANNEL_NAME = 'metro_pids_v3'
const DISPLAY3_VIRTUAL_POSITION_KEY = 'metro_pids_display3_virtual_position'
const DISPLAY3_TRAIN_FORMATION_KEY = 'metro_pids_display3_train_formation'
const DISPLAY3_ACTIVE_CAR_NO_KEY = 'metro_pids_display3_active_car_no'

const TRAIN_FORMATION_PRESETS = {
  '3': { value: '3', labelCn: '3节编组', labelEn: '3-car consist', groups: [3] },
  '4': { value: '4', labelCn: '4节编组', labelEn: '4-car consist', groups: [4] },
  '5': { value: '5', labelCn: '5节编组', labelEn: '5-car consist', groups: [5] },
  '6': { value: '6', labelCn: '6节编组', labelEn: '6-car consist', groups: [6] },
  '7': { value: '7', labelCn: '7节编组', labelEn: '7-car consist', groups: [7] },
  '8': { value: '8', labelCn: '8节编组', labelEn: '8-car consist', groups: [8] },
  '3+3': { value: '3+3', labelCn: '3+3编组', labelEn: '3+3-car consist', groups: [3, 3] },
  '4+4': { value: '4+4', labelCn: '4+4编组', labelEn: '4+4-car consist', groups: [4, 4] }
}

function createDefaultUi() {
  return {
    line: '--',
    lineName: '--',
    mode: 'linear',
    screenMode: 'route',
    themeColor: '#169cff',
    customColorRanges: [],
    mergedLineNames: [],
    direction: 'plain',
    destination: {
      name: '--',
      nameEn: '--'
    },
    nextStation: {
      name: '--',
      nameEn: '--'
    },
    transfers: [],
    routeStations: [],
    stations: [],
    loopDirType: null,
    startIdx: -1,
    termIdx: -1,
    throughLineSegments: [],
    sourceLinePath: '',
    routeCurrentStationIndex: 0,
    routeNextStationIndex: -1,
    currentStationIndex: 0,
    exitGuide: {
      cn: '本侧开门',
      en: 'Please exit from this door',
      side: 'this-side'
    },
    state: 0
  }
}

const ui = reactive(createDefaultUi())
const scale = ref(1)
const trackPathRef = ref(null)
const cTypeArrows = ref([])
const nowTime = ref('--:--')
const runtimeEnvironment = ref('browser')
const displayLocale = ref(detectDisplayLocale())
const displayVirtualPosition = ref('center')
const displayTrainFormation = ref('6')
const display3DepartDurationMs = ref(8000)
const transientExitMode = ref(false)
const destCnShouldScroll = ref(false)
const destEnShouldScroll = ref(false)
const destCnDuration = ref('12s')
const destEnDuration = ref('12s')
const destCnBoxRef = ref(null)
const destEnBoxRef = ref(null)
const destCnContentRef = ref(null)
const destEnContentRef = ref(null)
const nextCnShouldScroll = ref(false)
const nextEnShouldScroll = ref(false)
const nextCnDuration = ref('12s')
const nextEnDuration = ref('12s')
const nextCnBoxRef = ref(null)
const nextEnBoxRef = ref(null)
const nextCnContentRef = ref(null)
const nextEnContentRef = ref(null)
 

let clockTimer = null
let broadcastChannel = null
let transientExitTimer = null
let displaySdk = null
let uninstallKeyboardHandler = null
let localKeyboardHandler = null
let displaySdkUnsubscribe = null
const _lastKeySent = new Map()
const _KEY_DEDUPE_MS = 300

function pad2(value) {
  return String(value).padStart(2, '0')
}

function updateClock() {
  const now = new Date()
  nowTime.value = `${pad2(now.getMonth() + 1)}-${pad2(now.getDate())} ${pad2(now.getHours())}:${pad2(now.getMinutes())}`
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function safeText(value, fallback = '--') {
  const text = String(value ?? '').trim()
  return text || fallback
}

function detectDisplayLocale() {
  try {
    const htmlLang = String(document?.documentElement?.lang || '').trim().toLowerCase()
    if (htmlLang) return htmlLang
  } catch (error) {
    console.warn('[Display-3] 读取页面语言失败', error)
  }
  try {
    const navLang = Array.isArray(navigator?.languages) && navigator.languages.length ? navigator.languages[0] : navigator?.language
    return String(navLang || 'zh-CN').trim().toLowerCase()
  } catch (error) {
    return 'zh-cn'
  }
}

function detectRuntimeEnvironment() {
  return typeof window !== 'undefined' && window.electronAPI ? 'electron' : 'browser'
}

function normalizeVirtualPosition(value) {
  const text = String(value ?? '').trim().toLowerCase()
  if (['left', 'l', '左', '左侧'].includes(text)) return 'left'
  if (['right', 'r', '右', '右侧'].includes(text)) return 'right'
  if (['center', 'middle', 'c', 'mid', '中', '中间', '居中'].includes(text)) return 'center'
  return 'center'
}

function applyVirtualPosition(value) {
  displayVirtualPosition.value = normalizeVirtualPosition(value)
  try {
    window.localStorage.setItem(DISPLAY3_VIRTUAL_POSITION_KEY, displayVirtualPosition.value)
    console.log('[Display-3] 已应用屏幕虚拟位置：', {
      raw: value,
      normalized: displayVirtualPosition.value
    })
  } catch (error) {
    console.warn('[Display-3] 保存屏幕朝向失败', error)
  }
}

function restoreVirtualPositionPreference() {
  try {
    applyVirtualPosition(window.localStorage.getItem(DISPLAY3_VIRTUAL_POSITION_KEY) || 'center')
  } catch (error) {
    displayVirtualPosition.value = 'center'
  }
}

function normalizeTrainFormation(value) {
  const text = String(value ?? '').trim()
  return TRAIN_FORMATION_PRESETS[text] ? text : '6'
}

function applyTrainFormation(value) {
  displayTrainFormation.value = normalizeTrainFormation(value)
  try {
    window.localStorage.setItem(DISPLAY3_TRAIN_FORMATION_KEY, displayTrainFormation.value)
  } catch (error) {
    console.warn('[Display-3] 保存编组配置失败', error)
  }
}

function applyActiveCarNo(value) {
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) return
  const n = Math.floor(num)
  activeFormationCarNoSetting.value = n
  try {
    window.localStorage.setItem(DISPLAY3_ACTIVE_CAR_NO_KEY, String(n))
    console.log('[Display-3] applyActiveCarNo 已应用并写入本地：', {
      raw: value,
      applied: n
    })
  } catch (error) {
    console.warn('[Display-3] 保存当前车厢配置失败', error)
  }
}

const browserSettingsOpen = ref(false)

function toggleBrowserSettings() {
  browserSettingsOpen.value = !browserSettingsOpen.value
}

function closeBrowserSettings() {
  browserSettingsOpen.value = false
}

function onBrowserVirtualPositionChange(event) {
  try {
    const value = event && event.target ? event.target.value : ''
    applyVirtualPosition(value)
  } catch (_) {
    // ignore
  }
}

const formationCarOptions = computed(() => {
  const total = Number(formationProfile.value.total || 0)
  const capped = Number.isFinite(total) ? Math.max(0, Math.min(20, Math.floor(total))) : 0
  return Array.from({ length: capped }, (_, i) => i + 1)
})

function onBrowserActiveCarSelect(event) {
  try {
    const value = event && event.target ? event.target.value : ''
    if (value === '') return
    applyActiveCarNo(value)
  } catch (_) {
    // ignore
  }
}

function applyDisplay3DepartDuration(value) {
  const num = Number(value)
  display3DepartDurationMs.value = Number.isFinite(num) ? Math.max(0, num) : 8000
}

function restoreTrainFormationPreference() {
  try {
    applyTrainFormation(window.localStorage.getItem(DISPLAY3_TRAIN_FORMATION_KEY) || '6')
  } catch (error) {
    displayTrainFormation.value = '6'
  }
}

function restoreActiveCarPreference() {
  try {
    const raw = window.localStorage.getItem(DISPLAY3_ACTIVE_CAR_NO_KEY)
    if (raw != null && raw !== '') {
      applyActiveCarNo(raw)
      console.log('[Display-3] restoreActiveCarPreference 从 localStorage 恢复：', raw)
    } else {
      console.log('[Display-3] restoreActiveCarPreference 未找到本地当前车厢偏好，使用默认规则')
    }
  } catch (error) {
    console.warn('[Display-3] 恢复当前车厢偏好失败，将使用默认规则', error)
  }
}

function readVirtualPositionFromSettingsPayload(settings = {}) {
  return settings?.display?.display3VirtualPosition || settings?.display3VirtualPosition || 'center'
}

function readTrainFormationFromSettingsPayload(settings = {}) {
  return settings?.display?.display3TrainFormation || settings?.display?.trainFormation || settings?.display3TrainFormation || '6'
}

function readActiveCarNoFromSettingsPayload(settings = {}) {
  let raw = null

  try {
    // 1. 优先读取统一下发的数值字段（控制端 useController.sync）
    const fromRoot = settings && Object.prototype.hasOwnProperty.call(settings, 'display3ActiveCarNo')
      ? settings.display3ActiveCarNo
      : null
    const fromDisplayObj =
      settings &&
      settings.display &&
      Object.prototype.hasOwnProperty.call(settings.display, 'display3ActiveCarNo')
        ? settings.display.display3ActiveCarNo
        : null
    const fromPerDisplay =
      settings &&
      settings.display &&
      settings.display.displays &&
      settings.display.displays['display-3'] &&
      Object.prototype.hasOwnProperty.call(settings.display.displays['display-3'], 'activeCarNo')
        ? settings.display.displays['display-3'].activeCarNo
        : null

    const pickFirstScalar = (val) => {
      if (typeof val === 'number' || typeof val === 'string') return val
      return null
    }

    raw =
      pickFirstScalar(fromRoot) ??
      pickFirstScalar(fromDisplayObj) ??
      pickFirstScalar(fromPerDisplay) ??
      null
  } catch (error) {
    // 当前车厢解析失败时静默忽略，保持现有高亮规则
    raw = null
  }

  const num = Number(raw)
  return Number.isFinite(num) && num > 0 ? Math.floor(num) : null
}

function readDisplay3DepartDurationFromSettingsPayload(settings = {}) {
  return settings?.display?.display3DepartDuration ?? settings?.display3DepartDuration ?? 8000
}

function clearTransientExitMode() {
  if (transientExitTimer) {
    window.clearTimeout(transientExitTimer)
    transientExitTimer = null
  }
  transientExitMode.value = false
}

function triggerTransientExitMode() {
  clearTransientExitMode()
  transientExitMode.value = true
  if (display3DepartDurationMs.value > 0) {
    transientExitTimer = window.setTimeout(() => {
      transientExitMode.value = false
      transientExitTimer = null
    }, display3DepartDurationMs.value)
  }
}

function getContrastTextColor(color) {
  const hex = String(color || '').replace('#', '')
  const normalized = hex.length === 3 ? hex.split('').map((char) => char + char).join('') : hex
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return '#ffffff'
  const r = Number.parseInt(normalized.slice(0, 2), 16)
  const g = Number.parseInt(normalized.slice(2, 4), 16)
  const b = Number.parseInt(normalized.slice(4, 6), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.62 ? '#111111' : '#ffffff'
}

function getMergedLineBadgeStyle(index) {
  const base = ui.themeColor || '#169cff'
  const ranges = Array.isArray(ui.customColorRanges) ? ui.customColorRanges : []
  const colors = ranges.length >= 2
    ? ranges.map((r) => r?.color || base).filter(Boolean)
    : [base]
  const accent = colors[index] || colors[0] || base
  return {
    '--badge-accent': accent,
    '--badge-contrast': getContrastTextColor(accent)
  }
}

function normalizeDirection(value) {
  const text = String(value ?? '').trim().toLowerCase()
  if (['up', 'u', 'outer', 'clockwise', '1'].includes(text)) return 'up'
  if (['down', 'd', 'inner', 'anticlockwise', 'counterclockwise', '-1'].includes(text)) return 'down'
  return 'plain'
}

function normalizeDoorSide(value) {
  const text = String(value ?? '').trim().toLowerCase()
  if (['left', '左', '左侧', 'left-side'].includes(text)) return 'left'
  if (['right', '右', '右侧', 'right-side'].includes(text)) return 'right'
  if (['both', '两侧', '双侧'].includes(text)) return 'both'
  return 'this-side'
}

function buildExitGuide(primary, secondary = '') {
  const side = normalizeDoorSide(primary || secondary)
  if (side === 'left') return { cn: '左侧开门', en: 'Left side doors open', side }
  if (side === 'right') return { cn: '右侧开门', en: 'Right side doors open', side }
  if (side === 'both') return { cn: '两侧开门', en: 'Both sides doors open', side }
  return { cn: '本侧开门', en: 'Please exit from this door', side: 'this-side' }
}

function extractLineLabel(meta = {}, fallback = '--') {
  const lineName = String(meta.lineName || fallback || '').trim()
  const matched = lineName.match(/([A-Za-z]?\d+[A-Za-z]?)/)
  return matched ? matched[1] : safeText(lineName, '--')
}

function shortenTransferLineName(name) {
  const text = String(name ?? '').trim()
  if (!text) return '--'
  const matched = text.match(/([A-Za-z]?\d+[A-Za-z]?)/)
  return matched ? matched[1] : text.replace(/号线|线路|Line/gi, '').trim() || text
}

function normalizeTransfers(raw) {
  if (!Array.isArray(raw)) return []
  return raw.map((item, index) => {
    if (typeof item === 'string') {
      const lineName = item.trim()
      return lineName ? {
        key: `transfer-${index}`,
        lineName,
        shortName: shortenTransferLineName(lineName),
        color: null,
        status: 'normal'
      } : null
    }
    const lineName = String(item?.line || item?.name || item?.lineName || item?.text || '').trim()
    if (!lineName) return null
    return {
      key: `transfer-${index}`,
      lineName,
      shortName: shortenTransferLineName(lineName),
      color: item?.color || null,
      status: item?.status || 'normal',
      subText: item?.subText || ''
    }
  }).filter(Boolean)
}

function normalizeMergedLineNames(meta = {}) {
  const mergeEnabled = meta.lineNameMerge === true || meta.lineNameMerge === 'true'
  let names = []
  if (mergeEnabled && Array.isArray(meta.mergedLineNames) && meta.mergedLineNames.length) {
    names = meta.mergedLineNames
  } else if (mergeEnabled && meta.lineName) {
    names = String(meta.lineName).split(/[\/|、]/).map((item) => item.trim()).filter(Boolean)
  } else if (meta.lineName) {
    names = [String(meta.lineName).trim()]
  }
  const unique = [...new Set(names.filter(Boolean))]
  return unique.length ? unique : [safeText(meta.lineName, 'LCD弧形布局')]
}

function resolveTerminalIndex(meta = {}, stations = []) {
  const sts = Array.isArray(stations) ? stations : []
  const len = sts.length
  if (!len) return 0

  const hasTerm = meta.termIdx !== undefined && meta.termIdx !== -1
  const hasStart = meta.startIdx !== undefined && meta.startIdx !== -1
  const dirType = String(meta.dirType || meta.direction || '').toLowerCase()

  // 若显式给出 terminalIndex，则优先使用
  if (meta.terminalIndex !== undefined && meta.terminalIndex !== null) {
    const idx = Number(meta.terminalIndex)
    return clamp(Number.isFinite(idx) ? idx : len - 1, 0, len - 1)
  }

  let terminalIdx = -1

  if (hasTerm && hasStart) {
    // 有短交路设置：根据方向判断终点与 displayWindowLogic 中保持一致
    if (dirType === 'up' || dirType === 'outer') {
      terminalIdx = Number.parseInt(meta.termIdx, 10)
    } else {
      terminalIdx = Number.parseInt(meta.startIdx, 10)
    }
  } else if (hasTerm) {
    terminalIdx = Number.parseInt(meta.termIdx, 10)
  } else if (hasStart) {
    terminalIdx = Number.parseInt(meta.startIdx, 10)
  } else {
    // 没有短交路设置：根据方向选择首末站作为终点
    if (dirType === 'up' || dirType === 'outer') {
      terminalIdx = len - 1
    } else {
      terminalIdx = 0
    }
  }

  if (!Number.isFinite(terminalIdx)) terminalIdx = len - 1
  return clamp(terminalIdx, 0, len - 1)
}

function buildMiniRouteSideBadges(station, transfers = []) {
  const baseBadges = Array.isArray(station?.sideBadges) && station.sideBadges.length
    ? [...station.sideBadges]
    : transfers.map((transfer, index) => ({
        key: `transfer-${index}-${transfer.shortName || transfer.lineName || 'line'}`,
        text: transfer.shortName || transfer.lineName || '--',
        subText: transfer.subText || '',
        color: transfer.color || '#8a8a8a',
        status: transfer.status || 'normal'
      }))

  const badges = [...baseBadges]

  // 暂缓站：补一个灰色“暂缓”徽标
  if (station?.skip) {
    const hasDeferred = badges.some(
      (b) => b.status === 'station-deferred' || b.type === 'station-deferred'
    )
    if (!hasDeferred) {
      badges.push({
        key: `station-deferred-${station.originalIndex ?? 'x'}`,
        text: '暂缓',
        subText: '',
        color: '#888888',
        status: 'station-deferred'
      })
    }
  }

  // 大站停靠：给 expressStop 站加一个橙色“小字标签”
  if (station?.expressStop) {
    const hasExpress = badges.some(
      (b) => b.status === 'station-express' || b.type === 'station-express'
    )
    if (!hasExpress) {
      badges.push({
        key: `station-express-${station.originalIndex ?? 'x'}`,
        text: '大站停靠',
        subText: '',
        color: '#ff9f43',
        status: 'station-express'
      })
    }
  }

  return badges
}

function normalizeStation(station, fallbackName = '--') {
  if (!station || typeof station !== 'object') {
    return {
      name: fallbackName,
      nameEn: '',
      badgeText: '',
      badgeColor: null,
      transfers: [],
      skip: false,
      expressStop: false,
      sideBadges: [],
      originalIndex: -1
    }
  }
  const transfers = normalizeTransfers(station.transfers || station.xfer || [])
  const primaryTransfer = transfers[0] || null
  return {
    ...station,
    originalIndex: Number.isFinite(Number(station.originalIndex)) ? Number(station.originalIndex) : -1,
    name: safeText(station.name || station.cn, fallbackName),
    nameEn: safeText(station.nameEn || station.en, ''),
    badgeText: safeText(station?.badgeText, primaryTransfer?.shortName || ''),
    badgeColor: station?.badgeColor || primaryTransfer?.color || null,
    transfers,
    skip: station?.skip === true,
    expressStop: station?.expressStop === true,
    sideBadges: buildMiniRouteSideBadges(station, transfers)
  }
}

function deriveWindowStations(stations, focusIndex) {
  if (!stations.length) {
    return {
      list: [normalizeStation(null)],
      currentStationIndex: 0
    }
  }

  const maxVisible = Math.min(8, stations.length)
  const start = clamp(focusIndex - Math.floor(maxVisible / 2), 0, Math.max(0, stations.length - maxVisible))
  const list = stations.slice(start, start + maxVisible).map((station, index) => normalizeStation({
    ...station,
    originalIndex: start + index
  }))
  return {
    list,
    currentStationIndex: focusIndex - start
  }
}

function applyUi(nextUi) {
  const base = createDefaultUi()
  Object.assign(ui, base, nextUi)
  ui.destination = { ...base.destination, ...(nextUi.destination || {}) }
  ui.nextStation = { ...base.nextStation, ...(nextUi.nextStation || {}) }
  ui.exitGuide = { ...base.exitGuide, ...(nextUi.exitGuide || {}) }
  ui.routeStations = Array.isArray(nextUi.routeStations) ? nextUi.routeStations : base.routeStations
  ui.stations = Array.isArray(nextUi.stations) ? nextUi.stations : base.stations
  ui.mergedLineNames = Array.isArray(nextUi.mergedLineNames) && nextUi.mergedLineNames.length ? nextUi.mergedLineNames : base.mergedLineNames
  ui.customColorRanges = Array.isArray(nextUi.customColorRanges) ? nextUi.customColorRanges : base.customColorRanges
  ui.startIdx = nextUi.startIdx !== undefined ? nextUi.startIdx : base.startIdx
  ui.termIdx = nextUi.termIdx !== undefined ? nextUi.termIdx : base.termIdx
  ui.throughLineSegments = Array.isArray(nextUi.throughLineSegments) ? nextUi.throughLineSegments : base.throughLineSegments

  try {
    window.localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(ui))
  } catch (error) {
    console.warn('[Display-3] 保存快照失败', error)
  }
}

function normalizeExitData(raw = {}) {
  const stations = Array.isArray(raw.stations)
    ? raw.stations.map((station, index) => normalizeStation({ ...station, originalIndex: index }))
    : []
  const currentStationIndex = clamp(Number(raw.currentStationIndex) || 0, 0, Math.max(stations.length - 1, 0))
  const guide = raw.exitGuide && typeof raw.exitGuide === 'object'
    ? {
        cn: safeText(raw.exitGuide.cn, '本侧开门'),
        en: safeText(raw.exitGuide.en, 'Please exit from this door'),
        side: normalizeDoorSide(raw.exitGuide.side || raw.exitGuide.cn || raw.exitGuide.en)
      }
    : buildExitGuide(raw.door)

  return {
    line: safeText(raw.line, '10'),
    lineName: safeText(raw.lineName, `${safeText(raw.line, '10')}号线`),
    screenMode: 'exit',
    themeColor: safeText(raw.themeColor, '#169cff'),
    customColorRanges: Array.isArray(raw.customColorRanges) ? raw.customColorRanges : [],
    mergedLineNames: Array.isArray(raw.mergedLineNames) && raw.mergedLineNames.length ? raw.mergedLineNames : [safeText(raw.lineName, `${safeText(raw.line, '10')}号线`)],
    direction: normalizeDirection(raw.direction),
    destination: normalizeStation(raw.destination || raw.terminal || raw.termStation || raw.nextStation, '--'),
    nextStation: normalizeStation(raw.nextStation, stations[currentStationIndex]?.name || '--'),
    transfers: normalizeTransfers(raw.transfers),
    routeStations: stations,
    stations: stations.length ? stations : createDefaultUi().stations,
    startIdx: -1,
    termIdx: -1,
    throughLineSegments: Array.isArray(raw.throughLineSegments) ? raw.throughLineSegments : [],
    sourceLinePath: safeText(raw.sourceLinePath || raw.lineFilePath || raw._lineFilePath || raw?.meta?._lineFilePath, ''),
    routeCurrentStationIndex: currentStationIndex,
    currentStationIndex,
    exitGuide: guide,
    state: Number(raw.state) === 2 ? 2 : Number(raw.state) === 1 ? 1 : 0
  }
}

function normalizeSyncData(appData = {}, rtState = null) {
  const stations = Array.isArray(appData.stations) ? appData.stations : []
  const meta = appData.meta || {}
  const total = stations.length
  const rawIdx = Number(rtState?.idx)
  const fallbackIdx = Number(meta.startIdx)
  const focusIndex = clamp(
    Number.isFinite(rawIdx) ? rawIdx : (Number.isFinite(fallbackIdx) ? fallbackIdx : 0),
    0,
    Math.max(total - 1, 0)
  )

  // 计算“下一站”索引：进站状态使用当前站，出站状态使用共享 API 计算的下一站
  let nextIndex = focusIndex
  const rtStateNum = Number(rtState?.state)
  if (rtStateNum === 1 && total > 0) {
    try {
      const calculated = calculateNextStationIndex(focusIndex, appData)
      if (Number.isFinite(calculated)) {
        nextIndex = clamp(calculated, 0, total - 1)
      }
    } catch (error) {
      nextIndex = clamp(focusIndex + 1, 0, total - 1)
    }
  }

  const focusStation = stations[focusIndex] || null
  const nextStationRaw = rtStateNum === 1 ? (stations[nextIndex] || focusStation) : focusStation
  const terminalStation = stations[resolveTerminalIndex(meta, stations)] || null
  const derivedStations = deriveWindowStations(stations, focusIndex)
  const exitGuide = buildExitGuide(
    focusStation?._effectiveDoor || focusStation?.door || focusStation?.dock,
    focusStation?.door || focusStation?.dock
  )

  return {
    line: extractLineLabel(meta, appData.line),
    lineName: safeText(meta.lineName || appData.lineName, `${extractLineLabel(meta, appData.line)}号线`),
    mode: meta.mode || 'linear',
    loopDirType: meta.dirType || null,
    screenMode: 'route',
    themeColor: safeText(meta.themeColor, '#169cff'),
    customColorRanges: Array.isArray(meta.customColorRanges) ? meta.customColorRanges : [],
    mergedLineNames: normalizeMergedLineNames(meta),
    direction: normalizeDirection(meta.dirType || meta.direction),
    destination: normalizeStation(terminalStation, safeText(meta.termStationName, '--')),
    // 左侧“下一站”区域：进站=当前站，出站=下一站
    nextStation: normalizeStation(nextStationRaw, '--'),
    // 左侧“换乘”徽标：同步显示对应站点的换乘信息
    transfers: normalizeTransfers(nextStationRaw?.xfer),
    routeStations: stations.map((station, index) => normalizeStation({ ...station, originalIndex: index })),
    stations: derivedStations.list,
    startIdx: (meta.startIdx !== undefined && meta.startIdx !== -1) ? parseInt(meta.startIdx, 10) : -1,
    termIdx: (meta.termIdx !== undefined && meta.termIdx !== -1) ? parseInt(meta.termIdx, 10) : -1,
    throughLineSegments: Array.isArray(meta.throughLineSegments) ? meta.throughLineSegments : [],
    sourceLinePath: safeText(meta._lineFilePath, ''),
    routeCurrentStationIndex: focusIndex,
    routeNextStationIndex: rtStateNum === 1 ? nextIndex : -1,
    currentStationIndex: derivedStations.currentStationIndex,
    exitGuide,
    state: rtStateNum === 2 ? 2 : rtStateNum === 1 ? 1 : 0
  }
}

const isLoopLine = computed(() => ui.mode === 'loop')

const ringLayoutGeometry = computed(() => {
  const stations = Array.isArray(ui.routeStations) && ui.routeStations.length
    ? ui.routeStations
    : (Array.isArray(ui.stations) && ui.stations.length ? ui.stations : [])
  return computeRingLayoutGeometry(stations)
})

function handleIncomingMessage(message) {
  const { t, d, r, settings } = message || {}

  // 显示器3专用：仅同步当前车厢号的轻量级消息
  if (t === 'DISPLAY3_ACTIVE_CAR') {
    if (d != null) {
      applyActiveCarNo(d)
    }
    return
  }

  if (settings?.display?.display3VirtualPosition) {
    applyVirtualPosition(readVirtualPositionFromSettingsPayload(settings))
  }

  if (settings?.display) {
    applyTrainFormation(readTrainFormationFromSettingsPayload(settings))
    const activeCarNo = readActiveCarNoFromSettingsPayload(settings)
    if (activeCarNo !== null) {
      applyActiveCarNo(activeCarNo)
    }
    applyDisplay3DepartDuration(readDisplay3DepartDurationFromSettingsPayload(settings))
  }

  // 兼容通道：若线路 meta 中携带了当前车厢号，也一并应用
  const metaActiveCar =
    (d && d.meta && (d.meta.display3ActiveCarNo ?? d.meta.activeCarNo)) ??
    null
  if (metaActiveCar != null) {
    console.log('[Display-3] handleIncomingMessage 从 meta 收到 activeCarNo：', metaActiveCar)
    applyActiveCarNo(metaActiveCar)
  }

  if (d && typeof d === 'object' && d.trainFormation) {
    applyTrainFormation(d.trainFormation)
  }

  if (t === 'EXIT_DATA' && d) {
    applyUi(normalizeExitData(d))
    return
  }

  if (t === 'SYNC') {
    if (d && d.exitData) {
      applyUi(normalizeExitData(d.exitData))
      return
    }
    if (d) {
      applyUi(normalizeSyncData(d, r || null))
    }
  }
}

function handleWindowMessage(event) {
  if (!event || !event.data) return
  handleIncomingMessage(event.data)
}

function restoreSnapshot() {
  try {
    const raw = window.localStorage.getItem(SNAPSHOT_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') {
      applyUi(normalizeExitData(parsed))
    }
  } catch (error) {
    console.warn('[Display-3] 恢复快照失败', error)
  }
}

runtimeEnvironment.value = detectRuntimeEnvironment()

watch(
  () => [ui.state, ui.screenMode],
  ([state, screenMode], previousValues) => {
    const prevState = Array.isArray(previousValues) ? previousValues[0] : undefined
    if (screenMode === 'exit') {
      clearTransientExitMode()
      return
    }
    if (Number(state) === 1 && Number(prevState) !== 1) {
      triggerTransientExitMode()
      return
    }
    if (Number(state) !== 1) {
      clearTransientExitMode()
    }
  },
  { immediate: true }
)

function updateScale() {
  // 根据当前窗口尺寸计算舞台缩放倍率，保持固定设计稿比例铺满容器
  const widthScale = window.innerWidth / BASE_WIDTH
  const heightScale = (window.innerHeight - 35) / BASE_HEIGHT // 减去标题栏高度

  // Electron 固定分辨率窗口：使用 cover（Math.max）消除黑边；
  // 外部浏览器/多屏协同预览：使用 contain（Math.min）保持等比例缩放，避免裁切。
  const useContain = runtimeEnvironment.value !== 'electron'
  const nextScale = useContain ? Math.min(widthScale, heightScale) : Math.max(widthScale, heightScale)
  scale.value = Number.isFinite(nextScale) && nextScale > 0 ? nextScale : 1
}

// 整个舞台的基础尺寸与缩放样式
const stageStyle = computed(() => ({
  width: `${BASE_WIDTH}px`,
  height: `${BASE_HEIGHT}px`,
  transform: `scale(${scale.value})`
}))

// 由线路主题色衍生出的全局 CSS 变量（贯通模式时包含多段颜色）
const themeVars = computed(() => {
  const base = ui.themeColor || '#169cff'
  const ranges = Array.isArray(ui.customColorRanges) ? ui.customColorRanges : []
  const colors = ranges.length >= 2
    ? ranges.map((r) => r?.color || base).filter(Boolean)
    : [base]
  const vars = {
    '--accent': colors[0],
    '--accent-soft': `${colors[0]}26`,
    '--accent-dark': '#00000022',
    '--accent-contrast': getContrastTextColor(colors[0])
  }
  colors.forEach((c, i) => {
    if (i > 0) vars[`--accent-${i + 1}`] = c
  })
  // 贯通模式：根据线路数量在背景中平分渐变
  const n = colors.length
  let gradientStops
  if (n <= 1) {
    gradientStops = `color-mix(in srgb, ${colors[0]} 24%, #15151a) 0%, color-mix(in srgb, ${colors[0]} 10%, #050508) 100%`
  } else {
    const stops = colors.map((c, i) => {
      const pct = (i / (n - 1)) * 100
      const mixPct = i === 0 ? 24 : (i === n - 1 ? 10 : 24)
      const bg = i === n - 1 ? '#050508' : '#15151a'
      return `color-mix(in srgb, ${c} ${mixPct}%, ${bg}) ${pct}%`
    })
    gradientStops = stops.join(', ')
  }
  vars['--bg-main-gradient'] = `linear-gradient(to right, ${gradientStops})`
  return vars
})

// 当前线路编号文本
const lineLabel = computed(() => safeText(ui.line, '--'))

// 解析合并线路名称，拆分出数字编号、中文后缀与英文文案
const parsedMergedLines = computed(() => {
  const names = Array.isArray(ui.mergedLineNames) ? ui.mergedLineNames.filter(Boolean) : []
  const validNames = names.length ? names : [safeText(ui.lineName, 'LCD弧形布局')]

  return validNames.map((nm) => {
    // 过滤掉所有不必要的地域信息和多余标签，复用显示器1的正则过滤
    const cleanText = (str) => {
      if (typeof str !== 'string') return '';
      return str.replace(/<[^>]+>/g, '').trim();
    };

    const simplify = (name) => {
      const stripped = name
        .replace(/^(?:[\u4e00-\u9fa5]{1,6}(?:省|市|县|区|自治区|特别行政区)?)(?:地铁|轨道交通|轨交|城轨|城市轨道交通)?\s*/i, '')
        .trim();
      return stripped || name;
    };

    const textOnlyNm = simplify(cleanText(nm));
    const baseName = textOnlyNm || simplify(nm) || cleanText(nm) || nm || '--';

    const numMatch = baseName.match(/^([A-Za-z]?\d+[A-Za-z]?)(.*)$/);
    const numPart = numMatch ? numMatch[1] : baseName;
    const rest = numMatch ? (numMatch[2] || '').trim() : '';

    let suffixPart = rest || '号线';
    // 若匹配出来的本身就没有“号线”，则补上（如果完全没有数字就不补）
    if (!suffixPart.includes('号线') && !suffixPart.includes('线')) {
       suffixPart += '';
    }

    return {
      numPart: numPart,
      suffixPart: suffixPart,
      enPart: `Line ${numPart}`
    }
  })
})

// 根据当前运行状态切换“已到达 / 下一站”标题文案
const focusLabelCn = computed(() => (Number(ui.state) === 0 ? '已到达' : '下一站'))
const focusLabelEn = computed(() => (Number(ui.state) === 0 ? 'Arrived' : 'Next Station'))

// 到达模式下右侧切换为编组信息画面（显示“欢迎乘坐”和当前车厢）
const isFormationScreen = computed(() => {
  const state = Number(ui.state)
  return state === 0
})

// 出站模式：显式 exit 屏幕 或 整个“出站运行阶段”（state === 1）
// 这样中间站列表在整段出站过程中都不会出现，不再受暂态计时影响
const isExitMode = computed(() => {
  const mode = String(ui.screenMode || '').trim().toLowerCase()
  const state = Number(ui.state)
  if (mode === 'exit') return true
  if (state === 1) return true
  return false
})

// 到站状态中文提示
const arrivalStatusCn = computed(() => {
  if (Number(ui.state) === 0) return '已到达'
  return '即将到达'
})

// 到站状态英文提示
const arrivalStatusEn = computed(() => {
  if (Number(ui.state) === 0) return 'Arrived'
  return 'Coming next'
})

// 结合真实开门侧与当前屏幕虚拟朝向，生成门提示展示模型
const doorPresentation = computed(() => {
  const actualSide = ui.exitGuide.side
  const virtualSide = displayVirtualPosition.value

  if (actualSide === 'both') {
    return {
      mode: 'both',
      layout: 'center',
      cn: '两侧开门',
      en: 'Both sides doors open',
      showForbidden: false
    }
  }

  if (virtualSide === 'center') {
    if (actualSide === 'left') {
      return { mode: 'left', layout: 'left', cn: '左侧开门', en: 'Left side doors open', showForbidden: false }
    }
    if (actualSide === 'right') {
      return { mode: 'right', layout: 'right', cn: '右侧开门', en: 'Right side doors open', showForbidden: false }
    }
    return {
      mode: 'both',
      layout: 'center',
      cn: safeText(ui.exitGuide.cn, '本侧开门'),
      en: safeText(ui.exitGuide.en, 'This side doors open'),
      showForbidden: false
    }
  }

  if (actualSide === 'left' || actualSide === 'right') {
    const sameSide = actualSide === virtualSide
    return sameSide
      ? { mode: 'this', layout: actualSide, cn: '本侧开门', en: 'This side doors open', showForbidden: false }
      : { mode: 'opposite', layout: actualSide, cn: '对侧开门', en: 'Opposite side doors open', showForbidden: true }
  }

  return {
    mode: 'this',
    layout: virtualSide === 'right' ? 'right' : 'left',
    cn: safeText(ui.exitGuide.cn, '本侧开门'),
    en: safeText(ui.exitGuide.en, 'This side doors open'),
    showForbidden: false
  }
})

// 根据开门模式切换门动画与禁开标记样式
const doorArrowClass = computed(() => {
  const mode = doorPresentation.value.mode
  return {
    'mode-this': mode === 'this',
    'mode-both': mode === 'both',
    'mode-left': mode === 'left',
    'mode-right': mode === 'right',
    'mode-opposite': mode === 'opposite'
  }
})

// 控制门区块的左右布局方向
const doorStatusClass = computed(() => ({
  'layout-left': doorPresentation.value.layout === 'left',
  'layout-right': doorPresentation.value.layout === 'right',
  'layout-center': doorPresentation.value.layout === 'center'
}))

// 终点站完整拼接文本
const destinationText = computed(() => {
  const destCn = safeText(ui.destination?.name, '--')
  const destEn = safeText(ui.destination?.nameEn, '')
  return `${destCn} ${destEn}`
})

// 环线模式下的“方向”标签文本：外环 / 内环
const loopDirectionCn = computed(() => {
  if (!isLoopLine.value) return ''
  const raw = String(ui.loopDirType || ui.direction || '').toLowerCase()
  // 显示器1 元数据：loop + outer / inner
  if (raw === 'outer' || raw === 'up' || raw === 'clockwise' || raw === '1') return '外环'
  if (raw === 'inner' || raw === 'down' || raw === 'anticlockwise' || raw === 'counterclockwise' || raw === '-1') return '内环'
  return '环线'
})

const loopDirectionEn = computed(() => {
  if (!isLoopLine.value) return ''
  const raw = String(ui.loopDirType || ui.direction || '').toLowerCase()
  if (raw === 'outer' || raw === 'up' || raw === 'clockwise' || raw === '1') return 'Outer loop'
  if (raw === 'inner' || raw === 'down' || raw === 'anticlockwise' || raw === 'counterclockwise' || raw === '-1') return 'Inner loop'
  return 'Loop service'
})

// 终点站与下一站的中英文文本，分别供滚动与编组画面复用
// 若为环线模式，则“终点站”文本替换为「外环 / 内环」方向说明
const destCnText = computed(() => {
  if (isLoopLine.value) {
    return safeText(loopDirectionCn.value, '--')
  }
  return safeText(ui.destination?.name, '--')
})

const destEnText = computed(() => {
  if (isLoopLine.value) {
    return safeText(loopDirectionEn.value, '')
  }
  return safeText(ui.destination?.nameEn, '')
})

const nextCnText = computed(() => safeText(ui.nextStation?.name, '--'))
const nextEnText = computed(() => safeText(ui.nextStation?.nameEn, ''))
const formationStationCn = computed(() => safeText(ui.nextStation?.name, safeText(ui.destination?.name, '--')))
const formationStationEn = computed(() => safeText(ui.nextStation?.nameEn, safeText(ui.destination?.nameEn, '')))
const formationFallbackLineName = computed(() => {
  const merged = Array.isArray(ui.mergedLineNames) ? ui.mergedLineNames.find((item) => String(item || '').trim()) : ''
  const lineName = safeText(ui.lineName, safeText(merged, `${safeText(ui.line, '--')}号线`))
  return lineName
})
const formationFallbackWelcomeText = computed(() => {
  const locale = String(displayLocale.value || 'zh-cn').toLowerCase()
  if (locale.startsWith('en')) return 'Welcome aboard'
  if (locale.startsWith('ja')) return 'ご乗車ありがとうございます'
  if (locale.startsWith('ko')) return '탑승을 환영합니다'
  return '欢迎乘坐'
})

// 将编组预设转换为可渲染的分组与车厢结构
const formationProfile = computed(() => {
  const base = TRAIN_FORMATION_PRESETS[displayTrainFormation.value] || TRAIN_FORMATION_PRESETS['6']
  const segments = base.groups.map((count, groupIndex) => ({
    key: `${base.value}-${groupIndex}`,
    count,
    labelCn: `${count}节`,
    labelEn: `${count} cars`,
    cars: Array.from({ length: count }, (_, carIndex) => ({
      key: `${base.value}-${groupIndex}-${carIndex}`,
      label: carIndex + 1,
      first: carIndex === 0,
      last: carIndex === count - 1
    }))
  }))
  return {
    ...base,
    total: base.groups.reduce((sum, count) => sum + count, 0),
    segments
  }
})

// 将分组编组拍平成连续车厢列表，便于模板循环输出
const formationFlatCars = computed(() => {
  let globalNo = 1
  return formationProfile.value.segments.flatMap((segment, segmentIndex) => segment.cars.map((car, carIndex) => ({
    ...car,
    globalNo: globalNo++,
    segmentIndex,
    coupledAfter: carIndex === segment.cars.length - 1 && segmentIndex < formationProfile.value.segments.length - 1
  })))
})

// 当前高亮车厢：优先使用设置/本地保存的 activeCarNo，否则固定使用第 1 节
const activeFormationCarNoSetting = ref(null)
const activeFormationCarNo = computed(() => {
  const total = formationProfile.value.total || 1
  const fromSetting = activeFormationCarNoSetting.value
  if (Number.isFinite(Number(fromSetting))) {
    const n = Math.floor(Number(fromSetting))
    if (n >= 1 && n <= total) return n
  }
  // 未配置时的兜底规则：始终高亮第 1 节车厢
  return 1
})

const formationTravelDirection = computed(() => (isReverseDirection(ui.direction) ? 'left' : 'right'))

function isReverseDirection(direction) {
  // 下行或内环视为反向，影响站点排序与箭头方向
  return direction === 'down' || direction === 'inner'
}

function resolveMiniRouteDisplayIndices(total, currentIndex, reversed) {
  // 计算中部竖向小线路图需要展示的站点索引窗口，优先保证当前站与前后站可见
  if (total <= 0) return []

  const targetTotal = Math.min(8, total)
  const nextStep = reversed ? -1 : 1
  const prevStep = -nextStep
  const minIdx = 0
  const maxIdx = total - 1
  const future = []
  const past = []

  let temp = currentIndex
  for (let i = 0; i < targetTotal - 1 && future.length < targetTotal - 1; i += 1) {
    const next = temp + nextStep
    if (next < minIdx || next > maxIdx || next === currentIndex) break
    future.push(next)
    temp = next
  }

  temp = currentIndex
  const minPast = Math.min(2, Math.max(0, targetTotal - 1))
  for (let i = 0; i < minPast; i += 1) {
    const prev = temp + prevStep
    if (prev < minIdx || prev > maxIdx || prev === currentIndex || future.includes(prev)) break
    past.push(prev)
    temp = prev
  }

  const neededPast = Math.max(0, targetTotal - 1 - future.length)
  let morePastNeeded = neededPast - past.length
  temp = past.length ? past[past.length - 1] : currentIndex
  for (let i = 0; i < morePastNeeded; i += 1) {
    const prev = temp + prevStep
    if (prev < minIdx || prev > maxIdx || prev === currentIndex || past.includes(prev) || future.includes(prev)) break
    past.push(prev)
    temp = prev
  }

  let currentTotal = 1 + past.length + future.length
  if (currentTotal < targetTotal) {
    const neededFuture = targetTotal - currentTotal
    temp = future.length ? future[future.length - 1] : currentIndex
    for (let i = 0; i < neededFuture; i += 1) {
      const next = temp + nextStep
      if (next < minIdx || next > maxIdx || next === currentIndex || future.includes(next) || past.includes(next)) break
      future.push(next)
      temp = next
    }
  }

  currentTotal = 1 + past.length + future.length
  if (currentTotal > targetTotal) {
    let overflow = currentTotal - targetTotal
    while (overflow > 0 && future.length > 0) {
      future.pop()
      overflow -= 1
    }
    while (overflow > 0 && past.length > minPast) {
      past.pop()
      overflow -= 1
    }
  }

  past.reverse()
  const indices = [...past, currentIndex, ...future]
  return reversed ? indices.reverse() : indices
}

function resolveMiniRouteNodeState(realIndex, currentIndex, reversed, uiState) {
  // 根据方向与运行状态判断某个站点属于已过、当前或未到
  if (reversed) {
    if (realIndex > currentIndex) return 'past'
    if (realIndex === currentIndex && Number(uiState) === 1) return 'past'
  } else {
    if (realIndex < currentIndex) return 'past'
    if (realIndex === currentIndex && Number(uiState) === 1) return 'past'
  }

  if (realIndex === currentIndex) return 'current'
  return 'future'
}

function resolveMiniRouteHighlight(total, currentIndex, reversed) {
  // 计算小线路图中高亮轨道的起止范围与箭头目标站
  if (total <= 0) {
    return {
      targetIndex: -1,
      highlightStart: 0,
      highlightEnd: 0
    }
  }

  const minIdx = 0
  const maxIdx = total - 1
  const nextStep = reversed ? -1 : 1
  const nextIdx = currentIndex + nextStep
  const targetIndex = nextIdx < minIdx || nextIdx > maxIdx ? currentIndex : nextIdx
  const highlightStart = reversed ? minIdx : Math.max(currentIndex, minIdx)
  const highlightEnd = reversed ? Math.min(targetIndex + 1, maxIdx + 1) : maxIdx + 1

  return {
    targetIndex,
    highlightStart,
    highlightEnd
  }
}

function isMiniRouteSegmentHighlighted(station1Index, station2Index, highlightStart, highlightEnd, currentIndex, targetIndex) {
  // 判断两个相邻站点之间的线段是否应处于高亮状态
  const station1InRange = station1Index >= highlightStart && station1Index < highlightEnd
  const station2InRange = station2Index >= highlightStart && station2Index < highlightEnd
  const isFromArrivalToTarget = (
    (station1Index === currentIndex && station2Index === targetIndex)
    || (station1Index === targetIndex && station2Index === currentIndex)
  )

  return (station1InRange && station2InRange) || isFromArrivalToTarget
}

function getMiniRouteNodeCenterPercent(index, total) {
  // 返回节点中心在纵向列表中的百分比位置，用于绘制轨道与箭头
  if (total <= 0) return 0
  return ((index + 0.5) / total) * 100
}

// 中部竖向线路图的完整渲染模型：站点、亮显区间和箭头位置
const miniRouteModel = computed(() => {
  const routeStations = Array.isArray(ui.routeStations) && ui.routeStations.length
    ? ui.routeStations
    : (Array.isArray(ui.stations) ? ui.stations : [])
  const total = routeStations.length
  if (!total) {
    return {
      reversed: false,
      stations: [],
      activeSegments: [],
      arrowSegmentIndex: -1,
      displayIndices: []
    }
  }

  const reversed = isReverseDirection(ui.direction)
  const currentIndex = clamp(
    Number.isFinite(Number(ui.routeCurrentStationIndex)) ? Number(ui.routeCurrentStationIndex) : Number(ui.currentStationIndex) || 0,
    0,
    Math.max(total - 1, 0)
  )
  const displayIndices = resolveMiniRouteDisplayIndices(total, currentIndex, reversed)
  const { targetIndex } = resolveMiniRouteHighlight(total, currentIndex, reversed)

  const stations = displayIndices.map((realIndex, viewIndex) => ({
    ...normalizeStation(routeStations[realIndex]),
    originalIndex: realIndex,
    state: resolveMiniRouteNodeState(realIndex, currentIndex, reversed, ui.state),
    first: viewIndex === 0,
    last: viewIndex === displayIndices.length - 1,
    badgeText: routeStations[realIndex]?.badgeText || (realIndex >= 0 ? String(realIndex + 1) : '')
  }))

  const activeSegments = []
  const arrived = Number(ui.state) === 0
  const prevIndex = currentIndex + (reversed ? 1 : -1)
  for (let i = 0; i < stations.length - 1; i += 1) {
    const s1 = stations[i]
    const s2 = stations[i + 1]
    if (!s1 || !s2) continue

    // 到达站画面：上一站 → 当前站 这段不应高亮（与显示器1一致），保持灰色底轨
    if (arrived) {
      const a = Number(s1.originalIndex)
      const b = Number(s2.originalIndex)
      if ((a === prevIndex && b === currentIndex) || (a === currentIndex && b === prevIndex)) {
        continue
      }
    }

    // 仅当整段已经完全「过站」时才熄灭高亮；否则保持亮显
    if (s1.state === 'past' && s2.state === 'past') continue
    activeSegments.push(i)
  }

  let arrowTargetIndex = targetIndex
  if (Number(ui.state) === 1) {
    arrowTargetIndex = reversed ? currentIndex - 1 : currentIndex + 1
  }
  if (arrowTargetIndex < 0 || arrowTargetIndex >= total || arrowTargetIndex === currentIndex) {
    arrowTargetIndex = -1
  }

  const arrowSegmentIndex = arrowTargetIndex < 0
    ? -1
    : displayIndices.findIndex((realIndex, segmentIndex) => (
      segmentIndex < displayIndices.length - 1
      && (
        (realIndex === currentIndex && displayIndices[segmentIndex + 1] === arrowTargetIndex)
        || (realIndex === arrowTargetIndex && displayIndices[segmentIndex + 1] === currentIndex)
      )
    ))

  return {
    reversed,
    stations,
    activeSegments,
    arrowSegmentIndex,
    displayIndices
  }
})

// 模板直接消费的小线路图站点列表
const nearbyStations = computed(() => {
  return miniRouteModel.value.stations
})

function resolveMiniRouteSegmentColor(realSegmentStartIdx) {
  const base = ui.themeColor || '#169cff'
  const ranges = Array.isArray(ui.customColorRanges) ? ui.customColorRanges : []
  for (const range of ranges) {
    const start = range?.startIdx !== undefined ? Number.parseInt(range.startIdx, 10) : -1
    const end = range?.endIdx !== undefined ? Number.parseInt(range.endIdx, 10) : -1
    if (start >= 0 && end >= 0 && realSegmentStartIdx >= start && realSegmentStartIdx < end) {
      return range?.color || base
    }
  }
  return base
}

// 小线路图高亮轨道：贯通模式按区段分段着色
const miniRouteActiveTrackSegments = computed(() => {
  const count = nearbyStations.value.length
  const activeSegments = Array.isArray(miniRouteModel.value.activeSegments) ? miniRouteModel.value.activeSegments : []
  const displayIndices = Array.isArray(miniRouteModel.value.displayIndices) ? miniRouteModel.value.displayIndices : []
  if (count <= 1 || !activeSegments.length || displayIndices.length < 2) return []

  return activeSegments.map((segmentIndex) => {
    const start = getMiniRouteNodeCenterPercent(segmentIndex, count)
    const end = getMiniRouteNodeCenterPercent(segmentIndex + 1, count)
    const realIdx = displayIndices[segmentIndex]
    const color = resolveMiniRouteSegmentColor(realIdx)
    return {
      key: `mini-active-${segmentIndex}-${realIdx}`,
      style: {
        top: `${Math.min(start, end)}%`,
        height: `${Math.max(0, Math.abs(end - start))}%`,
        opacity: 1,
        background: color
      }
    }
  })
})

// 小线路图底轨的基础位置与长度
const miniRouteTrackBaseStyle = computed(() => {
  const count = nearbyStations.value.length
  if (count <= 1) {
    return {
      top: '0%',
      height: '0%'
    }
  }
  const top = getMiniRouteNodeCenterPercent(0, count)
  const end = getMiniRouteNodeCenterPercent(count - 1, count)
  return {
    top: `${top}%`,
    height: `${Math.max(0, end - top)}%`
  }
})

// 小线路图各段箭头的位置、方向与当前高亮段标记
const miniRouteArrows = computed(() => {
  const count = nearbyStations.value.length
  if (count <= 1) return []

  return Array.from({ length: count - 1 }, (_, segmentIndex) => ({
    segmentIndex,
    top: `${((segmentIndex + 1) / count) * 100}%`,
    reverse: miniRouteModel.value.reversed,
    current: segmentIndex === miniRouteModel.value.arrowSegmentIndex
  }))
})

function getMiniRouteItemStyle(station) {
  // 仅影响未到站圆点边框（past/current 由 CSS 覆盖）
  const realIdx = Number(station?.originalIndex)
  if (!Number.isFinite(realIdx)) return {}
  const color = resolveMiniRouteSegmentColor(realIdx)
  return {
    '--mini-route-dot-accent': color
  }
}

// 门提示与当前站名的简要摘要
const guideSummary = computed(() => `${ui.exitGuide.cn} · ${ui.nextStation.name}`)

async function refreshDestinationMarquee() {
  // 在 DOM 更新后重新测量终点站/下一站文本，决定是否启用滚动字幕
  await nextTick()
  const cnBox = destCnBoxRef.value
  const cnContent = destCnContentRef.value
  const enBox = destEnBoxRef.value
  const enContent = destEnContentRef.value

  const nextCnBox = nextCnBoxRef.value
  const nextCnContent = nextCnContentRef.value
  const nextEnBox = nextEnBoxRef.value
  const nextEnContent = nextEnContentRef.value

  destCnShouldScroll.value = false
  destEnShouldScroll.value = false
  nextCnShouldScroll.value = false
  nextEnShouldScroll.value = false
  destCnDuration.value = '12s'
  destEnDuration.value = '12s'
  nextCnDuration.value = '12s'
  nextEnDuration.value = '12s'

  await nextTick()

  // Calculate for Dest CN
  if (cnBox && cnContent) {
    const textWidth = cnContent.scrollWidth
    const boxWidth = cnBox.clientWidth
    const shouldScroll = textWidth > boxWidth + 8
    destCnShouldScroll.value = shouldScroll
    if (shouldScroll) {
      setTimeout(() => {
        const scrollDistance = Math.max(cnContent.scrollWidth / 2, boxWidth)
        const duration = Math.max(8, Math.min(24, scrollDistance / 50))
        destCnDuration.value = `${duration}s`
      }, 50)
    }
  }

  // Calculate for Dest EN
  if (enBox && enContent) {
    const textWidth = enContent.scrollWidth
    const boxWidth = enBox.clientWidth
    const shouldScroll = textWidth > boxWidth + 8
    destEnShouldScroll.value = shouldScroll
    if (shouldScroll) {
      setTimeout(() => {
        const scrollDistance = Math.max(enContent.scrollWidth / 2, boxWidth)
        const duration = Math.max(8, Math.min(24, scrollDistance / 50))
        destEnDuration.value = `${duration}s`
      }, 50)
    }
  }

  // Calculate for Next CN
  if (nextCnBox && nextCnContent) {
    const textWidth = nextCnContent.scrollWidth
    const boxWidth = nextCnBox.clientWidth
    const shouldScroll = textWidth > boxWidth + 8
    nextCnShouldScroll.value = shouldScroll
    if (shouldScroll) {
      setTimeout(() => {
        const scrollDistance = Math.max(nextCnContent.scrollWidth / 2, boxWidth)
        const duration = Math.max(8, Math.min(24, scrollDistance / 50))
        nextCnDuration.value = `${duration}s`
      }, 50)
    }
  }

  // Calculate for Next EN
  if (nextEnBox && nextEnContent) {
    const textWidth = nextEnContent.scrollWidth
    const boxWidth = nextEnBox.clientWidth
    const shouldScroll = textWidth > boxWidth + 8
    nextEnShouldScroll.value = shouldScroll
    if (shouldScroll) {
      setTimeout(() => {
        const scrollDistance = Math.max(nextEnContent.scrollWidth / 2, boxWidth)
        const duration = Math.max(8, Math.min(24, scrollDistance / 50))
        nextEnDuration.value = `${duration}s`
      }, 50)
    }
  }
}

// 计算右侧主线路图站点坐标（与显示器1 C 型一致：使用完整 routeStations，上排沿上水平段、下排沿下水平段）
const plottedStations = computed(() => {
  const stations = Array.isArray(ui.routeStations) && ui.routeStations.length
    ? ui.routeStations
    : (Array.isArray(ui.stations) && ui.stations.length ? ui.stations : createDefaultUi().stations)
  const total = stations.length
  if (!total) return []

  const topCount = Math.ceil(total / 2)
  const bottomCount = Math.max(0, total - topCount)
  const topY = C_TYPE_TOP_Y
  const bottomY = C_TYPE_BOTTOM_Y
  // 上排：从左到右，末端预留给圆角/箭头
  const topLeftX = C_TYPE_PADDING_X
  const topRightX = C_TYPE_ARC_START_X - C_TYPE_NODE_RESERVE_TOP
  const topUsableLen = Math.max(0, topRightX - topLeftX)
  // 下排：从右到左，末端预留
  const bottomRightX = C_TYPE_ARC_START_X - C_TYPE_NODE_RESERVE_BOTTOM
  const bottomLeftX = C_TYPE_PADDING_X
  const bottomUsableLen = Math.max(0, bottomRightX - bottomLeftX)

  const rangeStart = (ui.startIdx !== undefined && ui.startIdx !== -1) ? parseInt(ui.startIdx, 10) : 0
  const rangeEnd = (ui.termIdx !== undefined && ui.termIdx !== -1) ? parseInt(ui.termIdx, 10) : total - 1
  const minIdx = Math.min(rangeStart, rangeEnd)
  const maxIdx = Math.max(rangeStart, rangeEnd)
  const ranges = Array.isArray(ui.customColorRanges) ? ui.customColorRanges : []
  const themeColor = ui.themeColor || '#169cff'
  const tangentSignTop = 1
  const tangentSignBottom = -1
  // 仅调整上排站名的水平位置（C 型线路图）：往右微移，避免与圆点/箭头视觉上过于贴近
  const C_TYPE_TOP_ROW_LABEL_SHIFT_X = 12

  return stations.map((station, index) => {
    const isTopRow = index < topCount
    const rowIndex = isTopRow ? index : (index - topCount)
    const rowSpan = isTopRow ? topCount : bottomCount
    let x
    if (isTopRow) {
      if (topCount <= 1) x = (topLeftX + topRightX) / 2
      else x = topLeftX + (rowIndex / (topCount - 1)) * topUsableLen
    } else {
      if (bottomCount <= 1) x = (bottomLeftX + bottomRightX) / 2
      else x = bottomRightX - (rowIndex / (bottomCount - 1)) * bottomUsableLen
    }
    const y = isTopRow ? topY : bottomY
    // 与显示器1保持一致的「已过站 / 当前站 / 未到站」判定逻辑：
    // - dir 为 up/outer：索引比当前小的是已过站；state=1 时当前站也视为已过站
    // - 其余方向（down/inner/plain）：索引比当前大的为已过站；state=1 时当前站也视为已过站
    // - state=0 且索引等于当前索引时，为当前站
    const currIdx = (ui.routeCurrentStationIndex ?? ui.currentStationIndex) ?? 0
    const nextIdxRaw = ui.routeNextStationIndex
    const nextIdx = Number.isFinite(Number(nextIdxRaw)) ? Number(nextIdxRaw) : -1
    const dir = ui.direction
    const state = Number(ui.state)
    let status = 'future'
    if (dir === 'up' || dir === 'outer') {
      if (index < currIdx) status = 'past'
      else if (index === currIdx && state === 1) status = 'past'
    } else {
      if (index > currIdx) status = 'past'
      else if (index === currIdx && state === 1) status = 'past'
    }
    if (state === 0 && index === currIdx) {
      status = 'current'
    } else if (state === 1 && nextIdx >= 0 && index === nextIdx) {
      // 出站阶段：将“下一站”高亮为 current（红色圆点和站名），与显示器1 C 型行为一致
      status = 'current'
    }
    const isPassed = index < minIdx || index > maxIdx
    const effectiveStatus = isPassed ? 'past' : status
    const skip = !!station.skip
    let dotColor = themeColor
    for (const r of ranges) {
      const rs = r.startIdx !== undefined ? parseInt(r.startIdx, 10) : -1
      const re = r.endIdx !== undefined ? parseInt(r.endIdx, 10) : -1
      if (rs >= 0 && re >= 0 && index >= rs && index < re && r.color) {
        dotColor = r.color
        break
      }
    }

    // 与显示器1一致：上下排微调 + 长站名向圆点方向收紧
    // 但对 C 型最左侧的首/末站禁用“长度收紧”，否则长站名会导致锚点被额外平移，从而产生可见的横向漂移。
    const alignTweak = isTopRow ? -8 : 8
    const cnLen = String(station?.name || '').trim().length
    const extraChars = Math.max(0, cnLen - 5)
    // 为避免超长站名把标签整体“甩”得太远，这里收紧单字偏移量并增加上限
    const adjustDist = Math.min(extraChars * 2, 18)
    // labelX -= cos(tangentAngle) * adjustDist；此处 top 为 → (cos=1)，bottom 为 ← (cos=-1)
    const tangentSign = isTopRow ? tangentSignTop : tangentSignBottom
    const isLeftEdgeEndpoint = index === 0 || index === total - 1
    const tightenDx = isLeftEdgeEndpoint ? 0 : -(tangentSign * adjustDist)
    const rowLabelShiftDx = isTopRow ? C_TYPE_TOP_ROW_LABEL_SHIFT_X : 0

    // C 型线路图英文换行由 JS 控制：尽量控制在两行内展示
    let nameEnLines = splitEnglishNameIntoLines(station?.nameEn || station?.en || '', {
      // 每行字符数略收紧，避免行太长
      maxCharsPerLine: 32
    })
    // 如果拆出了两行以上，则把第 2 行及之后合并到一行，只保留最多两行
    if (Array.isArray(nameEnLines) && nameEnLines.length > 2) {
      nameEnLines = [
        nameEnLines[0],
        nameEnLines.slice(1).join(' ')
      ]
    }
    // C 型线路图中文站名字号：基础 20px，超长站名更早进入缩小逻辑，防止在显示器3上出现错位
    const nameFontStyle = getStationNameFontStyle(station?.name || station?.cn || '', {
      // 9 个字开始视为偏长站名，使用更小字号并稍加字间距，避免撑爆倾斜布局导致错位
      shrinkThreshold: 9,
      normalFontSize: 20,
      shrinkFontSize: 16
    })

    return {
      ...normalizeStation(station),
      key: `${station.name}-${index}`,
      x,
      y,
      status: effectiveStatus,
      skip,
      dotColor,
      labelDx: alignTweak + tightenDx + rowLabelShiftDx,
      labelDy: 0,
      nameEnLines,
      nameFontStyle,
      isTopRow
    }
  })
})

// C 型路径：与显示器1一致——左上→右上(直线)→右侧小 R 角下折→左下(直线)
const routePath = computed(() => {
  const topY = C_TYPE_TOP_Y
  const bottomY = C_TYPE_BOTTOM_Y
  return [
    `M ${C_TYPE_PADDING_X} ${topY}`,
    `L ${C_TYPE_ARC_START_X} ${topY}`,
    `A ${C_TYPE_CORNER_R} ${C_TYPE_CORNER_R} 0 0 1 ${C_TYPE_RIGHT_EDGE} ${topY + C_TYPE_CORNER_R}`,
    `L ${C_TYPE_RIGHT_EDGE} ${bottomY - C_TYPE_CORNER_R}`,
    `A ${C_TYPE_CORNER_R} ${C_TYPE_CORNER_R} 0 0 1 ${C_TYPE_ARC_START_X} ${bottomY}`,
    `L ${C_TYPE_PADDING_X} ${bottomY}`
  ].join(' ')
})

const routeBgShapePath = computed(() => {
  const s = ROUTE_SCALE
  const sx = (x) => Math.round(x * s)
  return [
    `M ${sx(90)} 84 C ${sx(238)} 8, ${sx(468)} -8, ${sx(736)} 56 C ${sx(946)} 84, ${sx(1110)} 132, ${sx(1144)} 186`,
    `L ${sx(1144)} 600 L 0 600 L 0 164 C ${sx(34)} 118, ${sx(72)} 94, ${sx(90)} 84 Z`
  ].join(' ')
})

// 站点沿路径的理论距离（与显示器1 getStDist 一致）
function getCTypeStDist(index, topCount, bottomCount) {
  const topPathLen = C_TYPE_HORIZONTAL_LENGTH
  if (index < topCount) {
    if (topCount <= 1) return topPathLen / 2
    const usableLen = Math.max(0, topPathLen - C_TYPE_NODE_RESERVE_TOP)
    return (index / (topCount - 1)) * usableLen
  }
  const bIdx = index - topCount
  const btmStart = C_TYPE_HORIZONTAL_LENGTH + C_TYPE_ARC_LEN
  if (bottomCount <= 1) {
    return btmStart + C_TYPE_NODE_RESERVE_BOTTOM / 2 + (C_TYPE_HORIZONTAL_LENGTH - C_TYPE_NODE_RESERVE_BOTTOM) / 2
  }
  const usableLenBtm = Math.max(0, C_TYPE_HORIZONTAL_LENGTH - C_TYPE_NODE_RESERVE_BOTTOM)
  const btmFirst = btmStart + C_TYPE_NODE_RESERVE_BOTTOM
  return btmFirst + (bIdx / (bottomCount - 1)) * usableLenBtm
}

// 根据当前运行状态与短交路区间，计算 C 型线路图上某个站点的「已过站 / 当前站 / 未到站」状态，
// 逻辑与 plottedStations 中的判定保持一致，便于轨道高亮与圆点状态统一。
function getCTypeStationRunStatus(index, minIdx, maxIdx) {
  const currIdx = (ui.routeCurrentStationIndex ?? ui.currentStationIndex) ?? 0
  const dir = ui.direction
  const state = Number(ui.state)
  let status = 'future'

  if (dir === 'up' || dir === 'outer') {
    if (index < currIdx) {
      status = 'past'
    } else if (index === currIdx && state === 1) {
      status = 'past'
    }
  } else {
    if (index > currIdx) {
      status = 'past'
    } else if (index === currIdx && state === 1) {
      status = 'past'
    }
  }

  if (index === currIdx && state === 0) {
    status = 'current'
  }

  const isOutOfServiceRange = index < minIdx || index > maxIdx
  return isOutOfServiceRange ? 'past' : status
}

// 分段高亮线段：基于 SVG 实际路径长度的一段一段高亮，保证与站点圆点像素级对齐
const cTypeSegmentPaths = computed(() => {
  const pathEl = trackPathRef.value
  if (!pathEl || typeof pathEl.getTotalLength !== 'function') return []

  const stations = Array.isArray(ui.routeStations) && ui.routeStations.length
    ? ui.routeStations
    : (Array.isArray(ui.stations) ? ui.stations : [])
  const total = stations.length
  if (total < 2) return []

  const topCount = Math.ceil(total / 2)
  const bottomCount = total - topCount
  const rangeStart = (ui.startIdx !== undefined && ui.startIdx !== -1) ? parseInt(ui.startIdx, 10) : 0
  const rangeEnd = (ui.termIdx !== undefined && ui.termIdx !== -1) ? parseInt(ui.termIdx, 10) : total - 1
  const minIdx = Math.min(rangeStart, rangeEnd)
  const maxIdx = Math.max(rangeStart, rangeEnd)

  const ranges = Array.isArray(ui.customColorRanges) ? ui.customColorRanges : []
  const themeColor = ui.themeColor || '#169cff'

  const totalLen = pathEl.getTotalLength()
  if (!Number.isFinite(totalLen) || totalLen <= 0) return []
  const scale = totalLen / C_TYPE_PERIMETER

  // 预先计算所有站点在实际路径上的距离（像素级）
  const actualDists = []
  for (let i = 0; i < total; i += 1) {
    const theoretical = getCTypeStDist(i, topCount, bottomCount)
    actualDists.push(theoretical * scale)
  }

  const segments = []
  for (let i = 0; i < total - 1; i++) {
    // 仅在短交路服务区间内绘制高亮轨道
    const isInService = i >= minIdx && i < maxIdx
    if (!isInService) continue

    // 轨道两端站点都已经是「过站」时，该段不再高亮，直接使用灰色底轨
    const status1 = getCTypeStationRunStatus(i, minIdx, maxIdx)
    const status2 = getCTypeStationRunStatus(i + 1, minIdx, maxIdx)
    if (status1 === 'past' && status2 === 'past') continue

    // 至少一端尚未完全「过站」：根据贯通区段配置选择颜色，默认使用主题色
    let segmentColor = themeColor
    for (const range of ranges) {
      const rs = range.startIdx !== undefined ? parseInt(range.startIdx, 10) : -1
      const re = range.endIdx !== undefined ? parseInt(range.endIdx, 10) : -1
      if (rs >= 0 && re >= 0 && i >= rs && i < re) {
        segmentColor = range.color || themeColor
        break
      }
    }

    const d1 = actualDists[i]
    const d2 = actualDists[i + 1]
    const segLen = d2 - d1
    segments.push({
      key: `seg-${i}`,
      stroke: segmentColor,
      strokeDasharray: `${segLen} ${totalLen}`,
      strokeDashoffset: -d1
    })
  }
  return segments
})

function getStationDotStyle(station) {
  if (station.skip) {
    // 暂缓站：样式交给 .dot-skip
    return undefined
  }
  if (station.status === 'past') return undefined
  if (station.status === 'current') {
    // 当前站：完全交给 CSS（使用 --arrow-blink-accent-color 与显示器1保持一致）
    return undefined
  }
  return { borderColor: station.dotColor }
}

function getStationTextStyle(station) {
  const dx = Number.isFinite(Number(station?.labelDx)) ? Number(station.labelDx) : 0
  const dy = Number.isFinite(Number(station?.labelDy)) ? Number(station.labelDy) : 0
  return {
    left: `calc(50% + ${dx}px)`,
    top: `${20 + dy}px`
  }
}

function updateCTypeArrows() {
  const pathEl = trackPathRef.value
  if (!pathEl || typeof pathEl.getTotalLength !== 'function') {
    cTypeArrows.value = []
    return
  }
  const total = (ui.routeStations?.length || ui.stations?.length) || 0
  if (total < 2) {
    cTypeArrows.value = []
    return
  }

  const topCount = Math.ceil(total / 2)
  const bottomCount = total - topCount
  const rangeStartRaw = (ui.startIdx !== undefined && ui.startIdx !== -1) ? parseInt(ui.startIdx, 10) : 0
  const rangeEndRaw = (ui.termIdx !== undefined && ui.termIdx !== -1) ? parseInt(ui.termIdx, 10) : total - 1
  const minIdx = Math.min(rangeStartRaw, rangeEndRaw)
  const maxIdx = Math.max(rangeStartRaw, rangeEndRaw)

  const actualLen = pathEl.getTotalLength()
  const scale = actualLen / C_TYPE_PERIMETER
  const currIdx = ui.routeCurrentStationIndex ?? ui.currentStationIndex ?? 0
  const dirType = ui.direction || null
  const dirDown = /down|inner/.test(String(dirType || '').toLowerCase())
  // 整体箭头略微上移，让箭头更靠近轨道中心
  const arrowOffsetY = 0
  // 仅下排（底部水平段）箭头微调：相对上排再略微下移 1px，保持视觉对称
  const C_TYPE_BOTTOM_ROW_ARROW_SHIFT_Y = -1
  const isBottomRowArrowPoint = (y) => Math.abs(Number(y) - C_TYPE_BOTTOM_Y) <= 1

  // 计算各站点在理论路径上的距离，供 C 型箭头布局算法使用
  const theoreticalDists = []
  for (let i = 0; i < total; i += 1) {
    theoreticalDists.push(getCTypeStDist(i, topCount, bottomCount))
  }

  const placements = computeCTypeArrowPlacements({
    topCount,
    horizontalLength: C_TYPE_HORIZONTAL_LENGTH,
    cornerR: C_TYPE_CORNER_R,
    arcLen: C_TYPE_ARC_LEN,
    scale,
    rangeStart: minIdx,
    rangeEnd: maxIdx,
    theoreticalDists,
    rt: { idx: currIdx, state: Number(ui.state) || 0 },
    dirType,
    tuning: {}
  })

  const arrows = []
  placements.forEach((item, idx) => {
    const d = item.actualDist
    if (!Number.isFinite(d)) return
    const clampedD = Math.max(0, Math.min(actualLen, d))
    const pt = pathEl.getPointAtLength(clampedD)
    const dBefore = Math.max(0, clampedD - 2)
    const dAfter = Math.min(actualLen, clampedD + 2)
    const pA = pathEl.getPointAtLength(dBefore)
    const pB = pathEl.getPointAtLength(dAfter)
    let angle = Math.atan2(pB.y - pA.y, pB.x - pA.x) * 180 / Math.PI
    if (dirDown) angle += 180

    arrows.push({
      key: `arr-${item.segIndex}-${idx}`,
      x: pt.x,
      y: pt.y + arrowOffsetY + (isBottomRowArrowPoint(pt.y) ? C_TYPE_BOTTOM_ROW_ARROW_SHIFT_Y : 0),
      angle,
      isCurrent: !!item.isCurrent
    })
  })

  cTypeArrows.value = arrows
}

watch(
  [trackPathRef, () => ui.routeStations, () => ui.stations, () => ui.routeCurrentStationIndex, () => ui.currentStationIndex, () => ui.startIdx, () => ui.termIdx, () => ui.direction, () => ui.state],
  () => {
    nextTick(() => updateCTypeArrows())
  },
  { deep: true }
)

onMounted(() => {
  // 初始化首屏状态、事件监听、时钟与广播同步
  restoreVirtualPositionPreference()
  restoreTrainFormationPreference()
  restoreActiveCarPreference()
  updateScale()
  updateClock()
  restoreSnapshot()
  refreshDestinationMarquee()

  nextTick(() => updateCTypeArrows())

  window.addEventListener('resize', updateScale)
  window.addEventListener('message', handleWindowMessage)

  clockTimer = window.setInterval(updateClock, 1000)

  try {
    broadcastChannel = new BroadcastChannel(CHANNEL_NAME)
    broadcastChannel.addEventListener('message', (event) => {
      handleIncomingMessage(event.data)
    })
    broadcastChannel.postMessage({ t: 'REQ' })
  } catch (error) {
    console.warn('[Display-3] BroadcastChannel 初始化失败', error)
  }

  // 初始化显示端 SDK 并安装键盘处理器（用于支持外接键盘快捷键）
  try {
    displaySdk = createDisplaySdk({ channelName: CHANNEL_NAME })
    if (displaySdk && typeof displaySdk.installKeyboardHandler === 'function') {
      uninstallKeyboardHandler = displaySdk.installKeyboardHandler({ ignoreInputs: true })
    }
    // 通过 WebSocket / BroadcastChannel / window.postMessage 统一接收来自客户端的消息
    if (displaySdk && typeof displaySdk.onMessage === 'function') {
      displaySdkUnsubscribe = displaySdk.onMessage((msg) => {
        try {
          if (!msg || typeof msg !== 'object') return
          if (!msg.t) return
          handleIncomingMessage(msg)
        } catch (err) {
          console.warn('[Display-3] displaySdk.onMessage 处理消息失败', err)
        }
      })
    }
  } catch (err) {
    console.warn('[Display-3] 安装键盘处理器失败', err)
  }

  // 兼容回退：如果 SDK 未安装或需要，本地也注册一个键盘处理器（避免重复注册）
  try {
    if (!uninstallKeyboardHandler && typeof document !== 'undefined') {
      const normalizeKey = (s) => {
        if (!s) return s
        if (s === 'NumpadEnter') return 'Enter'
        if (s === ' ' || String(s).toLowerCase() === 'spacebar') return 'Space'
        if (/^space$/i.test(s)) return 'Space'
        if (/^[a-zA-Z]$/.test(s)) return 'Key' + String(s).toUpperCase()
        return s
      }

      localKeyboardHandler = (e) => {
        try {
          if (e && e.repeat) return // 忽略按键长按重复事件
        } catch (er) {}
        const targetTag = e.target && e.target.tagName
        if (targetTag && ['INPUT', 'TEXTAREA', 'SELECT'].includes(targetTag)) return
        if (e.code === 'Space' || e.code === 'Enter') try { e.preventDefault() } catch (er) {}
        const ignore = new Set(['ShiftLeft','ShiftRight','ControlLeft','ControlRight','AltLeft','AltRight','MetaLeft','MetaRight','CapsLock','NumLock','ScrollLock','ContextMenu'])
        if (ignore.has(e.code)) return
        try {
          const normCode = normalizeKey(e.code || e.key)
          const normKey = normalizeKey(e.key || e.code || null)
          const dedupeKey = `${normCode}::${normKey}`
          const now = Date.now()
          const last = _lastKeySent.get(dedupeKey) || 0
          if (now - last < _KEY_DEDUPE_MS) return
          _lastKeySent.set(dedupeKey, now)
          const msg = { t: 'CMD_KEY', code: e.code, key: e.key, normCode, normKey }
          if (broadcastChannel) broadcastChannel.postMessage(msg)
          else if (typeof window !== 'undefined' && typeof window.postMessage === 'function') window.postMessage(msg, '*')
        } catch (err) {
          // ignore
        }
      }
      document.addEventListener('keydown', localKeyboardHandler)
    }
  } catch (err) {
    console.warn('[Display-3] 本地键盘处理器注册失败', err)
  }
})

onBeforeUnmount(() => {
  // 组件卸载时清理定时器、广播通道与全局事件监听
  if (clockTimer) {
    window.clearInterval(clockTimer)
    clockTimer = null
  }

  if (broadcastChannel) {
    broadcastChannel.close()
    broadcastChannel = null
  }

  clearTransientExitMode()

  // 卸载键盘处理器并关闭 SDK
  try {
    if (typeof uninstallKeyboardHandler === 'function') {
      uninstallKeyboardHandler()
      uninstallKeyboardHandler = null
    }
  } catch (err) {
    console.warn('[Display-3] 卸载键盘处理器失败', err)
  }
  try {
    if (localKeyboardHandler && typeof document !== 'undefined') {
      document.removeEventListener('keydown', localKeyboardHandler)
      localKeyboardHandler = null
    }
  } catch (err) {
    console.warn('[Display-3] 卸载本地键盘处理器失败', err)
  }
  try {
    if (typeof displaySdkUnsubscribe === 'function') {
      displaySdkUnsubscribe()
      displaySdkUnsubscribe = null
    }
    if (displaySdk && typeof displaySdk.close === 'function') {
      displaySdk.close()
      displaySdk = null
    }
  } catch (err) {
    console.warn('[Display-3] 关闭 displaySdk 失败', err)
  }

  window.removeEventListener('resize', updateScale)
  window.removeEventListener('message', handleWindowMessage)
})

watch([destCnText, destEnText, nextCnText, nextEnText, scale], () => {
  // 文本内容或缩放变化后，重新计算跑马灯状态
  refreshDestinationMarquee()
})
</script>

<style scoped>
:global(html),
:global(body),
:global(#app) {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
  background: transparent;
  overflow: hidden;
}

#display-titlebar.custom-titlebar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 35px;
  display: flex;
  align-items: center;
  flex-shrink: 0;
  width: 100%;
  z-index: 9999;
  background: rgba(255, 255, 255, 0.38);
  backdrop-filter: blur(20px) saturate(1.2);
  -webkit-backdrop-filter: blur(20px) saturate(1.2);
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
  color: #000;
  padding-left: 12px;
  padding-right: 140px;
  font-size: 14px;
  user-select: none;
  -webkit-app-region: drag;
  box-shadow: 0 1px 10px rgba(0, 0, 0, 0.05);
}

.titlebar-inner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 8px;
  font-weight: 600;
}

.titlebar-inner span, .titlebar-inner i {
  -webkit-app-region: no-drag;
}

.display3-shell {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: transparent;
  overflow: hidden;
}

.display3-viewport {
  position: absolute;
  top: 35px;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.display3-stage {
  transform-origin: center center;
}

.display3-app {
  width: 1900px;
  height: 600px;
  display: grid;
  /* 左侧面板从 460px 收窄为 420px（视觉上减少 40px） */
  grid-template-columns: 400px 1fr;
  gap: 0;
  color: #ffffff;
  font-family: "Microsoft YaHei", "PingFang SC", sans-serif;
  background: transparent;
  overflow: hidden;
  position: relative;
}

.display3-app::before {
  content: '';
  position: absolute;
  inset: 0;
  background:
    /* 底部黑色向下渐变覆盖层 */
    linear-gradient(
      to bottom,
      rgba(0, 0, 0, 0) 0%,
      rgba(0, 0, 0, 0.92) 100%
    ),
    /* 主体：沿横向根据线路数量平分渐变（贯通模式 N 条线 = N 个色阶均匀分布） */
    var(--bg-main-gradient, linear-gradient(to right, color-mix(in srgb, var(--accent) 24%, #15151a) 0%, color-mix(in srgb, var(--accent) 10%, #050508) 100%));
  z-index: 0;
  pointer-events: none;
}

.display3-app > * {
  position: relative;
  z-index: 1;
}

.right-area {
  position: relative;
  overflow: hidden;
  min-width: 0;
  display: flex;
}

.right-area .middle-stations-panel {
  width: 560px;
  flex-shrink: 0;
}

.right-area .route-backdrop {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
}

.right-area-formation {
  flex: 1;
  min-width: 0;
  display: flex;
}

.right-panel {
  position: relative;
  overflow: hidden;
}

.middle-stations-panel {
  position: relative;
  padding: 18px 34px 18px 18px;
  overflow: hidden;
}

.mini-route-list {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0;
  --mini-route-transfer-width: 150px;
  --mini-route-rail-width: 42px;
  --mini-route-gap: 6px;
  --mini-route-rail-center: calc(var(--mini-route-transfer-width) + var(--mini-route-gap) + 15px);
}

.mini-route-track-bg,
.mini-route-track-active {
  position: absolute;
  left: calc(var(--mini-route-rail-center) - 9px);
  width: 18px;
  border-left: 5px solid transparent;
  border-right: 5px solid transparent;
  box-sizing: border-box;
  pointer-events: none;
  z-index: 0;
}

.mini-route-track-bg {
  background: #d4d4d4;
}

.mini-route-track-active {
  background: var(--accent);
  z-index: 1;
}

.mini-route-arrow-pair {
  position: absolute;
  left: var(--mini-route-rail-center);
  transform: translate(-50%, -50%);
  z-index: 3;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  font-size: 18px;
  color: #ffffff;
  text-shadow: 0 0 10px rgba(0, 0, 0, 0.28);
  transition: top 180ms ease;
  pointer-events: none;
}

.mini-route-arrow-pair.reverse {
  transform: translate(-50%, -50%) rotate(180deg);
}

.mini-route-item {
  position: relative;
  display: grid;
  grid-template-columns: var(--mini-route-transfer-width) var(--mini-route-rail-width) minmax(0, 1fr);
  align-items: center;
  column-gap: var(--mini-route-gap);
  min-height: 68px;
  padding: 2px 0;
  z-index: 2;
}

.mini-route-rail {
  position: relative;
  width: var(--mini-route-rail-width);
  height: 100%;
}

.mini-route-dot {
  position: absolute;
  top: 50%;
  left: 15px;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  background: #ffffff;
  border: 5px solid #ccc;
  box-sizing: border-box;
}

.mini-route-item.past .mini-route-dot {
  border-color: #c7c7c7;
  background: #ffffff;
  box-shadow: none;
}

.mini-route-item.current .mini-route-dot {
  background: #d94747;
  border-color: #ffffff;
  width: 30px;
  height: 30px;
  box-shadow: 0 0 14px rgba(217, 71, 71, 0.45);
}

.mini-route-item.future .mini-route-dot {
  border-color: var(--mini-route-dot-accent, var(--accent));
  background: #ffffff;
}

.mini-route-text {
  min-width: 0;
  height: auto;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  text-align: left;
  gap: 2px;
  overflow: visible;
}

.mini-route-cn {
  font-size: 24px;
  font-weight: 700;
  color: #ffffff;
  line-height: 1.4;
  writing-mode: horizontal-tb;
  text-orientation: mixed;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: 1px;
}

.mini-route-en {
  font-size: 14px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.92);
  line-height: 1.2;
  writing-mode: horizontal-tb;
  text-orientation: mixed;
  white-space: normal;
  overflow: visible;
  text-overflow: clip;
  padding-bottom: 2px;
}

.mini-route-transfers {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: flex-end;
  align-content: center;
  width: var(--mini-route-transfer-width);
  padding-right: 2px;
  min-width: 0;
}

.mini-route-transfer-badge {
  min-width: 26px;
  min-height: 22px;
  padding: 1px 6px;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  font-size: 13px;
  font-weight: 800;
  line-height: 1;
  color: #ffffff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.28);
  white-space: nowrap;
}

.mini-route-transfer-main {
  display: inline-flex;
  align-items: center;
}

.mini-route-transfer-sub {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 16px;
  padding: 0 3px;
  border-radius: 2px;
  background: rgba(0, 0, 0, 0.24);
  color: #ffffff;
  font-size: 11px;
  font-weight: 800;
  line-height: 1;
}

.mini-route-transfer-badge.suspended,
.mini-route-transfer-badge.exit {
  filter: saturate(0.75) brightness(0.92);
}

.mini-route-transfer-badge.station-deferred {
  background: #888888 !important;
  color: #ffffff;
}

.mini-route-transfer-badge.station-express {
  background: #ff9f43 !important;
  color: #ffffff;
}

.mini-route-item.past .mini-route-cn {
  color: rgba(255, 255, 255, 0.78);
  opacity: 1;
}

.mini-route-item.past .mini-route-en {
  color: rgba(255, 255, 255, 0.72);
  opacity: 1;
}

.mini-route-item.current .mini-route-cn,
.mini-route-item.current .mini-route-en {
  color: #ffffff;
}

.left-panel-theme {
  position: relative;
  padding: 36px 5px 42px 16px;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  gap: 12px;
  overflow: hidden;
  z-index: 2;
}

.pattern-bg {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%) scale(5);
  width: 100px;
  height: 100px;
  opacity: 0.05;
  color: var(--accent);
  pointer-events: none;
}

.theme-top {
  position: relative;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  z-index: 1;
}

.theme-time {
  flex-shrink: 0;
  margin-top: 0;
  margin-left: 2px;
  position: relative;
  font-size: 22px;
  font-weight: 500;
  line-height: 1;
  color: rgba(255, 255, 255, 0.92);
  letter-spacing: 0.5px;
}

.d3-browser-settings-trigger {
  position: absolute;
  inset: -6px -10px;
  background: transparent;
  border: 0;
  padding: 0;
  margin: 0;
  opacity: 0;
  cursor: pointer;
}

.d3-browser-settings-modal {
  position: fixed;
  inset: 0;
  z-index: 99999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
}

.d3-browser-settings-card {
  width: min(420px, calc(100vw - 32px));
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.62);
  border: 1px solid rgba(255, 255, 255, 0.16);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  padding: 12px 14px;
}

.d3-browser-settings-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding-bottom: 8px;
  margin-bottom: 6px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
}

.d3-browser-settings-title {
  font-size: 13px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.92);
}

.d3-browser-settings-close {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(0, 0, 0, 0.18);
  color: rgba(255, 255, 255, 0.92);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
}

.d3-browser-settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 0;
}

.d3-browser-settings-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.8);
  flex-shrink: 0;
}

.d3-browser-settings-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.d3-browser-settings-select {
  height: 24px;
  padding: 0 8px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(0, 0, 0, 0.18);
  color: rgba(255, 255, 255, 0.92);
  font-size: 12px;
}


.theme-top-left {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-width: 0;
  flex: 1;
}

.theme-top-stack {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  flex-shrink: 0;
}

.merged-lines-container {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  margin-top: 0;
}

.merged-line-badge {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  padding: 8px 12px;
  background: color-mix(in srgb, var(--badge-accent, var(--accent)) 78%, #101317);
  border-radius: 8px;
  flex-shrink: 0;
  box-shadow: 0 4px 14px color-mix(in srgb, var(--badge-accent, var(--accent)) 22%, transparent);
}

.merged-line-number {
  font-size: 46px;
  font-weight: 900;
  color: var(--badge-contrast, var(--accent-contrast));
  line-height: 1;
  min-width: 48px;
  text-align: center;
}

.merged-line-text {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-start;
  gap: 2px;
}

.merged-line-cn {
  font-size: 24px;
  font-weight: 900;
  color: var(--badge-contrast, var(--accent-contrast));
  line-height: 1.05;
  text-align: left;
  white-space: nowrap;
}

.merged-line-en {
  font-size: 14px;
  font-weight: 700;
  color: color-mix(in srgb, var(--badge-contrast, var(--accent-contrast)) 88%, transparent);
  opacity: 0.92;
  text-align: left;
  white-space: nowrap;
}

.dest-info {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.dest-labels {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.dest-label-cn {
  font-size: 22px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
}

.dest-label-en {
  font-size: 16px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.6);
  text-transform: uppercase;
}

.dest-name {
  font-size: 38px;
  font-weight: 800;
  color: #ffffff;
}

.dest-cn-text {
  font-size: 38px;
  font-weight: 800;
  color: #fff;
  white-space: nowrap;
}

.dest-en-text {
  font-size: 18px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.75);
  white-space: nowrap;
  line-height: 1.25;
}

.marquee-box {
  overflow: hidden;
  white-space: nowrap;
  position: relative;
  padding-bottom: 4px;
  box-sizing: border-box;
}

.marquee-content {
  display: inline-block;
  white-space: nowrap;
}

.marquee-content.scrolling {
  animation: marquee-scroll 12s linear infinite;
}

.theme-bottom {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.next-label-group {
  display: flex;
  align-items: center;
  gap: 12px;
}

.next-header-row {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  margin-top: 6px;
}

.next-label {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 0;
}

.next-label-cn {
  /* 与“开往”中文字号保持一致 */
  font-size: 22px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.95);
  line-height: 1.1;
}

.next-label-en {
  /* 与“To”英文字号保持一致 */
  font-size: 16px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.6);
  line-height: 1.1;
  text-transform: uppercase;
}

.transfers {
  display: inline-flex;
  align-items: center;
  gap: 12px;
}

.transfers.transfers-below {
  margin-left: 0;
  margin-top: 6px;
}

.transfers-label {
  display: flex;
  flex-direction: column;
  justify-content: center;
  text-align: left;
  gap: 2px;
}

.transfers-label-cn {
  font-size: 24px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
  line-height: 1.1;
}

.transfers-label-en {
  font-size: 14px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.6);
  line-height: 1.1;
  text-transform: uppercase;
}

.transfers-badges {
  display: flex;
  align-items: center;
  gap: 6px;
}

.transfer-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #aacc00; /* Example default green, can be dynamic later */
  color: #ffffff;
  /* 左侧面板换乘徽标字号稍微减小，避免过于抢眼 */
  font-size: 20px;
  font-weight: 800;
  padding: 4px 10px;
  border-radius: 6px;
  line-height: 1;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);
}

.transfer-badge.suspended {
  background: #b9bec8 !important;
  color: #5a6270;
}

.transfer-badge.exit {
  outline: 2px solid rgba(255, 255, 255, 0.28);
  outline-offset: -2px;
}

.next-cn-text {
  /* 左侧面板“下一站站名”字号略微缩小，避免过于抢眼 */
  font-size: 46px;
  font-weight: 900;
  color: #ffffff;
  white-space: nowrap;
}

.next-en-text {
  font-size: 18px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.8);
  white-space: nowrap;
  line-height: 1.25;
}

.middle-panel-black {
  background: #000000;
  padding: 36px 28px 42px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  border-right: 2px solid rgba(255, 255, 255, 0.1);
  z-index: 1;
}

.arrival-status {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.status-cn {
  /* 与“开往”中文字号保持一致 */
  font-size: 22px;
  font-weight: 800;
  color: #ffffff;
}

.status-en {
  /* 与“To”英文字号保持一致 */
  font-size: 16px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.6);
  text-transform: capitalize;
}

.door-status {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 14px;
  width: 100%;
}

.door-status.layout-left {
  flex-direction: row;
}

.door-status.layout-right {
  flex-direction: row-reverse;
}

.door-status.layout-center {
  flex-direction: row;
}

.left-door-status {
  margin-top: 28px;
  align-self: center;
}

.door-indicator {
  width: 94px;
  height: 78px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-top: 4px;
  position: relative;
  padding: 0 10px;
  box-sizing: content-box;
  overflow: visible;
}

.door-arrow-svg {
  width: 100%;
  height: 100%;
  overflow: visible;
}

.door-panel-icon .door-leaf {
  opacity: 0.4;
  transition: opacity 180ms linear, transform 180ms linear, filter 180ms linear;
  transform-box: fill-box;
  transform-origin: center center;
}

.door-panel-icon .leaf-body {
  fill: #f3f3f3;
  stroke: #1f1f1f;
  stroke-width: 1.6;
}

.door-panel-icon .leaf-window {
  fill: #050505;
}

.door-panel-icon .door-center-line {
  stroke: #1f1f1f;
  stroke-width: 1.6;
}

.door-indicator.mode-this .door-leaf,
.door-indicator.mode-both .door-leaf,
.door-indicator.mode-left .door-leaf.left,
.door-indicator.mode-right .door-leaf.right {
  opacity: 1;
  filter: drop-shadow(0 1px 0 rgba(255, 255, 255, 0.35));
}

.door-indicator.mode-this .door-leaf.left,
.door-indicator.mode-both .door-leaf.left {
  animation: door-open-left 1.4s linear infinite alternate;
}

.door-indicator.mode-this .door-leaf.right,
.door-indicator.mode-both .door-leaf.right {
  animation: door-open-right 1.4s linear infinite alternate;
}

.door-indicator.mode-left .door-leaf.left {
  animation: door-open-left 1.4s linear infinite alternate;
}

.door-indicator.mode-right .door-leaf.right {
  animation: door-open-right 1.4s linear infinite alternate;
}

.door-indicator.mode-opposite .door-leaf {
  opacity: 0.72;
}

.door-no-open-icon {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 54px;
  height: 54px;
  transform: translate(-50%, -50%);
  pointer-events: none;
  animation: no-open-pulse 1.2s linear infinite alternate;
}

.door-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  align-items: center;
  text-align: center;
  justify-content: center;
}

.door-status.layout-right .door-text {
  align-items: center;
  text-align: center;
}

.door-status.layout-center .door-text {
  align-items: center;
  text-align: center;
}

.door-text-cn {
  font-size: 38px;
  font-weight: 700;
  color: #ffffff;
}

.door-text-en {
  font-size: 18px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.6);
}

@keyframes door-open-left {
  0% { transform: translateX(0); }
  100% { transform: translateX(-8px); }
}

@keyframes door-open-right {
  0% { transform: translateX(0); }
  100% { transform: translateX(8px); }
}

@keyframes no-open-pulse {
  0% { transform: translate(-50%, -50%) scale(0.92); }
  100% { transform: translate(-50%, -50%) scale(1.08); }
}

@keyframes marquee-scroll {
  0% { transform: translateX(0); }
  100% { transform: translateX(-50%); }
}

.route-backdrop {
  position: absolute;
  inset: 0;
  padding: 24px 18px 22px 18px;
  transform: translateX(40px);
}

.route-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.c-type-arrow {
  position: absolute;
  z-index: 10;
  font-size: 20px;
  color: #fff;
  pointer-events: none;
}

.c-type-arrow-current {
  animation: arrow-white-yellow-blink 2s infinite;
}

@keyframes arrow-white-yellow-blink {
  0%, 100% { color: #fff; }
  50% { color: var(--arrow-blink-accent-color, #c00); }
}

.stations-layer {
  position: absolute;
  inset: 0;
}

.station-node {
  position: absolute;
  transform: translate(-50%, -50%);
}

/* 与显示器1 C 型一致：圆点尺寸 dotSizeNormal 30、border 5、当前站 dotSizeTarget 20 */
.station-node-dot {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 5px solid rgba(255, 255, 255, 0.96);
  background: #ffffff;
  box-shadow: none;
}

.station-node.past .station-node-dot {
  background: #ffffff;
  border-color: #ccc;
}

.station-node.future .station-node-dot {
  background: #ffffff;
}

.station-node.current .station-node-dot {
  /* 当前/下一站红色圆点尺寸：与显示器1 C 型保持一致，略小于普通圆点但更聚焦 */
  width: 30px;
  height: 30px;
  margin-left: 0;
  background: var(--arrow-blink-accent-color, #c00);
  border-color: #fff;
  box-shadow: 0 0 14px var(--arrow-blink-accent-color, #c00);
}

.station-node-dot.dot-skip {
  /* 暂缓开通站点：视觉上与已过站圆点保持一致（大小和颜色），只通过其他标记区分 */
  width: 30px;
  height: 30px;
  background: #ffffff;
  border-color: #ccc;
}

.station-node-text {
  position: absolute;
  left: 50%;
  width: 220px;
  max-width: 240px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  text-align: right;
  transform-origin: right center;
  /* 关键：右边缘对齐圆点中心，然后整体倾斜（与显示器1一致的对齐策略） */
  transform: translateX(-100%) rotate(-45deg);
  color: rgba(255, 255, 255, 0.92);
}

.station-node-text.current {
  color: #ffffff;
}

.station-node-text.current .station-node-cn,
.station-node-text.current .station-node-en {
  color: #c00;
}

.station-node-cn {
  font-size: 20px;
  font-weight: 800;
  line-height: 1.4;
  text-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.station-node-en {
  margin-top: 0;
  font-size: 10px;
  font-weight: 700;
  opacity: 0.9;
  line-height: 1.1;
  /* 允许英文在固定宽度内换行，避免旋转后超出 */
  white-space: normal;
  overflow-wrap: anywhere;
}

.station-node-transfers {
  position: absolute;
  left: 50%;
  bottom: 38px; /* 紧挨圆点正上方，类似显示器1 C 型效果 */
  transform: translateX(-50%);
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  justify-content: center;
}

.station-transfer-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 11px;
  font-weight: 800;
  color: #ffffff;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.35);
  white-space: nowrap;
}

.station-transfer-badge.suspended {
  filter: saturate(0.75) brightness(0.92);
}

.station-transfer-badge.exit {
  outline: 1px solid rgba(0, 0, 0, 0.35);
  outline-offset: -1px;
}

.station-transfer-main {
  display: inline-flex;
  align-items: center;
}

.station-transfer-sub {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-left: 2px;
  padding: 0 3px;
  min-width: 18px;
  height: 14px;
  border-radius: 2px;
  background: rgba(0, 0, 0, 0.4);
  font-size: 9px;
  font-weight: 800;
}

</style>
