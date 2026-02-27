import dialogService from '../utils/dialogService.js'
import { showNotification } from '../utils/notificationService.js'

/**
 * 清理文件名，移除不符合文件系统规则的字符
 * Windows 不允许的字符: < > : " / \ | ? * 以及控制字符
 * @param {string} filename - 原始文件名
 * @returns {string} - 清理后的文件名
 */
function sanitizeFilename(filename) {
    if (!filename || typeof filename !== 'string') return 'untitled';
    
    // 先移除颜色标记（<color>文字</>），提取纯文本
    // 使用正则表达式匹配并提取标记内的文字
    let cleaned = filename.replace(/<[^>]+>([^<]*)<\/>/g, '$1');
    
    // 移除 Windows 不允许的字符: < > : " / \ | ? *
    cleaned = cleaned.replace(/[<>:"/\\|?*]/g, '');
    
    // 移除控制字符（0x00-0x1F）和删除字符（0x7F）
    cleaned = cleaned.replace(/[\x00-\x1F\x7F]/g, '');
    
    // 移除首尾空格和点号（Windows 不允许文件名以点号结尾）
    cleaned = cleaned.trim().replace(/\.+$/, '');
    
    // 移除连续的空格
    cleaned = cleaned.replace(/\s+/g, ' ');
    
    // 如果清理后为空，使用默认名称
    if (!cleaned || cleaned.length === 0) {
        cleaned = 'untitled';
    }
    
    // Windows 文件名长度限制（不包括扩展名）
    if (cleaned.length > 255) {
        cleaned = cleaned.substring(0, 255);
    }
    
    // 移除 Windows 保留名称（CON, PRN, AUX, NUL, COM1-9, LPT1-9）
    const reservedNames = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/i;
    if (reservedNames.test(cleaned)) {
        cleaned = 'file_' + cleaned;
    }
    
    return cleaned;
}

const normalizeLineNameForPath = (n) => (n ? String(n).replace(/<[^>]+>([^<]*)<\/>/g, '$1').trim() : '');

const persistLinePathInfo = (state) => {
    if (typeof localStorage === 'undefined') return;
    try {
        const map = {};
        if (state.lineNameToFilePath && typeof state.lineNameToFilePath === 'object') {
            Object.entries(state.lineNameToFilePath).forEach(([k, v]) => {
                if (!v || typeof v !== 'string') return;
                map[k] = v;
                const clean = normalizeLineNameForPath(k);
                if (clean && clean !== k && !map[clean]) map[clean] = v;
            });
        }
        const payload = { currentFilePath: state.currentFilePath || null, map };
        localStorage.setItem('pids_line_path_map_v1', JSON.stringify(payload));
    } catch (e) {
        console.warn('[useFileIO] Failed to persist line path info', e);
    }
};

export function useFileIO(state) {
    
    const showMsg = async (msg, title) => dialogService.alert(msg, title)
    const askUser = async (msg, title) => dialogService.confirm(msg, title)

    function normalizeLine(line) {
        if (!line || !line.meta) return line;
        if (!Array.isArray(line.stations)) line.stations = [];
        line.stations = line.stations.map(s => {
            if (typeof s !== 'object' || s === null) s = { name: String(s || ''), en: '', xfer: [] };
            if (!('door' in s)) s.door = 'left';
            if (!('skip' in s)) s.skip = false;
            if (!('dock' in s)) s.dock = 'both';
            if (!('xfer' in s) || !Array.isArray(s.xfer)) s.xfer = [];
            if (!('en' in s)) s.en = '';
            if (!('name' in s)) s.name = '';
            // 添加折返位置和大站停靠的默认值
            if (!('turnback' in s)) s.turnback = false;
            if (!('expressStop' in s)) s.expressStop = false;
            // 车站音频：统一为新版单列表 list；旧版 welcome/depart/arrive/end 会合并为 list 并移除旧字段，保存的 JSON 只含 list
            if (!s.stationAudio || typeof s.stationAudio !== 'object') {
                s.stationAudio = {
                    separateDirection: true,
                    up: { list: [] },
                    down: { list: [] }
                };
            } else {
                const toListOnly = (d) => {
                    if (!d || typeof d !== 'object') return { list: [] };
                    const w = Array.isArray(d.welcome) ? d.welcome : [];
                    const dep = Array.isArray(d.depart) ? d.depart : [];
                    const arr = Array.isArray(d.arrive) ? d.arrive : [];
                    const e = Array.isArray(d.end) ? d.end : [];
                    if (Array.isArray(d.list)) {
                        delete d.welcome; delete d.depart; delete d.arrive; delete d.end;
                        return d;
                    }
                    return { list: [...w, ...dep, ...arr, ...e] };
                };
                if (!s.stationAudio.up || typeof s.stationAudio.up !== 'object') s.stationAudio.up = { list: [] };
                else s.stationAudio.up = toListOnly(s.stationAudio.up);
                if (!s.stationAudio.down || typeof s.stationAudio.down !== 'object') s.stationAudio.down = { list: [] };
                else s.stationAudio.down = toListOnly(s.stationAudio.down);
                if (typeof s.stationAudio.separateDirection !== 'boolean') s.stationAudio.separateDirection = true;
            }
            return s;
        });
        if (!line.meta.lineName) line.meta.lineName = '线路';
        if (!('startIdx' in line.meta)) line.meta.startIdx = -1;
        if (!('termIdx' in line.meta)) line.meta.termIdx = -1;
        // 确保 serviceMode 存在
        if (!('serviceMode' in line.meta)) line.meta.serviceMode = 'normal';
        if (!line.meta.commonAudio || typeof line.meta.commonAudio !== 'object') {
            line.meta.commonAudio = { separateDirection: true, up: { list: [] }, down: { list: [] } };
        } else {
            const ca = line.meta.commonAudio;
            const toList = (d) => {
                if (!d || typeof d !== 'object') return { list: [] };
                if (Array.isArray(d.list)) return { list: d.list };
                const w = Array.isArray(d.welcome) ? d.welcome : [];
                const dep = Array.isArray(d.depart) ? d.depart : [];
                const arr = Array.isArray(d.arrive) ? d.arrive : [];
                const e = Array.isArray(d.end) ? d.end : [];
                return { list: [...w, ...dep, ...arr, ...e] };
            };
            if (Array.isArray(ca.list)) {
                line.meta.commonAudio = { separateDirection: false, up: { list: ca.list }, down: { list: [] } };
            } else {
                line.meta.commonAudio = {
                    separateDirection: ca.separateDirection !== false,
                    up: toList(ca.up),
                    down: toList(ca.down)
                };
            }
        }
        // 兼容旧文件：无 schemaVersion 视为 1
        if (typeof line.meta.schemaVersion !== 'number') line.meta.schemaVersion = 1;
        // 移除 audioLayout 字段（如果存在），统一使用 nested 布局（audio/ 子目录）
        if ('audioLayout' in line.meta) {
            delete line.meta.audioLayout;
        }
        return line;
    }

    /** 当前保存使用的 schema 版本（新版本逻辑与格式） */
    const SAVE_SCHEMA_VERSION = 2;
    // 串行化保存，避免并发静默保存导致同一路径写入/重命名冲突
    let saveQueue = Promise.resolve();

    /**
     * @param {{ silent?: boolean }} [options] - silent: true 时不显示保存成功提示（如站点编辑保存时）
     */
    async function saveCurrentLine(options) {
        const task = async () => {
        const silent = options && options.silent === true;
        if (!state || !state.store || !state.store.list) return;
        const cur = state.store.list[state.store.cur];
        if (!cur || !cur.meta || !cur.meta.lineName) {
            await showMsg('当前线路数据无效，无法保存');
            return;
        }
        
        // 清理线路名称（移除HTML标签）用于生成文件名
        const cleanLineName = cur.meta.lineName.replace(/<[^>]+>([^<]*)<\/>/g, '$1').trim();
        // 默认保存为 .mpl 线路包（内含音频），不再生成单独的 .json
        const expectedFileName = sanitizeFilename(cleanLineName) + '.mpl';
        
        // 调试信息
        console.log('[saveCurrentLine] 开始保存:', {
            lineName: cleanLineName,
            currentFilePath: state.currentFilePath,
            currentFolderId: state.currentFolderId,
            folders: state.folders
        });
        
        // 确定保存路径：优先使用 currentFilePath（如果它是完整路径）
        let filePath;
        const getDirPart = (p) => {
            if (!p || typeof p !== 'string') return null;
            const idx = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
            return idx >= 0 ? p.substring(0, idx + 1) : null;
        };
        let lastKnownSaveDir = state.lastKnownSaveDir || null;
        if (state.currentFilePath) {
            const dir = getDirPart(state.currentFilePath);
            if (dir) lastKnownSaveDir = dir;
        }
        
        // 获取当前文件夹路径（用于构建完整保存路径，作为后备方案）
        let currentFolderPath = null;
        if (state.currentFolderId && state.folders && Array.isArray(state.folders)) {
            const currentFolder = state.folders.find(f => f.id === state.currentFolderId);
            if (currentFolder && currentFolder.path) {
                currentFolderPath = currentFolder.path;
            }
        }
        
        console.log('[saveCurrentLine] 文件夹信息:', {
            currentFolderPath,
            currentFolderId: state.currentFolderId
        });
        
        if (state.currentFilePath) {
            // 检查 currentFilePath 是否是完整路径（包含 / 或 \）
            const lastSlash = Math.max(state.currentFilePath.lastIndexOf('/'), state.currentFilePath.lastIndexOf('\\'));
            const isFullPath = lastSlash >= 0;
            
            // 检查是否是绝对路径
            const isAbsolute = state.currentFilePath.match(/^[A-Za-z]:[\\/]/) || state.currentFilePath.startsWith('/') || state.currentFilePath.startsWith('\\\\');
            
            console.log('[saveCurrentLine] currentFilePath 分析:', {
                currentFilePath: state.currentFilePath,
                isFullPath,
                isAbsolute,
                lastSlash
            });
            
            if (isFullPath && isAbsolute) {
                // currentFilePath 是绝对路径，直接使用（保持在同一文件夹）
                // 即使文件名可能不匹配，也使用原路径的文件夹
                const dir = state.currentFilePath.substring(0, lastSlash + 1);
                filePath = dir + expectedFileName;
                console.log('[saveCurrentLine] 使用绝对路径，构建 filePath:', filePath);
            } else if (isFullPath && !isAbsolute) {
                // currentFilePath 是相对路径（包含路径分隔符但不是绝对路径）
                // 这种情况不应该发生，但为了安全，使用当前文件夹路径
                if (currentFolderPath) {
                    const separator = currentFolderPath.includes('\\') ? '\\' : '/';
                    const normalizedPath = currentFolderPath.endsWith(separator) ? currentFolderPath : currentFolderPath + separator;
                    filePath = normalizedPath + expectedFileName;
                    console.log('[saveCurrentLine] 相对路径，使用当前文件夹，构建 filePath:', filePath);
                } else {
                    filePath = expectedFileName;
                    console.log('[saveCurrentLine] 相对路径但无当前文件夹，使用文件名:', filePath);
                }
            } else {
                // currentFilePath 只有文件名，需要加上文件夹路径
                if (currentFolderPath) {
                    const separator = currentFolderPath.includes('\\') ? '\\' : '/';
                    const normalizedPath = currentFolderPath.endsWith(separator) ? currentFolderPath : currentFolderPath + separator;
                    filePath = normalizedPath + expectedFileName;
                    console.log('[saveCurrentLine] 只有文件名，使用当前文件夹，构建 filePath:', filePath);
                } else {
                    // 没有当前文件夹路径，仅使用文件名（由保存接口决定目标目录）
                    filePath = expectedFileName;
                    console.log('[saveCurrentLine] 只有文件名且无当前文件夹，使用文件名:', filePath);
                }
            }
        } else {
            // 如果没有 currentFilePath，使用当前文件夹路径
            if (currentFolderPath) {
                const separator = currentFolderPath.includes('\\') ? '\\' : '/';
                const normalizedPath = currentFolderPath.endsWith(separator) ? currentFolderPath : currentFolderPath + separator;
                filePath = normalizedPath + expectedFileName;
                console.log('[saveCurrentLine] 无 currentFilePath，使用当前文件夹，构建 filePath:', filePath);
            } else if (lastKnownSaveDir) {
                const separator = lastKnownSaveDir.includes('\\') ? '\\' : '/';
                const normalizedPath = lastKnownSaveDir.endsWith(separator) ? lastKnownSaveDir : lastKnownSaveDir + separator;
                filePath = normalizedPath + expectedFileName;
                console.log('[saveCurrentLine] 无 currentFilePath，但有上次保存目录，沿用:', filePath);
            } else {
                // 如果找不到当前文件夹路径，使用线路名称生成新路径（由保存接口决定目标目录）
                filePath = expectedFileName;
                console.log('[saveCurrentLine] 无 currentFilePath 且无当前文件夹，使用文件名:', filePath);
            }
        }

        // 兜底：如果仍然只有文件名且有上次保存目录，补全目录
        if (filePath && !filePath.includes('/') && !filePath.includes('\\') && lastKnownSaveDir) {
            const separator = lastKnownSaveDir.includes('\\') ? '\\' : '/';
            const normalizedPath = lastKnownSaveDir.endsWith(separator) ? lastKnownSaveDir : lastKnownSaveDir + separator;
            filePath = normalizedPath + filePath;
            console.log('[saveCurrentLine] 兜底补全目录:', filePath);
        }
        
        if (window.electronAPI && window.electronAPI.lines && typeof window.electronAPI.lines.save === 'function') {
            try {
                const normalized = normalizeLine(JSON.parse(JSON.stringify(cur)));
                normalized.meta = normalized.meta || {};
                normalized.meta.schemaVersion = SAVE_SCHEMA_VERSION;

                // 处理文件路径：如果 filePath 是完整路径，需要分离文件夹路径和文件名
                let saveFileName = filePath;
                let saveDir = null;
                
                const lastSlash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
                if (lastSlash >= 0) {
                    // filePath 包含路径分隔符，可能是完整路径
                    // 检查是否是绝对路径（Windows: C:\ 或 \\，Unix: /）
                    const isAbsolute = filePath.match(/^[A-Za-z]:[\\/]/) || filePath.startsWith('/') || filePath.startsWith('\\\\');
                    
                    console.log('[saveCurrentLine] 路径分离分析:', {
                        filePath,
                        lastSlash,
                        isAbsolute
                    });
                    
                    if (isAbsolute) {
                        // 是绝对路径，需要分离文件夹路径和文件名
                        saveDir = filePath.substring(0, lastSlash);
                        saveFileName = filePath.substring(lastSlash + 1);
                        console.log('[saveCurrentLine] 绝对路径分离结果:', {
                            saveDir,
                            saveFileName
                        });
                    } else {
                        // 是相对路径，直接使用 filePath 作为 filename
                        saveFileName = filePath;
                        saveDir = null;
                        console.log('[saveCurrentLine] 相对路径，直接使用:', {
                            saveFileName,
                            saveDir
                        });
                    }
                } else {
                    console.log('[saveCurrentLine] 无路径分隔符，直接使用文件名:', saveFileName);
                }
                
                console.log('[saveCurrentLine] 调用保存接口，参数:', {
                    saveFileName,
                    saveDir,
                    lineName: cleanLineName
                });

                const sourceLinePath = state.currentFilePath || null;
                
                // 调用保存接口：如果 saveDir 存在，传文件夹路径；否则传 null（使用当前文件夹）
                const res = await window.electronAPI.lines.save(saveFileName, normalized, saveDir, sourceLinePath);
                
                console.log('[saveCurrentLine] 保存结果:', res);
                if (res && res.ok) {
                    // 更新当前文件路径为实际保存的路径
                    state.currentFilePath = res.path || filePath;
                    const dirFromRes = getDirPart(state.currentFilePath);
                    if (dirFromRes) state.lastKnownSaveDir = dirFromRes;
                    // 静默保存（如站点编辑）时不显示保存成功提示
                    if (!silent) {
                        const cleanLineName = cur.meta.lineName.replace(/<[^>]+>([^<]*)<\/>/g, '$1').trim();
                        showNotification(
                            '保存成功',
                            `线路 "${cleanLineName}" 已保存\n${res.path || filePath}`
                        );
                    }
                    // 保存后自动清理线路目录下未引用的音频（保留 .mpl 内部打包的文件）
                    if (window.electronAPI?.lines?.cleanupAudioDir) {
                        const savedPath = res.path || state.currentFilePath || filePath;
                        window.electronAPI.lines.cleanupAudioDir(normalized, savedPath, { removeAllForMpl: true })
                            .catch((e) => console.warn('[saveCurrentLine] cleanupAudioDir failed', e));
                    }
                } else {
                    await showMsg('保存失败: ' + (res && res.error), '保存失败');
                }
            } catch (e) { 
                await showMsg('保存失败: ' + e.message, '保存失败');
            }
            return;
        }
        if (silent) return;
        await showMsg('无法保存：未检测到宿主文件保存接口。请先使用"打开文件夹"选择一个线路文件夹，再保存。', '保存失败');
        };
        // 将保存串行排队，防止同一时间双重调用导致 .tmp 重命名失败
        const p = saveQueue.then(task).catch((e) => { console.warn('[saveCurrentLine] queued save failed', e); });
        saveQueue = p.then(() => {});
        return p;
    }

    async function openLinesFolder() {
        if (!(window.electronAPI && window.electronAPI.lines)) {
            await showMsg('仅 Electron 环境支持打开保存目录');
            return;
        }
        
        // 优先使用当前线路的真实位置
        let folderPath = null;
        
        if (state.currentFilePath) {
            // 从 currentFilePath 提取文件夹路径
            const lastSlash = Math.max(state.currentFilePath.lastIndexOf('/'), state.currentFilePath.lastIndexOf('\\'));
            if (lastSlash >= 0) {
                // 检查是否是绝对路径
                const isAbsolute = state.currentFilePath.match(/^[A-Za-z]:[\\/]/) || state.currentFilePath.startsWith('/') || state.currentFilePath.startsWith('\\\\');
                if (isAbsolute) {
                    folderPath = state.currentFilePath.substring(0, lastSlash);
                }
            }
        }
        
        // 如果无法从 currentFilePath 获取，使用当前文件夹路径
        if (!folderPath && state.currentFolderId && state.folders && Array.isArray(state.folders)) {
            const currentFolder = state.folders.find(f => f.id === state.currentFolderId);
            if (currentFolder && currentFolder.path) {
                folderPath = currentFolder.path;
            }
        }
        
        // 如果有文件夹路径，使用它；否则让用户选择文件夹
        if (folderPath && window.electronAPI.lines.folders && window.electronAPI.lines.folders.open) {
            const res = await window.electronAPI.lines.folders.open(folderPath);
            if (!res || !res.ok) {
                await showMsg('打开失败: ' + (res && res.error || '未知错误'));
            }
        } else if (window.electronAPI.lines.openFolder) {
            const res = await window.electronAPI.lines.openFolder();
            if (!res || !res.ok) {
                await showMsg('打开失败: ' + (res && res.error || '未知错误'));
            }
        } else {
            await showMsg('无法打开文件夹：未找到可用的文件夹打开接口');
        }
    }

    // 可选 dir 参数：指定从哪一个物理文件夹刷新线路
    // 不传时使用当前“活动文件夹”（与之前行为保持一致）
    async function refreshLinesFromFolder(silent = false, dir = null) {
        if (!(window.electronAPI && window.electronAPI.lines && typeof window.electronAPI.lines.list === 'function')) {
            if (!silent) await showMsg('仅 Electron 环境支持从线路文件夹刷新');
            return;
        }
        try {
            // 确定列表目录：优先传入的 dir，否则当前文件夹路径，否则从 currentFilePath 推导（避免从错误目录刷新导致路径被覆盖）
            let folderPath = dir;
            if (!folderPath && state.currentFolderId && state.folders && Array.isArray(state.folders)) {
                const currentFolder = state.folders.find(f => f.id === state.currentFolderId);
                if (currentFolder && currentFolder.path) {
                    folderPath = currentFolder.path;
                }
            }
            if (!folderPath && state.currentFilePath && typeof state.currentFilePath === 'string') {
                const trimmed = state.currentFilePath.trim();
                const isAbsolute = /^[A-Za-z]:[\\/]/.test(trimmed) || trimmed.startsWith('/') || trimmed.startsWith('\\\\');
                if (isAbsolute) {
                    const lastSep = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
                    if (lastSep > 0) folderPath = trimmed.substring(0, lastSep);
                }
            }
            const items = await window.electronAPI.lines.list(folderPath || undefined);
            if (!Array.isArray(items) || items.length === 0) {
                // 如果是切换文件夹后的静默刷新，不显示提示
                if (!silent) await showMsg('未发现已保存的线路文件');
                // 确保列表为空
                state.store.list = [];
                state.store.cur = 0;
                state.appData = null;
                return;
            }
            const detected = [];
            const filePathMap = new Map(); // 用于映射线路名称到文件路径
            // 构建完整路径的辅助函数
            const buildFullPath = (fileName) => {
                if (!fileName) return fileName;
                // 如果已经是完整路径（包含 / 或 \），直接返回
                if (fileName.includes('/') || fileName.includes('\\')) {
                    return fileName;
                }
                // 如果有文件夹路径，构建完整路径
                if (folderPath) {
                    const separator = folderPath.includes('\\') ? '\\' : '/';
                    const normalizedPath = folderPath.endsWith(separator) ? folderPath : folderPath + separator;
                    return normalizedPath + fileName;
                }
                // 否则返回文件名（会在保存时使用当前文件夹路径）
                return fileName;
            };
            for (const it of items) {
                try {
                    const res = await window.electronAPI.lines.read(it.name, folderPath || undefined);
                    if (res && res.ok && res.content) {
                        const d = res.content;
                        if (d && d.meta && Array.isArray(d.stations)) {
                            const normalized = normalizeLine(d);
                            detected.push(normalized);
                            // 保存线路名称到文件路径的映射（优先使用主进程返回的 fullPath，其次使用本地构建的完整路径）
                            if (normalized.meta && normalized.meta.lineName) {
                                // it.fullPath 由主进程的 findJsonFiles 返回，通常是绝对路径
                                const fullPath = (it.fullPath && typeof it.fullPath === 'string' && it.fullPath.trim())
                                    ? it.fullPath
                                    : buildFullPath(it.name);
                                filePathMap.set(normalized.meta.lineName, fullPath);
                            }
                        }
                    }
                } catch (e) { console.warn('读取文件失败', it.name, e); }
            }

            if (detected.length === 0) {
                if (!silent) await showMsg('未检测到有效线路文件');
                state.store.list = [];
                state.store.cur = 0;
                state.appData = null;
                return;
            }
            
            // 如果是切换文件夹后的刷新，直接替换列表；否则合并
            if (silent) {
                // 切换文件夹：直接替换
                state.store.list = detected;
                state.store.cur = 0;
                state.appData = state.store.list[0] || null;
            } else {
                // 手动刷新：合并更新
                let added = 0, updated = 0;
                for (const it of detected) {
                    const idx = state.store.list.findIndex(s => s.meta && s.meta.lineName === (it.meta && it.meta.lineName));
                    if (idx >= 0) {
                        state.store.list[idx] = it; updated++; 
                    } else {
                        state.store.list.push(it); added++; 
                    }
                }
                if (state.store.cur < 0 || state.store.cur >= state.store.list.length) {
                    state.store.cur = Math.max(0, state.store.list.length - 1);
                }
                state.appData = state.store.list[state.store.cur] || null;
                await showMsg('刷新完成，新增: ' + added + '，更新: ' + updated);
            }
            
            state.rt = { idx: 0, state: 0 };
            
            // 更新线路名称到文件路径的映射（同时用原始名和去色名做 key，便于后续用任一种查找）
            const cleanLineName = (name) => (name && String(name).replace(/<[^>]+>([^<]*)<\/>/g, '$1').trim()) || '';
            filePathMap.forEach((filePath, lineName) => {
                state.lineNameToFilePath[lineName] = filePath;
                const clean = cleanLineName(lineName);
                if (clean && clean !== lineName) state.lineNameToFilePath[clean] = filePath;
            });

            // 更新当前文件的路径信息
            if (state.appData && state.appData.meta && state.appData.meta.lineName) {
                const name = state.appData.meta.lineName;
                const filePath = state.lineNameToFilePath[name] || state.lineNameToFilePath[cleanLineName(name)];
                if (filePath) {
                    state.currentFilePath = filePath;
                } else {
                    state.currentFilePath = null;
                    console.log('[refreshLinesFromFolder] 未找到文件路径，清空 currentFilePath:', { lineName: name });
                }
            } else {
                state.currentFilePath = null;
                console.log('[refreshLinesFromFolder] 无 appData 或 lineName，清空 currentFilePath');
            }
<<<<<<< Updated upstream
<<<<<<< Updated upstream
=======

            persistLinePathInfo(state);
>>>>>>> Stashed changes
=======

            persistLinePathInfo(state);
>>>>>>> Stashed changes
            
            // 若可用则触发同步，否则依赖响应式更新
            if (typeof window.sync === 'function') window.sync();
        } catch (e) {
            console.error(e);
            if (!silent) await showMsg('刷新失败: ' + (e && e.message));
        }
    }

    // 多文件夹管理函数
    async function loadFolders() {
        if (!(window.electronAPI && window.electronAPI.lines && window.electronAPI.lines.folders)) {
            return;
        }
        try {
            const res = await window.electronAPI.lines.folders.list();
            if (res && res.ok && res.folders) {
                state.folders = res.folders;
                const firstId = (res.folders && res.folders[0]) ? res.folders[0].id : null;
                state.currentFolderId = res.current || firstId;
            }
        } catch (e) {
            console.error('加载文件夹列表失败:', e);
        }
    }

    async function switchFolder(folderId) {
        if (!(window.electronAPI && window.electronAPI.lines && window.electronAPI.lines.folders)) {
            await showMsg('仅 Electron 环境支持文件夹切换');
            return;
        }
        try {
            const res = await window.electronAPI.lines.folders.switch(folderId);
            if (res && res.ok) {
                state.currentFolderId = folderId;
                // 切换文件夹后，清空当前线路列表并重新加载
                state.store.list = [];
                state.store.cur = 0;
                state.appData = null;
                // 刷新线路列表（从新文件夹加载，静默模式不显示提示）
                await refreshLinesFromFolder(true);
                // 不显示提示，避免频繁切换时弹出太多提示
            } else {
                await showMsg('切换文件夹失败: ' + (res && res.error));
            }
        } catch (e) {
            await showMsg('切换文件夹失败: ' + e.message);
        }
    }

    async function addFolder() {
        if (!(window.electronAPI && window.electronAPI.lines && window.electronAPI.lines.folders)) {
            await showMsg('仅 Electron 环境支持添加文件夹');
            return;
        }
        try {
            const res = await window.electronAPI.lines.folders.add();
            if (res && res.ok) {
                // 刷新文件夹列表
                await loadFolders();
                await showMsg('已添加文件夹: ' + res.name);
            } else {
                if (res && res.error === 'cancelled') {
                    // 用户取消，不显示错误
                    return;
                }
                await showMsg('添加文件夹失败: ' + (res && res.error));
            }
        } catch (e) {
            await showMsg('添加文件夹失败: ' + e.message);
        }
    }

    async function removeFolder(folderId) {
        if (!(window.electronAPI && window.electronAPI.lines && window.electronAPI.lines.folders)) {
            await showMsg('仅 Electron 环境支持删除文件夹');
            return;
        }
        try {
            const res = await window.electronAPI.lines.folders.remove(folderId);
            if (res && res.ok) {
                // 刷新文件夹列表
                await loadFolders();
                // 如果删除的是当前文件夹，切换后会刷新线路列表
                await refreshLinesFromFolder();
                await showMsg('已删除文件夹');
            } else {
                await showMsg('删除文件夹失败: ' + (res && res.error));
            }
        } catch (e) {
            await showMsg('删除文件夹失败: ' + e.message);
        }
    }

    async function renameFolder(folderId, newName) {
        if (!(window.electronAPI && window.electronAPI.lines && window.electronAPI.lines.folders)) {
            await showMsg('仅 Electron 环境支持重命名文件夹');
            return;
        }
        try {
            const res = await window.electronAPI.lines.folders.rename(folderId, newName);
            if (res && res.ok) {
                // 刷新文件夹列表
                await loadFolders();
                await showMsg('已重命名文件夹');
            } else {
                await showMsg('重命名文件夹失败: ' + (res && res.error));
            }
        } catch (e) {
            await showMsg('重命名文件夹失败: ' + e.message);
        }
    }

    // 重置线路功能已取消（不再恢复预设线路或默认文件夹）
    async function resetData() {
        await showMsg('重置线路功能已取消，请使用线路管理器管理线路。', '提示');
    }

    // 计算数据的 MD5 哈希值（用于比较线路是否相同）
    // 使用 Electron IPC 调用主进程的 Node.js crypto 模块
    async function calculateMD5(data) {
        if (!(window.electronAPI && window.electronAPI.utils && window.electronAPI.utils.calculateMD5)) {
            throw new Error('Electron API 不可用');
        }
        
        try {
            const result = await window.electronAPI.utils.calculateMD5(data);
            if (result && result.ok && result.hash) {
                return result.hash;
            } else {
                throw new Error(result && result.error ? result.error : '计算哈希失败');
            }
        } catch (e) {
            console.error('计算 MD5 哈希失败:', e);
            throw e;
        }
    }
    
    // 比较两个线路数据是否相同（使用 MD5 哈希）
    async function compareLines(line1, line2) {
        try {
            const hash1 = await calculateMD5(line1);
            const hash2 = await calculateMD5(line2);
            return hash1 === hash2;
        } catch (e) {
            console.warn('比较线路数据失败:', e);
            return false;
        }
    }

    // 内置预设线路功能已取消（不再复制或恢复预设到默认文件夹）
    async function initDefaultLines() {
        // no-op
    }

    // 让用户选择文件夹（用于保存新线路）
    async function selectFolderForSave() {
        if (!(window.electronAPI && window.electronAPI.lines && window.electronAPI.lines.folders)) {
            return null;
        }
        
        try {
            const res = await window.electronAPI.lines.folders.list();
            if (!res || !res.ok || !Array.isArray(res.folders) || res.folders.length === 0) {
                return null;
            }
            
            const folders = res.folders.slice();
            
            // 如果没有其他文件夹，让用户创建新文件夹
            if (folders.length === 0) {
                // 显示创建新文件夹的对话框
                const dialogService = (await import('../utils/dialogService.js')).default;
                const folderName = await dialogService.prompt('当前没有可用的文件夹，请创建一个新文件夹用于保存贯通线路：', '新建文件夹', '创建文件夹');
                
                if (!folderName || !folderName.trim()) {
                    // 用户取消，返回 null（取消创建贯通线路）
                    return null;
                }
                
                // 创建新文件夹
                try {
                    const addRes = await window.electronAPI.lines.folders.add(folderName.trim());
                    if (addRes && addRes.ok) {
                        // 刷新文件夹列表
                        await loadFolders();

                        // 返回新创建的文件夹（使用 folderId 作为 id）
                        return { id: addRes.folderId, path: addRes.path };
                    } else {
                        if (addRes && addRes.error === 'cancelled') {
                            return null;
                        }
                        await showMsg('创建文件夹失败: ' + (addRes && addRes.error || '未知错误'), '错误');
                        return null;
                    }
                } catch (e) {
                    await showMsg('创建文件夹失败: ' + (e.message || e), '错误');
                    return null;
                }
            }
            
            // 如果只有一个文件夹，直接返回
            if (folders.length === 1) {
                return { id: folders[0].id, path: folders[0].path };
            }
            
            // 多个文件夹，显示选择对话框（类似显示端选择器）
            return new Promise((resolve) => {
                // 创建对话框
                const dialog = document.createElement('div');
                dialog.style.cssText = 'position:fixed; inset:0; display:flex; align-items:center; justify-content:center; z-index:10000; background:rgba(0,0,0,0.5); backdrop-filter:blur(4px);';
                
                const dialogContent = document.createElement('div');
                dialogContent.style.cssText = 'background:var(--card, #fff); border-radius:12px; width:90%; max-width:500px; max-height:80vh; display:flex; flex-direction:column; box-shadow:0 8px 32px rgba(0,0,0,0.3); overflow:hidden;';
                
                // 标题栏
                const header = document.createElement('div');
                header.style.cssText = 'padding:20px; border-bottom:1px solid var(--divider, #e0e0e0); display:flex; justify-content:space-between; align-items:center; flex-shrink:0;';
                header.innerHTML = `
                    <h3 style="margin:0; font-size:18px; font-weight:bold; color:var(--text, #333);">选择保存位置</h3>
                    <button id="closeBtn" style="background:none; border:none; color:var(--muted, #666); cursor:pointer; font-size:24px; padding:0; width:32px; height:32px; display:flex; align-items:center; justify-content:center; border-radius:6px; transition:background 0.2s;">&times;</button>
                `;
                
                // 文件夹列表
                const folderList = document.createElement('div');
                folderList.style.cssText = 'flex:1; overflow-y:auto; padding:12px; max-height:400px;';
                
                let selectedFolderId = null;
                
                folders.forEach((folder) => {
                    const folderCard = document.createElement('div');
                    folderCard.style.cssText = 'display:flex; align-items:center; justify-content:space-between; padding:12px; margin-bottom:8px; background:var(--card, #fff); border-radius:6px; border:2px solid var(--divider, #e0e0e0); cursor:pointer; transition:all 0.2s; user-select:none;';
                    
                    folderCard.innerHTML = `
                        <div style="flex:1; min-width:0;">
                            <div style="font-size:14px; font-weight:bold; color:var(--text, #333); margin-bottom:4px;">
                                <i class="fas fa-folder" style="margin-right:8px; color:var(--accent, #12b7f5);"></i>
                                ${folder.name}
                            </div>
                            <div style="font-size:12px; color:var(--muted, #666); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                                ${folder.path || ''}
                            </div>
                        </div>
                    `;
                    
                    // 点击选择
                    folderCard.addEventListener('click', () => {
                        selectedFolderId = folder.id;
                        // 高亮选中的卡片
                        folders.forEach((f) => {
                            const card = folderList.querySelector(`[data-folder-id="${f.id}"]`);
                            if (card) {
                                if (f.id === folder.id) {
                                    card.style.borderColor = '#FF9F43';
                                    card.style.background = 'rgba(255,159,67,0.1)';
                                    card.style.boxShadow = '0 2px 8px rgba(255,159,67,0.3)';
                                } else {
                                    card.style.borderColor = 'var(--divider, #e0e0e0)';
                                    card.style.background = 'var(--card, #fff)';
                                    card.style.boxShadow = 'none';
                                }
                            }
                        });
                    });
                    
                    // 悬停效果
                    folderCard.addEventListener('mouseenter', () => {
                        if (selectedFolderId !== folder.id) {
                            folderCard.style.background = 'var(--bg, #f5f5f5)';
                        }
                    });
                    folderCard.addEventListener('mouseleave', () => {
                        if (selectedFolderId !== folder.id) {
                            folderCard.style.background = 'var(--card, #fff)';
                        }
                    });
                    
                    folderCard.setAttribute('data-folder-id', folder.id);
                    folderList.appendChild(folderCard);
                });
                
                // 按钮栏
                const buttonBar = document.createElement('div');
                buttonBar.style.cssText = 'padding:16px 20px; border-top:1px solid var(--divider, #e0e0e0); display:flex; justify-content:flex-end; gap:12px; flex-shrink:0;';
                buttonBar.innerHTML = `
                    <button id="cancelBtn" style="padding:8px 20px; background:#fff; color:#333; border:1px solid #d9d9d9; border-radius:4px; font-size:14px; cursor:pointer; transition:all 0.2s; min-width:60px;">取消</button>
                    <button id="confirmBtn" style="padding:8px 20px; background:#1677ff; color:#fff; border:none; border-radius:4px; font-size:14px; cursor:pointer; transition:all 0.2s; font-weight:500; min-width:60px;">确定</button>
                `;
                
                // 组装对话框
                dialogContent.appendChild(header);
                dialogContent.appendChild(folderList);
                dialogContent.appendChild(buttonBar);
                dialog.appendChild(dialogContent);
                document.body.appendChild(dialog);
                
                // 事件处理
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
                    if (selectedFolderId) {
                        const selectedFolder = folders.find(f => f.id === selectedFolderId);
                        closeDialog();
                        resolve(selectedFolder ? { id: selectedFolder.id, path: selectedFolder.path } : null);
                    } else {
                        // 如果没有选择，提示用户
                        alert('请先选择一个文件夹');
                    }
                });
                
                // 点击背景关闭
                dialog.addEventListener('click', (e) => {
                    if (e.target === dialog) {
                        closeDialog();
                        resolve(null);
                    }
                });
            });
        } catch (e) {
            console.error('选择文件夹失败:', e);
            await showMsg('选择文件夹失败: ' + (e.message || e), '错误');
            return null;
        }
    }

    async function saveCurrentLineAsZip() {
        if (!state || !state.store || !state.store.list) return;
        const cur = state.store.list[state.store.cur];
        if (!cur || !cur.meta || !cur.meta.lineName) {
            await showMsg('当前线路数据无效，无法保存为压缩包');
            return;
        }
        if (!(window.electronAPI && window.electronAPI.lines && window.electronAPI.lines.saveAsZip)) {
            await showMsg('当前环境不支持保存为压缩包');
            return;
        }
        const lineData = normalizeLine(JSON.parse(JSON.stringify(cur)));
        if (!lineData || typeof lineData !== 'object' || !lineData.meta) {
            await showMsg('当前线路数据无效，无法导出');
            return;
        }
        const cleanLineName = (cur.meta.lineName || '').replace(/<[^>]+>([^<]*)<\/>/g, '$1').trim();
        let baseName = sanitizeFilename(cleanLineName);
        if (!baseName || /^main(\.js)?$/i.test(baseName)) baseName = 'line';
        const expectedZipName = baseName + '.mpl';
        // 优先使用 lineNameToFilePath 中当前线路的路径（从哪里加载就从哪里保存，避免 currentFilePath 被错误覆盖）
        const rawLineName = cur.meta.lineName;
        const pathFromMap = (rawLineName && state.lineNameToFilePath && (state.lineNameToFilePath[rawLineName] || state.lineNameToFilePath[cleanLineName])) || null;
        const effectiveLineFilePath = (pathFromMap && pathFromMap.trim()) || state.currentFilePath || null;
        const lastKnownSaveDir = state.lastKnownSaveDir || null;

        let currentFolderPath = null;
        if (state.currentFolderId && state.folders && Array.isArray(state.folders)) {
            const currentFolder = state.folders.find(f => f.id === state.currentFolderId);
            if (currentFolder && currentFolder.path) currentFolderPath = currentFolder.path;
        }
        let targetZipPath = null;
        if (effectiveLineFilePath) {
            const lastSlash = Math.max(effectiveLineFilePath.lastIndexOf('/'), effectiveLineFilePath.lastIndexOf('\\'));
            const isAbsolute = /^[A-Za-z]:[\\/]/.test(effectiveLineFilePath) || effectiveLineFilePath.startsWith('/') || effectiveLineFilePath.startsWith('\\\\');
            if (lastSlash >= 0 && isAbsolute) {
                targetZipPath = effectiveLineFilePath.substring(0, lastSlash + 1) + expectedZipName;
            } else if (currentFolderPath) {
                const sep = currentFolderPath.includes('\\') ? '\\' : '/';
                targetZipPath = (currentFolderPath.endsWith(sep) ? currentFolderPath : currentFolderPath + sep) + expectedZipName;
            }
        }
        if (!targetZipPath && currentFolderPath) {
            const sep = currentFolderPath.includes('\\') ? '\\' : '/';
            targetZipPath = (currentFolderPath.endsWith(sep) ? currentFolderPath : currentFolderPath + sep) + expectedZipName;
        }
        if (!targetZipPath && lastKnownSaveDir) {
            const sep = lastKnownSaveDir.includes('\\') ? '\\' : '/';
            targetZipPath = (lastKnownSaveDir.endsWith(sep) ? lastKnownSaveDir : lastKnownSaveDir + sep) + expectedZipName;
        }
        if (!targetZipPath) {
            // 使用相对文件名，主进程会落在当前线路目录，避免弹出系统保存对话框
            targetZipPath = expectedZipName;
        }
        if (targetZipPath && !targetZipPath.match(/^[A-Za-z]:[\\/]/) && !targetZipPath.startsWith('/') && !targetZipPath.startsWith('\\\\') && effectiveLineFilePath) {
            const lastSlash = Math.max(effectiveLineFilePath.lastIndexOf('/'), effectiveLineFilePath.lastIndexOf('\\'));
            if (lastSlash >= 0) targetZipPath = effectiveLineFilePath.substring(0, lastSlash + 1) + expectedZipName;
        }
        const lineFilePath = effectiveLineFilePath;
        const lastSlash = effectiveLineFilePath ? Math.max(effectiveLineFilePath.lastIndexOf('/'), effectiveLineFilePath.lastIndexOf('\\')) : -1;
        const audioSourceDir = effectiveLineFilePath && lastSlash >= 0
            ? effectiveLineFilePath.substring(0, lastSlash)
            : (currentFolderPath || null);
        if (pathFromMap && pathFromMap !== state.currentFilePath) {
            state.currentFilePath = pathFromMap;
        }
        try {
            const res = await window.electronAPI.lines.saveAsZip(lineData, lineFilePath, targetZipPath, audioSourceDir);
            if (res && res.ok && res.path) {
                const name = (cur.meta.lineName || '').replace(/<[^>]+>([^<]*)<\/>/g, '$1').trim();
                showNotification('导出成功', `线路 "${name}" 已导出为压缩包\n${res.path}`);
            } else {
                if (res && res.error !== 'cancelled') {
                    const msg = res.error === 'missing-archiver'
                        ? '导出功能需要 archiver 模块，请运行 npm install 安装依赖后重试'
                        : res.error === 'missing-line-data'
                            ? '线路数据未正确传递，请重试'
                            : '导出失败: ' + (res.error || '未知错误');
                    await showMsg(msg, '导出失败');
                }
            }
        } catch (e) {
            await showMsg('导出失败: ' + (e && e.message), '导出失败');
        }
    }

    async function loadLineFromZip() {
        if (!(window.electronAPI && window.electronAPI.lines && window.electronAPI.lines.extractZipToTemp)) {
            await showMsg('当前环境不支持从压缩包加载');
            return;
        }
        const openRes = await window.electronAPI.showOpenDialog({
            filters: [{ name: 'Metro-PIDS 线路包', extensions: ['mpl'] }, { name: 'ZIP', extensions: ['zip'] }],
            properties: ['openFile']
        });
        if (openRes.canceled || !openRes.filePaths || !openRes.filePaths[0]) return;
        const zipPath = openRes.filePaths[0];
        try {
            const extractRes = await window.electronAPI.lines.extractZipToTemp(zipPath);
            if (!extractRes || !extractRes.ok || !extractRes.dir) {
                await showMsg('解压失败: ' + (extractRes && extractRes.error || '未知错误'), '加载失败');
                return;
            }
            const readRes = await window.electronAPI.lines.read(extractRes.jsonName, extractRes.dir);
            if (!readRes || !readRes.ok || !readRes.content) {
                await showMsg('读取线路文件失败', '加载失败');
                return;
            }
            const normalized = normalizeLine(readRes.content);
            state.store.list = [normalized];
            state.store.cur = 0;
            state.appData = normalized;
            const canonicalPath = extractRes.archivePath || zipPath;
            state.currentFilePath = canonicalPath;
            if (normalized.meta && normalized.meta.lineName) {
                state.lineNameToFilePath[normalized.meta.lineName] = canonicalPath;
            }
            state.rt = { idx: 0, state: 0 };
            persistLinePathInfo(state);
            if (typeof window.sync === 'function') window.sync();
            const name = (normalized.meta && normalized.meta.lineName || '').replace(/<[^>]+>([^<]*)<\/>/g, '$1').trim();
            showNotification('加载成功', `已从压缩包加载线路 "${name}"`);
        } catch (e) {
            await showMsg('加载失败: ' + (e && e.message), '加载失败');
        }
    }

    return {
        saveCurrentLine,
        saveCurrentLineAsZip,
        loadLineFromZip,
        openLinesFolder,
        refreshLinesFromFolder,
        resetData,
        loadFolders,
        switchFolder,
        addFolder,
        removeFolder,
        renameFolder,
        initDefaultLines,
        selectFolderForSave
    }
}

/**
 * 预设线路云控管理（增删查改）
 * 用于管理预设线路的云端同步
 */
export function managePresetLinesWithCloud(state, cloudLines) {
    const showMsg = async (msg, title) => dialogService.alert(msg, title);
    const askUser = async (msg, title) => dialogService.confirm(msg, title);
    
    // 预设线路文件名映射
    const presetLineFileMap = {
        '上海地铁2号线.json': '上海地铁2号线',
        '上海地铁16号线.json': '上海地铁16号线',
        'K101.json': 'K101',
        '济南地铁1号线.json': '济南地铁1号线',
        '济南地铁2号线.json': '济南地铁2号线',
        '济南地铁3号线.json': '济南地铁3号线',
        '济南地铁4号线.json': '济南地铁4号线',
        '济南地铁6号线.json': '济南地铁6号线',
        '济南地铁8号线.json': '济南地铁8号线',
        '济南地铁4号线 - 济南地铁8号线 (贯通).json': '济南地铁4号线 - 济南地铁8号线 (贯通)',
        '高新云巴.json': '高新云巴',
        '济阳线.json': '济阳线'
    };
    
    /**
     * 从云端获取预设线路并同步到本地
     */
    async function syncPresetLinesFromCloud() {
        if (!cloudLines) {
            await showMsg('云控功能未初始化', '错误');
            return { ok: false, error: '云控功能未初始化' };
        }
        
        try {
            // 获取云端预设线路列表
            const listResult = await cloudLines.listCloudLines();
            if (!listResult.ok) {
                await showMsg(`获取云端线路列表失败: ${listResult.error}`, '错误');
                return listResult;
            }
            
            const cloudLinesList = listResult.lines || [];
            if (cloudLinesList.length === 0) {
                await showMsg('云端没有预设线路', '提示');
                return { ok: true, synced: 0 };
            }
            
            // 获取预设文件夹ID（用于保存文件）：优先“预设”文件夹，否则使用第一个文件夹
            let presetFolderId = null;
            let presetFolderPath = null;
            if (window.electronAPI && window.electronAPI.lines && window.electronAPI.lines.folders) {
                try {
                    const folders = await window.electronAPI.lines.folders.list();
                    if (folders && folders.ok && folders.folders && folders.folders.length > 0) {
                        const presetFolder = folders.folders.find(f => f.name === '预设');
                        const first = folders.folders[0];
                        presetFolderId = (presetFolder || first).id;
                        presetFolderPath = (presetFolder || first).path;
                    }
                } catch (e) {
                    console.warn('获取预设文件夹失败:', e);
                }
            }
            
            // 同步每条线路到本地
            let syncedCount = 0;
            let failedCount = 0;
            
            for (const cloudLine of cloudLinesList) {
                try {
                    const lineName = cloudLine.meta?.lineName;
                    if (!lineName) continue;
                    
                    // 移除颜色标记获取纯线路名称
                    const cleanLineName = lineName.replace(/<[^>]+>([^<]*)<\/>/g, '$1').trim();
                    
                    // 检查是否是预设线路
                    const isPreset = Object.values(presetLineFileMap).includes(cleanLineName) ||
                                    Object.keys(presetLineFileMap).some(filename => 
                                        presetLineFileMap[filename] === cleanLineName
                                    );
                    
                    if (!isPreset) continue; // 跳过非预设线路
                    
                    // 同步到本地（使用清理后的线路名称）
                    const syncResult = await cloudLines.syncCloudLineToLocal(cleanLineName);
                    if (syncResult.ok) {
                        // 同步成功后，将文件保存到预设文件夹（带 MD5 验证）
                        if (window.electronAPI && window.electronAPI.lines && window.electronAPI.lines.save && presetFolderId) {
                            try {
                                // 根据线路名称获取文件名
                                const filename = Object.keys(presetLineFileMap).find(f => presetLineFileMap[f] === cleanLineName);
                                if (filename && cloudLine) {
                                    // 规范化云端线路数据
                                    const normalized = normalizeLine(JSON.parse(JSON.stringify(cloudLine)));
                                    
                                    // 检查本地文件是否已存在
                                    const existing = await window.electronAPI.lines.read(filename, presetFolderPath || presetFolderId);
                                    if (existing && existing.ok && existing.content) {
                                        // 使用 MD5 比较文件内容，如果相同则跳过保存
                                        const isSame = await compareLines(existing.content, normalized);
                                        if (isSame) {
                                            console.log(`线路 ${cleanLineName} 文件已存在且内容相同，跳过保存`);
                                        } else {
                                            // 内容不同，保存更新后的文件
                                            await window.electronAPI.lines.save(filename, normalized, presetFolderPath || presetFolderId);
                                            console.log(`线路 ${cleanLineName} 文件已更新`);
                                        }
                                    } else {
                                        // 文件不存在，直接保存
                                        await window.electronAPI.lines.save(filename, normalized, presetFolderPath || presetFolderId);
                                        console.log(`线路 ${cleanLineName} 文件已创建`);
                                    }
                                }
                            } catch (e) {
                                console.warn(`保存线路文件 ${cleanLineName} 失败:`, e);
                                // 文件保存失败不影响同步成功计数
                            }
                        }
                        syncedCount++;
                    } else {
                        failedCount++;
                        console.warn(`同步线路 ${lineName} 失败:`, syncResult.error);
                    }
                } catch (e) {
                    failedCount++;
                    console.error(`处理云端线路失败:`, e);
                }
            }
            
            await showMsg(`同步完成: 成功 ${syncedCount} 条，失败 ${failedCount} 条`, '同步结果');
            return { ok: true, synced: syncedCount, failed: failedCount };
        } catch (e) {
            const errorMsg = e.message || String(e);
            await showMsg(`同步失败: ${errorMsg}`, '错误');
            return { ok: false, error: errorMsg };
        }
    }
    
    /**
     * 将本地预设线路上传到云端
     * @param {string} lineName - 线路名称（可选，默认使用当前线路）
     */
    async function uploadPresetLineToCloud(lineName = null) {
        if (!cloudLines) {
            await showMsg('云控功能未初始化', '错误');
            return { ok: false, error: '云控功能未初始化' };
        }
        
        try {
            let lineData = null;
            
            // 如果指定了线路名称，查找该线路
            if (lineName && state && state.store && state.store.list) {
                lineData = state.store.list.find(l => 
                    l.meta && (l.meta.lineName === lineName || 
                              l.meta.lineName.replace(/<[^>]+>([^<]*)<\/>/g, '$1') === lineName)
                );
            } else if (state && state.store && state.store.list) {
                // 否则使用当前选中的线路
                const cur = state.store.list[state.store.cur];
                if (cur) {
                    lineData = cur;
                    lineName = cur.meta?.lineName;
                }
            }
            
            if (!lineData) {
                await showMsg('未找到要上传的线路数据', '错误');
                return { ok: false, error: '未找到线路数据' };
            }
            
            // 检查是否是预设线路
            const cleanLineName = lineName.replace(/<[^>]+>([^<]*)<\/>/g, '$1');
            const isPreset = Object.values(presetLineFileMap).includes(cleanLineName) ||
                            Object.keys(presetLineFileMap).some(filename => 
                                presetLineFileMap[filename] === cleanLineName
                            );
            
            if (!isPreset && !await askUser('该线路不是预设线路，确定要上传到云端吗？', '确认上传')) {
                return { ok: false, error: '用户取消' };
            }
            
            // 上传到云端
            const uploadResult = await cloudLines.uploadLocalLineToCloud(lineData);
            if (uploadResult.ok) {
                await showMsg(`线路 "${cleanLineName}" 已上传到云端`, '成功');
                return uploadResult;
            } else {
                await showMsg(`上传失败: ${uploadResult.error}`, '错误');
                return uploadResult;
            }
        } catch (e) {
            const errorMsg = e.message || String(e);
            await showMsg(`上传失败: ${errorMsg}`, '错误');
            return { ok: false, error: errorMsg };
        }
    }
    
    /**
     * 从云端删除预设线路
     * @param {string} lineName - 线路名称
     */
    async function deletePresetLineFromCloud(lineName) {
        if (!cloudLines) {
            await showMsg('云控功能未初始化', '错误');
            return { ok: false, error: '云控功能未初始化' };
        }
        
        const cleanLineName = lineName.replace(/<[^>]+>([^<]*)<\/>/g, '$1');
        
        if (!await askUser(`确定要从云端删除线路 "${cleanLineName}" 吗？`, '确认删除')) {
            return { ok: false, error: '用户取消' };
        }
        
        try {
            const deleteResult = await cloudLines.deleteCloudLine(cleanLineName);
            if (deleteResult.ok) {
                await showMsg(`线路 "${cleanLineName}" 已从云端删除`, '成功');
                return deleteResult;
            } else {
                await showMsg(`删除失败: ${deleteResult.error}`, '错误');
                return deleteResult;
            }
        } catch (e) {
            const errorMsg = e.message || String(e);
            await showMsg(`删除失败: ${errorMsg}`, '错误');
            return { ok: false, error: errorMsg };
        }
    }
    
    /**
     * 从云端获取预设线路列表
     */
    async function listPresetLinesFromCloud() {
        if (!cloudLines) {
            await showMsg('云控功能未初始化', '错误');
            return { ok: false, error: '云控功能未初始化', lines: [] };
        }
        
        try {
            const listResult = await cloudLines.listCloudLines();
            if (listResult.ok) {
                // 过滤出预设线路
                const presetLines = listResult.lines.filter(line => {
                    const lineName = line.meta?.lineName?.replace(/<[^>]+>([^<]*)<\/>/g, '$1');
                    return Object.values(presetLineFileMap).includes(lineName);
                });
                return { ok: true, lines: presetLines };
            }
            return listResult;
        } catch (e) {
            const errorMsg = e.message || String(e);
            return { ok: false, error: errorMsg, lines: [] };
        }
    }
    
    return {
        syncPresetLinesFromCloud,
        uploadPresetLineToCloud,
        deletePresetLineFromCloud,
        listPresetLinesFromCloud
    };
}
