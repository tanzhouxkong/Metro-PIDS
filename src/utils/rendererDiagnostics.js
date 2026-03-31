const MAX_ENTRIES = 500;
const entries = [];
let installed = false;

function safeStringify(value) {
  try {
    if (typeof value === 'string') return value;
    return JSON.stringify(value);
  } catch (e) {
    try { return String(value); } catch (e2) { return '[unserializable]'; }
  }
}

function nowIso() {
  try { return new Date().toISOString(); } catch (e) { return String(Date.now()); }
}

export function appendDiagnosticLog(level, message, extra) {
  const line = {
    time: nowIso(),
    level: String(level || 'info'),
    message: String(message || ''),
    extra: extra == null ? '' : safeStringify(extra)
  };
  entries.push(line);
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
}

function patchConsoleMethod(name) {
  const original = console[name];
  if (typeof original !== 'function') return;
  console[name] = function patchedConsoleMethod(...args) {
    try {
      const msg = args.map((x) => safeStringify(x)).join(' ');
      appendDiagnosticLog(name, msg);
    } catch (e) {}
    return original.apply(this, args);
  };
}

export function installRendererDiagnostics() {
  if (installed) return;
  installed = true;

  patchConsoleMethod('log');
  patchConsoleMethod('warn');
  patchConsoleMethod('error');

  if (typeof window !== 'undefined') {
    window.addEventListener('error', (event) => {
      try {
        appendDiagnosticLog('window.error', String(event && event.message ? event.message : ''), {
          filename: event && event.filename,
          lineno: event && event.lineno,
          colno: event && event.colno,
          stack: event && event.error && event.error.stack ? String(event.error.stack) : ''
        });
      } catch (e) {}
    });

    window.addEventListener('unhandledrejection', (event) => {
      try {
        const reason = event && event.reason;
        appendDiagnosticLog('unhandledrejection', reason && reason.message ? reason.message : String(reason || ''), {
          stack: reason && reason.stack ? String(reason.stack) : ''
        });
      } catch (e) {}
    });
  }
}

export function getRendererDiagnosticsSnapshot() {
  const header = [];
  header.push(`time=${nowIso()}`);
  try { header.push(`url=${typeof location !== 'undefined' ? location.href : ''}`); } catch (e) {}
  try { header.push(`ua=${typeof navigator !== 'undefined' ? navigator.userAgent : ''}`); } catch (e) {}
  try {
    if (typeof window !== 'undefined' && window.electronAPI && typeof window.electronAPI.getAppVersion === 'function') {
      // async info is appended by caller; snapshot keeps sync output only
    }
  } catch (e) {}

  const lines = entries.map((x) => {
    const extra = x.extra ? ` | ${x.extra}` : '';
    return `[${x.time}] [${x.level}] ${x.message}${extra}`;
  });

  return `${header.join('\n')}\n---\n${lines.join('\n')}`;
}

