'use strict';

const CN_DIGIT_MAP = {
  〇: '0', 零: '0',
  一: '1', 壹: '1', 二: '2', 贰: '2', 兩: '2', 两: '2',
  三: '3', 叁: '3', 四: '4', 肆: '4', 五: '5', 伍: '5',
  六: '6', 陆: '6', 陸: '6', 七: '7', 柒: '7', 八: '8', 捌: '8',
  九: '9', 玖: '9', 十: '10', 拾: '10'
};

const DEFAULT_MATCHER_RULES = Object.freeze({
  scoreThreshold: 180,
  tokenMinLength: 2,
  lengthPenaltyFactor: 2.2,
  maxLengthPenalty: 120,
  importKeywordPenalty: 28,
  importPenaltyKeywords: ['import', '下载', '复制', '提示', '欢迎', '到达', '离开', 'arrival', 'depart', 'welcome', 'announce']
});

function normalizeDoorSide(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (!v) return '';
  if (
    v === 'left' || v === 'l' ||
    v === '左' || v === '左侧' || v === '左邊' || v === '左边' || v === '左側' ||
    v === '좌' || v === '좌측' || v === '왼쪽' ||
    v === 'ひだり' || v === '左ドア' || v === '左側'
  ) return 'left';
  if (
    v === 'right' || v === 'r' ||
    v === '右' || v === '右侧' || v === '右邊' || v === '右边' || v === '右側' ||
    v === '우' || v === '우측' || v === '오른쪽' ||
    v === 'みぎ' || v === '右ドア' || v === '右側'
  ) return 'right';
  if (
    v === 'both' || v === 'double' ||
    v === '左右' || v === '左右侧' || v === '左右側' || v === '左右边' || v === '左右邊' ||
    v === '两边' || v === '兩邊' || v === '双侧' || v === '雙側' || v === '双边' || v === '雙邊' || v === '两侧' || v === '兩側' ||
    v === '両側' || v === '양쪽' || v === '양측'
  ) return 'both';
  return '';
}

function detectDoorSideFromText(text) {
  let s = String(text || '').normalize('NFKC').toLowerCase();
  if (!s) return '';
  s = s.replace(/(?:[_-]\d+|\(\d+\)|（\d+）)+$/g, '');
  // 优先识别“双侧/两边”，避免同时包含“左/右”时误判
  if (
    // 简/繁中文
    s.includes('两边') || s.includes('兩邊') ||
    s.includes('双侧') || s.includes('雙側') ||
    s.includes('双边') || s.includes('雙邊') ||
    s.includes('两侧') || s.includes('兩側') ||
    s.includes('左右侧') || s.includes('左右側') ||
    s.includes('左右边') || s.includes('左右邊') ||
    s.includes('左右门') || s.includes('左右門') ||
    s.includes('两门') || s.includes('兩門') ||
    // 口语/文件命名常见：左右开门 / 双开门 / 同时开门
    s.includes('左右开门') || s.includes('左右開門') ||
    s.includes('左右开') || s.includes('左右開') ||
    s.includes('双开门') || s.includes('雙開門') ||
    s.includes('双开') || s.includes('雙開') ||
    s.includes('同时开门') || s.includes('同時開門') ||
    s.includes('双门开') || s.includes('雙門開') ||
    s.includes('两门开') || s.includes('兩門開') ||
    s.includes('双门开启') || s.includes('雙門開啟') ||
    s.includes('两门开启') || s.includes('兩門開啟') ||
    ((s.includes('左右') || s.includes('左/右') || s.includes('左\\右') || s.includes('left/right')) && (s.includes('开门') || s.includes('開門') || s.includes('door'))) ||
    // 日文
    s.includes('両側') || s.includes('りょうがわ') ||
    // 英文
    s.includes('both') || s.includes('bothside') || s.includes('both-side') || s.includes('both sides') ||
    // 韩文
    s.includes('양쪽') || s.includes('양측')
  ) return 'both';

  // 复合表达优先：如“左门右侧/右门左侧”，按“门X侧”中的 X 作为最终开门侧。
  // 需要放在单纯“左门/右门”判断前，避免被提前误判。
  if (
    s.includes('门右侧') || s.includes('門右側') ||
    s.includes('门右邊') || s.includes('門右邊') ||
    s.includes('门右边') || s.includes('門右邊') ||
    s.includes('doorright') || s.includes('door-right') || s.includes('door right')
  ) return 'right';
  if (
    s.includes('门左侧') || s.includes('門左側') ||
    s.includes('门左邊') || s.includes('門左邊') ||
    s.includes('门左边') || s.includes('門左邊') ||
    s.includes('doorleft') || s.includes('door-left') || s.includes('door left')
  ) return 'left';

  // 兼容口语命名：开右边门/右边门/右边/开右门/右门
  if (
    // 简/繁中文
    s.includes('左侧') || s.includes('左邊') || s.includes('左边') || s.includes('左邊門') || s.includes('左边门') ||
    s.includes('开左边门') || s.includes('開左邊門') || s.includes('左门') || s.includes('左門') || s.includes('开左门') || s.includes('開左門') ||
    // 日文
    s.includes('左側') || s.includes('左ドア') || s.includes('左側ドア') || s.includes('左開') ||
    // 英文
    s.includes('left') ||
    // 韩文
    s.includes('왼쪽') || s.includes('좌측')
  ) return 'left';
  if (
    // 简/繁中文
    s.includes('右侧') || s.includes('右邊') || s.includes('右边') || s.includes('右邊門') || s.includes('右边门') ||
    s.includes('开右边门') || s.includes('開右邊門') || s.includes('右门') || s.includes('右門') || s.includes('开右门') || s.includes('開右門') ||
    // 日文
    s.includes('右側') || s.includes('右ドア') || s.includes('右側ドア') || s.includes('右開') ||
    // 英文
    s.includes('right') ||
    // 韩文
    s.includes('오른쪽') || s.includes('우측')
  ) return 'right';
  return '';
}

function isGenericDoorAnnouncementText(text) {
  const s = String(text || '').normalize('NFKC').toLowerCase();
  if (!s) return false;
  if (s.includes('开门') || s.includes('開門')) return true;
  if (s.includes('左门') || s.includes('左門') || s.includes('右门') || s.includes('右門')) return true;
  if (s.includes('双侧门') || s.includes('雙側門') || s.includes('双边门') || s.includes('雙邊門')) return true;
  if (s.includes('两侧门') || s.includes('兩側門') || s.includes('两边门') || s.includes('兩邊門')) return true;
  if (s.includes('左右门') || s.includes('左右門')) return true;
  if (s.includes('双侧') || s.includes('雙側') || s.includes('双边') || s.includes('雙邊')) return true;
  if (s.includes('两侧') || s.includes('兩側') || s.includes('两边') || s.includes('兩邊')) return true;
  if (s.includes('左侧门') || s.includes('左側門') || s.includes('右侧门') || s.includes('右側門')) return true;
  if (s.includes('左边门') || s.includes('左邊門') || s.includes('右边门') || s.includes('右邊門')) return true;
  if (s.includes('door') && (s.includes('open') || s.includes('left') || s.includes('right') || s.includes('both'))) return true;
  return false;
}

function clampNumber(v, def, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

function resolveMatcherRules(opts) {
  const src = (opts && typeof opts === 'object')
    ? (opts.matcherRules || opts.matcherConfig || null)
    : null;
  const rules = (src && typeof src === 'object') ? (src.rules && typeof src.rules === 'object' ? src.rules : src) : {};
  return {
    scoreThreshold: clampNumber(rules.scoreThreshold, DEFAULT_MATCHER_RULES.scoreThreshold, 60, 600),
    tokenMinLength: Math.max(1, Math.floor(clampNumber(rules.tokenMinLength, DEFAULT_MATCHER_RULES.tokenMinLength, 1, 8))),
    lengthPenaltyFactor: clampNumber(rules.lengthPenaltyFactor, DEFAULT_MATCHER_RULES.lengthPenaltyFactor, 0, 20),
    maxLengthPenalty: clampNumber(rules.maxLengthPenalty, DEFAULT_MATCHER_RULES.maxLengthPenalty, 0, 500),
    importKeywordPenalty: clampNumber(rules.importKeywordPenalty, DEFAULT_MATCHER_RULES.importKeywordPenalty, 0, 200),
    importPenaltyKeywords: Array.isArray(rules.importPenaltyKeywords) && rules.importPenaltyKeywords.length
      ? rules.importPenaltyKeywords.map((x) => String(x || '').trim()).filter(Boolean)
      : DEFAULT_MATCHER_RULES.importPenaltyKeywords
  };
}

function normalizeForStationMatch(raw) {
  if (raw === undefined || raw === null) return '';
  let s = String(raw).normalize('NFKC').trim().toLowerCase();
  if (!s) return '';
  s = s.replace(/(?:[_-]\d+|\(\d+\)|（\d+）)+$/g, '');
  s = s.replace(/[\s._\-:/\\，。,.、·•（）()【】\[\]「」『』"'“”‘’]/g, '');
  s = s.replace(/站$/u, '');
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (Object.prototype.hasOwnProperty.call(CN_DIGIT_MAP, ch)) out += CN_DIGIT_MAP[ch];
    else out += ch;
  }
  return out;
}

function buildStationMatchTokens(norm) {
  const n = normalizeForStationMatch(norm);
  if (!n) return [];
  const uniq = new Set([n]);
  for (let L = Math.max(2, Math.floor(n.length / 2)); L < n.length; L++) {
    uniq.add(n.slice(0, L));
  }
  return [...uniq];
}

function detectLangFlags(_baseName) {
  return {};
}

function detectLangFlagsFromPath(relPosix) {
  const flags = {};
  const lower = String(relPosix || '').toLowerCase().replace(/\\/g, '/');
  const parts = lower.split('/').filter(Boolean);
  const mark = (k) => { if (k) flags[k] = true; };
  for (const seg of parts) {
    if (seg === 'en' || seg === 'english') mark('en');
    if (seg === 'ja' || seg === 'jp' || seg === 'jpn' || seg === 'japanese') mark('ja');
    if (seg === 'ko' || seg === 'kr' || seg === 'kor' || seg === 'korean') mark('ko');
    if (seg === 'zhcn' || seg === 'zh_cn' || seg === 'zh-cn' || seg === 'zh' || seg === 'hans') mark('zhcn');
    if (seg === 'cmn') mark('cmn');
    if (seg === 'zhtw' || seg === 'zh_tw' || seg === 'zh-tw' || seg === 'hant') mark('zhtw');
  }
  return flags;
}

function prefixStrictConflict(targetNorm, stemNorm, peerNormsSet) {
  if (!targetNorm || !stemNorm || targetNorm === stemNorm) return false;
  if (targetNorm.length > stemNorm.length && targetNorm.startsWith(stemNorm)) {
    if (!peerNormsSet || peerNormsSet.size === 0) return false;
    return peerNormsSet.has(stemNorm);
  }
  if (stemNorm.length > targetNorm.length && stemNorm.startsWith(targetNorm)) {
    if (!peerNormsSet || peerNormsSet.size === 0) return false;
    for (const pn of peerNormsSet) {
      if (!pn || pn === targetNorm) continue;
      if (pn.length > targetNorm.length && pn.startsWith(targetNorm) && stemNorm === pn) return true;
    }
    return false;
  }
  return false;
}

function lineContextBlocksAudioBinding(targetNorm, stemNorm, peerNormsSet) {
  if (!peerNormsSet || !(peerNormsSet instanceof Set) || peerNormsSet.size === 0) return false;
  if (!targetNorm || !stemNorm) return false;
  for (const pn of peerNormsSet) {
    if (!pn || pn === targetNorm) continue;
    if (stemNorm === pn) return true;
    if (pn.length > targetNorm.length && pn.startsWith(targetNorm)) {
      if (stemNorm.startsWith(pn)) return true;
    }
    if (targetNorm.length > pn.length && targetNorm.startsWith(pn)) {
      if (stemNorm === pn) return true;
    }
  }
  return false;
}

function langPreferenceScore(langFlags, opts) {
  if (!langFlags || typeof langFlags !== 'object') return 50;
  const keys = Object.keys(langFlags).filter((k) => langFlags[k]);
  if (!keys.length) return 52;
  const dk = String((opts && opts.dialectKey) || '').toLowerCase();
  const lk = String((opts && opts.languageKey) || '').toLowerCase();
  if (dk && langFlags[dk]) return 100;
  if (lk && langFlags[lk]) return 96;
  if (dk === 'zhcn' && langFlags.zhcn) return 98;
  if ((dk === 'zhtw' || dk === 'zh_tw') && langFlags.zhtw) return 95;
  return 35;
}

function lengthImportPenalty(stemNorm, targetNorm, rules) {
  if (!stemNorm || !targetNorm) return 0;
  const extra = Math.max(0, stemNorm.length - targetNorm.length);
  if (extra <= 0) return 0;
  const cfg = rules || DEFAULT_MATCHER_RULES;
  let p = Math.min(cfg.maxLengthPenalty, extra * cfg.lengthPenaltyFactor);
  const keywordRe = cfg.importPenaltyKeywords && cfg.importPenaltyKeywords.length
    ? new RegExp(cfg.importPenaltyKeywords.map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'i')
    : null;
  if (keywordRe && keywordRe.test(stemNorm)) p += cfg.importKeywordPenalty;
  return p;
}

function addStationPeersFromLineData(lineData, set) {
  const stations = lineData && Array.isArray(lineData.stations) ? lineData.stations : [];
  const push = (v) => {
    const n = normalizeForStationMatch(v);
    if (n) set.add(n);
  };
  for (const st of stations) {
    if (!st || typeof st !== 'object') continue;
    push(st.name);
    push(st.en);
    push(st.zh);
    push(st.cn);
    push(st.ja);
    push(st.ko);
  }
}

function compareEntryPreference(a, b) {
  if (!a && !b) return 0;
  if (!a) return -1;
  if (!b) return 1;
  const aMtime = Number(a.mtimeMs || 0);
  const bMtime = Number(b.mtimeMs || 0);
  if (aMtime !== bMtime) return aMtime > bMtime ? 1 : -1;
  const aVariant = Number(a.variantRank || 0);
  const bVariant = Number(b.variantRank || 0);
  if (aVariant !== bVariant) return aVariant > bVariant ? 1 : -1;
  const aRel = String(a.relativePath || '');
  const bRel = String(b.relativePath || '');
  if (aRel === bRel) return 0;
  return aRel < bRel ? 1 : -1;
}

function findAudioByStationNameFromIndex({ entries, stationName, opts, peerNormsSet }) {
  const role = opts && opts.role;
  const rules = resolveMatcherRules(opts || {});
  const targetNorm = normalizeForStationMatch(stationName);
  if (!targetNorm || !Array.isArray(entries) || !entries.length) {
    return { ok: false, error: 'no-match', ...(role ? { role } : {}) };
  }

  const desiredDoorSide = normalizeDoorSide((opts && (opts.doorSide || opts.door || opts.doorOpenSide)) || '');
  const isDoorRole = String(role || '').trim().toLowerCase() === 'door';
  // 默认不允许 door 回退到“无门侧标签”的普通站名音频，避免误播本站到站音。
  // 仅在显式传入 allowDoorUntaggedFallback=true 时才启用。
  const allowDoorUntaggedFallback = isDoorRole && desiredDoorSide && (opts?.allowDoorUntaggedFallback === true);
  const isDoorEntryAllowed = (e, allowUntaggedDoorEntry = false) => {
    // “动态车门”必须匹配到带开门侧标记的音频文件；否则不允许回退到普通到达/站名音频。
    if (!isDoorRole) return true;
    if (!desiredDoorSide) return false;
    const ed = normalizeDoorSide(e && e.doorSide);
    if (!ed) return !!allowUntaggedDoorEntry;
    if (desiredDoorSide === 'both') return ed === 'both';
    return ed === desiredDoorSide || ed === 'both';
  };
  const doorSideScore = (entryDoorSide) => {
    if (!desiredDoorSide) return 0;
    const e = normalizeDoorSide(entryDoorSide);
    if (!e) return 0;
    if (desiredDoorSide === 'both') {
      if (e === 'both') return 20;
      return -4;
    }
    if (e === desiredDoorSide) return 20;
    if (e === 'both') return 10;
    return -18;
  };

  const pickBestMatch = (allowUntaggedDoorEntry = false) => {
    let bestExact = null;
    let bestExactScore = -Infinity;
    for (const e of entries) {
      if (!isDoorEntryAllowed(e, allowUntaggedDoorEntry)) continue;
      const stemNorm = e.stemNorm;
      if (stemNorm !== targetNorm) continue;
      if (prefixStrictConflict(targetNorm, stemNorm, peerNormsSet)) continue;
      if (lineContextBlocksAudioBinding(targetNorm, stemNorm, peerNormsSet)) continue;
      const ls = langPreferenceScore(e.langFlags, opts || {});
      const ds = doorSideScore(e.doorSide);
      const exactScore = ls + ds;
      if (!bestExact || exactScore > bestExactScore || (exactScore === bestExactScore && compareEntryPreference(e, bestExact) > 0)) {
        bestExact = e;
        bestExactScore = exactScore;
      }
    }
    if (bestExact) return { best: bestExact, bestScore: Infinity };

    let best = null;
    let bestScore = -Infinity;
    for (const e of entries) {
      if (!isDoorEntryAllowed(e, allowUntaggedDoorEntry)) continue;
      const stemNorm = e.stemNorm;
      if (!stemNorm) continue;
      if (prefixStrictConflict(targetNorm, stemNorm, peerNormsSet)) continue;
      if (lineContextBlocksAudioBinding(targetNorm, stemNorm, peerNormsSet)) continue;

      let match = 0;
      if (stemNorm.includes(targetNorm)) match = 320 + Math.min(80, targetNorm.length * 4);
      else if (targetNorm.includes(stemNorm)) match = 280 + Math.min(60, stemNorm.length * 3);
      else {
        const tokens = buildStationMatchTokens(stationName);
        let hit = false;
        for (const t of tokens) {
          if (t.length >= rules.tokenMinLength && stemNorm.includes(t)) {
            hit = true;
            match = 200 + t.length * 2;
            break;
          }
        }
        if (!hit) continue;
      }

      const ls = langPreferenceScore(e.langFlags, opts || {});
      const penalty = lengthImportPenalty(stemNorm, targetNorm, rules);
      const ds = doorSideScore(e.doorSide);
      const score = match + ls * 0.85 + ds - penalty;
      if (score > bestScore || (score === bestScore && compareEntryPreference(e, best) > 0)) {
        bestScore = score;
        best = e;
      }
    }
    return { best, bestScore };
  };

  let { best, bestScore } = pickBestMatch(false);
  if ((!best || bestScore < rules.scoreThreshold) && allowDoorUntaggedFallback) {
    const retry = pickBestMatch(true);
    if (retry.best && (retry.bestScore >= rules.scoreThreshold || retry.bestScore === Infinity)) {
      best = retry.best;
      bestScore = retry.bestScore;
    }
  }

  // 兜底：支持“通用门提示音”命名（如 开右边门 / 右侧门 / 开左侧门）。
  // 当按站名匹配失败时，door 角色可回退到按门侧 + 关键词匹配。
  if ((!best || bestScore < rules.scoreThreshold) && isDoorRole && desiredDoorSide) {
    let genericBest = null;
    let genericBestScore = -Infinity;
    for (const e of entries) {
      if (!isDoorEntryAllowed(e, false)) continue;
      if (!isGenericDoorAnnouncementText(e && e.stem)) continue;
      const ls = langPreferenceScore(e.langFlags, opts || {});
      const ds = doorSideScore(e.doorSide);
      const score = 220 + ls * 0.9 + ds;
      if (score > genericBestScore || (score === genericBestScore && compareEntryPreference(e, genericBest) > 0)) {
        genericBest = e;
        genericBestScore = score;
      }
    }
    if (genericBest) {
      best = genericBest;
      bestScore = Math.max(bestScore, genericBestScore);
    }
  }

  if (!best || bestScore < rules.scoreThreshold) {
    return { ok: false, error: 'no-match', ...(role ? { role } : {}) };
  }
  return { ok: true, relativePath: best.relativePath };
}

module.exports = {
  DEFAULT_MATCHER_RULES,
  resolveMatcherRules,
  normalizeForStationMatch,
  buildStationMatchTokens,
  detectLangFlags,
  detectLangFlagsFromPath,
  normalizeDoorSide,
  detectDoorSideFromText,
  prefixStrictConflict,
  lineContextBlocksAudioBinding,
  compareEntryPreference,
  langPreferenceScore,
  lengthImportPenalty,
  addStationPeersFromLineData,
  findAudioByStationNameFromIndex
};
