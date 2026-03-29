'use strict';

const path = require('path');
const fs = require('fs').promises;

const AUDIO_EXTS = new Set(['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac']);

/** @type {Map<string, { audioMtimeMs: number, entries: object[] }>} */
const audioIndexCache = new Map();

function makeAudioIndexCacheKey(lineDir) {
  if (!lineDir || typeof lineDir !== 'string') return '';
  try {
    const resolved = path.resolve(lineDir);
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  } catch (e) {
    return '';
  }
}

function invalidateAudioStationIndexCache(lineDir) {
  if (!lineDir || typeof lineDir !== 'string') return;
  try {
    const key = makeAudioIndexCacheKey(lineDir);
    if (key) audioIndexCache.delete(key);
  } catch (e) { /* ignore */ }
}

const CN_DIGIT_MAP = {
  〇: '0', 零: '0',
  一: '1', 壹: '1', 二: '2', 贰: '2', 兩: '2', 两: '2',
  三: '3', 叁: '3', 四: '4', 肆: '4', 五: '5', 伍: '5',
  六: '6', 陆: '6', 陸: '6', 七: '7', 柒: '7', 八: '8', 捌: '8',
  九: '9', 玖: '9', 十: '10', 拾: '10'
};

function normalizeForStationMatch(raw) {
  if (raw === undefined || raw === null) return '';
  let s = String(raw).normalize('NFKC').trim().toLowerCase();
  if (!s) return '';
  s = s.replace(/[\s._\-:/\\，。,.、·•（）()【】\[\]「」『』"'“”‘’]/g, '');
  s = s.replace(/站$/u, '');
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (Object.prototype.hasOwnProperty.call(CN_DIGIT_MAP, ch)) {
      out += CN_DIGIT_MAP[ch];
    } else {
      out += ch;
    }
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

/** 文件名猜语种已弃用：仅保留接口，避免旧调用崩溃 */
function detectLangFlags(_baseName) {
  return {};
}

function detectLangFlagsFromPath(relPosix) {
  const flags = {};
  const lower = String(relPosix || '').toLowerCase().replace(/\\/g, '/');
  const parts = lower.split('/').filter(Boolean);
  const mark = (k) => {
    if (k) flags[k] = true;
  };
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

/**
 * 站名前缀消歧：
 * - 目标更长、文件名更短：腊山南 vs 腊山.mp3 → 冲突（避免短文件名吞长站名）。
 * - 文件名更长且以目标为真前缀：腊山南 vs 腊山南站北广场.mp3 → 默认允许（同一站长篇曾用名 / 复合文件名）。
 *   仅当 stem 正好是 peer 中「另一站」全名时冲突：腊山 vs stem=腊山南（且 peer 含腊山南）。
 */
function prefixStrictConflict(targetNorm, stemNorm, peerNormsSet) {
  if (!targetNorm || !stemNorm || targetNorm === stemNorm) return false;
  if (targetNorm.length > stemNorm.length && targetNorm.startsWith(stemNorm)) {
    // 仅在同线确实存在这个“短站名”时才判定冲突。
    // 否则可能把用于长站名的简写文件（如“腊山南站”->“腊山南”）误拦截。
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

/**
 * 当文件名/长 stem 更明确地对应同线另一站（如 腊山南），阻止短站名（腊山）误吞。
 */
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

function lengthImportPenalty(stemNorm, targetNorm) {
  if (!stemNorm || !targetNorm) return 0;
  const extra = Math.max(0, stemNorm.length - targetNorm.length);
  if (extra <= 0) return 0;
  let p = Math.min(120, extra * 2.2);
  if (/import|下载|复制|提示|欢迎|到达|离开|arrival|depart|welcome|announce/i.test(stemNorm)) {
    p += 28;
  }
  return p;
}

async function statSafe(p) {
  try {
    return await fs.stat(p);
  } catch (e) {
    return null;
  }
}

async function collectAudioEntries(audioDirAbs) {
  const entries = [];
  const audioRoot = path.resolve(audioDirAbs);

  async function walk(dirAbs, partsFromAudio) {
    let list;
    try {
      list = await fs.readdir(dirAbs, { withFileTypes: true });
    } catch (e) {
      return;
    }
    for (const ent of list) {
      if (ent.name.startsWith('.')) continue;
      const full = path.join(dirAbs, ent.name);
      const nextParts = partsFromAudio.length ? partsFromAudio.concat([ent.name]) : [ent.name];
      if (ent.isDirectory()) {
        await walk(full, nextParts);
        continue;
      }
      const ext = path.extname(ent.name).replace(/^\./, '').toLowerCase();
      if (!AUDIO_EXTS.has(ext)) continue;
      const relFromAudio = nextParts.join('/');
      const unixRel = path.posix.join('audio', relFromAudio.split(path.sep).join('/'));
      const stem = path.basename(ent.name, path.extname(ent.name));
      const stemNorm = normalizeForStationMatch(stem);
      if (!stemNorm) continue;
      entries.push({
        relativePath: unixRel,
        stem,
        stemNorm,
        langFlags: { ...detectLangFlagsFromPath(unixRel), ...detectLangFlags(stem) }
      });
    }
  }

  await walk(audioRoot, []);
  return entries;
}

async function getAudioStationIndexForAudioDir(audioDirAbs, lineDirAbs) {
  const key = makeAudioIndexCacheKey(lineDirAbs);
  if (!key) return [];
  const st = await statSafe(audioDirAbs);
  if (!st || !st.isDirectory()) return [];
  const cached = audioIndexCache.get(key);
  if (cached && cached.audioMtimeMs === st.mtimeMs && Array.isArray(cached.entries)) {
    return cached.entries;
  }
  const entries = await collectAudioEntries(audioDirAbs);
  audioIndexCache.set(key, { audioMtimeMs: st.mtimeMs, entries });
  return entries;
}

async function tryReadJson(p) {
  try {
    const txt = await fs.readFile(p, 'utf8');
    return JSON.parse(txt);
  } catch (e) {
    return null;
  }
}

async function resolveLineDataPath(lineFilePath, ensureMplExtracted) {
  const normalized = path.normalize(String(lineFilePath || ''));
  if (!normalized) return null;
  const low = normalized.toLowerCase();
  if (low.endsWith('.json')) return normalized;
  if (low.endsWith('.mpl')) {
    const ex = await ensureMplExtracted(normalized);
    if (!ex || !ex.dir) return null;
    const direct = path.join(ex.dir, 'line.json');
    try {
      await fs.access(direct);
      return direct;
    } catch (e) { /* fallthrough */ }
    let names;
    try {
      names = await fs.readdir(ex.dir);
    } catch (e) {
      return null;
    }
    const jf = names.find((f) => f.toLowerCase().endsWith('.json'));
    return jf ? path.join(ex.dir, jf) : null;
  }
  const inDir = path.join(normalized, 'line.json');
  try {
    await fs.access(inDir);
    return inDir;
  } catch (e) {
    return null;
  }
}

function addStationPeersFromLineJson(json, set) {
  const stations = json && Array.isArray(json.stations) ? json.stations : [];
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

async function buildPeerNormalizedSetForFindAudio(lineFilePath, opts, ensureMplExtracted) {
  const set = new Set();
  const peerArr = opts && Array.isArray(opts.peerStationNames) ? opts.peerStationNames : [];
  for (const p of peerArr) {
    const n = normalizeForStationMatch(p);
    if (n) set.add(n);
  }
  const jsonPath = await resolveLineDataPath(lineFilePath, ensureMplExtracted);
  if (jsonPath) {
    const json = await tryReadJson(jsonPath);
    if (json) addStationPeersFromLineJson(json, set);
  }
  return set;
}

function findAudioByStationNameFromIndex({ entries, stationName, opts, peerNormsSet }) {
  const role = opts && opts.role;
  const targetNorm = normalizeForStationMatch(stationName);
  if (!targetNorm || !Array.isArray(entries) || !entries.length) {
    return { ok: false, error: 'no-match', ...(role ? { role } : {}) };
  }

  let bestExact = null;
  let bestExactLang = -1;

  for (const e of entries) {
    const stemNorm = e.stemNorm;
    if (!(stemNorm === targetNorm)) continue;
    if (prefixStrictConflict(targetNorm, stemNorm, peerNormsSet)) continue;
    if (lineContextBlocksAudioBinding(targetNorm, stemNorm, peerNormsSet)) continue;
    const ls = langPreferenceScore(e.langFlags, opts || {});
    if (!bestExact || ls > bestExactLang || (ls === bestExactLang && e.relativePath < bestExact.relativePath)) {
      bestExact = e;
      bestExactLang = ls;
    }
  }

  if (bestExact) {
    return { ok: true, relativePath: bestExact.relativePath };
  }

  let best = null;
  let bestScore = -Infinity;

  for (const e of entries) {
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
        if (t.length >= 2 && stemNorm.includes(t)) {
          hit = true;
          match = 200 + t.length * 2;
          break;
        }
      }
      if (!hit) continue;
    }

    const ls = langPreferenceScore(e.langFlags, opts || {});
    const penalty = lengthImportPenalty(stemNorm, targetNorm);
    const score = match + ls * 0.85 - penalty;
    if (score > bestScore || (score === bestScore && best && e.relativePath < best.relativePath)) {
      bestScore = score;
      best = e;
    }
  }

  if (!best || bestScore < 180) {
    return { ok: false, error: 'no-match', ...(role ? { role } : {}) };
  }
  return { ok: true, relativePath: best.relativePath };
}

module.exports = {
  normalizeForStationMatch,
  buildStationMatchTokens,
  detectLangFlags,
  detectLangFlagsFromPath,
  lineContextBlocksAudioBinding,
  invalidateAudioStationIndexCache,
  getAudioStationIndexForAudioDir,
  buildPeerNormalizedSetForFindAudio,
  findAudioByStationNameFromIndex
};
