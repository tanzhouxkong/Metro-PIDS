import { createApp } from 'vue'
import FolderLineManagerWindow from './components/FolderLineManagerWindow.js'
import LineManagerTopbar from './components/LineManagerTopbar.js'
import LineManagerDialog from './components/LineManagerDialog.js'

const app = createApp(FolderLineManagerWindow)
// 全局注册组件以确保可用
app.component('LineManagerTopbar', LineManagerTopbar)
app.component('LineManagerDialog', LineManagerDialog)
app.mount('#app')

