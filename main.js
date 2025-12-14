const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const fsPromises = fs.promises;
const { shell } = require('electron');

let mainWin = null;
let displayWin = null;

function createWindow() {
  mainWin = new BrowserWindow({
    width: 1280,
    height: 800,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  const controlPath = `file://${path.join(__dirname, 'index.html')}`;
  mainWin.loadURL(controlPath);

  // Make main window frameless so we can fully replace system controls
  // Note: frameless windows require a draggable region in the renderer (CSS -webkit-app-region: drag)
  // We set it here by recreating BrowserWindow with frame:false
  // (If mainWin was already created above, this new option is effective only on creation.)

  // Intercept window.open from renderer to create a controlled BrowserWindow
  mainWin.webContents.setWindowOpenHandler(({ url, features, disposition }) => {
    try {
      const u = url.toString();
      if (u.endsWith('display_window.html') || u.includes('display_window.html')) {
        createDisplayWindow();
        return { action: 'deny' };
      }
    } catch (e) {
      // ignore
    }
    return { action: 'allow' };
  });

  // Expose IPC to open display window from renderer
  ipcMain.handle('open-display', () => {
    createDisplayWindow();
    return true;
  });

  // Broadcast maximize/unmaximize events so renderer can update UI
  mainWin.on('maximize', () => {
    try { mainWin.webContents.send('window/maxstate', true); } catch (e) {}
  });
  mainWin.on('unmaximize', () => {
    try { mainWin.webContents.send('window/maxstate', false); } catch (e) {}
  });

  // Send initial maximize state after window is ready
  mainWin.once('ready-to-show', () => {
    try { mainWin.webContents.send('window/maxstate', mainWin.isMaximized()); } catch (e) {}
  });

// Helper: default lines directory under userData
function getLinesDir(dir) {
  if (dir && typeof dir === 'string' && dir.length > 0) return dir;
  return path.join(app.getPath('userData'), 'lines');
}

async function ensureDir(dir) {
  try {
    await fsPromises.mkdir(dir, { recursive: true });
  } catch (e) {
    // ignore
  }
}

// List line files (JSON). Returns array of { name, version, mtime }
ipcMain.handle('lines/list', async (event, dir) => {
  const base = getLinesDir(dir);
  await ensureDir(base);
  try {
    const files = await fsPromises.readdir(base);
    const out = [];
    for (const f of files) {
      if (!f.toLowerCase().endsWith('.json')) continue;
      try {
        const fp = path.join(base, f);
        const stat = await fsPromises.stat(fp);
        const txt = await fsPromises.readFile(fp, 'utf8');
        let json = null;
        try { json = JSON.parse(txt); } catch (e) { json = null; }
        const version = json && json.meta && json.meta.version ? json.meta.version : null;
        out.push({ name: path.basename(f, '.json'), version, mtime: stat.mtimeMs });
      } catch (e) {
        // skip file on error
      }
    }
    return out;
  } catch (err) {
    return { error: String(err) };
  }
});

// Read a single line file
ipcMain.handle('lines/read', async (event, filename, dir) => {
  const base = getLinesDir(dir);
  const name = filename.endsWith('.json') ? filename : `${filename}.json`;
  const fp = path.join(base, name);
  try {
    const txt = await fsPromises.readFile(fp, 'utf8');
    return { ok: true, content: JSON.parse(txt) };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// Save a line file with simple version handling
ipcMain.handle('lines/save', async (event, filename, contentObj, dir) => {
  const base = getLinesDir(dir);
  await ensureDir(base);
  const name = filename.endsWith('.json') ? filename : `${filename}.json`;
  const fp = path.join(base, name);
  try {
    let existing = null;
    try {
      const t = await fsPromises.readFile(fp, 'utf8');
      existing = JSON.parse(t);
    } catch (e) {
      existing = null;
    }
    const existingVer = existing && existing.meta && existing.meta.version ? existing.meta.version : 0;
    if (!contentObj.meta) contentObj.meta = {};
    const incomingVer = contentObj.meta.version ? contentObj.meta.version : 0;
    if (incomingVer <= existingVer) {
      contentObj.meta.version = existingVer + 1; // bump
    }
    // Write file
    await fsPromises.writeFile(fp, JSON.stringify(contentObj, null, 2), 'utf8');
    return { ok: true, path: fp };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// Delete a line file
ipcMain.handle('lines/delete', async (event, filename, dir) => {
  const base = getLinesDir(dir);
  const name = filename.endsWith('.json') ? filename : `${filename}.json`;
  const fp = path.join(base, name);
  try {
    await fsPromises.unlink(fp);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// Open lines folder in OS file manager
ipcMain.handle('lines/openFolder', async (event, dir) => {
  const base = getLinesDir(dir);
  try {
    await ensureDir(base);
    const r = await shell.openPath(base);
    if (r && r.length) return { ok: false, error: r };
    return { ok: true, path: base };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

  mainWin.on('closed', () => {
    mainWin = null;
  });
}

// Window control handlers for renderer to call (minimize, maximize/restore, close)
ipcMain.handle('window/minimize', (event) => {
  try {
    if (mainWin) mainWin.minimize();
    return { ok: true };
  } catch (e) { return { ok: false, error: String(e) }; }
});

ipcMain.handle('window/toggleMax', (event) => {
  try {
    if (!mainWin) return { ok: false, error: 'no-window' };
    if (mainWin.isMaximized()) mainWin.unmaximize();
    else mainWin.maximize();
    return { ok: true, maximized: mainWin.isMaximized() };
  } catch (e) { return { ok: false, error: String(e) }; }
});

ipcMain.handle('window/close', (event) => {
  try {
    if (mainWin) mainWin.close();
    return { ok: true };
  } catch (e) { return { ok: false, error: String(e) }; }
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

function createDisplayWindow() {
  if (displayWin && !displayWin.isDestroyed()) {
    displayWin.focus();
    return displayWin;
  }

  displayWin = new BrowserWindow({
    width: 1900,
    height: 620,
    useContentSize: true,
    frame: true, // use system window frame (title bar, minimize/close buttons)
    resizable: false,
    show: true,
    skipTaskbar: false,
    title: 'Metro PIDS - Display',
    // top-level window (no parent) so it appears as a separate native window
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const dispPath = `file://${path.join(__dirname, 'display_window.html')}`;
  displayWin.loadURL(dispPath);

  displayWin.on('closed', () => {
    displayWin = null;
  });

  return displayWin;
}
