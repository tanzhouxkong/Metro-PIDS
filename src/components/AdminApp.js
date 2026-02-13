import { ref, computed, nextTick, watch } from 'vue'
import { Teleport } from 'vue'
import { usePidsState } from '../composables/usePidsState.js'
import { useController } from '../composables/useController.js'
import { useFileIO } from '../composables/useFileIO.js'
import StationEditor from './StationEditor.vue'
import dialogService from '../utils/dialogService.js'

export default {
  name: 'AdminApp',
  components: { StationEditor, Teleport },
  setup() {
    const { state } = usePidsState()
    const { sync, next, move, setArr, setDep, jumpTo, getStep } = useController()
    
    const showEditor = ref(false)
    const editingStation = ref({})
    const editingIndex = ref(-1)
    const isNewStation = ref(false)
    const draggingIndex = ref(-1)
    const dragOverIndex = ref(-1)
    const listRef = ref(null)
    const routeTextRef = ref(null)
    
    // 右键菜单状态
    const stationContextMenu = ref({ visible: false, x: 0, y: 0, station: null, index: -1 })
    
    // 剪贴板状态（用于复制/剪贴站点）
    const clipboard = ref({ type: null, station: null, index: -1 })

    function onDragStart(e, index) {
        draggingIndex.value = index
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.dropEffect = 'move'
        // Firefox 兼容处理
        e.dataTransfer.setData('text/plain', index)
    }

    function onDragEnter(e, index) {
        if (index !== draggingIndex.value) {
            dragOverIndex.value = index
        }
    }

    function onDragLeave() {
        dragOverIndex.value = -1
    }

    function onDragEnd() {
        draggingIndex.value = -1
        dragOverIndex.value = -1
    }

    function onDragOver(e) {
        e.preventDefault()
        if (listRef.value) {
            const el = listRef.value
            const rect = el.getBoundingClientRect()
            const threshold = 60
            if (e.clientY < rect.top + threshold) {
                el.scrollTop -= 10
            } else if (e.clientY > rect.bottom - threshold) {
                el.scrollTop += 10
            }
        }
    }
    
    function onDrop(e, index) {
        e.preventDefault()
        const from = draggingIndex.value
        const to = index
        
        draggingIndex.value = -1
        dragOverIndex.value = -1

        if (from === -1 || from === to) return
        
        const stations = state.appData.stations
        const currentStation = stations[state.rt.idx] // 记录当前站对象
        
        // 移动元素
        const item = stations.splice(from, 1)[0]
        stations.splice(to, 0, item)
        
        // 根据活动站的新位置恢复索引
        const newIdx = stations.indexOf(currentStation)
        if (newIdx !== -1) state.rt.idx = newIdx
        
        sync()
    }

    function openEditor(index) {
        if (index === -1) {
            // 新增站点
            editingStation.value = { name: '', en: '', skip: false, door: 'left', dock: 'both', xfer: [], expressStop: false }
            editingIndex.value = -1
            isNewStation.value = true
        } else {
            // 编辑已有站点
            editingStation.value = JSON.parse(JSON.stringify(state.appData.stations[index]))
            editingIndex.value = index
            isNewStation.value = false
        }
        // 注意：从右键菜单触发时，click 事件可能在同一轮冒泡中立刻命中遮罩 @click.self 导致“打开又关闭”
        // 这里延迟到下一轮事件循环再打开，避免被当前 click 冒泡关闭
        setTimeout(() => {
            showEditor.value = true
        }, 0)
    }

    const fileIO = useFileIO(state)

    async function saveStation(data) {
        if (editingIndex.value === -1) {
            // 如果 editingIndex 是 -1，说明是从"新建站点"按钮调用的，添加到末尾
            state.appData.stations.push(data)
        } else if (editingIndex.value >= 0 && editingIndex.value < state.appData.stations.length) {
            // 如果 editingIndex 是有效索引，说明是编辑已有站点
            state.appData.stations[editingIndex.value] = data
        } else {
            // 如果 editingIndex 超出范围，说明是从右键菜单"新建"调用的，插入到指定位置
            const insertIndex = editingIndex.value >= state.appData.stations.length 
                ? state.appData.stations.length 
                : editingIndex.value
            state.appData.stations.splice(insertIndex, 0, data)
            // 更新当前索引
            if (state.rt.idx >= insertIndex) {
                state.rt.idx++
            }
        }
        // 同一线路内同名换乘线路颜色同步：更改某一站某条换乘线颜色后，本线路所有站点的同名换乘线同步该颜色
        if (data.xfer && Array.isArray(data.xfer)) {
            const stations = state.appData.stations
            data.xfer.forEach((savedXfer) => {
                const lineName = (savedXfer.line || '').trim()
                const color = savedXfer.color
                if (!lineName || !color) return
                stations.forEach((st) => {
                    if (!st.xfer || !Array.isArray(st.xfer)) return
                    st.xfer.forEach((xf) => {
                        if ((xf.line || '').trim() === lineName) {
                            xf.color = color
                        }
                    })
                })
            })
        }
        try {
            console.log('[AdminApp] saveStation - calling sync with', data);
            sync()
            // 若在 Electron 环境则尝试落盘
            try {
                await fileIO.saveCurrentLine({ silent: true })
            } catch (e) {
                console.warn('[AdminApp] fileIO.saveCurrentLine failed', e)
            }
        } catch (e) {
            console.error('[AdminApp] sync failed in saveStation', e);
        } finally {
            showEditor.value = false
            editingIndex.value = -1
            console.log('[AdminApp] saveStation - editor closed');
        }
    }

    async function deleteStation(index) {
        const ok = await dialogService.confirm('确定删除该站点吗？', '确认');

        if (ok) {
            state.appData.stations.splice(index, 1)
            if (state.rt.idx >= state.appData.stations.length) state.rt.idx = 0
            sync()
            // 保存到文件（站点编辑相关操作不弹系统通知）
            try {
                await fileIO.saveCurrentLine({ silent: true })
            } catch (e) {
                console.warn('[AdminApp] fileIO.saveCurrentLine failed', e)
            }
        }
    }
    
    // 显示站点右键菜单
    function showStationContextMenu(event, station, index) {
        event.preventDefault()
        event.stopPropagation()
        
        stationContextMenu.value = {
            visible: true,
            x: event.clientX,
            y: event.clientY,
            station: station,
            index: index
        }
        
        // 使用 nextTick 在菜单渲染后调整位置，确保菜单不被裁剪
        nextTick(() => {
            const menuElement = document.querySelector('[data-station-context-menu]')
            if (menuElement) {
                const rect = menuElement.getBoundingClientRect()
                const viewportWidth = window.innerWidth
                const viewportHeight = window.innerHeight
                
                let x = event.clientX
                let y = event.clientY
                
                // 如果菜单会在右侧被截断，调整到左侧
                if (x + rect.width > viewportWidth) {
                    x = event.clientX - rect.width
                }
                
                // 如果菜单会在底部被截断，调整到上方
                if (y + rect.height > viewportHeight) {
                    y = event.clientY - rect.height
                }
                
                // 确保不会超出左边界
                if (x < 0) x = 10
                
                // 确保不会超出上边界
                if (y < 0) y = 10
                
                // 更新位置
                stationContextMenu.value.x = x
                stationContextMenu.value.y = y
            }
        })
    }
    
    // 关闭站点右键菜单
    function closeStationContextMenu() {
        stationContextMenu.value.visible = false
    }
    
    // 新建站点（从右键菜单）
    function newStationFromMenu() {
        const targetIndex = stationContextMenu.value.index >= 0 
            ? stationContextMenu.value.index + 1 
            : state.appData.stations.length
        closeStationContextMenu()
        // 设置插入位置
        editingIndex.value = targetIndex
        editingStation.value = { name: '', en: '', skip: false, door: 'left', dock: 'both', xfer: [], expressStop: false }
        isNewStation.value = true
        // 同 openEditor：避免与菜单 click 冒泡冲突导致立刻关闭
        setTimeout(() => {
            showEditor.value = true
        }, 0)
    }
    
    // 复制站点
    function copyStation() {
        closeStationContextMenu()
        const index = stationContextMenu.value.index
        if (index >= 0 && state.appData.stations[index]) {
            clipboard.value = {
                type: 'copy',
                station: JSON.parse(JSON.stringify(state.appData.stations[index])),
                index: index
            }
        }
    }
    
    // 剪切站点
    function cutStation() {
        closeStationContextMenu()
        const index = stationContextMenu.value.index
        if (index >= 0 && state.appData.stations[index]) {
            clipboard.value = {
                type: 'cut',
                station: JSON.parse(JSON.stringify(state.appData.stations[index])),
                index: index
            }
        }
    }
    
    // 粘贴站点
    async function pasteStation() {
        closeStationContextMenu()
        if (!clipboard.value.station) return
        
        const targetIndex = stationContextMenu.value.index >= 0 
            ? stationContextMenu.value.index + 1 
            : state.appData.stations.length
        
        // 如果是剪切操作，需要先处理源站点
        if (clipboard.value.type === 'cut') {
            const sourceIndex = clipboard.value.index
            
            // 如果源索引和目标索引相同，不执行操作
            if (sourceIndex === targetIndex - 1) {
                clipboard.value = { type: null, station: null, index: -1 }
                return
            }
            
            // 先删除源站点
            state.appData.stations.splice(sourceIndex, 1)
            
            // 调整目标索引（如果目标在源之后，需要减1）
            const adjustedTargetIndex = targetIndex > sourceIndex ? targetIndex - 1 : targetIndex
            
            // 插入站点到目标位置
            state.appData.stations.splice(adjustedTargetIndex, 0, JSON.parse(JSON.stringify(clipboard.value.station)))
            
            // 更新当前索引
            const currentIdx = state.rt.idx
            if (sourceIndex < currentIdx && adjustedTargetIndex > currentIdx) {
                // 源在当前位置之前，目标在当前位置之后，索引-1
                state.rt.idx--
            } else if (sourceIndex > currentIdx && adjustedTargetIndex <= currentIdx) {
                // 源在当前位置之后，目标在当前位置之前或相同，索引+1
                state.rt.idx++
            } else if (sourceIndex === currentIdx) {
                // 源就是当前位置，移动到目标位置
                state.rt.idx = adjustedTargetIndex
            }
        } else {
            // 复制操作，直接插入
            state.appData.stations.splice(targetIndex, 0, JSON.parse(JSON.stringify(clipboard.value.station)))
            
            // 更新当前索引
            if (state.rt.idx >= targetIndex) {
                state.rt.idx++
            }
        }
        
        sync()
        
        // 保存到文件（站点编辑相关操作不弹系统通知）
        try {
            await fileIO.saveCurrentLine({ silent: true })
        } catch (e) {
            console.warn('[AdminApp] fileIO.saveCurrentLine failed', e)
        }
        
        // 如果是剪切操作，清除剪贴板
        if (clipboard.value.type === 'cut') {
            clipboard.value = { type: null, station: null, index: -1 }
        }
    }
    
    // 编辑站点（从右键菜单）
    function editStationFromMenu() {
        const index = stationContextMenu.value.index
        if (index >= 0) {
            closeStationContextMenu()
            openEditor(index)
        }
    }
    
    // 删除站点（从右键菜单）
    async function deleteStationFromMenu() {
        const index = stationContextMenu.value.index
        if (index >= 0) {
            closeStationContextMenu()
            await deleteStation(index)
        }
    }

    // 头部信息的计算属性
    const currentStation = computed(() => {
        if (!state.appData || !state.appData.stations) return {}
        return state.appData.stations[state.rt.idx] || {}
    })

    // 生成路线信息格式：【首站··· 上一站→当前站→下一站··· 末站】
    const stationRouteInfo = computed(() => {
        if (!state.appData || !state.appData.stations) return ''
        const s = state.appData.stations
        if (s.length === 0) return ''
        
        const meta = state.appData.meta || {}
        const dirType = meta.dirType || 'up'
        const currentIdx = state.rt.idx
        
        // 确定首站和末站
        let firstIdx, lastIdx
        if (meta.startIdx !== undefined && meta.startIdx !== -1 && meta.termIdx !== undefined && meta.termIdx !== -1) {
            // 有短交路设置
            if (dirType === 'up' || dirType === 'outer') {
                firstIdx = meta.startIdx
                lastIdx = meta.termIdx
            } else {
                firstIdx = meta.termIdx
                lastIdx = meta.startIdx
            }
        } else {
            // 没有短交路设置
            if (dirType === 'up' || dirType === 'outer') {
                firstIdx = 0
                lastIdx = s.length - 1
            } else {
                firstIdx = s.length - 1
                lastIdx = 0
            }
        }
        
        const firstSt = s[firstIdx]
        const lastSt = s[lastIdx]
        const currentSt = s[currentIdx]
        
        if (!firstSt || !lastSt || !currentSt) return currentSt?.name || ''
        
        // 获取上一站和下一站
        const step = getStep()
        const prevIdx = currentIdx - step
        const nextIdx = currentIdx + step
        
        const prevSt = (prevIdx >= 0 && prevIdx < s.length) ? s[prevIdx] : null
        const nextSt = (nextIdx >= 0 && nextIdx < s.length) ? s[nextIdx] : null
        
        // 构建显示 HTML 字符串，每个站点用不同颜色的背景，文字为白色
        let result = ''
        const isFirst = currentIdx === firstIdx
        const isLast = currentIdx === lastIdx
        
        // 检测深色模式
        const isDarkMode = document.documentElement.classList.contains('dark') || 
                          document.documentElement.getAttribute('data-theme') === 'dark' ||
                          window.matchMedia('(prefers-color-scheme: dark)').matches
        
        // 统一的标签样式基础 - 与应用整体风格一致
        const tagBaseStyle = isDarkMode
            ? 'display: inline-block; color: #fff; padding: 4px 12px; border-radius: 6px; font-weight: 500; font-size: 13px; line-height: 1.4; margin: 0 3px; box-shadow: 0 2px 6px rgba(0,0,0,0.25);'
            : 'display: inline-block; color: #fff; padding: 4px 12px; border-radius: 6px; font-weight: 500; font-size: 13px; line-height: 1.4; margin: 0 3px; box-shadow: 0 2px 6px rgba(0,0,0,0.12);'
        
        // 箭头和省略号颜色 - 使用应用的 muted
        const arrowColor = isDarkMode ? '#9aa6b2' : '#8e8e93'
        const ellipsisColor = isDarkMode ? '#9aa6b2' : '#8e8e93'
        
        // 首站/末站 - 中性灰，与 var(--muted) 协调
        const firstStationBg = isDarkMode ? '#5a6572' : '#8e8e93'
        
        // 如果当前站是首站，显示"始发"，否则显示首站名称
        if (isFirst) {
            result += `<span style="${tagBaseStyle} background: ${firstStationBg};">始发</span>`
        } else {
            // 显示首站名称（深灰色背景）
            result += `<span style="${tagBaseStyle} background: ${firstStationBg};">${firstSt.name}</span>`
        }
        
        // 判断是否需要显示省略号和上一站
        const needPrevSection = !isFirst
        // 判断是否是第二站（首站的下一个站）
        const isSecond = (step > 0 && currentIdx === firstIdx + 1) || (step < 0 && currentIdx === firstIdx - 1)
        
        if (needPrevSection) {
            // 如果不是第二站，显示省略号
            if (!isSecond) {
                result += `<span style="color: ${ellipsisColor}; margin: 0 6px; font-size: 12px;">···</span>`
            }
            // 上一站 - 应用主色 #FF9F43（线路管理、确认弹窗）
            const prevStationBg = isDarkMode ? '#e8923d' : '#FF9F43'
            
            // 上一站（如果存在且不是首站）
            if (prevSt && prevSt.name && prevIdx !== firstIdx) {
                result += `<span style="${tagBaseStyle} background: ${prevStationBg};">${prevSt.name}</span>`
            }
        }
        
        // 当前站 - 应用主色 accent #00b894（品牌色）
        const currentStationBg = isDarkMode ? '#22c1a3' : '#00b894'
        const currentStationShadow = isDarkMode
            ? '0 2px 8px rgba(34, 193, 163, 0.4)'
            : '0 2px 8px rgba(0, 184, 148, 0.35)'
        
        // 箭头和当前站（深蓝色背景，白色文字，突出显示，id 用于滚动到可见）
        result += `<span style="color: ${arrowColor}; margin: 0 4px; font-size: 14px; font-weight: 400;">→</span><span id="admin-route-current-station" style="${tagBaseStyle} background: ${currentStationBg}; font-weight: 700; font-size: 14px; box-shadow: ${currentStationShadow};">${currentSt.name}</span>`
        
        // 判断是否需要显示下一站和省略号
        const needNextSection = !isLast
        // 判断是否是倒数第二站（末站的前一个站）
        const isSecondLast = (step > 0 && currentIdx === lastIdx - 1) || (step < 0 && currentIdx === lastIdx + 1)
        
        if (needNextSection) {
            // 下一站 - 应用主色 #2ED573（成功、应用按钮）
            const nextStationBg = isDarkMode ? '#27d16a' : '#2ED573'
            
            // 下一站（如果存在且不是末站）
            if (nextSt && nextSt.name && nextIdx !== lastIdx) {
                result += `<span style="color: ${arrowColor}; margin: 0 4px; font-size: 14px; font-weight: 400;">→</span><span style="${tagBaseStyle} background: ${nextStationBg};">${nextSt.name}</span>`
            }
            // 如果不是倒数第二站，显示省略号
            if (!isSecondLast) {
                result += `<span style="color: ${ellipsisColor}; margin: 0 6px; font-size: 12px;">···</span>`
            }
            // 显示末站名称（深灰色背景）
            // 如果是倒数第二站，下一站就是末站，需要显示箭头
            if (isSecondLast) {
                result += `<span style="color: ${arrowColor}; margin: 0 4px; font-size: 14px; font-weight: 400;">→</span>`
            }
            result += `<span style="${tagBaseStyle} background: ${firstStationBg};">${lastSt.name}</span>`
        } else {
            // 当前站是末站，显示"终到"，前面不需要箭头
            result += `<span style="${tagBaseStyle} background: ${firstStationBg};">终到</span>`
        }
        
        return result
    })

    // 当前站变化时滚动顶栏使当前站可见（第三站及以后跟随显示）
    watch(() => state.rt?.idx, () => {
        nextTick(() => {
            requestAnimationFrame(() => {
                const el = document.getElementById('admin-route-current-station')
                if (el && routeTextRef.value) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
                }
            })
        })
    }, { immediate: true })

    const routeInfo = computed(() => {
        if (!state.appData || !state.appData.stations) return ''
        const s = state.appData.stations
        if (s.length < 2) return ''
        
        const meta = state.appData.meta || {}
        const dirType = meta.dirType || 'up'
        
        let firstSt, lastSt
        
        // 根据短交路设置和方向确定首末站
        if (meta.startIdx !== undefined && meta.startIdx !== -1 && meta.termIdx !== undefined && meta.termIdx !== -1) {
            // 有短交路设置：根据方向确定首末站
            const startIdx = meta.startIdx
            const termIdx = meta.termIdx
            if (dirType === 'up' || dirType === 'outer') {
                // 上行/外环：首站 = startIdx，末站 = termIdx
                firstSt = s[startIdx]
                lastSt = s[termIdx]
            } else {
                // 下行/内环：首站 = termIdx，末站 = startIdx（方向相反）
                firstSt = s[termIdx]
                lastSt = s[startIdx]
            }
        } else {
            // 没有短交路设置：根据方向确定首末站
            // 直接使用索引，显示完整的路线范围（包括所有站点）
            const firstIdx = 0
            const lastIdx = s.length - 1
            if (dirType === 'up' || dirType === 'outer') {
                // 上行/外环：首站 = 第一个，末站 = 最后一个
                firstSt = s[firstIdx]
                lastSt = s[lastIdx]
            } else {
                // 下行/内环：首站 = 最后一个，末站 = 第一个（方向相反）
                firstSt = s[lastIdx]
                lastSt = s[firstIdx]
            }
        }
        
        if (!firstSt || !lastSt) return ''
        return `${firstSt.name} → ${lastSt.name}`
    })

    const statusDesc = computed(() => {
        if (!state.appData) return ''
        const prevIdx = state.rt.idx - getStep()
        const prevName = (state.appData.stations[prevIdx]) ? state.appData.stations[prevIdx].name : '始发'
        return `${prevName} → ${currentStation.value.name || ''}`
    })

    const serviceModeLabel = computed(() => {
        const mode = (state.appData.meta && state.appData.meta.serviceMode) ? state.appData.meta.serviceMode : 'normal';
        if (mode === 'express') return '大站车';
        if (mode === 'direct') return '直达';
        return '普通';
    })

    // 检查是否到达终点站的辅助函数
    function isAtTerminal() {
        if (!state.appData || !state.appData.stations || state.appData.stations.length === 0) return false;
        const meta = state.appData.meta || {};
        const stations = state.appData.stations;
        const len = stations.length;
        const currentIdx = state.rt.idx;
        
        // 环线模式没有终点站
        if (meta.mode === 'loop') return false;
        
        // 计算短交路可运行区间
        const sIdx = (meta.startIdx !== undefined && meta.startIdx !== -1) ? parseInt(meta.startIdx) : 0;
        const eIdx = (meta.termIdx !== undefined && meta.termIdx !== -1) ? parseInt(meta.termIdx) : len - 1;
        const minIdx = Math.min(sIdx, eIdx);
        const maxIdx = Math.max(sIdx, eIdx);
        
        // 判断方向
        const step = getStep();
        const terminalIdx = step > 0 ? maxIdx : minIdx;
        
        // 检查是否在终点站
        return currentIdx === terminalIdx;
    }

    // 包装 next 函数，添加终点站检查
    async function handleNext() {
        // 检查是否在终点站
        if (isAtTerminal()) {
            // 如果在终点站，无论什么状态，提示用户已到达终点站
            await dialogService.alert('已到达终点站', '提示');
            return;
        }
        
        // 否则正常执行 next 操作
        next();
    }

        return {
            state,
            next: handleNext, move, setArr, setDep, jumpTo,
            showEditor, editingStation, editingIndex, isNewStation,
            openEditor, saveStation, deleteStation,
            currentStation, routeInfo, statusDesc, serviceModeLabel, stationRouteInfo, routeTextRef,
            onDragStart, onDragOver, onDrop, onDragEnter, onDragEnd, onDragLeave, draggingIndex, dragOverIndex, listRef,
            stationContextMenu, clipboard,
            showStationContextMenu, closeStationContextMenu,
            newStationFromMenu, copyStation, cutStation, pasteStation,
            editStationFromMenu, deleteStationFromMenu
        }
  },
  template: `
    <div id="admin-app-vue" style="flex:1; display:flex; flex-direction:column; height:100%; overflow:hidden; padding:20px; gap:20px; background:var(--bg);">
        
        <!-- Header Info Card（与 PIDS 控制台卡片样式一致） -->
        <div class="card admin-header-card">
            <div class="admin-header-inner">
                <div ref="routeTextRef" class="admin-route-text" v-html="stationRouteInfo"></div>
                <div class="admin-header-right">
                    <div class="badge admin-badge-arrdep" :class="state.rt.state === 0 ? 'arr' : 'dep'">
                        {{ state.rt.state === 0 ? $t('consoleButtons.arrive') : $t('consoleButtons.depart') }}
                    </div>
                    <div class="admin-mode-group">
                        <span class="admin-mode-label">运营模式</span>
                        <span class="admin-mode-value" :class="{ express: serviceModeLabel === '大站车', direct: serviceModeLabel === '直达' }">
                            {{ serviceModeLabel }}
                        </span>
                    </div>
                </div>
            </div>
        </div>

        <!-- Controls -->
        <div style="display:grid; grid-template-columns:repeat(5, 1fr); gap:12px;">
            <button class="btn b-gray" style="height:48px; font-size:14px;" @click="move(-1)"><i class="fas fa-chevron-left"></i> {{ $t('consoleButtons.prevStation') }}</button>
            <button class="btn b-org" style="height:48px; font-size:14px;" @click="setArr()"><i class="fas fa-sign-in-alt"></i> {{ $t('consoleButtons.arrive') }}</button>
            <button class="btn b-blue" style="height:48px; font-size:14px;" @click="setDep()"><i class="fas fa-sign-out-alt"></i> {{ $t('consoleButtons.depart') }}</button>
            <button class="btn b-gray" style="height:48px; font-size:14px;" @click="move(1)">{{ $t('consoleButtons.nextStation') }} <i class="fas fa-chevron-right"></i></button>
            <button class="btn b-red" style="height:48px; font-size:14px;" @click="next()"><i class="fas fa-step-forward"></i> {{ $t('consoleButtons.nextStep') }}</button>
        </div>

        <!-- Station List Header（与 PIDS 控制台区块标题一致） -->
        <div class="admin-section-header">
            <div class="admin-section-title">{{ $t('lineManager.stationManager') }}</div>
            <div class="admin-section-hint">
                <i class="fas fa-info-circle"></i>
                <span>{{ $t('lineManager.stationManagerHint') }}</span>
            </div>
        </div>

        <!-- Station List（与顶栏卡片同一套卡片样式） -->
        <div class="card admin-station-card">
            <div class="st-list" ref="listRef" style="flex:1; overflow-y:auto; padding:0;" @dragover="onDragOver($event)" @contextmenu.prevent="showStationContextMenu($event, null, -1)">
                <div v-if="state.appData && state.appData.stations" 
                     v-for="(st, i) in state.appData.stations" 
                     :key="i" 
                     class="item" 
                     :class="{ active: i === state.rt.idx }"
                     :style="{
                        padding: '14px 16px',
                        borderBottom: (i < state.appData.stations.length - 1) ? '1px solid var(--divider)' : 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'default',
                        transition: 'background 0.2s, border-color 0.2s',
                        opacity: i === draggingIndex ? 0.5 : 1,
                        borderTop: (i === dragOverIndex && i < draggingIndex) ? '2px solid var(--accent)' : 'none',
                        borderBottom: (i === dragOverIndex && i > draggingIndex) ? '2px solid var(--accent)' : ((i < state.appData.stations.length - 1) ? '1px solid var(--divider)' : 'none'),
                        background: (i === state.rt.idx) ? 'rgba(22, 119, 255, 0.08)' : ((i === dragOverIndex) ? 'rgba(255, 255, 255, 0.05)' : 'transparent'),
                        borderLeft: (i === state.rt.idx) ? '4px solid var(--btn-blue-bg)' : '4px solid transparent'
                     }"
                     draggable="true"
                     @dragstart="onDragStart($event, i)"
                     @dragenter="onDragEnter($event, i)"
                     @dragleave="onDragLeave"
                     @dragend="onDragEnd"
                     @drop="onDrop($event, i)"
                     @click="jumpTo(i)"
                     @contextmenu.prevent="showStationContextMenu($event, st, i)">
                    <div class="item-txt" style="display:flex; align-items:center; gap:8px;">
                        <div class="drag-handle" style="color:var(--muted); cursor:grab; padding-right:8px;"><i class="fas fa-bars"></i></div>
                        <span style="font-weight:bold; color:var(--muted); width:30px;">[{{i+1}}]</span>
                        <div style="display:flex; flex-direction:column;">
                            <span style="font-weight:bold;">{{ st.name }} <span style="font-weight:normal; font-size:12px; color:var(--muted); margin-left:4px;">{{ st.en }}</span></span>
                            <div v-if="st.xfer && st.xfer.length" style="display:flex; gap:4px; margin-top:2px;">
                                <span v-for="(x, xi) in st.xfer" :key="xi" class="badge" :style="{
                                    background: x.suspended ? '#ccc' : x.color, 
                                    color: x.suspended ? '#666' : '#fff', 
                                    padding:'1px 4px', 
                                    borderRadius:'2px', 
                                    fontSize:'10px',
                                    border: x.suspended ? '1px solid #999' : 'none',
                                    display: (x.suspended || x.exitTransfer) ? 'inline-flex' : 'inline',
                                    alignItems: 'center',
                                    gap: '2px'
                                }">
                                    {{ x.line }}
                                    <span v-if="x.suspended" style="font-size:8px; background:#999; color:#fff; padding:0 2px; border-radius:2px; margin-left:2px;">{{ $t('stationEditor.statusSuspended') }}</span>
                                    <span v-else-if="x.exitTransfer" style="font-size:8px; background:rgba(0,0,0,0.4); color:#fff; padding:0 2px; border-radius:2px; margin-left:2px; font-weight:bold;">{{ $t('stationEditor.menuExitTransfer') }}</span>
                                </span>
                            </div>
                            <!-- 双向上行下行站台停靠-->
                            <div style="margin-top:6px; display:flex; gap:6px; align-items:center;">
                                <span v-if="st.dock && st.dock === 'up'" class="badge" style="background:#3498db; color:#fff; font-size:10px; padding:2px 6px; border-radius:3px;">{{ $t('stationEditor.dockUp') }}</span>
                                <span v-if="st.dock && st.dock === 'down'" class="badge" style="background:#2ecc71; color:#fff; font-size:10px; padding:2px 6px; border-radius:3px;">{{ $t('stationEditor.dockDown') }}</span>
                                <span v-if="st.expressStop !== false" class="badge" style="background:#ffa502; color:#fff; font-size:10px; padding:2px 6px; border-radius:3px;">{{ $t('stationEditor.expressLabel') }}</span>
                                <!-- 不显示 '两向' 标签于控制面板 -->
                            </div>
                        </div>
                        <span v-if="st.skip" class="badge" style="background:var(--btn-org-bg); font-size:10px; padding:2px 4px; border-radius:2px;">{{ $t('stationEditor.statusSuspended') }}</span>
                    </div>
                </div>
            </div>
        </div>

        <StationEditor 
            v-model="showEditor" 
            :station="editingStation" 
            :is-new="isNewStation"
            @save="saveStation" 
        />
        
        <!-- 站点右键菜单 - 使用 Teleport 传送到 body，允许溢出窗口 -->
        <Teleport to="body">
            <div 
                v-if="stationContextMenu.visible"
                class="station-context-menu"
                data-station-context-menu
                @click.stop
                @contextmenu.prevent
                :style="{
                    position: 'fixed',
                    left: stationContextMenu.x + 'px',
                    top: stationContextMenu.y + 'px',
                    zIndex: 9999
                }"
            >
                <div class="station-context-menu-item" @click="newStationFromMenu()">
                    <i class="fas fa-plus"></i>
                    {{ $t('lineManager.btnNew') }}
                </div>
                <div v-if="stationContextMenu.index >= 0" class="station-context-menu-divider"></div>
                <div v-if="stationContextMenu.index >= 0" class="station-context-menu-item" @click="editStationFromMenu()">
                    <i class="fas fa-edit"></i>
                    {{ $t('lineManager.btnEdit') }}
                </div>
                <div v-if="stationContextMenu.index >= 0" class="station-context-menu-divider"></div>
                <div v-if="stationContextMenu.index >= 0" class="station-context-menu-item" @click="copyStation()">
                    <i class="fas fa-copy"></i>
                    {{ $t('lineManager.btnCopy') }}
                </div>
                <div v-if="stationContextMenu.index >= 0" class="station-context-menu-item" @click="cutStation()">
                    <i class="fas fa-cut"></i>
                    {{ $t('lineManager.btnCut') }}
                </div>
                <div 
                    class="station-context-menu-item"
                    :class="{ disabled: !clipboard.station }"
                    @click="pasteStation()"
                >
                    <i class="fas fa-paste"></i>
                    {{ $t('lineManager.btnPaste') }}
                </div>
                <div v-if="stationContextMenu.index >= 0" class="station-context-menu-divider"></div>
                <div v-if="stationContextMenu.index >= 0" class="station-context-menu-item danger" @click="deleteStationFromMenu()">
                    <i class="fas fa-trash"></i>
                    {{ $t('lineManager.btnDelete') }}
                </div>
            </div>
        </Teleport>
        
        <!-- 点击外部关闭站点右键菜单的遮罩 - 使用 Teleport 传送到 body -->
        <Teleport to="body">
            <div 
                v-if="stationContextMenu.visible"
                @click="closeStationContextMenu"
                style="position: fixed; inset: 0; z-index: 9998; background: transparent;"
            ></div>
        </Teleport>
    </div>
  `
}
