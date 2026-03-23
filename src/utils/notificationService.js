/**
 * 通知服务
 * 支持 Electron Notification API 和浏览器 Notification API
 */

/**
 * 显示系统通知
 * @param {string} title - 通知标题
 * @param {string} body - 通知内容
 * @param {Object} options - 通知选项
 * @returns {Promise<void>}
 */
export async function showNotification(title, body, options = {}) {
  // Electron 环境
  if (typeof window !== 'undefined' && window.electronAPI) {
    try {
      // 检查是否有通知 API
      if (window.electronAPI.showNotification) {
        await window.electronAPI.showNotification(title, body, options);
        return;
      }
    } catch (e) {
      console.warn('Electron 通知失败:', e);
    }
  }

  // 浏览器环境 - 使用 Web Notification API
  if (typeof window !== 'undefined' && 'Notification' in window) {
    try {
      // 检查通知权限
      if (Notification.permission === 'granted') {
        new Notification(title, {
          body: body,
          icon: options.icon || undefined,
          badge: options.badge || undefined,
          tag: options.tag || undefined,
          requireInteraction: options.requireInteraction || false,
          silent: options.silent || false
        });
      } else if (Notification.permission !== 'denied') {
        // 请求权限
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          new Notification(title, {
            body: body,
            icon: options.icon || undefined,
            badge: options.badge || undefined,
            tag: options.tag || undefined,
            requireInteraction: options.requireInteraction || false,
            silent: options.silent || false
          });
        }
      }
    } catch (e) {
      console.warn('浏览器通知失败:', e);
    }
  }
}

