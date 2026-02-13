<script>
// 独立窗口线路管理器（现代扁平 + 云控线路虚拟文件夹）
import { ref, computed, watch, onMounted, nextTick, Teleport, Transition } from 'vue'
import { useI18n } from 'vue-i18n'
import LineManagerDialog from '../LineManagerDialog.js'
import LineManagerTopbar from '../LineManagerTopbar.js'
import { useCloudConfig, CLOUD_API_BASE } from '../../composables/useCloudConfig.js'
import dialogService from '../../utils/dialogService.js'
import ContextMenu from './ContextMenu.vue'

// 去除颜色标记，返回纯文本（用于搜索）
function stripColorMarkup(text) {
  if (!text || typeof text !== 'string') return ''
  return text.replace(/<[^>]+>([^<]*)<\/[^>]+>/g, '$1').replace(/<[^>]+>/g, '')
}

// 解析颜色标记（仅用于显示）
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
  components: { Teleport, Transition, LineManagerDialog, LineManagerTopbar, ContextMenu },
  setup() {
    const { t } = useI18n()
    const folders = ref([])
    const currentFolderId = ref('default')
    const currentLines = ref([])
    const loading = ref(false)
    const selectedFolderId = ref(null)
    const selectedLine = ref(null)
    const searchQuery = ref('')
    const allLinesWithFolder = ref([])
    const searchLoading = ref(false)
    const sidebarRef = ref(null)
    const linesRef = ref(null)

    // 右键菜单状态
    const contextMenu = ref({ visible: false, x: 0, y: 0, folderId: null, folderName: null })
    const lineContextMenu = ref({ visible: false, x: 0, y: 0, line: null })
    const sidebarNewMenu = ref({ visible: false, x: 0, y: 0 })
    const linesNewMenu = ref({ visible: false, x: 0, y: 0 })
    const clipboard = ref({ type: null, line: null, folder: null, sourceFolderId: null, sourceFolderPath: null })

    const isSavingThroughLine = ref(false)
    const pendingThroughLineInfo = ref(null)

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
        const { lineData, lineName, cleanLineName, validSegments } = pendingData

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

        // 可用文件夹：排除默认和云控
        const availableFolders = folders.value.filter(
          (f) => f.id !== 'default' && f.name !== '默认' && f.id !== CLOUD_FOLDER_ID && !f.isRuntime
        )

        console.log('[线路管理器] 可用文件夹数量:', availableFolders.length)

        if (availableFolders.length === 0) {
          if (!window.__lineManagerDialog) return
          const folderName = await window.__lineManagerDialog.prompt(
            '当前没有可用的文件夹，请创建一个新文件夹用于保存贯通线路：',
            '新建文件夹',
            '创建文件夹'
          )

          if (!folderName || !folderName.trim()) {
            isSavingThroughLine.value = false
            pendingThroughLineInfo.value = null
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
              await doSaveThroughLine(lineData, cleanLineName, newFolder)
            } else {
              localStorage.setItem(
                'throughLineSaveResult',
                JSON.stringify({ success: false, error: '创建文件夹后未找到' })
              )
              if (window.electronAPI?.closeWindow) await window.electronAPI.closeWindow()
            }
          } else {
            localStorage.setItem(
              'throughLineSaveResult',
              JSON.stringify({
                success: false,
                error: (addRes && addRes.error) || '创建文件夹失败'
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
          '请选择保存贯通线路的文件夹：',
          lineName
        )
        if (selectedFolder) {
          await doSaveThroughLine(lineData, cleanLineName, selectedFolder)
        } else {
          isSavingThroughLine.value = false
          pendingThroughLineInfo.value = null
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
        localStorage.setItem(
          'throughLineSaveResult',
          JSON.stringify({ success: false, error: e.message || e })
        )
        if (window.electronAPI?.closeWindow) await window.electronAPI.closeWindow()
      }
    }

    async function doSaveThroughLine(lineData, cleanLineName, folder) {
      try {
        if (folder.id === 'default' || folder.name === '默认' || folder.id === CLOUD_FOLDER_ID) {
          if (window.__lineManagerDialog) {
            await window.__lineManagerDialog.alert('不允许保存到默认或云控文件夹，请选择其他文件夹', '提示')
          }
          return
        }

        const safeName = (cleanLineName || '贯通线路').replace(/[<>:"/\\|?*]/g, '').trim()
        const targetFileName = (safeName || 'through-line') + '.json'
        const saveRes = await window.electronAPI.lines.save(targetFileName, lineData, folder.path)

        if (saveRes && saveRes.ok) {
          isSavingThroughLine.value = false
          pendingThroughLineInfo.value = null
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
          localStorage.setItem(
            'throughLineSaveResult',
            JSON.stringify({
              success: false,
              error: (saveRes && saveRes.error) || '保存失败'
            })
          )
          if (window.electronAPI?.closeWindow) await window.electronAPI.closeWindow()
        }
      } catch (e) {
        console.error('执行保存失败:', e)
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
        const dialog = document.createElement('div')
        dialog.style.cssText =
          'position:fixed; inset:0; display:flex; align-items:center; justify-content:center; z-index:21000; background:rgba(0,0,0,0.6); backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px); animation:fadeIn 0.3s ease;'

        const dialogContent = document.createElement('div')
        dialogContent.style.cssText =
          'background:var(--card, #ffffff); border-radius:16px; width:92%; max-width:500px; max-height:85vh; display:flex; flex-direction:column; box-shadow:0 20px 60px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.1); overflow:hidden; transform:scale(1); transition:transform 0.2s;'

        const header = document.createElement('div')
        header.style.cssText =
          'padding:24px 28px; border-bottom:1px solid var(--divider, rgba(0,0,0,0.1)); display:flex; flex-direction:column; gap:16px; flex-shrink:0; background:linear-gradient(135deg, rgba(255,159,67,0.05) 0%, rgba(255,159,67,0.02) 100%);'
        header.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div style="display:flex; align-items:center; gap:12px;">
              <div style="width:40px; height:40px; border-radius:10px; background:linear-gradient(135deg, #FF9F43 0%, #FFC371 100%); display:flex; align-items:center; justify-content:center; box-shadow:0 4px 12px rgba(255,159,67,0.3);">
                <i class="fas fa-folder-open" style="color:white; font-size:18px;"></i>
              </div>
              <div>
                <h3 style="margin:0; font-size:20px; font-weight:800; color:var(--text, #333); letter-spacing:-0.5px;">${title || '选择文件夹'}</h3>
                <div style="font-size:12px; color:var(--muted, #999); margin-top:2px;">Select Folder</div>
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
              <div style="font-size:14px; font-weight:700; color:#fff; margin-bottom:4px;">保存贯通线路</div>
              <div style="font-size:12px; color:rgba(255,255,255,0.95);">线路名称: ${lineName}</div>
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
        footer.innerHTML = `
          <button id="cancelBtn" style="padding:8px 14px; border-radius:6px; border:1px solid var(--divider, rgba(0,0,0,0.1)); background:transparent; cursor:pointer; font-size:13px;">取消</button>
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
          // 保存贯通线路时不打开默认文件夹：自动选中第一个可用文件夹（非默认、非云控）
          const availableFolders = folders.value.filter(
            (f) => f.id !== 'default' && f.id !== CLOUD_FOLDER_ID && f.name !== '默认' && !f.isRuntime
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

    async function loadLinesFromFolder(folderId) {
      if (!(window.electronAPI && window.electronAPI.lines)) return
      loading.value = true
      try {
        const folder = folders.value.find((f) => f.id === folderId)
        const folderPath = folder ? folder.path : null
        const items = await window.electronAPI.lines.list(folderPath)
        const lines = []
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
              lines.push({
                name: d.meta?.lineName || '未命名线路',
                filePath: it?.name || '',
                data: d,
                themeColor: buildLineColor(d),
                firstStation: stationInfo.first,
                lastStation: stationInfo.last,
                isThroughLine,
                isLoopLine
              })
            }
          } catch (e) {
            console.warn('读取线路失败:', e)
          }
        }
        currentLines.value = lines
      } catch (e) {
        console.error('加载线路失败:', e)
      } finally {
        loading.value = false
      }
    }

    async function loadFolders() {
      if (!hasFoldersAPI.value) {
        // 非 Electron 环境：默认文件夹 + 云控虚拟文件夹
        folders.value = [
          { id: 'default', name: '默认', path: '', isCurrent: true },
          { id: CLOUD_FOLDER_ID, name: '云控线路', path: null, isRuntime: true }
        ]
        currentFolderId.value = 'default'
        selectedFolderId.value = 'default'
        return
      }
      try {
        const res = await window.electronAPI.lines.folders.list()
        if (res && res.ok && res.folders) {
          folders.value = res.folders
          currentFolderId.value = res.current || 'default'
          selectedFolderId.value = currentFolderId.value
          // 追加云控虚拟文件夹
          folders.value.push({ id: CLOUD_FOLDER_ID, name: '云控线路', path: null, isRuntime: true })
          await loadLinesFromFolder(currentFolderId.value)
        }
      } catch (e) {
        console.error('加载文件夹列表失败:', e)
      }
    }

    async function loadRuntimeLines() {
      runtimeLoading.value = true
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
              name: lineName || '未命名线路',
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
          await dialogService.alert('获取云控线路失败：' + (result.error || '未知错误'), '错误')
        }
      } catch (e) {
        console.error('加载云控线路失败:', e)
        await dialogService.alert('加载云控线路失败：' + (e.message || e), '错误')
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
                  name: lineName || '未命名线路',
                  filePath: it?.name || '',
                  data: d,
                  themeColor: buildLineColor(d),
                  firstStation: stationInfo.first,
                  lastStation: stationInfo.last,
                  isThroughLine,
                  isLoopLine,
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
                  name: lineName || '未命名线路',
                  data: raw,
                  stationCount: raw.stations?.length || 0,
                  themeColor: buildLineColor(raw),
                  firstStation: stationInfo.first,
                  lastStation: stationInfo.last,
                  isRuntime: true,
                  isThroughLine,
                  isLoopLine,
                  folderId: CLOUD_FOLDER_ID,
                  folderName: '云控线路'
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

    async function selectFolder(folderId) {
      selectedFolderId.value = folderId
      selectedLine.value = null
      if (folderId === CLOUD_FOLDER_ID) {
        await loadRuntimeLines()
      } else {
        await loadLinesFromFolder(folderId)
      }
    }

    function toggleLineSelection(line) {
      // 保存贯通线路模式下不允许选择已有线路（仅选择目标文件夹）
      if (isSavingThroughLine.value) return
      if (selectedLine.value === line) {
        selectedLine.value = null
      } else {
        selectedLine.value = line
        // 搜索模式下点击线路时，定位到其所在文件夹（高亮侧边栏）
        if (line.folderId && line.folderId !== selectedFolderId.value) {
          selectFolder(line.folderId)
        }
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
          await window.__lineManagerDialog.alert('云控线路数据无效，无法应用', '提示')
        return
      }
      try {
        const payload = JSON.parse(JSON.stringify(normalized))
        const lineName = payload.meta.lineName
        if (window.electronAPI && window.electronAPI.switchRuntimeLine) {
          const result = await window.electronAPI.switchRuntimeLine(payload)
          if (result && result.ok) {
            // 不自动关闭线路管理器，方便用户确认主窗口已应用后再手动关闭
          } else if (result && result.error && window.__lineManagerDialog) {
            await window.__lineManagerDialog.alert('应用失败：' + result.error, '错误')
          }
        } else {
          localStorage.setItem('runtimeLineData', JSON.stringify(payload))
          localStorage.setItem('lineManagerSelectedLine', lineName)
          localStorage.setItem('isRuntimeLine', 'true')
          if (window.opener && !window.opener.closed) {
            window.opener.postMessage(
              { type: 'switch-runtime-line', lineName, lineData: payload },
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
          await dialogService.alert('应用云控线路失败：' + (e.message || e), '错误')
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

    async function addFolder() {
      if (!(window.electronAPI && window.electronAPI.lines && window.electronAPI.lines.folders)) return
      if (!window.__lineManagerDialog) return
      const name = await window.__lineManagerDialog.prompt('请输入文件夹名称', '', '新建文件夹')
      if (!name) return
      try {
        const res = await window.electronAPI.lines.folders.add(name)
        if (res && res.ok) await loadFolders()
      } catch (e) {
        console.error('新建文件夹失败:', e)
      }
    }

    async function deleteFolder(folderId, folderName, folderPath) {
      // 完全对齐备份逻辑：默认文件夹不可删，使用 lines.folders.remove(path||id)
      if (!window.__lineManagerDialog) return
      if (folderId === 'default') {
        await window.__lineManagerDialog.alert('不能删除默认文件夹', '提示')
        return
      }
      const confirmed = await window.__lineManagerDialog.confirm(
        `确定要删除文件夹"${folderName}"吗？\n\n警告：删除后文件夹及其内部的所有文件将被永久删除，无法恢复！`,
        '删除文件夹'
      )
      if (!confirmed) return
      if (!(window.electronAPI && window.electronAPI.lines && window.electronAPI.lines.folders)) {
        await window.__lineManagerDialog.alert('Electron API 不可用', '错误')
        return
      }
      try {
        const res = await window.electronAPI.lines.folders.remove(folderPath || folderId)
        if (res && res.ok) {
          await loadFolders()
          await window.__lineManagerDialog.alert('文件夹已删除', '成功')
        } else {
          const errorMsg = res && res.error ? res.error : '未知错误'
          console.error('删除文件夹失败:', res)
          await loadFolders()
          await window.__lineManagerDialog.alert(`删除文件夹失败\n\n${errorMsg}`, '错误')
        }
      } catch (e) {
        console.error('删除文件夹失败:', e)
        await window.__lineManagerDialog.alert('删除文件夹失败：' + (e.message || e), '错误')
      }
    }

    async function renameFolder(folderId, currentName) {
      if (!(window.electronAPI && window.electronAPI.lines && window.electronAPI.lines.folders)) return
      if (!window.__lineManagerDialog) return
      const newName = await window.__lineManagerDialog.prompt(t('lineManager.renameFolderPrompt'), currentName, t('lineManager.renameFolderTitle'))
      if (newName && newName.trim() !== currentName) {
        try {
          const res = await window.electronAPI.lines.folders.rename(folderId, newName)
          if (res && res.ok) await loadFolders()
        } catch (e) {
          console.error('重命名文件夹失败:', e)
        }
      }
    }

    function showContextMenu(event, folder) {
      event.preventDefault()
      event.stopPropagation()
      contextMenu.value = {
        visible: true,
        x: event.clientX,
        y: event.clientY,
        folderId: folder.id,
        folderName: folder.name
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
      linesNewMenu.value = { visible: true, x: event.clientX, y: event.clientY }
    }
    function closeLinesNewMenu() {
      linesNewMenu.value.visible = false
    }

    async function openFolderInExplorer(folderId) {
      closeContextMenu()
      const folder = folders.value.find((f) => f.id === folderId)
      if (!folder || !folder.path) return
      if (window.electronAPI && window.electronAPI.lines?.folders?.open) {
        try {
          const res = await window.electronAPI.lines.folders.open(folder.path)
          if (!res || !res.ok) {
            if (window.__lineManagerDialog)
              await window.__lineManagerDialog.alert(res?.error || '打开文件夹失败', '错误')
          }
        } catch (e) {
          console.error('打开文件夹失败:', e)
          if (window.__lineManagerDialog)
            await window.__lineManagerDialog.alert('打开文件夹失败：' + (e.message || e), '错误')
        }
      }
    }

    async function handleContextMenuRename(folderId) {
      closeContextMenu()
      const folder = folders.value.find((f) => f.id === folderId)
      if (folder) await renameFolder(folderId, folder.name)
    }
    async function handleContextMenuDelete(folderId) {
      closeContextMenu()
      const folder = folders.value.find((f) => f.id === folderId)
      if (folder) await deleteFolder(folderId, folder.name, folder.path)
    }

    function showLineContextMenu(event, line) {
      event.preventDefault()
      event.stopPropagation()
      lineContextMenu.value = { visible: true, x: event.clientX, y: event.clientY, line }
      nextTick(() => {
        const menuElement = document.querySelector('[data-line-context-menu]')
        if (!menuElement) return
        const rect = menuElement.getBoundingClientRect()
        const viewportWidth = window.innerWidth
        const viewportHeight = window.innerHeight
        let x = event.clientX
        let y = event.clientY
        if (x + rect.width > viewportWidth) {
          x = event.clientX - rect.width
          if (x < 0) x = Math.max(0, viewportWidth - rect.width - 10)
        }
        if (y + rect.height > viewportHeight) {
          y = event.clientY - rect.height
          if (y < 0) y = Math.max(0, viewportHeight - rect.height - 10)
        }
        if (x < 0) x = 10
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
      if (line.isRuntime) {
        await applyRuntimeLine(line.data)
        return
      }
      if (window.electronAPI?.switchLine) {
        try {
          const result = await window.electronAPI.switchLine(line.name)
          if (result && result.ok) {
            // 不自动关闭线路管理器，方便用户确认主窗口已切换后再手动关闭
          }
        } catch (e) {
          console.error('打开线路失败:', e)
          if (window.__lineManagerDialog)
            await window.__lineManagerDialog.alert('打开线路失败：' + (e.message || e), '错误')
        }
      } else {
        const lineName = line.name
        localStorage.setItem('lineManagerSelectedLine', lineName)
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage({ type: 'switch-line-request', lineName }, '*')
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

    async function renameLine(line) {
      closeLineContextMenu()
      if (!line || !window.electronAPI?.lines || !window.__lineManagerDialog) return
      const currentName = line.name.replace(/<[^>]+>/g, '').replace(/<\/>/g, '')
      const newName = await window.__lineManagerDialog.prompt(t('lineManager.renameLinePrompt'), currentName, t('lineManager.renameLineTitle'))
      if (!newName || newName.trim() === currentName) return
      
      try {
        const folderId = selectedFolderId.value || currentFolderId.value
        const folder = folders.value.find((f) => f.id === folderId)
        const folderPath = folder ? folder.path : null
        const oldFileName = line.filePath || line.name
        
        // 读取原文件内容
        const readRes = await window.electronAPI.lines.read(oldFileName, folderPath)
        if (!(readRes && readRes.ok && readRes.content)) {
          await window.__lineManagerDialog.alert(t('lineManager.readLineError'), t('console.error'))
          return
        }
        
        // 检查新文件名是否已存在
        const listRes = await window.electronAPI.lines.list(folderPath)
        const existingNames = (listRes || []).map((it) => it.name.replace(/\.json$/, ''))
        const newNameTrimmed = newName.trim().replace(/\.json$/, '')
        if (existingNames.includes(newNameTrimmed)) {
          await window.__lineManagerDialog.alert(t('lineManager.lineNameExists'), t('console.error'))
          return
        }
        
        const newFileName = newNameTrimmed + '.json'
        
        // 保存为新文件名
        const saveRes = await window.electronAPI.lines.save(newFileName, readRes.content, folderPath)
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
        await loadLinesFromFolder(folderId)
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

    /** 同目录下生成不重复的线路文件名：xxx、xxx - 副本、xxx - 副本 (2)（不含 .json，与 list 返回的 name 一致） */
    function getUniqueLineFileName(existingFileNames, baseFileName) {
      const base = baseFileName && baseFileName.endsWith('.json') ? baseFileName.slice(0, -5) : (baseFileName || '')
      const toName = (b) => (b.endsWith('.json') ? b.slice(0, -5) : b)
      const names = new Set((existingFileNames || []).map(toName))
      if (!names.has(base)) return base + '.json'
      if (!names.has(base + ' - 副本')) return base + ' - 副本.json'
      let n = 2
      while (names.has(base + ' - 副本 (' + n + ')')) n++
      return base + ' - 副本 (' + n + ').json'
    }

    async function copyFolder(folder) {
      closeContextMenu()
      if (!folder || folder.id === 'default' || folder.id === CLOUD_FOLDER_ID) return
      clipboard.value = {
        type: 'copy',
        line: null,
        folder: { id: folder.id, name: folder.name, path: folder.path },
        sourceFolderId: folder.id,
        sourceFolderPath: folder.path
      }
    }

    async function pasteFolder() {
      closeContextMenu()
      closeSidebarNewMenu()
      if (!clipboard.value.folder || !window.electronAPI?.lines?.folders) return
      const api = window.electronAPI.lines
      const sourcePath = clipboard.value.sourceFolderPath
      const folderName = clipboard.value.folder.name
      const existingNames = folders.value.map((f) => f.name)
      const newName = getUniqueFolderName(existingNames, folderName)
      try {
        const addRes = await api.folders.add(newName)
        if (!addRes || !addRes.ok) {
          if (window.__lineManagerDialog) await window.__lineManagerDialog.alert(addRes?.error || '创建文件夹失败', '错误')
          return
        }
        const newPath = addRes.path
        const rawList = await api.list(sourcePath)
        const items = Array.isArray(rawList) ? rawList : []
        for (const it of items) {
          const fname = it.name || ''
          if (!fname) continue
          const readRes = await api.read(fname, sourcePath)
          if (readRes && readRes.ok && readRes.content) {
            await api.save(fname, readRes.content, newPath)
          }
        }
        await loadFolders()
        selectedFolderId.value = addRes.folderId
        await loadLinesFromFolder(addRes.folderId)
      } catch (e) {
        console.error('粘贴文件夹失败:', e)
        if (window.__lineManagerDialog) await window.__lineManagerDialog.alert('粘贴文件夹失败：' + (e.message || e), '错误')
      }
    }

    async function copyLine(line) {
      closeLineContextMenu()
      const sourceFolderId = line.folderId ?? selectedFolderId.value ?? currentFolderId.value
      const sourceFolder = folders.value.find((f) => f.id === sourceFolderId)
      clipboard.value = { type: 'copy', line, folder: null, sourceFolderId, sourceFolderPath: sourceFolder ? sourceFolder.path : null }
    }
    async function cutLine(line) {
      closeLineContextMenu()
      const sourceFolderId = line.folderId ?? selectedFolderId.value ?? currentFolderId.value
      const sourceFolder = folders.value.find((f) => f.id === sourceFolderId)
      clipboard.value = { type: 'cut', line, folder: null, sourceFolderId, sourceFolderPath: sourceFolder ? sourceFolder.path : null }
    }

    // 新建线路（从备份 FolderLineManagerWindow 迁移逻辑）
    async function createNewLine() {
      if (!window.electronAPI || !window.electronAPI.lines) return
      if (!window.__lineManagerDialog) return

      const lineName = await window.__lineManagerDialog.prompt(
        '请输入新线路名称 (例如: 3号线)',
        '新线路',
        '新建线路'
      )
      if (!lineName || !lineName.trim()) return

      try {
        const folderId = selectedFolderId.value || currentFolderId.value
        const folder = folders.value.find((f) => f.id === folderId)
        if (!folder || !folder.path) {
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
        const fileName = cleanName + '.json'

        const saveRes = await window.electronAPI.lines.save(fileName, newLine, folder.path)
        if (saveRes && saveRes.ok) {
          await loadLinesFromFolder(folderId)
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
        const folderId = selectedFolderId.value || currentFolderId.value
        const folder = folders.value.find((f) => f.id === folderId)
        const folderPath = folder ? folder.path : null
        const res = await window.electronAPI.lines.delete(line.filePath || line.name, folderPath)
        if (res && res.ok) {
          await loadLinesFromFolder(folderId)
        } else if (window.__lineManagerDialog) {
          await window.__lineManagerDialog.alert(res?.error || '删除失败', '错误')
        }
      } catch (e) {
        console.error('删除线路失败:', e)
        if (window.__lineManagerDialog)
          await window.__lineManagerDialog.alert('删除线路失败：' + (e.message || e), '错误')
      }
    }

    async function pasteLine() {
      closeLineContextMenu()
      if (!clipboard.value.line || !window.electronAPI?.lines) return
      const targetFolderId = selectedFolderId.value || currentFolderId.value
      const targetFolder = folders.value.find((f) => f.id === targetFolderId)
      const targetFolderPath = targetFolder ? targetFolder.path : null
      const sourceFolderId = clipboard.value.sourceFolderId
      const sourceFolderPath = clipboard.value.sourceFolderPath
      try {
        const sourceLine = clipboard.value.line
        const sourceFileName = sourceLine.filePath || sourceLine.name
        const readRes = await window.electronAPI.lines.read(sourceFileName, sourceFolderPath)
        if (!(readRes && readRes.ok && readRes.content)) {
          if (window.__lineManagerDialog) await window.__lineManagerDialog.alert('读取源线路失败', '错误')
          return
        }
        let targetFileName = sourceFileName
        if (clipboard.value.type === 'copy' && targetFolderId === sourceFolderId) {
          const listRes = await window.electronAPI.lines.list(targetFolderPath)
          const existingNames = (listRes || []).map((it) => it.name)
          targetFileName = getUniqueLineFileName(existingNames, sourceFileName)
        }
        const saveRes = await window.electronAPI.lines.save(targetFileName, readRes.content, targetFolderPath)
        if (!(saveRes && saveRes.ok)) {
          if (window.__lineManagerDialog)
            await window.__lineManagerDialog.alert(saveRes?.error || '写入目标失败', '错误')
          return
        }
        if (clipboard.value.type === 'cut') {
          await window.electronAPI.lines.delete(sourceFileName, sourceFolderPath)
        }
        await loadLinesFromFolder(targetFolderId)
        if (clipboard.value.type === 'cut' && sourceFolderId !== targetFolderId) {
          await loadLinesFromFolder(sourceFolderId)
        }
        clipboard.value = { type: null, line: null, folder: null, sourceFolderId: null, sourceFolderPath: null }
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
          (f) => f.id !== 'default' && f.name !== '默认' && f.id !== CLOUD_FOLDER_ID && !f.isRuntime
        )
        const activeId = selectedFolderId.value ?? currentFolderId.value
        let folder = folders.value.find((f) => f.id === activeId)
        if (!folder || folder.id === 'default' || folder.id === CLOUD_FOLDER_ID || folder.isRuntime)
          folder = availableFolders[0]
        if (!folder) {
          if (window.__lineManagerDialog)
            await window.__lineManagerDialog.alert('当前没有可用的文件夹，请先新建一个文件夹', '提示')
          return
        }
        await doSaveThroughLine(lineData, cleanLineName, folder)
      } catch (e) {
        console.error('[线路管理器] handleSaveThroughLine 失败:', e)
        if (window.__lineManagerDialog)
          await window.__lineManagerDialog.alert('保存失败：' + (e.message || e), '错误')
      }
    }

    onMounted(async () => {
      await loadFolders()
      await nextTick()
      await checkSaveThroughLineMode()
    })

    const activeFolderId = computed(() => selectedFolderId.value || currentFolderId.value)
    const isCloudFolderActive = computed(() => activeFolderId.value === CLOUD_FOLDER_ID)
    const isDefaultFolderActive = computed(() => activeFolderId.value === 'default')

    const isSearchActive = computed(() => (searchQuery.value || '').trim().length > 0)

    // 搜索过滤后的线路列表：无关键词时显示当前文件夹；有关键词时搜索所有文件夹
    const filteredLines = computed(() => {
      const q = (searchQuery.value || '').trim().toLowerCase()
      if (!q) return currentLines.value
      return allLinesWithFolder.value.filter((line) => {
        const name = stripColorMarkup(line.name || '').toLowerCase()
        const first = (line.firstStation || '').toLowerCase()
        const last = (line.lastStation || '').toLowerCase()
        const folderName = (line.folderName || '').toLowerCase()
        return (
          name.includes(q) ||
          first.includes(q) ||
          last.includes(q) ||
          folderName.includes(q)
        )
      })
    })

    async function locateToFolder(line) {
      if (!line.folderId) return
      await selectFolder(line.folderId)
      searchQuery.value = ''
      await nextTick()
      const match = currentLines.value.find((l) => {
        if (line.isRuntime) {
          return l.isRuntime && l.name === line.name && l.firstStation === line.firstStation && l.lastStation === line.lastStation
        }
        return l.filePath === line.filePath && l.name === line.name
      })
      if (match) selectedLine.value = match
      await nextTick()
      // 延迟执行滚动，确保 DOM 已更新（搜索清除后列表会重新渲染）
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          // 侧边栏：滚动使当前文件夹可见
          const sidebar = sidebarRef.value
          if (sidebar) {
            const activeFolder = sidebar.querySelector('.lmw-folder.active')
            if (activeFolder) {
              const sidebarRect = sidebar.getBoundingClientRect()
              const folderRect = activeFolder.getBoundingClientRect()
              const scrollTop = sidebar.scrollTop + (folderRect.top - sidebarRect.top) - sidebarRect.height / 2 + folderRect.height / 2
              sidebar.scrollTo({ top: Math.max(0, scrollTop), behavior: 'smooth' })
            }
          }
          // 线路列表：滚动使选中线路可见
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
      sidebarRef,
      linesRef,
      currentFolderId,
      currentLines,
      filteredLines,
      searchQuery,
      isSearchActive,
      searchLoading,
      loading,
      selectedFolderId,
      selectedLine,
      activeFolderId,
      contextMenu,
      lineContextMenu,
      sidebarNewMenu,
      linesNewMenu,
      clipboard,
      isSavingThroughLine,
      pendingThroughLineInfo,
      runtimeLoading,
      selectFolder,
      locateToFolder,
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
      renameLine,
      copyLine,
      cutLine,
      pasteLine,
      createNewLine,
      closeWindow,
      handleSaveThroughLine,
      buildLineColor,

      folderMenuItems: computed(() => {
        const canDelete = contextMenu.value.folderId && contextMenu.value.folderId !== 'default'
        const isCloud = contextMenu.value.folderId === CLOUD_FOLDER_ID
        const isDefault = contextMenu.value.folderId === 'default'
        const canCopyFolder = contextMenu.value.folderId && !isCloud && !isDefault
        return [
          { label: t('lineManager.ctxNewFolder'), icon: 'fas fa-folder-plus', action: 'addFolder', disabled: false },
          { type: 'sep' },
          { label: t('lineManager.ctxCopy'), icon: 'fas fa-copy', action: 'copyFolder', disabled: !canCopyFolder },
          { label: t('lineManager.ctxPaste'), icon: 'fas fa-paste', action: 'pasteFolder', disabled: !clipboard.value.folder },
          { type: 'sep' },
          {
            label: t('lineManager.ctxRename'),
            icon: 'fas fa-edit',
            action: 'renameFolder',
            disabled: !contextMenu.value.folderId || isCloud || isDefault
          },
          {
            label: t('lineManager.ctxOpenFolder'),
            icon: 'fas fa-folder-open',
            action: 'openFolder',
            disabled: !contextMenu.value.folderId || isCloud
          },
          ...(canDelete && !isCloud && !isDefault
            ? [{ type: 'sep' }, { label: t('lineManager.ctxDelete'), icon: 'fas fa-trash', action: 'deleteFolder', danger: true }]
            : [])
        ]
      }),
      sidebarNewMenuItems: computed(() => {
        const canPaste = clipboard.value.folder || clipboard.value.type
        return [
          { label: t('lineManager.ctxNewFolder'), icon: 'fas fa-folder-plus', action: 'addFolder', disabled: false },
          ...(canPaste ? [{ type: 'sep' }, { label: t('lineManager.ctxPaste'), icon: 'fas fa-paste', action: 'paste', disabled: false }] : [])
        ]
      }),
      linesNewMenuItems: computed(() => {
        const canPaste = clipboard.value.type || clipboard.value.folder
        const pasteDisabled = isCloudFolderActive.value || isDefaultFolderActive.value || !canPaste
        return [
          {
            label: t('lineManager.ctxNewLine'),
            icon: 'fas fa-plus',
            action: 'createNewLine',
            disabled: isCloudFolderActive.value || isDefaultFolderActive.value
          },
          ...(canPaste ? [{ type: 'sep' }, { label: t('lineManager.ctxPaste'), icon: 'fas fa-paste', action: 'paste', disabled: pasteDisabled }] : [])
        ]
      }),
      lineMenuItems: computed(() => [
        {
          label: t('lineManager.ctxNewLine'),
          icon: 'fas fa-plus',
          action: 'createNewLine',
          disabled: isCloudFolderActive.value || isDefaultFolderActive.value
        },
        { type: 'sep' },
        { label: t('lineManager.ctxOpen'), icon: 'fas fa-folder-open', action: 'openLine' },
        {
          label: t('lineManager.ctxRename'),
          icon: 'fas fa-edit',
          action: 'renameLine',
          disabled: isCloudFolderActive.value || isDefaultFolderActive.value
        },
        { type: 'sep' },
        {
          label: t('lineManager.ctxCopy'),
          icon: 'fas fa-copy',
          action: 'copyLine',
          disabled: isCloudFolderActive.value
        },
        {
          label: t('lineManager.ctxCut'),
          icon: 'fas fa-cut',
          action: 'cutLine',
          disabled: isCloudFolderActive.value || isDefaultFolderActive.value
        },
        {
          label: t('lineManager.ctxPaste'),
          icon: 'fas fa-paste',
          action: 'pasteLine',
          disabled: isCloudFolderActive.value || isDefaultFolderActive.value || !clipboard.value.type
        },
        { type: 'sep' },
        {
          label: t('lineManager.ctxDelete'),
          icon: 'fas fa-trash',
          action: 'deleteLine',
          danger: true,
          disabled: isCloudFolderActive.value || isDefaultFolderActive.value
        }
      ]),
      async onFolderMenuSelect(it) {
        if (!it) return
        const isCloud = contextMenu.value.folderId === CLOUD_FOLDER_ID
        const isDefault = contextMenu.value.folderId === 'default'
        if (isCloud && ['createNewLine', 'renameFolder', 'deleteFolder'].includes(it.action)) {
          await dialogService.alert('云控线路只支持应用，不支持在此新建或编辑。', '提示')
          return
        }
        if (isDefault && ['createNewLine', 'renameFolder', 'deleteFolder'].includes(it.action)) {
          await dialogService.alert('默认文件夹为只读，无法在此新建或编辑。', '提示')
          return
        }
        if (it.action === 'addFolder') return await addFolder()
        if (it.action === 'copyFolder') {
          const folder = folders.value.find((f) => f.id === contextMenu.value.folderId)
          if (folder) return await copyFolder(folder)
          return
        }
        if (it.action === 'pasteFolder') return await pasteFolder()
        if (it.action === 'createNewLine') return await createNewLine()
        if (it.action === 'renameFolder') return await handleContextMenuRename(contextMenu.value.folderId)
        if (it.action === 'openFolder') return await openFolderInExplorer(contextMenu.value.folderId)
        if (it.action === 'deleteFolder') return await handleContextMenuDelete(contextMenu.value.folderId)
      },
      async onSidebarNewMenuSelect(it) {
        if (!it) return
        if (it.action === 'addFolder') return await addFolder()
        if (it.action === 'paste') {
          if (clipboard.value.folder) return await pasteFolder()
          if (clipboard.value.line) return await pasteLine()
        }
      },
      async onLinesNewMenuSelect(it) {
        if (!it) return
        if (isCloudFolderActive.value && ['addFolder', 'createNewLine', 'paste'].includes(it.action)) {
          await dialogService.alert('云控线路只支持应用，不支持在此新建或编辑。', '提示')
          return
        }
        if (isDefaultFolderActive.value && ['addFolder', 'createNewLine', 'paste'].includes(it.action)) {
          await dialogService.alert('默认文件夹为只读，无法在此新建或编辑。', '提示')
          return
        }
        if (it.action === 'addFolder') return await addFolder()
        if (it.action === 'createNewLine') return await createNewLine()
        if (it.action === 'paste') {
          if (clipboard.value.folder) return await pasteFolder()
          if (clipboard.value.line) return await pasteLine()
        }
      },
      async onLineMenuSelect(it) {
        if (!it) return
        const line = lineContextMenu.value.line
        // 云控线路：只允许“打开”
        if (isCloudFolderActive.value && it.action !== 'openLine') {
          await dialogService.alert('云控线路只支持应用，不支持在此新建、复制或删除。', '提示')
          return
        }
        // 默认文件夹：只读，只允许“打开”和“复制”
        if (isDefaultFolderActive.value && it.action !== 'openLine' && it.action !== 'copyLine') {
          await dialogService.alert('默认文件夹为只读，只支持打开、复制线路。', '提示')
          return
        }
        if (it.action === 'addFolder') return await addFolder()
        if (it.action === 'createNewLine') return await createNewLine()
        if (it.action === 'openLine') return await openLine(line)
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
      <div v-if="folders.length > 0 && selectedFolderId" class="lmw-titlebar-search">
        <div class="lmw-search-inner">
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
            aria-label="清除"
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
      <aside ref="sidebarRef" v-if="folders.length > 0" class="lmw-sidebar" @contextmenu.prevent="showSidebarNewMenu($event)">
        <div class="lmw-sidebar-inner">
          <button
            v-for="folder in folders"
            :key="folder.id"
            class="lmw-folder"
            :class="{
              active: selectedFolderId === folder.id,
              disabled: isSavingThroughLine && (folder.id === 'default' || folder.id === 'runtime-cloud')
            }"
            @click="(isSavingThroughLine && (folder.id === 'default' || folder.id === 'runtime-cloud')) ? null : selectFolder(folder.id)"
            @contextmenu.prevent.stop="showContextMenu($event, folder)"
          >
            <i class="fas fa-folder" />
            <span class="lmw-folder-name">{{ folder.name }}</span>
          </button>
        </div>
      </aside>

      <section class="lmw-content">
        <header v-if="folders.length > 0 && selectedFolderId" class="lmw-content-header">
          <span>{{ t('lineManager.currentFolder') }}：</span>
          <strong>{{ folders.find(f => f.id === selectedFolderId)?.name || selectedFolderId }}</strong>
        </header>

        <div ref="linesRef" class="lmw-lines" @contextmenu.prevent="showLinesNewMenu($event)">
          <div v-if="loading || runtimeLoading || (isSearchActive && searchLoading)" class="lmw-loading">...</div>
          <div v-else-if="!isSearchActive && currentLines.length === 0" class="lmw-empty">
            {{ activeFolderId === 'runtime-cloud' ? t('lineManager.emptyCloudLines') : t('lineManager.emptyFolder') }}
          </div>
          <div v-else-if="isSearchActive && filteredLines.length === 0" class="lmw-empty">
            <i class="fas fa-search" style="font-size:32px; color:var(--muted); margin-bottom:12px;"></i>
            <span>{{ t('lineManager.noSearchResult') }}</span>
            <span class="lmw-search-hint">{{ t('lineManager.searchResultHint') }}</span>
          </div>

          <button
            v-for="(line, idx) in filteredLines"
            :key="(line.folderId || '') + '-' + (line.filePath || line.name) + '-' + idx"
            class="lmw-line"
            :class="{ selected: selectedLine === line }"
            @click="toggleLineSelection(line)"
            @dblclick="openLine(line)"
            @contextmenu.prevent.stop="showLineContextMenu($event, line)"
          >
            <div class="lmw-line-main">
              <div class="lmw-line-title" v-html="parseColorMarkup(line.name)"></div>
              <div class="lmw-line-meta">
                <span v-if="line.isThroughLine" class="lmw-tag through">贯通</span>
                <span v-if="line.isLoopLine" class="lmw-tag loop">环线</span>
                <span class="lmw-stations">
                  {{ line.firstStation }} → {{ line.lastStation }}
                  <span v-if="line.isRuntime">（云控 {{ line.stationCount || line.data?.stations?.length || 0 }} 站）</span>
                </span>
                <span v-if="isSearchActive && line.folderName" class="lmw-line-folder">
                  <i class="fas fa-folder"></i> {{ line.folderName }}
                  <button
                    type="button"
                    class="lmw-locate-btn"
                    @click.stop="locateToFolder(line)"
                    :title="t('lineManager.locate')"
                  >
                    {{ t('lineManager.locate') }}
                  </button>
                </span>
              </div>
            </div>
            <div class="lmw-line-color" :style="{ background: line.themeColor || '#5F27CD' }"></div>
          </button>
        </div>

        <!-- 底部操作栏：仅在保存贯通线路时显示，橙色「保存贯通线路」按钮 -->
        <div v-if="isSavingThroughLine" class="lmw-bottom-bar">
          <div class="lmw-bottom-bar-left">
            <span class="lmw-bottom-bar-muted">{{ t('lineManager.savingToPrefix') }}{{ (folders.find(f => f.id === (selectedFolderId ?? currentFolderId)))?.name || '—' }}</span>
          </div>
          <div class="lmw-bottom-bar-right">
            <button type="button" class="lmw-btn lmw-btn-through" @click="handleSaveThroughLine">
              <i class="fas fa-save"></i>
              <span>{{ t('lineManager.throughSaveButton') }}</span>
            </button>
          </div>
        </div>
      </section>
      </div>
    </div>

    <!-- 各类右键菜单统一用 ContextMenu 渲染 -->
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

    <!-- 独立对话框组件，用于右键菜单中的提示/输入（window.__lineManagerDialog） -->
    <LineManagerDialog />
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
}
.lmw-main-body {
  flex: 1;
  display: flex;
  overflow: hidden;
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
  background: #fff;
  overflow: hidden;
}
.lmw-content-header {
  padding: 12px 16px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
  background: #fafafa;
  color: var(--muted, #666);
  font-size: 13px;
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
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
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
  border: 1px solid rgba(0, 0, 0, 0.08);
  background: #fff;
  border-radius: 12px;
  padding: 12px;
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  position: relative;
}
.lmw-line:hover {
  background: #fafafa;
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
}
.lmw-line-meta {
  margin-top: 4px;
  display: flex;
  align-items: center;
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
.lmw-stations {
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
  width: 10px;
  height: 42px;
  border-radius: 999px;
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
  background: rgba(10, 14, 18, 0.90);
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
  background: rgba(255, 255, 255, 0.04);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  color: var(--muted, rgba(230, 238, 246, 0.65));
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
}
html.dark .lmw-line {
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(255, 255, 255, 0.10);
}
html.dark .lmw-line:hover {
  background: rgba(255, 255, 255, 0.07);
}
html.dark .lmw-line.selected {
  border-color: rgba(64, 156, 255, 0.9);
  box-shadow: 0 0 0 2px rgba(64, 156, 255, 0.55);
  background: rgba(25, 118, 210, 0.35);
}
html.dark .lmw-line.selected::before {
  background: linear-gradient(180deg, #40a9ff, #69c0ff);
}
html.dark .lmw-line-meta {
  color: var(--muted, rgba(230, 238, 246, 0.62));
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

