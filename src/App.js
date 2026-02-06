import { onUnmounted, Teleport, Transition, watch, onMounted, ref } from 'vue'
import AdminApp from './components/AdminApp.js'
import Topbar from './components/Topbar.js'
import LeftRail from './components/LeftRail.js'
import SlidePanel from './components/SlidePanel.js'
import ConsolePage from './components/ConsolePage.js'
import SettingsPage from './components/SettingsPage.js'
import UnifiedDialogs from './components/UnifiedDialogs.js'
import { usePidsState } from './composables/usePidsState.js'
import { useKeyboard } from './composables/useKeyboard.js'
import { useController } from './composables/useController.js'
import { useSettings } from './composables/useSettings.js'
import { useUIState } from './composables/useUIState.js'
import { useCloudConfig, CLOUD_API_BASE } from './composables/useCloudConfig.js'
import { usePlugins } from './composables/usePlugins.js'
import dialogService from './utils/dialogService.js'

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
        if (d.showAllStations !== undefined) appData.meta.showAllStations = d.showAllStations;
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
    kbd.onKey((e) => {
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

        if (match(km.arrdep)) { e.preventDefault(); next(); return; }
        if (match(km.prev)) { move(-getStep()); return; }
        if (match(km.next)) { move(getStep()); return; }
        
        // 硬编码兜底
        if (code === 'Enter' || key === 'Enter') { e.preventDefault(); next(); }
        if (code === 'ArrowLeft' || key === 'ArrowLeft') move(-getStep());
        if (code === 'ArrowRight' || key === 'ArrowRight') move(getStep());
    });

    // 广播处理
    bcOn((data) => {
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
                 next();
                 return;
             }
             return;
         }
         
         // 如果发送的是按键格式，检查是否与用户配置的快捷键匹配
         if (match(km.arrdep)) {
             next();
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
      // 调试：记录指向 App 的 postMessage
      try { console.log('[debug][postMessage] window.message received in App.js', ev.origin, ev.data); } catch(e) {}
      const data = ev.data;
      if (!data) return;
      // 安全：忽略其他窗口通过 postMessage 发送的 CMD_UI
      if (data.t === 'CMD_UI') {
        try { console.log('[debug][postMessage] Ignoring CMD_UI from postMessage', ev.origin, data); } catch(e) {}
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
      // 通过设置 autoLocked 为 false，SlidePanel 和 ConsolePage 中的 watch 会自动停止自动播放
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

      console.log('[App] 📊 准备上报使用统计，API地址:', CLOUD_API_BASE);
      // 延迟上报，确保应用已完全加载
      setTimeout(async () => {
        try {
          console.log('[App] 📤 开始上报使用统计...');
          const result = await cloudConfig.sendTelemetry();
          if (result && result.ok) {
            console.log('[App] ✅ 使用统计已上报成功');
          } else {
            console.warn('[App] ⚠️ 使用统计上报返回失败:', result?.error || '未知错误');
          }
        } catch (e) {
          console.error('[App] ❌ 上报使用统计异常:', e);
        }
      }, 2000); // 延迟2秒上报
    });

    return { pidState, uiState, stopAutoplay, toggleAutoplayPause };
  },
  template: `
    <div class="root" style="
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
      background: transparent;
        position: relative;
      z-index: 1;
      ">
      <!-- Main Content Area (顶部栏+侧边栏已通过 BrowserView 嵌入，主内容区需要透明背景以透到桌面) -->
      <div id="admin-app" style="display:flex; overflow:hidden; position: absolute; top: 32px; left: 60px; right: 16px; bottom: 16px; z-index: 10; pointer-events: auto; border-radius: 12px;">
            <!-- Show different pages based on activePanel - 使用 v-show 避免组件卸载/挂载导致的闪烁 -->
            <div v-show="uiState.activePanel === 'panel-1'" style="flex:1; display:flex; flex-direction:column; overflow:hidden; position:absolute; top:0; left:0; right:0; bottom:0;">
              <ConsolePage />
            </div>
            <div v-show="uiState.activePanel === 'panel-4'" style="flex:1; display:flex; flex-direction:column; overflow:hidden; position:absolute; top:0; left:0; right:0; bottom:0;">
              <SettingsPage />
            </div>
            <div v-show="uiState.activePanel && uiState.activePanel !== 'panel-1' && uiState.activePanel !== 'panel-4'" style="flex:1; display:flex; flex-direction:column; overflow:hidden; position:absolute; top:0; left:0; right:0; bottom:0;">
              <SlidePanel />
            </div>
            <div v-show="!uiState.activePanel" style="flex:1; display:flex; flex-direction:column; overflow:hidden; position:absolute; top:0; left:0; right:0; bottom:0;">
              <AdminApp />
            </div>
        </div>

        <UnifiedDialogs />
        
        <!-- Global auto-play lock dialog - 使用 Teleport + Transition，样式对齐更新日志弹窗 -->
        <Teleport to="body">
            <Transition name="fade">
                <div 
                    v-if="uiState.autoLocked" 
                    style="position:fixed; inset:0; z-index:20000; display:flex; align-items:center; justify-content:center; background:transparent;"
                >
                    <div 
                        class="release-notes-dialog"
                        style="border-radius:20px; padding:0; max-width:520px; width:92%; display:flex; flex-direction:column; box-shadow:0 20px 60px rgba(0,0,0,0.3), 0 0 0 0.5px rgba(255,255,255,0.5) inset; overflow:hidden; transform:scale(1); transition:transform 0.2s;"
                        @click.stop
                    >
                        <!-- Header 对齐更新日志样式 -->
                        <div class="release-notes-header" style="display:flex; justify-content:space-between; align-items:center; padding:20px 24px; border-bottom:1px solid rgba(0,0,0,0.08); backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px);">
                            <div style="display:flex; align-items:center; gap:12px;">
                                <div style="width:36px; height:36px; border-radius:10px; background:linear-gradient(135deg, #22c55e 0%, #16a34a 100%); display:flex; align-items:center; justify-content:center; box-shadow:0 4px 12px rgba(22,163,74,0.4);">
                                    <i class="fas fa-play" style="color:white; font-size:16px;"></i>
                                </div>
                                <div>
                                    <h2 style="margin:0; font-size:20px; font-weight:800; color:var(--text, #333); letter-spacing:-0.5px;">自动播放进行中</h2>
                                    <div style="font-size:12px; color:var(--muted, #999); margin-top:2px;">Autoplay Lock</div>
                                </div>
                            </div>
                        </div>
                        <!-- Content -->
                        <div class="release-notes-content" style="flex:1; padding:18px 24px; backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px); display:flex; flex-direction:column; gap:14px;">
                            <div style="font-size:13px; color:var(--text, #333); line-height:1.8;">
                                控制面板当前处于自动播放锁定状态，为避免误操作，按钮和列表已临时禁用。若需恢复正常操作，请停止自动播放。
                            </div>
                            <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:4px;">
                                <button 
                                    class="btn" 
                                    style="min-width:120px; padding:9px 18px; border-radius:999px; font-weight:700; font-size:13px; cursor:pointer; border:1px solid var(--divider); background:var(--input-bg); color:var(--text);"
                                    @click="toggleAutoplayPause"
                                >
                                    <i :class="uiState.autoplayIsPausedRef ? 'fas fa-play' : 'fas fa-pause'" style="margin-right:6px;"></i>
                                    {{ uiState.autoplayIsPausedRef ? '继续' : '暂停' }}
                                </button>
                                <button 
                                    class="btn" 
                                    style="min-width:140px; background:#ef4444; color:white; border:none; padding:9px 18px; border-radius:999px; font-weight:700; font-size:13px; cursor:pointer;"
                                    @click="stopAutoplay"
                                >
                                    <i class="fas fa-stop-circle" style="margin-right:6px;"></i>停止自动播放
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </Transition>
        </Teleport>
    </div>
  `
}
