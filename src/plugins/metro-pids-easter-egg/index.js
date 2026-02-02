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
    if (!cfg?.enabled || !Array.isArray(cfg.stations) || cfg.stations.length === 0 ||
        !Array.isArray(cfg.messages) || cfg.messages.length === 0) return;
    const lineStationNames = getLineStationNames(stations);
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
