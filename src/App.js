import { onUnmounted, Teleport, Transition, watch, onMounted, ref, computed } from 'vue'
import { theme as antdTheme } from 'antdv-next'
import AdminApp from './components/AdminApp.vue'
import Topbar from './components/Topbar.vue'
import LeftRail from './components/LeftRail.vue'
import SlidePanel from './components/SlidePanel.vue'
import ConsolePage from './components/ConsolePage.vue'
import SettingsPage from './components/SettingsPage.vue'
import UnifiedDialogs from './components/UnifiedDialogs.vue'
import { usePidsState } from './composables/usePidsState.js'
import { useKeyboard } from './composables/useKeyboard.js'
import { useController } from './composables/useController.js'
import { useSettings } from './composables/useSettings.js'
import { useUIState } from './composables/useUIState.js'
import { useCloudConfig, CLOUD_API_BASE } from './composables/useCloudConfig.js'
import { usePlugins } from './composables/usePlugins.js'
import { useStationAudio } from './composables/useStationAudio.js'
import dialogService from './utils/dialogService.js'
import zhCN from 'antdv-next/locale/zh_CN'

const COMMON_APPLY_KEYS = ['1','2','3','4','5','6','7','8','9','0','F1','F2','F3','F4','F5','F6','F7','F8','F9','F10','F11','F12']

function isDevBuild() {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env && typeof import.meta.env.DEV === 'boolean') {
      return !!import.meta.env.DEV;
    }
  } catch (e) {
    // ignore
  }
  return false;
}

const IS_DEV_BUILD = isDevBuild();

export default {
  name: 'App',
  components: { AdminApp, Topbar, LeftRail, SlidePanel, ConsolePage, SettingsPage, UnifiedDialogs, Teleport, Transition },
  setup() {
    const { uiState } = useUIState()
    const { state: pidState, bcOn } = usePidsState();
    const { next, move, setArr, setDep, getStep, sync } = useController();
    const { settings } = useSettings();
    const kbd = useKeyboard();
    const cloudConfig = useCloudConfig(CLOUD_API_BASE);
    const { playArrive, playDepart } = useStationAudio(pidState);
    let commonPreview = null;
    let lastCommonPlayback = null; // { url: string, title: string }
    let commonStopIntent = false; // 区分“停止/暂停”来源，避免 pause 导致 playbackState 变 none
    const _lastCmdKey = new Map();
    const _CMD_KEY_DEDUPE_MS = 300;

    // 系统媒体控制面板（Windows/锁屏/全局媒体控制）
    const canUseMediaSession = typeof navigator !== 'undefined' && !!navigator.mediaSession && typeof navigator.mediaSession.setActionHandler === 'function'
    const setPlaybackState = (playbackState) => {
      if (!canUseMediaSession) return
      try { navigator.mediaSession.playbackState = playbackState } catch (e) {}
    }
    const setMediaMetadata = (meta) => {
      if (!canUseMediaSession) return
      try {
        const MM = (typeof MediaMetadata !== 'undefined') ? MediaMetadata : (typeof window !== 'undefined' ? window.MediaMetadata : undefined)
        if (!MM) return
        navigator.mediaSession.metadata = new MM(meta)
      } catch (e) {}
    }

    const getLineDirOrFilePath = () => {
      const metaLine = (pidState.appData?.meta?.lineName || '').replace(/<[^>]+>([^<]*)<\/>/g, '$1').trim();
      if (metaLine && pidState.lineNameToFilePath && pidState.lineNameToFilePath[metaLine]) return pidState.lineNameToFilePath[metaLine];
      if (pidState.currentFilePath && typeof pidState.currentFilePath === 'string' && pidState.currentFilePath.trim()) return pidState.currentFilePath.trim();
      if (typeof window !== 'undefined' && window.__currentLineFilePath) return window.__currentLineFilePath;
      return '';
    };

    const stopAnyAudioElements = () => {
      try {
        const nodes = typeof document !== 'undefined' ? document.getElementsByTagName('audio') : [];
        for (const el of nodes || []) {
          try {
            el.muted = true;
            el.volume = 0;
            el.pause();
            el.currentTime = 0;
            el.src = '';
            if (typeof el.load === 'function') el.load();
          } catch (e) {}
        }
      } catch (e) {}
    };

    const stopCommonPreview = () => {
      commonStopIntent = true;
      stopAnyAudioElements();
      if (!commonPreview) {
        setPlaybackState('none');
        commonStopIntent = false;
        return;
      }
      try { commonPreview.pause(); } catch (e) {}
      commonPreview = null;
      setPlaybackState('none');
      commonStopIntent = false;
    };

    const pauseCommonPreview = () => {
      if (!commonPreview) return;
      commonStopIntent = false;
      try { commonPreview.pause(); } catch (e) {}
      setPlaybackState('paused');
    };

    if (typeof window !== 'undefined') {
      window.__stopCommonAudio = stopCommonPreview;
      window.__stopAnyAudioElements = stopAnyAudioElements;
    }

    const playCommonByHotkey = async (normKey) => {
      const appData = pidState.appData;
      const meta = appData?.meta;
      const ca = meta?.commonAudio;
      if (!ca || typeof ca !== 'object') return false;
      const list = Array.isArray(ca.up?.list) ? ca.up.list : [];
      if (!list.length) return false;
      const applied = list.filter((i) => i && i.applied);
      if (!applied.length) return false;
      const keyIdx = COMMON_APPLY_KEYS.findIndex((k) => k.toUpperCase() === normKey.toUpperCase());
      if (keyIdx < 0 || keyIdx >= applied.length) return false;
      const item = applied[keyIdx];
      if (!item?.path) return false;
      const linePath = getLineDirOrFilePath();
      if (!linePath || !window?.electronAPI?.lines?.resolveAudioPath) return false;
      try {
        // 打断当前进/出站播放（包含列表循环），并临时阻止短时间内的站点音频重启
        if (typeof window !== 'undefined') {
          window.__blockStationAudioUntil = Date.now() + 2000; // 在通用音频播放期间禁止站点音频重启
        }
        stopAnyAudioElements();
        if (typeof window.__stopStationAudio === 'function') {
          try { await window.__stopStationAudio(); } catch (e) {}
        }
        stopCommonPreview();
        const res = await window.electronAPI.lines.resolveAudioPath(linePath, item.path);
        if (!res?.ok) return false;
        const url = res.playableUrl || ('file:///' + (res.path || '').replace(/\\/g, '/'));
        if (!url || url === 'file:///') return false;
        const title = item?.name || item?.path || 'Common Audio';

        lastCommonPlayback = { url, title };
        if (typeof window !== 'undefined') {
          window.__activeStationAudioController = {
            id: 'common',
            playFromLast: async () => {
              if (!lastCommonPlayback?.url) return false;
              return await (async () => {
                if (typeof window !== 'undefined') {
                  window.__blockStationAudioUntil = Date.now() + 2000;
                }
                stopAnyAudioElements();
                if (typeof window !== 'undefined' && typeof window.__stopStationAudio === 'function') {
                  try { await window.__stopStationAudio(); } catch (e) {}
                }
                stopCommonPreview();
                const a = new Audio(lastCommonPlayback.url);
                commonPreview = a;
                const onEndedOrError = () => { if (commonPreview === a) commonPreview = null; setPlaybackState('none'); };
                const onPause = () => {
                  if (commonPreview !== a) return;
                  if (commonStopIntent) {
                    commonPreview = null;
                    setPlaybackState('none');
                  } else {
                    setPlaybackState('paused');
                  }
                };
                a.onended = onEndedOrError;
                a.onpause = onPause;
                a.onerror = onEndedOrError;
                setMediaMetadata({ title: lastCommonPlayback.title, artist: 'Metro-PIDS', album: 'Common Audio' });
                setPlaybackState('none');
                try { await a.play(); } catch (e) { return false; }
                setPlaybackState('playing');
                return true;
              })();
            },
            pauseFromMedia: pauseCommonPreview,
            stopFromMedia: stopCommonPreview
          };
        }

        const a = new Audio(url);
        commonPreview = a;
        const onEndedOrError = () => { if (commonPreview === a) commonPreview = null; setPlaybackState('none'); };
        const onPause = () => {
          if (commonPreview !== a) return;
          if (commonStopIntent) {
            commonPreview = null;
            setPlaybackState('none');
          } else {
            setPlaybackState('paused');
          }
        };
        a.onended = onEndedOrError;
        a.onpause = onPause;
        a.onerror = onEndedOrError;
        setMediaMetadata({ title, artist: 'Metro-PIDS', album: 'Common Audio' });
        setPlaybackState('none');
        await a.play();
        setPlaybackState('playing');
        return true;
      } catch (err) {
        console.warn('[App] playCommonByHotkey error', err);
        return false;
      }
    };
    const playAfterToggle = (prevIdx) => {
      if (settings.vehicleAudioEnabled === false) return;
      const idx = Number.isInteger(pidState.rt?.idx) ? pidState.rt.idx : prevIdx;
      if (idx == null) return;
      if (pidState.rt?.state === 0) playArrive(idx);
      else playDepart(idx);
    };

    // 监听来自侧边栏的面板切换消息
    let panelStateCleanup = null;
    if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.onPanelStateChange) {
      panelStateCleanup = window.electronAPI.onPanelStateChange((panelId) => {
        uiState.activePanel = panelId;
      });
    }

    // 在组件卸载时清理监听器
    onUnmounted(() => {
      if (panelStateCleanup) {
        panelStateCleanup();
      }
    });

    // 切换线路后保持 display-1 / display-3 的显示端开关与设置一致，避免被线路文件覆盖
    watch(
      () => pidState.appData,
      (appData) => {
        if (!appData || !appData.meta) return;
        const disp = settings.display;
        if (!disp) return;
        const curId = disp.currentDisplayId;
        if (curId !== 'display-1' && curId !== 'display-3') return;
        const d = disp.displays && disp.displays[curId];
        if (!d) return;
        if (d.lineNameMerge !== undefined) appData.meta.lineNameMerge = d.lineNameMerge;
        // showAllStations 已废弃：不再从设置同步到线路 meta
        if (curId === 'display-3' && d.display3Tags && typeof d.display3Tags === 'object') {
          appData.meta.display3Tags = { ...d.display3Tags };
        }
      },
      { flush: 'post' }
    );

    // 插件系统：切换线路时触发 lineSwitch 钩子（彩蛋、节日等）
    const { doAction, initPlugins } = usePlugins(cloudConfig);
    const lastPluginLineName = ref(null);
    onMounted(() => initPlugins());
    watch(
      () => ({ lineName: pidState.appData?.meta?.lineName, stations: pidState.appData?.stations }),
      async (curr) => {
        const lineName = curr?.lineName;
        const stations = curr?.stations;
        if (!lineName || !stations || !Array.isArray(stations) || stations.length === 0) return;
        const isSwitch = lastPluginLineName.value != null && lastPluginLineName.value !== lineName;
        lastPluginLineName.value = lineName;
        if (!isSwitch) return;
        initPlugins();
        await doAction('lineSwitch', { lineName, stations });
      },
      { flush: 'post' }
    );

    // 键盘处理
    kbd.install();
    kbd.onKey(async (e) => {
        if (pidState.isRec || ['INPUT','TEXTAREA'].includes((e.target && e.target.tagName) || '')) return;
        
        const code = e.code;
        const key = e.key;
        const km = settings.keys || { arrdep: 'Enter', prev: 'ArrowLeft', next: 'ArrowRight' };
        
        const normalize = (s) => {
            if (!s) return '';
            if (s === ' ') return 'Space';
            return s.toLowerCase();
        };

        const match = (target) => {
            if (!target) return false;
            const t = normalize(target);
            return normalize(code) === t || normalize(key) === t;
        };

        // 通用音频快捷键（按应用顺序 1/2/.../0/F1...）
        const normKeyForCommon = (key || code || '').toUpperCase();
        if (COMMON_APPLY_KEYS.some((k) => k.toUpperCase() === normKeyForCommon)) {
          if (await playCommonByHotkey(normKeyForCommon)) {
            try { e.preventDefault(); } catch (err) {}
            return;
          }
        }

        if (match(km.arrdep)) {
          e.preventDefault();
          const prevIdx = Number.isInteger(pidState.rt?.idx) ? pidState.rt.idx : 0;
          next();
          playAfterToggle(prevIdx);
          return;
        }
        if (match(km.prev)) { move(-getStep()); return; }
        if (match(km.next)) { move(getStep()); return; }
        
        // 硬编码兜底
        if (code === 'Enter' || key === 'Enter') { e.preventDefault(); const prevIdx = Number.isInteger(pidState.rt?.idx) ? pidState.rt.idx : 0; next(); playAfterToggle(prevIdx); }
        if (code === 'ArrowLeft' || key === 'ArrowLeft') move(-getStep());
        if (code === 'ArrowRight' || key === 'ArrowRight') move(getStep());
    });

    // 广播处理
    bcOn(async (data) => {
      // 调试：记录收到的 CMD_UI 消息
      try { if (data && data.t === 'CMD_UI') console.log('[debug][bc] CMD_UI received in App.js', data); } catch(e) {}
      // 安全：忽略通过 BroadcastChannel 传入的 CMD_UI，防止显示端误触主控的窗口操作
      if (data && data.t === 'CMD_UI') {
        try { console.log('[debug][bc] Ignoring CMD_UI from BroadcastChannel', data); } catch(e) {}
        return;
      }
      // 处理第三方显示器的数据请求
      if (data && data.t === 'REQ') {
        console.log('[App] 收到第三方显示器的数据请求，立即同步数据');
        sync();
      }
      // 远端按键指令（支持命令格式和按键格式）
      if (data && data.t === 'CMD_KEY') {
        // 去重：短时间内重复的 CMD_KEY 忽略（防止显示端通过多通道重复发送）
        try {
          const dedupeKey = `${data.code || data.key}::${data.key || data.code}`
          const nowt = Date.now()
          const last = _lastCmdKey.get(dedupeKey) || 0
          if (nowt - last < _CMD_KEY_DEDUPE_MS) return
          _lastCmdKey.set(dedupeKey, nowt)
        } catch (e) {}
        
         
         const code = data.code || data.key;
         const key = data.key || data.code;
         const command = data.command; // 支持命令格式：'next', 'prev', 'arrive', 'depart'
         const km = settings.keys || { arrdep: 'Enter', prev: 'ArrowLeft', next: 'ArrowRight' };
         
         const normalize = (s) => {
             if (!s) return '';
             if (s === ' ') return 'Space';
             return s.toLowerCase();
         };
         
         const match = (target) => {
             if (!target) return false;
             const t = normalize(target);
             return normalize(code) === t || normalize(key) === t;
         };

         // 通用音频快捷键（按应用顺序 1/2/.../0/F1...）
         const normKeyForCommon = (key || code || '').toUpperCase();
         if (COMMON_APPLY_KEYS.some((k) => k.toUpperCase() === normKeyForCommon)) {
           if (await playCommonByHotkey(normKeyForCommon)) return;
         }
         
         // 如果发送的是命令格式，直接执行对应操作（命令是语义化的，不需要匹配快捷键）
         if (command) {
           if (command === 'next') {
             move(getStep());
             return;
           }
           if (command === 'prev') {
             move(-getStep());
             return;
           }
           if (command === 'arrive' || command === 'depart') {
             const prevIdx = Number.isInteger(pidState.rt?.idx) ? pidState.rt.idx : 0;
             next();
             playAfterToggle(prevIdx);
             return;
           }
           return;
         }
         
         // 如果发送的是按键格式，检查是否与用户配置的快捷键匹配
         if (match(km.arrdep)) {
           const prevIdx = Number.isInteger(pidState.rt?.idx) ? pidState.rt.idx : 0;
           next();
           playAfterToggle(prevIdx);
           return;
         }
         if (match(km.prev)) {
             move(-getStep());
             return;
         }
         if (match(km.next)) {
             move(getStep());
             return;
         }
         
         // 兜底：如果用户配置的快捷键不匹配，尝试使用默认值（向后兼容）
         if (code === 'Enter' || key === 'Enter') {
             next();
         } else if (code === 'ArrowLeft' || key === 'ArrowLeft') {
             move(-getStep());
         } else if (code === 'ArrowRight' || key === 'ArrowRight') {
             move(getStep());
         }
      }
      // 来自显示端的 UI 命令；若标记 src=display 则忽略
      if (data && data.t === 'CMD_UI') {
        // 标记为 display 来源时不处理
        if (data.src && data.src === 'display') return;
        const cmd = data.cmd;
        if (!cmd) return;
        if (cmd === 'winMin') {
          if (window.electronAPI && window.electronAPI.windowControls && window.electronAPI.windowControls.minimize) window.electronAPI.windowControls.minimize();
          else try{ window.blur(); }catch(e){}
        }
        if (cmd === 'winMax') {
          if (window.electronAPI && window.electronAPI.windowControls && window.electronAPI.windowControls.toggleMax) window.electronAPI.windowControls.toggleMax();
          else {
            if (!document.fullscreenElement) { try{ document.documentElement.requestFullscreen(); }catch(e){} }
            else { try{ document.exitFullscreen(); }catch(e){} }
          }
        }
        if (cmd === 'winClose') {
          if (window.electronAPI && window.electronAPI.windowControls && window.electronAPI.windowControls.close) window.electronAPI.windowControls.close();
          else try{ window.close(); }catch(e){}
        }
      }
    });

    // 兜底：处理显示端弹窗的 postMessage
    const handleWindowMsg = (ev) => {
      const data = ev.data;
      if (!data) return;
      // 安全：忽略其他窗口通过 postMessage 发送的 CMD_UI
      if (data.t === 'CMD_UI') {
        return;
      }
      return;
    };
    if (typeof window !== 'undefined') window.addEventListener('message', handleWindowMsg);

    // 页面加载完成后，自动同步一次数据（确保第三方显示器能立即获取数据）
    // 延迟一小段时间，确保数据已加载完成
    setTimeout(() => {
      if (pidState.appData && pidState.appData.stations && pidState.appData.stations.length > 0) {
        console.log('[App] 页面加载完成，自动同步数据到所有显示器');
        sync();
      }
    }, 500);

    // 停止自动播放（从遮罩调用）
    function stopAutoplay() {
      console.log('[App] 停止自动播放，设置 autoLocked = false');
      uiState.autoLocked = false;
      uiState.autoplayTogglePause = null;
      uiState.autoplayIsPausedRef = null;
      // 通过设置 autoLocked 为 false，SlidePanel 和主页面中的 watch 会自动停止自动播放
    }

    function toggleAutoplayPause() {
      if (typeof uiState.autoplayTogglePause === 'function') {
        uiState.autoplayTogglePause();
      }
    }
    
    // 调试：监听 autoLocked 变化
    if (typeof window !== 'undefined') {
      watch(() => uiState.autoLocked, (newVal) => {
        console.log('[App] autoLocked 变化:', newVal);
      });
    }

    // 启动公告：从云端获取配置，根据模式（每次 / 每天一次）决定是否弹窗
    async function checkStartupNotice() {
      try {
        if (!cloudConfig || typeof cloudConfig.getStartupNotice !== 'function') return;
        const res = await cloudConfig.getStartupNotice();
        const cfg = res?.config || res?.data?.config || res;
        if (!cfg || cfg.enabled !== true) return;

        const enabledNotices = (cfg.notices && cfg.notices.length > 0) ? cfg.notices.filter((n) => n.enabled !== false) : [];
        const notice = enabledNotices.length > 0 ? enabledNotices[0] : null;
        if (!notice) return;

        // 检查服务器返回的有效性标记（如果服务器已经检查过时间范围和地理位置）
        if (notice._isEffective === false) {
          console.log('[App] 启动公告未生效（时间范围或地理位置不匹配）');
          return;
        }

        const id = (notice.id && String(notice.id).trim()) || 'default';
        const mode = notice.mode === 'oncePerDay' ? 'oncePerDay' : 'everyRun';
        const storageKey = `startup_notice_${id}`;
        const today = new Date().toISOString().slice(0, 10);

        let shouldShow = false;
        if (mode === 'everyRun') {
          shouldShow = true;
        } else if (mode === 'oncePerDay') {
          const last = typeof localStorage !== 'undefined' ? localStorage.getItem(storageKey) : null;
          if (last !== today) {
            shouldShow = true;
            try { localStorage.setItem(storageKey, today); } catch (e) {}
          }
        }

        if (!shouldShow) return;

        const title = notice.title || '启动公告';
        const message = notice.message || '';
        try {
          await dialogService.alert(message, title);
        } catch (e) {
          console.warn('[App] 显示启动公告失败:', e);
        }
      } catch (e) {
        console.warn('[App] 获取启动公告配置失败:', e);
      }
    }

    // 从云端获取显示端功能开关（逻辑在 useCloudConfig.syncDisplayFlags）
    async function syncDisplayFlags() {
      // 开发环境下：不从云端拉取显示端开关，避免云控干预本地调试
      if (IS_DEV_BUILD) {
        uiState.showSystemDisplayOption = true;
        uiState.displayFlags = null;
        return;
      }
      if (cloudConfig && typeof cloudConfig.syncDisplayFlags === 'function') {
        await cloudConfig.syncDisplayFlags(uiState);
      }
    }

    // 启动时：同步云控开关 + 启动公告 + 节日弹窗 + 上报统计
    onMounted(async () => {
      // 优先同步云控显示端开关和启动公告（不阻塞主线程）
      syncDisplayFlags();
      checkStartupNotice();
      // 节日列表：与公告一样弹窗（由节日插件 dateCheck 处理）
      doAction('dateCheck', {});

      // 延迟上报，确保应用已完全加载
      setTimeout(async () => {
        try {
          const result = await cloudConfig.sendTelemetry();
          void result;
        } catch (e) {
          console.error('[App] ❌ 上报使用统计异常:', e);
        }
      }, 2000); // 延迟2秒上报
    });

    // ===== 启动时更新提示（样式对齐更新日志弹窗） =====
    const showUpdatePrompt = ref(false);
    const updatePromptInfo = ref(null);
    const updatePromptForce = ref(false);

    const htmlDark = ref(false)
    function syncHtmlDark() {
      if (typeof document === 'undefined') return
      const r = document.documentElement
      htmlDark.value = r.classList.contains('dark') || r.getAttribute('data-theme') === 'dark'
    }
    let htmlThemeObserver = null
    onMounted(() => {
      syncHtmlDark()
      if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return
      htmlThemeObserver = new MutationObserver(syncHtmlDark)
      htmlThemeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] })
    })
    onUnmounted(() => {
      if (htmlThemeObserver) {
        htmlThemeObserver.disconnect()
        htmlThemeObserver = null
      }
    })
    const antdThemeConfig = computed(() => ({
      algorithm: htmlDark.value ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm
    }))

    if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.onUpdateHasUpdate) {
      try {
        window.electronAPI.onUpdateHasUpdate((data) => {
          if (!data || !data.version) return;
          const version = String(data.version);
          const force = !!data.forceUpdate;
          const key = `metro_pids_update_prompt_shown_${version}`;
          try {
            const already = window.localStorage.getItem(key);
            if (already === '1') return;
            window.localStorage.setItem(key, '1');
          } catch (e) {
            // 本地存储失败时，不阻止弹窗，只是不去重
          }
          updatePromptInfo.value = { version };
          updatePromptForce.value = force;
          showUpdatePrompt.value = true;
        });
      } catch (e) {
        console.warn('[App] 绑定 update/has-update 事件失败:', e);
      }
    }

    const handleUpdatePromptUpdate = async () => {
      showUpdatePrompt.value = false;
      try {
        if (typeof window === 'undefined' || !window.electronAPI) return;
        // 切到设置页“更新”面板
        uiState.activePanel = 'panel-4';
        const r = await window.electronAPI.checkForUpdates();
        if (!r || !r.ok) {
          const msg = (r && r.error) ? String(r.error) : '未知错误';
          await dialogService.alert('检查更新失败：' + msg, '更新');
        }
      } catch (e) {
        await dialogService.alert('检查更新失败：' + String(e), '更新');
      }
    };

    const handleUpdatePromptCancel = () => {
      showUpdatePrompt.value = false;
    };

    const handleUpdatePromptExit = async () => {
      showUpdatePrompt.value = false;
      try {
        const confirm = await dialogService.confirm(
          '此版本为强制更新版本，建议立即退出应用并安装最新版本。\n\n是否现在退出应用？',
          '强制更新'
        );
        if (!confirm) return;
        if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.windowControls && window.electronAPI.windowControls.close) {
          window.electronAPI.windowControls.close();
        } else if (typeof window !== 'undefined' && window.close) {
          window.close();
        }
      } catch (e) {
        // 忽略退出确认过程中的异常
      }
    };

    return {
      pidState,
      uiState,
      stopAutoplay,
      toggleAutoplayPause,
      showUpdatePrompt,
      updatePromptInfo,
      updatePromptForce,
      handleUpdatePromptUpdate,
      handleUpdatePromptCancel,
      handleUpdatePromptExit,
      antdLocale: zhCN,
      antdThemeConfig
    };
  }}
