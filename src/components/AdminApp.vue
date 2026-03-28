<template>

    <div id="admin-app-vue" style="flex:1; display:flex; flex-direction:column; height:100%; overflow:hidden; padding:20px; gap:20px; background:var(--bg);">
        
        <!-- Header Info Card（Ant Design Card + 毛玻璃 backdrop-filter，与 index 样式一致） -->
        <a-card class="admin-header-card" variant="borderless">
            <div class="admin-header-inner">
                <div ref="routeTextRef" class="admin-route-text" v-html="stationRouteInfo"></div>
                <div class="admin-header-right">
                    <a-tag
                        style="margin:0; padding:6px 16px; font-size:14px; font-weight:700; border:none; line-height:1.4; color:#fff; box-shadow:0 2px 8px rgba(0,0,0,0.15);"
                        :style="{ background: state.rt.state === 0 ? '#27c93f' : '#ff5f56' }"
                    >
                        {{ state.rt.state === 0 ? $t('consoleButtons.arrive') : $t('consoleButtons.depart') }}
                    </a-tag>
                    <div class="admin-mode-group">
                        <span class="admin-mode-label">运营模式</span>
                        <span class="admin-mode-value" :class="{ express: serviceModeLabel === '大站车', direct: serviceModeLabel === '直达' }">
                            {{ serviceModeLabel }}
                        </span>
                    </div>
                </div>
            </div>
        </a-card>

        <!-- Controls -->
        <div style="display:grid; grid-template-columns:repeat(5, minmax(0, 1fr)); gap:12px;">
            <a-button class="admin-home-btn-muted" size="large" block style="height:48px; font-size:14px;" @click="move(-1)">
                <i class="fas fa-chevron-left" style="margin-right:4px;"></i>{{ $t('consoleButtons.prevStation') }}
            </a-button>
            <a-button class="admin-home-btn-org" size="large" block style="height:48px; font-size:14px;" @click="handleSetArr()">
                <i class="fas fa-sign-in-alt" style="margin-right:4px;"></i>{{ $t('consoleButtons.arrive') }}
            </a-button>
            <a-button type="primary" size="large" block style="height:48px; font-size:14px;" @click="handleSetDep()">
                <i class="fas fa-sign-out-alt" style="margin-right:4px;"></i>{{ $t('consoleButtons.depart') }}
            </a-button>
            <a-button class="admin-home-btn-muted" size="large" block style="height:48px; font-size:14px;" @click="move(1)">
                {{ $t('consoleButtons.nextStation') }}<i class="fas fa-chevron-right" style="margin-left:4px;"></i>
            </a-button>
            <a-button danger size="large" block style="height:48px; font-size:14px;" @click="next()">
                <i class="fas fa-step-forward" style="margin-right:4px;"></i>{{ $t('consoleButtons.nextStep') }}
            </a-button>
        </div>

        <!-- Station List Header（与 PIDS 控制台区块标题一致） -->
        <div class="admin-section-header">
            <div class="admin-section-title">{{ $t('lineManager.stationManager') }}</div>
            <div class="admin-section-hint">
                <i class="fas fa-info-circle"></i>
                <span>{{ $t('lineManager.stationManagerHint') }}</span>
            </div>
        </div>

        <!-- Station List（Ant Design Card + 毛玻璃） -->
        <a-card class="admin-station-card" variant="borderless">
            <div data-onboard-id="tour-station-list" class="st-list" ref="listRef" style="flex:1; overflow-y:auto; padding:0;" @dragover="onDragOver($event)" @contextmenu.prevent="showStationContextMenu($event, null, -1)">
                <div v-if="state.appData && state.appData.stations" 
                     v-for="(st, i) in state.appData.stations" 
                     :key="i" 
                     class="item" 
                     :class="{ active: i === state.rt.idx }"
                     :style="{
                        padding: '14px 16px',
                        fontSize: '16px',
                        borderBottom: (i < state.appData.stations.length - 1) ? '1px solid var(--divider)' : 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'default',
                        transition: 'background 0.2s, border-color 0.2s',
                        opacity: i === draggingIndex ? 0.5 : 1,
                        borderTop: (i === dragOverIndex && i < draggingIndex) ? '2px solid var(--accent)' : 'none',
                        borderBottom: (i === dragOverIndex && i > draggingIndex) ? '2px solid var(--accent)' : ((i < state.appData.stations.length - 1) ? '1px solid var(--divider)' : 'none'),
                        background: (i === state.rt.idx) ? 'var(--admin-station-active-bg)' : ((i === dragOverIndex) ? 'var(--admin-station-dragover-bg)' : 'transparent'),
                        borderLeft: (i === state.rt.idx) ? '4px solid var(--btn-blue-bg)' : '4px solid transparent'
                     }"
                     draggable="true"
                     @dragstart="onDragStart($event, i)"
                     @dragenter="onDragEnter($event, i)"
                     @dragleave="onDragLeave"
                     @dragend="onDragEnd"
                     @drop="onDrop($event, i)"
                     @click="jumpTo(i)"
                     @contextmenu.prevent="showStationContextMenu($event, st, i)">
                    <div class="item-txt" style="display:flex; align-items:center; gap:8px;">
                        <div class="drag-handle" style="color:var(--muted); cursor:grab; padding-right:8px;"><i class="fas fa-bars"></i></div>
                        <span class="admin-station-index">[{{i+1}}]</span>
                        <div style="display:flex; flex-direction:column; gap:4px; min-width:0;">
                            <div style="display:flex; flex-wrap:wrap; align-items:center; gap:6px 10px; min-width:0;">
                                    <span class="admin-station-name-row">
                                    <span class="admin-station-name">{{ st.name }}</span>
                                    <span
                                        v-if="stationAudioBrokenByIdx[i]"
                                        :title="$t('stationEditor.audioBroken')"
                                        style="color:#ff4d4f; display:inline-flex; align-items:center; justify-content:center;"
                                    >
                                        <i class="fas fa-exclamation-triangle" style="font-size:14px;"></i>
                                    </span>
                                    <span class="admin-station-name-en">{{ st.en }}</span>
                                </span>
                                <div v-if="st.xfer && st.xfer.length" style="display:flex; flex-wrap:wrap; gap:4px;">
                                    <span v-for="(x, xi) in st.xfer" :key="xi" class="badge admin-station-xfer" :style="{
                                        background: x.suspended ? '#ccc' : x.color,
                                        color: x.suspended ? '#666' : '#fff',
                                        border: x.suspended ? '1px solid #999' : 'none'
                                    }">
                                        {{ x.line }}
                                        <span v-if="x.suspended" style="font-size:8px; background:#999; color:#fff; padding:0 2px; border-radius:2px; margin-left:2px;">{{ $t('stationEditor.statusSuspended') }}</span>
                                        <span v-else-if="x.exitTransfer" style="font-size:8px; background:rgba(0,0,0,0.4); color:#fff; padding:0 2px; border-radius:2px; margin-left:2px; font-weight:bold;">{{ $t('stationEditor.menuExitTransfer') }}</span>
                                    </span>
                                </div>
                                <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
                                    <span v-if="st.dock && st.dock === 'up'" class="badge admin-station-xfer" style="background:#3498db; color:#fff;">{{ $t('stationEditor.dockUp') }}</span>
                                    <span v-if="st.dock && st.dock === 'down'" class="badge admin-station-xfer" style="background:#2ecc71; color:#fff;">{{ $t('stationEditor.dockDown') }}</span>
                                    <span v-if="st.expressStop !== false" class="badge admin-station-xfer" style="background:#ffa502; color:#fff;">{{ $t('stationEditor.expressLabel') }}</span>
                                    <!-- 不显示 '两向' 标签于控制面板 -->
                                </div>
                            </div>
                        </div>
                        <span v-if="st.skip" class="badge" style="background:var(--btn-org-bg); font-size:10px; padding:2px 4px; border-radius:2px;">{{ $t('stationEditor.statusSuspended') }}</span>
                    </div>
                </div>
            </div>
        </a-card>

        <StationEditor 
            :model-value="showEditor"
            @update:modelValue="onEditorModelValueChange"
            :station="editingStation" 
            :is-new="isNewStation"
            :current-line-file-path="state.currentFilePath || ''"
            :current-line-folder-path="currentLineFolderPath"
            :current-station-index="editingIndex"
            :line-meta="state.appData?.meta || {}"
            :line-stations="state.appData?.stations || []"
            :line-common-audio="commonAudioRef"
            @save="saveStation"
            @save-line-audio="saveLineCommonAudio"
            @apply-audio-to-all="applyAudioToAllStations"
            @autosave-station-audio="autoSaveStationAudioDraft"
        />
        
        <!-- 站点右键菜单 - 使用 Teleport 传送到 body，允许溢出窗口 -->
        <Teleport to="body">
            <div 
                v-if="stationContextMenu.visible"
                class="station-context-menu station-context-menu--glass-shell"
                data-station-context-menu
                v-glassmorphism="{ blur: 12, opacity: 0.2, color: '#ffffff' }"
                @click.stop
                @contextmenu.prevent
                :style="{
                    position: 'fixed',
                    left: stationContextMenu.x + 'px',
                    top: stationContextMenu.y + 'px',
                    zIndex: 9999
                }"
            >
                <div class="station-context-menu-item" @click="newStationFromMenu()">
                    <i class="fas fa-plus"></i>
                    {{ $t('lineManager.btnNew') }}
                </div>
                <div v-if="stationContextMenu.index >= 0" class="station-context-menu-divider"></div>
                <div v-if="stationContextMenu.index >= 0" class="station-context-menu-item" @click="editStationFromMenu()">
                    <i class="fas fa-edit"></i>
                    {{ $t('lineManager.btnEdit') }}
                </div>
                <div v-if="stationContextMenu.index >= 0" class="station-context-menu-divider"></div>
                <div v-if="stationContextMenu.index >= 0" class="station-context-menu-item" @click="copyStation()">
                    <i class="fas fa-copy"></i>
                    {{ $t('lineManager.btnCopy') }}
                </div>
                <div v-if="stationContextMenu.index >= 0" class="station-context-menu-item" @click="cutStation()">
                    <i class="fas fa-cut"></i>
                    {{ $t('lineManager.btnCut') }}
                </div>
                <div 
                    class="station-context-menu-item"
                    :class="{ disabled: !clipboard.station }"
                    @click="pasteStation()"
                >
                    <i class="fas fa-paste"></i>
                    {{ $t('lineManager.btnPaste') }}
                </div>
                <div v-if="stationContextMenu.index >= 0" class="station-context-menu-divider"></div>
                <div v-if="stationContextMenu.index >= 0" class="station-context-menu-item danger" @click="deleteStationFromMenu()">
                    <i class="fas fa-trash"></i>
                    {{ $t('lineManager.btnDelete') }}
                </div>
            </div>
        </Teleport>
        
        <!-- 点击外部关闭站点右键菜单的遮罩 - 使用 Teleport 传送到 body -->
        <Teleport to="body">
            <div 
                v-if="stationContextMenu.visible"
                @click="closeStationContextMenu"
                style="position: fixed; inset: 0; z-index: 9998; background: transparent;"
            ></div>
        </Teleport>
    </div>
  
</template>
<script src="./AdminApp.js"></script>
