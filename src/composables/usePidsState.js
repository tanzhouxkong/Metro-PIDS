import { reactive } from 'vue'
import { useBroadcast } from './useBroadcast.js'
import { DEF, DEF_LINE_16, DEF_JINAN_BUS, DEF_JINAN_METRO_1, DEF_JINAN_METRO_2, DEF_JINAN_METRO_3, DEF_JINAN_METRO_4, DEF_JINAN_METRO_6, DEF_JINAN_METRO_8, DEF_JINAN_METRO_4_8, DEF_JINAN_YUNBA } from '../utils/defaults.js'

const bcWrap = useBroadcast('metro_pids_v3');

const state = reactive({
  store: { cur: 0, list: [] },
  appData: null,
  rt: { idx: 0, state: 0 },
  isRec: false,
  recTimer: null,
  DEF: DEF,
  currentFilePath: null, // 当前打开的文件路径（包含子文件夹路径）
  lineNameToFilePath: {}, // 线路名称到文件路径的映射
  currentFolderId: 'default', // 当前活动的文件夹ID
  folders: [] // 文件夹列表
});

const cleanLineName = (n) => (n ? String(n).replace(/<[^>]+>([^<]*)<\/>/g, '$1').trim() : '');

function loadSafe() {
    try {
        const saved = localStorage.getItem('pids_global_store_v1');
        if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed.list && Array.isArray(parsed.list) && parsed.list.length > 0) {
                state.store = parsed;
            } else {
                throw new Error('Invalid store');
            }
        } else {
            throw new Error('No saved store');
        }
    } catch (e) {
        console.log('Initializing default data...');
        state.store = { 
            cur: 0, 
            list: [
                JSON.parse(JSON.stringify(DEF)),
                JSON.parse(JSON.stringify(DEF_LINE_16)),
                JSON.parse(JSON.stringify(DEF_JINAN_BUS)),
                JSON.parse(JSON.stringify(DEF_JINAN_METRO_1)),
                JSON.parse(JSON.stringify(DEF_JINAN_METRO_2)),
                JSON.parse(JSON.stringify(DEF_JINAN_METRO_3)),
                JSON.parse(JSON.stringify(DEF_JINAN_METRO_4)),
                JSON.parse(JSON.stringify(DEF_JINAN_METRO_6)),
                JSON.parse(JSON.stringify(DEF_JINAN_METRO_8)),
                JSON.parse(JSON.stringify(DEF_JINAN_METRO_4_8)),
                JSON.parse(JSON.stringify(DEF_JINAN_YUNBA))
            ] 
        };
    }
    if (state.store.cur < 0 || state.store.cur >= state.store.list.length) state.store.cur = 0;
    state.appData = state.store.list[state.store.cur];
<<<<<<< Updated upstream
=======
    if (state.store && state.store.rt && typeof state.store.rt === 'object') {
        const savedRt = state.store.rt;
        const idx = Number.isInteger(savedRt.idx) ? savedRt.idx : 0;
        const curState = Number.isInteger(savedRt.state) ? savedRt.state : 0;
        state.rt = { ...state.rt, ...savedRt, idx, state: curState };
    }
>>>>>>> Stashed changes

    // 恢复文件路径映射，确保启动时能解析音频路径
    if (typeof localStorage !== 'undefined') {
        try {
            const raw = localStorage.getItem('pids_line_path_map_v1');
            state.lineNameToFilePath = {};
            state.currentFilePath = null;
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object') {
                    const map = parsed.map && typeof parsed.map === 'object' ? parsed.map : {};
                    state.lineNameToFilePath = map;
                    if (typeof parsed.currentFilePath === 'string' && parsed.currentFilePath.trim()) {
                        state.currentFilePath = parsed.currentFilePath.trim();
                    }
                }
            }
        } catch (e) {
            state.lineNameToFilePath = {};
            state.currentFilePath = null;
        }

        if (!state.currentFilePath && state.appData && state.appData.meta && state.appData.meta.lineName) {
            const rawName = state.appData.meta.lineName;
            const pathFromMap = state.lineNameToFilePath[rawName] || state.lineNameToFilePath[cleanLineName(rawName)];
            if (pathFromMap) state.currentFilePath = pathFromMap;
        }
    }
}

// 初始化加载
loadSafe();

export function usePidsState() {
  return { 
    state, 
    bcWrap,
    bcOn: bcWrap.onMessage,
    bcPost: bcWrap.post,
    loadSafe
  };
}
