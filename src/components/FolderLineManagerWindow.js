import { ref, computed, watch, onMounted, nextTick, Teleport } from 'vue'
import LineManagerDialog from './LineManagerDialog.js'
import LineManagerTopbar from './LineManagerTopbar.js'

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
    LineManagerTopbar
  },
  setup() {
    const folders = ref([]);
    const currentFolderId = ref('default');
    const currentLines = ref([]);
    const loading = ref(false);
    const selectedFolderId = ref(null);
    const selectedLine = ref(null); // 选中的线路
    const contextMenu = ref({ visible: false, x: 0, y: 0, folderId: null, folderName: null }); // 文件夹右键菜单状态
    const lineContextMenu = ref({ visible: false, x: 0, y: 0, line: null }); // 线路右键菜单状态
    const clipboard = ref({ type: null, line: null, sourceFolderId: null, sourceFolderPath: null }); // 剪贴板状态（用于复制/剪贴）

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
        // 非 Electron 环境，使用默认文件夹
        folders.value = [{ id: 'default', name: '默认', path: '', isCurrent: true }];
        currentFolderId.value = 'default';
        selectedFolderId.value = 'default';
        // 尝试从 localStorage 加载线路列表
        try {
          const saved = localStorage.getItem('pids_global_store_v1');
          if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed.list && Array.isArray(parsed.list)) {
              currentLines.value = parsed.list.map((l, idx) => {
                const stationInfo = getStationInfo(l);
                return {
                  name: l.meta?.lineName || '未命名线路',
                  filePath: '',
                  data: l,
                  index: idx,
                  themeColor: l.meta?.themeColor || '#5F27CD',
                  firstStation: stationInfo.first,
                  lastStation: stationInfo.last
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
          currentFolderId.value = res.current || 'default';
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
                  lines.push({
                    name: d.meta.lineName || '未命名线路',
                    filePath: it.name,
                    data: d,
                    themeColor: d.meta.themeColor || '#5F27CD',
                    firstStation: stationInfo.first,
                    lastStation: stationInfo.last
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

    // 应用选中的线路
    async function applySelectedLine() {
      if (!selectedLine.value) return;
      
      try {
        // 确保当前文件夹已切换并加载
        if (selectedFolderId.value !== currentFolderId.value) {
          await loadLinesFromFolder(selectedFolderId.value);
        }
        
        // 通过 IPC 通知主窗口切换线路（Electron 环境）
        if (window.electronAPI && window.electronAPI.switchLine) {
          // 获取贯通线路选择目标（如果有）
          const target = localStorage.getItem('throughOperationSelectorTarget');
          console.log('[线路管理器] applySelectedLine 调用 switchLine, lineName:', selectedLine.value.name, 'target:', target);
          const result = await window.electronAPI.switchLine(selectedLine.value.name);
          if (result && result.ok) {
            // 切换成功，关闭窗口
            if (window.electronAPI.closeWindow) {
              await window.electronAPI.closeWindow();
            }
          }
        } else {
          // 网页环境：通过 localStorage 和 postMessage 通知主窗口
          const lineName = selectedLine.value.name;
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
              target: target
            }, '*');
          }
          
          // 触发 storage 事件（用于同源页面通信）
          window.dispatchEvent(new StorageEvent('storage', {
            key: 'lineManagerSelectedLine',
            newValue: lineName
          }));
          
          // 关闭窗口
          window.close();
        }
      } catch (e) {
        console.error('切换线路失败:', e);
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
      if (folderId === 'default') {
        if (window.__lineManagerDialog) {
          await window.__lineManagerDialog.alert('不能删除默认文件夹', '提示');
        }
        return;
      }
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
      
      // Electron 环境
      if (window.electronAPI && window.electronAPI.switchLine) {
        try {
          // 获取贯通线路选择目标（如果有）
          const target = localStorage.getItem('throughOperationSelectorTarget');
          console.log('[线路管理器] openLine 调用 switchLine, lineName:', line.name, 'target:', target);
          const result = await window.electronAPI.switchLine(line.name);
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
            target: target
          }, '*');
        }
        
        // 触发 storage 事件（用于同源页面通信）
        window.dispatchEvent(new StorageEvent('storage', {
          key: 'lineManagerSelectedLine',
          newValue: lineName
        }));
        
        // 关闭窗口
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
      
      // 检查是否为默认文件夹
      if (folderId === 'default') {
        await window.__lineManagerDialog.alert('默认文件夹不允许创建线路', '提示');
        return;
      }

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
        const fileName = cleanName + '.json';

        // 保存到当前文件夹
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
      
      // 检查是否为默认文件夹
      if (folderId === 'default') {
        await window.__lineManagerDialog.alert('默认文件夹不允许删除线路', '提示');
        return;
      }

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

        // 生成目标文件名（使用线路名称作为文件名）
        const lineName = sourceLine.name.replace(/<[^>]+>/g, '').replace(/<\/>/g, '').trim();
        const targetFileName = lineName + '.json';

        // 保存到目标文件夹
        const saveRes = await window.electronAPI.lines.save(targetFileName, readRes.content, targetFolder.path);
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

    // 组件挂载时加载数据
    onMounted(() => {
      loadFolders();
    });

    // 计算当前活动的文件夹ID
    const activeFolderId = computed(() => {
      return selectedFolderId.value ?? currentFolderId.value;
    });

    return {
      folders,
      currentFolderId,
      selectedFolderId,
      currentLines,
      loading,
      selectedLine,
      activeFolderId,
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
      contextMenu,
      lineContextMenu,
      showLineContextMenu,
      closeLineContextMenu,
      openLine,
      renameLine,
      copyLine,
      cutLine,
      pasteLine,
      deleteLine,
      createNewLine,
      clipboard
    };
  },
  components: {
    Teleport
  },
  template: `
    <div style="width:100vw; height:100vh; display:flex; flex-direction:column; background:transparent;">
      <LineManagerTopbar />
      <!-- Main Content (Two Column Layout - QQ Style) -->
      <div style="display:flex; flex:1; overflow:hidden; background:transparent;">
        <!-- Left Sidebar: Folders (类似QQ群列表) -->
        <div v-if="hasFoldersAPI && folders.length > 0" style="width:200px; border-right:1px solid var(--lm-sidebar-border, rgba(0, 0, 0, 0.08)); overflow-y:auto; background:var(--lm-sidebar-bg, rgba(255, 255, 255, 0.6)); flex-shrink:0;">
          <div style="padding:8px 0;">
            <div 
              v-for="folder in folders" 
              :key="folder.id"
              @click="selectFolder(folder.id)"
              @contextmenu.prevent="showContextMenu($event, folder)"
              :style="{
                padding: '10px 16px',
                cursor: 'pointer',
                background: selectedFolderId === folder.id ? 'var(--lm-sidebar-item-active, #e8e8e8)' : 'transparent',
                transition: 'background 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                borderLeft: selectedFolderId === folder.id ? '3px solid var(--accent, #12b7f5)' : '3px solid transparent'
              }"
              @mouseover="$event.target.style.background = selectedFolderId === folder.id ? 'var(--lm-sidebar-item-active, #e8e8e8)' : 'var(--lm-sidebar-item-hover, #f0f0f0)'"
              @mouseout="$event.target.style.background = selectedFolderId === folder.id ? 'var(--lm-sidebar-item-active, #e8e8e8)' : 'transparent'"
            >
              <i class="fas fa-folder" :style="{fontSize:'16px', color: selectedFolderId === folder.id ? 'var(--accent, #12b7f5)' : 'var(--muted, #666)'}"></i>
              <div style="flex:1; min-width:0;">
                <div style="font-size:14px; font-weight:500; color:var(--text, #333); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">{{ folder.name }}</div>
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
              <div style="width:80px; text-align:center;">颜色</div>
              <div style="flex:1;">首末站</div>
            </div>
            
            <!-- 线路列表 -->
            <div style="flex:1; overflow-y:auto; padding:0; min-height:0;">
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
                @contextmenu.prevent="showLineContextMenu($event, line)"
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
                <div style="width:200px; min-width:200px; display:flex; align-items:center; gap:10px;" @click="toggleLineSelection(line)">
                  <i class="fas fa-subway" style="font-size:16px; color:var(--muted, #999);"></i>
                  <div style="font-size:14px; font-weight:500; color:var(--text, #333); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" v-html="parseColorMarkup(line.name)"></div>
                </div>
                
                <!-- 颜色 -->
                <div style="width:80px; min-width:80px; display:flex; justify-content:center;">
                  <div :style="{width:'24px', height:'24px', borderRadius:'4px', background:line.themeColor || '#5F27CD', border:'1px solid var(--lm-header-border, #e0e0e0)', flexShrink:0}"></div>
                </div>
                
                <!-- 首末站 -->
                <div style="flex:1; min-width:0; font-size:13px; color:var(--muted, #666); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" @click="toggleLineSelection(line)">
                  <span v-if="line.firstStation && line.lastStation">{{ line.firstStation }} → {{ line.lastStation }}</span>
                  <span v-else style="color:var(--muted, #999);">-</span>
                </div>
              </div>
            </div>
            
            <!-- 底部操作栏 -->
            <div style="padding:12px 20px; background:var(--lm-bottom-bar-bg, rgba(250, 250, 250, 0.85)); border-top:1px solid var(--lm-bottom-bar-border, rgba(224, 224, 224, 0.5)); display:flex; justify-content:space-between; align-items:center; flex-shrink:0;">
              <!-- 左侧信息区域 -->
              <div style="display:flex; align-items:center; gap:16px; flex:1;">
                <button 
                  v-if="hasFoldersAPI"
                  @click="addFolder()" 
                  style="background:transparent; color:var(--muted, #666); border:1px solid var(--lm-header-border, #d0d0d0); padding:6px 14px; border-radius:4px; font-size:13px; font-weight:400; cursor:pointer; display:flex; align-items:center; gap:6px; transition:all 0.2s;"
                  @mouseover="$event.target.style.background='var(--lm-list-item-hover, #f0f0f0)'; $event.target.style.borderColor='var(--lm-header-border, #bbb)'"
                  @mouseout="$event.target.style.background='transparent'; $event.target.style.borderColor='var(--lm-header-border, #d0d0d0)'"
                >
                  <i class="fas fa-plus" style="font-size:12px;"></i> 添加文件夹
                </button>
                
                <button 
                  @click="createNewLine()" 
                  :disabled="activeFolderId === 'default'"
                  :style="{
                    background: activeFolderId === 'default' ? 'var(--btn-gray-bg, #d9d9d9)' : 'var(--btn-blue-bg, #1677ff)',
                    color: 'var(--btn-text, #fff)',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '6px 12px',
                    fontSize: '13px',
                    fontWeight: '500',
                    cursor: activeFolderId === 'default' ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    transition: 'all 0.2s',
                    opacity: activeFolderId === 'default' ? 0.6 : 1
                  }"
                  @mouseover="activeFolderId !== 'default' && ($event.target.style.background='#0958d9')"
                  @mouseout="activeFolderId !== 'default' && ($event.target.style.background='var(--btn-blue-bg, #1677ff)')"
                  :title="activeFolderId === 'default' ? '默认文件夹不允许创建线路' : '新建线路'"
                >
                  <i class="fas fa-plus" style="font-size:12px;"></i> 新建线路
                </button>
                
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
                <button 
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
        minWidth: '120px',
        padding: '4px 0'
      }"
    >
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
        v-if="contextMenu.folderId !== 'default'"
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
          minWidth: '120px',
          padding: '4px 0'
        }"
      >
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
        v-if="activeFolderId !== 'default'"
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
        删除（默认文件夹不允许删除）
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

