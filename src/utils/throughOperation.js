// 贯通线路处理工具
// 用于在控制面板中合并多条线路的站点，生成标准线路数据供显示端使用

/**
 * 处理贯通线路：合并多条线路的站点
 * @param {Object} appData - 当前线路数据（包含贯通线路配置）
 * @param {Array} storeList - 所有线路列表
 * @param {Object} options - 可选参数，如果提供则使用这些参数而不是从 appData.meta 读取
 * @param {Array} options.throughLineSegments - 线路段数组，每个元素包含 { lineName, throughStationName }
 * @returns {Object} - 处理后的线路数据（如果未启用贯通运营，返回原数据）
 */
export function applyThroughOperation(appData, storeList, options = null) {
  if (!appData || !appData.meta) return appData;
  const meta = appData.meta || {};
  
  // 如果提供了 options，使用 options 中的参数；否则从 meta 中读取
  let throughLineSegments = options?.throughLineSegments || meta.throughLineSegments || [];
  
  // 兼容旧版本：如果存在 lineALineName 和 lineBLineName，转换为新格式
  if (!throughLineSegments || throughLineSegments.length === 0) {
    const lineALineName = options?.lineALineName || meta.lineALineName;
    const lineBLineName = options?.lineBLineName || meta.lineBLineName;
    if (lineALineName && lineBLineName) {
      throughLineSegments = [
        { lineName: lineALineName, throughStationName: '' },
        { lineName: lineBLineName, throughStationName: '' }
      ];
    } else {
      return appData;
    }
  }
  
  // 检查是否有足够的线路段进行合并（至少需要2段）
  if (!throughLineSegments || throughLineSegments.length < 2) {
    console.warn('[贯通线路] 至少需要2条线路才能进行贯通');
    return appData;
  }
  
  // 如果没有提供线路列表，无法合并
  if (!storeList || !Array.isArray(storeList)) {
    console.warn('[贯通线路] 无法获取线路列表，跳过贯通线路处理');
    return appData;
  }
  
  // 清理站点名称的辅助函数
  const cleanStationName = (name) => {
    if (!name) return '';
    return String(name).replace(/<[^>]+>([^<]*)<\/>/g, '$1').trim();
  };
  // 清理线路名（用于展示/合并记录）
  const cleanLineName = (name) => {
    if (!name) return '';
    return cleanStationName(name);
  };
  
  // 查找所有线路
  const lines = [];
  const mergedLineNames = [];
  for (const segment of throughLineSegments) {
    if (!segment.lineName) {
      console.warn('[贯通线路] 线路段缺少线路名称');
      return appData;
    }
    
    const line = storeList.find(l => {
      const cleanName = cleanStationName(l.meta?.lineName);
      return cleanName === cleanStationName(segment.lineName) || l.meta?.lineName === segment.lineName;
    });
    
    if (!line || !line.stations || line.stations.length === 0) {
      console.warn('[贯通线路] 无法找到线路数据:', segment.lineName);
      return appData;
    }
    
    lines.push(line);
    mergedLineNames.push(cleanLineName(segment.lineName));
  }
  
  // 合并多条线路
  let mergedStations = [];
  const colorRanges = []; // 存储每个线路段的颜色范围
  let currentStartIdx = 0; // 当前线路段在合并列表中的起始索引
  
  for (let i = 0; i < throughLineSegments.length; i++) {
    const segment = throughLineSegments[i];
    const line = lines[i];
    const isLastSegment = (i === throughLineSegments.length - 1);
    
    // 获取线路的主题颜色
    const lineThemeColor = line.meta?.themeColor || '#00b894';
    
    if (i === 0) {
      // 第一段：从起点到贯通站点（如果有）或到终点
      let endIdx = line.stations.length - 1;
      let throughStationName = segment.throughStationName;
      
      if (!isLastSegment && throughStationName) {
        // 查找贯通站点
        const throughIdx = line.stations.findIndex(s => cleanStationName(s.name) === cleanStationName(throughStationName));
        if (throughIdx >= 0) {
          endIdx = throughIdx;
        }
      }
      
      mergedStations = [...line.stations.slice(0, endIdx + 1)];
      const segmentEndIdx = mergedStations.length - 1;
      
      // 记录颜色范围
      // 线段索引 i 表示从站点 i 到站点 i+1 的线段
      // 如果贯通站点在合并列表中的索引是 segmentEndIdx，那么：
      // - 线段 segmentEndIdx - 1 是从站点 segmentEndIdx - 1 到站点 segmentEndIdx（上一站到贯通站点）- 使用A线颜色
      // - 线段 segmentEndIdx 是从站点 segmentEndIdx 到站点 segmentEndIdx + 1（贯通站点到下一站）- 使用B线颜色
      // 第一段的颜色应该应用到线段 0 到 segmentEndIdx - 1（不包含贯通站点到下一站的线段）
      // 所以 endIdx 应该是 segmentEndIdx，而不是 segmentEndIdx + 1
      colorRanges.push({
        startIdx: 0,
        endIdx: segmentEndIdx, // 不包含贯通站点到下一站的线段
        color: lineThemeColor
      });
      
      console.log(`[贯通线路] 段1颜色范围: startIdx=0, endIdx=${segmentEndIdx}, color=${lineThemeColor}, 贯通站点索引=${segmentEndIdx}`);
      
      currentStartIdx = segmentEndIdx + 1;
    } else {
      // 后续段：从上一段的贯通站点之后开始
      const prevSegment = throughLineSegments[i - 1];
      const prevLine = lines[i - 1];
      const prevThroughStationName = prevSegment.throughStationName;
      
      // 在当前线路中查找贯通站点
      let startIdx = 0;
      if (prevThroughStationName) {
        const throughIdx = line.stations.findIndex(s => cleanStationName(s.name) === cleanStationName(prevThroughStationName));
        if (throughIdx >= 0) {
          startIdx = throughIdx + 1; // 从贯通站点之后开始
        }
      }
      
      // 确定结束位置
      let endIdx = line.stations.length - 1;
      let throughStationName = segment.throughStationName;
      
      if (!isLastSegment && throughStationName) {
        // 查找贯通站点
        const throughIdx = line.stations.findIndex(s => cleanStationName(s.name) === cleanStationName(throughStationName));
        if (throughIdx >= 0) {
          endIdx = throughIdx;
        }
      }
      
      // 添加当前段的站点
      const segmentStations = line.stations.slice(startIdx, endIdx + 1);
      const segmentStartIdx = mergedStations.length;
      mergedStations = [...mergedStations, ...segmentStations];
      const segmentEndIdx = mergedStations.length - 1;
      
      // 记录颜色范围（从当前段的起始位置到结束位置）
      // 使用与第一段相同的逻辑：
      // 线段索引 i 表示从站点 i 到站点 i+1 的线段
      // 如果当前段的贯通站点在合并列表中的索引是 segmentEndIdx，那么：
      // - 线段 segmentEndIdx - 1 是从站点 segmentEndIdx - 1 到站点 segmentEndIdx（上一站到贯通站点）- 使用当前段颜色
      // - 线段 segmentEndIdx 是从站点 segmentEndIdx 到站点 segmentEndIdx + 1（贯通站点到下一站）- 使用下一段颜色
      // 当前段的颜色应该应用到线段 segmentStartIdx - 1 到 segmentEndIdx - 1（不包含贯通站点到下一站的线段）
      // 所以 endIdx 应该是 segmentEndIdx，而不是 segmentEndIdx + 1（与第一段逻辑一致）
      const colorRangeStartIdx = segmentStartIdx > 0 ? segmentStartIdx - 1 : segmentStartIdx;
      // 使用与第一段相同的逻辑：endIdx = segmentEndIdx（不包含贯通站点到下一站的线段）
      // 如果是最后一段，endIdx = segmentEndIdx + 1（包含最后一条线段）
      const colorRangeEndIdx = isLastSegment ? segmentEndIdx + 1 : segmentEndIdx;
      colorRanges.push({
        startIdx: colorRangeStartIdx, // 从贯通站点到下一站的线段开始
        endIdx: colorRangeEndIdx, // 到当前段的最后一个线段（不包含）
        color: lineThemeColor
      });
      
      console.log(`[贯通线路] 段${i + 1}颜色范围: startIdx=${colorRangeStartIdx}, endIdx=${colorRangeEndIdx}, color=${lineThemeColor}, segmentStartIdx=${segmentStartIdx}, segmentEndIdx=${segmentEndIdx}, 贯通站点索引=${segmentStartIdx - 1}, 是否最后一段=${isLastSegment}`);
      
      currentStartIdx = segmentEndIdx + 1;
    }
  }
  
  if (mergedStations.length === 0) {
    console.warn('[贯通线路] 合并后的站点列表为空');
    return appData;
  }
  
  // 创建新的 appData，使用合并后的站点
  const mergedAppData = JSON.parse(JSON.stringify(appData));
  mergedAppData.stations = mergedStations;
  
  // 更新起点和终点站索引
  mergedAppData.meta.startIdx = 0;
  mergedAppData.meta.termIdx = mergedStations.length - 1;
  
  // 确保线路模式是 linear（贯通线路应该是线性模式）
  mergedAppData.meta.mode = 'linear';
  
  // 确保 dirType 存在
  if (!mergedAppData.meta.dirType) {
    mergedAppData.meta.dirType = 'up';
  }
  
  // 确保所有站点都有必需的字段
  mergedAppData.stations = mergedAppData.stations.map(st => {
    if (!st) return null;
    const normalized = { ...st };
    if (!normalized.name) normalized.name = '';
    if (!normalized.en) normalized.en = '';
    if (!normalized.xfer) normalized.xfer = [];
    if (normalized.skip === undefined) normalized.skip = false;
    if (!normalized.door) normalized.door = 'left';
    if (!normalized.dock) normalized.dock = 'both';
    if (normalized.turnback === undefined) normalized.turnback = false;
    if (normalized.expressStop === undefined) normalized.expressStop = false;
    return normalized;
  }).filter(st => st !== null);
  
  // 设置自定义颜色范围：为每个线路段设置不同的颜色
  mergedAppData.meta.customColorRanges = colorRanges;
  // 记录用于展示的合并线路名列表（供显示端“线路名合并”使用）
  mergedAppData.meta.mergedLineNames = mergedLineNames;
  
  // 设置合并线路的主题颜色（使用第一段的颜色）
  mergedAppData.meta.themeColor = lines[0].meta?.themeColor || '#00b894';
  
  console.log('[贯通线路] 站点合并完成，线路段数:', throughLineSegments.length, '合并后站点数:', mergedStations.length);
  console.log('[贯通线路] 自定义颜色范围:', mergedAppData.meta.customColorRanges);
  console.log('[贯通线路] 合并后的站点列表:', mergedStations.map(s => cleanStationName(s.name)));
  
  return mergedAppData;
}
