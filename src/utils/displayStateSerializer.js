import { toRaw } from 'vue'

export function cloneDisplayState(value) {
  if (value === undefined || value === null) return value
  const serialize = (source) => JSON.parse(JSON.stringify(source))
  try {
    return serialize(toRaw(value))
  } catch (err) {
    try {
      return serialize(value)
    } catch (nested) {
      console.warn('Failed to clone display state', nested)
      return null
    }
  }
}
