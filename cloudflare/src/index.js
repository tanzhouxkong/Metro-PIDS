/**
 * Metro-PIDS Cloudflare Worker
 * 提供预设线路、运控线路、更新日志、统计信息等 API 服务
 */
import stationAudioMatcher from '../../shared/stationAudioMatcher.js';

const {
  DEFAULT_MATCHER_RULES,
  normalizeForStationMatch,
  detectLangFlagsFromPath,
  detectDoorSideFromText,
  addStationPeersFromLineData,
  findAudioByStationNameFromIndex
} = stationAudioMatcher;

// ==================== 工具函数 ====================

/**
 * 读取请求 JSON 体
 */
async function readJson(request) {
  const text = await request.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error('Invalid JSON: ' + e.message);
  }
}

/**
 * 创建 JSON 响应
 */
function json(obj, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...extraHeaders
    }
  });
}

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function tryParseJsonString(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text) return null;
  if (!(text.startsWith('{') || text.startsWith('['))) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function hasValidLineName(line) {
  return !!(line && isPlainObject(line.meta) && typeof line.meta.lineName === 'string' && line.meta.lineName.trim());
}

/**
 * 从多种格式中提取线路 JSON（兼容旧版 JSON 与新版 MPL 包装结构）
 */
function extractLineData(payload) {
  if (!payload) return null;
  const queue = [payload];
  const visited = new Set();

  while (queue.length > 0) {
    const current = queue.shift();
    if (current == null) continue;

    if (typeof current === 'string') {
      const parsed = tryParseJsonString(current);
      if (parsed) queue.push(parsed);
      continue;
    }

    if (!isPlainObject(current)) continue;
    if (visited.has(current)) continue;
    visited.add(current);

    if (hasValidLineName(current)) return current;

    // 常见包装字段
    for (const key of ['line', 'lineData', 'appData', 'data', 'content', 'payload', 'json', 'lineJson', 'line_json']) {
      if (current[key] != null) queue.push(current[key]);
    }

    // 兼容 files['line.json'] / files.lineJson
    if (isPlainObject(current.files)) {
      const files = current.files;
      if (files['line.json'] != null) queue.push(files['line.json']);
      if (files.lineJson != null) queue.push(files.lineJson);
      if (files.line_json != null) queue.push(files.line_json);
    }

    // 兼容 entries 数组中携带 line.json 内容
    if (Array.isArray(current.entries)) {
      for (const ent of current.entries) {
        if (!isPlainObject(ent)) continue;
        const name = String(ent.name || ent.filename || '').toLowerCase();
        if (name === 'line.json') {
          if (ent.content != null) queue.push(ent.content);
          if (ent.data != null) queue.push(ent.data);
          if (ent.text != null) queue.push(ent.text);
          if (ent.json != null) queue.push(ent.json);
        }
      }
    }

    // 兼容单条线路数组包裹
    if (Array.isArray(current.lines) && current.lines.length === 1) {
      queue.push(current.lines[0]);
    }
  }

  return null;
}

/**
 * 获取 CORS 头
 */
function getCorsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Client-City,X-Client-Country,X-Device-Id'
  };
}

/**
 * 获取 GitHub API Token
 */
function getGitHubToken(env) {
  if (env.GITHUB_TOKEN) return env.GITHUB_TOKEN;
  if (env.CLOUD_TOKEN && env.CLOUD_TOKEN.startsWith('github_pat_')) {
    return env.CLOUD_TOKEN;
  }
  return null;
}

/**
 * 构建 GitHub API 请求头
 */
function getGitHubHeaders(env) {
  const headers = {
    'User-Agent': 'Metro-PIDS-Cloudflare-Worker/2.0',
    'Accept': 'application/vnd.github.v3+json'
  };
  const token = getGitHubToken(env);
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

/**
 * 检查写操作权限
 */
function checkWriteAuth(request, env) {
  const expectedToken = env.CLOUD_TOKEN;
  if (!expectedToken) return true; // 未配置 token 则允许
  
  const auth = request.headers.get('Authorization') || '';
  return auth === `Bearer ${expectedToken}`;
}

/**
 * 单独生成一个公告编号（32 位十六进制，用于区分不同公告版本）
 * 格式示例：c42064405d4b9dc8c84f592e88facd87
 * @returns {string} 32 位十六进制字符串
 */
function generateAnnouncementId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 规范化 Windows 操作系统版本号（合并相同版本）
 * @param {string} os - 操作系统字符串
 * @returns {string} 规范化后的操作系统字符串
 */
function normalizeOSVersion(os) {
  if (!os) return os;
  const osLower = os.toLowerCase();
  if (!osLower.includes('windows')) return os;

  // 已经是标准版本写法（如 Windows 11 22H2 / Windows 10 2004）时直接保留
  if (/windows\s+\d+(?:\.\d+)?\s+(\d{2}h\d|20\d{2}|19\d{2}|1[5-9]\d{2}|2[0-9]h\d)/i.test(os)) {
    return String(os).replace(/\s+/g, ' ').trim();
  }
  
  // 提取构建号（Build number）
  const buildMatch = os.match(/build\s*(\d+)|(\d+\.\d+\.(\d+))/i);
  let buildNumber = null;
  if (buildMatch) {
    buildNumber = parseInt(buildMatch[1] || buildMatch[3] || '0');
  }
  
  // 如果没有构建号，尝试从版本号中提取（如 10.0.26200）
  if (!buildNumber) {
    const versionMatch = os.match(/(\d+)\.(\d+)\.(\d+)/);
    if (versionMatch) {
      buildNumber = parseInt(versionMatch[3] || '0');
    }
  }
  
  // Windows版本映射表（Build号 -> 版本号）
  const windowsVersionMap = {
    // Windows 11
    26200: 'Windows 11 25H2',
    26100: 'Windows 11 24H2',
    22631: 'Windows 11 23H2',
    22621: 'Windows 11 22H2',
    22000: 'Windows 11 21H2',
    // Windows 10
    19045: 'Windows 10 22H2',
    19044: 'Windows 10 21H2',
    19043: 'Windows 10 21H1',
    19042: 'Windows 10 20H2',
    19041: 'Windows 10 2004',
    18363: 'Windows 10 19H2',
    18362: 'Windows 10 1903',
    17763: 'Windows 10 1809',
    17134: 'Windows 10 1803',
    16299: 'Windows 10 1709',
    15063: 'Windows 10 1703',
    14393: 'Windows 10 1607',
    10586: 'Windows 10 1511',
    10240: 'Windows 10 1507',
    // Windows 8.1
    9600: 'Windows 8.1',
    // Windows 8
    9200: 'Windows 8',
    // Windows 7
    7601: 'Windows 7 SP1',
    7600: 'Windows 7',
    // Windows Vista
    6002: 'Windows Vista SP2',
    6001: 'Windows Vista SP1',
    6000: 'Windows Vista',
    // Windows XP
    2600: 'Windows XP'
  };
  
  if (buildNumber) {
    // 精确匹配
    if (windowsVersionMap[buildNumber]) {
      return windowsVersionMap[buildNumber];
    }
    
    // 范围匹配（Windows 11）
    if (buildNumber >= 26200) return 'Windows 11 25H2';
    if (buildNumber >= 26100) return 'Windows 11 24H2';
    if (buildNumber >= 22631) return 'Windows 11 23H2';
    if (buildNumber >= 22621) return 'Windows 11 22H2';
    if (buildNumber >= 22000) return 'Windows 11 21H2';
    
    // 范围匹配（Windows 10）
    if (buildNumber >= 19045) return 'Windows 10 22H2';
    if (buildNumber >= 19041) return 'Windows 10 21H2';
    if (buildNumber >= 18363) return 'Windows 10 19H2';
    if (buildNumber >= 17763) return 'Windows 10 1809';
    if (buildNumber >= 17134) return 'Windows 10 1803';
    if (buildNumber >= 16299) return 'Windows 10 1709';
    if (buildNumber >= 15063) return 'Windows 10 1703';
    if (buildNumber >= 14393) return 'Windows 10 1607';
    if (buildNumber >= 10586) return 'Windows 10 1511';
    if (buildNumber >= 10240) return 'Windows 10 1507';
    
    // 范围匹配（Windows 8.1）
    if (buildNumber >= 9600) return 'Windows 8.1';
    
    // 范围匹配（Windows 8）
    if (buildNumber >= 9200) return 'Windows 8';
    
    // 范围匹配（Windows 7）
    if (buildNumber >= 7600) return 'Windows 7';
    
    // 范围匹配（Windows Vista）
    if (buildNumber >= 6000) return 'Windows Vista';
    
    // 范围匹配（Windows XP）
    if (buildNumber >= 2600) return 'Windows XP';
  }
  
  // 如果无法解析，尝试从原始字符串中提取信息
  if (osLower.includes('windows 11')) return 'Windows 11';
  if (osLower.includes('windows 10')) return 'Windows 10';
  if (osLower.includes('windows 8.1') || osLower.includes('windows 8.1')) return 'Windows 8.1';
  if (osLower.includes('windows 8')) return 'Windows 8';
  if (osLower.includes('windows 7')) return 'Windows 7';
  if (osLower.includes('windows vista')) return 'Windows Vista';
  if (osLower.includes('windows xp')) return 'Windows XP';
  
  return os;
}

/**
 * 检查时间范围是否有效
 * @param {string|null} startTime - 开始时间 (ISO 8601 格式，如 "2025-01-01T00:00:00Z")
 * @param {string|null} endTime - 结束时间 (ISO 8601 格式)
 * @returns {boolean} 当前时间是否在范围内
 */
function isWithinTimeRange(startTime, endTime) {
  if (!startTime && !endTime) return true; // 未设置时间范围，始终有效
  
  const now = new Date();
  const start = startTime ? new Date(startTime) : null;
  const end = endTime ? new Date(endTime) : null;
  
  if (start && now < start) return false; // 还未到开始时间
  if (end && now > end) return false; // 已过结束时间
  
  return true;
}

/**
 * 检查地理位置是否匹配
 * @param {string|null} country - 客户端国家代码（ISO 3166-1 alpha-2，如 "CN", "US"）
 * @param {string|null} city - 客户端城市名称
 * @param {Array<string>|null} allowedCountries - 允许的国家代码列表（null 表示不限制）
 * @param {Array<string>|null} blockedCountries - 禁止的国家代码列表（null 表示不限制）
 * @param {Array<string>|null} allowedCities - 允许的城市名称列表（null 表示不限制）
 * @param {Array<string>|null} blockedCities - 禁止的城市名称列表（null 表示不限制）
 * @returns {boolean} 地理位置是否匹配
 */
function isLocationAllowed(country, city, allowedCountries, blockedCountries, allowedCities, blockedCities) {
  // 如果所有限制都为空，表示不限制地理位置
  if (!allowedCountries && !blockedCountries && !allowedCities && !blockedCities) {
    return true;
  }
  
  // 检查国家限制
  if (country) {
    const countryUpper = country.toUpperCase();
    
    // 如果设置了允许列表，且当前国家不在允许列表中，则拒绝
    if (allowedCountries && Array.isArray(allowedCountries) && allowedCountries.length > 0) {
      const allowed = allowedCountries.some(c => c.toUpperCase() === countryUpper);
      if (!allowed) return false;
    }
    
    // 如果设置了禁止列表，且当前国家在禁止列表中，则拒绝
    if (blockedCountries && Array.isArray(blockedCountries) && blockedCountries.length > 0) {
      const blocked = blockedCountries.some(c => c.toUpperCase() === countryUpper);
      if (blocked) return false;
    }
  }
  
  // 检查城市限制
  if (city) {
    const cityLower = city.toLowerCase();
    
    // 如果设置了允许列表，且当前城市不在允许列表中，则拒绝
    if (allowedCities && Array.isArray(allowedCities) && allowedCities.length > 0) {
      const allowed = allowedCities.some(c => c.toLowerCase() === cityLower);
      if (!allowed) return false;
    }
    
    // 如果设置了禁止列表，且当前城市在禁止列表中，则拒绝
    if (blockedCities && Array.isArray(blockedCities) && blockedCities.length > 0) {
      const blocked = blockedCities.some(c => c.toLowerCase() === cityLower);
      if (blocked) return false;
    }
  }
  
  return true;
}

// ==================== 路由处理器 ====================

/**
 * 预设线路 API
 */
const PresetLinesHandler = {
  // GET /preset - 获取所有预设线路
  async list(env) {
    const list = await env.LINES.list();
    const lines = [];
    for (const key of list.keys) {
      // 跳过运控线路和统计记录
      if (key.name.startsWith('runtime:') || key.name.startsWith('telemetry:')) {
        continue;
      }
      const raw = await env.LINES.get(key.name);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        const line = extractLineData(parsed);
        if (line) lines.push(line);
      } catch {
        // 忽略损坏的数据
      }
    }
    return { ok: true, lines };
  },

  // GET /preset/:lineName - 获取单个预设线路
  async get(env, lineName) {
    const raw = await env.LINES.get(lineName);
    if (!raw) {
      throw { status: 404, error: '预设线路不存在' };
    }
    const parsed = JSON.parse(raw);
    const line = extractLineData(parsed);
    if (!line) {
      throw { status: 500, error: '预设线路数据格式无效' };
    }
    return { ok: true, line };
  },

  // POST /preset - 创建预设线路
  async create(env, body) {
    const line = extractLineData(body);
    if (!line?.meta?.lineName) {
      throw { status: 400, error: '请求体中缺少有效线路数据（meta.lineName）' };
    }
    const key = String(line.meta.lineName);
    const exists = await env.LINES.get(key);
    if (exists) {
      throw { status: 409, error: '该预设线路已存在，请使用 PUT 更新' };
    }
    await env.LINES.put(key, JSON.stringify(line));
    return { ok: true, line };
  },

  // PUT /preset/:lineName - 更新预设线路
  async update(env, lineName, body) {
    const line = extractLineData(body);
    if (!line?.meta?.lineName) {
      throw { status: 400, error: '请求体中缺少有效线路数据（meta.lineName）' };
    }
    if (line.meta.lineName !== lineName) {
      throw { status: 400, error: 'URL 与 body 中的 lineName 不一致' };
    }
    await env.LINES.put(lineName, JSON.stringify(line));
    return { ok: true, line };
  },

  // DELETE /preset/:lineName - 删除预设线路
  async delete(env, lineName) {
    await env.LINES.delete(lineName);
    return { ok: true };
  }
};

/**
 * 规范化运控线路名称，用于 KV key，保证同一条线路始终对应同一 key，网页上传可覆盖老版本
 * - 去除首尾空白
 * - Unicode NFC 规范化（避免同一名称不同编码产生不同 key）
 */
function normalizeRuntimeLineName(name) {
  if (name == null || typeof name !== 'string') return '';
  const s = String(name).trim();
  if (!s) return '';
  try {
    return s.normalize('NFC');
  } catch {
    return s;
  }
}

function getUtf8ByteLength(text) {
  try {
    return new TextEncoder().encode(String(text || '')).byteLength;
  } catch {
    return String(text || '').length;
  }
}

function splitAudioFilesForKv(audioMap, maxChunkBytes) {
  const entries = Object.entries(audioMap || {}).filter(([k, v]) => typeof k === 'string' && k && typeof v === 'string' && v);
  const chunks = [];
  let current = {};

  for (const [pathKey, dataUrl] of entries) {
    current[pathKey] = dataUrl;
    const currentSize = getUtf8ByteLength(JSON.stringify(current));
    if (currentSize <= maxChunkBytes) continue;

    delete current[pathKey];
    if (Object.keys(current).length === 0) {
      throw new Error(`单个音频条目过大，无法分片存储：${pathKey}`);
    }
    chunks.push(current);
    current = { [pathKey]: dataUrl };

    const oneSize = getUtf8ByteLength(JSON.stringify(current));
    if (oneSize > maxChunkBytes) {
      throw new Error(`单个音频条目超过分片上限：${pathKey}`);
    }
  }

  if (Object.keys(current).length > 0) chunks.push(current);
  return chunks;
}

function collectShardKeysFromLine(line) {
  const keys = line?.meta?.cloudAudioShardKeys;
  if (!Array.isArray(keys)) return [];
  return keys.filter((k) => typeof k === 'string' && k.trim());
}

async function deleteShardKeys(env, keys) {
  for (const key of keys || []) {
    try {
      await env.LINES.delete(key);
    } catch {
      // 忽略删除失败
    }
  }
}

async function hydrateRuntimeLineCloudAudio(env, line, options = {}) {
  const includeCloudAudioFiles = options?.includeCloudAudioFiles === true;
  if (!line || !line.meta || typeof line.meta !== 'object') return line;
  if (line.meta.cloudAudioFiles && typeof line.meta.cloudAudioFiles === 'object') {
    if (!includeCloudAudioFiles) {
      line.meta.cloudAudioCount = Object.keys(line.meta.cloudAudioFiles).length;
      line.meta.cloudAudioSource = line.meta.cloudAudioSource || 'embedded';
      line.meta.cloudAudioAvailable = line.meta.cloudAudioCount > 0;
      delete line.meta.cloudAudioFiles;
    }
    return line;
  }
  const shardKeys = collectShardKeysFromLine(line);
  if (!shardKeys.length) {
    line.meta.cloudAudioAvailable = false;
    return line;
  }

  const merged = {};
  for (const shardKey of shardKeys) {
    const raw = await env.LINES.get(shardKey);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        for (const [k, v] of Object.entries(parsed)) {
          if (typeof k === 'string' && k && typeof v === 'string' && v) {
            merged[k] = v;
          }
        }
      }
    } catch {
      // 忽略损坏分片
    }
  }

  line.meta.cloudAudioCount = Object.keys(merged).length;
  line.meta.cloudAudioSource = line.meta.cloudAudioSource || 'embedded';
  line.meta.cloudAudioAvailable = line.meta.cloudAudioCount > 0;
  if (includeCloudAudioFiles) {
    line.meta.cloudAudioFiles = merged;
  } else {
    delete line.meta.cloudAudioFiles;
  }
  return line;
}

function decodeBase64ToUint8Array(base64Text) {
  const clean = String(base64Text || '').replace(/\s+/g, '');
  const binary = atob(clean);
  const len = binary.length;
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function decodeCloudAudioDataUrl(input) {
  if (typeof input !== 'string' || !input) return null;
  const raw = input.trim();
  if (!raw) return null;
  const m = raw.match(/^data:([^;,]+)?(?:;charset=[^;,]+)?(;base64)?,(.*)$/i);
  if (!m) return null;
  const contentType = (m[1] || 'application/octet-stream').trim();
  const isBase64 = !!m[2];
  const payload = m[3] || '';
  try {
    if (isBase64) {
      return { contentType, bytes: decodeBase64ToUint8Array(payload) };
    }
    const text = decodeURIComponent(payload);
    const encoder = new TextEncoder();
    return { contentType, bytes: encoder.encode(text) };
  } catch {
    return null;
  }
}

const RUNTIME_AUDIO_EXTS = new Set(['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac']);

function buildPeerNormSetForRuntimeAudioMatch(line, opts) {
  const set = new Set();
  const peers = opts && Array.isArray(opts.peerStationNames) ? opts.peerStationNames : [];
  for (const p of peers) {
    const n = normalizeForStationMatch(p);
    if (n) set.add(n);
  }
  addStationPeersFromLineData(line, set);
  return set;
}

function buildRuntimeAudioEntriesFromCloudMap(cloudAudioFiles) {
  const out = [];
  if (!cloudAudioFiles || typeof cloudAudioFiles !== 'object') return out;
  for (const key of Object.keys(cloudAudioFiles)) {
    if (typeof key !== 'string' || !key) continue;
    const rel = String(key).replace(/\\/g, '/').replace(/^\/+/, '').trim();
    if (!rel) continue;
    const ext = (rel.split('.').pop() || '').toLowerCase();
    if (!RUNTIME_AUDIO_EXTS.has(ext)) continue;
    const base = rel.split('/').pop() || '';
    const stem = base.replace(/\.[^.]+$/, '');
    const stemNorm = normalizeForStationMatch(stem);
    if (!stemNorm) continue;
    const doorSide = detectDoorSideFromText(`${stem} ${rel}`);
    out.push({
      relativePath: rel,
      stem,
      stemNorm,
      langFlags: detectLangFlagsFromPath(rel),
      doorSide
    });
  }
  return out;
}

/**
 * 运控线路 API
 */
const RuntimeLinesHandler = {
  PREFIX: 'runtime:',
  AUDIO_PREFIX: 'runtime-audio:',
  KV_VALUE_LIMIT_BYTES: 26_214_400,
  SHARD_SAFE_LIMIT_BYTES: 20_000_000,

  // GET /runtime/lines - 获取所有运控线路（分页拉全量，按规范化 lineName 去重，规范 key 优先）
  async list(env) {
    const linesByKey = new Map(); // normalized lineName -> line
    const lineSizesByKey = new Map(); // normalized lineName -> sizeBytes
    const canonicalKey = (norm) => this.PREFIX + norm;
    let cursor = null;
    do {
      const opts = { prefix: this.PREFIX, limit: 1000 };
      if (cursor) opts.cursor = cursor;
      const list = await env.LINES.list(opts);
      for (const k of list.keys || []) {
        const raw = await env.LINES.get(k.name);
        if (!raw) continue;
        try {
          const parsed = JSON.parse(raw);
          const line = extractLineData(parsed);
          if (!line) continue;
          const metaName = line?.meta?.lineName;
          const norm = normalizeRuntimeLineName(metaName) || k.name.replace(this.PREFIX, '');
          const isCanonical = k.name === canonicalKey(norm);
          const metadataSize = Number(k?.metadata?.sizeBytes);
          const sizeBytes = Number.isFinite(metadataSize) && metadataSize >= 0 ? metadataSize : getUtf8ByteLength(raw);
          if (isCanonical || !linesByKey.has(norm)) {
            linesByKey.set(norm, line);
            lineSizesByKey.set(norm, sizeBytes);
          }
        } catch {
          // 忽略损坏的数据
        }
      }
      cursor = (list.list_complete === true || list.listComplete === true) ? null : (list.cursor || null);
    } while (cursor);

    const lineSizes = {};
    for (const [norm, size] of lineSizesByKey.entries()) {
      lineSizes[norm] = size;
    }
    return { lines: Array.from(linesByKey.values()), lineSizes };
  },

  // GET /runtime/lines/:lineName - 获取单个运控线路
  async get(env, lineName, options = {}) {
    const norm = normalizeRuntimeLineName(lineName);
    const key = this.PREFIX + norm;
    let raw = await env.LINES.get(key);

    // 兼容老数据：如果按规范化 key 获取不到，尝试根据 meta.lineName 搜索
    if (!raw) {
      const list = await env.LINES.list({ prefix: this.PREFIX });
      for (const k of list.keys) {
        const value = await env.LINES.get(k.name);
        if (!value) continue;
        try {
          const json = extractLineData(JSON.parse(value));
          if (!json) continue;
          const metaName = json?.meta?.lineName;
          if (normalizeRuntimeLineName(metaName) === norm) {
            raw = JSON.stringify(json);
            break;
          }
        } catch {
          // 忽略解析失败的数据
        }
      }
    }

    if (!raw) {
      throw { status: 404, error: '运控线路不存在' };
    }

    const parsed = JSON.parse(raw);
    const line = extractLineData(parsed);
    if (!line) {
      throw { status: 500, error: '运控线路数据格式无效' };
    }
    return await hydrateRuntimeLineCloudAudio(env, line, {
      includeCloudAudioFiles: options?.includeCloudAudioFiles === true
    });
  },

  // GET /runtime/lines/:lineName/audio?path=audio/xx.mp3
  async getAudio(env, lineName, relativePath) {
    const rel = String(relativePath || '')
      .replace(/\\/g, '/')
      .replace(/^\/+/, '')
      .replace(/^(\.\.\/)+/, '')
      .trim();
    if (!rel) throw { status: 400, error: '缺少音频路径参数 path' };

    const line = await this.get(env, lineName, { includeCloudAudioFiles: true });
    const cloudAudioFiles = line?.meta?.cloudAudioFiles;
    if (!cloudAudioFiles || typeof cloudAudioFiles !== 'object') {
      throw { status: 404, error: '线路未包含云端音频' };
    }
    const payload = cloudAudioFiles[rel] || cloudAudioFiles[rel.toLowerCase()] || null;
    if (!payload || typeof payload !== 'string') {
      throw { status: 404, error: '音频不存在' };
    }
    const decoded = decodeCloudAudioDataUrl(payload);
    if (!decoded || !decoded.bytes) {
      throw { status: 500, error: '音频数据格式无效' };
    }

    return new Response(decoded.bytes, {
      status: 200,
      headers: {
        'Content-Type': decoded.contentType || 'application/octet-stream',
        'Cache-Control': 'public, max-age=86400'
      }
    });
  },

  // POST /runtime/lines/:lineName/find-audio { stationName, opts }
  async findAudioByStationName(env, lineName, stationName, opts = {}) {
    const name = String(stationName || '').trim();
    if (!name) return { ok: false, error: 'invalid-stationName' };
    const line = await this.get(env, lineName, { includeCloudAudioFiles: true });
    const cloudAudioFiles = line?.meta?.cloudAudioFiles;
    if (!cloudAudioFiles || typeof cloudAudioFiles !== 'object') {
      return { ok: false, error: 'no-audio-entries' };
    }
    const entries = buildRuntimeAudioEntriesFromCloudMap(cloudAudioFiles);
    if (!entries.length) return { ok: false, error: 'no-audio-entries' };
    const peerNormsSet = buildPeerNormSetForRuntimeAudioMatch(line, opts || {});
    const matcherConfig = await DynamicAudioMatcherConfigHandler.get(env);
    return findAudioByStationNameFromIndex({
      entries,
      stationName: name,
      opts: { ...(opts || {}), matcherRules: matcherConfig },
      peerNormsSet
    });
  },

  // PUT /runtime/lines/:lineName - 更新/创建运控线路（始终用规范化名称作 key，新上传覆盖老版本）
  async update(env, lineName, body) {
    const line = extractLineData(body);
    if (!line?.meta?.lineName) {
      throw { status: 400, error: '请求体中缺少有效线路数据（meta.lineName）' };
    }
    const bodyNorm = normalizeRuntimeLineName(line.meta.lineName);
    const urlNorm = normalizeRuntimeLineName(lineName);
    if (bodyNorm !== urlNorm) {
      throw { status: 400, error: 'URL 与 body 中的 lineName 不一致' };
    }

    const key = this.PREFIX + bodyNorm;
    const existingRaw = await env.LINES.get(key);
    let oldShardKeys = [];
    if (existingRaw) {
      try {
        const existingParsed = JSON.parse(existingRaw);
        const existingLine = extractLineData(existingParsed);
        oldShardKeys = collectShardKeysFromLine(existingLine);
      } catch {
        oldShardKeys = [];
      }
    }

    const originalRaw = JSON.stringify(line);
    let rawToStore = originalRaw;
    let lineToStore = line;
    let shardKeys = [];
    let storageMode = 'inline';

    if (getUtf8ByteLength(originalRaw) > this.KV_VALUE_LIMIT_BYTES) {
      const cloudAudioFiles = line?.meta?.cloudAudioFiles;
      if (!cloudAudioFiles || typeof cloudAudioFiles !== 'object' || Array.isArray(cloudAudioFiles)) {
        throw { status: 413, error: `KV PUT failed: value too large (${getUtf8ByteLength(originalRaw)} bytes), 且不存在可分片的 cloudAudioFiles` };
      }

      const chunks = splitAudioFilesForKv(cloudAudioFiles, this.SHARD_SAFE_LIMIT_BYTES);
      const baseLine = JSON.parse(JSON.stringify(line));
      if (!baseLine.meta || typeof baseLine.meta !== 'object') baseLine.meta = {};
      delete baseLine.meta.cloudAudioFiles;

      const shardSuffix = Date.now();
      for (let i = 0; i < chunks.length; i++) {
        const shardKey = `${this.AUDIO_PREFIX}${bodyNorm}:${shardSuffix}:${i}`;
        const shardRaw = JSON.stringify(chunks[i]);
        await env.LINES.put(shardKey, shardRaw, {
          metadata: {
            lineName: String(line.meta.lineName || ''),
            type: 'runtime-audio-shard',
            index: i,
            updatedAt: Date.now()
          }
        });
        shardKeys.push(shardKey);
      }

      baseLine.meta.cloudAudioShardKeys = shardKeys;
      baseLine.meta.cloudAudioShardCount = shardKeys.length;
      baseLine.meta.cloudAudioSource = 'embedded';
      lineToStore = baseLine;
      rawToStore = JSON.stringify(baseLine);
      storageMode = 'sharded';
    }

    const sizeBytes = getUtf8ByteLength(rawToStore);
    if (sizeBytes > this.KV_VALUE_LIMIT_BYTES) {
      await deleteShardKeys(env, shardKeys);
      throw { status: 413, error: `KV PUT failed: value too large after sharding (${sizeBytes} bytes)` };
    }

    await env.LINES.put(key, rawToStore, {
      metadata: {
        lineName: String(line.meta.lineName || ''),
        sizeBytes,
        storageMode,
        shardCount: shardKeys.length,
        updatedAt: Date.now()
      }
    });

    const staleShardKeys = oldShardKeys.filter((k) => !shardKeys.includes(k));
    if (staleShardKeys.length) {
      await deleteShardKeys(env, staleShardKeys);
    }

    return {
      ok: true,
      line: lineToStore,
      sizeBytes,
      storageMode,
      shardCount: shardKeys.length
    };
  },

  // POST /runtime/lines/upload-shard - 上传单个音频分片（用于大线路分片上传）
  async uploadShard(env, lineName, body) {
    const norm = normalizeRuntimeLineName(lineName);
    if (!norm) {
      throw { status: 400, error: '缺少有效的线路名称' };
    }

    const uploadId = body?.uploadId != null ? String(body.uploadId) : '';
    const index = Number(body?.index);
    const audioFiles = body?.audioFiles;
    if (!uploadId || !Number.isInteger(index) || index < 0) {
      throw { status: 400, error: 'uploadId/index 无效' };
    }
    if (!audioFiles || typeof audioFiles !== 'object' || Array.isArray(audioFiles)) {
      throw { status: 400, error: 'audioFiles 无效' };
    }

    const raw = JSON.stringify(audioFiles);
    const sizeBytes = getUtf8ByteLength(raw);
    if (sizeBytes > this.KV_VALUE_LIMIT_BYTES) {
      throw { status: 413, error: `分片过大：${sizeBytes} bytes` };
    }

    const shardKey = `${this.AUDIO_PREFIX}${norm}:upload:${uploadId}:${index}`;
    await env.LINES.put(shardKey, raw, {
      metadata: {
        lineName: norm,
        type: 'runtime-audio-shard',
        uploadId,
        index,
        sizeBytes,
        updatedAt: Date.now()
      }
    });

    return {
      ok: true,
      shardKey,
      sizeBytes,
      count: Object.keys(audioFiles).length
    };
  },

  // DELETE /runtime/lines/:lineName - 删除运控线路（删除规范 key 及所有同一条线路的旧 key）
  async delete(env, lineName) {
    const norm = normalizeRuntimeLineName(lineName);
    const canonicalKey = this.PREFIX + norm;
    const collectDeleteTargets = new Set([canonicalKey]);

    const canonicalRaw = await env.LINES.get(canonicalKey);
    if (canonicalRaw) {
      try {
        const canonicalLine = extractLineData(JSON.parse(canonicalRaw));
        for (const shardKey of collectShardKeysFromLine(canonicalLine)) {
          collectDeleteTargets.add(shardKey);
        }
      } catch {
        // ignore
      }
    }

    await env.LINES.delete(canonicalKey);
    let cursor = null;
    do {
      const opts = { prefix: this.PREFIX, limit: 1000 };
      if (cursor) opts.cursor = cursor;
      const list = await env.LINES.list(opts);
      for (const k of list.keys || []) {
        if (k.name === canonicalKey) continue;
        const raw = await env.LINES.get(k.name);
        if (!raw) continue;
        try {
          const line = extractLineData(JSON.parse(raw));
          if (!line) continue;
          const metaNorm = normalizeRuntimeLineName(line?.meta?.lineName);
          if (metaNorm === norm) {
            for (const shardKey of collectShardKeysFromLine(line)) {
              collectDeleteTargets.add(shardKey);
            }
            await env.LINES.delete(k.name);
          }
        } catch {
          // 忽略损坏的数据
        }
      }
      cursor = (list.list_complete === true || list.listComplete === true) ? null : (list.cursor || null);
    } while (cursor);

    await deleteShardKeys(env, Array.from(collectDeleteTargets).filter((k) => k.startsWith(this.AUDIO_PREFIX)));
    return { ok: true };
  }
};

const DynamicAudioMatcherConfigHandler = {
  KEY: 'dynamic:audio:matcher:config:v1',
  defaultConfig() {
    return {
      version: '1.0',
      updatedAt: 0,
      updatedBy: 'system',
      rules: { ...DEFAULT_MATCHER_RULES }
    };
  },
  sanitizeRules(rawRules) {
    const src = (rawRules && typeof rawRules === 'object') ? rawRules : {};
    const out = { ...DEFAULT_MATCHER_RULES };
    if (src.scoreThreshold !== undefined) out.scoreThreshold = Number(src.scoreThreshold);
    if (src.tokenMinLength !== undefined) out.tokenMinLength = Number(src.tokenMinLength);
    if (src.lengthPenaltyFactor !== undefined) out.lengthPenaltyFactor = Number(src.lengthPenaltyFactor);
    if (src.maxLengthPenalty !== undefined) out.maxLengthPenalty = Number(src.maxLengthPenalty);
    if (src.importKeywordPenalty !== undefined) out.importKeywordPenalty = Number(src.importKeywordPenalty);
    if (Array.isArray(src.importPenaltyKeywords)) {
      out.importPenaltyKeywords = src.importPenaltyKeywords.map((x) => String(x || '').trim()).filter(Boolean);
    }
    return out;
  },
  normalizeConfig(raw) {
    const base = this.defaultConfig();
    const obj = (raw && typeof raw === 'object') ? raw : {};
    const version = String(obj.version || base.version).trim() || base.version;
    const updatedBy = String(obj.updatedBy || obj.operator || base.updatedBy).trim() || base.updatedBy;
    const updatedAt = Number.isFinite(Number(obj.updatedAt)) ? Number(obj.updatedAt) : Date.now();
    const rules = this.sanitizeRules(obj.rules || obj);
    return { version, updatedAt, updatedBy, rules };
  },
  async get(env) {
    const raw = await env.LINES.get(this.KEY);
    if (!raw) return this.defaultConfig();
    try {
      const parsed = JSON.parse(raw);
      return this.normalizeConfig(parsed);
    } catch {
      return this.defaultConfig();
    }
  },
  async update(env, body, operator = 'admin') {
    const normalized = this.normalizeConfig({
      ...(body && typeof body === 'object' ? body : {}),
      updatedAt: Date.now(),
      updatedBy: operator || 'admin'
    });
    await env.LINES.put(this.KEY, JSON.stringify(normalized), {
      metadata: { type: 'dynamic-audio-matcher-config', version: normalized.version, updatedAt: normalized.updatedAt }
    });
    return { ok: true, config: normalized };
  }
};

/**
 * GitHub Releases API
 */
const ReleasesHandler = {
  REPO_URL: 'https://api.github.com/repos/tanzhouxkong/Metro-PIDS',
  CACHE_KEY: 'config:releases',
  CACHE_TTL: 3600, // 缓存 1 小时（3600 秒）

  // 从 GitHub API 获取 Releases
  async fetchFromGitHub(env) {
    const apiUrl = this.REPO_URL + '/releases';
    console.log('[Releases] 📥 从 GitHub API 获取 Releases...');
    console.log('[Releases] 请求 URL:', apiUrl);
    
    const headers = getGitHubHeaders(env);
    const hasToken = !!headers['Authorization'];
    console.log('[Releases] 使用 Token:', hasToken ? '是（已配置）' : '否（未配置）');
    
    const response = await fetch(apiUrl, { headers });
    
    console.log('[Releases] GitHub API 响应状态:', response.status);
    
    if (!response.ok) {
      let errorDetail = `GitHub API ${response.status}`;
      let errorMessage = '';
      try {
        const errorBody = await response.text();
        if (errorBody) {
          const errorJson = JSON.parse(errorBody);
          errorMessage = errorJson.message || '';
          errorDetail = errorMessage || errorDetail;
          console.error('[Releases] ❌ GitHub API 错误详情:', errorDetail);
        }
      } catch (e) {
        console.error('[Releases] 解析错误响应失败:', e);
      }
      
      if (response.status === 404) {
        throw { 
          status: response.status, 
          error: `仓库未找到 (404)。请检查仓库名称是否正确: ${this.REPO_URL}`,
          detail: errorMessage || '可能是仓库名称错误、仓库不存在、或仓库是私有的但 Token 权限不足'
        };
      }
      
      if (response.status === 403) {
        throw { 
          status: response.status, 
          error: 'GitHub API 访问受限（可能是速率限制或 Token 无效），请检查 GITHUB_TOKEN 配置',
          detail: errorDetail
        };
      }
      
      throw { status: response.status, error: `GitHub API 错误: ${response.status}`, detail: errorDetail };
    }
    
    const releases = await response.json();
    console.log('[Releases] ✅ 从 GitHub 成功获取', releases?.length || 0, '个 Releases');
    
    const recentReleases = (releases || []).slice(0, 10).map(release => ({
      tag_name: release.tag_name,
      name: release.name,
      body: release.body,
      published_at: release.published_at,
      html_url: release.html_url,
      prerelease: release.prerelease,
      draft: release.draft,
      assets: (release.assets || []).map(asset => ({
        name: asset.name,
        browser_download_url: asset.browser_download_url,
        size: asset.size,
        content_type: asset.content_type,
        download_count: asset.download_count
      }))
    }));
    
    return recentReleases;
  },

  // GET /releases - 获取 Releases 列表（优先从 KV 缓存读取）
  async list(env) {
    try {
      // 1. 先尝试从 KV 缓存读取
      const cached = await env.LINES.get(this.CACHE_KEY);
      if (cached) {
        try {
          const cachedData = JSON.parse(cached);
          const now = Date.now();
          const cacheTime = cachedData.timestamp || 0;
          const age = now - cacheTime;
          
          // 如果缓存未过期（1小时内），直接返回缓存数据
          if (age < this.CACHE_TTL * 1000) {
            console.log('[Releases] ✅ 从 KV 缓存读取，缓存年龄:', Math.floor(age / 1000), '秒');
            return { ok: true, releases: cachedData.releases || [], cached: true };
          } else {
            console.log('[Releases] ⚠️ KV 缓存已过期，年龄:', Math.floor(age / 1000), '秒，重新从 GitHub 获取');
          }
        } catch (e) {
          console.warn('[Releases] ⚠️ KV 缓存数据解析失败，重新从 GitHub 获取:', e);
        }
      } else {
        console.log('[Releases] 📦 KV 缓存不存在，从 GitHub 获取');
      }
      
      // 2. 从 GitHub API 获取
      const recentReleases = await this.fetchFromGitHub(env);
      
      // 3. 保存到 KV 缓存
      try {
        const cacheData = {
          releases: recentReleases,
          timestamp: Date.now()
        };
        await env.LINES.put(this.CACHE_KEY, JSON.stringify(cacheData));
        console.log('[Releases] ✅ 已保存到 KV 缓存');
      } catch (saveError) {
        console.warn('[Releases] ⚠️ 保存到 KV 缓存失败（不影响返回）:', saveError);
      }
      
      console.log('[Releases] ✅ 返回', recentReleases.length, '个最近的 Releases');
      return { ok: true, releases: recentReleases, cached: false };
    } catch (error) {
      console.error('[Releases] ❌ 获取 Releases 失败:', error);
      
      // 如果 GitHub API 失败，尝试返回缓存数据（即使过期）
      try {
        const cached = await env.LINES.get(this.CACHE_KEY);
        if (cached) {
          const cachedData = JSON.parse(cached);
          if (cachedData.releases && cachedData.releases.length > 0) {
            console.log('[Releases] ⚠️ GitHub API 失败，返回过期缓存数据');
            return { ok: true, releases: cachedData.releases, cached: true, stale: true };
          }
        }
      } catch (e) {
        console.warn('[Releases] 无法读取缓存作为降级方案:', e);
      }
      
      throw error;
    }
  },

  // GET /releases/latest - 获取最新版本（从缓存或 GitHub API）
  async latest(env, origin) {
    try {
      // 1. 先尝试从缓存读取
      const cached = await env.LINES.get(this.CACHE_KEY);
      if (cached) {
        try {
          const cachedData = JSON.parse(cached);
          if (cachedData.releases && cachedData.releases.length > 0) {
            // 从缓存中取第一个（最新的）release
            const latestRelease = cachedData.releases[0];
            console.log('[Releases] ✅ 从 KV 缓存读取最新版本:', latestRelease.tag_name);
            return {
              ok: true,
              version: latestRelease.tag_name ? latestRelease.tag_name.replace(/^v/, '') : '',
              tag_name: latestRelease.tag_name,
              name: latestRelease.name,
              body: latestRelease.body,
              published_at: latestRelease.published_at,
              html_url: latestRelease.html_url,
              prerelease: latestRelease.prerelease,
              draft: latestRelease.draft,
              assets: (latestRelease.assets || []).map(asset => ({
                name: asset.name,
                browser_download_url: asset.browser_download_url,
                proxy_download_url: `${origin}/releases/download/${latestRelease.tag_name}/${asset.name}`,
                size: asset.size,
                content_type: asset.content_type,
                download_count: asset.download_count
              }))
            };
          }
        } catch (e) {
          console.warn('[Releases] ⚠️ 缓存数据解析失败，从 GitHub 获取最新版本:', e);
        }
      }
      
      // 2. 如果缓存不存在，从 GitHub API 获取
      console.log('[Releases] 📥 从 GitHub API 获取最新版本...');
      const response = await fetch(this.REPO_URL + '/releases/latest', {
        headers: getGitHubHeaders(env)
      });
      
      if (!response.ok) {
        throw { status: response.status, error: `GitHub API 错误: ${response.status}` };
      }
      
      const release = await response.json();
      console.log('[Releases] ✅ 从 GitHub 获取最新版本:', release.tag_name);
      
      return {
        ok: true,
        version: release.tag_name ? release.tag_name.replace(/^v/, '') : '',
        tag_name: release.tag_name,
        name: release.name,
        body: release.body,
        published_at: release.published_at,
        html_url: release.html_url,
        prerelease: release.prerelease,
        draft: release.draft,
        assets: (release.assets || []).map(asset => ({
          name: asset.name,
          browser_download_url: asset.browser_download_url,
          proxy_download_url: `${origin}/releases/download/${release.tag_name}/${asset.name}`,
          size: asset.size,
          content_type: asset.content_type,
          download_count: asset.download_count
        }))
      };
    } catch (error) {
      console.error('[Releases] ❌ 获取最新版本失败:', error);
      throw error;
    }
  },

  // GET /releases/download/:tag/:file - 下载：有 R2 则从 R2 读，否则由 Worker 从 GitHub 实时代理（流式转发，无需 R2）
  async download(env, tagName, fileName) {
    const r2Key = `${tagName}/${fileName}`;
    if (env.RELEASES_BUCKET) {
      try {
        const object = await env.RELEASES_BUCKET.get(r2Key);
        if (object) {
          const contentType = object.httpMetadata?.contentType || 'application/octet-stream';
          const disposition = `attachment; filename="${fileName.replace(/"/g, '\\"')}"`;
          return new Response(object.body, {
            status: 200,
            headers: {
              'Content-Type': contentType,
              'Content-Disposition': disposition,
              'Cache-Control': 'public, max-age=3600',
              ...getCorsHeaders()
            }
          });
        }
      } catch (e) {
        console.warn('[Releases] R2 读取失败，回退到代理:', e?.message || e);
      }
    }
    // 无 R2 或 R2 无此文件：从 GitHub 实时代理，流式转发给用户（用户仍从你的域名下载，无需 R2）
    const downloadUrl = `https://github.com/tanzhouxkong/Metro-PIDS/releases/download/${tagName}/${fileName}`;
    const res = await fetch(downloadUrl, { headers: getGitHubHeaders(env) });
    if (!res.ok) {
      return json(
        { ok: false, error: res.status === 404 ? '文件不存在' : `拉取失败: ${res.status}` },
        res.status === 404 ? 404 : 502,
        getCorsHeaders()
      );
    }
    const contentType = res.headers.get('Content-Type') || 'application/octet-stream';
    const disposition = res.headers.get('Content-Disposition') || `attachment; filename="${fileName.replace(/"/g, '\\"')}"`;
    return new Response(res.body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': disposition,
        'Cache-Control': 'public, max-age=3600',
        ...getCorsHeaders()
      }
    });
  },

  // POST /releases/sync-asset - 从 GitHub 拉取指定 release 文件并保存到 R2（需 Token 认证）
  async syncAsset(env, tagName, fileName) {
    if (!env.RELEASES_BUCKET) {
      throw { status: 503, error: 'R2 未配置，请在 wrangler.toml 中配置 RELEASES_BUCKET 并创建桶 metro-pids-releases' };
    }
    const downloadUrl = `https://github.com/tanzhouxkong/Metro-PIDS/releases/download/${tagName}/${fileName}`;
    const res = await fetch(downloadUrl, {
      headers: getGitHubHeaders(env)
    });
    if (!res.ok) {
      throw {
        status: res.status === 404 ? 404 : 502,
        error: res.status === 404 ? 'Release 或文件不存在' : `从 GitHub 拉取失败: ${res.status}`
      };
    }
    const contentType = res.headers.get('Content-Type') || 'application/octet-stream';
    const r2Key = `${tagName}/${fileName}`;
    await env.RELEASES_BUCKET.put(r2Key, res.body, {
      httpMetadata: { contentType }
    });
    console.log('[Releases] ✅ 已同步到 R2:', r2Key);
    return { ok: true, key: r2Key, message: '已保存到服务器，用户将从服务器下载' };
  },

  // POST /releases/sync-release/:tag - 将某版本下所有 assets 从 GitHub 同步到 R2（需 Token 认证）
  async syncRelease(env, tagName) {
    if (!env.RELEASES_BUCKET) {
      throw { status: 503, error: 'R2 未配置' };
    }
    const apiUrl = `${this.REPO_URL}/releases/tags/${encodeURIComponent(tagName)}`;
    const res = await fetch(apiUrl, { headers: getGitHubHeaders(env) });
    if (!res.ok) {
      throw { status: res.status === 404 ? 404 : 502, error: res.status === 404 ? 'Release 不存在' : `GitHub API ${res.status}` };
    }
    const release = await res.json();
    const assets = release.assets || [];
    if (assets.length === 0) {
      return { ok: true, synced: 0, message: '该版本没有可同步的附件' };
    }
    const results = [];
    for (const asset of assets) {
      const name = asset.name;
      const downloadUrl = asset.browser_download_url;
      try {
        const fileRes = await fetch(downloadUrl, { headers: getGitHubHeaders(env) });
        if (!fileRes.ok) continue;
        const r2Key = `${tagName}/${name}`;
        await env.RELEASES_BUCKET.put(r2Key, fileRes.body, {
          httpMetadata: { contentType: fileRes.headers.get('Content-Type') || 'application/octet-stream' }
        });
        results.push({ name, ok: true });
        console.log('[Releases] ✅ 已同步到 R2:', r2Key);
      } catch (e) {
        results.push({ name, ok: false, error: e?.message || String(e) });
      }
    }
    return { ok: true, synced: results.filter(r => r.ok).length, results };
  }
};

/**
 * electron-updater generic 更新源（供应用自动更新走 Cloudflare）
 * - GET /update/latest.yml → 从 GitHub 最新 release 拉取 latest.yml 并返回
 * - GET /update/:fileName → 安装包请求，重定向到 /releases/download/:tag/:fileName（由现有 download 代理）
 */
const UpdateFeedHandler = {
  // 从文件名解析版本号，用于拼 tag（如 Metro-PIDS-Setup-1.6.1.exe → v1.6.1）
  versionFromFileName(fileName) {
    const m = /Setup-([\d.]+)\.(exe|zip|dmg|AppImage)$/i.exec(fileName);
    return m ? m[1] : null;
  },

  // GET /update/latest.yml
  async getLatestYml(env) {
    const res = await fetch(ReleasesHandler.REPO_URL + '/releases/latest', {
      headers: getGitHubHeaders(env)
    });
    if (!res.ok) {
      throw { status: res.status === 404 ? 404 : 502, error: res.status === 404 ? '未找到最新 Release' : `GitHub API ${res.status}` };
    }
    const release = await res.json();
    const tag = release.tag_name || '';
    const ymlUrl = `https://github.com/tanzhouxkong/Metro-PIDS/releases/download/${tag}/latest.yml`;
    const ymlRes = await fetch(ymlUrl, { headers: getGitHubHeaders(env) });
    if (!ymlRes.ok) {
      throw { status: ymlRes.status === 404 ? 404 : 502, error: 'latest.yml 不存在，请确保发布时上传了 latest.yml' };
    }
    const ymlText = await ymlRes.text();
    return new Response(ymlText, {
      status: 200,
      headers: {
        'Content-Type': 'text/yaml; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
        ...getCorsHeaders()
      }
    });
  },

  // GET /update/:fileName（安装包）→ 重定向到 /releases/download/vX.Y.Z/fileName
  async handleFileRequest(env, fileName, origin) {
    if (!fileName || fileName.includes('/') || fileName.includes('..')) {
      throw { status: 400, error: '无效文件名' };
    }
    if (fileName === 'latest.yml') {
      return await this.getLatestYml(env);
    }
    const version = this.versionFromFileName(fileName);
    if (!version) {
      throw { status: 404, error: '无法从文件名解析版本，仅支持 *-Setup-X.Y.Z.exe 等格式' };
    }
    const tag = version.startsWith('v') ? version : 'v' + version;
    const location = `${origin.replace(/\/+$/, '')}/releases/download/${tag}/${encodeURIComponent(fileName)}`;
    return new Response(null, {
      status: 302,
      headers: {
        'Location': location,
        ...getCorsHeaders()
      }
    });
  }
};

/**
 * 更新日志 API
 */
const ChangelogHandler = {
  REPO_URL: 'https://api.github.com/repos/tanzhouxkong/Metro-PIDS/releases',
  CACHE_TTL: 300, // 5 分钟
  KEY: 'config:changelog',

  // 从 GitHub 获取并转换为 changelog 格式
  async fetchFromGitHub(env) {
    const response = await fetch(this.REPO_URL, {
      headers: getGitHubHeaders(env)
    });
    
    if (!response.ok) {
      let errorDetail = `GitHub API ${response.status}`;
      try {
        const errorBody = await response.text();
        if (errorBody) {
          const errorJson = JSON.parse(errorBody);
          errorDetail = errorJson.message || errorDetail;
        }
      } catch {}
      
      if (response.status === 401) {
        throw {
          status: 401,
          error: 'GitHub 认证失败（Bad credentials）',
          detail: '请为 Worker 配置有效的 GITHUB_TOKEN：在 cloudflare 目录执行 wrangler secret put GITHUB_TOKEN，然后输入 GitHub Personal Access Token（需 repo 或 public_repo 权限）。Token 可在 GitHub → Settings → Developer settings → Personal access tokens 创建。'
        };
      }
      if (response.status === 403) {
        throw {
          status: 503,
          error: 'GitHub API 访问受限（可能是速率限制），请稍后重试',
          detail: errorDetail
        };
      }
      throw { status: response.status, error: errorDetail };
    }
    
    const releases = await response.json();
    return (releases || []).slice(0, 20).map(r => ({
      version: (r.tag_name || '').replace(/^v/, ''),
      title: r.name || `版本 ${(r.tag_name || '').replace(/^v/, '')}`,
      content: r.body || '',
      releaseDate: r.published_at || new Date().toISOString(),
      prerelease: !!r.prerelease
    }));
  },

  // GET /update/changelog
  async get(env, request) {
    const url = new URL(request.url);
    const force = url.searchParams.get('force') === '1';
    const source = url.searchParams.get('source') || 'auto';

    // 1. 优先从 KV 读取（除非 force=1 或 source=github。force=1 时跳过 KV，避免「从 GitHub 同步」后立刻「从服务器加载」仍读到旧 KV 因最终一致性未生效）
    if (source !== 'github' && !force) {
      try {
        const stored = await env.LINES.get(this.KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          const list = Array.isArray(parsed?.changelog)
            ? parsed.changelog
            : (Array.isArray(parsed) ? parsed : []);
          if (list.length > 0) {
            return { changelog: list, source: 'kv' };
          }
        }
      } catch (e) {
        console.warn('[Changelog] 读取 KV 配置失败，回退到 GitHub 缓存/实时获取:', e);
      }
    }

    // 2. 构建 GitHub 缓存键
    const githubHeaders = getGitHubHeaders(env);
    const cacheKey = new Request(this.REPO_URL, { headers: githubHeaders });
    
    // 3. 如果不是强制刷新，尝试从 Cloudflare Cache 读取 GitHub Releases
    if (!force) {
      const cached = await caches.default.match(cacheKey);
      if (cached) {
        const cachedData = await cached.json();
        const list = (cachedData || []).slice(0, 20).map(r => ({
          version: (r.tag_name || '').replace(/^v/, ''),
          title: r.name || `版本 ${(r.tag_name || '').replace(/^v/, '')}`,
          content: r.body || '',
          releaseDate: r.published_at || new Date().toISOString(),
          prerelease: !!r.prerelease
        }));
        return { changelog: list, cached: true, source: 'github-cache' };
      }
    }
    
    // 4. 从 GitHub 实时获取（若 403 等失败则回退到 KV / 缓存，避免直接 503）
    let changelog;
    try {
      changelog = await this.fetchFromGitHub(env);
    } catch (githubError) {
      console.warn('[Changelog] GitHub 获取失败，回退到 KV/缓存:', githubError?.status || githubError?.message);
      // 回退 1：从 KV 读取
      try {
        const stored = await env.LINES.get(this.KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          const list = Array.isArray(parsed?.changelog) ? parsed.changelog : (Array.isArray(parsed) ? parsed : []);
          if (list.length > 0) {
            return { changelog: list, source: 'kv', _fallback: true, _reason: 'GitHub API 受限或暂时不可用，已返回服务器已保存的版本' };
          }
        }
      } catch (e) {}
      // 回退 2：从 Cloudflare Cache 读取
      const cached = await caches.default.match(cacheKey);
      if (cached) {
        const cachedData = await cached.json();
        const list = (cachedData || []).slice(0, 20).map(r => ({
          version: (r.tag_name || '').replace(/^v/, ''),
          title: r.name || `版本 ${(r.tag_name || '').replace(/^v/, '')}`,
          content: r.body || '',
          releaseDate: r.published_at || new Date().toISOString(),
          prerelease: !!r.prerelease
        }));
        if (list.length > 0) {
          return { changelog: list, cached: true, source: 'github-cache', _fallback: true, _reason: 'GitHub API 受限或暂时不可用，已返回缓存版本' };
        }
      }
      throw githubError;
    }

    // 5. 更新 Cloudflare Cache（GitHub 原始响应）
    try {
      const githubRaw = await fetch(this.REPO_URL, { headers: githubHeaders }).then(r => r.json());
      const cacheResponse = new Response(JSON.stringify(githubRaw), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${this.CACHE_TTL}` }
      });
      await caches.default.put(cacheKey, cacheResponse);
    } catch (e) {
      console.warn('[Changelog] 更新 GitHub 缓存失败（忽略）:', e);
    }

    // 6. 同步一份到 KV，便于前端只读场景直接使用
    try {
      await env.LINES.put(this.KEY, JSON.stringify({ changelog, updatedAt: new Date().toISOString() }));
    } catch (e) {
      console.warn('[Changelog] 将 GitHub 更新日志写入 KV 失败（忽略）:', e);
    }

    return { changelog, source: 'github' };
  },

  // POST /update/changelog/sync/github - 强制同步
  async sync(env) {
    // 清除缓存
    const githubHeaders = getGitHubHeaders(env);
    const cacheKey = new Request(this.REPO_URL, { headers: githubHeaders });
    await caches.default.delete(cacheKey);
    
    // 从 GitHub 获取
    const changelog = await this.fetchFromGitHub(env);
    
    // 更新缓存（GitHub 原始响应）
    try {
      const githubRaw = await fetch(this.REPO_URL, { headers: githubHeaders }).then(r => r.json());
      const cacheResponse = new Response(JSON.stringify(githubRaw), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${this.CACHE_TTL}` }
      });
      await caches.default.put(cacheKey, cacheResponse);
    } catch (e) {
      console.warn('[Changelog] 刷新 GitHub 缓存失败（忽略）:', e);
    }
    
    // 同步写入 KV，便于后台管理读取
    try {
      await env.LINES.put(this.KEY, JSON.stringify({ changelog, updatedAt: new Date().toISOString() }));
    } catch (e) {
      console.warn('[Changelog] 将同步后的更新日志写入 KV 失败（忽略）:', e);
    }
    
    return { ok: true, changelog };
  },

  // PUT /update/changelog - 由后台保存自定义 changelog
  async put(env, body) {
    if (!body || typeof body !== 'object') {
      throw { status: 400, error: '缺少请求体' };
    }

    const rawList = Array.isArray(body.changelog) ? body.changelog : (Array.isArray(body) ? body : null);
    if (!rawList) {
      throw { status: 400, error: '请求体中缺少 changelog 数组' };
    }

    // 规范化字段，避免把多余字段写入 KV
    const changelog = rawList.map(item => ({
      version: String(item.version || '').trim(),
      title: String(item.title || '').trim(),
      content: String(item.content || ''),
      releaseDate: item.releaseDate || new Date().toISOString(),
      prerelease: item.prerelease === true
    })).filter(item => item.version && item.content);

    await env.LINES.put(this.KEY, JSON.stringify({
      changelog,
      updatedAt: new Date().toISOString()
    }));

    return { ok: true, changelog };
  }
};

/**
 * 版本更新信息 API
 */
const UpdateInfoHandler = {
  // 获取 KV key（基于平台和架构）
  getKey(platform, arch) {
    return `config:update:${platform}:${arch}`;
  },

  // GET /update/check - 获取版本信息和强制更新设置
  async check(env, request) {
    const url = new URL(request.url);
    const platform = url.searchParams.get('platform') || 'win32';
    const arch = url.searchParams.get('arch') || 'x64';
    const noCache = url.searchParams.get('noCache') === '1';
    
    console.log('[UpdateInfo] 📥 检查版本信息，平台:', platform, '架构:', arch);
    
    try {
      // 1. 从 KV 读取强制更新设置
      const key = this.getKey(platform, arch);
      let updateInfo = null;
      
      const stored = await env.LINES.get(key);
      if (stored) {
        try {
          updateInfo = JSON.parse(stored);
          console.log('[UpdateInfo] ✅ 从 KV 读取版本信息:', updateInfo.version || 'unknown');
        } catch (e) {
          console.warn('[UpdateInfo] ⚠️ KV 数据解析失败:', e);
        }
      }
      
      // 2. 从 GitHub Releases 获取最新版本（如果 KV 中没有或需要刷新）
      let latestRelease = null;
      const origin = url.origin || (request.url ? new URL(request.url).origin : '');
      if (!updateInfo || noCache) {
        try {
          const latest = await ReleasesHandler.latest(env, origin);
          if (latest && latest.ok) {
            latestRelease = latest;
            console.log('[UpdateInfo] ✅ 从 GitHub 获取最新版本:', latestRelease.version);
          }
        } catch (e) {
          console.warn('[UpdateInfo] ⚠️ 从 GitHub 获取最新版本失败:', e);
          // 如果 GitHub 失败但 KV 中有数据，使用 KV 数据
          if (updateInfo) {
            console.log('[UpdateInfo] 使用 KV 中的版本信息');
          }
        }
      } else {
        // 如果 KV 中有版本号，也尝试获取最新版本（用于比较）
        try {
          const latest = await ReleasesHandler.latest(env, origin);
          if (latest && latest.ok) {
            latestRelease = latest;
          }
        } catch (e) {
          // 忽略错误，使用 KV 中的版本
        }
      }
      
      // 3. 合并数据：优先使用 GitHub 的最新版本，保留 KV 中的强制更新设置
      const result = {
        version: latestRelease?.version || updateInfo?.version || 'unknown',
        tag_name: latestRelease?.tag_name || updateInfo?.tag_name || '',
        name: latestRelease?.name || updateInfo?.name || '',
        body: latestRelease?.body || updateInfo?.body || '',
        published_at: latestRelease?.published_at || updateInfo?.published_at || '',
        html_url: latestRelease?.html_url || updateInfo?.html_url || '',
        prerelease: latestRelease?.prerelease || false,
        draft: latestRelease?.draft || false,
        assets: latestRelease?.assets || updateInfo?.assets || [],
        // 强制更新设置（从 KV 读取）
        minimumVersion: updateInfo?.minimumVersion || undefined,
        forceUpdate: updateInfo?.forceUpdate === true || false
      };
      
      // 如果从 GitHub 获取到了新版本，更新 KV（但不覆盖强制更新设置）
      if (latestRelease && (!updateInfo || updateInfo.version !== latestRelease.version)) {
        try {
          const updatedInfo = {
            ...result,
            // 保留原有的强制更新设置
            minimumVersion: updateInfo?.minimumVersion,
            forceUpdate: updateInfo?.forceUpdate
          };
          await env.LINES.put(key, JSON.stringify(updatedInfo));
          console.log('[UpdateInfo] ✅ 已更新 KV 中的版本信息');
        } catch (e) {
          console.warn('[UpdateInfo] ⚠️ 更新 KV 失败:', e);
        }
      }
      
      return { ok: true, updateInfo: result };
    } catch (error) {
      console.error('[UpdateInfo] ❌ 检查版本信息失败:', error);
      throw error;
    }
  },

  // POST /update/sync/github - 从 GitHub 同步版本信息
  async syncFromGitHub(env, request) {
    const url = new URL(request.url);
    const platform = url.searchParams.get('platform') || 'win32';
    const arch = url.searchParams.get('arch') || 'x64';
    const origin = url.origin || (request.url ? new URL(request.url).origin : '');
    
    console.log('[UpdateInfo] 🔄 从 GitHub 同步版本信息，平台:', platform, '架构:', arch);
    
    try {
      // 同步时清除 Releases 缓存，确保从 GitHub /releases/latest 拉取真正的最新版本（避免仍返回旧缓存导致显示 1.5.9 而非 1.6.0）
      await env.LINES.delete(ReleasesHandler.CACHE_KEY);
      // 从 GitHub 获取最新版本
      const latest = await ReleasesHandler.latest(env, origin);
      if (!latest || !latest.ok) {
        throw { status: 500, error: '无法从 GitHub 获取最新版本' };
      }
      
      // 读取现有的强制更新设置
      const key = this.getKey(platform, arch);
      let existingInfo = null;
      const stored = await env.LINES.get(key);
      if (stored) {
        try {
          existingInfo = JSON.parse(stored);
        } catch (e) {
          console.warn('[UpdateInfo] 解析现有配置失败:', e);
        }
      }
      
      // 合并：使用 GitHub 的版本信息，保留强制更新设置
      const updateInfo = {
        version: latest.version,
        tag_name: latest.tag_name,
        name: latest.name,
        body: latest.body,
        published_at: latest.published_at,
        html_url: latest.html_url,
        prerelease: latest.prerelease,
        draft: latest.draft,
        assets: latest.assets,
        // 保留原有的强制更新设置
        minimumVersion: existingInfo?.minimumVersion,
        forceUpdate: existingInfo?.forceUpdate
      };
      
      // 保存到 KV
      await env.LINES.put(key, JSON.stringify(updateInfo));
      console.log('[UpdateInfo] ✅ 已同步并保存版本信息');
      
      return { ok: true, updateInfo };
    } catch (error) {
      console.error('[UpdateInfo] ❌ 同步失败:', error);
      throw error;
    }
  },

  // PUT /update/info - 更新版本信息（主要用于设置强制更新）
  async update(env, request, body) {
    const url = new URL(request.url);
    const platform = url.searchParams.get('platform') || 'win32';
    const arch = url.searchParams.get('arch') || 'x64';
    
    console.log('[UpdateInfo] 💾 更新版本信息，平台:', platform, '架构:', arch);
    
    if (!body || typeof body !== 'object') {
      throw { status: 400, error: '缺少更新信息数据' };
    }
    
    const key = this.getKey(platform, arch);
    
    // 读取现有数据
    let existingInfo = {};
    const stored = await env.LINES.get(key);
    if (stored) {
      try {
        existingInfo = JSON.parse(stored);
      } catch (e) {
        console.warn('[UpdateInfo] 解析现有配置失败:', e);
      }
    }
    
    // 合并更新（body 中的字段会覆盖 existingInfo）
    const updateInfo = {
      ...existingInfo,
      ...body
    };
    
    // 保存到 KV
    await env.LINES.put(key, JSON.stringify(updateInfo));
    console.log('[UpdateInfo] ✅ 已保存版本信息');
    
    return { ok: true, updateInfo };
  }
};

/**
 * 统计信息 API（使用 D1 数据库，支持全量查询、按日期排序）
 */
const TelemetryHandler = {
  // POST /telemetry - 接收统计信息
  async record(env, request, body) {
    if (!env.DB) {
      throw { status: 503, error: 'D1 数据库未配置，请运行 wrangler d1 create metro-pids-db 并配置 wrangler.toml' };
    }
    const { deviceId, version, platform, osVersion } = body;
    if (!deviceId) {
      throw { status: 400, error: '缺少 deviceId' };
    }
    
    const country = request.cf?.country || request.headers.get('CF-IPCountry') || 'unknown';
    const city = request.cf?.city || 'unknown';
    
    // 解析操作系统信息
    let os = 'unknown';
    if (platform) {
      const platformLower = String(platform).toLowerCase();
      if (platformLower.includes('win32') || platformLower.includes('windows')) {
        const raw = osVersion ? String(osVersion).trim() : '';
        os = raw
          ? (/^windows\b/i.test(raw) ? raw : `Windows ${raw}`)
          : 'Windows';
      } else if (platformLower.includes('darwin') || platformLower.includes('mac')) {
        const raw = osVersion ? String(osVersion).trim() : '';
        os = raw
          ? (/^macos\b|^darwin\b/i.test(raw) ? raw : `macOS ${raw}`)
          : 'macOS';
      } else if (platformLower.includes('linux')) {
        const raw = osVersion ? String(osVersion).trim() : '';
        os = raw
          ? (/^linux\b/i.test(raw) ? raw : `Linux ${raw}`)
          : 'Linux';
      } else {
        os = platform;
      }
    }
    
    // 规范化操作系统版本号（合并相同版本）
    os = normalizeOSVersion(os);
    
    // 生成记录
    const ts = Date.now();
    const recordId = `${ts}_${deviceId.substring(0, 8)}_${Math.random().toString(36).substring(2, 9)}`;
    
    try {
      await env.DB.prepare(
        'INSERT INTO telemetry (id, device_id, version, country, city, os, ts) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).bind(recordId, String(deviceId), String(version || 'unknown'), String(country), String(city), String(os), ts).run();
      console.log('[Telemetry] ✅ 已保存记录到 D1:', recordId);
    } catch (saveError) {
      console.error('[Telemetry] ❌ 保存到 D1 失败:', saveError);
      throw { status: 500, error: '保存统计记录失败: ' + (saveError?.message || String(saveError)) };
    }
    
    return { ok: true, id: recordId };
  },

  // GET /stats - 获取统计信息（从 D1 查询，支持全量、按日期排序）
  async stats(env) {
    if (!env.DB) {
      console.warn('[Telemetry] D1 未配置');
      return { total: 0, uniqueDevices: 0, byCountry: {}, byVersion: {}, byOS: {}, byDevice: {}, records: [], all: [], recent: [], truncated: false };
    }
    console.log('[Telemetry] 📊 从 D1 获取统计信息');
    try {
      const MAX_RECORDS_RETURN = 5000;

      // 总数
      const totalRes = await env.DB.prepare('SELECT COUNT(*) as cnt FROM telemetry').first();
      const total = totalRes ? (totalRes.cnt || 0) : 0;

      if (total === 0) {
        return { total: 0, uniqueDevices: 0, byCountry: {}, byVersion: {}, byOS: {}, byDevice: {}, records: [], all: [], recent: [], truncated: false };
      }

      // 独立设备数
      const uniqueRes = await env.DB.prepare('SELECT COUNT(DISTINCT device_id) as cnt FROM telemetry').first();
      const uniqueDevices = uniqueRes ? (uniqueRes.cnt || 0) : 0;

      // 按国家、版本、OS 聚合（访问次数）
      const byCountry = {};
      const byVersion = {};
      const byOS = {};
      const byDevice = {};
      const aggRes = await env.DB.prepare(
        'SELECT country, version, os, device_id FROM telemetry'
      ).all();
      if (aggRes.results) {
        for (const row of aggRes.results) {
          byCountry[row.country] = (byCountry[row.country] || 0) + 1;
          byVersion[row.version] = (byVersion[row.version] || 0) + 1;
          // 规范化操作系统版本号以合并相同版本
          const normalizedOS = normalizeOSVersion(row.os || 'unknown');
          byOS[normalizedOS] = (byOS[normalizedOS] || 0) + 1;
          byDevice[row.device_id] = (byDevice[row.device_id] || 0) + 1;
        }
      }

      // 最近记录（按 ts 倒序，取前 MAX_RECORDS_RETURN 条）
      const recordsRes = await env.DB.prepare(
        'SELECT id, device_id as deviceId, version, country, city, os, ts FROM telemetry ORDER BY ts DESC LIMIT ?'
      ).bind(MAX_RECORDS_RETURN).all();
      const records = (recordsRes.results || []).map(r => ({
        id: r.id,
        deviceId: r.deviceId,
        version: r.version,
        country: r.country,
        city: r.city,
        os: r.os,
        ts: r.ts
      }));

      const truncated = total > MAX_RECORDS_RETURN;
      const result = {
        total,
        uniqueDevices,
        byCountry: Object.keys(byCountry).length > 0 ? byCountry : {},
        byVersion: Object.keys(byVersion).length > 0 ? byVersion : {},
        byOS: Object.keys(byOS).length > 0 ? byOS : {},
        byDevice: Object.keys(byDevice).length > 0 ? byDevice : {},
        records,
        all: records,
        recent: records,
        truncated
      };
      console.log('[Telemetry] 📊 D1 统计结果:', { total, uniqueDevices });
      return result;
    } catch (error) {
      console.error('[Telemetry] ❌ 获取统计信息失败:', error);
      return {
        total: 0,
        uniqueDevices: 0,
        byCountry: {},
        byVersion: {},
        byOS: {},
        byDevice: {},
        records: [],
        all: [],
        recent: [],
        truncated: false
      };
    }
  },

  // DELETE /stats/record/:id - 删除单条记录
  async deleteRecord(env, recordId) {
    if (!env.DB) return { ok: true };
    await env.DB.prepare('DELETE FROM telemetry WHERE id = ?').bind(recordId).run();
    return { ok: true };
  },

  // DELETE /stats/records - 批量删除
  async deleteRecords(env, body) {
    if (!env.DB) return { ok: true, deleted: 0 };
    const { deviceId, before, all } = body;
    
    if (all) {
      const r = await env.DB.prepare('DELETE FROM telemetry').run();
      return { ok: true, deleted: r.meta?.changes ?? 0 };
    }
    
    if (deviceId) {
      let r;
      if (before) {
        r = await env.DB.prepare('DELETE FROM telemetry WHERE device_id = ? AND ts < ?').bind(deviceId, before).run();
      } else {
        r = await env.DB.prepare('DELETE FROM telemetry WHERE device_id = ?').bind(deviceId).run();
      }
      return { ok: true, deleted: r.meta?.changes ?? 0 };
    }
    
    if (before) {
      const r = await env.DB.prepare('DELETE FROM telemetry WHERE ts < ?').bind(before).run();
      return { ok: true, deleted: r.meta?.changes ?? 0 };
    }
    
    throw { status: 400, error: '请指定删除条件（all、deviceId 或 before）' };
  }
};

/**
 * 统计配置 API（例如：要在管理端全局排除的设备ID列表）
 */
const StatsConfigHandler = {
  KEY: 'config:stats',

  // GET /stats/config - 获取统计配置
  async get(env) {
    const raw = await env.LINES.get(this.KEY);
    if (!raw) {
      return {
        ok: true,
        config: {
          excludedDevices: []
        }
      };
    }
    try {
      const cfg = JSON.parse(raw);
      const list = Array.isArray(cfg.excludedDevices) ? cfg.excludedDevices : [];
      const normalized = list.map((id) => String(id).trim()).filter(Boolean);
      return {
        ok: true,
        config: {
          excludedDevices: normalized
        }
      };
    } catch (e) {
      console.error('[StatsConfig] 解析配置失败:', e);
      return {
        ok: true,
        config: {
          excludedDevices: []
        }
      };
    }
  },

  // PUT /stats/config - 更新统计配置
  async update(env, body) {
    if (!body || typeof body !== 'object') {
      throw { status: 400, error: '缺少配置数据' };
    }
    const list = Array.isArray(body.excludedDevices) ? body.excludedDevices : [];
    const normalized = list.map((id) => String(id).trim()).filter(Boolean);
    const config = { excludedDevices: normalized };
    await env.LINES.put(this.KEY, JSON.stringify(config));
    return { ok: true, config };
  }
};

const TELEMETRY_KV_PREFIX = 'telemetry:';

const MIGRATE_BATCH_SIZE = 400;

/**
 * 将 KV 中的 telemetry 历史数据迁移到 D1（需认证）
 * 支持分批：传入 cursor 可继续上次迁移，避免超时
 */
async function migrateTelemetryKvToD1(env, cursorFromQuery) {
  if (!env.DB) {
    return { ok: false, error: 'D1 未配置' };
  }
  let migrated = 0;
  let skipped = 0;
  let errors = 0;
  let cursor = cursorFromQuery || null;
  const opts = { prefix: TELEMETRY_KV_PREFIX, limit: MIGRATE_BATCH_SIZE };
  if (cursor) opts.cursor = cursor;
  const list = await env.LINES.list(opts);
  const keys = list.keys || [];
  const listDone = list.list_complete === true || list.listComplete === true;
  const nextCursor = (list.cursor && String(list.cursor).trim()) || null;
  const hasMore = (keys.length >= MIGRATE_BATCH_SIZE && nextCursor) || (!listDone && nextCursor);
  for (const k of keys) {
    try {
      let record = null;
      if (k.metadata && typeof k.metadata.deviceId !== 'undefined' && k.metadata.ts) {
        record = k.metadata;
      }
      if (!record) {
        const raw = await env.LINES.get(k.name);
        if (!raw) { errors++; continue; }
        try {
          record = JSON.parse(raw);
        } catch (e) { errors++; continue; }
      }
      if (!record.deviceId || !record.ts) { skipped++; continue; }
      const recordId = record.id || k.name.replace(TELEMETRY_KV_PREFIX, '');
      // 规范化操作系统版本号（合并相同版本）
      const normalizedOS = normalizeOSVersion(record.os || 'unknown');
      await env.DB.prepare(
        'INSERT OR IGNORE INTO telemetry (id, device_id, version, country, city, os, ts) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).bind(
        recordId,
        String(record.deviceId),
        String(record.version || 'unknown'),
        String(record.country || 'unknown'),
        String(record.city || 'unknown'),
        String(normalizedOS),
        record.ts
      ).run();
      migrated++;
    } catch (e) {
      console.error('[Migrate] 迁移失败:', k?.name, e);
      errors++;
    }
  }
  return {
    ok: true,
    batchProcessed: keys.length,
    migrated,
    skipped,
    errors,
    hasMore,
    nextCursor: hasMore ? nextCursor : null
  };
}

/**
 * 彩蛋配置 API
 */
const EasterEggsHandler = {
  KEY: 'config:easter-eggs',
  
  // GET /easter-eggs - 获取彩蛋配置
  async get(env) {
    const raw = await env.LINES.get(this.KEY);
    if (!raw) {
      // 返回默认配置（未配置状态）
      return {
        ok: true,
        config: {
          stations: [],
          messages: [],
          enabled: false,
          _isDefault: true  // 标记为默认配置（未配置）
        }
      };
    }
    try {
      const config = JSON.parse(raw);
      // 确保有 _isDefault 字段（已配置的数据没有此字段）
      if (!('_isDefault' in config)) {
        config._isDefault = false;
      }
      return { ok: true, config };
    } catch (e) {
      console.error('[EasterEggs] 解析配置失败:', e);
      return {
        ok: true,
        config: {
          stations: [],
          messages: [],
          enabled: false,
          _isDefault: true
        }
      };
    }
  },
  
  // PUT /easter-eggs - 更新彩蛋配置（支持 items 列表：每项 id/name + stations[] + messages[]，或兼容旧格式 stations/messages）
  async update(env, body) {
    if (!body || typeof body !== 'object') {
      throw { status: 400, error: '缺少配置数据' };
    }
    const enabled = body.enabled === true;
    let config;
    if (Array.isArray(body.items) && body.items.length > 0) {
      config = {
        enabled,
        items: body.items.map((it) => {
          const o = {
            id: it.id != null ? String(it.id) : '',
            name: it.name != null ? String(it.name) : '',
            enabled: it.enabled !== false,
            stations: Array.isArray(it.stations) ? it.stations.map((s) => String(s)) : [],
            messages: Array.isArray(it.messages) ? it.messages.map((m) => String(m)) : []
          };
          if (it.date != null && String(it.date).trim()) o.date = String(it.date).trim().slice(0, 8);
          return o;
        })
      };
    } else {
      config = {
        enabled,
        stations: Array.isArray(body.stations) ? body.stations : [],
        messages: Array.isArray(body.messages) ? body.messages : []
      };
    }
    await env.LINES.put(this.KEY, JSON.stringify(config));
    return { ok: true, config: { ...config, _isDefault: false } };
  }
};

/**
 * 启动公告配置 API
 * 用于在客户端启动时弹出公告（每次运行 / 每天一次）
 * 支持时间范围和地理位置控制
 */
const StartupNoticeHandler = {
  KEY: 'config:startup-notice',

  // 将旧版单条公告格式转为 notices 列表
  _normalizeToNotices(config) {
    if (config.notices && Array.isArray(config.notices) && config.notices.length > 0) {
      return config;
    }
    const one = {
      id: config.id || generateAnnouncementId(),
      mode: config.mode === 'oncePerDay' ? 'oncePerDay' : 'everyRun',
      enabled: config.enabled !== false,
      title: config.title || '',
      message: config.message || '',
      startTime: config.startTime ?? null,
      endTime: config.endTime ?? null,
      allowedCountries: config.allowedCountries ?? null,
      blockedCountries: config.blockedCountries ?? null,
      allowedCities: config.allowedCities ?? null,
      blockedCities: config.blockedCities ?? null,
      updatedAt: config.updatedAt ?? null
    };
    return {
      enabled: !!config.enabled,
      notices: [one]
    };
  },

  // GET /startup-notice - 获取启动公告配置（返回 { enabled, notices: [...] }）
  async get(env, request = null) {
    const raw = await env.LINES.get(this.KEY);
    if (!raw) {
      return {
        ok: true,
        config: {
          enabled: false,
          notices: [],
          _isDefault: true
        }
      };
    }
    try {
      let config = JSON.parse(raw);
      config = this._normalizeToNotices(config);
      if (!('_isDefault' in config)) {
        config._isDefault = false;
      }
      if (!config.notices) {
        config.notices = [];
      }

      if (request && config.notices.length > 0) {
        const country = request.cf?.country || request.headers?.get('CF-IPCountry') || null;
        const city = request.cf?.city || null;
        const clientCountry = request.headers?.get('X-Client-Country') || country;
        const clientCity = request.headers?.get('X-Client-City') || city;
        for (const notice of config.notices) {
          const timeValid = isWithinTimeRange(notice.startTime, notice.endTime);
          const locationValid = isLocationAllowed(
            clientCountry,
            clientCity,
            notice.allowedCountries,
            notice.blockedCountries,
            notice.allowedCities,
            notice.blockedCities
          );
          notice._isEffective = config.enabled && (notice.enabled !== false) && timeValid && locationValid;
          notice._timeValid = timeValid;
          notice._locationValid = locationValid;
        }
      }

      // 确保每条公告的 enabled 明确出现在响应中，避免旧客户端/缓存导致丢失
      config.notices = config.notices.map((n) => ({ ...n, enabled: n.enabled !== false }));
      return { ok: true, config };
    } catch (e) {
      console.error('[StartupNotice] 解析配置失败:', e);
      return {
        ok: true,
        config: {
          enabled: false,
          notices: [],
          _isDefault: true
        }
      };
    }
  },

  // PUT /startup-notice - 更新启动公告配置（body: { enabled, notices: [ { id?, title, message, mode, ... } ] }）
  async update(env, body) {
    if (!body || typeof body !== 'object') {
      throw { status: 400, error: '缺少配置数据' };
    }

    const now = new Date().toISOString();
    const notices = Array.isArray(body.notices) ? body.notices : [];
    const normalized = notices.map((n) => {
      let id = typeof n.id === 'string' && n.id.trim() ? n.id.trim() : null;
      if (!id) {
        id = generateAnnouncementId();
      }
      // 明确持久化 enabled：仅当客户端显式传 false 时存 false，否则存 true
      const enabled = n && Object.prototype.hasOwnProperty.call(n, 'enabled') && n.enabled === false ? false : true;
      return {
        id,
        mode: n.mode === 'oncePerDay' ? 'oncePerDay' : 'everyRun',
        enabled,
        title: typeof n.title === 'string' ? n.title : '',
        message: typeof n.message === 'string' ? n.message : '',
        startTime: typeof n.startTime === 'string' && n.startTime.trim() ? n.startTime.trim() : null,
        endTime: typeof n.endTime === 'string' && n.endTime.trim() ? n.endTime.trim() : null,
        allowedCountries: Array.isArray(n.allowedCountries) ? n.allowedCountries.filter(c => typeof c === 'string') : null,
        blockedCountries: Array.isArray(n.blockedCountries) ? n.blockedCountries.filter(c => typeof c === 'string') : null,
        allowedCities: Array.isArray(n.allowedCities) ? n.allowedCities.filter(c => typeof c === 'string') : null,
        blockedCities: Array.isArray(n.blockedCities) ? n.blockedCities.filter(c => typeof c === 'string') : null,
        updatedAt: n.updatedAt || now
      };
    });

    const config = {
      enabled: body.enabled === true,
      notices: normalized
    };

    await env.LINES.put(this.KEY, JSON.stringify(config));
    return { ok: true, config: { ...config, _isDefault: false } };
  }
};

/**
 * 显示端功能开关 API（例如云控控制系统显示器选项是否可见）
 * 支持时间范围和地理位置控制
 */
const DisplayFlagsHandler = {
  KEY: 'config:display-flags',

  _normalizeDisplaysMap(displays) {
    if (!displays || typeof displays !== 'object' || Array.isArray(displays)) return null;
    const out = {};
    for (const [id, val] of Object.entries(displays)) {
      const v = (val && typeof val === 'object') ? val : {};
      const enRaw = Object.prototype.hasOwnProperty.call(v, 'enabled') ? v.enabled : true;
      const enabled = !(enRaw === false || enRaw === 'false' || enRaw === 0);
      out[id] = { enabled };
    }
    return out;
  },

  // GET /display-flags - 获取显示端功能开关
  async get(env, request = null) {
    const raw = await env.LINES.get(this.KEY);
    if (!raw) {
      return {
        ok: true,
        config: {
          showSystemDisplayOption: true,
          // 每个显示器的独立开关（例如 display-1, display-2），默认不限制
          displays: null,
          startTime: null, // ISO 8601 格式
          endTime: null,
          allowedCountries: null,
          blockedCountries: null,
          allowedCities: null,
          blockedCities: null,
          _isDefault: true
        }
      };
    }
    try {
      const config = JSON.parse(raw);
      if (!('_isDefault' in config)) {
        config._isDefault = false;
      }
      
      // 兼容旧数据，补齐字段
      if (typeof config.showSystemDisplayOption !== 'boolean') {
        config.showSystemDisplayOption = true;
      }
      if (config.displays === undefined) config.displays = null;
      if (config.startTime === undefined) config.startTime = null;
      if (config.endTime === undefined) config.endTime = null;
      if (config.allowedCountries === undefined) config.allowedCountries = null;
      if (config.blockedCountries === undefined) config.blockedCountries = null;
      if (config.allowedCities === undefined) config.allowedCities = null;
      if (config.blockedCities === undefined) config.blockedCities = null;
      // 规范化 displays（兼容 enabled 为字符串/数字等旧数据）
      config.displays = this._normalizeDisplaysMap(config.displays);
      
      // 如果提供了请求对象，检查是否应该生效（基于时间范围和地理位置）
      if (request) {
        const country = request.cf?.country || request.headers?.get('CF-IPCountry') || null;
        const city = request.cf?.city || null;
        const clientCountry = request.headers?.get('X-Client-Country') || country;
        const clientCity = request.headers?.get('X-Client-City') || city;
        
        const timeValid = isWithinTimeRange(config.startTime, config.endTime);
        const locationValid = isLocationAllowed(
          clientCountry,
          clientCity,
          config.allowedCountries,
          config.blockedCountries,
          config.allowedCities,
          config.blockedCities
        );
        
        // 只有在时间范围和地理位置都有效时，才应用配置
        config._isEffective = timeValid && locationValid;
        config._timeValid = timeValid;
        config._locationValid = locationValid;
        
        // 如果无效，使用默认值
        if (!config._isEffective) {
          config.showSystemDisplayOption = true; // 默认显示
          // 不生效时：不应用每个显示器的独立开关，避免客户端“看似未关闭但实际被关闭”
          config.displays = null;
        }
      }
      
      return { ok: true, config };
    } catch (e) {
      console.error('[DisplayFlags] 解析配置失败:', e);
      return {
        ok: true,
        config: {
          showSystemDisplayOption: true,
          startTime: null,
          endTime: null,
          allowedCountries: null,
          blockedCountries: null,
          allowedCities: null,
          blockedCities: null,
          _isDefault: true
        }
      };
    }
  },

  // PUT /display-flags - 更新显示端功能开关
  async update(env, body) {
    if (!body || typeof body !== 'object') {
      throw { status: 400, error: '缺少配置数据' };
    }

    const config = {
      showSystemDisplayOption: body.showSystemDisplayOption !== false,
      // 每个显示器的独立开关（例如 display-1, display-2）
      displays: this._normalizeDisplaysMap(body.displays),
      startTime: typeof body.startTime === 'string' && body.startTime.trim() ? body.startTime.trim() : null,
      endTime: typeof body.endTime === 'string' && body.endTime.trim() ? body.endTime.trim() : null,
      allowedCountries: Array.isArray(body.allowedCountries) ? body.allowedCountries.filter(c => typeof c === 'string') : null,
      blockedCountries: Array.isArray(body.blockedCountries) ? body.blockedCountries.filter(c => typeof c === 'string') : null,
      allowedCities: Array.isArray(body.allowedCities) ? body.allowedCities.filter(c => typeof c === 'string') : null,
      blockedCities: Array.isArray(body.blockedCities) ? body.blockedCities.filter(c => typeof c === 'string') : null
    };

    await env.LINES.put(this.KEY, JSON.stringify(config));
    return { ok: true, config: { ...config, _isDefault: false } };
  }
};

/**
 * 新年灯笼配置 API
 */
const NewYearLanternHandler = {
  KEY: 'config:new-year-lantern',
  async get(env) {
    const raw = await env.LINES.get(this.KEY);
    if (!raw) {
      return {
        ok: true,
        config: {
          messages: [],
          enabled: false,
          _isDefault: true
        }
      };
    }
    try {
      const config = JSON.parse(raw);
      if (!('_isDefault' in config)) config._isDefault = false;
      return { ok: true, config };
    } catch (e) {
      return { ok: true, config: { messages: [], enabled: false, _isDefault: true } };
    }
  },
  async update(env, body) {
    if (!body || typeof body !== 'object') throw { status: 400, error: '缺少配置数据' };
    const config = {
      messages: Array.isArray(body.messages) ? body.messages : [],
      enabled: body.enabled === true,
      startDate: body.startDate || null,
      endDate: body.endDate || null
    };
    await env.LINES.put(this.KEY, JSON.stringify(config));
    return { ok: true, config: { ...config, _isDefault: false } };
  }
};

/**
 * 节日配置 API
 */
const HolidaysHandler = {
  KEY: 'config:holidays',
  
  // GET /holidays - 获取所有节日配置
  async get(env) {
    const raw = await env.LINES.get(this.KEY);
    if (!raw) {
      return {
        ok: true,
        config: {}
      };
    }
    try {
      const config = JSON.parse(raw);
      return { ok: true, config };
    } catch (e) {
      console.error('[Holidays] 解析配置失败:', e);
      return {
        ok: true,
        config: {}
      };
    }
  },
  
  // PUT /holidays - 更新节日配置
  async update(env, body) {
    if (!body || typeof body !== 'object') {
      throw { status: 400, error: '缺少配置数据' };
    }
    
    await env.LINES.put(this.KEY, JSON.stringify(body));
    return { ok: true, config: body };
  },
  
  // GET /holidays/active - 获取当前激活的节日（日期支持 dateStart/dateEnd yyyyMMdd；非「全部」时需与 mxnzp 当日 typeDes 一致才弹窗）
  async getActive(env) {
    const raw = await env.LINES.get(this.KEY);
    if (!raw) {
      return { ok: true, active: {} };
    }
    
    try {
      const config = JSON.parse(raw);
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, '0');
      const d = String(now.getDate()).padStart(2, '0');
      const today = `${y}${m}${d}`; // yyyyMMdd
      const currentMonth = now.getMonth() + 1;
      const currentDay = now.getDate();
      const active = {};
      
      // 获取当日 API 的 typeDes（工作日/春节/节假日等），用于与节日配置的 typeDes 一致时才弹窗
      let todayTypeDes = null;
      try {
        const singleRes = await fetchHolidaySingle(env, today);
        if (singleRes.ok && singleRes.data && singleRes.data.typeDes != null) {
          todayTypeDes = String(singleRes.data.typeDes).trim();
        }
      } catch (_) {
        // mxnzp 未配置或失败时 todayTypeDes 为 null，非「全部」的节日不弹窗
      }
      
      for (const [key, holiday] of Object.entries(config)) {
        if (!holiday || holiday.enabled !== true) {
          continue;
        }
        
        const typeDes = holiday.typeDes != null ? String(holiday.typeDes).trim() : '';
        const isTypeAll = typeDes === '全部'; // 全部：不区分节假日/工作日，仅按日期范围
        
        let isActive = false;
        
        // 优先：dateStart / dateEnd（yyyyMMdd 字符串）
        if (holiday.dateStart != null && holiday.dateEnd != null) {
          const start = String(holiday.dateStart).slice(0, 8);
          const end = String(holiday.dateEnd).slice(0, 8);
          if (start.length === 8 && end.length === 8 && today >= start && today <= end) {
            isActive = true;
          }
        } else if (holiday.dateStart != null) {
          const start = String(holiday.dateStart).slice(0, 8);
          if (start.length === 8 && today === start) {
            isActive = true;
          }
        } else if (holiday.date) {
          // 兼容：单日（月/日）
          if (holiday.date.month === currentMonth && holiday.date.day === currentDay) {
            isActive = true;
          }
        } else if (holiday.startDate && holiday.endDate) {
          const start = new Date(holiday.startDate);
          const end = new Date(holiday.endDate);
          if (now >= start && now <= end) {
            isActive = true;
          }
        } else if (holiday.duration && holiday.date) {
          const startMonth = holiday.date.month;
          const startDay = holiday.date.day;
          const endDate = new Date(now.getFullYear(), startMonth - 1, startDay);
          endDate.setDate(endDate.getDate() + holiday.duration - 1);
          const startDate = new Date(now.getFullYear(), startMonth - 1, startDay);
          if (now >= startDate && now <= endDate) {
            isActive = true;
          }
        }
        
        // typeDes 为「全部」时仅按日期范围；非全部时需 API 当日 typeDes 与节日 typeDes 一致才弹窗
        if (isTypeAll) {
          // 已按日期范围算出的 isActive 即最终结果
        } else if (isActive && typeDes) {
          if (todayTypeDes == null || todayTypeDes !== typeDes) {
            isActive = false;
          }
        }
        
        if (isActive) {
          active[key] = holiday;
        }
      }
      
      return { ok: true, active };
    } catch (e) {
      console.error('[Holidays] 获取激活节日失败:', e);
      return { ok: true, active: {} };
    }
  }
};

/**
 * 节假日/万年历 API 代理（mxnzp.com）
 * GET /holiday/single/:date - 获取指定日期的节假日及万年历信息，date 格式 yyyyMMdd
 * 需配置环境变量 MXNZP_APP_ID、MXNZP_APP_SECRET（wrangler secret put）
 */
const MXNZP_BASE = 'https://www.mxnzp.com/api/holiday/single';

async function fetchHolidaySingle(env, dateYyyyMmDd) {
  const appId = env.MXNZP_APP_ID;
  const appSecret = env.MXNZP_APP_SECRET;
  if (!appId || !appSecret) {
    return { ok: false, error: '未配置 MXNZP_APP_ID / MXNZP_APP_SECRET，请使用 wrangler secret put 配置' };
  }
  const url = `${MXNZP_BASE}/${dateYyyyMmDd}?ignoreHoliday=false&app_id=${encodeURIComponent(appId)}&app_secret=${encodeURIComponent(appSecret)}`;
  try {
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    const body = await res.json();
    if (body.code === 1 && body.data) {
      return { ok: true, code: 1, msg: body.msg, data: body.data };
    }
    return { ok: false, error: body.msg || body.message || 'mxnzp 接口返回异常', code: body.code };
  } catch (e) {
    console.error('[Mxnzp] 请求失败:', e);
    return { ok: false, error: e.message || '网络请求失败' };
  }
}

// ==================== 路由分发 ====================

/**
 * 处理请求
 */
async function handleRequest(request, env) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const method = request.method || 'GET';
  const corsHeaders = getCorsHeaders();

  // OPTIONS 预检请求
  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    // 根路径
    if (pathname === '/' && method === 'GET') {
      return json({
        ok: true,
        message: 'Metro-PIDS Cloudflare API',
        version: '2.0',
        endpoints: [
          { method: 'GET', path: '/preset', description: '' },
          { method: 'GET', path: '/preset/:lineName', description: '' },
          { method: 'POST', path: '/preset', description: '' },
          { method: 'PUT', path: '/preset/:lineName', description: '' },
          { method: 'DELETE', path: '/preset/:lineName', description: '' },
          { method: 'GET', path: '/runtime/lines', description: '' },
          { method: 'GET', path: '/runtime/lines/:lineName', description: '' },
          { method: 'GET', path: '/runtime/lines/:lineName/audio?path=audio/xx.mp3', description: '' },
          { method: 'POST', path: '/runtime/lines/:lineName/find-audio', description: '按站名动态匹配云端音频相对路径' },
          { method: 'GET', path: '/dynamic-audio/matcher-config', description: '获取动态音频匹配规则配置' },
          { method: 'PUT', path: '/dynamic-audio/matcher-config', description: '更新动态音频匹配规则配置' },
          { method: 'PUT', path: '/runtime/lines/:lineName', description: '' },
          { method: 'DELETE', path: '/runtime/lines/:lineName', description: '' },
          { method: 'GET', path: '/releases', description: '' },
          { method: 'GET', path: '/releases/latest', description: '' },
          { method: 'GET', path: '/releases/download/:tag/:file', description: '下载安装包（优先 R2，无则跳转 GitHub）' },
          { method: 'POST', path: '/releases/sync-asset', description: '将指定 release 文件从 GitHub 同步到 R2（需 Token）' },
          { method: 'POST', path: '/releases/sync-release/:tag', description: '将某版本全部附件同步到 R2（需 Token）' },
          { method: 'GET', path: '/update/latest.yml', description: 'electron-updater generic 更新清单' },
          { method: 'GET', path: '/update/:fileName', description: '更新安装包（重定向到 /releases/download）' },
          { method: 'GET', path: '/update/changelog', description: '' },
          { method: 'POST', path: '/update/changelog/sync/github', description: '' },
          { method: 'GET', path: '/update/check', description: '' },
          { method: 'POST', path: '/update/sync/github', description: '' },
          { method: 'PUT', path: '/update/info', description: '' },
          { method: 'POST', path: '/telemetry', description: '' },
          { method: 'GET', path: '/stats', description: '' },
          { method: 'GET', path: '/stats/config', description: '统计配置（排除的设备ID列表）' },
          { method: 'PUT', path: '/stats/config', description: '更新统计配置（排除的设备ID列表）' },
          { method: 'DELETE', path: '/stats/record/:id', description: '' },
          { method: 'DELETE', path: '/stats/records', description: '' },
          { method: 'GET', path: '/easter-eggs', description: '' },
          { method: 'PUT', path: '/easter-eggs', description: '' },
          { method: 'GET', path: '/startup-notice', description: '' },
          { method: 'PUT', path: '/startup-notice', description: '' },
          { method: 'GET', path: '/display-flags', description: '' },
          { method: 'PUT', path: '/display-flags', description: '' },
          { method: 'GET', path: '/new-year-lantern', description: '' },
          { method: 'PUT', path: '/new-year-lantern', description: '' },
          { method: 'GET', path: '/holidays', description: '' },
          { method: 'PUT', path: '/holidays', description: '' },
          { method: 'GET', path: '/holidays/active', description: '' },
          { method: 'GET', path: '/holiday/single/:date', description: '' },
          { method: 'GET', path: '/admin', description: '' }
        ]
      }, 200, corsHeaders);
    }

    // 管理页面
    if (pathname === '/admin' && method === 'GET') {
      const html = getAdminHtml(url.origin);
      return new Response(html, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          ...corsHeaders
        }
      });
    }

    // 预设线路 API
    if (pathname === '/preset' && method === 'GET') {
      return json(await PresetLinesHandler.list(env), 200, corsHeaders);
    }
    if (pathname === '/preset' && method === 'POST') {
      if (!checkWriteAuth(request, env)) {
        return json({ ok: false, error: 'Unauthorized' }, 401, corsHeaders);
      }
      const body = await readJson(request);
      return json(await PresetLinesHandler.create(env, body), 201, corsHeaders);
    }
    if (pathname.startsWith('/preset/')) {
      const lineName = decodeURIComponent(pathname.slice('/preset/'.length));
      if (!lineName) {
        return json({ ok: false, error: '缺少线路名称' }, 400, corsHeaders);
      }
      if (method === 'GET') {
        return json(await PresetLinesHandler.get(env, lineName), 200, corsHeaders);
      }
      if (method === 'PUT') {
        if (!checkWriteAuth(request, env)) {
          return json({ ok: false, error: 'Unauthorized' }, 401, corsHeaders);
        }
        const body = await readJson(request);
        return json(await PresetLinesHandler.update(env, lineName, body), 200, corsHeaders);
      }
      if (method === 'DELETE') {
        if (!checkWriteAuth(request, env)) {
          return json({ ok: false, error: 'Unauthorized' }, 401, corsHeaders);
        }
        return json(await PresetLinesHandler.delete(env, lineName), 200, corsHeaders);
      }
    }

    // 运控线路 API
    if (pathname === '/runtime/lines' && method === 'GET') {
      return json(await RuntimeLinesHandler.list(env), 200, corsHeaders);
    }
    if (pathname === '/runtime/lines' && method === 'PUT') {
      if (!checkWriteAuth(request, env)) {
        return json({ ok: false, error: 'Unauthorized' }, 401, corsHeaders);
      }
      const body = await readJson(request);
      const line = extractLineData(body);
      const lineName = line?.meta?.lineName;
      if (!lineName || typeof lineName !== 'string' || !lineName.trim()) {
        return json({ ok: false, error: '请求体中缺少有效线路数据（meta.lineName）' }, 400, corsHeaders);
      }
      return json(await RuntimeLinesHandler.update(env, lineName, body), 200, corsHeaders);
    }
    if (pathname === '/runtime/lines/upload-shard' && method === 'POST') {
      if (!checkWriteAuth(request, env)) {
        return json({ ok: false, error: 'Unauthorized' }, 401, corsHeaders);
      }
      const body = await readJson(request);
      const lineName = body?.lineName;
      if (!lineName || typeof lineName !== 'string' || !lineName.trim()) {
        return json({ ok: false, error: 'lineName 不能为空' }, 400, corsHeaders);
      }
      return json(await RuntimeLinesHandler.uploadShard(env, lineName, body), 200, corsHeaders);
    }
    if (pathname.startsWith('/runtime/lines/') && pathname.endsWith('/audio') && method === 'GET') {
      const lineName = decodeURIComponent(pathname.slice('/runtime/lines/'.length, -('/audio'.length)));
      const relPath = url.searchParams.get('path') || '';
      try {
        const audioRes = await RuntimeLinesHandler.getAudio(env, lineName, relPath);
        const headers = new Headers(audioRes.headers || {});
        Object.entries(corsHeaders).forEach(([k, v]) => headers.set(k, v));
        return new Response(audioRes.body, { status: audioRes.status, headers });
      } catch (e) {
        const status = (e && e.status) ? e.status : 500;
        const error = (e && e.error) ? e.error : String(e);
        return json({ ok: false, error }, status, corsHeaders);
      }
    }
    if (pathname.startsWith('/runtime/lines/') && pathname.endsWith('/find-audio') && method === 'POST') {
      const lineName = decodeURIComponent(pathname.slice('/runtime/lines/'.length, -('/find-audio'.length)));
      const body = await readJson(request);
      const stationName = body?.stationName;
      const opts = (body && typeof body === 'object') ? (body.opts || {}) : {};
      try {
        return json(await RuntimeLinesHandler.findAudioByStationName(env, lineName, stationName, opts), 200, corsHeaders);
      } catch (e) {
        const status = (e && e.status) ? e.status : 500;
        const error = (e && e.error) ? e.error : String(e);
        return json({ ok: false, error }, status, corsHeaders);
      }
    }
    if (pathname.startsWith('/runtime/lines/') && pathname.length > '/runtime/lines/'.length) {
      const lineName = decodeURIComponent(pathname.slice('/runtime/lines/'.length));
      if (method === 'GET') {
        return json(await RuntimeLinesHandler.get(env, lineName), 200, corsHeaders);
      }
      if (method === 'PUT') {
        if (!checkWriteAuth(request, env)) {
          return json({ ok: false, error: 'Unauthorized' }, 401, corsHeaders);
        }
        const body = await readJson(request);
        return json(await RuntimeLinesHandler.update(env, lineName, body), 200, corsHeaders);
      }
      if (method === 'DELETE') {
        if (!checkWriteAuth(request, env)) {
          return json({ ok: false, error: 'Unauthorized' }, 401, corsHeaders);
        }
        return json(await RuntimeLinesHandler.delete(env, lineName), 200, corsHeaders);
      }
    }

    if (pathname === '/dynamic-audio/matcher-config' && method === 'GET') {
      return json({ ok: true, config: await DynamicAudioMatcherConfigHandler.get(env) }, 200, { ...corsHeaders, 'Cache-Control': 'no-store' });
    }
    if (pathname === '/dynamic-audio/matcher-config' && method === 'PUT') {
      if (!checkWriteAuth(request, env)) {
        return json({ ok: false, error: 'Unauthorized' }, 401, corsHeaders);
      }
      const body = await readJson(request);
      const operator = request.headers.get('X-Admin-Operator') || 'admin';
      return json(await DynamicAudioMatcherConfigHandler.update(env, body, operator), 200, corsHeaders);
    }

    // GitHub Releases API
    if (pathname === '/releases' && method === 'GET') {
      try {
        const result = await ReleasesHandler.list(env);
        return json(result, 200, corsHeaders);
      } catch (error) {
        console.error('[Worker] /releases 端点错误:', error);
        console.error('[Worker] 错误类型:', typeof error, '错误对象:', JSON.stringify(error, null, 2));
        
        // 如果是 GitHub API 404 错误，返回更友好的错误信息
        if (error && typeof error === 'object' && 'status' in error && error.status === 404) {
          return json({ 
            ok: false, 
            error: error.error || 'GitHub 仓库未找到',
            detail: error.detail || '请检查仓库名称是否正确，或仓库是否为私有（需要 Token 权限）',
            repoUrl: ReleasesHandler.REPO_URL + '/releases'
          }, 200, corsHeaders); // 返回 200，但 ok: false，这样客户端可以正常解析
        }
        
        if (error && typeof error === 'object' && 'status' in error) {
          return json({ 
            ok: false, 
            error: error.error || String(error),
            ...(error.detail && { detail: error.detail })
          }, 200, corsHeaders); // 返回 200，但 ok: false
        }
        return json({ 
          ok: false, 
          error: error?.message || String(error || 'Internal Server Error')
        }, 200, corsHeaders); // 返回 200，但 ok: false
      }
    }
    if (pathname === '/releases/latest' && method === 'GET') {
      return json(await ReleasesHandler.latest(env, url.origin), 200, corsHeaders);
    }
    if (pathname.startsWith('/releases/download/') && method === 'GET') {
      const pathParts = pathname.slice('/releases/download/'.length).split('/');
      if (pathParts.length !== 2) {
        return json({ ok: false, error: '下载路径格式错误' }, 400, corsHeaders);
      }
      const tagName = decodeURIComponent(pathParts[0]);
      const fileName = decodeURIComponent(pathParts[1]);
      return await ReleasesHandler.download(env, tagName, fileName);
    }
    if (pathname === '/releases/sync-asset' && method === 'POST') {
      if (!checkWriteAuth(request, env)) {
        return json({ ok: false, error: 'Unauthorized' }, 401, corsHeaders);
      }
      try {
        const body = await readJson(request);
        const tagName = body?.tagName || body?.tag;
        const fileName = body?.fileName || body?.file;
        if (!tagName || !fileName) {
          return json({ ok: false, error: '请提供 tagName 和 fileName（或 tag / file）' }, 400, corsHeaders);
        }
        return json(await ReleasesHandler.syncAsset(env, tagName, fileName), 200, corsHeaders);
      } catch (error) {
        if (error && typeof error === 'object' && 'status' in error) {
          return json({ ok: false, error: error.error || String(error) }, error.status || 500, corsHeaders);
        }
        return json({ ok: false, error: error?.message || String(error) }, 500, corsHeaders);
      }
    }
    if (pathname.startsWith('/releases/sync-release/') && method === 'POST') {
      if (!checkWriteAuth(request, env)) {
        return json({ ok: false, error: 'Unauthorized' }, 401, corsHeaders);
      }
      const tagName = decodeURIComponent(pathname.slice('/releases/sync-release/'.length));
      if (!tagName) {
        return json({ ok: false, error: '请提供版本 tag，例如 v1.0.0' }, 400, corsHeaders);
      }
      try {
        return json(await ReleasesHandler.syncRelease(env, tagName), 200, corsHeaders);
      } catch (error) {
        if (error && typeof error === 'object' && 'status' in error) {
          return json({ ok: false, error: error.error || String(error) }, error.status || 500, corsHeaders);
        }
        return json({ ok: false, error: error?.message || String(error) }, 500, corsHeaders);
      }
    }
    if (pathname === '/releases/refresh' && method === 'POST') {
      // 手动刷新 Releases 缓存（需要 Token 认证）
      if (!checkWriteAuth(request, env)) {
        return json({ ok: false, error: 'Unauthorized' }, 401, corsHeaders);
      }
      try {
        // 强制从 GitHub 获取并更新缓存
        const recentReleases = await ReleasesHandler.fetchFromGitHub(env);
        const cacheData = {
          releases: recentReleases,
          timestamp: Date.now()
        };
        await env.LINES.put(ReleasesHandler.CACHE_KEY, JSON.stringify(cacheData));
        console.log('[Releases] ✅ 手动刷新缓存成功，数量:', recentReleases.length);
        return json({ ok: true, message: '缓存已刷新', count: recentReleases.length }, 200, corsHeaders);
      } catch (error) {
        console.error('[Releases] ❌ 手动刷新缓存失败:', error);
        if (error && typeof error === 'object' && 'status' in error) {
          return json({ 
            ok: false, 
            error: error.error || String(error),
            ...(error.detail && { detail: error.detail })
          }, 200, corsHeaders);
        }
        return json({ ok: false, error: error?.message || String(error) }, 200, corsHeaders);
      }
    }

    // 更新日志 API（必须在 /update/:fileName 通配之前精确匹配）
    if (pathname === '/update/changelog' && method === 'GET') {
      return json(await ChangelogHandler.get(env, request), 200, corsHeaders);
    }
    if (pathname === '/update/changelog' && method === 'PUT') {
      try {
        const body = await readJson(request);
        return json(await ChangelogHandler.put(env, body), 200, corsHeaders);
      } catch (error) {
        console.error('[Worker] /update/changelog PUT 端点错误:', error);
        if (error && typeof error === 'object' && 'status' in error) {
          return json({ 
            ok: false, 
            error: error.error || String(error)
          }, error.status || 500, corsHeaders);
        }
        return json({ 
          ok: false, 
          error: error?.message || String(error || 'Internal Server Error')
        }, 500, corsHeaders);
      }
    }
    if (pathname === '/update/changelog/sync/github' && method === 'POST') {
      return json(await ChangelogHandler.sync(env), 200, corsHeaders);
    }

    // 版本更新信息 API
    if (pathname === '/update/check' && method === 'GET') {
      try {
        return json(await UpdateInfoHandler.check(env, request), 200, corsHeaders);
      } catch (error) {
        console.error('[Worker] /update/check 端点错误:', error);
        if (error && typeof error === 'object' && 'status' in error) {
          return json({ 
            ok: false, 
            error: error.error || String(error),
            ...(error.detail && { detail: error.detail })
          }, error.status || 500, corsHeaders);
        }
        return json({ 
          ok: false, 
          error: error?.message || String(error || 'Internal Server Error')
        }, 500, corsHeaders);
      }
    }
    if (pathname === '/update/sync/github' && method === 'POST') {
      try {
        return json(await UpdateInfoHandler.syncFromGitHub(env, request), 200, corsHeaders);
      } catch (error) {
        console.error('[Worker] /update/sync/github 端点错误:', error);
        if (error && typeof error === 'object' && 'status' in error) {
          return json({ 
            ok: false, 
            error: error.error || String(error),
            ...(error.detail && { detail: error.detail })
          }, error.status || 500, corsHeaders);
        }
        return json({ 
          ok: false, 
          error: error?.message || String(error || 'Internal Server Error')
        }, 500, corsHeaders);
      }
    }
    if (pathname === '/update/info' && method === 'PUT') {
      if (!checkWriteAuth(request, env)) {
        return json({ ok: false, error: 'Unauthorized' }, 401, corsHeaders);
      }
      try {
        const body = await readJson(request);
        return json(await UpdateInfoHandler.update(env, request, body), 200, corsHeaders);
      } catch (error) {
        console.error('[Worker] /update/info 端点错误:', error);
        if (error && typeof error === 'object' && 'status' in error) {
          return json({ 
            ok: false, 
            error: error.error || String(error),
            ...(error.detail && { detail: error.detail })
          }, error.status || 500, corsHeaders);
        }
        return json({ 
          ok: false, 
          error: error?.message || String(error || 'Internal Server Error')
        }, 500, corsHeaders);
      }
    }

    // electron-updater generic 更新源（须在 /update/changelog、/update/check 等之后，仅匹配 latest.yml 与安装包文件名）
    if (pathname === '/update/latest.yml' && method === 'GET') {
      try {
        return await UpdateFeedHandler.getLatestYml(env);
      } catch (error) {
        if (error && typeof error === 'object' && 'status' in error) {
          return json({ ok: false, error: error.error || String(error) }, error.status || 502, corsHeaders);
        }
        return json({ ok: false, error: error?.message || String(error) }, 502, corsHeaders);
      }
    }
    if (pathname.startsWith('/update/') && method === 'GET') {
      const fileName = decodeURIComponent(pathname.slice('/update/'.length));
      if (fileName) {
        try {
          return await UpdateFeedHandler.handleFileRequest(env, fileName, url.origin);
        } catch (error) {
          if (error && typeof error === 'object' && 'status' in error) {
            return json({ ok: false, error: error.error || String(error) }, error.status || 400, corsHeaders);
          }
          return json({ ok: false, error: error?.message || String(error) }, 400, corsHeaders);
        }
      }
    }

    // 统计信息 API
    if (pathname === '/telemetry' && method === 'POST') {
      try {
        const body = await readJson(request);
        console.log('[Worker] 📊 收到统计上报请求');
        console.log('[Worker] 请求体:', {
          deviceId: body.deviceId ? body.deviceId.substring(0, 8) + '...' : 'missing',
          version: body.version || 'missing',
          platform: body.platform || 'missing',
          osVersion: body.osVersion || 'none'
        });
        
        if (!body.deviceId) {
          console.error('[Worker] ❌ 缺少 deviceId');
          return json({ ok: false, error: '缺少 deviceId' }, 400, corsHeaders);
        }
        
        const result = await TelemetryHandler.record(env, request, body);
        console.log('[Worker] ✅ 统计上报成功，记录ID:', result.id);
        return json(result, 200, corsHeaders);
      } catch (error) {
        console.error('[Worker] ❌ 统计上报失败:', error);
        if (error && typeof error === 'object' && 'status' in error) {
          return json({ ok: false, error: error.error || String(error) }, error.status || 500, corsHeaders);
        }
        return json({ ok: false, error: error?.message || String(error || 'Internal Server Error') }, 500, corsHeaders);
      }
    }
    if (pathname === '/stats' && method === 'GET') {
      try {
        const result = await TelemetryHandler.stats(env);
        return json(result, 200, corsHeaders);
      } catch (error) {
        console.error('[Worker] 获取统计信息失败:', error);
        // 即使失败也返回空数据，避免前端报错
        return json({
          total: 0,
          uniqueDevices: 0,
          byCountry: {},
          byVersion: {},
          byOS: {},
          byDevice: {},
          records: [],
          all: [],
          recent: []
        }, 200, corsHeaders);
      }
    }
    if (pathname === '/stats/config' && method === 'GET') {
      if (!checkWriteAuth(request, env)) {
        return json({ ok: false, error: 'Unauthorized' }, 401, corsHeaders);
      }
      return json(await StatsConfigHandler.get(env), 200, corsHeaders);
    }
    if (pathname.startsWith('/stats/record/') && method === 'DELETE') {
      const recordId = pathname.slice('/stats/record/'.length);
      if (!recordId) {
        return json({ ok: false, error: '缺少记录ID' }, 400, corsHeaders);
      }
      return json(await TelemetryHandler.deleteRecord(env, recordId), 200, corsHeaders);
    }
    if (pathname === '/stats/records' && method === 'DELETE') {
      if (!checkWriteAuth(request, env)) {
        return json({ ok: false, error: 'Unauthorized' }, 401, corsHeaders);
      }
      const body = await readJson(request);
      return json(await TelemetryHandler.deleteRecords(env, body), 200, corsHeaders);
    }
    if (pathname === '/stats/config' && method === 'PUT') {
      if (!checkWriteAuth(request, env)) {
        return json({ ok: false, error: 'Unauthorized' }, 401, corsHeaders);
      }
      const body = await readJson(request);
      return json(await StatsConfigHandler.update(env, body), 200, corsHeaders);
    }

    // 彩蛋配置 API
    if (pathname === '/easter-eggs' && method === 'GET') {
      return json(await EasterEggsHandler.get(env), 200, corsHeaders);
    }
    if (pathname === '/easter-eggs' && method === 'PUT') {
      if (!checkWriteAuth(request, env)) {
        return json({ ok: false, error: 'Unauthorized' }, 401, corsHeaders);
      }
      const body = await readJson(request);
      return json(await EasterEggsHandler.update(env, body), 200, corsHeaders);
    }

    // 启动公告 API（GET 禁止缓存，避免保存后再次加载拿到旧数据）
    if (pathname === '/startup-notice' && method === 'GET') {
      const result = await StartupNoticeHandler.get(env, request);
      return json(result, 200, { ...corsHeaders, 'Cache-Control': 'no-store' });
    }
    if (pathname === '/startup-notice' && method === 'PUT') {
      if (!checkWriteAuth(request, env)) {
        return json({ ok: false, error: 'Unauthorized' }, 401, corsHeaders);
      }
      const body = await readJson(request);
      return json(await StartupNoticeHandler.update(env, body), 200, corsHeaders);
    }

    // 显示端功能开关 API
    if (pathname === '/display-flags' && method === 'GET') {
      const result = await DisplayFlagsHandler.get(env, request);
      return json(result, 200, { ...corsHeaders, 'Cache-Control': 'no-store' });
    }
    if (pathname === '/display-flags' && method === 'PUT') {
      if (!checkWriteAuth(request, env)) {
        return json({ ok: false, error: 'Unauthorized' }, 401, corsHeaders);
      }
      const body = await readJson(request);
      return json(await DisplayFlagsHandler.update(env, body), 200, corsHeaders);
    }

    // 新年灯笼配置 API
    if (pathname === '/new-year-lantern' && method === 'GET') {
      return json(await NewYearLanternHandler.get(env), 200, corsHeaders);
    }
    if (pathname === '/new-year-lantern' && method === 'PUT') {
      if (!checkWriteAuth(request, env)) {
        return json({ ok: false, error: 'Unauthorized' }, 401, corsHeaders);
      }
      const body = await readJson(request);
      return json(await NewYearLanternHandler.update(env, body), 200, corsHeaders);
    }

    // 节日配置 API
    if (pathname === '/holidays' && method === 'GET') {
      return json(await HolidaysHandler.get(env), 200, corsHeaders);
    }
    if (pathname === '/holidays' && method === 'PUT') {
      if (!checkWriteAuth(request, env)) {
        return json({ ok: false, error: 'Unauthorized' }, 401, corsHeaders);
      }
      const body = await readJson(request);
      return json(await HolidaysHandler.update(env, body), 200, corsHeaders);
    }
    if (pathname === '/holidays/active' && method === 'GET') {
      return json(await HolidaysHandler.getActive(env), 200, corsHeaders);
    }
    if (pathname.startsWith('/holiday/single/') && method === 'GET') {
      const datePart = pathname.slice('/holiday/single/'.length).replace(/\/.*$/, '');
      if (/^\d{8}$/.test(datePart)) {
        const result = await fetchHolidaySingle(env, datePart);
        return json(result, result.ok ? 200 : 502, corsHeaders);
      }
      return json({ ok: false, error: '日期格式应为 yyyyMMdd，例如 20181121' }, 400, corsHeaders);
    }

    // 迁移 KV telemetry 到 D1（需 Bearer Token 认证，支持分批 cursor）
    if (pathname === '/admin/migrate-telemetry-kv-to-d1' && method === 'POST') {
      if (!checkWriteAuth(request, env)) {
        return json({ ok: false, error: 'Unauthorized' }, 401, corsHeaders);
      }
      try {
        let cursor = null;
        try {
          const body = await readJson(request);
          cursor = body && body.cursor ? String(body.cursor) : null;
        } catch {}
        const result = await migrateTelemetryKvToD1(env, cursor);
        return json(result, 200, corsHeaders);
      } catch (e) {
        console.error('[Worker] migrate-telemetry-kv-to-d1 失败:', e);
        return json({ ok: false, error: e?.message || String(e) }, 500, corsHeaders);
      }
    }

    // 404
    return json({ ok: false, error: 'Not Found' }, 404, corsHeaders);

  } catch (error) {
    // 统一错误处理
    console.error('[Worker] 错误:', error);
    
    if (error && typeof error === 'object' && 'status' in error) {
      return json({ 
        ok: false, 
        error: error.error || String(error),
        ...(error.detail && { detail: error.detail })
      }, error.status || 500, corsHeaders);
    }
    
    return json({ 
      ok: false, 
      error: error?.message || String(error || 'Internal Server Error')
    }, 500, corsHeaders);
  }
}

// ==================== 主入口 ====================

export default {
  async fetch(request, env, ctx) {
    const corsHeaders = getCorsHeaders();
    
    try {
      return await handleRequest(request, env);
    } catch (error) {
      console.error('[Worker] 未捕获的异常:', error);
      return json({
        ok: false,
        error: 'Internal Server Error: ' + (error?.message || String(error))
      }, 500, corsHeaders);
    }
  },
  
  // Cron Trigger: 定期刷新 Releases 缓存
  async scheduled(event, env, ctx) {
    console.log('[Worker] ⏰ Cron Trigger 触发，开始刷新 Releases 缓存...');
    try {
      const recentReleases = await ReleasesHandler.fetchFromGitHub(env);
      const cacheData = {
        releases: recentReleases,
        timestamp: Date.now()
      };
      await env.LINES.put(ReleasesHandler.CACHE_KEY, JSON.stringify(cacheData));
      console.log('[Worker] ✅ Cron Trigger 刷新缓存成功，数量:', recentReleases.length);
    } catch (error) {
      console.error('[Worker] ❌ Cron Trigger 刷新缓存失败:', error);
      // 不抛出错误，避免影响其他 scheduled 任务
    }
  }
};

// ==================== 管理页面 HTML ====================

function getAdminHtml(origin) {
  const apiBase = origin || '';
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <title>Metro-PIDS Cloudflare 运控管理</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    *{box-sizing:border-box}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f5f5f5;margin:0;padding:16px;color:#333}
    .container{max-width:980px;margin:0 auto}
    h1{font-size:22px;margin:0 0 6px}
    p.desc{margin:0 0 12px;color:#666;font-size:13px}
    .card{background:#fff;border-radius:10px;padding:16px 18px;margin-bottom:14px;box-shadow:0 2px 8px rgba(0,0,0,.06)}
    .field{margin-bottom:10px}
    .field label{display:block;font-size:13px;color:#666;margin-bottom:4px}
    .field input,.field textarea{width:100%;padding:7px 9px;border-radius:6px;border:1px solid #d9d9d9;font-size:13px}
    .field textarea{min-height:150px;font-family:Consolas,Menlo,monospace;resize:vertical}
    .btn{display:inline-block;padding:7px 13px;border-radius:6px;border:none;cursor:pointer;font-size:13px;margin-right:6px;margin-bottom:6px;color:#fff;background:#1677ff}
    .btn.secondary{background:#d9d9d9;color:#333}
    .btn.danger{background:#ff4d4f}
    .status{font-size:12px;color:#666;margin-left:6px}
    .status.ok{color:#52c41a}
    .status.err{color:#ff4d4f}
    pre{background:#1e1e1e;color:#d4d4d4;padding:10px;border-radius:6px;font-family:Consolas,Menlo,monospace;font-size:12px;max-height:260px;overflow:auto;white-space:pre}
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <h1>Metro-PIDS Cloudflare 运控管理</h1>
      <p class="desc">
        当前 API 地址：<code id="api-base-text">${apiBase}</code><br/>
        此页面运行在 Cloudflare Worker 上，只用于你自己管理预设线路。写操作可通过 Token 保护（CLOUD_TOKEN）。
      </p>
    </div>

    <div class="card">
      <h2 style="font-size:18px;margin:0 0 10px">登录与基础配置</h2>
      <div class="field">
        <label for="login-username">登录用户名（默认：admin）</label>
        <input id="login-username" type="text" placeholder="默认：admin" />
      </div>
      <div class="field">
        <label for="login-password">登录密码（默认：password）</label>
        <input id="login-password" type="password" placeholder="默认：password" />
      </div>
      <button class="btn secondary" id="btn-login">登录</button>
      <span class="status" id="login-status"></span>
      <hr style="margin:14px 0;border:none;border-top:1px solid #eee" />
      <div class="field">
        <label for="api-token">写操作 Token（可选，仅你自己知道）</label>
        <input id="api-token" type="password" placeholder="与 CLOUD_TOKEN 一致时才允许写入" />
      </div>
      <button class="btn secondary" id="btn-save-conf">保存到浏览器</button>
      <span class="status" id="conf-status"></span>
      <hr style="margin:14px 0;border:none;border-top:1px solid #eee" />
      <div class="field">
        <label for="old-password">修改登录密码（当前登录用户）</label>
        <input id="old-password" type="password" placeholder="当前密码" />
      </div>
      <div class="field">
        <input id="new-password" type="password" placeholder="新密码" />
      </div>
      <div class="field">
        <input id="new-password2" type="password" placeholder="重复新密码" />
      </div>
      <button class="btn secondary" id="btn-change-pwd">修改密码（仅保存在浏览器）</button>
    </div>

    <div class="card">
      <h2 style="font-size:18px;margin:0 0 10px">线路列表</h2>
      <button class="btn" id="btn-list">列出所有线路 (GET /preset)</button>
      <div class="field" style="margin-top:8px">
        <label>结果</label>
        <pre id="list-output">尚未请求。</pre>
      </div>
    </div>

    <div class="card">
      <h2 style="font-size:18px;margin:0 0 10px">使用统计迁移</h2>
      <p class="desc">将 KV 中的 telemetry 历史数据迁移到 D1，需先填写上方 Token。</p>
      <button class="btn" id="btn-migrate-kv-d1">从 KV 迁移到 D1</button>
      <span class="status" id="migrate-status"></span>
    </div>

    <div class="card">
      <h2 style="font-size:18px;margin:0 0 10px">单条线路操作</h2>
      <div class="field">
        <label for="line-name">线路名称 (meta.lineName)</label>
        <input id="line-name" type="text" placeholder="例如：上海地铁2号线" />
      </div>
      <div style="margin-bottom:8px">
        <button class="btn secondary" id="btn-get">读取 (GET /preset/:lineName)</button>
        <button class="btn" id="btn-put">上传/更新 (PUT /preset/:lineName)</button>
        <button class="btn danger" id="btn-del">删除 (DELETE /preset/:lineName)</button>
        <span class="status" id="line-status"></span>
      </div>
      <div class="field">
        <label for="line-json">线路 JSON 内容</label>
        <textarea id="line-json" placeholder='{"meta": {"lineName": "示例线路"}, "stations": [...]}'></textarea>
      </div>
    </div>
  </div>

  <script>
    const STORAGE_KEY = 'metro_pids_cf_worker_admin_conf';
    const AUTH_KEY = 'metro_pids_cf_worker_admin_auth';
    const apiBase = '${apiBase}';

    function loadConf() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
      } catch { return null; }
    }
    function saveConf(conf) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(conf));
    }
    function getToken() {
      return document.getElementById('api-token').value.trim();
    }
    function showStatus(id, msg, ok) {
      const el = document.getElementById(id);
      el.textContent = msg || '';
      el.className = 'status ' + (ok ? 'ok' : 'err');
    }
    function headers(body) {
      const h = { 'Accept': 'application/json' };
      if (body) h['Content-Type'] = 'application/json';
      const token = getToken();
      if (token) h['Authorization'] = 'Bearer ' + token;
      return h;
    }
    async function callApi(method, path, body) {
      const url = apiBase.replace(/\\/+$/, '') + path;
      const res = await fetch(url, {
        method,
        headers: headers(!!body),
        body: body ? JSON.stringify(body) : undefined
      });
      const text = await res.text();
      let data;
      try { data = text ? JSON.parse(text) : null; } catch { data = text; }
      if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + text);
      return data;
    }
    function loadAuth() {
      try {
        const raw = localStorage.getItem(AUTH_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
      } catch { return null; }
    }
    function saveAuth(auth) {
      localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
    }
    function ensureDefaultAuth() {
      let auth = loadAuth();
      if (!auth || !auth.username || !auth.password) {
        auth = { username: 'admin', password: 'password' };
        saveAuth(auth);
      }
      return auth;
    }
    let isAuthed = false;
    function handleLogin() {
      const auth = ensureDefaultAuth();
      const u = document.getElementById('login-username').value.trim() || 'admin';
      const p = document.getElementById('login-password').value;
      if (u === auth.username && p === auth.password) {
        isAuthed = true;
        showStatus('login-status', '登录成功', true);
      } else {
        isAuthed = false;
        showStatus('login-status', '用户名或密码错误（默认：admin / password）', false);
      }
    }
    function handleChangePassword() {
      if (!isAuthed) {
        showStatus('login-status', '请先登录后再修改密码', false);
        return;
      }
      const auth = ensureDefaultAuth();
      const oldPwd = document.getElementById('old-password').value;
      const newPwd = document.getElementById('new-password').value;
      const newPwd2 = document.getElementById('new-password2').value;
      if (!oldPwd || !newPwd || !newPwd2) {
        showStatus('login-status', '请完整填写旧密码和两次新密码', false);
        return;
      }
      if (oldPwd !== auth.password) {
        showStatus('login-status', '旧密码不正确', false);
        return;
      }
      if (newPwd !== newPwd2) {
        showStatus('login-status', '两次新密码不一致', false);
        return;
      }
      const updated = { username: auth.username, password: newPwd };
      saveAuth(updated);
      showStatus('login-status', '密码已更新（仅保存在当前浏览器）', true);
      document.getElementById('old-password').value = '';
      document.getElementById('new-password').value = '';
      document.getElementById('new-password2').value = '';
      document.getElementById('login-password').value = '';
    }
    window.addEventListener('DOMContentLoaded', () => {
      const conf = loadConf();
      if (conf && conf.token) {
        document.getElementById('api-token').value = conf.token;
      }
      const auth = ensureDefaultAuth();
      document.getElementById('login-username').placeholder = '默认：' + auth.username;
      document.getElementById('login-password').placeholder = '默认：' + auth.password;

      document.getElementById('btn-login').addEventListener('click', handleLogin);
      document.getElementById('btn-save-conf').addEventListener('click', () => {
        const token = getToken();
        saveConf({ token });
        showStatus('conf-status', '已保存到本地浏览器', true);
      });
      document.getElementById('btn-change-pwd').addEventListener('click', handleChangePassword);
      document.getElementById('btn-migrate-kv-d1').addEventListener('click', async () => {
        if (!getToken()) {
          showStatus('migrate-status', '请先填写 Token（与 CLOUD_TOKEN 一致）', false);
          return;
        }
        let totalMigrated = 0, totalSkipped = 0, totalErrors = 0, batchNum = 0, cursor = null;
        try {
          do {
            batchNum++;
            showStatus('migrate-status', '第 ' + batchNum + ' 批迁移中...', true);
            const body = cursor ? { cursor } : {};
            const data = await callApi('POST', '/admin/migrate-telemetry-kv-to-d1', body);
            if (!data.ok) {
              showStatus('migrate-status', '失败：' + (data.error || ''), false);
              return;
            }
            totalMigrated += data.migrated || 0;
            totalSkipped += data.skipped || 0;
            totalErrors += data.errors || 0;
            cursor = data.hasMore && data.nextCursor ? data.nextCursor : null;
          } while (cursor);
          showStatus('migrate-status', '完成：成功 ' + totalMigrated + '，跳过 ' + totalSkipped + '，失败 ' + totalErrors, true);
        } catch (e) {
          showStatus('migrate-status', '失败：' + e.message, false);
        }
      });
      document.getElementById('btn-list').addEventListener('click', async () => {
        const out = document.getElementById('list-output');
        out.textContent = '请求中...';
        try {
          const data = await callApi('GET', '/preset');
          out.textContent = JSON.stringify(data, null, 2);
          showStatus('conf-status', '请求成功', true);
        } catch (e) {
          out.textContent = '请求失败：' + e.message;
          showStatus('conf-status', '请求失败', false);
        }
      });
      document.getElementById('btn-get').addEventListener('click', async () => {
        const name = document.getElementById('line-name').value.trim();
        if (!name) { showStatus('line-status', '请先填写线路名称', false); return; }
        showStatus('line-status', '读取中...', true);
        try {
          const data = await callApi('GET', '/preset/' + encodeURIComponent(name));
          document.getElementById('line-json').value = JSON.stringify(data.line || data, null, 2);
          showStatus('line-status', '读取成功', true);
        } catch (e) {
          showStatus('line-status', '读取失败：' + e.message, false);
        }
      });
      document.getElementById('btn-put').addEventListener('click', async () => {
        const name = document.getElementById('line-name').value.trim();
        const text = document.getElementById('line-json').value.trim();
        if (!name) { showStatus('line-status', '请先填写线路名称', false); return; }
        if (!text) { showStatus('line-status', '请先填写线路 JSON', false); return; }
        if (!isAuthed) { showStatus('line-status', '请先登录（默认：admin / password）', false); return; }
        showStatus('line-status', '上传中...', true);
        try {
          const json = JSON.parse(text);
          if (!json.meta) json.meta = {};
          json.meta.lineName = name;
          const data = await callApi('PUT', '/preset/' + encodeURIComponent(name), json);
          document.getElementById('line-json').value = JSON.stringify(data.line || json, null, 2);
          showStatus('line-status', '上传/更新成功', true);
        } catch (e) {
          showStatus('line-status', '上传失败：' + e.message, false);
        }
      });
      document.getElementById('btn-del').addEventListener('click', async () => {
        const name = document.getElementById('line-name').value.trim();
        if (!name) { showStatus('line-status', '请先填写线路名称', false); return; }
        if (!isAuthed) { showStatus('line-status', '请先登录（默认：admin / password）', false); return; }
        if (!confirm('确定要删除 "' + name + '" 吗？')) return;
        showStatus('line-status', '删除中...', true);
        try {
          await callApi('DELETE', '/preset/' + encodeURIComponent(name));
          showStatus('line-status', '删除成功', true);
        } catch (e) {
          showStatus('line-status', '删除失败：' + e.message, false);
        }
      });
    });
  </script>
</body>
</html>`;
}
