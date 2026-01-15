/**
 * 显示器站点计算API
 * 直接使用显示器1的处理逻辑，包括：
 * - 短交路处理（startIdx/termIdx）
 * - 暂缓站处理（st.skip）
 * - 大站车处理（express模式 + expressStop）
 * - 直达车处理（direct模式）
 * - 方向过滤（dock限制）
 * - 站点反转（下行方向）
 */

/**
 * 判断站点是否被跳过（暂缓或运营模式）
 * 直接使用显示器1的逻辑
 * @param {Object} st - 站点对象
 * @param {number} idx - 站点索引
 * @param {number} len - 站点总数
 * @param {Object} meta - 元数据（包含 serviceMode）
 * @returns {boolean} 是否被跳过
 */
export function isSkippedByService(st, idx, len, meta) {
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

/**
 * 获取下一个有效站点索引（考虑短交路、方向、dock限制、运营模式等）
 * 直接使用显示器1的逻辑
 * @param {number} currentIdx - 当前站索引
 * @param {number} step - 步进方向（正数向前，负数向后）
 * @param {Object} appData - 应用数据（包含 stations 和 meta）
 * @returns {number} 下一个有效站点索引
 */
export function getNextValidSt(currentIdx, step, appData) {
  if (!appData) return currentIdx;
  const stations = appData.stations || [];
  const len = stations.length;
  if (!len) return currentIdx;
  const dir = step > 0 ? 1 : -1;
  let nextIdx = currentIdx;
  const meta = appData.meta || {};
  // 短交路处理：使用 startIdx 和 termIdx 限制站点范围
  const sIdx = (meta.startIdx !== undefined && meta.startIdx !== -1) ? parseInt(meta.startIdx) : 0;
  const eIdx = (meta.termIdx !== undefined && meta.termIdx !== -1) ? parseInt(meta.termIdx) : len - 1;
  const minIdx = Math.min(sIdx, eIdx);
  const maxIdx = Math.max(sIdx, eIdx);
  for (let i = 0; i < len; i++) {
    nextIdx += dir;
    if (meta.mode === 'loop') {
      if (nextIdx >= len) nextIdx = 0;
      if (nextIdx < 0) nextIdx = len - 1;
    } else {
      // 短交路限制：不能超出 startIdx 和 termIdx 的范围
      if (nextIdx > maxIdx) return maxIdx;
      if (nextIdx < minIdx) return minIdx;
    }
    const candidate = stations[nextIdx];
    if (!candidate) continue;
    
    // 遵守站台 dock 限制：仅方向匹配才允许上下客；缺省或 both 则放行
    const dirType = appData && appData.meta ? appData.meta.dirType : null;
    if (candidate.dock && candidate.dock !== 'both') {
      if (candidate.dock === 'up' && !(dirType === 'up' || dirType === 'outer')) {
        continue;
      }
      if (candidate.dock === 'down' && !(dirType === 'down' || dirType === 'inner')) {
        continue;
      }
    }
    
    // 如果站点被跳过（暂缓或运营模式），跳过该站点
    if (isSkippedByService(candidate, nextIdx, len, appData.meta)) {
      continue;
    }
    
    // 站点未被跳过，可以停靠
    return nextIdx;
  }
  return nextIdx;
}

/**
 * 计算过滤后的站点数组（根据显示器的过滤规则）
 * @param {Object} appData - 应用数据（包含 stations 和 meta）
 * @param {string} dirType - 当前方向（'up', 'down', 'outer', 'inner'）
 * @param {Object} options - 显示器配置选项
 * @param {boolean} options.filterByDirection - 是否根据方向过滤站点（dock限制）
 * @param {boolean} options.reverseOnDown - 下行方向时是否反转站点顺序
 * @returns {Array} 过滤后的站点数组，每个站点包含 originalIndex
 */
export function getFilteredStations(appData, dirType, options = {}) {
    if (!appData || !Array.isArray(appData.stations)) return [];
    
    const {
        filterByDirection = true,
        reverseOnDown = false
    } = options;
    
    // 根据方向过滤站点，保留原始索引
    let filteredStations = appData.stations
        .map((station, originalIndex) => ({
            ...station,
            originalIndex
        }));
    
    // 如果启用方向过滤，应用 dock 限制
    if (filterByDirection) {
        filteredStations = filteredStations.filter((station) => {
            // 如果站点没有 dock 限制，或者 dock 为 'both'，显示该站点
            if (!station.dock || station.dock === 'both') {
                return true;
            }
            
            // 如果站点有 dock 限制，检查是否匹配当前方向
            if (dirType === 'up' || dirType === 'outer') {
                return station.dock === 'up' || station.dock === 'both';
            }
            
            if (dirType === 'down' || dirType === 'inner') {
                return station.dock === 'down' || station.dock === 'both';
            }
            
            return true;
        });
    }
    
    // 如果启用下行反转，下行方向时反转站点顺序
    if (reverseOnDown && (dirType === 'down' || dirType === 'inner')) {
        filteredStations = filteredStations.slice().reverse();
    }
    
    return filteredStations;
}

/**
 * 计算下一站索引（原始站点数组中的索引）
 * 直接使用显示器1的逻辑
 * @param {number} currentIdx - 当前站索引（原始数组）
 * @param {Object} appData - 应用数据
 * @returns {number} 下一站索引（原始数组）
 */
export function calculateNextStationIndex(currentIdx, appData) {
    if (!appData || !appData.meta) return currentIdx;
    
    const meta = appData.meta;
    const dirType = meta.dirType || null;
    
    let nextIdx;
    if (meta.mode === 'loop') {
        // 环线模式：outer 方向用 step=1，其他方向用 step=-1
        nextIdx = (dirType === 'outer') ? getNextValidSt(currentIdx, 1, appData) : getNextValidSt(currentIdx, -1, appData);
    } else {
        // 非环线模式：up 方向用 step=1，其他方向用 step=-1
        nextIdx = (dirType === 'up') ? getNextValidSt(currentIdx, 1, appData) : getNextValidSt(currentIdx, -1, appData);
    }
    
    return nextIdx;
}

/**
 * 计算显示器站点信息（当前站和下一站在过滤后数组中的索引）
 * 使用显示器1的完整逻辑，包括短交路、暂缓站、大站车、直达车处理
 * @param {Object} appData - 应用数据
 * @param {Object} rtState - 运行状态 { idx: number, state: number }
 * @param {Object} displayConfig - 显示器配置
 * @param {boolean} displayConfig.filterByDirection - 是否根据方向过滤站点
 * @param {boolean} displayConfig.reverseOnDown - 下行方向时是否反转站点顺序
 * @returns {Object} 计算结果
 * @returns {number} returns.currentIdx - 当前站在过滤后数组中的索引
 * @returns {number} returns.nextIdx - 下一站在过滤后数组中的索引（仅在出站状态时）
 * @returns {string} returns.nextStationName - 下一站名称（仅在出站状态时）
 */
export function calculateDisplayStationInfo(appData, rtState, displayConfig = {}) {
    const result = {
        currentIdx: -1,
        nextIdx: -1,
        nextStationName: ''
    };
    
    if (!appData || !rtState || typeof rtState.idx !== 'number') {
        return result;
    }
    
    const dirType = appData.meta?.dirType || null;
    const currentOriginalIdx = rtState.idx;
    
    // 获取过滤后的站点数组
    const filteredStations = getFilteredStations(appData, dirType, displayConfig);
    
    if (filteredStations.length === 0) {
        return result;
    }
    
    // 计算当前站在过滤后数组中的索引
    const currentStationInFiltered = filteredStations.findIndex(st => st.originalIndex === currentOriginalIdx);
    if (currentStationInFiltered >= 0) {
        result.currentIdx = currentStationInFiltered;
    }
    
    // 计算下一站信息（仅在出站状态时）
    if (rtState.state === 1 && currentOriginalIdx >= 0) {
        // 使用显示器1的逻辑计算下一站索引（原始数组）
        const nextOriginalIdx = calculateNextStationIndex(currentOriginalIdx, appData);
        
        // 获取下一站名称
        if (nextOriginalIdx >= 0 && nextOriginalIdx < appData.stations.length) {
            const nextStation = appData.stations[nextOriginalIdx];
            if (nextStation && nextStation.name) {
                result.nextStationName = nextStation.name;
                
                // 计算下一站在过滤后数组中的索引
                const nextStationInFiltered = filteredStations.findIndex(st => st.originalIndex === nextOriginalIdx);
                if (nextStationInFiltered >= 0) {
                    result.nextIdx = nextStationInFiltered;
                }
            }
        }
    }
    
    return result;
}
