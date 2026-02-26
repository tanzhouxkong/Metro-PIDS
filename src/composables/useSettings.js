import { reactive, watch } from 'vue'
import { DEFAULT_SETTINGS } from '../utils/defaults.js'

const settings = reactive({ ...DEFAULT_SETTINGS })
let systemThemeCleanup = null; // 存储系统主题监听的清理函数

export function useSettings() {
    
    function applyBlurSetting() {
        if (typeof document === 'undefined') return;
        const root = document.documentElement;
        const enabled = settings.blurEnabled !== false;
        root.classList.toggle('blur-disabled', !enabled);
        // 尝试同步到原生窗口效果（如有暴露的 API）
        try {
            const effects = typeof window !== 'undefined' && window.electronAPI && window.electronAPI.effects;
            if (effects) {
                if (typeof effects.setMainBlur === 'function') {
                    effects.setMainBlur(enabled);
                }
                if (typeof effects.setDialogBlur === 'function') {
                    effects.setDialogBlur(enabled);
                }
            }
        } catch (e) {
            // 忽略同步失败
        }
    }

    /** 无论新安装还是升级，都确保 display 结构存在且至少包含显示器1、2（及3），避免卡片不显示 */
    function ensureDisplayStructure() {
        if (!settings.display) settings.display = { ...DEFAULT_SETTINGS.display };
        let displays = settings.display.displays;
        // 兼容：displays 为 null/undefined 或非对象时，用默认完整列表
        if (!displays || typeof displays !== 'object') {
            settings.display.displays = { ...DEFAULT_SETTINGS.display.displays };
        } else if (Array.isArray(displays)) {
            // 旧版可能存成数组，转为以 id 为 key 的对象，并合并默认系统显示器
            const byId = {};
            for (const d of displays) {
                if (d && d.id) byId[d.id] = d;
            }
            settings.display.displays = { ...DEFAULT_SETTINGS.display.displays, ...byId };
        }
        const defDisplays = DEFAULT_SETTINGS.display.displays;
        if (!settings.display.displays['display-1']) {
            settings.display.displays['display-1'] = { ...defDisplays['display-1'] };
        }
        if (!settings.display.displays['display-2']) {
            settings.display.displays['display-2'] = { ...defDisplays['display-2'] };
        }
        if (!settings.display.displays['display-3']) {
            settings.display.displays['display-3'] = { ...defDisplays['display-3'] };
        }
        // 同步系统显示器的关键字段到最新配置（名称、尺寸、描述等），避免老版本遗留值
        ['display-1', 'display-2', 'display-3'].forEach((id) => {
            const def = defDisplays[id];
            const cur = settings.display.displays[id];
            if (!def || !cur) return;
            cur.id = id;
            cur.name = def.name;
            cur.source = def.source;
            if (!cur.url) cur.url = def.url;
            cur.width = def.width;
            cur.height = def.height;
            cur.description = def.description;
        });
        if (!settings.display.currentDisplayId) {
            settings.display.currentDisplayId = Object.keys(settings.display.displays)[0] || 'display-1';
        }
        settings.display.displays['display-1'].isSystem = true;
        settings.display.displays['display-2'].isSystem = true;
        settings.display.displays['display-3'].isSystem = true;
        if (settings.display.display2Mode === undefined) {
            settings.display.display2Mode = DEFAULT_SETTINGS.display.display2Mode ?? 'dev-only';
        }
        if (settings.display.display2NextStationDuration === undefined) {
            settings.display.display2NextStationDuration = DEFAULT_SETTINGS.display.display2NextStationDuration ?? 10000;
        }
    }

    function loadSettings() {
        try {
            const s = JSON.parse(localStorage.getItem('pids_settings_v1') || 'null');
            if (s) {
                Object.assign(settings, s);
                // 确保嵌套对象在缺失时正确合并
                if (!settings.keys) settings.keys = { ...DEFAULT_SETTINGS.keys };
                if (!settings.autoplay) settings.autoplay = { ...DEFAULT_SETTINGS.autoplay };
                if (!settings.display) settings.display = { ...DEFAULT_SETTINGS.display };
                
                // 兼容旧的显示端配置格式（无 displays 或旧单显示器格式）
                if (settings.display && !settings.display.displays) {
                    const oldDisplay = { ...settings.display };
                    settings.display = {
                        currentDisplayId: 'display-1',
                        display2Mode: oldDisplay.display2Mode ?? DEFAULT_SETTINGS.display.display2Mode,
                        display2NextStationDuration: oldDisplay.display2NextStationDuration ?? DEFAULT_SETTINGS.display.display2NextStationDuration,
                        display2FooterLED: oldDisplay.display2FooterLED,
                        display2FooterWatermark: oldDisplay.display2FooterWatermark,
                        displays: {
                            'display-1': {
                                id: 'display-1',
                                name: '主显示器',
                                source: oldDisplay.source || 'builtin',
                                url: oldDisplay.url || '',
                                width: oldDisplay.width || 1900,
                                height: oldDisplay.height || 600,
                                enabled: true,
                                isSystem: true,
                                description: '主要显示端，用于主要信息展示'
                            },
                            'display-2': {
                                id: 'display-2',
                                name: '副显示器',
                                source: 'builtin',
                                url: '',
                                width: 1500,
                                height: 400,
                                enabled: true,
                                isSystem: true,
                                description: '辅助显示端，用于补充信息展示'
                            }
                        }
                    };
                }
                
                // 兼容旧数据，补 serviceMode 等
                if (settings.meta && settings.meta.serviceMode === undefined) settings.meta.serviceMode = 'normal';
                if (settings.blurEnabled === undefined) settings.blurEnabled = DEFAULT_SETTINGS.blurEnabled;
                if (settings.lineNameMerge === undefined) settings.lineNameMerge = DEFAULT_SETTINGS.lineNameMerge;
                if (settings.enableApiServer === undefined) settings.enableApiServer = DEFAULT_SETTINGS.enableApiServer;
                if (settings.enableWebSocketBridge === undefined) settings.enableWebSocketBridge = DEFAULT_SETTINGS.enableWebSocketBridge;
                if (settings.wsPort === undefined) settings.wsPort = DEFAULT_SETTINGS.wsPort;
                if (settings.vehicleAudioEnabled === undefined) settings.vehicleAudioEnabled = DEFAULT_SETTINGS.vehicleAudioEnabled !== false;
            }
            // 新安装（无 s）或升级后都统一确保显示器1、2、3存在，避免卡片不显示
            ensureDisplayStructure();
        } catch (e) { 
            console.warn('Failed to load settings', e);
            ensureDisplayStructure();
        }
        applyThemeMode();
        applyBlurSetting();
    }

    function saveSettings() {
        // 在保存前，强制确保系统显示器的 isSystem 属性为 true（防止被覆盖）
        // display-1、display-2、display-3 是系统显示器，不允许删除
        if (settings.display && settings.display.displays) {
            if (settings.display.displays['display-1']) {
                settings.display.displays['display-1'].isSystem = true;
            }
            if (settings.display.displays['display-2']) {
                settings.display.displays['display-2'].isSystem = true;
            }
            if (settings.display.displays['display-3']) {
                settings.display.displays['display-3'].isSystem = true;
            }
        }
        
        localStorage.setItem('pids_settings_v1', JSON.stringify(settings));
        applyThemeMode();
        applyBlurSetting();
        
        // 同步设置到主进程的 electron-store（如果可用）
        if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.syncSettings) {
            try {
                // 创建一个可序列化的副本，移除不可序列化的内容
                const serializableSettings = JSON.parse(JSON.stringify(settings));
                // 再次确保系统显示器的保护（在序列化后也检查一次）
                if (serializableSettings.display && serializableSettings.display.displays) {
                    if (serializableSettings.display.displays['display-1']) {
                        serializableSettings.display.displays['display-1'].isSystem = true;
                    }
                    if (serializableSettings.display.displays['display-2']) {
                        serializableSettings.display.displays['display-2'].isSystem = true;
                    }
                    if (serializableSettings.display.displays['display-3']) {
                        serializableSettings.display.displays['display-3'].isSystem = true;
                    }
                }
                window.electronAPI.syncSettings(serializableSettings);
            } catch (e) {
                console.warn('[useSettings] 同步设置到主进程失败:', e);
            }
        }
    }

    function applyThemeMode() {
        const mode = settings.themeMode || 'system';
        const darkVariant = settings.darkVariant || 'soft';
        
        function setDark(on) { 
            if (on) document.documentElement.classList.add('dark'); 
            else document.documentElement.classList.remove('dark'); 
        }
        function setDarkVariant(v) { 
            document.documentElement.setAttribute('data-dark-variant', v || 'soft'); 
        }
        
        // 同步主题到 mica-electron（主窗口）
        function syncMicaTheme(isDark) {
            if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.mica) {
                try {
                    if (mode === 'system') {
                        // 系统模式：使用自动主题
                        if (typeof window.electronAPI.mica.setAutoTheme === 'function') {
                            window.electronAPI.mica.setAutoTheme();
                        }
                    } else if (isDark) {
                        // 深色模式
                        if (typeof window.electronAPI.mica.setDarkTheme === 'function') {
                            window.electronAPI.mica.setDarkTheme();
                        }
                    } else {
                        // 浅色模式
                        if (typeof window.electronAPI.mica.setLightTheme === 'function') {
                            window.electronAPI.mica.setLightTheme();
                        }
                    }
                } catch (e) {
                    console.warn('[useSettings] 同步主题到 mica-electron 失败:', e);
                }
            }
        }

        // 清理旧的系统主题监听
        if (systemThemeCleanup) {
            systemThemeCleanup();
            systemThemeCleanup = null;
        }
        
        if (mode === 'system') {
            if (window.matchMedia) {
                const mql = window.matchMedia('(prefers-color-scheme: dark)');
                const isDark = mql.matches;
                setDark(isDark);
                setDarkVariant(darkVariant);
                syncMicaTheme(isDark);
                
                // 监听系统主题变化
                const systemThemeListener = (e) => {
                    const isDarkNow = e.matches;
                    setDark(isDarkNow);
                    syncMicaTheme(isDarkNow);
                };
                
                if (mql.addEventListener) {
                    mql.addEventListener('change', systemThemeListener);
                    systemThemeCleanup = () => {
                        mql.removeEventListener('change', systemThemeListener);
                    };
                } else if (mql.addListener) {
                    // 兼容旧版 API
                    mql.addListener(systemThemeListener);
                    systemThemeCleanup = () => {
                        mql.removeListener(systemThemeListener);
                    };
                }
            } else {
                setDark(false);
                syncMicaTheme(false);
            }
        } else if (mode === 'dark') {
            setDark(true);
            setDarkVariant(darkVariant);
            syncMicaTheme(true);
        } else {
            setDark(false);
            syncMicaTheme(false);
        }
    }

    // 初始化加载
    loadSettings();

    return {
        settings,
        loadSettings,
        saveSettings,
        applyThemeMode,
        applyBlurSetting
    }
}
