<template>

    <div v-if="showDialog" style="position:fixed; inset:0; display:flex; align-items:center; justify-content:center; z-index:20000; background:transparent;" @click.self="showDialog = false">
      <div style="background: rgba(255,255,255,0.85); backdrop-filter: blur(24px) saturate(190%); -webkit-backdrop-filter: blur(24px) saturate(190%); border:1px solid rgba(255,255,255,0.3); border-radius:20px; width:90%; max-width:900px; height:80vh; max-height:700px; display:flex; flex-direction:column; box-shadow:0 20px 60px rgba(0,0,0,0.3), 0 0 0 0.5px rgba(255,255,255,0.5) inset; overflow:hidden;" @click.stop>
        <!-- Header -->
        <div style="display:flex; justify-content:space-between; align-items:center; padding:20px 24px; border-bottom:1px solid rgba(0,0,0,0.08); flex-shrink:0; background: rgba(255,255,255,0.40); backdrop-filter: blur(24px) saturate(190%); -webkit-backdrop-filter: blur(24px) saturate(190%);">
          <h2 style="margin:0; font-size:20px; font-weight:800; color:var(--text);">{{ $t('lineManager.folderAndLines') }}</h2>
          <button @click="showDialog = false" style="background:none; border:none; color:var(--muted); cursor:pointer; font-size:24px; padding:0; width:36px; height:36px; display:flex; align-items:center; justify-content:center; border-radius:8px; transition:background 0.2s;" @mouseover="$event.target.style.background='rgba(0,0,0,0.04)'" @mouseout="$event.target.style.background='none'">&times;</button>
        </div>

        <!-- Toolbar -->
        <div style="display:flex; gap:8px; padding:12px 20px; border-bottom:1px solid rgba(0,0,0,0.08); flex-shrink:0; background: rgba(255,255,255,0.35); backdrop-filter: blur(24px) saturate(190%); -webkit-backdrop-filter: blur(24px) saturate(190%);">
          <button @click="addFolder()" class="btn" style="background:#5F27CD; color:white; border:none; padding:8px 16px; border-radius:8px; font-size:13px; font-weight:700; box-shadow:0 4px 12px rgba(95,39,205,0.35);">
            <i class="fas fa-plus"></i> 添加文件夹
          </button>
          <button @click="openFolder()" class="btn" style="background:#747D8C; color:white; border:none; padding:8px 16px; border-radius:8px; font-size:13px; font-weight:700; box-shadow:0 4px 12px rgba(116,125,140,0.35);">
            <i class="fas fa-folder-open"></i> 打开文件夹
          </button>
        </div>

        <!-- Main Content (Two Column Layout) -->
        <div style="display:flex; flex:1; overflow:hidden; background: rgba(255,255,255,0.32); backdrop-filter: blur(24px) saturate(190%); -webkit-backdrop-filter: blur(24px) saturate(190%);">
          <!-- Left Sidebar: Folders (仅在 Electron 且有多文件夹时显示) -->
          <div v-if="window.electronAPI && window.electronAPI.lines && window.electronAPI.lines.folders && folders.length > 1" style="width:240px; border-right:1px solid rgba(0,0,0,0.08); overflow-y:auto; background: rgba(255,255,255,0.35); backdrop-filter: blur(24px) saturate(190%); -webkit-backdrop-filter: blur(24px) saturate(190%); flex-shrink:0;">
            <div style="padding:8px;">
              <div 
                v-for="folder in folders" 
                :key="folder.id"
                @click="selectFolder(folder.id)"
                :style="{
                  padding: '12px 16px',
                  marginBottom: '4px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  background: selectedFolderId === folder.id ? 'var(--accent)' : 'transparent',
                  color: selectedFolderId === folder.id ? 'white' : 'var(--text)',
                  fontWeight: selectedFolderId === folder.id ? 'bold' : 'normal',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }"
                @mouseover="$event.target.style.background = selectedFolderId === folder.id ? 'var(--accent)' : 'var(--card)'"
                @mouseout="$event.target.style.background = selectedFolderId === folder.id ? 'var(--accent)' : 'transparent'"
              >
                <i class="fas fa-folder" style="font-size:16px;"></i>
                <div style="flex:1; min-width:0;">
                  <div style="font-size:14px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">{{ folder.name }}</div>
                  <div style="font-size:11px; opacity:0.7; margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">{{ folder.path }}</div>
                </div>
                <div style="display:flex; gap:4px;">
                  <button 
                    @click.stop="renameFolder(folder.id, folder.name)"
                    style="background:none; border:none; color:inherit; cursor:pointer; padding:4px; border-radius:4px; opacity:0.7;"
                    @mouseover="$event.target.style.opacity='1'; $event.target.style.background='rgba(0,0,0,0.1)'"
                    @mouseout="$event.target.style.opacity='0.7'; $event.target.style.background='none'"
                    title="重命名"
                  >
                    <i class="fas fa-edit" style="font-size:12px;"></i>
                  </button>
                  <button 
                    v-if="!folder.isCurrent"
                    @click.stop="deleteFolder(folder.id, folder.name)"
                    style="background:none; border:none; color:inherit; cursor:pointer; padding:4px; border-radius:4px; opacity:0.7;"
                    @mouseover="$event.target.style.opacity='1'; $event.target.style.background='rgba(0,0,0,0.1)'"
                    @mouseout="$event.target.style.opacity='0.7'; $event.target.style.background='none'"
                    title="删除"
                  >
                    <i class="fas fa-trash" style="font-size:12px;"></i>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Right Content: Lines -->
          <div style="flex:1; overflow-y:auto; background: rgba(255,255,255,0.28); backdrop-filter: blur(24px) saturate(190%); -webkit-backdrop-filter: blur(24px) saturate(190%);">
            <div v-if="loading" style="display:flex; align-items:center; justify-content:center; height:100%; color:var(--muted);">
              <div style="text-align:center;">
                <i class="fas fa-spinner fa-spin" style="font-size:32px; margin-bottom:16px;"></i>
                <div>加载中...</div>
              </div>
            </div>
            <div v-else-if="currentLines.length === 0" style="display:flex; align-items:center; justify-content:center; height:100%; color:var(--muted);">
              <div style="text-align:center;">
                <i class="fas fa-folder-open" style="font-size:48px; margin-bottom:16px; opacity:0.5;"></i>
                <div style="font-size:16px;">该文件夹中没有线路文件</div>
              </div>
            </div>
            <div v-else style="flex:1; overflow-y:auto;">
              <!-- 列表头部 -->
              <div style="padding:12px 20px; background: rgba(255,255,255,0.40); backdrop-filter: blur(24px) saturate(190%); -webkit-backdrop-filter: blur(24px) saturate(190%); border-bottom:1px solid rgba(0,0,0,0.08); display:flex; align-items:center; font-size:13px; color:#666; font-weight:600;">
                <div style="width:200px;">线路名称</div>
                <div style="width:80px; text-align:center;">颜色</div>
                <div style="flex:1;">首末站</div>
              </div>
              
              <!-- 线路列表 -->
              <div style="padding:0;">
                <div 
                  v-for="(line, index) in currentLines" 
                  :key="index"
                  @click="selectLine(line)"
                  :style="{
                    padding: '12px 20px',
                    cursor: 'pointer',
                    background: 'transparent',
                    borderBottom: '1px solid rgba(0,0,0,0.04)',
                    transition: 'background 0.2s',
                    display: 'flex',
                    alignItems: 'center'
                  }"
                  @mouseover="$event.target.style.background='rgba(255,255,255,0.40)'"
                  @mouseout="$event.target.style.background='transparent'"
                >
                  <!-- 线路名称 -->
                  <div style="width:200px; min-width:200px; display:flex; align-items:center; gap:10px;">
                    <i class="fas fa-subway" style="font-size:16px; color:#999;"></i>
                    <div style="font-size:14px; font-weight:500; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" v-html="parseColorMarkup(line.name)"></div>
                  </div>
                  
                  <!-- 颜色 -->
                  <div style="width:80px; min-width:80px; display:flex; justify-content:center;">
                    <div :style="{width:'24px', height:'24px', borderRadius:'4px', background:line.themeColor || '#5F27CD', border:'1px solid #e0e0e0', flexShrink:0}"></div>
                  </div>
                  
                  <!-- 首末站 -->
                  <div style="flex:1; min-width:0; font-size:13px; color:#666; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                    <span v-if="line.firstStation && line.lastStation">{{ line.firstStation }} → {{ line.lastStation }}</span>
                    <span v-else style="color:#999;">-</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  
</template>
<script src="./FolderLineManager.js"></script>
