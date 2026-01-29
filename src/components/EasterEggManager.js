/**
 * 彩蛋配置管理组件
 * 独立于其他功能，用于从云端获取和应用彩蛋配置
 */

import { ref, computed, watch } from 'vue'
import { useCloudConfig, CLOUD_API_BASE } from '../composables/useCloudConfig.js'
import dialogService from '../utils/dialogService.js'

export default {
  name: 'EasterEggManager',
  props: {
    modelValue: {
      type: Boolean,
      default: false
    }
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    const showDialog = computed({
      get: () => props.modelValue,
      set: (val) => emit('update:modelValue', val)
    })

    const loading = ref(false)
    const config = ref({
      stations: [],
      messages: [],
      enabled: false
    })
    const cloudConfig = useCloudConfig(CLOUD_API_BASE)

    // 加载彩蛋配置
    async function loadEasterEggs() {
      loading.value = true
      try {
        const result = await cloudConfig.getEasterEggs()
        if (result.ok && result.data) {
          const data = result.data.config || result.data
          config.value = {
            stations: data.stations || [],
            messages: data.messages || [],
            enabled: data.enabled !== undefined ? data.enabled : true
          }
        } else {
          await dialogService.alert('获取彩蛋配置失败：' + (result.error || '未知错误'), '错误')
        }
      } catch (e) {
        console.error('加载彩蛋配置失败:', e)
        await dialogService.alert('加载彩蛋配置失败：' + e.message, '错误')
      } finally {
        loading.value = false
      }
    }

    // 保存彩蛋配置
    async function saveEasterEggs() {
      loading.value = true
      try {
        const result = await cloudConfig.updateEasterEggs(config.value)
        if (result.ok) {
          await dialogService.alert('彩蛋配置已成功保存到云端', '成功')
          showDialog.value = false
        } else {
          await dialogService.alert('保存彩蛋配置失败：' + (result.error || '未知错误'), '错误')
        }
      } catch (e) {
        console.error('保存彩蛋配置失败:', e)
        await dialogService.alert('保存彩蛋配置失败：' + e.message, '错误')
      } finally {
        loading.value = false
      }
    }

    // 添加站点
    function addStation() {
      const station = prompt('请输入站点名称：')
      if (station && station.trim()) {
        if (!config.value.stations) config.value.stations = []
        config.value.stations.push(station.trim())
      }
    }

    // 删除站点
    function removeStation(index) {
      if (confirm(`确定要删除站点"${config.value.stations[index]}"吗？`)) {
        config.value.stations.splice(index, 1)
      }
    }

    // 添加消息
    function addMessage() {
      const message = prompt('请输入消息内容：')
      if (message && message.trim()) {
        if (!config.value.messages) config.value.messages = []
        config.value.messages.push(message.trim())
      }
    }

    // 删除消息
    function removeMessage(index) {
      if (confirm(`确定要删除消息"${config.value.messages[index]}"吗？`)) {
        config.value.messages.splice(index, 1)
      }
    }

    // 当对话框显示时自动加载配置
    watch(showDialog, (val) => {
      if (val) {
        loadEasterEggs()
      }
    })

    return {
      showDialog,
      loading,
      config,
      loadEasterEggs,
      saveEasterEggs,
      addStation,
      removeStation,
      addMessage,
      removeMessage
    }
  },
  template: `
    <div v-if="showDialog" 
         style="position:fixed; inset:0; display:flex; align-items:center; justify-content:center; z-index:20000; background:rgba(0,0,0,0.5); backdrop-filter:blur(4px);" 
         @click.self="showDialog = false">
      <div style="background:var(--card); border-radius:12px; width:90%; max-width:600px; height:80vh; max-height:700px; display:flex; flex-direction:column; box-shadow:0 8px 32px rgba(0,0,0,0.3); overflow:hidden;" @click.stop>
        <!-- Header -->
        <div style="display:flex; justify-content:space-between; align-items:center; padding:16px 20px; border-bottom:1px solid var(--divider); flex-shrink:0;">
          <div>
            <h2 style="margin:0 0 4px; font-size:20px; font-weight:bold; color:var(--text);">🎁 彩蛋配置管理</h2>
            <div style="font-size:12px; color:var(--muted);">配置触发彩蛋的站点和显示的消息</div>
          </div>
          <button @click="showDialog = false" 
                  style="background:none; border:none; color:var(--muted); cursor:pointer; font-size:24px; padding:0; width:32px; height:32px; display:flex; align-items:center; justify-content:center; border-radius:6px; transition:background 0.2s;" 
                  @mouseover="$event.target.style.background='var(--bg)'" 
                  @mouseout="$event.target.style.background='none'">&times;</button>
        </div>

        <!-- Content -->
        <div style="flex:1; overflow-y:auto; padding:20px; background:var(--card);">
          <!-- Loading State -->
          <div v-if="loading" style="display:flex; align-items:center; justify-content:center; height:100%; color:var(--muted);">
            <div style="text-align:center;">
              <i class="fas fa-spinner fa-spin" style="font-size:32px; margin-bottom:16px;"></i>
              <div>加载中...</div>
            </div>
          </div>

          <!-- Config Form -->
          <div v-else style="display:flex; flex-direction:column; gap:20px;">
            <!-- Enable Switch -->
            <div style="display:flex; align-items:center; justify-content:space-between; padding:12px; background:var(--bg); border-radius:8px;">
              <div>
                <div style="font-size:14px; font-weight:600; color:var(--text); margin-bottom:4px;">启用彩蛋</div>
                <div style="font-size:12px; color:var(--muted);">当到达指定站点时触发彩蛋消息</div>
              </div>
              <label style="position:relative; display:inline-block; width:44px; height:24px; margin:0;">
                <input type="checkbox" v-model="config.enabled" style="opacity:0; width:0; height:0;">
                <span :style="{
                  position:'absolute', cursor:'pointer', top:0, left:0, right:0, bottom:0, 
                  backgroundColor: config.enabled ? '#FF9F43' : '#ccc', 
                  transition:'.4s', borderRadius:'24px'
                }"></span>
                <span :style="{
                  position:'absolute', content:'', height:'18px', width:'18px', left:'3px', bottom:'3px', 
                  backgroundColor:'white', transition:'.4s', borderRadius:'50%',
                  transform: config.enabled ? 'translateX(20px)' : 'translateX(0)'
                }"></span>
              </label>
            </div>

            <!-- Stations -->
            <div>
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <label style="font-size:14px; font-weight:600; color:var(--text);">触发站点</label>
                <button @click="addStation()" 
                        style="background:#FF9F43; color:white; border:none; padding:6px 12px; border-radius:6px; font-size:12px; font-weight:500; cursor:pointer; display:flex; align-items:center; gap:6px;">
                  <i class="fas fa-plus"></i> 添加站点
                </button>
              </div>
              <div v-if="!config.stations || config.stations.length === 0" 
                   style="padding:20px; text-align:center; color:var(--muted); background:var(--bg); border-radius:8px; border:2px dashed var(--divider);">
                <i class="fas fa-inbox" style="font-size:24px; margin-bottom:8px; opacity:0.5;"></i>
                <div style="font-size:13px;">暂无触发站点，点击"添加站点"添加</div>
              </div>
              <div v-else style="display:flex; flex-direction:column; gap:8px;">
                <div v-for="(station, index) in config.stations" 
                     :key="index"
                     style="display:flex; align-items:center; gap:8px; padding:10px; background:var(--bg); border-radius:8px; border:1px solid var(--divider);">
                  <div style="flex:1; font-size:14px; color:var(--text);">{{ station }}</div>
                  <button @click="removeStation(index)" 
                          style="background:#FF6B6B; color:white; border:none; padding:6px 10px; border-radius:6px; font-size:12px; cursor:pointer;">
                    <i class="fas fa-trash"></i>
                  </button>
                </div>
              </div>
            </div>

            <!-- Messages -->
            <div>
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <label style="font-size:14px; font-weight:600; color:var(--text);">彩蛋消息</label>
                <button @click="addMessage()" 
                        style="background:#FF9F43; color:white; border:none; padding:6px 12px; border-radius:6px; font-size:12px; font-weight:500; cursor:pointer; display:flex; align-items:center; gap:6px;">
                  <i class="fas fa-plus"></i> 添加消息
                </button>
              </div>
              <div v-if="!config.messages || config.messages.length === 0" 
                   style="padding:20px; text-align:center; color:var(--muted); background:var(--bg); border-radius:8px; border:2px dashed var(--divider);">
                <i class="fas fa-comment" style="font-size:24px; margin-bottom:8px; opacity:0.5;"></i>
                <div style="font-size:13px;">暂无消息，点击"添加消息"添加</div>
              </div>
              <div v-else style="display:flex; flex-direction:column; gap:8px;">
                <div v-for="(message, index) in config.messages" 
                     :key="index"
                     style="display:flex; align-items:flex-start; gap:8px; padding:10px; background:var(--bg); border-radius:8px; border:1px solid var(--divider);">
                  <div style="flex:1; font-size:14px; color:var(--text); line-height:1.5; word-break:break-word;">{{ message }}</div>
                  <button @click="removeMessage(index)" 
                          style="background:#FF6B6B; color:white; border:none; padding:6px 10px; border-radius:6px; font-size:12px; cursor:pointer; flex-shrink:0;">
                    <i class="fas fa-trash"></i>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div style="padding:12px 20px; border-top:1px solid var(--divider); flex-shrink:0; background:var(--bg); display:flex; justify-content:space-between; align-items:center; gap:12px;">
          <button @click="loadEasterEggs()" 
                  :disabled="loading"
                  style="background:var(--btn-gray-bg); color:var(--text); border:none; padding:8px 16px; border-radius:6px; font-size:13px; font-weight:500; cursor:pointer; display:flex; align-items:center; gap:6px;">
            <i class="fas fa-sync-alt" :class="{ 'fa-spin': loading }"></i> 重新加载
          </button>
          <div style="flex:1;"></div>
          <button @click="showDialog = false" 
                  style="background:var(--btn-gray-bg); color:var(--text); border:none; padding:8px 16px; border-radius:6px; font-size:13px; font-weight:500; cursor:pointer;">
            取消
          </button>
          <button @click="saveEasterEggs()" 
                  :disabled="loading"
                  style="background:#FF9F43; color:white; border:none; padding:8px 20px; border-radius:6px; font-size:13px; font-weight:600; cursor:pointer; display:flex; align-items:center; gap:6px;">
            <i class="fas fa-save"></i> 保存到云端
          </button>
        </div>
      </div>
    </div>
  `
}
