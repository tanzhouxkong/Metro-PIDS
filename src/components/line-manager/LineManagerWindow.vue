<script>
// 独立窗口线路管理器（现代扁平 + 云控线路虚拟文件夹）
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick, Teleport, Transition } from 'vue'
import { useI18n } from 'vue-i18n'
import LineManagerDialog from '../LineManagerDialog.vue'
import LineManagerTopbar from '../LineManagerTopbar.vue'
import { useCloudConfig, CLOUD_API_BASE } from '../../composables/useCloudConfig.js'
import { useSpotlightGuide, SPOTLIGHT_STEP_CONFIG } from '../../composables/useSpotlightGuide.js'
import dialogService from '../../utils/dialogService.js'
import ContextMenu from './ContextMenu.vue'
import SpotlightOverlay from '../onboarding/SpotlightOverlay.vue'
import { getEffectiveViewportRect } from '../../utils/effectiveViewportRect.js'

// 去除颜色标记，返回纯文本（用于搜索）
function stripColorMarkup(text) {
  if (!text || typeof text !== 'string') return ''
  return text.replace(/<[^>]+>([^<]*)<\/[^>]+>/g, '$1').replace(/<[^>]+>/g, '')
}
function parseColorMarkup(text) {
  if (!text || typeof text !== 'string') return text
  const regex = /<([^>]+)>([^<]*)<\/>/g
  let result = text
  let match
  while ((match = regex.exec(text)) !== null) {
    const color = match[1].trim()
    const content = match[2]
    let colorValue = color
    if (color.startsWith('#') || color.startsWith('rgb')) {
      colorValue = color
    } else {
      const colorMap = {
        red: '#ff4444',
        green: '#44ff44',
        blue: '#4444ff',
        yellow: '#ffff44',
        orange: '#ff8844',
        purple: '#8844ff',
        pink: '#ff44ff',
        cyan: '#44ffff',
        lime: '#88ff44'
      }
      colorValue = colorMap[color.toLowerCase()] || color
    }
    result = result.replace(match[0], `<span style="color:${colorValue}">${content}</span>`)
  }
  return result
}

export default {
  name: 'LineManagerWindow',
  components: { Teleport, Transition, LineManagerDialog, LineManagerTopbar, ContextMenu, SpotlightOverlay },
  data() {
    return {
      isSavingThroughLine: false,
      folders: [],
      loading: false,
      runtimeLoading: false,
      isSearchActive: false,
      currentLines: [],
      filteredLines: []
    }
  },
  setup() {
    const { t } = useI18n()
    const folders = ref([])
    const currentFolderId = ref(null)
    const currentLines = ref([])
    const rootExplorerItems = ref([])
    const linesRootPath = ref(null)
    const currentDirectoryPath = ref(null)
    const currentDirectoryFolders = ref([])
    const folderSortMode = ref('updated-desc')
    const searchSortMode = ref('relevance')
    const searchSortDropdownOpen = ref(false)
    const searchSortDropdownRef = ref(null)
    const loading = ref(false)
    const selectedFolderId = ref(null)
    const selectedLine = ref(null)
    const selectedEntries = ref([])
    const selectionAnchorKey = ref(null)
    const searchQuery = ref('')
    const allLinesWithFolder = ref([])
    const searchLoading = ref(false)
    const linesRef = ref(null)

    const {
      currentStep: spotlightStep,
      isVisible: spotlightVisible,
      isCompleted: spotlightCompleted,
      startLineManagerGuide,
      nextStep: spotlightNextStep,
      prevStep: spotlightPrevStep,
      closeGuide: spotlightCloseGuide,
      SPOTLIGHT_STEP_CONFIG: SPOTLIGHT_CONFIG
    } = useSpotlightGuide()

    const spotlightStepConfig = computed(() => {
      const step = spotlightStep.value
      return SPOTLIGHT_CONFIG[step] || null
    })

    // 右键菜单状态
    const contextMenu = ref({ visible: false, x: 0, y: 0, entry: null })
    const lineContextMenu = ref({ visible: false, x: 0, y: 0, line: null })
    const sidebarNewMenu = ref({ visible: false, x: 0, y: 0 })
    const linesNewMenu = ref({ visible: false, x: 0, y: 0, targetFolderId: null, targetFolderPath: null })
    const clipboard = ref({ type: null, line: null, folder: null, sourceFolderId: null, sourceFolderPath: null, targetPath: null })

    const isSavingThroughLine = ref(false)
    const pendingThroughLineInfo = ref(null)
    const isSavingLine = ref(false)
    const pendingLineSaveData = ref(null)

    // 云控线路
    const runtimeLines = ref([])
    const runtimeLoading = ref(false)
    const cloudConfig = useCloudConfig(CLOUD_API_BASE)
    const CLOUD_FOLDER_ID = 'runtime-cloud'

    const hasFoldersAPI = computed(
      () => !!(window.electronAPI && window.electronAPI.lines && window.electronAPI.lines.folders)
    )

    // 保存贯通线路（从 ConsolePage 传入 pendingThroughLineData 后，在此选择文件夹并落盘）
    async function saveThroughLine() {
      try {
        console.log('[线路管理器] saveThroughLine 开始执行')

        const pendingDataStr = localStorage.getItem('pendingThroughLineData')
        if (!pendingDataStr) {
          console.warn('[线路管理器] 未找到待保存的贯通线路数据')
          return
        }

        const pendingData = JSON.parse(pendingDataStr)
        const { lineData, lineName, cleanLineName, validSegments, sourceLinePaths } = pendingData

        console.log('[线路管理器] 贯通线路信息:', {
          lineName,
          segmentCount: validSegments ? validSegments.length : 0,
          foldersCount: folders.value.length
        })

        isSavingThroughLine.value = true
        pendingThroughLineInfo.value = {
          lineName,
          segmentCount: validSegments ? validSegments.length : 0
        }

        await nextTick()

        // 可用文件夹：排除云控
        const availableFolders = folders.value.filter(
          (f) => f.id !== CLOUD_FOLDER_ID && !f.isRuntime
        )

        console.log('[线路管理器] 可用文件夹数量:', availableFolders.length)

        if (availableFolders.length === 0) {
          if (!window.__lineManagerDialog) return
          const folderName = await window.__lineManagerDialog.prompt(
            t('lineManagerWindow.noAvailableFolders'),
            t('lineManagerWindow.newFolder'),
            t('lineManagerWindow.createFolder')
          )

          if (!folderName || !folderName.trim()) {
            isSavingThroughLine.value = false
            pendingThroughLineInfo.value = null
            try {
              localStorage.removeItem('pendingThroughLineData')
              localStorage.removeItem('throughOperationSelectorTarget')
            } catch (e) {}
            localStorage.setItem(
              'throughLineSaveResult',
              JSON.stringify({ success: false, error: 'cancelled' })
            )
            if (window.electronAPI?.closeWindow) await window.electronAPI.closeWindow()
            return
          }

          const addRes = await window.electronAPI.lines.folders.add(folderName.trim())
          if (addRes && addRes.ok) {
            await loadFolders()
            const newFolder = folders.value.find((f) => f.id === addRes.folderId)
            if (newFolder) {
              await doSaveThroughLine(lineData, cleanLineName, newFolder, sourceLinePaths)
            } else {
              localStorage.setItem(
                'throughLineSaveResult',
                JSON.stringify({ success: false, error: t('lineManagerWindow.folderCreatedButNotFound') })
              )
              if (window.electronAPI?.closeWindow) await window.electronAPI.closeWindow()
            }
          } else {
            localStorage.setItem(
              'throughLineSaveResult',
              JSON.stringify({
                success: false,
                error: (addRes && addRes.error) || t('lineManagerWindow.createFolderFailed')
              })
            )
            if (window.electronAPI?.closeWindow) await window.electronAPI.closeWindow()
          }
          return
        }

        // 始终让用户选择文件夹（即使只有一个），避免“秒关窗口”的体验
        await new Promise((resolve) => setTimeout(resolve, 800))
        const selectedFolder = await showFolderSelector(
          availableFolders,
          t('lineManagerWindow.selectFolderForThroughLine'),
          lineName
        )
        if (selectedFolder) {
          await doSaveThroughLine(lineData, cleanLineName, selectedFolder, sourceLinePaths)
        } else {
          isSavingThroughLine.value = false
          pendingThroughLineInfo.value = null
          try {
            localStorage.removeItem('pendingThroughLineData')
            localStorage.removeItem('throughOperationSelectorTarget')
          } catch (e) {}
          localStorage.setItem(
            'throughLineSaveResult',
            JSON.stringify({ success: false, error: 'cancelled' })
          )
          if (window.electronAPI?.closeWindow) await window.electronAPI.closeWindow()
        }
      } catch (e) {
        console.error('保存贯通线路失败:', e)
        isSavingThroughLine.value = false
        pendingThroughLineInfo.value = null
        try {
          localStorage.removeItem('pendingThroughLineData')
          localStorage.removeItem('throughOperationSelectorTarget')
        } catch (e2) {}
        localStorage.setItem(
          'throughLineSaveResult',
          JSON.stringify({ success: false, error: e.message || e })
        )
        if (window.electronAPI?.closeWindow) await window.electronAPI.closeWindow()
      }
    }

    async function doSaveThroughLine(lineData, cleanLineName, folder, sourceLinePaths = null) {
      try {
        if (folder.id === CLOUD_FOLDER_ID) {
          if (window.__lineManagerDialog) {
            await window.__lineManagerDialog.alert(t('lineManagerWindow.cannotSaveToDefaultOrCloudFolder'), t('console.info'))
          }
          return
        }

        const safeName = (cleanLineName || t('lineManagerWindow.throughLine')).replace(/[<>:"/\\|?*]/g, '').trim()
        const targetFileName = (safeName || 'through-line') + '.mpl'
        const saveRes = await window.electronAPI.lines.save(targetFileName, lineData, folder.path, sourceLinePaths)

        if (saveRes && saveRes.ok) {
          isSavingThroughLine.value = false
          pendingThroughLineInfo.value = null
          try {
            localStorage.removeItem('pendingThroughLineData')
            localStorage.removeItem('throughOperationSelectorTarget')
          } catch (e) {}
          localStorage.setItem(
            'throughLineSaveResult',
            JSON.stringify({
              success: true,
              folderId: folder.id,
              folderPath: folder.path,
              filePath:
                saveRes.path ||
                folder.path +
                  (folder.path.includes('\\') ? '\\' : '/') +
                  targetFileName
            })
          )
          await loadLinesFromFolder(folder.id)
          if (window.electronAPI?.closeWindow) {
            await new Promise((resolve) => setTimeout(resolve, 100))
            await window.electronAPI.closeWindow()
          }
        } else {
          isSavingThroughLine.value = false
          pendingThroughLineInfo.value = null
          try {
            localStorage.removeItem('pendingThroughLineData')
            localStorage.removeItem('throughOperationSelectorTarget')
          } catch (e) {}
          localStorage.setItem(
            'throughLineSaveResult',
            JSON.stringify({
              success: false,
              error: (saveRes && saveRes.error) || t('lineManagerWindow.saveFailed')
            })
          )
          if (window.electronAPI?.closeWindow) await window.electronAPI.closeWindow()
        }
      } catch (e) {
        console.error('执行保存失败:', e)
        try {
          localStorage.removeItem('pendingThroughLineData')
          localStorage.removeItem('throughOperationSelectorTarget')
        } catch (e2) {}
        localStorage.setItem(
          'throughLineSaveResult',
          JSON.stringify({ success: false, error: e.message || e })
        )
        if (window.electronAPI?.closeWindow) await window.electronAPI.closeWindow()
      }
    }

    // 纯 JS 文件夹选择弹窗（沿用旧实现）
    async function showFolderSelector(foldersList, title, lineName = '') {
      return new Promise((resolve) => {
        const root = typeof document !== 'undefined' ? document.documentElement : null
        const isBlurEnabled = !(root && root.classList.contains('blur-disabled'))
        const isDarkTheme = !!(root && (root.classList.contains('dark') || root.getAttribute('data-theme') === 'dark'))

        const overlayBg = isBlurEnabled
          ? 'rgba(0, 0, 0, 0.18)'
          : (isDarkTheme ? 'rgba(0, 0, 0, 0.36)' : 'rgba(0, 0, 0, 0.28)')
        const overlayFilter = isBlurEnabled ? 'blur(8px) saturate(130%)' : 'none'
        const dialogBg = isBlurEnabled
          ? (isDarkTheme ? 'rgba(30, 30, 30, 0.85)' : 'rgba(255, 255, 255, 0.85)')
          : (isDarkTheme ? '#1c1c20' : '#ffffff')
        const dialogFilter = isBlurEnabled ? 'blur(20px) saturate(180%)' : 'none'
        const dialogBorder = isBlurEnabled
          ? '1px solid rgba(255,255,255,0.1)'
          : (isDarkTheme ? '1px solid rgba(255,255,255,0.16)' : '1px solid rgba(15,23,42,0.16)')

        const dialog = document.createElement('div')
        dialog.style.cssText =
          'position:fixed; inset:0; display:flex; align-items:center; justify-content:center; z-index:21000; background:' + overlayBg + '; backdrop-filter:' + overlayFilter + '; -webkit-backdrop-filter:' + overlayFilter + '; animation:fadeIn 0.3s ease;'

        const dialogContent = document.createElement('div')
        dialogContent.style.cssText =
          'background:' + dialogBg + '; backdrop-filter:' + dialogFilter + '; -webkit-backdrop-filter:' + dialogFilter + '; border-radius:16px; width:92%; max-width:500px; max-height:85vh; display:flex; flex-direction:column; box-shadow:0 20px 60px rgba(0,0,0,0.4); border:' + dialogBorder + '; overflow:hidden; transform:scale(1); transition:transform 0.2s;'

        const header = document.createElement('div')
        header.style.cssText =
          'padding:24px 28px; border-bottom:1px solid var(--divider, rgba(0,0,0,0.1)); display:flex; flex-direction:column; gap:16px; flex-shrink:0; background:linear-gradient(135deg, rgba(255,159,67,0.05) 0%, rgba(255,159,67,0.02) 100%);'
        const selectFolderText = t('lineManagerWindow.selectFolder')
        const saveThroughLineText = t('lineManagerWindow.saveThroughLine')
        const lineNameText = t('lineManagerWindow.lineName')
        header.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div style="display:flex; align-items:center; gap:12px;">
              <div style="width:40px; height:40px; border-radius:10px; background:linear-gradient(135deg, #FF9F43 0%, #FFC371 100%); display:flex; align-items:center; justify-content:center; box-shadow:0 4px 12px rgba(255,159,67,0.3);">
                <i class="fas fa-folder-open" style="color:white; font-size:18px;"></i>
              </div>
              <div>
                <h3 style="margin:0; font-size:20px; font-weight:800; color:var(--text, #333); letter-spacing:-0.5px;">${title || selectFolderText}</h3>
                <div style="font-size:12px; color:var(--muted, #999); margin-top:2px;">${selectFolderText}</div>
              </div>
            </div>
            <button id="closeBtn" style="background:none; border:none; color:var(--muted, #999); cursor:pointer; font-size:20px; padding:8px; width:36px; height:36px; display:flex; align-items:center; justify-content:center; border-radius:8px; transition:all 0.2s;">
              <i class="fas fa-times"></i>
            </button>
          </div>
          ${
            lineName
              ? `
          <div style="padding:14px 16px; background:linear-gradient(135deg, #FF9F43 0%, #FFC371 100%); border-radius:10px; display:flex; align-items:center; gap:12px; box-shadow:0 4px 12px rgba(255,159,67,0.3);">
            <i class="fas fa-exchange-alt" style="font-size:20px; color:#fff;"></i>
            <div style="flex:1;">
              <div style="font-size:14px; font-weight:700; color:#fff; margin-bottom:4px;">${saveThroughLineText}</div>
              <div style="font-size:12px; color:rgba(255,255,255,0.95);">${lineNameText} ${lineName}</div>
            </div>
          </div>
          `
              : ''
          }
        `

        const folderList = document.createElement('div')
        folderList.style.cssText =
          'flex:1; overflow-y:auto; padding:20px 28px; background:var(--bg, #fafafa);'

        let selectedFolder = null

        foldersList.forEach((folder) => {
          const folderCard = document.createElement('div')
          folderCard.style.cssText =
            'display:flex; align-items:center; justify-content:space-between; padding:16px; margin-bottom:12px; background:var(--card, #ffffff); border-radius:12px; border:2px solid var(--divider, rgba(0,0,0,0.08)); cursor:pointer; transition:all 0.2s; user-select:none; box-shadow:0 2px 8px rgba(0,0,0,0.04);'
          folderCard.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px;">
              <div style="width:28px; height:28px; border-radius:8px; background:rgba(255,159,67,0.1); display:flex; align-items:center; justify-content:center; color:#FF9F43;">
                <i class="fas fa-folder"></i>
              </div>
              <div style="display:flex; flex-direction:column;">
                <div style="font-size:14px; font-weight:600; color:var(--text, #333);">${folder.name}</div>
                <div style="font-size:11px; color:var(--muted, #999);">${folder.path}</div>
              </div>
            </div>
          `
          folderCard.onclick = () => {
            selectedFolder = folder
            resolve(selectedFolder)
            document.body.removeChild(dialog)
          }
          folderList.appendChild(folderCard)
        })

        const footer = document.createElement('div')
        footer.style.cssText =
          'padding:14px 20px; border-top:1px solid var(--divider, rgba(0,0,0,0.08)); background:var(--card, #ffffff); display:flex; justify-content:flex-end; gap:10px;'
        const cancelText = t('lineManagerWindow.btnCancel')
        footer.innerHTML = `
          <button id="cancelBtn" style="padding:8px 14px; border-radius:6px; border:1px solid var(--divider, rgba(0,0,0,0.1)); background:transparent; cursor:pointer; font-size:13px;">${cancelText}</button>
        `

        dialogContent.appendChild(header)
        dialogContent.appendChild(folderList)
        dialogContent.appendChild(footer)
        dialog.appendChild(dialogContent)
        document.body.appendChild(dialog)

        const close = () => {
          resolve(null)
          if (document.body.contains(dialog)) document.body.removeChild(dialog)
        }
        dialog.addEventListener('click', (e) => {
          if (e.target === dialog) close()
        })
        footer.querySelector('#cancelBtn').addEventListener('click', close)
        header.querySelector('#closeBtn').addEventListener('click', close)
      })
    }

    // 检查是否处于“保存贯通线路”模式：从 ConsolePage 打开时触发
    async function checkSaveThroughLineMode() {
      const target = localStorage.getItem('throughOperationSelectorTarget')
      const pendingData = localStorage.getItem('pendingThroughLineData')

      if (target === 'save-through-line' && pendingData) {
        // 仅设置状态和引导，不自动保存；用户切换目标文件夹后点击底栏「保存贯通线路」再保存
        try {
          const pendingDataObj = JSON.parse(pendingData)
          const { lineName, validSegments } = pendingDataObj
          isSavingThroughLine.value = true
          pendingThroughLineInfo.value = {
            lineName,
            segmentCount: validSegments ? validSegments.length : 0
          }
          await nextTick()
          // 保存贯通线路时自动选中第一个可用文件夹（非云控）
          const availableFolders = folders.value.filter(
            (f) => f.id !== CLOUD_FOLDER_ID && !f.isRuntime
          )
          if (availableFolders.length > 0) {
            const first = availableFolders[0]
            currentFolderId.value = first.id
            selectedFolderId.value = first.id
            await loadLinesFromFolder(first.id)
          }
        } catch (e) {
          console.error('[线路管理器] checkSaveThroughLineMode 解析失败:', e)
        }
      }
    }

    // 检查是否有普通线路的保存请求（通过 localStorage 传递）
    async function checkPendingLineSaveMode() {
      if (isSavingThroughLine.value) return
      const mode = localStorage.getItem('lineManagerSaveMode')
      const pending = localStorage.getItem('pendingLineSaveData')
      if (!mode || !pending) return
      try {
        const data = JSON.parse(pending)
        pendingLineSaveData.value = data
        isSavingLine.value = true
        await nextTick()

        const availableFolders = folders.value.filter((f) => f.id !== CLOUD_FOLDER_ID && !f.isRuntime)
        let target = null
        if (data.currentFolderId) {
          target = availableFolders.find((f) => f.id === data.currentFolderId) || null
        }
        if (!target && availableFolders.length > 0) {
          target = availableFolders[0]
        }
        if (target) {
          currentFolderId.value = target.id
          if (isRootExplorer.value) {
            clearEntrySelection()
            selectedFolderId.value = null
            currentDirectoryPath.value = null
          } else {
            selectedFolderId.value = target.id
            await loadLinesFromFolder(target.id)
          }
        }
      } catch (e) {
        console.error('[线路管理器] checkPendingLineSaveMode 解析失败:', e)
      }
    }
    function getStationInfo(lineData) {
      if (!lineData || !lineData.stations || !Array.isArray(lineData.stations) || lineData.stations.length === 0) {
        return { first: '', last: '' }
      }
      const stations = lineData.stations
      const firstSt = stations[0]
      const lastSt = stations[stations.length - 1]
      const cleanName = (name) => {
        if (!name) return ''
        return String(name).replace(/<[^>]+>([^<]*)<\/>/g, '$1')
      }
      return {
        first: cleanName(firstSt.name || ''),
        last: cleanName(lastSt.name || '')
      }
    }

    function buildLineColor(lineData) {
      const meta = (lineData && lineData.meta) || {}
      const base = meta.themeColor || '#5F27CD'
      const ranges = meta.customColorRanges
      if (!ranges || !Array.isArray(ranges) || ranges.length === 0) return base
      const colors = [...new Set(ranges.map((r) => r && r.color).filter(Boolean))]
      if (!colors.length) return base
      if (colors.length === 1) return colors[0]
      const step = 100 / colors.length
      const stops = colors
        .map((c, idx) => {
          const start = Math.round(idx * step)
          const end = Math.round((idx + 1) * step)
          return `${c} ${start}%, ${c} ${end}%`
        })
        .join(', ')
      return `linear-gradient(180deg, ${stops})`
    }

    function normalizePath(value) {
      return String(value || '').replace(/[\\/]+$/, '').toLowerCase()
    }

    function buildLineEntry(d, fileName, folderPath, folderMeta = null, fileMeta = null) {
      const stationInfo = getStationInfo(d)
      const lineName = d.meta?.lineName || ''
      const hasThroughInName = lineName.includes('(贯通)') || lineName.includes('（贯通）')
      const hasValidSegments =
        d.meta?.throughLineSegments &&
        Array.isArray(d.meta.throughLineSegments) &&
        d.meta.throughLineSegments.length >= 2
      const isThroughLine = d.meta?.throughOperationEnabled === true || (hasValidSegments && hasThroughInName)
      const isLoopLine = d.meta?.mode === 'loop'
      return {
        type: 'line',
        name: d.meta?.lineName || t('lineManagerWindow.unnamedLine'),
        filePath: fileName || '',
        folderPath: folderPath || null,
        folderId: folderMeta?.id || null,
        folderName: folderMeta?.name || '',
        size: fileMeta?.size ?? null,
        mtime: fileMeta?.mtime || null,
        mtimeMs: fileMeta?.mtimeMs || 0,
        ext: fileMeta?.ext || '',
        data: d,
        themeColor: buildLineColor(d),
        firstStation: stationInfo.first,
        lastStation: stationInfo.last,
        isThroughLine,
        isLoopLine
      }
    }

    function buildFallbackLineEntry(fileName, folderPath, folderMeta = null, fileMeta = null) {
      const displayName = String(fileName || '').replace(/\.(json|mpl)$/i, '') || t('lineManagerWindow.unnamedLine')
      return {
        type: 'line',
        name: displayName,
        filePath: fileName || '',
        folderPath: folderPath || null,
        folderId: folderMeta?.id || null,
        folderName: folderMeta?.name || '',
        size: fileMeta?.size ?? null,
        mtime: fileMeta?.mtime || null,
        mtimeMs: fileMeta?.mtimeMs || 0,
        ext: fileMeta?.ext || '',
        data: { meta: { lineName: displayName, themeColor: '#58a4ed' }, stations: [] },
        themeColor: '#58a4ed',
        firstStation: '',
        lastStation: '',
        isThroughLine: false,
        isLoopLine: false,
        loadFailed: true
      }
    }

    function buildExplorerFolderEntry(folder, extra = {}) {
      return {
        type: 'folder',
        id: folder.id || null,
        name: folder.name,
        path: folder.path || null,
        mtime: folder.mtime || null,
        mtimeMs: folder.mtimeMs || 0,
        itemCount: Number.isFinite(folder.itemCount) ? folder.itemCount : null,
        isRuntime: !!folder.isRuntime,
        isRootFolder: !!extra.isRootFolder,
        icon: extra.icon || 'fas fa-folder'
      }
    }

    function resolveFolderById(folderId) {
      return folders.value.find((f) => f.id === folderId) || null
    }

    function resolveRootFolderByPath(folderPath) {
      const normalizedTarget = normalizePath(folderPath)
      return folders.value.find((folder) => {
        const rootPath = normalizePath(folder.path)
        return !!rootPath && (normalizedTarget === rootPath || normalizedTarget.startsWith(rootPath + '\\') || normalizedTarget.startsWith(rootPath + '/'))
      }) || null
    }

    function getActiveDirectoryPath() {
      if (selectedFolderId.value === CLOUD_FOLDER_ID) return null
      if (!selectedFolderId.value) return null
      if (currentDirectoryPath.value) return currentDirectoryPath.value
      const folder = resolveFolderById(selectedFolderId.value || currentFolderId.value)
      return folder?.path || null
    }

    function getSelectedRootFolderEntry() {
      if (!isRootExplorer.value) return null
      if (selectedEntries.value.length !== 1) return null
      const entry = selectedEntries.value[0]
      if (!entry || entry.type !== 'folder' || !entry.isRootFolder || !entry.path || entry.id === CLOUD_FOLDER_ID) return null
      return entry
    }

    async function ensureLinesRootPath() {
      if (linesRootPath.value) return linesRootPath.value
      try {
        const res = await window.electronAPI?.lines?.rootDir?.()
        if (res && res.ok && res.path) {
          linesRootPath.value = res.path
          return linesRootPath.value
        }
      } catch (e) {
        console.warn('获取线路根目录失败:', e)
      }
      const localFolders = folders.value.filter((folder) => folder.path && folder.id !== CLOUD_FOLDER_ID)
      if (localFolders.length > 0) {
        const samplePath = String(localFolders[0].path || '')
        const normalized = samplePath.replace(/[\\/]+$/, '')
        const rootPath = normalized.replace(/[\\/][^\\/]+$/, '')
        if (rootPath) {
          linesRootPath.value = rootPath
          return linesRootPath.value
        }
      }
      return null
    }

    function getCreateLineTarget() {
      const activePath = getActiveDirectoryPath()
      if (activePath) {
        return {
          folderId: selectedFolderId.value || currentFolderId.value || null,
          folderPath: activePath
        }
      }
      if (isRootExplorer.value) {
        return {
          folderId: null,
          folderPath: linesRootPath.value || null
        }
      }
      return { folderId: null, folderPath: null }
    }

    function getWritableExplorerPath() {
      return getActiveDirectoryPath() || linesRootPath.value || null
    }

    async function resolveCreateLineTarget(targetFolderPath = null, targetFolderId = null) {
      if (targetFolderPath) {
        return { folderId: targetFolderId || null, folderPath: targetFolderPath }
      }

      const directTarget = getCreateLineTarget()
      if (directTarget.folderPath) return directTarget

      if (!isRootExplorer.value) return directTarget
      const rootPath = await ensureLinesRootPath()
      return { folderId: null, folderPath: rootPath || null }
    }

    function getLineDirectoryPath(line) {
      if (line?.folderPath) return line.folderPath
      return getActiveDirectoryPath()
    }

    function getEntryKey(entry) {
      if (!entry) return ''
      if (entry.type === 'folder') return `folder:${normalizePath(entry.path || entry.id || entry.name)}`
      return `line:${normalizePath((entry.folderPath || getActiveDirectoryPath() || '') + '|' + (entry.filePath || entry.name || ''))}`
    }

    function isEntrySelected(entry) {
      const key = getEntryKey(entry)
      return !!key && selectedEntries.value.some((item) => getEntryKey(item) === key)
    }

    function clearEntrySelection() {
      selectedEntries.value = []
      selectionAnchorKey.value = null
      selectedLine.value = null
    }

    function formatExplorerDate(value) {
      if (!value) return ''
      try {
        return new Date(value).toLocaleDateString('zh-CN')
      } catch (e) {
        return ''
      }
    }

    function formatExplorerMonth(value) {
      if (!value) return ''
      try {
        const date = new Date(value)
        const y = date.getFullYear()
        const m = String(date.getMonth() + 1).padStart(2, '0')
        return `${y}-${m}`
      } catch (e) {
        return ''
      }
    }

    function formatExplorerFileSize(value) {
      const size = Number(value)
      if (!Number.isFinite(size) || size <= 0) return ''
      const mb = size / (1024 * 1024)
      if (mb >= 1) return `${mb.toFixed(1)} MB`
      const kb = size / 1024
      return `${Math.max(1, Math.round(kb))} KB`
    }

    function getLineEntrySourceLabel(entry) {
      if (!entry) return ''
      if (entry.isRuntime) return '来自 云控'
      return entry.folderName ? `来自 ${entry.folderName}` : '来自 本地'
    }

    function getFolderEntryHint(entry) {
      if (!entry) return ''
      if (typeof entry.itemCount === 'number') return `${entry.itemCount} 个文件`
      if (entry.isRuntime) return t('lineManagerWindow.cloudLinesFolder')
      if (entry.isRootFolder && entry.path) return entry.path
      return t('lineManager.ctxOpenFolder')
    }

    function getFolderEntryMeta(entry) {
      if (!entry) return ''
      if (entry.isRootFolder && entry.path) return entry.path
      return entry.isRuntime ? t('lineManagerWindow.cloudLinesFolder') : t('lineManager.ctxOpenFolder')
    }

    function getFolderEntryUpdateLabel(entry) {
      if (!entry) return ''
      if (entry.isRuntime) return '更新 云控线路'
      return '更新 本地文件夹'
    }

    async function loadDirectoryContents(dirPath, rootFolderId = null) {
      if (!(window.electronAPI && window.electronAPI.lines)) return
      loading.value = true
      try {
        clearEntrySelection()
        currentDirectoryPath.value = dirPath || null
        if (rootFolderId) selectedFolderId.value = rootFolderId
        const activeFolder = resolveFolderById(selectedFolderId.value || currentFolderId.value)
        const browseRes = await window.electronAPI.lines.browse(dirPath || activeFolder?.path || null)
        if (!(browseRes && browseRes.ok)) {
          currentDirectoryFolders.value = []
          currentLines.value = []
          return
        }

        const folderMeta = resolveFolderById(selectedFolderId.value || currentFolderId.value)
        currentDirectoryFolders.value = (browseRes.items || [])
          .filter((item) => item.type === 'folder')
          .map((item) => buildExplorerFolderEntry(item, { icon: 'fas fa-folder-open' }))

        const lineEntries = []
        for (const item of browseRes.items || []) {
          if (item.type !== 'line') continue
          try {
            const readRes = await window.electronAPI.lines.read(item.fileName || item.name, dirPath)
            if (readRes && readRes.ok && readRes.content) {
              lineEntries.push(buildLineEntry(readRes.content, item.fileName || item.name, dirPath, folderMeta, item))
            } else {
              lineEntries.push(buildFallbackLineEntry(item.fileName || item.name, dirPath, folderMeta, item))
            }
          } catch (e) {
            console.warn('读取线路失败:', e)
            lineEntries.push(buildFallbackLineEntry(item.fileName || item.name, dirPath, folderMeta, item))
          }
        }
        currentLines.value = lineEntries
      } catch (e) {
        console.error('加载目录失败:', e)
        currentDirectoryFolders.value = []
        currentLines.value = []
      } finally {
        loading.value = false
      }
    }

    async function loadLinesFromFolder(folderId) {
      const folder = resolveFolderById(folderId)
      if (!folder || !folder.path) {
        currentLines.value = []
        currentDirectoryFolders.value = []
        return
      }
      await loadDirectoryContents(folder.path, folder.id)
    }

    async function loadRootExplorer(options = {}) {
      const preserveView = !!options.preserveView
      const silent = !!options.silent
      clearEntrySelection()
      selectedFolderId.value = null
      currentDirectoryPath.value = null
      if (!preserveView) {
        currentDirectoryFolders.value = []
        currentLines.value = []
        rootExplorerItems.value = []
      }
      if (!silent) loading.value = true
      try {
        const rootPath = await ensureLinesRootPath()
        if (!rootPath || !window.electronAPI?.lines?.browse) return
        const browseRes = await window.electronAPI.lines.browse(rootPath)
        if (!(browseRes && browseRes.ok)) return
        linesRootPath.value = browseRes.path || rootPath
        const items = []
        for (const item of browseRes.items || []) {
          if (item.type === 'folder') {
            const rootFolder = resolveRootFolderByPath(item.path)
            items.push(buildExplorerFolderEntry(
              {
                ...item,
                id: rootFolder?.id || null,
                itemCount: rootFolder?.itemCount ?? null
              },
              { isRootFolder: true }
            ))
            continue
          }
          if (item.type !== 'line') continue
          try {
            const readRes = await window.electronAPI.lines.read(item.fileName || item.name, rootPath)
            if (readRes && readRes.ok && readRes.content) {
              items.push(buildLineEntry(readRes.content, item.fileName || item.name, rootPath, null, item))
            } else {
              items.push(buildFallbackLineEntry(item.fileName || item.name, rootPath, null, item))
            }
          } catch (e) {
            console.warn('读取根目录线路失败:', e)
            items.push(buildFallbackLineEntry(item.fileName || item.name, rootPath, null, item))
          }
        }
        const cloudFolder = folders.value.find((folder) => folder.id === CLOUD_FOLDER_ID)
        if (cloudFolder) {
          items.push(buildExplorerFolderEntry(cloudFolder, { isRootFolder: true }))
        }
        rootExplorerItems.value = items
      } catch (e) {
        console.error('加载首页目录失败:', e)
        rootExplorerItems.value = []
      } finally {
        if (!silent) loading.value = false
      }
    }

    async function refreshRootExplorer(options = {}) {
      await loadFolders(false)
      await loadRootExplorer({ preserveView: true, silent: true, ...options })
    }

    async function loadFolders(refreshRootAfterLoad = true) {
      if (!hasFoldersAPI.value) {
        folders.value = [
          { id: CLOUD_FOLDER_ID, name: t('lineManagerWindow.cloudLinesFolder'), path: null, isRuntime: true }
        ]
        currentFolderId.value = CLOUD_FOLDER_ID
        if (refreshRootAfterLoad) await loadRootExplorer()
        return
      }
      try {
        const res = await window.electronAPI.lines.folders.list()
        if (res && res.ok && res.folders) {
          const foldersWithMeta = await Promise.all(
            (res.folders || []).map(async (folder) => {
              try {
                const browseRes = await window.electronAPI.lines.browse(folder.path)
                return {
                  ...folder,
                  itemCount: Array.isArray(browseRes?.items) ? browseRes.items.length : null
                }
              } catch (e) {
                return { ...folder, itemCount: null }
              }
            })
          )
          folders.value = [
            ...foldersWithMeta,
            { id: CLOUD_FOLDER_ID, name: t('lineManagerWindow.cloudLinesFolder'), path: null, isRuntime: true }
          ]
          const firstId = foldersWithMeta.length > 0 ? foldersWithMeta[0].id : null
          currentFolderId.value = res.current || firstId
          if (refreshRootAfterLoad) await loadRootExplorer()
        }
      } catch (e) {
        console.error('加载文件夹列表失败:', e)
      }
    }

    async function loadRuntimeLines() {
      runtimeLoading.value = true
      clearEntrySelection()
      currentDirectoryPath.value = null
      currentDirectoryFolders.value = []
      currentLines.value = []
      runtimeLines.value = []
      try {
        const result = await cloudConfig.getRuntimeLines()
        if (result.ok && (result.data || result.lines)) {
          const lines = (result.data?.lines || result.lines || []).map((line) => {
            const stationInfo = getStationInfo(line)
            const lineName = line.meta?.lineName || ''
            const hasThroughInName = lineName.includes('(贯通)') || lineName.includes('（贯通）')
            const hasValidSegments =
              line.meta?.throughLineSegments &&
              Array.isArray(line.meta.throughLineSegments) &&
              line.meta.throughLineSegments.length >= 2
            const isThroughLine =
              line.meta?.throughOperationEnabled === true || (hasValidSegments && hasThroughInName)
            const isLoopLine = line.meta?.mode === 'loop'
            return {
              type: 'line',
              name: lineName || t('lineManagerWindow.unnamedLine'),
              folderPath: null,
              folderId: CLOUD_FOLDER_ID,
              folderName: t('lineManagerWindow.cloudLinesFolder'),
              data: line,
              stationCount: line.stations?.length || 0,
              themeColor: buildLineColor(line),
              firstStation: stationInfo.first,
              lastStation: stationInfo.last,
              isRuntime: true,
              isThroughLine,
              isLoopLine
            }
          })
          runtimeLines.value = lines
          currentLines.value = lines
        } else {
          await dialogService.alert(t('lineManagerWindow.failedToGetCloudLines') + (result.error || t('lineManagerWindow.unknownError')), '错误')
        }
      } catch (e) {
        console.error('加载云控线路失败:', e)
        await dialogService.alert(t('lineManagerWindow.failedToLoadCloudLines') + (e.message || e), '错误')
      } finally {
        runtimeLoading.value = false
      }
    }

    // 加载所有文件夹中的线路（用于全局搜索），每条附带 folderId / folderName
    async function loadAllLinesWithFolders() {
      if (!(window.electronAPI && window.electronAPI.lines)) return
      searchLoading.value = true
      try {
        const results = []
        const rootPath = await ensureLinesRootPath()
        if (rootPath) {
          const rootBrowseRes = await window.electronAPI.lines.browse(rootPath)
          if (rootBrowseRes && rootBrowseRes.ok) {
            for (const item of rootBrowseRes.items || []) {
              if (item.type !== 'line') continue
              try {
                const res = await window.electronAPI.lines.read(item.fileName || item.name, rootPath)
                if (res && res.ok && res.content) {
                  results.push({
                    ...buildLineEntry(res.content, item.fileName || item.name, rootPath, null, item),
                    folderId: null,
                    folderName: t('lineManager.title')
                  })
                } else {
                  results.push({
                    ...buildFallbackLineEntry(item.fileName || item.name, rootPath, null, item),
                    folderId: null,
                    folderName: t('lineManager.title')
                  })
                }
              } catch (e) {
                console.warn('读取根目录搜索线路失败:', e)
                results.push({
                  ...buildFallbackLineEntry(item.fileName || item.name, rootPath, null, item),
                  folderId: null,
                  folderName: t('lineManager.title')
                })
              }
            }
          }
        }
        const foldersToSearch = folders.value.filter((f) => f.id !== CLOUD_FOLDER_ID && !f.isRuntime)
        for (const folder of foldersToSearch) {
          const folderPath = folder.path ?? null
          const items = await window.electronAPI.lines.list(folderPath)
          for (const it of items || []) {
            try {
              const res = await window.electronAPI.lines.read(it.name, folderPath)
              if (res && res.ok && res.content) {
                const d = res.content
                const stationInfo = getStationInfo(d)
                const lineName = d.meta?.lineName || ''
                const hasThroughInName = lineName.includes('(贯通)') || lineName.includes('（贯通）')
                const hasValidSegments =
                  d.meta?.throughLineSegments &&
                  Array.isArray(d.meta.throughLineSegments) &&
                  d.meta.throughLineSegments.length >= 2
                const isThroughLine = d.meta?.throughOperationEnabled === true || (hasValidSegments && hasThroughInName)
                const isLoopLine = d.meta?.mode === 'loop'
                results.push({
                  ...buildLineEntry(d, it?.name || '', folderPath, folder),
                  folderId: folder.id,
                  folderName: folder.name || folder.id
                })
              }
            } catch (e) {
              console.warn('读取线路失败:', e)
            }
          }
        }
        // 云控线路
        if (folders.value.some((f) => f.id === CLOUD_FOLDER_ID)) {
          try {
            const result = await cloudConfig.getRuntimeLines()
            if (result.ok && (result.data || result.lines)) {
              const lines = result.data?.lines || result.lines || []
              for (const raw of lines) {
                const stationInfo = getStationInfo(raw)
                const lineName = raw.meta?.lineName || ''
                const hasThroughInName = lineName.includes('(贯通)') || lineName.includes('（贯通）')
                const hasValidSegments =
                  raw.meta?.throughLineSegments &&
                  Array.isArray(raw.meta.throughLineSegments) &&
                  raw.meta.throughLineSegments.length >= 2
                const isThroughLine =
                  raw.meta?.throughOperationEnabled === true || (hasValidSegments && hasThroughInName)
                const isLoopLine = raw.meta?.mode === 'loop'
                results.push({
                  type: 'line',
                  name: lineName || t('lineManagerWindow.unnamedLine'),
                  data: raw,
                  stationCount: raw.stations?.length || 0,
                  themeColor: buildLineColor(raw),
                  firstStation: stationInfo.first,
                  lastStation: stationInfo.last,
                  isRuntime: true,
                  isThroughLine,
                  isLoopLine,
                  folderId: CLOUD_FOLDER_ID,
                  folderName: t('lineManagerWindow.cloudLinesFolder'),
                  folderPath: null
                })
              }
            }
          } catch (e) {
            console.warn('加载云控线路失败:', e)
          }
        }
        allLinesWithFolder.value = results
      } catch (e) {
        console.error('加载全部线路失败:', e)
        allLinesWithFolder.value = []
      } finally {
        searchLoading.value = false
      }
    }

    // 手动刷新资源管理器（文件夹 + 当前列表 + 搜索数据）
    async function refreshExplorer() {
      try {
        const activeId = selectedFolderId.value
        const activePath = currentDirectoryPath.value
        const wasRootExplorer = !activeId && !activePath
        if (wasRootExplorer) {
          await refreshRootExplorer()
          if (isSearchActive.value) {
            await loadAllLinesWithFolders()
          }
          return
        }
        await loadFolders(false)
        if (activeId === CLOUD_FOLDER_ID) {
          selectedFolderId.value = CLOUD_FOLDER_ID
          await loadRuntimeLines()
        } else if (activePath) {
          const rootFolder = resolveRootFolderByPath(activePath)
          await loadDirectoryContents(activePath, rootFolder?.id || activeId || null)
        } else {
          await loadRootExplorer()
        }
        if (isSearchActive.value) {
          await loadAllLinesWithFolders()
        }
      } catch (e) {
        console.error('刷新资源管理器失败:', e)
      }
    }

    async function selectFolder(folderId) {
      clearEntrySelection()
      if (folderId === CLOUD_FOLDER_ID) {
        selectedFolderId.value = CLOUD_FOLDER_ID
        await loadRuntimeLines()
      } else {
        await loadLinesFromFolder(folderId)
      }
    }

    async function enterFolderEntry(folder) {
      if (!folder) return
      if (folder.id === CLOUD_FOLDER_ID || folder.isRuntime) {
        await selectFolder(CLOUD_FOLDER_ID)
        return
      }
      if (folder.isRootFolder && folder.id) {
        await selectFolder(folder.id)
        return
      }
      const rootFolder = resolveRootFolderByPath(folder.path)
      await loadDirectoryContents(folder.path, rootFolder?.id || selectedFolderId.value || null)
    }

    async function goToRootExplorer() {
      await loadRootExplorer()
    }

    async function navigateUp() {
      if (selectedFolderId.value === CLOUD_FOLDER_ID) {
        await goToRootExplorer()
        return
      }
      const activeFolder = resolveFolderById(selectedFolderId.value || currentFolderId.value)
      if (!activeFolder || !currentDirectoryPath.value) {
        await goToRootExplorer()
        return
      }
      if (normalizePath(currentDirectoryPath.value) === normalizePath(activeFolder.path)) {
        await goToRootExplorer()
        return
      }
      const segments = currentDirectoryPath.value.split(/[\\/]/).filter(Boolean)
      segments.pop()
      const parentPath = currentDirectoryPath.value.includes('\\')
        ? segments.join('\\')
        : segments.join('/')
      await loadDirectoryContents(parentPath, activeFolder.id)
    }

    function toggleLineSelection(line, event = null) {
      if (!line) return
      toggleEntrySelection(line, event)
      if (!event?.ctrlKey && !event?.metaKey && !event?.shiftKey && line.folderId && line.folderId !== selectedFolderId.value && isSearchActive.value) {
        selectFolder(line.folderId)
      }
    }

    // 规范化云控线路数据（兼容 API 返回 meta 或顶层 lineName），保证主应用可用的结构
    function normalizeRuntimeLineData(raw) {
      if (!raw || typeof raw !== 'object') return null
      const meta = { ...(raw.meta || {}), lineName: (raw.meta && raw.meta.lineName) || raw.lineName || '未命名线路' }
      const stations = Array.isArray(raw.stations) ? raw.stations : []
      return { ...raw, meta, stations }
    }

    async function applyRuntimeLine(lineData) {
      const normalized = normalizeRuntimeLineData(lineData)
      if (!normalized || !normalized.meta || !normalized.meta.lineName) {
        console.warn('[线路管理器] applyRuntimeLine: invalid lineData', lineData)
        if (window.__lineManagerDialog)
          await window.__lineManagerDialog.alert(t('lineManagerWindow.cloudLineDataInvalid'), '提示')
        return
      }
      try {
        const payload = JSON.parse(JSON.stringify(normalized))
        const lineName = payload.meta.lineName
        if (window.electronAPI && window.electronAPI.switchRuntimeLine) {
          const result = await window.electronAPI.switchRuntimeLine(payload)
          if (result && result.ok) {
            if (window.electronAPI?.closeWindow) {
              await window.electronAPI.closeWindow()
            } else {
              window.close()
            }
          } else if (result && result.error && window.__lineManagerDialog) {
            await window.__lineManagerDialog.alert(t('lineManagerWindow.applicationFailed') + result.error, '错误')
          }
        } else {
          const target = localStorage.getItem('throughOperationSelectorTarget')
          localStorage.setItem('runtimeLineData', JSON.stringify(payload))
          localStorage.setItem('lineManagerSelectedLine', lineName)
          localStorage.setItem('isRuntimeLine', 'true')
          if (target) {
            localStorage.setItem('lineManagerSelectedTarget', target)
          } else {
            localStorage.removeItem('lineManagerSelectedTarget')
          }
          if (window.opener && !window.opener.closed) {
            window.opener.postMessage(
              { type: 'switch-runtime-line', lineName, lineData: payload, target },
              '*'
            )
          }
          window.dispatchEvent(
            new StorageEvent('storage', {
              key: 'lineManagerSelectedLine',
              newValue: lineName
            })
          )
          window.close()
        }
      } catch (e) {
        console.error('[线路管理器] 应用云控线路失败:', e)
        try {
          await dialogService.alert(t('lineManagerWindow.failedToApplyCloudLine') + (e.message || e), '错误')
        } catch (_) {}
      }
    }

    async function applySelectedLine() {
      if (!selectedLine.value) return
      if (selectedLine.value.isRuntime) {
        await applyRuntimeLine(selectedLine.value.data)
      } else {
        await openLine(selectedLine.value)
      }
    }

    async function addFolder(parentDir = null) {
      if (!(window.electronAPI && window.electronAPI.lines)) return
      if (!window.__lineManagerDialog) return
      const name = await window.__lineManagerDialog.prompt(t('lineManagerWindow.enterFolderName'), '', t('lineManagerWindow.newFolder'))
      if (!name) return
      try {
        const res = parentDir
          ? await window.electronAPI.lines.fs.createFolder(parentDir, name)
          : await window.electronAPI.lines.folders.add(name)
        if (res && res.ok) await refreshExplorer()
      } catch (e) {
        console.error('新建文件夹失败:', e)
      }
    }

    async function deleteFolder(folderId, folderName, folderPath) {
      if (!window.__lineManagerDialog) return
      if (folderId === CLOUD_FOLDER_ID) {
        await window.__lineManagerDialog.alert(t('lineManagerWindow.cloudFolderDeleteForbidden'), t('console.info'))
        return
      }
      const confirmed = await window.__lineManagerDialog.confirm(
        t('lineManagerWindow.confirmDeleteFolder', { folderName }),
        t('lineManagerWindow.deleteFolder')
      )
      if (!confirmed) return
      if (!(window.electronAPI && window.electronAPI.lines)) {
        await window.__lineManagerDialog.alert(t('lineManagerWindow.electronApiNotAvailable'), t('console.error'))
        return
      }
      try {
        const res = folderId && !folderPath
          ? await window.electronAPI.lines.folders.remove(folderId)
          : await window.electronAPI.lines.fs.delete(folderPath || folderId)
        if (res && res.ok) {
          await refreshExplorer()
          await window.__lineManagerDialog.alert(t('lineManagerWindow.folderDeleted'), t('lineManagerWindow.success'))
        } else {
          const errorMsg = res && res.error ? res.error : t('lineManagerWindow.unknownError')
          console.error('删除文件夹失败:', res)
          await refreshExplorer()
          await window.__lineManagerDialog.alert(t('lineManagerWindow.failedToDeleteFolder', { errorMsg }), t('console.error'))
        }
      } catch (e) {
        console.error('删除文件夹失败:', e)
        await window.__lineManagerDialog.alert(t('lineManagerWindow.deleteFolderFailedPrefix') + (e.message || e), t('console.error'))
      }
    }

    async function renameFolder(folderId, currentName, folderPath = null) {
      if (!(window.electronAPI && window.electronAPI.lines)) return
      if (!window.__lineManagerDialog) return
      const newName = await window.__lineManagerDialog.prompt(t('lineManager.renameFolderPrompt'), currentName, t('lineManager.renameFolderTitle'))
      if (newName && newName.trim() !== currentName) {
        try {
          const res = folderId && !folderPath
            ? await window.electronAPI.lines.folders.rename(folderId, newName)
            : await window.electronAPI.lines.fs.rename(folderPath || folderId, newName)
          if (res && res.ok) await refreshExplorer()
        } catch (e) {
          console.error('重命名文件夹失败:', e)
        }
      }
    }

    function showContextMenu(event, folder) {
      event.preventDefault()
      event.stopPropagation()
      toggleEntrySelection(folder, event)
      contextMenu.value = {
        visible: true,
        x: event.clientX,
        y: event.clientY,
        entry: folder
      }
    }
    function closeContextMenu() {
      contextMenu.value.visible = false
    }

    function showSidebarNewMenu(event) {
      event.preventDefault()
      event.stopPropagation()
      contextMenu.value.visible = false
      lineContextMenu.value.visible = false
      linesNewMenu.value.visible = false
      sidebarNewMenu.value = { visible: true, x: event.clientX, y: event.clientY }
    }
    function closeSidebarNewMenu() {
      sidebarNewMenu.value.visible = false
    }

    function showLinesNewMenu(event) {
      event.preventDefault()
      event.stopPropagation()
      contextMenu.value.visible = false
      lineContextMenu.value.visible = false
      sidebarNewMenu.value.visible = false
      const target = getCreateLineTarget()
      linesNewMenu.value = {
        visible: true,
        x: event.clientX,
        y: event.clientY,
        targetFolderId: target.folderId || null,
        targetFolderPath: target.folderPath || null
      }
    }
    function closeLinesNewMenu() {
      linesNewMenu.value = { visible: false, x: 0, y: 0, targetFolderId: null, targetFolderPath: null }
    }

    async function openFolderInExplorer(folderPath = null) {
      closeContextMenu()
      const folder = folderPath
        ? { path: folderPath }
        : contextMenu.value.entry?.id
          ? folders.value.find((f) => f.id === contextMenu.value.entry.id)
          : contextMenu.value.entry
      if (!folder || !folder.path) return
      if (window.electronAPI && window.electronAPI.lines?.folders?.open) {
        try {
          const res = await window.electronAPI.lines.folders.open(folder.path)
          if (!res || !res.ok) {
            if (window.__lineManagerDialog)
              await window.__lineManagerDialog.alert(res?.error || t('lineManagerWindow.failedToOpenFolder'), '错误')
          }
        } catch (e) {
          console.error('打开文件夹失败:', e)
          if (window.__lineManagerDialog)
            await window.__lineManagerDialog.alert(t('lineManagerWindow.failedToOpenFolder') + '：' + (e.message || e), '错误')
        }
      }
    }

    async function handleContextMenuRename(entry) {
      closeContextMenu()
      if (entry) await renameFolder(entry.id || null, entry.name, entry.path || null)
    }
    async function handleContextMenuDelete(entry) {
      closeContextMenu()
      if (entry) await deleteFolder(entry.id || null, entry.name, entry.path || null)
    }

    function showLineContextMenu(event, line) {
      event.preventDefault()
      event.stopPropagation()
      toggleEntrySelection(line, event)
      lineContextMenu.value = { visible: true, x: event.clientX, y: event.clientY, line }
      nextTick(() => {
        const menuElement = document.querySelector('[data-line-context-menu]')
        if (!menuElement) return
        const rect = menuElement.getBoundingClientRect()
        const vp = getEffectiveViewportRect(event && event.target ? event.target : menuElement)
        const viewportWidth = (vp.right - vp.left) || window.innerWidth
        const viewportHeight = (vp.bottom - vp.top) || window.innerHeight
        let x = event.clientX
        let y = event.clientY
        if (((x - (vp.left || 0)) + rect.width) > viewportWidth) {
          x = event.clientX - rect.width
          if (x < (vp.left || 0)) x = Math.max((vp.left || 0), (vp.left || 0) + viewportWidth - rect.width - 10)
        }
        if (((y - (vp.top || 0)) + rect.height) > viewportHeight) {
          y = event.clientY - rect.height
          if (y < (vp.top || 0)) y = Math.max((vp.top || 0), (vp.top || 0) + viewportHeight - rect.height - 10)
        }
        if (x < (vp.left || 0)) x = (vp.left || 0) + 10
        lineContextMenu.value.x = x
        lineContextMenu.value.y = y
      })
    }
    function closeLineContextMenu() {
      lineContextMenu.value.visible = false
    }

    async function openLine(line) {
      closeLineContextMenu()
      if (!line) return

      // 如果处于线路管理器引导模式（双击打开），推进到下一步
      if (spotlightVisible.value && spotlightStep.value === 'line_manager_edit') {
        spotlightNextStep()
      }

      if (line.isRuntime) {
        await applyRuntimeLine(line.data)
        return
      }
      const folderPath = getLineDirectoryPath(line)
      if (window.electronAPI?.switchLine) {
        try {
          const result = await window.electronAPI.switchLine(line.name, { folderPath })
          if (result && result.ok) {
            if (window.electronAPI?.closeWindow) {
              await window.electronAPI.closeWindow()
            } else {
              window.close()
            }
          }
        } catch (e) {
          console.error('打开线路失败:', e)
          if (window.__lineManagerDialog)
            await window.__lineManagerDialog.alert(t('lineManagerWindow.failedToOpenLine') + (e.message || e), '错误')
        }
      } else {
        const lineName = line.name
        localStorage.setItem('lineManagerSelectedLine', lineName)
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage({ type: 'switch-line-request', lineName, folderPath }, '*')
        }
        window.dispatchEvent(
          new StorageEvent('storage', {
            key: 'lineManagerSelectedLine',
            newValue: lineName
          })
        )
        window.close()
      }
    }

    async function openLineFile(line) {
      closeLineContextMenu()
      if (!line || line.isRuntime) return
      const folderPath = getLineDirectoryPath(line)
      if (!folderPath) return
      try {
        const res = await window.electronAPI?.lines?.openFolder?.(folderPath)
        if (!res || !res.ok) {
          if (window.__lineManagerDialog)
            await window.__lineManagerDialog.alert(res?.error || t('lineManagerWindow.failedToOpenFolder'), '错误')
        }
      } catch (e) {
        console.error('打开线路文件所在文件夹失败:', e)
        if (window.__lineManagerDialog)
          await window.__lineManagerDialog.alert(t('lineManagerWindow.failedToOpenFolder') + '：' + (e.message || e), '错误')
      }
    }

    async function renameLine(line) {
      closeLineContextMenu()
      if (!line || !window.electronAPI?.lines || !window.__lineManagerDialog) return
      const currentName = line.name.replace(/<[^>]+>/g, '').replace(/<\/>/g, '')
      const newName = await window.__lineManagerDialog.prompt(t('lineManager.renameLinePrompt'), currentName, t('lineManager.renameLineTitle'))
      if (!newName || newName.trim() === currentName) return
      
      try {
        const folderPath = getLineDirectoryPath(line)
        const oldFileName = line.filePath || line.name
        
        // 读取原文件内容
        const readRes = await window.electronAPI.lines.read(oldFileName, folderPath)
        if (!(readRes && readRes.ok && readRes.content)) {
          await window.__lineManagerDialog.alert(t('lineManager.readLineError'), t('console.error'))
          return
        }
        
        // 检查新文件名是否已存在
        const listRes = await window.electronAPI.lines.list(folderPath)
        const existingNames = (listRes || []).map((it) => it.name.replace(/\.(json|mpl)$/i, ''))
        const newNameTrimmed = newName.trim().replace(/\.(json|mpl)$/i, '')
        if (existingNames.includes(newNameTrimmed)) {
          await window.__lineManagerDialog.alert(t('lineManager.lineNameExists'), t('console.error'))
          return
        }
        
        // 保持原文件的扩展名（.json 或 .mpl）
        const oldExt = oldFileName.toLowerCase().endsWith('.mpl') ? '.mpl' : '.json'
        const newFileName = newNameTrimmed + oldExt
        
        // 保存为新文件名
        const sep = folderPath && folderPath.includes('\\') ? '\\' : '/'
        const sourceLinePath = folderPath ? ((folderPath.endsWith(sep) ? folderPath : folderPath + sep) + oldFileName) : null
        const saveRes = await window.electronAPI.lines.save(newFileName, readRes.content, folderPath, sourceLinePath)
        if (!(saveRes && saveRes.ok)) {
          await window.__lineManagerDialog.alert(saveRes?.error || t('lineManager.saveNewFileError'), t('console.error'))
          return
        }
        
        // 删除旧文件
        const deleteRes = await window.electronAPI.lines.delete(oldFileName, folderPath)
        if (!(deleteRes && deleteRes.ok)) {
          await window.__lineManagerDialog.alert(t('lineManager.deleteOldFileWarning'), t('console.warning'))
        }
        
        // 重新加载线路列表
        await refreshExplorer()
      } catch (e) {
        console.error('重命名线路失败:', e)
        await window.__lineManagerDialog.alert(t('lineManager.renameLineError') + '：' + (e.message || e), t('console.error'))
      }
    }

    /** 同目录下生成不重复的文件夹名：名称、名称 - 副本、名称 - 副本 (2) ... */
    function getUniqueFolderName(existingNames, baseName) {
      const names = new Set((existingNames || []).map((n) => n.trim()))
      if (!names.has(baseName)) return baseName
      if (!names.has(baseName + ' - 副本')) return baseName + ' - 副本'
      let n = 2
      while (names.has(baseName + ' - 副本 (' + n + ')')) n++
      return baseName + ' - 副本 (' + n + ')'
    }

    /** 同目录下生成不重复的线路文件名：xxx、xxx - 副本、xxx - 副本 (2)（不含扩展名，与 list 返回的 name 一致） */
    function getUniqueLineFileName(existingFileNames, baseFileName) {
      // 提取基础名称和扩展名
      const base = baseFileName ? baseFileName.replace(/\.(json|mpl)$/i, '') : ''
      const ext = baseFileName && baseFileName.toLowerCase().endsWith('.mpl') ? '.mpl' : '.json'
      const toName = (b) => b.replace(/\.(json|mpl)$/i, '')
      const names = new Set((existingFileNames || []).map(toName))
      if (!names.has(base)) return base + ext
      if (!names.has(base + ' - 副本')) return base + ' - 副本' + ext
      let n = 2
      while (names.has(base + ' - 副本 (' + n + ')')) n++
      return base + ' - 副本 (' + n + ')' + ext
    }

    async function copyFolder(folder) {
      closeContextMenu()
      if (!folder || folder.id === CLOUD_FOLDER_ID) return
      clipboard.value = {
        type: 'copy',
        line: null,
        folder: { id: folder.id, name: folder.name, path: folder.path },
        sourceFolderId: folder.id,
        sourceFolderPath: folder.path,
        targetPath: folder.path
      }
    }

    async function cutFolder(folder) {
      closeContextMenu()
      if (!folder || folder.id === CLOUD_FOLDER_ID) return
      clipboard.value = {
        type: 'cut',
        line: null,
        folder: { id: folder.id, name: folder.name, path: folder.path },
        sourceFolderId: folder.id,
        sourceFolderPath: folder.path,
        targetPath: folder.path
      }
    }

    async function pasteFolder(targetDir = null) {
      closeContextMenu()
      closeSidebarNewMenu()
      if (!clipboard.value.folder || !window.electronAPI?.lines) return
      const api = window.electronAPI.lines
      const sourcePath = clipboard.value.targetPath || clipboard.value.sourceFolderPath
      const destinationDir = targetDir || getWritableExplorerPath() || resolveRootFolderByPath(sourcePath)?.path || null
      if (!sourcePath || !destinationDir) return
      try {
        const res = clipboard.value.type === 'cut'
          ? await api.fs.move(sourcePath, destinationDir)
          : await api.fs.copy(sourcePath, destinationDir)
        if (!res || !res.ok) {
          if (window.__lineManagerDialog) await window.__lineManagerDialog.alert(res?.error || t('lineManager.folderPasteFailed'), t('console.error'))
          return
        }
        clipboard.value = { type: null, line: null, folder: null, sourceFolderId: null, sourceFolderPath: null, targetPath: null }
        if (isRootExplorer.value) {
          await refreshRootExplorer()
        } else {
          await refreshExplorer()
        }
      } catch (e) {
        console.error('粘贴文件夹失败:', e)
        if (window.__lineManagerDialog) await window.__lineManagerDialog.alert(t('lineManager.folderPasteFailed') + '：' + (e.message || e), t('console.error'))
      }
    }

    async function copyLine(line) {
      closeLineContextMenu()
      const sourceFolderId = line.folderId ?? selectedFolderId.value ?? currentFolderId.value
      clipboard.value = { type: 'copy', line, folder: null, sourceFolderId, sourceFolderPath: getLineDirectoryPath(line), targetPath: line.filePath || line.name }
    }

    async function cutLine(line) {
      closeLineContextMenu()
      const sourceFolderId = line.folderId ?? selectedFolderId.value ?? currentFolderId.value
      clipboard.value = { type: 'cut', line, folder: null, sourceFolderId, sourceFolderPath: getLineDirectoryPath(line), targetPath: line.filePath || line.name }
    }

    // 新建线路（从备份 FolderLineManagerWindow 迁移逻辑）
    async function createNewLine(targetFolderPath = null, targetFolderId = null) {
      if (!window.electronAPI || !window.electronAPI.lines) return
      if (!window.__lineManagerDialog) return

      // 如果处于线路管理器引导模式，推进到下一步
      if (spotlightVisible.value && spotlightStep.value === 'line_manager_new') {
        spotlightNextStep()
      }

      const lineName = await window.__lineManagerDialog.prompt(
        '请输入新线路名称 (例如: 3号线)',
        '新线路',
        '新建线路'
      )
      if (!lineName || !lineName.trim()) return

      try {
        const wasRootExplorer = isRootExplorer.value
        const previousDirectoryPath = currentDirectoryPath.value
        const previousSelectedFolderId = selectedFolderId.value
        const resolvedTarget = await resolveCreateLineTarget(targetFolderPath, targetFolderId)
        const { folderId, folderPath } = resolvedTarget
        if (!folderPath) {
          await window.__lineManagerDialog.alert('请先选择一个文件夹', '提示')
          return
        }

        // 创建新线路默认结构
        const newLine = {
          meta: {
            lineName: lineName.trim(),
            themeColor: '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0'),
            mode: 'linear',
            dirType: 'up',
            serviceMode: 'normal',
            startIdx: -1,
            termIdx: -1,
            version: 1
          },
          stations: []
        }

        // 生成文件名（清理颜色标记和非法字符）
        const cleanName = lineName
          .trim()
          .replace(/<[^>]+>([^<]*)<\/>/g, '$1')
          .replace(/[<>:"/\\|?*]/g, '')
          .trim()
        if (!cleanName) {
          await window.__lineManagerDialog.alert('线路名称无效', '错误')
          return
        }
        const fileName = cleanName + '.mpl'

        const saveRes = await window.electronAPI.lines.save(fileName, newLine, folderPath)
        if (saveRes && saveRes.ok) {
          if (wasRootExplorer) {
            selectedFolderId.value = null
            currentDirectoryPath.value = null
            await refreshRootExplorer()
          } else if (previousDirectoryPath) {
            await loadDirectoryContents(previousDirectoryPath, previousSelectedFolderId || folderId || null)
          } else {
            await refreshExplorer()
          }
          await window.__lineManagerDialog.alert('线路已创建', '成功')
        } else {
          await window.__lineManagerDialog.alert(
            '创建线路失败：' + (saveRes && saveRes.error ? saveRes.error : '未知错误'),
            '错误'
          )
        }
      } catch (e) {
        console.error('创建线路失败:', e)
        if (window.__lineManagerDialog) {
          await window.__lineManagerDialog.alert('创建线路失败：' + (e.message || e), '错误')
        }
      }
    }

    async function deleteLine(line) {
      closeLineContextMenu()
      if (!line || !window.electronAPI?.lines || !window.__lineManagerDialog) return
      const ok = await window.__lineManagerDialog.confirm(`确定删除线路「${line.name}」吗？`, '删除线路')
      if (!ok) return
      try {
        const folderPath = getLineDirectoryPath(line)
        const res = await window.electronAPI.lines.delete(line.filePath || line.name, folderPath)
        if (res && res.ok) {
          await refreshExplorer()
        } else if (window.__lineManagerDialog) {
          await window.__lineManagerDialog.alert(res?.error || '删除失败', '错误')
        }
      } catch (e) {
        console.error('删除线路失败:', e)
        if (window.__lineManagerDialog)
          await window.__lineManagerDialog.alert('删除线路失败：' + (e.message || e), '错误')
      }
    }

    async function pasteLine(targetDir = null) {
      closeLineContextMenu()
      if (!clipboard.value.line || !window.electronAPI?.lines) return
      const targetFolderId = isRootExplorer.value ? null : (selectedFolderId.value || currentFolderId.value)
      const targetFolderPath = targetDir || getWritableExplorerPath()
      const sourceFolderId = clipboard.value.sourceFolderId
      const sourceFolderPath = clipboard.value.sourceFolderPath
      if (!targetFolderPath) return
      try {
        const sourceLine = clipboard.value.line
        let targetFileName = sourceLine.filePath || sourceLine.name
        let lineContent = null
        let sourceLinePath = null

        if (sourceLine.isRuntime) {
          const sourceName = String(sourceLine?.name || sourceLine?.data?.meta?.lineName || '').trim()
          let runtimeLineData = sourceLine?.data || null
          try {
            const full = await cloudConfig.getRuntimeLine(sourceName)
            if (full?.ok && full?.data) runtimeLineData = full.data
            else if (full?.line) runtimeLineData = full.line
          } catch (e) {
            console.warn('[LineManagerWindow] 粘贴云控线路时获取完整线路失败，回退使用当前数据:', e)
          }

          if (!(runtimeLineData && typeof runtimeLineData === 'object')) {
            if (window.__lineManagerDialog) await window.__lineManagerDialog.alert('读取源线路失败', '错误')
            return
          }

          lineContent = JSON.parse(JSON.stringify(runtimeLineData))
          const safeBaseName = (sourceName || lineContent?.meta?.lineName || t('lineManagerWindow.unnamedLine'))
            .replace(/[<>:"/\\|?*]/g, '')
            .trim() || 'line'
          targetFileName = safeBaseName + '.mpl'
        } else {
          const sourceFileName = sourceLine.filePath || sourceLine.name
          const readRes = await window.electronAPI.lines.read(sourceFileName, sourceFolderPath)
          if (!(readRes && readRes.ok && readRes.content)) {
            if (window.__lineManagerDialog) await window.__lineManagerDialog.alert('读取源线路失败', '错误')
            return
          }
          lineContent = readRes.content
          const sep = sourceFolderPath && sourceFolderPath.includes('\\') ? '\\' : '/'
          sourceLinePath = sourceFolderPath
            ? ((sourceFolderPath.endsWith(sep) ? sourceFolderPath : sourceFolderPath + sep) + sourceFileName)
            : null
        }

        if (clipboard.value.type === 'copy' && targetFolderId === sourceFolderId) {
          const listRes = await window.electronAPI.lines.list(targetFolderPath)
          const existingNames = (listRes || []).map((it) => it.name)
          targetFileName = getUniqueLineFileName(existingNames, targetFileName)
        }
        const saveRes = await window.electronAPI.lines.save(targetFileName, lineContent, targetFolderPath, sourceLinePath)
        if (!(saveRes && saveRes.ok)) {
          if (window.__lineManagerDialog)
            await window.__lineManagerDialog.alert(saveRes?.error || '写入目标失败', '错误')
          return
        }
        if (clipboard.value.type === 'cut' && !sourceLine.isRuntime) {
          const sourceFileName = sourceLine.filePath || sourceLine.name
          await window.electronAPI.lines.delete(sourceFileName, sourceFolderPath)
        }
        if (isRootExplorer.value) {
          await refreshRootExplorer()
        } else {
          await refreshExplorer()
        }
        clipboard.value = { type: null, line: null, folder: null, sourceFolderId: null, sourceFolderPath: null, targetPath: null }
      } catch (e) {
        console.error('粘贴失败:', e)
        if (window.__lineManagerDialog)
          await window.__lineManagerDialog.alert('粘贴失败：' + (e.message || e), '错误')
      }
    }

    async function closeWindow() {
      if (window.electronAPI?.closeWindow) {
        await window.electronAPI.closeWindow()
      } else {
        window.close()
      }
    }

    // 保存当前线路或压缩包（从主面板触发，线路管理器内选择目标文件夹后点击底栏保存）
    async function handleSavePendingLine() {
      const pendingStr = localStorage.getItem('pendingLineSaveData')
      if (!pendingStr) {
        if (window.__lineManagerDialog) {
          await window.__lineManagerDialog.alert('未找到待保存的线路数据', '提示')
        }
        return
      }

      try {
        const pending = JSON.parse(pendingStr)
        const availableFolders = folders.value.filter((f) => f.id !== CLOUD_FOLDER_ID && !f.isRuntime)
        const activeId = selectedFolderId.value ?? currentFolderId.value
        let folder = folders.value.find((f) => f.id === activeId && f.id !== CLOUD_FOLDER_ID && !f.isRuntime) || null
        if (!folder && availableFolders.length > 0) folder = availableFolders[0]

        if (!folder) {
          if (window.__lineManagerDialog)
            await window.__lineManagerDialog.alert('当前没有可用的文件夹，请先新建一个文件夹', '提示')
          return
        }

        const safeName = ((pending.cleanLineName || pending.lineName || t('lineManagerWindow.unnamedLine')) + '')
          .replace(/[<>:"/\\|?*]/g, '')
          .trim() || 'line'
        const fileName = safeName.toLowerCase().endsWith('.mpl') ? safeName : `${safeName}.mpl`
        const sep = folder.path && folder.path.includes('\\') ? '\\' : '/'
        const targetPath = folder.path
          ? (folder.path.endsWith(sep) ? folder.path : folder.path + sep) + fileName
          : fileName

        let saveRes = null
        if (pending.mode === 'zip') {
          if (!(window.electronAPI?.lines?.saveAsZip)) {
            if (window.__lineManagerDialog)
              await window.__lineManagerDialog.alert('当前环境不支持导出压缩包', '提示')
            return
          }
          let audioDir = pending.audioSourceDir || null
          if (!audioDir && pending.currentFilePath) {
            const idx = Math.max(pending.currentFilePath.lastIndexOf('/'), pending.currentFilePath.lastIndexOf('\\'))
            if (idx >= 0) audioDir = pending.currentFilePath.substring(0, idx)
          }
          if (!audioDir) audioDir = folder.path
          saveRes = await window.electronAPI.lines.saveAsZip(
            pending.lineData,
            pending.currentFilePath || null,
            targetPath,
            audioDir
          )
        } else {
          if (!(window.electronAPI?.lines?.save)) {
            if (window.__lineManagerDialog)
              await window.__lineManagerDialog.alert('当前环境不支持保存线路', '提示')
            return
          }
          saveRes = await window.electronAPI.lines.save(fileName, pending.lineData, folder.path, pending.currentFilePath || null)
        }

        if (saveRes && saveRes.ok) {
          isSavingLine.value = false
          pendingLineSaveData.value = null
          try {
            localStorage.removeItem('pendingLineSaveData')
            localStorage.removeItem('lineManagerSaveMode')
          } catch (e) {}

          localStorage.setItem(
            'lineManagerSaveResult',
            JSON.stringify({
              success: true,
              mode: pending.mode,
              folderId: folder.id,
              folderName: folder.name,
              folderPath: folder.path,
              filePath: saveRes.path || targetPath,
              requestId: pending.requestId || null
            })
          )

          await loadLinesFromFolder(folder.id)
          if (window.electronAPI?.closeWindow) {
            await new Promise((resolve) => setTimeout(resolve, 120))
            await window.electronAPI.closeWindow()
          }
        } else {
          const err = (saveRes && saveRes.error) || 'unknown'
          isSavingLine.value = false
          pendingLineSaveData.value = null
          try {
            localStorage.removeItem('pendingLineSaveData')
            localStorage.removeItem('lineManagerSaveMode')
          } catch (e) {}
          try {
            localStorage.setItem(
              'lineManagerSaveResult',
              JSON.stringify({ success: false, error: err, mode: pending.mode, requestId: pending.requestId || null })
            )
          } catch (e) {}
          if (window.__lineManagerDialog) await window.__lineManagerDialog.alert('保存失败：' + err, '错误')
          if (window.electronAPI?.closeWindow) await window.electronAPI.closeWindow()
        }
      } catch (e) {
        console.error('[线路管理器] handleSavePendingLine 失败:', e)
        isSavingLine.value = false
        pendingLineSaveData.value = null
        try {
          localStorage.removeItem('pendingLineSaveData')
          localStorage.removeItem('lineManagerSaveMode')
        } catch (e3) {}
        try {
          localStorage.setItem(
            'lineManagerSaveResult',
            JSON.stringify({ success: false, error: e.message || e, requestId: null })
          )
        } catch (e2) {}
        if (window.__lineManagerDialog) await window.__lineManagerDialog.alert('保存失败：' + (e.message || e), '错误')
        if (window.electronAPI?.closeWindow) await window.electronAPI.closeWindow()
      }
    }

    // 保存贯通线路：保存到当前选中的文件夹，不使用弹窗选择
    async function handleSaveThroughLine() {
      const pendingDataStr = localStorage.getItem('pendingThroughLineData')
      if (!pendingDataStr) {
        if (window.__lineManagerDialog)
          await window.__lineManagerDialog.alert('未找到待保存的贯通线路数据', '提示')
        return
      }
      try {
        const pendingData = JSON.parse(pendingDataStr)
        const { lineData, lineName, cleanLineName } = pendingData
        const availableFolders = folders.value.filter(
          (f) => f.id !== CLOUD_FOLDER_ID && !f.isRuntime
        )
        const activeId = selectedFolderId.value ?? currentFolderId.value
        let folder = folders.value.find((f) => f.id === activeId)
        if (!folder || folder.id === CLOUD_FOLDER_ID || folder.isRuntime)
          folder = availableFolders[0]
        if (!folder) {
          if (window.__lineManagerDialog)
            await window.__lineManagerDialog.alert('当前没有可用的文件夹，请先新建一个文件夹', '提示')
          return
        }
        await doSaveThroughLine(lineData, cleanLineName, folder, pendingData.sourceLinePaths || null)
      } catch (e) {
        console.error('[线路管理器] handleSaveThroughLine 失败:', e)
        if (window.__lineManagerDialog)
          await window.__lineManagerDialog.alert('保存失败：' + (e.message || e), '错误')
      }
    }

    function cancelPendingLineSaveOnClose() {
      const pendingStr = localStorage.getItem('pendingLineSaveData')
      const mode = localStorage.getItem('lineManagerSaveMode')
      if (!pendingStr || !mode) return

      let pending = null
      try {
        pending = JSON.parse(pendingStr)
      } catch (e) {}

      isSavingLine.value = false
      pendingLineSaveData.value = null
      try {
        localStorage.removeItem('pendingLineSaveData')
        localStorage.removeItem('lineManagerSaveMode')
      } catch (e) {}

      try {
        localStorage.setItem(
          'lineManagerSaveResult',
          JSON.stringify({
            success: false,
            cancelled: true,
            error: 'window-closed',
            mode: pending?.mode || mode,
            requestId: pending?.requestId || null
          })
        )
      } catch (e) {}
    }

    function handleWindowBeforeUnload() {
      cancelPendingLineSaveOnClose()
    }

    function applyWindowAppearanceFromSettings() {
      try {
        if (typeof document === 'undefined') return
        const root = document.documentElement
        let blurEnabled = true
        let themeMode = 'system'
        const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('pids_settings_v1') : null
        if (raw) {
          const settings = JSON.parse(raw)
          if (settings) {
            blurEnabled = settings.blurEnabled !== false
            themeMode = String(settings.themeMode || 'system')
          }
        }
        const systemDark = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
          ? window.matchMedia('(prefers-color-scheme: dark)').matches
          : false
        const isDark = themeMode === 'dark' || (themeMode === 'system' && systemDark)
        root.classList.toggle('blur-disabled', !blurEnabled)
        root.classList.toggle('dark', isDark)
        root.setAttribute('data-theme', isDark ? 'dark' : 'light')
      } catch (e) {
        console.warn('[LineManagerWindow] applyWindowAppearanceFromSettings failed:', e)
      }
    }

    function handleSettingsStorageChange(event) {
      if (!event || event.key === 'pids_settings_v1') {
        applyWindowAppearanceFromSettings()
      }
    }

    onMounted(async () => {
      applyWindowAppearanceFromSettings()
      window.addEventListener('storage', handleSettingsStorageChange)
      window.addEventListener('beforeunload', handleWindowBeforeUnload)
      window.addEventListener('pointerdown', handleGlobalPointerDown, true)
      await loadFolders()
      await nextTick()
      await checkSaveThroughLineMode()
      await checkPendingLineSaveMode()
    })

    onBeforeUnmount(() => {
      window.removeEventListener('storage', handleSettingsStorageChange)
      window.removeEventListener('beforeunload', handleWindowBeforeUnload)
      window.removeEventListener('pointerdown', handleGlobalPointerDown, true)
      if (isSavingThroughLine.value) {
        try {
          localStorage.removeItem('pendingThroughLineData')
          localStorage.removeItem('throughOperationSelectorTarget')
        } catch (e) {}
      }
      cancelPendingLineSaveOnClose()
    })

    const activeFolderId = computed(() => selectedFolderId.value || currentFolderId.value)
    const activeRootFolder = computed(() => resolveFolderById(selectedFolderId.value || currentFolderId.value))
    const isCloudFolderActive = computed(() => selectedFolderId.value === CLOUD_FOLDER_ID)
    const isRootExplorer = computed(() => !selectedFolderId.value)
    const currentFolderLabel = computed(() => {
      if (isRootExplorer.value) return t('lineManager.folderAndLines')
      if (selectedFolderId.value === CLOUD_FOLDER_ID) return t('lineManagerWindow.cloudLinesFolder')
      return activeRootFolder.value?.name || ''
    })
    const currentPathLabel = computed(() => {
      if (isRootExplorer.value) return ''
      if (selectedFolderId.value === CLOUD_FOLDER_ID) return ''
      return currentDirectoryPath.value || activeRootFolder.value?.path || ''
    })

    const isSearchActive = computed(() => (searchQuery.value || '').trim().length > 0)
    const searchSortOptions = computed(() => [
      { value: 'relevance', label: t('lineManager.searchSortRelevance') },
      { value: 'updated-desc', label: t('lineManager.sortUpdatedDesc') },
      { value: 'name-asc', label: t('lineManager.sortNameAsc') }
    ])
    const currentSearchSortLabel = computed(() => {
      return searchSortOptions.value.find((item) => item.value === searchSortMode.value)?.label || ''
    })

    function closeSearchSortDropdown() {
      searchSortDropdownOpen.value = false
    }

    function toggleSearchSortDropdown() {
      searchSortDropdownOpen.value = !searchSortDropdownOpen.value
    }

    function selectSearchSortMode(mode) {
      searchSortMode.value = mode
      closeSearchSortDropdown()
    }

    function getSearchSortItemBackground(mode) {
      return searchSortMode.value === mode ? 'rgba(64, 156, 255, 0.16)' : 'transparent'
    }

    function setSearchSortItemHover(event, mode) {
      if (!event?.currentTarget) return
      event.currentTarget.style.background =
        searchSortMode.value === mode ? 'rgba(64, 156, 255, 0.16)' : 'rgba(15, 23, 42, 0.06)'
    }

    function clearSearchSortItemHover(event, mode) {
      if (!event?.currentTarget) return
      event.currentTarget.style.background = getSearchSortItemBackground(mode)
    }

    function handleGlobalPointerDown(event) {
      if (!searchSortDropdownOpen.value) return
      const root = searchSortDropdownRef.value
      if (root && !root.contains(event.target)) {
        closeSearchSortDropdown()
      }
    }

    function clearSearchView() {
      searchQuery.value = ''
      closeSearchSortDropdown()
    }

    const bottomBarActionLabel = computed(() => {
      if (isSavingThroughLine.value) return t('lineManager.throughSaveButton')
      if (isSavingLine.value) {
        return (pendingLineSaveData.value && pendingLineSaveData.value.mode === 'zip')
          ? t('lineManager.saveZipButton')
          : t('lineManager.saveLineButton')
      }
      return ''
    })

    // 搜索过滤后的线路列表：无关键词时显示当前文件夹；有关键词时搜索所有文件夹
    const filteredLines = computed(() => {
      const q = (searchQuery.value || '').trim().toLowerCase()
      if (!q) return currentLines.value
      const matched = allLinesWithFolder.value
        .map((line) => {
          const rawName = stripColorMarkup(line.name || '')
          const name = rawName.toLowerCase()
          const first = (line.firstStation || '').toLowerCase()
          const last = (line.lastStation || '').toLowerCase()
          const folderName = (line.folderName || '').toLowerCase()
          const stationText = `${first} ${last}`.trim()
          const matched =
            name.includes(q) ||
            first.includes(q) ||
            last.includes(q) ||
            folderName.includes(q)
          if (!matched) return null
          let score = 0
          if (name === q) score += 200
          else if (name.startsWith(q)) score += 120
          else if (name.includes(q)) score += 80
          if (stationText.includes(q)) score += 30
          if (folderName.includes(q)) score += 10
          return { line, score }
        })
        .filter(Boolean)
      if (searchSortMode.value === 'updated-desc') {
        return matched
          .sort((a, b) => {
            const diff = Number(b.line?.mtimeMs || 0) - Number(a.line?.mtimeMs || 0)
            if (diff !== 0) return diff
            return String(a.line?.name || '').localeCompare(String(b.line?.name || ''), 'zh-CN', { sensitivity: 'base', numeric: true })
          })
          .map((item) => item.line)
      }
      if (searchSortMode.value === 'name-asc') {
        return matched
          .sort((a, b) => String(a.line?.name || '').localeCompare(String(b.line?.name || ''), 'zh-CN', { sensitivity: 'base', numeric: true }))
          .map((item) => item.line)
      }
      return matched
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score
          const diff = Number(b.line?.mtimeMs || 0) - Number(a.line?.mtimeMs || 0)
          if (diff !== 0) return diff
          return String(a.line?.name || '').localeCompare(String(b.line?.name || ''), 'zh-CN', { sensitivity: 'base', numeric: true })
        })
        .map((item) => item.line)
    })

    const rootExplorerEntries = computed(() => {
      const items = [...rootExplorerItems.value]
      const sorted = [...items]
      if (folderSortMode.value === 'name-asc') {
        sorted.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN', { sensitivity: 'base', numeric: true }))
      } else {
        sorted.sort((a, b) => {
          if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
          const aTime = a.mtime ? new Date(a.mtime).getTime() : 0
          const bTime = b.mtime ? new Date(b.mtime).getTime() : 0
          if (aTime !== bTime) return bTime - aTime
          return String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN', { sensitivity: 'base', numeric: true })
        })
      }
      return sorted
    })
    const explorerEntries = computed(() => {
      if (isSearchActive.value) return filteredLines.value
      if (isRootExplorer.value) return rootExplorerEntries.value
      return [...currentDirectoryFolders.value, ...currentLines.value]
    })

    const currentDirectoryLineEntries = computed(() => {
      const lines = [...currentLines.value]
      if (folderSortMode.value === 'name-asc') {
        lines.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN', { sensitivity: 'base', numeric: true }))
      } else {
        lines.sort((a, b) => {
          const diff = Number(b.mtimeMs || 0) - Number(a.mtimeMs || 0)
          if (diff !== 0) return diff
          return String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN', { sensitivity: 'base', numeric: true })
        })
      }
      return lines
    })

    const currentDirectoryEntries = computed(() => {
      const foldersList = [...currentDirectoryFolders.value].sort((a, b) => {
        if (folderSortMode.value === 'name-asc') {
          return String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN', { sensitivity: 'base', numeric: true })
        }
        const diff = Number(b.mtimeMs || 0) - Number(a.mtimeMs || 0)
        if (diff !== 0) return diff
        return String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN', { sensitivity: 'base', numeric: true })
      })
      return [...foldersList, ...currentDirectoryLineEntries.value]
    })

    const selectableEntries = computed(() => {
      if (isSearchActive.value) return explorerEntries.value.filter((entry) => entry.type === 'line')
      if (isRootExplorer.value) return explorerEntries.value
      return currentDirectoryEntries.value
    })

    function syncSingleLineSelection() {
      const selectedLines = selectedEntries.value.filter((entry) => entry.type === 'line')
      selectedLine.value = selectedLines.length === 1 ? selectedLines[0] : null
    }

    function toggleEntrySelection(entry, event = null, visibleEntries = selectableEntries.value) {
      if (!entry || isSavingThroughLine.value) return
      const key = getEntryKey(entry)
      const ctrlLike = !!(event && (event.ctrlKey || event.metaKey))
      const shiftLike = !!(event && event.shiftKey)
      const currentKeys = selectedEntries.value.map((item) => getEntryKey(item))

      if (shiftLike && selectionAnchorKey.value) {
        const anchorIndex = visibleEntries.findIndex((item) => getEntryKey(item) === selectionAnchorKey.value)
        const currentIndex = visibleEntries.findIndex((item) => getEntryKey(item) === key)
        if (anchorIndex >= 0 && currentIndex >= 0) {
          const [start, end] = anchorIndex < currentIndex ? [anchorIndex, currentIndex] : [currentIndex, anchorIndex]
          selectedEntries.value = visibleEntries.slice(start, end + 1)
          syncSingleLineSelection()
          return
        }
      }

      if (ctrlLike) {
        if (currentKeys.includes(key)) {
          selectedEntries.value = selectedEntries.value.filter((item) => getEntryKey(item) !== key)
        } else {
          selectedEntries.value = [...selectedEntries.value, entry]
        }
        selectionAnchorKey.value = key
        syncSingleLineSelection()
        return
      }

      selectedEntries.value = [entry]
      selectionAnchorKey.value = key
      syncSingleLineSelection()
    }

    async function locateToFolder(line) {
      if (!line.folderId) return
      if (line.folderId === CLOUD_FOLDER_ID) {
        await selectFolder(CLOUD_FOLDER_ID)
      } else if (line.folderPath) {
        await loadDirectoryContents(line.folderPath, line.folderId)
      } else {
        await selectFolder(line.folderId)
      }
      searchQuery.value = ''
      await nextTick()
      const match = currentLines.value.find((l) => {
        if (line.isRuntime) {
          return l.isRuntime && l.name === line.name && l.firstStation === line.firstStation && l.lastStation === line.lastStation
        }
        return l.filePath === line.filePath && l.name === line.name
      })
      if (match) selectedLine.value = match
      if (match) {
        selectedEntries.value = [match]
        selectionAnchorKey.value = getEntryKey(match)
      }
      await nextTick()
      // 延迟执行滚动，确保 DOM 已更新（搜索清除后列表会重新渲染）
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const linesContainer = linesRef.value
          if (linesContainer) {
            const selectedLineEl = linesContainer.querySelector('.lmw-line.selected')
            if (selectedLineEl) {
              const containerRect = linesContainer.getBoundingClientRect()
              const lineRect = selectedLineEl.getBoundingClientRect()
              const scrollTop = linesContainer.scrollTop + (lineRect.top - containerRect.top) - containerRect.height / 2 + lineRect.height / 2
              linesContainer.scrollTo({ top: Math.max(0, scrollTop), behavior: 'smooth' })
            }
          }
        })
      })
    }

    let searchDebounceTimer = null
    watch(searchQuery, (val) => {
      const q = (val || '').trim()
      if (!q) return
      clearTimeout(searchDebounceTimer)
      searchDebounceTimer = setTimeout(() => {
        loadAllLinesWithFolders()
      }, 200)
    })

    return {
      parseColorMarkup,
      t,
      hasFoldersAPI,
      folders,
      linesRef,
      currentFolderId,
      currentLines,
      currentDirectoryPath,
      currentDirectoryFolders,
      folderSortMode,
      filteredLines,
      explorerEntries,
      currentDirectoryLineEntries,
      currentDirectoryEntries,
      searchSortOptions,
      currentSearchSortLabel,
      formatExplorerDate,
      formatExplorerMonth,
      formatExplorerFileSize,
      getFolderEntryHint,
      getFolderEntryMeta,
      getFolderEntryUpdateLabel,
      getLineEntrySourceLabel,
      searchQuery,
      searchSortMode,
      searchSortDropdownOpen,
      searchSortDropdownRef,
      isSearchActive,
      searchLoading,
      loading,
      selectedFolderId,
      selectedLine,
      selectedEntries,
      activeFolderId,
      activeRootFolder,
      currentFolderLabel,
      currentPathLabel,
      isRootExplorer,
      contextMenu,
      lineContextMenu,
      sidebarNewMenu,
      linesNewMenu,
      clipboard,
      isSavingThroughLine,
      pendingThroughLineInfo,
      isSavingLine,
      pendingLineSaveData,
      refreshExplorer,
      runtimeLoading,
      selectFolder,
      enterFolderEntry,
      goToRootExplorer,
      navigateUp,
      locateToFolder,
      clearSearchView,
      closeSearchSortDropdown,
      toggleSearchSortDropdown,
      selectSearchSortMode,
      getSearchSortItemBackground,
      setSearchSortItemHover,
      clearSearchSortItemHover,
      isEntrySelected,
      toggleEntrySelection,
      toggleLineSelection,
      applySelectedLine,
      addFolder,
      deleteFolder,
      renameFolder,
      showContextMenu,
      closeContextMenu,
      showSidebarNewMenu,
      closeSidebarNewMenu,
      showLinesNewMenu,
      closeLinesNewMenu,
      showLineContextMenu,
      closeLineContextMenu,
      openLine,
      openLineFile,
      renameLine,
      copyLine,
      cutLine,
      pasteLine,
      createNewLine,
      closeWindow,
      handleSaveThroughLine,
      handleSavePendingLine,
      buildLineColor,
      bottomBarActionLabel,

      // spotlight guide
      spotlightStep,
      spotlightVisible,
      spotlightStepConfig,
      startLineManagerGuide,
      spotlightNextStep,
      spotlightPrevStep,
      spotlightCloseGuide,

      folderMenuItems: computed(() => {
        const entry = contextMenu.value.entry
        const isCloud = entry?.id === CLOUD_FOLDER_ID
        const isRootFolder = !!entry?.isRootFolder
        const canDelete = !!entry && !isCloud
        const canCopyFolder = !!entry && !isCloud
        const canPasteFolder = !!clipboard.value.folder && !!getActiveDirectoryPath()
        const canCreateLine = !!entry?.path && !isCloud
        return [
          { label: t('lineManager.ctxRefresh'), icon: 'fas fa-sync-alt', action: 'refresh', disabled: false },
          { type: 'sep' },
          { label: t('lineManager.ctxNewFolder'), icon: 'fas fa-folder-plus', action: 'addFolder', disabled: isCloud },
          { label: t('lineManager.ctxNewLine'), icon: 'fas fa-plus', action: 'createNewLine', disabled: !canCreateLine },
          { type: 'sep' },
          { label: t('lineManager.ctxCopy'), icon: 'fas fa-copy', action: 'copyFolder', disabled: !canCopyFolder },
          { label: t('lineManager.ctxCut'), icon: 'fas fa-cut', action: 'cutFolder', disabled: !canCopyFolder },
          { label: t('lineManager.ctxPaste'), icon: 'fas fa-paste', action: 'pasteFolder', disabled: !canPasteFolder },
          { type: 'sep' },
          {
            label: t('lineManager.ctxRename'),
            icon: 'fas fa-edit',
            action: 'renameFolder',
            disabled: !entry || isCloud
          },
          {
            label: t('lineManager.ctxOpenFolder'),
            icon: 'fas fa-folder-open',
            action: 'openFolder',
            disabled: !entry || isCloud
          },
          ...(canDelete && !isCloud
            ? [{ type: 'sep' }, { label: t('lineManager.ctxDelete'), icon: 'fas fa-trash', action: 'deleteFolder', danger: true }]
            : [])
        ]
      }),
      sidebarNewMenuItems: computed(() => {
        const canPaste = clipboard.value.folder || clipboard.value.type
        return [
          { label: t('lineManager.ctxRefresh'), icon: 'fas fa-sync-alt', action: 'refresh', disabled: false },
          { type: 'sep' },
          { label: t('lineManager.ctxNewFolder'), icon: 'fas fa-folder-plus', action: 'addFolder', disabled: false },
          ...(canPaste ? [{ type: 'sep' }, { label: t('lineManager.ctxPaste'), icon: 'fas fa-paste', action: 'paste', disabled: false }] : [])
        ]
      }),
      linesNewMenuItems: computed(() => {
        const canPaste = clipboard.value.type || clipboard.value.folder
        const createLineTargetPath =
          linesNewMenu.value.targetFolderPath ||
          getCreateLineTarget().folderPath
        const hasWritableDirectory = !!getActiveDirectoryPath()
        const canCreateLine = !!createLineTargetPath
        const canCreateFolder = isRootExplorer.value || hasWritableDirectory
        const pasteDisabled = isCloudFolderActive.value || !canPaste || (!hasWritableDirectory && !isRootExplorer.value)
        return [
          { label: t('lineManager.ctxRefresh'), icon: 'fas fa-sync-alt', action: 'refresh', disabled: false },
          { type: 'sep' },
          {
            label: t('lineManager.ctxNewFolder'),
            icon: 'fas fa-folder-plus',
            action: 'addFolder',
            disabled: isCloudFolderActive.value || !canCreateFolder
          },
          {
            label: t('lineManager.ctxNewLine'),
            icon: 'fas fa-plus',
            action: 'createNewLine',
            disabled: isCloudFolderActive.value || !canCreateLine
          },
          { label: t('lineManager.ctxOpenFolder'), icon: 'fas fa-folder-open', action: 'openFolder', disabled: !createLineTargetPath },
          ...(canPaste ? [{ type: 'sep' }, { label: t('lineManager.ctxPaste'), icon: 'fas fa-paste', action: 'paste', disabled: pasteDisabled }] : [])
        ]
      }),
      lineMenuItems: computed(() => {
        const selectedLine = lineContextMenu.value.line
        const isRuntimeLine = !!selectedLine?.isRuntime
        const hasWritableDirectory = !!getActiveDirectoryPath()
        return [
          { label: t('lineManager.ctxRefresh'), icon: 'fas fa-sync-alt', action: 'refresh', disabled: false },
          { type: 'sep' },
          {
            label: t('lineManager.ctxNewFolder'),
            icon: 'fas fa-folder-plus',
            action: 'addFolder',
            disabled: isCloudFolderActive.value || !hasWritableDirectory
          },
          {
            label: t('lineManager.ctxNewLine'),
            icon: 'fas fa-plus',
            action: 'createNewLine',
            disabled: isCloudFolderActive.value || !hasWritableDirectory
          },
          { type: 'sep' },
          { label: t('lineManager.ctxOpen'), icon: 'fas fa-folder-open', action: 'openLine' },
          {
            label: t('lineManager.ctxOpenFile'),
            icon: 'fas fa-file-alt',
            action: 'openFile',
            disabled: isCloudFolderActive.value || isRuntimeLine
          },
          {
            label: t('lineManager.ctxRename'),
            icon: 'fas fa-edit',
            action: 'renameLine',
            disabled: isCloudFolderActive.value
          },
          { type: 'sep' },
          {
            label: t('lineManager.ctxCopy'),
            icon: 'fas fa-copy',
            action: 'copyLine',
            disabled: false
          },
          {
            label: t('lineManager.ctxCut'),
            icon: 'fas fa-cut',
            action: 'cutLine',
            disabled: isCloudFolderActive.value
          },
          {
            label: t('lineManager.ctxPaste'),
            icon: 'fas fa-paste',
            action: 'pasteLine',
            disabled: isCloudFolderActive.value || !clipboard.value.type
          },
          { type: 'sep' },
          {
            label: t('lineManager.ctxDelete'),
            icon: 'fas fa-trash',
            action: 'deleteLine',
            danger: true,
            disabled: isCloudFolderActive.value
          }
        ]
      }),
      async onFolderMenuSelect(it) {
        if (!it) return
        if (it.action === 'refresh') return await refreshExplorer()
        const entry = contextMenu.value.entry
        const isCloud = entry?.id === CLOUD_FOLDER_ID
        if (isCloud && ['createNewLine', 'renameFolder', 'deleteFolder'].includes(it.action)) {
          await dialogService.alert(t('lineManagerWindow.cloudApplyOnlyNotice'), t('console.info'))
          return
        }
        if (it.action === 'addFolder') return await addFolder(entry?.path || getActiveDirectoryPath())
        if (it.action === 'createNewLine') {
          if (entry) {
            selectedEntries.value = [entry]
            selectionAnchorKey.value = getEntryKey(entry)
          }
          if (isRootExplorer.value) {
            return await createNewLine()
          }
          return await createNewLine(entry?.path || null, entry?.id || null)
        }
        if (it.action === 'copyFolder') {
          if (entry) return await copyFolder(entry)
          return
        }
        if (it.action === 'cutFolder') {
          if (entry) return await cutFolder(entry)
          return
        }
        if (it.action === 'pasteFolder') return await pasteFolder(entry?.path || getActiveDirectoryPath())
        if (it.action === 'createNewLine') return await createNewLine()
        if (it.action === 'renameFolder') return await handleContextMenuRename(entry)
        if (it.action === 'openFolder') return await openFolderInExplorer(entry?.path || null)
        if (it.action === 'deleteFolder') return await handleContextMenuDelete(entry)
      },
      async onSidebarNewMenuSelect(it) {
        if (!it) return
        if (it.action === 'refresh') return await refreshExplorer()
        if (it.action === 'addFolder') return await addFolder(getWritableExplorerPath())
        if (it.action === 'paste') {
          if (clipboard.value.folder) return await pasteFolder()
          if (clipboard.value.line) return await pasteLine()
        }
      },
      async onLinesNewMenuSelect(it) {
        if (!it) return
        if (it.action === 'refresh') return await refreshExplorer()

        const targetFolderId = selectedFolderId.value || currentFolderId.value
        const isCloudTarget = targetFolderId === CLOUD_FOLDER_ID
        const createLineTargetPath = linesNewMenu.value.targetFolderPath || getCreateLineTarget().folderPath
        const createLineTargetId = linesNewMenu.value.targetFolderId || getCreateLineTarget().folderId

        if (isCloudTarget && ['addFolder', 'createNewLine', 'paste'].includes(it.action)) {
          await dialogService.alert(t('lineManagerWindow.cloudApplyOnlyNotice'), t('console.info'))
          return
        }

        if (!isRootExplorer.value && targetFolderId) selectedFolderId.value = targetFolderId

        if (it.action === 'addFolder') return await addFolder(getWritableExplorerPath())
        if (it.action === 'createNewLine') return await createNewLine(createLineTargetPath, createLineTargetId)
        if (it.action === 'openFolder') {
          const targetPath = getActiveDirectoryPath() || createLineTargetPath
          if (targetPath) return await window.electronAPI?.lines?.openFolder?.(targetPath)
          return
        }
        if (it.action === 'paste') {
          if (!getWritableExplorerPath()) return
          if (clipboard.value.folder) return await pasteFolder()
          if (clipboard.value.line) return await pasteLine()
        }
      },
      async onLineMenuSelect(it) {
        if (!it) return
        const line = lineContextMenu.value.line
        if (it.action === 'refresh') return await refreshExplorer()
        // 云控线路：允许“打开”“复制”，其它编辑操作禁用
        if (isCloudFolderActive.value && !['openLine', 'copyLine'].includes(it.action)) {
          await dialogService.alert(t('lineManagerWindow.cloudApplyCopyOnlyNotice'), t('console.info'))
          return
        }
        if (it.action === 'addFolder') return await addFolder(getWritableExplorerPath())
        if (it.action === 'openFolder') {
          const targetPath = getActiveDirectoryPath()
          if (targetPath) return await window.electronAPI?.lines?.openFolder?.(targetPath)
          return
        }
        if (it.action === 'createNewLine') return await createNewLine()
        if (it.action === 'openLine') return await openLine(line)
        if (it.action === 'openFile') return await openLineFile(line)
        if (it.action === 'renameLine') return await renameLine(line)
        if (it.action === 'copyLine') return await copyLine(line)
        if (it.action === 'cutLine') return await cutLine(line)
        if (it.action === 'pasteLine') return await pasteLine()
        if (it.action === 'deleteLine') return await deleteLine(line)
      }
    }
  }
}
</script>

<template>
  <div class="lmw-root">
    <LineManagerTopbar>
      <div v-if="folders?.length > 0" class="lmw-titlebar-search" style="display:flex; align-items:center; gap:10px;">
        <div class="lmw-search-inner" style="flex:1;">
          <i class="fas fa-search lmw-search-icon"></i>
          <input
            v-model="searchQuery"
            type="text"
            class="lmw-search-input"
            :placeholder="t('lineManager.searchPlaceholder')"
          />
          <button
            v-if="searchQuery"
            type="button"
            class="lmw-search-clear"
            @click="searchQuery = ''"
            :aria-label="t('lineManager.clear')"
          >
            <i class="fas fa-times"></i>
          </button>
        </div>
      </div>
    </LineManagerTopbar>

    <div v-if="isSavingThroughLine && pendingThroughLineInfo" class="lmw-through-banner">
      <div class="lmw-through-banner-icon">
        <i class="fas fa-exchange-alt"></i>
      </div>
      <div class="lmw-through-banner-main">
        <div class="lmw-through-banner-title">{{ t('lineManager.throughSavingBannerTitle') }}</div>
        <div class="lmw-through-banner-sub">
          <strong>{{ t('lineManager.throughSavingLineName', { lineName: pendingThroughLineInfo.lineName }) }}</strong>
          <span v-if="pendingThroughLineInfo.segmentCount > 0" class="lmw-through-banner-seg">
            {{ t('lineManager.throughSavingSegmentCount', { count: pendingThroughLineInfo.segmentCount }) }}
          </span>
        </div>
        <div class="lmw-through-banner-tip">
          <i class="fas fa-info-circle"></i>
          <span>{{ t('lineManager.throughSavingHint') }}</span>
        </div>
      </div>
    </div>

    <div class="lmw-main">
      <div class="lmw-main-body">
        <section class="lmw-content">
          <div
            data-onboard-id="tour-lm-lines-area"
            ref="linesRef"
            class="lmw-lines"
            :class="{ 'lmw-lines--media-view': !isRootExplorer && !isSearchActive }"
            @contextmenu.prevent="showLinesNewMenu($event)"
          >
            <div v-if="isRootExplorer && !isSearchActive" class="lmw-library-shell">
              <div class="lmw-media-header">
                <div class="lmw-media-header-main">
                  <div class="lmw-media-title">{{ t('lineManager.title') }}</div>
                </div>
              </div>
              <div class="lmw-library-toolbar">
                <div class="lmw-library-toolbar-label">{{ t('lineManager.folderList') }}</div>
                <label class="lmw-folder-sort">
                  <select v-model="folderSortMode" class="lmw-folder-sort-select lmw-folder-sort-select--library">
                    <option value="updated-desc">{{ t('lineManager.sortUpdatedDesc') }}</option>
                    <option value="name-asc">{{ t('lineManager.sortNameAsc') }}</option>
                  </select>
                </label>
              </div>
              <div v-if="loading || runtimeLoading || (isSearchActive && searchLoading)" class="lmw-loading">...</div>
              <div v-else-if="explorerEntries.length === 0" class="lmw-empty">
                {{ activeFolderId === 'runtime-cloud' ? t('lineManager.emptyCloudLines') : t('lineManager.emptyFolder') }}
              </div>
              <div v-else class="lmw-library-list">
                <button
                  v-for="(entry, idx) in explorerEntries"
                  :key="'root-entry-' + (entry.id || entry.path || entry.filePath || entry.name) + '-' + idx"
                  :class="entry.type === 'folder'
                    ? ['lmw-library-row', { selected: isEntrySelected(entry) }]
                    : ['lmw-line', 'lmw-line--inside-folder', { selected: isEntrySelected(entry) }]"
                  @click="entry.type === 'folder' ? toggleEntrySelection(entry, $event, explorerEntries) : toggleLineSelection(entry, $event)"
                  @dblclick="entry.type === 'folder' ? enterFolderEntry(entry) : openLine(entry)"
                  @contextmenu.prevent.stop="entry.type === 'folder' ? showContextMenu($event, entry) : showLineContextMenu($event, entry)"
                >
                  <template v-if="entry.type === 'folder'">
                    <div class="lmw-library-main">
                      <div class="lmw-library-folder-icon" aria-hidden="true">
                        <span class="lmw-library-folder-tab"></span>
                        <span class="lmw-library-folder-body"></span>
                      </div>
                      <div class="lmw-library-copy">
                        <div class="lmw-library-name">{{ entry.name }}</div>
                        <div class="lmw-library-subtitle">{{ getFolderEntryHint(entry) }}</div>
                      </div>
                    </div>
                    <div class="lmw-library-meta">
                      <div class="lmw-library-date">{{ formatExplorerDate(entry.mtime) }}</div>
                      <div class="lmw-library-updated">{{ getFolderEntryUpdateLabel(entry) }}</div>
                    </div>
                  </template>
                  <template v-else>
                    <div class="lmw-line-main">
                      <div class="lmw-line-title" v-html="parseColorMarkup(entry.name)"></div>
                      <div class="lmw-line-meta">
                        <span v-if="entry.isThroughLine" class="lmw-tag through">{{ t('folderLineManager.through') }}</span>
                        <span v-else-if="entry.isLoopLine" class="lmw-tag loop">{{ t('folderLineManager.loop') }}</span>
                        <span v-else class="lmw-tag single">{{ t('folderLineManager.single') }}</span>
                        <span class="lmw-stations">
                          {{ entry.firstStation }} -> {{ entry.lastStation }}
                        </span>
                        <span class="lmw-line-folder">
                          <i class="far fa-clock"></i> {{ formatExplorerDate(entry.mtime) || '--' }}
                        </span>
                        <span v-if="formatExplorerFileSize(entry.size)" class="lmw-line-folder">
                          <i class="fas fa-file"></i> {{ formatExplorerFileSize(entry.size) }}
                        </span>
                      </div>
                    </div>
                    <div class="lmw-line-color" :style="{ background: entry.themeColor || '#58a4ed' }"></div>
                  </template>
                </button>
              </div>
            </div>
            <div v-else-if="!isRootExplorer && !isSearchActive" class="lmw-media-shell">
              <div class="lmw-media-header">
                <div class="lmw-media-header-main">
                  <button type="button" class="lmw-media-back" @click="navigateUp">
                    <i class="fas fa-chevron-left"></i>
                  </button>
                  <div class="lmw-media-title">{{ currentFolderLabel }}</div>
                </div>
              </div>
              <div class="lmw-media-toolbar">
                <div class="lmw-media-group-label">{{ formatExplorerMonth(currentDirectoryEntries[0]?.mtime) || currentFolderLabel }}</div>
                <label class="lmw-folder-sort">
                  <select v-model="folderSortMode" class="lmw-folder-sort-select lmw-folder-sort-select--library">
                    <option value="updated-desc">{{ t('lineManager.sortUpdatedDesc') }}</option>
                    <option value="name-asc">{{ t('lineManager.sortNameAsc') }}</option>
                  </select>
                </label>
              </div>
              <div v-if="loading || runtimeLoading" class="lmw-loading">...</div>
              <div v-else-if="currentDirectoryEntries.length === 0" class="lmw-empty">
                {{ t('lineManager.emptyFolder') }}
              </div>
              <div v-else class="lmw-media-list">
                <button
                  v-for="(entry, idx) in currentDirectoryEntries"
                  :key="'media-entry-' + (entry.path || entry.filePath || entry.name) + '-' + idx"
                  class="lmw-line lmw-line--inside-folder"
                  :class="{ selected: isEntrySelected(entry), 'lmw-line-folder-entry': entry.type === 'folder' }"
                  @click="entry.type === 'folder' ? toggleEntrySelection(entry, $event, currentDirectoryEntries) : toggleLineSelection(entry, $event)"
                  @dblclick="entry.type === 'folder' ? enterFolderEntry(entry) : openLine(entry)"
                  @contextmenu.prevent.stop="entry.type === 'folder' ? showContextMenu($event, entry) : showLineContextMenu($event, entry)"
                >
                  <div class="lmw-line-main">
                    <div v-if="entry.type === 'folder'" class="lmw-line-title">
                      <div class="lmw-folder-row">
                        <div class="lmw-folder-hero">
                          <i :class="entry.icon || 'fas fa-folder-open'" class="lmw-entry-icon"></i>
                        </div>
                        <div class="lmw-folder-copy">
                          <span class="lmw-folder-name">{{ entry.name }}</span>
                          <span class="lmw-folder-subtitle">{{ getFolderEntryHint(entry) }}</span>
                        </div>
                      </div>
                    </div>
                    <div v-else class="lmw-line-title" v-html="parseColorMarkup(entry.name)"></div>
                    <div class="lmw-line-meta" :class="{ 'lmw-line-meta--folder': entry.type === 'folder' }">
                      <template v-if="entry.type === 'folder'">
                        <span class="lmw-line-folder">
                          <i class="far fa-clock"></i> {{ formatExplorerDate(entry.mtime) || '--' }}
                        </span>
                        <span class="lmw-line-folder">
                          <i class="fas fa-folder"></i> {{ getFolderEntryMeta(entry) }}
                        </span>
                      </template>
                      <template v-else>
                      <span v-if="entry.isThroughLine" class="lmw-tag through">{{ t('folderLineManager.through') }}</span>
                      <span v-else-if="entry.isLoopLine" class="lmw-tag loop">{{ t('folderLineManager.loop') }}</span>
                      <span v-else class="lmw-tag single">{{ t('folderLineManager.single') }}</span>
                      <span class="lmw-stations">
                        {{ entry.firstStation }} -> {{ entry.lastStation }}
                      </span>
                      <span class="lmw-line-folder">
                        <i class="far fa-clock"></i> {{ formatExplorerDate(entry.mtime) || '--' }}
                      </span>
                      <span v-if="formatExplorerFileSize(entry.size)" class="lmw-line-folder">
                        <i class="fas fa-file"></i> {{ formatExplorerFileSize(entry.size) }}
                      </span>
                      </template>
                    </div>
                  </div>
                  <div class="lmw-line-color" :style="{ background: entry.type === 'folder' ? 'linear-gradient(180deg, rgba(96,165,250,.95), rgba(59,130,246,.75))' : (entry.themeColor || '#5F27CD') }"></div>
                </button>
              </div>
            </div>
            <div v-if="isSearchActive && (loading || runtimeLoading || searchLoading)" class="lmw-loading">...</div>
            <div v-else-if="isRootExplorer && !isSearchActive"></div>
            <div v-else-if="!isRootExplorer && !isSearchActive"></div>
            <div v-else-if="!isSearchActive && explorerEntries.length === 0" class="lmw-empty">
              {{ activeFolderId === 'runtime-cloud' ? t('lineManager.emptyCloudLines') : t('lineManager.emptyFolder') }}
            </div>
            <div v-else-if="isSearchActive && filteredLines.length === 0" class="lmw-empty">
              <i class="fas fa-search" style="font-size:32px; color:var(--muted); margin-bottom:12px;"></i>
              <span>{{ t('lineManager.noSearchResult') }}</span>
              <span class="lmw-search-hint">{{ t('lineManager.searchResultHint') }}</span>
            </div>
            <div v-else-if="isSearchActive" class="lmw-search-shell">
              <header class="lmw-search-header">
                <button type="button" class="lmw-search-back" @click="clearSearchView">
                  <i class="fas fa-chevron-left"></i>
                  <span>{{ t('lineManager.back') }}</span>
                </button>
                <div ref="searchSortDropdownRef" class="lmw-search-sort-dropdown">
                  <button type="button" class="lmw-search-sort-trigger" @click.stop="toggleSearchSortDropdown">
                    <span class="lmw-search-sort-label">{{ currentSearchSortLabel }}</span>
                    <i :class="searchSortDropdownOpen ? 'fas fa-chevron-up' : 'fas fa-chevron-down'"></i>
                  </button>
                  <div
                    v-if="searchSortDropdownOpen"
                    v-glassmorphism
                    class="lmw-search-sort-menu"
                  >
                    <button
                      v-for="option in searchSortOptions"
                      :key="option.value"
                      type="button"
                      class="lmw-search-sort-item"
                      :style="{ background: getSearchSortItemBackground(option.value) }"
                      @click.stop="selectSearchSortMode(option.value)"
                      @mouseover="setSearchSortItemHover($event, option.value)"
                      @mouseout="clearSearchSortItemHover($event, option.value)"
                    >
                      {{ option.label }}
                    </button>
                  </div>
                </div>
              </header>
              <div class="lmw-search-list">
                <button
                  v-for="(entry, idx) in filteredLines"
                  :key="'search-entry-' + (entry.filePath || entry.name) + '-' + idx"
                  class="lmw-line lmw-line--inside-folder lmw-line--search-result"
                  :class="{ selected: isEntrySelected(entry) }"
                  @click="toggleLineSelection(entry, $event)"
                  @dblclick="openLine(entry)"
                  @contextmenu.prevent.stop="showLineContextMenu($event, entry)"
                >
                  <div class="lmw-line-main">
                    <div class="lmw-line-title" v-html="parseColorMarkup(entry.name)"></div>
                    <div class="lmw-line-meta">
                      <span v-if="entry.isThroughLine" class="lmw-tag through">{{ t('folderLineManager.through') }}</span>
                      <span v-else-if="entry.isLoopLine" class="lmw-tag loop">{{ t('folderLineManager.loop') }}</span>
                      <span v-else class="lmw-tag single">{{ t('folderLineManager.single') }}</span>
                      <span class="lmw-stations">
                        {{ entry.firstStation }} -> {{ entry.lastStation }}
                      </span>
                      <span class="lmw-line-folder">
                        <i class="far fa-clock"></i> {{ formatExplorerDate(entry.mtime) || '--' }}
                      </span>
                      <span v-if="formatExplorerFileSize(entry.size)" class="lmw-line-folder">
                        <i class="fas fa-file"></i> {{ formatExplorerFileSize(entry.size) }}
                      </span>
                      <span class="lmw-line-folder lmw-line-folder--search-source">
                        <i class="fas fa-folder"></i> {{ entry.folderName || t('lineManager.title') }}
                      </span>
                    </div>
                  </div>
                  <div class="lmw-line-color" :style="{ background: entry.themeColor || '#5F27CD' }"></div>
                </button>
              </div>
            </div>
            <template v-else>
              <button
                v-for="(entry, idx) in explorerEntries"
                :key="entry.type + '-' + (entry.id || entry.path || entry.filePath || entry.name) + '-' + idx"
                class="lmw-line"
                :class="{ selected: isEntrySelected(entry), 'lmw-line-folder-entry': entry.type === 'folder' }"
                @click="entry.type === 'folder' ? toggleEntrySelection(entry, $event, explorerEntries) : toggleLineSelection(entry, $event)"
                @dblclick="entry.type === 'line' ? openLine(entry) : null"
                @contextmenu.prevent.stop="entry.type === 'line' ? showLineContextMenu($event, entry) : showContextMenu($event, entry)"
              >
                <div class="lmw-line-main">
                  <div class="lmw-line-title">
                    <template v-if="entry.type === 'folder'">
                      <div class="lmw-folder-row">
                        <div class="lmw-folder-hero">
                          <i :class="entry.icon || 'fas fa-folder'" class="lmw-entry-icon"></i>
                        </div>
                        <div class="lmw-folder-copy">
                          <span class="lmw-folder-name">{{ entry.name }}</span>
                          <span class="lmw-folder-subtitle">{{ getFolderEntryHint(entry) }}</span>
                        </div>
                      </div>
                    </template>
                    <template v-else>
                      <div v-html="parseColorMarkup(entry.name)"></div>
                    </template>
                  </div>
                  <div class="lmw-line-meta">
                    <template v-if="entry.type === 'folder'">
                      <div class="lmw-folder-meta-panel">
                        <span v-if="formatExplorerDate(entry.mtime)" class="lmw-folder-date">{{ formatExplorerDate(entry.mtime) }}</span>
                        <span class="lmw-folder-meta-secondary">{{ getFolderEntryMeta(entry) }}</span>
                      </div>
                    </template>
                    <template v-else>
                      <span v-if="entry.isThroughLine" class="lmw-tag through">{{ t('folderLineManager.through') }}</span>
                      <span v-if="entry.isLoopLine" class="lmw-tag loop">{{ t('folderLineManager.loop') }}</span>
                      <span class="lmw-stations">
                        {{ entry.firstStation }} -> {{ entry.lastStation }}
                        <span v-if="entry.isRuntime">{{ t('lineManager.runtimeStationCount', { count: entry.stationCount || entry.data?.stations?.length || 0 }) }}</span>
                      </span>
                      <span v-if="isSearchActive && entry.folderName" class="lmw-line-folder">
                        <i class="fas fa-folder"></i> {{ entry.folderName }}
                        <button type="button" class="lmw-locate-btn" @click.stop="locateToFolder(entry)" :title="t('lineManager.locate')">
                          {{ t('lineManager.locate') }}
                        </button>
                      </span>
                    </template>
                  </div>
                </div>
                <div class="lmw-line-color" :style="{ background: entry.type === 'folder' ? 'linear-gradient(180deg, rgba(96,165,250,.95), rgba(59,130,246,.75))' : (entry.themeColor || '#5F27CD') }"></div>
              </button>
            </template>
          </div>

          <div v-if="isSavingThroughLine || isSavingLine" class="lmw-bottom-bar">
            <div class="lmw-bottom-bar-left">
              <span class="lmw-bottom-bar-muted">
                {{ t('lineManager.savingToPrefix') }}{{ (folders?.find?.(f => f.id === (selectedFolderId ?? currentFolderId)))?.name || '-' }}
                <template v-if="isSavingLine && pendingLineSaveData && pendingLineSaveData.lineName"> | {{ pendingLineSaveData.lineName }}</template>
                <template v-else-if="isSavingThroughLine && pendingThroughLineInfo && pendingThroughLineInfo.lineName"> | {{ pendingThroughLineInfo.lineName }}</template>
              </span>
            </div>
            <div class="lmw-bottom-bar-right">
              <button type="button" class="lmw-btn lmw-btn-through" @click="isSavingThroughLine ? handleSaveThroughLine() : handleSavePendingLine()">
                <i class="fas fa-save"></i>
                <span>{{ bottomBarActionLabel }}</span>
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>

    <ContextMenu
      v-model="contextMenu.visible"
      :x="contextMenu.x"
      :y="contextMenu.y"
      :items="folderMenuItems"
      @select="onFolderMenuSelect"
    />
    <ContextMenu
      v-model="sidebarNewMenu.visible"
      :x="sidebarNewMenu.x"
      :y="sidebarNewMenu.y"
      :items="sidebarNewMenuItems"
      @select="onSidebarNewMenuSelect"
    />
    <ContextMenu
      v-model="linesNewMenu.visible"
      :x="linesNewMenu.x"
      :y="linesNewMenu.y"
      :items="linesNewMenuItems"
      @select="onLinesNewMenuSelect"
    />
    <ContextMenu
      v-model="lineContextMenu.visible"
      :x="lineContextMenu.x"
      :y="lineContextMenu.y"
      :items="lineMenuItems"
      @select="onLineMenuSelect"
    />

    <LineManagerDialog />

    <SpotlightOverlay
      v-if="spotlightVisible && spotlightStepConfig"
      :visible="spotlightVisible"
      :target-selector="spotlightStepConfig.targetSelector"
      :title="spotlightStepConfig.title"
      :body="spotlightStepConfig.body"
      :step-text="spotlightStepConfig.stepText || ''"
      :show-back="spotlightStepConfig.showBack"
      :show-next="spotlightStepConfig.showNext"
      :back-label="spotlightStepConfig.backLabel || 'Back'"
      :next-label="spotlightStepConfig.nextLabel || 'Next'"
      :padding="12"
      :radius="12"
      @back="spotlightPrevStep"
      @next="spotlightNextStep"
      @dim-click="spotlightCloseGuide"
    />
  </div>
</template>

<style>
.lmw-root {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: transparent;
}

.lmw-through-banner {
  padding: 12px 16px;
  background: #fff3e6;
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
  display: flex;
  align-items: center;
  gap: 12px;
}
.lmw-through-banner-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #ff9f43;
  color: #fff;
}
.lmw-through-banner-title {
  font-weight: 800;
  color: var(--text, #333);
}
.lmw-through-banner-sub,
.lmw-through-banner-tip {
  color: var(--muted, #666);
  font-size: 12px;
}
.lmw-through-banner-tip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
}
.lmw-through-banner-seg {
  margin-left: 12px;
}

.lmw-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
}
.lmw-main-body {
  flex: 1;
  display: flex;
  overflow: hidden;
  padding: 0;
  background: transparent;
  min-height: 0;
}
.lmw-breadcrumb {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.lmw-folder-toolbar {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.lmw-folder-toolbar-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--text, #202938);
}
.lmw-folder-sort {
  flex-shrink: 0;
}
.lmw-folder-sort-select {
  min-width: 138px;
  height: 36px;
  padding: 0 38px 0 14px;
  border-radius: 12px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  background: rgba(255, 255, 255, 0.88);
  color: var(--text, #202938);
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.06);
  outline: none;
}
.lmw-breadcrumb-back,
.lmw-breadcrumb-root {
  border: 1px solid rgba(15, 23, 42, 0.06);
  background: rgba(255, 255, 255, 0.72);
  color: var(--text, #333);
  border-radius: 12px;
  padding: 8px 12px;
  cursor: pointer;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.06);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  transition: transform 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
}
.lmw-breadcrumb-back:hover,
.lmw-breadcrumb-root:hover {
  transform: translateY(-1px);
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 14px 30px rgba(15, 23, 42, 0.10);
}
.lmw-breadcrumb-root.active {
  background: linear-gradient(180deg, rgba(219, 234, 254, 0.95), rgba(191, 219, 254, 0.88));
  border-color: rgba(59, 130, 246, 0.18);
  color: #1d4ed8;
}
.lmw-breadcrumb-sep {
  color: var(--muted, #777);
  font-size: 12px;
}
.lmw-breadcrumb-current {
  font-weight: 700;
  color: var(--text, #333);
}
.lmw-path-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: 50%;
  min-width: 0;
  padding: 8px 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.68);
  border: 1px solid rgba(15, 23, 42, 0.06);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.6);
  color: var(--muted, #666);
  font-size: 12px;
}
.lmw-path-chip span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lmw-entry-icon {
  color: #3b82f6;
  font-size: 30px;
}
/* 标题栏：左侧标题 + 中间搜索 + 右侧预留三大金刚键 */
.lmw-titlebar.custom-titlebar {
  display: flex;
  align-items: center;
  height: 32px;
  padding: 0 12px 0 12px;
  background: transparent !important;
  border-bottom: 1px solid var(--titlebar-border, rgba(0, 0, 0, 0.08));
  box-shadow: 0 1px 10px rgba(0, 0, 0, 0.05);
  -webkit-app-region: drag;
}
.lmw-titlebar-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  padding-right: 12px;
  -webkit-app-region: drag;
}
.lmw-titlebar-slot {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  -webkit-app-region: drag;
}
.lmw-titlebar-spacer {
  width: 138px;
  flex-shrink: 0;
  -webkit-app-region: drag;
}
.lmw-titlebar-search {
  display: flex;
  align-items: center;
  padding: 0 8px;
  -webkit-app-region: no-drag;
  user-select: text;
  width: 240px;
  max-width: 100%;
  flex-shrink: 0;
}
.lmw-search-inner {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 0 10px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.9);
  min-width: 0;
}
.lmw-titlebar-search .lmw-search-icon {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--muted, #999);
}
.lmw-titlebar-search .lmw-search-input {
  flex: 1;
  min-width: 0;
  height: 100%;
  padding: 0;
  border: none;
  background: transparent;
  font-size: 12px;
  outline: none;
}
.lmw-titlebar-search .lmw-search-input::placeholder {
  color: var(--muted, #999);
}
.lmw-search-inner:focus-within {
  border-color: var(--accent, #1677ff);
  outline: none;
}
.lmw-titlebar-search .lmw-search-clear {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--muted, #999);
  cursor: pointer;
  border-radius: 4px;
  font-size: 10px;
}
.lmw-titlebar-search .lmw-search-clear:hover {
  background: rgba(0, 0, 0, 0.06);
  color: var(--text, #333);
}
html.dark .lmw-search-inner {
  border-color: rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.2);
}
html.dark .lmw-titlebar-search .lmw-search-clear:hover {
  background: rgba(255, 255, 255, 0.08);
}
.lmw-sidebar {
  width: 220px;
  border-right: 1px solid rgba(0, 0, 0, 0.08);
  background: rgba(255, 255, 255, 0.85);
  overflow: auto;
}
.lmw-sidebar,
.lmw-lines {
  scrollbar-width: thin;
  scrollbar-color: rgba(0, 0, 0, 0.22) transparent;
}
.lmw-sidebar::-webkit-scrollbar,
.lmw-lines::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}
.lmw-sidebar::-webkit-scrollbar-track,
.lmw-lines::-webkit-scrollbar-track {
  background: transparent;
}
.lmw-sidebar::-webkit-scrollbar-thumb,
.lmw-lines::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.18);
  border-radius: 999px;
  border: 3px solid transparent;
  background-clip: padding-box;
}
.lmw-sidebar::-webkit-scrollbar-thumb:hover,
.lmw-lines::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.28);
  border: 3px solid transparent;
  background-clip: padding-box;
}
.lmw-sidebar-inner {
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.lmw-folder {
  height: 40px;
  border: 1px solid transparent;
  background: transparent;
  border-radius: 10px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 12px;
  cursor: pointer;
  color: var(--text, #333);
}
.lmw-folder i {
  color: var(--muted, #666);
}
.lmw-folder:hover {
  background: rgba(0, 0, 0, 0.04);
}
.lmw-folder.active {
  background: rgba(22, 119, 255, 0.08);
  border-color: rgba(22, 119, 255, 0.18);
}
.lmw-folder.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.lmw-folder-name {
  flex: 1;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  text-align: left;
}

.lmw-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: transparent;
  border: none;
  border-radius: 0;
  box-shadow: none;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  overflow: hidden;
  min-height: 0;
}
.lmw-content-header {
  padding: 12px 16px;
  border-bottom: 1px solid rgba(15, 23, 42, 0.08);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.72), rgba(255, 255, 255, 0.50));
  color: var(--muted, #666);
  font-size: 13px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.lmw-search-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
  background: #fafafa;
}
.lmw-search-icon {
  color: var(--muted, #999);
  font-size: 14px;
}
.lmw-search-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 8px;
  background: #fff;
  color: var(--text, #333);
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
}
.lmw-search-input:focus {
  border-color: var(--accent, #1677ff);
}
.lmw-search-input::placeholder {
  color: var(--muted, #999);
}
.lmw-search-clear {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--muted, #999);
  cursor: pointer;
  border-radius: 6px;
  transition: background 0.2s, color 0.2s;
}
.lmw-search-clear:hover {
  background: rgba(0, 0, 0, 0.06);
  color: var(--text, #333);
}
.lmw-search-hint {
  display: block;
  font-size: 12px;
  color: var(--muted, #999);
  margin-top: 6px;
}
.lmw-lines {
  flex: 1;
  overflow: auto;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
  background: #fff;
  border-radius: 16px 16px 0 0;
  min-height: 0;
}
.lmw-lines--media-view {
  overflow: hidden;
}
.lmw-library-shell {
  min-height: fit-content;
  margin: 0;
  padding: 0;
  background: #fff;
  border-radius: 16px 16px 0 0;
  overflow: hidden;
  flex: 0 0 auto;
}
.lmw-library-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 18px 0 34px;
  height: 58px;
}
.lmw-library-toolbar-label {
  font-size: 14px;
  color: #495468;
}
.lmw-folder-sort-select--library {
  min-width: 156px;
  height: 34px;
  border-radius: 10px;
  background: #fbfbfc;
  border-color: #d9dee7;
  box-shadow: none;
  font-size: 14px;
}
.lmw-library-list {
  padding-bottom: 18px;
}
.lmw-library-row {
  width: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 190px;
  align-items: center;
  gap: 18px;
  width: calc(100% - 24px);
  margin: 0 12px;
  padding: 0 18px 0 22px;
  min-height: 64px;
  border: none;
  border-radius: 12px;
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition: background 0.16s ease;
}
.lmw-library-row:hover {
  background: #f3f3f4;
}
.lmw-library-row.selected {
  background: #ebedef;
}
.lmw-library-row--line {
  grid-template-columns: minmax(0, 1fr) 132px;
}
.lmw-library-main {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 14px;
}
.lmw-library-folder-icon {
  width: 40px;
  height: 32px;
  position: relative;
  flex-shrink: 0;
}
.lmw-library-line-icon {
  width: 12px;
  height: 42px;
  border-radius: 999px;
  flex-shrink: 0;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.38);
}
.lmw-library-folder-tab {
  position: absolute;
  left: 2px;
  top: 2px;
  width: 16px;
  height: 7px;
  border-radius: 6px 6px 0 0;
  background: #77b9f6;
}
.lmw-library-folder-body {
  position: absolute;
  left: 0;
  top: 7px;
  width: 40px;
  height: 25px;
  border-radius: 5px;
  background: linear-gradient(180deg, #6eb5f6, #58a4ed);
}
.lmw-library-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.lmw-library-name {
  font-size: 15px;
  line-height: 20px;
  font-weight: 600;
  color: #141414;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lmw-library-subtitle {
  font-size: 12px;
  line-height: 18px;
  color: #7c8494;
}
.lmw-library-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 5px;
}
.lmw-library-date {
  font-size: 12px;
  line-height: 18px;
  color: #7c8494;
}
.lmw-library-updated {
  font-size: 12px;
  line-height: 18px;
  color: #7c8494;
  white-space: nowrap;
}
.lmw-media-shell {
  min-height: 100%;
  height: 100%;
  margin: 0;
  background: #fff;
  border-radius: 16px 16px 0 0;
  overflow: hidden;
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
}
.lmw-media-header {
  padding: 18px 20px 16px 8px;
  border-bottom: 1px solid #eceff3;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  flex: 0 0 auto;
}
.lmw-media-header-main {
  display: flex;
  align-items: center;
  gap: 10px;
}
.lmw-media-back {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: #171717;
  border-radius: 999px;
  cursor: pointer;
  font-size: 16px;
  transition: background 0.18s ease, color 0.18s ease;
}
.lmw-media-back:hover {
  background: rgba(15, 23, 42, 0.06);
}
.lmw-media-back:active {
  background: rgba(15, 23, 42, 0.10);
}
.lmw-media-title {
  font-size: 18px;
  line-height: 26px;
  font-weight: 700;
  color: #171717;
}
.lmw-media-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #202938;
}
.lmw-media-toolbar {
  height: 58px;
  padding: 0 18px 0 26px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex: 0 0 auto;
}
.lmw-media-group-label {
  font-size: 14px;
  color: #666f80;
}
.lmw-media-list {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding-bottom: 16px;
  scrollbar-width: thin;
  scrollbar-color: rgba(0, 0, 0, 0.24) transparent;
}
.lmw-media-list::-webkit-scrollbar {
  width: 10px;
}
.lmw-media-list::-webkit-scrollbar-track {
  background: transparent;
}
.lmw-media-list::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.18);
  border-radius: 999px;
  border: 3px solid transparent;
  background-clip: padding-box;
}
.lmw-media-list::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.30);
  border: 3px solid transparent;
  background-clip: padding-box;
}
.lmw-media-row {
  width: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 132px;
  align-items: center;
  gap: 18px;
  min-height: 64px;
  padding: 0 18px 0 24px;
  border: none;
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition: background 0.16s ease;
}
.lmw-media-row:hover {
  background: #f3f3f4;
}
.lmw-media-main {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 14px;
}
.lmw-media-thumb {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: linear-gradient(180deg, #8f8f8f, #6d6d6d);
  position: relative;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.lmw-media-disc-ring {
  width: 22px;
  height: 22px;
  border-radius: 999px;
  background: #2b2b2b;
  box-shadow: inset 0 0 0 2px rgba(255,255,255,0.12);
}
.lmw-media-disc-core {
  position: absolute;
  width: 16px;
  height: 16px;
  border-radius: 999px;
  background: rgba(255,255,255,0.12);
  color: #f87171;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
}
.lmw-media-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.lmw-media-name {
  font-size: 15px;
  line-height: 20px;
  font-weight: 500;
  color: #171717;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.lmw-media-subtitle {
  font-size: 12px;
  line-height: 18px;
  color: #80889a;
}
.lmw-media-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 5px;
}
.lmw-media-date,
.lmw-media-source {
  font-size: 12px;
  line-height: 18px;
  color: #80889a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.lmw-search-shell {
  min-height: 100%;
  background: #fff;
  border-radius: 16px 16px 0 0;
  display: flex;
  flex-direction: column;
}
.lmw-search-header {
  height: 66px;
  padding: 0 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid #eef1f5;
}
.lmw-search-back {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  padding: 0 8px 0 4px;
  border: none;
  background: transparent;
  color: #171717;
  border-radius: 10px;
  cursor: pointer;
  font-size: 14px;
}
.lmw-search-back:hover {
  background: #f3f3f4;
}
.lmw-search-sort-dropdown {
  position: relative;
  flex-shrink: 0;
}
.lmw-search-sort-trigger {
  min-width: 156px;
  max-width: 220px;
  width: 100%;
  box-sizing: border-box;
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.6);
  background: rgba(255, 255, 255, 0.58);
  backdrop-filter: blur(18px) saturate(170%);
  -webkit-backdrop-filter: blur(18px) saturate(170%);
  color: var(--text, #202938);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  box-shadow: 0 14px 36px rgba(15, 23, 42, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.5);
  transition: background 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
}
.lmw-search-sort-trigger:hover {
  transform: translateY(-1px);
  box-shadow: 0 16px 38px rgba(15, 23, 42, 0.24), inset 0 1px 0 rgba(255, 255, 255, 0.56);
}
.lmw-search-sort-trigger i {
  font-size: 12px;
  color: var(--muted, #6b7280);
}
.lmw-search-sort-label {
  min-width: 0;
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.lmw-search-sort-menu {
  position: absolute;
  top: calc(100% + 10px);
  right: 0;
  z-index: 50;
  min-width: 100%;
  padding: 8px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.55);
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(18px) saturate(170%);
  -webkit-backdrop-filter: blur(18px) saturate(170%);
  box-shadow: 0 18px 46px rgba(15, 23, 42, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.46);
}
.lmw-search-sort-item {
  width: 100%;
  border: none;
  background: transparent;
  color: var(--text, #202938);
  text-align: left;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  transition: background 0.16s ease;
}
.lmw-search-list {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: 14px 18px 22px;
}
.lmw-line--search-result {
  width: 100%;
  margin: 0;
}
.lmw-line-folder--search-source {
  min-width: 0;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lmw-bottom-bar {
  padding: 12px 16px;
  border-top: 1px solid rgba(0, 0, 0, 0.08);
  background: var(--lm-bottom-bar-bg, rgba(250, 250, 250, 0.85));
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-shrink: 0;
}
.lmw-bottom-bar-left {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text, #333);
  font-size: 13px;
}
.lmw-bottom-bar-icon {
  color: #22c55e;
  font-size: 14px;
}
.lmw-bottom-bar-muted {
  color: var(--muted, #666);
  font-size: 12px;
}
.lmw-bottom-bar-right {
  flex-shrink: 0;
}
.lmw-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  border: none;
  cursor: pointer;
  transition: background 0.2s, transform 0.1s;
}
.lmw-btn:active {
  transform: scale(0.98);
}
.lmw-btn-through {
  background: #ff9f43;
  color: #fff;
}
.lmw-btn-through:hover {
  background: #e88c2e;
}
.lmw-line {
  border: 1px solid rgba(15, 23, 42, 0.07);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(255, 255, 255, 0.82));
  border-radius: 16px;
  padding: 14px 15px;
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  position: relative;
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.05);
  transition: transform 0.18s ease, box-shadow 0.18s ease, background 0.18s ease, border-color 0.18s ease;
}
.lmw-line:hover {
  transform: translateY(-1px);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 250, 252, 0.92));
  box-shadow: 0 16px 34px rgba(15, 23, 42, 0.10);
}
.lmw-line-folder-entry {
  border-color: rgba(59, 130, 246, 0.14);
  background:
    radial-gradient(circle at left top, rgba(191, 219, 254, 0.46), transparent 42%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(239, 246, 255, 0.88));
}
.lmw-line.selected {
  border-color: rgba(22, 119, 255, 0.6);
  box-shadow: 0 0 0 2px rgba(22, 119, 255, 0.35);
  background: rgba(22, 119, 255, 0.06);
}
.lmw-line.selected::before {
  content: '';
  position: absolute;
  left: 0;
  top: 8px;
  bottom: 8px;
  width: 4px;
  border-radius: 999px;
  background: linear-gradient(180deg, #1e90ff, #4dabff);
}
.lmw-line-main {
  flex: 1;
  min-width: 0;
}
.lmw-line-title {
  font-weight: 800;
  color: var(--text, #333);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: flex;
  align-items: center;
  gap: 10px;
}
.lmw-folder-row {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}
.lmw-folder-hero {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.72), rgba(219, 234, 254, 0.72));
  border: 1px solid rgba(59, 130, 246, 0.12);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.65);
}
.lmw-folder-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.lmw-folder-name {
  font-weight: 800;
  color: var(--text, #243244);
  overflow: hidden;
  text-overflow: ellipsis;
}
.lmw-folder-subtitle {
  font-size: 12px;
  color: var(--muted, #7b8794);
  overflow: hidden;
  text-overflow: ellipsis;
}
.lmw-folder-date,
.lmw-folder-open-indicator {
  margin-left: auto;
  color: var(--muted, #7b8794);
  font-size: 12px;
  flex-shrink: 0;
}
.lmw-folder-meta-panel {
  margin-left: auto;
  min-width: 200px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}
.lmw-folder-meta-secondary {
  max-width: 240px;
  color: var(--muted, #7b8794);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lmw-line-meta {
  margin-top: 4px;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 12px;
  color: var(--muted, #666);
}
.lmw-tag {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  background: rgba(0, 0, 0, 0.03);
  min-width: 48px;
  text-align: center;
  justify-content: center;
  display: inline-flex;
  align-items: center;
}
.lmw-tag.through {
  border-color: rgba(155, 89, 182, 0.3);
  background: rgba(155, 89, 182, 0.08);
  color: #7d3c98;
}
.lmw-tag.loop {
  border-color: rgba(39, 174, 96, 0.3);
  background: rgba(39, 174, 96, 0.08);
  color: #1e8449;
}
.lmw-tag.single {
  border-color: rgba(59, 130, 246, 0.24);
  background: rgba(59, 130, 246, 0.08);
  color: #2563eb;
}
.lmw-stations {
  min-width: 0;
  flex: 1 1 180px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.lmw-line-folder {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: 8px;
  padding-left: 8px;
  border-left: 1px solid rgba(0, 0, 0, 0.1);
  color: var(--muted, #888);
  min-width: 104px;
  justify-content: flex-start;
  flex: 0 0 104px;
}
.lmw-line-folder i {
  font-size: 11px;
}
.lmw-locate-btn {
  padding: 2px 8px;
  font-size: 11px;
  border: none;
  border-radius: 4px;
  background: rgba(22, 119, 255, 0.12);
  color: #1677ff;
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
}
.lmw-locate-btn:hover {
  background: rgba(22, 119, 255, 0.2);
  color: #0958d9;
}
html.dark .lmw-line-folder {
  border-left-color: rgba(255, 255, 255, 0.15);
}
html.dark .lmw-locate-btn {
  background: rgba(22, 119, 255, 0.25);
  color: #69b1ff;
}
html.dark .lmw-locate-btn:hover {
  background: rgba(22, 119, 255, 0.35);
}
.lmw-line-color {
  width: 12px;
  height: 46px;
  border-radius: 999px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.45);
}
.lmw-line--inside-folder {
  width: calc(100% - 36px);
  margin: 0 18px;
  border: none;
  border-radius: 12px;
  background: transparent;
  box-shadow: none;
  padding: 12px 14px;
  transform: none !important;
}
.lmw-line--inside-folder .lmw-line-meta {
  flex-wrap: nowrap;
}
.lmw-line--inside-folder .lmw-line-title {
  min-width: 0;
}
.lmw-line--inside-folder .lmw-line-meta--folder {
  gap: 10px;
}
.lmw-line--inside-folder:not(.lmw-line-folder-entry) .lmw-line-folder {
  margin-left: auto;
  padding-left: 6px;
  min-width: auto;
  flex: 0 0 auto;
}
.lmw-line--inside-folder:not(.lmw-line-folder-entry) .lmw-line-folder + .lmw-line-folder {
  margin-left: 4px;
}
.lmw-line--inside-folder:not(.lmw-line-folder-entry) .lmw-stations {
  text-align: left;
}
.lmw-line--inside-folder:hover {
  background: #f3f3f4;
  box-shadow: none;
}
.lmw-line--inside-folder.selected {
  border: none;
  box-shadow: none;
  background: #ebedef;
}
.lmw-line--inside-folder.selected::before {
  display: none;
}

.lmw-footer {
  padding: 12px 16px;
  border-top: 1px solid rgba(0, 0, 0, 0.08);
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  background: #fff;
}
.lmw-btn {
  height: 36px;
  padding: 0 14px;
  border-radius: 10px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  background: #fff;
  color: var(--text, #333);
  font-weight: 700;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.lmw-btn:hover {
  background: #f5f5f5;
}
.lmw-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.lmw-btn.primary {
  border-color: rgba(255, 159, 67, 0.5);
  background: #ff9f43;
  color: #fff;
}
/* 底栏「保存贯通线路」按钮：强制橙色，避免被 .lmw-btn 的 background:#fff 覆盖 */
.lmw-btn.lmw-btn-through {
  border-color: rgba(255, 159, 67, 0.5);
  background: #ff9f43;
  color: #fff;
}
.lmw-btn.lmw-btn-through:hover {
  background: #e88c2e;
  border-color: rgba(232, 140, 46, 0.6);
}
.lmw-btn.ghost {
  background: #fafafa;
}

.lmw-loading,
.lmw-empty {
  padding: 24px;
  text-align: center;
  color: var(--muted, #666);
}

/* 深色模式适配：跟随 html.dark */
html.dark .lmw-through-banner {
  background: rgba(255, 159, 67, 0.12);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

html.dark .lmw-sidebar {
  background: rgba(15, 20, 26, 0.72);
  border-right: 1px solid rgba(255, 255, 255, 0.08);
}

html.dark .lmw-content {
  background: transparent;
  border-color: transparent;
  box-shadow: none;
}

html.dark .lmw-search-bar {
  background: rgba(255, 255, 255, 0.04);
  border-bottom-color: rgba(255, 255, 255, 0.08);
}
html.dark .lmw-search-input {
  background: rgba(0, 0, 0, 0.25);
  border-color: rgba(255, 255, 255, 0.12);
  color: var(--text);
}
html.dark .lmw-search-input:focus {
  border-color: var(--accent);
}
html.dark .lmw-search-clear:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text);
}
html.dark .lmw-content-header {
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.04));
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  color: var(--muted, rgba(230, 238, 246, 0.65));
}
html.dark .lmw-breadcrumb-back,
html.dark .lmw-breadcrumb-root,
html.dark .lmw-path-chip {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.08);
  color: var(--text, #e6eef6);
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.18);
}
html.dark .lmw-folder-toolbar-title,
html.dark .lmw-folder-name {
  color: #e6eef6;
}
html.dark .lmw-folder-sort-select {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.10);
  color: #e6eef6;
  box-shadow: 0 8px 18px rgba(0, 0, 0, 0.20);
}
html.dark .lmw-breadcrumb-root.active {
  background: linear-gradient(180deg, rgba(59, 130, 246, 0.28), rgba(37, 99, 235, 0.20));
  border-color: rgba(96, 165, 250, 0.26);
  color: #bfdbfe;
}

html.dark .lmw-bottom-bar {
  background: rgba(9, 21, 27, 0.95);
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}
html.dark .lmw-bottom-bar-left {
  color: var(--text, #e6eef6);
}
html.dark .lmw-bottom-bar-muted {
  color: rgba(230, 238, 246, 0.6);
}

html.dark .lmw-folder {
  color: var(--text, #e6eef6);
}
html.dark .lmw-folder i {
  color: rgba(230, 238, 246, 0.65);
}
html.dark .lmw-folder:hover {
  background: rgba(255, 255, 255, 0.06);
}
html.dark .lmw-folder.active {
  background: rgba(22, 119, 255, 0.18);
  border-color: rgba(22, 119, 255, 0.35);
}

html.dark .lmw-lines {
  color: var(--text, #e6eef6);
  background: rgba(12, 18, 26, 0.96);
}
html.dark .lmw-library-shell {
  background: rgba(12, 18, 26, 0.96);
}
html.dark .lmw-library-name {
  color: #e6eef6;
}
html.dark .lmw-library-toolbar-label,
html.dark .lmw-library-subtitle,
html.dark .lmw-library-date,
html.dark .lmw-library-updated {
  color: rgba(230, 238, 246, 0.62);
}
html.dark .lmw-library-row:hover {
  background: rgba(255, 255, 255, 0.06);
}
html.dark .lmw-library-row.selected {
  background: rgba(255, 255, 255, 0.12);
}
html.dark .lmw-library-folder-tab {
  background: #8cc7ff;
}
html.dark .lmw-library-folder-body {
  background: linear-gradient(180deg, #77bcfb, #4f9cec);
}
html.dark .lmw-media-shell {
  background: rgba(12, 18, 26, 0.96);
}
html.dark .lmw-media-header {
  border-bottom-color: rgba(255, 255, 255, 0.08);
}
html.dark .lmw-media-title,
html.dark .lmw-media-link,
html.dark .lmw-media-name,
html.dark .lmw-media-back {
  color: #e6eef6;
}
html.dark .lmw-media-back:hover {
  background: rgba(255, 255, 255, 0.08);
}
html.dark .lmw-media-back:active {
  background: rgba(255, 255, 255, 0.14);
}
html.dark .lmw-media-group-label,
html.dark .lmw-media-subtitle,
html.dark .lmw-media-date,
html.dark .lmw-media-source {
  color: rgba(230, 238, 246, 0.62);
}
html.dark .lmw-media-row:hover {
  background: rgba(255, 255, 255, 0.06);
}
html.dark .lmw-media-list {
  scrollbar-color: rgba(255, 255, 255, 0.32) transparent;
}
html.dark .lmw-media-list::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.18);
  border-radius: 999px;
  border: 3px solid transparent;
  background-clip: padding-box;
}
html.dark .lmw-media-list::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.28);
  border: 3px solid transparent;
  background-clip: padding-box;
}
html.dark .lmw-media-thumb {
  background: linear-gradient(180deg, #7b7b7b, #5d5d5d);
}
html.dark .lmw-search-shell {
  background: rgba(12, 18, 26, 0.96);
}
html.dark .lmw-search-header {
  border-bottom-color: rgba(255, 255, 255, 0.08);
}
html.dark .lmw-search-back,
html.dark .lmw-search-name {
  color: #e6eef6;
}
html.dark .lmw-search-back:hover {
  background: rgba(255, 255, 255, 0.06);
}
html.dark .lmw-search-sort-trigger {
  border-color: rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.08);
  color: #e6eef6;
  box-shadow: 0 14px 36px rgba(0, 0, 0, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.12);
}
html.dark .lmw-search-sort-trigger:hover {
  box-shadow: 0 16px 38px rgba(0, 0, 0, 0.32), inset 0 1px 0 rgba(255, 255, 255, 0.16);
}
html.dark .lmw-search-sort-trigger i {
  color: rgba(230, 238, 246, 0.72);
}
html.dark .lmw-search-sort-menu {
  border-color: rgba(255, 255, 255, 0.16);
  background: rgba(17, 24, 39, 0.74);
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.34), inset 0 1px 0 rgba(255, 255, 255, 0.08);
}
html.dark .lmw-search-sort-item {
  color: #e6eef6;
}
html.dark .lmw-line {
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.03));
  border-color: rgba(255, 255, 255, 0.10);
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.18);
}
html.dark .lmw-line:hover {
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.09), rgba(255, 255, 255, 0.05));
}
html.dark .lmw-line-folder-entry {
  background:
    radial-gradient(circle at left top, rgba(59, 130, 246, 0.20), transparent 42%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(30, 41, 59, 0.16));
  border-color: rgba(96, 165, 250, 0.18);
}
html.dark .lmw-line.selected {
  border-color: rgba(64, 156, 255, 0.9);
  box-shadow: 0 0 0 2px rgba(64, 156, 255, 0.55);
  background: rgba(25, 118, 210, 0.35);
}
html.dark .lmw-line.selected::before {
  background: linear-gradient(180deg, #40a9ff, #69c0ff);
}
html.dark .lmw-line--inside-folder:hover {
  background: rgba(255, 255, 255, 0.07);
  box-shadow: none;
}
html.dark .lmw-line--inside-folder.selected {
  background: rgba(255, 255, 255, 0.12);
  border: none;
  box-shadow: none;
}
html.dark .lmw-line--inside-folder.selected::before {
  display: none;
}
html.dark .lmw-line-meta {
  color: var(--muted, rgba(230, 238, 246, 0.62));
}
html.dark .lmw-folder-hero {
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.10), rgba(59, 130, 246, 0.16));
  border-color: rgba(96, 165, 250, 0.18);
}
html.dark .lmw-folder-subtitle,
html.dark .lmw-folder-date,
html.dark .lmw-folder-open-indicator,
html.dark .lmw-folder-meta-secondary {
  color: rgba(230, 238, 246, 0.62);
}
html.dark .lmw-tag {
  border-color: rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.06);
}
html.dark .lmw-tag.through {
  border-color: rgba(194, 130, 255, 0.30);
  background: rgba(194, 130, 255, 0.12);
  color: rgba(223, 196, 255, 0.95);
}
html.dark .lmw-tag.loop {
  border-color: rgba(92, 214, 147, 0.28);
  background: rgba(92, 214, 147, 0.12);
  color: rgba(173, 245, 205, 0.95);
}
html.dark .lmw-tag.single {
  border-color: rgba(96, 165, 250, 0.30);
  background: rgba(96, 165, 250, 0.14);
  color: #bfdbfe;
}

html.dark .lmw-footer {
  background: rgba(10, 14, 18, 0.90);
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}
html.dark .lmw-btn {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.16);
  color: var(--text, #e6eef6);
}
html.dark .lmw-btn:hover {
  background: rgba(255, 255, 255, 0.10);
}
html.dark .lmw-btn.primary {
  background: #ff9f43;
  border-color: rgba(255, 159, 67, 0.60);
  color: #fff;
}
html.dark .lmw-btn.lmw-btn-through {
  background: #ff9f43;
  border-color: rgba(255, 159, 67, 0.60);
  color: #fff;
}
html.dark .lmw-btn.lmw-btn-through:hover {
  background: #e88c2e;
}

/* 深色模式滚动条 */
html.dark .lmw-sidebar,
html.dark .lmw-lines {
  scrollbar-color: rgba(255, 255, 255, 0.32) transparent;
}
html.dark .lmw-sidebar::-webkit-scrollbar-thumb,
html.dark .lmw-lines::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.18);
  border-radius: 999px;
  border: 3px solid transparent;
  background-clip: padding-box;
}
html.dark .lmw-sidebar::-webkit-scrollbar-thumb:hover,
html.dark .lmw-lines::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.28);
  border: 3px solid transparent;
  background-clip: padding-box;
}
</style>
