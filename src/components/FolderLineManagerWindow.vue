<template>

    <div style="width:100vw; height:100vh; display:flex; flex-direction:column; background:transparent;">
      <LineManagerTopbar />
      <!-- 保存贯通线路引导横幅 -->
      <div v-if="isSavingThroughLine && pendingThroughLineInfo" style="padding:16px 20px; background:linear-gradient(135deg, #FF9F43 0%, #FFC371 100%); border-bottom:2px solid rgba(255,255,255,0.2); box-shadow:0 2px 8px rgba(255,159,67,0.3); display:flex; align-items:center; gap:16px; flex-shrink:0;">
        <div style="flex-shrink:0;">
          <i class="fas fa-exchange-alt" style="font-size:24px; color:#fff;"></i>
        </div>
        <div style="flex:1; min-width:0;">
          <div style="font-size:16px; font-weight:bold; color:#fff; margin-bottom:4px;">正在保存贯通线路</div>
          <div style="font-size:13px; color:rgba(255,255,255,0.95);">
            线路名称: <strong>{{ pendingThroughLineInfo.lineName }}</strong>
            <span v-if="pendingThroughLineInfo.segmentCount > 0" style="margin-left:12px;">
              线路段数: <strong>{{ pendingThroughLineInfo.segmentCount }}</strong>
            </span>
          </div>
          <div style="font-size:12px; color:rgba(255,255,255,0.85); margin-top:6px; display:flex; align-items:center; gap:8px;">
            <i class="fas fa-info-circle"></i>
            <span>请点击右下角的"保存贯通线路"按钮，选择文件夹并保存</span>
          </div>
        </div>
      </div>
      <!-- Main Content (Two Column Layout - QQ Style) -->
      <div style="display:flex; flex:1; overflow:hidden; background:transparent;">
        <!-- Left Sidebar: Folders (类似QQ群列表) -->
        <div v-if="hasFoldersAPI && folders.length > 0" style="width:200px; border-right:1px solid var(--lm-sidebar-border, rgba(0, 0, 0, 0.08)); overflow-y:auto; background:var(--lm-sidebar-bg, rgba(255, 255, 255, 0.6)); flex-shrink:0;">
          <div style="padding:8px 0; min-height:100%;" @contextmenu.prevent="showSidebarNewMenu($event)">
            <div 
              v-for="folder in folders" 
              :key="folder.id"
              @click="selectFolder(folder.id)"
              @contextmenu.prevent.stop="showContextMenu($event, folder)"
              :style="{
                padding: '10px 16px',
                cursor: 'pointer',
                background: selectedFolderId === folder.id ? 'var(--lm-sidebar-item-active, #e8e8e8)' : 'transparent',
                transition: 'background 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                borderLeft: selectedFolderId === folder.id ? '3px solid var(--accent, #12b7f5)' : '3px solid transparent',
                opacity: 1
              }"
              @mouseover="(e) => { e.target.style.background = selectedFolderId === folder.id ? 'var(--lm-sidebar-item-active, #e8e8e8)' : 'var(--lm-sidebar-item-hover, #f0f0f0)'; }"
              @mouseout="(e) => { e.target.style.background = selectedFolderId === folder.id ? 'var(--lm-sidebar-item-active, #e8e8e8)' : 'transparent'; }"
              :title="folder.name"
            >
              <i class="fas fa-folder" :style="{fontSize:'16px', color: selectedFolderId === folder.id ? 'var(--accent, #12b7f5)' : 'var(--muted, #666)'}"></i>
              <div style="flex:1; min-width:0;">
                <div style="font-size:14px; font-weight:500; color:var(--text, #333); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                  {{ folder.name }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Right Content: Lines (类似QQ文件列表) -->
        <div style="flex:1; background:var(--lm-content-bg, #fff); display:flex; flex-direction:column; overflow:hidden;">
          <!-- 显示当前选中的文件夹名称 -->
          <div v-if="hasFoldersAPI && folders.length > 0 && selectedFolderId" style="padding:12px 20px; background:var(--lm-header-bg, #f0f0f0); border-bottom:1px solid var(--lm-header-border, #e0e0e0); font-size:14px; font-weight:500; color:var(--muted, #666); flex-shrink:0;">
            <i class="fas fa-folder" style="margin-right:8px; color:var(--accent, #12b7f5);"></i>
            <span>{{ folders.find(f => f.id === selectedFolderId)?.name || '未选择文件夹' }}</span>
          </div>
          
          <div v-if="loading" style="display:flex; align-items:center; justify-content:center; flex:1; color:var(--muted, #999);">
            <div style="text-align:center;">
              <i class="fas fa-spinner fa-spin" style="font-size:32px; margin-bottom:16px;"></i>
              <div>加载中...</div>
            </div>
          </div>
          <div v-else style="flex:1; display:flex; flex-direction:column; overflow:hidden; min-height:0;">
            <!-- 列表头部 -->
            <div v-if="currentLines.length > 0" style="padding:12px 20px; background:var(--lm-list-header-bg, #fafafa); border-bottom:1px solid var(--lm-header-border, #e0e0e0); display:flex; align-items:center; font-size:13px; color:var(--muted, #666); font-weight:500; flex-shrink:0;">
              <div style="width:40px;"></div>
              <div style="width:200px;">线路名称</div>
              <div style="width:76px; text-align:center;">类型</div>
              <div style="width:80px; text-align:center;">颜色</div>
              <div style="flex:1;">首末站</div>
            </div>
            
            <!-- 线路列表（空白处右键 → 新建） -->
            <div style="flex:1; overflow-y:auto; padding:0; min-height:0;" @contextmenu.prevent="showLinesNewMenu($event)">
              <!-- 空状态 -->
              <div v-if="currentLines.length === 0" style="display:flex; align-items:center; justify-content:center; height:100%; color:var(--muted, #999);">
                <div style="text-align:center;">
                  <i class="fas fa-folder-open" style="font-size:48px; margin-bottom:16px; opacity:0.5;"></i>
                  <div style="font-size:16px;">该文件夹中没有线路文件</div>
                </div>
              </div>
              
              <!-- 线路列表项 -->
              <div 
                v-for="(line, index) in currentLines" 
                :key="index"
                @contextmenu.prevent.stop="showLineContextMenu($event, line)"
                @dblclick="applyLineOnDoubleClick(line)"
                :style="{
                  padding: '12px 20px',
                  cursor: 'pointer',
                  background: selectedLine && selectedLine.name === line.name ? 'var(--lm-list-item-active, #e8f4fd)' : 'transparent',
                  borderBottom: '1px solid var(--lm-header-border, #f0f0f0)',
                  transition: 'background 0.2s',
                  display: 'flex',
                  alignItems: 'center'
                }"
                @mouseover="(e) => { if (!selectedLine || selectedLine.name !== line.name) { e.currentTarget.style.background='var(--lm-list-item-hover, #f5f5f5)'; } }"
                @mouseout="(e) => { if (!selectedLine || selectedLine.name !== line.name) { e.currentTarget.style.background='transparent'; } }"
              >
                <!-- 复选框 -->
                <div style="width:40px; min-width:40px; display:flex; align-items:center; justify-content:center;" @click.stop="toggleLineSelection(line)">
                  <input 
                    type="checkbox" 
                    :checked="selectedLine && selectedLine.name === line.name"
                    @click.stop="toggleLineSelection(line)"
                    style="width:18px; height:18px; cursor:pointer;"
                  />
                </div>
                
                <!-- 线路名称 -->
                <div style="width:200px; min-width:200px; display:flex; align-items:center; gap:8px;" @click="toggleLineSelection(line)">
                  <i :class="line.isThroughLine ? 'fas fa-exchange-alt' : (line.isLoopLine ? 'fas fa-circle-notch' : 'fas fa-subway')" :style="{fontSize:'16px', color: line.isThroughLine ? '#FF9F43' : (line.isLoopLine ? '#00b894' : 'var(--muted, #999)')}"></i>
                  <div style="font-size:14px; font-weight:500; color:var(--text, #333); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:flex; align-items:center; gap:6px; flex:1; min-width:0;" v-html="parseColorMarkup(line.name)">
                  </div>
                  <span v-if="line.isThroughLine" style="background:#FF9F43; color:#fff; padding:2px 6px; border-radius:4px; font-size:10px; font-weight:bold; white-space:nowrap; flex-shrink:0;">{{ t('folderLineManager.through') }}</span>
                  <span v-else-if="line.isLoopLine" style="background:#00b894; color:#fff; padding:2px 6px; border-radius:4px; font-size:10px; font-weight:bold; white-space:nowrap; flex-shrink:0;">{{ t('folderLineManager.loop') }}</span>
                </div>
                
                <!-- 类型 -->
                <div style="width:76px; min-width:76px; display:flex; justify-content:center; align-items:center;" @click="toggleLineSelection(line)">
                  <span v-if="line.isThroughLine" style="font-size:12px; color:#FF9F43; font-weight:500;">{{ t('folderLineManager.through') }}</span>
                  <span v-else-if="line.isLoopLine" style="font-size:12px; color:#00b894; font-weight:500;">{{ t('folderLineManager.loop') }}</span>
                  <span v-else style="font-size:12px; color:var(--muted, #999);">{{ t('folderLineManager.single') }}</span>
                </div>
                
                <!-- 颜色 -->
                <div style="width:80px; min-width:80px; display:flex; justify-content:center;">
                  <div :style="{width:'24px', height:'24px', borderRadius:'4px', background:line.themeColor || '#5F27CD', border:'1px solid var(--lm-header-border, #e0e0e0)', flexShrink:0}"></div>
                </div>
                
                <!-- 首末站：环线显示 首⇄末，单线/贯通显示 首→末 -->
                <div style="flex:1; min-width:0; font-size:13px; color:var(--muted, #666); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" @click="toggleLineSelection(line)">
                  <span v-if="line.firstStation && line.lastStation">
                    {{ line.isLoopLine ? (line.firstStation + ' ⇄ ' + line.lastStation) : (line.firstStation + ' → ' + line.lastStation) }}
                  </span>
                  <span v-else style="color:var(--muted, #999);">-</span>
                </div>
              </div>
            </div>
            
            <!-- 底部操作栏 -->
            <div style="padding:12px 20px; background:var(--lm-bottom-bar-bg, rgba(250, 250, 250, 0.85)); border-top:1px solid var(--lm-bottom-bar-border, rgba(224, 224, 224, 0.5)); display:flex; justify-content:space-between; align-items:center; flex-shrink:0;">
              <!-- 左侧信息区域 -->
              <div style="display:flex; align-items:center; gap:16px; flex:1;">
                <!-- 选中线路信息 -->
                <div v-if="selectedLine" style="display:flex; align-items:center; gap:8px; color:var(--muted, #666); font-size:13px;">
                  <i class="fas fa-check-circle" style="color:var(--accent, #12b7f5); font-size:14px;"></i>
                  <span>已选择：<strong style="color:var(--text, #333);">{{ selectedLine.name }}</strong></span>
                </div>
                <div v-else style="color:var(--muted, #999); font-size:13px;">
                  未选择线路
                </div>
              </div>
              
              <!-- 右侧操作按钮 -->
              <div style="display:flex; align-items:center; gap:12px;">
                <!-- 保存贯通线路按钮（仅在保存模式下显示） -->
                <button 
                  v-if="isSavingThroughLine"
                  @click="handleSaveThroughLine()"
                  :style="{
                    padding: '10px 24px',
                    background: 'var(--btn-orange-bg, #FF9F43)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    boxShadow: '0 2px 8px rgba(255, 159, 67, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }"
                  @mouseover="(e) => { e.target.style.background='#FF8C2E'; e.target.style.boxShadow='0 4px 12px rgba(255, 159, 67, 0.4)'; }"
                  @mouseout="(e) => { e.target.style.background='var(--btn-orange-bg, #FF9F43)'; e.target.style.boxShadow='0 2px 8px rgba(255, 159, 67, 0.3)'; }"
                >
                  <i class="fas fa-save" style="font-size:14px;"></i>
                  保存贯通线路
                </button>
                
                <!-- 普通模式：使用当前线路按钮 -->
                <button 
                  v-else
                  @click="applySelectedLine()"
                  :disabled="!selectedLine"
                  :style="{
                    padding: '10px 24px',
                    background: selectedLine ? 'var(--btn-blue-bg, #1677ff)' : 'var(--btn-gray-bg, #d9d9d9)',
                    color: 'var(--btn-text, #fff)',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: selectedLine ? 'pointer' : 'not-allowed',
                    transition: 'all 0.2s',
                    boxShadow: selectedLine ? '0 2px 8px rgba(22, 119, 255, 0.2)' : 'none',
                    opacity: selectedLine ? 1 : 0.6
                  }"
                  @mouseover="(e) => { if (selectedLine) { e.target.style.background='#0958d9'; e.target.style.boxShadow='0 4px 12px rgba(22, 119, 255, 0.3)'; } }"
                  @mouseout="(e) => { if (selectedLine) { e.target.style.background='var(--btn-blue-bg, #1677ff)'; e.target.style.boxShadow='0 2px 8px rgba(22, 119, 255, 0.2)'; } }"
                >
                  <i class="fas fa-check" style="margin-right:6px;"></i>
                  使用当前线路
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- 独立的对话框组件 -->
      <LineManagerDialog />

      <!-- 运控线路管理器 -->
      <RuntimeLineManager 
        v-model="showRuntimeLineManager"
        :pids-state="{}"
        :on-apply-line="applyRuntimeLine"
      />
      
      <!-- 右键菜单 -->
      <div 
        v-if="contextMenu.visible"
      @click.stop
      @contextmenu.prevent
      :style="{
        position: 'fixed',
        left: contextMenu.x + 'px',
        top: contextMenu.y + 'px',
        background: 'var(--lm-menu-bg, #fff)',
        border: '1px solid var(--lm-menu-border, #e0e0e0)',
        borderRadius: '4px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        zIndex: 10000,
        minWidth: '140px',
        padding: '4px 0'
      }"
    >
      <div 
        @click="closeContextMenu(); addFolder()"
        style="padding: 8px 16px; cursor: pointer; font-size: 13px; color: var(--text, #333); display: flex; align-items: center; gap: 8px; transition: background 0.2s;"
        @mouseover="$event.target.style.background='var(--lm-menu-item-hover, #f0f0f0)'"
        @mouseout="$event.target.style.background='transparent'"
      >
        <i class="fas fa-folder-plus" style="font-size: 12px; color: var(--accent, #00b894);"></i>
        新建文件夹
      </div>
      <div 
        @click="closeContextMenu(); activeFolderId && createNewLine()"
        :style="{ padding: '8px 16px', cursor: activeFolderId ? 'pointer' : 'not-allowed', fontSize: '13px', color: activeFolderId ? 'var(--text, #333)' : 'var(--muted, #999)', display: 'flex', alignItems: 'center', gap: '8px', transition: 'background 0.2s', opacity: activeFolderId ? 1 : 0.6 }"
        @mouseover="activeFolderId && ($event.target.style.background='var(--lm-menu-item-hover, #f0f0f0)')"
        @mouseout="$event.target.style.background='transparent'"
        :title="activeFolderId ? '新建线路' : '请先选择文件夹'"
      >
        <i class="fas fa-plus-circle" style="font-size: 12px; color: var(--btn-blue-bg, #1677ff);"></i>
        新建线路
      </div>
      <div style="height: 1px; background: var(--lm-menu-border, #e0e0e0); margin: 4px 0;"></div>
      <div 
        @click="handleContextMenuRename(contextMenu.folderId)"
        style="padding: 8px 16px; cursor: pointer; font-size: 13px; color: var(--text, #333); display: flex; align-items: center; gap: 8px; transition: background 0.2s;"
        @mouseover="$event.target.style.background='var(--lm-menu-item-hover, #f0f0f0)'"
        @mouseout="$event.target.style.background='transparent'"
      >
        <i class="fas fa-edit" style="font-size: 12px; color: var(--muted, #666);"></i>
        重命名
      </div>
      <div 
        @click="openFolderInExplorer(contextMenu.folderId)"
        style="padding: 8px 16px; cursor: pointer; font-size: 13px; color: var(--text, #333); display: flex; align-items: center; gap: 8px; transition: background 0.2s;"
        @mouseover="$event.target.style.background='var(--lm-menu-item-hover, #f0f0f0)'"
        @mouseout="$event.target.style.background='transparent'"
      >
        <i class="fas fa-folder-open" style="font-size: 12px; color: var(--muted, #666);"></i>
        打开
      </div>
      <div 
        v-if="contextMenu.folderId"
        @click="handleContextMenuDelete(contextMenu.folderId)"
        style="padding: 8px 16px; cursor: pointer; font-size: 13px; color: var(--btn-red-bg, #ff4444); display: flex; align-items: center; gap: 8px; transition: background 0.2s;"
        @mouseover="$event.target.style.background='rgba(255, 68, 68, 0.1)'"
        @mouseout="$event.target.style.background='transparent'"
      >
        <i class="fas fa-trash" style="font-size: 12px; color: var(--btn-red-bg, #ff4444);"></i>
        删除
      </div>
      </div>
      
      <!-- 点击外部关闭右键菜单的遮罩 -->
      <div 
        v-if="contextMenu.visible"
      @click="closeContextMenu"
      style="position: fixed; inset: 0; z-index: 9999; background: transparent;"
      ></div>
      
      <!-- 侧边栏空白处右键：新建文件夹 -->
      <Teleport to="body">
      <div v-if="sidebarNewMenu.visible" @click.stop @contextmenu.prevent
        :style="{ position:'fixed', left:sidebarNewMenu.x+'px', top:sidebarNewMenu.y+'px', background:'var(--lm-menu-bg,#fff)', border:'1px solid var(--lm-menu-border,#e0e0e0)', borderRadius:'4px', boxShadow:'0 4px 12px rgba(0,0,0,0.15)', zIndex:10000, minWidth:'140px', padding:'4px 0' }">
        <div @click="closeSidebarNewMenu(); addFolder()"
          style="padding:8px 16px; cursor:pointer; font-size:13px; color:var(--text,#333); display:flex; align-items:center; gap:8px;"
          @mouseover="$event.currentTarget.style.background='var(--lm-menu-item-hover,#f0f0f0)'"
          @mouseout="$event.currentTarget.style.background='transparent'">
          <i class="fas fa-folder-plus" style="font-size:12px; color:var(--accent,#00b894);"></i>
          新建文件夹
        </div>
      </div>
      </Teleport>
      <div v-if="sidebarNewMenu.visible" @click="closeSidebarNewMenu()" style="position:fixed; inset:0; z-index:9998; background:transparent;"></div>
      
      <!-- 线路区空白处右键：新建文件夹、新建线路 -->
      <Teleport to="body">
      <div v-if="linesNewMenu.visible" @click.stop @contextmenu.prevent
        :style="{ position:'fixed', left:linesNewMenu.x+'px', top:linesNewMenu.y+'px', background:'var(--lm-menu-bg,#fff)', border:'1px solid var(--lm-menu-border,#e0e0e0)', borderRadius:'4px', boxShadow:'0 4px 12px rgba(0,0,0,0.15)', zIndex:10000, minWidth:'140px', padding:'4px 0' }">
        <div @click="closeLinesNewMenu(); addFolder()"
          style="padding:8px 16px; cursor:pointer; font-size:13px; color:var(--text,#333); display:flex; align-items:center; gap:8px;"
          @mouseover="$event.currentTarget.style.background='var(--lm-menu-item-hover,#f0f0f0)'"
          @mouseout="$event.currentTarget.style.background='transparent'">
          <i class="fas fa-folder-plus" style="font-size:12px; color:var(--accent,#00b894);"></i>
          新建文件夹
        </div>
        <div style="height:1px; background:var(--lm-menu-border,#e0e0e0); margin:4px 0;"></div>
        <div @click="closeLinesNewMenu(); activeFolderId && createNewLine()"
          :style="{ padding:'8px 16px', cursor: activeFolderId ? 'pointer' : 'not-allowed', fontSize:'13px', color: activeFolderId ? 'var(--text,#333)' : 'var(--muted,#999)', display:'flex', alignItems:'center', gap:'8px', opacity: activeFolderId ? 1 : 0.6 }"
          @mouseover="activeFolderId && ($event.currentTarget.style.background='var(--lm-menu-item-hover,#f0f0f0)')"
          @mouseout="$event.currentTarget.style.background='transparent'"
          :title="activeFolderId ? '新建线路' : '请先选择文件夹'">
          <i class="fas fa-plus-circle" style="font-size:12px; color:var(--btn-blue-bg,#1677ff);"></i>
          新建线路
        </div>
      </div>
      </Teleport>
      <div v-if="linesNewMenu.visible" @click="closeLinesNewMenu()" style="position:fixed; inset:0; z-index:9998; background:transparent;"></div>
      
      <!-- 线路右键菜单 - 使用 Teleport 传送到 body，允许溢出窗口 -->
      <Teleport to="body">
      <div 
        v-if="lineContextMenu.visible"
        data-line-context-menu
        @click.stop
        @contextmenu.prevent
        :style="{
          position: 'fixed',
          left: lineContextMenu.x + 'px',
          top: lineContextMenu.y + 'px',
          background: 'var(--lm-menu-bg, #fff)',
          border: '1px solid var(--lm-menu-border, #e0e0e0)',
          borderRadius: '4px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          zIndex: 9999,
          minWidth: '140px',
          padding: '4px 0'
        }"
      >
      <div 
        @click="closeLineContextMenu(); addFolder()"
        style="padding: 8px 16px; cursor: pointer; font-size: 13px; color: var(--text, #333); display: flex; align-items: center; gap: 8px; transition: background 0.2s;"
        @mouseover="$event.target.style.background='var(--lm-menu-item-hover, #f0f0f0)'"
        @mouseout="$event.target.style.background='transparent'"
      >
        <i class="fas fa-folder-plus" style="font-size: 12px; color: var(--accent, #00b894);"></i>
        新建文件夹
      </div>
      <div 
        @click="closeLineContextMenu(); activeFolderId && createNewLine()"
        :style="{ padding: '8px 16px', cursor: activeFolderId ? 'pointer' : 'not-allowed', fontSize: '13px', color: activeFolderId ? 'var(--text, #333)' : 'var(--muted, #999)', display: 'flex', alignItems: 'center', gap: '8px', transition: 'background 0.2s', opacity: activeFolderId ? 1 : 0.6 }"
        @mouseover="activeFolderId && ($event.target.style.background='var(--lm-menu-item-hover, #f0f0f0)')"
        @mouseout="$event.target.style.background='transparent'"
        :title="activeFolderId ? '新建线路' : '请先选择文件夹'"
      >
        <i class="fas fa-plus-circle" style="font-size: 12px; color: var(--btn-blue-bg, #1677ff);"></i>
        新建线路
      </div>
      <div style="height: 1px; background: var(--lm-menu-border, #e0e0e0); margin: 4px 0;"></div>
      <div 
        @click="openLine(lineContextMenu.line)"
        style="padding: 8px 16px; cursor: pointer; font-size: 13px; color: var(--text, #333); display: flex; align-items: center; gap: 8px; transition: background 0.2s;"
        @mouseover="$event.target.style.background='var(--lm-menu-item-hover, #f0f0f0)'"
        @mouseout="$event.target.style.background='transparent'"
      >
        <i class="fas fa-folder-open" style="font-size: 12px; color: var(--muted, #666);"></i>
        打开
      </div>
      <div 
        @click="renameLine(lineContextMenu.line)"
        style="padding: 8px 16px; cursor: pointer; font-size: 13px; color: var(--text, #333); display: flex; align-items: center; gap: 8px; transition: background 0.2s;"
        @mouseover="$event.target.style.background='var(--lm-menu-item-hover, #f0f0f0)'"
        @mouseout="$event.target.style.background='transparent'"
      >
        <i class="fas fa-edit" style="font-size: 12px; color: var(--muted, #666);"></i>
        重命名
      </div>
      <div style="height: 1px; background: var(--lm-menu-border, #e0e0e0); margin: 4px 0;"></div>
      <div 
        @click="copyLine(lineContextMenu.line)"
        style="padding: 8px 16px; cursor: pointer; font-size: 13px; color: var(--text, #333); display: flex; align-items: center; gap: 8px; transition: background 0.2s;"
        @mouseover="$event.target.style.background='var(--lm-menu-item-hover, #f0f0f0)'"
        @mouseout="$event.target.style.background='transparent'"
      >
        <i class="fas fa-copy" style="font-size: 12px; color: var(--muted, #666);"></i>
        复制
      </div>
      <div 
        @click="cutLine(lineContextMenu.line)"
        style="padding: 8px 16px; cursor: pointer; font-size: 13px; color: var(--text, #333); display: flex; align-items: center; gap: 8px; transition: background 0.2s;"
        @mouseover="$event.target.style.background='var(--lm-menu-item-hover, #f0f0f0)'"
        @mouseout="$event.target.style.background='transparent'"
      >
        <i class="fas fa-cut" style="font-size: 12px; color: var(--muted, #666);"></i>
        剪贴
      </div>
      <div 
        @click="pasteLine()"
        :style="{
          padding: '8px 16px',
          cursor: clipboard.type ? 'pointer' : 'not-allowed',
          fontSize: '13px',
          color: clipboard.type ? 'var(--text, #333)' : 'var(--muted, #999)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          transition: 'background 0.2s',
          opacity: clipboard.type ? 1 : 0.5
        }"
        @mouseover="clipboard.type && ($event.target.style.background='var(--lm-menu-item-hover, #f0f0f0)')"
        @mouseout="clipboard.type && ($event.target.style.background='transparent')"
      >
        <i class="fas fa-paste" :style="{fontSize: '12px', color: clipboard.type ? 'var(--muted, #666)' : 'var(--muted, #999)'}"></i>
        粘贴
      </div>
      <div style="height: 1px; background: var(--lm-menu-border, #e0e0e0); margin: 4px 0;"></div>
      <div 
        v-if="activeFolderId"
        @click="deleteLine(lineContextMenu.line)"
        style="padding: 8px 16px; cursor: pointer; font-size: 13px; color: var(--btn-red-bg, #ff4444); display: flex; align-items: center; gap: 8px; transition: background 0.2s;"
        @mouseover="$event.target.style.background='rgba(255, 68, 68, 0.1)'"
        @mouseout="$event.target.style.background='transparent'"
      >
        <i class="fas fa-trash" style="font-size: 12px; color: var(--btn-red-bg, #ff4444);"></i>
        删除
      </div>
      <div 
        v-else
        style="padding: 8px 16px; font-size: 13px; color: var(--muted, #999); display: flex; align-items: center; gap: 8px; opacity: 0.5; cursor: not-allowed;"
      >
        <i class="fas fa-trash" style="font-size: 12px; color: var(--muted, #999);"></i>
        删除
      </div>
      </div>
      </Teleport>
      
      <!-- 点击外部关闭线路右键菜单的遮罩 - 使用 Teleport 传送到 body -->
      <Teleport to="body">
      <div 
        v-if="lineContextMenu.visible"
        @click="closeLineContextMenu"
        style="position: fixed; inset: 0; z-index: 9998; background: transparent;"
      ></div>
    </Teleport>
    </div>
  
</template>
<script src="./FolderLineManagerWindow.js"></script>
