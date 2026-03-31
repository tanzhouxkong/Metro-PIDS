import { calculateNextStationIndex } from './displayStationCalculator'

export const DYNAMIC_AUDIO_ROLE_KEYS = new Set(['start', 'current', 'next', 'terminal', 'end', 'door'])

export function normalizeDynamicAudioRoleKey(roleKey) {
  const rk = String(roleKey || '').trim()
  if (!rk) return ''
  return rk === 'end' ? 'terminal' : rk
}

export function isDynamicAudioRole(roleKey) {
  return DYNAMIC_AUDIO_ROLE_KEYS.has(String(roleKey || '').trim())
}

export function getDynamicTargetStationIndex(roleKey, runtimeIdx, stations, meta) {
  const list = Array.isArray(stations) ? stations : []
  if (!list.length) return -1
  const rk = normalizeDynamicAudioRoleKey(roleKey)
  const lineMeta = meta && typeof meta === 'object' ? meta : {}
  const startIdx = typeof lineMeta.startIdx === 'number' && lineMeta.startIdx >= 0 ? lineMeta.startIdx : 0
  const terminalIdx = typeof lineMeta.termIdx === 'number' && lineMeta.termIdx >= 0 ? lineMeta.termIdx : (list.length - 1)
  const isReversed = lineMeta.dirType === 'down' || lineMeta.dirType === 'inner'
  const travelStartIdx = isReversed ? terminalIdx : startIdx
  const travelTerminalIdx = isReversed ? startIdx : terminalIdx
  if (rk === 'start') return travelStartIdx
  if (rk === 'terminal') return travelTerminalIdx
  if (rk === 'current' || rk === 'door') return runtimeIdx
  if (rk === 'next') {
    return calculateNextStationIndex(runtimeIdx, { stations: list, meta: lineMeta })
  }
  return -1
}

export function getDynamicTargetStationByRole(roleKey, runtimeIdx, stations, meta) {
  const list = Array.isArray(stations) ? stations : []
  const idx = getDynamicTargetStationIndex(roleKey, runtimeIdx, list, meta || {})
  if (typeof idx !== 'number' || idx < 0 || idx >= list.length) return null
  return list[idx] || null
}

export function buildStationNameCandidatesByDialect(st, targetDialectKey) {
  if (!st || typeof st !== 'object') return []
  const d = String(targetDialectKey || '').toLowerCase()
  const out = []
  const pushUniq = (v) => {
    const s = (v === undefined || v === null) ? '' : String(v)
    const t = s.trim()
    if (!t) return
    if (!out.includes(t)) out.push(t)
  }

  const isEnglish = d === 'en' || d.startsWith('en')
  if (isEnglish) {
    pushUniq(st.en)
    pushUniq(st.name)
    pushUniq(st.cn)
    pushUniq(st.zh)
    return out
  }

  const isJa = d === 'ja' || d.startsWith('ja')
  const isKo = d === 'ko' || d.startsWith('ko')
  if (isJa) {
    pushUniq(st.ja)
    pushUniq(st.name)
    pushUniq(st.en)
    pushUniq(st.zh)
    pushUniq(st.cn)
    return out
  }
  if (isKo) {
    pushUniq(st.ko)
    pushUniq(st.name)
    pushUniq(st.en)
    pushUniq(st.zh)
    pushUniq(st.cn)
    return out
  }

  if (d.startsWith('cmn') || d === 'cmn' || d.includes('zh') || d.includes('zhcn') || d.includes('zhtw')) {
    pushUniq(st.name)
    pushUniq(st.zh)
    pushUniq(st.cn)
    pushUniq(st.en)
    return out
  }

  pushUniq(st.name)
  pushUniq(st.en)
  pushUniq(st.zh)
  pushUniq(st.cn)
  return out
}

export function getDoorSideForDynamicRole(roleKey, stationForRole) {
  if (normalizeDynamicAudioRoleKey(roleKey) !== 'door') return ''
  return String(stationForRole?.doorSide || stationForRole?.door || '').trim()
}

export async function checkDynamicPlaceholderAudioMatch({
  findAudioByStationName,
  lineFileOrDir,
  roleKey,
  stationForRole,
  stationNameCandidates,
  languageKey,
  dialectKey,
  peerStationNames,
  dynamicOkCache
}) {
  if (typeof findAudioByStationName !== 'function' || !lineFileOrDir) return false
  const candidates = Array.isArray(stationNameCandidates) ? stationNameCandidates : []
  if (!candidates.length) return false
  const role = normalizeDynamicAudioRoleKey(roleKey)
  if (!role) return false
  const doorSide = getDoorSideForDynamicRole(role, stationForRole)
  const peersJoined = Array.isArray(peerStationNames) ? peerStationNames.join('\x1e') : ''
  const cache = dynamicOkCache instanceof Map ? dynamicOkCache : new Map()

  for (const stationNameForRole of candidates) {
    const cacheKey = `${lineFileOrDir}::${role}::${stationNameForRole}::${doorSide}::${languageKey}::${dialectKey}::${peersJoined}`
    if (cache.has(cacheKey)) {
      if (cache.get(cacheKey)) return true
      continue
    }
    try {
      const res = await findAudioByStationName(lineFileOrDir, stationNameForRole, {
        role,
        doorSide,
        languageKey,
        dialectKey,
        peerStationNames
      })
      const ok = !!res?.ok && !!res?.relativePath
      cache.set(cacheKey, ok)
      if (ok) return true
    } catch (e) {
      cache.set(cacheKey, false)
    }
  }
  return false
}
