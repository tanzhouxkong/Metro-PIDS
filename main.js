const { app, BrowserWindow, ipcMain, dialog, shell, screen, nativeImage, desktopCapturer, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const fsPromises = fs.promises;
const crypto = require('crypto');

// 设置应用名称（用于通知等系统显示）
// 必须在 app.whenReady() 之前设置
app.setName('Metro-PIDS');

// 引入日志和存储
let logger = null;
let Store = null;
let store = null;
try {
  logger = require('electron-log');
  Store = require('electron-store');
  store = new Store();
} catch (e) {
  console.warn('electron-log or electron-store not available:', e);
}

let autoUpdater = null;
try {
  // electron-updater 仅安装后可用，需安全 require
  // eslint-disable-next-line global-require
  console.log('[main] 尝试加载 electron-updater...');
  const updater = require('electron-updater');
  console.log('[main] electron-updater 模块加载成功:', typeof updater);
  console.log('[main] updater.autoUpdater:', typeof updater.autoUpdater);
  
  autoUpdater = updater.autoUpdater;
  
  if (!autoUpdater) {
    console.error('[main] updater.autoUpdater 为 undefined');
    // 尝试其他可能的导出方式
    if (updater.default && updater.default.autoUpdater) {
      autoUpdater = updater.default.autoUpdater;
      console.log('[main] 使用 updater.default.autoUpdater');
    }
  }
  
  // 配置日志
  if (logger && autoUpdater) {
    autoUpdater.logger = logger;
  }
  
  if (autoUpdater) {
    console.log('[main] electron-updater loaded successfully');
  } else {
    console.error('[main] electron-updater 加载失败：autoUpdater 为 null');
  }
  
  // 注意：在开发模式下（未打包），electron-updater 默认不会检查更新
  // 这是正常行为，更新功能需要在打包后的应用中测试
} catch (e) {
  console.error('[main] Failed to load electron-updater:', e);
  console.error('[main] Error details:', {
    message: e.message,
    stack: e.stack,
    code: e.code,
    name: e.name
  });
  autoUpdater = null;
}

let mainWin = null;
let displayWindows = new Map(); // 存储多个显示端窗口，key为displayId
let lineManagerWin = null;
let devWin = null;
let throughOperationTarget = null; // 存储贯通线路选择目标 ('lineA' 或 'lineB')

function createWindow() {
  // 使用方案二：隐藏默认标题栏，显示系统窗口控制按钮
  const isWindows = process.platform === 'win32';
  const isMacOS = process.platform === 'darwin';
  const isLinux = process.platform === 'linux';
  
  // Linux 不支持自定义标题栏，使用系统默认标题栏
  if (isLinux) {
    mainWin = new BrowserWindow({
      width: 1280,
      height: 800,
      frame: true, // Linux 使用系统框架
      transparent: false,
      resizable: true,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        nodeIntegration: false,
        contextIsolation: true
      }
    });
  } else {
    // Windows 和 MacOS 使用自定义标题栏
    mainWin = new BrowserWindow({
      width: 1280,
      height: 800,
      frame: false, // 隐藏默认框架
      transparent: false,
      resizable: true,
      // 隐藏默认标题栏，但保留系统窗口控制按钮
      titleBarStyle: 'hidden',
      // 显示系统自带窗口控制按钮
      titleBarOverlay: {
        color: isWindows ? 'rgba(0, 0, 0, 0)' : undefined, // Windows 设置为透明，MacOS 不需要
        symbolColor: isWindows ? '#2d3436' : undefined, // Windows 控制按钮颜色
        height: 35 // 控制按钮高度，与自定义标题栏高度一致
      },
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        nodeIntegration: false,
        contextIsolation: true
      }
    });
  }

  const controlPath = `file://${path.join(__dirname, 'index.html')}`;
  mainWin.loadURL(controlPath);

  // 监听来自线路管理器的线路切换请求
  ipcMain.on('switch-line-request', (event, lineName) => {
    if (mainWin && !mainWin.isDestroyed()) {
      // 通过 webContents.send 发送消息到渲染进程
      mainWin.webContents.send('switch-line-request', lineName);
    }
  });

  // 开启 DevTools 控制台（用于调试）
  // 仅在开发模式下自动打开
  if (!app.isPackaged) {
    mainWin.webContents.openDevTools();
  }
  
  // 将主进程日志发送到渲染进程（用于调试）
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args) => {
    originalLog.apply(console, args);
    try {
      mainWin && mainWin.webContents.send('main-console-log', args.map(a => String(a)).join(' '));
    } catch (e) {}
  };
  console.error = (...args) => {
    originalError.apply(console, args);
    try {
      mainWin && mainWin.webContents.send('main-console-error', args.map(a => String(a)).join(' '));
    } catch (e) {}
  };

  // 将主窗体设为无边框，以完全替换系统控件
  // 无边框窗口需在渲染层提供可拖拽区域（CSS -webkit-app-region: drag）
  // 仅在创建时生效

  // 拦截 renderer 的 window.open 来创建受控窗口
  mainWin.webContents.setWindowOpenHandler(({ url, features, disposition }) => {
    try {
      const u = url.toString();
      if (u.endsWith('display_window.html') || u.includes('display_window.html')) {
        createDisplayWindow();
        return { action: 'deny' };
      }
    } catch (e) {
      // 忽略错误
    }
    return { action: 'allow' };
  });

  // 暴露 IPC 供渲染层打开显示窗口
  ipcMain.handle('open-display', (event, opts) => {
    const w = opts && typeof opts.width === 'number' ? opts.width : undefined;
    const h = opts && typeof opts.height === 'number' ? opts.height : undefined;
    const displayId = opts && opts.displayId ? opts.displayId : 'display-1';
    console.log('[main] open-display requested, width=', w, 'height=', h, 'displayId=', displayId);
    createDisplayWindow(w, h, displayId);
    return true;
  });

  // 暴露 IPC 供渲染层切换显示端
  ipcMain.handle('switch-display', (event, displayId, width, height) => {
    console.log('[main] switch-display requested, displayId=', displayId, 'width=', width, 'height=', height);
    
    // 关闭所有现有的显示窗口
    for (const [id, win] of displayWindows.entries()) {
      if (win && !win.isDestroyed()) {
        try {
          win.close();
        } catch (e) {
          console.warn(`[main] 关闭显示窗口 ${id} 失败:`, e);
        }
      }
    }
    displayWindows.clear();
    
    // 创建新的显示窗口
    createDisplayWindow(width, height, displayId);
    return true;
  });

  // 暴露 IPC 供渲染层打开线路管理器
  ipcMain.handle('open-line-manager', (event, target) => {
    // target 可能是 'lineA' 或 'lineB'，用于贯通线路设置
    throughOperationTarget = target || null;
    createLineManagerWindow();
    return true;
  });

  // 暴露 IPC 供渲染层打开开发者窗口
  ipcMain.handle('open-dev-window', (event) => {
    createDevWindow();
    return true;
  });

  // 暴露 IPC 供渲染层关闭开发者窗口
  ipcMain.handle('close-dev-window', (event) => {
    if (devWin && !devWin.isDestroyed()) {
      devWin.close();
      devWin = null;
    }
    return true;
  });

  // 暴露 IPC 供渲染层打开开发者工具
  ipcMain.handle('dev/open-dev-tools', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) || mainWin;
    if (win && !win.isDestroyed()) {
      win.webContents.openDevTools();
      return true;
    }
    return false;
  });

  ipcMain.handle('dialog/alert', async (event, message) => {
    const win = BrowserWindow.fromWebContents(event.sender) || mainWin;
    if (!win) return;
    try {
      await showElectronAlert({ parent: win, type: 'alert', title: '提示', msg: String(message) });
      return true;
    } catch (e) {
      return false;
    }
  });

  ipcMain.handle('dialog/confirm', async (event, message) => {
    const win = BrowserWindow.fromWebContents(event.sender) || mainWin;
    if (!win) return false;
    try {
      const res = await showElectronAlert({ parent: win, type: 'confirm', title: '确认', msg: String(message) });
      return !!res;
    } catch (e) {
      return false;
    }
  });

  // 文件选择对话框
  ipcMain.handle('dialog/showOpenDialog', async (event, options) => {
    const win = BrowserWindow.fromWebContents(event.sender) || mainWin;
    if (!win) return { canceled: true };
    try {
      const result = await dialog.showOpenDialog(win, {
        ...options,
        properties: options.properties || ['openFile']
      });
      return result;
    } catch (e) {
      console.error('[main] showOpenDialog error:', e);
      return { canceled: true, error: String(e) };
    }
  });

  ipcMain.handle('effects/dialog-blur', (event, enable) => {
    const win = BrowserWindow.fromWebContents(event.sender) || mainWin;
    if (!win) return { ok: false, error: 'no-window' };
    try {
      if (typeof win.setVisualEffectState === 'function') {
        win.setVisualEffectState(enable ? 'active' : 'inactive');
      }
      if (process.platform === 'darwin' && typeof win.setVibrancy === 'function') {
        win.setVibrancy(enable ? 'fullscreen-ui' : 'none');
      }
      if (process.platform === 'win32' && typeof win.setBackgroundMaterial === 'function') {
        win.setBackgroundMaterial(enable ? 'acrylic' : 'mica');
      }
      return { ok: true };
    } catch (err) {
      console.warn('failed to toggle dialog blur', err);
      return { ok: false, error: String(err) };
    }
  });

  // 广播最大化/还原事件供渲染层更新 UI
  mainWin.on('maximize', () => {
    try { mainWin.webContents.send('window/maxstate', true); } catch (e) {}
  });
  mainWin.on('unmaximize', () => {
    try { mainWin.webContents.send('window/maxstate', false); } catch (e) {}
  });

  // 窗口 ready 后发送初始最大化状态
  mainWin.once('ready-to-show', () => {
    try { mainWin.webContents.send('window/maxstate', mainWin.isMaximized()); } catch (e) {}
  });

// 辅助：默认线路文件目录位于 userData
function getLinesDir(dir) {
  if (dir && typeof dir === 'string' && dir.length > 0) return dir;
  // 获取当前活动的文件夹
  const currentFolder = store ? (store.get('linesCurrentFolder') || 'default') : 'default';
  const folders = store ? (store.get('linesFolders') || {}) : {};
  if (folders[currentFolder]) {
    return folders[currentFolder].path;
  }
  // 如果默认文件夹不存在，使用默认路径
  const defaultPath = path.join(app.getPath('userData'), 'lines');
  // 确保默认文件夹被添加到列表中
  if (store) {
    const currentFolders = store.get('linesFolders') || {};
    if (!currentFolders.default) {
      currentFolders.default = { name: '默认', path: defaultPath };
      store.set('linesFolders', currentFolders);
      if (!store.get('linesCurrentFolder')) {
        store.set('linesCurrentFolder', 'default');
      }
    }
  }
  return defaultPath;
}

// 获取所有文件夹配置
function getLinesFolders() {
  if (!store) return { default: { name: '默认', path: path.join(app.getPath('userData'), 'lines') } };
  const folders = store.get('linesFolders') || {};
  // 确保有默认文件夹
  if (!folders.default) {
    folders.default = { name: '默认', path: path.join(app.getPath('userData'), 'lines') };
    store.set('linesFolders', folders);
  }
  return folders;
}

// 获取当前活动的文件夹ID
function getCurrentLinesFolder() {
  if (!store) return 'default';
  return store.get('linesCurrentFolder') || 'default';
}

async function ensureDir(dir) {
  try {
    await fsPromises.mkdir(dir, { recursive: true });
  } catch (e) {
    // 忽略错误
  }
}

// 初始化预设线路文件：从 preset-lines 文件夹复制到默认文件夹
async function initPresetLinesFromSource() {
  try {
    // 获取应用目录下的 preset-lines 文件夹路径
    const presetLinesDir = path.join(__dirname, 'preset-lines');
    
    // 检查 preset-lines 文件夹是否存在
    try {
      await fsPromises.access(presetLinesDir);
    } catch (e) {
      // 文件夹不存在，跳过初始化
      console.log('[initPresetLines] preset-lines 文件夹不存在，跳过初始化');
      return;
    }
    
    // 获取默认文件夹路径
    const defaultLinesDir = path.join(app.getPath('userData'), 'lines');
    await ensureDir(defaultLinesDir);
    
    // 确保默认文件夹在配置中
    if (store) {
      const folders = store.get('linesFolders') || {};
      if (!folders.default) {
        folders.default = { name: '默认', path: defaultLinesDir };
        store.set('linesFolders', folders);
      }
    }
    
    // 读取 preset-lines 文件夹中的所有 JSON 文件
    const files = await fsPromises.readdir(presetLinesDir);
    const jsonFiles = files.filter(f => f.endsWith('.json'));
    
    if (jsonFiles.length === 0) {
      console.log('[initPresetLines] preset-lines 文件夹中没有 JSON 文件');
      return;
    }
    
    // 复制每个文件到默认文件夹（仅当目标文件不存在时）
    let copiedCount = 0;
    for (const filename of jsonFiles) {
      try {
        const sourcePath = path.join(presetLinesDir, filename);
        const targetPath = path.join(defaultLinesDir, filename);
        
        // 检查目标文件是否已存在
        try {
          await fsPromises.access(targetPath);
          // 文件已存在，跳过
          continue;
        } catch (e) {
          // 文件不存在，复制文件
          const content = await fsPromises.readFile(sourcePath, 'utf8');
          await fsPromises.writeFile(targetPath, content, 'utf8');
          copiedCount++;
          console.log(`[initPresetLines] 已复制预设线路文件: ${filename}`);
        }
      } catch (e) {
        console.warn(`[initPresetLines] 复制文件 ${filename} 失败:`, e);
      }
    }
    
    if (copiedCount > 0) {
      console.log(`[initPresetLines] 初始化完成，共复制 ${copiedCount} 个预设线路文件`);
    } else {
      console.log('[initPresetLines] 所有预设线路文件已存在，跳过复制');
    }
  } catch (e) {
    console.warn('[initPresetLines] 初始化预设线路文件失败:', e);
  }
}


// 查找 JSON 文件的辅助函数（recursive 参数控制是否递归查找子文件夹）
async function findJsonFiles(dir, baseDir = null, recursive = false) {
  if (!baseDir) baseDir = dir;
  const out = [];
  try {
    const entries = await fsPromises.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // 如果启用递归，递归查找子文件夹
        if (recursive) {
          const subFiles = await findJsonFiles(fullPath, baseDir, recursive);
          out.push(...subFiles);
        }
        // 如果不递归，跳过子文件夹
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.json')) {
        try {
          const stat = await fsPromises.stat(fullPath);
          const txt = await fsPromises.readFile(fullPath, 'utf8');
          let json = null;
          try { json = JSON.parse(txt); } catch (e) { json = null; }
          const version = json && json.meta && json.meta.version ? json.meta.version : null;
          // 计算相对路径作为文件名（相对于 baseDir）
          const relativePath = path.relative(baseDir, fullPath);
          const nameWithoutExt = relativePath.replace(/\.json$/i, '').replace(/\\/g, '/');
          out.push({ name: nameWithoutExt, version, mtime: stat.mtimeMs, fullPath });
        } catch (e) {
          // 出错则跳过该文件
        }
      }
    }
  } catch (e) {
    // 忽略错误
  }
  return out;
}

// 列出线路文件(JSON)，返回 { name, version, mtime } 数组（支持递归查找子文件夹）
// dir 可以是文件夹路径（字符串）或文件夹ID
ipcMain.handle('lines/list', async (event, dir) => {
  let base;
  if (dir && typeof dir === 'string') {
    // 如果 dir 看起来像是一个完整路径（包含路径分隔符或绝对路径）
    if (dir.includes(path.sep) || path.isAbsolute(dir)) {
      base = dir;
    } else {
      // 否则认为是文件夹ID，从配置中获取路径
      const folders = getLinesFolders();
      if (folders[dir]) {
        base = folders[dir].path;
      } else {
        base = getLinesDir(dir);
      }
    }
  } else {
    base = getLinesDir(dir);
  }
  await ensureDir(base);
  try {
    // 不递归查找子文件夹，只查找当前文件夹下的 JSON 文件
    const files = await findJsonFiles(base, base, false);
    return files;
  } catch (err) {
    return { error: String(err) };
  }
});

// 读取单个线路文件（支持子文件夹路径）
ipcMain.handle('lines/read', async (event, filename, dir) => {
  let base;
  if (dir && typeof dir === 'string') {
    // 如果 dir 看起来像是一个完整路径（包含路径分隔符或绝对路径）
    if (dir.includes(path.sep) || path.isAbsolute(dir)) {
      base = dir;
    } else {
      // 否则认为是文件夹ID，从配置中获取路径
      const folders = getLinesFolders();
      if (folders[dir]) {
        base = folders[dir].path;
      } else {
        base = getLinesDir(dir);
      }
    }
  } else {
    base = getLinesDir(dir);
  }
  // 如果 filename 包含路径分隔符，说明是子文件夹中的文件
  let fp;
  if (filename.includes('/') || filename.includes('\\')) {
    // 相对路径，直接拼接
    fp = path.join(base, filename);
    if (!fp.endsWith('.json')) fp += '.json';
  } else {
    // 简单文件名
    const name = filename.endsWith('.json') ? filename : `${filename}.json`;
    fp = path.join(base, name);
  }
  try {
    const txt = await fsPromises.readFile(fp, 'utf8');
    return { ok: true, content: JSON.parse(txt) };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// 保存线路文件，附带简单版本处理（支持子文件夹路径）
ipcMain.handle('lines/save', async (event, filename, contentObj, dir) => {
  const base = getLinesDir(dir);
  await ensureDir(base);
  // 如果 filename 包含路径分隔符，说明要保存到子文件夹
  let fp;
  if (filename.includes('/') || filename.includes('\\')) {
    // 相对路径，直接拼接
    fp = path.join(base, filename);
    if (!fp.endsWith('.json')) fp += '.json';
    // 确保父目录存在
    await ensureDir(path.dirname(fp));
  } else {
    // 简单文件名
    const name = filename.endsWith('.json') ? filename : `${filename}.json`;
    fp = path.join(base, name);
  }
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
      contentObj.meta.version = existingVer + 1; // 版本递增
    }
    // 写入文件
    await fsPromises.writeFile(fp, JSON.stringify(contentObj, null, 2), 'utf8');
    return { ok: true, path: fp };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// 删除线路文件（支持子文件夹路径）
ipcMain.handle('lines/delete', async (event, filename, dir) => {
  const base = getLinesDir(dir);
  // 如果 filename 包含路径分隔符，说明是子文件夹中的文件
  let fp;
  if (filename.includes('/') || filename.includes('\\')) {
    // 相对路径，直接拼接
    fp = path.join(base, filename);
    if (!fp.endsWith('.json')) fp += '.json';
  } else {
    // 简单文件名
    const name = filename.endsWith('.json') ? filename : `${filename}.json`;
    fp = path.join(base, name);
  }
  try {
    await fsPromises.unlink(fp);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// 在文件管理器中打开线路目录
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

// 打开指定的文件夹路径（用于右键菜单）
ipcMain.handle('lines/folders/open', async (event, folderPath) => {
  try {
    const r = await shell.openPath(folderPath);
    if (r && r.length) return { ok: false, error: r };
    return { ok: true, path: folderPath };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// 多文件夹管理：列出所有文件夹（自动扫描并添加已存在的文件夹）
ipcMain.handle('lines/folders/list', async () => {
  try {
    const baseLinesDir = path.join(app.getPath('userData'), 'lines');
    await ensureDir(baseLinesDir);
    
    // 扫描 lines 目录下的所有子文件夹
    const existingDirs = [];
    try {
      const entries = await fsPromises.readdir(baseLinesDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const dirPath = path.join(baseLinesDir, entry.name);
          existingDirs.push({
            name: entry.name,
            path: dirPath
          });
        }
      }
    } catch (e) {
      console.warn('扫描文件夹失败:', e);
    }
    
    // 获取当前配置的文件夹
    let folders = getLinesFolders();
    let hasChanges = false;
    
    // 将已存在但未配置的文件夹添加到配置中
    for (const dir of existingDirs) {
      const existingId = Object.keys(folders).find(id => folders[id].path === dir.path);
      if (!existingId) {
        // 文件夹存在但不在配置中，自动添加
        const newId = `folder_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        folders[newId] = { name: dir.name, path: dir.path };
        hasChanges = true;
      }
    }
    
    // 如果有新文件夹被添加，保存配置
    if (hasChanges && store) {
      store.set('linesFolders', folders);
    }
    
    const current = getCurrentLinesFolder();
    const result = Object.keys(folders).map(id => ({
      id,
      name: folders[id].name,
      path: folders[id].path,
      isCurrent: id === current
    }));
    return { ok: true, folders: result, current };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// 多文件夹管理：添加文件夹（在 lines 目录下创建子文件夹）
ipcMain.handle('lines/folders/add', async (event, folderName) => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWin;
  if (!win) return { ok: false, error: 'no-window' };
  try {
    // 获取 lines 基础目录
    const baseLinesDir = path.join(app.getPath('userData'), 'lines');
    await ensureDir(baseLinesDir);
    
    // 如果没有提供文件夹名，返回错误提示前端先获取用户输入
    if (!folderName || typeof folderName !== 'string' || !folderName.trim()) {
      return { ok: false, error: 'folder-name-required' };
    }
    
    // 清理文件夹名称，移除不合法字符
    const sanitizedFolderName = folderName.trim().replace(/[<>:"/\\|?*]/g, '');
    if (!sanitizedFolderName) {
      return { ok: false, error: '文件夹名称无效' };
    }
    
    // 先检查文件夹名称是否已存在（按名称检查，不按路径）
    const folders = getLinesFolders();
    const existingByName = Object.keys(folders).find(id => {
      const folder = folders[id];
      return folder && folder.name === sanitizedFolderName;
    });
    if (existingByName) {
      return { ok: false, error: `文件夹名称"${sanitizedFolderName}"已存在，请使用其他名称` };
    }
    
    // 构建完整路径
    const folderPath = path.join(baseLinesDir, sanitizedFolderName);
    
    // 检查文件夹路径是否已存在
    try {
      const stat = await fsPromises.stat(folderPath);
      if (stat.isDirectory()) {
        // 文件夹路径已存在，检查是否已在配置中
        const existingId = Object.keys(folders).find(id => folders[id].path === folderPath);
        if (existingId) {
          return { ok: false, error: '该文件夹路径已存在', folderId: existingId };
        }
        // 文件夹路径已存在但不在配置中，直接添加到配置
      } else {
        return { ok: false, error: '路径已存在但不是文件夹' };
      }
    } catch (e) {
      // 文件夹不存在，创建它
      await ensureDir(folderPath);
    }
    
    // 再次检查该路径是否已经在配置中（防止并发创建）
    const foldersCheck = getLinesFolders();
    const existingId = Object.keys(foldersCheck).find(id => foldersCheck[id].path === folderPath);
    if (existingId) {
      return { ok: false, error: '该文件夹已存在', folderId: existingId };
    }
    
    // 生成新的文件夹ID（使用时间戳）
    const newId = `folder_${Date.now()}`;
    
    foldersCheck[newId] = { name: sanitizedFolderName, path: folderPath };
    if (store) {
      store.set('linesFolders', foldersCheck);
    }
    
    return { ok: true, folderId: newId, name: sanitizedFolderName, path: folderPath };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// 多文件夹管理：删除文件夹（同时删除文件夹及其内部的所有文件）
// 支持通过路径或ID来删除文件夹（优先使用路径）
ipcMain.handle('lines/folders/remove', async (event, folderPathOrId) => {
  try {
    if (folderPathOrId === 'default') {
      return { ok: false, error: '不能删除默认文件夹' };
    }
    
    console.log(`[main] 删除文件夹，参数: ${folderPathOrId}`);
    const folders = getLinesFolders();
    
    let targetFolderId = null;
    let folderPath = null;
    
    // 判断传入的是路径还是ID
    const isPath = folderPathOrId.includes(path.sep) || path.isAbsolute(folderPathOrId);
    
    if (isPath) {
      // 传入的是路径，通过路径查找配置中的文件夹
      folderPath = folderPathOrId;
      // 标准化路径（处理路径分隔符差异）
      const normalizedPath = path.normalize(folderPath);
      
      // 在配置中查找匹配的路径
      for (const [id, folder] of Object.entries(folders)) {
        if (id === 'default') continue;
        const normalizedFolderPath = path.normalize(folder.path);
        if (normalizedFolderPath === normalizedPath) {
          targetFolderId = id;
          break;
        }
      }
      
      if (!targetFolderId) {
        console.warn(`[main] 通过路径找不到文件夹配置，路径: ${folderPath}`);
        // 即使配置中找不到，也尝试直接删除文件系统中的文件夹
        // 这样可以处理配置不同步的情况
      }
    } else {
      // 传入的是ID，通过ID查找
      targetFolderId = folderPathOrId;
      if (!folders[targetFolderId]) {
        const availableIds = Object.keys(folders);
        const errorMsg = `文件夹配置不存在。请求的ID: "${targetFolderId}"，当前可用的ID: ${availableIds.length > 0 ? availableIds.map(id => `"${id}"`).join(', ') : '无'}`;
        console.warn(`[main] ${errorMsg}`);
        return { ok: false, error: errorMsg };
      }
      folderPath = folders[targetFolderId].path;
    }
    
    // 如果没有找到配置但传入了路径，使用传入的路径直接删除
    if (!targetFolderId && isPath) {
      console.log(`[main] 配置中未找到文件夹，但将尝试删除路径: ${folderPath}`);
    }
    
    // 验证文件夹路径是否存在
    try {
      const stat = await fsPromises.stat(folderPath);
      if (!stat.isDirectory()) {
        // 路径存在但不是文件夹，只删除配置（如果找到了配置）
        console.warn(`路径 ${folderPath} 存在但不是文件夹，只删除配置`);
        if (targetFolderId && folders[targetFolderId]) {
          delete folders[targetFolderId];
          if (store) {
            store.set('linesFolders', folders);
          }
        }
        return { ok: true };
      }
    } catch (statErr) {
      // 文件夹路径不存在，可能已经被删除，只删除配置（如果找到了配置）
      console.warn(`文件夹路径 ${folderPath} 不存在，只删除配置:`, statErr.message);
      if (targetFolderId && folders[targetFolderId]) {
        delete folders[targetFolderId];
        if (store) {
          store.set('linesFolders', folders);
        }
      }
      return { ok: true };
    }
    
    // 如果删除的是当前文件夹，切换到默认文件夹
    if (targetFolderId) {
      const current = getCurrentLinesFolder();
      if (current === targetFolderId) {
        if (store) {
          store.set('linesCurrentFolder', 'default');
        }
      }
    }
    
    // 删除文件夹及其内部的所有文件
    try {
      // 使用 Node.js 14.14.0+ 的 fs.promises.rm，支持 recursive 选项
      await fsPromises.rm(folderPath, { recursive: true, force: true });
      console.log(`成功删除文件夹: ${folderPath}`);
    } catch (rmErr) {
      // 如果 fs.promises.rm 不可用或失败，尝试使用 rmdir
      try {
        await fsPromises.rmdir(folderPath, { recursive: true });
        console.log(`使用 rmdir 成功删除文件夹: ${folderPath}`);
      } catch (rmdirErr) {
        // 如果都失败，记录错误但继续删除配置
        console.error(`删除文件夹失败 ${folderPath}:`, rmdirErr);
        // 即使删除失败，也继续删除配置，避免配置和实际文件不一致
        // return { ok: false, error: `删除文件夹失败: ${rmdirErr.message}` };
      }
    }
    
    // 从配置中移除文件夹（如果找到了配置）
    if (targetFolderId && folders[targetFolderId]) {
      delete folders[targetFolderId];
      if (store) {
        store.set('linesFolders', folders);
      }
    }
    
    return { ok: true };
  } catch (err) {
    console.error('删除文件夹时发生错误:', err);
    return { ok: false, error: String(err) };
  }
});

// 多文件夹管理：重命名文件夹
ipcMain.handle('lines/folders/rename', async (event, folderId, newName) => {
  try {
    if (!newName || typeof newName !== 'string' || newName.trim().length === 0) {
      return { ok: false, error: '文件夹名称不能为空' };
    }
    
    const folders = getLinesFolders();
    if (!folders[folderId]) {
      return { ok: false, error: '文件夹不存在' };
    }
    
    folders[folderId].name = newName.trim();
    if (store) {
      store.set('linesFolders', folders);
    }
    
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// 多文件夹管理：切换当前文件夹
ipcMain.handle('lines/folders/switch', async (event, folderId) => {
  try {
    const folders = getLinesFolders();
    if (!folders[folderId]) {
      return { ok: false, error: '文件夹不存在' };
    }
    
    if (store) {
      store.set('linesCurrentFolder', folderId);
    }
    
    return { ok: true, folderId, name: folders[folderId].name, path: folders[folderId].path };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// 多文件夹管理：获取当前文件夹
ipcMain.handle('lines/folders/current', async () => {
  try {
    const folders = getLinesFolders();
    const current = getCurrentLinesFolder();
    const folder = folders[current];
    if (!folder) {
      return { ok: false, error: '当前文件夹不存在' };
    }
    return { ok: true, folderId: current, name: folder.name, path: folder.path };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// 短交路预设目录
function getShortTurnsDir() {
  return path.join(app.getPath('userData'), 'shortturns');
}

// 列出短交路预设（按线路名称筛选）
ipcMain.handle('shortturns/list', async (event, lineName) => {
  const base = getShortTurnsDir();
  await ensureDir(base);
  try {
    const files = await findJsonFiles(base, base, false); // 不递归查找子文件夹
    const presets = [];
    for (const file of files) {
      try {
        const res = await fsPromises.readFile(file.fullPath, 'utf8');
        const preset = JSON.parse(res);
        // 如果指定了线路名称，只返回匹配的预设
        if (!lineName || (preset.lineName && preset.lineName === lineName)) {
          // file.name 可能包含路径，我们只需要文件名（不含扩展名）
          const presetName = path.basename(file.name, '.json');
          presets.push({
            name: presetName,
            ...preset,
            mtime: file.mtime
          });
        }
      } catch (e) {
        // 跳过无效文件
      }
    }
    return presets;
  } catch (err) {
    return { error: String(err) };
  }
});

// 保存短交路预设
ipcMain.handle('shortturns/save', async (event, presetName, presetData) => {
  const base = getShortTurnsDir();
  await ensureDir(base);
  const sanitized = presetName.replace(/[<>:"/\\|?*]/g, '').trim();
  if (!sanitized) {
    return { ok: false, error: '预设名称无效' };
  }
  const fp = path.join(base, sanitized + '.json');
  try {
    await fsPromises.writeFile(fp, JSON.stringify(presetData, null, 2), 'utf8');
    return { ok: true, path: fp };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// 读取短交路预设
ipcMain.handle('shortturns/read', async (event, presetName) => {
  const base = getShortTurnsDir();
  const sanitized = presetName.replace(/[<>:"/\\|?*]/g, '').trim();
  if (!sanitized) {
    return { ok: false, error: '预设名称无效' };
  }
  const fp = path.join(base, sanitized + '.json');
  try {
    const txt = await fsPromises.readFile(fp, 'utf8');
    return { ok: true, content: JSON.parse(txt) };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// 删除短交路预设
ipcMain.handle('shortturns/delete', async (event, presetName) => {
  const base = getShortTurnsDir();
  const sanitized = presetName.replace(/[<>:"/\\|?*]/g, '').trim();
  if (!sanitized) {
    return { ok: false, error: '预设名称无效' };
  }
  const fp = path.join(base, sanitized + '.json');
  try {
    await fsPromises.unlink(fp);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// 计算数据的 MD5 哈希值（用于比较线路是否相同）
ipcMain.handle('utils/calculate-md5', async (event, data) => {
  try {
    // 标准化数据（移除版本号等可能变化的字段）
    const normalizeForCompare = (line) => {
      const normalized = JSON.parse(JSON.stringify(line));
      if (normalized.meta) {
        delete normalized.meta.version;
      }
      return normalized;
    };
    
    const normalized = normalizeForCompare(data);
    
    // 将数据转换为 JSON 字符串（标准化格式，排序键）
    const jsonStr = JSON.stringify(normalized, Object.keys(normalized).sort());
    
    // 使用 Node.js crypto 模块计算 MD5
    const hash = crypto.createHash('md5').update(jsonStr, 'utf8').digest('hex');
    return { ok: true, hash };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// 在默认浏览器打开外部链接
ipcMain.handle('open-external', async (event, url) => {
  try {
    if (!url || typeof url !== 'string') return { ok: false, error: 'invalid-url' };
    const result = await shell.openExternal(url);
    return { ok: true, result };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// 提供应用版本给渲染层
ipcMain.handle('app/get-version', async () => {
  try {
    return { ok: true, version: app.getVersion() };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle('app/is-packaged', async () => {
  try {
    return app.isPackaged;
  } catch (e) {
    return false;
  }
});

// 提供操作系统版本信息给渲染层
ipcMain.handle('app/get-os-version', async () => {
  try {
    const os = require('os');
    const { execSync } = require('child_process');
    const platform = os.platform();
    let osVersion = '';
    
    if (platform === 'win32') {
      // Windows: 使用 PowerShell 获取准确的 Windows 版本信息
      try {
        // 使用 PowerShell 获取 Windows 版本号（更准确）
        const psCommand = `
          $os = Get-CimInstance Win32_OperatingSystem;
          $version = $os.Version;
          $build = $os.BuildNumber;
          $caption = $os.Caption;
          # 检查是否是 Windows 11（Build 22000 或更高）
          if ([int]$build -ge 22000) {
            $caption = "Windows 11";
          }
          Write-Output "$caption $version (Build $build)"
        `;
        const result = execSync(`powershell -Command "${psCommand}"`, { 
          encoding: 'utf8', 
          timeout: 5000,
          windowsHide: true 
        }).trim();
        if (result) {
          osVersion = result;
        } else {
          // 降级方案：使用 os.release()
          const release = os.release();
          osVersion = `Windows ${release}`;
        }
      } catch (e) {
        // 如果 PowerShell 失败，使用降级方案
        console.warn('Failed to get Windows version via PowerShell:', e);
        const release = os.release();
        const buildNumber = release.split('.')[2] || '';
        // Windows 11 的 Build 号是 22000 或更高
        if (buildNumber && parseInt(buildNumber) >= 22000) {
          osVersion = `Windows 11 ${release}`;
        } else {
          osVersion = `Windows 10 ${release}`;
        }
      }
    } else if (platform === 'darwin') {
      // macOS: 使用 os.release() 获取 Darwin 版本，通常需要映射到 macOS 版本
      const release = os.release();
      // Darwin 版本号映射（简化版本，可根据需要扩展）
      osVersion = `macOS ${release}`;
    } else if (platform === 'linux') {
      // Linux: 尝试获取发行版信息，如果没有则使用内核版本
      try {
        const fs = require('fs');
        // 尝试读取 /etc/os-release
        if (fs.existsSync('/etc/os-release')) {
          const osRelease = fs.readFileSync('/etc/os-release', 'utf8');
          const lines = osRelease.split('\n');
          let name = '';
          let version = '';
          for (const line of lines) {
            if (line.startsWith('PRETTY_NAME=')) {
              const match = line.match(/PRETTY_NAME="(.+)"/);
              if (match) {
                osVersion = match[1];
                break;
              }
            } else if (line.startsWith('NAME=') && !name) {
              const match = line.match(/NAME="(.+)"/);
              if (match) name = match[1];
            } else if (line.startsWith('VERSION=') && !version) {
              const match = line.match(/VERSION="(.+)"/);
              if (match) version = match[1];
            }
          }
          if (!osVersion && name) {
            osVersion = version ? `${name} ${version}` : name;
          }
        }
        if (!osVersion) {
          osVersion = `Linux ${os.release()}`;
        }
      } catch (e) {
        osVersion = `Linux ${os.release()}`;
      }
    } else {
      osVersion = `${platform} ${os.release()}`;
    }
    
    return { ok: true, osVersion: osVersion || `${platform} ${os.release()}` };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

// 获取环境变量中的 Gitee Token
ipcMain.handle('env/get-gitee-token', () => {
  // 优先从环境变量读取，支持多种命名方式
  return process.env.GITEE_TOKEN || 
         process.env.GITEE_ACCESS_TOKEN || 
         null;
});

// 更新主窗口进度条（用于任务栏图标）
ipcMain.handle('window/set-progress-bar', async (event, progress) => {
  try {
    if (mainWin && !mainWin.isDestroyed()) {
      // progress 是 0 到 1 之间的浮点数，-1 表示移除进度条
      if (progress >= 0 && progress <= 1) {
        mainWin.setProgressBar(progress);
      } else if (progress === -1) {
        mainWin.setProgressBar(-1);
      }
      return { ok: true };
    }
    return { ok: false, error: 'Main window not available' };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

// 取色窗口和状态
let colorPickerWin = null;
let colorPickResolve = null;

// 启动取色模式
ipcMain.handle('color/startPick', async (event) => {
  try {
    // 如果已经有取色窗口，先关闭
    if (colorPickerWin) {
      colorPickerWin.close();
      colorPickerWin = null;
    }
    
    // 获取主屏幕尺寸和位置
    const primaryDisplay = screen.getPrimaryDisplay();
    const screenSize = primaryDisplay.size;
    const screenBounds = primaryDisplay.bounds;
    
    colorPickerWin = new BrowserWindow({
      width: screenSize.width,
      height: screenSize.height,
      x: screenBounds.x,
      y: screenBounds.y,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js')
      }
    });
    
    // 创建取色页面 HTML
    const pickerHTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      width: 100vw;
      height: 100vh;
      background: transparent;
      cursor: crosshair;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: Arial, sans-serif;
      color: white;
      font-size: 24px;
      text-shadow: 2px 2px 4px rgba(0,0,0,0.8);
      user-select: none;
    }
    .picker-hint {
      background: rgba(0,0,0,0.7);
      padding: 16px 24px;
      border-radius: 8px;
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
    }
  </style>
</head>
<body>
  <div class="picker-hint">点击屏幕任意位置取色 (ESC 取消)</div>
  <script>
    document.addEventListener('click', (e) => {
      window.electronAPI.sendColorPickClick(e.screenX, e.screenY);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        window.electronAPI.cancelColorPick();
      }
    });
  </script>
</body>
</html>`;
    
    // 等待窗口准备好后再显示
    colorPickerWin.once('ready-to-show', () => {
      // 允许鼠标事件，但确保窗口在最上层
      colorPickerWin.setIgnoreMouseEvents(false);
      colorPickerWin.show();
      colorPickerWin.focus();
      // 确保窗口始终在最上层
      colorPickerWin.setAlwaysOnTop(true, 'screen-saver');
    });
    
    colorPickerWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(pickerHTML)}`);
    
    // 监听窗口关闭
    colorPickerWin.on('closed', () => {
      colorPickerWin = null;
      if (colorPickResolve) {
        const resolve = colorPickResolve;
        colorPickResolve = null;
        resolve({ ok: false, error: 'cancelled' });
      }
    });
    
    // 返回 Promise，等待取色结果
    return new Promise((resolve) => {
      colorPickResolve = resolve;
    });
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

// 显示系统通知
ipcMain.handle('notification/show', async (event, { title, body, options = {} }) => {
  try {
    // Electron 的 Notification 在 Windows/Linux 上需要应用已就绪
    if (!Notification.isSupported()) {
      return { ok: false, error: '系统不支持通知' };
    }

    const notification = new Notification({
      title: title || '通知',
      body: body || '',
      icon: options.icon || undefined,
      badge: options.badge || undefined,
      tag: options.tag || undefined,
      silent: options.silent || false,
      urgency: options.urgency || 'normal' // 'normal', 'critical', 'low'
    });

    // 可选：添加点击事件处理
    notification.on('click', () => {
      if (mainWin && !mainWin.isDestroyed()) {
        mainWin.focus();
      }
    });

    notification.show();
    return { ok: true };
  } catch (e) {
    console.error('显示通知失败:', e);
    return { ok: false, error: String(e) };
  }
});

// 处理取色点击
ipcMain.on('color-picker-click', async (event, x, y) => {
  if (!colorPickerWin || !colorPickResolve) return;
  
  try {
    // 使用系统 API 获取准确的鼠标位置
    const cursorPoint = screen.getCursorScreenPoint();
    const actualX = cursorPoint.x;
    const actualY = cursorPoint.y;
    
    // 使用系统 API 获取像素颜色（各平台使用不同的方法）
    const { execSync } = require('child_process');
    let systemColor = null;
    
    if (process.platform === 'win32') {
      // Windows: 使用 PowerShell 调用 Windows API GetPixel
      try {
        const psScript = `Add-Type @"
using System;
using System.Runtime.InteropServices;
public class PixelColor {
  [DllImport("user32.dll")]
  public static extern IntPtr GetDC(IntPtr hWnd);
  [DllImport("user32.dll")]
  public static extern int ReleaseDC(IntPtr hWnd, IntPtr hDC);
  [DllImport("gdi32.dll")]
  public static extern uint GetPixel(IntPtr hdc, int nXPos, int nYPos);
}
"@; $hdc = [PixelColor]::GetDC([IntPtr]::Zero); $colorRef = [PixelColor]::GetPixel($hdc, ${actualX}, ${actualY}); [PixelColor]::ReleaseDC([IntPtr]::Zero, $hdc); $r = $colorRef -band 0x0000FF; $g = ($colorRef -band 0x00FF00) -shr 8; $b = ($colorRef -band 0xFF0000) -shr 16; Write-Output "$r,$g,$b"`;
        
        const result = execSync(`powershell -Command "${psScript}"`, { encoding: 'utf-8', timeout: 5000 });
        const parts = result.trim().split(',');
        if (parts.length === 3) {
          const r = parseInt(parts[0].trim());
          const g = parseInt(parts[1].trim());
          const b = parseInt(parts[2].trim());
          
          if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
            systemColor = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
          }
        }
      } catch (psError) {
        console.warn('[ColorPicker] Windows PowerShell 取色失败:', psError.message || psError);
      }
    } else if (process.platform === 'darwin') {
      // macOS: 使用 screencapture 命令截取指定坐标的像素
      try {
        const fs = require('fs');
        const os = require('os');
        const tmpFile = path.join(os.tmpdir(), `color_pick_${Date.now()}.png`);
        
        // 使用 screencapture 截取指定坐标的 1x1 像素区域
        // -R x,y,w,h: 指定区域，-x: 不播放快门声音
        execSync(`screencapture -R ${actualX},${actualY},1,1 -x "${tmpFile}"`, { timeout: 5000 });
        
        if (fs.existsSync(tmpFile)) {
          // 读取图片并获取像素颜色
          const image = nativeImage.createFromPath(tmpFile);
          if (image && !image.isEmpty()) {
            const bitmap = image.getBitmap();
            
            if (bitmap && bitmap.length >= 4) {
              // macOS 上 getBitmap() 返回 RGBA 格式
              const r = bitmap[0];
              const g = bitmap[1];
              const b = bitmap[2];
              
              systemColor = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
            }
          }
          
          // 清理临时文件
          try { fs.unlinkSync(tmpFile); } catch (e) {}
        }
      } catch (macError) {
        console.warn('[ColorPicker] macOS 系统 API 取色失败:', macError.message || macError);
      }
    } else if (process.platform === 'linux') {
      // Linux: 使用 xwd + ImageMagick convert 或者 import 命令
      try {
        const fs = require('fs');
        const os = require('os');
        const tmpFile = path.join(os.tmpdir(), `color_pick_${Date.now()}.png`);
        
        // 方法1: 尝试使用 import 命令（ImageMagick）直接截取指定坐标的像素
        try {
          execSync(`import -window root -crop 1x1+${actualX}+${actualY} "${tmpFile}"`, { timeout: 5000 });
        } catch (importError) {
          // import 失败，尝试使用 xwd + convert
          const xwdFile = path.join(os.tmpdir(), `color_pick_${Date.now()}.xwd`);
          try {
            // 使用 xwd 截取整个屏幕
            execSync(`xwd -root -silent -out "${xwdFile}"`, { timeout: 5000 });
            
            if (fs.existsSync(xwdFile)) {
              // 使用 convert 裁剪指定坐标的像素
              execSync(`convert "${xwdFile}" -crop 1x1+${actualX}+${actualY} "${tmpFile}"`, { timeout: 5000 });
            }
            
            // 清理 xwd 文件
            try { fs.unlinkSync(xwdFile); } catch (e) {}
          } catch (xwdError) {
            throw importError; // 如果都失败，抛出原始错误
          }
        }
        
        if (fs.existsSync(tmpFile)) {
          const image = nativeImage.createFromPath(tmpFile);
          if (image && !image.isEmpty()) {
            const bitmap = image.getBitmap();
            
            if (bitmap && bitmap.length >= 4) {
              // Linux 上 getBitmap() 通常返回 RGBA 格式
              const r = bitmap[0];
              const g = bitmap[1];
              const b = bitmap[2];
              
              systemColor = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
            }
          }
          
          // 清理临时文件
          try { fs.unlinkSync(tmpFile); } catch (e) {}
        }
      } catch (linuxError) {
        console.warn('[ColorPicker] Linux 系统 API 取色失败:', linuxError.message || linuxError);
      }
    }
    
    // 如果系统 API 成功获取颜色，直接返回
    if (systemColor) {
      const resolve = colorPickResolve;
      colorPickResolve = null;
      
      if (colorPickerWin) {
        colorPickerWin.close();
        colorPickerWin = null;
      }
      
      resolve({ ok: true, color: systemColor });
      return;
    }
    
    // 回退方法：使用 desktopCapturer（适用于所有平台或 Windows API 失败时）
    const primaryDisplay = screen.getPrimaryDisplay();
    const screenSize = primaryDisplay.size;
    const scaleFactor = primaryDisplay.scaleFactor || 1;
    
    // 使用原始分辨率（考虑缩放因子）获取屏幕源
    const sources = await desktopCapturer.getSources({ 
      types: ['screen'], 
      thumbnailSize: {
        width: screenSize.width * scaleFactor,
        height: screenSize.height * scaleFactor
      }
    });
    
    if (!sources || sources.length === 0) {
      throw new Error('无法获取屏幕源');
    }
    
    // 找到主显示器
    const source = sources.find(s => s.display_id === primaryDisplay.id.toString()) || sources[0];
    
    if (!source || !source.thumbnail) {
      throw new Error('无法获取屏幕缩略图');
    }
    
    // 直接从 thumbnail 获取 bitmap
    const bitmap = source.thumbnail.getBitmap();
    const thumbnailSize = source.thumbnail.getSize();
    
    // 计算坐标：鼠标位置需要乘以缩放因子来匹配缩略图分辨率
    const pixelX = Math.floor(actualX * scaleFactor);
    const pixelY = Math.floor(actualY * scaleFactor);
    
    // 确保坐标在有效范围内
    if (pixelX < 0 || pixelX >= thumbnailSize.width || pixelY < 0 || pixelY >= thumbnailSize.height) {
      throw new Error('坐标超出范围');
    }
    
    const width = thumbnailSize.width;
    const pixelIndex = (pixelY * width + pixelX) * 4;
    
    if (bitmap && bitmap.length > pixelIndex + 3) {
      // Electron 的 getBitmap() 在 Windows 上返回 BGRA 格式
      const b = bitmap[pixelIndex];
      const g = bitmap[pixelIndex + 1];
      const r = bitmap[pixelIndex + 2];
      
      // 确保值在 0-255 范围内
      const rClamped = Math.max(0, Math.min(255, r));
      const gClamped = Math.max(0, Math.min(255, g));
      const bClamped = Math.max(0, Math.min(255, b));
      
      const rgbColor = `#${rClamped.toString(16).padStart(2, '0')}${gClamped.toString(16).padStart(2, '0')}${bClamped.toString(16).padStart(2, '0')}`;
      
      const resolve = colorPickResolve;
      colorPickResolve = null;
      
      if (colorPickerWin) {
        colorPickerWin.close();
        colorPickerWin = null;
      }
      
      resolve({ ok: true, color: rgbColor });
    } else {
      throw new Error('无法读取像素颜色');
    }
  } catch (err) {
    console.error('取色失败:', err);
    
    const resolve = colorPickResolve;
    colorPickResolve = null;
    
    if (colorPickerWin) {
      colorPickerWin.close();
      colorPickerWin = null;
    }
    
    resolve({ ok: false, error: String(err) });
  }
});

// 取消取色
ipcMain.on('color-picker-cancel', () => {
  if (!colorPickerWin || !colorPickResolve) return;
  
  const resolve = colorPickResolve;
  colorPickResolve = null;
  
  if (colorPickerWin) {
    colorPickerWin.close();
    colorPickerWin = null;
  }
  
  resolve({ ok: false, error: 'cancelled' });
});


  mainWin.on('closed', () => {
    mainWin = null;
  });
}

// 渲染层可调用的窗口控制（最小化/最大化或还原/关闭）
ipcMain.handle('window/minimize', (event) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender) || mainWin;
    if (win) win.minimize();
    try { event.sender.send('window/maxstate', win ? win.isMaximized() : false); } catch (e) {}
    return { ok: true };
  } catch (e) { return { ok: false, error: String(e) }; }
});

ipcMain.handle('window/toggleMax', (event) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender) || mainWin;
    if (!win) return { ok: false, error: 'no-window' };
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
    const maximized = win.isMaximized();
    try { event.sender.send('window/maxstate', maximized); } catch (e) {}
    return { ok: true, maximized };
  } catch (e) { return { ok: false, error: String(e) }; }
});

ipcMain.handle('window/close', (event) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender) || mainWin;
    if (win) win.close();
    return { ok: true };
  } catch (e) { return { ok: false, error: String(e) }; }
});

// 辅助函数：延迟执行
function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(true);
    }, ms);
  });
}

// 获取静默更新配置（默认为 false）
function getSilentUpdateEnabled() {
  if (!store) return false;
  return store.get('silentUpdateEnabled', false);
}

// 初始化自动更新
async function initAutoUpdater() {
  if (!autoUpdater) return;
  
  try {
    autoUpdater.disableWebInstaller = false;
    
    // 根据静默更新配置决定是否自动下载
    const silentUpdateEnabled = getSilentUpdateEnabled();
    autoUpdater.autoDownload = silentUpdateEnabled;
    // 确保更新安装后自动运行应用（无缝更新）
    autoUpdater.autoInstallOnAppQuit = true;
    console.log(`[main] 初始化自动更新，静默更新: ${silentUpdateEnabled ? '已启用' : '已禁用'}`);
    console.log(`[main] autoUpdater.autoDownload: ${autoUpdater.autoDownload}`);
    console.log(`[main] autoUpdater.autoInstallOnAppQuit: ${autoUpdater.autoInstallOnAppQuit}`);
    
    // 设置请求头，确保正确的 User-Agent
    autoUpdater.requestHeaders = {
      'User-Agent': `Metro-PIDS-App/${app.getVersion()} (${process.platform})`
    };
    
    // 开发环境下也允许检查更新
    // electron-updater 在开发模式下会使用 package.json 中的配置
    if (!app.isPackaged) {
      // 开发模式下，可以设置 channel 为 latest 或使用默认配置
      // autoUpdater.channel = 'latest';
      console.log('[main] 开发模式下初始化更新检查，将使用 package.json 中的 GitHub 配置');
    }
    
    // 错误处理
    autoUpdater.on('error', (err) => {
      const errorMsg = String(err);
      const errorDetails = {
        message: errorMsg,
        stack: err.stack,
        code: err.code,
        name: err.name
      };
      if (logger) {
        logger.error(['检查更新失败', errorDetails]);
      } else {
        console.error('检查更新失败:', errorDetails);
      }
      try { 
        mainWin && mainWin.webContents.send('update/error', errorMsg); 
      } catch (e) {}
    });
    
    // 有可用更新
    autoUpdater.on('update-available', (info) => {
      const currentVersion = app.getVersion();
      const silentUpdateEnabled = getSilentUpdateEnabled();
      
      if (logger) {
        logger.info('检查到有更新', { currentVersion, latestVersion: info.version, silentUpdate: silentUpdateEnabled });
        logger.info(info);
      } else {
        console.log('[main] 检查到有更新', { currentVersion, latestVersion: info.version, silentUpdate: silentUpdateEnabled });
      }
      
      // 输出详细信息用于调试
      console.log('[main] update-available 详细信息:', {
        version: info.version,
        currentVersion: currentVersion,
        releaseDate: info.releaseDate,
        path: info.path,
        silentUpdate: silentUpdateEnabled
      });
      
      // 如果启用了静默更新，自动开始下载
      if (silentUpdateEnabled && !autoUpdater.autoDownload) {
        console.log('[main] 静默更新已启用，自动开始下载更新...');
        // 由于 autoDownload 可能为 false，我们需要手动触发下载
        autoUpdater.downloadUpdate().catch(err => {
          console.error('[main] 静默下载更新失败:', err);
          if (logger) {
            logger.error('静默下载更新失败', err);
          }
        });
      }
      
      try { 
        // 通知渲染进程有更新可用（用于显示NEW标记）
        mainWin && mainWin.webContents.send('update/available', info);
        // 发送一个特殊事件来标记有更新（用于UI显示）
        mainWin && mainWin.webContents.send('update/has-update', { version: info.version, silentUpdate: silentUpdateEnabled });
      } catch (e) {
        console.error('[main] 发送 update-available 事件失败:', e);
      }
    });
    
    // 没有可用更新
    autoUpdater.on('update-not-available', (info) => {
      const currentVersion = app.getVersion();
      if (logger) {
        logger.info('没有可用更新', { currentVersion, info });
      } else {
        console.log('[main] 没有可用更新', { currentVersion, info });
      }
      
      // 输出详细信息用于调试
      console.log('[main] update-not-available 详细信息:', {
        version: info ? info.version : 'N/A',
        currentVersion: currentVersion,
        releaseDate: info ? info.releaseDate : 'N/A',
        path: info ? info.path : 'N/A',
        // 如果 info 中有 updateInfo，也输出
        updateInfo: info ? info.updateInfo : null
      });
      
      // 如果 info 为空或版本号相同，说明确实没有更新
      // 如果版本号不同但没有触发 update-available，可能是版本格式问题
      if (info && info.version) {
        console.log('[main] 版本对比:', {
          current: currentVersion,
          latest: info.version,
          areEqual: currentVersion === info.version,
          // 尝试比较去掉 'v' 前缀的版本
          currentClean: currentVersion.replace(/^v/, ''),
          latestClean: info.version.replace(/^v/, ''),
          areEqualClean: currentVersion.replace(/^v/, '') === info.version.replace(/^v/, '')
        });
      }
      
      try { 
        mainWin && mainWin.webContents.send('update/not-available', info || {}); 
      } catch (e) {
        console.error('[main] 发送 update-not-available 事件失败:', e);
      }
    });
    
    // 下载进度
    autoUpdater.on('download-progress', (progress) => {
      if (logger) {
        logger.info('下载进度:', progress);
      }
      try { 
        mainWin && mainWin.webContents.send('update/progress', progress); 
      } catch (e) {}
    });
    
    // 下载完成
    autoUpdater.on('update-downloaded', (info) => {
      const silentUpdateEnabled = getSilentUpdateEnabled();
      
      if (logger) {
        logger.info('下载完毕！提示安装更新', { silentUpdate: silentUpdateEnabled });
        logger.info(info);
      } else {
        console.log('[main] 下载完成', { version: info.version, silentUpdate: silentUpdateEnabled });
      }
      
      // 检查是否用户已经跳过了当前版本
      if (store) {
        const skippedVersion = store.get('skippedVersion');
        if (info && info.version === skippedVersion) {
          if (logger) {
            logger.info('用户已跳过此版本，不提示更新');
          }
          return;
        }
      }
      
      // 如果启用了静默更新，自动安装
      if (silentUpdateEnabled) {
        console.log('[main] 静默更新模式：下载完成，自动安装更新...');
        if (logger) {
          logger.info('静默更新：下载完成，自动安装更新', { version: info.version });
        }
        
        try {
          // 清除跳过的版本标记
          if (store) {
            store.delete('skippedVersion');
          }
          
          // 延迟一小段时间，确保下载完全完成，然后自动安装
          setTimeout(() => {
            try {
              console.log('[main] 执行自动安装更新...');
              // quitAndInstall(isSilent, isForceRunAfter)
              // isSilent: true = 静默安装（Windows 需要 NSIS 配置支持）
              // isForceRunAfter: true = 安装完成后自动运行应用
              autoUpdater.quitAndInstall(true, true);
              if (logger) {
                logger.info('已调用 quitAndInstall(true, true)，应用将退出并静默安装更新');
              }
            } catch (installErr) {
              console.error('[main] 自动安装更新失败:', installErr);
              if (logger) {
                logger.error('自动安装更新失败', installErr);
              }
              // 如果自动安装失败，发送通知给用户
              try {
                mainWin && mainWin.webContents.send('update/downloaded', info);
              } catch (e) {}
            }
          }, 1000); // 延迟 1 秒
        } catch (e) {
          console.error('[main] 静默更新自动安装处理失败:', e);
          if (logger) {
            logger.error('静默更新自动安装处理失败', e);
          }
          // 如果出错，发送通知给用户
          try {
            mainWin && mainWin.webContents.send('update/downloaded', info);
          } catch (sendErr) {}
        }
      } else {
        // 非静默模式，发送通知给用户
        try { 
          mainWin && mainWin.webContents.send('update/downloaded', info); 
        } catch (e) {}
      }
    });
  } catch (e) {
    if (logger) {
      logger.error('autoUpdater setup failed', e);
    } else {
      console.warn('autoUpdater setup failed', e);
    }
  }
}

// 检查并安装待安装的更新（应用启动时）
// 这个函数在 initAutoUpdater 之前调用，用于检测是否有待安装的更新
let startupUpdateHandler = null;

async function checkAndInstallPendingUpdate() {
  if (!autoUpdater) return false;
  
  try {
    console.log('[main] 检查是否有待安装的更新...');
    
    return new Promise((resolve) => {
      let timeoutId = null;
      let resolved = false;
      
      // 设置超时，避免无限等待
      timeoutId = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          if (startupUpdateHandler) {
            autoUpdater.removeListener('update-downloaded', startupUpdateHandler);
            startupUpdateHandler = null;
          }
          console.log('[main] 检查待安装更新超时，继续正常启动');
          resolve(false);
        }
      }, 3000); // 3秒超时
      
      // 监听 update-downloaded 事件（仅用于启动时检测）
      startupUpdateHandler = (info) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeoutId);
        
        if (startupUpdateHandler) {
          autoUpdater.removeListener('update-downloaded', startupUpdateHandler);
          startupUpdateHandler = null;
        }
        
        console.log('[main] 检测到待安装的更新:', info.version);
        if (logger) {
          logger.info('检测到待安装的更新，自动安装并重启', { version: info.version });
        }
        
        // 检查是否用户跳过了此版本
        if (store) {
          const skippedVersion = store.get('skippedVersion');
          if (info && info.version === skippedVersion) {
            console.log('[main] 用户已跳过此版本，不自动安装');
            resolve(false);
            return;
          }
        }
        
        // 清除跳过的版本标记
        if (store) {
          store.delete('skippedVersion');
        }
        
        // 延迟一小段时间，确保所有初始化完成，然后自动安装并重启
        setTimeout(() => {
          try {
            console.log('[main] 自动安装待安装的更新并重启应用...');
            if (logger) {
              logger.info('应用将退出并静默安装更新，安装完成后自动启动新版本');
            }
            // 静默安装并自动运行应用
            // quitAndInstall(isSilent, isForceRunAfter)
            // isSilent: true = 静默安装，不显示安装界面
            // isForceRunAfter: true = 安装完成后自动运行应用
            autoUpdater.quitAndInstall(true, true);
            resolve(true);
          } catch (e) {
            console.error('[main] 自动安装待安装的更新失败:', e);
            if (logger) {
              logger.error('自动安装待安装的更新失败', e);
            }
            resolve(false);
          }
        }, 800); // 延迟 800ms，确保初始化完成
      };
      
      autoUpdater.once('update-downloaded', startupUpdateHandler);
      
      // 触发检查更新，如果更新已下载，electron-updater 会立即触发 update-downloaded 事件
      autoUpdater.checkForUpdates().then(() => {
        // checkForUpdates 成功，但不代表有更新，等待事件触发
        console.log('[main] 检查更新请求已发送，等待响应...');
      }).catch(err => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeoutId);
          if (startupUpdateHandler) {
            autoUpdater.removeListener('update-downloaded', startupUpdateHandler);
            startupUpdateHandler = null;
          }
          // 检查更新失败不代表没有待安装的更新，继续正常启动
          console.log('[main] 检查更新失败（可能没有待安装的更新）:', err.message);
          resolve(false);
        }
      });
    });
  } catch (e) {
    console.error('[main] 检查待安装更新失败:', e);
    if (logger) {
      logger.error('检查待安装更新失败', e);
    }
    return false;
  }
}

app.whenReady().then(async () => {
  // 初始化预设线路文件（从 preset-lines 复制到默认文件夹）
  try {
    await initPresetLinesFromSource();
  } catch (e) {
    console.warn('[main] 初始化预设线路文件失败:', e);
  }
  
  // 在创建窗口之前检查并安装待安装的更新
  // 如果有待安装的更新，会自动安装并重启，不会创建窗口
  if (app.isPackaged && autoUpdater) {
    // 先进行基本的 autoUpdater 配置（不设置完整的事件监听器）
    try {
      autoUpdater.disableWebInstaller = false;
      autoUpdater.autoInstallOnAppQuit = true;
      // 设置请求头
      autoUpdater.requestHeaders = {
        'User-Agent': `Metro-PIDS-App/${app.getVersion()} (${process.platform})`
      };
    } catch (e) {
      console.error('[main] 初始化 autoUpdater 基本配置失败:', e);
    }
    
    // 检查是否有待安装的更新
    const hasPendingUpdate = await checkAndInstallPendingUpdate();
    if (hasPendingUpdate) {
      // 如果有待安装的更新，应用会退出并安装，不会执行后续代码
      // quitAndInstall 会立即退出应用，所以这里不会继续执行
      console.log('[main] 检测到待安装的更新，应用将退出并安装更新');
      return;
    }
  }
  
  createWindow();
  
  // 初始化自动更新（设置完整的事件监听器）
  await initAutoUpdater();
  
  // 延迟检查更新，确保窗口准备完成
  scheduleAutoUpdateCheck();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// 检查 Gitee 更新（自定义逻辑，因为 electron-updater 不支持 Gitee）
async function checkGiteeUpdate() {
  try {
    const https = require('https');
    const url = 'https://gitee.com/api/v5/repos/tanzhouxkong/Metro-PIDS-/releases';
    const currentVersion = app.getVersion().replace(/^v/, ''); // 移除可能的 v 前缀
    
    return new Promise((resolve, reject) => {
      https.get(url, {
        headers: {
          'User-Agent': 'Metro-PIDS-App',
          'Accept': 'application/json'
        }
      }, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const releases = JSON.parse(data);
            if (!Array.isArray(releases) || releases.length === 0) {
              resolve({ ok: true, hasUpdate: false, reason: 'no-releases' });
              return;
            }
            
            // 获取最新的非预发布版本
            const latestRelease = releases.find(r => !r.prerelease) || releases[0];
            if (!latestRelease || !latestRelease.tag_name) {
              resolve({ ok: true, hasUpdate: false, reason: 'no-valid-release' });
              return;
            }
            
            const latestVersion = latestRelease.tag_name.replace(/^v/, '');
            const needsUpdate = latestVersion !== currentVersion;
            
            console.log('[main] Gitee 更新检查:', {
              current: currentVersion,
              latest: latestVersion,
              needsUpdate: needsUpdate
            });
            
            if (needsUpdate) {
              // 检查是否启用了静默更新
              const silentUpdateEnabled = getSilentUpdateEnabled();
              
              // 发送更新可用事件
              try {
                const updateInfo = {
                  version: latestVersion,
                  releaseDate: latestRelease.created_at,
                  releaseNotes: latestRelease.body,
                  releaseUrl: latestRelease.html_url || `https://gitee.com/tanzhouxkong/Metro-PIDS-/releases/${latestRelease.tag_name}`,
                  assets: latestRelease.assets || []
                };
                mainWin && mainWin.webContents.send('update/available', updateInfo);
                mainWin && mainWin.webContents.send('update/has-update', { version: latestVersion, silentUpdate: silentUpdateEnabled });
                
                // 如果启用了静默更新，自动触发下载（通过调用 update/download IPC）
                if (silentUpdateEnabled) {
                  console.log('[main] Gitee 静默更新已启用，自动开始下载更新...');
                  // 注意：Gitee 的下载需要通过自定义逻辑实现，这里只是触发事件通知前端
                  // 前端可以监听 update/available 事件，如果 silentUpdate 为 true，则自动调用 downloadUpdate
                }
              } catch (e) {
                console.error('[main] 发送 Gitee 更新事件失败:', e);
              }
              
              resolve({ ok: true, hasUpdate: true, version: latestVersion, release: latestRelease, silentUpdate: silentUpdateEnabled });
            } else {
              // 发送无更新事件
              try {
                mainWin && mainWin.webContents.send('update/not-available', { version: currentVersion });
              } catch (e) {}
              resolve({ ok: true, hasUpdate: false, reason: 'already-latest' });
            }
          } catch (e) {
            console.error('[main] 解析 Gitee Releases 失败:', e);
            reject(new Error('解析失败: ' + String(e)));
          }
        });
      }).on('error', (err) => {
        console.error('[main] 获取 Gitee Releases 失败:', err);
        reject(err);
      });
    });
  } catch (e) {
    throw new Error('检查 Gitee 更新失败: ' + String(e));
  }
}

// 供渲染层触发更新动作的 IPC
ipcMain.handle('update/check', async () => {
  console.log('[main] update/check: 收到检查更新请求');
  
  const updateSource = getUpdateSource();
  console.log('[main] update/check: 更新源:', updateSource);
  
  // 如果使用 Gitee，使用自定义检查逻辑
  if (updateSource === 'gitee') {
    try {
      const result = await checkGiteeUpdate();
      return { ok: true, source: 'gitee', ...result };
    } catch (e) {
      const errorDetails = {
        message: String(e),
        stack: e.stack,
        code: e.code,
        name: e.name
      };
      console.error('[main] Gitee update/check error:', errorDetails);
      if (logger) {
        logger.error('Gitee update/check error:', errorDetails);
      }
      
      try {
        mainWin && mainWin.webContents.send('update/error', String(e));
      } catch (sendErr) {
        console.error('[main] 发送更新错误事件失败:', sendErr);
      }
      
      return { ok: false, error: String(e), source: 'gitee' };
    }
  }
  
  // 使用 GitHub（electron-updater）
  console.log('[main] update/check: autoUpdater 状态:', autoUpdater ? '已加载' : '未加载');
  console.log('[main] update/check: app.isPackaged:', app.isPackaged);
  
  // 开发模式下也允许检查更新
  if (!app.isPackaged) {
    console.log('[main] update/check: 当前为开发模式，将检查 GitHub releases 是否有新版本');
    // 开发模式下，electron-updater 会使用 package.json 中的配置来检查更新
  }
  
  if (!autoUpdater) {
    console.error('[main] update/check: autoUpdater is null');
    console.error('[main] update/check: 尝试重新加载 electron-updater...');
    
    // 尝试重新加载
    try {
      delete require.cache[require.resolve('electron-updater')];
      const updater = require('electron-updater');
      autoUpdater = updater.autoUpdater;
      console.log('[main] update/check: 重新加载成功，autoUpdater:', autoUpdater ? '已加载' : '未加载');
      
      if (autoUpdater) {
        // 重新初始化配置
        autoUpdater.disableWebInstaller = false;
        const silentUpdateEnabled = getSilentUpdateEnabled();
        autoUpdater.autoDownload = silentUpdateEnabled;
        if (logger) {
          autoUpdater.logger = logger;
        }
        // 重新绑定事件监听（如果之前已经绑定过，这里会重复绑定，但不影响功能）
        await initAutoUpdater();
      }
    } catch (e) {
      console.error('[main] update/check: 重新加载失败:', e);
      console.error('[main] update/check: 错误详情:', {
        message: e.message,
        stack: e.stack,
        code: e.code
      });
    }
    
    if (!autoUpdater) {
      return { ok: false, error: 'autoUpdater 未加载，请确保应用已正确打包' };
    }
  }
  
  try {
    console.log('[main] update/check: checking for updates...');
    console.log('[main] app.getVersion():', app.getVersion());
    
    // 检查更新配置
    if (autoUpdater.config) {
      console.log('[main] updater config:', {
        provider: autoUpdater.config.provider,
        owner: autoUpdater.config.owner,
        repo: autoUpdater.config.repo,
        channel: autoUpdater.config.channel
      });
    } else {
      if (app.isPackaged) {
        console.warn('[main] updater config 为空，将使用 app-update.yml 中的配置');
      } else {
        console.log('[main] 开发模式：将使用 package.json 中的 build.publish 配置检查更新');
        console.log('[main] GitHub 仓库:', 'tanzhouxkong/Metro-PIDS-');
      }
    }
    
    // 强制刷新更新检查
    // electron-updater 会在每次 checkForUpdates 时自动检查 GitHub releases
    // 但为了确保获取最新信息，我们使用 checkForUpdates() 而不是缓存的检查结果
    console.log('[main] 开始检查 GitHub releases...');
    const checkPromise = autoUpdater.checkForUpdates();
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('检查更新超时（30秒）')), 30000)
    );
    
    const result = await Promise.race([checkPromise, timeoutPromise]);
    console.log('[main] checkForUpdates result:', result);
    
    // 输出详细信息用于调试
    if (result && result.updateInfo) {
      console.log('[main] 检查到的更新信息:', {
        version: result.updateInfo.version,
        releaseDate: result.updateInfo.releaseDate,
        path: result.updateInfo.path,
        sha512: result.updateInfo.sha512
      });
      console.log('[main] 当前应用版本:', app.getVersion());
      console.log('[main] 版本比较:', {
        current: app.getVersion(),
        latest: result.updateInfo.version,
        needsUpdate: result.updateInfo.version !== app.getVersion()
      });
    }
    
    // 如果返回了 result，说明检查已完成，但事件可能稍后触发
    // 所以这里只返回成功，实际结果通过事件通知
    return { ok: true, source: 'github' };
  } catch (e) {
    const errorDetails = {
      message: String(e),
      stack: e.stack,
      code: e.code,
      name: e.name
    };
    console.error('[main] update/check error:', errorDetails);
    if (logger) {
      logger.error('update/check error:', errorDetails);
    }
    
    // 尝试发送错误事件给渲染进程
    try {
      mainWin && mainWin.webContents.send('update/error', String(e));
    } catch (sendErr) {
      console.error('[main] 发送更新错误事件失败:', sendErr);
    }
    
    return { ok: false, error: String(e), source: 'github' };
  }
});

// 清除所有可能的缓存目录
async function clearUpdaterCache() {
  const os = require('os');
  const platform = process.platform;
  const cacheDirs = [];
  
  if (platform === 'win32') {
    cacheDirs.push(path.join(os.homedir(), 'AppData', 'Local', 'metro-pids-updater'));
    cacheDirs.push(path.join(app.getPath('userData'), 'metro-pids-updater'));
    cacheDirs.push(path.join(os.homedir(), 'AppData', 'Roaming', 'metro-pids-updater'));
    // electron-updater 默认缓存位置（基于 appId）
    cacheDirs.push(path.join(os.homedir(), 'AppData', 'Local', 'com.Metro-PIDS.myapp-updater'));
    if (autoUpdater && autoUpdater.config && autoUpdater.config.cacheDir) {
      cacheDirs.push(autoUpdater.config.cacheDir);
    }
  } else if (platform === 'darwin') {
    cacheDirs.push(path.join(os.homedir(), 'Library', 'Caches', 'metro-pids-updater'));
    cacheDirs.push(path.join(os.homedir(), 'Library', 'Application Support', 'metro-pids-updater'));
    cacheDirs.push(path.join(os.homedir(), 'Library', 'Caches', 'com.Metro-PIDS.myapp-updater'));
    if (autoUpdater && autoUpdater.config && autoUpdater.config.cacheDir) {
      cacheDirs.push(autoUpdater.config.cacheDir);
    }
  } else {
    cacheDirs.push(path.join(os.homedir(), '.cache', 'metro-pids-updater'));
    cacheDirs.push(path.join(os.homedir(), '.cache', 'com.Metro-PIDS.myapp-updater'));
    if (autoUpdater && autoUpdater.config && autoUpdater.config.cacheDir) {
      cacheDirs.push(autoUpdater.config.cacheDir);
    }
  }
  
  let clearedCount = 0;
  for (const cacheDir of cacheDirs) {
    try {
      if (fs.existsSync(cacheDir)) {
        console.log(`[main] 清除缓存目录: ${cacheDir}`);
        await fsPromises.rm(cacheDir, { recursive: true, force: true });
        clearedCount++;
      }
    } catch (dirErr) {
      console.warn(`[main] 清除缓存目录失败 ${cacheDir}:`, dirErr);
    }
  }
  
  return clearedCount;
}

ipcMain.handle('update/download', async () => {
  if (!autoUpdater) return { ok: false, error: 'no-updater' };
  
  const maxRetries = 3;
  let lastError = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[main] update/download: 开始下载更新... (尝试 ${attempt}/${maxRetries})`);
      
      // 如果是重试，先清除之前的下载缓存
      if (attempt > 1) {
        console.log('[main] update/download: 清除之前的下载缓存...');
        const clearedCount = await clearUpdaterCache();
        if (clearedCount > 0) {
          console.log(`[main] update/download: 已清除 ${clearedCount} 个缓存目录`);
          // 等待确保缓存清理完成
          await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
          console.log('[main] update/download: 未找到缓存目录');
        }
      }
      
      // 使用 Promise 来捕获错误事件和异常
      const downloadPromise = new Promise((resolve, reject) => {
        let downloadError = null;
        let downloaded = false;
        let timeout = null;
        
        // 监听下载进度，用于诊断
        let lastProgressPercent = 0;
        const progressHandler = (progress) => {
          const percent = Math.round(progress.percent || 0);
          if (percent !== lastProgressPercent && percent % 10 === 0) {
            // 每10%记录一次日志
            console.log(`[main] update/download: 下载进度 ${percent}% (${progress.transferred || 0}/${progress.total || 0} bytes)`);
            lastProgressPercent = percent;
          }
        };
        
        // 清理函数
        const cleanup = () => {
          if (timeout) clearTimeout(timeout);
          try {
            autoUpdater.removeListener('error', errorHandler);
            autoUpdater.removeListener('update-downloaded', downloadedHandler);
            autoUpdater.removeListener('download-progress', progressHandler);
          } catch (e) {}
        };
        
        // 监听错误事件（注意：error 事件可能会在下载过程中多次触发）
        const errorHandler = (err) => {
          const errorMsg = String(err);
          console.error('[main] update/download: 收到错误事件:', errorMsg);
          console.error('[main] update/download: 错误对象详情:', {
            message: err.message,
            stack: err.stack,
            code: err.code,
            name: err.name,
            errno: err.errno,
            syscall: err.syscall
          });
          
          // 如果是校验和错误，标记为需要重试
          if (errorMsg.includes('checksum') || errorMsg.includes('sha512')) {
            downloadError = new Error(errorMsg);
            downloadError.isChecksumError = true;
            cleanup();
            reject(downloadError);
          } else {
            downloadError = new Error(errorMsg);
          }
        };
        
        // 监听下载完成事件
        const downloadedHandler = (info) => {
          downloaded = true;
          console.log('[main] update/download: 收到下载完成事件:', info);
          cleanup();
          resolve(info);
        };
        
        // 设置超时（10分钟，给大文件下载更多时间）
        timeout = setTimeout(() => {
          cleanup();
          reject(new Error('下载超时（10分钟）'));
        }, 10 * 60 * 1000);
        
        // 绑定事件监听器（使用 once 确保只触发一次）
        autoUpdater.once('error', errorHandler);
        autoUpdater.once('update-downloaded', downloadedHandler);
        autoUpdater.on('download-progress', progressHandler);
        
        // 开始下载
        autoUpdater.downloadUpdate().then(() => {
          // downloadUpdate 返回的 Promise 通常只表示开始下载，不表示完成
          // 真正的完成和错误通过事件通知
          console.log('[main] update/download: downloadUpdate() 调用完成，等待事件...');
        }).catch((err) => {
          cleanup();
          reject(err);
        });
      });
      
      await downloadPromise;
      console.log('[main] update/download: 下载完成');
      return { ok: true };
    } catch (e) {
      lastError = e;
      const errorMsg = String(e);
      const isChecksumError = errorMsg.includes('checksum') || errorMsg.includes('sha512') || e.isChecksumError;
      
      console.error(`[main] update/download: 下载失败 (尝试 ${attempt}/${maxRetries}):`, errorMsg);
      console.error('[main] update/download: 错误详情:', {
        message: e.message,
        stack: e.stack,
        code: e.code,
        name: e.name,
        isChecksumError: isChecksumError
      });
      
      if (isChecksumError && attempt < maxRetries) {
        console.log(`[main] update/download: 检测到校验和错误，将在 ${attempt * 2} 秒后重试...`);
        // 通知渲染进程正在重试
        try {
          mainWin && mainWin.webContents.send('update/progress', { 
            percent: 0, 
            retrying: true, 
            attempt: attempt + 1,
            maxRetries: maxRetries
          });
        } catch (sendErr) {}
        
        await new Promise(resolve => setTimeout(resolve, attempt * 2000)); // 递增延迟：2秒、4秒
        continue;
      }
      
      // 如果不是校验和错误，或者已经达到最大重试次数，直接返回错误
      if (logger) {
        logger.error('下载更新失败', {
          attempt,
          maxRetries,
          message: errorMsg,
          stack: e.stack,
          code: e.code,
          name: e.name,
          isChecksumError: isChecksumError
        });
      }
      
      // 如果是最后一次尝试，返回详细错误
      if (attempt === maxRetries) {
        return { 
          ok: false, 
          error: errorMsg,
          attempts: attempt,
          isChecksumError: isChecksumError
        };
      }
    }
  }
  
  // 理论上不会到达这里，但为了安全起见
  return { ok: false, error: lastError ? String(lastError) : '未知错误' };
});

// 清除更新缓存并重新下载
ipcMain.handle('update/clear-cache-and-download', async () => {
  if (!autoUpdater) return { ok: false, error: 'no-updater' };
  try {
    console.log('[main] update/clear-cache-and-download: 清除缓存并重新下载...');
    
    // 清除所有缓存
    const clearedCount = await clearUpdaterCache();
    if (clearedCount > 0) {
      console.log(`[main] 已清除 ${clearedCount} 个缓存目录`);
    } else {
      console.log('[main] 未找到缓存目录');
    }
    
    // 等待确保缓存清理完成
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 重新下载（这里不使用重试循环，因为用户主动触发的）
    await autoUpdater.downloadUpdate();
    console.log('[main] update/clear-cache-and-download: 重新下载完成');
    return { ok: true };
  } catch (e) {
    const errorMsg = String(e);
    console.error('[main] update/clear-cache-and-download: 失败:', errorMsg);
    
    if (logger) {
      logger.error('清除缓存并重新下载失败', {
        message: errorMsg,
        stack: e.stack,
        code: e.code,
        name: e.name
      });
    }
    
    return { ok: false, error: errorMsg };
  }
});

ipcMain.handle('update/install', async () => {
  if (!autoUpdater) return { ok: false, error: 'no-updater' };
  try {
    // 安装的时候如果设置过 skippedVersion, 需要清除掉
    if (store) {
      store.delete('skippedVersion');
    }
    
    if (logger) {
      logger.info('退出应用，开始静默安装更新！');
    }
    
    // quitAndInstall(isSilent, isForceRunAfter)
    // isSilent: true = 静默安装（Windows NSIS 使用 /S 参数，不显示安装界面）
    // isForceRunAfter: true = 安装完成后自动运行应用
    // 这样用户只需重启应用即可完成更新，无需走安装流程
    autoUpdater.quitAndInstall(true, true);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

// 获取 GitHub Releases 列表（用于显示更新日志）
ipcMain.handle('github/get-releases', async () => {
  try {
    const https = require('https');
    const url = 'https://api.github.com/repos/tanzhouxkong/Metro-PIDS-/releases';
    
    return new Promise((resolve) => {
      https.get(url, {
        headers: {
          'User-Agent': 'Metro-PIDS-App',
          'Accept': 'application/vnd.github.v3+json'
        }
      }, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const releases = JSON.parse(data);
            // 只返回前10个最新的release
            const recentReleases = releases.slice(0, 10).map(release => ({
              tag_name: release.tag_name,
              name: release.name,
              body: release.body,
              published_at: release.published_at,
              html_url: release.html_url,
              prerelease: release.prerelease,
              draft: release.draft
            }));
            resolve({ ok: true, releases: recentReleases });
          } catch (e) {
            console.error('[main] 解析 GitHub Releases 失败:', e);
            resolve({ ok: false, error: '解析失败: ' + String(e) });
          }
        });
      }).on('error', (err) => {
        console.error('[main] 获取 GitHub Releases 失败:', err);
        resolve({ ok: false, error: String(err) });
      });
    });
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

// 获取 Gitee Releases 列表（用于显示更新日志和检查更新）
ipcMain.handle('gitee/get-releases', async () => {
  try {
    const https = require('https');
    // Gitee API v5: GET /api/v5/repos/{owner}/{repo}/releases
    const url = 'https://gitee.com/api/v5/repos/tanzhouxkong/Metro-PIDS-/releases';
    
    return new Promise((resolve) => {
      https.get(url, {
        headers: {
          'User-Agent': 'Metro-PIDS-App',
          'Accept': 'application/json'
        }
      }, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const releases = JSON.parse(data);
            // Gitee API 返回格式与 GitHub 略有不同，进行适配
            // 只返回前10个最新的release
            const recentReleases = releases.slice(0, 10).map(release => ({
              tag_name: release.tag_name,
              name: release.name,
              body: release.body,
              published_at: release.created_at || release.published_at, // Gitee 使用 created_at
              html_url: release.html_url || `https://gitee.com/tanzhouxkong/Metro-PIDS-/releases/${release.tag_name}`,
              prerelease: release.prerelease || false,
              draft: release.draft || false,
              assets: release.assets || [] // 包含下载文件信息
            }));
            resolve({ ok: true, releases: recentReleases });
          } catch (e) {
            console.error('[main] 解析 Gitee Releases 失败:', e);
            resolve({ ok: false, error: '解析失败: ' + String(e) });
          }
        });
      }).on('error', (err) => {
        console.error('[main] 获取 Gitee Releases 失败:', err);
        resolve({ ok: false, error: String(err) });
      });
    });
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

// 检查更新源配置（从存储中读取，默认为 'github'）
function getUpdateSource() {
  if (!store) return 'github';
  return store.get('updateSource', 'github'); // 'github' 或 'gitee'
}

// 设置更新源配置
ipcMain.handle('update/set-source', async (event, source) => {
  if (!store) return { ok: false, error: 'no-store' };
  if (source !== 'github' && source !== 'gitee') {
    return { ok: false, error: 'invalid-source' };
  }
  store.set('updateSource', source);
  console.log(`[main] 更新源已设置为: ${source}`);
  return { ok: true };
});

// 获取更新源配置
ipcMain.handle('update/get-source', async () => {
  return { ok: true, source: getUpdateSource() };
});

// 设置静默更新配置
ipcMain.handle('update/set-silent', async (event, enabled) => {
  if (!store) return { ok: false, error: 'no-store' };
  const silentEnabled = Boolean(enabled);
  store.set('silentUpdateEnabled', silentEnabled);
  console.log(`[main] 静默更新已${silentEnabled ? '启用' : '禁用'}`);
  
  // 如果启用了静默更新，更新 autoUpdater 配置
  if (autoUpdater) {
    autoUpdater.autoDownload = silentEnabled;
    console.log(`[main] autoUpdater.autoDownload 已设置为: ${silentEnabled}`);
  }
  
  return { ok: true };
});

// 获取静默更新配置
ipcMain.handle('update/get-silent', async () => {
  return { ok: true, enabled: getSilentUpdateEnabled() };
});

// 跳过版本更新
ipcMain.handle('update/skip-version', async (event, version) => {
  if (store && version) {
    store.set('skippedVersion', version);
    if (logger) {
      logger.info('用户跳过版本:', version);
    }
    return { ok: true };
  }
  return { ok: false, error: 'no-store-or-version' };
});

// 自动检查更新：启动时执行（包括开发环境）
async function scheduleAutoUpdateCheck() {
  if (!autoUpdater) {
    console.log('[main] scheduleAutoUpdateCheck: autoUpdater is null');
    return;
  }
  
  // 开发环境和打包环境都执行自动检查
  console.log('[main] scheduleAutoUpdateCheck: 准备检查更新 (开发模式:', !app.isPackaged, ')');
  
  console.log('[main] scheduleAutoUpdateCheck: starting...');
  console.log('[main] app version:', app.getVersion());
  
  // 等待 3 秒再检查更新，确保窗口准备完成，用户进入系统
  await sleep(3000);
  
  try {
    console.log('[main] scheduleAutoUpdateCheck: calling checkForUpdates...');
    const result = await autoUpdater.checkForUpdates();
    console.log('[main] scheduleAutoUpdateCheck: result:', result);
  } catch (err) {
    const errorDetails = {
      message: String(err),
      stack: err.stack,
      code: err.code,
      name: err.name
    };
    if (logger) {
      logger.error('自动检查更新失败:', errorDetails);
    } else {
      console.error('[main] 自动检查更新失败:', errorDetails);
    }
    try { 
      mainWin && mainWin.webContents.send('update/error', String(err)); 
    } catch (e) {}
  }
}

function createDisplayWindow(width, height, displayId = 'display-1') {
  // 检查是否已存在该显示端窗口
  if (displayWindows.has(displayId)) {
    const existingWin = displayWindows.get(displayId);
    if (existingWin && !existingWin.isDestroyed()) {
      try {
        if (typeof width === 'number' && typeof height === 'number') {
          existingWin.setSize(Math.max(100, Math.floor(width)), Math.max(100, Math.floor(height)));
        }
        existingWin.focus();
      } catch (e) {
        // 忽略尺寸设置异常
      }
      return existingWin;
    } else {
      // 清理已销毁的窗口引用
      displayWindows.delete(displayId);
    }
  }

  // 计算适配缩放后的窗口尺寸
  // 始终使用内容尺寸（1900x600）作为窗口的逻辑尺寸，确保在所有缩放比例下显示内容一致
  // 无论系统缩放是多少（100%, 125%, 150%, 200%, 250%, 300%等），窗口逻辑尺寸都保持1900×600
  const contentWidth = 1900;
  const contentHeight = 600;
  
  // 窗口逻辑尺寸始终与内容尺寸一致，不受系统缩放影响
  // 这样可以确保在所有缩放比例下，显示的内容范围都是一样的
  let logicalWidth, logicalHeight;
  if (typeof width === 'number' && typeof height === 'number') {
    // 如果传入了尺寸参数，使用传入的尺寸
    logicalWidth = Math.max(100, Math.floor(width));
    logicalHeight = Math.max(100, Math.floor(height));
  } else {
    // 始终使用内容尺寸，不受系统缩放影响
    logicalWidth = contentWidth;
    logicalHeight = contentHeight;
  }
  
  // 确保尺寸为4的倍数，以避免在高DPI下的渲染问题
  const adjustedWidth = Math.ceil(logicalWidth / 4) * 4;
  const adjustedHeight = Math.ceil(logicalHeight / 4) * 4;

  // 使用方案二：隐藏默认标题栏，显示系统窗口控制按钮
  const isWindows = process.platform === 'win32';
  const isMacOS = process.platform === 'darwin';
  const isLinux = process.platform === 'linux';
  
  // Linux 不支持自定义标题栏，使用系统默认标题栏
  let opts;
  if (isLinux) {
    opts = {
      width: adjustedWidth,
      height: adjustedHeight,
      useContentSize: false,
      frame: true, // Linux 使用系统框架
      resizable: false,
      maximizable: false, // 禁用最大化
      show: true,
      skipTaskbar: false,
      title: `Metro PIDS - ${displayId}`,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        zoomFactor: 1.0,
        enableBlinkFeatures: ''
      }
    };
  } else {
    // Windows 和 MacOS 使用自定义标题栏
    opts = {
      width: adjustedWidth,
      height: adjustedHeight,
      useContentSize: false,
      frame: false, // 隐藏默认框架
      transparent: false, // 确保不透明，避免黑屏
      backgroundColor: '#090d12', // 设置背景色，与显示窗口的深色背景一致
      resizable: false,
      maximizable: false, // 禁用最大化
      show: false, // 先不显示，等 ready-to-show 事件后再显示
      skipTaskbar: false,
      title: `Metro PIDS - ${displayId}`,
      // 隐藏默认标题栏，但保留系统窗口控制按钮
      titleBarStyle: 'hidden',
      // 显示系统自带窗口控制按钮
      titleBarOverlay: {
        color: isWindows ? 'rgba(0, 0, 0, 0)' : undefined, // Windows 设置为透明，MacOS 不需要
        symbolColor: isWindows ? '#2d3436' : undefined, // Windows 控制按钮颜色（与控制面板一致，使用黑色）
        height: 35 // 控制按钮高度，与自定义标题栏高度一致
      },
      // 顶级窗口（无父级），以独立原生窗口呈现
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        // 禁用自动缩放，使用CSS transform来控制缩放
        zoomFactor: 1.0,
        // 允许高DPI支持
        enableBlinkFeatures: ''
      }
    };
  }

  const displayWin = new BrowserWindow(opts);

  // 根据显示端ID选择不同的HTML文件
  let dispPath;
  
  // 尝试从store中读取显示端配置
  let displayConfig = null;
  if (store) {
    try {
      const settings = store.get('settings', {});
      const displays = settings.display?.displays || {};
      displayConfig = displays[displayId];
    } catch (e) {
      console.warn('[main] 读取显示端配置失败:', e);
    }
  }
  
  // 如果配置了本地文件路径（source为builtin且url存在），使用该路径
  if (displayConfig && displayConfig.source === 'builtin' && displayConfig.url) {
    // 检查文件是否存在
    if (fs.existsSync(displayConfig.url)) {
      dispPath = `file://${path.resolve(displayConfig.url)}`;
    } else {
      console.warn(`[main] 配置的本地文件不存在: ${displayConfig.url}，使用默认路径`);
      // 回退到默认路径
      if (displayId === 'display-1') {
        dispPath = `file://${path.join(__dirname, 'display_window.html')}`;
      } else {
        const customPath = path.join(__dirname, 'displays', displayId, 'display_window.html');
        if (fs.existsSync(customPath)) {
          dispPath = `file://${customPath}`;
        } else {
          dispPath = `file://${path.join(__dirname, 'display_window.html')}`;
        }
      }
    }
  } else if (displayId === 'display-1') {
    dispPath = `file://${path.join(__dirname, 'display_window.html')}`;
  } else {
    // 检查是否存在对应的显示端文件
    const customPath = path.join(__dirname, 'displays', displayId, 'display_window.html');
    if (fs.existsSync(customPath)) {
      dispPath = `file://${customPath}`;
    } else {
      // 如果不存在，使用默认显示端
      dispPath = `file://${path.join(__dirname, 'display_window.html')}`;
    }
  }

  // 在窗口准备好后再显示，避免黑屏
  displayWin.once('ready-to-show', () => {
    displayWin.show();
    // 在开发模式下自动打开开发者工具
    if (!app.isPackaged) {
      displayWin.webContents.openDevTools();
    }
  });
  
  displayWin.loadURL(dispPath);
  
  // 确保缩放因子始终为1.0，禁用Electron的自动缩放
  displayWin.webContents.setZoomFactor(1.0);
  
  // 监听缩放变化事件，确保始终保持1.0缩放
  displayWin.webContents.on('did-finish-load', () => {
    displayWin.webContents.setZoomFactor(1.0);
  });
  
  // 监听窗口显示事件，再次确保缩放正确
  displayWin.on('show', () => {
    displayWin.webContents.setZoomFactor(1.0);
  });
  
  // 添加快捷键支持：F12 或 Ctrl+Shift+I (Windows/Linux) / Cmd+Option+I (MacOS) 切换开发者工具
  displayWin.webContents.on('before-input-event', (event, input) => {
    // F12 键
    if (input.key === 'F12') {
      if (displayWin.webContents.isDevToolsOpened()) {
        displayWin.webContents.closeDevTools();
      } else {
        displayWin.webContents.openDevTools();
      }
      event.preventDefault();
      return;
    }
    
    // Ctrl+Shift+I (Windows/Linux) 或 Cmd+Option+I (MacOS)
    const isMac = process.platform === 'darwin';
    const isCtrlShiftI = !isMac && input.control && input.shift && input.key === 'I';
    const isCmdOptionI = isMac && input.meta && input.alt && input.key === 'I';
    
    if (isCtrlShiftI || isCmdOptionI) {
      if (displayWin.webContents.isDevToolsOpened()) {
        displayWin.webContents.closeDevTools();
      } else {
        displayWin.webContents.openDevTools();
      }
      event.preventDefault();
      return;
    }
  });

  // 窗口关闭时清理引用
  displayWin.on('closed', () => {
    displayWindows.delete(displayId);
  });

  // 存储窗口引用
  displayWindows.set(displayId, displayWin);

  return displayWin;
}

// 辅助：显示带模糊背景的自定义 Electron 警告/确认弹窗
function showElectronAlert({ parent, type = 'alert', title = '提示', msg = '' } = {}) {
  return new Promise((resolve, reject) => {
    try {
      const modal = new BrowserWindow({
        parent: parent || null,
        modal: !!parent,
        width: 680,
        height: 420,
        resizable: false,
        minimizable: false,
        maximizable: false,
        frame: true,
        show: false,
        transparent: false,
        webPreferences: {
          preload: path.join(__dirname, 'preload.js'),
          contextIsolation: true,
          nodeIntegration: true
        }
      });

      const id = Date.now().toString(36) + Math.floor(Math.random()*1000).toString(36);
      const url = `file://${path.join(__dirname, 'electron_alert.html')}?id=${encodeURIComponent(id)}&type=${encodeURIComponent(type)}&title=${encodeURIComponent(title)}&msg=${encodeURIComponent(msg)}`;

      let _blurApplied = false;
      const applyParentBlur = (enable) => {
        try {
          if (!parent) return;
          if (typeof parent.setVisualEffectState === 'function') {
            parent.setVisualEffectState(enable ? 'active' : 'inactive');
            _blurApplied = enable;
            return;
          }
          if (process.platform === 'darwin' && typeof parent.setVibrancy === 'function') {
            parent.setVibrancy(enable ? 'fullscreen-ui' : 'none');
            _blurApplied = enable;
            return;
          }
          if (process.platform === 'win32' && typeof parent.setBackgroundMaterial === 'function') {
            parent.setBackgroundMaterial(enable ? 'acrylic' : 'mica');
            _blurApplied = enable;
            return;
          }
        } catch (e) {
      // 忽略
        }
      };

      const cleanup = () => {
        try { modal.removeAllListeners(); } catch (e) {}
        try { applyParentBlur(false); } catch (e) {}
      };

      const responseHandler = (event, data) => {
        try {
          if (!data || data.id !== id) return;
          cleanup();
          try { modal.close(); } catch (e) {}
          resolve(!!data.result);
        } catch (e) {
          cleanup();
          try { modal.close(); } catch (e) {}
          resolve(false);
        }
      };

      ipcMain.once('electron-alert-response', responseHandler);

      modal.once('ready-to-show', () => {
        try { applyParentBlur(true); } catch (e) {}
        try { modal.show(); } catch (e) {}
      });

      modal.on('closed', () => {
        // 若未返回结果即关闭，视为取消/false
        try { ipcMain.removeListener('electron-alert-response', responseHandler); } catch (e) {}
        try { applyParentBlur(false); } catch (e) {}
        resolve(false);
      });

      modal.loadURL(url).catch((e) => {
        try { ipcMain.removeListener('electron-alert-response', responseHandler); } catch (e) {}
        try { modal.close(); } catch (e) {}
        reject(e);
      });
    } catch (err) {
      reject(err);
    }
  });
}

// 创建线路管理器窗口
function createLineManagerWindow() {
  if (lineManagerWin && !lineManagerWin.isDestroyed()) {
    lineManagerWin.focus();
    return;
  }
  
  lineManagerWin = new BrowserWindow({
    width: 900,
    height: 600,
    minWidth: 700,
    minHeight: 500,
    frame: true, // 使用系统框架，保留系统窗口控制按钮
    transparent: false,
    resizable: true,
    titleBarOverlay: process.platform === 'win32' ? {
      color: '#f0f2f5', // 浅色主题背景色
      symbolColor: '#2d3436', // 符号颜色
      height: 32 // 标题栏高度
    } : undefined,
    // 移除 parent，使其成为独立窗口
    // 移除 skipTaskbar，使其在任务栏显示
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    },
    show: false
  });

  const lineManagerPath = `file://${path.join(__dirname, 'line_manager_window.html')}`;
  lineManagerWin.loadURL(lineManagerPath);

  lineManagerWin.once('ready-to-show', () => {
    lineManagerWin.show();
    if (!app.isPackaged) {
      lineManagerWin.webContents.openDevTools();
    }
  });

  lineManagerWin.on('closed', () => {
    lineManagerWin = null;
  });
}

// 创建开发者窗口
function createDevWindow() {
  if (devWin && !devWin.isDestroyed()) {
    devWin.focus();
    return;
  }
  
  devWin = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    frame: true,
    transparent: false,
    resizable: true,
    titleBarOverlay: process.platform === 'win32' ? {
      color: '#f0f2f5',
      symbolColor: '#2d3436',
      height: 32
    } : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    },
    show: false
  });

  const devPath = `file://${path.join(__dirname, 'dev_window.html')}`;
  devWin.loadURL(devPath);

  devWin.once('ready-to-show', () => {
    devWin.show();
    if (!app.isPackaged) {
      devWin.webContents.openDevTools();
    }
  });

  devWin.on('closed', () => {
    devWin = null;
  });
}

// 处理线路管理器的线路切换请求
ipcMain.handle('line-manager/switch-line', async (event, lineName) => {
  try {
    // 通知主窗口切换线路，同时传递 target 信息（如果有）
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.webContents.send('switch-line-request', lineName, throughOperationTarget);
      // 清除 target（使用后清除）
      const target = throughOperationTarget;
      throughOperationTarget = null;
      // 关闭线路管理器窗口
      if (lineManagerWin && !lineManagerWin.isDestroyed()) {
        lineManagerWin.close();
      }
      return { ok: true, target: target };
    }
    return { ok: false, error: '主窗口不存在' };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

// 处理关闭窗口请求
ipcMain.handle('line-manager/close', async (event) => {
  try {
    if (lineManagerWin && !lineManagerWin.isDestroyed()) {
      lineManagerWin.close();
      return { ok: true };
    }
    return { ok: false, error: '窗口不存在' };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});
