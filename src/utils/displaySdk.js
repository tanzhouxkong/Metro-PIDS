// 轻量显示端 SDK：用于控制显示窗口
// 支持 BroadcastChannel (metro_pids_v3)，否则回退 window.postMessage
// 用法示例：
// 示例：const sdk = createDisplaySdk();
// 示例：sdk.sendSync(appData, rt);
// 示例：sdk.startRec(800000);
// 示例：sdk.onMessage((msg) => { console.log(msg); });
// 示例：sdk.installKeyboardHandler(); // 安装键盘事件处理器（支持自定义快捷键）

// 规范化按键名称（与显示器1保持一致）
function normalizeKeyNameGlobal(name) {
  if (!name) return name;
  const s = String(name);
  if (s === 'NumpadEnter') return 'Enter';
  if (s === ' ' || s.toLowerCase() === 'spacebar') return 'Space';
  if (/^space$/i.test(s)) return 'Space';
  if (/^[a-zA-Z]$/.test(s)) return 'Key' + s.toUpperCase();
  return s;
}

export function createDisplaySdk(options = {}) {
  const channelName = options.channelName || 'metro_pids_v3';
  const targetWindow = options.targetWindow || null; // 可选：指定目标窗口引用
  const targetOrigin = options.targetOrigin || '*';
  let bc = null;
  let usingBC = false;

  if (typeof BroadcastChannel !== 'undefined') {
    try {
      bc = new BroadcastChannel(channelName);
      usingBC = true;
    } catch (err) {
      bc = null;
      usingBC = false;
    }
  }

  const post = (msg) => {
    try {
      if (usingBC && bc) {
        bc.postMessage(msg);
        return true;
      }
      if (targetWindow && typeof targetWindow.postMessage === 'function') {
        targetWindow.postMessage(msg, targetOrigin);
        return true;
      }
      if (typeof window !== 'undefined' && typeof window.postMessage === 'function') {
        // 发送给同源监听者（显示端也监听 window.message）
        window.postMessage(msg, targetOrigin);
        return true;
      }
    } catch (err) {
      console.warn('displaySdk: post failed', err);
    }
    return false;
  };

  const sendSync = (appData, rtState = null) => {
    const msg = { t: 'SYNC', d: appData };
    if (rtState) msg.r = rtState;
    // 同步时也持久化快照（显示端启动时从 localStorage 恢复）
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        // 如需倒换车门则写入 _effectiveDoor，便于恢复
        try {
          const app = msg.d;
          const rt = msg.r || {};
          const meta = app && app.meta ? app.meta : null;
          // 尝试读取上一次快照以识别上下行切换
          let prevDir = null;
          try {
            const prevRaw = window.localStorage.getItem('metro_pids_display_snapshot');
            if (prevRaw) {
              const prev = JSON.parse(prevRaw);
              if (prev && prev.d && prev.d.meta) prevDir = prev.d.meta.dirType || null;
            }
          } catch (e) {}
          if (app && Array.isArray(app.stations) && meta) {
            const upSet = new Set(['up', 'outer']);
            const downSet = new Set(['down', 'inner']);
            const currDir = meta.dirType || null;
            const idx = typeof rt.idx === 'number' ? rt.idx : -1;
            if (idx >= 0 && idx < app.stations.length) {
              const st = app.stations[idx];
              if (st && st.turnback === 'pre' && prevDir && upSet.has(prevDir) && downSet.has(currDir)) {
                const invertDoor = (door) => {
                  if (!door) return 'left';
                  if (door === 'left') return 'right';
                  if (door === 'right') return 'left';
                  return door;
                };
                st._effectiveDoor = invertDoor(st.door || 'left');
              }
            }
          }
        } catch (err) {}
        window.localStorage.setItem('metro_pids_display_snapshot', JSON.stringify(msg));
      }
    } catch (e) {
      // 存储异常忽略
    }
    return post(msg);
  };

  const request = () => post({ t: 'REQ' });
  const startRec = (bps = 800000) => post({ t: 'REC_START', bps });
  const stopRec = () => post({ t: 'REC_STOP' });

  // 发送显示端期望的原始命令类型
  const sendCmd = (type, payload = {}) => post(Object.assign({ t: type }, payload));

  // 订阅来自显示端或其他控制端的消息
  const listeners = new Set();
  const handleIncoming = (ev) => {
    const data = ev && ev.data ? ev.data : ev;
    if (!data) return;
    // 统一处理 BroadcastChannel 与 window message
    const msg = data;
    listeners.forEach((fn) => {
      try { fn(msg); } catch (e) { console.warn('displaySdk listener error', e); }
    });
  };

  const onMessage = (fn) => {
    if (typeof fn !== 'function') return () => {};
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  };

  // 注册监听
  if (usingBC && bc) {
    bc.addEventListener('message', handleIncoming);
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('message', handleIncoming);
  }

  const close = () => {
    if (usingBC && bc) {
      try { bc.close(); } catch (e) {}
      bc = null;
    }
    if (typeof window !== 'undefined') {
      try { window.removeEventListener('message', handleIncoming); } catch (e) {}
    }
    listeners.clear();
  };

  // 发送按键信息（类似显示器1的处理方式）
  // 主程序会根据用户配置的快捷键进行匹配
  const sendKeyEvent = (code, key) => {
    try {
      const normCode = normalizeKeyNameGlobal(code || key);
      const normKey = normalizeKeyNameGlobal(key || code || null);
      return post({ t: 'CMD_KEY', code: code, key: key, normCode, normKey });
    } catch (err) {
      console.warn('displaySdk: sendKeyEvent failed', err);
      return false;
    }
  };

  // 安装键盘事件处理器（类似显示器1的 handleKeyDown）
  // 第三方显示器可以使用此方法来自动处理键盘事件，支持用户自定义快捷键
  let keyboardHandlerInstalled = false;
  let keyboardHandler = null;
  const installKeyboardHandler = (options = {}) => {
    if (keyboardHandlerInstalled) {
      console.warn('displaySdk: 键盘事件处理器已安装');
      return () => {};
    }

    if (typeof window === 'undefined' || typeof document === 'undefined') {
      console.warn('displaySdk: 无法在非浏览器环境中安装键盘事件处理器');
      return () => {};
    }

    keyboardHandler = (e) => {
      const targetTag = e.target && e.target.tagName;
      // 如果指定了要忽略的元素选择器
      if (options.ignoreInputs !== false) {
        if (targetTag && ['INPUT', 'TEXTAREA', 'SELECT'].includes(targetTag)) return;
      }
      
      // 防止默认行为（Space 和 Enter）
      if (e.code === 'Space' || e.code === 'Enter') e.preventDefault();
      
      // 忽略修饰键
      const ignore = new Set(['ShiftLeft','ShiftRight','ControlLeft','ControlRight','AltLeft','AltRight','MetaLeft','MetaRight','CapsLock','NumLock','ScrollLock','ContextMenu']);
      if (ignore.has(e.code)) return;
      
      // 发送按键信息到主程序
      sendKeyEvent(e.code, e.key);
    };

    document.addEventListener('keydown', keyboardHandler);
    keyboardHandlerInstalled = true;
    console.log('displaySdk: 键盘事件处理器已安装（支持自定义快捷键）');

    // 返回卸载函数
    return () => {
      if (keyboardHandler) {
        document.removeEventListener('keydown', keyboardHandler);
        keyboardHandler = null;
        keyboardHandlerInstalled = false;
        console.log('displaySdk: 键盘事件处理器已卸载');
      }
    };
  };

  return {
    post,
    sendSync,
    request,
    startRec,
    stopRec,
    sendCmd,
    sendKeyEvent, // 新增：发送按键信息
    installKeyboardHandler, // 新增：安装键盘事件处理器
    onMessage,
    close,
    _usingBroadcastChannel: usingBC
  };
}
