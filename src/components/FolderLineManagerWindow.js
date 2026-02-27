<<<<<<< Updated upstream
<<<<<<< Updated upstream
import { ref, computed, watch, onMounted, nextTick, Teleport } from 'vue'
=======
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick, Teleport } from 'vue'
>>>>>>> Stashed changes
=======
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick, Teleport } from 'vue'
>>>>>>> Stashed changes
import { useI18n } from 'vue-i18n'
import LineManagerDialog from './LineManagerDialog.js'
import LineManagerTopbar from './LineManagerTopbar.js'
import RuntimeLineManager from './RuntimeLineManager.js'

// 解析颜色标记（简化版，仅用于显示）
function parseColorMarkup(text) {
  if (!text || typeof text !== 'string') return text;
  const regex = /<([^>]+)>([^<]*)<\/>/g;
  let result = text;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const color = match[1].trim();
    const content = match[2];
    let colorValue = color;
    // 尝试解析颜色
    if (color.startsWith('#')) {
      colorValue = color;
    } else if (color.startsWith('rgb')) {
      colorValue = color;
    } else {
      // 颜色名称映射
      const colorMap = {
        red: '#ff4444', green: '#44ff44', blue: '#4444ff',
        yellow: '#ffff44', orange: '#ff8844', purple: '#8844ff',
        pink: '#ff44ff', cyan: '#44ffff', lime: '#88ff44'
      };
      colorValue = colorMap[color.toLowerCase()] || color;
    }
    result = result.replace(match[0], `<span style="color:${colorValue}">${content}</span>`);
  }
  return result;
}

export default {
  name: 'FolderLineManagerWindow',
  components: {
    LineManagerDialog,
    LineManagerTopbar,
    RuntimeLineManager
  },
  setup() {
    const { t } = useI18n()
    const folders = ref([]);
    const currentFolderId = ref(null);
    const currentLines = ref([]);
    const loading = ref(false);
    const selectedFolderId = ref(null);
    const selectedLine = ref(null); // 选中的线路
    const contextMenu = ref({ visible: false, x: 0, y: 0, folderId: null, folderName: null }); // 文件夹右键菜单状态
    const lineContextMenu = ref({ visible: false, x: 0, y: 0, line: null }); // 线路右键菜单状态
    const sidebarNewMenu = ref({ visible: false, x: 0, y: 0 }); // 侧边栏空白处右键 → 新建
    const linesNewMenu = ref({ visible: false, x: 0, y: 0 });   // 线路区空白处右键 → 新建
    const clipboard = ref({ type: null, line: null, sourceFolderId: null, sourceFolderPath: null }); // 剪贴板状态（用于复制/剪贴）
    const isSavingThroughLine = ref(false); // 是否正在保存贯通线路
    const pendingThroughLineInfo = ref(null); // 待保存的贯通线路信息
    const showRuntimeLineManager = ref(false); // 是否显示运控线路管理器

    // 获取首末站信息
    function getStationInfo(lineData) {
      if (!lineData || !lineData.stations || !Array.isArray(lineData.stations) || lineData.stations.length === 0) {
        return { first: '', last: '' };
      }
      const stations = lineData.stations;
      const firstSt = stations[0];
      const lastSt = stations[stations.length - 1];
      // 移除颜色标记获取纯文本
      const cleanName = (name) => {
        if (!name) return '';
        return String(name).replace(/<[^>]+>([^<]*)<\/>/g, '$1');
      };
      return {
        first: cleanName(firstSt.name || ''),
        last: cleanName(lastSt.name || '')
      };
    }

    // 加载文件夹列表
    async function loadFolders() {
      if (!(window.electronAPI && window.electronAPI.lines && window.electronAPI.lines.folders)) {
        folders.value = [];
        currentFolderId.value = null;
        selectedFolderId.value = null;
        // 尝试从 localStorage 加载线路列表
        try {
          const saved = localStorage.getItem('pids_global_store_v1');
          if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed.list && Array.isArray(parsed.list)) {
              currentLines.value = parsed.list.map((l, idx) => {
                const stationInfo = getStationInfo(l);
                // 识别贯通线路：需要满足以下条件之一：
                // 1. throughOperationEnabled 明确为 true
                // 2. throughLineSegments 存在且至少有2个元素（贯通线路至少需要2条线路）
                // 3. 线路名称中包含"(贯通)"或"（贯通）"字样（这是创建贯通线路时的命名规则）
                const lineName = l.meta?.lineName || '';
                const hasThroughInName = lineName.includes('(贯通)') || lineName.includes('（贯通）');
                const hasValidSegments = l.meta?.throughLineSegments && 
                                        Array.isArray(l.meta.throughLineSegments) && 
                                        l.meta.throughLineSegments.length >= 2;
                // 更严格的判断：必须满足 throughOperationEnabled === true 或者（有有效段且名称包含贯通）
                const isThroughLine = l.meta?.throughOperationEnabled === true || 
                                     (hasValidSegments && hasThroughInName);
                const isLoopLine = l.meta?.mode === 'loop';
                return {
                  name: l.meta?.lineName || '未命名线路',
                  filePath: '',
                  data: l,
                  index: idx,
                  themeColor: l.meta?.themeColor || '#5F27CD',
                  firstStation: stationInfo.first,
                  lastStation: stationInfo.last,
                  isThroughLine: isThroughLine,
                  isLoopLine: isLoopLine
                };
              });
            }
          }
        } catch (e) {
          console.error('加载线路失败:', e);
        }
        return;
      }
      try {
        const res = await window.electronAPI.lines.folders.list();
        if (res && res.ok && res.folders) {
          folders.value = res.folders;
          const firstId = (res.folders && res.folders[0]) ? res.folders[0].id : null;
          currentFolderId.value = res.current || firstId;
          selectedFolderId.value = currentFolderId.value;
          // 加载当前文件夹的线路
          await loadLinesFromFolder(currentFolderId.value);
        }
      } catch (e) {
        console.error('加载文件夹列表失败:', e);
      }
    }

    // 从文件夹加载线路
    async function loadLinesFromFolder(folderId) {
      if (!(window.electronAPI && window.electronAPI.lines)) {
        return;
      }
      loading.value = true;
      try {
        // 获取文件夹信息
        const folder = folders.value.find(f => f.id === folderId);
        if (!folder) {
          console.error('文件夹不存在:', folderId);
          currentLines.value = [];
          return;
        }
        
        // 先切换文件夹（更新全局状态，用于其他功能）
        if (folderId !== currentFolderId.value) {
          const switchRes = await window.electronAPI.lines.folders.switch(folderId);
          if (switchRes && switchRes.ok) {
            currentFolderId.value = folderId;
            selectedFolderId.value = folderId;
          }
        }
        
        // 直接使用文件夹路径加载线路列表（不依赖全局状态）
        const items = await window.electronAPI.lines.list(folder.path);
        const lines = [];
        if (Array.isArray(items)) {
          for (const it of items) {
            try {
              // 读取文件时也使用文件夹路径
              const res = await window.electronAPI.lines.read(it.name, folder.path);
              if (res && res.ok && res.content) {
                const d = res.content;
                if (d && d.meta && Array.isArray(d.stations)) {
                  const stationInfo = getStationInfo(d);
                  // 识别贯通线路：需要满足以下条件之一：
                  // 1. throughOperationEnabled 明确为 true
                  // 2. throughLineSegments 存在且至少有2个元素（贯通线路至少需要2条线路）
                  // 3. 线路名称中包含"(贯通)"或"（贯通）"字样（这是创建贯通线路时的命名规则）
                  const lineName = d.meta.lineName || '';
                  const hasThroughInName = lineName.includes('(贯通)') || lineName.includes('（贯通）');
                  const hasValidSegments = d.meta.throughLineSegments && 
                                          Array.isArray(d.meta.throughLineSegments) && 
                                          d.meta.throughLineSegments.length >= 2;
                  // 更严格的判断：必须满足 throughOperationEnabled === true 或者（有有效段且名称包含贯通）
                  const isThroughLine = d.meta.throughOperationEnabled === true || 
                                       (hasValidSegments && hasThroughInName);
                  const isLoopLine = d.meta.mode === 'loop';
                  lines.push({
                    name: d.meta.lineName || '未命名线路',
                    filePath: it.name,
                    data: d,
                    themeColor: d.meta.themeColor || '#5F27CD',
                    firstStation: stationInfo.first,
                    lastStation: stationInfo.last,
                    isThroughLine: isThroughLine,
                    isLoopLine: isLoopLine
                  });
                }
              }
            } catch (e) {
              console.warn('读取文件失败', it.name, e);
            }
          }
        }
        currentLines.value = lines;
        // 切换文件夹时清除选中状态
        selectedLine.value = null;
      } catch (e) {
        console.error('加载线路失败:', e);
        currentLines.value = [];
      } finally {
        loading.value = false;
      }
    }

    // 选择文件夹
    async function selectFolder(folderId) {
      if (folderId === selectedFolderId.value) return;
      
      selectedFolderId.value = folderId;
      await loadLinesFromFolder(folderId);
    }

    // 切换线路选中状态
    function toggleLineSelection(line) {
      if (selectedLine.value && selectedLine.value.name === line.name) {
        selectedLine.value = null;
      } else {
        selectedLine.value = line;
      }
    }

    // 双击直接应用线路（快速选择）
    async function applyLineOnDoubleClick(line) {
      selectedLine.value = line;
      await new Promise(resolve => setTimeout(resolve, 50));
      await applySelectedLine();
    }

    // 应用选中的线路
    async function applySelectedLine() {
      // 先快照一份，避免中途被清空导致读取 name 报错
      const line = selectedLine.value;
      if (!line || !line.name) {
        console.warn('[线路管理器] applySelectedLine: invalid selectedLine', line);
        return;
      }

      try {
        // 确保当前文件夹已切换并加载
        if (selectedFolderId.value !== currentFolderId.value) {
          await loadLinesFromFolder(selectedFolderId.value);
        }
        
        const folderId = selectedFolderId.value || currentFolderId.value;
        const folder = folders.value.find((f) => f.id === folderId);
        const folderPath = folder?.path ?? null;
        if (window.electronAPI && window.electronAPI.switchLine) {
          const target = localStorage.getItem('throughOperationSelectorTarget');
<<<<<<< Updated upstream
<<<<<<< Updated upstream
          console.log('[线路管理器] applySelectedLine 调用 switchLine, lineName:', line.name, 'target:', target);
          const result = await window.electronAPI.switchLine(line.name);
=======
          console.log('[线路管理器] applySelectedLine 调用 switchLine, lineName:', line.name, 'target:', target, 'folderPath:', folderPath);
          const result = await window.electronAPI.switchLine(line.name, { folderPath });
>>>>>>> Stashed changes
=======
          console.log('[线路管理器] applySelectedLine 调用 switchLine, lineName:', line.name, 'target:', target, 'folderPath:', folderPath);
          const result = await window.electronAPI.switchLine(line.name, { folderPath });
>>>>>>> Stashed changes
          
          // 延迟后关闭窗口（无论结果如何都关闭）
          await new Promise(resolve => setTimeout(resolve, 200));
          if (window.electronAPI.closeWindow) {
            try {
              await window.electronAPI.closeWindow();
            } catch (e) {
              console.debug('[线路管理器] closeWindow API 调用失败，尝试 window.close():', e);
              try {
                window.close();
              } catch (e2) {
                console.debug('[线路管理器] window.close() 也失败:', e2);
              }
            }
          } else {
            try {
              window.close();
            } catch (e) {
              console.debug('[线路管理器] window.close() 失败:', e);
            }
          }
        } else {
          // 网页环境：通过 localStorage 和 postMessage 通知主窗口
          const lineName = line.name;
          const target = localStorage.getItem('throughOperationSelectorTarget');
          
          // 存储线路名称和目标到 localStorage，供主窗口读取
          localStorage.setItem('lineManagerSelectedLine', lineName);
          if (target) {
            localStorage.setItem('lineManagerSelectedTarget', target);
          } else {
            localStorage.removeItem('lineManagerSelectedTarget');
          }
          
          // 通过 postMessage 通知主窗口（如果窗口仍然打开）
          if (window.opener && !window.opener.closed) {
            window.opener.postMessage({
              type: 'switch-line-request',
              lineName: lineName,
              target: target,
              folderPath: folderPath
            }, '*');
          }
          
          window.dispatchEvent(new StorageEvent('storage', {
            key: 'lineManagerSelectedLine',
            newValue: lineName
          }));
          window.close();
        }
      } catch (e) {
        console.error('切换线路失败:', e);
      }
    }

    // 应用运控线路（从运控线路管理器调用）
    async function applyRuntimeLine(lineData) {
      if (!lineData || !lineData.meta || !lineData.meta.lineName) {
        console.warn('[线路管理器] applyRuntimeLine: invalid lineData', lineData);
        return;
      }

      try {
        const lineName = lineData.meta.lineName;
        
        // 通过 IPC 通知主窗口应用运控线路（Electron 环境）
        if (window.electronAPI && window.electronAPI.switchRuntimeLine) {
          // 使用专门的 switchRuntimeLine 方法传递线路数据
          const result = await window.electronAPI.switchRuntimeLine(lineData);
          if (result && result.ok) {
            if (window.electronAPI.closeWindow) {
              await window.electronAPI.closeWindow();
            }
          }
        } else {
          // 网页环境或降级方案：存储线路数据到 localStorage
          localStorage.setItem('runtimeLineData', JSON.stringify(lineData));
          localStorage.setItem('lineManagerSelectedLine', lineName);
          localStorage.setItem('isRuntimeLine', 'true'); // 标记这是运控线路
          
          // 通过 postMessage 通知主窗口
          if (window.opener && !window.opener.closed) {
            window.opener.postMessage({
              type: 'switch-runtime-line',
              lineName: lineName,
              lineData: lineData
            }, '*');
          }
          
          // 触发 storage 事件
          window.dispatchEvent(new StorageEvent('storage', {
            key: 'runtimeLineData',
            newValue: JSON.stringify(lineData)
          }));
          
          window.close();
        }
      } catch (e) {
        console.error('应用运控线路失败:', e);
        throw e;
      }
    }

    // 添加文件夹
    async function addFolder() {
      if (!(window.electronAPI && window.electronAPI.lines && window.electronAPI.lines.folders)) {
        return;
      }
      try {
        // 使用独立的对话框提示用户输入文件夹名称
        if (!window.__lineManagerDialog) {
          console.error('对话框组件未初始化');
          return;
        }
        const folderName = await window.__lineManagerDialog.prompt('请输入文件夹名称', '新建文件夹', '新建文件夹');
        if (!folderName || !folderName.trim()) {
          return; // 用户取消或输入为空
        }
        
        const trimmedName = folderName.trim();
        
        // 检查文件夹名称是否已存在
        const existingFolder = folders.value.find(f => f.name === trimmedName);
        if (existingFolder) {
          await window.__lineManagerDialog.alert(`文件夹名称"${trimmedName}"已存在，请使用其他名称`, '错误');
          return;
        }
        
        const res = await window.electronAPI.lines.folders.add(trimmedName);
        if (res && res.ok) {
          await loadFolders();
        } else if (res && res.error) {
          await window.__lineManagerDialog.alert(res.error || '添加文件夹失败', '错误');
        } else {
          // 如果返回结果但没有ok和error，也显示错误
          await window.__lineManagerDialog.alert('添加文件夹失败：未知错误', '错误');
        }
      } catch (e) {
        console.error('添加文件夹失败:', e);
        if (window.__lineManagerDialog) {
          await window.__lineManagerDialog.alert('添加文件夹失败：' + (e.message || e), '错误');
        }
      }
    }

    // 删除文件夹
    async function deleteFolder(folderId, folderName, folderPath) {
      if (!window.__lineManagerDialog) return;
      const confirmed = await window.__lineManagerDialog.confirm(`确定要删除文件夹"${folderName}"吗？\n\n警告：删除后文件夹及其内部的所有文件将被永久删除，无法恢复！`, '删除文件夹');
      if (!confirmed) {
        return;
      }
      if (!(window.electronAPI && window.electronAPI.lines && window.electronAPI.lines.folders)) {
        if (window.__lineManagerDialog) {
          await window.__lineManagerDialog.alert('Electron API 不可用', '错误');
        }
        return;
      }
      try {
        // 传递路径而不是ID，因为路径更稳定
        const res = await window.electronAPI.lines.folders.remove(folderPath || folderId);
        if (res && res.ok) {
          await loadFolders();
          if (window.__lineManagerDialog) {
            await window.__lineManagerDialog.alert('文件夹已删除', '成功');
          }
        } else {
          // 删除失败，显示错误信息并刷新文件夹列表
          const errorMsg = res && res.error ? res.error : '未知错误';
          console.error('删除文件夹失败:', res);
          // 刷新文件夹列表，确保与后端同步
          await loadFolders();
          if (window.__lineManagerDialog) {
            await window.__lineManagerDialog.alert(`删除文件夹失败\n\n${errorMsg}`, '错误');
          }
        }
      } catch (e) {
        console.error('删除文件夹失败:', e);
        if (window.__lineManagerDialog) {
          await window.__lineManagerDialog.alert('删除文件夹失败：' + (e.message || e), '错误');
        }
      }
    }

    // 重命名文件夹
    async function renameFolder(folderId, currentName) {
      if (!(window.electronAPI && window.electronAPI.lines && window.electronAPI.lines.folders)) {
        return;
      }
      if (!window.__lineManagerDialog) return;
      const newName = await window.__lineManagerDialog.prompt('请输入新的文件夹名称', currentName, '重命名文件夹');
      if (newName && newName.trim() !== currentName) {
        try {
          const res = await window.electronAPI.lines.folders.rename(folderId, newName);
          if (res && res.ok) {
            await loadFolders();
          }
        } catch (e) {
          console.error('重命名文件夹失败:', e);
        }
      }
    }

    // 显示右键菜单
    function showContextMenu(event, folder) {
      event.preventDefault();
      event.stopPropagation();
      contextMenu.value = {
        visible: true,
        x: event.clientX,
        y: event.clientY,
        folderId: folder.id,
        folderName: folder.name
      };
    }

    // 关闭右键菜单
    function closeContextMenu() {
      contextMenu.value.visible = false;
    }

    // 侧边栏空白处右键 → 新建文件夹
    function showSidebarNewMenu(event) {
      event.preventDefault();
      event.stopPropagation();
      contextMenu.value.visible = false;
      lineContextMenu.value.visible = false;
      linesNewMenu.value.visible = false;
      sidebarNewMenu.value = { visible: true, x: event.clientX, y: event.clientY };
    }
    function closeSidebarNewMenu() {
      sidebarNewMenu.value.visible = false;
    }

    // 线路区空白处右键 → 新建文件夹 / 新建线路
    function showLinesNewMenu(event) {
      event.preventDefault();
      event.stopPropagation();
      contextMenu.value.visible = false;
      lineContextMenu.value.visible = false;
      sidebarNewMenu.value.visible = false;
      linesNewMenu.value = { visible: true, x: event.clientX, y: event.clientY };
    }
    function closeLinesNewMenu() {
      linesNewMenu.value.visible = false;
    }

    // 打开文件夹（在文件管理器中）
    async function openFolderInExplorer(folderId) {
      closeContextMenu();
      const folder = folders.value.find(f => f.id === folderId);
      if (!folder) return;
      
      if (window.electronAPI && window.electronAPI.lines && window.electronAPI.lines.folders && window.electronAPI.lines.folders.open) {
        try {
          const res = await window.electronAPI.lines.folders.open(folder.path);
          if (!res || !res.ok) {
            if (window.__lineManagerDialog) {
              await window.__lineManagerDialog.alert(res && res.error ? res.error : '打开文件夹失败', '错误');
            }
          }
        } catch (e) {
          console.error('打开文件夹失败:', e);
          if (window.__lineManagerDialog) {
            await window.__lineManagerDialog.alert('打开文件夹失败：' + (e.message || e), '错误');
          }
        }
      }
    }

    // 处理右键菜单的重命名
    async function handleContextMenuRename(folderId) {
      closeContextMenu();
      const folder = folders.value.find(f => f.id === folderId);
      if (folder) {
        await renameFolder(folderId, folder.name);
      }
    }

    // 处理右键菜单的删除
    async function handleContextMenuDelete(folderId) {
      closeContextMenu();
      const folder = folders.value.find(f => f.id === folderId);
      if (folder) {
        await deleteFolder(folderId, folder.name, folder.path);
      }
    }

    // 显示线路右键菜单
    function showLineContextMenu(event, line) {
      event.preventDefault();
      event.stopPropagation();
      
      // 初始位置设置为点击位置
      lineContextMenu.value = {
        visible: true,
        x: event.clientX,
        y: event.clientY,
        line: line
      };
      
      // 使用 nextTick 在菜单渲染后调整位置，确保菜单不被裁剪
      nextTick(() => {
        const menuElement = document.querySelector('[data-line-context-menu]');
        if (menuElement) {
          const rect = menuElement.getBoundingClientRect();
          const viewportWidth = window.innerWidth;
          const viewportHeight = window.innerHeight;
          
          let x = event.clientX;
          let y = event.clientY;
          
          // 如果菜单会在右侧被截断，调整到左侧
          if (x + rect.width > viewportWidth) {
            x = event.clientX - rect.width;
            if (x < 0) x = Math.max(0, viewportWidth - rect.width - 10);
          }
          
          // 如果菜单会在底部被截断，调整到上方
          if (y + rect.height > viewportHeight) {
            y = event.clientY - rect.height;
            if (y < 0) y = Math.max(0, viewportHeight - rect.height - 10);
          }
          
          // 确保不会超出左边界
          if (x < 0) x = 10;
          
          // 更新位置
          lineContextMenu.value.x = x;
          lineContextMenu.value.y = y;
        }
      });
    }

    // 关闭线路右键菜单
    function closeLineContextMenu() {
      lineContextMenu.value.visible = false;
    }

    // 打开线路（在主窗口中切换到此线路）
    async function openLine(line) {
      closeLineContextMenu();
      if (!line) return;
      
      const folderId = selectedFolderId.value || currentFolderId.value;
      const folder = folders.value.find((f) => f.id === folderId);
      const folderPath = folder?.path ?? null;
      if (window.electronAPI && window.electronAPI.switchLine) {
        try {
          const target = localStorage.getItem('throughOperationSelectorTarget');
          console.log('[线路管理器] openLine 调用 switchLine, lineName:', line.name, 'target:', target, 'folderPath:', folderPath);
          const result = await window.electronAPI.switchLine(line.name, { folderPath });
          if (result && result.ok) {
            // 切换成功，关闭线路管理器窗口
            if (window.electronAPI.closeWindow) {
              await window.electronAPI.closeWindow();
            }
          }
        } catch (e) {
          console.error('打开线路失败:', e);
          if (window.__lineManagerDialog) {
            await window.__lineManagerDialog.alert('打开线路失败：' + (e.message || e), '错误');
          }
        }
      } else {
        // 网页环境：通过 localStorage 和 postMessage 通知主窗口
        const lineName = line.name;
        const target = localStorage.getItem('throughOperationSelectorTarget');
        
        // 存储线路名称和目标到 localStorage，供主窗口读取
        localStorage.setItem('lineManagerSelectedLine', lineName);
        if (target) {
          localStorage.setItem('lineManagerSelectedTarget', target);
        } else {
          localStorage.removeItem('lineManagerSelectedTarget');
        }
        
        // 通过 postMessage 通知主窗口（如果窗口仍然打开）
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage({
            type: 'switch-line-request',
            lineName: lineName,
            target: target,
            folderPath: folderPath
          }, '*');
        }
        window.dispatchEvent(new StorageEvent('storage', {
          key: 'lineManagerSelectedLine',
          newValue: lineName
        }));
        window.close();
      }
    }

    // 重命名线路
    async function renameLine(line) {
      closeLineContextMenu();
      if (!line || !window.electronAPI || !window.electronAPI.lines) return;
      if (!window.__lineManagerDialog) return;
      
      const currentName = line.name.replace(/<[^>]+>/g, '').replace(/<\/>/g, ''); // 移除颜色标记
      const newName = await window.__lineManagerDialog.prompt('请输入新的线路名称', currentName, '重命名线路');
      if (newName && newName.trim() !== currentName) {
        try {
          // 这里需要实现重命名逻辑
          // 由于线路是以文件名存储的，重命名需要保存文件并删除旧文件
          // 暂时提示用户使用主程序的重命名功能
          await window.__lineManagerDialog.alert('线路重命名功能需要在主程序中进行', '提示');
        } catch (e) {
          console.error('重命名线路失败:', e);
          if (window.__lineManagerDialog) {
            await window.__lineManagerDialog.alert('重命名线路失败：' + (e.message || e), '错误');
          }
        }
      }
    }

    // 复制线路
    async function copyLine(line) {
      closeLineContextMenu();
      const sourceFolderId = selectedFolderId.value || currentFolderId.value;
      const sourceFolder = folders.value.find(f => f.id === sourceFolderId);
      clipboard.value = { type: 'copy', line: line, sourceFolderId: sourceFolderId, sourceFolderPath: sourceFolder ? sourceFolder.path : null };
      if (window.__lineManagerDialog) {
        await window.__lineManagerDialog.alert('线路已复制', '提示');
      }
    }

    // 剪贴线路
    async function cutLine(line) {
      closeLineContextMenu();
      const sourceFolderId = selectedFolderId.value || currentFolderId.value;
      const sourceFolder = folders.value.find(f => f.id === sourceFolderId);
      clipboard.value = { type: 'cut', line: line, sourceFolderId: sourceFolderId, sourceFolderPath: sourceFolder ? sourceFolder.path : null };
      if (window.__lineManagerDialog) {
        await window.__lineManagerDialog.alert('线路已剪贴', '提示');
      }
    }

    // 新建线路
    async function createNewLine() {
      if (!window.electronAPI || !window.electronAPI.lines) return;
      if (!window.__lineManagerDialog) return;

        const folderId = selectedFolderId.value || currentFolderId.value;
        const folder = folders.value.find(f => f.id === folderId);
        if (!folder) {
          await window.__lineManagerDialog.alert('请先选择一个文件夹', '提示');
          return;
        }

      const lineName = await window.__lineManagerDialog.prompt('请输入新线路名称 (例如: 3号线)', '新线路', '新建线路');
      if (!lineName || !lineName.trim()) {
        return; // 用户取消或输入为空
      }

      try {

        // 创建新线路的默认结构
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
        };

        // 生成文件名（清理线路名称，移除颜色标记和特殊字符）
        const cleanName = lineName.trim().replace(/<[^>]+>([^<]*)<\/>/g, '$1').replace(/[<>:"/\\|?*]/g, '').trim();
        if (!cleanName) {
          await window.__lineManagerDialog.alert('线路名称无效', '错误');
          return;
        }
        const fileName = cleanName + '.mpl';

        // 保存到当前文件夹（.mpl 为 zip 包格式）
        const saveRes = await window.electronAPI.lines.save(fileName, newLine, folder.path);
        if (saveRes && saveRes.ok) {
          // 重新加载当前文件夹的线路列表
          await loadLinesFromFolder(folderId);
          await window.__lineManagerDialog.alert('线路已创建', '成功');
        } else {
          await window.__lineManagerDialog.alert('创建线路失败：' + (saveRes && saveRes.error ? saveRes.error : '未知错误'), '错误');
        }
      } catch (e) {
        console.error('创建线路失败:', e);
        if (window.__lineManagerDialog) {
          await window.__lineManagerDialog.alert('创建线路失败：' + (e.message || e), '错误');
        }
      }
    }

    // 删除线路
    async function deleteLine(line) {
      closeLineContextMenu();
      if (!line || !window.electronAPI || !window.electronAPI.lines) return;
      if (!window.__lineManagerDialog) return;

      const folderId = selectedFolderId.value || currentFolderId.value;
      const folder = folders.value.find(f => f.id === folderId);
      if (!folder) return;

      const lineName = line.name.replace(/<[^>]+>/g, '').replace(/<\/>/g, '').trim();
      const confirmed = await window.__lineManagerDialog.confirm(`确定要删除线路"${lineName}"吗？`, '删除线路');
      if (!confirmed) {
        return;
      }

      try {

        const deleteRes = await window.electronAPI.lines.delete(line.filePath, folder.path);
        if (deleteRes && deleteRes.ok) {
          // 重新加载当前文件夹的线路列表
          await loadLinesFromFolder(folderId);
          await window.__lineManagerDialog.alert('线路已删除', '成功');
        } else {
          await window.__lineManagerDialog.alert('删除线路失败：' + (deleteRes && deleteRes.error ? deleteRes.error : '未知错误'), '错误');
        }
      } catch (e) {
        console.error('删除线路失败:', e);
        if (window.__lineManagerDialog) {
          await window.__lineManagerDialog.alert('删除线路失败：' + (e.message || e), '错误');
        }
      }
    }

    // 粘贴线路
    async function pasteLine() {
      closeLineContextMenu();
      if (!clipboard.value.line || !window.electronAPI || !window.electronAPI.lines) return;
      
      try {
        const sourceLine = clipboard.value.line;
        const targetFolderId = selectedFolderId.value || currentFolderId.value;
        const targetFolder = folders.value.find(f => f.id === targetFolderId);
        if (!targetFolder) return;

        // 获取源文件夹信息
        const sourceFolderId = clipboard.value.sourceFolderId;
        const sourceFolderPath = clipboard.value.sourceFolderPath;
        if (!sourceFolderId || !sourceFolderPath) {
          await window.__lineManagerDialog.alert('无法确定源文件夹', '错误');
          return;
        }

        // 读取源线路文件
        const readRes = await window.electronAPI.lines.read(sourceLine.filePath, sourceFolderPath);
        if (!readRes || !readRes.ok || !readRes.content) {
          await window.__lineManagerDialog.alert('读取源线路文件失败', '错误');
          return;
        }

        // 生成目标文件名（使用线路名称，与新建线路一致用 .mpl）
        const lineName = sourceLine.name.replace(/<[^>]+>/g, '').replace(/<\/>/g, '').trim();
        const targetFileName = lineName + '.mpl';

        // 保存到目标文件夹
        const sep = sourceFolderPath && sourceFolderPath.includes('\\') ? '\\' : '/';
        const sourceLinePath = sourceFolderPath
          ? ((sourceFolderPath.endsWith(sep) ? sourceFolderPath : sourceFolderPath + sep) + sourceLine.filePath)
          : null;
        const saveRes = await window.electronAPI.lines.save(targetFileName, readRes.content, targetFolder.path, sourceLinePath);
        if (!saveRes || !saveRes.ok) {
          await window.__lineManagerDialog.alert('保存线路文件失败：' + (saveRes && saveRes.error ? saveRes.error : '未知错误'), '错误');
          return;
        }

        // 如果是剪贴，删除源文件
        if (clipboard.value.type === 'cut') {
          const deleteRes = await window.electronAPI.lines.delete(sourceLine.filePath, sourceFolderPath);
          if (!deleteRes || !deleteRes.ok) {
            console.warn('删除源文件失败:', deleteRes && deleteRes.error);
            // 即使删除失败，也认为粘贴成功
          }
        }

        // 记录操作类型
        const operationType = clipboard.value.type === 'cut' ? '移动' : '复制';

        // 重新加载当前文件夹的线路列表
        await loadLinesFromFolder(targetFolderId);

        // 如果是剪贴操作，还需要重新加载源文件夹
        if (clipboard.value.type === 'cut' && clipboard.value.sourceFolderId !== targetFolderId) {
          await loadLinesFromFolder(clipboard.value.sourceFolderId);
        }

        // 粘贴完成后清除剪贴板
        clipboard.value = { type: null, line: null, sourceFolderId: null, sourceFolderPath: null };

        await window.__lineManagerDialog.alert('线路已' + operationType + '成功', '成功');
      } catch (e) {
        console.error('粘贴线路失败:', e);
        if (window.__lineManagerDialog) {
          await window.__lineManagerDialog.alert('粘贴线路失败：' + (e.message || e), '错误');
        }
      }
    }

    // 关闭窗口
    async function closeWindow() {
      if (window.electronAPI && window.electronAPI.closeWindow) {
        await window.electronAPI.closeWindow();
      } else {
        window.close();
      }
    }

    // 检查是否有文件夹管理 API
    const hasFoldersAPI = computed(() => {
      return typeof window !== 'undefined' && window.electronAPI && window.electronAPI.lines && window.electronAPI.lines.folders;
    });

    // 保存贯通线路
    async function saveThroughLine() {
      try {
        console.log('[线路管理器] saveThroughLine 开始执行');
        
        // 检查是否有待保存的贯通线路数据
        const pendingDataStr = localStorage.getItem('pendingThroughLineData');
        if (!pendingDataStr) {
          console.warn('[线路管理器] 未找到待保存的贯通线路数据');
          return;
        }
        
        const pendingData = JSON.parse(pendingDataStr);
        const { lineData, lineName, cleanLineName, validSegments, sourceLinePaths } = pendingData;
        
        console.log('[线路管理器] 贯通线路信息:', { 
          lineName, 
          segmentCount: validSegments ? validSegments.length : 0,
          foldersCount: folders.value.length
        });
        
        // 设置保存模式状态
        isSavingThroughLine.value = true;
        pendingThroughLineInfo.value = {
          lineName: lineName,
          segmentCount: validSegments ? validSegments.length : 0
        };
        
        console.log('[线路管理器] 状态已设置, isSavingThroughLine:', isSavingThroughLine.value);
        
        // 等待状态更新
        await nextTick();
        
        const availableFolders = folders.value.slice();
        
        console.log('[线路管理器] 可用文件夹数量:', availableFolders.length);
        
        if (availableFolders.length === 0) {
          // 没有其他文件夹，让用户创建新文件夹
          const folderName = await window.__lineManagerDialog.prompt(
            '当前没有可用的文件夹，请创建一个新文件夹用于保存贯通线路：',
            '新建文件夹',
            '创建文件夹'
          );
          
          if (!folderName || !folderName.trim()) {
            // 用户取消，清除贯通保存态并通知主窗口
            isSavingThroughLine.value = false;
            pendingThroughLineInfo.value = null;
            try {
              localStorage.removeItem('pendingThroughLineData');
              localStorage.removeItem('throughOperationSelectorTarget');
            } catch (e) {}
            localStorage.setItem('throughLineSaveResult', JSON.stringify({ success: false, error: 'cancelled' }));
            if (window.electronAPI && window.electronAPI.closeWindow) {
              await window.electronAPI.closeWindow();
            }
            return;
          }
          
          // 创建新文件夹
          const addRes = await window.electronAPI.lines.folders.add(folderName.trim());
          if (addRes && addRes.ok) {
            await loadFolders();
            // 使用新创建的文件夹
            const newFolder = folders.value.find(f => f.id === addRes.folderId);
            if (newFolder) {
              await doSaveThroughLine(lineData, cleanLineName, newFolder, sourceLinePaths);
            } else {
              localStorage.setItem('throughLineSaveResult', JSON.stringify({ success: false, error: '创建文件夹后未找到' }));
              if (window.electronAPI && window.electronAPI.closeWindow) {
                await window.electronAPI.closeWindow();
              }
            }
          } else {
            localStorage.setItem('throughLineSaveResult', JSON.stringify({ success: false, error: addRes && addRes.error || '创建文件夹失败' }));
            if (window.electronAPI && window.electronAPI.closeWindow) {
              await window.electronAPI.closeWindow();
            }
          }
          return;
        }
        
        // 如果只有一个文件夹，等待一小段时间让横幅显示，然后直接使用
        if (availableFolders.length === 1) {
          await new Promise(resolve => setTimeout(resolve, 800)); // 让用户看到横幅
          await doSaveThroughLine(lineData, cleanLineName, availableFolders[0], sourceLinePaths);
          return;
        }
        
        // 多个文件夹，等待一小段时间让横幅显示，然后显示选择对话框
        await new Promise(resolve => setTimeout(resolve, 800)); // 让用户看到横幅
        const selectedFolder = await showFolderSelector(availableFolders, '请选择保存贯通线路的文件夹：', lineName);
        if (selectedFolder) {
          await doSaveThroughLine(lineData, cleanLineName, selectedFolder, sourceLinePaths);
        } else {
          // 用户取消，清除贯通保存态
          isSavingThroughLine.value = false;
          pendingThroughLineInfo.value = null;
          try {
            localStorage.removeItem('pendingThroughLineData');
            localStorage.removeItem('throughOperationSelectorTarget');
          } catch (e) {}
          localStorage.setItem('throughLineSaveResult', JSON.stringify({ success: false, error: 'cancelled' }));
          if (window.electronAPI && window.electronAPI.closeWindow) {
            await window.electronAPI.closeWindow();
          }
        }
      } catch (e) {
        console.error('保存贯通线路失败:', e);
        isSavingThroughLine.value = false;
        pendingThroughLineInfo.value = null;
        try {
          localStorage.removeItem('pendingThroughLineData');
          localStorage.removeItem('throughOperationSelectorTarget');
        } catch (e2) {}
        localStorage.setItem('throughLineSaveResult', JSON.stringify({ success: false, error: e.message || e }));
        if (window.electronAPI && window.electronAPI.closeWindow) {
          await window.electronAPI.closeWindow();
        }
      }
    }
    
    // 执行保存贯通线路
    async function doSaveThroughLine(lineData, cleanLineName, folder, sourceLinePaths = null) {
      try {
        const targetFileName = cleanLineName.replace(/[<>:"/\\|?*]/g, '').trim() + '.mpl';
        const saveRes = await window.electronAPI.lines.save(targetFileName, lineData, folder.path, sourceLinePaths);
        
        if (saveRes && saveRes.ok) {
          // 保存成功，清除贯通保存态，避免下次打开线路管理时再次提示
          isSavingThroughLine.value = false;
          pendingThroughLineInfo.value = null;
          try {
            localStorage.removeItem('pendingThroughLineData');
            localStorage.removeItem('throughOperationSelectorTarget');
          } catch (e) {}
          localStorage.setItem('throughLineSaveResult', JSON.stringify({
            success: true,
            folderId: folder.id,
            folderPath: folder.path,
            filePath: saveRes.path || (folder.path + (folder.path.includes('\\') ? '\\' : '/') + targetFileName)
          }));
          
          // 刷新当前文件夹的线路列表
          await loadLinesFromFolder(folder.id);
          
          // 不在这里显示提示，让主窗口显示系统通知
          // 关闭窗口（在保存结果写入 localStorage 之后）
          if (window.electronAPI && window.electronAPI.closeWindow) {
            // 等待一小段时间确保 localStorage 已写入
            await new Promise(resolve => setTimeout(resolve, 100));
            await window.electronAPI.closeWindow();
          }
        } else {
          isSavingThroughLine.value = false;
          pendingThroughLineInfo.value = null;
          try {
            localStorage.removeItem('pendingThroughLineData');
            localStorage.removeItem('throughOperationSelectorTarget');
          } catch (e) {}
          localStorage.setItem('throughLineSaveResult', JSON.stringify({
            success: false,
            error: saveRes && saveRes.error || '保存失败'
          }));
          if (window.electronAPI && window.electronAPI.closeWindow) {
            await window.electronAPI.closeWindow();
          }
        }
      } catch (e) {
        console.error('执行保存失败:', e);
        try {
          localStorage.removeItem('pendingThroughLineData');
          localStorage.removeItem('throughOperationSelectorTarget');
        } catch (e2) {}
        localStorage.setItem('throughLineSaveResult', JSON.stringify({ success: false, error: e.message || e }));
        if (window.electronAPI && window.electronAPI.closeWindow) {
          await window.electronAPI.closeWindow();
        }
      }
    }
    
    // 显示文件夹选择器
    async function showFolderSelector(foldersList, title, lineName = '') {
      return new Promise((resolve) => {
        const isDarkTheme = !!(document?.documentElement?.classList?.contains('dark'));
        const glassBg = isDarkTheme ? 'rgba(30,30,30,0.85)' : 'rgba(255,255,255,0.85)';
        const dialog = document.createElement('div');
        dialog.style.cssText = 'position:fixed; inset:0; display:flex; align-items:center; justify-content:center; z-index:10000; background:transparent; backdrop-filter:none; -webkit-backdrop-filter:none; animation:fadeIn 0.3s ease;';
        
        const dialogContent = document.createElement('div');
        dialogContent.style.cssText = `background:${glassBg}; backdrop-filter:blur(20px) saturate(180%); -webkit-backdrop-filter:blur(20px) saturate(180%); border:1px solid rgba(255,255,255,0.14); border-radius:16px; width:92%; max-width:500px; max-height:85vh; display:flex; flex-direction:column; box-shadow:0 20px 60px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.1); overflow:hidden; transform:scale(1); transition:transform 0.2s;`;
        
        const header = document.createElement('div');
        header.style.cssText = 'padding:24px 28px; border-bottom:1px solid var(--divider, rgba(0,0,0,0.1)); display:flex; flex-direction:column; gap:16px; flex-shrink:0; background:linear-gradient(135deg, rgba(255,159,67,0.05) 0%, rgba(255,159,67,0.02) 100%);';
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
            <button id="closeBtn" style="background:none; border:none; color:var(--muted, #999); cursor:pointer; font-size:20px; padding:8px; width:36px; height:36px; display:flex; align-items:center; justify-content:center; border-radius:8px; transition:all 0.2s;" onmouseover="this.style.color='var(--text, #333)'" onmouseout="this.style.color='var(--muted, #999)'">
              <i class="fas fa-times"></i>
            </button>
          </div>
          ${lineName ? `
          <div style="padding:14px 16px; background:linear-gradient(135deg, #FF9F43 0%, #FFC371 100%); border-radius:10px; display:flex; align-items:center; gap:12px; box-shadow:0 4px 12px rgba(255,159,67,0.3);">
            <i class="fas fa-exchange-alt" style="font-size:20px; color:#fff;"></i>
            <div style="flex:1;">
              <div style="font-size:14px; font-weight:700; color:#fff; margin-bottom:4px;">保存贯通线路</div>
              <div style="font-size:12px; color:rgba(255,255,255,0.95);">线路名称: ${lineName}</div>
            </div>
          </div>
          ` : ''}
        `;
        
        const folderList = document.createElement('div');
        folderList.style.cssText = 'flex:1; overflow-y:auto; padding:20px 28px; background:var(--bg, #fafafa);';
        
        let selectedFolder = null;
        
        foldersList.forEach((folder) => {
          const folderCard = document.createElement('div');
          folderCard.style.cssText = 'display:flex; align-items:center; justify-content:space-between; padding:16px; margin-bottom:12px; background:var(--card, #ffffff); border-radius:12px; border:2px solid var(--divider, rgba(0,0,0,0.08)); cursor:pointer; transition:all 0.2s; user-select:none; box-shadow:0 2px 8px rgba(0,0,0,0.04);';
          
          folderCard.innerHTML = `
            <div style="flex:1; min-width:0;">
              <div style="font-size:15px; font-weight:600; color:var(--text, #333); margin-bottom:6px; display:flex; align-items:center; gap:10px;">
                <i class="fas fa-folder" style="font-size:16px; color:#FF9F43;"></i>
                <span>${folder.name}</span>
              </div>
              <div style="font-size:12px; color:var(--muted, #999); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; padding-left:26px;">
                ${folder.path || ''}
              </div>
            </div>
          `;
          
          folderCard.addEventListener('click', () => {
            selectedFolder = folder;
            foldersList.forEach((f) => {
              const card = folderList.querySelector(`[data-folder-id="${f.id}"]`);
              if (card) {
                if (f.id === folder.id) {
                  card.style.borderColor = '#FF9F43';
                  card.style.background = 'rgba(255,159,67,0.1)';
                  card.style.boxShadow = '0 4px 16px rgba(255,159,67,0.3)';
                  card.style.transform = 'translateY(-2px)';
                } else {
                  card.style.borderColor = 'var(--divider, rgba(0,0,0,0.08))';
                  card.style.background = 'var(--card, #ffffff)';
                  card.style.boxShadow = '0 2px 8px rgba(0,0,0,0.04)';
                  card.style.transform = 'translateY(0)';
                }
              }
            });
          });
          
          folderCard.addEventListener('mouseenter', () => {
            if (selectedFolder?.id !== folder.id) {
              folderCard.style.background = 'var(--bg, #f5f5f5)';
              folderCard.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)';
              folderCard.style.transform = 'translateY(-1px)';
            }
          });
          folderCard.addEventListener('mouseleave', () => {
            if (selectedFolder?.id !== folder.id) {
              folderCard.style.background = 'var(--card, #ffffff)';
              folderCard.style.boxShadow = '0 2px 8px rgba(0,0,0,0.04)';
              folderCard.style.transform = 'translateY(0)';
            }
          });
          
          folderCard.setAttribute('data-folder-id', folder.id);
          folderList.appendChild(folderCard);
        });
        
        const buttonBar = document.createElement('div');
        buttonBar.style.cssText = 'padding:20px 28px; border-top:1px solid var(--divider, rgba(0,0,0,0.1)); display:flex; justify-content:flex-end; gap:12px; flex-shrink:0; background:var(--card, #ffffff);';
        buttonBar.innerHTML = `
          <button id="cancelBtn" style="padding:10px 20px; background:var(--btn-gray-bg, #f5f5f5); color:var(--btn-gray-text, #666); border:none; border-radius:8px; font-size:14px; font-weight:500; cursor:pointer; transition:all 0.2s; min-width:80px;" onmouseover="this.style.background='var(--bg, #e5e5e5)'" onmouseout="this.style.background='var(--btn-gray-bg, #f5f5f5)'">取消</button>
          <button id="confirmBtn" style="padding:10px 20px; background:#FF9F43; color:#fff; border:none; border-radius:8px; font-size:14px; font-weight:600; cursor:pointer; transition:all 0.2s; min-width:80px; box-shadow:0 4px 12px rgba(255,159,67,0.4);" onmouseover="this.style.boxShadow='0 6px 16px rgba(255,159,67,0.6)'; this.style.transform='translateY(-1px)'" onmouseout="this.style.boxShadow='0 4px 12px rgba(255,159,67,0.4)'; this.style.transform='translateY(0)'">确定</button>
        `;
        
        // 添加动画样式
        const style = document.createElement('style');
        style.textContent = `
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
        `;
        dialog.appendChild(style);
        
        dialogContent.appendChild(header);
        dialogContent.appendChild(folderList);
        dialogContent.appendChild(buttonBar);
        dialog.appendChild(dialogContent);
        document.body.appendChild(dialog);
        
        const closeDialog = () => {
          document.body.removeChild(dialog);
        };
        
        header.querySelector('#closeBtn').addEventListener('click', () => {
          closeDialog();
          resolve(null);
        });
        
        buttonBar.querySelector('#cancelBtn').addEventListener('click', () => {
          closeDialog();
          resolve(null);
        });
        
        buttonBar.querySelector('#confirmBtn').addEventListener('click', () => {
          if (selectedFolder) {
            closeDialog();
            resolve(selectedFolder);
          } else {
            alert('请先选择一个文件夹');
          }
        });
        
        dialog.addEventListener('click', (e) => {
          if (e.target === dialog) {
            closeDialog();
            resolve(null);
          }
        });
      });
    }

    // 手动保存贯通线路（用户点击按钮触发）
    async function handleSaveThroughLine() {
      await saveThroughLine();
    }
    
    // 检查是否是保存贯通线路模式
    async function checkSaveThroughLineMode() {
      const target = localStorage.getItem('throughOperationSelectorTarget');
      const pendingData = localStorage.getItem('pendingThroughLineData');
      
      if (target === 'save-through-line' && pendingData) {
        try {
          const pendingDataObj = JSON.parse(pendingData);
          const { lineName, validSegments } = pendingDataObj;
          
          // 设置保存模式状态（仅显示引导，不自动执行）
          isSavingThroughLine.value = true;
          pendingThroughLineInfo.value = {
            lineName: lineName,
            segmentCount: validSegments ? validSegments.length : 0
          };
          
          await nextTick();
        } catch (e) {
          console.error('解析待保存数据失败:', e);
        }
      }
    }

    // 组件挂载时加载数据
    onMounted(async () => {
      await loadFolders();
      
      // 检查是否是保存贯通线路模式（仅设置状态，不自动执行）
      await nextTick();
      await checkSaveThroughLineMode();
    });

    // 关闭窗口时若仍在“保存贯通线路”引导态且未保存，清除 localStorage，避免下次打开再次弹出横幅
    onBeforeUnmount(() => {
      if (isSavingThroughLine.value) {
        try {
          localStorage.removeItem('pendingThroughLineData');
          localStorage.removeItem('throughOperationSelectorTarget');
        } catch (e) {}
      }
    });

    // 计算当前活动的文件夹ID
    const activeFolderId = computed(() => {
      return selectedFolderId.value ?? currentFolderId.value;
    });

    return {
      t,
      folders,
      currentFolderId,
      selectedFolderId,
      currentLines,
      loading,
      selectedLine,
      activeFolderId,
      isSavingThroughLine,
      pendingThroughLineInfo,
      selectFolder,
      toggleLineSelection,
      applySelectedLine,
      addFolder,
      deleteFolder,
      renameFolder,
      showContextMenu,
      closeContextMenu,
      openFolderInExplorer,
      handleContextMenuRename,
      handleContextMenuDelete,
      closeWindow,
      parseColorMarkup,
      hasFoldersAPI,
      getStationInfo,
      handleSaveThroughLine,
      contextMenu,
      lineContextMenu,
      sidebarNewMenu,
      linesNewMenu,
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
      deleteLine,
      createNewLine,
      clipboard,
      showRuntimeLineManager,
      applyRuntimeLine,
      applyLineOnDoubleClick
    };
  },
  components: {
    Teleport
  },
  template: `
    <div style="width:100vw; height:100vh; display:flex; flex-direction:column; background:transparent;">
      <LineManagerTopbar />
      <!-- 保存贯通线路引导横幅 -->
      <div v-if="isSavingThroughLine && pendingThroughLineInfo" style="padding:16px 20px; background:linear-gradient(135deg, #FF9F43 0%, #FFC371 100%); border-bottom:2px solid rgba(255,255,255,0.2); box-shadow:0 2px 8px rgba(255,159,67,0.3); display:flex; align-items:center; gap:16px; flex-shrink:0;">
        <div style="flex-shrink:0;">
          <i class="fas fa-exchange-alt" style="font-size:24px; color:#fff;"></i>
        </div>
        <div style="flex:1; min-width:0;">
          <div style="font-size:16px; font-weight:bold; color:#fff; margin-bottom:4px;">正在保存贯通线路</div>
          <div style="font-size:13px; color:rgba(255,255,255,0.95);">
            线路名称: <strong>{{ pendingThroughLineInfo.lineName }}</strong>
            <span v-if="pendingThroughLineInfo.segmentCount > 0" style="margin-left:12px;">
              线路段数: <strong>{{ pendingThroughLineInfo.segmentCount }}</strong>
            </span>
          </div>
          <div style="font-size:12px; color:rgba(255,255,255,0.85); margin-top:6px; display:flex; align-items:center; gap:8px;">
            <i class="fas fa-info-circle"></i>
            <span>请点击右下角的"保存贯通线路"按钮，选择文件夹并保存</span>
          </div>
        </div>
      </div>
      <!-- Main Content (Two Column Layout - QQ Style) -->
      <div style="display:flex; flex:1; overflow:hidden; background:transparent;">
        <!-- Left Sidebar: Folders (类似QQ群列表) -->
        <div v-if="hasFoldersAPI && folders.length > 0" style="width:200px; border-right:1px solid var(--lm-sidebar-border, rgba(0, 0, 0, 0.08)); overflow-y:auto; background:var(--lm-sidebar-bg, rgba(255, 255, 255, 0.6)); flex-shrink:0;">
          <div style="padding:8px 0; min-height:100%;" @contextmenu.prevent="showSidebarNewMenu($event)">
            <div 
              v-for="folder in folders" 
              :key="folder.id"
              @click="selectFolder(folder.id)"
              @contextmenu.prevent.stop="showContextMenu($event, folder)"
              :style="{
                padding: '10px 16px',
                cursor: 'pointer',
                background: selectedFolderId === folder.id ? 'var(--lm-sidebar-item-active, #e8e8e8)' : 'transparent',
                transition: 'background 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                borderLeft: selectedFolderId === folder.id ? '3px solid var(--accent, #12b7f5)' : '3px solid transparent',
                opacity: 1
              }"
              @mouseover="(e) => { e.target.style.background = selectedFolderId === folder.id ? 'var(--lm-sidebar-item-active, #e8e8e8)' : 'var(--lm-sidebar-item-hover, #f0f0f0)'; }"
              @mouseout="(e) => { e.target.style.background = selectedFolderId === folder.id ? 'var(--lm-sidebar-item-active, #e8e8e8)' : 'transparent'; }"
              :title="folder.name"
            >
              <i class="fas fa-folder" :style="{fontSize:'16px', color: selectedFolderId === folder.id ? 'var(--accent, #12b7f5)' : 'var(--muted, #666)'}"></i>
              <div style="flex:1; min-width:0;">
                <div style="font-size:14px; font-weight:500; color:var(--text, #333); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                  {{ folder.name }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Right Content: Lines (类似QQ文件列表) -->
        <div style="flex:1; background:var(--lm-content-bg, #fff); display:flex; flex-direction:column; overflow:hidden;">
          <!-- 显示当前选中的文件夹名称 -->
          <div v-if="hasFoldersAPI && folders.length > 0 && selectedFolderId" style="padding:12px 20px; background:var(--lm-header-bg, #f0f0f0); border-bottom:1px solid var(--lm-header-border, #e0e0e0); font-size:14px; font-weight:500; color:var(--muted, #666); flex-shrink:0;">
            <i class="fas fa-folder" style="margin-right:8px; color:var(--accent, #12b7f5);"></i>
            <span>{{ folders.find(f => f.id === selectedFolderId)?.name || '未选择文件夹' }}</span>
          </div>
          
          <div v-if="loading" style="display:flex; align-items:center; justify-content:center; flex:1; color:var(--muted, #999);">
            <div style="text-align:center;">
              <i class="fas fa-spinner fa-spin" style="font-size:32px; margin-bottom:16px;"></i>
              <div>加载中...</div>
            </div>
          </div>
          <div v-else style="flex:1; display:flex; flex-direction:column; overflow:hidden; min-height:0;">
            <!-- 列表头部 -->
            <div v-if="currentLines.length > 0" style="padding:12px 20px; background:var(--lm-list-header-bg, #fafafa); border-bottom:1px solid var(--lm-header-border, #e0e0e0); display:flex; align-items:center; font-size:13px; color:var(--muted, #666); font-weight:500; flex-shrink:0;">
              <div style="width:40px;"></div>
              <div style="width:200px;">线路名称</div>
              <div style="width:76px; text-align:center;">类型</div>
              <div style="width:80px; text-align:center;">颜色</div>
              <div style="flex:1;">首末站</div>
            </div>
            
            <!-- 线路列表（空白处右键 → 新建） -->
            <div style="flex:1; overflow-y:auto; padding:0; min-height:0;" @contextmenu.prevent="showLinesNewMenu($event)">
              <!-- 空状态 -->
              <div v-if="currentLines.length === 0" style="display:flex; align-items:center; justify-content:center; height:100%; color:var(--muted, #999);">
                <div style="text-align:center;">
                  <i class="fas fa-folder-open" style="font-size:48px; margin-bottom:16px; opacity:0.5;"></i>
                  <div style="font-size:16px;">该文件夹中没有线路文件</div>
                </div>
              </div>
              
              <!-- 线路列表项 -->
              <div 
                v-for="(line, index) in currentLines" 
                :key="index"
                @contextmenu.prevent.stop="showLineContextMenu($event, line)"
                @dblclick="applyLineOnDoubleClick(line)"
                :style="{
                  padding: '12px 20px',
                  cursor: 'pointer',
                  background: selectedLine && selectedLine.name === line.name ? 'var(--lm-list-item-active, #e8f4fd)' : 'transparent',
                  borderBottom: '1px solid var(--lm-header-border, #f0f0f0)',
                  transition: 'background 0.2s',
                  display: 'flex',
                  alignItems: 'center'
                }"
                @mouseover="(e) => { if (!selectedLine || selectedLine.name !== line.name) { e.currentTarget.style.background='var(--lm-list-item-hover, #f5f5f5)'; } }"
                @mouseout="(e) => { if (!selectedLine || selectedLine.name !== line.name) { e.currentTarget.style.background='transparent'; } }"
              >
                <!-- 复选框 -->
                <div style="width:40px; min-width:40px; display:flex; align-items:center; justify-content:center;" @click.stop="toggleLineSelection(line)">
                  <input 
                    type="checkbox" 
                    :checked="selectedLine && selectedLine.name === line.name"
                    @click.stop="toggleLineSelection(line)"
                    style="width:18px; height:18px; cursor:pointer;"
                  />
                </div>
                
                <!-- 线路名称 -->
                <div style="width:200px; min-width:200px; display:flex; align-items:center; gap:8px;" @click="toggleLineSelection(line)">
                  <i :class="line.isThroughLine ? 'fas fa-exchange-alt' : (line.isLoopLine ? 'fas fa-circle-notch' : 'fas fa-subway')" :style="{fontSize:'16px', color: line.isThroughLine ? '#FF9F43' : (line.isLoopLine ? '#00b894' : 'var(--muted, #999)')}"></i>
                  <div style="font-size:14px; font-weight:500; color:var(--text, #333); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:flex; align-items:center; gap:6px; flex:1; min-width:0;" v-html="parseColorMarkup(line.name)">
                  </div>
                  <span v-if="line.isThroughLine" style="background:#FF9F43; color:#fff; padding:2px 6px; border-radius:4px; font-size:10px; font-weight:bold; white-space:nowrap; flex-shrink:0;">{{ t('folderLineManager.through') }}</span>
                  <span v-else-if="line.isLoopLine" style="background:#00b894; color:#fff; padding:2px 6px; border-radius:4px; font-size:10px; font-weight:bold; white-space:nowrap; flex-shrink:0;">{{ t('folderLineManager.loop') }}</span>
                </div>
                
                <!-- 类型 -->
                <div style="width:76px; min-width:76px; display:flex; justify-content:center; align-items:center;" @click="toggleLineSelection(line)">
                  <span v-if="line.isThroughLine" style="font-size:12px; color:#FF9F43; font-weight:500;">{{ t('folderLineManager.through') }}</span>
                  <span v-else-if="line.isLoopLine" style="font-size:12px; color:#00b894; font-weight:500;">{{ t('folderLineManager.loop') }}</span>
                  <span v-else style="font-size:12px; color:var(--muted, #999);">{{ t('folderLineManager.single') }}</span>
                </div>
                
                <!-- 颜色 -->
                <div style="width:80px; min-width:80px; display:flex; justify-content:center;">
                  <div :style="{width:'24px', height:'24px', borderRadius:'4px', background:line.themeColor || '#5F27CD', border:'1px solid var(--lm-header-border, #e0e0e0)', flexShrink:0}"></div>
                </div>
                
                <!-- 首末站：环线显示 首⇄末，单线/贯通显示 首→末 -->
                <div style="flex:1; min-width:0; font-size:13px; color:var(--muted, #666); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" @click="toggleLineSelection(line)">
                  <span v-if="line.firstStation && line.lastStation">
                    {{ line.isLoopLine ? (line.firstStation + ' ⇄ ' + line.lastStation) : (line.firstStation + ' → ' + line.lastStation) }}
                  </span>
                  <span v-else style="color:var(--muted, #999);">-</span>
                </div>
              </div>
            </div>
            
            <!-- 底部操作栏 -->
            <div style="padding:12px 20px; background:var(--lm-bottom-bar-bg, rgba(250, 250, 250, 0.85)); border-top:1px solid var(--lm-bottom-bar-border, rgba(224, 224, 224, 0.5)); display:flex; justify-content:space-between; align-items:center; flex-shrink:0;">
              <!-- 左侧信息区域 -->
              <div style="display:flex; align-items:center; gap:16px; flex:1;">
                <!-- 选中线路信息 -->
                <div v-if="selectedLine" style="display:flex; align-items:center; gap:8px; color:var(--muted, #666); font-size:13px;">
                  <i class="fas fa-check-circle" style="color:var(--accent, #12b7f5); font-size:14px;"></i>
                  <span>已选择：<strong style="color:var(--text, #333);">{{ selectedLine.name }}</strong></span>
                </div>
                <div v-else style="color:var(--muted, #999); font-size:13px;">
                  未选择线路
                </div>
              </div>
              
              <!-- 右侧操作按钮 -->
              <div style="display:flex; align-items:center; gap:12px;">
                <!-- 保存贯通线路按钮（仅在保存模式下显示） -->
                <button 
                  v-if="isSavingThroughLine"
                  @click="handleSaveThroughLine()"
                  :style="{
                    padding: '10px 24px',
                    background: 'var(--btn-orange-bg, #FF9F43)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    boxShadow: '0 2px 8px rgba(255, 159, 67, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }"
                  @mouseover="(e) => { e.target.style.background='#FF8C2E'; e.target.style.boxShadow='0 4px 12px rgba(255, 159, 67, 0.4)'; }"
                  @mouseout="(e) => { e.target.style.background='var(--btn-orange-bg, #FF9F43)'; e.target.style.boxShadow='0 2px 8px rgba(255, 159, 67, 0.3)'; }"
                >
                  <i class="fas fa-save" style="font-size:14px;"></i>
                  保存贯通线路
                </button>
                
                <!-- 普通模式：使用当前线路按钮 -->
                <button 
                  v-else
                  @click="applySelectedLine()"
                  :disabled="!selectedLine"
                  :style="{
                    padding: '10px 24px',
                    background: selectedLine ? 'var(--btn-blue-bg, #1677ff)' : 'var(--btn-gray-bg, #d9d9d9)',
                    color: 'var(--btn-text, #fff)',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: selectedLine ? 'pointer' : 'not-allowed',
                    transition: 'all 0.2s',
                    boxShadow: selectedLine ? '0 2px 8px rgba(22, 119, 255, 0.2)' : 'none',
                    opacity: selectedLine ? 1 : 0.6
                  }"
                  @mouseover="(e) => { if (selectedLine) { e.target.style.background='#0958d9'; e.target.style.boxShadow='0 4px 12px rgba(22, 119, 255, 0.3)'; } }"
                  @mouseout="(e) => { if (selectedLine) { e.target.style.background='var(--btn-blue-bg, #1677ff)'; e.target.style.boxShadow='0 2px 8px rgba(22, 119, 255, 0.2)'; } }"
                >
                  <i class="fas fa-check" style="margin-right:6px;"></i>
                  使用当前线路
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- 独立的对话框组件 -->
      <LineManagerDialog />

      <!-- 运控线路管理器 -->
      <RuntimeLineManager 
        v-model="showRuntimeLineManager"
        :pids-state="{}"
        :on-apply-line="applyRuntimeLine"
      />
      
      <!-- 右键菜单 -->
      <div 
        v-if="contextMenu.visible"
      @click.stop
      @contextmenu.prevent
      :style="{
        position: 'fixed',
        left: contextMenu.x + 'px',
        top: contextMenu.y + 'px',
        background: 'var(--lm-menu-bg, #fff)',
        border: '1px solid var(--lm-menu-border, #e0e0e0)',
        borderRadius: '4px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        zIndex: 10000,
        minWidth: '140px',
        padding: '4px 0'
      }"
    >
      <div 
        @click="closeContextMenu(); addFolder()"
        style="padding: 8px 16px; cursor: pointer; font-size: 13px; color: var(--text, #333); display: flex; align-items: center; gap: 8px; transition: background 0.2s;"
        @mouseover="$event.target.style.background='var(--lm-menu-item-hover, #f0f0f0)'"
        @mouseout="$event.target.style.background='transparent'"
      >
        <i class="fas fa-folder-plus" style="font-size: 12px; color: var(--accent, #00b894);"></i>
        新建文件夹
      </div>
      <div 
        @click="closeContextMenu(); activeFolderId && createNewLine()"
        :style="{ padding: '8px 16px', cursor: activeFolderId ? 'pointer' : 'not-allowed', fontSize: '13px', color: activeFolderId ? 'var(--text, #333)' : 'var(--muted, #999)', display: 'flex', alignItems: 'center', gap: '8px', transition: 'background 0.2s', opacity: activeFolderId ? 1 : 0.6 }"
        @mouseover="activeFolderId && ($event.target.style.background='var(--lm-menu-item-hover, #f0f0f0)')"
        @mouseout="$event.target.style.background='transparent'"
        :title="activeFolderId ? '新建线路' : '请先选择文件夹'"
      >
        <i class="fas fa-plus-circle" style="font-size: 12px; color: var(--btn-blue-bg, #1677ff);"></i>
        新建线路
      </div>
      <div style="height: 1px; background: var(--lm-menu-border, #e0e0e0); margin: 4px 0;"></div>
      <div 
        @click="handleContextMenuRename(contextMenu.folderId)"
        style="padding: 8px 16px; cursor: pointer; font-size: 13px; color: var(--text, #333); display: flex; align-items: center; gap: 8px; transition: background 0.2s;"
        @mouseover="$event.target.style.background='var(--lm-menu-item-hover, #f0f0f0)'"
        @mouseout="$event.target.style.background='transparent'"
      >
        <i class="fas fa-edit" style="font-size: 12px; color: var(--muted, #666);"></i>
        重命名
      </div>
      <div 
        @click="openFolderInExplorer(contextMenu.folderId)"
        style="padding: 8px 16px; cursor: pointer; font-size: 13px; color: var(--text, #333); display: flex; align-items: center; gap: 8px; transition: background 0.2s;"
        @mouseover="$event.target.style.background='var(--lm-menu-item-hover, #f0f0f0)'"
        @mouseout="$event.target.style.background='transparent'"
      >
        <i class="fas fa-folder-open" style="font-size: 12px; color: var(--muted, #666);"></i>
        打开
      </div>
      <div 
        v-if="contextMenu.folderId"
        @click="handleContextMenuDelete(contextMenu.folderId)"
        style="padding: 8px 16px; cursor: pointer; font-size: 13px; color: var(--btn-red-bg, #ff4444); display: flex; align-items: center; gap: 8px; transition: background 0.2s;"
        @mouseover="$event.target.style.background='rgba(255, 68, 68, 0.1)'"
        @mouseout="$event.target.style.background='transparent'"
      >
        <i class="fas fa-trash" style="font-size: 12px; color: var(--btn-red-bg, #ff4444);"></i>
        删除
      </div>
      </div>
      
      <!-- 点击外部关闭右键菜单的遮罩 -->
      <div 
        v-if="contextMenu.visible"
      @click="closeContextMenu"
      style="position: fixed; inset: 0; z-index: 9999; background: transparent;"
      ></div>
      
      <!-- 侧边栏空白处右键：新建文件夹 -->
      <Teleport to="body">
      <div v-if="sidebarNewMenu.visible" @click.stop @contextmenu.prevent
        :style="{ position:'fixed', left:sidebarNewMenu.x+'px', top:sidebarNewMenu.y+'px', background:'var(--lm-menu-bg,#fff)', border:'1px solid var(--lm-menu-border,#e0e0e0)', borderRadius:'4px', boxShadow:'0 4px 12px rgba(0,0,0,0.15)', zIndex:10000, minWidth:'140px', padding:'4px 0' }">
        <div @click="closeSidebarNewMenu(); addFolder()"
          style="padding:8px 16px; cursor:pointer; font-size:13px; color:var(--text,#333); display:flex; align-items:center; gap:8px;"
          @mouseover="$event.currentTarget.style.background='var(--lm-menu-item-hover,#f0f0f0)'"
          @mouseout="$event.currentTarget.style.background='transparent'">
          <i class="fas fa-folder-plus" style="font-size:12px; color:var(--accent,#00b894);"></i>
          新建文件夹
        </div>
      </div>
      </Teleport>
      <div v-if="sidebarNewMenu.visible" @click="closeSidebarNewMenu()" style="position:fixed; inset:0; z-index:9998; background:transparent;"></div>
      
      <!-- 线路区空白处右键：新建文件夹、新建线路 -->
      <Teleport to="body">
      <div v-if="linesNewMenu.visible" @click.stop @contextmenu.prevent
        :style="{ position:'fixed', left:linesNewMenu.x+'px', top:linesNewMenu.y+'px', background:'var(--lm-menu-bg,#fff)', border:'1px solid var(--lm-menu-border,#e0e0e0)', borderRadius:'4px', boxShadow:'0 4px 12px rgba(0,0,0,0.15)', zIndex:10000, minWidth:'140px', padding:'4px 0' }">
        <div @click="closeLinesNewMenu(); addFolder()"
          style="padding:8px 16px; cursor:pointer; font-size:13px; color:var(--text,#333); display:flex; align-items:center; gap:8px;"
          @mouseover="$event.currentTarget.style.background='var(--lm-menu-item-hover,#f0f0f0)'"
          @mouseout="$event.currentTarget.style.background='transparent'">
          <i class="fas fa-folder-plus" style="font-size:12px; color:var(--accent,#00b894);"></i>
          新建文件夹
        </div>
        <div style="height:1px; background:var(--lm-menu-border,#e0e0e0); margin:4px 0;"></div>
        <div @click="closeLinesNewMenu(); activeFolderId && createNewLine()"
          :style="{ padding:'8px 16px', cursor: activeFolderId ? 'pointer' : 'not-allowed', fontSize:'13px', color: activeFolderId ? 'var(--text,#333)' : 'var(--muted,#999)', display:'flex', alignItems:'center', gap:'8px', opacity: activeFolderId ? 1 : 0.6 }"
          @mouseover="activeFolderId && ($event.currentTarget.style.background='var(--lm-menu-item-hover,#f0f0f0)')"
          @mouseout="$event.currentTarget.style.background='transparent'"
          :title="activeFolderId ? '新建线路' : '请先选择文件夹'">
          <i class="fas fa-plus-circle" style="font-size:12px; color:var(--btn-blue-bg,#1677ff);"></i>
          新建线路
        </div>
      </div>
      </Teleport>
      <div v-if="linesNewMenu.visible" @click="closeLinesNewMenu()" style="position:fixed; inset:0; z-index:9998; background:transparent;"></div>
      
      <!-- 线路右键菜单 - 使用 Teleport 传送到 body，允许溢出窗口 -->
      <Teleport to="body">
      <div 
        v-if="lineContextMenu.visible"
        data-line-context-menu
        @click.stop
        @contextmenu.prevent
        :style="{
          position: 'fixed',
          left: lineContextMenu.x + 'px',
          top: lineContextMenu.y + 'px',
          background: 'var(--lm-menu-bg, #fff)',
          border: '1px solid var(--lm-menu-border, #e0e0e0)',
          borderRadius: '4px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          zIndex: 9999,
          minWidth: '140px',
          padding: '4px 0'
        }"
      >
      <div 
        @click="closeLineContextMenu(); addFolder()"
        style="padding: 8px 16px; cursor: pointer; font-size: 13px; color: var(--text, #333); display: flex; align-items: center; gap: 8px; transition: background 0.2s;"
        @mouseover="$event.target.style.background='var(--lm-menu-item-hover, #f0f0f0)'"
        @mouseout="$event.target.style.background='transparent'"
      >
        <i class="fas fa-folder-plus" style="font-size: 12px; color: var(--accent, #00b894);"></i>
        新建文件夹
      </div>
      <div 
        @click="closeLineContextMenu(); activeFolderId && createNewLine()"
        :style="{ padding: '8px 16px', cursor: activeFolderId ? 'pointer' : 'not-allowed', fontSize: '13px', color: activeFolderId ? 'var(--text, #333)' : 'var(--muted, #999)', display: 'flex', alignItems: 'center', gap: '8px', transition: 'background 0.2s', opacity: activeFolderId ? 1 : 0.6 }"
        @mouseover="activeFolderId && ($event.target.style.background='var(--lm-menu-item-hover, #f0f0f0)')"
        @mouseout="$event.target.style.background='transparent'"
        :title="activeFolderId ? '新建线路' : '请先选择文件夹'"
      >
        <i class="fas fa-plus-circle" style="font-size: 12px; color: var(--btn-blue-bg, #1677ff);"></i>
        新建线路
      </div>
      <div style="height: 1px; background: var(--lm-menu-border, #e0e0e0); margin: 4px 0;"></div>
      <div 
        @click="openLine(lineContextMenu.line)"
        style="padding: 8px 16px; cursor: pointer; font-size: 13px; color: var(--text, #333); display: flex; align-items: center; gap: 8px; transition: background 0.2s;"
        @mouseover="$event.target.style.background='var(--lm-menu-item-hover, #f0f0f0)'"
        @mouseout="$event.target.style.background='transparent'"
      >
        <i class="fas fa-folder-open" style="font-size: 12px; color: var(--muted, #666);"></i>
        打开
      </div>
      <div 
        @click="renameLine(lineContextMenu.line)"
        style="padding: 8px 16px; cursor: pointer; font-size: 13px; color: var(--text, #333); display: flex; align-items: center; gap: 8px; transition: background 0.2s;"
        @mouseover="$event.target.style.background='var(--lm-menu-item-hover, #f0f0f0)'"
        @mouseout="$event.target.style.background='transparent'"
      >
        <i class="fas fa-edit" style="font-size: 12px; color: var(--muted, #666);"></i>
        重命名
      </div>
      <div style="height: 1px; background: var(--lm-menu-border, #e0e0e0); margin: 4px 0;"></div>
      <div 
        @click="copyLine(lineContextMenu.line)"
        style="padding: 8px 16px; cursor: pointer; font-size: 13px; color: var(--text, #333); display: flex; align-items: center; gap: 8px; transition: background 0.2s;"
        @mouseover="$event.target.style.background='var(--lm-menu-item-hover, #f0f0f0)'"
        @mouseout="$event.target.style.background='transparent'"
      >
        <i class="fas fa-copy" style="font-size: 12px; color: var(--muted, #666);"></i>
        复制
      </div>
      <div 
        @click="cutLine(lineContextMenu.line)"
        style="padding: 8px 16px; cursor: pointer; font-size: 13px; color: var(--text, #333); display: flex; align-items: center; gap: 8px; transition: background 0.2s;"
        @mouseover="$event.target.style.background='var(--lm-menu-item-hover, #f0f0f0)'"
        @mouseout="$event.target.style.background='transparent'"
      >
        <i class="fas fa-cut" style="font-size: 12px; color: var(--muted, #666);"></i>
        剪贴
      </div>
      <div 
        @click="pasteLine()"
        :style="{
          padding: '8px 16px',
          cursor: clipboard.type ? 'pointer' : 'not-allowed',
          fontSize: '13px',
          color: clipboard.type ? 'var(--text, #333)' : 'var(--muted, #999)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          transition: 'background 0.2s',
          opacity: clipboard.type ? 1 : 0.5
        }"
        @mouseover="clipboard.type && ($event.target.style.background='var(--lm-menu-item-hover, #f0f0f0)')"
        @mouseout="clipboard.type && ($event.target.style.background='transparent')"
      >
        <i class="fas fa-paste" :style="{fontSize: '12px', color: clipboard.type ? 'var(--muted, #666)' : 'var(--muted, #999)'}"></i>
        粘贴
      </div>
      <div style="height: 1px; background: var(--lm-menu-border, #e0e0e0); margin: 4px 0;"></div>
      <div 
        v-if="activeFolderId"
        @click="deleteLine(lineContextMenu.line)"
        style="padding: 8px 16px; cursor: pointer; font-size: 13px; color: var(--btn-red-bg, #ff4444); display: flex; align-items: center; gap: 8px; transition: background 0.2s;"
        @mouseover="$event.target.style.background='rgba(255, 68, 68, 0.1)'"
        @mouseout="$event.target.style.background='transparent'"
      >
        <i class="fas fa-trash" style="font-size: 12px; color: var(--btn-red-bg, #ff4444);"></i>
        删除
      </div>
      <div 
        v-else
        style="padding: 8px 16px; font-size: 13px; color: var(--muted, #999); display: flex; align-items: center; gap: 8px; opacity: 0.5; cursor: not-allowed;"
      >
        <i class="fas fa-trash" style="font-size: 12px; color: var(--muted, #999);"></i>
        删除
      </div>
      </div>
      </Teleport>
      
      <!-- 点击外部关闭线路右键菜单的遮罩 - 使用 Teleport 传送到 body -->
      <Teleport to="body">
      <div 
        v-if="lineContextMenu.visible"
        @click="closeLineContextMenu"
        style="position: fixed; inset: 0; z-index: 9998; background: transparent;"
      ></div>
    </Teleport>
    </div>
  `
}

