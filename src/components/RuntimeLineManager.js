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
        let lineData = line.data
        const lineName = line?.name || line?.data?.meta?.lineName
        if (lineName) {
          try {
            const full = await cloudConfig.getRuntimeLine(lineName)
            if (full?.ok && full?.data) {
              lineData = full.data
            } else if (full && !full.ok && full.line) {
              lineData = full.line
            } else if (full?.line) {
              lineData = full.line
            }
          } catch (e) {
            console.warn('[RuntimeLineManager] 获取完整运控线路失败，回退使用列表数据:', e)
          }
        }

        if (props.onApplyLine) {
          await props.onApplyLine(lineData)
          showDialog.value = false
          await dialogService.alert(`已成功应用运控线路：${line.name}`, '成功')
        }
      } catch (e) {
        console.error('应用运控线路失败:', e)
        await dialogService.alert('应用运控线路失败：' + e.message, '错误')
      }
    }

    // 复制运控线路
    async function duplicateRuntimeLine(line) {
      try {
        const sourceName = String(line?.name || line?.data?.meta?.lineName || '').trim()
        if (!sourceName) {
          await dialogService.alert('无法识别要复制的线路名称', '错误')
          return
        }

        const inputName = await dialogService.prompt('请输入复制后的线路名称', `${sourceName}-副本`, '复制运控线路')
        if (inputName == null) return

        const targetName = String(inputName || '').trim()
        if (!targetName) {
          await dialogService.alert('线路名称不能为空', '提示')
          return
        }

        const existed = runtimeLines.value.some((it) => String(it?.name || '').trim() === targetName)
        if (existed) {
          const ok = await dialogService.confirm(`线路「${targetName}」已存在，是否覆盖？`, '确认覆盖')
          if (!ok) return
        }

        let sourceLineData = line.data
        try {
          const full = await cloudConfig.getRuntimeLine(sourceName)
          if (full?.ok && full?.data) {
            sourceLineData = full.data
          } else if (full?.line) {
            sourceLineData = full.line
          }
        } catch (e) {
          console.warn('[RuntimeLineManager] 复制时获取完整线路失败，回退使用列表数据:', e)
        }

        const cloned = JSON.parse(JSON.stringify(sourceLineData || {}))
        if (!cloned.meta || typeof cloned.meta !== 'object') cloned.meta = {}
        cloned.meta.lineName = targetName

        const save = await cloudConfig.updateRuntimeLine(targetName, cloned)
        if (!save?.ok) {
          throw new Error(save?.error || '复制失败')
        }

        await loadRuntimeLines()
        await dialogService.alert(`已复制运控线路：${sourceName} → ${targetName}`, '成功')
      } catch (e) {
        console.error('复制运控线路失败:', e)
        await dialogService.alert('复制运控线路失败：' + e.message, '错误')
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
      applyRuntimeLine,
      duplicateRuntimeLine
    }
  },
  template: `
    <div v-if="showDialog" 
         class="rtlm-overlay"
         @click.self="showDialog = false">
      <div class="rtlm-dialog" @click.stop>
        <!-- Header -->
        <div class="rtlm-header">
          <div>
            <h2 style="margin:0 0 4px; font-size:20px; font-weight:bold; color:var(--text);">运控线路管理</h2>
            <div style="font-size:12px; color:var(--muted);">从云端获取实时更新的运控线路</div>
          </div>
          <button @click="showDialog = false" 
                  class="rtlm-close">&times;</button>
        </div>

        <!-- Toolbar -->
        <div class="rtlm-toolbar">
          <button @click="loadRuntimeLines()" 
                  class="rtlm-btn rtlm-btn-primary">
            <i class="fas fa-sync-alt" :class="{ 'fa-spin': loading }"></i> 刷新列表
          </button>
          <div style="flex:1;"></div>
          <div style="font-size:12px; color:var(--muted); display:flex; align-items:center; gap:6px;">
            <i class="fas fa-cloud"></i>
            <span>API: 云端运控</span>
          </div>
        </div>

        <!-- Content -->
        <div class="rtlm-content">
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
            <div class="rtlm-list-header">
              <div style="width:40px;"></div>
              <div style="width:200px;">线路名称</div>
              <div style="width:80px; text-align:center;">站点数</div>
              <div style="flex:1;">操作</div>
            </div>

            <!-- Lines Items -->
            <div v-for="(line, index) in runtimeLines" 
                 :key="index"
                 class="rtlm-row">
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
                <button @click="duplicateRuntimeLine(line)" 
                        class="rtlm-btn rtlm-btn-secondary">
                  <i class="fas fa-copy"></i> 复制
                </button>
                <button @click="applyRuntimeLine(line)" 
                        class="rtlm-btn rtlm-btn-primary rtlm-btn-apply">
                  <i class="fas fa-check"></i> 应用
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="rtlm-footer">
          <div style="font-size:12px; color:var(--muted);">
            共 {{ runtimeLines.length }} 条运控线路
          </div>
          <button @click="showDialog = false" 
                  class="rtlm-btn rtlm-btn-gray">
            关闭
          </button>
        </div>
      </div>

      <style>
        /* 对齐“更新日志弹窗”风格：遮罩不压暗，毛玻璃在弹窗本体 */
        .rtlm-overlay{
          position: fixed;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 20000;
          background: transparent;
        }
        .rtlm-dialog{
          width: 92%;
          max-width: 900px;
          height: 85vh;
          max-height: 650px;
          display: flex;
          flex-direction: column;
          border-radius: 20px;
          overflow: hidden;
          box-shadow: 0 20px 60px rgba(0,0,0,0.3), 0 0 0 0.5px rgba(255,255,255,0.5) inset;
          background: rgba(255,255,255,0.85);
          backdrop-filter: blur(20px) saturate(180%);
          -webkit-backdrop-filter: blur(20px) saturate(180%);
          border: 1px solid rgba(255,255,255,0.3);
        }
        .rtlm-header{
          display:flex;
          justify-content:space-between;
          align-items:center;
          padding:16px 20px;
          border-bottom:1px solid rgba(0,0,0,0.08);
          background: rgba(255,255,255,0.40);
          flex-shrink:0;
        }
        .rtlm-close{
          background:none;
          border:none;
          color:var(--muted);
          cursor:pointer;
          font-size:24px;
          padding:0;
          width:32px;
          height:32px;
          display:flex;
          align-items:center;
          justify-content:center;
          border-radius:8px;
          transition: background .15s, color .15s;
        }
        .rtlm-close:hover{
          background: rgba(0,0,0,0.06);
          color: var(--text);
        }
        .rtlm-toolbar{
          display:flex;
          gap:8px;
          padding:12px 20px;
          border-bottom:1px solid rgba(0,0,0,0.08);
          flex-shrink:0;
          background: rgba(255,255,255,0.35);
        }
        .rtlm-content{
          flex:1;
          overflow-y:auto;
          background: rgba(255,255,255,0.30);
        }
        .rtlm-list-header{
          padding:12px 20px;
          background: rgba(255,255,255,0.55);
          border-bottom:1px solid rgba(0,0,0,0.08);
          display:flex;
          align-items:center;
          font-size:13px;
          color:#666;
          font-weight:600;
          position:sticky;
          top:0;
          z-index:10;
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
        }
        .rtlm-row{
          padding:12px 20px;
          border-bottom:1px solid rgba(0,0,0,0.06);
          display:flex;
          align-items:center;
          transition: background .15s;
        }
        .rtlm-row:hover{
          background: rgba(0,0,0,0.04);
        }
        .rtlm-footer{
          padding:12px 20px;
          border-top:1px solid rgba(0,0,0,0.08);
          flex-shrink:0;
          background: rgba(255,255,255,0.40);
          display:flex;
          justify-content:space-between;
          align-items:center;
        }
        .rtlm-btn{
          height:34px;
          padding:0 14px;
          border-radius:10px;
          border:none;
          font-size:13px;
          font-weight:800;
          cursor:pointer;
          display:inline-flex;
          align-items:center;
          justify-content:center;
          gap:8px;
          transition: transform .12s, filter .12s, background .12s;
          user-select:none;
          white-space:nowrap;
        }
        .rtlm-btn-primary{
          background:#1E90FF;
          color:#fff;
        }
        /* 修复：hover 变白不明显 -> hover 仍保持蓝底白字，仅轻微加深/提亮 */
        .rtlm-btn-primary:hover{
          filter: brightness(0.95);
          transform: translateY(-1px);
        }
        .rtlm-btn-gray{
          background: var(--btn-gray-bg, #f5f5f5);
          color: var(--text, #333);
        }
        .rtlm-btn-gray:hover{
          filter: brightness(0.97);
          transform: translateY(-1px);
        }
        .rtlm-btn-secondary{
          background: rgba(30, 144, 255, 0.14);
          color: #1E90FF;
          border: 1px solid rgba(30, 144, 255, 0.35);
        }
        .rtlm-btn-secondary:hover{
          background: rgba(30, 144, 255, 0.22);
          transform: translateY(-1px);
        }

        @media (prefers-color-scheme: dark) {
          .rtlm-dialog{
            background: rgba(30,30,30,0.85);
            border: 1px solid rgba(255,255,255,0.1);
          }
          .rtlm-header{ background: rgba(30,30,30,0.40); border-bottom-color: rgba(255,255,255,0.1); }
          .rtlm-toolbar{ background: rgba(30,30,30,0.30); border-bottom-color: rgba(255,255,255,0.1); }
          .rtlm-content{ background: rgba(30,30,30,0.25); }
          .rtlm-list-header{ background: rgba(30,30,30,0.45); border-bottom-color: rgba(255,255,255,0.1); color: rgba(255,255,255,0.72); }
          .rtlm-row{ border-bottom-color: rgba(255,255,255,0.06); }
          .rtlm-row:hover{ background: rgba(255,255,255,0.06); }
          .rtlm-footer{ background: rgba(30,30,30,0.35); border-top-color: rgba(255,255,255,0.1); }
          .rtlm-close:hover{ background: rgba(255,255,255,0.08); }
        }
      </style>
    </div>
  `
}
