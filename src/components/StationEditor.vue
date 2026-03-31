<script>
import { reactive, ref, watch, computed, nextTick, onMounted, onBeforeUnmount, onErrorCaptured, Teleport, Transition } from 'vue'
import { useI18n } from 'vue-i18n'
import ColorPicker from './ColorPicker.vue'
import { getEffectiveViewportRect } from '../utils/effectiveViewportRect.js'
import { collectPeerStationNamesForAudioMatch } from '../utils/stationAudioPeers.js'
import {
  DYNAMIC_AUDIO_ROLE_KEYS,
  normalizeDynamicAudioRoleKey,
  getDynamicTargetStationIndex as getSharedDynamicTargetStationIndex,
  getDynamicTargetStationByRole as getSharedDynamicTargetStationByRole,
  buildStationNameCandidatesByDialect,
  checkDynamicPlaceholderAudioMatch
} from '../utils/stationAudioHealth.js'

export default {
  name: 'StationEditor',
  components: { Teleport, Transition, ColorPicker },
  props: {
    modelValue: { type: Boolean, default: false },
    station: { type: Object, default: () => ({}) },
    lineCommonAudio: { type: Object, default: () => null },
    isNew: { type: Boolean, default: false },
    currentLineFilePath: { type: String, default: '' },
    currentLineFolderPath: { type: String, default: '' },
    // 供“动态占位符音频”的健康扫描使用（start/current/next/terminal）
    currentStationIndex: { type: Number, default: -1 },
    lineMeta: { type: Object, default: () => ({}) },
    lineStations: { type: Array, default: () => [] }
  },
  emits: ['update:modelValue', 'save', 'apply-audio-to-all', 'save-line-audio', 'autosave-station-audio'],
  setup(props, { emit }) {
    const { t, locale } = useI18n()
    const ALL_DYNAMIC_AUDIO_TABS = [
      { key: 'cmn', labelKey: 'stationEditor.audioDynamicDialectCmn' },
      { key: 'yue', labelKey: 'stationEditor.audioDynamicDialectYue' },
      { key: 'wuu', labelKey: 'stationEditor.audioDynamicDialectWuu' },
      { key: 'nan', labelKey: 'stationEditor.audioDynamicDialectNan' },
      { key: 'wzh', labelKey: 'stationEditor.audioDynamicDialectWzh' },
      { key: 'en', labelKey: 'stationEditor.audioDynamicDialectEn' },
      { key: 'ja', labelKey: 'stationEditor.audioDynamicDialectJa' },
      { key: 'ko', labelKey: 'stationEditor.audioDynamicDialectKo' }
    ]
    const DEFAULT_DYNAMIC_AUDIO_TAB_KEYS = ['cmn', 'en']
    const normalizeDynamicTabKeys = (keys) => {
      const src = Array.isArray(keys) ? keys.map((k) => String(k || '').trim()).filter(Boolean) : []
      const allowed = new Set(ALL_DYNAMIC_AUDIO_TABS.map((x) => x.key))
      const seen = new Set()
      const normalized = []
      for (const k of src) {
        if (!allowed.has(k)) continue
        if (seen.has(k)) continue
        seen.add(k)
        normalized.push(k)
      }
      return normalized.length ? normalized : [...DEFAULT_DYNAMIC_AUDIO_TAB_KEYS]
    }
    const defaultStationAudio = () => ({
      separateDirection: true,
      // 动态占位音频的“语音版本/方言”偏好：用于同站多套语音
      // 常用：'cmn' | 'yue' | 'wuu' | 'en' | 'ja' | 'ko'
      dynamicDialect: 'cmn',
      // 站点编辑器顶部的“语音版本”Tab 列表（可增删/排序）
      dynamicDialectTabs: [...DEFAULT_DYNAMIC_AUDIO_TAB_KEYS],
      // 多语音版本音频列表容器：key -> { up:{list:[]}, down:{list:[]} }
      dialectLists: {},
      up: { list: [] },
      down: { list: [] }
    })
    const defaultCommonAudio = () => ({
      separateDirection: true,
      up: { list: [] },
      down: { list: [] }
    })
    const migrateToAudioList = (d) => {
      if (!d || typeof d !== 'object') return []
      if (Array.isArray(d.list)) return d.list.map((i) => ({ ...i }))
      const w = Array.isArray(d.welcome) ? d.welcome : []
      const dep = Array.isArray(d.depart) ? d.depart : []
      const arr = Array.isArray(d.arrive) ? d.arrive : []
      const e = Array.isArray(d.end) ? d.end : []
      return [...w, ...dep, ...arr, ...e].map((i) => ({ ...i }))
    }
    const normalizeTurnbackForForm = (raw) => {
      if (raw === 'pre') return 'pre'
      if (raw === 'post') return 'post'
      if (raw === true) return 'pre'
      return 'post'
    }
    const form = reactive({
      name: '',
      en: '',
      skip: false,
      door: 'left',
      dock: 'both',
      turnback: 'post',
      xfer: [],
      expressStop: false,
      stationAudio: defaultStationAudio()
    })
    const commonAudio = reactive(defaultCommonAudio())

    watch(
      () => props.station,
      (newVal) => {
        if (!newVal) return
        form.name = newVal.name || ''
        form.en = newVal.en || ''
        form.skip = newVal.skip || false
        form.door = newVal.door || 'left'
        form.dock = newVal.dock || 'both'
        form.turnback = normalizeTurnbackForForm(newVal.turnback)
        form.expressStop = newVal.expressStop !== undefined ? !!newVal.expressStop : false
        form.xfer = newVal.xfer
          ? JSON.parse(JSON.stringify(newVal.xfer.map((x) => ({ ...x, exitTransfer: x.exitTransfer || false }))))
          : []
        if (newVal.stationAudio && typeof newVal.stationAudio === 'object') {
          const sa = newVal.stationAudio
          const nextTabs = normalizeDynamicTabKeys(sa.dynamicDialectTabs)
          const nextDialect = (typeof sa.dynamicDialect === 'string' && sa.dynamicDialect.trim()) ? sa.dynamicDialect.trim() : 'cmn'
          const normalizedDialect = nextTabs.includes(nextDialect) ? nextDialect : nextTabs[0]
          const srcDialectLists = (sa.dialectLists && typeof sa.dialectLists === 'object') ? sa.dialectLists : null
          const ensureDialectBucket = (key) => {
            if (!form.stationAudio.dialectLists || typeof form.stationAudio.dialectLists !== 'object') form.stationAudio.dialectLists = {}
            if (!form.stationAudio.dialectLists[key] || typeof form.stationAudio.dialectLists[key] !== 'object') {
              form.stationAudio.dialectLists[key] = { up: { list: [] }, down: { list: [] } }
            }
            if (!form.stationAudio.dialectLists[key].up || typeof form.stationAudio.dialectLists[key].up !== 'object') form.stationAudio.dialectLists[key].up = { list: [] }
            if (!Array.isArray(form.stationAudio.dialectLists[key].up.list)) form.stationAudio.dialectLists[key].up.list = []
            if (!form.stationAudio.dialectLists[key].down || typeof form.stationAudio.dialectLists[key].down !== 'object') form.stationAudio.dialectLists[key].down = { list: [] }
            if (!Array.isArray(form.stationAudio.dialectLists[key].down.list)) form.stationAudio.dialectLists[key].down.list = []
          }
          form.stationAudio = {
            separateDirection: true,
            dynamicDialect: normalizedDialect,
            dynamicDialectTabs: nextTabs,
            dialectLists: {},
            up: { list: [] },
            down: { list: [] }
          }

          // 先合并旧数据/新数据到 dialectLists
          if (srcDialectLists) {
            for (const k of Object.keys(srcDialectLists)) {
              const kk = String(k || '').trim()
              if (!kk) continue
              const b = srcDialectLists[kk]
              ensureDialectBucket(kk)
              form.stationAudio.dialectLists[kk].up.list = migrateToAudioList(b?.up)
              form.stationAudio.dialectLists[kk].down.list = migrateToAudioList(b?.down)
            }
          }
          // 兼容：老结构只有 up/down，把它放进当前 dialect bucket（若该 bucket 为空）
          ensureDialectBucket(normalizedDialect)
          if (!form.stationAudio.dialectLists[normalizedDialect].up.list.length && !form.stationAudio.dialectLists[normalizedDialect].down.list.length) {
            form.stationAudio.dialectLists[normalizedDialect].up.list = migrateToAudioList(sa.up)
            form.stationAudio.dialectLists[normalizedDialect].down.list = migrateToAudioList(sa.down)
          }
          // 切换到当前 dialect 对应的列表
          form.stationAudio.up.list = [...form.stationAudio.dialectLists[normalizedDialect].up.list]
          form.stationAudio.down.list = [...form.stationAudio.dialectLists[normalizedDialect].down.list]
        } else {
          form.stationAudio = defaultStationAudio()
        }
      },
      { immediate: true, deep: true }
    )

    watch(
      () => props.lineCommonAudio,
      (val) => {
        const src = val && typeof val === 'object' ? val : defaultCommonAudio()
        const toList = (d) => migrateToAudioList(d)
        if (Array.isArray(src.list)) {
          commonAudio.separateDirection = false
          commonAudio.up = { list: src.list.map((i) => ({ ...i })) }
          commonAudio.down = { list: [] }
        } else {
          commonAudio.separateDirection = src.separateDirection !== false
          commonAudio.up = { list: toList(src.up) }
          commonAudio.down = { list: toList(src.down) }
        }
        // 通用音频统一为单列表，合并下行后关掉分离
        if (commonAudio.down?.list?.length) {
          commonAudio.up.list = [...commonAudio.up.list, ...commonAudio.down.list]
          commonAudio.down = { list: [] }
        }
        commonAudio.separateDirection = false
      },
      { immediate: true, deep: true }
    )

    const isDarkTheme = computed(() => {
      try {
        const el = document.documentElement
        return !!(el && (el.classList.contains('dark') || el.getAttribute('data-theme') === 'dark'))
      } catch (e) {
        return false
      }
    })

    /** 与主右键菜单一致：v-glassmorphism（含高斯开关、暗色底） */
    const menuGlassDirective = computed(() => {
      let blurOn = true
      try {
        const raw = localStorage.getItem('pids_settings_v1')
        if (raw) {
          const s = JSON.parse(raw)
          if (s && s.blurEnabled === false) blurOn = false
        }
      } catch (e) {}
      const dark = isDarkTheme.value
      if (!blurOn) return { blur: 0, opacity: 1, color: dark ? '#1c1c20' : '#ffffff' }
      return { blur: 12, opacity: 0.2, color: dark ? '#1c1c20' : '#ffffff' }
    })

    const sectionMode = ref('xfer') // 'xfer' | 'audio' | 'commonAudio'
    const audioSectionCrashed = ref(false)
    const seDebugLog = (event, extra = {}) => {
      let traceEnabled = false
      try {
        traceEnabled = localStorage.getItem('metro_pids_debug_station_editor') === '1'
      } catch (e) {}
      if (!traceEnabled) return
      try {
        const upCount = Array.isArray(form?.stationAudio?.up?.list) ? form.stationAudio.up.list.length : 0
        const downCount = Array.isArray(form?.stationAudio?.down?.list) ? form.stationAudio.down.list.length : 0
        console.warn('[StationEditor][CrashTrace]', {
          event,
          ts: new Date().toISOString(),
          modelValue: props.modelValue,
          sectionMode: sectionMode.value,
          isNew: props.isNew,
          editingName: form?.name || '',
          upCount,
          downCount,
          audioSectionCrashed: audioSectionCrashed.value,
          ...extra
        })
      } catch (e) {
        console.warn('[StationEditor][CrashTrace] log-failed', String(e))
      }
    }
    const isCloseDebugEnabled = () => {
      try {
        return localStorage.getItem('metro_pids_debug_station_editor_close') === '1'
          || localStorage.getItem('metro_pids_debug_station_editor') === '1'
      } catch (e) {
        return false
      }
    }
    const setSectionMode = (mode) => {
      seDebugLog('set-section-mode', { from: sectionMode.value, to: mode })
      sectionMode.value = mode
    }

    const dynamicAudioTabs = computed(() => {
      const keys = normalizeDynamicTabKeys(form?.stationAudio?.dynamicDialectTabs)
      return keys.map((k) => ALL_DYNAMIC_AUDIO_TABS.find((x) => x.key === k)).filter(Boolean)
    })
    const availableDynamicAudioTabOptions = computed(() => {
      const current = new Set(dynamicAudioTabs.value.map((x) => x.key))
      return ALL_DYNAMIC_AUDIO_TABS.filter((x) => !current.has(x.key))
    })
    const setDynamicDialectFromTab = (dialectKey) => {
      const k = String(dialectKey || '').trim()
      if (!k) return
      const keys = normalizeDynamicTabKeys(form?.stationAudio?.dynamicDialectTabs)
      if (!keys.includes(k)) return
      // 先把当前列表存回当前 dialect bucket，再切换加载目标 dialect bucket
      const prev = String(form.stationAudio.dynamicDialect || '').trim() || keys[0]
      if (!form.stationAudio.dialectLists || typeof form.stationAudio.dialectLists !== 'object') form.stationAudio.dialectLists = {}
      if (!form.stationAudio.dialectLists[prev] || typeof form.stationAudio.dialectLists[prev] !== 'object') {
        form.stationAudio.dialectLists[prev] = { up: { list: [] }, down: { list: [] } }
      }
      if (!form.stationAudio.dialectLists[prev].up) form.stationAudio.dialectLists[prev].up = { list: [] }
      if (!form.stationAudio.dialectLists[prev].down) form.stationAudio.dialectLists[prev].down = { list: [] }
      form.stationAudio.dialectLists[prev].up.list = JSON.parse(JSON.stringify(getAudioList('up')))
      form.stationAudio.dialectLists[prev].down.list = JSON.parse(JSON.stringify(getAudioList('down')))

      if (!form.stationAudio.dialectLists[k] || typeof form.stationAudio.dialectLists[k] !== 'object') {
        form.stationAudio.dialectLists[k] = { up: { list: [] }, down: { list: [] } }
      }
      if (!form.stationAudio.dialectLists[k].up) form.stationAudio.dialectLists[k].up = { list: [] }
      if (!Array.isArray(form.stationAudio.dialectLists[k].up.list)) form.stationAudio.dialectLists[k].up.list = []
      if (!form.stationAudio.dialectLists[k].down) form.stationAudio.dialectLists[k].down = { list: [] }
      if (!Array.isArray(form.stationAudio.dialectLists[k].down.list)) form.stationAudio.dialectLists[k].down.list = []

      form.stationAudio.up.list = JSON.parse(JSON.stringify(form.stationAudio.dialectLists[k].up.list))
      form.stationAudio.down.list = JSON.parse(JSON.stringify(form.stationAudio.dialectLists[k].down.list))
      form.stationAudio.dynamicDialect = k
      setSectionMode('audio')
    }
    const syncCurrentDialectListsForSave = () => {
      if (!form?.stationAudio || typeof form.stationAudio !== 'object') return
      const tabs = normalizeDynamicTabKeys(form.stationAudio.dynamicDialectTabs)
      const currentDialect = (() => {
        const k = String(form.stationAudio.dynamicDialect || '').trim()
        if (k && tabs.includes(k)) return k
        return tabs[0] || 'cmn'
      })()
      if (!form.stationAudio.dialectLists || typeof form.stationAudio.dialectLists !== 'object') {
        form.stationAudio.dialectLists = {}
      }
      if (!form.stationAudio.dialectLists[currentDialect] || typeof form.stationAudio.dialectLists[currentDialect] !== 'object') {
        form.stationAudio.dialectLists[currentDialect] = { up: { list: [] }, down: { list: [] } }
      }
      if (!form.stationAudio.dialectLists[currentDialect].up || typeof form.stationAudio.dialectLists[currentDialect].up !== 'object') {
        form.stationAudio.dialectLists[currentDialect].up = { list: [] }
      }
      if (!form.stationAudio.dialectLists[currentDialect].down || typeof form.stationAudio.dialectLists[currentDialect].down !== 'object') {
        form.stationAudio.dialectLists[currentDialect].down = { list: [] }
      }
      form.stationAudio.dialectLists[currentDialect].up.list = JSON.parse(JSON.stringify(getAudioList('up')))
      form.stationAudio.dialectLists[currentDialect].down.list = JSON.parse(JSON.stringify(getAudioList('down')))
      form.stationAudio.dynamicDialect = currentDialect
      form.stationAudio.dynamicDialectTabs = tabs
    }
    const addDynamicAudioTab = (dialectKey) => {
      const k = String(dialectKey || '').trim()
      if (!k) return
      const keys = normalizeDynamicTabKeys(form?.stationAudio?.dynamicDialectTabs)
      if (keys.includes(k)) return
      const next = [...keys, k]
      form.stationAudio.dynamicDialectTabs = normalizeDynamicTabKeys(next)
      if (!form.stationAudio.dynamicDialect) form.stationAudio.dynamicDialect = k
      setSectionMode('audio')
    }
    const removeDynamicAudioTab = (dialectKey) => {
      const k = String(dialectKey || '').trim()
      const keys = normalizeDynamicTabKeys(form?.stationAudio?.dynamicDialectTabs)
      if (keys.length <= 1) return
      const next = keys.filter((x) => x !== k)
      const normalized = normalizeDynamicTabKeys(next)
      form.stationAudio.dynamicDialectTabs = normalized
      if (!normalized.includes(form.stationAudio.dynamicDialect)) {
        form.stationAudio.dynamicDialect = normalized[0]
      }
    }
    const moveDynamicAudioTab = (fromIdx, delta) => {
      const keys = normalizeDynamicTabKeys(form?.stationAudio?.dynamicDialectTabs)
      const from = Number(fromIdx)
      const to = from + Number(delta)
      if (!Number.isFinite(from) || !Number.isFinite(to)) return
      if (from < 0 || from >= keys.length) return
      if (to < 0 || to >= keys.length) return
      const next = [...keys]
      const tmp = next[from]
      next[from] = next[to]
      next[to] = tmp
      form.stationAudio.dynamicDialectTabs = normalizeDynamicTabKeys(next)
    }
    const moveDynamicAudioTabTo = (fromKey, toKey) => {
      const src = String(fromKey || '').trim()
      const dst = String(toKey || '').trim()
      if (!src || !dst || src === dst) return
      const keys = normalizeDynamicTabKeys(form?.stationAudio?.dynamicDialectTabs)
      const fromIdx = keys.indexOf(src)
      const toIdx = keys.indexOf(dst)
      if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return
      const next = [...keys]
      const item = next.splice(fromIdx, 1)[0]
      next.splice(toIdx, 0, item)
      form.stationAudio.dynamicDialectTabs = normalizeDynamicTabKeys(next)
    }
    const draggingDynamicTabKey = ref('')
    const dynamicTabDragOverKey = ref('')
    const onDynamicTabDragStart = (ev, key) => {
      const k = String(key || '').trim()
      if (!k) return
      draggingDynamicTabKey.value = k
      if (ev?.dataTransfer) {
        ev.dataTransfer.effectAllowed = 'move'
        ev.dataTransfer.setData('text/dynamic-tab-key', k)
      }
    }
    const onDynamicTabDragOver = (ev, key) => {
      if (!ev) return
      ev.preventDefault()
      const k = String(key || '').trim()
      if (!k) return
      dynamicTabDragOverKey.value = k
      if (ev?.dataTransfer) ev.dataTransfer.dropEffect = 'move'
    }
    const onDynamicTabDrop = (ev, key) => {
      if (!ev) return
      ev.preventDefault()
      const dst = String(key || '').trim()
      const src = (ev?.dataTransfer?.getData('text/dynamic-tab-key') || draggingDynamicTabKey.value || '').trim()
      if (src && dst) moveDynamicAudioTabTo(src, dst)
      draggingDynamicTabKey.value = ''
      dynamicTabDragOverKey.value = ''
    }
    const onDynamicTabDragEnd = () => {
      draggingDynamicTabKey.value = ''
      dynamicTabDragOverKey.value = ''
    }
    const hasStationAudio = computed(() => {
      const up = form?.stationAudio?.up?.list
      const down = form?.stationAudio?.down?.list
      return (Array.isArray(up) && up.length > 0) || (Array.isArray(down) && down.length > 0)
    })
    const getAudioDebugStats = () => {
      const upCount = Array.isArray(form?.stationAudio?.up?.list) ? form.stationAudio.up.list.length : 0
      const downCount = Array.isArray(form?.stationAudio?.down?.list) ? form.stationAudio.down.list.length : 0
      return { upCount, downCount, total: upCount + downCount }
    }
    const lastInternalCloseMeta = ref(null)
    const debugCloseLog = (event, extra = {}) => {
      if (!isCloseDebugEnabled()) return
      if (!hasStationAudio.value) return
      const stats = getAudioDebugStats()
      console.warn('[StationEditor][CloseDebug]', {
        event,
        sectionMode: sectionMode.value,
        showXferNameEdit: showXferNameEdit.value,
        showAudioNameEdit: showAudioNameEdit.value,
        showColorPicker: showColorPicker.value,
        menuVisible: menuVisible.value,
        modelValue: props.modelValue,
        ...stats,
        ...extra
      })
      if (event === 'internal-close') {
        console.trace('[StationEditor][CloseDebug][Trace]', { reason: extra?.reason || 'unknown' })
      }
    }
    const close = (reason = 'unknown') => {
      lastInternalCloseMeta.value = { reason, at: Date.now() }
      debugCloseLog('internal-close', { reason })
      emit('update:modelValue', false)
    }
    const overlayMouseDownOnSelf = ref(false)
    const saveMouseDownArmed = ref(false)
    const saveMouseDownAt = ref(0)
    const saveMouseDownTarget = ref(null)
    const saveMouseDownPoint = ref({ x: 0, y: 0 })
    const armSaveClick = (e) => {
      if (!e || e.button !== 0) return
      saveMouseDownArmed.value = true
      saveMouseDownAt.value = Date.now()
      saveMouseDownTarget.value = e.currentTarget || null
      saveMouseDownPoint.value = {
        x: Number.isFinite(e.clientX) ? e.clientX : 0,
        y: Number.isFinite(e.clientY) ? e.clientY : 0
      }
    }
    const disarmSaveClick = () => {
      saveMouseDownArmed.value = false
      saveMouseDownAt.value = 0
      saveMouseDownTarget.value = null
      saveMouseDownPoint.value = { x: 0, y: 0 }
    }
    const onOverlayMouseDown = (e) => {
      if (!e || e.target !== saveMouseDownTarget.value) {
        disarmSaveClick()
      }
      overlayMouseDownOnSelf.value = e.target === e.currentTarget
    }
    const onOverlayClick = (e) => {
      const clickedOverlay = e.target === e.currentTarget
      if (!clickedOverlay || !overlayMouseDownOnSelf.value) return
      // 子弹窗或右键菜单打开时，不允许关闭主弹窗，避免误触发
      if (showXferNameEdit.value || showAudioNameEdit.value || showColorPicker.value || menuVisible.value) {
        debugCloseLog('overlay-click-blocked', {
          clickedOverlay,
          overlayMouseDownOnSelf: overlayMouseDownOnSelf.value
        })
        return
      }
      debugCloseLog('overlay-click-accepted', {
        clickedOverlay,
        overlayMouseDownOnSelf: overlayMouseDownOnSelf.value
      })
      close('overlay-click')
    }
    const save = async (e) => {
      const now = Date.now()
      const fromTrustedPrimaryClick = !!(e && e.type === 'click' && e.isTrusted && e.button === 0)
      const withinArmWindow = saveMouseDownArmed.value && now - saveMouseDownAt.value >= 0 && now - saveMouseDownAt.value < 1200
      const sameTarget = !!(e && saveMouseDownTarget.value && e.currentTarget === saveMouseDownTarget.value)
      const dx = Number.isFinite(e?.clientX) ? Math.abs(e.clientX - saveMouseDownPoint.value.x) : 999
      const dy = Number.isFinite(e?.clientY) ? Math.abs(e.clientY - saveMouseDownPoint.value.y) : 999
      const smallMove = dx <= 8 && dy <= 8
      const clickDetailOk = !!(e && typeof e.detail === 'number' && e.detail > 0)
      if (!fromTrustedPrimaryClick || !withinArmWindow || !sameTarget || !smallMove || !clickDetailOk) {
        debugCloseLog('save-blocked', {
          reason: !fromTrustedPrimaryClick
            ? 'not-trusted-primary-click'
            : !withinArmWindow
              ? 'not-armed'
              : !sameTarget
                ? 'target-mismatch'
                : !smallMove
                  ? 'pointer-moved-too-far'
                  : 'click-detail-invalid',
          eventType: e?.type || null,
          isTrusted: !!e?.isTrusted,
          button: typeof e?.button === 'number' ? e.button : null,
          detail: typeof e?.detail === 'number' ? e.detail : null,
          armed: saveMouseDownArmed.value,
          armAge: saveMouseDownAt.value ? now - saveMouseDownAt.value : null,
          sameTarget,
          moveDx: Number.isFinite(dx) ? dx : null,
          moveDy: Number.isFinite(dy) ? dy : null
        })
        disarmSaveClick()
        return
      }
      disarmSaveClick()
      if (!form.name) return
      // 保存前将当前编辑中的 up/down 音频回写到当前方言桶，避免重开后“丢失”
      syncCurrentDialectListsForSave()
      const isAudioSection = sectionMode.value === 'audio' || sectionMode.value === 'commonAudio'
      const payload = JSON.parse(JSON.stringify(form))
      payload.stationAudio.separateDirection = true
      if (!form.stationAudio.separateDirection) {
        payload.stationAudio.down = JSON.parse(JSON.stringify(form.stationAudio.up))
      }
      emit('save', payload)
      emit('save-line-audio', JSON.parse(JSON.stringify(commonAudio)))
      if (isAudioSection) {
        debugCloseLog('save-done-keep-open', { sectionMode: sectionMode.value })
        return
      }
      close('save')
    }
    const emitAudioAutoSave = () => {
      // 自动保存仅用于“已存在站点”的音频编辑，避免新增站点未落位时误写入
      if (props.isNew) return
      syncCurrentDialectListsForSave()
      const stationPayload = JSON.parse(JSON.stringify(form))
      stationPayload.stationAudio.separateDirection = true
      if (!form.stationAudio.separateDirection) {
        stationPayload.stationAudio.down = JSON.parse(JSON.stringify(form.stationAudio.up))
      }
      emit('autosave-station-audio', {
        station: stationPayload,
        commonAudio: JSON.parse(JSON.stringify(commonAudio))
      })
    }
    watch(
      () => props.modelValue,
      (val, oldVal) => {
        if (!oldVal || val) return
        const meta = lastInternalCloseMeta.value
        const isRecentInternal = !!(meta && Date.now() - meta.at < 600)
        debugCloseLog('modelValue-false', {
          source: isRecentInternal ? `internal:${meta.reason}` : 'external',
          internalReason: meta?.reason || null
        })
        lastInternalCloseMeta.value = null
      }
    )

    const addXfer = () => {
      form.xfer.push({ line: '', color: '#000000', suspended: false, exitTransfer: false })
    }
    const removeXfer = (idx) => form.xfer.splice(idx, 1)
    const toggleXferSuspended = (idx) => {
      const xf = form.xfer[idx]
      xf.suspended = !xf.suspended
      if (xf.suspended) xf.exitTransfer = false
    }
    const toggleExitTransfer = (idx) => {
      const xf = form.xfer[idx]
      xf.exitTransfer = !xf.exitTransfer
      if (xf.exitTransfer) xf.suspended = false
    }

    // Color picker
    const showColorPicker = ref(false)
    const colorPickerIndex = ref(-1)
    const colorPickerInitialColor = ref('#000000')
    const openColorPicker = (idx) => {
      colorPickerIndex.value = idx
      colorPickerInitialColor.value = form.xfer[idx]?.color || '#808080'
      showColorPicker.value = true
    }
    const onColorConfirm = (color) => {
      if (colorPickerIndex.value >= 0 && form.xfer[colorPickerIndex.value]) {
        form.xfer[colorPickerIndex.value].color = color
      }
      colorPickerIndex.value = -1
    }

    const hasElectronAPI = typeof window !== 'undefined' && window.electronAPI && window.electronAPI.startColorPick
    const pickColor = async (idx) => {
      if (hasElectronAPI) {
        try {
          const result = await window.electronAPI.startColorPick()
          if (result && result.ok && result.color) form.xfer[idx].color = result.color
          return
        } catch (e) {
          console.error('取色失败:', e)
        }
      }
      openColorPicker(idx)
    }

    // 换乘线路剪贴板与右键菜单（复制/粘贴 + 既有功能整合）
    const xferClipboard = ref(null) // null | { type: 'one', data } | { type: 'all', data: [] }
    const menuVisible = ref(false)
    const menuX = ref(0)
    const menuY = ref(0)
    const menuContext = ref(null) // null | { type: 'row', idx } | { type: 'section' }

    const copyXfer = (idx) => {
      const item = form.xfer[idx]
      if (!item) return
      xferClipboard.value = { type: 'one', data: JSON.parse(JSON.stringify({ ...item, exitTransfer: item.exitTransfer || false })) }
    }
    const copyAllXfer = () => {
      if (!form.xfer.length) return
      xferClipboard.value = { type: 'all', data: JSON.parse(JSON.stringify(form.xfer.map((x) => ({ ...x, exitTransfer: x.exitTransfer || false })))) }
    }
    const pasteXfer = (afterIdx) => {
      if (!xferClipboard.value) return
      const clip = xferClipboard.value
      const norm = (x) => ({ line: x.line || '', color: x.color || '#000000', suspended: !!x.suspended, exitTransfer: !!x.exitTransfer })
      if (clip.type === 'one') {
        const insertIdx = afterIdx < 0 ? form.xfer.length : afterIdx + 1
        form.xfer.splice(insertIdx, 0, norm(clip.data))
      } else if (clip.type === 'all' && Array.isArray(clip.data)) {
        const insertIdx = afterIdx < 0 ? form.xfer.length : afterIdx + 1
        clip.data.forEach((x, i) => form.xfer.splice(insertIdx + i, 0, norm(x)))
      }
      if (added > 0) emitAudioAutoSave()
    }
    const hasClipboard = computed(() => !!xferClipboard.value)

    // 在 nextTick 中调整菜单位置，防止被视口裁切，并留出顶部点击区域
    const adjustMenuPosition = (clientX, clientY) => {
      nextTick(() => {
        const menuEl = document.querySelector('[data-xfer-context-menu]')
        if (!menuEl) return
        const rect = menuEl.getBoundingClientRect()
        const anchor = (typeof document !== 'undefined' && document.getElementById) ? document.getElementById('admin-app') : null
        const vp = getEffectiveViewportRect(anchor || menuEl)
        const vw = (vp.right - vp.left) || window.innerWidth
        const vh = (vp.bottom - vp.top) || window.innerHeight
        const margin = 10
        let x = clientX
        let y = clientY

        // 横向优先向左展开
        if (((x - (vp.left || 0)) + rect.width) > vw - margin) x = clientX - rect.width
        // 纵向优先向上展开
        if (((y - (vp.top || 0)) + rect.height) > vh - margin) y = clientY - rect.height

        // 夹紧，确保不越界；菜单过高时仍可滚动
        const maxX = Math.max(margin, vw - rect.width - margin)
        const maxY = Math.max(margin, vh - rect.height - margin)
        const baseX = (vp.left || 0) + margin
        const baseY = (vp.top || 0) + margin
        x = Math.min(Math.max(x, baseX), (vp.left || 0) + maxX)
        y = Math.min(Math.max(y, baseY), (vp.top || 0) + maxY)

        menuX.value = x
        menuY.value = y
      })
    }
    const openRowMenu = (e, idx) => {
      menuX.value = e.clientX
      menuY.value = e.clientY
      menuContext.value = { type: 'row', idx }
      menuVisible.value = true
      adjustMenuPosition(e.clientX, e.clientY)
    }
    const openSectionMenu = (e, opts) => {
      menuX.value = e.clientX
      menuY.value = e.clientY
      const inferredScope = opts?.audioScope || (sectionMode.value === 'commonAudio' ? 'common' : 'station')
      const isAudio = sectionMode.value === 'audio' || !!opts?.audioDir
      menuContext.value = {
        type: 'section',
        audio: isAudio,
        audioDir: opts?.audioDir ?? (isAudio ? 'up' : undefined),
        audioScope: isAudio ? inferredScope : undefined
      }
      menuVisible.value = true
      adjustMenuPosition(e.clientX, e.clientY)
    }
    const openDynamicTabMenu = (e, dialectKey) => {
      menuX.value = e.clientX
      menuY.value = e.clientY
      menuContext.value = { type: 'dynamicAudioTab', dialectKey: String(dialectKey || '').trim() }
      menuVisible.value = true
      adjustMenuPosition(e.clientX, e.clientY)
    }
    const openDynamicTabRowMenu = (e) => {
      menuX.value = e.clientX
      menuY.value = e.clientY
      menuContext.value = { type: 'dynamicAudioTabRow' }
      menuVisible.value = true
      adjustMenuPosition(e.clientX, e.clientY)
    }
    const openSectionToggleMenu = (e) => {
      const target = e?.target
      if (!target || typeof target.closest !== 'function') {
        openSectionMenu(e)
        return
      }
      const tabBtn = target.closest('.se-dyn-tab')
      if (tabBtn) {
        const key = tabBtn.getAttribute('data-dialect-key') || ''
        openDynamicTabMenu(e, key)
        return
      }
      const tabRow = target.closest('.se-dyn-tabs')
      if (tabRow) {
        openDynamicTabRowMenu(e)
        return
      }
      openSectionMenu(e)
    }
    const openSmartSectionMenu = (e) => {
      const target = e?.target
      if (target && typeof target.closest === 'function') {
        if (target.closest('.se-dyn-tab')) {
          const btn = target.closest('.se-dyn-tab')
          const key = btn?.getAttribute('data-dialect-key') || ''
          openDynamicTabMenu(e, key)
          return
        }
        if (target.closest('.se-dyn-tabs') || target.closest('.se-section-head')) {
          openDynamicTabRowMenu(e)
          return
        }
      }
      openSectionMenu(e)
    }
    const toggleAudioSeparateDirection = () => {
      form.stationAudio.separateDirection = !form.stationAudio.separateDirection
      closeMenu()
    }
    const toggleCommonAudioSeparateDirection = () => {}
    const getAudioList = (dir) => {
      const d = form.stationAudio[dir]
      return d && Array.isArray(d.list) ? d.list : []
    }
    const getCommonAudioList = (dir) => {
      const d = commonAudio[dir]
      return d && Array.isArray(d.list) ? d.list : []
    }
    const getAudioItemPath = (item) => {
      if (!item) return ''
      // 兼容旧数据：可能直接存字符串路径
      if (typeof item === 'string') return item
      if (typeof item !== 'object') return ''
      // 兼容旧字段：path/src/filePath
      if (typeof item.path === 'string') return item.path
      if (typeof item.src === 'string') return item.src
      if (typeof item.filePath === 'string') return item.filePath
      return ''
    }
    const getAudioItemDisplayName = (item) => {
      if (!item || typeof item !== 'object') return '—'
      if (typeof item.name === 'string' && item.name.trim()) return item.name
      const p = getAudioItemPath(item)
      if (!p) return '—'
      return p.replace(/^.*[\\/]/, '') || '—'
    }
    const audioHealthByKey = ref({})
    const audioHealthScanTimer = ref(null)
    const audioHealthScanVersion = ref(0)
    const DYNAMIC_ROLE_KEYS = DYNAMIC_AUDIO_ROLE_KEYS
    const normalizeDynamicRoleKey = normalizeDynamicAudioRoleKey
    const getDynamicTargetStationIndex = (roleKey, runtimeIdx, stations, meta) => {
      return getSharedDynamicTargetStationIndex(roleKey, runtimeIdx, stations, meta)
    }
    const getDynamicTargetStationByRole = (roleKey, runtimeIdx, stations, meta) => {
      return getSharedDynamicTargetStationByRole(roleKey, runtimeIdx, stations, meta)
    }
    const isDynamicPlaceholderItemRole = (item) => {
      return !!(item && typeof item === 'object' && DYNAMIC_ROLE_KEYS.has(String(item.role || '').trim()))
    }
    const getAudioHealthKey = (scope, dir, idx, item) => {
      const path = getAudioItemPath(item)
      return `${scope || 'station'}:${dir || 'up'}:${idx}:${path}`
    }
    const getAudioHealthStatus = (scope, dir, idx, item) => {
      const key = getAudioHealthKey(scope, dir, idx, item)
      return audioHealthByKey.value[key] || 'unknown' // unknown | checking | ok | broken
    }
    const isAudioBroken = (scope, dir, idx, item) => {
      const itemPath = getAudioItemPath(item)
      if (!itemPath) return isDynamicPlaceholderItemRole(item) ? getAudioHealthStatus(scope, dir, idx, item) === 'broken' : true
      return getAudioHealthStatus(scope, dir, idx, item) === 'broken'
    }
    const setAudioHealthStatus = (scope, dir, idx, item, status) => {
      const key = getAudioHealthKey(scope, dir, idx, item)
      audioHealthByKey.value = { ...audioHealthByKey.value, [key]: status }
    }
    const queueAudioHealthScan = () => {
      if (audioHealthScanTimer.value) {
        clearTimeout(audioHealthScanTimer.value)
        audioHealthScanTimer.value = null
      }
      audioHealthScanTimer.value = setTimeout(() => {
        const scanVersion = ++audioHealthScanVersion.value

        const stationItems = []
        const dirs = form.stationAudio.separateDirection ? ['up', 'down'] : ['up']
        dirs.forEach((dir) => {
          const list = getAudioList(dir)
          list.forEach((item, idx) => stationItems.push({ scope: 'station', dir, idx, item }))
        })
        const commonUp = getCommonAudioList('up')
        commonUp.forEach((item, idx) => stationItems.push({ scope: 'common', dir: 'up', idx, item }))

        const activeKeys = new Set(stationItems.map((it) => getAudioHealthKey(it.scope, it.dir, it.idx, it.item)))
        const nextHealthByKey = {}
        Object.entries(audioHealthByKey.value).forEach(([k, v]) => {
          if (activeKeys.has(k)) nextHealthByKey[k] = v
        })

        const isDynamicPlaceholderItem = (itItem) => {
          if (!itItem || typeof itItem !== 'object') return false
          if (!DYNAMIC_ROLE_KEYS.has(String(itItem.role || '').trim())) return false
          return !getAudioItemPath(itItem)
        }

        // 先标记：没 path -> broken
        // 有 path -> 优先保留已有的 broken/ok；否则标记为 checking（避免 canCheck 暂时不可用时把 broken 覆盖掉）
        for (const it of stationItems) {
          const itemPath = getAudioItemPath(it.item)
          const key = getAudioHealthKey(it.scope, it.dir, it.idx, it.item)
          if (!itemPath) {
            if (isDynamicPlaceholderItem(it.item)) {
              const prev = audioHealthByKey.value[key]
              nextHealthByKey[key] = prev === 'broken' ? 'broken' : 'checking'
            } else {
              nextHealthByKey[key] = 'broken'
            }
            continue
          }
          const prev = audioHealthByKey.value[key]
          if (prev === 'broken' || prev === 'ok') nextHealthByKey[key] = prev
          else nextHealthByKey[key] = 'checking'
        }
        const doScan = async () => {
          const api = typeof window !== 'undefined' ? window.electronAPI : null
          const resolveAudioPath = api?.lines?.resolveAudioPath
          const findAudioByStationName = api?.lines?.findAudioByStationName
          const lineFileOrDir =
            currentLineFilePathRef.value || currentLineFolderPathRef.value || (typeof window !== 'undefined' ? window.__currentLineFilePath || '' : '')
          const canCheckResolve = typeof resolveAudioPath === 'function' && !!lineFileOrDir
          const canCheckDynamic = typeof findAudioByStationName === 'function' && !!lineFileOrDir

          // 缓存：同一个 itemPath 只解析一次
          const okCache = new Map()
          const dynamicOkCache = new Map() // `${lineFileOrDir}::${role}::${stationName}::${language}::${dialect}`

          const languageKey = (() => {
            try {
              return locale?.value || 'zh-CN'
            } catch (e) {
              return 'zh-CN'
            }
          })()
          const dialectKey = (form?.stationAudio && typeof form.stationAudio.dynamicDialect === 'string' && form.stationAudio.dynamicDialect.trim())
            ? form.stationAudio.dynamicDialect.trim()
            : 'cmn'

          const lineMeta = props.lineMeta || {}
          const lineStations = Array.isArray(props.lineStations) ? props.lineStations : []
          const runtimeIdx = typeof props.currentStationIndex === 'number' ? props.currentStationIndex : -1
          const peerStationNamesForMatch = collectPeerStationNamesForAudioMatch(lineStations)

          // 动态占位符“按站名找音频”：不能只用 UI i18n 的 languageKey 取单一字段；
          // 否则 dialect tab（如 en/ja/ko）对应的数据目录里即使存在正确音频，也可能因为站名字段选错而被误判 broken。
          const getTargetStationByRole = (roleKey) => getDynamicTargetStationByRole(roleKey, runtimeIdx, lineStations, lineMeta)

          const getStationNameCandidatesByTargetDialect = (st) => buildStationNameCandidatesByDialect(st, dialectKey)

          // 如果当前线路路径/IPC 暂时不可用：保留当前状态，避免“损坏提示闪一下后消失”
          if (!canCheckResolve && !canCheckDynamic) {
            return
          }

          for (const it of stationItems) {
            if (scanVersion !== audioHealthScanVersion.value) return // stale
            const itemPath = getAudioItemPath(it.item)
            const key = getAudioHealthKey(it.scope, it.dir, it.idx, it.item)

            if (!itemPath) {
              if (isDynamicPlaceholderItem(it.item) && canCheckDynamic) {
                const roleKey = it.item.role
                const stationForRole = getTargetStationByRole(roleKey)
                const stationNameCandidates = getStationNameCandidatesByTargetDialect(stationForRole)
                const foundOk = await checkDynamicPlaceholderAudioMatch({
                  findAudioByStationName,
                  lineFileOrDir,
                  roleKey,
                  stationForRole,
                  stationNameCandidates,
                  languageKey,
                  dialectKey,
                  peerStationNames: peerStationNamesForMatch,
                  dynamicOkCache
                })
                nextHealthByKey[key] = foundOk ? 'ok' : 'broken'
              } else {
                nextHealthByKey[key] = 'broken'
              }
              continue
            }

            if (!canCheckResolve) continue
            if (okCache.has(itemPath)) {
              nextHealthByKey[key] = okCache.get(itemPath) ? 'ok' : 'broken'
              continue
            }

            try {
              const res = await resolveAudioPath(lineFileOrDir, itemPath)
              const ok = !!res?.ok
              okCache.set(itemPath, ok)
              nextHealthByKey[key] = ok ? 'ok' : 'broken'
            } catch (e) {
              okCache.set(itemPath, false)
              nextHealthByKey[key] = 'broken'
            }
          }

          if (scanVersion === audioHealthScanVersion.value) {
            audioHealthByKey.value = nextHealthByKey
          }
        }

        void doScan()
      }, 140)
    }

    // 预扫描：为每个 dialect tab 统计“缺失/损坏数量”
    // 目的：不需要用户点开对应 Tab，也能在 tab 旁边直接提示异常。
    const stationAudioBrokenCountByDialectKey = ref({})
    let stationAudioBrokenCountScanToken = 0
    const stationAudioBrokenCountScanTimer = ref(null)

    const getStationNameCandidatesByTargetDialectForScan = (st, targetDialectKey) => buildStationNameCandidatesByDialect(st, targetDialectKey)

    const queueStationAudioBrokenCountScan = () => {
      if (stationAudioBrokenCountScanTimer.value) {
        clearTimeout(stationAudioBrokenCountScanTimer.value)
        stationAudioBrokenCountScanTimer.value = null
      }
      stationAudioBrokenCountScanTimer.value = setTimeout(async () => {
        const token = ++stationAudioBrokenCountScanToken
        try {
          const api = typeof window !== 'undefined' ? window.electronAPI : null
          const resolveAudioPath = api?.lines?.resolveAudioPath
          const findAudioByStationName = api?.lines?.findAudioByStationName

          const canCheckResolve = typeof resolveAudioPath === 'function' && !!(currentLineFilePathRef.value || currentLineFolderPathRef.value || (typeof window !== 'undefined' ? window.__currentLineFilePath || '' : ''))
          const canCheckDynamic = typeof findAudioByStationName === 'function' && !!(currentLineFilePathRef.value || currentLineFolderPathRef.value || (typeof window !== 'undefined' ? window.__currentLineFilePath || '' : ''))
          if (!canCheckResolve && !canCheckDynamic) return

          const lineFileOrDir = currentLineFilePathRef.value || currentLineFolderPathRef.value || (typeof window !== 'undefined' ? window.__currentLineFilePath || '' : '')
          const languageKey = (() => {
            try { return locale?.value || 'zh-CN' } catch (e) { return 'zh-CN' }
          })()
          const runtimeIdx = typeof props.currentStationIndex === 'number' ? props.currentStationIndex : -1
          const lineStations = Array.isArray(props.lineStations) ? props.lineStations : []
          const lineMeta = props.lineMeta || {}
          const peerStationNamesForMatch = collectPeerStationNamesForAudioMatch(lineStations)

          const isDynamicPlaceholderItemRole = (item) => {
            return !!(item && typeof item === 'object' && DYNAMIC_ROLE_KEYS.has(String(item.role || '').trim()))
          }
          const getTargetStationByRole = (roleKey) => getDynamicTargetStationByRole(roleKey, runtimeIdx, lineStations, lineMeta)

          const dialectKeysToCheck = (dynamicAudioTabs.value || []).map((x) => x.key)
          const dialectKeys = dialectKeysToCheck.length ? dialectKeysToCheck : ['cmn']

          const okCache = new Map()
          const dynamicOkCache = new Map()
          const countsByDialectKey = {}

          for (const dialectKey of dialectKeys) {
            let brokenCount = 0
            const dialectBucket = form?.stationAudio?.dialectLists && typeof form.stationAudio.dialectLists === 'object'
              ? form.stationAudio.dialectLists[dialectKey]
              : null
            const dirs = form?.stationAudio?.separateDirection ? ['up', 'down'] : ['up']

            for (const dir of dirs) {
              const list =
                dialectBucket && dialectBucket[dir] && Array.isArray(dialectBucket[dir].list)
                  ? dialectBucket[dir].list
                  : (dialectKey === String(form?.stationAudio?.dynamicDialect || '').trim() && Array.isArray(form?.stationAudio?.[dir]?.list))
                    ? form.stationAudio[dir].list
                    : []
              if (!Array.isArray(list) || !list.length) continue

              for (let idx = 0; idx < list.length; idx++) {
                const item = list[idx]
                const itemPath = getAudioItemPath(item)
                if (!itemPath) {
                  if (isDynamicPlaceholderItemRole(item) && canCheckDynamic) {
                    const roleKey = normalizeDynamicRoleKey(item.role)
                    const stationForRole = getTargetStationByRole(roleKey)
                    const candidates = getStationNameCandidatesByTargetDialectForScan(stationForRole, dialectKey)
                    const foundOk = await checkDynamicPlaceholderAudioMatch({
                      findAudioByStationName,
                      lineFileOrDir,
                      roleKey,
                      stationForRole,
                      stationNameCandidates: candidates,
                      languageKey,
                      dialectKey,
                      peerStationNames: peerStationNamesForMatch,
                      dynamicOkCache
                    })
                    if (!foundOk) brokenCount++
                  } else {
                    // 非动态占位符（或无法检查动态）：缺失 path 视为异常计数
                    if (canCheckResolve || canCheckDynamic) brokenCount++
                  }
                  continue
                }

                if (!canCheckResolve) continue
                if (okCache.has(itemPath)) {
                  if (!okCache.get(itemPath)) brokenCount++
                  continue
                }
                try {
                  const res = await resolveAudioPath(lineFileOrDir, itemPath)
                  const ok = !!res?.ok
                  okCache.set(itemPath, ok)
                  if (!ok) brokenCount++
                } catch (e) {
                  okCache.set(itemPath, false)
                  brokenCount++
                }
              }
            }
            countsByDialectKey[dialectKey] = brokenCount
          }

          if (token === stationAudioBrokenCountScanToken) {
            stationAudioBrokenCountByDialectKey.value = countsByDialectKey
          }
        } catch (e) {
          // keep silent
        }
      }, 160)
    }

    const stationAudioSignature = computed(() => {
      const up = getAudioList('up').map((it) => getAudioItemPath(it)).join('|')
      const down = getAudioList('down').map((it) => getAudioItemPath(it)).join('|')
      return `${form.stationAudio.separateDirection ? '1' : '0'}::${up}::${down}`
    })
    const commonAudioSignature = computed(() => getCommonAudioList('up').map((it) => getAudioItemPath(it)).join('|'))

    // 音频按钮提示数量：与列表三角形完全同一套判定
    // 只要列表显示了三角形，这里就应该统计到对应数量。
    const stationAudioBrokenCount = computed(() => {
      // 强制把扫描版本纳入依赖，确保 tab header 能随扫描结果同步更新
      void audioHealthScanVersion.value
      let c = 0
      const dirs = form.stationAudio.separateDirection ? ['up', 'down'] : ['up']
      for (const dir of dirs) {
        const list = getAudioList(dir)
        for (let idx = 0; idx < list.length; idx++) {
          const item = list[idx]
          const itemPath = getAudioItemPath(item)
          if (!itemPath) {
              if (isDynamicPlaceholderItemRole(item)) {
                const st = getAudioHealthStatus('station', dir, idx, item)
                if (st === 'broken' || st === 'checking') c++
              } else {
                c++
              }
              continue
          }
          const st = getAudioHealthStatus('station', dir, idx, item)
          // tab 需要在“扫描中”就能及时提示，所以把 checking 也算进去
          if (st === 'broken' || st === 'checking') c++
        }
      }
      return c
    })

    // StationEditor 的 commonAudio UI 只展示 up 方向，所以这里只统计 up。
    const commonAudioBrokenCount = computed(() => {
      void audioHealthScanVersion.value
      let c = 0
      const dir = 'up'
      const list = getCommonAudioList(dir)
      for (let idx = 0; idx < list.length; idx++) {
        const item = list[idx]
        const itemPath = getAudioItemPath(item)
        if (!itemPath) {
          if (isDynamicPlaceholderItemRole(item)) {
            const st = getAudioHealthStatus('common', dir, idx, item)
            if (st === 'broken' || st === 'checking') c++
          } else {
            c++
          }
          continue
        }
        const st = getAudioHealthStatus('common', dir, idx, item)
        if (st === 'broken' || st === 'checking') c++
      }
      return c
    })
    const currentLineFilePathRef = computed(() =>
      (props.currentLineFilePath && props.currentLineFilePath.trim()) ||
      (typeof window !== 'undefined' && window.__currentLineFilePath) ||
      ''
    )
    const currentLineFolderPathRef = computed(() => {
      // 优先使用 props 传入的值
      if (props.currentLineFolderPath && props.currentLineFolderPath.trim()) {
        return props.currentLineFolderPath.trim()
      }
      // 备用：从 currentLineFilePath 提取目录
      const filePath = currentLineFilePathRef.value
      if (filePath) {
        const lastSlash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'))
        if (lastSlash >= 0) {
          return filePath.substring(0, lastSlash)
        }
      }
      return ''
    })

    // （调试日志已移除；请在确认功能正常后再打开）

    const notify = (msg, title = '') => {
      if (typeof window !== 'undefined' && window.electronAPI?.showNotification) {
        window.electronAPI.showNotification(title || msg, msg, {}).catch(() => {})
      }
    }
    const AUDIO_FILE_FILTER = { name: 'Audio', extensions: ['mp3', 'flac', 'ogg', 'wav', 'm4a', 'aac'] }
    const getCurrentDialectAudioSubDir = () => {
      const raw = String(form?.stationAudio?.dynamicDialect || 'cmn').trim().toLowerCase()
      const safe = raw.replace(/[^a-z0-9_-]/g, '')
      // UI dialect key 的 `cmn` 对应落盘目录我们统一用 `zhcn`。
      if (!safe) return 'zhcn'
      if (safe === 'cmn') return 'zhcn'
      return safe
    }
    // 导入音频的落盘目录必须以“当前编辑器选中的语言/方言 Tab”为准：
    // - 用户在某个 Tab 下点“导入”，就应写入对应 audio/<tab>/ 目录
    // - 不应根据用户本地源文件夹名称推断语种
    const ensureDynamicAudioSubDir = () => getCurrentDialectAudioSubDir()
    const addAudioItem = async (dir) => {
      const api = typeof window !== 'undefined' ? window.electronAPI : null
      let lineFilePath = currentLineFilePathRef.value
      let lineFolderPath = currentLineFolderPathRef.value
      
      // 如果都没有，尝试从 currentFilePath 提取目录
      if (!lineFolderPath && lineFilePath) {
        const lastSlash = Math.max(lineFilePath.lastIndexOf('/'), lineFilePath.lastIndexOf('\\'))
        if (lastSlash >= 0) {
          lineFolderPath = lineFilePath.substring(0, lastSlash)
        }
      }
      
      if (!api?.showOpenDialog || !api?.lines?.copyAudioToLineDir) {
        notify(t('stationEditor.audioAddNeedElectron'), t('stationEditor.audioAdd'))
        return
      }
      
      // 允许使用线路目录（从文件夹加载时）或线路文件路径（保存后）
      // 如果都没有，主进程会使用默认线路目录（getLinesDir(null)）
      const lineDirOrFilePath = lineFilePath || lineFolderPath || null
      const openRes = await api.showOpenDialog({
        filters: [AUDIO_FILE_FILTER],
        properties: ['openFile', 'multiSelections']
      })
      if (openRes.canceled || !openRes.filePaths || !openRes.filePaths.length) return
      const list = form.stationAudio[dir].list
      if (!Array.isArray(list)) form.stationAudio[dir].list = []
      let added = 0
      for (const sourcePath of openRes.filePaths) {
        if (!sourcePath) continue
        const fileName = sourcePath.replace(/^.*[\\/]/, '')
        try {
          // copyAudioToLineDir 支持传入线路目录或线路文件路径
          const res = await api.lines.copyAudioToLineDir(lineDirOrFilePath, sourcePath, {
            // 按当前 Tab 决定落盘目录（需要时自动创建对应子目录）
            subDir: ensureDynamicAudioSubDir()
          })
          if (res && res.ok && res.relativePath) {
            list.push({ path: res.relativePath, name: fileName })
            added++
          } else if (added === 0) {
            notify(res?.error || t('stationEditor.audioAddCopyFailed'), t('stationEditor.audioAdd'))
          }
        } catch (err) {
          console.warn('addAudioItem copyAudioToLineDir failed', err)
          if (added === 0) notify(t('stationEditor.audioAddCopyFailed'), t('stationEditor.audioAdd'))
        }
      }
    }

    const addDynamicAudioPlaceholder = (dir, roleKey, extra = {}) => {
      if (!dir || !form?.stationAudio) return
      const targetList = form.stationAudio[dir]?.list
      if (!Array.isArray(targetList)) return

      const roleName =
        roleKey === 'start' ? t('stationEditor.audioDynamicRoleStart')
          : roleKey === 'next' ? t('stationEditor.audioDynamicRoleNext')
            : roleKey === 'current' ? t('stationEditor.audioDynamicRoleCurrent')
              : roleKey === 'door' ? t('stationEditor.audioDynamicDoorAuto')
              : roleKey === 'terminal' ? t('stationEditor.audioDynamicRoleTerminal')
                : (roleKey || '')

      const doorSide = extra && typeof extra === 'object' ? (extra.doorSide || extra.door) : ''
      const payload = { role: roleKey, name: roleName, dialectKey: form.stationAudio.dynamicDialect || 'cmn' }
      if (doorSide) payload.doorSide = String(doorSide)
      targetList.push(payload)
      queueAudioHealthScan()
      queueStationAudioBrokenCountScan()
    }

    const importStationAudioFiles = async (dir, filePaths) => {
      if (!dir || !Array.isArray(filePaths) || !filePaths.length) return
      const api = typeof window !== 'undefined' ? window.electronAPI : null
      if (!api?.lines?.copyAudioToLineDir) return

      const list = form.stationAudio[dir]?.list
      if (!Array.isArray(list)) return

      let added = 0
      for (const sourcePath of filePaths) {
        if (!sourcePath || typeof sourcePath !== 'string') continue
        const fileName = sourcePath.replace(/^.*[\\/]/, '')
        try {
          const res = await api.lines.copyAudioToLineDir(
            currentLineFilePathRef.value || currentLineFolderPathRef.value || '',
            sourcePath,
            { subDir: ensureDynamicAudioSubDir() }
          )
          if (res && res.ok && res.relativePath) {
            list.push({ path: res.relativePath, name: fileName })
            added++
          }
        } catch (e) {
          // ignore single file errors; we keep importing others
        }
      }

      if (added > 0) {
        queueAudioHealthScan()
        queueStationAudioBrokenCountScan()
        emitAudioAutoSave()
      }
    }

    const importStationAudioSingle = async (dir) => {
      const api = typeof window !== 'undefined' ? window.electronAPI : null
      if (!api?.showOpenDialog || !api?.lines?.copyAudioToLineDir) {
        notify(t('stationEditor.audioAddNeedElectron'), t('stationEditor.audioAdd'))
        return
      }
      const lineDirOrFilePath = currentLineFilePathRef.value || currentLineFolderPathRef.value
      if (!lineDirOrFilePath) {
        notify(t('stationEditor.audioAddNeedSaveLine'), t('stationEditor.audioAdd'))
        return
      }
      const openRes = await api.showOpenDialog({
        filters: [AUDIO_FILE_FILTER],
        properties: ['openFile']
      })
      if (openRes?.canceled || !openRes.filePaths || !openRes.filePaths.length) return
      await importStationAudioFiles(dir || 'up', openRes.filePaths)
    }

    const importStationAudioMultiple = async (dir) => {
      const api = typeof window !== 'undefined' ? window.electronAPI : null
      if (!api?.showOpenDialog || !api?.lines?.copyAudioToLineDir) {
        notify(t('stationEditor.audioAddNeedElectron'), t('stationEditor.audioAdd'))
        return
      }
      const lineDirOrFilePath = currentLineFilePathRef.value || currentLineFolderPathRef.value
      if (!lineDirOrFilePath) {
        notify(t('stationEditor.audioAddNeedSaveLine'), t('stationEditor.audioAdd'))
        return
      }
      const openRes = await api.showOpenDialog({
        filters: [AUDIO_FILE_FILTER],
        properties: ['openFile', 'multiSelections']
      })
      if (openRes?.canceled || !openRes.filePaths || !openRes.filePaths.length) return
      await importStationAudioFiles(dir || 'up', openRes.filePaths)
    }

    const importDynamicAudioFiles = async () => {
      const api = typeof window !== 'undefined' ? window.electronAPI : null
      if (!api?.showOpenDialog || !api?.lines?.copyAudioToLineDir || !api?.lines?.findAudioByStationName) {
        notify(t('stationEditor.audioAddNeedElectron'), t('stationEditor.audioAdd'))
        return
      }
      const lineDirOrFilePath = currentLineFilePathRef.value || currentLineFolderPathRef.value
      if (!lineDirOrFilePath) {
        notify(t('stationEditor.audioAddNeedSaveLine'), t('stationEditor.audioAdd'))
        return
      }

      const openRes = await api.showOpenDialog({
        filters: [AUDIO_FILE_FILTER],
        properties: ['openFile', 'multiSelections']
      })
      if (openRes?.canceled || !openRes.filePaths || !openRes.filePaths.length) return

      const DYNAMIC_ROLE_KEYS = new Set(['start', 'current', 'next', 'terminal', 'end', 'door'])
      const runtimeIdx = typeof props.currentStationIndex === 'number' ? props.currentStationIndex : -1
      const lineStations = Array.isArray(props.lineStations) ? props.lineStations : []
      const lineMeta = props.lineMeta || {}
      const languageKey = (() => {
        try { return locale?.value || 'zh-CN' } catch (e) { return 'zh-CN' }
      })()
      const dialectKey = (form?.stationAudio && typeof form.stationAudio.dynamicDialect === 'string' && form.stationAudio.dynamicDialect.trim())
        ? form.stationAudio.dynamicDialect.trim()
        : 'cmn'
      const getStationNameByLang = (st) => {
        if (!st || typeof st !== 'object') return ''
        if (languageKey === 'en') return st.en || st.name || ''
        if (String(languageKey || '').startsWith('zh')) return st.name || st.zh || st.cn || st.en || ''
        return st.name || st.en || ''
      }
      const getStationNameCandidates = (st) => {
        if (!st || typeof st !== 'object') return []
        const out = []
        const pushUniq = (v) => {
          const t = String(v || '').trim()
          if (!t) return
          if (!out.includes(t)) out.push(t)
        }
        pushUniq(getStationNameByLang(st))
        pushUniq(st.name)
        pushUniq(st.en)
        pushUniq(st.zh)
        pushUniq(st.cn)
        return out
      }
      const expandStationNameCandidates = (rawCandidates) => {
        const out = []
        const pushUniq = (v) => {
          const t = String(v || '').trim()
          if (!t) return
          if (!out.includes(t)) out.push(t)
        }
        for (const c of (Array.isArray(rawCandidates) ? rawCandidates : [])) {
          const s = String(c || '').trim()
          if (!s) continue
          pushUniq(s)
          pushUniq(s.replace(/\s+/g, ''))
          if (/^\d+$/.test(s)) {
            const n = String(Number(s))
            if (n !== 'NaN') pushUniq(n)
          }
        }
        return out
      }

      const requiredTargets = new Map() // `${role}::${idx}` -> { roleKey, stationName, stationNameCandidates, doorSide? }
      const dirs = form.stationAudio.separateDirection ? ['up', 'down'] : ['up']
      for (const dir of dirs) {
        const list = getAudioList(dir)
        for (const item of list) {
          if (!item || typeof item !== 'object') continue
          const rawRoleKey = String(item.role || '').trim()
          if (!DYNAMIC_ROLE_KEYS.has(rawRoleKey)) continue
          const roleKey = normalizeDynamicRoleKey(rawRoleKey)
          const hasPath = !!(item.path || item.src || item.filePath)
          if (hasPath) continue

          const targetIdx = getDynamicTargetStationIndex(roleKey, runtimeIdx, lineStations, lineMeta)
          if (typeof targetIdx !== 'number' || targetIdx < 0 || targetIdx >= lineStations.length) continue

          const stationName = getStationNameByLang(lineStations[targetIdx])
          const stationNameCandidates = getStationNameCandidates(lineStations[targetIdx])
          if (!stationName) continue
          const target = { roleKey, stationName, stationNameCandidates }
          if (roleKey === 'door') {
            const st = lineStations[targetIdx]
            const doorSide = String(st?.doorSide || st?.door || '').trim()
            if (doorSide) target.doorSide = doorSide
          }
          requiredTargets.set(`${roleKey}::${targetIdx}`, target)
        }
      }
      // 兼容无占位项的线路：退化为“按站名匹配”统计
      if (!requiredTargets.size) {
        for (let i = 0; i < lineStations.length; i++) {
          const stationName = getStationNameByLang(lineStations[i])
          const stationNameCandidates = getStationNameCandidates(lineStations[i])
          if (!stationName) continue
          requiredTargets.set(`nameOnly::${i}`, { roleKey: '', stationName, stationNameCandidates })
        }
      }

      audioImportModalVisible.value = true
      audioImportStage.value = 'copy'
      audioImportProcessed.value = 0
      audioImportTotal.value = openRes.filePaths.length
      audioImportCopyOk.value = 0
      audioImportCopyFail.value = 0
      audioImportTargetStations.value = requiredTargets.size
      audioImportSuccessStations.value = 0
      audioImportFailStations.value = 0
      audioImportFailedStations.value = []
      const importedRelativePaths = []
      const copyFailures = []
      const matchFailures = []

      for (let i = 0; i < openRes.filePaths.length; i++) {
        const sourcePath = openRes.filePaths[i]
        audioImportProcessed.value = i + 1
        const subDir = ensureDynamicAudioSubDir()
        if (!subDir) {
          audioImportCopyFail.value++
          copyFailures.push({
            sourcePath,
            subDir: '',
            error: 'empty-subdir'
          })
          continue
        }
        const resCopy = await api.lines.copyAudioToLineDir(lineDirOrFilePath, sourcePath, {
          subDir,
          // 动态音频按“站名文件名”匹配，必须保留本次导入文件名，避免 MD5 复用导致站名丢失。
          preserveFileName: true
        })
        if (resCopy && resCopy.ok) {
          audioImportCopyOk.value++
          if (typeof resCopy.relativePath === 'string' && resCopy.relativePath) importedRelativePaths.push(resCopy.relativePath)
        }
        else {
          audioImportCopyFail.value++
          copyFailures.push({
            sourcePath,
            subDir,
            error: String(resCopy?.error || 'copy-failed')
          })
          console.warn('[StationEditor][DynamicAudioImport][files][copy-fail]', {
            sourcePath,
            subDir,
            lineDirOrFilePath,
            error: String(resCopy?.error || '')
          })
        }
      }

      audioImportStage.value = 'match'

      const peerStationNames = collectPeerStationNamesForAudioMatch(lineStations)
      const targets = Array.from(requiredTargets.values())
      for (const target of targets) {
        const opts = target.roleKey
          ? { role: target.roleKey, doorSide: target.doorSide || '', languageKey, dialectKey, importedRelativePaths, peerStationNames }
          : { languageKey, dialectKey, importedRelativePaths, peerStationNames }
        const candidates = Array.isArray(target.stationNameCandidates) && target.stationNameCandidates.length
          ? target.stationNameCandidates
          : [target.stationName]
        const expandedCandidates = expandStationNameCandidates(candidates)
        let matched = false
        let lastErr = ''
        let lastRes = null
        const candidateAttempts = []
        for (const nameCandidate of expandedCandidates) {
          const resFind = await api.lines.findAudioByStationName(lineDirOrFilePath, nameCandidate, opts)
          lastRes = resFind
          candidateAttempts.push({
            candidate: nameCandidate,
            ok: !!resFind?.ok,
            relativePath: resFind?.relativePath || '',
            error: String(resFind?.error || '')
          })
          if (resFind?.ok && resFind?.relativePath) {
            matched = true
            break
          }
          lastErr = String(resFind?.error || '')
        }
        if (matched) {
          audioImportSuccessStations.value++
        } else {
          audioImportFailStations.value++
          audioImportFailedStations.value.push(target.stationName)
          matchFailures.push({
            stationName: target.stationName,
            role: target.roleKey || '',
            languageKey,
            dialectKey,
            expandedCandidates,
            lastErr,
            candidateAttempts
          })
          console.warn('[StationEditor][DynamicAudioImport][files][no-match]', {
            stationName: target.stationName,
            role: target.roleKey || '',
            dialectKey,
            languageKey,
            candidates: expandedCandidates,
            lastErr,
            debug: lastRes?.debug || null
          })
        }
      }

      audioImportFailedStations.value = Array.from(new Set(audioImportFailedStations.value))
      const filesSummary = {
        lineDirOrFilePath,
        languageKey,
        dialectKey,
        selectedFileCount: openRes.filePaths.length,
        copyOk: audioImportCopyOk.value,
        copyFail: audioImportCopyFail.value,
        matchSuccess: audioImportSuccessStations.value,
        matchFail: audioImportFailStations.value,
        failedStations: [...audioImportFailedStations.value],
        copyFailures,
        matchFailures
      }
      if (audioImportCopyFail.value > 0 || audioImportFailStations.value > 0) console.warn('[StationEditor][DynamicAudioImport][files][summary]', filesSummary)
      else console.info('[StationEditor][DynamicAudioImport][files][summary]', filesSummary)
      audioImportStage.value = 'done'
      queueAudioHealthScan()
      queueStationAudioBrokenCountScan()
      if (audioImportSuccessStations.value === 0 && audioImportFailStations.value === 0) {
        console.warn('[StationEditor][DynamicAudioImport] import finished with 0/0, keep result modal', {
          source: 'files',
          lineDirOrFilePath,
          languageKey,
          dialectKey,
          selectedFileCount: openRes.filePaths.length
        })
      }
    }

    const importDynamicAudioFolder = async () => {
      const api = typeof window !== 'undefined' ? window.electronAPI : null
      if (!api?.showOpenDialog || !api?.lines?.copyAudioToLineDir || !api?.lines?.listAudioFilesInDir || !api?.lines?.findAudioByStationName) {
        notify(t('stationEditor.audioAddNeedElectron'), t('stationEditor.audioAdd'))
        return
      }
      const lineDirOrFilePath = currentLineFilePathRef.value || currentLineFolderPathRef.value
      if (!lineDirOrFilePath) {
        notify(t('stationEditor.audioAddNeedSaveLine'), t('stationEditor.audioAdd'))
        return
      }

      const isWindows = (() => {
        try { return /win/i.test(String(navigator?.platform || '')) } catch (e) { return false }
      })()
      if (isWindows) {
        notify('可直接选择文件夹；也可选择该文件夹内任意一个音频文件，系统会自动按其所在目录批量导入。', t('stationEditor.audioImportDynamicFolder'))
      }
      const openRes = await api.showOpenDialog({
        // Windows 下同时允许“选文件夹/选文件”：
        // - 选文件夹：直接按该目录导入
        // - 选文件：自动回退到父目录做文件夹导入
        // 这样既保留文件夹导入入口，也兼容看文件名后再定位目录的需求。
        properties: isWindows ? ['openDirectory', 'openFile'] : ['openDirectory'],
        filters: [AUDIO_FILE_FILTER]
      })
      if (openRes?.canceled || !openRes.filePaths || !openRes.filePaths.length) return
      const pickedPath = String(openRes.filePaths[0] || '').trim()
      if (!pickedPath) return
      const toParentDir = (p) => {
        const s = String(p || '')
        const idx = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'))
        return idx > 0 ? s.slice(0, idx) : ''
      }
      const isLikelyAudioFilePath = (p) => /\.(mp3|wav|ogg|flac|m4a|aac)$/i.test(String(p || ''))
      const folderPath = isLikelyAudioFilePath(pickedPath) ? toParentDir(pickedPath) : pickedPath
      if (!folderPath) return

      const DYNAMIC_ROLE_KEYS = new Set(['start', 'current', 'next', 'terminal', 'end', 'door'])
      const runtimeIdx = typeof props.currentStationIndex === 'number' ? props.currentStationIndex : -1
      const lineStations = Array.isArray(props.lineStations) ? props.lineStations : []
      const lineMeta = props.lineMeta || {}
      const languageKey = (() => {
        try { return locale?.value || 'zh-CN' } catch (e) { return 'zh-CN' }
      })()
      const dialectKey = (form?.stationAudio && typeof form.stationAudio.dynamicDialect === 'string' && form.stationAudio.dynamicDialect.trim())
        ? form.stationAudio.dynamicDialect.trim()
        : 'cmn'
      const getStationNameByLang = (st) => {
        if (!st || typeof st !== 'object') return ''
        if (languageKey === 'en') return st.en || st.name || ''
        if (String(languageKey || '').startsWith('zh')) return st.name || st.zh || st.cn || st.en || ''
        return st.name || st.en || ''
      }
      const getStationNameCandidates = (st) => {
        if (!st || typeof st !== 'object') return []
        const out = []
        const pushUniq = (v) => {
          const t = String(v || '').trim()
          if (!t) return
          if (!out.includes(t)) out.push(t)
        }
        pushUniq(getStationNameByLang(st))
        pushUniq(st.name)
        pushUniq(st.en)
        pushUniq(st.zh)
        pushUniq(st.cn)
        return out
      }
      const expandStationNameCandidates = (rawCandidates) => {
        const out = []
        const pushUniq = (v) => {
          const t = String(v || '').trim()
          if (!t) return
          if (!out.includes(t)) out.push(t)
        }
        for (const c of (Array.isArray(rawCandidates) ? rawCandidates : [])) {
          const s = String(c || '').trim()
          if (!s) continue
          pushUniq(s)
          pushUniq(s.replace(/\s+/g, ''))
          if (/^\d+$/.test(s)) {
            const n = String(Number(s))
            if (n !== 'NaN') pushUniq(n)
          }
        }
        return out
      }

      const requiredTargets = new Map() // `${role}::${idx}` -> { roleKey, stationName, stationNameCandidates }
      const dirs = form.stationAudio.separateDirection ? ['up', 'down'] : ['up']
      for (const dir of dirs) {
        const list = getAudioList(dir)
        for (const item of list) {
          if (!item || typeof item !== 'object') continue
          const rawRoleKey = String(item.role || '').trim()
          if (!DYNAMIC_ROLE_KEYS.has(rawRoleKey)) continue
          const roleKey = normalizeDynamicRoleKey(rawRoleKey)
          const hasPath = !!(item.path || item.src || item.filePath)
          if (hasPath) continue

          const targetIdx = getDynamicTargetStationIndex(roleKey, runtimeIdx, lineStations, lineMeta)
          if (typeof targetIdx !== 'number' || targetIdx < 0 || targetIdx >= lineStations.length) continue

          const stationName = getStationNameByLang(lineStations[targetIdx])
          const stationNameCandidates = getStationNameCandidates(lineStations[targetIdx])
          if (!stationName) continue
          const target = { roleKey, stationName, stationNameCandidates }
          if (roleKey === 'door') {
            const st = lineStations[targetIdx]
            const doorSide = String(st?.doorSide || st?.door || '').trim()
            if (doorSide) target.doorSide = doorSide
          }
          requiredTargets.set(`${roleKey}::${targetIdx}`, target)
        }
      }
      // 兼容无占位项的线路：退化为“按站名匹配”统计
      if (!requiredTargets.size) {
        for (let i = 0; i < lineStations.length; i++) {
          const stationName = getStationNameByLang(lineStations[i])
          const stationNameCandidates = getStationNameCandidates(lineStations[i])
          if (!stationName) continue
          requiredTargets.set(`nameOnly::${i}`, { roleKey: '', stationName, stationNameCandidates })
        }
      }

      audioImportModalVisible.value = true
      audioImportStage.value = 'copy'
      audioImportProcessed.value = 0
      audioImportTotal.value = 0
      audioImportCopyOk.value = 0
      audioImportCopyFail.value = 0
      audioImportTargetStations.value = requiredTargets.size
      audioImportSuccessStations.value = 0
      audioImportFailStations.value = 0
      audioImportFailedStations.value = []
      const importedRelativePaths = []
      const copyFailures = []
      const matchFailures = []

      const listRes = await api.lines.listAudioFilesInDir(folderPath, { extensions: ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac'], maxFiles: 20000 })
      if (!listRes?.ok || !Array.isArray(listRes.files) || !listRes.files.length) {
        notify(listRes?.error || t('stationEditor.audioImportNoFiles'), t('stationEditor.audioImportDynamicTitle'))
        closeAudioImportModal()
        return
      }

      audioImportTotal.value = listRes.files.length

      for (let i = 0; i < listRes.files.length; i++) {
        const sourcePath = listRes.files[i]
        audioImportProcessed.value = i + 1
        const subDir = ensureDynamicAudioSubDir()
        if (!subDir) {
          audioImportCopyFail.value++
          copyFailures.push({
            sourcePath,
            subDir: '',
            error: 'empty-subdir'
          })
          continue
        }
        const resCopy = await api.lines.copyAudioToLineDir(lineDirOrFilePath, sourcePath, {
          subDir,
          // 动态音频按“站名文件名”匹配，必须保留本次导入文件名，避免 MD5 复用导致站名丢失。
          preserveFileName: true
        })
        if (resCopy && resCopy.ok) {
          audioImportCopyOk.value++
          if (typeof resCopy.relativePath === 'string' && resCopy.relativePath) importedRelativePaths.push(resCopy.relativePath)
        }
        else {
          audioImportCopyFail.value++
          copyFailures.push({
            sourcePath,
            subDir,
            error: String(resCopy?.error || 'copy-failed')
          })
          console.warn('[StationEditor][DynamicAudioImport][folder][copy-fail]', {
            sourcePath,
            subDir,
            lineDirOrFilePath,
            error: String(resCopy?.error || '')
          })
        }
      }

      audioImportStage.value = 'match'

      const peerStationNames = collectPeerStationNamesForAudioMatch(lineStations)
      const targets = Array.from(requiredTargets.values())
      for (const target of targets) {
        const opts = target.roleKey
          ? { role: target.roleKey, doorSide: target.doorSide || '', languageKey, dialectKey, importedRelativePaths, peerStationNames }
          : { languageKey, dialectKey, importedRelativePaths, peerStationNames }
        const candidates = Array.isArray(target.stationNameCandidates) && target.stationNameCandidates.length
          ? target.stationNameCandidates
          : [target.stationName]
        const expandedCandidates = expandStationNameCandidates(candidates)
        let matched = false
        let lastErr = ''
        let lastRes = null
        const candidateAttempts = []
        for (const nameCandidate of expandedCandidates) {
          const resFind = await api.lines.findAudioByStationName(lineDirOrFilePath, nameCandidate, opts)
          lastRes = resFind
          candidateAttempts.push({
            candidate: nameCandidate,
            ok: !!resFind?.ok,
            relativePath: resFind?.relativePath || '',
            error: String(resFind?.error || '')
          })
          if (resFind?.ok && resFind?.relativePath) {
            matched = true
            break
          }
          lastErr = String(resFind?.error || '')
        }
        if (matched) {
          audioImportSuccessStations.value++
        } else {
          audioImportFailStations.value++
          audioImportFailedStations.value.push(target.stationName)
          matchFailures.push({
            stationName: target.stationName,
            role: target.roleKey || '',
            languageKey,
            dialectKey,
            expandedCandidates,
            lastErr,
            candidateAttempts
          })
          console.warn('[StationEditor][DynamicAudioImport][folder][no-match]', {
            stationName: target.stationName,
            role: target.roleKey || '',
            dialectKey,
            languageKey,
            candidates: expandedCandidates,
            lastErr,
            debug: lastRes?.debug || null
          })
        }
      }

      // 去重 failed station 名称（按最终展示更友好）
      audioImportFailedStations.value = Array.from(new Set(audioImportFailedStations.value))
      const folderSummary = {
        lineDirOrFilePath,
        folderPath,
        languageKey,
        dialectKey,
        scannedFileCount: listRes.files.length,
        copyOk: audioImportCopyOk.value,
        copyFail: audioImportCopyFail.value,
        matchSuccess: audioImportSuccessStations.value,
        matchFail: audioImportFailStations.value,
        failedStations: [...audioImportFailedStations.value],
        copyFailures,
        matchFailures
      }
      if (audioImportCopyFail.value > 0 || audioImportFailStations.value > 0) console.warn('[StationEditor][DynamicAudioImport][folder][summary]', folderSummary)
      else console.info('[StationEditor][DynamicAudioImport][folder][summary]', folderSummary)

      audioImportStage.value = 'done'
      queueAudioHealthScan()
      if (audioImportSuccessStations.value === 0 && audioImportFailStations.value === 0) {
        console.warn('[StationEditor][DynamicAudioImport] import finished with 0/0, keep result modal', {
          source: 'folder',
          lineDirOrFilePath,
          folderPath,
          languageKey,
          dialectKey,
          scannedFileCount: listRes.files.length
        })
      }
    }
    const removeAudioItem = (dir, idx) => {
      const list = form.stationAudio[dir].list
      if (Array.isArray(list) && idx >= 0 && idx < list.length) {
        list.splice(idx, 1)
        audioSelectedByDir.value = { ...audioSelectedByDir.value, [dir]: new Set() }
        audioLastClickedIndex.value = { ...audioLastClickedIndex.value, [dir]: -1 }
      }
    }
    const moveAudioItem = (dir, fromIdx, toIdx) => {
      const list = form.stationAudio[dir].list
      if (!Array.isArray(list) || fromIdx === toIdx || fromIdx < 0 || toIdx < 0 || fromIdx >= list.length || toIdx >= list.length) return
      const item = list.splice(fromIdx, 1)[0]
      const insertIdx = fromIdx < toIdx ? toIdx - 1 : toIdx
      list.splice(insertIdx, 0, item)
      audioSelectedByDir.value = { ...audioSelectedByDir.value, [dir]: new Set() }
      audioLastClickedIndex.value = { ...audioLastClickedIndex.value, [dir]: -1 }
    }
    const closeMenu = () => {
      menuVisible.value = false
      menuContext.value = null
      dynamicAudioHover.value = false
      importAudioHover.value = false
      if (dynamicAudioHoverTimer) {
        clearTimeout(dynamicAudioHoverTimer)
        dynamicAudioHoverTimer = null
      }
      if (importAudioHoverTimer) {
        clearTimeout(importAudioHoverTimer)
        importAudioHoverTimer = null
      }
    }
    const runAndClose = (fn) => {
      if (typeof fn === 'function') fn()
      closeMenu()
    }

    // 换乘线路名称编辑弹窗（改）
    const showXferNameEdit = ref(false)
    const xferNameEditIdx = ref(-1)
    const xferNameEditValue = ref('')
    const openXferNameEdit = (idx) => {
      if (idx < 0 || idx >= form.xfer.length) return
      xferNameEditIdx.value = idx
      xferNameEditValue.value = form.xfer[idx].line || ''
      showXferNameEdit.value = true
    }
    const closeXferNameEdit = () => {
      showXferNameEdit.value = false
      xferNameEditIdx.value = -1
    }
    const confirmXferNameEdit = () => {
      if (xferNameEditIdx.value >= 0 && form.xfer[xferNameEditIdx.value]) {
        form.xfer[xferNameEditIdx.value].line = (xferNameEditValue.value || '').trim()
      }
      closeXferNameEdit()
    }

    // 音频重命名
    const showAudioNameEdit = ref(false)
    const audioNameEditDir = ref('up')
    const audioNameEditIdx = ref(-1)
    const audioNameEditApplyIndices = ref([])
    const audioNameEditScope = ref('station')
    const audioNameEditValue = ref('')
    const openAudioNameEdit = (dir, idx, scope = 'station') => {
      const list = scope === 'common' ? getCommonAudioList(dir) : getAudioList(dir)
      if (idx < 0 || idx >= list.length) return
      audioNameEditScope.value = scope
      audioNameEditDir.value = dir || 'up'
      const applyIndices = []
      if (scope === 'station') {
        const selected = getSelectedAudioIndicesOrdered(dir)
        if (selected && selected.length) applyIndices.push(...selected)
        else applyIndices.push(idx)
      } else {
        applyIndices.push(idx)
      }
      audioNameEditApplyIndices.value = Array.from(new Set(applyIndices))
      audioNameEditIdx.value = audioNameEditApplyIndices.value[0] ?? idx
      audioNameEditValue.value = getAudioItemDisplayName(list[idx]) === '—' ? '' : getAudioItemDisplayName(list[idx])
      showAudioNameEdit.value = true
    }
    const closeAudioNameEdit = () => {
      showAudioNameEdit.value = false
      audioNameEditIdx.value = -1
      audioNameEditApplyIndices.value = []
    }
    const confirmAudioNameEdit = () => {
      const dir = audioNameEditDir.value || 'up'
      const list = audioNameEditScope.value === 'common' ? getCommonAudioList(dir) : form.stationAudio[dir]?.list
      if (Array.isArray(list) && audioNameEditApplyIndices.value && audioNameEditApplyIndices.value.length) {
        const v = (audioNameEditValue.value || '').trim()
        for (const i of audioNameEditApplyIndices.value) {
          const item = list[i]
          if (item) item.name = v
        }
      }
      closeAudioNameEdit()
    }

    // 音频多选：按 Ctrl 多选、Shift 连选，逻辑与 Windows 一致
    const audioSelectedByDir = ref({ up: new Set(), down: new Set() })
    const audioLastClickedIndex = ref({ up: -1, down: -1 })
    watch(
      () => props.station,
      () => {
        audioSelectedByDir.value = { up: new Set(), down: new Set() }
        audioLastClickedIndex.value = { up: -1, down: -1 }
      }
    )
    const isAudioRowSelected = (dir, idx) => audioSelectedByDir.value[dir] && audioSelectedByDir.value[dir].has(idx)
    const onAudioRowClick = (e, dir, idx) => {
      const list = getAudioList(dir)
      if (idx < 0 || idx >= list.length) return
      const set = audioSelectedByDir.value[dir] || new Set()
      const last = audioLastClickedIndex.value[dir]
      if (e.ctrlKey || e.metaKey) {
        const next = new Set(set)
        if (next.has(idx)) next.delete(idx)
        else next.add(idx)
        audioSelectedByDir.value = { ...audioSelectedByDir.value, [dir]: next }
        audioLastClickedIndex.value = { ...audioLastClickedIndex.value, [dir]: idx }
      } else if (e.shiftKey && last >= 0) {
        const low = Math.min(last, idx)
        const high = Math.max(last, idx)
        const next = new Set(set)
        for (let i = low; i <= high; i++) next.add(i)
        audioSelectedByDir.value = { ...audioSelectedByDir.value, [dir]: next }
        audioLastClickedIndex.value = { ...audioLastClickedIndex.value, [dir]: idx }
      } else {
        audioSelectedByDir.value = { ...audioSelectedByDir.value, [dir]: new Set([idx]) }
        audioLastClickedIndex.value = { ...audioLastClickedIndex.value, [dir]: idx }
      }
    }
    const getAudioDisplayNumber = (dir, idx, scope = 'station') => {
      const list = scope === 'common' ? getCommonAudioList(dir) : getAudioList(dir)
      const item = list[idx]
      if (!item) return { arrive: null, depart: null }
      let arriveNum = null
      let departNum = null
      let ai = 0
      let di = 0
      for (let i = 0; i < list.length; i++) {
        const m = list[i].modes
        if (m && m.arrive) {
          ai++
          if (i === idx) arriveNum = ai
        }
        if (m && m.depart) {
          di++
          if (i === idx) departNum = di
        }
      }
      return { arrive: arriveNum, depart: departNum }
    }
    const toggleCommonAudioApplied = (dir, idx) => {
      const list = getCommonAudioList(dir)
      const item = list && list[idx]
      if (!item) return
      item.applied = !item.applied
    }
    const COMMON_APPLY_TAGS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12']
    const COMMON_APPLY_KEYS = COMMON_APPLY_TAGS.map((k) => k.toUpperCase())
    const getCommonApplyLabel = (dir, idx) => {
      const list = getCommonAudioList(dir)
      if (!list || !list[idx]) return null
      let appliedCount = 0
      for (let i = 0; i < list.length && appliedCount < COMMON_APPLY_TAGS.length; i++) {
        if (list[i]?.applied) {
          const tag = COMMON_APPLY_TAGS[appliedCount]
          if (i === idx) return tag
          appliedCount++
        }
      }
      return null
    }
    const handleCommonAudioHotkey = (e) => {
      if (sectionMode.value !== 'commonAudio') return
      const target = e?.target
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return
      const key = (e.key || '').toUpperCase()
      const list = getCommonAudioList('up')
      if (!list.length) return
      let appliedOrder = 0
      let targetIdx = -1
      for (let i = 0; i < list.length && appliedOrder < COMMON_APPLY_KEYS.length; i++) {
        if (list[i]?.applied) {
          if (COMMON_APPLY_KEYS[appliedOrder] === key) {
            targetIdx = i
            break
          }
          appliedOrder++
        }
      }
      if (targetIdx >= 0) {
        playAudioItem('up', targetIdx, 'common')
        e.preventDefault()
      }
    }
    onMounted(() => window.addEventListener('keydown', handleCommonAudioHotkey))
    onBeforeUnmount(() => window.removeEventListener('keydown', handleCommonAudioHotkey))

    // StationEditor 弹窗需要毛玻璃效果时：若全局启用了 html.blur-disabled，会通过 CSS 禁用 backdrop-filter。
    // 这里在弹窗打开期间临时移除，并用 MutationObserver 防止其它逻辑把它重新加回去；关闭后恢复，避免影响全局设置。
    let __prevBlurDisabledClass = null
    let __blurDisabledMutationObserver = null
    watch(
      [
        () => props.modelValue,
        () => sectionMode.value,
        stationAudioSignature,
        commonAudioSignature,
        () => currentLineFilePathRef.value,
        () => currentLineFolderPathRef.value,
        // 动态音频健康扫描依赖：站名字段的语言/方言选择、以及“当前运行站点索引”
        // 如果不把这些纳入依赖，可能导致“提示已经过期”：显示损坏但实际文件没坏，或反过来漏提示。
        () => form?.stationAudio?.dynamicDialect,
        () => locale?.value,
        () => props.currentStationIndex,
        () => props.lineMeta?.startIdx,
        () => props.lineMeta?.termIdx
      ],
      ([visible, mode]) => {
        if (!visible || audioSectionCrashed.value) return
        seDebugLog('watch-scan-trigger', { mode, visible })
        // 弹窗可见时，尽量保证“音频缺失提示(按钮圆点/三角形)”及时更新
        // 这样即使当前子页不是 audio，也能在站点编辑页先显示状态
        queueAudioHealthScan()
        queueStationAudioBrokenCountScan()
      }
    )
    watch(
      () => props.modelValue,
      (visible) => {
        seDebugLog('watch-modelValue', { visible })

        try {
          if (typeof document !== 'undefined') {
            const html = document.documentElement
            const hasBlurDisabled = html.classList.contains('blur-disabled')

            const enableBlurForDialog = () => {
              if (html.classList.contains('blur-disabled')) {
                html.classList.remove('blur-disabled')
              }
            }

            const restoreBlurForDialog = () => {
              if (__blurDisabledMutationObserver) {
                __blurDisabledMutationObserver.disconnect()
                __blurDisabledMutationObserver = null
              }
              if (__prevBlurDisabledClass) html.classList.add('blur-disabled')
              __prevBlurDisabledClass = null
            }

            if (visible) {
              __prevBlurDisabledClass = hasBlurDisabled
              enableBlurForDialog()

              // 如果外部逻辑在弹窗打开期间再次切回 blur-disabled，这里会立刻拉回，保证 blur 一直生效
              if (!__blurDisabledMutationObserver) {
                __blurDisabledMutationObserver = new MutationObserver(() => {
                  enableBlurForDialog()
                })
                __blurDisabledMutationObserver.observe(html, {
                  attributes: true,
                  attributeFilter: ['class'],
                })
              }
            } else {
              restoreBlurForDialog()
            }
          }
        } catch (e) {
          // ignore
        }

        if (visible) {
          audioSectionCrashed.value = false
          // 打开站点编辑弹窗后就预扫描一次，确保“车站音频”按钮上的缺失提示也能立刻显示
          queueAudioHealthScan()
          queueStationAudioBrokenCountScan()
        }
      }
    )
    onErrorCaptured((err, instance, info) => {
      try {
        if (sectionMode.value === 'audio' || sectionMode.value === 'commonAudio') {
          console.error('[StationEditor][AudioSectionErrorCaptured]', { err, info })
          seDebugLog('error-captured', {
            info,
            errorMessage: err?.message || String(err),
            stack: err?.stack || ''
          })
          audioSectionCrashed.value = true
          return false
        }
      } catch (e) {}
      return true
    })
    const onWindowError = (ev) => {
      seDebugLog('window-error', {
        message: ev?.message || '',
        filename: ev?.filename || '',
        lineno: ev?.lineno || null,
        colno: ev?.colno || null,
        errorMessage: ev?.error?.message || '',
        stack: ev?.error?.stack || ''
      })
    }
    const onWindowRejection = (ev) => {
      const reason = ev?.reason
      seDebugLog('window-unhandledrejection', {
        reasonType: typeof reason,
        reasonMessage: reason?.message || String(reason || ''),
        stack: reason?.stack || ''
      })
    }
    onMounted(() => {
      if (typeof window !== 'undefined') {
        window.addEventListener('error', onWindowError)
        window.addEventListener('unhandledrejection', onWindowRejection)
      }
      seDebugLog('mounted')
    })
    onBeforeUnmount(() => {
      // 防止组件销毁时遗留观察器或恢复逻辑没执行
      try {
        if (__blurDisabledMutationObserver) {
          __blurDisabledMutationObserver.disconnect()
          __blurDisabledMutationObserver = null
        }
        if (__prevBlurDisabledClass && typeof document !== 'undefined') {
          document.documentElement.classList.add('blur-disabled')
        }
        __prevBlurDisabledClass = null
      } catch (e) {}

      if (audioHealthScanTimer.value) {
        clearTimeout(audioHealthScanTimer.value)
        audioHealthScanTimer.value = null
      }
      audioHealthScanVersion.value++
      if (typeof window !== 'undefined') {
        window.removeEventListener('error', onWindowError)
        window.removeEventListener('unhandledrejection', onWindowRejection)
      }
      seDebugLog('before-unmount')
    })
    // 进站/出站颜色条：进站=蓝色，出站=绿色，无=灰色
    // 与 Ant Design 色板一致：主色 / 成功 / 警告
    const getAudioArriveDepartColor = (item) => {
      if (!item || !item.modes) return null
      if (item.applied) return '#faad14'
      if (item.modes.arrive) return '#1677ff'
      if (item.modes.depart) return '#52c41a'
      return null
    }
    const getSelectedAudioIndicesOrdered = (dir) => {
      const set = audioSelectedByDir.value[dir]
      if (!set || !set.size) return []
      return Array.from(set).sort((a, b) => a - b)
    }
    const hasAudioSelection = (dir) => {
      const set = audioSelectedByDir.value[dir]
      return set && set.size > 0
    }
    const getSelectedAudioItemsInOrder = (dir) => {
      const list = getAudioList(dir)
      const indices = getSelectedAudioIndicesOrdered(dir)
      return indices.map((i) => JSON.parse(JSON.stringify(list[i]))).filter(Boolean)
    }
    const applySelectedToAllStations = (dir, target) => {
      const items = getSelectedAudioItemsInOrder(dir)
      const indices = getSelectedAudioIndicesOrdered(dir)
      if (!items.length) return
      emit('apply-audio-to-all', {
        dir,
        items,
        indices,
        target: target || 'both', // 'up' | 'down' | 'both'
        separateDirection: true,
        // 当前语音 Tab（方言/语言版本）的 key：用于把“应用到所有站”的结果写到正确的 dialect bucket
        dialectKey: String(form?.stationAudio?.dynamicDialect || 'cmn')
      })
      closeMenu()
    }
    const openAudioRowMenu = (e, dir, idx) => {
      const list = getAudioList(dir)
      if (idx < 0 || idx >= list.length) return
      const set = audioSelectedByDir.value[dir] || new Set()
      const last = audioLastClickedIndex.value[dir]
      if (e.ctrlKey || e.metaKey) {
        const next = new Set(set)
        if (next.has(idx)) next.delete(idx)
        else next.add(idx)
        audioSelectedByDir.value = { ...audioSelectedByDir.value, [dir]: next }
        audioLastClickedIndex.value = { ...audioLastClickedIndex.value, [dir]: idx }
      } else if (e.shiftKey && last >= 0) {
        const low = Math.min(last, idx)
        const high = Math.max(last, idx)
        const next = new Set(set)
        for (let i = low; i <= high; i++) next.add(i)
        audioSelectedByDir.value = { ...audioSelectedByDir.value, [dir]: next }
        audioLastClickedIndex.value = { ...audioLastClickedIndex.value, [dir]: idx }
      } else {
        if (!set.has(idx)) {
          audioSelectedByDir.value = { ...audioSelectedByDir.value, [dir]: new Set([idx]) }
          audioLastClickedIndex.value = { ...audioLastClickedIndex.value, [dir]: idx }
        }
      }
      menuX.value = e.clientX
      menuY.value = e.clientY
      menuContext.value = { type: 'audioRow', dir, idx }
      menuVisible.value = true
      adjustMenuPosition(e.clientX, e.clientY)
    }
    const openCommonAudioRowMenu = (e, dir, idx) => {
      const list = getCommonAudioList(dir)
      if (idx < 0 || idx >= list.length) return
      menuX.value = e.clientX
      menuY.value = e.clientY
      menuContext.value = { type: 'commonAudioRow', dir, idx }
      menuVisible.value = true
      adjustMenuPosition(e.clientX, e.clientY)
    }
    const audioClipboard = ref(null)
    const copyAudioItem = (dir, idx) => {
      const list = form.stationAudio?.[dir]?.list
      const item = list && list[idx]
      if (!item) return
      audioClipboard.value = { items: [JSON.parse(JSON.stringify(item))] }
    }
    const copyAudioItems = (dir, indices) => {
      const list = form.stationAudio?.[dir]?.list
      if (!Array.isArray(list)) return
      const safeIndices = Array.isArray(indices) ? indices : []
      const items = safeIndices
        .map((i) => list?.[i])
        .filter(Boolean)
        .map((it) => JSON.parse(JSON.stringify(it)))
      if (items.length) audioClipboard.value = { items }
    }
    const pasteAudioItem = (dir, afterIdx, item) => {
      const list = form.stationAudio[dir].list
      if (!Array.isArray(list)) return
      if (!item) return
      const insertIdx = afterIdx < 0 ? list.length : afterIdx + 1
      const cloned = JSON.parse(JSON.stringify(item))
      // 动态占位符（start/current/next/terminal）在不同语音 Tab 之间复制时，
      // dialectKey 应随“当前 Tab”变化，否则会导致匹配/解析仍按旧语种进行。
      if (isDynamicPlaceholderItemRole(cloned) && !getAudioItemPath(cloned)) {
        const curDialect = String(form?.stationAudio?.dynamicDialect || 'cmn').trim() || 'cmn'
        cloned.dialectKey = curDialect
      }
      list.splice(insertIdx, 0, cloned)
    }
    const getAudioClipboardItems = () => {
      const clip = audioClipboard.value
      if (!clip) return []
      if (Array.isArray(clip.items)) return clip.items
      // 兼容旧结构
      if (clip.item) return [clip.item]
      return []
    }
    const pasteAudioToSelectionOrEnd = (dir) => {
      const clipItems = getAudioClipboardItems()
      if (!clipItems.length) return
      const targets = getSelectedAudioIndicesOrdered(dir)
      if (targets && targets.length) {
        // 从大到小插入，避免前面的插入改变后续索引
        // 如果 clipboard items 数量与 targets 数量一致，则按顺序一一对应插入；否则回退为复制第 1 个 item。
        const oneToOne = clipItems.length === targets.length
        const idxMap = new Map(targets.map((t, i) => [t, i]))
        const desc = [...targets].sort((a, b) => b - a)
        for (const afterIdx of desc) {
          const ci = oneToOne ? idxMap.get(afterIdx) : 0
          const item = clipItems[typeof ci === 'number' ? ci : 0] || clipItems[0]
          pasteAudioItem(dir, afterIdx, item)
        }
        return
      }
      // 无选中行：把 clipboard 的多个条目按顺序追加到末尾
      const list = form.stationAudio?.[dir]?.list
      if (!Array.isArray(list)) return
      list.push(...clipItems.map((it) => {
        const cloned = JSON.parse(JSON.stringify(it))
        if (isDynamicPlaceholderItemRole(cloned) && !getAudioItemPath(cloned)) {
          const curDialect = String(form?.stationAudio?.dynamicDialect || 'cmn').trim() || 'cmn'
          cloned.dialectKey = curDialect
        }
        return cloned
      }))
    }
    const getMenuTargetAudioIndices = (dir, idx) => {
      const selected = getSelectedAudioIndicesOrdered(dir)
      if (selected && selected.length) return selected
      return [idx]
    }
    const playAudioForMenuSelection = (dir, idx) => {
      const targets = getMenuTargetAudioIndices(dir, idx)
      const list = form.stationAudio?.[dir]?.list || []
      const hasPathTargets = targets.filter((i) => !!getAudioItemPath(list?.[i]))
      const targetIdx = hasPathTargets.length
        ? (hasPathTargets.includes(idx) ? idx : hasPathTargets[0])
        : targets[0]
      if (typeof targetIdx !== 'number') return
      playAudioItem(dir, targetIdx)
    }
    const copyAudioForMenuSelection = (dir, idx) => {
      const targets = getMenuTargetAudioIndices(dir, idx)
      if (!targets || !targets.length) return
      // 右键菜单触发时，如果存在多选，则把多选对应的多个音频一起放入剪贴板
      copyAudioItems(dir, targets)
    }
    const pasteAudioForMenuSelection = (dir, idx) => {
      const targets = getMenuTargetAudioIndices(dir, idx)
      if (!targets || !targets.length) return
      const clipItems = getAudioClipboardItems()
      if (!clipItems.length) return
      // 从大到小插入，避免索引在插入过程中被影响
      // 如果 clipboard items 数量与 targets 数量一致，则按顺序一一对应插入；否则回退为复制第 1 个 item。
      const oneToOne = clipItems.length === targets.length
      const idxMap = new Map(targets.map((t, i) => [t, i]))
      const desc = [...targets].sort((a, b) => b - a)
      for (const afterIdx of desc) {
        const ci = oneToOne ? idxMap.get(afterIdx) : 0
        const item = clipItems[typeof ci === 'number' ? ci : 0] || clipItems[0]
        pasteAudioItem(dir, afterIdx, item)
      }
    }
    const deleteAudioForMenuSelection = (dir, idx) => {
      const targets = getMenuTargetAudioIndices(dir, idx)
      if (!targets || !targets.length) return
      const list = form.stationAudio?.[dir]?.list
      if (!Array.isArray(list)) return
      const desc = [...targets].sort((a, b) => b - a)
      for (const delIdx of desc) {
        if (delIdx >= 0 && delIdx < list.length) list.splice(delIdx, 1)
      }
      audioSelectedByDir.value = { ...audioSelectedByDir.value, [dir]: new Set() }
      audioLastClickedIndex.value = { ...audioLastClickedIndex.value, [dir]: -1 }
    }
    const isAudioPlayDisabledForMenu = (dir, idx) => {
      const targets = getMenuTargetAudioIndices(dir, idx)
      const list = form.stationAudio?.[dir]?.list || []
      return targets.every((i) => !getAudioItemPath(list?.[i]))
    }
    const hasAudioClipboard = computed(() => !!audioClipboard.value)
    const commonAudioClipboard = ref(null)
    const copyCommonAudioItem = (dir, idx, cut = false) => {
      const list = getCommonAudioList(dir)
      const item = list && list[idx]
      if (item) {
        commonAudioClipboard.value = {
          item: JSON.parse(JSON.stringify(item)),
          cut,
          fromDir: dir,
          fromIdx: idx
        }
      }
    }
    const cutCommonAudioItem = (dir, idx) => copyCommonAudioItem(dir, idx, true)
    const pasteCommonAudioItem = (dir, afterIdx) => {
      const clip = commonAudioClipboard.value
      if (!clip) return
      const list = getCommonAudioList(dir)
      if (!Array.isArray(list)) return
      let insertIdx = afterIdx < 0 ? list.length : afterIdx + 1
      if (clip.cut) {
        const srcList = getCommonAudioList(clip.fromDir)
        if (srcList && clip.fromIdx >= 0 && clip.fromIdx < srcList.length) {
          srcList.splice(clip.fromIdx, 1)
          if (clip.fromDir === dir && clip.fromIdx <= insertIdx) insertIdx -= 1
        }
      }
      const safeIdx = Math.max(0, Math.min(insertIdx, list.length))
      list.splice(safeIdx, 0, JSON.parse(JSON.stringify(clip.item)))
      if (clip.cut) commonAudioClipboard.value = null
    }
    const hasCommonAudioClipboard = computed(() => !!commonAudioClipboard.value)
    // 进站/出站二选一：勾选进站则取消出站，勾选出站则取消进站
    const toggleAudioItemMode = (dir, idx, key, scope = 'station') => {
      const list = scope === 'common' ? getCommonAudioList(dir) : form.stationAudio[dir].list
      const item = list && list[idx]
      if (!item) return
      if (key === 'disabledInNormal') {
        item.disabledInNormal = !item.disabledInNormal
        return
      }
      if (!item.modes) item.modes = {}
      if (key === 'arrive') {
        item.modes.arrive = !item.modes.arrive
        if (item.modes.arrive) item.modes.depart = false
      } else if (key === 'depart') {
        item.modes.depart = !item.modes.depart
        if (item.modes.depart) item.modes.arrive = false
      } else if (key === 'originStation') {
        item.modes.originStation = !item.modes.originStation
        if (item.modes.originStation) item.modes.terminalStation = false
      } else if (key === 'terminalStation') {
        item.modes.terminalStation = !item.modes.terminalStation
        if (item.modes.terminalStation) item.modes.originStation = false
      } else {
        item.modes[key] = !item.modes[key]
      }
    }
    // 对选中项批量应用模式切换（支持 Ctrl/Shift 多选）
    const toggleAudioItemModeForSelected = (dir, key) => {
      const indices = getSelectedAudioIndicesOrdered(dir)
      if (indices.length === 0) return
      for (const idx of indices) toggleAudioItemMode(dir, idx, key)
    }
    const anySelectedHasMode = (dir, key) => {
      const indices = getSelectedAudioIndicesOrdered(dir)
      if (indices.length === 0) return false
      const list = getAudioList(dir)
      if (key === 'disabledInNormal') {
        return indices.some((i) => list[i] && list[i].disabledInNormal)
      }
      return indices.some((i) => list[i] && list[i].modes && list[i].modes[key])
    }
    let previewAudio = null
    const stopPreviewAudio = () => {
      if (previewAudio) {
        previewAudio.pause()
        previewAudio = null
      }
    }
    const playAudioItem = (dir, idx, scope = 'station') => {
      const list = scope === 'common' ? getCommonAudioList(dir) : form.stationAudio[dir]?.list
      const item = list && list[idx]
      const itemPath = getAudioItemPath(item)
      const api = typeof window !== 'undefined' ? window.electronAPI : null
      if (!api?.lines?.resolveAudioPath) return
      let lineFilePath = currentLineFilePathRef.value || currentLineFolderPathRef.value
      if (!lineFilePath && typeof window !== 'undefined') lineFilePath = window.__currentLineFilePath || ''
      if (!lineFilePath) return

      // 动态占位符：右键播放时 item 本身没有 path，需要先通过站名解析相对音频路径再播放。
      if (!itemPath && isDynamicPlaceholderItemRole(item)) {
        // role 可能包含 `end`，但动态匹配用的逻辑里会把 end 视为 terminal
        const roleKey = normalizeDynamicRoleKey(item?.role)
        const stations = Array.isArray(props.lineStations) ? props.lineStations : []
        const lineMeta = props.lineMeta || {}
        const runtimeIdx = typeof props.currentStationIndex === 'number' ? props.currentStationIndex : -1

        const languageKey = (() => {
          try { return locale?.value || 'zh-CN' } catch (e) { return 'zh-CN' }
        })()

        // 优先使用占位项的 dialectKey，其次使用当前 tab 的 dynamicDialect
        const dialectKey = (() => {
          const d = typeof item?.dialectKey === 'string' && item.dialectKey.trim() ? item.dialectKey.trim() : ''
          const fallback = typeof form?.stationAudio?.dynamicDialect === 'string' && form.stationAudio.dynamicDialect.trim()
            ? form.stationAudio.dynamicDialect.trim()
            : 'cmn'
          return d || fallback
        })()

        const getStationNameByTargetDialect = (st) => {
          const d = String(dialectKey || '').toLowerCase()
          const isEnglish = d === 'en' || d.startsWith('en')
          if (isEnglish) return st?.en || st?.name || ''
          // 中文系列（cmn/zhcn/zhtw）默认用中文站名字段去匹配 zhcn 目录
          if (d.startsWith('cmn') || d === 'cmn' || d.startsWith('zh') || d === 'zhcn' || d === 'zhtw' || d.startsWith('auto') === false) {
            return st?.name || st?.zh || st?.cn || st?.en || ''
          }
          return st?.name || st?.en || ''
        }

        const getTargetStationByRole = () => getDynamicTargetStationByRole(roleKey, runtimeIdx, stations, lineMeta)

        const findAudioByStationName = api?.lines?.findAudioByStationName
        if (typeof findAudioByStationName !== 'function') return
        const targetStation = getTargetStationByRole()
        const stationNameForRole = getStationNameByTargetDialect(targetStation)
        if (!stationNameForRole) return

        // 为了方便你验证语种选择是否正确，打印关键参数（只在右键播放时触发）
        console.warn('[StationEditor][dynamic-rightplay]', {
          role: roleKey,
          languageKey,
          dialectKey,
          stationNameForRole,
          lineFileOrDir: lineFilePath
        })

        const doorSideForRole = roleKey === 'door'
          ? String(targetStation?.doorSide || targetStation?.door || '').trim()
          : ''
        api.lines.findAudioByStationName(lineFilePath, stationNameForRole, { role: item?.role, doorSide: doorSideForRole, languageKey, dialectKey, peerStationNames: collectPeerStationNamesForAudioMatch(stations) })
          .then((res) => {
            if (!res || !res.ok || !res.relativePath) return
            console.warn('[StationEditor][dynamic-rightplay][resolved]', {
              relativePath: res.relativePath,
              role: roleKey
            })
            return api.lines.resolveAudioPath(lineFilePath, res.relativePath)
          })
          .then((resolveRes) => {
            if (!resolveRes || !resolveRes.ok) return
            const url = resolveRes.playableUrl || ('file:///' + (resolveRes.path || '').replace(/\\/g, '/'))
            if (!url || url === 'file:///') return
            stopPreviewAudio()
            const a = new Audio(url)
            previewAudio = a
            const clear = () => { if (previewAudio === a) previewAudio = null }
            a.onended = clear
            a.onpause = clear
            a.onerror = clear
            a.play().catch(() => { if (previewAudio === a) previewAudio = null })
          })
          .catch(() => {})
        return
      }

      if (!itemPath) return
      // 先打断正在播放的进/出站音频（使用 useStationAudio 暴露的全局停止函数）
      if (typeof window !== 'undefined' && typeof window.__stopStationAudio === 'function') {
        try { window.__stopStationAudio() } catch (e) {}
      }
      api.lines.resolveAudioPath(lineFilePath, itemPath).then((res) => {
        if (!res || !res.ok) return
        const url = res.playableUrl || ('file:///' + (res.path || '').replace(/\\/g, '/'))
        if (!url || url === 'file:///') return
        stopPreviewAudio()
        const a = new Audio(url)
        previewAudio = a
        const clear = () => { if (previewAudio === a) previewAudio = null }
        a.onended = clear
        a.onpause = clear
        a.onerror = clear
        a.play().catch(() => { if (previewAudio === a) previewAudio = null })
      })
    }

    const audioDropTarget = ref(null)
    const dynamicAudioHover = ref(false)
    const dynamicAudioSubmenuPos = reactive({ x: 0, y: 0 })
    let dynamicAudioHoverTimer = null
    const applyAllHoverDir = ref(null)
    const applyAllHoverTimer = ref(null)
    const applyAllSubmenuPos = reactive({ x: 0, y: 0 })
    const modeHoverKey = ref(null)
    const modeHoverTimer = ref(null)
    const modeStationSubmenuPos = reactive({ x: 0, y: 0 })
    const modeCommonSubmenuPos = reactive({ x: 0, y: 0 })
    const updateSubmenuPosition = (ev, targetPos) => {
      if (!ev || !ev.currentTarget || !targetPos) return
      const rect = ev.currentTarget.getBoundingClientRect()
      targetPos.x = Math.max(8, Math.round(rect.right + 4))
      targetPos.y = Math.max(8, Math.round(rect.top - 6))
    }
    const setDynamicAudioHover = (ev = null) => {
      if (dynamicAudioHoverTimer) {
        clearTimeout(dynamicAudioHoverTimer)
        dynamicAudioHoverTimer = null
      }
      dynamicAudioHover.value = true
      if (ev) updateSubmenuPosition(ev, dynamicAudioSubmenuPos)
    }
    const clearDynamicAudioHover = () => {
      if (dynamicAudioHoverTimer) clearTimeout(dynamicAudioHoverTimer)
      dynamicAudioHoverTimer = setTimeout(() => {
        dynamicAudioHover.value = false
        dynamicAudioHoverTimer = null
      }, 140)
    }

    const importAudioHover = ref(false)
    const importAudioSubmenuPos = reactive({ x: 0, y: 0 })
    let importAudioHoverTimer = null
    const setImportAudioHover = (ev = null) => {
      if (importAudioHoverTimer) {
        clearTimeout(importAudioHoverTimer)
        importAudioHoverTimer = null
      }
      importAudioHover.value = true
      if (ev) updateSubmenuPosition(ev, importAudioSubmenuPos)
    }
    const clearImportAudioHover = () => {
      if (importAudioHoverTimer) clearTimeout(importAudioHoverTimer)
      importAudioHoverTimer = setTimeout(() => {
        importAudioHover.value = false
        importAudioHoverTimer = null
      }, 140)
    }

    const audioImportModalVisible = ref(false)
    const audioImportStage = ref('copy') // 'copy'|'match'|'done'
    const audioImportProcessed = ref(0)
    const audioImportTotal = ref(0)
    const audioImportCopyOk = ref(0)
    const audioImportCopyFail = ref(0)
    const audioImportTargetStations = ref(0)
    const audioImportSuccessStations = ref(0)
    const audioImportFailStations = ref(0)
    const audioImportFailedStations = ref([])
    const closeAudioImportModal = () => {
      audioImportModalVisible.value = false
      audioImportStage.value = 'copy'
      audioImportProcessed.value = 0
      audioImportTotal.value = 0
      audioImportCopyOk.value = 0
      audioImportCopyFail.value = 0
      audioImportTargetStations.value = 0
      audioImportSuccessStations.value = 0
      audioImportFailStations.value = 0
      audioImportFailedStations.value = []
    }
    const setModeHover = (key, ev = null) => {
      if (modeHoverTimer.value) {
        clearTimeout(modeHoverTimer.value)
        modeHoverTimer.value = null
      }
      modeHoverKey.value = key
      if (ev) {
        if (key === 'mode-sub-station') updateSubmenuPosition(ev, modeStationSubmenuPos)
        if (key === 'mode-sub-common') updateSubmenuPosition(ev, modeCommonSubmenuPos)
      }
    }
    const clearModeHover = () => {
      if (modeHoverTimer.value) clearTimeout(modeHoverTimer.value)
      modeHoverTimer.value = setTimeout(() => {
        modeHoverKey.value = null
        modeHoverTimer.value = null
      }, 140)
    }
    const addFilesToCommonAudio = async (files, dir) => {
      if (!files || !files.length || !dir) return
      const api = typeof window !== 'undefined' ? window.electronAPI : null
      const lineFilePath = currentLineFilePathRef.value
      const lineFolderPath = currentLineFolderPathRef.value
      const lineDirOrFilePath = lineFilePath || lineFolderPath || ''
      if (!commonAudio[dir] || typeof commonAudio[dir] !== 'object') commonAudio[dir] = { list: [] }
      if (!Array.isArray(commonAudio[dir].list)) commonAudio[dir].list = []
      const list = commonAudio[dir].list
      let added = 0
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        if (!audioExt.test(file.name || '')) continue
        const sourcePath = api?.getPathForFile ? api.getPathForFile(file) : file.path || ''
        let relativePath = ''
        if (api?.lines?.copyAudioToLineDir && lineDirOrFilePath) {
          try {
            // commonAudio 同样按当前 Tab 的语种/方言落盘（与站点音频一致）
            const subDir = ensureDynamicAudioSubDir()
            const res = await api.lines.copyAudioToLineDir(lineDirOrFilePath, sourcePath, { subDir })
            if (res && res.ok && res.relativePath) {
              relativePath = res.relativePath
            }
          } catch (err) {
            console.warn('copyAudioToLineDir failed', err)
          }
        }
        const finalPath = relativePath || sourcePath || ''
        if (!finalPath) continue
        list.push({ path: finalPath, name: file.name || '' })
        added++
      }
      if (added > 0) emitAudioAutoSave()
    }
    const onCommonAudioDrop = (e, dir) => {
      if (e && typeof e.preventDefault === 'function') e.preventDefault()
      const files = e?.dataTransfer?.files
      addFilesToCommonAudio(files, dir)
    }
    const setApplyAllHover = (dir, ev = null) => {
      if (applyAllHoverTimer.value) {
        clearTimeout(applyAllHoverTimer.value)
        applyAllHoverTimer.value = null
      }
      if (ev) updateSubmenuPosition(ev, applyAllSubmenuPos)
      applyAllHoverDir.value = dir
    }
    const clearApplyAllHover = () => {
      if (applyAllHoverTimer.value) clearTimeout(applyAllHoverTimer.value)
      applyAllHoverTimer.value = setTimeout(() => {
        applyAllHoverDir.value = null
        applyAllHoverTimer.value = null
      }, 120)
    }
    const onAudioBlockDragover = (e, dir) => {
      const hasFile = e.dataTransfer.types.includes('Files') && e.dataTransfer.files && e.dataTransfer.files.length > 0
      if (hasFile) audioDropTarget.value = { dir }
    }
    const onAudioBlockDragLeave = () => {
      audioDropTarget.value = null
    }
    const audioExt = /\.(mp3|flac|ogg|wav)$/i
    const onAudioBlockDrop = async (e, dir) => {
      if (e && typeof e.stopPropagation === 'function') e.stopPropagation()
      if (e && e.__audioDropHandled) return
      if (e) e.__audioDropHandled = true
      audioDropTarget.value = null
      const files = e.dataTransfer?.files
      if (!files || !files.length) return
      const api = typeof window !== 'undefined' ? window.electronAPI : null
      if (!api?.lines?.copyAudioToLineDir) return
      const lineFilePath = currentLineFilePathRef.value
      const lineFolderPath = currentLineFolderPathRef.value
      const lineDirOrFilePath = lineFilePath || lineFolderPath || ''
      let added = 0
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        if (!audioExt.test(file.name || '')) continue
        const sourcePath = api.getPathForFile ? api.getPathForFile(file) : (file.path || '')
        if (!sourcePath) continue
        try {
          const res = await api.lines.copyAudioToLineDir(lineDirOrFilePath, sourcePath, {
            // 按当前 Tab 的语种/方言落盘
            subDir: ensureDynamicAudioSubDir()
          })
          if (res && res.ok && res.relativePath) {
            const list = form.stationAudio[dir].list
            if (!Array.isArray(list)) form.stationAudio[dir].list = []
            form.stationAudio[dir].list.push({ path: res.relativePath, name: file.name || '' })
            added++
          }
        } catch (err) {
          console.warn('copyAudioToLineDir failed', err)
        }
      }
      if (added > 0) emitAudioAutoSave()
    }

    const removeCommonAudioItem = (dir, idx) => {
      const list = getCommonAudioList(dir)
      if (!list || idx < 0 || idx >= list.length) return
      list.splice(idx, 1)
    }

    const moveCommonAudioItem = (dir, fromIdx, toIdx) => {
      const list = getCommonAudioList(dir)
      if (!list || fromIdx < 0 || toIdx < 0 || fromIdx >= list.length || toIdx >= list.length || fromIdx === toIdx) return
      const item = list.splice(fromIdx, 1)[0]
      const insertIdx = fromIdx < toIdx ? toIdx - 1 : toIdx
      list.splice(insertIdx, 0, item)
    }

    return {
      form,
      isDarkTheme,
      menuGlassDirective,
      close,
      armSaveClick,
      onOverlayMouseDown,
      onOverlayClick,
      save,
      addXfer,
      removeXfer,
      toggleXferSuspended,
      toggleExitTransfer,
      showColorPicker,
      colorPickerInitialColor,
      openColorPicker,
      onColorConfirm,
      pickColor,
      xferClipboard,
      menuVisible,
      menuX,
      menuY,
      menuContext,
      hasClipboard,
      copyXfer,
      copyAllXfer,
      pasteXfer,
      openRowMenu,
      openSectionMenu,
      closeMenu,
      runAndClose,
      showXferNameEdit,
      xferNameEditIdx,
      xferNameEditValue,
      openXferNameEdit,
      closeXferNameEdit,
      confirmXferNameEdit,
      showAudioNameEdit,
      audioNameEditValue,
      openAudioNameEdit,
      closeAudioNameEdit,
      confirmAudioNameEdit,
      commonAudio,
      onCommonAudioDrop,
      addFilesToCommonAudio,
      sectionMode,
      setSectionMode,
      dynamicAudioTabs,
      availableDynamicAudioTabOptions,
      setDynamicDialectFromTab,
      addDynamicAudioTab,
      removeDynamicAudioTab,
      moveDynamicAudioTab,
      draggingDynamicTabKey,
      dynamicTabDragOverKey,
      onDynamicTabDragStart,
      onDynamicTabDragOver,
      onDynamicTabDrop,
      onDynamicTabDragEnd,
      openDynamicTabMenu,
      openDynamicTabRowMenu,
      openSectionToggleMenu,
      openSmartSectionMenu,
      audioSectionCrashed,
      toggleAudioSeparateDirection,
      getAudioList,
      addAudioItem,
      addDynamicAudioPlaceholder,
      removeAudioItem,
      moveAudioItem,
      openAudioRowMenu,
      openCommonAudioRowMenu,
      audioClipboard,
      copyAudioItem,
      pasteAudioItem,
      pasteAudioToSelectionOrEnd,
      hasAudioClipboard,
      commonAudioClipboard,
      pasteCommonAudioItem,
      cutCommonAudioItem,
      hasCommonAudioClipboard,
      toggleAudioItemMode,
      toggleAudioItemModeForSelected,
      anySelectedHasMode,
      toggleCommonAudioApplied,
      playAudioItem,
      playAudioForMenuSelection,
      copyAudioForMenuSelection,
      pasteAudioForMenuSelection,
      deleteAudioForMenuSelection,
      isAudioPlayDisabledForMenu,
      applyAllHoverDir,
      applyAllSubmenuPos,
      setApplyAllHover,
      clearApplyAllHover,
      modeHoverKey,
      modeStationSubmenuPos,
      modeCommonSubmenuPos,
      setModeHover,
      clearModeHover,
      dynamicAudioHover,
      dynamicAudioSubmenuPos,
      setDynamicAudioHover,
      clearDynamicAudioHover,
      importAudioHover,
      importAudioSubmenuPos,
      setImportAudioHover,
      clearImportAudioHover,
      audioImportModalVisible,
      audioImportStage,
      audioImportProcessed,
      audioImportTotal,
      audioImportCopyOk,
      audioImportCopyFail,
      audioImportTargetStations,
      audioImportSuccessStations,
      audioImportFailStations,
      audioImportFailedStations,
      closeAudioImportModal,
      importStationAudioSingle,
      importStationAudioMultiple,
      importDynamicAudioFiles,
      importDynamicAudioFolder,
      audioDropTarget,
      onAudioBlockDragover,
      onAudioBlockDragLeave,
      onAudioBlockDrop,
      removeCommonAudioItem,
      moveCommonAudioItem,
      getCommonAudioList,
      isAudioRowSelected,
      onAudioRowClick,
      getAudioDisplayNumber,
      getAudioItemDisplayName,
      getAudioItemPath,
      isAudioBroken,
      stationAudioBrokenCount,
      stationAudioBrokenCountByDialectKey,
      commonAudioBrokenCount,
      getCommonApplyLabel,
      getAudioArriveDepartColor,
      hasAudioSelection,
      getSelectedAudioItemsInOrder,
      applySelectedToAllStations,
      t
    }
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="cp-fade">
      <div v-if="modelValue" class="cp-overlay cp-overlay--editor" @mousedown="onOverlayMouseDown" @click="onOverlayClick">
        <div
          class="cp-dialog cp-dialog--editor"
          v-glassmorphism="{ blur: 12, opacity: 0.2, color: '#ffffff' }"
          role="dialog"
          aria-modal="true"
          @mousedown.stop
          @click.stop
        >
          <div class="cp-header">
            <div class="cp-header-left">
              <div class="cp-icon">
                <i :class="isNew ? 'fas fa-plus' : 'fas fa-edit'"></i>
              </div>
              <div class="cp-titles">
                <div class="cp-title">{{ isNew ? t('stationEditor.titleNew') : t('stationEditor.titleEdit') }}</div>
              </div>
            </div>
            <button class="cp-close" type="button" @click="close('header-close-btn')" :aria-label="t('stationEditor.closeLabel')">
              <i class="fas fa-times"></i>
            </button>
          </div>

            <div class="cp-content cp-content--scroll">
            <div class="se-section-head se-station-page-head">
              <div class="se-section-toggle">
                <button type="button" class="se-seg-btn se-mini on" @click.prevent>{{ t('stationEditor.stationInfoPage') }}</button>
              </div>
              <span class="se-section-hint">{{ t('stationEditor.stationInfoHint') }}</span>
            </div>

              <div class="se-grid2">
                <div class="se-field">
                  <label class="se-label">{{ t('stationEditor.nameZhLabel') }}</label>
                  <input v-model="form.name" class="se-input" :placeholder="t('stationEditor.nameZhPlaceholder')" />
                </div>
                <div class="se-field">
                  <label class="se-label">{{ t('stationEditor.nameEnLabel') }}</label>
                  <input v-model="form.en" class="se-input" :placeholder="t('stationEditor.nameEnPlaceholder')" />
                </div>
              </div>

              <div class="se-grid3 se-mt">
                <div class="se-field">
                  <div class="se-label">{{ t('stationEditor.statusLabel') }}</div>
                  <div class="se-seg">
                    <button class="se-seg-btn" :class="{ on: !form.skip }" @click="form.skip = false">{{ t('stationEditor.statusNormal') }}</button>
                    <button class="se-seg-btn" :class="{ on: form.skip, warn: form.skip }" @click="form.skip = true">{{ t('stationEditor.statusSuspended') }}</button>
                  </div>
                </div>
                <div class="se-field">
                  <div class="se-label">{{ t('stationEditor.doorLabel') }}</div>
                  <div class="se-seg">
                    <button class="se-seg-btn" :class="{ on: form.door === 'left' }" @click="form.door = 'left'">{{ t('stationEditor.doorLeft') }}</button>
                    <button class="se-seg-btn" :class="{ on: form.door === 'right' }" @click="form.door = 'right'">{{ t('stationEditor.doorRight') }}</button>
                    <button class="se-seg-btn" :class="{ on: form.door === 'both' }" @click="form.door = 'both'">{{ t('stationEditor.doorBoth') }}</button>
                  </div>
                </div>
                <div class="se-field">
                  <div class="se-label">{{ t('stationEditor.dockLabel') }}</div>
                  <div class="se-seg">
                    <button class="se-seg-btn" :class="{ on: form.dock === 'up' }" @click="form.dock = 'up'">{{ t('stationEditor.dockUp') }}</button>
                    <button class="se-seg-btn" :class="{ on: form.dock === 'down' }" @click="form.dock = 'down'">{{ t('stationEditor.dockDown') }}</button>
                    <button class="se-seg-btn" :class="{ on: form.dock === 'both' }" @click="form.dock = 'both'">{{ t('stationEditor.dockBoth') }}</button>
                  </div>
                </div>
              </div>

              <div class="se-grid3 se-mt">
                <div class="se-field">
                  <div class="se-label">{{ t('stationEditor.turnbackLabel') }}</div>
                  <div class="se-seg">
                    <button class="se-seg-btn" :class="{ on: form.turnback === 'pre' }" @click="form.turnback = 'pre'">{{ t('stationEditor.turnbackPre') }}</button>
                    <button class="se-seg-btn" :class="{ on: form.turnback === 'post' }" @click="form.turnback = 'post'">{{ t('stationEditor.turnbackPost') }}</button>
                  </div>
                </div>
                <div class="se-field">
                  <div class="se-label">{{ t('stationEditor.expressLabel') }}</div>
                  <div class="se-seg">
                    <button class="se-seg-btn" :class="{ on: form.expressStop }" @click="form.expressStop = true">{{ t('stationEditor.expressStop') }}</button>
                    <button class="se-seg-btn" :class="{ on: !form.expressStop }" @click="form.expressStop = false">{{ t('stationEditor.expressSkip') }}</button>
                  </div>
                </div>
                <div class="se-field" aria-hidden="true"></div>
              </div>

            <div class="se-section" @contextmenu.prevent="openSmartSectionMenu($event)">
              <div class="se-section-head">
                <div class="se-section-toggle" @contextmenu.prevent.stop="openSectionToggleMenu($event)">
                  <button type="button" class="se-seg-btn se-mini" :class="{ on: sectionMode === 'xfer' }" @click="setSectionMode('xfer')">{{ t('stationEditor.xferSectionTitle') }}</button>
                  <div class="se-dyn-tabs" @contextmenu.prevent.stop="openDynamicTabRowMenu($event)">
                    <button
                      v-for="opt in dynamicAudioTabs"
                      :key="opt.key"
                      type="button"
                      :data-dialect-key="opt.key"
                      class="se-seg-btn se-mini se-dyn-tab"
                      :class="{ on: sectionMode === 'audio' && form.stationAudio.dynamicDialect === opt.key, 'se-dyn-tab-dragover': dynamicTabDragOverKey === opt.key }"
                      @click.stop="setDynamicDialectFromTab(opt.key)"
                      @contextmenu.prevent.stop="openDynamicTabMenu($event, opt.key)"
                      draggable="true"
                      @dragstart="onDynamicTabDragStart($event, opt.key)"
                      @dragover="onDynamicTabDragOver($event, opt.key)"
                      @drop="onDynamicTabDrop($event, opt.key)"
                      @dragend="onDynamicTabDragEnd"
                      :title="t(opt.labelKey)"
                    >
                      <span class="se-dyn-tab-label">{{ t(opt.labelKey) }}</span>
                      <span v-if="(stationAudioBrokenCountByDialectKey[opt.key] || 0) > 0" class="se-audio-broken-dot" :title="t('stationEditor.audioBroken')">
                        <i class="fas fa-exclamation-triangle" style="color:#fff; font-size:12px;"></i>
                        <span class="se-audio-broken-dot-count">{{ stationAudioBrokenCountByDialectKey[opt.key] }}</span>
                      </span>
                    </button>
                  </div>
                  <button
                    type="button"
                    class="se-seg-btn se-mini"
                    :class="{ on: sectionMode === 'commonAudio' }"
                    @click.stop="setSectionMode('commonAudio')"
                  >
                    {{ t('stationEditor.audioCommonTitle') }}
                    <span
                      v-if="commonAudioBrokenCount > 0"
                      class="se-audio-broken-dot"
                      :title="t('stationEditor.audioBroken')"
                    >
                      <i class="fas fa-exclamation-triangle" style="color:#fff; font-size:12px;"></i>
                      <span class="se-audio-broken-dot-count">{{ commonAudioBrokenCount }}</span>
                    </span>
                  </button>
                </div>
                <span class="se-section-hint">
                  {{
                    sectionMode === 'audio'
                      ? t('stationEditor.audioSelectHint')
                      : sectionMode === 'commonAudio'
                        ? (t('stationEditor.audioCommonDesc') || '')
                      : t('stationEditor.xferSectionHint')
                  }}
                </span>
              </div>

              <template v-if="sectionMode === 'xfer'">
                <div v-if="form.xfer.length === 0" class="se-empty">{{ t('stationEditor.xferEmpty') }}</div>
                <div v-else class="se-xfer-list">
                  <div
                    v-for="(xf, idx) in form.xfer"
                    :key="idx"
                    class="se-xfer-row"
                    @contextmenu.prevent.stop="openRowMenu($event, idx)"
                  >
                    <span class="se-xfer-name">{{ xf.line || t('stationEditor.xferUnnamed') }}</span>
                    <div v-if="xf.exitTransfer || xf.suspended" class="se-xfer-badges">
                      <span v-if="xf.exitTransfer" class="se-xfer-badge exit">{{ t('stationEditor.xferExitBadge') }}</span>
                      <span v-if="xf.suspended" class="se-xfer-badge suspended">{{ t('stationEditor.xferSuspendedBadge') }}</span>
                    </div>
                    <div
                      class="se-xfer-swatch"
                      :style="{ backgroundColor: xf.color || '#808080' }"
                      :title="t('stationEditor.xferColorTitle')"
                    ></div>
                  </div>
                </div>
              </template>

              <template v-else-if="sectionMode === 'audio'">
                <div v-if="audioSectionCrashed" class="se-audio-crash-fallback">{{ t('stationEditor.audioCrashFallback') }}</div>
                <div v-else class="se-audio-columns" :class="{ two: form.stationAudio.separateDirection }">
                  <div
                    v-for="dir in (form.stationAudio.separateDirection ? ['up', 'down'] : ['up'])"
                    :key="dir"
                    class="se-audio-column"
                    @contextmenu.prevent.stop="openSectionMenu($event, { audioDir: dir, audioScope: 'station' })"
                  >
                    <div v-if="form.stationAudio.separateDirection" class="se-audio-column-title" :class="dir">{{ t(dir === 'up' ? 'stationEditor.directionUp' : 'stationEditor.directionDown') }}</div>
                    <div
                      class="se-audio-unified"
                      :class="{ 'se-audio-kind-dragover': audioDropTarget && audioDropTarget.dir === dir }"
                      @dragover.prevent.stop="onAudioBlockDragover($event, dir)"
                      @dragleave="onAudioBlockDragLeave"
                      @drop.prevent.stop="onAudioBlockDrop($event, dir)"
                    >
                      <template v-if="getAudioList(dir).length === 0">
                        <div class="se-empty se-audio-unified-empty">{{ t('stationEditor.audioEmpty') }}</div>
                      </template>
                      <div
                        v-else
                        class="se-xfer-list se-audio-list-dropzone"
                        @dragover.prevent.stop="onAudioBlockDragover($event, dir)"
                        @dragleave="onAudioBlockDragLeave"
                        @drop.prevent.stop="onAudioBlockDrop($event, dir)"
                      >
                        <div
                          v-for="(item, idx) in getAudioList(dir)"
                          :key="idx"
                          class="se-xfer-row se-audio-row"
                          :class="{ 'mode-disabled': item.disabledInNormal, 'mode-shortTurn': item.modes?.shortTurn, 'mode-express': item.modes?.express, 'mode-direct': item.modes?.direct, 'mode-origin': item.modes?.originStation, 'mode-terminal': item.modes?.terminalStation, 'se-audio-row-selected': isAudioRowSelected(dir, idx) }"
                          draggable="true"
                          @click="onAudioRowClick($event, dir, idx)"
                          @dragstart="(ev) => { ev.dataTransfer.setData('audio/dir', dir); ev.dataTransfer.setData('audio/idx', String(idx)) }"
                          @dragover.prevent="(ev) => { if (ev.dataTransfer.types.includes('Files')) { ev.dataTransfer.dropEffect = 'copy'; return; } ev.dataTransfer.dropEffect = 'move'; }"
                          @drop.prevent="(ev) => { if (ev.dataTransfer.files && ev.dataTransfer.files.length) { onAudioBlockDrop(ev, dir); ev.stopPropagation(); return; } const fromIdx = parseInt(ev.dataTransfer.getData('audio/idx'), 10); if (!isNaN(fromIdx) && ev.dataTransfer.getData('audio/dir') === dir && fromIdx !== idx) moveAudioItem(dir, fromIdx, idx) }"
                          @contextmenu.prevent.stop="openAudioRowMenu($event, dir, idx)"
                        >
                          <div class="se-audio-arrdep-bar" :class="{ empty: !getAudioArriveDepartColor(item) }" :style="getAudioArriveDepartColor(item) ? { background: getAudioArriveDepartColor(item) } : {}"></div>
                          <span class="se-audio-drag" :title="t('stationEditor.audioDragSort')" @click.stop><i class="fas fa-bars"></i></span>
                          <span v-if="isAudioBroken('station', dir, idx, item)" class="se-audio-broken-icon" :title="t('stationEditor.audioBroken')">
                            <i class="fas fa-exclamation-triangle"></i>
                          </span>
                          <span class="se-audio-num">
                            <template v-if="getAudioDisplayNumber(dir, idx).arrive != null">{{ t('stationEditor.audioLabelArrive') }}{{ getAudioDisplayNumber(dir, idx).arrive }}</template>
                            <template v-else-if="getAudioDisplayNumber(dir, idx).depart != null">{{ t('stationEditor.audioLabelDepart') }}{{ getAudioDisplayNumber(dir, idx).depart }}</template>
                            <template v-else>—</template>
                          </span>
                          <div class="se-xfer-name-wrap">
                            <span class="se-xfer-name">{{ getAudioItemDisplayName(item) }}</span>
                            <div v-if="item.modes?.shortTurn || item.modes?.express || item.modes?.direct || item.modes?.originStation || item.modes?.terminalStation || item.disabledInNormal || item.role === 'terminal' || item.role === 'end'" class="se-xfer-badges">
                              <span v-if="item.modes?.originStation" class="se-xfer-badge se-audio-badge-origin">{{ t('stationEditor.audioModeOriginStation') }}</span>
                              <span v-if="item.modes?.terminalStation" class="se-xfer-badge se-audio-badge-terminalStation">{{ t('stationEditor.audioModeTerminalStation') }}</span>
                              <span v-if="item.modes?.shortTurn" class="se-xfer-badge se-audio-badge-shortTurn">{{ t('stationEditor.audioModeShortTurn') }}</span>
                              <span v-if="item.modes?.express" class="se-xfer-badge se-audio-badge-express">{{ t('stationEditor.audioModeExpress') }}</span>
                              <span v-if="item.modes?.direct" class="se-xfer-badge se-audio-badge-direct">{{ t('stationEditor.audioModeDirect') }}</span>
                              <span v-if="item.disabledInNormal" class="se-xfer-badge se-audio-badge-disabled">{{ t('stationEditor.audioDisabledInNormal') }}</span>
                            </div>
                          </div>
                        </div>
                        <!-- 有音频时底部固定“拖拽添加”条，避免被行拖拽抢占 -->
                        <div
                          class="se-audio-drop-add-bar"
                          @dragover.prevent.stop="onAudioBlockDragover($event, dir)"
                          @dragleave="onAudioBlockDragLeave"
                          @drop.prevent.stop="onAudioBlockDrop($event, dir)"
                        >
                          <span class="se-audio-drop-add-text">{{ t('stationEditor.audioDropToAdd') }}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </template>
              <template v-else-if="sectionMode === 'commonAudio'">
                <div class="se-common-audio">
                  <div v-if="audioSectionCrashed" class="se-audio-crash-fallback">{{ t('stationEditor.audioCrashFallback') }}</div>
                  <template v-else>
                  <div class="se-audio-columns">
                    <div
                      v-for="dir in ['up']"
                      :key="dir"
                      class="se-audio-column se-common-col"
                      @contextmenu.prevent.stop="openSectionMenu($event, { audioDir: dir, audioScope: 'common' })"
                    >
                      <div class="se-audio-unified"
                        @dragover.prevent.stop="(e) => { const hasFile = e.dataTransfer.types.includes('Files') && e.dataTransfer.files && e.dataTransfer.files.length > 0; if (hasFile) e.dataTransfer.dropEffect = 'copy' }"
                        @drop.prevent.stop="onCommonAudioDrop($event, dir)"
                      >
                        <template v-if="getCommonAudioList(dir).length === 0">
                          <div class="se-empty se-audio-unified-empty">{{ t('stationEditor.audioEmpty') }}</div>
                        </template>
                        <div
                          v-else
                          class="se-xfer-list se-audio-list-dropzone"
                          @dragover.prevent.stop
                          @drop.prevent.stop="onCommonAudioDrop($event, dir)"
                        >
                          <div
                            v-for="(item, idx) in getCommonAudioList(dir)"
                            :key="idx"
                            class="se-xfer-row se-audio-row"
                            draggable="true"
                            @dragstart="(ev) => { ev.dataTransfer.setData('common/dir', dir); ev.dataTransfer.setData('common/idx', String(idx)) }"
                            @dragover.prevent="(ev) => { if (ev.dataTransfer.types.includes('Files')) { ev.dataTransfer.dropEffect = 'copy'; return; } ev.dataTransfer.dropEffect = 'move'; }"
                            @drop.prevent="(ev) => { if (ev.dataTransfer.files && ev.dataTransfer.files.length) { onCommonAudioDrop(ev, dir); ev.stopPropagation(); return; } const fromIdx = parseInt(ev.dataTransfer.getData('common/idx'), 10); if (!isNaN(fromIdx) && ev.dataTransfer.getData('common/dir') === dir && fromIdx !== idx) moveCommonAudioItem(dir, fromIdx, idx) }"
                            @contextmenu.prevent.stop="openCommonAudioRowMenu($event, dir, idx)"
                          >
                            <div class="se-audio-arrdep-bar" :class="{ empty: !getAudioArriveDepartColor(item) }" :style="getAudioArriveDepartColor(item) ? { background: getAudioArriveDepartColor(item) } : {}"></div>
                            <span class="se-audio-drag" :title="t('stationEditor.audioDragSort')" @click.stop><i class="fas fa-bars"></i></span>
                            <span v-if="isAudioBroken('common', dir, idx, item)" class="se-audio-broken-icon" :title="t('stationEditor.audioBroken')">
                              <i class="fas fa-exclamation-triangle"></i>
                            </span>
                            <span class="se-audio-num">{{ getCommonApplyLabel(dir, idx) || '—' }}</span>
                            <div class="se-xfer-name-wrap">
                              <span class="se-xfer-name">{{ getAudioItemDisplayName(item) }}</span>
                              <div v-if="item.modes?.shortTurn || item.modes?.express || item.modes?.direct || item.modes?.originStation || item.modes?.terminalStation || item.disabledInNormal || item.role === 'terminal' || item.role === 'end'" class="se-xfer-badges">
                                <span v-if="item.modes?.originStation" class="se-xfer-badge se-audio-badge-origin">{{ t('stationEditor.audioModeOriginStation') }}</span>
                                <span v-if="item.modes?.terminalStation" class="se-xfer-badge se-audio-badge-terminalStation">{{ t('stationEditor.audioModeTerminalStation') }}</span>
                                <span v-if="item.modes?.shortTurn" class="se-xfer-badge se-audio-badge-shortTurn">{{ t('stationEditor.audioModeShortTurn') }}</span>
                                <span v-if="item.modes?.express" class="se-xfer-badge se-audio-badge-express">{{ t('stationEditor.audioModeExpress') }}</span>
                                <span v-if="item.modes?.direct" class="se-xfer-badge se-audio-badge-direct">{{ t('stationEditor.audioModeDirect') }}</span>
                                <span v-if="item.disabledInNormal" class="se-xfer-badge se-audio-badge-disabled">{{ t('stationEditor.audioDisabledInNormal') }}</span>
                              </div>
                            </div>
                          </div>
                          <div
                            class="se-audio-drop-add-bar"
                            @dragover.prevent.stop
                            @drop.prevent.stop="onCommonAudioDrop($event, dir)"
                          >
                            <span class="se-audio-drop-add-text">{{ t('stationEditor.audioDropToAdd') }}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  </template>
                </div>
              </template>
            </div>
          </div>

          <!-- 换乘线路右键菜单（与站点列表右键菜单风格统一） -->
          <Teleport to="body">
            <div
              v-if="menuVisible"
              class="station-context-menu station-context-menu--glass-shell"
              data-xfer-context-menu
              v-glassmorphism="menuGlassDirective"
              :style="{ left: menuX + 'px', top: menuY + 'px', position: 'fixed', zIndex: 1000001, pointerEvents: 'auto' }"
              @click.stop
              @contextmenu.prevent
            >
              <template v-if="menuContext?.type === 'row'">
                <div class="station-context-menu-item" @click="runAndClose(() => openXferNameEdit(menuContext.idx))">
                  <i class="fas fa-edit"></i> {{ t('stationEditor.menuEditName') }}
                </div>
                <div class="station-context-menu-divider"></div>
                <div class="station-context-menu-item" @click="runAndClose(() => copyXfer(menuContext.idx))">
                  <i class="fas fa-copy"></i> {{ t('stationEditor.menuCopy') }}
                </div>
                <div
                  class="station-context-menu-item"
                  :class="{ disabled: !hasClipboard }"
                  @click="hasClipboard && runAndClose(() => pasteXfer(menuContext.idx))"
                >
                  <i class="fas fa-paste"></i> {{ t('stationEditor.menuPaste') }}
                </div>
                <div class="station-context-menu-divider"></div>
                <div class="station-context-menu-item" @click="runAndClose(() => openColorPicker(menuContext.idx))">
                  <i class="fas fa-palette"></i> {{ t('stationEditor.menuPickColor') }}
                </div>
                <div class="station-context-menu-divider"></div>
                <div
                  class="station-context-menu-item"
                  :class="{ 'xfer-on': form.xfer[menuContext.idx]?.exitTransfer }"
                  :style="form.xfer[menuContext.idx]?.suspended ? { opacity: 0.5, pointerEvents: 'none' } : undefined"
                  @click="!form.xfer[menuContext.idx]?.suspended && runAndClose(() => toggleExitTransfer(menuContext.idx))"
                >
                  <i class="fas fa-door-open"></i> {{ t('stationEditor.menuExitTransfer') }}
                </div>
                <div
                  class="station-context-menu-item"
                  :class="{ 'xfer-on': form.xfer[menuContext.idx]?.suspended }"
                  :style="form.xfer[menuContext.idx]?.exitTransfer ? { opacity: 0.5, pointerEvents: 'none' } : undefined"
                  @click="!form.xfer[menuContext.idx]?.exitTransfer && runAndClose(() => toggleXferSuspended(menuContext.idx))"
                >
                  <i class="fas fa-pause-circle"></i> {{ form.xfer[menuContext.idx]?.suspended ? t('stationEditor.menuSuspendedOn') : t('stationEditor.menuSuspendedOff') }}
                </div>
                <div class="station-context-menu-divider"></div>
                <div class="station-context-menu-item danger" @click="runAndClose(() => removeXfer(menuContext.idx))">
                  <i class="fas fa-trash-alt"></i> {{ t('stationEditor.menuDelete') }}
                </div>
              </template>
              <template v-else-if="menuContext?.type === 'dynamicAudioTab'">
                <div
                  class="station-context-menu-item"
                  :class="{ disabled: dynamicAudioTabs.length <= 1 }"
                  @click="dynamicAudioTabs.length > 1 && runAndClose(() => removeDynamicAudioTab(menuContext.dialectKey))"
                >
                  <i class="fas fa-trash-alt"></i> {{ t('stationEditor.menuDelete') }}
                </div>
                <div class="station-context-menu-divider"></div>
                <div v-if="!availableDynamicAudioTabOptions.length" class="station-context-menu-item disabled">
                  <i class="fas fa-plus"></i> {{ t('stationEditor.audioAdd') }}
                </div>
                <div
                  v-for="opt in availableDynamicAudioTabOptions"
                  :key="opt.key"
                  class="station-context-menu-item"
                  @click="runAndClose(() => addDynamicAudioTab(opt.key))"
                >
                  <i class="fas fa-plus"></i> {{ t(opt.labelKey) }}
                </div>
              </template>
              <template v-else-if="menuContext?.type === 'dynamicAudioTabRow'">
                <div v-if="!availableDynamicAudioTabOptions.length" class="station-context-menu-item disabled">
                  <i class="fas fa-plus"></i> {{ t('stationEditor.audioAdd') }}
                </div>
                <div
                  v-for="opt in availableDynamicAudioTabOptions"
                  :key="opt.key"
                  class="station-context-menu-item"
                  @click="runAndClose(() => addDynamicAudioTab(opt.key))"
                >
                  <i class="fas fa-plus"></i> {{ t(opt.labelKey) }}
                </div>
              </template>
              <template v-else-if="menuContext?.type === 'section' && menuContext?.audio">
                <div
                  class="station-context-menu-item"
                  :class="{ disabled: menuContext.audioScope === 'common' ? !hasCommonAudioClipboard : !hasAudioClipboard }"
                  @click="
                    menuContext.audioScope === 'common'
                      ? (hasCommonAudioClipboard && runAndClose(() => pasteCommonAudioItem(menuContext.audioDir || 'up', -1)))
                      : (hasAudioClipboard && runAndClose(() => pasteAudioToSelectionOrEnd(menuContext.audioDir || 'up')))
                  "
                >
                  <i class="fas fa-paste"></i> {{ t('stationEditor.audioPasteToEnd') }}
                </div>
                <div class="station-context-menu-divider"></div>
                <div
                  v-if="menuContext.audioScope === 'station'"
                  class="station-context-menu-item"
                  @mouseenter="setImportAudioHover($event)"
                  @mouseleave="clearImportAudioHover"
                >
                  <i class="fas fa-magic"></i> {{ t('stationEditor.audioDynamicMenuTitle') }}
                  <i class="fas fa-caret-right apply-all-arrow"></i>
                </div>
                <Teleport to="body">
                  <div
                    v-if="menuContext.audioScope === 'station' && importAudioHover"
                    class="apply-all-submenu glass-submenu"
                    v-glassmorphism="menuGlassDirective"
                    :style="{ position: 'fixed', left: importAudioSubmenuPos.x + 'px', top: importAudioSubmenuPos.y + 'px', zIndex: 1000001 }"
                    @mouseenter="setImportAudioHover()"
                    @mouseleave="clearImportAudioHover"
                  >
                    <div class="station-context-menu-item" @click.stop="runAndClose(() => importDynamicAudioFiles())">
                      <i class="fas fa-file-import"></i> {{ t('stationEditor.audioImportDynamicTitle') }}
                    </div>
                    <div class="station-context-menu-item" @click.stop="runAndClose(() => importDynamicAudioFolder())">
                      <i class="fas fa-folder-open"></i> {{ t('stationEditor.audioImportDynamicFolder') }}
                    </div>
                  </div>
                </Teleport>

                <div
                  v-if="menuContext.audioScope === 'station'"
                  class="station-context-menu-item"
                  @mouseenter="setDynamicAudioHover($event)"
                  @mouseleave="clearDynamicAudioHover"
                >
                  <i class="fas fa-magic"></i> {{ t('stationEditor.audioAddDynamicAudio') }}
                  <i class="fas fa-caret-right apply-all-arrow"></i>
                </div>

                <Teleport to="body">
                  <div
                    v-if="menuContext.audioScope === 'station' && dynamicAudioHover"
                    class="apply-all-submenu glass-submenu"
                    v-glassmorphism="menuGlassDirective"
                    :style="{ position: 'fixed', left: dynamicAudioSubmenuPos.x + 'px', top: dynamicAudioSubmenuPos.y + 'px', zIndex: 1000001 }"
                    @mouseenter="setDynamicAudioHover()"
                    @mouseleave="clearDynamicAudioHover"
                  >
                    <div class="station-context-menu-item" @click.stop="runAndClose(() => addDynamicAudioPlaceholder(menuContext.audioDir || 'up', 'start'))">
                      <i class="fas fa-circle-notch"></i> {{ t('stationEditor.audioDynamicRoleStart') }}
                    </div>
                    <div class="station-context-menu-item" @click.stop="runAndClose(() => addDynamicAudioPlaceholder(menuContext.audioDir || 'up', 'next'))">
                      <i class="fas fa-step-forward"></i> {{ t('stationEditor.audioDynamicRoleNext') }}
                    </div>
                    <div class="station-context-menu-item" @click.stop="runAndClose(() => addDynamicAudioPlaceholder(menuContext.audioDir || 'up', 'current'))">
                      <i class="fas fa-sign-in-alt"></i> {{ t('stationEditor.audioDynamicRoleCurrent') }}
                    </div>
                    <div class="station-context-menu-item" @click.stop="runAndClose(() => addDynamicAudioPlaceholder(menuContext.audioDir || 'up', 'terminal'))">
                      <i class="fas fa-flag-checkered"></i> {{ t('stationEditor.audioDynamicRoleTerminal') }}
                    </div>
                    <div class="station-context-menu-divider"></div>
                    <div class="station-context-menu-item" @click.stop="runAndClose(() => addDynamicAudioPlaceholder(menuContext.audioDir || 'up', 'door'))">
                      <i class="fas fa-door-open"></i> {{ t('stationEditor.audioDynamicDoorAuto') }}
                    </div>
                  </div>
                </Teleport>
              </template>
              <template v-else-if="menuContext?.type === 'section'">
                <div
                  v-if="form.xfer.length"
                  class="station-context-menu-item"
                  @click="runAndClose(copyAllXfer)"
                >
                  <i class="fas fa-copy"></i> {{ t('stationEditor.menuCopyAll') }}
                </div>
                <div
                  class="station-context-menu-item"
                  :class="{ disabled: !hasClipboard }"
                  @click="hasClipboard && runAndClose(() => pasteXfer(-1))"
                >
                  <i class="fas fa-paste"></i> {{ t('stationEditor.menuPaste') }}
                </div>
                <div class="station-context-menu-divider"></div>
                <div class="station-context-menu-item" @click="runAndClose(addXfer)">
                  <i class="fas fa-plus"></i> {{ t('stationEditor.menuAddXfer') }}
                </div>
              </template>
              <template v-else-if="menuContext?.type === 'audioRow'">
                <div
                  class="station-context-menu-item"
                  :class="{ disabled: isAudioPlayDisabledForMenu(menuContext.dir, menuContext.idx) }"
                  @click="!isAudioPlayDisabledForMenu(menuContext.dir, menuContext.idx) && runAndClose(() => playAudioForMenuSelection(menuContext.dir, menuContext.idx))"
                >
                  <i class="fas fa-play"></i> {{ t('stationEditor.audioPlay') }}
                </div>
                <div class="station-context-menu-item" @click="runAndClose(() => openAudioNameEdit(menuContext.dir, menuContext.idx))">
                  <i class="fas fa-edit"></i> {{ t('stationEditor.audioRename') }}
                </div>
                <div class="station-context-menu-item" @click="runAndClose(() => copyAudioForMenuSelection(menuContext.dir, menuContext.idx))">
                  <i class="fas fa-copy"></i> {{ t('stationEditor.audioCopy') }}
                </div>
                <div
                  class="station-context-menu-item"
                  :class="{ disabled: !hasAudioClipboard }"
                  @click="hasAudioClipboard && runAndClose(() => pasteAudioForMenuSelection(menuContext.dir, menuContext.idx))"
                >
                  <i class="fas fa-paste"></i> {{ t('stationEditor.audioPaste') }}
                </div>
                <div class="station-context-menu-divider"></div>
                <div
                  class="station-context-menu-item"
                  @mouseenter="setImportAudioHover($event)"
                  @mouseleave="clearImportAudioHover"
                >
                  <i class="fas fa-magic"></i> {{ t('stationEditor.audioDynamicMenuTitle') }}
                  <i class="fas fa-caret-right apply-all-arrow"></i>
                </div>
                <Teleport to="body">
                  <div
                    v-if="menuContext?.type === 'audioRow' && importAudioHover"
                    class="apply-all-submenu glass-submenu"
                    v-glassmorphism="menuGlassDirective"
                    :style="{ position: 'fixed', left: importAudioSubmenuPos.x + 'px', top: importAudioSubmenuPos.y + 'px', zIndex: 1000001 }"
                    @mouseenter="setImportAudioHover()"
                    @mouseleave="clearImportAudioHover"
                  >
                    <div class="station-context-menu-item" @click.stop="runAndClose(() => importDynamicAudioFiles())">
                      <i class="fas fa-file-import"></i> {{ t('stationEditor.audioImportDynamicTitle') }}
                    </div>
                    <div class="station-context-menu-item" @click.stop="runAndClose(() => importDynamicAudioFolder())">
                      <i class="fas fa-folder-open"></i> {{ t('stationEditor.audioImportDynamicFolder') }}
                    </div>
                  </div>
                </Teleport>
                <div
                  class="station-context-menu-item"
                  @mouseenter="setDynamicAudioHover($event)"
                  @mouseleave="clearDynamicAudioHover"
                >
                  <i class="fas fa-magic"></i> {{ t('stationEditor.audioAddDynamicAudio') }}
                  <i class="fas fa-caret-right apply-all-arrow"></i>
                </div>
                <Teleport to="body">
                  <div
                    v-if="dynamicAudioHover"
                    class="apply-all-submenu glass-submenu"
                    v-glassmorphism="menuGlassDirective"
                    :style="{ position: 'fixed', left: dynamicAudioSubmenuPos.x + 'px', top: dynamicAudioSubmenuPos.y + 'px', zIndex: 1000001 }"
                    @mouseenter="setDynamicAudioHover()"
                    @mouseleave="clearDynamicAudioHover"
                  >
                    <div class="station-context-menu-item" @click.stop="runAndClose(() => addDynamicAudioPlaceholder(menuContext.dir || 'up', 'start'))">
                      <i class="fas fa-circle-notch"></i> {{ t('stationEditor.audioDynamicRoleStart') }}
                    </div>
                    <div class="station-context-menu-item" @click.stop="runAndClose(() => addDynamicAudioPlaceholder(menuContext.dir || 'up', 'next'))">
                      <i class="fas fa-step-forward"></i> {{ t('stationEditor.audioDynamicRoleNext') }}
                    </div>
                    <div class="station-context-menu-item" @click.stop="runAndClose(() => addDynamicAudioPlaceholder(menuContext.dir || 'up', 'current'))">
                      <i class="fas fa-sign-in-alt"></i> {{ t('stationEditor.audioDynamicRoleCurrent') }}
                    </div>
                    <div class="station-context-menu-item" @click.stop="runAndClose(() => addDynamicAudioPlaceholder(menuContext.dir || 'up', 'terminal'))">
                      <i class="fas fa-flag-checkered"></i> {{ t('stationEditor.audioDynamicRoleTerminal') }}
                    </div>
                    <div class="station-context-menu-divider"></div>
                    <div class="station-context-menu-item" @click.stop="runAndClose(() => addDynamicAudioPlaceholder(menuContext.dir || 'up', 'door'))">
                      <i class="fas fa-door-open"></i> {{ t('stationEditor.audioDynamicDoorAuto') }}
                    </div>
                  </div>
                </Teleport>
                <div
                  class="station-context-menu-item apply-all"
                  :class="{ open: applyAllHoverDir === menuContext.dir }"
                  @mouseenter="setApplyAllHover(menuContext.dir, $event)"
                  @mouseleave="clearApplyAllHover"
                >
                  <div class="apply-all-main" @click.stop="runAndClose(() => applySelectedToAllStations(menuContext.dir, 'both'))">
                    <i class="fas fa-broadcast-tower"></i> {{ t('stationEditor.audioApplyToAllStations') }}
                  </div>
                  <i class="fas fa-caret-right apply-all-arrow"></i>
                </div>
                <Teleport to="body">
                  <div
                    class="apply-all-submenu glass-submenu"
                    v-if="applyAllHoverDir === menuContext.dir"
                    v-glassmorphism="menuGlassDirective"
                    :style="{ position: 'fixed', left: applyAllSubmenuPos.x + 'px', top: applyAllSubmenuPos.y + 'px', zIndex: 1000001 }"
                    @mouseenter="setApplyAllHover(menuContext.dir)"
                    @mouseleave="clearApplyAllHover"
                  >
                    <div class="station-context-menu-item" @click.stop="runAndClose(() => applySelectedToAllStations(menuContext.dir, 'up'))">
                      <i class="fas fa-arrow-up"></i> {{ t('stationEditor.audioApplyAllUp') || t('stationEditor.directionUp') }}
                    </div>
                    <div class="station-context-menu-item" @click.stop="runAndClose(() => applySelectedToAllStations(menuContext.dir, 'down'))">
                      <i class="fas fa-arrow-down"></i> {{ t('stationEditor.audioApplyAllDown') || t('stationEditor.directionDown') }}
                    </div>
                    <div class="station-context-menu-item" @click.stop="runAndClose(() => applySelectedToAllStations(menuContext.dir, 'both'))">
                      <i class="fas fa-arrows-alt-v"></i> {{ t('stationEditor.audioApplyAllBoth') }}
                    </div>
                  </div>
                </Teleport>
                <div class="station-context-menu-divider"></div>
                <div class="station-context-menu-item" :class="{ 'xfer-on': anySelectedHasMode(menuContext.dir, 'arrive') }" @click="runAndClose(() => toggleAudioItemModeForSelected(menuContext.dir, 'arrive'))">
                  <i class="fas fa-sign-in-alt"></i> {{ t('stationEditor.audioModeArrive') }}
                </div>
                <div class="station-context-menu-item" :class="{ 'xfer-on': anySelectedHasMode(menuContext.dir, 'depart') }" @click="runAndClose(() => toggleAudioItemModeForSelected(menuContext.dir, 'depart'))">
                  <i class="fas fa-sign-out-alt"></i> {{ t('stationEditor.audioModeDepart') }}
                </div>
                <div
                  class="station-context-menu-item apply-all"
                  :class="{ open: modeHoverKey === 'mode-sub-station' }"
                  @mouseenter="setModeHover('mode-sub-station', $event)"
                  @mouseleave="clearModeHover"
                >
                  <div class="apply-all-main">
                    <i class="fas fa-sliders-h"></i> {{ t('stationEditor.audioModeQuick') }}
                  </div>
                  <i class="fas fa-caret-right apply-all-arrow"></i>
                </div>
                <Teleport to="body">
                  <div
                    class="apply-all-submenu glass-submenu"
                    v-if="modeHoverKey === 'mode-sub-station'"
                    v-glassmorphism="menuGlassDirective"
                    :style="{ position: 'fixed', left: modeStationSubmenuPos.x + 'px', top: modeStationSubmenuPos.y + 'px', zIndex: 1000001 }"
                    @mouseenter="setModeHover('mode-sub-station')"
                    @mouseleave="clearModeHover"
                  >
                    <div class="station-context-menu-item" :class="{ 'xfer-on': anySelectedHasMode(menuContext.dir, 'originStation') }" @click.stop="runAndClose(() => toggleAudioItemModeForSelected(menuContext.dir, 'originStation'))">
                      <i class="fas fa-flag-checkered"></i> {{ t('stationEditor.audioModeOriginStation') }}
                    </div>
                    <div class="station-context-menu-item" :class="{ 'xfer-on': anySelectedHasMode(menuContext.dir, 'terminalStation') }" @click.stop="runAndClose(() => toggleAudioItemModeForSelected(menuContext.dir, 'terminalStation'))">
                      <i class="fas fa-sign-in-alt"></i> {{ t('stationEditor.audioModeTerminalStation') }}
                    </div>
                    <div class="station-context-menu-item" :class="{ 'xfer-on': anySelectedHasMode(menuContext.dir, 'shortTurn') }" @click.stop="runAndClose(() => toggleAudioItemModeForSelected(menuContext.dir, 'shortTurn'))">
                      <i class="fas fa-route"></i> {{ t('stationEditor.audioModeShortTurn') }}
                    </div>
                    <div class="station-context-menu-item" :class="{ 'xfer-on': anySelectedHasMode(menuContext.dir, 'express') }" @click.stop="runAndClose(() => toggleAudioItemModeForSelected(menuContext.dir, 'express'))">
                      <i class="fas fa-train"></i> {{ t('stationEditor.audioModeExpress') }}
                    </div>
                    <div class="station-context-menu-item" :class="{ 'xfer-on': anySelectedHasMode(menuContext.dir, 'direct') }" @click.stop="runAndClose(() => toggleAudioItemModeForSelected(menuContext.dir, 'direct'))">
                      <i class="fas fa-bolt"></i> {{ t('stationEditor.audioModeDirect') }}
                    </div>
                    <div class="station-context-menu-item" :class="{ 'xfer-on': anySelectedHasMode(menuContext.dir, 'disabledInNormal') }" @click.stop="runAndClose(() => toggleAudioItemModeForSelected(menuContext.dir, 'disabledInNormal'))">
                      <i class="fas fa-pause-circle"></i> {{ t('stationEditor.audioDisabledInNormal') }}
                    </div>
                  </div>
                </Teleport>
                <div class="station-context-menu-divider"></div>
                <div class="station-context-menu-item danger" @click="runAndClose(() => deleteAudioForMenuSelection(menuContext.dir, menuContext.idx))">
                  <i class="fas fa-trash-alt"></i> {{ t('stationEditor.audioDelete') }}
                </div>
              </template>
              <template v-else-if="menuContext?.type === 'commonAudioRow'">
                <div
                  class="station-context-menu-item"
                  :class="{ disabled: !getCommonAudioList(menuContext.dir)?.[menuContext.idx]?.path }"
                  @click="getCommonAudioList(menuContext.dir)?.[menuContext.idx]?.path && runAndClose(() => playAudioItem(menuContext.dir, menuContext.idx, 'common'))"
                >
                  <i class="fas fa-play"></i> {{ t('stationEditor.audioPlay') }}
                </div>
                <div class="station-context-menu-item" @click="runAndClose(() => toggleCommonAudioApplied(menuContext.dir, menuContext.idx))">
                  <i class="fas fa-check-circle"></i>
                  {{ getCommonAudioList(menuContext.dir)?.[menuContext.idx]?.applied ? t('stationEditor.audioApplyToggleOff') : t('stationEditor.audioApplyToggleOn') }}
                </div>
                <div class="station-context-menu-item" @click="runAndClose(() => openAudioNameEdit(menuContext.dir, menuContext.idx, 'common'))">
                  <i class="fas fa-edit"></i> {{ t('stationEditor.audioRename') }}
                </div>
                <div class="station-context-menu-item" @click="runAndClose(() => copyCommonAudioItem(menuContext.dir, menuContext.idx, false))">
                  <i class="fas fa-copy"></i> {{ t('stationEditor.audioCopy') }}
                </div>
                <div
                  class="station-context-menu-item"
                  :class="{ disabled: !hasCommonAudioClipboard }"
                  @click="hasCommonAudioClipboard && runAndClose(() => pasteCommonAudioItem(menuContext.dir, menuContext.idx))"
                >
                  <i class="fas fa-paste"></i> {{ t('stationEditor.audioPaste') }}
                </div>
                <div class="station-context-menu-item" @click="runAndClose(() => cutCommonAudioItem(menuContext.dir, menuContext.idx))">
                  <i class="fas fa-cut"></i> {{ t('stationEditor.audioCut') }}
                </div>
                <div class="station-context-menu-divider"></div>
                <div
                  class="station-context-menu-item apply-all"
                  :class="{ open: modeHoverKey === 'mode-sub-common' }"
                  @mouseenter="setModeHover('mode-sub-common', $event)"
                  @mouseleave="clearModeHover"
                >
                  <div class="apply-all-main">
                    <i class="fas fa-sliders-h"></i> {{ t('stationEditor.audioModeQuick') }}
                  </div>
                  <i class="fas fa-caret-right apply-all-arrow"></i>
                </div>
                <Teleport to="body">
                  <div
                    class="apply-all-submenu glass-submenu"
                    v-if="modeHoverKey === 'mode-sub-common'"
                    v-glassmorphism="menuGlassDirective"
                    :style="{ position: 'fixed', left: modeCommonSubmenuPos.x + 'px', top: modeCommonSubmenuPos.y + 'px', zIndex: 1000001 }"
                    @mouseenter="setModeHover('mode-sub-common')"
                    @mouseleave="clearModeHover"
                  >
                    <div class="station-context-menu-item" :class="{ 'xfer-on': getCommonAudioList(menuContext.dir)?.[menuContext.idx]?.modes?.originStation }" @click.stop="runAndClose(() => toggleAudioItemMode(menuContext.dir, menuContext.idx, 'originStation', 'common'))">
                      <i class="fas fa-flag-checkered"></i> {{ t('stationEditor.audioModeOriginStation') }}
                    </div>
                    <div class="station-context-menu-item" :class="{ 'xfer-on': getCommonAudioList(menuContext.dir)?.[menuContext.idx]?.modes?.terminalStation }" @click.stop="runAndClose(() => toggleAudioItemMode(menuContext.dir, menuContext.idx, 'terminalStation', 'common'))">
                      <i class="fas fa-sign-in-alt"></i> {{ t('stationEditor.audioModeTerminalStation') }}
                    </div>
                    <div class="station-context-menu-item" :class="{ 'xfer-on': getCommonAudioList(menuContext.dir)?.[menuContext.idx]?.modes?.shortTurn }" @click.stop="runAndClose(() => toggleAudioItemMode(menuContext.dir, menuContext.idx, 'shortTurn', 'common'))">
                      <i class="fas fa-route"></i> {{ t('stationEditor.audioModeShortTurn') }}
                    </div>
                    <div class="station-context-menu-item" :class="{ 'xfer-on': getCommonAudioList(menuContext.dir)?.[menuContext.idx]?.modes?.express }" @click.stop="runAndClose(() => toggleAudioItemMode(menuContext.dir, menuContext.idx, 'express', 'common'))">
                      <i class="fas fa-train"></i> {{ t('stationEditor.audioModeExpress') }}
                    </div>
                    <div class="station-context-menu-item" :class="{ 'xfer-on': getCommonAudioList(menuContext.dir)?.[menuContext.idx]?.modes?.direct }" @click.stop="runAndClose(() => toggleAudioItemMode(menuContext.dir, menuContext.idx, 'direct', 'common'))">
                      <i class="fas fa-bolt"></i> {{ t('stationEditor.audioModeDirect') }}
                    </div>
                    <div class="station-context-menu-item" :class="{ 'xfer-on': getCommonAudioList(menuContext.dir)?.[menuContext.idx]?.disabledInNormal }" @click.stop="runAndClose(() => toggleAudioItemMode(menuContext.dir, menuContext.idx, 'disabledInNormal', 'common'))">
                      <i class="fas fa-pause-circle"></i> {{ t('stationEditor.audioDisabledInNormal') }}
                    </div>
                  </div>
                </Teleport>
                <div class="station-context-menu-divider"></div>
                <div class="station-context-menu-item danger" @click="runAndClose(() => removeCommonAudioItem(menuContext.dir, menuContext.idx))">
                  <i class="fas fa-trash-alt"></i> {{ t('stationEditor.audioDelete') }}
                </div>
              </template>
            </div>
          </Teleport>
          <div v-if="menuVisible" class="se-menu-backdrop" style="z-index: 1000000" @click="closeMenu" aria-hidden="true"></div>

          <!-- 换乘线路名称编辑弹窗 -->
          <Teleport to="body">
            <Transition name="fade">
              <div v-if="showXferNameEdit" class="se-name-edit-overlay" @click.self="closeXferNameEdit">
                <div class="se-name-edit-dialog" role="dialog" aria-modal="true">
                  <div class="se-name-edit-title">{{ t('stationEditor.xferNameDialogTitle') }}</div>
                  <input
                    v-model="xferNameEditValue"
                    class="se-input se-name-edit-input"
                    :placeholder="t('stationEditor.xferNamePlaceholder')"
                    @keydown.enter="confirmXferNameEdit"
                  />
                  <div class="se-name-edit-actions">
                    <button type="button" class="cp-btn cp-btn-gray" @click="closeXferNameEdit">{{ t('stationEditor.btnCancel') }}</button>
                    <button type="button" class="cp-btn cp-btn-primary" @click="confirmXferNameEdit">{{ t('stationEditor.btnConfirm') }}</button>
                  </div>
                </div>
              </div>
            </Transition>
          </Teleport>

          <!-- 音频重命名弹窗 -->
          <Teleport to="body">
            <Transition name="fade">
              <div v-if="showAudioNameEdit" class="se-name-edit-overlay" @click.self="closeAudioNameEdit">
                <div class="se-name-edit-dialog" role="dialog" aria-modal="true">
                  <div class="se-name-edit-title">{{ t('stationEditor.audioRename') }}</div>
                  <input
                    v-model="audioNameEditValue"
                    class="se-input se-name-edit-input"
                    :placeholder="t('stationEditor.audioRenamePlaceholder')"
                    @keydown.enter="confirmAudioNameEdit"
                  />
                  <div class="se-name-edit-actions">
                    <button type="button" class="cp-btn cp-btn-gray" @click="closeAudioNameEdit">{{ t('stationEditor.btnCancel') }}</button>
                    <button type="button" class="cp-btn cp-btn-primary" @click="confirmAudioNameEdit">{{ t('stationEditor.btnConfirm') }}</button>
                  </div>
                </div>
              </div>
            </Transition>
          </Teleport>

          <!-- 音频导入进度弹窗（导入动态音频文件夹） -->
          <Teleport to="body">
            <Transition name="fade">
              <div
                v-if="audioImportModalVisible"
                class="se-name-edit-overlay"
                style="z-index: 1000003"
                @click.self="audioImportStage === 'done' && closeAudioImportModal()"
              >
                <div
                  class="se-name-edit-dialog"
                  role="dialog"
                  aria-modal="true"
                  style="width: 720px; max-width: 95%;"
                >
                  <div class="se-name-edit-title" style="display:flex; justify-content:space-between; align-items:center; gap:12px;">
                    <span>{{ t('stationEditor.audioImportModalTitle') }}</span>
                    <span style="font-size:12px; color:var(--muted,#888)">{{ audioImportStage === 'copy' ? t('stationEditor.audioImportStageCopy') : audioImportStage === 'match' ? t('stationEditor.audioImportStageMatch') : t('stationEditor.audioImportStageDone') }}</span>
                  </div>

                  <div style="margin-top: 12px;">
                    <div
                      style="height: 10px; border-radius: 999px; background: rgba(0,0,0,0.08); overflow:hidden; border: 1px solid rgba(0,0,0,0.06);"
                    >
                      <div
                        style="height: 100%; background: linear-gradient(90deg, #1677ff 0%, #4096ff 100%); width: 0%; transition: width 0.2s ease;"
                        :style="{ width: audioImportTotal > 0 ? (audioImportProcessed / audioImportTotal * 100).toFixed(1) + '%' : '0%' }"
                      ></div>
                    </div>

                    <div style="margin-top:10px; font-size:13px; color: var(--text,#333);">
                      <template v-if="audioImportStage === 'copy'">
                        {{ audioImportProcessed }}/{{ audioImportTotal }} ({{ t('stationEditor.audioImportCopyOk') }}: {{ audioImportCopyOk }}, {{ t('stationEditor.audioImportCopyFail') }}: {{ audioImportCopyFail }})
                      </template>
                      <template v-else-if="audioImportStage === 'match'">
                        {{ t('stationEditor.audioImportMatching') }}
                      </template>
                      <template v-else>
                        <div style="line-height:1.6;">
                          {{ t('stationEditor.audioImportResultSummary', { success: audioImportSuccessStations, fail: audioImportFailStations }) }}
                        </div>
                        <div style="margin-top:6px; font-size:12px; color: var(--muted,#888);">
                          目标站点总数（按占位项推导）：<span style="color: var(--text,#333)">{{ audioImportTargetStations }}</span>
                        </div>
                        <div v-if="audioImportFailStations > 0" style="margin-top:10px; font-size:13px; color: var(--muted,#888);">
                          {{ t('stationEditor.audioImportFailedStations') }}：
                          <span style="color: var(--text,#333)">{{ audioImportFailedStations.join('、') }}</span>
                        </div>
                      </template>
                    </div>
                  </div>

                  <div class="se-name-edit-actions" style="margin-top: 18px;">
                    <button type="button" class="cp-btn cp-btn-gray" @click="closeAudioImportModal" :disabled="audioImportStage !== 'done'">
                      {{ t('stationEditor.closeLabel') }}
                    </button>
                  </div>
                </div>
              </div>
            </Transition>
          </Teleport>

          <div class="cp-footer cp-footer--end">
            <button type="button" class="cp-btn cp-btn-gray" @click="close('footer-cancel-btn')">{{ t('stationEditor.btnCancel') }}</button>
            <button type="button" class="cp-btn cp-btn-primary" @mousedown="armSaveClick" @click="save($event)" :disabled="!form.name">{{ t('stationEditor.btnSave') }}</button>
          </div>
        </div>

        <ColorPicker v-model="showColorPicker" :initial-color="colorPickerInitialColor" @confirm="onColorConfirm" />
      </div>
    </Transition>
  </Teleport>
</template>

<style>
@import '../styles/cp-glass-modal-shell.css';

/* Ant Design 色板变量：挂在站点编辑弹窗根节点（与取色器共用 cp-dialog 外壳） */
.cp-dialog.cp-dialog--editor {
  --se-ant-primary: #1677ff;
  --se-ant-primary-hover: #4096ff;
  --se-ant-primary-bg: rgba(22, 119, 255, 0.12);
  --se-ant-primary-bg-soft: rgba(22, 119, 255, 0.06);
  --se-ant-success: #52c41a;
  --se-ant-success-text: #389e0d;
  --se-ant-success-bg: rgba(82, 196, 26, 0.12);
  --se-ant-warning: #faad14;
  --se-ant-warning-text: #d48806;
  --se-ant-warning-bg: rgba(250, 173, 20, 0.12);
  --se-ant-error: #ff4d4f;
  --se-ant-purple: #722ed1;
  --se-ant-purple-bg: rgba(114, 46, 209, 0.1);
}

.se-grid2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.se-grid3 {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 12px;
}
.se-mt {
  margin-top: 12px;
}
.se-field {
  min-width: 0;
}
.se-image-field {
  display: grid;
  grid-template-columns: 180px minmax(0, 1fr);
  gap: 14px;
  align-items: start;
}
.se-image-preview {
  width: 180px;
  height: 132px;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid rgba(0, 0, 0, 0.08);
  background: rgba(255, 255, 255, 0.62);
  display: flex;
  align-items: center;
  justify-content: center;
}
.se-image-preview.empty {
  border-style: dashed;
}
.se-image-preview-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}
.se-image-empty {
  padding: 0 18px;
  text-align: center;
  font-size: 12px;
  line-height: 1.6;
  color: var(--muted, #999);
}
.se-image-meta {
  min-width: 0;
}
.se-image-path {
  margin-bottom: 10px;
}
.se-image-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.se-btn-inline {
  min-width: 88px;
  padding: 8px 16px;
}
.se-image-hint {
  margin-top: 8px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--muted, #888);
}
.se-label {
  display: block;
  /* 与站名/输入框文字同一套渲染参数：减少小号粗体 + 低对比度带来的锯齿感 */
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  opacity: 0.72;
  margin-bottom: 6px;
}

.se-input {
  width: 100%;
  padding: 10px;
  border-radius: 6px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  background: rgba(255, 255, 255, 0.7);
  color: var(--text);
  outline: none;
}

.se-seg {
  display: flex;
  padding: 4px;
  border-radius: 6px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  background: rgba(255, 255, 255, 0.7);
}
.se-seg-btn {
  flex: 1;
  border: none;
  background: transparent;
  color: var(--muted);
  padding: 8px;
  border-radius: 4px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
  position: relative; /* for corner badge positioning */
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  white-space: nowrap;
}
.se-seg-btn.on {
  background: var(--se-ant-primary);
  color: #fff;
  box-shadow: 0 2px 8px rgba(22, 119, 255, 0.35);
}
.se-seg-btn.warn.on {
  background: var(--se-ant-warning);
  color: #fff;
  box-shadow: 0 2px 8px rgba(250, 173, 20, 0.4);
}

.se-section {
  margin-top: 16px;
}
.se-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 8px;
  border-bottom: 1px dashed rgba(0, 0, 0, 0.1);
  margin-bottom: 12px;
}
.se-station-page-head {
  margin-bottom: 16px;
}
.se-section-toggle {
  display: flex;
  gap: 4px;
  align-items: center;
}
.se-section-toggle .se-mini {
  padding: 6px 12px;
  font-size: 12px;
}
.se-dyn-tabs{
  display:flex;
  gap:4px;
  align-items:center;
  flex-wrap:nowrap;
  overflow-x:auto;
  overflow-y:hidden;
  max-width: 100%;
  padding-bottom: 2px;
}
.se-dyn-tab{
  position: relative;
  cursor: grab;
}
.se-dyn-tab:active { cursor: grabbing; }
.se-dyn-tab-dragover{
  outline: 2px dashed rgba(22, 119, 255, 0.7);
  outline-offset: 1px;
}
.se-dyn-tab-label{
  display:inline-flex;
  align-items:center;
  gap:6px;
}
.se-section-title {
  font-weight: 800;
  font-size: 14px;
  color: var(--text);
}
.se-section-hint {
  font-size: 11px;
  color: var(--muted, #999);
}
.se-audio-columns {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
  flex: 1;
}
.se-audio-columns.two {
  flex-direction: row;
  gap: 20px;
}
.se-common-audio { display: flex; gap: 16px; align-items: flex-start; }
.se-common-toolbar { display: flex; gap: 8px; margin-bottom: 8px; }
.se-common-audio-lists { flex: 1; display: flex; gap: 16px; }
.se-common-audio-lists.single { flex-direction: column; }
.se-common-col { flex: 1; }
.se-common-col .se-audio-unified { min-height: 20px; width: 100%; }
.se-audio-direction-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: 999px;
  margin-bottom: 6px;
  background: rgba(0, 0, 0, 0.05);
  color: var(--muted, #666);
}
.se-audio-direction-chip.up {
  background: var(--se-ant-primary-bg);
  color: var(--se-ant-primary);
}
.se-audio-direction-chip.down {
  background: var(--se-ant-success-bg);
  color: var(--se-ant-success-text);
}
.se-audio-common-panel {
  width: 280px;
  min-width: 260px;
  background: rgba(255, 255, 255, 0.75);
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 12px;
  padding: 12px 14px;
  box-shadow: 0 10px 32px rgba(0, 0, 0, 0.08);
}
.se-audio-common-head {
  font-weight: 800;
  font-size: 14px;
  margin-bottom: 4px;
  color: var(--text, #222);
}
.se-audio-common-desc {
  font-size: 12px;
  color: var(--muted, #888);
  margin-bottom: 10px;
}
.se-audio-common-list { display: flex; flex-direction: column; gap: 8px; }
.se-audio-common-item {
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 8px;
  padding: 8px 10px;
  background: rgba(255, 255, 255, 0.9);
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.se-audio-common-text { font-size: 13px; color: var(--text, #333); font-weight: 600; }
.se-audio-common-actions { display: flex; gap: 6px; }
.cp-btn.cp-btn-mini {
  padding: 6px 8px;
  font-size: 12px;
  min-width: auto;
}
.se-audio-common-actions-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.se-audio-common-count { font-size: 12px; color: var(--muted, #888); }
.se-audio-drop-zone { margin-top: 10px; padding: 12px; border: 1px dashed rgba(0, 0, 0, 0.2); border-radius: 10px; display: flex; gap: 8px; align-items: center; color: var(--muted, #777); background: rgba(255, 255, 255, 0.6); }
.se-audio-drop-zone i { color: var(--se-ant-primary); }
.se-hidden-file-input { display: none; }
.se-audio-common-row-actions { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
.se-audio-hotkey { font-weight: 800; margin-right: 8px; color: var(--se-ant-primary); min-width: 32px; display: inline-flex; justify-content: center; }
.se-audio-path { font-size: 11px; color: var(--muted, #777); margin-right: 8px; }
.se-terminal-slot {
  margin-top: 10px;
  padding: 10px 12px;
  border: 1px dashed rgba(114, 46, 209, 0.45);
  border-radius: 10px;
  background: var(--se-ant-purple-bg);
}
.se-terminal-slot-head {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 6px;
  font-size: 12px;
  color: var(--text, #333);
  font-weight: 700;
}
.se-terminal-slot-hint { font-size: 11px; color: var(--muted, #888); font-weight: 400; }
.se-terminal-empty { padding: 6px 0; }
.se-terminal-list { gap: 6px; }
.se-audio-column {
  flex: 1;
  min-width: 0;
}
.se-audio-column-title {
  font-size: 13px;
  font-weight: 700;
  margin-bottom: 8px;
  padding: 4px 8px;
  border-radius: 6px;
}
.se-audio-column-title.up {
  background: var(--se-ant-primary-bg);
  color: var(--se-ant-primary);
}
.se-audio-column-title.down {
  background: var(--se-ant-success-bg);
  color: var(--se-ant-success-text);
}
.se-audio-unified {
  background: rgba(0, 0, 0, 0.02);
  border-radius: 10px;
  padding: 10px 12px;
  border: 1px solid rgba(0, 0, 0, 0.06);
  transition: background 0.15s, border-color 0.15s;
}
.se-audio-unified.se-audio-kind-dragover {
  background: var(--se-ant-primary-bg-soft);
  border-color: var(--se-ant-primary);
  border-style: dashed;
}
.se-audio-unified-empty {
  text-align: center;
  padding: 16px;
  color: var(--muted);
}
.se-xfer-row.se-audio-row { gap: 8px; }
.se-xfer-row.se-audio-row.se-audio-row-selected { background: var(--se-ant-primary-bg); border-color: var(--se-ant-primary); }
.se-xfer-row.se-audio-row.mode-shortTurn { border-left: 3px solid var(--se-ant-primary); }
.se-xfer-row.se-audio-row.mode-express { border-left: 3px solid var(--se-ant-warning); }
.se-xfer-row.se-audio-row.mode-direct { border-left: 3px solid var(--se-ant-success); }
.se-xfer-row.se-audio-row.mode-disabled { opacity: 0.75; }
.se-terminal-row { border-style: dashed; }
.se-audio-arrdep-bar {
  width: 6px;
  min-width: 6px;
  height: 28px;
  border-radius: 999px;
  flex-shrink: 0;
  background: rgba(0, 0, 0, 0.12);
}
.se-audio-arrdep-bar.empty {
  background: rgba(0, 0, 0, 0.08);
  opacity: 0.7;
}
.se-audio-drag { color: var(--muted); cursor: grab; flex-shrink: 0; }
.se-audio-num { font-weight: 700; color: var(--muted); min-width: 48px; width: 48px; flex-shrink: 0; font-size: 12px; }
.se-audio-broken-icon {
  color: #ff4d4f;
  font-size: 12px;
  width: 14px;
  min-width: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  cursor: help;
}

/* iOS 风格通知圆点：用于“音频缺失数量”提示 */
.se-audio-broken-dot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  margin-left: 8px;
  min-width: 26px;
  height: 18px;
  padding: 0 7px;
  border-radius: 999px;
  background: #ff4d4f;
  color: #fff;
  font-size: 11px;
  font-weight: 800;
  line-height: 1;
  box-shadow: 0 2px 8px rgba(255, 77, 79, 0.25);
  white-space: nowrap;
}

.se-audio-broken-dot-count {
  font-size: 11px;
  font-weight: 900;
}
.se-audio-crash-fallback {
  padding: 12px;
  border-radius: 8px;
  border: 1px dashed var(--se-ant-warning);
  background: var(--se-ant-warning-bg);
  color: var(--text, #333);
  font-size: 12px;
}
.se-audio-badge-arrive { background: var(--se-ant-primary-bg); color: var(--se-ant-primary); }
.se-audio-badge-depart { background: var(--se-ant-success-bg); color: var(--se-ant-success-text); }
.se-audio-badge-origin { background: var(--se-ant-purple-bg); color: var(--se-ant-purple); }
.se-audio-badge-terminalStation { background: rgba(24, 144, 255, 0.12); color: #096dd9; }
.se-audio-badge-shortTurn { background: var(--se-ant-primary-bg); color: var(--se-ant-primary); }
.se-audio-badge-express { background: var(--se-ant-warning-bg); color: var(--se-ant-warning-text); }
.se-audio-badge-direct { background: var(--se-ant-success-bg); color: var(--se-ant-success-text); }
.se-audio-badge-disabled { background: rgba(0, 0, 0, 0.06); color: var(--muted); }
.se-audio-badge-terminal { background: var(--se-ant-purple-bg); color: var(--se-ant-purple); }
.se-empty {
  color: var(--muted);
  font-size: 12px;
  padding: 10px 0;
}
.se-xfer-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.se-audio-drop-add-bar {
  margin-top: 6px;
  padding: 10px 12px;
  border: 1px dashed rgba(0, 0, 0, 0.2);
  border-radius: 8px;
  text-align: center;
  background: rgba(0, 0, 0, 0.02);
  transition: background 0.15s, border-color 0.15s;
}
.se-audio-drop-add-bar:hover,
.se-audio-kind-dragover .se-audio-drop-add-bar {
  background: var(--se-ant-primary-bg-soft);
  border-color: rgba(22, 119, 255, 0.45);
}
.se-audio-drop-add-text {
  font-size: 12px;
  color: var(--muted, #888);
}
.se-xfer-row {
  display: flex;
  gap: 10px;
  align-items: center;
  min-width: 0;
  padding: 6px 8px;
  border-radius: 8px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  transition: background 0.15s, border-color 0.15s;
}
.se-xfer-row:hover {
  background: rgba(0, 0, 0, 0.03);
  border-color: rgba(0, 0, 0, 0.14);
}
.se-xfer-name {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 14px;
  color: var(--text, #333);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.se-xfer-swatch {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: 2px solid rgba(0, 0, 0, 0.12);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
}
.se-xfer-badges {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}
.se-xfer-badge {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 600;
}
.se-xfer-badge.exit {
  background: var(--se-ant-warning-bg);
  color: var(--se-ant-warning-text);
}
.se-xfer-badge.suspended {
  background: rgba(250, 173, 20, 0.18);
  color: var(--se-ant-warning-text);
}
.se-xfer-name-wrap {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  flex: 1 1 auto;
  min-width: 0;
}
.se-xfer-badges {
  display: flex;
  gap: 4px;
  align-items: center;
  flex-wrap: wrap;
}

/* 换乘线路右键菜单使用 .station-context-menu（与站点列表统一），此处仅补充分隔与选中态 */
.station-context-menu-item.xfer-on {
  background: var(--se-ant-primary-bg-soft);
  color: var(--se-ant-primary);
}
.station-context-menu-item.xfer-on i {
  color: var(--se-ant-primary);
}
.apply-all {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  position: relative;
}
.apply-all.open {
  background: var(--se-ant-primary-bg-soft);
  color: var(--se-ant-primary);
}
.apply-all .apply-all-main {
  display: flex;
  align-items: center;
  gap: 8px;
}
.apply-all-arrow { margin-left: auto; color: var(--muted, #999); }
.apply-all-submenu {
  --se-ant-primary: #1677ff;
  --se-ant-primary-hover: #4096ff;
  --se-ant-primary-bg: rgba(22, 119, 255, 0.12);
  --se-ant-primary-bg-soft: rgba(22, 119, 255, 0.06);
  --se-ant-error: #ff4d4f;
  position: absolute;
  top: -6px;
  left: 100%;
  margin-left: 4px;
  display: flex;
  flex-direction: column;
  gap: 0;
  /* 背景与 backdrop-filter 由 v-glassmorphism 与主右键菜单统一 */
  border: 1px solid rgba(255, 255, 255, 0.45);
  border-radius: 12px;
  padding: 8px 0;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.18), 0 0 0 1px rgba(0, 0, 0, 0.04);
  z-index: 1;
  min-width: 160px;
}
:global(.apply-all-submenu),
:global(.glass-submenu) {
  border: 1px solid rgba(255, 255, 255, 0.45);
  border-radius: 12px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.18), 0 0 0 1px rgba(0, 0, 0, 0.04);
  padding: 8px 0;
}
.apply-all-submenu .station-context-menu-item {
  border: none;
  border-radius: 0;
  padding: 7px 14px;
  box-shadow: none;
  margin: 0;
  gap: 10px;
  line-height: 18px;
}
.apply-all-submenu .station-context-menu-item i {
  color: var(--muted, #888);
  width: 16px;
  text-align: center;
}
.apply-all-submenu .station-context-menu-item:hover {
  background: var(--se-ant-primary-bg);
  color: var(--text, #222);
}
.station-context-menu {
  /* Teleport 到 body 时无 .cp-dialog--editor 祖先，需自带 Ant 色板变量 */
  --se-ant-primary: #1677ff;
  --se-ant-primary-hover: #4096ff;
  --se-ant-primary-bg: rgba(22, 119, 255, 0.12);
  --se-ant-primary-bg-soft: rgba(22, 119, 255, 0.06);
  --se-ant-success: #52c41a;
  --se-ant-success-text: #389e0d;
  --se-ant-success-bg: rgba(82, 196, 26, 0.12);
  --se-ant-warning: #faad14;
  --se-ant-warning-text: #d48806;
  --se-ant-warning-bg: rgba(250, 173, 20, 0.12);
  --se-ant-error: #ff4d4f;
  --se-ant-purple: #722ed1;
  --se-ant-purple-bg: rgba(114, 46, 209, 0.1);
  min-width: 180px;
  background: rgba(255, 255, 255, 0.68);
  backdrop-filter: blur(18px) saturate(150%) contrast(1.05);
  -webkit-backdrop-filter: blur(18px) saturate(150%) contrast(1.05);
  border: 1px solid rgba(255, 255, 255, 0.45);
  border-radius: 12px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.18), 0 0 0 1px rgba(0, 0, 0, 0.04);
  padding: 8px;
  max-height: calc(100vh - 24px);
  overflow: visible;
  overscroll-behavior: contain;
  pointer-events: auto;
}
.station-context-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  font-size: 13px;
  color: var(--text, #333);
  cursor: pointer;
  transition: background 0.2s ease;
  border-radius: 8px;
}
.station-context-menu-item:hover {
  background: rgba(0, 0, 0, 0.06);
  border-radius: 8px;
}
.station-context-menu-item.danger {
  color: var(--se-ant-error);
}
.station-context-menu-item.danger:hover {
  background: rgba(255, 77, 79, 0.12);
}
.station-context-menu-item.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.station-context-menu-divider {
  height: 1px;
  margin: 6px 4px;
  background: var(--divider, rgba(0, 0, 0, 0.1));
}
.se-menu-backdrop {
  position: fixed;
  inset: 0;
  background: transparent;
}

/* 换乘线路名称编辑弹窗 */
.se-name-edit-overlay {
  position: fixed;
  inset: 0;
  /* 必须盖过右键菜单遮罩（inline: z-index: 1000000），否则重命名弹窗会被挡住 */
  z-index: 1000002;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.35);
}
.se-name-edit-dialog {
  width: 320px;
  padding: 20px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(0, 0, 0, 0.08);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2);
}
.se-name-edit-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text, #333);
  margin-bottom: 12px;
}
.se-name-edit-input {
  width: 100%;
  margin-bottom: 16px;
  box-sizing: border-box;
}
.se-name-edit-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}

/* 二级子菜单仅用 v-glassmorphism，不包含在此以免 !important 盖住与主菜单一致的模糊 */
:global(html.blur-disabled) .station-context-menu {
  background: #ffffff !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  border: 1px solid rgba(15, 23, 42, 0.16) !important;
  box-shadow: 0 8px 30px rgba(15,23,42,0.22) !important;
}
:global(html.blur-disabled) .station-context-menu-item:hover,
:global(html.blur-disabled) .apply-all-submenu .station-context-menu-item:hover {
  background: #f5f7fb !important;
}

:global(html.blur-disabled.dark) .station-context-menu,
:global(html.blur-disabled[data-theme='dark']) .station-context-menu {
  background: #1c1c20 !important;
  border: 1px solid rgba(255,255,255,0.16) !important;
  box-shadow: 0 8px 30px rgba(0,0,0,0.42) !important;
}
:global(html.blur-disabled.dark) .station-context-menu-item:hover,
:global(html.blur-disabled[data-theme='dark']) .station-context-menu-item:hover,
:global(html.blur-disabled.dark) .apply-all-submenu .station-context-menu-item:hover,
:global(html.blur-disabled[data-theme='dark']) .apply-all-submenu .station-context-menu-item:hover {
  background: rgba(255,255,255,0.08) !important;
}

:global(html.blur-disabled) .se-name-edit-dialog {
  background: #ffffff !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  border: 1px solid rgba(15, 23, 42, 0.16) !important;
}
:global(html.blur-disabled.dark) .se-name-edit-dialog,
:global(html.blur-disabled[data-theme='dark']) .se-name-edit-dialog {
  background: #1c1c20 !important;
  border: 1px solid rgba(255,255,255,0.16) !important;
}

@media (prefers-color-scheme: dark) {
  .cp-dialog.cp-dialog--editor {
    background: rgba(28, 28, 32, 0.68) !important;
    border: 1px solid rgba(255, 255, 255, 0.12) !important;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(255, 255, 255, 0.06) !important;
  }
  .cp-header {
    background: transparent !important;
    border-bottom-color: rgba(255, 255, 255, 0.1);
  }
  .cp-content {
    background: transparent !important;
  }
  .cp-footer {
    background: transparent !important;
    border-top-color: rgba(255, 255, 255, 0.1);
  }
  .se-input,
  .se-seg {
    background: rgba(50, 50, 50, 0.6);
    border-color: rgba(255, 255, 255, 0.12);
  }
  .se-xfer-row {
    border-color: rgba(255, 255, 255, 0.12);
  }
  .se-xfer-row:hover {
    background: rgba(255, 255, 255, 0.06);
    border-color: rgba(255, 255, 255, 0.2);
  }
  .se-xfer-swatch {
    border-color: rgba(255, 255, 255, 0.2);
  }
  .cp-close:hover {
    background: rgba(255, 255, 255, 0.06);
  }
  .se-name-edit-dialog {
    background: rgba(40, 40, 40, 0.96);
    border-color: rgba(255, 255, 255, 0.12);
  }
  .se-name-edit-title {
    color: rgba(255, 255, 255, 0.9);
  }
  .se-audio-kind-dragover .se-xfer-list,
  .se-audio-kind-dragover .se-empty {
    background: rgba(22, 119, 255, 0.12);
    border-color: #1677ff;
  }
}

/* 深色模式（class 切换，与 prefers-color-scheme 同时生效） */
:global(html.dark) .se-xfer-row,
:global([data-theme="dark"]) .se-xfer-row {
  border-color: rgba(255, 255, 255, 0.12);
}
:global(html.dark) .se-xfer-row:hover,
:global([data-theme="dark"]) .se-xfer-row:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.2);
}

/* 站点编辑主弹窗：blur-disabled 时仍保持毛玻璃（与 cp-glass-modal-shell 一致） */
:global(html.blur-disabled) .cp-dialog.cp-dialog--editor {
  background: rgba(255, 255, 255, 0.68) !important;
  backdrop-filter: blur(18px) saturate(150%) contrast(1.05) !important;
  -webkit-backdrop-filter: blur(18px) saturate(150%) contrast(1.05) !important;
  border: 1px solid rgba(255, 255, 255, 0.45) !important;
}
:global(html.blur-disabled.dark) .cp-dialog.cp-dialog--editor,
:global(html.blur-disabled[data-theme="dark"]) .cp-dialog.cp-dialog--editor {
  background: rgba(28, 28, 32, 0.68) !important;
  backdrop-filter: blur(18px) saturate(150%) contrast(1.05) !important;
  -webkit-backdrop-filter: blur(18px) saturate(150%) contrast(1.05) !important;
  border: 1px solid rgba(255, 255, 255, 0.12) !important;
}
:global(html.blur-disabled) .station-context-menu {
  background: rgba(255, 255, 255, 0.68) !important;
  backdrop-filter: blur(18px) saturate(150%) contrast(1.05) !important;
  -webkit-backdrop-filter: blur(18px) saturate(150%) contrast(1.05) !important;
}
:global(html.blur-disabled.dark) .station-context-menu,
:global(html.blur-disabled[data-theme="dark"]) .station-context-menu {
  background: rgba(28, 28, 32, 0.68) !important;
  backdrop-filter: blur(18px) saturate(150%) contrast(1.05) !important;
  -webkit-backdrop-filter: blur(18px) saturate(150%) contrast(1.05) !important;
}
:global(html.blur-disabled) .se-name-edit-dialog {
  background: rgba(255, 255, 255, 0.96) !important;
  backdrop-filter: blur(12px) !important;
  -webkit-backdrop-filter: blur(12px) !important;
}
:global(html.blur-disabled.dark) .se-name-edit-dialog,
:global(html.blur-disabled[data-theme="dark"]) .se-name-edit-dialog {
  background: rgba(28, 28, 32, 0.96) !important;
  backdrop-filter: blur(12px) !important;
  -webkit-backdrop-filter: blur(12px) !important;
}

:global(html.blur-disabled) .cp-header,
:global(html.blur-disabled) .cp-content,
:global(html.blur-disabled) .cp-footer {
  background: transparent !important;
}

:global(html.blur-disabled.dark) .cp-header,
:global(html.blur-disabled.dark) .cp-content,
:global(html.blur-disabled.dark) .cp-footer,
:global(html.blur-disabled[data-theme="dark"]) .cp-header,
:global(html.blur-disabled[data-theme="dark"]) .cp-content,
:global(html.blur-disabled[data-theme="dark"]) .cp-footer {
  background: transparent !important;
}

</style>
