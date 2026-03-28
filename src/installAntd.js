import Antd from 'antdv-next'
import 'antdv-next/dist/reset.css'

/** 在多入口（主窗口 / 侧边栏 / 顶栏 / 线路管理）中复用同一套注册逻辑 */
export function installAntd(app) {
  app.use(Antd)
}
