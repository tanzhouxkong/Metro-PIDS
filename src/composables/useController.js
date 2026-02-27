import { usePidsState } from './usePidsState.js'
import { useSettings } from './useSettings.js'
import { cloneDisplayState } from '../utils/displayStateSerializer.js'
import { applyThroughOperation } from '../utils/throughOperation.js'

export function useController() {
    const { state, bcPost } = usePidsState();
    const { settings } = useSettings();
    const cleanLineName = (n) => (n ? String(n).replace(/<[^>]+>([^<]*)<\/>/g, '$1').trim() : '');

    const persistLinePathInfo = () => {
        if (typeof localStorage === 'undefined') return;
        try {
            const map = {};
            if (state.lineNameToFilePath && typeof state.lineNameToFilePath === 'object') {
                Object.entries(state.lineNameToFilePath).forEach(([k, v]) => {
                    if (!v || typeof v !== 'string') return;
                    map[k] = v;
                    const clean = cleanLineName(k);
                    if (clean && clean !== k && !map[clean]) map[clean] = v;
                });
            }
            const payload = { currentFilePath: state.currentFilePath || null, map };
            localStorage.setItem('pids_line_path_map_v1', JSON.stringify(payload));
        } catch (e) {
            console.warn('[useController] Failed to persist line path info', e);
        }
    };

    function sync() {
        if (!state.store || !state.store.list) return;
        state.store.list[state.store.cur] = state.appData;
<<<<<<< Updated upstream
        localStorage.setItem('pids_global_store_v1', JSON.stringify(state.store));
=======
        const persistedStore = {
            ...state.store,
            rt: cloneDisplayState(state.rt)
        };
        localStorage.setItem('pids_global_store_v1', JSON.stringify(persistedStore));
>>>>>>> Stashed changes
        persistLinePathInfo();
        
        // 直接使用当前线路数据（贯通线路已在控制面板中合并完成）
        let appDataToSend = cloneDisplayState(state.appData);
        let rtToSend = cloneDisplayState(state.rt);
        
        const payload = {
            t: 'SYNC',
            d: appDataToSend,
            r: rtToSend,
            settings: {
                display: {
                    // 显示器2：下一站/到站白屏相关配置
                    display2NextStationDuration: settings?.display?.display2NextStationDuration || 10000,
                    display2FooterLED: settings?.display?.display2FooterLED || '',
                    display2FooterWatermark: settings?.display?.display2FooterWatermark !== false,
                    // 显示器1/3：布局模式
                    display1LayoutMode: settings?.display?.displays?.['display-1']?.layoutMode ?? 'linear',
                    display3LayoutMode: settings?.display?.displays?.['display-3']?.layoutMode ?? 'c-type',
<<<<<<< Updated upstream
<<<<<<< Updated upstream
<<<<<<< Updated upstream
<<<<<<< Updated upstream
=======
<<<<<<< HEAD
                    // 显示器1：壁纸（到站/结束页）
                    display1WallpaperDataUrl: settings?.display?.displays?.['display-1']?.wallpaperDataUrl ?? '',
                    display1WallpaperOpacity: settings?.display?.displays?.['display-1']?.wallpaperOpacity ?? 0.35,
=======
>>>>>>> 5e6badfcb798ff4bb795199c1cd04aeb2a4d3fcc
>>>>>>> Stashed changes
=======
                    // 显示器1：壁纸（到站/结束页）
                    display1WallpaperDataUrl: settings?.display?.displays?.['display-1']?.wallpaperDataUrl ?? '',
                    display1WallpaperOpacity: settings?.display?.displays?.['display-1']?.wallpaperOpacity ?? 0.35,
>>>>>>> Stashed changes
=======
                    // 显示器1：壁纸（到站/结束页）
                    display1WallpaperDataUrl: settings?.display?.displays?.['display-1']?.wallpaperDataUrl ?? '',
                    display1WallpaperOpacity: settings?.display?.displays?.['display-1']?.wallpaperOpacity ?? 0.35,
>>>>>>> Stashed changes
=======
                    // 显示器1：壁纸（到站/结束页）
                    display1WallpaperDataUrl: settings?.display?.displays?.['display-1']?.wallpaperDataUrl ?? '',
                    display1WallpaperOpacity: settings?.display?.displays?.['display-1']?.wallpaperOpacity ?? 0.35,
>>>>>>> Stashed changes
                    // 显示器3：出站页面显示时长（毫秒）
                    display3DepartDuration: settings?.display?.display3DepartDuration ?? 8000
                }
            }
        };
        
        bcPost(payload);
        // 若控制端曾打开展示弹窗，作为后备通过 postMessage 同步
        try {
            if (typeof window !== 'undefined' && window.__metro_pids_display_popup && !window.__metro_pids_display_popup.closed && window.__metro_pids_display_popup_ready === true) {
                try { window.__metro_pids_display_popup.postMessage(payload, '*'); } catch (e) {}
            }
        } catch (e) {}
        
        // 更新系统任务栏图标进度条
        updateProgressBar();
    }
    
    // 更新系统任务栏图标进度条
    function updateProgressBar() {
        try {
            if (typeof window === 'undefined' || !window.electronAPI || !window.electronAPI.setProgressBar) return;
            if (!state.appData || !state.appData.stations || !Array.isArray(state.appData.stations)) {
                // 如果没有站点数据，隐藏进度条
                window.electronAPI.setProgressBar(-1);
                return;
            }
            
            const stations = state.appData.stations;
            const totalStations = stations.length;
            if (totalStations === 0) {
                window.electronAPI.setProgressBar(-1);
                return;
            }
            
            // 获取当前站点索引
            const currentIdx = typeof state.rt.idx === 'number' ? state.rt.idx : 0;
            
            // 计算进度百分比 (当前站点索引 / 总站点数)
            // 使用 (currentIdx + 1) / totalStations 让进度更直观（当前站点已完成）
            const progress = Math.min(1, Math.max(0, (currentIdx + 1) / totalStations));
            
            window.electronAPI.setProgressBar(progress);
        } catch (e) {
            console.warn('Failed to update progress bar:', e);
        }
    }

    function getStep() {
        if (!state.appData) return 1;
        const meta = state.appData.meta;
        if (meta.mode === 'loop' && meta.dirType === 'inner') return -1;
        if (meta.mode === 'linear' && meta.dirType === 'down') return -1;
        return 1;
    }

    function isSkippedByService(st, idx, len, meta) {
        if (!st) return true;
        if (st.skip) return true;
        const mode = (meta && meta.serviceMode) || 'normal';
        const expressKeep = st.expressStop !== undefined ? !!st.expressStop : false; // 默认不保留停靠，需要明确设置
        const isEnd = idx === 0 || idx === len - 1;
        if (mode === 'direct') {
            return !isEnd;
        }
        if (mode === 'express') {
            if (isEnd) return false;
            // 大站车模式下：只有明确设置 expressStop 为 true 的站点才停靠
            return !expressKeep;
        }
        return false;
    }

    function getNextValidStControl(currentIdx, step) {
        if (!state.appData) return currentIdx;
        const stations = state.appData.stations || [];
        const len = stations.length;
        const dir = step > 0 ? 1 : -1;
        let nextIdx = currentIdx;

        // 计算短交路可运行区间
        const sIdx = (state.appData.meta.startIdx !== undefined && state.appData.meta.startIdx !== -1) ? parseInt(state.appData.meta.startIdx) : 0;
        const eIdx = (state.appData.meta.termIdx !== undefined && state.appData.meta.termIdx !== -1) ? parseInt(state.appData.meta.termIdx) : len - 1;
        const minIdx = Math.min(sIdx, eIdx);
        const maxIdx = Math.max(sIdx, eIdx);
        const hasShortTurn = (state.appData.meta.startIdx !== undefined && state.appData.meta.startIdx !== -1) ||
            (state.appData.meta.termIdx !== undefined && state.appData.meta.termIdx !== -1);

        for (let i = 0; i < len; i++) {
            nextIdx += dir;

            if (state.appData.meta.mode === 'loop') {
                // 环线 + 短交路：与直线一致，不绕环，限制在运营区内，避免到达站/左右键卡出运营区域
                if (hasShortTurn) {
                    if (nextIdx > maxIdx) nextIdx = maxIdx;
                    if (nextIdx < minIdx) nextIdx = minIdx;
                } else {
                    if (nextIdx >= len) nextIdx = 0;
                    if (nextIdx < 0) nextIdx = len - 1;
                }
            } else {
                if (nextIdx > maxIdx) return maxIdx;
                if (nextIdx < minIdx) return minIdx;
            }

            // 遵守站台上下行限制：仅允许方向匹配的站点（缺省或 both 视为允许）
            const candidate = stations[nextIdx];
            const dirType = state.appData && state.appData.meta ? state.appData.meta.dirType : null;
            if (candidate) {
                if (candidate.dock && candidate.dock !== 'both') {
                    if (candidate.dock === 'up' && !(dirType === 'up' || dirType === 'outer')) {
                        // 方向不符，跳过该候选
                    } else if (candidate.dock === 'down' && !(dirType === 'down' || dirType === 'inner')) {
                        // 方向不符，跳过该候选
                    } else if (!isSkippedByService(candidate, nextIdx, len, state.appData.meta)) {
                        return nextIdx;
                    }
                } else {
                    if (!isSkippedByService(candidate, nextIdx, len, state.appData.meta)) return nextIdx;
                }
            }

            if (state.appData.meta.mode !== 'loop') {
                if (nextIdx === minIdx || nextIdx === maxIdx) return nextIdx;
            }
        }
        return nextIdx;
    }

    function move(delta) {
        const nextIdx = getNextValidStControl(state.rt.idx, delta);
        if (nextIdx === state.rt.idx) return;
        state.rt.idx = nextIdx;
        state.rt.state = 0;
        sync();
    }

    function jumpTo(idx) {
        state.rt.idx = idx;
        state.rt.state = 0;
        sync();
    }

    function setArr() {
        if (state.rt.state === 1) move(getStep());
        state.rt.state = 0;
        sync();
    }

    function setDep() {
        state.rt.state = 1;
        sync();
    }

    function next() {
        state.rt.state === 0 ? setDep() : setArr();
    }

    return {
        sync,
        move,
        jumpTo,
        setArr,
        setDep,
        next,
        getStep
    }
}
