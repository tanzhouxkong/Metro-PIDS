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
                    // 保持静默：不输出设备ID相关日志
                }
                // 始终使用 IPC 返回的ID，并更新 localStorage（确保一致性）
                localStorage.setItem(STORAGE_KEY, ipcDeviceId);
                return ipcDeviceId;
            }
        } catch (e) {
            console.warn('[useCloudConfig] ⚠️ 通过Electron IPC获取设备ID失败，降级到localStorage:', e);
        }
    }
    
    // 第二优先级：localStorage（覆盖安装不会丢失）
    let deviceId = localStorage.getItem(STORAGE_KEY);
    if (deviceId) {
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
 * 获取设备地理位置信息（优先使用操作系统原生 API，降级到浏览器 Geolocation API）
 * @returns {Promise<{country: string|null, city: string|null, latitude: number|null, longitude: number|null}>}
 */
async function getGeolocation() {
    const STORAGE_KEY_COUNTRY = 'metro_pids_location_country';
    const STORAGE_KEY_CITY = 'metro_pids_location_city';
    const STORAGE_KEY_LAT = 'metro_pids_location_lat';
    const STORAGE_KEY_LON = 'metro_pids_location_lon';
    const STORAGE_KEY_TIMESTAMP = 'metro_pids_location_timestamp';
    
    // 缓存有效期：24小时
    const CACHE_DURATION = 24 * 60 * 60 * 1000;
    
    // 先检查缓存
    const cachedTimestamp = localStorage.getItem(STORAGE_KEY_TIMESTAMP);
    if (cachedTimestamp) {
        const age = Date.now() - parseInt(cachedTimestamp, 10);
        if (age < CACHE_DURATION) {
            const cachedCountry = localStorage.getItem(STORAGE_KEY_COUNTRY);
            const cachedCity = localStorage.getItem(STORAGE_KEY_CITY);
            const cachedLat = localStorage.getItem(STORAGE_KEY_LAT);
            const cachedLon = localStorage.getItem(STORAGE_KEY_LON);
            
            return {
                country: cachedCountry || null,
                city: cachedCity || null,
                latitude: cachedLat ? parseFloat(cachedLat) : null,
                longitude: cachedLon ? parseFloat(cachedLon) : null
            };
        }
    }
    
    // 优先使用操作系统原生 API（通过 Electron IPC）
    if (typeof window !== 'undefined' && window.electronAPI && typeof window.electronAPI.getGeolocation === 'function') {
        try {
            const location = await Promise.race([
                window.electronAPI.getGeolocation(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('原生 API 超时')), 10000))
            ]);
            
            if (location && (location.country || location.city || location.latitude || location.longitude)) {
                // 保存到缓存
                if (location.country) localStorage.setItem(STORAGE_KEY_COUNTRY, location.country);
                if (location.city) localStorage.setItem(STORAGE_KEY_CITY, location.city);
                if (location.latitude !== null && location.latitude !== undefined) {
                    localStorage.setItem(STORAGE_KEY_LAT, location.latitude.toString());
                }
                if (location.longitude !== null && location.longitude !== undefined) {
                    localStorage.setItem(STORAGE_KEY_LON, location.longitude.toString());
                }
                localStorage.setItem(STORAGE_KEY_TIMESTAMP, Date.now().toString());
                
                return location;
            }
        } catch (nativeError) {
            console.warn('[useCloudConfig] ⚠️ 操作系统原生 API 获取地理位置失败，降级到浏览器 API:', nativeError.message);
        }
    }
    
    // 降级：尝试使用浏览器 Geolocation API
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
        try {
            const position = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(
                    resolve,
                    reject,
                    {
                        enableHighAccuracy: false,
                        timeout: 10000,
                        maximumAge: 3600000 // 1小时内的缓存位置可以使用
                    }
                );
            });
            
            const { latitude, longitude } = position.coords;
            
            // 使用反向地理编码 API 获取国家/城市信息
            // 这里使用免费的 Nominatim API（OpenStreetMap）
            try {
                const reverseGeocodeUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=10&addressdetails=1`;
                const response = await fetch(reverseGeocodeUrl, {
                    headers: {
                        'User-Agent': 'Metro-PIDS/1.0'
                    }
                });
                
                if (response.ok) {
                    const data = await response.json();
                    const address = data.address || {};
                    
                    // 提取国家代码（ISO 3166-1 alpha-2）
                    let country = address.country_code ? address.country_code.toUpperCase() : null;
                    // 如果没有 country_code，尝试从 country 字段提取
                    if (!country && address.country) {
                        // 简单的国家代码映射（常见国家）
                        const countryMap = {
                            '中国': 'CN',
                            'United States': 'US',
                            'United Kingdom': 'GB',
                            'Japan': 'JP',
                            'South Korea': 'KR',
                            'Germany': 'DE',
                            'France': 'FR'
                        };
                        country = countryMap[address.country] || null;
                    }
                    
                    const city = address.city || address.town || address.village || address.county || null;
                    
                    // 保存到缓存
                    if (country) localStorage.setItem(STORAGE_KEY_COUNTRY, country);
                    if (city) localStorage.setItem(STORAGE_KEY_CITY, city);
                    localStorage.setItem(STORAGE_KEY_LAT, latitude.toString());
                    localStorage.setItem(STORAGE_KEY_LON, longitude.toString());
                    localStorage.setItem(STORAGE_KEY_TIMESTAMP, Date.now().toString());
                    
                    return { country, city, latitude, longitude };
                }
            } catch (geocodeError) {
                console.warn('[useCloudConfig] ⚠️ 反向地理编码失败:', geocodeError);
            }
            
            // 如果反向地理编码失败，至少保存坐标
            localStorage.setItem(STORAGE_KEY_LAT, latitude.toString());
            localStorage.setItem(STORAGE_KEY_LON, longitude.toString());
            localStorage.setItem(STORAGE_KEY_TIMESTAMP, Date.now().toString());
            
            return { country: null, city: null, latitude, longitude };
        } catch (error) {
            console.warn('[useCloudConfig] ⚠️ 获取地理位置失败:', error.message);
            
            // 如果获取失败，尝试使用缓存的旧数据（即使过期）
            const cachedCountry = localStorage.getItem(STORAGE_KEY_COUNTRY);
            const cachedCity = localStorage.getItem(STORAGE_KEY_CITY);
            
            if (cachedCountry || cachedCity) {
                return {
                    country: cachedCountry || null,
                    city: cachedCity || null,
                    latitude: null,
                    longitude: null
                };
            }
        }
    }
    
    return { country: null, city: null, latitude: null, longitude: null };
}

/**
 * 云控配置管理
 * @param {string} apiBase - Cloudflare Worker API 地址
 * @param {string} token - 可选的认证 Token
 * @returns {Object} 云控配置管理方法
 */
export function useCloudConfig(apiBase, token = null) {
    // 缓存地理位置信息（避免每次请求都获取）
    let cachedLocation = null;
    let locationCacheTime = 0;
    const LOCATION_CACHE_DURATION = 60 * 60 * 1000; // 1小时
    
    // 后台更新地理位置（不阻塞请求）
    function updateLocationInBackground() {
        getGeolocation().then(location => {
            cachedLocation = location;
            locationCacheTime = Date.now();
        }).catch(e => {
            // 忽略错误
            console.warn('[useCloudConfig] 后台更新地理位置失败:', e);
        });
    }
    
    // 获取请求头（包含地理位置信息）
    async function getHeaders(needsBody = false) {
        const headers = {
            'Accept': 'application/json'
        };
        if (needsBody) {
            headers['Content-Type'] = 'application/json';
        }
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        
        // 添加地理位置信息到请求头（优先使用缓存）
        try {
            let location = cachedLocation;
            const cacheAge = Date.now() - locationCacheTime;
            
            // 如果缓存过期或不存在，尝试从 localStorage 读取
            if (!location || cacheAge > LOCATION_CACHE_DURATION) {
                const cachedCountry = localStorage.getItem('metro_pids_location_country');
                const cachedCity = localStorage.getItem('metro_pids_location_city');
                if (cachedCountry || cachedCity) {
                    location = {
                        country: cachedCountry || null,
                        city: cachedCity || null,
                        latitude: null,
                        longitude: null
                    };
                    cachedLocation = location;
                    locationCacheTime = Date.now();
                }
                
                // 后台更新地理位置（不阻塞当前请求）
                updateLocationInBackground();
            }
            
            if (location) {
                if (location.country) {
                    headers['X-Client-Country'] = location.country;
                }
                if (location.city) {
                    headers['X-Client-City'] = location.city;
                }
            }
        } catch (e) {
            // 忽略定位错误，不影响请求
            console.warn('[useCloudConfig] 添加地理位置到请求头失败:', e);
        }
        try {
            headers['X-Device-Id'] = getDeviceId();
        } catch (e) {
            // 忽略设备 ID 获取失败
        }
        return headers;
    }
    
    // 初始化时后台获取地理位置
    if (typeof window !== 'undefined') {
        updateLocationInBackground();
    }

    // 发送请求（直接使用 fetch，Electron 环境支持跨域请求）
    async function request(method, path, data = null) {
        const url = `${apiBase.replace(/\/+$/, '')}${path}`;
        
        // 获取请求头（包含地理位置信息）
        const headers = await getHeaders(!!data);
        
        const options = {
            method,
            headers
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

    // ==================== 启动公告配置 ====================
    async function getStartupNotice() {
        return await request('GET', '/startup-notice');
    }
    async function updateStartupNotice(config) {
        return await request('PUT', '/startup-notice', config);
    }

    // ==================== 显示端功能开关 ====================
    async function getDisplayFlags() {
        return await request('GET', '/display-flags');
    }
    async function updateDisplayFlags(config) {
        return await request('PUT', '/display-flags', config);
    }

    /**
     * 从云端拉取显示端开关并写入 uiState（供 App 启动时与设置页「刷新云控显示端开关」调用）
     * @param {Object} uiState - 来自 useUIState() 的 uiState（reactive）
     * @returns {{ ok: boolean, config?: object, error?: string }}
     */
    async function syncDisplayFlags(uiState) {
        try {
            const res = await getDisplayFlags();
            const cfg = res?.config ?? res?.data?.config ?? res ?? null;

            if (cfg && cfg._isEffective === false) {
                if (uiState) {
                    uiState.showSystemDisplayOption = true;
                    // 不生效时：不应用每显示器开关（兼容旧服务端返回仍带 enabled=false 的情况）
                    uiState.displayFlags = cfg ? { ...cfg, displays: null } : null;
                }
                return { ok: true, config: cfg };
            }

            if (uiState) {
                if (cfg && typeof cfg.showSystemDisplayOption === 'boolean') {
                    uiState.showSystemDisplayOption = !!cfg.showSystemDisplayOption;
                }
                // 确保赋值新对象以触发响应式更新
                uiState.displayFlags = cfg ? { ...cfg } : null;
            }
            return { ok: true, config: cfg };
        } catch (e) {
            console.warn('[useCloudConfig] 获取显示端功能开关失败（未连接成功时使用本地默认）:', e);
            if (uiState) {
                uiState.showSystemDisplayOption = true;
                uiState.displayFlags = null;
            }
            return { ok: false, error: e?.message || String(e) };
        }
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
        
        const result = await request('POST', '/telemetry', payload);
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

        // 启动公告
        getStartupNotice,
        updateStartupNotice,

        // 显示端功能开关
        getDisplayFlags,
        updateDisplayFlags,
        syncDisplayFlags,   // 拉取并写入 uiState（App 启动 / 设置页刷新）
        
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
        
        // 地理位置
        getGeolocation,     // 获取设备地理位置信息
        
        // 更新日志和安装包
        getReleases,        // 获取 Releases 列表
        getLatestRelease    // 获取最新版本信息
    };
}
