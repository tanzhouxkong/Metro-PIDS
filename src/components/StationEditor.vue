<script>
<<<<<<< Updated upstream
<<<<<<< Updated upstream
import { reactive, ref, watch, computed, nextTick, Teleport, Transition } from 'vue'
=======
import { reactive, ref, watch, computed, nextTick, onMounted, onBeforeUnmount, onErrorCaptured, Teleport, Transition } from 'vue'
>>>>>>> Stashed changes
=======
import { reactive, ref, watch, computed, nextTick, onMounted, onBeforeUnmount, onErrorCaptured, Teleport, Transition } from 'vue'
>>>>>>> Stashed changes
import { useI18n } from 'vue-i18n'
import ColorPicker from './ColorPicker.vue'

export default {
  name: 'StationEditor',
  components: { Teleport, Transition, ColorPicker },
  props: {
    modelValue: { type: Boolean, default: false },
    station: { type: Object, default: () => ({}) },
    lineCommonAudio: { type: Object, default: () => null },
    isNew: { type: Boolean, default: false },
    currentLineFilePath: { type: String, default: '' },
    currentLineFolderPath: { type: String, default: '' }
  },
  emits: ['update:modelValue', 'save', 'apply-audio-to-all', 'save-line-audio'],
  setup(props, { emit }) {
    const { t } = useI18n()
<<<<<<< Updated upstream
<<<<<<< Updated upstream
=======
=======
>>>>>>> Stashed changes
    const defaultStationAudio = () => ({
      separateDirection: true,
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
<<<<<<< Updated upstream
>>>>>>> Stashed changes
=======
>>>>>>> Stashed changes
    const form = reactive({
      name: '',
      en: '',
      skip: false,
      door: 'left',
      dock: 'both',
      turnback: 'none',
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
        form.turnback = newVal.turnback || 'none'
        form.expressStop = newVal.expressStop !== undefined ? !!newVal.expressStop : false
        form.xfer = newVal.xfer
          ? JSON.parse(JSON.stringify(newVal.xfer.map((x) => ({ ...x, exitTransfer: x.exitTransfer || false }))))
          : []
        if (newVal.stationAudio && typeof newVal.stationAudio === 'object') {
          const sa = newVal.stationAudio
          form.stationAudio = {
            separateDirection: true,
            up: { list: migrateToAudioList(sa.up) },
            down: { list: migrateToAudioList(sa.down) }
          }
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

    const sectionMode = ref('xfer') // 'xfer' | 'audio' | 'commonAudio'
    const audioSectionCrashed = ref(false)
    const seDebugLog = (event, extra = {}) => {
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
    const setSectionMode = (mode) => {
      seDebugLog('set-section-mode', { from: sectionMode.value, to: mode })
      sectionMode.value = mode
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
    }
    const hasClipboard = computed(() => !!xferClipboard.value)

    // 在 nextTick 中调整菜单位置，防止被视口裁切，并留出顶部点击区域
    const adjustMenuPosition = (clientX, clientY) => {
      nextTick(() => {
        const menuEl = document.querySelector('[data-xfer-context-menu]')
        if (!menuEl) return
        const rect = menuEl.getBoundingClientRect()
        const vw = window.innerWidth
        const vh = window.innerHeight
        const margin = 10
        let x = clientX
        let y = clientY

        // 横向优先向左展开
        if (x + rect.width > vw - margin) x = clientX - rect.width
        // 纵向优先向上展开
        if (y + rect.height > vh - margin) y = clientY - rect.height

        // 夹紧，确保不越界；菜单过高时仍可滚动
        const maxX = Math.max(margin, vw - rect.width - margin)
        const maxY = Math.max(margin, vh - rect.height - margin)
        x = Math.min(Math.max(x, margin), maxX)
        y = Math.min(Math.max(y, margin), maxY)

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
      if (!item || typeof item !== 'object') return ''
      return typeof item.path === 'string' ? item.path : ''
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
      if (!itemPath) return true
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
        ++audioHealthScanVersion.value
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
        for (const it of stationItems) {
          const itemPath = getAudioItemPath(it.item)
          const key = getAudioHealthKey(it.scope, it.dir, it.idx, it.item)
          nextHealthByKey[key] = itemPath ? 'ok' : 'broken'
        }
        audioHealthByKey.value = nextHealthByKey
      }, 140)
    }
    const stationAudioSignature = computed(() => {
      const up = getAudioList('up').map((it) => getAudioItemPath(it)).join('|')
      const down = getAudioList('down').map((it) => getAudioItemPath(it)).join('|')
      return `${form.stationAudio.separateDirection ? '1' : '0'}::${up}::${down}`
    })
    const commonAudioSignature = computed(() => getCommonAudioList('up').map((it) => getAudioItemPath(it)).join('|'))
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
    const notify = (msg, title = '') => {
      if (typeof window !== 'undefined' && window.electronAPI?.showNotification) {
        window.electronAPI.showNotification(title || msg, msg, {}).catch(() => {})
      }
    }
    const AUDIO_FILE_FILTER = { name: 'Audio', extensions: ['mp3', 'flac', 'ogg', 'wav'] }
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
          const res = await api.lines.copyAudioToLineDir(lineDirOrFilePath, sourcePath)
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
    const audioNameEditScope = ref('station')
    const audioNameEditValue = ref('')
    const openAudioNameEdit = (dir, idx, scope = 'station') => {
      const list = scope === 'common' ? getCommonAudioList(dir) : getAudioList(dir)
      if (idx < 0 || idx >= list.length) return
      audioNameEditScope.value = scope
      audioNameEditDir.value = dir || 'up'
      audioNameEditIdx.value = idx
      audioNameEditValue.value = getAudioItemDisplayName(list[idx]) === '—' ? '' : getAudioItemDisplayName(list[idx])
      showAudioNameEdit.value = true
    }
    const closeAudioNameEdit = () => {
      showAudioNameEdit.value = false
      audioNameEditIdx.value = -1
    }
    const confirmAudioNameEdit = () => {
      if (audioNameEditIdx.value >= 0) {
        const list = audioNameEditScope.value === 'common' ? getCommonAudioList(audioNameEditDir.value) : form.stationAudio[audioNameEditDir.value]?.list
        const item = list && list[audioNameEditIdx.value]
        if (item) item.name = (audioNameEditValue.value || '').trim()
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
    watch(
      [() => props.modelValue, () => sectionMode.value, stationAudioSignature, commonAudioSignature, () => currentLineFilePathRef.value, () => currentLineFolderPathRef.value],
      ([visible, mode]) => {
        if (!visible || audioSectionCrashed.value) return
        seDebugLog('watch-scan-trigger', { mode, visible })
        if (mode === 'audio' || mode === 'commonAudio') {
          queueAudioHealthScan()
        }
      }
    )
    watch(
      () => props.modelValue,
      (visible) => {
        seDebugLog('watch-modelValue', { visible })
        if (visible) {
          audioSectionCrashed.value = false
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
    const getAudioArriveDepartColor = (item) => {
      if (!item || !item.modes) return null
      if (item.applied) return 'rgb(255, 159, 67)'
      if (item.modes.arrive) return 'rgb(70, 130, 180)'
      if (item.modes.depart) return 'rgb(46, 213, 115)'
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
        separateDirection: true
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
      const list = form.stationAudio[dir].list
      const item = list && list[idx]
      if (item) audioClipboard.value = { item: JSON.parse(JSON.stringify(item)) }
    }
    const pasteAudioItem = (dir, afterIdx) => {
      if (!audioClipboard.value) return
      const list = form.stationAudio[dir].list
      if (!Array.isArray(list)) return
      const insertIdx = afterIdx < 0 ? list.length : afterIdx + 1
      list.splice(insertIdx, 0, JSON.parse(JSON.stringify(audioClipboard.value.item)))
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
      if (!itemPath) return
      const api = typeof window !== 'undefined' ? window.electronAPI : null
      if (!api?.lines?.resolveAudioPath) return
      let lineFilePath = currentLineFilePathRef.value || currentLineFolderPathRef.value
      if (!lineFilePath && typeof window !== 'undefined') lineFilePath = window.__currentLineFilePath || ''
      if (!lineFilePath) return
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
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        if (!audioExt.test(file.name || '')) continue
        const sourcePath = api?.getPathForFile ? api.getPathForFile(file) : file.path || ''
        let relativePath = ''
        if (api?.lines?.copyAudioToLineDir && lineDirOrFilePath) {
          try {
            const res = await api.lines.copyAudioToLineDir(lineDirOrFilePath, sourcePath)
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
      }
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
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        if (!audioExt.test(file.name || '')) continue
        const sourcePath = api.getPathForFile ? api.getPathForFile(file) : (file.path || '')
        if (!sourcePath) continue
        try {
          const res = await api.lines.copyAudioToLineDir(lineDirOrFilePath, sourcePath)
          if (res && res.ok && res.relativePath) {
            const list = form.stationAudio[dir].list
            if (!Array.isArray(list)) form.stationAudio[dir].list = []
            form.stationAudio[dir].list.push({ path: res.relativePath, name: file.name || '' })
          }
        } catch (err) {
          console.warn('copyAudioToLineDir failed', err)
        }
      }
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
<<<<<<< Updated upstream
<<<<<<< Updated upstream
=======
=======
>>>>>>> Stashed changes
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
      audioSectionCrashed,
      toggleAudioSeparateDirection,
      getAudioList,
      addAudioItem,
      removeAudioItem,
      moveAudioItem,
      openAudioRowMenu,
      openCommonAudioRowMenu,
      audioClipboard,
      copyAudioItem,
      pasteAudioItem,
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
      applyAllHoverDir,
      applyAllSubmenuPos,
      setApplyAllHover,
      clearApplyAllHover,
      modeHoverKey,
      modeStationSubmenuPos,
      modeCommonSubmenuPos,
      setModeHover,
      clearModeHover,
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
      getCommonApplyLabel,
      getAudioArriveDepartColor,
      hasAudioSelection,
      getSelectedAudioItemsInOrder,
      applySelectedToAllStations,
<<<<<<< Updated upstream
>>>>>>> Stashed changes
=======
>>>>>>> Stashed changes
      t
    }
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="modelValue" class="se-overlay" @mousedown="onOverlayMouseDown" @click="onOverlayClick">
        <div class="se-dialog" role="dialog" aria-modal="true" @mousedown.stop @click.stop>
          <div class="se-header">
              <div class="se-header-left">
                <div class="se-icon">
                  <i :class="isNew ? 'fas fa-plus' : 'fas fa-edit'"></i>
                </div>
                <div class="se-titles">
                  <div class="se-title">{{ isNew ? t('stationEditor.titleNew') : t('stationEditor.titleEdit') }}</div>
                </div>
              </div>
<<<<<<< Updated upstream
<<<<<<< Updated upstream
<<<<<<< Updated upstream
              <div class="se-titles">
                <div class="se-title">{{ isNew ? t('stationEditor.titleNew') : t('stationEditor.titleEdit') }}</div>
                <div class="se-subtitle">{{ isNew ? t('stationEditor.subtitleNew') : t('stationEditor.subtitleEdit') }}</div>
              </div>
            </div>
=======
>>>>>>> Stashed changes
            <button class="se-close" @click="close" aria-label="关闭">
=======
            <button class="se-close" @click="close('header-close-btn')" aria-label="关闭">
>>>>>>> Stashed changes
=======
            <button class="se-close" @click="close('header-close-btn')" aria-label="关闭">
>>>>>>> Stashed changes
              <i class="fas fa-times"></i>
            </button>
          </div>

            <div class="se-content">
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

            <div class="se-grid2 se-mt">
              <div class="se-field">
                <div class="se-label">{{ t('stationEditor.turnbackLabel') }}</div>
                <div class="se-seg">
                  <button class="se-seg-btn" :class="{ on: form.turnback === 'none' }" @click="form.turnback = 'none'">{{ t('stationEditor.turnbackNone') }}</button>
                  <button class="se-seg-btn" :class="{ on: form.turnback === 'pre' }" @click="form.turnback = 'pre'">{{ t('stationEditor.turnbackPre') }}</button>
                  <button class="se-seg-btn" :class="{ on: form.turnback === 'post' }" @click="form.turnback = 'post'">{{ t('stationEditor.turnbackPost') }}</button>
                </div>
              </div>
              <div class="se-field se-field-narrow">
                <div class="se-label">{{ t('stationEditor.expressLabel') }}</div>
                <div class="se-seg">
                  <button class="se-seg-btn" :class="{ on: form.expressStop }" @click="form.expressStop = true">{{ t('stationEditor.expressStop') }}</button>
                  <button class="se-seg-btn" :class="{ on: !form.expressStop }" @click="form.expressStop = false">{{ t('stationEditor.expressSkip') }}</button>
                </div>
              </div>
            </div>

            <div class="se-section" @contextmenu.prevent="openSectionMenu($event)">
              <div class="se-section-head">
<<<<<<< Updated upstream
<<<<<<< Updated upstream
                <div class="se-section-title">{{ t('stationEditor.xferSectionTitle') }}</div>
                <span class="se-section-hint">{{ t('stationEditor.xferSectionHint') }}</span>
              </div>

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
=======
                <div class="se-section-toggle">
                  <button type="button" class="se-seg-btn se-mini" :class="{ on: sectionMode === 'xfer' }" @click="setSectionMode('xfer')">{{ t('stationEditor.xferSectionTitle') }}</button>
                  <button type="button" class="se-seg-btn se-mini" :class="{ on: sectionMode === 'audio' }" @click="setSectionMode('audio')">{{ t('stationEditor.audioSectionTitle') }}</button>
                  <button type="button" class="se-seg-btn se-mini" :class="{ on: sectionMode === 'commonAudio' }" @click.stop="setSectionMode('commonAudio')">{{ t('stationEditor.audioCommonTitle') || '通用音频' }}</button>
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
>>>>>>> Stashed changes
                </div>
=======
                <div class="se-section-toggle">
                  <button type="button" class="se-seg-btn se-mini" :class="{ on: sectionMode === 'xfer' }" @click="setSectionMode('xfer')">{{ t('stationEditor.xferSectionTitle') }}</button>
                  <button type="button" class="se-seg-btn se-mini" :class="{ on: sectionMode === 'audio' }" @click="setSectionMode('audio')">{{ t('stationEditor.audioSectionTitle') }}</button>
                  <button type="button" class="se-seg-btn se-mini" :class="{ on: sectionMode === 'commonAudio' }" @click.stop="setSectionMode('commonAudio')">{{ t('stationEditor.audioCommonTitle') || '通用音频' }}</button>
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
>>>>>>> Stashed changes
              </template>

              <template v-else-if="sectionMode === 'audio'">
                <div v-if="audioSectionCrashed" class="se-audio-crash-fallback">音频区加载异常，已降级显示。请关闭后重试。</div>
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
                          :class="{ 'mode-disabled': item.disabledInNormal, 'mode-shortTurn': item.modes?.shortTurn, 'mode-express': item.modes?.express, 'mode-direct': item.modes?.direct, 'se-audio-row-selected': isAudioRowSelected(dir, idx) }"
                          draggable="true"
                          @click="onAudioRowClick($event, dir, idx)"
                          @dragstart="(ev) => { ev.dataTransfer.setData('audio/dir', dir); ev.dataTransfer.setData('audio/idx', String(idx)) }"
                          @dragover.prevent="(ev) => { if (ev.dataTransfer.types.includes('Files')) { ev.dataTransfer.dropEffect = 'copy'; return; } ev.dataTransfer.dropEffect = 'move'; }"
                          @drop.prevent="(ev) => { if (ev.dataTransfer.files && ev.dataTransfer.files.length) { onAudioBlockDrop(ev, dir); ev.stopPropagation(); return; } const fromIdx = parseInt(ev.dataTransfer.getData('audio/idx'), 10); if (!isNaN(fromIdx) && ev.dataTransfer.getData('audio/dir') === dir && fromIdx !== idx) moveAudioItem(dir, fromIdx, idx) }"
                          @contextmenu.prevent.stop="openAudioRowMenu($event, dir, idx)"
                        >
                          <div class="se-audio-arrdep-bar" :class="{ empty: !getAudioArriveDepartColor(item) }" :style="getAudioArriveDepartColor(item) ? { background: getAudioArriveDepartColor(item) } : {}"></div>
                          <span class="se-audio-drag" title="拖拽排序" @click.stop><i class="fas fa-bars"></i></span>
                          <span class="se-audio-num">
                            <template v-if="getAudioDisplayNumber(dir, idx).arrive != null">进站{{ getAudioDisplayNumber(dir, idx).arrive }}</template>
                            <template v-else-if="getAudioDisplayNumber(dir, idx).depart != null">出站{{ getAudioDisplayNumber(dir, idx).depart }}</template>
                            <template v-else>—</template>
                          </span>
                          <span v-if="isAudioBroken('station', dir, idx, item)" class="se-audio-broken-icon" title="文件损坏">
                            <i class="fas fa-exclamation-triangle"></i>
                          </span>
                          <div class="se-xfer-name-wrap">
                            <span class="se-xfer-name">{{ getAudioItemDisplayName(item) }}</span>
                            <div v-if="item.modes?.shortTurn || item.modes?.express || item.modes?.direct || item.disabledInNormal || item.role === 'terminal'" class="se-xfer-badges">
                              <span v-if="item.modes?.shortTurn" class="se-xfer-badge se-audio-badge-shortTurn">{{ t('stationEditor.audioModeShortTurn') }}</span>
                              <span v-if="item.modes?.express" class="se-xfer-badge se-audio-badge-express">{{ t('stationEditor.audioModeExpress') }}</span>
                              <span v-if="item.modes?.direct" class="se-xfer-badge se-audio-badge-direct">{{ t('stationEditor.audioModeDirect') }}</span>
                              <span v-if="item.disabledInNormal" class="se-xfer-badge se-audio-badge-disabled">{{ t('stationEditor.audioDisabledInNormal') }}</span>
                              <span v-if="item.role === 'terminal'" class="se-xfer-badge se-audio-badge-terminal">{{ t('stationEditor.audioTerminalTag') || '本站音频' }}</span>
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
                          <span class="se-audio-drop-add-text">{{ t('stationEditor.audioDropToAdd') || '拖拽音频到此处添加' }}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </template>
              <template v-else-if="sectionMode === 'commonAudio'">
                <div class="se-common-audio">
                  <div v-if="audioSectionCrashed" class="se-audio-crash-fallback">音频区加载异常，已降级显示。请关闭后重试。</div>
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
                            <span class="se-audio-drag" title="拖拽排序" @click.stop><i class="fas fa-bars"></i></span>
                            <span class="se-audio-num">{{ getCommonApplyLabel(dir, idx) || '—' }}</span>
                            <span v-if="isAudioBroken('common', dir, idx, item)" class="se-audio-broken-icon" title="文件损坏">
                              <i class="fas fa-exclamation-triangle"></i>
                            </span>
                            <div class="se-xfer-name-wrap">
                              <span class="se-xfer-name">{{ getAudioItemDisplayName(item) }}</span>
                              <div v-if="item.modes?.shortTurn || item.modes?.express || item.modes?.direct || item.disabledInNormal || item.role === 'terminal'" class="se-xfer-badges">
                                <span v-if="item.modes?.shortTurn" class="se-xfer-badge se-audio-badge-shortTurn">{{ t('stationEditor.audioModeShortTurn') }}</span>
                                <span v-if="item.modes?.express" class="se-xfer-badge se-audio-badge-express">{{ t('stationEditor.audioModeExpress') }}</span>
                                <span v-if="item.modes?.direct" class="se-xfer-badge se-audio-badge-direct">{{ t('stationEditor.audioModeDirect') }}</span>
                                <span v-if="item.disabledInNormal" class="se-xfer-badge se-audio-badge-disabled">{{ t('stationEditor.audioDisabledInNormal') }}</span>
                                <span v-if="item.role === 'terminal'" class="se-xfer-badge se-audio-badge-terminal">{{ t('stationEditor.audioTerminalTag') || '本站音频' }}</span>
                              </div>
                            </div>
                          </div>
                          <div
                            class="se-audio-drop-add-bar"
                            @dragover.prevent.stop
                            @drop.prevent.stop="onCommonAudioDrop($event, dir)"
                          >
                            <span class="se-audio-drop-add-text">{{ t('stationEditor.audioDropToAdd') || '拖拽音频到此处添加' }}</span>
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
              class="station-context-menu"
              data-xfer-context-menu
              :style="{ left: menuX + 'px', top: menuY + 'px', position: 'fixed', zIndex: 25000, pointerEvents: 'auto' }"
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
<<<<<<< Updated upstream
<<<<<<< Updated upstream
=======
=======
>>>>>>> Stashed changes
                </div>
              </template>
              <template v-else-if="menuContext?.type === 'section' && menuContext?.audio">
                <div
                  class="station-context-menu-item"
                  :class="{ disabled: menuContext.audioScope === 'common' ? !hasCommonAudioClipboard : !hasAudioClipboard }"
                  @click="
                    menuContext.audioScope === 'common'
                      ? (hasCommonAudioClipboard && runAndClose(() => pasteCommonAudioItem(menuContext.audioDir || 'up', -1)))
                      : (hasAudioClipboard && runAndClose(() => pasteAudioItem(menuContext.audioDir || 'up', -1)))
                  "
                >
                  <i class="fas fa-paste"></i> {{ t('stationEditor.audioPaste') || '粘贴音频到末尾' }}
<<<<<<< Updated upstream
>>>>>>> Stashed changes
=======
>>>>>>> Stashed changes
                </div>
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
<<<<<<< Updated upstream
<<<<<<< Updated upstream
=======
=======
>>>>>>> Stashed changes
                </div>
              </template>
              <template v-else-if="menuContext?.type === 'audioRow'">
                <div
                  class="station-context-menu-item"
                  :class="{ disabled: !form.stationAudio[menuContext.dir]?.list?.[menuContext.idx]?.path }"
                  @click="form.stationAudio[menuContext.dir]?.list?.[menuContext.idx]?.path && runAndClose(() => playAudioItem(menuContext.dir, menuContext.idx))"
                >
                  <i class="fas fa-play"></i> {{ t('stationEditor.audioPlay') }}
                </div>
                <div class="station-context-menu-item" @click="runAndClose(() => openAudioNameEdit(menuContext.dir, menuContext.idx))">
                  <i class="fas fa-edit"></i> {{ t('stationEditor.audioRename') }}
                </div>
                <div class="station-context-menu-item" @click="runAndClose(() => copyAudioItem(menuContext.dir, menuContext.idx))">
                  <i class="fas fa-copy"></i> {{ t('stationEditor.audioCopy') }}
                </div>
                <div
                  class="station-context-menu-item"
                  :class="{ disabled: !hasAudioClipboard }"
                  @click="hasAudioClipboard && runAndClose(() => pasteAudioItem(menuContext.dir, menuContext.idx))"
                >
                  <i class="fas fa-paste"></i> {{ t('stationEditor.audioPaste') }}
                </div>
                <div class="station-context-menu-divider"></div>
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
                    :style="{ position: 'fixed', left: applyAllSubmenuPos.x + 'px', top: applyAllSubmenuPos.y + 'px', zIndex: 26010 }"
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
                      <i class="fas fa-arrows-alt-v"></i> {{ t('stationEditor.audioApplyAllBoth') || t('stationEditor.directionBoth') || '上下行' }}
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
                    :style="{ position: 'fixed', left: modeStationSubmenuPos.x + 'px', top: modeStationSubmenuPos.y + 'px', zIndex: 26010 }"
                    @mouseenter="setModeHover('mode-sub-station')"
                    @mouseleave="clearModeHover"
                  >
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
                <div class="station-context-menu-item danger" @click="runAndClose(() => removeAudioItem(menuContext.dir, menuContext.idx))">
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
                  {{ getCommonAudioList(menuContext.dir)?.[menuContext.idx]?.applied ? '停用应用' : '标记应用' }}
                </div>
                <div class="station-context-menu-item" @click="runAndClose(() => openAudioNameEdit(menuContext.dir, menuContext.idx, 'common'))">
                  <i class="fas fa-edit"></i> {{ t('stationEditor.audioRename') }}
                </div>
                <div class="station-context-menu-item" @click="runAndClose(() => copyCommonAudioItem(menuContext.dir, menuContext.idx, false))">
                  <i class="fas fa-copy"></i> {{ t('stationEditor.audioCopy') || '复制' }}
                </div>
                <div
                  class="station-context-menu-item"
                  :class="{ disabled: !hasCommonAudioClipboard }"
                  @click="hasCommonAudioClipboard && runAndClose(() => pasteCommonAudioItem(menuContext.dir, menuContext.idx))"
                >
                  <i class="fas fa-paste"></i> {{ t('stationEditor.audioPaste') || '粘贴' }}
                </div>
                <div class="station-context-menu-item" @click="runAndClose(() => cutCommonAudioItem(menuContext.dir, menuContext.idx))">
                  <i class="fas fa-cut"></i> {{ t('stationEditor.audioCut') || '剪贴' }}
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
                    :style="{ position: 'fixed', left: modeCommonSubmenuPos.x + 'px', top: modeCommonSubmenuPos.y + 'px', zIndex: 26010 }"
                    @mouseenter="setModeHover('mode-sub-common')"
                    @mouseleave="clearModeHover"
                  >
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
<<<<<<< Updated upstream
>>>>>>> Stashed changes
=======
>>>>>>> Stashed changes
                </div>
              </template>
            </div>
          </Teleport>
          <div v-if="menuVisible" class="se-menu-backdrop" style="z-index: 20001" @click="closeMenu" aria-hidden="true"></div>

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
                    <button type="button" class="se-btn se-btn-gray" @click="closeXferNameEdit">{{ t('stationEditor.btnCancel') }}</button>
                    <button type="button" class="se-btn se-btn-green" @click="confirmXferNameEdit">{{ t('stationEditor.btnConfirm') }}</button>
<<<<<<< Updated upstream
<<<<<<< Updated upstream
=======
=======
>>>>>>> Stashed changes
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
                    :placeholder="t('stationEditor.audioRenamePlaceholder') || '音频显示名称'"
                    @keydown.enter="confirmAudioNameEdit"
                  />
                  <div class="se-name-edit-actions">
                    <button type="button" class="se-btn se-btn-gray" @click="closeAudioNameEdit">{{ t('stationEditor.btnCancel') }}</button>
                    <button type="button" class="se-btn se-btn-green" @click="confirmAudioNameEdit">{{ t('stationEditor.btnConfirm') }}</button>
<<<<<<< Updated upstream
>>>>>>> Stashed changes
=======
>>>>>>> Stashed changes
                  </div>
                </div>
              </div>
            </Transition>
          </Teleport>

          <div class="se-footer">
<<<<<<< Updated upstream
<<<<<<< Updated upstream
            <button class="se-btn se-btn-gray" @click="close">{{ t('stationEditor.btnCancel') }}</button>
            <button class="se-btn se-btn-green" @click="save" :disabled="!form.name">{{ t('stationEditor.btnSave') }}</button>
=======
            <button class="se-btn se-btn-gray" @click="close('footer-cancel-btn')">{{ t('stationEditor.btnCancel') }}</button>
            <button class="se-btn se-btn-green" @mousedown="armSaveClick" @click="save($event)" :disabled="!form.name">{{ t('stationEditor.btnSave') }}</button>
>>>>>>> Stashed changes
=======
            <button class="se-btn se-btn-gray" @click="close('footer-cancel-btn')">{{ t('stationEditor.btnCancel') }}</button>
            <button class="se-btn se-btn-green" @mousedown="armSaveClick" @click="save($event)" :disabled="!form.name">{{ t('stationEditor.btnSave') }}</button>
>>>>>>> Stashed changes
          </div>
        </div>

        <ColorPicker v-model="showColorPicker" :initial-color="colorPickerInitialColor" @confirm="onColorConfirm" />
      </div>
    </Transition>
  </Teleport>
</template>

<style>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.se-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 20000;
  background: transparent; /* 不压暗 */
}

.se-dialog {
  width: 900px;
  max-width: 95%;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3), 0 0 0 0.5px rgba(255, 255, 255, 0.5) inset;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.3);
}

.se-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24px 28px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
  background: rgba(255, 255, 255, 0.4);
  position: relative;
  z-index: 1;
  flex-shrink: 0;
}
.se-header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.se-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: linear-gradient(135deg, #1677ff 0%, #ff9f43 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(22, 119, 255, 0.3);
  flex: 0 0 auto;
}
.se-icon i {
  color: #fff;
  font-size: 18px;
}
.se-title {
  font-size: 22px;
  font-weight: 800;
  letter-spacing: -0.5px;
  color: var(--text, #333);
}
.se-subtitle {
  font-size: 12px;
  color: var(--muted, #999);
  margin-top: 2px;
}
.se-close {
  background: none;
  border: none;
  color: var(--muted, #999);
  cursor: pointer;
  font-size: 20px;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  transition: all 0.2s;
}
.se-close:hover {
  color: var(--text, #333);
  background: rgba(0, 0, 0, 0.04);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
}

.se-content {
  flex: 1;
  overflow: auto;
  padding: 24px 28px;
  background: rgba(255, 255, 255, 0.35);
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
.se-field-narrow {
  max-width: 260px;
}
.se-label {
  display: block;
  font-size: 12px;
  font-weight: 700;
  color: var(--muted);
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
}
.se-seg-btn.on {
  background: var(--accent, #1677ff);
  color: #fff;
  box-shadow: 0 2px 8px rgba(22, 119, 255, 0.35);
}
.se-seg-btn.warn.on {
  background: var(--btn-org-bg, #ff9f43);
  color: #fff;
  box-shadow: 0 2px 8px rgba(255, 159, 67, 0.35);
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
.se-section-toggle {
  display: flex;
  gap: 4px;
}
.se-section-toggle .se-mini {
  padding: 6px 12px;
  font-size: 12px;
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
  background: rgba(22, 119, 255, 0.12);
  color: var(--accent, #1677ff);
}
.se-audio-direction-chip.down {
  background: rgba(46, 213, 115, 0.14);
  color: #2ED573;
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
.se-btn.se-btn-mini {
  padding: 6px 8px;
  font-size: 12px;
  min-width: auto;
}
.se-audio-common-actions-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.se-audio-common-count { font-size: 12px; color: var(--muted, #888); }
.se-audio-drop-zone { margin-top: 10px; padding: 12px; border: 1px dashed rgba(0, 0, 0, 0.2); border-radius: 10px; display: flex; gap: 8px; align-items: center; color: var(--muted, #777); background: rgba(255, 255, 255, 0.6); }
.se-audio-drop-zone i { color: var(--accent, #1677ff); }
.se-hidden-file-input { display: none; }
.se-audio-common-row-actions { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
.se-audio-hotkey { font-weight: 800; margin-right: 8px; color: var(--accent, #1677ff); min-width: 32px; display: inline-flex; justify-content: center; }
.se-audio-path { font-size: 11px; color: var(--muted, #777); margin-right: 8px; }
.se-terminal-slot {
  margin-top: 10px;
  padding: 10px 12px;
  border: 1px dashed rgba(111, 66, 193, 0.35);
  border-radius: 10px;
  background: rgba(111, 66, 193, 0.06);
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
  background: rgba(22, 119, 255, 0.15);
  color: var(--accent, #1677ff);
}
.se-audio-column-title.down {
  background: rgba(46, 213, 115, 0.15);
  color: #2ED573;
}
.se-audio-unified {
  background: rgba(0, 0, 0, 0.02);
  border-radius: 10px;
  padding: 10px 12px;
  border: 1px solid rgba(0, 0, 0, 0.06);
  transition: background 0.15s, border-color 0.15s;
}
.se-audio-unified.se-audio-kind-dragover {
  background: rgba(22, 119, 255, 0.06);
  border-color: var(--accent, #1677ff);
  border-style: dashed;
}
.se-audio-unified-empty {
  text-align: center;
  padding: 16px;
  color: var(--muted);
}
.se-xfer-row.se-audio-row { gap: 8px; }
.se-xfer-row.se-audio-row.se-audio-row-selected { background: rgba(22, 119, 255, 0.12); border-color: var(--accent, #1677ff); }
.se-xfer-row.se-audio-row.mode-shortTurn { border-left: 3px solid var(--accent, #1677ff); }
.se-xfer-row.se-audio-row.mode-express { border-left: 3px solid var(--btn-org-bg, #FF9F43); }
.se-xfer-row.se-audio-row.mode-direct { border-left: 3px solid #2ED573; }
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
  color: var(--btn-org-bg, #ff9f43);
  font-size: 12px;
  width: 14px;
  min-width: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  cursor: help;
}
.se-audio-crash-fallback {
  padding: 12px;
  border-radius: 8px;
  border: 1px dashed var(--btn-org-bg, #ff9f43);
  background: rgba(255, 159, 67, 0.08);
  color: var(--text, #333);
  font-size: 12px;
}
.se-audio-badge-arrive { background: rgba(70, 130, 180, 0.2); color: #4682b4; }
.se-audio-badge-depart { background: rgba(46, 213, 115, 0.2); color: #1e8c4a; }
.se-audio-badge-shortTurn { background: rgba(22, 119, 255, 0.2); color: var(--accent, #1677ff); }
.se-audio-badge-express { background: rgba(255, 159, 67, 0.2); color: #c76b1a; }
.se-audio-badge-direct { background: rgba(46, 213, 115, 0.2); color: #1e8c4a; }
.se-audio-badge-disabled { background: rgba(0, 0, 0, 0.1); color: var(--muted); }
.se-audio-badge-terminal { background: rgba(111, 66, 193, 0.2); color: #6f42c1; }
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
  background: rgba(22, 119, 255, 0.08);
  border-color: rgba(22, 119, 255, 0.35);
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
  background: rgba(255, 159, 67, 0.2);
  color: #c76b1a;
}
.se-xfer-badge.suspended {
  background: rgba(240, 173, 78, 0.25);
  color: #b8860b;
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
  background: rgba(22, 119, 255, 0.1);
  color: var(--accent, #1677ff);
}
.station-context-menu-item.xfer-on i {
  color: var(--accent, #1677ff);
}
.apply-all {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  position: relative;
}
.apply-all.open {
  background: rgba(22, 119, 255, 0.08);
  color: var(--accent, #1677ff);
}
.apply-all .apply-all-main {
  display: flex;
  align-items: center;
  gap: 8px;
}
.apply-all-arrow { margin-left: auto; color: var(--muted, #999); }
.apply-all-submenu {
  position: absolute;
  top: -6px;
  left: 100%;
  margin-left: 4px;
  display: flex;
  flex-direction: column;
  gap: 0;
  background: rgba(255, 255, 255, 0.68) !important;
  backdrop-filter: blur(18px) saturate(150%) contrast(1.05) !important;
  -webkit-backdrop-filter: blur(18px) saturate(150%) contrast(1.05) !important;
  border: 1px solid rgba(255, 255, 255, 0.45) !important;
  border-radius: 12px !important;
  padding: 8px 0 !important;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.18), 0 0 0 1px rgba(0, 0, 0, 0.04) !important;
  z-index: 1;
  min-width: 160px;
}
:global(.apply-all-submenu),
:global(.glass-submenu) {
  background: rgba(255, 255, 255, 0.68) !important;
  backdrop-filter: blur(18px) saturate(150%) contrast(1.05) !important;
  -webkit-backdrop-filter: blur(18px) saturate(150%) contrast(1.05) !important;
  border: 1px solid rgba(255, 255, 255, 0.45) !important;
  border-radius: 12px !important;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.18), 0 0 0 1px rgba(0, 0, 0, 0.04) !important;
  padding: 8px 0 !important;
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
  background: rgba(22, 119, 255, 0.1);
  color: var(--text, #222);
}
.station-context-menu {
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
  color: var(--btn-red-bg, #ff4444);
}
.station-context-menu-item.danger:hover {
  background: rgba(255, 68, 68, 0.12);
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
  z-index: 21001;
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

.se-footer {
  padding: 20px 28px;
  border-top: 1px solid rgba(0, 0, 0, 0.08);
  background: rgba(255, 255, 255, 0.4);
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}
.se-btn {
  padding: 10px 20px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  min-width: 80px;
  transition: all 0.15s;
}
.se-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.se-btn-gray {
  background: var(--btn-gray-bg, #f5f5f5);
  color: var(--btn-gray-text, #666);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}
.se-btn-gray:hover:not(:disabled) {
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.14);
}
.se-btn-green {
  background: #2ed573;
  color: #fff;
  box-shadow: 0 4px 12px rgba(46, 213, 115, 0.4);
}
.se-btn-green:hover:not(:disabled) {
  box-shadow: 0 5px 14px rgba(46, 213, 115, 0.5);
}

@media (prefers-color-scheme: dark) {
  .se-dialog {
    background: rgba(30, 30, 30, 0.85) !important;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }
  .se-header {
    background: rgba(30, 30, 30, 0.4) !important;
    border-bottom-color: rgba(255, 255, 255, 0.1);
  }
  .se-content {
    background: rgba(30, 30, 30, 0.3) !important;
  }
  .se-footer {
    background: rgba(30, 30, 30, 0.4) !important;
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
  .se-close:hover {
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
    border-color: var(--accent, #1677ff);
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
</style>
