/**
 * 车站进/出站、通用音频播放：
 * - 导航式打断：新的播放立即停止旧播放
 */
import { calculateNextStationIndex } from '../utils/displayStationCalculator'

export function useStationAudio(state) {
  if (!state) return { playArrive: () => {}, playDepart: () => {} }

  let playSessionId = 0
  let currentAudio = null

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
    return s.replace(/站$/u, '').replace(/[\s-_]/g, '').replace(/[()（）\[\]【】]/g, '').toLowerCase()
  }

  // 导航式打断：停止并清空当前播放
  const stopCurrentPlayback = () => {
    if (!currentAudio) return
    try {
      const a = currentAudio
      a.muted = true
      a.volume = 0
      a.onended = null
      a.onpause = null
      a.onerror = null
      a.pause()
      a.currentTime = 0
      // 彻底清空源，避免浏览器延迟触发 onpause/onended
      a.src = ''
      if (typeof a.load === 'function') {
        a.load()
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
    // 让事件循环有机会清理正在排队的播放任务
    await Promise.resolve()
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
    if (sa.separateDirection) return meta.dirType === 'down' ? 'down' : 'up'
    return 'up'
  }

  // 根据模式/短交路/进出站筛选可播放列表，并附加首末站角色条目
  const getFilteredList = (list, serviceMode, isShortTurn, forArrive, stations, meta, dir, currentIdx) => {
    if (!Array.isArray(list)) return []
    const filtered = list.filter((item) => {
      const hasArriveFlag = item.modes && item.modes.arrive === true
      const hasDepartFlag = item.modes && item.modes.depart === true
      if (forArrive === true && hasDepartFlag && !hasArriveFlag) return false
      if (forArrive === false && hasArriveFlag && !hasDepartFlag) return false

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
    })

    const extras = []
    if (stations && Array.isArray(stations) && typeof currentIdx === 'number') {
      const startIdx = typeof meta.startIdx === 'number' && meta.startIdx >= 0 ? meta.startIdx : 0
      const termIdx = typeof meta.termIdx === 'number' && meta.termIdx >= 0 ? meta.termIdx : stations.length - 1
      if (currentIdx === startIdx) extras.push(...pickStationItems(list, stations, startIdx, 'start'))
      if (currentIdx === termIdx) extras.push(...pickStationItems(list, stations, termIdx, 'terminal'))
    }

    const seen = new Set()
    return [...filtered, ...extras].filter((item) => {
      const key = item.path || item.name || JSON.stringify(item)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
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
  const resolvePlaceholderItem = (item, dir, ctx) => {
    if (!item || item.path) return item
    const role = item.role
    if (!role) return item

    const stations = ctx?.stations || state.appData?.stations || []
    const meta = ctx?.meta || state.appData?.meta || {}
    const appData = ctx?.appData || state.appData || { stations, meta }
    const currentIdx = typeof ctx?.currentIdx === 'number' ? ctx.currentIdx : -1

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
      const preferIdx = role === 'start'
        ? (typeof meta.startIdx === 'number' && meta.startIdx >= 0 ? meta.startIdx : 0)
        : (typeof meta.termIdx === 'number' && meta.termIdx >= 0 ? meta.termIdx : stations.length - 1)
      const resolved = resolveWithIdx(preferIdx, { roleKey: role })
      if (resolved && resolved.path) return resolved

      const fromOther = resolveFromStations({ stations, dir, role, allowNameMatch: false, stationName: null })
      if (fromOther?.item?.path) return { ...item, path: fromOther.item.path, name: item.name || fromOther.item.name, role }

      const fromCommon = resolveFromCommon(role, dir)
      if (fromCommon) return { ...item, path: fromCommon.path, name: item.name || fromCommon.name, role }
      return item
    }

    if (role === 'current') {
      const resolved = resolveWithIdx(currentIdx, { roleKey: role, allowNameMatch: true, useNameForCommon: true })
      return resolved || item
    }

    if (role === 'next') {
      const nextIdx = getNextStationIdx(currentIdx, appData)
      const resolved = resolveWithIdx(nextIdx, { roleKey: role, allowNameMatch: true, useNameForCommon: true })
      return resolved || item
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

    const res = await window.electronAPI?.lines?.resolveAudioPath?.(lineFilePath, item.path)
    if (res && res.ok) {
      const url = res.playableUrl || ('file:///' + (res.path || '').replace(/\\/g, '/'))
      const absolutePath = res.path || ''
      return { url, absolutePath, relativePath: rawPath }
    }

    // 云控线路回退：使用内嵌在 meta.cloudAudioFiles 的 data URL
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
  const playAudioFile = async (sessionId, url) => {
    if (!url || url === 'file:///') return
    const audio = new Audio(url)
    currentAudio = audio
    const result = await new Promise((resolve, reject) => {
      audio.onended = () => { if (currentAudio === audio) currentAudio = null; resolve() }
      audio.onpause = () => { if (currentAudio === audio) currentAudio = null; resolve() }
      audio.onerror = (err) => { if (currentAudio === audio) currentAudio = null; reject(err) }
      audio.play().catch(reject)
    }).then(() => ({ ok: true })).catch((err) => ({ ok: false, err }))
    if (!result.ok && sessionId === playSessionId) {
      console.warn('[useStationAudio] playAudioFile failed', result.err)
    }
    if (sessionId !== playSessionId) stopCurrentPlayback()
  }

  // 串行播放列表，检测会话变更立即打断
  const playList = async (sessionId, dir, list, ctx) => {
    if (!list.length) return
    const lineFilePath = getLineDirOrFilePath()
    if (typeof window === 'undefined') return

    for (const raw of list) {
      if (sessionId !== playSessionId) { stopCurrentPlayback(); return }
      if (typeof window !== 'undefined' && typeof window.__stopCommonAudio === 'function') {
        try { window.__stopCommonAudio() } catch (e) {}
      }
      const item = resolvePlaceholderItem(raw, dir, ctx)
      if (!item || !item.path) continue
      try {
        const source = await resolveAudioSource(lineFilePath, item)
        if (!source || !source.url) {
          if (sessionId === playSessionId) console.warn('[useStationAudio] unresolved audio source', item.path)
          continue
        }
        if (sessionId !== playSessionId) { stopCurrentPlayback(); return }

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

        await playAudioFile(sessionId, source.url)
      } catch (e) {
        if (sessionId === playSessionId) console.warn('[useStationAudio] play error', item.path, e)
      }
    }
  }

  // 进站播放：筛选列表并串行播放，首末站追加欢迎/终到
  const playArrive = (idx) => {
    if (typeof window !== 'undefined' && window.__disableStationAudioDuringRecording) return
    const stations = state.appData?.stations
    if (!stations || idx < 0 || idx >= stations.length) return
    if (typeof window !== 'undefined') {
      if (typeof window.__stopCommonAudio === 'function') { try { window.__stopCommonAudio() } catch (e) {} }
      if (typeof window.__stopAnyAudioElements === 'function') { try { window.__stopAnyAudioElements() } catch (e) {} }
      if (window.__blockStationAudioUntil) window.__blockStationAudioUntil = 0
    }
    playSessionId++
    stopCurrentPlayback()
    const sessionId = playSessionId
    const station = stations[idx]
    const sa = station?.stationAudio
    if (!sa || typeof sa !== 'object') return
    const meta = state.appData?.meta || {}
    const startIdx = typeof meta.startIdx === 'number' ? meta.startIdx : 0
    const termIdx = typeof meta.termIdx === 'number' ? meta.termIdx : stations.length - 1
    const serviceMode = meta.serviceMode || 'normal'
    const isShortTurn = typeof meta.startIdx === 'number' && typeof meta.termIdx === 'number' && (meta.termIdx - meta.startIdx + 1) < stations.length
    const dir = getDirKey(sa, meta)
    const bucket = dir === 'down' ? sa.down || {} : sa.up || {}

    if (Array.isArray(bucket.list)) {
      const filtered = getFilteredList(bucket.list, serviceMode, isShortTurn, true, stations, meta, dir, idx)
      ;(async () => { await playList(sessionId, dir, filtered, { currentIdx: idx, stations, meta, appData: state.appData }) })()
      return
    }

    const welcomeList = getFilteredList(bucket.welcome || [], serviceMode, isShortTurn, null, stations, meta, dir, idx)
    const arriveList = getFilteredList(bucket.arrive || [], serviceMode, isShortTurn, true, stations, meta, dir, idx)
    const endList = getFilteredList(bucket.end || [], serviceMode, isShortTurn, null, stations, meta, dir, idx)
    ;(async () => {
      if (idx === startIdx && welcomeList.length) await playList(sessionId, dir, welcomeList, { currentIdx: idx, stations, meta, appData: state.appData })
      await playList(sessionId, dir, arriveList, { currentIdx: idx, stations, meta, appData: state.appData })
      if (idx === termIdx && endList.length) await playList(sessionId, dir, endList, { currentIdx: idx, stations, meta, appData: state.appData })
    })()
  }

  // 出站播放：筛选列表并串行播放
  const playDepart = (idx) => {
    if (typeof window !== 'undefined' && window.__disableStationAudioDuringRecording) return
    const stations = state.appData?.stations
    if (!stations || idx < 0 || idx >= stations.length) return
    if (typeof window !== 'undefined') {
      if (typeof window.__stopCommonAudio === 'function') { try { window.__stopCommonAudio() } catch (e) {} }
      if (typeof window.__stopAnyAudioElements === 'function') { try { window.__stopAnyAudioElements() } catch (e) {} }
      if (window.__blockStationAudioUntil) window.__blockStationAudioUntil = 0
    }
    playSessionId++
    stopCurrentPlayback()
    const sessionId = playSessionId
    const station = stations[idx]
    const sa = station?.stationAudio
    if (!sa || typeof sa !== 'object') return
    const meta = state.appData?.meta || {}
    const serviceMode = meta.serviceMode || 'normal'
    const isShortTurn = typeof meta.startIdx === 'number' && typeof meta.termIdx === 'number' && (meta.termIdx - meta.startIdx + 1) < stations.length
    const dir = getDirKey(sa, meta)
    const bucket = dir === 'down' ? sa.down || {} : sa.up || {}

    if (Array.isArray(bucket.list)) {
      const filtered = getFilteredList(bucket.list, serviceMode, isShortTurn, false, stations, meta, dir, idx)
      ;(async () => { await playList(sessionId, dir, filtered, { currentIdx: idx, stations, meta, appData: state.appData }) })()
      return
    }

    const departList = getFilteredList(bucket.depart || [], serviceMode, isShortTurn, false, stations, meta, dir, idx)
    ;(async () => { await playList(sessionId, dir, departList, { currentIdx: idx, stations, meta, appData: state.appData }) })()
  }

  return { playArrive, playDepart }
}

