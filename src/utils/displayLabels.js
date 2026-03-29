import { i18n } from '../locales/index.js'

/**
 * 解析显示端名称：优先 i18n（nameKey），否则退回存储的 name。
 */
export function resolveDisplayName(display) {
    if (!display || typeof display !== 'object') return ''
    const key = display.nameKey
    if (key && typeof key === 'string' && i18n.global.te(key)) {
        return String(i18n.global.t(key))
    }
    if (display.name) return String(display.name)
    if (display.id) return String(display.id)
    return ''
}

/**
 * 解析显示端描述：优先 descriptionKey，否则退回 description。
 */
export function resolveDisplayDescription(display) {
    if (!display || typeof display !== 'object') return ''
    const key = display.descriptionKey
    if (key && typeof key === 'string' && i18n.global.te(key)) {
        return String(i18n.global.t(key))
    }
    if (display.description) return String(display.description)
    return ''
}
