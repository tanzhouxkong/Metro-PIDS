/**
 * 节日插件 - 按日期匹配节日并弹出消息
 * 兼容原 holidays API
 */

import { addAction } from '../registry.js';
import { showNotification } from '../../utils/notificationService.js';

let getActiveHolidaysFn = null;

export function setConfigLoader(fn) {
  getActiveHolidaysFn = fn;
}

function computeActiveHolidays(config) {
  if (!config || typeof config !== 'object') return {};
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentDay = now.getDate();
  const active = {};
  for (const [key, holiday] of Object.entries(config)) {
    if (!holiday || holiday.enabled !== true) continue;
    let isActive = false;
    if (holiday.date) {
      if (holiday.date.month === currentMonth && holiday.date.day === currentDay) {
        isActive = true;
      }
    } else if (holiday.startDate && holiday.endDate) {
      const start = new Date(holiday.startDate);
      const end = new Date(holiday.endDate);
      if (now >= start && now <= end) isActive = true;
    } else if (holiday.duration && holiday.date) {
      const startMonth = holiday.date.month;
      const startDay = holiday.date.day;
      const startDate = new Date(now.getFullYear(), startMonth - 1, startDay);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + holiday.duration - 1);
      if (now >= startDate && now <= endDate) isActive = true;
    }
    if (isActive) active[key] = holiday;
  }
  return active;
}

addAction('dateCheck', async (context) => {
  if (!getActiveHolidaysFn) return;
  try {
    const result = await getActiveHolidaysFn();
    const data = result?.active ?? result?.data?.active ?? result?.config ?? result;
    const active = Array.isArray(data) ? {} : (typeof data === 'object' ? data : {});
    const entries = Object.entries(active);
    if (entries.length === 0) return;
    const [key, holiday] = entries[0];
    const msg = holiday?.message || holiday?.name || key;
    if (msg) {
      await showNotification('节日', String(msg), { tag: 'holiday-' + key, urgency: 'normal' });
    }
  } catch (e) {
    console.warn('[Holiday] 检查失败:', e);
  }
}, 10);

addAction('lineSwitch', async (context) => {
  if (!getActiveHolidaysFn) return;
  try {
    const result = await getActiveHolidaysFn();
    const data = result?.active ?? result?.data?.active ?? result?.config ?? result;
    const active = Array.isArray(data) ? {} : (typeof data === 'object' ? data : {});
    const entries = Object.entries(active);
    if (entries.length === 0) return;
    const [key, holiday] = entries[0];
    const msg = holiday?.message || holiday?.name || key;
    if (msg) {
      await showNotification('节日', String(msg), { tag: 'holiday-line-switch-' + key, urgency: 'normal' });
    }
  } catch (e) {
    console.warn('[Holiday] 线路切换时检查失败:', e);
  }
}, 5);
