/**
 * Display-3: 北京地铁出站指示屏 (Exit Indicator Screen)
 * 分辨率: 1900×600 LCD屏幕
 * 显示线路、下一站、换乘线路、出门指引等信息
 */

const DISPLAY_SNAPSHOT_KEY = 'metro_pids_display_snapshot_d3';

/**
 * 更新时间显示
 */
function updateTime() {
  try {
    const now = new Date();
    const timeEl = document.getElementById('current-time');
    const dateEl = document.getElementById('current-date');
    
    if (timeEl) {
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      timeEl.textContent = `${hours}:${minutes}`;
    }
    
    if (dateEl) {
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      dateEl.textContent = `${year}-${month}-${day}`;
    }
  } catch (e) {
    console.error('[Display-3] 更新时间失败', e);
  }
}

/**
 * 更新线路显示
 */
function updateLineDisplay(lineData) {
  try {
    if (!lineData) return;
    
    const lineNumEl = document.getElementById('line-num');
    if (lineNumEl && lineData.lineNumber) {
      lineNumEl.textContent = lineData.lineNumber;
    }
  } catch (e) {
    console.error('[Display-3] 更新线路显示失败', e);
  }
}

/**
 * 更新下一站信息
 */
function updateNextStation(stationData) {
  try {
    if (!stationData) return;
    
    const nextStationEl = document.getElementById('next-station');
    const nextStationEnEl = document.getElementById('next-station-en');
    
    if (nextStationEl && stationData.name) {
      nextStationEl.textContent = stationData.name;
    }
    
    if (nextStationEnEl && stationData.nameEn) {
      nextStationEnEl.textContent = stationData.nameEn;
    }
  } catch (e) {
    console.error('[Display-3] 更新下一站信息失败', e);
  }
}

/**
 * 更新循环标签 (内循/外循)
 */
function updateLoopTag(direction) {
  try {
    const loopTagEl = document.getElementById('loop-tag');
    if (!loopTagEl) return;
    
    const loopLabelEl = loopTagEl.querySelector('.loop-label');
    const loopNameEl = loopTagEl.querySelector('.loop-name');
    
    if (loopLabelEl) {
      if (direction === 'inner' || direction === '内循') {
        loopLabelEl.textContent = '内环';
        loopNameEl.textContent = 'Circulation Loop';
      } else if (direction === 'outer' || direction === '外循') {
        loopLabelEl.textContent = '外环';
        loopNameEl.textContent = 'Circulation Loop';
      }
    }
  } catch (e) {
    console.error('[Display-3] 更新循环标签失败', e);
  }
}

/**
 * 更新换乘线路
 */
function updateTransferLines(transfers) {
  try {
    const transferLinesEl = document.querySelector('.transfer-lines');
    if (!transferLinesEl) return;
    
    // 清空现有的换乘线路
    transferLinesEl.innerHTML = '';
    
    if (!Array.isArray(transfers)) {
      transfers = [];
    }
    
    // 限制最多显示3条换乘线路
    const topTransfers = transfers.slice(0, 3);
    
    topTransfers.forEach((transfer, idx) => {
      const transferLineEl = document.createElement('div');
      transferLineEl.className = 'transfer-line';
      transferLineEl.id = `transfer-line-${idx}`;
      
      if (typeof transfer === 'string') {
        transferLineEl.textContent = transfer;
      } else if (typeof transfer === 'object' && transfer.name) {
        transferLineEl.textContent = transfer.name;
      } else {
        transferLineEl.textContent = String(transfer);
      }
      
      transferLinesEl.appendChild(transferLineEl);
    });
  } catch (e) {
    console.error('[Display-3] 更新换乘线路失败', e);
  }
}

/**
 * 更新站点列表和高亮
 */
function updateStationsList(stations, currentIndex) {
  try {
    const stationsListEl = document.getElementById('stations-list');
    if (!stationsListEl) return;
    
    // 清空现有站点
    stationsListEl.innerHTML = '';
    
    if (!Array.isArray(stations)) {
      return;
    }
    
    // 限制显示的站点数量（最多3个）
    const maxStations = Math.min(3, stations.length);
    const startIdx = Math.max(0, currentIndex - 1);
    const displayStations = stations.slice(startIdx, startIdx + maxStations);
    
    displayStations.forEach((station, idx) => {
      const itemEl = document.createElement('div');
      itemEl.className = 'station-item';
      const actualIdx = startIdx + idx;
      
      if (actualIdx === currentIndex) {
        itemEl.classList.add('highlight');
      }
      
      itemEl.id = `station-item-${actualIdx}`;
      
      const dotEl = document.createElement('div');
      dotEl.className = 'station-dot';
      if (actualIdx === currentIndex) {
        dotEl.classList.add('current');
      }
      
      const textEl = document.createElement('div');
      textEl.className = 'station-text';
      if (actualIdx === currentIndex) {
        textEl.classList.add('highlight-station');
      }
      
      const cnEl = document.createElement('div');
      cnEl.className = 'station-cn';
      cnEl.textContent = station.name || '--';
      
      const enEl = document.createElement('div');
      enEl.className = 'station-en';
      enEl.textContent = station.nameEn || '--';
      
      textEl.appendChild(cnEl);
      textEl.appendChild(enEl);
      
      itemEl.appendChild(dotEl);
      itemEl.appendChild(textEl);
      
      stationsListEl.appendChild(itemEl);
    });
  } catch (e) {
    console.error('[Display-3] 更新站点列表失败', e);
  }
}

/**
 * 更新出门指引
 */
function updateExitGuide(guideCN, guideEN) {
  try {
    const guideCNEl = document.getElementById('guide-cn');
    const guideENEl = document.getElementById('guide-en');
    
    if (guideCNEl && guideCN) {
      guideCNEl.textContent = guideCN;
    }
    
    if (guideENEl && guideEN) {
      guideENEl.textContent = guideEN;
    }
  } catch (e) {
    console.error('[Display-3] 更新出门指引失败', e);
  }
}

/**
 * 处理完整的出站数据
 */
function handleExitData(data) {
  try {
    console.log('[Display-3] 处理出站数据', data);
    
    if (data.line) {
      updateLineDisplay({
        lineNumber: data.line
      });
    }
    
    if (data.nextStation) {
      updateNextStation({
        name: data.nextStation.name || data.nextStation,
        nameEn: data.nextStation.nameEn || ''
      });
    }
    
    if (data.direction) {
      updateLoopTag(data.direction);
    }
    
    if (data.transfers) {
      updateTransferLines(data.transfers);
    }
    
    if (data.stations && typeof data.currentStationIndex !== 'undefined') {
      updateStationsList(data.stations, data.currentStationIndex);
    }
    
    if (data.exitGuide) {
      updateExitGuide(data.exitGuide.cn, data.exitGuide.en);
    }
    
    // 保存快照
    try {
      localStorage.setItem(DISPLAY_SNAPSHOT_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('[Display-3] 快照保存失败', e);
    }
  } catch (e) {
    console.error('[Display-3] 处理出站数据异常', e);
  }
}

/**
 * 初始化出站指示屏
 */
export function initExitIndicator(rootElement) {
  console.log('[Display-3] 初始化出站指示屏');
  
  if (!rootElement) {
    console.error('[Display-3] 根元素不存在');
    return null;
  }
  
  // 初始化时间显示
  updateTime();
  const timeInterval = setInterval(updateTime, 1000);
  
  // 尝试从快照恢复数据
  try {
    const snapshot = localStorage.getItem(DISPLAY_SNAPSHOT_KEY);
    if (snapshot) {
      const data = JSON.parse(snapshot);
      console.log('[Display-3] 从快照恢复数据', data);
      handleExitData(data);
    }
  } catch (e) {
    console.warn('[Display-3] 快照恢复失败', e);
  }
  
  // 监听 BroadcastChannel 消息
  console.log('[Display-3] 开始监听 BroadcastChannel...');
  let bc;
  
  try {
    bc = new BroadcastChannel('metro_pids_v3');
    
    bc.addEventListener('message', (event) => {
      const {t, d} = event.data || {};
      
      if (t === 'EXIT_DATA' && d) {
        console.log('[Display-3] 收到出站数据', d);
        handleExitData(d);
      } else if (t === 'SYNC' && d) {
        // 兼容旧的SYNC消息格式，如果包含出站相关信息
        if (d.exitData) {
          handleExitData(d.exitData);
        }
      }
    });
  } catch (e) {
    console.warn('[Display-3] BroadcastChannel 不可用，使用 postMessage 兼容', e);
  }
  
  // window.postMessage 兼容处理
  const handleWindowMessage = (event) => {
    if (event.source === window) return;
    
    const {t, d} = event.data || {};
    
    if (t === 'EXIT_DATA' && d) {
      console.log('[Display-3] 收到 postMessage 出站数据', d);
      handleExitData(d);
    } else if (t === 'SYNC' && d && d.exitData) {
      handleExitData(d.exitData);
    }
  };
  
  window.addEventListener('message', handleWindowMessage);
  
  // 清理函数
  return () => {
    console.log('[Display-3] 清理出站指示屏');
    clearInterval(timeInterval);
    if (bc) {
      bc.close();
    }
    window.removeEventListener('message', handleWindowMessage);
  };
}
