/**
 * 运控线路管理组件
 * 独立于预设线路管理，用于从云端获取和应用运控线路
 */

import { ref, computed, watch, onMounted } from 'vue'
import { useCloudConfig, CLOUD_API_BASE } from '../composables/useCloudConfig.js'
import dialogService from '../utils/dialogService.js'

export default {
  name: 'RuntimeLineManager',
  props: {
    modelValue: {
      type: Boolean,
      default: false
    },
    pidsState: {
      type: Object,
      required: false,
      default: () => ({})
    },
    onApplyLine: {
      type: Function,
      required: true
    }
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    const showDialog = computed({
      get: () => props.modelValue,
      set: (val) => emit('update:modelValue', val)
    })

    const loading = ref(false)
    const runtimeLines = ref([])
    const cloudConfig = useCloudConfig(CLOUD_API_BASE)

    // 加载运控线路列表
    async function loadRuntimeLines() {
      loading.value = true
      runtimeLines.value = []
      try {
        const result = await cloudConfig.getRuntimeLines()
        if (result.ok && result.data) {
          const lines = result.data.lines || result.lines || []
          runtimeLines.value = lines.map(line => ({
            name: line.meta?.lineName || '未命名线路',
            data: line,
            stationCount: line.stations?.length || 0,
            themeColor: line.meta?.themeColor || '#5F27CD'
          }))
        } else {
          await dialogService.alert('获取运控线路失败：' + (result.error || '未知错误'), '错误')
        }
      } catch (e) {
        console.error('加载运控线路失败:', e)
        await dialogService.alert('加载运控线路失败：' + e.message, '错误')
      } finally {
        loading.value = false
      }
    }

    // 选择并应用运控线路
    async function applyRuntimeLine(line) {
      try {
        if (props.onApplyLine) {
          await props.onApplyLine(line.data)
          showDialog.value = false
          await dialogService.alert(`已成功应用运控线路：${line.name}`, '成功')
        }
      } catch (e) {
        console.error('应用运控线路失败:', e)
        await dialogService.alert('应用运控线路失败：' + e.message, '错误')
      }
    }

    // 当对话框显示时自动加载列表
    watch(showDialog, (val) => {
      if (val) {
        loadRuntimeLines()
      }
    })

    return {
      showDialog,
      loading,
      runtimeLines,
      loadRuntimeLines,
      applyRuntimeLine
    }
  },
  template: `
    <div v-if="showDialog" 
         style="position:fixed; inset:0; display:flex; align-items:center; justify-content:center; z-index:20000; background:rgba(0,0,0,0.5); backdrop-filter:blur(4px);" 
         @click.self="showDialog = false">
      <div style="background:var(--card); border-radius:12px; width:90%; max-width:700px; height:80vh; max-height:600px; display:flex; flex-direction:column; box-shadow:0 8px 32px rgba(0,0,0,0.3); overflow:hidden;" @click.stop>
        <!-- Header -->
        <div style="display:flex; justify-content:space-between; align-items:center; padding:16px 20px; border-bottom:1px solid var(--divider); flex-shrink:0;">
          <div>
            <h2 style="margin:0 0 4px; font-size:20px; font-weight:bold; color:var(--text);">运控线路管理</h2>
            <div style="font-size:12px; color:var(--muted);">从云端获取实时更新的运控线路</div>
          </div>
          <button @click="showDialog = false" 
                  style="background:none; border:none; color:var(--muted); cursor:pointer; font-size:24px; padding:0; width:32px; height:32px; display:flex; align-items:center; justify-content:center; border-radius:6px; transition:background 0.2s;" 
                  @mouseover="$event.target.style.background='var(--bg)'" 
                  @mouseout="$event.target.style.background='none'">&times;</button>
        </div>

        <!-- Toolbar -->
        <div style="display:flex; gap:8px; padding:12px 20px; border-bottom:1px solid var(--divider); flex-shrink:0; background:var(--bg);">
          <button @click="loadRuntimeLines()" 
                  class="btn" 
                  style="background:#1E90FF; color:white; border:none; padding:8px 16px; border-radius:6px; font-size:13px; font-weight:bold; display:flex; align-items:center; gap:6px;">
            <i class="fas fa-sync-alt" :class="{ 'fa-spin': loading }"></i> 刷新列表
          </button>
          <div style="flex:1;"></div>
          <div style="font-size:12px; color:var(--muted); display:flex; align-items:center; gap:6px;">
            <i class="fas fa-cloud"></i>
            <span>API: 云端运控</span>
          </div>
        </div>

        <!-- Content -->
        <div style="flex:1; overflow-y:auto; background:var(--card);">
          <!-- Loading State -->
          <div v-if="loading" style="display:flex; align-items:center; justify-content:center; height:100%; color:var(--muted);">
            <div style="text-align:center;">
              <i class="fas fa-spinner fa-spin" style="font-size:32px; margin-bottom:16px;"></i>
              <div>加载中...</div>
            </div>
          </div>

          <!-- Empty State -->
          <div v-else-if="runtimeLines.length === 0" style="display:flex; align-items:center; justify-content:center; height:100%; color:var(--muted);">
            <div style="text-align:center;">
              <i class="fas fa-cloud" style="font-size:48px; margin-bottom:16px; opacity:0.5;"></i>
              <div style="font-size:16px; margin-bottom:8px;">暂无运控线路</div>
              <div style="font-size:13px; color:var(--muted);">请先在云端管理后台上传运控线路</div>
            </div>
          </div>

          <!-- Lines List -->
          <div v-else style="padding:0;">
            <!-- List Header -->
            <div style="padding:12px 20px; background:#fafafa; border-bottom:1px solid #e0e0e0; display:flex; align-items:center; font-size:13px; color:#666; font-weight:500; position:sticky; top:0; z-index:10;">
              <div style="width:40px;"></div>
              <div style="width:200px;">线路名称</div>
              <div style="width:80px; text-align:center;">站点数</div>
              <div style="flex:1;">操作</div>
            </div>

            <!-- Lines Items -->
            <div v-for="(line, index) in runtimeLines" 
                 :key="index"
                 style="padding:12px 20px; border-bottom:1px solid #f0f0f0; display:flex; align-items:center; transition:background 0.2s;"
                 @mouseover="$event.target.style.background='#f5f5f5'"
                 @mouseout="$event.target.style.background='transparent'">
              <!-- Icon -->
              <div style="width:40px; min-width:40px; display:flex; align-items:center; justify-content:center;">
                <i class="fas fa-cloud" style="font-size:16px; color:#1E90FF;"></i>
              </div>

              <!-- Line Name -->
              <div style="width:200px; min-width:200px; display:flex; align-items:center; gap:10px;">
                <div :style="{width:'4px', height:'20px', borderRadius:'2px', background:line.themeColor || '#5F27CD', flexShrink:0}"></div>
                <div style="font-size:14px; font-weight:500; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">{{ line.name }}</div>
              </div>

              <!-- Station Count -->
              <div style="width:80px; min-width:80px; text-align:center; font-size:13px; color:var(--muted);">
                {{ line.stationCount }} 站
              </div>

              <!-- Actions -->
              <div style="flex:1; display:flex; justify-content:flex-end; gap:8px;">
                <button @click="applyRuntimeLine(line)" 
                        class="btn" 
                        style="background:#1E90FF; color:white; border:none; padding:6px 16px; border-radius:6px; font-size:13px; font-weight:bold; cursor:pointer;">
                  <i class="fas fa-check"></i> 应用
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div style="padding:12px 20px; border-top:1px solid var(--divider); flex-shrink:0; background:var(--bg); display:flex; justify-content:space-between; align-items:center;">
          <div style="font-size:12px; color:var(--muted);">
            共 {{ runtimeLines.length }} 条运控线路
          </div>
          <button @click="showDialog = false" 
                  class="btn" 
                  style="background:var(--btn-gray-bg); color:var(--text); border:none; padding:8px 16px; border-radius:6px; font-size:13px; font-weight:bold; cursor:pointer;">
            关闭
          </button>
        </div>
      </div>
    </div>
  `
}
