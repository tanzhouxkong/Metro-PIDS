/**
 * Metro-PIDS Cloudflare Worker
 * 提供预设线路、运控线路、更新日志、统计信息等 API 服务
 */

// ==================== 工具函数 ====================

/**
 * 读取请求 JSON 体
 */
async function readJson(request) {
  const text = await request.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error('Invalid JSON: ' + e.message);
  }
}

/**
 * 创建 JSON 响应
 */
function json(obj, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...extraHeaders
    }
  });
}

/**
 * 获取 CORS 头
 */
function getCorsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization'
  };
}

/**
 * 获取 GitHub API Token
 */
function getGitHubToken(env) {
  if (env.GITHUB_TOKEN) return env.GITHUB_TOKEN;
  if (env.CLOUD_TOKEN && env.CLOUD_TOKEN.startsWith('github_pat_')) {
    return env.CLOUD_TOKEN;
  }
  return null;
}

/**
 * 构建 GitHub API 请求头
 */
function getGitHubHeaders(env) {
  const headers = {
    'User-Agent': 'Metro-PIDS-Cloudflare-Worker/2.0',
    'Accept': 'application/vnd.github.v3+json'
  };
  const token = getGitHubToken(env);
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

/**
 * 检查写操作权限
 */
function checkWriteAuth(request, env) {
  const expectedToken = env.CLOUD_TOKEN;
  if (!expectedToken) return true; // 未配置 token 则允许
  
  const auth = request.headers.get('Authorization') || '';
  return auth === `Bearer ${expectedToken}`;
}

// ==================== 路由处理器 ====================

/**
 * 预设线路 API
 */
const PresetLinesHandler = {
  // GET /preset - 获取所有预设线路
  async list(env) {
    const list = await env.LINES.list();
    const lines = [];
    for (const key of list.keys) {
      // 跳过运控线路和统计记录
      if (key.name.startsWith('runtime:') || key.name.startsWith('telemetry:')) {
        continue;
      }
      const raw = await env.LINES.get(key.name);
      if (!raw) continue;
      try {
        lines.push(JSON.parse(raw));
      } catch {
        // 忽略损坏的数据
      }
    }
    return { ok: true, lines };
  },

  // GET /preset/:lineName - 获取单个预设线路
  async get(env, lineName) {
    const raw = await env.LINES.get(lineName);
    if (!raw) {
      throw { status: 404, error: '预设线路不存在' };
    }
    return { ok: true, line: JSON.parse(raw) };
  },

  // POST /preset - 创建预设线路
  async create(env, body) {
    if (!body?.meta?.lineName) {
      throw { status: 400, error: '缺少 meta.lineName' };
    }
    const key = String(body.meta.lineName);
    const exists = await env.LINES.get(key);
    if (exists) {
      throw { status: 409, error: '该预设线路已存在，请使用 PUT 更新' };
    }
    await env.LINES.put(key, JSON.stringify(body));
    return { ok: true, line: body };
  },

  // PUT /preset/:lineName - 更新预设线路
  async update(env, lineName, body) {
    if (!body?.meta?.lineName) {
      throw { status: 400, error: '缺少 meta.lineName' };
    }
    if (body.meta.lineName !== lineName) {
      throw { status: 400, error: 'URL 与 body 中的 lineName 不一致' };
    }
    await env.LINES.put(lineName, JSON.stringify(body));
    return { ok: true, line: body };
  },

  // DELETE /preset/:lineName - 删除预设线路
  async delete(env, lineName) {
    await env.LINES.delete(lineName);
    return { ok: true };
  }
};

/**
 * 运控线路 API
 */
const RuntimeLinesHandler = {
  PREFIX: 'runtime:',

  // GET /runtime/lines - 获取所有运控线路
  async list(env) {
    const list = await env.LINES.list({ prefix: this.PREFIX });
    const lines = [];
    for (const k of list.keys) {
      const raw = await env.LINES.get(k.name);
      if (raw) {
        try {
          lines.push(JSON.parse(raw));
        } catch {
          // 忽略损坏的数据
        }
      }
    }
    return { lines };
  },

  // GET /runtime/lines/:lineName - 获取单个运控线路
  async get(env, lineName) {
    const key = this.PREFIX + lineName;
    let raw = await env.LINES.get(key);

    // 兼容老数据：如果按 key 直接获取不到，尝试根据 meta.lineName 搜索
    if (!raw) {
      const list = await env.LINES.list({ prefix: this.PREFIX });
      for (const k of list.keys) {
        const value = await env.LINES.get(k.name);
        if (!value) continue;
        try {
          const json = JSON.parse(value);
          const metaName = json?.meta?.lineName;
          if (metaName && String(metaName) === String(lineName)) {
            raw = value;
            break;
          }
        } catch {
          // 忽略解析失败的数据
        }
      }
    }

    if (!raw) {
      throw { status: 404, error: '运控线路不存在' };
    }

    return JSON.parse(raw);
  },

  // PUT /runtime/lines/:lineName - 更新/创建运控线路
  async update(env, lineName, body) {
    if (!body?.meta?.lineName) {
      throw { status: 400, error: '缺少 meta.lineName' };
    }
    if (body.meta.lineName !== lineName) {
      throw { status: 400, error: 'URL 与 body 中的 lineName 不一致' };
    }
    const key = this.PREFIX + lineName;
    await env.LINES.put(key, JSON.stringify(body));
    return { ok: true, line: body };
  },

  // DELETE /runtime/lines/:lineName - 删除运控线路
  async delete(env, lineName) {
    const key = this.PREFIX + lineName;
    await env.LINES.delete(key);
    return { ok: true };
  }
};

/**
 * GitHub Releases API
 */
const ReleasesHandler = {
  REPO_URL: 'https://api.github.com/repos/tanzhouxkong/Metro-PIDS',
  CACHE_KEY: 'config:releases',
  CACHE_TTL: 3600, // 缓存 1 小时（3600 秒）

  // 从 GitHub API 获取 Releases
  async fetchFromGitHub(env) {
    const apiUrl = this.REPO_URL + '/releases';
    console.log('[Releases] 📥 从 GitHub API 获取 Releases...');
    console.log('[Releases] 请求 URL:', apiUrl);
    
    const headers = getGitHubHeaders(env);
    const hasToken = !!headers['Authorization'];
    console.log('[Releases] 使用 Token:', hasToken ? '是（已配置）' : '否（未配置）');
    
    const response = await fetch(apiUrl, { headers });
    
    console.log('[Releases] GitHub API 响应状态:', response.status);
    
    if (!response.ok) {
      let errorDetail = `GitHub API ${response.status}`;
      let errorMessage = '';
      try {
        const errorBody = await response.text();
        if (errorBody) {
          const errorJson = JSON.parse(errorBody);
          errorMessage = errorJson.message || '';
          errorDetail = errorMessage || errorDetail;
          console.error('[Releases] ❌ GitHub API 错误详情:', errorDetail);
        }
      } catch (e) {
        console.error('[Releases] 解析错误响应失败:', e);
      }
      
      if (response.status === 404) {
        throw { 
          status: response.status, 
          error: `仓库未找到 (404)。请检查仓库名称是否正确: ${this.REPO_URL}`,
          detail: errorMessage || '可能是仓库名称错误、仓库不存在、或仓库是私有的但 Token 权限不足'
        };
      }
      
      if (response.status === 403) {
        throw { 
          status: response.status, 
          error: 'GitHub API 访问受限（可能是速率限制或 Token 无效），请检查 GITHUB_TOKEN 配置',
          detail: errorDetail
        };
      }
      
      throw { status: response.status, error: `GitHub API 错误: ${response.status}`, detail: errorDetail };
    }
    
    const releases = await response.json();
    console.log('[Releases] ✅ 从 GitHub 成功获取', releases?.length || 0, '个 Releases');
    
    const recentReleases = (releases || []).slice(0, 10).map(release => ({
      tag_name: release.tag_name,
      name: release.name,
      body: release.body,
      published_at: release.published_at,
      html_url: release.html_url,
      prerelease: release.prerelease,
      draft: release.draft,
      assets: (release.assets || []).map(asset => ({
        name: asset.name,
        browser_download_url: asset.browser_download_url,
        size: asset.size,
        content_type: asset.content_type,
        download_count: asset.download_count
      }))
    }));
    
    return recentReleases;
  },

  // GET /releases - 获取 Releases 列表（优先从 KV 缓存读取）
  async list(env) {
    try {
      // 1. 先尝试从 KV 缓存读取
      const cached = await env.LINES.get(this.CACHE_KEY);
      if (cached) {
        try {
          const cachedData = JSON.parse(cached);
          const now = Date.now();
          const cacheTime = cachedData.timestamp || 0;
          const age = now - cacheTime;
          
          // 如果缓存未过期（1小时内），直接返回缓存数据
          if (age < this.CACHE_TTL * 1000) {
            console.log('[Releases] ✅ 从 KV 缓存读取，缓存年龄:', Math.floor(age / 1000), '秒');
            return { ok: true, releases: cachedData.releases || [], cached: true };
          } else {
            console.log('[Releases] ⚠️ KV 缓存已过期，年龄:', Math.floor(age / 1000), '秒，重新从 GitHub 获取');
          }
        } catch (e) {
          console.warn('[Releases] ⚠️ KV 缓存数据解析失败，重新从 GitHub 获取:', e);
        }
      } else {
        console.log('[Releases] 📦 KV 缓存不存在，从 GitHub 获取');
      }
      
      // 2. 从 GitHub API 获取
      const recentReleases = await this.fetchFromGitHub(env);
      
      // 3. 保存到 KV 缓存
      try {
        const cacheData = {
          releases: recentReleases,
          timestamp: Date.now()
        };
        await env.LINES.put(this.CACHE_KEY, JSON.stringify(cacheData));
        console.log('[Releases] ✅ 已保存到 KV 缓存');
      } catch (saveError) {
        console.warn('[Releases] ⚠️ 保存到 KV 缓存失败（不影响返回）:', saveError);
      }
      
      console.log('[Releases] ✅ 返回', recentReleases.length, '个最近的 Releases');
      return { ok: true, releases: recentReleases, cached: false };
    } catch (error) {
      console.error('[Releases] ❌ 获取 Releases 失败:', error);
      
      // 如果 GitHub API 失败，尝试返回缓存数据（即使过期）
      try {
        const cached = await env.LINES.get(this.CACHE_KEY);
        if (cached) {
          const cachedData = JSON.parse(cached);
          if (cachedData.releases && cachedData.releases.length > 0) {
            console.log('[Releases] ⚠️ GitHub API 失败，返回过期缓存数据');
            return { ok: true, releases: cachedData.releases, cached: true, stale: true };
          }
        }
      } catch (e) {
        console.warn('[Releases] 无法读取缓存作为降级方案:', e);
      }
      
      throw error;
    }
  },

  // GET /releases/latest - 获取最新版本（从缓存或 GitHub API）
  async latest(env, origin) {
    try {
      // 1. 先尝试从缓存读取
      const cached = await env.LINES.get(this.CACHE_KEY);
      if (cached) {
        try {
          const cachedData = JSON.parse(cached);
          if (cachedData.releases && cachedData.releases.length > 0) {
            // 从缓存中取第一个（最新的）release
            const latestRelease = cachedData.releases[0];
            console.log('[Releases] ✅ 从 KV 缓存读取最新版本:', latestRelease.tag_name);
            return {
              ok: true,
              version: latestRelease.tag_name ? latestRelease.tag_name.replace(/^v/, '') : '',
              tag_name: latestRelease.tag_name,
              name: latestRelease.name,
              body: latestRelease.body,
              published_at: latestRelease.published_at,
              html_url: latestRelease.html_url,
              prerelease: latestRelease.prerelease,
              draft: latestRelease.draft,
              assets: (latestRelease.assets || []).map(asset => ({
                name: asset.name,
                browser_download_url: asset.browser_download_url,
                proxy_download_url: `${origin}/releases/download/${latestRelease.tag_name}/${asset.name}`,
                size: asset.size,
                content_type: asset.content_type,
                download_count: asset.download_count
              }))
            };
          }
        } catch (e) {
          console.warn('[Releases] ⚠️ 缓存数据解析失败，从 GitHub 获取最新版本:', e);
        }
      }
      
      // 2. 如果缓存不存在，从 GitHub API 获取
      console.log('[Releases] 📥 从 GitHub API 获取最新版本...');
      const response = await fetch(this.REPO_URL + '/releases/latest', {
        headers: getGitHubHeaders(env)
      });
      
      if (!response.ok) {
        throw { status: response.status, error: `GitHub API 错误: ${response.status}` };
      }
      
      const release = await response.json();
      console.log('[Releases] ✅ 从 GitHub 获取最新版本:', release.tag_name);
      
      return {
        ok: true,
        version: release.tag_name ? release.tag_name.replace(/^v/, '') : '',
        tag_name: release.tag_name,
        name: release.name,
        body: release.body,
        published_at: release.published_at,
        html_url: release.html_url,
        prerelease: release.prerelease,
        draft: release.draft,
        assets: (release.assets || []).map(asset => ({
          name: asset.name,
          browser_download_url: asset.browser_download_url,
          proxy_download_url: `${origin}/releases/download/${release.tag_name}/${asset.name}`,
          size: asset.size,
          content_type: asset.content_type,
          download_count: asset.download_count
        }))
      };
    } catch (error) {
      console.error('[Releases] ❌ 获取最新版本失败:', error);
      throw error;
    }
  },

  // GET /releases/download/:tag/:file - 代理下载
  async download(tagName, fileName) {
    const downloadUrl = `https://github.com/tanzhouxkong/Metro-PIDS/releases/download/${tagName}/${fileName}`;
    return new Response(null, {
      status: 301,
      headers: {
        'Location': downloadUrl,
        ...getCorsHeaders()
      }
    });
  }
};

/**
 * 更新日志 API
 */
const ChangelogHandler = {
  REPO_URL: 'https://api.github.com/repos/tanzhouxkong/Metro-PIDS/releases',
  CACHE_TTL: 300, // 5 分钟
  KEY: 'config:changelog',

  // 从 GitHub 获取并转换为 changelog 格式
  async fetchFromGitHub(env) {
    const response = await fetch(this.REPO_URL, {
      headers: getGitHubHeaders(env)
    });
    
    if (!response.ok) {
      let errorDetail = `GitHub API ${response.status}`;
      try {
        const errorBody = await response.text();
        if (errorBody) {
          const errorJson = JSON.parse(errorBody);
          errorDetail = errorJson.message || errorDetail;
        }
      } catch {}
      
      if (response.status === 403) {
        throw { 
          status: 503,
          error: 'GitHub API 访问受限（可能是速率限制），请稍后重试',
          detail: errorDetail
        };
      }
      
      throw { status: response.status, error: errorDetail };
    }
    
    const releases = await response.json();
    return (releases || []).slice(0, 20).map(r => ({
      version: (r.tag_name || '').replace(/^v/, ''),
      title: r.name || `版本 ${(r.tag_name || '').replace(/^v/, '')}`,
      content: r.body || '',
      releaseDate: r.published_at || new Date().toISOString(),
      prerelease: !!r.prerelease
    }));
  },

  // GET /update/changelog
  async get(env, request) {
    const url = new URL(request.url);
    const force = url.searchParams.get('force') === '1';
    const source = url.searchParams.get('source') || 'auto';

    // 1. 优先从 KV 读取（除非显式指定 source=github）
    if (source !== 'github') {
      try {
        const stored = await env.LINES.get(this.KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          const list = Array.isArray(parsed?.changelog)
            ? parsed.changelog
            : (Array.isArray(parsed) ? parsed : []);
          if (list.length > 0) {
            return { changelog: list, source: 'kv' };
          }
        }
      } catch (e) {
        console.warn('[Changelog] 读取 KV 配置失败，回退到 GitHub 缓存/实时获取:', e);
      }
    }

    // 2. 构建 GitHub 缓存键
    const githubHeaders = getGitHubHeaders(env);
    const cacheKey = new Request(this.REPO_URL, { headers: githubHeaders });
    
    // 3. 如果不是强制刷新，尝试从 Cloudflare Cache 读取 GitHub Releases
    if (!force) {
      const cached = await caches.default.match(cacheKey);
      if (cached) {
        const cachedData = await cached.json();
        const list = (cachedData || []).slice(0, 20).map(r => ({
          version: (r.tag_name || '').replace(/^v/, ''),
          title: r.name || `版本 ${(r.tag_name || '').replace(/^v/, '')}`,
          content: r.body || '',
          releaseDate: r.published_at || new Date().toISOString(),
          prerelease: !!r.prerelease
        }));
        return { changelog: list, cached: true, source: 'github-cache' };
      }
    }
    
    // 4. 从 GitHub 实时获取
    const changelog = await this.fetchFromGitHub(env);
    
    // 5. 更新 Cloudflare Cache（GitHub 原始响应）
    try {
      const githubRaw = await fetch(this.REPO_URL, { headers: githubHeaders }).then(r => r.json());
      const cacheResponse = new Response(JSON.stringify(githubRaw), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${this.CACHE_TTL}` }
      });
      await caches.default.put(cacheKey, cacheResponse);
    } catch (e) {
      console.warn('[Changelog] 更新 GitHub 缓存失败（忽略）:', e);
    }

    // 6. 同步一份到 KV，便于前端只读场景直接使用
    try {
      await env.LINES.put(this.KEY, JSON.stringify({ changelog, updatedAt: new Date().toISOString() }));
    } catch (e) {
      console.warn('[Changelog] 将 GitHub 更新日志写入 KV 失败（忽略）:', e);
    }
    
    return { changelog, source: 'github' };
  },

  // POST /update/changelog/sync/github - 强制同步
  async sync(env) {
    // 清除缓存
    const githubHeaders = getGitHubHeaders(env);
    const cacheKey = new Request(this.REPO_URL, { headers: githubHeaders });
    await caches.default.delete(cacheKey);
    
    // 从 GitHub 获取
    const changelog = await this.fetchFromGitHub(env);
    
    // 更新缓存（GitHub 原始响应）
    try {
      const githubRaw = await fetch(this.REPO_URL, { headers: githubHeaders }).then(r => r.json());
      const cacheResponse = new Response(JSON.stringify(githubRaw), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${this.CACHE_TTL}` }
      });
      await caches.default.put(cacheKey, cacheResponse);
    } catch (e) {
      console.warn('[Changelog] 刷新 GitHub 缓存失败（忽略）:', e);
    }
    
    // 同步写入 KV，便于后台管理读取
    try {
      await env.LINES.put(this.KEY, JSON.stringify({ changelog, updatedAt: new Date().toISOString() }));
    } catch (e) {
      console.warn('[Changelog] 将同步后的更新日志写入 KV 失败（忽略）:', e);
    }
    
    return { ok: true, changelog };
  },

  // PUT /update/changelog - 由后台保存自定义 changelog
  async put(env, body) {
    if (!body || typeof body !== 'object') {
      throw { status: 400, error: '缺少请求体' };
    }

    const rawList = Array.isArray(body.changelog) ? body.changelog : (Array.isArray(body) ? body : null);
    if (!rawList) {
      throw { status: 400, error: '请求体中缺少 changelog 数组' };
    }

    // 规范化字段，避免把多余字段写入 KV
    const changelog = rawList.map(item => ({
      version: String(item.version || '').trim(),
      title: String(item.title || '').trim(),
      content: String(item.content || ''),
      releaseDate: item.releaseDate || new Date().toISOString(),
      prerelease: item.prerelease === true
    })).filter(item => item.version && item.content);

    await env.LINES.put(this.KEY, JSON.stringify({
      changelog,
      updatedAt: new Date().toISOString()
    }));

    return { ok: true, changelog };
  }
};

/**
 * 版本更新信息 API
 */
const UpdateInfoHandler = {
  // 获取 KV key（基于平台和架构）
  getKey(platform, arch) {
    return `config:update:${platform}:${arch}`;
  },

  // GET /update/check - 获取版本信息和强制更新设置
  async check(env, request) {
    const url = new URL(request.url);
    const platform = url.searchParams.get('platform') || 'win32';
    const arch = url.searchParams.get('arch') || 'x64';
    const noCache = url.searchParams.get('noCache') === '1';
    
    console.log('[UpdateInfo] 📥 检查版本信息，平台:', platform, '架构:', arch);
    
    try {
      // 1. 从 KV 读取强制更新设置
      const key = this.getKey(platform, arch);
      let updateInfo = null;
      
      const stored = await env.LINES.get(key);
      if (stored) {
        try {
          updateInfo = JSON.parse(stored);
          console.log('[UpdateInfo] ✅ 从 KV 读取版本信息:', updateInfo.version || 'unknown');
        } catch (e) {
          console.warn('[UpdateInfo] ⚠️ KV 数据解析失败:', e);
        }
      }
      
      // 2. 从 GitHub Releases 获取最新版本（如果 KV 中没有或需要刷新）
      let latestRelease = null;
      const origin = url.origin || (request.url ? new URL(request.url).origin : '');
      if (!updateInfo || noCache) {
        try {
          const latest = await ReleasesHandler.latest(env, origin);
          if (latest && latest.ok) {
            latestRelease = latest;
            console.log('[UpdateInfo] ✅ 从 GitHub 获取最新版本:', latestRelease.version);
          }
        } catch (e) {
          console.warn('[UpdateInfo] ⚠️ 从 GitHub 获取最新版本失败:', e);
          // 如果 GitHub 失败但 KV 中有数据，使用 KV 数据
          if (updateInfo) {
            console.log('[UpdateInfo] 使用 KV 中的版本信息');
          }
        }
      } else {
        // 如果 KV 中有版本号，也尝试获取最新版本（用于比较）
        try {
          const latest = await ReleasesHandler.latest(env, origin);
          if (latest && latest.ok) {
            latestRelease = latest;
          }
        } catch (e) {
          // 忽略错误，使用 KV 中的版本
        }
      }
      
      // 3. 合并数据：优先使用 GitHub 的最新版本，保留 KV 中的强制更新设置
      const result = {
        version: latestRelease?.version || updateInfo?.version || 'unknown',
        tag_name: latestRelease?.tag_name || updateInfo?.tag_name || '',
        name: latestRelease?.name || updateInfo?.name || '',
        body: latestRelease?.body || updateInfo?.body || '',
        published_at: latestRelease?.published_at || updateInfo?.published_at || '',
        html_url: latestRelease?.html_url || updateInfo?.html_url || '',
        prerelease: latestRelease?.prerelease || false,
        draft: latestRelease?.draft || false,
        assets: latestRelease?.assets || updateInfo?.assets || [],
        // 强制更新设置（从 KV 读取）
        minimumVersion: updateInfo?.minimumVersion || undefined,
        forceUpdate: updateInfo?.forceUpdate === true || false
      };
      
      // 如果从 GitHub 获取到了新版本，更新 KV（但不覆盖强制更新设置）
      if (latestRelease && (!updateInfo || updateInfo.version !== latestRelease.version)) {
        try {
          const updatedInfo = {
            ...result,
            // 保留原有的强制更新设置
            minimumVersion: updateInfo?.minimumVersion,
            forceUpdate: updateInfo?.forceUpdate
          };
          await env.LINES.put(key, JSON.stringify(updatedInfo));
          console.log('[UpdateInfo] ✅ 已更新 KV 中的版本信息');
        } catch (e) {
          console.warn('[UpdateInfo] ⚠️ 更新 KV 失败:', e);
        }
      }
      
      return { ok: true, updateInfo: result };
    } catch (error) {
      console.error('[UpdateInfo] ❌ 检查版本信息失败:', error);
      throw error;
    }
  },

  // POST /update/sync/github - 从 GitHub 同步版本信息
  async syncFromGitHub(env, request) {
    const url = new URL(request.url);
    const platform = url.searchParams.get('platform') || 'win32';
    const arch = url.searchParams.get('arch') || 'x64';
    const origin = url.origin || (request.url ? new URL(request.url).origin : '');
    
    console.log('[UpdateInfo] 🔄 从 GitHub 同步版本信息，平台:', platform, '架构:', arch);
    
    try {
      // 从 GitHub 获取最新版本
      const latest = await ReleasesHandler.latest(env, origin);
      if (!latest || !latest.ok) {
        throw { status: 500, error: '无法从 GitHub 获取最新版本' };
      }
      
      // 读取现有的强制更新设置
      const key = this.getKey(platform, arch);
      let existingInfo = null;
      const stored = await env.LINES.get(key);
      if (stored) {
        try {
          existingInfo = JSON.parse(stored);
        } catch (e) {
          console.warn('[UpdateInfo] 解析现有配置失败:', e);
        }
      }
      
      // 合并：使用 GitHub 的版本信息，保留强制更新设置
      const updateInfo = {
        version: latest.version,
        tag_name: latest.tag_name,
        name: latest.name,
        body: latest.body,
        published_at: latest.published_at,
        html_url: latest.html_url,
        prerelease: latest.prerelease,
        draft: latest.draft,
        assets: latest.assets,
        // 保留原有的强制更新设置
        minimumVersion: existingInfo?.minimumVersion,
        forceUpdate: existingInfo?.forceUpdate
      };
      
      // 保存到 KV
      await env.LINES.put(key, JSON.stringify(updateInfo));
      console.log('[UpdateInfo] ✅ 已同步并保存版本信息');
      
      return { ok: true, updateInfo };
    } catch (error) {
      console.error('[UpdateInfo] ❌ 同步失败:', error);
      throw error;
    }
  },

  // PUT /update/info - 更新版本信息（主要用于设置强制更新）
  async update(env, request, body) {
    const url = new URL(request.url);
    const platform = url.searchParams.get('platform') || 'win32';
    const arch = url.searchParams.get('arch') || 'x64';
    
    console.log('[UpdateInfo] 💾 更新版本信息，平台:', platform, '架构:', arch);
    
    if (!body || typeof body !== 'object') {
      throw { status: 400, error: '缺少更新信息数据' };
    }
    
    const key = this.getKey(platform, arch);
    
    // 读取现有数据
    let existingInfo = {};
    const stored = await env.LINES.get(key);
    if (stored) {
      try {
        existingInfo = JSON.parse(stored);
      } catch (e) {
        console.warn('[UpdateInfo] 解析现有配置失败:', e);
      }
    }
    
    // 合并更新（body 中的字段会覆盖 existingInfo）
    const updateInfo = {
      ...existingInfo,
      ...body
    };
    
    // 保存到 KV
    await env.LINES.put(key, JSON.stringify(updateInfo));
    console.log('[UpdateInfo] ✅ 已保存版本信息');
    
    return { ok: true, updateInfo };
  }
};

/**
 * 统计信息 API
 */
const TELEMETRY_PREFIX = 'telemetry:';

const TelemetryHandler = {
  // POST /telemetry - 接收统计信息
  async record(env, request, body) {
    const { deviceId, version, platform, osVersion } = body;
    if (!deviceId) {
      throw { status: 400, error: '缺少 deviceId' };
    }
    
    // 从请求头获取地理位置信息
    const country = request.cf?.country || request.headers.get('CF-IPCountry') || 'unknown';
    const city = request.cf?.city || 'unknown';
    const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';
    
    // 解析操作系统信息
    let os = 'unknown';
    if (platform) {
      const platformLower = String(platform).toLowerCase();
      if (platformLower.includes('win32') || platformLower.includes('windows')) {
        os = osVersion ? `Windows ${osVersion}` : 'Windows';
      } else if (platformLower.includes('darwin') || platformLower.includes('mac')) {
        os = osVersion ? `macOS ${osVersion}` : 'macOS';
      } else if (platformLower.includes('linux')) {
        os = osVersion ? `Linux ${osVersion}` : 'Linux';
      } else {
        os = platform;
      }
    }
    
    // 生成记录
    const ts = Date.now();
    const recordId = `${ts}_${deviceId.substring(0, 8)}_${Math.random().toString(36).substring(2, 9)}`;
    const record = {
      id: recordId,
      deviceId: String(deviceId),
      version: String(version || 'unknown'),
      country: String(country),
      city: String(city),
      os: String(os),
      ts
    };
    
    // 存储到 KV
    const key = `${TELEMETRY_PREFIX}${recordId}`;
    try {
      await env.LINES.put(key, JSON.stringify(record));
      console.log('[Telemetry] ✅ 已保存记录到 KV:', key);
      console.log('[Telemetry] 记录内容:', {
        id: record.id,
        deviceId: record.deviceId.substring(0, 8) + '...',
        version: record.version,
        country: record.country,
        city: record.city,
        os: record.os,
        ts: new Date(record.ts).toISOString()
      });
    } catch (saveError) {
      console.error('[Telemetry] ❌ 保存到 KV 失败:', saveError);
      throw { status: 500, error: '保存统计记录失败: ' + (saveError?.message || String(saveError)) };
    }
    
    return { ok: true, id: recordId };
  },

  // GET /stats - 获取统计信息
  async stats(env) {
    console.log('[Telemetry] 📊 开始获取统计信息，前缀:', TELEMETRY_PREFIX);
    
    try {
      // 列出带前缀的键
      const list = await env.LINES.list({ prefix: TELEMETRY_PREFIX });
      console.log('[Telemetry] 找到', list.keys.length, '条带前缀的键');
      
      if (list.keys.length === 0) {
        console.log('[Telemetry] ⚠️ 未找到统计记录，可能原因：');
        console.log('[Telemetry]   1. 客户端尚未上报统计信息');
        console.log('[Telemetry]   2. KV 存储配置问题');
        console.log('[Telemetry]   3. 前缀不匹配');
        
        // 尝试列出所有键用于调试
        try {
          const allList = await env.LINES.list();
          console.log('[Telemetry] KV 总键数:', allList.keys.length);
          if (allList.keys.length > 0) {
            const sampleKeys = allList.keys.slice(0, 20).map(k => k.name);
            console.log('[Telemetry] KV 键示例（前20个）:', sampleKeys);
            
            // 检查是否有其他格式的统计键
            const possibleKeys = sampleKeys.filter(k => 
              k.includes('telemetry') || 
              k.includes('stats') || 
              k.includes('device') ||
              k.includes('usage')
            );
            if (possibleKeys.length > 0) {
              console.log('[Telemetry] 发现可能的统计键:', possibleKeys);
            }
          }
        } catch (debugError) {
          console.error('[Telemetry] 调试信息获取失败:', debugError);
        }
      } else {
        console.log('[Telemetry] 键示例（前5个）:', list.keys.slice(0, 5).map(k => k.name));
      }
      
      const records = [];
      const deviceSet = new Set();
      const byCountry = {};
      const byVersion = {};
      const byOS = {};
      const byDevice = {};
      
      // 读取所有记录
      let successCount = 0;
      let errorCount = 0;
      
      for (const k of list.keys) {
        try {
          const raw = await env.LINES.get(k.name);
          if (!raw) {
            console.warn('[Telemetry] ⚠️ 键存在但值为空:', k.name);
            errorCount++;
            continue;
          }
          try {
            const record = JSON.parse(raw);
            if (!record.deviceId) {
              console.warn('[Telemetry] ⚠️ 记录缺少 deviceId:', k.name);
              errorCount++;
              continue;
            }
            records.push(record);
            deviceSet.add(record.deviceId);
            
            // 统计
            byCountry[record.country] = (byCountry[record.country] || 0) + 1;
            byVersion[record.version] = (byVersion[record.version] || 0) + 1;
            byOS[record.os] = (byOS[record.os] || 0) + 1;
            byDevice[record.deviceId] = (byDevice[record.deviceId] || 0) + 1;
            successCount++;
          } catch (parseError) {
            console.error('[Telemetry] ❌ 解析记录失败:', k.name, parseError);
            errorCount++;
          }
        } catch (getError) {
          console.error('[Telemetry] ❌ 读取记录失败:', k.name, getError);
          errorCount++;
        }
      }
      
      console.log('[Telemetry] ✅ 成功读取', successCount, '条有效记录，失败', errorCount, '条');
      
      // 按时间倒序排序
      records.sort((a, b) => (b.ts || 0) - (a.ts || 0));
      
      // 确保返回格式正确，即使没有数据
      const result = {
        total: records.length,
        uniqueDevices: deviceSet.size,
        byCountry: Object.keys(byCountry).length > 0 ? byCountry : {},
        byVersion: Object.keys(byVersion).length > 0 ? byVersion : {},
        byOS: Object.keys(byOS).length > 0 ? byOS : {},
        byDevice: Object.keys(byDevice).length > 0 ? byDevice : {},
        records: records.slice(0, 1000),
        all: records,
        recent: records
      };
      
      console.log('[Telemetry] 📊 返回统计结果:', {
        total: result.total,
        uniqueDevices: result.uniqueDevices,
        countries: Object.keys(result.byCountry).length,
        versions: Object.keys(result.byVersion).length,
        os: Object.keys(result.byOS).length,
        devices: Object.keys(result.byDevice).length
      });
      
      return result;
    } catch (error) {
      console.error('[Telemetry] ❌ 获取统计信息失败:', error);
      // 即使出错也返回空数据结构，避免前端报错
      return {
        total: 0,
        uniqueDevices: 0,
        byCountry: {},
        byVersion: {},
        byOS: {},
        byDevice: {},
        records: [],
        all: [],
        recent: []
      };
    }
  },

  // DELETE /stats/record/:id - 删除单条记录
  async deleteRecord(env, recordId) {
    const key = `${TELEMETRY_PREFIX}${recordId}`;
    await env.LINES.delete(key);
    return { ok: true };
  },

  // DELETE /stats/records - 批量删除
  async deleteRecords(env, body) {
    const { deviceId, before, all } = body;
    
    if (all) {
      const list = await env.LINES.list({ prefix: TELEMETRY_PREFIX });
      for (const k of list.keys) {
        await env.LINES.delete(k.name);
      }
      return { ok: true, deleted: list.keys.length };
    }
    
    if (deviceId) {
      const list = await env.LINES.list({ prefix: TELEMETRY_PREFIX });
      let deleted = 0;
      for (const k of list.keys) {
        const raw = await env.LINES.get(k.name);
        if (raw) {
          try {
            const record = JSON.parse(raw);
            if (record.deviceId === deviceId && (!before || record.ts < before)) {
              await env.LINES.delete(k.name);
              deleted++;
            }
          } catch {}
        }
      }
      return { ok: true, deleted };
    }
    
    if (before) {
      const list = await env.LINES.list({ prefix: TELEMETRY_PREFIX });
      let deleted = 0;
      for (const k of list.keys) {
        const raw = await env.LINES.get(k.name);
        if (raw) {
          try {
            const record = JSON.parse(raw);
            if (record.ts < before) {
              await env.LINES.delete(k.name);
              deleted++;
            }
          } catch {}
        }
      }
      return { ok: true, deleted };
    }
    
    throw { status: 400, error: '请指定删除条件（all、deviceId 或 before）' };
  }
};

/**
 * 彩蛋配置 API
 */
const EasterEggsHandler = {
  KEY: 'config:easter-eggs',
  
  // GET /easter-eggs - 获取彩蛋配置
  async get(env) {
    const raw = await env.LINES.get(this.KEY);
    if (!raw) {
      // 返回默认配置（未配置状态）
      return {
        ok: true,
        config: {
          stations: [],
          messages: [],
          enabled: false,
          _isDefault: true  // 标记为默认配置（未配置）
        }
      };
    }
    try {
      const config = JSON.parse(raw);
      // 确保有 _isDefault 字段（已配置的数据没有此字段）
      if (!('_isDefault' in config)) {
        config._isDefault = false;
      }
      return { ok: true, config };
    } catch (e) {
      console.error('[EasterEggs] 解析配置失败:', e);
      return {
        ok: true,
        config: {
          stations: [],
          messages: [],
          enabled: false,
          _isDefault: true
        }
      };
    }
  },
  
  // PUT /easter-eggs - 更新彩蛋配置
  async update(env, body) {
    if (!body || typeof body !== 'object') {
      throw { status: 400, error: '缺少配置数据' };
    }
    
    // 只保存有效的配置字段，排除 _isDefault 等内部字段
    const config = {
      stations: Array.isArray(body.stations) ? body.stations : [],
      messages: Array.isArray(body.messages) ? body.messages : [],
      enabled: body.enabled === true
    };
    
    await env.LINES.put(this.KEY, JSON.stringify(config));
    // 返回时添加 _isDefault: false 表示这是已配置的数据
    return { ok: true, config: { ...config, _isDefault: false } };
  }
};

/**
 * 新年灯笼配置 API
 */
const NewYearLanternHandler = {
  KEY: 'config:new-year-lantern',
  async get(env) {
    const raw = await env.LINES.get(this.KEY);
    if (!raw) {
      return {
        ok: true,
        config: {
          messages: [],
          enabled: false,
          _isDefault: true
        }
      };
    }
    try {
      const config = JSON.parse(raw);
      if (!('_isDefault' in config)) config._isDefault = false;
      return { ok: true, config };
    } catch (e) {
      return { ok: true, config: { messages: [], enabled: false, _isDefault: true } };
    }
  },
  async update(env, body) {
    if (!body || typeof body !== 'object') throw { status: 400, error: '缺少配置数据' };
    const config = {
      messages: Array.isArray(body.messages) ? body.messages : [],
      enabled: body.enabled === true,
      startDate: body.startDate || null,
      endDate: body.endDate || null
    };
    await env.LINES.put(this.KEY, JSON.stringify(config));
    return { ok: true, config: { ...config, _isDefault: false } };
  }
};

/**
 * 节日配置 API
 */
const HolidaysHandler = {
  KEY: 'config:holidays',
  
  // GET /holidays - 获取所有节日配置
  async get(env) {
    const raw = await env.LINES.get(this.KEY);
    if (!raw) {
      return {
        ok: true,
        config: {}
      };
    }
    try {
      const config = JSON.parse(raw);
      return { ok: true, config };
    } catch (e) {
      console.error('[Holidays] 解析配置失败:', e);
      return {
        ok: true,
        config: {}
      };
    }
  },
  
  // PUT /holidays - 更新节日配置
  async update(env, body) {
    if (!body || typeof body !== 'object') {
      throw { status: 400, error: '缺少配置数据' };
    }
    
    await env.LINES.put(this.KEY, JSON.stringify(body));
    return { ok: true, config: body };
  },
  
  // GET /holidays/active - 获取当前激活的节日
  async getActive(env) {
    const raw = await env.LINES.get(this.KEY);
    if (!raw) {
      return { ok: true, active: {} };
    }
    
    try {
      const config = JSON.parse(raw);
      const now = new Date();
      const currentMonth = now.getMonth() + 1; // 1-12
      const currentDay = now.getDate(); // 1-31
      const active = {};
      
      for (const [key, holiday] of Object.entries(config)) {
        if (!holiday || holiday.enabled !== true) {
          continue;
        }
        
        let isActive = false;
        
        // 检查日期匹配
        if (holiday.date) {
          // 单日节日（如生日）
          if (holiday.date.month === currentMonth && holiday.date.day === currentDay) {
            isActive = true;
          }
        } else if (holiday.startDate && holiday.endDate) {
          // 日期范围节日
          const start = new Date(holiday.startDate);
          const end = new Date(holiday.endDate);
          if (now >= start && now <= end) {
            isActive = true;
          }
        } else if (holiday.duration && holiday.date) {
          // 持续多天的节日（如春节）
          const startMonth = holiday.date.month;
          const startDay = holiday.date.day;
          const endDate = new Date(now.getFullYear(), startMonth - 1, startDay);
          endDate.setDate(endDate.getDate() + holiday.duration - 1);
          
          const startDate = new Date(now.getFullYear(), startMonth - 1, startDay);
          if (now >= startDate && now <= endDate) {
            isActive = true;
          }
        }
        
        if (isActive) {
          active[key] = holiday;
        }
      }
      
      return { ok: true, active };
    } catch (e) {
      console.error('[Holidays] 获取激活节日失败:', e);
      return { ok: true, active: {} };
    }
  }
};

// ==================== 路由分发 ====================

/**
 * 处理请求
 */
async function handleRequest(request, env) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const method = request.method || 'GET';
  const corsHeaders = getCorsHeaders();

  // OPTIONS 预检请求
  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    // 根路径
    if (pathname === '/' && method === 'GET') {
      return json({
        ok: true,
        message: 'Metro-PIDS Cloudflare API',
        version: '2.0',
        endpoints: [
          'GET    /preset',
          'GET    /preset/:lineName',
          'POST   /preset',
          'PUT    /preset/:lineName',
          'DELETE /preset/:lineName',
          'GET    /runtime/lines',
          'GET    /runtime/lines/:lineName',
          'PUT    /runtime/lines/:lineName',
          'DELETE /runtime/lines/:lineName',
          'GET    /releases',
          'GET    /releases/latest',
          'GET    /releases/download/:tag/:file',
          'GET    /update/changelog',
          'POST   /update/changelog/sync/github',
          'GET    /update/check',
          'POST   /update/sync/github',
          'PUT    /update/info',
          'POST   /telemetry',
          'GET    /stats',
          'DELETE /stats/record/:id',
          'DELETE /stats/records',
          'GET    /easter-eggs',
          'PUT    /easter-eggs',
          'GET    /new-year-lantern',
          'PUT    /new-year-lantern',
          'GET    /holidays',
          'PUT    /holidays',
          'GET    /holidays/active',
          'GET    /admin'
        ]
      }, 200, corsHeaders);
    }

    // 管理页面
    if (pathname === '/admin' && method === 'GET') {
      const html = getAdminHtml(url.origin);
      return new Response(html, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          ...corsHeaders
        }
      });
    }

    // 预设线路 API
    if (pathname === '/preset' && method === 'GET') {
      return json(await PresetLinesHandler.list(env), 200, corsHeaders);
    }
    if (pathname === '/preset' && method === 'POST') {
      if (!checkWriteAuth(request, env)) {
        return json({ ok: false, error: 'Unauthorized' }, 401, corsHeaders);
      }
      const body = await readJson(request);
      return json(await PresetLinesHandler.create(env, body), 201, corsHeaders);
    }
    if (pathname.startsWith('/preset/')) {
      const lineName = decodeURIComponent(pathname.slice('/preset/'.length));
      if (!lineName) {
        return json({ ok: false, error: '缺少线路名称' }, 400, corsHeaders);
      }
      if (method === 'GET') {
        return json(await PresetLinesHandler.get(env, lineName), 200, corsHeaders);
      }
      if (method === 'PUT') {
        if (!checkWriteAuth(request, env)) {
          return json({ ok: false, error: 'Unauthorized' }, 401, corsHeaders);
        }
        const body = await readJson(request);
        return json(await PresetLinesHandler.update(env, lineName, body), 200, corsHeaders);
      }
      if (method === 'DELETE') {
        if (!checkWriteAuth(request, env)) {
          return json({ ok: false, error: 'Unauthorized' }, 401, corsHeaders);
        }
        return json(await PresetLinesHandler.delete(env, lineName), 200, corsHeaders);
      }
    }

    // 运控线路 API
    if (pathname === '/runtime/lines' && method === 'GET') {
      return json(await RuntimeLinesHandler.list(env), 200, corsHeaders);
    }
    if (pathname.startsWith('/runtime/lines/') && pathname.length > '/runtime/lines/'.length) {
      const lineName = decodeURIComponent(pathname.slice('/runtime/lines/'.length));
      if (method === 'GET') {
        return json(await RuntimeLinesHandler.get(env, lineName), 200, corsHeaders);
      }
      if (method === 'PUT') {
        if (!checkWriteAuth(request, env)) {
          return json({ ok: false, error: 'Unauthorized' }, 401, corsHeaders);
        }
        const body = await readJson(request);
        return json(await RuntimeLinesHandler.update(env, lineName, body), 200, corsHeaders);
      }
      if (method === 'DELETE') {
        if (!checkWriteAuth(request, env)) {
          return json({ ok: false, error: 'Unauthorized' }, 401, corsHeaders);
        }
        return json(await RuntimeLinesHandler.delete(env, lineName), 200, corsHeaders);
      }
    }

    // GitHub Releases API
    if (pathname === '/releases' && method === 'GET') {
      try {
        const result = await ReleasesHandler.list(env);
        return json(result, 200, corsHeaders);
      } catch (error) {
        console.error('[Worker] /releases 端点错误:', error);
        console.error('[Worker] 错误类型:', typeof error, '错误对象:', JSON.stringify(error, null, 2));
        
        // 如果是 GitHub API 404 错误，返回更友好的错误信息
        if (error && typeof error === 'object' && 'status' in error && error.status === 404) {
          return json({ 
            ok: false, 
            error: error.error || 'GitHub 仓库未找到',
            detail: error.detail || '请检查仓库名称是否正确，或仓库是否为私有（需要 Token 权限）',
            repoUrl: ReleasesHandler.REPO_URL + '/releases'
          }, 200, corsHeaders); // 返回 200，但 ok: false，这样客户端可以正常解析
        }
        
        if (error && typeof error === 'object' && 'status' in error) {
          return json({ 
            ok: false, 
            error: error.error || String(error),
            ...(error.detail && { detail: error.detail })
          }, 200, corsHeaders); // 返回 200，但 ok: false
        }
        return json({ 
          ok: false, 
          error: error?.message || String(error || 'Internal Server Error')
        }, 200, corsHeaders); // 返回 200，但 ok: false
      }
    }
    if (pathname === '/releases/latest' && method === 'GET') {
      return json(await ReleasesHandler.latest(env, url.origin), 200, corsHeaders);
    }
    if (pathname.startsWith('/releases/download/') && method === 'GET') {
      const pathParts = pathname.slice('/releases/download/'.length).split('/');
      if (pathParts.length !== 2) {
        return json({ ok: false, error: '下载路径格式错误' }, 400, corsHeaders);
      }
      const tagName = decodeURIComponent(pathParts[0]);
      const fileName = decodeURIComponent(pathParts[1]);
      return await ReleasesHandler.download(tagName, fileName);
    }
    if (pathname === '/releases/refresh' && method === 'POST') {
      // 手动刷新 Releases 缓存（需要 Token 认证）
      if (!checkWriteAuth(request, env)) {
        return json({ ok: false, error: 'Unauthorized' }, 401, corsHeaders);
      }
      try {
        // 强制从 GitHub 获取并更新缓存
        const recentReleases = await ReleasesHandler.fetchFromGitHub(env);
        const cacheData = {
          releases: recentReleases,
          timestamp: Date.now()
        };
        await env.LINES.put(ReleasesHandler.CACHE_KEY, JSON.stringify(cacheData));
        console.log('[Releases] ✅ 手动刷新缓存成功，数量:', recentReleases.length);
        return json({ ok: true, message: '缓存已刷新', count: recentReleases.length }, 200, corsHeaders);
      } catch (error) {
        console.error('[Releases] ❌ 手动刷新缓存失败:', error);
        if (error && typeof error === 'object' && 'status' in error) {
          return json({ 
            ok: false, 
            error: error.error || String(error),
            ...(error.detail && { detail: error.detail })
          }, 200, corsHeaders);
        }
        return json({ ok: false, error: error?.message || String(error) }, 200, corsHeaders);
      }
    }

    // 更新日志 API
    if (pathname === '/update/changelog' && method === 'GET') {
      return json(await ChangelogHandler.get(env, request), 200, corsHeaders);
    }
    if (pathname === '/update/changelog' && method === 'PUT') {
      try {
        const body = await readJson(request);
        return json(await ChangelogHandler.put(env, body), 200, corsHeaders);
      } catch (error) {
        console.error('[Worker] /update/changelog PUT 端点错误:', error);
        if (error && typeof error === 'object' && 'status' in error) {
          return json({ 
            ok: false, 
            error: error.error || String(error)
          }, error.status || 500, corsHeaders);
        }
        return json({ 
          ok: false, 
          error: error?.message || String(error || 'Internal Server Error')
        }, 500, corsHeaders);
      }
    }
    if (pathname === '/update/changelog/sync/github' && method === 'POST') {
      return json(await ChangelogHandler.sync(env), 200, corsHeaders);
    }

    // 版本更新信息 API
    if (pathname === '/update/check' && method === 'GET') {
      try {
        return json(await UpdateInfoHandler.check(env, request), 200, corsHeaders);
      } catch (error) {
        console.error('[Worker] /update/check 端点错误:', error);
        if (error && typeof error === 'object' && 'status' in error) {
          return json({ 
            ok: false, 
            error: error.error || String(error),
            ...(error.detail && { detail: error.detail })
          }, error.status || 500, corsHeaders);
        }
        return json({ 
          ok: false, 
          error: error?.message || String(error || 'Internal Server Error')
        }, 500, corsHeaders);
      }
    }
    if (pathname === '/update/sync/github' && method === 'POST') {
      try {
        return json(await UpdateInfoHandler.syncFromGitHub(env, request), 200, corsHeaders);
      } catch (error) {
        console.error('[Worker] /update/sync/github 端点错误:', error);
        if (error && typeof error === 'object' && 'status' in error) {
          return json({ 
            ok: false, 
            error: error.error || String(error),
            ...(error.detail && { detail: error.detail })
          }, error.status || 500, corsHeaders);
        }
        return json({ 
          ok: false, 
          error: error?.message || String(error || 'Internal Server Error')
        }, 500, corsHeaders);
      }
    }
    if (pathname === '/update/info' && method === 'PUT') {
      if (!checkWriteAuth(request, env)) {
        return json({ ok: false, error: 'Unauthorized' }, 401, corsHeaders);
      }
      try {
        const body = await readJson(request);
        return json(await UpdateInfoHandler.update(env, request, body), 200, corsHeaders);
      } catch (error) {
        console.error('[Worker] /update/info 端点错误:', error);
        if (error && typeof error === 'object' && 'status' in error) {
          return json({ 
            ok: false, 
            error: error.error || String(error),
            ...(error.detail && { detail: error.detail })
          }, error.status || 500, corsHeaders);
        }
        return json({ 
          ok: false, 
          error: error?.message || String(error || 'Internal Server Error')
        }, 500, corsHeaders);
      }
    }

    // 统计信息 API
    if (pathname === '/telemetry' && method === 'POST') {
      try {
        const body = await readJson(request);
        console.log('[Worker] 📊 收到统计上报请求');
        console.log('[Worker] 请求体:', {
          deviceId: body.deviceId ? body.deviceId.substring(0, 8) + '...' : 'missing',
          version: body.version || 'missing',
          platform: body.platform || 'missing',
          osVersion: body.osVersion || 'none'
        });
        
        if (!body.deviceId) {
          console.error('[Worker] ❌ 缺少 deviceId');
          return json({ ok: false, error: '缺少 deviceId' }, 400, corsHeaders);
        }
        
        const result = await TelemetryHandler.record(env, request, body);
        console.log('[Worker] ✅ 统计上报成功，记录ID:', result.id);
        return json(result, 200, corsHeaders);
      } catch (error) {
        console.error('[Worker] ❌ 统计上报失败:', error);
        if (error && typeof error === 'object' && 'status' in error) {
          return json({ ok: false, error: error.error || String(error) }, error.status || 500, corsHeaders);
        }
        return json({ ok: false, error: error?.message || String(error || 'Internal Server Error') }, 500, corsHeaders);
      }
    }
    if (pathname === '/stats' && method === 'GET') {
      try {
        const result = await TelemetryHandler.stats(env);
        return json(result, 200, corsHeaders);
      } catch (error) {
        console.error('[Worker] 获取统计信息失败:', error);
        // 即使失败也返回空数据，避免前端报错
        return json({
          total: 0,
          uniqueDevices: 0,
          byCountry: {},
          byVersion: {},
          byOS: {},
          byDevice: {},
          records: [],
          all: [],
          recent: []
        }, 200, corsHeaders);
      }
    }
    if (pathname.startsWith('/stats/record/') && method === 'DELETE') {
      const recordId = pathname.slice('/stats/record/'.length);
      if (!recordId) {
        return json({ ok: false, error: '缺少记录ID' }, 400, corsHeaders);
      }
      return json(await TelemetryHandler.deleteRecord(env, recordId), 200, corsHeaders);
    }
    if (pathname === '/stats/records' && method === 'DELETE') {
      if (!checkWriteAuth(request, env)) {
        return json({ ok: false, error: 'Unauthorized' }, 401, corsHeaders);
      }
      const body = await readJson(request);
      return json(await TelemetryHandler.deleteRecords(env, body), 200, corsHeaders);
    }

    // 彩蛋配置 API
    if (pathname === '/easter-eggs' && method === 'GET') {
      return json(await EasterEggsHandler.get(env), 200, corsHeaders);
    }
    if (pathname === '/easter-eggs' && method === 'PUT') {
      if (!checkWriteAuth(request, env)) {
        return json({ ok: false, error: 'Unauthorized' }, 401, corsHeaders);
      }
      const body = await readJson(request);
      return json(await EasterEggsHandler.update(env, body), 200, corsHeaders);
    }

    // 新年灯笼配置 API
    if (pathname === '/new-year-lantern' && method === 'GET') {
      return json(await NewYearLanternHandler.get(env), 200, corsHeaders);
    }
    if (pathname === '/new-year-lantern' && method === 'PUT') {
      if (!checkWriteAuth(request, env)) {
        return json({ ok: false, error: 'Unauthorized' }, 401, corsHeaders);
      }
      const body = await readJson(request);
      return json(await NewYearLanternHandler.update(env, body), 200, corsHeaders);
    }

    // 节日配置 API
    if (pathname === '/holidays' && method === 'GET') {
      return json(await HolidaysHandler.get(env), 200, corsHeaders);
    }
    if (pathname === '/holidays' && method === 'PUT') {
      if (!checkWriteAuth(request, env)) {
        return json({ ok: false, error: 'Unauthorized' }, 401, corsHeaders);
      }
      const body = await readJson(request);
      return json(await HolidaysHandler.update(env, body), 200, corsHeaders);
    }
    if (pathname === '/holidays/active' && method === 'GET') {
      return json(await HolidaysHandler.getActive(env), 200, corsHeaders);
    }

    // 404
    return json({ ok: false, error: 'Not Found' }, 404, corsHeaders);

  } catch (error) {
    // 统一错误处理
    console.error('[Worker] 错误:', error);
    
    if (error && typeof error === 'object' && 'status' in error) {
      return json({ 
        ok: false, 
        error: error.error || String(error),
        ...(error.detail && { detail: error.detail })
      }, error.status || 500, corsHeaders);
    }
    
    return json({ 
      ok: false, 
      error: error?.message || String(error || 'Internal Server Error')
    }, 500, corsHeaders);
  }
}

// ==================== 主入口 ====================

export default {
  async fetch(request, env, ctx) {
    const corsHeaders = getCorsHeaders();
    
    try {
      return await handleRequest(request, env);
    } catch (error) {
      console.error('[Worker] 未捕获的异常:', error);
      return json({
        ok: false,
        error: 'Internal Server Error: ' + (error?.message || String(error))
      }, 500, corsHeaders);
    }
  },
  
  // Cron Trigger: 定期刷新 Releases 缓存
  async scheduled(event, env, ctx) {
    console.log('[Worker] ⏰ Cron Trigger 触发，开始刷新 Releases 缓存...');
    try {
      const recentReleases = await ReleasesHandler.fetchFromGitHub(env);
      const cacheData = {
        releases: recentReleases,
        timestamp: Date.now()
      };
      await env.LINES.put(ReleasesHandler.CACHE_KEY, JSON.stringify(cacheData));
      console.log('[Worker] ✅ Cron Trigger 刷新缓存成功，数量:', recentReleases.length);
    } catch (error) {
      console.error('[Worker] ❌ Cron Trigger 刷新缓存失败:', error);
      // 不抛出错误，避免影响其他 scheduled 任务
    }
  }
};

// ==================== 管理页面 HTML ====================

function getAdminHtml(origin) {
  const apiBase = origin || '';
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <title>Metro-PIDS Cloudflare 运控管理</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    *{box-sizing:border-box}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f5f5f5;margin:0;padding:16px;color:#333}
    .container{max-width:980px;margin:0 auto}
    h1{font-size:22px;margin:0 0 6px}
    p.desc{margin:0 0 12px;color:#666;font-size:13px}
    .card{background:#fff;border-radius:10px;padding:16px 18px;margin-bottom:14px;box-shadow:0 2px 8px rgba(0,0,0,.06)}
    .field{margin-bottom:10px}
    .field label{display:block;font-size:13px;color:#666;margin-bottom:4px}
    .field input,.field textarea{width:100%;padding:7px 9px;border-radius:6px;border:1px solid #d9d9d9;font-size:13px}
    .field textarea{min-height:150px;font-family:Consolas,Menlo,monospace;resize:vertical}
    .btn{display:inline-block;padding:7px 13px;border-radius:6px;border:none;cursor:pointer;font-size:13px;margin-right:6px;margin-bottom:6px;color:#fff;background:#1677ff}
    .btn.secondary{background:#d9d9d9;color:#333}
    .btn.danger{background:#ff4d4f}
    .status{font-size:12px;color:#666;margin-left:6px}
    .status.ok{color:#52c41a}
    .status.err{color:#ff4d4f}
    pre{background:#1e1e1e;color:#d4d4d4;padding:10px;border-radius:6px;font-family:Consolas,Menlo,monospace;font-size:12px;max-height:260px;overflow:auto;white-space:pre}
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <h1>Metro-PIDS Cloudflare 运控管理</h1>
      <p class="desc">
        当前 API 地址：<code id="api-base-text">${apiBase}</code><br/>
        此页面运行在 Cloudflare Worker 上，只用于你自己管理预设线路。写操作可通过 Token 保护（CLOUD_TOKEN）。
      </p>
    </div>

    <div class="card">
      <h2 style="font-size:18px;margin:0 0 10px">登录与基础配置</h2>
      <div class="field">
        <label for="login-username">登录用户名（默认：admin）</label>
        <input id="login-username" type="text" placeholder="默认：admin" />
      </div>
      <div class="field">
        <label for="login-password">登录密码（默认：password）</label>
        <input id="login-password" type="password" placeholder="默认：password" />
      </div>
      <button class="btn secondary" id="btn-login">登录</button>
      <span class="status" id="login-status"></span>
      <hr style="margin:14px 0;border:none;border-top:1px solid #eee" />
      <div class="field">
        <label for="api-token">写操作 Token（可选，仅你自己知道）</label>
        <input id="api-token" type="password" placeholder="与 CLOUD_TOKEN 一致时才允许写入" />
      </div>
      <button class="btn secondary" id="btn-save-conf">保存到浏览器</button>
      <span class="status" id="conf-status"></span>
      <hr style="margin:14px 0;border:none;border-top:1px solid #eee" />
      <div class="field">
        <label for="old-password">修改登录密码（当前登录用户）</label>
        <input id="old-password" type="password" placeholder="当前密码" />
      </div>
      <div class="field">
        <input id="new-password" type="password" placeholder="新密码" />
      </div>
      <div class="field">
        <input id="new-password2" type="password" placeholder="重复新密码" />
      </div>
      <button class="btn secondary" id="btn-change-pwd">修改密码（仅保存在浏览器）</button>
    </div>

    <div class="card">
      <h2 style="font-size:18px;margin:0 0 10px">线路列表</h2>
      <button class="btn" id="btn-list">列出所有线路 (GET /preset)</button>
      <div class="field" style="margin-top:8px">
        <label>结果</label>
        <pre id="list-output">尚未请求。</pre>
      </div>
    </div>

    <div class="card">
      <h2 style="font-size:18px;margin:0 0 10px">单条线路操作</h2>
      <div class="field">
        <label for="line-name">线路名称 (meta.lineName)</label>
        <input id="line-name" type="text" placeholder="例如：上海地铁2号线" />
      </div>
      <div style="margin-bottom:8px">
        <button class="btn secondary" id="btn-get">读取 (GET /preset/:lineName)</button>
        <button class="btn" id="btn-put">上传/更新 (PUT /preset/:lineName)</button>
        <button class="btn danger" id="btn-del">删除 (DELETE /preset/:lineName)</button>
        <span class="status" id="line-status"></span>
      </div>
      <div class="field">
        <label for="line-json">线路 JSON 内容</label>
        <textarea id="line-json" placeholder='{"meta": {"lineName": "示例线路"}, "stations": [...]}'></textarea>
      </div>
    </div>
  </div>

  <script>
    const STORAGE_KEY = 'metro_pids_cf_worker_admin_conf';
    const AUTH_KEY = 'metro_pids_cf_worker_admin_auth';
    const apiBase = '${apiBase}';

    function loadConf() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
      } catch { return null; }
    }
    function saveConf(conf) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(conf));
    }
    function getToken() {
      return document.getElementById('api-token').value.trim();
    }
    function showStatus(id, msg, ok) {
      const el = document.getElementById(id);
      el.textContent = msg || '';
      el.className = 'status ' + (ok ? 'ok' : 'err');
    }
    function headers(body) {
      const h = { 'Accept': 'application/json' };
      if (body) h['Content-Type'] = 'application/json';
      const token = getToken();
      if (token) h['Authorization'] = 'Bearer ' + token;
      return h;
    }
    async function callApi(method, path, body) {
      const url = apiBase.replace(/\\/+$/, '') + path;
      const res = await fetch(url, {
        method,
        headers: headers(!!body),
        body: body ? JSON.stringify(body) : undefined
      });
      const text = await res.text();
      let data;
      try { data = text ? JSON.parse(text) : null; } catch { data = text; }
      if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + text);
      return data;
    }
    function loadAuth() {
      try {
        const raw = localStorage.getItem(AUTH_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
      } catch { return null; }
    }
    function saveAuth(auth) {
      localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
    }
    function ensureDefaultAuth() {
      let auth = loadAuth();
      if (!auth || !auth.username || !auth.password) {
        auth = { username: 'admin', password: 'password' };
        saveAuth(auth);
      }
      return auth;
    }
    let isAuthed = false;
    function handleLogin() {
      const auth = ensureDefaultAuth();
      const u = document.getElementById('login-username').value.trim() || 'admin';
      const p = document.getElementById('login-password').value;
      if (u === auth.username && p === auth.password) {
        isAuthed = true;
        showStatus('login-status', '登录成功', true);
      } else {
        isAuthed = false;
        showStatus('login-status', '用户名或密码错误（默认：admin / password）', false);
      }
    }
    function handleChangePassword() {
      if (!isAuthed) {
        showStatus('login-status', '请先登录后再修改密码', false);
        return;
      }
      const auth = ensureDefaultAuth();
      const oldPwd = document.getElementById('old-password').value;
      const newPwd = document.getElementById('new-password').value;
      const newPwd2 = document.getElementById('new-password2').value;
      if (!oldPwd || !newPwd || !newPwd2) {
        showStatus('login-status', '请完整填写旧密码和两次新密码', false);
        return;
      }
      if (oldPwd !== auth.password) {
        showStatus('login-status', '旧密码不正确', false);
        return;
      }
      if (newPwd !== newPwd2) {
        showStatus('login-status', '两次新密码不一致', false);
        return;
      }
      const updated = { username: auth.username, password: newPwd };
      saveAuth(updated);
      showStatus('login-status', '密码已更新（仅保存在当前浏览器）', true);
      document.getElementById('old-password').value = '';
      document.getElementById('new-password').value = '';
      document.getElementById('new-password2').value = '';
      document.getElementById('login-password').value = '';
    }
    window.addEventListener('DOMContentLoaded', () => {
      const conf = loadConf();
      if (conf && conf.token) {
        document.getElementById('api-token').value = conf.token;
      }
      const auth = ensureDefaultAuth();
      document.getElementById('login-username').placeholder = '默认：' + auth.username;
      document.getElementById('login-password').placeholder = '默认：' + auth.password;

      document.getElementById('btn-login').addEventListener('click', handleLogin);
      document.getElementById('btn-save-conf').addEventListener('click', () => {
        const token = getToken();
        saveConf({ token });
        showStatus('conf-status', '已保存到本地浏览器', true);
      });
      document.getElementById('btn-change-pwd').addEventListener('click', handleChangePassword);
      document.getElementById('btn-list').addEventListener('click', async () => {
        const out = document.getElementById('list-output');
        out.textContent = '请求中...';
        try {
          const data = await callApi('GET', '/preset');
          out.textContent = JSON.stringify(data, null, 2);
          showStatus('conf-status', '请求成功', true);
        } catch (e) {
          out.textContent = '请求失败：' + e.message;
          showStatus('conf-status', '请求失败', false);
        }
      });
      document.getElementById('btn-get').addEventListener('click', async () => {
        const name = document.getElementById('line-name').value.trim();
        if (!name) { showStatus('line-status', '请先填写线路名称', false); return; }
        showStatus('line-status', '读取中...', true);
        try {
          const data = await callApi('GET', '/preset/' + encodeURIComponent(name));
          document.getElementById('line-json').value = JSON.stringify(data.line || data, null, 2);
          showStatus('line-status', '读取成功', true);
        } catch (e) {
          showStatus('line-status', '读取失败：' + e.message, false);
        }
      });
      document.getElementById('btn-put').addEventListener('click', async () => {
        const name = document.getElementById('line-name').value.trim();
        const text = document.getElementById('line-json').value.trim();
        if (!name) { showStatus('line-status', '请先填写线路名称', false); return; }
        if (!text) { showStatus('line-status', '请先填写线路 JSON', false); return; }
        if (!isAuthed) { showStatus('line-status', '请先登录（默认：admin / password）', false); return; }
        showStatus('line-status', '上传中...', true);
        try {
          const json = JSON.parse(text);
          if (!json.meta) json.meta = {};
          json.meta.lineName = name;
          const data = await callApi('PUT', '/preset/' + encodeURIComponent(name), json);
          document.getElementById('line-json').value = JSON.stringify(data.line || json, null, 2);
          showStatus('line-status', '上传/更新成功', true);
        } catch (e) {
          showStatus('line-status', '上传失败：' + e.message, false);
        }
      });
      document.getElementById('btn-del').addEventListener('click', async () => {
        const name = document.getElementById('line-name').value.trim();
        if (!name) { showStatus('line-status', '请先填写线路名称', false); return; }
        if (!isAuthed) { showStatus('line-status', '请先登录（默认：admin / password）', false); return; }
        if (!confirm('确定要删除 "' + name + '" 吗？')) return;
        showStatus('line-status', '删除中...', true);
        try {
          await callApi('DELETE', '/preset/' + encodeURIComponent(name));
          showStatus('line-status', '删除成功', true);
        } catch (e) {
          showStatus('line-status', '删除失败：' + e.message, false);
        }
      });
    });
  </script>
</body>
</html>`;
}
