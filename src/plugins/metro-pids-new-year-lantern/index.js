/**
 * 新年灯笼插件 - 春节期间切换线路时弹出新年祝福
 */

import { addAction } from '../registry.js';
import { showNotification } from '../../utils/notificationService.js';

let getConfigFn = null;

export function setConfigLoader(fn) {
  getConfigFn = fn;
}

function isInDateRange(now, startDate, endDate) {
  if (!startDate || !endDate) return true;
  try {
    const start = new Date(startDate);
    const end = new Date(endDate);
    return now >= start && now <= end;
  } catch (e) {
    return true;
  }
}

async function tryShowLanternMessage(context) {
  if (!getConfigFn) return;
  try {
    const result = await getConfigFn();
    const cfg = result?.config ?? result?.data?.config ?? result;
    if (!cfg?.enabled || !Array.isArray(cfg.messages) || cfg.messages.length === 0) return;
    const now = new Date();
    if (!isInDateRange(now, cfg.startDate, cfg.endDate)) return;
    const msg = cfg.messages[Math.floor(Math.random() * cfg.messages.length)];
    if (msg) {
      await showNotification('新年灯笼', String(msg), { tag: 'new-year-lantern', urgency: 'normal' });
    }
  } catch (e) {
    console.warn('[NewYearLantern] 检查失败:', e);
  }
}

addAction('lineSwitch', async (context) => {
  await tryShowLanternMessage(context);
}, 15);

addAction('dateCheck', async (context) => {
  await tryShowLanternMessage(context);
}, 10);
