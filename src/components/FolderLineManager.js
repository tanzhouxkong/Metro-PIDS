import { ref, computed, watch, onMounted } from 'vue'

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
  name: 'FolderLineManager',
  props: {
    modelValue: {
      type: Boolean,
      default: false
    },
    pidsState: {
      type: Object,
      required: true
    },
    fileIO: {
      type: Object,
      required: true
    },
    onSwitchLine: {
      type: Function,
      required: true
    }
  },
  emits: ['update:modelValue', 'switchLine'],
  setup(props, { emit }) {
    const showDialog = computed({
      get: () => props.modelValue,
      set: (val) => emit('update:modelValue', val)
    });

    const folders = ref([]);
    const currentFolderId = ref(null);
    const currentLines = ref([]);
    const loading = ref(false);
    const selectedFolderId = ref(null);

    // 加载文件夹列表
    async function loadFolders() {
      if (!(window.electronAPI && window.electronAPI.lines && window.electronAPI.lines.folders)) {
        folders.value = [];
        currentFolderId.value = null;
        selectedFolderId.value = null;
        // 尝试从 pidsState 加载线路列表
        if (props.pidsState && props.pidsState.store && props.pidsState.store.list) {
          currentLines.value = props.pidsState.store.list.map((l, idx) => ({
            name: l.meta?.lineName || '未命名线路',
            filePath: '',
            data: l,
            index: idx
          }));
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

    // 从文件夹加载线路
    async function loadLinesFromFolder(folderId) {
      if (!(window.electronAPI && window.electronAPI.lines)) {
        // 非 Electron 环境，使用 pidsState 中的线路列表
        if (props.pidsState && props.pidsState.store && props.pidsState.store.list) {
          currentLines.value = props.pidsState.store.list.map((l, idx) => {
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
        return;
      }
      loading.value = true;
      try {
        // 先切换文件夹
        if (folderId !== currentFolderId.value) {
          const switchRes = await window.electronAPI.lines.folders.switch(folderId);
          if (switchRes && switchRes.ok) {
            currentFolderId.value = folderId;
            selectedFolderId.value = folderId;
          }
        }
        
        // 加载线路列表
        const items = await window.electronAPI.lines.list();
        const lines = [];
        if (Array.isArray(items)) {
          for (const it of items) {
            try {
              const res = await window.electronAPI.lines.read(it.name);
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
      } catch (e) {
        console.error('加载线路失败:', e);
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

    // 选择线路
    async function selectLine(line) {
      try {
        if (!line) {
          console.warn('selectLine: line is null/undefined');
          return;
        }
        if (!line.name) {
          console.warn('selectLine: line.name is empty', line);
          return;
        }
        // 确保当前文件夹已切换并加载
        if (selectedFolderId.value !== currentFolderId.value) {
          await loadLinesFromFolder(selectedFolderId.value);
        }
        
        // 刷新全局线路列表以包含当前文件夹的线路
        if (props.fileIO && props.fileIO.refreshLinesFromFolder) {
          await props.fileIO.refreshLinesFromFolder(true);
        }
        
        const selectedName = String(line.name);
        // 找到线路在当前列表中的索引
        const idx = props.pidsState.store.list.findIndex(l => {
          if (!l || !l.meta || !l.meta.lineName) return false;
          // 移除颜色标记后比较
          const cleanLineName = String(l.meta.lineName).replace(/<[^>]+>([^<]*)<\/>/g, '$1');
          const cleanSelectedName = selectedName.replace(/<[^>]+>([^<]*)<\/>/g, '$1');
          return cleanLineName === cleanSelectedName || l.meta.lineName === selectedName;
        });
        
        if (idx >= 0) {
          // 调用父组件的switchLine函数
          if (typeof props.onSwitchLine === 'function') {
            props.onSwitchLine(idx);
          }
          emit('switchLine', idx);
          showDialog.value = false;
        } else {
          console.warn('线路未找到:', selectedName);
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
        const res = await window.electronAPI.lines.folders.add();
        if (res && res.ok) {
          await loadFolders();
        }
      } catch (e) {
        console.error('添加文件夹失败:', e);
      }
    }

    // 删除文件夹
    async function deleteFolder(folderId, folderName) {
      if (!confirm(`确定要删除文件夹"${folderName}"吗？删除后文件夹配置将被移除，但文件本身不会被删除。`)) {
        return;
      }
      if (!(window.electronAPI && window.electronAPI.lines && window.electronAPI.lines.folders)) {
        return;
      }
      try {
        const res = await window.electronAPI.lines.folders.remove(folderId);
        if (res && res.ok) {
          await loadFolders();
        }
      } catch (e) {
        console.error('删除文件夹失败:', e);
      }
    }

    // 重命名文件夹
    async function renameFolder(folderId, currentName) {
      if (!(window.electronAPI && window.electronAPI.lines && window.electronAPI.lines.folders)) {
        return;
      }
      const newName = prompt('请输入新的文件夹名称', currentName);
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

    // 打开文件夹
    async function openFolder() {
      if (props.fileIO && props.fileIO.openLinesFolder) {
        await props.fileIO.openLinesFolder();
      }
    }

    // 检查是否有文件夹管理 API
    const hasFoldersAPI = computed(() => {
      return typeof window !== 'undefined' && window.electronAPI && window.electronAPI.lines && window.electronAPI.lines.folders;
    });

    // 监听弹窗打开
    watch(showDialog, (val) => {
      if (val) {
        loadFolders();
      }
    });

    return {
      showDialog,
      folders,
      currentFolderId,
      selectedFolderId,
      currentLines,
      loading,
      selectFolder,
      selectLine,
      addFolder,
      deleteFolder,
      renameFolder,
      openFolder,
      parseColorMarkup,
      hasFoldersAPI,
      getStationInfo
    };
  }}

