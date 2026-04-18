'use strict';

const path = require('path');
const fs = require('fs').promises;
function requireStationAudioMatcher() {
  /** @type {string[]} */
  const tried = [];
  const tryRequire = (p) => {
    tried.push(p);
    // eslint-disable-next-line global-require, import/no-dynamic-require
    return require(p);
  };

  try {
    return tryRequire('../shared/stationAudioMatcher');
  } catch (e1) {
    try {
      return tryRequire(path.resolve(__dirname, '..', 'shared', 'stationAudioMatcher'));
    } catch (e2) {
      try {
        // 兜底：某些构建/运行方式下 cwd 不在 out/main/main
        return tryRequire(path.resolve(process.cwd(), 'out', 'main', 'shared', 'stationAudioMatcher'));
      } catch (e3) {
        const err = new Error(
          [
            "Cannot load module 'shared/stationAudioMatcher'.",
            `__dirname=${String(__dirname)}`,
            `cwd=${String(process.cwd())}`,
            `tried=${JSON.stringify(tried)}`
          ].join(' ')
        );
        err.cause = e3;
        throw err;
      }
    }
  }
}

const {
  DEFAULT_MATCHER_RULES,
  resolveMatcherRules,
  normalizeForStationMatch,
  buildStationMatchTokens,
  detectLangFlags,
  detectLangFlagsFromPath,
  detectDoorSideFromText,
  lineContextBlocksAudioBinding,
  addStationPeersFromLineData,
  findAudioByStationNameFromIndex
} = requireStationAudioMatcher();

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
  const detectVariantRank = (stem) => {
    const m = String(stem || '').match(/(?:[_-](\d+)|\((\d+)\)|（(\d+)）)$/);
    if (!m) return 0;
    const n = Number(m[1] || m[2] || m[3] || 0);
    return Number.isFinite(n) ? n : 0;
  };

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
      const doorSide = detectDoorSideFromText(`${stem} ${unixRel}`);
      const st = await statSafe(full);
      entries.push({
        relativePath: unixRel,
        stem,
        stemNorm,
        langFlags: { ...detectLangFlagsFromPath(unixRel), ...detectLangFlags(stem) },
        doorSide,
        mtimeMs: st && Number.isFinite(st.mtimeMs) ? st.mtimeMs : 0,
        variantRank: detectVariantRank(stem)
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
    if (json) addStationPeersFromLineData(json, set);
  }
  return set;
}

module.exports = {
  DEFAULT_MATCHER_RULES,
  resolveMatcherRules,
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
