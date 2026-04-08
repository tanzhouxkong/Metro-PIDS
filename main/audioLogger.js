const fs = require('fs');
const path = require('path');

const AUDIO_LOG_BASENAME = 'renderer-audio';

function ensureString(value, maxLen = 0) {
  let out = '';
  if (typeof value === 'string') {
    out = value;
  } else if (value == null) {
    out = '';
  } else {
    try {
      out = JSON.stringify(value);
    } catch (e) {
      out = String(value);
    }
  }
  if (maxLen > 0 && out.length > maxLen) return `${out.slice(0, maxLen)}...(truncated)`;
  return out;
}

function sanitizePayload(payload) {
  const src = (payload && typeof payload === 'object') ? payload : {};
  return {
    level: String(src.level || 'info').toLowerCase(),
    message: ensureString(src.message, 6000),
    extra: ensureString(src.extra, 12000)
  };
}

function pad2(value) {
  const n = Number(value) || 0;
  return n < 10 ? `0${n}` : String(n);
}

function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  return `${year}-${month}-${day}`;
}

function buildAudioLogFilename(date = new Date()) {
  return `${AUDIO_LOG_BASENAME}-${getLocalDateKey(date)}.log`;
}

function createAudioLogger(options = {}) {
  const getLogDir = typeof options.getLogDir === 'function' ? options.getLogDir : (() => process.cwd());
  const getPointerPaths = typeof options.getPointerPaths === 'function' ? options.getPointerPaths : (() => []);
  let lastPointerLogPath = '';

  const getLogPath = (date = new Date()) => path.join(getLogDir(), buildAudioLogFilename(date));

  const writePointerFiles = (logPath = getLogPath()) => {
    try {
      const content = `${new Date().toISOString()}\n${logPath}\n`;
      for (const pointerPath of getPointerPaths()) {
        try {
          fs.mkdirSync(path.dirname(pointerPath), { recursive: true });
          fs.writeFileSync(pointerPath, content, 'utf8');
        } catch (e) {}
      }
      lastPointerLogPath = logPath;
    } catch (e) {}
  };

  const append = (payload) => {
    const safe = sanitizePayload(payload);
    if (!safe.message) return safe;
    try {
      const logPath = getLogPath();
      if (lastPointerLogPath !== logPath) writePointerFiles(logPath);
      const line = `[${new Date().toISOString()}] [${String(safe.level || 'info').toUpperCase()}] ${safe.message}${safe.extra ? ` | ${safe.extra}` : ''}\n`;
      fs.mkdirSync(path.dirname(logPath), { recursive: true });
      fs.appendFileSync(logPath, line, 'utf8');
    } catch (e) {}
    return safe;
  };

  return {
    append,
    getLogPath,
    writePointerFiles
  };
}

module.exports = {
  AUDIO_LOG_BASENAME,
  buildAudioLogFilename,
  getLocalDateKey,
  createAudioLogger
};
