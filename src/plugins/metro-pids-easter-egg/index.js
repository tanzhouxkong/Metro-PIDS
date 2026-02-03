/**
 * 彩蛋插件 - 切换线路时匹配站点并弹出消息
 * 兼容原 easter-eggs API
 */

import { addAction } from '../registry.js';
import { showNotification } from '../../utils/notificationService.js';

let getConfigFn = null;

export function setConfigLoader(fn) {
  getConfigFn = fn;
}

function getLineStationNames(stations) {
  if (!Array.isArray(stations)) return new Set();
  return new Set(
    stations.map(s => (typeof s === 'string' ? s : s?.name || '').trim()).filter(Boolean)
  );
}

addAction('lineSwitch', async (context) => {
  const { lineName, stations } = context;
  if (!lineName || !stations?.length) return;
  if (!getConfigFn) return;
  try {
    const result = await getConfigFn();
    const cfg = result?.config ?? result?.data?.config ?? result;
    if (!cfg?.enabled) return;
    const lineStationNames = getLineStationNames(stations);

    // 新格式：items[] 每项 id、name、enabled、stations[]、messages[]；仅处理启用的条
    if (Array.isArray(cfg.items) && cfg.items.length > 0) {
      for (const item of cfg.items) {
        if (item.enabled === false) continue;
        const itemStations = Array.isArray(item.stations) ? item.stations : [];
        const itemMessages = Array.isArray(item.messages) ? item.messages : [];
        if (itemStations.length === 0 || itemMessages.length === 0) continue;
        const hasMatch = itemStations.some(s => lineStationNames.has(String(s).trim()));
        if (!hasMatch) continue;
        const msg = itemMessages[Math.floor(Math.random() * itemMessages.length)];
        if (msg) {
          await showNotification(item.name || '彩蛋', String(msg), { tag: 'easter-egg-line-switch', urgency: 'normal' });
        }
        return;
      }
      return;
    }

    // 旧格式：顶层 stations[]、messages[]
    if (!Array.isArray(cfg.stations) || cfg.stations.length === 0 ||
        !Array.isArray(cfg.messages) || cfg.messages.length === 0) return;
    const hasMatch = cfg.stations.some(s => lineStationNames.has(String(s).trim()));
    if (!hasMatch) return;
    const msg = cfg.messages[Math.floor(Math.random() * cfg.messages.length)];
    if (msg) {
      await showNotification('彩蛋', String(msg), { tag: 'easter-egg-line-switch', urgency: 'normal' });
    }
  } catch (e) {
    console.warn('[EasterEgg] 检查失败:', e);
  }
}, 10);
