/**
 * 云控配置管理 Composables
 * 用于从 Cloudflare Worker 获取运控更新线路、彩蛋配置、节日配置等
 */

/**
 * 固定的云控 API 地址（不可修改）
 */
export const CLOUD_API_BASE = 'https://metro.tanzhouxiang.dpdns.org';

/**
 * 生成或获取设备唯一ID（多层级存储：Electron IPC -> localStorage -> 随机生成）
 * 按照极光推送的规则：优先从文件系统读取，其次综合设备特征，最后使用localStorage
 * @returns {Promise<string>|string} 设备ID（同步版本返回字符串，可能使用缓存的localStorage值）
 */
async function getDeviceIdAsync() {
    const STORAGE_KEY = 'metro_pids_device_id';
    
    // 第一优先级：Electron IPC（从主进程文件系统获取，卸载后重装仍可能保留）
    // 这是最权威的设备ID来源，与开发者窗口显示的一致
    if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.getDeviceId) {
        try {
            const result = await window.electronAPI.getDeviceId();
            if (result && result.ok && result.deviceId) {
                const ipcDeviceId = result.deviceId;
                // 检查 localStorage 中是否有不同的ID（可能是旧版本生成的）
                const cachedId = localStorage.getItem(STORAGE_KEY);
                if (cachedId && cachedId !== ipcDeviceId) {
                    console.log('[useCloudConfig] ⚠️ 发现设备ID不一致:', {
                        cached: cachedId.substring(0, 12) + '...',
                        ipc: ipcDeviceId.substring(0, 12) + '...',
                        action: '使用 IPC 返回的ID并更新缓存'
                    });
                }
                // 始终使用 IPC 返回的ID，并更新 localStorage（确保一致性）
                localStorage.setItem(STORAGE_KEY, ipcDeviceId);
                console.log('[useCloudConfig] ✅ 从 Electron IPC 获取设备ID:', ipcDeviceId.substring(0, 12) + '...');
                return ipcDeviceId;
            }
        } catch (e) {
            console.warn('[useCloudConfig] ⚠️ 通过Electron IPC获取设备ID失败，降级到localStorage:', e);
        }
    }
    
    // 第二优先级：localStorage（覆盖安装不会丢失）
    let deviceId = localStorage.getItem(STORAGE_KEY);
    if (deviceId) {
        console.log('[useCloudConfig] 📦 从 localStorage 获取设备ID（缓存）:', deviceId.substring(0, 12) + '...');
        return deviceId;
    }
    
    // 第三优先级：Web环境下的降级方案（生成随机ID）
    // 生成 UUID v4（仅在 Web 环境或所有方法都失败时使用）
    deviceId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
    localStorage.setItem(STORAGE_KEY, deviceId);
    console.log('[useCloudConfig] 🆕 生成新的设备ID（UUID格式）:', deviceId.substring(0, 12) + '...');
    return deviceId;
}

/**
 * 同步版本：优先使用localStorage缓存，需要时调用异步版本更新
 * @returns {string} 设备ID
 */
function getDeviceId() {
    const STORAGE_KEY = 'metro_pids_device_id';
    let deviceId = localStorage.getItem(STORAGE_KEY);
    
    // 如果有缓存，直接返回
    if (deviceId) {
        // 异步尝试从Electron IPC更新（不阻塞）
        if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.getDeviceId) {
            window.electronAPI.getDeviceId().then(result => {
                if (result && result.ok && result.deviceId && result.deviceId !== deviceId) {
                    // 如果IPC返回的ID不同，更新localStorage
                    localStorage.setItem(STORAGE_KEY, result.deviceId);
                }
            }).catch(() => {
                // 忽略错误
            });
        }
        return deviceId;
    }
    
    // 如果没有缓存，生成临时ID（异步更新会在后台进行）
    // 生成 UUID v4
    deviceId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
    localStorage.setItem(STORAGE_KEY, deviceId);
    
    // 异步尝试从Electron IPC获取真实ID
    if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.getDeviceId) {
        window.electronAPI.getDeviceId().then(result => {
            if (result && result.ok && result.deviceId) {
                localStorage.setItem(STORAGE_KEY, result.deviceId);
            }
        }).catch(() => {
            // 忽略错误
        });
    }
    
    return deviceId;
}

/**
 * 云控配置管理
 * @param {string} apiBase - Cloudflare Worker API 地址
 * @param {string} token - 可选的认证 Token
 * @returns {Object} 云控配置管理方法
 */
export function useCloudConfig(apiBase, token = null) {
    // 获取请求头
    function getHeaders(needsBody = false) {
        const headers = {
            'Accept': 'application/json'
        };
        if (needsBody) {
            headers['Content-Type'] = 'application/json';
        }
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        return headers;
    }

    // 发送请求（直接使用 fetch，Electron 环境支持跨域请求）
    async function request(method, path, data = null) {
        const url = `${apiBase.replace(/\/+$/, '')}${path}`;
        
        const logData = data ? {
            ...data,
            deviceId: data.deviceId ? (data.deviceId.length > 8 ? data.deviceId.substring(0, 8) + '...' : data.deviceId) : 'missing'
        } : null;
        console.log(`[useCloudConfig] 📤 发送请求: ${method} ${url}`, logData);
        
        const options = {
            method,
            headers: getHeaders(!!data)
        };
        
        if (data) {
            options.body = JSON.stringify(data);
        }
        
        try {
            const response = await fetch(url, options);
            let result;
            try {
                const responseText = await response.text();
                if (!responseText) {
                    result = {};
                } else {
                    result = JSON.parse(responseText);
                }
            } catch (parseError) {
                console.error('[useCloudConfig] ❌ 响应解析失败:', parseError);
                throw new Error(`响应解析失败: ${parseError.message}`);
            }
            
            console.log(`[useCloudConfig] 📥 响应: ${response.status}`, result);
            
            if (!response.ok) {
                const errorMsg = result.error || result.message || `HTTP ${response.status}`;
                console.error(`[useCloudConfig] ❌ 请求失败 (${response.status}):`, errorMsg);
                throw new Error(errorMsg);
            }
            
            // 如果服务器返回的格式是 { ok: true, ... }，直接返回；否则包装为 { ok: true, data: result }
            if (result && typeof result === 'object' && 'ok' in result) {
                return result;
            }
            return { ok: true, data: result };
        } catch (e) {
            console.error('[useCloudConfig] ❌ 请求异常:', e);
            return { ok: false, error: e.message || String(e) };
        }
    }

    // ==================== 运控更新线路 ====================
    
    /**
     * 获取所有运控线路列表
     */
    async function getRuntimeLines() {
        return await request('GET', '/runtime/lines');
    }

    /**
     * 获取单个运控线路
     * @param {string} lineName - 线路名称
     */
    async function getRuntimeLine(lineName) {
        return await request('GET', `/runtime/lines/${encodeURIComponent(lineName)}`);
    }

    /**
     * 更新/创建运控线路
     * @param {string} lineName - 线路名称
     * @param {Object} lineData - 线路数据
     */
    async function updateRuntimeLine(lineName, lineData) {
        return await request('PUT', `/runtime/lines/${encodeURIComponent(lineName)}`, lineData);
    }

    /**
     * 删除运控线路
     * @param {string} lineName - 线路名称
     */
    async function deleteRuntimeLine(lineName) {
        return await request('DELETE', `/runtime/lines/${encodeURIComponent(lineName)}`);
    }

    // ==================== 彩蛋配置 ====================
    
    /**
     * 获取彩蛋配置
     */
    async function getEasterEggs() {
        return await request('GET', '/easter-eggs');
    }

    /**
     * 更新彩蛋配置
     * @param {Object} config - 彩蛋配置
     */
    async function updateEasterEggs(config) {
        return await request('PUT', '/easter-eggs', config);
    }

    // ==================== 新年灯笼配置 ====================
    async function getNewYearLantern() {
        return await request('GET', '/new-year-lantern');
    }
    async function updateNewYearLantern(config) {
        return await request('PUT', '/new-year-lantern', config);
    }

    // ==================== 节日配置 ====================
    
    /**
     * 获取节日配置
     */
    async function getHolidays() {
        return await request('GET', '/holidays');
    }

    /**
     * 更新节日配置
     * @param {Object} config - 节日配置
     */
    async function updateHolidays(config) {
        return await request('PUT', '/holidays', config);
    }

    /**
     * 获取当前激活的节日
     */
    async function getActiveHolidays() {
        return await request('GET', '/holidays/active');
    }

    // ==================== 使用统计上报 ====================
    
    /**
     * 上报使用统计（设备ID、版本等信息）
     * @param {string} version - 应用版本号（可选，默认自动获取）
     */
    async function sendTelemetry(version = null) {
        if (!version) {
            // 优先使用 Electron API 获取应用版本号
            try {
                if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.getAppVersion) {
                    const versionResult = await window.electronAPI.getAppVersion();
                    if (versionResult && versionResult.ok && versionResult.version) {
                        version = versionResult.version;
                    }
                }
            } catch (e) {
                console.warn('[useCloudConfig] 通过Electron API获取版本号失败:', e);
            }
            
            // 如果 Electron API 获取失败，尝试其他方式
            if (!version || version === 'unknown') {
                try {
                    // 尝试从 window.__METRO_PIDS_VERSION 获取
                    if (typeof window !== 'undefined' && window.__METRO_PIDS_VERSION) {
                        version = window.__METRO_PIDS_VERSION;
                    } 
                    // 尝试从 process.env 获取
                    else if (typeof process !== 'undefined' && process.env?.npm_package_version) {
                        version = process.env.npm_package_version;
                    }
                    // 尝试从 package.json 读取（如果可用）
                    else if (typeof window !== 'undefined' && window.APP_VERSION) {
                        version = window.APP_VERSION;
                    }
                    // 默认值
                    else {
                        version = 'unknown';
                    }
                } catch (e) {
                    version = 'unknown';
                }
            }
        }
        
        // 使用统一的设备ID获取方法（与开发者窗口保持一致）
        const deviceId = await getDeviceIdAsync();
        
        if (!deviceId) {
            console.error('[useCloudConfig] ❌ 无法获取设备ID，跳过统计上报');
            return { ok: false, error: '无法获取设备ID' };
        }
        
        console.log('[useCloudConfig] 📱 获取到的设备ID:', {
            id: deviceId.substring(0, 12) + '...',
            length: deviceId.length,
            format: deviceId.startsWith('device-') ? '随机生成' : deviceId.length === 32 ? '哈希生成' : 'UUID格式'
        });
        
        // 获取平台信息
        let platform = 'unknown';
        if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.platform) {
            platform = window.electronAPI.platform;
        } else if (typeof navigator !== 'undefined') {
            platform = navigator.platform;
        }
        
        // 获取系统版本信息
        let osVersion = null;
        if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.getOSVersion) {
            try {
                const osResult = await window.electronAPI.getOSVersion();
                if (osResult && osResult.ok && osResult.osVersion) {
                    osVersion = osResult.osVersion;
                }
            } catch (e) {
                // 忽略错误，使用降级方案
            }
        }
        
        const payload = {
            version,
            deviceId,
            platform,
            osVersion: osVersion || undefined // 只在有值时发送
        };
        
        console.log('[useCloudConfig] 📊 准备上报统计信息:', {
            version,
            deviceId: deviceId.substring(0, 12) + '...',
            platform,
            osVersion: osVersion || 'none'
        });
        
        const result = await request('POST', '/telemetry', payload);
        
        if (result && result.ok) {
            console.log('[useCloudConfig] ✅ 统计信息上报成功，记录ID:', result.id || result.data?.id);
        } else {
            console.warn('[useCloudConfig] ⚠️ 统计信息上报失败:', result?.error || '未知错误');
        }
        
        return result;
    }

    // ==================== 更新日志和安装包 ====================
    
    /**
     * 获取 GitHub Releases 列表（通过 Cloudflare Worker 代理）
     */
    async function getReleases() {
        return await request('GET', '/releases');
    }
    
    /**
     * 获取最新版本信息（通过 Cloudflare Worker 代理）
     */
    async function getLatestRelease() {
        return await request('GET', '/releases/latest');
    }

    return {
        // 运控更新线路
        getRuntimeLines,
        getRuntimeLine,
        updateRuntimeLine,
        deleteRuntimeLine,
        
        // 彩蛋配置
        getEasterEggs,
        updateEasterEggs,
        
        // 新年灯笼配置
        getNewYearLantern,
        updateNewYearLantern,
        
        // 节日配置
        getHolidays,
        updateHolidays,
        getActiveHolidays,
        
        // 使用统计
        sendTelemetry,
        getDeviceId,        // 同步版本（返回localStorage缓存或临时生成）
        getDeviceIdAsync,   // 异步版本（优先从Electron IPC获取）
        
        // 更新日志和安装包
        getReleases,        // 获取 Releases 列表
        getLatestRelease    // 获取最新版本信息
    };
}
