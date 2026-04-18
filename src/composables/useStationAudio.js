/**
 * 车站进/出站、通用音频播放：
 * - 导航式打断：新的播放立即停止旧播放
 */
import { calculateNextStationIndex } from '../utils/displayStationCalculator'
import { collectPeerStationNamesForAudioMatch } from '../utils/stationAudioPeers.js'
import { i18n } from '../locales/index.js'
import { CLOUD_API_BASE } from './useCloudConfig.js'

// 用于系统媒体控制面板（Windows/锁屏/全局媒体控制）。
// 这里用 module-scope 状态，避免多次注册 action handler。
let __mediaSessionHandlersRegistered = false
let __stationAudioInstanceSeq = 0
const __cloudAudioBlobUrlCache = new Map() // key -> { url, usedAt }
const __cloudAudioBlobUrlCacheLimit = 30
const __localAudioBlobUrlCache = new Map() // absPath -> { url, usedAt }
const __localAudioBlobUrlCacheLimit = 60

const __normalizeCloudAudioRelPath = (p) => String(p || '')
  .replace(/\\/g, '/')
  .replace(/^\/+/, '')
  .replace(/^\.\//, '')
  .trim()

const __normalizeRuntimeLineName = (name) => {
  const raw = String(name || '')
    .replace(/<[^>]+>([^<]*)<\/>/g, '$1')
    .trim()
  return raw
}

const __touchCloudAudioCache = (key) => {
  const ent = __cloudAudioBlobUrlCache.get(key)
  if (!ent) return
  ent.usedAt = Date.now()
  __cloudAudioBlobUrlCache.delete(key)
  __cloudAudioBlobUrlCache.set(key, ent)
}

const __setCloudAudioBlobCache = (key, url) => {
  __cloudAudioBlobUrlCache.set(key, { url, usedAt: Date.now() })
  while (__cloudAudioBlobUrlCache.size > __cloudAudioBlobUrlCacheLimit) {
    const firstKey = __cloudAudioBlobUrlCache.keys().next().value
    if (!firstKey) break
    const first = __cloudAudioBlobUrlCache.get(firstKey)
    __cloudAudioBlobUrlCache.delete(firstKey)
    try { if (first?.url) URL.revokeObjectURL(first.url) } catch (e) {}
  }
}

const __normalizeLocalAudioCacheKey = (p) => {
  const raw = String(p || '').trim()
  if (!raw) return ''
  return raw.replace(/\//g, '\\').toLowerCase()
}

const __touchLocalAudioCache = (key) => {
  const ent = __localAudioBlobUrlCache.get(key)
  if (!ent) return
  ent.usedAt = Date.now()
  __localAudioBlobUrlCache.delete(key)
  __localAudioBlobUrlCache.set(key, ent)
}

const __setLocalAudioBlobCache = (key, url) => {
  __localAudioBlobUrlCache.set(key, { url, usedAt: Date.now() })
  while (__localAudioBlobUrlCache.size > __localAudioBlobUrlCacheLimit) {
    const firstKey = __localAudioBlobUrlCache.keys().next().value
    if (!firstKey) break
    const first = __localAudioBlobUrlCache.get(firstKey)
    __localAudioBlobUrlCache.delete(firstKey)
    try { if (first?.url) URL.revokeObjectURL(first.url) } catch (e) {}
  }
}

const __guessAudioMimeType = (p) => {
  const lower = String(p || '').trim().toLowerCase()
  if (lower.endsWith('.wav')) return 'audio/wav'
  if (lower.endsWith('.mp3')) return 'audio/mpeg'
  if (lower.endsWith('.ogg')) return 'audio/ogg'
  if (lower.endsWith('.flac')) return 'audio/flac'
  if (lower.endsWith('.m4a')) return 'audio/mp4'
  if (lower.endsWith('.aac')) return 'audio/aac'
  return 'application/octet-stream'
}

const __fetchLocalAudioBlobUrl = async (absolutePath, mimeTypeHint = '') => {
  const cacheKey = __normalizeLocalAudioCacheKey(absolutePath)
  if (!cacheKey) return ''
  const cached = __localAudioBlobUrlCache.get(cacheKey)
  if (cached?.url) {
    __touchLocalAudioCache(cacheKey)
    return cached.url
  }
  const api = typeof window !== 'undefined' ? window?.electronAPI?.lines?.readAudioFile : null
  if (typeof api !== 'function') return ''
  const res = await api(absolutePath)
  if (!res?.ok || !res?.bytes) return ''
  const bytes = res.bytes instanceof Uint8Array ? res.bytes : new Uint8Array(res.bytes)
  if (!bytes.byteLength) return ''
  const blob = new Blob([bytes], { type: res.mimeType || mimeTypeHint || __guessAudioMimeType(absolutePath) })
  const objectUrl = URL.createObjectURL(blob)
  __setLocalAudioBlobCache(cacheKey, objectUrl)
  return objectUrl
}

const __fetchCloudAudioBlobUrl = async (lineName, relativePath) => {
  const ln = __normalizeRuntimeLineName(lineName)
  const rel = __normalizeCloudAudioRelPath(relativePath)
  if (!ln || !rel) return ''
  const cacheKey = `${ln}::${rel.toLowerCase()}`
  const cached = __cloudAudioBlobUrlCache.get(cacheKey)
  if (cached?.url) {
    __touchCloudAudioCache(cacheKey)
    return cached.url
  }
  const base = String(CLOUD_API_BASE || '').replace(/\/+$/, '')
  if (!base) return ''
  const url = `${base}/runtime/lines/${encodeURIComponent(ln)}/audio?path=${encodeURIComponent(rel)}`
  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'audio/*,application/octet-stream;q=0.9,*/*;q=0.8' }
  })
  if (!res.ok) return ''
  const blob = await res.blob()
  if (!blob || !blob.size) return ''
  const objectUrl = URL.createObjectURL(blob)
  __setCloudAudioBlobCache(cacheKey, objectUrl)
  return objectUrl
}

const __findCloudAudioByStationName = async (lineName, stationName, opts = {}) => {
  const ln = __normalizeRuntimeLineName(lineName)
  const sn = String(stationName || '').trim()
  if (!ln || !sn) return null
  const base = String(CLOUD_API_BASE || '').replace(/\/+$/, '')
  if (!base) return null
  const url = `${base}/runtime/lines/${encodeURIComponent(ln)}/find-audio`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      stationName: sn,
      opts: {
        role: opts?.role || '',
        doorSide: opts?.doorSide || opts?.door || '',
        languageKey: opts?.languageKey || '',
        dialectKey: opts?.dialectKey || '',
        peerStationNames: Array.isArray(opts?.peerStationNames) ? opts.peerStationNames : []
      }
    })
  })
  if (!res.ok) return null
  const json = await res.json().catch(() => null)
  if (!json || !json.ok || typeof json.relativePath !== 'string' || !json.relativePath) return null
  return json.relativePath
}

const __getDynamicAudioCloudMode = () => {
  try {
    if (typeof localStorage === 'undefined') return 'local-first'
    const raw = localStorage.getItem('pids_settings_v1')
    if (!raw) return 'local-first'
    const parsed = JSON.parse(raw)
    const mode = String(parsed?.dynamicAudioCloudMode || '').trim().toLowerCase()
    if (mode === 'local-only' || mode === 'local-first' || mode === 'cloud-first' || mode === 'cloud-only') return mode
  } catch (e) {}
  return 'local-first'
}

export function useStationAudio(state) {
  if (!state) return { playArrive: () => {}, playDepart: () => {} }

  const instanceId = ++__stationAudioInstanceSeq
  let playSessionId = 0
  let currentAudio = null
  let sharedAudioContext = null
  let hasMediaStartedForSession = false
  let pausedByMedia = false
  let lastTriggerMeta = null // { type: 'arrive'|'depart', idx: number, at: number }

  const audioDiagLog = (level, message, extra) => {
    const lv = String(level || 'warn').toLowerCase()
    if (lv === 'error') console.error(message, extra)
    else if (lv === 'log' || lv === 'info') console.log(message, extra)
    else console.warn(message, extra)
    try {
      if (
        typeof window !== 'undefined' &&
        window.electronAPI &&
        typeof window.electronAPI.logRendererAudio === 'function'
      ) {
        window.electronAPI.logRendererAudio({
          level: lv,
          message: String(message || ''),
          extra
        })
      }
    } catch (e) {}
  }

  try {
    audioDiagLog('info', '[useStationAudio][logger][ready]', {
      instanceId,
      hasElectronApi: !!(typeof window !== 'undefined' && window.electronAPI),
      hasRendererAudioLogger: !!(typeof window !== 'undefined' && window.electronAPI && typeof window.electronAPI.logRendererAudio === 'function')
    })
  } catch (e) {}

  let lastStationPlayback = null // { type: 'arrive'|'depart', idx: number }
  const canUseMediaSession = typeof navigator !== 'undefined' && !!navigator.mediaSession && typeof navigator.mediaSession.setActionHandler === 'function'
  const setExternalMediaControlState = (playbackState) => {
    if (typeof window === 'undefined') return
    window.__stationAudioMediaState = playbackState || 'none'
  }
  const setPlaybackState = (playbackState) => {
    setExternalMediaControlState(playbackState)
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

  // 只注册一次系统媒体按钮回调；具体控制哪个实例由 window.__activeStationAudioController 指定。
  if (
    canUseMediaSession &&
    typeof window !== 'undefined' &&
    !__mediaSessionHandlersRegistered
  ) {
    try {
      navigator.mediaSession.setActionHandler('play', async () => {
        const ctrl = window.__activeStationAudioController
        if (ctrl?.resumeFromMedia) {
          try { await ctrl.resumeFromMedia() } catch (e) {}
        } else if (ctrl?.playFromLast) {
          try { await ctrl.playFromLast() } catch (e) {}
        }
      })
      navigator.mediaSession.setActionHandler('pause', async () => {
        const ctrl = window.__activeStationAudioController
        if (ctrl?.pauseFromMedia) {
          try { await ctrl.pauseFromMedia() } catch (e) {}
        }
      })
      navigator.mediaSession.setActionHandler('stop', async () => {
        const ctrl = window.__activeStationAudioController
        if (ctrl?.stopFromMedia) {
          try { await ctrl.stopFromMedia() } catch (e) {}
        }
      })
    } catch (e) {}
    __mediaSessionHandlersRegistered = true
  }

  const setActiveController = (ctrl) => {
    if (typeof window === 'undefined') return
    window.__activeStationAudioController = ctrl || null
  }
  const clearActiveControllerIfSelf = () => {
    if (typeof window === 'undefined') return
    if (window.__activeStationAudioController?.id === instanceId) window.__activeStationAudioController = null
  }

  const stopDomAudios = () => {
    try {
      if (typeof document === 'undefined') return
      const nodes = document.getElementsByTagName('audio') || []
      for (const el of nodes) {
        try {
          el.muted = true
          el.volume = 0
          el.pause()
          el.currentTime = 0
          el.src = ''
          if (typeof el.load === 'function') el.load()
        } catch (e) {}
      }
    } catch (e) {}
  }

  const ensureAudioContext = async () => {
    if (typeof window === 'undefined') return null
    const AC = window.AudioContext || window.webkitAudioContext
    if (typeof AC !== 'function') return null
    if (!sharedAudioContext) sharedAudioContext = new AC()
    if (sharedAudioContext.state === 'suspended') {
      try { await sharedAudioContext.resume() } catch (e) {}
    }
    return sharedAudioContext
  }

  const isWebAudioController = (value) => !!(value && value.__stationAudioKind === 'webaudio')

  const isNativeManagedWavController = (value) => !!(value && value.__stationAudioKind === 'native-managed-wav')

  const shouldUseNativeManagedWavPlayback = ({ absolutePath, rawUrl, mimeTypeHint }) => {
    if (typeof window === 'undefined') return false
    if (window.electronAPI?.platform !== 'win32') return false
    if (typeof window.electronAPI?.audio?.playNativeManagedWav !== 'function') return false
    const pathLower = String(absolutePath || '').trim().toLowerCase()
    const mimeLower = String(mimeTypeHint || '').trim().toLowerCase()
    const rawLower = String(rawUrl || '').trim().toLowerCase()
    if (!pathLower || !pathLower.endsWith('.wav')) return false
    if (!(pathLower.includes('\\managed-line-audio\\') || pathLower.includes('/managed-line-audio/'))) return false
    if (mimeLower && !['audio/wav', 'audio/wave', 'audio/x-wav'].includes(mimeLower)) return false
    return rawLower.startsWith('local-audio-stream://') || rawLower.startsWith('local-audio://') || rawLower.startsWith('file:///')
  }

  const shouldUseDecodedBufferPlayback = ({ rawUrl, playbackUrl, absolutePath, mimeTypeHint }) => {
    const pathLower = String(absolutePath || '').trim().toLowerCase()
    const mimeLower = String(mimeTypeHint || '').trim().toLowerCase()
    const rawLower = String(rawUrl || '').trim().toLowerCase()
    const playbackLower = String(playbackUrl || '').trim().toLowerCase()
    if (pathLower.endsWith('.wav')) return true
    if (mimeLower === 'audio/wav' || mimeLower === 'audio/wave' || mimeLower === 'audio/x-wav') return true
    return (
      (rawLower.startsWith('local-audio-stream://') || rawLower.startsWith('local-audio://')) &&
      (rawLower.endsWith('.wav') || playbackLower.startsWith('blob:'))
    )
  }

  const normalizeDecodedBufferForPlayback = (ctx, decoded) => {
    if (!decoded) return decoded
    const ctxRate = Number(ctx?.sampleRate || 0)
    const srcRate = Number(decoded.sampleRate || 0)
    const channels = Number(decoded.numberOfChannels || 0)
    if (channels !== 1 && (!ctxRate || !srcRate || ctxRate === srcRate)) return decoded

    const frameCount = Number(decoded.length || 0)
    if (!frameCount) return decoded
    const targetChannels = channels === 1 ? 2 : channels
    const targetRate = ctxRate || srcRate || 48000
    const normalized = ctx.createBuffer(targetChannels, frameCount, targetRate)
    for (let ch = 0; ch < targetChannels; ch++) {
      const srcIndex = Math.min(ch, channels - 1)
      normalized.getChannelData(ch).set(decoded.getChannelData(srcIndex))
    }
    return normalized
  }

  const playDecodedAudioBuffer = async ({ sessionId, rawUrl, playbackUrl, absolutePath, urlDisplay, audioDebug, timeoutMs }) => {
    const ctx = await ensureAudioContext()
    if (!ctx) throw new Error('AudioContext unavailable')
    const res = await fetch(playbackUrl, {
      headers: { Accept: 'audio/wav,application/octet-stream;q=0.9,*/*;q=0.8' }
    })
    if (!res.ok) throw new Error(`fetch audio failed: ${res.status}`)
    const arr = await res.arrayBuffer()
    if (sessionId !== playSessionId) return
    const decoded = await ctx.decodeAudioData(arr.slice(0))
    const normalized = normalizeDecodedBufferForPlayback(ctx, decoded)
    if (sessionId !== playSessionId) return

    await new Promise((resolve, reject) => {
      let done = false
      let timeoutId = null
      let pausedWaiting = false
      let sourceNode = null
      const controller = {
        __stationAudioKind: 'webaudio',
        paused: false,
        muted: false,
        volume: 1,
        currentTime: 0,
        src: playbackUrl,
        load: () => {},
        pause: async () => {
          controller.paused = true
          try { await ctx.suspend() } catch (e) {}
        },
        stop: () => {
          try { if (sourceNode) sourceNode.stop(0) } catch (e) {}
        }
      }
      const cleanup = () => {
        if (timeoutId) clearTimeout(timeoutId)
        timeoutId = null
        if (currentAudio === controller) currentAudio = null
      }
      const finishResolve = () => {
        if (done) return
        done = true
        cleanup()
        resolve()
      }
      const finishReject = (err) => {
        if (done) return
        done = true
        cleanup()
        reject(err)
      }
      const armTimeout = () => {
        if (timeoutId) clearTimeout(timeoutId)
        timeoutId = setTimeout(() => {
          audioDiagLog('warn', '[useStationAudio][playAudioFile][timeout]', { sessionId, url: rawUrl, playbackUrl, urlDisplay, timeoutMs, mode: 'webaudio' })
          try { controller.stop() } catch (e) {}
          finishReject(new Error(`audio timeout after ${timeoutMs}ms`))
        }, timeoutMs)
      }
      const ensureResumeLoop = () => {
        if (!pausedWaiting) return
        const tick = async () => {
          if (done) return
          if (sessionId !== playSessionId) return finishResolve()
          if (!pausedByMedia) {
            pausedWaiting = false
            controller.paused = false
            armTimeout()
            try { await ctx.resume() } catch (e) { return finishReject(e) }
            setPlaybackState('playing')
            audioDiagLog('warn', '[useStationAudio][playAudioFile][resumed]', { sessionId, url: rawUrl, playbackUrl, urlDisplay, absolutePath, audioDebug, mode: 'webaudio' })
          }
          if (pausedWaiting) setTimeout(tick, 120)
        }
        setTimeout(tick, 120)
      }

      sourceNode = ctx.createBufferSource()
      sourceNode.buffer = normalized
      sourceNode.connect(ctx.destination)
      sourceNode.onended = () => {
        if (done) return
        if (sessionId === playSessionId && pausedByMedia) {
          pausedWaiting = true
          controller.paused = true
          return
        }
        finishResolve()
      }

      currentAudio = controller
      audioDiagLog('warn', '[useStationAudio][playAudioFile][start]', {
        sessionId,
        url: rawUrl,
        playbackUrl,
        urlDisplay,
        absolutePath,
        audioDebug,
        mode: 'webaudio',
        contextSampleRate: ctx.sampleRate,
        destinationChannels: ctx.destination?.channelCount,
        destinationMaxChannels: ctx.destination?.maxChannelCount,
        decodedSampleRate: decoded.sampleRate,
        decodedChannels: decoded.numberOfChannels,
        decodedDuration: decoded.duration,
        playbackSampleRate: normalized.sampleRate,
        playbackChannels: normalized.numberOfChannels
      })

      armTimeout()
      try {
        sourceNode.start(0)
        if (sessionId === playSessionId && !hasMediaStartedForSession) {
          hasMediaStartedForSession = true
          setPlaybackState('playing')
        }
        controller.paused = false
        audioDiagLog('warn', '[useStationAudio][playAudioFile][playing]', {
          sessionId,
          url: rawUrl,
          playbackUrl,
          urlDisplay,
          absolutePath,
          audioDebug,
          mode: 'webaudio',
          contextSampleRate: ctx.sampleRate,
          decodedSampleRate: decoded.sampleRate,
          decodedChannels: decoded.numberOfChannels,
          playbackSampleRate: normalized.sampleRate,
          playbackChannels: normalized.numberOfChannels
        })
      } catch (e) {
        finishReject(e)
        return
      }

      ensureResumeLoop()
    })
  }

  const playNativeManagedWav = async ({ sessionId, rawUrl, absolutePath, urlDisplay, audioDebug, timeoutMs }) => {
    const api = window?.electronAPI?.audio?.playNativeManagedWav
    if (typeof api !== 'function') throw new Error('native managed wav playback unavailable')
    await new Promise((resolve, reject) => {
      let done = false
      let timeoutId = null
      const controller = {
        __stationAudioKind: 'native-managed-wav',
        paused: false,
        muted: false,
        volume: 1,
        currentTime: 0,
        src: absolutePath,
        load: () => {},
        pause: async () => {
          controller.paused = true
          try { await window?.electronAPI?.audio?.stopNativeManagedWav?.() } catch (e) {}
        },
        stop: async () => {
          try { await window?.electronAPI?.audio?.stopNativeManagedWav?.() } catch (e) {}
        }
      }
      const cleanup = () => {
        if (timeoutId) clearTimeout(timeoutId)
        timeoutId = null
        if (currentAudio === controller) currentAudio = null
      }
      const finishResolve = () => {
        if (done) return
        done = true
        cleanup()
        resolve()
      }
      const finishReject = (err) => {
        if (done) return
        done = true
        cleanup()
        reject(err)
      }
      currentAudio = controller
      audioDiagLog('warn', '[useStationAudio][playAudioFile][start]', {
        sessionId,
        url: rawUrl,
        playbackUrl: absolutePath,
        urlDisplay,
        absolutePath,
        audioDebug,
        mode: 'native-managed-wav'
      })
      timeoutId = setTimeout(() => {
        audioDiagLog('warn', '[useStationAudio][playAudioFile][timeout]', { sessionId, url: rawUrl, playbackUrl: absolutePath, urlDisplay, timeoutMs, mode: 'native-managed-wav' })
        void controller.stop()
        finishReject(new Error(`native managed wav timeout after ${timeoutMs}ms`))
      }, timeoutMs)
      Promise.resolve()
        .then(async () => {
          const res = await api(absolutePath)
          if (!res?.ok && !res?.stopped) throw new Error(String(res?.error || 'native managed wav failed'))
          if (sessionId === playSessionId && !hasMediaStartedForSession) {
            hasMediaStartedForSession = true
            setPlaybackState('playing')
          }
          audioDiagLog('warn', '[useStationAudio][playAudioFile][playing]', {
            sessionId,
            url: rawUrl,
            playbackUrl: absolutePath,
            urlDisplay,
            absolutePath,
            audioDebug,
            mode: 'native-managed-wav',
            stopped: !!res?.stopped
          })
          finishResolve()
        })
        .catch((err) => finishReject(err))
    })
  }

  // 清理线路名中的富文本标签
  const cleanLineName = (n) => (n ? String(n).replace(/<[^>]+>([^<]*)<\/>/g, '$1').trim() : '')

  // 获取当前线路的文件或目录路径，用于解析相对音频路径
  const getLineDirOrFilePath = () => {
    const lineName = cleanLineName(state.appData?.meta?.lineName)
    if (lineName && state.lineNameToFilePath && state.lineNameToFilePath[lineName]) return state.lineNameToFilePath[lineName]
    if (state.currentFilePath && typeof state.currentFilePath === 'string' && state.currentFilePath.trim()) return state.currentFilePath.trim()
    if (typeof window !== 'undefined' && window.__currentLineFilePath) return window.__currentLineFilePath
    if (state.currentFolderId && Array.isArray(state.folders) && state.folders.length) {
      const folder = state.folders.find((f) => f && f.id === state.currentFolderId)
      if (folder?.path) return folder.path
      const defFolder = state.folders.find((f) => f && (f.id === 'default' || f.name === '默认'))
      if (defFolder?.path) return defFolder.path
      const firstFolder = state.folders.find((f) => f && f.path)
      if (firstFolder?.path) return firstFolder.path
    }
    return ''
  }

  // 规范化站名/文件名，便于模糊匹配
  const normalizeName = (s) => {
    if (!s || typeof s !== 'string') return ''
    let v = s
    // 去掉末尾站名后缀
    v = v.replace(/(站|駅|역)$/u, '')
    // 去掉英文常见站名后缀
    v = v.replace(/(station|st|st\.)$/iu, '')
    // 去掉常见分隔符/括号
    v = v.replace(/[\s\-_]/g, '')
    v = v.replace(/[()（）\[\]【】]/g, '')
    // 去掉中英文标点/符号
    v = v.replace(/[,:;.!?，。；：!“”"'‘’、\/\\|]/g, '')
    v = v.trim()
    return v.toLowerCase()
  }

  // 导航式打断：停止并清空当前播放
  const stopCurrentPlayback = () => {
    if (!currentAudio) return
    try {
      const a = currentAudio
      if (isWebAudioController(a) || isNativeManagedWavController(a)) {
        a.stop()
      } else {
        a.muted = true
        a.volume = 0
        a.pause()
      // 不在这里清空 onended/onpause/onerror：
      // playAudioFile 内部会用这些事件/超时来 resolve/reject Promise，
      // 清空会导致队列等待永远无法结束。
      a.pause()
      a.currentTime = 0
      // 彻底清空源，避免浏览器延迟触发 onpause/onended
        a.src = ''
        if (typeof a.load === 'function') {
          a.load()
        }
      }
    } catch (e) {}
    currentAudio = null
    stopDomAudios()
  }

  // 彻底中止当前会话（含列表循环），供外部打断调用
  const abortPlayback = async () => {
    playSessionId++
    stopCurrentPlayback()
    stopDomAudios()
    hasMediaStartedForSession = false
    setPlaybackState('none')
    // 让事件循环有机会清理正在排队的播放任务
    await Promise.resolve()
  }

  // “暂停”仅用于系统媒体面板：停止当前串行队列，但把卡片保留为 paused 状态。
  // 由于这里无法从“暂停点”继续播放，之后点击系统 Play 会从“最后一次进/出站”重新开始。
  const pauseForMediaPanel = async () => {
    // 真暂停：不改变 playSessionId，不终止队列，让 playAudioFile 进入“等待恢复”状态。
    pausedByMedia = true
    try {
      if (currentAudio) currentAudio.pause()
    } catch (e) {}
    setPlaybackState('paused')
    await Promise.resolve()
  }

  // “停止”用于系统媒体面板：停止并清除卡片。
  const stopForMediaPanel = async () => {
    playSessionId++
    pausedByMedia = false
    stopCurrentPlayback()
    stopDomAudios()
    hasMediaStartedForSession = false
    setPlaybackState('none')
    await Promise.resolve()
  }

  const resumeForMediaPanel = async () => {
    if (!pausedByMedia) {
      if (currentAudio && !currentAudio.paused) {
        setPlaybackState('playing')
        return true
      }
      if (lastStationPlayback) {
        const cmd = lastStationPlayback
        if (cmd.type === 'arrive') playArrive(cmd.idx)
        else playDepart(cmd.idx)
        return true
      }
      return false
    }
    pausedByMedia = false
    setPlaybackState('playing')
    await Promise.resolve()
    return true
  }

  const toggleForMediaPanel = async () => {
    if (pausedByMedia || (currentAudio && currentAudio.paused)) {
      return await resumeForMediaPanel()
    }
    if (currentAudio) {
      await pauseForMediaPanel()
      return true
    }
    if (lastStationPlayback) {
      return await resumeForMediaPanel()
    }
    return false
  }

  if (typeof window !== 'undefined') {
    try {
      if (!Array.isArray(window.__stopStationAudioFns)) window.__stopStationAudioFns = []
      window.__stopStationAudioFns.push(abortPlayback)
      window.__stopStationAudio = async () => {
        const fns = Array.isArray(window.__stopStationAudioFns) ? [...window.__stopStationAudioFns] : []
        for (const fn of fns) {
          try { await fn() } catch (e) {}
        }
      }
    } catch (e) {}
  }

  // 将多桶结构统一展平成列表
  const collectBucketList = (bucket) => {
    if (!bucket || typeof bucket !== 'object') return []
    if (Array.isArray(bucket.list)) return bucket.list
    const merged = []
    const pushList = (arr) => Array.isArray(arr) && merged.push(...arr)
    pushList(bucket.welcome)
    pushList(bucket.arrive)
    pushList(bucket.depart)
    pushList(bucket.end)
    return merged
  }

  const hasBucketAudioEntries = (bucket) => collectBucketList(bucket).length > 0

  const hasStationAudioEntries = (sa) => {
    if (!sa || typeof sa !== 'object') return false
    if (hasBucketAudioEntries(sa.up) || hasBucketAudioEntries(sa.down)) return true
    const dialectLists = sa.dialectLists
    if (!dialectLists || typeof dialectLists !== 'object') return false
    return Object.values(dialectLists).some((bucket) => {
      if (!bucket || typeof bucket !== 'object') return false
      return hasBucketAudioEntries(bucket.up) || hasBucketAudioEntries(bucket.down)
    })
  }

  const hasCommonAudioEntries = (meta) => {
    const common = meta?.commonAudio
    if (!common || typeof common !== 'object') return false
    return hasBucketAudioEntries(common.up) || hasBucketAudioEntries(common.down)
  }

  const hasAnyPlayableAudioConfig = (sa, meta) => {
    return hasStationAudioEntries(sa) || hasCommonAudioEntries(meta)
  }

  const isDynamicAudioDebugEnabled = () => {
    try {
      return window?.localStorage?.getItem('metro_pids_debug_dynamic_audio') === '1'
        || localStorage?.getItem?.('metro_pids_debug_dynamic_audio') === '1'
    } catch (e) {
      return false
    }
  }

  // 按站名/角色匹配音频条目（去重）
  const pickStationItems = (list, stations, idx, roleKey) => {
    if (!Array.isArray(list) || !stations || !stations.length) return []
    if (typeof idx !== 'number' || idx < 0 || idx >= stations.length) return []
    const stationName = normalizeName(stations[idx]?.name || '')
    if (!stationName) return []
    const seen = new Set()
    return list.filter((item) => {
      const base = normalizeName((item.name || item.path || '').replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, ''))
      const isRoleMatch = roleKey && item.role === roleKey
      const matched = base && stationName && base.includes(stationName)
      if (!isRoleMatch && !matched) return false
      const key = item.path || item.name || base
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  // 根据是否分离方向决定使用上/下行
  const getDirKey = (sa, meta) => {
    if (!sa || typeof sa !== 'object') return 'up'
    // meta.dirType 的语义是：up/outer => 上行，down/inner => 下行
    if (sa.separateDirection) return (meta?.dirType === 'down' || meta?.dirType === 'inner') ? 'down' : 'up'
    return 'up'
  }

  const normalizeDynamicDialectTabs = (sa) => {
    if (!sa || typeof sa !== 'object') return []
    const raw = Array.isArray(sa.dynamicDialectTabs) ? sa.dynamicDialectTabs : []
    const out = []
    const seen = new Set()
    for (const it of raw) {
      const k = String(it || '').trim()
      if (!k || seen.has(k)) continue
      seen.add(k)
      out.push(k)
    }
    if (!out.length) {
      const cur = String(sa.dynamicDialect || '').trim()
      if (cur) out.push(cur)
    }
    // 如果仍然没有动态方言配置，但 dialectLists 本身有内容，
    // 则回退为“使用 dialectLists 的所有 key”，确保播放能覆盖到多方言数据。
    if (!out.length) {
      const dialectLists = sa.dialectLists && typeof sa.dialectLists === 'object' ? sa.dialectLists : null
      if (dialectLists) {
        const keys = Object.keys(dialectLists)
          .map((k) => String(k || '').trim())
          .filter(Boolean)
        for (const k of keys) {
          if (seen.has(k)) continue
          seen.add(k)
          out.push(k)
        }
      }
    }
    return out
  }

  // 按 Tab 顺序组装多语种播放列表（每条保留 dialectKey）
  // 注意：这里是“逐 Tab 独立筛选后再拼接”，确保播放顺序为：
  // tab1(到/出站) -> tab2(到/出站) -> tab3...
  const buildDialectOrderedFilteredList = ({
    sa,
    dir,
    forArrive,
    serviceMode,
    isShortTurn,
    stations,
    meta,
    currentIdx
  }) => {
    if (!sa || typeof sa !== 'object') return []
    const tabs = normalizeDynamicDialectTabs(sa)
    const dialectLists = sa.dialectLists && typeof sa.dialectLists === 'object' ? sa.dialectLists : null
    if (!dialectLists || !tabs.length) {
      const bucket = dir === 'down' ? sa.down || {} : sa.up || {}
      const rawList = collectBucketList(bucket)
      return getFilteredList(rawList, serviceMode, isShortTurn, forArrive, stations, meta, dir, currentIdx)
    }
    const merged = []
    for (const key of tabs) {
      const dialectBucket = dialectLists[key]
      if (!dialectBucket || typeof dialectBucket !== 'object') continue
      const primary = dir === 'down' ? dialectBucket.down : dialectBucket.up
      const fallback = dir === 'down' ? dialectBucket.up : dialectBucket.down
      const rawList = collectBucketList(primary || fallback || {})
      const tabFiltered = getFilteredList(rawList, serviceMode, isShortTurn, forArrive, stations, meta, dir, currentIdx)
      for (const item of tabFiltered) {
        if (!item || typeof item !== 'object') continue
        merged.push({
          ...item,
          dialectKey: (typeof item.dialectKey === 'string' && item.dialectKey.trim()) ? item.dialectKey.trim() : key
        })
      }
    }
    if (merged.length) return merged
    // 多方言筛选都返回空时，回退到单一方言，但仍需应用 forArrive 筛选
    const bucket = dir === 'down' ? sa.down || {} : sa.up || {}
    const fallbackList = collectBucketList(bucket)
    return getFilteredList(fallbackList, serviceMode, isShortTurn, forArrive, stations, meta, dir, currentIdx)
  }

  // 根据模式/短交路/进出站筛选可播放列表，并附加首末站角色条目
  const getFilteredList = (list, serviceMode, isShortTurn, forArrive, stations, meta, dir, currentIdx, debugTag) => {
    if (!Array.isArray(list)) return []
    const configuredStartIdx = typeof meta?.startIdx === 'number' && meta.startIdx >= 0 ? meta.startIdx : 0
    const configuredTermIdx =
      typeof meta?.termIdx === 'number' && meta.termIdx >= 0
        ? meta.termIdx
        : (Array.isArray(stations) && stations.length ? stations.length - 1 : -1)
    const isReverseDirection = dir === 'down' || meta?.dirType === 'down' || meta?.dirType === 'inner'
    const lineStartIdx = isReverseDirection ? configuredTermIdx : configuredStartIdx
    const lineTermIdx = isReverseDirection ? configuredStartIdx : configuredTermIdx
    const nextIdxForDepart =
      forArrive === false && Array.isArray(stations) && typeof currentIdx === 'number' && currentIdx >= 0
        ? calculateNextStationIndex(currentIdx, { stations, meta: meta || {} })
        : -1
    const isDepartTowardTerminal =
      forArrive === false &&
      typeof nextIdxForDepart === 'number' &&
      nextIdxForDepart >= 0 &&
      lineTermIdx >= 0 &&
      nextIdxForDepart === lineTermIdx
    const isDepartTowardStart =
      forArrive === false &&
      typeof nextIdxForDepart === 'number' &&
      nextIdxForDepart >= 0 &&
      lineStartIdx >= 0 &&
      nextIdxForDepart === lineStartIdx
    const matchServiceScenario = (item) => {
      if (!item || typeof item !== 'object') return false
      if (serviceMode === 'normal' && !isShortTurn) {
        if (item.disabledInNormal) return false
        const hasSpecial = item.modes && (item.modes.shortTurn || item.modes.express || item.modes.direct)
        if (hasSpecial) return false
      }
      if (isShortTurn && item.modes && item.modes.shortTurn) return true
      if (serviceMode === 'express' && item.modes && item.modes.express) return true
      if (serviceMode === 'direct' && item.modes && item.modes.direct) return true
      if (serviceMode === 'normal' && !item.disabledInNormal) return true
      return false
    }
    const filtered = list.filter((item) => {
      const hasArriveFlag = item.modes && item.modes.arrive === true
      const hasDepartFlag = item.modes && item.modes.depart === true
      if (forArrive === true && hasDepartFlag && !hasArriveFlag) return false
      if (forArrive === false && hasArriveFlag && !hasDepartFlag) return false

      if (item.modes && item.modes.originStation === true) {
        const isAtStart = typeof currentIdx === 'number' && lineStartIdx >= 0 && currentIdx === lineStartIdx
        if (!isAtStart && !isDepartTowardStart) return false
      }
      if (item.modes && item.modes.terminalStation === true) {
        const isAtTerminal = typeof currentIdx === 'number' && lineTermIdx >= 0 && currentIdx === lineTermIdx
        if (!isAtTerminal && !isDepartTowardTerminal) return false
      }
      return matchServiceScenario(item)
    })

    const extras = []
    if (stations && Array.isArray(stations) && typeof currentIdx === 'number') {
      const startIdx = lineStartIdx
      const termIdx = lineTermIdx
      // extras 以前会绕过 modes.arrive/modes.depart 的筛选，导致“出站( depart )”时也把“仅进站(arrive)/欢迎”的条目拼进去。
      // 这里补上与 filtered 相同的 arrive/depart 兼容规则，避免首站出站播放进站音频。
      const filterExtrasByArriveDepart = (items) => {
        if (forArrive !== true && forArrive !== false) return items
        return (items || []).filter((item) => {
          const hasArriveFlag = item.modes && item.modes.arrive === true
          const hasDepartFlag = item.modes && item.modes.depart === true
          if (forArrive === true && hasDepartFlag && !hasArriveFlag) return false
          if (forArrive === false && hasArriveFlag && !hasDepartFlag) return false
          if (!matchServiceScenario(item)) return false
          return true
        })
      }

      if (currentIdx === startIdx || isDepartTowardStart) {
        const startItems = pickStationItems(list, stations, startIdx, 'start')
        extras.push(...filterExtrasByArriveDepart(startItems))
      }
      if (currentIdx === termIdx || isDepartTowardTerminal) {
        const terminalItems = pickStationItems(list, stations, termIdx, 'terminal')
        extras.push(...filterExtrasByArriveDepart(terminalItems))
      }
    }

    const seen = new Set()
    const merged = [...filtered, ...extras].filter((item) => {
      // 去重 key：
      // - 对有 path 的条目，用 path 去重（同一文件不重复播放）
      // - 对“动态占位符”（无 path 但有 role）的条目，必须把 role/dialectKey 纳入 key，
      //   否则多个动态音频（如 start/terminal/next）会因 name 相同或为空而互相覆盖，导致只能播放部分。
      const key = (() => {
        const p = item?.path
        if (typeof p === 'string' && p.trim()) return `path::${p.trim()}`
        const role = item?.role
        if (typeof role === 'string' && role.trim()) {
          const dk = (typeof item?.dialectKey === 'string' && item.dialectKey.trim()) ? item.dialectKey.trim() : ''
          const n = (typeof item?.name === 'string' && item.name.trim()) ? item.name.trim() : ''
          return `role::${role.trim()}::dialect::${dk}::name::${n}`
        }
        const n = item?.name
        if (typeof n === 'string' && n.trim()) return `name::${n.trim()}`
        return `json::${JSON.stringify(item)}`
      })()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    if (isDynamicAudioDebugEnabled() && merged.length === 0 && Array.isArray(list) && typeof currentIdx === 'number') {
      const startIdx = lineStartIdx
      const termIdx = lineTermIdx
      const payload = {
        debugTag,
        currentIdx,
        dir,
        forArrive,
        serviceMode,
        isShortTurn,
        startIdx,
        termIdx,
        rawListLength: list.length,
        filteredLength: filtered.length,
        extrasLength: extras.length,
        sampleModes: list.slice(0, 3).map((it) => ({
          path: it?.path,
          name: it?.name,
          disabledInNormal: it?.disabledInNormal,
          modes: it?.modes
        }))
      }
      // 用 JSON.stringify 固化输出，避免 devtools 在复制时把字段省略成 …
      audioDiagLog('warn', '[useStationAudio][getFilteredList][empty]', JSON.stringify(payload))
    }
    return merged
  }

  // 计算下一站索引（兼容环线/内外圈）
  const getNextStationIdx = (currentIdx, appData) => {
    try {
      if (typeof calculateNextStationIndex === 'function') return calculateNextStationIndex(currentIdx, appData)
    } catch (e) {}
    const meta = appData?.meta || {}
    const dirType = meta.dirType || 'up'
    const step = meta.mode === 'loop' ? (dirType === 'outer' ? 1 : -1) : (dirType === 'up' ? 1 : -1)
    const nextIdx = currentIdx + step
    if (!appData?.stations || !appData.stations.length) return nextIdx
    return Math.max(0, Math.min(appData.stations.length - 1, nextIdx))
  }

  // 在站点音频中按角色/站名寻找匹配条目
  const resolveFromStations = ({ stations, dir, role, preferIdx, allowNameMatch, stationName }) => {
    if (!Array.isArray(stations) || !stations.length) return null
    const order = []
    if (typeof preferIdx === 'number' && preferIdx >= 0 && preferIdx < stations.length) order.push(preferIdx)
    for (let i = 0; i < stations.length; i++) if (i !== preferIdx) order.push(i)

    for (const idx of order) {
      const st = stations[idx]
      if (!st || !st.stationAudio || typeof st.stationAudio !== 'object') continue
      const sa = st.stationAudio
      const dirsToTry = sa.separateDirection ? [dir, dir === 'down' ? 'up' : 'down'] : ['up', 'down']
      for (const dk of dirsToTry) {
        const lst = collectBucketList(sa[dk] || {})
        let found = null
        if (role) found = lst.find((c) => c && c.role === role && c.path)
        if (!found && allowNameMatch && stationName) {
          const targetName = normalizeName(stationName)
          found = lst.find((c) => normalizeName((c?.name || c?.path || '').replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '')).includes(targetName))
          if (found && !found.path) found = null
        }
        if (found) return { item: found, idx }
      }
    }
    return null
  }

  // 在通用音频中按角色/站名寻找匹配条目
  const resolveFromCommon = (role, dir, stationName) => {
    const common = state.appData?.meta?.commonAudio
    if (!common || typeof common !== 'object') return null
    const useSeparate = common.separateDirection !== false
    const primary = useSeparate ? (dir === 'down' ? common.down : common.up) : common.up
    const secondary = useSeparate ? (dir === 'down' ? common.up : common.down) : common.down
    const buckets = [primary, secondary].filter(Boolean)
    for (const b of buckets) {
      const lst = collectBucketList(b)
      let found = null
      if (role) found = lst.find((c) => c && c.role === role && c.path)
      if (!found && stationName) {
        const targetName = normalizeName(stationName)
        found = lst.find((c) => normalizeName((c?.name || c?.path || '').replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '')).includes(targetName) && c.path)
      }
      if (found) return found
    }
    return null
  }

  // 将占位音频（start/terminal/current/next）映射为实际可播放条目
  const resolvePlaceholderItem = async (item, dir, ctx) => {
    if (!item || item.path) return item
    const role = item.role
    if (!role) return item

    const stations = ctx?.stations || state.appData?.stations || []
    const meta = ctx?.meta || state.appData?.meta || {}
    const appData = ctx?.appData || state.appData || { stations, meta }
    const currentIdx = typeof ctx?.currentIdx === 'number' ? ctx.currentIdx : -1

    const langKey = (() => {
      try {
        return i18n?.global?.locale?.value || 'zh-CN'
      } catch (e) {
        return 'zh-CN'
      }
    })()

    const dialectKey = (() => {
      // 优先：占位项上显式指定（同站可多套语音版本）
      if (item && typeof item === 'object' && typeof item.dialectKey === 'string' && item.dialectKey.trim()) return item.dialectKey.trim()
      // 其次：线路 meta 上的全局配置（可选）
      const m = meta && typeof meta === 'object' ? meta : {}
      const v = m.dynamicAudioDialect || m.dynamicDialect || m.audioDialect
      if (typeof v === 'string' && v.trim()) return v.trim()
      // 默认：中文 -> 普通话
      return 'cmn'
    })()

    // 动态占位符“找音频文件”时，关键是传给主进程的 stationName 要能命中音频文件名。
    // 因为不同数据源可能出现“英文目录里的文件名其实是中文/混合命名”的情况，
    // 所以这里返回“候选站名列表”，在失败时可降级尝试。
    const getStationNameCandidatesByTargetDialect = (st) => {
      if (!st || typeof st !== 'object') return []
      const d = String(dialectKey || '').toLowerCase()
      const isEnglish = d === 'en' || d.startsWith('en')

      const uniqPush = (arr, v) => {
        const s = (v === undefined || v === null) ? '' : String(v)
        const t = s.trim()
        if (!t) return
        if (!arr.includes(t)) arr.push(t)
      }

      const out = []
      if (isEnglish) {
        // 优先用英文站名；如果文件名是中文/混合，则再尝试中文字段
        uniqPush(out, st.en)
        uniqPush(out, st.name)
        uniqPush(out, st.cn)
        uniqPush(out, st.zh)
        // 兜底
        uniqPush(out, st.name || st.en)
        return out
      }

      // 中文系列：优先中文字段（用于 zhcn/zhtw 目录）
      if (d.startsWith('cmn') || d === 'cmn' || d.includes('zh') || d === 'zhcn' || d === 'zhtw') {
        uniqPush(out, st.name)
        uniqPush(out, st.zh)
        uniqPush(out, st.cn)
        uniqPush(out, st.en)
        return out
      }

      // 其它方言/语种：尽量兼容混合命名
      uniqPush(out, st.name)
      uniqPush(out, st.en)
      uniqPush(out, st.zh)
      uniqPush(out, st.cn)
      return out
    }

    const resolveCache = resolvePlaceholderItem.__dynamicCache || new Map()
    resolvePlaceholderItem.__dynamicCache = resolveCache

    const tryResolveDynamicFromDir = async (targetIdx, roleKey) => {
      if (targetIdx < 0 || targetIdx >= stations.length) return null
      const st = stations[targetIdx]
      const stationNameCandidates = getStationNameCandidatesByTargetDialect(st)
      if (!stationNameCandidates || !stationNameCandidates.length) return null
      const doorSide = (item && typeof item === 'object' && (item.doorSide || item.door))
        ? (item.doorSide || item.door)
        : (st && (st.door || st.doorSide)) ? (st.door || st.doorSide) : ''
      const lineFilePath = getLineDirOrFilePath()
      const hasLocalResolver = typeof window !== 'undefined' && typeof window?.electronAPI?.lines?.findAudioByStationName === 'function' && !!lineFilePath
      const runtimeLineName = cleanLineName(state?.appData?.meta?.lineName || '')
      const cloudAudioAvailable = !!(state?.appData?.meta?.cloudAudioAvailable || Number(state?.appData?.meta?.cloudAudioCount || 0) > 0)
      const hasCloudResolver = !!runtimeLineName && cloudAudioAvailable
      const cloudMode = __getDynamicAudioCloudMode()
      const allowLocalResolver = hasLocalResolver && cloudMode !== 'cloud-only'
      const allowCloudResolver = hasCloudResolver && cloudMode !== 'local-only'
      if (!allowLocalResolver && !allowCloudResolver) return null

      const localIpc = allowLocalResolver ? window?.electronAPI?.lines?.findAudioByStationName : null
      const peerStationNames = collectPeerStationNamesForAudioMatch(stations)

      const dynDebug = isDynamicAudioDebugEnabled()
      if (dynDebug) {
        audioDiagLog('warn', '[useStationAudio][dynamic-placeholder][try]', {
          roleKey,
          targetIdx,
          dialectKey,
          languageKey: langKey,
          candidates: stationNameCandidates
        })
      }

      const peerCacheSig = peerStationNames.join('\x1e')
      for (const stationNameForLang of stationNameCandidates) {
        const resolverScope = allowLocalResolver ? `local:${lineFilePath}` : `cloud:${runtimeLineName}`
        const cacheKey = `${resolverScope}::${roleKey}::${langKey}::${dialectKey}::${normalizeName(stationNameForLang)}::${peerCacheSig}`
        if (resolveCache.has(cacheKey)) {
          const cached = resolveCache.get(cacheKey)
          if (dynDebug) {
            audioDiagLog('warn', '[useStationAudio][dynamic-placeholder][cache-hit]', {
              roleKey,
              dialectKey,
              languageKey: langKey,
              stationNameForLang,
              cachedPath: cached?.path || null
            })
          }
          // 如果运行过程中曾缓存过失败（null），则跳过该候选继续尝试
          if (!cached) continue
          return cached
        }

        try {
          let resolvedPath = ''
          const cloudFirst = cloudMode === 'cloud-first' || cloudMode === 'cloud-only'
          const tryCloudResolve = async () => {
            if (!allowCloudResolver) return ''
            if (dynDebug) {
              audioDiagLog('warn', '[useStationAudio][dynamic-placeholder][cloud-call]', {
                roleKey,
                dialectKey,
                languageKey: langKey,
                stationNameForLang,
                runtimeLineName
              })
            }
            const rel = await __findCloudAudioByStationName(runtimeLineName, stationNameForLang, {
              role: roleKey,
              doorSide,
              languageKey: langKey,
              dialectKey,
              peerStationNames
            })
            return (typeof rel === 'string' && rel) ? rel : ''
          }
          const tryLocalResolve = async () => {
            if (!allowLocalResolver || typeof localIpc !== 'function') return ''
            if (dynDebug) {
              audioDiagLog('warn', '[useStationAudio][dynamic-placeholder][ipc-call]', {
                roleKey,
                dialectKey,
                languageKey: langKey,
                stationNameForLang
              })
            }
            const res = await localIpc(lineFilePath, stationNameForLang, { role: roleKey, doorSide, languageKey: langKey, dialectKey, peerStationNames })
            return (res?.ok && typeof res?.relativePath === 'string' && res.relativePath) ? res.relativePath : ''
          }
          if (cloudFirst) {
            resolvedPath = await tryCloudResolve()
            if (!resolvedPath) resolvedPath = await tryLocalResolve()
          } else {
            resolvedPath = await tryLocalResolve()
            if (!resolvedPath) resolvedPath = await tryCloudResolve()
          }
          const resolved = resolvedPath ? { ...item, path: resolvedPath, name: item.name || stationNameForLang, role: roleKey } : null
            if (resolved) {
              // 只缓存“正结果”：避免 mpl 解包/目录扫描的时序竞争把“暂时没找到”缓存成 null，
              // 后续动态解析就会永远跳过，导致只剩少数站点正常。
              resolveCache.set(cacheKey, resolved)
              if (dynDebug) {
                audioDiagLog('warn', '[useStationAudio][dynamic-placeholder][resolved]', {
                  roleKey,
                  dialectKey,
                  languageKey: langKey,
                  stationNameForLang,
                  relativePath: resolvedPath
                })
              }
              return resolved
            }
          // 当前候选没命中，继续尝试下一个候选
        } catch (e) {
          // 不缓存失败：让后续站点/后续调用有机会在资源就绪后重新尝试
          // 当前候选失败，继续尝试下一个候选
        }
      }

      if (isDynamicAudioDebugEnabled()) {
        audioDiagLog('warn', '[useStationAudio][dynamic-placeholder][not-found]', {
          roleKey,
          dialectKey,
          languageKey: langKey,
          targetIdx,
          candidates: stationNameCandidates
        })
      }
      return null
    }

    const resolveWithIdx = (targetIdx, opts = {}) => {
      if (targetIdx < 0 || targetIdx >= stations.length) return null
      const stationName = stations[targetIdx]?.name || ''
      const fromStation = resolveFromStations({ stations, dir, role: opts.roleKey, preferIdx: targetIdx, allowNameMatch: opts.allowNameMatch, stationName })
      if (fromStation?.item) return { ...item, path: fromStation.item.path, name: item.name || fromStation.item.name, role }
      const fromCommon = resolveFromCommon(opts.commonRoleKey || role, dir, opts.useNameForCommon ? stationName : undefined)
      if (fromCommon) return { ...item, path: fromCommon.path, name: item.name || fromCommon.name, role }
      return null
    }

    if (role === 'start' || role === 'terminal') {
      const startIdx = (typeof meta.startIdx === 'number' && meta.startIdx >= 0) ? meta.startIdx : 0
      const termIdx = (typeof meta.termIdx === 'number' && meta.termIdx >= 0) ? meta.termIdx : (stations.length - 1)
      const isReversed = meta?.dirType === 'down' || meta?.dirType === 'inner'
      // “start/terminal” 以运营方向为准：反向运行时两者对调
      const travelStartIdx = isReversed ? termIdx : startIdx
      const travelTerminalIdx = isReversed ? startIdx : termIdx
      const preferIdx = role === 'start' ? travelStartIdx : travelTerminalIdx
      const resolved = resolveWithIdx(preferIdx, { roleKey: role })
      if (resolved?.path) return resolved

      const fromOther = resolveFromStations({ stations, dir, role, allowNameMatch: false, stationName: null })
      if (fromOther?.item?.path) return { ...item, path: fromOther.item.path, name: item.name || fromOther.item.name, role }

      const fromCommon = resolveFromCommon(role, dir)
      if (fromCommon) return { ...item, path: fromCommon.path, name: item.name || fromCommon.name, role }

      const dynResolved = await tryResolveDynamicFromDir(preferIdx, role)
      return dynResolved || item
    }

    if (role === 'current') {
      const resolved = resolveWithIdx(currentIdx, { roleKey: role, allowNameMatch: true, useNameForCommon: true })
      if (resolved?.path) return resolved
      const dynResolved = await tryResolveDynamicFromDir(currentIdx, role)
      return dynResolved || item
    }

    if (role === 'door') {
      // 车门提示在“出站模式”按下一站开门侧播报；其余模式沿用当前站。
      const doorTargetIdx = ctx?.forArrive === false ? getNextStationIdx(currentIdx, appData) : currentIdx
      // door 角色绝不能按“站名模糊匹配”回退，否则会把车门占位符错误绑定到站名音频。
      // 这里只允许命中显式 role=door 的条目；找不到时交给后面的动态门侧匹配兜底。
      const resolved = resolveWithIdx(doorTargetIdx, { roleKey: role, allowNameMatch: false, useNameForCommon: false })
      if (resolved?.path) return resolved
      const dynResolved = await tryResolveDynamicFromDir(doorTargetIdx, role)
      return dynResolved || item
    }

    if (role === 'next') {
      const nextIdx = getNextStationIdx(currentIdx, appData)
      const resolved = resolveWithIdx(nextIdx, { roleKey: role, allowNameMatch: true, useNameForCommon: true })
      if (resolved?.path) return resolved
      const dynResolved = await tryResolveDynamicFromDir(nextIdx, role)
      return dynResolved || item
    }

    return item
  }

  // 解析音频相对路径为可播放 URL 与绝对路径
  const resolveAudioSource = async (lineFilePath, item) => {
    if (!item || !item.path) return null
    const rawPath = String(item.path || '').trim()
    if (!rawPath) return null

    if (/^(https?:|data:)/i.test(rawPath)) {
      return { url: rawPath, absolutePath: '', relativePath: rawPath }
    }

    const normalizePath = (p) => String(p || '').replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '')
    const normalizedPath = normalizePath(rawPath)

    const dialectKeyFromItem = (typeof item?.dialectKey === 'string' && item.dialectKey.trim())
      ? item.dialectKey.trim()
      : ''
    const fallbackDialectOrder = ['cmn', 'yue', 'wuu', 'nan', 'wzh', 'en', 'ja', 'ko']
    const resolveCandidates = []
    const pushCandidate = (p) => {
      const n = normalizePath(p)
      if (!n) return
      if (!resolveCandidates.includes(n)) resolveCandidates.push(n)
    }
    pushCandidate(rawPath)
    if (normalizedPath.startsWith('audio/')) {
      const tail = normalizedPath.slice('audio/'.length)
      if (dialectKeyFromItem) pushCandidate(`audio/${dialectKeyFromItem}/${tail}`)
      for (const dk of fallbackDialectOrder) pushCandidate(`audio/${dk}/${tail}`)
    }
    for (const rel of resolveCandidates) {
      const res = await window.electronAPI?.lines?.resolveAudioPath?.(lineFilePath, rel)
      if (res && res.ok) {
        // 确保包含中文/空格等字符时也能正确被浏览器当作 URL 解析
        const fallbackFilePath = (res.path || '').replace(/\\/g, '/')
        const url = res.playableUrl || ('file:///' + encodeURI(fallbackFilePath))
        const absolutePath = res.path || ''
        return { url, absolutePath, relativePath: rel }
      }
    }

    // 云控线路：优先按需流式获取单条音频，避免把 cloudAudioFiles 全量留在前端内存中
    const runtimeLineName = cleanLineName(state?.appData?.meta?.lineName || '')
    const cloudAudioAvailable = !!(state?.appData?.meta?.cloudAudioAvailable || Number(state?.appData?.meta?.cloudAudioCount || 0) > 0)
    if (runtimeLineName && cloudAudioAvailable) {
      for (const rel of resolveCandidates) {
        try {
          const streamUrl = await __fetchCloudAudioBlobUrl(runtimeLineName, rel)
          if (streamUrl) return { url: streamUrl, absolutePath: '', relativePath: rel }
        } catch (e) {}
      }
    }

    // 兼容旧数据：云控线路回退到内嵌 meta.cloudAudioFiles 的 data URL
    const cloudMap = state?.appData?.meta?.cloudAudioFiles
    if (cloudMap && typeof cloudMap === 'object') {
      const lowerIndex = new Map()
      const lowerKeys = []
      for (const [k, v] of Object.entries(cloudMap)) {
        if (typeof v !== 'string' || !v) continue
        const lowerKey = String(k || '').toLowerCase()
        lowerIndex.set(lowerKey, v)
        lowerKeys.push(lowerKey)
      }

      const pickCloud = (key) => {
        if (!key || typeof key !== 'string') return ''
        const direct = cloudMap[key]
        if (typeof direct === 'string' && direct) return direct
        return lowerIndex.get(key.toLowerCase()) || ''
      }

      const direct = pickCloud(normalizedPath) || pickCloud(rawPath)
      if (typeof direct === 'string' && direct) {
        return { url: direct, absolutePath: '', relativePath: rawPath }
      }

      const noAudioPrefix = normalizedPath.startsWith('audio/') ? normalizedPath.slice('audio/'.length) : normalizedPath
      const noMpPrefix = normalizedPath.startsWith('mp/') ? normalizedPath.slice('mp/'.length) : normalizedPath
      const candidateKeys = [
        noAudioPrefix,
        noMpPrefix,
        `audio/${noMpPrefix}`,
        `mp/${noAudioPrefix}`
      ]

      for (const k of candidateKeys) {
        const v = pickCloud(k)
        if (typeof v === 'string' && v) {
          return { url: v, absolutePath: '', relativePath: rawPath }
        }
      }

      const normalizedCandidates = candidateKeys
        .filter((k) => typeof k === 'string' && k)
        .map((k) => k.toLowerCase())
      for (const ck of normalizedCandidates) {
        const suffix = `/${ck}`
        const foundKey = lowerKeys.find((k) => k.endsWith(suffix))
        if (foundKey) {
          const foundValue = lowerIndex.get(foundKey)
          if (typeof foundValue === 'string' && foundValue) {
            return { url: foundValue, absolutePath: '', relativePath: rawPath }
          }
        }
      }

      const base = normalizedPath.split('/').pop() || ''
      if (base) {
        const baseLower = base.toLowerCase()
        const foundKey = Object.keys(cloudMap).find((k) => ((k.split('/').pop() || '').toLowerCase()) === baseLower)
        if (foundKey) {
          const foundValue = pickCloud(foundKey)
          if (typeof foundValue === 'string' && foundValue) {
            return { url: foundValue, absolutePath: '', relativePath: rawPath }
          }
        }
      }
    }

    return null
  }

  // 播放单条音频，结束/打断时清理引用
  const playAudioFile = async (sessionId, source) => {
    const rawUrl = typeof source === 'string' ? source : String(source?.url || '')
    const absolutePath = typeof source === 'object' ? String(source?.absolutePath || '') : ''
    const mimeTypeHint = typeof source === 'object' ? String(source?.mimeType || '') : ''
    if (!rawUrl || rawUrl === 'file:///') return
    if (sessionId !== playSessionId) return
    let playbackUrl = rawUrl
    if (absolutePath) {
      try {
        const localBlobUrl = await __fetchLocalAudioBlobUrl(absolutePath, mimeTypeHint)
        if (localBlobUrl) playbackUrl = localBlobUrl
      } catch (e) {}
    }
    if (sessionId !== playSessionId) return
    if (shouldUseNativeManagedWavPlayback({ absolutePath, rawUrl, mimeTypeHint })) {
      const audioDebug = isDynamicAudioDebugEnabled()
      const timeoutMs = 12000
      const urlDisplay = (() => {
        try {
          if (typeof rawUrl !== 'string' || !rawUrl) return ''
          const prefixes = ['local-audio://file/', 'local-audio-stream://file/', 'audio://file/', 'file:///']
          for (const prefix of prefixes) {
            if (rawUrl.startsWith(prefix)) {
              return decodeURIComponent(rawUrl.slice(prefix.length)).replace(/\//g, '\\')
            }
          }
        } catch (e) {}
        return rawUrl
      })()
      try {
        await playNativeManagedWav({ sessionId, rawUrl, absolutePath, urlDisplay, audioDebug, timeoutMs })
        if (sessionId !== playSessionId) stopCurrentPlayback()
        return
      } catch (err) {
        if (sessionId === playSessionId) {
          audioDiagLog('warn', '[useStationAudio][playAudioFile][native-fallback]', {
            sessionId,
            url: rawUrl,
            absolutePath,
            urlDisplay,
            error: String(err && err.message ? err.message : err)
          })
        }
      }
    }
    if (shouldUseDecodedBufferPlayback({ rawUrl, playbackUrl, absolutePath, mimeTypeHint })) {
      const audioDebug = isDynamicAudioDebugEnabled()
      const timeoutMs = 12000
      const urlDisplay = (() => {
        try {
          if (typeof rawUrl !== 'string' || !rawUrl) return ''
          const prefixes = ['local-audio://file/', 'local-audio-stream://file/', 'audio://file/', 'file:///']
          for (const prefix of prefixes) {
            if (rawUrl.startsWith(prefix)) {
              return decodeURIComponent(rawUrl.slice(prefix.length)).replace(/\//g, '\\')
            }
          }
        } catch (e) {}
        return rawUrl
      })()
      const result = await Promise.resolve()
        .then(() => playDecodedAudioBuffer({ sessionId, rawUrl, playbackUrl, absolutePath, urlDisplay, audioDebug, timeoutMs }))
        .then(() => ({ ok: true }))
        .catch((err) => ({ ok: false, err }))
      const isExpectedPlayInterrupt = (err) => {
        if (!err) return false
        const name = String(err?.name || '').trim()
        if (name === 'AbortError') return true
        const msg = String(err?.message || '').toLowerCase()
        return msg.includes('play() request was interrupted by a call to pause')
      }
      if (!result.ok && sessionId === playSessionId && !isExpectedPlayInterrupt(result.err)) {
        audioDiagLog('warn', '[useStationAudio] playAudioFile failed', result.err)
      }
      if (sessionId !== playSessionId) stopCurrentPlayback()
      return
    }
    const audio = new Audio(playbackUrl)
    if (sessionId !== playSessionId) {
      try {
        audio.pause()
        audio.src = ''
        if (typeof audio.load === 'function') audio.load()
      } catch (e) {}
      return
    }
    currentAudio = audio
    const audioDebug = isDynamicAudioDebugEnabled()
    // 站点播报一般不会超过十几秒；更短的超时能避免队列“看起来完全卡死”
    const timeoutMs = 12000
    const formatUrlForDebug = (u) => {
      try {
        if (typeof u !== 'string' || !u) return ''
        const p1 = 'local-audio://file/'
        const p2 = 'local-audio-stream://file/'
        const p3 = 'audio://file/'
        const p4 = 'file:///'
        if (u.startsWith(p1)) {
          const enc = u.slice(p1.length)
          return decodeURIComponent(enc).replace(/\//g, '\\')
        }
        if (u.startsWith(p2)) {
          const enc = u.slice(p2.length)
          return decodeURIComponent(enc).replace(/\//g, '\\')
        }
        if (u.startsWith(p3)) {
          const enc = u.slice(p3.length)
          return decodeURIComponent(enc).replace(/\//g, '\\')
        }
        if (u.startsWith(p4)) {
          const enc = u.slice(p4.length)
          return decodeURIComponent(enc).replace(/\//g, '\\')
        }
      } catch (e) {}
      return u
    }
    const urlDisplay = formatUrlForDebug(rawUrl)
    const result = await new Promise((resolve, reject) => {
      let done = false
      let timeoutId = null
      let stallIntervalId = null
      let lastProgressTime = 0
      let lastCurrentTime = -1
      let pausedWaiting = false
      const stallMs = 6000
      const cleanup = () => {
        if (timeoutId) clearTimeout(timeoutId)
        if (stallIntervalId) clearInterval(stallIntervalId)
        audio.onended = null
        audio.onpause = null
        audio.onerror = null
      }
      const clearTimers = () => {
        if (timeoutId) clearTimeout(timeoutId)
        if (stallIntervalId) clearInterval(stallIntervalId)
        timeoutId = null
        stallIntervalId = null
      }
      const finishResolve = () => {
        if (done) return
        done = true
        cleanup()
        if (currentAudio === audio) currentAudio = null
        resolve()
      }
      const finishReject = (err) => {
        if (done) return
        done = true
        cleanup()
        if (currentAudio === audio) currentAudio = null
        reject(err)
      }

      audioDiagLog('warn', '[useStationAudio][playAudioFile][start]', {
        sessionId,
        url: rawUrl,
        playbackUrl,
        urlDisplay,
        absolutePath,
        audioDebug
      })

      const armTimeoutAndStallDetection = () => {
        clearTimers()
        timeoutId = setTimeout(() => {
          audioDiagLog('warn', '[useStationAudio][playAudioFile][timeout]', { sessionId, url: rawUrl, playbackUrl, urlDisplay, timeoutMs })
          try {
            audio.pause()
            audio.currentTime = 0
          } catch (e) {}
          finishReject(new Error(`audio timeout after ${timeoutMs}ms`))
        }, timeoutMs)
      }
      armTimeoutAndStallDetection()

      audio.onended = () => finishResolve()
      audio.onerror = (err) => finishReject(err)
      audio.onpause = () => {
        // 如果是系统媒体面板触发的暂停：进入“等待恢复”，不要把这当作播放结束。
        if (sessionId === playSessionId && pausedByMedia) {
          pausedWaiting = true
          clearTimers()
          setPlaybackState('paused')
          audioDiagLog('warn', '[useStationAudio][playAudioFile][paused-by-media]', { sessionId, url: rawUrl, playbackUrl, urlDisplay })
          return
        }
        // 其它 pause（例如结束/被打断）仍按“结束”处理
        finishResolve()
      }

      const ensureResumeLoop = () => {
        // 当处于 pausedWaiting 时，轮询等待恢复/会话变化
        if (!pausedWaiting) return
        const tick = async () => {
          if (done) return
          if (sessionId !== playSessionId) return finishResolve()
          if (!pausedByMedia) {
            pausedWaiting = false
            armTimeoutAndStallDetection()
            try {
              await audio.play()
              if (sessionId === playSessionId && !hasMediaStartedForSession) {
                hasMediaStartedForSession = true
              }
              setPlaybackState('playing')
              audioDiagLog('warn', '[useStationAudio][playAudioFile][resumed]', { sessionId, url: rawUrl, playbackUrl, urlDisplay })
            } catch (e) {
              return finishReject(e)
            }
          }
          if (pausedWaiting) setTimeout(tick, 120)
        }
        setTimeout(tick, 120)
      }

      // 初始播放
      // play() 的 Promise resolve 表示已经开始播放；再把 playbackState 置为 playing，
      // 避免“提前置 playing 但实际未播放成功”导致 Windows 不显示媒体控制。
      audio.play().then(() => {
        if (sessionId === playSessionId && !hasMediaStartedForSession) {
          hasMediaStartedForSession = true
          setPlaybackState('playing')
        }
        audioDiagLog('warn', '[useStationAudio][playAudioFile][playing]', { sessionId, url: rawUrl, playbackUrl, urlDisplay, absolutePath, audioDebug })

        // 防御：有些 wav 可能既不触发 onended，也不触发 onerror（会导致队列卡住）。
        // 使用 currentTime 是否在前进做“卡死检测”。
        lastCurrentTime = Number.isFinite(audio.currentTime) ? audio.currentTime : -1
        lastProgressTime = Date.now()
        stallIntervalId = setInterval(() => {
          if (done) return
          if (pausedWaiting) return
          const ct = Number.isFinite(audio.currentTime) ? audio.currentTime : -1
          // 当 currentTime 没有前进，认为可能卡死；同时要求 readyState 有一定数据，避免刚加载阶段误判
          if (ct !== lastCurrentTime) {
            lastCurrentTime = ct
            lastProgressTime = Date.now()
            return
          }
          const rs = audio.readyState // 0..4
          const stalledFor = Date.now() - lastProgressTime
          if (rs >= 2 && stalledFor >= stallMs) {
            audioDiagLog('warn', '[useStationAudio][playAudioFile][stalled]', {
              sessionId,
              url: rawUrl,
              playbackUrl,
              urlDisplay,
              stallMs,
              currentTime: ct,
              readyState: rs
            })
            try {
              audio.pause()
              audio.currentTime = 0
            } catch (e) {}
            finishReject(new Error(`audio stalled: currentTime no progress for ${stallMs}ms`))
          }
        }, 500)
      }).catch((err) => finishReject(err))

      // 如果刚好在 play() 之后被系统暂停，也要进入等待恢复
      ensureResumeLoop()
    }).then(() => ({ ok: true })).catch((err) => ({ ok: false, err }))
    const isExpectedPlayInterrupt = (err) => {
      if (!err) return false
      const name = String(err?.name || '').trim()
      if (name === 'AbortError') return true
      const msg = String(err?.message || '').toLowerCase()
      return msg.includes('play() request was interrupted by a call to pause')
    }
    if (!result.ok && sessionId === playSessionId && !isExpectedPlayInterrupt(result.err)) {
      audioDiagLog('warn', '[useStationAudio] playAudioFile failed', result.err)
    }
    if (sessionId !== playSessionId) stopCurrentPlayback()
  }

  // 串行播放列表，检测会话变更立即打断
  const playList = async (sessionId, dir, list, ctx) => {
    const dynDebug = isDynamicAudioDebugEnabled()
    const stationIdxForLog = typeof ctx?.currentIdx === 'number' ? ctx.currentIdx : undefined
    const listKindForLog = ctx?.listKind || ctx?.__listKind || undefined
    const startedAt = Date.now()
    let playedCount = 0
    let skippedNoPlaceholder = 0
    let skippedNoSource = 0
    let skippedDuplicateResolved = 0
    let errorCount = 0
    let endedBy = 'completed' // or 'session-changed' | 'aborted-due-to-stop'
    let lastResolvedPlaybackKey = ''

    if (!list.length) {
      if (sessionId === playSessionId) {
        setPlaybackState('none')
      }
      if (dynDebug && sessionId === playSessionId) {
        audioDiagLog('warn', '[useStationAudio][playList][empty]', { sessionId, stationIdxForLog, dir, listKindForLog, listLength: list.length })
      }
      return
    }
    const lineFilePath = getLineDirOrFilePath()
    if (typeof window === 'undefined') return

    for (const raw of list) {
      if (sessionId !== playSessionId) {
        endedBy = 'session-changed'
        if (dynDebug) {
          audioDiagLog('warn', '[useStationAudio][playList][abort]', {
            sessionId,
            stationIdxForLog,
            dir,
            listLength: list.length,
            playedCount,
            skippedNoPlaceholder,
            skippedNoSource,
            errorCount,
            endedBy
          })
        }
        stopCurrentPlayback()
        return
      }
      if (typeof window !== 'undefined' && typeof window.__stopCommonAudio === 'function') {
        try { window.__stopCommonAudio() } catch (e) {}
      }
      const item = await resolvePlaceholderItem(raw, dir, ctx)
      if (!item || !item.path) {
        skippedNoPlaceholder++
        continue
      }
      try {
        const source = await resolveAudioSource(lineFilePath, item)
        if (!source || !source.url) {
          skippedNoSource++
          if (sessionId === playSessionId && dynDebug) {
            audioDiagLog('warn', '[useStationAudio][playList][skip][no-source]', { sessionId, stationIdxForLog, dir, itemPath: item.path })
          }
          continue
        }
        const resolvedPlaybackKey = String(source.absolutePath || source.relativePath || source.url || '').trim()
        if (resolvedPlaybackKey && resolvedPlaybackKey === lastResolvedPlaybackKey) {
          skippedDuplicateResolved++
          if (sessionId === playSessionId && dynDebug) {
            audioDiagLog('warn', '[useStationAudio][playList][skip][duplicate-resolved]', {
              sessionId,
              stationIdxForLog,
              dir,
              listKindForLog,
              role: item?.role || '',
              itemPath: item?.path || '',
              itemName: item?.name || '',
              relativePath: source.relativePath || '',
              absolutePath: source.absolutePath || '',
              playbackKey: resolvedPlaybackKey
            })
          }
          continue
        }
        lastResolvedPlaybackKey = resolvedPlaybackKey
        if (sessionId !== playSessionId) {
          endedBy = 'session-changed'
          stopCurrentPlayback()
          return
        }

        if (sessionId === playSessionId && dynDebug) {
          audioDiagLog('warn', '[useStationAudio][playList][resolved-item]', {
            sessionId,
            stationIdxForLog,
            dir,
            listKindForLog,
            role: item?.role || '',
            itemPath: item?.path || '',
            itemName: item?.name || '',
            relativePath: source.relativePath || '',
            absolutePath: source.absolutePath || '',
            url: source.url || ''
          })
        }

        try {
          if (
            typeof window !== 'undefined' &&
            window.__recordingAudioCaptureEnabled &&
            window.electronAPI?.recording?.addAudioEvent
          ) {
            const startAt = Number(window.__recordingAudioStartAt || 0)
            const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()
            const offsetSec = startAt > 0 ? Math.max(0, (now - startAt) / 1000) : 0
            void window.electronAPI.recording.addAudioEvent({
              offsetSec,
              absolutePath: source.absolutePath || '',
              relativePath: source.relativePath || item.path || ''
            })
          }
        } catch (e) {}

        await playAudioFile(sessionId, source)
        playedCount++
      } catch (e) {
        errorCount++
        if (sessionId === playSessionId) audioDiagLog('warn', '[useStationAudio] play error', { itemPath: item.path, error: String(e && e.message ? e.message : e) })
      }
    }
    // 当前会话的串行列表播放结束
    if (sessionId === playSessionId) {
      // 为了让系统媒体控制面板常驻显示：结束后置为 paused，而不是 none
      // none 在部分平台上会让媒体卡片立即消失。
      setPlaybackState('paused')
      if (dynDebug) {
        audioDiagLog('warn', '[useStationAudio][playList][done]', {
          sessionId,
          stationIdxForLog,
          dir,
          listLength: list.length,
          playedCount,
          skippedNoPlaceholder,
          skippedNoSource,
          skippedDuplicateResolved,
          errorCount,
          endedBy,
          durationMs: Date.now() - startedAt
        })
      }
    }
  }

  // 进站播放：筛选列表并串行播放，首末站追加欢迎/终到
  const playArrive = (idx) => {
    if (typeof window !== 'undefined' && window.__disableStationAudioDuringRecording) return
    const stations = state.appData?.stations
    if (!stations || idx < 0 || idx >= stations.length) return
    {
      const now = Date.now()
      if (lastTriggerMeta && lastTriggerMeta.type === 'arrive' && lastTriggerMeta.idx === idx && (now - lastTriggerMeta.at) < 350) {
        return
      }
      lastTriggerMeta = { type: 'arrive', idx, at: now }
    }
    const meta = state.appData?.meta || {}
    if (typeof window !== 'undefined') {
      if (typeof window.__stopCommonAudio === 'function') { try { window.__stopCommonAudio() } catch (e) {} }
      if (typeof window.__stopAnyAudioElements === 'function') { try { window.__stopAnyAudioElements() } catch (e) {} }
      if (window.__blockStationAudioUntil) window.__blockStationAudioUntil = 0
    }
    playSessionId++
    hasMediaStartedForSession = false
    pausedByMedia = false
    stopCurrentPlayback()
    const sessionId = playSessionId
    const station = stations[idx]
    const sa = station?.stationAudio
    if (!sa || typeof sa !== 'object') {
      setPlaybackState('none')
      clearActiveControllerIfSelf()
      return
    }
    if (!hasAnyPlayableAudioConfig(sa, meta)) {
      setPlaybackState('none')
      clearActiveControllerIfSelf()
      return
    }

    // 系统媒体控制面板：设置元数据并标记为正在播放
    lastStationPlayback = { type: 'arrive', idx }
    setActiveController({
      id: instanceId,
      playFromLast: async () => {
        if (!lastStationPlayback) return
        const cmd = lastStationPlayback
        if (cmd.type === 'arrive') return playArrive(cmd.idx)
        return playDepart(cmd.idx)
      },
      resumeFromMedia: resumeForMediaPanel,
      toggleFromMedia: toggleForMediaPanel,
      pauseFromMedia: pauseForMediaPanel,
      stopFromMedia: stopForMediaPanel
    })
    const lineNameDisplay = cleanLineName(state.appData?.meta?.lineName)
    const stationNameDisplay = station?.name ? String(station.name) : `#${idx}`
    setMediaMetadata({
      title: `${lineNameDisplay || 'Metro'} - ${stationNameDisplay}`,
      artist: 'Metro-PIDS',
      album: 'Station Audio (Arrive)'
    })
    setPlaybackState('none')

    const startIdx = typeof meta.startIdx === 'number' ? meta.startIdx : 0
    const termIdx = typeof meta.termIdx === 'number' ? meta.termIdx : stations.length - 1
    const serviceMode = meta.serviceMode || 'normal'
    const isShortTurn = typeof meta.startIdx === 'number' && typeof meta.termIdx === 'number' && (meta.termIdx - meta.startIdx + 1) < stations.length
    const dir = getDirKey(sa, meta)
    const bucket = dir === 'down' ? sa.down || {} : sa.up || {}

    const dialectOrderedList = buildDialectOrderedFilteredList({
      sa,
      dir,
      forArrive: true,
      serviceMode,
      isShortTurn,
      stations,
      meta,
      currentIdx: idx
    })
    if (dialectOrderedList.length) {
      ;(async () => { await playList(sessionId, dir, dialectOrderedList, { currentIdx: idx, stations, meta, appData: state.appData, listKind: 'dialectOrderedList', forArrive: true }) })()
      return
    }

    // 新版数据结构只有 bucket.list，旧版才有 welcome/arrive/end 分桶。
    // 统一用 collectBucketList 读取，再按 forArrive 标志筛选。
    const rawList = collectBucketList(bucket)

    // 如果站点音频为空，回退到通用音频（commonAudio）
    const effectiveList = rawList.length > 0 ? rawList : (() => {
      const common = state.appData?.meta?.commonAudio
      if (!common || typeof common !== 'object') return []
      const useSeparate = common.separateDirection !== false
      const commonBucket = useSeparate ? (dir === 'down' ? common.down || {} : common.up || {}) : (common.up || {})
      return collectBucketList(commonBucket)
    })()

    const dynDebug = isDynamicAudioDebugEnabled()
    if (!effectiveList.length) {
      if (dynDebug) {
        const stName = station?.name ? String(station.name) : `#${idx}`
        const ca = state.appData?.meta?.commonAudio
        const commonUpLen = Array.isArray(ca?.up?.list) ? ca.up.list.length : 0
        const commonDownLen = Array.isArray(ca?.down?.list) ? ca.down.list.length : 0
        const dialectTabs = normalizeDynamicDialectTabs(sa)
        const dialectLists = sa?.dialectLists && typeof sa.dialectLists === 'object' ? sa.dialectLists : {}
        const dialectKeysAll = Object.keys(dialectLists || {})
        const dialectKeysToSum = (dialectTabs && dialectTabs.length) ? dialectTabs : dialectKeysAll
        let dialectTotalUpLen = 0
        let dialectTotalDownLen = 0
        for (const dk of dialectKeysToSum) {
          const db = dialectLists[dk]
          dialectTotalUpLen += collectBucketList(db?.up || {}).length
          dialectTotalDownLen += collectBucketList(db?.down || {}).length
        }
        const payload = {
          sessionId,
          stationIdxForLog: idx,
          stationName: stName,
          dir,
          serviceMode,
          isShortTurn,
          stationUpLen: Array.isArray(sa?.up?.list) ? sa.up.list.length : 0,
          stationDownLen: Array.isArray(sa?.down?.list) ? sa.down.list.length : 0,
          commonUpLen,
          commonDownLen,
          dynamicDialect: sa?.dynamicDialect ? String(sa.dynamicDialect) : '',
          dialectTabs,
          dialectKeysAll,
          dialectTotalUpLen,
          dialectTotalDownLen
        }
        audioDiagLog('warn', '[useStationAudio][playArrive][emptyEffectiveList]', JSON.stringify(payload))
      }
    }

    const arriveList = effectiveList.length
      ? getFilteredList(effectiveList, serviceMode, isShortTurn, true, stations, meta, dir, idx, 'arriveList')
      : []
    const welcomeList = effectiveList.length
      ? getFilteredList(effectiveList, serviceMode, isShortTurn, null, stations, meta, dir, idx, 'welcomeList')
      : []
    const endList = effectiveList.length
      ? getFilteredList(effectiveList, serviceMode, isShortTurn, null, stations, meta, dir, idx, 'endList')
      : []
    ;(async () => {
      if (idx === startIdx && welcomeList.length) await playList(sessionId, dir, welcomeList, { currentIdx: idx, stations, meta, appData: state.appData, listKind: 'welcomeList', forArrive: true })
      await playList(sessionId, dir, arriveList, { currentIdx: idx, stations, meta, appData: state.appData, listKind: 'arriveList', forArrive: true })
      if (idx === termIdx && endList.length) await playList(sessionId, dir, endList, { currentIdx: idx, stations, meta, appData: state.appData, listKind: 'endList', forArrive: true })
    })()
  }

  // 出站播放：筛选列表并串行播放
  const playDepart = (idx) => {
    if (typeof window !== 'undefined' && window.__disableStationAudioDuringRecording) return
    const stations = state.appData?.stations
    if (!stations || idx < 0 || idx >= stations.length) return
    {
      const now = Date.now()
      if (lastTriggerMeta && lastTriggerMeta.type === 'depart' && lastTriggerMeta.idx === idx && (now - lastTriggerMeta.at) < 350) {
        return
      }
      lastTriggerMeta = { type: 'depart', idx, at: now }
    }
    const meta = state.appData?.meta || {}
    if (typeof window !== 'undefined') {
      if (typeof window.__stopCommonAudio === 'function') { try { window.__stopCommonAudio() } catch (e) {} }
      if (typeof window.__stopAnyAudioElements === 'function') { try { window.__stopAnyAudioElements() } catch (e) {} }
      if (window.__blockStationAudioUntil) window.__blockStationAudioUntil = 0
    }
    playSessionId++
    hasMediaStartedForSession = false
    pausedByMedia = false
    stopCurrentPlayback()
    const sessionId = playSessionId
    const station = stations[idx]
    const sa = station?.stationAudio
    if (!sa || typeof sa !== 'object') {
      setPlaybackState('none')
      clearActiveControllerIfSelf()
      return
    }
    if (!hasAnyPlayableAudioConfig(sa, meta)) {
      setPlaybackState('none')
      clearActiveControllerIfSelf()
      return
    }

    // 系统媒体控制面板：设置元数据并标记为正在播放
    lastStationPlayback = { type: 'depart', idx }
    setActiveController({
      id: instanceId,
      playFromLast: async () => {
        if (!lastStationPlayback) return
        const cmd = lastStationPlayback
        if (cmd.type === 'arrive') return playArrive(cmd.idx)
        return playDepart(cmd.idx)
      },
      resumeFromMedia: resumeForMediaPanel,
      toggleFromMedia: toggleForMediaPanel,
      pauseFromMedia: pauseForMediaPanel,
      stopFromMedia: stopForMediaPanel
    })
    const lineNameDisplay = cleanLineName(state.appData?.meta?.lineName)
    const stationNameDisplay = station?.name ? String(station.name) : `#${idx}`
    setMediaMetadata({
      title: `${lineNameDisplay || 'Metro'} - ${stationNameDisplay}`,
      artist: 'Metro-PIDS',
      album: 'Station Audio (Depart)'
    })
    setPlaybackState('none')

    const serviceMode = meta.serviceMode || 'normal'
    const isShortTurn = typeof meta.startIdx === 'number' && typeof meta.termIdx === 'number' && (meta.termIdx - meta.startIdx + 1) < stations.length
    const dir = getDirKey(sa, meta)
    const bucket = dir === 'down' ? sa.down || {} : sa.up || {}

    const dialectOrderedList = buildDialectOrderedFilteredList({
      sa,
      dir,
      forArrive: false,
      serviceMode,
      isShortTurn,
      stations,
      meta,
      currentIdx: idx
    })
    if (dialectOrderedList.length) {
      ;(async () => { await playList(sessionId, dir, dialectOrderedList, { currentIdx: idx, stations, meta, appData: state.appData, listKind: 'dialectOrderedList', forArrive: false }) })()
      return
    }

    // 新版数据结构只有 bucket.list，旧版才有 depart 分桶。
    // 统一用 collectBucketList 读取。
    const rawList = collectBucketList(bucket)

    // 如果站点音频为空，回退到通用音频（commonAudio）
    const effectiveList = rawList.length > 0 ? rawList : (() => {
      const common = state.appData?.meta?.commonAudio
      if (!common || typeof common !== 'object') return []
      const useSeparate = common.separateDirection !== false
      const commonBucket = useSeparate ? (dir === 'down' ? common.down || {} : common.up || {}) : (common.up || {})
      return collectBucketList(commonBucket)
    })()

    const dynDebug = isDynamicAudioDebugEnabled()
    if (!effectiveList.length) {
      if (dynDebug) {
        const stName = station?.name ? String(station.name) : `#${idx}`
        const ca = state.appData?.meta?.commonAudio
        const commonUpLen = Array.isArray(ca?.up?.list) ? ca.up.list.length : 0
        const commonDownLen = Array.isArray(ca?.down?.list) ? ca.down.list.length : 0
        const dialectTabs = normalizeDynamicDialectTabs(sa)
        const dialectLists = sa?.dialectLists && typeof sa.dialectLists === 'object' ? sa.dialectLists : {}
        const dialectKeysAll = Object.keys(dialectLists || {})
        const dialectKeysToSum = (dialectTabs && dialectTabs.length) ? dialectTabs : dialectKeysAll
        let dialectTotalUpLen = 0
        let dialectTotalDownLen = 0
        for (const dk of dialectKeysToSum) {
          const db = dialectLists[dk]
          dialectTotalUpLen += collectBucketList(db?.up || {}).length
          dialectTotalDownLen += collectBucketList(db?.down || {}).length
        }
        const payload = {
          sessionId,
          stationIdxForLog: idx,
          stationName: stName,
          dir,
          serviceMode,
          isShortTurn,
          stationUpLen: Array.isArray(sa?.up?.list) ? sa.up.list.length : 0,
          stationDownLen: Array.isArray(sa?.down?.list) ? sa.down.list.length : 0,
          commonUpLen,
          commonDownLen,
          dynamicDialect: sa?.dynamicDialect ? String(sa.dynamicDialect) : '',
          dialectTabs,
          dialectKeysAll,
          dialectTotalUpLen,
          dialectTotalDownLen
        }
        audioDiagLog('warn', '[useStationAudio][playDepart][emptyEffectiveList]', JSON.stringify(payload))
      }
    }

    const departList = effectiveList.length
      ? getFilteredList(effectiveList, serviceMode, isShortTurn, false, stations, meta, dir, idx, 'departList')
      : []

    if (departList.length) {
      ;(async () => { await playList(sessionId, dir, departList, { currentIdx: idx, stations, meta, appData: state.appData, listKind: 'departList', forArrive: false }) })()
    }
  }

  return { playArrive, playDepart }
}
