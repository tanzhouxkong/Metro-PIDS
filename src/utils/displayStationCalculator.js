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

/**
 * ================================
 * 显示器1 站名/线路名展示通用 API
 * ================================
 * 这些函数纯粹负责「算规则」，不直接操作 DOM，
 * 方便在显示器1、显示器2、第三方显示器中复用相同的行为。
 */

/**
 * 根据中文站名长度，计算是否需要缩小字号（来源于显示器1逻辑：
 * 例如「浦东1号2号航站楼」这类超长站名需要使用更小字号）。
 *
 * @param {string} name - 站名（中文）
 * @param {Object} [options]
 * @param {number} [options.shrinkThreshold=9] - 从多少个字符开始缩小字号
 * @param {number} [options.normalFontSize=18] - 正常字号（像素）
 * @param {number} [options.shrinkFontSize=16] - 缩小时字号（像素）
 * @returns {{ fontSize: string, letterSpacing: string|null }} 样式建议
 */
export function getStationNameFontStyle(name, options = {}) {
  const {
    shrinkThreshold = 9,
    normalFontSize = 18,
    shrinkFontSize = 16
  } = options;

  if (!name || typeof name !== 'string') {
    return { fontSize: `${normalFontSize}px`, letterSpacing: null };
  }

  const len = name.length;
  if (len >= shrinkThreshold) {
    // 与显示器1一致：长站名略缩小字号并稍微加一点字间距
    return { fontSize: `${shrinkFontSize}px`, letterSpacing: '0.5px' };
  }

  return { fontSize: `${normalFontSize}px`, letterSpacing: null };
}

/**
 * 计算 C 型/环线站名倾斜布局的基础参数（来源于显示器1逻辑）：
 * - 统一倾斜角度为 -45°
 * - 站名整体位于圆点正下方一定距离
 * - 上下两排在水平方向稍微错开（alignTweak）
 *
 * @param {number} idx - 当前站在布局数组中的索引
 * @param {number} topCount - 上排站点数量（用于区分上/下两排）
 * @param {Object} [options]
 * @param {number} [options.rotationAngle=-45] - 倾斜角度，单位度
 * @param {number} [options.dotRadius=15] - 圆点半径（像素）
 * @param {number} [options.textGap=100] - 圆点到底部站名块之间的垂直间距（像素）
 * @param {number} [options.alignTweakTop=-8] - 上排水平方向微调（像素）
 * @param {number} [options.alignTweakBottom=8] - 下排水平方向微调（像素）
 * @returns {{
 *   rotationAngle: number,
 *   dotRadius: number,
 *   textGap: number,
 *   baseY: number,
 *   alignTweak: number
 * }}
 */
export function getTiltLayoutParams(idx, topCount, options = {}) {
  const {
    rotationAngle = -45,
    dotRadius = 15,
    textGap = 100,
    alignTweakTop = -8,
    alignTweakBottom = 8
  } = options;

  const baseY = dotRadius + textGap;
  const alignTweak = idx < topCount ? alignTweakTop : alignTweakBottom;

  return {
    rotationAngle,
    dotRadius,
    textGap,
    baseY,
    alignTweak
  };
}

/**
 * 将英文站名按大致字符数拆分成多行，用于在倾斜布局下手动插入 <br>。
 * 由于父级被旋转，CSS 自动换行在部分环境下不稳定，因此显示器1采用
 * “约 24 字符 / 行” 的简单规则，这里抽成纯文本 API。
 *
 * @param {string} rawHtml - 原始英文站名（可包含简单 HTML 标签）
 * @param {Object} [options]
 * @param {number} [options.maxCharsPerLine=24] - 每行最大字符数（近似值）
 * @returns {string[]} 拆分后的每一行纯文本
 */
export function splitEnglishNameIntoLines(rawHtml, options = {}) {
  const { maxCharsPerLine = 24 } = options;

  if (!rawHtml || typeof rawHtml !== 'string') {
    return [];
  }

  // 去掉 HTML 标签，只保留纯文本，再按空格拆成单词
  const plain = rawHtml
    .replace(/\u00A0/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!plain) return [];

  const words = plain.split(' ');
  const lines = [];
  let line = '';

  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (next.length <= maxCharsPerLine) {
      line = next;
    } else {
      if (line) lines.push(line);
      line = w;
    }
  }

  if (line) lines.push(line);
  return lines;
}

/**
 * 计算「当前箭头是否属于当前运行区间」的高亮/闪烁逻辑。
 * 用于 C 型/环线等线路图上，判断一段线段上的箭头是否需要使用
 * `segment-arrow-current`（闪烁）还是 `segment-arrow-default`（常亮）。
 *
 * 逻辑与显示器1保持一致：
 * - 只有在出站状态（rt.state === 1）时才会有“当前段”闪烁
 * - 上行 / outer 方向：当前段索引 === rt.idx
 * - 下行 / inner 方向：当前段索引 === max(rt.idx - 1, 0)
 *
 * @param {number} segIndex - 当前线段索引（0-based）
 * @param {{ idx: number, state: number }} rt - 运行状态
 * @param {string|null} dirType - 线路方向（'up' | 'down' | 'outer' | 'inner'）
 * @returns {boolean} 是否为当前闪烁段
 */
export function isCurrentArrowSegment(segIndex, rt, dirType) {
  if (!rt || typeof rt.idx !== 'number') return false;
  if (rt.state !== 1) return false; // 仅出站（去往下一站）时闪烁

  const idx = rt.idx;
  if (dirType === 'up' || dirType === 'outer') {
    return segIndex === idx;
  }
  // down / inner：当前段通常是 idx-1（防止 idx=0 时为 -1）
  return segIndex === Math.max(idx - 1, 0);
}

/**
 * 计算 C 型/环线线路段上的箭头布点（位置 + 角度 + 是否为当前段）。
 *
 * 这是从显示器1的 C 型线路图抽象出来的纯计算版本，用于在任意显示器中复用：
 * - 输入是「理论路径长度 → 实际路径长度的缩放」「每段的起止理论距离」
 * - 输出是一批箭头点，每个点包含：
 *   - 沿路径的实际距离 actualDist
 *   - 通过 getPointAtLength 计算点坐标和切线方向后，可以渲染 DOM/SVG
 *   - 该点所在的段索引 segIndex 以及是否是“当前段”（用于决定闪烁样式）
 *
 * 注意：本函数**不依赖 DOM，不调用 getPointAtLength**，只负责算「在哪里放箭头」。
 * 具体坐标和角度需要调用方基于 SVG path 自己用 getPointAtLength 计算。
 *
 * @param {Object} params
 * @param {number} params.topCount         - 上排站点个数（用于识别桥接段）
 * @param {number} params.horizontalLength - 单侧水平段的理论长度（不含圆角和竖直段）
 * @param {number} params.cornerR          - 右侧圆角半径（仅用于注释/理解，可选）
 * @param {number} params.arcLen           - 右侧「两段 1/4 圆弧 + 垂直直线」的理论总长度
 * @param {number} params.scale            - 实际路径长度 / 理论路径长度 的缩放比
 * @param {number} params.rangeStart       - 有效服务区间起始段索引（含）
 * @param {number} params.rangeEnd         - 有效服务区间结束段索引（不含）
 * @param {Array<number>} params.theoreticalDists - 每个站点沿路径的理论距离数组（长度为站点数）
 * @param {{ idx: number, state: number }} params.rt - 当前运行状态
 * @param {string|null} params.dirType     - 方向（'up' | 'down' | 'outer' | 'inner'）
 * @param {Object} [params.tuning]         - 微调参数（对应 C3_TUNING 中与箭头相关部分）
 * @param {number} [params.tuning.arrowSpacing=20]            - 箭头间距（像素）
 * @param {number} [params.tuning.bridgeReserveCorner=10]     - 桥接段：距圆角留白（px，会乘 scale）
 * @param {number} [params.tuning.bridgeReserveBeforeDot=10]  - 桥接段：下排圆点前留白（px，会乘 scale）
 *
 * @returns {Array<{
 *   segIndex: number,
 *   actualDist: number,
 *   isCurrent: boolean,
 *   isBridge: boolean
 * }>}
 */
export function computeCTypeArrowPlacements(params) {
  const {
    topCount,
    horizontalLength,
    cornerR, // 目前仅用于理解/调试，不直接参与计算
    arcLen,
    scale,
    rangeStart,
    rangeEnd,
    theoreticalDists,
    rt,
    dirType,
    tuning = {}
  } = params || {};

  if (!Array.isArray(theoreticalDists) || theoreticalDists.length < 2) {
    return [];
  }

  const {
    arrowSpacing = 20,
    bridgeReserveCorner = 10,
    bridgeReserveBeforeDot = 10
  } = tuning;

  const results = [];
  const n = theoreticalDists.length;

  // 小工具：在给定「实际路径距离区间」内，按固定间距放置多个箭头
  const placeArrowsInRange = (segStart, segEnd, segIndex) => {
    const segLenLocal = segEnd - segStart;
    if (segLenLocal <= 0) return;

    // 与显示器1一致：统一使用固定像素间距（arrowSpacing），换算成路径上的距离
    const spacingInPath = arrowSpacing / scale;
    // 线段中点
    const midDist = segStart + segLenLocal / 2;
    // 两个箭头：中点左右各偏移 spacingInPath/2
    const arrowDists = [
      midDist - spacingInPath / 2,
      midDist + spacingInPath / 2
    ];

    arrowDists.forEach((aDist) => {
      if (aDist < segStart || aDist > segEnd) return;
      const isCurrent = isCurrentArrowSegment(segIndex, rt, dirType);
      results.push({
        segIndex,
        actualDist: aDist,
        isCurrent,
        isBridge: false
      });
    });
  };

  // 计算右侧相关的关键理论距离（与显示器1一致）
  const topPathLen = horizontalLength; // 上水平段长度（理论）
  const bottomStartTheoretical = horizontalLength + arcLen; // 下水平段起点（理论）

  for (let i = 0; i < n - 1; i++) {
    const nextI = i + 1;
    // 仅在服务范围内的段上放箭头
    const isInServiceRange = i >= rangeStart && i < rangeEnd;
    if (!isInServiceRange) continue;

    const d1 = theoreticalDists[i];
    const d2 = theoreticalDists[nextI];
    const actualD1 = d1 * scale;
    const actualD2 = d2 * scale;

    // 桥接段：上排最后一站 → 下排第一站
    const isBridgeSegment = (i === topCount - 1);
    if (isBridgeSegment) {
      // 上侧：仅在上水平段的最后一小段放箭头
      const reserveCornerTop = bridgeReserveCorner * scale;
      const topActualEnd = topPathLen * scale;
      const topSegEnd = Math.max(0, topActualEnd - reserveCornerTop);
      const topSegStart = actualD1;
      if (topSegEnd > topSegStart) {
        placeArrowsInRange(topSegStart, topSegEnd, i);
      }

      // 下侧：在「R 角之后 → 下排最右一站圆点之前」这一小段直线里放箭头
      const bottomActualStart = bottomStartTheoretical * scale;
      const firstBottomIdx = topCount;
      if (firstBottomIdx < theoreticalDists.length) {
        const bottomNodeDist = theoreticalDists[firstBottomIdx] * scale;
        const reserveFromCorner = bridgeReserveCorner * scale;
        const reserveBeforeDot = bridgeReserveBeforeDot * scale;

        const bottomSegStart = Math.max(bottomActualStart + reserveFromCorner, actualD1);
        const bottomSegEnd = Math.min(bottomNodeDist - reserveBeforeDot, actualD2);
        if (bottomSegEnd > bottomSegStart) {
          placeArrowsInRange(bottomSegStart, bottomSegEnd, i);
        }
      }

      continue;
    }

    // 普通段：整段都可放箭头
    placeArrowsInRange(actualD1, actualD2, i);
  }

  // 标记桥接段结果（可选信息，方便调用方在需要时做差异化处理）
  results.forEach((item) => {
    if (item.segIndex === topCount - 1) {
      item.isBridge = true;
    }
  });

  return results;
}

/**
 * 计算 C 型线路图上某一条线段对应的箭头放置区间（沿 SVG 路径的距离范围）。
 *
 * 这是从显示器1的 C 型线路图逻辑中抽取出来的「右侧桥接段」与普通线段处理规则：
 * - 对于普通线段：整个 [actualD1, actualD2] 区间都可以放箭头
 * - 对于「上排最后一站 → 下排第一站」这条桥接段：
 *   - 上侧：仅在上水平段末尾预留 corner 之后的一小段区间放箭头
 *   - 下侧：仅在 R 角之后、下排最右一站圆点之前的一小段区间放箭头
 *
 * 本函数只负责返回「路径上的起止距离」，不关心具体箭头间距/DOM 创建，
 * 方便在显示器1 / 其他显示器里复用同一套几何规则。
 *
 * @param {number} segIndex - 当前线段索引（0-based）
 * @param {Object} opts
 * @param {number} opts.rangeStart - 在服务范围起始线段索引（闭区间起点）
 * @param {number} opts.rangeEnd - 在服务范围结束线段索引（开区间终点）
 * @param {number} opts.scale - 路径缩放比例（理论距离 * scale = 实际路径长度）
 * @param {function(number): number} opts.getStDist - 获取站点在理论路径上的距离（未乘 scale）
 * @param {number} opts.topCount - 上排站点数量
 * @param {number} opts.topPathLen - 上半环水平路径的理论长度（未乘 scale）
 * @param {number} opts.horizontalLength - 整体水平长度（未乘 scale）
 * @param {number} opts.arcLen - 右侧圆角的理论长度（未乘 scale）
 * @param {Object} opts.tuning - C3_TUNING 中与箭头相关的参数：
 * @param {number} opts.tuning.bridgeReserveCorner - 距离 R 角预留的空白（像素，会乘 scale）
 * @param {number} opts.tuning.bridgeReserveBeforeDot - 下排圆点前预留的空白（像素，会乘 scale）
 * @returns {Array<{ start: number, end: number, segIndex: number, side: 'normal' | 'top' | 'bottom' }>}
 */
export function computeCTypeArrowRangesForSegment(segIndex, opts) {
  const {
    rangeStart,
    rangeEnd,
    scale,
    getStDist,
    topCount,
    topPathLen,
    horizontalLength,
    arcLen,
    tuning
  } = opts || {};

  const result = [];

  if (segIndex < rangeStart || segIndex >= rangeEnd) {
    return result;
  }
  if (typeof getStDist !== 'function' || !scale || scale <= 0) {
    return result;
  }

  const theoreticalD1 = getStDist(segIndex);
  const theoreticalD2 = getStDist(segIndex + 1);
  const actualD1 = theoreticalD1 * scale;
  const actualD2 = theoreticalD2 * scale;

  // 桥接段：「上排最后一站 → 下排第一站」
  const isBridgeSegment = segIndex === topCount - 1;

  if (isBridgeSegment) {
    const bridgeReserveCorner = (tuning && tuning.bridgeReserveCorner ? tuning.bridgeReserveCorner : 0) * scale;
    const bridgeReserveBeforeDot = (tuning && tuning.bridgeReserveBeforeDot ? tuning.bridgeReserveBeforeDot : 0) * scale;

    // 上侧：仅在上水平段末尾预留 corner 后的一小段区间放箭头
    const topActualEnd = topPathLen * scale;
    const topSegEnd = Math.max(0, topActualEnd - bridgeReserveCorner);
    const topSegStart = actualD1;
    if (topSegEnd > topSegStart) {
      result.push({
        start: topSegStart,
        end: topSegEnd,
        segIndex,
        side: 'top'
      });
    }

    // 下侧：仅在 R 角之后、下排最右一站圆点之前的一小段区间放箭头
    const bottomActualStart = (horizontalLength + arcLen) * scale;
    const firstBottomIdx = topCount;
    const bottomNodeDist = getStDist(firstBottomIdx) * scale;

    const bottomSegStart = Math.max(bottomActualStart + bridgeReserveCorner, actualD1);
    const bottomSegEnd = Math.min(bottomNodeDist - bridgeReserveBeforeDot, actualD2);
    if (bottomSegEnd > bottomSegStart) {
      result.push({
        start: bottomSegStart,
        end: bottomSegEnd,
        segIndex,
        side: 'bottom'
      });
    }

    return result;
  }

  // 普通段：整段都可放箭头
  if (actualD2 > actualD1) {
    result.push({
      start: actualD1,
      end: actualD2,
      segIndex,
      side: 'normal'
    });
  }

  return result;
}
