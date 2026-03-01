/**
 * 节日插件 - 按日期匹配节日并弹窗显示（与启动公告同款弹窗）
 * 兼容原 holidays API，支持 dateStart/dateEnd（yyyyMMdd）
 */

import { addAction } from '../registry.js';
import dialogService from '../../utils/dialogService.js';

let getActiveHolidaysFn = null;

export function setConfigLoader(fn) {
  getActiveHolidaysFn = fn;
}

function getHolidayTitle(holiday, key) {
  return (holiday && (holiday.label || holiday.name)) || key || '节日';
}

function getHolidayMessage(holiday, key) {
  return (holiday && (holiday.content || holiday.message || holiday.name)) || key || '';
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
    const title = getHolidayTitle(holiday, key);
    const message = getHolidayMessage(holiday, key);
    if (message) {
      await dialogService.alert(message, title);
    }
  } catch (e) {
    console.warn('[Holiday] 检查失败:', e);
  }
}, 10);
