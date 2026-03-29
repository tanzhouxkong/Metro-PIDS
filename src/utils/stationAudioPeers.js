/**
 * 传给主进程 findAudioByStationName：用于「同线站名前缀」消歧（如 腊山 vs 腊山南）。
 * 收集各站可能出现在音频文件名中的字段。
 */
export function collectPeerStationNamesForAudioMatch(stations) {
  const out = []
  const push = (v) => {
    const t = String(v ?? '').trim()
    if (!t || out.includes(t)) return
    out.push(t)
  }
  if (!Array.isArray(stations)) return out
  for (const st of stations) {
    if (!st || typeof st !== 'object') continue
    push(st.name)
    push(st.en)
    push(st.zh)
    push(st.cn)
    push(st.ja)
    push(st.ko)
  }
  return out
}
