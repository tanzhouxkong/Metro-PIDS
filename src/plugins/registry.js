/**
 * Metro-PIDS 插件注册中心
 * 类 WordPress 的 Hook 系统：doAction / addAction
 */

const hooks = new Map();

/**
 * 注册动作回调（类似 WordPress add_action）
 * @param {string} hookName - 钩子名：lineSwitch | stationArrive | dateCheck
 * @param {Function} callback - 回调 (context) => Promise<void> | void
 * @param {number} priority - 优先级，默认 10
 */
export function addAction(hookName, callback, priority = 10) {
  if (!hooks.has(hookName)) hooks.set(hookName, []);
  const list = hooks.get(hookName);
  list.push({ callback, priority });
  list.sort((a, b) => a.priority - b.priority);
}

/**
 * 触发动作（类似 WordPress do_action）
 * @param {string} hookName - 钩子名
 * @param {Object} context - 上下文对象
 */
export async function doAction(hookName, context = {}) {
  const list = hooks.get(hookName) || [];
  for (const { callback } of list) {
    try {
      await Promise.resolve(callback(context));
    } catch (e) {
      console.warn(`[Plugins] Hook ${hookName} error:`, e);
    }
  }
}

/**
 * 内置插件列表（按 slug）
 */
export const BUILTIN_PLUGINS = ['metro-pids-easter-egg', 'metro-pids-new-year-lantern', 'metro-pids-holiday'];
