<template>

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
    </div>
  
</template>
<script src="./RuntimeLineManager.js"></script>
